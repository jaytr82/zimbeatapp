import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkRateLimit, RateLimitError } from '../_shared/rateLimit.ts'

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

    // CHECK RATE LIMIT (Debounce protection)
    await checkRateLimit(supabaseClient, user.id, 'like');

    const { postId } = await req.json()
    if (!postId) throw new Error('Post ID required')

    const { data: existingLike } = await supabaseClient
        .from('likes')
        .select('id')
        .eq('user_id', user.id)
        .eq('post_id', postId)
        .maybeSingle()

    let isLiked = false;

    if (existingLike) {
        // Unlike
        await supabaseClient.from('likes').delete().eq('id', existingLike.id);
        await supabaseClient.rpc('decrement_like_count', { row_id: postId });
        isLiked = false;
    } else {
        // Like
        await supabaseClient.from('likes').insert({ user_id: user.id, post_id: postId });
        await supabaseClient.rpc('increment_like_count', { row_id: postId });
        isLiked = true;
    }

    return new Response(
      JSON.stringify({ isLiked }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    const status = error instanceof RateLimitError ? 429 : 400;
    const body = error instanceof RateLimitError 
        ? { message: error.message, retry_after_seconds: error.retryAfter }
        : { error: error.message };

    return new Response(
      JSON.stringify(body),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status
      }
    )
  }
})