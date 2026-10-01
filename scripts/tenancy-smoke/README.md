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
| `node projects.mjs` then `node models.mjs` | projects; the tenant model registry (same model names in two orgs, isolation, codes, populate, builder guards, sidebar, super admin unaffected, forced delete) | models.mjs uses projects.mjs's state |

Accounts are made up (`@example.com`); mail to example.com is printed in the
server log in development.
