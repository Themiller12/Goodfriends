import {UserAccount, UserProfile} from '../types';
import ApiClient from './ApiClient';
import API_CONFIG from '../config/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
}

class AuthService {
  private currentUser: UserAccount | null = null;

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
        verificationCode: string;
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
        verificationCode: response.data.verificationCode,
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

      return true;
    } catch (error: any) {
      console.error('Error verifying code:', error);
      return false;
    }
  }

  // Renvoyer le code de vérification
  async resendVerificationCode(email: string): Promise<string> {
    try {
      const response = await ApiClient.post<ApiResponse<{verificationCode: string}>>(
        `${API_CONFIG.ENDPOINTS.AUTH}?action=resend`,
        { email }
      );

      if (!response.success || !response.data) {
        throw new Error(response.message);
      }

      return response.data.verificationCode;
    } catch (error: any) {
      console.error('Error resending code:', error);
      throw new Error(error.response?.data?.message || error.message || 'Erreur lors de l\'envoi du code');
    }
  }

  // Déconnexion
  async logout(): Promise<void> {
    try {
      await ApiClient.clearToken();
      this.currentUser = null;
      await AsyncStorage.removeItem('@current_user');
    } catch (error) {
      console.error('Error logging out:', error);
      throw error;
    }
  }

  // Vérifier si l'utilisateur est connecté
  async isLoggedIn(): Promise<boolean> {
    const token = await AsyncStorage.getItem('@auth_token');
    return token !== null;
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
