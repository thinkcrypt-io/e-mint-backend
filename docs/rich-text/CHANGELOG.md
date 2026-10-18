# MINT rich text — changelog

Newest last. One entry per work order: date, WO, what changed, files, how it was verified.

---

## 2026-10-18 — RT-01 Plan & docs
- The user: "plan on how can we improve on the rich-text, the key is editor, currently it works but must work
  properly on the frontend websites too, make a proper plan in depth and let me know".
- Read the three Quill wrappers (admin + mint-tenant `VEditorr.tsx`, `VEditor/`, `FullEditor/`), mint-builder's
  `PropInputs.tsx`, mint-sites' `render/sanitize.ts`, `render/bind.ts` and the text block, the panel's
  `renderViewItem.tsx`, and the backend's `editor` kind in `dynamicModels.function.ts`.
- Ran mint-sites' `sanitizeRichText` on Quill 2 output: bullet lists come out numbered, H1/H5/H6 lose their element,
  and images, code blocks, underline, strike, colour and alignment are dropped. Found the panel view renders stored
  HTML unsanitized (stored XSS via public API / import / MCP writes).
- Wrote `README.md` (today, goals, benchmarks, D1–D10, surfaces, risks, later) and `WORK_ORDERS.md` (RT-00…12).
  Proposed — waiting for the user's decisions.

## 2026-10-18 — RT-00 Quick fix of the current Quill editor
- The user: "make a plan for quick fix the current editor, also editor is white in dark mode", then "Build RT-00
  (parts A, B and C), verify light and dark mode, then commit and push each repo."
- **A — the editor** (mint-tenant + admin `components/library/utils/inputs/`): new `editor/quill.ts` (toolbars,
  formats, `editorHtml`) and `editor/editor.css`. `VEditorr.tsx` and `FullEditor` save `getSemanticHTML()`
  (`&nbsp;` → space; H1 → H2, H5/H6 → H4; code blocks trimmed; empty → `''`). They run uncontrolled with a
  remount when the value changes from outside, because react-quill-new resets the content on every keystroke if
  `value` differs from its own HTML. They only report `source === 'user'` changes, because Quill reports loading
  a value too, which wiped a record that loaded after mount (found in the check below). Toolbar: H2–H4, B/I/U/S,
  align, lists + indent, quote, code block, link, image, clear. `formats` drops colour, background, font, size and
  sub/superscript, pasted ones included. Inline `code` is kept but has no button, because it would share the
  code-block icon. `basic-editor` gets its basic toolbar (`type` arrives as `'basic-editor'`, which overrode the
  descriptor's `'basic'`). The editor grows with its content (160px → 60vh, basic 100px → 40vh) with a sticky
  toolbar. **Dark mode:** colours come only from Chakra variables (`field-bg`, `field-border(-hover)`,
  `field-focus-ring`, `bg-muted`, `bg-panel`, `fg`, `fg-muted`, `accent-fg`, `field-placeholder`); the inline
  `backgroundColor: 'white'` is gone. FullEditor's `style.css` keeps its full-page layout with tokens in place of
  hard-coded colours, and its old `[data-theme='dark']` block is removed (it never matched: next-themes sets a
  `.dark` class). Deleted the unused `VEditor/`, the empty `VEditor.tsx` and `styles/quill-custom.css`, which
  nothing imported.
- **B — mint-sites** `render/sanitize.ts`: `fromQuill` pre-pass (flat `<ol><li data-list ql-indent-N>` → nested
  `<ul>`/`<ol>`, code-block divs → `<pre>`, `ql-ui` spans dropped). Aliases h1→h2, h5/h6→h4, del/strike→s, ins→u.
  Newly allowed: u, s, sub, sup, hr, pre, img (http(s) or a site path; alt; numeric width/height; `loading="lazy"
  decoding="async"`). Alignment → `data-align` on p/h2–h4/li. `.mint-prose` styles for all of these, plus nested
  list markers, in theme tokens. The mono font also loads for `<pre>`. Text block `aiHint` updated, manifest
  regenerated and synced to `backend/library/siteBuilder/blockManifest.json`. New dev fixture
  `/__mint/fixture?view=richtext`.
- **C — the panel view**: `utils/richText.ts` (a copy of the site sanitizer until RT-02) and
  `RichTextValue.tsx` (sanitized, prose styles in panel tokens) for `editor` / `basic-editor` in
  `renderViewItem.tsx`. This closes the stored XSS. Editor columns in tables use a new `RichTextCell` (words,
  clipped to 140) in place of raw `<p>` tags.
- Verified: mint-sites `vitest` 91/91 (sanitize 25, 18 of them new: Quill lists/nesting/jumps/mixed, code blocks,
  aliases, alignment, images, `data:`/`javascript:`/protocol-relative images). `tsc --noEmit` clean in mint-sites,
  mint-tenant and admin (admin's only errors are in other sessions' generated `.next-*5021` folders).
  In the browser, a throwaway admin `/docs/zz-richtext` page (deleted afterwards) checked the following, in dark and light mode:
  - A record loaded after mount with old Quill markup stays intact.
  - Typing saves clean HTML and the cursor stays put.
  - The heading dropdown and link box follow the theme.
  - Pasted black text is readable in dark mode.
  - The record view shows bullets, nesting, code and centred text.
  - The XSS probe (`<img onerror>`, a `javascript:` link) stays inert.
  - The table cell shows the words.
  
  mint-sites `?view=richtext` in light and dark: old Quill markup renders headings, nested bullets, numbered lists,
  code blocks and a centred image.
- Pushed: mint-tenant `372ac69`, admin `43e381f` (main); mint-sites `85ca6b0` (main); backend `4e134de3` (v3 → mint).
- Not done (later WOs): server-side cleaning on save (RT-03); migrating stored records (RT-04); mint-builder's
  Inspector Quill still has `background: white` on its container (that app has no dark mode).

## 2026-10-18 — RT-13 Download DOCX
- The user: "can we do like if we have a editor file like rich text, we can download as docx. and for editor fields
  we can add on the table menu, like download docx, and we select which editor field to download", then "no this
  would be new like download docx, like if we have a blogBODY, we can choose that and download from table menu or
  from the records field".
- Backend: `docx@9.8.1` (pinned; the newer 9.9–9.12 were under two weeks old), `functions/richText/{sanitize,docx}.ts`,
  `controllers/export/exportDocx.controller.ts`, route `POST /export/docx` in `routes-admin/common/router.ts` (both
  panels' pages run through it), MCP `download-docx` in `controllers/mcp/rowMenu.ts` (+ `rich` in its context).
- Panel (mint-tenant + admin): `utils/DownloadDocx.tsx`; `download-docx` in menuTypes.ts, MenuItemsEditor (field
  picker of rich-text fields; "no rich-text field" note), TableMenu (FileText icon; not on rows with the field
  empty); ConfiguredView (Download DOCX on rich-text panels). Rich text on the record page and in the editor no longer
  takes the panel's uppercase heading style.
- Verified:
  - `docx.mjs` passes 24/24 on a private backend (:5071, Mongo :27961).
  - The converter's output, opened with macOS Quick Look, shows headings, marks, nested and restarting lists, the image and the alt-text stand-in.
  - The XML has the quote border, the rule, the code shading and Calibri.
  - `rowMenuOf` accepts a rich field and refuses a plain or missing one.
  - In mint-tenant against :5071:
    - The page builder offers Download DOCX, its picker lists only Body and Excerpt, "Needs field" shows until one is picked, and it publishes.
    - The table's row menu downloads `Hello world — Body.docx` (a Word file), and the empty draft's menu leaves the item out.
    - The record page's Body panel downloads the same file.
    - The table's Body column shows words.
  - `tsc` is clean in backend, mint-tenant and admin.
- Docs: mint-docs `pages#row-menu`; website changelog (this and RT-00).

## 2026-10-18 — RT-14 Full-page editor and four download formats
- The user: "maybe we have a full page for editing description like a text editor, document. Can we link that, so
  what i want from table menu, link a field and the menu should open that in a full page editor, saving would only
  save the field, there will be options, export as pdf, export as docx", then "download must have 4 formats, .md,
  .docx, .txt and .pdf", then "on the full page editor we do not need the sidebar".
- Backend: `functions/richText/{tree,pdf,text}.ts` (docx.ts now reads its tree from tree.ts);
  `exportRichText` + `POST /export/richtext` (`routes-admin/common/router.ts`); MCP `open-editor` and the
  `download-docx` format.
- Panel (mint-tenant + admin): `DownloadRichText.tsx` (replaces DownloadDocx.tsx), `RichTextEditorPage.tsx`,
  `OpenEditorButton.tsx`, `app/write/[slug]/[id]/[field]/page.tsx`, VEditorr `type='document'` + placeholder,
  editor.css `.mint-editor--doc`, `writePath` + `write` in PROJECT_PAGES (panel.ts), menuTypes / MenuItemsEditor
  (`docFormat` picker) / TableMenu / ConfiguredView. The editor page sets its tab title on a 1 s check: Next writes
  its default title into a rebuilt `<head>` after a reload.
- Verified:
  - `docx.mjs` 40/40 on a private backend (:5071, Mongo :27961).
  - Sample PDF rendered with PyMuPDF (3 pages): centred mixed marks, lists, the quote bar across a page break, code, Bangla, page numbers.
  - Sample Markdown and text read right; the script is gone.
  - In mint-tenant against :5071, light and dark:
    - The editor opens from the row menu and the panel with no sidebar.
    - Typing shows "Unsaved changes"; ⌘S saves only Body (History: "updated Body"; title and excerpt unchanged).
    - Export → Markdown and → PDF download, and Export saves unsaved words first.
    - The back arrow with unsaved words asks, and "Leave without saving" leaves them unsaved.
    - The toolbar stays under the bar on a long page, and at 375px wide nothing scrolls sideways.
    - The page builder offers "Open in editor" and "Download document" (Field, Format: Ask each time …), and publishes.
    - The row menu's Download document asks for a format and downloads plain text.
  - `tsc` is clean in backend, mint-tenant and admin.

