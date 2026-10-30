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
