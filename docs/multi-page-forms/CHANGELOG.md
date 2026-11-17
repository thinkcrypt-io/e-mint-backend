# Multi-page forms — change log

## 2026-11-17 — MF-01 stored shape
- `configDraftSchema`: `formSteps { enabled, review, steps[{ key, title, description }] }` (≤ 12, unique keys, titles
  required, nothing else) and `form[].step` (a key) / `form[].side`.
- `GET /<route>/get/config` adds `formSteps` (`formStepsOf`: only when on, with steps, and the add button opens a page —
  `route.button.path`), and `convertToFormFields` tags every field with its section's `step` / `side`.
- Smoke `scripts/tenancy-smoke/form-steps.mjs`: checks, served shape, pop-up / off / empty cases, a record still saved in
  one call — all pass on a private scratch server.

## 2026-11-17 — planned
- The user asked for multi-page (stepped) create / edit forms, set up in the tenant panel and used by the tenant and
  commerce panels, in the look of a product-create wizard. Plan (README) and MF-01…07 written.
