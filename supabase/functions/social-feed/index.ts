
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// Declare Deno global for TypeScript environments
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

    // Optional: Get user to check 'liked' status
    const { data: { user } } = await supabaseClient.auth.getUser()
    const currentUserId = user?.id;

    // Fetch posts
    // We want: Post Data + Artist Data + counts
    // And if logged in: Did I like it? Do I follow the artist?
    
    let query = supabaseClient
        .from('posts')
        .select(`
            *,
            users!artist_id ( first_name, wallet_address ),
            likes_count: likes(count),
            comments_count: comments(count)
        `)
        .order('created_at', { ascending: false })
        .limit(50);

    const { data: posts, error } = await query;
    if (error) throw error;

    let myLikes = new Set();
    let myFollows = new Set();

    if (currentUserId) {
        // Fetch all likes by this user for these posts
        const postIds = posts.map((p: any) => p.id);
        const { data: likesData } = await supabaseClient
            .from('likes')
            .select('post_id')
            .eq('user_id', currentUserId)
            .in('post_id', postIds);
        
        likesData?.forEach((l: any) => myLikes.add(l.post_id));

        // Fetch all follows by this user
        const artistIds = [...new Set(posts.map((p: any) => p.artist_id))];
        const { data: followsData } = await supabaseClient
            .from('followers')
            .select('user_id') // user_id is the artist
            .eq('follower_id', currentUserId)
            .in('user_id', artistIds);

        followsData?.forEach((f: any) => myFollows.add(f.user_id));
    }

    // Transform
    const feed = posts.map((p: any) => ({
        id: p.id,
        artistId: p.artist_id,
        artistName: p.users?.first_name || 'Unknown',
        artistWallet: p.users?.wallet_address || '',
        content: p.content,
        type: p.type,
        timestamp: new Date(p.created_at).getTime(),
        likes: p.likes || p.likes_count?.[0]?.count || 0, // Fallback to calculated count
        comments: p.comments || p.comments_count?.[0]?.count || 0,
        isLikedByMe: myLikes.has(p.id),
        isFollowedByMe: myFollows.has(p.artist_id)
    }));

    return new Response(
      JSON.stringify(feed),
      { headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
        status: 400
      }
    )
  }
})
