# MINT CMS — work orders

Read `README.md` first (decisions D1–D12, D-AI). Sizes: **S** ≤ 1h, **M** ≤ half a day, **L** ≤ 2 days.
Each WO ships on its own: code, smoke, guide (mint-docs) + website, commit and push, a line in `CHANGELOG.md`.
Nothing here starts before the user confirms the decisions.

## Status

| WO | What | Where | Size | Status |
|---|---|---|---|---|
| CMS-01 | Plan & docs | backend | S | done 2026-10-15 (proposed) |
| CMS-02 | Single types + UID field kind (D2) | backend + mint-tenant | M | — |
| CMS-03 | Components: definitions, `component` field kind, nesting, "make reusable" (D3) | backend + mint-tenant | L | — |
| CMS-04 | Dynamic zone: `blocks` field kind, panel editor, API shape (D4) | backend + mint-tenant | L | — |
| CMS-05 | Draft & publish per entry: `_published` snapshot, status, publish/unpublish/discard, every read path (D5, D11) | backend + mint-tenant | L | — |
| CMS-06 | Website content refactor: section components from the builder's presets, Page `sections`, Shared sections, header/footer/settings/design as single types, new bindings, migration (D1) | backend + mint-builder + mint-sites | L+L | — |
| CMS-07 | Content manager: "Content" in the sidebar, entry editor with status sidebar, list badges (D5, D11) | mint-tenant | L | — |
| CMS-08 | Preview on the real site: tokens, mint-sites draft render, side-by-side pane (D9) | backend + mint-sites + mint-tenant | M | — |
| CMS-09 | Content API: status, locale, populate, single types, publish webhooks, site revalidation (D10) | backend + mint-tenant | M | — |
| CMS-10 | Versions: store, compare, restore (D6) | backend + mint-tenant | M | — |
| CMS-11 | Scheduling: publish at / unpublish at (D7) | backend + mint-tenant | M | — |
| CMS-12 | Locales: project locales, localized fields, `_locales`, API + site `/bn/…`, builder switcher (D8) | all | L+L | — |
| CMS-13 | Media: alt, caption, focal point; image field `{url, alt…}` opt-in (D12) | backend + mint-tenant | M | — |
| CMS-14 | MCP content tools: entries, publish, translate, fill, SEO (D-AI) | backend | M | — |
| CMS-15 | Guide, website, templates and theme starters in the new shape | docs + website + backend | M | — |

Order: 02 → 03 → 04 → 05 (the engine every project gets) → 06 (the website's content) → 07 → 08 → 09 → 10 → 11 →
12 → 13 → 14 → 15. 02–05 are useful on their own (any app gets single types, components, zones and drafts).

## CMS-02 — Single types + UID (M)
- `ModelDefinition.kind: 'collection' | 'single'` (default collection). Single: the store refuses a second record;
  the model page opens the form (made on first open); the table, bulk and import are hidden; `GET /<route>` on the
  public API / endpoints returns the entry (or `{}`); the builder (models) shows "Single" with a short explanation.
- Field kind `uid`: `from` (a text field), lowercase-dashed, unique per model; filled from `from` until edited; the
  form shows the address it makes; collisions get `-2`. Checked in the model validator and the record save.
- Smoke: `cms-single.mjs`. Guide: models#single, models#uid.

## CMS-03 — Components (L)
- `ComponentDefinition` (project-scoped, in the shared builder collection): `uid` (`category.name`), title, icon,
  fields (every kind but `blocks`; `component` one level deep).
- Field kind `component`: `component` (uid), `repeatable`, `min`, `max`. Stored inline as an object / array.
  Dynamic models compile it as a sub-schema (like `section`); validation, defaults, formulas inside; references
  inside are populated like top-level ones.
- Panel: Build → Components (list, editor reusing the model field editor); a model field "Component" picks one;
  record form renders it (single: a fieldset; repeatable: the sectionlist UI with add/reorder/collapse).
- "Make reusable": turns a model's `section` / `sectionlist` into a component (fields copied, data unchanged).
- Changing a component recompiles every model that uses it (version bump). Deleting one in use is refused, naming
  the models.
- MCP: `list_components`, components in `plan_feature` / `build_feature`.

## CMS-04 — Dynamic zone (L)
- Field kind `blocks`: `components` (allowed uids), `min`, `max`. Stored as `[{ _key, __component, …fields }]`.
- Validation per item against its component; `_key` made on save if missing, kept stable.
- Panel: the zone editor — "Add section" picker (title, icon, a one-line description, optional preview image),
  drag to reorder, collapse/expand, duplicate, hide (`_hidden`), delete with undo.
- API: items in order with `__component`; `fields` and `populate` reach inside.

## CMS-05 — Draft & publish (L)
- `ModelDefinition.draftAndPublish` (default on for new content types in website projects; off for existing models
  until turned on — turning it on publishes the current records so nothing disappears).
- Record routes: `POST /:id/publish`, `/unpublish`, `/discard`; list/get return `_status` (draft / published /
  modified) and `_published.at`. Bulk publish/unpublish.
- One read helper (`liveView(def, doc)` + `liveQuery(def, filter)`) used by: publicRecords (lists, get, filters,
  search, sort on `_published.<field>`), API builder rules and `checkCreate`, site resolve (`siteReach`), widgets,
  webhooks (`publish` / `unpublish` events; record events unchanged), automations (a new "when published" trigger).
- Rights: `publish-<route>` next to `edit-<route>`; project roles editor shows it; Full access has it.
- Indexes: the per-model index manager adds `_published.<field>` for fields used in public filters.
- Smoke: `cms-publish.mjs` — a draft-only change is invisible on every read path; publish shows it; discard restores.

## CMS-06 — Website content refactor (L + L)
- Section components generated from the site builder manifest (`siteBuilder/manifest.ts`, section presets): one
  per preset, fields from its bindable props; cards → a repeatable item component with the card's own fields.
- Kit: Pages gets `sections` (blocks) and `seo` (component `shared.seo`); new single types **Header**, **Footer**,
  **Site settings** (from WebsiteSettings) and **Site design**; collection **Shared sections**.
- Builder (mint-builder): binds `{from:'section', key, path}`; adding a section adds its item to the page's draft
  with demo words; editing in place writes the draft; Publish in the builder publishes layout + the page entry
  together; reading a page pulls panel edits (as today, from the entry).
- Renderer (mint-sites): reads the published page entry (draft with a preview token); still reads old
  `{from:'content'}` until a project is migrated.
- Migration: `scripts/migrateSiteContent.js` (dry run / `--apply`) + lazy on first open; Contents grouped by page +
  section into the entry, trees rebound, the current state published, Contents marked `migratedAt`.
- Smoke: `cms-site.mjs` (new site from a theme, edit in panel → not live until publish, builder edit → entry draft,
  migration of a site made the old way renders the same HTML).

## CMS-07 — Content manager (L)
- Sidebar section **Content** (website projects first, then any project with content types): Single types, then
  Collections; counts and "n not published".
- Entry editor: the form on the left; a sidebar with status, **Publish** / **Unpublish** / **Discard changes**,
  schedule (CMS-11), locale switcher (CMS-12), Versions (CMS-10), Preview (CMS-08), comments, last edited by.
  Unsaved/unpublished warnings; ⌘S saves.
- Lists: status badges (Draft / Published / Modified), filter by status, bulk publish.

## CMS-08 — Preview (M)
- `POST /p/:project/preview-token` (15 min, one entry or page); mint-sites `?preview=<token>` renders drafts with a
  "Preview" bar; per-model preview address (`/blog/{slug}`); the editor's side-by-side pane refreshes on save.

## CMS-09 — Content API (M)
- Endpoints serve `_published`; `status=draft` with a server key or preview token; `locale`; `populate` (depth 2,
  per endpoint, allow-listed); single types as `GET /<route>`; `publish` / `unpublish` webhook events; publish
  revalidates the site's cached pages (`SITE_REVALIDATE_SECRET`). Reference, tester and request logs know about them.

## CMS-10 — Versions (M)
- `ContentVersion` (shared collection, scoped): model, record, n, status, data, by, at. On publish, and on save at
  most every 10 min. Retention per D6 (TTL + cap). Drawer: list, compare with now, restore into the draft.

## CMS-11 — Scheduling (M)
- `_schedule.publishAt / unpublishAt`; a minute tick (one leader — Mongo lock doc) publishes/unpublishes and
  records who scheduled it; the editor's sidebar sets and clears it; notifications on success/failure.

## CMS-12 — Locales (L + L)
- Project locales (Project → Settings): default + others. Field flag `localized` (text kinds, editor, uid,
  components' text). `_locales.<code>` on the draft and in `_published`; fallback to default.
- API `locale`; the site `/bn/...` with `hreflang` and a language switcher block; the builder's locale switch
  edits that locale's words; the editor shows the default beside the translation.
- MCP translate (CMS-14) fills a locale's draft.

## CMS-13 — Media (M)
- Library: alt, caption, focal point (click on the image) per file; image/images fields can opt into the object
  shape; the renderer uses alt and focal point (`object-position`).

## CMS-14 — MCP content tools (M)
- `list_content_types`, `get_entry`, `save_entry_draft`, `publish_entry` (only after the user says so),
  `translate_entry` (the AI writes the translation; the tool stores it as the locale's draft), `fill_page`
  (sections from a brief), `suggest_seo`. Server instructions: drafts first, never publish unasked.

## CMS-15 — Docs, website, templates (M)
- mint-docs: a "Content" guide (types, components, zones, draft & publish, versions, locales, preview) + updates to
  Models, Site builder, API; website changelog + features; templates and theme starters in the new shape.
