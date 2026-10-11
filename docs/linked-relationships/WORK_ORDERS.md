# Linked Relationships — work orders

Read `README.md` first. Each item has: **why → files → change → done when**.
Sizes: **S** ≤ 1h, **M** ≤ half a day, **L** ≤ 2 days.
Commit and push each WO when it's done.

## Handoff (last updated 2026-10-11)

Decisions D1–D11 taken (README §8). **LU-01, LU-02 done**: every write path
(single, copy, bulk edit/status/delete/undo/duplicate, import, public API with
`fromApi`, tenant projects). **LU-03 done**: forms show the asterisk while a rule needs a field,
a "Will also update…" hint (POST /<route>/linked/preview) and the changes in
the save toast; shared files copied to mint-tenant. **LU-04 done**: the green
Linked Relationships tab in the page builder (admin + mint-tenant), guides in
admin /docs/builder and mint-docs /pages, website features + changelog.
Next: LU-05 (block rules are already in — needs only its own smoke/WO close),
then LU-06 (wizard, AI, MCP).
Pushed: LU-01 backend `49fbf667`, admin `043ac50`, website `0ccb9df`;
LU-02 backend `ea0251f2`, admin `06da5a8`, website `d5e4fa7`.
LU-03 admin `c70813c`, mint-tenant `da7f73c`, backend `0bae3107`, website `e278143`.
Visual check: launch config `admin-5021` (:3022 → private backend :5021).
Smoke: `scripts/linked-relationships/smoke.mjs` (how to run it is in its header;
never against a shared DB). Tenant guide (mint-docs) waits for LU-03/04 — there
is nothing a tenant can switch on before the tab exists. After each WO: CHANGELOG
entry, guides (admin `/docs/builder#linked-relationships`, mint-docs), marketing
site (mint-webpage `src/content/*`), then commit + push each repo touched
(backend → `mint` v3, admin/mint-tenant/mint-docs/mint-webpage → `origin` main).

| WO | Title | Size | Status |
|---|---|---|---|
| LU-01 | Engine: rule shape, prepare/apply, create + update + delete on admin routes | L | **done 2026-10-11** |
| LU-02 | Every write path: bulk edit, import, bulk delete/undo, public API, tenant | M | **done 2026-10-11** |
| LU-03 | "Required when" + preview endpoint + form hint | M | **done 2026-10-11** |
| LU-04 | Builder Linked Relationships tab (sentence editor, Changed by…) | L | **done 2026-10-11** |
| LU-05 | Block rules (cross-record checks) | S | todo |
| LU-06 | Model wizard, Build with AI, MCP (`update_page`, plan/build_feature, describe_platform) | M | todo |
| LU-07 | Guides (/docs/builder#linked-relationships, mint-docs), marketing site, smoke script | M | todo |

---

### LU-01 — Engine (L)
**Why:** the core. Everything else is UI over it.
**Files:** new `library/functions/linkedRelationships.function.ts`
(`rulesOf`, `checkRules`, `prepare`, `apply`, `preview`);
new `library/models/linked-change`; `routes-admin/common/router.ts`
(`linkedRelationships` middleware after `linkedFills`); the create/update controllers
it actually uses (`admin-controllers/common/createDocument.controller.ts`,
`controllers/common/updateDocument.controller.ts`); `validate.ts`
(publish checks); `recordHistory` (a "by rule" note).
**Change:** README §4–5. Use a transaction when `client.topology` is a
replica set, otherwise compensation. Use `doc.save()` for targets, and `$inc`
then recalculate formulas for `inc`. 3-hop limit, and one change per
rule+record per request.
**Done when:** a smoke script makes Invoice + Payment routes, publishes
the "Mark invoice paid" rule, and proves: (1) a payment ticked → invoice
paid, with the same date, and history says "by rule"; (2) ticked without a
date → 400 on `paymentDate`, nothing saved; (3) an invoice validator failure
→ 400 naming the invoice, and the payment is not saved; (4) unticked → the
invoice is untouched; (5) the same run on a standalone mongod (no
transactions) leaves no half-writes.

### LU-02 — Every write path (M)
**Why:** a rule that only fires from the form can't be trusted.
**Files:** `controllers/common/updateManyDocuments.controller.ts`,
`library/controllers/bulk/importRows.controller.ts` + `bulkActions.controller.ts`,
`controllers/common/deleteDocument.controller.ts`, the public API write path,
tenant routes (`dynamicModels.function.ts`).
**Change:** run prepare/apply in each. Delete reads LinkedChange for
`onDelete` (revert only fields still holding the value the rule set; a value
someone has edited since is kept and reported). Bulk delete/merge undo
(DeletedRecord) also re-applies.
**Done when:** the smoke script covers bulk edit, a 3-row import with one bad
invoice (whole file refused), payment delete → invoice back to Unpaid, a
public-API payment, and a tenant project (it can't target another project).

### LU-03 — Required when + preview (M)
**Files:** `formRules.function.ts` (both copies: backend + admin
`functions/formRules.ts`), `get/config` emitting `requiredIf`, admin
FormMain/CreateModal, new `POST /<route>/linked-relationships/preview`.
**Change:** a rule's `require`/`from` fields show as required while its
condition holds. Under the trigger field, a hint lists what will change
(debounced preview).
**Done when:** ticking "Mark as paid" puts the asterisk on Payment date and
shows "Will also update Invoice INV-0042: Status → Paid …". Verified in the
browser pane via /docs/inputs (auth note).

### LU-04 — Linked Relationships tab (L)
**Files:** admin RouteEditor (new tab), `LinkedRelationshipsPanel.tsx`,
`LinkedRuleDialog.tsx` (PromptDialog/ModalFooter, Chakra dialogs, the cl
`Dropdown`), shared condition picker from FormRulesPanel, backend
`GET /builder/linked-relationships/incoming/:route` for "Changed by…".
**Done when:** the invoice rule can be built, tested on a record, and
published without typing JSON. A publish error lands under the right input.
The invoice route shows "Changed by Payments". Each panel has its doc link.

### LU-05 — Block rules (S)
"Don't allow a payment on a cancelled invoice." A `block` rule plus
`target.when`. The message is shown on the form.

### LU-06 — Wizard, AI, MCP (M)
Model wizard step (only when the model has ref fields), the AI builder's
`build_model` tool, MCP `update_page { linkedRelationships }`, `plan_feature` /
`build_feature` accept rules, `describe_platform` explains them. Check RTK
endpoint names are unused before adding.

### LU-07 — Guides and site (M)
`/docs/builder#linked-relationships` (+ anchors per dialog), a mint-docs tenant
guide, and a feature section on mint-website. Add the smoke script to
`scripts/`.

## Later (not planned yet)
Reverse targets (records that pick this one), a "create a record" action
(payment → ledger line), "send email" action through messaging, scheduled
rules ("if unpaid 30 days after due → Overdue"), a two-way field sync
convenience (two rules + loop guard).
