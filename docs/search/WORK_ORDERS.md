# Store search — work orders

Plan: `README.md`. Log: `CHANGELOG.md`. Sizes: S (an afternoon), M (a day),
L (2–3 days).

**Where work lands and goes:**
- **Commits:** commit and push each WO when it's done, then go on. The backend goes to `mint` v3; mint-tenant, mint-docs and mint-webpage go to `origin` main; hint-site goes to `commerce` main; live-fresh-frontend goes to main.
- **Docs and website:** each WO updates the `/store/search` guide in mint-docs (#anchors on every card and dialog) and the marketing website as it lands.
- **Tests:** unit tests go in `library/functions/commerce/search/__tests__` (normaliser, Banglish, understand, rank: pure functions, plenty of cases). Smoke tests go in `scripts/tenancy-smoke/search-*.mjs` and `run-all.sh`.
- **Test data:** a seeded store, using the HINT catalogue file (`hint-site/data/products.json`, 260 products, 13 categories) as fixtures, plus `search-bench.mjs` for 20k generated products.

**Order.** Phase 1 is the engine and must come first. Phase 2 (storefronts)
can start as soon as SI-05 lands. Phases 3 and 4 depend only on phase 1 and
can run in parallel. Phase 5 needs phase 4's data. Phase 6 is optional or
needs the user's answers (README §8).

## Status

| WO | Title | Repo | Size | Status |
|---|---|---|---|---|
| SI-01 | Plan & docs | backend | S | done 2026-11-10 |
| **Phase 1 — The engine** | | | | |
| SI-02 | Normaliser + Banglish key (SI6, SI7): `normalise.ts`, `banglish.ts`, starter word list, unit tests (≥ 150 cases: plurals, units, t-shirt, Bangla variants, digits, Banglish ↔ Bangla) | backend | M | open |
| SI-03 | Search document + indexer (SI4, SI5): `SearchDoc` / `SearchQueue` models + indexes, `document.ts`, hooks on product / variant / category / brand / collection / discount / stock, leased tick, `rebuildSearch`, `scripts/searchRebuild.js`, nightly drift check; Product `keywords`; `upgradeStore` | backend | L | open |
| SI-04 | Native driver + ranking (SI3, SI9, SI10, SI14 static part, SI19): candidates rarest-first with cap, typo matching on grams, scoring, coverage, phrase bonus, in-stock / popularity / freshness / sale multipliers, `explain`, per-dyno LRU with the version key; `search-bench.mjs` budgets | backend | L | open |
| SI-05 | Public search API (SI15, SI11, SI19): `GET /store/search` (with facets and category pages), `/suggest`, `/popular`, rate limits, `CommerceSettings.search`, `search=` on products routed to the engine; Website setup section with examples | backend | M | open |
| **Phase 2 — Storefronts** | | | | |
| SI-06 | Store settings → Search (on / off, typos, out of stock, Banglish, dials, facets, suggestions, Rebuild + counts) | mint-tenant | S | open |
| SI-07 | mint.js Search widget (SI24): header icon, overlay with suggestions, results page with filters and chips, keyboard + screen-reader friendly, the store's look; site-builder "Search results" block + "Search box" element | backend + mint-builder | L | open |
| SI-08 | Reference storefronts: HINT `SearchView` + header overlay on `/store/search` + `/suggest` (typo chips, "Showing results for", filters); category pages on `/store/search?category=`; the same for Live Fresh; Next.js snippet in mint-docs | hint-site + live-fresh-frontend + mint-docs | M | open |
| **Phase 3 — Understanding** | | | | |
| SI-09 | Query understanding (SI8): codes → straight to product, price phrases (EN + BN), option values from the store's own, brand / category detection, sort words, stop words, `understood` in the answer | backend | M | open |
| SI-10 | Synonyms + redirects (SI13): builder models, expansion in the plan, starter packs (EN fashion, electronics, grocery, BN / Banglish), panel tables with Test; `upgradeStore` | backend + mint-tenant | M | open |
| SI-11 | No dead ends (SI12): loosen in steps, "Showing results for", did-you-mean from the store vocabulary, fallbacks; widget + HINT show it | backend + hint-site | S | open |
| **Phase 4 — Insights** | | | | |
| SI-12 | Events + attribution (SI17, SI18): `SearchEvent`, query cleaning (email / phone / card), `POST /store/search/events` (beacon batches), search id in mint.js + cart lines + `POST /store/orders` `search`, order attribution, `sold30` bump | backend + hint-site | M | open |
| SI-13 | Nightly rollups (SI17): `SearchQueryDaily`, signals into SearchDoc (sold30, views30, wishes), Product ⚙searchClicks30 / sold30 | backend | S | open |
| SI-14 | Insights page (§6): totals, chart, Top / No results / Low click rate / Trending tables with one-tap fixes, query drill-down, dashboard widget, Product page Search card | mint-tenant | L | open |
| **Phase 5 — Merchandising and learning** | | | | |
| SI-15 | Rules (SI13): Search rule model, hide / filter / pin / boost / bury, query and category-page triggers, schedules, sentence editor with live before / after preview | backend + mint-tenant | M | open |
| SI-16 | Learning (SI16): `SearchPair` decayed counts with position correction, learned boost with thresholds, reformulation → synonym suggestions, `SearchSuggestion` + Accept / Dismiss on Insights, learning switch | backend + mint-tenant | M | open |
| SI-17 | Try search (SI10): the panel page with explain per result, understood chips, rules fired, timing | mint-tenant | S | open |
| SI-18 | MCP tools (SI22): `search_insights`, `try_search` (with explain), `save_search_suggestion` (synonym / redirect / rule drafts), `enrich_products` (keywords, a dry run first), "Fix with your AI" prompt dialog | backend + mint-tenant | M | open |
| **Phase 6 — Scale and extras (optional / after answers)** | | | | |
| SI-19 | Finish: guide, Website setup, marketing website, rollout (`upgradeStores.js` dry run then `--apply` on prod, `searchRebuild.js --apply`; the user deploys the backend and approves the prod runs) | all | S | open |
| SI-20 | Content search hooks: SearchDoc `kind`, optional pages / blog posts in suggestions (out of scope now, README §7) | backend | M | later |
| SI-21 | The POS and panel product pickers use the engine (typos, SKU straight hits) | backend + mint-tenant | S | later |
| SI-22 | Atlas driver (SI3): one `$search` index over SearchDoc (fuzzy, autocomplete, facets), parity tests against the native driver on the fixtures, a platform switch | backend | M | after README §8 Q1 |
| SI-23 | Meaning-based re-ranking (SI23): local embedding model, top-50 re-rank + zero-result recovery, CPU budget check on a dyno | backend | L | after README §8 Q2 |

## Handoff

Nothing built yet. The open questions are in README §8, and none of them blocks
phase 1. Start with SI-02 (pure functions, no database), then SI-03.

---

## SI-02 — Normaliser + Banglish key (M)

- `normalise(text, { stem })` → `{ words, stems, phon }`. `normaliseQuery` also keeps the raw words for code matching.
- Rules exactly as in SI6. The English stemmer is a small, rule-based S-stemmer plus -ing / -ed with exceptions such as dress, glass, jeans, shoes → shoe. **Not** Porter: it is too aggressive for product names.
- `banglish.ts`:
  - `phonKey(word)`: a Bangla script word goes to a simplified Latin key; a Latin word goes to the same kind of key (sh / s / x merge, ee / i, oo / u, w / o, v / bh, double letters collapse, trailing a / o dropped).
  - The starter list (`packs/banglish-words.json`) overrides the rules for known words.
- **Done when** the unit tests pass, including the hand list:
  - shari = sari = saree = শাড়ি
  - panjabi = punjabi = পাঞ্জাবি
  - jutta = juta = জুতা
  - "t-shirt" = "tshirt" = "t shirt"
  - "৫০০ মিলি" → "500ml"

## SI-03 — Search document + indexer (L)

- `SearchDoc` with the SI19 indexes and a unique index on `{ project, product }`. `SearchQueue` has a unique index on `{ project, product }`.
- `document.ts buildDocs(store, productIds)` loads in bulk: products, their variants (codes, option values, stock), the category tree (names up the parents, cached per store), brands, collections and the current discount. It writes with `bulkWrite` upserts and removes archived or deleted products.
- **Hooks:** a `touch()` after each relevant save (see README §5). A category or brand rename touches its products in batches of 500.
- **Tick:** a leased tick like CR-11, every 5 s, taking up to 500 queue rows per store per pass. After writing, `CommerceSettings.search.version++`.
- **Rebuild** works in pages of 500, with a progress record. The panel shows it later in SI-06.
- **Done when:**
  - the smoke test `search-index.mjs` covers: seed the HINT fixtures; edit a name, a variant SKU, a category name, a stock move and a discount; each shows up in SearchDoc within 10 s;
  - archive removes the product, and rebuild gives identical documents.

## SI-04 — Native driver + ranking (L)

- Candidates:
  - For each query word (after synonyms), the term set is the word itself, its stem, its phon key, and its trigram neighbours (from the store's vocabulary, cached per version).
  - Take the rarest word first, `find({ project, status, …facets, $or: [{ 'f.words': {$in} }, { 'f.prefixes': last }, …] })`, projecting only the fields needed and capped at 2,000.
- Ranking in Node, exactly as SI10. `explain` builds the breadcrumb string.
- Facet counts come from one `$facet` aggregation over the filtered candidate ids (≤ 2,000), or from the store-wide filtered set for category pages, which has no words.
- LRU: 500 entries per dyno, 30 s, keyed by `project:version:hash(plan)`.
- **Done when:**
  - a fixture relevance suite passes, with ≥ 60 queries each listing an expected top-3. Examples:
    - "sneker" → sneakers
    - "shirt oxford" → Oxford Shirt
    - "gold ring" → rings first, then ear-rings
    - "শাড়ি" → Jamdani Saree
  - `search-bench.mjs` (20k products) holds p95 under 250 ms for search and under 80 ms for suggest, on a local Mongo and on the prod-tier cluster.

## SI-05 — Public search API (M)

- The routes as listed in README §5, with the rate limits, `Cache-Control: max-age=30`, and validation that answers in plain words.
- `CommerceSettings.search` defaults, `upgradeStore` adds them, and rebuild is queued.
- `publicRecords` products `search=` is routed to the engine when it's on and no `sort` is given. The answer shape is unchanged: `doc`, `total`, `page`.
- Website setup: a Search section with fetch examples (JS, Next.js server component) and the response shape.
- **Done when** `search-api.mjs` covers paging, every filter, facets that ignore their own group, a category page, suggest, popular with the 3-visitor floor, rate limits, and `explain` refused without a server key.

## SI-06 … SI-23

See the status table. Each gets its own section here when it starts (same
shape: what, how, done when).
