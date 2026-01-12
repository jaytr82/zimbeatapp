import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

    // Admin client for privileged actions (Approve)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Get Current User
    const {
      data: { user },
    } = await supabaseClient.auth.getUser()

    if (!user) {
      throw new Error('Unauthorized')
    }

    const url = new URL(req.url)
    
    // ==========================================
    // GET: Check Verification Status
    // ==========================================
    if (req.method === 'GET') {
      const { data, error } = await supabaseClient
        .from('artist_verification')
        .select('status, admin_notes')
        .eq('user_id', user.id)
        .maybeSingle()

      if (error) throw error
      
      return new Response(
        JSON.stringify({ 
          status: data?.status || 'idle',
          message: data?.admin_notes || ''
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ==========================================
    // POST: Apply or Approve
    // ==========================================
    if (req.method === 'POST') {
      const body = await req.json()
      const { action } = body

      // ACTION: APPLY (User)
      if (action === 'apply' || !action) {
        const { bio, genre, socialLink } = body

        if (!bio || !genre || !socialLink) {
          throw new Error('Missing required fields')
        }

        // 1. Enforce Wallet Requirement
        // We use the admin client to read the user's wallet_address to ensure we get the latest
        // sensitive data even if RLS somehow restricted it (though user can usually read own).
        const { data: userRecord, error: userError } = await supabaseClient
          .from('users')
          .select('wallet_address')
          .eq('id', user.id)
          .single()

        if (userError || !userRecord) throw new Error('User not found')
        
        if (!userRecord.wallet_address) {
          throw new Error('Wallet required. Please connect your TON wallet first.')
        }

        // 2. Check for existing request
        const { data: existing } = await supabaseClient
          .from('artist_verification')
          .select('status')
          .eq('user_id', user.id)
          .maybeSingle()

        if (existing && existing.status === 'pending') {
          throw new Error('Application already pending')
        }
        if (existing && existing.status === 'approved') {
          throw new Error('Already verified')
        }

        // 3. Create Request
        const { error: insertError } = await supabaseClient
          .from('artist_verification')
          .upsert({
            user_id: user.id,
            bio,
            genre,
            social_link_proof: socialLink,
            status: 'pending'
          })

        if (insertError) throw insertError

        return new Response(
          JSON.stringify({ success: true, status: 'pending' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // ACTION: APPROVE (Admin Only)
      // This part would typically be called by an Admin Dashboard
      if (action === 'approve') {
        // Verify the caller has admin rights (User Role Check)
        const { data: caller } = await supabaseAdmin
          .from('users')
          .select('role')
          .eq('id', user.id)
          .single()

        if (caller?.role !== 'admin') {
           throw new Error('Forbidden: Admins only')
        }

        const { targetUserId } = body
        if (!targetUserId) throw new Error('Target User ID required')

        // 1. Fetch Verification Data
        const { data: application } = await supabaseAdmin
          .from('artist_verification')
          .select('*')
          .eq('user_id', targetUserId)
          .single()

        if (!application) throw new Error('Application not found')

        // 2. Update Status
        await supabaseAdmin
          .from('artist_verification')
          .update({ status: 'approved' })
          .eq('user_id', targetUserId)

        // 3. Promote User Role
        await supabaseAdmin
          .from('users')
          .update({ role: 'artist' })
          .eq('id', targetUserId)

        // 4. Create Public Profile
        const { error: profileError } = await supabaseAdmin
          .from('artist_profiles')
          .upsert({
            user_id: targetUserId,
            bio: application.bio,
            genre: application.genre,
            social_links: { proof: application.social_link_proof }
          })

        if (profileError) throw profileError

        return new Response(
          JSON.stringify({ success: true, message: 'Artist approved' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      throw new Error('Invalid action')
    }

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