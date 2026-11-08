import AsyncStorage from '@react-native-async-storage/async-storage';
import {Platform, PermissionsAndroid, Alert, Linking, NativeModules} from 'react-native';
import PushNotification, {Importance} from 'react-native-push-notification';
import StorageService from './StorageService';
import E2EEService from './E2EEService';
import ApiClient from './ApiClient';
import {Contact, Child} from '../types';

const NOTIFICATION_SETTINGS_KEY = '@notification_settings';
const MESSAGE_SETTING_PENDING_KEY = '@notification_message_setting_pending';
const MESSAGE_PREVIEWS_KEY = '@push_message_previews';
const NOTIFIED_MESSAGES_KEY = '@notified_messages';

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

  // Permission d'afficher des notifications (sans l'alarme exacte, réservée aux rappels d'anniversaire)
  async requestPostNotificationsPermission(): Promise<boolean> {
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch (err) {
        console.warn(err);
        return false;
      }
    }
    return true;
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
  // Le serveur applique aussi ce réglage : il n'envoie plus de push (messages, réactions, groupes)
  async toggleMessageNotifications(enabled: boolean): Promise<void> {
    const settings = await this.getSettings();
    settings.messageNotificationsEnabled = enabled;
    await this.saveSettings(settings);
    await this.pushMessageSettingToServer(enabled);
  }

  private async pushMessageSettingToServer(enabled: boolean): Promise<boolean> {
    try {
      await ApiClient.put('/notification_settings.php', {messageNotificationsEnabled: enabled});
      await AsyncStorage.removeItem(MESSAGE_SETTING_PENDING_KEY);
      return true;
    } catch {
      // Hors ligne : on réessaiera à la prochaine synchronisation
      await AsyncStorage.setItem(MESSAGE_SETTING_PENDING_KEY, '1');
      return false;
    }
  }

  // Aligne le réglage local et le serveur (à appeler quand un utilisateur est connecté)
  async syncMessageSettingWithServer(): Promise<void> {
    try {
      const settings = await this.getSettings();
      if (await AsyncStorage.getItem(MESSAGE_SETTING_PENDING_KEY)) {
        await this.pushMessageSettingToServer(settings.messageNotificationsEnabled);
        return;
      }
      const response = await ApiClient.get('/notification_settings.php') as any;
      const remote = response?.data?.messageNotificationsEnabled;
      if (typeof remote === 'boolean' && remote !== settings.messageNotificationsEnabled) {
        settings.messageNotificationsEnabled = remote;
        await this.saveSettings(settings);
      }
    } catch {}
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

    const hasPermission = await this.requestPostNotificationsPermission();
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
      ...(senderId ? {id: String(this.toNumericId(`msg_${senderId}`))} : {}),
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

  // Notification d'un message reçu par FCM. Les messages chiffrés de bout en bout arrivent sans texte :
  // on les déchiffre ici pour afficher le contenu réel. Utilisable en arrière-plan (sans activité).
  async showPushMessageNotification(data: Record<string, string>): Promise<void> {
    const senderId = data.senderId;
    if (!senderId) return;

    const settings = await this.getSettings();
    if (!settings.messageNotificationsEnabled) return;

    if (Platform.OS === 'android' && Platform.Version >= 33) {
      const allowed = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      if (!allowed) return;
    }

    let text = 'Nouveau message';
    if (data.encrypted === '1') {
      try {
        const userStr = await AsyncStorage.getItem('@current_user');
        const currentUserId = userStr ? JSON.parse(userStr)?.id : null;
        // Notification destinée à un autre compte (ancien utilisateur de l'appareil) : l'ignorer
        if (!currentUserId || (data.recipientId && data.recipientId !== currentUserId)) return;
        const decrypted = await E2EEService.decryptMessage({
          currentUserId,
          senderId,
          receiverId: currentUserId,
          receiverCiphertext: data.ciphertext,
          receiverNonce: data.nonce,
          receiverEphemeralPublicKey: data.ephemeralPublicKey,
        });
        if (decrypted) text = decrypted;
      } catch {}
      if (data.hasPhoto === '1') {
        text = text === 'Nouveau message' ? '📷 Photo' : `📷 ${text}`;
      }
    }
    text = text.length > 100 ? `${text.substring(0, 97)}...` : text;

    // Cumuler les aperçus par expéditeur tant que la conversation n'a pas été ouverte
    const raw = await AsyncStorage.getItem(MESSAGE_PREVIEWS_KEY);
    const all: Record<string, {ids: string[]; previews: string[]; count: number}> = raw ? JSON.parse(raw) : {};
    const entry = all[senderId] ?? {ids: [], previews: [], count: 0};
    if (data.messageId && entry.ids.includes(data.messageId)) return;
    if (data.messageId) entry.ids = [...entry.ids, data.messageId].slice(-50);
    entry.count += 1;
    entry.previews = [...entry.previews, text].slice(-3);
    all[senderId] = entry;
    await AsyncStorage.setItem(MESSAGE_PREVIEWS_KEY, JSON.stringify(all));

    if (data.messageId) {
      await this.markMessageNotified(data.messageId);
    }

    const senderName = data.senderName || data.senderEmail || '';
    PushNotification.localNotification({
      channelId: 'messages-channel',
      id: String(this.toNumericId(`msg_${senderId}`)),
      title: entry.count > 1 ? `💬 ${senderName} (${entry.count} nouveaux messages)` : `💬 ${senderName}`,
      message: entry.previews[entry.previews.length - 1],
      bigText: entry.previews.join('\n'),
      playSound: true,
      soundName: 'default',
      importance: 'high',
      vibrate: true,
      vibration: 300,
      priority: 'high',
      userInfo: {
        type: 'message',
        senderId,
        senderEmail: data.senderEmail || '',
        senderName,
        senderFirstName: data.senderFirstName || '',
        senderLastName: data.senderLastName || '',
      },
    });
  }

  // Retirer la notification d'une conversation (ouverte ou lue) et réinitialiser son cumul d'aperçus
  async clearMessageNotifications(senderId: string, conversationId?: string): Promise<void> {
    PushNotification.cancelLocalNotification(String(this.toNumericId(`msg_${senderId}`)));
    if (Platform.OS === 'android' && conversationId) {
      // Notification affichée par FCM : tag msg_<conversation>, id 0
      NativeModules.RNPushNotification?.clearLocalNotification?.(`msg_${conversationId}`, 0);
    }
    try {
      const raw = await AsyncStorage.getItem(MESSAGE_PREVIEWS_KEY);
      if (!raw) return;
      const all = JSON.parse(raw);
      if (all[senderId]) {
        delete all[senderId];
        await AsyncStorage.setItem(MESSAGE_PREVIEWS_KEY, JSON.stringify(all));
      }
    } catch {}
  }

  // Envoyer une notification groupée pour plusieurs messages du même expéditeur
  async showGroupedMessageNotification(
    senderName: string,
    senderEmail: string,
    count: number,
    senderId?: string,
    senderFirstName?: string,
    senderLastName?: string,
  ): Promise<void> {
    const settings = await this.getSettings();
    if (!settings.messageNotificationsEnabled) return;
    const hasPermission = await this.requestPostNotificationsPermission();
    if (!hasPermission) return;

    const title = `💬 ${senderName || senderEmail}`;
    const message = count === 1
      ? `${count} nouveau message`
      : `${count} nouveaux messages`;

    PushNotification.localNotification({
      channelId: 'messages-channel',
      ...(senderId ? {id: String(this.toNumericId(`msg_${senderId}`))} : {}),
      title,
      message,
      playSound: true,
      soundName: 'default',
      importance: 'high',
      vibrate: true,
      vibration: 300,
      priority: 'high',
      userInfo: {
        type: 'message',
        senderId, senderEmail, senderName,
        senderFirstName: senderFirstName || '',
        senderLastName: senderLastName || '',
      },
    });
  }

  // Envoyer une notification pour une réaction à un message
  async showReactionNotification(
    reactorName: string,
    emoji: string,
    messagePreview: string | null,
  ): Promise<void> {
    const settings = await this.getSettings();
    if (!settings.messageNotificationsEnabled) return;
    const hasPermission = await this.requestPostNotificationsPermission();
    if (!hasPermission) return;

    const REACTION_LABELS: Record<string, string> = {
      love: '❤️',
      like: '👍',
      dislike: '👎',
      wow: '😮',
      angry: '😠',
    };
    const emojiLabel = REACTION_LABELS[emoji] ?? emoji;
    const preview = messagePreview ? `"${messagePreview.slice(0, 50)}"` : 'votre message';

    PushNotification.localNotification({
      channelId: 'messages-channel',
      title: '💬 Réaction',
      message: `${reactorName} a réagi ${emojiLabel} à ${preview}`,
      playSound: true,
      soundName: 'default',
      importance: 'default',
      vibrate: true,
      vibration: 200,
      priority: 'default',
      userInfo: { type: 'reaction' },
    });
  }

  // Notification locale générique (ex. réaction, ajout à un groupe reçus pendant que l'app est ouverte)
  async showGenericNotification(title: string, body: string, data: Record<string, string> = {}): Promise<void> {
    const settings = await this.getSettings();
    if (!settings.messageNotificationsEnabled) return;
    if (!(await this.requestPostNotificationsPermission())) return;

    PushNotification.localNotification({
      channelId: 'messages-channel',
      // Un seul bloc de notification par groupe : le dernier message remplace le précédent
      ...(data.type === 'group_message' && data.groupId
        ? {id: String(this.toNumericId(`group_${data.groupId}`))}
        : {}),
      title,
      message: body,
      playSound: true,
      soundName: 'default',
      importance: 'high',
      vibrate: true,
      vibration: 200,
      priority: 'high',
      userInfo: data,
    });
  }

  // Retirer la notification d'un groupe (conversation ouverte)
  clearGroupNotifications(groupId: string) {
    PushNotification.cancelLocalNotification(String(this.toNumericId(`group_${groupId}`)));
    if (Platform.OS === 'android') {
      // Notification affichée par FCM : tag group_<id>, id 0
      NativeModules.RNPushNotification?.clearLocalNotification?.(`group_${groupId}`, 0);
    }
  }

  // Mémoriser un message déjà notifié pour que la vérification périodique ne le renotifie pas
  async markMessageNotified(messageId?: string): Promise<void> {
    if (!messageId) return;
    try {
      const raw = await AsyncStorage.getItem(NOTIFIED_MESSAGES_KEY);
      const notified: string[] = raw ? JSON.parse(raw) : [];
      if (!notified.includes(messageId)) {
        notified.push(messageId);
        await AsyncStorage.setItem(NOTIFIED_MESSAGES_KEY, JSON.stringify(notified.slice(-200)));
      }
    } catch {}
  }

  // Envoyer une notification pour une nouvelle demande d'ami
  async showFriendRequestNotification(
    senderName: string,
    senderEmail: string,
    senderId?: string
  ): Promise<void> {
    const hasPermission = await this.requestPostNotificationsPermission();
    if (!hasPermission) {
      return;
    }

    PushNotification.localNotification({
      channelId: 'friend-requests-channel',
      // Même id par expéditeur : push FCM au premier plan + vérification périodique ne s'empilent pas
      ...(senderId ? {id: String(this.toNumericId(`fr_${senderId}`))} : {}),
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
