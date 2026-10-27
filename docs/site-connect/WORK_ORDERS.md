# Site connect — work orders

Plan: `README.md`. Log: `CHANGELOG.md`. Commit and push each WO when it's done (backend → `mint` v3; mint-tenant →
`origin` main; mint-docs and mint-webpage → `origin` main; mint-edge → its own repo, main), then go on. Every WO that
changes what owners see updates the mint-docs guide (`websites#connect-…`), the marketing website, the MCP's
`describe_website` / `site_snippets`, and puts doc links on each new panel step.

## Status

SC-01 Plan & docs — done 2026-10-27 (revised the same day: code first, Cloudflare in the customer's own account).

**Phase 1 — code (user, 2026-10-27: "firstly go with the code thing")**

| WO | Title | Repo | Size | Status |
|---|---|---|---|---|
| SC-02 | Head answer `/site/head?path=` (JSON + html); only pages added to SEO (D4) | backend | M | done 2026-10-27 (no `connection` settings / `source` field yet — not needed for the snippet) |
| SC-03 | `track.js` `data-seo`: apply the head answer (replace, not add, D4), re-apply on client-side navigation, put back what it replaced | backend | S | done 2026-10-27 |
| SC-08 | Code way: snippets on Website setup → **Existing website** (paste the snippet, add pages, check, PHP / Node / Next.js server print, robots + sitemap) + guide | mint-tenant + docs | M | done 2026-10-27 (snippets; the `@mintapp/seo` package later, user's call) |
| SC-04 | Page discovery: site's sitemap, shallow crawl (current title/description), paths from analytics; **Find pages again** | backend | M | todo |
| SC-05 | Panel: Site → Connect your site — detect, pick a way, filled-in steps, Check connection, status card | mint-tenant + docs | M | todo |
| SC-06 | Panel: Website → SEO for connected sites — found pages table (now vs Mint, score), VSeo per page | mint-tenant + docs | M | todo |
| SC-07 | Pattern rules (`/blog/*` + `{h1}` / `{first paragraph}`), merged in the head answer | backend + mint-tenant | M | todo |

**Phase 2 — Cloudflare in the customer's own account (D7)**

| WO | Title | Repo | Size | Status |
|---|---|---|---|---|
| SC-09 | **Spike:** our test zone on a free Cloudflare account; upload a Worker + route with a scoped API token over the API; HTMLRewriter on a real WordPress page; time added per request; Deploy to Cloudflare button | mint-edge | S | after SC-02 |
| SC-10 | `mint-edge` Worker: config by project key, `fetch(request)` to their server, HTMLRewriter head, `/_mint/*` tracker, robots/sitemap, redirects, fail open, Bypass, version check | mint-edge + backend (edge config endpoint) | L | after SC-09 |
| SC-11 | Panel: Cloudflare connect — TXT check, token (encrypted, D8), zone check, upload + route, before/after check, health alerts, push updates (D10), remove; "move your DNS to Cloudflare" walkthrough; Redirects + 404s | backend + mint-tenant + docs | L | after SC-10 (Q1) |
| SC-13 | Crawler log through the Worker (Googlebot, Bingbot, AI crawlers: which pages, when) | mint-edge + backend + mint-tenant | M | later |

**Later — alternatives (README "Alternatives")**

| WO | Title | Repo | Size | Status |
|---|---|---|---|---|
| SC-12 | WordPress plugin (key, head, step aside for Yoast/Rank Math fields Mint sets) | own repo | M | later (Q4) |
| SC-14 | Shopify app: write page/product/collection SEO into the store (Alternative A) | own repo + backend | L | later (Q4) |
| SC-15 | Rebuild on publish: deploy hooks (Vercel / Netlify / Cloudflare Pages) for static sites (Alternative C) | backend + mint-tenant | S | later |
| SC-16 | AI SEO for found pages over MCP (`suggest_seo` on crawl text, review then publish) (Alternative E) | backend + docs | S | after SC-04 |
| SC-17 | Our own CNAME proxy (Cloudflare for SaaS) for owners who can't move DNS (D12) | mint-edge + backend | L | only if Q2 says so |

Order: SC-02 → 03 → 08 make the code ways work. SC-04 → 05 → 06 → 07 add the panel. Phase 2 can start after SC-02.

## Handoff

- 2026-10-27: SC-02, SC-03, SC-08 done (user: "first implement the code, a snippet not the package … and a simple guide on
  connecting the website on tenant panel"; rule D4: only pages added to SEO are Mint's). Smoke
  `site-connect-head.mjs` (35 checks) on a private backend; `data-seo` checked in a browser on a plain HTML page (own
  tags replaced on an added page, put back on a page not added). Not deployed. Next: Cloudflare (SC-09…11), or SC-04…07.
- 2026-10-27: plan written (SC-01), then revised: code first; Cloudflare = a Worker in the customer's own account
  (D7), our CNAME proxy only as a later fallback (D12). Nothing built. Open questions 1–5 in `README.md` wait for the
  user; none blocks SC-02.

## SC-02 — Head answer and connected pages (M)

- `GET /public/api/site/head?path=&format=json|html&apiKey=` (website projects): find the kit Pages record by path
  (exact, then trailing-slash variants), its SEO record, else the matching pattern rule (SC-07, skip until then),
  merged with Default SEO through `withSiteDefaults`. JSON = the flat fields + `jsonLd[]`; `html` = escaped tags.
  `Cache-Control: public, max-age=60`. Unknown path → Default SEO only (never 404, so a new page still gets a title).
- `WebsiteSettings.connection` (D1), Joi in `saveSite`, `connectionOf()` helper; `publicConfig` doesn't expose `origin`.
- Kit Pages records gain `source` (`builder` | `connected` | `manual`). Sitemap keeps working on them unchanged.
- Smoke `scripts/tenancy-smoke/site-connect-head.mjs`: page SEO, Default SEO fallback, unknown path, html escaping.

## SC-03 — Script SEO (S)

- `data-seo` on the script: fetch the head answer with the tags call (one round trip: `/site/tags?path=` returns
  `head` too when asked), apply per D4, re-apply on `pushState` / `popstate` (the page-view hook).
- Keep `defer` working (applies after DOM ready) but the snippet in the wizard has no `defer`.
- Headless Chrome check on a plain HTML page with its own title + description: Mint's values replace them, empty
  Mint fields leave them.

## SC-04 — Page discovery (M)

- `library/functions/siteDiscover.function.ts`: read `/robots.txt` → sitemaps (index + children, 5,000 URLs cap),
  crawl from `/` (same host, depth 3, 500 pages, 4 at a time, robots respected, `User-Agent: MintBot (+docs url)`),
  record `title`, `description`, `h1`, first paragraph, canonical, `noindex`, status. Upsert kit Pages by path.
- Paths from `WebsiteEvent` page views not in Pages → added with `found: 'analytics'`.
- Tenant endpoint `POST /site/discover` (runs in the background, progress on the settings doc) + panel button.

## SC-05 — Connect your site page (M)

See README "What the owner sees". Detection grows from `siteCheck.function.ts` (platform from generator meta /
headers, `track.js` present, current SEO). Recommends Code, else Cloudflare, else Script.

## SC-06 — SEO for connected sites (M)

Table of found pages (path, now on the site, from Mint, VSeo score), VSeo dialog per page (existing SB-32 editor),
"Use what's on the site" fills Mint's fields from the crawl. Filters: missing title, missing description, noindex.

## SC-07 — Pattern rules (M)

`WebsiteSettings.seo.rules[]` `{ match: '/blog/*', fields: {...} }`, placeholders `{h1}`, `{title}`, `{first paragraph}`,
`{path}`, `{site name}`; most specific match wins; page SEO beats a rule. Placeholders come from the crawl record
(script/code) or the live HTML (Worker, SC-10).

## SC-08 — Code way (M)

`@mintapp/seo` (Q3): `getSeo(path)` → head answer JSON; `seoMetadata(path)` for Next.js `generateMetadata`;
`mintSeo()` Express middleware that injects `format=html` before `</head>`; a Vite plugin for static builds.
Website setup gains the "SEO for every page" step per framework, with plain HTML (server include) and PHP beside
the package. `website.tools.ts` `site_snippets` in step.

## SC-09 — Cloudflare spike (S)

On a test domain in a free Cloudflare account: create a token with only Workers Scripts: Edit + Workers Routes: Edit +
Zone: Read; upload a Worker and add a route over the API; HTMLRewriter on a real WordPress page; time added per
request (target < 50 ms p50); Deploy to Cloudflare button with two settings. Write the results here.

## SC-10 — mint-edge Worker (L)

As README "3. Cloudflare". Edge config endpoint `GET /public/api/site/edge` (project key) returning mode, bypass,
redirects, rules, tags, version. Head answers fetched per path and cached. `?mint-bypass=<secret>` for the
before/after check. Tests with `wrangler dev` + Miniflare against a local origin.

## SC-11 — Cloudflare connect (L)

Cloudflare API client in backend (the owner's token, encrypted at rest, D8): verify token scope, find the zone,
check it's proxied, upload the Worker with the project key as a binding, add the routes, before/after check, push
updates in waves (D10), remove on disconnect. TXT ownership check. Health check job + alerts, Bypass, Redirects page +
404 list.
