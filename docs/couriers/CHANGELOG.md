# Couriers — changelog

## 2026-10-30 — CR-01 Plan & docs

- The user asked for Steadfast, Pathao, RedX and other couriers, configured in
  every store's settings: turn a courier on, connect it with its API keys, test
  it, send orders to it, a Delivery model linked to the order, and webhooks that
  update deliveries by themselves.
- Wrote `README.md` (decisions CR1–CR17, the Delivery model, the adapter
  interface and engine, the three couriers' APIs side by side, the panel, out
  of scope) and `WORK_ORDERS.md` (CR-02…CR-17).
- docs/ecommerce: EC-18 and EC20 now point here (the order's courier section
  stays, as a summary of its current delivery).
- The couriers' field names, statuses and webhook headers in README §5 come from
  their merchant API docs as known when planning; each adapter WO checks them
  against the current doc first.

## 2026-10-31 — Couriers' APIs checked

- The user: "Check the courier api docs and find how to connect them." Wrote
  `CONNECTING.md`: per courier, what the owner does in the courier's panel, what
  Mint stores, every endpoint, the webhook check, statuses, and where each fact
  came from. RedX: its official Developer APIs page. Steadfast: its Postman
  collection, webhook from packages. Pathao: packages only (official docs need a
  merchant sign-in).
- Plan changes: README §5 is now a summary pointing to CONNECTING.md; the
  webhook secret is the courier's (Steadfast) or Mint's (RedX); find-by-invoice
  only on Steadfast, else "Link existing parcel"; RedX areas are flat;
  `ready-for-delivery` = picked up; new CR-18 delivery risk (Steadfast fraud check).

## 2026-10-31 — Pathao from its own docs

- The user signed in to the Pathao merchant panel in the browser pane; read the
  Developer API page (API Documentation + Webhook Integration tabs) and Pathao's
  own WooCommerce plugin. CONNECTING.md § Pathao is now official: password-grant
  token (5 days), city / zone / area optional when booking, 24 webhook events with
  payloads, the secret is typed by the merchant (so Mint makes it), the reply needs
  202 + Pathao's integration header within 10 s. Only Steadfast's webhook spec is
  still from third parties.

## 2026-10-31 — Steadfast from its own docs

- The user signed in to Steadfast; read the dashboard's API guide and Webhook
  page. CONNECTING.md § Steadfast is now official: ping + balance test, named
  keys per integration, 401 lockout rule, booking limits (truncates, strips
  characters), `bulk-order/extended`, `tracking_link` on booking, return request
  as cancel, the `fraud_check/score` endpoint, and the webhook — HMAC-SHA256
  `X-Signature`, `Idempotency-Key`, 5 s reply, 3 attempts, 9 event types with
  payloads. All three couriers are now from their own pages.
- The user's Steadfast profile already has a callback URL to another backend;
  one URL per profile, so connecting Mint will replace it.

## 2026-10-31 — Scope: Steadfast, Pathao, RedX on the store's own account

- The user: "pathao and steadfast, users will connect their own accounts", then
  "pathao steadfast and redex". New decision CR18: every store connects its own
  merchant account; Mint has no courier account or keys and never holds COD
  money; one account in two projects is flagged (one webhook address per account).
- WORK_ORDERS.md regrouped into phases: 1 Steadfast end to end (CR-02…07);
  2 Pathao + RedX + area pickers + sync, then ship (CR-08, 09, 10, 11, 17);
  3 everyday use (CR-12, 14, 15, 18, 13). CR-16 later. Connect-your-account
  cards (sign-up link, key and webhook steps) added to CR-07, CR-08, CR-09;
  `accountKey` duplicate check added to CR-03.

## 2026-10-31 — CR-02 Delivery model

- Blueprint: Deliveries (`StoreDelivery`, route `deliveries`, `DLV-000001`) with
  every README §3 field, made only by the store; the order's courier summary
  gains `delivery` (code) and `trackingUrl`. Sidebar icon `package-check`,
  shown while Delivery is on.
- `upgradeStore` builds the blueprint models a store doesn't have yet, so
  `scripts/upgradeStores.js --apply` gives built stores Deliveries.
- Fix: model definitions now keep a reference's `optionFilters` and
  `pickerDetails` (the Variants product picker's rule was dropped on save).
- Smoke `courier-model.mjs`: a new store's 19 models, the links, locks and
  statuses, plain writes refused, an older store upgraded (dry run, apply,
  again = up to date). commerce-install / orders / website-orders pass.

## 2026-10-31 — CR-03 Courier connections

- Each store connects its own Steadfast, Pathao and RedX accounts:
  `CourierConnection` with sealed keys, the courier registry with one adapter
  each (keys, settings, links, `test`, and Pathao's / RedX's lists), and
  `/commerce/couriers` routes to list, save + test, test, renew the webhook
  secret, disconnect and load stores / cities / zones / areas (kept a day).
- Tests: Steadfast `ping` + `get_balance` (a refused key is never retried),
  Pathao a password-grant token then its active stores (the default one
  picked), RedX its pickup stores. Pathao's published sandbox account is one
  switch. The same account in two stores is flagged on both.
- `courier-stub.mjs` (one local stand-in for all three) and
  `courier-connections.mjs` (44 checks, all pass).

## 2026-10-31 — CR-04 Steadfast

- The Steadfast adapter books, books in bulk, finds a parcel by our invoice,
  reads its status, asks for it back (Steadfast's cancel) and checks and reads
  its webhooks; statuses mapped to Mint's. `courier-steadfast.mjs`: 19 checks
  against the stub, all pass. No real Steadfast parcel was booked (no sandbox,
  and the user's live keys aren't Mint's to type in).

## 2026-10-31 — CR-05 Delivery engine

- Orders can be sent to a connected courier from the API: the Send dialog's
  prefill, the checks, one parcel per order at a time, safe retries (a timeout
  is looked up by invoice before it's called a failure), status checks moving
  the delivery and the order (shipped, delivered and completed, returned), a
  cash-on-delivery payment when it's delivered, cancel, the Deliveries list
  with cash held by couriers. An order with a parcel out can't be cancelled.
- `courier-deliveries.mjs`: 36 checks against the stub, all pass; the order
  and website-order smokes still pass.

## 2026-10-31 — CR-06 Webhooks

- Couriers can now tell a store about its parcels: one address per
  connection, the courier's own check against that connection's secret, each
  call stored once (retries land once), answered at once and applied after in
  the order things happened; calls about parcels not booked yet wait for the
  booking. Refused calls are counted in Store settings; the raw calls are kept
  60 days and shown per delivery.
- `courier-webhooks.mjs`: 19 checks, all pass.

## 2026-10-31 — CR-08 Pathao (backend)

- Pathao books, books in bulk (ids by webhook), gives its price for a city
  and zone, reports a parcel's status, and its webhooks are checked, answered
  202 with its header, and applied — including a payout. A timed-out booking
  stays "may have been booked" until Pathao's own order.created names it.
- Stub tests pass; Pathao's real sandbox was unreachable today, so the
  sandbox booking check is still to run.

## 2026-10-31 — CR-09 RedX (backend)

- RedX books (with a delivery area), gives its charge, reports status,
  cancels on request (RedX confirms later), and its webhooks are checked by the
  token in Mint's address and applied, including payouts. 16 stub checks pass.
  RedX's real sandbox wasn't tried: it needs the owner's own sandbox token.

## 2026-10-31 — CR-10 Area matching, CR-11 Regular check (backend)

- The Send dialog's prefill now carries each courier's area picks: matched
  from Pathao's cities / zones / areas and RedX's areas, or remembered from an
  earlier send to the same place. Phone orders keep the city.
- Every 15 minutes Mint asks the couriers about parcels that have been quiet
  for 2 hours; Store settings warns when a courier has sent nothing for 2 days
  while parcels are out.

## 2026-10-31 — CR-12 Bulk send (backend)

- Up to 100 orders can be sent at once, each through the same checks as one
  send: Steadfast in one bulk call, the others three at a time using the areas
  picked before. Each order's result comes back.

## 2026-10-31 — CR-14 Customers, automations, MCP (backend)

- The website's order view shows the parcel's courier, status and tracking.
- Every store gets two delivery emails (on the way, delivered) as
  automations, switched off; deliveries now start automations whenever their
  status changes.
- The store's own AI can list deliveries, send an order to a courier (the
  courier and the cash always stated) and refresh one over MCP.
- Invoices sent to couriers end in a short store tag, so two stores (or
  another system) on one courier account never clash.

## 2026-10-31 — CR-15 Manual courier, CR-18 Delivery risk (backend)

- Any store, in any country, can track parcels with couriers that have no
  API: it names them (with a tracking-link pattern), types the tracking code
  when sending, and moves the parcel on by hand — the order follows as with
  any courier.
- A buyer's phone can be checked with Steadfast (the store's own key): how
  often their parcels are delivered, in plain words, kept a day.
