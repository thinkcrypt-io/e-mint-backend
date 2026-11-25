# Google Search Console in Analytics — plan

Drafted 2026-11-25. Work orders: `WORK_ORDERS.md` (GS-00…15). This plan replaces the earlier one-paragraph stubs
**SEO-15** (`../seo/WORK_ORDERS.md`) and **SP-16** (`../seo-panel/WORK_ORDERS.md`).

The user asked (2026-11-25): "on the analytics page of seo and tenant panel we need google search console integration,
1 - if website is verified or not (domain), and search result and analytics. on analytics panel, overview, visitors,
live, search console these would be the tabs. Plan fully"

## What we're building (one paragraph)

A fourth tab on the Analytics page, **Search Console**, in the tenant panel (mint-tenant) and the SEO app (mint-seo).
The project owner connects their own Google account once. Mint then shows, for the project's domain: **(1) is the site
verified in Google Search Console** (and if not, helps verify it: a DNS record to copy, or a single click for sites where
Mint prints the page head), **(2) how the site does in Google search**: clicks, impressions, click rate and average
position over time, with top searches, pages, countries and devices, and **(3) indexing**: sitemaps Google has read
(with Mint's own sitemap one click away) and "is this page on Google?" for any address.

## Tabs

`/analytics?tab=` → **Overview · Visitors · Live · Search Console** (`overview | visitors | live | search`).

- The range dropdown (Last 7 / 30 / 90 days / 12 months) is shared. On the Search Console tab, "Today" is hidden and a
  one-line note says Google's numbers arrive 2–3 days late (the tab shows Google's latest date).
- A Google search card is added to Overview only in phase 2 (GS-12). Phase 1 leaves the other three tabs as they are.

## Decisions (recommended; the user can change any of them, see Open questions)

| # | Decision | Why |
|---|---|---|
| D1 | **The customer's own Google account over OAuth** ("Connect Google"). Not a Mint service account | Shows properties they already have (most sites are already verified), and they keep ownership. A service account would make the customer add a Mint e-mail as a user in Search Console by hand, and Mint would own the properties it verifies |
| D2 | **One connection per project**, shared by everyone who can see the project's analytics | Search data belongs to the site, not the person looking. The tab says who connected it and which Google account ("Connected by Rafi as rafi@…") |
| D3 | Scopes: `webmasters` + `siteverification` + `openid email` | `webmasters.readonly` can't add a property or submit a sitemap; `siteverification` is what verifies a domain for them. A read-only mode (GS-03 and sitemap submit off) is possible if the user prefers fewer scopes (Q3) |
| D4 | **Google sends people back to the panel app** (`<app>/google/callback`), which hands `code` + `state` to the backend | Google only redirects to *authorized domains* the OAuth app owner has verified. `mint-c5e1255519fc.herokuapp.com` can't be one; `mintapp.shop` and `tcrypt.site` can. Also works in local dev (`http://localhost:<port>`) |
| D5 | **The refresh token is encrypted at rest** (AES-256-GCM, key `GOOGLE_TOKEN_KEY`) and never leaves the backend | Unlike password fields (left plain by the user's call), this token reads and changes the customer's whole Search Console. Q4 |
| D6 | **Read live from Google, cached 6 hours** in one shared collection `SearchConsoleCache` in the main DB (TTL index) | Google's data changes once a day. No new per-project collection, because of Atlas' 500-collection cap (see the Atlas memory). Quotas stay far below Google's limits |
| D7 | **"Verified" means Google says the connected account is owner / full / restricted user** of a property that covers the domain. Domain properties (`sc-domain:example.com`) are preferred because they cover http/https/www/subdomains; URL-prefix properties are matched as a fallback | That's how Search Console defines it (`sites.list` → `permissionLevel`; `siteUnverifiedUser` = added, not verified) |
| D8 | **Verify for them where we can:** domain → DNS TXT (copy the record, Mint checks DNS first, then asks Google). Sites whose head Mint prints on the server (Mint-built sites, the Cloudflare Worker, the server print) → **one click** via the meta tag saved into `seo.googleVerification` | `seo.googleVerification` already exists and is printed by `siteBuilder/render.ts` and `/site/head`. The JavaScript-only snippet (`track.js data-seo`) adds it in the browser, which Google's check may not see, so snippet-only sites get the DNS way |
| D9 | Permissions: `view-analytics` sees the tab; `manage-site` connects, picks the property, verifies, submits sitemaps, disconnects. SEO demo logins (view only) see the numbers, no buttons | Same keys the rest of Analytics / Site setup use; demo logins can't change a real site |
| D10 | Plain words: "Search Console" stays (Google's own name). Each number has a one-line meaning: *Clicks — people who came from Google*, *Impressions — times your site showed in results*, *Click rate*, *Average position — 1 is the top* | The plain-words rule |
| D11 | AI on the numbers goes through the customer's own AI over MCP (GS-11), never a server call | The AI-via-MCP rule |

## Screens (Search Console tab)

The tab is one column of panels; each panel title has a "How this works ↗" link to the guide's anchor (doc-links rule).

1. **Not connected** — a card: what you get (three lines), *Connect Google* (manage-site only), privacy line ("Mint reads
   your Search Console data for this site. Disconnect any time."), guide link. Without manage-site: "Ask someone who
   manages this site to connect Google Search Console."
2. **Connection bar** (connected) — Google account, who connected it and when, the chosen property in a `Dropdown` (only
   properties that match the project's domains are listed first; "Show all" lists the rest), *Disconnect* (PromptDialog,
   `tone='default'`).
3. **Is the site verified?** — one row per domain of the project (`project.domains`, `connection.hostnames` for SEO
   projects): ✓ *Verified* (owner / full / restricted, with the property name) · ! *Added but not verified* ·
   ✕ *Not in Search Console*. Not verified → *Verify* opens a Dialog:
   - **Domain (recommended):** the TXT record `google-site-verification=…` with Copy buttons for host/value, per-registrar
     hints (Cloudflare, Namecheap, GoDaddy, cPanel), *Check* (Mint looks the record up first and says "not seen yet" before
     asking Google), then Google verifies and Mint adds `sc-domain:<domain>` to their Search Console and picks it.
   - **One click** (only shown where Mint prints the head on the server): *Verify now* saves the meta tag and asks Google.
4. **Performance** — four tiles (Clicks, Impressions, Click rate, Avg. position) with change against the period before;
   a line chart by day (clicks + impressions, toggle click rate / position); search type `Dropdown` (Web, Image, Video,
   News, Discover); filter chips (search contains…, page contains…, country, device). Below: `ConsoleTabs`
   **Searches · Pages · Countries · Devices · Appearance**, each a table (clicks, impressions, click rate, position; sort by
   any column; first 250 rows, "Load more"). A row in Searches filters the page list to that search and vice versa.
5. **Indexing** — Sitemaps table (address, type, last read by Google, pages found, errors, warnings); *Submit Mint's
   sitemap* when the project's sitemap isn't listed (manage-site). **Is this page on Google?** — an address box (from the
   site's own pages, `Dropdown` with search) → index verdict, last crawl, Google's chosen canonical vs yours, mobile,
   rich results, a link to open it in Search Console. Shows "N checks left today".
6. Errors in plain words: Google access removed → "Google says Mint can't read this site any more. Connect again."
   (status `revoked`, with a reconnect button); no data yet → "Google has no search data for this site yet. New sites take
   a few days."

## Backend

All under `/tenant/api/p/:id/search-console` (new `routes-tenant/searchConsole.router.ts`, logic in
`library/functions/searchConsole.function.ts`, Google calls in `library/functions/google/searchConsoleApi.ts` with plain
`fetch` — no `googleapis` package; it's large and we need ~8 endpoints).

| Method | Path | What | Key |
|---|---|---|---|
| GET | `/` | status: `connected`, `account`, `connectedBy`, `connectedAt`, `property`, `properties[]` (siteUrl, permissionLevel, matches), `domains[]` (domain, status verified/unverified/missing, property), `lastDataDate`, `status` (ok / revoked / error) | view-analytics |
| POST | `/connect` | → `{ url }` Google's consent address; `state` = short-lived signed JWT {project, user/panelAdmin, app origin, nonce} | manage-site |
| POST | `/callback` | `{ code, state, redirectUri }` → exchange, read e-mail (`openid email`), save encrypted refresh token, auto-pick the property | manage-site (state checked) |
| PUT | `/property` | `{ siteUrl }` must be one of the account's sites | manage-site |
| DELETE | `/` | revoke at Google (`oauth2.googleapis.com/revoke`), clear the connection | manage-site |
| POST | `/verify/start` | `{ domain, way: 'dns' \| 'meta' }` → Site Verification `webResource/getToken` (`INET_DOMAIN`+`DNS_TXT` or `SITE`+`META`); meta way saves `seo.googleVerification` | manage-site |
| POST | `/verify/check` | `{ domain, way }` → dns way: Node `resolveTxt` first (409 `NOT_SEEN` with the found records); then `webResource.insert`; then Webmasters `sites.add`; picks the new property | manage-site |
| GET | `/performance` | `from,to,type,dimension?,filters?,rowLimit,startRow` → totals (+ previous period) or rows; `dataState: 'all'`; cached (D6) | view-analytics |
| GET | `/timeseries` | by `date` for the chart (+ `lastDataDate`) | view-analytics |
| GET | `/sitemaps` | `sitemaps.list` for the property | view-analytics |
| POST | `/sitemaps` | `{ path }` → `sitemaps.submit`; default = the project's own sitemap address | manage-site |
| POST | `/inspect` | `{ url }` → `urlInspection/index:inspect` (must be on the property); cached 24 h per URL; counter per property per day (Google allows 2,000) | view-analytics |

**Stored** (in the project DB's `WebsiteSettings`, no new collection): `searchConsole { account, connectedBy {id, name, kind}, connectedAt,
refreshToken (encrypted: iv.tag.data), scopes, property, status, lastError, inspectCount {day, n} }`. The access token
lives in memory only (per dyno map, refreshed 5 minutes before expiry). `searchConsole.refreshToken` is removed from every
answer the way other secrets are (`siteConfig` answer, history, MCP).

**Shared code:** `library/functions/secretBox.ts` (`seal`, `open` with `GOOGLE_TOKEN_KEY`, 32 bytes base64); token
refresh + a single `google(path, opts)` helper that maps Google errors: `invalid_grant` → status `revoked`, 403 on a
property → "this Google account has no access to <property>", 429 → retry once after 2 s then "Google is busy, try again
in a minute".

**SEO panel:** add `{ test: /^\/search-console(\/|$)/ }` to the allowlist in `seoPanel.function.ts` (after live only).
Demo logins: GETs work, writes answer 403 like everything else they can't change.

**Test seam:** `GOOGLE_OAUTH_ROOT`, `GOOGLE_API_ROOT` env (default Google's) so the smoke `scripts/tenancy-smoke/search-console.mjs`
serves its own pretend Google (like `seo-link-preview.mjs` serves its own pretend site): consent → code, tokens, sites,
verification, analytics rows, sitemaps, inspection, revoked token.

## Google Cloud setup (the user, GS-00)

Nothing can be tested against real Google before this. Verification takes days to weeks, so start it first.

1. console.cloud.google.com → new project **Mint** (on the Google account that should own the app).
2. APIs & Services → Library → enable **Google Search Console API** and **Site Verification API**.
3. OAuth consent screen → External; app name **Mint**, logo, support e-mail, home page `https://mintapp.shop`, privacy policy
   `https://mintapp.shop/privacy` (must mention Google user data — GS-08 adds the section), terms; **authorized domains**
   `mintapp.shop`, `tcrypt.site` (each must be verified in that account's own Search Console). Scopes: `openid`, `email`,
   `…/auth/webmasters`, `…/auth/siteverification`. Test users: the user's own Google accounts.
4. Credentials → OAuth client ID → Web application. Redirect URIs: `https://seo.tcrypt.site/google/callback`,
   `https://<tenant panel domain>/google/callback` (Q2), `http://localhost:3500/google/callback` (mint-tenant dev),
   `http://localhost:3730/google/callback` (mint-seo dev). Later: panel.tcrypt.site, commerce.mintapp.site.
5. Put `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_TOKEN_KEY` (`openssl rand -base64 32`) in `backend/.env` and on
   Heroku.
6. Publish the app and submit it for verification: a reason per scope and a short screen video of the Connect → numbers
   flow (record it after GS-06). Until Google approves, only the test users (max 100) can connect and they see "Google
   hasn't verified this app".

## Order

GS-00 (the user, now) → GS-01 → 02 → 03 → 04 → 05 (backend, all on the pretend Google) → GS-06 (mint-tenant tab) → GS-07
(mint-seo) → GS-08 (guide, privacy, websites). Phase 2 (GS-09…15) after the user picks.

## Open questions

| Q | Question | Default if no answer |
|---|---|---|
| Q1 | Which Google account owns the OAuth app, and can you do GS-00 now? | Built against the pretend Google until the keys arrive |
| Q2 | The tenant panel's live domain for the redirect address (admin's tenant build still serves it, see the tenant-repo note) | Both the current tenant domain and the mint-tenant domain are registered |
| Q3 | Full scopes (verify + submit sitemaps) or read-only (`webmasters.readonly`, nothing changed in Google)? | Full (D3) |
| Q4 | Encrypt the Google token? | Yes (D5) |
| Q5 | Also on mint-commerce and mint-panel (stores have websites too)? | Later, GS-13 |
| Q6 | Keep numbers past Google's 16 months (a daily copy)? | No, GS-14 later |
