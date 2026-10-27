# Site connect — changelog

## 2026-10-27 — SC-08b: Test connection

- Website setup → Existing website, step 3: type a page's address (prefilled with the project's domain), press
  **Test connection**. Four answers (ok / warning / missing / idle): the domain is the project's; the snippet is in
  the page's HTML with this key and `data-seo` (warns on `defer`, `data-no-track`, no `data-seo`; another project's key
  = missing; not in the HTML = idle, since a tag manager may add it); page views arriving (last one, count in 24 h); the
  page's SEO — not added, put on by the snippet, or already in the HTML (link previews see it). `connected` = nothing
  missing and the snippet found or visits arriving. `POST /tenant/api/p/:id/site-config/connection { url }` (Build),
  `siteConnection.function.ts`; page fetched through siteCheck's `fetchPage` (private addresses refused in production).

## 2026-10-27 — SC-02, SC-03, SC-08: connect an existing website with a snippet

- `GET /public/api/site/head?path=` (+ `&format=html`): one page's SEO by its address — the kit Pages record at that
  path (published) with its kit SEO record, Site setup → SEO under it as the builder's renderer does it. Each tag is
  `set` (the page's own Mint SEO) or `fill` (a default; only where the page has none). A page not added to SEO answers
  `found: false` with no tags — it keeps its own SEO (D4, the user's rule). `/about`, `/about/`, `/about.html`,
  `/about/index.html` are the same page. Cached 60 s. `library/functions/siteHead.function.ts`.
- `track.js` `data-seo`: fetches the head answer on every page view (load + client-side navigation), replaces/creates
  tags, adds JSON-LD, and on the next page puts back the values it replaced unless the site changed them.
- mint-tenant Website setup: **Existing website** tab (default) — the snippet and where to paste it per platform, add
  pages on Website → Pages / SEO, check the answer, PHP / Node / Next.js server print for link previews, optional
  robots.txt + sitemap.xml. mint-docs `websites#connect-a-website`. MCP `site_snippets` gives `connect` + `head`.
- Smoke `scripts/tenancy-smoke/site-connect-head.mjs`.
