import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkRateLimit, RateLimitError } from '../_shared/rateLimit.ts'
import { corsHeaders } from '../_shared/cors.ts'

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

serve(async (req) => {
  const origin = req.headers.get('Origin');

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) throw new Error('Unauthorized')

    await checkRateLimit(supabaseClient, user.id, 'post');

    const { content, type } = await req.json()
    
    // INPUT VALIDATION (DoS Prevention)
    if (!content) throw new Error('Content is required')
    if (typeof content !== 'string') throw new Error('Invalid content type')
    if (content.length > 500) throw new Error('Post too long (max 500 chars)')
    if (content.length < 5) throw new Error('Post too short')
    
    const validTypes = ['news', 'show', 'release'];
    if (type && !validTypes.includes(type)) {
        throw new Error('Invalid post type');
    }

    const { data: userProfile } = await supabaseClient
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();

    if (userProfile?.role !== 'artist') {
        throw new Error('Only verified artists can publish posts.')
    }

    const { data, error } = await supabaseClient
      .from('posts')
      .insert({
        artist_id: user.id,
        content: content.trim(), // Sanitize whitespace
        type: type || 'news',
        likes: 0,
        comments: 0
      })
      .select('*, users!artist_id(first_name, wallet_address)')
      .single()

    if (error) throw error

    const formattedPost = {
        id: data.id,
        artistId: data.artist_id,
        artistName: data.users?.first_name || 'Unknown Artist',
        artistWallet: data.users?.wallet_address || '',
        content: data.content,
        type: data.type,
        timestamp: new Date(data.created_at).getTime(),
        likes: 0,
        comments: 0,
        isLikedByMe: false,
        isFollowedByMe: false
    };

    return new Response(
      JSON.stringify(formattedPost),
      { headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    const status = error instanceof RateLimitError ? 429 : 400;
    const body = error instanceof RateLimitError 
        ? { message: error.message, retry_after_seconds: error.retryAfter }
        : { error: error.message };

    return new Response(
      JSON.stringify(body),
      { 
        headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
        status
      }
    )
  }
})