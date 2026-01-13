
export const corsHeaders = (origin: string | null) => {
  const allowedOrigins = [
    'https://web.telegram.org',
    'https://zimbeatapp.vercel.app', // Replace with your actual TWA domain
    'https://zimbeatapp.vercel.app', // Vercel Deployment
  ];

  const allow = origin && allowedOrigins.includes(origin) ? origin : 'null';

  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-version, x-client-platform',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  };
};
