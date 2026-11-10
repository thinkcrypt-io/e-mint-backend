# Store search — changelog

## 2026-11-10 — The user's answers

- Atlas tier: Flex / shared. The native driver is production, and the Atlas driver (SI-22) is parked (SI3).
- Search by meaning: a small multilingual model on our own servers (SI23, new WO SI-19). Web dynos need 1 GB.
- Banglish is in the first release (SI7).
- Out of stock: each store chooses show or hide; show is the default, after the in-stock products (SI14).
- Existing stores: we switch them on after a rebuild and a check (SI-20).
- Retention: raw events 90 days, daily totals 13 months.
- Content search moved to SI-23 (later). README §8 now lists the answers.

## 2026-11-10 — SI-01 Plan & docs

- **The ask:** the user asked for a full, advanced plan for search intelligence in every e-commerce store on Mint.
- **What exists, checked first** (README §2):
  - Stores only have the generic `search=`: one escaped `$regex` over text fields, with no ranking, typos, plurals, category or brand names, or analytics, and a full scan.
  - Views, wishes and purchases already exist as signals. WO-56 gives a visitor id to tie searches to journeys.
- **README:**
  - Decisions SI1–SI25. The main ones:
    - its own store-only engine;
    - one platform `SearchDoc` collection, so no collections per store;
    - drivers: native Mongo first, Atlas Search later;
    - Bangla and Banglish;
    - query understanding (price, options, brand / category, codes);
    - no dead ends;
    - rules, synonyms and redirects;
    - dial-based business signals;
    - learning with thresholds;
    - cleaned search logs and search revenue attribution;
    - AI only through the owner's MCP.
  - Also: the models, the engine layout, the routes, the panel, what's out of scope and six questions.
- **WORK_ORDERS:** SI-02…SI-23 in six phases. Phase 1 (the engine) comes first. Phases 3 and 4 can run in parallel.
