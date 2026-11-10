# Store search — changelog

## 2026-11-11 — SI-09 Query understanding

- New: `commerce/search/understand.ts`, and `vocab.knows` (option values as written, brands, categories), gathered by
  both drivers. `rank` takes lifts. The engine applies understood filters under the shopper's own, browses when only a
  price or sort is left, relaxes a brand or size that leaves nothing, and names the product for a whole-query SKU.
  The answer has `understood`. Suggestions read past prices and sort words.
- Decision (README SI8): a size or colour as a plain word lifts (× 1.3); named ("size m", "colour red") it filters.
  A category in the words lifts (× 1.15).
- Fixed while testing: "polo size m" took "polo" as the value of a "value size" phrase. Both phrasings are now tried,
  keeping the one whose value the store sells.
- Tests: 48 understanding + 13 engine (324 → 385 in all), `search-api.mjs` 51 checks, and parity holds. The guide's
  "Search on your website" lists what it understands and the `understood` block.

## 2026-11-11 — SI-08 Reference storefronts

- HINT search page on the store's engine, with typo note, suggestions, category chips with counts, in stock and sort
  (hint-site 2896b6d). Live Fresh's search page and header box ranked by the store (a1c54e9). Both fall back to their
  old search where `/store/search` doesn't answer, so pushing before the backend deploy changes nothing for shoppers.
- Found while testing:
  - Live Fresh fetches on the server, and Node resolves `localhost` to IPv6, so a local test backend needs
    `127.0.0.1`.
  - Live Fresh loads at most 100 products, so a ranked product beyond those isn't shown. That's fine for Verte's
    32 and noted for bigger stores.
- mint-docs: the Next.js example (37920bb).

## 2026-11-11 — SI-06 Store settings → Search

- mint-tenant `/store/settings/search` (bb94551): one card for the settings (search on, typos Off / Normal / Forgiving,
  Bangla and Banglish, out of stock Show them last / Hide them, the four lifts Off–High, learn from shoppers, Back to
  the defaults, Undo) and one for the search index (searchable of active, waiting, last full build and why, last
  checked, Rebuild with progress, a note when the numbers differ, a failed rebuild's reason).
- The menu item "Search settings" (backend `tenantNav.function.ts`).
- Guide sections `store-search-settings` and `store-search-index` (mint-docs e4cd711). The marketing changelog entry
  gained a line (e90fb2d).
- Checked in headless Chrome against a test backend, signed in as a made-up @example.com owner:
  - the page renders with no console errors at 1440 and 390 px;
  - Typos → Off updates its hint, and Save stores `typos: off` and clears Undo;
  - Rebuild finishes with "from here";
  - a store with `search.enabled` unset shows "Not switched on yet".

## 2026-11-11 — SI-05 Public search API

- **Public routes:** `GET /public/api/store/search` and `/store/search/suggest` (`routes-public/public.router.ts`), with the
  query string, names and settings in `commerce/search/http.ts`.
  - Category and collection filters go by web address or id. A gone one filters to nothing rather than to
    everything.
  - Brands go by name. Price ranges, `option.Size=M` / `option[Size]=M` (any case), in stock and on sale.
  - Counts come named.
  - `explain` only with a server key (`no-store`); other answers are `public, max-age=30`. 120 / 600 a minute.
  - 400s in plain words for a bad sort or price. 404 `search_off` when a store switched search off.
- **SearchDoc** gained `facets.labels` (option values as written). Filters and counts gained collections. Option counts
  are `{ name, values: [{ value, label, count }] }`.
- **Settings:** `GET/PUT /tenant/api/p/:id/commerce/search/settings` (checked, unknown keys refused). New stores get
  `search.enabled: true` at setup.
- **The Products list:** `?search=` is ranked by the engine when it's the only filter, there's no sort, the limit is
  60 or less and the store is switched on by name.
- **Docs and panel:**
  - mint-docs: the store guide's **Search on your website** (`store-search`).
  - mint-tenant: Website setup → **Store search** (search, suggestions and category-page code with the key filled in),
    plus GuideLink.
  - mint-webpage: changelog entry.
- **Tests:** smoke `search-api.mjs` (46 checks, all passing). `search-index.mjs` and `search-engine.mjs` (parity)
  still pass, and the unit tests are 324.

## 2026-11-11 — SI-04 The engine (native driver + ranking)

- New in `commerce/search/`:
  - `settings.ts` (defaults: typos normal, out of stock shown last, dials normal, learning on, Banglish on);
  - `vocab.ts` (the store's words with document counts, trigram index, Banglish keys; typos by length with the
    first letter kept; completions; cached a minute, refreshed in the background);
  - `rank.ts` (scores, multipliers, explain);
  - `facets.ts` (filters, counts that ignore their own group, friendly price ranges);
  - `drivers/types.ts`, `drivers/native.ts`, `drivers/memory.ts`;
  - `engine.ts` (search, browse, suggestions, a 30-second cache keyed by the index version).
- `document.ts` now shares `optKey` with the filters.
- Found while testing:
  - The Banglish key let "vanila" match "bangle" (they share a key) ahead of the typo "vanilla", so the key now
    only matches across scripts or for words with no near spelling.
  - A swap of two letters ("shrit") broke too many trigrams to find "shirt", so the trigram threshold was eased.
  - Three of my own expected results were wrong: "gold watch" rightly ranks "Rose gold watch" first, there are
    seven "studs" and nine "camera" names.
- Speed: on 20k products, two-word queries with few whole matches took 250 ms at p95, so partial matches are now
  capped at 600 and p95 is 129 ms.
- Tests: `test/engine.test.ts` (107, among them the 77-query relevance suite over the HINT catalogue in
  `test/fixtures/hint-catalogue.json`; 324 search tests in all), `scripts/tenancy-smoke/search-engine.mjs` (parity
  on 30 queries + browse + suggestions, then the bench). `search-index.mjs` still passes.

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
