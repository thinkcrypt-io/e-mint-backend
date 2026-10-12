# Linked Relationships — overview

**Start here.** This folder is the plan for **Linked Relationships**: rules that
let saving one record change other records. For example, saving a payment
marks its invoice paid. Read this file, then `WORK_ORDERS.md`.

Status: **in progress** — see `WORK_ORDERS.md` (Handoff) and `CHANGELOG.md`.
The user took every recommendation in §8 on 2026-10-11.

---

## 1. What we are building

**The user's words (2026-10-11):** "if a user fills up a form … it might link
to other records … when we are recording a payment and giving the invoice id,
we want the invoice to take some fields too … payment date in payment and
invoice too … a checkbox mark as paid, when checked the status of the invoice
referenced will be paid and the paymentDate … same date will be in
invoice/bill too. In rules/settings configuration we can link these models,
fields and conditions, so we can decide how hitting a post request should
affect other models and fields … an advanced relationship tab where these can
be configured."

A **linked relationship** is a rule on a route, written as a sentence:

> When a **Payment** is **created**, if **Mark as paid** is **ticked**,
> update the **Invoice** picked in **Invoice**:
> set **Status** to **Paid**, and set **Payment date** to this payment's
> **Payment date**.

Rules are kept in the route's config with draft/publish and versions, like
every other builder setting. They are edited on a new **Linked Relationships** tab in
the route builder.

## 2. What already exists (and what's missing)

| Need | Today | Gap |
|---|---|---|
| Pull a value **from** the linked record into this form (payment amount from the bill) | `schema.fillFrom` — `library/functions/linkedFill.function.ts` | — |
| Show a value worked out from linked records (client's due = sum of bills) | rollups — `library/functions/rollups.function.ts` (calculated when read, never stored) | — |
| Calculated fields on the same record | formulas — `formula.function.ts` | — |
| Hide fields on a condition | `formRules` — `formRules.function.ts` | It can only **hide** fields. It can't make a field **required** on a condition. |
| Status moves with allowed transitions | config `status` (bulk status) | Only works through the bulk action. |
| Something happens elsewhere when a record is saved | `recordHistory` → `fireWebhooks` (outgoing only) | **Writing to another record. This feature adds it.** |

So this feature adds the one missing direction: **this record changes the
linked record when it's saved.**

## 3. When to use a linked update and when to use a rollup

A linked update **stores** a value on another record. A stored value can drift
when the source changes later (the payment is edited, deleted, or a second
payment is added). The builder should steer people this way:

- **Use a linked update** for one-off events and stamps. Examples: mark the
  invoice paid, set its payment date, take stock off a product when an order
  is placed, set a room to Occupied on check-in, take days off the leave
  balance when leave is approved, set a client's last order date.
- **Use a rollup or formula** for totals and balances that must always be
  right: amount paid = sum of payments, balance = total − paid. A rollup is
  never stale.
- **Combine them** for the invoice case. Amount paid is a rollup. Status is
  set by the rule, or is a formula over the rollup. The Linked Relationships tab shows
  a tip when a rule sets a number with `+`: "This keeps a running total. A
  rollup can't drift. Use one instead?"

## 4. The rule

Stored at RouteConfig `data.linkedRelationships: Rule[]`. It sits with `formRules`,
`viewTabs` and `status`, and gets draft, publish, versions and code fallback
for free.

```ts
type Rule = {
  id: string;              // stable, used in history and the log
  name: string;            // "Mark invoice paid"
  enabled: boolean;
  on: ('create' | 'update' | 'delete')[];
  when?: Condition[];      // field-lock / view-tab conditions {field, op, value},
  match?: 'all' | 'any';   //   read on the record as it will be saved
  target: {
    via: string;           // a ref field on this record: 'invoice' (one or many)
    route?: string;        // default: the ref field's schema.model; checked at publish
    when?: Condition[];    // on the target: "only if invoice status ≠ cancelled";
                           //   a value { ref: 'this.amount' } compares with this record (D16)
    match?: 'all' | 'any';
  };
  set: Assignment[];       // what changes on the target
  block?: { message: string };   // instead of set: refuse the save (cross-record check)
  undo?: 'revert' | 'keep' | 'block';   // when the rule stops holding (see below)
  require?: string[];      // source fields that become required while `when` holds
  asSystem?: boolean;      // may change targets the person can't edit (see D4)
};

type Assignment =
  | { field: string; value: any }                 // set Status to "paid"
  | { field: string; from: string }               // copy this record's Payment date
  | { field: string; formula: string }            // over `this.*` and `target.*`
  | { field: string; inc: string | number; min?: number; message?: string }  // atomic $inc — stock, counters
  | { field: string; dec: string | number; min?: number; message?: string }  // take off — a balance (D15)
  | { field: string; clear: true };
```

**Moving a number between two records** (D15) — a transfer from one account
to another is two rules on the Transfer page:

```ts
{ id: 'take', target: { via: 'fromAccount' }, set: [{ field: 'balance', dec: 'amount', min: 0,
    message: 'Not enough money in the sending account.' }] },
{ id: 'give', target: { via: 'toAccount' },   set: [{ field: 'balance', inc: 'amount' }] },
```

`min` is a floor: a save that would take the field below it is refused (under
the Amount field when the amount is one of this record's fields). It's checked
when the save is prepared — on the difference, so editing 30 → 60 needs 30
more, not 60 — and again in the write itself (`updateOne({ balance: { $gte } })`),
so two transfers at once can't both spend the same balance. A floor belongs to
the field on that page: set once (on the take-off), it also holds for every
other rule on the page that changes the same field — so the receiver's add
can't be taken back below it either (deleting a transfer whose money was
spent). Borrowed floors use the plain message.

Ops: is, not, in, gt, gte, lt, lte, contains, empty, filled (`fieldLocks.function.ts`),
so the builder can reuse the shared ConditionsEditor.

**When a rule runs** (as built in LU-01):
- create: when `on` has create and `when` holds.
- update: only when a field the rule reads changed (`fieldsRead`: when fields,
  via, require, from, inc field, `this.*` in formulas). Then: picked records
  get the new values; a record it changed before that's no longer picked (or
  the rule no longer holds) is **taken back** per `undo`.
- delete: rules with `on: delete` run on the deleted record's picks; every
  other rule takes back what it did, per `undo`.
- many records at once (`linkedMany`): every record is prepared first, then
  saved, then applied in order; what to put back on an undo is worked out at
  write time from fresh records, so two rows of one batch on the same target
  stack correctly. One failure rolls back the batch.
- `undo`: `revert` (default) puts back fields that still hold what the rule set
  and takes an `inc` off; `keep` leaves them; `block` refuses the change.
  A field another record's same rule still holds is left (two payments
  marking one invoice paid). A target that's gone is just marked over.

Copies (`from`) make their source field **required while the rule applies**.
If "Mark as paid" is ticked, Payment date must be filled. If it isn't ticked,
Payment date stays optional. This covers the "invoice takes some fields too,
as mandatory" part of the request.

## 5. How a save runs

```
POST /payments
  protect → formulas → formRules → linkedFills
  → linkedRelationships.prepare      ← NEW, before validation
  → validate → permissions → create controller
  → linkedRelationships.apply        ← NEW, after save, before the response
```

**prepare** (nothing is written yet):
1. Pick the rules for this action whose `when` holds on the incoming record.
   For an update, this is the record as it will be.
2. Add their `require` and `from` fields to the required list. Missing →
   400 on that field.
3. Load each target (project scope `ownRecordsOf`, the access rule, and
   update permission on the target route unless `asSystem`). If a target is
   missing or forbidden → 400 "You can't change Invoice INV-0042".
4. Work out the new values. Run them through the target route's UPDATE
   validator, `formRules`, the edit allowlist and Mongoose validators.
   If they're invalid → 400 that names the target and the field, e.g.
   "Invoice INV-0042: Paid by is required when status is Paid".
5. A `block` rule whose condition holds → 400 with its message.

Almost every failure happens here, before anything is saved.

**apply** (all-or-nothing, by compensation — D10):
- Every write is journalled with the raw document it replaced. If a later
  write fails, the journal is put back newest-first and the controller puts
  the source back (create → removed, update → raw before, delete →
  re-inserted). Bulk import works the same way.
- Targets are saved with `doc.save()`, not `updateOne`, so their formulas,
  hooks and validators run. `inc` uses `$inc` and then recalculates formulas,
  which is safe under concurrent payments.
- Each target change writes a **History** entry: "Status: Unpaid → Paid
  (by rule *Mark invoice paid* from Payment PAY-0012)". It also fires the
  target's webhooks.
- A **LinkedChange** row `{rule, source, target, before, after, incs,
  revertedAt}` makes taking back possible. `after` holds every value the rule
  wants, changed or not, so stacked changes revert correctly.

**Chains and loops:** a target's own rules run too (invoice paid → client's
last-paid date), at most **3 hops deep**. A record is never changed twice by
the same rule in one request. Publish refuses a cycle of rules (A→B→A on the
same fields).

## 6. Where it applies

All write paths must run it, or a rule only works sometimes:
admin create, update, bulk edit (`updateMany`), bulk import (per row, inside
its all-or-nothing), duplicate (off by default), delete (`undo`),
the public API (WO-40 lists, customer writes), and tenant project routes.
Tenant rules can only target routes in the **same project**.

These controllers already all call `recordHistory`, which makes it easy to
find every place to wire in. There are duplicate controller trees, though
(see the memory note on duplicate backend trees). Trace each one from
`routes-admin/common/router.ts`.

## 7. The Linked Relationships tab

- **Route builder** gets a new tab, `?tab=relationships`, with two parts:
  - **This record changes…** — the rules, each shown as the sentence from §1
    and built from dropdowns. Dropdowns only list ref fields of this route,
    then editable fields of the target with matching kinds, then the
    condition picker shared with FormRulesPanel.
  - **Changed by…** (read-only) — rules on other routes that write to this
    route, e.g. "Payments can change: Status, Payment date." Without this,
    people editing an invoice won't know why it changed.
- **Test on a record:** pick an existing payment and see what would change.
  Nothing is saved (`POST /<route>/linked-relationships/preview`).
- **In the form:** when a rule applies, a line under the checkbox reads
  "Will also update Invoice INV-0042: Status → Paid, Payment date →
  11 Oct 2026". It uses the same preview endpoint.
- **Checks at publish:** fields exist; the ref field points to the target;
  kinds match; the target fields are editable and not secret, system,
  formula or rollup; no protected routes (`PROTECTED_ROUTES`); no cycles.
  Errors appear under the input (`on`), as elsewhere in the builder.
- Doc links on the tab and each dialog → `/docs/builder#linked-relationships`.
  The tenant guide is in mint-docs.

## 8. Decisions

| # | Decision | Status |
|---|---|---|
| D1 | Rules live in RouteConfig `linkedRelationships`, with draft/publish | **decided** |
| D2 | "Mark as paid" is a **stored** yes/no field on Payment, so the history shows the payment marked it. A form-only field (not saved) could come later | **decided 2026-10-11** |
| D3 | All-or-nothing: the payment isn't saved if the invoice can't be updated | **decided** |
| D4 | Permissions: acts as the person by default. A per-rule "Allow even if they can't edit Invoices" (`asSystem`), which only builder users can turn on | **decided 2026-10-11** |
| D5 | Deleting a payment that marked an invoice paid: revert / keep / block, chosen per rule. Default **revert**. A field someone changed by hand since then is left alone | **decided 2026-10-11** |
| D6 | The feature and its tab are called **Linked Relationships** | **decided 2026-10-11** |
| D7 | Chains are at most 3 hops; cycles are refused at publish | **decided** |
| D8 | Phase 1 targets only records **this record picks** (`via` a ref field). Reverse targets (an invoice cancelled → its payments void) and "create a record" (a payment adds a ledger line) come later | **decided** |
| D10 | All-or-nothing by compensation (journal + put back), not Mongo transactions: every write in the chain (history, webhooks, counters, hooks) would need the session, and local dev Mongo is standalone | **decided 2026-10-11** |
| D11 | Rule conditions use the field-lock/view-tab shape (`{field, op, value}` + `match`), not formRules', so the builder's shared ConditionsEditor fits | **decided 2026-10-11** |
| D12 | Public-API saves start only rules with `fromApi: true` ("Also for website and API saves"), which then run as the system; rules those changes trigger in turn run as usual. Off by default: a site could otherwise send any record's id | **decided 2026-10-11** |
| D13 | A copy (row-menu Copy, bulk Duplicate) is a new record and runs the rules; Archive and Merge run none (merge documented as a gap) | **decided 2026-10-11** |
| D14 | Rules aren't part of the new-model wizard, Build with AI or feature plans (the models must exist first, and the wizard's steps are forced); they're added after a build in the tab or over MCP `update_page`. `describe_platform` tells the AI to plan the trigger field and add the rule after | **decided 2026-10-11** |
| D15 | A field can be **taken off** (`dec`), and an add or take-off can have a **floor** (`min`, with its own `message`). The floor is checked on the difference at prepare time and again atomically in the `$inc`, so concurrent saves can't overdraw. This — not a target condition — is how "refuse a transfer bigger than the balance" is built: a condition sees the balance after earlier transfers, so it can't tell an edit's difference | **decided 2026-10-12** |
| D16 | A condition's value can be `{ ref: 'this.<field>' }` — compared with the record being saved ("Balance is less than this Transfer's Amount", "the To account is this Transfer's From account"). Works in `when` and `target.when`; the form's asterisk resolves it against the form | **decided 2026-10-12** |
| D17 | Supersedes D14 for the model wizard: the pages step ends with a Linked Relationships part (optional, last). Rules are checked once the new route is registered, before its copies are written; a bad rule removes the new model again. Build with AI and feature plans still leave them out | **decided 2026-10-12** |
| D18 | Rollback puts back only what a run touched — the fields it set, `$inc` reversed — not the whole document, so another save on the same record meanwhile keeps its change | **decided 2026-10-12** |
| D9 | Every step is logged in `CHANGELOG.md`, and the marketing site (mint-webpage) and the guides (admin /docs/builder, mint-docs) are updated as each WO lands, not at the end | **decided 2026-10-11 (user)** |
