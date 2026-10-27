# SEO engine and editor — changelog

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
