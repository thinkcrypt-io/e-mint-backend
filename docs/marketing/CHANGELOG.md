# Store marketing — changelog

## 2026-10-31 — The user's answers

- SMS: BulkSMSBD first; the rest later (MK3, MK-02).
- Consent: each store chooses, soft opt-in by default (MK8, MK-12).
- Purchase event: when placed by default; when paid or when delivered optional (MK23, MK-08).
- Short links under `mintapp.shop/l/…` (MK15); the rating page is Mint-hosted (MK18).
- README §8 now lists the answers instead of the questions.

## 2026-10-31 — MK-01 Plan & docs

- The user picked five features for e-commerce stores' marketing: segments + campaigns, SMS / WhatsApp order
  messages, ad pixels + server-side conversions, product feeds, wishlist + back-in-stock / price-drop alerts.
- Checked what exists first (README §2). Tracking IDs and server-side Meta / GA4 are already in `WebsiteSettings`
  (WO-38 / WO-55), and Website setup opens for stores. The old platform has a BulkSMSBD sender. Messaging's M-07 /
  M-08 / M-10 were still open, and this plan builds their store side.
- Wrote README (decisions MK1–MK34, models, engine, panel, open questions) and WORK_ORDERS (MK-02…MK-21 in four
  phases; phase 2 is independent of phase 1).
- docs/messaging WORK_ORDERS: M-07, M-08 and M-10 point here.
