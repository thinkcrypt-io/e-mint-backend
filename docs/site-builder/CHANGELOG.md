# Site builder — changelog

Newest first. Each entry: what changed, where, how it was verified.

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

## 2026-10-06 — SB-05 Editor shell (in progress — checkpoint)

- Committed so far (details in WORK_ORDERS Handoff "SB-05 state"): renderer
  canvas `/__mint/edit` + protocol + icon route + frame headers; admin
  `/site-builder` editor (pages, outline, canvas, inspector with every prop
  kind, actions, page dialog, publish dialog, draft/autosave/undo/409);
  sidebar entry, "Edit site" button, `fullBleed` Layout; `/pages` returns the
  live `url`.
- Verified so far: selection across canvas/outline/inspector, live typing,
  autosave, undo/redo, reload, publish to the live site, 409 dialog, outline
  doesn't re-render while typing (0 DOM changes over 20 keys), phone + dark
  preview. Not yet: page actions after the add-page fix, every input kind,
  admin `npm run build`, docs + marketing.

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
