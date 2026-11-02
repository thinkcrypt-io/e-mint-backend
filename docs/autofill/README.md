# Autofill

The user (2026-11-02): "Plan 2 more types, autofill (readonly), autofill, on form/settings. So what it will do is
for example let's say there is a phone number and email field, so when another field like customer is selected
they will autofill those 2. in autofill readonly they inputs can't be edited but editable autofill, for example
the phone number is taken then it can be updated later. So results would be dependant on another field, like a
formula but taken from other elements in form."

Then, after AF-01…08 were built as two types: "autofill should not be a type, it should be in advanced settings in
a field, if autofill-editable then the field remains as it is, conditions are to be set for autofill, and if a
switch if it is to be readonly … we do not need autofill type or autofill readonly type."

## What it is (rework, AF-09…15)

**Autofill is a setting on any field, not a type.** A Phone field stays a Phone field, a Number stays a Number.
In the field's **Advanced** settings (page builder and model builder) it gets an **Autofill** block:

| Setting | Stored in `schema.fillFrom` | What it does |
|---|---|---|
| Autofill on/off | present or not | Off: a normal field. On: filled from a linked record picked on the same form |
| From | `from` | The link field on this form — Customer |
| Take | `formula` | One of the picked record's fields (`phone`) or a formula over its numbers (`total - paid`) |
| When | `when` + `match` | Conditions: autofill only while they hold (see D12). None = always |
| Read-only | `readonly: true` | Off (default): the field stays as it is — filled on pick, typed over freely. On: locked, the server sets it and keeps it in step with the source |

**Order** — Customer (link), Phone (text; Autofill from Customer › Phone), Email (email; Autofill from Customer ›
Email, read-only), Delivery phone (text; Autofill from Customer › Phone **when** Delivery = Home). Picking "Rahim"
fills them. Phone can be changed for this order; Email can't, and follows Rahim's email when it changes.

## What stays from AF-01…08 (built 2026-11-02)

The behaviour is kept; only where it's set and how it's stored change.

- D1 One engine — `schema.fillFrom`, `linkedFill.function.ts` (backend), `linkedFill.ts` + `LinkedFiller.tsx` (panels).
- D4/D5 Read-only: set from the picked record on every save (sent values dropped), cleared with the link, left as it
  was when the person can't read the record; follows the source record's later changes (`followReadonly` from
  `recalculateDependents`), also bulk edit / import / server-key public API.
- D6 Editable: filled when empty on create, filled on update when the link changes and the field wasn't sent; picking a
  different record replaces a typed value; never follows the source afterwards.
- D7 One hop. D8 List rows too (`dataModel[].fillFrom`). D9 sensitive fields are never a source.

## Decisions for the rework (proposed)

- D10 **No autofill types.** `autofill` / `autofillreadonly` leave FIELD_KINDS, `inputTypes.ts`, settings
  `schema.type`, KindIcon, MCP enums, the AI builder schema. `schema.fills` goes too — the field's own kind says what
  it holds. Every place that today names `autofillreadonly` (≈15 backend files: public-API writable fields,
  automations, MCP, templates, rules' set fields, builder checks) asks one helper instead:
  `isLockedFill(settingsField)` = `fillFrom.readonly === true`.
- D11 **Which fields can autofill:** text-like (text, textarea, email, phone, url), number, date, boolean, choice
  (select / tags — copied when the value is one of the field's options, else left), and a link to the same model
  as the source's link. Not formula, date formula, rollup, password, file/image, section, editor. The builder checks
  the source fits the field: a number from a number / formula, a date from a date / date formula, text from
  anything that reads as text. Mismatch → refused with a hint (replaces D3's `fills`).
- D12 **Conditions (`when`).** Same ops and editor as "Locked when" / tab "Show only" (`ConditionsEditor`, match
  all / any). A condition can test **this record's fields** (Delivery is Home) or **the picked record's**
  (Customer › Type is Wholesale). While they hold, autofill works as above. When they don't hold:
  - editable — nothing is filled; the field is a plain field (keeps whatever it has);
  - read-only — the field is **cleared and stays locked** (the user, 2026-11-02: "clear and lock"): nobody can type
    in it; when the conditions hold again it's filled from the picked record. The server clears it on save and in
    `followReadonly`; the form clears it live.
  The server checks `when` on every save and in `followReadonly` (the record as saved, the source as it is now);
  the form checks it live as values change.
- D13 **Read-only switch** turns Required and "Can be changed" off and greys them (the server fills it), as the
  read-only type did. Turning Autofill off drops `readonly` and `when` with it.
- D14 **Migration.** Fields saved as the old kinds become their `fills` kind + `fillFrom` (+ `readonly: true` for
  `autofillreadonly`): ModelDefinition docs, the route builder's draft and published settings copies, row fields
  (`dataModel`), templates / blueprints. Records need nothing — the stored values don't change. The backend with the
  types was never deployed, so prod should have none; the script runs dry-run on prod to prove it.
- D15 The old "Filled in from a linked record" group above Advanced is the same thing — it moves into Advanced as
  the Autofill block. One place to set it.

## Answered (the user, 2026-11-02)

1. A read-only autofill whose conditions don't hold is cleared and stays locked (D12).
2. Conditions can test both this record's fields and the picked record's (Customer › Type is Wholesale) (D12).
