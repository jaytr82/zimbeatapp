import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";
import * as hex from "https://deno.land/std@0.177.0/encoding/hex.ts";
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

    // 1. Authenticate
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) throw new Error('Unauthorized')

    // 2. Parse Input
    const { txHash, type, metadata } = await req.json()
    if (!txHash || !type) throw new Error('Missing transaction details');

    // 3. Rate Limit
    if (type === 'tip') {
        await checkRateLimit(supabaseClient, user.id, 'tip');
    }

    // 4. Replay Protection
    const { data: existing } = await supabaseClient
        .from('transactions')
        .select('id, status')
        .eq('tx_hash', txHash)
        .maybeSingle();

    if (existing) {
        // If already verified, just return success
        if (existing.status === 'confirmed' || existing.status === 'verified') {
            return new Response(
                JSON.stringify({ success: true, message: 'Already verified' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }
        throw new Error('Transaction already processed');
    }

    // 5. Fetch Transaction from TON API (Production Ready)
    const TON_API_ENDPOINT = Deno.env.get('TON_API_ENDPOINT') || 'https://testnet.tonapi.io/v2';
    const TON_API_KEY = Deno.env.get('TON_API_KEY');

    const headers: HeadersInit = {};
    if (TON_API_KEY) {
        // Standard header for tonapi.io or toncenter (adjust based on provider)
        headers['Authorization'] = `Bearer ${TON_API_KEY}`;
    }

    const txResponse = await fetch(`${TON_API_ENDPOINT}/blockchain/transactions/${txHash}`, { headers });
    
    if (!txResponse.ok) {
        if (txResponse.status === 429) {
             throw new Error('Blockchain API busy. Please try again in a moment.');
        }
        throw new Error('Transaction not found on network. Please wait a few seconds.');
    }

    const txData = await txResponse.json();

    // 6. Validate On-Chain Status
    if (!txData.success) {
        throw new Error('Transaction failed on blockchain.');
    }

    const inMsg = txData.in_msg;
    if (!inMsg) throw new Error('Invalid transaction structure');

    const amountNano = BigInt(inMsg.value || '0');
    const comment = inMsg.decoded_body?.text || inMsg.message_content?.decoded?.comment || '';
    
    // 7. Type-Specific Validation
    if (type === 'tip') {
        // Expected: Tip to Artist
        // Validate payload matches intent
        const expectedComment = `Tip for post ${metadata.postId}`;
        if (!comment.includes(expectedComment)) {
            throw new Error('Transaction comment does not match post ID.');
        }

        if (amountNano < 10000000n) { // 0.01 TON
            throw new Error('Tip amount too small.');
        }

    } else if (type === 'quiz_reward') {
        // Expected: Claim transaction sent to Treasury
        // Verify Signature in Comment: "claim:<signature>"
        const parts = comment.split('claim:');
        if (parts.length < 2) throw new Error('Invalid claim payload format.');
        
        const providedSignature = parts[1].trim();

        // Security Patch: Reconstruct signature using TRUTH from DB, not Client Metadata
        // Client metadata can be manipulated. We fetch the session using the metadata ID,
        // but we verify the User ID and correctness from DB.
        const { data: session } = await supabaseClient
            .from('quiz_sessions')
            .select('id, question_id, is_correct, user_id')
            .eq('user_id', user.id)
            .eq('question_id', metadata.questionId)
            .eq('is_correct', true)
            .order('completed_at', { ascending: false })
            .limit(1)
            .single();

        if (!session) throw new Error('No valid quiz session found for this claim.');

        // Get the actual reward amount for this question from DB to prevent amount spoofing
        const { data: question } = await supabaseClient
            .from('questions')
            .select('reward_amount')
            .eq('id', session.question_id)
            .single();
            
        if (!question) throw new Error('Question data missing.');

        // Re-generate HMAC
        const secret = Deno.env.get('JWT_SECRET') || 'default-secret';
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
            "raw", 
            encoder.encode(secret), 
            { name: "HMAC", hash: "SHA-256" }, 
            false, 
            ["sign"]
        );
        
        // Payload must match exactly what was signed in quiz-submit
        const payload = `${user.id}:${question.reward_amount}:${session.id}`;
        const sigBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
        const expectedSignature = new TextDecoder().decode(hex.encode(new Uint8Array(sigBuffer)));

        if (providedSignature !== expectedSignature) {
             throw new Error('Invalid signature. Claim denied.');
        }

        if (amountNano < 10000000n) {
             throw new Error('Insufficient fee provided.');
        }
    }

    // 8. Persist Verification
    const { error: insertError } = await supabaseClient
        .from('transactions')
        .insert({
            user_id: user.id,
            tx_hash: txHash,
            type: type,
            metadata: metadata,
            status: 'confirmed', 
            amount: amountNano.toString(),
            created_at: new Date().toISOString()
        });

    if (insertError) throw insertError;

    return new Response(
      JSON.stringify({ success: true, status: 'confirmed' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    const isRateLimit = error instanceof RateLimitError;
    return new Response(
      JSON.stringify({ 
          success: false, 
          error: error.message,
          retry_after_seconds: isRateLimit ? error.retryAfter : undefined
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: isRateLimit ? 429 : 400
      }
    )
  }
})