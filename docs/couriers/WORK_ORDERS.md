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

Order: **CR-02 → CR-07 is Steadfast end to end** (the user's stores are BD,
Steadfast is the simplest API); Pathao and RedX follow on the same engine.

## Status

| WO | Title | Repo | Size | Status |
|---|---|---|---|---|
| CR-01 | Plan & docs | backend | S | done 2026-10-30 |
| CR-02 | Delivery model (blueprint, locks, order summary fields) + `upgradeStore` for built stores | backend | M | |
| CR-03 | Courier connections: model, sealing, adapter interface + registry, settings API, Test | backend | M | |
| CR-04 | Steadfast adapter (test, book, bulk, find by invoice, status, webhook) | backend | M | |
| CR-05 | Delivery engine: send, applyEvent, refresh, cancel, order effects, COD payment | backend | L | |
| CR-06 | Webhooks: public route, per-courier checks, inbox, idempotency, ordering | backend | M | |
| CR-07 | Panel: Store settings → Delivery couriers, Send to courier, Delivery card, label, Deliveries page | mint-tenant + mint-docs | L | |
| CR-08 | Pathao adapter (tokens, stores, cities / zones / areas, price plan, book, info, webhook + 202 handshake) | backend + mint-tenant | M | |
| CR-09 | RedX adapter (areas, pickup stores, charge, parcel, info, cancel, webhook) | backend + mint-tenant | M | |
| CR-10 | Area matching: courier area pickers, `CourierAreaMap` remembered picks | backend + mint-tenant | M | |
| CR-11 | Fallback sync scheduler, Refresh on open, silent-webhook warning | backend + mint-tenant | S | |
| CR-12 | Bulk send from the order tables | backend + mint-tenant | M | |
| CR-13 | Returned parcels (Receive → EC-08 return engine) + COD payouts (settled, Cash with couriers) | backend + mint-tenant | M | after EC-08 |
| CR-14 | Customers + automations + MCP: tracking on the website endpoints, installed automations, MCP delivery tools | backend + live-fresh | M | |
| CR-15 | Manual courier (any country) | backend + mint-tenant | S | |
| CR-16 | More BD couriers: Paperfly, eCourier, CarryBee (one adapter each) | backend | M each | later |
| CR-18 | Delivery risk on website orders: Steadfast `fraud_check/:phone` (parcels / delivered / cancelled for the buyer's phone) | backend + mint-tenant | S | later |
| CR-17 | Docs, website, prod rollout (`upgradeStores.js --apply`, connect Verte's Steadfast) | all | S | |

## Handoff

- **2026-10-31 — APIs checked** → `CONNECTING.md` (start every adapter WO there). RedX = official; Steadfast = its Postman
  collection + packages for webhooks; Pathao = official (signed-in Developer API page, 2026-10-31). Steadfast has no sandbox (smoke against the stub; one live consignment with the user).
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
  Store → Deliveries after Website orders. Order's `courier` section gains `delivery` (reference) and `trackingUrl`.
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
- Smoke `courier-connections.mjs` against the stub: save, keys never returned, test ok / bad keys, key change → untested.

## CR-04 — Steadfast (M)

- `CONNECTING.md` § Steadfast is the reference. First, with a real account: the bulk body form, the phone form, `delivery_type` values,
  and which webhook check Steadfast actually sends (log both) — correct CONNECTING.md.
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
- Smoke against the stub and Pathao's sandbox.

## CR-09 — RedX (M)

- `CONNECTING.md` § RedX is from the official page. No find-by-invoice: a timed-out booking offers **Link existing parcel**.
- `couriers/redx.ts`: access token; sandbox / live; pickup stores (setting); areas (options, searchable by district /
  post code); `quote` (charge calculator); `book` (`POST /parcel`, weight in grams, value = order total); `status` (`parcel/info`); `cancel` (`PATCH /parcels`); webhook with `?token=` (CR9 table).
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
