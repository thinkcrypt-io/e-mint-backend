# SEO engine and editor — work orders

Plan: `README.md`. Each WO stands alone: none needs another to be built first (the user's rule, 2026-10-27). The user
picks which to start. Commit and push each one when it's done (backend → `mint` v3; mint-tenant, mint-sites, mint-docs,
mint-webpage → `origin` main; mint-edge → its own repo, main).

**Shared code, whoever comes first:** SEO-02, SEO-03 and SEO-19 all list a page's problems. The first of them to be
built writes `seoIssues()` in `backend/library/functions/seoIssues.function.ts`; the others reuse it. None waits for
another.

## Status

| WO | Title | Area | Repo | Size | Status |
|---|---|---|---|---|---|
| SEO-01 | Focus keyword score in the editor | Editor | backend + mint-tenant | M | done 2026-10-27 (tenant panel only — the user: “the tenant panel only thats what we want”; not admin or the builder app) |
| SEO-02 | SEO table: every page in one table, edit in place, bulk changes | Editor | backend + mint-tenant | M | todo |
| SEO-03 | Site SEO health card: duplicates, gaps, conflicts | Editor | backend + mint-tenant | S | done 2026-10-27 (`seoIssues()` written — SEO-02 and SEO-19 reuse it) |
| SEO-04 | Structured data forms instead of raw JSON | Editor | backend + mint-tenant | M | todo |
| SEO-05 | Multiple languages (hreflang) | Editor + engine | backend + mint-tenant + mint-sites | M | todo |
| SEO-06 | Share image maker | Editor | backend + mint-tenant | M | todo |
| SEO-07 | Image alt text check | Editor | backend + mint-tenant | S | todo |
| SEO-08 | Sitemap: item pages, sitemap index, images | Engine | backend | S | todo |
| SEO-09 | robots.txt editor: whole-file mode + AI crawler switches | Engine | backend + mint-tenant | S | todo |
| SEO-10 | Connected sites: merge the site's own sitemap and robots.txt | Engine | mint-edge + backend | S | todo |
| SEO-11 | IndexNow: tell Bing and others when pages change | Engine | backend + mint-sites + mint-edge | S | todo |
| SEO-12 | Redirects: automatic on path change, CSV import, loop check | Engine | backend + mint-tenant | S | todo |
| SEO-13 | PageSpeed page | Measure | backend + mint-tenant | M | todo |
| SEO-14 | Link preview checker | Measure | backend + mint-tenant | S | todo |
| SEO-15 | Google Search Console connection | Measure | backend + mint-tenant | L | todo |
| SEO-16 | Whole-site audit (crawler, checks, score) | Measure | backend + mint-tenant | L | todo |
| SEO-17 | Backlinks: referring sites + Bing Webmaster | Measure | backend + mint-tenant | M | todo |
| SEO-18 | Search bot and AI crawler visits | Measure | mint-sites + mint-edge + backend + mint-tenant | M | todo |
| SEO-19 | MCP: SEO problems and fixing many pages at once | AI | backend | S | todo |

Suggested first picks (most effect for the work): **SEO-08**, **SEO-01**, **SEO-14**, **SEO-09**.

---

## Editor

### SEO-01 Focus keyword score in the editor — M

**Why:** the focus keyword is saved and nothing reads it. A live score is what owners know from Yoast / RankMath.

- A **Score** panel at the top of VSeo: 0–100 and a list of checks, each green / orange / red with one line of advice.
- Checks, all in the browser, no server call:
  - keyword in the title (near the start is better), the description, the address and the first heading;
  - how many times the keyword appears in the page's words, and how many words the page has;
  - title and description length (the existing windows);
  - a share image is set; the page isn't accidentally noindex;
  - the keyword isn't the focus keyword of another page (one small call, or skipped where the list isn't loaded).
- The page's words: builder pages from their Contents / blocks; kit pages from their own text fields; connected sites'
  pages show only the checks that need no words.
- Readability (sentence and paragraph length) for English only; other languages skip it.
- **Done when:** typing a keyword updates the score live; the score is the same in mint-tenant and admin.

### SEO-02 SEO table — M

**Why:** today each page's SEO is edited one by one. A site with 80 pages needs one table.

- Website → SEO gets a table view: path, title, description (with length colour), share image, noindex, focus keyword,
  problems count, last changed.
- Edit title and description in the cell; open VSeo in a drawer for the rest.
- Filters: missing description, too long, no image, noindex, duplicate title.
- Bulk changes on selected rows: noindex on / off, sitemap in / out, apply the title template, set a share image.
- Problems column uses `seoIssues()` (see the top). Without it, the column is left out.
- **Done when:** editing 20 pages' descriptions takes one screen; the table follows the route-preferences rule
  (memory: new table route checklist).

### SEO-03 Site SEO health card — S

**Why:** some problems only show across pages.

- A card on Website → SEO: duplicate titles, duplicate descriptions, pages with no description, no share image,
  noindex pages that are in the menu, canonical pointing to a page that doesn't exist, a page noindexed and also in the
  sitemap.
- Each line lists the pages, with a link to their editor.
- Backend `GET …/seo/health` builds it with `seoIssues()`.
- **Done when:** a seeded site with each problem shows each line once, with the right pages.

### SEO-04 Structured data forms — M

**Why:** "own JSON-LD" is raw JSON, which most owners can't write. Rich results (stars, prices, FAQs, opening hours)
need correct structured data.

- When a schema type is picked, a form for it instead of a JSON box:
  - Organization / LocalBusiness: name, logo, address, phone, opening hours, map link, social profiles;
  - Product: price, currency, availability, brand, rating — on template pages, each from a model field;
  - Article: author, published / updated date, image;
  - FAQ: question and answer pairs;
  - Event, Service.
- The JSON box stays as "Advanced", merged on top as today.
- Checks the required fields of each type, and links to Google's Rich Results Test for the page.
- **Done when:** each type's output passes Google's Rich Results Test on a test page.

### SEO-05 Multiple languages (hreflang) — M

**Why:** there's no way to say "this page in Bangla is that page".

- On each page: its language, and its versions in other languages (language + page), plus the x-default page.
- Output: `<link rel="alternate" hreflang>` in the head (mint-sites, the head answer, so the Worker writes them too), the
  page's `<html lang>`, and the alternates in the sitemap.
- Checks that both pages point to each other.
- **Done when:** a page pair shows correct alternates in the HTML and the sitemap.

### SEO-06 Share image maker — M

**Why:** many pages have no share image, so link previews look empty.

- "Make a share image" in VSeo: 1200×630 from the page's title, the site's logo and colours, a few layouts.
- Made on the server as a PNG and saved to the media library (no image optimizer — memory rule; this makes one fixed
  file).
- Template pages: an image per item from its title, made when the item is published.
- **Done when:** a page with no image gets one in two clicks, and Facebook's preview shows it.

### SEO-07 Image alt text check — S

**Why:** images without alt text lose image search and accessibility.

- Lists every image on Mint-built pages (blocks, Contents) without alt text, with the page and a box to write it.
- The media library's alt text is used where a block has none.
- **Done when:** filling alt text in the list updates the page's next publish.

## Engine

### SEO-08 Sitemap: item pages, sitemap index, images — S

**Why:** the sitemap skips template pages, so every blog post and product page is missing from it. This hurts indexing
the most.

- Each published item of a template page's model becomes a URL (`/blog/my-post`), with its updated date; items hidden
  from search stay out.
- Over 5,000 URLs: a sitemap index with numbered sitemaps.
- Each URL's main image as an image entry.
- An "Extra addresses" box in Site setup for pages Mint doesn't know.
- **Done when:** a site with a blog lists every post; the smoke test checks the count.

### SEO-09 robots.txt editor — S

**Why:** owners can only add lines; `Allow: /` can't be removed, and there's no simple way to block AI crawlers.

- Two modes: **Built for you** (today's, plus the switches below) and **Write the whole file**.
- Switches per crawler: Googlebot, Bingbot, Google-Extended (Gemini training), GPTBot, ChatGPT-User, ClaudeBot,
  PerplexityBot, CCBot, Bytespider, Applebot-Extended — allow or block.
- A preview of the file, and a check for common mistakes (blocking the whole site, a missing sitemap line).
- **Done when:** each switch changes the served file; the whole-file mode serves exactly what was written.

### SEO-10 Connected sites: merge the site's own sitemap and robots.txt — S

**Why:** turning on Mint's sitemap in the Worker would replace the site's own with only the pages Mint has.

- The Worker fetches the site's own `sitemap.xml` and adds Mint's pages to it (no duplicates), or serves a sitemap
  index of both.
- robots.txt: the site's own file, with Mint's lines (sitemap, crawler switches if SEO-09 is built) added.
- **Done when:** under `wrangler dev`, a site with its own sitemap of 30 URLs plus 5 Mint pages answers 35 or an
  index of both.

### SEO-11 IndexNow — S

**Why:** Bing, Yandex, Seznam and Naver crawl a page within minutes when told it changed. Google doesn't take
IndexNow, and its sitemap ping was retired.

- A key per project, served at `/<key>.txt` by mint-sites and the Worker.
- On publish, or a page's SEO change: one IndexNow call with the changed URLs.
- A log on Website → SEO: when each URL was sent.
- **Done when:** publishing a page sends one call with its URL (checked against a test receiver).

### SEO-12 Redirects — S

**Why:** changing a page's address today breaks old links and loses their ranking.

- Changing a published page's path offers "Add a 301 from the old address" (on by default).
- CSV import and export.
- Warns about loops (A → B → A) and chains (A → B → C, suggesting A → C).
- **Done when:** renaming a page's path keeps the old address working.

## Measure

### SEO-13 PageSpeed page — M

**Why:** speed is part of ranking; owners want the pagespeed.web.dev scores in Mint.

- Paste a URL, mobile or desktop: Performance, Accessibility, Best Practices and SEO scores, Core Web Vitals (real
  users when Google has them, otherwise the test load), and the fixes with what each saves.
- Runs in the background (a test takes 10–40 s; Heroku cuts requests at 30 s); the page waits for it.
- Past results saved, with a chart per URL.
- Google PageSpeed Insights API; `PAGESPEED_API_KEY` on Heroku (it works without one for a few tests). Limit per
  project per day.
- **Done when:** a test of a real site shows the same scores as pagespeed.web.dev, within normal run-to-run spread.

### SEO-14 Link preview checker — S

**Why:** what Facebook, LinkedIn, WhatsApp, X and Slack show comes only from the HTML a server sends (the SINAMM /team
problem).

- Paste a URL: a card for each platform as it would look, from the server HTML (`fetchPage`, no JavaScript).
- Warnings: no og:image, image too small or too large, title cut off, the page's JavaScript-only tags that crawlers
  won't see.
- For pages that are Mint's, "Edit SEO" opens their editor.
- **Done when:** a page with JavaScript-only tags is flagged; a correct page shows all cards.

### SEO-15 Google Search Console connection — L

**Why:** the real numbers: what people searched, clicks, impressions, position.

- Sign in with Google (`webmasters.readonly`), pick the property.
- Website → SEO: clicks, impressions, CTR, position over time; top queries and pages.
- In VSeo: this page's queries, so the focus keyword can be chosen from real searches.
- Submit the sitemap through the API.
- Google needs the OAuth app verified before customers outside a test list can sign in — start that early.
- **Done when:** a verified property shows the same numbers as Search Console for the same dates.

### SEO-16 Whole-site audit — L

**Why:** a score for any site, page by page, like the paid SEO audit tools.

- Paste a URL: crawls the site (robots.txt and sitemap first, then links on the same domain, up to 200 pages, a few at
  a time, user agent MintSEOBot), in the background with progress.
- About 30 checks (content, technical, link previews, structured data, site-wide), each error / warning / notice.
- Score 0–100 for the site, each page and each category; past audits compared.
- Server HTML only; pages whose content needs JavaScript are flagged.
- **Done when:** a seeded test site with known problems gets each one reported once.

### SEO-17 Backlinks — M

**Why:** links from other sites are a large part of ranking.

- **Referring sites** from Mint Analytics: other sites whose links people clicked, with the pages they link to. Free,
  the data is already collected.
- **Bing Webmaster connection:** the owner pastes their Bing API key; inbound link counts and the linking pages. Check
  the API's link methods before building.
- Paid link databases (DataForSEO etc.) are out of scope; a later paid add-on if wanted.
- **Done when:** referring sites match the analytics referrer data; a verified Bing site shows its links.

### SEO-18 Search bot and AI crawler visits — M

**Why:** JavaScript analytics never sees crawlers. Owners want to know if Google, Bing and AI search read their pages.

- mint-sites and the mint-edge Worker log requests from known crawlers (Googlebot, Bingbot, GPTBot, ClaudeBot,
  PerplexityBot, the link preview bots…), checking the big ones by reverse DNS where they publish it.
- Website → SEO: which bots came, when, which pages, which status codes.
- Sites without the Worker or mint-sites see an explanation instead of an empty chart.
- **Done when:** a test request with Googlebot's user agent from a non-Google address is not counted as Google.

## AI

### SEO-19 MCP: SEO problems and fixing many pages at once — S

**Why:** `suggest_seo` works one page at a time.

- `list_seo_issues`: every page's problems (`seoIssues()`).
- `save_seo_many`: titles, descriptions and focus keywords for many pages in one call, shown to the user first (the
  server instructions say so).
- **Done when:** the user's own AI can fix every missing description on a site in one go.
