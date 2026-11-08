import ApiClient from './ApiClient';
import NotificationService from './NotificationService';
import AppState from './AppState';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CacheService from './CacheService';
import E2EEService from './E2EEService';

// Doit rester aligné avec api/messages.php
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const ALLOWED_FILE_EXTENSIONS = [
  'pdf', 'txt', 'csv', 'rtf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'odt', 'ods', 'odp', 'zip', 'mp3', 'm4a', 'wav', 'mp4',
];

export interface MessageReaction {
  emoji: string;
  userId: string;
}

export interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  message: string | null;
  photoUrl?: string | null;
  attachmentType?: 'voice' | 'file' | null;
  attachmentName?: string | null;
  attachmentMime?: string | null;
  attachmentSize?: number | null;
  attachmentDurationMs?: number | null;
  attachmentUrl?: string | null;
  pending?: boolean; // en attente d'envoi (hors ligne)
  isRead: boolean;
  createdAt: string;
  senderEmail?: string;
  receiverEmail?: string;
  reactions?: MessageReaction[];
  replyToId?: string | null;
  replyToMessage?: string | null;
  replyToSenderId?: string | null;
  isEncrypted?: boolean;
  encryptionVersion?: string | null;
  senderCiphertext?: string | null;
  senderNonce?: string | null;
  senderEphemeralPublicKey?: string | null;
  receiverCiphertext?: string | null;
  receiverNonce?: string | null;
  receiverEphemeralPublicKey?: string | null;
}

export interface Conversation {
  otherUserId: string;
  otherUserEmail: string;
  otherUserFirstName: string | null;
  otherUserLastName: string | null;
  otherUserPhone: string | null;
  lastMessage: string;
  lastMessageEncrypted?: { ciphertext: string; nonce: string; ephemeralPublicKey: string } | null;
  lastMessageHasPhoto?: boolean;
  lastMessageTime: string;
  unreadCount: number;
  isMutual: boolean;
}

class MessageService {
  private lastCheckedMessageId: string | null = null;

  private async getCurrentUserId(): Promise<string> {
    const userStr = await AsyncStorage.getItem('@current_user');
    if (!userStr) {
      throw new Error('Utilisateur non connecté');
    }
    const user = JSON.parse(userStr);
    if (!user?.id) {
      throw new Error('Session utilisateur invalide');
    }
    return user.id;
  }

  private async decryptMessages(messages: Message[]): Promise<Message[]> {
    const currentUserId = await this.getCurrentUserId();

    return Promise.all(messages.map(async message => {
      if (!message.isEncrypted) {
        return message;
      }

      const decrypted = await E2EEService.decryptMessage({
        currentUserId,
        senderId: message.senderId,
        receiverId: message.receiverId,
        senderCiphertext: message.senderCiphertext,
        senderNonce: message.senderNonce,
        senderEphemeralPublicKey: message.senderEphemeralPublicKey,
        receiverCiphertext: message.receiverCiphertext,
        receiverNonce: message.receiverNonce,
        receiverEphemeralPublicKey: message.receiverEphemeralPublicKey,
      });

      return {
        ...message,
        message: decrypted ?? '[Message chiffré indisponible]'
      };
    }));
  }

  // Aperçu du dernier message : le serveur ne peut pas lire un message chiffré, on le déchiffre ici
  private async decryptConversations(conversations: Conversation[]): Promise<Conversation[]> {
    return Promise.all(conversations.map(async conv => {
      if (!conv.lastMessageEncrypted) return conv;

      const {lastMessageEncrypted, ...rest} = conv;
      const plain = await E2EEService.decryptPayload(lastMessageEncrypted);
      if (plain === null) {
        return rest;
      }
      const text = plain.trim();
      const lastMessage = rest.lastMessageHasPhoto ? (text ? `📷 ${text}` : '📷 Photo') : text;
      return {...rest, lastMessage};
    }));
  }

  /**
   * Envoyer un message à un utilisateur
   */
  async sendMessage(receiverId: string, message: string, replyToId?: string): Promise<Message> {
    try {
      const encrypted = await E2EEService.buildEncryptedPayloadForUsers(message, receiverId);

      const response = await ApiClient.post('/messages.php?action=send', {
        receiverId,
        ...encrypted,
        ...(replyToId ? {replyToId} : {}),
      }) as any;
      
      // Invalider le cache des conversations pour forcer un rechargement
      await CacheService.invalidateCache('conversations');
      
      const [decryptedMessage] = await this.decryptMessages([response.data]);
      return decryptedMessage;
    } catch (error) {
      console.error('Erreur lors de l\'envoi du message:', error);
      throw error;
    }
  }

  /**
   * Envoyer une photo dans un message (base64, compressée côté client)
   */
  async sendPhoto(receiverId: string, photoBase64: string, mimeType: string, caption?: string, replyToId?: string): Promise<Message> {
    try {
      const encryptedCaption = caption
        ? await E2EEService.buildEncryptedPayloadForUsers(caption, receiverId)
        : null;

      const response = await ApiClient.post('/messages.php?action=send-photo', {
        receiverId,
        photoData: photoBase64,
        mimeType,
        ...(encryptedCaption ? encryptedCaption : {caption: null}),
        ...(replyToId ? {replyToId} : {}),
      }) as any;

      await CacheService.invalidateCache('conversations');
      const [decryptedMessage] = await this.decryptMessages([response.data]);
      return decryptedMessage;
    } catch (error) {
      console.error('Erreur lors de l\'envoi de la photo:', error);
      throw error;
    }
  }

  /**
   * Envoyer un message vocal ou un fichier (base64). Chiffré côté serveur au repos, pas en E2EE.
   */
  async sendAttachment(
    receiverId: string,
    kind: 'voice' | 'file',
    dataBase64: string,
    options: { fileName?: string; durationMs?: number; replyToId?: string } = {},
  ): Promise<Message> {
    try {
      const response = await ApiClient.post('/messages.php?action=send-attachment', {
        receiverId,
        kind,
        data: dataBase64,
        ...(options.fileName ? {fileName: options.fileName} : {}),
        ...(options.durationMs !== undefined ? {durationMs: options.durationMs} : {}),
        ...(options.replyToId ? {replyToId: options.replyToId} : {}),
      }, {timeout: 90000}) as any;

      await CacheService.invalidateCache('conversations');
      return response.data as Message;
    } catch (error) {
      console.error('Erreur lors de l\'envoi de la pièce jointe:', error);
      throw error;
    }
  }

  /**
   * Lien signé temporaire (2 min) pour lire ou télécharger une pièce jointe
   */
  async getAttachmentLink(messageId: string): Promise<string> {
    const res = await ApiClient.get<any>(`/messages.php?action=attachment-link&id=${encodeURIComponent(messageId)}`);
    const url = res?.data?.url;
    if (!url) {
      throw new Error('Lien indisponible');
    }
    return url;
  }

  /**
   * Vérifier si deux utilisateurs sont toujours amis mutuels
   */
  async checkFriendship(otherUserId: string): Promise<boolean> {
    try {
      const response = await ApiClient.get(`/messages.php?action=check-friendship&otherUserId=${otherUserId}`) as any;
      return response.data?.isMutual ?? true;
    } catch {
      return true; // fail-open: allow sending if check fails
    }
  }

  /**
   * Récupérer l'historique des messages avec un utilisateur
   */
  async getConversation(otherUserId: string, before?: string): Promise<Message[]> {
    try {
      const url = before
        ? `/messages.php?action=conversation&otherUserId=${otherUserId}&before=${encodeURIComponent(before)}`
        : `/messages.php?action=conversation&otherUserId=${otherUserId}`;
      const response = await ApiClient.get(url) as any;
      return await this.decryptMessages(response.data);
    } catch (error) {
      console.error('Erreur lors de la récupération de la conversation:', error);
      throw error;
    }
  }

  /**
   * Vérifier les nouveaux messages et afficher des notifications groupées
   */
  async checkNewMessages(): Promise<void> {
    try {
      const userStr = await AsyncStorage.getItem('@current_user');
      if (!userStr) return;
      const currentUser = JSON.parse(userStr);
      const currentUserId = currentUser.id;
      if (!currentUserId) return;

      const conversations = await this.getConversations();

      const notifiedStr = await AsyncStorage.getItem('@notified_messages');
      const notified: string[] = notifiedStr ? JSON.parse(notifiedStr) : [];

      for (const conv of conversations) {
        if (conv.unreadCount <= 0) continue;
        if (AppState.isChatOpen(conv.otherUserId)) continue;

        try {
          const msgs = await this.getConversation(conv.otherUserId);
          const newUnread = msgs.filter(
            m => !m.isRead && m.receiverId === currentUserId && !notified.includes(m.id),
          );
          if (!newUnread.length) continue;

          const senderName = (conv.otherUserFirstName && conv.otherUserLastName)
            ? `${conv.otherUserFirstName} ${conv.otherUserLastName}`
            : conv.otherUserEmail;

          // Single grouped notification per conversation
          await NotificationService.showGroupedMessageNotification(
            senderName,
            conv.otherUserEmail,
            newUnread.length,
            conv.otherUserId,
            conv.otherUserFirstName ?? undefined,
            conv.otherUserLastName ?? undefined,
          );

          newUnread.forEach(m => notified.push(m.id));
        } catch {}
      }

      await AsyncStorage.setItem('@notified_messages', JSON.stringify(notified.slice(-200)));
    } catch (error: any) {
      if (error?.response?.status !== 401) {
        console.error('[MessageService] checkNewMessages error:', error);
      }
    }
  }

  /**
   * Marquer tous les messages d'un utilisateur comme lus
   */
  async markAsRead(otherUserId: string): Promise<void> {
    try {
      await ApiClient.put('/messages.php?action=mark-read', {
        otherUserId,
      });
      
      // Invalider le cache des conversations pour forcer un rechargement
      await CacheService.invalidateCache('conversations');
    } catch (error) {
      console.error('Erreur lors du marquage des messages comme lus:', error);
      throw error;
    }
  }

  /**
   * Récupérer la liste des conversations
   */
  async getConversations(): Promise<Conversation[]> {
    try {
      // Essayer de récupérer depuis le cache d'abord
      const cachedConversations = await CacheService.getCachedConversations();
      const isCacheValid = await CacheService.isConversationsCacheValid();
      
      // Si le cache est valide, le retourner
      if (cachedConversations && isCacheValid) {
        console.log('[MessageService] Using cached conversations');
        // Lancer une mise à jour en arrière-plan
        this.updateConversationsCache().catch(err => 
          console.error('[MessageService] Background update failed:', err)
        );
        return cachedConversations;
      }
      
      // Sinon, récupérer depuis l'API
      const response = await ApiClient.get('/messages.php?action=conversations') as any;
      const conversations = await this.decryptConversations(response.data);
      
      // Mettre à jour le cache
      await CacheService.cacheConversations(conversations);
      
      return conversations;
    } catch (error) {
      console.error('Erreur lors de la récupération des conversations:', error);
      
      // En cas d'erreur, essayer de retourner le cache
      const cachedConversations = await CacheService.getCachedConversations();
      if (cachedConversations) {
        console.log('[MessageService] Error, using cached conversations as fallback');
        return cachedConversations;
      }
      
      throw error;
    }
  }

  /**
   * Mettre à jour le cache des conversations en arrière-plan
   */
  private async updateConversationsCache(): Promise<void> {
    try {
      const response = await ApiClient.get('/messages.php?action=conversations') as any;
      await CacheService.cacheConversations(await this.decryptConversations(response.data));
      console.log('[MessageService] Background cache update completed');
    } catch (error) {
      console.error('[MessageService] Background cache update failed:', error);
    }
  }

  /**
   * Ajouter / basculer une réaction à un message
   */
  async reactToMessage(messageId: string, emoji: string): Promise<void> {
    try {
      await ApiClient.post('/messages.php?action=react', {messageId, emoji});
    } catch (error) {
      console.error('Erreur lors de la réaction au message:', error);
      throw error;
    }
  }

  /**
   * Récupérer le nombre total de messages non lus
   */
  async getUnreadCount(): Promise<number> {
    try {
      console.log('[MessageService] Getting unread count...');
      const response = await ApiClient.get('/messages.php?action=unread-count') as any;
      console.log('[MessageService] Unread count response:', response);
      const count = response.data?.count || 0;
      console.log(`[MessageService] Unread count result: ${count}`);
      return count;
    } catch (error) {
      console.error('[MessageService] Erreur lors de la récupération du nombre de messages non lus:', error);
      throw error;
    }
  }
}

export default new MessageService();
