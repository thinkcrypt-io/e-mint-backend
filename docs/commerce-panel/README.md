# Commerce panel

A store's own panel for the people who run it — not the people who build it.
Asked 2026-11-16: "create another panel like the tenant panel called commerce panel … users can be created with
email and password with the project id attached … call it panelAdmin model. one email can be associated with one
project only … they can't edit models, settings, no developer tools. can add courier, emails though."

## Decisions

| # | Decision |
|---|---|
| D1 | A store login is a **PanelAdmin** (`paneladmins`), not a TenantUser: name, email, password, `organization`, `project`, isActive. **Email is unique across every project** — one email opens one store. Removing the login frees the email. |
| D2 | Only **e-commerce projects** have store logins. They are made by the project's managers (manage-projects or invite-to-projects) in the tenant panel, **Project → Panel admins** — no sign-up, no reset by email; a manager sets a new password. Switching a login off, a new password or removing it signs every device out. |
| D3 | Token `{ _id, kind: 'panel', org, project, sid }`, sessions in the tenant session store. `tenantProtect` accepts it and fills the request as a **guest of that one project** (`req.panelAdmin` set). It reaches only `/tenant/api/p/<its project>/…` and `/tenant/api/panel/auth/…` — anything else is 403 `PANEL_ONLY`; another project is 404. The admin API refuses it (any `kind`). |
| D4 | Fixed keys (`PANEL_PERMISSIONS`): `records:view/create/edit/delete/publish`, `manage-couriers`, `manage-email`. Never `build` (models, pages, sidebar, dashboard, PDF templates, automations, API builder, widgets, webhooks, site setup), never `manage-projects` (project + store settings, payments). The two panel keys are accepted next to manage-projects by the courier routes and the email accounts / designs routes; roles never hold them. People (`/people`, `/access-users`) are refused. |
| D5 | The panel is its own app, **mint-commerce** (repo `aiasifistiaque/mint-commerce`, main), copied from mint-tenant with `IS_COMMERCE_PANEL`: its `auth/…` calls go to `panel/auth/…`, it signs in with the store login form only (no sign-up, landing, organizations or project board), always works inside the login's project, and hides developer screens. Token key `MINT_COMMERCE_TOKEN`. Domain **commerce.mintapp.shop**. |
| D6 | The sidebar for a store login is the store's own (POS, orders, its tables), then Store settings → **Couriers** (when the store delivers), Media library, Analytics, History, Email accounts — built by the backend (`tenantNav(..., { panel: true })`). |

## Work orders

| WO | What | Status |
|---|---|---|
| CP-01 | Backend: PanelAdmin model, `/tenant/api/panel/auth` (login, self, update, preferences, change password, logout, sessions), `/p/:project/panel-admins` CRUD for managers, panel tokens in tenantProtect | done 2026-11-16 |
| CP-02 | Backend: fixed keys, couriers + email routes accept them, path guard, people refused, panel sidebar; smoke `scripts/tenancy-smoke/commerce-panel.mjs` (56 checks) | done 2026-11-16 |
| CP-03 | Tenant panel: Project → Panel admins page (list, add, switch off/on, new password, remove) | |
| CP-04 | mint-commerce app: copy of mint-tenant, commerce sign-in, one project, developer screens hidden | |
| CP-05 | Repo + Vercel project + commerce.mintapp.shop | |

## Deploy

The panel needs CP-01/02 on the backend — until the user deploys the backend (Heroku, manual; v3 must be in
`mint/main`) the live commerce panel's sign-in answers 404. No migration: the collection and its unique email index
are made on first use.
