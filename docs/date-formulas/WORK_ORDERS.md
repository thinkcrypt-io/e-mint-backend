# Date formulas — work orders

Read `README.md` first. Commit and push each WO when it's done.

| WO | What | Where | Size | Status |
|---|---|---|---|---|
| DF-01 | Date functions in the formula engine: today, addDays/Weeks/Months/Years, add(date, n, unit), latest, earliest, daysBetween; dates in comparisons; checking with date fields; MongoDB compile ($dateAdd, $$NOW) | backend + panels' formula.ts | M | done 2026-10-19 |
| DF-02 | Date formula field: model kind `dateformula`, settings (`returns: 'date'`, `calc: 'once'`), calculated on save / once / on publish / when a linked record changes; builder checks | backend | M | done 2026-10-19 |
| DF-03 | Panels: the kind in the model builder and page builder (date functions in the click-to-build editor, once option), live value in forms, shown as a date | mint-tenant + admin | M | — |
| DF-04 | Linked Relationships rules read through links (`this.plan.price`, Copy from Plan › Price); Work out built by clicking; date results | backend + panels | M | backend done 2026-10-19; panels — |
| DF-05 | Membership renewal checked end to end; guides (mint-docs), website, MCP wording | all | S | — |
