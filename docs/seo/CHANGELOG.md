# SEO engine and editor — changelog

## 2026-10-28 — SEO-14 Link preview checker

- **`library/functions/linkPreview.function.ts`:** `linkPreview(project, doc, models, url)` reads an address the way
  the share apps do — siteCheck's `fetchPage` (redirects followed, private addresses refused, no JavaScript) — then
  `shareTags` (the first of each tag in the head, entities decoded), the share image downloaded (≤ 10 MB, each redirect
  checked) and measured with sharp, and `cards` for Facebook, LinkedIn, WhatsApp, X and Slack with each app's
  fallbacks (og → `<title>` / description, twitter:* → og:*) and layout: big picture, small thumbnail or text only
  (Facebook big from 600×315, none under 200×200; WhatsApp drops pictures over 600 KB; X big only with
  `summary_large_image`).
- **Problems** (`previewProblems`): no title / description / image, a relative og:image, an image too small, too
  heavy (8 MB Facebook, 5 MB X and LinkedIn, ~300 KB WhatsApp), the wrong shape or type, a long title or description,
  no twitter:card or og:site_name, og:url elsewhere, a redirect. **Tags only added in the browser:** a page of this
  project added to SEO here whose server HTML lacks that SEO (the snippet's `data-seo` named; builder pages skipped —
  mint-sites prints theirs), and any page that's a JavaScript app's empty shell (`isAppShell`).
- **`POST /site-config/link-preview { url }`** — any address; a path is the site's. `mint` names the page's SEO record
  (Edit SEO) when the address is on the project's domain. siteConnection's `target` now refuses `ftp://` and the
  like instead of making `https://ftp//…`.
- **Panel:** Site setup → Link previews (`app/t/_seo/LinkPreview.tsx`): the address box, the problems,
  the five cards, the page's tags with the image's size, Edit SEO / Add SEO, and Facebook's and LinkedIn's own tools
  to make them read the page again. `?url=` checks at once. An SEO record's page has a **Link preview** tab with the same checker
  (`app/t/_seo/LinkPreview.tsx` `LinkPreviewChecker`), filled with its live address and checked when opened (a
  template page's folder to finish; no Edit SEO for itself).
- **Guide:** mint-docs `websites#link-preview`. **Website:** a changelog entry.
- **Tests:** smoke `scripts/tenancy-smoke/seo-link-preview.mjs` (25) against a local pretend website: a correct page
  (five big cards, no problems), a bare page, a JavaScript shell flagged, a tiny relative image with a long title, a
  square image, a redirect, a 404, nothing typed, `ftp://`, a connected page whose SEO is only added by the snippet
  (flagged, its record named) beside one whose server prints `/site/head` (not flagged). `site-connect-head` and
  `site-connect-edge` smokes pass. In the panel: both pages checked, Edit SEO opens the record, the record page's
  Link preview tab (opened from a link before the page loads too), phone width.
  - **Not run:** real Facebook / LinkedIn / WhatsApp / X / Slack shares — the cards are drawn from the tags the way
    each app lays them out today.

## 2026-10-27 — SEO-04 Structured data forms

- **`library/siteBuilder/schema.ts`:** `schemaProps(type, data, {origin, title, siteName, logo})` turns a form's values
  into schema.org properties: Organization / LocalBusiness (name and logo fall back to the site's, PostalAddress,
  `sameAs`, and for LocalBusiness a business kind as its `@type`, price range, `hasMap`, `openingHoursSpecification`);
  Product (Brand, sku, image, Offer with price, currency, availability URL; `aggregateRating` only with a count);
  Article / BlogPosting (headline, author Person, dates, image, the site as publisher); FAQPage (complete pairs only);
  Event (dates, status, attendance mode, Place / VirtualLocation / both, offer with the tickets link, performer,
  organiser); Service (type, area, provider, offer). An empty form makes nothing. `fillDeep` fills `{{record.…}}`
  inside it; `schemaDataProblem` (one object, ≤ 20,000 characters).
- **Saved as `schemaData`** beside `schemaType` on a page's SEO (EMPTY_SEO, `SitePage` seo subschema, `vseoToPage` /
  `pageToVseo`, so the kit SEO record and Site setup's Default SEO carry it too). The home page with type auto takes
  the site's type and its form. A builder save that leaves `schemaData` out keeps the saved one.
- **Out:** the render answer's `page.seo.schemaProps` (template pages filled per record first); mint-sites
  `JsonLd.tsx` merges it over the generated block, the custom JSON-LD still on top. `/site/head` merges it into
  `jsonLd` the same way. MCP `save_site_page`'s `seo.schemaData` (described per type).
- **`GET /site-config/seo-page`** for a template page returns `record: { model, title, fields }` for the panel's
  `{ }` menu.
- **Panel:** VSeo → Structured data: a form per type (`VSeo/schemaForms.ts`, `VSeo/SchemaForm.tsx`) with opening
  hours and FAQ editors, "Google needs" / "Would help" from what's filled, a `{ }` menu on template pages, a link to
  Google's Rich Results Test (a record's page for template pages), the JSON box under "Advanced: your own JSON-LD".
  Event added to the type list. Fixed on the way: the shared Dropdown's search box took its Field's control id — the
  id Select gives its hidden `<select>` — so picking from a long list inside a Field crashed the page.
- **Guide:** mint-docs `websites#seo-structured`. **Website:** a changelog entry.
- **Tests:**
  - unit `library/siteBuilder/test/schema.test.ts` (9): each type against Google's required properties, bindings,
    the round trip and the home page fallback (siteBuilder tests: 61 pass);
  - smoke `scripts/tenancy-smoke/seo-schema.mjs` (23): forms over MCP, a non-object refused, the render answer for
    LocalBusiness / FAQ / a template Product bound to a record, the record's fields for the menu, a builder save keeps
    the form, the SEO record carries and edits it, `/site/head` for a connected page's Service, Default SEO;
  - `site-builder`, `site-builder-seo`, `site-builder-seo-panel`, `seo-score-page`, `seo-sitemap`, `seo-robots`,
    `site-connect-head` smokes pass;
  - in the panel: picking LocalBusiness shows the form, filling the city and hours updates the notes, saved; a
    template page's `{ }` puts `{{record.maker}}` in Brand; phone width in dark mode.
  - **Not run:** Google's Rich Results Test itself — it needs a published, public address.

## 2026-10-27 — SEO-09 robots.txt editor

- **`robots.function.ts`:** `CRAWLERS` (Googlebot, Bingbot, Google-Extended, GPTBot, ChatGPT-User, ClaudeBot,
  PerplexityBot, CCBot, Bytespider, Applebot-Extended — id, agent, owner, search/ai, what for), `robotsSettings()`,
  `buildRobots()`, `robotsProblems()`. No imports; `siteConfig.function.ts`'s `robotsTxt` is now `buildRobots` on the
  saved settings and the site's origin.
- **Settings:** `WebsiteSettings.seo.robotsMode` ('built' default | 'custom'), `robotsFile` (up to 20,000 characters,
  not trimmed), `robotsBlock` (crawler ids, unique, unknown ones refused). Saved with `PUT /site-config` `{ seo }`, so
  the MCP's `update_site_settings` takes them too (its description names them).
- **Built for you:** `User-agent: *` with `Allow: /` (or `Disallow: /` while indexing is off), the extra rules right
  under it, then `User-agent: <agent>` / `Disallow: /` per blocked crawler (none while indexing is off), then the
  Sitemap line. Extra rules come before the crawler groups so they stay in the `*` group.
- **Written in full:** served exactly (a final newline added), whatever indexing, the switches and the extra rules say.
  The public route sends `X-Mint-Robots: custom`; mint-sites' `/robots.txt` then doesn't append its Sitemap line.
- **The check:** the whole site blocked for `*` (error, while indexing is on); Googlebot or Bingbot blocked; no Sitemap
  line (sitemap on); a Sitemap line without a full address; Noindex lines; lines that aren't rules or fields crawlers
  don't know; rules before any User-agent; a file with no User-agent at all.
- **Endpoint:** `POST /site-config/robots-preview` (website projects, readers): the draft's settings over the saved
  ones → `{ mode, text, problems, notes, crawlers, origin }`. Notes: the Sitemap line waits for a domain (built, no
  origin); indexing off still means noindex pages (custom).
- **Panel:** Site setup → SEO → robots.txt card (`site-setup/_components/Robots.tsx`): Built for you / Write the whole
  file; switches for search engines and AI crawlers; extra rules (moved here from the Indexing card); the file and
  the check, updated 300 ms after each change. Writing the whole file starts from the built one.
- **Guide:** mint-docs `websites#robots`. **Website:** a changelog entry.
- **Tests:**
  - unit `library/siteBuilder/test/robots.test.ts` (6): the built file, indexing off, no origin, the written file,
    the mistakes, the crawler list;
  - smoke `scripts/tenancy-smoke/seo-robots.mjs` (20): the default file; each of the ten switches changes the served
    file; extra rules and two blocks in order; read back; an unknown crawler refused; the preview uses the draft and
    saves nothing; a bad written file's problems; the written file served exactly, also with indexing off; back to
    built; too long and an unknown mode refused; 401; 404 on an app project;
  - `site-builder`, `site-builder-seo`, `site-connect-edge` smokes pass; `website-mcp`'s robots checks pass (its one
    failure is the unrelated upsert_page one);
  - in the panel: a switch updates the preview and, saved, the served file; Write the whole file starts from it and the
    check flags a Noindex line; Discard; phone width in dark mode.

## 2026-10-27 — SEO-08 Sitemap: item pages, sitemap index, images

- **`sitemap.function.ts`:** `sitemapEntries()` builds the list; `GET /site/sitemap.xml` (public.router.ts) is now just
  that plus `sitemapResponse()`.
- **Template pages' records:** each published builder template page (`/blog/[slug]`) lists the records of its source
  model the site may read (the model's public API `get` rules through `siteReach`, published values for a drafts model
  via `liveFind`), at most 50,000 a page, as `/blog/<value>` (encoded; the renderer decodes it), with the record's
  `updatedAt` and the page's priority / change frequency.
  - Left out: a template page hidden from search or taken out of the sitemap; a record with `noIndex: true` or an SEO
    editor object saying noindex; a record with no value, or one with a `/` in it.
  - A kit Pages record at a template address (`/blog/[slug]`) is no longer listed as it is (it used to be).
- **Images:** `<image:image>` for each address: a static page's own share image (builder page SEO, else its SEO record's
  image); a record's first image field the public API shows (a `{{record.x}}` share image would be filled per record,
  but the builder refuses bindings in the share image today). Relative images get the site's origin.
- **Extra addresses:** `WebsiteSettings.seo.sitemapExtra` (up to 1,000; each `/path` or `http(s)://…`). Listed when it's
  a path or a full address on the site's own domain (www or not); others are ignored. Panel: Site setup → SEO →
  Indexing → Extra sitemap addresses (one per line, shown while the sitemap is on).
- **Parts:** over 5,000 addresses `/sitemap.xml` is a `<sitemapindex>` of `/sitemap.xml?part=N` (each with its newest
  date); `?part=N` answers that part, 404 past the end. At most 100,000 addresses in all.
  - mint-sites' `/sitemap.xml` route and the mint-edge Worker (1.0.1) pass `part` on; a self-served site has to too
    (guide says so).
- **Guides:** mint-docs `websites#indexing` and the site-builder SEO table. **Website:** a changelog entry.
- **Tests:**
  - unit `library/siteBuilder/test/sitemap.test.ts` (5): the XML with images and escaping, one sitemap up to 5,000,
    the index and parts past it, an empty site's part 1, extra addresses;
  - smoke `scripts/tenancy-smoke/seo-sitemap.mjs` (26): a blog's posts listed with dates and covers, the hidden post and
    the slugless one left out, an encoded slug (and the renderer opening it), no template address, a hidden template
    page, a kit page hidden by its SEO record, extra addresses (saved, refused when not an address, read back, other
    domains ignored, no duplicates), `?part=1` / `?part=2`, the sitemap switched off;
  - `site-builder`, `site-builder-seo`, `site-builder-seo-panel` smokes pass; `website-mcp`'s sitemap checks pass (its
    one failure, "a bad page is refused", is in upsert_page, not touched here);
  - mint-edge `test/edge.test.mjs` passes, with three new checks: Mint's sitemap switched on, `?part=1` passed on,
    `?part=2` falling back to the site's own;
  - in the panel: the Extra sitemap addresses box saves, and the sitemap lists both lines.

## 2026-10-27 — SEO-20 An SEO record's own page (tenant panel)

- **Where:** `/<project>/seo/<id>` in a website project: `mint-tenant/src/app/t/_seo/SeoRecordPage.tsx`, picked in
  `app/view/[slug]/[id]/page.tsx`. Other projects' records keep the generic page.
- **The page:** the SEO editor's five parts as cards with jump buttons; beside them (sticky on wide screens) the score,
  the Google and shared-link previews, and "Across the site": the health problems (SEO-03) this page is part of, linked
  to the other pages, as of the last save.
- **Saving:** edits stay in the page until Save or ⌘S / Ctrl+S; a bottom bar offers Discard and Save while there are any,
  and leaving asks first. Empty values count as unset, so typing and deleting isn't a change. Saves `{ seo }` with
  the usual `PUT /seo/:id`; the kit's save hook fills the plain fields.
- **Header:** "SEO · <page name>", the score as the badge, the page's path, **Page** (its Pages record), **View on
  site** (when the site has a domain and the path isn't a template), Save. `RecordView` takes `noEdit` to hide its Edit
  dialog here; Overview, Comments and History are the other tabs.
- **Shared parts:** VSeo's fields, the score card and the score's inputs moved to `VSeo/parts.tsx`
  (`useSeoAnalysis`, `useSeoSetters`, `Seo*Fields`, `SeoScore`); VSeo is now just its tabs around them.
- **Fixed on the way:**
  - the health card linked records as `projectHref('/seo/<id>')`, which isn't a project page and opened the wrong
    address; it's `/view/seo/<id>` now;
  - the dev-only crash on SEO record pages: the `url` kind arrives as type `uri`, which `assertSchema` didn't know.
    `uri` is now in `PLANNED_FIELD_TYPES`.
- **Guide:** mint-docs `websites#seo-page`, linked from the page. **Website:** a changelog entry.
- **Tests:** in the panel on a seeded site: the score from the builder words, a live score change while typing, the
  unsaved bar, ⌘S saving (`seo.focusKeyword` stored, the shared-keyword problem gone after the health refetch), the
  Overview tab opening without the crash, the health card's link, phone width in dark mode with no sideways scroll,
  and the create form's editor still working.

## 2026-10-27 — SEO-03 Site SEO health card

- **`seoIssues()`:** `library/functions/seoIssues.function.ts`, the shared check list SEO-02 and SEO-19 are to reuse.
  It reads published kit Pages, their SEO records (the six plain fields, else the SEO editor's object) and Site setup.
- **Problems found:**
  - errors: the whole site hidden; a canonical on the site's own domain (www or not) to a path that isn't a published page;
  - warnings: hidden but in the menu; the same title, description or focus keyword on several pages (case and spaces
    aside); no title of its own; no description; no share image when the site has none;
  - notices: titles over 60 and descriptions over 160 characters; no share image when the site has one; hidden pages;
    published pages with no SEO record.
- **Template pages** (`/blog/[slug]`, or `{{…}}` titles) aren't compared with other pages.
- **Endpoint:** `GET /tenant/api/p/:id/site-config/seo-health` → `{ checkedAt, checked, counts, groups: [{ key, level,
  label, advice, pages: [{ path, name, page, seo?, detail? }] }] }`.
- **Panel:** `mint-tenant/src/app/t/_seo/SeoHealth.tsx`, above the table on Website → SEO (website projects; `ServerPage`
  takes `above`). Problems with a page count, the first one open, each page linked to its SEO record (or Add SEO),
  and Check again. With no published pages it says so instead of "No problems found".
- **Guide:** mint-docs `websites#seo-health`, linked from the card. **Website:** a changelog entry.
- **Tests:**
  - smoke `scripts/tenancy-smoke/seo-health.mjs`, 22 checks: one page per problem, each reported once with the right
    pages; drafts left out; the template left out; levels; the site-image switch; 401; 404 on app projects;
  - in the panel on a published starter site, at desktop and phone widths, in dark and light mode.

## 2026-10-27 — SEO-01 Focus keyword score (tenant panel)

- **Where:** the tenant panel's SEO editor (VSeo), under Basics, replacing the old 8-item checklist. The score also shows
  as one line under the Google preview. The user asked for the tenant panel only: the admin copy of VSeo and the builder
  app's SeoEditor keep their old checklist.
- **The score:** `mint-tenant/src/components/library/utils/inputs/VSeo/seoScore.ts`, plain rules in the browser, run on
  every keystroke. Weighted checks:
  - hidden from search;
  - title and description length;
  - keyword in the title (near the start), the description, the address (not on the home page or template pages), the
    main heading and the first 100 words;
  - keyword density (0.5–3% good, over 5% bad);
  - another page with the same keyword;
  - page length (300 words);
  - one h1 (live pages);
  - average sentence length (English only);
  - share image (the site's own counts half).

  Checks that need what isn't known are left out, not failed. Good from 80, Needs work from 50, Poor below that.
- **The page's words:** `GET /tenant/api/p/:id/site-config/seo-page?path=` or `?page=<Pages id>` (an SEO record's form
  holds its page as an id), in `library/functions/seoPage.function.ts`.
  - **Builder pages:** the draft tree and the page's Contents.
  - **Pages built elsewhere:** the live server HTML through `fetchPage`.
  - **Also returned:** the other pages' focus keywords.
  - **`wordsIn` moved here:** the MCP `suggest_seo` tool now imports it from this file.
- **Other records with an SEO field** (a product, a post) are scored against their own text fields, with their name as
  the heading.
- **Guide:** mint-docs `websites#seo-score`, linked from the score. **Website:** a changelog entry.
- **Tests:**
  - smoke `scripts/tenancy-smoke/seo-score-page.mjs`, 12 checks;
  - the score itself on sample pages;
  - in the panel against a private backend: the home page of a starter site scored from its 109 builder words, live as
    a keyword was typed, in dark and light mode.
- **Found, not changed:** the record view page (`/<project>/seo/<id>`) crashes in development only. The SEO model's
  Canonical URL reaches the panel as validation type `uri`, which `assertSchema` doesn't know. Production skips that
  check.
