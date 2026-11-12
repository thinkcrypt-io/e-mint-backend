# Store search — work orders

Plan: `README.md`. Log: `CHANGELOG.md`. Sizes: S (an afternoon), M (a day),
L (2–3 days).

**Where work lands and goes:**
- **Commits:** commit and push each WO when it's done, then go on. The backend goes to `mint` v3; mint-tenant, mint-docs and mint-webpage go to `origin` main; hint-site goes to `commerce` main; live-fresh-frontend goes to main.
- **Docs and website:** each WO updates the `/store/search` guide in mint-docs (#anchors on every card and dialog) and the marketing website as it lands.
- **Tests:** unit tests go in `library/functions/commerce/search/test/` (the repo's convention) (normaliser, Banglish, understand, rank: pure functions, plenty of cases). Smoke tests go in `scripts/tenancy-smoke/search-*.mjs` and `run-all.sh`.
- **Test data:** a seeded store, using the HINT catalogue file (`hint-site/data/products.json`, 260 products, 13 categories) as fixtures, plus `search-bench.mjs` for 20k generated products.

**Order.** Phase 1 is the engine and must come first. Phase 2 (storefronts)
can start as soon as SI-05 lands. Phases 3 and 4 depend only on phase 1 and
can run in parallel. Phase 5 needs phase 4's data. Search by meaning (SI-19) needs only phase 1.
The user answered README §8 on 2026-11-10.

## Status

| WO | Title | Repo | Size | Status |
|---|---|---|---|---|
| SI-01 | Plan & docs | backend | S | done 2026-11-10 |
| **Phase 1 — The engine** | | | | |
| SI-02 | Normaliser + Banglish key (SI6, SI7): `normalise.ts`, `banglish.ts`, starter word list, unit tests (≥ 150 cases: plurals, units, t-shirt, Bangla variants, digits, Banglish ↔ Bangla) | backend | M | done 2026-11-10 |
| SI-03 | Search document + indexer (SI4, SI5): `SearchDoc` / `SearchQueue` models + indexes, `document.ts`, hooks on product / variant / category / brand / collection / discount / stock, leased tick, `rebuildSearch`, `scripts/searchRebuild.js`, nightly drift check; Product `keywords`; `upgradeStore` | backend | L | done 2026-11-11 |
| SI-04 | Native driver + ranking (SI3, SI9, SI10, SI14 static part, SI19): candidates rarest-first with cap, typo matching on grams, scoring, coverage, phrase bonus, in-stock / popularity / freshness / sale multipliers, `explain`, per-dyno LRU with the version key; `search-bench.mjs` budgets | backend | L | done 2026-11-11 |
| SI-05 | Public search API (SI15, SI11, SI19): `GET /store/search` (with facets and category pages), `/suggest`, `/popular`, rate limits, `CommerceSettings.search`, `search=` on products routed to the engine; Website setup section with examples | backend + mint-tenant + mint-docs | M | done 2026-11-11 (`/popular` moved to SI-12) |
| **Phase 2 — Storefronts** | | | | |
| SI-06 | Store settings → Search (on / off, typos, out of stock, Banglish, dials, facets, suggestions, Rebuild + counts) | mint-tenant | S | done 2026-11-11 (filters to show + suggestion counts left for later) |
| SI-07 | mint.js Search widget (SI24): header icon, overlay with suggestions, results page with filters and chips, keyboard + screen-reader friendly, the store's look; site-builder "Search results" block + "Search box" element | backend + mint-sites + mint-builder | L | done 2026-11-12 (the blocks show on store sites once stores get builder sites, SB-10) |
| SI-08 | Reference storefronts: HINT `SearchView` + header overlay on `/store/search` + `/suggest` (typo chips, "Showing results for", filters); category pages on `/store/search?category=`; the same for Live Fresh; Next.js snippet in mint-docs | hint-site + live-fresh-frontend + mint-docs | M | done 2026-11-11 (category pages kept as they are) |
| **Phase 3 — Understanding** | | | | |
| SI-09 | Query understanding (SI8): codes → straight to product, price phrases (EN + BN), option values from the store's own, brand / category detection, sort words, stop words, `understood` in the answer | backend | M | done 2026-11-11 |
| SI-10 | Synonyms + redirects (SI13): builder models, expansion in the plan, starter packs (EN fashion, electronics, grocery, BN / Banglish), panel tables with Test; `upgradeStore` | backend + mint-tenant | M | done 2026-11-11 |
| SI-11 | No dead ends (SI12): loosen in steps, "Showing results for", did-you-mean from the store vocabulary, fallbacks; widget + HINT show it | backend + hint-site | S | done 2026-11-11 (the widget shows it too, SI-07) |
| **Phase 4 — Insights** | | | | |
| SI-12 | Events + attribution (SI17, SI18): `GET /store/search/popular` (from SI-05), `SearchEvent`, query cleaning (email / phone / card), `POST /store/search/events` (beacon batches), search id in mint.js + cart lines + `POST /store/orders` `search`, order attribution, `sold30` bump | backend + hint-site | M | done 2026-11-11 (mint.js has it since SI-07; no `searchId` on cart lines, see below) |
| SI-13 | Nightly rollups (SI17): `SearchQueryDaily`, signals into SearchDoc (sold30, views30, wishes), Product ⚙searchClicks30 / sold30 | backend | S | done 2026-11-11 (daily totals hourly, so today shows) |
| SI-14 | Insights page (§6): totals, chart, Top / No results / Low click rate / Trending tables with one-tap fixes, query drill-down, dashboard widget, Product page Search card | mint-tenant | L | done 2026-11-11 (pin / boost wait for SI-15, suggested fixes SI-16, Fix with your AI SI-18) |
| **Phase 5 — Merchandising and learning** | | | | |
| SI-15 | Rules (SI13): Search rule model, hide / filter / pin / boost / bury, query and category-page triggers, schedules, sentence editor with live before / after preview | backend + mint-tenant | M | done 2026-11-12 (suggested rules wait for SI-16) |
| SI-16 | Learning (SI16): `SearchPair` decayed counts with position correction, learned boost with thresholds, reformulation → synonym suggestions, `SearchSuggestion` + Accept / Dismiss on Insights, learning switch | backend + mint-tenant | M | done 2026-11-12 |
| SI-17 | Try search (SI10): the panel page with explain per result, understood chips, rules fired, timing | mint-tenant | S | done 2026-11-12 |
| SI-18 | MCP tools (SI22): `search_insights`, `try_search` (with explain), `save_search_suggestion` (synonym / redirect / rule drafts), `enrich_products` (keywords, a dry run first), "Fix with your AI" prompt dialog | backend + mint-tenant | M | done 2026-11-12 |
| SI-19 | Search by meaning (SI23): bundled multilingual model, worker thread, vectors at index time (int8 in SearchDoc), top-50 re-rank at 25%, zero-result nearest with a 0.45 floor, lazy load + 150 ms fallback, `SEARCH_SEMANTIC` switch + store setting, bench (+40 ms p95 max), Standard-2X dyno note for the user | backend | L | done 2026-11-12 |
| **Phase 6 — Rollout and later** | | | | |
| SI-20 | Finish: guide, Website setup, marketing website, rollout (`upgradeStores.js` dry run then `--apply` on prod, `searchRebuild.js --apply`; the user deploys the backend, moves web dynos to Standard-2X for SI-19, and approves the prod runs). Existing stores (Live Fresh / Verte, HINT): rebuild, run the relevance suite on each catalogue, then switch search on (README §8.5) | all | S | built 2026-11-13 (prod runs: the user) |
| SI-21 | The POS and panel product pickers use the engine (typos, SKU straight hits) | backend + mint-tenant | S | later |
| SI-22 | Atlas driver (SI3): one `$search` index over SearchDoc (fuzzy, autocomplete, facets), parity tests against the native driver on the fixtures, a platform switch | backend | M | parked: prod is Flex / shared (README §8.1) |
| SI-23 | Content search hooks: SearchDoc `kind`, optional pages / blog posts in suggestions (out of scope now, README §7) | backend | M | later |

## Handoff

SI-02…SI-06 are done (2026-11-10 / 11). Storefronts can now search: `GET /public/api/store/search` and
`/store/search/suggest`. A plain `search=` on Products is ranked too once a store has search on, which new stores
do from setup. The panel has **Store settings → Search settings** (mint-tenant `/store/settings/search`): search on
or off, typos, Banglish, out of stock, the four lifts, learning, and the search index with Rebuild. It is checked in a
browser against a test backend.

HINT and Live Fresh call the new search **and fall back** to their old search while production has no
`/store/search` (SI-08). They pick up the engine by themselves once the backend is deployed and each store's first
sweep has indexed it.

SI-09 (query understanding), SI-10 (synonyms, redirects, starter packs, Try a search), SI-11 (no dead ends:
`showing`, `didYouMean`, `fallback`, shown on HINT) and SI-12 (the search log, clicks, sales from search, popular
searches; HINT sends them) and SI-13 (the rollups: daily totals by query, sold / views in 30 days, two product
fields) are done too. The answer's `understood` is there for storefronts to show as chips;
HINT and Live Fresh don't show them yet (a small follow-up to SI-08).

SI-14 is done too: **Store → Search insights** (`/store/search`) with totals, a chart, the four tables and their
fixes, a drawer per search; a **Search** tab on each product; a "Website search this week" dashboard widget (new
stores get it, `upgradeStores.js --apply` adds it once to built stores). Backend: `GET /commerce/search/insights`,
`/insights/query`, `/insights/product/:id`, `/insights/week`.

SI-15 is done too: **Store → Search rules** (`/store/search/rules`), a `Search rule` store model (built stores get
it from `upgradeStores.js --apply`), rules applied in the engine (hide → show only → pin → boost / bury), a sentence
editor with the store's real results before and after, *Pin products* / *Boost* on Insights, and the rules that touch
a search or a product on the drawer and the product's Search tab.

SI-07 is done too: the mint.js **Search** widget (stores only) — icon / box / results layouts, suggestions,
filters and chips, the notes from SI-11, pixels, search ids on clicks, adds and the checkout widget's orders — and
the site-builder **Search box** / **Search results** blocks (mint-sites). Built sites render only for websites today,
so the blocks reach store sites with SB-10.

SI-16 is done too: the store **learns** from its shoppers. Once a day the sweep counts, per search and product,
how often it was shown, clicked, added and bought (decayed, half-life 30 days), against what its place on the page
would earn; products shoppers pick more than their place says get a small lift (×0.85–×1.25, `learned ×1.16` in
explain), only with 20+ showings from 5+ shoppers. Searches typed again with one word changed become *synonym*
suggestions, products that win from low down become *pin rule* suggestions: **Suggested fixes** on Insights, Accept
or Dismiss. The *Learning* switch (Search settings) turns it all off.

SI-17 is done too: **Store → Try search** (`/store/search/try?q=`): the store's search as shoppers get it, a sort
and pages, and for each result *Why* — the words matched where and how well, every multiplier, the score; the
right column has what it understood, the synonyms and spellings, the rules that fired and the time. Insights'
*Try search* and Search settings' *Try a search* open it.

SI-18 is done too: four store MCP tools — `search_insights`, `try_search`, `save_search_suggestion` (drafts land in
Suggested fixes as *From your AI*; nothing changes until the owner accepts) and `enrich_products` (search words,
a dry run first) — and **Fix with your AI** on Insights, a prompt to paste into the owner's own AI.

SI-19 is done too: **search by meaning**, with a small multilingual model on our own servers (no AI service, no
key). Each product gets a vector from its name, category path, brand, options and search words; the top 50 text
results are re-ordered with meaning at 25% (a text match always stays first), and when no product has the words the
closest products by meaning are shown (similarity ≥ 0.45, `showing.reason: 'meaning'`; Insights still counts it as a
search with no results). A store can turn it off in Search settings; `SEARCH_SEMANTIC=off` turns it off for the
platform. **The user must move web dynos to Standard-2X (1 GB) before deploying** — the model adds ~250 MB of memory.

SI-20 is built: the store guide (docs.mintapp.shop/store — search by meaning, recover table, settings), the Website
setup page's Store search card (the full answer, click/add-to-bag events, the rate limit), the marketing website
(changelog, a *Store search* feature, the Search widget card). **SI-02…SI-20 are all built; nothing is deployed.**

Next — the user's prod steps (see "SI-20 Finish" below for the full list):
1. Web dynos → Standard-2X. 2. Deploy the backend (`git push heroku v3:main` or the usual way). 3. `node
scripts/upgradeStores.js` then `--apply`. 4. `node scripts/searchRebuild.js --apply`. 5. Check each store's
`/commerce/search/status`, try its common searches, then switch it on.

Before switching existing stores on (README §8.5): deploy, let their first sweep index them, check
`/commerce/search/status`, try their common searches, then `PUT /commerce/search/settings { enabled: true }`.

Tests:
- `npx jest library/functions/commerce/search` (544)
- smoke `search-index.mjs` (31), `search-engine.mjs` (parity + the 20k bench), `search-api.mjs` (47), `search-rules.mjs`,
  `search-recover.mjs`, `search-events.mjs` (23), `search-rollup.mjs` (19), `search-insights.mjs` (27),
  `search-merch.mjs`, `search-learn.mjs`, `search-mcp.mjs`, `search-meaning.mjs` (real model + bench), `search-widget.mjs` (needs `STRIPE_API_BASE=http://127.0.0.1:12111` on the backend)

---

## SI-02 — Normaliser + Banglish key (M) — done 2026-11-10

- `normalise(text, { stem })` → `{ words, stems, phon }`. `normaliseQuery` also keeps the raw words for code matching.
- Rules exactly as in SI6. The English stemmer is a small, rule-based S-stemmer plus -ing / -ed with exceptions such as dress, glass, jeans, shoes → shoe. **Not** Porter: it is too aggressive for product names.
- `banglish.ts`:
  - `phonKey(word)`: a Bangla script word goes to a simplified Latin key; a Latin word goes to the same kind of key (sh / s / x merge, ee / i, oo / u, w / o, v / bh, double letters collapse, trailing a / o dropped).
  - The starter list (`packs/banglishWords.ts`, a .ts file so the build needs no JSON setting) overrides the rules for known words.
- **Done when** the unit tests pass, including the hand list:
  - shari = sari = saree = শাড়ি
  - panjabi = punjabi = পাঞ্জাবি
  - jutta = juta = জুতা
  - "t-shirt" = "tshirt" = "t shirt"
  - "৫০০ মিলি" → "500ml"

## SI-03 — Search document + indexer (L) — done 2026-11-11

What was built differs from the first notes below in three ways:
- A **sweep** every 2 minutes was added next to the hooks, so changes no hook sees (the public API, bulk imports, engine updates) still arrive.
- Discounts are touched from `applyDiscounts` itself, not from the discount's save.
- No `upgradeStore` step is needed: a store's first sweep builds it.
The Product model gained **Search words** (`keywords`, tags), which `upgradeStore` adds like any new blueprint field.

The first notes:


- `SearchDoc` with the SI19 indexes and a unique index on `{ project, product }`. `SearchQueue` has a unique index on `{ project, product }`.
- `document.ts buildDocs(store, productIds)` loads in bulk: products, their variants (codes, option values, stock), the category tree (names up the parents, cached per store), brands, collections and the current discount. It writes with `bulkWrite` upserts and removes archived or deleted products.
- **Hooks:** a `touch()` after each relevant save (see README §5). A category or brand rename touches its products in batches of 500.
- **Tick:** a leased tick like CR-11, every 5 s, taking up to 500 queue rows per store per pass. After writing, `CommerceSettings.search.version++`.
- **Rebuild** works in pages of 500, with a progress record. The panel shows it later in SI-06.
- **Done when:**
  - the smoke test `search-index.mjs` covers: seed the HINT fixtures; edit a name, a variant SKU, a category name, a stock move and a discount; each shows up in SearchDoc within 10 s;
  - archive removes the product, and rebuild gives identical documents.

## SI-04 — Native driver + ranking (L) — done 2026-11-11

Built as planned, with these changes:
- Each word's rarity in the store is a factor (0.6–1.4).
- The Banglish key has three modes (README SI10).
- Typo candidates allow for a swap of two letters breaking up to four trigrams.
- Partial matches (some of the words) are added only when there are fewer than 200 whole matches, and only up to 600 of them. Before that cap the bench's p95 sat at 250 ms; with it, 129 ms.
- An in-memory driver gives the same answers for tests.
- Category pages (no words) browse through the database with the same filters and counts.
- Suggestions are part of the engine.

Measured on a MacBook with local MongoDB, 20,243 products: search p50 36 ms, p95 129 ms (with filter counts, uncached); suggestions p50 14 ms, p95 17 ms; a repeat search from the cache under 5 ms; a rebuild ~450 products/s. **To check on the prod cluster** (Flex tier, network latency): `search-engine.mjs` against a copy, before SI-05 goes live.

The first notes:


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

## SI-05 — Public search API (M) — done 2026-11-11

Built as below, plus:
- collection filters;
- option values as the store wrote them (`facets.labels` on SearchDoc);
- the settings routes;
- new stores switched on at setup.
- **`/popular` moved to SI-12**, because it needs the search log.
- The Products `search=` goes to the engine only for `search.enabled === true` (set by name), so storefronts on today's answers keep them until a store is checked.

The guide is mint-docs `/store#store-search`. Website setup gained a Store search panel (mint-tenant). The marketing changelog has the entry.


- The routes as listed in README §5, with the rate limits, `Cache-Control: max-age=30`, and validation that answers in plain words.
- `CommerceSettings.search` defaults, `upgradeStore` adds them, and rebuild is queued.
- `publicRecords` products `search=` is routed to the engine when it's on and no `sort` is given. The answer shape is unchanged: `doc`, `total`, `page`.
- Website setup: a Search section with fetch examples (JS, Next.js server component) and the response shape.
- **Done when** `search-api.mjs` covers paging, every filter, facets that ignore their own group, a category page, suggest, popular with the 3-visitor floor, rate limits, and `explain` refused without a server key.

## SI-06 — Store settings → Search (S) — done 2026-11-11

mint-tenant: `SearchSettings.tsx` on the new page `/store/settings/search`, plus the menu item (backend
`tenantNav.function.ts`, after Product settings) and the commerceApi calls (`getStoreSearchSettings` /
`saveStoreSearchSettings` / `getStoreSearchStatus` / `rebuildStoreSearch`). Saving sends only what changed, so a
store not yet switched on by name stays "not switched on" until someone flips it. A store with no `search.enabled`
shows that state. The index card polls while a rebuild runs. The guide has the anchors `store-search-settings` and
`store-search-index`.

**Left out** (no backend for them yet): choosing which filters a storefront shows, and how many suggestions it
gives. Storefronts decide both for now.

## SI-08 — Reference storefronts (M) — done 2026-11-11

- **HINT** (hint-site 2896b6d, `commerce` main): `searchStore` / `suggestStore` / `productsForCards` in `lib/hint.ts`.
  - The search page ranks with `/store/search`, then loads the full products by web address (`slug_in`) so the
    cards keep their sizes and quick add. A card without a web address is drawn from the card.
  - The page shows "Showing results for “…”" from `query.typos`, suggestions under the box (finished words and
    "In <category>"), category chips with counts, In stock and a sort. Filters are kept in the address.
- **Live Fresh** (live-fresh-frontend a1c54e9, `main` → live-fresh.vercel.app): `storeRanking` in `lib/search.js` gives
  the order. Its own filters, sorting and counts stay, over its loaded catalogue. This works there because the shop
  loads its whole catalogue (≤ 100). The page and the header search box show the store's order and the corrected
  words.
- **Both fall back** to their old search when `/store/search` doesn't answer, which is the case on production until the
  deploy. Checked against production: HINT "jacket" gives 3, Live Fresh "chicken" gives 25, both without the new parts.
  Checked against a test backend with HINT's catalogue: "jaket" → the two jackets with the note, the Stone Ring
  chip narrows 80 to 20, price sort, "snea" suggests sneaker / sneakers / In Shoes, the phone layout has no page
  scroll, and Live Fresh's "snekers" / "chronogarph" work on the page and in the header box.
- **Category pages not moved:** HINT's already filter the whole category in the page (20 per category), and moving
  them gains nothing at this size. They should move when a store's categories outgrow a page.
- mint-docs: a Next.js search page with the fallback in the store guide (`store-search`).

## SI-09 — Query understanding (M) — done 2026-11-11

`commerce/search/understand.ts` (pure) reads the query into words plus price, sort, in stock / on sale, option
values, brand and category, using `vocab.knows`. Both drivers now gather the store's option labels, brands and
categories with the vocabulary. In the engine, `applyUnderstood` fills in filters the shopper didn't set (theirs win)
and adds the lifts (`rank(…, boosts)`). A query with no words left browses (for example "under 3000"). A brand or size
that leaves nothing is relaxed. The whole query as one product's code sets `understood.product`.

One choice differs from the first notes: a colour or size **said as a plain word is a lift, not a filter**. Filtering
on it would drop "Red berry candle" for "red candle", since the candle has no Colour option. Named outright, it
filters.

Tests: `test/understand.test.ts` (48: EN and BN prices, sorts, stock / sale, sizes and colours both ways, brands,
categories, filler), engine tests (13 more, 120 there). `search-api.mjs` has 5 more checks (51), and the database
parity still holds.

## SI-10 — Synonyms + redirects (M) — done 2026-11-11

- **Two store models** in the blueprint: **Search synonyms** (`search-synonyms`: name, kind same / one-way, words, to,
  on; From and Starter pack are the engine's) and **Search redirects** (`search-redirects`: name, searches, match
  exact / contains, page to open, on, starts, ends; Used is the engine's). New stores get them at setup. Existing
  stores get them from `upgradeStores.js`; the smoke test checks the dry run and `--apply`.
- **`commerce/search/rules.ts`:** compiles both. Synonyms are one word per entry, linked by word and stem; entries of
  several words are left out for now. Redirects compare word forms and respect their dates. `storeRules` caches per
  store and index version. `rulesChanged` (from fireCommerce) names a nameless rule and bumps the version, so the next
  search sees a change. Also `packList` / `setPack` and `countRedirect`.
- **Engine:** each query word gets its synonyms (`syn`, matched at 0.8). A word known only through a synonym tries no
  typos. The answer gains `query.synonyms` and `redirect`, and suggestions use synonyms too.
- **Starter packs** (`packs/synonyms.ts`): Clothes and fashion, Electronics, Grocery, Bangla and English. I dropped
  "boot" (chickpea), which would have caught "boots".
- **Panel routes:** `GET /commerce/search/packs`, `POST /search/packs/:id { on }`, `GET /search/try?q=` (explained).
- **mint-tenant:** Search settings gained **Words and redirects** (pack switches, links to both tables) and **Try a
  search** (results explained, chips for what was understood, synonyms, typos, a redirect).
- **Tests:** `test/rules.test.ts` (22: compile, redirects, packs, search with rules; 407 in all) and
  `scripts/tenancy-smoke/search-rules.mjs` (all passing: saving works at once, one way, packs on / twice / off,
  redirect + hits, try, upgrade of an older store).

## SI-11 — No dead ends (S) — done 2026-11-11

- **`commerce/search/recover.ts`** (pure): `fewerWords` picks the best smaller set of the query's words from the
  documents found — the most words, then the rarest (Σ idf), then the most products, never under half the words;
  `covering` keeps the documents with all of them; `nearestWord` is "did you mean" (one change, two from six letters,
  the first letter may differ; only words the store shows).
- **Engine (`searchWith`)**, when no product has every word (a SKU hit counts as every word):
  1. understood filters set aside — a brand or size, then a price / in stock / on sale (`understood.relaxed`); the
     shopper's own filters never;
  2. typos `normal`: the loose plan, two typos only between words of six letters or more → `showing.reason: 'typos'`
     with the store's spelling;
  3. fewer words → `showing.reason: 'fewer words'`, `dropped`, re-ranked as if the dropped words were never typed;
  4. no smaller set: products with some of the words, as before → `showing.reason: 'some words'`;
  5. nothing at all: `didYouMean` and `fallback { kind: category | popular, doc }` (8, by sales).
  Every word found: nothing changes. A second candidates call happens only in step 2.
- **HINT** (`SearchView.tsx`): "No exact results for … Showing results for …", "No product has all of … — showing the
  ones with some of the words", "Nothing under ৳10 — showing every price", "Did you mean …?" (a button) and a
  "Popular right now" grid. Checked in the browser pane against a local copy of the HINT catalogue.
- **Panel**: Try a search shows the same lines and what shoppers see instead. **Guide**: "When nothing matches"
  (`/store#store-search-recover`) and the example code.
- **Tests:** `test/recover.test.ts` (19) and `scripts/tenancy-smoke/search-recover.mjs` (14 checks, all passing).
- **Left:** the mint.js widget shows it with SI-07; zero-result searches are logged with SI-12.

## SI-12 — Events + attribution (M) — done 2026-11-11

- **`SearchEvent`** (platform, keyed by project, `searchevents`, TTL 90 days on `at`): `search`, `suggest`, `click`,
  `cart`, `order`. Each has the visitor and session ids of the site's analytics (track.js) and the search id. No IP.
- **`commerce/search/events.ts`**:
  - `cleanQuery`: emails → `[email]`, BD mobiles (with or without +88 / 0088, spaces, dashes, Bangla digits) and
    E.164 numbers → `[phone]`, 13–19 digits passing the Luhn check → `[number]`. A barcode that fails Luhn stays.
    When anything was cleaned, the logged `words` keep only what's still in the cleaned query.
  - `normalisedOf`: the stems in order (`nq`), so "Shirts" and "shirt" are one row in the rollups.
  - `logSearch` (in the background; a search is never slower), `recordEvents` (a click or an add must name a search of
    this store whose page showed that product; the position is worked out from that page; duplicates in a batch
    dropped), `afterWebsiteOrder`, `popularQueries` (5-minute cache), `popularStartingWith`.
- **Routes**:
  - `GET /store/search`: a search with words (not a category page, a crawler, the page renderer or `explain`) is
    logged and answers with `searchId`; `visitor` and `session` in the query string. Its answer is
    `Cache-Control: private` now (it carries the shopper's own id); category pages stay `public`.
  - `POST /store/search/events` (text/plain for sendBeacon, ≤ 20 events, 120 a minute; own-site and bot checks as
    `/track`; 404 when search is off).
  - `GET /store/search/popular?limit&days`: top searches that found something, each made by 3 visitors or more,
    shown as typed most often. Suggestions put the popular ones starting with what's typed first (30 days).
  - `POST /store/orders` takes `search: { ids, visitor?, session? }` (or track.js's `x-mint-visitor` header).
- **Attribution** (`afterWebsiteOrder`, after the order is placed, never failing it): a line is from search when its
  product was clicked or added to the bag from a search in the 24 hours before, by the same visitor or in a search
  the order names. The last one wins; `revenue` is that line's total. Every ordered product's `signals.sold30` goes up
  by its units (SI-13 recounts nightly from the orders).
- **HINT** (`src/lib/searchTrail.ts`): sends `visitor` / `session` with searches, keeps the search ids for a day in
  sessionStorage, beacons clicks and adds from result cards and suggestion picks, sends `search` with the order, and
  shows "Popular searches" on the empty search page. `track.js` now also has `MintAnalytics.sessionId`. Checked in the
  browser pane against a local copy of the HINT catalogue: a search, a click (position 1), a guest order counted from
  search with that line's total.
- **Not done, on purpose:** no `searchId` on cart lines. The click (or the add from the results) already ties a product
  to its search, and the order carries the ids, so a field on every store's cart line would add nothing.
  mint.js gets the same calls with its Search widget (SI-07).
- **Tests:** `test/events.test.ts` (36) and `scripts/tenancy-smoke/search-events.mjs` (23 checks); `search-api.mjs`
  (its cache check now expects `private`, plus a category page `public`), `search-recover`, `search-rules`,
  `commerce-orders` pass.

## SI-13 Nightly rollups — done 2026-11-11

- **What:** `SearchQueryDaily` (platform, keyed by project, 13 months: day × normalised query → q as typed most often,
  searches, visitors, zero, clicks, carts, orders, revenue) and the product signals for ranking and the panel.
- **`commerce/search/rollup.ts`**, run from `runSearchSweep` after the drift check, each job claimed by moving its stamp
  on `CommerceSettings.search.rollup` (two servers never run one store at once):
  - `rollupDaily` (due hourly, `SEARCH_DAILY_MS`): every store day from `lastDay` (the last finished day) through
    today, each written again in full (`writeDay`: upserts, and drops a query the day no longer has). Days are the
    store's time zone (`answers.store.timeZone`), stored as the 00:00 UTC that names them. A first run starts at the
    store's oldest event (≤ 90 days). Second pages aren't new searches; visitors are visitor ids, else session ids.
  - `rollupSignals` (due daily, `SEARCH_SIGNALS_MS`): `sold30` from the orders of the last 30 days (status open or
    completed, any channel, `quantity − returned`), `views30` from `signals.viewDays` (per UTC day, kept 30 days;
    `viewProduct` adds to it), `wishes` from `wishlistCount`. Only changed documents are written; the search version
    goes up when any did (the caches start again). Products get `sold30` and `searchClicks30` (clicks from search,
    30 days), written with `timestamps: false` so the sweep doesn't rebuild them.
- **Blueprint:** Product gains **Sold, 30 days** (`sold30`) and **Opened from search, 30 days** (`searchClicks30`),
  engine fields (read-only), in the table for new stores; `upgradeStores.js` adds them to built stores.
- **Ranking:** popularity uses `views30` (falls back to lifetime `views` until the first recount).
- **Status:** `GET /commerce/search/status` → `rollup { dailyAt, lastDay, signals { at, products, changed, ms } }`.
- **Not done, on purpose:** no `scripts/searchRollup.js`: every store's first sweep after the deploy backfills by itself.
  `SearchPair` is SI-16's.
- **Tests:** `test/rollup.test.ts` (8: store days in Dhaka / New York, clock changes, 30-day views) and
  `scripts/tenancy-smoke/search-rollup.mjs` (19: today's row, "Candles" and "candle" as one, a zero-result search,
  a day two days ago kept apart, sold recounted from a wrong 99 and a cancelled order not counted, views by day, the
  product fields without `updatedAt` moving, the status, an older store upgraded). Needs `SEARCH_DAILY_MS=2000
  SEARCH_SIGNALS_MS=2000` and `SMOKE_BACKEND` for the upgrade part.

## SI-14 Insights page — done 2026-11-11

- **What:** the store owner's view of their website search: what shoppers search for, what they find, what it earns,
  and a fix one tap away.
- **Backend** (`commerce/search/insights.ts`, routes in `routes-tenant/commerce.router.ts`, all `records:view`):
  - `GET /commerce/search/insights?days=7|30|90` (anything else is 30): totals and the period before; a series by
    store day; Top, No results, Low click rate (≥ 3 searches, results shown, click rate < 15%) and Trending (last 7
    days against the 7 before, ≥ 3 searches, `isNew` when it had none). Totals come from `SearchQueryDaily`; visitors
    and searched sessions from the raw `SearchEvent`s (90 days), and the share of visits with a search uses the
    website's analytics sessions (`—` without them).
  - `GET /commerce/search/insights/query?q=…&days=…` (400 "Type a search"): the query's totals, by day, clicks by
    position (1–10, 11+) and what people searched next (same session, within 10 minutes, the first different search).
  - `GET /commerce/search/insights/product/:id` (400 "Not a product"): 30 days — shown in searches, opened, added to
    the bag, units and revenue from search, the searches that led there, its search words, `sold30`, `views30`.
  - `GET /commerce/search/insights/week`: the dashboard widget's numbers.
  - Rates: no results = zero ÷ searches; click rate = clicks ÷ searches with results (at most 100%); conversion =
    orders ÷ searches.
- **Panel** (mint-tenant): `/store/search` (`SearchInsights.tsx`) — period switch, eight tiles with the change
  against the period before, an "Over time" chart (searches / no results / revenue), the four tables. No results rows
  get *Add a synonym*, *Redirect*, *Create the product*: each opens the create form with the search filled in
  (`CreateRecordPage` now reads `?fill_<field>=`). Low click rate rows get *Try search*, which opens Search settings'
  Try a search with it typed (`?try=`). A row opens a drawer: tiles, by day, its results now, clicks by position, the
  next searches (each opens its own). The product page gets a **Search** tab (`ProductSearch.tsx`). Sidebar: Store →
  Search insights (`tenantNav`). Guide anchors `store-search-insights`, `store-product-search`.
- **Dashboard:** widget type `search` ("Website search this week": revenue and searches against the week before, the
  top search with no results). New stores get it in `storeDashboard`; the dashboard builder offers it to e-commerce
  projects; `upgradeStore` adds it once (`doneOnce: 'search-widget'`) after the first chart.
- **Not done, on purpose:** *Pin* / *Boost* and the rules column (SI-15), Suggested fixes (SI-16), Fix with your AI
  (SI-18). A Search group in the sidebar waits until Rules and Try search have pages of their own.
- **Tests:** `scripts/tenancy-smoke/search-insights.mjs` (27: totals and rates, the period before, Trending with a new
  search, the drawer's positions and next searches, the product numbers, 400s, a viewer can read it, the widget on a
  new store and once on an upgraded one). Needs `SEARCH_DAILY_MS=2000` and `SMOKE_BACKEND` for the upgrade part.
  Checked in a browser against a test backend: the page, the drawer, the No results fixes into a filled synonym form,
  the product tab, the dashboard widget.

## SI-15 Search rules — done 2026-11-12

- **What:** the owner decides what a search, or a category page, shows first, lower down or not at all (README SI13).
- **Model** (`blueprint.ts`, key `searchRule`, route `search-rules`, its own page so the plain table is off the
  sidebar): name, when (`exact` / `contains` / `category` / `always`), queries, category, action (`pin` / `boost` /
  `bury` / `hide` / `filter`), products, brands, categories, collections, onSale, strength (boost 1.5 / 2 / 3, bury
  0.5 / 0.2; default 2 and 0.5), active, startsAt, endsAt, source (you / suggested / your-ai), hits, lastHitAt. A
  nameless rule is named by its sentence ("Searches for “dress” or “frock”: pin 2 products"). Built stores get it
  from `upgradeStores.js --apply` (it adds missing blueprint models).
- **Engine** (`search/merch.ts`, `rules.ts`, `engine.ts`): rules are compiled with synonyms and redirects, per index
  version (a save bumps it). Triggers match on normalised stems like redirects; a category rule fires only on that
  category's page with no words. Order: hide, show only (set aside when it would leave nothing), pin (products in
  the order picked; a pinned product the words don't find is fetched, but must pass the shopper's filters), then
  boost / bury as multipliers (`rule “name” ×3` in explain). Pins and boosts give way to a sort the shopper picks;
  hide and show only always apply. A pin clears `fallback` / `didYouMean`. Category pages with rules order up to
  2,000 products in memory. Schedules: an end date runs to the end of that day. Public first pages count `hits`.
- **Routes** (`records:view`): `POST /commerce/search/rules/preview { rule, q? }` → `{ q, category, ready, missing?,
  fires, before, after }` (dates and the On switch ignored, the saved copy left out of "before");
  `GET /commerce/search/rules/touching?q=|?product=`.
- **Panel** (mint-tenant): `/store/search/rules` (`SearchRules.tsx`, Store → Search rules): list with an On switch,
  uses, dates, delete (PromptDialog); the editor reads as a sentence (When … Do … To … Dates … Name) with Without the
  rule / With it side by side (moved ▲▼, new, pinned) and a Try it box. `?new=pin|boost&q=` / `&product=` and
  `?edit=<id>` open it. Insights' Low click rate rows and the drawer get *Pin products* / *Boost*; the drawer and a
  product's Search tab list the rules that touch them. Guide anchor `store-search-rules`.
- **Tests:** `test/merch.test.ts` and `scripts/tenancy-smoke/search-merch.mjs` (rules on search and category pages,
  pins of products the words miss, show only set aside, schedules, hits, preview, touching, sentences).

## SI-07 Search widget — done 2026-11-12

- **mint.js** (`routes-public/mint.ts`): `Mint.search` — `open(q)`, `track(events)` (sendBeacon, text/plain),
  `remember` / `ids` / `from` (search ids for a day in sessionStorage, 30 at most), `clicked`, `searched`, and
  `viewed(q, answer)`, which fires once per search: gtag `view_search_results`, fbq `Search`, ttq `Search`, a
  dataLayer push without gtag, and `mint:search:results`. `Mint.cart.add` sends a `cart` event when the product came
  from a search; the checkout widget sends `search: { ids, visitor, session }` with the order.
- **Widget** (`routes-public/widgets/search.ts`, served as `/public/widgets/search.js`): layouts *icon* (a dialog:
  scrim, focus kept inside, Esc), *box*, *results*; a tag's `data-layout` wins. The box is an ARIA combobox (listbox
  of searches, products with prices, categories / brands, See all; arrows, Enter, Esc; popular searches when empty).
  The results page keeps its state in the address, shows filters with counts, chips for what was understood (removing
  one searches `understood.words` with the rest as explicit filters) and for picked filters, sort, pages, the
  Showing / Did you mean / close-matches notes, the fallback grid and popular searches on no results; follows a
  redirect on page 1 only. Demo data in the builder preview.
- **Catalog**: `search` in `WIDGET_TYPES` with `only: 'ecommerce'` — a website's catalog leaves it out, and saving it
  on one is refused (`widget_not_for_project`). Options layout, resultsUrl, productUrl, perPage (4–60), showFilters.
- **Orders**: `payments.function.ts` calls `afterWebsiteOrder` for a store's checkout-widget orders.
- **Site builder** (mint-sites): `search-box` (icon or box, results page) and `search-results` blocks render the
  widget's tags; a button's *Open a widget* action can open Search (overlays script → `Mint.search.open('')`).
  mint-builder lists *Search (stores)* in the widget action. Manifest synced (40 blocks). `renderPage` serves only
  `type: 'website'` today, so the blocks appear on a store's site with SB-10.
- **Saved texts**: a widget saved before keeps the texts it was saved with; the defaults reach new ones.
- **Tests**: mint-sites `test/blocks.test.tsx` (SI-07 search blocks), `scripts/tenancy-smoke/search-widget.mjs`
  (catalog per type, options cleaned, served script parses, browser search id + click, checkout order counted from
  search for its line only, sold30 up). Checked in headless Chrome: suggestions with arrow keys, results with chips
  and filters, pixels once each, a click recorded, a chip removed.

## SI-16 Learning — done 2026-11-12

- **What:** search gets better from what shoppers do (README SI16), and tells the owner what it noticed.
- **Counts** (`search/learn.ts`, model `SearchPair`, collection `searchpairs`, one row per store + normalised query
  + product): impressions, visitors, clicks, carts, orders, and `expected` — the clicks its places on the page would
  earn — all decayed with a 30-day half-life inside the aggregation. Position = (page − 1) · limit + index + 1. The
  click rate by position is learned per store (smoothed towards a prior, then made non-increasing down the page) so
  a small store's noise can't say place 3 beats place 1.
- **Boost:** (clicks + ½ carts + orders + 1) / (expected · convert + 1), tanh-shaped into ×0.85…×1.25, only with
  20+ impressions from 5+ visitors. It applies on the words path when results are ranked by relevance, as a
  multiplier (`learned ×1.16`), scaled by the *Learned* dial and off with the *Learning* switch. Cached per index
  version with the rules; a run that changes anything raises the version.
- **When:** the sweep calls `learnStore` after the rollup, once a day per store (`SEARCH_LEARN_MS`, default a day),
  stamped in `search.learn.last`. `POST /commerce/search/learn` (manage) runs it now (`{ skipped }` when off).
- **Suggestions** (model `SearchSuggestion`): *synonym* when shoppers retype a search with one word swapped
  (not typing on, not a prefix, no digits, 3+ shoppers); *rule* (pin) when a product's boost is ≥ 1.2 from position
  5 or lower. Keyed per store so a dismissed one never comes back; open ones are refreshed with new evidence.
  `GET /commerce/search/suggestions` (view), `POST …/:id/accept` (edit; makes the synonym or the rule with
  `source: suggested`, edits allowed; 409 `suggestion_decided`), `POST …/:id/dismiss`. `saveAiSuggestion` takes
  synonym / redirect / rule drafts for SI-18 (`source: your-ai`).
- **Panel:** Insights → **Suggested fixes** (`SearchSuggestions.tsx`, anchor `store-search-suggestions`): the why,
  the evidence, Accept / Dismiss, *Look for fixes now*.
- **Tests:** `test/learn.test.ts` (28), `scripts/tenancy-smoke/search-learn.mjs`.

## SI-17 Try search — done 2026-11-12

- **Page** (mint-tenant `/store/search/try`, `SearchTry.tsx`, Store → Try search): search box, sort, pages (24); a
  result list with picture, price, score, pinned / out of stock / learned tags and a *Why* per result (or *Show every
  why*): the explain string taken apart into words matched (which part, how, points), the multipliers in words, the
  score. Right column: time, words matched, what was understood (chips), synonyms and spellings used, the rules that
  fired (links to the editor), pinned count; and links to pin, boost, synonyms and settings. Redirect, *Showing
  results for*, *Did you mean* and the fallback are shown as shoppers get them. `?q=` opens it with a search.
- **Backend:** `GET /commerce/search/try` takes `page`, `limit` (up to 48) and `sort`; the Store nav has *Try search*.
- **Links:** Insights' *Try search* and Search settings' *Try a search* open the page. Guide anchor `store-search-try`.
- Checked in headless Chrome against a test backend (pinned, rule fired, explain parts).

## SI-18 MCP tools — done 2026-11-12

- **What:** the owner's own AI improves search (README SI22) — no AI on our servers (the user’s rule: AI via MCP).
- **Tools** (`library/controllers/mcp/search.tools.ts`, `only: 'ecommerce'`, wired in `mcp.router.ts` with
  `SEARCH_INSTRUCTIONS` after the store's):
  - `search_insights { days?, q? }` (data, view on products): totals, top / no results / low click rate / trending,
    open suggestions; with `q`, that search's insight.
  - `try_search { q, page?, limit?, sort? }` (data): `storeSearch` with explain, as text per result plus understood,
    synonyms, typos, rules, redirect, showing / didYouMean, fallback.
  - `save_search_suggestion { kind, record, why, title? }` (data): `saveAiSuggestion`; a rule's products may be
    ids, SKUs or names (resolved to ids, unknown ones refused). Same draft again updates the open one; a decided one
    is left as it is.
  - `enrich_products { items?, apply?, limit? }` (build): no items → active products with the fewest search words;
    items `{ product, add, remove }` → dry run (before → after); `apply: true` (Records: Add + Edit on products)
    saves through the model, builds the products' search documents at once, drops the store's vocabulary and the
    answer cache so the new word works straight away. Lower-cased, ≤ 40 characters, ≤ 20 a product, the name left
    out; any problem changes nothing.
- **Panel:** Insights → **Fix with your AI** (`SearchFixWithAi.tsx`, anchor `store-search-fix-with-ai`): the prompt
  (`searchFixPrompt(days, q?)`), Copy prompt, a link to Connect your AI.
- **Tests:** `scripts/tenancy-smoke/search-mcp.mjs` (website keys have none of the tools; explain; insights after
  real searches; suggestion checks and From your AI; dry run then apply; search finds the new word).

## SI-19 Search by meaning — done 2026-11-12

- **What:** README SI23. Shoppers' words that the store doesn't use still find the right products ("party wear" →
  the sequin gown, "শাড়ি" → the Jamdani saree), without any outside AI service.
- **Model:** `Xenova/paraphrase-multilingual-MiniLM-L12-v2`, quantised ONNX (~120 MB, 384 numbers), pinned to one
  revision. `scripts/searchModel.cjs` fetches it at **build** time into `search-model/` (gitignored); never at run
  time. `heroku-postbuild` = `npm run build && node scripts/searchModel.cjs --prune` (`--prune` drops
  onnxruntime-node's Windows / macOS binaries on Linux, ~200 MB of the slug). A failed fetch never fails the build:
  search runs by words and the status says `missing`. Runtime: `@huggingface/transformers` **3.7.6** (pinned: 4.x
  needs onnxruntime 1.30, which has no Intel-Mac build).
- **Code** (`search/semantic/`): `vector.ts` (pure: meaning text, int8 pack ×127, cosine, re-rank, nearest),
  `model.ts` (one eval worker thread, lazy load ~2–5 s, `embedQuery` with a 150 ms budget — slow or not loaded →
  null and words only, counted and logged; `SEARCH_SEMANTIC=off`, `SEARCH_MODEL_DIR`, `SEARCH_SEMANTIC_MS`),
  `store.ts` (the store's vectors in memory per index version for 10 min, query vectors cached 10 min, `embedDue`).
- **Index:** SearchDoc + `vecText`, `vecKey` (hash of the text), `vec` (384 bytes), `vecDue`. `buildDocs` marks a
  document due only when its meaning text changed; the search tick embeds due documents 64 at a time and raises the
  index version. Status (`/commerce/search/status`) has `meaning { state, loadMs, queries, slow, p50, p95, vectors, due }`.
- **Engine:** `searchWith(…, meaning?)`. The query vector is made while the words are searched. Relevance sort only:
  the top 50 are re-ordered by 75% text share + 25% similarity (`meaning 0.85 ×0.96` in explain). When nothing has the
  words (after SI12's loosening, alongside *Did you mean*): the 24 nearest with similarity ≥ 0.45 →
  `showing { reason: 'meaning' }`, explain `close in meaning ×0.52`. With explain the answer has `meaning { used:
  reranked | nearest | no, why?, moved? }`. Suggestions stay words only. Logged with `results: 0` so Insights' No
  results still shows the search.
- **Settings:** `semantic` (default on) in `/commerce/search/settings`, a *Search by meaning* switch in Search
  settings (anchor `store-search-meaning`; it says when the server has no model), *By meaning* on the index card and
  on Try search. Widget text `meaning` ("Nothing matched “{q}” word for word — these are close in meaning."). MCP
  `try_search` says when results are by meaning.
- **Bench** (`search-meaning.mjs`, 48 searches, 8 products, Intel Mac): p95 27.9 ms on vs 13.4 ms off — +14.5 ms
  (limit +40). Memory: ~540 MB RSS for the backend with the model loaded (≈ +250 MB).
- **For the user:** move web dynos to **Standard-2X** before deploying this; check the slug stays under 500 MB
  (`heroku builds:info` / the build log prints the size).
- **Tests:** `test/semantic.test.ts` (13, fake embedder), `scripts/tenancy-smoke/search-meaning.mjs` (real model).

## SI-20 Finish — built 2026-11-13

**What:** the words and the rollout. The code is SI-02…SI-19; this order only tells people about it and gets it to prod.

**Done (committed and pushed):**
- mint-docs store guide: search by meaning (`#store-search-meaning`), the *Close in meaning* recover row, the
  *Search by meaning* setting, *By meaning* on the index card.
- mint-tenant Website setup → Store search: every field of the answer (redirect, showing incl. `meaning`,
  didYouMean, fallback, understood, searchId), the click / add-to-bag events snippet (sendBeacon) and the 120 a
  minute per IP limit.
- mint-webpage: changelog, a *Store search* feature (guide `store#store-search`), the Search widget card.

**Rollout — the user (deploys and prod runs are theirs):**
1. **Dynos.** Move web dynos to **Standard-2X** (1 GB). The model is ~540 MB of the process once loaded.
2. **Deploy the backend.** `heroku-postbuild` runs `npm run build && node scripts/searchModel.cjs --prune`, which
   fetches the model (~120 MB) into `search-model/`. Check the build log: the slug must stay under 500 MB. If the
   fetch fails the build still passes, and search runs by words (status `meaning.state: missing`).
3. **Stores.** `node scripts/upgradeStores.js` (dry run, read it), then `node scripts/upgradeStores.js --apply` —
   adds the Search sidebar group and settings to built stores.
4. **Index.** `node scripts/searchRebuild.js` (dry run), then `--apply`: every store's documents built again
   (meaning texts included; the tick then makes the vectors, 64 at a time).
5. **Check.** `GET /tenant/api/p/<id>/commerce/search/status` per store: `docs` = active products, `meaning.state:
   ready`, `meaning.vectors` climbing to `docs`, `due: 0`.
6. **Existing stores** (Live Fresh / Verte, HINT) — README §8.5: open Try search, run the store's common searches
   (its best sellers' names, a category, a misspelling, a Bangla word), then `PUT …/commerce/search/settings
   { "enabled": true }` (or the switch in Store settings → Search). New stores are on from the start.
7. **Watch** for a day: Insights → No results, and the server log for `search by meaning: a query took over 150
   ms` (many of those → `SEARCH_SEMANTIC_MS=250` or `SEARCH_SEMANTIC=off`).

**Rollback:** `SEARCH_SEMANTIC=off` (config var, no deploy) turns meaning off platform-wide; a store's switch turns
search off and the storefront falls back to its old list.

## SI-21 … SI-23 (the rest)

See the status table. Each gets its own section here when it starts (same
shape: what, how, done when).
