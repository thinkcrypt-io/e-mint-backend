# SEO panel — a separate app for SEO projects

Draft plan, 2026-11-22. **Nothing is built.** Work orders: `WORK_ORDERS.md`. Builds on `docs/site-connect` (the snippet,
`/site/head`, the `mint-edge` Worker) and `docs/seo` (score, health, robots, sitemap, structured data, link previews).
Customer guide: `docs/site-connect/guide/cloudflare-seo-analytics.pdf`.

## The user's words (2026-11-22)

> draft plans on a separate panel for users of the SEO projects only. they'll log in and follow instructions on how to
> set up, if set up correctly can start using.

So: people who only want SEO and analytics for a site they already have get their own app. They sign in, a setup
wizard walks them through connecting the site (head snippet or Cloudflare), and the SEO screens unlock only once the
connection test passes. They never see models, the site builder, automations or developer tools.

## Shape

It follows the two panels we already run:

| App | Who | Built as |
|---|---|---|
| mint-commerce (commerce.mintapp.site) | store logins | copy of mint-tenant, `IS_COMMERCE_PANEL`, hidden pages, `app: 'commerce'` |
| mint-panel (panel.tcrypt.site) | panel logins for other projects | copy of mint-commerce, `app: 'panel'` |
| **mint-seo (new)** | logins of SEO projects | copy of mint-panel, `app: 'seo'`, setup gate, SEO-only sidebar |

The project comes from the login (token), never the URL — the same rule as mint-panel.

## Decisions (proposed — confirm the ones marked *Q*)

| # | Decision | Why |
|---|---|---|
| D1 | **An SEO project is a `website` project with `edition: 'seo'`** (new field on Project, default empty) and `WebsiteSettings.connection` from site-connect D1 (`mode: 'script' \| 'code' \| 'cloudflare'`, `siteUrl`, `hostnames[]`, `status`, `verifiedAt`, `lastSeenAt`, `cloudflare {}`). Not a new `type`. | Every website code path (Analytics, SEO, Site setup, `/site/head`, `/site/edge`, robots, sitemap) keys on `type === 'website'` and keeps working. `edition` only decides which app and which pages. |
| D2 | **New app `mint-seo`**, copy of mint-panel with `NEXT_PUBLIC_PANEL_APP=seo`, own Vercel project and domain (*Q2*: `seo.mintapp.site`?). Login sends `app: 'seo'`; a login whose project isn't `edition: 'seo'` gets 400 `use_panel` / `use_commerce`, and the other two apps answer `use_seo` for SEO projects. | Same pattern as CP and PU; one extra branch in `panelAuth.router.ts`. |
| D3 | **Who signs in** (*Q1*). Recommended: start with **panel logins** (PanelAdmin, made by us or an agency on the tenant Panel users page, username + password), then add **self sign-up** (SP-10) once billing exists. | Panel logins exist today (PU-08 usernames, demo links). Self sign-up needs billing and abuse limits first. |
| D4 | **Setup gate.** The app has two states. Until `connection.status === 'live'` every route except `/setup`, `/help` and `/account` redirects to `/setup` (PanelGuard + proxy.ts, as `commerceHiddenPath`). After that, the full sidebar. The backend enforces the same: SEO-write endpoints answer 409 `not_connected` before live. | "if set up correctly can start using." Doing it on the server too stops a stale tab writing SEO for a site that isn't connected. |
| D5 | **Live means:** the domain is the project's; ownership is proven (D6); the connection test passes (snippet found with this key *or* a page view from that host in the last 24 h; for Cloudflare, a page fetched through the Worker carries `data-mint-seo="edge"` or `x-mint-edge`). | One definition, computed by the existing `testConnection` (SC-08b) plus a Worker check. |
| D6 | **Ownership.** Snippet way: page views carrying the key arrive from the hostname (site-connect D11). Cloudflare way: a TXT record `_mint.<domain> = mint-verify=<project id>`. | Nobody points Mint's SEO or Worker at a domain they don't control. |
| D7 | **Losing the connection doesn't lock them out.** A daily re-check (and the Worker's own health ping) sets `status: 'attention'`: a red banner on every page, an email, a notification. Editing stays open; only `status: 'removed'` (they press Disconnect) re-closes the gate. | Locking people out of their own data because a theme update dropped the snippet would be hostile. |
| D8 | **Permissions.** Panel logins in SEO projects get fixed keys, not model keys: `seo:view`, `seo:edit`, `seo:publish`, `analytics:view`, `site:connect` (setup, Bypass, Disconnect), `site:tracking` (Site setup → Tracking). `superAdmin` panel logins get all and manage other logins. The backend path allowlist (as `PANEL_TOOLS` / commerce path guard) lists only the endpoints below. | Same as the store keys (`manage-store`, `manage-site`). Model keys make no sense to SEO users. |
| D9 | **The two ways offered** in setup: **Head snippet** and **Cloudflare (no code)**, plus a collapsed "I have a developer" with the server print (PHP / Node / Next.js). The wizard says plainly what the snippet can't reach (link previews, most non-Google crawlers). | The guide's table, in the app. |
| D10 | **Cloudflare in phase 1 is by hand** (the guide's steps, filled in, with "Copy Worker code" from a one-file bundle). **Connect with a token** (site-connect SC-11) is phase 2 and drops in as a third button on the same step. | The by-hand path works today; SC-11 needs SC-09 on a real zone first. |

## The setup wizard (`/setup`)

One page, five steps, each with a doc link to the guide's section (our rule: doc links on every step). Progress is
saved on `connection`, so they can leave and come back.

1. **Your site's address.** Type `acme.com`. We fetch it (siteCheck `fetchPage`) and show what we found: platform
   (generator meta, headers), whether DNS is on Cloudflare (NS lookup) and proxied, current title/description, whether
   Mint's snippet is already there, sitemap page count. Saves `siteUrl` + both hostnames into the project's domains.
2. **Choose how to connect.** Two cards: *Head snippet* and *Cloudflare (no code)*, with the comparison in plain words
   and a recommendation from step 1 (Shopify/Wix/Squarespace/Webflow → snippet only; on Cloudflare already → Worker;
   React app with one HTML shell → Worker).
3. **Do the steps.** Filled-in, per platform:
   - Snippet: the line with their key, platform tabs (WordPress, Webflow, Wix, Squarespace, Shopify, HTML, React, Next,
     Tag Manager) with where to paste it, screenshots per platform.
   - Cloudflare: Part A (move DNS, proxied, SSL Full strict) as a checklist with live checks where we can (NS and
     proxied via DNS lookup), Part B (create Worker, paste code — *Copy Worker code* button, `MINT_KEY` with a copy
     button, the two routes with copy buttons, fail open). Phase 2: *Connect with an API token* does Part B for them.
4. **Prove it's yours.** Snippet: "open your site once" and we wait for a page view from the host (live poll).
   Cloudflare: the TXT record with a copy button and a **Check** button.
5. **Test the connection.** The SC-08b test plus the Worker check. All green → **Start using Mint SEO** sets
   `status: 'live'`, `verifiedAt`, and opens the home page with a short tour. Anything red says what to fix and links
   back to the step.

## After setup (the sidebar)

| Page | What | Built from |
|---|---|---|
| **Home** | Status card (way, live / needs attention, last visit, Worker version + "update available"), visits this week, SEO health score, pages Mint handles, first-steps checklist (add 3 pages, set defaults, check a link preview) | analytics stats, SEO-03 health, first-steps pattern |
| **Pages & SEO** | The site's pages in one table: path, "now on the site" vs "from Mint", score, status; add a page; the VSeo editor per page; the SEO record page | SEO-20 record page, SEO-01 score, SC-04 discovery + SC-06 table (to build), SEO-02 (to build) |
| **Defaults** | Site name, default title/description/share image | Site setup → SEO (SB-33) |
| **Link previews** | What Facebook/WhatsApp/LinkedIn/X show for any address | SEO-14 |
| **Robots & sitemap** | robots.txt editor + crawler switches; sitemap; *Serve from Mint* switches (Worker only) | SEO-08, SEO-09, `WebsiteSettings.edge` |
| **Redirects** | From → to, 301/302 (Worker only; greyed with an explanation on the snippet) | Site setup → Redirects |
| **Analytics** | Overview · Visitors · Live, visitor journeys | WO-19, WO-56 |
| **Tracking** | GA4 / Tag Manager / pixels / verification tags | Site setup → Tracking |
| **Health** | Duplicates, gaps, conflicts across pages | SEO-03 |
| **Connection** | The test again, way in use, Bypass switch (Worker), switch way, Disconnect; the TXT and snippet for reference | SC-08b, `edge.bypass` |
| **Help** | The guide, contact support (support tickets) | mint-docs, WO support tickets |

**Hidden** (proxy + PanelGuard + backend allowlist): models, model/route/page/sidebar/dashboard builders, site
builder, automations, PDF templates, API keys and endpoints, MCP connect (until SP-13), webhooks, project settings,
members, store pages, reports builder.

## Backend allowlist (for `app: 'seo'` tokens)

`/site-config` (get + the SEO, robots, redirects, edge, tracking, domains parts only), `/site-config/connection`,
`/site-config/seo-health`, `/site-config/seo-page`, `/site-config/link-preview`, `/site-config/robots-preview`,
`/analytics/*`, the kit Pages and SEO routes (CRUD within `seo:*` keys), `/media` (share images only), `/support`,
`/auth/self`, plus new: `/connection/setup` (save wizard state), `/connection/verify-txt`, `/connection/worker-check`,
`/connection/disconnect`.

## What's missing today for this panel (from site-connect and seo)

Needed before or with the panel: page discovery (SC-04), the found-pages table (SC-06), pattern rules for big sites
(SC-07), panel UI for the Worker switches (Bypass, robots, sitemap — backend only), TXT ownership check (SC-11 part),
a one-file Worker bundle to paste, a real-zone run of the Worker (SC-09), Worker health checks + alerts, a branded API
address for the snippet (api.mintapp.shop answers 404; the snippet shows the Heroku address), and the
`EDGE_WORKER_VERSION` fix (backend says 1.0.0, the Worker is 1.0.1, so "update available" would be backwards).

Later: Search Console (SEO-15), whole-site audit (SEO-16), crawler/AI bot visits (SEO-18, SC-13), IndexNow (SEO-11),
merge the site's own sitemap/robots (SEO-10), hreflang (SEO-05), share-image maker (SEO-06), image alt check (SEO-07),
Connect Cloudflare with a token (SC-11), WordPress plugin / Shopify app (SC-12, SC-14), billing and plan limits, a
weekly SEO email report, change history with undo for SEO edits.

## Open questions for the user

1. **Who signs in:** panel logins made by us/agencies first (recommended), self sign-up from the start, or both?
2. **Domain:** `seo.mintapp.site` (like commerce.mintapp.site), `seo.tcrypt.site`, or something else? Product name?
3. **Cloudflare tokens (site-connect Q1):** OK to store an encrypted, scoped token so Mint installs and updates the
   Worker for them (phase 2)? Without it, every Worker update is by hand.
4. **Lock or warn:** D7 keeps editing open when a live site loses its connection (banner + email). Or lock again?
5. **Their own AI:** give SEO logins an MCP (like `/tenant/commerce-mcp`) with `suggest_seo` and page tools (SP-13)?
6. **Pricing:** free tier limits (one site, N pages Mint handles, visits per month) and paid plans — needed before
   self sign-up.
