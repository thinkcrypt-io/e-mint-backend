# Multi-page forms — work orders

Read `README.md` first. Commit and push each WO when it's done, staging only its own files: backend `v3` → `mint`,
mint-tenant `main`, mint-commerce `main`, mint-docs `main`. Update Status, Handoff and `CHANGELOG.md` after each.

## Status

| WO | What | Where | Size | Status |
|---|---|---|---|---|
| MF-01 | Stored shape: `formSteps { enabled, review, steps[{key,title,description}] }` + `form[].step` / `form[].side` in `configDraftSchema`; `/get/config` returns `formSteps` (only when on with ≥ 1 step) and each form field carries `step` / `side`; smoke script | backend (`validate.ts`, `getConfig.controller.ts`, `convertToFormFields.ts`, `scripts/tenancy-smoke/form-steps.mjs`) | S | done 2026-11-17 |
| MF-02 | Page builder → Form → "Form in pages": switch (needs Opens = its own page, with a button to switch), pages add / rename / describe / reorder / delete, sections per page (Page dropdown, Side column switch, Add a section here), Review switch, unplaced / empty warnings, `#form-steps` doc link | mint-tenant `app/builder/_components` (`FormStepsPanel.tsx`, `RouteEditor.tsx`) | M | done 2026-11-17 (f584e13) |
| MF-03 | Stepper on the add page: stepper card, step heading, sections + side column, Next checks the step's required fields, Back, click earlier steps, Review summary with Edit links, Save once on the last step, phone "Step n of N · Title" | mint-tenant `components/library` (`create-page/steps/*`, `FormMain.tsx`, `pages/CreateRecordPage.tsx`) | M | done 2026-11-17 (a1d440b) |
| MF-04 | Edit page `/<project>/<route>/edit/<id>` (stepped or not; opens at step 1, any step clickable, sends only changes); with steps on, row menu Edit in modal / Edit page and the record page's / quick view's Edit go there | mint-tenant (`app/t/[slug]/edit/[id]`, `pages/EditRecordPage.tsx`, `panel.ts` `editPath`, `TableMenu.tsx`, `useRecordView.ts`, `RecordView.tsx`, `RecordDrawer.tsx`) | M | done 2026-11-17 (6fcc30e) |
| MF-05 | Commerce panel: the same files into mint-commerce, checked in the browser on a store model | mint-commerce | S | done 2026-11-17 (8ce847b) |
| MF-06 | MCP: `update_page` takes `formSteps` (or false) and sections' `step` / `side` (kept when only `form` is sent); `get_model` shows the form's sections and steps; describe text | backend `library/controllers/mcp/mcp.router.ts` | S | planned |
| MF-07 | Docs: mint-docs Pages guide "Form in pages" (`#form-steps`), this folder's Handoff | mint-docs `src/app/pages/page.tsx` | S | done 2026-11-17 (mint-docs 84b6eef) |
| MF-08 | Every store's Products form in 5 pages: Basic information (with pricing) → Images → Inventory & variations → (Specifications) → SEO & others → Review & finalize (summary, then status + collections, then Save). New `formSteps.reviewOn` (the summary at the top of a page). Pages whose sections are all hidden are skipped (Variations on a simple product). New stores via the installer, built ones via `upgradeStores.js` | backend (`commerce/productPages.ts`, `install.ts`, `upgrade.ts`, `validate.ts`, `formSteps.function.ts`, `mcp.router.ts`), mint-tenant + mint-commerce (`steps/*`, `FormStepsPanel.tsx`), mint-docs (store + pages guides) | M | done 2026-11-17 (backend a6bf6742, mint-tenant b325b05, mint-commerce 6e3700b, mint-docs df1872b) — deployed + `upgradeStores.js --apply` on prod 2026-11-17 (Verte, HINT, GBazaar, Fabrilife, Think Tech) |

## Handoff

- MF-01 done: `formSteps` + `form[].step` / `side` are accepted by the builder and served by `/get/config`
  (`library/functions/formSteps.function.ts` `formStepsOf`). Smoke: `SMOKE_ROOT=… SMOKE_MONGO=… node
  scripts/tenancy-smoke/form-steps.mjs` (18 checks; `--mcp` adds MF-06's).
- MF-02 done (mint-tenant f584e13): Pages → a model → Form → "Form in pages" (`FormStepsPanel.tsx`). Checked in
  headless Chrome on a private server: add a page, rename, put a section on it with the Page dropdown, delete it (its
  sections move to the page before), Save draft stores `formSteps` and each section's `step` / `side`.
- MF-03 done (mint-tenant a1d440b): `create-page/steps/` (`SteppedForm`, `Stepper`, `ReviewStep`, `formSteps.ts`);
  `CreateRecordPage` uses it when `/get/config` has `formSteps`. Checked: Next stops on an empty required field (said
  in the footer, not a toast — a toast sat on the Next button), values kept on Back, earlier steps clickable, Review
  with Edit links, one POST, back to the list; phone shows "Step 2 of 4 · Pricing" with a bar.
  Two traps fixed on the way: Next and Save need their own `key` (else React turns the clicked Next into the submit
  button mid-click and the form saves a page early), and FormMain's section accordion is keyed by its sections (else
  the next page's sections open collapsed).
- MF-04 done (mint-tenant 6fcc30e): `/<project>/<route>/edit/<id>` (`pages/EditRecordPage.tsx`, `panel.ts`
  `editPath`). With pages on, the row menu's Edit, the record page's Edit and the quick view's Edit go there (record
  page adds `?from=view`, so Save / Cancel return to the record; otherwise the table it came from). Opens on page 1,
  any page clickable, Save only when something changed ("N changes"), sends only the changes. Checked: row-menu Edit →
  page 3 → stock 7→42 → saved, back to the table; record-page Edit → SKU changed → back on the record.
- MF-05 done (mint-commerce 8ce847b): the same files (all shared files were identical before; `editPath` added by
  hand to commerce `panel.ts`). Checked on a store login (brands): stepped add and edit both save.
- MF-06 done (backend d21a13e1): `update_page` takes `formSteps` (`false` turns it off; keys `s1…` made when left
  out; sets the add button to open a page) and sections' `step` / `side` (kept by title when only `form` is sent;
  unknown pages refused); `get_model` returns `page.form` + `page.formSteps` and lists the pages. Smoke `--mcp`: 24/24.
- MF-07 done (mint-docs 84b6eef): Pages guide → Form → "Form in pages" (`#form-steps`), which the panel's doc link
  opens.
- MF-08 done (asked 2026-11-17: products in pages in every store, both panels; then "5 steps, not 7" — pricing in
  Basic, inventory with variations). `library/functions/commerce/productPages.ts` (`productPagesOf` /
  `withProductPages`) maps the store's current product form to the pages by its fields, so sections the person
  added are kept (on SEO & others); Status + Collections go to a Publishing section on the last page; the engine's
  counts (views, sold 30 days, stock, discount figures) leave the form; Sale price sits beside Price after tax;
  the Variations section gets the blueprint's `showIf` (productType = variation) that built stores never kept. A
  store that already decided on pages (formSteps has `enabled`) is left alone. Installer: after `layoutAgain`.
  Upgrade: a `productPages` step in `upgradeStore` for the product model.
  `formSteps.reviewOn` (a step key, not the first): the Review summary at the top of that page instead of a page
  of its own — the panel's "The summary goes" picker, MCP `update_page`, served by `/get/config`. Pages whose
  sections are all hidden right now are skipped (SteppedForm tracks pages by key). Over 5 pages the stepper shows
  only the current page's name below 2xl.
  Checked on a private server: an old store upgraded (dry run, then --apply), a new store built, a product added
  in the tenant panel and in the commerce panel (store login) through all 5 steps, Variations only after
  "With variations", the commerce edit page with the summary on page 5; smoke `form-steps.mjs --mcp` 26/26.
- Deployed 2026-11-17: backend on Heroku (MF-01, MF-06, MF-08), then `upgradeStores.js --apply` on prod — all 5
  stores' Products forms in pages (Think Tech with Specifications). The same run applied the tax/sale-price upgrades
  GBazaar, Fabrilife and Think Tech hadn't had yet (EC-35…47: Sale price = Price on 2,644 products / 10,232 variants,
  "Price after tax" → "Price (no tax)"). mint-tenant, mint-commerce and mint-docs deploy on push. Nothing left to run.
