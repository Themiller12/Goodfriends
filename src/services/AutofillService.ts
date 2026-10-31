import {NativeModules, Platform} from 'react-native';

// Demande à Android (Google Autofill) de proposer l'enregistrement des identifiants saisis.
export const commitCredentials = (): void => {
  if (Platform.OS === 'android') {
    NativeModules.GoodfriendsAutofill?.commit?.();
  }
};
