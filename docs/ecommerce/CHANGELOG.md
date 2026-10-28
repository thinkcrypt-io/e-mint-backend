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

## 2026-10-28 — EC-03 Blueprint, installer, locks

- `library/functions/commerce/blueprint.ts`: the store's 18 models (Outlets,
  Categories, Brands, Tax rates, Products, Variants, Stock, Stock movements,
  Stock adjustments, Stock transfers, Customers `store-customers`, Coupons,
  Registers, Shifts, Orders, Payments `order-payments`, Returns, Store
  credit) as one feature plan; per model the fields only the engine writes
  (`engine`), whether only the store makes its records (`engineOnly`:
  stock, movements, shifts, orders, payments, returns, credit), when the
  sidebar shows it (`shownWhen`) and whether a store page replaces its table
  (`ownPage`: Orders, Returns). Decision changed: every store gets every
  model; the answers choose what shows and how the engine behaves.
- `install.ts`: `POST /commerce/setup` (manage-projects) checks every
  answer (400 with problems by section), claims the store (`building`, one
  at a time, 409 otherwise) and builds in the background: an E-commerce
  sidebar category, the plan through `buildFeature` (template step limit),
  each model marked `system: 'commerce'` with its core fields, the engine's
  fields `edit: false` in the published settings (forms show them muted;
  saves can't send them), the sidebar items shown / ordered / iconed, then
  the wizard's outlets, tax rates and a register at each store. A failure
  undoes it all and leaves `failed` with the reason (setup can run again).
  Store settings on a built store: `settingsGuard` refuses variations off
  while a product has several variants, store credit off while a customer
  has credit, shifts off while one is open (409 `commerce_in_use`);
  `afterSettingsSaved` updates the sidebar and features; outlets are kept on
  the Outlets page once built.
- Builder (EC4): `ModelDefinition.system` / `systemFields`;
  `systemProblems` in `updateModelCore` (409: a core field removed,
  retyped, relinked, a row field removed, numbering switched off — labels,
  help and new fields are fine), so the model page, features and the MCP
  are all held; `deleteModelCore` refuses a system model unless the
  installer undoes itself (`system: true`).
- Records (EC5): `commerceGuard` (before the project's built models): on a
  store model, `engineOnly` records can't be made, deleted, duplicated or
  imported from plain pages (403 `commerce_field`, a plain reason), only
  their own added fields edited; elsewhere a new record can't carry the
  engine's fields, an edit can't change them, bulk duplicate / merge /
  status / update-many / copy are refused, and an import drops their columns
  (`req.importExclude`, read by `importRows`).
- Verified: `commerce-install.mjs` (34 checks: setup in ~3 s locally, 18
  models by key and marked, sidebar, seeded records, builder locks, plain
  save guard, muted form field, settings on a built store, force delete) and
  `commerce-settings.mjs` pass; `projects.mjs` passes; `models.mjs` /
  `collections.mjs` only fail their super-admin checks (no super admin
  seeded on the private DB).

## 2026-10-28 — EC-04 Setup wizard + Store settings

- mint-tenant `/<project>/store/setup`: the wizard — a stepper (steps reached
  can be clicked back to), one panel per section with its "How this works"
  link, Next saves the step (and the step reached, so it resumes) and shows
  the server's problems under it, Review (one line per section, "Needs a
  look", Change), **Set up my store** → `POST /commerce/setup`, then polls
  every 2 s: Setting up your store… (seconds counted), Your store is ready
  (Add products / Open the POS / Store settings — full loads), or the last
  setup's reason above the wizard. The sidebar is refreshed when it's ready.
- `/<project>/store/settings` (behind `StoreGate`): the same editors as
  cards, each with Save / Undo changes and the server's refusal (e.g. "2
  products have several variants…"); Outlets links to the Outlets page.
  Saving refreshes the sidebar (`SIDEBAR_TAGS`).
- Section editors (`sections.tsx`): currency (the country's shown), order
  prefix, selling below zero; outlets (name, code, kind, phone, address);
  variations + up to three option names, barcodes, track stock, brands;
  tenders as ticked cards, own ways by name, online gateways; returns
  (window, partial, restock, store credit, refund by); delivery (charges,
  couriers); POS (receipt size and lines, shifts, hold, discounts, coupons,
  customer required, tax mode + rates with one default).
- mint-docs `/store` "E-commerce: your store" (Go live): setup, each step,
  what you get, what the store keeps to itself, Store settings,
  troubleshooting; listed in guides.ts; Storefront icon.
- Verified in the browser pane against the private backend: walked the
  wizard (an empty outlet's two problems shown; removed), tax in prices,
  Review summary, Set up → building → ready in ~8 s, Store settings with the
  Store and E-commerce sidebar sections. mint-tenant typecheck clean.

## 2026-10-28 — EC-05 Catalogue + stock

- `commerce/store.ts`: the built store for the engine — answers, features,
  `M(key)` (the compiled model by what the installer recorded), `is()`;
  `roundFor(currency)`, `itemName`, `actorName`.
- `commerce/catalogue.ts`: `syncVariants` — without options one default
  variant mirroring the product (title, SKU, barcode, sold unless draft /
  archived); with options the matrix of their values (≤ 100, else a plain
  400), new combinations added, dropped ones and the default switched off,
  none deleted. Runs after every product save (`hooks.ts` `fireCommerce`,
  called from `recordHistory` before its "nothing changed" check — it
  doesn't see a row list change) and from `POST /products/:id/variants`.
  `codeTaken` (SKU / barcode one item's each — the guard refuses a taken
  one, 409 `code_taken`, naming who has it; a product's default variant
  doesn't count against it). `lookup` (barcode or SKU → the variant; a
  product's code → its default variant; 404 with a reason), `catalogue`
  (by name, codes or a variant's title; stock at an outlet), `itemView`
  (price: the variant's, else the product's).
- `commerce/stock.ts`: `move` — the level made first (`$setOnInsert`), then
  one conditional `$inc` (taking out only matches while `onHand ≥ −change`,
  unless selling below zero); `NotEnoughStock` 409 "Only N of X left at Y";
  variant and product totals `$inc`; a movement with the figure after.
  Items that don't track stock move nothing. `moveAll` takes back what it
  did, newest first, when one fails. `setStock` (counted or a change;
  reason opening / count / adjustment), `productStock` (variants ×
  outlets), `applyAdjustment` (claimed once; counted − on hand or the
  change), `transferAction` send / receive / cancel (a sent one goes
  back), each claimed by status so a double click acts once.
- Routes under `/commerce`: catalogue, lookup, products/:id/variants,
  products/:id/stock, stock/set, adjustments/:id/apply,
  transfers/:id/(send|receive|cancel). The guard also refuses a variant made
  by hand while variations are off.
- mint-tenant: a product's page leads with **In stock** (variants ×
  outlets, a figure clicked → Counted / Add or take away + note; Make
  variants from options); adjustments and transfers lead with **Items**
  (the item picker — matching variants only, stock here — counted or
  change, quantity; Save items; Apply / Send / Receive / Cancel transfer).
  `commerceApi` gains the catalogue and stock calls (names checked free).
- mint-docs `/store`: Variants, SKUs and barcodes; Stock: counts,
  adjustments, transfers.
- Verified: `commerce-stock.mjs` (38 checks — variants from options and
  their changes, the default variant, codes, lookups, counts and totals,
  movements, transfers refused past the stock, five parallel sends of 3
  from 6 → exactly two, cancel puts back, adjustments once, the 100 cap,
  variations kept on) plus `commerce-install` / `commerce-settings` pass;
  in the browser pane: a product's In stock grid and a count saved (10 →
  12), an adjustment's picker (navy → the navy variants), −2 applied (7 →
  5).

## 2026-10-28 — EC-06 Orders + payments engine

- `commerce/pricing.ts` `quote()`: what a basket costs, worked out on the
  server — same variant twice adds up; line discount (amount or %), the
  coupon (dates, active, uses left, minimum order, everything / categories /
  products) shared over the lines it covers, the order discount over what's
  left, tax per product rate (else the default) inside the price or added;
  rounded to the currency's minor unit. Stock short is a problem for a sale,
  a warning for a quote. Discounts and coupons refused when switched off.
- `commerce/payments.ts`: the store's ways to pay (tenders, own names, store
  credit); payments checked (only cash may be more than due — the rest is
  change); `settleOrder` works paid, refunded, balance and the payment status
  out of the Payments ledger; store credit moves atomically, never below 0,
  with a ledger row.
- `commerce/shifts.ts`: one open shift per register; cash in / out; expected
  cash = float + cash taken − cash refunded + in − out; close with the count
  (over / short).
- `commerce/orders.ts`: a POS sale (register, open shift when shifts are on,
  paid in full, taken away → completed), an order by phone / by hand (stock
  out now, shipping from a delivery rate, the customer's address, paid any
  part), held sales (no stock or money until resumed), paying the rest,
  fulfilment (packed → shipped → delivered, delivered completes it), cancel
  (stock back, money back by method — store credit to the customer — the
  coupon's use back, customer totals back; shipped orders are returns).
  A sale's writes are undone newest first when one fails; the order goes too.
- Routes: `/commerce/pos/setup`, `/quote`, `/sales`, `/orders`, `/held`,
  `/orders/:id` (+ `/pay`, `/fulfil`, `/cancel`), `/shifts` (+ `/current`,
  `/:id`, `/:id/cash`, `/:id/close`).
- Smoke: `commerce-orders.mjs` (43 checks); the other commerce suites still pass.

## 2026-10-28 — EC-07 POS page

- mint-tenant: Store → POS (`/store/pos`), full screen. Pick the register
  (remembered on the device); with shifts on, open a shift with the cash in
  the drawer. Product grid with category chips and stock at the outlet; the
  scan box adds by barcode / SKU on Enter; a product with variants asks which
  one. Basket: quantities, a discount per line, the customer (find or add,
  with their store credit), a coupon, an order discount; subtotal, discount,
  tax and total come from the store's quote. Pay: split across the store's
  ways to pay, cash change shown. Receipt (80 mm or A4) shown after the sale
  and printed from the page. Hold / Held sales (resume, discard). Shift
  dialog: what it took by method, cash in / out, close with the count (over /
  short).
- Backend: the store engine compiles the project's models itself (a POS call
  right after a restart failed); held sales list the customer's name; a
  shift's sales count orders, not payment rows.
- Docs: the store guide gains "Selling at the POS" (`store-selling`) and three
  troubleshooting rows; the POS bar links to it.
- Checked in the browser: shift opened, barcode scan, variant pick, customer,
  coupon (10% shared over the lines), VAT included, card + cash with 500
  change, receipt, hold and resume, shift summary; phone width without
  sideways scroll. The commerce suites still pass.
