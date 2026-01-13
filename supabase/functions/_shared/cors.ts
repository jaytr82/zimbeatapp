
export const corsHeaders = (origin: string | null) => {
  const allowedOrigins = [
    'https://web.telegram.org',
    'https://zimbeatapp.vercel.app', // Vercel Deployment
    'http://localhost:5173'    // Allow local dev
  ];

  // Allow any localhost origin for development (http://localhost:5173, http://localhost:3000, etc.)
  const isLocalhost = origin && origin.match(/http:\/\/localhost:\d+/);

  const allow = (origin && allowedOrigins.includes(origin)) || isLocalhost ? origin : 'null';

  return {
    'Access-Control-Allow-Origin': "*",
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-version, x-client-platform',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',

    
  };
};
