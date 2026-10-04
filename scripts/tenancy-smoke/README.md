# Tenancy smoke tests

End-to-end checks for the multi-tenant API (docs/multi-tenancy). They run
against a **throwaway local server**, never a shared database:

```
mongod --dbpath <scratch dir> --port 27999
MONGO_CONNECTION_URI=mongodb://127.0.0.1:27999/emint_tenancy_dev node scripts/seedTenancyDev.js
npm run build
# start the `backend-test` launch config (backend on :5001 against that DB)
```

Then, from this folder:

| Script | Covers | Notes |
|---|---|---|
| `node admin.mjs` | admin login, sessions, 2FA (unchanged by tenancy) | turns 2FA on and off again |
| `node tenant-auth.mjs` | register, login, 2FA, sessions, passwords, cross-kind tokens | |
| `node org-1.mjs` then `node org-2.mjs <nina> <editor> <existing>` | organizations, roles, invitations | org-2 takes the three invitation tokens from the server's dev mail log (`[mail → …] …/accept-invitation/<token>`) |
| `node projects.mjs` then `node models.mjs` | projects; the tenant model registry (same model names in two orgs, isolation, codes, populate, builder guards, sidebar, super admin unaffected, forced delete) | the scripts below use projects.mjs's state |
| `node media.mjs` | project uploads/media manager, admin-only S3 routes refused | no real upload (the bucket is real) |
| `node mcp.mjs` | tenant MCP keys, tools, builds in the project, key isolation | |
| `node public.mjs` | public API, customers, owner-only records, widget.js | |
| `node public-filters.mjs` | public API lists (WO-40): every filter operator per field kind, dates, search, sort, paging, `fields`, 400s, archived rows | archives a row straight in the scratch DB (`SMOKE_MONGO`) |
| `node website.mjs` | website kit + `/site`, `/pages/by-path` | |
| `node website-mcp.mjs` | website settings through the MCP and Site setup (WO-38) | |
| `node secrets.mjs` | Password fields (WO-39): secret-named keys need the kind, stored as text, never in history | |
| `node analytics.mjs` | tracker endpoint (origins, bots), reports | |
| `node access.mjs` | WO-21–24: standard role permissions, project access per member/invitation, the shared media library, invitations in the app, several organizations | stands alone; marks the invitees' emails verified directly in the scratch DB (the real code only goes by email) |
| `node templates.mjs` | Template Studio (docs/templates T-02): starters as templates, validation with fixes, nothing built | counts collections in the scratch DB (`SMOKE_MONGO`); removes its own templates |
| `node templates-preview.mjs` | Template Studio T-03/T-04: templates built into sandbox previews, tickets, preview guard, cleanup, failures undone, starters | needs `TENANT_FRONTEND_URL` unset or any value; removes its templates and previews |
| `node templates-manage.mjs` | Template Studio T-05: publish with notes + explanation gate, versions/restore, duplicate, export/import, settings, delete vs archive, save a project as a template | removes its templates |
| `node templates-mcp.mjs` | Template Studio T-06: the Templates MCP (`/templates/mcp`) — `emt_` keys (create, list, revoke), scopes, `emk_`/`emt_` kept apart, a whole session from create to preview link to publish | removes its templates and keys |
| `node oversight.mjs` | the super admin's Organizations / Tenant users / Tenant projects | needs `seedTenancyAdmin.js` on the scratch DB |

`./run-all.sh` runs them all in order (exit 1 on any FAIL).

Another server already on :5001? Point the scripts elsewhere:
`SMOKE_ROOT=http://localhost:5011 SMOKE_MONGO=mongodb://127.0.0.1:27998/emint_tenancy_dev sh run-all.sh`
(the `backend-scratch` launch config runs the backend on :5011 against Mongo :27998).

Accounts are made up (`@example.com`); mail to example.com is printed in the
server log in development.
