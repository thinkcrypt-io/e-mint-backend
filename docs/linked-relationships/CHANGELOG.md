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

## 2026-10-11 — LU-04 the Linked Relationships tab
- Backend: `GET /builder/linked/incoming?route=` (linkedCheck.ts
  `getIncomingLinked`) — published rules on other pages that write to this one.
- Admin (+ mint-tenant, same files): area `linked` (green, Link2 icon, guide
  `linked-relationships`) between Filters and Fields & rules, with its
  overview card. `LinkedRelationshipsPanel` — "This page changes…" (each rule
  as its sentence, badges Off / Refuses / Website saves too / Allowed anyway,
  edit, delete through PromptDialog), "Changed by…", the rollup tip.
  `LinkedRuleDialog` (portalled Chakra Dialog, ModalFooter, placement top) —
  the sentence on top, name, when, if (ConditionsEditor), picker field (only
  fields with a linked page), only-if on the linked record, change rows (field
  of the linked page — editable, not formula/rollup — and Set to / Copy from /
  Add / Work out / Empty, value inputs that fit the field) or refuse with a
  message, when it stops holding, the three switches. `linkedRules.ts` holds
  the shape, sentence, problems and clean-up; RouteEditor holds a save back
  while a rule is incomplete (jumps to the tab). ModelWizard's guide map got
  the key (the wizard's own tab list doesn't show it — LU-06).
- Fixed on the way: "added and edited" → "added or edited"; conditions read
  with labels; no false "pick when it runs" on rules using the default.
- Checked in the browser (admin-5021): the tab lists the three rules as
  sentences; a new rule built only with the dialog (Invoice → Last payment
  note ← Note), saved, published (config v10) and then a payment saved through
  the API filled the invoice's note; editing the refusing rule loads its
  message and condition. Smoke: 74 checks, all pass (F3 incoming). admin +
  mint-tenant `tsc` clean; website and mint-docs `next build` pass.
- Docs: admin guide `#linked-tab` (making a rule; the "tab coming" note
  removed); mint-docs `/pages#linked-relationships` with `#linked-tab`,
  `#linked-rule`, `#linked-form`, `#linked-where` (the tenant panel's doc links
  land there) + guides.ts topic. Website: Forms feature + Backend feature
  "Linked Relationships", changelog entry rewritten for the tab.

## 2026-10-11 — LU-05 refusing rules
- Built with the engine (LU-01: `block` + `target.when`), on every write path
  (LU-02) and in the tab (LU-04: "Refuse the save" + message). Closed with
  smoke F4: the form's preview carries the refusal before saving. 75 checks.

## 2026-10-11 — LU-06 your AI (MCP)
- `update_page` takes `linkedRelationships` (array replaces the page's rules,
  false or [] removes them; full JSON schema in the tool) — published through
  `publishConfigPatch`, so configDraftSchema + linkedCheck refuse a rule that
  doesn't fit, with the problems in the tool's answer.
- `get_model` lists the rules ("Mark invoice paid → via invoice: status,
  paymentDate"; refusing ones marked) and returns them as
  `page.linkedRelationships`. `describe_platform` (platformGuide) says when
  to plan one: a stored yes/no trigger field on the picking model, the rule
  added with update_page after the build; totals stay rollups.
- Not done, on purpose (D14): the new-model wizard, Build with AI and feature
  plans — models must exist first; the wizard's steps are forced.
- Noticed: two rules setting the same field of one record — the later rule in
  the list wins. Left as is; worth a publish warning later.
- Checked: smoke 81 checks, all pass (M1 tools/list + describe_platform, M2
  get_model, M3 refused bad rule, a rule set over MCP runs, rules put back).
- Docs: admin guide (#linked-relationships "Your AI (MCP)", the MCP tool
  table), mint-docs connect-ai tool table, website changelog item.

## 2026-10-11 — LU-07 guides, site, smoke (closing)
- Guides and site were updated with every WO (D9), not at the end: admin
  /docs/builder#linked-relationships (+ #linked-tab #linked-rule #linked-form
  #linked-where), mint-docs /pages#linked-relationships (same anchors — the
  tenant panel's links land there) and connect-ai; website changelog entry,
  Forms and Backend feature cards. Checked every anchor the app links to
  exists on both sites.
- `scripts/linked-relationships/smoke.mjs`: 81 checks over LU-01…06; how to
  run it is in its header (private server + scratch mongod only).
- Nothing deployed. Test servers stopped; launch config `admin-5021` kept in
  e-mint/.claude/launch.json for the next visual check.

## 2026-10-12 — fix: the rule dialog scrolls inside
- Reported: a long rule pushed the dialog past the screen, the page scrolled
  behind it, and the lower rows and the Save button were out of reach.
- `LinkedRuleDialog.tsx` (admin + mint-tenant): `scrollBehavior='inside'`, so
  the body scrolls within the shared 90vh modal and the footer stays put —
  the same set-up as the widget and quick-add dialogs.

## 2026-10-12 — LU-08 in the model wizard, LU-09 transfers
- Asked: Linked Relationships didn't show in the new-model wizard; and a
  transfer between two accounts should take the amount from one and give it to
  the other, and fail when the amount is more than the sending balance.
- LU-08 (D17): `ModelWizard.tsx` pages step ends with a Linked Relationships
  part (overview card, `linkedProblems` hold Next, the panel without
  "Changed by…" — `showIncoming={false}`). `models.controller.ts`
  `createModelCore` runs `checkLinkedRelationships` once the route is
  registered and removes the model again on a problem.
- LU-09 (D15, D16, D18), `linkedRelationships.function.ts`:
  - `dec` (Take off), and `min` + `message` on inc/dec. The floor is checked
    on the difference in prepare (refusal under the source field, e.g. Amount)
    and again in the write: `updateOne({ _id, balance: { $gte: min - d } })`.
    Taking an add back respects its floor too.
  - The fields an add/take-off reads are required while the rule holds.
  - Conditions with `{ ref: 'this.<field>' }` (`fieldLocks` `meets(…, ctx)` in
    backend and admin; `refsIn` → `fieldsRead`).
  - Rollback is field-level (`set` back / `$inc` reversed) instead of
    replacing the target document — found by the concurrency check: the
    refused transfer's rollback wiped the other transfer's take-off.
- `linkedCheck.ts`: take-off on a non-number, `min` on a plain set, and refs to
  fields this page lacks are refused at publish. Joi: `dec`, `min`, `message`.
- Builder: `linkedRules.ts` (Take off, floor in the sentence, refs read as
  "this Transfer's Amount"), `LinkedRuleDialog.tsx` (Never below + message
  line), `ConditionsEditor.tsx` (`compareWith`: "a value" / "this Transfer's…").
  FormMain resolves refs for the asterisk. All copied to mint-tenant.
- MCP `update_page` describes `dec`/`min`/`message`/refs with the transfer
  example; `platformGuide` says how to plan a transfer.
- Checked: smoke 102/102 (new: W1–W2, X1–X8 incl. two transfers at once,
  C1–C3); in the browser (admin-5021) a Transfers model built in the wizard
  with both rules, the dialog scrolling inside, compare-with offered; then 20
  moved Wallet 50→30 / Savings 0→20 and 100 refused with the rule's message
  under Amount. admin + mint-tenant tsc clean.

## 2026-10-12 — form hint no longer shows blanks as errors
- The form's preview showed "Transfer Amount is needed for “…”" in red before
  anything was submitted. `prepareLinked` now keeps blank-but-needed fields
  apart (`needed`) and returns `previewError` (without them) and `missing`
  (their labels); the save's `error` is unchanged and still refuses with the
  message under the field. `POST /<route>/linked/preview` answers
  `{ changes, error: previewError, missing }`.
- `LinkedPreview.tsx` (admin + mint-tenant): only real problems in red;
  missing fields as a muted "Fill in Amount to see what saving will also
  change." (or "…to see the rest." under the changes).
- Checked: smoke all passed (F2 now: preview asks for the date with no error;
  saving without it still 400 under `paymentDate`). admin + mint-tenant tsc clean.
- Follow-up (user): no message at all before the form is filled. `FormMain`
  passes `ready` (every shown required field filled, `requiredIf` included);
  `LinkedPreview` neither asks nor shows anything until then, and the muted
  "Fill in …" lines are gone. Works against the old backend too.
