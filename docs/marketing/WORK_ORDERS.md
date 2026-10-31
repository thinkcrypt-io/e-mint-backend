# Store marketing — work orders

Plan: `README.md`. Log: `CHANGELOG.md`. Sizes: S (an afternoon), M (a day),
L (2–3 days). Commit and push each WO when it's done (backend → `mint` v3;
mint-tenant → `origin` main; mint-docs and mint-webpage → `origin` main), then
go on. Each WO updates its guide (mint-docs, #anchors on every card and
dialog) and the marketing website as it lands. Smoke tests go in
`scripts/tenancy-smoke/marketing-*.mjs` and `run-all.sh`. They run against a
local stub (`scripts/tenancy-smoke/marketing-stub.mjs`: one fake server that
speaks the SMS gateways, WhatsApp Cloud API, Meta CAPI, GA4 MP and TikTok
Events API, and records what it got), plus real sandboxes where keys are in
`backend/.env`.

**Order.** Phase 1 builds the SMS / WhatsApp channels and the order messages,
because campaigns need them. **Phase 2 (pixels + feeds) depends on nothing
here and can run in parallel with phase 1.** Phase 3 is segments and
campaigns. Phase 4 is alerts, plus small add-ons to the wishlist that docs/ecommerce
CARTS_AND_WISHLISTS (EC-31 / EC-32) builds. It needs phase 1's channels,
phase 2's product slug and EC-31. The user answered the README's open questions on 2026-10-31 (§8).

## Status

| WO | Title | Repo | Size | Status |
|---|---|---|---|---|
| MK-01 | Plan & docs | backend | S | done 2026-10-31 |
| **Phase 1 — SMS, WhatsApp and order messages** | | | | |
| MK-02 | SMS channel: `MessagingConnection`, BulkSMSBD adapter, sealing, Test + balance, `ChannelMessage` log, `phone.ts`, parts counter, delivery reports; Project → Messaging SMS card | backend + mint-tenant | L | open |
| MK-03 | `sms` / `whatsapp` automation actions + **Send after** (`ScheduledAction` queue, leased tick, conditions re-checked); editor support | backend + both panels | M | open |
| MK-04 | Order message pack (confirmed, on its way, out for delivery, delivered, cancelled, rate your order), installed off; Store settings → Messages; `upgradeStore` | backend + mint-tenant | M | open |
| MK-05 | Rate your order: `ShortLink`, Mint-hosted rating page, Order rating model, order card, Ratings table, dashboard average, low-rating notice | backend + mint-tenant | M | open |
| MK-06 | WhatsApp Cloud API: connection (the store's own WABA), approved templates list, variable mapping in the action and the pack | backend + mint-tenant | M | open |
| **Phase 2 — Ads and feeds (independent)** | | | | |
| MK-07 | Store events: MK22 ids, mint.js widget events + `mint.track`, `POST /store/events`, browser calls for Meta / GA4 / TikTok with shared event ids | backend | M | open |
| MK-08 | Server-side purchase: `ads` on `POST /store/orders`, hashed matching data, Meta CAPI + GA4 MP + TikTok Events API, "counted when" setting, `AdEvent` log | backend | M | open |
| MK-09 | Panel: Store → Marketing → Ads & tracking (cards, Test event, event log, matching tips); wire Live Fresh / Verte's checkout to send `ads` | mint-tenant + live-fresh | M | open |
| MK-10 | Product slug + link pattern + online outlets (MK25, MK26), `upgradeStore` backfill of slugs | backend + mint-tenant | S | open |
| MK-11 | Product feeds: generator (Google RSS + CSV), Meta / Google / TikTok links, cache + rebuild on change, feed health, category mapping; Product feeds screen | backend + mint-tenant | M | open |
| **Phase 3 — Segments and campaigns** | | | | |
| MK-12 | Customer data + consent: the new StoreCustomer fields, backfill, consent rules (MK8), consent boxes on checkout / sign-up, customer page consent card | backend + mint-tenant | M | open |
| MK-13 | Segments: model, condition compiler (incl. purchases / categories), live count + preview, ready segments (MK11), "Show in Customers" | backend + mint-tenant | M | open |
| MK-14 | Unsubscribe + preferences: one-click headers, SMS short link, Mint-hosted pages in the store's look, suppression everywhere | backend | S | open |
| MK-15 | Campaign engine: freeze recipients, batch tick with lease, rates, quiet hours, dedupe, stop, test send, unique coupons, tracked links + open pixel, attribution | backend | L | open |
| MK-16 | Campaigns panel: list, compose steps, review + confirm, report | mint-tenant | L | open |
| **Phase 4 — Wishlists and alerts** | | | | |
| MK-17 | Wishlist add-ons on EC-31 / EC-32 (docs/ecommerce/CARTS_AND_WISHLISTS.md): `add_to_wishlist` events, mint.js hearts widget if EC-33 doesn't cover it, `lastPriceAlertAt` | backend | S | open — after EC-31 |
| MK-18 | Back-in-stock alerts: Notify me endpoint + widget, Stock alert model, stock hook, sending, expiry, panel list | backend + mint-tenant | M | open |
| MK-19 | Price-drop alerts: check on save, threshold + cooldown, consent, setting | backend + mint-tenant | S | open |
| **Finish** | | | | |
| MK-20 | MCP tools (MK33) | backend | M | open |
| MK-21 | Docs, website, rollout (`upgradeStores.js --apply` on prod; the user deploys the backend) | all | S | open |

## Handoff

Nothing built yet. The open questions are answered (README §8). Start with MK-02 (or MK-07 /
MK-10 if phase 2 goes first).

---

## MK-02 — SMS channel (L)

- `library/functions/phone.ts` (MK4); the courier code imports it (no behaviour change; the courier smokes still pass).
- `MessagingConnection` model (tenantScoped): channel, provider, label, sealed `secrets` (`select: false`), settings
  (sender id), isDefault, lastTest {ok, message, at}. API under `/tenant/api/p/:project/messaging/connections`:
  list (keys shown as set / not set), create / update (runs Test), test `{to}`, balance, delete (refused while an
  automation or a scheduled campaign uses it, naming them).
- The BulkSMSBD adapter (the user's pick, README §8), with a stub in `marketing-stub.mjs`. It starts from `sendSms.controller.ts`'s request, with keys from the connection, not env.
- `send.ts` `sendSms(project, {to, body, source})` → `ChannelMessage` (MK6). `smsLength.ts` (MK5) with unit tests
  for GSM-7, extension characters and Bangla.
- Delivery reports: the gateway's webhook route or a poll on the scheduler tick for `sent` messages under 24 h old.
- mint-tenant: Project → Messaging gets the SMS card: connect dialog, Test to a number (green / red), balance, default.
  Guide mint-docs `/messages#sms`.
- Smoke `marketing-sms.mjs`: connect, test, send, parts, bad number skipped, delivery report applied, keys never in
  any response.

## MK-03 — SMS / WhatsApp actions + Send after (M)

- `automations.function.ts`: action `sms` {to: {fields[] | phone}, body, connection?} and `whatsapp` {to, template,
  lang, vars[] (placeholders), connection?}. Both check `checkAutomation`. Placeholders as email (AU-03d, linked
  fields). The body is counted (MK5) in the dry run.
- `after: {amount, unit}` on any action → `ScheduledAction` {runAt, automation, record, action index, attempts,
  lock}; the leased tick runs due ones, re-reads the record, re-checks `when`, then runs the action. Runs log shows
  "Waiting until …" then the result. Max 30 days.
- Both panels' automation editors (mint-tenant + admin): the two actions, the parts counter, Send after.
- Smoke `marketing-actions.mjs`.

## MK-04 — Order message pack (M)

- `commerce/marketing/messages.ts`: the six automations of MK17 (SMS and email copies, all off) installed by the
  store and by `upgradeStore`. Phone from the order (`phone`) or its customer. *On its way* / *Out for delivery* /
  *Delivered* on Deliveries (CR-14's two email ones become part of the pack, not duplicated). *Rate your order*
  = Delivered + `after 1 day`.
- Store settings → Messages: each item's switch, channel(s), wording with fields, preview with a real recent order,
  last month's count. Saving rewrites its automation. Editing it in Automations unlinks it ("Changed in
  Automations — edit it there").
- Guide `/store/messages`.

## MK-05 — Rate your order (M)

- `ShortLink` model + `links.ts` (rating, click, unsubscribe kinds); served under `mintapp.shop/l/…` (README §8).
- Order rating builder model (blueprint, locked) + `upgradeStore`. The public rating page: the store's name, logo and
  colours from the site design, stars, comment, thank you. One per order, changeable for 7 days.
- `{{ratingLink}}` placeholder on orders. Order page rating card. Ratings table (stars, comment, order, customer).
  Average + count on the store dashboard (EC-27). A 1–2 star rating sends a panel notification to managers.

## MK-06 — WhatsApp Cloud API (M)

- Adapter `whatsappCloud.ts`: phone number id + WABA id + permanent token (sealed). Test = send the account's
  `hello_world` (or a picked template) to a number. `templates()` from the Graph API (approved only). Delivery
  reports from the webhook (verify token + app secret signature).
- The WhatsApp card in Project → Messaging. The action's template picker + variable mapping. The pack's items offer
  WhatsApp when a connection exists.
- Guide: making templates in WhatsApp Manager, what Meta approves.

## MK-07 — Store events (M)

- MK22 ids from one helper (`itemId(variant)`, `groupId(product)`), used by events and feeds.
- mint.js: Cart / Checkout / Search / Wishlist widgets call `mint.track(name, data)`. `mint.track` loads nothing
  new: it calls whichever of `fbq` / `gtag` / `ttq` the site's tags made, with each provider's event name and
  params (MK20), and sends the same event with its id to `POST /public/api/store/events`.
- `POST /store/events` {name, eventId, items, value, url, ads cookies} → server copies for providers with
  server-side on (view item, add to cart, begin checkout). Rate limited per visitor. Never used for purchase (MK-08).
- Smoke: each event reaches the stub's Meta / GA4 / TikTok endpoints with matching ids.

## MK-08 — Server-side purchase (M)

- `POST /store/orders` takes `ads` (README §5). The checkout widget fills it from cookies.
- `adEvents.purchase(order)` from `createWebsite` (or from the payment-confirmed hook when "counted when paid", or the delivery engine's `delivered` when "counted when delivered"; matching data and cookies are kept on the order for that, and an order older than 7 days is sent at placement time instead):
  Meta CAPI (`serverTracking.sendMeta` with user_data hashed), GA4 MP (`purchase` with transaction_id, client_id
  from `_ga`), TikTok Events API (`CompletePayment`, new key `secrets.tiktokAccessToken` + `serverSide.tiktok`).
  In the background (`later`). Failures logged in `AdEvent`, never thrown.
- The `purchaseWhen` setting: placed (default) / paid / delivered. Test event code passes through.
- Smoke `marketing-ads.mjs`: hashes match the providers' normalisation (lower-case trimmed email; phone as digits
  with country code), event id = order id, nothing sent for POS sales.

## MK-09 — Ads & tracking screen (M)

- mint-tenant Store → Marketing → Ads & tracking: three cards, each reading and writing the same `WebsiteSettings`
  fields as `/website-setup` (one source of truth). Plus TikTok server-side. Test event (sends a `PageView` /
  `TestEvent` with the test code). The event log (last 100 from `AdEvent`: event, provider, ok / error, matching
  fields used). Tips.
- Live Fresh / Verte (the user's own storefronts, not a customer's): send `ads` and `eventId` with their orders and
  call `mint.track` on product, cart and checkout pages.
- Guide `/store/ads`.

## MK-10 — Product addresses and online stock (S)

- Product `slug` (★, unique, made from the name on create, editable; the form's SEO section shows the full URL).
  `upgradeStore` makes slugs for existing products (dedupe with `-2`).
- Store settings → Marketing: product link pattern (checked: must be https and contain `{slug}` or `{id}`), online
  outlets (MK26). EC-16a's out-of-stock reads the same rule.

## MK-11 — Product feeds (M)

- `feeds.ts`: build items per MK24 from products + variants + stock levels of the online outlets. Google RSS 2.0 with
  the `g:` namespace; CSV with the same columns. Per-channel tweaks (Meta: `fb_product_category` passes through when
  mapped; TikTok: same file). Cached on S3 or in `FeedCache` with ETag. Stale flag set by product / variant / stock
  / settings changes, rebuilt by the tick within 15 minutes; Rebuild now.
- `GET /public/feeds/:token/:name` (no API key; the token is the secret; Rotate link in the panel).
- Feed health (MK27). The category → Google product category picker (typed search over Google's taxonomy file,
  shipped as JSON, loaded on that screen only).
- Smoke `marketing-feeds.mjs`: variants as items, sale price, out of stock, hidden categories left out, XML valid.

## MK-12 — Customer data + consent (M)

- StoreCustomer's new engine fields (README §4), kept by the order engine on every order. `upgradeStore` backfills
  them from orders.
- `consent.ts`: `canMarket(customer, channel)` per MK8 and the store's consent mode (Store settings → Marketing: soft opt-in by default, or opt-in only). Consent boxes on checkout
  (mint.js checkout and `POST /store/orders` `marketing`) and on sign-up. Customer page consent card (staff can
  unsubscribe, not subscribe).

## MK-13 — Segments (M)

- Segment builder model + `segments.ts` compiler: each condition → a Mongo match on StoreCustomer, or a `$lookup`
  on Customer purchases (product, category through product, brand). Relative dates. All / any. `count` and
  `preview` endpoints (debounced from the editor, 2 s timeout, indexes noted).
- The six ready segments (MK11) installed by the store and `upgradeStore`. VIP threshold worked out nightly.
- Customers table: "In segment" filter. Panel: Segments list + editor (§6).

## MK-14 — Unsubscribe + preferences (S)

- One-click headers on every marketing email (`List-Unsubscribe: <https://…/u/:t>, <mailto:…>` +
  `List-Unsubscribe-Post: List-Unsubscribe=One-Click`). The SMS stop link appended by the sender, counted in parts.
- The unsubscribe page and the preferences page (Mint-hosted, the store's look). Each writes MK8 consent with source
  `link`. Every marketing send checks `canMarket` at send time, not just when the list was made.

## MK-15 — Campaign engine (L)

- Campaign builder model (locked) + `campaigns.ts`: `start` freezes `CampaignRecipient` rows (consent, valid
  address, dedupe), `tick` sends a batch per campaign under a lease (rates, quiet hours), `stop`. A failed send is
  retried twice, then failed with the reason. Totals kept on the campaign.
- Content: email through the store's mail account + design (M-03a). SMS / WhatsApp through MK-02 / MK-06. Every
  link is rewritten to a tracked `ShortLink` with UTM tags. Email gets the open pixel.
- Coupons: shared or unique (MK13; codes made in one batch on start, single use, tied to the recipient).
- Attribution in `createWebsite`: campaign coupon → that campaign; else the customer's `clickedAt` within 7 days →
  that link's campaign. Orders + revenue added to the campaign's totals and kept on the order (`campaign`).
- Test send. Cost estimate. The 1,000+ typed confirmation (MK32) is enforced on the server too.
- Smoke `marketing-campaigns.mjs`: dedupe, consent skip, quiet hours wait, stop mid-way, clicks, unsubscribe,
  unique coupon attribution, no double send under two ticks.

## MK-16 — Campaigns panel (L)

- List, compose steps, review, report (README §6). Duplicate a campaign. Guide `/store/marketing`.

## MK-17 — Wishlist add-ons (S)

- The wishlist is built by EC-31 / EC-32 (`docs/ecommerce/CARTS_AND_WISHLISTS.md`). Don't build a second one.
- On top: `mint.track('add_to_wishlist')` (MK-07). A mint.js Wishlist widget (hearts on `data-mint-wish`, count,
  list) for mint.js storefronts, only if EC-33 builds Live Fresh's hearts in its own code. `lastPriceAlertAt` on
  its model for MK-19.

## MK-18 — Back-in-stock alerts (M)

- Stock alert builder model + `POST /store/stock-alerts` (rate limited, one waiting per contact per variant, consent
  box for marketing optional). mint.js: Notify me on out-of-stock variants (Cart widget's buttons swap to it).
- `stock.move` → `stockAlerts.check(variant)` in the background when online stock crosses 0 → queue the waiting
  alerts (oldest first) on `ScheduledAction`, send through the store's alert wording, mark sent. Expiry tick.
- Panel: Stock alerts → waiting by variant ("12 people waiting — restock"), sent, expired.

## MK-19 — Price-drop alerts (S)

- `priceDrop.check` after product / variant saves (price, compare-at, variant price), per MK30. Setting in Store
  settings → Marketing (off by default). Wording in Messages.

## MK-20 — MCP tools (M)

- `list_segments` / `save_segment` (returns the live count), `draft_campaign` / `send_test_campaign` /
  `get_campaign_report` (no send tool, MK33), `get_feed_health`, `get_ad_events`, `list_stock_alerts`,
  `get_wishlist_stats`, `list_ratings`. `describe_platform` mentions them for stores.

## MK-21 — Docs, website, rollout (S)

- mint-docs guides (MK34) checked end to end. The marketing website's store page gains Marketing.
- Prod: the user deploys the backend. Then `node scripts/upgradeStores.js --apply` (new models, fields, slugs,
  automations off, segments). Verte / Live Fresh: connect their SMS gateway, turn on the pack, add the feed in
  Commerce Manager.
