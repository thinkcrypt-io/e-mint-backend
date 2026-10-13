# PDF templates — plan

Designed documents for a page's records: an invoice, a bill, a receipt. A
template is laid out in a visual designer, says which of the record's data
goes where (`{{invoice.total | money}}`), and is what the **Download PDF**
button prints. Starter templates are made by the super admin and offered to
every project in a gallery; a project copies one and edits it, builds its own
from blank, or asks AI to build one.

Work orders: `WORK_ORDERS.md`. Step log: `CHANGELOG.md`.

## 1. What people do

1. **Pick a starter.** PDF templates → *New template* → the gallery (Invoice
   Classic, Invoice Modern, Bill, Receipt, Compact receipt…). Each card is a
   preview with sample data.
2. **Say which page it prints and match the data.** Pick the page (Bills) and
   match each thing the starter shows to one of the page's fields: *Total →
   Grand total*, *Customer name → Client → Name*, *Line items → Items*. Most
   are guessed by name; anything left unmatched shows blank and can be
   matched later.
3. **Design.** The designer shows the page as it will print. Click a block to
   change it, drag to reorder, add blocks (text, image, columns, table, label
   and value rows, box, line, space, page break). Text takes data from the
   field list beside it: click a field, it goes in as `{{bill.total | money}}`.
   *Real PDF* shows the actual file for any record of the page.
4. **Download.** On a record's page, the row menu, or the table's Print / PDF
   menu with rows ticked (one PDF, a page set per record): *Download PDF*.
   With several templates for a page there's a choice; one is the default.
5. **Or ask AI.** "An invoice with our logo top left, a blue band, items with
   VAT, bank details at the bottom" → a template for the page, opened in the
   designer to finish by hand. AI can also change an open template ("make the
   totals bigger").

Business details (name, logo, address, phone, email, website, tax number),
the currency and the date format are set once per project (super admin: once)
and every template reads them as `{{business.name}}` and through `money` /
`date`.

## 2. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | **The server makes the PDF**, with pdfkit (already a backend dependency). No headless browser. | The backend runs on Heroku: Chromium is too heavy for the dyno and the slug. One renderer means the file is the same from the panel, the row menu, the public API or an email later. |
| D2 | **A template is JSON blocks, not HTML.** | Nothing to sanitize (no scripts, no CSS, no fetches the author controls beyond images), easy to validate, and easy for AI to write correctly against a schema. |
| D3 | **Designer = an HTML drawing of the same blocks + a "Real PDF" view.** | Editing needs a live, clickable page; the HTML uses the same fonts, sizes in pt and the same layout rules, and the real file is one click away for the last word. |
| D4 | **Tokens are `{{root.path | filter:arg}}`.** Roots: the record by the template's alias (`invoice`, `bill`…, set from the page's name) and always `record`; `item` + `index` inside a table row; `business`; declared lists; `today`, `now`; `page`, `pages` in the header/footer; `template`. | What the user asked for (`{{invoice.total}}`), readable in the designer, and the same text works in any block. |
| D5 | **Data crosses into other records with the view page's rules.** References (two steps: `invoice.customer.company.name`) only show readable fields (no `select:false`, no secret-looking names, nothing the route's settings exclude). Lists of other pages' records (an invoice's payments) are declared on the template (`lists`) and only filled for someone who can read that page. The record itself is fetched with the route's filter and access rules. | A template is data a builder publishes; it must never show anyone more than they could already open. |
| D6 | **Gallery = the super admin's templates marked "In the gallery".** A project copies one (its own copy, never linked back). The starters ship in code and are put in the super admin's gallery by a seed script / a button on the super admin's page; with nothing in the gallery, the code starters are shown. | "Pre-built, added from the admin panel" — the super admin edits and adds them like any template; a fresh install still has a gallery. |
| D7 | **Starters declare their data as slots** (`slots`: what they print — Number, Date, Customer name, Line items → Description/Qty/Price/Amount, Total…) with sample data for the preview. Using a starter maps each slot to a field of the chosen page (guessed by name and type, changeable), and the tokens are rewritten to the real field paths. | Every project names its fields differently; after mapping, the template is plain and editable like one built by hand. |
| D8 | **Business details, currency and date format are one settings record per scope** (`PdfSettings`), not per template. | Typed once; every template agrees. |
| D9 | **Fonts:** Geist Sans + Geist Mono (OFL, the panel's own font, copied from the `geist` package), and the PDF built-ins Helvetica / Times / Courier. Text that the chosen font has no glyph for (Bangla, ৳) falls back per character to Noto Sans Bengali (OFL, `@fontsource/noto-sans-bengali`). | The designer matches the file; Bangla names and the taka sign print. |
| D10 | **Images:** PNG or JPEG over https (or `data:`), fetched by the server with a 5 s timeout and a 5 MB cap; private / loopback / link-local addresses are refused. SVG isn't supported (pdfkit). | Records and templates hold image URLs; fetching them must not reach inside the network. |
| D11 | **Who can do what.** Anyone signed in reads the template list (names and layout only — no records). Making, changing, deleting templates and the settings is building (`edit-builder` / tenant `build`). Downloading is reading the page (`/<route>/export/template` sits behind the page's own export middleware). | Same split as the dashboard builder. |
| D12 | **AI builds through the builder MCP only** — the user's own AI (Claude, ChatGPT, Cursor…) on their own subscription. The panel's "Build / Change with your AI" writes the prompt to paste; no server-side AI key. (Changed 2026-10-13 at the user's request — PT-08 first called Anthropic from the server.) | One validator for every save; no AI cost or key on our side. |
| D13 | **Limits:** 200 records per download, 300 blocks per template, 2,000 table rows per record, 40 pages per record. | A template can't hang the server. |
| D14 | **Business details live on the organization and on each project** (2026-10-13, user's call). Organization: `logo` + `business` {name, address, phone, email, website, taxId}, edited only on Organization → Settings. Project: `business` {the same + logo}, copied from the organization when the project is made, then the project's own (Project settings, or the PDF designer's Business details). A project made before this shows the organization's until it's first saved. Inside a project nothing says "organization" — the sidebar hides Organization → Settings there. | The user: "Project should have the business details, seeded from the organization"; organization details inside a project confuse. |
| D15 | **PDFs print the project's business details** (`{{business.*}}`); the super admin's own panel keeps them in PdfSettings. PdfSettings keeps the PDF-only parts: `business.note` (bank details), money, dates, saved texts. GET/PUT /pdf-templates/settings merge and split them, so the designer's one dialog edits both. | One place per fact; the designer's "Upload logo" changes the same logo Project settings shows. |
| D16 | **Saved texts** (terms and conditions, a return policy, a "no signature required" line someone reuses): up to 30 per project in PdfSettings `texts` [{key, label, text}], printed as `{{texts.<key>}}`, **bold** and new lines kept, the fields inside filled once per record. Not a new "ProjectContent" model: PdfSettings is already the per-project "what every template prints" document, loaded on every render. MCP: save_pdf_text. Words that never change stay plain text blocks. | Edit the terms once, every template changes. |
| D17 | **The designer is a full-page tool**: no sidebar (the menu button opens it), one toolbar, left panel Add (blocks + ready-made pieces) / Layers, the page in the middle with a move / duplicate / delete bar on the selected block, right panel the selected block — or the document (name, page, paper, look, lists) when nothing is. Empty business details and saved texts show on the page as "Upload logo", "Add address", "Write Terms & conditions" — click to fill them in. | The user: full page, better organised, upload the logo from the page. |
| D18 | **Organization-level uploads**: /tenant/api/upload and /media (manage-organization) store into the organization's shared library, so the organization's logo can be uploaded outside a project. | The org settings page had no way to upload a logo. |
| D19 | **Flexible layout, like CSS flex** (2026-10-13, user: "boxed, flex like … choose if the space is flex and takes the whole white space"). A box lays its blocks out as a **stack** (one under another, default) or a **row** (`direction: 'row'`, side by side) with a `gap`, row alignment `valign` (top / middle / bottom / stretch), `justify` (start / centre / end / space between — used when nothing fills) and an optional minimum `height`. Any block can **fill the free space** (`grow`, a share) or, in a row, have a **fixed width** (`basis`, pt); otherwise it fits its content (text its widest line, an image its size, a box its contents; label rows, tables, lines and columns have no content width, so they fill). A **Space** is `height` pt tall in a stack and that wide in a row; set to fill, it takes the room left — in a row the width, in a box with a height the height, and in the page body the room left on the page, so what follows sits at the bottom of that page (when it fits there). Header and footer have no room to fill. The Columns block stays (fixed shares). | Signatures pushed right, a total pushed to the bottom, a logo and a title on one line with the space between — without counting points. Same rules in the PDF and the designer's HTML (flexbox). |
| D20 | **Moving things on the page**: blocks drag on the page itself — before / after another block (left / right in a row), into a box or a column (where the line shows), and from the Add panel straight onto the page. ⌘C / ⌘X / ⌘V copy, cut and paste the selected block; a paste goes **inside** a selected box or column block, otherwise after the selected block. The copy is also on the system clipboard as JSON, so it pastes into another template or tab. | The user: "an object can be pasted inside a container or box, dragged left to right". The Layers panel kept its drag and drop. |
| D21 | **Gallery categories are data** (2026-10-13, user: "categories for now: invoice, receipt, quotation — we'll add more later; categories and templates should be added from the admin panel and via MCP"). `PdfCategory` {key, name, description, order} — one global list (not per project), seeded with Invoices (`invoice`), Receipts (`receipt`) and Quotations (`quotation`) the first time it's read. A template's `kind` is its category key (any slug; old `quote` → `quotation`, `bill` → `invoice`). Anyone signed in reads the list (the gallery's filter, the designer's Category); only the super admin adds, renames, reorders or deletes — on the PDF templates page (Gallery → Categories) or over the builder MCP (`save_pdf_category`, `publish_pdf_template` for the gallery). Deleting a category leaves its templates under "Other". | The super admin grows the gallery without a deploy; the gallery is browsable by what you want to print. |
| D22 | **Placed freely, like Canva** (user: "elements must have drag to placement like Canva"). Besides the flow (header / body / footer), a template has `free` blocks: each at `x`, `y` (pt from the page's top-left corner) with a width `w`, optional `rotate` (degrees), `opacity`, `behind` (under the flow's content) and `pages` (first / every / last page of each record). Any block can be switched between the flow and free; free blocks are dragged anywhere on the page with snap guides (page edges, margins, centre, other free blocks), resized by their width handle, nudged with the arrow keys; Add has a "Place freely" mode that drops a tile exactly where it's let go. The flow stays the default: tables must flow to split across pages. A free block `behind` the content on the last page only is drawn on top (pdfkit can't draw under content already on a page). | A stamp, a watermark, a signature image or a logo exactly where you put it, without boxes and spaces. |
| D23 | **Draft / published** (user: "templates must have a status and only the published templates should show up on the linked collection's download page … we can link only one template"). `status: 'draft' | 'published'`; none (templates made before) = published. New, copied and from-the-gallery templates start as drafts (MCP `status` can publish at once). Only published ones are offered: the record page's Download PDF, Print / PDF for ticked rows, a row menu's Download PDF (its picker lists published ones; an item linked to a draft is hidden), and the server's default when no template is named (the default among published). A draft named by id is refused (400) except the designer's own reads (`as: 'data'`, an inline template). A row-menu item links exactly one template (or the page's default). | Work on a template without it reaching the people who download. |

## 3. The template

```ts
type PdfTemplate = {
	name: string; description?: string;
	kind: 'invoice' | 'bill' | 'receipt' | 'quote' | 'statement' | 'other';
	route?: string;                 // the page it prints ('' on gallery starters)
	alias: string;                  // the record's token root: 'invoice' → {{invoice.total}}
	isDefault?: boolean;            // the page's first choice
	page: { size: 'A4' | 'Letter' | 'Legal' | 'A5'; orientation: 'portrait' | 'landscape'; margin: [t, r, b, l] }; // pt
	style: { font: 'sans' | 'mono' | 'helvetica' | 'times' | 'courier'; size: number; color: string; muted: string; accent: string; lineHeight: number };
	lists?: { name: string; route: string; foreignField: string; sort?: string; limit?: number }[];
	header: Block[]; body: Block[]; footer: Block[];   // header/footer repeat on every page
	free?: Block[];                 // placed freely (D22): + x, y, w, rotate, opacity, behind, pages
	// gallery starters only
	gallery?: { published: boolean; order: number };
	slots?: Slot[]; sample?: Record<string, any>;
};
```

Blocks (every block: `id`, `type`, optional `showIf` conditions + `showMatch`,
`mt` / `mb` space above / below, `grow` fill the free space (a share), `basis` fixed width in a row, pt):

| type | what | main props |
|---|---|---|
| `text` | a paragraph; `**bold**`, line breaks, tokens | `text, size, bold, italic, color, align, upper, spacing, lineHeight, bg, pad` |
| `image` | logo, signature, a record's photo | `src` (url or token), `width, height, align, fit` |
| `columns` | side by side | `columns: [{ width (share), blocks, valign, direction ('row'), gap }], gap` |
| `box` | a framed / shaded group; a stack or a row (D19) | `blocks, pad, padX, padY, bg, border, borderColor, borderSides, radius, direction ('row'), gap, valign, justify, height, bleed` (full-width background, PT-27) |
| `table` | a list: an array field or a declared list | `rows` (token path), `columns: [{ header, value, width, align }]`, `size, headerBg, headerColor, zebra, lines, emptyText` |
| `fields` | label : value rows (meta, totals) | `rows: [{ label, value, bold, big, bar }], labelWidth, align, hideEmpty` |
| `divider` | a line | `color, thickness, dashed` |
| `spacer` | blank space; can fill the free space (D19) | `height` (its width in a row), `grow` |
| `pageBreak` | next page | — |

Conditions are the platform's (`is, not, in, gt, gte, lt, lte, contains,
empty, filled`), on token paths: show the "PAID" stamp when `invoice.status is
paid`.

Filters: `money[:symbol]`, `number[:decimals]`, `percent`, `date[:format]`,
`datetime`, `upper`, `lower`, `title`, `words` (amount in words), `default:text`,
`count`, `sum:field`, `join[:sep]`, `yesno`, `first`, `last`.

## 4. Where things are

| Part | Where |
|---|---|
| Template shape, checks, tokens, filters | backend `library/functions/pdfTemplates/` (`schema.ts`, `tokens.ts`) |
| Renderer (pdfkit layout) | `library/functions/pdfTemplates/render.ts`, fonts `fonts.ts`, images `images.ts` |
| Data for a record | `library/functions/pdfTemplates/data.ts` |
| Starters | `library/functions/pdfTemplates/starters.ts` |
| Models | `library/models/pdf-templates` (`PdfTemplate`, `PdfSettings`, both tenantScoped) |
| API | `library/controllers/pdfTemplates` → `/admin/api/pdf-templates`, tenant `/p/:project/pdf-templates`; per page `POST /<route>/export/template` |
| Admin pages | `/pdf-templates` (list, gallery, settings), `/pdf-templates/[id]` (designer); shared drawing `components/library/pdf/` |
| Downloads | view page header, row menu type `download-pdf`, table Print / PDF |
| Guides | admin `/docs/pdf-templates`, mint-docs `/pdf-templates` |
