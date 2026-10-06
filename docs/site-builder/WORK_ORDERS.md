# Site builder — work orders

Read `README.md` first (decisions D1–D18, data shapes, render API, canvas
protocol). Each item: **why → where → change → done when**. Sizes: **S** ≤ 2 h,
**M** ≤ a day, **L** 2–3 days. Paths are from the monorepo root
`/Users/asifistiaque/Desktop/proj/e-mint`.

**Finishing a work order — all of these, every time:**
1. The code and its checks (the WO's *Done when*).
2. **The user guide** in `mint-docs` and **the marketing website** in
   `mint-webpage` — the rows for that WO in *Docs and marketing* below. A work
   order is **not done** until both are updated (the user, 2026-10-06: "during
   building these the agent should update the marketing website and the docs too").
3. Its Status here, a `CHANGELOG.md` entry (what, files, how it was verified,
   which guide sections and marketing pages changed), and the Handoff.
4. Commit and push **each repo touched** (backend `v3` → `mint`, admin `main`,
   `mint-sites` `main`, `mint-docs` `main`, `mint-webpage` `main`) — only your
   own files; other sessions may have uncommitted work in the same folders.

## Docs and marketing — part of every work order

**User guide** — `mint-docs/` (docs.mintapp.shop; Next 16 + Tailwind, launch
config `mint-docs` :3200). One guide, `/site-builder`
(`mint-docs/src/app/site-builder/page.tsx`, laid out like the other guides
there, e.g. `src/app/widgets/`), listed in `mint-docs/src/content/guides.ts`.
Each WO adds or updates **its** sections, at the anchors below, so the panel's
"?" links (`docsPath('/site-builder#…')`) always land on something real. Write
for the tenant (a business owner, not a developer): what it is, step by step
how to do it, what happens on the live site, limits, a short FAQ. Pictures:
real screenshots of the panel or site once the feature works (saved under
`mint-docs/public/guides/site-builder/`), never mock-ups presented as real.
Check the page at 390 px and in dark mode; `npm run build` passes. Also update
the guides it touches: `/websites` (the builder is now the no-code way),
`/widgets`, `/templates`, `/connect-ai` (MCP tools), `/faq`.

**Marketing website** — `mint-webpage/` (repo `aiasifistiaque/mint-website`,
launch config `mint-webpage` :3100). Read its README and
`docs/CONTENT_PLAN.md` first. Content lives in `src/content/*`, pages only lay
it out. Rules from the user: colourful, modernist and slim (Outfit, h1–h3
uppercase, extra-light headlines, **never semibold/bold**); Phosphor icons via
`src/components/ui/icons.tsx` (no Lucide); neutral `IconTile`s, no gradient
tiles; light + dark (`bg-panel`, `dark:` variants for hard-coded colours); no
backdrop blur; **no Log in / dashboard links and no links into the user
guides** (access is by waitlist); every new page gets `pageMeta()` and its own
`opengraph-image.tsx`; perfect at 390 px; claims honest — describe only what
works, anything still being built is labelled "Coming soon". Verify with
`npm run build`. Where things go: `content/features.ts` (feature cards),
`content/flows.ts` (`/workflow/website` steps — already "Build a website"),
`content/changelog.ts` (one entry per shipped WO), `content/templates.ts`
(themes/kinds), `content/widgets.ts`, `content/compare.ts`,
`components/mock/mocks.tsx` (drawings of the editor).

| WO | User guide (`mint-docs` `/site-builder`) | Marketing site (`mint-webpage`) |
|---|---|---|
| SB-02 | — (nothing a tenant can use yet) | — |
| SB-03 | Create the guide page + `guides.ts` entry with the outline below; write `#start` (what the builder is, draft vs published) and `#publish` (publishing, what goes live, history in short) | — (nothing visible yet) |
| SB-04 | `#live-site` — where the site lives, how changes reach it, redirects and 404 page, SEO from pages | — |
| SB-05 | `#pages`, `#canvas`, `#outline`, `#props`, `#publish` (full) + screenshots | **First announcement**: `features.ts` card "Site builder" (Coming soon until SB-07), editor drawing in `mocks.tsx`, `/workflow/website` gains "or build it visually" steps, changelog entry |
| SB-06 | `#add`, `#presets`, `#move`, `#inline-text`, `#shortcuts`, `#overlays` (modals, drawers, popovers) | Changelog; the editor drawing shows the Add panel and a drawer |
| SB-07 | `#style`, `#breakpoints`, `#design` (themes, colours, fonts), `#layouts` (header/footer), `#sections` | Feature card loses "Coming soon"; a themes strip (same page, light/dark) |
| SB-08 | `#blocks` (every block, one line each), `#presets` (full list), `#themes` | Themes gallery content in `templates.ts` / features; changelog |
| SB-09 | `#data`, `#collections`, `#template-pages`, `#bindings` (with the filters list), and a "turn on the public API first" note | "Your data on your site" step in `/workflow/website`; changelog |
| SB-10 | `#widgets` + update `/widgets` (placing widgets with the builder) | `widgets.ts` mentions placing widgets visually; changelog |
| SB-11 | `#ai` (what to ask, scopes, nothing is published by the AI, limits) | AI building a site in `/workflow/website` and `/ai`; `compare.ts` if claims change; changelog |
| SB-12 | `#mcp` + update `/connect-ai` with the new tools | `/developers` / AI pages mention the MCP tools; changelog |
| SB-13 | `#kinds` (each kind and what it installs) + update `/templates` and `/projects` (New project → Website) | Site kinds on `/use-cases` and `templates.ts`; personas if useful; changelog |
| SB-14 | `#domains` (default address, custom domain, DNS records, statuses) | "Your own domain" in features; changelog |
| SB-15 | `#history` (releases, restore, compare), `#pages` updates | Changelog |
| SB-16 | Final pass: read the whole guide top to bottom, fix gaps, `#faq`, cross-links from `/websites` | Final pass: whole website flow reads end to end; OG images; 390 px check |

Guide outline (anchors) to create in SB-03 and fill as you go: `#start`,
`#live-site`, `#pages`, `#canvas`, `#outline`, `#props`, `#add`, `#presets`,
`#move`, `#inline-text`, `#shortcuts`, `#overlays`, `#style`, `#breakpoints`,
`#design`, `#themes`, `#layouts`, `#sections`, `#blocks`, `#data`,
`#collections`, `#template-pages`, `#bindings`, `#widgets`, `#ai`, `#mcp`,
`#kinds`, `#publish`, `#history`, `#domains`, `#faq`. Sections not written yet
are left out of the page (not shown empty).

## Handoff — read this first (last updated 2026-10-06)

**2026-10-06 — SB-02 done** (renderer `mint-sites/`, local commit `02b6a34`
on `main`; **not pushed — the GitHub repo `aiasifistiaque/mint-sites` doesn't
exist yet, ask the user before creating it**). 14 primitive blocks, Studio
theme, `compileStyles`, tokens, sanitizer, 3 presets, `block-manifest.json`
(version `956518cfa8cd`), fixture at `http://localhost:3300/__mint/fixture`,
35 vitest tests, `npm run build` passes. **Next: SB-03** (backend storage +
validator + render API) — it copies `mint-sites/block-manifest.json` and seeds
new sites with presets `header-simple`, `hero-centered`, `footer-simple`. Then
SB-04 joins them, then the editor (SB-05 → SB-07). Open questions for the user
are at the end of README (site kinds D4, the sites' root domain, the hosting
plan); none blocks SB-03…SB-12.

**Learned in SB-02 (applies to SB-04/05):**
- App Router folders starting with `_` are **private** (not routed). The
  `/__mint/*` routes live in `src/app/%5F_mint/…` and the published-site route
  must be `src/app/%5Fs/[site]/[[...path]]/` (URL `/_s/…`), not `_s/`.
- The manifest has a `style` part (every style key → group, kind, allowed
  values; from `src/render/styleSchema.ts`) — the backend validator should
  check node styles against it rather than re-listing the keys.
- Hand-written CSS in the renderer reads `--mint-*` variables, never
  Tailwind's `--color-*` aliases (those resolve at `:root`, so dark mode on a
  wrapper wouldn't reach them).
- Tailwind's spacing unit is tied to the theme (`--spacing: var(--mint-space-1)`),
  so `p-4` follows the theme's space scale.

### Repos and branches

| Repo | Folder | Remote / branch | Notes |
|---|---|---|---|
| backend | `backend/` | remote `mint`, branch **`v3`** | Heroku; **production does not auto-deploy** — pushes reach prod only when the user redeploys |
| admin (super admin + tenant panel) | `admin/` | branch **`main`** (deploys admin + tenant panel on Vercel) | the panel deploys *before* the backend: new panel pages must not break when a new endpoint 404s — show "Site builder needs the latest backend" |
| renderer | `mint-sites/` (new, SB-02) | GitHub `aiasifistiaque/mint-sites`, branch **`main`** | ask the user before creating the GitHub repo or a Vercel project |
| user guides | `mint-docs/` | `aiasifistiaque/mint-docs` `main` | every guide is edited here only |
| marketing site | `mint-webpage/` | `aiasifistiaque/mint-website` `main` | update with every product change people would notice |

### Running locally

- **Other sessions share the dev machine.** Ports 5011 (scratch backend) and
  27998 (Mongo) may belong to another session — never kill a process by port;
  start your own backend on a free port (e.g. 5021) against your own Mongo
  (`mongod --port 27999 --dbpath <scratch>`), and point the renderer/panel at it.
- Launch configs live in `.claude/launch.json` at the monorepo root. Add
  `mint-sites` (`npm run dev -- -p 3300`, port 3300) in SB-02.
- Smoke suites: `backend/scripts/tenancy-smoke/` (`lib.mjs` helpers, `run-all.sh`,
  `SMOKE_ROOT` / `SMOKE_MONGO`); a full run needs a fresh backend (tenant
  sign-in is limited to 30 per 15 minutes).
- Browser checks of the tenant panel only work with the browser pane visible.

### Conventions that bite (from earlier work)

Backend
- New collections use the `tenantScoped` plugin and are **shared** (one
  collection for all tenants) — production runs on a cluster where a shared
  tier capped collections at 500; never create a collection per project.
- Read a tenant model with `scopedModel(name)` / the kit's `kitModel(req, route)`,
  never `mongoose.models[name]`; raw collection calls on project models add
  `ownRecordsOf(Model)`; never `syncIndexes()` a project model (D21 of
  multi-tenancy).
- Website settings only through `loadSite` / `saveSite`
  (`library/functions/siteConfig.function.ts`); secrets are `select:false` and
  never reach the render API or the MCP.
- Public routes go through `routes-public/public.router.ts` (it already sets
  `req.project` from `:slug`, rate-limits, and has `handle()` + `TenancyError`).
- Tenant routes mount on `routes-tenant/project.router.ts` and check the
  `build` permission for writes, `records:view` for reads.

Admin (tenant panel)
- New project page: add its first segment to `PROJECT_PAGES` in
  `admin/src/components/library/config/lib/constants/panel.ts`; build links with
  `projectHref` / `pagePath`; project URLs use the **publicSlug**.
- Dialogs: portalled Chakra v3 `Dialog` parts; every confirm/delete is
  `PromptDialog`; every footer is `ModalFooter` (`styles.MODAL_FOOTER`) with the
  buttons straight inside; no backdrop blur (dim the scrim).
- Dropdowns: the component library's `Dropdown` (Chakra Select), never
  `NativeSelect`; it only reads literal `<option>` children.
- RTK endpoint names are global across services — grep before adding one, a
  duplicate is silently dropped. Use the store under `components/library`
  (the other store tree isn't wired). Never import `store/store.ts` from a
  feature module (it logs everyone out).
- Chakra v3 inputs take `readOnly`, not `isReadOnly`. No components defined
  inside render functions. Keep per-keystroke state out of big parents.
- Icons in admin: never bundle an icon grid of a whole library.
- No bare `prettier` (no config; it rewrites tabs/single quotes). Match the
  surrounding code: tabs, single quotes.

Renderer (`mint-sites`)
- Next 16 (`src/proxy.ts`, not `middleware.ts`), React 19, Tailwind v4, no UI kit.
- Server components by default; a block is a client component only if
  `client: true` in its schema, and its JS loads only when the block is on the page.
- Never generate Tailwind class names from data (D3); node styles go through
  `compileStyles`.
- No webfont fetch at build time (it fails on Vercel); fonts load at runtime
  from Google Fonts CSS links for the theme's families.

## Status

| WO | Title | Repo | Size | Status |
|---|---|---|---|---|
| SB-01 | Plan & docs | backend | S | done 2026-10-06 |
| SB-02 | Renderer repo: Next 16 + Tailwind v4, tree renderer, `compileStyles`, tokens → CSS variables, 14 primitive blocks, 1 theme, manifest script, fixture page | mint-sites | L | done 2026-10-06 (local commit `02b6a34`; GitHub repo not created yet) |
| SB-03 | Backend: `SitePage` / `SiteDesign` / `SiteRelease`, manifest copy + validator, tenant API (pages, design, publish, releases, rollback), `/render` (static pages), `/sites/resolve`, revalidate call, smoke suite | backend | L | open |
| SB-04 | Renderer ↔ backend: host routing, render fetch + cache tags, SEO metadata, layouts, menu, redirects, 404, sitemap/robots, tags + mint.js, `/api/revalidate` | mint-sites | M | open (after SB-02, SB-03) |
| SB-05 | Editor shell: `/site-builder` page, Pages panel, canvas iframe + protocol, select/hover overlays, Outline, Inspector (props from the manifest), autosave, undo/redo, device switch, Publish dialog | admin + mint-sites | L | open (after SB-04) |
| SB-06 | Adding and moving: Add panel (blocks + presets), drag from panel to canvas, drag inside canvas + outline, inline text editing, copy/paste/duplicate, keyboard, overlays in the outline | admin + mint-sites | L | open |
| SB-07 | Style + Design: Style panel per breakpoint, Design tab (theme picker, token editor, fonts, light/dark), header/footer layouts, global sections | admin + mint-sites + backend | L | open |
| SB-08 | Block catalogue v1 + presets + 4 more themes; Lighthouse budget | mint-sites | L | open |
| SB-09 | Data binding: bindings + interpolation, `collection` block, template pages `/x/[slug]`, server resolve in `/render` + editor `resolve`, Data panel | all three | L | open |
| SB-10 | Widgets and commerce blocks: `widget`, add-to-cart, price, product gallery, account links; widget actions | mint-sites + admin | M | open |
| SB-11 | AI: build a site, write a page, write a section, edit the selection (ops), AI panel | backend + admin | L | open |
| SB-12 | MCP tools for the site builder | backend | M | open |
| SB-13 | Site kinds + templates: `siteKind`, kind picker in New project, blueprint `website.builder`, apply engine, Template Studio tab, 6 kind templates | all three | L | open (confirm D4 first) |
| SB-14 | Addresses + domains: default subdomain, custom domains via Vercel API, verification, Domains card | backend + admin + mint-sites | M | open (needs the root domain + hosting answers) |
| SB-15 | Releases + pages: history and rollback UI, compare, duplicate page, page from preset/AI, unpublish | admin + backend | M | open |
| SB-16 | Final pass of the guide and the marketing site (each WO updates both as it lands — see *Docs and marketing*) | mint-docs + mint-webpage + admin | M | open |
| SB-17 | Import kit pages (`WebPage` + `WebContent` → trees) | backend + admin | M | later |
| SB-18 | Download a site as a standalone Next.js project | mint-sites + backend | L | later |
| SB-19 | Developers' own components (register React components via an SDK) | mint-sites | L | later |

---

## SB-01 — Plan & docs (S) — done

README (decisions, shapes, contracts), these work orders, CHANGELOG.

---

## SB-02 — Renderer repo (L)

**Why:** everything visible is drawn by this app (D1, D3, D5). Built against a
fixture first so it doesn't wait for the backend.

**Where:** new repo `mint-sites/` (ask the user before creating
`aiasifistiaque/mint-sites` on GitHub). Next 16, React 19, TypeScript strict,
Tailwind v4, `nanoid`. No component library.

```
mint-sites/
  src/app/layout.tsx                    html/body, no fonts at build time
  src/app/_s/[site]/[[...path]]/page.tsx   (SB-04) published pages
  src/app/%5F_mint/fixture/page.tsx     renders fixtures/home.json (dev only, 404 in production) — URL /__mint/fixture
  src/blocks/<type>/index.tsx           the component
  src/blocks/<type>/schema.ts           BlockDef (README "Block manifest")
  src/blocks/registry.ts                type → { Component, def } (explicit imports; client blocks via next/dynamic)
  src/render/RenderTree.tsx             walks Node[]; data-n="<id>"; hidden per breakpoint; slots
  src/render/compileStyles.ts           Style → CSS text (README "Style")
  src/render/tokens.ts                  Tokens → :root / [data-theme=dark] CSS variables + font links
  src/render/actions.ts                 Action → href / data attributes (overlays wired in SB-06)
  src/themes/<key>.ts                   theme tokens; first theme: 'studio'
  src/types.ts                          Node, Style, Binding, Action, Tokens, BlockDef, PropDef
  scripts/manifest.ts                   writes block-manifest.json (sorted, version = sha1 of content)
  fixtures/home.json                    a page using every block
  test/*.test.ts                        vitest
```

**Change:**
1. Types exactly as README *Data shapes*. Export them from `src/types.ts`; the
   backend copy of the manifest is the contract, so keep names stable.
2. `tokens.ts`: Tokens = `colors` (background, foreground, muted, muted-foreground,
   primary, primary-foreground, secondary, secondary-foreground, accent,
   accent-foreground, card, card-foreground, border, ring, success, warning,
   danger — each `{ light, dark }`), `fonts` (heading, body, mono: family +
   weights), `radius` (none, sm, md, lg, xl, full), `shadow` (none, sm, md, lg),
   `space` (the scale in README), `container` (px), `button` (radius token,
   weight, uppercase). Output `--mint-color-primary` etc.; map them into Tailwind
   with `@theme inline` so blocks can use `bg-primary`, `text-foreground`,
   `rounded-[var(--mint-radius-md)]`.
3. `compileStyles(tree)`: one CSS string for the whole tree; base rules plus
   `@media (min-width:768px)` and `(min-width:1024px)`; hidden → `display:none`
   per breakpoint. Unknown keys/values are dropped (never passed through).
4. Primitives (14): `section` (full-width band, inner container, background),
   `container`, `stack` (flex), `grid`, `spacer`, `divider`, `heading`
   (level 1–4), `text` (sanitized rich text), `image` (media URL, alt, fit,
   `next/image` with the backend's media host allowed), `button` (variants
   primary/secondary/outline/ghost/link, size, icon), `link`, `icon` (curated
   map ≤ 200 SVGs in `src/blocks/icon/icons.ts`, names exported to the
   manifest), `video` (YouTube/Vimeo embed or file), `embed` (allowlisted
   hosts only).
5. `npm run manifest` → `block-manifest.json` committed in the repo.
6. Fixture route draws `fixtures/home.json` with the `studio` theme, light and
   dark (`?theme=dark`).

**Done when:** `npm run build` passes; `npm test` covers `compileStyles`
(breakpoints, hidden, dropped junk), `tokens` (CSS variables for light/dark),
`RenderTree` (unknown type renders nothing, slots, ids); the fixture page
renders every primitive at 390 px and 1280 px with no horizontal scroll; the
manifest lists 14 blocks, 1 theme, the icons and limits. Launch config
`mint-sites` (:3300) added. README of the repo explains run/build/manifest.

---

## SB-03 — Backend storage, validator, tenant API, render API (L)

**Why:** pages need a home, a safety check, draft/publish and one render call
(D6, D7, D8).

**Where:**
- `backend/library/models/siteBuilder/{sitePage,siteDesign,siteRelease}.model.ts`
  (+ export from the models index the server loads; `tenantScoped` plugin)
- `backend/library/siteBuilder/blockManifest.json` (copy) + `manifest.ts`
  (load once, index blocks by type, expose `manifestVersion`)
- `backend/scripts/siteBuilder/syncManifest.mjs` (copy from `../mint-sites/block-manifest.json`, print the version)
- `backend/library/siteBuilder/validate.ts` (`validateTree`, `validateDesign`,
  `validatePage`; returns `{ ok, problems: [{ nodeId?, path, message }] }`)
- `backend/library/siteBuilder/ops.ts` (`applyOps(tree, ops)` — used by SB-06
  paste, SB-11 AI, SB-12 MCP; write it now with tests)
- `backend/library/siteBuilder/render.ts` (`renderPage(project, path, { draft })`)
- `backend/library/siteBuilder/publish.ts` (`publishSite`, `rollback`, revalidate call)
- `backend/routes-tenant/siteBuilder.router.ts`, mounted in
  `routes-tenant/project.router.ts` at `/site-builder` (website projects only → 404 otherwise)
- `backend/routes-public/public.router.ts` (`GET /render`) and
  `routes-public/index.ts` (`GET /public/sites/resolve`)
- `backend/scripts/tenancy-smoke/site-builder.mjs` + `run-all.sh`

**Tenant API** (`/tenant/api/p/:projectId/site-builder`; writes need `build`):
```
GET    /manifest                         the block manifest (ETag = version)
GET    /pages                            [{ id, name, path, kind, status, isHome, showInMenu, priority, changed: draft.rev > published }]
POST   /pages                            { name, path, kind?, source?, layout?, tree?, seo? } → page (validated)
GET    /pages/:id                        page with draft (+ published version)
PUT    /pages/:id                        { rev, tree?, seo?, name?, path?, layout?, showInMenu?, priority?, source? } → 409 { rev, page } if rev is stale
DELETE /pages/:id                        (not the home page)
POST   /pages/:id/duplicate              { name, path }
POST   /pages/:id/home                   make it the home page (path '/')
POST   /pages/:id/unpublish
GET    /design                           draft design (+ published version)
PUT    /design                           { rev, theme?, tokens?, layouts?, sections? } → 409 on stale rev
POST   /validate                         { tree } | { design } → { ok, problems }   (the editor's live check)
GET    /changes                          what Publish would change: pages added/changed/removed, design changed, problems
POST   /publish                          { note? } → { version, publishedAt, url }  (400 with problems; nothing published)
GET    /releases                         [{ version, note, publishedBy, publishedAt, pages: n }]
POST   /releases/:version/restore        → published = that release; draft too (new release written, version++)
```

**Public:**
- `GET /public/sites/resolve?host=` — `<publicSlug>.<SITES_ROOT_DOMAIN>`, any
  `TenantProject.domains[]` entry (SB-14 adds verification), and `localhost` /
  `*.localhost:<port>` in development (`<slug>.localhost`). Cache 60 s in memory.
- `GET /public/api/:slug/render?path=` — README *Render API*. In SB-03:
  static pages only (bindings in SB-09), `layout` from the design, `menu` from
  pages with `showInMenu`, `tags` from the existing `siteTags(loadSite(...))`,
  `redirect` from Website settings redirects, `widgets` from `SiteWidgets`.
  `?draft=1` is **not** public: the editor gets drafts from the tenant API.

**Change details:**
- A new website project gets an empty `SiteDesign` (theme `studio`) and a
  home `SitePage` with the manifest's default hero + footer presets, through
  `projectHooks.created` (beside `seedWebsiteKit`). Existing website projects
  get them lazily on the first `GET /design` / `GET /pages`.
- Publish: validate all draft pages + design; any problem → 400, nothing
  changes. Otherwise in a transaction (or ordered writes with a release written
  last and published copies written first, then the release) copy drafts,
  write `SiteRelease`, prune to 50, then `POST {SITES_RENDERER_URL}/api/revalidate`
  `{ tag: 'site:<projectId>' }` with `x-mint-signature: hmac_sha256(secret, body)`.
  A failed revalidate is logged and returned as `revalidated: false` — not an error.
- `/sitemap.xml` (existing) also lists published `SitePage` static paths and,
  for template pages, the published records of their source model (≤ 5,000).
- Record history: publish and restore go to the project's activity
  (`recordHistory` pattern used elsewhere) with the version and note.

**Done when:** `site-builder.mjs` passes and is in `run-all.sh`: create page →
validate (bad type, bad URL `javascript:`, duplicate id, too deep → problems) →
save with stale rev → 409 → publish → `/render?path=/` returns the tree, layout,
menu, tags → change draft → `/render` still returns the old one → publish again
→ new → restore v1 → old again; app projects get 404; another project's page
ids get 404; `/sites/resolve` maps `acme.localhost`. `ops.ts` unit-tested
(insert/update/move/remove/wrap, invalid ops rejected). WORK_ORDERS + README
"Where things are" updated.

---

## SB-04 — Renderer serves published sites (M)

**Why:** join SB-02 and SB-03 into a working public site.

**Where:** `mint-sites/src/proxy.ts`, `src/app/%5Fs/[site]/[[...path]]/page.tsx`
(URL `/_s/…`; a plain `_s` folder is private and never routed),
`src/app/%5Fs/[site]/[[...path]]/not-found.tsx`, `src/lib/api.ts`,
`src/app/api/revalidate/route.ts`, `src/app/sitemap.xml/route.ts`,
`src/app/robots.txt/route.ts`, `src/render/Head.tsx`.

**Change:**
1. `proxy.ts`: read the host → `GET /public/sites/resolve` (60 s in-memory
   cache) → rewrite to `/_s/<slug>/<path>`; unknown host → a plain "No site
   here" page. Skip `/_next`, `/api`, `/__mint`, files.
2. Page: `fetch(render)` with `next: { tags: ['site:<projectId>'], revalidate: 300 }`
   (projectId comes back in the response; tag by slug too: `site-slug:<slug>`).
   `generateMetadata` from `page.seo` + `site` (title template, description,
   OG image, canonical, robots noIndex, favicon). Redirect → `redirect()` /
   `permanentRedirect()`. 404 → render the site's `/404` page or a themed default.
3. Layout: header tree, page tree, footer tree; `design.tokens` → `<style>`
   (tokens.ts), `compileStyles` for all three trees in one `<style>`; fonts as
   Google Fonts `<link>`s for the theme's families; `tags.head` / `bodyStart`
   / `bodyEnd` placed as given (they are the tenant's own tags, same as today's
   `/site/tags`); `mint.js` script when `widgets.enabled` is non-empty.
4. `/api/revalidate`: verify the HMAC (`SITE_REVALIDATE_SECRET`), `revalidateTag`.
5. `sitemap.xml` / `robots.txt`: proxy the backend's per-site files with the
   request's origin.
6. Light/dark: follow `site.colorScheme` (`light`, `dark`, `system`).

**Done when:** with a local backend (SB-03) and a published page, `http://acme-store.localhost:3300/`
renders it with its theme, header, footer and SEO tags; publishing a change
shows on the next request (revalidate hit, logged); a redirect from Website
settings works; an unknown path shows the 404; `view-source` has one `<style>`
for nodes and no unused block JS; works at 390 px. CHANGELOG notes the
verification.

---

## SB-05 — Editor shell (L)

**Why:** the panel side of D9: see the page, pick a node, change its props,
save, publish.

**Where:**
- `admin/src/app/site-builder/page.tsx` (+ `_components/`): `SiteBuilder.tsx`
  (layout + state), `Canvas.tsx` (iframe + protocol), `PagesPanel.tsx`,
  `Outline.tsx`, `Inspector.tsx`, `PropInputs.tsx` (one input per PropDef
  kind), `PublishDialog.tsx`, `useDraft.ts` (reducer, history, autosave),
  `protocol.ts` (message types — copy of mint-sites `src/edit/protocol.ts`).
- RTK: `admin/src/components/library/store/services/siteBuilderApi.ts`
  (endpoint names prefixed `siteBuilder…` — grep first).
- `PROJECT_PAGES` += `'site-builder'`; sidebar entry in the website project's
  "Website" category ("Site builder", first); website overview card "Edit site".
- Renderer: `mint-sites/src/app/%5F_mint/edit/page.tsx` (client; URL `/__mint/edit`), `src/edit/*`
  (`protocol.ts`, `EditRoot.tsx`, selection/hover outlines, rect reporting via
  `ResizeObserver` + scroll, origin check against `PANEL_ORIGINS`).

**Change:**
1. Layout: top bar (page picker, device 390/768/1280 + fit, light/dark, undo,
   redo, saved state, "View site", Publish), left rail tabs (Pages, Outline;
   Add/Design/Data/AI arrive in later WOs), centre canvas, right inspector.
   Full-height page without the normal admin padding.
2. Canvas: iframe `${NEXT_PUBLIC_SITES_URL}/__mint/edit`; on `ready` send
   `init`; after each change send `tree`. Selection and hover boxes are drawn
   **inside** the canvas (renderer side) so they scroll with the page; the
   panel shows the selected node's name + breadcrumb above the canvas.
3. Outline: the tree (header / page / footer groups), expand/collapse, select,
   rename (double click), hide toggle, lock. Memoized rows with primitive props.
4. Inspector: the selected block's props from the manifest (`PropInputs`:
   text, textarea, richtext (reuse the admin's editor input), number, boolean,
   select (`Dropdown`), color (token picker + custom), image/images (the media
   manager picker that `/images` uses), video, link/page (page picker or URL),
   icon (searchable list of the manifest's ≤ 200 names drawn from the
   renderer — no icon library bundled in admin), list (repeatable rows)).
   Action editor for buttons/links/images (D12). Props with `help` show it.
5. Draft state: `useReducer` with ops (the same op shapes as backend `ops.ts`),
   undo/redo stack (100), autosave 1.5 s after the last change (`PUT /pages/:id`
   with `rev`), 409 → `PromptDialog` "Someone else changed this page — reload
   their version?" Leaving with unsaved changes warns.
6. Pages panel: list, add (blank), rename, path, SEO (title, description,
   image, noIndex, canonical), show in menu, priority, set home, duplicate,
   delete (`PromptDialog`), status chip (draft / published / changed).
7. Publish dialog: `GET /changes` → list + problems (each problem jumps to its
   node); note field; Publish → toast with the live URL. `ModalFooter`.
8. Missing endpoint (404 from `/site-builder/manifest`) → an empty state that
   says the backend needs updating; app projects never show the page.
9. Every panel header has a "?" link to its guide anchor (`docsPath('/site-builder#…')`).

**Done when:** in the tenant panel a website project's Site builder opens the
home page in the canvas; clicking a node selects it in canvas, outline and
inspector; editing a heading's text shows live; undo/redo works; reload keeps
the draft; Publish makes the change appear on the renderer's public page;
a second tab editing the same page gets the 409 dialog; everything works at a
1280 px window and the panel doesn't re-render the whole tree on each
keystroke (React profiler note in CHANGELOG). Screenshots in CHANGELOG.

---

## SB-06 — Adding and moving (L)

**Why:** building pages, not just editing them.

**Where:** admin `site-builder/_components/{AddPanel,DragLayer,Clipboard,shortcuts}.ts(x)`;
renderer `src/edit/{drop,inlineText,overlays}.ts(x)`.

**Change:**
1. Add panel: blocks by category and **presets** by category (thumbnails from
   the manifest), search; click = insert after the selection (or into it when it
   takes children); drag onto the canvas = `drag` / `dropTarget` / `dragend`
   messages (README protocol) with a drop line drawn in the canvas.
2. Drag inside the canvas (handle on the selection box) → `move`; drag in the
   outline (admin has no drag-and-drop library yet — add `@dnd-kit/core` +
   `@dnd-kit/sortable`).
   Respect `slots.allow` and `canBeChildOf` (refuse with a red line).
3. Inline text: double click heading / text / button label → contentEditable in
   the canvas → `text` message on blur/Enter; rich text keeps the allowlist.
4. Copy / cut / paste / duplicate (new ids for every pasted node; paste across
   pages and into layouts), delete, wrap in stack/section, move up/down,
   select parent (Esc). Shortcuts: ⌘Z, ⇧⌘Z, ⌘C, ⌘X, ⌘V, ⌘D, Delete, ↑/↓ with ⌥ to move.
5. Overlays (D12): modal, drawer, popover blocks (renderer components, client),
   listed under "Overlays" in the outline; selecting one sends `open`; the
   action editor's `open/close/toggle` target picker lists them. Published
   pages: overlays are closed by default, open via the action, close on Esc and
   backdrop (dimmed scrim, no blur), focus trapped, `aria-modal`.

**Done when:** a page can be built from an empty one with presets and blocks
using only the mouse; a button opens a drawer on the published site; paste
into another page works; keyboard shortcuts work; refusing an invalid drop
shows why. Validator rejects pasted trees with duplicate ids (they are
re-keyed client-side first).

---

## SB-07 — Style and Design (L)

**Why:** "styling" from the user's request, and themes (D3, D10, D14).

**Where:** admin `_components/{StylePanel,DesignPanel,TokenEditor,ThemePicker,LayoutsPanel}.tsx`;
renderer: themes; backend: design validation for tokens/layouts/sections.

**Change:**
1. Style panel (inspector tab next to Props): the groups in README *Style*,
   shown per the block's `style` groups; the device switch picks the
   breakpoint being edited (base / md / lg) and values set on a larger
   breakpoint show a dot + "reset"; colours are token swatches (+ custom hex
   stored as a token override? **no** — custom hex only through the token
   editor, so a theme switch still works); spacing as the scale steps.
2. Design tab: theme gallery (manifest themes with previews), switching keeps
   content; token editor (colours light/dark, fonts from a curated Google Fonts
   list of ~40 families, radius, shadow, container width, button style); reset
   to the theme. Saved in `SiteDesign.draft` (`PUT /design`).
3. Layouts: edit the header and footer in the canvas (choose "Header" / "Footer"
   in the page picker); pages pick a layout (default / none); a second layout
   ("landing") can be added.
4. Global sections: "Save as section" on a selection stores it in
   `SiteDesign.sections`; inserting it adds a `section-ref` node (renderer draws
   the stored tree; editing it changes it everywhere, with a warning).

**Done when:** switching theme restyles every page with no content change;
editing `primary` updates canvas live; a style set on `md` applies only from
768 px on the published site; header edits show on all pages; a global section
used on two pages updates both on publish. Validator rejects style values
outside the fixed list.

---

## SB-08 — Block catalogue v1, presets, themes (L)

**Why:** enough blocks and presets for real sites.

**Where:** `mint-sites/src/blocks/*`, `src/presets/*`, `src/themes/*`.

**Change:**
1. Blocks (in addition to SB-02/06): `header` (logo, menu from `menu`,
   actions slot, sticky, mobile drawer menu — client), `nav-menu`, `logo`,
   `social-links`, `card` (media/body/footer slots, whole-card action),
   `tabs`, `accordion`, `carousel` (client, CSS scroll-snap first),
   `gallery` (grid + lightbox), `stat`, `badge`, `quote`, `map` (Google Maps
   embed from Website settings address), `countdown`, `marquee` (logos),
   `breadcrumbs`, `form-placeholder` (until W-08).
2. Presets (≥ 30): header ×3, hero ×5, features ×3, logos, stats, CTA ×2,
   testimonials ×2, pricing ×2, FAQ, team, gallery, contact, newsletter,
   blog list, product grid (filled by SB-09/10), footer ×3, 404. Thumbnails
   generated by a script that screenshots the fixture route (commit the PNGs,
   ≤ 40 KB each).
3. Themes (5 total): `studio` (clean business), `market` (shop), `editorial`
   (blog), `calm` (booking/wellness), `mono` (portfolio) — plus `bistro`
   (restaurant) if time; each with light + dark tokens and preset variants.
4. Accessibility: headings order, alt text required on images (validator
   warning, not error), focus styles, colour-contrast check of each theme's
   pairs (≥ 4.5:1) in a unit test.
5. Performance budget: a demo page with 20 sections ≤ 90 KB JS (gzip),
   Lighthouse mobile ≥ 90 performance / ≥ 95 accessibility.

**Done when:** the fixture route shows every block and preset in every theme
(light/dark), the budget numbers are in CHANGELOG, the manifest is re-synced to
the backend (`syncManifest.mjs`) in the same piece of work.

---

## SB-09 — Data binding (L)

**Why:** "connect data from their contents" — pages that show the project's
records (README *Binding*, D8).

**Where:** backend `library/siteBuilder/{bindings,resolve}.ts`, `render.ts`,
tenant `POST /site-builder/resolve`; renderer `src/render/bind.ts`,
`src/blocks/collection`, `pagination`, `search`; admin
`_components/{DataPanel,BindingPicker,SourceEditor}.tsx`.

**Change:**
1. Backend resolve: walk the tree, collect `collection` sources, template-page
   source, `content` bindings; run them **through the public API's own list/get
   code** (same filters `field_op=value`, sort, `fields`, published-only and
   read-only rules, populate only what the public API populates) — refuse a
   model whose public API has no `list`/`get` with a validation problem
   ("Turn on the public API for Products to show them on the site" + link).
   `pageSize` ≤ 48, at most 12 collections per page.
2. Template pages: `kind: 'template'`, path with `[param]`, `source`; render
   finds the record or 404s; SEO fields bind to it; sitemap lists records.
3. Renderer: `bind.ts` applies `bind` + `{{ }}` interpolation with the README
   filters (money uses the project's currency from settings); `collection`
   renders its child template per item (grid/list/carousel layouts, `empty`
   slot), `pagination` and `search` update the URL (`?page=`, `?q=`) — server
   rendered, no client fetch needed for the first view.
4. Editor: Data panel lists the project's models with a public read API, their
   fields and sample values; the binding picker on every `bindable` prop
   ("Use data" → record / item / site / content); the canvas shows real data
   via `POST /resolve` (debounced) sent along with `tree`; a collection with no
   records shows its empty slot with a hint.
5. New page "From a model": pick a model → a list page (`/blog`) and a template
   page (`/blog/[slug]`) generated from presets with bindings filled in.

**Done when:** in a blog template project, `/blog` lists published posts with
paging and search, `/blog/<slug>` shows a post with SEO from the record, a
private model can't be bound (validator problem), smoke suite covers resolve
(filters, page sizes, refused models, 404 record), screenshots in CHANGELOG.

---

## SB-10 — Widgets and commerce blocks (M)

**Why:** shop, login, booking on builder pages (D13).

**Where:** renderer `src/blocks/{widget,add-to-cart,price,product-gallery,account-link}`;
admin inspector widget picker (reads `GET /widgets` catalogue + which are on).

**Change:** `widget` block (name from the enabled catalogue, inline/button
layout prop) renders `<div data-mint="<name>">`; `add-to-cart` = button with
`data-mint-add` bound to the item/record id and variant; `price` formats a bound
number with the project currency; `account-link` opens the login widget or
"My orders"; action `{ type: 'widget' }` opens cart/login. Canvas: widgets
render live (mint.js in the iframe) — where mint.js can't reach a localhost API
from the frame, draw a labelled placeholder. Turning a widget on from the
inspector deep-links to `/widgets` (no duplicate settings).

**Done when:** in the ecommerce template project, a builder product grid adds
to cart, the cart opens from the header, checkout reaches Stripe test mode
(existing `payments.mjs` flow), My orders shows; CHANGELOG has the walk-through.

---

## SB-11 — AI (L)

**Why:** "ai would keep the components, styling …" — build and edit with AI (D15).

**Where:** backend `library/siteBuilder/ai.ts` (+ `ai.prompts.ts`), routes
`POST /site-builder/ai` on the tenant router (`build`); admin `_components/AiPanel.tsx`.
Read the `claude-api` skill before writing the client code. Pattern to copy:
`library/controllers/builder/ai.controller.ts` (`@anthropic-ai/sdk`, forced
tool, repair rounds, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`).

**Change:**
1. Requests: `{ mode: 'site', brief, kind?, theme? }` → design + pages
   (+ a feature plan for missing models, built with the existing
   `planFeature`/`buildFeature` after the user confirms); `{ mode: 'page', brief, path }`;
   `{ mode: 'section', brief, after: nodeId }`; `{ mode: 'edit', instruction, selection: nodeId[] }`
   → ops limited to the selection's subtree (+ design if asked).
2. Context sent: the manifest (blocks with `aiHint`, presets list, theme
   keys, style keys), the page's tree (or the selection's), site settings
   (name, contact), the models with public read APIs and their fields. Images
   only from the project's media library or `placeholder:<w>x<h>:<label>`
   (renderer draws a neutral placeholder).
3. Output validated with `validateTree`/`applyOps`; problems are sent back for
   up to 3 repair rounds; still bad → the user sees the problems, nothing applied.
4. Streaming progress (SSE) to the panel: "Choosing a theme… Writing Home…".
5. Panel: AI tab with a prompt box, scope chips (whole site / this page / the
   selection), result preview applied as **one undo step**; nothing is
   published by the AI.
6. Limits: per-organization rate limit (e.g. 30 requests / hour), token caps;
   errors when `ANTHROPIC_API_KEY` is missing say so.

**Done when:** against a fake Anthropic API (`ANTHROPIC_BASE_URL`, as the model
builder's tests do) the smoke suite covers site/page/section/edit, a repair
round, and a refused invalid result; one real run per mode noted in CHANGELOG
(brief, time, tokens) with screenshots.

---

## SB-12 — MCP tools (M)

**Why:** users' own AI (Claude Code etc.) builds sites through `/tenant/mcp`
(as WO-33 did for code-built sites).

**Where:** `backend/library/controllers/mcp/siteBuilder.tools.ts`, registered
beside `website.tools.ts` (website projects only, `ToolDef.only`).

**Tools:** `site_builder_manifest` (blocks/presets/themes, compact),
`list_site_pages`, `get_site_page` (tree), `create_site_page`,
`edit_site_page` (ops), `set_site_design` (theme/tokens/layouts),
`check_site` (= `/changes` problems), `publish_site` (needs a `publish`-capable
key scope — add the scope if the key model lacks one; default off). Every tool
description explains itself and links the guide. `describe_website` mentions
the builder as the no-code path.

**Done when:** `website-mcp.mjs` (or a new `site-builder-mcp.mjs`) builds a
2-page site with a collection through the MCP only, publishes it, and
`/render` returns it.

---

## SB-13 — Site kinds and templates (L) — confirm D4 with the user first

**Why:** "choosing a theme or users can build their website", with widgets
pre-installed per kind (D4, D10).

**Where:** backend `tenantProject.model.ts` (`siteKind`), templates
(`docs/templates/`, `library/controllers/templates/{blueprint,validate}.ts`,
`applyTemplate.function.ts`), admin New project wizard + Template Studio
(`admin/src/app/templates/[id]/_components/`), Get started.

**Change:**
1. `TenantProject.siteKind`: `shop | business | booking | blog | portfolio | restaurant | other`.
2. New project → Website: "What kind of site?" cards (icon, one line, the
   widgets it comes with) → the published templates of that kind (or
   "Start blank" with a theme picker) → create + apply (existing background apply).
3. Blueprint `website.builder` part: `{ design, pages: [SitePage minus ids], presetsUsed[] }`
   + `overview.siteKind`; `widgets` part from W-12 (if W-12 isn't done, add the
   part here: which widgets to switch on and their options). Validator checks
   the trees against the manifest and the bindings against the template's own
   models/endpoints. `applyTemplate` writes `SitePage`/`SiteDesign` drafts and
   publishes them as release 1. Save as template (TD13) captures the builder part.
4. Template Studio: a "Site builder" tab that opens the editor on the
   template's sandbox preview project.
5. Rebuild the website templates (`blog`, `business-site`, `portfolio`,
   `ecommerce`) with builder pages and add `booking-site` and `restaurant`.
   **Publishing templates needs the user's yes** (preview them, list what
   changed, ask).
6. Website sidebar order follows the kind (shop: Products, Orders first).

**Done when:** each kind creates a project whose site renders on the renderer
right away with sample data and the right widgets on; templates suites
(`templates-apply.mjs`) cover the builder part; guide section "Site kinds".

---

## SB-14 — Addresses and custom domains (M) — needs the root domain + hosting answers

**Where:** backend `library/siteBuilder/domains.ts` (Vercel REST:
add/remove/verify domain on `VERCEL_SITES_PROJECT_ID`), tenant routes
`/site-builder/domains`; admin Site setup → Domains card (replaces the plain
`domains[]` list for builder sites); renderer accepts any verified host.

**Change:** default address `<publicSlug>.<SITES_ROOT_DOMAIN>` shown in the
editor and settings; add domain → Vercel → show the DNS records to set
(A / CNAME, TXT verification) → poll verify (on demand, not a cron) → status
chips (pending, verified, misconfigured, SSL ready); a domain can belong to one
project only (unique index on a new `SiteDomain` collection: host, project,
status, verifiedAt); `www` ↔ apex redirect choice; analytics' allowed origins
include verified hosts.

**Done when:** against a fake Vercel API (env `VERCEL_API_BASE`) the suite
covers add/verify/remove/duplicate; one real domain verified on staging if the
user sets one up.

---

## SB-15 — Releases and page tools (M)

History drawer (releases with who/when/note, preview a release in the canvas
read-only, restore with `PromptDialog`), "changed since publish" diff per page
(node-level: added/removed/changed counts), duplicate page, new page from a
preset set or the AI (SB-11), unpublish a page, scheduled publish **not** in
scope.

---

## SB-16 — Final pass: guide and marketing site (M)

Every WO already updated its guide sections and marketing pages (*Docs and
marketing* above). This one reads both end to end once the builder is
complete: fill gaps, `#faq`, cross-links from `/websites`, `/templates`,
`/widgets`, `/connect-ai`; check every panel's "?" link lands on a written
anchor (grep `docsPath('/site-builder` in admin); fresh screenshots where the
UI changed; marketing site flow, OG images, 390 px and dark mode.

---

## SB-17 — Import kit pages (M) — later

Convert `WebPage` + its ordered `WebContent` into builder pages: each content
category → a preset (content → text section, card → card grid, gallery →
gallery, video → video, rich-content → text), SEO from `PageSeo`. Draft only;
the user reviews and publishes.

## SB-18 — Download as a Next.js project (L) — later

A zip of a standalone Next 16 app: the used blocks, the theme, the published
trees as JSON, the data fetched from the public API at request time; README
with deploy steps.

## SB-19 — Developers' own components (L) — later

An SDK (`@mint/sites-sdk`) to register React components with a schema in a
fork of the renderer, published as a separate manifest per project.
