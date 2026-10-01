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
