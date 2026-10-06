# Site builder — changelog

Newest first. Each entry: what changed, where, how it was verified.

## 2026-10-06 — SB-01 Plan & docs

- The user asked for a website builder like Builder.io: AI that composes
  components, styling, modals/drawers/widgets, bound to the project's data, with
  built-in themes, on Next.js. Answers: one shared renderer, blocks with
  flex/grid, Tailwind v4 + CSS variables, the renderer in its own repo, work
  orders written for another agent to build. Site kinds (D4) were recommended in
  answer to "different projects for ecommerce/business/booking?" — to be
  confirmed before SB-13.
- `README.md`: decisions D1–D18, what already exists, architecture, node /
  style / binding / storage / manifest shapes, render API, editor ↔ canvas
  protocol, site kinds, env vars, open questions (D4, root domain, hosting plan).
- `WORK_ORDERS.md`: Handoff (repos, running locally, conventions), Status,
  SB-02…SB-19 specs.
- Verified: file paths and names in the specs checked against the code
  (`websiteKit.function.ts`, `public.router.ts` site routes, `siteConfig.function.ts`,
  `widgets.function.ts`, `website.tools.ts`, `project.router.ts`, `panel.ts`
  `PROJECT_PAGES` / `docsPath`, `projectHooks.function.ts`, `ORG_PERMISSIONS`).
