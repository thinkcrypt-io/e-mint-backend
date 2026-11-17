# Multi-page forms — change log

## 2026-11-17 — MF-08b section conditions kept
- Stores lost the blueprint's section `showIf` (coupon Percentage / Amount off by type, product Variations): the
  builder's `applyLayout` (ai.controller.ts) copied a section's title, description and fields only. It now keeps a
  valid `showIf`, so new stores have them.
- `upgradeStore`: a `sectionRules` step puts each blueprint section's `showIf` back on the store's section of the same
  title that has none (when the rule's field is still there). Checked on a private server: old and new stores'
  `/get/config` give percentOff / maxDiscount / amountOff and options their `renderIf`.

## 2026-11-17 — MF-08 every store's product form in pages
- Products: Basic information (with pricing) → Images → Inventory & variations → (Specifications) → SEO & others →
  Review & finalize — for new stores (installer) and built ones (`upgradeStores.js`); both panels.
- `formSteps.reviewOn`: the Review summary on top of a page (the last one, with the status and Save) — builder
  picker, MCP, `/get/config`. Pages hidden by their sections' conditions are skipped. Long steppers fit.
- Docs: store guide "Adding a product" (`#store-product-form`), Pages guide Review options.

## 2026-11-17 — MF-07 docs (mint-docs 84b6eef)
- Pages guide → Form → "Form in pages" (`#form-steps`): pages, sections on pages, side column, Review, what Next /
  Back / Save do, phone layout, the edit page, commerce panel and MCP.

## 2026-11-17 — MF-06 MCP (backend d21a13e1)
- `update_page`: `formSteps` (or `false`) and sections' `step` / `side`; sections keep their page by title when only
  `form` is sent; sections on unknown pages are refused; turning pages on makes the add form open as a page.
- `get_model`: `page.form`, `page.formSteps` and a "Form pages" summary. Describe text mentions it. Smoke `--mcp` 24/24.

## 2026-11-17 — MF-05 commerce panel (mint-commerce 8ce847b)
- The stepped add page and the edit page in the commerce panel; checked on a store login.

## 2026-11-17 — MF-04 edit page (mint-tenant 6fcc30e)
- `/<project>/<route>/edit/<id>`: stepped (opens on page 1, any page clickable) or the plain form; Save only with
  changes, sends only the changes, goes back to the record (`?from=view`) or the table. With pages on, every Edit
  (row menu, record page, quick view) opens it instead of the dialog.

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
