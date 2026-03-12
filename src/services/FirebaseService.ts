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

class FirebaseService {
  private fcmToken: string | null = null;

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

      // Enregistrer le token sur le serveur
      await this.registerToken(token);

      // Écouter les rafraîchissements de token
      onTokenRefresh(m, async (newToken) => {
        console.log('[FirebaseService] Token refreshed:', newToken);
        this.fcmToken = newToken;
        await this.registerToken(newToken);
      });

      // Configurer les listeners de notifications
      this.setupNotificationListeners();

      return true;
    } catch (error) {
      console.error('[FirebaseService] Initialization error:', error);
      return false;
    }
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
        await AsyncStorage.setItem('fcm_token', token);
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
      await ApiClient.delete('/fcm_tokens.php', {
        platform: Platform.OS,
      } as any);

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
