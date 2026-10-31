# E-commerce projects — changelog


## 2026-10-31 — Tax / VAT on categories and products
- The user: "there should be a tax/VAT model… on products and categories… if a category has a tax, picking it on a product fills the tax, which can be changed; only active taxes show up; a price after tax formula."
- Tax rates (the existing `TaxRate` model) gain a Status (active / inactive), are always in the sidebar, and are built before categories. Categories get a **Tax / VAT** picker; Products' tax picker offers only active taxes (a tax with no status counts as active) and is filled from the category when one is picked (`fillFrom` category → taxRate; also filled by the server on create). Products get **Price after tax** — `round(price * (1 + taxRate.rate / 100), 2)`, a formula, empty tax = price.
- Builder field defs now accept `fillFrom { from, formula }` (dynamicModels + Joi). `upgradeStores.js` adds the fields and the picker rules to built stores.

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

## 2026-10-28 — EC-13a Store over MCP, EC-16a storefront basics

- The user, for the Live Fresh demo storefront on Verte: checkout in three steps with SSLCommerz (sandbox), sign in /
  sign up / forgot password, guest checkout switchable in the store's settings, a variable product whose picture follows
  the variant, opening stock of 10 with some products out of stock shown as such on the site.
- Found: `create_records` (MCP) wrote a store's models with none of the guard's rules — engine fields, orders, stock rows —
  and products made with it never got variants (`fireCommerce` runs from recordHistory only).
- Backend: `commerceWriter` in `locks.ts`, used by `create_records`, which also fires the store hook after saving.
  MCP `store_stock`, `sync_variants`, `set_stock` (store.tools.ts; offered in e-commerce projects only, with a paragraph
  in the server instructions). Store settings `store.guestCheckout` (default on). `GET /public/api/store`. Variant `image`.
- mint-tenant: Store → "Guest checkout on your website"; the wizard's review line says which. mint-docs `/store`: the row.
- Smoke: `commerce-mcp.mjs` (25 checks); `commerce-settings.mjs` still passes.

## 2026-10-28 — EC-09 Orders and Returns pages

- The user: Store → Orders (`/store/orders`) was missing — the sidebar linked to pages EC-09 hadn't built yet, and the
  plain tables are hidden for them. Built ahead of EC-08, so returns can be listed, opened and moved along but not made
  or refunded yet.
- Backend: `commerce/lists.ts` — `GET /commerce/orders` (quick filters with counts, search by number / customer / phone,
  channel, outlet, paging; held sales never listed), `GET /commerce/returns`, `GET /commerce/returns/:id`,
  `POST /commerce/returns/:id/status` (refunding stays the engine's); the order page's data gains `extra` (fields people
  added to Orders).
- mint-tenant: `/store/orders` (tabs with counts, search, channel / outlet filters), `/store/orders/<id>` (items with
  returned quantities, totals, payments and refunds, returns, stock movements, timeline, customer, delivery, details,
  More details; Take payment, Fulfil, Cancel, Print receipt), `/store/returns` and `/store/returns/<id>` (status bar,
  Approve / Reject / Mark received / Close with a note); order and return record links open them.
- mint-docs `/store`: Orders, An order's page, Returns (anchors `store-orders`, `store-order`, `store-returns-page`).
- Smoke: `commerce-lists.mjs` (32 checks); `commerce-orders.mjs` still passes.

## 2026-10-28 — EC-21 Categories on the POS and the website

- The user: categories must be advanced in the model the wizard builds — Status on POS / on website (inactive isn't
  shown), Order on POS / on website (higher first), Web address (slug) made from the name when blank and kept unique
  with a suffix even when typed, more images; existing stores updated too.
- Slug kind (`uid`, "Address (slug)"): a typed address that's taken gets -2, -3 like a made one (was refused);
  the pre-save duplicate check leaves slug fields to the model.
- Blueprint Categories rebuilt (EC21). POS: `GET /commerce/categories`. A store model with Status / Order on
  website gets those as its list endpoint's filter and sort when the endpoint is made.
- `upgradeStore` (commerce/upgrade.ts) + `scripts/upgradeStores.js`: missing blueprint fields added, MINT's old
  labels renewed, new core fields locked, categories filled in (web addresses, active, old ascending order turned
  round), the list endpoint given the website rule. Safe to re-run.
- mint-tenant: POS category bar from the new endpoint; slug kind hint. mint-docs: `/store#store-categories`, the slug
  rule on `/models`. Live Fresh: categories sorted by Order on website.

## 2026-10-28 — EC-21b Category form in sections

- The user: the form should have POS configuration and Website configuration sections, smaller fields side by side,
  as every store's default.
- Blueprint Categories gets `form` + `view` sections: Category (name | parent), POS configuration (status | order),
  Website configuration (status | order, web address), Images. Fields people add land under Images on new stores.
- `upgradeStore` lays out a built store's page the same when it lacks those sections (published straight to
  RouteConfig with a RouteVersion; the person's own fields under More details) and renews MINT's old description.


## 2026-10-29 — EC-22 A store's site kit and SEO on products and categories

- The user: the site configurations, contents and SEO websites have were missing on a store; every new store should
  start with them, and Categories and Products should have an SEO section their pages use.
- New stores get the website kit without the Site design (`STORE_SITE_KIT`, `websiteKit.function.ts`): Pages /pages,
  SEO /seo, Contents /web-contents, each with a read-only public API; `projectHooks.onCreated` seeds it for `ecommerce`
  as for `website`. A project that already has any of those routes is left alone.
- Blueprint Category and Product gain an `seo` field (the SEO editor); Category's form and detail get an SEO section.
- `upgradeStore` adds the `seo` fields and the sections to built stores, puts `seo` on the public Products and
  Categories lists/pages, and adds the kit when missing (`ensureStoreSiteKit`) — run `scripts/upgradeStores.js`
  (dry run, then `--apply`) after deploying.
- Tenant: a store's menu has a Site section (Site setup, Website setup, Analytics); its Contents screen and the
  website setup page open for stores (`siteContents.router`, `content.router`, mint-tenant `t/[slug]`, `website-setup`).
- Not done: the Site builder and the builder-only MCP tools stay website-only; SEO health and the SEO record page
  are still website-only (a store's SEO opens as the ordinary page).

## 2026-10-29 — EC-23 Website orders on the Order model

- The user: website and POS orders on one order model with an origin, in two tables; cancelled and returned items must
  put stock back; website numbers WEB-00001; existing online orders copied across; stock out when placed.
- Order's `channel` is now "Origin" with POS · Phone / by hand · **Website**; new `email`, `slot`, `paymentMethod`;
  delivery gains `city`, `landmark`, `email`. `upgradeStore` adds them to built stores.
- `POST /public/api/store/orders` (project key, rate limited): the store prices the order, checks stock, takes it from
  the first active store outlet, numbers it WEB-00001; `GET /public/api/store/orders/:id?phone=` finds it again.
  Cancel already puts stock back (smoke-tested for website orders); returns restock arrives with EC-08.

## 2026-10-29 — EC-24 Website orders page

- `GET /commerce/orders?scope=website|pos`: two tables on one model — website orders, or POS and phone orders (the POS
  Orders page now passes `pos`). Search also finds a name, address or email; filter by `area`. New quick views New ·
  To pack · Out for delivery · Delivered. Fulfilment gains **Confirmed** (New → Confirmed → Packed → Out → Delivered).
- mint-tenant `/store/website-orders` (sidebar: Store → Website orders): customer + phone + email, deliver-to address
  with landmark, area and time slot, payment choice and status; the order page's Delivery card has call / email / Open in
  Maps links, the slot and landmark; Origin on the details card; Confirm order action.

## 2026-10-29 — EC-08 Returns: restock and refund

- The user: when an order is cancelled the item stock should adjust, and when items are returned.
- `commerce/returns.ts` `returnItems` + `POST /commerce/orders/:id/return { lines: [{ line, quantity, reason, condition,
  restock }], refundMethod, note }`: whole numbers up to what's left (claimed atomically per line), return window and
  "whole orders only" honoured, sellable items go back to the order's outlet (movement reason `return`; damaged ones
  don't), refund = the lines' worth (shipping stays) but never more than was paid and not yet refunded — split over the
  ways it was paid, cash, or store credit — as refund payment rows; a Return record (RET-00001, status refunded); the
  order's returned counts and balance settle; all items back → fulfilment `returned`. An unpaid order just owes less.
  Cancelling already puts stock back (smoke-tested for website orders too).
- mint-tenant: the order page's **Return items** dialog (quantity per line, why, damaged = don't restock, refund
  method, what goes back). Smoke `commerce-returns.mjs` (9).
- Still to do: refunds through the payment gateway (Stripe / SSLCommerz / bKash), exchange, POS Return mode.

## 2026-10-29 — EC-25 Verte and Live Fresh cut over to the store's Orders (built, not switched on)

- Backend: `GET /public/api/store/my/orders[/:id]` (signed-in buyer's website orders, by their email; `done=1|0`),
  `GET /store/orders/:id` answers by id alone (the order page's link), with `?phone=` it must match; public `status` is the
  storefront's stage (new · confirmed · out_for_delivery · delivered · cancelled). `scripts/webOrdersToOrders.js`
  (dry run / `--apply`) copies Online orders into Orders with their number, date, address, area, slot; items matched to
  variants by SKU; stock untouched; delivered orders get the cash payment. Dry run on Verte: 31 orders.
- Live Fresh: `NEXT_PUBLIC_STORE_ORDERS=1` makes `/api/checkout` post to `/store/orders`, and the order page, tracking,
  account list and dashboard read the store's Orders (adapter `toWebOrder`). Off, nothing changes.
- **Switching Verte over (needs the user — production writes):** 1) deploy the backend; 2) `node scripts/upgradeStores.js
  --apply` (Order fields: email, slot, paymentMethod, Origin = Website, Confirmed); 3) Store settings → Delivery: turn on
  and add the two areas (Inside Dhaka 60, Dhaka suburbs 100); 4) `node scripts/webOrdersToOrders.js --apply`; 5) Vercel env
  `NEXT_PUBLIC_STORE_ORDERS=1`, redeploy; 6) hide the Online orders page once nothing reads it.

## 2026-10-30 — EC-26 Coupons
- Coupon model: `couponCode`, `status` (active/inactive), `type` (percent / fixed), `percentOff` + `maxDiscount` (shown when
  Percentage), `amountOff` (shown when Amount off), `startsAt`/`endsAt` (Valid from / till), `usageLimit` (Max uses),
  `perCustomerLimit`, `minOrder`, `used` (locked; the engine counts it). Form sections `Percentage` / `Amount off` carry
  `showIf` on the type. Applies-to (categories, products) is gone.
- Engine: `pricing.ts` reads percentOff/amountOff (falls back to the old `value`), caps a percentage at maxDiscount, refuses
  an inactive coupon, and enforces the per-customer limit by customer, phone or email (`QuoteInput.who` from website orders).
- `upgradeStores.js`: adds the new fields, renews labels, drops value/active/appliesTo/categories/products after moving
  each coupon's value into percentOff/amountOff and active into status. Smokes: commerce-orders (cap, inactive, minimum),
  commerce-website-orders (per-customer limit).

## 2026-10-30 — Product type
- Product gets `productType` (Simple / With variations; default Simple). The product form is laid out in sections; **Variations** (the options) shows only when the type is With variations. A Simple product is one item whatever options it still carries (`syncVariants`). `upgradeStores.js` adds the field, lays the page out in sections, and gives existing products a type (With variations when they have options). Smoke: commerce-stock.

## 2026-10-30 — Variant's product picker
- A model field can carry `optionFilters` and `pickerDetails` (builder Joi + settings). The Variant's **Product** picker offers only products set to With variations, and shows SKU and barcode under each name; typing searches name, SKU and barcode (the product's searchable fields). `upgradeStores.js` renews it on existing stores (only where the field has neither set).

## 2026-10-30 — EC-27 The store's home dashboard
- New widget type `actions` (quick-action buttons to the project's own pages; dashboard.controller + tenant `ActionsWidget`).
  A new store gets a dashboard when it's built: Quick actions (New sale, Add a product, Website orders, Orders, Stock,
  Customers), Sales today / 30 days and Orders / Average order against the period before, New website orders, Unpaid, Returns,
  a Sales bar chart, Orders by origin and by stage, the latest orders. `upgradeStores.js` gives it to a built store that has
  no dashboard of its own; one someone built is left alone. `library/functions/commerce/dashboard.ts`.

## 2026-10-30 — Couriers get their own plan

- The user asked for the full courier plan (Steadfast, Pathao, RedX and more;
  Store settings → connect, test; send from orders; a Delivery model linked to
  the order; webhooks). EC-18 / EC20 move to `backend/docs/couriers/`
  (CR-01…CR-17).
