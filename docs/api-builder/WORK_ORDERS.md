# API builder — work orders

Plan: `README.md`. Log: `CHANGELOG.md`. Commit and push each WO when it's done (backend → `mint` v3;
mint-tenant → `origin` main; mint-docs and mint-webpage → `origin` main), then go on.

## Status

| WO | Title | Repo | Size | Status |
|---|---|---|---|---|
| AB-01 | Plan & docs | backend | S | done 2026-10-14 |
| AB-02 | Engine: `ApiEndpoint` + `ServerKey`, `applyPublicApi` + derived summary, lazy migration + script, the public router on endpoints (who, conditions, fields, list settings, keys, stats), panel API `/p/:project/api-builder/*`, smoke | backend | L | done 2026-10-14 |
| AB-03 | Panel I: the API section, Overview, Endpoints (list, Generate from a model, New endpoint wizard) | mint-tenant | M | done 2026-10-14 |
| AB-04 | Panel II: an endpoint's page (Access, Fields, Filters, Try it, Code), Keys, Reference | mint-tenant | L | |
| AB-05 | Guide (mint-docs), website, MCP endpoint tools, handoff | docs + backend | M | |

## AB-02 — Engine (L)

- `ApiEndpoint` (tenantScoped, `apiendpoints`): §4 of the README; index {project, method, path} unique.
- `ServerKey` (tenantScoped, `serverkeys`): name, hash (select:false), last4, createdBy, lastUsedAt, revokedAt.
- `library/functions/apiEndpoints.function.ts`: `standardEndpoints(def, publicApi)`, `applyPublicApi(def, value)`
  (writes standard endpoints, then `syncSummary(route)`), `syncSummary`, `ensureEndpoints()` (D9),
  `matchEndpoint(endpoints, method, path)`, `reachQuery(def, conds, customer)`, `checkCreate(...)`,
  path rules (D3), reserved segments.
- Writers moved to `applyPublicApi`: `models.controller` (publicApi), MCP `set_public_api`, `applyTemplate`,
  website kit / starter.
- `public.router.ts`: the model routes become one catch-all after the fixed routes: match → who → reach →
  action. `GET /` lists endpoints (and still `models` for the widgets and old callers).
- Panel API (Build): `/p/:project/api-builder/endpoints` list / get / create / update / delete, `POST generate`
  {route, actions, who}; `/p/:project/api-builder/keys` list / create (secret once) / revoke; `/p/:project/api-builder/overview`.
- `scripts/migrateApiEndpoints.js`; smoke `scripts/tenancy-smoke/api-builder.mjs` (in run-all): old addresses
  unchanged after migration, a custom path with fixed filters, who=customer / key, owner and field
  conditions on each action, create refused by a rule, fields out/write/read-only, caller filters off, page
  size caps, reserved and duplicate paths refused, keys (wrong, revoked, last used), stats.

## AB-03 — Panel I (M)

- Sidebar section **API** (tenantNav): Overview `/public-api`, Endpoints, Keys, Reference, Customers, Webhooks.
- Overview page; Endpoints page (grouped by model, switches, badges, calls); Generate dialog (model, actions,
  who); New endpoint wizard (model → action → path with live preview → who) opening the new endpoint.

## AB-04 — Panel II (L)

- `/public-api/endpoints/[id]`: header (method + full address, copy, on/off, delete), tabs Access (who cards +
  ConditionsEditor with customer values), Fields (out / write / read-only table), Filters (fixed filters,
  caller filters, sort, page sizes), Try it (the tester, with a customer token or key field), Code (fetch,
  curl, the widget's `MintAuth.fetch`).
- `/public-api/keys`: create (secret shown once, copy), list, revoke (PromptDialog).
- `/public-api/reference`: every endpoint, from `GET /` — today's ApiReference + tester.
- A "How this works" guide link on every panel and dialog.

## AB-05 — Docs, website, MCP (M)

- mint-docs `public-api` guide rewritten around endpoints (sections: overview, endpoints, generate, new
  endpoint, access, conditions, fields, filters, keys, reference) — keep the old anchors.
- Website: features + changelog.
- MCP: `list_endpoints`, `save_endpoint` (plan + confirm, like build tools); `set_public_api` unchanged.
