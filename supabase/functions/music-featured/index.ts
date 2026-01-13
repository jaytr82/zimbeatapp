
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
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

    // 1. Fetch Songs
    // Assumes table 'songs' exists with: id, title, artist, cover_url, youtube_id, plays, is_featured
    const { data: songs, error } = await supabaseClient
      .from('songs')
      .select('id, title, artist, artist_id, cover_url, youtube_id, plays')
      .eq('is_featured', true)
      .order('plays', { ascending: false })
      .limit(20);

    if (error) throw error;

    // 2. Transform (CamelCase for Frontend)
    const formattedSongs = songs.map((s: any) => ({
      id: s.id,
      title: s.title,
      artist: s.artist,
      artistId: s.artist_id,
      coverUrl: s.cover_url,
      youtubeId: s.youtube_id,
      plays: s.plays
    }));

    return new Response(
      JSON.stringify({ songs: formattedSongs }),
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
