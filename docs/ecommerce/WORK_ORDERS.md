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
| EC-06 | Orders engine: pricing (discounts, coupons, tax), sale, manual order, hold / resume, cancel, payments ledger, split tenders, store credit, order numbers | backend | L | next |
| EC-07 | POS page: outlet / register / shift, grid, search, barcode, variants, cart, customer, discounts, hold, pay, receipt print | mint-tenant | L | |
| EC-08 | Returns & refunds engine: per-line partial returns, window, restock, refund split, refund by method incl. gateway refunds (Stripe / SSLCommerz / bKash), exchange | backend | L | |
| EC-09 | Custom Orders table + detailed order page (EC19); returns in the panel: order actions, Returns page, POS Return mode, credit note | backend + mint-tenant | L | |
| EC-10 | Pay-by-link for orders through the project's gateways | backend + mint-tenant | M | |
| EC-11 | Shifts (open / cash in-out / close / Z-report) + reports + dashboard widgets | backend + mint-tenant | M | |
| EC-12 | Roles: Owner / Store manager / Cashier, outlet assignment, manager PIN over limits | backend + mint-tenant | M | |
| EC-13 | Docs, website, MCP (`describe_store`, product / stock tools) | all | M | |
| EC-14 | Suppliers + purchase orders + receiving | | L | later |
| EC-15 | Offline POS | | L | later |
| EC-16 | Connect a website project's shop / checkout to this store's products, stock and orders | | L | later |
| EC-17 | Loyalty points | | M | later |
| EC-18 | Couriers (EC20): Delivery step + settings, Send to courier on the order page, tracking sync, COD payment; Steadfast, then Pathao, RedX | backend + mint-tenant | L | after EC-09 |

## Handoff

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
