# Autofill fields

The user (2026-11-02): "Plan 2 more types, autofill (readonly), autofill, on form/settings. So what it will do is
for example let's say there is a phone number and email field, so when another field like customer is selected
they will autofill those 2. in autofill readonly they inputs can't be edited but editable autofill, for example
the phone number is taken then it can be updated later. So results would be dependant on another field, like a
formula but taken from other elements in form."

## What it is

Two new field types, in the model builder, the page builder (settings) and the form:

| Type | Settings `schema.type` | In the form | On save (server) |
|---|---|---|---|
| **Autofill** | `autofill` | Filled the moment the link is picked; can be typed over | Filled from the link when left empty; a typed value is kept |
| **Autofill (read-only)** | `autofillreadonly` | Filled when the link is picked; shown locked ("from Customer") | Always set from the link — whatever the form sends is ignored |

Each one names **a link field on the same form** (`from`) and **what to take from the picked record** (`formula`):
one of its fields (`phone`), or a formula over its numbers (`total - paid`), exactly like today's `fillFrom`.

**Order** — Customer (link), Phone (Autofill ← Customer › Phone), Email (Autofill (read-only) ← Customer › Email).
Picking "Rahim" fills both. The phone can be changed for this order (a different number for delivery); the email
cannot. Picking another customer fills both again from that customer.

## Already there (what this builds on)

`schema.fillFrom = { from, formula }` — "Filled in from a linked record", a switch on any field in the page
builder (`builder/_components/FillFromEditor.tsx`):

- panels: `create-page/page/form-components/LinkedFiller.tsx` + `functions/linkedFill.ts` fill on pick, editable;
- backend: `library/functions/linkedFill.function.ts` `fillLinked()` fills empty fields on create, only from a
  record the person may read (`linkedFills` in `routes-admin/common/router.ts`);
- model definitions store it (`modelDefinition.model.ts`, `models.controller.ts` Joi, `dynamicModels.function.ts`)
  but the model builder has no UI for it, MCP doesn't know it, and nothing makes a filled field read-only.

So **Autofill is today's fillFrom made a visible type**, and **Autofill (read-only)** is new: the server owns it.

## Decisions (built 2026-11-02 as written, except where noted)

- D1 **One engine.** Both types use `fillFrom` and the existing fill code (backend + both panels' copies). A field
  that already has the fillFrom switch reads as an Autofill field; nothing to migrate.
- D2 **Two types, not a switch.** They sit in the type lists beside Formula (number) / Formula (date), group
  "Values". *Built differently:* `isFormulaType` is left alone (it also finds the formulas to calculate, so
  `autofillreadonly` must not answer yes); the places that mean "worked out, not typed" name `autofillreadonly`
  next to it instead (public-API writable fields, automations, MCP, templates, rules' set fields, builder checks).
- D3 **The value keeps the source field's kind.** An autofill of Customer › Phone stores, shows, sorts and filters
  as text; of Bill › Total as a number; of Plan › Starts as a date. Worked out from the source field when the
  model/page is saved and stored as `schema.fills` (`text` | `number` | `date` | `boolean` | `select` …); a formula
  over numbers is a number. If the source field changes kind, the builder warns.
- D4 **Read-only on the server.** On create and on every update, `autofillreadonly` fields are set from the
  picked record (body values dropped); link cleared → field cleared; a link the person can't read → left as it was.
  Not required in the validator (the client never sends it).
- D5 **Read-only follows the source record** (the user, 2026-11-02: "readonly means it only changes when it's
  related value changes, the input can not be manually edited"). When the customer's email changes, every order
  that copies it updates too — always, no option. Reuses DF-02's linked-record recalculation (AF-06).
- D6 **Editable is a copy you own** (the user: "we get phone from customer, later we can manually edit the field
  to give a new phone"). It doesn't follow later changes to the customer. Create: filled when empty (as today).
  Update: filled when the link **changes** in this save and the field wasn't sent. Picking a different customer
  replaces a typed value (the user: "yes should be replaced"); nothing else overwrites it.
- D7 **One hop.** `customer.phone`, not `customer.company.phone`. A field of the picked record only — no fields
  of the record being edited inside the formula (that's what Formula is for).
- D8 **List rows too** (the user: yes). An invoice item's Product picked → its Rate, Unit fill, per row, both
  types (AF-07).
- D9 Sensitive fields can't be a source (same filter as FillFromEditor: password, token, secret, key …), and the
  `password` kind is never offered.

## Answered (the user, 2026-11-02)

1. Read-only follows the source record's later changes (D5); editable doesn't, and can be typed over (D6).
2. Autofill inside list rows: yes (D8, AF-07).
3. Picking a different customer replaces a typed value (D6).
