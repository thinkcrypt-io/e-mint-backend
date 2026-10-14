# MINT CMS — plan (2026-10-15)

Status: **proposed** — decisions D1–D12 below are recommendations waiting for the user's call.
Work orders: `WORK_ORDERS.md`. Log: `CHANGELOG.md`.

## 1. The user's words

> "for the website cms, currently we have a content model which works, but i think it can be refactored and made
> better. plan and recommend to make it state of the art so that we can cross strapi type cms"

## 2. Today

What a website project's content is made of (docs/site-builder D27, D28; `functions/websiteKit.function.ts`,
`library/siteBuilder/{kit,connect}.ts`):

| Piece | How it works today |
|---|---|
| **Contents** (`WebContent`, `/web-contents`) | One catch-all model with ~25 fields (`content`, `subContent`, `btnText`, `url`, `list`, `card[]`, `richContent`, `image`, `gallery`, `videoUrl`, `bgColor`, `color`, `fontSize`…) and a `category` select. **Every word on the site is its own record**, bound by slug: a heading is one record (`content`), a button another (`btnText`), a grid of cards one record of category `card`. A page with ten sections makes 30–60 records named like `home-hero-heading-3fa9c1`. |
| **Pages** (`WebPage`) | Name, path, status, template, menu — the layout itself lives in the builder's `SitePage` tree (draft → Publish → `SiteRelease`). |
| **SEO** (`PageSeo`) | One record per page. |
| **Site design** (`SiteTheme`) | One record (theme, colours, fonts). |
| **Site settings** | Not a model: `WebsiteSettings` (WO-38). |
| **Lists** | Services, team, products, posts… are ordinary models with a public API. |

Publishing is split in two: the **layout** needs the builder's Publish (with releases and restore), but a **word**
changed in Contents goes live the moment it's saved.

### What already makes MINT strong (keep)

Models with 20+ field kinds, references, `section` / `sectionlist`; per-model roles; record History (who changed
which field); comments and @mentions; webhooks; automations; linked relationships; the API builder (endpoints,
who + rules, server keys, request logs); a media library; customers and sign-in; a visual site builder that edits
the words in place; MCP so the user's own AI builds and fills things. Strapi has none of the visual building,
automations, customers, payments or AI-over-MCP.

### What holds the content back

1. **No types for content.** One 25-field bag for every kind of block: the form shows "Content Management (Text)",
   "(List)", "(Card)", "(Video)"… whatever the record is. A hero and a testimonial look the same to an editor.
2. **Content is shredded.** One record per word. Nobody can open "the home page" and edit it; the Contents
   table is hundreds of fragments in no order. Order, grouping and meaning live only in the builder's tree.
3. **Presentation mixed into content** (`bgColor`, `fontSize`, `color` on a content record).
4. **Cards are fixed**: `title / subTitle / description / image`. A price, a rating, an icon or a link per card
   has nowhere to go.
5. **No draft for content.** An edit in the panel is live at once; there's no review, no "publish when ready", no
   schedule, and no way back.
6. **No versions** a record can be restored to (History shows changes but can't restore them).
7. **One language only.** No locales.
8. **No single types.** The site's settings, design, header and footer are each special-cased.
9. **No preview** of a content change on the real page before it goes live.
10. **Media without meaning**: no alt text, caption or focal point.

## 3. Where Strapi (5) is — and where we land

| | Strapi 5 | MINT today | MINT after this plan |
|---|---|---|---|
| Collection types | ✓ | ✓ models | ✓ |
| Single types | ✓ | — | ✓ D2 |
| Components (reusable field groups) | ✓ | `section`/`sectionlist`, not reusable | ✓ D3 |
| Dynamic zones | ✓ | — | ✓ D4 (`blocks`) |
| UID / slug field | ✓ | text | ✓ D2 |
| Draft & publish per entry | ✓ | — | ✓ D5 |
| Scheduled publishing / Releases | ✓ (paid) | — | ✓ D7 (schedule); releases later |
| Content history (versions) | ✓ (paid) | change log only | ✓ D6, restore + compare |
| i18n | ✓ | — | ✓ D8 |
| Preview | ✓ | builder only | ✓ D9, on the real site |
| Review workflows | ✓ (paid) | comments/mentions | later (§7) |
| REST filters, populate, fields | ✓ | ✓ (API builder) | + `status`, `locale`, `populate` (D10) |
| GraphQL | plugin | — | later |
| RBAC | ✓ | ✓ per model | + **Publish** as its own right (D11) |
| Webhooks | ✓ | ✓ | + `publish` / `unpublish` events |
| Media library | ✓ alt, caption, formats | ✓ no alt | ✓ alt, caption, focal point (D12) |
| **Visual editing on the page** | — (headless) | ✓ builder | ✓ on structured content (D1) |
| **AI** | — | MCP | MCP content tools: fill, translate, SEO (D-AI) |
| Automations, linked records, customers, payments, PDFs | — | ✓ | ✓ |

"Crossing Strapi" = Strapi's structured content model (types, components, zones, draft/publish, versions,
locales, preview) **plus** what a headless CMS can't do: edit that content visually on the page, and let the
user's AI fill and translate it.

## 4. Decisions (recommended)

- **D1 — A page's words live in the page, as typed sections.** Replace "one Contents record per word" with **one
  Page entry per page** whose `sections` field (a dynamic zone, D4) holds the page's sections in order, each a
  typed component: *Hero* {heading, text, buttons[], image}, *Features* {title, items[] {icon, title, text}},
  *Testimonials* {items[] {quote, name, role, avatar}}, *FAQ*, *Stats*, *CTA*, *Gallery*… The component of each
  section comes from the site builder's section presets (their bindable props), so every section the builder can
  add has a matching form. The builder still edits words in place; a bound value points at
  `{ from: 'section', key, path }` (the section's stable key and a path inside it, `items.2.title`) instead of a
  Contents slug. Editors open **Pages → Home** and see the page as a list of sections, each a small form. A grid of
  cards is a repeatable component of its own fields — a price or a rating fits.
  - *Shared sections* (a testimonial strip on five pages): a **Shared sections** collection whose entries a page
    section can point at, edited once.
  - *Header, footer, site settings, design*: single types (D2).
  - *Lists* (services, team, posts, products) stay models of their own — collections, as now.
  - Presentation (`bgColor`, `fontSize`) leaves content: it's the builder's styling on the node.
  - Supersedes D28's storage (not its promise: every word is still content, bound from the start, with demo words).
- **D2 — Single types and a UID field.** A model can be **single** (`kind: 'single'`): exactly one entry, the panel
  opens its form instead of a table, the API answers `GET /<route>` with the entry. **UID** field kind: a slug made
  from another field (`title` → `my-first-post`), unique per model (per locale), editable, checked as you type.
- **D3 — Components.** Per project, a **component** is a named, reusable group of fields (category / name:
  `shared.button`, `shared.seo`, `sections.hero`). A field of kind `component` uses one — single or repeatable,
  min/max. Components can nest one level and may hold references and media. `section` / `sectionlist` stay as the
  inline (one-off) form; a model's inline group can be "made reusable" into a component.
- **D4 — Dynamic zone (`blocks`).** A field of kind `blocks`: an ordered list of components picked from an allowed
  set; each item keeps `__component` and a stable `_key`. Panel: add (picker with previews), reorder, collapse,
  duplicate, hide. API: items in order with `__component`.
- **D5 — Draft & publish per entry, as an embedded snapshot.** A model with **Draft & publish** on (default for
  website content types and every new content type; off for business data — orders, invoices) keeps the record as
  the **draft** and its live version as `_published: { data, at, by, rev }` on the same document. Panel edits and
  saves change the draft; **Publish** copies it into `_published`; **Unpublish** removes it; **Discard changes**
  copies it back. Status: *Draft* (never published), *Published*, *Modified* (draft newer than published). The
  public API, site rendering and webhooks for content read `_published` (filters and rules run on
  `_published.<field>` — one prefix in `publicRecords` / `apiEndpoints`). Ids, references and unique indexes stay
  as they are (why not Strapi's two-rows-per-entry: every reference and query in MINT is by row id — a second row
  would break links, linked relationships and automations). No new collections (one per project, D21).
- **D6 — Versions.** Every publish, and a save at most every 10 minutes, stores a version (`ContentVersion`, one
  shared collection, project-scoped): the whole entry, who, when, which status. Kept: every published version for 1
  year, saves for 30 days, at most 100 per entry. Panel: a Versions drawer — compare any version with now (field
  diff, like History), **Restore** into the draft.
- **D7 — Scheduling.** Publish at / unpublish at, per entry; a minute-tick job on the backend applies them (and
  tells the scheduler). Releases (publish a group of entries together, scheduled) come later (§7).
- **D8 — Locales.** A project has a default locale and others (`en`, `bn`, `ar`…). A field is **localized** or
  shared (an image or a price usually shared). Non-default values live in `_locales.<code>.<field>` on the same
  document (draft and in `_published`); a missing translation falls back to the default. Publish publishes all
  locales together (per-locale publishing later). API `?locale=bn`; the site serves `/bn/...` (mint-sites) with
  `hreflang`; the builder gets a locale switcher.
- **D9 — Preview.** A draft can be seen on the real site: the renderer (mint-sites) takes a short-lived preview
  token and draws the draft content of that page (or entry, through the page that lists it). The entry editor has a
  side-by-side **Preview** that refreshes on save; per model, a preview address (`/blog/{slug}`).
- **D10 — Content API.** Endpoints (API builder) serve published content by default; `status=draft` needs a server
  key or a preview token; `locale`; `populate` of references and components (depth 2, per endpoint); single types as
  `GET /<route>`. Webhooks gain `publish` / `unpublish` events. A publish revalidates the site's cached pages.
- **D11 — Publish is a right of its own.** Per model: *Edit* (drafts) and *Publish* — an editor writes, a
  publisher puts it live. Uses the existing project roles.
- **D12 — Media metadata.** Alt text, caption, focal point (and the width/height already stored) on library files;
  an image field returns `{ url, alt, width, height, focal }` when the model opts in (old shape stays default for
  existing models). No image optimizer (D25 of the site builder stands).
- **D-AI — Content tools over MCP** (the user's own AI, never server-side AI): read/write entry drafts, publish (after
  the user says so), translate an entry into a locale, fill a page's sections, suggest SEO.

## 5. What an entry looks like

```jsonc
// Pages → Home (draft = the record; live = _published)
{
  "_id": "66f…", "_model": "WebPage",
  "name": "Home", "path": "/", "slug": "home",
  "sections": [
    { "_key": "hero-a1", "__component": "sections.hero",
      "heading": "Bread worth waking up for", "text": "<p>Baked daily…</p>",
      "buttons": [{ "label": "Order now", "url": "/shop", "style": "primary" }],
      "image": { "url": "…/loaf.jpg", "alt": "A sourdough loaf" } },
    { "_key": "feat-b2", "__component": "sections.features", "title": "Why us",
      "items": [{ "icon": "wheat", "title": "Local flour", "text": "…" }] },
    { "_key": "shared-c3", "__component": "shared.reference", "section": "67a…" }   // a Shared section
  ],
  "seo": { "title": "Corner Bakery", "description": "…", "image": "…" },            // component shared.seo
  "_locales": { "bn": { "sections": [ /* localized fields only */ ] } },
  "_published": { "at": "2026-10-15T09:00:00Z", "by": "…", "rev": 7, "data": { /* the same, as published */ } },
  "_schedule": { "publishAt": null, "unpublishAt": null }
}
```

The builder's node: `{ "type": "heading", "props": { "text": { "from": "section", "key": "hero-a1", "path": "heading" } } }`.

## 6. Moving existing sites

- A script (and lazily, the first time a project's builder or Pages opens) groups each page's Contents records by
  their section, maps their fields into that section's component (`content` → `heading`, `card[]` → `items[]`…),
  writes them into the Page entry's `sections`, rebinds the builder trees, publishes what was live (so nothing
  changes on the site), and marks the Contents records `migratedAt`. Dry run first; per-project report.
- `WebContent` stays read-only for one release, then goes from the kit. SEO records fold into the page's `seo`
  component (one place to edit a page; a collection entry gets the same component). Site design and settings become single types.
- Templates (docs/templates) and the theme starters (`siteBuilder/starter.ts`) ship section content in the new shape.
- Every repo touched: backend, mint-tenant, mint-builder (binding, section forms, locale switch), mint-sites
  (render published/draft/locale, preview), mint-docs, website, admin (nothing — tenant-only).

## 7. Later (not in this plan)

Review workflows (stages, assignees, "needs approval" before Publish — on top of comments and mentions); Releases
(publish many entries together, scheduled); per-locale publishing; GraphQL; import/export of content (JSON/CSV,
between projects); field-level permissions; rich text as structured JSON blocks; content search across types.

## 8. Risks

- **Every read path** that serves content must read `_published` for draft-and-publish models (public API, API
  builder rules, site resolve, widgets, webhooks, automations' "on publish"). One helper, tested by a smoke that
  calls each path with a draft-only change.
- **Behaviour change for existing sites**: panel edits stop going live on save. The migration publishes the current
  state, and the panel says "Changes not published" loudly.
- **Builder + renderer** move to new bindings in step with the backend; keep reading old `{from:'content'}` bindings
  until every project is migrated.
- Size: the whole plan is ~4–5 weeks of work orders (see WORK_ORDERS.md); each WO ships on its own.
