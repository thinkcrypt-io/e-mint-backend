# Store search — overview

**Start here.** This folder is the plan for **search intelligence in every
e-commerce project** (docs/ecommerce). Shoppers get search that understands
them: typos, Bangla and Banglish, "red dress under 2000", suggestions as they
type, filters with counts, and an answer even when nothing matches. Stores get
a picture of what people search for and tools to fix bad results: synonyms,
pinned products, redirects and ranking dials. Search learns from what people
click and buy. Read this file, then `WORK_ORDERS.md`; every step is logged in
`CHANGELOG.md`.

Prefix: **SI** (decisions SI1…, work orders SI-01…).

## 1. The user's words (2026-11-10)

> plan a search intelligence feature for all ecommerce of mint, plan the whole
> feature and let me see the plan, make advanced planning.

Context: the HINT storefront (hint-site) has just got a Mango-style search page
that calls the public list with `search=`. With 260 products it already shows
the limits listed in §2.

## 2. What already exists (checked 2026-11-10)

| Piece | Where | What it does today | What this plan does with it |
|---|---|---|---|
| `search=` on every public list | `library/functions/publicRecords.function.ts` `listFilters` | One `$regex` (escaped, any case) over the model's text / select / tags / uid fields, ORed. No ranking (sort is the list's sort), no typos, no plurals, no word order, no category or brand names, no variants' SKUs, full collection scan | Stays as it is for every model. Stores get their own engine and endpoints (SI1). Products' `search=` is sent to the engine when the store has it on (SI-05) |
| Products, variants, categories, brands, collections, discounts, stock per outlet | `commerce/blueprint.ts`, `stock.ts`, `discounts.ts` | The catalogue. Product has `name`, `description`, `sku`, `barcode`, `options`, `category`, `brand`, `collections`, prices, `totalStock`, `views`, `wishlistCount` | The search document is built from these (SI4). Their saves keep it current (SI5) |
| `searchable: true` on fields | blueprint (name, sku, barcode) | Used by the panel's table search | Marks a store owner's own added fields as searchable too (SI4) |
| Product views, wishes, Customer purchases | `wishlist.ts` `viewProduct`, EC-31, `purchases.ts` | Counters on the product, purchases per customer | Ranking signals (SI14) |
| Visitor analytics: visitor id, sessions, page views, channels | WO-56 `visitorAnalytics.function.ts`, `WebsiteVisitor`, track.js | Who visited what | Search events carry the same visitor id, so a search ties to a journey and an order (SI17) |
| mint.js widgets (cart, checkout, login, my orders) | `routes-public/widgets/*` | Shop widgets for builder sites and hand-coded sites | Gains a **Search** widget (SI-07) |
| Marketing plan's event ids + order attribution | docs/marketing MK21–MK23 | `mint.track`, ads on `POST /store/orders` | Search uses the same `mint.track` path and the same attribution idea (SI18) |
| Panel ⌘K record search | WO-54 | Staff search records | Unchanged. The POS / product pickers can use the store engine later (SI-21) |
| Scheduler ticks with leases | CMS, CR-11, MK16 | Background work | Rebuilds, nightly rollups and learning run on the same pattern |
| HINT and Live Fresh storefronts | hint-site `SearchView.tsx`, live-fresh-frontend | Call `listProducts({ search })` | Switch to `/store/search` + suggestions (SI-08) |

**What breaks today**, tried on HINT's 260 products:

- "sneker" and "brcelet" find nothing, because there is no typo tolerance.
- "shirts" misses "Oxford Shirt", because plurals don't match.
- "shirt oxford" misses it, because the words must sit together in that order.
- "gold ring" finds nothing even though Ring is a category. Category and brand names aren't searched.
- "শাড়ি" or "shari" never find "Jamdani Saree".
- "dress under 2000" reads "under 2000" as words to match.
- A match in the description ranks the same as a match in the name. Out-of-stock items rank like in-stock ones.
- Every search scans the whole product collection.
- Nobody knows what shoppers searched for, or which searches found nothing.

## 3. Decisions

| # | Decision |
|---|---|
| SI1 | **Its own engine, for stores only.** The generic `search=` stays for every model in every project. E-commerce projects get a search engine (`library/functions/commerce/search/`) behind new store endpoints (§6). The rest of Mint is untouched. |
| SI2 | **One search collection for the whole platform**, not one per store: `SearchDoc` (platform model, `library/models/tenancy/searchDoc.model.ts`), one document per product, keyed by `project`. Every query is filtered by project first. This adds **no collections per store** (the 500-collection cap, see the Atlas memory note and WO-43). It also lets one Atlas Search index serve every store later (SI3). |
| SI3 | **Swappable drivers behind one interface.** `SearchDriver = { index(docs), remove(ids), query(plan) → hits, suggest(plan) → hits }`. **`native` is built first**: it runs on plain MongoDB anywhere, including local dev and any Atlas tier. Candidates come from indexed word, prefix and trigram arrays, then ranking happens in Node (SI10). **`atlas`** (Atlas Search `$search` with fuzzy, autocomplete and facets, one index over `SearchDoc`) is **parked** (SI-22): production is on a Flex / shared tier (the user, 2026-11-10), where Atlas Search runs on shared resources with low index limits. The native driver is the production engine. SI-22 comes back only if the cluster moves to a dedicated tier or stores outgrow SI19's budgets. Ranking, synonyms, rules and analytics sit above the driver, so switching driver changes speed, not behaviour. No outside service (Algolia, Typesense, Meilisearch): no extra bill and no data leaving Mint. |
| SI4 | **What a search document holds.** `project`, `product`, `status`, plus fields, each with a weight: **name** (10); **brand** name (6); **category** names, the category's own name and its parents' (5); **collection** names (3); **option values** such as "Red" or "XL" (4); **SKUs and barcodes** of the product and all its variants (exact match only, sends you straight to that product, SI8); **tags / keywords**, a new optional product field (5); **description** (1, first 2,000 characters, tags removed); and any owner-added field marked `searchable` (2). Each field is stored as normalised words (SI6), word prefixes 1–15 characters long (for as-you-type), and trigrams (for typos). The document also holds the **facet values** (category ids with their ancestors, brand, price, sale price, on sale, in stock online, every option name and value) and the **signals** (SI14). |
| SI5 | **Kept current by themselves, never by hand** (built in SI-03). Three ways, fastest to safest:<br>• **Touches:** a product, variant, category, brand or collection saved or deleted from the panel or over MCP (`fireCommerce`), every stock move (`stock.ts` `move`) and every discount that reaches products (`applyDiscounts`) queue the products they affect in `SearchQueue` (one row per product, deduplicated). A category change reaches the products of the categories under it too. A tick every 5 s claims a store's rows with a lease (a row touched again while it is being built loses the claim and is built once more), builds them and bumps the version.<br>• **The sweep**, every 2 minutes: whatever was updated since the last sweep (products, variants, categories, brands, collections) is queued. This catches what no hook sees: the public API, bulk imports, engine updates. A store never indexed is rebuilt by its first sweep, so existing stores need no migration.<br>• **The drift check**, daily: findable products (active, not archived) against documents, judged only when nothing is queued. A store that doesn't match is rebuilt. This catches deletes made outside the panel.<br>`rebuildSearch(store)` (one at a time per store, a lease on the settings) builds every product again and drops the documents it didn't write. It runs from `POST /commerce/search/rebuild` (managers, 202, in the background), from `scripts/searchRebuild.js` (dry run, then `--apply`, optionally one project id), and by itself as above. `GET /commerce/search/status` gives documents against products, queued, the version, the last rebuild and the last drift check (Store settings → Search, SI-06). State lives in `CommerceSettings.search.index`. `SEARCH_INDEX=off` keeps a server from running the tick and sweep. The nightly numbers (sold in 30 days, learned) are set only on insert, so a rebuild never wipes them. |
| SI6 | **One normaliser for documents and queries** (`normalise.ts`, unit-tested):<br>• Lower case, and Unicode NFKC.<br>• Accents removed (é → e).<br>• Bangla digits ০–৯ become 0–9.<br>• Zero-width joiners removed. Bangla spelling variants unified: য় / য়, ড় / ড়, ঢ় / ঢ়, ৎ / ত্.<br>• "t-shirt", "t shirt" and "tshirt" are one word. Hyphens and dots inside SKUs are kept.<br>• Units joined to their numbers ("32 inch" → "32inch", "500 ml" → "500ml").<br>• A light English stemmer: plurals, -ing, -ed ("shirts" → "shirt", "dresses" → "dress").<br>No stemming for Bangla. Typos and synonyms cover it. |
| SI7 | **Banglish and Bangla meet in the middle** (built in SI-02). Every word also gets a **Banglish key**: its consonant skeleton, the sounds both scripts write the same way. Vowels are dropped because Banglish spells them every which way; a word that starts with a vowel keeps one class letter, 'a' or 'i'. A plural s is dropped too. So "শাড়ি", "shari", "sari" and "saree" all become `sr`; "পাঞ্জাবি", "panjabi" and "punjabi" become `pnjb`; "ওয়াচ" and "watch" become `ac`. The key is lossy on purpose ("shirt" and "short" share `srt`), so it is only a weak match (0.6, SI10), never ahead of an exact or stemmed one. Where the sound rules part two spellings of one word (ব্লাউজ / blouse, চার্জার / charger, চুড়ি / chudi), **the starter list** (`packs/banglishWords.ts`) mends it: 169 shop words with 583 spellings in clothes, shoes, jewellery, beauty, home, electronics and grocery, and every spelling in a row gets the row's key. Only spellings of one word go there. Words with the same meaning (সোনা / gold) are synonyms (SI13). Words of one sound (চা, ঘি) get no key and match as plain words. |
| SI8 | **Query understanding before searching** (`understand.ts`). It turns the words into a **plan**: words to match, filters, a sort and a redirect.<br>• **SKU / barcode:** an exact hit goes straight to the product, like a scan at the POS.<br>• **Price:** "under 2000", "below ৳1500", "less than 1k", "1000-2000", "2k to 3k", "৳500 এর নিচে" become a price filter.<br>• **Option values:** "red", "XL", "size 42" are matched against the store's own option values and become a filter, but only if products carry them. Otherwise they stay as words.<br>• **Brand and category:** "nike shoes" becomes brand Nike plus the word "shoes", or category Shoes when "shoes" is a category name. Category hits boost results instead of filtering, so "ring" still finds ear-rings ranked lower.<br>• **Sort words:** "cheapest", "newest", "best selling".<br>• **Stop words** (the, for, a, এর, জন্য) are dropped, unless the query is nothing but stop words.<br>The plan is returned with the results (`understood: { price: { lte: 2000 }, color: 'red' }`), so storefronts can show it as chips the shopper can remove. |
| SI9 | **Typos by length**, Damerau–Levenshtein: no typos allowed under 4 characters, 1 for 4–7, 2 for 8 or more. The first letter must match, except for a swap of the first two letters. Candidates come from trigrams. Each typo halves that word's score. SKUs, barcodes and numbers never allow typos. Typo strength is a store setting: off / normal / loose. |
| SI10 | **Relevance, then business, in the open.** Score = Σ over query words of (best field weight × match quality), where quality is exact 1.0, stem 0.9, prefix 0.7 (last word only, as you type), synonym 0.8, typo 0.5 / 0.25 and phonetic 0.6. Then: **× coverage** (share of the query's words found, squared, so all-words matches come first); **+ phrase bonus** when the words sit together in the name; **× business multiplier** (SI14); **× merchandising** (SI13). Every hit can return `explain` (SI-17's Try search shows it): *"name exact 'shirt' 10 · category 'Shirts' 5 · in stock ×1.0 · sold 34 in 30 days ×1.15"*. |
| SI11 | **Suggestions as you type** (`/store/search/suggest`, one call per keystroke after 120 ms on the client). The answer holds up to 6 **query suggestions**, up to 4 **products** (picture, name, price), up to 3 **categories** and up to 2 **brands**.<br>• Query suggestions come from this store's own popular searches that returned results (SI17), then product, category and brand names. They are never other stores' searches, and never a search fewer than 3 different visitors made, so one person's typing is never shown to others.<br>• It uses prefix and trigram matching only.<br>• Target: under 80 ms on the server at p95. |
| SI12 | **No dead ends.** When a search finds nothing, the engine tries again, looser, in this order: (1) typos loose; (2) drop the least important word, one at a time (the rarest word stays); (3) words matched across description and options. The page then says *"No exact results for 'red velvet saree'. Showing results for 'velvet saree'"*. If there is still nothing, it returns **"Did you mean"** (the nearest word in the store's own vocabulary) plus popular products from the categories the query hinted at, or the store's best sellers. Every zero-result search is logged (SI17). |
| SI13 | **Merchandising rules, per store** (builder models, SI20):<br>• **Synonyms:** two-way groups (sneakers = trainers = keds) or one-way (jutta → shoes). They come with starter packs (English fashion, electronics, grocery, Bangla / Banglish) that the owner switches on; they are not installed silently.<br>• **Redirects:** a query sends the shopper to a URL ("return", "refund" → /returns; "eid" → the Eid collection page).<br>• **Rules:** on a query (exact or contains) or on a category page, do one of these: **pin** products in order at the top, **boost** (× 1.5 / 2 / 3) or **bury** (× 0.5 / 0.2) by product, brand, category, collection or "on sale", **hide** products, or **filter** to a collection. A rule has an optional start and end date ("Eid week: boost the Eid collection"). Rules apply in this order: hide, filter, pin, boost/bury. |
| SI14 | **Business signals, with dials.** Multiplier = in-stock × popularity × freshness × sale × learned:<br>• **In stock online** (MK26's online outlets): **each store decides** (the user, 2026-11-10) in Store settings → Search: **Show** (the default; listed after the in-stock products, × 0.3) or **Hide** (left out of search, suggestions and category pages). Products the shopper reaches by SKU or barcode are always shown, marked out of stock.<br>• **Popularity:** log-scaled units sold in 30 days (from orders), views in 30 days, and wishlist count, mixed 0.6 / 0.25 / 0.15. Capped at × 1.3, so a best seller never beats a better text match.<br>• **Freshness:** × 1.1 for 14 days after the product is created.<br>• **On sale:** × 1.05.<br>• **Learned:** SI16.<br>Store settings → Search shows each one as a **dial** (off / low / normal / high). A sum like "relevance × 0.8 + sales × 0.2" means nothing to a shop owner, and a dial does. Signals are worked out nightly into the search document, with sales also updated on each order, never at query time. |
| SI15 | **Filters with counts, from the results** (`facets=` on `/store/search`): category (as a tree, with counts that include sub-categories), brand, price (5 buckets from the results' own spread, rounded to friendly numbers: 0–500, 500–1,000…, plus a min–max slider range), each option (Size, Colour…, values ordered by the store's own option order), in stock, on sale. Selected filters narrow the results. Counts for one filter group ignore that group's own selection (the standard rule), so the shopper can see the other sizes. Category pages use the same endpoint with `category=` and no words, so category pages get the same filters. |
| SI16 | **Learning from clicks and orders, safely.** Each (query, product) pair keeps decayed counts of how often it was shown, clicked, added to the cart and bought (half-life 30 days). Click rate is corrected for position, because position 1 gets clicked more anyway. Once a pair has ≥ 20 impressions from ≥ 5 visitors, it gets a learned boost between × 0.85 and × 1.25. This is never enough to bring a product with no text match into the results. The engine also **suggests synonyms** from reformulations: a search for A with no click, then a search for B within 60 s in the same session with a click, seen from ≥ 5 visitors, becomes a synonym suggestion "A → B" that the owner can accept or dismiss on the Insights page. Nothing learned is ever applied without these thresholds, and a store can switch learning off. |
| SI17 | **What is logged, and privacy.**<br>• **Raw events** go to `SearchEvent` (platform, keyed by project, TTL 90 days): search (query, normalised query, plan, result count, top 20 product ids, page, filters, duration), suggestion click, result click (product, position), add to cart (when the cart call carries the search id), and order (from attribution, SI18). Each event has the visitor id (WO-56) and a search id.<br>• **Queries are cleaned before they are stored:** anything that looks like an email, a phone number (BD or E.164) or a card number becomes `[email]`, `[phone]` or `[number]`.<br>• **No IP** in search events. Analytics already handles IPs under its own setting.<br>• A nightly rollup writes `SearchQueryDaily` (store × day × normalised query: searches, visitors, zero results, clicks, add to cart, orders, revenue) and keeps it 13 months, plus `SearchPair` (SI16). |
| SI18 | **Search revenue, counted the same way as campaigns.** The search id is kept in the browser for the session (mint.js, or the storefront's own code). It is sent on add to cart (`searchId` on the cart line) and with the order (`POST /store/orders` `search: { ids }`, next to MK's `ads`). An order line counts as **from search** when its product was clicked in a search in the 24 hours before the order, in the same session or by the same visitor. Last search wins. Revenue counts that line's total, never the whole order. |
| SI19 | **Fast and cheap by design:**<br>• **Mongo indexes:** `{ project, words }`, `{ project, prefixes }`, `{ project, grams }`, `{ project, status, 'facets.category' }`.<br>• **Candidate cap:** at most 2,000 candidates scored per query. The rarest query word is fetched first.<br>• **Caches:** a per-dyno LRU of 30 s for identical queries and suggestions, keyed by store, plan and the store's index version. The version goes up on every re-index, so there are no stale results. Storefront `Cache-Control: max-age=30`.<br>• **Rate limits** like the other store routes: search 120/min and suggest 600/min per IP.<br>• **Budgets:** search p95 under 250 ms and suggest p95 under 80 ms for stores up to 20,000 products on the native driver. Bigger stores are the reason for the atlas driver (SI3).<br>• A `search-bench.mjs` smoke test seeds 20k products and asserts the budgets. |
| SI20 | **Data where it belongs.** Things people **see and edit** are **builder models in the store blueprint**, locked like Orders (EC4 / EC5), reaching built stores through `upgradeStore`: Search synonyms, Search redirects, Search rules. **Engine data** is platform models keyed by project, never in the store's own collections, never in the builder: SearchDoc, SearchQueue, SearchEvent, SearchQueryDaily, SearchPair. Settings go in `CommerceSettings.search` (§4). |
| SI21 | **Who can do what.** Managers (whoever may edit Store settings; EC-12 Owner / Store manager when it lands) can change settings, dials and learning, and can rebuild. Whoever may edit Products can edit synonyms, redirects and rules. Insights can be read by whoever may read Orders. |
| SI22 | **AI goes through the store owner's own AI (MCP), never Mint's server** (the standing rule, [[ai-via-mcp-not-api]]). MCP tools let the owner's AI:<br>• read Insights (top searches, zero results, low click rate);<br>• draft synonyms, redirects and rules, saved as **suggestions** that the panel shows for one-tap approval;<br>• fill products' **keywords** from their names, descriptions and pictures (the "enrich" job);<br>• run Try search with explain.<br>The Insights page has a "Fix with your AI" prompt to paste, like PDF templates. Shopper-side search never calls an AI service. The only model is SI23's small one on our own servers, so a search costs nothing extra. |
| SI23 | **Search by meaning, with a small model on Mint's own servers** (the user, 2026-11-10). No outside AI service and no key, so SI22 still holds: the model is a fixed open-source file that runs inside the backend, not an AI provider.<br>• **The model:** a small multilingual sentence-embedding model that understands Bangla and English (`paraphrase-multilingual-MiniLM-L12-v2`, quantised ONNX, about 120 MB, 384 numbers per text). It runs through `@huggingface/transformers` on onnxruntime-node, in a worker thread so it never blocks requests. The model file ships with the backend build and is never downloaded at run time.<br>• **When products are indexed** (SI5): each product's name, category, brand, options and keywords become one vector. It is saved in SearchDoc as 384 int8 numbers (about 0.4 KB a product). This happens in the background tick, about 15 ms a product on a CPU.<br>• **When a shopper searches:** the query becomes a vector (about 20 ms), cached per store for 10 minutes. It is used in two places only. (1) It **re-ranks the top 50** text results: meaning similarity is mixed in at 25%, so a text match always stays a match. (2) For **zero results**, the step after SI12's loosening: the nearest products by meaning, with a similarity floor of 0.45 so unrelated products never show. It finds "party wear" → gowns and sequin dresses, and "something for my mother" → saree, shawl.<br>• **Suggestions stay text-only**, to stay under 80 ms.<br>• **Cost and safety:** memory goes up by about 250 MB per web dyno, so a **Standard-2X dyno (1 GB)** is needed. The model loads lazily on the first meaning search. If it can't load or answers too slowly (more than 150 ms), search goes on without it and logs it. A platform switch (`SEARCH_SEMANTIC=off`) and a per-store setting turn it off. `search-bench.mjs` checks the extra time stays under 40 ms at p95. |
| SI24 | **Every storefront gets it the same way:**<br>• **mint.js Search widget** for builder sites and pasted snippets: a header icon, an overlay with suggestions, and a results page with filters. It takes the store's look from the widget settings (W-03).<br>• **The public API** for hand-coded sites: `/store/search`, `/store/search/suggest`, `/store/search/events`, with typed examples on Website setup (WO-55).<br>• **A site-builder block**, "Search results", with a "Search box" element.<br>• **HINT and Live Fresh** switched over as the reference storefronts. |
| SI25 | **Explained everywhere** (the standing rule): a mint-docs guide `/store/search` with #anchors on every card and dialog, the Website setup page's search section, and the marketing website updated with each phase. |

## 4. New and changed models

★ = core (locked), ⚙ = engine-owned (read-only).

**Store blueprint (builder models):**

| Model | Route | Fields |
|---|---|---|
| Product (changed) | `products` | + keywords (tags, optional, `searchable`), ⚙searchClicks30, ⚙sold30 (shown in the table as "Searched / Sold, 30 days") |
| Search synonym | `search-synonyms` | ★kind (two-way / one-way), ★words (tags; one-way: ★from → ★to), active, ⚙source (you / starter pack / suggested / your AI), ⚙pack |
| Search redirect | `search-redirects` | ★queries (tags), ★match (exact / contains), ★url, active, start, end, ⚙hits |
| Search rule | `search-rules` | ★name, ★when (query exact / query contains / category page / every search), ★value, ★action (pin / boost / bury / hide / filter), ★target (products / brand / category / collection / on sale), ★targets, strength, order (for pins), start, end, active, ⚙hits |

**Platform models** (`library/models/tenancy/`, keyed by `project`):

| Model | TTL | Fields |
|---|---|---|
| SearchDoc | — | project, product, status, fields `{ name, brand, category, collection, option, keyword, description, custom }` each with `{ words[], prefixes[], grams[], phon[] }`, codes[] (SKUs and barcodes), facets `{ categories[], brand, price, salePrice, onSale, inStock, options: { name: values[] } }`, signals `{ sold30, views30, wishes, createdAt, learned }`, card `{ name, slug, image, price, salePrice, compareAtPrice }` (the card is returned as it is, so no populate at query time), version |
| SearchQueue | — | project, product, reason, at (unique on project + product) |
| SearchEvent | 90 days | project, type, searchId, visitor, session, q, nq, plan, results, top[], page, filters, product, position, ms, at |
| SearchQueryDaily | 13 months | project, day, nq, sample q, searches, visitors, zero, clicks, carts, orders, revenue |
| SearchPair | 180 days without use | project, nq, product, shown, clicked, carted, bought (decayed), updatedAt |
| SearchSuggestion | — | project, kind (synonym / redirect / rule), payload, evidence, source (learned / your AI), status (new / accepted / dismissed) |

**`CommerceSettings.search`:**

```ts
search: {
  enabled: boolean,                  // on for new stores; existing stores opt in from the panel (SI-05)
  typos: 'off' | 'normal' | 'loose',
  outOfStock: 'show' | 'hide',      // the store decides (SI14); show = after in-stock products
  semantic: boolean,                 // SI23, on by default where the platform has it
  dials: { popularity, freshness, sale, learned: 'off' | 'low' | 'normal' | 'high' },
  learning: boolean,
  banglish: boolean,
  facets: string[],                  // which filters show, in order: category, brand, price, option:Size…
  suggest: { queries: boolean, products: number, categories: number },
  version: number,                   // goes up on each re-index (cache key, SI19)
}
```

## 5. The engine

```
library/functions/commerce/search/
  normalise.ts       SI6: words, stems, units, Bangla fixes (pure, unit-tested)
  banglish.ts        SI7: phonetic key both ways (+ packs/banglishWords.ts starter list)
  document.ts        SI4: product (+ variants, category tree, brand, stock, discount) → SearchDoc
  indexer.ts         SI5: queue, leased tick, rebuildSearch, nightly drift check
  understand.ts      SI8: words → plan (codes, price, options, brand / category, sort, stop words)
  synonyms.ts        SI13: expand plan words (store's groups + packs), cached per version
  drivers/native.ts  SI3: candidates from words / prefixes / grams (rarest first), facet counts by aggregation
  drivers/atlas.ts   SI-22 (parked): $search compound + facet; same output
  semantic/          SI23: worker thread + model load, embed(text), int8 pack, cosine re-rank + nearest
  rank.ts            SI10 / SI14 / SI16: score, coverage, phrase, multipliers, explain
  rules.ts           SI13: redirects, hide / filter / pin / boost / bury, schedules
  recover.ts         SI12: loosen, did-you-mean, fallbacks
  suggest.ts         SI11
  facets.ts          SI15: buckets, the "ignore own group" counts
  events.ts          SI17: clean, log, attribute (SI18)
  rollup.ts          SI17 / SI16: nightly daily + pairs + signals + synonym suggestions
  packs/             starter synonym packs (json)
  index.ts           search(store, req) / suggest(store, req): understand → synonyms → rules → driver → rank → recover
```

**How a query runs:**

```
"red dresss under 2k"
  → normalise   [red, dresss, under, 2k]
  → understand  words [dresss]  filters { option.Colour: red, price ≤ 2000 }   (red found among the store's Colour values)
  → synonyms    dresss ~ dress (typo 1)  + group {dress, frock, gown}
  → rules       query contains "dress": boost collection "Eid" ×1.5 (until 2026-11-20)
  → driver      candidates ≤ 2,000 where project, status active, facets match, words/grams hit
  → rank        relevance × coverage × business × rules, top page; facets counted
  → recover     (only if 0)
  → answer      { doc, total, facets, understood, correctedTo: "red dress under 2k", searchId, explain? }
```

**Hooks into what exists:**
- The `commerce/hooks.ts` product / variant / category / brand / collection / discount saves, and `stock.ts` `move`, call `searchQueue.touch(productIds)` after the write, in the background.
- `orders.ts` `createWebsite` calls `events.attributeOrder`, and also bumps `sold30` for the products ordered.
- `upgradeStore` adds the models and settings, then queues a rebuild.
- `publicRecords` `listFilters`: for `products` in a store with search on, `search=` is answered by the engine (relevance order) unless `sort=` is given. Old storefronts get better results without code changes.

**Public routes** (project by key or host, as today):

| Route | Does |
|---|---|
| `GET /store/search?q&page&limit(≤60)&sort&category&brand&price[gte]&price[lte]&option.<Name>=<v>&inStock&onSale&facets=1&explain=1` | Search or a category page. Returns `doc` (cards), `total`, `facets`, `understood`, `correctedTo`, `redirect`, `searchId`. `explain` works only with a server key |
| `GET /store/search/suggest?q` | SI11 |
| `POST /store/search/events` | `{ searchId, type: click / suggestion / cart, product, position }`, batched with `sendBeacon`, rate limited |
| `GET /store/search/popular` | The store's top searches this week (for an empty search page, "Trending"), with the same 3-visitor floor |
| `POST /store/orders` | Gains `search: { ids[] }` (SI18) |
| `mint.js` | `Mint.search.open()`, `Mint.search.track(...)`; the widget emits `search`, `view_search_results` to the MK pixels when they are on |

## 6. The panel (mint-tenant)

Sidebar: the store gets a **Search** group (after Products): Insights,
Synonyms, Redirects, Rules, Try search. Settings live in Store settings → Search.

- **Insights** (the home of the feature):
  - Totals for 7 / 30 / 90 days: searches, visitors who searched, the share of sessions with a search, zero-result rate, click rate, conversion from search, **revenue from search**.
  - A chart over time.
  - Tables:
    - **Top searches**: searches, click rate, orders, revenue.
    - **No results**: the worst first, with one-tap fixes: *Add a synonym* · *Redirect* · *Create the product* (opens a new product with the name filled).
    - **Low click rate**: people search, results show, nobody clicks. The fixes are *Pin products*, *Boost*, and *Try search*.
    - **Trending**: up the most against last week.
    - **Suggested fixes** (SI16 learned, SI22 from your AI): Accept / Dismiss.
  - Click a query to open it: its results as shoppers see them now, clicks by position, what people searched next, and the rules that touch it.
  - "Fix with your AI": copies a prompt and links to Connect your AI (MCP).
- **Synonyms:** a table with the starter-pack switches at the top, "Test" next to each group (a mini search), and a Source column.
- **Redirects:** a table. Opening one shows its hits.
- **Rules:** a list with on / off and dates. The editor works as a sentence: *When the search **contains** "eid" → **boost** collection **Eid** **×2** from 1 Nov to 20 Nov*. A live preview below shows the results before and after, side by side.
- **Try search:** a search box with the store's real results, a toggle per result showing the explain breakdown (SI10), what the engine understood (chips), the rules that fired, and the time taken. Results are the same for every shopper (the learned
  signal is store-wide), so what you see here is what they see.
- **Store settings → Search:**
  - Search on / off, typos, out of stock, Banglish.
  - The dials, with one-line explanations.
  - Learning on / off.
  - Filters to show, by drag order.
  - Suggestions.
  - **Rebuild** (with the last build time and the document count against product count).
- **Product page:** a "Search" card: top queries that led here, clicks, the rules that touch this product, and its keywords.
- **Dashboard:** a widget with revenue from search and the top no-result search this week.

## 7. Out of scope for now

- Personal results: per-shopper ranking from their own history beyond the session. It needs consent rules first (MK8).
- Voice search and searching by image.
- A/B tests between ranking settings. Insights gives the before and after, and a real split test is a later plan.
- Searching blog posts or pages next to products. A redirect covers "returns" and the like. Content search could reuse the engine later, with a `kind` on SearchDoc.
- Search across stores, such as a Mint marketplace.
- Builder (non-store) projects. They keep `search=`. SI1 keeps the engine store-only, but SearchDoc's `kind` leaves room.

## 8. The user's answers (2026-11-10)

1. **Atlas tier:** production is on **Flex / shared**. The native driver is the production engine, and SI-22 (Atlas driver) is parked (SI3). SI2's single search collection matters even more under that tier's 500-collection cap.
2. **Search by meaning:** use **a small model on our own servers** (SI23, SI-19). Web dynos need 1 GB (Standard-2X), and it switches off cleanly.
3. **Banglish:** in the **first release** (SI7, SI-02).
4. **Out of stock:** **each store decides**, show or hide (SI14). The default is show, after the in-stock products.
5. **Existing stores** (Live Fresh / Verte, HINT): **we switch them on after a check**. New stores get search on. For each existing store: `upgradeStore`, rebuild, the relevance suite on its own catalogue, then switch on (SI-20).
6. **Retention:** raw search events 90 days, daily totals 13 months (SI17).
