import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    // 1. Identify User (Optional, but recommended for DAU/MAU)
    const { data: { user } } = await supabaseClient.auth.getUser()

    // 2. Parse Batch
    const { events } = await req.json()
    if (!events || !Array.isArray(events)) {
      throw new Error('Invalid events payload');
    }

    // 3. Transform & Sanitize
    // We strictly map only allowed fields to prevent arbitrary data dumping
    const payload = events.map((e: any) => ({
      user_id: user?.id || null, // Null if anonymous
      event_name: String(e.name).slice(0, 50), // Cap length
      properties: e.properties || {}, // JSONB
      client_timestamp: new Date(e.timestamp).toISOString(),
      created_at: new Date().toISOString()
    }));

    // 4. Batch Insert
    // Assumes table: analytics_events (id uuid, user_id uuid, event_name text, properties jsonb, client_timestamp timestamptz, created_at timestamptz)
    const { error } = await supabaseClient
      .from('analytics_events')
      .insert(payload);

    if (error) throw error;

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    // Fail silently to client to not break app flow, but log internally
    console.error('Analytics Ingestion Error:', error);
    return new Response(
      JSON.stringify({ success: false }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 // Return 200 even on error to prevent client retries loop
      }
    )
  }
})