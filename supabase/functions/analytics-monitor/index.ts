import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

/**
 * METRICS DEFINITION:
 * 1. DAU: Unique user_ids in last 24h.
 * 2. Quiz Participation: Count of 'quiz_start' events.
 * 3. Token Volume: Sum of 'amount' in 'reward_claimed' and 'tip_success'.
 * 4. Error Rate: Percentage of events with name containing 'error' or 'failed'.
 * 
 * ALERT THRESHOLDS:
 * - Error Rate > 5%
 * - Zero DAU (System outage?)
 */

serve(async (req) => {
  try {
    // Use Service Role to bypass RLS for reading aggregate analytics
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // 1. Fetch Raw Events for Last 24h
    // In production, use RPC/SQL for aggregation. Here we do rudimentary fetch-process for the prototype.
    const { data: events, error } = await supabaseAdmin
        .from('analytics_events')
        .select('user_id, event_name, properties')
        .gte('created_at', yesterday.toISOString())
        .limit(10000); // Cap for memory safety

    if (error) throw error;
    if (!events || events.length === 0) {
        console.log("No events in last 24h. Possible outage or low traffic.");
        return new Response(JSON.stringify({ message: "No Data" }), { headers: { 'Content-Type': 'application/json' } });
    }

    // 2. Calculate Metrics
    const uniqueUsers = new Set(events.map(e => e.user_id).filter(Boolean));
    const dau = uniqueUsers.size;

    let quizStarts = 0;
    let volume = 0;
    let errorCount = 0;

    events.forEach(e => {
        // Quiz Stats
        if (e.event_name === 'quiz_start') quizStarts++;

        // Volume Stats (Tips + Rewards)
        if (['reward_claimed', 'tip_success'].includes(e.event_name)) {
            const amt = parseFloat(e.properties?.amount || '0');
            // Check if amount is raw nano or whole. Assumed properties normalized by frontend, 
            // but if raw nano (100000000), logic might need adjustment. 
            // For this sample, we assume frontend sends human readable or we just sum raw.
            volume += isNaN(amt) ? 0 : amt; 
        }

        // Error Stats
        if (e.event_name.includes('error') || e.event_name.includes('failed')) {
            errorCount++;
        }
    });

    const totalEvents = events.length;
    const errorRate = totalEvents > 0 ? (errorCount / totalEvents) : 0;

    // 3. Log Report
    const report = {
        date: now.toISOString().split('T')[0],
        dau,
        quizStarts,
        volumeEstimate: volume, // Note: Unit depends on input data
        errorRate: (errorRate * 100).toFixed(2) + '%'
    };

    console.log("DAILY ANALYTICS REPORT:", JSON.stringify(report, null, 2));

    // 4. Alert Logic
    if (errorRate > 0.05) {
        console.error(`[ALERT] High Error Rate Detected: ${report.errorRate}`);
        // In real app: await sendSlackNotification(...)
    }

    if (dau === 0) {
        console.error(`[ALERT] Zero DAU detected.`);
    }

    // 5. Store Aggregated Stat (Optional)
    await supabaseAdmin.from('daily_stats').insert({
        date: report.date,
        dau: report.dau,
        volume: report.volumeEstimate,
        error_rate: parseFloat(report.errorRate)
    });

    return new Response(
      JSON.stringify(report),
      { headers: { 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})