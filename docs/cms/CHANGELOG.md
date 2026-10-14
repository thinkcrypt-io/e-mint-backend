# MINT CMS — changelog

Newest last. One entry per work order: date, WO, what changed, files, how it was verified.

---

## 2026-10-15 — CMS-01 Plan & docs
- The user: "for the website cms, currently we have a content model which works, but i think it can be refactored
  and made better. plan and recommend to make it state of the art so that we can cross strapi type cms".
- Read the current content (websiteKit.function.ts, siteBuilder/kit.ts + connect.ts, site-builder D27/D28) and
  compared with Strapi 5. Wrote `README.md` (today, gaps, the comparison, decisions D1–D12 + D-AI, entry shape,
  migration, later, risks) and `WORK_ORDERS.md` (CMS-02…15). Proposed — waiting for the user's decisions.
- The user's decisions (same day): contents stay one record per item, with a Pages dropdown showing one page's
  contents, the type chosen first (hero / FAQ / cards…) so only its fields show, and a List type (a model, how many,
  order, conditions); drafts until Publish; languages chosen in Settings, other-language fields only when there's
  more than one; engine first. README D1, D8, §5, §6 and CMS-06, CMS-12 rewritten to match.

