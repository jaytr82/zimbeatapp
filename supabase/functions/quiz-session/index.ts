import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkRateLimit, RateLimitError } from '../_shared/rateLimit.ts'

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

    // RATE LIMIT
    await checkRateLimit(supabaseClient, user.id, 'quiz_start');

    const { questionId } = await req.json()
    if (!questionId) throw new Error('Question ID required')

    // 1. Check if already completed successfully (One Reward Per Quiz Rule)
    const { data: existingSuccess } = await supabaseClient
        .from('quiz_sessions')
        .select('id')
        .eq('user_id', user.id)
        .eq('question_id', questionId)
        .eq('is_correct', true)
        .maybeSingle();

    // We allow them to play again for fun, but maybe tracking it differently?
    // For this strict implementation, we proceed but the submit endpoint will deny reward.
    // Ideally, we just create the session.

    // 2. Create session
    const { data, error } = await supabaseClient
      .from('quiz_sessions')
      .insert({
        user_id: user.id,
        question_id: questionId,
        status: 'active',
        started_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (error) throw error;

    return new Response(
      JSON.stringify({ sessionId: data.id }),
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