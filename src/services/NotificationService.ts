import AsyncStorage from '@react-native-async-storage/async-storage';
import {Platform, PermissionsAndroid, Alert, Linking} from 'react-native';
import PushNotification, {Importance} from 'react-native-push-notification';
import StorageService from './StorageService';
import {Contact, Child} from '../types';

const NOTIFICATION_SETTINGS_KEY = '@notification_settings';

interface NotificationSettings {
  birthdayNotificationsEnabled: boolean;
  messageNotificationsEnabled: boolean;
}

class NotificationService {
  constructor() {
    this.configure();
  }

  // Configuration initiale de PushNotification
  private configure() {
    PushNotification.configure({
      onRegister: function (token: any) {
        console.log('TOKEN:', token);
      },
      onNotification: function (notification: any) {
        console.log('NOTIFICATION:', notification);
        // La navigation sera gérée dans App.tsx via un listener
      },
      onAction: function (notification: any) {
        console.log('NOTIFICATION ACTION:', notification);
      },
      permissions: {
        alert: true,
        badge: true,
        sound: true,
      },
      popInitialNotification: true,
      requestPermissions: Platform.OS === 'ios',
    });

    // Créer les channels pour Android
    if (Platform.OS === 'android') {
      PushNotification.createChannel(
        {
          channelId: 'birthday-channel',
          channelName: 'Anniversaires',
          channelDescription: 'Notifications pour les anniversaires',
          playSound: true,
          soundName: 'default',
          importance: Importance.HIGH,
          vibrate: true,
        },
        (created) => console.log(`Birthday channel created: ${created}`)
      );

      PushNotification.createChannel(
        {
          channelId: 'messages-channel',
          channelName: 'Messages',
          channelDescription: 'Notifications pour les nouveaux messages',
          playSound: true,
          soundName: 'default',
          importance: Importance.HIGH,
          vibrate: true,
        },
        (created) => console.log(`Messages channel created: ${created}`)
      );

      PushNotification.createChannel(
        {
          channelId: 'friend-requests-channel',
          channelName: 'Demandes d\'ami',
          channelDescription: 'Notifications pour les demandes d\'ami',
          playSound: true,
          soundName: 'default',
          importance: Importance.HIGH,
          vibrate: true,
        },
        (created) => console.log(`Friend requests channel created: ${created}`)
      );
    }
  }

  // Demander les permissions de notifications
  async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'android') {
      // POST_NOTIFICATIONS requis sur Android 13+
      if (Platform.Version >= 33) {
        try {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
          );
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            return false;
          }
        } catch (err) {
          console.warn(err);
          return false;
        }
      }

      // SCHEDULE_EXACT_ALARM requis sur Android 12+ (API 31+)
      // USE_EXACT_ALARM (API 33+) est accordé automatiquement via le manifest
      if (Platform.Version >= 31 && Platform.Version < 33) {
        try {
          const granted = await PermissionsAndroid.request(
            'android.permission.SCHEDULE_EXACT_ALARM' as any
          );
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            Alert.alert(
              'Permission requise',
              'Pour recevoir les rappels d\'anniversaire, autorisez les alarmes exactes dans les paramètres de l\'application.',
              [
                {text: 'Annuler', style: 'cancel'},
                {text: 'Paramètres', onPress: () => Linking.openSettings()},
              ]
            );
            return false;
          }
        } catch (err) {
          console.warn('[NotificationService] SCHEDULE_EXACT_ALARM error:', err);
        }
      }

      return true;
    }
    return true;
  }

  // Récupérer les paramètres de notification
  async getSettings(): Promise<NotificationSettings> {
    try {
      const settings = await AsyncStorage.getItem(NOTIFICATION_SETTINGS_KEY);
      return settings ? JSON.parse(settings) : {
        birthdayNotificationsEnabled: true,
        messageNotificationsEnabled: true
      };
    } catch (error) {
      console.error('Error getting notification settings:', error);
      return {
        birthdayNotificationsEnabled: true,
        messageNotificationsEnabled: true
      };
    }
  }

  // Sauvegarder les paramètres de notification
  async saveSettings(settings: NotificationSettings): Promise<void> {
    try {
      await AsyncStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Error saving notification settings:', error);
      throw error;
    }
  }

  // Activer/désactiver les notifications d'anniversaire
  async toggleBirthdayNotifications(enabled: boolean): Promise<void> {
    const settings = await this.getSettings();
    settings.birthdayNotificationsEnabled = enabled;
    await this.saveSettings(settings);

    if (enabled) {
      await this.scheduleAllBirthdayNotifications();
    } else {
      this.cancelAllBirthdayNotifications();
    }
  }

  // Convertir un ID string en entier numérique stable (Android l'exige)
  private toNumericId(id: string): number {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = (Math.imul(31, hash) + id.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }

  // Calculer la date de la prochaine notification (veille ou jour même)
  private getNextBirthdayDate(birthDate: Date, daysBefore: number): Date {
    const today = new Date();
    const currentYear = today.getFullYear();

    // Date d'anniversaire cette année (à 9h)
    const notifyDate = new Date(
      currentYear,
      birthDate.getMonth(),
      birthDate.getDate() - daysBefore,
      9, 0, 0
    );

    // Si la date est déjà passée, programmer pour l'année prochaine
    if (notifyDate <= today) {
      notifyDate.setFullYear(currentYear + 1);
    }

    return notifyDate;
  }

  // Planifier une notification d'anniversaire
  private scheduleBirthdayNotification(
    id: string,
    name: string,
    birthDate: Date,
    daysBefore: number
  ) {
    const notificationDate = this.getNextBirthdayDate(birthDate, daysBefore);

    // Calculer l'âge exact au prochain anniversaire
    const actualBirthdayYear = notificationDate.getFullYear();
    const age = actualBirthdayYear - birthDate.getFullYear();

    let title: string;
    let message: string;

    if (daysBefore === 0) {
      title = `🎂 Anniversaire de ${name} !`;
      message = `${name} fête ses ${age} ans aujourd'hui ! 🎉`;
    } else {
      title = `🎉 Anniversaire de ${name} demain !`;
      message = `${name} aura ${age} ans demain ! 🎂`;
    }

    const notificationIdStr = `${id}_${daysBefore}`;
    const numericId = this.toNumericId(notificationIdStr);

    PushNotification.localNotificationSchedule({
      channelId: 'birthday-channel',
      id: String(numericId),
      title,
      message,
      date: notificationDate,
      allowWhileIdle: true,
      repeatType: 'year',
      playSound: true,
      soundName: 'default',
      vibrate: true,
      vibration: 300,
    });

    console.log(`Scheduled notification for ${name} on ${notificationDate.toLocaleString()} (id=${numericId})`);
  }

  // Planifier les notifications pour un contact
  async scheduleBirthdayNotificationsForContact(contact: Contact): Promise<void> {
    const settings = await this.getSettings();
    if (!settings.birthdayNotificationsEnabled) {
      return;
    }

    // Notification pour le contact
    if (contact.dateOfBirth) {
      const birthDate = new Date(contact.dateOfBirth);
      const fullName = `${contact.firstName} ${contact.lastName}`;
      
      // Notification la veille
      this.scheduleBirthdayNotification(
        `contact_${contact.id}`,
        fullName,
        birthDate,
        1
      );
      
      // Notification le jour même
      this.scheduleBirthdayNotification(
        `contact_${contact.id}`,
        fullName,
        birthDate,
        0
      );
    }

    // Notifications pour les enfants
    if (contact.children && contact.children.length > 0) {
      contact.children.forEach((child: Child) => {
        if (child.dateOfBirth) {
          const birthDate = new Date(child.dateOfBirth);
          const childName = `${child.firstName} (enfant de ${contact.firstName})`;
          
          // Notification la veille
          this.scheduleBirthdayNotification(
            `child_${child.id}`,
            childName,
            birthDate,
            1
          );
          
          // Notification le jour même
          this.scheduleBirthdayNotification(
            `child_${child.id}`,
            childName,
            birthDate,
            0
          );
        }
      });
    }
  }

  // Planifier toutes les notifications d'anniversaire
  async scheduleAllBirthdayNotifications(): Promise<void> {
    const settings = await this.getSettings();
    if (!settings.birthdayNotificationsEnabled) {
      return;
    }

    // Annuler toutes les notifications existantes
    this.cancelAllBirthdayNotifications();

    // Récupérer tous les contacts
    const contacts = await StorageService.getContacts();

    // Planifier les notifications pour chaque contact
    contacts.forEach((contact) => {
      this.scheduleBirthdayNotificationsForContact(contact);
    });

    console.log(`Scheduled notifications for ${contacts.length} contacts`);
  }

  // Annuler toutes les notifications d'anniversaire
  cancelAllBirthdayNotifications() {
    PushNotification.cancelAllLocalNotifications();
    console.log('All birthday notifications cancelled');
  }

  // Annuler les notifications pour un contact spécifique
  cancelBirthdayNotificationsForContact(contactId: string) {
    PushNotification.cancelLocalNotification(String(this.toNumericId(`contact_${contactId}_1`)));
    PushNotification.cancelLocalNotification(String(this.toNumericId(`contact_${contactId}_0`)));
  }

  // Annuler les notifications pour un enfant spécifique
  cancelBirthdayNotificationsForChild(childId: string) {
    PushNotification.cancelLocalNotification(String(this.toNumericId(`child_${childId}_1`)));
    PushNotification.cancelLocalNotification(String(this.toNumericId(`child_${childId}_0`)));
  }

  // Envoyer une notification de test
  async sendTestNotification(): Promise<void> {
    const hasPermission = await this.requestPermissions();
    
    if (!hasPermission) {
      Alert.alert(
        'Permission requise',
        'Veuillez autoriser les notifications dans les paramètres de l\'application'
      );
      return;
    }

    PushNotification.localNotification({
      channelId: 'birthday-channel',
      title: '🎉 Notification de test',
      message: 'Les notifications fonctionnent correctement ! Vous recevrez des rappels pour les anniversaires.',
      playSound: true,
      soundName: 'default',
      importance: 'high',
      vibrate: true,
      vibration: 300,
      priority: 'high',
    });

    Alert.alert(
      'Succès',
      'Notification de test envoyée ! Si vous ne l\'avez pas reçue, vérifiez les paramètres de notification de votre appareil.'
    );
  }

  // Activer/désactiver les notifications de messages
  async toggleMessageNotifications(enabled: boolean): Promise<void> {
    const settings = await this.getSettings();
    settings.messageNotificationsEnabled = enabled;
    await this.saveSettings(settings);
  }

  // Envoyer une notification pour un nouveau message
  async showMessageNotification(
    senderName: string,
    senderEmail: string,
    message: string | null,
    senderId?: string,
    senderFirstName?: string,
    senderLastName?: string,
  ): Promise<void> {
    console.log(`[NotificationService] showMessageNotification called for ${senderName}`);
    
    const settings = await this.getSettings();
    console.log(`[NotificationService] Message notifications enabled: ${settings.messageNotificationsEnabled}`);
    
    if (!settings.messageNotificationsEnabled) {
      console.log('[NotificationService] Message notifications are disabled, skipping');
      return;
    }

    const hasPermission = await this.requestPermissions();
    console.log(`[NotificationService] Has notification permission: ${hasPermission}`);
    
    if (!hasPermission) {
      console.log('[NotificationService] No permission, skipping notification');
      return;
    }

    // Fallback pour les messages photo (message null)
    const messageText = message || '📷 Photo';
    // Limiter la longueur du message
    const truncatedMessage = messageText.length > 100 
      ? messageText.substring(0, 97) + '...' 
      : messageText;

    console.log(`[NotificationService] Sending notification: ${truncatedMessage.substring(0, 30)}...`);
    
    PushNotification.localNotification({
      channelId: 'messages-channel',
      title: `💬 ${senderName || senderEmail}`,
      message: truncatedMessage,
      playSound: true,
      soundName: 'default',
      importance: 'high',
      vibrate: true,
      vibration: 300,
      priority: 'high',
      userInfo: {
        type: 'message',
        senderId: senderId,
        senderEmail: senderEmail,
        senderName: senderName,
        senderFirstName: senderFirstName || '',
        senderLastName: senderLastName || '',
      },
    });
    
    console.log('[NotificationService] Notification sent successfully');
  }

  // Envoyer une notification pour une nouvelle demande d'ami
  async showFriendRequestNotification(
    senderName: string,
    senderEmail: string,
    senderId?: string
  ): Promise<void> {
    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      return;
    }

    PushNotification.localNotification({
      channelId: 'friend-requests-channel',
      title: '👋 Nouvelle demande d\'ami',
      message: `${senderName} (${senderEmail}) souhaite vous ajouter en ami`,
      playSound: true,
      soundName: 'default',
      importance: 'high',
      vibrate: true,
      vibration: 300,
      priority: 'high',
      userInfo: {
        type: 'friend_request',
        senderId: senderId,
        senderEmail: senderEmail,
      },
    });
  }

  // Obtenir toutes les notifications programmées (pour debug)
  getScheduledNotifications(callback: (notifications: any[]) => void) {
    PushNotification.getScheduledLocalNotifications(callback);
  }
}

export default new NotificationService();
