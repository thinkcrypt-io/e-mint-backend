# E-commerce projects — overview

**Start here.** This folder is the plan for the **E-commerce** project type in
the tenant panel: a project kind that sets itself up through a wizard with
products, variants, stock per outlet, orders, a built-in POS, payments,
returns (full and partial) and refunds — all pre-built, while the project stays
a normal MINT project where people build and link their own models. Read this
file, then `WORK_ORDERS.md`; every step is logged in `CHANGELOG.md`.

## 1. The user's words (2026-10-28)

> on the tenant add a category called e-commerce, where all the ecommerce stuff
> will be automatically set up, should have a setup wizard, what payment
> options we want to integrate, ecommerce will have products/orders/pos, have
> the pos page built in, also in wizard should ask like do we want to have
> product variations, the pos will be set up that way. also product return,
> payments, partial return, refund everything must be there built in, then
> models can be built and connected too but those are the ones needed to be
> pre built in ecommerce type

Answers to the first questions (same day):

| Question | The user's choice |
|---|---|
| How do the pre-built models work? | **Builder models with core fields locked** — normal project models (tables, forms, detail pages, public API, automations, PDF templates); people add fields and link their own models; the fields the engine relies on can't be deleted, renamed or retyped. |
| Stock | **Outlets from day one** — every outlet/warehouse has its own stock; the POS sells from its outlet; transfers between outlets. |
| Online store | **Admin + POS only.** The storefront is not part of this type (a website project can connect later — EC-16). |
| POS extras in the first release | **All four:** barcodes + printed receipts; discounts, coupons, tax; register shifts; held sales + store credit. |

## 2. Decisions

| # | Decision |
|---|---|
| EC1 | `ecommerce` is a fourth project type beside `app`, `website`, `api` (`PROJECT_TYPES`). It is an **app** in every other respect (model builder, pages, sidebar, automations, PDF templates, public API, MCP) — code that branches on `type === 'app'` must treat `ecommerce` the same unless it says otherwise (`isAppLike(type)`). |
| EC2 | A new e-commerce project opens on the **setup wizard** until it is set up; the answers live in one `CommerceSettings` doc per project (tenantScoped, fixed schema, like `WebsiteSettings`). Every answer can be changed later on **Store settings**. |
| EC3 | The pre-built models are **builder models made from a blueprint in code** (`library/functions/commerce/blueprint.ts`), built with the template engine (`applyTemplate`'s build path, one plan, background, progress polled). **Every store gets every model** (EC-03): the answers choose what the sidebar shows and how the engine behaves, so turning a feature on later is a switch, never a rebuild; turning one off is refused while it holds what it made (several variants, store credit, an open shift). |
| EC4 | **Core fields are locked** (`ModelDefinition.system = 'commerce'`, `systemFields[]`): the builder refuses to delete, rename or change the kind of a core field, or delete a core model; people may add fields, tabs, links, rules, automations. Labels, help text, column order and form layout stay editable. |
| EC5 | **Engine-owned fields** (stock on hand, order totals, paid / refunded amounts, payment status, returned quantities, credit balances, shift totals) are **written only by the commerce engine**. The generic form shows them read-only; the generic CRUD and public API refuse writes to them (403 `commerce_field`). Money and stock never move through a plain record save. |
| EC6 | **The server owns every number** (as widgets WD5): the POS sends variant ids, quantities, coupon codes, discount *requests* and tenders; prices, tax, discounts, totals, change and refund amounts are worked out server-side. |
| EC7 | **Every product sells through a variant.** Variations off: each product has one hidden default variant (made and kept in step by the engine), so orders, stock, returns and barcodes have one path. Variations on: the product's options (Size, Colour…) generate the variant matrix; each variant has its own SKU, barcode, price, cost and stock. |
| EC8 | **Stock is per variant per outlet** (`Stock levels`: variant × outlet, unique). Every change is a `Stock movement` (sale, return, adjustment, count, transfer out/in, receive, cancel) with a reference — the levels are never edited by hand. Selling below zero is a setting per project (default: refused at the POS with "only N left at this outlet"). |
| EC9 | **One payments ledger.** `Payments` holds money in and out: `type` payment or refund, method, amount, reference, outlet, shift. An order's paid, refunded and balance are rollups of its payments; its payment status follows (unpaid / partially paid / paid / partially refunded / refunded). The sidebar shows Payments and a filtered Refunds view of the same model. |
| EC10 | **Returns are per line and per quantity.** A line can be returned up to sold − already returned; each returned line says why, its condition, and whether it goes back to stock (default from settings) and to which outlet. The refund is worked out per line from what was actually paid for it (its share of order discounts and coupon, tax included as charged). |
| EC11 | **Refund methods:** to the original method (gateway refund through Stripe / SSLCommerz / bKash when the payment was online; cash from the open shift for cash), cash, store credit, or other manual method. Allowed methods and the return window are settings. A return can be refunded in parts and closed. Exchanges are a return whose credit pays for a new sale in the same POS checkout. |
| EC12 | **Payment options** in the wizard: in-store tenders (cash, card on terminal, mobile wallet by reference — bKash / Nagad / Rocket by the org's country —, bank transfer, store credit, custom named methods) and online gateways (Stripe; SSLCommerz and bKash for BD), offered by the organization's country as the widgets already do. Gateway keys reuse `SitePaymentSettings` (one place for a project's merchant accounts). With no storefront, online gateways are used for **pay-by-link** on orders and for **gateway refunds**. |
| EC13 | **Registers and shifts.** A POS sale needs an open shift on a register at an outlet (when shifts are on). A shift records opening float, cash in/out, sales and refunds by method, expected cash, counted cash, difference; closing prints a Z-report. |
| EC14 | **Held sales** are orders with status `held` (no separate model), listed in the POS's Held drawer per outlet; they reserve nothing. |
| EC15 | **Store credit** is a ledger model (`Store credit`: customer, ±amount, reason, reference); the customer's balance is its rollup. Store credit is a tender at the POS and a refund method. |
| EC16 | **Receipts print from the browser** (80 mm thermal or A4 CSS, with the order's barcode for returns); invoices and credit notes are PDF templates (docs/pdf-templates) installed with the project. |
| EC17 | **Engine writes use compensation, not transactions** (as Linked Relationships, D15/D18): stock `$inc` with a floor in the filter; on a later failure, the steps already done are undone and the sale is refused. Every engine action writes record history as the person who did it. |
| EC19 | **Orders have their own pages** (the user, 2026-10-28): the Orders table and the order record page are custom pages in the panel, not the builder's generic table and detail page. The table: number, date, customer, channel, outlet, items, total, payment and fulfilment badges, quick filters (today, unpaid, to ship, returns) and row actions. The order page is a detailed view: lines with variant, SKU, returned quantities; totals breakdown (discounts, coupon, tax, shipping, paid, refunded, balance); customer and delivery address; payments and refunds; returns; delivery and courier tracking; stock movements; timeline; actions. Fields people add to Orders show in an "More details" card, so the model stays extendable. |
| EC20 | **Couriers** — *superseded 2026-10-30 by docs/couriers (CR1–CR17): deliveries are their own model linked to the order; the order's courier section is a summary of the current delivery.* (the user, 2026-10-28): when a courier is connected, an order page has **Send to courier** — the parcel is booked with the courier's API (recipient, phone, address, COD = the balance due, note), the consignment / tracking number and status are stored on the order and refreshed (webhook where the courier offers one, else on open and on a schedule). Steadfast first, then Pathao and RedX (BD, by the org's country, as gateways are); credentials sealed per project. Delivered with COD collected writes a payment (method `courier-cod`). |
| EC21 | **Categories per channel** (the user, 2026-10-28): a category has a Status and an Order on the POS and on the website — inactive isn't shown there, a higher order shows first — a web address made from its name when left empty (unique: a taken one gets -2, typed or not) and more images. The POS reads `GET /commerce/categories`; the website rule is a filter + sort on the Categories list endpoint, editable like any other. Built stores are brought up to the blueprint by `upgradeStore`. |
| EC18 | **Roles:** Owner (everything), Store manager (all outlets or theirs, returns, refunds, stock, reports), Cashier (POS at their outlets: sell, hold, returns within limits, no refunds above a limit without a manager PIN — EC-12). Built on project roles (WO-50). |

## 3. The pre-built models

Routes are checked against taken routes when built (a taken route gets a
suffix, as templates do; `customers` and `payments` are the project API's
own paths, hence `store-customers` and `order-payments`). The engine finds
each model by what the installer recorded, never by a fixed route. ★ = core field (locked, EC4); ⚙ = engine-owned
(read-only, EC5). Models marked *(opt)* are built only when the answer turns
them on.

| Model | Route | Core fields | Notes |
|---|---|---|---|
| Outlets | `outlets` | ★name, ★code, ★kind (store / warehouse), ★active, address, phone, receipt header/footer | at least one (wizard) |
| Categories | `categories` | ★name, ★slug (web address, from the name), ★parent, ★status on POS, ★status on website, ★order on POS, ★order on website, image, images | EC21: inactive = not shown there; higher order first |
| Brands *(opt)* | `brands` | ★name, logo | |
| Products | `products` | ★name, ★status (active / draft / archived), ★category, brand, description, images, ★price, cost, ★tax rate, ★track stock, ★options (Size: S,M,L…) *(variations)*, ⚙total stock | price = default for its variants |
| Variants | `variants` | ★product, ★title, ★options, ★sku, ★barcode, ★price, compare-at price, cost, ★active, ⚙default | hidden page when variations are off |
| Stock levels | `stock` | ★variant, ★outlet, ⚙on hand, reorder point | unique variant × outlet |
| Stock movements | `stock-movements` | ⚙variant, ⚙outlet, ⚙change, ⚙reason, ⚙reference, ⚙by | engine-only log |
| Stock adjustments | `stock-adjustments` | ★outlet, ★reason (damage / count / found / other), ★lines (variant, change or counted), ★status (draft / applied) | applying writes movements |
| Stock transfers | `stock-transfers` | ★from, ★to, ★lines, ★status (draft / sent / received / cancelled) | send = out, receive = in |
| Customers | `store-customers` | ★name, ★phone, ★email, address, ⚙store credit, ⚙orders count, ⚙spent | |
| Orders | `orders` | ⚙courier (provider, consignment, tracking, status, booked at), ⚙number, ★channel (pos / manual), ★outlet, ★customer, ⚙items, ⚙subtotal, ⚙discount, ★coupon, ⚙tax, shipping, ⚙total, ⚙paid, ⚙refunded, ⚙balance, ⚙payment status, ★status (held / open / completed / cancelled), ★fulfilment *(manual orders)*, register, shift, cashier, note | items = section list: variant, name, sku, qty, unit price, discount, tax, total, ⚙returned |
| Payments | `order-payments` | ⚙order, ⚙type (payment / refund), ⚙method, ⚙amount, reference, ⚙status (pending / completed / failed), ⚙gateway ref, shift, return, ⚙by | ledger (EC9) |
| Returns | `returns` | ⚙number, ★order, ⚙customer, ★outlet, ★lines (order line, qty, reason, condition, restock), ⚙refund due, ⚙refunded, ★status (requested / approved / received / refunded / rejected / closed) | (EC10) |
| Store credit *(opt)* | `store-credit` | ⚙customer, ⚙amount ±, ⚙reason, ⚙reference | (EC15) |
| Coupons *(opt)* | `coupons` | ★code, ★type (percent / fixed), ★value, min order, starts, ends, usage limit, ⚙used, applies to (all / categories / products), ★active | |
| Tax rates *(opt)* | `tax-rates` | ★name, ★rate %, ★default | inclusive vs added is a store setting |
| Registers *(opt)* | `registers` | ★name, ★outlet, ★active | |
| Shifts *(opt)* | `shifts` | ⚙register, ⚙outlet, ⚙opened by/at, ⚙opening float, ⚙cash moves, ⚙totals by method, ⚙expected, counted, ⚙difference, ⚙status | (EC13) |

Sidebar: one **E-commerce** category — POS, Orders, Returns, Payments, Refunds,
Products, Variants, Categories, Customers, Stock, Transfers, Adjustments,
Coupons, Shifts, Outlets, Store settings. Models a person builds go in their
own categories as now and may link to any of these.

## 4. The engine (`library/functions/commerce/`)

| File | Does |
|---|---|
| `settings.ts` | `CommerceSettings` read/save, validation, what the answers turn on |
| `blueprint.ts` | the models, pages, sidebar, roles, dashboard and PDF templates for a set of answers |
| `install.ts` | first build (background, progress) and later additive changes (turning a feature on); refuses turning one off while it has records |
| `locks.ts` | core-field and engine-field guards used by the builder, generic CRUD and public API |
| `catalogue.ts` | default variants, option matrix → variants, barcode/SKU lookup, sellable check |
| `stock.ts` | `move(variant, outlet, change, reason, ref)` with floor; adjustments, counts, transfers; compensation |
| `pricing.ts` | lines → discounts, coupon, tax (inclusive / added), rounding by currency; one function the POS quote, the sale and returns all use |
| `orders.ts` | quote, sale (POS), manual order, hold / resume, cancel, order numbers per outlet prefix |
| `payments.ts` | tenders (split, change), payment status, pay-by-link through the project's gateways, store credit |
| `returns.ts` | returnable lines, refund split, restock, refund by method (gateway / cash / credit), exchange |
| `shifts.ts` | open, cash in/out, close, Z-report |
| `reports.ts` | sales by day / outlet / cashier / method, top products, low stock |

API: `/tenant/api/p/:project/commerce/*` (panel) — settings, install status,
quote, sale, hold, resume, orders/:id/pay, orders/:id/cancel, returns,
returns/:id/refund, stock/adjust, stock/transfer, shifts/*, reports/*,
lookup?code= (barcode / SKU). Public API keeps the generic per-model endpoints;
engine fields are read-only there (EC5).

## 5. The panel (mint-tenant)

- **New project → E-commerce** card (beside App / Website / API).
- **Setup wizard** `/<project>/store-setup` — 8 steps, each with a #anchor guide link: Store (name, currency from
  the org's country, order number prefix, selling below zero), Outlets (one or more, store / warehouse), Products
  (variations on/off + option names, brands, barcodes/SKUs, track stock by default), Payments (in-store tenders,
  online gateways by country — keys can be added later), Returns & refunds (allowed, window in days, partial,
  restock by default, refund methods, store credit), Delivery (manual / phone orders with shipping, shipping
  rates, couriers by country — Steadfast, Pathao, RedX — keys can be added later), POS (receipt size + header/footer, shifts and registers,
  held sales, discounts and coupons, tax mode + rates, customer required), Review → **Set up my store** (background
  build with progress, then the dashboard).
- **POS** `/<project>/pos` — full screen: outlet / register / shift; product grid by category, search, barcode
  scanner input; variant picker; cart with line and order discounts, coupon, tax; customer search / quick add,
  store credit shown; Hold / Held sales; Pay (split tenders, cash change, store credit, card / wallet references);
  receipt print; **Return** mode (scan the receipt barcode or find the order, pick lines and quantities, reason,
  restock, refund method; exchange carries the credit into a new sale); close shift with cash count.
- **Orders table** (custom, EC19) and **order page** (custom, detailed): actions Take payment, Send payment link,
  **Send to courier** (when a courier is connected, EC20), Mark fulfilled, Return items, Refund, Cancel, Print
  receipt / invoice / delivery label; sections Lines, Totals, Customer & delivery, Payments, Returns, Delivery
  tracking, Stock movements, More details (fields people added), Timeline.
- **Store settings** — the wizard's answers, editable; turning a feature on builds its models.
- Dashboard widgets for a new store: today's sales, sales by outlet and method, top products, low stock, open shifts.

## 6. Out of scope for now (later WOs)

Storefront / website connection (EC-16), suppliers and purchase orders (EC-14),
offline POS (EC-15), loyalty points (EC-17), gift cards, multi-currency per outlet.
