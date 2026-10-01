# Multi-tenancy — work orders

Read `README.md` first (decisions D1–D12 and the architecture).
Each item: **files → change → done when**. `BLOCKER` gates later items.
Sizes: **S** ≤ 1h, **M** ≤ half a day, **L** ≤ 2 days.
Paths are from the monorepo root `/Users/asifistiaque/Desktop/proj/e-mint`.
Update the **Status** column and `CHANGELOG.md` as each item lands.

## Status

| WO | Title | Repo | Size | Status |
|---|---|---|---|---|
| 01 | Plan & docs | backend | S | done |
| 02 | Identity & organization models | backend | M | done |
| 03 | Scope context + `tenantScoped` plugin + index migration — BLOCKER | backend | L | done (migration `--apply` pending, WO-08) |
| 04 | Session and two-factor services made model-agnostic | backend | M | done |
| 05 | Tenant auth API (register + onboarding, login, 2FA, sessions, passwords) | backend | M | done |
| 06 | Organizations: members, roles, invitations, switch | backend | M | todo |
| 07 | Projects API | backend | S | todo |
| 08 | Tenant model registry (compile/mount per project) — BLOCKER | backend | L | todo |
| 09 | Project router `/tenant/api/p/:projectId` (builder, sidebar, dashboard, media) | backend | L | todo |
| 10 | Tenant MCP `/tenant/mcp` + project API keys | backend | M | todo |
| 11 | Public API per model + project customers + login widget | backend | L | todo |
| 12 | Panel mode, per-request API base, token, route guard — BLOCKER | admin | M | todo |
| 13 | Tenant auth pages (register questionnaire, login, 2FA, invite accept) | admin | M | todo |
| 14 | Organization console (switcher, projects, members, roles, account) | admin | L | todo |
| 15 | Project workspace (sidebar, builders, dashboard, MCP, public API) | admin | L | todo |
| 16 | Super-admin oversight pages (organizations, tenant users, projects) | both | M | todo |
| 17 | Isolation tests, parity check, guide | both | M | todo |
| 18 | Website projects: website kit (settings, pages, SEO, contents) + site API | backend | L | todo |
| 19 | Website analytics (tracker, events, reports) + website workspace UI | both | L | todo |

Execution order: 01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 12 → 13 → 14 →
15 → 10 → 11 → 18 → 19 → 16 → 17. (12–15 need 05–09; 18–19 need 08 and 11.)

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

## Follow-ups (not in v1)
Per-record access on tenant models; billing/plans and limits per plan;
custom domains for the public API; OAuth for MCP; tenant data export;
deleting an organization.
