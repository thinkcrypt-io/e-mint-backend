# E-commerce projects — changelog

## 2026-10-28 — EC-01 Plan & docs

- The user asked for an E-commerce project category with a setup wizard
  (payment options, product variations), pre-built products / orders / POS,
  payments, full and partial returns and refunds, while models can still be
  built and linked.
- Answers: builder models with core fields locked; stock per outlet from day
  one; admin + POS only (no storefront in this type); POS extras barcodes +
  receipts, discounts / coupons / tax, register shifts, held sales + store
  credit.
- Wrote `README.md` (decisions EC1–EC18, the models, engine, panel, out of
  scope) and `WORK_ORDERS.md` (EC-02…EC-13, later EC-14…18).

## 2026-10-28 — Plan additions

- The user: "the order record page should be custom also the order table" →
  EC19; EC-09 now builds a custom Orders table and a detailed order page.
- The user: "on order page should have detailed order option with option to
  send it to courier if courier is integrated" → EC20; couriers (Steadfast,
  then Pathao, RedX) move from later into EC-18, with a Delivery step in the
  wizard.
- Routes: `customers` and `payments` are the project API's own paths, so the
  models are `store-customers` and `order-payments`.
