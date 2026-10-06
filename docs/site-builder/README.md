# Site builder

A visual website builder for **website projects**, in the spirit of Builder.io
/ Framer: pick a theme (or a site kind that comes with one), arrange blocks on
a canvas, style them, bind them to the project's data, let the AI build or
edit anything, and publish to a real Next.js site on our own renderer.

Read this first, then `WORK_ORDERS.md` (Handoff + Status + one spec per work
order) and `CHANGELOG.md`. Paths are from the monorepo root
`/Users/asifistiaque/Desktop/proj/e-mint`.

## The user's words (2026-10-06)

> can we build a website builder? similar to builder.io, where ai would keep
> the components, styling modals/drawers/widgets, and connect to the website
> api/project that we have. we'll have some built in themes, and the core
> technology will be nextjs. choosing a theme or users can build their
> website. connect data from their contents. so that we have a full project
> in website?

Answers given the same day: **one shared renderer**, **blocks with flex/grid**
(not sections-only, not free positioning), **Tailwind v4 + CSS variables**,
the renderer is **its own repo**, plan + work orders written so another agent
can build it. The user asked whether e-commerce / business / booking sites
should be separate project types with widgets pre-installed — answered with
D4 (site kinds); **confirm D4 with the user before SB-13**.

## What already exists (don't rebuild it)

| Piece | Where | Used for |
|---|---|---|
| Website projects (`TenantProject.type === 'website'`, `publicSlug`, `domains[]`) | `backend/library/models/tenancy/tenantProject.model.ts` | the site's identity and address |
| Website settings — identity, colours, font, contact, social, SEO defaults, tracking, head tags, redirects, headers | `WebsiteSettings` via `library/functions/siteConfig.function.ts` (`loadSite`/`saveSite`; secrets `select:false`) | the renderer's `site` part |
| Website kit — `WebPage` `/pages`, `PageSeo` `/seo`, `WebContent` `/web-contents` (builder models) | `library/functions/websiteKit.function.ts` | code-built sites (WO-33); a **data source** for the builder (D6) |
| Site API — `/site`, `/site/tags`, `/site/robots.txt`, `/site/sitemap.xml`, `/pages`, `/pages/by-path`, `/contents` | `routes-public/public.router.ts` | tags, robots, sitemap reused by the renderer |
| Public API per model with admin-style filters (WO-11, WO-40, WO-42) | `routes-public/public.router.ts` | data binding (D8) |
| Widgets runtime `mint.js` + login, cart, checkout, thank-you, My orders | `routes-public/mint.ts`, `routes-public/widgets/*`, `library/functions/widgets.function.ts`, `SiteWidgets` | widget blocks (D13) |
| Payments, carts, orders (server owns prices) | `library/functions/{shop,payments}.function.ts` | shop sites |
| Templates (blueprints, sandbox preview, `applyTemplate`) | `backend/docs/templates/`, `library/functions/applyTemplate.function.ts` | themes + site kinds (D4, D10) |
| Website MCP tools | `library/controllers/mcp/website.tools.ts` | extended in SB-12 |
| "Build with AI" pattern (forced tool + repair rounds, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`) | `library/controllers/builder/ai.controller.ts` | site AI (D15) |
| Tenant panel (admin app, `NEXT_PUBLIC_PANEL=tenant`, project URLs `/<publicSlug>/<page>`) | `admin/`, `admin/src/components/library/config/lib/constants/panel.ts` | the editor lives here (D9) |

## Decisions

| # | Decision | Why |
|---|---|---|
| D1 | **One shared, multi-tenant renderer**: a Next.js 16 app in its own repo **`mint-sites`** (`e-mint/mint-sites`, GitHub `aiasifistiaque/mint-sites`, branch `main`) serves every published site. It maps the request's host to a project, asks the backend for that page, and renders it. No per-site builds. | User's call. Publishing is instant; one deploy to maintain. Download as code comes later (SB-18). |
| D2 | **Pages are trees of blocks laid out with flex/grid** (the node shape below). No absolute positioning. | User's call. Responsive by default; reliably produced by AI. |
| D3 | **Tailwind v4 + CSS variables.** A theme is a set of tokens written as CSS variables on `:root` (light) and `[data-theme=dark]`. Blocks use Tailwind for their *structure* and only token variables for colour, font, radius, shadow, spacing scale. A node's own style is **compiled to one scoped `<style>` block** (`[data-n="<id>"] {…}` + media queries) — **never** generate Tailwind class names at runtime (Tailwind can't see them at build time). | User's call. Theme switch = swap variables; pages stay light. |
| D4 | **Site kinds, not new project types** *(recommended to the user — confirm before SB-13)*. `website` stays the only website project type. New project → Website asks *what kind of site*: Online shop, Business, Appointment booking, Blog, Portfolio, Restaurant. A kind is a **website template** (D10) that installs theme + pages + models + sample data + **widgets** (shop: login, cart, checkout, thank-you, My orders; booking: booking, forms, login; business: contact form, WhatsApp; blog: newsletter, search; portfolio: contact form). Stored as `TenantProject.siteKind` (informational: default suggestions, sidebar order, which presets show first). Widgets can be added or removed any time. | A business site that later sells is just "turn on the shop", not a migration. Reuses templates and W-12's `widgets` blueprint part instead of a second system. |
| D5 | **Blocks live in the renderer repo and describe themselves.** Each block is `mint-sites/src/blocks/<type>/{index.tsx, schema.ts}`. `npm run manifest` writes `block-manifest.json` (block types, props, slots, style keys, presets, themes, icons, `version` hash). The backend keeps a **synced copy** at `backend/library/siteBuilder/blockManifest.json` (`node scripts/siteBuilder/syncManifest.mjs` copies it from `../mint-sites`) and validates every tree against it; the editor and the AI read the manifest from the backend. | One description used by the renderer, the editor's inspector, validation and the AI. The panel doesn't depend on the renderer being deployed. |
| D6 | **New storage, not builder models**: `SitePage` (one per page — path, draft tree, published tree, SEO), `SiteDesign` (one per project — theme, token overrides, layouts = header/footer trees, global sections), `SiteRelease` (snapshot per publish). Shared collections with the `tenantScoped` plugin (like `sitecarts`), so they cost 3 collections in total, not per project. The website kit stays: code-built sites keep using it, and builder pages can bind `WebContent` records as data. | Trees are nested JSON validated against the manifest and published atomically; a builder table would let people break them. The Atlas collection cap (500) rules out per-project collections. |
| D7 | **Draft / publish for the whole site.** Edits autosave to `SitePage.draft` / `SiteDesign.draft` with a `rev` (optimistic concurrency → 409). **Publish** validates everything, copies draft → published for every changed page + design in one go, writes a `SiteRelease` (version++), then calls the renderer's revalidate hook. Rollback = restore a release into published (and draft). | Same mental model as the route builder (`RouteVersion`). |
| D8 | **One render call per request.** `GET /public/api/:slug/render?path=` returns site + design + layout + page tree + SEO + the **data every binding needs, resolved on the server** + widgets config + tags. Bindings may only read models whose public API allows `list`/`get` (same rules and filters as the public API, WO-40/42) — nothing private can reach a page. Client-side refinements (paging, search) call the public list API from the browser. | One round trip, cacheable by tag; the public API is already the security boundary. |
| D9 | **The editor lives in the tenant panel** at `/<publicSlug>/site-builder` (admin app; `site-builder` joins `PROJECT_PAGES`). Its canvas is an `<iframe>` of the renderer's **edit route** `/__mint/edit`, driven entirely by `postMessage` (protocol below): the panel owns the draft, sends `{tree, data, design}`, the renderer draws it with the real blocks and reports selection, hovers, rects and drops. Both sides check origins (`NEXT_PUBLIC_SITES_URL` in the panel, `PANEL_ORIGINS` in the renderer). | What you edit is exactly what ships (same components, same theme), and the admin's Chakra never meets the site's Tailwind. |
| D10 | **Themes are looks; templates are whole sites.** A theme (in `mint-sites/src/themes/<key>.ts`, listed in the manifest) = tokens (light + dark colours, fonts, radius, shadows, spacing, container width, button style) + preferred preset variants. Switching theme never touches content. A **site kind template** (D4) = a theme + pages + models + widgets + sample data, authored in Template Studio (blueprint `website.builder` part, SB-13). | "Choosing a theme" and "starting a shop" are different actions. |
| D11 | **Primitives + smart blocks; sections are presets.** Block *types* are small (section, stack, grid, heading, text, image, button, …) plus a few with real behaviour (header with mobile menu, modal, drawer, tabs, accordion, carousel, collection, widget). Hero / features / pricing / FAQ / footer … are **presets** — saved trees of those blocks in the manifest — so everything inside stays editable. | Builder.io's model; one inspector for everything; themes can ship their own presets. |
| D12 | **Overlays are blocks with ids; actions open them.** Modal, drawer and popover nodes live in the page (or the layout) and are hidden until opened. A button/link's `action` is one of `link` (page, URL, anchor, email, phone), `open` / `close` / `toggle` (a target node id), `scroll` (a node id), `widget` (e.g. add to cart). The outline lists overlays; selecting one opens it on the canvas. | Modals and drawers without code. |
| D13 | **Widgets are blocks.** A `widget` block renders the existing `data-mint="<name>"` element; the renderer loads `/public/mint.js` for the project once. Widget options stay in `SiteWidgets` (panel `/widgets`); the block only places it. Add-to-cart = `data-mint-add` on a button bound to a product. **The server owns prices** (W-05 rule). | No second widget system. |
| D14 | **Responsive styles per breakpoint**: `style: { base, md, lg }` (`md` ≥ 768px, `lg` ≥ 1024px), and `hidden: { base?, md?, lg? }`. Style keys are a **fixed, typed list** (see *Style*) whose values are tokens, enums or numbers with units — never raw CSS strings. | Safe (no CSS injection), small, and the AI can't invent properties. |
| D15 | **AI edits through operations.** The backend calls Claude with forced tools (`build_site`, `write_page`, `edit_nodes`, `write_section`) that return trees or **ops** (`insert`, `update`, `move`, `remove`, `wrap`, `setDesign`) checked against the manifest, with up to 3 repair rounds (the model builder's pattern). The editor applies ops to the draft, so every AI change is one undo step. The same ops are MCP tools (SB-12). | Every AI change can be validated, previewed and undone. |
| D16 | **Sites live on their own domain**, never under the panel's or API's: default address `<publicSlug>.<SITES_ROOT_DOMAIN>` (**`sites.mintapp.shop`**, chosen by the user 2026-10-06), plus custom domains added through the Vercel domains API (SB-14). No "custom HTML/script" block in v1; head code stays in Website settings → Head tags. | A tenant page must never share cookies or an origin with the panel, the API or another tenant's admin. |
| D17 | **Guides and links on every step**: each editor panel and dialog links to its section of the guide on docs.mintapp.shop (`mint-docs`, via `docsPath()`); the marketing site (`mint-webpage`) is updated when the builder ships. | Standing rules: doc links on every step; update the marketing site with every product change. |
| D18 | **Later, not now**: download a site as a standalone Next.js project (SB-18), developers registering their own React components (SB-19), multiple languages, A/B tests, per-page passwords. | Keep v1 shippable. |
| D19 | **Two ways to build a website, both kept.** (a) *Code-built*: the user's AI writes the site's code and keeps its content, SEO and data in the project through the website MCP (WO-33, `describe_website`) — unlimited design, needs a developer and their own hosting. (b) *Builder*: the AI (ours in SB-11, or the user's through SB-12) composes block trees — no code, no build, instant publish, editable by the owner. `describe_website` explains both and when to pick which. | The builder competes with Wix / Framer / Webflow AI, not with hand-written code. Agencies who want something bespoke keep (a), and get SB-19 later. See *Builder vs hand-written sites*. |
| D20 | **The AI sees what it built.** A draft page can be rendered to a screenshot (desktop 1280 + mobile 390, JPEG, small) — SB-20. Our AI (SB-11) gets one *look-and-fix* round after a valid result; the MCP gets a `preview_site_page` tool that returns the image. | Looking at its own output and fixing it is the main reason hand-written AI sites look good; without it the AI composes blind. |
| D21 | **Token budget is a feature.** The manifest the AI reads has two levels: a **catalogue** (one line per block / preset / theme / style group, ≤ 6 000 tokens for the whole manifest) and **details on demand** (a block's full props, a preset's tree, a theme's tokens). Presets are inserted **by key** with prop overrides (`insert` takes `{ preset, props }`), not expanded by the AI. Page trees sent to the AI omit default values. Edits are always ops, never whole trees. Budgets are checked by tests — SB-21. | The user pays with their own AI subscription; ~10× fewer tokens than writing code is our main edge, and an oversized manifest would eat it. |
| D22 | **The preset library is the product.** Targets beyond SB-08: ≥ 60 presets, ≥ 3 genuinely different variants of every section type (hero, features, pricing, testimonials, CTA, footer, header…), ≥ 8 themes that don't look alike (type, colour, radius, density) — SB-23, with a design-review checklist. | The AI can only be as good as the parts it has; 15 presets means every site looks like one of 15. |
| D23 | **Motion and states are style keys too.** Fixed, typed keys for entrance animation (fade/rise/scale/slide, delay, stagger on children), hover states (lift, colour, shadow, scale, underline) and a few effects (backdrop overlay token, blend, sticky) — always respecting `prefers-reduced-motion`, still no raw CSS (D14) — SB-22. | Polish that makes a site feel designed rather than assembled, without opening CSS injection. |
| D24 | **Brand first.** Before writing pages, the AI turns the brand (logo image, colours, words like "calm, premium") into a theme + token overrides + font pair, shown to the user to accept — SB-24. | Most of what makes a site feel bespoke is colour, type and spacing, not layout. |
| D25 | **No image optimizer** — not `next/image`, not `/_next/image`; `images.unoptimized` is on in every Next app (mint-sites, admin, mint-docs, mint-webpage). Images are plain `<img>` straight from the media host (lazy unless `priority`). If smaller copies are ever needed, make them once at upload time and store them next to the original. | User's call (2026-10-06): Vercel bills optimization per image, and the renderer serves every tenant's pictures — the cost grows with every site. |

## Builder vs hand-written sites (asked by the user, 2026-10-06)

> if we have an mcp and we let claude code build the website or claude, will
> the output be similar to what we build in claude code from scratch? and what
> will be our advantages and upperhands? like low token usage and all

**Not the same, by design.** Code written from scratch can do anything, so
the only limit on design is the model. Through the builder the AI arranges our
blocks, presets and themes with typed style keys (D2, D11, D14): every site
comes out responsive and on-theme and can't break, but how good it can look
is capped by our block library. D20–D24 exist to raise that cap.

| | Hand-written (Claude Code, own code) | Builder (SB-11 / SB-12) |
|---|---|---|
| Design freedom | Unlimited | Our blocks, presets, themes, style keys |
| Who can use it | Developers with Claude Code | Anyone, including Claude.ai chat on a phone |
| Tokens, 5-page site (estimate — SB-25 measures it) | ~300k–1.5M (reads, writes, builds, fixes, screenshots) | ~30k–80k (catalogue once, compact trees, presets by key) |
| Tokens, "change the hero headline" | ~10k–30k (grep, read, edit) | ~1k (one `update` op) |
| Build / deploy / hosting | Theirs | None — publish is instant (D7) |
| Breaking the site | Possible | Impossible — validated, repair rounds, undo, rollback |
| Owner edits afterwards | Needs a developer or AI | Everything, in the editor; AI and people edit the same draft |
| Data, login, cart, checkout, payments | To be built | Built in (D8, D13; server owns prices) |
| Bespoke interactions, custom animation, 3D | Yes | No (SB-19 later is the escape hatch) |

**Where we win:** roughly 10× fewer tokens on the user's own subscription,
instant publish with no build or hosting, can't break, editable by the owner,
commerce included, themes swap the look without touching content.
**Where code wins:** one-of-a-kind design and interactions, and avoiding the
"AI template" look — which is why the preset library (D22), the look-and-fix
loop (D20), motion (D23) and brand-first theming (D24) matter more than any
single MCP tool. Marketing claims about tokens and speed quote SB-25's
measured numbers, not these estimates.

## Architecture

```
 tenant panel (admin, Chakra v3)               mint-sites (Next 16, Tailwind v4)            backend (Express, v3)
 /<project>/site-builder                       ─────────────────────────────────            ─────────────────────
 ┌───────────┬──────────────┬───────────┐      proxy.ts: host → publicSlug                  /tenant/api/p/:id/site-builder/*
 │ Pages     │  <iframe     │ Inspector │◀──┐  (GET /public/sites/resolve, 60 s cache)        manifest, pages, design, publish,
 │ Outline   │  /__mint/edit│ Props     │   │                                                 releases, resolve, ai
 │ Add       │   …>         │ Style     │   │  /_s/[site]/[[...path]]  (server)            /public/api/:slug/render?path=
 │ Design    │              │ Data      │   │    fetch render (tag site:<projectId>)          site + design + page + data
 │ AI        │              │           │   │    <RenderTree> + compiled <style>           /public/sites/resolve?host=
 └───────────┴──────────────┴───────────┘   │    SEO metadata, tags, mint.js                /public/mint.js, widgets (exists)
        ▲  postMessage (D9)                 │  /__mint/edit (client, edit mode)            /public/api/:slug/<model> (exists)
        └───────────────────────────────────┘  /api/revalidate  ◀── backend on publish
```

**Request flow (published site):** `acme.example.com/blog/hello` → renderer
`proxy.ts` resolves the host to `acme-store` and rewrites to
`/_s/acme-store/blog/hello` → the page fetches
`GET {MINT_API_URL}/public/api/acme-store/render?path=/blog/hello` with
`next: { tags: ['site:<projectId>'] }` → renders. A redirect from Website
settings answers `{ redirect }`; no page answers 404 and the renderer shows the
site's 404 page (a page at path `/404` if there is one).

**Publish flow:** panel `POST …/site-builder/publish` → backend validates and
copies draft → published, writes `SiteRelease` → `POST
{SITES_RENDERER_URL}/api/revalidate` `{ tag: 'site:<projectId>' }` signed with
`SITE_REVALIDATE_SECRET` (HMAC of the body, header `x-mint-signature`) → the
next request renders fresh.

## Data shapes

### Node (one block on a page)

```ts
type Node = {
  id: string;                  // 8-char nanoid, unique within its tree
  type: string;                // a block type from the manifest ('section', 'heading', 'collection', …)
  name?: string;               // label in the outline
  props: Record<string, any>;  // checked against the block's props
  style?: { base?: Style; md?: Style; lg?: Style };
  hidden?: { base?: boolean; md?: boolean; lg?: boolean };
  bind?: Record<string, Binding>;     // prop key → where its value comes from
  children?: Node[];           // the default slot, only if the block has one
  slots?: Record<string, Node[]>;     // named slots (tabs: one per tab; card: 'media' / 'body'…)
  action?: Action;             // buttons, links, cards, images (D12)
  locked?: boolean;            // can't be moved or removed in the editor
};

type Action =
  | { type: 'link'; href: string; newTab?: boolean }   // '/about', 'https://…', '#node:<id>', 'mailto:', 'tel:'
  | { type: 'page'; pageId: string; newTab?: boolean }
  | { type: 'open' | 'close' | 'toggle'; target: string }  // a modal / drawer / popover node id
  | { type: 'scroll'; target: string }
  | { type: 'widget'; widget: 'cart' | 'login' | 'checkout' | string; op?: 'open' | 'add'; bind?: Binding };
```

Limits (validator, `backend/library/siteBuilder/validate.ts`): ≤ 1,500 nodes
per tree, depth ≤ 30, tree JSON ≤ 512 KB, ids unique, every `type` known, every
prop known and of the right kind, slots only where the block declares them,
`canBeChildOf` respected, action targets exist, URLs only relative / `http(s)` /
`mailto` / `tel` / `#node:` (no `javascript:`), rich text sanitized to an
allowlist (p, h2–h4, strong, em, a, ul, ol, li, br, blockquote, code), embeds
only from the manifest's allowlist (YouTube, Vimeo, Google Maps).

### Style

Fixed keys; values are tokens, enums or `{ n, unit }` (exact names and allowed
values: `mint-sites/src/types.ts` `Style` and the manifest's `style` part):

```
layout     display (block|flex|grid|none) · direction · wrap · gap · align · justify · columns (1–12) · colSpan · rowGap
spacing    padding / margin (each side) — a step of the token scale (0, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32) or 'auto' for margins
size       width · maxWidth (token: prose|sm|md|lg|xl|container|full) · minHeight · height · aspectRatio
background color token · image (media URL) + position/size/overlay token · gradient (two tokens + angle)
border     width (0–4) · color token · radius token · shadow token
type       size token (xs…6xl) · weight (300–800) · align · color token · leading · tracking · transform
effects    opacity · position (static|relative|sticky top) · zIndex (0–50) · overflow
```

`compileStyles(tree)` (renderer `src/render/compileStyles.ts`, mirrored as a
check in the backend validator) turns these into `[data-n="<id>"] {…}` rules
with `@media (min-width: 768px)` / `(min-width: 1024px)`.

### Binding

```ts
type Binding =
  | { from: 'record'; field: string }               // template pages: the page's record ('title', 'author.name')
  | { from: 'item'; field: string }                 // inside a collection: the current item
  | { from: 'site'; field: string }                 // Website settings ('identity.name', 'contact.phone')
  | { from: 'content'; slug: string; field: string } // a WebContent record of the kit, by slug
  | { from: 'customer'; field: string };            // the signed-in customer (client-side only, via mint.js)
```

String props may also interpolate: `"By {{record.author.name}} · {{record.createdAt | date}}"`.
Paths only — no expressions. Filters: `date`, `datetime`, `money`, `number`,
`upper`, `lower`, `truncate:n`, `default:'…'`. A missing value renders empty.

**Collections** (the `collection` block) have
`props.source = { model, filter: { field_op: value }, sort, limit, pageSize, search?: boolean }`
using the public API's own filter syntax (WO-40); their `children` is the item
template, rendered once per record with `item` in scope; `slots.empty` shows
when there are none. **Template pages** have `source = { model, match: { param: 'slug', field: 'slug' } }`
and a path with one parameter (`/blog/[slug]`); the record is `record` in scope,
SEO can bind to it, no record = 404.

### SitePage, SiteDesign, SiteRelease (`backend/library/models/siteBuilder/`)

```ts
SitePage {
  organization, project,                 // tenantScoped
  name, path,                            // '/', '/about', '/blog/[slug]'; unique per project
  kind: 'static' | 'template',
  source?: { model, match: { param, field } },   // template pages
  layout: string,                        // a key in SiteDesign.layouts, default 'default'; 'none' = no header/footer
  draft:     { tree: Node[], seo: Seo, rev: number, updatedAt, updatedBy },
  published: { tree: Node[], seo: Seo, version: number, publishedAt } | null,
  status: 'draft' | 'published' | 'unpublished',
  showInMenu: boolean, menuLabel?, priority: number,
  isHome: boolean                        // exactly one; path '/'
}
Seo { title, description, image, noIndex, canonical, keywords[] }  // template pages may bind (Binding)

SiteDesign {                              // one per project
  organization, project,
  draft:     { theme: string, tokens: Partial<Tokens>, layouts: { [key]: { header: Node[], footer: Node[] } },
               sections: { [id]: { name, tree: Node[] } }, rev },
  published: { …same, version } | null
}

SiteRelease {                             // one per publish
  organization, project, version, note, publishedBy, publishedAt,
  design: SiteDesign.published, pages: [{ page, path, tree, seo }]   // full snapshot (rollback)
}
```

Indexes: `SitePage {project, path}` unique, `{project, isHome}`;
`SiteDesign {project}` unique; `SiteRelease {project, version}` unique. Keep the
last 50 releases per project (older ones are pruned on publish).

### Block manifest (`mint-sites/block-manifest.json`)

```ts
{
  version: string,                       // hash of the content
  blocks: [{
    type, label, category: 'layout'|'basic'|'media'|'navigation'|'overlay'|'data'|'commerce'|'form'|'widget',
    icon, description, aiHint,           // aiHint: one or two sentences for the model
    props: PropDef[],
    slots?: { children?: { allow?: string[] }, [name: string]: { label, allow?: string[] } },
    canBeChildOf?: string[],
    style: 'all' | StyleGroup[],         // which style groups the inspector shows
    defaults: { props, style?, children? },
    client?: boolean                     // needs JS on the page (modal, carousel…)
  }],
  presets: [{ key, label, category: 'header'|'hero'|'features'|'cta'|'pricing'|'testimonials'|'faq'|'team'|'stats'|'logos'|'contact'|'blog'|'products'|'footer'|…, kinds?: SiteKind[], themes?: string[], thumbnail, tree: Node[] }],
  themes: [{ key, label, description, tokens: Tokens, preview: { bg, fg, primary, font } }],
  tokens: TokensSchema,                  // which keys a theme has and their kinds
  style: { [key]: { group, kind, values?, min?, max?, also?, units? } },  // the fixed style keys (src/render/styleSchema.ts)
  icons: string[],                       // the curated icon names (≤ 200; drawn from the renderer's own map)
  embeds: string[],                      // allowed embed hosts
  limits: { maxNodes, maxDepth, maxBytes }
}

PropDef = { key, label, kind: 'text'|'textarea'|'richtext'|'number'|'boolean'|'select'|'color'|'image'|'images'
            |'video'|'link'|'icon'|'page'|'model'|'field'|'list'|'source', options?, default?, help?,
            bindable?: boolean, min?, max?, fields?: PropDef[] /* list */ }
```

## Render API (backend → renderer)

```
GET /public/sites/resolve?host=acme.example.com
  → { slug, projectId }                                     404 if no site claims the host

GET /public/api/:slug/render?path=/blog/hello[&page=2&search=…]
  → {
      projectId, version,                                   // SiteRelease version (cache key)
      redirect?: { to, status },                            // from Website settings → redirects
      site:   { name, tagline, logo, favicon, locale, contact, social, colorScheme, origin },   // no secrets
      design: { theme, tokens, fonts: [{ family, weights }] },
      layout: { header: Node[], footer: Node[] } | null,
      page:   { id, path, name, tree: Node[], seo: SeoResolved },
      data:   { record?: object, nodes: { [nodeId]: { items, total, page, pageSize } }, contents: { [slug]: object } },
      menu:   [{ label, path, children? }],                  // pages with showInMenu
      links:  { [pageId]: path },                           // for { type: 'page' } actions
      tags:   { head, bodyStart, bodyEnd,                   // HTML: verification metas + the track.js tag
                verification: { google, bing },             // structured, for the renderer's metadata
                tracker: { src, project } | null },         // track.js loads pixels + the tenant's code tags
      widgets:{ enabled: string[], apiBase }                // load mint.js when non-empty
    }
  404 { error: 'not-found' } when no published page matches (the renderer then asks for '/404')

Cache-Control: public, max-age=30 (the renderer caches by tag and is revalidated on publish)
The renderer sends x-mint-renderer: <SITE_REVALIDATE_SECRET> (skips the per-IP limit).
```

Path matching: exact static path first, then template paths in `priority`
order (`/blog/[slug]` matches `/blog/hello` with `slug = hello`).

## Editor ↔ canvas protocol (`postMessage`, D9)

Every message is `{ mint: 1, type, …payload }`; each side ignores messages from
any other origin.

| Direction | type | payload |
|---|---|---|
| canvas → panel | `ready` | `{ manifestVersion }` |
| panel → canvas | `init` | `{ design, layout, page: { tree, seo }, data, site, device, theme: 'light'|'dark', readOnly? }` |
| panel → canvas | `tree` | `{ tree, layout?, data? }` — after every change (whole tree; small enough) |
| panel → canvas | `design` | `{ design }` |
| panel → canvas | `select` / `hover` | `{ id | null }` |
| panel → canvas | `open` | `{ id | null }` — show an overlay node |
| panel → canvas | `drag` | `{ x, y, item: { types, label } }` — a drag from the Add panel is over the canvas (x / y in the canvas's viewport) |
| panel → canvas | `dragend` | `{}` — stop drawing the drop line (the panel inserts at the last `dropTarget`) |
| canvas → panel | `click` | `{ id, shift }` |
| canvas → panel | `hover` | `{ id | null }` |
| canvas → panel | `rects` | `{ [id]: { x, y, w, h } }` — selected + hovered, after layout/scroll |
| canvas → panel | `dropTarget` | `{ target: { parentId, slot?, index } | null, reason? }` — while dragging; `reason` says why it can't go there |
| canvas → panel | `move` | `{ id, parentId, slot, index }` — a drag inside the canvas |
| canvas → panel | `text` | `{ id, prop, value }` — inline text edit (double click a heading / text / button) |
| canvas → panel | `height` | `{ px }` |
| canvas → panel | `key` | `{ key, meta, ctrl, shift, alt }` — a shortcut pressed while the canvas has the focus (SB-06) |

The canvas never saves; the panel owns the draft, undo/redo and autosave.

## Site kinds (D4 — to be confirmed)

| Kind | Theme default | Pages | Models (from templates) | Widgets |
|---|---|---|---|---|
| `shop` Online shop | Market | Home, Shop, Product `/products/[slug]`, Cart, Checkout, Thank you, Account, About, Contact | products, categories, orders (existing `ecommerce` template) | login, cart, checkout, thank-you, my-orders (+ search W-18) |
| `business` Business | Studio | Home, About, Services, Service `/services/[slug]`, Contact | services, team, testimonials (`business-site`) | contact form (W-08), WhatsApp (W-10) |
| `booking` Appointment booking | Calm | Home, Services, Book, Account, Contact | services, staff, bookings (`booking-api`) | booking (W-09), login, my bookings (W-15) |
| `blog` Blog | Editorial | Home, Post `/blog/[slug]`, Category `/category/[slug]`, About | posts, categories, authors (`blog`) | newsletter (W-08), search (W-18) |
| `portfolio` Portfolio | Mono | Home, Work, Project `/work/[slug]`, About, Contact | projects, testimonials (`portfolio`) | contact form (W-08) |
| `restaurant` Restaurant | Bistro | Home, Menu, Reservations, Contact | dishes, menu sections, reservations (new template) | booking/reservations (W-09), WhatsApp |

Widgets that aren't built yet (W-08 forms, W-09 booking, W-10 WhatsApp, W-15,
W-18) show in the kind's template as "coming soon" and are installed when they
ship — the kinds don't wait for them.

## Where things are (fill in as work orders land)

| What | Where |
|---|---|
| Plan, decisions, contracts | `backend/docs/site-builder/README.md` (this file) |
| Work orders, Handoff, Status | `backend/docs/site-builder/WORK_ORDERS.md` |
| Changelog | `backend/docs/site-builder/CHANGELOG.md` |
| Renderer repo | `mint-sites/` (SB-02, SB-04) — see its README ("How a published page is served"); proxy `src/proxy.ts`, published pages `src/app/%5Fs/[site]/`, revalidate `src/app/api/revalidate`, backend calls `src/lib/api.ts`; blocks `src/blocks/<type>/`, renderer `src/render/`, themes `src/themes/`, presets `src/presets/`, manifest `block-manifest.json` (`npm run manifest`), fixture `/__mint/fixture` |
| Models | `backend/library/models/siteBuilder/{sitePage,siteDesign,siteRelease}.model.ts` (collections `sitepages`, `sitedesigns`, `sitereleases`) |
| Manifest copy + loader | `backend/library/siteBuilder/blockManifest.json` (`node scripts/siteBuilder/syncManifest.mjs`), `manifest.ts` (`loadManifest`, `publicManifest`, `presetTree`) |
| Validator | `backend/library/siteBuilder/validate.ts` (`validateTree`, `validateDesign`, `validatePageFields`; problem levels error / publish / warning) |
| Ops, ids | `backend/library/siteBuilder/ops.ts` (`applyOps`, `splitOps`), `ids.ts` (`newId`, `rekeyTree` — keeps actions pointing inside a copied tree) |
| Starter site, views, changes | `backend/library/siteBuilder/site.ts` (`ensureSite`, project hooks, `siteChanges`, `siteProblems`) |
| Publish, restore, revalidate | `backend/library/siteBuilder/publish.ts` |
| Render, host → site | `backend/library/siteBuilder/render.ts` (`renderPage`, `resolveHost`, `isRenderer`) |
| Tenant API | `backend/routes-tenant/siteBuilder.router.ts` → `/tenant/api/p/:projectId/site-builder` |
| Public render + resolve | `backend/routes-public/public.router.ts` (`GET /public/api/:slug/render`) and `routes-public/index.ts` (`GET /public/sites/resolve`); the site's `/site/sitemap.xml` lists builder pages |
| Unit tests | `backend/library/siteBuilder/test/{ops,validate}.test.ts` (`npx jest library/siteBuilder --watchAll=false`) |
| Editor | `admin/src/app/site-builder/` (page + `_components/`), RTK `admin/src/components/library/store/services/siteBuilderApi.ts` (SB-05); SB-06: `AddPanel.tsx`, `edit.ts` (new blocks, preset copies, `placeFor`, `placeProblem`, clipboard), outline drag in `Outline.tsx`, commands + shortcuts + panel drags in `SiteBuilder.tsx`; SB-07: `StylePanel.tsx` (per breakpoint), `DesignPanel.tsx` (themes, tokens), `LayoutsPanel.tsx` (layouts, saved sections), `useDesign.ts` (design draft + parts), `designTokens.ts` |
| Themes, fonts, saved sections (renderer) | `mint-sites/src/themes/{studio,editorial,bright,fonts}.ts`; `src/blocks/section-ref/` (draws a saved section); `SiteDocument` `sections` + `usedSections` |
| Canvas editing (renderer) | `mint-sites/src/edit/` — `EditRoot.tsx` (selection, handle drag, inline text, overlays, key forwarding), `drop.ts` (drop targets + `placeProblem`), `protocol.ts` |
| Overlays | blocks `mint-sites/src/blocks/{modal,drawer,popover}/` (native `<dialog>` / `popover`), live script `src/render/overlays.ts` (printed only on pages with one), styles in `globals.css` |
| Smoke suite | `backend/scripts/tenancy-smoke/site-builder.mjs` (in `run-all.sh`) |
| Guide | `mint-docs/src/app/site-builder/page.tsx` → docs.mintapp.shop/site-builder (anchors added with each WO) |

## Environment

| Var | Where | What |
|---|---|---|
| `SITES_RENDERER_URL` | backend | the renderer's base URL (revalidate calls) |
| `SITE_REVALIDATE_SECRET` | backend + renderer | HMAC secret for `/api/revalidate` |
| `SITES_ROOT_DOMAIN` | backend + renderer | default site addresses `<publicSlug>.<root>` |
| `VERCEL_TOKEN`, `VERCEL_SITES_PROJECT_ID`, `VERCEL_TEAM_ID?` | backend | custom domains (SB-14) |
| `MINT_API_URL` | renderer | the backend base URL |
| `PANEL_ORIGINS` | renderer | comma list of panel origins allowed to drive `/__mint/edit` |
| ~~`MEDIA_HOSTS`~~ | — | removed 2026-10-06 with the image optimizer (D25) |
| `NEXT_PUBLIC_SITES_URL` | admin | the renderer's base URL (canvas iframe, "View site") |

## Open questions for the user

1. **D4 site kinds** instead of separate project types — confirm before SB-13.
2. ~~**Sites' root domain**~~ — answered 2026-10-06: **`sites.mintapp.shop`**
   (sites at `<publicSlug>.sites.mintapp.shop`; the bare host serves the
   canvas `/__mint/edit` and `/api/revalidate`). Vercel needs both
   `sites.mintapp.shop` and `*.sites.mintapp.shop` on the mint-sites project;
   the wildcard certificate needs `sites` NS-delegated to
   `ns1/ns2.vercel-dns.com`. Note: tenant pages share the registrable domain
   `mintapp.shop` with the panel — never set cookies on `.mintapp.shop`.
3. **Hosting plan** — the renderer serves customers' sites and custom domains;
   Vercel's Hobby plan is for non-commercial use and caps domains per project,
   so production likely needs Vercel Pro (or another host). Needed by SB-14.
