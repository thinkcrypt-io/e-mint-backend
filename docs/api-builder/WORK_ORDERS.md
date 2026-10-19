# API builder — work orders

Plan: `README.md`. Log: `CHANGELOG.md`. Commit and push each WO when it's done (backend → `mint` v3;
mint-tenant → `origin` main; mint-docs and mint-webpage → `origin` main), then go on.

## Status

| WO | Title | Repo | Size | Status |
|---|---|---|---|---|
| AB-01 | Plan & docs | backend | S | done 2026-10-14 |
| AB-02 | Engine: `ApiEndpoint` + `ServerKey`, `applyPublicApi` + derived summary, lazy migration + script, the public router on endpoints (who, conditions, fields, list settings, keys, stats), panel API `/p/:project/api-builder/*`, smoke | backend | L | done 2026-10-14 |
| AB-03 | Panel I: the API section, Overview, Endpoints (list, Generate from a model, New endpoint wizard) | mint-tenant | M | done 2026-10-14 |
| AB-04 | Panel II: an endpoint's page (Access, Fields, Filters, Try it, Code), Keys, Reference | mint-tenant | L | done 2026-10-14 |
| AB-05 | Guide (mint-docs), website, MCP endpoint tools, handoff | docs + backend | M | done 2026-10-14 |
| AB-06 | Request logs (D13): every call logged; API → Logs + an endpoint's Logs tab + Overview glance; `get_api_logs` over MCP; guide, website | all | M | done 2026-10-14 |
| AB-07 | An endpoint's Reference tab: its request (address, headers, body) and answers (response, errors) as JSON, from the draft | mint-tenant + docs | S | done 2026-10-19 |

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
- MCP: `list_endpoints`, `generate_endpoints`, `save_endpoint` (describe + confirm with the user first); `set_public_api` unchanged.

## AB-06 — Request logs (M) — done

- Backend: `apiCall.model.ts` (new fields, index `{project, endpoint, createdAt}`); `apiLogs.function.ts`
  (`callRecord`, `maskedQuery`, `clientOf`, `originOf`, `logFilter`, `findLogs` — newest first, `before` cursor,
  `logSummary` — totals, avg, p95, a series of 5-min / 1-h / 6-h bars for 1 / 24 / 168 h, top 5 errors, top 5
  endpoints). `public.router.ts`: the logging middleware for every project type (was API projects only) keeps
  `req.apiLog` — `open` sets the endpoint and key, `customerOf` the customer, a wrapped `res.json` the error.
  `apiBuilder.router.ts`: `GET /logs`, `/logs/summary`, `/logs/:id`. MCP `get_api_logs` (read). Sidebar: API → Logs.
- Panel (mint-tenant): `public-api/_components/logs.tsx` — `ApiLogs` (period, answer, endpoint, who, search, Live
  = 5 s polling; tiles, stacked chart, Commonest errors → filters, calls list with Show more up to 200, a call's
  dialog with curl), `LogsGlance` (Overview, 24 h), `StatusBadge`, `LogChart`; `/public-api/logs` (filters in the
  address); endpoint page tab **Logs** (`?tab=logs`). RTK `getApiRequestLogs`, `getApiRequestLogSummary`,
  `getApiRequestLog`. Admin needs nothing (its `/public-api/:sub+` redirect covers `/logs`).
- Docs: mint-docs `public-api#api-logs`, Connect AI tools table; website changelog + feature card “API logs”.
- Smoke: `scripts/tenancy-smoke/api-logs.mjs` (in run-all). Verified with screenshots (1280 + 390).


## AB-07 — An endpoint's Reference tab (S) — done

- The user (2026-10-19): “when users go into a single endpoint there must be a reference tab for that specific
  endpoint with sample return data and post data (if applicable), as json.”
- Panel (mint-tenant): `public-api/_components/EndpointReference.tsx`, tab **Reference** (`?tab=reference`) between
  Filters and Try it. Request (method + address, `:id`, a list's query parameters, Headers JSON, Body JSON for
  create/update — every field it writes, required ones named, read-only ones listed), Response (201/200: a list's
  `{ doc, total, page, limit, totalPages }`, one record, or `{ message: 'Deleted' }`), Errors (400 with the first
  required field's real message, 401 `customer_required` / `key_required`, 403 `rule_failed` on a create with
  rules, 404 on one-record actions, 429 `rate_limited`). Built from the *draft*, so unsaved Fields edits show at once
  (with a “unsaved changes” note). Each block copies.
- `api.ts` `exampleRecord`: links in a sample answer are ids (`66f0…f9a2`), not “<id of the linked record>” — also
  on API → Reference.
- Docs: mint-docs `public-api#api-reference` paragraph.
