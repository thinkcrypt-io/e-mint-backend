# Templates — changelog

Newest last. One entry per work order: what, files, how verified.

## T-01 — Plan & docs (2026-10-04)
- `backend/docs/templates/README.md` (what, decisions TD1–TD15, blueprint,
  architecture), `WORK_ORDERS.md` (T-01…T-15, handoff), this file; pointer
  `admin/docs/TEMPLATES.md`.
- Decisions taken from the user's request and the suggestions they accepted
  (2026-10-04): API as a real project type (TD2), sandbox previews (TD8),
  questions/placeholders, versions, visibility, duplicate, save as template,
  history, building blocks (later).
- Verified: paths checked against the code (`features.service.ts`
  `buildFeature`/`planFeature`/`MAX_STEPS`, `starterTemplates.function.ts`,
  `websiteKit.function.ts`, `mcp/mcp.router.ts`, `ApiKey`, `builder/validate.ts`
  `PROTECTED_ROUTES`, `seedBuilderAccess.js`).

## T-02 — ProjectTemplate, blueprint, validator (2026-10-04)
- **Models** `library/models/templates/` — `ProjectTemplate` (`projecttemplates`,
  not tenantScoped: key, type, status, visibility + organizations, `draft`,
  `published`, `version`/`versions[]`, `changed`, usage, source; name/summary/
  category/icon/color mirrored from the draft's overview for lists) and
  `TemplateKey` (`templatekeys`, scopes read/write/preview/publish — used by T-06).
- **Blueprint** `controllers/templates/blueprint.ts`: `normalizeBlueprint` /
  `normalizePart` (known keys, capped strings and lists, parts a type lacks
  come back empty — `PARTS_BY_TYPE`), `placeholdersUsed` / `fillPlaceholders`
  (`{{key}}`, built-ins project/slug/api), `whatsInside` (generated summary),
  `stepIdentity`.
- **Validator** `controllers/templates/validate.ts`: `planFeature` in a fixed
  **dry scope** (organization `…d0a1`, project `…d0a2`; nothing is ever built
  there), a website's plan checked with the kit in front; errors / explain
  (TD11 gate) / warnings, each `{ part, path, message, fix }`. Covers models
  (create only, renames, descriptions, help text), sidebar, dashboard
  (`normalizeWidget`), roles (`ORG_PERMISSIONS`), endpoints (`PUBLIC_API`),
  webhooks, website pages/blocks/SEO/starter repo, sample data, questions and
  placeholders, setup guide.
- **Feature builder**: `planFeature(req, input, { maxSteps })` and
  `buildFeature(..., { maxSteps, source: 'template' })`; `TEMPLATE_MAX_STEPS`
  = 40 (the wizard keeps 12). `Feature.source` allows `template`. Changed from
  the plan: one plan, not batches — a later batch's links couldn't be checked
  without building the earlier one.
- **Service + API** `templates.service.ts`, `templates.router.ts` at
  `/admin/api/templates`: `GET /meta`, `GET /`, `POST /`, `GET /:id` (by id or
  key, with whatsInside and validation), `PUT /:id/draft` (`{part, value}` or
  `{blueprint}`), `POST /:id/validate`. History entries for create/update.
- **Starters** `functions/templateSeed.function.ts`: the 4 code starters
  upserted at boot (`server.ts`) as published app templates v1 with an
  audience, description, model descriptions, a sidebar and a setup guide;
  never overwritten. `GET /builder/starters` lists published app templates
  visible to the caller (everyone, or their organization), code list as the
  fallback; `POST /builder/starters/:key` builds the template's models
  (placeholders at their defaults) and counts the use.
- **Reserved**: `templates` in the admin's `RESERVED_ROUTES` and `PANEL_PAGES`.
- **Permissions** `scripts/seedTemplateAccess.js`: `templates`
  (view/create/edit/delete), `template-publishing` (edit), `template-keys`
  (view/create/delete).
- **Verified**: `npx tsc` clean; new smoke `templates.mjs` (32 checks: starters,
  every validation family, 14 models in one plan, website kit links, and no
  model definitions / collections / sidebar categories created); full
  `run-all.sh` green on a scratch server (:5011, Mongo :27998) after
  `seedTenancyAdmin.js` for the oversight suite.

## T-03 — Apply engine (2026-10-04)
- `library/functions/applyTemplate.function.ts` — `applyTemplate(req, { project,
  template, from, answers, sampleData, preview })`, in the project's scope:
  required answers → placeholders filled (built-ins project/slug/api) →
  validated again → sidebar categories (the template's, priorities before the
  project's first section; unlisted models go to that section) → models (one
  `buildFeature`, `source: 'template'`, `TEMPLATE_MAX_STEPS`, each step's
  sidebar category) → sidebar item order and labels → dashboard widgets
  appended (`normalizeWidget`, model names → built routes) → organization
  roles (new names only; existing ones reported) → public API
  (`setPublicApi`) → website settings (`saveSite`) and pages parents-first
  (`upsertPage`; SEO only when given) → sample data in link order
  (`createRecords`, links by display value) → `TenantProject.template` and
  `.setup` (guide steps as a checklist, pages resolved to routes) → usage
  counted → project history event. Every step pushes its undo; a failure runs
  them newest first and answers `Nothing was built — <step>: <why>`.
- `TenantProject`: `template`, `setup`, `preview` fields; `PROJECT_TYPES`
  gains `api` (TD2 — the UI comes with T-09; such a project's first section is
  "Data").
- `website.tools.ts`: `upsertPage`, `createRecords` exported.
- Validator: a page with half an SEO entry is an error (the kit's PageSeo
  needs title and description); none at all stays a warning.
- **Fixed on the way (affects tenants):** the builder's route registry cache
  (`builder.controller.ts getRegistry`) was one global entry keyed by a
  version that is counted per scope, so after building in project A, project
  B could get A's routes ("No admin route 'categories'") whenever their
  versions matched — now cached per scope. And a dropped collection could be
  made again by its model's index build still running: `deleteModelCore`
  awaits `Model.init()` before dropping, and project removal awaits every
  compiled model (`settleProjectModels`).

## T-04 — Sandbox previews (2026-10-04)
- `library/functions/projectLifecycle.function.ts` — `createProject` and
  `removeProjectContents` moved out of the projects router (which now calls
  them), so previews are made like tenants' projects. Removal also clears the
  project's `WebsiteSettings` and `History` (were left behind before).
- `library/functions/templateSandbox.function.ts` — `ensureSandbox` (system
  organization `mint-template-sandbox` + owner `template-previews@sandbox.invalid`,
  both `system: true`, no password), `previewTemplate` (project in the
  sandbox, applyTemplate as the sandbox owner, a failed build removed),
  single-use 5-minute tickets (sha256 on the project), `reopenPreview`,
  `listPreviews`, `deletePreview`, `redeemTicket`, `purgeExpiredPreviews`
  (boot + hourly, `server.ts`), at most 50 previews (oldest go).
- Admin API: `POST /templates/:id/preview`, `GET /templates/:id/previews`,
  `POST /templates/previews/:projectId/open`, `DELETE /templates/previews/:projectId`.
- Tenant: `POST /tenant/api/auth/preview { ticket }` → session + project;
  `tenantProtect` lets the sandbox user write only inside `/tenant/api/p/:id/`
  (not its AI keys), its notifications and signing out (`PREVIEW_ONLY`).
  `self` says `preview: true`; projects carry `preview { expiresAt, from }`.
- Super admin's Organizations / Tenant users / Tenant projects never list the
  sandbox (`customQuery` on their lists).
- Admin (tenant panel): `/preview?ticket=…` page; `PreviewBanner` pill on
  every page of a preview session. `templates` admin-only, `preview`
  tenant-only (pages.ts); `preview` reserved as a publicSlug.
- Verified: smoke `templates-preview.mjs` (41 checks: an app template with
  every part, answers and placeholders, ticket once only, preview guard,
  hidden from oversight, reopen/delete leaves no collections or documents, a
  failing build leaves nothing, a website template through the site API, all
  4 starters); expired preview removed at boot (manual: expiresAt set back,
  restart, project/collections/definitions gone); full `run-all.sh` green;
  browser: ticket link → signed in on the preview's dashboard with the
  template's sidebar and banner, Invoices table with the template's
  description, a used link explains itself.

## T-05 — Templates admin API (2026-10-04)
- `templates.service.ts`: `saveSettings` (key — drafts only; visibility
  everyone / organizations (needs some) / hidden; archive and restore),
  `publishTemplate` (needs notes; refused when nothing changed, on errors, or
  on missing explanations — each problem with its fix; next version, draft
  copied to `published` and `versions[]`), `getVersion`, `restoreVersion`
  (into the draft), `duplicateTemplate`, `exportTemplate` / `importTemplate`
  (`format: 'emint-template@1'`, key suffixed when taken), `captureTemplate`,
  `deleteTemplate` (a published one is archived instead). History on every write.
- `capture.ts` — a project's structure as a blueprint: models (fields,
  display field, codes, access; route kept only when it isn't the default),
  sidebar, dashboard (routes → model names), public API, setup guide, and for
  a website its pages with SEO, content blocks and settings. Sample data only
  from a preview (refused for a tenant project), 20 per model, links as
  display values. Page layouts aren't captured.
- Routes: `PUT /:id/settings` and `POST /:id/publish` (edit-template-publishing),
  `GET /:id/versions/:v`, `POST /:id/versions/:v/restore`, `POST /:id/duplicate`,
  `GET /:id/export`, `POST /import`, `POST /capture`, `DELETE /:id` (delete-templates).
- Verified: smoke `templates-manage.mjs` (32 checks), all suites green.

## T-06 — Templates MCP (2026-10-04)
- `library/controllers/mcp/transport.ts` — the MCP protocol once for every
  e-mint server (`createMcpRouter`: initialize, ping, tools/list, tools/call,
  batches, key in header or path, 405 on GET/DELETE). `tools` is what a caller
  may call, `listed` what tools/list offers, so a tool outside the key's
  scopes still answers with the scope message, as before. The builder's
  `/mcp` and `/tenant/mcp` (`makeMcpRouter`) moved onto it unchanged.
- `templates/keys.ts` + `/admin/api/templates/keys` — `emt_` keys: create
  (secret once, sha256 kept; scopes read/write/preview/publish, default the
  first three; optional expiry), list (never the hash), revoke (own keys, or
  any with `*`). `view-` / `create-` / `delete-template-keys`.
- `templates/mcp.router.ts` → `/templates/mcp` (server `e-mint-templates`):
  instructions (agree purpose and audience → format → one part at a time with
  the user → questions before `{{key}}` → validate → preview → publish only on
  a clear yes), `describe_template_format` (types and parts, every part's
  shape, field kinds, publishing rules, an example), and list/get/create,
  `update_overview`, `upsert_model`/`remove_model`, `set_sidebar`,
  `set_dashboard`, `set_roles`, `set_endpoints`, `set_webhooks`,
  `set_questions`, `set_sample_data`, `set_setup_guide`, `upsert_page`/
  `remove_page`, `set_site_defaults`, `set_starter_code`, `validate_template`,
  `preview_template` (the ticket link), `publish_template` (`confirm: true` +
  notes), `export_template`, `import_template`. Every write answers with that
  part's problems and fixes plus the template's overall state. A key acts as
  its admin, never beyond their role (scope → permission in `NEEDS`).
- Fix: `findTemplate` takes an ObjectId as well as a string.
- Verified: smoke `templates-mcp.mjs` (47 checks: keys, scopes, `emk_` refused
  here and `emt_` at `/mcp`, a whole app session to a working preview link and
  v1, export/import, website pages and settings, revoke); `mcp.mjs`,
  `website-mcp.mjs` and every other suite green; the admin `/mcp` checked by
  hand (tools/list by scope, out-of-scope call → the scope message).

## T-07 — Studio: gallery, editor, common tabs (2026-10-04)
- **Admin** `src/app/templates/`:
  - `page.tsx` — the gallery: filter by type, status, category, search;
    cards with cover or icon on the colour, type, status/version, a problems
    badge, usage. Import (an exported file), **Save a project as a template**
    (`CaptureDialog`, tenant projects; structure only), **New template**
    (`NewTemplateDialog`: each type says what it holds). Empty state explains
    templates and the two ways to make one.
  - `[id]/page.tsx` — the editor: header (type, status, key, source, usage;
    Check again, Preview, Publish), a sticky save bar (edits stay in the page
    across tabs; each changed part saved on its own), the **problems panel**
    (problems / to explain / warnings, each with its fix; "Go there" opens the
    tab and the model or item), tabs with problem counts and an edited dot.
  - Tabs (`[id]/_components/`): **Overview** (introduction with "needed to
    publish" marks, icon by typed Lucide name, colour, cover and screenshots
    from the media library, What's inside), **Models** (the model builder's
    own `ModelPanels` writing into blueprint steps — name check from the
    validator, link targets are the template's models plus the website kit;
    list with order/remove, a links summary, the "why it's there" line, a
    Claude-written page layout kept or dropped; round trip keeps every key),
    **Questions** (where each `{{key}}` is used, "ask for it" for unanswered
    placeholders), **Sample data** (records per model, a form from the
    model's fields, links by display value, **Generate with AI**), **Setup
    guide** (steps with the page each opens, FAQ, a tenant's-eye preview),
    **Versions & publish** (publish, versions with restore, visibility and
    organizations, key while unpublished, duplicate / export / archive /
    delete). Sidebar, Dashboard, Roles, Public API, Webhooks and Website are
    read-only (`PartSummary`) until T-08…T-10.
  - `PublishDialog` (notes; lists what blocks it; explains what publishing
    changes and doesn't), `PreviewDialog` (questions answered as a tenant,
    sample data on/off, draft or published, previews still open: open again /
    delete).
  - `templatesApi.ts` (RTK; writes update the editor from the answer).
    `importTemplate` is already bulkApi's endpoint — the file import here is
    `importTemplateFile` (endpoint names are global across injected services).
  - Guide `src/app/docs/templates/page.tsx` with every section T-12 lists
    (T-12 is now a review pass), in `docs/_components/guides.ts`.
- **Backend**: `checks` counts kept on the template (`checkTemplate`, used by
  the editor, `/validate` and the MCP) and `cover` mirrored, for the gallery;
  `POST /:id/ai/sample-data` (`sampleAi.ts`, server `ANTHROPIC_API_KEY`,
  saves nothing); deleting a never-published draft removes its previews;
  Config → Templates sidebar item in `seedTemplateAccess.js`.
- `.claude/launch.json` `admin-scratch` (:3012 → :5011).
- Not done here: "Plan with AI" in the Models tab (Claude through the MCP
  covers it), a relations diagram (a links list instead).
- Verified: admin `tsc` clean for the new files; `templates-manage.mjs` +4
  checks; every suite green (after clearing a role an aborted run left in the
  sandbox — `templates-preview.mjs` now clears it first); browser on :3012: a
  template made only in the panel (New template → Overview → Models with a
  model added in the form → a Claude-written linked model round-tripped
  unchanged → Setup guide → Sample data record) checked clean, previewed
  (ticket link opened) and published v1; every tab rendered; every guide
  anchor exists; no console errors on a fresh load.

## T-08 — Studio: App tabs (2026-10-04)
- **Admin** `src/app/templates/[id]/_components/`:
  - `models.ts`: `templateModels(doc)` — the saved models by the name the
    server gives them, with route and fields; what the tabs pick from.
  - `SidebarTab`: sections (name, icon by name, description), the pages in
    each from the template's models (add from those not yet placed, order,
    a sidebar-only label, take out), and a preview of the sidebar as a new
    project gets it, unplaced pages under the Models tab's section.
  - `DashboardTab`: the dashboard builder's widgets against the template's
    models — Number (count / total / average, period, dated by, before/after,
    compare), Chart (over time per day/week/month, or by a choice, yes/no or
    link field; bars/line/…), Recent items (columns, how many). Each widget is
    described in a sentence ("Total of Amount in Transactions by Kind, last 30
    days"), with its problems inline, and a 12-column layout sketch. Filters
    are kept as they come (Claude or a captured project sets them).
  - `RolesTab`: name, description and the organization permissions grouped
    with what each allows (`meta.orgPermissions`); a warning when the name is
    Owner / Admin / Member.
  - The editor's `ADAPTERS` stage the three parts with the rest (widgets get
    an `id` and a default size).
  - Guide sections Sidebar, Dashboard, Roles say how each tab works.
- **Backend fix**: the sidebar shows the higher `priority` first, but the
  build gave the template's first section and first page the lowest — a
  preview listed them backwards. `applyTemplate` now puts the template's
  sections above the project's top one, first listed highest, and pages
  likewise; capture (`capture.ts`) reads the sidebar in the same order.
- **Smoke** `templates-preview.mjs` +5 checks: a books template saved as the
  tabs save it (2 sections, 4 widgets — number with a filter, chart by a
  field, chart per week, recent with columns — 2 roles) checks clean and
  previews with sections and pages in order and the label kept, the 4 widgets
  on the built routes with their settings, and both roles with their
  permissions.
- **Verified**: admin `tsc` clean; every suite green on the scratch server;
  browser on :3012: a section with two pages (preview right, unplaced page
  under "First section" until placed), a role with three permissions (all 11
  permissions shown in their groups), three widgets including a chart moved to
  another model, totalling Amount by Kind (only choice/link fields offered) —
  saved together and reloaded as saved.

## T-09 — API projects, API tabs, outgoing webhooks (2026-10-04)
- **API projects** (`TenantProject.type` already allowed `api`): the tenant
  sidebar leads with **API** — Public API, Webhooks, Customers — straight after
  the Dashboard (`tenantNav.function.ts` `tenantLead`; apps and websites keep
  them under Audience, now with Webhooks). The project's home opens on
  `ApiOverview`: base address, endpoints on, calls and failed calls in the last
  day, the 20 latest calls, webhooks on and their latest deliveries
  (`GET /tenant/api/p/:id/api-overview`). New project offers **API**.
- **Call log** `ApiCall` (tenantScoped, 7-day TTL): method, path, route,
  status, ms, whether a customer token came — for API projects only, no
  bodies, tokens or addresses.
- **Webhooks** `ProjectWebhook` (route, events, url, secret `select:false`,
  active, note, lastDelivery) and `WebhookDelivery` (the last 50 per webhook,
  30-day TTL). `functions/webhooks.function.ts`: fired after the response from
  `recordHistory` (every panel create/update/delete, bulk included) and from the
  public API's create/update/delete; body `{ delivery, event, route, project,
  source, at, record }` (the record as the public API shapes it, never password
  fields); headers `x-mint-event`, `x-mint-delivery`, `x-mint-timestamp`,
  `x-mint-signature` = `sha256=` HMAC-SHA256 of `<timestamp>.<body>`; 10 s
  timeout, no redirects; non-2xx retried 3 times (×1, ×4, ×16 of 15 s in
  production, 0.5 s in development, `WEBHOOK_RETRY_BASE_MS`); each retry
  re-reads the webhook, so deleting or switching it off stops them. Addresses:
  http(s) only, no credentials, link-local (cloud metadata) always refused,
  private networks refused in production (`WEBHOOK_ALLOW_PRIVATE=1`).
  Retries wait in the process — a restart drops them (the log shows them
  unfinished).
- **Tenant API** `routes-tenant/webhooks.router.ts` (`build`): list (with the
  models to pick from, never secrets), create (secret shown once), update (no
  address → switched off), delete (with its log), new secret, Send test (one
  try, now, with the newest record), deliveries. History entries for each.
  `webhooks`, `api-overview`, `history` reserved as tenant routes; `webhooks` a
  panel page. Deleting a project removes its webhooks, log and calls.
- **Endpoint notes**: `ModelDefinition.publicApi.note` (kept when a body leaves
  it out), set from a template's endpoint note, returned by the public API's
  info and shown in the tenant's API reference; capture reads it back.
- **Templates**: a webhook gains `url` (usually `{{a_url_question}}`); empty is
  a warning (made switched off), a non-address an error; an API template with no
  endpoints is a warning. The apply engine makes the webhooks (on when the
  filled address passes the address checks, otherwise off with a warning) —
  previews too, so Send test works there. MCP instructions say so.
- **Admin, tenant**: Webhooks page (`app/webhooks/`: list with on/off, Send
  test, new secret, delete, delivery log with what was sent and the answer, and
  how to check a signature in Node); example requests — curl and fetch — on
  every endpoint of the API reference (`ExampleRequest`, `api.ts`
  `exampleRequests`). `StatusDot`'s green was the theme's black (the green scale
  is mapped onto the brand); it uses `green.fg` now.
- **Admin, studio**: **Public API** tab (per model: public, actions, who may
  call, note, example requests) and **Webhooks** tab (model, events, address
  from a web-address question or typed, note; what the receiver gets).
- **Guides**: `/user-docs/public-api#examples`, `#webhooks`,
  `#verify-signatures` and troubleshooting rows; `/user-docs/projects#api`;
  `/docs/templates` Public API, Webhooks and types sections.
- **Marketing site**: changelog entry, API projects and Webhooks tiles, a
  "Tell your other systems" step (with its drawing) in Build an API.
- **Not done**: separate keys for the public API (it has none — public is
  public, customers sign in), so the API section has no "API keys" entry; AI
  keys stay under Build → Connect AI.
- **Verified**: backend and admin `tsc` clean; new smoke `webhooks.mjs`
  (46 checks, a local receiver verifying every signature) and every other suite
  green; browser on the tenant panel (:3011): an API project's sidebar and
  dashboard with real calls and deliveries, Webhooks page (Send test → toast and
  log, Add a webhook with a bad address refused in the form, secret shown once,
  the new webhook delivering a booking made by pasting the reference's curl),
  New project with three kinds; studio (:3012): Public API and Webhooks tabs
  saved to the draft with the expected warnings.

## T-10 — Studio: website tabs (2026-10-04)
- **Admin** `[id]/_components/`: the one Website tab becomes five, sharing one
  working copy of the `website` part (`website.ts`: types, `siteFrom` /
  `siteTo`, `pageTree`) — a save leaves everything it didn't touch exactly as
  it was (checked: renaming one page changed only that name).
  - **Pages**: the pages as a tree (children under their parent): name, path
    (children follow a changed path), parent (never a descendant), status,
    page template, order, in the menu; add a page or a page under one; removing
    a page moves its children up.
  - **Content**: a page picker, then its blocks in order — slug, name,
    category, section, and the fields the category uses (text and the line
    under it, button text and link, rich content, list / links one per line,
    cards, image, gallery, video); move, remove, add. Problems inline.
  - **SEO**: a card per page — title and description with their lengths,
    share image, canonical, keywords, noindex — beside `SerpPreview`.
  - **Site settings**: the Site setup cards in template mode — Branding,
    Theme (`VColor`), Contact and Social (the same field lists, now exported
    from `site-setup/_components/General.tsx`), SEO defaults.
  - **Starter code**: repository, framework, deploy link ("Make a Vercel
    link"), environment variables with {{api}} / {{slug}} buttons and a
    preview of them filled for an example project.
  - Problems open the right tab by path (`tabOfPart(part, path)`).
- **Backend**: starter code checks — deploy link https, settings without a
  repository (warning), variable names (capitals, digits, `_`) and duplicates
  (errors), empty values (warnings). The apply engine keeps a website
  template's starter code, placeholders filled, on the project
  (`template.starter`); `publicProject` returns it as `starter`.
- **Tenant panel**: a website's home shows a **Starter code** card (the
  repository, Deploy it, each variable to copy); `/user-docs/websites#starter-code`.
- **Guides**: `/docs/templates` Pages, Content, SEO, Site settings and Starter
  code sections say how each tab works.
- **Smoke** `templates-preview.mjs` +8 checks: a blog website (three pages,
  one a draft grandchild; content, list, card and rich-content blocks; SEO with
  keywords and noindex; branding, contact, social and SEO defaults; starter
  code) checks clean, previews with parents first, and the site API returns the
  home page's blocks with placeholders filled, the blog page's rich content and
  SEO, the site settings — and not the draft; bad starter variables are
  caught; the project carries the starter code with {{api}} and {{slug}} filled.
- **Verified**: admin `tsc` clean; every suite green on a fresh scratch
  server (repeat runs hit the shared tenant sign-in limit — restart first);
  browser on :3012: the five tabs render a four-page blog template, the tree
  nests, a block opens to its category's fields, the SEO preview reads, and a
  save round-trips unchanged apart from the edit.

## T-11 — Connect Claude page + Templates dashboard widget (2026-10-04)
- **Admin** `src/app/templates/connect/page.tsx` (**Connect Claude**, linked
  from the gallery's header — the page the backend's key errors already name):
  how the Templates MCP works and how it differs from Models → Connect your AI;
  its `emt_` keys — create with the four scopes explained (read, write,
  preview on; publish off, with a warning), expiry, the secret shown once with
  the setup filled in, revoke; setup for Claude Code (`claude mcp add
  --transport http emint-templates <backend>/templates/mcp/emt_…`), Claude
  Desktop / claude.ai (connector URL) and other MCP clients (header or URL);
  four starter prompts to copy.
- **Widget** `templates` (Templates overview): `normalizeWidget` accepts it
  outside any tenant scope only — a tenant project's dashboard (and a
  template's dashboard part) refuses it; no route to read, size full or half.
  `GET /admin/api/templates/stats` (view-templates): published, drafts,
  archived, with problems, the 5 most used published, the 5 recently changed.
  Admin: `TemplatesWidget` in `dashboard/widgets.tsx` (hidden for admins who
  can't view templates), **Add templates overview** in the dashboard builder
  (super admin panel only; added without a dialog; its pencil toggles width).
- **Reserved keys**: `connect`, `new`, `keys`, `meta`, `stats`, `import`,
  `previews`, `mcp`, `capture` — the studio's own paths — are never a
  template's key (a new template gets `connect-2`; renaming to one is refused).
- **Guides**: `/docs/templates#mcp` (the page, localhost vs deployed, the
  widget), `/docs/dashboard-builder#templates`.
- **Smoke** `templates-manage.mjs` +5 checks: reserved keys, stats, the
  widget saved on the super admin dashboard and refused in a tenant project.
- **Verified**: both `tsc` clean; every suite green; the connection made as
  Claude Code makes it (initialize → tools/list: 23 tools → list_templates)
  through the exact URL the page's command copies, with a key made in the
  page's dialog; the widget added in the builder, saved, and on the home page
  with live counts.

## T-12 — Guide and explanation pass (2026-10-04)
- **Links**: every guide link in the studio (tabs, dialogs, panels, the
  connect page) checked against `/docs/templates` — all land. The two
  sections nothing pointed at are linked now: **types** from New template's
  Type picker, **explanations** from the problems panel's "Still to explain".
- **Help text**: the Dashboard tab's Shows, Over, Along, Chart, One bar per
  and How many, and Starter code's Framework — the last fields without one.
  Every tab and dialog already had its intro and guide link.
- **Fixes**: every check the validator makes carries a fix; the ones that
  named old tabs now say "Public API tab" and "Models tab … then check again".
- **Guide**: Publishing walks through the four steps (save and clear the
  list, preview, Publish, notes); Versions says where they're listed and what
  "changed" means; Who can use it explains the three choices and the
  reserved keys.
- **Verified**: admin and backend `tsc` clean; on :3012 all 29 linked anchors
  exist on the rendered guide and the guide has exactly those 29 sections.

## T-16 — Big template previews, readable errors, answer defaults (2026-10-05)
- **Cause** (clients-invoices preview failing on production with a generic
  connector error): not a thrown error — the four "failed" previews were all
  in the sandbox, fully built, after 100–200 s; the request had outlived the
  platform's 30-second limit. (The MCP transport already turned thrown errors
  into tool errors.) Locally: 8 s, ~1,065 Mongo operations.
- **Background builds** `templateSandbox.function.ts`: wait 20 s
  (`TEMPLATE_PREVIEW_WAIT_MS`), then `building`; `previewStatus`; failed
  record kept an hour; stale builds (15 min) count as failed; one build per
  template; reopen/delete refuse a building preview; eviction skips it.
  `TenantProject.preview.status/builtAt/result/error/problems`.
- **MCP** `safely()` catches everything (stack logged for unexpected errors);
  `preview_template` → building + id; new `preview_status`; instructions.
- **Admin API** `POST /templates/:id/preview` 201 ready / 202 building.
  **Admin** PreviewDialog toast + polled list with Building… / Not built.
- **Faster sample data**: `createRecords` caches link lookups per call.
- **Validator**: `{{answer}}` field defaults checked per question option
  against the field's allowed values; planner checks a sample-filled copy —
  answers can now drive select/number defaults.
- **Guide** `/docs/templates#preview`; README TD8.
- **Smoke** `templates-mcp.mjs` +4 (ready status, preview_status by id and by
  template, bad id).
- **Verified** (local Mongo :27998, backend :5013 with the production copy of
  clients-invoices): with a 2 s wait the MCP answers building in 2.2 s, a
  second call joins it, `preview_status` gives a link that signs in; a late
  sample-data failure reads "Sample data: Reconciliation — no Client called
  …" with no models left; an early failure leaves no project; `{{paymentTerms}}`
  default validates, builds with the answer (45), and a field missing option
  60 is named. Studio dialog checked on :3013 (building → built; failed row
  with the reason). Suites templates, templates-preview, templates-mcp green;
  templates-manage's one tenant-dashboard check needs `run-all`'s saved
  tenant state. Both `tsc` clean.
