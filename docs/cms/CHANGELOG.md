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

