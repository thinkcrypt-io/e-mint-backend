# Site connect — changelog

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
