# Multi-tenancy — work orders

Read `README.md` first (decisions D1–D19 and the architecture).
Each item: **files → change → done when**. `BLOCKER` gates later items.
Sizes: **S** ≤ 1h, **M** ≤ half a day, **L** ≤ 2 days.
Paths are from the monorepo root `/Users/asifistiaque/Desktop/proj/e-mint`.
Update the **Status** column and `CHANGELOG.md` as each item lands.

## Handoff — read this first (kept current; last updated 2026-10-03)

**This file is the to-do list and the hand-over.** An agent picking this up:
read this section, then `README.md` (decisions D1–D19), then the open WO
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
`main` `a3327d4`; sticky footer `ba88b4b`). **WO-38 and WO-39 done, not committed** (website settings model; Password
fields — backend and admin working trees). Next candidates: Known gaps, Follow-ups — ask the user. See the Status table.

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
- `npx tsc --noEmit -p .` in each repo. In `admin/` the only expected error is
  a stale `.next/dev/types/validator.ts` (deleted `docs/tenancy` page) —
  local dev artefact, not in a clean build.
- The desktop browser pane may be hidden (React stalls); the headless
  `agent-browser` CLI works for UI checks. First compiles after a restart
  take 30–60s per page.

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
| 38 | **Website settings: one `WebsiteSettings` record per project (no Site settings table), AGS-style cards, server-side tracking, check the site** | both | L | done (uncommitted) |
| 39 | **Model builder: Password field kind (encrypted, revealed with your own password), searchable dropdowns, code prefix filled in** | both | M | done (uncommitted) |
| — | **Bug: inviting someone to a project doesn't work** (user report 2026-10-02) | admin | S | done (accept form sent an empty name) |

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
where originally the password remains hidden if trying to reveal user needs to
provide his password first … the dropdown needs to be searchable. Also when i
enable the code the prefix is not being taken into consideration model codes
are 0001 0002".
- **Password kind** (backend `FIELD_KINDS`, admin `modelKinds.ts`): path
  `{ type: String, select: false, secret: true }`;
  `library/functions/secretFields.function.ts` (plugin in `buildSchema`)
  seals with `lib/crypto/secret.ts` (`SECRET_ENCRYPTION_KEY`) on save /
  insertMany / update queries, keeps the stored value when a blank comes in,
  strips it from projections unless `revealSecrets`, and from toJSON.
  `POST /<route>/:id/reveal {field, password}` (routes-admin/common/router.ts
  → `library/controllers/crud/revealSecret.controller.ts`) runs behind the
  route's getById middlewares (read permission + record access), checks the
  Admin's or TenantUser's own password (400 `wrong_password`, never 401),
  rate-limited per IP. History (`diffFields` `secret`, passed by the live
  `controllers/common/updateDocument.controller.ts`) logs "from hidden to a
  new one". Secret-named keys are only allowed with this kind; not unique,
  indexed, searchable, defaulted or inside sections. AI/feature prompts know it.
- Admin: `cl/RevealSecret.tsx` (dots + eye → password dialog → value with
  copy, hides after 60s; stops row clicks), table type `secret`
  (`SecretCell`, CELLS_WITH_DOC, `secretPath` from TableRowComponent), view
  type `secret` (ViewRow gets `route`), `useRevealSecretMutation`
  (`store/services/secretApi.ts`). VPassword keeps `value ?? ''`.
- **Dropdown** (`cl/Dropdown.tsx`): `searchable` (default on over 10 items) —
  search box at the top, arrows/Enter handled by the box (the list ignores
  keys from a child), trigger label from the full list.
- **Code prefix:** the API always honoured it; the empty Prefix box showed a
  grey "INV" placeholder people read as set. Switching codes on now fills a
  prefix from the title (`suggestPrefix`), placeholder "None".
- Docs: /docs/builder#models-password, /user-docs/models#models-password,
  record-code notes. DEPLOY.md: `SECRET_ENCRYPTION_KEY` on Heroku.
- Verified: smoke `secrets.mjs` (18 checks) + all suites; super-admin API
  reveal; headless UI — kind search + keyboard pick, table reveal (wrong and
  right password), detail page reveal, edit form blank keeps / new replaces.
- Seen, not from this: "uncontrolled to controlled input" console error on
  every tenant edit form (Tickets too).

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
