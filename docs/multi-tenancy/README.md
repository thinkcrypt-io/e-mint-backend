# Multi-tenancy — overview

**Start here.** This folder is the single source of truth for the multi-tenant
platform: what it is, the decisions behind it, and every step taken. Any agent
picking this up should read this file, then `WORK_ORDERS.md` (what to do, in
order, with status), then `CHANGELOG.md` (what was actually done, newest last).

Backend and admin are **separate git repos** (`backend` → remote `mint`, branch
`v3`; `admin` → remote `origin`, branch `v3`). Never push the backend to
`origin` or `boilerplate`. Commits end with
`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

## 1. What we are building

Today e-mint is one admin panel (the **super-admin panel**, `admin.mintapp.shop`)
where staff build models, pages, sidebars and dashboards, and connect their own
AI through MCP. That panel stays exactly as it is.

We add a **tenant platform** next to it:

1. **Anyone can register** (`/auth/register` in the tenant panel), answering a
   few questions about their business and how they heard of us.
2. Registering creates an **organization** (the tenant) with the new user as
   its owner.
3. Owners and admins **invite people by email** into the organization (same
   flow as the admin invitations we have), with **organization roles**.
4. Users have **two-factor authentication** (email code, passkey, backup codes)
   and **signed-in sessions**, exactly like admins.
5. An organization has **projects**. A project is its own little admin: its own
   **models** (model builder + feature builder), **route builder** pages,
   **sidebar** (sidebar builder), **dashboard** (dashboard builder) and
   **MCP keys**.
6. Every tenant document carries the **organization id** (and the **project
   id** where it lives under a project). A tenant only ever sees records with
   their own ids.
7. A tenant connects **their own AI** (Claude, ChatGPT, …) to their **project's
   MCP endpoint** with a project key; whatever it builds lands in that project.
8. Each model can expose a **public API** for the tenant's own website/app. Per
   model the tenant chooses which actions are public and whether they **require
   their customer to be signed in**. Each project has **customers** (the
   tenant's end users) with register/login endpoints and an embeddable **login
   widget**.

9. A project can be a **website project**: it comes with site configuration,
   pages, per-page SEO, contents (the AGS content model), a read-only site API
   and analytics (a tracker script for the tenant's site and reports).
   An organization can run several websites.

The super-admin panel gets read/manage pages over organizations, tenant users
and projects.

## 2. Decisions (taken — don't re-litigate without the user)

| # | Decision | Why |
|---|---|---|
| D1 | Tenant users are a **new model, `TenantUser`**, not `Admin`. | The super-admin panel must not change; admin tokens and tenant tokens must never be interchangeable. |
| D2 | The tenant is the **`Organization`**. A user can belong to several (`OrganizationMember`); the token carries the **active organization** (`org` claim) and `kind: 'tenant'`. Switching organization issues a new session. | The org is in the signed token, so no header can be forged to reach another org. |
| D3 | **Projects** (`TenantProject`) live under an organization. Models, route pages, sidebar, dashboard and MCP keys live under a project. | "Models would be under projects." |
| D4 | Builder metadata stays in the **same collections** (`modeldefinitions`, `routesettings`, `routeconfigs`, `routeversions`, `sidebarcategories`, `sidebaritems`, `dashboardconfigs`, `apikeys`, `builtfeatures`) with `organization` + `project` fields. Super-admin documents have neither. | The user asked for tenant ids on the records, and it lets every builder controller be reused unchanged. |
| D5 | Scoping is enforced **centrally**: a request-scoped context (`AsyncLocalStorage`) plus a Mongoose plugin on those collections that adds `{ organization, project }` to every query and stamps it on every insert. With no tenant context the plugin adds `project: null` — so the super-admin panel never sees tenant documents. | One place to get right instead of hundreds of query sites; a forgotten filter can't leak. |
| D6 | A tenant model is compiled under an **internal Mongoose name** `T<projectId>_<Name>` and collection `t_<projectId>_<route>`; inside the project it is known by its plain `name`/`route`. References between tenant models are by plain name within the project; tenants **cannot link to code models** (Admin, invoices…). | Mongoose model names and collections are global per connection; tenants must never reach platform data. |
| D7 | The tenant panel is the **same admin codebase**, run with `NEXT_PUBLIC_PANEL=tenant` and `NEXT_PUBLIC_BACKEND=<api>/tenant/api` (a second Vercel project / second dev server on :3001). It imports the **same `components/library` UI components** — no copies. | "Shared components should pull from the same library file UI components." |
| D8 | Tenant API: `/tenant/api/*` for account/organization calls, `/tenant/api/p/:projectId/*` for everything inside a project (it mirrors the admin API's paths, so the library components work unchanged). The frontend picks the base per request. | Reuse every page and component as-is. |
| D9 | Tenant MCP at **`/tenant/mcp`** (same tools as `/mcp`), keys bound to one organization + project. | "Their own MCP using their own key… builds models under their project." |
| D10 | The platform's **"Build with AI"** (server `ANTHROPIC_API_KEY`) is **off** for tenants; they bring their own AI through MCP. | The platform shouldn't pay for tenants' AI (same reason as the MCP plan). |
| D11 | **Public API** at `/public/api/:projectSlug/:route` (no admin auth). Per model `publicApi: { enabled, actions[], auth: 'none' | 'customer' }`. Customers are `ProjectCustomer` docs (project-scoped), tokens `kind: 'customer'`. Login widget = one script `/public/widget.js` + `/public/api/:projectSlug/auth/*`. | "Option to build public API, select if they enforce authentication, login widget for their customers." |
| D12 | v1 leaves out for tenant models: per-record **access** (owner/private/public — it is built on `Admin`), bulk **merge** across models, and code-model links. They are listed as follow-ups. | Keeps v1 shippable; each needs its own design. |
| D13 | **Website projects** are projects with `type: 'website'`, seeded with a **website kit** of ordinary tenant models (SiteSettings, WebPage, PageSeo, WebContent — modelled on the AGS backend) plus a read-only **site API** and **analytics** (tracker script + event store + reports). An organization can have many websites. | "Website projects… multiple websites… configuration, APIs, contents, pages, SEO for individual pages, analytics, just like the AGS project." Kit models stay editable in the builder. |
| D14 | **Standard role permissions** (WO-21): `records:view/create/edit/delete` for every model (and media, customers, analytics) in the member's projects, then `build`, `manage-api-keys`, `create-projects`, `manage-projects`, `manage-members`, `manage-roles`, `manage-organization`. No per-model keys; `grants()` maps `view-<route>`… onto the record keys; old `data:*`/`data:view` still read and normalized away on save. | "The specific item permission not necessary — view, edit, delete and some specific permission first, which is the standard." |
| D15 | **Project access per member** (WO-22): `allProjects` (default) or `projects[]` on OrganizationMember and OrganizationInvitation; Owner/Admin always all. A project the member can't open answers 404 everywhere (lists, `/p/:id`, self, MCP keys). Narrowing work = fewer projects, not finer permissions. | "Invite other users and give access to projects, with user roles." |
| D16 | **Media library per project** (WO-23): `TenantProject.mediaScope` `project` (own) or `organization` — files and folders of the shared library carry `{organization, project: null}`; the project router runs `/upload`, `/media`, `/files` in that scope. Switching moves nothing. Super admin still sees only `organization: null`. | "Users can decide if media should be project specific or organization specific." |
| D17 | **Invitations in the app need a verified email** (WO-24): sign-up doesn't verify, so `for-me` lists invitations only once `emailVerified` (emailed code, an invitation link used, or a password reset by email) — nobody can sign up with someone's address and take their invitations. A signed-in invitee joins from the emailed link in one click. | "If a user is invited to B's workspace, that would show up too." |
| D18 | **Project addresses: `/<publicSlug>/<page>`** (tenant panel): `/acme-store` dashboard, `/acme-store/<route>` table, `/acme-store/<route>/<id>` record, `/acme-store/model-builder…` tools; org/account pages unprefixed. `src/proxy.ts` rewrites them onto the app's pages (no page copied); the project comes from the address (per tab), not localStorage; `/p/:project` takes the slug or the id. A project-page address with no project (`/dashboard`, old links) redirects into the browser's last project (`mint_project` cookie, set when a tab is in front). publicSlugs never equal a page name (`PANEL_PAGES`); model routes never equal a project page (`images`, `public-api`, `t` added to the reserved list). | "Inside projects the url should be /{project}/{page}, so each project gets its own pages." |
| D19 | **Per-record access in projects** (WO-31): a model's *Restrict access to each record* works in tenant projects — owner (`addedBy`), privacy (only-me / private / public) and an access list, all `TenantUser`s; sharing offers the organization's members who can open the project (`projectPeople`, `/p/:project/access-users`). It sits on top of the role's Records permissions. No notifications in projects. The public API only reaches `privacy: 'public'` records, and what a site creates is public. | "Models must have access control … access to certain other users using the ERP." |

## 3. Architecture

```
                 super-admin panel (admin, NEXT_PUBLIC_PANEL=admin)
                        │  Bearer admin token (no `kind`)
                        ▼
  /admin/api/*  ── adminProtect ── unchanged; tenant scope = none → queries get project:null

                 tenant panel (same admin code, NEXT_PUBLIC_PANEL=tenant)
                        │  Bearer tenant token { _id, sid, kind:'tenant', org }
                        ▼
  /tenant/api/auth/*            register (+ onboarding answers), login, 2FA, sessions, self
  /tenant/api/org/*             organization, members, roles, invitations, switch
  /tenant/api/projects          CRUD (org-scoped)
  /tenant/api/p/:projectId/*    tenantProtect → projectAccess → runInScope({org, project})
        ├─ /builder/*           the same builder routers, scoped by the plugin
        ├─ /sidebarcategories, /sidebaritems, /sidebar/:platform/:type
        ├─ /dashboard/*, /upload, /media (org-scoped files)
        └─ /<route>             the project's built models (tenant registry)

  /tenant/mcp                   project API key → same MCP tools, scoped
  /public/api/:slug/*           the project's public API + customer auth
  /public/widget.js             the customer login widget
  /public/api/:slug/site|pages  website projects: site settings, pages + SEO + contents
  /public/api/:slug/track       website analytics events (from /public/track.js)
```

### Scope context (WO-03)
`library/functions/tenantScope.function.ts`:
- `runInScope(scope, fn)` / `scopeMiddleware` — sets `{ organization, project }`
  for the rest of the request.
- `currentScope()` — the scope or `null` (super admin / system).
- `runUnscoped(fn)` — for system work that must see every document (the model
  registry sync, migrations).
- `tenantScoped` Mongoose plugin — on `find*`, `count*`, `update*`, `delete*`,
  `aggregate` (prepends `$match`) and `save`/`insertMany`.

### Naming
| Thing | Tenant value |
|---|---|
| Mongoose model | `T<projectId>_<Name>` |
| Collection | `t_<projectId>_<route>` |
| Route key (RouteSettings/RouteConfig `route`) | plain `route`; uniqueness is per project (compound index) |
| Permission keys | `view-<route>` etc., checked against the **organization role** |
| Counter slug | `model-T<projectId>_<Name>` |

## 4. Glossary
- **Super admin** — a staff `Admin` of the platform, using the existing panel.
- **Tenant / organization** — a customer company. Owns projects.
- **Tenant user** — a person who signed in to the tenant panel (`TenantUser`).
- **Member** — a tenant user's membership of an organization, with a role.
- **Project** — a workspace in an organization: models, pages, sidebar, dashboard, MCP keys, public API.
- **Customer** — a tenant's own end user, signing in to the tenant's website through the public API / widget.

## 5. Where things are

**Backend**
| Area | Files |
|---|---|
| Scope (the isolation) | `library/functions/tenantScope.function.ts` (+ `test/tenantScope.test.ts`) |
| Tenant models | `library/models/tenancy/` — TenantUser, Organization, OrganizationRole/Member/Invitation, TenantProject, ProjectCustomer, WebsiteEvent, oversight.settings |
| Permissions, helpers | `library/functions/tenantPermissions.function.ts`, `tenancy.function.ts`, `tenantNav.function.ts`, `projectHooks.function.ts`, `rateLimit.function.ts` |
| Model registry per project | `library/functions/dynamicModels.function.ts` (Registry per scope, internalModelName), `routeRegistry.function.ts` (per-scope mounts, scopedModel) |
| Sessions / 2FA for both kinds | `library/functions/sessions.function.ts` (makeSessions), `library/controllers/twoFactor/*` (makeTwoFactor, makeTwoFactorRouter) |
| Tenant API | `routes-tenant/` — tenant.router, auth/, org/, projects/, project.router (`/p/:projectId`), analytics.router, mcp.router (`/tenant/mcp`) |
| Guards | `middleware/tenant/protect.tenant.middleware.ts`, `dual.middleware.ts` |
| Public API, widget, tracker | `routes-public/` (`/public`) |
| Website kit | `library/functions/websiteKit.function.ts` |
| Super-admin oversight | `routes-admin/admin.router.ts` (`/organizations`, `/tenant-users`, `/tenant-projects`) |
| Scripts | `migrateTenantIndexes.js`, `seedTenancyDev.js` (local only), `seedTenancyAdmin.js`, `tenancy-smoke/` (run-all.sh) |

**Admin repo (both panels)**
| Area | Files |
|---|---|
| Panel mode, API base, page paths | `src/components/library/config/lib/constants/panel.ts` |
| Tenant UI building blocks | `src/components/library/tenant/` |
| Tenant API hooks | `src/components/library/store/services/tenantApi.ts` |
| Pages | `/auth/register` (TenantRegister), `/auth/accept-invitation` (TenantAcceptInvitation), `/projects`, `/org/{members,roles,settings,new}`, `/t/[slug]`, `/public-api`, `/analytics` |
| Project access, media library, in-app invitations | `tenancy.function.ts` (`opensAllProjects`, `projectAccessFilter`, `canOpenProject`), `org.router.ts` (`checkAccess`, `joinFromInvitation`, `/invitations/for-me`), `project.router.ts` (`mediaLibrary`), auth `verify-email`; admin `tenant/ProjectAccessPicker.tsx`, `tenant/Workspaces.tsx`, `pages/media/useMediaRoot.ts` |
| User guides (tenants' docs) | `/user-docs` (+ `_components/guides.ts`, `UserGuide.tsx`); guide links go through `panel.ts docsPath` |

Deploying: `DEPLOY.md`.
