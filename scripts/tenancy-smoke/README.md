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
| `node public.mjs` | public API, customers, owner-only records, read-only fields (WO-42), widget.js | |
| `node public-filters.mjs` | public API lists (WO-40): every filter operator per field kind, dates, search, sort, paging, `fields`, 400s, archived rows | archives a row straight in the scratch DB (`SMOKE_MONGO`) |
| `node website.mjs` | website kit + `/site`, `/pages/by-path` | |
| `node website-mcp.mjs` | website settings through the MCP and Site setup (WO-38) | |
| `node secrets.mjs` | Password fields (WO-39): secret-named keys need the kind, stored as text, never in history | |
| `node analytics.mjs` | tracker endpoint (origins, bots), reports | |
| `node access.mjs` | WO-21–24: standard role permissions, project access per member/invitation, the shared media library, invitations in the app, several organizations | stands alone; marks the invitees' emails verified directly in the scratch DB (the real code only goes by email) |
| `node templates.mjs` | Template Studio (docs/templates T-02): starters as templates, validation with fixes, nothing built | counts collections in the scratch DB (`SMOKE_MONGO`); removes its own templates |
| `node templates-preview.mjs` | Template Studio T-03/T-04: templates built into sandbox previews, tickets, preview guard, cleanup, failures undone, starters; endpoints' read-only fields (WO-42) | needs `TENANT_FRONTEND_URL` unset or any value; removes its templates and previews |
| `node templates-manage.mjs` | Template Studio T-05: publish with notes + explanation gate, versions/restore, duplicate, export/import, settings, delete vs archive, save a project as a template | removes its templates |
| `node templates-mcp.mjs` | Template Studio T-06: the Templates MCP (`/templates/mcp`) — `emt_` keys (create, list, revoke), scopes, `emk_`/`emt_` kept apart, a whole session from create to preview link to publish | removes its templates and keys |
| `node webhooks.mjs` | Template Studio T-09: an API project's sidebar; webhooks fired by panel and public-API changes, signed (checked here with the secret), retried 3 times and logged, dropped when deleted; Send test; a new secret; refused addresses (`ftp:`, cloud metadata); the API overview; an API template previewed with endpoints, an endpoint note and a webhook from a question's answer. A local receiver on a random port | deletes its project, template and preview |
| `node collections.mjs` | One collection per project (WO-43): two models with the same unique field in one project, lists/filters/search/stats/counts per model, `_model` can't be changed, bulk duplicate/delete/undo/merge/import, formula recalculation and access on per model, per-model indexes added and dropped, delete with/without data, public API, a super-admin model unchanged (own collection, Mongoose indexes, no `_model`), project delete drops `t_<id>` | reads the scratch DB (`SMOKE_MONGO`) |
| `node migration.mjs` | WO-43 migration: a project built the old way (one collection per model), still working before the move; `scripts/migrateProjectCollections.js` dry run, `--apply`, re-run, `--drop-old`; records byte-for-byte, links, codes, uniqueness, history; super-admin models byte-for-byte; refuses an unknown collection | writes the scratch DB directly; refuses a non-local `SMOKE_MONGO`; ~30 s (waits for recompiles) |
| `node site-builder.mjs` | Site builder (docs/site-builder SB-03): a new website's starter design + home page, the manifest (ETag), validation (unknown type, `javascript:`, duplicate id, depth, style values), pages (add, paths, rev → 409, delete, unpublish, duplicate, home), Publish (problems block it, versions, nothing-changed), `/render` (tree, layout, menu, tags, links, SEO, 404, redirects), restore, releases, other projects and app projects refused, `/sites/resolve`, the sitemap | stands alone |
| `node site-builder-data.mjs` | Site builder data and MCP (SB-09, SB-12, D27): the kit's Site design model; design, SEO, Pages and Contents records kept in step with the builder both ways; a list model with a public API shown by a `collection` (sort, page size, `?page=`), a private model refused (check_site, `/resolve`); template pages with their record and SEO, 404 for no record; Contents bindings live without a Publish; `/data`, `/resolve`, `/contents`; MCP tools, prompts (`build_site` with a theme) and the `publish` scope | stands alone |
| `node oversight.mjs` | the super admin's Organizations / Tenant users / Tenant projects | needs `seedTenancyAdmin.js` on the scratch DB |

`./run-all.sh` runs them all in order (exit 1 on any FAIL).

Another server already on :5001? Point the scripts elsewhere:
`SMOKE_ROOT=http://localhost:5011 SMOKE_MONGO=mongodb://127.0.0.1:27998/emint_tenancy_dev sh run-all.sh`
(the `backend-scratch` launch config runs the backend on :5011 against Mongo :27998).

Accounts are made up (`@example.com`); mail to example.com is printed in the
server log in development.
