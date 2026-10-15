# MINT CMS — changelog

Newest last. One entry per work order: date, WO, what changed, files, how it was verified.

---

## 2026-10-15 — CMS-01 Plan & docs
- The user: "for the website cms, currently we have a content model which works, but i think it can be refactored
  and made better. plan and recommend to make it state of the art so that we can cross strapi type cms".
- Read the current content (websiteKit.function.ts, siteBuilder/kit.ts + connect.ts, site-builder D27/D28) and
  compared with Strapi 5. Wrote `README.md` (today, gaps, the comparison, decisions D1–D12 + D-AI, entry shape,
  migration, later, risks) and `WORK_ORDERS.md` (CMS-02…15). Proposed — waiting for the user's decisions.
- The user's decisions (same day): contents stay one record per item, with a Pages dropdown showing one page's
  contents, the type chosen first (hero / FAQ / cards…) so only its fields show, and a List type (a model, how many,
  order, conditions); drafts until Publish; languages chosen in Settings, other-language fields only when there's
  more than one; engine first. README D1, D8, §5, §6 and CMS-06, CMS-12 rewritten to match.

## 2026-10-15 — CMS-02 Single types + address (uid) fields
- Backend: `ModelDefinition.kind` (`collection` | `single`) and field `from`; field kind `uid` (FIELD_KINDS). Compiled
  models: `uidHooks` (pre-validate — typed ones tidied with `uidOf` and checked free, empty ones made from `from`
  with -2, -3…; Latin accents dropped, other scripts kept) and `singleHooks` (a second record refused on save and
  insertMany, 400). Builder checks: a uid is always unique, its `from` a text/email/url/select/textarea field; a
  collection becomes single only with ≤ 1 record. Settings: uid → `slug` input with `slugFrom`; a uid with `from` isn't
  required in the request (it fills itself). `/get/route` says `single: true`. Public API: a single type's list
  answers with the record (404 before it's made); its standard endpoint is "Read <title>"; uid is filterable and
  searchable (`?slug=…`, lower-cased). AI/MCP plan schema: model `kind`, field `from`, the uid kind guide.
  `admin-controllers/common/createDocument` passes a model's own 4xx through.
- Panel (mint-tenant): kind "Address (slug)" with a "Made from …" picker and its check; Settings → **How many
  records** (Many / Just one); form preview; `VSlug` follows its source on new records (never on edit) and stays
  controlled; `SingleTypePage` (opens the record, or "Fill it in"); a single type's record page is titled by the page,
  without a table breadcrumb. Admin not changed (it shows a table; the backend still refuses a second record).
- Docs: mint-docs Models → Single types, Address (slug) fields; website changelog.
- Verified: `cms-single.mjs` (24 checks) passes; models, api-builder, public-filters, templates-apply, website-mcp,
  templates-mcp, site-builder-data pass. Headless Chrome: empty single type, its record page, the slug following a
  typed title, the model builder's field row and How many records. (A pre-existing React "uncontrolled → controlled"
  warning shows on every create form when typing — not from this change.)

## 2026-10-15 — CMS-03 Components
- Backend: `ComponentDefinition` (`componentdefinitions`, scoped; uid `category.name`, title, description, icon, fields,
  version). Field kind `component` (`component`, `repeatable`, min/max for a list). `expandComponents` turns it into a
  section / section list of the component's fields wherever a model compiles or its settings generate (buildSchema,
  generateSettings), from a per-scope cache loaded with the models (`syncDynamicModels`); a list's min/max validated; a
  component left blank is unset (`isBlankGroup`). Component fields: `COMPONENT_KINDS` = section kinds + editor, images,
  files, video, tags, multiselect (SUB_INPUT maps them). Builder routes `/builder/components` (list with `usedBy`, get,
  create, update, delete refused while used); saving recompiles every model using it and regenerates their settings
  (`refreshComponentUsers` → syncCopies). Model checks: the component must exist. Automations, webhooks, public sort and
  the API builder's field lists treat it like a section. Project delete takes components. MCP `list_components`,
  `save_component`; the plan schema takes `component` / `repeatable`. Sidebar: Build → Components.
- Panel (mint-tenant): `/components` (by category, used-by badges) and `/components/[id]` (`new` to make one: title,
  address, description, icon, FieldsEditor with COMPONENT_KINDS, form preview, used by, delete); `components` is a
  project page (proxy). Model builder: kind Component with a component picker and One / A list, How many (at least /
  at most). Admin: `/<project>/components` redirects to its model builder until mint-tenant is live.
- Not yet: components inside components, links to records inside a component, "make a section reusable", templates
  carrying components (a blueprint with a component field needs the component in the target project).
- Docs: mint-docs Models → Components; website changelog.
- Verified: `cms-components.mjs` (25 checks) passes; cms-single, api-builder, api-logs, public-filters, automations,
  webhooks, templates-apply, site-builder-data, widgets-cart, website-mcp, comments pass; models passes on a fresh
  database. Headless Chrome: Components list and editor, a model's component rows, a record form drawing them.

## 2026-10-15 — CMS-04 Content blocks
- Backend: field kind `blocks` (`components`: the uids it takes, min/max). Compiled as an array whose items are
  Mongoose embedded discriminators keyed by `__component` — one per allowed component (`blockTypes`), so each item is
  validated, defaulted and stripped as its component; validators refuse a component it doesn't take and check the
  count; a pre-validate hook gives every item a `_key`. `expandComponents` adds `blockTypes` from the scope's cache
  (now with icon/description). Settings: `schema.type: 'blocks'`, `schema.blocks` = [{uid, title, icon, description,
  dataModel}], `limit` = max. The server's form and view converters pass `blocks`. Builder checks: components picked
  and made. A component's usage and refresh include blocks fields. Automations, webhooks, public sort, API builder
  fields treat it like a section. AI/MCP: kind guide + `components` in plans.
- Panel (mint-tenant): `VBlocks` (Add menu of the allowed components, items collapse with a preview, up/down, copy,
  remove, at-most note) registered as input `blocks`; record pages draw each block under its component's title, full
  width (`BLOCK_TYPES`); model builder kind "Content blocks" with component toggles and How many.
- Docs: mint-docs Models → Content blocks; website changelog.
- Verified: `cms-blocks.mjs` (19 checks) passes; cms-components, cms-single, api-builder, webhooks, automations,
  widgets-cart pass. Headless Chrome: two blocks added and filled through the form and saved (stored with keys), the
  record page, the model builder row.

## 2026-10-15 — CMS-05 Drafts and publishing
- Backend: `draftAndPublish` on models; `_published` (select:false), `_publishedAt`, `_publishedFrom` paths;
  `drafts.function.ts` (prefixQuery, liveFind / liveFindOne / liveCount, publish / unpublish / discard, statusOf);
  public API list/get and the site's lists + template pages read published values; routes POST /:id/publish |
  unpublish | discard and /bulk/publish (update permission); switching it on publishes existing records
  (`publishedNow`); Published column; `/get/route` says draftAndPublish; AI plan schema.
- Panel: model Settings → Drafts and publishing switch; record page badge (Draft / Published / Changes not published)
  with Publish, Take off, Discard changes.
- Not yet: D11 separate Publish right, mint-docs guide section, website changelog, publish webhooks (CMS-09).
- Verified: `cms-drafts.mjs` (25 checks) passes; public-filters, api-builder, api-logs, site-builder(-data/-starter),
  widgets(-cart), cms-*, webhooks, automations, templates-apply, website pass. Headless Chrome: record page header.


## 2026-10-15 — CMS-05 (rest) Publish right, guide, website
- Backend: D11 — `records:publish` (standard permission, in Member / Developer / Full access defaults and in `data:*`)
  and per-model `publish-<route>` on a project's own roles (offered only for models with drafts); publish / unpublish
  / discard / bulk publish check `publish-<route>` in tenant projects (the super admin keeps edit). Switching drafts on
  gives `publish-<route>` to the project roles with `edit-<route>`. `scripts/migratePublishRight.js` (dry run /
  `--apply`): roles that edit get Publish — **run once at the deploy that ships this**.
- Panel: role editor's Publish column; organization roles list it; record page without the right says "Someone who
  can publish puts it live" instead of the buttons.
- Docs: mint-docs Models → Drafts and publishing (`models-drafts`), Organization → permissions + project roles;
  website changelog.
- Verified: `cms-drafts.mjs` (35 checks), project-invites, access, org-1 pass. Headless Chrome: the role dialog's
  Publish column on the drafts model only.

## 2026-10-15 — CMS-06a Typed contents, by page
- Backend: content types = components `content.*` (`library/siteBuilder/contentTypes.ts`: Hero, Text, Rich text,
  Cards, Questions, Numbers, Reviews, Gallery, Video, Call to action, Logos, Picture, List, Section, Header, Footer —
  one vocabulary: eyebrow, heading, text, image, buttonLabel/Url, items[title, subTitle, description, image, url]);
  `ensureContentTypes` makes the missing ones, `ensureTypedContents` adds `type`, `order` and `block` (content blocks,
  one item, every `content.*` type) to the kit's Contents (new websites at seed; others when the screen opens).
  Components may hold a group or a list of rows one level deep (`section` / `sectionlist` in COMPONENT_KINDS;
  `dataModelOf` draws them). `routes-tenant/siteContents.router.ts` (/site-contents): types (+ form, + models a List
  can show), a page's contents in order with the pages' counts, create with the type first (slug
  `<page>-<type>-xxxxxx`, last place), edit (name, page, the type's fields), reorder, archive, list preview.
  `resolve.ts`: `readList` — a List record's model through its public API's rules (conditions all/any via
  `conditionQuery`, order, how many, card title/text/picture, link pattern `{field}`); a collection whose
  `source.content` is a List shows those records, a typed Cards record its `items`.
- Panel: `/t/web-contents` of a website opens the Contents screen (`?view=table` the table): page dropdown (Whole site
  + pages with counts), pieces in order with type, preview, move up/down, edit, remove; New content → type picker →
  only that type's fields (BlockFields), List settings (ListEditor: model, how many, order, ConditionsEditor, card
  fields, link, "It shows now"); older one-word records listed below, opened in the table.
- Docs: mint-docs Websites → Contents, page by page (`site-contents`), Lists of your records (`site-contents-list`);
  website changelog.
- Verified: `cms-site-contents.mjs` (31 checks) passes; site-builder(-data/-starter/-connect), website(-mcp), cms-*,
  templates-apply pass. Headless Chrome: the screen, the type picker, the List editor showing what it lists, the
  Cards form, a Call to action added through the form, phone width.

## 2026-10-15 — CMS-06b The site on typed contents
- Backend: `connect.ts` `connectTyped` — each top-level section's words go into one record of the section's type
  (by its name: Hero, Call to action, Questions, Numbers, Reviews, Logos, Gallery, Cards for features/team/steps/
  pricing/services/products/blog, Text for a page title, Header/Footer by part, else Section), bound by path
  (`heading`, `buttonLabel` + `buttonUrl` from the button's link, `items.2.title`); a grid of look-alike cards becomes
  the record's `items` drawn by a list (`source.content`); other look-alike rows (questions, quotes, numbers, links)
  bind to `items.<n>.<field>`; words with no room go into extra Section records ("(more)"); a copy is connected anew;
  empty records aren't made. Unit tests for every preset (`test/connect.test.ts`). `kit.ts`: `flatContent` (a typed
  record read flat, with the old names as aliases — `content` → heading, `btnText` → buttonLabel, `card` → items…),
  `typedPath`, `upsertContents` makes/updates typed records from typed or old-style fields, `resolveContents` and
  lists read what's published (the editor's `/resolve` reads drafts), `unpublishedContents` / `publishContents`,
  `orderContents` (a page's pieces in its tree's order, on every save). Contents become drafts until published
  (`ensureTypedContents`, which runs when the builder opens and publishes what's there). The site's Publish publishes
  the words it shows; `/changes` lists the unpublished ones (`contents`) and counts as a change. Binding paths may name
  a row (validator `FIELD_PATH`). `/pages/by-path` serves published contents in order; the website MCP's `upsert_page`
  publishes the blocks it writes (and unpublishes the ones it archives) — templates build through it.
  `/site-contents/publish` { page } or { ids }. Built-in types have no required fields (a section may lack a heading).
- Panel: Contents shows Draft / Published / Changes not published per piece, Publish per piece and Publish the page.
- Docs: Websites → Contents (drafts until you publish), Site builder → Your data on the page; website changelog.
- Verified: cms-site-contents (37), site-builder(-data/-connect/-starter), website(-mcp), templates(-apply/-preview),
  widgets(-cart), public-filters, api-builder, cms-* pass; jest connect tests pass. Headless Chrome: statuses, Publish
  the page.
- Not yet (06c): moving old one-word records into typed ones, the builder's own pickers showing typed fields.

## 2026-10-15 — CMS-06c Moving sites over
- Backend: `library/siteBuilder/migrateContents.ts` — `migrateSiteContents` (per site, once: `draft.contentsMigratedAt`
  on the design): each page's and layout's draft tree reads the panel's latest words, an old list of cards becomes a
  typed Cards record, bindings to old records are dropped and the tree connected again (one typed record per section),
  the new records published (the old words were live), the draft saved only over the rev it read (a page saved meanwhile
  waits for the next run). Old records used by the site get `migratedAt` and stay for the live site; the site's Publish
  archives the ones no live tree uses (`retireMigrated`). Runs when the builder opens (GET /design with Build), and for
  every website with `scripts/migrateSiteContents.js` (dry run / `--apply`) — **run at the deploy that ships CMS-06**.
  Re-connecting is idempotent (a section already bound makes no record; a row with no room places the word like a
  word on its own). Site design is a single type (new sites; others when the builder opens and it holds one record).
  Contents hides moved records.
- The theme starters already make typed records (06b); header and footer are pieces of the Whole site. mint-builder and
  mint-sites needed no change: bindings keep `{from:'content', slug, field}`, `field` a path, the old names aliased.
- Verified: `cms-site-migrate.mjs` (16 checks) passes — the live site reads the old records until Publish, then the same
  words from typed records, the old archived, a second open makes nothing new; the script's dry run and `--apply` on the
  scratch database (40 sites, 749 typed records); a published old site's live words compared before / during / after
  (unchanged, except a list of cards that showed nothing now shows its cards). site-builder(-data/-starter/-connect),
  website(-mcp), templates-apply, cms-* pass.
- Templates' website blueprints still write old-style blocks through `upsert_page` (coded sites read them by-path) —
  CMS-15 moves them to typed ones.

## 2026-10-15 — Production
- `migratePublishRight.js --apply` run on production (37 organization roles that edit got `records:publish`; re-checked: 0
  left). `migrateSiteContents.js` dry run on production: 10 website projects, none typed yet — **apply right after the
  backend deploy**, not before (the old backend can't compile a Contents model with a `blocks` field).

## 2026-10-15 — CMS-07 Content manager
- Backend: `routes-tenant/content.router.ts` (/content: website Contents, single types, drafts collections with total /
  draft / modified / last edit, only models the member may see); sidebar section Content → All content after the
  Dashboard (websites, or any project with drafts or single models — `tenantContent`); drafts models get a `_status`
  column (Draft / Published / Changes not published, worked out per row in controllers/common/getAllDocuments) and a
  `publishStatus` filter (filter middleware); getById adds `_publishedBy`. Admin: `/<project>/content` → dashboard.
- Panel: `/content` page; Menu → Publish for ticked rows on drafts models (needs publish-<route>); record page meta
  "Published 2h ago by Ana"; ⌘S saves forms.
- Verified: cms-drafts (now with CMS-07 checks) passes. Visual check of /content was in progress when the session
  limit neared — re-check next session.

## 2026-10-15 — CMS-07 on screen: fixes
- Checked All content and a drafts model's table in headless Chrome (desktop and phone). Found and fixed:
  - **No row ticks on a drafts model's table**, so bulk Publish couldn't be reached — row selection is a page
    setting (`route.select`) builder models never had. `/get/route` now turns it on for a drafts model unless the
    page's own settings set `select` (getPageRoute.controller.ts). Smoke: cms-drafts checks it.
  - **Status column empty**: the `tag` cell drew only lists. `_status` now uses coloured tags (`colorTags`, Draft grey,
    Changes not published orange, Published green); mint-tenant's TagCell takes a single value too, and a long tag
    shortens in a narrow column (full words on hover) instead of running into the next.
  - mint-tenant: Panel's title and subtitle are divs (an icon in the title was a `<div>` inside a `<p>`, a hydration
    error on All content); table columns sharing a dataKey (a photo column keyed by the name) no longer share a React
    key.

## 2026-10-15 — CMS-03b Links and components inside a component
- Backend: COMPONENT_KINDS += reference, references, section, sectionlist, component; `NESTING_KINDS`. A component's checks
  (`checkComponentFields(req, fields, uid)`): a link names a model of the project; a component inside is one of plain
  fields (no NESTING_KINDS), never itself; one that sits inside another can't gain groups or components.
  `expandComponents` → `expandField`, recursive one level (component fields and blocks' component types alike).
  Links at any depth point at the project's internal model names in `pathsOf` (was only the model's own fields in
  `compile`; the builder preview's field list shows plain names). Settings: `dataModelOf(fields, target)` gives a link
  inside a group the record picker (`data-menu` / `data-tag`, `model`, `menuKey`, `labelKey`); a group's links populate
  (`linksIn` → a list of populate options; lib + library constructConfig `flatMap` them; the settings validator takes
  a list). Components' usage lists the components holding one; delete refused naming them; a change refreshes the
  models using a component that holds it. MCP save_component describes the new kinds.
- Panel (mint-tenant): COMPONENT_KINDS/NESTING_KINDS; the component editor offers them, with the project's models as
  link targets and a component picker of plain components (not itself; `FieldsEditor inComponent`); groups and blocks
  pass a picker its `model`; record pages draw linked names and a group / rows inside a group (SectionValues).
  **Edit forms showed a saved link's picker empty** (every picker, not only these): the combobox writes a name only on a
  pick — VDataMenu now fills it once the saved record is in the list (controlled `inputValue`).
- Docs: mint-docs Models → Components → Links and components inside a component; website changelog.
- Verified: `cms-components-nested.mjs` (20 checks) passes; cms-components, cms-blocks, cms-single, cms-drafts, models,
  api-builder, automations, webhooks, site-builder-data, website, cms-site-contents, public-filters pass. Headless
  Chrome: the component editor with links and a component inside, a record page with linked names and the inner
  group, the edit form (both pickers named), a new pick saved.
- Not yet: links inside a component on the public API come as ids (CMS-09 `populate`); "make reusable"; templates
  carrying components.

## 2026-10-15 — CMS-03b Make a section reusable
- Backend: `POST /builder/models/:id/make-component { field, category, name, title }` (components.controller
  `makeReusable`): a saved section / section list becomes a component made from its fields (saveComponentCore — the
  usual checks and uid rules), and the field becomes kind component (`repeatable` for a list, label, helper, add label
  kept) through updateModelCore (a RouteVersion snapshot, recompile, copies regenerated). Records are untouched — a
  component is stored as the section was. If the model change fails, the component made for it is removed.
- Panel (mint-tenant): "Make reusable" under a saved section / list on the model's Fields tab →
  `MakeReusableDialog` (title, address category.name; asks to save other changes first) → `makeSectionReusable`.
- Docs: mint-docs Models → Components → Make a section reusable; website changelog.
- Verified: cms-components-nested.mjs now 29 checks (a section and a list made components, a non-section and a taken
  name refused with the model left as it was, records read the same, the component's rules hold). Headless Chrome:
  the dialog, then the field shown as Component · Venue · One with nothing unsaved; the record unchanged.
