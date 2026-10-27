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

Second message (2026-10-27):

> firstly go with the code thing. we'll utilize the code to create seo's, then cloudflare. maybe a dns record or
> something which will help the crawlers make the seo so that we have control over the panel. customers will use
> their own accounts own domains, just we'll use records to connect if they cant access the code.

## Order

1. **Phase 1, code:** the Script and the server Code helpers, plus everything they share: the head answer, page
   discovery, and the panel's Connect + SEO pages (SC-02…08).
2. **Phase 2, Cloudflare in the customer's own account:** for owners who can't touch the code. Their domain and
   Cloudflare account stay theirs. Mint connects with a DNS record for ownership and a Worker on their zone that does the
   rewriting (SC-09…11, redesigned below, D7).
3. **Later:** our own CNAME proxy for owners not on Cloudflare (D12), platform apps (Alternatives).

**A DNS record on its own can't change what crawlers see.** DNS only says which server answers. Something has to sit
between the visitor and the site's server and rewrite the page. In phase 2 that is a Cloudflare Worker running in the
customer's own Cloudflare account. The DNS records are: our TXT record to prove ownership, and the domain proxied
through Cloudflare (orange cloud), which most Cloudflare users already have.

## What already exists (don't rebuild it)

| Piece | Where | Reused for |
|---|---|---|
| `track.js`: page views, clicks, custom events, visitors, journeys (WO-19, WO-56) | `routes-public/track.ts`, `library/functions/visitorAnalytics.function.ts` | Analytics on connected sites as it is |
| Tags in `track.js`: GA4/Ads/GTM, Meta, TikTok, LinkedIn, Pinterest, X, Snap, Clarity, Hotjar, verification metas, favicon, Add script code (WO-34, WO-38, SB-30) | `track.ts` `applyTags`, `GET /public/api/site/tags` | As it is. The SEO work adds a `head` step beside it |
| Meta Conversions API / GA4 Measurement Protocol (WO-38) | `serverTracking.function.ts` | As it is |
| Page SEO = AGS VSeo shape, kit SEO model (`/seo`, linked to a kit Pages record), Default SEO (SB-31…33) | `library/siteBuilder/seo.ts` (`withSiteDefaults`, `vseoToPage`…), kit models | The SEO of a connected site's pages. Same editor, same fields |
| `robots.txt` / `sitemap.xml` from published pages + SEO | `public.router.ts` `/site/robots.txt`, `/site/sitemap.xml` | Served on the site's own domain by the Worker or a rewrite |
| Check the site: fetches the live home page and compares tags (WO-38) | `siteCheck.function.ts` | Grows into the connect wizard's detection step |
| Website setup: keys, env names, track.js + page SEO snippets for HTML / React / Next (WO-55) | mint-tenant `app/website-setup`, `website.tools.ts` | The "Code" way of connecting (way 2 below) |
| Project keys `mint_pk_…` (D14) | public API | The script's `data-key` |

## Three ways to connect

| | 1. Script | 2. Code (server) | 3. Cloudflare (advanced) |
|---|---|---|---|
| Owner does | Pastes one `<script>` line into the site's `<head>` (theme settings, "custom code" box, GTM) | A developer adds our helper to the site's server/build (Next.js, Express, PHP; WordPress plugin later) | Adds a TXT record and connects their own Cloudflare account (D7). No access to the code needed |
| Analytics | Full | Full | Full, and the tracker is served from the site's own domain, so ad blockers miss less |
| SEO is in the HTML the server sends (true pre-render) | **No.** Added in the browser after the page loads | Yes | Yes. Rewritten at the edge on every request |
| Google | Reads it (Google runs JavaScript), but later and less reliably | Yes | Yes |
| Facebook, WhatsApp, LinkedIn, X, Slack link previews; Bing and most other crawlers; AI crawlers | **Don't see it** (they don't run JavaScript) | Yes | Yes |
| robots.txt, sitemap.xml, redirects on the site's domain | No | Through rewrites the developer adds | Yes, served by the Worker |
| Risk to the site | None, since it only adds tags | Low | The Worker sits in front of every request (see "Worker safety") |

**The honest point for the panel and the website copy:** a script cannot pre-render. It changes the page after it
loads in a browser. That is good enough for Google's main index. It is not enough for link previews or most other
crawlers. "Pre-rendered SEO" is only true for ways 2 and 3. The panel says this in plain words when the owner picks
Script, and the Connect page recommends Code or Cloudflare for owners who care about shared links and search beyond Google.

## Decisions

Proposed. Confirm the ones marked *(confirm)* before the work order that needs them.

| # | Decision | Why |
|---|---|---|
| D1 | **A connected site is a `website` project** with `WebsiteSettings.connection = { mode: 'builder' \| 'script' \| 'code' \| 'cloudflare', siteUrl, hostnames[], cloudflare: { accountId, zoneId, workerVersion }, status, verifiedAt, lastSeenAt }`. No new project type. | Analytics, Site setup, SEO, Website setup all already work on website projects. |
| D2 | **A connected site's pages are kit Pages records** (`path`, `title`, `status: 'published'`, `source: 'connected'`) with the kit SEO record beside each. They're found, not created by hand (D5). | The SEO editor, Default SEO, robots and sitemap code then work unchanged. |
| D3 | **One head answer for every way:** `GET /public/api/site/head?path=/about&apiKey=…` gives the merged SEO for that path (page SEO → pattern rule → Default SEO) as JSON *and*, with `format=html`, as ready `<head>` tags. Script, server helpers and the Worker all use it. Cached 60 s. | One merge in one place (`withSiteDefaults`). Every way shows the same SEO. |
| D4 | **Mint's SEO wins over the page's own tags only where the owner set something.** An empty field in Mint leaves the site's own tag alone. `<title>`, description, canonical, robots, OG, Twitter and JSON-LD are replaced, not duplicated. | A site that already has decent SEO isn't wiped by an empty panel. |
| D5 | **Pages are found three ways:** the site's own `sitemap.xml`, a shallow crawl from the home page (same host, 500 pages, robots.txt respected), and paths seen in analytics page views. The crawl also records each page's *current* title/description so the panel can show "now on the site" vs "from Mint". | Owners shouldn't type paths. Analytics fills in pages a crawl misses (behind JS). |
| D6 | **Pattern rules** for many pages: `/blog/*` → title `{h1} — Acme Blog`, description `{first paragraph}`. Placeholders are filled from the page's own HTML by the crawl (script/code) or at the edge (Worker). A page's own SEO beats a rule. | Sites with hundreds of posts can't be done page by page. |
| D7 | **Phase 2 = a Worker in the customer's own Cloudflare account** (user, 2026-10-27). The owner moves the domain's DNS to Cloudflare if it isn't there yet (free plan is enough) and gives Mint a Cloudflare API token limited to *Workers Scripts: Edit* (account) and *Workers Routes: Edit* + *Zone: Read* (that one zone). Mint uploads the `mint-edge` Worker to their account and adds the route `www.acme.com/*` (and `acme.com/*`). No token? A **Deploy to Cloudflare** button plus a two-field setup (project key, API address) does the same by hand. | Their account, their domain, their bill. The Worker's `fetch(request)` goes to their own origin as it does today, so there's no origin-address or Host-header problem (old D8) and bare domains work (old D10). Workers' free plan covers 100,000 requests a day; busier sites pay Cloudflare $5/month themselves. |
| D8 | **The token is stored encrypted and used only for deploy, update and remove.** The Worker itself never holds the token. It reads the site's config from Mint with the project key. Removing the connection deletes the route and the script from their account. | The token can change their Workers, so it's handled like a payment secret. Owners can revoke it in Cloudflare any time, and the Worker keeps running until removed. |
| D9 | **The Worker fails open.** If Mint's API is slow (>300 ms) or down, the Worker uses its last cached head answer, else passes the origin's page through untouched. A per-site **Bypass** switch in the panel turns all rewriting off at once. A site never breaks because Mint is down. | It sits in front of a customer's whole site. |
| D10 | **One Worker script, versioned.** Mint pushes updates to every connected account (with the stored token) in waves. Deploy-button installs check a version endpoint and show "update available" in the panel. | Fixes must reach every site without asking each owner. |
| D11 | **Ownership before anything applies:** Script mode is live once page views with the key arrive from the site's hostname. Cloudflare mode needs our TXT record (`_mint.acme.com = <project id>`) and the zone in the connected account. | Nobody can point Mint's SEO or Worker at a domain they don't control. |
| D12 | **Our own CNAME proxy (Cloudflare for SaaS) is a later fallback** for owners whose DNS can't move to Cloudflare. It's kept from the first draft of this plan: the customer CNAMEs `www` to our edge domain, $0.10/hostname/month after 100. It needs an origin address that answers on its own name (a Worker can't set a different Host outside Enterprise), and bare domains need flattening. | Covers the rest, at the cost of putting Mint in front of their traffic. |

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

### 3. Cloudflare (the customer's own account)

```
visitor ─▶ www.acme.com  (DNS on the customer's Cloudflare, proxied)
            │  route www.acme.com/* → mint-edge Worker (in THEIR account)
            ▼
        mint-edge Worker
          1. site config from Mint by project key (cached at the edge 60 s; stale up to 24 h if Mint is down)
          2. /robots.txt, /sitemap.xml, redirects, /_mint/* (tracker + track endpoint) → answered here
          3. everything else → fetch(request): the customer's own server, exactly as without the Worker
          4. text/html 200 only → HTMLRewriter: replace head SEO (D4), fill pattern rules (D6),
             add <script src="/_mint/track.js" data-key>, drop the site's own copy of tags Mint now sets
          5. anything else (images, JS, POST, websockets, 304, non-200) → passed through untouched
```

- **Panel side:** the owner adds our TXT record (`_mint.acme.com = <project id>`) and pastes the API token. Mint
  checks the zone is on Cloudflare and proxied, uploads the Worker, and adds the route. The owner can also use the
  Deploy to Cloudflare button instead of a token (D7).
- **Before going live** Mint fetches 3 pages with and without the Worker (a `?mint-bypass=<secret>` switch) and
  compares them (status, size, title). It doesn't add the route if they differ in anything but `<head>`.
- **Not on Cloudflare yet?** The wizard walks the owner through adding the site to a free Cloudflare account and
  changing the nameservers at their registrar. It also offers the later fallback, our CNAME proxy (D12).
- **Caching:** the Worker never caches pages, so the origin's own caching rules stand. Only Mint's site config and head
  answers are cached. Cookies, `Set-Cookie`, `Cache-Control` and status codes pass through as they are.

### Worker safety

- Fail open (D9), Bypass switch, and a health check every 5 min that alerts the owner (notification + email) if the
  origin stops answering through the Worker.
- No body rewriting outside `<head>` except the tracker tag before `</body>`. No HTML rewriting on responses over 5 MB
  or with `Content-Encoding` the Worker can't stream.
- Platforms that don't support their domain being proxied through Cloudflare (Shopify, Wix, Squarespace) are
  detected in the wizard and steered to Script or a platform app (Alternative A). The Worker is for sites on ordinary
  hosting, static hosts, and app hosts (Vercel, Netlify, Render, cPanel, WP Engine…).
- The Worker only runs on routes in the owner's own zone, and only after D11. It ignores any hostname whose Mint config
  doesn't name it.

## What the owner sees (mint-tenant)

- **Site → Connect your site** (`/connect-site`, Build permission, doc link on every step): 1) the site's address →
  we fetch it and say what we found (platform, current title/description, whether `track.js` is already there, page
  count from its sitemap); 2) pick Script / Code / Cloudflare, with the table above in plain words; 3) the steps for that way
  with the project's values filled in; 4) **Check connection** until it's live; then a status card (way, last seen,
  pages found, Bypass for the Worker).
- **Website → SEO** for a connected site: the found pages as a table (path, now on the site, from Mint, score from the
  VSeo's 8 checks), the VSeo per page, **Pattern rules** tab, **Find pages again**.
- **Analytics** unchanged. A connected site's events are like any other website's.
- **Redirects** (Cloudflare and code ways): from → to, 301/302, plus "pages that 404" from the Worker's log (SC-11).

## Alternatives (suggested 2026-10-27, not agreed)

| Alternative | How | Good for | Catch |
|---|---|---|---|
| **A. Write SEO into the platform** | Connect the owner's platform account (OAuth / API key) and write each page's title, description and social image into the platform itself: Webflow (page metadata API), Shopify (products, collections, pages `seo` fields), WordPress (our plugin or app passwords + Yoast/Rank Math fields), Wix (its SEO settings, check its API) | Hosted builders a Worker can't sit in front of. True server-rendered SEO, no DNS change | One integration per platform. Each only covers the fields that platform has |
| **B. npm package instead of copied snippets** | `@mintapp/seo` with `getSeo(path)`, a Next.js `generateMetadata` helper, Express middleware, a Vite plugin | Code way (phase 1). Fixes reach every site with a version bump | A package to publish and keep up |
| **C. Rebuild on publish** | For static sites (Astro, Next export, Hugo) the build reads Mint's SEO. Mint calls the site's deploy hook (Vercel / Netlify / Cloudflare Pages) when SEO is published | Static sites with no server | Changes show after the rebuild (1–3 min) |
| **D. Through Google Tag Manager** | Owners with GTM but no code access add our script as a GTM tag | Analytics without a developer | SEO is Google-only, like the Script |
| **E. SEO written by the owner's AI** | The crawl (SC-04) gives each page's text. The MCP's `suggest_seo` fills titles, descriptions and schema per page on the user's own AI (no server AI calls, per our rule) | Sites with many pages and no SEO at all | Owner reviews before publishing |

**Recommendation:** B for phase 1 (with plain HTML / PHP snippets beside it), A for Shopify and WordPress right after
phase 2 since that's where most "no code access" owners are, and E as a small add-on once SC-04 lands. C and D are
small additions to the Website setup page.

## Open questions for the user

1. **The customer's API token vs the Deploy button:** OK to store an encrypted Cloudflare token per site so Mint can
   push Worker updates (D8, D10)? Without it, owners update by hand.
2. **Owners not on Cloudflare:** walk them to a free Cloudflare account, or build our CNAME proxy (D12) too?
3. **Package name:** publish `@mintapp/seo` on npm (alternative B)? It needs an npm org.
4. **Platform apps (alternative A):** which first, Shopify or WordPress?
5. **Script copy:** OK to tell owners plainly that Script SEO is Google-only, and to recommend Code or Cloudflare?

## Where things are (fill in as work orders land)

- Head answer: …
- Page discovery / crawl: …
- `mint-edge` Worker repo: …
- Panel Connect page: …
