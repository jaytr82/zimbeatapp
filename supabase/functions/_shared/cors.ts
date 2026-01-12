
export const corsHeaders = (origin: string | null) => {
  const allowedOrigins = [
    'https://web.telegram.org',
    'https://zimmusichub.com', // Replace with your actual TWA domain
    'http://localhost:5173'    // Allow local dev
  ];

  const allow = origin && allowedOrigins.includes(origin) ? origin : 'null';

  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-version, x-client-platform',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  };
};
