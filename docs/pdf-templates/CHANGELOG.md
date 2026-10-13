# PDF templates — changelog

Newest last. Each entry: what changed, where, how it was checked, commits.

## 2026-10-13 — plan
- The user asked for visually designed PDFs (invoice / bill / receipt first)
  with record data placed by tokens like `{{invoice.total}}`, pre-built
  templates added from the admin panel, templates people can edit, build or
  have AI build, and Download making the PDF.
- Plan written (`README.md`, decisions D1–D13; `WORK_ORDERS.md`, PT-01…PT-10).
  Server-side pdfkit (Heroku can't carry a headless browser), JSON blocks,
  gallery = the super admin's published templates with code starters as the
  fallback, slots mapped to the page's fields when a starter is used.

## 2026-10-13 — PT-01 engine
- `library/functions/pdfTemplates/`: `schema.ts` (normalizeTemplate /
  normalizeSettings — known props only, clamped, errors name the block),
  `tokens.ts` (`{{path | filter:arg}}`, 20 filters, Indian grouping, dates in
  the reader's time zone, amount in words), `fonts.ts` (Geist Sans/Mono +
  PDF built-ins; per-character fallback to Noto Sans Bengali), `images.ts`
  (http(s)/data images, address checked as the socket connects, 5 s / 5 MB,
  WebP/GIF/SVG → PNG via sharp), `render.ts` (layout then draw; own line
  breaker so one line can mix fonts; tables split between rows and repeat
  their heading; header/footer per page with per-record page numbers).
- `starters.ts`: Invoice Classic, Invoice Modern, Bill, Receipt, Compact
  receipt (A5), each with slots + sample data (used from PT-04).
- Fonts: `public/fonts/geist` (OFL, copied from the `geist` package);
  dependency `@fontsource/noto-sans-bengali`.
- Checked: every starter rendered with its sample and looked at as images;
  a 60-row table with Bangla descriptions over 4 pages (heading repeated,
  "Page 3 of 4"), two records in one file; a broken template returns six
  readable errors. Fixed on the way: value columns 6 pt past the edge,
  letter-spaced words running together, bold labels left grey.

## 2026-10-13 — PT-02 storage + API, PT-03 record data, PT-04 starters
- Models `library/models/pdf-templates`: `PdfTemplate` (route, alias,
  isDefault, blocks, lists, slots/sample, `gallery.published/order`, `key`,
  `from`) and `PdfSettings` (key `default`), both tenantScoped.
- `/pdf-templates` (`library/controllers/pdfTemplates`, admin + tenant
  project router): list (?route=), get, create, update, delete (the default
  passes on), `:id/default`, `:id/duplicate`, `settings` GET/PUT, `gallery`
  (super admin's published, else the code starters as `starter:<key>`),
  `gallery/starters` (super admin only: adds the missing built-ins,
  published), `fields/:route`, `render` (sample data, inline or by id),
  `guess`, `use`. Handlers can't crash the process (`safe`).
- Per page: `POST /<route>/export/template { ids, template?, tz? }` behind the
  page's export middleware; no template → the page's default.
- `data.ts`: paths the template reads → populate (two steps, readable fields
  only, access-restricted targets matched), `cleanRecord`, declared `lists`
  (only for readers of that page), the field tree with section lists' fields
  and backlinking pages. `mapping.ts`: synonym/type guesses per slot,
  rewriting tokens (filters' field arguments too) and adding a list when a
  slot is matched to another page.
- `viewDocument.controller.ts` now exports `readable`, `refModelOf`,
  `routeForModel`, `labelOf`, `instanceOf` for reuse.
- Checked: smoke 23/23 on the private server (:5021, Mongo :27997) — gallery
  fallback + seeding, guesses (total→grandTotal, client.name, items →
  item.unitPrice / lineTotal), use-a-starter, downloads (one / two records),
  a payments list, a password token printing nothing, permissions (reader
  lists + downloads, can't edit; no read → 403), one default per page.
  Downloaded files looked at as images.

## 2026-10-13 — PT-05 list, PT-06 designer, PT-07 downloads, PT-08 AI
- Admin (`admin/src`): `/pdf-templates` — templates by page (thumbnails drawn
  in HTML, default star, duplicate, delete), Gallery tab (super admin: “Add
  the built-in starters”), Business details dialog, New template (starter /
  blank / AI → page → match fields), Build with AI dialog.
  `/pdf-templates/[id]` — the designer: outline with drag and drop (into
  columns and boxes), the page fitted to its column with zoom, a record or
  sample data, Show fields, properties per block (field picker with guessed
  format, Show only when), page settings (paper, look, lists, gallery
  switch), undo/redo, ⌘S, Real PDF (server file, open in a new tab).
  Shared: `components/library/pdf/` (types, a copy of tokens.ts, PdfPage,
  scope, DownloadPdf), `store/services/pdfTemplatesApi.ts`.
- Downloads: record page *Download PDF* (menu with several templates); row
  menu type `download-pdf` (param kind `pdfTemplate`); Print / PDF lists the
  page's templates for ticked rows. Downloads keep UTF-8 file names
  (`filename*`).
- Backend: `POST /pdf-templates/ai` (forced-tool loop like the model wizard,
  the page's fields in the prompt, up to 3 repairs through normalizeTemplate,
  unknown fields, a test render; warnings returned); `export/template` with
  `as: 'data'` gives the designer the record's data; tenant nav “PDF
  templates” under Build; `scripts/seedPdfTemplates.js` (super admin
  sidebar item — not run anywhere yet).
- Guide: admin `/docs/pdf-templates` (16 sections, the anchors every panel
  links), listed in guides.ts; builder guide's row menu gains Download PDF.
- Checked in the browser (private server): list + thumbnails, New template →
  Invoice Classic → PT Bill page → guesses (Issue date, Client → Name, Qty,
  Unit Price, Line Total) → designer with the record's values (Bangla name,
  ৳, DD/MM/YYYY, words); select, edit, field picker, undo, save, Real PDF
  (27 KB file), record page Download PDF menu → 31 KB file (the save to
  disk was intercepted). AI against a local fake API: 3 rounds, repairs sent
  back, warnings returned. Smoke 23/23. Fixed on the way: page wider than its
  column, a crash-prone handler.

## 2026-10-13 — PT-09 MCP
- `library/controllers/mcp/pdfTemplates.tools.ts`, added to the builder MCP
  (admin /mcp and tenant /tenant/mcp): `describe_pdf_templates` (format +
  gallery), `list_pdf_templates`, `get_pdf_template`, `get_pdf_fields`
  (read); `use_pdf_starter`, `save_pdf_template` (build) — saves go through
  normalizeTemplate; the server instructions point at them.
- Checked over JSON-RPC with a scratch key on the private server: all six
  listed; describe shows the gallery; get_pdf_fields lists the page's fields
  with its root; use_pdf_starter made a Receipt and named the unmatched
  slots; a broken template came back “Not saved” with both problems.

## 2026-10-13 — PT-10 tenant panel, guides, website
- mint-tenant `ddcd2ae`: every shared file copied from admin (identical to
  admin's previous versions before the copy); panel.ts got the same two
  edits by hand (it differs by its tenant-only header). Type-checks clean.
- mint-docs `e913807`: `/pdf-templates` guide (the same 16 anchors the panel
  links through docsPath), in the guides list; Pages → Row menu mentions
  Download PDF. Production build checked.
- Website `e08778a`: “PDF templates” feature tile (Build), changelog
  release 2026-10-13.
- Not deployed anywhere.

## 2026-10-13 — PT-11 AI through the user's own AI only
- The user asked to follow the MCP approach instead of the server calling
  Anthropic. Removed `controllers/pdfTemplates/ai.controller.ts` and
  `POST /pdf-templates/ai` (the admin's `aiPdfTemplate` endpoint too); the
  Anthropic SDK stays for the model wizard.
- Admin + mint-tenant `AiDialog.tsx` → "Build / Change with your AI": pick the
  page, say what it should look like, copy a prompt that names the route (and
  the template id when changing) and the MCP tools to use; "Connect your AI"
  links to /model-builder/connect; "Show what it made" refetches the list,
  "Load its changes" refetches the designer's template (off while unsaved).
- README D12, guides (admin docs + mint-docs #ai) and the website changelog
  line updated.
- Checked: backend + admin typecheck; dialog in the browser.

## 2026-10-13 — PT-12 saved texts
- The user asked for custom text anywhere (a "computer generated, no
  signature required" line, terms and conditions, rules) and business
  details on the organization and the project; plan in README D14–D18,
  WORK_ORDERS PT-12…PT-17.
- `schema.ts`: settings `texts` [{key, label, text}] (30, 5,000 chars; key
  from the label — `textKey`, unique), `textsRoot`; `texts` reserved as a
  root. `tokens.ts` (backend + admin copy): `fill` fills a saved text's own
  fields once (`{{texts.terms}}` → "… {{bill.issueDate | date}}" → the date),
  never deeper.
- Renders: `texts` root in /render and /export/template; the saved texts'
  fields are added to what the record loads.
- MCP: describe_pdf_templates lists the saved texts; new `save_pdf_text`
  (create / replace / remove by key).
- Admin `scope.ts`: `texts` in the sample scope, `textsRoot`, `textKey`;
  `sampleScope(…, own)` shows the scope's own business details (empty ones
  too) for the designer to ask for.
- Checked: smoke 25/25 (two new: keys cleaned, saved text as a root with its
  fields loaded); nested fill checked directly.

## 2026-10-13 — PT-13 business details on the organization and the project
- `library/functions/business.function.ts`: BUSINESS_KEYS (name, logo,
  address, phone, email, website, taxId), schema / Joi / clean,
  `orgBusiness` (business profile, sign-up answers and name/logo filling
  gaps), `projectBusiness` (its own, else the organization's).
- Organization `business` (logo stays `logo`); PUT /tenant/api/org takes it;
  publicOrganization returns it. Project `business`; seeded from the
  organization in `createProject`; GET/PUT /tenant/api/projects/:id return /
  take it (saved whole: the project's own from then on).
- PDF settings: `loadSettings` in a project uses the project's details (the
  bank note stays in PdfSettings); `storeSettings` splits them back (project
  ← details, PdfSettings ← note, money, dates, texts). MCP save_pdf_text
  leaves the details alone.
- Org-level `/tenant/api/upload` and `/media` (manage-organization, shared
  library). Sidebar: Project → Settings (/project-settings, manage-projects)
  inside a project; Organization → Settings only outside one. PANEL_PAGES /
  PROJECT_PAGES know `project-settings`.
- Checked: scripts/tenancy-smoke/business.mjs 16/16; PDF smoke 25/25 again.

## 2026-10-13 — PT-14 organization and project settings pages
- Admin + mint-tenant `components/library/tenant/BusinessDetails.tsx`:
  `BusinessFields` (logo + name, tax number, address, phone, email, website)
  and `LogoField` (the media library's picker — library, folders, upload,
  link — in a modal; Change / Remove).
- Organization → Settings: new "Business details" panel (saves `logo` +
  `business`); business name and website moved there from the sign-up
  answers.
- New `/project-settings` (inside a project): Project (name, description)
  and Business details (PUT /projects/:id `business`). `getTenantProject`
  query; `project-settings` in PROJECT_PAGES; guide anchor
  projects#project-settings (mint-docs), organization guide paragraph.
- Website changelog: business details + saved texts lines.
- Checked in the tenant panel (tenant-5021 against the scratch backend):
  org panel shows the details, the logo picked through the modal's From URL
  tab and saved (GET /org returns it); inside the project the page shows the
  project's copy, the sidebar links Project settings and not the
  organization's.

## 2026-10-13 — PT-18 preview data (backend)
- `library/functions/pdfTemplates/preview.ts`: `previewRoots` — a record made
  from the page's field tree (`dummyValue` by key and kind: names, emails,
  phones, addresses, codes, dates, 3 line items), totals that add up
  (`balance`: rows qty × price, total = sum, paid half, due the rest), the
  template's sample over it; lists two rows each; business details the
  scope's own with the empty ones filled (a "YOUR LOGO" badge when there's no
  logo); saved texts the template prints but the scope hasn't written.
- POST /pdf-templates/render takes `dummy: true`.
- Checked: a starter applied to a page rendered both ways — the old sample
  path was blank for the page's fields; the preview fills every one (looked
  at as an image). Admin side not started.

## 2026-10-13 — PT-18 Preview (admin) + no holes
- `preview.ts`: `fillGaps` — anything the template prints that's still
  empty (a starter's slot left unmatched, {{invoice.due}}; a field the page
  doesn't have) is filled by its name; amounts agree with the line items
  (`balance` returns the sum and paid: total = sum, due = sum − paid, tax /
  discount 0); dates before amounts ("dueDate" is a date). Real downloads
  still print those blank.
- Admin + mint-tenant: `ui.tsx` `previewHref` / `openPreview` (the designer
  leaves its unsaved copy in localStorage `MINT_PDF_PREVIEW_<id>`); new page
  `/pdf-templates/[id]/preview` — full width (sidebar behind the menu
  button), name, Again, Designer, Download, the PDF in a full-height frame;
  an eye (Preview) on every card, yours and the gallery's; Preview in the
  designer's toolbar. `renderPdfSample` takes `dummy` and returns the file's
  name (`filename*`).
- Guides: admin docs + mint-docs `#preview`.
- Checked: the list's cards show the eye; the preview page opened in the
  browser pane (window.open doesn't make tabs in the pane, so opened by
  address) with the PDF; the same render looked at as an image — every field
  filled, subtotal = total = the rows' sum, paid half, balance due the rest,
  due date two weeks on.

## 2026-10-13 — PT-15 Business details dialog
- Admin + mint-tenant `SettingsDialog.tsx`: tabs Business (BusinessFields
  with the logo upload — the media picker opens over the dialog — plus the
  bank note; in a project "this project's business details — Project
  settings shows the same"), Saved texts (name, the field with a copy
  button, the words; a new text's key follows its name until saved, then
  stays; one-click suggestions: Terms & conditions, Computer generated,
  Payment instructions, Return policy, Thank you; same-name refused), Money
  & dates. `focus` opens it at a field: `business.logo` (cursor there),
  `texts.<key>` (the Saved texts tab, the text made if missing).
- Guides (admin docs + mint-docs): Business details rewritten (upload,
  project's own), new `#texts` Saved texts.
- Checked in the browser (script clicks — the pane was collapsed): tabs,
  Upload logo → the picker over the dialog → From URL → the logo back in the
  form; Computer generated added; Save → GET /settings has the logo and
  `computer_generated`.

## 2026-10-13 — PT-16 the full-page designer
- `[id]/page.tsx` rewritten: Layout `type='pos'` + `fullBleed` (sidebar
  behind the menu button); one toolbar (back, name + Default + Saved /
  Unsaved, undo / redo, record or Sample data, Fields, zoom — click the % to
  fit, Business details, Your AI, Preview, Real PDF, Make default, Save);
  three columns that scroll on their own: left Add / Layers, middle the
  page, right the selected block or "Document" (PageSettings — moved from
  the left). Esc unselects; keys don't fire under a dialog.
- New `designer/AddPanel.tsx`: block tiles, ready-made pieces (Logo and
  business, Signature line, Computer generated "…no signature is required",
  Terms & conditions → {{texts.terms_conditions}} in a box, Bank details,
  PAID stamp, Thank-you line), the saved texts (click to print one; Manage /
  New saved text open the dialog). Added after the selected block, else at
  the end of the body, then selected and scrolled to.
- `PdfPage.tsx`: `onFix` — an empty {{business.x}} / {{texts.x}} draws as a
  dashed "+ Add phone" / "+ Write “Terms & conditions”" chip, an empty
  {{business.logo}} image as "+ Upload logo"; a click opens Business details
  at that field (`Shell` `initialFocus` → Chakra `initialFocusEl`, since the
  dialog's own first-control focus beat autoFocus). Saved texts are put in
  before **bold** is read. `blockBar` — the selected block's tools on the
  page (zoom undone so they keep their size): ↖ the block around it (a
  signature's columns, not its words), up, down, duplicate, delete.
- "Sample data" is now the Preview's data (POST /render `dummy` + `as:
  'data'`, business details and saved texts left as they are — `own`):
  every field filled. Fixed: choosing Sample data on a page with records was
  undone at once by the first-record pick (`recordId` null = not picked).
- Guides: designer section rewritten (both). Website changelog lines.
- Checked in the browser (admin-5021 on the scratch backend): full width,
  toolbar, Add tiles, Document panel; Sample data filled; a block's bar; "+
  Add phone" → dialog with the cursor in Phone → typed, saved → the page
  prints it, the chip gone; signature: its words → ↖ → Columns → delete;
  Computer generated added after the selection.

## 2026-10-13 — PT-17 closing pass
- smoke.mjs: three Preview checks (preview data — three rows, total = their
  sum, client filled; business details left as they are for the designer;
  the preview PDF). 29/29; tenancy-smoke/business.mjs 16/16 on the final
  backend. mint-tenant typechecks whole (its copies match admin's).
- Guides and the website were updated with each work order (PT-12…PT-18).
