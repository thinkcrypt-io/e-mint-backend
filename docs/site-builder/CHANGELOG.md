# Site builder — changelog

Newest first. Each entry: what changed, where, how it was verified.

## SB-08 — Block catalogue v1, presets, themes (2026-10-06)

**What:** 19 blocks (header with a no-script phone menu, logo, menu, social
links, breadcrumbs, card, tabs/tab, accordion/question, number, badge, quote,
countdown, carousel, gallery with a big view, moving strip, map, contact form);
34 new presets (37 total) with thumbnails; themes market, calm, mono, bistro
(7 total); contrast test (4.5:1 on every text pair, light + dark — fixed
Bright's accent text); validator warnings for alt text / heading order, tab
and question only inside their parent; `/render` `crumbs`, `GET /pages`
`site`; canvas `context` message; header presets placed between sections.

**Files:** mint-sites `src/blocks/*` (19 folders), `src/presets/{build,sections}.ts`,
`thumbnails.json`, `public/__mint/presets/`, `scripts/thumbnails.mjs`,
`src/themes/{market,calm,mono,bistro,contrast}.ts`, `src/render/interactive.ts`,
`SiteDocument.tsx` (page scripts, non-blocking fonts), fixture views
(`?view=blocks|presets|demo`, `?preset=`, `&theme=&mode=dark`), tests
`blocks.test.tsx`, `contrast.test.ts`; backend `validate.ts`, `render.ts`
(`crumbsFor`), `site.ts` (`siteInfo`), router, manifest sync, tests, smoke;
admin `SiteBuilder.tsx`, `Canvas.tsx`, `protocol.ts`, `AddPanel.tsx`, `edit.ts`,
`DesignPanel.tsx`, `siteBuilderApi.ts`.

**Verified:** mint-sites 76 tests; backend Jest 22 (every preset passes the
validator); smoke `site-builder.mjs` all passed (incl. 6 SB-08 checks:
catalogue, site info, preset page, lone tab refused, alt warning, crumbs).
Fixture checked in the browser (tabs, carousel arrows, map, no hydration
errors); all thumbnails reviewed (card edge-to-edge, pricing buttons aligned,
filled stars fixed); spot shots in mono, calm dark, bistro dark, market,
bright dark, editorial dark. Editor: Add tab shows thumbnails; header preset
shows the site name and menu from pages; lands between sections.

**Performance budget** (`npm run build`, `next start`, `?view=demo` = header +
20 sections + footer): JS files 168.6 KB gzip — Next/React baseline, identical
for a 1-section page, so blocks add 0 KB; inline scripts + RSC payload 14.8 KB
gzip; HTML 25 KB gzip. Lighthouse 12 mobile: studio 98 / a11y 100, bright 99 /
100, bistro dark 98 / 100, mono 99 / 100 (before non-blocking fonts: 87–91).
The 90 KB JS target can't be met while Next's own runtime is 168 KB — noted
for the user (SB-04 already flagged it).

**Deviation:** card has plain children, not media/body/footer slots (the
editor only drops into the children slot).

**Docs:** guide `#presets` (full list with real thumbnails), `#themes`,
`#blocks`, `#add` groups, start note (mint-docs `2586e6f`). Marketing
(mint-webpage `ce2bbf7`): 7-theme strip (sideways row), feature card, changelog.

## 2026-10-06 — SB-07 Style and Design

- **Renderer (mint-sites `9da74ae`):** themes Editorial and Bright (Studio
  stays the default); `src/themes/fonts.ts` — 52 Google Fonts with the weights
  each really has (all checked against fonts.googleapis.com), in the manifest
  as `fonts`; `fontHref` asks only for listed families and clamps weights (one
  bad weight fails Google's whole stylesheet). New block `section-ref` (kind
  `section` prop): draws a saved section from `ctx.sections`, never inside
  another; `SiteDocument` compiles styles and anchors for the sections used
  only; the canvas selects the section-ref (not its inner blocks) and drops
  around it. Header/footer drop message points to Pages. Tests 46.
- **Backend (`4a1b253d`):** validator — `section` prop kind, no saved section
  or overlay inside a saved one, a section-ref to a deleted section is a
  publish problem (an empty one a warning), fonts only from the manifest list;
  `sectionIds` passed wherever trees are checked (save, validate, changes,
  design). `GET`/`PUT /design` return `usage` (pages and layouts per saved
  section); `/render` sends only the saved sections the page and its layout
  place. Jest 18; smoke suite 90 checks (themes, fonts, landing layout,
  sections and their usage, render payload, deleted-section block).
- **Editor (admin `9be3228`):** Inspector gets Settings / Style tabs and a
  "Save as section" button. `StylePanel` — groups from the block's `style`,
  phone / tablet / desktop switch tied to the canvas device (Fit picks by
  width), inherited values labelled ("As on phone (lg)"), blue dot = set here
  (reset), orange ring = a bigger size changes it, reset-a-size, "Shown on"
  per size; only applicable keys (flex/grid keys for containers, image keys
  once there's an image, sticky offset). `DesignPanel` — theme cards (studio
  first), light / dark / visitor's choice, colours per token light+dark,
  fonts (grouped, each in its own face via one `text=`-subset stylesheet),
  corners and shadow sets, page width, buttons, reset to theme; changes stay
  on top of a theme switch. `useDesign` — the design draft (rev, 100-step
  undo, autosave of changed parts only, 409 dialog) and **parts**: header /
  footer of any layout and saved sections edited on the canvas
  (`?part=…`), picked from the page menu or Pages → Header and footer /
  Saved sections (`LayoutsPanel`: add a layout from default's copy, delete
  unused ones, rename / delete unused sections). Save as section replaces
  the block with a named section-ref; Detach puts a fresh copy back.
- **Verified in the browser** (tenant-sb :3031 + mint-sites :3300 +
  backend-sb :5031, local test DB): theme Studio → Editorial restyled every
  page, content unchanged; `primary` changed → canvas live; heading colour and
  size set on Tablet → published CSS has them only inside
  `@media (min-width:768px)` (computed: 375 px default, 1280 px teal 24px);
  header text changed → `/`, `/contact`, `/about` all show it after publish;
  "Feature grid" saved on Home, placed on Contact, edited once → both pages
  show the new heading after publish. Marketing /features themes strip:
  3 columns, no overflow at 390 px.
- **Docs:** guide `#style`, `#breakpoints`, `#design`, `#layouts`, `#sections`
  (mint-docs `626b81d`); marketing (mint-webpage `40a24f5`) — feature card and
  `/workflow/website` steps no longer Coming soon, themes strip on /features,
  changelog entry.

## 2026-10-06 — No image optimizer (D25); root domain `sites.mintapp.shop`

- User's call: no Next image optimization (Vercel bills it per image). mint-sites
  image block is a plain `<img>` (lazy unless `priority`); `images.unoptimized`
  on in mint-sites, admin, mint-docs and mint-webpage; `MEDIA_HOSTS` and the
  `_next/image` proxy exclusion removed. README D25 + mint-sites README.
- Root domain answered: `sites.mintapp.shop` (README D16 + open question 2,
  SB-14 header, handoff deploy notes).
- Verified: mint-sites type-check + 42 tests.

## 2026-10-06 — Builder vs hand-written sites: D19–D24, SB-20…SB-25

- Planning only, no code. The user asked whether sites built through the MCP
  would match what Claude Code writes from scratch, and what our edge is.
- README: new section *Builder vs hand-written sites* (comparison table,
  token estimates marked as estimates) and decisions D19 (both ways kept),
  D20 (the AI sees screenshots of its work), D21 (token budget: two-level
  manifest, presets by key, compact trees), D22 (preset library targets),
  D23 (motion + hover style keys), D24 (brand first).
- WORK_ORDERS: SB-20 preview images, SB-21 token budget, SB-22 motion and
  hover, SB-23 preset library v2, SB-24 brand to theme, SB-25 benchmark; SB-11
  gains the catalogue context + a look-and-fix round; SB-12 gains
  `preview_site_page` and detail lookups; Status, Handoff and *Docs and
  marketing* rows updated.

## 2026-10-06 — SB-06 Adding and moving

- Renderer (mint-sites `2b2bdc9`): overlay blocks `modal` (Pop-up), `drawer`,
  `popover` — native `<dialog>` and `popover`, server components; a ~1 KB
  inline script (`src/render/overlays.ts`) printed only on live pages with an
  overlay or an open/close/toggle action (opens/closes/toggles, scrim click
  closes, popover placed under its trigger); styles in `globals.css` (dimmed
  scrim, no blur; animations off under reduced motion). Canvas
  (`src/edit/`): `drop.ts` (drop target under the pointer — inside a
  container unless on its edge, else before/after in the row/column/grid
  flow, climbing out until allowed; overlays always at the top level; the
  header/footer refused with a reason), `EditRoot.tsx` (drop line / box /
  red reason, drag-to-move by the selection's name tag with edge scroll,
  double-click to type in headings / text / buttons / links, overlays shown
  non-modally with a scrim while selected, shortcuts forwarded as `key`),
  empty containers show "Drop blocks here" in the editor. Protocol: `init
  readOnly`, `drag`, `dragend`, `dropTarget`, `move`, `text`, `key`. Manifest:
  17 blocks. Tests: 42 passing (+ overlays).
- Backend (`751c88e3`): manifest synced; validator: overlays only at the top
  level, open/close/toggle only target an overlay (+ unit tests, 16 passing);
  `site-builder.mjs` adds overlay checks (all passing).
- Admin (`b263ba7`): Add tab (`AddPanel.tsx` — sections then blocks by group,
  search; click = into the selection or after it, sections between sections;
  drag onto the canvas), `edit.ts` (blocks from the manifest, `rekey` keeping
  internal action targets, `placeFor`, `placeProblem`, localStorage
  clipboard), outline drag (HTML5; before / after / inside, red + reason when
  refused) and an Overlays group, Inspector toolbar (duplicate, copy, cut,
  paste, move up/down, select parent, wrap in stack/section, delete),
  shortcuts (⌘Z ⇧⌘Z ⌘C ⌘X ⌘V ⌘D, Delete, ↑/↓, ⌥↑/⌥↓, Esc) from the panel and
  the canvas, "When clicked" open / close / toggle with a pop-up picker.
- Verified in the browser (panel :3031 → backend :5031, renderer :3300):
  Add → Drawer with nothing selected (top level, selected, open on the canvas
  over a scrim); Section selected → Add → Button (inside the section);
  When clicked → Open a pop-up or drawer → Drawer; drag Heading from the Add
  tab onto the page (dropped where the line was); drag it by its name tag
  into the section; double-click → typed "Our story" → Enter (inspector and
  canvas agree, no doubled text); ⌘D, ⌥↑, ⌥↓ (order checked in the saved
  draft); ⌘C the drawer → Contact page → ⌘V (pasted under Overlays) → ⌘Z;
  drag a Button onto the header → refused with the reason, nothing added;
  outline drag (by `DragEvent`s: indicator line, Button moved above Text; the
  Drawer into the Section → red outline + "A drawer goes at the top level of
  the page.", nothing moved); Hero section added to an empty page by a click;
  ↓, Esc, Delete. Published → on the live page the button opens the drawer as
  a modal (focus on Close), Esc closes and focus returns to the button, a
  click on the scrim closes it. `next build`: renderer, tenant panel, docs and
  marketing all pass.
- Not done here (carried, see Handoff): paste into header/footer (SB-07),
  preset thumbnails (SB-08). The outline uses HTML5 drag and drop instead of
  `@dnd-kit` (no new dependency).
- Docs (mint-docs `0020aef`): `#add`, `#presets`, `#move`, `#inline-text`,
  `#shortcuts`, `#overlays` with 2 real screenshots; `#outline`, `#props`,
  `#start` updated. Checked at 390 px dark; build passes. Marketing
  (mint-webpage `a345116`): changelog "Site builder: add, move and pop-ups",
  the editor drawing now shows the Add tab and an open drawer, the
  `/workflow/website` step and feature card mention adding blocks and
  drawers (still Coming soon). Build passes; no overflow at 390 px.

## 2026-10-06 — SB-05 Editor shell

- Renderer (mint-sites `41972a3`): canvas route `/__mint/edit` (draws the
  draft sent over postMessage with the real blocks; clicks select, nothing
  navigates; hover + selection boxes drawn inside the canvas; reports
  `ready/click/hover/rects/height`; origins from `PANEL_ORIGINS`),
  `/__mint/icon/[name]` (one icon as SVG for the icon picker), frame headers
  (`frame-ancestors` on `/__mint/edit`, `X-Frame-Options: DENY` elsewhere),
  protocol message `theme`.
- Admin (`f0b273c`, `dd5b0f0`, `0f95b8f`): `/site-builder` — top bar (page
  picker, 390/768/1280/fit, light/dark, undo/redo, save status, View site,
  Publish), Pages panel (status chips, settings, home, duplicate, take off /
  put back, delete), Outline (memoized rows; header/footer read-only),
  canvas + breadcrumb, Inspector with every prop kind (rich text = compact
  Quill, colour swatches from the theme, media via `UploadModal`, link + page
  picker, icon picker drawn by the renderer, lists) and the "When clicked"
  action editor, page dialog (name, address, menu, layout, SEO), Publish
  dialog (changes, problems → jump to the block, note), draft state with
  100-step undo, 1.5 s autosave with `rev`, 409 dialog, flush before
  switching/publishing, leave warning. Sidebar entry, "Edit site" button,
  `fullBleed` Layout. Backend (`87446cdf`): sidebar entry, `/pages` returns
  the live `url`.
- Fixed while clicking through (`0f95b8f`): the canvas stayed on "didn't
  load" when the frame said `ready` before the design had arrived (it now
  starts once the design comes); taking a live page off now asks first
  (`PromptDialog`, warning tone); the rich-text input's styles never applied
  (Chakra v3 nested selectors need `&` — 5 console errors) and inline code
  was unreadable in dark mode; the outline said "This page is empty" while a
  page was still loading (now "Loading…"). Earlier (`dd5b0f0`): add-page
  jumped back to Home; dialog name focus; Publish dialog's first fetch.
- Verified in the browser (tenant panel :3031 → backend :5031, renderer
  :3300, scratch DB): select in canvas / outline / inspector, live typing,
  autosave, undo/redo (one step per typed phrase), reload keeps the draft,
  publish → the live page shows it, 409 dialog from a second tab, 20 typed
  keys made 0 DOM changes in the 53-row outline (no whole-tree re-render),
  phone width + dark preview, add page, page settings (SEO), delete, status
  chips, icon picker; duplicate (opens the copy with its blocks), make home
  (old home moves to `/home`) and back, take off (live `/about` → 404 at
  once) / put back (Draft, returns with the next publish), the new take-off
  prompt (Cancel keeps it live), rich text (typed text saved to the draft),
  "When clicked" → Go to a page → About (published; the live button links
  `/about`). Not clicked: the image picker — the scratch backend has no S3
  bucket (the input reuses the admin's `UploadModal`). Admin tenant
  `next build` passed at the checkpoint; `tsc` clean after the fixes.
- Docs (mint-docs `a029dcf`, `5a1fc10`, `b45ee19`, `1adaf97`): guide `#pages`,
  `#canvas`, `#outline`, `#props`, `#publish` with 3 real screenshots
  (`public/guides/site-builder/`). Marketing (mint-webpage `77be8d1`): first
  announcement — "Site builder" feature card with a Coming soon badge (new
  `soon` flag on features), an editor drawing (`SiteBuilderMock`), two
  Coming-soon steps on `/workflow/website` ("Or build it visually",
  "Publish when it's ready", new `soon` flag on flow steps, publish drawing),
  changelog "A visual site builder is on the way". Build passes; checked at
  1280 dark and 390 px (no overflow).

## 2026-10-06 — SB-04 The renderer serves published sites

- mint-sites: `src/proxy.ts` (host → `GET /public/sites/resolve`, cached a
  minute → rewrite to `/_s/<slug>/<path>` with `x-mint-site`,
  `x-mint-project`, `x-mint-origin`; unknown hosts → "No site here" 404;
  `/__mint` and `/api` are the renderer's own), `src/lib/api.ts` (render +
  resolve; `x-mint-renderer` on every call), `src/app/%5Fs/[site]/[[...path]]/`
  (page + `generateMetadata` + `not-found.tsx`: the site's `/404` page or a
  themed "Page not found"), `sitemap.xml` / `robots.txt` route handlers (the
  backend's, with the request's address), `src/app/api/revalidate` (HMAC check,
  `revalidateTag(…, { expire: 0 })`), `src/render/LivePage.tsx`,
  `src/render/metadata.ts` (title template, canonical, robots, OG/Twitter,
  favicon, verification). Light/dark follows the design's colour scheme.
- The image block now uses `<img srcset>` against `/_next/image` instead of
  `next/image`, and scripts are plain `<script async>` instead of `next/script`
  — both were client components that put JS on every page.
- Backend: `/render`'s `tags` also carry `verification` and `tracker`
  (structured), so the renderer puts verification in the page head as metadata.
- Verified against a local backend (:5031) with a published two-page site
  (`acme-store`): `http://acme-store.localhost:3300/` renders the theme,
  header, footer, fonts and SEO tags (title, description, canonical, OG);
  `/about` gets the title template; publishing a change shows on the next
  request (renderer log `revalidated site:<id>, site-slug:acme-store`; 5 views
  → 2 backend render calls); `/old-about` → 308 `/about`; `/nowhere` → 404 in
  the site's look; `/_s/other/x` on the site's host → 404 (no cross-site
  view); `localhost:3300` → "No site here"; sitemap/robots carry the request's
  address; the production build (`next start`) has one `<style>` for nodes
  and no block JS (6 chunks, 173 KB gz — all Next/React runtime); track.js
  loads in `<head>` with `data-project` and records the view; no horizontal
  scroll at 390 px. `npm test` 37 passing (+ metadata); `npm run build`
  passes; `site-builder.mjs` still all passing.
- Docs: guide `#live-site` (how it's hosted, how changes reach it, where each
  head tag comes from, sitemap/robots, redirects, the 404 page and `/404`,
  light/dark). Checked at 390 px dark; build passes. Marketing: nothing yet
  (first announcement comes with the editor, SB-05).

## 2026-10-06 — SB-03 Backend storage, validator, tenant API, render API

- Models `SitePage`, `SiteDesign`, `SiteRelease` (`library/models/siteBuilder/`,
  shared `tenantScoped` collections). A page keeps its draft (`tree`, `seo`,
  `rev`) and a `published` copy with its own path, name, layout and menu fields,
  so draft renames never touch the live site; delete = `deletedAt` until the
  next Publish. `SiteDesign.draft` also has `colorScheme`.
- Manifest copy (`blockManifest.json`, `scripts/siteBuilder/syncManifest.mjs`)
  and loader; validator (`validateTree` / `validateDesign` /
  `validatePageFields` with problem levels error / publish / warning; style
  values checked against the manifest's `style` part); `ops.ts`
  (insert / update / move / remove / wrap, locked nodes, `splitOps`);
  `ids.ts` (`rekeyTree` keeps open/scroll/`#node:` targets inside a copy).
- New website projects get the Studio design (header + footer presets in the
  `default` layout) and a home page with the hero preset (project hook);
  older ones get them the first time the editor asks. Deleting a project
  removes its site documents.
- Tenant API `/tenant/api/p/:projectId/site-builder`: manifest (ETag), pages
  CRUD with `rev` → 409, duplicate, set home, unpublish (and `status: 'draft'`
  to bring a page back), design (`rev` → 409), validate, changes, publish
  (problems → 400; nothing changed → 400), releases, restore (pages made since
  stay as drafts; a clashing path moves aside). Writes need `build`, reads
  `build` or `records:view`; website projects only. Publish and restore go to
  the project's activity.
- Public: `GET /public/api/:slug/render?path=` (static pages; site, design,
  layout, tree, SEO with Website-settings defaults, menu, `links`, tags =
  verification metas + track.js, widgets, redirects → `{ redirect }`,
  `{ error: 'not-found' }`), `GET /public/sites/resolve?host=` (root-domain
  subdomain, project domains, `<slug>.localhost` in development; cached 60 s).
  `/site/sitemap.xml` lists builder pages. The renderer's calls
  (`x-mint-renderer`) skip the public API's per-IP limit (`rateLimit` got a
  `skip` option).
- Publish calls `{SITES_RENDERER_URL}/api/revalidate` signed with
  `SITE_REVALIDATE_SECRET`; a failure is logged and returned as
  `revalidated: false`.
- Verified: `npx jest library/siteBuilder` 15 passing (ops, rekey, validator);
  `site-builder.mjs` 73 passing against a fresh backend (:5031, own Mongo) and
  added to `run-all.sh`; `website`, `website-mcp`, `public`, `models`,
  `projects`, `widgets` suites still pass; `npx tsc --noEmit` clean.
- Docs: the `/site-builder` guide created in mint-docs (listed under Go live)
  with `#start` (what it is, draft vs live, what a new site starts with — and a
  note that the editor arrives in steps) and `#publish` (what Publish checks and
  puts live, deleting / taking off / renaming, history and restore, two people
  editing). Checked at 390 px in dark mode; `npm run build` passes.
  Marketing: nothing for SB-03.

## 2026-10-06 — SB-02 Renderer repo

- New repo `mint-sites/` (Next 16.3, React 19.3, Tailwind 4.3, TypeScript
  strict; `02b6a34` on `main`, pushed to `aiasifistiaque/mint-sites`).
- `src/types.ts`: Node, Action, Binding, Style (fixed keys), Tokens,
  TokenOverrides, PropDef, BlockDef, Preset, Theme, Manifest.
- `src/render/`: `compileStyles` (one CSS string; `[data-n]` rules; md/lg media
  queries; hidden is mobile first with `display:revert-layer` to show again;
  background overlay/image/gradient layered into one property; unknown keys and
  bad values dropped), `styleSchema` (the fixed key list, also exported to the
  manifest as `style`), `tokens` (CSS variables on `:root` / `[data-theme=dark]`,
  optional `system` scheme, checked overrides, one Google Fonts link),
  `sanitize` (rich text allowlist, balanced output, safe hrefs), `actions`
  (link/page/scroll/open/close/toggle/widget → attributes; scroll targets get
  an id), `RenderTree` (unknown types render nothing; slots only where declared;
  depth cap 30), `SiteDocument` (fonts + token CSS + node CSS + header/page/footer).
- 14 blocks in `src/blocks/<type>/{schema.ts,index.tsx}`: section, container,
  stack, grid, spacer, divider, heading, text, button, link, icon (197 curated
  Phosphor icons, generated by `scripts/icons.mjs`), image (next/image for
  `MEDIA_HOSTS`, plain `<img>` otherwise, `placeholder:<w>x<h>:<label>`),
  video (YouTube via youtube-nocookie, Vimeo, files), embed (allowlist).
- Theme `studio`; presets `header-simple`, `hero-centered`, `footer-simple`.
- `npm run manifest` → `block-manifest.json` (version `956518cfa8cd`: 14
  blocks, 3 presets, 1 theme, 197 icons, embeds, limits 1500 / 30 / 512 KB).
- Fixture `/__mint/fixture` (`?theme=dark`), dev only (or `MINT_FIXTURES=1`).
  Launch config `mint-sites` (:3300) added to `.claude/launch.json`.
- Found on the way: `_`-prefixed App Router folders are private, so the routes
  live in `src/app/%5F_mint/` (and SB-04's must be `%5Fs/`); WORK_ORDERS paths
  updated.
- Verified: `npm test` 35 passing (compileStyles breakpoints / hidden / junk /
  backgrounds, tokens light/dark/system/overrides/fonts, sanitizer, RenderTree
  unknown types / slots / ids / actions, manifest vs registry + committed file);
  `npm run build` passes; the fixture checked in the browser at 390, 800 and
  1280 px, light and dark — no horizontal scroll, md/lg styles and hidden
  switch at 768 / 1024 px, no console errors.
- Docs and marketing: none for SB-02 (nothing a tenant can use yet).

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
