# Mint Accounting — a DiziCashier-style panel on Mint

Plan, 2026-11-28. What we copy: `DIZICASHIER_INVENTORY.md` (every page, form, setting, role check and report of
app.dizicashier.com, read in the user's own account). Work orders: `WORK_ORDERS.md`. Pick-up notes: `HANDOFF.md`.

## The user's words (2026-11-28)

> we'll replicate this system using mint … make a separate panel, accounting.tcrypt.site, with mint theme but panel
> similar to dizicashier, I mean functionalities, sidebar structure. create an app category accounting; if an
> accounting app is created users can log in to this panel. create a demo app, use this to build this.
> functionalities should be exactly like dizicashier.

So: a new kind of Mint project, **Accounting**. Making one installs DiziCashier's books (chart of accounts, products,
traders, sales, purchases, payments, stock, vouchers, settings, roles, reports). Its panel logins sign in at a new app,
**mint-accounting** on **accounting.tcrypt.site**, which has DiziCashier's sidebar, screens and reports in Mint's look.

## Shape

| App | Who | Built as |
|---|---|---|
| mint-commerce (commerce.mintapp.site) | store logins | copy of mint-tenant, `app: 'commerce'` |
| mint-panel (panel.tcrypt.site) | panel logins of other projects | copy of mint-commerce, `app: 'panel'` |
| mint-seo (seo.tcrypt.site) | SEO-edition website projects | copy of mint-panel, `app: 'seo'` |
| **mint-accounting (new, accounting.tcrypt.site)** | logins of accounting projects | copy of mint-panel, `app: 'accounting'`, own sidebar + screens |

The project comes from the login (token), never the URL — the same rule as mint-panel.

## Decisions (taken by default — the user can overturn any)

| # | Decision | Why |
|---|---|---|
| D1 | **New project type `accounting`** (in `PROJECT_TYPES`, beside app / website / api / ecommerce). Tenant *New project* gets an **Accounting** card. | The user asked for an "app category". A type (not an edition) because nothing of `app` or `website` applies, and the type picks the blueprint, sidebar and panel. |
| D2 | **Installing = a blueprint**, like the store's (`library/functions/commerce/install.ts`): the models are built as one feature plan in the background, marked as the books' (locked core fields), the chart of accounts and defaults seeded (DiziCashier's exact list), all-or-nothing with `failed` + retry. Code in `library/functions/accounting/`. Built books get later blueprint changes through an `upgradeBooks.js` script (as `upgradeStores.js`). | Same proven path; users can still add their own fields and models in mint-tenant. |
| D3 | **Double-entry ledger.** One `Journal` model (lines: date, voucher no, source doc + id, account, debit, credit, trader, cost centre, warehouse). An **accounting engine** writes the lines in the same save as every posting document (sale, purchase, returns, payments, expense, income, transfer, voucher, cheque clear, stock adjust, production, opening balances) and rewrites them on edit / removes them on delete. Account and trader balances, every statement and every financial report read the journal. | Balance sheet, trial balance, P&L, cash book, ledgers and aged reports are only right if every money movement is a balanced entry. Recomputing from documents per report would drift. |
| D4 | **Stock = moves + weighted average cost.** `StockMove` lines (product, warehouse, qty ±, unit cost, source) written by the same engine; product × warehouse in-hand and weighted average cost kept on a `Stock` record; COGS posted at average cost on sale. Batches / expiry / serials are later (settings switches exist but stay off). | DiziCashier's Stock List shows In Hand, Stock Value, Weighted Avg Cost. |
| D5 | **Documents number themselves** per settings (`S-YY001`, `P-YY001`, `Q-…`, `SR-…`, `PR-…`, `V-…`, `E-…`, `I-…`, `T-…`), per project, gap-free counters. | DiziCashier's slip numbers. |
| D6 | **Settings** = one `AccountingSettings` doc per project holding every tab of DiziCashier's Settings (inventory D-list). Switches really change the screens and engine (negative stock, tax-inclusive, round-up discount, deliver later, installments…). Phase 1 makes the core switches live; the rest are saved and shown, marked *later* in WORK_ORDERS. | "Exactly like DiziCashier." |
| D7 | **Panel app `accounting`.** Login sends `app: 'accounting'`; an accounting project's login on another app gets 400 `use_accounting`, and the accounting app answers `use_panel` / `use_commerce` / `use_seo` for others. Backend path allowlist for `accounting` tokens: the books' model routes, `/accounting/*` (engine, reports, settings, dashboard), `/media`, `/support`, `/auth/self`, panel users/roles. | Same as SP / CP. |
| D8 | **Roles = DiziCashier's matrix.** Panel roles in accounting projects use fixed keys copied from DiziCashier's role page (≈170 checks in 25 groups, incl. one per report and "transact on past & future dates"), shown with Select All per group. Super-admin logins make users and roles (DiziCashier's Tools → Users / Roles live in the app). | The user wants the same functions; the PU role dialog already does groups + Select all. |
| D9 | **Screens.** Generic list/record pages (the panel's table) for simple lists (categories, units, taxes, warehouses, payment methods, traders, lists of every document). **Custom screens** where DiziCashier is a worksheet: Dashboard, Make Sale, Make Purchase, Quotation, Purchase Order, Returns/Exchange (slip → Go), Receive/Give Payment popups, Pay Expense / Income (rows), Voucher (debit/credit rows), Transfer, Cheque clearing, Stock adjust/transfer/production, Chart of Accounts (4 tabs × groups), Account Statement, Change Prices grid, Imports, Barcode print, Settings tabs, Dashboard settings, Reports dashboard + every report. | Lists are free; worksheets need real UI to feel like DiziCashier. |
| D10 | **Look:** Mint theme (the panel's tokens, Classic look) with DiziCashier's *structure*: same 11 sidebar groups and page names, + Add New menu, coloured status tabs, Generate / Print on reports. Not DiziCashier's teal or logo. | "with mint theme but panel similar to dizicashier". |
| D11 | **Printing** (invoice, quotation, money receipt, voucher, reports) through the existing PDF templates (pdfkit) with A4 and 80 mm / 58 mm thermal layouts, settings from the Invoice tab. | PT-01…35 already render documents. |
| D12 | **Currency** from settings (BDT ৳ default), language English first (Bangla later, setting saved). | |
| D13 | **Demo:** an accounting project "Mint Accounting Demo" on prod with three months of believable data (products, customers, suppliers, sales, purchases, payments, expenses, a transfer, a voucher, a stock adjustment) + a 1-hour demo login link (`/demo/<key>`, DL pattern) + a super-admin login for the user. | The user asked for a demo app. |
| D14 | **Left out (phase 1):** Upgrade/plans, SMS, online store/WooCommerce, e-commerce orders + couriers (Mint's e-commerce type has them), membership, buy back, hire, tester items, serial production, multi-company reports. "Add Company" = make another accounting project (the tenant already does that); the header shows the company name + ID. | Not accounting; or Mint already has it. |

## Models (blueprint)

Masters: **Account** (name, group, type asset/liability/income/expense, system key, opening balance, active),
**Account Group** (fixed: Cash, Bank, Mobile Bank, Receivable, Equipment, Inventory, Payable, Tax, Equity, Sales,
Income, Revenue, Expense, Purchase, Cost Of Sales, Inventory-expense), **Payment Method**, **Product** (incl. service
flag), **Product Category** (parent), **Unit**, **Tax Category**, **Warehouse**, **Customer**, **Supplier** (one
`Trader` model with `kind`, so statements and ledgers share code), **Customer Group**, **Sales Representative**,
**Cost Centre**, **Production Template**.

Documents (each with lines + `status` paid/unpaid/partial where it applies): **Sale**, **Quotation**, **Sale Return**,
**Product Return**, **Exchange**, **Purchase**, **Purchase Order**, **Purchase Return**, **Payment** (in/out, against
slips), **Expense**, **Income**, **Transfer**, **Voucher**, **Cheque**, **Stock Adjustment**, **Stock Transfer**,
**Production**, **Installment**.

Engine-owned (read-only in forms): **Journal**, **StockMove**, **Stock**, **Counter**, **AccountingSettings**,
**DashboardPrefs** (per login), **ActivityLog** (Mint's history already records saves; the page filters it the
DiziCashier way).

## Backend API (new, `/accounting/*`, scoped to the token's project)

`GET /accounting/dashboard` (cards + charts per prefs) · `GET/PUT /accounting/settings` · `GET/PUT
/accounting/dashboard-prefs` · `GET /accounting/accounts/tree` (chart with balances) · `GET
/accounting/accounts/:id/statement` · `GET /accounting/traders/:id/statement` · `GET /accounting/stock` (in hand, value,
avg cost) · `GET /accounting/stock/:product/history` · `POST /accounting/slip/:kind/:no` (load a slip for return /
exchange / barcode) · `POST /accounting/import/:kind` (products, traders) · `POST /accounting/prices` (bulk price
change) · `GET /accounting/reports` (catalogue) · `GET /accounting/reports/:key?…filters` (rows + totals; `?format=pdf`
prints) · document saves go through the normal model routes; the engine runs in the model hooks (`linkedUpdates`
style) inside a Mongo transaction.

## Open questions (defaults taken; answer to change)

1. Domain **accounting.tcrypt.site** (as asked) — product name "Mint Accounting"? (default yes)
2. Who signs in: panel logins made in mint-tenant (Panel users), like SEO — no self sign-up yet. (default)
3. Bangla UI: later (setting stored). (default)
4. Should an accounting project's owner also see its books in mint-tenant (as tables)? Default **yes**, read/write via
   the normal pages; the custom screens live only in mint-accounting.
