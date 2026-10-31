/**
 * @format
 */

import 'react-native-get-random-values';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { getMessaging, setBackgroundMessageHandler } from '@react-native-firebase/messaging';

// En production, ne rien écrire dans les logs de l'appareil (tokens, contenus de messages, contacts)
if (!__DEV__) {
  const noop = () => {};
  console.log = noop;
  console.debug = noop;
  console.info = noop;
}

// Obligatoire : handler pour les messages FCM reçus en arrière-plan / app fermée
// Pour les messages avec un champ "notification", Android affiche la notification automatiquement
// via le canal spécifié dans channel_id du payload.
// Ce handler est appelé en supplément pour permettre du traitement JS si nécessaire.
setBackgroundMessageHandler(getMessaging(), async () => {
  // La notification est affichée automatiquement par Android (channel_id dans le payload)
  // Aucune notification locale supplémentaire ici pour éviter les doublons.
});

AppRegistry.registerComponent(appName, () => App);
