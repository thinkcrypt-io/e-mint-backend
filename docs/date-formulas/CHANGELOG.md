# Date formulas — changelog

Newest last.

## 2026-10-19 — Plan
- README (functions, the field, renewal example, D1–D5) and WORK_ORDERS DF-01…05, after the user's go-ahead.

## 2026-10-19 — DF-01, DF-02, DF-04 (backend)
- Engine (`library/functions/formula.function.ts`, copied to the panels' `functions/formula.ts`): today(),
  addDays / addWeeks / addMonths / addYears, add(date, n, unit), latest, earliest, daysBetween; names any case
  (`adddays` → addDays). Dates are milliseconds inside; `dv()` keeps an empty date empty. Months in UTC with the
  month's last day kept (31 Jan + 1 → 28 Feb), as `$dateAdd`. Comparisons read stored dates and ISO text as times
  (JS `comparable`, Mongo `comparableMongo` on field refs). `checkFormula(…, returns)` types every part: a date
  where a date is wanted, a number where a number is, add()'s unit text or a field; "This works out a date — use
  a Date formula field". `evaluateDate`, `evaluateValue` (a rule's result), `toMongoDate`.
- Found on the way (older than this work): `isNumeric` in MongoDB put a literal number through `$trim`, which
  aggregate's optimizer refuses (`if(qty > 2, …)` in `$project`); now through `$toString`. Update pipelines
  were never affected.
- Field kind `dateformula` (dynamicModels): Mongoose `Date` default null; settings `type: 'date'`, `edit: false`,
  `schema.type: 'formula'`, `schema.returns: 'date'`, `schema.calc: 'once'`, table/view `date`, sortable, a date
  filter. `calc` on the model definition (Joi + Mongoose); FORMULA_KINDS / DATE_KINDS; never written by the
  public API, automations, MCP, templates, kit. Link targets list dates (`date`) and short texts / choices
  (`text`) beside numbers — `plan.unit` for add(), `member.expiresAt`. Page-builder formulas (validate.ts):
  `returns: 'date'` needs a Date path.
- `formulasOf` marks `date` / `once`; `applyFormulas` skips a once formula that holds a value; the publish
  pipeline wraps it in `$ifNull` — older records get theirs when the field is published, then keep it.
- Linked Relationships: `throughLinks` reads what a rule needs through this record's links (Copy from
  `plan.price`, Work out `this.plan.price`), once per link picked per run (`run.linkedCache`); a field needed
  through a link asks for the link; picking another plan re-runs the rule; Work out returns a Date for a date
  formula. linkedCheck checks `plan.price` on the linked model.
- AI / MCP field descriptions know `dateformula` and `calc`.
- Verified on the private backend (:5071, Mongo :27961): engine script (JS = MongoDB for 10 formulas × 4 records,
  month ends, leap years, empty dates, once), new `scripts/tenancy-smoke/date-formulas.mjs` 32/32,
  `formula-links.mjs` 25/25 (its "text field not listed" check now reads "listed as text"), `projects.mjs`,
  Linked Relationships smoke all passed. `tsc` clean.

