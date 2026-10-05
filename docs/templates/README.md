# Templates — overview

**Start here.** This folder is the single source of truth for **Template
Studio**: the super admin's templates for new projects. Read this file, then
`WORK_ORDERS.md` (what to do, in order, with status — its Handoff section
first), then `CHANGELOG.md` (what was actually done, newest last).

Builds on the tenant platform — read `../multi-tenancy/README.md` (D1–D19)
before touching the apply engine or the sandbox.

Backend and admin are **separate git repos** (`backend` → remote `mint`,
branch `v3`; `admin` → remote `origin`, branch `main`). Never push the backend
to `origin` or `boilerplate`. Commit/push only when the user asks. Commits end
with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

## 1. What we are building

**The user's words (2026-10-04):** "from the super admin we can build the
templates, nothing gets built … just the template. For example templates for
blogs, ecommerce, other websites, or for apps and APIs like a finance
management system … users can either use a pre-existing template; when they
choose a template the app will be built and later they can modify it."
Then: "the super admin MCP should be different … we'll use the MCP on Claude
to build the templates, also can be built on the panel … app, api, website …
everything should be explanatory so that users can work perfectly … this is
for the super admin panel, not the app panel."

1. A **template** is a saved **blueprint**: models, pages, sidebar,
   dashboard, roles, public API, website pages and settings, sample data,
   questions and a setup guide. Saving one **builds nothing**.
2. Three **types**: **App** (models + sidebar, dashboard, roles), **API**
   (models + public endpoints, customer sign-in, webhooks, example requests),
   **Website** (models + pages, content blocks, SEO, site defaults, starter
   code).
3. The super admin makes templates in **two ways**, on the same data:
   - the **Template Studio** in the super admin panel (`/templates`), and
   - the **Templates MCP** (`/templates/mcp`) — a separate MCP server with its
     own keys, so Claude (Code, Desktop, claude.ai) writes templates. It can
     only touch blueprints; it can never build in the platform or a project.
4. A super admin **previews** a template: it is built into a throwaway
   project in a hidden sandbox organization, opened in the tenant panel, and
   deleted after 6 hours.
5. **Publishing** makes a version available. A tenant picks a template when
   creating a project (later work order); the template is **built into their
   project** and from then on it's **their copy** — they change it with the
   normal builders, and later template versions don't touch it.
6. **Everything explains itself**: every template carries who it's for, what's
   inside (generated), a setup guide, and descriptions on every model; every
   editor tab and every MCP tool explains what it's for; `/docs/templates`
   covers the whole studio.

## 2. Decisions (taken — don't re-litigate without the user)

| # | Decision | Why |
|---|---|---|
| TD1 | A template is **data only**: one `ProjectTemplate` document (`projecttemplates`) owned by the super admin. **Not** `tenantScoped` — it belongs to the platform, and tenants only ever read published versions through a dedicated endpoint. Saving never compiles a model, creates a collection, or writes a sidebar/dashboard. | "Nothing gets built, just the template." |
| TD2 | Template **types `app`, `api`, `website`**. `api` becomes a real **project type** too (`TenantProject.type`), whose workspace opens on its API (base URL, keys, endpoints, customers, webhooks) rather than on tables. | An API template needs a project shaped like an API. |
| TD3 | The **models** part of a blueprint uses the **feature plan shape** already in use (`features.schema.ts` `planFromAi`; `STARTERS`, `WEBSITE_KIT`): steps of models with fields, links, tabs, page layout. No second model format. | One format for the AI, the wizard, starters, the kit and templates; `buildFeature` already builds it. |
| TD4 | **Validation without building**: `planFeature` runs inside an empty **dry scope** (`runInScope` with a fresh, unused project id) so name/route checks see an empty project — exactly what a new project is. Plus checks for pages, endpoints, placeholders and explanations. | Real checks, nothing written. |
| TD5 | **Draft and published are separate**: editing always changes `draft`; **Publish** copies the draft into an immutable `versions[]` entry (number, notes, who, when) and sets `published`. Projects record the template key + version they came from. | Editing a live template must never change what tenants get mid-flight. |
| TD6 | **Questions + placeholders**: a template lists questions (business name, currency, language, colour…); any blueprint string can hold `{{key}}`, filled at apply time before planning. Unanswered optional questions use their default. | One template fits many businesses. |
| TD7 | **One apply engine** (`applyTemplate`) for previews now and tenants later: models (one plan with the template limit `TEMPLATE_MAX_STEPS` = 40 instead of the feature wizard's 12 — not batches, which couldn't be checked without building), page layouts, sidebar, dashboard, roles, public API, website pages/contents/SEO and site defaults, sample data, setup guide. All or nothing: a failure undoes what it did. | The preview must be exactly what a tenant gets. |
| TD8 | **Sandbox previews**: a hidden **system organization** (`system: true`, never listed in oversight, no password sign-in) holds preview projects. The super admin opens one through a **single-use, 5-minute preview ticket** exchanged by the tenant panel for a session as the sandbox owner (sandbox org only). Preview projects (models, their `t_<projectId>` collection, kit, media) are deleted after 6 hours. Builds run **in the background** (`preview.status` building → ready / failed): a request waits up to 20 s (`TEMPLATE_PREVIEW_WAIT_MS`), under the platform's 30-second limit, then answers `building`; MCP `preview_status` and the previews list say when it's ready. One build per template at a time. | "Preview before publish" without giving the super admin a tenant account or letting previews leak. |
| TD9 | **Templates MCP is separate**: `/templates/mcp`, server name `e-mint-templates`, its own keys (`TemplateKey`, `templatekeys`, secret `emt_…`, sha256 only) with scopes **`read`, `write`, `preview`, `publish`**. Keys act as the admin who made them and never beyond their role. The shared JSON-RPC transport is extracted from `/mcp` so both servers use one implementation. | "This MCP must be different" — a template key can't build in the platform, an admin key can't edit templates. |
| TD10 | **Admin permissions** (`scripts/seedTemplateAccess.js`, the role editor's option-key pattern): `templates` → `view-/create-/edit-/delete-templates`; `template-publishing` → `edit-template-publishing`; `template-keys` → `view-/create-/delete-template-keys`. A `*` role has them all. | Publishing reaches every tenant; it gets its own permission. |
| TD11 | **Explanation gate on publish**: summary, description, audience, at least one setup-guide step, and a description on every model are **required**; a field without help text, a page without SEO description, or an endpoint without a note is a **warning**. "What's inside" is **generated** from the blueprint, never typed. | "Everything should be explanatory so users can work perfectly." |
| TD12 | **Visibility**: `everyone`, `organizations` (a list — beta testers), or `hidden`. | Try a template with chosen customers first; lines up with plans later. |
| TD13 | **Save as template** captures a project's **structure** (models, layouts, sidebar, dashboard, public API, website pages/settings) into a new draft. **Records are never copied from a tenant project**; sample data is captured only from sandbox projects. | Fast authoring without taking tenants' data. |
| TD14 | The 4 code **starters** (`starterTemplates.function.ts`) become the first templates (upserted by `key` at boot if missing). The code copies stay as the fallback when the collection is empty, like route settings (DB copy, code fallback). | No second starter system. |
| TD15 | Template edits go into the admin **History** (`recordHistory`), so who changed or published what is visible. | Same as every other admin change. |

## 3. Architecture

```
                 Super admin panel                      Claude (Code / Desktop / claude.ai)
          /templates  /templates/[id]  /templates/connect            │  emt_ key
                 │  admin JWT                                        ▼
                 ▼                                         /templates/mcp  (JSON-RPC, shared transport)
  /admin/api/templates/*  ─────────────┐                           │
                                         ▼                           ▼
                           templates.service.ts  (one service for both)
                 ┌──────────────┬─────────────────┬──────────────────┬─────────────────┐
             normalize      validate (dry      versions/publish   applyTemplate      saveAsTemplate
             blueprint      scope planFeature) duplicate/export   (batched build)    (structure only)
                                                                        │
                                          ┌─────────────────────────────┴───────────┐
                                    sandbox project (preview, 6h)           tenant project (later, T-14)
                                    system org, preview ticket → tenant panel
```

### Blueprint (inside `draft` and each version)

```ts
{
  type: 'app' | 'api' | 'website',
  overview: { name, summary, description /* markdown */, audience, category, tags[], icon, color, cover, screenshots[] },
  questions: [{ key, label, help, kind: 'text'|'select'|'currency'|'locale'|'color'|'image', options?, default?, required }],
  models: { steps: [/* feature-plan steps (TD3), create only */], sidebarCategory: string },
  sidebar: [{ name, icon, description, items: [{ model, label }] }],
  dashboard: [/* dashboard widgets, normalizeWidget shape; route = a model's name or route */],
  roles: [{ name, description, permissions: [/* ORG_PERMISSIONS */] }],
  endpoints: [{ model, actions[], auth: 'none'|'customer', ownerOnly, readOnly: [fieldKeys], note }],   // every type; readOnly = never written by the public API (multi-tenancy D20)
  webhooks: [{ model, events: ['create'|'update'|'delete'], note }],             // api (target URL asked at apply)
  website: {
    pages: [{ path, name, status, template, showInMenu, parent, seo: {…}, contents: [/* WebContent blocks */] }],
    settings: { /* WebsiteSettings subset: identity, colours, fonts, seo defaults, social */ },
    starter: { repoUrl, framework, deployUrl, env: [{ key, value }] }
  },
  sampleData: { [model]: [/* records; references by displayField value */] },
  guide: { steps: [{ title, body, page /* route or tool key */ }], faq: [{ q, a }] }
}
```

Parts per type (`PARTS_BY_TYPE`): every type has overview, questions, models,
sidebar, dashboard, roles, endpoints, sampleData, guide; **api** adds webhooks;
**website** adds website. Anywhere a part names a model it may use the model's
name, title or route (a website: also the kit's `pages`, `seo`,
`web-contents`). Built-in placeholders: `{{project}}`, `{{slug}}`, `{{api}}`.

### Where things are (fill in as work orders land)

| What | Where |
|---|---|
| Models | `backend/library/models/templates/` — `projectTemplate.model.ts`, `templateKey.model.ts` |
| Service | `backend/library/controllers/templates/templates.service.ts` |
| Blueprint shape, placeholders, What's inside | `backend/library/controllers/templates/blueprint.ts` |
| Validator (dry scope) | `backend/library/controllers/templates/validate.ts` |
| Admin API | `backend/library/controllers/templates/templates.router.ts` → `/admin/api/templates` (mounted in `routes-admin/admin.router.ts`) |
| Starters as templates | `backend/library/functions/templateSeed.function.ts` (boot seed in `server.ts`; `GET/POST /builder/starters` read it) |
| Permissions | `backend/scripts/seedTemplateAccess.js` |
| Apply engine | `backend/library/functions/applyTemplate.function.ts` |
| Project create/remove (shared with the projects router) | `backend/library/functions/projectLifecycle.function.ts` |
| Sandbox, tickets, cleanup | `backend/library/functions/templateSandbox.function.ts`; ticket exchange `POST /tenant/api/auth/preview`; guard in `middleware/tenant/protect.tenant.middleware.ts` (`previewMayWrite`) |
| Preview page + banner (tenant panel) | `admin/src/app/preview/page.tsx`, `admin/src/components/library/tenant/PreviewBanner.tsx` |
| MCP | `backend/library/controllers/mcp/transport.ts` (shared), `backend/library/controllers/templates/mcp.router.ts` → `/templates/mcp`; keys `templates/keys.ts` |
| AI sample data | `backend/library/controllers/templates/sampleAi.ts` → `POST /admin/api/templates/:id/ai/sample-data` |
| Panel | `admin/src/app/templates/` — gallery `page.tsx`, shared `_components/` (ui, StudioDialog, New template, Capture), editor `[id]/page.tsx` + `[id]/_components/` (one file per tab — the five website tabs share `website.ts`, one working copy of the `website` part — ProblemsPanel, Preview/Publish dialogs); RTK `admin/src/components/library/store/services/templatesApi.ts` |
| Guide | `admin/src/app/docs/templates/page.tsx`, listed in `docs/_components/guides.ts` |
| API projects, webhooks (T-09) | Models `library/models/tenancy/projectWebhook.model.ts`, `webhookDelivery.model.ts`, `apiCall.model.ts`; sending `library/functions/webhooks.function.ts` (fired from `recordHistory` and `routes-public/public.router.ts`); tenant API `routes-tenant/webhooks.router.ts` → `/tenant/api/p/:id/webhooks` and `/api-overview`; sidebar `library/functions/tenantNav.function.ts` (`tenantLead`) |
| API projects, webhooks — panel | `admin/src/app/webhooks/` (page, dialog, delivery log, `verify.ts`), `admin/src/components/library/tenant/ApiOverview.tsx` (an API project's dashboard), example requests `admin/src/app/public-api/_components/ExampleRequest.tsx` + `api.ts` `exampleRequests`; studio tabs `EndpointsTab.tsx`, `WebhooksTab.tsx` |
| Smoke | `backend/scripts/tenancy-smoke/templates*.mjs`, `webhooks.mjs` (in `run-all.sh`) |
| Sidebar entry | Config → Templates, seeded by `backend/scripts/seedTemplateAccess.js` |
