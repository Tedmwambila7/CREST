import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { AccessToken } from "npm:livekit-server-sdk@2.9.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const encoder = new TextEncoder();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function ticketKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function makeTicket(payload: Record<string, unknown>, secret: string): Promise<string> {
  const header = base64url(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = base64url(encoder.encode(JSON.stringify(payload)));
  const unsigned = header + "." + body;
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await ticketKey(secret), encoder.encode(unsigned)));
  return unsigned + "." + base64url(signature);
}

async function readTicket(token: string, secret: string): Promise<Record<string, unknown>> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid or expired call invitation.");
  const unsigned = parts[0] + "." + parts[1];
  const valid = await crypto.subtle.verify(
    "HMAC",
    await ticketKey(secret),
    fromBase64url(parts[2]),
    encoder.encode(unsigned),
  );
  if (!valid) throw new Error("Invalid or expired call invitation.");
  const payload = JSON.parse(new TextDecoder().decode(fromBase64url(parts[1])));
  if (
    payload.iss !== "crest-livekit-token" ||
    typeof payload.exp !== "number" ||
    payload.exp <= Math.floor(Date.now() / 1000) ||
    typeof payload.room !== "string" ||
    !/^crest-call-[a-f0-9-]{20,60}$/.test(payload.room) ||
    !["audio", "video"].includes(payload.mode)
  ) throw new Error("Invalid or expired call invitation.");
  return payload;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const livekitApiKey = Deno.env.get("LIVEKIT_API_KEY") || "";
    const livekitApiSecret = Deno.env.get("LIVEKIT_API_SECRET") || "";
    const livekitUrl = Deno.env.get("LIVEKIT_URL") || "";

    if (!supabaseUrl || !serviceRoleKey || !livekitApiKey || !livekitApiSecret || !livekitUrl) {
      return json({ error: "Calling service is not configured. Check the main CREST Supabase function secrets." }, 503);
    }

    const body = await req.json();
    const action = String(body.action || "");
    const role = String(body.role || "");
    const identity = String(body.identity || "");
    const displayName = String(body.displayName || (role === "admin" ? "CREST Teacher" : "CREST Student"))
      .replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, 60);

    if (!/^u_[A-Za-z0-9_-]{8,100}$/.test(identity)) return json({ error: "Invalid calling identity." }, 400);
    if (role !== "admin" && role !== "student") return json({ error: "Invalid CREST role." }, 403);

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Verify the existing CREST login; this function does not create a second account system.
    if (role === "admin") {
      const adminKey = typeof body.adminKey === "string" ? body.adminKey : "";
      if (!adminKey || adminKey.length > 300) return json({ error: "Admin session could not be verified. Sign in again." }, 401);
      const { data, error } = await supabase.rpc("admin_check", { p_key: adminKey });
      if (error || data !== true) return json({ error: "Admin session could not be verified. Sign in again." }, 401);
    } else {
      const studentToken = typeof body.studentToken === "string" ? body.studentToken : "";
      if (!studentToken || studentToken.length > 1000) return json({ error: "Student session could not be verified. Sign in again." }, 401);
      const { data, error } = await supabase.rpc("student_me", { p_token: studentToken });
      if (error || !data) return json({ error: "Student session could not be verified. Sign in again." }, 401);
    }

    let roomName = "";
    let mode: "audio" | "video" = "audio";

    if (action === "lobby") {
      if (body.room !== "crest-lobby") return json({ error: "Invalid calling room." }, 400);
      roomName = "crest-lobby";
    } else if (action === "create") {
      if (role !== "admin") return json({ error: "Only the CREST administrator can start a group call." }, 403);
      if (body.mode !== "audio" && body.mode !== "video") return json({ error: "Choose a voice or video call." }, 400);
      mode = body.mode;
      const callId = crypto.randomUUID();
      roomName = "crest-call-" + callId;
      const now = Math.floor(Date.now() / 1000);
      const ticket = await makeTicket({
        iss: "crest-livekit-token",
        sub: identity,
        callId,
        room: roomName,
        mode,
        iat: now,
        exp: now + 180,
      }, livekitApiSecret);
      return json({ ticket, callId, mode });
    } else if (action === "join") {
      if (typeof body.ticket !== "string") return json({ error: "A valid teacher invitation is required." }, 403);
      const invite = await readTicket(body.ticket, livekitApiSecret);
      roomName = String(invite.room);
      mode = invite.mode as "audio" | "video";
    } else {
      return json({ error: "Unknown calling action." }, 400);
    }

    const access = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity,
      name: displayName || (role === "admin" ? "CREST Teacher" : "CREST Student"),
      metadata: JSON.stringify({ role }),
      ttl: "15m",
    });
    access.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await access.toJwt();
    return json({ token, room: roomName, mode, serverUrl: livekitUrl });
  } catch (error) {
    console.error("crest-livekit-token error:", error);
    const message = error instanceof Error ? error.message : "Calling service failed.";
    return json({ error: message.includes("invitation") ? message : "Calling service could not complete the request. Check the CREST session and function configuration." }, 500);
  }
});
