# SEO engine and editor — what to improve

Work orders: `WORK_ORDERS.md`. Log: `CHANGELOG.md` (start it with the first WO built).

## The user's words (2026-10-27)

> Make a plan on how to improve our seo engine and editor. One feature at a time list them, they should not depend on
> one another, list them and i would tell you what to start

So every work order here stands on its own: it can be built first, last or never, and none needs another to be done
first. Where two touch the same screen, each one says how it looks without the other.

## What already exists (don't rebuild it)

| Piece | Where | What it does |
|---|---|---|
| Page SEO editor (VSeo) | `mint-tenant/src/components/library/utils/inputs/VSeo/` (admin has a copy) | Title + description with character counts, Google result preview, social preview, Facebook/X overrides, canonical, noindex / nofollow / noarchive / noimageindex, max snippet, max image preview, schema type + own JSON-LD, breadcrumb title, sitemap include / priority / change frequency. **Focus keyword is saved but nothing reads it.** |
| Page SEO shape | `backend/library/siteBuilder/seo.ts` (`EMPTY_SEO`, `withSiteDefaults`) | The fields above, and Site setup's Default SEO under them |
| Default SEO | Site setup → SEO (`WebsiteSettings.seo`, SB-33) | Title template, meta description, share image, indexing switch, sitemap switch, extra robots lines, canonical domain, Google / Bing verification |
| Template pages' SEO | `backend/library/siteBuilder/render.ts` | `{{record.…}}` filled in per item (`/blog/[slug]`) |
| Head answer | `GET /public/api/site/head` (`siteHead.function.ts`, site-connect SC-02) | One page's SEO for sites built anywhere; the mint-edge Worker writes it into the HTML |
| robots.txt | `GET /public/api/site/robots.txt` (`robots.function.ts`, SEO-09) | Built for you: `Allow: /` or `Disallow: /`, the extra lines, a group per blocked crawler (10 switches), the `Sitemap:` line. Or the whole file as written (`X-Mint-Robots: custom`). `POST /site-config/robots-preview` shows the file and its mistakes |
| sitemap.xml | `GET /public/api/site/sitemap.xml` (`public.router.ts`, `sitemap.function.ts`) | Published kit pages + builder static pages not hidden from search, with priority and change frequency; every record a template page shows (SEO-08), with its date and image; Site setup's extra addresses; an index of `?part=N` past 5,000. |
| Redirects | Site setup → Redirects | Used by mint-sites and the Worker |
| `suggest_seo` (MCP) | `backend/library/controllers/mcp/content.tools.ts` | A page's words and SEO, for the user's own AI to write a title and description |
| Page fetcher | `fetchPage` in `siteCheck.function.ts` | Follows redirects, refuses private addresses — reuse it for anything that fetches a URL someone typed |

## Rules every WO follows

- **No server AI calls** (memory: AI via MCP). Anything "smart" is either plain rules in code or an MCP tool the user's
  own AI calls.
- **Only pages added to SEO are Mint's** (site-connect D4). Checks and scores on a connected site's other pages are
  read-only advice.
- Each WO that changes what owners see: a mint-docs guide section, doc links on each new panel step, the marketing
  website, and the MCP's descriptions where they mention SEO. Commit and push each WO when it's done; update the
  multi-tenancy handoff.
- Anything that fetches a typed URL goes through `fetchPage`, with a per-project daily limit.

## Overlaps with other plans

- site-connect **SC-04** (page discovery), **SC-06** (Website → SEO for connected sites, found pages table with a
  score) and **SC-07** (pattern rules for connected sites' `/blog/*`) stay in that plan. SEO-02 below is the table for
  pages Mint already has; SC-06 can later add found pages to it.
- The analytics ideas (money per page, bots and AI crawlers) are analytics work. Only the SEO side of them is here
  (SEO-17, SEO-18).
