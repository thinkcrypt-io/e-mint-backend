# Panel users, panel roles and reports

Asked 2026-11-20: like the commerce panel's store logins, every project gets **panel users** — logins of their own
app, **panel.tcrypt.site** (new repo **mint-panel**) — with **panel roles** that say what each may do. A panel
**super admin** makes roles and users. Panel users never build. The tenant panel gets **reports**: developers pick
the kind of report, its columns, totals and whether it can be downloaded; panel users run and download them. The
MCP gets both.

## Decisions

| # | Decision |
|---|---|
| D1 | One login model: the existing `PanelAdmin` (`paneladmins`), now with `role` (PanelRole) and `superAdmin`. One email = one project, as before. |
| D2 | E-commerce projects keep the commerce panel (commerce.mintapp.site) and the fixed store keys; every other project's logins sign in at panel.tcrypt.site. Login sends `app: 'commerce' \| 'panel'`; the wrong app answers 400 `use_panel` / `use_commerce`. |
| D3 | `PanelRole` (`panelroles`, tenant-scoped): name, description, permissions. Keys allowed: per-model `view-/create-/edit-/delete-/publish-<route>` plus `reports:view`, `reports:export`. Add/edit/delete/export imply view. Anything else (build, settings…) is dropped. |
| D4 | Access (`panelAccess`): super admin → every record key (a store: the store keys) + reports + `manage-panel-users`; else the role's keys; else a store's fixed keys; else nothing. A non-store login must have a role or be a super admin. |
| D5 | A super admin can't switch off, demote or remove their own login. A role held by a login can't be deleted. Switching off / a new password signs them out. |
| D6 | Managers: the project's `manage-projects` / `invite-to-projects` holders (tenant panel **Project → Panel users / Panel roles**), or a panel super admin (in the panel app). |
| D7 | `Report` (`reports`, tenant-scoped): kind **list** (columns, sort, totals row), **summary** (group by a field: count + sums), **timeline** (per day/week/month/year of a date field: count + sums); fixed filters; date field + default range; `exportable` + formats csv/xlsx/pdf. |
| D8 | Reports run through each model's own route (`POST /<route>/get/report`, export middlewares: its view permission, archive filter, settings' hidden fields). `/saved-reports/:id/run` and `/export` forward there, so a report never shows more than its reader may see. |
| D9 | Developers (Build, never a panel login) make reports; anyone with the model's view key runs one; panel logins also need `reports:view`, and `reports:export` to download. |
| D10 | MCP: `list_reports`, `run_report` (data), `save_report`, `delete_report` (build), `list_panel_access`, `save_panel_role`, `save_panel_user` (managers / super admin). Panel logins' own AI at `/tenant/panel-mcp` (same router as `/tenant/commerce-mcp`), offering `PANEL_TOOLS` with the login's real keys; links go to the right app. |

## Work orders

| WO | Title | Repo | Status |
|---|---|---|---|
| PU-01 | PanelRole model, PanelAdmin role/superAdmin, `panelAccess`, app-aware login | backend | done 2026-11-21 |
| PU-02 | `/p/:id/panel-users` (all project types), `/p/:id/panel-roles`, panel sidebar Team | backend | done 2026-11-21 |
| RP-01 | Report engine (`getReport.controller.ts`), `POST /<route>/get/report`, `writeTable` | backend | done 2026-11-21 |
| RP-02 | Report model + `/p/:id/saved-reports` (models, preview, CRUD, run, export), Reports nav | backend | done 2026-11-21 |
| RP-04 / PU-05 | MCP tools + `/tenant/panel-mcp` | backend | done 2026-11-21 |
| PU-03 | mint-tenant: Panel users (role, super admin) + Panel roles pages | mint-tenant | todo |
| RP-03 | mint-tenant: Reports page (run, dates, download) + report builder for developers | mint-tenant | todo |
| PU-04 | mint-panel repo (copy of mint-commerce, `IS_PANEL`), panel.tcrypt.site | mint-panel | todo (needs the user's OK for repo/Vercel/domain) |
| RP-05 | Khamar reports (animal register, milk, feed, health, expenses, income, sales) | data | todo (after the backend deploy) |
| PU-06 | User guide (mint-docs) + website | docs | todo |

Smoke: `scripts/tenancy-smoke/panel-users.mjs` (roles, users, super admin, reports, downloads, MCP) and
`commerce-panel.mjs`.

## Endpoints

```
POST /tenant/api/panel/auth/login        { email, password, app: 'commerce' | 'panel' }
/tenant/api/p/:project/panel-users       GET → { doc, totalDocs, roles } · POST · PUT /:id · DELETE /:id
/tenant/api/p/:project/panel-roles       GET → { doc, targets, reports } · POST · PUT /:id · DELETE /:id
/tenant/api/p/:project/saved-reports     GET · GET /models · POST /preview · GET /:id · POST · PUT /:id · DELETE /:id
                                         POST /:id/run { from?, to?, tz? } · POST /:id/export { format, from?, to? }
POST /tenant/api/p/:project/<route>/get/report   the engine, per model
/tenant/panel-mcp                         a panel login's own AI (keys from /tenant/api/panel/auth/mcp-keys)
```

## Left open

- A project that already has a model routed `reports` keeps it in the API, but `reports` is now reserved for new models
  and the panel's Reports page takes that path.
- A project role with only per-model keys (no `records:view`) doesn't see the Reports nav entry.
