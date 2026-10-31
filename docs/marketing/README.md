# Store marketing — overview

**Start here.** This folder is the plan for **marketing tools in e-commerce
projects** (docs/ecommerce), in the tenant panel (mint-tenant): customer
segments and campaigns (email, SMS, WhatsApp), SMS and WhatsApp order messages,
ad pixels with server-side conversions, product feeds for Meta / Google /
TikTok, and wishlists with back-in-stock and price-drop alerts. Read this file,
then `WORK_ORDERS.md`; every step is logged in `CHANGELOG.md`.

This plan builds the store side of docs/messaging **M-07** (consent and
unsubscribe), **M-08** (campaigns) and **M-10** (SMS and WhatsApp). The
channels and automation actions it adds work in every project type, but
segments, campaigns, feeds and alerts are store features. The wishlist itself
is built by docs/ecommerce/CARTS_AND_WISHLISTS.md (EC-31 / EC-32). This plan
adds its alerts.

## 1. The user's words (2026-10-31)

> 1. Customer segments and campaigns. Saved filters on Customers: spent over X,
>    no order in 60 days, bought from category Y, first-time buyers, city. Then
>    send an email or SMS campaign to a segment, with a schedule, an unsubscribe
>    link and open and click counts. It builds on email designs and SMTP. SMS
>    needs a provider per org, the same way couriers use each store's own account.
> 2. SMS and WhatsApp messages. In Bangladesh, cash-on-delivery stores rely on
>    SMS more than email. Order confirmed, shipped (with the courier tracking link
>    from the couriers work), delivered, then "rate your order". These would be
>    new automation actions.
> 3. Ad pixels and server-side conversions. One setup screen for the Meta Pixel,
>    GA4 and TikTok pixel, sending view-item, add-to-cart and purchase events
>    through mint.js. Then the Meta Conversions API from the server, which matters
>    now that browsers block pixels.
> 4. Product feeds. An automatic Facebook/Instagram catalogue and Google Merchant
>    feed (XML or CSV at a public URL), built from products, variants and stock.
> 5. Wishlist and back-in-stock alerts. "Notify me" on out-of-stock variants
>    triggers when stock comes back. Price-drop alerts on wishlisted items.
>
> plan these features

## 2. What already exists (checked 2026-10-31)

| Piece | Where | What this plan does with it |
|---|---|---|
| Email accounts per project (nodemailer + the org's own SMTP), email designs, `MailMessage` log | M-02, M-03a, M-14 — `library/models/tenancy/mail*.model.ts` | Campaign emails and alert emails go out through them, in the store's design |
| Automations: after-save triggers, conditions, email / notify / webhook / update / create actions | AU-02…07 — `library/functions/automations.function.ts` | Add `sms` and `whatsapp` actions and a "send after" delay (MK-03) |
| Store delivery automations (picked up, delivered — email, off) | CR-14 — `commerce/deliveryAutomations.ts` | Add SMS versions and the full order message pack |
| Tracking IDs (GA4, GTM, Meta Pixel, TikTok pixel, …) and server-side Meta CAPI / GA4 MP (page views, Lead, CompleteRegistration) | WO-38, WO-55 — `WebsiteSettings.tracking/serverSide/secrets`, `serverTracking.function.ts`; `/website-setup` already opens for `ecommerce` | Reuse the same IDs and keys. Add the store's events (view item → purchase) in the browser and from the server, and TikTok Events API |
| Cart + checkout widgets in mint.js, the public store API (`/store`, `POST /store/orders`, my orders) | W-05, W-07, EC-16a, EC-23 | Fire the events. Pass the browser's ad cookies with an order. Add wishlist and notify-me endpoints |
| Customers (`StoreCustomer`: name, phone, email, address, ordersCount, spent, lastOrderAt, storeCredit), Customer purchases (product, variant, times, spent, last) | EC-03, 2026-10-31 | Segments read them. Add the few fields segments need (MK-12) |
| Stock engine (`commerce/stock.ts` `move` / `moveAll`, a movement per change) | EC-05 | Back-in-stock alerts hook into it |
| Coupons (`couponCode`, percent / amount, per-customer limit, uses) | EC-26 | A campaign can carry one shared code or unique codes per person |
| Old platform's BulkSMSBD sender (`library/controllers/marketing/sendSms.controller.ts`, env keys) | old platform | Starting point for the first SMS adapter. The adapter takes the store's own keys, not env |
| Abandoned carts + wishlists plan (draft, another session, 2026-10-31) | `docs/ecommerce/CARTS_AND_WISHLISTS.md` (EC-30…33): Carts and Wishlist items models, `/store/my/wishlist` endpoints, guest merge, Wishlists page, Live Fresh hearts | **The wishlist itself is built there.** This plan only adds alerts on top (MK29, MK30). Once MK-02 lands, their reminder can also go by SMS |
| Scheduler ticks with leases (`scheduleContentTick`, courier sync) | CMS, CR-11 | The same pattern sends campaign batches, delayed actions and alerts |

## 3. Decisions

| # | Decision |
|---|---|
| MK1 | **Every store uses its own accounts**, as couriers (CR18) and email (MD1′): its own SMS gateway account, its own WhatsApp Business account (Meta app, phone number, token), its own Meta / Google / TikTok ad accounts. Mint has no SMS balance, no shared sender and no ad keys. The gateway bills the store directly and Mint never resells SMS. Keys are sealed with `lib/crypto/secret.ts`, `select: false`, and never shown back, logged, or sent to the browser or over MCP. |
| MK2 | **Messaging connections per project.** `MessagingConnection` (tenantScoped, one per channel + provider) holds the channel (`sms` / `whatsapp`), the provider, sealed keys, the sender ID / number, mode, the last test and a default flag. It sits in **Project → Messaging** next to Email accounts (M-14): connect in a dialog, **Test** (a real message to a number the person types, plus the balance where the gateway offers it), green or red. One adapter per provider in `library/functions/messaging/channels/<id>.ts` behind one interface (§5), like couriers (CR5). |
| MK3 | **SMS providers: BulkSMSBD first** (the user, 2026-10-31). The old platform's sender is the starting point. SSL Wireless, Alpha SMS and Twilio (outside BD) come later, as one adapter file each. Delivery reports are read where the gateway sends them (a webhook or a status call). Where it doesn't, a message stays `sent`. |
| MK4 | **One phone rule everywhere.** `normalisePhone(country)`: BD → `01XXXXXXXXX` for couriers and `8801XXXXXXXXX` for gateways (strip `+`, `88`, spaces, dashes), E.164 for Twilio and WhatsApp. The courier code's normaliser moves to `library/functions/phone.ts` and both use it. A number that doesn't pass is skipped and logged ("Not a mobile number"), never sent. |
| MK5 | **SMS length is shown as you type:** GSM-7 text = 160 characters for one part, 153 per part after that. Any Bangla (Unicode) = 70, then 67. The editor shows characters, parts and, for a campaign, parts × recipients. Placeholders are counted at their longest real value from a sample of the audience. |
| MK6 | **One message log for every channel.** `MailMessage` stays for email. SMS and WhatsApp go to `ChannelMessage` (tenantScoped, TTL 180 days, MD8): channel, to, body, parts, provider id, status (`queued` → `sent` → `delivered` / `failed`), error, and what sent it (campaign, automation, alert, test) with the record. A record's history shows "SMS sent: Your order WEB-00012 is confirmed". |
| MK7 | **Transactional vs marketing** (MD5). Order messages (confirmed, shipped, delivered, rate your order) and back-in-stock alerts the customer asked for are **transactional**: always sent, no unsubscribe needed. Campaigns and price-drop alerts are **marketing**: sent only to people who can receive marketing on that channel (MK8), always with an unsubscribe. |
| MK8 | **Consent per customer per channel:** `marketing.email` / `marketing.sms` / `marketing.whatsapp` = `subscribed` / `unsubscribed` / `unknown`, with source and time. **Each store chooses** (the user, 2026-10-31) in Store settings → Marketing: **soft opt-in** (the default: someone who has bought counts as `subscribed` until they unsubscribe; anyone else needs a ticked box at checkout, sign-up or notify-me) or **opt-in only** (only ticked boxes). Switching to opt-in only doesn't delete anyone's answer; it just stops counting buyers who never ticked. An unsubscribe is never undone by an import, a later order or a mode change, only by the customer opting in again. |
| MK9 | **Unsubscribing is one tap.** Every marketing email has a footer link plus the `List-Unsubscribe` + `List-Unsubscribe-Post` one-click headers (Gmail / Yahoo rules). Every marketing SMS ends with a short link (`… Stop: mintapp.shop/l/u/x7Kp`) to a Mint-hosted page in the store's look that unsubscribes from that channel, with a preferences page for all three. BD gateways don't take replies, so "reply STOP" isn't offered. WhatsApp marketing uses Meta's own opt-out button where the template has one. |
| MK10 | **Segments are saved rules, worked out when used**, never stored lists. A segment = `all` / `any` of conditions on Customers (spent, orders, first / last order, city / area, channel bought on, bought product / category / brand — through Customer purchases, used coupon, has email / phone, store credit, consent, created) with relative dates ("more than 60 days ago"). The panel shows a live count and the first 50 people as you edit. A campaign freezes its list when it starts sending (MK12). A segment is a filter on the Customers table too ("Show customers in segment"). |
| MK11 | **Ready segments** every store gets, editable: First-time buyers (orders = 1), Repeat buyers (orders ≥ 2), Lapsed (last order > 60 days ago), VIP (spent in the top 10%, worked out nightly into a threshold), Never ordered (signed up, 0 orders), Has store credit. |
| MK12 | **Campaigns.** A campaign = channel + segment (or a one-off list from a table's filters) + content + optional coupon + schedule. Statuses: draft → scheduled → sending → sent, or stopped / failed. On start, the recipients are frozen into `CampaignRecipient` rows: contactable on that channel, consent ok, a valid address, **deduplicated** by phone or email, never twice per campaign. The sender works in batches on a scheduler tick with a lease (so two dynos never both send), at the provider's rate (default: email 1 per second per SMTP account, SMS 20 per second), and can be stopped mid-way. **Quiet hours** for SMS / WhatsApp marketing (default 21:00–09:00, store timezone): a batch that would fall in them waits. Test send to yourself. Big sends ask for confirmation, with the SMS parts and an estimate of cost. |
| MK13 | **Coupons in campaigns.** Either one shared code (an existing coupon) or **unique codes**: the campaign makes a coupon template's codes, one per recipient (`SAVE10-7KQ2`), single use, with its own valid-till. Unique codes are what attributes orders without doubt. |
| MK14 | **What a campaign report counts:** recipients, sent, delivered (SMS where the gateway reports it), failed (with reasons), opens (email only, a 1×1 pixel, shown as "about", since Apple Mail inflates them), clicks (every link is rewritten to a tracked short link `mintapp.shop/l/c/<token>` that redirects with UTM tags), unsubscribes, **orders and revenue**. An order counts for a campaign if it used the campaign's coupon, or if its customer clicked within the last 7 days (last click wins). The UTM tags (`utm_source=mint`, `utm_medium=email|sms|whatsapp`, `utm_campaign=<slug>`) also make it show in visitor analytics' channels (WO-56). |
| MK15 | **Short links** live under `mintapp.shop/l/…` (the user, 2026-10-31: no separate short domain), not on the store's domain, so they work for every store with no DNS. They are kept 180 days. Each link token knows its message, so a click marks that recipient. |
| MK16 | **SMS and WhatsApp are automation actions** next to email (AU-02): `sms` (to: a phone field on the record or a linked record; body with `{{placeholders}}`; which connection) and `whatsapp` (an approved template from the connection + each variable mapped to a field). Plus one new step option on any action: **Send after** (minutes / hours / days). It uses a small job queue (`ScheduledAction`, tenantScoped, leased tick), and checks the conditions again before it runs ("still delivered and not returned"). This is the first slice of AU-04. |
| MK17 | **The order message pack** every store gets, installed **off** (CR-14 style), each in SMS and email: *Order confirmed* (website order placed: number, total, COD amount), *On its way* (delivery picked up: courier + tracking link), *Out for delivery* (with the rider's phone where the courier gives it), *Delivered*, *Order cancelled*, and **Rate your order** (delivered + 1 day). Owners switch each on in Store settings → Messages, where they also edit the wording, see a preview, and see last month's count. They are ordinary automations, so they show and can be changed in Automations too. |
| MK18 | **Rate your order** links to a Mint-hosted page (the user, 2026-10-31; `mintapp.shop/l/r/<token>`, in the store's name, logo and colours): 1–5 stars and an optional comment, one answer per order (it can be changed for 7 days). It is saved as an **Order rating** (builder model: order, customer, stars, comment, at). It shows on the order page, on a Ratings table and as the average on the store's dashboard. A rating of 1–2 notifies the owner. Public product reviews are later (W-11). |
| MK19 | **WhatsApp = Cloud API with the store's own WhatsApp Business account.** Business-started messages must use **templates Meta has approved**. Mint lists the account's approved templates (Graph API), and the person maps each `{{1}}` to a field. Mint doesn't create or submit templates in the first release: they are made in Meta's WhatsApp Manager, and the guide shows how. Free text only inside the 24-hour window after the customer writes, which needs the inbox (M-11, later). |
| MK20 | **Ad tracking: the same IDs, more events.** The store's Meta Pixel / GA4 / TikTok pixel IDs and server keys stay in `WebsiteSettings` (Website setup already opens for stores). A **Store → Marketing → Ads & tracking** screen shows the store's part: each provider's ID, server-side switch and key, Test, recent events and what each provider answered. It writes the same settings. Events, by each provider's own names: view item (`ViewContent` / `view_item` / `ViewContent`), add to cart (`AddToCart` / `add_to_cart` / `AddToCart`), begin checkout (`InitiateCheckout` / `begin_checkout` / `InitiateCheckout`), purchase (`Purchase` / `purchase` / `CompletePayment`). Also search and add to wishlist. |
| MK21 | **Browser events from mint.js; any storefront can send them.** The Cart / Checkout / Wishlist widgets fire them on their own. A hand-coded storefront (Live Fresh, Verte) calls `mint.track('add_to_cart', { variant, quantity })` from mint.js, or `POST /public/api/store/events` from its server. Mint turns each into every provider's own call with **one event id** (`<type>-<random>`; purchase = the order id) so the pixel and the server copy are counted once. |
| MK22 | **One item id everywhere:** the variant's SKU, or its `_id` when it has no SKU. The pixel's `content_ids`, GA4's `item_id` and the feeds' `id` match, so Meta and Google retargeting ads show the exact item people viewed. The product is the group (`item_group_id` = product SKU or `_id`). |
| MK23 | **The server sends the purchase.** When a website order is created, the order engine sends Purchase to Meta CAPI, GA4 MP and the TikTok Events API (where server-side is on), in the background (`later`), never slowing or failing the order. It sends value, currency, items with MK22 ids, and the order id as event id / `transaction_id`. Matching data is hashed SHA-256: email and phone (normalised, MK4), first name, city, country, and `external_id` = the customer's id. Also the IP, user agent, and the browser's `_fbp` / `_fbc` / `_ga` / `ttclid` cookies, which the checkout widget (or the storefront) sends with `POST /store/orders` as `ads: {…}`. **When a purchase counts** is a setting: *when the order is placed* (default, right for COD), *when it's paid*, or *when it's delivered* (the user, 2026-10-31: placed by default, the other two optional). "When delivered" sends the purchase when the courier (or staff) marks the order delivered, using the matching data and cookies saved on the order at checkout. Meta takes events up to 7 days old, so an order delivered later is counted at placement instead and the log says so. POS sales are never sent. |
| MK24 | **Product feeds: one generator, a link per channel.** A store's feeds are public URLs with an unguessable token (`/public/feeds/<token>/google.xml`, `meta.xml`, `tiktok.xml`, `….csv`), all in Google's product RSS format, which Meta and TikTok also read. **One item per variant** (a simple product is one item): id (MK22), item_group_id, title (product + variant), description, link (MK25), image_link + additional_image_link, availability (in stock / out of stock from the online outlets' stock, MK26), price, and sale_price when compare-at > price, brand, condition = new, gtin (the barcode when it's a valid GTIN), mpn = SKU, color / size / material from the option values, google_product_category from the category's mapping (optional), shipping from the store's delivery rates. Drafts, archived products and products in categories hidden from the website are left out. Each feed is cached and rebuilt within 15 minutes of a product, variant, price or stock change, with ETag / Last-Modified. |
| MK25 | **Product pages need an address.** Products get a `slug` (made from the name, unique, editable, like Categories), and Store settings get the **product link pattern** (`https://livefresh.shop/products/{slug}`, `{id}` also allowed). The feed, the pixels' URLs and campaign product links all use it. A store with no pattern gets a warning on the feeds screen, and its feed is still made without links (Google refuses items with no link, Meta allows it). |
| MK26 | **Which stock is "online"**: by default all outlets with kind *store* or *warehouse*. Store settings can pick which outlets sell online. The same rule drives feed availability, website out-of-stock (EC-16a) and back-in-stock alerts, so they never disagree. `negativeStock` on means everything is always in stock. |
| MK27 | **Feed health.** The feeds screen shows each link (copy), item count, last built, and **items with problems** in plain words: no image, no price, no link, title too long (150), description missing, an invalid barcode. It links each to its product. It also shows how to add the URL in Meta Commerce Manager, Google Merchant Center and TikTok Catalog Manager, each as a scheduled fetch. |
| MK28 | **The wishlist comes from docs/ecommerce CARTS_AND_WISHLISTS (EC-31 / EC-32)**: its Wishlist items model (route `wishlist`), endpoints, guest merge and Wishlists page. Nothing here rebuilds it. This plan adds: price-when-added kept current for MK30 (`lastPriceAlertAt`), `add_to_wishlist` events (MK20), and the mint.js hearts widget (`data-mint-wish`) for mint.js storefronts if that plan only covers Live Fresh's own code. |
| MK29 | **Back-in-stock alerts ("Notify me").** On an out-of-stock variant, anyone (guest or signed in) leaves a phone or email. That makes a **Stock alert** (builder model: variant, product, contact, channel, customer if known, status waiting / sent / cancelled / expired, created, sent at). The stock engine (`move`) calls the alert check when a variant's online stock (MK26) goes from ≤ 0 to > 0. The waiting alerts are queued **oldest first**, and all of them are sent, not just as many as the stock. They go through the store's message wording (Store settings → Messages: SMS and email, with the product link) and are sent at most once. Alerts expire after 90 days. One waiting alert per contact per variant. It's transactional (MK7): the customer asked. |
| MK30 | **Price-drop alerts** for wished items: when a variant's selling price (after a product or variant save, or a compare-at change) falls **at least X%** below the price saved when it was wished (setting, default 5%), the wishers who can receive marketing (MK8) get one message on their preferred channel. At most one per item per 14 days per person. Off by default; switched on in Store settings → Marketing. |
| MK31 | **Data.** Things people look at and change are builder models in the store blueprint (Order ratings, Stock alerts, Segments, Campaigns), locked like Orders (EC4 / EC5), reaching built stores through `upgradeStore` (`scripts/upgradeStores.js`). Logs and queues are shared tenantScoped collections, never one per project (MD10, the Atlas collection cap): `MessagingConnection`, `ChannelMessage`, `CampaignRecipient`, `ShortLink`, `ScheduledAction`, `AdEvent` (last 7 days of sent events for the log screen). |
| MK32 | **Who.** Connecting SMS / WhatsApp / ad keys, editing feeds settings and sending campaigns = managers (whoever may edit Store settings; EC-12 Owner / Store manager when it lands). Drafting campaigns and segments = whoever may edit Customers. Reports = whoever may view Customers. A campaign above 1,000 recipients asks the sender to type the number to confirm. |
| MK33 | **Over MCP** (the user's own AI, never server-side AI calls): read and save segments (with live counts), draft campaigns and send a test. **Sending a campaign is only ever done in the panel**, by a person. Also read campaign reports, feed health, the ads event log, wishlists and waiting alerts. |
| MK34 | **Explained everywhere** (the standing rule): a mint-docs guide per part (`/store/marketing`, `/store/messages`, `/store/ads`, `/store/feeds`, `/store/wishlist`), #anchor links on every card and dialog, and the marketing website updated with each WO. |

## 4. New and changed models

★ = core (locked), ⚙ = engine-owned (read-only).

**StoreCustomer (changed):** ⚙firstOrderAt, ⚙city, ⚙area (from their latest
website order or typed), ⚙channels (pos / website, where they bought), ⚙marketing
(section: email, sms, whatsapp — each status + source + at), ⚙clickedAt (last
campaign click, for MK14). `upgradeStore` backfills them from orders.

| Model | Route | Fields |
|---|---|---|
| Segment | `segments` | ★name, description, ★match (all / any), ★conditions (sectionlist: field, op, value, unit), ⚙count, ⚙countedAt, ⚙ready (one of MK11) |
| Campaign | `campaigns` | ⚙code `CMP-0001`, ★name, ★channel, ★segment, ★connection / mail account, ★subject (email), ★body, design (email), whatsappTemplate + variables, coupon mode (none / shared / unique) + coupon, ★sendAt, ⚙status, ⚙totals (recipients, sent, delivered, failed, opened, clicked, unsubscribed, orders, revenue), ⚙startedAt, ⚙finishedAt, ⚙by |
| Order rating | `order-ratings` | ⚙order, ⚙customer, ⚙stars, ⚙comment, ⚙at |
| Wishlist item (EC-31's, changed) | `wishlist` | + ⚙lastPriceAlertAt |
| Stock alert | `stock-alerts` | ⚙variant, ⚙product, ⚙contact, ⚙channel, ⚙customer, ⚙status, ⚙sentAt, ⚙expiresAt |
| Product (changed) | `products` | ★slug (unique, from the name) |

Store settings (`CommerceSettings`) gain `marketing { onlineOutlets[], productLinkPattern,
consent: 'soft' | 'opt-in', quietHours {from, to}, purchaseWhen, priceDrop {enabled, percent},
feeds {token, categoryMap} }` and `messages { …wording per message pack item and per alert }`.

## 5. The engine

```
library/functions/phone.ts                     normalisePhone (MK4), moved from the courier code
library/functions/messaging/
  channels/index.ts  types.ts                  registry + ChannelAdapter
  channels/bulksmsbd.ts  sslwireless.ts  alphasms.ts  twilio.ts  whatsappCloud.ts
  connections.ts                               MessagingConnection read / save (sealing), test, balance
  send.ts                                      sendSms / sendWhatsapp → ChannelMessage, delivery reports
  smsLength.ts                                 GSM-7 / Unicode parts (MK5)
  links.ts                                     ShortLink: tracked clicks, unsubscribe, rating links
  consent.ts                                   canMarket(customer, channel), unsubscribe, preferences
  scheduled.ts                                 ScheduledAction queue + leased tick (MK16)
library/functions/commerce/marketing/
  segments.ts        compile conditions → Mongo query (+ Customer purchases lookup), count, preview
  campaigns.ts       start (freeze recipients), batch tick, stop, attribution on order create
  messages.ts        the order message pack (installed automations, MK17), ratings
  adEvents.ts        browser / server events → Meta CAPI, GA4 MP, TikTok Events API (MK21–23)
  feeds.ts           build, cache, health (MK24–27)
  stockAlerts.ts  priceDrop.ts                 (the wishlist itself: EC-31)
```

```ts
interface ChannelAdapter {
  id: string; name: string; channel: 'sms' | 'whatsapp'; countries: string[];
  credentials: Field[]; settings: Field[];         // sender id, number id…
  test(conn, to: string): Promise<{ ok: boolean; message: string }>;
  balance?(conn): Promise<{ amount: number; unit: string }>;
  send(conn, msg: { to: string; body?: string; template?: { name: string; lang: string; vars: string[] } }): Promise<{ providerId?: string; status: 'sent' | 'queued' }>;
  report?: { webhook?(req): { providerId: string; status: string }[]; poll?(conn, providerId): Promise<string> };
  templates?(conn): Promise<{ name: string; lang: string; vars: number; body: string }[]>; // WhatsApp
}
```

Hooks into what exists: `automations.function.ts` gains the two actions and
`after`. `commerce/orders.ts` `createWebsite` calls `adEvents.purchase` and
`campaigns.attribute`. `commerce/stock.ts` `move` calls `stockAlerts.check`
(after the write, in the background). A product / variant save calls
`priceDrop.check` and marks the feed stale.

Public routes (project by key or host as today):

| Route | Does |
|---|---|
| `POST /public/api/store/events` | a storefront's browser / server events (MK21) |
| `POST /store/orders` | gains `ads: { fbp, fbc, ga, ttclid, eventId }` and `marketing: { email, sms }` (consent boxes) |
| `POST /store/stock-alerts` | notify me: `{ variant, phone | email }` (rate limited) |
| `GET /public/feeds/:token/:name` | feeds (MK24) |
| `GET mintapp.shop/l/c/:t` · `/l/u/:t` · `/l/r/:t` | tracked click, unsubscribe page, rating page |
| `GET /public/email/o/:t` | email open pixel |
| `POST /public/messaging/:provider/:connection` | SMS / WhatsApp delivery reports |

## 6. The panel (mint-tenant)

Sidebar: a **Marketing** group in the store (after Store): Campaigns,
Segments, Ratings, Stock alerts, Ads & tracking, Product feeds.

- **Project → Messaging**: Email accounts (exists), **SMS** and **WhatsApp**
  cards (connect dialog, Test to a number, balance, default).
- **Segments**: list with live counts. The editor: conditions row by row
  (field → op → value, relative dates), the count and the first 50 people as
  you edit, "Show in Customers", "Start a campaign".
- **Campaigns**: list (status, channel, sent, clicks, orders, revenue). Compose
  in steps: Audience (segment + count after consent and dedupe) → Message
  (email: subject, design, body with fields and links. SMS: text with the parts
  counter. WhatsApp: template + variable mapping) → Coupon (none / shared /
  unique) → Schedule (now / date + time, quiet hours shown) → Review (test
  send, cost estimate, confirm). The report: the totals, a timeline of sends
  and clicks, links by clicks, failures by reason, the orders it brought.
- **Store settings → Messages**: the order message pack and alert wording, each
  with on / off, channel (SMS / email / both), wording, preview and last
  month's count.
- **Store settings → Marketing**: consent mode, quiet hours, online outlets,
  product link pattern, purchase counted when, price-drop alerts.
- **Ads & tracking**: Meta / Google / TikTok cards (ID, server-side, key, test
  code, Test event), the last 100 events with each provider's answer, and
  matching tips ("Add customers' email at checkout to match more buyers").
- **Product feeds**: the links per channel, item count, last built, Rebuild,
  items with problems, the category → Google category mapping, how-to steps
  per channel.
- **Stock alerts** (next to EC-32's Wishlists page): waiting stock alerts by variant (with
  "Restock N people are waiting for"), sent alerts. **Product page**: "Wished
  by N · N waiting for stock".
- **Order page**: the rating card. **Customer page**: consent per channel
  (staff may unsubscribe someone, never subscribe them), messages sent, wishlist.

## 7. Out of scope for now

Abandoned-cart recovery (planned in docs/ecommerce/CARTS_AND_WISHLISTS.md),
automatic discounts and promotions, the WhatsApp inbox and free-text replies
(M-11), creating WhatsApp templates from Mint, A/B tests, send-time
optimisation, public product reviews (W-11), referrals and loyalty (EC-17,
W-23), Google Ads / Meta Ads spend import and ROAS, Pinterest / Snapchat feeds,
SMS gateways beyond BulkSMSBD (SSL Wireless, Alpha SMS, Twilio — one adapter each, when asked), push notifications.

## 8. The user's answers (2026-10-31)

1. **SMS gateways:** BulkSMSBD first (MK3).
2. **Marketing consent:** each store chooses; soft opt-in by default (MK8).
3. **Purchase event:** when placed by default; when paid or when delivered optional (MK23).
4. **Short links:** a path on `mintapp.shop` (`/l/…`), no short domain (MK15).
5. **Rate your order:** a Mint-hosted page in the store's look (MK18).
