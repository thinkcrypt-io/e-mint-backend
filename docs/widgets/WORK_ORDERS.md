# Site widgets — work orders

Read `README.md` first. Sizes: S (an afternoon), M (a day), L (2–3 days).

## Handoff — read this first (last updated 2026-10-05)

**Where it stands:** plan only (W-01). Waiting on the user's answers to the
open decisions in README §3/§5: which payment providers first (suggested
Stripe + SSLCommerz + cash on delivery), tenants' own merchant accounts
(WD6), widgets for any project with a public API (WD7). W-02…W-04 don't need
those answers and can start on the user's go-ahead.

Related, running separately: "public API read-only fields" (started
2026-10-05) — W-05 builds on it.

## Status

| WO | Title | Repo | Size | Status |
|---|---|---|---|---|
| W-01 | Plan & docs | backend | S | done |
| W-02 | Runtime: `mint.js` loader, core, `SiteWidgets` config, login widget moved in | backend | L | open |
| W-03 | Panel: Site setup → Widgets (catalogue, options, live preview, snippet) | admin | M | open |
| W-04 | Commerce mapping + Cart widget (guest cart, server cart after sign-in) | both | L | open |
| W-05 | Payments core: settings + secrets, `Payment`, server-priced checkout, webhooks, first provider | backend | L | waits on providers |
| W-06 | Checkout widget, thank-you page, My orders, Payments settings page | both | L | waits on W-05 |
| W-07 | More providers (SSLCommerz, bKash, cash on delivery, bank transfer), refunds | both | L | waits on providers |
| W-08 | Forms widget (contact, newsletter, any create-only model), spam guard, team email | both | M | open |
| W-09 | Booking widget + server free-slots endpoint | both | M | open |
| W-10 | WhatsApp button, cookie consent (gates tracking tags), announcement bar, search | both | M | open |
| W-11 | Reviews & ratings, wishlist, pricing plans | both | L | later |
| W-12 | Templates + MCP: blueprint `widgets` part, builder MCP tools, T-13 templates use them | both | M | after W-06/W-08 |
| W-13 | Guides (`/user-docs/widgets`, `/payments`) + marketing site | admin + website | M | with each WO |

## W-01 — Plan & docs (S) — done
`README.md` (what, catalogue, payments, commerce mapping, WD1–WD10, where
things go), this file, `CHANGELOG.md`; pointer `admin/docs/WIDGETS.md`.

## W-02 — Runtime (L)
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

## W-03 — Panel: Widgets (M)
Site setup → **Widgets**: a card per widget (what it does, on/off), its
options and texts, a **live preview** (an iframe page loading `mint.js`
against this project), the snippet to copy, a guide link on each panel.
**Done when** a tenant switches a widget on, changes its button text and sees
it in the preview, then copies the snippet.

## W-04 — Commerce mapping + Cart (L)
- Site setup → **Shop**: pick the Product / Order / Cart item models and map
  their fields (name, price, image, stock, variants, status…); the E-commerce
  and Products & orders templates set it.
- Cart widget: `data-mint-add="<productId>"` buttons (variant picker when the
  product has variants), cart button with count, drawer; guest cart in
  localStorage; merged into the server cart on sign-in; prices shown from the
  catalogue, re-checked on the server at checkout.
**Done when** a guest adds two products, signs in on another device and finds
the same cart.

## W-05 — Payments core (L) — waits on the provider decision
- `PaymentSettings` (providers, mode, currency, return pages; secrets
  `select: false`), `Payment` model.
- `POST /public/api/:slug/checkout` — server-priced order + payment session;
  `GET /checkout/:id` for the thank-you page.
- `POST /public/payments/:provider/:slug` — verify, confirm with the provider,
  mark paid, lower stock, fire the order webhook; idempotent.
- The first provider adapter (Stripe Checkout, test mode).
- Order fields the server owns are read-only on the public API.
**Done when** a test-card payment marks the order paid only after the
provider's webhook, and a forged "paid" from the browser changes nothing.

## W-06 — Checkout, thank-you, My orders (L)
Checkout widget (address, delivery method, discount code, summary, pay),
thank-you page state, My orders in the account widget; tenant panel →
**Payments** page (connect, keys, test/live, a test payment button).

## W-07 — More providers + refunds (L)
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
