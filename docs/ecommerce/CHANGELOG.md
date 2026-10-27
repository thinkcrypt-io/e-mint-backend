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

## 2026-10-28 — EC-02 Project type + store settings

- Backend: `PROJECT_TYPES` gains `ecommerce` (New project's Joi takes it).
  `CommerceSettings` (tenantScoped, removed with the project): status
  new / building / ready / failed, the wizard's step, answers, installed,
  features. `library/functions/commerce/settings.ts`: the answers' shape
  (store, outlets, products, payments, returns, delivery, pos), defaults
  from the organization's country (currency; BD: cash, card, bank, bKash /
  Nagad / Rocket by reference, Stripe / SSLCommerz / bKash, Steadfast /
  Pathao / RedX; elsewhere a generic wallet, Stripe, no couriers), each
  section checked on its own with plain problems (400 `commerce_settings`,
  `problems` by section), `needs` per section for the wizard.
  `routes-tenant/commerce.router.ts` at `/p/:project/commerce` (404 for
  other kinds): `GET /settings` any member, `PUT /settings` manage-projects
  (history line). Sidebar: a Store section leads an e-commerce project —
  Set up your store until it's ready, then POS / Orders / Returns / Store
  settings. Tenant reserved routes gain `payments` (mounted but never
  reserved — a model at /payments was shadowed), `site-payments`,
  `commerce`, `store`.
- mint-tenant: New project's fourth kind **E-commerce** (amber, Store
  icon; no template picker) opens `/<project>/store/setup`; first-run kinds
  gain "A store"; suggestions for a store; `store` is a project page;
  `StoreGate` sends a store's dashboard to the wizard until it's ready;
  `commerceApi.ts` (`getCommerceSettings`, `saveCommerceSettings` — names
  checked free). The wizard itself is EC-04.
- Verified: `commerce-settings.mjs` — 33 checks pass on a private server;
  backend and mint-tenant typecheck clean.
