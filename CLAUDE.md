# Project: Standalone Client Site Template

## What this is

A standalone website package for local businesses. Runs entirely on the
client's own **free** Cloudflare account (Pages + Worker + KV + R2) with
**zero dependency** on the main platform (`getyoursitelive.com`).

This is NOT the main Next.js platform. This is what gets handed to each
client after the $500 sale so their site runs forever with no monthly fees.

## How this relates to the main platform

| | Main Platform (CarMechanic) | Client Template (this repo) |
|---|---|---|
| **Stack** | Next.js 16 + React 19 + D1 | Static HTML/CSS/JS + Worker |
| **Database** | Cloudflare D1 (SQLite, 650+ rows) | Cloudflare KV (one JSON blob) |
| **Images** | Cloudflare R2 (shared bucket) | Cloudflare R2 (client's own bucket) |
| **Auth** | JWT session cookies via jose | HMAC-SHA256 tokens in sessionStorage |
| **Hosting** | Cloudflare Pages (our account) | Cloudflare Pages (client's account) |
| **Editor** | React components, server actions | Vanilla JS, data-attribute-driven |
| **Templates** | `src/lib/templates/` (6 verticals) | Content in `sample-content.json` |
| **Purpose** | Manage all businesses centrally | One business, fully independent |

**The main platform is where we build and preview sites for prospects.
The client template is what we deploy when they pay.**

## Architecture

```
site/                    Static site (Cloudflare Pages)
  index.html             Public site entry
  admin/
    index.html           Form-mode admin (12 tabs)
    edit.html            Inline WYSIWYG editor
    login.html           Login page
  css/
    themes.css           Theme variables (4 themes)
    styles.css           All site + edit-mode styles
  js/
    config.js            API_BASE URL (change per client)
    app.js               Site renderer — data-driven with data-edit attributes
    editor.js            Inline editor — discovers editable elements via data attributes
    admin.js             Form editor — 12-tab admin panel

worker/                  Cloudflare Worker API (~6KB)
  src/index.js           6 endpoints: content CRUD, login, upload, auth check, image serve
  wrangler.toml          Worker config (KV + R2 bindings)

sample-content.json      Demo content (auto repair shop)
```

**Zero npm dependencies in the site. Worker has no node_modules.**

## Data-driven inline editor

The inline editor (`editor.js`) uses ZERO hardcoded selectors. All editing
is declared via HTML attributes in `app.js`:

| Attribute | Purpose | Example |
|-----------|---------|---------|
| `data-edit="json.path"` | Click-to-edit text | `data-edit="hero.headline"` |
| `data-edit-image="json.path"` | Upload/replace image | `data-edit-image="hero.heroImage"` |
| `data-edit-list="json.path"` | Add/remove list items | `data-edit-list="hero.whyBullets"` |
| `data-list-template="..."` | Default for new items | `data-list-template='{"name":"New"}' ` |
| `data-visibility="key"` | Section show/hide toggle | `data-visibility="showStats"` |

**Adding a new editable element = add the attribute in app.js. No editor.js changes.**

This scales to any number of verticals/templates without editor modifications.

## Important patterns

### SVG + text in contenteditable
Never put `contenteditable` on an element that contains an SVG icon.
Wrap the text in a `<span data-edit="path">` sibling to the icon:
```html
<li>${ICONS.shield} <span data-edit="hero.whyBullets.0">Bullet text</span></li>
```

### Dynamic content re-binding
Service tabs and testimonial carousel replace innerHTML, destroying
contenteditable bindings. `app.js` fires callbacks after replacement:
```javascript
window.onServiceTabChange = () => { /* editor re-binds */ };
window.onTestimonialChange = () => { /* editor re-binds */ };
```

### Edit mode guards
Stats counter animation and testimonial auto-advance are disabled when
`#app` has the `.edit-mode` class — they would overwrite editable content.

### Cache busting
All `<script>` and `<link>` tags use `?v=N` query params. Bump the
version in ALL HTML files when changing JS or CSS.

## Auth

- HMAC-SHA256 with 7-day TTL
- Token stored in sessionStorage (dies on tab close; acceptable for single-admin tool)
- Worker validates token on every mutation endpoint
- Single admin password per site (set via `wrangler secret put PASSWORD`)

## Deployment

Per-client deployment requires:
1. `site/js/config.js` — set `API_BASE` to client's Worker URL
2. `worker/wrangler.toml` — set KV namespace ID and R2 bucket name
3. Worker secrets — `PASSWORD`, `JWT_SECRET`
4. Seed `sample-content.json` to KV
5. Deploy Worker + Pages to client's Cloudflare account
6. Configure Worker routes for `/api/*` on client's domain

See `README.md` for full step-by-step setup guide.

## Run scripts

```bash
# Worker (local dev)
cd worker && wrangler dev

# Static site (local dev)
cd site && npx serve .

# Deploy worker
cd worker && wrangler deploy

# Deploy site
cd site && wrangler pages deploy . --project-name client-site
```

## Known issues / TODO

### Security

All security findings resolved. See **`SECURITY.md`** for full audit history, architecture, deployment requirements, and accepted risks.

Raw audit docs: `SECURITY-AUDIT1.md` (19-finding dual-agent audit), `findings.md` (Red Team vs Expert simulation).

### Code quality
- [ ] `esc()`, `getNestedValue()`, `setNestedValue()` duplicated across app.js, editsite.js, mysite.js — extract to shared utils.js
- [ ] Luxury and Friendly themes are bare bones — need polish

### Features
- [ ] Per-client config.js generation (automate Worker URL injection)
- [ ] Favicon + meta tags missing from HTML files
- [ ] No image cropping/resizing on upload
- [ ] Automate the platform → client export pipeline
- [ ] Test full end-to-end deployment on a real client's Cloudflare account

---

# Decisions Made

| Date | Decision | Reason |
|------|----------|--------|
| 2026-04-27 | Data-driven editor via data attributes | Scales to unlimited verticals without editor.js changes |
| 2026-04-27 | Wrap text in spans next to SVG icons | contenteditable on parent breaks SVG rendering |
| 2026-04-27 | Skip stats animation in edit mode | Counter animation overwrites contenteditable text |
| 2026-04-27 | Pause testimonial auto-advance in edit mode | innerHTML replacement destroys edit bindings |
| 2026-04-27 | sessionStorage for auth tokens (not cookies) | Simpler Worker; token dies on tab close; acceptable risk for admin-only tool |
| 2026-04-27 | Always run adversarial security audit after building | Builder accumulates context blindness — trusts own output after hours of work. Fresh eyes with a specific adversarial mandate catch what the builder misses. The dual-agent red/blue team audit found 19 issues the builder overlooked, including a CRITICAL token flaw the builder wrote himself. |
| 2026-04-27 | KV not D1 for storage | One JSON blob per site; no relational needs; KV is simpler |
| 2026-04-27 | Zero npm deps in site | Client gets plain files; no build step; nothing to break |

# What We've Tried and FAILED

| Date | What | Why it failed |
|------|------|---------------|
| 2026-04-27 | contenteditable on elements with SVG children | Editing tries to modify the SVG; text cursor jumps; breaks rendering |
| 2026-04-27 | Hardcoded CSS selectors in editor.js | Broke every time app.js markup changed; didn't scale to new verticals |
| 2026-04-27 | CSS `[data-editable]` selector for edit styles | System was refactored to use `[data-edit]` attributes; old selector stopped matching |

---

# Change Log

## 2026-04-27 — Data-driven editor refactor + full audit

### Editor refactor
- Rewrote `editor.js` from ~700 lines of hardcoded selectors to ~350 lines of data-driven code
- 4 core functions: `bindAllEditable()`, `bindAllImages()`, `bindAllLists()`, `bindAllVisibility()`
- Zero hardcoded selectors — editor discovers elements via `data-edit`, `data-edit-image`, `data-edit-list`, `data-visibility` attributes

### app.js rewrite
- Added `E(path)` / `EI(path)` helper functions for consistent data-attribute generation
- Every text element now has `data-edit="json.path"` attribute
- SVG+text conflicts fixed: text wrapped in dedicated `<span>` elements
- Stats animation + testimonial auto-advance disabled in edit mode
- Footer, topbar, emergency, FAQ, pricing all fully editable

### Bug fixes
- CSS `[data-editable]` selectors updated to `[data-edit]` (selector mismatch after refactor)
- Mojibake in admin.js comments (4 corrupted Unicode box-drawing lines)
- Cache bust v5 → v6 on all HTML file resources

### New files
- `CLAUDE.md` — project instructions and context
- `AUDIT.md` — full codebase audit (security, format, logic, layout)
- `.gitignore` — standard ignores for Cloudflare/Node projects
