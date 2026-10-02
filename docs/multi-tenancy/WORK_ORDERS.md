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

Execution order: 01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 12 → 13 → 14 →
15 → 10 → 11 → 18 → 19 → 16 → 17 → 20 → 21 → 22 → 23 → 24. (12–15 need 05–09; 18–19 need 08 and 11.)

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

## Follow-ups (not in v1)
Per-record access on tenant models; password reset for project customers;
moving files between a project's library and the organization's;
billing/plans and limits per plan;
custom domains for the public API; OAuth for MCP; tenant data export;
deleting an organization.
