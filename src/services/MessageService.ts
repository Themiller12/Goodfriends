import ApiClient from './ApiClient';
import NotificationService from './NotificationService';
import AppState from './AppState';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CacheService from './CacheService';

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
  isRead: boolean;
  createdAt: string;
  senderEmail?: string;
  receiverEmail?: string;
  reactions?: MessageReaction[];
  replyToId?: string | null;
  replyToMessage?: string | null;
  replyToSenderId?: string | null;
}

export interface Conversation {
  otherUserId: string;
  otherUserEmail: string;
  otherUserFirstName: string | null;
  otherUserLastName: string | null;
  otherUserPhone: string | null;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
}

class MessageService {
  private lastCheckedMessageId: string | null = null;

  /**
   * Envoyer un message à un utilisateur
   */
  async sendMessage(receiverId: string, message: string, replyToId?: string): Promise<Message> {
    try {
      const response = await ApiClient.post('/messages.php?action=send', {
        receiverId,
        message,
        ...(replyToId ? {replyToId} : {}),
      }) as any;
      
      // Invalider le cache des conversations pour forcer un rechargement
      await CacheService.invalidateCache('conversations');
      
      return response.data;
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
      const response = await ApiClient.post('/messages.php?action=send-photo', {
        receiverId,
        photoData: photoBase64,
        mimeType,
        caption: caption || null,
        ...(replyToId ? {replyToId} : {}),
      }) as any;

      await CacheService.invalidateCache('conversations');
      return response.data;
    } catch (error) {
      console.error('Erreur lors de l\'envoi de la photo:', error);
      throw error;
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
      return response.data;
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
      const conversations = response.data;
      
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
      await CacheService.cacheConversations(response.data);
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
