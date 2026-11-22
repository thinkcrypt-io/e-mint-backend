# Demo logins

Asked 2026-11-22: a project's managers make **one demo login** in the tenant panel (Project → Panel users). It gives a
**demo link**. Opening the link signs the visitor straight into the panel app (or the commerce panel for a store). Any
login already in that browser is signed out first. The link shows a loading screen ("Signing you in", "Making your
demo", "Ready") and then the panel. Each visit gets a token that lasts **one hour**. After that the token is refused
and the app signs out to a "Your demo has ended" page with a button to open the link again, which starts a new hour.

The Thinkcrypt website (Easy Instant Commerce → demo stores) and the Commerce OS website (demos) used to print a
shared email and password for each demo store. They now open the demo link instead, so no password is public.

## Decisions

| # | Decision |
|---|---|
| D1 | A demo login is a `PanelAdmin` with `demo: true` and a secret `demoKey` (24 random bytes, base64url). At most one per project, so the link stays the same until a manager makes a new one. |
| D2 | It has no password, so it can't be signed in to at /auth/login. Its username is `demo-<random>` and is never shown. |
| D3 | `POST /tenant/api/panel/auth/demo { key, app }`, public and rate-limited, issues a session (method `demo`) whose JWT says `demo: true` and expires in **1 hour** (`expiresIn`). The same app checks as the password sign-in apply (`use_panel` / `use_commerce`). |
| D4 | An expired token answers 401 `SESSION_EXPIRED` (any token, not only demos). The apps' SessionGuard signs out on it. A demo goes to `/demo` ("Your demo has ended", "Start again") and any other login goes to the sign-in page. The app also signs out when the hour is up while the tab is open. |
| D5 | What it may do comes from its access, like any login: a panel role, or super admin (a store also has its store admin set). It is **never** given `manage-panel-users`, even as super admin, so a visitor can't make real logins. It can't change its password or name, and it can't make AI keys. Other than that, the role decides what visitors may change, so pick a view-only role to keep the data as it is. |
| D6 | Only the project's managers (tenant panel) make, change and remove it. Panel super admins don't see it in their Panel users list, and its row can't be changed from the panel apps. |
| D7 | **New link**: makes a new key. The old link stops working and its open demos are signed out. **Switch off** makes the link refuse. **Remove** deletes the login. |
| D8 | The link is `<app>/demo/<key>`, where `<app>` is the commerce panel for a store and the panel app for anything else. The tenant panel builds it from the same app addresses it already shows. |

## Work orders

| WO | Title | Repo | Status |
|---|---|---|---|
| DL-01 | `demo` + `demoKey` on PanelAdmin, `generateAuthToken` with a 1-hour expiry for demos, `POST /panel/auth/demo`, 401 `SESSION_EXPIRED`, demo limits (no manage-panel-users, password, name, AI keys) | backend | Done 2026-11-22, not deployed |
| DL-02 | `/p/:id/panel-users/demo`: GET (the demo login + key), POST (make it, with access), POST `/demo/new-link`; PUT/DELETE `/:id` work for it from the tenant panel; panel apps' list leaves it out | backend | Done 2026-11-22, not deployed |
| DL-03 | Tenant panel: a **Demo login** card on Panel users (make it, copy/open the link, change access, new link, switch off, remove), copied to mint-commerce and mint-panel | mint-tenant + copies | Done 2026-11-22, pushed |
| DL-04 | Panel apps: `/demo/<key>` loading screen (signs out, gets the demo, signs in, opens the panel), `/demo` "Your demo has ended", SessionGuard on `SESSION_EXPIRED`, a sign-out timer at the hour, demo hides Change password | mint-panel + mint-commerce | Done 2026-11-22, pushed |
| DL-05 | Websites: a `demoUrl` on the demo store records. When set, the panel button opens it and the email and password rows are hidden | thinkcrypt-website, mint-commerce-website | Done 2026-11-22: `demoUrl` added to `ec-demos` and `demo-stores` and filled on prod for all 14 records |
| DL-06 | Guide (mint-docs panel users) + this doc + handoff | docs | Done 2026-11-22 |

Prod, 2026-11-22 (after the deploy): `scripts/makeDemoLogins.js --apply admin1…admin6@mintapp.site project:Footshop`
made one demo login per demo store (store admin access, copied from each store's shared login; Stridehaus by its
project, since the `admin7@mintapp.site` the sites printed never existed). Thread Theory and Loomline share the
Fabrilife project, so they share its link. The links are in each record's `demoUrl`; both sites open them and land
on the dashboard (checked headless on thinkcrypt.dev and commerce.tcrypt.site). The Commerce OS words now say the
panels open with no password. The old `loginEmail` / `password` fields stay on the records, hidden when `demoUrl` is set.

Panel apps: the demo page sets the token through the store (`refreshAuth`), not localStorage — the store writes
its own token back to storage on every change, so a direct write is lost.

Test: `scripts/tenancy-smoke/demo-logins.mjs` (API), plus a headless run of the link → dashboard → timer → "Start
again" → expired token → bad link on a local stack.

## Endpoints

```
POST /tenant/api/panel/auth/demo                 { key, app } → { token, project, expiresAt }   public; 400 demo_link_off
/tenant/api/p/:project/panel-users/demo          GET → { demo: login + demoKey | null }   POST { role?, superAdmin? }
POST /tenant/api/p/:project/panel-users/demo/new-link   → { demo }   old link stops, its sessions are signed out
PUT / DELETE /tenant/api/p/:project/panel-users/:id      change access, switch off, remove (tenant managers only for the demo)
```
