# Buyer check — plan (CR-19 … CR-26)

**What it is.** When an order comes in, Mint checks the buyer's phone number with the couriers and with the
store's own history, and shows how often that number takes its parcels: a success rate and a badge (Safe / Check
first / Risky / New buyer) on the order. Staff can also type any number and look it up. Builds on CR-18 (the
on-demand Steadfast check in Send to courier). Work orders are in `WORK_ORDERS.md` (CR-19…CR-26); each step is
logged in `CHANGELOG.md`.

## 1. The user's words (2026-11-13)

> Check the buyer first: look up the phone number's delivery success rate with Steadfast, Pathao or RedX, and show
> a risk badge on the order. apply this, when ordered the number should show the success rates, also admins can
> look up using a number. plan first and show me

## 2. What's there today (CR-18)

- `steadfast.risk` calls `GET /fraud_check/score/:phone` (official, CONNECTING.md § Steadfast) and returns
  `deliveryRatio`, `cancellationRatio`, `delivered`, `cancelled`, `reports`, `volume` and `categories`.
- `deliveryRisk` (`GET orders/:id/risk?fresh=1`) checks it only when someone presses **Check the buyer** in Send to
  courier. The answer is kept a day per phone in the Steadfast connection's `cache`, with a level: low ≥ 80 %,
  medium ≥ 50 %, else high, and unknown under 3 known parcels.
- What's missing: nothing runs when the order comes in, nothing is saved on the order, there's no badge in the
  tables, there's no way to check a number without an order, and Steadfast is the only source.

## 3. Where the numbers come from

| Source | How | Status |
|---|---|---|
| **Steadfast** | `GET /fraud_check/score/:phone` with the store's own key. Covers the whole Steadfast network. | Official, built (CR-18). Limited to about 4 checks per parcel booked on the busiest day of the last week, plus 10. |
| **Pathao** | Not in Pathao's developer API. The merchant panel's own call: sign in with `POST merchant.pathao.com/api/v1/login` { username, password }, then `POST merchant.pathao.com/api/v1/user/success` { phone }. The answer is `data.customer { successful_delivery, total_delivery }`, or only `customer_rating` (good_customer … fraud_customer) when `show_count` is false for that account. | Panel sign-in (§3a). |
| **RedX** | Not in RedX's developer API (openapi.redx.com.bd). The merchant website's own call: sign in with `POST api.redx.com.bd/v4/auth/login` { phone: 88…, password } → `data.accessToken`, then `GET redx.com.bd/api/redx_se/admin/parcel/customer-success-return-rate?phoneNumber=88…`. The answer is `data { totalParcels, deliveredParcels, returnPercentage, customerSegment }`. | Panel sign-in (§3a). Some RedX accounts now ask for an OTP at sign-in, and those can't be checked. One project reported the call offline (400/503) for a while. |
| **Paperfly** | The merchant app's own calls: `go-app.paperfly.com.bd/merchant/api/react/authentication/login_using_password.php`, then `…/smart-check/smart-check-v2.php`. | Built CR-26 (2026-11-13, against a stub). No booking adapter yet (CR-16), so a store adds its login for checks only. Partly delivered counts as taken. |
| **CarryBee** | The merchant site's NextAuth sign-in: `merchant.carrybee.com/api/auth/csrf` → `/api/auth/callback/login` { phone +88…, password } → `/api/auth/session` (Bearer token + business id), then its customer lookup on `api-merchant.carrybee.com`. | Built CR-26 (2026-11-13, against a stub). Checks only, like Paperfly. The kept token holds the access token and the business id; 404 = never sent with CarryBee (0 parcels); `fraud_count` counts as fraud reports. |
| **The store's own history** | Its orders and deliveries for that phone: delivered, returned, refused or cancelled, any courier including manual. | Always there, needs no courier account. |
| **Mint network** (all Mint stores) | The same counts across every store on Mint, numbers only. Covers every courier's parcels, RedX and Sundarban included. | **Skipped** — the user said no, 2026-11-14 (CR-24). |

Paid aggregator APIs (fraudbd.com and others) scrape merchant panels the same way. They're left out because they'd
send the store's customers' numbers to a third party. Mint does the same calls itself, with each store's own login.

### 3a. Panel sign-in — how Mint does RedX, Pathao, Paperfly and CarryBee

Built for RedX and Pathao in CR-20 (2026-11-13, against a stub; not yet tried on a real account). Read in
community code (2026-11-13), not courier docs:
[refatbd/bd-courier-fraud-checker](https://github.com/refatbd/bd-courier-fraud-checker) (updated 2026-10-28, all
five couriers), [AbiruzzamanMolla/Fraud-Checker-BD-Courier-Laravel](https://github.com/AbiruzzamanMolla/Fraud-Checker-BD-Courier-Laravel)
and [huzaifaalmesbah/bd-courier-customer-delivery-stats](https://github.com/huzaifaalmesbah/bd-courier-customer-delivery-stats).
Every one of them works the same way: it signs in to the courier's **merchant website** with the merchant's phone or
email and password, then calls the private endpoint the website's own Fraud Check page uses.

- **The store's own login.** Store settings → Delivery → each courier card gets **Buyer checks**, with its own
  sign-in (phone or email + password, sealed like Pathao's password today). It's separate from the API keys,
  because the developer keys don't open these endpoints. A store can connect Paperfly or CarryBee for checks only.
- **Token kept, never a sign-in per check.** The token is sealed on the connection and reused until it's refused.
  Only then is it renewed once. A refused password stops checks for that courier and shows "Sign in again" (the
  CR-03 lockout rule).
- **Unofficial, and labelled so.** The card says "Uses your <courier> merchant login, not its API. It may stop
  working if <courier> changes its site." Each source fails on its own: a dead or slow source drops off the answer
  and never blocks an order or the other sources. There's a 6 s timeout per source, and they all run at once.
- **OTP accounts.** If RedX (or any courier) asks for a code at sign-in, the card says "<courier> asks for a code at
  sign-in, so Mint can't check with it." The rest keep working. Mint never asks for or relays OTPs.
- **Health.** Each source records its last success and last error, and the card shows "Last checked fine 2 h ago".
  A smoke test against a stub covers each answer shape (counts, rating only, offline, refused).
- **Gentle use.** Checks only, never more than one per phone per day per store (BC3), and a per-courier daily cap
  (default 300) so a store can't hammer a courier's site.

## 4. Decisions (proposed — the questions in §7 settle the open ones)

| # | Decision |
|---|---|
| BC1 | **One answer from all sources.** Each source gives `{ delivered, refused, total, ratio, reports? }`. The combined rate is delivered ÷ (delivered + refused) over every source, each shown on its own row too. Level: **Safe** ≥ 80 %, **Check first** 50–79 %, **Risky** < 50 %, **New buyer** under 3 known parcels. The thresholds are a store setting with those defaults. Any fraud report on Steadfast shows as a warning, whatever the rate. |
| BC2 | **Panel sign-in sources (§3a) are opt-in per courier**, using the store's own merchant login. Each one is verified on a real account before it's switched on for everyone. Where one breaks, it drops out and the others carry on. |
| BC3 | **Kept a day per phone, per store** in a new `PhoneCheck` model (tenantScoped, unique project + phone). It replaces the connection cache, so the order check, the lookup and Send to courier share one answer and one quota. **Check again** forces a fresh one. |
| BC4 | **Checked when the order comes in, never in its way.** Website orders (`POST /public/api/store/orders`) and manual or phone orders in the panel queue a check after they're saved. Checkout never waits for a courier and never fails because of one. Walk-in POS sales aren't checked (paid at the till). Built in CR-21; Store settings → Delivery can turn it off. |
| BC5 | **Saved on the order** as `buyerCheck { level, rate, parcels, sources[], reports, checkedAt }`, read-only and engine-owned like the courier summary. It's a field on the Order model, so it can be filtered, shown as a column, and used in automations. Built in CR-21: a later check of the number renews it on the phone's open orders. |
| BC6 | **Quota guard.** Before a Steadfast call, Mint checks today's count against the limit. When it's near, it skips the automatic checks and keeps the rest for people pressing Check, then says so on the card ("Steadfast's checks for today are used up — the store's own history is shown"). |
| BC7 | **The phone is the key**, normalised to `01XXXXXXXXX` (`bdPhone`). Numbers outside Bangladesh get only the store's own history. |
| BC8 | **Who can see it:** anyone who can view orders (records:view). A lookup needs the same right and is logged (who, which number, when) so lookups can't be used to snoop. |

## 5. What people see (mint-tenant)

- **Orders / Website orders tables:** a **Buyer** column with the badge and rate ("Safe · 92 %", "Risky · 31 %",
  "New buyer"), and a filter by level.
- **Order page:** a **Buyer check** card. It shows the badge, the combined rate, a row per source (Steadfast · 41
  parcels · 95 % delivered; My store · 3 orders · 2 delivered, 1 refused), fraud reports if any, when it was
  checked, **Check again**, and a plain next step for a risky buyer ("Call first, or ask for the delivery charge in
  advance").
- **Look up a number:** `Store → Deliveries → Check a buyer` (`/store/buyer-check`). Type a phone and get the same
  card, plus that number's orders in this store. Recent lookups are listed below it.
- **Send to courier** uses the same card instead of today's check.
- **MCP:** `check_buyer { phone }`, so the store owner's own AI can ask too.

## 6. Out of scope for now

- Acting on the level automatically (hold the order, ask for an advance, send a confirm-by-SMS link). That's the next
  plan, "COD protection". The `buyerCheck` field and automations conditions make it possible.
- Showing the level to the buyer on the website.
- Paid aggregators (§3); eCourier (no lookup found in any project).

## 7. Questions for the user

1. ~~Mint network across stores~~ — **answered 2026-11-14: "No, skip it".** A store sees only its couriers and its
   own orders; no history is shared between Mint stores (CR-24 skipped).
2. ~~Panel sign-in (RedX, Pathao, Paperfly, CarryBee)~~ — **answered 2026-11-13: "Yes, use logins".** Each store's
   own merchant login, as in §3a; each source is verified on a real panel before it's switched on (BC2).
3. **Automatic checks:** website and phone orders only, not walk-in POS sales? Built that way (BC4) unless the user
   says otherwise.
