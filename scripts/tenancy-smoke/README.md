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
| `node website.mjs` | website kit + `/site`, `/pages/by-path` | |
| `node website-mcp.mjs` | website settings through the MCP and Site setup (WO-38) | |
| `node secrets.mjs` | Password fields (WO-39): encrypted, never in responses, reveal with your own password, history, bulk import | |
| `node analytics.mjs` | tracker endpoint (origins, bots), reports | |
| `node access.mjs` | WO-21–24: standard role permissions, project access per member/invitation, the shared media library, invitations in the app, several organizations | stands alone; marks the invitees' emails verified directly in the scratch DB (the real code only goes by email) |
| `node oversight.mjs` | the super admin's Organizations / Tenant users / Tenant projects | needs `seedTenancyAdmin.js` on the scratch DB |

`./run-all.sh` runs them all in order (exit 1 on any FAIL).

Accounts are made up (`@example.com`); mail to example.com is printed in the
server log in development.
