# Site connect — changelog

## 2026-10-27 — SC-10: the mint-edge Worker

- New repo `mint-edge`: a Cloudflare Worker for the customer's own account, in front of their site.
  - **HTML pages:** a page added to Website → SEO gets Mint's head (`set` tags replace the page's, `fill` only fill gaps,
    JSON-LD added, all marked `data-mint-seo="edge"`), so link previews show it. Every page gets
    `<script src="/_mint/track.js" data-api="/_mint/api" data-seo defer>` before `</body>`, unless it already has the snippet.
  - **On the site's own domain:** `/_mint/track.js` and `/_mint/api/{track, site/tags, site/head}` go to Mint. Site setup
    redirects (301/302, query kept). robots.txt and sitemap.xml come from Mint only when switched on.
  - **Left alone:** images, POSTs, non-200s and other types.
  - **Settings:** read from Mint and kept a minute, then used for up to a day while new ones load. Mint is asked about
    the head only for pages that are Mint's.
  - **Never breaks a site:** if Mint is down (more than 1 s with nothing kept), with Bypass on, for a host the project doesn't
    name, or with no key, the page passes through untouched. `?mint-bypass=<secret>` skips it for one request.
- Backend:
  - `GET /public/api/site/edge` (version, bypass, domains, analytics, pages, redirects, robots, sitemap).
  - `WebsiteSettings.edge` {bypass, robots, sitemap}, off by default, saved on site-config.
  - `/track` takes the visitor's address from `X-Mint-Visitor-IP`.
  - `track.js` `data-api`, and `applyHead` clears the Worker's tags too.
- Tests:
  - smoke `site-connect-edge.mjs` (20 checks);
  - `mint-edge/test/edge.test.mjs` (31 checks under `wrangler dev`, about 7 ms added per page locally);
  - a browser check through the Worker.

## 2026-10-27 — Add domain from Analytics

- Each event keeps `host` (the page's host from the browser's Origin / Referer). `GET /tenant/api/p/:id/analytics/hosts`:
  the sites page views came from in 30 days (top 10, localhost and bare IPs left out), `added` when a domain covers it.
- mint-tenant Analytics header (`_components/Domains.tsx`): the domains, or "Counting visits from any site"; one-click
  **Add <busiest site not added>**; **Add domain / Domains** dialog — sites visits came from, type one in (whole
  addresses trimmed to the host), the list with ×, Save (PUT site-config `domains`, Manage projects). The dialog doesn't
  close on focus leaving it (an added row disappears under the pointer). Smoke `site-connect-head.mjs` now 54.

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
