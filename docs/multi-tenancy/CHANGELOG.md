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
