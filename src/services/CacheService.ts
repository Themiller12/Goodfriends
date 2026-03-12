import AsyncStorage from '@react-native-async-storage/async-storage';
import {Contact, ContactGroup} from '../types';
import {Conversation} from './MessageService';

const CACHE_KEYS = {
  CONTACTS: '@cache_contacts',
  GROUPS: '@cache_groups',
  CONVERSATIONS: '@cache_conversations',
  CONTACTS_TIMESTAMP: '@cache_contacts_timestamp',
  GROUPS_TIMESTAMP: '@cache_groups_timestamp',
  CONVERSATIONS_TIMESTAMP: '@cache_conversations_timestamp',
};

// Durée de validité du cache (en millisecondes)
const CACHE_VALIDITY = 5 * 60 * 1000; // 5 minutes

class CacheService {
  /**
   * Sauvegarder les contacts en cache
   */
  async cacheContacts(contacts: Contact[]): Promise<void> {
    try {
      await AsyncStorage.setItem(CACHE_KEYS.CONTACTS, JSON.stringify(contacts));
      await AsyncStorage.setItem(CACHE_KEYS.CONTACTS_TIMESTAMP, Date.now().toString());
      console.log('[CacheService] Contacts cached successfully:', contacts.length);
    } catch (error) {
      console.error('[CacheService] Error caching contacts:', error);
    }
  }

  /**
   * Récupérer les contacts depuis le cache
   */
  async getCachedContacts(): Promise<Contact[] | null> {
    try {
      const data = await AsyncStorage.getItem(CACHE_KEYS.CONTACTS);
      if (data) {
        const contacts = JSON.parse(data);
        console.log('[CacheService] Retrieved cached contacts:', contacts.length);
        return contacts;
      }
      return null;
    } catch (error) {
      console.error('[CacheService] Error getting cached contacts:', error);
      return null;
    }
  }

  /**
   * Vérifier si le cache des contacts est valide
   */
  async isContactsCacheValid(): Promise<boolean> {
    try {
      const timestamp = await AsyncStorage.getItem(CACHE_KEYS.CONTACTS_TIMESTAMP);
      if (!timestamp) return false;
      
      const age = Date.now() - parseInt(timestamp, 10);
      return age < CACHE_VALIDITY;
    } catch (error) {
      return false;
    }
  }

  /**
   * Sauvegarder les groupes en cache
   */
  async cacheGroups(groups: ContactGroup[]): Promise<void> {
    try {
      await AsyncStorage.setItem(CACHE_KEYS.GROUPS, JSON.stringify(groups));
      await AsyncStorage.setItem(CACHE_KEYS.GROUPS_TIMESTAMP, Date.now().toString());
      console.log('[CacheService] Groups cached successfully:', groups.length);
    } catch (error) {
      console.error('[CacheService] Error caching groups:', error);
    }
  }

  /**
   * Récupérer les groupes depuis le cache
   */
  async getCachedGroups(): Promise<ContactGroup[] | null> {
    try {
      const data = await AsyncStorage.getItem(CACHE_KEYS.GROUPS);
      if (data) {
        const groups = JSON.parse(data);
        console.log('[CacheService] Retrieved cached groups:', groups.length);
        return groups;
      }
      return null;
    } catch (error) {
      console.error('[CacheService] Error getting cached groups:', error);
      return null;
    }
  }

  /**
   * Vérifier si le cache des groupes est valide
   */
  async isGroupsCacheValid(): Promise<boolean> {
    try {
      const timestamp = await AsyncStorage.getItem(CACHE_KEYS.GROUPS_TIMESTAMP);
      if (!timestamp) return false;
      
      const age = Date.now() - parseInt(timestamp, 10);
      return age < CACHE_VALIDITY;
    } catch (error) {
      return false;
    }
  }

  /**
   * Sauvegarder les conversations en cache
   */
  async cacheConversations(conversations: Conversation[]): Promise<void> {
    try {
      await AsyncStorage.setItem(CACHE_KEYS.CONVERSATIONS, JSON.stringify(conversations));
      await AsyncStorage.setItem(CACHE_KEYS.CONVERSATIONS_TIMESTAMP, Date.now().toString());
      console.log('[CacheService] Conversations cached successfully:', conversations.length);
    } catch (error) {
      console.error('[CacheService] Error caching conversations:', error);
    }
  }

  /**
   * Récupérer les conversations depuis le cache
   */
  async getCachedConversations(): Promise<Conversation[] | null> {
    try {
      const data = await AsyncStorage.getItem(CACHE_KEYS.CONVERSATIONS);
      if (data) {
        const conversations = JSON.parse(data);
        console.log('[CacheService] Retrieved cached conversations:', conversations.length);
        return conversations;
      }
      return null;
    } catch (error) {
      console.error('[CacheService] Error getting cached conversations:', error);
      return null;
    }
  }

  /**
   * Vérifier si le cache des conversations est valide
   */
  async isConversationsCacheValid(): Promise<boolean> {
    try {
      const timestamp = await AsyncStorage.getItem(CACHE_KEYS.CONVERSATIONS_TIMESTAMP);
      if (!timestamp) return false;
      
      const age = Date.now() - parseInt(timestamp, 10);
      return age < CACHE_VALIDITY;
    } catch (error) {
      return false;
    }
  }

  /**
   * Invalider un cache spécifique
   */
  async invalidateCache(type: 'contacts' | 'groups' | 'conversations'): Promise<void> {
    try {
      switch (type) {
        case 'contacts':
          await AsyncStorage.removeItem(CACHE_KEYS.CONTACTS_TIMESTAMP);
          break;
        case 'groups':
          await AsyncStorage.removeItem(CACHE_KEYS.GROUPS_TIMESTAMP);
          break;
        case 'conversations':
          await AsyncStorage.removeItem(CACHE_KEYS.CONVERSATIONS_TIMESTAMP);
          break;
      }
      console.log(`[CacheService] ${type} cache invalidated`);
    } catch (error) {
      console.error(`[CacheService] Error invalidating ${type} cache:`, error);
    }
  }

  /**
   * Effacer tout le cache
   */
  async clearAllCache(): Promise<void> {
    try {
      await AsyncStorage.multiRemove([
        CACHE_KEYS.CONTACTS,
        CACHE_KEYS.GROUPS,
        CACHE_KEYS.CONVERSATIONS,
        CACHE_KEYS.CONTACTS_TIMESTAMP,
        CACHE_KEYS.GROUPS_TIMESTAMP,
        CACHE_KEYS.CONVERSATIONS_TIMESTAMP,
      ]);
      console.log('[CacheService] All cache cleared');
    } catch (error) {
      console.error('[CacheService] Error clearing cache:', error);
    }
  }
}

export default new CacheService();
