import { CONFIG } from './config';
import { UserRole } from '../types';

interface LoginResponse {
  accessToken: string;
  user: {
    id: string; // Database UUID
    role: UserRole;
  };
}

let currentToken: string | null = null;

export const authService = {
  /**
   * Performs the cryptographic handshake with the backend.
   * Exchanges Telegram initData for a secure Session JWT.
   */
  login: async (initData: string): Promise<LoginResponse> => {
    if (!initData) {
      throw new Error("No Telegram initData found. Please open in Telegram.");
    }

    try {
      const response = await fetch(`${CONFIG.API_BASE_URL}/telegram-auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ initData }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Authentication handshake failed');
      }

      const data = await response.json();
      
      // Store token in memory singleton
      currentToken = data.accessToken;
      
      return data;
    } catch (error) {
      console.error('Login Error:', error);
      throw error;
    }
  },

  getAccessToken: (): string | null => {
    return currentToken;
  },

  isAuthenticated: (): boolean => {
    return !!currentToken;
  },

  logout: () => {
    currentToken = null;
  }
};