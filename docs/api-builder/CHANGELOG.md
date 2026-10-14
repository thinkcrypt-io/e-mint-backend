# API builder — changelog

Newest last. One entry per work order: date, WO, what changed, files, how it was verified, and anything the next
agent must know. Decisions live in README.md.

---

## 2026-10-14 — AB-01 Plan & docs
- README (the user's words and choices, decisions D1–D12, the endpoint shape, how a call runs), WORK_ORDERS
  (AB-01…05), this log.
- The user chose: model-based endpoints, who + conditions, secret server keys, an own "API" sidebar section.

## 2026-10-14 — AB-02 Engine
- Models (tenantScoped): `ApiEndpoint` (`apiendpoints`, unique {organization, project, method, path}) and
  `ServerKey` (`serverkeys`; `ApiKey` was taken by the MCP keys). Both deleted with a project
  (`projectLifecycle` SCOPED).
- `library/functions/apiEndpoints.function.ts`: paths (D3, reserved first parts), standard endpoints,
  **reconcile** — a model's standard endpoints follow its `publicApi` both ways: `ensureEndpoints()` applies
  only what changed in `publicApi` since the endpoints' `sync` snapshot (so rules set on an endpoint survive
  an old-style save; the first time it makes them, D9), `syncSummary(route)` writes `publicApi` back from the
  endpoints after a panel change (enabled = any endpoint on, actions = standard ones on, who/owner from the list
  endpoint, read-only from create/update) and forces a record-model rebuild when the API turns on/off (the
  `_customer` path). `matchEndpoint` (custom before standard, literal parts before `:id`), `serverKeyOf`,
  `reachOf` (conditions + fixed filters as Mongo through `publicRecords.conditionQuery`, the same per-kind
  reading as caller filters), `checkCreate` (owner set; 403 `rule_failed` with the rule in words),
  `outOf` / `writableOf`, `checkEndpoint` (400 with `on`), `siteReach`.
- `publicApi.auth` may be `key` (derived); the site builder treats it like customers-only. The site builder's
  data now reads through the standard list/get endpoint's rules and fields (`siteReach`) — never more than
  the API shows.
- `routes-public/public.router.ts`: the five model routes became one handler after the fixed routes: match →
  who (401 `customer_required` / `key_required`) → reach → action; stats per endpoint. `GET /` adds
  `endpoints` (method, path, who, rules count, fields in/out, list capabilities); `models` stays.
- Panel API `routes-tenant/apiBuilder.router.ts` at `/p/:project/api-builder` (Build): overview, endpoints
  (list with models + rule fields, get with modelInfo, create, generate, put, patch, delete), keys (list,
  create — secret once, revoke). History entries for each change.
- `scripts/migrateApiEndpoints.js` (dry run / `--apply`, re-runnable); DEPLOY.md §1.6.
- Verified on a private server (Mongo :27995, backend :5051 from a private `dist`): new
  `scripts/tenancy-smoke/api-builder.mjs` (70 checks, in run-all) all pass; regression suites tenant-auth,
  org-1, projects, models, public, public-filters, mcp, website, website-mcp, access, automations, webhooks,
  collections, widgets, widgets-cart, templates-preview, templates-apply, site-builder, site-builder-data,
  site-builder-starter all pass (public.mjs isn't re-runnable on one project — first run passed). Migration
  rehearsed: 71 standard endpoints removed, dry run, `--apply` made 181 across projects, re-run made 0.

## 2026-10-14 — AB-03 Panel I
- Sidebar (`tenantNav.function.ts`): the **API** section (icon plug-zap) replaces Audience — Overview
  `/public-api`, Endpoints, Keys, Reference (Build), Customers (view-customers), Webhooks (Build), then Widgets and
  Payments outside a website (a website keeps them under Site). An API project leads with the same section.
  `webhooks.mjs` checks the new order.
- mint-tenant: `store/services/apiBuilderApi.ts` (tag `api-builder`; saves also invalidate `builder`, since the
  model's `publicApi` summary changes). `getApiOverview` was taken (the API project dashboard) — the overview
  query is `getApiBuilderOverview`.
- `app/public-api/page.tsx` — **Overview**: address (copy), tiles (endpoints on, calls, keys, customers), "Start
  here" while there are no endpoints, By model (Generate / Endpoints →), Called lately, Use it (anyone fetch,
  sign-in widget, server key curl, website analytics). The old page's reference + tester move to Reference (AB-04).
- `app/public-api/endpoints/page.tsx` — **Endpoints**: by model, standard first in action order then custom by
  path; method badge, path, name, calls, who badge + rules count, on/off; model filter (`?model=`) and search;
  Generate per model. `_components/`: `shared.tsx` (publicBase/apiBase/apiHref, MethodBadge, WhoBadge, ACTIONS,
  WHO, ApiTabs — the four pages as tabs), `WhoCards.tsx`, `GenerateDialog.tsx`, `NewEndpointDialog.tsx` (model →
  what it does → address with suggestions and the full URL → who + name; server errors go back to their step;
  opens the endpoint's page). Each page's Layout `path` is its sidebar item's (`public-api-endpoints`…).
- GuideLink anchors `api-*` → the public-api guide (written in AB-05).
- Verified: panel tsc; screenshots (headless Chrome against the private backend, launch config
  `mint-tenant-5051` :3053): empty Overview with Start here, Endpoints with standard/custom/key endpoints, the
  Generate dialog (scrolls inside), the wizard's address step; `webhooks.mjs` all pass.
