import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const RATE_LIMITS = {
  comment: 5000,      // 5 seconds
  like: 500,          // 0.5 seconds (debounce)
  post: 60000,        // 60 seconds
  tip: 10000,         // 10 seconds
  quiz_start: 5000,   // 5 seconds
  quiz_submit: 2000   // 2 seconds
}

export class RateLimitError extends Error {
  retryAfter: number;
  constructor(message: string, retryAfter: number) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

export async function checkRateLimit(
  client: SupabaseClient,
  userId: string,
  action: keyof typeof RATE_LIMITS
) {
  const cooldown = RATE_LIMITS[action];
  const now = new Date();
  
  // 1. Fetch last attempt
  // specific logic: use maybeSingle to handle 'no record found' gracefully
  const { data: limitRecord, error } = await client
    .from('user_rate_limits')
    .select('last_attempt_at, violation_count')
    .eq('user_id', userId)
    .eq('action', action)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
     console.error('Rate limit fetch error', error);
     // Fail open if DB is down to avoid blocking legitimate users, but log it.
     return; 
  }

  if (limitRecord) {
    const lastTime = new Date(limitRecord.last_attempt_at).getTime();
    const timePassed = now.getTime() - lastTime;

    if (timePassed < cooldown) {
       // VIOLATION DETECTED
       const retryAfter = Math.ceil((cooldown - timePassed) / 1000);
       
       // Persist violation asynchronously (fire and forget)
       client.from('user_rate_limits').update({
           violation_count: (limitRecord.violation_count || 0) + 1
       }).eq('user_id', userId).eq('action', action).then();

       throw new RateLimitError(`Rate limit exceeded. Wait ${retryAfter}s.`, retryAfter);
    }
  }

  // 2. Update Timestamp (Upsert)
  // We wait for this to ensure the lock is in place for next request
  const { error: upsertError } = await client.from('user_rate_limits').upsert({
      user_id: userId,
      action: action,
      last_attempt_at: now.toISOString(),
      violation_count: limitRecord ? limitRecord.violation_count : 0
  }, { onConflict: 'user_id, action' });

  if (upsertError) {
      console.error('Rate limit update failed', upsertError);
  }
}