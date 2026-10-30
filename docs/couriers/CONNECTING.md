# Connecting the couriers — what their APIs need

Checked 2026-10-31. **Confidence** says where each fact came from:

- **Official** — the courier's own API page.
- **Courier's Postman** — the Postman collection "SteadFast API Documentation", whose examples are real Steadfast responses.
- **Packages** — third-party SDKs and Laravel packages. They are not the courier's word: CR-04 / 08 / 09 confirm these against the live API (or sandbox) first.

| Courier | Official docs | Where they are |
|---|---|---|
| RedX | Yes, read in full | Merchant panel → **Developer APIs** (`redx.com.bd/developer-api/`). You must be signed in. |
| Steadfast | Yes (read signed in) | Merchant dashboard → **API guide** (`/user/api/guide`) and **Webhook** (`/user/webhook/add`) |
| Pathao | Yes (read signed in) | `merchant.pathao.com/courier/developer-api` — API Documentation + Webhook Integration tabs |

All three are now from the couriers' own pages. A few things are only stated there, not tried: CR-04 / CR-08 / CR-09 confirm them on the first real or sandbox call (CR-06 keeps each webhook's raw body and headers).

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

## Steadfast (official — the merchant dashboard's API guide and Webhook pages, read signed in 2026-10-31)

Sources: `steadfast.com.bd/user/api/guide`, `/user/api` (keys) and `/user/webhook/add`. All three need the merchant to be signed in.
The public [Postman collection](https://documenter.getpostman.com/view/26211192/2sAYJ1mhpk) is older. Where the two disagree, the guide wins.

**What the store owner does in Steadfast**
1. Dashboard → **API** (`/user/api`, "Your API keys"): issue a key named "Mint" and copy the **API key** and **Secret key** into Mint. A profile can hold several named keys, so Mint gets its own and doesn't share one with an old plugin. Each business under an account has its own keys and only sees its own parcels.
2. Dashboard → **Webhook** (`/user/webhook/add`):
   - **Callback URL**: paste the one Mint shows.
   - **Auth token**: paste the token Mint shows. It's optional in Steadfast's form, but Mint requires it. Allowed characters are letters, digits and `- _ . =`. Steadfast also has a **Generate** button; if the owner uses that, they paste the generated token into Mint instead.
   - Then **Save webhook**.

   There is **one callback URL per profile**. If the profile already sends to another system, connecting Mint replaces it, so Mint's card warns about this.

**What Mint stores:** API key and secret key, and the webhook auth token (all sealed).

| | |
|---|---|
| Base URL | `https://portal.packzy.com/api/v1`. **No sandbox**: every booking is real, so smoke tests run against the stub. |
| Auth | Send `Api-Key`, `Secret-Key` and `Content-Type: application/json` on every call. There's no token to fetch. A wrong key gets **401**. Ten failures in five minutes means **429 for 60 minutes**, even with the right keys afterwards, so Mint never retries a 401: it marks the connection "keys rejected". Rate limits are 1,000 calls a minute, and 6,000 for booking. |
| Test connection | First `GET /ping` (no keys; checks the address and network), then `GET /get_balance` → `{ status: 200, current_balance }`. The balance is "delivered COD, less delivery charges, less our 1% collection charge". |
| Book | `POST /create_order`. **Required:** `invoice` (letters, digits, `-`, `_`; never reused, which is what makes a retry safe; up to 100 characters), `recipient_name` (100), `recipient_phone` (11 digits starting 01), `recipient_address` (490), `cod_amount` (BDT, 0 if prepaid, at most 1,000,000). **Optional:** `note` (480), `alternative_phone`, `recipient_email` (the domain is checked), `item_description` (255), `total_lot` (default 1), `delivery_type` (0 home, the default; 1 point). Returns `{ status: 200, consignment: { consignment_id, invoice, tracking_code, tracking_link, …, status: "in_review" } }`. A rejected field comes back as `{ status: 400, errors: {…} }`. Steadfast **swaps** `{ } ; < > $` for spaces and **cuts** over-long values short instead of refusing them, so Mint trims to the limits itself and shows the result. |
| Bulk | `POST /create_order/bulk-order/extended` with body `{ data: [ …up to 500 orders… ] }`. Answers 200 even when some orders failed. Each entry comes back in the order sent, with `status: "success"` and a `consignment_id`, or `status: "error"` with `error: [sentences]`. (The older `/bulk-order` returns error codes instead.) |
| Status | `GET /status_by_cid/:id`, `/status_by_invoice/:invoice`, `/status_by_trackingcode/:code` → `{ delivery_status }`. `GET /status_with_return_status_by_cid/:id` also shows how far a returning parcel has got. `GET /trackings_by_invoice/:invoice` → `tracking[] { consignment_id, tracking_type, text, created_at }` (the timeline). Answers are cached for 60 seconds, so Mint never polls faster than that. |
| Find by invoice | `status_by_invoice`. A retried booking with the same invoice is refused, so a parcel can't be booked twice (CR13 works). |
| Cancel | No cancel endpoint. `POST /create_return_request { consignment_id \| invoice \| tracking_code, reason }` asks for an undelivered parcel to come back (201; 422 if it's already delivered or already returning). Mint's **Cancel** uses this for Steadfast. |
| Other | `POST /create_pickup_request` (address_id, police_station_id, address, contact_number, note, estim_qty; 201, or 409 when one is already pending) · `GET /payments` and `/payments/:id` (a payout and every parcel it settled, with our `invoice`, for CR11) · `GET /police_stations` · `GET /fraud_check/score/:phone` → `{ delivery_ratio, cancellation_ratio, volume_band, volume_range, delivered_count, cancelled_count, total_reports, fraud_categories }`. Nulls mean "unknown", not 0. The older `/fraud_check/:phone` counts stopped on 27 Sept 2026. Calls are limited to about 4 per parcel booked on the busiest day of the last week, plus 10 (CR-18). |
| Tracking link | `consignment.tracking_link` (`https://steadfast.com.bd/tl/…`), returned when booking. Mint stores it on the delivery. |
| Webhook request | `POST` JSON with headers `Authorization: Bearer <auth token>`, `X-Signature` (HMAC-SHA256 of the raw body, hex, keyed with the auth token), `Idempotency-Key` (the same on retries), and `User-Agent: Steadfast-Webhook/1.0`. **Mint checks `X-Signature`** in constant time over the raw body, and uses `Idempotency-Key` as the dedupe key. |
| Webhook reply | Any 2xx within **5 seconds**. A 5xx or no answer is retried after 30 s and after 2 min (3 attempts in all). A 4xx is not retried. So Mint answers 200 as soon as the event is stored (CR9), and only refuses with 401 for a bad signature. |
| Webhook events | `delivery_status` `{ consignment_id, invoice, cod_amount, status, delivery_charge, tracking_message, updated_at }`. Here `status` is one of pending, delivered, partial_delivered, cancelled or unknown. · `tracking_update` `{ consignment_id, invoice, tracking_message, updated_at }` (goes on the timeline) · `consignment_update` `{ event_id, consignment_id, invoice, tracking_id, changed[], values{} }` (copy address / COD changes onto the delivery) · `cancel_request`, `return_request` (the parcel's keys plus the request) · `payment_request`, `return_list_accepted`, `pickup_request`, `user_update` (logged, nothing else for now). |
| Statuses → CR6 | in_review → booked · pending → in-transit · hold → on-hold · delivered_approval_pending / partial_delivered_approval_pending / cancelled_approval_pending / unknown_approval_pending → shown as "Rider says delivered…" (the delivery stays open; **no COD payment until confirmed**) · delivered → delivered · partial_delivered → partly-delivered · cancelled → returning (the parcel is coming back; `*_return_received` → returned) · exceptional → lost · unknown → keep |

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
  - Steadfast: the owner types an auth token into Steadfast's Webhook page, so Mint generates it (as for Pathao) and checks `X-Signature`, the HMAC of the body.
  - RedX: has none; Mint makes a token and puts it in the URL query.
  - Pathao: the merchant types the secret into its panel, so Mint generates it, shows it and checks `X-PATHAO-Signature`; Mint's reply must also carry Pathao's integration header.

  So the adapter declares `webhook.secret: 'theirs' | 'ours'`, and the Store settings card asks for it or shows it to match.
- **Look up by invoice (CR13) works on Steadfast only.** Pathao's `order.created` webhook carries our order number, so a Pathao booking that timed out is matched when that arrives. On RedX (and Pathao after 10 minutes), the delivery becomes `error` with "Check the <courier> panel before sending again", plus a **Link existing parcel** action where staff type the tracking id in. That action calls `status`, then attaches the parcel to the delivery.
- **RedX areas are flat** (one area id, searchable by district or post code), so CR-10's pickers are city → zone → area for Pathao and one search box for RedX.
- **RedX's `ready-for-delivery` means "received from the merchant"** → `picked-up`, not out-for-delivery. `paid` → settle (CR11).
- **Steadfast `in_review` → `booked`, `pending` → `in-transit`.** The `*_approval_pending` states are only the rider's word: Mint shows them, but takes no COD payment until `delivered` / `partial_delivered` is confirmed.
- **New idea, CR-18:** Steadfast's `fraud_check/score/:phone` as a "Delivery risk" badge on website orders (parcels, delivered, cancelled for the buyer's phone).
- **Tracking links:** Steadfast returns `tracking_link` when booking. RedX and Pathao don't document one, so CR-08 / 09 work them out from their public track pages; until then the order shows the tracking code without a link.
