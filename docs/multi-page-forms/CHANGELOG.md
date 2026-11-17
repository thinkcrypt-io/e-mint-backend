# Multi-page forms — change log

## 2026-11-17 — MF-03 the add page in steps (mint-tenant a1d440b)
- Stepper card across the top (numbered circles, current in the accent colour, passed ones ticked; "Step n of N ·
  Title" and a bar on a phone), the page's title and description, its sections with the side column on the right.
- Next checks the page's shown, required, empty fields (conditions worked out over the whole form) and names them in the
  sticky footer; Back keeps everything; earlier pages can be clicked; optional Review page with Edit links; Save on the
  last page re-checks every page and posts once.

## 2026-11-17 — MF-02 Form in pages panel (mint-tenant f584e13)
- Page builder → Form: switch, Review switch, page cards (title, description, drag / up / down / delete), each section's
  Page and Side column, "Add a section here", warnings for sections on no page and empty pages. Needs the add form to
  open as its own page — a button switches it. Save refuses incomplete pages.

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
