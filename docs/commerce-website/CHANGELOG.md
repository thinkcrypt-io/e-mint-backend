# Mint Commerce website — changelog

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
