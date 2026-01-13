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
      // Construct Headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Important: Supabase Gateway often requires the Anon Key to allow the request
      // even for public endpoints like telegram-auth.
      if (CONFIG.SUPABASE_ANON_KEY) {
        headers['Authorization'] = `Bearer ${CONFIG.SUPABASE_ANON_KEY}`;
        headers['apikey'] = CONFIG.SUPABASE_ANON_KEY;
      } else {
        console.warn("Missing VITE_SUPABASE_ANON_KEY. Handshake might fail if 'Verify JWT' is enabled on backend.");
      }

      const response = await fetch(`${CONFIG.API_BASE_URL}/telegram-auth`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ initData }),
      });

      // Parse response as text first to handle non-JSON errors (like 500s or 404s) gracefully
      const text = await response.text();
      let data: any = {};
      
      try {
        if (text) data = JSON.parse(text);
      } catch (e) {
        console.error("Auth Response parse error:", text);
        // If it's the "Missing authorization header" HTML error from Kong/Supabase, text will reveal it
        if (text.includes("authorization header")) {
             throw new Error("Gateway Error: Missing Supabase Anon Key. Please check Vercel env vars.");
        }
        throw new Error(`Server returned invalid format (${response.status})`);
      }

      if (!response.ok) {
        // Prefer the explicit error message from backend, fallback to status text
        const errorMessage = data.error || data.message || `Auth Error: ${response.status} ${response.statusText}`;
        console.warn("Auth Handshake Failed:", errorMessage);
        throw new Error(errorMessage);
      }

      if (!data.accessToken) {
        throw new Error('Invalid response: Missing access token');
      }
      
      // Store token in memory singleton
      currentToken = data.accessToken;
      
      return data as LoginResponse;
    } catch (error: any) {
      console.error('Login Process Error:', error);
      // Ensure the UI gets a readable message
      throw new Error(error.message || 'Authentication handshake failed');
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