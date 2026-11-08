import AsyncStorage from '@react-native-async-storage/async-storage';
import FirebaseService from './FirebaseService';
import NotificationService from './NotificationService';

// À appeler dès qu'un utilisateur est connecté (démarrage, connexion, inscription)
export async function startNotificationsForUser(): Promise<void> {
  try {
    await FirebaseService.initialize();
    await NotificationService.syncMessageSettingWithServer();
    await NotificationService.scheduleAllBirthdayNotifications();
  } catch (error) {
    console.error('[PushSetup] Erreur initialisation des notifications:', error);
  }
}

// À appeler avant la déconnexion (le jeton d'authentification est encore nécessaire)
export async function stopNotificationsForUser(): Promise<void> {
  try {
    await FirebaseService.unregisterToken();
  } catch {}
  NotificationService.cancelAllBirthdayNotifications();
  await AsyncStorage.removeItem('@push_message_previews').catch(() => {});
}
