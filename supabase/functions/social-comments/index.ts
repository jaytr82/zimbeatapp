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

    const url = new URL(req.url)

    // GET: Fetch Comments (No Rate Limit)
    if (req.method === 'GET') {
        const postId = url.searchParams.get('postId');
        if (!postId) throw new Error('Post ID required');

        const { data, error } = await supabaseClient
            .from('comments')
            .select(`
                id, content, created_at, user_id,
                users ( first_name, role )
            `)
            .eq('post_id', postId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        const comments = data.map((c: any) => ({
            id: c.id,
            postId: postId,
            userId: c.user_id,
            userName: c.users?.first_name || 'Anonymous',
            userRole: c.users?.role || 'user',
            content: c.content,
            timestamp: new Date(c.created_at).getTime()
        }));

        return new Response(
            JSON.stringify(comments),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    // POST: Create Comment (Rate Limited)
    if (req.method === 'POST') {
        const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
        if (authError || !user) throw new Error('Unauthorized')

        // CHECK RATE LIMIT
        await checkRateLimit(supabaseClient, user.id, 'comment');

        const { postId, content } = await req.json()
        if (!postId || !content) throw new Error('Missing fields');

        const { data, error } = await supabaseClient
            .from('comments')
            .insert({
                post_id: postId,
                user_id: user.id,
                content: content
            })
            .select(`
                id, content, created_at, user_id,
                users ( first_name, role )
            `)
            .single();

        if (error) throw error;

        // Optimistic count update
        await supabaseClient.rpc('increment_comment_count', { row_id: postId });

        const newComment = {
            id: data.id,
            postId: postId,
            userId: data.user_id,
            userName: data.users?.first_name || 'Me',
            userRole: data.users?.role || 'user',
            content: data.content,
            timestamp: new Date(data.created_at).getTime()
        };

        return new Response(
            JSON.stringify(newComment),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

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