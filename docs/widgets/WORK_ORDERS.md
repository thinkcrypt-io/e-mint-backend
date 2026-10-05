# Site widgets — work orders

Read `README.md` first. Sizes: S (an afternoon), M (a day), L (2–3 days).

## Handoff — read this first (last updated 2026-10-06)

**2026-10-06 — W-07 done** (CHANGELOG): Checkout, Thank-you and My orders
widgets (`routes-public/widgets/checkout.ts` serves both checkout and thanks;
`orders.ts`), `GET /shop/orders`, `Mint.cart.refresh()` / `Mint.money()`;
panel Payments page at **/site-payments** (`/payments` is the old platform's
page; `site-payments` is in PROJECT_PAGES) and the Shop's Orders part. Guides
live on **docs.mintapp.shop** now (`mint-docs`, the user's call 2026-10-06:
"we are discarding user-docs in app") — update guides there, not in admin.
**Next: W-07b** — SSLCommerz, bKash, cash on delivery, bank transfer,
refunds (adapters beside `payments/stripe.ts`, the same checkout → webhook →
`markPaid` path).

**2026-10-06 — W-06 Payments core done** (CHANGELOG). The user: "proceed to
payment and next parts". Order mapping in `ShopMapping.order`
(`shop.function.ts` `checkOrder`/`guessOrder`); `functions/payments.function.ts`
(`checkout`, `stripeWebhook` → `markPaid`, `paymentStatus`,
`savePaymentSettings`); `payments/stripe.ts` (HTTP, no SDK);
`SitePayment` / `SitePaymentSettings` (the old platform owns `Payment` /
`payments` — don't reuse the name). Public: `/checkout/options`, `POST
/checkout`, `GET /checkout/:ref`, webhook `POST /public/payments/stripe/:slug`
(raw body kept by server.ts). Tenant: `/p/:id/payments` (+ `/settings`,
`/settings/check`). Suite `payments.mjs` needs the backend started with
`STRIPE_API_BASE=http://127.0.0.1:12111`. **Next: W-07** — checkout widget,
thank-you page, My orders, the Payments page and the order part of the Shop
section in the panel.

**2026-10-05 — W-05 Shop + Cart done** (CHANGELOG). The shop mapping lives in
`SiteWidgets.shop` (`functions/shop.function.ts`: `checkShop`, `guessShop`,
`priceCart`); signed-in carts in `SiteCart` (shared) or the project's own cart
model; `Mint.cart` in mint.js; `widgets/cart.ts`. **W-06 builds on it:**
checkout prices from `priceCart`, then needs an **order mapping** (items
sub-fields, status values, email, address, totals, payment reference) — add
it to `ShopMapping` and the Shop panel the same way. Next in the agreed
order: **M-02** (messaging core) — needs the user's MD1–MD4 first; ask, and
do W-06 meanwhile if they'd rather.

**2026-10-05 — catalogue and messaging planned.** The full list of ~60 widgets,
grouped and phased, is `CATALOGUE.md` (W-14…W-23 added below). Email, SMS and
WhatsApp — sending to clients, newsletters, automations — is its own module:
`../messaging/` (M-01…M-13), interleaved with these: W-05 → M-02 → M-03 → M-04
→ W-06/W-07 → W-07b. MD1–MD4 (provider, shared domain, quotas, double opt-in)
wait on the user.

**Where it stands:** W-01 plan, **W-02 Countries** and **W-03 Runtime** done
(2026-10-05). W-03: `/public/mint.js` (core: Mint.auth/api/on/config/define,
Shadow DOM, theme, auto light/dark from the page, MutationObserver) + lazy
`/public/widgets/<name>.js` (login so far), `SiteWidgets` per project,
`GET /public/api/:slug/widgets`, tenant `GET/PUT /p/:id/widgets` (`build`),
the catalogue in `functions/widgets.function.ts` (`WIDGET_TYPES`). W-04 done
(below); next the shop. W-02:
`Country` collection with Bangladesh + 10 seeded at boot (flags, maps, dial
codes, currency, payment providers), `GET /public/countries`, organizations
carry a country (required on sign-up and New organization; old ones filled in
from their sign-up answer at boot), `paymentProviders` on every organization
response, a searchable country picker in the tenant panel. **Next: W-03
runtime** — done the same day (below). To add countries: put their data in
`library/data/countries.ts`, run `scripts/countries/buildCountryAssets.mjs`
for their pictures, restart — or add them in the database.

**W-04 Panel done (2026-10-05):** Widgets page (Site → Widgets for websites,
beside Public API / under Audience otherwise), user guide `/user-docs/widgets`.
**Next: W-05** commerce mapping + Cart. Dev note: the panel's preview is a
sandboxed frame, and browsers don't let those reach a `localhost` API — locally
it shows "couldn't load mint.js"; with a public API (production) it draws.

Related, running separately: "public API read-only fields" (started
2026-10-05) — W-06 builds on it.

## Status

| WO | Title | Repo | Size | Status |
|---|---|---|---|---|
| W-01 | Plan & docs | backend | S | done |
| W-02 | Countries: `Country` collection (flags, maps, dial codes, currency, providers), seed BD + 10, country picker when an organization is made | both | M | done |
| W-03 | Runtime: `mint.js` loader, core, `SiteWidgets` config, login widget moved in | backend | L | done |
| W-04 | Panel: Site setup → Widgets (catalogue, options, live preview, snippet) | admin | M | done |
| W-05 | Commerce mapping + Cart widget (guest cart, server cart after sign-in) | both | L | done 2026-10-05 |
| W-06 | Payments core: settings + secrets, `Payment`, server-priced checkout, webhooks; providers offered by the organization's country; Stripe | backend | L | done 2026-10-06 |
| W-07 | Checkout widget, thank-you page, My orders, Payments settings page | both | L | done 2026-10-06 |
| W-07b | SSLCommerz and bKash (Bangladeshi organizations), cash on delivery, bank transfer, refunds | both | L | open |
| W-08 | Forms widget (contact, newsletter, any create-only model), spam guard, team email | both | M | open |
| W-09 | Booking widget + server free-slots endpoint | both | M | open |
| W-10 | WhatsApp button, cookie consent (gates tracking tags), announcement bar, search | both | M | open |
| W-11 | Reviews & ratings, wishlist, pricing plans | both | L | later |
| W-12 | Templates + MCP: blueprint `widgets` part, builder MCP tools, T-13 templates use them | both | M | after W-06/W-08 |
| W-13 | Guides (`/user-docs/widgets`, `/payments`) + marketing site | admin + website | M | with each WO |
| W-14 | **Collection** widget: any public model as cards, list, table, accordion, carousel, gallery, map, calendar; filters, search, paging, detail | both | L | open (P2) |
| W-15 | My account & customer portal: profile, addresses, change password, delete account; orders, bookings, invoices in one place | both | M | open (P1, reset needs M-04) |
| W-16 | Order tracking without an account + couriers (Steadfast, Pathao, RedX) | both | M | open (P2) |
| W-17 | Coupons & discount codes | both | M | open (P2) |
| W-18 | Search with filters | both | M | open (P2) |
| W-19 | Social sign-in (Google, Facebook) and sign-in by email/SMS code | both | M | open (P2) |
| W-20 | Members-only content (`data-mint-gate`) | backend | S | open (P2) |
| W-21 | Events & tickets / RSVP, waitlist | both | L | later (P3) |
| W-22 | AI assistant on the site (the project's public data only) | both | L | later (P3) |
| W-23 | Growth: referrals, affiliates, loyalty points | both | L | later (P3) |

## W-01 — Plan & docs (S) — done
`README.md` (what, catalogue, payments, commerce mapping, WD1–WD10, where
things go), this file, `CHANGELOG.md`; pointer `admin/docs/WIDGETS.md`.

## W-02 — Countries (M) — done
- `Country` (global, `countries`): `code` (ISO alpha-2, unique), `code3`,
  `name`, `nativeName`, `dialCode`, `flag` (emoji), `flagSvg`, `mapSvg`
  (stored in the database, `select: false`), `currency { code, symbol, name }`,
  `region`, `paymentProviders` (e.g. BD: sslcommerz, bkash, stripe; others:
  stripe), `active`, `position`.
- Built-in data for Bangladesh + 10 (`library/data/countries.ts`): flags from
  flag-icons (MIT), map outlines drawn from Natural Earth (public domain) by
  `scripts/countries/buildCountryAssets.mjs`; inserted at boot when missing
  (edits are kept), `scripts/seedCountries.js` to refresh.
- `GET /public/countries` (list, cached), `GET /public/countries/:code`
  (one), `/public/countries/:code/flag.svg`, `/map.svg`.
- `Organization.country` (code, checked against active countries) — required
  when an organization is made (sign-up and New organization), changeable in
  organization settings; `paymentProviders` of an organization come from it.
- Panel: a searchable country picker (flag, name, dial code) on sign-up,
  New organization and organization settings.
- Smoke: list, images, sign-up refuses an unknown country, org providers.
**Done when** a Bangladeshi organization is offered SSLCommerz and bKash and a
British one Stripe, from the data.

## W-03 — Runtime (L) — done
- `GET /public/mint.js` (cached, versioned): reads `data-project`, loads
  `GET /public/api/:slug/widgets` (enabled widgets, options, theme from
  `WebsiteSettings.identity`), finds `[data-mint]` / `<mint-*>` elements and
  loads `/public/widgets/<name>.js` for each kind present.
- Core: session (today's `MintAuth`, now `Mint.auth`, with `window.MintAuth`
  kept), API client, event bus (`mint:*` DOM events), theme tokens → CSS
  variables inside each Shadow DOM, texts with per-widget overrides.
- `SiteWidgets` model (tenant-scoped, one per project): `{ [widget]: {
  enabled, options, texts } }`, defaults per widget; tenant routes to read and
  save it.
- Login widget moved into the runtime; `/public/widget.js` still works.
- Smoke `widgets.mjs`: config endpoint, loader served with the right headers,
  disabled widgets not loaded, `widget.js` unchanged.
**Done when** a plain HTML page with one script tag shows the login widget
from config, and switching it off in the database hides it on reload.

## W-04 — Panel: Widgets (M)
Site setup → **Widgets**: a card per widget (what it does, on/off), its
options and texts, a **live preview** (an iframe page loading `mint.js`
against this project), the snippet to copy, a guide link on each panel.
**Done when** a tenant switches a widget on, changes its button text and sees
it in the preview, then copies the snippet.

## W-05 — Commerce mapping + Cart (L) — done
Built: Widgets page → **Shop** (products model + fields, carts in MINT or a
cart model, currency; suggested from the models — the E-commerce and Products
& orders templates are recognised). The **order** mapping moves to W-06, where
it's first used.
- Site setup → **Shop**: pick the Product / Order / Cart item models and map
  their fields (name, price, image, stock, variants, status…); the E-commerce
  and Products & orders templates set it.
- Cart widget: `data-mint-add="<productId>"` buttons (variant picker when the
  product has variants), cart button with count, drawer; guest cart in
  localStorage; merged into the server cart on sign-in; prices shown from the
  catalogue, re-checked on the server at checkout.
**Done when** a guest adds two products, signs in on another device and finds
the same cart.

## W-06 — Payments core (L)
- `PaymentSettings` (providers, mode, currency, return pages; secrets
  `select: false`), `Payment` model.
- `POST /public/api/:slug/checkout` — server-priced order + payment session;
  `GET /checkout/:id` for the thank-you page.
- `POST /public/payments/:provider/:slug` — verify, confirm with the provider,
  mark paid, lower stock, fire the order webhook; idempotent.
- Providers offered = the organization's country's `paymentProviders`.
- The first provider adapter (Stripe Checkout, test mode).
- Order fields the server owns are read-only on the public API.
**Done when** a test-card payment marks the order paid only after the
provider's webhook, and a forged "paid" from the browser changes nothing.

## W-07 — Checkout, thank-you, My orders (L)
Checkout widget (address, delivery method, discount code, summary, pay),
thank-you page state, My orders in the account widget; tenant panel →
**Payments** page (connect, keys, test/live, a test payment button).

## W-07b — Bangladesh providers, manual methods, refunds (L)
SSLCommerz (session + IPN + validation API), bKash (create / execute / query),
cash on delivery and bank transfer (no provider — the team marks paid),
refunds from the order page.

## W-08 — Forms (M)
A form drawn from a create-only model's fields (labels, help text, required,
choices), honeypot + per-IP rate limit, thank-you text, optional email to the
team on each submission.

## W-09 — Booking (M)
`GET /public/api/:slug/booking/slots?service&staff&from&to` computes free
slots from availability, time off, existing bookings and the service's
duration and buffer; the booking widget walks service → staff → slot →
confirm; the server re-checks the slot when the booking is created.

## W-10 — Engagement (M)
WhatsApp button (from `contact.whatsapp`, prefilled message), cookie consent
(tracking tags in Site setup fire only after consent; records consent
choices), announcement bar / popup (scheduled), search box.

## W-11 — Reviews, wishlist, pricing plans (L) — later

## W-12 — Templates + MCP (M)
Blueprint `widgets` part (validated, no secrets), Template Studio tab, apply
step; builder MCP `list_widgets` / `set_widget` / `widget_snippet`; Templates
MCP `set_widgets`; the T-13 website and API templates switch their widgets on.

## W-13 — Guides + marketing (M, with each WO)
`/user-docs/widgets` and `/user-docs/payments` sections per widget, doc links
on every panel, marketing site features + a "Sell on your site" workflow.
