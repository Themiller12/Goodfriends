import AsyncStorage from '@react-native-async-storage/async-storage';
import { GroupChat, GroupMember, GroupMessage, GroupMessageReaction } from '../types';
import ApiClient from './ApiClient';
import API_CONFIG from '../config/api';
import E2EEService from './E2EEService';

const ENCRYPTED_UNAVAILABLE = '[Message chiffré indisponible]';

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
          group.messages = this.resolveReplies(await this.decryptMessages(msgRes.data.map(this.mapMessage)));
          group.messagesLoaded = true;
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

    // Contenu (texte + aperçu de la réponse) chiffré pour chaque membre : le serveur ne reçoit jamais le texte en clair
    const encrypted = await E2EEService.buildGroupPayloads(groupId, JSON.stringify({
      t: text.trim(),
      ...(replyToText ? { rt: replyToText } : {}),
      ...(replyToSenderName ? { rs: replyToSenderName } : {}),
    }));

    const res = await ApiClient.post<any>(`${EP}?action=message`, {
      groupId,
      senderName,
      imageBase64,
      imageMime,
      replyToId,
      ...encrypted,
    });
    if (!res.success || !res.data) {
      throw new Error(res.message || "Impossible d'envoyer le message");
    }
    const serverMsg = this.mapMessage(res.data);
    msg = { ...msg, id: serverMsg.id, createdAt: serverMsg.createdAt };

    const cache = await this.readCache();
    const idx = cache.findIndex(g => g.id === groupId);
    if (idx !== -1) {
      cache[idx].messages.push(msg);
      cache[idx].updatedAt = msg.createdAt;
      await this.writeCache(cache);
    }
    return msg;
  }

  /**
   * Envoyer un message vocal ou un fichier dans un groupe. Contrairement à sendMessage, une erreur est propagée
   * (le message n'existe pas côté serveur tant que l'envoi n'a pas réussi).
   */
  async sendAttachment(
    groupId: string,
    kind: 'voice' | 'file',
    dataBase64: string,
    options: {
      fileName?: string;
      durationMs?: number;
      replyToId?: string;
      replyToText?: string;
      replyToSenderName?: string;
    } = {},
  ): Promise<GroupMessage> {
    // Les pièces jointes ne sont pas chiffrées de bout en bout : l'aperçu de la réponse (texte potentiellement
    // déchiffré) n'est donc pas envoyé, il est retrouvé localement à partir de replyToId.
    const res = await ApiClient.post<any>(`${EP}?action=message-attachment`, {
      groupId,
      kind,
      data: dataBase64,
      ...(options.fileName ? { fileName: options.fileName } : {}),
      ...(options.durationMs !== undefined ? { durationMs: options.durationMs } : {}),
      replyToId: options.replyToId,
    }, { timeout: 90000 });
    if (!res.success || !res.data) {
      throw new Error(res.message || "Impossible d'envoyer la pièce jointe");
    }
    const msg = {
      ...this.mapMessage(res.data),
      replyToText: options.replyToText,
      replyToSenderName: options.replyToSenderName,
    };

    const cache = await this.readCache();
    const idx = cache.findIndex(g => g.id === groupId);
    if (idx !== -1) {
      cache[idx].messages.push(msg);
      cache[idx].updatedAt = msg.createdAt;
      await this.writeCache(cache);
    }
    return msg;
  }

  /**
   * Lien signé temporaire (2 min) pour lire ou télécharger une pièce jointe de groupe
   */
  async getAttachmentLink(messageId: string): Promise<string> {
    const res = await ApiClient.get<any>(`${EP}?action=attachment-link&id=${encodeURIComponent(messageId)}`);
    const url = res?.data?.url;
    if (!url) {
      throw new Error('Lien indisponible');
    }
    return url;
  }

  async reactToMessage(groupId: string, messageId: string, userId: string, emoji: string): Promise<GroupMessageReaction[] | null> {
    // Optimistic local cache update
    const cache = await this.readCache();
    const gIdx = cache.findIndex(g => g.id === groupId);
    if (gIdx !== -1) {
      const mIdx = cache[gIdx].messages.findIndex(m => m.id === messageId);
      if (mIdx !== -1) {
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
    }

    // Persist to server and return authoritative reactions
    try {
      const res = await ApiClient.post<any>(`${EP}?action=react`, { messageId, emoji }) as any;
      const serverReactions: GroupMessageReaction[] = res.data?.reactions ?? [];

      // Update cache with server's authoritative list
      const freshCache = await this.readCache();
      const gi = freshCache.findIndex(g => g.id === groupId);
      if (gi !== -1) {
        const mi = freshCache[gi].messages.findIndex(m => m.id === messageId);
        if (mi !== -1) {
          freshCache[gi].messages[mi] = { ...freshCache[gi].messages[mi], reactions: serverReactions };
          await this.writeCache(freshCache);
        }
      }
      return serverReactions;
    } catch {
      return null; // fail silently; optimistic update already applied
    }
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
      attachmentType: raw.attachmentType ?? null,
      attachmentName: raw.attachmentName ?? null,
      attachmentSize: raw.attachmentSize ?? null,
      attachmentDurationMs: raw.attachmentDurationMs ?? null,
      attachmentUrl: raw.attachmentUrl ?? null,
      replyToId: raw.replyToId,
      replyToText: raw.replyToText,
      replyToSenderName: raw.replyToSenderName,
      reactions: raw.reactions ?? [],
      isEncrypted: raw.isEncrypted === true,
      encryptedPayload: raw.isEncrypted === true && raw.ciphertext && raw.nonce && raw.ephemeralPublicKey
        ? { ciphertext: raw.ciphertext, nonce: raw.nonce, ephemeralPublicKey: raw.ephemeralPublicKey }
        : null,
      createdAt: raw.createdAt ?? raw.created_at ?? '',
    };
  }

  private async decryptMessages(messages: GroupMessage[]): Promise<GroupMessage[]> {
    return Promise.all(messages.map(async (message): Promise<GroupMessage> => {
      if (!message.isEncrypted) return message;

      const { encryptedPayload, ...rest } = message;
      const plain = encryptedPayload ? await E2EEService.decryptPayload(encryptedPayload) : null;
      if (plain === null) {
        return { ...rest, text: ENCRYPTED_UNAVAILABLE };
      }
      try {
        const content = JSON.parse(plain);
        return {
          ...rest,
          text: typeof content.t === 'string' ? content.t : '',
          replyToText: typeof content.rt === 'string' ? content.rt : undefined,
          replyToSenderName: typeof content.rs === 'string' ? content.rs : undefined,
        };
      } catch {
        return { ...rest, text: ENCRYPTED_UNAVAILABLE };
      }
    }));
  }

  // Aperçu de réponse absent (pièce jointe, ou message chiffré dont l'aperçu n'est pas conservé) : relu dans la liste
  private resolveReplies(messages: GroupMessage[]): GroupMessage[] {
    const byId = new Map(messages.map(m => [m.id, m]));
    return messages.map(m => {
      if (!m.replyToId || m.replyToText) return m;
      const original = byId.get(m.replyToId);
      if (!original) return m;
      return {
        ...m,
        replyToText: original.text || undefined,
        replyToSenderName: m.replyToSenderName || original.senderName,
      };
    });
  }

  getLastMessage(group: GroupChat): { text: string; time: string } {
    if (group.messages.length === 0) {
      return { text: 'Aucun message', time: group.createdAt };
    }
    const last = group.messages[group.messages.length - 1];
    const text = last.attachmentType === 'voice'
      ? '🎤 Message vocal'
      : last.attachmentType === 'file'
        ? `📎 ${last.attachmentName ?? 'Fichier'}`
        : last.imageBase64 && !last.text ? '📷 Photo' : (last.text || '📷 Photo');
    return { text, time: last.createdAt };
  }

  getMembersLabel(group: GroupChat): string {
    return group.members.map(m => m.firstName).join(', ');
  }
}

export default new GroupChatService();

