# Autofill — change log

## 2026-11-02 — AF-09…AF-15 rework built
- The user: "AF-09 to AF-15". Autofill is now a setting on any field (`fillFrom { from, formula, readonly?, when?, match? }`), the two types are gone.
- **Engine (AF-09)** — `linkedFill.function.ts`: `isLockedFill`, `fillHolds` (conditions on this record, or `@.field` of the picked one, via `fieldLocks.meets`); read-only cleared and still locked while conditions don't hold (save, bulk, import, public API, `followReadonly`, rows); editable filled when conditions start to hold and it is empty; read-only clears use `$unset` (a number's setter turns a null `$set` into nothing); links copied as text ids; engine-owned (`edit: false`) fields aren't filled on update. Builder checks: kind can autofill (D11), source field exists and fits, conditions name real fields.
- **Migration (AF-10)** — `scripts/migrateAutofill.js` (dry run / `--apply`); old kinds removed from FIELD_KINDS, Joi, AI schema, MCP text. Prod dry run: nothing to change.
- **Panels (AF-11…13)** — one Autofill block (`FillFromEditor`) in the page builder's Advanced and in each model-builder field; conditions list this record's fields and `Customer › type`; form: `LinkedFiller` checks `when` live (fills when they start holding, clears a read-only copy when they stop), read-only drawn as a muted copy (`lockedFills`).
- **MCP (AF-14)** — `fillFrom` with `readonly`/`when`/`match` on any field.
- **Side effect** — the feature builder used to drop the blueprint's `fillFrom` on fresh stores; now it's kept, so product → category tax fill is live on new stores, and new variants carry their product's tax (`catalogue.ts`).
- **Checks (AF-15)** — smoke rewritten (conditions, locked-and-cleared, follow, bulk, rows, migration); commerce-tax and date-formulas smokes pass. commerce-install and commerce-categories smokes have failures that predate this (stale counts / layout expectations).

## 2026-11-02 — AF-01…AF-08 built
- The user: "complete the work orders af01-08".
- **Engine (AF-01, AF-06)** — `library/functions/linkedFill.function.ts`: `autofill()` runs before validation on
  create and update (router `linkedFills`). Editable: filled when empty on create; on update only when its link
  changes in that save and it wasn't sent; a typed value stays. Read-only: dropped from the body and set from the
  picked record on every save (`req.autofilled`, applied by createDocument / updateDocument), emptied with the link,
  left as it was when the person can't read the record. Bulk edit (`syncReadonly`) and import set it too; the public
  API sets it for server keys only (a visitor must not read other records through a link). Source saved →
  `followReadonly` from `recalculateDependents` rewrites the copies (one hop), recalculates their formulas and goes on
  to what reads those; a deleted source leaves the copies; editable ones are never touched.
- **Types** — `autofill` / `autofillreadonly` in FIELD_KINDS (model builder) and settings `schema.type`, with
  `schema.fillFrom` + `schema.fills` (text / number / date / boolean, D3). The form gets the input of the value it
  holds (`convertToFormFields`: autofill → string / number / date / checkbox) and, for read-only, `autofillreadonly`
  with `fills` and `fromLabel`; tables and detail pages use `tableType` / `viewType`.
- **Rows (AF-07)** — the rows of a Section *list* may hold a link to records and autofill fields
  (`dataModel[].fillFrom`); each row is filled from the record picked in that row, read-only rows follow the product
  (`arrayFilters` update). Plain sections still can't. Row formulas can use a read-only number (`quantity * rate`).
- **Builders (AF-03, AF-04)** — page builder: both inputs under Values, `FillFromEditor` as the type's own editor
  (no switch, a note when the copied field's kind differs), switches locked for read-only; model builder: two kinds, the
  link + field pickers inline, `fills` from the picked field, row editor lists link + autofill kinds for lists.
  Publish/model checks: link must be a link field, a source field is named, hidden fields can't be copied, the model's
  stored type must match `fills`.
- **MCP / AI (AF-05)** — the kinds, `fillFrom` and `fills` are in plan_feature / build_feature / the AI builder's
  schema; describe_platform and the server instructions explain them. Re-add the connector to see them.
- **Docs (AF-08)** — mint-docs Models "Autofill", Pages guide note, admin /docs/builder `#models-autofill`, the doc
  link on the builder editor, website changelog.
- Verified: `scripts/tenancy-smoke/autofill.mjs` (backend :5081, 36 checks: builder refusals, create / API without the
  form, a typed phone kept, a read-only value ignored, edit, re-pick replacing a typed phone, a phone sent with the
  pick winning, clearing, the customer changed → orders follow while typed phones stay, another customer not reaching,
  bulk edit, a deleted customer leaving copies, rows per product and following it); date-formulas smoke still passes.
  mint-tenant (:3083 → :5081): the order form fills Phone / Email / Credit on a pick, a re-pick replaces the typed phone,
  clearing empties the read-only fields and keeps the phone; the model builder shows the link + "Its Phone" pickers;
  the page builder lists Autofill / Autofill (read-only) with Required / Can-be-changed locked on the latter.
  `tsc` clean in backend, admin, mint-tenant. Not checked in a browser: the rows editor in the model builder, the
  super-admin panel, a page-builder switch of an existing field to Autofill.
- **Not deployed.** Backend Heroku deploy is manual; admin / mint-tenant / mint-docs / website pushed to main.
