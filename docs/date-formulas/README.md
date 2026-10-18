# Date formulas

The user (2026-10-18): "for formula we have the number calculation, we must also have a date calculation, for
example we have membership plan, where we set a duration in days or months, and when renewing today should add
the number of days after the next expiry date. so we need to be able to set date formulas." Then: "like formula,
we would need a new field called date formula". And, approving the plan: "also the formula, suppose i want the
fee to be the plan price, i can select that from model but when i am editing the rules i can not do that".

## What it is

1. **Date functions in the formula language** (backend `library/functions/formula.function.ts`, the panels'
   copy `components/library/functions/formula.ts`) — for formula fields and for Linked Relationships rules:

   | Function | Gives | Example |
   |---|---|---|
   | `today()` | this moment | `today()` |
   | `addDays(date, n)`, `addWeeks`, `addMonths`, `addYears` | a date | `addMonths(joinedAt, plan.months)` |
   | `add(date, n, unit)` | a date; unit is text — day(s), week(s), month(s), year(s) — or a field holding it | `add(startDate, plan.length, plan.unit)` |
   | `latest(a, b, …)`, `earliest(a, b, …)` | the latest / earliest date (empty ones left out) | `latest(target.expiresAt, today())` |
   | `daysBetween(a, b)` | a number: whole days from a to b | `daysBetween(today(), expiresAt)` |

   Dates can be compared in conditions: `if(expiresAt < today(), …, …)`. A month added to 31 January is the end
   of February (MongoDB's `$dateAdd` does the same). All in UTC.

2. **A new field: Date formula** (model kind `dateformula`). A date worked out by a formula: `dueDate =
   addDays(invoiceDate, 30)`, `expiresAt = addMonths(joinedAt, plan.months)`. Read-only, stored as a date, shown,
   sorted and filtered like a date. It reads the record's dates and numbers, and those of the records its links
   pick (`plan.months`, `member.expiresAt`).

   **When it's worked out** (`calc`): every save (the default, like a formula) — or **once**: worked out while it's
   empty (when the record is added, or a record from before the field) and kept after that. A formula with
   `today()` or a linked record's date usually wants once: a renewal's "Renewed until" must not move when the
   member's expiry changes later.

3. **Linked Relationships rules read through links** — the second request. A rule's "Copy from" and "Work out"
   can use the records this record's links pick: Renewal → set Member's Fee from **Plan › Price**
   (`plan.price`), or Work out `this.plan.price`. "Work out" is built by clicking, like the formula field (this
   record's fields, its links' fields, the linked record's fields, numbers, dates), instead of a bare text box. A
   date formula there sets a date field.

## Membership renewal, end to end

- **Plan**: Name, Price, Length (number), Unit (choice: days / months).
- **Member**: Name, Plan (link), Fee, Expires at (date).
- **Renewal**: Member (link), Plan (link), Fee (formula `plan.price`), Renewed until (date formula, once):
  `add(latest(member.expiresAt, today()), plan.length, plan.unit)`.
- Linked Relationship on Renewal, on create: target Member → set Expires at from Renewed until, Fee from Plan ›
  Price. Undo: revert — deleting the renewal puts the member's old date back.

A member expiring 30 Nov who renews on 19 Oct for a month gets 31 Dec; one who expired in September gets
19 Nov.

## Decisions (taken with the user's go-ahead, 2026-10-19)

- D1 One formula language; dates are numbers of milliseconds inside it, so every number rule (if, comparisons,
  min/max) works on them. A date field used where a number is wanted is refused with a hint (daysBetween).
- D2 `today()` is the moment of the save (or of the recalculation). No project time zone yet — UTC.
- D3 A separate model kind (`dateformula`) in the model builder; in a page's settings it is a formula with
  `schema.returns: 'date'` (data type `date`), so every place that treats formulas as worked-out-not-typed keeps
  doing so.
- D4 Once = "while empty": no "is new" tracking, works for records from before the field (publishing fills them).
- D5 Top-level fields only for now — not inside a section or a list's rows.
