# Templates — work orders

Read `README.md` first (decisions TD1–TD15, blueprint, architecture).
Each item: **why → files → change → done when**. `BLOCKER` gates later items.
Sizes: **S** ≤ 1h, **M** ≤ half a day, **L** ≤ 2 days.
Paths are from the monorepo root `/Users/asifistiaque/Desktop/proj/e-mint`.
Update the **Status** column and `CHANGELOG.md` as each item lands.

## Handoff — read this first (kept current; last updated 2026-10-04)

**Where it stands:** T-01…T-12 done and pushed (backend `v3`, admin `main`,
marketing site `mint-webpage` `main`): the studio's backend, the Templates MCP
(T-06), the studio in the super admin panel with an editor for every part
(T-07 gallery, editor, common tabs; T-08 Sidebar, Dashboard, Roles; T-09
Public API and Webhooks; T-10 Pages, Content, SEO, Site settings, Starter
code) and API projects with outgoing webhooks for tenants (T-09); T-11
Connect Claude page (`/templates/connect`, emt_ keys) and the dashboard's
Templates overview widget; T-12 the guide/explanation pass (all 29 guide
sections linked from the studio, every link lands). `PartSummary` is no
longer used by any tab.
**Next: T-13** (the first templates, written with Claude through the
Templates MCP, previewed and published — Claude connects with a key from
/templates/connect, no server API key needed). The user's rule: commit
and push each WO as it finishes, then go on.

**Previews build in the background (T-16, 2026-10-05):** a 14-model template
took 100–200 s to preview on production (Atlas round trips), past the
platform's 30-second request limit, so the MCP client saw only "the
connector's server returned an error" while the build finished anyway. Now a
request waits 20 s (`TEMPLATE_PREVIEW_WAIT_MS`), then answers `building` with
a preview id; MCP `preview_status` / the studio's previews list (polled) say
ready or failed. One build per template at a time. Pushed: backend `v3`
`f2ab1437`, admin `main` `2692d1d`. Not yet deployed — production needs the
backend redeployed before the T-13 previews work.

**On deploy:** run `node scripts/seedTemplateAccess.js` on the real DB (the
permissions and the Config → Templates sidebar item); the starter templates
seed themselves at boot.

**Scope:** the **super admin panel** and the Templates MCP. The tenant side
(choosing a template when creating a project) is T-14, after the studio works.

**Checking the panel headless:** the `admin-scratch` launch config (:3012 →
backend :5011). Sign in by storing the login's token as `MINT_ADMIN_TOKEN`
(see memory on visual verification). With the browser pane hidden, renders
stall until a `focus` event is dispatched on `window` — poke it after each
action. `window.open` (Preview) replaces the pane's tab.

**Run it locally:** same setup as multi-tenancy (`../multi-tenancy/WORK_ORDERS.md`
→ Handoff → Run it locally): scratch Mongo :27999, `backend-test` :5001
(`npm run build` after every backend change, then restart), `admin-test`
:3002 (super admin), `tenant` :3001 (previews). Smoke:
`bash backend/scripts/tenancy-smoke/run-all.sh` (the `templates*.mjs` suites included).
:5001/:3001 may belong to another session — then run your own: Mongo
`--port 27998`, the `backend-scratch` config (:5011), and
`SMOKE_ROOT=http://localhost:5011 SMOKE_MONGO=mongodb://127.0.0.1:27998/emint_tenancy_dev`.
A fresh scratch DB needs `seedTenancyDev.js`, `seedTenancyAdmin.js` (oversight
smoke) and `seedTemplateAccess.js`.

**Conventions that bite** (on top of multi-tenancy's):
- Templates are **not** `tenantScoped` (TD1). Anything that *applies* a
  template runs inside `runInScope` for the target project and looks models up
  with `scopedModel`, never `mongoose.models[name]`.
- Validation runs `planFeature` in a **dry scope** (TD4) — never in the
  platform's own scope (it would check names against the platform's models)
  and never with `buildFeature`.
- Explanations are part of the feature, not polish (TD11): every tab, dialog,
  empty state and MCP tool says what it's for, with a `/docs/templates#…`
  link (memory: doc links on every step).
- Admin UI rules: Chakra tokens not hex; cl `Dropdown` (no NativeSelect);
  `PromptDialog` for confirms; `ModalFooter`; no backdrop blur; no bare
  prettier (tabs, single quotes).

## Status

| WO | Title | Repo | Size | Status |
|---|---|---|---|---|
| T-01 | Plan & docs | backend | S | done |
| T-02 | `ProjectTemplate` + blueprint + validator + permissions + starters moved in — BLOCKER | backend | L | done |
| T-03 | Apply engine (one plan, every blueprint part, undo) — BLOCKER | backend | L | done |
| T-04 | Sandbox previews (system org, preview ticket, 24h cleanup) | both | L | done |
| T-05 | Templates admin API (CRUD, draft/publish/versions, duplicate, import/export, save as template, usage) | backend | M | done |
| T-06 | Templates MCP `/templates/mcp` (shared transport, `emt_` keys, tools) | backend | L | done |
| T-07 | Studio: gallery, New template, editor shell, common tabs | admin | L | done |
| T-08 | Studio: App tabs (Sidebar, Dashboard, Roles) | admin | M | done |
| T-09 | API project type + API tabs + outgoing webhooks | both | L | done |
| T-10 | Studio: Website tabs (Pages, Content, SEO, Site defaults, Starter code) | admin | L | done |
| T-11 | Templates MCP connect page + Templates dashboard widget | both | M | done |
| T-12 | `/docs/templates` guide + explanation pass over the studio | admin | M | done |
| T-13 | First templates, written through the MCP | both | L | open |
| T-14 | Tenant side: template gallery in New project, questions, apply, setup checklist | both | L | later |
| T-15 | Building blocks: reusable parts shared by templates | both | L | later |
| T-16 | Previews of big templates build in the background; readable MCP errors; answers as select/number defaults | both | M | done |

Execution order: 01 → 02 → 03 → 05 → 04 → 06 → 07 → 08 → 10 → 09 → 11 → 12 → 13
(→ 14 → 15). T-06 needs T-02/03/05; T-07…T-10 need T-05; T-04 needs T-03.

---

## T-01 — Plan & docs (S) — done
`backend/docs/templates/{README,WORK_ORDERS,CHANGELOG}.md`, pointer in
`admin/docs/TEMPLATES.md`. **Done when** an agent can start from README alone.

## T-02 — ProjectTemplate, blueprint, validator (L) — BLOCKER — done
See CHANGELOG. Differences from the plan below: one plan with
`TEMPLATE_MAX_STEPS` (40) instead of batches; permissions follow the role
editor's pattern (TD10); the first admin endpoints came with it.
**Why** TD1, TD3–TD6, TD10–TD12, TD14: the data everything else edits.
**Backend**
- `library/models/templates/projectTemplate.model.ts` (`projecttemplates`, not
  tenantScoped): `key` (unique slug), `type` (`app|api|website`), `status`
  (`draft|published|archived`), `visibility` (`everyone|organizations|hidden`)
  + `organizations[]`, `draft` (blueprint, Mixed), `published` (blueprint of
  the current version), `version` (number, 0 = never published),
  `versions[]` { version, blueprint, notes, publishedBy, publishedAt },
  `usage` { previews, applied, lastAppliedAt }, `createdBy`/`updatedBy`
  (Admin), `source` (`panel|mcp|starter|capture`), timestamps. Index
  {status, type}, {key}.
- `library/models/templates/templateKey.model.ts` (`templatekeys`): like
  `ApiKey` — name, prefix, hash (`select:false`), scopes
  `read|write|preview|publish`, createdBy (Admin), lastUsedAt, expiresAt,
  revokedAt. Not tenantScoped.
- `library/controllers/templates/blueprint.ts`:
  - `normalizeBlueprint(type, input)` — trims and caps every string, drops
    unknown keys, fills defaults (README §3 blueprint); keeps `{{key}}` tokens.
  - `fillPlaceholders(blueprint, answers, questions)` — deep string replace;
    unknown tokens reported, not left in.
  - `whatsInside(blueprint)` — generated summary: models (fields count,
    links), pages, endpoints, widgets, roles, sample record counts.
- `library/controllers/templates/validate.ts` — `validateTemplate(req, doc)`
  → `{ errors[], warnings[], explain[] }`, each with `{ part, path, message,
  fix }` (the fix is a sentence telling the author what to do):
  - models: `planFeature` in a **dry scope** (`runInScope` with a fresh
    ObjectId project, `organization` of a fresh ObjectId), steps in link-order
    batches of `MAX_STEPS` (a later batch may reference an earlier one);
  - sidebar/dashboard/endpoints/webhooks/sample data reference only routes the
    template creates (website: also the kit routes `pages`, `seo`,
    `web-contents`);
  - website pages: unique paths, parent exists, content blocks' fields match
    the kit `WebContent` model;
  - questions: unique keys, every `{{key}}` used is declared;
  - explanation gate (TD11): required → errors on publish, the rest → warnings.
- Permissions `view-templates`, `edit-templates`, `publish-templates`,
  `manage-template-keys`: `scripts/seedTemplateAccess.js` (mirrors
  `seedBuilderAccess.js`), super admin role gets them.
- `templates` added to `PROTECTED_ROUTES` (`builder/validate.ts`) and the
  admin's reserved pages so no model can take the address.
- Starters (TD14): `library/functions/templateSeed.function.ts` upserts the 4
  `STARTERS` as published `app` templates (`source: 'starter'`, with an
  overview, guide steps and model descriptions written for them) at boot when
  their key is missing; `GET /builder/starters` reads published app templates
  and falls back to the code list when there are none.
**Done when** `npx tsc` is clean; a smoke (`templates.mjs`, part 1) saves a
draft with a broken link and gets an error with a fix, saves a valid one with
no model created anywhere (`modeldefinitions` count unchanged, no new
collection), and the 4 starters exist as templates.

## T-03 — Apply engine (L) — BLOCKER — done
See CHANGELOG. As planned, except: pages go through the MCP's `upsertPage`
and records through `createRecords` (exported) with a panel caller, not a
new shared function; webhooks wait for T-09.

**Why** TD7: previews and tenants get exactly the same build.
**Backend** `library/functions/applyTemplate.function.ts`:
`applyTemplate(req, { project, template, version?, answers, sampleData })`,
run inside `runInScope({ organization, project })`, in this order:
1. fill placeholders (T-02), re-validate (errors → nothing built);
2. models: one `buildFeature` with `maxSteps: TEMPLATE_MAX_STEPS`,
   `source: 'template'` (both exist since T-02); page layouts come with the
   steps (table/filters/form/view);
3. sidebar categories and items (template sidebar, or one category named
   after the template);
4. dashboard widgets (`normalizeWidget`, saved to the project's
   `DashboardConfig`);
5. roles: create organization roles whose names don't exist yet; existing
   names are left alone and reported;
6. public API per endpoint (`setPublicApi`); webhooks need T-09 (skipped with
   a note until then);
7. website: kit already seeded by `projectHooks.onCreated`; pages + SEO +
   contents through the same function as the MCP `upsert_page`
   (`website.tools.ts` — extract it to a shared function); site defaults
   through `saveSite`;
8. sample data (if asked): records created in link order, references resolved
   by the target's display field;
9. `TenantProject.template` = { template, key, version, appliedAt, answers }
   and `TenantProject.setup` = the guide steps with `done: false` (add both
   fields to `tenantProject.model.ts`);
10. `ProjectTemplate.usage` updated; `recordProjectEvent` "Built from
    template …".
All or nothing: each step pushes its undo (models via `deleteModelCore`,
categories, dashboard, roles, pages, records); a failure runs them newest
first and returns `{ step, message }`.
**Done when** smoke (`templates.mjs`, part 2) applies each starter and a
website test template into a scratch project: models, pages, sidebar,
dashboard, site settings and sample data are there; a template with a
failing step leaves the project exactly as it was.

## T-04 — Sandbox previews (L) — done
See CHANGELOG. Differences: the tenant panel page is `/preview` (not under
`/auth`, which sends signed-in people home); the guard keys on the sandbox
user (`system: true`), not a token claim.

**Why** TD8.
**Backend** `library/functions/templateSandbox.function.ts`:
- `ensureSandbox()` — the system organization (`Organization.system: true`,
  slug `mint-template-sandbox`) and its owner `TenantUser` (`system: true`,
  no password); add `system` to both models; oversight lists, tenant sign-in,
  invitations and the org switcher all skip `system` documents.
- `previewTemplate(req, template, { answers, sampleData, from: 'draft'|'published' })`
  — a new project in the sandbox (`type` = template type, name
  "Preview · <template> · <time>"), `applyTemplate`, returns
  `{ projectId, publicSlug, expiresAt, ticket }`.
- Preview ticket: random, sha256 stored on the project
  (`previewTicket { hash, expiresAt, usedAt }`), single use, 5 minutes.
  `POST /tenant/api/auth/preview` exchanges it for a session of the sandbox
  owner (`issueSession`, token claim `preview: true`); the tenant panel's
  `/auth/preview?ticket=…` page calls it and opens `/<publicSlug>`. A preview
  token can't reach any organization but the sandbox, can't invite, can't
  create API keys.
- Cleanup: on boot and every hour, sandbox projects older than 24h are
  deleted with everything in them (model definitions, `t_<projectId>_*`
  collections, route copies, sidebar, dashboard, website settings, media
  rows and their S3 files, history).
**Admin** tenant panel `src/app/auth/preview/page.tsx`; a "Preview" banner in
the tenant panel while the token has `preview` ("This is a preview of
<template>. Changes here are thrown away in 24 hours.").
**Done when** a preview opens in the tenant panel from a ticket, a used or
expired ticket is refused, a preview token gets 403/404 outside the sandbox,
and cleanup removes an expired preview completely (smoke).

## T-05 — Templates admin API (M) — done
See CHANGELOG. Settings (visibility, archive) need the publishing permission;
capture doesn't copy page layouts (the builder makes them from the fields).

**Why** one service for the panel and the MCP.
**Backend** `library/controllers/templates/templates.service.ts` +
`templates.router.ts` mounted at `/admin/api/templates` (admin auth, TD10
permissions). Already there (T-02): `GET /meta`, `GET /`, `POST /`,
`GET /:id`, `PUT /:id/draft`, `POST /:id/validate`. To add:
- `GET /` (filters: type, status, category, search; with usage),
  `GET /:id` (draft, published, versions without blueprints, validation,
  whatsInside), `POST /` (type, name, category, summary → draft),
  `PUT /:id/draft` (whole blueprint or one part: `?part=models|sidebar|…`),
  `PUT /:id/settings` (key, visibility, organizations, status archived).
- `POST /:id/validate`, `POST /:id/preview` (T-04), `POST /:id/publish`
  (`publish-templates`; refuses on errors; body `{ notes }`),
  `POST /:id/versions/:v/restore` (copies a version into the draft).
- `POST /:id/duplicate` (new key, draft only), `GET /:id/export` (JSON with a
  `format: 'emint-template@1'` header), `POST /import` (validates, new draft).
- `POST /capture` `{ project, sampleData }` — save a project as a template
  (TD13): structure from any project; records only when the project is in the
  sandbox. Implemented by reading the project's model definitions, route
  copies, sidebar, dashboard, public API, website pages/settings into a
  blueprint.
- `DELETE /:id` — only drafts never published; published ones are archived.
- Every write `recordHistory` (TD15).
**Done when** smoke (`templates.mjs`, part 3) covers create → edit part →
validate → publish → edit draft (published unchanged) → restore → duplicate →
export/import round trip → capture a project.

## T-06 — Templates MCP (L)
**Why** TD9: Claude writes templates; "this MCP must be different".
**Backend**
- Extract the JSON-RPC plumbing from `library/controllers/mcp/mcp.router.ts`
  (protocol versions, initialize, tools/list, tools/call, key from header or
  path, errors) into `library/controllers/mcp/transport.ts`
  (`createMcpRouter({ info, instructions, tools, authenticate })`); `/mcp` and
  `/tenant/mcp` keep working unchanged (their smokes pass).
- `library/controllers/templates/mcp.router.ts` → `/templates/mcp` (mounted
  in `server.ts` next to `/mcp`, before the request logger). Server info
  `{ name: 'e-mint-templates', title: 'e-mint Template Studio' }`.
- Key management under `/admin/api/templates/keys` (`manage-template-keys`): list,
  create (secret shown once), revoke.
- Instructions: how to work with the user (agree the template's purpose and
  audience first → describe_template_format → draft one part at a time,
  showing each to the user → validate → preview → publish only on a clear
  yes), and the explanation rules.
- Tools (all through `templates.service.ts`; scope in brackets):
  `describe_template_format` [read] — blueprint, field kinds, rules, writing
  guide, one example per type; `list_templates`, `get_template` [read];
  `create_template`, `update_overview`, `upsert_model`, `remove_model`,
  `set_sidebar`, `set_dashboard`, `set_roles`, `set_endpoints`,
  `set_webhooks`, `upsert_page`, `remove_page`, `set_site_defaults`,
  `set_starter_code`, `set_questions`, `set_sample_data`, `set_setup_guide`
  [write]; `validate_template` [read]; `preview_template` [preview] — returns
  the preview link; `publish_template` [publish] — needs `confirm: true` and
  notes; `export_template` [read], `import_template` [write].
- Every write returns the part as saved plus the validation for that part,
  so the AI fixes problems as it goes. No tool builds outside the sandbox.
**Done when** `templates-mcp.mjs`: an MCP session creates an app template,
adds 2 linked models, a dashboard, questions and a guide, validates, previews
(link works), publishes with a publish key and is refused with a write-only
key; `/mcp` and `/tenant/mcp` smokes still pass; an `emk_` key is refused at
`/templates/mcp` and an `emt_` key at `/mcp`.

## T-07 — Studio: gallery, New template, editor, common tabs (L)
**Why** "also can be built on the panel".
**Admin** `src/app/templates/`:
- `page.tsx` — gallery: filter by type (App / API / Website), status,
  category, search; cards with cover, type, version, status, usage, "has
  problems" badge. Empty state explains what templates are, the three types
  and the two ways to make one (here, or Claude through the MCP), with guide
  links. **New template** dialog: pick type (each with a sentence on what it
  holds), name, category, one-line summary → editor.
- `[id]/page.tsx` — editor shell: header (name, type, status, version,
  Validate, Preview, Publish), a **problems panel** (errors/warnings with
  their fix, click → the tab and field), tabs below. Each tab opens with a
  one-paragraph intro and a `GuideLink` to its `/docs/templates#…` section.
- Common tabs:
  - **Overview** — name, summary, description (markdown), who it's for,
    category, tags, icon (typed name + lucide link, no icon grid), colour,
    cover and screenshots (media library), and the generated **What's
    inside**.
  - **Models** — the model wizard and feature-plan view writing into the
    blueprint (no build): add/edit/remove models, fields with help text,
    links, page layout; a relations diagram from `whatsInside`.
  - **Questions** — list editor; shows where each `{{key}}` is used.
  - **Sample data** — records per model (form from the model's fields),
    "Generate with AI" (server `ANTHROPIC_API_KEY`, super admin only).
  - **Setup guide** — steps (title, body, page it opens) and FAQ, with a
    preview of how the tenant will see it.
  - **Versions & publish** — versions with notes, restore into draft,
    visibility, publish dialog (notes; blocked while there are errors;
    explains what publishing changes and what it doesn't).
- `src/components/library/store/services/templatesApi.ts` (RTK, tags).
- Sidebar entry **Templates** (category Builder) — backend
  `library/data/sidebar.data.ts` and admin `sidebar.data.tsx`.
**Done when** a template made only in the panel validates, previews and
publishes; headless UI check of every common tab; no console errors.

## T-08 — Studio: App tabs (M)
**Admin** `[id]/_components/`: **Sidebar** (categories and their pages from
the template's models, order, icons), **Dashboard** (the dashboard builder's
widget editor against the template's models, writing into the blueprint),
**Roles** (name, description, organization permissions with each
permission's meaning shown). Each with intro + guide link.
**Done when** a finance template with sidebar, 4 widgets and 2 roles previews
with them in place.

## T-09 — API project type, API tabs, webhooks (L)
**Why** TD2.
**Backend** `PROJECT_TYPES` gains `api`; an API project's sidebar (tenantNav)
leads with **API**: Public API, Customers, Webhooks, API keys; its dashboard
shows base URL, endpoints and recent calls. Outgoing webhooks:
`ProjectWebhook` (tenantScoped: route, events, url, secret `select:false`,
active, last delivery), fired after public-API and panel creates/updates/
deletes, HMAC-SHA256 signed (`x-mint-signature`), 3 retries with backoff,
delivery log (last 50). Tenant API CRUD + "Send test".
**Admin** tenant: New project offers **API**; API dashboard; Webhooks page.
Studio: **Endpoints** tab (per model: actions, auth none/customer, owner only,
a note shown in the API reference) and **Webhooks** tab (events per model;
the URL is a question at apply time). Generated **example requests** (curl
and fetch) for every endpoint, shown in the tab and the guide.
User guide `/user-docs/public-api#webhooks`, `/user-docs/projects#api`.
**Done when** an API template previews as an API project with endpoints on,
a webhook test delivery is signed and logged, and smokes pass.

## T-10 — Studio: Website tabs (L)
**Admin** `[id]/_components/`: **Pages** (tree with path, status, menu,
parent), **Content** (blocks per page, the kit `WebContent` form, ordered),
**SEO** (per page, SERP preview — reuse `VSeo/SerpPreview`), **Site
defaults** (the `/site-setup` General, Contact & social and SEO cards in
"template mode": they edit the blueprint, not a project), **Starter code**
(repo URL, framework, deploy button URL, env vars with `{{api}}`/`{{slug}}`
filled at apply). Each with intro + guide link.
**Backend** blueprint website part validated (T-02) and applied (T-03).
**Done when** a blog website template previews with its pages, contents, SEO
and settings, and the site API returns them.

## T-11 — MCP connect page + dashboard widget (M)
**Admin** `src/app/templates/connect/page.tsx` (like
`model-builder/connect`): what the Templates MCP is and how it differs from
the builder MCP, keys (create with scopes explained, shown once, revoke),
copy-paste setup for Claude Code (`claude mcp add --transport http
emint-templates <api>/templates/mcp/emt_…`), Claude Desktop and claude.ai,
and a starter prompt ("Make an app template for …").
**Backend + admin** a dashboard widget type `templates` (dashboard builder,
`normalizeWidget` TYPES): published / drafts / with problems, most used,
recently changed — for the super admin home.
**Done when** Claude Code connects with the copied command and lists
templates; the widget shows on the dashboard builder and the home page.

## T-12 — Guide and explanation pass (M)
**Admin** `src/app/docs/templates/page.tsx` (DocsShell + GuideHeader, listed
in `docs/_components/guides.ts`). Sections (ids are the `GuideLink` anchors):
`what`, `types`, `new`, `overview`, `models`, `questions`, `sample-data`,
`setup-guide`, `sidebar`, `dashboard`, `roles`, `endpoints`, `webhooks`,
`pages`, `content`, `seo`, `site-defaults`, `starter-code`, `validate`,
`explanations`, `preview`, `publish`, `versions`, `visibility`, `capture`,
`import-export`, `mcp`, `mcp-keys`, `mcp-prompts`.
Pass over the studio: every tab, dialog and empty state has its intro and
anchor link; every input has help text; every validation message has a fix.
**Done when** every guide link in the studio lands on a section, and a
reviewer can make and publish a template using only the guide.

## T-13 — First templates through the MCP (L)
Written with Claude through `/templates/mcp`, each previewed, then published:
**Apps** Finance management, CRM, HR & leave, Inventory; **API** Booking API,
Products & orders API; **Websites** Blog, Business site, Portfolio,
E-commerce (catalogue, cart via public API, orders). Each passes the
explanation gate with no warnings and has sample data.
**Done when** all are published and each preview works end to end.

## T-14 — Tenant side (later, L)
New project → "Start from a template" or "Blank"; gallery filtered by type;
template page (overview, screenshots, what's inside, setup guide); questions;
"include sample data"; apply with progress; the project opens on its **setup
checklist** (dashboard card, ticks itself where it can tell); user guide
`/user-docs/templates`. Get started (WO-35) uses the same gallery.

## T-15 — Building blocks (later, L)
Reusable parts (Customers, Payments, Addresses, Blog posts…) that templates
include by reference and that can be added to an existing project with a
rename step for clashing names.

## T-16 — Big template previews, readable errors, answer defaults (M)
**Why** previews of `clients-invoices` (14 models, ~160 sample records) and
`finance-management` failed on production with only "The connector's server
returned an error". The sandbox showed all four previews fully built
(tickets issued, `usage.previews` counted): 100 s alone, ~200 s when four ran
side by side — past the 30-second request limit, not a thrown error.
Locally the same build is 8 s and ~1,065 Mongo operations (per model: the
model, its sidebar item, route settings/config versions, the collection and
its indexes; then per sample record its link lookups).
**Backend** `templateSandbox.function.ts`: `previewTemplate` creates the
project with `preview.status: 'building'`, runs `applyTemplate` in the
background and waits `BUILD_WAIT_MS` (20 s): done → as before (201 + link);
still going → `{ status: 'building', project }` (202); a build already running
for the template → that one (`already`). A failure while waiting throws and
leaves nothing; a later one keeps a `failed` record (error + problems, kept
1 hour). `previewStatus(id)` → ready (fresh ticket + what was built, kept on
`preview.result`) / building / failed; `building` older than 15 min counts as
failed (the server restarted). Reopen and delete refuse a building preview;
the 50-preview cap never evicts one. `TenantProject.preview` gains `status`,
`builtAt`, `result`, `error`, `problems`.
MCP: `safely()` returns any error as a tool error (unexpected ones logged with
their stack); `preview_template` answers building with the id; new tool
`preview_status` (preview id, or template → its newest); instructions say to
poll. Admin API `POST /:id/preview` → 201 ready / 202 building.
`createRecords` caches link lookups per call (same name, same model).
Validator: a field default that is a question's answer (`{{paymentTerms}}`)
is checked per option of a choice question against the field's allowed
values (error naming the options that don't fit; a number field fed by a
free-text question is a warning); the planner sees a copy with a sample
answer (the question's default, else its first option).
**Admin** `PreviewDialog`: a 202 says it's building; the list polls every 5 s
while one builds, shows Building… / Not built — why, Open only when ready.
Guide `/docs/templates#preview`.
**Done when** `clients-invoices` previews through the MCP on production:
the call answers within 20 s and `preview_status` gives the link.

## Follow-ups (not numbered yet)
The validator doesn't check sample-data links (a record linking a client
that isn't in the sample fails only at build time — now reported, but late).
A preview could build faster with fewer round trips per model (sidebar item,
route settings and config versions are separate writes).

"Template updated — see what's new" for projects built from an older
version; user-made templates / marketplace; rate limits per public endpoint;
forms and cookie consent as website template parts once they exist (see the
website roadmap); usage funnel (applied → setup checklist completed).
