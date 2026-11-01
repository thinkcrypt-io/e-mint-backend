# Discounts and collections — plan (EC-41…EC-47)

Part of the E-commerce plan (`README.md`), built the way tax was (`TAX_AUTOMATIONS.md`): the store's behaviour is
**system automations** the owner can see, switch off and trace in Automations → Runs. Status rows live in
`WORK_ORDERS.md`; every step is logged in `CHANGELOG.md`.

## 1. The user's words (2026-11-02)

> Like Tax, we need a discount model. For example we can create a discount and apply to a category, product or
> collection. Also create a collection model, like categories but a collection can contain multiple products also a
> product can be a part of multiple collections like sale, featured etc. so if let's say discount is applied, should
> apply to products if it is applied to a category or collection, also discount can be applied to certain products.
> Discount must be a percentage, with active inactive status -> if status is inactive discount is reversed, also if
> made active reverse happens. Plan the discount properly, also the automations. Oh discounts can have a endDate.
> Also make an automation that products returns to original price, i mean discounts get deactivated after the endDate.

| # | When | Then |
|---|---|---|
| B1 | A discount (a percentage) is given to products, categories and/or collections | every product it reaches — named, in the category, in the collection — sells at the lower price; their variants too |
| B2 | A product is in **several** collections, a collection holds many products | Collections are many-to-many (Sale, Featured, New in…), unlike a product's one category |
| B3 | A discount is switched to **inactive** | its products go back to their price; switched to **active** again, they get it back |
| B4 | A discount has an **end date** | when it passes, the discount switches itself to inactive — prices go back (B3) |
| B5 | — | all of this is **automations** (system automations, as tax), in new stores (wizard) and built ones |

## 2. What is there already

| Piece | Where | Matters because |
|---|---|---|
| Products: Price, Compare-at price, Tax / VAT, `taxAdded` ⚙, Price after tax = `round(price * (1 + taxAdded / 100), 2)` | `commerce/blueprint.ts` | the discounted price must flow into Price after tax |
| Variants: own Price (empty = the product's), Tax / VAT always the product's | blueprint | variants must follow their product's discount |
| The till prices from `itemView` (variant price, else product price) → line discount → coupon → order discount → tax | `commerce/pricing.ts`, `catalogue.ts` | the POS, website orders and quotes must charge the discounted price, and the order line must say so |
| POS feature `discounts`: a cashier's line / order discount *requests* | `pricing.ts` | a different thing from these discounts — the names must not clash (DS12) |
| Coupons (EC-26): percent / amount off the order, no applies-to | blueprint | coupons and discounts meet on the same order (Q3) |
| Automations: events **create / update / delete** only; actions incl. `update` and `updateLinked` (EC-36, matches a `references` array too); system automations by `key`, on/off only | `automations.function.ts`, `automation.model.ts` | there is **no time trigger** — B4 needs one |
| Minute ticker for scheduled publishes (`scheduleContentTick`), courier sync every 15 min | `contentSchedule.function.ts`, `server.ts` | the pattern for B4's clock |
| Tax switched inactive → taken off, given back on active (`taxHeld`) | `commerce/taxStatus.ts` | the same "reverse" need — but see DS3: discounts recompute instead of remembering |
| A `references` field kind (many links, tag picker) | `dynamicModels.function.ts` | Product → Collections |
| No time zone anywhere (store or organization) | — | "ends on 5 Nov" needs one (DS9) |

## 3. Decisions (proposed — the ones to confirm are in §7)

| # | Decision |
|---|---|
| DS1 | **Price is never overwritten.** The price the owner types stays the original. A discount writes three engine fields (⚙, EC5) on the product and each of its variants: **Discount** (which one), **Discount %**, and **Sale price** = `round(price * (1 − discountPercent / 100), 2)`. Price after tax becomes `round(salePrice * (1 + taxAdded / 100), 2)`. Reversing = clearing them, so the product is back at exactly its price — even if someone changed the price during the sale, and with no rounding drift from dividing back. Compare-at price (the owner's own "was" price) is left alone; the website shows Price struck out when a discount is on. |
| DS2 | **The Discount model** (`discounts`, sidebar *E-commerce → Discounts*): ★Name ("Eid sale"), ★Percentage (more than 0, up to 100), ★Status (active / inactive), Starts (optional), Ends (optional), ★Products, ★Categories, ★Collections (three `references` fields — any mix, at least one filled), Include sub-categories (yes by default), ⚙Products reached (count), ⚙Ended (when the clock switched it off). Refused on save: Ends before Starts; Ends already past on a new or re-activated discount (DS8); nothing picked. |
| DS3 | **One rule decides a product's discount — worked out, not remembered.** For a product, the discounts that *reach* it are those that are active, started, not ended, and name it, its category (or a parent of it, when sub-categories are included) or one of its collections. **The biggest percentage wins; they never add up** (Q1). Every change — a discount saved, switched, deleted or ended, a product moved, a category re-parented — just works the affected products out again with this rule. So B3 "reverse" is exact: switch off a 20% sale and a product that is also in a 10% category drops to 10%, not to full price; switch it back on and it is 20% again. No held list is needed (unlike `taxHeld`). |
| DS4 | **Engine: `commerce/discounts.ts`** — `reachOf(store, discount)` (product ids it reaches), `bestFor(store, productIds)` (DS3 for many products at once: a few queries, not one per product), `applyDiscounts(store, productIds, actor)` (writes Discount / Discount % / Sale price on products and their variants, works formulas out — `recalculateFormulas`, a bare `doc.save()` runs none (see TAX_AUTOMATIONS G1) — a History entry *Store: discount “Eid sale”* from → to, skips products that don't change, batches of 200, no 5,000 cap). Every automation below calls this one function. |
| DS5 | **The store's discount automations** (system automations, `system: 'commerce'`, on/off only, Runs; one new store action `type: 'storeAction'`, `action: 'workOutDiscounts'`): **D1** *Discount saved → its products* — Discount created or updated, Status / Percentage / Starts / Ends / Products / Categories / Collections / sub-categories changed → work out the products it reaches now **and** the ones carrying it before. **D2** *Discount deleted → its products* — the products carrying it worked out again. **D3** *Product moved → its discount* — Product created, or its Category or Collections changed → that product worked out. **D4** *Category moved → its products' discount* — a Category's Parent changed → its products (and sub-categories') worked out. **D5** *Discount ends* — **On a date: Ends** → update this: Status = inactive, Ended = now (D1 then puts the prices back — B4 is two visible steps, each in Runs). **D6** *Discount starts* — On a date: Starts → work out its products (a discount saved active with a later start reaches nothing until then). |
| DS6 | **New generic trigger: "When a date is reached"** (`on: ['date']`, `dateField`, optional offset like "1 day before"). Any project can use it (a subscription's renewal date, a task's due date). Built like scheduled publishes: saving a record queues one `AutomationDue` job per date automation on that page (`automation`, `record`, `at`; re-queued when the date changes, dropped when cleared or the record is deleted); a minute ticker (`scheduleAutomationDue`, beside `scheduleContentTick`) claims due jobs with `findOneAndUpdate` (so two dynos never run one twice), runs the automation as event `date`, and catches up anything overdue after a restart. Turning a date automation on queues the page's future dates; off drops them. |
| DS7 | **Collections** (`collections`, sidebar *E-commerce → Collections*): ★Name, ★Web address (slug from the name, -2 when taken, as EC21), ★Status on POS / on website, ★Order on POS / on website (higher first), Description, Image, SEO. **Products gain ★Collections** (`references`, many). Membership is edited from both sides: the product form's Collections picker, and the collection page's **Products** tab with *Add products* / *Remove* (engine `$addToSet` / `$pull`, History on each product, D3 fires). The collection page also has a **Discounts** tab. Website: Collections list endpoint (EC21 rule: active, by order) and `?collections=<id>` on the Products list; POS: collections as chips beside the category bar (Q5). |
| DS8 | **Status and the end date agree.** Switching a discount to **active** whose end date has passed is refused: *“Eid sale ended on 5 Nov — move the end date to switch it on.”* (Q4). Switching to inactive by hand before the end keeps the end date; switched on again before it, it ends on time. |
| DS9 | **Store time zone.** Store settings gain **Time zone** (default from the organization's country: BD → Asia/Dhaka). An Ends picked as a date with no time means **the end of that day** in the store's time zone; Starts, the start of it. Stored as UTC instants; shown in the store's zone. |
| DS10 | **The till charges the sale price.** `itemView` gives Sale price when the item has a discount, and the line keeps what happened: `sale: { discount, name, percent, amount }` (per unit × qty) beside `unitPrice` (the original). Then the cashier's line discount, the coupon (Q3), the order discount and tax as now. Receipts and the order page show *Eid sale −10%* under the line; returns refund from what was paid (EC10 already). An order made before a discount ended keeps its price (nothing re-prices a placed order). |
| DS11 | **The form tells you before saving** (as TX6): under the Discount form, *“Saving gives 10% off to 48 products — 3 of them keep a bigger discount.”* (dry run of D1 through `bestFor`); after saving, the toast *“10% off on 45 products.”* Its page has a **Products** tab (products carrying it) and the count ⚙Products reached. A product's page shows *Eid sale −10% · ends 5 Nov* next to the price. |
| DS12 | **Names:** the model and its sidebar entry are **Discounts**; the POS feature the cashier uses stays **Line and order discounts** in Store settings and the guide. The engine field on order lines is `sale`, not `discount` (that one is the cashier's). |
| DS13 | **Wizard and built stores get the same thing.** Wizard step *Products* gains **Collections** and **Discounts** (both on by default; EC3: every store gets every model, the answer only shows / hides them). `install.ts` installs the models, the product / variant fields and D1–D6. `upgradeStore` adds the models and fields, changes Price after tax to read Sale price (one-time `doneOnce: 'sale-price'` fill: Sale price = Price everywhere, then formulas), adds the automations by `key`. `scripts/upgradeStores.js` dry run, then `--apply` on prod with the user's go-ahead. |
| DS14 | **Website and API.** Products in the public API and `GET /public/api/store` items carry `price`, `salePrice`, `discountPercent`, `discount: { name, endsAt }` (a storefront can show a countdown); `POST /public/api/store/orders` is priced by the till (DS10), never by what the website sends. MCP: `create_records` / updates on Discounts and Collections go through the same automations; `list_automations` shows D1–D6 marked as store automations. |

## 4. How it plays out

| Change | What runs | Result |
|---|---|---|
| New discount *Eid sale* 20%, Collections: Sale, Ends 5 Nov | D1 | every product in Sale (and their variants): Sale price = price × 0.8; Price after tax follows; History *Store: discount “Eid sale”* |
| A product in Sale is also in category Shoes with *Shoes week* 10% | D1 (DS3) | it keeps 20% (bigger wins) |
| *Eid sale* switched to inactive | D1 | Sale products back to their price — that one product drops to Shoes week's 10% |
| Switched to active again | D1 | 20% again on all of them |
| A product added to the Sale collection | D3 | 20% off it at once |
| 5 Nov 23:59 Asia/Dhaka | D5 → D1 | *Eid sale* inactive, Ended = 5 Nov 23:59; prices back |
| Someone switches it on on 6 Nov | DS8 | refused — move the end date |
| A discount deleted | D2 | its products worked out again |
| D5 switched off by the owner | — | the end date passes and nothing happens (the discount stays on until switched off by hand) |

## 5. Work orders

| WO | Title | Repo | Size |
|---|---|---|---|
| EC-41 | **Collections** (DS7): blueprint model + Product ★Collections; collection page Products tab with Add / Remove products (engine, History); Discounts tab placeholder; website list endpoint + `?collections=` filter; POS chips (if Q5 yes); guide `#collections` | backend + mint-tenant + mint-docs | M |
| EC-42 | **"When a date is reached" trigger** (DS6): `on: 'date'`, `dateField`, offset; `AutomationDue` jobs queued on save / re-queued / dropped; minute ticker with claim + catch-up; on/off queues/drops; editor in both panels (mint-tenant + admin); MCP `save_automation` takes it; guide `#date-trigger`. Smoke: due in 2 min fires once, moved date re-queues, cleared date drops, restart catches up, two tickers don't double-run | backend + mint-tenant + admin + mint-docs | L |
| EC-43 | **Discount model + engine** (DS1–DS4, DS8, DS9): blueprint Discounts; product / variant ⚙Discount, Discount %, Sale price; Price after tax reads Sale price; `commerce/discounts.ts` (`reachOf`, `bestFor`, `applyDiscounts`); save checks; Store settings Time zone | backend + mint-tenant | L |
| EC-44 | **The store's discount automations D1–D6** (DS5): store action *Work out discounts*; install in `install.ts`; form note + toast (DS11); Products tab on the discount; price badge on the product page | backend + mint-tenant | M |
| EC-45 | **The till charges it** (DS10, DS12): `itemView` sale price, `sale` on order lines, POS cart / receipt / order page show it, website orders priced the same, returns check | backend + mint-tenant | M |
| EC-46 | **Website + MCP** (DS14): public API fields, `GET /public/api/store`, Live Fresh storefront strike-through + countdown (our own demo store), MCP notes in `describe_platform` | backend + live-fresh | S |
| EC-47 | **Built stores + docs** (DS13): wizard step, `upgradeStore` (models, fields, `sale-price` fill, automations), `upgradeStores.js` dry run on Verte then `--apply` with the user's go-ahead; mint-docs guides (Discounts, Collections, Products, Automations → date trigger), admin `/docs`, marketing website | backend + mint-tenant + mint-docs + mint-webpage + prod | S |

Order: EC-41 and EC-42 first (independent of each other), then EC-43 → EC-44 → EC-45, EC-46 after EC-45, EC-47
last. Commit and push each WO when it's done.

## 6. Tests (each WO's smoke, scratch server :5021 + mongod :27997)

- Wizard store: Discounts and Collections exist; D1–D6 installed, on, locked.
- Product in two collections; the collection page adds 3 products and removes 1 — History on each.
- 20% on a collection → its products and variants: Sale price = price × 0.8, Price after tax from it (added and inclusive store); a product outside untouched.
- 10% on its category + 20% on its collection → 20%. Switch the 20% off → 10%; on → 20%. Delete the 10% → only the 20% remains.
- A category discount with sub-categories included reaches a product in a child category; with it off, doesn't.
- Price edited from 100 → 120 during a 20% sale → Sale price 96; discount off → 120 (not 100, not 125).
- Ends in 2 minutes → after the tick: inactive, Ended set, prices back, Runs shows D5 then D1. Re-activating is refused.
- Starts in 2 minutes, saved active → nothing until the tick, then the products get it.
- POS sale of a discounted item: unit 100, sale −20, coupon after, tax on 80 (added); receipt shows *Eid sale −20%*. A return refunds what was paid.
- D5 off → the end date passes, nothing changes.
- 3,000-product category: D1 finishes in batches, Runs says 3,000.
- Built store (copy of Verte): `upgradeStores.js` dry run lists models, fields and automations to add; `--apply` twice changes nothing the second time; every Price after tax unchanged after the `sale-price` fill.

## 7. Questions for the user

| # | Question | Recommendation |
|---|---|---|
| Q1 | A product reached by two discounts (its category 10%, a collection 20%) — the bigger one, or both added (28%)? | **The bigger one wins**, never added. Simple to explain, and you can't give away more than you meant. |
| Q2 | Should a discount change the product's **Price** itself, or keep Price as the original and show a **Sale price** next to it (DS1)? | **Keep Price, add Sale price.** "Back to the original price" is then exact and safe, even if the price is edited during a sale. |
| Q3 | A coupon used on a discounted product — on top of the sale price, or not on discounted items? | **On top**, with a later switch on the coupon *Not on discounted items* if you want it. |
| Q4 | Switching on a discount whose end date has passed — refuse, or switch on and clear the end date? | **Refuse** with "move the end date", so a sale never runs forever by accident. |
| Q5 | Collections on the POS too (chips beside the categories), or only on the website? | **Both** — *Sale* and *Featured* are useful to a cashier too. |
| Q6 | Is a **start date** wanted as well as the end date (schedule a sale ahead)? | **Yes** — it costs nothing extra once the date trigger exists (D6). |
