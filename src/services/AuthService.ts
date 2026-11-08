import {UserAccount, UserProfile} from '../types';
import ApiClient from './ApiClient';
import API_CONFIG from '../config/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import E2EEService from './E2EEService';
import OnlineStatusService from './OnlineStatusService';

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
}

class AuthService {
  private currentUser: UserAccount | null = null;
  private authListeners = new Set<(loggedIn: boolean) => void>();

  // Notifie les connexions et déconnexions (la navigation, elle, ne relit l'état qu'au démarrage)
  onAuthChange(callback: (loggedIn: boolean) => void): () => void {
    this.authListeners.add(callback);
    return () => {
      this.authListeners.delete(callback);
    };
  }

  private notifyAuthChange(loggedIn: boolean) {
    this.authListeners.forEach(listener => {
      try {
        listener(loggedIn);
      } catch {}
    });
  }

  onSessionExpired(callback: () => void): () => void {
    return ApiClient.onUnauthorized(async () => {
      this.currentUser = null;
      await AsyncStorage.removeItem('@current_user');
      callback();
    });
  }

  // Créer un nouveau compte
  async register(
    email: string,
    password: string,
    firstName: string,
    lastName: string,
  ): Promise<UserAccount> {
    try {
      const response = await ApiClient.post<ApiResponse<{
        userId: string;
        email: string;
      }>>(`${API_CONFIG.ENDPOINTS.AUTH}?action=register`, {
        email,
        password,
        firstName,
        lastName,
      });

      if (!response.success || !response.data) {
        throw new Error(response.message);
      }

      // Créer un objet UserAccount temporaire pour compatibilité
      const account: UserAccount = {
        id: response.data.userId,
        email: response.data.email,
        password: '',
        profile: {
          id: response.data.userId,
          firstName,
          lastName,
          email: response.data.email,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        createdAt: new Date(),
        isVerified: false,
        verificationCode: undefined,
      };

      return account;
    } catch (error: any) {
      console.error('Error registering:', error);
      throw new Error(error.response?.data?.message || error.message || 'Erreur lors de l\'inscription');
    }
  }

  // Connexion
  async login(email: string, password: string): Promise<UserAccount> {
    try {
      // Effacer l'ancien token pour éviter qu'il soit envoyé dans le header Authorization
      await ApiClient.clearToken();

      const response = await ApiClient.post<ApiResponse<{
        token: string;
        user: any;
      }>>(`${API_CONFIG.ENDPOINTS.AUTH}?action=login`, {
        email,
        password,
      });

      if (!response.success || !response.data) {
        throw new Error(response.message);
      }

      // Si le compte n'est pas vérifié
      if (response.message === 'UNVERIFIED') {
        throw new Error('UNVERIFIED');
      }

      // Sauvegarder le token
      await ApiClient.setToken(response.data.token);

      // Créer l'objet UserAccount
      const account: UserAccount = {
        id: response.data.user.id,
        email: response.data.user.email,
        password: '',
        profile: {
          id: response.data.user.id,
          firstName: response.data.user.firstName,
          lastName: response.data.user.lastName,
          email: response.data.user.email,
          phone: response.data.user.phone,
          dateOfBirth: response.data.user.dateOfBirth ? new Date(response.data.user.dateOfBirth) : undefined,
          bio: response.data.user.bio,
          photo: response.data.user.photo,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        createdAt: new Date(),
        isVerified: true,
        lastLogin: new Date(),
      };

      this.currentUser = account;
      await AsyncStorage.setItem('@current_user', JSON.stringify(account));

      // Enregistrer la clé publique E2EE en arrière-plan sans bloquer la connexion.
      E2EEService.ensureRegisteredKeyPair().catch(error => {
        console.warn('[AuthService] E2EE key registration failed after login:', error);
      });

      this.notifyAuthChange(true);

      return account;
    } catch (error: any) {
      console.error('Error logging in:', error);
      const message = error.response?.data?.message || error.message;
      throw new Error(message || 'Erreur lors de la connexion');
    }
  }

  // Vérifier le code de vérification
  async verifyCode(email: string, code: string): Promise<boolean> {
    try {
      const response = await ApiClient.post<ApiResponse<{token: string}>>(
        `${API_CONFIG.ENDPOINTS.AUTH}?action=verify`,
        { email, code }
      );

      if (!response.success || !response.data) {
        return false;
      }

      // Sauvegarder le token
      await ApiClient.setToken(response.data.token);

      // Préparer la clé E2EE dès la vérification pour pouvoir recevoir des messages chiffrés.
      E2EEService.ensureRegisteredKeyPair().catch(error => {
        console.warn('[AuthService] E2EE key registration failed after verify:', error);
      });

      return true;
    } catch (error: any) {
      console.error('Error verifying code:', error);
      return false;
    }
  }

  // Renvoyer le code de vérification
  async resendVerificationCode(email: string): Promise<void> {
    try {
      const response = await ApiClient.post<ApiResponse<undefined>>(
        `${API_CONFIG.ENDPOINTS.AUTH}?action=resend`,
        { email }
      );

      if (!response.success) {
        throw new Error(response.message);
      }
    } catch (error: any) {
      console.error('Error resending code:', error);
      throw new Error(error.response?.data?.message || error.message || "Erreur lors de l'envoi du code");
    }
  }

  // Modifier le mot de passe depuis le profil
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    try {
      const response = await ApiClient.post<ApiResponse<undefined>>(
        `${API_CONFIG.ENDPOINTS.AUTH}?action=change-password`,
        { currentPassword, newPassword }
      );

      if (!response.success) {
        throw new Error(response.message);
      }
    } catch (error: any) {
      console.error('Error changing password:', error);
      if (error.name === 'NetworkError') {
        throw error;
      }
      throw new Error(error.response?.data?.message || error.message || 'Erreur lors de la modification du mot de passe');
    }
  }

  // Envoyer un code de réinitialisation du mot de passe par email
  async requestPasswordReset(email: string): Promise<void> {
    try {
      const response = await ApiClient.post<ApiResponse<undefined>>(
        `${API_CONFIG.ENDPOINTS.AUTH}?action=forgot-password`,
        { email }
      );

      if (!response.success) {
        throw new Error(response.message);
      }
    } catch (error: any) {
      console.error('Error requesting password reset:', error);
      if (error.name === 'NetworkError') {
        throw error;
      }
      throw new Error(error.response?.data?.message || error.message || "Erreur lors de l'envoi du code");
    }
  }

  // Définir un nouveau mot de passe avec le code reçu par email
  async resetPassword(email: string, code: string, newPassword: string): Promise<void> {
    try {
      const response = await ApiClient.post<ApiResponse<undefined>>(
        `${API_CONFIG.ENDPOINTS.AUTH}?action=reset-password`,
        { email, code, newPassword }
      );

      if (!response.success) {
        throw new Error(response.message);
      }
    } catch (error: any) {
      console.error('Error resetting password:', error);
      if (error.name === 'NetworkError') {
        throw error;
      }
      throw new Error(error.response?.data?.message || error.message || 'Erreur lors de la modification du mot de passe');
    }
  }

  // Déconnexion
  async logout(): Promise<void> {
    try {
      await OnlineStatusService.setOffline();
      await ApiClient.clearToken();
      this.currentUser = null;
      await AsyncStorage.removeItem('@current_user');
      // Réglages propres au compte : ne pas les laisser au prochain utilisateur de l'appareil
      await AsyncStorage.multiRemove([
        '@privacy_settings',
        '@privacy_settings_pending',
        '@notification_message_setting_pending',
        '@outbox',
      ]);
      this.notifyAuthChange(false);
    } catch (error) {
      console.error('Error logging out:', error);
      throw error;
    }
  }

  // Vérifier si l'utilisateur est connecté
  async isLoggedIn(): Promise<boolean> {
    const token = await ApiClient.getToken();
    return token !== null;
  }

  async validateSession(): Promise<boolean> {
    const token = await ApiClient.getToken();
    if (!token) {
      return false;
    }

    try {
      const response = await ApiClient.get<ApiResponse<any>>(
        `${API_CONFIG.ENDPOINTS.AUTH}?action=profile`
      );
      return !!response.success;
    } catch (error: any) {
      if (error?.response?.status === 401) {
        await this.logout();
        return false;
      }

      // En cas de panne réseau, conserver la session locale.
      return true;
    }
  }

  // Obtenir le compte actuel
  async getCurrentUser(): Promise<UserAccount | null> {
    if (this.currentUser) {
      return this.currentUser;
    }

    const userStr = await AsyncStorage.getItem('@current_user');
    if (userStr) {
      this.currentUser = JSON.parse(userStr);
      return this.currentUser;
    }

    // Récupérer depuis l'API
    try {
      const response = await ApiClient.get<ApiResponse<any>>(
        `${API_CONFIG.ENDPOINTS.AUTH}?action=profile`
      );

      if (response.success && response.data) {
        const account: UserAccount = {
          id: response.data.id,
          email: response.data.email,
          password: '',
          profile: {
            id: response.data.id,
            firstName: response.data.firstName,
            lastName: response.data.lastName,
            email: response.data.email,
            phone: response.data.phone,
            dateOfBirth: response.data.dateOfBirth ? new Date(response.data.dateOfBirth) : undefined,
            bio: response.data.bio,
            photo: response.data.photo,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          createdAt: new Date(),
          isVerified: true,
        };

        this.currentUser = account;
        await AsyncStorage.setItem('@current_user', JSON.stringify(account));
        return account;
      }
    } catch (error) {
      console.error('Error getting current user:', error);
    }

    return null;
  }

  // Mettre à jour le profil utilisateur
  async updateProfile(profile: UserProfile): Promise<void> {
    try {
      const response = await ApiClient.put<ApiResponse<any>>(
        `${API_CONFIG.ENDPOINTS.AUTH}?action=profile`,
        {
          firstName: profile.firstName,
          lastName: profile.lastName,
          phone: profile.phone,
          dateOfBirth: profile.dateOfBirth ? profile.dateOfBirth.toISOString() : null,
          bio: profile.bio,
          photo: profile.photo,
        }
      );

      if (!response.success) {
        throw new Error(response.message);
      }

      // Mettre à jour le compte en cache
      if (this.currentUser) {
        this.currentUser.profile = profile;
        await AsyncStorage.setItem('@current_user', JSON.stringify(this.currentUser));
      }
    } catch (error: any) {
      console.error('Error updating profile:', error);
      throw new Error(error.response?.data?.message || error.message || 'Erreur lors de la mise à jour du profil');
    }
  }
}

export default new AuthService();
