# Couriers — work orders

Plan: `README.md`. Log: `CHANGELOG.md`. Sizes: S (an afternoon), M (a day),
L (2–3 days). Commit and push each WO when it's done (backend → `mint` v3;
mint-tenant → `origin` main; mint-docs and mint-webpage → `origin` main), then
go on. Each WO updates the guide (mint-docs `/store`, #anchors on every card
and dialog) and the marketing website as it lands. Smoke tests go in
`scripts/tenancy-smoke/courier-*.mjs` and `run-all.sh`; they run against a
local courier stub (`scripts/tenancy-smoke/courier-stub.mjs`, one fake server
that speaks all three APIs and sends webhooks), plus Pathao's and RedX's
sandboxes when keys are in `backend/.env`.

**Scope (the user, 2026-10-31): Steadfast, Pathao and RedX, each store connecting its own merchant account** (CR18).
Paperfly and the rest wait. Order: **phase 1 (CR-02 → CR-07) is Steadfast end to end**, phase 2 adds Pathao and RedX
on the same engine and ships all three, phase 3 is everyday use. WO numbers stay as first planned, so the table is in
build order.

## Status

| WO | Title | Repo | Size | Status |
|---|---|---|---|---|
| CR-01 | Plan & docs | backend | S | done 2026-10-30 |
| **Phase 1 — Steadfast end to end** | | | | |
| CR-02 | Delivery model (blueprint, locks, order summary fields) + `upgradeStore` for built stores | backend | M | done 2026-10-31 |
| CR-03 | Courier connections (the store's own account): model, sealing, adapter interface + registry, settings API, Test, account checks | backend | M | done 2026-10-31 |
| CR-04 | Steadfast adapter (ping + balance test, book, bulk, find by invoice, status, return request, webhook) | backend | M | done 2026-10-31 |
| CR-05 | Delivery engine: send, applyEvent, refresh, cancel, order effects, COD payment | backend | L | done 2026-10-31 |
| CR-06 | Webhooks: public route, per-courier checks, inbox, idempotency, ordering | backend | M | done 2026-10-31 |
| CR-07 | Panel: Store settings → Delivery → Connect your Steadfast account, Send to courier, Delivery card, label, Deliveries page | mint-tenant + mint-docs | L | |
| **Phase 2 — Pathao and RedX, then ship** | | | | |
| CR-08 | Pathao adapter + Connect your Pathao account (password-grant token, stores, cities / zones / areas, price plan, book, info, webhook + 202 handshake) | backend + mint-tenant | M | backend done 2026-10-31 (panel card with CR-07) |
| CR-09 | RedX adapter + Connect your RedX account (access token, pickup stores, areas, charge, parcel, info, cancel, webhook with Mint's URL token) | backend + mint-tenant | M | backend done 2026-10-31 (panel card with CR-07) |
| CR-10 | Area matching for Pathao and RedX: area pickers, `CourierAreaMap` remembered picks | backend + mint-tenant | M | backend done 2026-10-31 (panel with CR-07) |
| CR-11 | Fallback sync scheduler, Refresh on open, silent-webhook warning | backend + mint-tenant | S | backend done 2026-10-31 (panel with CR-07) |
| CR-17 | Docs, website, prod rollout (`upgradeStores.js --apply`, connect Verte's own accounts) | all | S | |
| **Phase 3 — everyday use** | | | | |
| CR-12 | Bulk send from the order tables | backend + mint-tenant | M | backend done 2026-10-31 (panel with CR-07) |
| CR-14 | Customers + automations + MCP: tracking on the website endpoints, installed automations, MCP delivery tools | backend + live-fresh | M | backend done 2026-10-31 (Live Fresh's page not changed) |
| CR-15 | Manual courier (any country) | backend + mint-tenant | S | backend done 2026-10-31 (panel with CR-07) |
| CR-18 | Delivery risk on website orders: Steadfast `fraud_check/score/:phone` with the store's own key | backend + mint-tenant | S | backend done 2026-10-31 (panel with CR-07) |
| CR-13 | Returned parcels (Receive → EC-08 return engine) + COD payouts from each account (settled, Cash with couriers) | backend + mint-tenant | M | after EC-08 |
| **Later** | | | | |
| CR-16 | More BD couriers: Paperfly, eCourier, CarryBee (one adapter each) | backend | M each | later |

## Handoff

- **2026-10-31 — CR-15 + CR-18 backend done.** `couriers/manual.ts`: countries `['*']` (offered everywhere;
  `offeredFor` takes `*`), no keys, setting `names` (one per line, `Name | https://…/{tracking}`), test = "Ready —
  …", book = the typed `options.tracking` under `options.name`, its link from the pattern; the delivery's
  `courierName` becomes that courier's name (`Booked.courierName`). `moveManual` (`POST deliveries/:id/status` { to,
  collected?, note? }) goes through `applyEvent` (same order effects, COD, no moving back); other couriers' parcels
  refuse it. CR-18: `steadfast.risk` (`fraud_check/score/:phone`; nulls kept as unknown), `deliveryRisk`
  (`GET orders/:id/risk?fresh=1`, the store's own Steadfast connection, kept a day per phone in the connection's
  cache, level low ≥ 80 % / medium ≥ 50 % / high, unknown under 3 known parcels, a plain summary). Smokes
  `courier-manual-risk.mjs`; commerce-settings' US check now expects the manual courier only.

- **2026-10-31 — CR-14 backend done.** `publicOrder` (website order view, My orders, order tracking) now has
  `tracking: { courier, status (label), trackingCode, trackingUrl, updatedAt } | null` from the order's courier
  summary — never the consignment or COD. `commerce/deliveryAutomations.ts` `ensureDeliveryAutomations(installed)`
  installs, switched off, "Tell the customer it’s on the way" (status is picked-up) and "…it’s delivered" (status is
  delivered), emails to `order.email` (`{{order}}` = the order number; `{{courierName}}`, `{{trackingCode}}`,
  `{{trackingUrl}}`); called by `install` and `upgradeStore`. Deliveries now **fire automations** (`update`,
  changed `status`) after booking and on every status change — engine writes don't go through the generic save.
  MCP (`store.tools.ts`): `list_deliveries` (data), `send_to_courier` (build; `courier` and `cod` required; the same
  `send`, as "<owner> (AI)"), `refresh_delivery` (data). **Invoices now carry a store tag**: `WEB-00001_7F3A`
  (`invoiceFor`, last 4 of the project id) — every store's website orders are WEB-…, and a courier account refuses an
  invoice it has seen (two stores on one account, or an account that books elsewhere too). Live Fresh's track page
  (live-fresh repo, main = live deploy) wasn't changed: it can read `tracking` when the user wants it. Smoke
  `courier-customers-mcp.mjs`.

- **2026-10-31 — CR-12 backend done.** `send` is now `prepare` (checks + the delivery in `booking`) + the courier
  call + `finish` (booked, summary, areas remembered, unmatched events). `sendMany` (`POST deliveries/bulk`
  { orders ≤ 100, courier, weight?, note? }): Steadfast = every order prepared, one `bookMany` call (500 a call),
  each finished or failed with its reason; Pathao / RedX = `send` 3 at a time with areas **only from remembered
  picks** ("Choose the <courier> area once…" otherwise). Answers `{ results[{ order, ok, code, delivery, error }],
  sent, failed }`. Smoke `courier-bulk.mjs`.

- **2026-10-31 — CR-10 + CR-11 backend done.** `CourierAreaMap` (`courierareamaps`, tenantScoped, unique project +
  courier + key; in projectLifecycle) and `commerce/courierAreas.ts`: `keyOf` (order area | city, plain words),
  `matchChoice` (same → starts-with → contains, never a tie), `suggestAreas` (remembered first; else Pathao city →
  zone → area and RedX's areas narrowed by the city, from the day-cached lists; `match: false` = remembered only, for
  bulk), `rememberAreas` (after a send with `options.area`; names travel as `cityName / zoneName / areaName`).
  `sendPrefill` returns `couriers[].areas { picks, from }`. Phone orders now keep `delivery.city` and `landmark`.
  `commerce/courierSync.ts` `scheduleCourierSync()` at boot (server.ts): every 15 min (`COURIER_SYNC_MS`), parcels
  with an id, not finished, booked within 30 days, quiet for 2 h (`COURIER_QUIET_MS`) on both `lastEventAt` and
  `lastSyncedAt`; 10 per connection a run; claimed by a conditional `lastSyncedAt` update (no lease field needed).
  Store settings warns when a courier with parcels out hasn't sent a webhook for 2 days. "Refresh on open" is the
  panel's (CR-07). Smoke `courier-areas-sync.mjs` (needs the backend with `COURIER_SYNC_MS=3000
  COURIER_QUIET_MS=1500`).

- **2026-10-31 — CR-09 backend done.** `redx.ts` complete, `ready: true`: book (`POST /parcel`; needs
  `options.area` = RedX area id + `areaName`; grams; cash as a string; `value` = order total; pickup store;
  `merchant_invoice_id` = our invoice), `quote` (charge calculator; needs the pickup store's area — the connection's
  `settings.pickupArea`, set from the store list on test and when the store changes), `status` (`parcel/info`),
  `cancel` (`PATCH /parcels`, async), webhook (`?token=` = secret, constant time; `paid` = payout). No find by invoice
  (timeouts → "may have been booked"); no tracking link (not in RedX's doc). Statuses mapped as CONNECTING.md. RedX's
  real sandbox needs the owner's own sandbox token (on their RedX page) — not tried. Smoke `courier-redx.mjs`
  (16 checks).

- **2026-10-31 — CR-08 backend done.** `pathao.ts` complete, `ready: true`: book (`/orders`; city / zone / area sent
  only when picked, as numbers; weight 0.5–10; `merchant_order_id` = our invoice), `bookMany` (`/orders/bulk` in 100s,
  202 with no ids → `pending`, ids arrive by `order.created`), `quote` (price-plan, needs city + zone), `status`
  (`orders/:id/info`, slug normalised), webhook (`X-PATHAO-Signature` = secret, constant time; `webhook_integration`
  = handshake; `order.paid` = payout with `invoice_id`; reply 202 + `X-Pathao-Merchant-Webhook-Integration-Secret`,
  value overridable by the connection setting `hookReply`), all 22 order events mapped. No tracking link (not in
  Pathao's doc). Engine: an event naming a parcel we have no id for is matched by invoice and fills the id in
  (timed-out / bulk bookings); a status **check** is never "older" (clocks), only never backwards. **Pathao's real
  sandbox was down when tried (Cloudflare 522 on courier-api-sandbox.pathao.com, the old p-stageenv host didn't
  answer)** — run `PATHAO_SANDBOX=1 node courier-pathao.mjs` when it's back. Smokes `courier-pathao.mjs` (adapter,
  19 + 4 sandbox checks) and `courier-pathao-flow.mjs` (through Mint, 14 checks).

- **2026-10-31 — CR-06 done.** `POST /public/couriers/:provider/:connection` (routes-public/index.ts →
  `commerce/courierWebhooks.ts` `courierWebhook`): connection found unscoped by id + courier, its project must be an
  active e-commerce one; raw body kept by server.ts for `/public/couriers/` too; 100 kb cap (413), 300 calls a minute
  per connection (429); `adapter.webhook.verify` against the connection's opened secret (wrong → 401 and
  `refusedCalls` +1); each parsed event stored once in `CourierWebhookEvent` (`courierevents`, unique project + key,
  raw body + safe headers, 60-day TTL, in projectLifecycle); answered at once (`adapter.webhook.reply` or 200);
  applied in `setImmediate` in time order — found by consignment, else invoice — or kept `unmatched`;
  `applyUnmatched` runs after each booking. `applyEvent`'s "older" now compares with the courier's own last event
  (never our booking time). Steadfast's zone-less times are read as Dhaka (+06:00). `GET deliveries/:id/webhooks`
  (managers) shows the raw calls. Smoke `courier-webhooks.mjs` (19 checks).

- **2026-10-31 — CR-05 done.** `commerce/deliveries.ts`: `sendPrefill`, `send` (checks; delivery made in `booking`
  first, invoice = order code / `-2`…; two sends at once → the later one gives way; a refusal → `error` with the
  courier's words and the same delivery is retried on the next send; no answer → `find(invoice)` after 3 s and 5 s;
  couriers without `find` mark the delivery `booking-uncertain` and a resend needs `confirmNotBooked`; a key refusal
  marks the connection untested), `applyEvent(store, id, event, source, by)` (timeline always; status never back,
  older events only into side states, final statuses stay — delivered may still go returning / returned; same
  status on a check = only `lastSyncedAt`), order effects (picked-up / in-transit / out-for-delivery → shipped;
  delivered / partly → delivered + completed; returned → returned), COD = one `courier-cod` payment per delivery
  through `recordPayment` + `settleOrder` (capped at the balance; partly-delivered only what was collected; a
  delivered parcel without an amount counts its COD as collected), `deliveryForEvent` (for CR-06), `refresh`,
  `cancelDelivery` (never-booked → cancelled here; Steadfast → return request, waits), `deliveryDetail`,
  `deliveriesOf`, `listDeliveries` (views, search, cash with couriers). The order's `courier` section is written by
  `summarise`. `orderDetail` returns `deliveries`; an order can't be cancelled while a parcel is out (409
  `delivery_open`). Routes in commerce.router.ts. Smoke `courier-deliveries.mjs` (36 checks).

- **2026-10-31 — CR-04 done.** `couriers/types.ts` now has `Parcel`, `Booked`, `CourierEvent`, `NormalStatus`,
  `WebhookIn` and the adapter's optional `book / bookMany / find / status / cancel / webhook {verify, parse, reply}` +
  required `normalise`. `http.ts`: `CourierRefusal` (fixable, never retried; `rejected` = the keys), `bdPhone`, `fit`,
  `fullAddress`. `steadfast.ts` is complete and `ready: true`: book (`create_order`, fields trimmed to Steadfast's
  limits), `bookMany` (`bulk-order/extended`, 500 a call, per-parcel results), `find` (`trackings_by_invoice` →
  consignment), `status` (`status_by_cid`, one event a minute — Steadfast's cache), `cancel` (= `create_return_request`,
  async), webhook verify (`X-Signature` HMAC of the raw body, else the Bearer token, constant time) and parse
  (`delivery_status` / `tracking_update` / `consignment_update` / others logged; the event type is read from
  `notification_type`, `type` or `event` — **confirm the field on the first real call**; dedupe = `Idempotency-Key`).
  Pathao / RedX have `normalise: () => null` until CR-08 / 09. Stub: Steadfast booking, bulk, status, invoice
  look-up, return requests, `SLOW` invoices answering after 16 s, `/__status` and `/__parcel` controls. Smoke
  `courier-steadfast.mjs` (adapter alone, 19 checks).

- **2026-10-31 — CR-03 done.** `CourierConnection` (`library/models/tenancy/courierConnection.model.ts`): secret keys
  in `credentials` (Map, sealed, `select: false`), non-secret ones in `public` (Pathao's client id + email shown back),
  `settings`, `token` (Pathao, sealed), `webhookSecret` (sealed; Mint's, or Steadfast's own pasted —
  `webhookSecretPasted`), `test` { ok, message, at, keysHash, rejected }, `accountKey`, `cache` (lists for a day),
  `lastWebhookAt`, `refusedCalls`. In `projectLifecycle` SCOPED. Registry `commerce/couriers/` (`types.ts`, `http.ts`
  with `courierFetch` + `baseUrl` — `COURIER_STUB_URL` sends every courier to the stub outside production —,
  `steadfast.ts`, `pathao.ts`, `redx.ts`, `index.ts`; `COURIERS` now comes from there, re-exported by `settings.ts`).
  Each adapter has keys, settings, links (sign-up, keys page, webhook page) and **`test()`**; Pathao and RedX also
  `options()`; Pathao's token issue / refresh (a day before expiry, one fresh sign-in on a 401) is in. `ready` stays
  false until each adapter books (CR-04/08/09). `commerce/connections.ts`: `listConnections`, `saveConnection` (blank
  key = kept, keys changed → test runs, Pathao `sandbox: true` = its published account), `testConnection`,
  `renewWebhookSecret`, `disconnect` (409 `courier_in_use` with open deliveries), `optionsFor` (day cache, `fresh=1`),
  and **`usableConnection(project, id)`** for CR-05 (on + test passed with the keys as they are now). Webhook address
  = `<api>/public/couriers/<courier>/<connection id>` (RedX `?token=<secret>`); the route itself is CR-06. Same
  account in two projects: `accountKey` = hash of Steadfast's API key / Pathao's mode + client id / RedX's mode +
  token — note a second **named** Steadfast key on the same profile hashes differently, so that case isn't caught.
  Routes in `routes-tenant/commerce.router.ts` (manage-projects; options = records:edit). Smoke
  `courier-connections.mjs` + `courier-stub.mjs` (in run-all; backend needs `COURIER_STUB_URL`). commerce-settings'
  last check (plain delete of a store project) fails already — new store projects have website-kit models. No panel
  yet (CR-07). Not deployed. Next: CR-04.

- **2026-10-31 — CR-02 done.** Every store has **Deliveries** (blueprint key `delivery`, model `StoreDelivery` like
  `StoreCustomer`, route `deliveries`, code `DLV-000001`, `engineOnly`, all README §3 fields; shown in the sidebar
  while Delivery is on). Statuses = `DELIVERY_STATUSES`, couriers = `DELIVERY_COURIERS` (registry + `manual`) in
  `blueprint.ts`. The order's `courier` section gained `delivery` (the current delivery's **code**, text — sections
  can't hold links) and `trackingUrl`; the link the other way is `delivery.order`, which also gives the order page its
  Deliveries tab. `upgradeStore` now **builds blueprint models a store doesn't have** (`addModels`: one feature in the
  store's sidebar category, marked `system: commerce`, engine fields read-only, recorded in `installed`, sidebar
  redone), so `scripts/upgradeStores.js --apply` gives older stores Deliveries. `commerceGuard` needed no change (it
  works from the spec). Also fixed: the model definition schema dropped a reference's `optionFilters` /
  `pickerDetails`, so the Variants product picker rule never saved (and the upgrade offered it on every run).
  Smoke `courier-model.mjs` (in run-all). Not touched, already failing before: commerce-categories (4 checks written
  before Categories had SEO) and commerce-mcp (a product given options over MCP isn't "With variations", so no
  variants). Not deployed. Next: CR-03.

- **2026-10-31 — Scope: Steadfast, Pathao, RedX, own accounts.** The user: "pathao and steadfast, users will connect
  their own accounts", then "pathao steadfast and redex". Mint has no courier account of its own (CR18): each store
  pastes its own merchant keys, the courier bills and pays out the merchant directly, Mint never holds COD money.
  Phase 1 = Steadfast; phase 2 = Pathao (CR-08) + RedX (CR-09) + area pickers (CR-10) + sync; CR-17 ships all three.
- **2026-10-31 — APIs checked** → `CONNECTING.md` (start every adapter WO there). all three couriers are from their own (signed-in) pages
  as of 2026-10-31. Steadfast has no sandbox (smoke against the stub; one live consignment with the user). The user's Steadfast
  profile already sends its webhook elsewhere — connecting Mint replaces it (ask first).
- **2026-10-30 — CR-01 done.** Plan only, no code. Context a new session needs: EC-18 in docs/ecommerce is replaced by
  this folder. Today the store has `CommerceSettings.delivery.couriers` (ids the wizard turned on; `COURIERS` in
  `commerce/settings.ts`, all `ready: false`) and an Order `courier` section (provider, consignment, tracking, status,
  cod, bookedAt, lastUpdate) that nothing writes yet. The old single-store Steadfast endpoint
  (`routes/order.route.ts`, `docs/STEADFAST_DELIVERY_ENDPOINT.md`, env keys) is commented out — reference only, don't
  revive it. Gateways show the patterns to copy: `SitePaymentSettings` (sealed `select: false` keys,
  `payments.function.ts` `sealed()` / `open()`), the public webhook routes in `routes-public/index.ts` (project
  lookup, 5xx = retry), and `scheduleContentTick` for a scheduler. Engine code reaches models only via
  `storeOf().M(key)`; blueprint changes reach built stores via `commerce/upgrade.ts` + `scripts/upgradeStores.js`.

## CR-02 — Delivery model (M)

- Blueprint step `delivery` (README §3): `engineOnly`, core / engine fields, code `DLV`, table, filters; sidebar
  E-commerce → Deliveries while Delivery is on (CR-07 gives it the Store page). Order's `courier` section gains
  `delivery` (the current delivery's code — a section can't hold a link) and `trackingUrl`.
- `upgradeStore` adds the Delivery model to built stores and the two Order fields; `scripts/upgradeStores.js` dry run
  shows it for Verte.
- `commerceGuard` refuses generic writes to its engine fields (403 `commerce_field`), as Orders.
- Smoke `courier-model.mjs`: new store has Deliveries; an old store gets it from `upgradeStore`; generic writes refused.

## CR-03 — Courier connections + adapter registry (M)

- `library/models/tenancy/courierConnection.model.ts` (tenantScoped, unique project + courier): courier, mode,
  `credentials` (Map of sealed strings, `select: false`), `public` (non-secret ids shown back), `settings` (pickup
  store, delivery type, item type, default weight…), `token` (Pathao access / refresh + expiry, sealed),
  `webhookSecret` (sealed, generated on first save, can be renewed), `test` { ok, message, at, keysHash },
  `lastWebhookAt`. Removed with the project (projectLifecycle).
- `couriers/types.ts`, `couriers/index.ts` (registry; `COURIERS` moves here, `settings.ts` imports it), `couriers/http.ts`.
- `commerce/connections.ts`: `listConnections` (never returns secrets: `{ set: true }` per key), `saveConnection`
  (only couriers turned on in `delivery.couriers`; blank key = keep the stored one), `testConnection` (stores the result
  and the hash of the keys it passed with — a key change makes it untested), `webhookInfo` (address + secret, shown
  only to managers), `disconnect` (refused with open deliveries), `optionsFor` with the one-day cache.
- Routes `GET|PUT|DELETE couriers[/:id]`, `POST couriers/:id/test`, `GET couriers/:id/options/:what`.
- Turning a courier off in Delivery keeps its connection (keys stay) but hides it from Send.
- **Own account only (CR18):** no courier keys in Mint's env, no shared account; a store without a tested connection
  can't send to that courier. The test keeps an `accountKey` (hash of the Steadfast API key / Pathao client id / RedX
  token, never the key) so the **same courier account connected in two projects** is spotted: both connections show
  "This account is also connected to another Mint store — the courier sends updates to one address, so the other
  store gets them from the scheduled check" (no other project's name is shown across organisations). The connection
  whose webhook address the courier last called is marked `webhookOwner`.
- Smoke `courier-connections.mjs` against the stub: save, keys never returned, test ok / bad keys, key change → untested,
  same account in two projects → both warned.

## CR-04 — Steadfast (M)

- `CONNECTING.md` § Steadfast is from the dashboard's API guide + Webhook page (2026-10-31). No sandbox: build against the stub,
  then one real parcel with the user. Never retry a 401 (10 in 5 min locks the key out for an hour). Cancel = return request.
  Webhook: `X-Signature` HMAC of the raw body, `Idempotency-Key` dedupe, answer within 5 s. Bulk = `/bulk-order/extended`.
- `couriers/steadfast.ts`: credentials apiKey + secretKey; `test` (balance), `book` (`create_order`), bulk
  (`create_order/bulk-order`), `find` (`status_by_invoice`), `status` (`status_by_cid`), `webhook` (Bearer secret;
  `delivery_status` + `tracking_update`), `normalise`; COD whole taka; phone check.
- Stub cases for every status; unit checks for `normalise` and the phone / address rules.

## CR-05 — Delivery engine (L)

- `commerce/deliveries.ts`:
  - `sendPrefill(order)` — recipient, phone, address, area, COD = balance due, weight (sum of variant weights when
    set, else the connection's default), items.
  - `send(order, input, by)` — checks: order open, not held / cancelled, no open delivery (409 with its code), courier
    tested, COD 0…balance, phone. Makes the delivery `booking` (invoice = order code, `-2`… on a resend), calls `book`;
    on a timeout calls `find(invoice)` before failing (CR13); writes consignment / tracking / charge, `booked`, the first
    event, the order's courier summary; record history as the person.
  - `applyEvent(delivery, event, source)` — dedupe, ordering (CR9), normalised status, timeline, order effects (CR7),
    COD payment on delivered (CR8, through `payments.ts` so `settleOrder` runs), order summary.
  - `refresh(delivery)` (`status` → `applyEvent` with source `sync`), `cancel(delivery)` (adapter `cancel` where offered,
    else refuse with "Cancel it in the Steadfast panel, then press Refresh").
- Routes `GET orders/:id/send`, `POST orders/:id/deliveries`, `POST deliveries/:id/{refresh,cancel}`, `GET deliveries`.
- `orderDetail` (EC-09) and the website order view (EC-24) return `deliveries` (current first).
- Smoke `courier-deliveries.mjs`: send → booked; second send refused; timeout → found by invoice, not booked twice;
  delivered → fulfilment delivered + `courier-cod` payment + order paid; cancelled → send again makes `-2`.

## CR-06 — Webhooks (M)

- `POST /public/couriers/:provider/:connection` in `routes-public/index.ts` (body kept raw for the courier's check,
  as `/public/payments/`): find the connection, `adapter.webhook.verify`, store each parsed event in `CourierEvent`
  (raw body, dedupe key unique, 60-day TTL), answer (2xx; Pathao 202 + its header), then apply in the background
  (`setImmediate`) — finding the delivery by consignment, else by invoice within the project.
- Wrong secret → 401, nothing stored except a counter on the connection (shown as "N refused calls" in settings).
  Unknown consignment → stored as unmatched (kept for a later booking that the courier reported first).
- Rate limit per connection; body limit 100 kb.
- `lastWebhookAt` on the connection; Store settings shows it.
- Smoke `courier-webhooks.mjs`: the stub posts every Steadfast status; duplicates applied once; an old event after a
  newer one doesn't move the status back; bad secret 401.

## CR-07 — Panel (L)

- mint-tenant `components/library/commerce/couriers/`: `CourierCards.tsx` in the Delivery section (`sections.tsx`,
  shared by the wizard and Store settings) — switch, mode, keys, Save & test, result, settings, webhook address +
  secret copy with that courier's panel steps; `SendToCourier.tsx` dialog (PromptDialog / ModalFooter rules);
  `DeliveryCard.tsx` on `OrderPage` and the website order view (status badge, tracking copy + link, timeline, Refresh,
  Cancel, Send again, Print label); `label.ts` (80 mm / A6, tracking barcode, printed through a hidden frame like
  `receipt.ts`). Deliveries page = the builder table with the quick views (README §6). Hooks in `commerceApi.ts`
  (grep RTK endpoint names first — they're global).
- **Connect your Steadfast account** card: "No Steadfast account yet? Open one" (link to Steadfast's merchant sign-up,
  new tab); steps — in Steadfast's **API** page make a key named "Mint", paste the API key and secret key, Save & test;
  then in its **Webhook** page paste Mint's callback address and auth token (copy buttons) — "this replaces any address
  there now". Shows which account is connected (balance from the test) and **Disconnect**.
- mint-docs `/store#store-delivery`, `#store-couriers`, `#store-courier-steadfast`, `#store-send-to-courier`,
  `#store-deliveries`; every card and dialog links there.
- Browser-checked end to end against a private backend and the stub (connect, test, send, webhook moves the badge).

## CR-08 — Pathao (M)

- `CONNECTING.md` § Pathao is from the official Developer API page (read 2026-10-31): token, stores, cities / zones / areas,
  price plan, orders, bulk, info, the webhook (Mint's secret in `X-PATHAO-Signature`, reply 202 + integration header within
  10 s) and all 24 events. City / zone / area are optional when booking (Pathao reads the address) — pickers only for the
  price quote. A timed-out booking waits for `order.created` (matched by `merchant_order_id`), then **Link existing parcel**.
- `couriers/pathao.ts`: credentials client id / secret / username / password; token issue + refresh (sealed on the
  connection, refreshed 1 h before expiry, one refresh at a time); sandbox / live; stores (settings: pickup store,
  delivery type normal / on-demand, item type parcel); cities → zones → areas (options); `quote` (price plan); `book`,
  `find` (by merchant order id where the API allows, else by listing), `status` (`orders/:id/info`); webhook:
  `X-PATHAO-Signature` = our secret, integration call answered 202 with the published header; events → CR6;
  `order.paid` → settle (CR11, until CR-13 just recorded on the timeline).
- Send dialog: city / zone / area pickers (CR-10 does the pre-pick), price shown before Send.
- **Connect your Pathao account** card: "No Pathao merchant account yet? Open one"; steps — Pathao merchant panel →
  Developer API → **Generate Credentials**, paste client id + secret, the panel's email + password, Save & test, pick the
  pickup store; then its **Webhook Integration** tab: paste Mint's address and secret. The password is only for issuing
  the token: sealed, used again only when the refresh token stops working ("Reconnect Pathao" if that fails too).
  **Try Pathao's sandbox** mode fills Pathao's published test credentials so an owner can try sending before connecting.
- mint-docs `#store-courier-pathao`.
- Smoke against the stub and Pathao's sandbox.

## CR-09 — RedX (M)

- `CONNECTING.md` § RedX is from the official page. No find-by-invoice: a timed-out booking offers **Link existing parcel**.
- `couriers/redx.ts`: access token; sandbox / live; pickup stores (setting); areas (options, searchable by district /
  post code); `quote` (charge calculator); `book` (`POST /parcel`, weight in grams, value = order total); `status` (`parcel/info`); `cancel` (`PATCH /parcels`); webhook with `?token=` (CR9 table).
- **Connect your RedX account** card: "No RedX merchant account yet? Open one"; steps — RedX merchant panel → Developer
  API → copy the access token, paste, Save & test, pick the pickup store; then paste Mint's webhook address (the token
  is already in it — RedX sends no signature, so the address itself is the secret; Renew makes a new one).
  Sandbox / Live switch.
- mint-docs `#store-courier-redx`.
- Smoke against the stub and RedX's sandbox.

## CR-10 — Area matching (M)

- `CourierAreaMap` (tenantScoped: courier, key = normalised order area + city, picks { city, zone, area ids + names },
  uses, lastUsedAt). Send prefill: a remembered pick first, else a name match against the cached lists (exact, then
  starts-with, then contains; ties not picked). Sending saves the pick.
- Bulk send (CR-12) uses remembered picks only; orders without one are left for the dialog with "Choose the area once".

## CR-11 — Fallback sync (S)

- `scheduleCourierSync()` at boot (server.ts, like `scheduleContentTick`): every 15 min, deliveries not in a final
  status, `lastEventAt` older than 2 h, booked within 30 days; claim with `syncLease` (5 min) so dynos don't double up;
  10 calls a minute per connection. Finals: delivered, partly-delivered (after settle), returned, cancelled, lost.
- Order page refreshes its open delivery on open when last synced over a minute ago.
- Store settings warning when a connection with open deliveries hasn't had a webhook for 2 days.

## CR-12 — Bulk send (M)

- Orders + Website orders tables: select → Send to courier → courier + defaults (weight, note) → per-order results;
  failures stay selected with the reason. `POST deliveries/bulk` (≤ 100 orders; Steadfast bulk API in chunks of 500,
  others 3 at a time); each order goes through `send` (same checks, same idempotency).

## CR-13 — Returned parcels + COD payouts (M, after EC-08)

- Order page **Receive returned parcel** on returned / partly-delivered deliveries: lines and quantities that came
  back, condition, restock (default yes) → EC-08 return engine (restock to the delivery's outlet, no refund for money
  never paid); the delivery records the return.
- Payouts: Pathao `order.paid` events and Steadfast `GET /payments` (+ `/payments/:id` consignments, pulled by the
  scheduler daily) mark matching `courier-cod` payments settled with the payout reference; RedX and manual: "Mark paid
  out" on the Deliveries page (select → reference). "Cash with couriers" on the Deliveries page + a dashboard widget.

## CR-14 — Customers, automations, MCP (M)

- `publicOrder` (EC-23) and My orders return `delivery: { status, statusLabel, courier, trackingCode, trackingUrl,
  updatedAt }` for the current delivery; Live Fresh's track page shows it (live-fresh repo).
- The store installs two automations on Deliveries, off by default: "Tell the customer it's on the way" (status →
  picked-up) and "…it's delivered" (email, SMS when messaging has it); guide shows how to turn them on.
- MCP (`store.tools.ts`): `list_deliveries` (data), `send_to_courier` (build — same `send`, as "<owner> (AI)", COD and
  courier must be stated), `refresh_delivery`. No keys over MCP.

## CR-15 — Manual courier (S)

- `couriers/manual.ts`: no keys, always "connected"; Delivery settings has a list of courier names (Sundarban, the
  shop's own rider…) with an optional tracking-link pattern (`https://…/{tracking}`). Send = type the tracking code;
  status moved by hand on the Delivery card (`POST deliveries/:id/status`), same order effects. Offered in every country.

## CR-16 — More couriers (M each, later)

- Paperfly, eCourier, CarryBee (BD) — one adapter each, README §5 row added from their docs, stub cases, guide anchors.
- International (Shippo / EasyPost / Shiprocket) is a separate plan when a non-BD store asks.

## CR-17 — Docs, website, rollout (S)

- mint-docs Couriers guide complete (each courier's "where to find your keys" and "where to paste the webhook" with
  screenshots of their panels); marketing website: couriers on the e-commerce page.
- Prod: backend deploy is the user's (manual Heroku); then `scripts/upgradeStores.js` dry run → `--apply` (needs the
  user's approval) so Verte gets Deliveries; connect Verte's Steadfast in Store settings and send one real order with
  the user watching.
