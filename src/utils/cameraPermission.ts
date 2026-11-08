import {Alert, Linking, PermissionsAndroid, Platform} from 'react-native';
import type {ImagePickerResponse} from 'react-native-image-picker';

// react-native-image-picker ne demande pas la permission CAMERA sur Android :
// sans demande explicite, launchCamera échoue silencieusement.
export async function ensureCameraPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  const permission = PermissionsAndroid.PERMISSIONS.CAMERA;
  if (await PermissionsAndroid.check(permission)) return true;

  const result = await PermissionsAndroid.request(permission, {
    title: 'Appareil photo',
    message: "Goodfriends a besoin d'accéder à l'appareil photo pour prendre une photo.",
    buttonPositive: 'Autoriser',
    buttonNegative: 'Refuser',
  });
  if (result === PermissionsAndroid.RESULTS.GRANTED) return true;

  if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
    Alert.alert(
      'Appareil photo',
      "L'accès à l'appareil photo est désactivé. Activez-le dans les réglages de l'application.",
      [
        {text: 'Annuler', style: 'cancel'},
        {text: 'Réglages', onPress: () => Linking.openSettings()},
      ],
    );
  } else {
    Alert.alert('Appareil photo', "L'accès à l'appareil photo est nécessaire pour prendre une photo.");
  }
  return false;
}

// Retourne true si le résultat contient une erreur (déjà affichée à l'utilisateur).
export function alertPickerError(result: ImagePickerResponse): boolean {
  if (!result.errorCode) return false;

  if (result.errorCode === 'camera_unavailable') {
    Alert.alert('Appareil photo', "Aucun appareil photo n'est disponible.");
  } else if (result.errorCode === 'permission') {
    Alert.alert('Appareil photo', "L'accès à l'appareil photo ou aux photos est nécessaire.");
  } else {
    Alert.alert('Erreur', result.errorMessage || "Impossible d'ouvrir l'appareil photo.");
  }
  return true;
}
