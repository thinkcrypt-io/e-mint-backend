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
| D12 | **AI builds through the server** like the model wizard's "Build with AI" (ANTHROPIC_API_KEY, forced tool, repair rounds through the same validator), and through the builder MCP for people's own AI. | Both entry points end in the one validator. |
| D13 | **Limits:** 200 records per download, 300 blocks per template, 2,000 table rows per record, 40 pages per record. | A template can't hang the server. |

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
	// gallery starters only
	gallery?: { published: boolean; order: number };
	slots?: Slot[]; sample?: Record<string, any>;
};
```

Blocks (every block: `id`, `type`, optional `showIf` conditions + `showMatch`,
`mt` / `mb` space above / below):

| type | what | main props |
|---|---|---|
| `text` | a paragraph; `**bold**`, line breaks, tokens | `text, size, bold, italic, color, align, upper, spacing, lineHeight, bg, pad` |
| `image` | logo, signature, a record's photo | `src` (url or token), `width, height, align, fit` |
| `columns` | side by side | `columns: [{ width (share), blocks, valign }], gap` |
| `box` | a framed / shaded group | `blocks, pad, bg, border, borderColor, radius` |
| `table` | a list: an array field or a declared list | `rows` (token path), `columns: [{ header, value, width, align }]`, `size, headerBg, headerColor, zebra, lines, emptyText` |
| `fields` | label : value rows (meta, totals) | `rows: [{ label, value, bold, big, bar }], labelWidth, align, hideEmpty` |
| `divider` | a line | `color, thickness, dashed` |
| `spacer` | blank space | `height` |
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
