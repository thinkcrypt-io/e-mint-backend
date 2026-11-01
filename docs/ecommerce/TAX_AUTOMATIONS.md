# Tax automations — plan (EC-35…EC-40)

Part of the E-commerce plan (`README.md`). Status rows live in `WORK_ORDERS.md`;
every step is logged in `CHANGELOG.md`.

## 1. The user's words (2026-11-01)

> If Tax field is applied to a category, if product category is selected then
> it should autofill the tax field, on product form, also if tax is selected for
> a category, all product on this category must update the tax field and price
> with tax field, also when tax percentage is edited products must adjust, these
> would be automations. apply this to all ecommerce while creating ecommerce
> with wizard, also on existing ones.

Four behaviours, all automatic, in every store — new (wizard) and built:

| # | When | Then |
|---|---|---|
| B1 | A category is picked on a product (form, or any other way a product is saved) | the product's Tax / VAT is the category's tax |
| B2 | A category's tax is set or changed | every product in it takes that tax, and its Price after tax follows |
| B3 | A tax's percentage is edited | every product and variant with that tax gets its Price after tax worked out again |
| B4 | — | they are **automations**: the store owner sees them, can switch them off, and sees what each run changed |

## 2. What is there already (2026-10-31 / 2026-11-01, not deployed)

| Piece | Where | State |
|---|---|---|
| Tax rates model with Status; Tax / VAT picker on categories, products, variants (active taxes only) | `commerce/blueprint.ts` | built |
| Product's tax filled when a category is picked in the form; variant's from its product | `fillFrom` + mint-tenant `LinkedFiller.tsx`; server fills it on **create** when left empty (`linkedFill.function.ts`) | built — B1 for the form |
| Price after tax = `round(price * (1 + taxRate.rate / 100), 2)` on products and variants | blueprint formula | built |
| Category tax handed down to its products (and variants that carried the product's old tax) | `commerce/categoryTax.ts`, fired from `commerce/hooks.ts` on a category save that changed `taxRate` | built — B2, with a bug (G1) |
| Catch-up for categories that had a tax before: `doneOnce: 'category-tax'` | `commerce/upgrade.ts` | built, dry run on Verte: 15 products |
| Tax rate edit → products' / variants' formulas recalculated | generic `recalculateDependents` (formulaDependents.function.ts), called by edit, bulk edit, delete/undo, import, public API, MCP | works already — B3, but see G4 |

## 3. Gaps found while planning

| # | Gap | Effect |
|---|---|---|
| G1 | **Bug.** `applyCategoryTax` saves each product with `p.save()`. Formulas run only in the request path (`req.formulas` → controller), there is no formula pre-save hook | B2 changes the tax but **Price after tax stays at the old value**. The hand-down also writes no record history and fires no webhooks or automations |
| G2 | The hand-down is hidden code in `hooks.ts` | not an automation (B4): can't be seen, switched off, or traced in Automations → Runs |
| G3 | B1 only happens in the form, and only for a category *with* a tax. Bulk edit of Category, import, MCP `create_records` updates, the public API: nothing fills. Moving a product to a category with no tax keeps the old category's tax | products drift from their category |
| G4 | Price after tax ignores the store's tax mode and the default rate. **Inclusive** stores: the price already holds the tax and the formula adds it again. **No tax** stores: shows a tax the till never charges. A product with **no tax**: shows the bare price while the till charges the default rate (`pricing.ts` → variant, product, then default) | the price on the page ≠ the price charged |
| G5 | A tax switched to inactive or deleted while products still hold it | inactive: the till still charges it, nothing says so. Deleted: the formula reads 0, the till falls to the default — products silently change price |
| G6 | The Automations engine's `update` action changes *this* record or the record *it picks* — never "every record that picks this one" | B2 can't be an ordinary automation today |

## 4. Decisions (proposed — see §7 for the ones the user should confirm)

| # | Decision |
|---|---|
| TX1 | **Store automations are real Automation records**, installed with the store and marked `system: 'commerce'` + a `key` (`tax.category-to-products`, `tax.product-category`, `tax.rate-to-prices`). They are listed on Build → Automations under **Store automations**, with on/off and Runs; their trigger and actions can't be edited or deleted (switching off is the way out). People's own automations are unchanged. |
| TX2 | **New generic action: "Update the records that pick this one"** (`type: 'updateLinked'`, `route`, `via` — the reference field on that page that points here —, `set`, optional `when` conditions on *those* records). Any project can use it (a Client's account manager changes → its open Projects follow). Each record is written like the `update` action: `doc.save()` + formulas + `recordHistory` as *Automation “X”*, so History, webhooks, formula dependents and further automations follow (chain guard as now). Runs in the background in batches of 200; the run log says how many changed. |
| TX3 | The three store automations: **A1** *Category tax → its products* — Category updated, Tax / VAT changed → `updateLinked` Products via `category`: Tax / VAT = this category's tax (an inactive or empty tax isn't handed down); their variants that carried the product's old tax move with it (store step). **A2** *Product's category → its tax* — Product created or updated, Category changed → `update` this: Tax / VAT = `category.taxRate` when the category has one. Works for every write path, not just the form (G3). **A3** *Tax rate edited → prices* — Tax rate updated, Rate changed → store action **Work out prices again** on the products and variants using it (and on every product with no tax when the default rate changes). |
| TX4 | **Price after tax is the till's number.** It stops being a builder formula and becomes an engine-owned field (⚙, EC5) written by `pricing.ts`'s own rule (`rateOf`: variant → product → default; mode-aware: added = price × (1 + rate), inclusive = price, none = price). Written on product / variant save, by A1–A3, and when Store settings change the tax mode or the default rate. One rule for the product page, the POS, the website and receipts (G4). In an inclusive store the column reads **Price incl. tax**; in a no-tax store it is hidden. |
| TX5 | **A tax in use can't be deleted**: "Used by 42 products, 3 categories and 5 variants — pick a tax to move them to" (Replace with… dialog; the move runs through A1 / A3, so prices follow). Switching one to **inactive** keeps it on what has it (the till keeps charging it) and the tax's page says "Still on 42 products — Replace with…". |
| TX6 | **The category form tells you before saving**: when the Tax / VAT changes, a note under it reads "Saving gives this tax to 23 products in this category" (count from the automation's dry run, as LinkedPreview). After saving, the toast says "Tax given to 23 products". |
| TX7 | **Wizard and built stores get the same thing.** The blueprint gains an `automations` list; `install.ts` creates them after the models. `upgradeStore` adds missing store automations by `key`, turns the Price after tax formula into the engine field, and runs a one-time **reprice** (`doneOnce: 'tax-prices'`) after the existing `category-tax` catch-up. `scripts/upgradeStores.js` (dry run, then `--apply`) for prod — the user approves or runs `--apply`. |
| TX8 | The `hooks.ts` category branch goes once A1 exists: a store that has A1 skips it; a store not yet upgraded keeps the old hand-down (fixed by EC-35) until `upgradeStore` runs. |
| TX9 | MCP: `list_automations` shows store automations (marked, with their key); `save_automation` may only switch one on/off; `updateLinked` is available to people's own automations over MCP like the other actions. |

## 5. Work orders

| WO | Title | Repo | Size |
|---|---|---|---|
| EC-35 | **Fix the hand-down (G1)** now: `applyCategoryTax` recalculates Price after tax (`recalculateFormulas` on the products and variants it changed) and writes record history as “Store: category tax”. Smoke on the scratch DB (:27997): category tax set / changed / emptied / inactive, variant with its own tax kept, rate edit reprices (B3 as it is today) | backend | S |
| EC-36 | **`updateLinked` action + system automations** in the Automations engine (TX1, TX2): model fields `system`, `key`; validation (`via` must be a reference to this page); batched background writes; editor locks + "Store automations" section in both panels; MCP (TX9); guide `#update-linked` + `#store-automations` | backend + mint-tenant + admin + mint-docs | L |
| EC-37 | **Store tax automations A1–A3** (TX3, TX6, TX8): blueprint `automations`, `install.ts` creates them, store action *Work out prices again*, variant step in A1, category form note + toast, `hooks.ts` hand-over | backend + mint-tenant | M |
| EC-38 | **Price after tax by the till's rule** (TX4): engine-owned field, `pricing.ts` exports the per-item rule, repricing on save / mode change / default change, column label per mode; POS, website API (`GET /public/api/…products`) and receipts read it | backend + mint-tenant | M |
| EC-39 | **Tax in use** (TX5): delete refused with counts, Replace with… dialog, inactive notice | backend + mint-tenant | S |
| EC-40 | **Built stores + docs** (TX7): `upgradeStore` (automations, field change, `tax-prices` reprice), `upgradeStores.js` dry run on prod (Verte) then `--apply` with the user's go-ahead; mint-docs guides (Tax rates, Categories, Products, Automations), admin `/docs`, marketing website | backend + mint-docs + mint-webpage + prod | S |

Order: EC-35 first (a bug in what's built), then EC-36 → EC-37 → EC-38, EC-39 any time after EC-38, EC-40 last.
Commit and push each WO when it's done.

## 6. Tests (each WO's smoke, on the scratch server :5021 + mongod :27997)

- New store through the wizard: three store automations exist, on, locked.
- Pick a category with VAT 15% on a new product → tax 15%, Price after tax = price × 1.15 (added) / = price (inclusive).
- Bulk edit 10 products to another category → each takes its tax (A2); the run log says 10.
- Category tax 15% → 5%: every product in it 5%, Price after tax worked out again; a variant with its own tax kept; History reads *Automation “Category tax → its products”*.
- Edit VAT 15% → 7.5%: every product and variant with it repriced; products with no tax change only when the default's rate changes.
- Store settings: added → inclusive → every Price after tax = price; the POS quote for one item equals the product page.
- Delete a tax in use → refused with counts; Replace with → products moved and repriced.
- A1 switched off → changing a category's tax touches no product.
- Built store (copy of Verte): `upgradeStores.js` dry run lists the automations to add and the products to reprice; `--apply` twice changes nothing the second time.

## 7. Questions for the user

| # | Question | Recommendation |
|---|---|---|
| Q1 | When a category's tax changes, a product whose tax someone set **by hand to something else** — overwrite it too? | **Yes, all products in the category take it** (your words: "all product on this category must update"), with a switch on A1 — *Keep products that have their own tax* — off by default. |
| Q2 | Price after tax: keep it a formula (simple, but wrong for inclusive stores and products with no tax), or the till's own number (TX4)? | **The till's own number** — the price shown is always the price charged. |
| Q3 | Store automations: on/off only, or fully editable like people's own? | **On/off + runs only**; anything extra is a new automation of their own. |
