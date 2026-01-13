
export const corsHeaders = (origin: string | null) => {
  return {
    'Access-Control-Allow-Origin': '*',
    // Added 'Authorization' explicitly to cover case-sensitive proxies/browsers
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-version, x-client-platform, Authorization',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
  };
};