import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {useTheme} from '../context/ThemeContext';
import {Neutral, Spacing, Radius, Shadow, Typography, Semantic} from '../theme/designSystem';
import NotificationService from '../services/NotificationService';
import MessageService from '../services/MessageService';
import FriendRequestService from '../services/FriendRequestService';

interface NotificationSettingsScreenProps {
  navigation: any;
}

const NotificationSettingsScreen: React.FC<NotificationSettingsScreenProps> = ({navigation}) => {
  const {theme} = useTheme();
  const [birthdayNotificationsEnabled, setBirthdayNotificationsEnabled] = useState(true);
  const [messageNotificationsEnabled, setMessageNotificationsEnabled] = useState(true);

  useEffect(() => {
    loadNotificationSettings();
  }, []);

  const loadNotificationSettings = async () => {
    const settings = await NotificationService.getSettings();
    setBirthdayNotificationsEnabled(settings.birthdayNotificationsEnabled);
    setMessageNotificationsEnabled(settings.messageNotificationsEnabled);
  };

  const handleToggleBirthdayNotifications = async (value: boolean) => {
    setBirthdayNotificationsEnabled(value);
    try {
      await NotificationService.toggleBirthdayNotifications(value);
      Alert.alert(
        'Succès',
        value
          ? 'Les notifications d\'anniversaire sont activées'
          : 'Les notifications d\'anniversaire sont désactivées'
      );
    } catch (error) {
      console.error('Error toggling notifications:', error);
      Alert.alert('Erreur', 'Impossible de modifier les notifications');
      setBirthdayNotificationsEnabled(!value);
    }
  };

  const handleToggleMessageNotifications = async (value: boolean) => {
    setMessageNotificationsEnabled(value);
    try {
      await NotificationService.toggleMessageNotifications(value);
      Alert.alert(
        'Succès',
        value
          ? 'Les notifications de messages sont activées'
          : 'Les notifications de messages sont désactivées'
      );
    } catch (error) {
      console.error('Error toggling message notifications:', error);
      Alert.alert('Erreur', 'Impossible de modifier les notifications');
      setMessageNotificationsEnabled(!value);
    }
  };

  const handleTestBirthdayNotification = async () => {
    try {
      await NotificationService.sendTestNotification();
    } catch (error) {
      console.error('Error sending test notification:', error);
      Alert.alert('Erreur', 'Impossible d\'envoyer la notification de test');
    }
  };

  const handleTestMessageNotification = async () => {
    try {
      await NotificationService.showMessageNotification(
        'Test Utilisateur',
        'test@example.com',
        'Ceci est un message de test pour vérifier que les notifications fonctionnent correctement !'
      );
      Alert.alert('Succès', 'Notification de message de test envoyée');
    } catch (error) {
      console.error('Error sending test message notification:', error);
      Alert.alert('Erreur', 'Impossible d\'envoyer la notification de test');
    }
  };

  const handleTestFriendRequestNotification = async () => {
    try {
      await NotificationService.showFriendRequestNotification(
        'Jean Dupont',
        'jean.dupont@example.com'
      );
      Alert.alert('Succès', 'Notification de demande d\'ami de test envoyée');
    } catch (error) {
      console.error('Error sending test friend request notification:', error);
      Alert.alert('Erreur', 'Impossible d\'envoyer la notification de test');
    }
  };

  const handleCheckNotifications = async () => {
    try {
      console.log('=== MANUAL CHECK START ===');
      await MessageService.checkNewMessages();
      await FriendRequestService.checkNewFriendRequests();
      console.log('=== MANUAL CHECK END ===');
      Alert.alert('Succès', 'Vérification des notifications effectuée. Si vous avez de nouveaux messages ou demandes d\'ami, une notification devrait apparaître.\n\nConsultez les logs dans la console pour plus de détails.');
    } catch (error) {
      console.error('Error checking notifications:', error);
      Alert.alert('Erreur', `Impossible de vérifier les notifications: ${error}`);
    }
  };

  return (
    <ScrollView style={styles(theme).container}>
      <View style={styles(theme).header}>
        <View style={styles(theme).headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles(theme).backButton}>
            <View style={styles(theme).backBtnCircle}>
              <MaterialIcons name="arrow-back" size={22} color="#383830" />
            </View>
          </TouchableOpacity>
          <View>
            <Text style={styles(theme).headerTitle}>Notifications</Text>
            <Text style={styles(theme).headerSubtitle}>Gérez vos alertes et rappels</Text>
          </View>
        </View>
      </View>

      <View style={styles(theme).section}>
        <Text style={styles(theme).sectionTitle}>Notifications Push</Text>
        
        {/* Notifications d'Anniversaires */}
        <View style={styles(theme).notificationRow}>
          <View style={styles(theme).notificationInfo}>
            <Text style={styles(theme).notificationTitle}>Anniversaires</Text>
            <Text style={styles(theme).notificationDescription}>
              Recevoir des rappels pour les anniversaires (la veille et le jour même)
            </Text>
          </View>
          <Switch
            value={birthdayNotificationsEnabled}
            onValueChange={handleToggleBirthdayNotifications}
            trackColor={{false: '#767577', true: '#81b0ff'}}
            thumbColor={birthdayNotificationsEnabled ? theme.primary : '#f4f3f4'}
          />
        </View>

        {/* Notifications de Messages */}
        <View style={styles(theme).notificationRow}>
          <View style={styles(theme).notificationInfo}>
            <Text style={styles(theme).notificationTitle}>Messages</Text>
            <Text style={styles(theme).notificationDescription}>
              Recevoir des notifications pour les nouveaux messages
            </Text>
          </View>
          <Switch
            value={messageNotificationsEnabled}
            onValueChange={handleToggleMessageNotifications}
            trackColor={{false: '#767577', true: '#81b0ff'}}
            thumbColor={messageNotificationsEnabled ? theme.primary : '#f4f3f4'}
          />
        </View>
      </View>

      <View style={styles(theme).section}>
        <Text style={styles(theme).sectionTitle}>Tests & Dépannage</Text>
        
        <TouchableOpacity
          style={[styles(theme).button, styles(theme).testButton]}
          onPress={handleTestBirthdayNotification}>
          <Text style={styles(theme).buttonText}>🔔 Tester notification anniversaire</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles(theme).button, styles(theme).testMessageButton]}
          onPress={handleTestMessageNotification}>
          <Text style={styles(theme).buttonText}>💬 Tester notification message</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles(theme).button, styles(theme).testFriendButton]}
          onPress={handleTestFriendRequestNotification}>
          <Text style={styles(theme).buttonText}>👋 Tester notification demande d'ami</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles(theme).button, styles(theme).checkButton]}
          onPress={handleCheckNotifications}>
          <Text style={styles(theme).buttonText}>🔍 Vérifier nouvelles notifications</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fcf9f0',
  },
  header: {
    backgroundColor: '#fcf9f0',
    paddingHorizontal: Spacing.xl,
    paddingTop: 48,
    paddingBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    padding: 0,
  },
  backBtnCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    ...Typography.title,
    color: '#383830',
    fontSize: 20,
  },
  headerSubtitle: {
    ...Typography.bodySm,
    color: '#65655c',
    marginTop: 2,
  },
  section: {
    backgroundColor: Neutral[0],
    borderRadius: Radius.lg,
    marginTop: Spacing.lg,
    marginHorizontal: Spacing.base,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  sectionTitle: {
    ...Typography.titleSm,
    color: Neutral[800],
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.base,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Neutral[100],
  },
  notificationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: Spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: Neutral[100],
  },
  notificationInfo: {
    flex: 1,
    marginRight: Spacing.base,
  },
  notificationTitle: {
    ...Typography.titleSm,
    color: Neutral[800],
    marginBottom: 3,
  },
  notificationDescription: {
    ...Typography.bodySm,
    color: Neutral[500],
    lineHeight: 18,
  },
  button: {
    marginHorizontal: Spacing.base,
    borderRadius: Radius.md,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  testButton: {
    backgroundColor: Semantic.warning,
  },
  testMessageButton: {
    backgroundColor: theme.primary,
  },
  testFriendButton: {
    backgroundColor: Semantic.success,
  },
  checkButton: {
    backgroundColor: '#6A1B9A',
    marginBottom: Spacing.base,
  },
  buttonText: {
    ...Typography.titleSm,
    color: '#FFF',
  },
});

export default NotificationSettingsScreen;
