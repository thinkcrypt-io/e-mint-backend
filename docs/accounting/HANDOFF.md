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

## Next step

AC-02 (blueprint install), then AC-03 (ledger engine) — the engine is the core; build it test-first.
