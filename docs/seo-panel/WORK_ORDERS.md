# SEO panel — work orders

Plan: `README.md`. Draft 2026-11-22: **nothing is built**, and no WO starts until the user picks it and answers the
open questions it needs. When one is done: commit + push it (backend → `mint` v3; the new app → its own repo, main),
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
| SP-01 | Project `edition: 'seo'`, `WebsiteSettings.connection` (site-connect D1), migration none (new field) | backend | S | todo |
| SP-02 | Login `app: 'seo'`, `use_seo` answers on the other apps, fixed keys `seo:*`, `analytics:view`, `site:connect`, `site:tracking`, path allowlist; smoke `seo-panel.mjs` | backend | M | todo |
| SP-03 | `mint-seo` app: copy of mint-panel (APFS clone of node_modules), `IS_SEO_PANEL`, AuthFrame copy, SEO sidebar, hidden pages, Vercel project + domain | new repo | M | todo (Q2) |
| SP-04 | Setup gate: PanelGuard + proxy redirect to `/setup` until live; backend 409 `not_connected` on SEO writes | mint-seo + backend | S | todo |
| SP-05 | Setup wizard steps 1–2: address + detection (platform, Cloudflare NS/proxied, current SEO, snippet present), recommend a way | backend + mint-seo | M | todo |
| SP-06 | Setup wizard step 3: snippet per platform (tabs, screenshots); Cloudflare by hand (checklist, live DNS checks, *Copy Worker code*, key and routes with copy buttons) | mint-seo + docs | M | todo (after SP-00b) |
| SP-07 | Steps 4–5: ownership (page view from host / TXT `_mint.<domain>`), Test connection + Worker check, **Start using** → `live` | backend + mint-seo | M | todo |
| SP-08 | After live: Home (status, visits, health, checklist), Pages & SEO, Defaults, Link previews, Robots & sitemap (+ edge switches UI), Redirects, Analytics, Tracking, Health, Connection (Bypass, Disconnect), Help | mint-seo | L | todo |
| SP-09 | Daily connection re-check + Worker health ping → `attention`, banner, email, notification (D7) | backend + mint-seo | M | todo (Q4) |
| SP-11 | Tenant side: make an SEO project + its logins (Panel users page), demo login for the website | mint-tenant + backend | S | todo |

**Phase 2**

| WO | Title | Repo | Size | Status |
|---|---|---|---|---|
| SP-10 | Self sign-up for SEO (creates org + `edition: 'seo'` project + owner login), welcome email, plan limits | backend + mint-seo | L | later (Q1, Q6) |
| SP-12 | Connect Cloudflare with a scoped token: install/update/remove the Worker (= site-connect SC-11) | backend + mint-seo | L | later (Q3) |
| SP-13 | SEO logins' own AI over MCP: `suggest_seo`, pages, health, link preview tools (allowlist like commerce-mcp) | backend | S | later (Q5) |
| SP-14 | Weekly SEO email: visits, top pages, new issues, pages without SEO | backend | S | later |
| SP-15 | Pattern rules for big sites (= site-connect SC-07) | backend + mint-seo | M | later |
| SP-16 | Search Console connection (= SEO-15) on the Home page | backend + mint-seo | L | later |

Order: SP-00a…e → SP-01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 11. Phase 2 after the user's answers.

## Handoff

- 2026-11-22: plan drafted (README + this file) with the customer guide `docs/site-connect/guide/cloudflare-seo-analytics.pdf`
  (HTML source beside it, rendered with headless Chrome). Nothing built, nothing committed. Open questions 1–6 in README.
