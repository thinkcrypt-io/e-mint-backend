# Multi-page forms (stepped create / edit forms)

Planned 2026-11-17. Work orders in `WORK_ORDERS.md`, history in `CHANGELOG.md`.

The user (2026-11-17), cleaned up: the tenant panel already lets you choose whether a model's form opens as a
page or as a pop-up (drawer). When "page" is chosen there should be a setting that makes the form multi-page.
You configure the pages: each page (a step) has a title, an optional short description and one or more
sections, and you choose which fields go on which page and section. People filling the form go through the
pages one after another with a stepper across the top — numbered steps with labels, the current one
highlighted, like a product-create wizard (1 Basic info → 2 Pricing → 3 Inventory → 4 Variants → 5 Shipping &
SEO → 6 Review). Next / Back move between steps; the API is called once, on the last step. It is set up in the
tenant panel and, once on, both the tenant panel and the commerce panel use it for that model.

The look to aim for (the user's screenshot): a stepper card across the top (circled numbers, label beside
each, a line between, the current step in the brand colour), then the step's main card with its sections on the
left and a narrow side column on the right (Status, Sales channels, Cover image).

## Where things are today

| Piece | Where |
| --- | --- |
| "Opens: a pop-up / its own page" | Page builder → Table → Page header and buttons (`mint-tenant/src/app/builder/_components/PagePanels.tsx`). Stored on the route config: `route.button.path` set (= `/<route>/create`) means its own page, `route.button.isModal` means the pop-up |
| The form's sections | Route config `form: [{ sectionTitle, description?, fields: (key \| key[])[], showIf? }]`, edited in Page builder → Form → Sections of the form (`SectionsEditor.tsx`) |
| Stored / validated | `RouteConfig` (`library/models/builder/routeConfig.model.ts`, draft + published `data`); Joi `configDraftSchema` in `library/controllers/builder/validate.ts` |
| Served | `GET /<route>/get/config` → `library/controllers/config/getConfig.controller.ts` → `convertToFormFields.ts`: a flat field list; a section's first field carries `sectionTitle` / `description`, its last `endOfSection` |
| Add page | `/<project>/<route>/create` → `src/app/t/[slug]/create/page.tsx` → `components/library/pages/CreateRecordPage.tsx` → `FormMain` |
| Edit | Row menu "Edit in modal" (`edit-server-modal`, `TableMenu.tsx` → `CreateModal`) and the record page's Edit button (`useRecordView.ts` `editProps`). The row menu's "Edit page" (`edit`) links to `/<route>/edit/<id>`, which the tenant panel has no page for yet |
| MCP | `update_page` / `get_model` in `library/controllers/mcp/mcp.router.ts` |
| Commerce panel | `mint-commerce` is a copy of mint-tenant behind `IS_COMMERCE_PANEL`; the files above are identical in both |

## The stored shape

Steps **group the existing form sections**; they don't hold their own copy of the fields (D1).

```jsonc
// RouteConfig data (and draft)
{
  "form": [
    { "sectionTitle": "Basic info", "fields": ["name", ["slug", "sku"], "category"], "step": "s1" },
    { "sectionTitle": "Status",     "fields": ["status", "channels"],               "step": "s1", "side": true },
    { "sectionTitle": "Price",      "fields": ["price", "salePrice"],               "step": "s2" }
  ],
  "formSteps": {
    "enabled": true,          // off keeps the layout, so turning it back on loses nothing
    "review": true,           // end with a Review step that sums up the entries
    "steps": [
      { "key": "s1", "title": "Basic info", "description": "What customers see first" },
      { "key": "s2", "title": "Pricing" }
    ]
  }
}
```

- `formSteps.steps`: 1–12 steps, each `key` (stable short id, `[A-Za-z0-9_-]{1,40}`, unique), `title` (≤ 60),
  `description` (≤ 200, optional). Order = the stepper's order.
- `form[].step`: which step a section is on. Missing, or a key no step has → the **last** step (D3).
- `form[].side`: the section sits in the step's side column on wide screens (D12).
- Sections keep their order within a step; moving a section between steps changes only its `step`.

`GET /<route>/get/config` adds `formSteps` (only when `enabled` and it has at least one step — otherwise it's
left out and the form is one page), and every form field carries its section's `step` and `side`, so the panel
can group fields without knowing the section list.

## The panel

### Page builder → Form → "Form in pages" (MF-02)

- A switch **Split the form into pages**. It needs the add form to open as its own page: while the Table tab's
  "Opens" is "A pop-up over the table", the switch is off with a note and a **Open it as a page** button that
  switches it (D2).
- Turning it on the first time makes one page per section ("Details" → page "Details"), or one page holding
  everything when there's one section.
- Each page: number, title, description, move up / down (and drag), delete (its sections move to the page before,
  PromptDialog). **Add a page**.
- Each page lists its sections; every section has a **Page** dropdown (cl `Dropdown`) to move it and a **Side
  column** switch. **Add a section here** adds an empty section on that page (fill it in Sections of the form
  below). Fields go into sections as today (Sections of the form: drag or pick).
- **Review page at the end** switch.
- A warning when sections aren't on a page ("2 sections aren't on a page — they show on the last page"), and
  when a page has no sections ("Pricing has no sections — it's skipped").
- `#form-steps` doc link on the panel (DocLink → the user guide's Pages › Form in pages).

### The stepper (MF-03 create, MF-04 edit)

- Stepper card across the top: numbered circles + labels joined by lines; the current step in the brand colour,
  done steps ticked. Earlier steps are clickable; on create a later step is clickable only once every step before it
  has been passed (D6); on edit every step is clickable from the start.
- The step's title + description head the main card; its sections follow; side-column sections sit in a 320px
  column to the right (stacked under on phones).
- **Next** checks the current step: every shown required field (required, or `requiredIf` holding; fields hidden by
  conditions don't count) must be filled — otherwise the browser's own bubbles for native inputs plus a toast naming
  the missing fields, and the step stays. **Back** never checks.
- Values live in one form state for the whole page, so moving between steps keeps them; formulas, autofill, tax /
  discount notes and Linked Relationships previews see the whole form (FormMain gets every field and draws only the
  step's sections).
- The last step's button is **Save** (the route's button text) — the only call to the API. Enter in a text box never
  submits. If the server refuses (a required field, a Linked Relationships block…) the toast says why and the page
  stays on the step.
- **Review** (when on): each page's filled values as label / value rows with an **Edit** link to that step.
- On a phone (< 768px) the stepper collapses to one line — "Step 2 of 6 · Pricing" — with a thin progress bar.
- Edit opens at step 1 and sends only changed fields, once, on Save (D7).

### Edit page and where Edit goes (MF-04)

New page `/<project>/<route>/edit/<id>` (`src/app/t/[slug]/edit/[id]/page.tsx` → `EditRecordPage`). It draws the same
form (stepped or not). When a model's steps are on (D10):

- the row menu's **Edit in modal** and **Edit page** go to the edit page;
- the record page's (and quick view's) **Edit** goes to the edit page.

Quick edits (set a field, quick edit a field) are unchanged.

## Decisions

- **D1 — steps group sections, not their own field tree.** The ask suggested `steps: [{title, description,
  sections: [{title, fields}]}]`. Keeping `form` as the one list of sections and tagging each with its `step` means
  the pop-up form, the multiple-entry page, bulk upload, form rules, "Sections that show only when needed", the
  record page's default layout and the MCP tools all keep working, and turning steps off loses nothing.
- **D2 — only for a form that opens as its own page.** A stepper doesn't fit a drawer. With the pop-up, steps are
  ignored (the drawer shows every section) and the builder's switch is off with a button to switch "Opens".
- **D3 — sections not on a page go on the last page** (before Review), and the builder warns.
- **D4 — Review is optional**, always last, read-only, with Edit links back.
- **D5 — the server still checks everything on Save.** Per-step checks are a convenience; nothing new on the server's
  create / update path.
- **D6 — create can't skip ahead** past a step that hasn't been passed; edit can jump anywhere.
- **D7 — one API call**, on the last step; edit sends only what changed.
- **D8 — config lives on the route config**, so it's the project's: the tenant panel and the commerce panel (same
  project, same RouteConfig) both use it with no extra switch.
- **D9 — phone**: one line "Step n of N · Title" + progress bar instead of the row of circles.
- **D10 — Edit goes to a page when steps are on**, since the drawer can't step.
- **D11 — keys are generated** (`s1`, `s2`…, never reused) so renaming a page keeps its sections.
- **D12 — side column per section**, the screenshot's right column (Status, Sales channels, Cover image). Optional;
  a step with no side sections uses the full width.
- **D13 — MCP**: `update_page` takes `formSteps` (or `false` to turn it off) and `step` / `side` on form sections;
  `get_model` shows the form's sections and steps, so a user's AI reads before it writes.

## Not done / later

- Saving a half-filled create form as a draft between visits.
- Steps in the super-admin panel's own (code) pages — the panels share the components, but only project routes
  (DB configs) are checked.
- Per-step conditions (a whole page shown only when a field holds) — sections already have "Show only when".
