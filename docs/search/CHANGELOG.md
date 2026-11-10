# Store search — changelog

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
