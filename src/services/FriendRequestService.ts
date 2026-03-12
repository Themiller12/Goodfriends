import ApiClient from './ApiClient';
import API_CONFIG from '../config/api';
import NotificationService from './NotificationService';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
}

export interface GoodFriendsUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  photo?: string;
  requestStatus?: 'pending' | 'accepted' | 'rejected' | null;
}

export interface FriendRequest {
  id: string;
  senderId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  photo?: string;
  dateOfBirth?: string;
  createdAt: string;
}

class FriendRequestService {
  private readonly ENDPOINT = `${API_CONFIG.BASE_URL}/friend_requests.php`;

  // Rechercher des utilisateurs GoodFriends
  async searchUsers(query: string): Promise<GoodFriendsUser[]> {
    try {
      const response = await ApiClient.get<ApiResponse<GoodFriendsUser[]>>(
        `${this.ENDPOINT}?action=search&query=${encodeURIComponent(query)}`
      );

      return response.data || [];
    } catch (error) {
      console.error('Error searching users:', error);
      throw error;
    }
  }

  // Envoyer une demande d'ami
  async sendFriendRequest(receiverId: string): Promise<void> {
    try {
      await ApiClient.post<ApiResponse<{id: string}>>(
        `${this.ENDPOINT}?action=send`,
        {receiverId}
      );
    } catch (error) {
      console.error('Error sending friend request:', error);
      throw error;
    }
  }

  // Récupérer les demandes en attente (reçues)
  async getPendingRequests(): Promise<FriendRequest[]> {
    try {
      const response = await ApiClient.get<ApiResponse<FriendRequest[]>>(
        `${this.ENDPOINT}?action=pending`
      );

      return response.data || [];
    } catch (error: any) {
      // Ne pas logger l'erreur si c'est une erreur 401 (non autorisé)
      // Cela peut arriver si l'utilisateur n'est pas connecté
      if (error.response?.status !== 401) {
        console.error('Error getting pending requests:', error);
      }
      return [];
    }
  }

  // Récupérer les demandes envoyées (en attente)
  async getSentRequests(): Promise<GoodFriendsUser[]> {
    try {
      const response = await ApiClient.get<ApiResponse<GoodFriendsUser[]>>(
        `${this.ENDPOINT}?action=sent`
      );

      return response.data || [];
    } catch (error: any) {
      if (error.response?.status !== 401) {
        console.error('Error getting sent requests:', error);
      }
      return [];
    }
  }

  // Accepter une demande d'ami
  async acceptFriendRequest(requestId: string): Promise<void> {
    try {
      await ApiClient.post<ApiResponse<any>>(
        `${this.ENDPOINT}?action=accept`,
        {requestId}
      );
    } catch (error) {
      console.error('Error accepting friend request:', error);
      throw error;
    }
  }

  // Refuser une demande d'ami
  async rejectFriendRequest(requestId: string): Promise<void> {
    try {
      await ApiClient.post<ApiResponse<any>>(
        `${this.ENDPOINT}?action=reject`,
        {requestId}
      );
    } catch (error) {
      console.error('Error rejecting friend request:', error);
      throw error;
    }
  }

  // Vérifier les nouvelles demandes d'ami et afficher des notifications
  async checkNewFriendRequests(): Promise<void> {
    try {
      const requests = await this.getPendingRequests();
      
      // Si aucune demande (peut-être à cause d'une erreur d'auth), ne rien faire
      if (requests.length === 0) {
        return;
      }
      
      // Récupérer les IDs des demandes déjà notifiées
      const notifiedRequestsStr = await AsyncStorage.getItem('@notified_friend_requests');
      const notifiedRequests: string[] = notifiedRequestsStr 
        ? JSON.parse(notifiedRequestsStr) 
        : [];

      // Trouver les nouvelles demandes non encore notifiées
      const newRequests = requests.filter(
        request => !notifiedRequests.includes(request.id)
      );

      // Afficher une notification pour chaque nouvelle demande
      for (const request of newRequests) {
        const senderName = `${request.firstName} ${request.lastName}`;
        await NotificationService.showFriendRequestNotification(
          senderName,
          request.email,
          request.senderId
        );

        // Marquer comme notifié
        notifiedRequests.push(request.id);
      }

      // Sauvegarder la liste mise à jour
      await AsyncStorage.setItem(
        '@notified_friend_requests',
        JSON.stringify(notifiedRequests)
      );
    } catch (error) {
      // Silencieux - ne pas afficher d'erreur si l'utilisateur n'est pas connecté
      console.log('Skipping friend request check - user may not be logged in');
    }
  }
}

export default new FriendRequestService();
