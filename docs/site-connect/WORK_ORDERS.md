# Site connect — work orders

Plan: `README.md`. Log: `CHANGELOG.md`. Commit and push each WO when it's done (backend → `mint` v3; mint-tenant →
`origin` main; mint-docs and mint-webpage → `origin` main; mint-edge → its own repo, main), then go on. Every WO that
changes what owners see updates the mint-docs guide (`websites#connect-…`), the marketing website, the MCP's
`describe_website` / `site_snippets`, and puts doc links on each new panel step.

## Status

| WO | Title | Repo | Size | Status |
|---|---|---|---|---|
| SC-01 | Plan & docs | backend | S | done 2026-10-27 |
| SC-02 | Head answer `/site/head?path=` (JSON + html), connected pages as kit Pages (`source: 'connected'`), `WebsiteSettings.connection` | backend | M | todo |
| SC-03 | `track.js` `data-seo`: apply the head answer (replace, not add, D4), re-apply on client-side navigation | backend | S | todo |
| SC-04 | Page discovery: site's sitemap, shallow crawl (current title/description), paths from analytics; **Find pages again** | backend | M | todo |
| SC-05 | Panel: Site → Connect your site — detect, pick a way, filled-in steps, Check connection, status card | mint-tenant + docs | M | todo |
| SC-06 | Panel: Website → SEO for connected sites — found pages table (now vs Mint, score), VSeo per page | mint-tenant + docs | M | todo |
| SC-07 | Pattern rules (`/blog/*` + `{h1}` / `{first paragraph}`), merged in the head answer | backend + mint-tenant | M | todo |
| SC-08 | Code way: Website setup "SEO for every page" — Next.js, Express middleware, PHP include | mint-tenant + docs | S | todo |
| SC-09 | **Spike:** Cloudflare for SaaS on the edge zone + a test Worker + one test hostname; try origins (Vercel, Netlify, cPanel, WordPress host); write down what works (D7, D8) | mint-edge | S | needs Q1, Q2 |
| SC-10 | `mint-edge` Worker: hostname → config, origin fetch, HTMLRewriter head, `/_mint/*` tracker, robots/sitemap, fail open, Bypass | mint-edge + backend (edge config endpoint, server secret) | L | after SC-09 |
| SC-11 | Panel: proxy onboarding — custom hostname API, DNS records, certificate polling, preview check, health alerts; Redirects + 404s | backend + mint-tenant + docs | L | after SC-10 |
| SC-12 | WordPress plugin (key, head, step aside for Yoast/Rank Math fields Mint sets) | own repo | M | later |
| SC-13 | Crawler log through the proxy (Googlebot, Bingbot, AI crawlers: which pages, when) | mint-edge + backend + mint-tenant | M | later |

Order: SC-02 → 03 → 04 → 05 → 06 make the Script way usable end to end. SC-07, SC-08 next. The proxy (SC-09 → 11)
starts once Q1/Q2 are answered and can run beside SC-05…08 after SC-02.

## Handoff

- 2026-10-27: plan written (SC-01). Nothing built. Open questions 1–5 in `README.md` wait for the user. Q1/Q2 block
  the proxy only.

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
headers, `track.js` present, current SEO). Recommends Proxy unless the platform refuses proxies.

## SC-06 — SEO for connected sites (M)

Table of found pages (path, now on the site, from Mint, VSeo score), VSeo dialog per page (existing SB-32 editor),
"Use what's on the site" fills Mint's fields from the crawl. Filters: missing title, missing description, noindex.

## SC-07 — Pattern rules (M)

`WebsiteSettings.seo.rules[]` `{ match: '/blog/*', fields: {...} }`, placeholders `{h1}`, `{title}`, `{first paragraph}`,
`{path}`, `{site name}`; most specific match wins; page SEO beats a rule. Placeholders come from the crawl record
(script/code) or the live HTML (proxy, SC-10).

## SC-08 — Code way snippets (S)

Website setup gains the "SEO for every page" step for Next.js / Express / PHP; `website.tools.ts` `site_snippets` in step.

## SC-09 — Cloudflare spike (S)

Answer, in this file: custom hostname + Worker `*/*` on our zone works on the plan we have; fetching each origin type by
its own hostname works; HTMLRewriter on a real WordPress page; time added per request (target < 50 ms p50); what
Shopify / Wix do when proxied. Decide D8/D10 for real.

## SC-10 — mint-edge Worker (L)

As README "Proxy". Edge config endpoint `GET /edge/sites/:hostname` with a server secret (not the project key),
returning origin, mode, bypass, redirects, rules, tags. Head answers fetched per path and cached. Tests with
`wrangler dev` + Miniflare against a local origin.

## SC-11 — Proxy onboarding (L)

Cloudflare API client in backend (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID` envs), custom hostname create / poll /
delete, our TXT check, preview comparison, Bypass, health check job + alerts, Redirects page + 404 list.
