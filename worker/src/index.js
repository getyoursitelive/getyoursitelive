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
 * - POST /api/invalidate-sessions → revoke all tokens (auth required)
 *
 * Security:
 * - HMAC-SHA256 bearer tokens (7-day TTL, nonce-based, generation counter)
 * - Rate limiting on login (5 attempts per 15 min per IP, KV-backed)
 * - Account lockout (15 min after 5 failures)
 * - Security headers on all responses
 * - CORS restricted to same origin in production
 * - Timing-safe password comparison
 * - Content structure validation with key allowlist
 */

const CONTENT_KEY = "business";
const TOKEN_GENERATION_KEY = "token_generation";
const TOKEN_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

// Rate limiting
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_WINDOW = 15 * 60; // 15 minutes in seconds (also KV TTL)

// Content validation — only these top-level keys are accepted
const ALLOWED_CONTENT_KEYS = new Set([
  "slug", "category", "theme", "businessInfo", "hero", "about", "stats",
  "services", "deals", "pricing", "team", "testimonials", "photos", "faqs",
  "emergency", "contact", "footer", "visibility", "sectionTitles", "navLabels",
  "hoursSchedule"
]);

// Upload MIME → extension mapping (derive ext from validated type, not user filename)
const MIME_TO_EXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

// Security headers added to every response
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};

function getCorsOrigin(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = env.ALLOWED_ORIGIN;

  if (!allowed) {
    // No ALLOWED_ORIGIN set — allow localhost for dev, deny everything else
    if (origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1")) {
      return origin;
    }
    // No Origin header = same-origin request; deny cross-origin
    return "null";
  }

  // Support comma-separated origins (e.g. "https://seedreply.com,https://auto-repair.pages.dev")
  const allowedList = allowed.split(",").map(s => s.trim());
  return allowedList.includes(origin) ? origin : "null";
}

function corsHeaders(request, env) {
  return {
    "Access-Control-Allow-Origin": getCorsOrigin(request, env),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin",
  };
}

function json(data, status = 200, request = null, env = null) {
  const headers = {
    "Content-Type": "application/json",
    ...SECURITY_HEADERS,
    ...(request && env ? corsHeaders(request, env) : {}),
  };
  return new Response(JSON.stringify(data), { status, headers });
}

function errorResponse(message, status = 400, request = null, env = null) {
  return json({ error: message }, status, request, env);
}

// ─── Timing-safe comparison ─────────────────────────────────────────
// HMAC both inputs so comparison is always fixed-length (32 bytes),
// eliminating the length-leak side channel of naive char-by-char XOR.

async function timingSafeEqual(a, b) {
  const encoder = new TextEncoder();
  const keyData = crypto.getRandomValues(new Uint8Array(32));
  const key = await crypto.subtle.importKey(
    "raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const [sigA, sigB] = await Promise.all([
    crypto.subtle.sign("HMAC", key, encoder.encode(String(a))),
    crypto.subtle.sign("HMAC", key, encoder.encode(String(b))),
  ]);
  const viewA = new Uint8Array(sigA);
  const viewB = new Uint8Array(sigB);
  let result = 0;
  for (let i = 0; i < viewA.length; i++) {
    result |= viewA[i] ^ viewB[i];
  }
  return result === 0;
}

// ─── Rate limiting (KV-backed) ──────────────────────────────────────

function getClientIP(request) {
  return request.headers.get("CF-Connecting-IP") || "unknown";
}

async function checkRateLimit(ip, env) {
  const key = `ratelimit:login:${ip}`;
  const kv = env.RATE_LIMIT || env.CONTENT;
  const record = await kv.get(key, "json");

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
  const kv = env.RATE_LIMIT || env.CONTENT;
  const record = await kv.get(key, "json");
  const now = Math.floor(Date.now() / 1000);

  if (!record || (now - record.firstAttempt) > LOCKOUT_WINDOW) {
    await kv.put(key, JSON.stringify({
      count: 1,
      firstAttempt: now,
    }), { expirationTtl: LOCKOUT_WINDOW });
  } else {
    await kv.put(key, JSON.stringify({
      count: record.count + 1,
      firstAttempt: record.firstAttempt,
    }), { expirationTtl: LOCKOUT_WINDOW });
  }
}

async function clearRateLimit(ip, env) {
  const key = `ratelimit:login:${ip}`;
  const kv = env.RATE_LIMIT || env.CONTENT;
  await kv.delete(key);
}

// ─── Auth ───────────────────────────────────────────────────────────

// TOKEN_SECRET is REQUIRED — never reuse the login password as signing key
function getSigningKey(env) {
  if (!env.TOKEN_SECRET) {
    throw new Error("TOKEN_SECRET must be configured. Do not reuse PASSWORD as signing key.");
  }
  return env.TOKEN_SECRET;
}

async function getTokenGeneration(env) {
  return (await env.CONTENT.get(TOKEN_GENERATION_KEY)) || "0";
}

async function createToken(env) {
  const now = Date.now();
  const nonce = crypto.randomUUID();
  const generation = await getTokenGeneration(env);
  const data = `session:${generation}:${nonce}:${now}`;
  const encoder = new TextEncoder();
  const secret = getSigningKey(env);
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  const hex = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
  return `${now}.${generation}.${nonce}.${hex}`;
}

async function verifyToken(token, env) {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 4) return false;
  const [timestampStr, generation, nonce, hex] = parts;
  if (!timestampStr || !generation || !nonce || !hex) return false;

  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp) || Date.now() - timestamp > TOKEN_TTL) return false;

  // Check generation matches current — allows mass revocation
  const currentGen = await getTokenGeneration(env);
  if (generation !== currentGen) return false;

  const secret = getSigningKey(env);
  const data = `session:${generation}:${nonce}:${timestamp}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  const expected = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
  return await timingSafeEqual(hex, expected);
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

      // Strip internal fields for unauthenticated requests
      const token = getToken(request);
      const isAdmin = token ? await verifyToken(token, env) : false;
      if (!isAdmin) {
        const publicData = { ...data };
        delete publicData.slug;
        return json(publicData, 200, request, env);
      }
      return json(data, 200, request, env);
    }

    // ─── POST /api/content ─────────────────────────────────────
    if (path === "/api/content" && request.method === "POST") {
      const authErr = await requireAuth(request, env);
      if (authErr) return authErr;

      // Require JSON content type
      const ct = request.headers.get("Content-Type") || "";
      if (!ct.includes("application/json")) {
        return errorResponse("Content-Type must be application/json", 415, request, env);
      }

      // Reject payloads > 512KB to prevent KV abuse
      const contentLength = parseInt(request.headers.get("Content-Length") || "0", 10);
      if (contentLength > 512 * 1024) {
        return errorResponse("Payload too large. Maximum 512KB.", 413, request, env);
      }

      const rawBody = await request.text();
      if (rawBody.length > 512 * 1024) {
        return errorResponse("Payload too large. Maximum 512KB.", 413, request, env);
      }

      let body;
      try {
        body = JSON.parse(rawBody);
      } catch {
        return errorResponse("Invalid JSON", 400, request, env);
      }

      // Content structure validation
      if (typeof body !== "object" || body === null || Array.isArray(body)) {
        return errorResponse("Content must be a JSON object", 400, request, env);
      }
      if (!body.businessInfo || typeof body.businessInfo !== "object") {
        return errorResponse("Content must include a valid businessInfo object", 400, request, env);
      }
      const unknownKeys = Object.keys(body).filter(k => !ALLOWED_CONTENT_KEYS.has(k));
      if (unknownKeys.length > 0) {
        return errorResponse(`Unknown fields: ${unknownKeys.join(", ")}`, 400, request, env);
      }

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

      // Reject oversized login payloads (defense-in-depth)
      const loginLength = parseInt(request.headers.get("Content-Length") || "0", 10);
      if (loginLength > 4096) {
        return errorResponse("Payload too large", 413, request, env);
      }

      let password;
      try {
        const body = await request.json();
        password = body.password;
      } catch {
        return errorResponse("Invalid request", 400, request, env);
      }

      if (!password || !await timingSafeEqual(password, env.PASSWORD)) {
        await recordFailedAttempt(ip, env);
        return errorResponse("Invalid password", 401, request, env);
      }

      // Success — clear rate limit record
      await clearRateLimit(ip, env);
      const token = await createToken(env);
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
      if (!MIME_TO_EXT[file.type]) {
        return errorResponse("Invalid file type. Allowed: JPG, PNG, WebP, GIF", 400, request, env);
      }

      // 5MB limit
      if (file.size > 5 * 1024 * 1024) {
        return errorResponse("File too large. Maximum 5MB.", 400, request, env);
      }

      // Derive extension from validated MIME type — not user-provided filename
      const ext = MIME_TO_EXT[file.type];
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

    // ─── POST /api/invalidate-sessions ─────────────────────────
    if (path === "/api/invalidate-sessions" && request.method === "POST") {
      const authErr = await requireAuth(request, env);
      if (authErr) return authErr;
      const current = parseInt(await getTokenGeneration(env) || "0", 10);
      await env.CONTENT.put(TOKEN_GENERATION_KEY, String(current + 1));
      return json({ ok: true, message: "All sessions invalidated" }, 200, request, env);
    }

    return errorResponse("Not found", 404, request, env);
  },
};
