# MINT rich text — work orders

Read `README.md` first (decisions D1–D10). Sizes: **S** ≤ 1h, **M** ≤ half a day, **L** ≤ 2 days.
Each WO ships on its own: code, smoke, guide (mint-docs) + website, commit and push, a line in `CHANGELOG.md`.
Decisions not agreed yet (README status line).

## Status

| WO | What | Where | Size | Status |
|---|---|---|---|---|
| RT-01 | Plan & docs | backend | S | done 2026-10-18 (proposed) |
| RT-00 | Quick fix of the current Quill editor: A clean saving, sites-only toolbar, paste cleanup, basic toolbar, auto height, **dark mode via theme tokens**; B site renderer reads old Quill lists/code, keeps headings, images, alignment; C panel view sanitized (XSS) | mint-tenant + admin + mint-sites | S+S+S | done 2026-10-18 (not deployed) |
| RT-02 | `mint-rich-text` package: v1 schema, `normalize` (incl. Quill dialect), `sanitize`, `toText`, `toJson`, `fromMarkdown`, golden fixtures (D1, D3, D5) | new repo | M | — |
| RT-03 | Backend on write: setter on `editor`/`basic-editor` + `richContent`, limits on text (D4, D8); API `?richText=`; Markdown in MCP/AI (D7); **fixes the stored XSS** | backend | M | — |
| RT-04 | Migration: dry-run report, run, 30-day backup, lazy convert (D10) | backend | M | — |
| RT-05 | The new editor (TipTap) in mint-tenant: toolbar, bubble + slash menus, markdown shortcuts, link dialog with page picker, media-library images, paste cleanup, counts, full screen, dark mode (D2, D6, D9) | mint-tenant | L | — |
| RT-06 | Model builder: "Formatting" choices per editor field; limits in words/characters; FormPreview | backend + mint-tenant | M | — |
| RT-07 | Same editor in admin and mint-builder's Inspector; remove the three Quill wrappers and Quill deps | admin + mint-builder | M | — |
| RT-08 | Mint sites: package sanitizer, `.mint-prose` for every v1 element, heading offset, images lazy + sized, canvas paste/shortcuts on the schema, manifest `aiHint` | mint-sites + backend manifest | M | — |
| RT-09 | Everywhere else in MINT: panel view/history/comments, table cells + search + notifications (`toText`), PDF runs, email-safe HTML | mint-tenant + admin + backend | M | — |
| RT-10 | Developers' frontends: `/public/rich-text.css`, `mint-rich-text/react` renderer, API reference + snippets, website kit / starters / hongo theme | backend + package + themes | M | — |
| RT-11 | Embeds (YouTube, Vimeo, Maps), simple tables, callouts | package + editor + mint-sites | M | — |
| RT-12 | Guide, website, MCP descriptions, changelog for developers (ql-classes notice) | mint-docs + mint-webpage + backend | S | — |
| RT-13 | **Download DOCX** (the user's request, 2026-10-18): a rich-text field as a Word file — row menu item `download-docx` with a field picker (rich-text fields only), a Download DOCX button on each rich-text panel of a record page, `POST /<route>/export/docx`, MCP `update_page` rowMenu | backend + mint-tenant + admin | M | done 2026-10-18 (not deployed) |

Order: **00** (ships this week, stops the worst breakage) → 02 → 03 → 04 (the data is safe and consistent) → 05 →
06 → 07 (the editor) → 08 → 09 → 10 (every frontend) → 11 → 12. 02–04 help even before the new editor: every site
renders the existing content correctly.

## RT-00 — Quick fix of the current Quill editor (S + S + S)

Keep Quill for now; make what it saves show correctly on sites, make it follow dark mode, and close the panel XSS.
No new dependencies. Three parts, each shippable alone: **A** the editor, **B** the site renderer, **C** the panel
view. Parts A and C go into both admin and mint-tenant (their copies of `components/library` are the same file
for file).

### A. The editor (`utils/inputs/VEditorr.tsx`, `FullEditor/`)

1. **Save clean HTML.** `onChange` sends `editor.getSemanticHTML()` in place of `editor.getHTML()`, with
   `&nbsp;` → space (Quill 2.0.3 writes every space as `&nbsp;`). An empty editor (`getLength() <= 1`) saves `''`,
   not `<p><br></p>`, so "required" works. mint-builder's `PropInputs.tsx` already does exactly this.
2. **Offer only what sites can show.** Toolbar: headings 2–4 + Normal, bold / italic / underline / strike, align,
   bullet + numbered list with indent (makes nested lists), quote, code block, link, image, clear formatting.
   Removed: H1, H5, H6, colour, background, sub/superscript, font. `formats` gets the same list, so pasted colours,
   fonts and sizes are dropped too. That matters for dark mode: black text pasted from a doc otherwise becomes
   invisible.
3. **Paste cleanup.** `modules.clipboard` sits inside `modules.toolbar` today, where Quill ignores it. Move it to
   `modules.clipboard` with a matcher that removes `color`, `background`, `font` and `size` from pasted content.
4. **`basic-editor` gets its basic toolbar** (bold, italic, underline, link, lists, clear). `VEditorr` takes the
   `type` prop that the `basic-editor` descriptor already passes and ignores today.
5. **Size.** Drop the fixed 600px height and the `marginBottom: 50px` hack. The editor grows with its content,
   from about 160px (basic: 100px) to 60vh, then scrolls inside, with the toolbar sticky.
6. **Dark mode: theme it with the panel's own tokens.** Remove the inline `backgroundColor: 'white'` and add one
   stylesheet, `utils/inputs/editor.css`, imported by the editor after `quill.snow.css`. It is scoped to a
   `.mint-editor` wrapper and uses only Chakra CSS variables, so light, dark and every colour theme follow with no
   `.dark` rules:

   | Part | Today (snow theme / inline) | After |
   |---|---|---|
   | Writing area | `white`, text inherits | `--chakra-colors-field-bg`, `--chakra-colors-fg` |
   | Border, hover, focus | `#ccc` | `field-border`, `field-border-hover`, `:focus-within` ring `field-focus-ring` (as `styles.FIELD`) |
   | Corners | square | `radius.INPUT` top and bottom (toolbar + area read as one field) |
   | Toolbar | transparent, `#ccc` line | `--chakra-colors-bg-muted`, `border` line |
   | Icons | `.ql-stroke`/`.ql-fill` `#444`, active `#06c` | `fg-muted`; hover + active `fg` |
   | Dropdowns (heading, align) | `#fff` options | `bg-panel`, `border`, item hover `bg-muted` |
   | Link tooltip | `#fff`, grey input | `bg-panel`, input `field-bg` / `fg`, shadow as menus |
   | Placeholder | `rgba(0,0,0,.6)` | `field-placeholder` |
   | Quote, code, code block, links | Quill defaults | `border`, `bg-muted`, `fg`, `colorPalette`/link token |

   `FullEditor/style.css` (about 300 lines of hard-coded `#fff`, `#000` and `whitesmoke`) is replaced by the same
   file. `styles/quill-custom.css` is imported nowhere: delete it. `VEditor.tsx` (0 bytes) and `VEditor/` (unused;
   the index exports `VEditorr` as `VEditor`) are deleted too.
7. **Existing records** are fixed on their next save: Quill reads the old markup and saves it clean. Part B covers
   the ones nobody re-saves.

### B. The site renderer (mint-sites `render/sanitize.ts` + `app/globals.css`)

1. **Old Quill lists → real lists.** A pre-pass, run only when the input contains `data-list=`, rebuilds every
   `<ol>` of `<li data-list="bullet|ordered" class="ql-indent-N">` into nested `<ul>`/`<ol>`, the same way Quill's
   `getSemanticHTML` does. Odd indent jumps are clamped.
2. **Old Quill code blocks** (`div.ql-code-block-container > div.ql-code-block`) → `<pre>`, one line per block.
3. **Aliases, not drops:** `h1` → `h2`; `h5`, `h6` → `h4`; `del`/`strike` → `s`; `ins` → `u`. This stops headings
   running into the next paragraph.
4. **Newly allowed:** `u`, `s`, `sub`, `sup`, `hr`, `pre`, `img`. `img` keeps `src` (http(s) or a relative path,
   via `isSafeHref`, no `data:`), `alt` (escaped) and numeric `width`/`height`, and gains `loading="lazy"
   decoding="async"`.
5. **Alignment:** `class="ql-align-center|right|justify"` on `p`, `h2`–`h4` and `li` becomes `data-align="…"`. No
   classes or styles are passed through.
6. **`.mint-prose` styles** for the new elements, in theme tokens and working in both light and dark: `u`, `s`,
   `hr` (border token), `pre` (muted background, mono, horizontal scroll), `img` (`max-width: 100%; height: auto`),
   `[data-align]`, and nested `ul` (circle, then square).
7. `test/sanitize.test.ts`: the README §2 fixture plus nested lists, mixed bullet/numbered lists, a code block,
   alignment, an image, and `<img onerror>` / `javascript:` cases.
8. The text block's `aiHint` and `backend/library/siteBuilder/blockManifest.json` list the new elements.

### C. The panel record view (`components/view/utils/render-view-item/renderViewItem.tsx`)

1. `editor` / `basic-editor` → `sanitizeRichText(children)` before `dangerouslySetInnerHTML`. Until RT-02's package,
   that is a copy of B's `sanitize.ts` at `components/library/utils/richText.ts`. This **closes the stored XSS**.
2. Prose styles in panel tokens (`css` prop on the Box). Chakra's reset removes list bullets and heading sizes, so
   today lists in the view have no bullets.
3. Check table cells for editor columns: if they show raw `<p>` tags, show the text instead (tags stripped,
   clipped).

### Not in RT-00
Server-side cleaning on save (RT-03), the migration (RT-04), the new editor (RT-05). Developers' own frontends get
cleaner HTML from records saved after part A, but nothing cleans for them until RT-03.

### Verify
- A record with H1, a bullet list, a nested numbered list, a centred line, an image, a code block, and text pasted
  from Google Docs with colours: save it, then open the record view (bullets show; nothing inline), the public API
  (semantic HTML) and a site page bound to the field (all of it shows).
- An old record saved before the fix shows bullets on the site with no re-save.
- The editor in light and dark mode and in two colour themes, through `/docs/inputs` (auth blocks other pages) in
  headless Chrome, since a hidden browser pane doesn't paint. Screenshots in the CHANGELOG entry.
- `npx tsc --noEmit` in admin + mint-tenant; `npm test` in mint-sites.

## RT-02 — The package (M)
- `mint-rich-text`: `schema.ts` (elements, attributes, marks, presets `full`/`basic`/custom), `normalize(html)`
  (parse with htmlparser2 → v1 tree → HTML; the Quill dialect, Google Docs/Word/Notion paste, H1→H2, empty-paragraph
  collapse, `&nbsp;` → space), `sanitize` (= normalize on the given preset), `toText`, `toJson` (blocks), `toMarkdown`,
  `fromMarkdown`, `tiptap.ts` (the extension set matching the schema).
- `fixtures/`: every input → expected output, run in every repo that installs it.
- ESM + CJS, no DOM needed (backend and mint-sites run it server-side).

## RT-03 — Backend on write (M)
- `dynamicModels.function.ts`: `editor` / `basic-editor` → `p.set = v => normalize(v, presetOf(f))`; `min`/`max`
  validated on `toText(v).length` (custom validator, not `minlength`).
- `WebContent.richContent`, CMS content types' editor fields, website kit and template seeds: the same setter.
- Public API: `?richText=html` (default) `|text|json` on list/one; documented in the API reference and the OpenAPI
  output.
- MCP `create_records` / `save_entry_draft` / `fill_page` and the AI fill: Markdown or HTML accepted; `get_entry`
  returns Markdown for editor fields.
- Smoke (`SMOKE_ROOT`): an `<img onerror>` posted via the public API comes back without `onerror`; a Quill-dialect
  body comes back as v1; `max` counts words.

## RT-04 — Migration (M)
- `scripts/migrate-rich-text.ts --dry-run`: per project, per model, which fields are `editor`, how many records,
  how many would change, and samples (before/after).
- Run: rewrites in batches; old value kept in `RichTextBackup` (TTL 30 days); `_published` snapshots too (CMS D5).
- Prod: dry-run report to the user first, then the run (as the CMS migrations were).

## RT-05 — The editor (L)
- `components/library/utils/inputs/RichTextEditor/` (lazy): TipTap with the package's extensions; a sticky toolbar
  from the field's preset; a bubble menu on selection (bold, italic, link); `/` slash menu (heading, list, quote,
  code, image, divider, embed); markdown shortcuts (`## `, `- `, `1. `, `> `, ```` ``` ````, `---`).
- Link dialog: a page picker (the project's site pages, when it has a site), URL, email, phone, new tab, nofollow.
- Images: MediaManager picker; paste/drop uploads into the media library; alt prompt; size and align in a small
  image bubble.
- Word + character count, `max` warning; full-screen mode; read-only mode; theme tokens (dark mode); keyboard
  accessible; the form's dirty state and ⌘S keep working.
- Registry: `editor` and `basic-editor` descriptors use it. A doc link (`docsPath`) on the toolbar's help.

## RT-06 — Model builder (M)
- The field panel for `editor`: **Formatting** checkboxes (headings, lists, links, images, quotes, code, alignment,
  embeds, tables) saved as `f.richText.allow`; limits in characters of text; FormPreview shows the toolbar it gets.
- Backend: `presetOf(f)` reads it, and `normalize` keeps only what's allowed (so the API can't add an image to a
  field without images).

## RT-07 — Admin + builder (M)
- Port RT-05 to admin (super admin forms).
- mint-builder `PropInputs.tsx` `RichText`: the shared editor on the site preset; Inspector previews use `sanitize`.
- Remove `VEditor/`, `VEditorr.tsx`, `FullEditor/`, `styles/quill-custom.css`, `react-quill-new`,
  `quill-resize-image`, `quill-image-resize-module(-react)` from admin, mint-tenant, mint-builder and backend.

## RT-08 — Mint sites (M)
- `render/sanitize.ts` → the package (keep `isSafeHref`, `escapeHtml` for the rest).
- `.mint-prose`: u, s, sup, sub, hr, pre/code, img/figure/figcaption sizes and align, `data-align`, nested lists,
  tables, embeds; light/dark from tokens.
- Text block: `headingOffset` when the block sits under a section heading; `bind.ts` `richtext` coercion through
  `normalize`.
- Canvas inline editing: paste goes through `normalize`; ⌘B/⌘I/⌘K only.
- `blockManifest.json` / text block `aiHint`: the v1 list.

## RT-09 — Inside MINT (M)
- Panel: view, record History values and comment previews → `sanitize` + `.mint-prose` (panel tokens).
- Table cells, ⌘K search (`navSearch`), notifications, exports → `toText`.
- PDF templates: an editor field in a text block prints as formatted runs (paragraphs, bold/italic, lists,
  headings); a setting to skip images.
- Email (automations, messaging, `designMail`): v1 → email-safe HTML with inline styles from the email design.

## RT-10 — Developers' frontends (M)
- Backend: `GET /public/rich-text.css` (cacheable, CSS variables `--mint-rt-*` with sensible defaults).
- Package: `mint-rich-text/react` `<RichText value components />`, plus `toHtml(json)` for the JSON output.
- API reference (mint-tenant `public-api/_components/ApiReference.tsx`) + snippets: "Rendering rich text" for
  Next.js, plain HTML and React Native (json).
- Website kit starters, template starter repos and `mint-hongo-theme`: render through it.

## RT-11 — Embeds, tables, callouts (M)
- Package schema: `<figure data-embed="youtube|vimeo|maps" data-id>`; `<table>` (thead/tbody/th/td, no merged
  cells); `<aside data-callout="info|warning|success">`.
- Editor: slash-menu items + paste-a-link-to-embed; renderer: iframe allowlist, `loading="lazy"`, a 16:9 box.

## RT-13 — Download DOCX (M) — done 2026-10-18
- Backend: `library/functions/richText/docx.ts` (`richTextToDocx`, on `docx@9.8.1`): the field cleaned by the site
  sanitizer (a third copy, `functions/richText/sanitize.ts`, until RT-02), then H2–H4 → Heading 1–3, marks, links
  (web/mail/phone as hyperlinks), Word numbering (each numbered list restarts; 1./a./i. and •/◦/▪ by level), quotes,
  `<pre>`, rules, alignment, images through the PDF engine's `ImageLoader` (safe fetch, PNG/JPEG, ≤ 600px wide; a
  failed one leaves its alt text). `controllers/export/exportDocx.controller.ts`: `POST /<route>/export/docx
  {id, field}` behind the export middleware (read permission, list filter, record access), a rich-text field only,
  `cleanRecord` field rules, empty → 400, file `<record name> — <field label>.docx`.
- Panel (mint-tenant + admin): `utils/DownloadDocx.tsx` (hook + button); row menu type `download-docx` (`field`,
  kind `richField`: the page's `editor` / `basic-editor` fields) in menuTypes.ts / MenuItemsEditor / TableMenu —
  hidden on rows whose field is empty; ConfiguredView puts the button on each rich-text panel.
- MCP: `rowMenu.ts` `download-docx {field}` checked against the page's rich-text fields.
- Smoke: `scripts/tenancy-smoke/docx.mjs` (24 checks).

## RT-12 — Docs and website (S)
- mint-docs guide "Rich text" (writing, images, links, what shows on the site); anchors linked from the editor.
- Developer docs: the format, `?richText=`, the CSS, the React renderer, the `ql-*` change notice.
- mint-webpage: feature line; MCP `describe_platform` wording.
