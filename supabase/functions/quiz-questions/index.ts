
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

    // 1. Get User (Optional, for completion status)
    const { data: { user } } = await supabaseClient.auth.getUser()

    // 2. Fetch Questions
    // We select all fields. We will filter sensitive ones in code before returning.
    const { data: questions, error } = await supabaseClient
      .from('questions')
      .select(`
        id, 
        question, 
        options, 
        media_url, 
        media_type, 
        media_duration, 
        media_start_seconds,
        reward_amount
      `)
      .eq('is_active', true)

    if (error) throw error

    // 3. Check Completions
    const completedIds = new Set<string>();
    if (user) {
        const { data: completions } = await supabaseClient
            .from('quiz_sessions')
            .select('question_id')
            .eq('user_id', user.id)
            .eq('is_correct', true) // Only count successful attempts
        
        completions?.forEach((c: any) => completedIds.add(c.question_id));
    }

    // 4. Transform & Sanitize
    const sanitizedQuestions = questions.map((q: any) => ({
      id: q.id,
      question: q.question,
      options: q.options, // Array of strings
      media: {
          youtubeId: q.media_url, // Assuming stored as ID for this app
          startSeconds: q.media_start_seconds || 0,
          duration: q.media_duration
      },
      rewardAmount: q.reward_amount,
      isCompleted: completedIds.has(q.id)
    }));

    return new Response(
      JSON.stringify(sanitizedQuestions),
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
