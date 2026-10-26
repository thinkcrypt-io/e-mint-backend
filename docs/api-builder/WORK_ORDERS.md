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
| AB-08 | Project keys, backend (D14): `TenantProject.apiKey`, made with every project + migration script; `/public/api/<route>?apiKey=` (or `X-Api-Key`), 401 `api_key_missing` / `api_key_invalid`; renderer by slug; panel routes to read and regenerate; scripts (`mint.js`, `widget.js`, `track.js`) take `data-key`; render answer, templates `{{apiKey}}`, MCP addresses; smoke | backend | L | done 2026-10-19 |
| AB-09 | Project keys, panel (mint-tenant): Project key card on API → Keys + Overview (copy, Generate/Regenerate); every address, example, tester, snippet with the key | mint-tenant | M | done 2026-10-19 |
| AB-10 | Project keys, live panel (admin's tenant build) + hosted sites (mint-sites `data-key`) | admin + mint-sites | M | done 2026-10-19 |
| AB-11 | Guides (mint-docs), website, handoff; deploy order | docs | S | done 2026-10-19 |
| AB-12 | Customer sign-in on Endpoints (D15): the built-in /auth/* listed with where customers are kept, Set up sign-in, the token how-to; Generate “Only their own records” (+ owners for the sign-in model's earlier sign-ups); Overview snippet on mint.js; guide, website | all | S | done 2026-10-19 |
| AB-13 | Form attachments: `POST /public/api/uploads` (multipart `files`, ≤5 × 10 MB; photos and documents, never svg/html) → URLs for a files/image field; only for a project with an open create endpoint on a model that has a file field; rate-limited; files in the media library's "website-uploads" | backend | S | done 2026-10-26, replaced by AB-14 before it was deployed |
| AB-14 | Upload endpoints: `upload` is an endpoint action (custom, POST /<route>/files by default) for a model with a file/image field — who: anyone (per-IP limit) / customers / a server key, and a valid server key may always upload; served by `routes-public/uploads.ts` ahead of the public API; Generate (panel + MCP) makes one; `save_endpoint` takes it; MCP `upload_media` takes documents; panel: action, address hint, What it takes / Reference / Code for uploads; guide | all | M | done 2026-10-26, not deployed |

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

## AB-08 — Project keys, backend (L)

- `TenantProject.apiKey` (`mint_pk_` + 32 hex, unique sparse); `createProject` makes one; `ensureProjectKey()`
  makes one for an older project on first read; `scripts/migrateProjectKeys.js` gives every project one (run at
  deploy, before the panels — old addresses stop).
- `routes-public/index.ts`: `/public/api` → the public router; the project from `?apiKey=` or `X-Api-Key`
  (removed from `req.query`, so it's never a filter and never logged); else, for the renderer only, the first
  path part is the slug; else 401 `api_key_missing`. A key nobody has: 401 `api_key_invalid`.
- Panel API: `GET /p/:project/project-key` (anyone in the project — snippets need it), `POST
  /p/:project/api-builder/project-key` (Build) regenerates.
- Scripts: `mint.js`, `widget.js`, `track.js` read `data-key` and send `apiKey` on every call (storage names use
  it). Render answer: `tags.tracker.key`, `widgets.key`. Templates: `{{api}}` = `<origin>/public/api`, new
  `{{apiKey}}`. MCP: addresses + examples with the key.
- Smoke: the public calls in `scripts/tenancy-smoke` send the project's key; a new `project-keys.mjs`.

## AB-09 — Project keys, panel (M)

- API → Keys: a **Project key** card first (the key, copy, Regenerate with a PromptDialog — sites using the old key
  stop working until they're given the new one); Overview shows it too.
- `apiBase()` → `<origin>/public/api`; every example (Reference, an endpoint's Reference and Code tabs, logs'
  curl), the tester and the snippets (login widget, analytics, mint.js on Widgets, Site setup, Project settings)
  carry the key.

## AB-10 — Live panel + hosted sites (M)

- admin (its tenant build is still live): the same addresses and snippets (ApiOverview, Public API page, Site
  setup, Widgets, Project settings, Templates tabs).
- mint-sites: `data-key` on `track.js` / `mint.js` from the render answer.

## AB-14 — Upload endpoints (M) — done, not deployed

The user (2026-10-26), after AB-13: “the upload route should be from the api, files uploaded with a server key should
still upload, make a api route for that, also for the contact via mcp” — and chose: an endpoint in API → Endpoints,
the Thinkcrypt site sending through its own server route with the server key, and MCP uploading documents + managing
upload endpoints.

- backend: `ENDPOINT_ACTIONS` + `upload` (POST); `apiEndpoints.function`: `ACTION_LABEL.upload`, `FILE_KINDS`,
  `fileFieldsOf`, `uploadPath` (/<route>/files), `newUpload` (never standard, so `publicApi` reconcile/syncSummary
  never touch it); `checkEndpoint` refuses an upload on a model without a file/image field (400 on `model`) and
  defaults its path. `routes-public/uploads.ts` (replaces AB-13's fixed route), mounted on `/public/api` in
  `server.ts`: a POST whose path matches an enabled upload endpoint of the key's project is answered here, every
  other call goes on to `public.router.ts` (left alone — another session's payments work is in it). Access: a valid
  server key always; else the endpoint's who (key → 401 `key_required`, customer → the customer token +
  customer roles, anyone → 20 per 15 min per IP); counted in `stats`, logged as an `ApiCall`. Limits as AB-13.
  Generate (`routes-tenant/apiBuilder.router.ts`) and MCP `generate_endpoints` make the model's upload endpoint
  for `upload`; `save_endpoint`'s action enum has it. MCP `upload_media` also takes documents (pdf, doc(x),
  xls(x), ppt(x), txt, csv, zip; stored as sent, folder "documents") for a record's file field.
- mint-tenant: `EndpointAction` + `upload`; ACTIONS (Generate shows /<model>/files and counts the model's upload
  endpoint); New endpoint's address hints; an upload endpoint's page: no Fields / Try it tabs, “What it takes” on
  Access, and the multipart request on Reference and Code.
- mint-docs: `public-api#api-upload`.
- Verified on a throwaway stack (fake S3): anyone / key-only / customers endpoints; no key, wrong key (header and
  Bearer), not signed in refused; a server key passes every kind and skips the IP limit; svg, 6 files, none refused;
  the 21st anyone call 429 without hanging; non-upload POSTs reach the public API; stats + logs written. Then
  Thinkcrypt's `/api/contact` against it: create with the server key (CU-0001/0002), files reach the key-only upload
  endpoint. The real S3 write runs on deploy. Panel screens type-checked, not opened in a browser.
- Deploy: Heroku runs `mint` **main**, which doesn't have AB-13/AB-14 (they're on v3) — merge v3 first.

## AB-13 — Form attachments (S) — replaced by AB-14 (never deployed)

Asked for by the user for Thinkcrypt's contact form (2026-10-26: “they can add multiple files with the contact
form”); the public API had no way in for files.

- backend: `routes-public/uploads.ts`, mounted in `server.ts` at `/public/api/uploads` ahead of the public
  router's catch-all (its own file so it stays clear of the payments work in `public.router.ts`). The project from
  its key as the public API does; 403 `uploads_closed` unless an enabled create endpoint for anyone writes to a
  model with a file/files/image/images field (`ensureEndpoints()` first, as the public API's first call would);
  multer in memory, `files` ≤ 5 × 10 MB (400 `upload_invalid` / `upload_empty`), types by mimetype or extension:
  png jpg webp gif heic pdf doc(x) xls(x) ppt(x) txt csv zip — never svg or html (415 `upload_type`); documents
  get `Content-Disposition: attachment`; `File` per upload in folder `website-uploads` (organization library when
  `mediaScope` is organization); 20 calls / 15 min per IP; → 201 `{ files: [{ url, name, type, size }] }`.
- The site then sends the URLs in the record's field through the model's create endpoint.
- Verified on a private stack (fake S3): 401 missing/invalid key, 403 for a project with no such form, a form
  built a moment before works on the first call, svg/html refused, 6 files and 11 MB refused, empty refused;
  with fake credentials the S3 step fails (500 `upload_failed`) — the real upload runs on deploy.
- Not yet: the panel's API reference and the public-api guide don't list it.

## AB-12 — Customer sign-in on Endpoints (S) — done

- backend: `GET /api-builder/endpoints` adds `customerAuth` { model (title, route, accounts) | null, customers };
  `POST /endpoints/generate` takes `own` (signed-in customers only) → the owner condition on each; on the sign-in
  model, `ownSignUpRecords` gives the records customers' sign-ups made their owner. Smoke `customer-api.mjs`.
- mint-tenant: Endpoints → Customer sign-in (`_components/CustomerSignIn.tsx`, `#customer-sign-in`), Generate's
  “Only their own records”, `/widgets?add=login` opens Login & account's setup (or its edit), Overview's
  signed-in snippet on `mint.js` + `data-mint="login"`, Reference adds /auth/forgot and /auth/reset.
- mint-docs `public-api#api-customer-sign-in`; website changelog.

## AB-11 — Docs (S)

- mint-docs: every address and snippet; a “Project key” section (`api-project-key`) in the public-api guide.
- Website changelog. Handoff (multi-tenancy WORK_ORDERS) with the deploy order: backend + `migrateProjectKeys.js`,
  then mint-sites, admin, mint-tenant.
