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