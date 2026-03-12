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
import {useTheme} from '../context/ThemeContext';
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
            <Text style={styles(theme).backButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={styles(theme).headerTitle}>Notifications</Text>
        </View>
        <Text style={styles(theme).headerSubtitle}>
          Gérez vos alertes et rappels
        </Text>
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
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: theme.primary,
    padding: 20,
    paddingTop: 40,
    paddingBottom: 30,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  backButton: {
    marginRight: 15,
    padding: 5,
  },
  backButtonText: {
    fontSize: 28,
    color: '#fff',
    fontWeight: 'bold',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#E3F2FD',
  },
  section: {
    backgroundColor: '#fff',
    marginTop: 15,
    marginHorizontal: 15,
    borderRadius: 10,
    padding: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  notificationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  notificationInfo: {
    flex: 1,
    marginRight: 15,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 5,
  },
  notificationDescription: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  button: {
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  testButton: {
    backgroundColor: '#FF9800',
  },
  testMessageButton: {
    backgroundColor: '#2196F3',
  },
  testFriendButton: {
    backgroundColor: '#4CAF50',
  },
  checkButton: {
    backgroundColor: '#9C27B0',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default NotificationSettingsScreen;
