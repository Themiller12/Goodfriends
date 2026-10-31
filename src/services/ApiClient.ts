import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import API_CONFIG from '../config/api';
import SecureStorage from './SecureStorage';

const TOKEN_KEY = 'auth_token';
const LEGACY_TOKEN_KEY = '@auth_token';

type UnauthorizedListener = () => void;

class ApiClient {
  private client: AxiosInstance;
  private token: string | null = null;
  private unauthorizedListeners = new Set<UnauthorizedListener>();

  private notifyUnauthorized() {
    this.unauthorizedListeners.forEach(listener => {
      try {
        listener();
      } catch (error) {
        console.error('[ApiClient] Unauthorized listener failed:', error);
      }
    });
  }

  constructor() {
    this.client = axios.create({
      baseURL: API_CONFIG.BASE_URL,
      timeout: API_CONFIG.TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Intercepteur pour ajouter le token à chaque requête
    this.client.interceptors.request.use(
      async (config) => {
        if (!this.token) {
          this.token = await SecureStorage.getItem(TOKEN_KEY, LEGACY_TOKEN_KEY);
        }
        if (this.token) {
          config.headers.Authorization = `Bearer ${this.token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Intercepteur pour gérer les erreurs
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          // Token expiré, déconnecter l'utilisateur
          await this.clearToken();
          await AsyncStorage.removeItem('@current_user');
          this.notifyUnauthorized();
        }
        
        // Gérer les erreurs réseau
        if (error.code === 'ECONNABORTED' || error.code === 'ERR_NETWORK' || !error.response) {
          const networkError = new Error('Impossible de contacter le serveur. Vérifiez votre connexion internet.');
          networkError.name = 'NetworkError';
          return Promise.reject(networkError);
        }
        
        return Promise.reject(error);
      }
    );
  }

  async setToken(token: string) {
    this.token = token;
    await SecureStorage.setItem(TOKEN_KEY, token);
  }

  async getToken(): Promise<string | null> {
    if (!this.token) {
      this.token = await SecureStorage.getItem(TOKEN_KEY, LEGACY_TOKEN_KEY);
    }
    return this.token;
  }

  async clearToken() {
    this.token = null;
    await SecureStorage.removeItem(TOKEN_KEY, LEGACY_TOKEN_KEY);
  }

  onUnauthorized(listener: UnauthorizedListener): () => void {
    this.unauthorizedListeners.add(listener);
    return () => {
      this.unauthorizedListeners.delete(listener);
    };
  }

  async get<T>(url: string, config?: AxiosRequestConfig) {
    const response = await this.client.get<T>(url, config);
    return response.data;
  }

  async post<T>(url: string, data?: any, config?: AxiosRequestConfig) {
    const response = await this.client.post<T>(url, data, config);
    return response.data;
  }

  async put<T>(url: string, data?: any, config?: AxiosRequestConfig) {
    const response = await this.client.put<T>(url, data, config);
    return response.data;
  }

  async delete<T>(url: string, config?: AxiosRequestConfig) {
    const response = await this.client.delete<T>(url, config);
    return response.data;
  }
}

export default new ApiClient();
