import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Declare Deno global for TypeScript environments
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

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) throw new Error('Unauthorized')

    const { artistId, action } = await req.json()
    if (!artistId) throw new Error('Artist ID required')

    if (artistId === user.id) throw new Error("Cannot follow yourself");

    // Check existing follow
    const { data: existingFollow } = await supabaseClient
        .from('followers')
        .select('id')
        .eq('follower_id', user.id)
        .eq('user_id', artistId) // user_id is the target artist
        .maybeSingle()

    if (action === 'unfollow' && existingFollow) {
        await supabaseClient
            .from('followers')
            .delete()
            .eq('id', existingFollow.id)
    } else if ((action === 'follow' || !action) && !existingFollow) {
        await supabaseClient
            .from('followers')
            .insert({
                follower_id: user.id,
                user_id: artistId
            })
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    )
  }
})