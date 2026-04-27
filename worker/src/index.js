/**
 * Client Site API Worker
 *
 * Tiny Cloudflare Worker (~5KB) that provides:
 * - GET  /api/content     → load business JSON from KV
 * - POST /api/content     → save business JSON to KV (auth required)
 * - POST /api/upload      → upload image to R2 (auth required)
 * - POST /api/login       → password check, returns session token
 * - GET  /api/image/:key  → serve image from R2
 *
 * Auth: simple bearer token (HMAC of password + timestamp, valid 7 days)
 */

const CONTENT_KEY = "business";
const TOKEN_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function error(message, status = 400) {
  return json({ error: message }, status);
}

/** Create a simple token from password */
async function createToken(password, env) {
  const now = Date.now();
  const data = `${password}:${now}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(env.PASSWORD), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  const hex = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
  return `${now}.${hex}`;
}

/** Verify bearer token */
async function verifyToken(token, env) {
  if (!token) return false;
  const [timestampStr, hex] = token.split(".");
  if (!timestampStr || !hex) return false;

  const timestamp = parseInt(timestampStr, 10);
  if (Date.now() - timestamp > TOKEN_TTL) return false;

  const data = `${env.PASSWORD}:${timestamp}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(env.PASSWORD), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  const expected = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
  return hex === expected;
}

function getToken(request) {
  const auth = request.headers.get("Authorization") || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

async function requireAuth(request, env) {
  const token = getToken(request);
  if (!await verifyToken(token, env)) {
    return error("Unauthorized", 401);
  }
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // ─── GET /api/content ──────────────────────────────────────
    if (path === "/api/content" && request.method === "GET") {
      const data = await env.CONTENT.get(CONTENT_KEY, "json");
      if (!data) return error("No content found", 404);
      return json(data);
    }

    // ─── POST /api/content ─────────────────────────────────────
    if (path === "/api/content" && request.method === "POST") {
      const authErr = await requireAuth(request, env);
      if (authErr) return authErr;

      const body = await request.json();
      await env.CONTENT.put(CONTENT_KEY, JSON.stringify(body));
      return json({ ok: true });
    }

    // ─── POST /api/login ───────────────────────────────────────
    if (path === "/api/login" && request.method === "POST") {
      const { password } = await request.json();
      if (!password || password !== env.PASSWORD) {
        return error("Invalid password", 401);
      }
      const token = await createToken(password, env);
      return json({ token });
    }

    // ─── POST /api/upload ──────────────────────────────────────
    if (path === "/api/upload" && request.method === "POST") {
      const authErr = await requireAuth(request, env);
      if (authErr) return authErr;

      const formData = await request.formData();
      const file = formData.get("file");
      if (!file || !(file instanceof File)) {
        return error("No file provided");
      }

      // Validate type
      const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"];
      if (!allowedTypes.includes(file.type)) {
        return error("Invalid file type. Allowed: JPG, PNG, WebP, GIF, SVG");
      }

      // 5MB limit
      if (file.size > 5 * 1024 * 1024) {
        return error("File too large. Maximum 5MB.");
      }

      // Generate unique key
      const ext = file.name.split(".").pop() || "jpg";
      const key = `uploads/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

      await env.UPLOADS.put(key, file.stream(), {
        httpMetadata: { contentType: file.type },
      });

      const imageUrl = `/api/image/${key}`;
      return json({ url: imageUrl });
    }

    // ─── GET /api/image/* ──────────────────────────────────────
    if (path.startsWith("/api/image/") && request.method === "GET") {
      const key = path.replace("/api/image/", "");
      const object = await env.UPLOADS.get(key);
      if (!object) return error("Image not found", 404);

      const headers = new Headers();
      headers.set("Content-Type", object.httpMetadata?.contentType || "image/jpeg");
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
      headers.set("Access-Control-Allow-Origin", "*");
      return new Response(object.body, { headers });
    }

    // ─── Verify auth status ────────────────────────────────────
    if (path === "/api/auth/check" && request.method === "GET") {
      const token = getToken(request);
      const valid = await verifyToken(token, env);
      return json({ authenticated: valid });
    }

    return error("Not found", 404);
  },
};
