# Search Console — work orders

Plan: `README.md` (decisions D1–D11, screens, endpoints, Google Cloud setup, open questions). Drafted 2026-11-25.
When a WO is done: commit + push it (backend → `mint` v3; mint-tenant / mint-seo / mint-docs → their own `main`), stage
only your own files, update this Status table + `CHANGELOG.md` (make it with GS-01), the guide, the marketing website, and
put doc links on each new panel.

## Status

**Phase 0 — the user**

| WO | Title | Who | Size | Status |
|---|---|---|---|---|
| GS-00 | Google Cloud project, both APIs on, consent screen, OAuth client + redirect addresses, env on Heroku, start Google's app verification (README § Google Cloud setup) | the user | S | todo |

**Phase 1 — the tab (tenant panel + SEO app)**

| WO | Title | Repo | Size | Status |
|---|---|---|---|---|
| GS-01 | Connect / disconnect Google: `secretBox`, token refresh, `/connect`, `/callback`, `DELETE /`, `GET /` status, pretend-Google smoke | backend | M | todo |
| GS-02 | Properties + "is it verified": list sites, match to the project's domains, auto-pick, `PUT /property` | backend | S | todo |
| GS-03 | Verify a domain: DNS TXT (check DNS first) and one-click meta; `sites.add` after | backend | M | todo |
| GS-04 | Performance: totals + previous period, by day, top lists, filters, search type, 6 h cache | backend | M | todo |
| GS-05 | Indexing: sitemaps list/submit, "Is this page on Google?" with the daily counter | backend | S | todo |
| GS-06 | mint-tenant: the Search Console tab (all panels), `/google/callback` page, guide links | mint-tenant | L | todo |
| GS-07 | mint-seo: the same tab, allowlist path, Home next step + card, demo view only | mint-seo + backend | S | todo |
| GS-08 | Guide `/search-console`, privacy policy section for Google data, websites updated, Google's verification video | mint-docs + mint-webpage + mint-commerce-website | S | todo |

**Phase 2 — the user picks**

| WO | Title | Repo | Size | Status |
|---|---|---|---|---|
| GS-09 | A page's own Google numbers: SEO record page tab "Google" + pick the focus keyword from real searches (SEO-01 score) | backend + mint-tenant + mint-seo | M | later |
| GS-10 | Opportunities (rules, no AI): searches at position 8–20, pages with a low click rate for their position, pages losing clicks | backend + panels | M | later |
| GS-11 | MCP tools for the customer's own AI: `search_console_report`, `inspect_page` (+ SEO MCP, SP-13) | backend | S | later |
| GS-12 | Overview tab: a "Google search" card; weekly SEO e-mail (SP-14) gets the numbers | backend + panels | S | later |
| GS-13 | mint-commerce + mint-panel copies of the tab | both apps | S | later (Q5) |
| GS-14 | Daily copy to keep numbers past 16 months | backend | M | later (Q6) |
| GS-15 | Watch: verification lost, Google access revoked, sitemap errors → notification + e-mail (with `seoWatch`) | backend | S | later |

---

## GS-00 Google Cloud setup — the user, S

Steps in README § Google Cloud setup. Hand back: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (in `backend/.env` and
Heroku), `GOOGLE_TOKEN_KEY`, and which tenant domain to register (Q2).
- **Done when:** a test user can open the consent screen with all four scopes from localhost.

## GS-01 Connect and disconnect — backend, M

- `library/functions/secretBox.ts`: `seal(text)` / `open(sealed)` AES-256-GCM with `GOOGLE_TOKEN_KEY`; refuses to start the
  connect flow (503 `GOOGLE_NOT_SET_UP`) when client id/secret/key are missing.
- `library/functions/google/searchConsoleApi.ts`: `consentUrl(state, redirectUri)` (`access_type=offline`, `prompt=consent`,
  `include_granted_scopes=true`), `exchange(code, redirectUri)`, `accessToken(project)` (in-memory per project, refresh 5 min
  early), `google(project, path, opts)` with the error map (README § Backend), `revoke(token)`. Roots from
  `GOOGLE_OAUTH_ROOT` / `GOOGLE_API_ROOT`.
- `routes-tenant/searchConsole.router.ts` mounted at `/search-console` in `project.router.ts` (website + ecommerce projects).
  `POST /connect` → `{ url }`; state = JWT (10 min) {project `_id`, who, `redirectUri` origin from an allow-list of panel
  origins, nonce}. `POST /callback` checks the state's project = this project and the caller = who started it, exchanges,
  reads the e-mail from the id token, saves `WebsiteSettings.searchConsole`. `DELETE /` revokes + `$unset`. `GET /` status.
- `refreshToken` stripped from the site-config answer, history and MCP (`describe_website`).
- Smoke `scripts/tenancy-smoke/search-console.mjs` with a pretend Google (HTTP server in the script): connect URL has the
  scopes, bad state refused, callback stores an encrypted token (read Mongo: not the plain token), status shows the e-mail,
  revoked refresh → status `revoked`, disconnect calls revoke and clears, a view-only login gets 403 on writes.
- **Done when:** the smoke passes and a real test user connects from localhost (after GS-00).

## GS-02 Properties and verified status — backend, S

- `sites.list` → `properties[]`. Matching for each project domain `d` (www stripped): `sc-domain:d` → `https://d/`,
  `https://www.d/` → `http://…`. `status`: owner/full/restricted → `verified`; `siteUnverifiedUser` → `unverified`; none → `missing`.
- Auto-pick on connect: the first verified match of the main domain; else nothing (the tab asks).
- `PUT /property { siteUrl }`: must be in `properties`. `GET /` includes `domains[]` and `property`.
- Domains: `project.domains`; for SEO projects also `WebsiteSettings.connection.hostnames`.
- **Done when:** the smoke covers domain + URL-prefix matches, an unverified one, and a missing one.

## GS-03 Verify a domain — backend, M

- `POST /verify/start { domain, way }`: `dns` → `getToken({ site: { type: 'INET_DOMAIN', identifier: domain }, verificationMethod: 'DNS_TXT' })`
  → `{ host: '@' (domain), value }`; `meta` → `SITE` + `META` for `https://<domain>/`, writes the content into
  `seo.googleVerification` (refuses `meta` unless the site's head is printed on the server: Mint-built site, Worker way, or a
  server print seen by `testConnection`) → `{ ready: true }`.
- `POST /verify/check`: `dns` → `resolveTxt(domain)`; value missing → 409 `NOT_SEEN` + the records found (so the panel can
  say "we see these, not ours"); then `webResource.insert?verificationMethod=…`; then `PUT webmasters/v3/sites/<sc-domain:d | url>`;
  re-list, pick it. Google says no → 409 with Google's reason in plain words.
- Check first that `/site/head` (and so the Worker) prints `google-site-verification`; add it if not.
- **Done when:** the smoke goes `missing → verified` both ways on the pretend Google, and DNS-not-yet gives `NOT_SEEN`.

## GS-04 Performance — backend, M

- `GET /performance?from&to&type=web|image|video|news|discover&dimension=query|page|country|device|searchAppearance&q=&page=&country=&device=&startRow=&rowLimit=`.
  Without `dimension`: totals for the range + the same length before (two calls). With: rows (default 250, max 1,000 per call).
  Filters → `dimensionFilterGroups` (`contains` for q/page, `equals` for country/device). `dataState: 'all'`.
- `GET /timeseries` → rows by `date` + `lastDataDate` (the newest date Google returned).
- Click rate and position rounded the way Search Console shows them (1 decimal for position, %).
- Cache (D6): new `SearchConsoleCache` model in the main DB, key = hash(project, property, path, query), `expiresAt`
  TTL index 6 h. Disconnect / property change clears the project's keys.
- **Done when:** the smoke's pretend rows add up to the same totals; then on a real property the numbers equal Search
  Console's for the same dates and filters (README "Done when" of SEO-15).

## GS-05 Indexing — backend, S

- `GET /sitemaps` → address, type, `lastDownloaded`, `contents[].submitted/indexed`, `errors`, `warnings`, `isPending`.
  Also answers `ours` = the project's sitemap address and whether it's listed.
- `POST /sitemaps { path? }` → submit (default `ours`).
- `POST /inspect { url }` → refuses addresses outside the property; `inspectionResult.indexStatusResult` (verdict,
  coverageState, lastCrawlTime, googleCanonical, userCanonical, robotsTxtState, pageFetchState), `mobileUsabilityResult`,
  `richResultsResult`, `inspectionResultLink`; cache 24 h; `searchConsole.inspectCount {day, n}`, refuse at 2,000 → 429 with
  "Google allows 2,000 checks a day".
- **Done when:** the smoke covers list, submit, inspect, outside-the-site refusal and the daily limit.

## GS-06 The tab in mint-tenant — mint-tenant, L

- `src/app/analytics/page.tsx`: TABS gets `{ value: 'search', label: 'Search Console' }`; range dropdown without "Today" on
  that tab (falls back to 7 days).
- `src/app/analytics/_components/search/`: `SearchConsole.tsx` (state switch), `Connect.tsx`, `ConnectionBar.tsx`,
  `Verified.tsx` + `VerifyDialog.tsx` (shared Dialog + DialogHeader/Body/Footer, ModalFooter), `Performance.tsx` (tiles,
  chart, filters, `ConsoleTabs` tables), `Indexing.tsx` (sitemaps + inspect). Chart: the same chart component Overview uses.
- `src/app/google/callback/page.tsx`: reads `code`, `state`, `error`; posts to `/search-console/callback` with
  `redirectUri = origin + '/google/callback'`; back to `/analytics?tab=search` with a toast; `error=access_denied` → "You
  didn't allow Mint to read Search Console". The project to post to comes from the signed state (answered by the backend
  as `project` before the exchange — or decode the JWT payload without trusting it, then let the backend check it).
- RTK endpoints in `tenantApi` — grep first, names are global: `searchConsoleStatus`, `searchConsoleConnect`,
  `searchConsoleCallback`, `searchConsoleProperty`, `searchConsoleDisconnect`, `searchConsoleVerifyStart`,
  `searchConsoleVerifyCheck`, `searchConsolePerformance`, `searchConsoleTimeseries`, `searchConsoleSitemaps`,
  `searchConsoleSubmitSitemap`, `searchConsoleInspect`; tag `SearchConsole`.
- Buttons by `can('manage-site')`. `GuideLink`s to `/search-console#connect|verify|performance|indexing|disconnect`.
- Cl `Dropdown` only (no NativeSelect), PromptDialog for Disconnect, no components defined in render.
- **Done when:** browser-checked against a private backend + pretend Google (headless Chrome over CDP if the pane is
  hidden): not connected → Connect → back on the tab → verified rows → numbers → filter by a search → sitemaps → inspect →
  disconnect. Then once with a real Google test account.

## GS-07 The SEO app — mint-seo + backend, S

- Copy GS-06's files to mint-seo (same paths). Backend allowlist `/search-console` (after live).
- `_seo/SeoHome.tsx`: next step "Connect Google Search Console" until connected; then a small card (clicks + impressions
  last 28 days) linking to the tab.
- Demo login: the tab shows numbers if connected, else "Not connected to Google yet" with no button.
- Add `https://seo.tcrypt.site/google/callback` to the backend's allowed panel origins.
- **Done when:** the seo-panel smoke still passes and the SEO app's tab works end to end on the pretend Google.

## GS-08 Guide, privacy, websites — mint-docs + websites, S

- mint-docs `/search-console` (anchors `connect`, `verified`, `verify`, `performance`, `indexing`, `disconnect`, `faq`,
  `privacy`), in `guides.ts`; `/seo-connect` links to it.
- Privacy policy section on mintapp.shop: what Google data Mint reads, that it's shown only to the project's people, not
  sold or used for ads or AI training, how to disconnect — Google's "Limited Use" wording (needed for app verification).
- mint-webpage + Commerce OS website: Search Console listed with the SEO features.
- Record the verification video (Connect → consent → the numbers) and hand it to the user for Google's form.
- **Done when:** every "How this works ↗" in the tab lands on its anchor.

## Phase 2 notes

- **GS-09:** `GET /performance?page=<exact url>&dimension=query` powers the record page tab and VSeo's focus-keyword
  suggestions (top 10 searches for that page). Builder pages and template pages map to their live addresses with the same
  helper the sitemap uses.
- **GS-10:** opportunity rules: searches with position 8–20 and ≥ 50 impressions; pages whose click rate is under half the
  usual rate for their position band; pages whose clicks fell ≥ 30 % against the period before. Each row links to the
  page's SEO record.
- **GS-11:** MCP tools read through the same function; the prompt dialog gives the user's AI the numbers to suggest new titles.
- **GS-15:** add to `seoWatch.function.ts`'s daily check: status `revoked`, property no longer verified, sitemap errors > 0.
