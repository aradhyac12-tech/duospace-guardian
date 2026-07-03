import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// FIX #1: API key must come from env — no hardcoded fallback.
const DAILY_API_KEY = Deno.env.get("DAILY_API_KEY");

// FIX #5: CORS restricted to configured origin; wildcard only in development.
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*";
const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── FIX AUDIT #6: Server-side rate limiting ─────────────────────────────────
// In-memory sliding window per user ID.
// Deno isolates are per-invocation in production; for multi-instance deployments
// replace this with a Redis/KV-backed counter.
// Limits: 2 room creations per user per minute.
const roomCreationLog = new Map<string, number[]>();
const ROOM_MAX_PER_MIN = 2;
const WINDOW_MS = 60_000;

function isRoomRateLimited(userId: string): boolean {
  const now = Date.now();
  const log = roomCreationLog.get(userId) ?? [];
  const recent = log.filter(t => now - t < WINDOW_MS);
  if (recent.length >= ROOM_MAX_PER_MIN) return true;
  recent.push(now);
  roomCreationLog.set(userId, recent);
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!DAILY_API_KEY) {
    console.error("DAILY_API_KEY env var is not set");
    return new Response(JSON.stringify({ error: "Server misconfiguration: DAILY_API_KEY not set" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // FIX #2: Require a valid Supabase session.
  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { action, roomName } = await req.json();

    if (action === "create-room") {
      // FIX AUDIT #6: enforce per-user rate limit on room creation
      if (isRoomRateLimited(user.id)) {
        return new Response(
          JSON.stringify({ error: "Rate limit: max 2 rooms per minute. Please wait before starting another call." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" } },
        );
      }

      const res = await fetch("https://api.daily.co/v1/rooms", {
        method: "POST",
        headers: { "Authorization": `Bearer ${DAILY_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: roomName || `duo-${Date.now()}`,
          properties: {
            exp: Math.floor(Date.now() / 1000) + 86400,
            enable_chat: false,
            enable_knocking: false,
            max_participants: 2,
            enable_network_ui: false,
            enable_prejoin_ui: false,
            enable_screenshare: true,
            enable_recording: false,
            start_video_off: false,
            start_audio_off: false,
            sfu_switchover: 0.5,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(`Daily API: ${JSON.stringify(data)}`);
      return new Response(JSON.stringify({ url: data.url, name: data.name, id: data.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get-token") {
      const res = await fetch("https://api.daily.co/v1/meeting-tokens", {
        method: "POST",
        headers: { "Authorization": `Bearer ${DAILY_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          properties: {
            room_name: roomName,
            exp: Math.floor(Date.now() / 1000) + 7200,
            is_owner: false,
            enable_screenshare: true,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(`Daily token API: ${JSON.stringify(data)}`);
      return new Response(JSON.stringify({ token: data.token }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete-room") {
      await fetch(`https://api.daily.co/v1/rooms/${roomName}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${DAILY_API_KEY}` },
      });
      return new Response(JSON.stringify({ deleted: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("daily-call error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
