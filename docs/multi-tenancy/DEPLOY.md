# Multi-tenancy — deploying

What has to happen outside the code for the tenant platform to work in
production. Each step touches shared systems; none of them has been run
against production yet (all were verified on a scratch database).

## 1. Backend (Heroku, `mint` remote, branch `v3`)

1. Push `v3` (the code is backwards compatible: the super-admin panel is
   unchanged — `scripts/checkRouteParity.js` → 0 problems).
2. Set config vars:
   | Var | Example | Used for |
   |---|---|---|
   | `TENANT_FRONTEND_URL` | `https://app.mintapp.shop` | links in emails (reset password, invitations), MCP links |
   | `TENANT_WEBAUTHN_ORIGIN` | `https://app.mintapp.shop` | passkeys for tenant users (comma-separated list allowed; defaults to TENANT_FRONTEND_URL) |
   | `TENANT_WEBAUTHN_RP_NAME` | `MINT` | the name shown when saving a passkey |
   | `PUBLIC_API_URL` (optional) | `https://api.mintapp.shop` | the API origin the MCP's website tools hand out for sites (`/public/api/…`, track.js); defaults to the host the MCP request came in on |
3. Index migration — **automatic**: on boot the server swaps the old
   single-field unique indexes (`modeldefinitions` name/route,
   `routesettings`/`routeconfigs` route, `dashboardconfigs` key, `folders` slug)
   for compound per-scope ones (`library/functions/tenantIndexes.function.ts`;
   the log says `Tenancy: <collection> — … now unique per project`). Index
   changes only, no documents touched; a no-op once done. Without it a project's
   `Client` collides with the platform's, or another project's, and a second
   project's `default` upload folder fails. To look first (dry run) or run it by
   hand: `node scripts/migrateTenantIndexes.js [--apply]`.
4. Super-admin pages: `npm run build && node scripts/seedTenancyAdmin.js`
   (permissions + the "Tenants" sidebar section).
   **Done 2026-10-02** on the `e-mint` database (Atlas): the three permissions
   upserted, "Tenants" sidebar section created. Safe to re-run.
5. **One collection per project (WO-43, D21)** — by hand, only on the user's
   yes. **Not run on production yet.** In this order:
   1. Deploy the WO-43 backend. It works on both layouts (a project model
      keeps its own collection until it's moved; new models go to
      `t_<projectId>`), and its first boot replaces `modeldefinitions`'
      `collectionName_1` with `collectionName_platform` (unique among
      super-admin models only — log: `collectionName now unique among
      super-admin models only`). The script refuses to run before that.
   2. Back up: `mongodump --uri "$MONGO_CONNECTION_URI" --out <dir>`.
   3. Dry run, and note the counts in the CHANGELOG:
      `npm run build && node scripts/migrateProjectCollections.js`.
   4. Stop the app (`heroku maintenance:on`, or scale `web=0`), then
      `node scripts/migrateProjectCollections.js --apply`. Per model it
      prints `moved N record(s)` or `NOT MOVED` (that model stays on its old
      collection and keeps working — run it again). Exit 1 on any problem.
   5. Start the app and check a few projects (tables, a record with links,
      its history, the public API).
   6. Later (days, the user's call): `node scripts/migrateProjectCollections.js
      --drop-old` drops each old `t_<projectId>_<route>` once every record in
      it is in `t_<projectId>`; anything else is kept and listed.
   Super-admin models, their collections, records and indexes are never read
   for writing or changed (the script selects project models only and stops
   on any project model whose collection isn't `t_<projectId>…`). Rehearsed
   on the scratch DB 2026-10-06: 43 models in 12 projects moved, every
   record identical, every other collection unchanged (CHANGELOG).

## 2. Tenant panel (a second Vercel project from the `admin` repo)

Same repo and branch as the admin panel; environment:

| Var | Value |
|---|---|
| `NEXT_PUBLIC_PANEL` | `tenant` |
| `NEXT_PUBLIC_BACKEND` | `https://<api host>/tenant/api` |
| `NEXT_PUBLIC_SIDEBAR_TYPE` | `server` |
| `NEXT_PUBLIC_URL` | `https://app.mintapp.shop` |

`NEXT_PUBLIC_TOKEN_NAME` isn't needed: the tenant build always keeps its token
under `MINT_TENANT_TOKEN` (constants.tsx), so it never shares a session with the
admin panel even if the admin's env is copied over. Its `/` is the public landing
page; the dashboard is `/dashboard` (panel.ts `HOME`).

Both builds were checked with `next build` (admin and `NEXT_PUBLIC_PANEL=tenant`).

## 3. After deploying

- Sign up on the tenant panel, create an app and a website project, and walk
  the pages — the click-through in a browser hasn't been done yet (the dev
  browser pane was hidden during development).
- Point a test page at `/public/widget.js` and `/public/track.js` with the
  website project's slug and check a sign-in and a page view arrive.
- Website settings (WO-38) need no migration step: each website project's
  `WebsiteSettings` record is created on its first read, copying the old
  "Site settings" table record and `TenantProject.site`. Owners remove the old
  table from Site setup → General when they're ready.
