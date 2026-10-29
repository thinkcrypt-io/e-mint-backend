# E-commerce projects — work orders

Plan: `README.md`. Log: `CHANGELOG.md`. Sizes: S (an afternoon), M (a day),
L (2–3 days). Commit and push each WO when it's done (backend → `mint` v3;
mint-tenant and admin → `origin` main; mint-docs and mint-webpage → `origin`
main), then go on. Each WO updates the guide (mint-docs, #anchors on every
wizard step and dialog) and the marketing website as it lands.

## Status

| WO | Title | Repo | Size | Status |
|---|---|---|---|---|
| EC-01 | Plan & docs | backend | S | done 2026-10-28 |
| EC-02 | `ecommerce` project type + `CommerceSettings` + settings API | backend + mint-tenant | M | done 2026-10-28 |
| EC-03 | Blueprint + installer (models from answers, sidebar) + core / engine field locks | backend | L | done 2026-10-28 |
| EC-04 | Setup wizard + Store settings page (New project card, 8 steps, background build) | mint-tenant + mint-docs | L | done 2026-10-28 |
| EC-05 | Catalogue + stock engine: default variants, option matrix, barcode lookup, stock per outlet, adjustments, counts, transfers | backend + mint-tenant | L | done 2026-10-28 |
| EC-06 | Orders engine: pricing (discounts, coupons, tax), sale, manual order, hold / resume, cancel, payments ledger, split tenders, store credit, order numbers | backend | L | done |
| EC-07 | POS page: outlet / register / shift, grid, search, barcode, variants, cart, customer, discounts, hold, pay, receipt print | mint-tenant | L | done |
| EC-08 | Returns & refunds engine: per-line partial returns, window, restock, refund split, refund by method incl. gateway refunds (Stripe / SSLCommerz / bKash), exchange | backend + mint-tenant | L | engine + Return items dialog done 2026-10-29 — gateway refunds, exchange and the POS Return mode still to do |
| EC-09 | Custom Orders table + detailed order page (EC19); returns in the panel: order actions, Returns page, POS Return mode, credit note | backend + mint-tenant | L | done 2026-10-28 — Return items, refunds, POS Return mode and credit note wait for EC-08 |
| EC-10 | Pay-by-link for orders through the project's gateways | backend + mint-tenant | M | |
| EC-11 | Shifts (open / cash in-out / close / Z-report) + reports + dashboard widgets | backend + mint-tenant | M | |
| EC-12 | Roles: Owner / Store manager / Cashier, outlet assignment, manager PIN over limits | backend + mint-tenant | M | |
| EC-13 | Docs, website, MCP (`describe_store`, product / stock tools) | all | M | |
| EC-13a | MCP: `store_stock`, `sync_variants`, `set_stock` (through the engine); `create_records` keeps to the store's rules and makes products' variants | backend | S | done 2026-10-28 |
| EC-14 | Suppliers + purchase orders + receiving | | L | later |
| EC-15 | Offline POS | | L | later |
| EC-16 | Connect a website project's shop / checkout to this store's products, stock and orders | | L | later |
| EC-16a | First storefront pieces: Store → Guest checkout on your website, `GET /public/api/store`, a variant's image | backend + mint-tenant + mint-docs | S | done 2026-10-28 |
| EC-17 | Loyalty points | | M | later |
| EC-18 | Couriers (EC20): Delivery step + settings, Send to courier on the order page, tracking sync, COD payment; Steadfast, then Pathao, RedX | backend + mint-tenant | L | after EC-09 |
| EC-21 | Categories (EC21), form in sections (POS / Website configuration): web address (slug, made from the name, -2 when taken), status and order on the POS and the website, more images; POS category bar; website rule on the list endpoint; `upgradeStores.js` for stores built before | backend + mint-tenant + mint-docs + live-fresh | M | done 2026-10-28 |
| EC-22 | A store's site kit (Pages, SEO, Contents), SEO on Products / Categories, Site menu, site setup for stores | backend + mint-tenant | M | done 2026-10-29 |
| EC-23 | Website orders on the Order model: `channel` gains `website`; `POST /public/api/store/orders` places them through the engine (priced and stocked by the store); website fields (email, slot, payment method) | backend | L | done 2026-10-29 |
| EC-24 | Website orders page (`/store/website-orders`): own table + order view with address, area, slot, contact, payment, courier; POS Orders shows POS and phone orders only | backend + mint-tenant | L | done 2026-10-29 |
| EC-25 | Cut over Verte / Live Fresh: copy Online orders into Orders (`channel: website`), storefront checkout, track and my-orders read Orders; Online orders model retired | backend + live-fresh | M | planned |

## Handoff

- **2026-10-28 — EC-21 done** (CHANGELOG). The user: the wizard's Category model must be advanced, and existing stores
  updated. Blueprint Categories: name, ★slug (`uid` from name, "Web address"), parent, ★posStatus / ★webStatus
  (active / inactive), ★sortOrder ("Order on POS") / ★webOrder — **higher first now** (was lowest first) — image,
  images. Slug kind everywhere: a typed address that's taken now gets -2, -3 instead of a 400 (`freeUid` in
  dynamicModels; `constructConfig` EXIST_OPTIONS skips `slug` fields so the pre-save duplicate check doesn't refuse).
  POS: `GET /commerce/categories` (`posCategories`). Website: a commerce model with webStatus / webOrder gets a list
  endpoint filter `webStatus not inactive` + sort `-webOrder,name` when made (`listDefaultsOf` in apiEndpoints).
  `commerce/upgrade.ts` `upgradeStore` = generic "bring a built store up to the blueprint" (adds missing fields in
  blueprint order, renews old MINT labels, locks new core fields, category fill-in incl. turning the old ascending
  order round so it's kept). `scripts/upgradeStores.js` (dry run / `--apply`) — run on prod for Verte 2026-10-28.
  Smoke `commerce-categories.mjs` (22) + `cms-single.mjs` updated. Live Fresh sorts `-webOrder,name`.

- **2026-10-28 — EC-09 done** (CHANGELOG; ahead of EC-08 — the user found Store → Orders 404ing). Backend
  `commerce/lists.ts`: `listOrders` (views all / today / unpaid / to-ship / returns / cancelled, each counted with the same
  search and filters; parts joined with `$and` so a view's status can't undo "never held"), `listReturns`, `returnDetail`,
  `moveReturn` (`RETURN_NEXT`: requested → approved | rejected, approved → received | rejected, refunded | rejected →
  closed — *refunded* is only ever set by EC-08's engine), `extraFields(store, key, record)` (fields people added = model
  fields minus the blueprint step's, the "More details" card; `orderDetail` returns it as `extra`). Returns are off when
  `answers.returns.allowed` is false even though the model is built (404 `returns_off`). Routes `GET /commerce/orders`,
  `GET /commerce/returns[/:id]`, `POST /commerce/returns/:id/status`. mint-tenant `commerce/orders/` (`common.tsx` badges +
  `storeRoutes`, `OrdersPage`, `OrderPage` with Take payment (PayDialog), Fulfil menu, Cancel (PromptDialog + reason), Print
  receipt, a disabled Return items, timeline built from the order's own records; `ReturnsPage`, `ReturnPage` with the status
  bar); `app/store/{orders,returns}[/[id]]`; `StoreRecordPage` sends order / return record links to them. EC-08: make
  `Return items` work from `OrderPage` and set `refunded`; the Returns page already reads `payments` by `returnRef` and
  movements by the return's code. Smoke `commerce-lists.mjs` (32 checks; inserts a return in the scratch DB until EC-08).
- **2026-10-28 — EC-13a + EC-16a done** (CHANGELOG; a side session, for the Live Fresh demo storefront on Verte).
  `controllers/mcp/store.tools.ts` (`only: 'ecommerce'`): `store_stock` (data), `sync_variants`, `set_stock` (build) call
  `syncVariants` / `setStock`, so each change is a movement by "<owner> (AI)"; `set_stock` resolves everything first.
  `locks.ts` `commerceWriter(project, route)` = the guard's rules for writers outside the routes; `create_records` runs it
  per record and fires `fireCommerce` after saving (variants follow products made over MCP — before, they never got any).
  `store.guestCheckout` (default on) in Store settings + mint-tenant switch; `GET /public/api/store` (currency,
  guestCheckout, negativeStock, variations, delivery rates). Variant `image` field in the blueprint — existing stores get it
  by adding the field to their Variants model. Smoke `commerce-mcp.mjs`. Checkout itself (EC-16 proper) waits on the
  user's choice: through the engine (online orders = store orders, SSLCommerz via SitePaymentSettings) or storefront-only.

- **2026-10-28 — EC-07 done** (CHANGELOG). mint-tenant `app/store/pos/page.tsx` (Layout `type='pos'` + `fullBleed`) and
  `components/library/commerce/pos/`: `Pos.tsx` (register picker remembered per project in localStorage → open-shift
  screen → `Till`: catalogue grid + category chips + scan box (Enter = `lookup`, else the one match), basket, customer /
  variant / discount / held / receipt dialogs; every figure from `POST /commerce/quote`, debounced), `pay.tsx` (split
  tenders; cash sends what was handed over, the server trims it and works out change), `shift.tsx` (`OpenShift`,
  `ShiftDialog`: summary, cash in / out, close with count), `receipt.ts` (`receiptHtml` for the preview iframe and
  `printReceipt` through a hidden frame; 80 mm / A4). Hooks in `commerceApi.ts` (POS, orders, shifts — EC-09 uses the
  order ones). Backend: `storeOf()` now calls `syncDynamicModels()` (after a restart `/commerce/*` was called before any
  model route had compiled the project's models → "The store's outlet model is missing"); held list carries
  `customerInfo`; a shift's `sales` counts orders. Receipts show the order number — no barcode yet (EC-09's POS Return
  mode may add one). Guide: mint-docs `/store#store-selling`.
- **2026-10-28 — EC-06 done** (CHANGELOG). Backend only. `commerce/pricing.ts` (`quote()` — the one calculation:
  line discount → coupon share → order-discount share → tax inclusive / added, rounded per currency; `problems`
  stop a sale), `payments.ts` (`tendersOf`, `checkPayments` — only cash over, change worked out; `settleOrder` works
  paid / refunded / balance / payment status out of the ledger; `moveCredit` atomic with a floor), `shifts.ts`
  (open / cash in-out / summary / close), `orders.ts` (`sale`, `createManual`, `hold` / `listHeld` / `discardHeld`,
  `pay`, `fulfil`, `cancel`, `orderDetail`, `posSetup`). Writes go coupon → stock (`moveAll`) → credit → payments and
  are undone newest first (`stock.undoMoves`); the order is made first for its code and deleted on failure, so a
  failed sale leaves a gap in the numbers. Order numbers are the model's code (store prefix), not per outlet yet.
  Routes in `commerce.router.ts` (`/pos/setup`, `/quote`, `/sales`, `/orders`, `/held`, `/orders/:id[/pay|fulfil|cancel]`,
  `/shifts…`). EC-07 builds the POS on these; resume = load the held order's lines, sell with `heldId`.
- **2026-10-28 — EC-05 done** (CHANGELOG). Engine: `commerce/store.ts` (`storeOf()` → answers + `M(key)` compiled
  models; `roundFor`, `itemName`), `catalogue.ts` (`syncVariants`, `codeTaken`, `lookup`, `catalogue`, `itemView`),
  `stock.ts` (`move` / `moveAll` with the floor and compensation, `setStock`, `productStock`, `applyAdjustment`,
  `transferAction`), `hooks.ts` (`fireCommerce` from recordHistory on every save). Panel: `commerce/stock.tsx`
  (`ProductStock`, `ItemPicker`, `StockLines`), `StoreRecordPage.tsx` (the view page routes store records there).
  EC-06 must sell through `moveAll` (reason `sale`, reference the order code) and price with `itemView().price`.
- **2026-10-28 — EC-04 done** (CHANGELOG). mint-tenant `components/library/commerce/`: `sections.tsx` (one editor per
  section, shared by the wizard and Store settings), `StoreSetup.tsx` (`/store/setup`), `StoreSettings.tsx`
  (`/store/settings`, behind `StoreGate`). mint-docs `/store` guide (anchors `store-*`). The marketing website wasn't
  touched (another session had uncommitted work in its changelog/features) — EC-13 adds the store there.
- **2026-10-28 — EC-03 done** (CHANGELOG). `commerce/blueprint.ts` (18 models, `engine` / `engineOnly` / `ownPage`
  per model), `install.ts` (`POST /commerce/setup` → background build, `installed` by key, sidebar, seed outlets /
  tax rates / registers; `settingsGuard` + `afterSettingsSaved` on Store settings), `locks.ts` (`commerceGuard` before
  the built models). `ModelDefinition.system` + `systemFields`; `systemProblems` in `updateModelCore`;
  `deleteModelCore({ system })`. Engine code finds models through `CommerceSettings.installed[key].name` →
  `compiledModel`, never a fixed route. Roles and dashboard moved to EC-12 / EC-11.
- **2026-10-28 — EC-02 done** (CHANGELOG). `ecommerce` is a project type; `CommerceSettings` + `functions/commerce/settings.ts`
  (answers by section, each checked on its own, offered by the org's country); `/commerce/settings`; the sidebar's Store
  section (`tenantLead`); mint-tenant: New project → E-commerce opens `/store/setup` (stub until EC-04), a store's
  dashboard redirects there until it's ready (`StoreGate`), `commerceApi.ts`. Panel work is mint-tenant only (admin's
  tenant build doesn't get the store).
- Dev: private backend from `git archive HEAD` + changed files (other sessions share the tree), own port and Mongo
  (not 5011 / 27998 — see the parallel-sessions note); panel launch config for mint-tenant pointed at it.
- Smoke: `scripts/tenancy-smoke/commerce-*.mjs` (one per engine WO), added to `run-all.sh`.

## EC-02 — Project type + settings (M)

- `PROJECT_TYPES` gains `ecommerce`; `isAppLike(type)` helper; every `type === 'app'` branch in backend
  (projects router, templates gallery, applyTemplate, MCP, widgets, siteConfig…) checked and switched to it.
- `CommerceSettings` (tenantScoped, one per project): `status` (new / building / ready / failed), answers
  (store, outlets[], products {variations, options[], brands, barcodes, trackStock}, payments {tenders[],
  custom[], gateways[]}, returns {allowed, windowDays, partial, restockDefault, refundMethods[], storeCredit},
  pos {receipt {size, header, footer}, shifts, held, discounts, coupons, tax {mode, rates[]}, customerRequired},
  negativeStock), `installed` (what's built: feature → model ids), timestamps.
- API `GET|PUT /commerce/settings` (manage-projects / build), validation with plain messages; tenders offered by
  the org's country (Country.paymentProviders + wallet list).
- `customers`, `payments` (and the commerce pages `pos`, `store-setup`, `store-settings`, `commerce`) join the
  tenant's reserved routes (`payments` was mounted but not reserved).
- Panel: New project offers **E-commerce**; a new store project's home redirects to `/store-setup` until ready
  (page stub; EC-04 builds it).
- Smoke `commerce-settings.mjs`.

## EC-03 — Blueprint + installer + locks (L)

- `blueprint.ts`: the §3 models as one feature plan for the answers; sidebar category E-commerce; roles
  (EC18, permissions only — limits in EC-12); dashboard; invoice + credit note PDF templates.
- `install.ts`: background build with the template engine, progress on `CommerceSettings.status`; re-run on a
  settings change builds only what's new; turning a feature off with records refuses with the count.
- `ModelDefinition.system` + `systemFields`; builder (model page, MCP `build_feature` / `update_page`) refuses
  delete / rename / retype of core fields and deleting core models — 409 with the reason; the panel shows a lock.
- Engine fields: read-only in forms, refused on generic create / update / bulk import / public API.
- Smoke `commerce-install.mjs`: every answer combination builds clean; locks hold over REST and MCP.

## EC-04 — Wizard + Store settings (L)

- `/store-setup`: the 7 steps of README §5, back / next, saved per step (leave and come back), Review, Set up
  with progress, failures shown with Try again. `/store-settings`: the same sections as cards, each saved on its
  own; turning on builds (progress inline); turning off says why it can't when it has records.
- Doc links on every step; mint-docs guide "Set up your store".

## EC-05 — Catalogue + stock (L)

- Default variant made / kept in step on product save (variations off); option matrix → variants (add missing,
  never delete sold ones — deactivate), SKU / barcode unique per project, `lookup?code=`.
- `stock.move` with floor (EC8) + movements; adjustment apply, stock count (counted → change), transfer send /
  receive / cancel; product total stock rollup; product page tab Stock by outlet.
- Smoke `commerce-stock.mjs` (concurrent sells never go below zero).

## EC-06 — Orders + payments engine (L)

- `pricing.quote`: line discounts (amount / %), order discount, coupon rules, tax inclusive / added per rate,
  rounding by currency minor units; the same function for sale and returns.
- `sale`: checks shift, stock, coupon, customer rules; writes order, stock moves, payments (split tenders, cash
  change), store credit use, coupon use — compensation on failure (EC17). Manual order (no shift), hold /
  resume / discard, cancel (restock + refund what was paid), order numbers per outlet prefix, atomic counter.
- Payments ledger rollups and payment status (EC9).
- Smoke `commerce-orders.mjs`.

## EC-07 — POS page (L)

- README §5 POS, keyboard first (F-keys, Enter to pay), barcode scanner as fast keyboard input, receipt print
  80 mm / A4 with the order barcode. Quote on every cart change (debounced), sale on Pay.
- Browser-checked end to end against the private backend.

## EC-08 — Returns + refunds engine (L)

- Returnable lines; per-line refund from what was paid (discount and coupon share, tax as charged); window;
  restock to an outlet or write off (movement reason `return-damaged` without stock); refund by method: cash
  (shift), store credit, manual, original — gateway refund APIs for Stripe (refunds), SSLCommerz (refund API)
  and bKash (refund) with status follow-up; partial refunds; exchange = return credit as a tender in a sale.
- Order: returned quantities, refunded, payment status; customer credit.
- Smoke `commerce-returns.mjs` (gateway refunds against the providers' sandboxes / the Stripe stub).

## EC-09 — Orders table, order page, returns in the panel (L)

- The user (2026-10-28): "the order record page should be custom also the order table", "on order page should have
  detailed order option". Custom `/orders` table and `/orders/<id>` page per README §5 / EC19 (the sidebar's Orders
  item and record links open them; the builder's generic pages stay reachable for nothing else). Backend
  `GET /commerce/orders` (list with filters, counts per quick filter) and `GET /commerce/orders/:id` (order +
  payments + returns + movements + courier + timeline in one call).
- Order page actions (Take payment, Return items, Refund, Cancel, Print); Returns page with status flow;
  POS Return mode and exchange; credit note print.

## EC-18 — Couriers (L)

- The user (2026-10-28): "option to send it to courier if courier is integrated". `CommerceSettings.delivery`
  (shipping on manual orders, rates, couriers[]); credentials sealed (`select: false`, as gateways).
- Adapters `library/functions/commerce/couriers/{steadfast,pathao,redx}.ts`: book, status, (cancel where offered);
  `Send to courier` dialog (recipient, phone, address, COD prefilled from the order's balance, note, weight / area
  where the courier needs it); consignment + tracking stored on the order; status refresh (webhook route for
  Steadfast, else on open + scheduled); delivered with COD writes a `courier-cod` payment; delivery label print.
- Smoke against each courier's sandbox where one exists, else a local stub.

## EC-10 — Pay-by-link (M)

- Order → Send payment link (email / copy) through the project's Stripe / SSLCommerz / bKash; paid → payment
  row + status; reuses `payments.function.ts` adapters and `SitePaymentSettings`.

## EC-11 — Shifts + reports (M)

- Open (float), cash in / out, close (count by denomination optional), Z-report print; reports by day /
  outlet / cashier / method, top products, low stock; dashboard widgets for new stores.

## EC-12 — Roles (M)

- Owner / Store manager / Cashier; staff ↔ outlets; cashier POS-only home; limits (discount %, refund amount)
  with manager PIN override, logged.

## EC-13 — Docs, website, MCP (M)

- mint-docs "E-commerce" section (wizard, POS, returns, refunds, stock, shifts, roles); marketing website
  section; MCP `describe_store`, product + stock tools (no sales or refunds over MCP).

## EC-23 — Website orders on the Order model (L)

- The user (2026-10-29): website orders and POS orders on **one** order model, with an origin (POS or website),
  shown in two separate tables, the website one a refined page with the address and everything needed.
- **Origin = `channel`** (already on Order): options become POS · Phone / by hand · **Website**. Label "Origin". Locked
  core field, so `upgradeStore` adds the option to built stores.
- New fields (website orders, all optional): `email`, `slot` (delivery time), `paymentMethod` (cod / sslcommerz / bkash…),
  `placedFrom` (storefront). `delivery` section gains `email`, `landmark`, `city`.
- **Placing**: `POST /public/api/store/orders` (project key, rate-limited; guest or signed-in customer, honouring
  Store → Guest checkout). Body = items (product, variant, qty), customer, delivery, slot, payment, coupon code. The store
  prices it (`quote`), checks stock and limits, creates the Order (`channel: website`, `status: open`,
  `fulfilment: unfulfilled`) and the stock movements through the engine — nothing from the browser is trusted.
  Reuses `createManual`'s delivery checks; the outlet is Store → **Website outlet** (a new setting).
- Order numbers: the same sequence (code prefix) — or `WEB-` when the user wants them apart (open question).
- Customer access: `/my/orders` and `/my/orders/:id` on `orders` (customer rule: email), `GET /store/orders/track`
  (id + phone), both returning only the fields a customer should see.
- Online payment (SSLCommerz) and coupons then plug into the same endpoint (EC-10).

## EC-24 — Website orders page (L)

- `/store/website-orders` (sidebar: Store → Website orders), same engine as the Orders page (EC-09) with `channel =
  website` fixed; POS Orders hides website orders (`channel in pos, manual`). Quick views: New (unconfirmed) · To pack ·
  Out for delivery · Delivered · Unpaid · Cancelled, each counted.
- Table: order no., placed (relative + exact), customer + phone, area, items, total, payment, status, courier. Search
  by number, name, phone, address. Filters: area, payment, status, date range.
- Order view: customer card (call / WhatsApp / email), delivery card (full address, landmark, area, slot, notes, map link),
  items, payment and timeline, courier (Send to courier), actions: Confirm, Pack, Out for delivery, Delivered, Take
  payment, Cancel, Print delivery slip / invoice. Status flow adds **Confirmed** between New and Packed.

## EC-25 — Cut over Verte and Live Fresh (M)

- Script `scripts/webOrdersToOrders.js` (dry run, `--apply`): each Online order becomes an Order (`channel: website`,
  items, address, area, slot from the note, totals, status mapped new → open/unfulfilled, confirmed, out_for_delivery →
  shipped, delivered, cancelled), keeping its code (`WO-0001`) and date; stock is not touched for orders already handled.
- Live Fresh: `/api/checkout` posts to `POST /public/api/store/orders`; track, order page and account read Orders.
- The Online orders model and its "take as store order" step are hidden, then removed once nothing reads them.

**EC-23 decisions (the user, 2026-10-29):** stock comes out when the website order is placed (and goes back when it's
cancelled — and when items are returned: EC-08 must restock, the user asked for it twice); Verte's existing Online orders
are copied into Orders (EC-25); website orders are numbered WEB-00001 apart from POS orders. Built: `createWebsite`,
`trackWebsite`, `publicOrder` in `commerce/orders.ts`; `POST /public/api/store/orders`, `GET /public/api/store/orders/:id?phone=`;
the website outlet is the store's first active outlet of kind store (a setting later); `$locals.code` on a document wins
over the model's own sequence (dynamicModels); `upgradeStore` adds select options and section fields. Smoke
`commerce-website-orders.mjs` (14).
