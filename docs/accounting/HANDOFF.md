# Mint Accounting — handoff for the next Claude session

Read this first if you're picking up the accounting work (for example from another Claude account after a usage
limit). It stands alone: you won't have the previous session's memory files.

## What we're building

A DiziCashier copy on Mint. A new project type **`accounting`**; creating one installs DiziCashier's books (models,
chart of accounts, settings, roles, reports) as a blueprint. Its panel logins sign in at a new app **mint-accounting**
(**accounting.tcrypt.site**) with DiziCashier's sidebar and screens in Mint's look. Plan: `README.md` (decisions
D1–D14). Every DiziCashier page/form/setting/report: `DIZICASHIER_INVENTORY.md`. Work orders: `WORK_ORDERS.md`
(AC-00…20).

The user's words (2026-11-28): "replicate this system using mint … separate panel, accounting.tcrypt.site, mint theme
but panel similar to dizicashier (functionalities, sidebar structure), create an app category accounting, if an
accounting app is created users can log in to this panel, create a demo app … functionalities should be exactly like
dizicashier." The user's own DiziCashier login (company "Mint", ID 015779) can be opened in the browser pane to check
behaviour — **look only, never create/edit/delete there** unless the user says so.

## Repos

All under `~/Desktop/proj/e-mint` (the folder itself is not a git repo).

| Folder | Repo / branch | Notes |
|---|---|---|
| `backend` | branch `v3`, push to remote **`mint`** | Heroku deploy is manual (the user). Push ≠ deploy |
| `mint-tenant` | `origin` main | where project owners work; gets the Accounting card (AC-01) |
| `mint-panel` | `origin` main, push = deploy panel.tcrypt.site | the copy source for mint-accounting |
| `mint-accounting` (AC-05) | aiasifistiaque/mint-accounting main (private), push = deploy accounting.tcrypt.site | `NEXT_PUBLIC_PANEL_APP=accounting`, port 3760 |
| `mint-docs` | `origin` main | guide `/accounting` (AC-20) |

## Rules the user set

- Commit + push every WO when done, then go on. Stage only your own files (`git commit -m … -- <paths>`); other Claude
  sessions edit the same repos. Never `git add -A`, stash, reset or switch branches.
- No bare `prettier` (tabs + single quotes). Every modal = shared Dialog parts; confirms = `PromptDialog`
  (`tone='default'` for non-delete). Dropdowns = cl `Dropdown`. No backdrop blur.
- Doc links on every step of a new tool. Plain words in the UI. No server-side AI calls (AI = user's own AI over MCP).
- Panel apps: never import `store/store.ts` from a feature module; set the token via `dispatch(refreshAuth(t))`.
- RTK Query endpoint names are global — grep before adding.
- New table routes: register in the Admin preferences map.
- No next/image, no next/font/google. Turbopack: node_modules must be a real folder (`cp -cR` clone), not a symlink.
- Vercel: e-mint Hobby account via `backend/.env` `VERCEL_TOKEN` (the Vercel MCP connector is a different account).
  tcrypt.site DNS is on Vercel (no record needed for subdomains).

## Progress log

- 2026-11-28 AC-00: DiziCashier inspected in the user's account (all ~95 menu pages, create forms, settings tabs, role
  matrix, route registry); inventory, plan, WOs, this handoff written.
- 2026-11-28 AC-01: `accounting` in PROJECT_TYPES; `library/functions/accountingPanel.function.ts` (guard blocks
  builder/people/automations/… for accounting logins with 403 ACCOUNTING_PANEL_ONLY; `accountingNav` = DiziCashier's
  sidebar, served from `/sidebar` to accounting logins; `ACCOUNTING_REPORTS` = the 41 report keys); panel auth takes
  `app: 'accounting'` (checked before SEO) and answers `use_accounting` / `use_panel|use_seo|use_commerce`; first
  sidebar category "Books"; mint-tenant New project → Accounting card (opens Panel users after create). Smoke
  `scripts/tenancy-smoke/accounting-panel.mjs` all passed. Backend not deployed (Heroku is manual).
- 2026-11-28 AC-02 (part, demo models): the user asked to build the models through a connector. All 36 books models
  were built with the MCP connector `e476de81` in the prod project slug **`thinkcrypt-expense-management`** (sidebar
  category "Books"): Account, TaxCategory, PaymentMethod, Unit, ProductCategory, Warehouse, CustomerGroup,
  SalesRepresentative, CostCentre, Product, Trader, ProductionTemplate; Sale (S), Quotation (Q), SaleReturn (SR),
  ProductReturn (CR), Exchange (EX), PurchaseOrder (PO), Purchase (P), PurchaseReturn (PR), Payment (route
  **`trader-payments`** — `/payments` is blocked by the accounting guard, MR), Expense (E), Income (I), Transfer (T);
  Voucher (V), Cheque, StockAdjustment (SA), StockTransfer (ST), Production (PD), Installment (IN), Journal, StockMove,
  Stock, AccountingSettings, DashboardPref, OrganizationInfo. Seeded: 30 chart-of-accounts rows (`systemKey`, e.g.
  `cogs`, Petty Cash), Tax Free 0%, Main warehouse, units Piece/Kilogram/Litre/Box, Cash payment method (→ Petty Cash),
  AccountingSettings (en, ৳), OrganizationInfo "Mint Accounting Demo". Limits: sectionlist rows can't hold links, so
  line items keep `product` (id as text) + `productName`. That project is still type `app` (the `accounting` type
  needs the backend deployed); the code blueprint (`library/functions/accounting/blueprint.ts` from these models) is
  still to do.

- 2026-11-28 AC-03 (+ AC-04 core): the ledger + stock engine. `library/functions/accounting/posting.ts` = pure posting
  rules per document kind (sale, purchase, sale/product/purchase returns, exchange, payment, expense, income, transfer,
  voucher, cheque clear/bounce, stock adjustment/transfer, production, product/trader/account openings) → balanced
  journal lines + stock moves at weighted average cost + engine-owned fields (status, costOfGoods, line unitCost,
  totalCost) + product price updates; accounts found by the chart's `systemKey`. Tests
  `library/functions/accounting/test/posting.test.ts` (37, `npx jest library/functions/accounting`).
  `engine.ts` `booksFor(req, Model, action, before, after)` runs beside `linkedFor` in the generic create / update /
  delete / copy controllers of an **accounting** project (models found by blueprint route, `compiledByRoute`): refuses
  before the save (400 with `code`: voucher_unbalanced, not_enough_stock, books_in_use, books_system_account…), after it
  reverses the document's old journal lines + moves (by `sourceId`), writes new ones, updates Stock records, patches the
  document, recomputes account balances, trader balances (+ lastTradingDate), product inStock/avgCost and — for a
  payment against a slip — the sale's receivedLater / purchase's paidLater, due and status. Failure puts the old posting
  back and the controller restores the record. Bulk delete/archive/restore/merge/import on posting routes →
  400 books_one_at_a_time (`booksOneAtATime` in the router). Smoke `scripts/tenancy-smoke/accounting-engine.mjs` builds
  the books from `fixtures/accounting-books.json` in a fresh accounting project and runs every document: all passed
  (trial balance 0 after each step, inventory account = stock list value). Backend not deployed.
  Known limits: the negative account balance switch (settings.account.allowNegativeBalance) isn't enforced yet; no Mongo transaction (compensating undo); stock writes are read-modify-write (no concurrency guard);
  back-dated documents don't re-cost later sales; MCP `create_records` skips the engine; a sale return with
  `reduce_due` doesn't change the sale slip's due; settings switches left unset count as allowed (negative stock);
  the demo project `thinkcrypt-expense-management` is type `app`, so its books don't post until it is made
  `accounting` (after deploy).

- 2026-11-28 AC-02 (rest): the code blueprint. `library/functions/accounting/blueprint.ts` (from the fixture: all 36
  models as one plan, sidebar "Books", `BOOKS_VERSION`, `ENGINE_FIELDS` = the fields only the engine writes),
  `seed.ts` (`seedBooks` — the 30-row chart by `systemKey`, Tax Free, Main warehouse if none, 4 units, Cash → Petty Cash,
  AccountingSettings, OrganizationInfo; idempotent), `install.ts` (`installBooks` builds the plan, marks each model
  `system: 'accounting'` with its blueprint fields locked, engine fields read-only in forms, seeds; undoes on failure;
  `startBooks` claims `project.books.status` building → ready / failed in the background). Registered on
  `projectHooks.onCreated` (imported by projectLifecycle), so a new **accounting** project sets itself up. TenantProject
  has `books { status, version, startedAt, finishedAt, error, problems }`; `publicProject` shows `books.status`.
  Routes: `GET /tenant/api/p/:id/accounting/books` (status), `POST …/accounting/books/retry` (build permission; only when
  failed, else 409). `scripts/upgradeBooks.js` (dry run / `--apply`): marks + reseeds what's missing on every ready
  project; `--adopt <slug>` turns a hand-built project (the demo) into type `accounting` with ready books. Smoke
  `accounting-engine.mjs` now starts from the auto-install (books ready, 30 accounts once, Main, Cash, defaults, system
  account undeletable, retry 409) then runs the engine: all passed; accounting-panel + automations-linked pass;
  `--adopt` checked on scratch (36 marked, existing Petty Cash kept, re-run up to date). Failure + retry path not
  exercised. Backend not deployed.
  **After deploy (the user's Heroku push):** `node scripts/upgradeBooks.js --adopt thinkcrypt-expense-management` (dry
  run), then with `--apply` — it makes the demo project `accounting` so its documents post.

- 2026-11-28 AC-05: **mint-accounting** app — `git archive` copy of mint-panel (node_modules `cp -cR` from
  mint-commerce, same deps), repo **aiasifistiaque/mint-accounting** (private, main), Vercel `mint-accounting`
  prj_Zg772QvdchsBEBrbUyptluBZIC0I on the e-mint Hobby account (Node 26.x, same env as mint-seo with
  `NEXT_PUBLIC_PANEL_APP=accounting`), domain **accounting.tcrypt.site**; push main = deploy. Local: launch.json
  `mint-accounting` on :3760 against backend-scratch :5011. `panel.ts`: `PANEL_APP` 'accounting' (default here),
  `IS_ACCOUNTING_PANEL`, `APP_NAME` MINT Accounting, `PLACE` company, `accountingPagePath` (DiziCashier's addresses:
  aliases customers/suppliers → traders, services → products, taxes → tax-categories, organization →
  organization-info, payments/* → trader-payments; `/x/new` → add page; statements/reports/imports/price change/
  barcodes/Dashboard Settings → `/soon` "on its way" page). Header `AccountingHeader.tsx`: `(ID: last 6 of project id)
  Name` + **+ Add New** (Make Sale, Create Customer, Make Purchase, Create Supplier, Receive/Give Payment → payment
  form until AC-10 popups, Pay Expense). Empty dashboard → "Your books are ready" + quick links (until AC-06). Login
  page / AuthFrame words for accounting; `use_accounting` moves a login to accounting.tcrypt.site (login + demo
  pages). Checked in headless Chrome against scratch: sign-in, sidebar, header, Add New, /customers, /sales/new,
  /reports/balance-sheet (soon). Live sign-in needs the backend deployed (until then the live backend rejects
  `app: 'accounting'`). Not done: mint-panel / mint-commerce / mint-seo don't yet send `use_accounting` logins here.

## Next step

Deploy backend + adopt the demo (`upgradeBooks.js --adopt thinkcrypt-expense-management --apply`), then AC-06
(dashboard). Small follow-up: add `use_accounting` → accounting.tcrypt.site to the other three apps' login pages.
