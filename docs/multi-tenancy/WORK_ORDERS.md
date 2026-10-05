# Multi-tenancy — work orders

Read `README.md` first (decisions D1–D21 and the architecture).
Each item: **files → change → done when**. `BLOCKER` gates later items.
Sizes: **S** ≤ 1h, **M** ≤ half a day, **L** ≤ 2 days.
Paths are from the monorepo root `/Users/asifistiaque/Desktop/proj/e-mint`.
Update the **Status** column and `CHANGELOG.md` as each item lands.

## Handoff — read this first (kept current; last updated 2026-10-05)

**2026-10-05 — production database moved.** Production now runs on its own
Atlas cluster in AWS N. Virginia (us-east-1), next to the Heroku app (US). The
old shared cluster (Mumbai) had hit its 500-collection cap, which counts every
database on the cluster (each tenant model is a collection), and the distance to
Heroku made heavy builds 30–50× slower (template previews: 100–200 s → 3–5 s).
Copied with mongodump/mongorestore; all 262 collections matched on documents
and indexes. The old `e-mint` database is kept untouched as a rollback — delete
it only on the user's yes. Free and Flex Atlas tiers cap collections at 500:
count before anything that creates many models.

**This file is the to-do list and the hand-over.** An agent picking this up:
read this section, then `README.md` (decisions D1–D21), then the open WO
below. When an item lands, set its Status here, add a `CHANGELOG.md` entry
(what, files, how verified), and update this section if anything in it
changed. Never leave work done but untracked here.

**Repos and branches** (monorepo `/Users/asifistiaque/Desktop/proj/e-mint`):
- `admin/` — Next 16 + Chakra v3. Super-admin panel *and* tenant panel (same
  app, `NEXT_PUBLIC_PANEL=tenant`). Remote `origin`
  (aiasifistiaque/mint-admin). **Branch `main`** — the deploy branch for both
  panels (Vercel). `v3` is frozen.
- `backend/` — Express + Mongoose. Remote **`mint`**
  (thinkcrypt-io/e-mint-backend), **branch `v3`**. Never push to `origin` or
  `boilerplate`.
- Commit/push only when the user asks. Commit messages end with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Where it stands:** WO-01…33 done; WO-01…32 pushed (backend `v3` `942ba57e`,
admin `main` `007fa59`). **Open:** nothing numbered. WO-01…37 pushed (backend `v3` `9d7e6915`, admin
`main` `a3327d4`; sticky footer `ba88b4b`). **WO-38 and WO-39 pushed** (backend `v3` `27a9d495`, admin `main` `835b64b`). **WO-40 pushed** (public API list filters + docs, 2026-10-04: backend `v3` `65c397dc`, admin `main` `3b902d8`). **WO-42 pushed** (public API read-only fields, 2026-10-05: backend `v3` `a4e012bf`, admin `main` `136e33f`; not deployed). **WO-43 done 2026-10-06** (one collection per project, D21; admin `main` `e847dcb`): code, `scripts/migrateProjectCollections.js`, `collections.mjs` + `migration.mjs` suites; rehearsed on the scratch DB. **Production migration not run** — only on the user's yes, after the backend is deployed (DEPLOY.md §1.5). Anything new that calls a model's collection directly must add `ownRecordsOf(Model)` (`projectIndexes.function.ts`); never `syncIndexes()` a project model. **Messaging M-02 done 2026-10-06** (docs/messaging CHANGELOG): Organization → Email, each organization's own SMTP via nodemailer; shared `mailsettings` / `mailmessages`. **Site widgets W-05 (shop + cart) done 2026-10-05** (docs/widgets CHANGELOG): adds one shared scoped collection `sitecarts`; `functions/shop.function.ts` reads and writes tenant models only through their compiled Mongoose models (safe under WO-43's discriminators). Next candidates: Known gaps, Follow-ups — ask the user. See the Status table.

**Not deployed yet** (DEPLOY.md): the backend `v3` on Heroku (its first boot
swaps the old global unique indexes, `ensureTenantIndexes`) with
`TENANT_FRONTEND_URL`, `TENANT_WEBAUTHN_ORIGIN`, `TENANT_WEBAUTHN_RP_NAME`; and
the tenant panel's own Vercel project from `main` with `NEXT_PUBLIC_PANEL=tenant`,
`NEXT_PUBLIC_BACKEND=https://<api>/tenant/api`, `NEXT_PUBLIC_SIDEBAR_TYPE=server`.
`seedTenancyAdmin.js` is **done** on the Atlas `e-mint` DB (2026-10-02).

**Run it locally** (launch configs in `.claude/launch.json`):
- scratch Mongo: `mongod --dbpath <scratch>/mongo --port 27999` (foreground —
  `--fork` fails on macOS)
  (DB `emint_tenancy_dev`; `node backend/scripts/seedTenancyDev.js` seeds it);
- `backend-test` → :5001 (`node dist/server.js`, so **`npm run build` after
  every backend change**, then restart); `tenant` → :3001; `admin-test` → :3002.
- Tests: `bash backend/scripts/tenancy-smoke/run-all.sh` (all suites must
  pass). Repeated runs hit the sign-up rate limit (429) — restart the backend.
  To leave a running :5001 alone, use the `backend-scratch` launch config
  (:5011, Mongo :27998) and `SMOKE_ROOT=http://localhost:5011
  SMOKE_MONGO=mongodb://127.0.0.1:27998/emint_tenancy_dev sh run-all.sh`
  (`tenant-scratch` → :3011 is the tenant panel against it). `public.mjs`
  expects a fresh project — re-run the whole suite, not it alone.
- `npx tsc --noEmit -p .` in each repo. In `admin/` the only expected error is
  a stale `.next/dev/types/validator.ts` (deleted `docs/tenancy` page) —
  local dev artefact, not in a clean build.
- The desktop browser pane may be hidden (React stalls); the headless
  `agent-browser` CLI works for UI checks. First compiles after a restart
  take 30–60s per page.

**Marketing website** (`mint-webpage/`, WO-41): its own repo (aiasifistiaque/mint-website, branch `main`), launch config `mint-webpage` (:3100). When a product change ships, update the site in the same piece of work — `src/content/*` (features, changelog, workflow, personas) and the drawings in `src/components/mock/mocks.tsx`; see its README.

**User docs site** (`mint-docs/`, WO-44, 2026-10-06): the 19 user guides as their own static site for **docs.mintapp.shop** (Next 16 + Tailwind, the marketing site's look), launch config `mint-docs` (:3200). Local git repo only (`main` `55cc671`) — no GitHub repo, Vercel project or DNS yet. Paths and `#anchors` match the app's `/user-docs/*` without the prefix. Until the app's `docsPath()` links point there, **a guide change goes in both** (admin `src/app/user-docs/*` and `mint-docs/src/app/*`); the prose pieces have the same names and props, so a page copies across. See its README.

**Conventions that bite:**
- Tenant code runs inside a scope (AsyncLocalStorage, `tenantScoped`
  plugin). Never `mongoose.models[name]` in code a project reaches — use
  `scopedModel(name)`; a plain `Client` there is the *platform's* model.
- Tenant panel addresses are `/<publicSlug>/<page>` (D18, `src/proxy.ts`);
  build links with `projectHref()` / `pagePath()`; the project comes from the
  URL (`getProjectSlug()`), and the RTK cache key includes it.
- Home is `HOME` (panel.ts), never `'/'`. Tenant docs live in `/user-docs`
  (update the guide with the feature; link with `GuideLink` / `docsPath`).
- Admin UI rules: Chakra tokens not hex; cl `Dropdown` (no NativeSelect);
  `PromptDialog` for confirms; `ModalFooter`; no backdrop blur; no bare
  prettier (tabs, single quotes).

## Status

| WO | Title | Repo | Size | Status |
|---|---|---|---|---|
| 01 | Plan & docs | backend | S | done |
| 02 | Identity & organization models | backend | M | done |
| 03 | Scope context + `tenantScoped` plugin + index migration — BLOCKER | backend | L | done (migration `--apply` pending, WO-08) |
| 04 | Session and two-factor services made model-agnostic | backend | M | done |
| 05 | Tenant auth API (register + onboarding, login, 2FA, sessions, passwords) | backend | M | done |
| 06 | Organizations: members, roles, invitations, switch | backend | M | done |
| 07 | Projects API | backend | S | done |
| 08 | Tenant model registry (compile/mount per project) — BLOCKER | backend | L | done |
| 09 | Project router `/tenant/api/p/:projectId` (builder, sidebar, dashboard, media) | backend | L | done (notifications: follow-up, D12) |
| 10 | Tenant MCP `/tenant/mcp` + project API keys | backend | M | done |
| 11 | Public API per model + project customers + login widget | backend | L | done (tenant-panel controls: WO-15) |
| 12 | Panel mode, per-request API base, token, route guard — BLOCKER | admin | M | done |
| 13 | Tenant auth pages (register questionnaire, login, 2FA, invite accept) | admin | M | done |
| 14 | Organization console (switcher, projects, members, roles, account) | admin | L | done (click-through pending a visible browser) |
| 15 | Project workspace (sidebar, builders, dashboard, MCP, public API) | admin | L | done (click-through pending a visible browser) |
| 16 | Super-admin oversight pages (organizations, tenant users, projects) | both | M | done (seed pending on the shared DB) |
| 17 | Isolation tests, parity check, guide | both | M | done |
| 18 | Website projects: website kit (settings, pages, SEO, contents) + site API | backend | L | done |
| 19 | Website analytics (tracker, events, reports) + website workspace UI | both | L | done |
| 20 | User guides `/user-docs` — the tenants' documentation | both | M | done |
| 21 | Standard role permissions (records view/add/edit/delete + specific), no per-model keys | both | M | done |
| 22 | Project access per member and per invitation | both | M | done |
| 23 | Media library per project or shared by the organization | both | S | done |
| 24 | Several organizations: invitations in the app, every workspace listed | both | M | done |
| 25 | Tenant landing page at `/`, dashboard at `/dashboard`, own token key | admin | M | done |
| 26 | Files → Media library in the sidebar for record users; tenant forms always in a drawer | both | S | done |
| 27 | Model names are the project's own (scoped indexes at boot, scoped model lookups, MCP told) | both | M | done |
| 28 | Project addresses `/<project>/<page>` (D18) | both | L | done |
| 29 | Project-aware API cache (no project items outside a project) | admin | S | done |
| 30 | MCP: dashboard builder tools | backend | S | done |
| 31 | Per-record access on tenant models (D19) | both | M | done |
| 32 | Public API page: API reference + request tester | admin | M | done |
| 33 | **A website built by an AI through the MCP, managed from the panel** | both | L | done |
| 34 | **Website workspace: site setup page (tags, pixels, head code, headers, redirects, robots/sitemap, domains), website overview on the home dashboard** + bugs (kit `page` field vs paging, Home → another project's dashboard) | both | L | done |
| 35 | **New-project wizard: app → build your first model; website → name, logo, favicon** | both | M | done |
| 36 | **History in every project** (who changed what, per project) | both | M | done |
| 37 | **Notifications for every tenant user** (bell, per project and organization) | both | M | done |
| 38 | **Website settings: one `WebsiteSettings` record per project (no Site settings table), AGS-style cards, server-side tracking, check the site** | both | L | done |
| 39 | **Model builder: Password field kind (encrypted, revealed with your own password), searchable dropdowns, code prefix filled in** | both | M | done |
| — | **Bug: inviting someone to a project doesn't work** (user report 2026-10-02) | admin | S | done (accept form sent an empty name) |
| 40 | **Public API lists: the admin lists' filters (`field_op=value`), search, multi-sort, `fields`; documented in the API reference, user guide and MCP** | both | M | done |
| 41 | **Marketing website (`mint-webpage/`, repo aiasifistiaque/mint-website `main`) + waitlist: `POST /public/waitlist`, `Waitlist` model, super-admin `/waitlist` table, `scripts/seedWaitlist.js`** | backend + website | M | done (both pushed; seed + deploy pending) |
| 42 | **Public API read-only fields (`publicApi.readOnlyFields`, template `endpoints[].readOnly`): a customer can't create an order as `paid`** | both | M | done (pushed: backend `a4e012bf`, admin `136e33f`) |
| 43 | **One collection per project (D21): a project's models share `t_<projectId>` with a `_model` field; per-model index manager; migration of existing projects** | both | L | done (scratch-verified; production migration pending the user's yes — DEPLOY.md §1.5) |

Execution order: 01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 12 → 13 → 14 →
15 → 10 → 11 → 18 → 19 → 16 → 17 → 20 → 21 → 22 → 23 → 24 → 25 … 32 → 33. (12–15 need 05–09; 18–19 need 08 and 11.)

---

## WO-01 — Plan & docs (S) — done
`backend/docs/multi-tenancy/{README,WORK_ORDERS,CHANGELOG}.md`, pointer in
`admin/docs/MULTI_TENANCY.md`. Done when an agent can start from README alone.

## WO-02 — Identity & organization models (M)
**Files** `backend/library/models/tenancy/` (new):
- `tenantUser.model.ts` — `TenantUser` (`tenantusers`): name, email (unique,
  lowercase), password (`select:false`, bcrypt), phone, image, isActive,
  emailVerified, `twoFactorEnabled`, `twoFactorEmail`, `twoFactorBackupCodes`
  (`select:false`), `twoFactorUpdatedAt`, `lastOrganization`, `onboarding`
  (answers, see below), timestamps. Same 2FA fields as `Admin` so the shared
  2FA service (WO-04) works on either.
- `organization.model.ts` — `Organization` (`organizations`): name, slug
  (unique), owner (TenantUser), logo, isActive, `onboarding` { businessName,
  industry, teamSize, role, website, country, heardFrom, heardFromOther, goals[] },
  plan (default `'free'`), timestamps.
- `organizationRole.model.ts` — `OrganizationRole`: organization, name,
  permissions [String] (`'*'` = everything), `system` (owner/admin/member
  seeded per org, not deletable).
- `organizationMember.model.ts` — `OrganizationMember`: organization, user,
  role, status (`active`|`removed`), invitedBy, joinedAt. Unique (organization, user).
- `organizationInvitation.model.ts` — `OrganizationInvitation`: organization,
  email, role, tokenHash (unique), invitedBy, expiresAt, acceptedAt,
  cancelledAt.
- `tenantProject.model.ts` — `TenantProject` (`tenantprojects`): organization,
  name, slug (unique per org; also globally unique `publicSlug` for the public
  API), description, icon, color, isActive, createdBy, timestamps.
- `_index.ts` exports.
**Done when** `npx tsc` is clean and the models load (`node -e` import).

## WO-03 — Scope context + plugin + index migration (L) — BLOCKER
**Files**
- `backend/library/functions/tenantScope.function.ts` (new): `runInScope`,
  `currentScope`, `runUnscoped`, `scopeFilter()`, the `tenantScoped` plugin.
  Fields added by the plugin: `organization` (ObjectId, index), `project`
  (ObjectId, index), default unset.
- Apply the plugin to: `ModelDefinition`, `RouteSettings`, `RouteConfig`,
  `RouteVersion`, `SidebarCategory`, `SidebarItem`, `DashboardConfig`,
  `ApiKey`, `BuiltFeature` (feature.model.ts), `Permission`? (**no** — tenant
  permissions are derived, see WO-06).
- Unique indexes become compound with `project`:
  `ModelDefinition {project, name}`, `{project, route}` (collectionName stays
  globally unique); `RouteSettings/RouteConfig {project, route}`;
  `DashboardConfig {project, key}`.
- `backend/scripts/migrateTenantIndexes.js` — drops the old single-field
  unique indexes and creates the compound ones. Idempotent; prints before/after.
- `dynamicModels.function.ts` `syncDynamicModels` runs **unscoped** for the
  super-admin registry and filters `project: null` explicitly (tenant defs are
  compiled by WO-08's registry, never by this one).
**Done when**
- `scripts/checkRouteParity.js` passes as before (super admin unchanged).
- A unit test: inside `runInScope(A)` a `find({})` returns only A's docs;
  outside any scope it returns only docs with no project; inserts get stamped.
- Migration run against the dev DB; `getIndexes()` shows the compound indexes.

## WO-04 — Model-agnostic sessions & 2FA (M)
**Files** `library/functions/sessions.function.ts`,
`library/controllers/twoFactor/{twoFactor.service,twoFactor.router}.ts`,
`library/models/sessions/*`, `library/models/twoFactor/*`.
**Change** factories `makeSessions({ Session, Blacklist, kind })` and
`makeTwoFactor({ User, Passkey, Challenge, kind, appName })`; the existing
exports become the admin instances (same names, same behaviour). New tenant
collections: `TenantSession`, `TenantBlacklistedToken`, `TenantPasskey`,
`TenantTwoFactorChallenge` (same schemas, `ref: 'TenantUser'`). Tickets carry
`kind` so an admin ticket can't finish a tenant login and vice versa.
**Done when** admin login / 2FA / sessions behave exactly as before (manual
smoke via the API) and the tenant instances exist.

## WO-05 — Tenant auth API (M)
**Files** `backend/routes-tenant/auth/*` (new), `backend/routes-tenant/tenant.router.ts`,
`backend/middleware/tenant/{protect.tenant,permissions.tenant}.middleware.ts`,
`server.ts` (`app.use('/tenant/api', tenantRouter)`).
**Endpoints** `POST /auth/register` (name, email, password, organization name +
onboarding answers → user + organization + owner role + membership + session),
`POST /auth/login` (2FA ticket when on), `POST /auth/2fa/login/*`,
`GET /auth/self` (user + active organization + role + permissions + projects),
`PUT /auth/update/self`, `PUT /auth/change-password`,
`POST /auth/forgot-password`, `POST /auth/reset-password/:token`,
`GET/DELETE /auth/sessions…`, `POST /auth/logout`, 2FA settings routes.
**tenantProtect** verifies the JWT, requires `kind === 'tenant'`, checks the
session, loads the user, the active membership for `org` (401 when removed),
sets `req.user`, `req.organization`, `req.member`, `req.permissions`.
**adminProtect** refuses any token with a `kind` claim (defence in depth).
**Done when** register → login → self works by curl; an admin token gets 401
on `/tenant/api/auth/self`; a tenant token gets 401 on `/admin/api/auth/self`.

## WO-06 — Organizations (M)
**Files** `backend/routes-tenant/org/*`.
**Endpoints** `GET/PUT /org` (current organization), `GET /org/list` (mine),
`POST /org` (create another, become owner), `POST /org/switch/:id` (new
session for that org), `GET /org/members`, `PUT /org/members/:id` (role),
`DELETE /org/members/:id`, `GET/POST/DELETE /org/roles…`,
`GET/POST /org/invitations`, `POST /org/invitations/:id/resend`,
`DELETE /org/invitations/:id`, public `GET /invitations/:token`,
`POST /invitations/:token/accept` (existing user → membership; new user →
creates the account). Email through the existing `sendMail`.
**Permissions** owner `*`; admin `*` minus org deletion/ownership; member:
project read/create; per-model permissions use the admin key style
(`view-<route>` …) and apply in every project of the org.
**Done when** invite → accept → the invitee sees the org; a removed member's
token gets 401 on its next request.

## WO-07 — Projects API (S)
`GET/POST /tenant/api/projects`, `GET/PUT/DELETE /tenant/api/projects/:id`.
Create seeds the project's default sidebar category ("Pages") and an empty
dashboard. Delete is refused while the project has models (or `?force=1` by
the owner — drops its collections, defs, copies, keys). **Done when** CRUD
works and another org's project id answers 404.

## WO-08 — Tenant model registry (L) — BLOCKER
**Files** `library/functions/tenantModels.function.ts` (new), small exports
from `dynamicModels.function.ts` (buildSchema/generateSettings/generateConfig
already pure).
**Change** a registry keyed by project: compile each def under
`T<projectId>_<Name>` on `t_<projectId>_<route>`; refs rewritten to internal
names within the project; `makeTargetLookup` limited to the project's defs;
mount `defineRoutes` with `auth: { protect: tenantProtect-chain,
hasPermission: tenantPermissions }` (defineRoutes gains an optional `auth`);
`checkAvailability` gets a tenant mode (names/routes only within the project,
reserved tenant routes, collection global). `models.controller` /
`features.service` call the right registry by `currentScope()`.
**Done when** two projects can each have an `Invoice` model at `/invoices`
with separate data, and the super-admin `Invoice`/`/invoices` are untouched.

## WO-09 — Project router (L)
**Files** `backend/routes-tenant/project.router.ts`.
`/tenant/api/p/:projectId` → `tenantProtect` → project belongs to `req.organization`
→ `runInScope` → mounts: `/builder` (models, routes, versions, features — AI
endpoints refused, D10), `/sidebarcategories`, `/sidebaritems`,
`/sidebar/:platform/:type`, `/dashboard`, `/upload`, `/media`,
`/notifications` (tenant user), `/permissionlist` (project routes), and last
the tenant registry dispatcher. Builder protections (`PROTECTED_ROUTES`,
sensitive fields) still apply. Media files get `organization` (+ project).
**Done when** the model wizard flow (preview → create) works through
`/tenant/api/p/:id/builder/models` and the new route serves CRUD.

## WO-10 — Tenant MCP (M)
**Files** `library/controllers/mcp/mcp.router.ts` (factor the tool set),
`routes-tenant/mcp.router.ts`, ApiKey fields `organization`, `project`,
`tenantUser`.
`/tenant/mcp` and `/tenant/mcp/<key>`: key → its project scope →
`runInScope` → same tools. Keys are made in the project workspace
(`/tenant/api/p/:id/builder/api-keys`). **Done when** a project key lists only
that project's models and `build_feature` creates them there.

## WO-11 — Public API, customers, login widget (L)
**Files** `routes-public/*` (new), `ProjectCustomer` model, ModelDefinition
`publicApi: { enabled, actions: ['list','get','create','update','delete'],
auth: 'none'|'customer', ownerOnly }`.
- `GET /public/api/:slug/:route` (+ `/:id`, POST, PUT, DELETE) per enabled
  action; `auth:'customer'` requires a customer token of that project;
  `ownerOnly` stamps/filters `customer` on records.
- `POST /public/api/:slug/auth/{register,login,logout}`, `GET /auth/me`.
- `GET /public/widget.js` — `<script src=…/public/widget.js data-project=slug>`
  renders sign-in / sign-up into `[data-mint-login]`, stores the token,
  exposes `window.MintAuth { user, token, fetch, signOut, onChange }`.
- CORS open on `/public/*`; rate-limited auth.
- Builder UI: a "Public API" panel per model (WO-15).
**Done when** curl can register a customer, read a public route, and is
refused on a `customer` route without a token.

## WO-12 — Panel mode (M) — BLOCKER (admin)
`admin/src/components/library/config` → `PANEL` (`'admin'|'tenant'`),
token name per panel; `mainApi` baseQuery picks
`${BACKEND}/p/<projectId>` for project paths and `${BACKEND}` for
`auth/`, `org`, `projects`, `invitations`; current project in a small
`workspace` slice (persisted). Route guard: in tenant mode only tenant pages
and the generic page/view/builder routes render. `.claude/launch.json` gets
`tenant` (port 3001).

## WO-13 — Tenant auth pages (M)
Register = account step → business questions (business name, industry, team
size, role, website, country, how did you hear about us, goals) using the
library inputs; login with the same 2FA step; accept invitation;
forgot/reset. All on `LoginContainer`.

## WO-14 — Organization console (L)
Org switcher in the navbar; `/projects` (cards + create); `/org/members`
(invite by email, roles, remove, pending invitations); `/org/roles`;
`/org/settings` (name, logo, onboarding answers); account settings reuse
the 2FA card and sessions page.

## WO-15 — Project workspace (L)
Project switcher; sidebar = the project's sidebar items (+ fixed "Build"
section: Models, Pages, Sidebar, Dashboard, MCP, Public API); the
existing `/model-builder`, `/builder/[...route]`, `/sidebar-builder`,
`/dashboard-builder`, `/model-builder/connect`, `/[slug]`, `/view/...`
pages work as-is under the project base. Public API panel per model with
copyable endpoint examples and the widget snippet.

## WO-16 — Super-admin oversight (M)
Super-admin routes `organizations`, `tenantusers`, `tenantprojects`
(defineRoutes, read + deactivate), sidebar items in a "Tenants" category,
permission seed, Admin preferences keys.

## WO-17 — Isolation tests & guide (M)
Jest: scope plugin, registry naming, cross-tenant 404s, token kinds.
Script `scripts/checkTenantIsolation.js` against a running server.
Admin `/docs/tenancy` guide (DocsShell) for tenants.

## WO-18 — Website projects (L)
A project has `type: 'app' | 'website'` (chosen at creation; website projects
also get `domains[]`, `defaultLocale`). Creating a **website** project seeds
the **website kit** — ordinary tenant model definitions (so the builder can
change them like any other), modelled on the AGS backend
(`ab/akashbari-backend-2/models`):
- `SiteSettings` `/site-settings` — AGS `GlobalSettings`: siteName, logo,
  favicon, footerText, primary/secondary colour, fontFamily, email, phone,
  address, mapEmbedUrl, socials, default metaTitle/metaDescription/ogImage,
  feature switches. One record per website (the UI opens it as a form).
- `WebPage` `/pages` — name, path (unique), status, template, priority,
  `contents` (references → WebContent), parent page, showInMenu.
- `PageSeo` `/seo` — AGS `Seo`: page (reference → WebPage), slug, title,
  description, image, keywords[], tags[], canonical, noIndex. A tab on each
  page lists its SEO.
- `WebContent` `/web-contents` — the AGS Content model, as built in the
  super-admin panel on 2026-10-02 (same fields, form, table, filters).
- Sidebar category "Website" with the four pages; dashboard widgets
  (pages, published contents, views this week).
- **Site API** (public, read-only, published records only, cached 60s):
  `GET /public/api/:slug/site` (settings), `/pages`, `/pages/by-path?path=/about`
  (page + its SEO + its contents in order), `/contents?pageName=&section=`.
  Kit models get `publicApi` read actions on by default; writes stay private.
**Done when** creating a website project yields the four models with data
pages, and the site API returns a page with SEO and contents.

## WO-19 — Website analytics (L)
**Backend** `WebsiteEvent` collection (not a builder model; high volume,
TTL optional): project, organization, type (`pageview`|`click`|custom),
path, title, referrer, utm*, sessionId, visitorId, device/os/browser,
country/city (sessions.function `locate`), element (AGS `Click` fields),
isBot, createdAt. Indexes {project, createdAt}, {project, type, path}.
`POST /public/api/:slug/track` (batched, beacon-friendly, bot filter,
rate-limited, origin checked against `domains[]` when set) and
`GET /public/track.js` (auto pageviews incl. SPA navigation, `data-track`
clicks, `MintAnalytics.track(name, props)`).
Reports `GET /tenant/api/p/:id/analytics/{summary,timeseries,pages,referrers,devices,countries,events}?from&to`.
**Admin** website workspace: Overview (site, pages, SEO coverage, install
snippet), Analytics page (stat tiles, views over time, top pages, referrers,
devices, countries, clicks) — follow the dataviz rules; no new chart library
beyond what the dashboard builder already uses.
**Done when** the tracker records a pageview from a test page and the report
shows it.

## WO-20 — User guides (M)
**Why** `/docs` is the super admin's (its guides and the component library);
tenants need their own documentation, and everything they need should be
there. **Admin** `/user-docs`: a home page and 16 public guides (getting
started, account & security, organization, projects, models, pages, sidebar,
dashboard, media, connect AI, records, public API, customers & sign-in,
websites, analytics, FAQ), listed in `user-docs/_components/guides.ts`, framed
by `UserGuide` (DocsShell with the user-guides navbar). In the tenant panel
every guide link goes there: `panel.ts docsPath('/docs/<guide>#<anchor>')`
maps to the user guide with the same anchor, DocsShell sends any /docs page
to its user guide before the sign-in check, the footer links to /user-docs,
and `tenant/GuideLink` points at the right guide. `/docs/tenancy` is removed.
Examples carry the real API address (`NEXT_PUBLIC_BACKEND` without
`/tenant/api`). **Done when** every in-app guide link lands on an existing
section of a user guide in the tenant panel, and the super admin's /docs is
unchanged.

## WO-21 — Standard role permissions (M)
**Why** (user, 2026-10-02): "the specific item permission not necessary —
view, edit, delete and some specific permission first, which is the
standard." **Backend** `ORG_PERMISSIONS` led by four record keys —
`records:view`, `records:create`, `records:edit`, `records:delete` — that
apply to every model (and the project's media, customers and analytics) in
the projects a member can open; then `build`, `manage-api-keys`,
`create-projects`, `manage-projects`, `manage-members`, `manage-roles`,
`manage-organization`. `grants()` maps `view-|create-|edit-|delete-<route>`
onto them (and `build` onto media), and still reads the old `data:*` /
`data:view`. Roles accept only these keys (old per-model keys are dropped on
save); `/org/permissions` lists them grouped. Member = all four record keys
+ `create-projects`. Customers follow the record keys. **Admin** Roles page:
records as four switches, then the rest; no per-model list. **Done when** a
role with only `records:view` reads every model but can't add, and roles
can't be given per-model keys.

## WO-22 — Project access (M)
**Why** (user): "invite other users and give access to projects, with user
roles." **Backend** `OrganizationMember` and `OrganizationInvitation` get
`allProjects` (default true) and `projects[]`. Owner/Admin (`*`) always open
every project. A member limited to some projects only sees those —
projects list/get/put/delete, `/p/:projectId`, `auth/self`, the tenant MCP
(a key for a project its maker lost stops working). Creating a project adds
it to a limited creator's list; deleting one pulls it from every list.
`PUT /org/members/:id { role, allProjects, projects }`; invitations take the
same and accepting copies them. **Admin** invite dialog and member rows:
role + "All projects / Only these" with a project picker. **Done when** a
member limited to project A gets 404 for project B everywhere, and an
invitation for A only joins with A only.

## WO-23 — Media library per project or organization (S)
**Why** (user): "users can decide if media should be project specific or
organization specific." **Backend** `TenantProject.mediaScope`
(`project` default | `organization`), set on create and edit. The project
router runs `/upload`, `/media` and `/files` in the organization's scope
(`{organization, project: null}`) when it's `organization` — one library
shared by every project that chooses it; the super admin still only sees
`organization: null`. Switching moves nothing: each library keeps its files.
Deleting a project removes only its own library. **Admin** project dialog:
"Media library — this project only / shared with the organization"; the
Media page says which it shows. **Done when** two projects set to
`organization` see each other's folders, a third set to `project` doesn't,
and the super admin sees none of them.

## WO-24 — Several organizations (M)
**Why** (user): "if a user has access to multiple organizations — my own,
and invited to B's workspace — that would show up too." **Backend**
`GET /tenant/api/invitations/for-me` (pending invitations to the account's
email — only once the email is verified, so an account can't claim another
person's invitations), `POST …/for-me/:id/accept`, `DELETE …/for-me/:id`
(decline). `emailVerified` is set by accepting an emailed invitation link,
resetting the password by email, signing in with an email code, or the new
`POST /auth/verify-email/send` + `POST /auth/verify-email { code }`. The
emailed link accepts in one click for a signed-in account with that email.
**Admin** Projects home: "Invitations for you" (accept/decline, or verify
your email to see them) and "Your organizations" (every workspace, with its
role, one click to switch). **Done when** a user invited to B sees and
accepts it in the app, then has both organizations listed and switchable.

## WO-25 — Landing page, dashboard address, token key (M) — done
Tenant `/` is a public landing page (`admin/src/app/_landing`); the dashboard
moved to `/dashboard`; `HOME` in panel.ts for every home link/redirect. The
tenant build always keeps its token under `MINT_TENANT_TOKEN`
(constants.tsx) so both panels run side by side. Admin `a9c533a`.

## WO-26 — Files section, drawer forms (S) — done
`tenantNav`: *Files → Media library* for anyone granted `view-image`;
`useModalLayout` is always `drawer` in the tenant panel, Settings hides Form
layout. Admin `3e77f6f`, backend `212b69f9`.

## WO-27 — Project-specific model names (M) — done
`ensureTenantIndexes()` at boot; `scopedModel()` in import links, MCP
query_records, stats labels, record view; name and address numbered apart
(`Customer` stays Customer at `/customers2`); `describe_platform` tells a
project's AI names are its own. Backend `a90d18ac`, admin `cf8227f`.

## WO-28 — Project addresses (L) — done
D18. `src/proxy.ts` rewrites `/<publicSlug>/<page>`; project from the URL
per tab; `/p/:project` takes slug or id; `mint_project` cookie for links
without a project. Admin `7129e60`, backend `6e5a95be`.

## WO-29 — Project-aware API cache (S) — done
`mainApi.serializeQueryArgs` prefixes the tab's project, so a client-side
move between a project and the organization never shows the other's cached
data (the sidebar kept project sections on /projects).

## WO-30 — MCP dashboard tools (S) — done
`get_dashboard`, `update_dashboard` (mode replace|append; `normalizeWidget`
plus a check that every route and field exists) in
`library/controllers/mcp/mcp.router.ts`; smoke in `mcp.mjs`.

## WO-31 — Per-record access in projects (M) — done
D19. A model's *Restrict access to each record* now works in projects:
owner/privacy/access reference `TenantUser`; `recordAccessMiddleware` mounted
for tenant models; `/p/:project/access-users` and the Owner filter list the
members who can open the project (`projectPeople()`); no notifications in
projects; the public API only reaches `privacy: 'public'` records and what a
site creates is public. Smoke in `access.mjs`.

## WO-32 — Public API reference + tester (M) — done
`admin/src/app/public-api/_components/` — `api.ts` (endpoints, examples from
`GET /public/api/<slug>/`), `ApiReference.tsx` (every endpoint: query, body
fields, example response, Try), `ApiTester.tsx` (method, path, customer token
kept from a sign-in, JSON body, status/time/response, Copy as fetch).
Guide sections `reference`, `tester` in `/user-docs/public-api`.

## WO-33 — A website built by an AI through the MCP (L) — done
**Built:** `library/controllers/mcp/website.tools.ts` (describe_website,
get_site, update_site_settings, upsert_page, upload_media, create_records,
set_public_api, site_snippets), `mcp/records.helpers.ts`; `ToolDef.only`
hides website tools outside website projects (project-only for
set_public_api); build_feature steps take `publicApi`. Smoke:
`website-mcp.mjs` (30 checks). Guide: /user-docs/websites#ai-site, tools in
connect-ai. upload_media's real upload is opt-in in the smoke
(`SMOKE_UPLOAD=1`, writes to the S3 bucket). See CHANGELOG.

**The user's words:** "user creates website via Claude Code, deploys and
instantly gets an admin panel." With our MCP connected while an AI (Claude
Code or any other) builds a website, everything the site shows — contents,
SEO, favicon, images, analytics — must end up in the project and be managed
from the panel afterwards. Long separate lists the content model doesn't
cover (products, projects, clients…) become their own models, linked. "All in
one solution."

**Builds on** WO-18 (website kit: `SiteSettings`, `WebPage`, `PageSeo`,
`WebContent`; site API `/site`, `/pages`, `/pages/by-path`, `/contents`),
WO-19 (`track.js` analytics), WO-11 (public API per model), WO-10/30 (MCP).

**MCP work** (`library/controllers/mcp/mcp.router.ts`, tenant
`routes-tenant/mcp.router.ts`; website projects only, `build` scope, upserts so
a rebuild updates instead of duplicating):
- `describe_website` — the kit, the site API contract, and a code recipe for
  the site (fetch `/site` and `/pages/by-path` at build/request time, render
  `contents` in order, SEO into `<head>`, favicon/logo from settings,
  `track.js` on every page, lists from the model's public API) — so the AI
  writes a site that reads from us, not hard-coded text.
- `get_site` / `update_site_settings` — name, logo, favicon, colours, font,
  contact, socials, default SEO, domains (domains drive analytics).
- `upsert_page` — by path: name, status, menu, template, its SEO, and its
  content blocks in order (create/update `WebContent`, link them).
- `upload_media` — from a URL (or base64) into the project's media library,
  returning the hosted URL to use in settings/contents/records.
- Lists → models: reuse `plan_feature`/`build_feature` with `publicApi`
  (read actions on) settable per step; plus a write tool to add records
  (`create_records`, validated like the create form, `data`/`build` scope) —
  today the MCP's record tool is read-only (`query_records`).
- `site_snippets` — `track.js` / widget snippets and the API base for the
  site's env.

**Admin**: the website workspace shows what the AI seeded (pages with SEO and
contents, settings with favicon/logo) — check the existing kit pages cover it.
**User guide**: a "Build your site with AI" section (connect-ai + websites).
**Done when** an MCP client, in one session, turns a 2-page site into a
seeded website project: `/site` and `/pages/by-path` return everything the
site renders (settings, favicon, SEO, ordered contents, list models through
the public API), track.js is in place, and editing a content in the panel
changes the deployed site with no code change. Add a smoke suite
(`website-mcp.mjs`) to `run-all.sh`.

## WO-34 — Website workspace (L) — done
**The user's words:** "should have website analytics page, page to set up
google tags, pixel, headers — not tables, a full page like the analytics page
… website dashboard must have analytics, headers manipulation and every other
configuration a website must have."
- Bugs found with it (fixed, uncommitted): `middleware/filter.middleware.ts` —
  a bare `?page=1` was read as the kit's `page` reference field (Cast to
  ObjectId on /web-contents, /seo); admin `src/proxy.ts` — bare `/dashboard`
  followed the last-project cookie, so Home opened another project's
  dashboard; now always the organization home.
- Site configuration on `TenantProject.site` (code schema, not a kit model):
  tracking (GA4, GTM, Meta Pixel, TikTok, LinkedIn, Clarity, Hotjar, MINT
  analytics on/off), code (head, body start, body end), SEO (indexing,
  robots.txt, sitemap, Google/Bing verification), redirects, response headers.
  Tenant API GET/PUT `/site-config`; site API `/site` returns it, plus
  `/site/robots.txt`, `/site/sitemap.xml`; track.js injects the tags so they
  change from the panel without a deploy.
- Admin: `/site-setup` full page (General = the Site settings record, Tracking,
  Code, SEO & indexing, Redirects & headers, Domains); website overview on the
  project dashboard (analytics tiles, setup checklist, pages); sidebar "Site".
- MCP: update_site_settings takes `config`; describe_website covers it.
- Built as above: backend `library/functions/siteConfig.function.ts`,
  `routes-tenant/site.router.ts` (site-config, site-overview), public router
  (/site config, /site/tags, /site/robots.txt, /site/sitemap.xml), track.js
  tag injection (`data-no-tags` opts out), tenantNav "Site" section (Site
  setup, Analytics). Admin `app/site-setup`, `tenant/WebsiteOverview.tsx` on
  the website dashboard, guide sections in /user-docs/websites. Smoke: 13
  checks in website-mcp.mjs.

## WO-35 — New-project wizard (M) — done
After creating a project: an app gets "build your first model" (the model
wizard or Connect AI); a website gets name, logo, favicon (and colours) into
its Site settings, then its first page. Skippable; shown once.
**Built:** admin `app/get-started` (app: starter templates + model wizard +
Connect AI; website: brand → home page with hero block and SEO → domain and
GA4 → done); ProjectsBoard opens a new project there; empty dashboard links
it. Backend `library/functions/starterTemplates.function.ts` (4 starters,
AI-plan shape) + `GET/POST /builder/starters[/:key]`. Smoke in models.mjs.

## WO-36 — History in every project (M) — done
Who created, changed, archived or deleted what, in each project (the admin
panel's history, scoped); a History page per project and on each record.
**Built:** `routes-tenant/history.router.ts` at /p/:id/history (list with
model/action/user/date/search filters, /facets, /g/document/:id), view-history
(Records: View). recordHistory stores the plain model name (displayModelName);
older entries are cleaned when read. `recordProjectEvent` logs model
create/change/delete, feature/template builds (features.service), public API
switches, site setup saves. Admin `app/activity` (the super admin owns /history),
sidebar Activity → History. Smoke: activity.mjs.

## WO-37 — Notifications for tenant users (M) — done
A bell for every user: invitations, records shared with them (D19 access),
mentions/assignments, project events; per project and organization; read state.
**Built:** `TenantNotification` (one person's list across organizations, a
year's TTL), `tenantNotify.function.ts` (notifyTenant, projectAudience,
projectHrefFor, later), `/tenant/api/notifications` (same shape as the admin's:
list/count/read/read-all/delete). Sent for: invitation to an existing
account, invitee joined (to the inviter), role/projects changed, record shared
(the D19 access plugin now runs in projects), a record created through the
public API and a customer sign-up (to everyone who can see it). Admin: the
bell and /notifications in the tenant panel ('notifications' left
ADMIN_ONLY_PAGES; ACCOUNT_PATH has it). Not yet: mentions/assignments.

## WO-38 — Website settings record (L) — done
**The user's words:** "the site settings basic seo, gtag, etc are being saved
under a table, but the table should not be there. should be like the analytics
tab of ags admin … a model regarding websiteSettings … every tag saved, site
logo, name, settings … with the project id … google analytics id, gtag,
facebook twitter, etc tracking. server side tracking etc. head scripts."
- **Model** `library/models/tenancy/websiteSettings.model.ts`
  (`websitesettings`, `tenantScoped`, unique `{organization, project}`):
  identity, contact, social, seo, tracking (GA4, GTM, Google Ads, Meta,
  TikTok, LinkedIn, Pinterest, X, Snap, Clarity, Hotjar, MINT analytics),
  serverSide (Meta CAPI, GA4 Measurement Protocol), `secrets`
  (`select:false`; the panel only sees tokenSet/secretSet, never the site API
  or MCP), named `headTags` (head / body start / body end, on/off),
  redirects, headers, last `check`.
- **One read/write path** `siteConfig.function.ts`: `loadSite` (created on
  first read, copying the old kit "Site settings" record and
  `TenantProject.site` — both now legacy, left in place), `saveSite`,
  `publicSettings` (same flat shape `/site` served before, so sites keep
  working), `siteTags`, robots/sitemap, 60s cache cleared on save.
- **Server-side** `serverTracking.function.ts`: Meta CAPI PageView (deduped
  with the pixel by eventID from track.js), Lead (public creates),
  CompleteRegistration (customer sign-up); GA4 MP generate_lead / sign_up.
  Visitor matching: IP, UA, `x-mint-visitor`/`x-mint-fbp`/`x-mint-fbc`
  (`MintAnalytics.headers()`), hashed email/phone.
- **Check the site** `siteCheck.function.ts` (POST /site-config/check): fetches
  the live home page via the MCP's `fetchable` SSRF guard; per tag on/missing,
  IDs the page hard-codes, GTM+GA4 double counting, Meta token debug.
- Website kit is now 3 models (Pages, SEO, Contents). Existing projects keep
  their old table until removed: Site setup → General shows a notice with
  "Remove the table" (deletes the ModelDefinition; records stay in Mongo).
- Admin `/site-setup` rewritten as tabs of cards that save on their own
  (`_components/`: General, Contact & social, SEO, Tracking, Server-side,
  Code, Redirects & headers, Domains, Check the site); get-started and the
  website overview use it; guides in /user-docs/websites.
- Verified: all 14 smoke suites (website.mjs: kit 3 models, legacy import;
  website-mcp.mjs: WO-38 checks); headless UI — every tab, Code dialog saves a
  tag, legacy notice + Remove the table on a project with the old table.
- Not yet: TikTok Events API server-side; sites must add
  `MintAnalytics.headers()` to their form requests for lead matching.

## WO-39 — Password fields, searchable dropdowns, code prefix (M) — done
**The user's words:** "on the model builder a password type needs to be set
… the dropdown needs to be searchable. Also when i enable the code the
prefix is not being taken into consideration model codes are 0001 0002".
Then (2026-10-04): "do not need a secret encryption key, just hide the
key/credential on frontend for now, click to reveal."
- **Password kind** (backend `FIELD_KINDS`, admin `modelKinds.ts`): stored and
  returned as text (`{ type: String, secret: true }`); settings type /
  tableType / viewType `password`, so the form, table and detail page show
  dots with show and copy (existing `SecretValue`, `VPassword`). `secret`
  keeps the value out of history (`secretFields.function.ts` `secretPaths`
  → `diffFields`, passed by the live `controllers/common/updateDocument`).
  Secret-named keys (password, token, pin…) only with this kind; not
  unique, indexed, searchable, defaulted or inside sections. AI/feature
  prompts know it. **Hidden on screen only** — anyone who can read the
  record (panel, export, API, MCP) gets the value.
- First built with encryption (`SECRET_ENCRYPTION_KEY`) and a reveal endpoint
  that asked for the person's own password (`835b64b` / `27a9d495`); removed
  on the user's call — bring it back from git history if wanted later.
- **Dropdown** (`cl/Dropdown.tsx`): `searchable` (default on over 10 items) —
  search box at the top, arrows/Enter handled by the box, trigger label from
  the full list.
- **Code prefix:** the API always honoured it; the empty Prefix box showed a
  grey "INV" placeholder people read as set. Switching codes on now fills a
  prefix from the title (`suggestPrefix`), placeholder "None".
- Docs: /docs/builder#models-password, /user-docs/models#models-password.
- Verified: smoke `secrets.mjs` + all suites; headless UI — kind search and
  keyboard pick, table dots → Show → value.
- Seen, not from this: "uncontrolled to controlled input" console error on
  every tenant edit form (Tickets too).

## WO-40 — Public API lists: filters like the admin's, and their docs (M) — done
**The user's words (2026-10-04):** "on api reference filters needs to be
mentioned, so that users while using the public api can filter the items,
pagination etc every documentation should be top notch" — then "public
endpoints should have filters like the admin endpoints have", and "any
changes made should be listed" in these agent docs.
- **Backend** `routes-public/public.router.ts` ("lists: filters, search,
  sort"): `GET /:route` takes the admin lists' syntax
  (`middleware/filter.middleware.ts`): `<field>=<value>`, repeated name = any
  of, `<field>_<op>=<value>` with `ne in nin gt gte lt lte btwn` plus
  `contains` (text, any case, regex-escaped) and `all` (list fields); dates
  take a day (whole day, UTC), a moment, or `today|week|month|year|days_N|
  months_N`; `createdAt`/`updatedAt` filter on every model; `search=` over
  text/email/textarea/select/tags; `sort=-a,b` (≤3 keys, `_id` tie-break so
  pages never overlap); `fields=` picks keys (+`_id`). Operators allowed per
  kind (`OPS`); field keys may contain `_` (whole key tried first). Unknown
  names ignored; unreadable values / wrong operators / `a[b]=` objects → 400
  with the reason. Before: exact match only, a bad reference id silently
  dropped the filter.
- **Archived records** (`archivedAt`) never reach the public API — list, get,
  update, delete (`owned()`), as in the admin lists.
- `GET /` now sends, per model with List on, `filters` ({key, kind, ops}),
  `search` and `sort` keys (`listCapabilities`) — the reference reads them.
- **Admin** Public API page reference (`public-api/_components/ApiReference.tsx`,
  `api.ts`): a "Lists: paging, sorting and filters" block (parameters,
  operators, date values) above the models; each list endpoint shows its
  sortable/searchable fields, a Filters table (every `key_op` per field, with
  allowed values) and example requests built from its fields with **Try**.
- **User guide** `/user-docs/public-api`: new sections Listing and paging
  (`#list`), Sorting, Filters (`#filters`), Filters by kind of field, Filtering
  by date, Search, Choosing fields, Recipes; errors + troubleshooting rows;
  `guides.ts` topics; `GuideLink` anchors `filters|paging|sorting`.
- **MCP** (`mcp/website.tools.ts`): the site API part of `describe_website`
  and `set_public_api`'s answer give the AI the full query syntax.
- **Smoke:** new `tenancy-smoke/public-filters.mjs` (in `run-all.sh`); all
  scripts take `SMOKE_ROOT` / `SMOKE_MONGO`; launch configs
  `backend-scratch`, `tenant-scratch`.
- Keep in step when changing list behaviour: the router's `OPS`/`RESERVED`,
  admin `api.ts` (`LIST_PARAMS`, `FILTER_OPS`, `FALLBACK_OPS`), the user
  guide sections, the MCP text.

## WO-42 — Public API read-only fields (M) — done
**The user's words (2026-10-05):** the public API "lets a signed-in customer
create records on owner-only endpoints … a customer can set fields that only
the business should control — e.g. an order's `status: "paid"`,
`paymentReference`, `trackingUrl`, or a booking's `status: "confirmed"`. Add
field-level write control for the public API." Decision D20.
- **Backend:** `ModelDefinition.publicApi.readOnlyFields: [String]`;
  `PUBLIC_API` (models.controller) takes `readOnlyFields`;
  `readOnlyProblem(fields, keys, actions)` (unknown key; required with no
  default while create is on) and `mergedPublicApi(value, before)` (keeps
  note and read-only list when left out) — used by `updatePublicApi` and the
  MCP's `setPublicApi`. Router `bodyOf` drops read-only keys on create and
  update (dropped, not refused); `GET /` marks read-only and formula fields
  `readOnly: true`. MCP `set_public_api` and `build_feature`'s `publicApi`
  take `readOnlyFields`.
- **Templates:** blueprint `endpoints[].readOnly: [keys]` (normalizer
  de-duplicates), validate.ts errors via `readOnlyProblem` on the planned
  model's fields + a warning when the endpoint can't create/update,
  `applyTemplate` passes it to `setPublicApi`, `capture.ts` (save a project
  as a template) keeps it, Templates MCP format text and `set_endpoints`.
- **Admin:** shared `public-api/_components/ReadOnlyFields.tsx` (field
  checkboxes, shown when Create or Update is on; formulas not offered) on the
  tenant Public API page and the studio's Public API tab; a refused save snaps
  back to what's saved. API reference: body tables list only sendable fields
  and name the read-only ones; `api.ts` `sendable` skips them in example
  bodies. Guides: `/user-docs/public-api#read-only` (+ writing, address,
  troubleshooting, `guides.ts` topic), `/docs/templates#endpoints`.
- **Smoke:** `public.mjs` (unknown key / required-no-default refused, kept
  when left out, customer create with `status: "paid"` gets `pending`, update
  ignores it, the business sets it in the panel and the customer can't undo
  it, `GET /` marks it); `templates-preview.mjs` (template errors, a built
  preview's model has the list, a customer's `paid` order is `pending`).

## WO-43 — One collection per project (L) — done (2026-10-06; production migration pending the user's yes)
**The user's words (2026-10-05):** "if i need to have unlimited collection?
… atlas seem to have cap" → chose "One collection per project: all of a
project's models in one collection, with a `_model` field. Collections then
grow with projects only." Decision D21 (README) — why this and not shared
collections for every tenant is recorded there. Then: "only databases from
projects will be on one collection, anything built on the super admin panel
will be a single collection. and the previous data on superadmin models must
remain unchanged."

**Scope — projects only. The super admin is untouched:**
- Models built in the super-admin panel (no scope, `organization: null`)
  keep **one collection per model**, compiled exactly as today
  (`mongoose.model(name, schema, collectionName)`, `Model.syncIndexes()`),
  with no `_model` field.
- **No super-admin document, collection, index or ModelDefinition is
  changed** — not by the code change, not by the migration. Every new code
  path branches on the scope (`currentScope()?.project`); the platform branch
  is the existing code, unchanged.
- The migration script selects tenant ModelDefinitions only
  (`organization` and `project` set, `collectionName` matching
  `^t_<projectId>_`) and refuses to run on anything else.
- Code models (the platform's own `lib/`/`library/` models) are not touched
  either.

**Why.** Today each tenant model is its own collection
(`t_<projectId>_<route>`, D6) with 2–4 indexes, so the cluster's count is
projects × models. Atlas Free/Flex refuse more than 500 collections (the old
shared cluster hit it — see the Handoff); dedicated tiers recommend at most
5,000 (M10) / 10,000 (M20, M30) / 100,000 (M40+) collections **and indexes**
combined — past that, checkpoints slow, memory per open file grows and
failovers take longer. 100 projects × 10 models is already ~1,000 collections
and ~3,000 indexes. After this WO: ~1 collection and ~6–10 indexes per
project.

**Design**
1. **Storage.** A tenant project's built models all use collection
   `t_<projectId>`. Each record carries `_model` = the model's `name`
   (`Booking`; fixed at creation, unique in the project). Super-admin
   (platform) built models are unchanged: one collection each (Scope above).
2. **Mongoose discriminators** (`dynamicModels.function.ts`, `compile`): per
   project a base model `T<projectId>__Records` on `t_<projectId>` —
   empty schema, `{ discriminatorKey: '_model', timestamps: true,
   versionKey: false, autoIndex: false }`, made once per scope
   (`reg()`). Each model compiles as
   `Base.discriminator(internalModelName(name), buildSchema(def), { value: def.name, overwriteModels: true })`
   instead of `mongoose.model(name, schema, def.collectionName)`. Mongoose
   then sets `_model` on save/insertMany and adds `{ _model }` to every find,
   count, update, delete, `findById`, populate and **aggregate** (a `$match`
   is prepended) — so defineRoutes, filters, search, bulk actions, merge,
   dashboard stats, history and the public API work unchanged. Unloading a
   scope (`deleteModel` at ~1031/1163) removes the discriminators and the base.
   `_model` is reserved: no field key may be `_model` (add to the builder's
   reserved keys).
3. **Index manager** (new `library/functions/projectIndexes.function.ts`),
   replacing `Model.syncIndexes()` for tenant models only — super-admin
   models keep `syncIndexes()` on their own collection — **syncIndexes on a
   shared collection drops every other model's indexes**:
   - shared, one per collection: `p_model_createdAt` `{_model:1, createdAt:-1}`;
     `p_model_code` `{_model:1, code:1}` unique, partial `{code: {$exists: true}}`;
     `p_model_customer` `{_model:1, _customer:1}` partial on `_customer`;
     `p_model_addedBy` `{_model:1, addedBy:1}`; `p_model_access` `{_model:1, access:1}`
     (the last three partial on the field existing);
   - per model, named `m_<name>_<field>`: a unique field →
     `{_model:1, <field>:1}` unique, partial `{_model: <name>}` (+ `<field>:
     {$exists: true}` when not required — today's `sparse`); an indexed
     field → the same without unique.
   - `syncProjectIndexes(def)` lists the collection's indexes, creates the
     model's missing ones, drops only `m_<name>_*` it no longer wants, never
     touches other names. Duplicate-key failures come back as warnings, as
     `syncIndexes` does today (models.controller `syncIndexes`, ~552).
     Deleting a model drops its `m_<name>_*` indexes.
4. **Direct collection calls** — Mongoose's `_model` filter only applies
   through the model. In a project, each of these must add
   `{ _model: def.name }` (or go through the model); for a super-admin model
   they keep today's behaviour (whole collection, `dropCollection` on delete
   with data):
   - `models.controller.ts` ~925 (privacy backfill when access turns on) and
     ~941 (formula recalculation `updateMany({}, pipeline)`);
   - ~1006 delete-with-data: `dropCollection` → `Model.deleteMany({})`, then
     its indexes; drop the collection only if it's now empty and no other
     model of the project uses it;
   - ~597 `estimatedDocumentCount()` (ignores filters) → `countDocuments()`;
   - `bulkActions.controller.ts` ~97 undo restore `collection.insertMany` —
     the stored raw docs must keep `_model` (check DeletedRecord keeps it;
     set it if missing); ~316 merge reference counts `collection.countDocuments`
     → add `_model` of the counted model;
   - grep again for `.collection.`, `connection.collection(`,
     `dropCollection`, `estimatedDocumentCount`, `bulkWrite`, `syncIndexes`
     before closing — nothing new may bypass the model.
5. **Naming.** `checkAvailability` (tenant branch): `collectionOf(route)`
   returns `t_<projectId>` for every route and the "collection already holds
   data" check is skipped in a project (it would mark every route taken once
   the collection exists); it also stops listing all collections per call
   for tenants. The platform branch of `checkAvailability` stays as it is
   (its own collection per model, the "already holds data" check included).
   `ModelDefinition.collectionName` is `unique: true` today — every model of
   a project now shares one value: keep it unique for the platform
   (partial `{organization: null}`) via `ensureTenantIndexes`' PLAN (create
   the partial unique index first, then drop `collectionName_1`), so two
   super-admin models can still never share a collection.
6. **Project lifecycle.** `removeProjectContents` drops `t_<projectId>` and
   any leftover `t_<projectId>_*`; template previews (`templateSandbox`)
   go through it. The preview guard's `collectionsInUse` keeps working (fewer
   collections).

**Migration** — `scripts/migrateProjectCollections.js`, dry run by default:
- `--apply`, per project (or `--project <id>`): for each tenant
  ModelDefinition whose `collectionName` ≠ `t_<projectId>`, copy its
  collection into `t_<projectId>` in batches (`insertMany`, `ordered: false`,
  `_model` set, **`_id` kept**; a re-run skips ids already copied), compare
  counts per model, then set `collectionName` and bump `version` so every
  process recompiles; build the project's indexes; report per model.
- `--drop-old`: drop each old collection only when its count equals its
  `_model` count in the new one. Kept until then — a failed run leaves the
  project working on its old collections.
- Run in a quiet window (writes to an old collection after its copy would
  be missed; the script re-copies anything with `updatedAt` after the copy
  started, but stop the app for production). Production is on its own
  cluster since 2026-10-05 (262 collections, Handoff) — dry-run there first
  and record the counts in the CHANGELOG.
- Backup first (`mongodump` of the database), as for the cluster move.

**Tests** — new `tenancy-smoke/collections.mjs` (in `run-all.sh`):
- two models in one project with the same field key (`email`, unique on
  both): the same email in each model is allowed; twice in one model is
  refused; lists, counts, `GET /:id` across models 404, filters, search,
  sort, `fields` and dashboard stats never show the other model's records;
- bulk archive / delete / undo / merge and import touch one model only;
  formula recalculation and access turned on change only that model;
  deleting a model with its data leaves the other's records and indexes;
  adding/removing a unique field creates/drops only `m_<name>_<field>`;
- public API (owner-only, read-only fields) unchanged;
- the project has exactly one data collection; deleting the project or a
  template preview drops it;
- **super admin unchanged:** before and after the change and the migration,
  each super-admin built model still has its own collection with the same
  name, document count, document contents (hash of a sorted export) and
  indexes, and no `_model` field; a model built in the super-admin panel
  after the change gets its own collection; its unique fields, delete with
  data and formula recalculation behave as before; the migration's dry run
  lists no super-admin model; the `admin.mjs`/`models.mjs` platform checks
  pass;
- migration: build a project the old way (collections `t_<pid>_<route>`
  made directly in the scratch DB), run the script (dry run, `--apply`,
  re-run, `--drop-old`), then the checks above on it; links between records
  and history still resolve.
- All suites pass (`run-all.sh`) — models, public, public-filters, access,
  activity, templates-preview, webhooks cover the rest.

**Built (2026-10-06)** as designed above, with these differences — read them
before touching the code:
- **Both layouts work.** A project model is a discriminator on `t_<projectId>`
  only when its `collectionName` is `t_<projectId>` (`inProjectCollection`);
  one created before WO-43 keeps its own collection, indexes and
  `syncIndexes` until the script moves it. So the code ships first and the
  migration runs after — never the other way (the old code would read a
  shared collection unfiltered); the script refuses while
  `collectionName_1` still exists.
- **Names, not routes, are kept by kept records.** A model deleted without its
  data leaves records with its `_model`; `checkAvailability` counts those
  names as taken (`distinct('_model')` on `t_<projectId>`), so a new model
  never inherits them. Routes no longer meet collections in a project.
- **The migration upserts** (`replaceOne` by `_id` + `_model`, upsert) rather
  than `insertMany`, so a re-run also refreshes changed records and removes
  ones deleted from the old collection since. `--drop-old` drops an old
  collection when **every `_id` in it** is in the new one (not equal counts —
  records added after the move are fine).
- `projectIndexes.function.ts` also gives a section's unique/indexed
  sub-field its own `m_<Name>_<section>.<field>`; a unique field's index is
  partial on `_model` (+ `$exists` when not required).
- Other places touched: `routeRegistry.listModelFields` (no `_model` filter),
  MCP save errors (no `_model` in the duplicate message), the template
  preview room check (one collection per project), the admin panel's linked
  record card and merge compare (skip `_model`), `RESERVED_KEYS` (both repos).
- `_model` is in admin/tenant API responses (lists, records); the public API
  never returns it.

**Done when** new projects get one collection; super-admin models and their
data are byte-for-byte as before (checked as above); the migration has run on
the scratch DB and (on the user's yes) production; all smoke suites pass;
README D21 is marked done and this Handoff, CHANGELOG and DEPLOY.md
(migration step) are updated. Size L (~1–2 days).

## Known gaps
- About 70 hard-coded links to project pages (e.g. `/dashboard-builder`)
  rely on the proxy's cookie redirect — correct, one extra hop; convert to
  `projectHref` when touching those files.
- A full click-through of the tenant panel in a visible browser after the
  backend deploy.

## Follow-ups (not in v1)
Password reset for project customers;
moving files between a project's library and the organization's;
billing/plans and limits per plan;
custom domains for the public API; OAuth for MCP; tenant data export;
deleting an organization.
