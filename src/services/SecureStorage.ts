import * as Keychain from 'react-native-keychain';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Secrets (jeton de session, clé privée E2EE) stockés dans le Keystore Android / Keychain iOS.
// Les installations existantes sont migrées depuis AsyncStorage au premier accès.
const SERVICE_PREFIX = 'goodfriends.';

const SecureStorage = {
  async getItem(key: string, legacyAsyncStorageKey?: string): Promise<string | null> {
    const service = SERVICE_PREFIX + key;
    const stored = await Keychain.getGenericPassword({service});
    if (stored) {
      return stored.password;
    }

    if (legacyAsyncStorageKey) {
      const legacy = await AsyncStorage.getItem(legacyAsyncStorageKey);
      if (legacy) {
        await this.setItem(key, legacy);
        await AsyncStorage.removeItem(legacyAsyncStorageKey);
        return legacy;
      }
    }
    return null;
  },

  async setItem(key: string, value: string): Promise<void> {
    await Keychain.setGenericPassword(key, value, {service: SERVICE_PREFIX + key});
  },

  async removeItem(key: string, legacyAsyncStorageKey?: string): Promise<void> {
    await Keychain.resetGenericPassword({service: SERVICE_PREFIX + key});
    if (legacyAsyncStorageKey) {
      await AsyncStorage.removeItem(legacyAsyncStorageKey);
    }
  },
};

export default SecureStorage;
