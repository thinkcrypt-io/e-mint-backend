# Connecting the couriers — what their APIs need

Checked 2026-10-31. **Confidence** says where each fact came from:

- **Official** — the courier's own API page.
- **Courier's Postman** — the Postman collection "SteadFast API Documentation", whose examples are real Steadfast responses.
- **Packages** — third-party SDKs and Laravel packages. They are not the courier's word: CR-04 / 08 / 09 confirm these against the live API (or sandbox) first.

| Courier | Official docs | Where they are |
|---|---|---|
| RedX | Yes, read in full | Merchant panel → **Developer APIs** (`redx.com.bd/developer-api/`). You must be signed in. |
| Steadfast | Partly: Postman collection; no webhook spec | [Postman collection](https://documenter.getpostman.com/view/26211192/2sAYJ1mhpk). `steadfast.com.bd/api-docs` returns 404, and the panel needs sign-in. |
| Pathao | Not reachable | `merchant.pathao.com/courier/developer-api` needs merchant sign-in; `developer.pathao.com` doesn't resolve. |

**To close the gaps:** sign in to the Steadfast and Pathao merchant panels in the browser pane, then read their API / webhook pages the same way the RedX page was read. Or capture the first real webhook calls (CR-06 stores the raw body and headers).

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

## Pathao (packages only — CR-08 must confirm)

**What the store owner does in Pathao**
1. Sign in to the Pathao merchant panel. Under **Developer API → Merchant API Credentials**, copy the client id and client secret (packages). Mint also needs the account's email and password, because the token is issued with a password grant.
2. Webhook: register the callback URL in the merchant panel's developer / webhook settings (the exact menu is unconfirmed). Packages mention a "secret token" given with the credentials; it is compared with `X-PATHAO-Signature`.

**What Mint stores:** client id, client secret, username, password (all sealed); access and refresh token with expiry (sealed); store id; webhook secret.

| | |
|---|---|
| Base URL | live `https://api-hermes.pathao.com`, sandbox `https://courier-api-sandbox.pathao.com` |
| Sandbox | One package publishes public sandbox credentials (client id `7N1aMJQbWm`, user `test@pathao.com`). Use them in smoke tests and stubs, never for real stores. |
| Token | `POST /aladdin/api/v1/issue-token` `{ client_id, client_secret, username, password, grant_type: "password" }` → `{ access_token, refresh_token, expires_in }`. Refresh: the same path with `grant_type: "refresh_token"` and `refresh_token`. Lifetime: 5 days documented, 90 days seen in sandbox, so refresh by `expires_in`. Calls use `Authorization: Bearer <token>`. |
| Test connection | Issue a token, then `GET /aladdin/api/v1/stores`. |
| Options | `GET /aladdin/api/v1/city-list` → `cities/:city_id/zone-list` → `zones/:zone_id/area-list`; stores `GET /stores`, `GET /stores/:id`, `POST /stores` (name, contact_name, contact_number, address, city_id, zone_id, area_id; a new store takes about 1 h to be approved) |
| Charge | `POST /aladdin/api/v1/merchant/price-plan` `{ store_id, item_type, delivery_type, item_weight, recipient_city, recipient_zone }` → `{ price, discount, cod_enabled, cod_percentage, final_price }` |
| Book | `POST /aladdin/api/v1/orders`. Fields: `store_id`, `merchant_order_id`, `recipient_name` (3–100), `recipient_phone` (01…, 11 digits), `recipient_address` (10–220), `delivery_type` (48 normal / 12 on-demand), `item_type` (1 document / 2 parcel), `item_quantity`, `item_weight` (0.5–10 kg, sent as a string), `amount_to_collect`. Optional: `recipient_city` / `recipient_zone` / `recipient_area` (packages disagree on whether they're required; one says Pathao reads them from the address), `special_instruction`, `item_description`, `recipient_secondary_phone`. Returns `data: { consignment_id, merchant_order_id, order_status, delivery_fee }`. Bulk `POST /orders/bulk { orders: [...] }` → 202 with no ids. |
| Status | `GET /aladdin/api/v1/orders/:consignment_id/info` → `order_status`, `order_status_slug`, `updated_at`, `invoice_id` |
| Find by invoice | Not found in any source. So if a booking times out: no automatic retry; the delivery is marked "Check the Pathao panel before sending again". |
| Webhook auth | Header `X-PATHAO-Signature`. One package compares it with the secret as plain text (not HMAC). Mint compares in constant time. |
| Handshake | The first call has `event: "webhook_integration"` and a header `X-Pathao-Merchant-Webhook-Integration-Secret: <uuid>`. Reply **202** and send the same header and value back. |
| Webhook body | `event`, `consignment_id`, `merchant_order_id`, `order_status`, … The **event names are not in any source**. The plan's list (`order.created`, `order.picked`, `order.delivered`, `order.returned`, `order.paid`, …) is a guess until the sandbox shows the real ones. CR-08 maps by `order_status` / `event` after capturing them. |

---

## What this changes in the plan

- **The webhook secret's origin depends on the courier** (CR3 / CR9):
  - Steadfast: generates it; the owner pastes it into Mint.
  - RedX: has none; Mint makes a token and puts it in the URL query.
  - Pathao: compares a secret in `X-PATHAO-Signature`. Its origin is unconfirmed: the owner pastes it, or Mint generates one if Pathao's panel lets you type it.

  So the adapter declares `webhook.secret: 'theirs' | 'ours'`, and the Store settings card asks for it or shows it to match.
- **Look up by invoice (CR13) works on Steadfast only.** On RedX and Pathao, a booking that times out becomes `error` with "Check the <courier> panel before sending again", plus a **Link existing parcel** action where staff type the tracking id in. That action calls `status`, then attaches the parcel to the delivery.
- **RedX areas are flat** (one area id, searchable by district or post code), so CR-10's pickers are city → zone → area for Pathao and one search box for RedX.
- **RedX's `ready-for-delivery` means "received from the merchant"** → `picked-up`, not out-for-delivery. `paid` → settle (CR11).
- **Steadfast `in_review` → `booked`, `pending` → `in-transit`**; the `*_approval_pending` states map like their finals (delivered, partly-delivered, cancelled), and the delivery stays open until the final state arrives.
- **New idea, CR-18:** Steadfast's `fraud_check/:phone` as a "Delivery risk" badge on website orders (parcels, delivered, cancelled for the buyer's phone).
- **Tracking links** for customers are not in any API doc. CR-04 / 08 / 09 read them from each courier's public track page; until then the order shows the tracking code without a link.
