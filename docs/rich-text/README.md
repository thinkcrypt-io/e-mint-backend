# MINT rich text — plan (2026-10-18)

Status: **proposed 2026-10-18**, waiting on the user's decisions D1–D10 (§5). Nothing has been built yet.
Work orders: `WORK_ORDERS.md`. Log: `CHANGELOG.md`.

## 1. The user's words

> "plan on how can we improve on the rich-text, the key is editor, currently it works but must work properly on
> the frontend websites too, make a proper plan in depth and let me know"

## 2. Today

### Where rich text is written

| Where | Editor | What it saves |
|---|---|---|
| Record forms, field kind `editor` (admin + mint-tenant `fields/registry/descriptors/text.tsx` → `VEditor` = `utils/inputs/VEditorr.tsx`) | Quill 2.0.3 via react-quill-new 3.4.6 | `editor.getHTML()`, which is **Quill's own internal markup** (`root.innerHTML`) |
| Field kind `basic-editor` | The same `VEditorr` | The same. It passes `type='basic'`, but `VEditorr` ignores it, so the "basic" editor shows the full toolbar |
| `EditorForm.new.tsx` | `FullEditor` (Quill again, its own CSS) | `getHTML()` |
| `utils/inputs/VEditor/index.tsx` | A third Quill wrapper (unused: the index exports `VEditorr` as `VEditor`) | — |
| Site builder Inspector, `richtext` props (mint-builder `PropInputs.tsx`) | Quill with a toolbar cut down to the renderer's allowlist | `getSemanticHTML()`, which is **clean HTML** (real `<ul>`), so this path works |
| Site canvas inline editing (mint-sites `edit/EditRoot.tsx`) | contenteditable | `sanitizeRichText(innerHTML)` |

Contents (`WebContent.richContent`), the CMS "Rich text" content type, posts' `body`, products' `description`, and
any model field a user makes of kind `editor` all go through the record-form editor, which saves Quill's internal
markup.

The panel toolbar offers H1–H6, underline, strike, sub/superscript, text and background colour, alignment,
indent, code block, images (with drag-to-resize) and links. Its background is hard-coded white (`backgroundColor:
'white'`), so it breaks in dark mode, and it is a fixed 600px tall.

### Where rich text is shown, and what happens there

Verified 2026-10-18 by running mint-sites' `sanitizeRichText` on what Quill 2 saves:

```
in : <h1>Title</h1><p class="ql-align-center">Centered <u>under</u> <s>strike</s> <span style="color:…">red</span></p>
     <ol><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span>Bullet one</li>…</ol>
     <p><img src="https://cdn.x/a.png" width="300"></p>
     <div class="ql-code-block-container"><div class="ql-code-block">const a = 1;</div></div>
out: Title<p>Centered under strike red</p><ol><li>Bullet one</li><li>Bullet two</li></ol><p></p>const a = 1;
```

| Where it's shown | What goes wrong |
|---|---|
| **Mint sites** (mint-sites `blocks/text`, bound record fields via `render/bind.ts`) | **Bullet lists come out numbered.** Quill 2 stores every list as `<ol>` with `data-list="bullet"`, and the allowlist drops the attribute. **H1, H5 and H6 lose their element**, so a heading runs into the next paragraph as bare text. **Images are dropped**, leaving an empty `<p>`. **Code blocks become bare text.** Underline, strike, colour, alignment and indent are lost. |
| **Developers' own frontends** (public API, website kit, starter repos, e.g. `mint-hongo-theme/src/app/about/page.tsx`) | They get raw Quill markup. Alignment and indent are `ql-align-*` / `ql-indent-*` classes that need Quill's CSS, and bullet lists need Quill's CSS to show bullets. **Nothing is sanitized**, so they `dangerouslySetInnerHTML` whatever was stored. |
| **Panel record view** (`components/view/utils/render-view-item/renderViewItem.tsx`, `case 'editor'`) | `dangerouslySetInnerHTML` of the stored string, **unsanitized**. Rich text can be written by the public API's create/update endpoints, bulk import, MCP `create_records` and automations. A `<img onerror>` saved through any of them runs in a staff member's browser when they open the record. That is a **stored-XSS hole**. |
| Backend on save (`dynamicModels.function.ts`: `case 'editor': p = { type: String }`) | Stored as given: no cleaning, no normalising. `max` length counts HTML characters, not words. |
| Export, search, PDF templates, email | Export says "rich text as text". Search and PDF have no HTML handling I could find, so a rich-text field in a PDF most likely prints its tags (confirm in RT-08). |

### The core problem

There are three editors and two dialects (Quill-internal and semantic HTML). One sanitizer, in mint-sites, only
knows the semantic dialect, and the panel's main editor doesn't speak it. Nothing on the server makes rich text
safe or consistent, so every consumer (site, panel, developer frontend, PDF, email) is on its own.

## 3. What "works properly on frontend websites" means

1. **What you see in the editor is what the site shows.** Every tool on the toolbar has a rendering on the site.
   The editor cannot make anything the site would drop.
2. **One format, everywhere.** The panel, the builder, the canvas, the API, MCP and AI all write the same thing, and
   the server makes sure of it on every write.
3. **Safe by default.** What's stored can be put straight into `innerHTML` on any frontend.
4. **Styled by the site's theme**, not by the editor: fonts, colours, spacing and dark mode come from the theme
   tokens (`.mint-prose`), so a post looks native on every theme.
5. **Usable without our renderer.** A developer's Next.js/Vue/plain-HTML site renders it with one CSS file, or with
   a small optional package for custom components.
6. **Good for SEO and accessibility**: real headings in order, alt text on images, real lists, safe links.

## 4. Benchmarks

| | Sanity (Portable Text) | Strapi 5 (Blocks) | Contentful (Rich Text) | MINT today | MINT after this plan |
|---|---|---|---|---|---|
| Stored as | JSON blocks | JSON blocks | JSON | Quill-internal HTML | **Canonical HTML subset** (D1), JSON derived |
| Editor | Own (Slate-like) | Own | Own | Quill ×3 | **TipTap / ProseMirror** (D2), one shared editor |
| Schema-enforced | ✓ | ✓ | ✓ | — | ✓ |
| Per-field allowed tools | ✓ | partly | ✓ | — | ✓ (RT-06) |
| Safe output | by construction | by construction | by construction | — | ✓ sanitized on write |
| Custom blocks / embeds | ✓ | limited | ✓ embedded entries | — | ✓ (RT-10) |
| Renderer for devs | @portabletext/react | @strapi/blocks-react-renderer | rich-text-react-renderer | — | `mint-rich-text` + `mint-prose.css` (RT-09) |
| Real-time co-editing | ✓ | — | — | — | Later (TipTap + Y.js) |

## 5. Decisions (proposed)

**D1. Storage: a canonical HTML subset ("MINT rich text v1"), kept as a string.** *(recommended)*
The field stays a string, so filters, search, export, API shapes, existing frontends and every `editor` field
already in the database keep working. Any frontend can render it with no library. JSON blocks (Sanity-style) are
offered as a *derived* output (D7), not the source.
*Alternative:* store JSON blocks the way Sanity and Strapi do. That is cleaner for custom components, but it changes
every API consumer, needs a renderer everywhere, and needs a migration of every field's type. Not worth it while
v1 HTML can carry everything we allow.

**D2. Editor: TipTap (ProseMirror), free/MIT extensions only; one shared component.** *(recommended)*
Its schema means the editor *cannot* produce anything outside v1. It handles paste from Word or Google Docs into
that schema, and it supports markdown shortcuts, bubble/slash menus and React 19. It is the path to real-time
co-editing later (Y.js), which is one of the gaps against Sanity. Quill 2 can't enforce a schema on its HTML.
*Alternatives:* Lexical (good, but its HTML import/export is weaker and its ecosystem is smaller), or keeping Quill
and switching to `getSemanticHTML()` (that fixes the lists and is RT-00's quick fix, but it is not a long-term
answer).

**D3. What v1 allows.**

| In v1 | Out of v1 (the theme decides) |
|---|---|
| Paragraph; headings **H2, H3, H4**, shown as "Heading / Subheading / Small heading" | H1, which the page title owns (pasted H1 → H2; H5/H6 → H4) |
| Bold, italic, underline, strike, inline code, superscript/subscript | Text colour, highlight colour, fonts, font sizes |
| Links: page picker (site pages), URL, email, phone; "open in new tab"; optional `nofollow` | `javascript:` / `data:` links |
| Bullet and numbered lists, **nested** (real nesting, not indent classes) | Indent on paragraphs |
| Quote; code block (`<pre><code>`, optional language); divider (`<hr>`); line break | Inline styles and classes of any kind |
| Alignment left/centre/right on paragraphs and headings, as `data-align`, not `style` or classes | Arbitrary widths in px |
| Images from the media library: `src`, `alt` (asked for), size small/medium/full, align, caption (`<figure>`) | Images from `data:` URIs |
| *(RT-10)* Embeds (YouTube, Vimeo, Google Maps) as `<figure data-embed>`; simple tables; callouts | Raw `<iframe>` / `<script>` |

Colour is deliberately out: a red word that looked fine in the panel clashes with half the themes. If wanted later,
add a "highlight" mark that uses the theme's accent token.

**D4. Clean on the server, on every write; clean again on render.**
A setter on every `editor` / `basic-editor` field and on `WebContent.richContent` runs `normalize()`. That covers the
panel, the public API, bulk import, MCP, automations, templates and AI fill. Quill's dialect is converted, never
dropped: bullet `data-list` → `<ul>`, `ql-indent-N` → nested lists, `ql-align-*` → `data-align`,
`ql-code-block-container` → `<pre><code>`, H1 → H2. An unknown element keeps its words. mint-sites and the panel
view sanitize again on render as a second layer.

**D5. One shared package, `mint-rich-text`, in its own repo** *(recommended)*, installed by backend, mint-sites,
mint-tenant, admin and mint-builder, and published publicly for developers (RT-09). It holds the v1 schema,
`normalize` / `sanitize`, `toText`, `toJson`, `fromMarkdown`, the TipTap extension set and the golden fixtures.
*Alternative:* copy the files into each repo, as `components/library` is copied today, with a golden-fixture test in
each repo to catch drift. That is cheaper to start but drifts.

**D6. Images:** inserted from the existing media manager (MediaManager), or by paste/drop, which uploads into the
media library. Sizes are presets, not pixels. Alt text is asked for on insert and can be skipped with "decorative".
There is still no image optimizer (site-builder D25): sites get `loading="lazy" decoding="async"` and the stored
width/height to prevent layout shift.

**D7. API output:** the default stays **`html`** (v1, sanitized), so nobody's site changes shape. An optional
`?richText=text|json` gives plain text (for cards and meta descriptions) or JSON blocks (for apps and custom
renderers). MCP and AI writes may send **Markdown**, which the server turns into v1 (better for AIs than HTML).

**D8. Limits count words, not HTML:** a field's `min`/`max` on kind `editor` measures `toText()` length. The form
shows a word and character count.

**D9. `basic-editor` = the same editor with a smaller preset** (bold, italic, underline, link, lists, line break),
plus per-field "Formatting" choices in the model builder (RT-06) for every editor field.

**D10. Existing data is migrated** (RT-03): a dry-run report per project (fields, records, what will change), then
a run that rewrites the stored HTML to v1, keeping the old value in a backup collection for 30 days. The setter in
D4 also converts lazily, so a missed record is fixed on its next save.

## 6. Rendering surfaces after the plan

| Surface | How |
|---|---|
| Mint sites (mint-sites) | `sanitize` from the package; `.mint-prose` styles every v1 element in theme tokens, light/dark; heading levels shift down inside a section that already has an H2 (`headingOffset`); images lazy with width/height; embeds as server-rendered iframes from an allowlist; no client JS. |
| Builder canvas + Inspector | The Inspector uses the shared TipTap editor. Canvas inline editing keeps contenteditable but its shortcuts and paste go through the same schema. |
| Panel record view, record history, comments preview | `sanitize`, then `.mint-prose` in the panel's tokens. |
| Tables, search, notifications, export | `toText()` (with a clipped preview in table cells). |
| PDF templates | v1 → pdfkit runs: paragraphs, bold/italic, lists, headings; images skipped or printed per the block's setting. |
| Email (automations, messaging, designMail) | v1 → email-safe HTML (inline styles from the project's email design). |
| Developers' frontends | Stored HTML is safe for `innerHTML`; the backend serves `/public/rich-text.css` (CSS variables they can override); `mint-rich-text/react` gives `<RichText value components={{ img: MyImage }} />`; the website kit, starters and the hongo theme use it. |
| MCP / AI | Tool descriptions say "Markdown or simple HTML"; `get_*` tools return Markdown for editor fields (D7). |

## 7. Risks

- **Developer sites that styled `ql-*` classes** lose that styling after the migration. The fix is to announce it
  in the changelog and docs, ship `rich-text.css`, and offer `?richText=legacy` for 60 days on request.
- **Nested lists from `ql-indent`**: Quill's flat indent levels become nesting. Odd jumps (level 0 → 3) are clamped.
  Covered by fixtures.
- **Bundle size:** TipTap core plus the extensions is roughly the size of Quill. It is lazy-loaded in the panel only,
  and sites ship none of it.
- **Paste from Word/Docs** brings junk: TipTap's schema plus `normalize` on save strip it. Fixtures cover Google
  Docs, Word and Notion pastes.
- **Two sanitizers drifting** (backend vs mint-sites): avoided by D5 (one package, shared golden tests).

## 8. Later (not in this plan)

Real-time co-editing (TipTap Collaboration + Y.js, a Sanity gap); comments anchored to a passage; record mentions
and "link to a record" that keep working when its slug changes; per-language rich text arrives with CMS-12;
rich-text diffs in Versions (CMS-10).
