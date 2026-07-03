// Edge Function: issue-qr-token
// Called by an authenticated device (Device A). Mints a short-lived, single-use
// pairing token bound to the caller's user_id. Only the SHA-256 hash of the
// token is persisted server-side. The raw token is returned to the caller so it
// can be encoded into a QR code and scanned by Device B, which then hits
// redeem-qr-token to exchange it for a real Supabase session.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { consumeRateLimit } from "../_shared/rateLimit.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Token lifetime = 90s. Kept short so a leaked QR is nearly useless.
const TOKEN_TTL_SECONDS = 90;

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate the caller and get their user_id from the JWT.
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate-limit issuance per user: 10 tokens per minute is plenty for a
    // legitimate "regenerate QR" loop and shuts down abuse.
    const allowed = await consumeRateLimit(user.id, "qr-issue", 10, 60);
    if (!allowed) {
      return new Response(
        JSON.stringify({ error: "Too many QR requests. Try again shortly." }),
        {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 32 random bytes → 43-char URL-safe base64 token (~256 bits of entropy).
    const raw = new Uint8Array(32);
    crypto.getRandomValues(raw);
    const token = b64url(raw);
    const tokenHash = await sha256Hex(token);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + TOKEN_TTL_SECONDS * 1000);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    const issuerIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? null;
    const issuerUa = req.headers.get("user-agent") ?? null;

    const { error: insertErr } = await admin.from("qr_pairing_tokens").insert({
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: expiresAt.toISOString(),
      issuer_ip: issuerIp,
      issuer_ua: issuerUa,
    });
    if (insertErr) {
      console.error("[issue-qr-token] insert error:", insertErr.message);
      return new Response(JSON.stringify({ error: "Failed to issue token" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Opportunistic GC.
    admin.rpc("qr_pairing_tokens_gc").then(() => {}, () => {});

    return new Response(
      JSON.stringify({
        token,
        expires_at: expiresAt.toISOString(),
        ttl_seconds: TOKEN_TTL_SECONDS,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error("[issue-qr-token] exception:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
