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
