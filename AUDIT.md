# Client Template — Codebase Audit

**Date:** 2026-04-27
**Scope:** Full audit of `/Users/Shared/client-template/` — format, security, logic, layout, architecture.

---

## Architecture Overview

```
client-template/
  site/                    Static site (Cloudflare Pages)
    index.html             Public site entry
    admin/
      index.html           Form-mode admin (12 tabs)
      edit.html            Inline WYSIWYG editor
      login.html           Login page
    css/
      themes.css           Theme variables (industrial, modern, luxury, friendly)
      styles.css           All site + edit-mode styles (~1100 lines)
    js/
      config.js            API_BASE URL (must change per client)
      app.js               Site renderer (~32KB) — data-driven with data-edit attributes
      editor.js            Inline editor (~12KB) — discovers editable elements via data attributes
      admin.js             Form editor (~24KB) — 12-tab admin panel
  worker/
    src/index.js           Cloudflare Worker API (~6KB) — 6 endpoints
    wrangler.toml          Worker config (KV + R2 bindings)
  sample-content.json      Demo auto-repair content
  README.md                Setup & deployment guide
```

**Stack:** Static HTML/CSS/JS + Cloudflare Worker + KV (JSON blob) + R2 (images)
**Auth:** HMAC-SHA256 tokens, 7-day TTL, stored in localStorage
**Zero dependencies:** No npm packages in the site. Worker has no node_modules.

---

## Security Assessment

### Acceptable for this use case
- **localStorage tokens** — XSS-vulnerable in theory, but this is an admin tool behind login, not a banking app. HttpOnly cookies would require a more complex Worker setup.
- **CORS `Access-Control-Allow-Origin: *`** — The Worker is a standalone API. Since auth is token-based (not cookie-based), open CORS doesn't grant unauthenticated access. Fine for a single-tenant site.

### Should fix before scaling
| Issue | Severity | Location | Fix |
|-------|----------|----------|-----|
| Hardcoded test Worker URL | High | `site/js/config.js` | Must change per client deployment — document clearly in handover |
| No rate limiting on login | Medium | `worker/src/index.js` POST `/api/login` | Add Cloudflare rate limiting rule or in-Worker counter (KV-based, e.g. 5 attempts/minute per IP) |
| No CSRF protection | Low | Worker POST endpoints | Not exploitable since auth is Bearer token (not cookie), but consider adding Origin header check |
| Password in KV as plain text | Medium | Worker reads `ADMIN_PASSWORD` from env | Fine for single-admin use; for multi-user, store bcrypt hash |

### Non-issues
- Upload validates file type (image/*) and size (5MB limit)
- Token expiry (7 days) is enforced server-side
- Content is HTML-escaped via `esc()` before rendering

---

## Code Quality

### Duplicated utilities
These functions exist in multiple files:

| Function | app.js | editor.js | admin.js |
|----------|--------|-----------|----------|
| `esc()` (HTML escape) | Yes | No | Yes |
| `getNestedValue()` | No | Yes | Yes |
| `setNestedValue()` | No | Yes | Yes |

**Recommendation:** Extract to a shared `utils.js`. Low priority — total duplication is ~30 lines and the files are independent entry points that can't share state.

### Format issues (FIXED)
- **Mojibake in admin.js comments** — 4 section divider comments had corrupted Unicode box-drawing characters. Fixed: replaced with clean `─` lines.
- **CSS selector mismatch** — `styles.css` used `[data-editable]` for edit-mode hover/focus styles, but the refactored system uses `[data-edit]` attributes. Fixed: updated selectors to `[data-edit]`.

### Code patterns — good
- `app.js` uses `E(path)` / `EI(path)` helper functions to generate data attributes consistently
- `editor.js` is fully data-driven — 4 core functions discover elements by data attributes
- Sections use `data-visibility="key"` for toggle control
- Dynamic content (service tabs, testimonial carousel) has re-binding callbacks
- Stats counter animation disabled in edit mode to prevent overwriting editable values
- Testimonial auto-advance paused in edit mode

---

## Data-Driven Editor Architecture

The inline editor (`editor.js`) uses zero hardcoded selectors. All editing behavior is declared in `app.js` via HTML attributes:

| Attribute | Purpose | Example |
|-----------|---------|---------|
| `data-edit="json.path"` | Click-to-edit text | `data-edit="hero.headline"` |
| `data-edit-image="json.path"` | Upload/replace image overlay | `data-edit-image="hero.heroImage"` |
| `data-edit-list="json.path"` | Add/remove list controls | `data-edit-list="hero.whyBullets"` |
| `data-list-template="..."` | Default value for new list items | `data-list-template="New bullet"` |
| `data-visibility="key"` | Section visible/hidden toggle | `data-visibility="showStats"` |

**Adding a new editable element = add the attribute in app.js. No editor.js changes needed.**

This means:
- New verticals (barber, restaurant, plumber) need zero editor changes
- New sections need zero editor changes
- The editor scales to any number of templates

---

## Layout / Rendering

### Themes
4 themes defined in `themes.css` via CSS custom properties on `[data-theme]`:
- `industrial` — dark bg, orange accent, Chakra Petch
- `modern` — warm off-white, teal accent, Fraunces
- `luxury` — black/gold, Geist (bare bones)
- `friendly` — cream/coral, Geist (bare bones)

### Responsive
- Mobile-first grid layouts
- Hero switches from 2-column to stacked on mobile
- Navigation collapses to hamburger menu
- All font sizes use clamp() or responsive units

### Section order (app.js renderSite)
1. Topbar (address + phone)
2. Header (logo + nav + theme switcher)
3. Hero
4. Stats
5. About (story + why-us cards)
6. Services (tabs + detail)
7. Deals
8. Pricing
9. Team
10. Testimonials
11. FAQ
12. Emergency banner
13. Contact
14. Footer

---

## Deployment Checklist

Per-client deployment requires changing:

1. `site/js/config.js` — set `API_BASE` to the client's Worker URL
2. `worker/wrangler.toml` — set KV namespace ID and R2 bucket name
3. Worker environment variables — `JWT_SECRET`, `ADMIN_PASSWORD`
4. Upload `sample-content.json` to KV as the initial content
5. Deploy Worker via `wrangler deploy`
6. Deploy site to Cloudflare Pages (connect to GitHub or direct upload)
7. Set custom domain in Cloudflare Pages dashboard

---

## Recommendations (priority order)

1. **Per-client config.js generation** — Automate setting the Worker URL during deployment
2. **Rate limit login endpoint** — Add Cloudflare rate limiting rule
3. **Extract shared utils** — `esc()`, `getNestedValue()`, `setNestedValue()` into `utils.js`
4. **Polish luxury + friendly themes** — Currently bare bones
5. **Add favicon + meta tags** — Currently missing from HTML files
