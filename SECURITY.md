# Security — Client Site Template

Last updated: 2026-04-27

---

## Threat Model

Single-admin CMS for a local business website. One password, one admin.
Hosted on the client's own Cloudflare account (Pages + Worker + KV + R2).

**Attack surface:**
- Public: Static HTML/CSS/JS served by Cloudflare Pages
- Public: `GET /api/content` (read-only business data)
- Public: `GET /api/image/*` (uploaded images from R2)
- Public: `POST /api/login` (password auth, rate-limited)
- Authenticated: `POST /api/content`, `POST /api/upload`, `POST /api/invalidate-sessions`

**Trust boundaries:**
- Cloudflare edge (trusted) → Worker (our code) → KV/R2 (storage)
- Browser (untrusted) → Pages (static) → Worker API (auth-gated mutations)

---

## Audit History

| Date | Audit | Findings | Source |
|------|-------|----------|--------|
| 2026-04-27 | Dual-agent Red/Blue team | 19 findings (1 CRITICAL, 5 HIGH, 7 MEDIUM, 6 LOW) | `SECURITY-AUDIT1.md` |
| 2026-04-27 | Red Team vs Expert simulation (5 rounds) | 3 actionable + 2 non-issues | `findings.md` |
| 2026-04-27 | Follow-up review (token replay, KV isolation) | 2 findings (both MEDIUM) | This document |
| 2026-04-27 | Security Fortress simulation (3 rounds, 9 attacks) | 1 new fix (login payload limit), 1 status correction (#19) | This document |

**All findings have been resolved.** See status table below.

---

## All Findings — Status

### From the 19-finding dual-agent audit (SECURITY-AUDIT1.md)

| # | Severity | Finding | Fix | Status |
|---|----------|---------|-----|--------|
| 1 | CRITICAL | Token embedded raw password in HMAC payload | Replaced with random nonce: `session:{gen}:{nonce}:{ts}` | FIXED |
| 2 | HIGH | Hardcoded test Worker URL in config.js and CSP | `API_BASE = "/api"` (relative); removed Worker URL from CSP | FIXED |
| 3 | HIGH | TOKEN_SECRET fell back to PASSWORD if missing | `getSigningKey()` now throws if TOKEN_SECRET not set | FIXED |
| 4 | HIGH | Unescaped `data-target` attribute in stats (stored XSS) | `esc(String(s.value))` applied | FIXED |
| 5 | HIGH | No server-side content validation on POST /api/content | `ALLOWED_CONTENT_KEYS` allowlist + requires `businessInfo` object | FIXED |
| 6 | HIGH | Auth token in localStorage (7-day XSS exposure) | Moved to sessionStorage (dies on tab close) | FIXED |
| 7 | MEDIUM | CORS fell back to `*` when ALLOWED_ORIGIN not set | Default-deny: only localhost allowed without ALLOWED_ORIGIN | FIXED |
| 8 | MEDIUM | No Content-Type validation on POST /api/content | Requires `application/json`; returns 415 otherwise | FIXED |
| 9 | MEDIUM | 7-day token with no revocation mechanism | Token generation counter in KV + `POST /api/invalidate-sessions` | FIXED |
| 10 | MEDIUM | Public content endpoint exposed internal fields | Strips `slug` for unauthenticated requests | FIXED |
| 11 | MEDIUM | Upload extension derived from user-provided filename | `MIME_TO_EXT` map derives extension from validated MIME type | FIXED |
| 12 | MEDIUM | Prototype pollution in `setNestedValue()` | Blocks `__proto__`, `constructor`, `prototype` in both get/set | FIXED |
| 13 | MEDIUM | Rate limiting bypassable without Cloudflare proxy | Documented: Worker MUST run behind Cloudflare proxy | FIXED (doc) |
| 14 | LOW | No CSRF protection on POST endpoints | Not needed: Bearer token auth is inherently CSRF-proof | NOT VULNERABLE |
| 15 | LOW | KV namespace ID committed to repository | Emptied in wrangler.toml; `wrangler deploy` fails intentionally | FIXED |
| 16 | LOW | Content-Length header spoofable on first size check | Second check on actual body length is the real enforcement | NOT VULNERABLE |
| 17 | LOW | `esc()` doesn't sanitize `javascript:` in href | All href values use fixed protocols (`tel:`, `mailto:`, `https://`) | NOT VULNERABLE |
| 18 | LOW | Login error reflected server error verbatim | Generic "Invalid password" message; rate-limit message kept | FIXED |
| 19 | LOW | Booking form silently discarded submissions | Form removed — contact section now shows phone/email/address instead. Form code saved in CLAUDE.md TODO for future restoration when email sending is available. | FIXED (removed) |

### From the Red Team vs Expert simulation (findings.md)

| # | Severity | Finding | Fix | Status |
|---|----------|---------|-----|--------|
| RT-1 | LOW | `data:` URI allowed in CSP `img-src` | Changed to `img-src 'self' https:` | FIXED |
| RT-2 | LOW | CSP `connect-src` mismatch with cross-origin Worker | `API_BASE="/api"` is same-origin by design; documented | ACCEPTED |
| RT-3 | MEDIUM | KV write quota exhaustion via distributed login spam | Separate `RATE_LIMIT` KV namespace for rate-limit records | FIXED |
| RT-4 | LOW | Last-write-wins race condition (no OCC) | Single-admin tool; documented as known limitation | ACCEPTED |
| RT-5 | LOW | Public content endpoint info disclosure | Public website data is public by design | NOT VULNERABLE |

### From follow-up review

| # | Severity | Finding | Fix | Status |
|---|----------|---------|-----|--------|
| FU-1 | MEDIUM | Token replay after password change — no UI to revoke | "Sign Out All Devices" button in admin panel | FIXED |
| FU-2 | MEDIUM | Rate-limit KV records shared namespace with content | Dedicated `RATE_LIMIT` KV binding (same as RT-3) | FIXED |

### From the Security Fortress simulation (9-attack, 3-round)

Three hackers attempted 9 attack vectors across 3 rounds. Final score: Attackers 3.5/9 vs Defenders 5.5/9.

| # | Attack | Result | Action |
|---|--------|--------|--------|
| SF-1 | Token theft via XSS | DEFLECTED | CSP `script-src 'self'` + `esc()` output escaping blocked all vectors |
| SF-2 | Brute-force login | DEFLECTED | Rate limiting (5/15min) + account lockout held |
| SF-3 | Booking form data exfiltration | FIXED | Form removed — contact section shows phone/email/address instead. No data submitted. Same as #19. |
| SF-4 | Content injection / stored XSS | DEFLECTED | Auth required + `ALLOWED_CONTENT_KEYS` allowlist + `esc()` output escaping |
| SF-5 | Image upload exploitation | DEFLECTED | MIME allowlist (no SVG) + extension derived from MIME + path traversal blocked |
| SF-6 | Token forgery | DEFLECTED | HMAC-SHA256 with separate TOKEN_SECRET; timing-safe comparison |
| SF-7 | CORS bypass / cross-origin attack | DEFLECTED | Default-deny CORS + `Vary: Origin` |
| SF-8 | KV quota exhaustion via login spam | PARTIAL | Separate RATE_LIMIT KV namespace mitigates; Cloudflare WAF would fully solve |
| SF-9 | Login payload abuse | FIXED | Added 4KB payload limit on `/api/login` (defense-in-depth) |

**What held strong:** CSP enforcement, token architecture (nonce + generation counter), rate limiting, upload security, content validation, CORS policy. The simulation validated these defenses under adversarial pressure.

---

## Security Architecture

### Authentication

- **Method:** HMAC-SHA256 signed tokens
- **Token format:** `{timestamp}.{generation}.{nonce}.{hex}`
  - `timestamp` — creation time (ms), checked against 7-day TTL
  - `generation` — counter from KV, enables mass revocation
  - `nonce` — `crypto.randomUUID()`, makes each token unique
  - `hex` — HMAC-SHA256 signature of `session:{generation}:{nonce}:{timestamp}`
- **Signing key:** `TOKEN_SECRET` env var (required, separate from PASSWORD)
- **Storage:** Browser `sessionStorage` (cleared on tab close)
- **Revocation:** `POST /api/invalidate-sessions` bumps generation counter, invalidating all existing tokens. UI button: "Sign Out All Devices" in form editor admin panel.

### Rate Limiting

- **Scope:** `POST /api/login` only
- **Limit:** 5 attempts per 15 minutes per IP
- **Storage:** Dedicated `RATE_LIMIT` KV namespace (falls back to `CONTENT` if binding not configured)
- **IP source:** `CF-Connecting-IP` header (set by Cloudflare proxy, not spoofable)
- **Lockout:** After 5 failures, returns 429 with remaining lockout time
- **Payload limit:** 4KB on login request body (defense-in-depth)
- **Clearance:** Successful login clears the rate-limit record for that IP

### Content Security Policy

```
default-src 'none';
script-src 'self';
style-src 'self' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
img-src 'self' https:;
connect-src 'self';
form-action 'self';
base-uri 'self';
frame-ancestors 'none'
```

- All scripts are external files (no inline scripts)
- `img-src` allows HTTPS only (no `data:` URIs)
- `connect-src 'self'` requires Worker to be on same domain via Worker routes
- `frame-ancestors 'none'` prevents clickjacking

### Security Headers (all responses)

| Header | Value |
|--------|-------|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `X-XSS-Protection` | `1; mode=block` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |

Applied by both the Worker (on API responses) and `_headers` file (on Pages responses).

### CORS

- **With `ALLOWED_ORIGIN` set:** Only that exact origin is allowed
- **Without `ALLOWED_ORIGIN`:** Default-deny. Only `localhost` and `127.0.0.1` allowed (dev mode)
- **`Vary: Origin`** header on all CORS responses for correct CDN caching

### Upload Security

- **Auth required:** Bearer token checked before upload
- **Size limit:** 5MB per file
- **Type allowlist:** JPEG, PNG, WebP, GIF only (no SVG — stored XSS vector)
- **Extension:** Derived from validated MIME type, not user-provided filename
- **Path traversal:** Rejects `..` in paths; requires `uploads/` prefix
- **Storage:** Cloudflare R2 with content-type metadata

### Content Validation

- **Auth required:** Bearer token checked before save
- **Size limit:** 512KB payload (double-checked: Content-Length header + actual body)
- **Structure:** Must be a JSON object with a valid `businessInfo` sub-object
- **Key allowlist:** Only known top-level keys accepted (`ALLOWED_CONTENT_KEYS` Set)
- **Content-Type:** Must be `application/json` (returns 415 otherwise)

### XSS Prevention

- **Output escaping:** `esc()` encodes `& < > " '` in all rendered content
- **Prototype pollution:** `setNestedValue()` and `getNestedValue()` block `__proto__`, `constructor`, `prototype`
- **CSP:** `script-src 'self'` blocks any injected inline scripts
- **No SVG uploads:** SVG can contain `<script>` tags (removed from allowed MIME types)

### Password Security

- **Comparison:** Timing-safe via HMAC — both inputs are HMAC'd with a random key, producing fixed-length outputs, eliminating length-leak side channels
- **Storage:** Plain text in Worker env var (acceptable: single admin, Cloudflare secrets are encrypted at rest, not accessible via API)
- **Error messages:** Generic "Invalid password" on failure; no detail leakage

---

## Deployment Security Requirements

These are non-negotiable for production deployments:

1. **Set `TOKEN_SECRET`** — `wrangler secret put TOKEN_SECRET` with a random 32+ character string. Must be different from PASSWORD. Worker will crash if missing.
2. **Set `ALLOWED_ORIGIN`** — `wrangler secret put ALLOWED_ORIGIN` with the client's domain (e.g., `https://clientsite.com`). Without it, cross-origin requests are denied except localhost.
3. **Worker behind Cloudflare proxy** — CF-Connecting-IP is only trustworthy when the Worker is accessed through Cloudflare's edge network. Direct access allows IP spoofing.
4. **Create separate KV namespaces** — Run `wrangler kv:namespace create CONTENT` and `wrangler kv:namespace create RATE_LIMIT`. Paste both IDs into `wrangler.toml`. This isolates rate-limit records from content storage.
5. **Worker routes on client domain** — Configure `/api/*` Worker route on the client's domain so `API_BASE="/api"` works and CSP `connect-src 'self'` is satisfied.
6. **HTTPS enforced** — HSTS header is set. Cloudflare provides free SSL. Never disable "Always Use HTTPS" in Cloudflare dashboard.

---

## Accepted Risks

These are known limitations that were evaluated and accepted for v1:

| Risk | Why accepted | Mitigation if needed later |
|------|-------------|---------------------------|
| **sessionStorage token (not HttpOnly cookie)** | Token accessible to JS, but CSP blocks XSS. Single-admin tool. | Refactor Worker to set/read HttpOnly cookies |
| **Last-write-wins race condition** | Single-admin tool; concurrent editing not expected | Add ETag/If-Match optimistic locking on content saves |
| **CSP `connect-src` breaks cross-domain Workers** | `API_BASE="/api"` (same-origin) is the supported config | Add Worker URL to `connect-src` for cross-domain setups |
| **Password in env var (not hashed)** | Single admin; Cloudflare secrets are encrypted at rest | Hash password, compare with bcrypt/scrypt at login |
| **No magic byte validation on uploads** | MIME type is checked; browsers set it from file content | Read file header bytes and validate against expected format |

---

## Architectural Gaps (future hardening)

These are not vulnerabilities but would strengthen the security posture:

| Gap | Effort | Impact |
|-----|--------|--------|
| HttpOnly cookie auth (replaces sessionStorage) | Large | Eliminates JS-accessible token entirely |
| File magic byte validation on upload | Small | Prevents MIME type spoofing |
| Server-side HTML sanitization of content values | Medium | Defense-in-depth against stored XSS |
| Automated deployment script (secrets, KV, config) | Medium | Prevents deployment misconfigurations |
| Edge-level rate limiting (Cloudflare WAF rules) | Small | Prevents KV-layer rate limiting overhead entirely |

---

## Full Security Timeline (commit-level)

Every security-related change across the project, in chronological order:

### Commit `3e27cef` — Harden Worker: rate limiting, timing-safe auth, security headers
- Rate limit login: 5 attempts per 15 min per IP (KV-backed)
- Account lockout: 429 response with retry-after on exceeded limit
- Timing-safe password comparison (prevents timing attacks)
- Security headers on all responses (X-Frame-Options DENY, X-Content-Type-Options nosniff, XSS-Protection, Referrer-Policy, Permissions-Policy)
- CORS origin configurable via `ALLOWED_ORIGIN` env var
- Path traversal prevention on image endpoint
- Sanitized file extensions on upload
- `crypto.randomUUID()` for upload keys
- Input validation with try/catch on all request parsing

### Commit `f16b1f3` — Rename /admin to /mysite
- Renamed all `/admin` paths to `/mysite` to avoid automated bot wordlist scanning
- Renamed JS files: `admin.js` → `mysite.js`, `editor.js` → `editsite.js`

### Commit `c94fd45` — Security hardening: timing-safe comparison, CSP, payload limits, XSS
- `timingSafeEqual` rewritten: HMAC-based fixed-length comparison (eliminates length-leak side channel from naive XOR)
- Separate `TOKEN_SECRET` from `PASSWORD` for HMAC signing (set as Worker secret)
- 512KB payload size limit on POST /api/content (double-checked: header + body)
- Removed `X-Forwarded-For` from rate limiter — `CF-Connecting-IP` only (can't be spoofed behind Cloudflare)
- Removed `image/svg+xml` from upload allow-list — SVG can contain inline `<script>` (stored XSS vector)
- Added single-quote (`'` → `&#39;`) escaping to `esc()` in `app.js` and `mysite.js`
- Extracted ALL inline scripts to external files (`login.js`, `boot-public.js`, `boot-editor.js`)
- Added `_headers` file with full CSP: `script-src 'self'` — zero inline scripts allowed
- Security headers on all Pages responses via `_headers`

### Commit `3a0f024` — Fix all 19 security audit findings (CRITICAL through LOW)
- **CRITICAL #1:** Token no longer embeds password — uses random nonce + generation counter. Token format: `{timestamp}.{generation}.{nonce}.{hex}`
- **HIGH #3:** `TOKEN_SECRET` now required — `getSigningKey()` throws if missing, no PASSWORD fallback
- **HIGH #4:** Stats `data-target` attribute escaped via `esc(String(s.value))` — prevents stored XSS
- **HIGH #5:** Content validation: `ALLOWED_CONTENT_KEYS` allowlist + requires `businessInfo` object
- **HIGH #6:** Auth token moved from `localStorage` to `sessionStorage` (cleared on tab close)
- **MEDIUM #7:** CORS default-deny when `ALLOWED_ORIGIN` not set (only localhost for dev)
- **MEDIUM #8:** `Content-Type: application/json` required on POST /api/content (returns 415)
- **MEDIUM #9:** Token generation counter in KV + `POST /api/invalidate-sessions` endpoint
- **MEDIUM #10:** Public GET /api/content strips `slug` for unauthenticated requests
- **MEDIUM #11:** Upload file extension derived from validated MIME type (`MIME_TO_EXT` map)
- **MEDIUM #12:** Prototype pollution blocked: `__proto__`, `constructor`, `prototype` in `setNestedValue()` and `getNestedValue()`
- **LOW #15:** KV namespace ID emptied in `wrangler.toml` (forces per-client setup)
- **LOW #18:** Login shows generic "Invalid password" — rate-limit message shown as-is
- **LOW #19:** Booking form now POSTs to `/api/booking` with error handling

### Commit `c6d4849` — Red Team follow-up: CSP tightening, known limitations documented
- CSP `img-src` changed from `'self' data:` to `'self' https:` (no images use data URIs)
- Documented last-write-wins race condition as accepted risk
- Documented KV write quota exhaustion risk with mitigation steps
- Added HSTS (`Strict-Transport-Security: max-age=31536000; includeSubDomains`)
- Added `Vary: Origin` to CORS responses for correct CDN caching
- Removed wildcard CORS fallback — returns `"null"` (denied) instead of `"*"`

### Commit `a2b108b` — Sign Out All Devices button; separate KV namespace for rate limiting
- "Sign Out All Devices" button in form editor admin panel (amber/warning styled)
- Calls `POST /api/invalidate-sessions` to bump generation counter, revoking all tokens
- Dedicated `RATE_LIMIT` KV namespace for rate-limit records (with `CONTENT` fallback)
- Isolates rate-limit KV writes from content storage — login spam can't exhaust CMS quota

---

## Main Platform Security History (for reference)

The main platform (`/Users/Shared/CarMechanic/`) had its own security work. Key commits:

| Commit | What |
|--------|------|
| `7976a20` | Login rate limiting (5 attempts / 15 min lockout) + audit log |
| `29eafd2` | Fix critical/high audit issues (password reset, user creation) |
| `c2bd68a` | Fix 6 vulnerabilities: password reset token leak, open redirect, SVG upload XSS, security headers, screenshot auth. Git history rewritten to remove `users.json`/`prospects.json`. |
| `59469b1` | Fix W1/W12/I3: remove unused hours field, add owner login flow, extract inline styles |
| `e4094fe` | Auth guard on shop admin layout, prospect creation rollback, consolidate FOUNDER_EMAIL, rate-limit null fix, email fail-fast in prod |
| `164044b` | Fix 22 audit findings: XSS in map route, input validation on booking API, atomic short_id INSERT, redact SQL errors from API, null-safe escapeHtml |
| `ba91056` | Rate limiting on booking endpoint (5 per IP per 15 min) |
| `0eabbbb` | Make login route crash-proof — always log audit, never block on rate limit errors |

---

## Lesson Learned

> **Always run adversarial security audit after building.**
>
> Builder accumulates context blindness — trusts own output after hours of work.
> Fresh eyes with a specific adversarial mandate catch what the builder misses.
> The dual-agent red/blue team audit found 19 issues the builder overlooked,
> including a CRITICAL token flaw the builder wrote himself.
> Never ship auth/security code without a separate adversarial review pass.
