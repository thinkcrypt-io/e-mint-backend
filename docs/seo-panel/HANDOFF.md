# SEO panel — handoff for the next Claude session

Read this first if you are picking up the SEO panel work (for example from another Claude account after a usage
limit). It is written to stand alone: you won't have the previous session's memory files. Update the **Progress log**
and **Next step** at the end of every work order, and commit + push them with the WO.

## What we're building (one paragraph)

A separate app, **mint-seo**, for people who only want SEO and analytics for a website they already have. They sign
in, a setup wizard walks them through connecting the site (paste a head snippet, or add Mint's Cloudflare Worker
without code), and the SEO screens unlock only once the connection test passes. The plan: `README.md` (decisions D1–D10,
screens, allowlist, open questions) and `WORK_ORDERS.md` (SP-00…16). The customer guide:
`../site-connect/guide/cloudflare-seo-analytics.pdf` (HTML source beside it). The plan underneath:
`../site-connect/README.md` (snippet, `/site/head`, the `mint-edge` Worker) and `../seo/WORK_ORDERS.md` (SEO-01…20).

The user asked (2026-11-22): "draft plans on a separate panel for users of the SEO projects only. they'll log in and
follow instructions on how to set up, if set up correctly can start using." Then: "work on the seo panel, create
another doc, for another claude account to pick up where your work ends in case we hit weekly limit".

## Answers taken by default (the user didn't answer the open questions yet)

The user said "work on the seo panel" without answering README's open questions, so we went with the plan's
recommended answers. If the user answers differently, change course:

| Q | Default taken |
|---|---|
| Q1 who signs in | Panel logins (PanelAdmin, made on the tenant Panel users page). No self sign-up yet (SP-10 later) |
| Q2 domain | **seo.tcrypt.site** — the user said "set it up" on 2026-11-22 (same family as panel.tcrypt.site) |
| Q3 Cloudflare tokens | Not stored. Cloudflare is the by-hand path from the guide (SP-12 later) |
| Q4 lock or warn | Warn (banner + email), editing stays open (D7) |
| Q5 MCP for SEO logins | Later (SP-13) |
| Q6 pricing | Later |

## The repos and how they're used

All under `~/Desktop/proj/e-mint` (this folder is NOT a git repo; each app inside is its own repo).

| Folder | Repo / branch | Notes |
|---|---|---|
| `backend` | branch `v3`, push to remote **`mint`** (`git push mint v3`) | Node/Express/TypeScript + Mongo. Deploy to Heroku is manual, done by the user. Push ≠ deploy |
| `mint-tenant` | `origin` main | The tenant panel (Next.js). Where project owners work |
| `mint-commerce` | `origin` main (private), push = deploy to commerce.mintapp.site | Copy of mint-tenant with `IS_COMMERCE_PANEL`, store logins |
| `mint-panel` | `origin` main (private), push = deploy to panel.tcrypt.site | Copy of mint-commerce with `DEFAULT_APP='panel'` (env `NEXT_PUBLIC_PANEL_APP=panel`) |
| `mint-seo` | `origin` main (private, aiasifistiaque/mint-seo), push = deploy to **seo.tcrypt.site** | Copy of mint-panel, `NEXT_PUBLIC_PANEL_APP=seo`. Vercel project `mint-seo` prj_RegzyhJ7hMaqHiI1nqppSJtOEnd7 on the e-mint Hobby account (made with `backend/.env` `VERCEL_TOKEN`; the Vercel MCP connector is another account). Env: NEXT_PUBLIC_BACKEND (prod Heroku `/tenant/api`), _SIDEBAR_TYPE=server, _SITES_URL, _URL=https://seo.tcrypt.site, _PANEL_APP=seo |
| `mint-edge` | `origin` main (private) | The Cloudflare Worker: `src/index.js` (handlers only) + `src/lib.js` (helpers, `VERSION`) |
| `mint-docs` | `origin` main | Customer guides at docs.mintapp.shop |

## Rules the user set (follow them)

- **Commit + push every work order when it's done**, then go on. Stage only your own files: other Claude sessions
  edit these repos at the same time (`git status` shows their files; never `git add -A`, never stash/reset/switch
  branches). Commit with a pathspec: `git commit -m … -- <your paths>`.
- **Don't run bare `prettier`** (no config; it reformats away from the tabs + single-quote style).
- **Every modal** uses the shared Dialog + DialogHeader/Body/Footer; confirms/deletes use `PromptDialog`
  (pass `tone='default'` for non-delete dialogs). Dropdowns use the cl `Dropdown`, never NativeSelect.
- **Doc links on every step** of a new tool (link to the guide's `#anchor`).
- **No server-side AI calls**: AI features go through the user's own AI over MCP.
- **Plain words** in the UI, no jargon.
- **Never import `store/store.ts` from a feature module** in the panel apps (import cycle → logs users out).
- **RTK Query endpoint names are global**: grep before adding one; a duplicate name is silently dropped.
- In the panel apps set the token with `dispatch(refreshAuth(t))`, never by writing localStorage directly.
- **Never kill dev servers by port**: other sessions use shared ports (5011, 27998…). Use your own ports.
- Keep `backend/docs/seo-panel/WORK_ORDERS.md` (Status + Handoff) and this file current after every change.

## How the existing pieces work (what you build on)

- **Panel logins** (`library/models/tenancy/panelAdmin.model.js`, `library/functions/panelAdmin.function.ts`):
  one login = one project. `panelAccess(admin, project)` gives the permission keys; `panelMayReach` limits a panel
  token to `/tenant/api/p/<project>/…` and `/tenant/api/panel/auth/…`; `signInPanel` runs inside
  `middleware/tenant/protect.tenant.middleware.ts` for tokens with `kind: 'panel'`.
- **Login** `routes-tenant/panelAuth.router.ts`: `POST /tenant/api/panel/auth/login { username|email, password, app }`.
  `signIn()` refuses the wrong app (`use_panel` / `use_commerce`). SP-02 adds `app: 'seo'` and `use_seo`.
- **Projects** `library/models/tenancy/tenantProject.model.js`: `type` is `'website' | 'ecommerce' | …`. SP-01 adds
  `edition` (`'seo'` for SEO projects).
- **Website settings** (`WebsiteSettings`, `library/functions/siteConfig.function.ts`): SEO defaults, tracking, tags,
  redirects, domains, `edge {bypass, robots, sitemap}`. SP-01 adds `connection`.
- **Connect a site (built, see site-connect CHANGELOG):** `GET /public/api/site/head?path=` (`siteHead.function.ts`),
  `track.js data-seo` (`routes-public/track.ts`), Test connection `POST /tenant/api/p/:id/site-config/connection`
  (`siteConnection.function.ts`), Worker settings `GET /public/api/site/edge` (`siteEdge.function.ts`).
- **Tenant panel screens to reuse in mint-seo:** `mint-tenant/src/app/website-setup` (Existing website tab, snippets in
  `_components/snippets.ts`, `ConnectionTest.tsx`), `app/site-setup` (SEO defaults, Tracking, Redirects, Robots, Link
  previews), `app/t/_seo` (SEO record page, health card, link preview), `app/analytics`.

## Running it locally

- Backend: build once with `cd backend && npx tsc` only if nobody else is using `backend/dist`; safer is a private
  build: `npx tsc --outDir <scratch>/be/dist`, then in `<scratch>/be` symlink `node_modules`, `docs`, `public`, `.env`,
  `library/siteBuilder/blockManifest.json`, copy `scripts/`, and run `node dist/server.js` from there with your own
  `PORT` and `MONGO_CONNECTION_URI` (start your own `mongod --dbpath <scratch>/db --port <yours>` in the background).
  Don't use ports 5060/5061/6000/6665–6669 (Node's fetch refuses them).
- Smoke tests live in `backend/scripts/tenancy-smoke/*.mjs` and run against a backend: `SMOKE_ROOT=http://localhost:<port> node scripts/tenancy-smoke/<file>.mjs`.
- Panel apps: `npx next dev -p <port>` with `NEXT_PUBLIC_BACKEND=http://localhost:<port>/tenant/api`,
  `NEXT_PUBLIC_SIDEBAR_TYPE=server`, `NEXT_PUBLIC_PANEL_APP=seo`. Copying an app: rsync without `node_modules`/`.next`,
  then `cp -cR <src>/node_modules <dst>/` (APFS clone; Turbopack refuses a symlinked node_modules).
- Type-check: `npx tsc --noEmit` (in mint-tenant filter `grep -v '^\.next'` while a dev server compiles).

## Progress log

| Date | WO | What | Commit |
|---|---|---|---|
| 2026-11-22 | plan | Guide PDF + README + WORK_ORDERS | backend 324d21eb |
| 2026-11-22 | handoff | This file | with SP-00a |
| 2026-11-22 | SP-00a | `EDGE_WORKER_VERSION` = `EDGE_WORKER_FILE_VERSION` from the generated `library/edge/edgeWorker.code.ts` (1.0.1) | see git log |
| 2026-11-22 | SP-00b | mint-edge `npm run bundle` → `dist/mint-edge.js` + backend `library/edge/edgeWorker.code.ts`; `GET /public/edge/mint-edge.js` (text, `X-Mint-Edge-Version`). After any Worker change: bump `VERSION` in mint-edge `src/lib.js`, run `npm run bundle`, commit both repos | mint-edge + backend |
| 2026-11-22 | SP-01 | `TenantProject.edition` (`PROJECT_EDITIONS = ['seo']`; Joi refuses it unless `type: 'website'`), in `publicProject` and the panel login answer. `WebsiteSettings.connection` {mode, siteUrl, hostnames, status setup/live/attention/removed, step 1–5, detected, txt, verifiedAt, liveAt, lastCheckAt, lastCheck, attentionReason}; `connectionOf()` / `connectionOpen()` in `siteConfig.function.ts`; `connection` in the site-config answer | see git log |
| 2026-11-22 | SP-02 | `library/functions/seoPanel.function.ts`: `isSeoProject`, `SEO_PANEL_PERMISSIONS` (model keys of `pages` + `seo`, `view/create/edit-image`, `view-analytics`, `manage-site`; super admins + `manage-panel-users`), `seoPanelGuard` (path allowlist → 403 `SEO_PANEL_ONLY`; before live only setup paths → 409 `NOT_CONNECTED`), `seoNav`/`seoSidebar`. Wired in `panelAccess`, `panelAuth.router` (`app: 'seo'`, `use_seo`), `panelAdmins.router` (no role needed), `project.router` (guard after the project loader, SEO sidebar). Smoke `scripts/tenancy-smoke/seo-panel.mjs` 49/49 | see git log |
| 2026-11-22 | SP-03 | `e-mint/mint-seo` (local git only, no remote — Q2): copy of mint-panel, port 3730, `DEFAULT_APP = 'seo'` in `src/components/library/config/lib/constants/panel.ts` (`IS_SEO_PANEL`, `SEO_PAGES`, `SEO_TABLES` {seo, pages}, `seoHiddenPath` inside `commerceHiddenPath`, `SEO_SETUP_PAGES`). Login: `app: 'seo'`, SEO copy in `auth/login/page.tsx` + `AuthFrame.tsx`, `use_seo` → `NEXT_PUBLIC_SEO_URL`. `.claude/launch.json` (e-mint root) has a "mint-seo" config. Media moved into the SEO section of `seoNav` | mint-seo 117b5a1 + backend d135c12b |
| 2026-11-22 | SP-04 | Setup gate in mint-seo `PanelGuard.tsx`: once signed in and the project is known (`getProjectSlug()`), reads site-config; not live/attention → every page outside `SEO_SETUP_PAGES` goes to `/setup`. First pages: `src/app/setup` (choose a way, snippet or Cloudflare steps with this site's key + Copy Worker code, connection test = mint-tenant's `ConnectionTest`), `src/app/help`, `src/app/connection`, home `src/app/_seo/SeoHome.tsx` (dashboard shows it when `IS_SEO_PANEL`), shared bits `src/app/_seo/parts.tsx`. Checked in the browser against a private backend: before live only Setup/Panel users/Help, after live the full sidebar, /t/seo and Defaults open | mint-seo 117b5a1 |
| 2026-11-22 | SP-03 deploy | Repo aiasifistiaque/mint-seo (private), Vercel `mint-seo`, domain seo.tcrypt.site, first deploy READY. **Sign-in there fails until the user deploys the backend to Heroku** (prod answers `app must be one of [commerce, panel]`) | mint-seo 117b5a1 |
| 2026-11-22 | SP-05 | `POST /seo-setup/detect {url}` (`routes-tenant/seoSetup.router.ts`, logic in `library/functions/seoSetup.function.ts`; needs `build` or `manage-site`, website projects only): fetches the page (siteCheck `fetchPage`, which now also returns `headers`; a scheme-less address falls back to http), finds platform (`platformOf`: generator meta, wp-content, wixstatic, squarespace, data-wf-site, cdn.shopify, framer, ghost, `__next`, empty `#root` = spa), `proxied` (cf-ray / server: cloudflare), `cloudflare` (NS lookup up the labels), title/description/og:image/canonical, our snippet (`ours`/`other`/`none`, `snippetSeo`), Worker (`x-mint-edge`), sitemap.xml page count; `recommendWay` (Worker present → cloudflare; hosted builders → script; on Cloudflare or SPA → cloudflare; else script). Saves `connection.siteUrl` (final origin), `hostnames` (host + www pair), `detected`, `step ≥ 2`, and adds the hosts to the project's domains (max 20). mint-seo setup page: step 1 address + `Found` (in `_seo/parts.tsx`), way preselected from the recommendation ("Suggested" tag), steps 2–4 show once there's an address, Cloudflare routes from `hostnames`. Smoke 61/61; checked in the browser against a fake WordPress page | see git log |
| 2026-11-22 | SP-06 | `POST /seo-setup/way {mode}` (`chooseWay` in `seoSetup.function.ts`; `script`/`cloudflare`, else 400; sets `connection.mode`, `step ≥ 3`). mint-seo setup page: picking a card saves the way (`useChooseSeoWayMutation`); snippet way step 2 = platform tabs `PastePlaces` (WordPress, Webflow, Wix, Squarespace, Shopify, HTML, React, Next.js, Tag Manager; the detected platform opens first, tagged “yours”); Cloudflare way step 1 = live `CheckRow`s (nameservers on Cloudflare, proxied) + “Check again” (re-runs `/seo-setup/detect`), step 4 ends with a `CheckRow` that `detected.worker` is set. `CheckRow`/`PastePlaces`/`PASTE_PLACES` in `_seo/parts.tsx`. Smoke 66/66. **Screenshots skipped** (text only); not yet checked in the browser (tsc clean) | see git log |
| 2026-11-22 | SP-07 | `POST /seo-setup/verify` (`verifyOwnership`: a pageview from one of `connection.hostnames` since `detected.checkedAt`, or the Worker's `x-mint-edge` header, or TXT `_mint.<domain>` = `mint-verify=<project id>`; saves the TXT value on `connection.txt`) and `POST /seo-setup/start` (`startUsing`: owned + `testConnection` with no `missing` item → `status: 'live'`, `step 5`, `liveAt` (kept), `verifiedAt`, `lastCheck`; else 409 with why). mint-seo setup step 4: connection test, then “Is this site yours?” (3 `CheckRow`s + Check + the TXT value) and **Start using Mint SEO** → `/`. Smoke now goes live through the endpoint (no Mongo shortcut for the status). tsc clean. **Checked in headless Chrome (CDP) against a private backend 2026-11-22**: login → gate to /setup → address → cards save the way → Check (not yet) → Start using refused with why → a visit → Check owned → Start using → Home with the full sidebar. Fixed from that: sidebar refresh after Start using, ownership as its own panel 5, unknown Cloudflare lookup no longer shown as “not yet”. The connection test box uses `https://<domain>`, so a plain-http test site (localhost) can't be tested from it — fine for real sites | see git log |
| 2026-11-23 | SP-08 (part 1) | `POST /seo-setup/disconnect` (`disconnect` in `seoSetup.function.ts`: status `removed`, step 1, address kept, `edge.bypass` true so the Worker passes everything through; `startUsing` lifts the bypass again when it was removed). mint-seo: `/site-setup?tab=` shows ONE tab with the sidebar's own name (Defaults = seo, Link previews, Redirects, Tracking; no tab bar, no site-builder buttons) and its Layout `path` is `site-setup-tab-<tab>` so the sidebar highlight matches; `_seo/words.ts` `seoWords()` rewrites "Website → Pages/SEO" to "Pages" / "Pages & SEO" in the health card + connection test, `sidebarTag()` for refreshing the sidebar; Connection page: Cloudflare Worker switches (robots, sitemap, bypass via `PUT /site-config {edge}`; cloudflare way only) + Disconnect (PromptDialog, refreshes the sidebar, goes to /setup). Smoke gained switch + disconnect cases (all passed); browser-checked in headless Chrome. The account menu's Themes opens the colour-theme dialog (not /purchased-themes), so left as is | mint-seo + backend commits |
| 2026-11-23 | SP-08 (part 2) | mint-docs guide `/seo-connect` (anchors address, choose-a-way, ownership, test, after, disconnect, faq; registered in `guides.ts`), pushed → Help and every "How this works ↗" link now resolve; mint-panel + mint-commerce login and demo pages send `use_seo` to `NEXT_PUBLIC_SEO_URL` (default https://seo.tcrypt.site). Home was read against the list: it has status, visits and next steps (no health score/checklist — left out on purpose, Pages & SEO has the health card). "Copy Worker code" CORS on prod is still untested | mint-docs 1a2d8f0 + panel/commerce commits |
| 2026-11-23 | SP-09 | `library/functions/seoWatch.function.ts`: `scheduleSeoWatch()` (server.ts) ticks hourly and re-checks every live/attention SEO site whose `connection.lastCheckAt` is a day old, claiming it with a conditional update so two dynos never both check. Cloudflare way OK = the page answers with `x-mint-edge`, or the Worker pinged in the last 2 days; snippet way OK = our track.js tag with this key in the HTML, or a pageview from the site's hostnames in 3 days. A site that doesn't answer is asked again after 5 s. Fail → `status: 'attention'` + `attentionReason`; pass → back to `live`. Only a change of status tells people: tenant notification (`seo-attention` / `seo-live`, audience `manage-site`) + an email (Mint's own SMTP, `sendMail`; dev mail to example.com/*.test is logged) to the project's active panel logins with an email and those members; link `SEO_APP_URL` (default https://seo.tcrypt.site)/connection. The Worker's ping: `/site/edge` notes `connection.edgeSeenAt` / `edgeVersion` from its `x-mint-edge` header (at most hourly or on a new version); `connectionOf` also answers `edgeLatest`. `POST /seo-setup/recheck` = Check now. mint-seo: `SeoAttention` red banner at the top of every page (Layout; not on Connection), Connection gets Check now, the Worker's version + "update available" and Copy Worker code; mint-docs `/seo-connect#needs-attention` + `#update-worker`. Env knobs for tests: `SEO_WATCH_MS`, `SEO_WATCH_DUE_MS`, `SEO_WATCH_RETRY_MS`. Smoke gained 14 SP-09 cases incl. the schedule (all passed); browser-checked banner → Check now → cleared | backend + mint-seo + mint-docs commits |

## Next step

**SP-11: the tenant side** — in mint-tenant, make an SEO project (`edition: 'seo'`, today API only) and its logins on the
Panel users page, plus a demo login for the website (as DL-01…06 did for stores). SP-01…09 are done; the backend isn't
deployed (the user deploys to Heroku by hand). After a deploy, check on prod: "Copy Worker code" fetch from the browser
(CORS), and that the hourly watch runs (look for `seo watch` errors in the logs).

Before anyone uses seo.tcrypt.site: the user deploys the backend (SP-01/02 code) to Heroku. Making SEO projects in the
tenant panel (`edition: 'seo'`) has no UI yet — SP-11 adds it; until then make one through the API (`POST /tenant/api/projects {name, type: 'website', edition: 'seo'}`).

Facts the next WOs need:
- An SEO login's token is a normal panel token; `GET /tenant/api/panel/auth/self` answers `role.name` "SEO admin" or
  "Super admin" and the keys above. The login answer's `project.edition` is `'seo'`.
- The WebsiteSettings doc is made lazily (first `GET /site-config`), so no doc = status `setup`.
- Before live an SEO login may: `GET /`, `GET /sidebar/*`, `GET /project-key`, `/seo-setup/*`, `GET /site-config`,
  `POST /site-config/connection`, `/panel-users/*` (super admins). Anything else on the allowlist answers 409.
- Run the smoke: `SMOKE_ROOT=http://localhost:<port> SMOKE_MONGO=mongodb://127.0.0.1:<mongo>/<db> node scripts/tenancy-smoke/seo-panel.mjs`
  (`demo-logins.mjs` also needs `JWT_PRIVATE_KEY` from `.env` in the shell).
- Later (not built): `/support` isn't reachable by panel tokens (`panelMayReach`), so Help can only link the guide
  and an email until support tickets accept panel logins.
