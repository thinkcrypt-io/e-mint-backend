# Store search — changelog

## 2026-11-11 — SI-03 Search document + indexer

- Models (`library/models/tenancy/`, one collection each for every store, keyed by project): `SearchDoc` (`searchdocs`:
  flat `terms` / `prefixes` / `grams` / `phon` / `codes`, each indexed with the project; `fields` per part; `facets`;
  `signals`; `card`) and `SearchQueue` (`searchqueue`, one row per product, leased). `CommerceSettings` gained `search`.
- `commerce/search/document.ts`: `docFor` (pure) and `buildDocs`.
  - What it reads: the name, the brand, the category and every one above it, collections, option values (the product's
    and its active variants'), Search words, the description (tags stripped, 2,000 characters), the owner's own
    fields marked searchable, and SKUs / barcodes as codes.
  - What it works out: the selling price (the lowest active variant's; one with no price of its own sells at the
    product's — the smoke test found this), on sale, in stock, the opts filters, and the card.
- `commerce/search/indexer.ts`: touch / touchLater / touchForSave, the leased drain, `rebuildSearch`, the sweep, the
  drift check, `searchIndexStatus`, `scheduleSearchIndex` (server.ts).
- Hooks: `fireCommerce` (saves and deletes), `stock.ts` `move`, `discounts.ts` `applyDiscounts`.
- Routes: `GET /tenant/api/p/:id/commerce/search/status`, `POST …/search/rebuild` (managers).
- `scripts/searchRebuild.js` (dry run / `--apply` / one project).
- Product blueprint: **Search words** (`keywords`, tags, searchable).
- Tests: `test/document.test.ts` (16, 217 in all) and `scripts/tenancy-smoke/search-index.mjs` (31 checks, all passing
  on a private server with the HINT fixtures). The neighbouring smoke tests still pass (stock, wishlist, categories,
  collections). commerce-install fails on its model count: it expects 23 and stores have had 24 since Wishlist, so this
  is unrelated. commerce-discounts fails on "ends today" checks run just past midnight in Dhaka, also unrelated.

## 2026-11-10 — SI-02 Normaliser + Banglish key

- `library/functions/commerce/search/normalise.ts`, which works the same on product text and queries:
  - `clean`: NFKC, lower case, accents off Latin letters only (Bangla vowel signs are marks too), Bangla digits,
    ৎ and nukta letters written one way, zero-width characters gone, 1,500 → 1500, 32" → 32 inch.
  - `tokenise`: a hyphen joins a short side (t-shirt, v-neck) and splits two long ones (high · waist); slashes split.
    Only t / v / e / x join the next word ("t shirt" → tshirt), so "l size" stays two words. Units are joined to
    their numbers in one spelling (500 ML, ৫০০ মিলি → 500ml). Each token is a word, a Bangla word, a number or a
    code. Codes (AB-12.5) keep their punctuation and compare without it.
  - `stem`: plurals, then -ing / -ed, with word lists for the -ie nouns (hoodies → hoodie) and irregular words.
  - `normaliseQuery` also keeps the typed text (100 characters at most) and its codes.
- `banglish.ts`: `phonKey`, the consonant-skeleton key (SI7, rewritten to say how it works). Two choices made while
  testing: a plural s is dropped (sneakers = স্নিকার্স), and there is no soft-g rule (it parted lungi from লুঙ্গি).
- `packs/banglishWords.ts`: 169 shop words, 583 spellings. Rows of one sound (চা, ঘি, দুধ, টাই) were dropped.
- `test/normalise.test.ts`: 201 tests, all passing. `tsc` is clean for these files.

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
