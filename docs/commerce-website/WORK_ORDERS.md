# Mint Commerce website — work orders

Plan: `README.md` (the Mango "She" look, decisions D1–D12, site map, models). What existed before: `STATE_SO_FAR.md`.
Log: `CHANGELOG.md`. Sizes: S (an afternoon), M (a day), L (2–3 days).

Rules:
- Commit and push each WO when it's done, then go on. The site goes to `aiasifistiaque/mint-commerce-website` main, which deploys live. These docs go to backend `mint` v3.
- Stage only your own files.
- Update this file's Status + Handoff after every WO.

**Go given 2026-11-16** ("continue with the work order"). Connectors on that day: **Mint Commerce = fb74b56e**, Thinkcrypt Website = 0ed4e769 (ids change; check with `get_site`).

## Questions

| # | Question | Answer / assumption |
|---|---|---|
| Q1 | Which look? | **Answered:** https://shop.mango.com/gb/en/h/brandid_she, "the vibe must look like this" (README table) |
| Q2 | Final domain? | **Answered:** **commerce.thinkcrypt.dev**. The user adds the DNS record |
| Q3 | Show features that aren't built? | **Answered:** no, built features only. More are added later from the tenant panel |
| Q4 | Prices? | **Answered:** the Easy Instant Commerce prices. "This is for instant commerce with a new url" |
| Q5 | Where do leads go? | **Answered:** the new project |

## Status

| WO | Title | Where | Size | Status |
|---|---|---|---|---|
| MC-00 | Plan, work orders, state-so-far handoff; answers Q1–Q5 folded in | backend/docs/commerce-website | S | **done 2026-11-16** |
| MC-01 | New project's settings: name, logos, favicon, contact, domains, tracking | panel (MCP fb74b56e) | S | **done 2026-11-16** (ogImage set in MC-04) |
| MC-02 | Models + endpoints + lead automation | panel (MCP) | M | **done 2026-11-16** (test lead waits for the server key) |
| MC-03 | Seed data, **built features only**: features, demos, plans, build options, integrations | panel (MCP) | M | **done 2026-11-16** (pictures in MC-04) |
| MC-04 | Pictures: live shots of demo stores + commerce panel, studio scenes, media library | scratchpad + panel | L | **storefront part done 2026-11-16**; panel shots wait for Claude in Chrome |
| MC-05 | Site scaffold: repo, Mango-style design system, header/bar/footer with both logos, data layer, track.js, SEO | mint-commerce-website | M | **done 2026-11-16** |
| MC-06 | Home page (full-screen panel stack) | site + contents | M | **done 2026-11-16** (words are seed until MC-12) |
| MC-07 | Features grid + feature pages | site | M | **done 2026-11-17** |
| MC-08 | Demos grid + demo pages with logins | site | S | **done 2026-11-17** |
| MC-09 | Pricing + Get started (estimate → Leads) | site | M | |
| MC-10 | Panel tour, AI, How it works, Switch, Integrations | site + contents | M | |
| MC-11 | About (Thinkcrypt × MINT), Contact, FAQ, Privacy, Terms, 404 | site + contents | S | |
| MC-12 | Every page's contents + SEO in the panel, published | panel (MCP) | M | |
| MC-13 | Deploy: GitHub repo, Vercel project, env, commerce.tcrypt.site | GitHub + Vercel | S | **mostly done 2026-11-16** (live; MINT_SERVER_KEY by the user) |
| MC-14 | Analytics connected and checked live | panel + site | S | |
| MC-15 | commerce.thinkcrypt.dev | Vercel + the user's DNS record | S | the user adds the record |
| MC-16 | Links in: Thinkcrypt pages, demo storefront footers, mint-webpage | other repos | S | |
| MC-17 | QA: phones, Mango look check, Lighthouse, a11y, OG, links | site | S | |

## Specs

### MC-01 New project's settings (S)
Use MCP connector 6fd2f8e3. Run `get_site` first to confirm the name is "Mint Commerce" (`mint-2-mint-commerce`), because connector ids change.
- `upload_media`: the MINT tile (`mint-webpage/src/app/icon.svg`, also as a 512px PNG) and the Thinkcrypt logo (`thinkcrypt-website/public/logo/thinkcrypt.svg`), both by public URL.
- `update_site_settings`:
  - siteName "Mint Commerce", tagline "Your store online in 7 days".
  - logo + favicon = the MINT tile.
  - primaryColor `#121212`, secondaryColor `#ffffff`, fontFamily "Instrument Sans".
  - Contact: email connect@thinkcrypt.dev and WhatsApp +8801828398225; phone, address and socials copied from Thinkcrypt's Site setup (`8cd8828a` `get_site`).
  - metaTitle "Mint Commerce — your store online in 7 days", titleTemplate "%s · Mint Commerce", metaDescription ≤160 chars, ogImage (after MC-04).
- Config: origin `https://commerce.tcrypt.site`, domains `[commerce.tcrypt.site]`, mintAnalytics on, visitorIp full, sitemap + indexing on.
- Done when `get_site` shows all of it.

### MC-02 Models + endpoints + automation (M)
- Steps: `describe_platform` → `list_models` → `plan_feature` → `build_feature`, with the README model table. Sidebar category "Website".
- `set_public_api` (list/get) on every model except Leads.
- `save_endpoint` for Leads create: server key only, writes only the form fields, sends back `code`.
- Automation "Tell the team about new leads": on create → notify + email connect@thinkcrypt.dev with the lead's fields.
- The server key is made by the user in panel API → Keys and put in Vercel as `MINT_SERVER_KEY`. Claude never reads or prints it.
- Done when the public API lists each model (empty is fine) and a test lead posted with the key gets a code back. Delete the test lead.

### MC-03 Seed data, built features only (M)
Use `create_records` with `matchOn` slug/value, so it can be run again.

**Features**: seed only what works on the live stores today. Check each one on a demo store or its panel before you seed it, and leave out anything that fails. Starting list, grouped as the site shows them:

| Group | Features (check, then seed) |
|---|---|
| Sell online | Your store website (home, categories, product pages, cart, checkout) · Search that forgives spelling mistakes, with suggestions · Sizes and colours, each with its own price, stock and picture · Categories and collections · Customer accounts and order history · Google-ready pages (titles, descriptions, sitemap) |
| Sell in your shop | Point of sale with barcode scanning, held sales, split payment and printed receipts · Stock for each branch, transfers and stock counts · Barcode and price labels · Store credit |
| Delivery | Send to Steadfast, Pathao or RedX in one click and follow the parcel · Buyer check (a phone number's delivery and return record before you ship) · Delivery charges by area |
| Get paid | Cash on delivery · bKash · SSLCommerz (cards, Nagad, banks) · Stripe. Seed each gateway only if a store's website checkout can take it today; the payment code is in `library/functions/payments/*` · Returns back into stock with part refunds |
| Run it yourself | One orders page for website, shop and phone orders · Staff logins with no developer settings · Store, delivery, payment and website settings · Sale prices, discounts and coupons · VAT worked out for you · Invoices, receipts and packing slips with your logo · Order emails from your own address, in your design · Automatic actions when an order comes in · Visitor analytics · Media library · Every change recorded (history) · Ask your AI (Claude or ChatGPT through Connect AI) |

- **Leave out**, because they are not built (add them later from the panel when they ship): SMS/email campaigns, abandoned carts, lost-customer analysis, stock forecasts / reorder alerts, accounting, loyalty, gift cards, reviews, suppliers and purchase orders, Facebook/Google product feeds, multi-currency, a mobile app, pay-by-link, refunds through the gateway, offline POS.
- Check before seeding: wishlist (EC-31, not deployed when this was written), register shifts (`commerce/shifts.ts` exists but EC-11 is open) and delivery charges by area.
- Each feature needs: group, a one-line summary, a body, 3–5 steps, image + imagePhone (from MC-04), and showOnHome for the first in each group.
- **Demo stores**: the 6 Thinkcrypt `ec-demos` records (Sobuj Basket, Muse & Mode, Deshi Bhandar, Thread Theory, Loomline, Circuit Bazaar), with loginPassword from `commerce-panel/DEMO_LOGINS.md` and highlights.
- **Plans + Build options**: from `thinkcrypt-website/lib/easyCommerce.js`.
  - Hosting: Starter 500 (100 products / 200 images), Growth 1,500 (500 / 1,000), Unlimited 2,500 a month.
  - Build: Ready design 25,000, Ready design in my brand 45,000, My own design 75,000, up to 1,00,000.
- **Integrations**: only the payment gateways and couriers that passed the check above, plus Claude / ChatGPT.
- Done when each feature was checked (write the list of what was left out in CHANGELOG), and `query_records` shows pictures on every record.

### MC-04 Pictures (L)
Use headless Chrome over CDP in the scratchpad (never `window.open`; a hidden pane gives blank pages).
- Each demo site: home, category, product, cart, at 1440×900 and 390×844.
- The commerce panel, signed in with each demo login. Browse only and change nothing. Screens: dashboard, orders + order page, POS, product with sizes, stock, send to courier, buyer check, store settings, site settings, Connect AI, analytics, media library.
- Scenes in the Mango photo feel: soft neutral studio backgrounds (warm grey / off-white with a soft shadow, no grain, no near-black). Desktop scenes 16:9 (laptop with phone) and phone scenes 4:5 (phone in hand-size frame). Made with PIL in a scratch venv. Pictures are shown whole.
- Upload: put the files in the site repo's `public/shots/` and push. Then `upload_media` them by URL into the media folders `features`, `demos` and `panel`, and remove them from the repo. Link them to Features / Demo stores / Panel screens.
- Done when every record has image + imagePhone from the new project's media library.

### MC-05 Site scaffold (M)
Folder `e-mint/mint-commerce-website`: Next 16 App Router, TypeScript, Tailwind v4, `@fontsource-variable/instrument-sans`.
- Tokens (`globals.css`), per the README Mango table:
  - Colours: ink `#121212`, paper `#ffffff`, bar `#f2f2f2`, line `#e5e5e5`, mute `#707070`.
  - Type: nav/labels 13px/600 uppercase; display headings uppercase 600, clamp(40px, 6vw, 68px), white over pictures; body 15px/1.6.
  - Shapes: no radius, no shadows.
- Components:
  - `Header`: 56px; links left, logo centre, actions right; full-screen white phone menu.
  - `AnnouncementBar`: closeable, remembered.
  - `HeroPanel`: a full-screen picture with a picture/phone source switch, a big uppercase heading, a links row and a small text link.
  - `PictureGrid`: edge-to-edge, 2 or 4 across, caption under each.
  - `Steps`, `Faq` (plain rows with +), `TextButton`, `GetStartedPanel`.
  - `Footer`: grey, call-back line → Leads, socials, 4 link columns, and a bottom row with both logos.
  - `WhatsAppButton`: small, black.
- `lib/mint.ts`: `getSite()`, `pageSections(path, seed)` and `list(route, query)`, each with `revalidate: 60` and seed fallbacks in `content/seed/*`. It pages through results, because the public API caps a page at 100.
- `lib/seo.ts`: `pageMeta()` from the kit. `robots.txt` and `sitemap.xml` are route handlers that proxy the panel.
- Root layout: the `track.js` script with `data-key` and `defer`.
- `.env`: `NEXT_PUBLIC_MINT_API`, `NEXT_PUBLIC_MINT_API_KEY` (publishable, may be committed), `NEXT_PUBLIC_BASE_URL`. `MINT_SERVER_KEY` lives in Vercel only.
- `.claude/launch.json` entry `mint-commerce-website`, port 3660.
- Done when `next build` passes and the empty shell looks like the Mango page (header, bar, one panel, footer) at 1440 and 390.

### MC-06 … MC-11 Pages
Each page takes its words from its panel page's typed contents (`fill_page` → `save_entry_draft {slug}` → `publish_entry`, route `web-contents`) and its lists from the models. Seed copy is used only when the panel is down. Each page gets `pageMeta` + `opengraph-image.tsx`. The layouts are in the README site map.
- MC-06 Home: the panel stack, demo grid, price strip, 7 days, GET STARTED.
- MC-07 `/features` + `/features/[slug]` (generateStaticParams + ISR). A new Features record in the panel shows up within 60s without a deploy.
- MC-08 `/demos` + `/demos/[slug]`.
- MC-09 `/pricing` + `/get-started`:
  - The estimate is worked out the same way in the browser and in `app/api/lead`; the server prices it again, then creates the Lead with `MINT_SERVER_KEY`.
  - Taka is shown in lakh grouping by hand, never with `toLocaleString` (hydration #418).
  - The thank-you state shows the lead code and calls `MintAnalytics.track('lead')`.
- MC-10 `/panel`, `/ai`, `/how-it-works`, `/switch`, `/integrations`.
- MC-11 `/about` (Thinkcrypt × MINT, both logos), `/contact` (→ Leads, kind contact), `/faq`, `/privacy`, `/terms`, 404.

### MC-12 Contents + SEO in the panel (M)
Every page in the site map gets a kit page (`upsert_page` with `seo`: title ≤60 chars, description ≤160, keywords ≤30) and its typed contents, published.
Done when `get_site` lists every page as published and the site shows panel words, not seed words.

### MC-13 Deploy (S)
- `gh repo create aiasifistiaque/mint-commerce-website --private`, then push main.
- Create the Vercel project on the e-mint account with `backend/.env` VERCEL_TOKEN, not the Vercel MCP connector (that is another account).
- Link it to Git and set env: NEXT_PUBLIC_* by Claude, MINT_SERVER_KEY by the user.
- Add the domain `commerce.tcrypt.site` (tcrypt.site DNS is on Vercel) and check the build logs.
- Done when https://commerce.tcrypt.site answers 200 on every sitemap page.

### MC-14 Analytics (S)
- Open the live site in the browser pane, click through 3 pages and send a test lead.
- In the new project, check Analytics (Visitors / Live) and Site setup → Website setup → **Test connection**.
- If visits are missing, check the domain list and the track.js key.
- Done when the visits and the lead event show in the panel. Delete the test lead.

### MC-15 commerce.thinkcrypt.dev (S, the user adds the DNS record)
- Add `commerce.thinkcrypt.dev` to the Vercel project `mint-commerce-website` (e-mint account, VERCEL_TOKEN).
- Read the record Vercel asks for from the domain config: usually a CNAME `commerce` → `cname.vercel-dns.com`. thinkcrypt.dev is used by another Vercel account (the thinkcrypt team, www.thinkcrypt.dev), so Vercel may also ask for a TXT `_vercel` verification. Give the user both records exactly as Vercel shows them. **The user adds them**; Claude does not touch thinkcrypt.dev's DNS.
- Once Vercel shows the domain as valid and the SSL certificate is issued:
  - set `NEXT_PUBLIC_BASE_URL=https://commerce.thinkcrypt.dev`
  - update the new project's origin, domains, Analytics → Add domain and canonical domain
  - redeploy
- commerce.tcrypt.site then 308s to commerce.thinkcrypt.dev (a Vercel domain redirect), unless the user wants both.
- Done when https://commerce.thinkcrypt.dev answers 200 with a valid certificate, the sitemap uses it, and a visit shows in Analytics under that host.

### MC-16 Links in (S)
- Thinkcrypt `/easy-instant-commerce` and `/products/mint-commerce` get a "Visit the Mint Commerce site" button (panel contents). Their nav is hard-coded in `data/sidebar.data.js`.
- The demo storefront footers get "Built with Mint Commerce" → the site.
- mint-webpage gets a Mint Commerce mention + a changelog line (the standing rule).

### MC-17 QA (S)
- Every page at 390 / 768 / 1440 with no sideways scroll.
- A side-by-side screenshot check against the Mango She page (header, bar, panel, grid, footer).
- Lighthouse ≥90 on mobile, alt text on every picture, a keyboard-usable menu.
- OG images render, and no link answers 404 (crawl the sitemap).

## Handoff

- **2026-11-17 — Header + hero lead box + worry-free section (user's asks).** The hero box sends callback Leads but they fail with "Our form is resting" until the user adds `MINT_SERVER_KEY` on Vercel. Phone is required on Leads, so email-only leads carry Phone "—"; making Phone optional is the user's call. Header and footer still link to unbuilt pages only in the footer and MC-09+ (pricing, get-started). Next is still **MC-09**.
- **2026-11-17 — Home + features reworked (user's ask, not a WO).** Home is a Shopify-style selling page: what it is, time and price in the hero, then jobs, every feature, prices, demos, FAQ. This overrides D1's "one big picture per screen" on home; the rest keeps the Mango look. New home sections read panel contents by slug (`hero`, `jobs`, `all`, `flow`, `who`, `price`, `days`, `demos`, `faq`, `get-started`) with seeds in `app/page.tsx` — MC-12 should add them to the "/" page. Next is still **MC-09 pricing + get started**.
- **2026-11-17 — MC-08 done.** Next: **MC-09 pricing + get started**.
  - `/demos`: an intro (contents `/demos` section `intro`, seed until MC-12), a 3-across 16:9 grid, and `#logins`, which lists every store's email + access code with copy buttons and Store / Panel buttons. The header's "Demo login" and the footer's "Demo logins" land on `#logins`.
  - `/demos/[slug]`: the scene (h1 = name), the kind + summary, OPEN THE STORE, highlights, the login card (copy buttons, Open its panel, the shared-demo note), a gallery of the record's `gallery` minus the main picture, 3 more demos, and GET STARTED. ISR like features; an unknown slug answers 404.
  - The access codes come from `demoAccess` (public on purpose). The copy buttons were not clicked in a browser (headless gives no clipboard); they fall back to the value shown on screen.

- **2026-11-17 — MC-07 done.** Next: **MC-08 demos pages**.
  - `/features`: an intro (contents `/features` section `intro`, seed until MC-12), group links, then one section per group with anchor ids (`#sell-online` …) and a 2/4-across grid of 4:5 phone scenes. A feature with no picture is a grey tile with its name.
  - `/features/[slug]`: the scene with the name as h1, a link back to its group, the tagline + summary + body (panel rich text), HOW IT WORKS steps, MORE FEATURES (its group first, 4 in all), GET STARTED. generateStaticParams + `dynamicParams` + revalidate 60, so a new panel feature builds on first visit (not tried with a real new record). An unknown slug answers 404.
  - Panel shots, tried 2026-11-17: the browser pane can't hand files out. It blocks pages from reaching localhost (ERR_BLOCKED_BY_CLIENT), and downloads don't land on disk. The way that's left is **Claude in Chrome**: `computer screenshot save_to_disk` at a 1440×900 window, with the user signed in to commerce.mintapp.site in their own Chrome. The extension wasn't connected; the user is to connect it later. Claude never types the password.

- **2026-11-16 — MC-04 (storefront part), MC-05, MC-06 done; MC-13 mostly done.** Next: **MC-07 features pages**.
  - Site repo `aiasifistiaque/mint-commerce-website` (private, main), local folder `e-mint/mint-commerce-website`, port 3660. Vercel project `mint-commerce-website` (prj_TDIAvMVlFjnl0QZtwbKGadbTM1B3) is Git-linked, so a push to main deploys. https://commerce.tcrypt.site is live with the home page.
  - MC-04 pictures: 23 demo scenes (6 × desktop 16:9 + phone 4:5 + gallery) in media folder `demos`, and 12 feature scenes for the 6 storefront features in `features`. All are linked to the records. Sobuj Basket has no category gallery picture (its category page is mostly out-of-stock placeholders). Site share picture = the store-website scene.
  - Scene tools live in the session scratchpad (`mc04/tools`: shoot.mjs = CDP shot, all.mjs/extras.mjs = drivers, scene.py = PIL laptop+phone / two-phone scenes with a status-bar strip so the island never covers the page, build.py = every scene). If the scratchpad is gone, rebuild from this description.
  - **Waiting on the user:** the commerce panel shots (MC-04 second half: 20 run-it/shop/delivery/get-paid features + Panel screens). They need a sign-in on production commerce.mintapp.site, and Claude does not type passwords there. Until then those features have no picture, and the home page shows those groups as plain text rows.
  - **Waiting on the user:** the server key for `MINT_SERVER_KEY` (Vercel) and the test lead.
  - Home (MC-06): the hero = the first demo's scene; one panel per group (the group's showOnHome feature with a picture, else a text row); TRY A DEMO grid; WHAT IT COSTS from Plans + Build options; 7 DAYS steps; GET STARTED. Words come from `/` contents sections `hero`, `demos`, `price`, `days`, `get-started` (seed until MC-12 makes them). Over pictures, the links row is hidden on phones.
  - `pageMeta` falls back to the site's ogImage, because a page's openGraph replaces the layout's. This replaces a per-page `opengraph-image.tsx` (the share picture can be changed in the panel).

- **2026-11-16 — MC-01…03 done.** Next: **MC-04 pictures**, then MC-05 scaffold.
  - MC-01: settings, contact (copied from Thinkcrypt), SEO defaults, domains `[commerce.tcrypt.site]`, origin set, canonical commerce.tcrypt.site, robots `Disallow: /api/`. Logos are in media folder `brand`: MINT tile `…/1794844390317_icon.svg` (logo + favicon) and Thinkcrypt `…/1794844392102_thinkcrypt.svg`. The 512px PNG tile ships as the site's own `app/icon.png` in MC-05 (base64 upload is too big for a tool call). ogImage is still empty until MC-04.
  - MC-02: models Feature `features`, DemoStore `demo-stores`, Plan `plans`, BuildOption `build-options`, PanelScreen `panel-screens`, Integration `integrations` (public list/get), Lead `leads` (codes LD-0001; no public read). Endpoint `POST /leads` is **server key only**: it writes only the form fields (status/notes read-only) and sends back `code, kind`. An anonymous POST answers 401 `key_required` (checked). Automation "Tell the team about new leads" notifies the project owner and emails connect@thinkcrypt.dev (placeholders can't use `{{code}}`).
  - The demo password field is **`demoAccess`**, a plain text field. The builder refuses a text field named "password", and the password kind is masked; these logins are public on purpose.
  - **Waiting on the user:** make a server key (panel → API → Keys) for MC-13 `MINT_SERVER_KEY`. The MC-02 "test lead" check runs once it exists.
  - MC-03: 3 plans, 3 build options, 6 demo stores (ec-demos copy + logins + highlights), 8 integrations, 26 features (checked list in CHANGELOG). `create_records` with 26 features timed out on the connector but finished on the server: query before you retry.

- **2026-11-16 — MC-00 done, answers folded in.** The plan, WOs and `STATE_SO_FAR.md` are written. Q1–Q5 are answered: the final address is commerce.thinkcrypt.dev, the user adds the DNS record, and the panel stays at commerce.mintapp.site. Nothing is built yet, and **the user asked for work orders only, so wait for their go**.
- The **Mint Commerce** website project (the "new project") already exists in the tenant panel: `mint-2-mint-commerce`, MCP connector 6fd2f8e3, key `mint_pk_135148ce…`. It is empty. Next: MC-01.
- The Mango She page was read in the built-in browser on 2026-11-16. Its measurements are in the README table: 56px header, 13px/600 uppercase nav, 68px/600 uppercase headings over full-screen photos, grey footer.
- Pitfalls collected from the sibling sites:
  - No `next/font/google` (the Vercel build fails) and no `next/image` optimizer.
  - No `toLocaleString` in rendered text.
  - Publish typed contents with `publish_entry`, or the site shows nothing. `fill_page` gives random slugs; fix them with `save_entry_draft {slug}`.
  - The public API caps a page at 100 records.
  - `upload_media` needs a public URL (≤10 MB).
