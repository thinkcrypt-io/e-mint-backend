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

