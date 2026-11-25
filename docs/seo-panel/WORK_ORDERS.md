# SEO panel — work orders

Plan: `README.md`. Drafted 2026-11-22; building started the same day with the defaults in `HANDOFF.md` (the user said "work on the seo
panel"). Progress and the next step: `HANDOFF.md`. When one is done: commit + push it (backend → `mint` v3; the new app → its own repo, main),
update the guide (`docs/site-connect/guide` + mint-docs), the marketing website, and put doc links on each new step.

## Status

**Phase 0: gaps in site-connect the panel needs (can start now)**

| WO | Title | Repo | Size | Status |
|---|---|---|---|---|
| SP-00a | `EDGE_WORKER_VERSION` → 1.0.1 (backend says 1.0.0, Worker sends 1.0.1) and one place for the number | backend | XS | done 2026-11-22 (now read from the generated bundle file) |
| SP-00b | One-file Worker bundle (`mint-edge/dist/mint-edge.js`, `lib.js` inlined) served to the panel for *Copy Worker code* | mint-edge + backend | S | done 2026-11-22 (`npm run bundle`; `GET /public/edge/mint-edge.js`; wrangler dry-run OK) |
| SP-00c | Branded API address for the snippet and Worker (`api.mintapp.shop` answers 404 today) | backend + DNS | S | todo (user: which domain) |
| SP-00d | SC-09 spike on a real Cloudflare zone: the guide's by-hand steps end to end, timing, fail open | mint-edge | S | todo (needs a test zone) |
| SP-00e | SC-04 page discovery (sitemap + shallow crawl + analytics paths) | backend | M | todo (= site-connect SC-04) |

**Phase 1: the app**

| WO | Title | Repo | Size | Status |
|---|---|---|---|---|
| SP-01 | Project `edition: 'seo'`, `WebsiteSettings.connection` (site-connect D1), migration none (new field) | backend | S | done 2026-11-22 |
| SP-02 | Login `app: 'seo'`, `use_seo` answers on the other apps, fixed keys (as built: the model keys of `pages` + `seo`, `view/create/edit-image`, `view-analytics`, `manage-site`), path allowlist, backend setup gate (409 `NOT_CONNECTED`), SEO sidebar; smoke `seo-panel.mjs` | backend | M | done 2026-11-22 (49/49; panel-users, commerce-panel, demo-logins still pass) |
| SP-03 | `mint-seo` app: copy of mint-panel (APFS clone of node_modules), `IS_SEO_PANEL`, AuthFrame copy, SEO sidebar, hidden pages, Vercel project + domain | mint-seo | M | done 2026-11-22; live at seo.tcrypt.site (needs the backend deployed) |
| SP-04 | Setup gate: PanelGuard + proxy redirect to `/setup` until live; backend 409 `not_connected` on SEO writes | mint-seo + backend | S | done 2026-11-22 |
| SP-05 | Setup wizard steps 1–2: address + detection (platform, Cloudflare NS/proxied, current SEO, snippet present), recommend a way | backend + mint-seo | M | done 2026-11-22 |
| SP-06 | Setup wizard step 3: snippet per platform (tabs, screenshots); Cloudflare by hand (checklist, live DNS checks, *Copy Worker code*, key and routes with copy buttons) | mint-seo + docs | M | done 2026-11-22 (screenshots skipped) |
| SP-07 | Steps 4–5: ownership (page view from host / TXT `_mint.<domain>`), Test connection + Worker check, **Start using** → `live` | backend + mint-seo | M | done 2026-11-22 |
| SP-08 | After live: Home (status, visits, health, checklist), Pages & SEO, Defaults, Link previews, Robots & sitemap (+ edge switches UI), Redirects, Analytics, Tracking, Health, Connection (Bypass, Disconnect), Help | mint-seo | L | **done 2026-11-23** (one-tab Defaults/Link previews/Redirects/Tracking pages, "Pages & SEO" wording, sidebar highlight per tab, Connection Worker switches + Disconnect) ; Help guide, `use_seo` in panel/commerce logins done (part 2) |
| SP-09 | Daily connection re-check + Worker health ping → `attention`, banner, email, notification (D7) | backend + mint-seo | M | **done 2026-11-23** (`seoWatch.function.ts`: hourly tick, check a day old, claim on `lastCheckAt`; Worker ping noted from `/site/edge`; email + tenant notification on each change; Check now; red banner; Worker version + update available) |
| SP-11 | Tenant side: make an SEO project + its logins (Panel users page), demo login for the website | mint-tenant + backend | S | **done 2026-11-23** (New project → Website → “SEO for a site I already have”; SEO logins page with SEO admin / Super admin, no roles; demo login is view only — `SEO_DEMO_PERMISSIONS`). The real demo site + its link on the websites waits for the backend deploy |

**Phase 2**

| WO | Title | Repo | Size | Status |
|---|---|---|---|---|
| SP-10 | Self sign-up for SEO (creates org + `edition: 'seo'` project + owner login), welcome email, plan limits | backend + mint-seo | L | later (Q1, Q6) |
| SP-12 | Connect Cloudflare with a scoped token: install/update/remove the Worker (= site-connect SC-11) | backend + mint-seo | L | later (Q3) |
| SP-13 | SEO logins' own AI over MCP: `suggest_seo`, pages, health, link preview tools (allowlist like commerce-mcp) | backend | S | later (Q5) |
| SP-14 | Weekly SEO email: visits, top pages, new issues, pages without SEO | backend | S | later |
| SP-15 | Pattern rules for big sites (= site-connect SC-07) | backend + mint-seo | M | later |
| SP-16 | Search Console connection (= SEO-15) on the Home page | backend + mint-seo | L | planned in `../search-console` (GS-07 = the SEO app's tab + Home card) |

Order: SP-00a…e → SP-01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 11. Phase 2 after the user's answers.

## Handoff

- 2026-11-22: plan drafted (README + this file) with the customer guide `docs/site-connect/guide/cloudflare-seo-analytics.pdf`
  (HTML source beside it, rendered with headless Chrome). Open questions 1–6 in README.
- 2026-11-22: SP-00a/b, SP-01, SP-02 built (backend). Details and the next step in `HANDOFF.md`.
