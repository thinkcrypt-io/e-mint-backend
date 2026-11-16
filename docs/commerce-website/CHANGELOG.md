# Mint Commerce website — changelog

## 2026-11-17 — MC-09 Get started
- `/get-started` (541e881): four questions — design (from Build options), how many products (size chips or numbers), where you sell today (+ "we move it" note for WooCommerce/Shopify/own site), "I need features built for me" — then name/phone/email/shop. The price shows live in a sticky ink card (a bar at the bottom on phones). Sends an `estimate` Lead through `app/api/lead`, which prices it again; "Moving from: …" goes in the message. Thank-you shows the lead code, the estimate and WhatsApp.
- Links preselect it: `?stage=start|selling|scale` (stage finder, pricing tiers), `?from=WooCommerce` (Switch), `?custom=1` ("Tell us what you need"), `?design=<build value>`.
- Then "What happens next" (4 steps) and questions; words from contents `/get-started` `intro`, `next`, `faq` (seed until MC-12).

## 2026-11-17 — The commerce OS rework (the user's asks)
- **Shorter hero, Shopify corners** (ca7390d): the hero fits one laptop screen; radius tokens (10/16/22/28px), pill buttons, rounded hero box and pictures.
- **42 features in 7 groups** (f80ba1b): Your website, Products & search, Sell in your shop, Delivery, Payments & invoices, Automations, Run your business. New in the panel: Products, Product variations, Product specifications, Built with Next.js, Zero loading screens, SEO for every page, Every word from your panel, Wishlist, Bulk product upload, Smart search, Search insights, bKash and SSLCommerz, Invoice generation, Automations, Email invoices, Delivery automation, Webhooks, Dashboard, Analytics, Edit history, Connect your AI, The panel on your phone, Two-step sign-in and more. The Feature model got `points` (tags), `faq` (question/answer list) and `focus` (yes/no). Focus: Next.js, zero loading, invoice generation, automations, email invoices, delivery automation, connect your AI, bulk upload. bKash/SSLCommerz are shown because the user asked for them (the code exists; no demo checkout takes them yet).
- **Scenes** (`components/Scene.tsx` + `components/mocks.tsx`): Shopify-style pictures made in HTML/CSS: a deep-coloured grid per group, a CC0 photo (`public/scenes`, stocksnap.io + the WordPress photo directory) and one or two floating panel drawings (38 drawings: courier, product table, analytics, invoice, email with PDF, automation flow, AI chat, POS…). One scene per feature by slug. **Showcase cards** (`ShowCard`): white rounded cards with a drawing on top, title and line, in bento grids.
- **Feature pages**: split hero with the scene and Get started / Try a demo, What you get (points), the body as numbered sections, the real panel shot when there is one, How it works, Questions, "Works together with" cards, the commerce-OS band.
- **/features**: highlights (focus features) as a bento, then each group with its scene and a card per feature, then "we build what you need".
- **Home**: "The AI-powered commerce OS · Take your shop beyond Facebook"; six core picture cards (custom design, zero loading, managed hosting, payments, couriers, AI); four number cards opening How it works / Pricing / Hosting / Features; **Where is your business today?** (getting started → Instant Store, already selling → Custom Store, scaling → Scale tiers, prices from the panel); an "Everything in one panel" showcase; spotlights on analytics + smart search and on automations + email invoices (SMS/WhatsApp marked Coming soon: MK-02… not built); how we compare (vs template store builders and a Facebook page only); switch to us (WooCommerce, your own site); we build what you need; demos; how an order works; 7 days; questions.
- **New pages**: `/pricing` (tiers by stage, build once `#build`, managed hosting `#hosting`, all features in every plan, questions), `/how-it-works` (the week day by day, we/you, what we need, after you go live), `/switch` (what we move, the four steps, comparison, questions).
- **Larger type**: body 17px, labels 14px, new `.headline` / `.subhead` / `.lead`; the header menu lists all 42 features in 7 columns and gains How it works + Switch to us.

## 2026-11-17 — Header, hero lead box, worry-free section (the user's asks)
- **Header**: logo left; FEATURES opens a drop-down of the five jobs with their features (from the panel, via the layout), DEMOS, PRICING; DEMO LOGIN + GET STARTED right; 64px on desktop. Phones: logo, GET STARTED (hidden under 380px), menu with the jobs inside FEATURES and Try a demo / Get started at the bottom. Links only to built pages plus /pricing and /get-started (MC-09). The drop-down lists every feature with its tagline under its job (like Shopify's Products menu), each opening its own /features/[slug] page; the phone menu lists them too.
- **Hero** shows the HINT store (Muse & Mode, `hero.demo` = `muse-and-mode`) and a dark box: the price, one field for an email or phone number, an arrow button → a callback Lead, then "We'll get back to you as soon as possible". `app/api/lead` takes `contact`; an email-only lead is saved with Phone "—" (Leads requires Phone) and a note to reply by email.
- **Try a demo** moved up under the numbers. The black "Everything included" band became "You don't need to worry about any of it": 26 features all included, AI tools powered by MCP, hosting and storage included.

## 2026-11-17 — Home + features rework (the user's ask)
- **Home** is now a selling page, "more like how Shopify works": the hero says what it is (your own store website + one panel), live in 7 days, from BDT 25,000 once + BDT 500/month, with Get started / Try a demo. Then four numbers (7 days, build price, monthly price, feature count), the stores built on it, one section per job (benefit headline, its features, a shot or a big-type panel), "Everything included" with all 26 features, how an order works, who it's for, build and hosting prices side by side, 7 days, demos, questions.
- **/features** reads on its own: the five jobs at a glance, then every feature with its tagline, what it does, the longer text and "How you use it" steps.
- Feature groups have a one-line description (`GROUPS[].line` in `lib/mint.ts`). Four taglines that repeated their group name were changed in the panel (point-of-sale, cash-on-delivery, one-orders-page, store-website).

## 2026-11-17 — MC-08
- **MC-08** `/demos` (the six stores, plus every panel login in one list with copy buttons) and one page per demo (open the store, sign in to its panel, gallery, what it shows off).

## 2026-11-17 — MC-07
- **MC-07** `/features` (every built feature in group sections, anchors for the home and header links) and one page per feature (picture, what it does, how it works in 3 steps, more features). New panel features show up without a deploy.

## 2026-11-16 — MC-04 (storefront), MC-05, MC-06
- **MC-04** Shot all 6 demo stores (home, product, category, plus search and sign-in pages) at 1440×900 and 390×844 with headless Chrome. Made studio scenes (laptop + phone 16:9, two phones 4:5, soft warm/stone/sand/mist backdrops), uploaded them to the media library, and linked them to every Demo store (image, imagePhone, gallery) and the 6 storefront Features. The site share picture is set. Panel screens wait for a sign-in.
- **MC-05** The site: Next 16, Tailwind v4, Instrument Sans, Mango look (56px header, closeable bar, full-picture panels, grey footer with the call-back form and both logos), panel data with seed fallback, lead route, robots + sitemap, track.js. Live at commerce.tcrypt.site.
- **MC-06** Home page: YOUR STORE ONLINE IN 7 DAYS, one panel per job, TRY A DEMO, WHAT IT COSTS, 7 DAYS, GET STARTED.

## 2026-11-16 — MC-01, MC-02, MC-03
- **MC-01** Site setup of the Mint Commerce project (connector now fb74b56e): name, tagline, MINT tile logo + favicon, ink/white, Instrument Sans, Thinkcrypt contact + socials, SEO defaults, footer text, domain commerce.tcrypt.site, canonical, robots.
- **MC-02** Seven models in a new "Mint Commerce website" sidebar category. Public list/get on all except Leads. Leads: server-key create endpoint + team notify/email automation.
- **MC-03** Seeded, built features only. Checked in code and the commerce panel before seeding:
  - **In (26):** store website, typo-tolerant search, sizes & colours, categories & collections, customer accounts, Google-ready pages, POS (scan, held sales, split payment, receipts), stock per branch with transfers and counts, store credit, send to Steadfast/Pathao/RedX, buyer check, delivery charges by area (shipping rates), cash on delivery, returns, one orders page, staff logins, store settings, discounts & coupons, VAT, invoices/receipts, order emails, automatic actions, visitor analytics, media library, history, Ask your AI.
  - **Left out:** bKash, SSLCommerz and Stripe. The backend has the code (`library/functions/payments/`), but no demo storefront checkout takes them today; Live Fresh's SSLCommerz is still pending. Also left out: barcode/price labels (no label printing in the panel), register shifts (EC-11 open), wishlist (EC-31 not deployed), plus the not-built list in WORK_ORDERS MC-03.
  - Integrations seeded: Cash on delivery, Steadfast, Pathao, RedX, Paperfly + CarryBee (buyer check only), Claude, ChatGPT.

## 2026-11-16 — MC-00 plan
- Plan (`README.md`, D1–D12, site map, models), work orders MC-01…MC-17 with Q1–Q5, and `STATE_SO_FAR.md`, which
  records everything built for Mint Commerce so far (store engine, commerce panel + MCP, 6 demo stores, Thinkcrypt
  selling pages, connectors, logos).
- Found the **Mint Commerce** website project already in the tenant panel (`mint-2-mint-commerce`, connector 6fd2f8e3),
  empty. The website will run on it.
- Folded in the user's answers. The look is the Mango "She" page (measured live: 56px header, 13px/600 uppercase nav,
  68px uppercase headings over full-screen photos, grey footer). Final domain **commerce.thinkcrypt.dev**, with the DNS record added by the user (the panel stays at commerce.mintapp.site). Built
  features only, with the checked seed list and the left-out list in MC-03. Easy Instant Commerce prices. Leads in the
  new project. Work orders only for now; nothing built.
