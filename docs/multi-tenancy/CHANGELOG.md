# Multi-tenancy — changelog

Newest last. One entry per work order (or per meaningful step inside one):
date, WO, what changed, files, how it was verified, and anything the next
agent must know. Keep entries factual; decisions live in README.md.

---

## 2026-10-02 — WO-01 Plan & docs
- Wrote `README.md` (goals, decisions D1–D13, architecture, naming, glossary)
  and `WORK_ORDERS.md` (WO-01…WO-19, execution order).
- Inputs: the user's requests in the session of 2026-10-02 — registration with
  business questions, organizations with email invitations and 2FA, projects
  holding models, per-tenant sidebar/dashboard/builders, tenant MCP keys,
  public APIs with optional customer auth and a login widget, website projects
  (configuration, pages, SEO, contents, analytics — like the AGS backend), and
  the tenant panel using the same `components/library` UI components.
- Prior state: backend `fca8140` (mint v3), admin `68878b2` (origin v3).
  The super-admin `WebContent` model (`/web-contents`, ModelDefinition
  `6abeb61bc9633b0e4f72c98f`) was built the same day and is the template for
  the website kit's `WebContent` (WO-18).

## 2026-10-02 — WO-02 Identity & organization models
- New `library/models/tenancy/`: `TenantUser` (`tenantusers`; 2FA fields
  mirror Admin's; `generateAuthToken(sid, org)` signs `{_id, kind:'tenant',
  org, sid}`), `Organization` (onboarding answers: businessName, industry,
  teamSize, role, website, country, heardFrom(+Other), goals[] — option lists
  exported), `OrganizationRole` (system owner/admin/member, unique name per
  org), `OrganizationMember` (unique org+user, status active/removed),
  `OrganizationInvitation` (sha256 token hash), `TenantProject` (type
  app|website, slug unique per org, `publicSlug` global, `domains[]`).
- Verified: `npx tsc --noEmit` clean; no model-name collisions in the repo.

## 2026-10-02 — WO-03 Scope context, plugin, index migration
- `library/functions/tenantScope.function.ts`: AsyncLocalStorage scope —
  `runInScope`, `runUnscoped`, `withoutScope`, `scopeMiddleware`,
  `currentScope`, `scopeKey`, `scopeFilter`, and the `tenantScoped` plugin
  (adds `organization`/`project`; filters find*/count/distinct/update*/
  replace/delete*; prepends `$match` to aggregates; stamps save/insertMany;
  an existing doc can only be saved by its own scope). The runners execute a
  returned Query/Aggregate inside the scope (a bare Query would otherwise run
  outside it when awaited).
- Plugin applied to ModelDefinition, RouteSettings, RouteConfig (draftable.ts),
  RouteVersion, SidebarCategory, SidebarItem, DashboardConfig, ApiKey,
  BuiltFeature. Unique indexes are now per scope:
  ModelDefinition {organization, project, name} and {…, route}
  (collectionName stays global); draftable {…, route}; DashboardConfig {…, key}.
- `resolveRoute.function.ts`: caches keyed by `scopeKey()`; `resourceRouteKey`
  understands `/tenant/api/p/:projectId/<route>`.
- `dynamicModels.function.ts`: the super-admin registry sync runs inside
  `withoutScope` (a sync triggered from a tenant request must not see only
  that tenant's definitions and unmount the super admin's routes).
- `scripts/migrateTenantIndexes.js` (dry run by default, `--apply` to change):
  creates the compound unique indexes, then drops `name_1`/`route_1`
  (modeldefinitions), `route_1` (routesettings, routeconfigs), `key_1`
  (dashboardconfigs); adds organization_1/project_1 lookups. **Dry run done,
  not applied yet** — the shared DB is also production's; apply together with
  WO-08 (nothing needs it until a tenant model exists). The new compound
  indexes are created by Mongoose autoIndex on boot (additive).
- `jest.config.ts`: ts-jest `isolatedModules: true` (type-checking suites that
  import mongoose ran jest out of memory; `npx tsc --noEmit` is the type check).
- Tests: `library/functions/test/tenantScope.test.ts` — 8 pass against a
  scratch mongod (`TEST_MONGO_URI=mongodb://127.0.0.1:27999/emint_tenancy_test`;
  skipped without it). Whole suite: 84 pass; `middleware/admin/test/
  adminDeactivation.test.ts` fails 5/5 **before and after** these changes
  (5 s timeouts — pre-existing, not tenancy).
- Super admin unchanged: `node scripts/checkRouteParity.js` → 70 routes, 289
  responses, 26 expected differences, **0 problems**.

## 2026-10-02 — WO-04 Sessions and two-factor for either kind of account
- Schemas became factories: `makeSessionSchema(userRef)` (adminSession.model),
  `makeBlacklistSchema(userRef, sessionRef)`, `makePasskeySchema(userRef)`,
  `makeChallengeSchema(userRef, passkeyRef)`. New tenant collections:
  `TenantSession` (`tenantsessions`), `TenantBlacklistedToken`
  (`tenantblacklistedtokens`) — models/sessions/tenantSession.model.ts;
  `TenantPasskey` (`tenantpasskeys`), `TenantTwoFactorChallenge`
  (`tenanttwofactorchallenges`) — models/twoFactor/tenant.models.ts. In tenant
  collections the `admin` field holds the TenantUser id (kept so one service
  serves both).
- `sessions.function.ts`: `makeSessions({ Session, Blacklist })` →
  `{ Session, issueSession(user, req, method, org?), isRevoked, touchSession,
  revokeSessions, withPlaces }`; `adminSessions` (the old named exports are its
  members) and `tenantSessions`. `issueSession` passes `org` to
  `user.generateAuthToken(sid, org)`.
- `sessions.router.ts`: `addOwnSessionRoutes(router, service)` (list, current,
  others, one) — the admin router uses it with `adminSessions`; the tenant API
  will with `tenantSessions`. Everyone's-sessions routes stay admin-only.
- `twoFactor.service.ts`: `makeTwoFactor({ User, Passkey, Challenge,
  ticketSalt, issue, origins, rpName })`; `adminTwoFactor` (ticket salt
  unchanged, so admin tickets behave exactly as before) and the old named
  exports. Pure helpers (`TwoFactorError`, `notify`, `maskEmail`,
  `makeBackupCodes`, `publicPasskey`) stay module-level.
- `twoFactor.router.ts`: `makeTwoFactorRouter(service, protect)`; default
  export = the admins' router (unchanged paths).
- Dev tooling: `scripts/seedTenancyDev.js` (LOCAL ONLY — refuses a non-local
  URI; test super admin `admin@example.com` / `tenancy-dev-pass-1`), launch
  config `backend-test` (backend on :5001 against
  `mongodb://127.0.0.1:27999/emint_tenancy_dev`; start a scratch
  `mongod --port 27999` first).
- Verified on :5001 (scratch DB) — admin login, self, sessions list, 2FA
  enable → backup codes, login → ticket, wrong code refused, backup code →
  token, 9 codes left, 2FA disable, logout, revoked token → 401
  SESSION_REVOKED, other session still valid: **12/12 pass**.

## 2026-10-02 — WO-05 Tenant auth API
- `server.ts`: `app.use('/tenant/api', logger, tenantRouter)`;
  `routes-tenant/tenant.router.ts` mounts `/auth`.
- `routes-tenant/auth/auth.router.ts`: register (Joi; account + organization
  + onboarding answers in one call; rolls back the user if the organization
  fails), login (one message for unknown email / wrong password; 2FA ticket),
  `/2fa` (= `makeTwoFactorRouter(tenantTwoFactor, tenantProtectAccount)`),
  `/sessions` (`addOwnSessionRoutes` over `tenantSessions`), self,
  update/self (+ `PUT /`), update/preferences (dots in keys → `_`),
  change-password (signs out other devices), forgot-password (same answer
  for unknown emails; link to `TENANT_FRONTEND_URL`/auth/reset-password/…),
  reset-password (single use; signs out every device), logout.
  `tenantTwoFactor` = `makeTwoFactor` over TenantUser / TenantPasskey /
  TenantTwoFactorChallenge with ticket salt `tenant-two-factor-ticket`, origins
  `TENANT_WEBAUTHN_ORIGIN` or `TENANT_FRONTEND_URL` (default
  http://localhost:3001); a finished 2FA sign-in opens `pickOrganization`.
- `middleware/tenant/protect.tenant.middleware.ts`: `tenantProtect` (needs
  the token's organization and an active membership — else 401
  `ORG_ACCESS_REVOKED` / 403 `NO_ORGANIZATION`) and `tenantProtectAccount`
  (no organization needed). Sets req.user/organization/member/role/permissions.
- `middleware/admin/protect.admin.middleware.ts`: refuses any token with a
  `kind` claim (tenant/customer tokens share the signing key).
- `library/functions/tenantPermissions.function.ts`: ORG_PERMISSIONS
  (manage-organization, manage-members, manage-roles, create-projects,
  manage-projects, build, manage-api-keys, data:*, data:view), system role
  defaults (owner `*`, admin `*`, member `data:*` + `create-projects`),
  `seedOrgRoles`, `grants`, `tenantPermissions([...])`, `ownerOnly`.
- `library/functions/tenancy.function.ts`: `TenancyError`, `handle`,
  `slugify`/`uniqueSlug`, `createOrganization` (roles + owner membership;
  cleans up on failure), `pickOrganization`, `publicUser`,
  `publicOrganization`, `publicProject`, `selfPayload`.
- `library/functions/rateLimit.function.ts`: in-process limiter (tenant auth:
  30 per 15 min per IP).
- `TenantUser`: bcrypt pre-save hook, `checkPassword`.
- `twoFactor.service.ts` now exports its mail helpers `deliver`, `shell`, `p`.
- Verified on :5001 (scratch DB): 27/27 checks — register, duplicate email,
  invalid onboarding answer, self (org, owner role, onboarding kept, no
  secrets), tenant token → 401 on the admin API and admin token → 401 on the
  tenant API, wrong password, login token claims (kind/org/sid), 2FA enable →
  ticket → a tenant ticket is 410 on the admin 2FA → backup code → token in
  the same org, disable, sessions list/sign out others/revoked → 401, update
  self ignores unknown fields, change password (needs current), forgot
  password same answer, bad reset token, logout. Plus: reset link from the dev
  mail log → password changed → link refused the second time → login OK.

## 2026-10-02 — WO-06 Organizations
- `routes-tenant/org/org.router.ts` at `/tenant/api/org`: list mine, create
  (you own it; ≤ 20 owned), switch (new session in that org; the session it
  came from is signed out; `lastOrganization` updated), overview + counts,
  update (name, logo, onboarding — manage-organization), members (list,
  change role — manage-members; owner's role fixed; the owner role can't be
  given, only transferred), remove (manage-members) / leave (`me`; the owner
  can't), transfer-ownership (owner; the old owner becomes Admin), roles
  (list with member counts, create, update — owner/admin keep `*`, delete —
  not system roles, not in use, not on a pending invitation), permissions
  list, invitations (list pending, create/re-send — one open invitation per
  email, 7-day link, rate-limited; resend ≥ 1 min apart; cancel).
- `invitationsRouter` at `/tenant/api/invitations`: `GET /:token` (email,
  organization, role, whether the account exists) and `POST /:token/accept`
  (existing account: its password; new: name, phone, password) → token in
  that organization. Links are single use; only the sha256 is stored.
- A removed member's token gets 401 `ORG_ACCESS_REVOKED` on every route
  (the tenant panel signs out; signing in again opens another organization
  or none).
- Dev mail log label is now `[mail → …]` (was `[2FA mail → …]`).
- Verified on :5001: 12/12 (part 1: overview, update, system roles, custom
  role, unknown permission refused, invitations incl. role checks and
  listing without token hashes) + 28/28 (part 2: invitation info, accept
  new/existing, single use, membership role, two orgs + switch + old token
  signed out, no switching into foreign orgs, Member can't invite or edit the
  org, role change, owner role fixed, role in use not deletable, remove →
  ORG_ACCESS_REVOKED, leave, owner can't leave, transfer ownership, only the
  owner transfers).

## 2026-10-02 — WO-07 Projects API
- `routes-tenant/projects/projects.router.ts` at `/tenant/api/projects`
  (tenantProtect): list (active; `?archived=1` for all; each with its model
  count), create (create-projects; type app|website; slug unique per org,
  `publicSlug` = `<org slug>-<project slug>` globally unique; domains
  validated; ≤ 100 active per org), get, update (manage-projects; incl.
  archive via `isActive:false`), delete (empty projects; with models only
  `?force=1` by the owner). Every lookup is confined to `req.organization`.
- Create seeds, inside the project's scope, a sidebar section ("Pages", or
  "Website" for websites) and an empty dashboard; then runs
  `projectHooks.created` (a throw removes the whole project).
- Delete removes the project's documents from every scoped collection
  (`runInScope` + deleteMany), drops its `t_<projectId>_*` collections, then
  runs `projectHooks.removed`.
- `library/functions/projectHooks.function.ts`: `onCreated` / `onRemoved`
  registry (WO-08 registry cleanup and WO-18 website kit register there).
- Verified on :5001: 15/15 — create app/website, duplicate names → `crm-2`,
  bad domain/type refused, list + counts, self lists projects, another org
  gets 404 on get/edit and sees none, archive hides, `?archived=1` shows,
  delete. DB: the two live projects each have their section and dashboard,
  the deleted one left nothing, and the super-admin
  `GET /admin/api/sidebarcategories` sees 0 of them.

## 2026-10-02 — WO-08 Tenant model registry, WO-09 project router (core)
**Registry — one per scope, same code** (`library/functions/dynamicModels.function.ts`):
- State (compiled models, failures, mounts, last check, running sync) lives
  in a `Registry` per `scopeKey()` — `admin`, or `p:<projectId>`. Every
  existing caller (`syncDynamicModels`, `compiledModel`, `compileError`,
  `isBuiltModel`, the dispatcher) gets the current scope's.
- `internalModelName(name)` → `T<projectId>_<Name>` in a project scope. A
  tenant def compiles under it, with its references remapped to internal
  names; Counter slugs use it too (`counterSlugFor`) so codes number per
  project (INV-0001 in two projects).
- `checkAvailability` in a project: names/routes only against the project's
  definitions + `TENANT_RESERVED_ROUTES`; collection `t_<projectId>_<route>`.
- `makeTargetLookup`/`linkTargets` in a project: only its own models (no code
  models — D6).
- `mount` passes `auth: { protect: pass-through, hasPermission:
  tenantPermissions }` for tenant routes; per-record access is off for them.
- `forgetProjectModels(projectId)` (registered on `projectHooks.onRemoved`)
  deletes the project's compiled Mongoose models and its route map.
- The super admin's sync still runs `withoutScope`.

**Route registry** (`routeRegistry.function.ts`): `dynamicMounts` is a
per-scope facade (has/get/keys/entries/size/iterate) and
`getDynamicVersion`/`setDynamicMount` are per scope; `forgetScopeMounts`.
`collectRoutes`/`collectResourceRoutes` don't walk the app's code routes in a
tenant scope. New `scopedModel(name)` / `scopedModelNames()` (a project sees
only `T<itsId>_*` models), `displayModelName` (drops the prefix), and
`resolveFilterModel` uses `scopedModel` (a published filter can't name
`Admin`).

**Shared code made tenant-safe**
- `routes-admin/common/router.ts` `defineRoutes`: optional `auth` ({ protect,
  hasPermission }); default adminProtect/adminPermissions unchanged.
- `builder.controller.ts`: model lists/lookups via `scopedModelNames`/
  `scopedModel` (no inspecting platform or other projects' models).
- `models.controller.ts`: in a project no global `Permission` docs are
  created/renamed/deleted (permissions are role keys); per-record access
  refused (D12); counter slug via `counterSlugFor`; preview model list scoped.
- `viewDocument.controller.ts`: resource-registry and code-config caches per
  scope.
- `library/controllers/builder/_index.ts` → `makeBuilderRouter({ view, edit,
  keys, tenant })`; for tenants `/models/ai`, `/features/ai`, `/state`,
  `/source` answer 403 (D10). `dashboard/_index.ts` →
  `makeDashboardRouter({ read, edit })`. Default exports = the admin's.
- `getAdminSidebar(can?)`: the permission rule is injectable (tenants pass
  `grants`).
- `History` and `DeletedRecord` now use `tenantScoped` (tenant record
  history and undo snapshots stay out of the super admin's lists).
- `createDocument` message uses `displayModelName`.

**Project router** `routes-tenant/project.router.ts` at
`/tenant/api/p/:projectId`: tenantProtect → project in the token's org
(archived: read-only) → `runInScope` → `/builder` (build; MCP keys:
manage-api-keys), `/dashboard` (read; build to change),
`/sidebar/:platform/server` (role-filtered; other types 404),
`/sidebarcategories` + `/sidebaritems` (defineRoutes, build), then the
project's built models via `dynamicModelsDispatcher`.

**Verified** (scratch server :5001; scripts now in `scripts/tenancy-smoke/`):
models.mjs 30/30 — two organizations each create `Client` + `Invoice` at the
same routes (collections `t_<id>_invoices`), a second `Client` → `Client2`,
records with codes per project and populated references, no cross-org or
cross-project reads, config served, builder lists only the project's models,
platform/other-project models 404 on inspection, route builder lists only
project routes, AI and global switch 403, admin code routes 404, sidebar
lists the model, admin built-in nav 404, super admin sees no tenant models or
records, model delete, project delete needs force then removes routes. Tenant
history entries carry the org (3) and the super admin's list has 0.
projects.mjs 15/15. Unit tests 8/8. Route parity: 0 problems.

## 2026-10-02 — WO-09 Project media, permission list (+ an admin security fix)
- **Security fix (separate commit `0ba84c5`)**: `DELETE /admin/api/upload/:key`
  deleted any S3 object and its File record with no sign-in, and
  `/upload/get/sum/s3` and `/get/sum/awsbill` were open too. All now require
  adminProtect. Found while reading the upload router for tenancy.
- `middleware/tenant/dual.middleware.ts`: `adminOrTenantProtect`,
  `adminOrTenantPermissions`, `adminOnlyRoute` — outside a tenant scope
  exactly the admin guards; inside one (set server-side by the project
  router) the already-signed-in member and the org role's permissions.
- `upload.admin.route.ts` and `media.admin.route.ts` use the dual guards;
  signature upload, S3 delete-by-key and the AWS sums are `adminOnlyRoute`
  (404 in projects). The media trash purge job runs `runUnscoped` (every
  scope's trash).
- `AdminFile` (`adminfiles`) and `Folder` use `tenantScoped`; Folder `slug`
  is unique per scope (compound index — a project gets its own `default`
  upload folder). `migrateTenantIndexes.js` drops `folders.slug_1` and adds
  the compound index.
- `deleteS3ObjectIfUnused` checks references **across every scope**
  (`runUnscoped`) — a tenant's File can't be used to delete an object another
  scope uses. `POST /tenant/api/p/:id/files` is refused (uploads create files).
- Project router mounts `/upload`, `/media`, `/files` (defineRoutes over
  AdminFile with tenant auth, live files only, media delete).
- `GET /tenant/api/org/permissions` also lists each project's models with
  their `view-/create-/edit-/delete-<route>` keys (for the roles screen).
- Not done: tenant notifications (only per-record access sends them, which
  tenants don't have — D12).
- Verified: `scripts/tenancy-smoke/media.mjs` 15/15 (folders per project,
  auto-renamed duplicates, own `default` folder, browse/tree/list, direct
  File create 405, S3 delete/bill 404 in projects, other org 404, super admin
  doesn't see tenant folders, admin S3 delete needs sign-in, permissions list
  has `view-invoices`); projects 15/15, models 30/30, admin 12/12; route parity
  0 problems. No real S3 upload was made (the scratch server uses the real
  bucket from .env).

## 2026-10-02 — WO-12…15 Tenant panel (admin repo, commits 6c5d5d4, e7cdba2)
**Panel mode** (`admin/src/components/library/config/lib/constants/panel.ts`):
`PANEL`/`IS_TENANT_PANEL` from `NEXT_PUBLIC_PANEL`; `BACKEND`; the open
project in localStorage (`mint:tenant-project`; switching reloads);
`apiBase(path)`/`apiUrl(path)` — account paths (`auth|org|projects|invitations`)
at the tenant API root, everything else at `/p/<projectId>`; `pagePath(route)`
— tenant tables at **`/t/<route>`** (the panels are one app: a project route
named like an admin page — `/invoices`, `/clients` — would open that page). The
token name defaults to `MINT_TENANT_TOKEN` in the tenant panel.
- `mainApi` uses a per-request baseQuery over `apiUrl`; media uploads/downloads
  too (`pages/media/utils.ts`). `SessionGuard` also signs out on
  `ORG_ACCESS_REVOKED`.
- `src/components/library/tenant/`: `useWorkspace` (self → organization,
  organizations, role, permissions, projects, open project, stale project),
  `openProject`/`leaveProject`, `can` (mirror of backend `grants`),
  `WorkspaceSwitcher` (navbar: projects, all projects, organizations, new
  organization; switching org trades the token), `PanelGuard` (tenant panel:
  admin-only pages → home, a stale project is forgotten; admin panel: `/org`,
  `/t` → home), `ProjectsBoard` (home with no project, and `/projects`; new
  App/Website dialog, archive/restore, delete with type-to-confirm when it has
  data), `onboarding.ts` (answer lists, in step with the backend enums),
  `pages.ts` (ADMIN_ONLY_PAGES, TENANT_ONLY_PAGES).
- Pages: `/auth/register` → two-step sign-up (account + organization, then
  business questions) in the tenant panel; login footer links to it;
  `/auth/accept-invitation/[token]` → tenant flow; `/org/members`,
  `/org/roles`, `/org/settings`, `/org/new`; `/t/[slug]` table page; `/`
  without a project → ProjectsBoard, with one and no dashboard → an empty state
  linking to the dashboard builder; `/projects` → ProjectsBoard.
- Links that built `/<route>` now use `pagePath` (create/edit pages, table
  heading crumbs and row menu, create/editor navs, dashboard widgets, record
  view crumbs).
- Tenant polish: footer without Support/Status/Report Issue; sidebar brand =
  organization name; Settings hides the signature card; "Build a feature" and
  "Build with AI" hidden in projects (empty features list points to Connect
  your AI); notifications bell hidden.
- `next.config.mjs`: `distDir` from `NEXT_DIST_DIR` (both panels in dev).
  `.claude/launch.json`: `tenant` (:3001 → backend-test :5001/tenant/api) and
  `admin-test` (:3002 → :5001/admin/api).

**Backend for the panel**: `GET /tenant/api/sidebar/:platform/:type` (Home +
Organization section, no project); the project sidebar = project sections
(hrefs `/t/<route>`) + `tenantNav` (Build: Models, Pages, Sidebar, Dashboard,
Media, Connect AI; Organization: Projects, Members, Roles, Settings — each per
permission). `buildSidebar(permissions, can)` extracted from getAdminSidebar
(a section title now goes on the first *visible* item — it used to vanish when
the first item was permission-hidden).

**Verified in the browser** (tenant panel :3001): sign-up with the questions
(answers stored on the organization), landing on the organization home with
the Organization sidebar and switcher, creating a project from the dialog
(opens it: Build + Organization sidebar, empty dashboard), the model builder
inside the project (0 models). Admin-test (:3002): login, self, sidebar,
builder/models, notifications — all at `/admin/api`, 200. A model + record
created through the tenant API from the panel tab; `/t/deals` loads its route
and config. **Not verified**: clicking through tables/forms/builders in the
tenant panel — the browser pane went hidden and the page stopped rendering;
re-run with the pane visible.

## 2026-10-02 — WO-10 Tenant MCP
- `library/controllers/mcp/mcp.router.ts`: `makeMcpRouter(authenticate)`; the
  `Caller` now carries `page(route)`/`link(path)` (the links tools return),
  `allows(permission)`, `builder(scope)` and an optional tenant `scope` — the
  whole JSON-RPC batch runs `runInScope(scope)` when present. The default
  export is the admins' `/mcp`, unchanged (admin role, `view-/edit-builder`,
  admin URLs).
- `routes-tenant/mcp.router.ts` at **`/tenant/mcp`** (and `/tenant/mcp/emk_…`,
  mounted before the request logger like `/mcp`): the key is looked up across
  scopes (`runUnscoped`) and must have an organization and a project; it acts
  as the member who made it with their organization role (`build` for the
  read/build scopes, `view-<route>`/`data:*` for `query_records`); refused when
  the member left, the organization is off, or the project is deleted or
  archived. Links point at the tenant panel (`/t/<route>`).
- Keys are made in the project (`/tenant/api/p/:id/builder/api-keys`,
  `manage-api-keys`); they're ApiKey documents stamped with the project's ids,
  so the admin `/mcp` (no scope → `organization: null`) never finds them, and
  `/tenant/mcp` refuses admin keys (no project).
- Admin repo: the Connect your AI page shows `/tenant/mcp` in the tenant panel.
- Verified: `scripts/tenancy-smoke/mcp.mjs` 19/19 — create a key (secret once,
  listed only in its project), initialize, tools/list, list_models (only the
  project's models), plan_feature + build_feature (Ticket → the project's
  Client, link `/t/tickets`), records readable through query_records, the
  model absent from the org's other project, a project key → 401 on `/mcp`, an
  admin key → 401 on `/tenant/mcp`, the admin MCP lists no tenant models or
  internal names, revoke → 401.

## 2026-10-02 — WO-11 Public API, project customers, login widget
- `ModelDefinition.publicApi { enabled, actions[list|get|create|update|delete],
  auth none|customer, ownerOnly }`; Joi `PUBLIC_API` in models.controller;
  `PUT /builder/models/:id/public-api` (projects only — 404 for the super
  admin; owner-only needs `auth: customer`; at least one action when on;
  bumps the version so the model recompiles). A model with its public API on
  gets a `customer` path (ref ProjectCustomer, indexed) — not in its settings,
  so the panels' tables ignore it.
- `library/models/tenancy/projectCustomer.model.ts` (`projectcustomers`,
  tenantScoped, unique {organization, project, email}, bcrypt, tokens
  `{_id, kind:'customer', project, v}` for 30 days, `tokenVersion` to sign every
  device out) + `projectCustomer.settings.ts` (Customers table; password and
  tokenVersion excluded).
- `routes-public/` mounted at **`/public`** (CORS open app-wide; `Cross-Origin-
  Resource-Policy: cross-origin` so other sites can load the widget):
  `GET /public/widget.js` (routes-public/widget.ts — `[data-mint-login]` card,
  `window.MintAuth { ready, user, token, fetch, signIn, signUp, signOut,
  onChange }`, token per project in localStorage, inline styles, light/dark);
  `/public/api/:publicSlug` → the project (active, org active) in its scope:
  `GET /` (public models + fields), `/auth/register|login|me|logout-everywhere`,
  and per model list (page, limit ≤ 100, sort, `?field=value` filters on
  simple kinds) / get / create / update / delete — only enabled actions (else
  404), `auth: customer` → 401 `customer_required` without a token of this
  project, owner-only → stamped and filtered by the customer, only the model's
  fields in and out (+ _id, code, createdAt, updatedAt), references populated
  by their display field, formulas stripped from input and computed from the
  route's (published or generated) settings, Mongoose validation → 400.
  Rate limits: 300/min per IP on the API, 40/15 min on customer auth.
- Project router: `/customers` (defineRoutes over ProjectCustomer, `build`;
  POST refused — customers sign up themselves).
- Project delete now also removes its customers, folders and files (S3 objects
  only when no scope references them).
- `TENANT_RESERVED_ROUTES` narrowed to the tenant API's own paths (+ action
  words) — the admin's page names (orders, payments, users…) are free for
  projects, whose tables live at /t/<route>.
- `handle` (tenancy.function) keeps a status the handler set (201 on create).
- Verified: `scripts/tenancy-smoke/public.mjs` (all pass) — public slug,
  Products open list/get, owner-only without customer auth refused, Orders for
  customers + owner-only, platform models 404 on public-api, public info, list
  sorted with only model fields, get, disabled action 404, model without API
  404, unknown project 404, sign-up/login/wrong password/me, 401 without a
  customer, create with the formula computed (37.5) not taken from input, model
  validation 400, populated item, another customer sees 0 / can't open or
  delete, update recalculates (50), sign out everywhere, customer token → 401 on
  the tenant and admin APIs, tenant Customers table (no passwords, not in the
  other project), internal fields kept in the panel, widget.js served with
  CORP cross-origin. Full suite (admin, tenant-auth, projects, models, media,
  mcp, public) and route parity (0 problems) re-run green.

## 2026-10-02 — WO-18 Website projects
- `library/functions/websiteKit.function.ts`: `WEBSITE_KIT` — one feature plan
  built with `buildFeature` (all or nothing) when a **website** project is
  created (`projectHooks.onCreated`, registered by importing the module from the
  projects router):
  - `SiteSettings` `/site-settings` — AGS GlobalSettings (site name, logo,
    favicon, footer, colours, font, contact, map, socials, default SEO,
    feature switches).
  - `WebPage` `/pages` — name, path (unique), status (draft/published/
    archived), template, parent (self), showInMenu, priority.
  - `PageSeo` `/seo` — AGS Seo: page (→ WebPage, required), title, description,
    image, keywords, tags, canonical, noIndex.
  - `WebContent` `/web-contents` — the AGS Content model (the same fields,
    form sections and table as the super-admin WebContent built earlier),
    except AGS's fixed `pageName` list became a `page` reference (→ WebPage)
    — the link on the "many" side, so a page's detail shows its contents tab.
    `articles` (AGS Article) is left out — no such model in a project.
  - The four models' public API starts as list/get, open (the site reads them).
- Site API (routes-public, website projects only — 404 otherwise):
  `GET /public/api/:slug/site` (first settings record + menu of published,
  in-menu pages by priority) and `GET /public/api/:slug/pages/by-path?path=/x`
  (a published page, its SEO, its visible published contents by priority).
  Both read the kit routes; a site that removed them uses the per-model API.
- Verified: `scripts/tenancy-smoke/website.mjs` all pass — kit models and their
  read-only public API, Website sidebar section links `/t/...`, unique paths,
  /site settings + menu order, a page with SEO and only visible published
  contents in order with card rows, draft page 404, page without SEO, per-model
  filter, writes 404, /site 404 for an app project. projects.mjs updated (a
  website project now counts its 4 kit models).

## 2026-10-02 — WO-19 Website analytics (backend)
- `library/models/tenancy/websiteEvent.model.ts` (`websiteevents`, tenantScoped,
  TTL 400 days, indexes {project, createdAt}, {project, type, path, createdAt}):
  type pageview|click|event, name, path, title, referrer, referrerHost, utm*,
  sessionId, visitorId, device, os, browser, country/code, city, element, props.
- `routes-public/track.ts` → `GET /public/track.js`: page views on load and on
  client-side navigation, outbound-link and `[data-track]` clicks,
  `MintAnalytics.track(name, props)` / `.pageview()`; no cookies (visitor id in
  localStorage, session id in sessionStorage); batches via sendBeacon
  (text/plain); off with `data-no-track` or Do Not Track.
- `POST /public/api/:slug/track` (website projects; 120/min per IP): parses
  text/plain or JSON, drops bots and events from sites not in the project's
  `domains` (www. and subdomains match; localhost in development; any site when
  no domains are set), ≤ 20 events a batch, device/browser/OS from the UA,
  place from `locate()` (GEOIP), referrerHost blank for internal/direct, custom
  props flattened (≤ 20 short values). Answers 202.
- `routes-tenant/analytics.router.ts` at `/tenant/api/p/:id/analytics`
  (`view-analytics`): `/summary` (page views, visitors, sessions, pages per
  session, bounce rate, and the previous period), `/timeseries` (every day in
  the range), `/top?dim=paths|referrers|devices|browsers|os|countries|clicks|events`.
  Range defaults to 30 days, at most 400.
- Tenant sidebar: an **Audience** section — Analytics (websites, view-analytics),
  Public API and Customers (build). Project delete also removes its events.
- Verified: `scripts/tenancy-smoke/analytics.mjs` 21/21.

## 2026-10-02 — WO-16 Super-admin oversight
- `library/models/tenancy/oversight.settings.ts`: settings + configs for
  `organizations` (owner, plan, active, the sign-up answers as dotted
  `onboarding.*` fields with industry/heard-from filters; detail page with an
  "About the business" section and a Projects tab over `tenant-projects`),
  `tenant-users` (password, backup codes, reset token excluded) and
  `tenant-projects` (organization, kind, public slug, domains, active).
- `routes-admin/admin.router.ts`: `/organizations`, `/tenant-users`,
  `/tenant-projects` via defineRoutes; create, delete and copy answer 404
  (`notAllowed`) — tenants are made by signing up. Switching an organization or
  user off signs them out on their next request (tenantProtect); a project off
  = archived.
- Admin `preferences` keys: organizations, tenant-users, tenant-projects.
- `scripts/seedTenancyAdmin.js`: permissions (view/edit) and a "Tenants"
  sidebar section with the three tables. **Run on the scratch DB only** — on
  the shared database it's a deploy step (`npm run build && node
  scripts/seedTenancyAdmin.js`).
- The admin panel's generic `[slug]` page serves the three tables; nothing
  admin-side had to be written.
- Verified: `scripts/tenancy-smoke/oversight.mjs` 16/16; the full smoke suite
  (admin, tenant-auth, projects, models, media, mcp, public, website, analytics,
  oversight) green; route parity 73 routes / 301 responses, 0 problems.

## 2026-10-02 — WO-15/19 UI, WO-17 guide and tests, deploy notes
- Admin repo (`faa3c7a`, `c367429`): `/analytics` (stat tiles vs previous
  period, page views per day, top pages/referrers/devices/countries/clicks/
  events), `/public-api` (per model switch, actions, who may call it,
  endpoints, widget/tracker/site API snippets), Edit on project cards (name,
  description, domains), `/docs/tenancy` guide in GUIDES with "How this works"
  links on the tenant pages (`tenant/GuideLink`). `next build` passes for both
  panels.
- Backend: `scripts/tenancy-smoke/run-all.sh` — all 11 scripts green (org-2 by
  hand); `DEPLOY.md` (Heroku vars, the index migration, the oversight seed,
  the tenant panel's Vercel env); README §5 "Where things are".
- Still to do after deploying (DEPLOY.md §3): a browser click-through of the
  tenant panel. Follow-ups (WORK_ORDERS): per-record access for tenant models,
  plans/limits, custom domains, OAuth for MCP, tenant data export, deleting an
  organization, tenant notifications.

## 2026-10-02 — WO-20 User guides, and fixes found writing them
- Admin: `/user-docs` (home + 16 guides, public, no login), built on the
  shared docs pieces — `docs/_components/prose.tsx` (Section, P, C, A, List,
  Note, Terms, CodeBlock, useHashScroll), `GuideCard.tsx` (moved out of the docs
  home), DocsNavbar/DocsShell take a `nav`, GuideHeader an `icon`.
  `panel.ts docsPath` maps /docs links to user guides in the tenant panel; used
  by every shared screen's guide link (builder, model builder, sidebar and
  dashboard builders, media, settings/2FA, login 2FA step, theme modal, bulk
  upload, terms, site shell). DocsShell redirects /docs pages to their user
  guide in the tenant panel (before AuthWrapper); PanelGuard does too and
  skips the account lookup on /user-docs. `/docs/tenancy` removed; the admin
  docs list the user guides as a card.
- Admin, tenant panel: the model builder's Access panel is hidden (the
  backend already refuses per-record access in projects, D12); the route
  builder's "Source for every route" panel and per-route Source panel are
  hidden (they answer 403 to tenants), the tab reads "Versions".
- Backend fix: a public model's owner path was `customer`, which replaced a
  tenant field of the same name (an order's `customer` link to their own
  Customers model) whenever the public API was on. Now `_customer`
  (`dynamicModels.function.ts`, `routes-public/public.router.ts`).
  `public.mjs` gains a model field named `customer` and checks it survives.
- Verified: smoke suite `run-all.sh` green on a fresh scratch DB (11 scripts;
  org-2 by hand as before); `tsc --noEmit` clean in admin; in the browser, the
  tenant panel's /user-docs pages render signed out, `/docs/builder#mcp-keys`
  → `/user-docs/connect-ai#mcp-keys`, `/docs/builder#table-upload` →
  `/user-docs/pages#table-upload`, `/docs/two-factor#passkeys` →
  `/user-docs/account#passkeys`; the admin panel's /docs unchanged. A script
  check: every in-app guide anchor and every guide-card topic exists in its
  user guide (only `all-sessions`, from the admin-only Sessions page, has none).

## 2026-10-02 — WO-21–24 Standard roles, project access, media library, several organizations
Decisions D14–D17 (README).
- **WO-21** `tenantPermissions.function.ts`: `ORG_PERMISSIONS` (with `group`)
  led by `records:view|create|edit|delete`; `normalizePermissions` (old
  `data:*`/`data:view` → record keys, per-model keys dropped); `grants` maps
  `view-|create-|edit-|delete-<route>` onto them and `build` onto media
  (`*-image`). Member = four record keys + `create-projects`. Applied in
  tenantProtect (`req.permissions` normalized), `selfPayload`, the MCP key
  check; roles API accepts old keys and saves them normalized,
  `/org/permissions` returns the grouped list only. Customers follow the record
  keys (were `build`); tenantNav shows Customers on `view-customers`.
- **WO-22** OrganizationMember/OrganizationInvitation `allProjects` +
  `projects[]`; `opensAllProjects`/`projectAccessFilter`/`canOpenProject`
  (tenancy.function). Enforced in projects list/get/put/delete, `/p/:projectId`,
  `auth/self`, tenant MCP keys. New project → added to a limited creator's list;
  deleted project → pulled from members and invitations. `PUT /org/members/:id
  { role?, allProjects, projects }`, invitations take and carry the same.
- **WO-23** `TenantProject.mediaScope` (`project` | `organization`), set on
  create/edit, in `publicProject`; project router `mediaLibrary` runs
  `/upload`, `/media`, `/files` in `{organization}` when shared.
- **WO-24** TenantUser `emailVerified` + hashed 6-digit `emailVerifyCode`
  (10 min, 5 tries); `POST /auth/verify-email/send`, `POST /auth/verify-email`;
  reset-password by email and any invitation join set it.
  `/tenant/api/invitations/for-me` (GET, `:id/accept` → token in that org,
  DELETE = decline) — verified emails only (`email_unverified` 403).
  `joinFromInvitation` shared by every path; the emailed link joins in one
  click for a signed-in invitee (`signedInTenantUser`, protect middleware).
- Admin: Roles editor = Records (four switches) / Projects / Organization, role
  summaries; `tenant/ProjectAccessPicker` in the invite dialog and a member's
  "Projects for …" dialog (row shows "All projects" / "1 project: Shop");
  project dialog "Media library" segment; `tenant/Workspaces` on Projects
  ("Invitations for you" with verify-by-code, "Your organizations" with
  Switch); accept page one-click for the signed-in invitee and shows the
  projects; media root named after its library (`useMediaRoot`); sidebar
  builder: "Only people who can view records" (no per-page permission picker
  in projects). User guides updated (organization: project access, when
  you're invited, roles; projects: media library; records, models, media,
  sidebar, analytics, connect AI, FAQ, getting started).
- Verified: new `scripts/tenancy-smoke/access.mjs` 35/35 (in run-all.sh);
  full suite green incl. org-1 (old keys normalized) and media (grouped
  permissions); org-2 by hand 28/28 against the new join code; by hand from
  the dev mail log: a real verification code verifies, the emailed link joins
  in one click signed in and still needs the password signed out. Browser
  (headless, agent-browser, the pane being hidden): Projects for a
  View-only member limited to Shop (only Shop, both organizations listed),
  Members (access lines), Invite (All projects / Only these), New role
  (records first), Edit project (Media library). `tsc` clean in both repos.
- No data migration: new fields default to today's behaviour (all projects,
  project media); old role keys are read as before and cleaned on save.

## 2026-10-02 — Tenant panel: landing page, own token, Files section, forms in a drawer
- **Landing page** (admin `a9c533a`, main): the tenant panel's `/` is a public
  landing page (`src/app/_landing`) — sign up / sign in, or a Dashboard button
  when signed in; the dashboard moved to `/dashboard`. `HOME` (panel.ts) is the
  only home link/redirect; the sidebar's `'/'` goes through `homeHref`. The
  super-admin panel's `/` is unchanged.
- **Token key**: the tenant build always uses `MINT_TENANT_TOKEN`
  (+ `MINT_TENANT_REFRESH_TOKEN`); `NEXT_PUBLIC_TOKEN_NAME` only sets the
  admin's. `useAuth` treats the `'null'` left by signing out as signed out.
- **Files section**: `tenantNav` shows *Files → Media library* (`/images`) to
  anyone granted `view-image` (records:view or build), before Audience; Media
  is no longer under Build. Smoke: `models.mjs` checks it.
- **Forms**: `useModalLayout` always returns `drawer` in the tenant panel (no
  self query); Settings hides *Form layout* there. Guides (account, records,
  media, getting-started) updated.
- Verified: smoke suite all green; headless browser — sign-up lands on
  `/dashboard`, landing header flips Sign in/Sign up ↔ Dashboard, sidebar shows
  Files → Media library and opens `/images`, tenant Settings has no Form layout.

## 2026-10-02 — Model names are the project's own
- **Cause** of "a model named Client already exists" in projects: databases
  older than multi-tenancy keep the global unique indexes on
  `modeldefinitions.name/route` (and route/key/slug on routesettings,
  routeconfigs, dashboardconfigs, folders) until `migrateTenantIndexes.js`
  runs, so a project's `Client` hit the platform's `Client`, or another
  project's. The scratch DB was created with the scoped indexes, so local
  tests never saw it.
- **Fix**: `ensureTenantIndexes()` (library/functions/tenantIndexes.function.ts)
  runs after the DB connects (server.ts): creates the scoped unique index, then
  drops the global one. Verified on a throwaway DB seeded with the old indexes:
  before → E11000 on `{name: "Client"}`; after → two projects' Client both save,
  a second Client in one project is still refused; a second run is a no-op.
- **Mongoose names**: tenant models are `T<projectId>_<Name>`; four places
  looked a model up by its plain name (`mongoose.models['Client']`), which in a
  project is the platform's model — bulk import links, MCP query_records
  filters/populate, dashboard stats labels, the record view's related lists.
  All now go through `scopedModel()`. Smoke: import links "Acme Ltd" to the
  project's own Client.
- **Names vs addresses**: in a project, `checkAvailability` numbers the name
  and the address apart — a name is numbered only when the project already has
  it; an address only when it's one of the project's own (`/customers`…). A
  Customer model stays `Customer` at `/customers2`. Smoke checks it.
- **MCP**: in a project, `describe_platform` says names belong to the project,
  to name models plainly and never prefix or number them to dodge a clash.
- Smoke suite all green (after a backend restart — repeated runs hit the
  sign-up rate limit, 429).

## 2026-10-02 — Project addresses: /<project>/<page> (D18)
- **Admin**: `src/proxy.ts` (Next 16 proxy) — in the tenant build, a first
  segment that isn't one of the app's pages is a project (publicSlug):
  `/acme-store` → /dashboard, `/acme-store/clients` → /t/clients,
  `/acme-store/clients/<id>` → /view/clients/<id>, `/acme-store/<project page>…`
  → that page (rewrites; the address stays). The page list comes from
  `src/app`'s folders at build time (next.config.mjs → NEXT_PUBLIC_APP_PAGES).
  A project page with no project in its address redirects into the
  `mint_project` cookie's project (the tab in front sets it), so hard-coded
  links like `/dashboard-builder` still land in the right project.
- panel.ts: `getProjectSlug()` (from the address; replaces the localStorage
  project), `projectHref()` / `projectPagePath()`, `rememberProject()`;
  `apiBase` calls `/p/<publicSlug>`; `pagePath`, sidebar/search links and
  record links (`/view/…`) go through `projectHref`. `openProject(slug)` opens
  `/<slug>`; leaving, switching organization and signing out clear the cookie.
- **Backend**: `/tenant/api/p/:project` accepts the publicSlug or the id;
  new publicSlugs skip the panel's page names (`PANEL_PAGES`); tenant MCP page
  links are `/<publicSlug>/<route>`; `images`, `public-api`, `t` reserved as
  model routes.
- Verified in a headless browser (local test account, projects Shop and
  Blog): opening Shop → `/url-co-shop`; sidebar links all prefixed; the
  hard-coded `/dashboard-builder` link → `/url-co-shop/dashboard-builder`;
  `/url-co-shop/clients` lists Shop's record; `/url-co-shop/clients/<id>` shows
  it; a second tab at `/url-co-blog` is in Blog while the first, reloaded,
  stays in Shop; an unknown `/nope-nothing` → /projects. API: the slug and the
  id both work, Blog can't see Shop's model (404).

## 2026-10-02 — WO-29…32: project cache, MCP dashboard, per-record access, API reference + tester
- **WO-29** (admin `mainApi.ts`): `serializeQueryArgs` puts the tab's project
  in every cache key — a client-side move from a project to /projects kept the
  project's sidebar sections. Verified: Shop → Projects shows Home +
  Organization only.
- **WO-30** (backend `mcp.router.ts`): `get_dashboard`, `update_dashboard`
  (replace|append; `normalizeWidget` + every route/field must exist; nothing
  saved on any problem). Instructions mention them. Smoke (`mcp.mjs`): saves
  2 widgets, refuses an unknown field, reads them back, another project's
  dashboard untouched.
- **WO-31** (D19): `dynamicModels.function.ts` — owner/access ref `TenantUser`
  in projects, `recordAccessMiddleware` mounted for tenant models, no
  notifications plugin in projects, Owner filter model `access-users`;
  `models.controller.ts` no longer refuses access in projects;
  `tenancy.function.ts` `projectPeople()`; `project.router.ts`
  `/access-users`(+`/:id`); `getFilters.controller.ts` fills the Owner filter
  from it; `public.router.ts` only `privacy: 'public'` records, site creates
  are public. Admin: the Access panel shows in projects (project wording);
  Models guide `#models-access`. Smoke (`access.mjs`, 10 checks): owner sees
  3, Vera (shared) sees shared + public, not the owner's (404); access-users
  lists Shop's people and leaves Vera out of Vault's; Owner filter options;
  public API returns only the public record; a site-created record is public.
- **WO-32** (admin `public-api/_components/`): API reference from
  `GET /public/api/<slug>/` and a tester. Verified in the browser: 8
  endpoints listed for Clients + sign-in; Try → `GET /clients` → 200 with
  Shop's record.
- Smoke suite all green. `WORK_ORDERS.md` gained a Handoff section and
  WO-25…33 (WO-33, the AI-built website, is next).

## 2026-10-02 — WO-33 A website built by an AI through the MCP
- New MCP tools (`library/controllers/mcp/website.tools.ts`), website projects
  only unless noted: `describe_website` (steps, the kit's fields, the site API
  with this project's address, a Next.js recipe), `get_site`,
  `update_site_settings` (upserts the first SiteSettings record; `domains`
  needs manage-projects), `upsert_page` (page by path, its PageSeo, its
  WebContent blocks by slug in order — priority (n−i)·10; `removeOthers`
  archives dropped blocks; everything validated before any save, created docs
  rolled back on a save failure), `upload_media` (any project; URL or base64 →
  webp except svg/ico/gif, S3 + File in the project's or organization's
  library; http(s) only, private addresses refused in production, redirects
  re-checked, 10 MB), `create_records` (any MCP; built models; links by id or
  name; `matchOn` upserts; formulas applied; per-record-access models get
  privacy public), `set_public_api` (projects), `site_snippets`.
- `mcp.router.ts`: `ToolDef.only` ('project' | 'website') filters tools/list
  and tools/call; `Caller.project` (tenant MCP sets it); website paragraph
  added to the initialize instructions; build_feature's schema takes a
  per-step `publicApi` (applied after the build, in step order).
  `namingFields`/`refIds` moved to `mcp/records.helpers.ts`;
  `PUBLIC_API` exported from models.controller.
- Optional env `PUBLIC_API_URL` (DEPLOY.md).
- Admin: user guide /user-docs/websites#ai-site "Build your site with AI";
  connect-ai's tool table lists the new tools.
- Verified: `scripts/tenancy-smoke/website-mcp.mjs` (in run-all.sh) — tools
  offered per project type; settings, 2 pages with SEO and blocks, a Product
  model with publicApi filled by create_records (matchOn), all read back
  through /site, /pages/by-path and /products; a panel edit shows on the site
  API; a rebuild updates without duplicates and archives a dropped block;
  refusals change nothing. Full suite green. Real S3 upload not run (opt-in).

## 2026-10-03 — WO-34 Website workspace, and three bugs
- Bugs (user reports):
  - Contents and SEO tables answered "Cast to ObjectId failed … at path page":
    `middleware/filter.middleware.ts` read the paging `?page=1` as the kit's
    `page` reference (the sortable branch skipped the reserved names). Bare
    reserved keys are now never fields; `page_in` still filters.
  - Home opened another project's dashboard: admin `src/proxy.ts` sent a bare
    `/dashboard` to the last-project cookie. `/dashboard` alone is now always
    the organization home (a project's dashboard is `/<project>`).
  - Accepting an invitation as a new account failed with "name is not
    allowed to be empty" when the invitation carried a name: the form showed
    it but sent its own empty state
    (`app/auth/accept-invitation/[token]/_components/TenantAcceptInvitation.tsx`).
    Verified in a browser: the invitee joined with only the invited project.
- Site setup on `TenantProject.site` (`library/functions/siteConfig.function.ts`,
  Joi-checked, merged per section): tracking (MINT analytics on/off, GA4,
  GTM, Google Ads, Meta/TikTok/LinkedIn pixels, Clarity, Hotjar), code (head,
  body start/end), SEO (indexing, sitemap, robots rules, main domain, Google
  and Bing verification), redirects, response headers. Tenant API
  GET/PUT `/site-config` (build; domains need manage-projects),
  GET `/site-overview` (settings, pages with SEO/blocks, checklist).
- Site API: `/site` adds `config`; `/site/tags`, `/site/robots.txt`,
  `/site/sitemap.xml` (published pages minus noIndex; `?origin=`).
  `/public/track.js` fetches /site/tags and injects every tag and the custom
  code (scripts recreated so they run; pixels re-fire on client navigation);
  `data-no-tags` leaves them to the site.
- MCP: `update_site_settings { config }`, get_site shows it, describe_website
  explains robots/sitemap/redirects/headers.
- Admin: `/site-setup` (tabs General = the Site settings record, Tracking,
  Code, SEO & indexing, Redirects & headers, Domains; ?tab= deep links),
  `WebsiteOverview` at the top of a website project's dashboard (30-day
  traffic, setup checklist, pages), sidebar section "Site" (Site setup,
  Analytics — Analytics left Audience), guide sections in /user-docs/websites.
- Verified: full smoke suite (13 new checks); headless browser: overview,
  Tracking save → /site/tags, General save → /site, Home stays on the
  organization, Contents table loads. Dev note: with three Next dev servers
  the machine hit load 118 and pages took minutes; stop admin-test when not
  needed. A background tab was seen requesting /auth/login in a loop once —
  not reproduced; watch for it.

## 2026-10-03 — WO-35 New-project wizard
- A new project opens on `/<project>/get-started` (admin `app/get-started`,
  'get-started' in PROJECT_PAGES; ProjectsBoard → openProject(slug,
  '/get-started')). The empty project dashboard links to it.
- App: starter templates — `library/functions/starterTemplates.function.ts`
  (Clients & invoices with line items and formulas, Projects & tasks, Leads
  pipeline, Products & stock), `GET /builder/starters`, `POST
  /builder/starters/:key` (build permission; planFromAi + buildFeature, all
  or nothing; a taken name refuses the whole template) — or the model wizard,
  or Connect AI.
- Website: brand (name, logo, favicon, colour → Site settings), home page
  (published `/`, its SEO and a `hero` block — updated when they exist),
  go live (domain if manage-projects, GA4 → /site-config), then links to AI
  and the overview.
- Guide: /user-docs/projects#get-started.
- Verified: smoke (models.mjs: 9 starter checks incl. invoice totals/codes);
  full suite green; admin and backend typecheck.

## 2026-10-03 — WO-36 History in every project, WO-37 notifications
- History: `routes-tenant/history.router.ts` (GET /history ?model&action&user
  &from&to&search&page&limit up to 1000; /history/facets;
  /history/g/document/:id for the record page's History tab) — view-history.
  `recordHistory` keeps project models' plain names; old entries are cleaned
  on read. `recordProjectEvent` (projects only) logs model built/changed/
  deleted, feature and template builds, public API on/off, site setup saves.
  Admin `app/activity` (filters, by day, before → after, Open), sidebar
  Activity → History, guide /user-docs/projects#history.
- Notifications: `TenantNotification`, `tenantNotify.function.ts`,
  `/tenant/api/notifications`; events in org.router (invitation to an
  existing account, joined, member changed), the access plugin for project
  models (record shared), public.router (site-created record, customer
  sign-up → projectAudience). Admin: bell + /notifications in the tenant
  panel, icons per type, organization name on each; guide
  /user-docs/account#notifications.
- Verified: activity.mjs (25 checks) in run-all.sh, full suite green; headless
  browser: History page and the bell render in a project.

## 2026-10-03 — WO-38 Website settings record
- New `WebsiteSettings` model (one per project, tenant-scoped, unique
  org+project) replaces the website kit's "Site settings" table and
  `TenantProject.site`: identity, contact, social, SEO, tracking, server-side
  tracking + secrets (`select:false`), named head tags, redirects, headers,
  last site check. Old data is copied in on first read (`loadSite`).
- Backend: `models/tenancy/websiteSettings.model.ts`;
  `functions/siteConfig.function.ts` (rewritten), `serverTracking.function.ts`
  (Meta CAPI, GA4 MP), `siteCheck.function.ts`; `routes-tenant/site.router.ts`
  (site-config GET/PUT returns `legacy` table info, POST /site-config/check);
  public router (/site, /site/tags, /track eventIds + CAPI forwarding, leads
  and sign-ups forwarded); track.js (Pinterest, X, Snap, favicon, eventID,
  fbp/fbc, `MintAnalytics.headers()`); MCP website tools write through
  `saveSite`; website kit = Pages, SEO, Contents.
- Admin: `/site-setup` tabs of self-saving cards (General with legacy-table
  notice, Contact & social, SEO, Tracking, Server-side, Code, Redirects &
  headers, Domains, Check the site); tenantApi types + `checkSite`; get-started
  and WebsiteOverview use the new shape; /user-docs/websites sections
  site-contact, site-seo, server-side, site-check.
- Verified: `tsc --noEmit` both repos; all 14 smoke suites on a fresh scratch
  DB; headless agent-browser walk of every tab, adding a tag through the Code
  dialog (stored as `bodyEnd`), and Remove the table on a project with the
  old Site settings table (definition gone, settings kept, notice gone).

## 2026-10-03 — WO-39 Password fields, searchable dropdowns, code prefix
- Model builder kind **Password**: encrypted at rest (AES-256-GCM,
  `SECRET_ENCRYPTION_KEY`), `select: false`, stripped from every response;
  revealed per record with `POST /<route>/:id/reveal` after the person
  re-enters their own password. Files: backend
  `functions/secretFields.function.ts`, `controllers/crud/revealSecret.controller.ts`,
  `dynamicModels.function.ts`, `builder/models.controller.ts`,
  `routes-admin/common/router.ts`, `controllers/common/updateDocument.controller.ts`,
  `recordHistory.function.ts`, AI prompts; admin `cl/RevealSecret.tsx`,
  `store/services/secretApi.ts`, table cell + view row `secret`, `modelKinds.ts`,
  `FieldsEditor.tsx`, `VPassword.tsx`.
- `cl/Dropdown.tsx` searchable (default over 10 items).
- Code prefix: suggested from the title when codes are switched on; the
  placeholder no longer looks like a value. (The backend was correct.)
- Verified: smoke `secrets.mjs` + all 15 suites; super-admin reveal by API;
  headless agent-browser walk (kind search, table/detail reveal, form save).

## 2026-10-04 — WO-39 Password fields made plain (user's call)
- No encryption key needed: Password fields are stored and returned as text
  and shown as dots in the panel with show and copy (`password` type). Removed
  the encryption plugin, `POST /<route>/:id/reveal`, `revealSecret.controller.ts`,
  admin `RevealSecret.tsx`, `secretApi.ts` and the `secret` table/view type.
  History still never records the value. `SECRET_ENCRYPTION_KEY` dropped from
  DEPLOY.md.
- Verified: `secrets.mjs` (rewritten) + all suites; table Show in the browser.

## 2026-10-04 — WO-40 Public API list filters (admin syntax) + docs
- Backend `routes-public/public.router.ts`: list filters `<field>=`,
  `<field>_<op>=` (ne, in, nin, gt, gte, lt, lte, btwn, contains, all),
  date days/moments/shortcuts, `createdAt`/`updatedAt`, `search`,
  multi-field `sort` with `_id` tie-break, `fields`; 400s that name the field;
  archived records excluded everywhere in the public API; `GET /` lists each
  model's `filters`, `search`, `sort`. MCP text (`mcp/website.tools.ts`)
  updated.
- Admin: `public-api/_components/{api.ts,ApiReference.tsx}` (lists block,
  per-list filters table, examples with Try), `user-docs/public-api/page.tsx`
  (8 new sections), `user-docs/_components/guides.ts`,
  `components/library/tenant/GuideLink.tsx`.
- Smoke: `public-filters.mjs` (54 checks: every operator per kind, date
  edges, search, sort, paging, fields, 400s, info, archived); `lib.mjs`,
  `admin.mjs`, `tenant-auth.mjs`, `website.mjs`, `access.mjs`,
  `activity.mjs` take `SMOKE_ROOT` / `SMOKE_MONGO`.
- Verified: `tsc --noEmit` both repos; all 17 suites (`run-all.sh`) on a
  fresh scratch DB (:27998, backend :5011); the Public API page and the
  guide in the browser pane.
- Behaviour changes for live sites: a reference filter with a bad id, a
  non-number for a number, or a non-true/false for a yes/no now answers 400
  (it used to be ignored or matched nothing); archived records disappear
  from the public API.

## 2026-10-04 — WO-41 Marketing website + waitlist
- New `mint-webpage/` (Next 16, Tailwind v4, static): home, workflow,
  product, who it's for, features, AI, developers, use cases, security,
  changelog, about, waitlist, privacy. Log in / Dashboard link to the tenant
  panel (`NEXT_PUBLIC_APP_URL`). Pushed to aiasifistiaque/mint-website `main`.
- Backend: `models/waitlist/` (Waitlist, unique email, status
  waiting/invited/joined/declined), `controllers/waitlist/joinWaitlist.controller.ts`
  (`POST /public/waitlist`: Joi, honeypot, one entry per email — re-sign-up
  fills blanks — answers `{ position, already }`, 10 per IP per 15 min),
  admin route `/waitlist` (permission `waitlist`), Admin preferences key,
  `scripts/seedWaitlist.js` (permission + sidebar item next to Leads).
- Verified: backend `tsc`; endpoint by curl on a scratch server (bad email,
  new, second email, re-sign-up update, honeypot, bad team size, CORS
  preflight, admin route 401 without token); the site's waitlist form end
  to end in the browser pane; `next build` (all pages static); mobile width.
- To do: deploy the backend, run `node scripts/seedWaitlist.js`,
  create the website's Vercel project with its env vars.

## 2026-10-04 — WO-41 follow-up: website v2 (backend as a service)
- mint-webpage `9e76ce1` (pushed to mint-website `main`): repositioned as
  backend as a service with the admin panel and back office built in
  (plan: `mint-webpage/docs/CONTENT_PLAN.md`); new `/backend` page; home
  sections for what you build, blocks-or-AI, the stack; dark mode; Manrope
  body font.
- Verified: `next build`; light, dark and phone-width screenshots (headless).
- Waitlist seed run on Atlas `e-mint` (permission + sidebar item).

## 2026-10-05 — WO-42 Public API read-only fields
- Decision D20 (README). `publicApi.readOnlyFields` on ModelDefinition; the
  public router drops those keys from create and update bodies (create gets
  the field's default, update keeps the value); `GET /` marks them and
  formulas `readOnly: true`. Saving with a key that isn't a field, or a
  required field with no default while create is on, answers 400.
- Files: backend `library/models/builder/modelDefinition.model.ts`,
  `library/controllers/builder/models.controller.ts` (`PUBLIC_API`,
  `readOnlyProblem`, `mergedPublicApi`, `updatePublicApi`),
  `library/controllers/mcp/website.tools.ts` (`setPublicApi`,
  `set_public_api`), `library/controllers/mcp/mcp.router.ts` (build_feature
  schema), `routes-public/public.router.ts`, `library/functions/dynamicModels.function.ts`
  (type); templates: `library/controllers/templates/{blueprint,validate,capture,mcp.router}.ts`,
  `library/functions/applyTemplate.function.ts`. Admin
  `src/app/public-api/{page.tsx,_components/{ReadOnlyFields.tsx,ApiReference.tsx,api.ts}}`,
  `src/app/templates/[id]/_components/EndpointsTab.tsx`,
  `src/components/library/store/services/tenantApi.ts`,
  `src/app/user-docs/{public-api/page.tsx,_components/guides.ts}`,
  `src/app/docs/templates/page.tsx`.
- Verified: `tsc --noEmit` both repos; all smoke suites (`run-all.sh`) on a
  fresh scratch DB (Mongo :27998, backend :5011), with new checks in
  `public.mjs` and `templates-preview.mjs`; the tenant Public API page in the
  browser pane (`tenant-scratch` :3011): saved list shown, ticking a required
  field with no default shows the 400 and un-ticks, ticking another saves and
  the reference's create/update bodies name it; `/user-docs/public-api#read-only`
  renders. The studio's Public API tab uses the same component (typechecked,
  not clicked through).
- Behaviour change for live sites: none until a model has read-only fields.

## 2026-10-05 — WO-43 planned: one collection per project
- Planned only, nothing built: decision D21 (README) and WO-43 (WORK_ORDERS)
  — a project's built models share `t_<projectId>` with a `_model` field
  (Mongoose discriminators), a per-model index manager instead of
  `syncIndexes`, the direct collection calls to fix, the
  `collectionName` unique index, and a migration script with dry run,
  re-runs and `--drop-old`.
- Why: Atlas caps Free/Flex at 500 collections and recommends ≤ 5,000 /
  10,000 collections + indexes on M10 / M20–M30; one collection per model
  reaches that at a few hundred projects. Chosen over shared collections for
  every tenant (reasons in D21).
- Scope made explicit (the user, same day): only project models move to one
  collection; super-admin models stay one collection each and their existing
  data, collections and indexes must remain unchanged — WO-43 now says how
  (scope branches, migration selects tenant models only, before/after checks).

## 2026-10-06 — WO-43 One collection per project (built; production not migrated)
- The user: "start with the workorder" (after reviewing the WO-43 PDF).
  Section 11's open points were taken as recommended: `_model` = the model's
  `name`; old collections kept until `--drop-old` (the user's call when);
  production only on the user's yes, app stopped.
- Backend:
  - new `library/functions/projectIndexes.function.ts` — `MODEL_KEY`,
    `projectCollection`, `ownRecordsOf(Model)` (the `_model` filter for
    direct collection calls), the index manager `syncProjectIndexes` /
    `dropModelIndexes` (shared `p_model_*`, per-model `m_<Name>_<field>`;
    never touches another model's index).
  - `dynamicModels.function.ts` — per-project base model
    `T<projectId>__Records` on `t_<projectId>` (discriminatorKey `_model`);
    a project model on `t_<projectId>` compiles as its discriminator
    (`overwriteModels`), any other model exactly as before;
    `inProjectCollection(def)`; unloading removes the discriminator and the
    base; `checkAvailability` in a project: collection `t_<projectId>`, no
    collection listing, names of kept records (`distinct('_model')`) taken;
    `_model` in `RESERVED_KEYS`.
  - `models.controller.ts` — `syncIndexes` → the index manager in a project;
    record counts via `countDocuments`; privacy backfill and formula
    recalculation confined to `{_model}`; delete with data removes the
    model's records (drops the collection only when the project has no
    models and it's empty); delete always drops the model's own indexes.
  - `bulkActions.controller.ts` — undo restores with `_model` (also for
    snapshots without it); merge preview counts and repointing per linking
    model.
  - `modelDefinition.model.ts` + `tenantIndexes.function.ts` —
    `collectionName` unique only among super-admin models
    (`collectionName_platform`, partial `{organization: null}`); boot swaps
    `collectionName_1` for it (partial index first).
  - `projectLifecycle` drops `t_<id>` and old `t_<id>_*`;
    `templateSandbox` room check counts one collection per project;
    `routeRegistry.listModelFields` hides `_model`; MCP duplicate message
    leaves `_model` out; `features.schema.ts` comment.
  - new `scripts/migrateProjectCollections.js` (dry run / `--apply` /
    `--project` / `--drop-old`; refuses before the WO-43 backend has booted,
    and on any project model whose collection isn't `t_<projectId>…`).
- Admin: `RESERVED_KEYS` (`model-builder/_components/modelKinds.ts`), the
  linked record card (`record-link/linked.ts`) and merge compare
  (`CompareRows.tsx`) skip `_model`.
- Smoke: new `collections.mjs` (57 checks) and `migration.mjs` (27 checks) in
  `run-all.sh`; `models.mjs`, `public-filters.mjs`, `templates-preview.mjs`
  updated for the new layout.
- Verified on the scratch DB (Mongo 8.2 :27998, backend :5011): `tsc` both
  repos; every suite in `run-all.sh` passes (`widgets`/`widgets-cart` need a
  fresh server — sign-up rate limit after the earlier suites, unrelated);
  dress rehearsal on the whole scratch DB (12 legacy projects): dry run listed
  43 models, `--apply` moved 43, a re-run moved 0, `--drop-old` dropped 43;
  the records of all 95 project models compared byte-for-byte (minus `_model`)
  identical, every non-project collection's count and indexes unchanged,
  super-admin definitions unchanged; 26 `t_` collections left.
- **Production: nothing run.** Order: deploy the backend → mongodump → dry run
  (record counts here) → stop the app → `--apply` → check → later
  `--drop-old` (DEPLOY.md §1.5). Only on the user's yes.

## 2026-10-06 — WO-44 User docs on their own subdomain
- The user asked: "for the docs, create a new project, the project will be in
  another sub domain." New project `mint-docs/` (MINT Guides) for
  docs.mintapp.shop: the 19 tenant guides from admin `src/app/user-docs/*`
  ported by script. `'use client'` is dropped (every page is static), imports
  are repointed, `/user-docs/x` became `/x`, and links to app screens
  (`/projects`, `/org/members`…) became `${APP_URL}/…`, because `/projects`
  is also a guide's path.
- Adds a home page (first steps, guides by group), a header with search (`/`,
  Cmd K), a footer, light/dark mode, a sitemap, robots and a share image.
  The look is the marketing site's (tokens, logo, light uppercase headings).
- Verified with `tsc`, `next build` (all 26 routes static) and the browser
  pane: anchors, "On this page" tracking, search, app links, dark mode, and
  no horizontal overflow at 390px on every page.
- Not done: the GitHub repo, the Vercel project and domain, the `docs` DNS
  record, and pointing the app's `docsPath()` / marketing site at the new
  domain. Each of these waits for the user.

## 2026-10-06 — WO-44 The app sends guide readers to the docs site
- Admin `next.config.mjs`: `/user-docs` and `/user-docs/:path*` redirect
  (307) to `NEXT_PUBLIC_DOCS_URL` (default `https://docs.mintapp.shop`) with
  the same path, and the browser keeps the `#anchor`. This covers both panels
  and every old link (landing page, GuideLink, bookmarks).
- `panel.ts`: new `DOCS_URL`; in the tenant panel `docsPath()` returns
  the docs site's address. `DocsShell` hands a tenant's `/docs/*` over with
  `window.location.replace`, because `router.replace` can't leave the app.
- mint-docs `GuideNav`: jumps to the `#section` on load, since the browser's
  own jump can be lost while the page hydrates.
- Verified on a tenant dev build (:3344) pointed at the local docs (:3200):
  `/user-docs`, `/user-docs/models` and `/user-docs/public-api` answer 307
  to the docs site, `/user-docs/models#models-fields` lands on
  `/models#models-fields`, and `/docs/two-factor#passkey-qr` lands on
  `/account#passkey-qr`.
- Deploy order: docs site first (DEPLOY.md §2b), then admin/tenant.


## 2026-10-06 — Sign-in and onboarding pages in the website's look
- The user asked for the onboarding pages to look like the marketing website
  (colours and all), keeping their structure. New admin
  `src/components/library/ui/AuthFrame.tsx` holds the website's palette (light,
  plus its neutral-black dark), Outfit with light uppercase headings, the
  brand-gradient pill button, and a deep-ink band (logo, pitch, three points)
  shown from `lg` up; on phones the logo sits above the card. The palette is
  scoped Chakra token variables (`--chakra-colors-*`), so inputs, dropdowns and
  chips inside follow it and colour themes elsewhere are untouched.
- `LoginContainer` is drawn on it, so this covers sign in, sign up, forgot and
  reset password, invitations and preview. It gains `steps` / `step`, and
  sign-up shows "01 Your account · 02 Your business". `TwoFactorStep` uses
  `AuthFrame` + `AuthCard`. Fields, validation and requests are unchanged.
- Verified on a tenant dev build: login, both sign-up steps, forgot password
  and the two-factor email step (login response stubbed in the browser), in
  light and dark, with no overflow at 390px. `/get-started` (inside the panel)
  is not changed.

## 2026-10-06 — First steps: welcome email, first-run guide, simple landing page
- **Welcome email** (`library/functions/welcomeMail.function.ts`, sent from
  `routes-tenant/auth` at sign-up): what MINT is, six steps to a first project
  (create a project, describe your data, add records, shape the panel, invite
  your team, go live), each with its guide on the docs site (`DOCS_URL`), a
  "Build your first project" button to `/dashboard`, the docs link and support.
  Drawn like the website (ink header, numbered steps).
- **First-run guide** (admin `library/tenant/FirstSteps.tsx`). With no project
  yet, the tenant home (`ProjectsBoard welcome`) shows the whole welcome:
  - what MINT is,
  - "Step 1 · Choose what to build": app / website / API cards, each opening
    New project with that kind chosen (`ProjectDialog initialType`),
  - the later steps explained, with points and guide links.

  With a project, it becomes a "Getting started" checklist (x of 6, progress
  bar). It shows on the org home and on every project dashboard, until done or
  hidden. Three steps tick themselves: project created, a model exists, and a
  teammate or invitation exists. The others are ticked by hand, kept in
  localStorage per organization. Steps' buttons open the current project's
  screens. Only for people who can create projects.
- **Landing page** (`app/_landing/Landing.tsx`): replaced the long feature
  page with the basics, in the website's look (AuthFrame now exports
  `SITE_STYLE`, `INK_BAND`, `Wordmark`):
  - a header with Log in / Sign up,
  - a hero,
  - "What you can build" (4 plain cards),
  - "Your first app in four steps",
  - a closing ink band,
  - a small footer (website, guides, terms, privacy, status).

  Signed in, the buttons say Dashboard / Open your dashboard.
- Verified on a private stack (Mongo 27996, backend 5031, tenant 3346):
  - a real sign-up logged the welcome email (example.com address);
  - the first-run page showed for the new organization;
  - "Start an app" opened New project with App chosen, and creating it went
    to Get started;
  - the project dashboard showed the checklist at 1 of 6;
  - the landing page renders signed out and signed in, in light and dark,
    with no overflow at 390px.

## 2026-10-06 — Deleting a project removes its site widgets, carts and payments
- `removeProjectContents` (`library/functions/projectLifecycle.function.ts`)
  deleted the project's documents only from the scoped collections in its
  `SCOPED` list, and five tenantScoped models were missing, so their documents
  outlived the project: `SiteWidgets` (`sitewidgets`), `SiteCart`
  (`sitecarts`), `SitePayment` (`sitepayments`), `SitePaymentSettings`
  (`sitepaymentsettings` — the project's sealed Stripe secret key and webhook
  signing secret) and `DeletedRecord` (`deletedrecords`, bulk-delete/merge
  undo copies). All five are in `SCOPED` now; every `schema.plugin(tenantScoped)`
  model under `library/models` is covered (SitePage/SiteDesign/SiteRelease by
  the site builder's `projectHooks.onRemoved`). Organization-level documents
  have no `project`, so the project-scoped `deleteMany` never reaches them.
- **Payments are deleted, not kept** (the user's call): the orders they point
  to live in `t_<projectId>`, which is dropped anyway; each organization's own
  merchant account (WD6) is the financial record; nothing can show a deleted
  project's payments, and keeping them would keep buyers' emails.
- Not tenantScoped and left as they are: `MailMessage` and
  `TenantNotification` carry a `project` but are organization logs with TTLs
  (180 days / 1 year).
- `payments.mjs` now ends by deleting its project: before, each of the five
  collections has the project's documents; after, none; a second project in
  the same organization keeps its widgets; documents outside any project are
  unchanged.
- Verified on a private stack (Mongo :27987, backend :5041 built to a scratch
  `dist`): `tsc --noEmit` clean; every suite in `run-all.sh` passes (the last
  five re-run after a backend restart — sign-up rate limit, 429).

## 2026-10-07 — WO-45 Tenant panel in its own repo
- `mint-tenant/` (aiasifistiaque/mint-tenant `main`), copied from admin `main` `266cbfd` without the
  super-admin pages; `IS_TENANT_PANEL` fixed on; port 3500; README, `.env.example`, `docs/MULTI_TENANCY.md`.
- Verified: `tsc --noEmit` clean; `next build` passes; signed in as a scratch tenant (private backend :5041,
  Mongo :27997) and opened the landing page, sign-in, projects, a project dashboard, a model table, the
  new-record drawer and the model builder at 1440px and 390px (no horizontal overflow).
- Not deployed; mint-admin unchanged (it still serves the live tenant panel).

## 2026-10-07 — WO-46 Tenant panel in the website's look
- Files (mint-tenant): `src/theme/{palettes,colors.theme,index,recipes,roles,tones,applyTheme}.ts`,
  `src/app/{layout.tsx,globals.css}`, `constants.tsx` (radius, modal button), `nav/Layout.tsx`,
  `nav/sidebar/{Sidebar,SidebarItem,SideDrawer,EditorSidebar}.tsx`, `sidebar-components/{SidebarSection,SidebarBrand}.tsx`,
  `nav/EditorLayoutFetching.tsx`, `nav/Footer.tsx`, `cl/PageHeader.tsx`, `tenant/ProjectsBoard.tsx`, `dashboard/charts.tsx`.
- Verified by screenshots in light and dark (agent-browser) — see WO-45.

## 2026-10-07 — Model page made easier to read (admin + mint-tenant, UI only)
- `/model-builder/[id]` (`ModelEditor.tsx`) is now tabs: **Fields** (with a live `FormPreview` beside the list on xl
  screens and a Page layout link), **Settings** (Basics / Record numbers / Who sees each record), **Connections** (links
  out from reference fields, links in from `referencedBy`), **Advanced** (model name, address, collection, version;
  Turn off / Delete). `?tab=` keeps the tab. One-time intro note (localStorage `model-editor-intro-hidden`), sticky
  "unsaved changes" bar with Undo all / Save, ⌘S, a beforeunload warning, red error counts on tabs.
- `ModelPanels` takes `only` (which panels) and `hideIdentity`; the wizard and FeatureWizard still render all of them.
- `FieldsEditor`: kind picture per row (`KindIcon`), column titles, the key shown as "API name" under the label and
  edited in More → API name, More/Less button, details grouped (In the form, Limits/Length, options, Table and search,
  API name), "Add a field" opens `KindPicker` (type cards) first. Plainer kind hints and key error messages in
  `modelKinds.ts`; link targets show titles only in the tenant panel.
- Records link fixed for the tenant panel (`projectHref('/t/<route>')`; was `/<route>`, read as a project).
- Guides: mint-docs `models` page and admin `/docs/builder` relabelled to match.
- Verified: tsc + eslint clean in both repos; mint-tenant dev rendered `ModelEditorView` on a throwaway mock page (no
  login): all four tabs, add-a-field flow, save bar, light/dark, 375px with no sideways scroll. Not clicked through
  with a real login: signing the browser pane in was refused by the permission check.
- Seen in passing (not fixed): in mint-tenant `next dev`, `/auth/login` 404s — the proxy reads `auth` as a project
  slug (`NEXT_PUBLIC_APP_PAGES` looks empty in the dev proxy).
