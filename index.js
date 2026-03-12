/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { getMessaging, setBackgroundMessageHandler } from '@react-native-firebase/messaging';

// Obligatoire : handler pour les messages FCM reçus en arrière-plan / app fermée
setBackgroundMessageHandler(getMessaging(), async (remoteMessage) => {
  console.log('[FCM] Message reçu en arrière-plan:', remoteMessage);
});

AppRegistry.registerComponent(appName, () => App);
