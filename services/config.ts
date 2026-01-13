// Centralized Configuration for Zim Music Hub
// NOTE: Sensitive keys (Service Role, Bot Token) must NEVER be added here.
// They are injected strictly into Backend Edge Functions via Supabase Secrets.
const getEnv = (key: string): string => {
  let value = '';
  // Try Vite's import.meta.env
  if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
    value = (import.meta as any).env[key] || '';
  }
  // Fallback to process.env (if polyfilled)
  if (!value && typeof process !== 'undefined' && process.env) {
    value = process.env[key] || '';
  }
  return value ? value.trim() : '';
};

export const CONFIG = {
  // App Metadata
  APP_VERSION: '1.0.0-rc.1',
  
  // API Gateway
  // We use import.meta.env for Vite compatibility.
  // Default fallback is set to local Supabase Edge Runtime for development.
  // In production, set VITE_API_URL to your deployed Supabase project URL (e.g. https://<project>.supabase.co/functions/v1)
  API_BASE_URL: getEnv('VITE_API_URL') ||  'https://kbxuyrxmvbevivyekviv.supabase.co/functions/v1',

    // Supabase Anon Key (Required for API Gateway access if Verify JWT is enabled)
  SUPABASE_ANON_KEY: getEnv('VITE_SUPABASE_ANON_KEY'),


  // TON Blockchain (Testnet)
  TON_API_ENDPOINT: 'https://testnet.tonapi.io/v2',
  
  // Contracts & Wallets (Public Keys Only)
  // The Master address for the ZIM Jetton Minter
  JETTON_MASTER_ADDRESS: 'EQClYRJGmAi9RbhaMKiBk50LEtS8mwSlh7LKljYGlkI0xUH2',
  
  // The Treasury wallet that dispenses rewards
  // Ensure this wallet is funded with ZIM tokens and TON for gas
  TREASURY_WALLET: '0QBKCxuIweArnr4TzRtD_osA2dfCm2g8FluRILHhIyB0lUFt',
  
  // App Manifest for Wallet Connection
  MANIFEST_URL: 'https://zimbeatapp.vercel.app/tonconnect-manifest.json',
  
  // Feature Flags
  ENABLE_ANALYTICS: true,
  STRICT_MODE: true, // Enforces rigorous validations in dev
  DEBUG_LOGGING: (import.meta as any).env?.DEV // Enable logging in dev mode
};
