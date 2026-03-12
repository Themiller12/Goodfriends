import ApiClient from './ApiClient';
import API_CONFIG from '../config/api';
import {Contact, ContactGroup} from '../types';
import CacheService from './CacheService';

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
}

class StorageServiceAPI {
  // CONTACTS
  
  async getContacts(): Promise<Contact[]> {
    try {
      // Essayer de récupérer depuis le cache d'abord
      const cachedContacts = await CacheService.getCachedContacts();
      const isCacheValid = await CacheService.isContactsCacheValid();
      
      // Si le cache est valide, le retourner
      if (cachedContacts && isCacheValid) {
        console.log('[StorageServiceAPI] Using cached contacts');
        // Lancer une mise à jour en arrière-plan
        this.updateContactsCache().catch(err => 
          console.error('[StorageServiceAPI] Background update failed:', err)
        );
        return cachedContacts;
      }
      
      // Sinon, récupérer depuis l'API
      const response = await ApiClient.get<ApiResponse<Contact[]>>(
        API_CONFIG.ENDPOINTS.CONTACTS
      );
      
      if (response.success && response.data) {
        // S'assurer que tous les contacts ont bien la propriété groupIds
        const contacts = response.data.map(contact => ({
          ...contact,
          groupIds: contact.groupIds || []
        }));
        
        // Mettre à jour le cache
        await CacheService.cacheContacts(contacts);
        
        return contacts;
      }
      
      // Si l'API échoue mais qu'on a un cache (même expiré), l'utiliser
      if (cachedContacts) {
        console.log('[StorageServiceAPI] API failed, using expired cache');
        return cachedContacts;
      }
      
      return [];
    } catch (error) {
      console.error('Error getting contacts:', error);
      
      // En cas d'erreur, essayer de retourner le cache
      const cachedContacts = await CacheService.getCachedContacts();
      if (cachedContacts) {
        console.log('[StorageServiceAPI] Error, using cached contacts as fallback');
        return cachedContacts;
      }
      
      return [];
    }
  }

  /**
   * Mettre à jour le cache en arrière-plan
   */
  private async updateContactsCache(): Promise<void> {
    try {
      const response = await ApiClient.get<ApiResponse<Contact[]>>(
        API_CONFIG.ENDPOINTS.CONTACTS
      );
      
      if (response.success && response.data) {
        const contacts = response.data.map(contact => ({
          ...contact,
          groupIds: contact.groupIds || []
        }));
        await CacheService.cacheContacts(contacts);
        console.log('[StorageServiceAPI] Background cache update completed');
      }
    } catch (error) {
      console.error('[StorageServiceAPI] Background cache update failed:', error);
    }
  }

  async addContact(contact: Contact): Promise<void> {
    try {
      await ApiClient.post<ApiResponse<{id: string}>>(
        API_CONFIG.ENDPOINTS.CONTACTS,
        contact
      );
      // Invalider le cache pour forcer un rechargement
      await CacheService.invalidateCache('contacts');
    } catch (error) {
      console.error('Error adding contact:', error);
      throw error;
    }
  }

  async updateContact(contact: Contact): Promise<void> {
    try {
      await ApiClient.put<ApiResponse<any>>(
        API_CONFIG.ENDPOINTS.CONTACTS,
        contact
      );
      // Invalider le cache pour forcer un rechargement
      await CacheService.invalidateCache('contacts');
    } catch (error) {
      console.error('Error updating contact:', error);
      throw error;
    }
  }

  async deleteContact(contactId: string): Promise<void> {
    try {
      await ApiClient.delete<ApiResponse<any>>(
        `${API_CONFIG.ENDPOINTS.CONTACTS}?id=${contactId}`
      );
      // Invalider le cache pour forcer un rechargement
      await CacheService.invalidateCache('contacts');
    } catch (error) {
      console.error('Error deleting contact:', error);
      throw error;
    }
  }

  // GROUPS
  
  async getGroups(): Promise<ContactGroup[]> {
    try {
      // Essayer de récupérer depuis le cache d'abord
      const cachedGroups = await CacheService.getCachedGroups();
      const isCacheValid = await CacheService.isGroupsCacheValid();
      
      // Si le cache est valide, le retourner
      if (cachedGroups && isCacheValid) {
        console.log('[StorageServiceAPI] Using cached groups');
        // Lancer une mise à jour en arrière-plan
        this.updateGroupsCache().catch(err => 
          console.error('[StorageServiceAPI] Background groups update failed:', err)
        );
        return cachedGroups;
      }
      
      // Sinon, récupérer depuis l'API
      const response = await ApiClient.get<ApiResponse<ContactGroup[]>>(
        API_CONFIG.ENDPOINTS.GROUPS
      );
      
      if (response.success && response.data) {
        // S'assurer que tous les groupes ont bien la propriété contactIds
        const groups = response.data.map(group => ({
          ...group,
          contactIds: group.contactIds || []
        }));
        
        // Mettre à jour le cache
        await CacheService.cacheGroups(groups);
        
        return groups;
      }
      
      // Si l'API échoue mais qu'on a un cache (même expiré), l'utiliser
      if (cachedGroups) {
        console.log('[StorageServiceAPI] API failed, using expired cache');
        return cachedGroups;
      }
      
      return [];
    } catch (error) {
      console.error('Error getting groups:', error);
      
      // En cas d'erreur, essayer de retourner le cache
      const cachedGroups = await CacheService.getCachedGroups();
      if (cachedGroups) {
        console.log('[StorageServiceAPI] Error, using cached groups as fallback');
        return cachedGroups;
      }
      
      return [];
    }
  }

  /**
   * Mettre à jour le cache des groupes en arrière-plan
   */
  private async updateGroupsCache(): Promise<void> {
    try {
      const response = await ApiClient.get<ApiResponse<ContactGroup[]>>(
        API_CONFIG.ENDPOINTS.GROUPS
      );
      
      if (response.success && response.data) {
        const groups = response.data.map(group => ({
          ...group,
          contactIds: group.contactIds || []
        }));
        await CacheService.cacheGroups(groups);
        console.log('[StorageServiceAPI] Background groups cache update completed');
      }
    } catch (error) {
      console.error('[StorageServiceAPI] Background groups cache update failed:', error);
    }
  }

  async addGroup(group: ContactGroup): Promise<void> {
    try {
      await ApiClient.post<ApiResponse<{id: string}>>(
        API_CONFIG.ENDPOINTS.GROUPS,
        group
      );
      // Invalider le cache pour forcer un rechargement
      await CacheService.invalidateCache('groups');
    } catch (error) {
      console.error('Error adding group:', error);
      throw error;
    }
  }

  async updateGroup(group: ContactGroup): Promise<void> {
    try {
      await ApiClient.put<ApiResponse<any>>(
        API_CONFIG.ENDPOINTS.GROUPS,
        group
      );
      // Invalider le cache pour forcer un rechargement
      await CacheService.invalidateCache('groups');
    } catch (error) {
      console.error('Error updating group:', error);
      throw error;
    }
  }

  async deleteGroup(groupId: string): Promise<void> {
    try {
      await ApiClient.delete<ApiResponse<any>>(
        `${API_CONFIG.ENDPOINTS.GROUPS}?id=${groupId}`
      );
      // Invalider le cache pour forcer un rechargement
      await CacheService.invalidateCache('groups');
    } catch (error) {
      console.error('Error deleting group:', error);
      throw error;
    }
  }

  // RELATIONSHIPS
  
  async addChild(contactId: string, child: any): Promise<void> {
    try {
      await ApiClient.post<ApiResponse<{id: string}>>(
        `${API_CONFIG.ENDPOINTS.RELATIONSHIPS}?action=child`,
        {
          contactId,
          ...child
        }
      );
    } catch (error) {
      console.error('Error adding child:', error);
      throw error;
    }
  }

  async deleteChild(childId: string): Promise<void> {
    try {
      await ApiClient.delete<ApiResponse<any>>(
        `${API_CONFIG.ENDPOINTS.RELATIONSHIPS}?action=child&id=${childId}`
      );
    } catch (error) {
      console.error('Error deleting child:', error);
      throw error;
    }
  }

  async addRelationship(contactId: string, relatedContactId: string, relationType: string, notes?: string, customRelationLabel?: string): Promise<void> {
    try {
      await ApiClient.post<ApiResponse<{id: number}>>(
        `${API_CONFIG.ENDPOINTS.RELATIONSHIPS}?action=relationship`,
        {
          contactId,
          relatedContactId,
          relationType,
          notes,
          customRelationLabel,
        }
      );
    } catch (error) {
      console.error('Error adding relationship:', error);
      throw error;
    }
  }

  async deleteRelationship(contactId: string, relatedContactId: string): Promise<void> {
    try {
      await ApiClient.delete<ApiResponse<any>>(
        `${API_CONFIG.ENDPOINTS.RELATIONSHIPS}?action=relationship&contactId=${contactId}&relatedContactId=${relatedContactId}`
      );
    } catch (error) {
      console.error('Error deleting relationship:', error);
      throw error;
    }
  }
}

export default new StorageServiceAPI();
