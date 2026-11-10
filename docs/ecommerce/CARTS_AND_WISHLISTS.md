# Abandoned carts + wishlists — plan (draft, waiting on the user)

**Status:** plan only, nothing built. Written 2026-10-31 for the user to review.

## 1. The user's words (2026-10-31)

> for live fresh, also on the tenant panel, we need the abandoned cart feature. also wishlist. tenant panel admins
> must be able to see the abandoned cart and wishlist.

## 2. Where it lives

Built into the **E-commerce type** (like website orders, EC-23/24), not as builder models on Verte alone:

- every store gets it, Verte first; Live Fresh is the first storefront that uses it;
- the cart is priced by the store's own engine (`pricing.ts`), so carts and orders show the same numbers;
- a cart turns into an order through `createWebsite`, so "recovered" is known for sure, not guessed.

Built stores get it through `upgradeStore` + `scripts/upgradeStores.js` (dry run, then `--apply` with the user's
go-ahead), as every blueprint change does.

> Note: the older shop widgets (W-05) already keep signed-in carts in `SiteCart`. That's the site-widget shop, not
> the commerce store; this plan doesn't use or change it.

## 3. Decisions (proposed)

| # | Decision |
|---|---|
| CW1 | **One cart record per shopper.** The storefront keeps a random cart id in the browser and sends the cart to the store when it changes (debounced). A signed-in customer's cart is tied to them; a guest cart is tied to the cart id until sign-in, then joined to the customer. The browser sends ids and quantities only — the store prices it (EC6). |
| CW2 | **Contact is caught at checkout.** When a shopper types their phone or email on checkout step 1 (before placing the order), it's saved on the cart. Signed-in carts take the customer's. A cart with no contact still counts but shows as "Guest — no contact". |
| CW3 | **Abandoned = no change for a set time** (Store settings, default **60 minutes**), with items in it, not turned into an order. A sweep every 5 minutes marks them (same pattern as `courierSync`). |
| CW4 | **Statuses:** Active → Abandoned → Recovered (an order came from it after it was abandoned) · Ordered (an order came before it was abandoned) · Expired (kept for N days, default 30, then dropped from the list). The order is linked on the cart, and the cart on the order. |
| CW5 | **Recovery from the panel:** each abandoned cart has a **recovery link** (`/cart?restore=<token>` on the store's site) that refills the cart in any browser; buttons to copy it, call, WhatsApp, or email it. An automatic reminder email after X hours is an option in Store settings (off by default), sent through the org's own SMTP with the project's email design (M-03a). No SMS (no SMS provider in Mint). |
| CW6 | **Wishlist = signed-in customers.** A guest can tap the heart; it's kept in the browser and joined to their account when they sign in. Only signed-in wishlists reach the panel. One row per customer × product (× variant when picked). |
| CW7 | **Engine-owned:** carts and wishlist rows are written only by the store's public endpoints (and the sweep). In the panel they're read-only (staff can delete / archive). |

## 4. New models (blueprint)

| Model | Route | Fields (⚙ = engine-owned) |
|---|---|---|
| Carts | `carts` | ⚙cart id, ⚙customer, ⚙name, ⚙phone, ⚙email, ⚙lines (variant, product, name, sku, qty, unit price, total), ⚙items count, ⚙subtotal, ⚙status (active / abandoned / recovered / ordered / expired), ⚙last activity, ⚙abandoned at, ⚙order, ⚙reminders sent, ⚙last reminder at, ⚙recovery token, ⚙source (landing page, UTM, device) |
| Wishlist items | `wishlist` | ⚙customer, ⚙product, ⚙variant, ⚙price when added, ⚙added at |

Orders gets ⚙cart (link back). Customers page gets tabs **Carts** and **Wishlist**; Products page gets **Wished by**.

## 5. Store API (public, `/public/api/store/…`, project key)

| Call | Does |
|---|---|
| `PUT /store/cart` | `{ cartId, lines: [{ product \| variant, quantity }], contact?: { name, phone, email }, source? }` → the cart, priced; signed-in customer taken from the token |
| `POST /store/cart/restore` | `{ token }` → the lines, to refill the browser cart |
| `GET /store/my/wishlist` | the signed-in customer's wishlist (with current price and stock) |
| `POST /store/my/wishlist` | `{ product, variant? }` add · `DELETE /store/my/wishlist/:id` remove |
| `POST /store/my/wishlist/merge` | `{ items }` a guest's hearts on sign-in |
| `POST /store/orders` | gains `cartId` → marks the cart Ordered / Recovered and links it |

Rate-limited like the order endpoints. Docs for both in the public API reference (4 doc places, WO-40 note).

## 6. The panel (mint-tenant)

**Abandoned carts** — `/store/abandoned-carts`, sidebar under E-commerce (after Website orders):

- Numbers on top: abandoned (period), their value, recovered count + revenue, recovery rate.
- Table: when abandoned, customer / contact, items, value, status, reminders sent, last activity. Quick filters: Today,
  Last 7 days, Has contact, Recovered, Not contacted. Row actions: Copy recovery link, Call, WhatsApp, Send reminder.
- Cart view (drawer): lines with images and current stock, totals, contact, timeline (created, changed, abandoned,
  reminder sent, recovered → order link), source.

**Wishlists** — `/store/wishlists`:

- **By product** (default): product, how many customers wished it, price, stock now. Click → who wished it.
- **By customer**: customer, items, total value, last added. Click → their list.
- Customer page tab **Wishlist**, product page **Wished by N**.

**Store settings → Carts & wishlist:** turn each on/off, abandoned after (minutes), keep carts (days), reminder email
on/off + delay + email design.

**Dashboard (EC-27):** two widgets added to new stores — Abandoned carts (value, recovery rate) and Most wished
products. Built stores keep their own dashboard; the widgets can be added by hand.

Each new screen gets a guide in mint-docs + `#anchor` links on each panel/dialog.

## 7. Live Fresh storefront

- Cart: create the cart id, send the cart to the store on change (debounced ~2 s) and on sign-in; send `cartId` with
  the order; empty it after.
- Checkout step 1: save name / phone / email on the cart when typed (on blur).
- `/cart?restore=…`: refill the cart and open it.
- Wishlist: heart on product cards and the product page, header heart with count, `/account/wishlist` (move to cart,
  remove); guest hearts kept in the browser and merged on sign-in, with a "Sign in to keep your wishlist" nudge.
- Behind `NEXT_PUBLIC_STORE_CARTS=1` until the backend is deployed (as EC-25 did).

## 8. Work orders

| WO | What | Where | Size |
|---|---|---|---|
| EC-28 | Carts model + engine (save, price, contact, sweep, statuses, order link, restore token) + public cart endpoints; smoke | backend | L |
| EC-29 | Abandoned carts page + cart view + Store settings section + Customers tab | mint-tenant + backend | L |
| EC-30 | Recovery: link, WhatsApp/call, manual + automatic reminder email | backend + mint-tenant | M |
| EC-31 | Wishlist model + public endpoints + merge; smoke | backend | M |
| EC-32 | Wishlists page (by product / by customer), customer + product tabs, dashboard widgets | mint-tenant + backend | M |
| EC-33 | Live Fresh: cart sync, checkout contact, restore link, hearts, /account/wishlist | live-fresh-frontend | M |
| EC-34 | Guides (mint-docs), marketing site, `upgradeStores.js` for Verte on prod (the user's go-ahead) | mint-docs + mint-webpage + prod | S |

Each WO is committed and pushed when done. The backend deploy to Heroku and the prod `--apply` are the user's.

## 9. Questions for the user

1. **Mint-wide** (every store, as above) or **Verte only** (builder models + storefront code, no Mint changes)?
2. Save the phone / email typed at checkout **before** the order is placed (needed to reach most abandoned carts)?
3. Abandoned after **60 minutes**? Automatic reminder email in the first release, or manual only?
4. Wishlist for guests: **browser + merge on sign-in** — *answered 2026-11-10: yes, as above*; EC-31 built (see CHANGELOG), with product **Views** added.
5. Later, not in this plan unless asked: back-in-stock / price-drop emails from wishlists, discount coupon in the
   reminder email.
