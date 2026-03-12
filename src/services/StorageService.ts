import AsyncStorage from '@react-native-async-storage/async-storage';
import {UserAccount, UserProfile, Contact, ContactGroup} from '../types';
import StorageServiceAPI from './StorageServiceAPI';
import CacheService from './CacheService';

const KEYS = {
  USER_ACCOUNT: '@user_account',
  CONTACTS: '@contacts',
  GROUPS: '@groups',
};

class StorageService {
  // Utilisateur (reste en local pour compatibilité)
  async saveUserAccount(account: UserAccount): Promise<void> {
    try {
      await AsyncStorage.setItem(KEYS.USER_ACCOUNT, JSON.stringify(account));
    } catch (error) {
      console.error('Error saving user account:', error);
      throw error;
    }
  }

  async getUserAccount(): Promise<UserAccount | null> {
    try {
      const data = await AsyncStorage.getItem(KEYS.USER_ACCOUNT);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error getting user account:', error);
      return null;
    }
  }

  async updateUserProfile(profile: UserProfile): Promise<void> {
    try {
      const account = await this.getUserAccount();
      if (account) {
        account.profile = profile;
        await this.saveUserAccount(account);
      }
    } catch (error) {
      console.error('Error updating user profile:', error);
      throw error;
    }
  }

  async deleteUserAccount(): Promise<void> {
    try {
      await AsyncStorage.removeItem(KEYS.USER_ACCOUNT);
    } catch (error) {
      console.error('Error deleting user account:', error);
      throw error;
    }
  }

  // Contacts - Déléguer à l'API
  async saveContacts(contacts: Contact[]): Promise<void> {
    // Non utilisé avec l'API
    console.warn('saveContacts is deprecated with API');
  }

  async getContacts(): Promise<Contact[]> {
    return await StorageServiceAPI.getContacts();
  }

  async addContact(contact: Contact): Promise<void> {
    return await StorageServiceAPI.addContact(contact);
  }

  async updateContact(updatedContact: Contact): Promise<void> {
    return await StorageServiceAPI.updateContact(updatedContact);
  }

  async deleteContact(contactId: string): Promise<void> {
    return await StorageServiceAPI.deleteContact(contactId);
  }

  async searchContacts(query: string): Promise<Contact[]> {
    try {
      const contacts = await this.getContacts();
      const lowerQuery = query.toLowerCase();
      return contacts.filter(
        contact =>
          contact.firstName.toLowerCase().includes(lowerQuery) ||
          contact.lastName.toLowerCase().includes(lowerQuery),
      );
    } catch (error) {
      console.error('Error searching contacts:', error);
      return [];
    }
  }

  // Groupes - Déléguer à l'API
  async saveGroups(groups: ContactGroup[]): Promise<void> {
    // Non utilisé avec l'API
    console.warn('saveGroups is deprecated with API');
  }

  async getGroups(): Promise<ContactGroup[]> {
    return await StorageServiceAPI.getGroups();
  }

  async addGroup(group: ContactGroup): Promise<void> {
    return await StorageServiceAPI.addGroup(group);
  }

  async updateGroup(updatedGroup: ContactGroup): Promise<void> {
    return await StorageServiceAPI.updateGroup(updatedGroup);
  }

  async deleteGroup(groupId: string): Promise<void> {
    return await StorageServiceAPI.deleteGroup(groupId);
  }

  // Effacer toutes les données
  async clearAll(): Promise<void> {
    try {
      await AsyncStorage.multiRemove([
        KEYS.USER_ACCOUNT,
        KEYS.CONTACTS,
        KEYS.GROUPS,
      ]);
      // Effacer également tout le cache
      await CacheService.clearAllCache();
    } catch (error) {
      console.error('Error clearing all data:', error);
      throw error;
    }
  }

  // Effacer uniquement la session utilisateur (déconnexion)
  async clearSession(): Promise<void> {
    try {
      await AsyncStorage.removeItem(KEYS.USER_ACCOUNT);
      // Effacer également le cache lors de la déconnexion
      await CacheService.clearAllCache();
    } catch (error) {
      console.error('Error clearing session:', error);
      throw error;
    }
  }
}

export default new StorageService();
