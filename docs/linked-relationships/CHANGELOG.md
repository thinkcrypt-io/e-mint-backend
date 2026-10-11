# Linked Relationships — changelog

Newest last. Each entry: what changed, where, how it was checked, commits.

## 2026-10-11 — plan and decisions
- Plan written (`README.md`, `WORK_ORDERS.md`), first as "linked updates".
- The user took every recommendation: stored "Mark as paid" field (D2), acts as
  the person with a per-rule "allow anyway" switch (D4), delete reverts by
  default (D5). The feature is named **Linked Relationships** (D6). Log every
  step here, and update the marketing site and the guides with each WO (D9).
- Folder renamed `docs/linked-relationships`; config key `linkedRelationships`.

## 2026-10-11 — LU-01 engine
- `library/functions/linkedRelationships.function.ts`: rule shape + Joi
  (`linkedRulesSchema`), `prepareLinked` (checks before any write: required
  copies, target loaded in scope with edit permission unless `asSystem`, target
  route's allowEdits / UPDATE validator / field locks / model validation with
  formulas), `apply` (journal, `$inc` for adds, LinkedChange log, history "by
  rule …", target's own rules up to 3 deep, rollback on failure), undo
  (revert / keep / block, stacked changes, missing target).
- `library/models/linked-change` (LinkedChange, tenant-scoped, skipped by history).
- `recordHistory` takes `modelPath` and `note`.
- Wired into the live controllers: `admin-controllers/common/createDocument`,
  `controllers/common/updateDocument`, `controllers/common/deleteDocument`.
  Responses carry `linked: [{rule, route, id, name, model, changes}]`. Routes
  without rules skip everything (`hasLinkedRules`).
- Builder: config key `linkedRelationships` in `configDraftSchema`;
  `library/controllers/builder/linkedCheck.ts` checks fields, picker → page,
  editable / not secret / not formula or rollup, numbers for adds, protected
  pages, loops — on draft save, publish and `publishConfigPatch`.
- Decided on the way: D10 (compensation, no transactions), D11 (lock-style
  conditions). `inc` adds only the difference on an edit.
- Checked: `scripts/linked-relationships/smoke.mjs` against a private server
  (:5021) + scratch mongod (:27997) — 42 checks, all pass: publish checks,
  ticked/unticked, required date, block rule, invalid target value (nothing
  saved, invoice byte-identical), edit re-runs only on read fields, untick and
  delete revert, hand edits kept, two payments on one invoice, permissions and
  "allow anyway", undo block/keep, a 2-step chain payment → invoice → client.
  `tsc --noEmit` clean.
- Docs: admin `/docs/builder#linked-relationships` (new section, #linked-rule).
  Website: changelog entry 2026-10-11.

## 2026-10-11 — LU-02 every write path
- Engine: `linkedMany` (batch: prepare all → caller saves → apply in order,
  one rollback for the batch), `linkedForApi` + rule flag `fromApi` (D12),
  `seen` keyed by source so a batch's rows on one target all log. Undo now
  works out what to put back at write time from the fresh target and log
  (a bulk delete of two payments on one paid invoice used to leave it paid —
  each saw the other still holding it).
- Wired: `controllers/common/updateManyDocuments` (bulk edit; restores raw
  rows on failure), `controllers/common/duplicateDocument` (row-menu Copy),
  `library/controllers/bulk/bulkActions` (delete + undo, duplicate, status —
  status now loads whole records when rules exist), `importRows` (step 5:
  rows' rules checked in the dry run too, field "Linked records"; applied after
  every row is saved; all-or-nothing), `routes-public/public.router.ts`
  (create/update/delete; `hasApiRules` skips everything when no rule opts in).
- Not run: Archive (records stay), Merge (documented gap, D13).
- Bug met on the way: bulk edit copied each record with `structuredClone`,
  which turns ObjectIds into plain objects, so the rule saw no invoice — uses
  `hydrate({ ...b })` now.
- Checked: smoke now 64 checks, all pass — bulk edit tick (B1) and a refused
  row leaving the rest untouched (B2), bulk delete + undo (B3), Duplicate and
  Copy (B4), bulk status running the invoice's own rule (B5), import dry run /
  refused / good (B6), a tenant project (T1), another project's bill never
  reached from the panel or the public API (T2, T3), public API with and
  without `fromApi` (T3). `tsc --noEmit` clean; website `next build` passes.
- Docs: admin guide `#linked-where` (where rules run) + the `fromApi` row.
  Website changelog entry extended.

## 2026-10-11 — LU-03 the form's side
- Backend: `withLinkedHints` puts `requiredIf` (`[{ when, match, rule }]`) on
  fields a rule copies or requires, and `linkedReads` + `linkedRoute` on
  fields a rule reads — in `/get/schema` (getSchema takes
  `linkedRelationships`, `route`) and `/get/config` (form fields; both
  convertToFormFields branches pass them). `POST /<route>/linked/preview
  { id?, values }` → `{ changes, error }`, nothing written (`previewLinked`;
  read permission; a page without rules answers empty).
- Admin (+ mint-tenant, same files): `FormMain` marks a field required while
  any of its `requiredIf` holds (fieldLocks `meets`) and renders
  `LinkedPreview` — asks the preview 500 ms after a field a rule reads changes;
  one line per record ("Will also update Invoice A: Status → paid, Payment
  date → 20 Oct 2026 — Mark invoice paid", or "Will put back…"), or the
  refusal. `useCustomToast` adds "Also updated Invoice A (Status, …)" from a
  save's `linked`; post/update/delete/bulk-edit mutations also refresh the
  changed pages (`linkedRoutes`). New mutation `linkedPreview` (name checked
  unused). createFormFields/assertSchema know the three props.
- Decided: the hint uses the form's raw option values ("paid"), not labels —
  good enough for now.
- Checked: smoke 72 checks, all pass (F1 schema/config hints, F2 preview:
  would-change, writes nothing, needs the date, untick previews a put-back,
  no-rules page). In the browser (admin-5021 against the private server):
  ticking Mark as paid adds the asterisk and "Payment date is needed…";
  picking invoice A shows the hint; Create → toast "Also updated … A (Status,
  Payment date, Paid amount)"; two rules on one invoice show as one line.
  admin `tsc` clean.
- Docs: admin guide `#linked-form`. Website changelog item. mint-docs still
  waits for LU-04 (tenants can't make rules before the tab exists).
