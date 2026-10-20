# MINT CMS — plan (2026-10-15)

Status: **agreed 2026-10-15** — D1 and D8 as the user shaped them; D5 drafts until Publish; engine first (CMS-02…05).
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
| Typed content, by page | content types | one catch-all bag | ✓ D1 (type first, page dropdown, List type) |
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

- **D1 — Contents stay records, typed and grouped by page** (the user's call, 2026-10-15: "keep one content per
  record, but a pages model needs to be there too… pages will be listed on the dropdown, selecting would show that
  specific page only. Content type should be set first then relevant data will be there… we can add a list, for
  example there are projects, so we can list and select a list, number of data to show and the order, also
  conditions can be set").
  - **Pages** (the kit's `WebPage`, scoped to the project like every model): the page is found by its path. The
    Contents screen opens with a **page dropdown**; picking a page shows **that page's contents only**, in their
    order on the page. A "Whole site" choice holds what's on every page (header, footer, a shared strip).
  - **One record per content item** (one section or block group — a hero, a FAQ, a row of cards), not one per
    word. **Its type is set first** — *Hero*, *Text*, *Rich text*, *Cards*, *FAQ*, *Stats*, *Testimonials*,
    *Gallery*, *Video*, *Call to action*, *Logos*, *List*… — and the form then shows **only that type's fields**
    (a Hero: heading, text, buttons, image; Cards: a title and cards with their own fields). Types are components
    (D3), so a project can add its own; the built-in ones come from the site builder's section presets, so every
    section the builder adds gets the right type.
  - **List** type: pick a model (Projects, Services, Posts…), how many to show, the order, and conditions
    (`status is published`, `featured is yes` — the same rule editor as the API builder), and which of its fields
    go where on a card. The builder's list block draws it; the site reads it through the model's public rules.
  - Storage: `WebContent` keeps `name`, `page`, `slug`, `order`, `status` and gains `content` — a dynamic zone (D4)
    of exactly one item, whose component *is* the type. The old catch-all fields (`content`, `subContent`,
    `btnText`, `card[]`, `bgColor`, `fontSize`…) go after migration; styling belongs to the builder's node.
  - Builder binding stays `{ from: 'content', slug, field }`; `field` becomes a path in the item
    (`heading`, `items.2.title`). The builder still edits words in place and adds a typed record with demo words for
    each section it adds (D28's promise kept, its storage tidied).
  - Header, footer, site settings and design become single types (D2).
  - **More blocks in one record** (the user, 2026-10-20: "if we select text and then we need gallery we can add that…
    also why slug is not there?" — CMS-16): `block` holds the record's own item first, then up to 19 more of any type
    but List (`more` on the Contents screen), kept by every write that only changes the first. Text is plain words
    (`textarea`) in every type; only Rich text has the editor. The **slug** is shown, chosen and copied: the builder
    binds by it, and a coded site reads `GET /public/api/web-contents/by-slug/<slug>` or a page's
    `/pages/by-path?path=` (published only), each with `?apiKey=`.
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
- **D8 — Languages, set in Settings** (the user's call: "On settings we can choose how many languages the website
  is going to be, if bilangual is selected then fields for other languages should show otherwise single english").
  Website settings → **Languages**: English alone by default; add others (Bangla, Arabic…) and pick the main one.
  With one language, every form is as it is. With more, each text-like field (text, rich text, slug; inside
  types too) shows an input per language (tabs on the field, or a language switch at the top of the form); images,
  numbers and links stay shared unless a field is marked "translate". Other languages live in
  `_locales.<code>.<field>` on the same record (draft and published); a missing translation shows the main
  language. Publish publishes every language together. API `?locale=bn`; the site serves `/bn/...` with `hreflang`
  and a language switcher; the builder switches language to edit that language's words. App projects get the same
  switch later.
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

## 5. What a content record looks like

```jsonc
// Contents → page "Home" → "Hero" (draft = the record; live = _published)
{
  "_id": "66f…", "_model": "WebContent",
  "name": "Home hero", "page": "66a…", "slug": "home-hero-a1", "order": 1, "status": "published",
  "content": [{ "_key": "a1", "__component": "content.hero",
    "heading": "Bread worth waking up for", "text": "<p>Baked daily…</p>",
    "buttons": [{ "label": "Order now", "url": "/shop", "style": "primary" }],
    "image": { "url": "…/loaf.jpg", "alt": "A sourdough loaf" } }],
  "_locales": { "bn": { "content": [{ "heading": "ঘুম ভাঙার মতো রুটি" }] } },
  "_published": { "at": "2026-10-15T09:00:00Z", "by": "…", "rev": 7, "data": { /* as published */ } }
}

// Contents → page "Home" → "List" of Projects
{ "name": "Recent projects", "page": "66a…", "slug": "home-projects-b2", "order": 4,
  "content": [{ "_key": "b2", "__component": "content.list",
    "title": "Recent work", "model": "projects", "limit": 6, "sort": "-completedAt",
    "when": [{ "field": "status", "op": "is", "value": "published" }, { "field": "featured", "op": "is", "value": true }],
    "match": "all", "card": { "title": "name", "text": "summary", "image": "cover", "link": "/projects/{slug}" } }] }
```

A builder node: `{ "type": "heading", "props": { "text": { "from": "content", "slug": "home-hero-a1", "field": "heading" } } }`.

## 6. Moving existing sites

- A script (and lazily, the first time a project's builder or Contents opens) groups each page's per-word Contents
  records by their section (the builder tree knows which node is in which section), makes one typed record per
  section (`content` → `heading`, `card[]` → `items[]`, a `collection` over a model → a *List* record), rebinds the
  builder trees to the new slugs and paths, publishes what was live (so nothing changes on the site), and archives
  the old records (`migratedAt`). Dry run first; a report per project.
- SEO records stay a model (one per page) and gain draft & publish; site design and settings become single types.
- Templates (docs/templates) and the theme starters (`siteBuilder/starter.ts`) ship typed records.
- Every repo touched: backend, mint-tenant, mint-builder (types, binding paths, language switch), mint-sites (render
  published/draft/language, preview), mint-docs, website, admin (nothing — tenant-only).

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
