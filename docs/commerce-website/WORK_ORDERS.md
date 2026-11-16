# Mint Commerce website — work orders

Plan: `README.md` (decisions D1–D12, site map, models). What existed before: `STATE_SO_FAR.md`. Log: `CHANGELOG.md`.
Sizes: S (an afternoon), M (a day), L (2–3 days). Commit and push each WO when it's done, then go on
(site → `aiasifistiaque/mint-commerce-website` main = live deploy; these docs → backend `mint` v3). Stage only your own
files. Update this file's Status + Handoff after every WO.

## Questions for the user

| # | Question | Assumed until answered |
|---|---|---|
| Q1 | "Like the website mango" = mango.com's look (as on HINT)? | Yes (D1) |
| Q2 | Is **mintapp.store** bought, and where is its DNS (Vercel, Cloudflare, registrar)? | Not yet; launch on commerce.tcrypt.site only (MC-15 waits) |
| Q3 | Show features that aren't built yet (accounting, abandoned carts, loyalty …) on launch? | Listed without "coming soon", as on Thinkcrypt (D7) |
| Q4 | Prices: same as Easy Instant Commerce (build 25k / 45k / 75k–1L, hosting 500 / 1,500 / 2,500 BDT)? | Yes |
| Q5 | Leads stay in the Mint Commerce project (new Leads model), not Thinkcrypt's EcLead? | Yes |

## Status

| WO | Title | Where | Size | Status |
|---|---|---|---|---|
| MC-00 | Plan, work orders, state-so-far handoff | backend/docs/commerce-website | S | **done 2026-11-16** |
| MC-01 | Project settings: Mint Commerce project site settings, logos, favicon, domains, tracking | panel (MCP 6fd2f8e3) | S | |
| MC-02 | Models + endpoints + lead automation | panel (MCP) | M | |
| MC-03 | Seed data: features, demos, plans, build options, integrations | panel (MCP) | M | |
| MC-04 | Pictures: live shots of demo stores + commerce panel, scenes, media library | scratchpad + panel | L | |
| MC-05 | Site scaffold: repo, Mango-style design system, header/footer with both logos, Mint data layer, track.js, SEO | mint-commerce-website | M | |
| MC-06 | Home page | site + contents | M | |
| MC-07 | Features + feature pages | site | M | |
| MC-08 | Demos + demo pages | site | S | |
| MC-09 | Pricing + Get started (estimate → lead) | site | M | |
| MC-10 | Panel tour, AI, How it works, Switch, Integrations | site + contents | M | |
| MC-11 | About (Thinkcrypt × MINT), Contact, FAQ, Privacy, Terms, 404 | site + contents | S | |
| MC-12 | Every page's contents + SEO in the panel, published | panel (MCP) | M | |
| MC-13 | Deploy: GitHub repo, Vercel project, env, commerce.tcrypt.site | GitHub + Vercel | S | |
| MC-14 | Analytics connected and checked live | panel + site | S | |
| MC-15 | commerce.mintapp.store | Vercel/DNS | S | waits on Q2 |
| MC-16 | Links in: Thinkcrypt pages, demo storefront footers, mint-webpage | other repos | S | |
| MC-17 | Phone/QA pass: 390px, Lighthouse, a11y, OG images, broken links | site | S | |

## Specs

### MC-01 Project settings (S)
Through MCP 6fd2f8e3. First `get_site` to confirm the project name is "Mint Commerce", because connector ids change.
- `update_site_settings`: siteName "Mint Commerce", tagline, logo + favicon (MINT tile uploaded with `upload_media`;
  Thinkcrypt logo uploaded too, for the footer), primaryColor `#000000`, secondaryColor `#10b981`, fontFamily
  "Instrument Sans", contact (email connect@thinkcrypt.dev, WhatsApp +8801828398225, phone and address copied from
  Thinkcrypt's Site setup), socials, metaTitle "Mint Commerce — your shop online and in store", titleTemplate
  "%s · Mint Commerce", metaDescription ≤160 chars, ogImage.
- Config: origin `https://commerce.tcrypt.site`, domains `[commerce.tcrypt.site]`, tracking mintAnalytics on, sitemap on.
- Done when `get_site` shows all of it.

### MC-02 Models + endpoints + automation (M)
`describe_platform` → `list_models` → `plan_feature` → `build_feature` with the README's model table, sidebar
category "Website". `set_public_api` (list/get) on all but Leads, and `save_endpoint` Leads create, server key only.
It writes only the form fields and sends back `code`. Automation "Tell the team about new leads": on create → notify
+ email connect@thinkcrypt.dev with the lead's fields. Server key: the user makes it in panel API → Keys and puts it in
Vercel as `MINT_SERVER_KEY` (Claude never reads or prints it).
Done when the public API lists each model (empty is fine) and a test lead from curl with the key gets back a code.
Delete that test lead afterwards.

### MC-03 Seed data (M)
`create_records` with `matchOn` slug/value, so the step can be run again safely.
- Features: about 40. Merge Thinkcrypt `/products/mint-commerce` (12 rows + 16 cards) with `/easy-instant-commerce`
  (7 + 12 + 8 custom), de-duplicate, then rewrite as jobs (D2). Each gets a group, a one-line summary, a body, 3–5
  steps, a picture (MC-04 shots, or existing `illustration-mc-*` / `ec-*` art) and a status (live/building, per STATE_SO_FAR §1).
- Demo stores: the 6 `ec-demos` records (names Sobuj Basket … Circuit Bazaar, image, siteUrl, panelUrl, loginEmail),
  plus loginPassword from `commerce-panel/DEMO_LOGINS.md` and highlights.
- Plans + Build options from `thinkcrypt-website/lib/easyCommerce.js`. Integrations: the 20 chips.
Done when the counts match and `query_records` shows pictures on every feature.

### MC-04 Pictures (L)
Headless Chrome over CDP, in the scratchpad (never `window.open`; a hidden pane gives blank pages).
- Each demo site: home, category, product, cart, at 1440 and 390 wide.
- Commerce panel, signed in with each demo login (read-only browsing, change nothing): dashboard, orders + order
  page, POS, product with sizes, stock, couriers / send to courier, store settings, site settings, Connect AI,
  analytics, media library.
- Scenes: laptop + phone frames on a near-black grain background (like the Thinkcrypt case-study kit), PIL in a
  scratch venv. Shown whole, never cropped.
- Upload: put the files in the site repo's `public/shots/`, push, `upload_media` by URL into folders `features`,
  `demos` and `panel`, then remove them from the repo. Link them to Features / Demo stores / Panel screens.
Done when every Feature, Demo store and Panel screen has an image from the Mint Commerce media library.

### MC-05 Site scaffold (M)
`e-mint/mint-commerce-website`, Next 16 App Router, TypeScript, Tailwind v4, `@fontsource-variable/instrument-sans`.
- Design tokens (`globals.css`): ink `#111`, paper `#fff`, line `#e5e5e5`, mute `#707070`, accent `#10b981`; nav
  12px/500 uppercase tracking .08em; h1 clamp(40px, 7vw, 96px) weight 400; body 16px/1.6.
- Components: Header (55px, logo left, links, Get started; full-screen phone menu), Footer (both logos), Button,
  Section, FeatureTile, DemoCard, PlanCard, StepList, Faq, Gallery (whole pictures, horizontal strip on phones), CTA band, WhatsApp button.
- `lib/mint.ts`: `getSite()`, `pageSections(path, seed)`, `list(route, query)` with `revalidate: 60` and seed
  fallbacks in `content/seed/*`. `lib/seo.ts` builds `pageMeta()` from the kit's page SEO. `robots.txt` and `sitemap.xml` are route handlers that proxy the panel.
- Root layout: `<script src=…/public/track.js data-key=… defer>`. `.env`: `NEXT_PUBLIC_MINT_API`, `NEXT_PUBLIC_MINT_API_KEY`
  (publishable, may be committed), `NEXT_PUBLIC_BASE_URL`. `MINT_SERVER_KEY` lives in Vercel only.
- `.claude/launch.json` entry `mint-commerce-website`, port 3660.
Done when `next build` passes and the empty shell renders with both logos at 1440 and 390.

### MC-06 … MC-11 Pages
Built in the order of the site map. Each page draws its words from its panel page's typed contents (`fill_page`
→ `save_entry_draft {slug}` → `publish_entry`, on route `web-contents`) and its lists from the models. Seed copy is
used only when the panel is down. Each page gets `pageMeta` + `opengraph-image.tsx`.
- MC-06 Home: hero with one big demo shot, a "Try a demo" strip (Demo stores), 6 job tiles (Features with showOnHome),
  a panel band (Panel screens), 7 days, a price teaser (lowest Plan + Build option), FAQ, CTA.
- MC-07 `/features` grouped by job, `/features/[slug]` (generateStaticParams + ISR).
- MC-08 `/demos` + `/demos/[slug]`. Each card shows the login email + password, with copy buttons and the note "shared demo, please don't delete data".
- MC-09 `/pricing` and `/get-started`. The estimate is worked out the same way in the browser and in `app/api/lead`
  (server re-prices; Leads create with `MINT_SERVER_KEY`). Taka shown in lakh grouping without `toLocaleString`
  (hydration #418). Thank-you state with the lead code, plus a `MintAnalytics.track('lead')` call.
- MC-10 `/panel`, `/ai`, `/how-it-works`, `/switch`, `/integrations`.
- MC-11 `/about` (Thinkcrypt × MINT, both logos), `/contact` (form → Leads with kind contact), `/faq`, `/privacy`, `/terms`, a 404 page.

### MC-12 Contents + SEO in the panel (M)
Every page in the site map gets a kit page (`upsert_page` with `seo`: title ≤60 chars, description ≤160, keywords ≤30) and
typed contents, published. Done when `get_site` lists every page as published and the site shows panel words, not seed words.

### MC-13 Deploy (S)
`gh repo create aiasifistiaque/mint-commerce-website --private`, push main. Create the Vercel project on the e-mint account
with `backend/.env` VERCEL_TOKEN (not the Vercel MCP connector, which is another account). Link it to Git, set env
(NEXT_PUBLIC_*; the user adds MINT_SERVER_KEY) and add the domain `commerce.tcrypt.site`. Check the build logs.
Done when https://commerce.tcrypt.site answers 200 on every page.

### MC-14 Analytics (S)
Open the live site in the browser pane, click through 3 pages and send a test lead. Then check the Mint Commerce
project's Analytics (Visitors / Live) and the Site setup → Website setup **Test connection**. If the visits aren't
there, check the domain list and the track.js key. Done when the visits and the lead event show in the panel.
Delete the test lead.

### MC-15 commerce.mintapp.store (S, waits on Q2)
Add the domain to the Vercel project with the DNS record the registrar needs. Set `NEXT_PUBLIC_BASE_URL`, the
project's origin + domains + Analytics domain and the canonical domain, then make commerce.tcrypt.site 308 to it
(or keep both, the user's call).

### MC-16 Links in (S)
Thinkcrypt `/products/mint-commerce` and `/easy-instant-commerce` get a "Visit the Mint Commerce site" button
(panel contents; nav is hard-coded in `data/sidebar.data.js`). Demo storefront footers say "Built with Mint
Commerce" → the site. mint-webpage gets a Mint Commerce mention + changelog line (standing rule).

### MC-17 QA (S)
Every page at 390 / 768 / 1440 with no sideways scroll, Lighthouse ≥90 on mobile, alt text on every picture, keyboard
menu, OG images render, no links answering 404 (crawl the sitemap).

## Handoff

- **2026-11-16 — MC-00 done.** Plan, WOs and `STATE_SO_FAR.md` written. Nothing built yet. The **Mint Commerce**
  website project already exists in the tenant panel (`mint-2-mint-commerce`, MCP connector 6fd2f8e3, key
  `mint_pk_135148ce…`) and is empty. Next: MC-01. Q1–Q5 are open, and each one has an assumption to work to.
- Pitfalls collected from the sibling sites: no `next/font/google` (Vercel build fails), no `next/image` optimizer,
  no `toLocaleString` in rendered text, publish typed contents with `publish_entry` or the site shows nothing,
  `fill_page` gives random slugs (fix them with `save_entry_draft {slug}`), the public API caps a page at 100 records,
  upload_media needs a public URL (≤10 MB).
