# Site connect — Mint analytics and SEO on any website

Work orders: `WORK_ORDERS.md`. Log: `CHANGELOG.md` (start it with SC-02).

## The user's words (2026-10-27)

> we want to connect different sites to mint analytics and seo. for example for simple seo connect we'll put up a
> code on the script the code comes from our app, and what it does is pre renders seo's for different pages. Like a
> website with no seo, puts a script or our code and we can put up the seo through our seo panel, if they do not have
> access to the code we'll use advanced settings, via cloudflare proxy, and that is how we'll control their analytics
> and seo.

So: a site built anywhere (WordPress, Wix-style hosts, a static site, a React app, a site from an agency) becomes a
Mint **website project**. Its owner edits SEO page by page in the panel and sees visitors in Mint Analytics, without
editing the site again.

## What already exists (don't rebuild it)

| Piece | Where | Reused for |
|---|---|---|
| `track.js`: page views, clicks, custom events, visitors, journeys (WO-19, WO-56) | `routes-public/track.ts`, `library/functions/visitorAnalytics.function.ts` | Analytics on connected sites as it is |
| Tags in `track.js`: GA4/Ads/GTM, Meta, TikTok, LinkedIn, Pinterest, X, Snap, Clarity, Hotjar, verification metas, favicon, Add script code (WO-34, WO-38, SB-30) | `track.ts` `applyTags`, `GET /public/api/site/tags` | As it is. The SEO work adds a `head` step beside it |
| Meta Conversions API / GA4 Measurement Protocol (WO-38) | `serverTracking.function.ts` | As it is |
| Page SEO = AGS VSeo shape, kit SEO model (`/seo`, linked to a kit Pages record), Default SEO (SB-31…33) | `library/siteBuilder/seo.ts` (`withSiteDefaults`, `vseoToPage`…), kit models | The SEO of a connected site's pages. Same editor, same fields |
| `robots.txt` / `sitemap.xml` from published pages + SEO | `public.router.ts` `/site/robots.txt`, `/site/sitemap.xml` | Served on the site's own domain through the proxy or a rewrite |
| Check the site: fetches the live home page and compares tags (WO-38) | `siteCheck.function.ts` | Grows into the connect wizard's detection step |
| Website setup: keys, env names, track.js + page SEO snippets for HTML / React / Next (WO-55) | mint-tenant `app/website-setup`, `website.tools.ts` | The "Code" way of connecting (way 2 below) |
| Project keys `mint_pk_…` (D14) | public API | The script's `data-key` |

## Three ways to connect

| | 1. Script | 2. Code (server) | 3. Proxy (advanced) |
|---|---|---|---|
| Owner does | Pastes one `<script>` line into the site's `<head>` (theme settings, "custom code" box, GTM) | A developer adds our helper to the site's server/build (Next.js, Express, PHP; WordPress plugin later) | Changes one DNS record. No access to the code needed |
| Analytics | Full | Full | Full, and the tracker is served from the site's own domain, so ad blockers miss less |
| SEO is in the HTML the server sends (true pre-render) | **No.** Added in the browser after the page loads | Yes | Yes. Rewritten at the edge on every request |
| Google | Reads it (Google runs JavaScript), but later and less reliably | Yes | Yes |
| Facebook, WhatsApp, LinkedIn, X, Slack link previews; Bing and most other crawlers; AI crawlers | **Don't see it** (they don't run JavaScript) | Yes | Yes |
| robots.txt, sitemap.xml, redirects on the site's domain | No | Through rewrites the developer adds | Yes, served by the proxy |
| Risk to the site | None, since it only adds tags | Low | The proxy sits in front of every request (see "Proxy safety") |

**The honest point for the panel and the website copy:** a script cannot pre-render. It changes the page after it
loads in a browser. That is good enough for Google's main index. It is not enough for link previews or most other
crawlers. "Pre-rendered SEO" is only true for ways 2 and 3. The panel says this in plain words when the owner picks
Script, and the Connect page recommends the Proxy for owners who care about shared links and search beyond Google.

## Decisions

Proposed. Confirm the ones marked *(confirm)* before the work order that needs them.

| # | Decision | Why |
|---|---|---|
| D1 | **A connected site is a `website` project** with `WebsiteSettings.connection = { mode: 'builder' \| 'script' \| 'code' \| 'proxy', siteUrl, hostnames[], origin, status, verifiedAt, lastSeenAt }`. No new project type. | Analytics, Site setup, SEO, Website setup all already work on website projects. |
| D2 | **A connected site's pages are kit Pages records** (`path`, `title`, `status: 'published'`, `source: 'connected'`) with the kit SEO record beside each. They're found, not created by hand (D5). | The SEO editor, Default SEO, robots and sitemap code then work unchanged. |
| D3 | **One head answer for every way:** `GET /public/api/site/head?path=/about&apiKey=…` gives the merged SEO for that path (page SEO → pattern rule → Default SEO) as JSON *and*, with `format=html`, as ready `<head>` tags. Script, server helpers and the proxy all use it. Cached 60 s. | One merge in one place (`withSiteDefaults`). Every way shows the same SEO. |
| D4 | **Mint's SEO wins over the page's own tags only where the owner set something.** An empty field in Mint leaves the site's own tag alone. `<title>`, description, canonical, robots, OG, Twitter and JSON-LD are replaced, not duplicated. | A site that already has decent SEO isn't wiped by an empty panel. |
| D5 | **Pages are found three ways:** the site's own `sitemap.xml`, a shallow crawl from the home page (same host, 500 pages, robots.txt respected), and paths seen in analytics page views. The crawl also records each page's *current* title/description so the panel can show "now on the site" vs "from Mint". | Owners shouldn't type paths. Analytics fills in pages a crawl misses (behind JS). |
| D6 | **Pattern rules** for many pages: `/blog/*` → title `{h1} — Acme Blog`, description `{first paragraph}`. Placeholders are filled from the page's own HTML by the crawl (script/code) or at the edge (proxy). A page's own SEO beats a rule. | Sites with hundreds of posts can't be done page by page. |
| D7 | **Proxy = Cloudflare for SaaS on our own zone + one Worker** (`mint-edge`, its own repo). The customer CNAMEs their hostname to `connect.<our edge domain>`. Cloudflare issues the certificate. The Worker on route `*/*` looks the hostname up and fetches the customer's origin. *(confirm: Cloudflare account and which domain is the edge zone, Q1/Q2)* | Free for the first 100 hostnames, then $0.10/hostname/month. No per-customer Cloudflare account needed. Works whether or not the customer's DNS is on Cloudflare. |
| D8 | **The origin is a hostname, not an IP:** the address the site's host already gives (`acme.netlify.app`, `acme.vercel.app`, `acme.wpengine.com`) or a subdomain the owner points at their host (`origin.acme.com`). The Worker fetches it with `X-Forwarded-Host: www.acme.com`. | Outside Enterprise, a Worker can't set the Host header to something other than the URL it fetches, so the origin must answer on its own name. The wizard tests this before going live. |
| D9 | **Proxy fails open.** If Mint's API is slow (>300 ms) or down, the Worker uses its last cached head answer, else passes the origin's page through untouched. A per-site **Bypass** switch in the panel turns all rewriting off at once. The proxy never breaks a site because Mint is down. | It sits in front of a customer's whole site. |
| D10 | **`www` first; the bare domain by redirect.** Customers CNAME `www`. The bare domain redirects to `www` through their DNS host's redirect, or by flattening where their DNS supports it. *(confirm, Q4)* | Apex proxying through Cloudflare for SaaS needs Enterprise or a DNS host with CNAME flattening / ALIAS. |
| D11 | **Ownership before anything applies:** Script mode is live once page views with the key arrive from the site's hostname. Proxy mode needs Cloudflare's certificate validation and our TXT record (`_mint.www.acme.com = <project id>`). | Nobody can point Mint's SEO or proxy at a domain they don't control. |

## How each way works

### 1. Script

```html
<script src="https://api.mintapp.shop/public/track.js" data-key="mint_pk_…" data-seo></script>
```

- `data-seo` makes `track.js` also fetch `/site/head?path=` for the current path, apply it (D4), and re-apply it on
  client-side navigation (it already hooks `pushState`/`popstate` for page views).
- No `defer` for SEO sites, and as high in `<head>` as the host allows, so Google's renderer sees the tags early.
  Analytics-only sites keep `defer`.
- Existing sites with the old snippet keep working. `data-seo` is opt-in, and the Connect wizard gives the new line.

### 2. Code (server)

Website setup (WO-55) gains a "SEO for every page" step per framework:

- **Next.js**: `generateMetadata` that calls `/site/head?path=` (JSON), plus `robots.ts` / `sitemap.ts` rewrites
  (already in WO-55's snippets).
- **Express / Node**: a 20-line middleware that injects `format=html` into `</head>`.
- **PHP** (cPanel, custom PHP): an `include` that prints the head tags.
- **WordPress plugin** (later, SC-12): settings page for the key, prints the head, turns off its own SEO plugin's
  tags for fields Mint sets.

### 3. Proxy

```
visitor ─▶ www.acme.com (CNAME → connect.<edge domain>)
            │  Cloudflare for SaaS: TLS for www.acme.com, Worker route */*
            ▼
        mint-edge Worker
          1. hostname → site config (Mint API, cached at the edge 60 s; stale up to 24 h if the API is down)
          2. /robots.txt, /sitemap.xml, redirects, /_mint/* (tracker + track endpoint) → answered here
          3. everything else → fetch https://<origin><path> (X-Forwarded-Host, X-Forwarded-For)
          4. text/html 200 only → HTMLRewriter: replace head SEO (D4), fill pattern rules (D6),
             add <script src="/_mint/track.js" data-key>, drop the site's own copy of tags Mint now sets
          5. anything else (images, JS, POST, websockets, 304, non-200) → passed through untouched
```

- **Panel side:** the wizard calls Cloudflare's custom-hostname API (`POST /zones/:zone/custom_hostnames`) with the
  site id as custom metadata, shows the CNAME + validation TXT records, and polls until the certificate is active.
- **Before going live** the wizard fetches 3 pages through the proxy on a preview hostname and compares them with the
  origin (status, size, title). It refuses to switch on if the origin needs its own Host name (D8) or redirects in a loop.
- **Caching:** the Worker never caches pages, so the origin's own caching rules stand. Only Mint's site config and head
  answers are cached. Cookies, `Set-Cookie`, `Cache-Control` and status codes pass through as they are.

### Proxy safety

- Fail open (D9), Bypass switch, and a health check every 5 min that alerts the owner (notification + email) if the
  origin stops answering through the proxy.
- No body rewriting outside `<head>` except the tracker tag before `</body>`. No HTML rewriting on responses over 5 MB
  or with `Content-Encoding` the Worker can't stream.
- Platforms that issue their own certificates for the customer's domain and refuse proxies (Shopify, Wix,
  Squarespace) are detected in the wizard and steered to Script. The Proxy is for sites on ordinary hosting, static
  hosts, and app hosts (Vercel, Netlify, Render, cPanel, WP Engine…).
- Abuse: a hostname is only proxied after D11, and only to the origin its owner set. The Worker answers 421 for
  hostnames it doesn't know.

## What the owner sees (mint-tenant)

- **Site → Connect your site** (`/connect-site`, Build permission, doc link on every step): 1) the site's address →
  we fetch it and say what we found (platform, current title/description, whether `track.js` is already there, page
  count from its sitemap); 2) pick Script / Code / Proxy, with the table above in plain words; 3) the steps for that way
  with the project's values filled in; 4) **Check connection** until it's live; then a status card (way, last seen,
  pages found, Bypass for the proxy).
- **Website → SEO** for a connected site: the found pages as a table (path, now on the site, from Mint, score from the
  VSeo's 8 checks), the VSeo per page, **Pattern rules** tab, **Find pages again**.
- **Analytics** unchanged. A connected site's events are like any other website's.
- **Redirects** (proxy and code ways): from → to, 301/302, plus "pages that 404" from the proxy's log (SC-11).

## Open questions for the user

1. **Cloudflare account:** use the existing one (which?) or a new one for Mint? It needs the Workers paid plan
   ($5/month) for the request volume and for Cloudflare for SaaS on the zone.
2. **Edge domain:** customers CNAME to `connect.mintapp.shop`, or a separate domain (e.g. `mintedge.net`) so
   customer traffic is kept apart from the product domain? A separate one is safer. `mintapp.shop` must be on
   Cloudflare DNS for the first choice.
3. **Who pays per hostname:** proxy only on paid plans, or free with a cap?
4. **Bare domains:** OK to support `www` only at first (D10)?
5. **Script copy:** OK to tell owners plainly that Script SEO is Google-only, and to recommend the Proxy?

## Where things are (fill in as work orders land)

- Head answer: …
- Page discovery / crawl: …
- `mint-edge` Worker repo: …
- Panel Connect page: …
