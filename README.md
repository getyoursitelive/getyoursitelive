# Client Site Template

Standalone website for a local business. Runs entirely on the client's own
**free** Cloudflare account — no ongoing dependency on the builder.

## What's included

```
site/                Static public site + admin pages
  index.html         Public homepage
  admin/login.html   Password login
  admin/index.html   12-tab form editor
  admin/edit.html    Inline WYSIWYG editor
  css/               themes.css, styles.css, admin.css
  js/                app.js (renderer), editor.js (inline), admin.js (form)

worker/              Cloudflare Worker API (~5KB)
  src/index.js       Content CRUD + image upload + auth
  wrangler.toml      Worker config (KV + R2 bindings)

sample-content.json  Demo content (auto repair shop)
```

## Architecture

- **Cloudflare Pages** (free) — serves the static HTML/CSS/JS
- **Cloudflare Worker** (free tier: 100K req/day) — tiny API for content saves + image uploads
- **Cloudflare KV** (free tier: 100K reads/day, 1K writes/day) — stores business content as one JSON blob
- **Cloudflare R2** (free tier: 10GB storage, 10M reads/month) — stores uploaded images

A local business editing their site a few times a week will use <1% of all free tier limits.

## Setup on client's Cloudflare account

### Prerequisites

- Node.js 18+
- `npm install -g wrangler`
- A free Cloudflare account (the client's, not yours)

### 1. Authenticate

```bash
wrangler login
```

This opens the browser to authorize wrangler on the client's Cloudflare account.

### 2. Create KV namespace

```bash
wrangler kv namespace create CONTENT
```

Copy the `id` from the output and paste it into `worker/wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "CONTENT"
id = "paste-the-id-here"
```

### 3. Create R2 bucket

```bash
wrangler r2 bucket create site-uploads
```

### 4. Set the admin password

```bash
cd worker
wrangler secret put PASSWORD
```

Type the password when prompted. This is what the client uses to log in at `/admin/login`.

### 5. Seed the content

```bash
wrangler kv key put --binding CONTENT "business" --path ../sample-content.json
```

Edit `sample-content.json` first with the client's actual business info (name, phone, address, services, etc.), or seed it and let the client edit via the admin.

### 6. Deploy the Worker

```bash
cd worker
wrangler deploy
```

Note the Worker URL (e.g. `https://site-api.clientname.workers.dev`).

### 7. Update site to point to Worker API

The site JS fetches from `/api/content` (relative path). When Pages and the Worker are on the same domain via routes, this works automatically. If they're on different domains, set the `API_BASE` in `site/js/app.js` and `site/js/editor.js`.

### 8. Deploy the static site to Pages

```bash
cd site
wrangler pages project create client-site
wrangler pages deploy . --project-name client-site
```

### 9. Configure Worker routes (connect API to Pages domain)

In the Cloudflare dashboard:
1. Go to the Pages project → Custom Domains → add the client's domain
2. Go to Workers & Pages → the Worker → Settings → Triggers → Routes
3. Add a route: `clientdomain.com/api/*` → `site-api` Worker

This makes `/api/content`, `/api/upload`, etc. work on the same domain as the site.

### 10. (Optional) Add custom domain

In the Cloudflare dashboard:
1. Transfer or add the client's domain to their Cloudflare account
2. Pages → Custom Domains → add it
3. Worker route on that domain for `/api/*`

## Local development

### Run the Worker locally

```bash
cd worker
wrangler dev
```

This starts the Worker at `http://localhost:8787` with local KV and R2.

Seed local KV:

```bash
wrangler kv key put --binding CONTENT "business" --path ../sample-content.json --local
```

### Serve the static site locally

```bash
cd site
npx serve .
```

Or use any static file server. The site will try to fetch `/api/content` from the same origin. For local dev, you'll need to either:

- Use a proxy that routes `/api/*` to the Worker (port 8787) and everything else to the static server
- Or temporarily set `API_BASE = "http://localhost:8787"` in app.js

## Editing features

### Inline editor (`/admin/edit`)
- Click any text to edit it (headline, descriptions, phone, address, etc.)
- Hover images for Upload/Replace/Remove controls
- Section visibility toggles (show/hide any section)
- Reorder and add/remove list items (services, FAQs, team, etc.)
- Auto-saves every change (800ms debounce)

### Form editor (`/admin/`)
- 12 tabs matching the site sections
- Add/remove/reorder all list items
- All fields with proper labels
- Explicit "Save Changes" button

### Themes
Four built-in themes selectable from the Identity tab:
- **modern** — warm off-white, deep teal, Fraunces serif
- **industrial** — dark, orange accent, Chakra Petch
- **luxury** — black/gold
- **friendly** — cream/coral

## Handover checklist

When handing the site to the client:

- [ ] Client has their own Cloudflare account
- [ ] Domain transferred/added to their account
- [ ] KV namespace created and ID in wrangler.toml
- [ ] R2 bucket created
- [ ] PASSWORD secret set (give client the password)
- [ ] Content seeded (their business info)
- [ ] Worker deployed
- [ ] Pages deployed
- [ ] Worker route configured for `/api/*` on their domain
- [ ] Custom domain added to Pages
- [ ] SSL certificate active (Cloudflare handles this automatically)
- [ ] Test: public site loads, login works, editing works, image upload works
- [ ] Give client their password and show them the admin

After handover, the client's site runs independently. No server to maintain, no database to manage, no monthly fees. They edit their own content, upload their own images, and Cloudflare handles hosting, CDN, and SSL for free.
