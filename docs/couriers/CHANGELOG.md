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
