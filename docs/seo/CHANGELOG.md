# SEO engine and editor — changelog

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
