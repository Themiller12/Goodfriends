/**
 * @format
 */

import 'react-native-get-random-values';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { getMessaging, setBackgroundMessageHandler } from '@react-native-firebase/messaging';
import NotificationService from './src/services/NotificationService';

// En production, ne rien écrire dans les logs de l'appareil (tokens, contenus de messages, contacts)
if (!__DEV__) {
  const noop = () => {};
  console.log = noop;
  console.debug = noop;
  console.info = noop;
}

// Les messages chiffrés de bout en bout arrivent en "data" seul (aucune notification système) :
// on les déchiffre ici et on affiche la notification locale. Les autres sont affichés par Android.
setBackgroundMessageHandler(getMessaging(), async remoteMessage => {
  const data = remoteMessage?.data || {};
  if (data.type === 'message' && data.encrypted === '1') {
    try {
      await NotificationService.showPushMessageNotification(data);
    } catch (error) {
      console.error('[FCM] Erreur notification message chiffré:', error);
    }
  }
});

AppRegistry.registerComponent(appName, () => App);
