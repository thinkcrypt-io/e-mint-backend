# API builder — overview

**Start here.** This folder is the plan for the **API builder** in tenant projects: the public API as
endpoints you generate from your models or create one by one, each with its own access rules, fields
and filters, on several clear pages instead of one. Read this file, then `WORK_ORDERS.md`; every step is
logged in `CHANGELOG.md`.

## 1. The user's words (2026-10-14)

> so in the api, make the api several pages. like we can generate api's from the current data we have,
> also can set rules, maybe mid-low level. create endpoints and decide what the access rules would be.
> currently the api page is confusing make it maybe several pages and easier to build

Choices the user made (same day):

| Question | Answer |
|---|---|
| How far custom endpoints go | **Model-based** — each endpoint works on one model: its own path, action, fixed filters, sort, limits, fields. No totals or joins (later). |
| Access rules | **Who + conditions** — who may call (anyone, signed-in customers, a server key) plus conditions: record field · test · value, the value fixed, the signed-in customer, or a customer's field. |
| API keys | **Yes** — secret server keys, named, revocable, last used. An endpoint can require one. |
| Placement | **Its own "API" sidebar section** — Overview, Endpoints, Keys, Reference, Customers, Webhooks. Widgets stays where it is. |

## 2. Today (before this plan)

- One page, `/public-api`: per model a Public switch, five action checkboxes (list, read one, create,
  update, delete), one "who" dropdown (Anyone / Signed-in customers / Customers — own records), read-only
  fields; then the API reference, a tester and snippets.
- Stored on the model: `ModelDefinition.publicApi {enabled, actions[], auth, ownerOnly, note, readOnlyFields}`.
- Served by `routes-public/public.router.ts`: `GET|POST /:route`, `GET|PUT|DELETE /:route/:id`, with
  `publicRecords.function.ts` (lists' filters/search/sort/fields, `publicReach`).
- Read by: the site builder's data (`siteBuilder/resolve.ts`), the shop (`shop.function.ts`), the website kit,
  templates (`applyTemplate`, `capture`), MCP (`set_public_api`, describe tools), webhooks, the model
  builder (`models.controller` saves `publicApi`).

## 3. Decisions

- **D1 — Endpoints are the truth; `publicApi` is their summary.** A new `ApiEndpoint` collection holds every
  endpoint. `ModelDefinition.publicApi` stays, **derived** from the model's endpoints (enabled, the actions of
  its standard endpoints, who/owner from its list endpoint, read-only fields), so every reader in §2 keeps
  working unchanged. Every writer of `publicApi` (model builder, MCP, templates, website kit) goes through one
  function, `applyPublicApi(def, value)`, which writes the standard endpoints and then the summary.
- **D2 — Standard and custom endpoints.** *Generate from a model* makes the model's **standard** endpoints:
  `GET /<route>`, `GET /<route>/:id`, `POST /<route>`, `PUT /<route>/:id`, `DELETE /<route>/:id` — the
  addresses that exist today, so nothing calling the API breaks. A **custom** endpoint has its own path under
  the project (`GET /products/featured`, `GET /my/orders`), one action, and its own rules.
- **D3 — Paths.** Lowercase segments `[a-z0-9-]`, 1–4 of them, optionally ending in `/:id` (required for read
  one / update / delete, refused otherwise). Unique per method in the project. Reserved first segments (the
  router's own: `auth`, `site`, `pages`, `shop`, `cart`, `checkout`, `orders`, `payments`, `track`, `render`,
  `countries`, `widgets`, `contents`, …) are refused. Custom paths are matched before standard ones.
- **D4 — Who.** `anyone` | `customer` (a signed-in customer of the project) | `key` (a server key of the
  project). A key never stands in for a customer; a customer token never opens a key endpoint.
- **D5 — Conditions** use the shared shape `{field, op, value}` (ConditionsEditor, `fieldLocks.meets`; ops
  `is not in gt gte lt lte contains empty filled`) with `match: all|any`. A value may be
  `{ref: 'customer'}` (the signed-in customer — "owner is the customer") or `{ref: 'customer.email'}`
  (`.name`, `.phone`). On **list / read one / update / delete** they narrow which records the call reaches
  (a Mongo filter — a record outside them is "Not found"). On **create** they are checked on the new record
  (after defaults): refused with 403 `rule_failed` and the rule's text; a `{ref:'customer'}` condition on the
  owner field sets it. A condition naming the customer needs `who: customer`. Old `ownerOnly` = the condition
  *Owner (`_customer`) is the signed-in customer*.
- **D6 — Fields.** Per endpoint: which fields go **out** (all, or a chosen list — always `_id`), which may be
  **written** (create/update: all, or a list), and **read-only** ones (the business sets them; dropped like
  unknown keys, as today). Formulas are never written.
- **D7 — List settings** (list endpoints): **fixed filters** (conditions always applied — "featured is
  true"), whether callers may add their own filters/search (all filterable fields, or none), default sort,
  default and maximum page size (≤ 100).
- **D8 — Keys.** `ServerKey` (`serverkeys` — `ApiKey` is already the MCP keys' model): name, a `mint_sk_` secret shown once (only its sha256 and last 4 kept), created
  by, last used, revoked. Sent as `Authorization: Bearer mint_sk_…` or `X-Api-Key`. Managed by people with
  Build. Never put in a website — the Keys page says so.
- **D9 — Migration.** On first read of a project's endpoints (API pages, the public router), a model whose
  `publicApi.enabled` has no standard endpoints gets them generated from its `publicApi` — no separate
  migration has to run. `scripts/migrateApiEndpoints.js` does all projects at once, for the deploy.
- **D10 — Calls log.** Every project's calls are counted per endpoint (calls, last called) — today only API
  projects log `ApiCall`s. Full request logs are later.
- **D13 — Request logs (AB-06, 2026-10-14; the user: "start with api request logs").** `ApiCall` becomes every
  project's request log: all calls to `/public/api/<slug>` except OPTIONS, the renderer's own requests, `/render`,
  `/track` and `/site*`. Each keeps method, path, the query with values of token/key/secret/password-like names
  masked, the endpoint that answered (+ its name then), who (anyone / customer + email / key + name), status, the
  error message and code the caller got, ms, the calling site (Origin, else Referer's origin) and the client
  ("Chrome on macOS", "curl/8.4.0"). **Never bodies, tokens or IP addresses.** Kept 7 days (TTL, as before). An
  endpoint's `stats.calls` now counts every call it answered, refused ones too, so it matches its Logs tab.
- **D11 — The panel's pages** (mint-tenant, sidebar section **API**; addresses stay under `/public-api` —
  `/api` is the panel's own proxy):
  - `/public-api` — **Overview**: the API's address, endpoints on / off, keys, customers, calls this week,
    quick start (fetch, sign-in widget, a key from a server), what to do next.
  - `/public-api/endpoints` — **Endpoints**: every endpoint grouped by model (method, path, who, rules, on/off,
    calls); **Generate from a model**; **New endpoint** (a 4-step wizard: model → action → path → who).
  - `/public-api/endpoints/[id]` — **an endpoint**, tabs: **Access** (who + conditions), **Fields**,
    **Filters** (list only), **Try it**, **Code**.
  - `/public-api/keys` — **Keys**.
  - `/public-api/reference` — the generated reference for every endpoint (today's ApiReference + tester).
  - Customers and Webhooks move into the section; Widgets stays under the site / Audience.
- **D12 — Admin.** Admin's tenant build (live until mint-tenant is deployed) keeps its old one-page
  `/public-api`; it keeps working because it writes `publicApi` through `applyPublicApi` (D1).

- **D14 — Project keys (AB-08…11, 2026-10-19).** The user: “instead [of the app name in the address] we want a
  project key linked to every project and when referencing users have to reference in query param ?apiKey=key,
  without it error will be thrown that key is missing. in api tab should have option to generate key”. Chosen
  (2026-10-19): **the key names the project** — `/public/api/<route>?apiKey=<key>`, no project name in the
  address; **a project key that is fine in a website** (`mint_pk_…`, one per project, Regenerate makes a new one
  and the old one stops) — endpoints set to “server keys” still also need a secret `mint_sk_` key in
  `Authorization`; **MINT’s own callers move, old addresses stop** — widgets, hosted sites, templates and MCP use
  the key; `/public/api/<slug>/…` answers 401 `api_key_missing`. Only MINT’s site renderer (with its
  `x-mint-renderer` secret) still names a project by its slug. Also accepted: header `X-Api-Key`.
  Errors: 401 `api_key_missing` (“The apiKey is missing — add ?apiKey=<your project key>.”), 401 `api_key_invalid`.

## 4. An endpoint

```ts
type ApiEndpoint = {
  name: string;                 // "Featured products"
  note?: string;                // what the site or app uses it for
  model: string;                // the model's route
  action: 'list' | 'get' | 'create' | 'update' | 'delete';
  path: string;                 // '/products' | '/products/:id' | '/products/featured'
  standard: boolean;            // generated at the model's own address
  enabled: boolean;
  access: { who: 'anyone' | 'customer' | 'key'; when: Condition[]; match: 'all' | 'any'; customerRoles: string[] }; // W-26: customer roles (not the team's), signed-in only; [] = any
  fields: { out: string[] | null; write: string[] | null; readOnly: string[] };
  list?: { filters: Condition[]; callerFilters: boolean; sort: string; limit: number; maxLimit: number };
  stats: { calls: number; lastCalledAt?: Date };
};
type Condition = { field: string; op: Op; value?: any | { ref: 'customer' | 'customer.email' | 'customer.name' | 'customer.phone' | 'customer.role' } };
```

## 5. A call

```
/public/api/<project>/<path>
  → project (publicSlug) → endpoints of the project (cached per request)
  → match: method + path (custom first, then standard; `:id` segment)
  → enabled? → who: anyone | customer token | server key   (401 customer_required / key_required)
  → reach: access.when (+ list.filters) → Mongo filter, with publicReach (archived, per-record access)
  → list: caller filters/search/sort/fields if allowed, page size ≤ maxLimit
  → create/update: body ∩ write fields − read-only − formulas; create checks access.when on the new record
  → out: fields.out → shape; stats.calls += 1
```

## 6. Not in this plan (later)

Totals / group-by endpoints, including linked records (joins), custom server code, request bodies in the logs,
per-key endpoint limits, rate limits per endpoint, OAuth / magic-link customer sign-in.
