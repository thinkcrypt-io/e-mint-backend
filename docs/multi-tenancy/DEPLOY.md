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
3. Index migration — **after** the new code is live:
   ```
   node scripts/migrateTenantIndexes.js          # dry run: what it will change
   node scripts/migrateTenantIndexes.js --apply
   ```
   Drops the single-field unique indexes (`modeldefinitions` name/route,
   `routesettings`/`routeconfigs` route, `dashboardconfigs` key, `folders` slug)
   after creating the compound per-scope ones. Until it runs, two projects (or a
   project and the super admin) can't both have a model/route of the same name,
   and a second project's `default` upload folder fails.
4. Super-admin pages: `npm run build && node scripts/seedTenancyAdmin.js`
   (permissions + the "Tenants" sidebar section).

## 2. Tenant panel (a second Vercel project from the `admin` repo)

Same repo and branch as the admin panel; environment:

| Var | Value |
|---|---|
| `NEXT_PUBLIC_PANEL` | `tenant` |
| `NEXT_PUBLIC_BACKEND` | `https://<api host>/tenant/api` |
| `NEXT_PUBLIC_TOKEN_NAME` | `MINT_TENANT_TOKEN` |
| `NEXT_PUBLIC_SIDEBAR_TYPE` | `server` |
| `NEXT_PUBLIC_URL` | `https://app.mintapp.shop` |

Both builds were checked with `next build` (admin and `NEXT_PUBLIC_PANEL=tenant`).

## 3. After deploying

- Sign up on the tenant panel, create an app and a website project, and walk
  the pages — the click-through in a browser hasn't been done yet (the dev
  browser pane was hidden during development).
- Point a test page at `/public/widget.js` and `/public/track.js` with the
  website project's slug and check a sign-in and a page view arrive.
