# Multi-page forms — work orders

Read `README.md` first. Commit and push each WO when it's done, staging only its own files: backend `v3` → `mint`,
mint-tenant `main`, mint-commerce `main`, mint-docs `main`. Update Status, Handoff and `CHANGELOG.md` after each.

## Status

| WO | What | Where | Size | Status |
|---|---|---|---|---|
| MF-01 | Stored shape: `formSteps { enabled, review, steps[{key,title,description}] }` + `form[].step` / `form[].side` in `configDraftSchema`; `/get/config` returns `formSteps` (only when on with ≥ 1 step) and each form field carries `step` / `side`; smoke script | backend (`validate.ts`, `getConfig.controller.ts`, `convertToFormFields.ts`, `scripts/tenancy-smoke/form-steps.mjs`) | S | done 2026-11-17 |
| MF-02 | Page builder → Form → "Form in pages": switch (needs Opens = its own page, with a button to switch), pages add / rename / describe / reorder / delete, sections per page (Page dropdown, Side column switch, Add a section here), Review switch, unplaced / empty warnings, `#form-steps` doc link | mint-tenant `app/builder/_components` (`FormStepsPanel.tsx`, `RouteEditor.tsx`) | M | planned |
| MF-03 | Stepper on the add page: stepper card, step heading, sections + side column, Next checks the step's required fields, Back, click earlier steps, Review summary with Edit links, Save once on the last step, phone "Step n of N · Title" | mint-tenant `components/library` (`create-page/steps/*`, `FormMain.tsx`, `pages/CreateRecordPage.tsx`) | M | planned |
| MF-04 | Edit page `/<project>/<route>/edit/<id>` (stepped or not; opens at step 1, any step clickable, sends only changes); with steps on, row menu Edit in modal / Edit page and the record page's / quick view's Edit go there | mint-tenant (`app/t/[slug]/edit/[id]`, `pages/EditRecordPage.tsx`, `panel.ts` `editPath`, `TableMenu.tsx`, `useRecordView.ts`, `RecordView.tsx`, `RecordDrawer.tsx`) | M | planned |
| MF-05 | Commerce panel: the same files into mint-commerce, checked in the browser on a store model | mint-commerce | S | planned |
| MF-06 | MCP: `update_page` takes `formSteps` (or false) and sections' `step` / `side` (kept when only `form` is sent); `get_model` shows the form's sections and steps; describe text | backend `library/controllers/mcp/mcp.router.ts` | S | planned |
| MF-07 | Docs: mint-docs Pages guide "Form in pages" (`#form-steps`), this folder's Handoff | mint-docs `src/app/pages/page.tsx` | S | planned |

## Handoff

- MF-01 done: `formSteps` + `form[].step` / `side` are accepted by the builder and served by `/get/config`
  (`library/functions/formSteps.function.ts` `formStepsOf`). Smoke: `SMOKE_ROOT=… SMOKE_MONGO=… node
  scripts/tenancy-smoke/form-steps.mjs` (18 checks; `--mcp` adds MF-06's).
- Next: MF-02 (page builder panel).
- Backend deploy to Heroku is manual (the user). Until the backend is deployed, production refuses a publish that
  has `formSteps` (`"formSteps" is not allowed`) — so deploy the backend before announcing MF-02.
