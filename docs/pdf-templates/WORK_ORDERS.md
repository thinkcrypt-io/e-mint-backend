# PDF templates — work orders

Read `README.md` first. Each item has: **why → files → change → done when**.
Sizes: **S** ≤ 1h, **M** ≤ half a day, **L** ≤ 2 days.
Commit and push each WO when it's done; log it in `CHANGELOG.md`; update the
guides (admin `/docs/pdf-templates`, mint-docs) and the marketing site
(mint-webpage `src/content/*`) as each user-visible step lands.

## Handoff (last updated 2026-10-13)

Plan written 2026-10-13 (user asked: visually designed invoice / bill / receipt
PDFs with `{{invoice.total}}`-style data, pre-built templates added from the
admin panel, users edit / build their own / let AI build, Download makes the
PDF). **PT-01…PT-08 done** — engine, API, record data, starters + gallery, admin list + designer, downloads (record page, row menu, Print / PDF), Build with AI. Checked in the browser on the private server (:5021 / admin-5021 :3022). **PT-09 done** (MCP tools). **PT-10 done** — all ten work orders done. **PT-12…PT-17 planned 2026-10-13** (user: full-page designer, logo upload from the page, custom text / terms, business details on organization + project — README D14–D18). **PT-11 done** — AI now only through the user's own AI over MCP (no ANTHROPIC_API_KEY on our side). Nothing is deployed: the backend (Heroku), admin + tenant panels and docs/website need their deploys. `node scripts/seedPdfTemplates.js` was run on production 2026-10-13 (the super admin's sidebar item is in); after deploy, optionally press “Add the built-in starters” on the Gallery tab (or leave the code starters showing).
Commits: backend 94312255, c1ff7cbe, 45918a31, 37748ca3 (+ this); admin 4046693; mint-tenant ddcd2ae; mint-docs e913807; website e08778a.

| WO | Title | Size | Status |
|---|---|---|---|
| PT-01 | Engine: template shape + checks, tokens + filters, pdfkit renderer, fonts, images | L | **done 2026-10-13** |
| PT-02 | Storage + API: PdfTemplate, PdfSettings, CRUD, render, per-page export | M | **done 2026-10-13** |
| PT-03 | Record data: references, lists, permission-safe; the field tree for the designer | M | **done 2026-10-13** |
| PT-04 | Starters: Invoice ×2, Bill, Receipt ×2 with slots + sample; gallery + seed; use-a-starter mapping | M | **done 2026-10-13** |
| PT-05 | Admin: /pdf-templates list, gallery, business settings | M | **done 2026-10-13** |
| PT-06 | Admin: the designer | L | **done 2026-10-13** |
| PT-07 | Downloads: view page button, row menu `download-pdf`, Print / PDF with a template | M | **done 2026-10-13** |
| PT-08 | Build with AI (new + change) — now through the user's own AI over MCP (PT-11) | M | **done 2026-10-13** |
| PT-11 | Server-side AI removed; Build / Change with your AI write the MCP prompt | S | **done 2026-10-13** |
| PT-12 | Saved texts: settings `texts`, `{{texts.key}}` root (fields inside filled once), MCP save_pdf_text, smoke (D16) | S | **done 2026-10-13** |
| PT-13 | Business details on Organization + Project (seeded from the org), org-level upload/media, PDFs read the project's (D14, D15, D18) | M | **done 2026-10-13** |
| PT-14 | Organization → Settings "Business details" (logo upload); new Project settings page (general + business); sidebar: project Settings, org Settings hidden inside a project | M | **done 2026-10-13** |
| PT-15 | PDF Business details dialog: logo upload, tabs Business / Saved texts / Money & dates, opens at the field clicked | S | **done 2026-10-13** |
| PT-16 | Designer full page + reorganised (D17): toolbar, Add / Layers, Document panel, block bar, placeholders, ready-made pieces (computer-generated note, signature, terms) | L | **done 2026-10-13** |
| PT-17 | Guides (admin docs + mint-docs), website, mint-tenant copies, smoke | M | todo |
| PT-18 | Preview: a button on every template (list, gallery, designer) opening the real PDF in a new tab, every field filled with dummy data made from the page's fields when the template's sample doesn't cover them (user, 2026-10-13) | M | **done 2026-10-13** |
| PT-09 | MCP tools (list / get / save / render) | S | **done 2026-10-13** |
| PT-10 | Tenant panel (mint-tenant), guides, website, smoke script | M | **done 2026-10-13** |

## PT-01 Engine — L
**Why:** everything else prints through it.
**Files:** `library/functions/pdfTemplates/{schema,tokens,fonts,images,render}.ts`, `public/fonts/geist/*`, `@fontsource/noto-sans-bengali`.
**Change:** `normalizeTemplate(raw) → { template, errors }` (known props only, clamped, ids filled);
tokens `{{root.path | filter:arg}}` with the filters in README §3; layout: header / body / footer per
page, columns and boxes kept together, tables split across pages with the header row repeated, text laid
out by our own line breaker (runs per font, so a missing glyph falls back to Noto Sans Bengali);
`renderPdf({ template, records: [{ data }], settings }) → Buffer`.
**Done when:** a script renders every block type and a 60-row table to a PDF that opens, with Bangla text
and ৳ printed, and a broken template comes back as errors, not a crash.

## PT-02 Storage + API — M
**Files:** `library/models/pdf-templates`, `library/controllers/pdfTemplates/*`, admin.router.ts, routes-tenant/project.router.ts, routes-admin/common/router.ts.
**Change:** `/pdf-templates` GET list (`?route=`), GET :id, POST, PUT :id, DELETE :id, POST :id/default,
GET/PUT `settings`, POST `render` (template + sample data → PDF), GET `gallery`, POST `use`.
Per page: `POST /<route>/export/template { ids, template }` (template id or inline) behind the page's export middleware.
**Done when:** API smoke: CRUD, default per route, permissions (non-builder can list + download, can't save).

## PT-03 Record data — M
**Files:** `library/functions/pdfTemplates/data.ts`, `GET /pdf-templates/fields/:route`.
**Change:** load the records with the route's queryHelper; populate the reference paths the tokens use
(two steps), readable fields only; declared lists filled when the reader can read that page; field tree
(fields, sub-fields of sections / section lists, references' fields, lists other pages can give).
**Done when:** a token naming a password or excluded field prints nothing; a list from a page the reader
can't read prints nothing.

## PT-04 Starters — M
**Files:** `library/functions/pdfTemplates/starters.ts`, `scripts/seedPdfTemplates.js`.
**Change:** five starters with slots + sample; gallery = super admin's published + code fallback;
`POST /pdf-templates/guess` and `use` rewrite tokens through the mapping.
**Done when:** every starter renders with its sample; using one on a page with differently named fields
prints that page's record.

## PT-05 Admin list — M
`/pdf-templates`: templates by page, default star, duplicate, delete; *New template* → gallery (HTML
thumbnails), blank, AI; settings drawer (business, currency, date format). Super admin: "In the gallery"
switch, "Add the built-in starters". Sidebar entries (admin seed, tenant `tenantNav` Build section).

## PT-06 Designer — L
`/pdf-templates/[id]`: outline + add-block palette + data fields (left), the page (centre, click to
select, drag to reorder, zoom), properties (right); page settings; preview record picker; *Real PDF*;
save / make default; unsaved-changes guard; doc links on every panel.

## PT-07 Downloads — M
View page header *Download PDF* (menu with several), row menu type `download-pdf` (template or ask),
table Print / PDF → *With a template* for ticked rows.

## PT-08 AI — M
`POST /pdf-templates/ai { prompt, route, template? }`: forced `build_template` tool with the field tree
in the prompt, up to 3 repair rounds through `normalizeTemplate` + a test render. **Replaced by PT-11.**

## PT-11 Your own AI only — S
The user asked to follow the MCP approach: `POST /pdf-templates/ai` and `ai.controller.ts` removed; the panel's
"Build / Change with your AI" writes a prompt (route, template id, which MCP tools) to paste into the user's own AI,
links to Connect your AI, and refetches what it saved.

## PT-09 MCP — S
Builder MCP tools: `list_pdf_templates`, `get_pdf_template`, `save_pdf_template`, `describe_pdf_templates`.

## PT-10 Tenant + guides + site + smoke — M
mint-tenant copies of every shared admin file, mint-docs guide, website feature + changelog,
`scripts/pdf-templates/smoke.mjs`.

## Later
- Email a PDF (needs the messaging SMTP).
- Public API download for a customer's own invoice.
- QR codes / barcodes block; watermark ("PAID") block.
