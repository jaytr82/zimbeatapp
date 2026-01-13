
// Centralized Configuration for Zimbeat
// NOTE: Sensitive keys (Service Role, Bot Token) must NEVER be added here.
// They are injected strictly into Backend Edge Functions via Supabase Secrets.

// Helper to safely get env vars across different build environments (Vite vs others)
const getEnv = (key: string): string => {
  // 1. Try Vite's import.meta.env
  if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
    const val = (import.meta as any).env[key];
    if (val) return val.trim();
  }
  // 2. Fallback to process.env (Node/Webpack/Next.js)
  if (typeof process !== 'undefined' && process.env) {
    const val = process.env[key];
    if (val) return val.trim();
  }
  return '';
};

// Construct dynamic manifest URL to prevent CORS errors during testing/deployment
const getManifestUrl = () => {
    // If explicitly set in env, use it
    const envUrl = getEnv('VITE_MANIFEST_URL');
    if (envUrl) return envUrl;

    // Otherwise, construct based on current location
    if (typeof window !== 'undefined') {
        return `${window.location.protocol}//${window.location.host}/tonconnect-manifest.json`;
    }
    
    // Fallback for SSR
    return 'https://zimbeatapp.vercel.app/tonconnect-manifest.json';
};

export const CONFIG = {
  // App Metadata
  APP_VERSION: '1.0.0-rc.3',
  
  // API Gateway
  // Default fallback is set to local Supabase Edge Runtime for development.
  API_BASE_URL: getEnv('VITE_API_URL') || getEnv('NEXT_PUBLIC_API_URL') || 'https://zcfqqnkhjmwtxskqiuxi.supabase.co/functions/v1',

  // Supabase Anon Key (Required for API Gateway access if Verify JWT is enabled)
  // We check multiple prefixes to handle different deployment setups (Vite, Next, CRA, standard)
  SUPABASE_ANON_KEY: 
    getEnv('VITE_SUPABASE_ANON_KEY') || 
    getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') || 
    getEnv('REACT_APP_SUPABASE_ANON_KEY') || 
    getEnv('SUPABASE_ANON_KEY'),

  // TON Blockchain (Testnet)
  TON_API_ENDPOINT: 'https://testnet.tonapi.io/v2',
  
  // Contracts & Wallets (Public Keys Only)
  // The Master address for the ZBT Jetton Minter
  JETTON_MASTER_ADDRESS: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixDn7cacWi8UDC',
  
  // The Treasury wallet that dispenses rewards
  TREASURY_WALLET: '0QBKCxuIweArnr4TzRtD_osA2dfCm2g8FluRILHhIyB0lUFt',
  
  // App Manifest for Wallet Connection
  MANIFEST_URL: getManifestUrl(),
  
  // Feature Flags
  ENABLE_ANALYTICS: true,
  STRICT_MODE: true, 
  DEBUG_LOGGING: getEnv('DEV') === 'true'
};
