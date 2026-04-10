import AsyncStorage from '@react-native-async-storage/async-storage';
import { GroupChat, GroupMember, GroupMessage } from '../types';
import ApiClient from './ApiClient';
import API_CONFIG from '../config/api';

const CACHE_KEY = '@group_chats_cache';
const LEGACY_KEY = '@group_chats'; // ancienne clÃ© purement locale
const EP = API_CONFIG.ENDPOINTS.GROUP_CHATS;

class GroupChatService {

  // â”€â”€ cache local â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private async readCache(): Promise<GroupChat[]> {
    try {
      // Lire le cache synchronisÃ© avec l'API
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (raw) return JSON.parse(raw);
      // Migration depuis l'ancienne clÃ© locale
      const legacy = await AsyncStorage.getItem(LEGACY_KEY);
      if (legacy) {
        const groups: GroupChat[] = JSON.parse(legacy);
        await AsyncStorage.setItem(CACHE_KEY, legacy);
        return groups;
      }
      return [];
    } catch {
      return [];
    }
  }

  private async writeCache(groups: GroupChat[]): Promise<void> {
    try {
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(groups));
    } catch { /* ignore */ }
  }

  // â”€â”€ lecture â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async getAll(): Promise<GroupChat[]> {
    try {
      const res = await ApiClient.get<any>(EP);
      if (res.success && Array.isArray(res.data)) {
        const groups: GroupChat[] = res.data.map(this.mapGroup);
        // Préserver les messages déjà en cache (l'endpoint /groups ne les retourne pas)
        const existing = await this.readCache();
        for (const g of groups) {
          const cached = existing.find(c => c.id === g.id);
          if (cached?.messages?.length) {
            g.messages = cached.messages;
          }
        }
        await this.writeCache(groups);
        return groups;
      }
      return await this.readCache();
    } catch {
      // API indisponible ou non déployée — fallback local
      return await this.readCache();
    }
  }

  async getById(id: string): Promise<GroupChat | null> {
    try {
      const all = await this.getAll();
      const group = all.find(g => g.id === id) ?? null;
      if (!group) return null;

      // Essayer de charger les messages via API
      try {
        const msgRes = await ApiClient.get<any>(`${EP}?action=messages&id=${id}`);
        if (msgRes.success && Array.isArray(msgRes.data)) {
          group.messages = msgRes.data.map(this.mapMessage);
          const cache = await this.readCache();
          const idx = cache.findIndex(g => g.id === id);
          if (idx !== -1) {
            cache[idx].messages = group.messages;
            await this.writeCache(cache);
          }
        }
      } catch { /* garder les messages du cache */ }

      return group;
    } catch {
      const cache = await this.readCache();
      return cache.find(g => g.id === id) ?? null;
    }
  }

  // â”€â”€ Ã©criture â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async create(name: string, members: GroupMember[]): Promise<GroupChat> {
    try {
      const res = await ApiClient.post<any>(EP, { name, members });
      if (res.success && res.data) {
        const group: GroupChat = this.mapGroup(res.data);
        const cache = await this.readCache();
        await this.writeCache([group, ...cache]);
        return group;
      }
    } catch { /* API non disponible */ }

    // Fallback : crÃ©ation locale uniquement
    const now = new Date().toISOString();
    const group: GroupChat = {
      id: `gc-${Date.now()}`,
      name,
      members,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    const cache = await this.readCache();
    await this.writeCache([group, ...cache]);
    return group;
  }

  async update(id: string, patch: Partial<Pick<GroupChat, 'name' | 'members'>>): Promise<void> {
    try {
      await ApiClient.put<any>(EP, { id, ...patch });
    } catch { /* API non disponible */ }
    const cache = await this.readCache();
    const idx = cache.findIndex(g => g.id === id);
    if (idx !== -1) {
      cache[idx] = { ...cache[idx], ...patch, updatedAt: new Date().toISOString() };
      await this.writeCache(cache);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await ApiClient.delete<any>(`${EP}?id=${id}`);
    } catch { /* API non disponible */ }
    const cache = await this.readCache();
    await this.writeCache(cache.filter(g => g.id !== id));
  }

  // â”€â”€ messages â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async sendMessage(
    groupId: string,
    text: string,
    senderId: string,
    senderName: string,
    imageBase64?: string,
    imageMime?: string,
    replyToId?: string,
    replyToText?: string,
    replyToSenderName?: string,
  ): Promise<GroupMessage> {
    const now = new Date().toISOString();
    let msg: GroupMessage = {
      id: `m-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      senderId,
      senderName,
      text: text.trim(),
      imageBase64,
      imageMime,
      replyToId,
      replyToText,
      replyToSenderName,
      reactions: [],
      createdAt: now,
    };

    try {
      const res = await ApiClient.post<any>(`${EP}?action=message`, {
        groupId,
        text,
        senderName,
        imageBase64,
        imageMime,
        replyToId,
        replyToText,
        replyToSenderName,
      });
      if (res.success && res.data) {
        const serverMsg = this.mapMessage(res.data);
        msg = { ...msg, id: serverMsg.id, createdAt: serverMsg.createdAt };
      }
    } catch { /* API non disponible – message local */ }

    const cache = await this.readCache();
    const idx = cache.findIndex(g => g.id === groupId);
    if (idx !== -1) {
      cache[idx].messages.push(msg);
      cache[idx].updatedAt = msg.createdAt;
      await this.writeCache(cache);
    }
    return msg;
  }

  async reactToMessage(groupId: string, messageId: string, userId: string, emoji: string): Promise<void> {
    const cache = await this.readCache();
    const gIdx = cache.findIndex(g => g.id === groupId);
    if (gIdx === -1) return;
    const mIdx = cache[gIdx].messages.findIndex(m => m.id === messageId);
    if (mIdx === -1) return;
    const msg = cache[gIdx].messages[mIdx];
    const reactions = [...(msg.reactions ?? [])];
    const existing = reactions.findIndex(r => r.userId === userId && r.emoji === emoji);
    if (existing !== -1) {
      reactions.splice(existing, 1);
      cache[gIdx].messages[mIdx] = { ...msg, reactions };
    } else {
      const filtered = reactions.filter(r => r.userId !== userId);
      filtered.push({ userId, emoji });
      cache[gIdx].messages[mIdx] = { ...msg, reactions: filtered };
    }
    await this.writeCache(cache);
  }

  async deleteMessage(groupId: string, messageId: string): Promise<void> {
    try {
      await ApiClient.delete<any>(`${EP}?action=message&id=${messageId}`);
    } catch { /* API non disponible */ }
    const cache = await this.readCache();
    const idx = cache.findIndex(g => g.id === groupId);
    if (idx !== -1) {
      cache[idx].messages = cache[idx].messages.filter(m => m.id !== messageId);
      cache[idx].updatedAt = new Date().toISOString();
      await this.writeCache(cache);
    }
  }

  // â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private mapGroup(raw: any): GroupChat {
    return {
      id: raw.id,
      name: raw.name,
      members: (raw.members ?? []).map((m: any): GroupMember => ({
        userId: m.userId ?? '',
        contactId: m.contactId ?? '',
        firstName: m.firstName ?? '',
        lastName: m.lastName ?? '',
        photo: m.photo,
      })),
      messages: (raw.messages ?? []).map((msg: any) => this.mapMessage(msg)),
      createdAt: raw.createdAt ?? raw.created_at ?? '',
      updatedAt: raw.updatedAt ?? raw.updated_at ?? '',
    };
  }

  private mapMessage(raw: any): GroupMessage {
    return {
      id: raw.id,
      senderId: raw.senderId ?? raw.sender_id ?? '',
      senderName: raw.senderName ?? raw.sender_name ?? '',
      text: raw.text ?? raw.message ?? '',
      imageBase64: raw.imageBase64,
      imageMime: raw.imageMime,
      replyToId: raw.replyToId,
      replyToText: raw.replyToText,
      replyToSenderName: raw.replyToSenderName,
      reactions: raw.reactions ?? [],
      createdAt: raw.createdAt ?? raw.created_at ?? '',
    };
  }

  getLastMessage(group: GroupChat): { text: string; time: string } {
    if (group.messages.length === 0) {
      return { text: 'Aucun message', time: group.createdAt };
    }
    const last = group.messages[group.messages.length - 1];
    const text = last.imageBase64 && !last.text ? '📷 Photo' : (last.text || '📷 Photo');
    return { text, time: last.createdAt };
  }

  getMembersLabel(group: GroupChat): string {
    return group.members.map(m => m.firstName).join(', ');
  }
}

export default new GroupChatService();

