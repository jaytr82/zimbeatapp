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

    // CRITICAL CONFIG CHECK
    if (!CONFIG.SUPABASE_ANON_KEY) {
        console.error("VITE_SUPABASE_ANON_KEY is missing in config.");
        throw new Error("Deployment Error: Missing API Key. Please set VITE_SUPABASE_ANON_KEY in Vercel.");
    }

    try {
      // Construct Headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        // Supabase Gateway requires 'Authorization: Bearer <anon_key>' for requests 
        // to functions with "Verify JWT" enabled.
        'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
        // Some older Kong configurations also look for 'apikey'
        'apikey': CONFIG.SUPABASE_ANON_KEY
      };

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
        // If it's the specific Gateway error
        if (text.toLowerCase().includes("authorization header")) {
             throw new Error("Gateway Access Denied. The provided API Key might be invalid.");
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