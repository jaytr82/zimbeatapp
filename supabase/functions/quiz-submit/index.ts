import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";
import * as hex from "https://deno.land/std@0.177.0/encoding/hex.ts";
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

    // 1. Auth
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) throw new Error('Unauthorized')

    // 2. Rate Limit
    await checkRateLimit(supabaseClient, user.id, 'quiz_submit');

    // 3. Parse Input
    const { questionId, answerIndex, sessionId, durationWatched } = await req.json()
    if (!sessionId || !questionId || answerIndex === undefined) {
        throw new Error('Missing submission data');
    }

    // 4. Validate Session
    // Ensure session belongs to user, is for this question, and is active
    const { data: session, error: sessionError } = await supabaseClient
        .from('quiz_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('user_id', user.id)
        .eq('question_id', questionId)
        .single();

    if (sessionError || !session) throw new Error('Invalid or expired session');
    if (session.status !== 'active') throw new Error('Session already completed');

    // 5. Fetch Truth Source (Question Data)
    // We get the correct answer and duration rules
    const { data: question, error: qError } = await supabaseClient
        .from('questions')
        .select('correct_option_index, media_duration, reward_amount')
        .eq('id', questionId)
        .single();

    if (qError || !question) throw new Error('Question not found');

    // 6. Validation Logic
    
    // A. Duration Check (Anti-Bot)
    // Must have watched at least 80% of required duration (tolerance for buffering)
    const MIN_DURATION = question.media_duration * 0.8;
    // We also check against session start time to ensure they didn't just send the API call instantly
    const sessionDuration = (Date.now() - new Date(session.started_at).getTime()) / 1000;
    
    if (durationWatched < MIN_DURATION || sessionDuration < MIN_DURATION) {
        // Mark as abandoned/failed attempt due to speed
        await supabaseClient.from('quiz_sessions').update({ 
            status: 'completed', 
            is_correct: false,
            completed_at: new Date().toISOString()
        }).eq('id', sessionId);
        
        return new Response(
            JSON.stringify({ success: false, correct: false, message: "Playback requirement not met." }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    // B. Answer Check
    const isCorrect = Number(answerIndex) === Number(question.correct_option_index);

    // 7. Check Previous Rewards (Anti-Farming)
    // Has this user ALREADY been rewarded for this question?
    const { data: existingSuccess } = await supabaseClient
        .from('quiz_sessions')
        .select('id')
        .eq('user_id', user.id)
        .eq('question_id', questionId)
        .eq('is_correct', true)
        .neq('id', sessionId) // Don't count current if somehow race condition
        .maybeSingle();

    let rewardAmount = 0;
    let signature = undefined;

    if (isCorrect && !existingSuccess) {
        rewardAmount = question.reward_amount;
        
        // Generate Signature for Smart Contract / Relayer
        // HMAC(secret, "userUUID:amount:nonce")
        const secret = Deno.env.get('JWT_SECRET') || 'default-secret';
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
            "raw", 
            encoder.encode(secret), 
            { name: "HMAC", hash: "SHA-256" }, 
            false, 
            ["sign"]
        );
        const payload = `${user.id}:${rewardAmount}:${sessionId}`;
        const sigBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
        signature = new TextDecoder().decode(hex.encode(new Uint8Array(sigBuffer)));
    }

    // 8. Update Session Status
    const { error: updateError } = await supabaseClient
        .from('quiz_sessions')
        .update({
            status: 'completed',
            is_correct: isCorrect,
            completed_at: new Date().toISOString(),
            answer_index: answerIndex,
            duration_watched: durationWatched,
            reward_granted: isCorrect && !existingSuccess, // Flag for analytics
        })
        .eq('id', sessionId);

    if (updateError) throw updateError;

    // 9. Response
    if (isCorrect) {
        const message = existingSuccess 
            ? "Correct! You have already claimed this reward." 
            : "Correct! Reward unlocked.";
            
        return new Response(
            JSON.stringify({ 
                success: true, 
                correct: true, 
                message, 
                rewardAmount: existingSuccess ? 0 : rewardAmount,
                signature
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } else {
        return new Response(
            JSON.stringify({ 
                success: true, 
                correct: false, 
                message: "Incorrect answer.",
                correctAnswerIndex: question.correct_option_index 
            }),
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