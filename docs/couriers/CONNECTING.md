# Connecting the couriers — what their APIs need

Checked 2026-10-31. **Confidence** says where each fact came from:

- **Official** — the courier's own API page.
- **Courier's Postman** — the Postman collection "SteadFast API Documentation", whose examples are real Steadfast responses.
- **Packages** — third-party SDKs and Laravel packages. They are not the courier's word: CR-04 / 08 / 09 confirm these against the live API (or sandbox) first.

| Courier | Official docs | Where they are |
|---|---|---|
| RedX | Yes, read in full | Merchant panel → **Developer APIs** (`redx.com.bd/developer-api/`). You must be signed in. |
| Steadfast | Partly: Postman collection; no webhook spec | [Postman collection](https://documenter.getpostman.com/view/26211192/2sAYJ1mhpk). `steadfast.com.bd/api-docs` returns 404, and the panel needs sign-in. |
| Pathao | Yes (read signed in) | `merchant.pathao.com/courier/developer-api` — API Documentation + Webhook Integration tabs |

**Still open:** Steadfast's webhook spec (sign in to its panel and read the Webhook page, or capture the first real calls — CR-06 keeps the raw body and headers).

---

## RedX (official)

**What the store owner does in RedX**
1. Sign in to the RedX merchant panel. Go to **Developer APIs → Configuration → Production → Request token**. The sandbox token is shown on the same page.
2. Find the pickup store id with `GET /pickup/stores`. It is **not** the shop id shown in the panel URL. Using the shop id fails with "Cannot read property 'PHONE' of undefined" (packages).
3. Under **Developer APIs → Webhook**: paste the callback URL Mint shows, then **Enable**.

**What Mint stores:** the access token (sealed), mode (sandbox / production), pickup store id, and pickup area id (needed for the charge calculator).

| | |
|---|---|
| Base URL | production `https://openapi.redx.com.bd/v1.0.0-beta`, sandbox `https://sandbox.redx.com.bd/v1.0.0-beta`. The doc's curl samples add `/v1.0.0-beta` a second time; use it only once. |
| Auth | Header `API-ACCESS-TOKEN: Bearer <token>` on every call |
| Test connection | `GET /pickup/stores` → `{ pickup_stores: [{ id, name, address, area_name, area_id, phone, created_at }] }` |
| Areas | `GET /areas`, `?post_code=`, `?district_name=` → `{ areas: [{ id, name, post_code, division_name, zone_id }] }`. The list is flat: there are no city / zone pickers. |
| Charge | `GET /charge/charge_calculator?delivery_area_id&pickup_area_id&cash_collection_amount&weight` (grams) → `{ deliveryCharge, codCharge }` |
| Book | `POST /parcel`. Required: `customer_name`, `customer_phone`, `delivery_area`, `delivery_area_id`, `customer_address`, `cash_collection_amount` (string), `parcel_weight` (grams), `value` (declared value). Optional: `merchant_invoice_id`, `instruction`, `paid_return_charge`, `is_closed_box` ("true" = buyer can't open it before paying), `pickup_store_id`, `parcel_details_json` [{ name, category, value }], `type` (reverse). Returns `{ tracking_id }`. |
| Status | `GET /parcel/info/:tracking_id` returns the whole parcel, including `status`, `charge`, `cash_collection_amount`, `merchant_invoice_id` and `delivery_type`. `GET /parcel/track/:tracking_id` returns `{ tracking: [{ message_en, message_bn, time }] }`. |
| Find by invoice | **No endpoint.** For CR13, if a booking times out, Mint can't look the parcel up by invoice. So: no automatic retry; the delivery is marked "Check the RedX panel before sending again". |
| Cancel | `PATCH /parcels` `{ entity_type: "parcel-tracking-id", entity_id, update_details: { property_name: "status", new_value: "cancelled", reason } }` → `{ success, message: "Request Accepted" }`. The change happens later (async), so wait for the status to show it. |
| Webhook auth | **None from RedX.** "Any required credentials should be included in the query parameters", for example `https://…/callback?token=<token>`. Mint makes the token itself and puts it in the URL it shows. |
| Webhook body | `{ tracking_number, timestamp, status, message_en, message_bn, invoice_number, delivery_type }`. These names differ from the REST API: `tracking_number` = `tracking_id`, `invoice_number` = `merchant_invoice_id`. |
| Statuses | `pickup-pending` (seen only in parcel info) · `ready-for-delivery` (received from the merchant) · `delivery-in-progress` (with the rider) · `delivered` · `agent-hold` · `agent-returning` · `returned` · `agent-area-change` · `paid` (amount paid to the merchant). There is no `cancelled` in the webhook list. Delivery types: regular, reverse, exchange-delivery, exchange-return, partial-delivery, partial-return. |
| Phones | Pickup store phones come back as `880…`. Send customer phones as `01XXXXXXXXX`; one package says `+880` breaks booking. |

---

## Steadfast (Postman collection; webhook from packages)

**What the store owner does in Steadfast**
1. Get the **API key** and **Secret key** from the merchant dashboard. If they aren't shown there, ask Steadfast support (packages and the WordPress plugin say both).
2. Open **Webhook** settings: paste the **Callback URL** Mint shows, click **Generate** next to **Auth token**, copy the token **into Mint**, then **Save webhook**. This comes from packages. Here Steadfast makes the secret, not Mint, so Mint's Steadfast card asks for the token rather than showing one.

**What Mint stores:** API key and secret key (sealed), and the webhook auth token (sealed).

| | |
|---|---|
| Base URL | `https://portal.packzy.com/api/v1` (Postman). One old package uses `portal.steadfast.com.bd`; don't use it. **No sandbox**, so tests run against the live API with real consignments. |
| Auth | Headers `api-key`, `secret-key`, `Content-Type: application/json`. No token step. Responses carry `X-RateLimit-Limit: 2000`. |
| Test connection | `GET /get_balance` → `{ status: 200, current_balance }`. The balance can be negative. |
| Book | `POST /create_order`: `invoice` (unique; letters, digits, `-`, `_`), `recipient_name` (≤ 100), `recipient_phone` (11 digits; Postman sends `+880…`, so check which form works), `recipient_address` (≤ 250), `cod_amount`, `note`. Optional: `recipient_email`, `alternative_phone`, `item_description`, `delivery_type` (home / point; exact values unconfirmed), `total_lot`. Returns `{ status: 200, consignment: { consignment_id, invoice, tracking_code, status: "in_review", … } }`. |
| Bulk | `POST /create_order/bulk-order`, at most 500 orders. The Postman body is a raw array; packages wrap it as `{ "data": "<JSON string>" }`. Try both and keep the one that works. Results are per item: on failure `consignment_id: null` and `error` set (for example `THIS_INVOICE_ALREADY_EXISTS`). |
| Status | `GET /status_by_cid/:id`, `/status_by_invoice/:invoice`, `/status_by_trackingcode/:code` → `{ status: 200, delivery_status }`. The Postman collection shows `status_by_cid` plus `trackings_by_invoice/:invoice` (the full tracking log); the other two come from packages. |
| Find by invoice | `status_by_invoice` / `trackings_by_invoice`. CR13 works: a re-send also fails with `THIS_INVOICE_ALREADY_EXISTS`, so a parcel is never booked twice. |
| Cancel | No API. Cancel in the panel; the webhook or a sync then brings the change in. |
| Other | `POST /create_return_request` (`consignment_id` \| `invoice` \| `tracking_code`, `reason`), `GET /get_return_request(s)`, `POST /create_pickup_request`, `GET /payments`, `GET /payments/:payment_id` (payout with its consignments, for CR11), `GET /police_stations`, `GET /fraud_check/:phone` → `{ total_parcels, total_delivered, total_cancelled }`. The last one is Steadfast's "Delivery Risk Check", worth showing on website orders (CR-18). |
| Webhook auth | Packages disagree. One says Steadfast sends `Authorization: Bearer <token>`; another says `X-Signature` = HMAC-SHA256 of the raw body, keyed with the same token (hex). Mint accepts either when it matches the saved token. The raw body is kept, and the check that passed is logged, so the real method can be confirmed and the other check removed later. |
| Webhook body | `{ notification_type: "delivery_status", consignment_id, invoice, cod_amount, status, delivery_charge, tracking_message, updated_at }`. `tracking_update` carries `consignment_id`, `tracking_code` and `tracking_message`. Other types listed in packages: consignment_update, cancel_request, return_request, payment_request, pickup_request, return_list_accepted, user_update. Mint logs these and ignores them for now. |
| Retries (packages) | Header `Idempotency-Key`, which is the same on retries. Any 2xx = accepted; 4xx is not retried; 5xx / unreachable → retried after about 30 s and about 2 min (3 attempts in all). So use `Idempotency-Key` as the dedupe key when present. |
| Statuses | `in_review` (just placed) · `pending` (on the way) · `hold` · `delivered_approval_pending` · `partial_delivered_approval_pending` · `cancelled_approval_pending` · `unknown_approval_pending` · `delivered` · `partial_delivered` · `cancelled` · `unknown` |

---

## Pathao (official — merchant panel's Developer API page, read signed in 2026-10-31)

Source: `merchant.pathao.com/courier/developer-api`, which has two tabs, **API Documentation** and **Webhook Integration**.
The Webhook Integration tab only appears once the merchant has pressed **Generate Credentials**. Pathao's own
WooCommerce plugin ([pathao-eng/courier-woocommerce-plugin](https://github.com/pathao-eng/courier-woocommerce-plugin))
agrees with the page and fills in how the handshake reply works.

**What the store owner does in Pathao**
1. Sign in to the Pathao merchant panel → **Developer API** → **Merchant API Credentials**. If no keys are there yet,
   press **Generate Credentials**. Copy the **Client ID** and **Client Secret** into Mint, together with the email and
   password the owner uses to sign in to Pathao (the token is issued with a password grant).
2. Pick the store id: Mint lists the owner's Pathao stores (`GET /stores`) and they choose one. Mint suggests the one
   marked `is_default_store`.
3. **Developer API → Webhook Integration**:
   - Paste the **Callback URL** Mint shows.
   - Paste the **Webhook secret** Mint shows. The doc calls it "Given By Merchant", so Mint generates it.
   - Choose **All Events**.
   - Press **Add Webhook**, then use Pathao's **test** button there.

**What Mint stores:** client id, client secret, email, password, access and refresh token with expiry (all sealed),
mode, store id, delivery type, item type, the webhook secret (sealed), and the integration reply header (see below).

| | |
|---|---|
| Base URL | live `https://api-hermes.pathao.com`, sandbox `https://courier-api-sandbox.pathao.com` |
| Sandbox | Published on the page for everyone: client id `7N1aMJQbWm`, client secret `wRcaibZkUdSNz2EI9ZyuXLlNrnAv0TdPUPXMnD39`, `test@pathao.com` / `lovePathao`. Use them for smoke tests and the "Test" mode. |
| Token | `POST /aladdin/api/v1/issue-token` with body `{ client_id, client_secret, grant_type: "password", username, password }`, which returns `{ token_type: "Bearer", expires_in: 432000, access_token, refresh_token }`. Refresh uses the same path with `grant_type: "refresh_token"` and `refresh_token`. Calls send `Authorization: Bearer …`. **Plan:** keep the token sealed and refresh it a day before it expires. If the refresh fails, issue a new one with the password. (Pathao's plugin instead calls `POST /aladdin/api/v1/external/login` with only `{ client_id, client_secret }`. The doc doesn't list that path, so it's a fallback to try in CR-08, not the main route.) |
| Test connection | Issue a token, then `GET /aladdin/api/v1/stores`. The reply is `data.data[]` with `{ store_id, store_name, store_address, is_active, city_id, zone_id, hub_id, is_default_store, is_default_return_store }`. |
| Options | `GET /aladdin/api/v1/city-list` returns `{ city_id, city_name }`. Then `cities/:id/zone-list` returns `{ zone_id, zone_name }`. Then `zones/:id/area-list` returns `{ area_id, area_name, home_delivery_available, pickup_available }`. Each list is wrapped as `data.data[]`. (The plugin also uses `/countries/1/city-list`, `/zones/list` and `/areas/list`.) |
| Create store | `POST /stores` with `{ name (3–50), contact_name (3–50), contact_number (11), secondary_contact?, otp_number?, address (15–120), city_id, zone_id, area_id }`. The reply says "please wait one hour for approval". |
| Charge | `POST /aladdin/api/v1/merchant/price-plan` with `{ store_id, item_type, delivery_type, item_weight, recipient_city, recipient_zone }`. City and zone are **required here**. The reply is `{ price, discount, promo_discount, plan_id, cod_enabled, cod_percentage, additional_charge, final_price }`. |
| Book | `POST /aladdin/api/v1/orders`. **Required:** `store_id`, `recipient_name` (3–100), `recipient_phone` (11), `recipient_address` (10–220), `delivery_type` (48 normal / 12 on demand), `item_type` (1 document / 2 parcel), `item_quantity`, `item_weight` (0.5–10 kg), `amount_to_collect` (whole number, 0 when not cash on delivery). **Optional:** `merchant_order_id`, `recipient_secondary_phone`, `recipient_city` / `recipient_zone` / `recipient_area` (if left out, Pathao works them out from the address; never send null), `special_instruction`, `item_description`. Returns `{ consignment_id, merchant_order_id, order_status: "Pending", delivery_fee }`. |
| Bulk | `POST /orders/bulk` with `{ orders: [...] }`. It answers 202 with `data: true` and no consignment ids; those arrive later through the `order.created` webhooks, matched by `merchant_order_id`. |
| Status | `GET /aladdin/api/v1/orders/:consignment_id/info` returns `{ consignment_id, merchant_order_id, order_status, order_status_slug, updated_at, invoice_id }` |
| Find by invoice | No endpoint for it. But `order.created` carries `merchant_order_id`, so a booking that timed out is matched up when that webhook arrives. Until it does, the delivery shows "Waiting for Pathao to confirm"; after 10 minutes with nothing, it falls back to **Link existing parcel**. |
| Cancel | No API for it. |
| Webhook request | `POST` to the callback URL, with headers `X-PATHAO-Signature: <webhook_secret>` (the secret itself, not a hash; Pathao's plugin checks it with plain equality) and `Content-Type: application/json`. |
| Webhook reply | Answer within **10 seconds**, in at most 3 redirects, over valid HTTPS. Reply with the header the Webhook Integration tab names. It is per merchant (`webhook_header_key` / `webhook_header_value`) and only optional while the merchant isn't "strict". Pathao's plugin always sends `X-Pathao-Merchant-Webhook-Integration-Secret: f3992ecc-59da-4cbe-a049-a13da2018d51` with status **202**. Mint does the same, and the owner can change the value in Store settings if their tab shows another. The first call has `event: "webhook_integration"`. |
| Webhook body | `{ consignment_id, merchant_order_id, updated_at, timestamp, store_id, event, … }`, plus per event: `delivery_fee` (created / updated / pickup-requested), `collected_amount` (delivered, partial-delivery, paid-return, exchanged), `reason` (sometimes), `invoice_id` (paid), `return_collected_amount` + `return_type` (return-id-created, return-in-transit, returned-to-merchant). |
| Events → CR6 | `order.created` → booked · `order.updated` → keep (refresh) · `order.pickup-requested`, `order.assigned-for-pickup` → pickup-pending · `order.picked` → picked-up · `order.pickup-failed` → on-hold · `order.pickup-cancelled` → cancelled · `order.at-the-sorting-hub`, `order.in-transit`, `order.received-at-last-mile-hub` → in-transit · `order.assigned-for-delivery` → out-for-delivery · `order.delivered` → delivered · `order.partial-delivery` → partly-delivered · `order.delivery-failed` → failed-attempt · `order.on-hold` → on-hold · `order.returned`, `order.return-id-created`, `order.return-in-transit` → returning · `order.returned-to-merchant` → returned · `order.paid-return` → returned (with return charge collected) · `order.exchanged` → delivered (exchange; note) · `order.paid` → settle (CR11, `invoice_id`) · `store.created` / `store.updated` → refresh the store list |
| Tracking link | Not in the doc. |

---

## What this changes in the plan

- **The webhook secret's origin depends on the courier** (CR3 / CR9):
  - Steadfast: generates it; the owner pastes it into Mint.
  - RedX: has none; Mint makes a token and puts it in the URL query.
  - Pathao: the merchant types the secret into its panel, so Mint generates it, shows it and checks `X-PATHAO-Signature`; Mint's reply must also carry Pathao's integration header.

  So the adapter declares `webhook.secret: 'theirs' | 'ours'`, and the Store settings card asks for it or shows it to match.
- **Look up by invoice (CR13) works on Steadfast only.** Pathao's `order.created` webhook carries our order number, so a Pathao booking that timed out is matched when that arrives. On RedX (and Pathao after 10 minutes), the delivery becomes `error` with "Check the <courier> panel before sending again", plus a **Link existing parcel** action where staff type the tracking id in. That action calls `status`, then attaches the parcel to the delivery.
- **RedX areas are flat** (one area id, searchable by district or post code), so CR-10's pickers are city → zone → area for Pathao and one search box for RedX.
- **RedX's `ready-for-delivery` means "received from the merchant"** → `picked-up`, not out-for-delivery. `paid` → settle (CR11).
- **Steadfast `in_review` → `booked`, `pending` → `in-transit`**; the `*_approval_pending` states map like their finals (delivered, partly-delivered, cancelled), and the delivery stays open until the final state arrives.
- **New idea, CR-18:** Steadfast's `fraud_check/:phone` as a "Delivery risk" badge on website orders (parcels, delivered, cancelled for the buyer's phone).
- **Tracking links** for customers are not in any API doc. CR-04 / 08 / 09 read them from each courier's public track page; until then the order shows the tracking code without a link.
