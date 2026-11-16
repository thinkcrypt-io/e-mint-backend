# Mint Commerce website — plan

Asked 2026-11-16: "for mint commerce plan a full website, commerce.mintapp.store, with thinkcrypt and MINT logo, should
be a full website with theme very easy to use, more like the website mango, easy to understand features. deploy to
commerce.tcrypt.site, create a new project on tenant panel, use the mint commerce mcp, use the data from the existing
panel … Images, features, demos should be from the tenant panel of mint commerce mcp, connect the url too so that we
can check analytics, should have thinkcrypt logo."

What was built before this plan: `STATE_SO_FAR.md`. Work orders + handoff: `WORK_ORDERS.md`.

## Goal

A full marketing website for **Mint Commerce**. A shop owner reads it in five minutes and knows four things: what they get,
what it looks like (live demo stores they can open and panels they can sign in to), what it costs, and how to start.
Every word, picture, feature, demo and price comes from the **Mint Commerce** project in the tenant panel. It can be
changed there without a deploy, and its visits show in that project's Analytics.

## Decisions

| # | Decision |
|---|---|
| D1 | **Look = Mango (mango.com)**, the same reference as HINT's `MangoHome.tsx`. White page, black type, big full-width pictures, thin small-caps navigation (12px, letter-spaced), a 55px header, lots of space and almost no colour. One accent, Mint green `#10b981`, is used only on the main button and links. Font **Instrument Sans** (via @fontsource, served locally, never `next/font/google`; see emint-vercel-account). Light only, at first. |
| D2 | **Easy to understand.** Every feature is said as a job a shop owner does ("Send an order to your courier in one click"), not as a module name. Each one gets one picture and one sentence, and opens to a page with a few steps. No jargon (MCP is "connect your AI"). Words follow the house style: short sentences, plain words. |
| D3 | **Two logos.** The header shows the Mint Commerce wordmark with the MINT M tile (`mint-webpage/src/app/icon.svg`). The footer and About page show "A **Thinkcrypt** product · built on **MINT**" with both logos (Thinkcrypt `thinkcrypt-website/public/logo/thinkcrypt.svg`). The favicon is the MINT tile. |
| D4 | **Data lives in the Mint Commerce project** (`mint-2-mint-commerce`, MCP connector 6fd2f8e3 on 2026-11-16, key `mint_pk_135148ce…`). The project already exists and is empty, so no new project is needed. Page words come from the site kit (Pages + typed Contents, published with `publish_entry`). Lists are their own models with public read endpoints: **Features**, **Demo stores**, **Plans**, **Build options**, **Panel screens**, **Integrations**. Leads go to **Leads** (server key create only). The site's own seed copy is only the fallback for when the panel is down. |
| D5 | **Seed data is copied, not linked.** Features come from Thinkcrypt `/products/mint-commerce` (12 + 16 + 20 integrations) and `/easy-instant-commerce` (7 + 12 + 8 custom), merged and de-duplicated. The 6 demos come from Thinkcrypt `ec-demos` and the prices from `thinkcrypt-website/lib/easyCommerce.js`. After the copy, the Mint Commerce project owns them. |
| D6 | **Pictures are real.** Demo stores are shot live (home, product, cart) and so is the commerce panel, signed in with the public demo logins: orders, POS, product with sizes, couriers, store settings, Connect AI, analytics. The shots use headless Chrome over CDP (emint-browser-pane-testing), framed as laptop/phone scenes on a near-black grain background, and are always shown whole. Existing `illustration-mc-*` / `ec-*` art is reused where no screen exists yet. Everything goes in the Mint Commerce media library (`upload_media` by public URL). |
| D7 | Features not built yet are listed like the others, without "coming soon". That was the user's rule for the Thinkcrypt page on 2026-10-28. Each Feature record has `status` (live / building) so one switch can show or hide them. Ask before showing "building" ones on launch (Q3). |
| D8 | **Analytics**: `track.js` with the project key in the root layout, Mint Analytics on, `visitorIp` full. Domains `commerce.tcrypt.site` (and later `commerce.mintapp.store`) are added in Site setup (origin + domains) and in Analytics → Add domain. Lead buttons call `MintAnalytics.track('lead', …)`. SEO title/description per page come from the kit (`/site/head`, like thinkcrypt-website's `lib/mintSeo.js`). |
| D9 | **Repo + deploy**: new folder `e-mint/mint-commerce-website`, private repo `aiasifistiaque/mint-commerce-website` (main). The Vercel project `mint-commerce-website` sits on the e-mint Hobby account, Git-linked so a push to main deploys, at **commerce.tcrypt.site** (tcrypt.site DNS is on Vercel, so no record is needed). It uses Next 16 App Router + Tailwind v4 (the mint-webpage stack), static/ISR at 60s, `images.unoptimized` (no image optimizer anywhere). Dev port **3660**, launch config `mint-commerce-website`. |
| D10 | **commerce.mintapp.store** is the final address. Adding it waits on the domain (Q2). Until then commerce.tcrypt.site is the only address, and canonical URLs use `NEXT_PUBLIC_BASE_URL`, so the switch is one env change. |
| D11 | **Get started** = an estimate form (plan by product/image count + design choice, worked out again on the server) → Leads model, plus a "team" automation (notify + email connect@thinkcrypt.dev) as for Thinkcrypt's EcLead. WhatsApp button +8801828398225. |
| D12 | Phones first: every page is checked at 390px with no sideways scroll (rule from the marketing site). No backdrop blur. Every page gets `pageMeta` + its own OG image (Instrument Sans read from local files, never fetched at build). |

## Site map

| Page | What it says | Data |
|---|---|---|
| `/` Home | Hero ("Your shop online and in store. One simple panel."), **Try a demo** strip, 6 "what you can do" tiles (Sell online · Sell in your shop · Deliver · Get paid · Grow · Ask your AI), panel tour band, how it works (7 days), price teaser, FAQ, CTA | contents `/`, Features (showOnHome), Demo stores, Plans |
| `/features` | Every feature grouped by job (6 groups), picture + one line each | Features |
| `/features/[slug]` | One feature: big picture, what it does, 3–5 steps, related features, CTA | Features (body, steps, gallery) |
| `/demos` | 6 demo stores: screenshot, kind, **Open the store** + **Open its panel** with the email/password shown | Demo stores |
| `/demos/[slug]` | Gallery of that store (home, product, cart, panel) and what it shows off | Demo stores (gallery) |
| `/panel` | Tour of the commerce panel: orders, POS, products & sizes, stock, couriers, settings, analytics, staff logins | Panel screens |
| `/ai` | Connect Claude / ChatGPT: what you can ask, what it can't see, how to connect (Connect AI page) | contents `/ai`, Panel screens |
| `/pricing` | Build once (3 options) + hosting by size (3 plans), what's included, FAQ | Plans, Build options |
| `/get-started` | Estimate form → lead, "we'll call you" | Plans, Build options → Leads |
| `/how-it-works` | 7 days, day by day, and who does what (you / us) | contents |
| `/switch` | Moving from WooCommerce / Shopify / a Facebook page: what we move, keep your Google links | contents |
| `/integrations` | Payments, couriers, marketing, AI, API | Integrations |
| `/about` | Thinkcrypt × MINT: who builds it, both logos, other Thinkcrypt work link | contents |
| `/contact`, `/faq`, `/privacy`, `/terms`, 404 | — | contents |

Header: logo · Features · Demos · Pricing · Panel · AI · **Get started** (button). On phones it becomes a full-screen menu like Mango's.
Footer: four link columns, the demo logins link, WhatsApp, socials from Site setup, and "A Thinkcrypt product · built on MINT" with both logos.

## Models in the Mint Commerce project (MC-02)

| Model (route) | Fields |
|---|---|
| Features (`features`) | name, slug (uid), group (choice: sell-online, sell-in-store, deliver, get-paid, grow, ai-and-api), tagline, summary (one line), body (rich text), steps (sectionlist title/description), image, gallery (images), status (live / building), showOnHome, order |
| Demo stores (`demo-stores`) | name, slug, kind, summary, image, gallery, siteUrl, panelUrl, loginEmail, loginPassword, highlights (tags), order, isActive |
| Plans (`plans`) | name, value, pricePerMonth, products (0 = unlimited), images, note, order |
| Build options (`build-options`) | label, value, price, priceMax, note, order |
| Panel screens (`panel-screens`) | title, area (orders/pos/products/stock/couriers/settings/analytics/ai/staff), caption, image, order |
| Integrations (`integrations`) | name, group (payments/couriers/marketing/ai/developer), logo, note, order |
| Leads (`leads`) | code (LD-), name, phone, email, shopName, whatSell, productCount, imageCount, design, customFeatures, notes, estimateMonthly, estimateBuild, estimateBuildMax, page, status (new/called/won/lost, read-only for the endpoint) |

Public list/get on everything except Leads. Leads: create with the server key only, so the site's `app/api/lead` route posts with `MINT_SERVER_KEY`.
