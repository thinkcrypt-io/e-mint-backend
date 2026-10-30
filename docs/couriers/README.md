# Couriers — overview

**Start here.** This folder is the plan for **courier integrations** in
e-commerce projects (docs/ecommerce): every store can turn couriers on in
**Store settings → Delivery**, connect each with its own API keys, test the
connection, and send orders to a courier from the order pages. Each send makes
a **Delivery** record linked to the order; the courier's **webhooks** (with a
scheduled check as the fallback) keep the delivery — and through it the order —
up to date. Steadfast, Pathao and RedX first; the adapter shape takes more.
Read this file, then `WORK_ORDERS.md`; every step is logged in `CHANGELOG.md`.

This replaces EC-18 / EC20 in docs/ecommerce, which kept the courier as a
section on the order. The order keeps that section, but only as a summary of
its current delivery (CR2).

## 1. The user's words (2026-10-30)

> plan the pathao, steadfast and redx also other courier api integration, they
> should be configured from every ecommerce settings, i mean store settings
> must have courier settings, and if turned on we should be able to connect
> them with api key, test them and from orders, we can send them to courier, it
> will add delivery, also write the webhooks that will automatically update our
> delivery, delivery should be another model connected to order. plan the whole
> thing out and write work orders.

## 2. Decisions

| # | Decision |
|---|---|
| CR1 | **Delivery is its own model** (blueprint key `delivery`, route `deliveries`, code `DLV-000001`), a builder model with core fields locked and engine-owned fields read-only, like Orders (EC4 / EC5). Every e-commerce store gets it; stores built before get it through `upgradeStore` (`scripts/upgradeStores.js`). People may add fields, automations and PDF templates to it (a delivery slip is a PDF template on Deliveries). |
| CR2 | **An order has many deliveries** (`delivery.order` → Order). Normally one; a cancelled or returned parcel that is sent again makes a new one, and split shipments can come later without a schema change. The order's `courier` section stays as an **engine-written summary of its current delivery** (provider, tracking, status, COD, last update) so the Orders and Website orders tables can show and filter it without a join. Current = the newest delivery that isn't cancelled. |
| CR3 | **Courier settings live in Store settings → Delivery.** `CommerceSettings.delivery.couriers` stays the list of couriers turned on (what the wizard already asks). Each turned-on courier has one **`CourierConnection`** per project (tenantScoped, fixed schema, like `SitePaymentSettings`): mode (test / live), credentials **sealed** with `lib/crypto/secret.ts` and `select: false` (the panel only learns whether each key is set), the courier's own options (pickup store, delivery type, default weight…), the webhook secret, and the last test result. One connection per courier per project for now. |
| CR4 | **Test connection** calls a harmless read on the courier with the saved keys — Steadfast: balance; Pathao: issue a token, then list stores; RedX: list pickup stores — and shows what came back in plain words ("Connected — balance ৳1,240", "Connected — 2 pickup stores"). Saving new keys runs the test; a courier can't be chosen on Send to courier until a test has passed with the current keys. |
| CR5 | **One adapter per courier** in `library/functions/commerce/couriers/<id>.ts` behind one interface (§4). The engine never knows a courier's field names or statuses; adapters never touch models. Adding a courier = one adapter file + an entry in the registry. |
| CR6 | **Statuses are normalised** to one list the panel, filters and automations use: `draft` → `booking` → `booked` → `pickup-pending` → `picked-up` → `in-transit` → `out-for-delivery` → `delivered` / `partly-delivered`; side states `on-hold`, `failed-attempt`, `returning`, `returned`, `cancelled`, `lost`, `error` (booking failed). The courier's own status and message are kept beside it (`courierStatus`, `courierMessage`). Each adapter maps its statuses (§5); an unknown one is kept as `courierStatus` and doesn't move the normalised status. |
| CR7 | **What a delivery does to its order** (the engine, never a plain save): booked → the order's courier summary is filled and its fulfilment is left as it was (a parcel waiting for pickup hasn't shipped); `picked-up` → fulfilment `shipped`; `delivered` → fulfilment `delivered` (and the order completes as EC-06's fulfil does); `partly-delivered` → `delivered` with a note and a return waiting (CR10); `returned` → fulfilment `returned`; `cancelled` before pickup → the order goes back to "to ship" and can be sent again. Each change writes record history as "<Courier> (webhook)" or the person who did it. |
| CR8 | **Cash on delivery.** COD = the order's balance due when sent (editable down to 0, never above the balance, whole taka for BD couriers). On `delivered` / `partly-delivered` the engine writes a payment (method `courier-cod`, the amount the courier says it collected, `settled: false`) so the order shows paid; when the courier pays the merchant out (CR11) the payment is marked settled. Payment status of the order follows from the ledger as always (EC9). |
| CR9 | **Webhooks** come to `POST /public/couriers/:provider/:connection` (the connection's id — unguessable, and useless without the secret). Each is checked the courier's way (§6) against the connection's own secret; anything else is a 401 and changes nothing. Events are **idempotent** (dedupe key = provider + consignment + courier status + courier time) and **ordered** (an event older than the delivery's last one is logged but doesn't move the status back, except into a side state like `returning`). The route answers 2xx as soon as the event is stored, then applies it — a slow store never makes the courier retry storms. Every event, applied or not, is kept on the delivery's timeline. |
| CR10 | **Returned parcels.** `returned` / `partly-delivered` don't restock by themselves (the goods come back later, maybe damaged). The order page shows **Receive returned parcel**: pick what came back and its condition; it runs EC-08's return engine (restock to the outlet the parcel left from, no refund for unpaid COD orders). |
| CR11 | **COD payouts** are reconciled from the courier where it tells us (Pathao `order.paid` webhook; Steadfast payments list; RedX — by hand): matching COD payments are marked settled with the payout reference. A "Cash with couriers" figure (COD collected, not yet paid out) shows on the Deliveries page and the dashboard. |
| CR12 | **Fallback sync.** A scheduler tick (like `scheduleContentTick`) refreshes deliveries that aren't finished and haven't heard anything for 2 hours, up to 30 days after booking, claiming each with a lease so two dynos don't both call the courier. The order page refreshes its delivery on open (at most once a minute) and has **Refresh**. A connection that has had no webhook for 2 days while it has open deliveries shows a warning in Store settings ("Check the webhook address in your Steadfast panel"). |
| CR13 | **Booking is safe to retry.** The delivery is made first in `booking` with the merchant invoice = order code (a resend gets `-2`, `-3`); then the courier is called. A clear refusal → `error` with the courier's message (fix and try again on the same delivery). A timeout or network error → the engine looks the parcel up by invoice where the courier can (Steadfast, Pathao, RedX all can) before saying it failed, so a parcel is never booked twice. One open delivery per order at a time (409 "Already with Steadfast — DLV-000012"). |
| CR14 | **Areas.** Steadfast takes a free-text address. Pathao needs city / zone (/ area) ids, RedX a delivery-area id. Their lists are cached per connection for a day. The Send dialog pre-picks by matching the order's area / city, and the store **remembers** each pick (order area text → courier ids) in `CourierAreaMap`, so the next order from "Mirpur 10" is filled in. |
| CR15 | **Who.** Connecting and testing couriers = whoever may edit Store settings (managers, EC-12 Owner / Store manager). Sending, refreshing, cancelling and receiving returns = whoever may update orders. Keys are never shown back, never logged, never sent to the browser or over MCP. |
| CR16 | **Couriers by country** as now (`COURIERS` in `settings.ts`): Steadfast, Pathao, RedX, then Paperfly, eCourier, CarryBee for BD. **Manual courier** (any country): name a courier, type the tracking number and link, update its status by hand — the same Delivery record, so every store can track deliveries even without an API. International aggregators (Shippo / EasyPost) are later. |
| CR17 | **Customers see it.** The website's order tracking (`GET /public/api/store/orders/:id`) and My orders return the current delivery's normalised status, tracking code and the courier's tracking link — never the consignment internals or COD details. Delivery is a builder model, so after-save automations (email / SMS / webhook on `status` changes) work with no extra code; the store installs two off-by-default ones (shipped, delivered). |

## 3. The Delivery model

★ = core field (locked, EC4); ⚙ = engine-owned (read-only, EC5).

| Field | Kind | Notes |
|---|---|---|
| ⚙code | code | `DLV-000001` |
| ★order | reference → Order | |
| ⚙courier | select | `steadfast`, `pathao`, `redx`, `manual`, … (registry) |
| ⚙courierName | text | "Steadfast", or the manual courier's name |
| ⚙status | select | CR6 normalised list |
| ⚙courierStatus, ⚙courierMessage | text | as the courier said it |
| ⚙invoice | text | merchant invoice sent (order code, `-2` on a resend) |
| ⚙consignment | text | courier's id (Steadfast consignment_id, Pathao consignment_id, RedX tracking_id) |
| ⚙trackingCode, ⚙trackingUrl | text / url | what the customer can use |
| ⚙cod | number | cash to collect, as booked |
| ⚙collected | number | what the courier says it collected |
| ⚙charge | number | delivery charge the courier bills |
| ⚙recipient | section | name, phone, address, area, city — a snapshot when sent |
| ★weight | number | kg |
| ★items | number | parcel count / quantity |
| ★note | textarea | instructions to the courier |
| ⚙options | section | courier-specific picks: store id, city / zone / area ids, delivery type, item type |
| ⚙outlet | reference → Outlet | sent from (restock target, CR10) |
| ⚙events | sectionlist | at, status, courierStatus, message, source (webhook / sync / staff), by |
| ⚙bookedAt, ⚙pickedAt, ⚙deliveredAt, ⚙lastEventAt, ⚙lastSyncedAt | date | |
| ⚙payment | reference → OrderPayment | the COD payment (CR8) |
| ⚙settled | boolean | courier paid it out (CR11) |
| ⚙payoutRef | text | |
| ⚙error | text | last booking / sync problem in plain words |

Table: code, order, courier, status, tracking code, COD, collected, booked,
last update. Filters: courier, status, settled, booked date. Sidebar: Store →
**Deliveries** (after Website orders).

Order changes: the `courier` section gains `delivery` (reference to the current
delivery) and `trackingUrl`; all of it stays engine-owned. The order page gets
a Delivery card (current delivery + its timeline) and lists earlier ones.

## 4. The engine

```
library/functions/commerce/couriers/
  index.ts        registry: id → adapter; COURIERS (names, countries, ready) moves here from settings.ts
  types.ts        CourierAdapter, Parcel, Booked, CourierEvent, NormalStatus
  http.ts         one fetch wrapper: timeout 15 s, JSON, plain-words errors, never logs keys
  steadfast.ts    pathao.ts    redx.ts    manual.ts    (later: paperfly.ts, ecourier.ts, carrybee.ts)
library/functions/commerce/
  connections.ts  CourierConnection read / save (sealing), test, webhook address, options (stores, areas) with the day cache
  deliveries.ts   send, applyEvent, refresh, cancel, receiveReturn, settle, the scheduler tick
library/models/tenancy/
  courierConnection.model.ts   courierAreaMap.model.ts   courierEvent.model.ts (raw inbox, 60-day TTL)
```

```ts
interface CourierAdapter {
  id: string; name: string; countries: string[];
  credentials: Field[];            // what Store settings asks for; secret ones are sealed
  settings: Field[];               // pickup store, delivery type, default weight… (choices may come from options())
  test(conn): Promise<{ ok: boolean; message: string; details?: any }>;
  options?(conn, what: 'stores' | 'cities' | 'zones' | 'areas', parent?): Promise<Choice[]>;
  quote?(conn, parcel): Promise<{ charge: number }>;
  book(conn, parcel: Parcel): Promise<Booked>;         // consignment, trackingCode, trackingUrl, courierStatus, charge
  find?(conn, invoice: string): Promise<Booked | null>; // CR13 look-up after a timeout
  status(conn, delivery): Promise<CourierEvent>;
  cancel?(conn, delivery): Promise<void>;
  webhook: { verify(req, conn): boolean; parse(body): CourierEvent[]; reply?(res): void };
  normalise(courierStatus: string): NormalStatus | null;
}
```

API (panel, `/tenant/api/p/:project/commerce/…`):

| Route | Does |
|---|---|
| `GET couriers` | turned-on couriers with connection state (keys set?, mode, last test, webhook address, warnings) |
| `PUT couriers/:id` | save keys / mode / settings (runs the test) |
| `POST couriers/:id/test` | test again |
| `DELETE couriers/:id` | disconnect (refused while it has open deliveries — says how many) |
| `GET couriers/:id/options/:what` | stores, cities, zones, areas (cached) |
| `POST couriers/:id/quote` | delivery charge for a parcel, where the courier offers it |
| `GET orders/:id/send` | the Send dialog's prefill: recipient, COD, weight, remembered area picks |
| `POST orders/:id/deliveries` | send to courier (CR13) |
| `POST deliveries/bulk` | send several orders (Steadfast bulk API, others one by one, 3 at a time) |
| `POST deliveries/:id/refresh` · `/cancel` · `/receive` · `/status` (manual courier) | |
| `GET deliveries` | the Deliveries page list with counts per status and Cash with couriers |

Public: `POST /public/couriers/:provider/:connection` (webhooks, CR9).

## 5. The three couriers

**`CONNECTING.md` is the reference** (checked 2026-10-31): for each courier, where the owner gets the keys, what Mint
stores, every endpoint, the webhook check, the statuses and how sure each fact is. All three are from the couriers' own
(signed-in) pages. CR-04 / CR-08 / CR-09 confirm
it against the live API or the sandbox first. In short:

| | Steadfast | Pathao | RedX |
|---|---|---|---|
| Keys the owner pastes | API key, secret key (a key named "Mint"); Mint's auth token goes into Steadfast's Webhook page | client id, client secret, email, password; store | access token; pickup store |
| Test | `GET /get_balance` | issue token + `GET /stores` | `GET /pickup/stores` |
| Sandbox | none | yes | yes |
| Areas | free text | city → zone → area ids | one flat area id (search by district / post code) |
| Find by invoice (CR13) | yes | `order.created` webhook carries our order no.; else "Link existing parcel" | no → "Link existing parcel" |
| Cancel by API | return request | no | yes (async) |
| Webhook check | `X-Signature` = HMAC-SHA256 of the raw body keyed with the auth token; `Idempotency-Key`; reply 2xx in 5 s | `X-PATHAO-Signature` = the secret Mint shows; reply 202 + Pathao's integration header within 10 s | none — token in the URL query (Mint's own) |
| Statuses → CR6 | in_review → booked; pending → in-transit; hold → on-hold; *_approval_pending → shown, no COD yet; delivered → delivered; partial_delivered → partly-delivered; cancelled → returning; exceptional → lost; unknown → keep | `order.*` events (24, official) — table in CONNECTING.md | pickup-pending → pickup-pending; ready-for-delivery → picked-up; delivery-in-progress → out-for-delivery; delivered → delivered; agent-hold → on-hold; agent-returning → returning; returned → returned; agent-area-change → keep; paid → settle |

Phones: BD numbers are sent as `01XXXXXXXXX` (strip `+88` / `88`, spaces,
dashes; refuse anything that isn't 11 digits starting 01 before calling the
courier). Addresses are trimmed to each courier's limit with the area and city
appended when the address doesn't already name them.

## 6. The panel (mint-tenant)

- **Store settings → Delivery** (and the wizard's Delivery step): shipping rates as now; then a card per courier
  the country offers — a switch; when on: mode (Test / Live, where the courier has a sandbox), the key fields
  (set keys show as "•••• saved — replace"), **Save & test**, the result line, the courier's settings (pickup store,
  delivery type, default weight — choices loaded from the courier), and **Webhook**: the address and secret to
  copy, the steps for that courier's panel, last event received. Plus **Manual courier** (names of couriers you use
  without an API). Doc links (#anchors) on every card and dialog.
- **Send to courier** on the order page and the website order view: choose the courier (only tested ones), recipient
  / phone / address prefilled from the order, area pickers where the courier needs them (pre-picked, CR14), COD
  (balance due, editable down), weight, items, note, delivery charge quote where offered → **Send**. Errors in the
  courier's words plus what to fix.
- **Delivery card** on the order: courier, status badge, tracking code (copy) + link, COD / collected, charge, the
  timeline of events, Refresh, Cancel (where the courier allows, before pickup), Print label (80 mm / A6, barcode of
  the tracking code, recipient, COD, order no.), Receive returned parcel (CR10), Send again (after cancelled /
  returned). Earlier deliveries listed under it.
- **Bulk send** from the Orders and Website orders tables (select → Send to courier → one courier, per-order
  results, failures stay selected to fix).
- **Deliveries page** (Store → Deliveries): the builder table with status quick views (Booking problems, Waiting
  pickup, On the way, Delivered, Returning, Returned, Cancelled), Cash with couriers, filters by courier / settled.

## 7. Out of scope for now

International aggregators (Shippo, EasyPost, Shiprocket), courier pickup
scheduling beyond what booking does, split shipments in the panel (the model
allows it), return requests booked through the courier's API, more than one
account per courier per project, couriers for non-store projects (a website
project's checkout gets them through EC-16).
