# Site widgets — the full catalogue

Everything a business might put on its own site with `mint.js`, grouped, with
where each stands. Planned 2026-10-05 at the user's request ("list more
widgets, plan and list a lot"). The build order and work orders are in
`WORK_ORDERS.md`; messaging (email, SMS, WhatsApp — sending, newsletters,
automations) is its own module in `../messaging/`.

**Phases:** **Live** · **P1** the shop and its emails (next) · **P2** leads,
content and engagement · **P3** later. A widget is only promised on the
marketing site once it's Live.

**One widget instead of fifteen.** FAQs, team, testimonials, a menu, jobs, a
gallery, a store locator, an events list, a blog list — each is a public model
shown in a layout. They're all one **Collection** widget (#49) with layouts
(cards, list, table, accordion, carousel, gallery, map, calendar), filters,
search, paging and a detail view. Building it once covers every template's
content and every AI-built site.

## Accounts & customers

| # | Widget | Phase | Notes |
|---|---|---|---|
| 1 | Login & account | **Live** | Card or header button (W-03/W-04) |
| 2 | Password reset & email verification | P1 | Needs the messaging core (M-04); today a customer who forgets their password is stuck |
| 3 | My account — profile, addresses, change password, delete account | P1 | Addresses feed checkout |
| 4 | Social sign-in — Google, Facebook | P2 | OAuth app per platform, not per tenant |
| 5 | Magic link / one-time code sign-in — email or SMS | P2 | SMS codes are how most Bangladeshi shops sign people in |
| 6 | Members-only content — show any element only to signed-in customers or a plan | P2 | `data-mint-gate` |
| 7 | Customer portal — orders, bookings, invoices, downloads, tickets in one place | P2 | Grows from My account |
| 8 | Loyalty points & rewards | P3 | |

## Shop

| # | Widget | Phase | Notes |
|---|---|---|---|
| 9 | Product grid & product page — variants, gallery, price, stock | P1 | From the commerce mapping (W-05) |
| 10 | Add-to-cart button on any element | P1 | W-05 |
| 11 | Cart drawer & cart icon with count | P1 | Guest cart → server cart on sign-in |
| 12 | Checkout — address, delivery, summary, discount code | P1 | Server-priced (WD5) |
| 13 | Payments — Stripe; SSLCommerz, bKash; cash on delivery, bank transfer | P1 | W-06/W-07b, by organization country |
| 14 | Thank-you page & My orders | P1 | Order confirmation email (M-03) |
| 15 | Order tracking without an account — order number + email/phone, courier status | P2 | Steadfast, Pathao, RedX |
| 16 | Coupons & discount codes | P2 | |
| 17 | Search with filters — category, price, attributes | P2 | |
| 18 | Wishlist | P2 | |
| 19 | Back-in-stock alerts | P2 | Email/SMS when stock returns (M-09) |
| 20 | Reviews & ratings, with photos | P2 | Held for approval |
| 21 | Pay an invoice / payment link | P2 | Finance and CRM templates: the client pays online |
| 22 | Related products, upsells, recently viewed | P3 | |
| 23 | Product questions & answers | P3 | |
| 24 | Gift cards | P3 | |
| 25 | Pricing plans & subscriptions | P3 | Recurring payments |
| 26 | Digital downloads — signed, expiring links | P3 | |
| 27 | Quote request — cart → request a quote (B2B) | P3 | |
| 28 | Donations — fixed or custom amounts, recurring | P3 | |

## Bookings & events

| # | Widget | Phase | Notes |
|---|---|---|---|
| 29 | Booking — service → who → free slot → confirm | P2 | Free slots worked out on the server (W-09) |
| 30 | Booking reminders, reschedule and cancel links | P2 | Email/SMS (M-09) |
| 31 | Events & tickets / RSVP — capacity, QR ticket, check-in from the panel | P3 | |
| 32 | Class timetable | P3 | Collection calendar layout + booking |
| 33 | Waitlist | P3 | For full slots, events, sold-out products |

## Forms & leads

| # | Widget | Phase | Notes |
|---|---|---|---|
| 34 | Contact form | P2 | W-08, spam guard, team email |
| 35 | Form for any create-only model | P2 | Drawn from the model's fields |
| 36 | Newsletter signup — double opt-in | P2 | Messaging M-07 |
| 37 | Email preferences & one-click unsubscribe page | P2 | Required before any newsletter is sent (M-07) |
| 38 | Multi-step forms, file uploads | P3 | |
| 39 | Survey, poll, NPS | P3 | |
| 40 | Callback request | P3 | |
| 41 | Lead-magnet download — email in, file out | P3 | |
| 42 | Job applications — careers list + CV upload | P3 | Collection + form |

## Conversation & support

| # | Widget | Phase | Notes |
|---|---|---|---|
| 43 | WhatsApp, Messenger, Telegram and call buttons | P2 | W-10 |
| 44 | Live chat — the team answers in a panel inbox | P3 | Messaging M-11 |
| 45 | AI assistant — answers from the project's own FAQs, products and pages; hands over to a person | P3 | Claude; only the project's public data |
| 46 | Help centre / FAQ search | P2 | Collection accordion + search |
| 47 | Support tickets for customers | P3 | |
| 48 | Feedback button | P3 | |

## Content

| # | Widget | Phase | Notes |
|---|---|---|---|
| 49 | **Collection** — any public model as cards, list, table, accordion, carousel, gallery, map or calendar; filters, search, paging, detail view | P2 | Covers team, testimonials, FAQs, menu, jobs, portfolio, blog list, locations, events |
| 50 | Store locator | P3 | Collection map layout |
| 51 | Opening hours & "open now" | P2 | From site settings |
| 52 | Countdown | P3 | |
| 53 | Share and follow buttons | P3 | |

## Trust, compliance & site tools

| # | Widget | Phase | Notes |
|---|---|---|---|
| 54 | Cookie consent — tracking tags fire only after consent | P2 | W-10 |
| 55 | Announcement bar & popups — scheduled, per page, on exit | P2 | W-10 |
| 56 | Language switcher | P3 | Site contents in several languages |
| 57 | Currency switcher | P3 | Display only; charged in the shop's currency |
| 58 | Age gate | P3 | |
| 59 | Trust badges & payment icons | P3 | |

## Growth

| # | Widget | Phase | Notes |
|---|---|---|---|
| 60 | Referral programme — both get a reward | P3 | |
| 61 | Affiliate links | P3 | |
| 62 | Social proof — "12 bought this today" | P3 | Real numbers only; never invented |

**Not building:** spin-to-win wheels and fake urgency (invented scarcity,
fake "someone just bought"). They cost trust and break consumer-protection
rules in several countries.
