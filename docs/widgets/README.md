# Site widgets — overview

**Start here.** This folder is the single source of truth for **site
widgets**: drop-in pieces a tenant's website (or app) adds with one script tag
— cart, checkout and payments, login and account, forms, booking and more.
Read this file, then `WORK_ORDERS.md` (Handoff first), then `CHANGELOG.md`.

Builds on the tenant platform (`../multi-tenancy/README.md`, D1–D19): the
public API and project customers (WO-11), the login widget `widget.js`,
`track.js` and website settings (WO-38). Templates (`../templates/`) will ship
widgets ready-configured.

Backend and admin are separate git repos (`backend` → remote `mint`, branch
`v3`; `admin` → remote `origin`, branch `main`). The user's rule: commit and
push each work order when it's done, then go on. Commits end with
`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Status (2026-10-05):** plan agreed; building in order from W-02. The
user's answers: tenants' own merchant accounts (WD6), widgets for any project
with a public API (WD7), runtime then the shop first, and **payment providers
by the organization's country** (WD11).

---

## 1. What we are building

**The user's words (2026-10-05):** "for websites can we have a widget system?
like payment gateway, similar to how we had login … cart/payment
gateway/login and more."

Today a website project has one widget: `/public/widget.js` turns
`<div data-mint-login>` into a sign-in card and gives the page
`window.MintAuth`. Everything else — a cart, a checkout, a contact form —
each tenant (or their AI) writes by hand against the public API. That's slow,
and some of it can't be done safely on the client at all: the T-13 templates
showed that a customer creating an order through the public API can send any
price or `status: paid`.

1. **One script, many widgets.** `<script src=".../public/mint.js"
   data-project="slug">` loads a tiny core; each `<div data-mint="cart">` (or
   `<mint-cart>`) on the page loads its widget on demand. `widget.js` keeps
   working (it becomes the login widget of the same runtime).
2. **Configured in the panel, not in code.** Site setup → **Widgets**: switch
   each on, set its texts and options, see it live, copy its snippet. Colours
   and fonts come from the site's identity. The MCP and templates can set the
   same configuration.
3. **Every widget also works headless.** `window.Mint.cart.add(id)`,
   `Mint.checkout.start()`, `Mint.auth.user` — a custom-designed site uses the
   logic and draws its own UI.
4. **Money and trust stay on the server.** Prices, totals, stock, order status
   and payment confirmation are worked out and set by MINT, never taken from
   the browser. Payment providers' secrets live server-side only (like the
   server-side tracking secrets in `WebsiteSettings.secrets`).

## 2. The widget catalogue (suggested, in build order)

The first fifteen, in build order. **The full catalogue (~60, phased) is
`CATALOGUE.md`; email, SMS and WhatsApp are planned in `../messaging/`.**

| # | Widget | What the visitor sees | What the business gets | Needs |
|---|---|---|---|---|
| 1 | **Login & account** (exists → upgrade) | Sign in / sign up, then an account menu: profile, my orders, my bookings, sign out; password reset | Customers in the project's Customers list | — |
| 2 | **Cart** | Add-to-cart buttons on any element (`data-mint-add="<id>"`), a cart button with a count, a drawer with quantities and subtotal | Carts kept in the browser for guests, on the server once signed in (follows them across devices); "most in carts" | Commerce mapping (§4) |
| 3 | **Checkout** | Address, delivery method, order summary, discount code, pay | An Order created **by the server** at the server's prices | Cart, payments |
| 4 | **Payments** | The provider's own secure page (or embedded form), then a thank-you page | Order marked Paid only when the provider confirms; a Payment record; the order webhook fires | Provider account (§3) |
| 5 | **My orders** | Order history with status and tracking link | Fewer "where's my order?" emails | Login |
| 6 | **Forms** (contact, newsletter, any create-only model) | A form drawn from the model's fields, with validation and a thank-you message | Records in the panel, spam protection (honeypot, rate limit), optional email to the team | — |
| 7 | **Booking** | Service → who → a free slot → confirm (signed in) | Bookings without double-booking: free slots computed **on the server** from hours, time off and existing bookings | Booking models (Booking API template) |
| 8 | **Search** | A search box with instant results (products, posts, pages) | — | Public lists |
| 9 | **Reviews & ratings** | Stars and reviews under a product or service; signed-in customers write one | Reviews held for approval | Login |
| 10 | **WhatsApp / chat button** | A floating button that opens WhatsApp with a ready message | Leads on WhatsApp (very common in Bangladesh) | `contact.whatsapp` |
| 11 | **Cookie consent** | A banner with accept / reject / choose | Tracking tags from Site setup fire only after consent; consent counts | Tracking tags |
| 12 | **Announcement bar & popup** | A bar or a timed popup (offer, closing hours, newsletter) | Edited in the panel, scheduled | — |
| 13 | **Pricing plans** | Plan cards with a subscribe button | Recurring payments (Stripe subscriptions) | Payments |
| 14 | **Wishlist** | Hearts on products, a saved list | What people want | Login |
| 15 | **Delivery tracking** | Track a parcel by order number | Courier status (Steadfast — the old platform already integrates it) | Courier account |

Widgets 1–6 make a working shop; 6, 10 and 11 cover most service businesses;
7 completes the Booking API template.

## 3. Payments

**How money moves (agreed):** each tenant connects **their own** merchant
account; the customer pays the provider directly and the money goes to the
tenant. MINT never holds funds, so MINT needs no payment licence. (A
marketplace model with a platform fee — Stripe Connect — is possible later.)

**Providers by country (the user, 2026-10-05):** "when creating
organization should select country … if the organization is bangladeshi then
sslcommerz, bkash should be there too. otherwise stripe." So every
organization has a **country** (picked from a searchable list when it's
created), and each country in the **Countries** table lists the providers
offered there: Bangladesh → **SSLCommerz** (cards, bKash, Nagad, Rocket,
banks) and **bKash** direct, plus Stripe; everywhere else → **Stripe**. It's
data, not code: the super admin can change a country's providers. (Stripe
doesn't onboard businesses registered in some countries — Bangladesh and
Pakistan among them — so the list per country should follow where each
provider really works.) **Cash on delivery** and **bank transfer** need no
provider and can be offered everywhere: the order waits for the team to mark
it paid.

**The flow** (every provider the same way):
1. The checkout widget sends the cart lines (product ids, variants,
   quantities), address and delivery method to
   `POST /public/api/:slug/checkout` — **never prices**.
2. The server looks the products up, checks stock, applies delivery and a
   discount code, creates the **Order** (`pending_payment`) and a **Payment**
   (`created`), and asks the provider for a payment session.
3. The visitor pays on the provider's page and comes back to the site's
   thank-you page.
4. The provider calls `POST /public/payments/:provider/:slug` (its webhook /
   IPN). MINT checks the signature and asks the provider to confirm the
   amount, then sets Payment `paid`, Order `paid`, lowers stock, and fires the
   project's order webhook. Only this step can make an order paid.
5. Refunds (full or part) from the order's page in the panel (later).

**Stored:** `PaymentSettings` per project (providers on/off, test or live
mode, currency, return pages) with keys in a `select: false` secrets
sub-document — the panel only ever learns "set / not set". A tenant-scoped
`Payment` model (order, provider, amount, currency, status, provider ids,
events), read-only in the panel.

**Test mode first:** every provider starts in test mode with a banner on the
widget; switching to live needs the live keys and a confirmation.

## 4. Commerce mapping

Widgets don't assume model names. A project says which of its models plays
each part, and which fields mean what:

- **Product**: name, price, compare-at price, image(s), stock, variants
  (name, price change, stock), status (only "active" sells).
- **Order**: items, totals, address, status values for pending / paid /
  cancelled, payment reference.
- **Cart item** (optional — guests' carts live in the browser).

The E-commerce and Products & orders templates set the mapping for you; other
projects pick it in Site setup → Widgets → Shop. The server uses the mapping to
price carts and write orders. Fields the server owns (status, totals, payment
reference) become **read-only on the public API** — see the follow-up
"public API read-only fields", started separately on 2026-10-05.

## 5. Decisions

| # | Decision | Why |
|---|---|---|
| WD1 | **One loader, `mint.js`**, with lazy widget chunks (`/public/widgets/<name>.js`); a small core (session, theme, events, API client). `widget.js` keeps working as before. | One snippet for every widget; pages load only what they use. |
| WD2 | Widgets are **Web Components in Shadow DOM**, no dependencies, styled from the site's identity (colours, font, radius) plus per-widget overrides; light and dark; work at 320 px; keyboard and screen-reader friendly. | A widget can't break the site's CSS, or the site the widget's. |
| WD3 | **Config is data**: a `SiteWidgets` document per project (on/off, options, texts, model mapping), served to the page from `GET /public/api/:slug/widgets`. Panel, MCP and templates all write it. | Change a widget without redeploying the site. |
| WD4 | **Headless API for every widget** (`window.Mint.*`, events like `mint:cart:change`). | Custom sites (and AI-built ones) keep their own design. |
| WD5 | **The server owns money and status**: prices, totals, stock, order and payment status are set by MINT; the browser only sends ids and quantities. | Closes the tampering gap the T-13 templates found. |
| WD6 | **Tenant's own merchant accounts**; secrets server-side only, never returned. | No payment licence for MINT; tenants keep their money. Agreed. |
| WD7 | **Any project with a public API** can use widgets (website and API projects), not only website projects. | The Booking API's booking widget, an app's contact form. Agreed. |
| WD8 | **Templates ship widgets ready**: a `widgets` part in the blueprint (no secrets). E-commerce → cart, checkout, payments, my orders; Business site → contact form, WhatsApp, cookie consent; Blog → newsletter; Booking API → booking. | A template's site works on day one. |
| WD9 | **Explained everywhere**: every widget has a guide section, its snippet, a live preview and a doc link in the panel (as Template Studio does). | The user's standing rule. |
| WD10 | **Size budget**: core under 8 KB gzipped, each widget under 15 KB; nothing loads that the page doesn't use. | Sites stay fast. |
| WD11 | **Countries are data**: a global `Country` collection (ISO code, names, dial code, flag and map SVGs, currency, region, the payment providers offered there); an organization stores its country code, required when it's created. Seeded with Bangladesh + 10 countries; the rest later. Served at `GET /public/countries` (and each flag/map as an image) for the panel and for widgets (phone and address fields). | Payment providers, currency defaults and phone inputs all follow the country — one table to keep right. |

## 6. Where things go

**Backend** (`v3`)
- `routes-public/mint.ts` (loader + core), `routes-public/widgets/*.ts`
  (each widget's script), `widget.js` kept.
- `library/models/tenancy/siteWidgets.model.ts`, `paymentSettings.model.ts`,
  `payment.model.ts` (tenant-scoped).
- `library/functions/payments/` — one adapter per provider (`stripe.ts`,
  `sslcommerz.ts`, `bkash.ts`, `manual.ts`) behind one interface:
  `createSession`, `verifyWebhook`, `confirm`, `refund`.
- `routes-public/public.router.ts` — `GET /widgets`, `POST /checkout`,
  `GET /checkout/:id` (status for the thank-you page), `GET /booking/slots`.
- `routes-public/payments.router.ts` — provider webhooks / IPN.
- `routes-tenant/` — widgets and payments settings, refunds.
- MCP: builder MCP `list_widgets`, `set_widget`, `widget_snippet`;
  Templates MCP `set_widgets`.

**Admin** (`main`) — tenant panel
- Site setup → **Widgets** (catalogue, on/off, options, live preview,
  snippet), → **Payments** (providers, keys, test/live, return pages),
  → **Shop** (commerce mapping).
- Order page: payments, refund. Customers: their orders and bookings.
- Guides: `/user-docs/widgets`, `/user-docs/payments`; Template Studio gets a
  Widgets tab.

**Marketing site** (`mint-webpage`) — features, a workflow ("Sell on your
site"), changelog, once widgets ship.
