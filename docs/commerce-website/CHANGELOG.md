# Mint Commerce website — changelog

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
