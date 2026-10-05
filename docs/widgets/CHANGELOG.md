# Site widgets — changelog

Newest last. One entry per work order: what, files, how verified.

## W-01 — Plan & docs (2026-10-05)
- `backend/docs/widgets/README.md` (what, catalogue of 15 widgets, payments,
  commerce mapping, decisions WD1–WD10, where things go), `WORK_ORDERS.md`
  (W-01…W-13, handoff), this file; pointer `admin/docs/WIDGETS.md`.
- Grounded in the code: `routes-public/widget.ts` (today's login widget and
  `MintAuth`), `WebsiteSettings` secrets pattern (`select: false`), the public
  API's owner-only endpoints, and the T-13 finding that customers can write
  any order field. No payment code exists yet.
