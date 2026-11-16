# Mint Commerce — everything done so far (as of 2026-11-16)

A starting point for another Claude. It lists every piece of Mint Commerce built so far, where it lives,
how it is deployed and what is still open. The plan for the new marketing website is in `README.md`, and its
work orders are in `WORK_ORDERS.md`, both in this folder.

Names, so they don't get mixed up:

| Name | What it is | Address |
|---|---|---|
| **Mint Commerce** (product) | MINT's e-commerce offer: an `ecommerce` project type (store engine, POS, couriers, search, discounts) plus a store-only panel | — |
| **Commerce panel** | The panel store staff sign in to, repo `mint-commerce` | https://commerce.mintapp.site |
| **Mint Commerce website** (new, this plan) | The marketing website for the product | commerce.tcrypt.site now, commerce.mintapp.store later |
| **Easy Instant Commerce** | Thinkcrypt's done-for-you offer built on Mint Commerce: we build and host the store | thinkcrypt.dev/easy-instant-commerce |

## 1. The store engine (backend + tenant panel)

All in `backend` (branch `v3` → remote `mint`; the user deploys Heroku by hand) and `mint-tenant` (main → app.mintapp.shop).

| Area | Plan / WOs | State |
|---|---|---|
| E-commerce project type: setup wizard, blueprint models, catalogue + variants + stock per outlet, orders engine, POS, Orders/Returns pages, categories, site kit, website orders | `docs/ecommerce` EC-01…EC-26 | Mostly done. EC-08 gateway refunds/exchange, EC-10 pay-by-link, EC-11 shifts, EC-12 roles still to do |
| Tax automations | `docs/ecommerce/TAX_AUTOMATIONS.md` EC-35…40 | done 2026-11-02 |
| Discounts + collections | `docs/ecommerce/DISCOUNTS.md` EC-41…47 | done, deployed 2026-11-06 |
| Wishlist + product views | EC-31 | backend done 2026-11-10, not deployed |
| Couriers: Steadfast / Pathao / RedX on the store's own accounts; buyer check (incl. Paperfly, CarryBee) | `docs/couriers` CR-02…26 | deployed (v269) 2026-11-14; real accounts unverified |
| Store search (typo-tolerant, suggestions) | `docs/search` SI-02…20 | deployed 2026-11-13; semantic search off on prod |
| Store marketing (SMS/email campaigns etc.) | `docs/marketing` MK-01…21 | planned only |
| Autofill, key values, PDF invoices/receipts, automations, email designs | their own docs folders | built; see MEMORY |

The Thinkcrypt pages list features that are **not built yet**: abandoned carts, lost-customer analysis, stock
forecasts, accounting, loyalty, gift cards, reviews, suppliers/POs, Meta/Google feeds, multi-currency, mobile app.
The user asked for these to be listed **without "coming soon"** (2026-10-28). The new website keeps a
`status` per feature so this can be changed in one place (see README D7).

## 2. Commerce panel (store logins)

`docs/commerce-panel/README.md` — CP-01…07, all done 2026-11-16.

- A store login is a **PanelAdmin** (one email = one store). Managers make logins in mint-tenant → Project → Panel admins.
- App `e-mint/mint-commerce` (private repo `aiasifistiaque/mint-commerce`, main), Vercel project `mint-commerce`,
  **https://commerce.mintapp.site** (push main = deploy). A copy of mint-tenant at 5cb41ee with `IS_COMMERCE_PANEL`.
  Developer screens are hidden. Store settings and Site settings are on, and so are couriers and email.
- **Store-login MCP** at `/tenant/commerce-mcp` (CP-07). Keys are made in the commerce panel → **Connect AI**. It has
  only the `PANEL_TOOLS`: list_models, query/create records, media, entries, stock, variants, deliveries,
  check_buyer, search insights, enrich_products. CP-06/07 are backend commit f2632020: **check that the user
  deployed it** (probe `/tenant/commerce-mcp`).
- Demo logins admin1–6@mintapp.site, one per demo store, are shown publicly: `docs/commerce-panel/DEMO_LOGINS.md`.

## 3. Demo stores (storefronts)

Each storefront is its own Next.js repo. Push to main deploys it on the e-mint Vercel Hobby account, and tcrypt.site DNS is on Vercel.

| Demo name on the sites | Storefront | Repo (folder) | Port | Mint project (MCP connector) | Panel login |
|---|---|---|---|---|---|
| Sobuj Basket | https://live-fresh.vercel.app | live-fresh-frontend | — | Verte `mint-2-verte` (d9ff1a1c) | admin1 |
| Deshi Bhandar | https://gbazar.tcrypt.site | gbazar-site (`~/Desktop/proj/gbazar-site`) | 3620 | GBazaar `mint-2-gbazaar` (343b9514) | admin2 |
| Thread Theory | https://fl.tcrypt.site | fabrilife-site | 3630 | Fabrilife `mint-2-fabrilife` (1684596d) | admin3 |
| Loomline | https://fbl.tcrypt.site | woovely-site | 3640 | Fabrilife (same store) | admin4 |
| Circuit Bazaar | https://tech.tcrypt.site | thinktech-site | 3650 | Think Tech `mint-2-think-tech` (b7e68a4f) | admin5 |
| Muse & Mode | https://hint.tcrypt.site | hint-site (repo mint-commerce-hint) | 3610 | HINT `mint-2-hint` (260dc75c) | admin6 |

Live Fresh git pushes are blocked on Vercel (author mapping). It deploys through the API with the user's OK.
HINT's home page is the **Mango-style** layout (`components/home/MangoHome.tsx`: Instrument Sans, 12px/600
uppercase nav, 55px navbar). That is the look the user means by "like Mango".

## 4. Selling pages that exist today (Thinkcrypt website)

`e-mint/thinkcrypt-website` (www.thinkcrypt.dev, Mint project "Thinkcrypt Website", MCP 8cd8828a; push main = live).

- **/products/mint-commerce**: panel page with typed contents. Hero, 12 feature rows with `illustration-mc-*`
  pictures, a 16-card "Also included" grid, 20 integrations, 5 steps, an `interest` sign-up (→ Product interest
  model), 7 FAQs and a CTA. **This is the source for the new site's feature copy.**
- **/easy-instant-commerce** + **/easy-instant-commerce/get-started**: hero ("live in 7 days"), why switch from
  WooCommerce, demo stores, 7 included features (`ec-*-dark.svg` pictures), 12 more, custom features, pricing,
  how it works, FAQ and estimate. Demos = model **EcDemo** (`ec-demos`, 6 records with screenshots). Leads =
  model **EcLead** (`ec-leads`, server key only, via `app/api/ec-lead`). Prices live in code, in `lib/easyCommerce.js`:
  hosting Starter 500 / Growth 1,500 / Unlimited 2,500 BDT a month, and the build 25,000 / 45,000 / 75,000, up to 1,00,000.
- The nav menu is hard-coded in `data/sidebar.data.js`.

## 5. MCP connectors (ids change when a connector is re-added: check with `get_site` / `describe_website`)

| Connector | Project |
|---|---|
| **6fd2f8e3** | **Mint Commerce** website project, `mint-2-mint-commerce`, key `mint_pk_135148ce…`. **Empty**: no pages, no settings, no domains. The new website runs on it |
| b2cf1673 | MINT (`mint-2-mint`, mintapp.shop) |
| 8cd8828a | Thinkcrypt Website |
| 11fbae46, 707be96b | other website projects |
| 1684596d, d9ff1a1c, 343b9514, 260dc75c, b7e68a4f | the demo stores (table above) |
| 09c33332, 20bfd3cf, 49758082, e476de81 | other app projects |

## 6. Logos and brand pieces

- MINT logo: `mint-webpage/src/app/icon.svg` (gradient tile with one-stroke M + AI spark) and `mint-webpage/src/components/site/Logo.tsx`.
- Thinkcrypt logo: `thinkcrypt-website/public/logo/thinkcrypt.svg` (also `thinkcrypt2.svg`, `bigThinkcryptFooter.svg`).
- Illustrations already in media libraries (public S3 bucket arewabooks): `illustration-mc-*.webp` (overview,
  variants, pos, payments, courier, marketing, abandoned-cart, lost-customers, ai-assistant, stock-analysis, accounting),
  `illustration-svc-ecommerce/apis.webp`, `ec-*-dark.svg` (store, payments, couriers, panel, ai, seo, automations),
  demo screenshots `*_thinktech/woovely/fabrilife/gbazar/hint-2x/livefresh.webp`.

## 7. Open / waiting on the user

- Backend deploy of CP-06/07 (if not done yet), EC-31 and other "not deployed" items (see MEMORY).
- `commerce.mintapp.store`: is the domain bought, and where is its DNS? (WORK_ORDERS Q2)
- Test records left on live stores: WEB-00001 on GBazar, Fabrilife, HINT, Verte; a test customer on GBazar.
