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

## 2026-10-14 — AB-04 Panel II
- `app/public-api/endpoints/[id]/page.tsx` — **an endpoint**: header (name, action · model · calls, on/off, Delete
  through PromptDialog), its method + full address (copy) + who/rules badge, tabs **Access** (WhoCards; "Only their
  own records" switch for customers — the OWNER condition; RuleEditor), **Fields** (Sent back → `fields.out`, null
  when all; Written → unticked go to `fields.readOnly`, `write` stays null so the `publicApi` read-only summary
  keeps working; a warning for a required field not written on create), **Filters** (list only: fixed filters,
  callers may filter/search/sort, order + direction, page size, largest page), **Try it** (the tester loaded with
  this endpoint and an example body), **Code** (curl / fetch with the right Authorization, `MintAuth.fetch` for
  customers), **Details** (name, note, path — standard endpoints keep theirs). Edits are a draft with a sticky
  Save / Discard bar; a server 400 opens the tab its `on` names and shows under that input or rule row.
- `_components/RuleEditor.tsx`: field · test (by kind, dates "is after"…) · value (options, yes/no, number, date,
  text, comma lists for "is one of"); on customers' endpoints a value can be the customer (owner → the signed-in
  customer; text fields → their email / name / phone); all / any. New rules start on a select or yes/no field.
- `app/public-api/keys/page.tsx` — **Keys**: in use (…last4, made by, last used, Revoke), revoked, the endpoints
  that need a key; New key → the secret once with a warning and a curl example.
- `app/public-api/reference/page.tsx` — **Reference** + tester. `ApiReference` reads `GET /`'s `endpoints`
  (falls back to `models` for an older backend): grouped by model, standard first in action order, Customer and
  Server key badges, **Open** to the endpoint's page, list endpoints with caller filters off say their filters are
  fixed, example responses with only the endpoint's out fields and its page size. `api.ts`: `fromInfo`,
  `InfoEndpoint`, `key` on requests (`Authorization: Bearer <server key>`). Tester: the token field takes a
  customer token or a server key. `ReadOnlyFields.tsx` removed (the Fields tab replaces it).
- Verified: tsc, `next build` (all five pages), screenshots at 1280 px (each tab, a save of an owner switch + two
  rules — stored as sent, a reserved path refused under its input, Try it returning only featured+published products'
  name/price cheapest first, making a key, the reference with an endpoint open) and 390 px (no sideways scroll).

## 2026-10-14 — AB-05 Guide, website, MCP
- mint-docs `public-api` guide (card now “API”): new sections api-pages, api-endpoints, api-generate (`turn-on`
  kept as an anchor), api-new-endpoint, api-access (`who`), api-conditions, api-fields (`read-only`), api-filters,
  api-keys; `api-reference` / `api-try` anchors in the reference and tester sections; 401 `key_required`, 403
  `rule_failed`, 404 wording; custom addresses in “The address”. Other guides: Audience → API (customers,
  sidebar, getting started), analytics is under Site, the site builder's list note points at Generate. All 18
  anchors the panel links exist. `next build` ok.
- Website: changelog “The API builder”; features (API builder, Server keys, REST API per model); the API workflow's
  steps (Generate its endpoints, Set its rules, API → Reference); Go live step text. `next build` ok.
- MCP (`library/controllers/mcp/apiEndpoints.tools.ts`, in every project): `list_endpoints` (read), `generate_endpoints`,
  `save_endpoint` (build; same checks as the panel, `on` in the refusal), and a paragraph in the server
  instructions (describe and confirm before saving; keys are the user's to make).
- Admin (still the live tenant panel): `/public-api/:sub+` and `/:project/public-api/:sub+` redirect to its one-page
  Public API, since the backend's sidebar now links Endpoints / Keys / Reference — drop when mint-tenant is live.
- Verified: `api-builder.mjs` + 8 MCP checks all pass; website-mcp, site-builder-data pass; `mcp.mjs` fails only on a
  re-run against the same project (its Ticket model exists from the first, passing, run).

## 2026-10-14 — AB-06 Request logs
- Every project's public API calls logged in `ApiCall` (D13) with the endpoint, who, error, query (masked), origin,
  client; `stats.calls` counts refused calls too. Panel API → Logs, endpoint Logs tab, Overview “Last 24 hours”.
  MCP `get_api_logs`. Guide `public-api#api-logs`; website changelog + feature.
- Verified: `api-logs.mjs` (37 checks) all pass; `api-builder`, `webhooks` (sidebar now has Logs), `public-filters`,
  `widgets-cart` pass; `public.mjs` passes on a fresh database (on the reused one it fails only on counts left by
  earlier runs). Headless Chrome: Logs page, a call's dialog, the phone layout, an endpoint's Logs tab, Overview.


## 2026-10-19 — AB-07 An endpoint's Reference tab
- New tab on an endpoint's page: its request (address, headers, body) and its answers (response, errors) as JSON,
  copyable, worked out from the endpoint as drafted. Sample links in answers are ids (also on API → Reference).
  Guide `public-api#api-reference`.
- Verified on a private backend + mint-tenant (:5073 / :3075): create, list endpoints in the browser pane (1280 and
  375 wide, no page overflow); unticking a Sent back field drops it from the sample before saving; the samples'
  shapes, statuses and error bodies match real calls (201 create, list page, 401 `customer_required`, 404,
  400 “Quantity is required”).

## 2026-10-19 — AB-08 Project keys, backend (D14)
- `TenantProject.apiKey` (`mint_pk_` + 32 hex, unique sparse index); `createProject` makes one;
  `library/functions/projectKey.function.ts` (`newProjectKey`, `projectByKey`, `ensureProjectKey` — made on first
  read for an older project, `regenerateProjectKey`); `scripts/migrateProjectKeys.js` (dry run / `--apply`; builds
  the index).
- `/public/api` is mounted without the project name: the public router finds the project by `?apiKey=` or
  `X-Api-Key` (removed from `req.query`; left out of logged queries), 401 `api_key_missing` / `api_key_invalid`;
  the site renderer (its `x-mint-renderer` secret) still names a project by its slug as the first path part, so
  mint-sites needs no change to its fetches. OPTIONS answers 204.
- Panel API: `GET /p/:project/project-key` (anyone in the project), `POST /p/:project/api-builder/project-key`
  (Build; history entry).
- `mint.js`, `widget.js`, `track.js` read `data-key` (no `data-project` any more) and send `apiKey` on every call;
  their storage names use the key (a regenerated key signs customers out of a site and empties carts).
- Render answer: `tags.tracker.key`, `widgets.key`, the tracker tag with `data-key`. Widgets settings' `script`,
  site check (looks for `data-key`), templates `{{api}}` = `<origin>/public/api` + new `{{apiKey}}`, MCP
  (`list_endpoints`, `describe_website`, `site_snippets`, `set_public_api`, `create_records`) give key addresses
  and `MINT_API_KEY`.
- Smoke: `lib.mjs` rewrites the scripts' `/public/api/<slug>/…` calls to the key form (key read from the scratch
  DB), `rawFetch` for calling an old address on purpose; new `project-keys.mjs` (in run-all); assertions changed
  in public, website-mcp, templates-preview, widgets, site-builder.
- Verified on a private backend (:5073, Mongo :27963): `project-keys.mjs` 30/30 and every script in run-all passes
  (in batches with restarts for the sign-up rate limit).
- Template authors: a website starter that calls `{{api}}` must now also send `?apiKey={{apiKey}}`.

## 2026-10-19 — AB-09 Project keys, panel (mint-tenant `60a96e8`)
- `ProjectKey` card (key, copy, the address shape, Regenerate behind a warning PromptDialog) first on API → Keys and on
  the Overview; RTK `getProjectKey` (`GET /p/:project/project-key`) / `regenerateProjectKey`; hook
  `components/library/tenant/useProjectKey`. `apiBase()` = `<origin>/public/api`; `withKey()` puts `?apiKey=` on every
  example (`exampleRequests`), the tester's requests, logs' curl, the endpoint Reference tab (plus 401 api_key_missing /
  api_key_invalid in its errors), the reference page's live `GET /`, Overview snippets (`data-key`), Site setup's
  robots/sitemap addresses, Project settings (Project key row), the API project's dashboard, the Widgets preview.
- Verified in the browser pane (private backend :5073): the card, Regenerate (new key 200, old key 401
  api_key_invalid), the reference loading through the key, the tester sending `?apiKey=` (200), Overview snippets.

## 2026-10-19 — AB-10 Live panel + hosted sites (admin `5b943cc`, mint-sites `4d0333a`)
- admin's tenant build (still the live panel): the same on its one-page Public API (key card, reference, tester,
  snippets), Project settings, Site setup, Widgets preview, API dashboard; Template studio: `{{apiKey}}` button,
  “Add the API address and key”, examples without a project name. RTK tag `tenant-project-key`.
- mint-sites: `track.js` / `mint.js` get `data-key` from the render answer (`tags.tracker.key`, `widgets.key`).
- Verified: admin's Public API page in headless Chrome (live reference through the key, card, keyed snippets);
  mint-sites type-checks (its render answer is covered by `site-builder.mjs`).

## 2026-10-19 — AB-11 Docs (mint-docs `542b7ff`, website `94070f5`)
- mint-docs: `PUBLIC_API` = `<origin>/public/api`, `PROJECT_KEY`; every example with `?apiKey=`; a “The project key”
  section (`public-api#api-project-key`, linked from the panel's card), errors and troubleshooting rows; `data-key` in
  the customers, widgets and analytics snippets; projects guide “Its public address and key”.
- Website: examples on Backend / Developers / mocks with the key; changelog “A key for every project’s API”.

## 2026-10-19 — AB-12 Customer sign-in on Endpoints (D15)
- The user asked why the auth endpoints weren't there by default. They were (every project, `/auth/*`), but only
  API → Reference listed them. Endpoints now has a **Customer sign-in** section after the models: the seven
  built-in endpoints (Built in, “needs their token”), where customers are kept and how many signed up
  (`customerAuth` on `GET /api-builder/endpoints`), **Set up sign-in** → `/widgets?add=login` (the Widgets page
  opens Login & account's setup, or its edit once added — after the auth settings load, so the wizard shows the
  saved model), and “Their own data, with their token” (fetch code: sign in, keep the token, call with
  `Authorization: Bearer`; `Mint.auth.fetch` for the widget) with **Generate endpoints for customers**.
- Generate: with Signed-in customers, **Only their own records** (on by default) → `own: true` → the owner condition
  on each made endpoint (a create makes the customer the owner). On the sign-in model, `ownSignUpRecords`
  (authMapping.function.ts) sets `_customer` on records the customers' sign-ups made before it had an API (the
  path only exists while it has one); a team's record linked by email stays nobody's.
- Reference: /auth/forgot and /auth/reset added (with the forgot answer). Overview: the signed-in snippet moved from
  `widget.js` + `MintAuth.fetch` to `mint.js` + `data-mint="login"` + `Mint.auth.fetch`, linking the token how-to.
- Verified: smoke `customer-api.mjs` 24/24 (sign-up before any endpoint, `customerAuth`, own records for the sign-in
  model incl. records made before its API, Bookings create/list per customer, own off, own ignored for anyone);
  customer-roles 42, widgets-setup 70, projects 14 + api-builder 78. Headless Chrome on the private backend:
  the section, the Generate dialog's checkbox, `?add=login` opening the setup with Members chosen.
- Admin's tenant build has no API builder pages (D12) — not changed there.
