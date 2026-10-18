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
