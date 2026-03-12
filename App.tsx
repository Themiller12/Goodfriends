/**
 * Goodfriends App
 * @format
 */

import React, {useEffect, useRef} from 'react';
import {StatusBar, AppState, AppStateStatus} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {NavigationContainerRef} from '@react-navigation/native';
import PushNotification from 'react-native-push-notification';
import messaging, {
  getMessaging,
  onNotificationOpenedApp,
  getInitialNotification,
} from '@react-native-firebase/messaging';
import AppNavigator from './src/navigation/AppNavigator';
import NotificationService from './src/services/NotificationService';
import MessageService from './src/services/MessageService';
import FriendRequestService from './src/services/FriendRequestService';
import AuthService from './src/services/AuthService';
import FirebaseService from './src/services/FirebaseService';
import {ThemeProvider} from './src/context/ThemeContext';

function App(): React.JSX.Element {
  const navigationRef = useRef<NavigationContainerRef<any>>(null);
  // Stocke la notification cold-start en attendant que le navigator soit prêt
  const pendingNavRef = useRef<{type: string; data: Record<string, string>} | null>(null);

  const navigateFromNotification = (type: string, data: Record<string, string>) => {
    const nav = navigationRef.current;
    if (!nav?.isReady()) return;
    if (type === 'message' && data.senderId) {
      nav.navigate('Chat', {
        otherUserId: data.senderId,
        otherUserEmail: data.senderEmail || '',
        otherUserFirstName: data.senderFirstName || data.senderName || '',
        otherUserLastName: data.senderLastName || '',
      });
    } else if (type === 'friend_request') {
      nav.navigate('MyFriends');
    }
  };

  const handleNavigatorReady = () => {
    if (pendingNavRef.current) {
      const {type, data} = pendingNavRef.current;
      pendingNavRef.current = null;
      navigateFromNotification(type, data);
    }
  };

  useEffect(() => {
    // Configurer le gestionnaire de notifications locales (react-native-push-notification)
    PushNotification.configure({
      onNotification: function (notification: any) {
        console.log('NOTIFICATION CLICKED:', notification);

        // Sur Android, les données peuvent être dans userInfo ou data selon la version
        const info = notification.userInfo ?? notification.data ?? {};
        const {type, senderId, senderEmail, senderName, senderFirstName, senderLastName} = info;
        if (type) {
          setTimeout(() => navigateFromNotification(type, {senderId, senderEmail, senderName, senderFirstName, senderLastName}), 500);
        }

        // Nécessaire pour iOS
        notification.finish('UIBackgroundFetchResultNoData');
      },
      permissions: {
        alert: true,
        badge: true,
        sound: true,
      },
      popInitialNotification: true,
      requestPermissions: false,
    });

    // Listener Firebase : tap sur notification depuis l'arrière-plan
    const unsubscribeFCM = onNotificationOpenedApp(getMessaging(), (remoteMessage) => {
      console.log('[FCM] Notification ouverte (background):', remoteMessage);
      const data = (remoteMessage.data || {}) as Record<string, string>;
      if (data.type) {
        setTimeout(() => navigateFromNotification(data.type, data), 500);
      }
    });

    // Listener Firebase : app complètement fermée, ouverte via notification
    getInitialNotification(getMessaging()).then((remoteMessage) => {
      if (!remoteMessage?.data?.type) return;
      console.log('[FCM] Notification ouverte (cold start):', remoteMessage);
      // Stocker en attente : le navigator n'est pas encore prêt au moment où cette promesse résout
      pendingNavRef.current = {
        type: remoteMessage.data.type,
        data: remoteMessage.data as Record<string, string>,
      };
    });
    // Initialiser les notifications au démarrage de l'app
    const initNotifications = async () => {
      try {
        // Demander les permissions
        await NotificationService.requestPermissions();
        
        // Vérifier si l'utilisateur est connecté avant de vérifier les notifications
        const isLoggedIn = await AuthService.isLoggedIn();
        
        if (isLoggedIn) {
          // Initialiser Firebase Cloud Messaging
          await FirebaseService.initialize();
          
          // Planifier les notifications d'anniversaire
          await NotificationService.scheduleAllBirthdayNotifications();
          
          // Vérifier les nouveaux messages et demandes d'ami
          await MessageService.checkNewMessages();
          await FriendRequestService.checkNewFriendRequests();
        }
      } catch (error) {
        console.error('Error initializing notifications:', error);
      }
    };

    initNotifications();

    // Vérifier les notifications lorsque l'application revient en premier plan
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        // Vérifier si l'utilisateur est connecté avant de vérifier les notifications
        const isLoggedIn = await AuthService.isLoggedIn();
        if (isLoggedIn) {
          MessageService.checkNewMessages();
          FriendRequestService.checkNewFriendRequests();
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
      unsubscribeFCM();
    };
  }, []);

  return (
    <ThemeProvider>
      <GestureHandlerRootView style={{flex: 1}}>
        <SafeAreaProvider>
          <StatusBar barStyle="light-content" backgroundColor="#2196F3" />
          <AppNavigator ref={navigationRef} onReady={handleNavigatorReady} />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ThemeProvider>
  );
}

export default App;
