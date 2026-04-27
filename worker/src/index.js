/**
 * Client Site API Worker
 *
 * Tiny Cloudflare Worker that provides:
 * - GET  /api/content     → load business JSON from KV
 * - POST /api/content     → save business JSON to KV (auth required)
 * - POST /api/upload      → upload image to R2 (auth required)
 * - POST /api/login       → password check, returns session token
 * - GET  /api/image/:key  → serve image from R2
 * - GET  /api/auth/check  → verify token validity
 *
 * Security:
 * - HMAC-SHA256 bearer tokens (7-day TTL)
 * - Rate limiting on login (5 attempts per 15 min per IP, KV-backed)
 * - Account lockout (15 min after 5 failures)
 * - Security headers on all responses
 * - CORS restricted to same origin in production
 * - Timing-safe password comparison
 */

const CONTENT_KEY = "business";
const TOKEN_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

// Rate limiting
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_WINDOW = 15 * 60; // 15 minutes in seconds (also KV TTL)

// Security headers added to every response
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

function getCorsOrigin(request, env) {
  // In production (custom domain set), restrict to same origin
  // Fallback to * for dev/testing
  const origin = request.headers.get("Origin") || "";
  const allowed = env.ALLOWED_ORIGIN || "*";
  if (allowed === "*") return "*";
  return origin === allowed ? allowed : "null";
}

function corsHeaders(request, env) {
  return {
    "Access-Control-Allow-Origin": getCorsOrigin(request, env),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function json(data, status = 200, request = null, env = null) {
  const headers = {
    "Content-Type": "application/json",
    ...SECURITY_HEADERS,
    ...(request && env ? corsHeaders(request, env) : { "Access-Control-Allow-Origin": "*" }),
  };
  return new Response(JSON.stringify(data), { status, headers });
}

function errorResponse(message, status = 400, request = null, env = null) {
  return json({ error: message }, status, request, env);
}

// ─── Timing-safe comparison ─────────────────────────────────────────

function timingSafeEqual(a, b) {
  if (a.length !== b.length) {
    // Compare against self to burn same time, then return false
    const dummy = a;
    let result = 0;
    for (let i = 0; i < dummy.length; i++) {
      result |= dummy.charCodeAt(i) ^ dummy.charCodeAt(i);
    }
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// ─── Rate limiting (KV-backed) ──────────────────────────────────────

function getClientIP(request) {
  return request.headers.get("CF-Connecting-IP") ||
         request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
         "unknown";
}

async function checkRateLimit(ip, env) {
  const key = `ratelimit:login:${ip}`;
  const record = await env.CONTENT.get(key, "json");

  if (!record) return { allowed: true, remaining: MAX_LOGIN_ATTEMPTS };

  if (record.count >= MAX_LOGIN_ATTEMPTS) {
    const elapsed = Math.floor(Date.now() / 1000) - record.firstAttempt;
    const remaining = LOCKOUT_WINDOW - elapsed;
    if (remaining > 0) {
      return { allowed: false, remaining: 0, retryAfter: remaining };
    }
    // Lockout expired, allow
    return { allowed: true, remaining: MAX_LOGIN_ATTEMPTS };
  }

  return { allowed: true, remaining: MAX_LOGIN_ATTEMPTS - record.count };
}

async function recordFailedAttempt(ip, env) {
  const key = `ratelimit:login:${ip}`;
  const record = await env.CONTENT.get(key, "json");
  const now = Math.floor(Date.now() / 1000);

  if (!record || (now - record.firstAttempt) > LOCKOUT_WINDOW) {
    // First failure or window expired — start fresh
    await env.CONTENT.put(key, JSON.stringify({
      count: 1,
      firstAttempt: now,
    }), { expirationTtl: LOCKOUT_WINDOW });
  } else {
    // Increment
    await env.CONTENT.put(key, JSON.stringify({
      count: record.count + 1,
      firstAttempt: record.firstAttempt,
    }), { expirationTtl: LOCKOUT_WINDOW });
  }
}

async function clearRateLimit(ip, env) {
  const key = `ratelimit:login:${ip}`;
  await env.CONTENT.delete(key);
}

// ─── Auth ───────────────────────────────────────────────────────────

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

async function verifyToken(token, env) {
  if (!token) return false;
  const [timestampStr, hex] = token.split(".");
  if (!timestampStr || !hex) return false;

  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp) || Date.now() - timestamp > TOKEN_TTL) return false;

  const data = `${env.PASSWORD}:${timestamp}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(env.PASSWORD), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  const expected = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
  return timingSafeEqual(hex, expected);
}

function getToken(request) {
  const auth = request.headers.get("Authorization") || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

async function requireAuth(request, env) {
  const token = getToken(request);
  if (!await verifyToken(token, env)) {
    return errorResponse("Unauthorized", 401, request, env);
  }
  return null;
}

// ─── Main handler ───────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: { ...corsHeaders(request, env), ...SECURITY_HEADERS },
      });
    }

    // ─── GET /api/content ──────────────────────────────────────
    if (path === "/api/content" && request.method === "GET") {
      const data = await env.CONTENT.get(CONTENT_KEY, "json");
      if (!data) return errorResponse("No content found", 404, request, env);
      return json(data, 200, request, env);
    }

    // ─── POST /api/content ─────────────────────────────────────
    if (path === "/api/content" && request.method === "POST") {
      const authErr = await requireAuth(request, env);
      if (authErr) return authErr;

      const body = await request.json();
      await env.CONTENT.put(CONTENT_KEY, JSON.stringify(body));
      return json({ ok: true }, 200, request, env);
    }

    // ─── POST /api/login ───────────────────────────────────────
    if (path === "/api/login" && request.method === "POST") {
      const ip = getClientIP(request);

      // Check rate limit before even reading the body
      const rateCheck = await checkRateLimit(ip, env);
      if (!rateCheck.allowed) {
        return errorResponse(
          `Too many login attempts. Try again in ${Math.ceil(rateCheck.retryAfter / 60)} minutes.`,
          429,
          request,
          env
        );
      }

      let password;
      try {
        const body = await request.json();
        password = body.password;
      } catch {
        return errorResponse("Invalid request", 400, request, env);
      }

      if (!password || !timingSafeEqual(password, env.PASSWORD)) {
        await recordFailedAttempt(ip, env);
        // Generic message — don't reveal whether password field was missing vs wrong
        return errorResponse("Invalid password", 401, request, env);
      }

      // Success — clear rate limit record
      await clearRateLimit(ip, env);
      const token = await createToken(password, env);
      return json({ token }, 200, request, env);
    }

    // ─── POST /api/upload ──────────────────────────────────────
    if (path === "/api/upload" && request.method === "POST") {
      const authErr = await requireAuth(request, env);
      if (authErr) return authErr;

      let formData;
      try {
        formData = await request.formData();
      } catch {
        return errorResponse("Invalid form data", 400, request, env);
      }

      const file = formData.get("file");
      if (!file || !(file instanceof File)) {
        return errorResponse("No file provided", 400, request, env);
      }

      // Validate type
      const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"];
      if (!allowedTypes.includes(file.type)) {
        return errorResponse("Invalid file type. Allowed: JPG, PNG, WebP, GIF, SVG", 400, request, env);
      }

      // 5MB limit
      if (file.size > 5 * 1024 * 1024) {
        return errorResponse("File too large. Maximum 5MB.", 400, request, env);
      }

      // Generate unique key — no user input in the key
      const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const key = `uploads/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

      await env.UPLOADS.put(key, file.stream(), {
        httpMetadata: { contentType: file.type },
      });

      const imageUrl = `/api/image/${key}`;
      return json({ url: imageUrl }, 200, request, env);
    }

    // ─── GET /api/image/* ──────────────────────────────────────
    if (path.startsWith("/api/image/") && request.method === "GET") {
      const key = decodeURIComponent(path.replace("/api/image/", ""));

      // Prevent path traversal
      if (key.includes("..") || !key.startsWith("uploads/")) {
        return errorResponse("Invalid path", 400, request, env);
      }

      const object = await env.UPLOADS.get(key);
      if (!object) return errorResponse("Image not found", 404, request, env);

      const headers = new Headers();
      headers.set("Content-Type", object.httpMetadata?.contentType || "image/jpeg");
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("Access-Control-Allow-Origin", getCorsOrigin(request, env));
      return new Response(object.body, { headers });
    }

    // ─── GET /api/auth/check ───────────────────────────────────
    if (path === "/api/auth/check" && request.method === "GET") {
      const token = getToken(request);
      const valid = await verifyToken(token, env);
      return json({ authenticated: valid }, 200, request, env);
    }

    return errorResponse("Not found", 404, request, env);
  },
};
