# Mint Commerce website — plan

Asked 2026-11-16: "for mint commerce plan a full website, commerce.mintapp.store, with thinkcrypt and MINT logo, should
be a full website with theme very easy to use, more like the website mango, easy to understand features. deploy to
commerce.tcrypt.site, create a new project on tenant panel, use the mint commerce mcp, use the data from the existing
panel … Images, features, demos should be from the tenant panel of mint commerce mcp, connect the url too so that we
can check analytics, should have thinkcrypt logo."

Answers the same day: the look is **https://shop.mango.com/gb/en/h/brandid_she** ("the vibe must look like this").
Domain: **mintapp.site**. Show **built features only**; more get added later from the tenant panel. Prices: the
same as Easy Instant Commerce ("this is for instant commerce with a new url"). Leads: in the **new project**.
"Write the work orders only for now."

What was built before this plan: `STATE_SO_FAR.md`. Work orders + handoff: `WORK_ORDERS.md`.

## Goal

A full website for **Mint Commerce** that sells the **Easy Instant Commerce** offer on its own address: we build your
store website plus the panel to run it, and we host it. A shop owner should know in five minutes:
- what they get
- what it looks like: live demo stores they can open, and panels they can sign in to
- what it costs
- how to start

Every word, picture, feature, demo and price comes from the **Mint Commerce** project in the tenant panel. It can be
changed there without a deploy. Its visits show in that project's Analytics.

## The Mango "She" look (checked on the live page 2026-11-16)

What the page does, and what we copy (the feel, not their pictures, font files or logo):

| Mango | Ours |
|---|---|
| A 56px white header. Section links on the left (WOMEN · MEN · TEEN · KIDS · HOME, 13px uppercase 600, the current one underlined), the wordmark in the centre, SEARCH · LOG IN · WISHLIST · BAG on the right | A 56px header. Links on the left (FEATURES · DEMOS · PRICING · PANEL), the **MINT COMMERCE** wordmark with the MINT M tile in the centre, and on the right DEMO LOGIN · CONTACT · **GET STARTED**, which is a black text button. On phones: a centred logo, a menu icon on the left, and a full-screen white menu of big uppercase links |
| A thin grey announcement bar under the header, 13px uppercase, with a close × | The same: "LIVE IN 7 DAYS · BUILD FROM BDT 25,000", text from the panel, and it can be closed (remembered in localStorage) |
| A stack of **full-screen picture panels**. Each has a huge uppercase heading (68px, weight 600, white, centred), category links in a row under the first one, and a small "DISCOVER MORE" text link | A stack of full-screen panels. Each is one big picture (a demo store or a panel screen in a laptop/phone scene) with a huge uppercase heading over it ("YOUR STORE", "SELL IN YOUR SHOP", "DELIVERY", "GET PAID", "ASK YOUR AI") and a small "SEE HOW" link. The first panel has the job links in a row |
| No cards, no shadows, no rounded corners, no colour except the photos. Text is #121212 on white | The same rules. Pictures give the colour. A single accent is allowed only for focus rings |
| Body 13px, one sans family for everything (a heading cut + a text cut) | **Instrument Sans** (the font HINT used for this look, from @fontsource and served locally) for everything. Body 15px on our pages because we have more words than Mango; nav and labels 13px uppercase 600 |
| Lists are edge-to-edge photo grids with a small caption under each picture | Features, demos and panel screens are edge-to-edge picture grids (2 across on phones, 4 on desktop) with a small uppercase name and one line under each |
| A grey footer: newsletter sign-up line, socials, 4 columns of uppercase links | A grey `#f2f2f2` footer: "Get a call back" line (phone field → Leads), socials and WhatsApp, 4 columns of uppercase links, then a bottom row: "A THINKCRYPT PRODUCT · BUILT ON MINT" with both logos |

## Decisions

| # | Decision |
|---|---|
| D1 | **The look is Mango "She"**, as in the table above. It is easy to use because every screen is one big picture, one big word and one link. No feature walls, no tabs, no carousels with arrows, no pop-ups. Light only. No backdrop blur. |
| D2 | **Easy to understand.** Each feature is said as a job a shop owner does ("Send an order to your courier in one click"), not as a module name. One picture, one sentence, then a page with 3–5 steps. Plain words: "connect your AI", not "MCP". |
| D3 | **Two logos.** The header has the Mint Commerce wordmark with the MINT M tile (`mint-webpage/src/app/icon.svg`). The footer bottom row and the About page have "A Thinkcrypt product · built on MINT" with the Thinkcrypt logo (`thinkcrypt-website/public/logo/thinkcrypt.svg`) and the MINT logo. The favicon is the MINT tile. |
| D4 | **A new project holds everything**: the **Mint Commerce** website project in the tenant panel (`mint-2-mint-commerce`, MCP connector 6fd2f8e3 on 2026-11-16, key `mint_pk_135148ce…`). It is already made and empty. Page words come from its site kit (Pages + typed Contents, published with `publish_entry`). Lists are models with public read endpoints: **Features**, **Demo stores**, **Plans**, **Build options**, **Panel screens**, **Integrations**. **Leads** take server-key create only. The site's seed copy shows only when the panel is down. |
| D5 | **Built features only** (the user, 2026-11-16). A feature is seeded only when it works on the live stores today. Anything else is left out and added later as a new Features record from the tenant panel. The site shows whatever records are there, so there is no "coming soon" and no status switch. MC-03 has the checked list. |
| D6 | **The seed data is copied from the existing panels and then owned by the new project.** The words come from the Thinkcrypt pages `/easy-instant-commerce` (first) and `/products/mint-commerce`, with the built ones only. The 6 demos come from Thinkcrypt `ec-demos` and the logins from `commerce-panel/DEMO_LOGINS.md`. The prices come from `thinkcrypt-website/lib/easyCommerce.js`, the same Easy Instant Commerce prices. |
| D7 | **The pictures are real and big.** Mango's look depends on full-screen photos, so every panel needs a strong picture. Demo stores are shot live (home, category, product, cart) and so is the commerce panel, signed in with the public demo logins. Shots are taken in headless Chrome over CDP and framed as laptop/phone scenes on soft neutral studio backgrounds (Mango's photo feel), at a 16:9 desktop crop and a 4:5 phone crop of the same scene. Pictures are always shown whole inside their panel. Everything goes in the new project's media library. |
| D8 | **Analytics**: `track.js` with the project key in the root layout, Mint Analytics on, `visitorIp` full. The site's addresses are added in Site setup (origin + domains) and in Analytics → Add domain. Lead buttons call `MintAnalytics.track('lead', …)`. Page SEO comes from the kit, like thinkcrypt-website's `lib/mintSeo.js`. |
| D9 | **Repo + deploy**: new folder `e-mint/mint-commerce-website`, private repo `aiasifistiaque/mint-commerce-website` (main), Vercel project `mint-commerce-website` on the e-mint Hobby account. It is Git-linked, so a push to main deploys it. The stack is Next 16 App Router + Tailwind v4, ISR 60s, `images.unoptimized`, with no `next/font/google` and no `next/image` optimizer. Dev port **3660**, launch config `mint-commerce-website`. |
| D10 | **Addresses**: first **commerce.tcrypt.site**, as asked. The final address is on **mintapp.site** (the user's answer; its DNS is on Vercel, so the address is added on the Vercel project and needs no record). `commerce.mintapp.site` is already the store-login panel, so the website takes another name. The working assumption is **instant.mintapp.site** (Q6 in WORK_ORDERS). Canonical URLs use `NEXT_PUBLIC_BASE_URL`, so the switch is one env change. |
| D11 | **Get started** = the Easy Instant Commerce estimate: a plan by product/image count + a design choice + custom features. It is worked out again on the server and sent to **Leads** in the new project. A "team" automation notifies and emails connect@thinkcrypt.dev. WhatsApp button +8801828398225. |
| D12 | Phones first: every page is checked at 390px with no sideways scroll. Every page gets `pageMeta` + its own OG image, using Instrument Sans read from local files and never fetched at build. |

## Site map

| Page | What it shows (Mango-style: full-screen panels unless said) | Data |
|---|---|---|
| `/` Home | Announcement bar. Panel 1 "YOUR STORE ONLINE IN 7 DAYS", a demo store shot with the job links. Panels 2–6, one per job: SELL ONLINE · SELL IN YOUR SHOP · DELIVERY · GET PAID · RUN IT YOURSELF. Then a picture grid "TRY A DEMO" (6 demos), a "WHAT IT COSTS" price strip (from BDT 25,000 + 500/month), "7 DAYS" in five steps, and a GET STARTED panel | contents `/`, Features (showOnHome), Demo stores, Plans, Build options |
| `/features` | Picture grid of every feature, grouped under big uppercase group names | Features |
| `/features/[slug]` | A full-screen picture with the feature name, then one paragraph, 3–5 numbered steps with pictures, a "MORE FEATURES" grid and a GET STARTED panel | Features |
| `/demos` | Picture grid of the 6 demo stores. Each opens its page | Demo stores |
| `/demos/[slug]` | A full-screen shot of the store, then OPEN THE STORE + OPEN ITS PANEL with the email and password (copy buttons, "shared demo, please don't delete data"), a gallery strip (home, product, cart, panel) and what this demo shows off | Demo stores |
| `/panel` | Tour of the store panel: one full-screen panel per screen (orders, POS, products & sizes, stock, couriers, settings, analytics, staff logins) | Panel screens |
| `/ai` | "ASK YOUR STORE": what you can ask, what it can't see, how to connect (Connect AI page) | contents `/ai`, Panel screens (area ai) |
| `/pricing` | Build once (3 options) + hosting by size (3 plans), what's included, price FAQ | Plans, Build options, contents |
| `/get-started` | The estimate form on white, price shown live, "we'll call you", thank-you with the lead code | Plans, Build options → Leads |
| `/how-it-works` | Day 1 to Day 7, who does what (you / us) | contents |
| `/switch` | Moving from WooCommerce or a Facebook page: what we move, how old links keep their Google rank | contents |
| `/integrations` | Payments and couriers that are live today, as a logo grid | Integrations |
| `/about` | Thinkcrypt × MINT: who builds it, both logos | contents |
| `/contact`, `/faq`, `/privacy`, `/terms`, 404 | Plain white text pages in the same type | contents |

## Models in the new project (MC-02)

| Model (route) | Fields |
|---|---|
| Features (`features`) | name, slug (uid), group (choice: sell-online, sell-in-store, delivery, get-paid, run-it), tagline, summary (one line), body (rich text), steps (sectionlist title/description/image), image (16:9), imagePhone (4:5), showOnHome, order, isActive |
| Demo stores (`demo-stores`) | name, slug, kind, summary, image, imagePhone, gallery, siteUrl, panelUrl, loginEmail, loginPassword, highlights (tags), order, isActive |
| Plans (`plans`) | name, value, pricePerMonth, products (0 = unlimited), images (0 = unlimited), note, order |
| Build options (`build-options`) | label, value, price, priceMax, note, order |
| Panel screens (`panel-screens`) | title, area (orders/pos/products/stock/couriers/settings/analytics/ai/staff), caption, image, imagePhone, order |
| Integrations (`integrations`) | name, group (payments/couriers/marketing/ai), logo, note, order |
| Leads (`leads`) | code (LD-), kind (estimate/callback/contact), name, phone, email, shopName, whatSell, productCount, imageCount, design, customFeatures, message, estimateMonthly, estimateBuild, estimateBuildMax, page, status (new/called/won/lost; read-only for the endpoint), notes |

Public list/get on everything except Leads. Leads are created with the server key only: the site's `app/api/lead` route posts with `MINT_SERVER_KEY`.
