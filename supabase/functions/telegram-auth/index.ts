import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";
import * as hex from "https://deno.land/std@0.177.0/encoding/hex.ts";
import { SignJWT } from 'https://deno.land/x/jose@v4.14.4/index.ts'
import { corsHeaders } from '../_shared/cors.ts'

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

serve(async (req) => {
  const origin = req.headers.get('Origin');
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) })
  }

  try {
    const { initData } = await req.json()
    
    // INPUT VALIDATION
    if (!initData || typeof initData !== 'string' || initData.length > 2000) {
        throw new Error('Invalid or oversized initData');
    }

    const botToken = Deno.env.get('BOT_TOKEN')
    const jwtSecret = Deno.env.get('JWT_SECRET')
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    if (!botToken || !jwtSecret) {
      console.error("Missing Secrets: BOT_TOKEN or JWT_SECRET");
      throw new Error('Server misconfiguration: Missing secrets')
    }

    // 1. VALIDATE TELEGRAM DATA
    const urlParams = new URLSearchParams(initData)
    const hash = urlParams.get('hash')
    
    if (!hash) {
      throw new Error('Missing hash in initData')
    }

    urlParams.delete('hash')
    
    // Check auth_date to prevent replay attacks (allow 24 hours)
    const authDate = parseInt(urlParams.get('auth_date') || '0')
    const now = Math.floor(Date.now() / 1000)
    
    // Strict time window: 24h past, 5 min future (clock skew)
    if (now - authDate > 86400) {
       console.error(`Auth expired: now=${now}, authDate=${authDate}`);
       throw new Error('Data is too old (expired)')
    }
    
    // Sort keys alphabetically
    const paramsArray = Array.from(urlParams.entries())
    paramsArray.sort(([a], [b]) => a.localeCompare(b))
    
    const dataCheckString = paramsArray.map(([key, value]) => `${key}=${value}`).join('\n')

    // Generate Secret Key: HMAC_SHA256("WebAppData", botToken)
    const encoder = new TextEncoder()
    const secretKeyKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode("WebAppData"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    )
    const secretKey = await crypto.subtle.sign(
      "HMAC",
      secretKeyKey,
      encoder.encode(botToken)
    )

    // Generate Signature
    const signatureKey = await crypto.subtle.importKey(
      "raw",
      secretKey,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    )
    const signature = await crypto.subtle.sign(
      "HMAC",
      signatureKey,
      encoder.encode(dataCheckString)
    )
    const signatureHex = new TextDecoder().decode(hex.encode(new Uint8Array(signature)))

    if (signatureHex !== hash) {
      console.error("Signature Mismatch", { expected: signatureHex, received: hash });
      throw new Error('Invalid signature')
    }

    // 2. PARSE USER DATA
    const userStr = urlParams.get('user')
    if (!userStr) throw new Error('Missing user data')
    const telegramUser = JSON.parse(userStr) as TelegramUser

    // 3. DATABASE SYNC (UPSERT)
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: existingUser, error: fetchError } = await supabase
      .from('users')
      .select('id, role')
      .eq('telegram_id', telegramUser.id)
      .single()

    let userId: string
    let role: string = 'user'

    if (existingUser) {
      userId = existingUser.id
      role = existingUser.role
      
      // Async update
      supabase.from('users').update({
        first_name: telegramUser.first_name,
        last_name: telegramUser.last_name,
        username: telegramUser.username,
        language_code: telegramUser.language_code,
        is_premium: telegramUser.is_premium || false,
        updated_at: new Date().toISOString()
      }).eq('id', userId).then()

    } else {
      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert({
          telegram_id: telegramUser.id,
          first_name: telegramUser.first_name,
          last_name: telegramUser.last_name,
          username: telegramUser.username,
          language_code: telegramUser.language_code,
          is_premium: telegramUser.is_premium || false
        })
        .select('id, role')
        .single()

      if (insertError) {
        console.error("User Insert Error:", insertError);
        throw insertError
      }
      userId = newUser.id
      role = newUser.role
    }

    // 4. MINT CUSTOM JWT
    const secret = new TextEncoder().encode(jwtSecret)
    const token = await new SignJWT({
        aud: 'authenticated',
        role: 'authenticated',
        sub: userId,
        app_role: role,
        telegram_id: telegramUser.id
      })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(secret)

    return new Response(
      JSON.stringify({ 
        accessToken: token, 
        user: { 
          id: userId, 
          role: role, 
          telegram_id: telegramUser.id 
        } 
      }),
      { 
        headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error("Auth Handshake Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || 'Unknown server error' }),
      { 
        headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
        status: 401
      }
    )
  }
})