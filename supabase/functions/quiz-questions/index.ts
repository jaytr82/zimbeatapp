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
    // 1. Explicit Header Validation
    // Log all headers to debug what is actually arriving
    // console.log("Incoming Headers:", JSON.stringify(Object.fromEntries(req.headers.entries())));

    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
    
    if (!authHeader) {
        console.error("[Auth] Request missing Authorization header.");
        return new Response(
            JSON.stringify({ error: "Unauthorized: Missing credentials" }),
            { 
                status: 401, 
                headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } 
            }
        );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // 2. Validate User Session
    // We explicitly call getUser() to verify the JWT integrity and expiration
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()

    if (authError || !user) {
        console.error("[Auth] JWT Verification Failed:", authError?.message || "User object null");
        return new Response(
            JSON.stringify({ error: "Unauthorized: Invalid or expired token", details: authError?.message }),
            { 
                status: 401, 
                headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } 
            }
        );
    }

    // 3. Fetch Questions (RLS Protected)
    // We select all fields. We will filter sensitive ones in code before returning.
    const { data: questions, error: dbError } = await supabaseClient
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

    // 4. Handle Database/Permission Errors
    if (dbError) {
        console.error("[DB] Fetch failed:", dbError);
        
        // Postgres error 42501: insufficient_privilege (RLS blocking)
        if (dbError.code === '42501' || dbError.message.includes('permission denied')) {
             return new Response(
                JSON.stringify({ error: "Forbidden: You do not have permission to view questions." }),
                { 
                    status: 403, 
                    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } 
                }
            );
        }
        
        throw dbError; // Internal Server Error
    }

    // 5. Check Completions
    const completedIds = new Set<string>();
    if (user) {
        const { data: completions } = await supabaseClient
            .from('quiz_sessions')
            .select('question_id')
            .eq('user_id', user.id)
            .eq('is_correct', true) // Only count successful attempts
        
        completions?.forEach((c: any) => completedIds.add(c.question_id));
    }

    // 6. Transform & Sanitize
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
    console.error("[System] Internal Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal Server Error" }),
      { 
        headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
        status: 400
      }
    )
  }
})