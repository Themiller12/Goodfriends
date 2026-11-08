import {
  getMessaging,
  getToken,
  onTokenRefresh,
  onMessage,
  onNotificationOpenedApp,
  getInitialNotification,
  requestPermission,
  AuthorizationStatus,
} from '@react-native-firebase/messaging';
import {Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ApiClient from './ApiClient';
import NotificationService from './NotificationService';
import AppState from './AppState';

class FirebaseService {
  private fcmToken: string | null = null;
  private listenersReady = false;

  /**
   * Initialiser Firebase Messaging et demander les permissions
   */
  async initialize() {
    try {
      const m = getMessaging();

      // Demander la permission pour les notifications
      const authStatus = await requestPermission(m);
      const enabled =
        authStatus === AuthorizationStatus.AUTHORIZED ||
        authStatus === AuthorizationStatus.PROVISIONAL;

      if (!enabled) {
        console.log('[FirebaseService] Permission refusée');
        return false;
      }

      // Obtenir le token FCM
      const token = await getToken(m);
      this.fcmToken = token;
      console.log('[FirebaseService] FCM Token:', token);

      // Toujours comparer avec le token en cache — si différent, re-enregistrer
      // (le token peut avoir été renouvelé pendant que l'app était fermée, ou un autre compte s'être connecté)
      const cachedToken = await AsyncStorage.getItem('fcm_token');
      const cacheValue = await this.buildCacheValue(token);
      if (cacheValue !== cachedToken) {
        console.log('[FirebaseService] Token ou compte changé depuis la dernière session, re-enregistrement...');
        await this.registerToken(token);
      } else {
        console.log('[FirebaseService] Token inchangé');
      }

      // Les listeners ne doivent être posés qu'une fois, même si initialize() est rappelée après une reconnexion
      if (!this.listenersReady) {
        this.listenersReady = true;

        // Écouter les rafraîchissements de token pendant que l'app tourne
        onTokenRefresh(m, async (newToken) => {
          console.log('[FirebaseService] Token refreshed:', newToken);
          this.fcmToken = newToken;
          await this.registerToken(newToken);
        });

        // Configurer les listeners de notifications
        this.setupNotificationListeners();
      }

      return true;
    } catch (error) {
      console.error('[FirebaseService] Initialization error:', error);
      return false;
    }
  }

  // Le cache associe le token au compte connecté : un autre compte sur le même appareil doit ré-enregistrer
  private async buildCacheValue(token: string): Promise<string> {
    const userStr = await AsyncStorage.getItem('@current_user');
    const userId = userStr ? JSON.parse(userStr)?.id : '';
    return `${userId}:${token}`;
  }

  /**
   * Enregistrer le token FCM sur le serveur
   */
  private async registerToken(token: string) {
    try {
      const response = await ApiClient.post('/fcm_tokens.php', {
        token,
        platform: Platform.OS,
      });

      if ((response as any).success) {
        console.log('[FirebaseService] Token enregistré avec succès');
        await AsyncStorage.setItem('fcm_token', await this.buildCacheValue(token));
      }
    } catch (error) {
      console.error('[FirebaseService] Erreur enregistrement token:', error);
    }
  }

  /**
   * Configurer les listeners pour les notifications
   */
  private setupNotificationListeners() {
    const m = getMessaging();

    // Notification reçue quand l'app est au premier plan
    onMessage(m, async (remoteMessage) => {
      console.log('[FirebaseService] Notification reçue (foreground):', remoteMessage);
      const data = (remoteMessage.data || {}) as Record<string, string>;
      const body = remoteMessage.notification?.body ?? null;

      if (data.type === 'message') {
        await NotificationService.markMessageNotified(data.messageId);
        // Ne pas notifier si la conversation est déjà ouverte
        if (!AppState.isChatOpen(data.senderId)) {
          if (data.encrypted === '1') {
            await NotificationService.showPushMessageNotification(data);
          } else {
            await NotificationService.showMessageNotification(
              data.senderName || data.senderEmail || '',
              data.senderEmail || '',
              body,
              data.senderId,
              data.senderFirstName,
              data.senderLastName,
            );
          }
        }
      } else if (data.type === 'friend_request') {
        await NotificationService.showFriendRequestNotification(
          data.senderName || '',
          data.senderEmail || '',
          data.senderId,
        );
      } else if (data.type === 'group_message') {
        // Ne pas notifier si le groupe est déjà ouvert
        if (!AppState.isChatOpen(`group:${data.groupId}`)) {
          await NotificationService.showGenericNotification(
            remoteMessage.notification?.title || data.groupName || 'Nouveau message',
            remoteMessage.notification?.body ?? '',
            data,
          );
        }
      } else if (remoteMessage.notification?.title) {
        // Réactions, ajout à un groupe… : Android n'affiche pas seul les notifications reçues au premier plan
        await NotificationService.showGenericNotification(
          remoteMessage.notification.title,
          remoteMessage.notification.body ?? '',
          data,
        );
      }
    });

    // Notification tapée quand l'app est en arrière-plan ou fermée
    onNotificationOpenedApp(m, (remoteMessage) => {
      console.log('[FirebaseService] Notification opened (background):', remoteMessage);

      if (remoteMessage.data?.type === 'message' && remoteMessage.data?.conversationId) {
        // TODO: Navigation vers la conversation
      }
    });

    // Vérifier si l'app a été ouverte depuis une notification (app complètement fermée)
    getInitialNotification(m).then((remoteMessage) => {
      if (remoteMessage) {
        console.log('[FirebaseService] Notification opened (quit state):', remoteMessage);

        if (remoteMessage.data?.type === 'message' && remoteMessage.data?.conversationId) {
          // TODO: Navigation vers la conversation
        }
      }
    });
  }

  /**
   * Supprimer le token FCM du serveur (lors de la déconnexion)
   */
  async unregisterToken() {
    try {
      await ApiClient.delete(`/fcm_tokens.php?platform=${Platform.OS}`);

      await AsyncStorage.removeItem('fcm_token');
      console.log('[FirebaseService] Token supprimé avec succès');
    } catch (error) {
      console.error('[FirebaseService] Erreur suppression token:', error);
    }
  }

  /**
   * Obtenir le token FCM actuel
   */
  getToken(): string | null {
    return this.fcmToken;
  }
}

export default new FirebaseService();
