import { CONFIG } from './config';
import { UserRole } from '../types';
import { getTelegramInitData } from './identityService';

interface LoginResponse {
  accessToken: string;
  user: {
    id: string; // Database UUID
    role: UserRole;
  };
}

let currentToken: string | null = null;
let currentInitData: string | null = null;
let refreshPromise: Promise<LoginResponse> | null = null;

export const authService = {
  /**
   * Performs the cryptographic handshake with the backend.
   * Exchanges Telegram initData for a secure Session JWT.
   */
  login: async (initData: string): Promise<LoginResponse> => {
    try {
      const response = await fetch(`${CONFIG.API_BASE_URL}/auth/telegram`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ initData }),
      });

      if (!response.ok) {
        throw new Error('Authentication failed');
      }

      const data = await response.json();

      // Store token and initData in memory
      currentToken = data.accessToken;
      currentInitData = initData;

      return data;
    } catch (error) {
      console.error('Login Error:', error);
      throw error;
    }
  },

  /**
   * Checks if the current token is expired or will expire soon.
   */
  isTokenExpired: (): boolean => {
    if (!currentToken) return true;

    try {
      // Decode JWT payload (base64url decode)
      const payload = currentToken.split('.')[1];
      const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
      const expiry = decoded.exp * 1000; // Convert to milliseconds

      // Consider token expired if it expires within 5 minutes
      return Date.now() > (expiry - 5 * 60 * 1000);
    } catch (error) {
      console.warn('Failed to decode token:', error);
      return true;
    }
  },

  /**
   * Refreshes the authentication token using stored initData.
   * Returns a promise that resolves when refresh is complete.
   */
  refreshToken: async (): Promise<LoginResponse> => {
    // Prevent multiple simultaneous refresh attempts
    if (refreshPromise) {
      return refreshPromise;
    }

    if (!currentInitData) {
      throw new Error('No initData available for token refresh');
    }

    refreshPromise = authService.login(currentInitData);

    try {
      const result = await refreshPromise;
      return result;
    } finally {
      refreshPromise = null;
    }
  },

  /**
   * Gets a valid access token, refreshing if necessary.
   */
  getValidAccessToken: async (): Promise<string | null> => {
    if (!currentToken || authService.isTokenExpired()) {
      try {
        await authService.refreshToken();
      } catch (error) {
        console.error('Token refresh failed:', error);
        // Clear invalid token
        currentToken = null;
        currentInitData = null;
        return null;
      }
    }
    return currentToken;
  },

  getAccessToken: (): string | null => {
    return currentToken;
  },

  logout: () => {
    currentToken = null;
    currentInitData = null;
    refreshPromise = null;
  }
};