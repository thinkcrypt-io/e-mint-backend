# Work Order — Vercel Console

**Scope:** a full Vercel management console inside the admin, built to the same
shape as the Heroku console: multiple stored accounts, searchable projects,
environment variables (read + edit + download), deployments (create, redeploy,
promote, cancel), domains, account usage, and the resources each project consumes
— individually and rolled up across the account.
**Target account:** one **personal Vercel account on the Hobby plan** — no team.
That constrains the plan in four specific ways; see *The account this is built
against*.
**Status:** Built. Phases 0–6 and 8's automated gates are done, Phase 7 was
dropped on evidence. The only item left is VWO-37, the manual pass — it needs a
person clicking through real data.
**Audit date:** 2026-09-22

---

## Implementation status

| Phase | State |
|---|---|
| 0 — Confirm before building | **done** — VWO-01 run against the live account, all answers below; VWO-02 done and re-seeded |
| 1 — Foundation | **done** (VWO-03…08) |
| 2 — Service layer | **done** (VWO-09…13) |
| 3 — Controllers, routes, permissions | **done** (VWO-14…17) |
| 4 — Account page | **done** (VWO-18…23) |
| 5 — Project page | **done** (VWO-24…33) |
| 6 — Docs page | **done** (VWO-34) |
| 7 — Runtime logs | **dropped** — the endpoint 404s on this account (VWO-01 #4) |
| 8 — Verification | VWO-35 gates pass; VWO-36 greps clean; **VWO-37 outstanding** |

Verified by execution, not by reading:
- `npx tsc --noEmit` clean; `npm run build` succeeds.
- **70 unit tests pass** (49 new): `toVercelError` mapping including the
  401-vs-403 distinction, `withTeam` parameter building, `pagedGet` cursor
  handling and the `pagedGetAll` loop guard, `diffEnv` across targets and
  branches, `toEnvFile` round-trips through the installed dotenv, cache team-key
  isolation, and the usage arithmetic.
- Server boots and registers **27 Vercel routes**; every one answers 401
  unauthenticated, as does the generic list.
- VWO-36 greps: exactly one `select('+apiToken')` (`resolveToken.ts`), zero
  `runtime-logs` references, `decrypt` confined to `lib/vercel/env.ts`.
- `admin`: `npx tsc --noEmit` clean, `npm run build` succeeds, `/vercels` and
  `/vercels/[id]` in the route manifest.
- The Usage tab and all three resource-panel states rendered and reviewed in
  both colour modes through a temporary `/docs/vercel-preview` route (the
  `AuthWrapper` workaround), since removed. Two defects it caught that neither
  `tsc` nor `next build` would: the plan notice read "Log drains **is** not
  available", and the `at cap` badge sat beside Minutes when the cap counts
  deployments.
- All 7 permission guard strings cross-check against the seeded Permission
  options — none is ungrantable.

**Seeded on 2026-09-22:** both Vercel Permission documents, the two sidebar
items, and a re-seed of the Heroku permissions to land VWO-02's fix.

**Resolved without an answer:** VWO-01 #9 no longer blocks anything. `redeploy`
in `lib/vercel/deployments.ts` tries the documented `{ deploymentId }` shape and,
on a 400/422 about the request body, falls back to deploying the same git ref the
original was built from. `usedFallback` rides on the response, so the UI says
which path ran rather than quietly differing. A live redeploy will settle which
one is used; neither outcome is a bug.

**Still needs a human:**
- VWO-01 #10: does `POST /v10/projects/{id}/promote/{deploymentId}` move the
  production alias? Built and shipped; needs one real promote to confirm.
  **Use a throwaway project, never a storefront.**
- VWO-01 #7b: the daily deployment cap and the response when it is hit. Needs an
  account that actually reaches the cap.

---

## VWO-01 answers — measured 2026-09-22

Run against the live account (`aiasifistiaque`, 92 projects). **Four of this
document's assumptions were wrong, and the code was corrected before Phase 4.**

| # | Question | Answer |
|---|---|---|
| 1 | Teams, and the plan | **One team**, auto-created (`aiasifistiaques-projects`). `GET /v2/user` carries **no plan field at all** — the only plan-shaped key is `version: northstar`, which is Vercel's dashboard generation, not a billing tier. Plan is now inferred from a capability probe; see #11. |
| 2 | Projects with no `teamId` | **200, 92 projects**, `pagination.next: null` at `limit=100`. The personal scope is correct and complete. |
| 3 | `GET /v1/storage/stores` | **200 — available**, currently `[]`. Not Pro-only. |
| 4 | Runtime logs | **404 `not_found`.** Phase 7 is dropped. |
| 5 | Log drains | **200 — available.** Both `/v1/log-drains` and `/v1/webhooks` answer. This is the supported route for runtime logs, and the docs page says so. |
| 6 | Rate-limit headers | **Present on every endpoint, and per-endpoint**: `/v2/user` 500 · `/v9/projects` 400 · `/v9/…/env` 300 · `/v3/…/events` 200 · `/v1/storage/stores` 200 · `/v1/log-drains` **100** · `/v6/deployments` 1000. All hourly. |
| 7 | Deployment cap | Not reached during the spike; still `capSource: 'assumed'`. |
| 8 | `env?decrypt=true` | **It does not decrypt.** An `encrypted` record comes back as a base64 `{"v":"v2","c":"…"}` envelope ~1KB long whatever the real value is. `GET /v1/projects/{id}/env/{envId}` returns plaintext, one record at a time. Sample project: 4 records, 0 `sensitive`, 0 per-target duplication. |
| 9 | Redeploy shape | **Unanswered** — needs a write. |
| 10 | Promote | **Unanswered** — needs a write. |
| 11 | Metered usage | **`GET /v1/usage` exists**, takes ISO dates, and answers `plan_upgrade_required`: *"This API endpoint is only available to Teams on the Pro or Enterprise plan."* So VWO-22 ships derived-only — but the unavailable panel now has a precise reason rather than a shrug, and this doubles as the plan probe for #1. |
| 12 | Deployment timings | **All present.** `createdAt`, `buildingAt` and `ready` on every row; builds run 119–152s. VWO-22's arithmetic is sound. |

### What changed in the code because of this

- **`lib/vercel/env.ts`** — added envelope detection. Without it the Environment
  tab would have rendered a kilobyte of ciphertext as the variable's value, and
  `diffEnv` would have compared staged plaintext against an envelope and
  reported **every variable as changed on every save**. `readable` now means
  "this is real plaintext"; a new `revealable` separates "fetchable one at a
  time" from `sensitive`, which is never fetchable. Added `hydrateEnvValues`
  for downloads, and a `GET …/env/:envId` route for reveal.
- **`lib/vercel/usage.ts`** — was one deployment request *per project*. At 92
  projects that is 92 sequential round trips for one page view, against a
  budget of 1000/hour. Now a single account-wide walk grouped by `projectId`,
  which also keeps counting builds whose project has since been deleted.
- **`lib/vercel/account.ts`** — `version` removed from plan detection (it would
  have read `northstar` as a tier), replaced by `planFromCapability`, which
  probes `/v1/usage` and maps `plan_upgrade_required` to Hobby.
- **Phase 7 deleted from the plan.** Log drains (#5) are the supported answer.

One thing found while implementing, fixed in passing: `escapeEnvValue` was
private to `lib/heroku/configVars.ts`. It is now `lib/env/escape.ts`, shared by
both providers — the rules it encodes are dotenv's, not Heroku's. The Heroku
config-var tests still pass unchanged.

Each item: **files → change → done-when**. `BLOCKER` marks items that gate later
work. Sizes: **S** ≤ 1h, **M** ≤ half-day, **L** ≤ 2 days.

Paths are from the monorepo root `/Users/asifistiaque/Desktop/proj/e-mint`.
Backend and admin are **separate git repos** — do not expect one commit to span both.

Read `backend/HEROKU_INTEGRATION_WORK_ORDER.md` first. This document deliberately
does not repeat its **Background → The framework this plugs into**, **House
conventions**, or **Design language** sections. Those apply here verbatim. What
follows is the delta.

---

## The one-line brief

Everything the Heroku console does for a Heroku app, do for a Vercel project:
list accounts, list their projects, open a project, see what it is running and
what it is using, change its environment, and ship it. Same components, same
permission split, same audit rules, same restraint.

---

## The nine primary needs

These were named as the primary requirements. Everything else in this document
tags along behind them — built because it is cheap once the foundation is there,
not because it was asked for. The **Verdict** column is the honest one: two of
these are constrained by what the API exposes, and both are called out rather
than quietly downgraded during implementation.

| # | Need | Work orders | Verdict |
|---|---|---|---|
| 1 | Create a project, connect git, deploy | VWO-32, VWO-28, VWO-12 | **Fully supported.** `POST /v10/projects` + `POST /v13/deployments` with a `gitSource`. `controllers/hongo` already does exactly this, so the shape is proven in this codebase. |
| 2 | Assign and configure domains | VWO-29, VWO-13 | **Fully supported**, per project and per account, including the DNS records to set and a verify call. |
| 3 | Check account usage | **VWO-22**, delta #4 | **Partly.** Builds, build minutes, per-project breakdown and cap proximity are all derivable from the deployment list. Bandwidth, function invocations and edge requests are **not exposed** — the page says so and links to the dashboard. See VWO-01 #11. |
| 4 | Assign and configure config vars | VWO-25, VWO-26, VWO-11 | **Fully supported**, with the caveat that Vercel env vars are per-target records, not a flat map (delta #2) — that is most of the work. |
| 5 | See deployments · redeploy · pick one · update config vars | VWO-27, VWO-28, VWO-26 | **Fully supported**, but the flow is not the obvious one: env changes never apply to an existing deployment. Editing vars and redeploying is one guided action, specced in VWO-26. |
| 6 | See (runtime) logs | VWO-30, VWO-27 | **Partly, and now settled.** The runtime-log endpoint 404s on this account, so Phase 7 is dropped. Log drains *are* available (VWO-01 #5) and are the supported route: the Resources tab lists them, and build logs cover the build side. |
| 7 | See build logs | VWO-27, VWO-12 | **Fully supported** — `GET /v3/deployments/{id}/events`. Gated behind `view-vercel-env` because builds print secrets. |
| 8 | Projects list and per-project detail, like Heroku | VWO-21, VWO-24, VWO-10 | **Fully supported**, and the closest one-to-one with the existing Heroku pages. |
| 9 | Which project uses what, individually **and** collectively | VWO-30 (per project), **VWO-23** (account rollup) | **Supported, pending VWO-01 #3** on the storage endpoint. The rollup inverts the mapping and surfaces orphaned resources, which the per-project view cannot show by definition. |

**Multiple accounts is the spine, not a feature.** Every route is
`/vercels/:id/...`, every cache key starts with the account id, and the list page
at `/vercels` is the entry point — the same shape as `/herokus`. Nothing in this
plan assumes one account, and VWO-39 #13 tests a second one.

**And a docs page:** VWO-34 builds `/vercel-doc`, the counterpart to
`/heroku-doc`, linked from the list page. It is written against these nine needs
— how to do each one, and what the two constrained ones actually give you.

### What tags along

Not asked for, built anyway because the foundation makes them nearly free:
project settings and rename (VWO-31), deployment cancel and delete (VWO-27),
the activity/audit feed (VWO-08), token rotation (VWO-17), per-target env
download (VWO-25), certificates and integrations in the resource panels
(VWO-30), and the storefront guard (VWO-33) — that last one is not optional
despite being unrequested, for the reason given in its own entry.

---

## The account this is built against

**One personal Vercel account, Hobby plan. No team.** That is not a detail to
design around later — it decides four things in this plan, so it is stated once
here and referenced from each:

1. **No team scoping is needed, but the parameter is still built in** (delta #1).
   The switcher exists in the code and never renders on this account.
2. **Several Pro-plan features are simply absent.** Log drains, deployment
   protection and team members are not on Hobby. Each surface that would show
   them renders a muted "not available on this plan" line, not an error and not
   an empty table — VWO-01 confirms which, and anything that turns out to be
   Pro-only is *described*, never hidden, so an upgrade does not require a code
   change to become visible.
3. **Hobby has hard deployment limits** — a per-day deployment cap and a single
   concurrent build, so a queued deployment is the normal case here rather than
   an anomaly. VWO-27's UI must treat `QUEUED` as a first-class state, and
   VWO-28's redeploy button must surface a cap rejection as its own message, not
   as a generic failure.
4. **This one account also holds live customer storefronts.** `controllers/hongo`
   deploys shop themes with `process.env.VERCEL_TOKEN` — almost certainly this
   same account — so the console's project list *is* the storefront list, and
   "delete project" reaches a real shop. VWO-33 is the guard, and it is a blocker.

There is one more thing worth saying plainly, because it is cheaper to know now
than to find out from Vercel: **the Hobby plan is for non-commercial use.**
Deploying client storefronts on it is outside Vercel's fair-use policy, and an
account suspension would take every shop down at once. That is a business call,
not a technical one, and nothing in this work order depends on the answer — but
building an admin console over it is a good moment to make the call deliberately.

---

## Where Vercel is not Heroku

This is the part that will break a straight copy-paste. Six structural
differences, each of which changes a model field, a route, or a screen.

### 1. Scope is a query parameter, and on Hobby the default is the right one

A Heroku key resolves to exactly one account and `GET /apps` returns everything
it can see. A Vercel token resolves to one **user**, and nearly every endpoint
takes an optional `teamId` (or `slug`) query parameter. **With no `teamId`, the
call is scoped to the personal account** — which, on the Hobby plan this is being
built for, is exactly where every project lives.

So the default path is the correct path, and the failure mode is the inverse of
what it would be on a Pro team: sending a `teamId` that the token does not belong
to returns an empty list, not an error, and looks like "no projects".

**Decision taken here:** build the scope in as an optional `?team=<teamId>` query
parameter carried by one `withTeam()` helper (VWO-03), defaulting to the stored
`defaultTeamId`, which on a Hobby account is simply unset. This costs one helper
and one conditional in the UI, and it means a Pro team account connected later —
a client's, or this one after an upgrade — works without a migration.

**What it does not cost is a screen.** The team switcher is rendered only when
`teams[]` has more than one entry. On the account being built against it never
appears, and the personal-account path is the one that gets tested (VWO-39 #9).

### 2. Environment variables are objects, not a map

Heroku config vars are one flat `{ KEY: value }` document, `PATCH`ed whole, where
`null` deletes. Vercel env vars are individually-identified records:

```
{ id, key, value, type, target[], gitBranch, comment, createdAt, updatedAt }
```

- `target` is an array of `production` / `preview` / `development`. **The same
  key can exist three times with three different values.** Any UI that presents
  env vars as a key→value table is wrong; it is a key+target→value table.
- `gitBranch` narrows a `preview` var to one branch. Another axis of duplication.
- `type` is `plain` | `encrypted` | `sensitive` | `secret`. **A `sensitive` value
  can never be read back**, by anyone, including the dashboard. The UI must show
  it as permanently hidden with a *Replace* action, not a *Reveal* action.
- Reading values at all requires `?decrypt=true` on `GET /v9/projects/{id}/env`.
- Writes are per-record: `POST` to add, `PATCH /env/{id}` to change,
  `DELETE /env/{id}` to remove. There is no atomic multi-key commit, which means
  a staged batch can partially fail. See VWO-26.

This single difference is most of the work in Phase 6 and is the reason the
Heroku `configVars.ts` diffing code cannot be reused as-is.

### 3. Deployments are immutable; there is no restart, no scaling, no maintenance

There are no dynos, no formation, no `maintenance` flag. Delete the mental model:

| Heroku | Vercel equivalent |
|---|---|
| restart dynos | *(nothing)* — there is no process to restart |
| scale formation | *(nothing)* — serverless, no dial to turn |
| maintenance mode | *(nothing documented)* — closest is deployment protection |
| rollback to release N | **promote** an older deployment to production |
| re-release current slug | **redeploy** — create a new deployment from an old one |
| `GET /releases` | `GET /v6/deployments?target=production` |

So the Heroku app page's **Dynos** tab has no analogue and the **Settings** tab
loses its maintenance toggle. Do not invent replacements to keep the tab count.

### 4. Metered usage is not exposed; derived usage is

Heroku gave us `GET /account/invoices` and `/usage/monthly`. Vercel exposes no
documented consumer-side equivalent — the `marketplace*` calls in `@vercel/sdk`
are the *partner* side, for integration vendors reporting usage **to** Vercel,
and are useless here. So the numbers the dashboard's Usage page shows —
bandwidth, function invocations, edge requests, image optimisations — are **not
reachable from the API** as far as the installed SDK knows. VWO-01 #11 is the
last word on that; until it answers, assume they are not.

What *is* reachable is everything derivable from the deployment list, which is a
lot more than it sounds. Every deployment carries `createdAt`, `buildingAt` and
`ready` (confirmed in the SDK's deployment model), so:

| question | derived from |
|---|---|
| how many builds today, against the daily cap | count by day |
| build minutes consumed | `Σ (ready − buildingAt)` |
| which project is burning the account | group by project |
| how often do builds fail | `readyState` distribution |
| is anything queued right now | live `readyState` |
| what is on the account at all | projects · domains · stores · integrations |

That answers "is my account near its limits and what is causing it", which is the
actual question behind *check the usage of my account*. **VWO-22 builds it, and
the page states plainly which figures are derived and which are unavailable** —
with a link to the dashboard for the metered ones. A usage page that silently
omits bandwidth is worse than one that says it cannot see bandwidth.

**Do not scrape the dashboard** to close the gap.

### 5. Pagination is a timestamp cursor, not a Range header

`backend/lib/heroku/range.ts` does not transfer. Vercel list endpoints take
`limit` plus `until` / `since` (millisecond epochs) and return
`{ pagination: { count, next, prev } }`, where `next` is the timestamp to pass as
`until` on the following page. VWO-04 owns this.

### 6. Rate limits are per-endpoint and undocumented in aggregate

Heroku's flat 4500/hour let the cache TTLs be reasoned about on paper. Vercel's
limits vary by endpoint and are only knowable from the `x-ratelimit-limit`,
`x-ratelimit-remaining` and `x-ratelimit-reset` response headers.

**Do not hardcode a budget anywhere.** The client reads those headers, the
account page shows the last-seen remaining count, and a 429 maps to the same
error state Heroku's does. The cache (VWO-05) exists for the same reason it does
on the Heroku side, but its value cannot be justified with a number until a real
token has been watched.

---

## What already exists, and what must not be disturbed

`@vercel/sdk@1.1.0` is **already a dependency** and already in use:

```
backend/controllers/hongo/deployProject.controller.ts   process.env.VERCEL_TOKEN
backend/controllers/hongo/deleteProject.controller.ts   process.env.VERCEL_TOKEN
backend/controllers/hongo/addEnvVariables.ts            process.env.VERCEL_TOKEN
backend/controllers/hongo/addDomain.ts                  process.env.VERCEL_TOKEN
backend/controllers/hongo/getDeploymentStatus.ts        process.env.VERCEL_TOKEN
backend/controllers/hongo/getDomains.ts                 process.env.VERCEL_FULL_ACCESS
```

That is the storefront theme-deploy path. It uses **one hardcoded global token
from the environment**, deploys into one hardcoded GitHub org, and is a product
feature — not an admin console.

**Leave it alone.** This work order does not touch `controllers/hongo`, does not
migrate it onto stored accounts, and does not remove either env var. Two systems
calling the same upstream is fine; one refactor that breaks storefront
deployment while building an admin page is not. The overlap is noted in Open
Decisions as a possible follow-up, nothing more.

### SDK or raw axios?

**Raw axios**, mirroring `backend/lib/heroku/client.ts`. Reasons, in order:

1. The Heroku lib's value is not the HTTP call, it is `toHerokuError` — one place
   that turns an upstream failure into `{ status, message, invalidToken }` so a
   revoked key flips the stored record to `invalid` everywhere. The SDK throws
   its own error classes and would need that mapping written anyway.
2. The cache (VWO-05) and the paginator (VWO-04) wrap a request function. Wrapping
   142 generated SDK methods is worse than wrapping one `get`.
3. The pinned `1.1.0` is behind the API — it has no storage-stores call and no
   runtime-logs call, both of which this console wants.
4. `hongo` keeps using the SDK. Nothing forces a single choice.

The SDK stays in `package.json` regardless. Do not remove it.

---

## The Vercel API surface

Paths below were read out of the installed `@vercel/sdk@1.1.0` request builders,
so they are what the SDK actually calls, not what a doc page claims. Anything
marked ⚠ is **not** in that SDK and must be confirmed against a live token in
VWO-01 before a line of code depends on it.

Base `https://api.vercel.com`. Auth `Authorization: Bearer <token>`.
Every path below also accepts `?teamId=` / `?slug=`.

| purpose | call |
|---|---|
| identity | `GET /v2/user` |
| teams | `GET /v2/teams`, `GET /v2/teams/{teamId}` |
| team members | `GET /v2/teams/{teamId}/members` |
| projects | `GET /v9/projects?limit&search&from`, `GET /v9/projects/{idOrName}` |
| create project | `POST /v10/projects` |
| update / delete project | `PATCH` / `DELETE /v9/projects/{idOrName}` |
| env list | `GET /v9/projects/{idOrName}/env?decrypt=true&gitBranch&source` |
| one env value | `GET /v1/projects/{idOrName}/env/{id}` |
| env create / edit / remove | `POST /v10/projects/{idOrName}/env`, `PATCH` / `DELETE /v9/projects/{idOrName}/env/{id}` |
| deployments | `GET /v6/deployments?projectId&limit&until&state&target&rollbackCandidate` |
| one deployment | `GET /v13/deployments/{idOrUrl}` |
| create / redeploy | `POST /v13/deployments` |
| cancel | `PATCH /v12/deployments/{id}/cancel` |
| delete deployment | `DELETE /v13/deployments/{id}` |
| promote (= rollback) | `POST /v10/projects/{projectId}/promote/{deploymentId}` |
| promote candidates | `GET /v1/projects/{projectId}/promote/aliases` |
| build logs | `GET /v3/deployments/{idOrUrl}/events` |
| checks | `GET /v1/deployments/{deploymentId}/checks` |
| deployment aliases | `GET /v2/deployments/{id}/aliases` |
| project domains | `GET /v9/projects/{idOrName}/domains`, `POST /v10/.../domains`, `DELETE`, `POST .../domains/{domain}/verify` |
| account domains | `GET /v5/domains`, `GET /v6/domains/{domain}/config` |
| DNS records | `GET /v4/domains/{domain}/records` |
| installed integrations | `GET /v1/integrations/configurations` |
| git namespaces / repo search | `GET /v1/integrations/git-namespaces`, `GET /v1/integrations/search-repo` |
| log drains | `GET /v1/webhooks`, and ⚠ `GET /v1/log-drains` |
| certificates | `GET /v7/certs/{id}` |
| account events | `GET /v3/events` |
| ⚠ storage stores (Blob / Postgres / KV / Edge Config) | `GET /v1/storage/stores` |
| ⚠ runtime logs | `GET /v1/deployments/{id}/runtime-logs` — **Phase 7 only, flag-gated** |
| ✗ billing / usage | **does not exist** — see delta #4 |

---

## Non-negotiables

1. **The plaintext token never leaves the backend.** `select: false` +
   `exclude: true` + a single resolver, exactly as `controllers/heroku/resolveToken.ts`.
   VWO-38's grep enforces there is exactly one `select('+apiToken')` in the repo.
2. **Env var *values* are never written to Mongo** — not to a cache, not to the
   audit log. `VercelActivity` records `{ key, target, kind }` and nothing else.
   A value on either side of a change turns an audit log into a second copy of
   the secrets.
3. **A personal-account token cannot be scoped, and this one controls live
   customer storefronts.** On a team, Vercel can issue a token limited to that
   team. On a Hobby personal account there is no such boundary: the stored token
   can do anything the account can, including delete every project in it — and
   this account's projects include the storefronts `controllers/hongo` deploys
   for real shops (see VWO-33). The connect form says this in plain words. It is
   also why VWO-33's guard is a blocker rather than a nicety, and why Open
   Decision #1 deserves a real answer before VWO-31 ships.
4. **Every mutating call is audited** and **confirmed in the UI** before it fires.
   Promote, redeploy, delete project and delete deployment all change what the
   public is served.
5. **Build logs are secrets.** A build prints env values, tokens and connection
   strings constantly. Gate `.../events` behind `view-vercel-env`, not
   `view-vercel`, and set `Cache-Control: no-store`. Same rule as Heroku logs.
6. Runtime logs only under Phase 7's conditions.

---

## Phase 0 — Confirm before building

### VWO-01 — Live-token spike — **BLOCKER, M**
**File:** `backend/scripts/spikeVercel.js` (new, throwaway — delete before merge)

Nothing in Phases 1–7 may start until the real Hobby token has answered these.
Run it with **no `teamId`** — that is the shape every call will have in
production. Record the answers in this document, replacing each `⚠`.

Half of these exist because the plan is being written against a Hobby account and
the published docs do not say, per endpoint, what a Hobby token gets back. A 403,
a 404 and an empty array mean three different things to the UI, and guessing
which one each returns is how a tab ships that says "error" when the honest
answer is "not on your plan".

1. `GET /v2/user` and `GET /v2/teams` with this token: does `teams` come back
   empty, or does it list teams the account was invited to? VWO-06's `teams[]`
   and VWO-21's switcher both branch on this.
2. Does `GET /v9/projects` **with no `teamId`** return the personal projects?
   Confirm the count, and confirm the storefront projects created by
   `controllers/hongo` are among them (VWO-33 assumes they are).
3. Does `GET /v1/storage/stores` exist on Hobby, and what does it return for a
   Blob store and a Postgres store? This is most of the Resources tab (VWO-30).
   A 403 here means "Pro only" and the panel becomes a plan notice.
4. **Runtime logs (primary need #6), the other decisive one.** Does
   `GET /v1/deployments/{id}/runtime-logs` exist on this plan, and does it stream
   or return a body? **Phase 7 lives or dies on this.** If it 403s on Hobby, drop
   Phase 7 rather than shipping a dead tab, and say so in VWO-34's docs page:
   build logs plus a dashboard link is then the honest answer, and log drains
   (#5) are the supported route on a paid plan. This is the one primary need the
   plan cannot promise.
5. Log drains are believed to be Pro-and-above. Confirm: does `GET /v1/log-drains`
   (or `GET /v1/webhooks`) answer, 403, or 404 for this token? VWO-30's panel
   renders from the answer.
6. Which `x-ratelimit-*` headers actually come back, on which endpoints, and what
   are the values? Paste the raw headers. **VWO-05's TTLs are guesses until this
   lands.**
7. What is the actual deployment cap and concurrent-build limit on this account,
   and **what does the API return when the cap is hit** — status, `error.code`,
   message? VWO-28 has to show that as its own message; a generic "deploy failed"
   on a daily cap is a support ticket waiting to happen.
8. What does `GET /v9/projects/{id}/env?decrypt=true` return for a `sensitive`
   var — an omitted `value`, an empty string, or an error? VWO-25 renders from
   the answer. Confirm `decrypt=true` is permitted on Hobby at all.
9. Does `POST /v13/deployments` with `{ deploymentId, name, target: 'production' }`
   redeploy, or does it need the full file manifest? If it needs the manifest,
   VWO-28 shrinks to "deploy from git ref" only.
10. Confirm `POST /v10/projects/{projectId}/promote/{deploymentId}` returns 2xx
    and the production alias actually moves. **Use a throwaway project, not a
    storefront.**
11. **Usage (primary need #3), the decisive one.** Try, in order, and record the
    status and body of each: `GET /v1/usage`, anything under
    `/v1/observability/*`, and whatever `GET /v2/user` returns in a `billing`,
    `resourceConfig` or plan-shaped field — the installed SDK's `AuthUser` model
    has none of these, so this is genuinely unknown. If any of them answers,
    VWO-22 gains real metered figures and this document gets a correction. If
    none do, VWO-22 ships derived-only, which is already specced.
12. Confirm the deployment list carries `createdAt`, `buildingAt` and `ready` on
    **real** responses, not just in the SDK's types. All of VWO-22's build-minute
    arithmetic rests on those three numbers being present and sane.

**Done when:** all twelve have a written answer in this file, every `⚠` above is
resolved to yes/no, and each Pro-only answer names the surface that becomes a
plan notice instead of a feature.

### VWO-02 — Carried-over defect: `edit-heroku-config` is ungrantable — **S**
**Files:** `backend/scripts/seedHerokuPermissions.js`, `backend/routes-admin/admin.router.ts:988`

Found while planning this, and it will be copied straight into the Vercel
permissions if it is not fixed first. `PATCH /herokus/:id/apps/:app/config-vars`
requires `edit-heroku-config`, but the seeded `heroku-config` Permission document
has `options.edit: false`. `getAdminPermissionList` builds the Role UI from those
options, so **no role except `*` can ever hold that string** — config var editing
is reachable only by a super admin, silently, with a 403 for everyone else.

Set `edit: true` on that Permission doc and re-run the seed.
**Done when:** a non-`*` role can be granted "Edit Heroku Config Vars" and a
config var write succeeds under it.

**For Vercel: define the permission options and the route guards in the same
commit** (VWO-16), and cross-check every guard string against the seed.

---

## Phase 1 — Foundation

### VWO-03 — HTTP client and error mapping — **BLOCKER, M**
**File:** `backend/lib/vercel/client.ts` (new)

`vercelClient(token)` → axios instance, `baseURL https://api.vercel.com`,
`Authorization: Bearer`, 20s timeout. Plus:

- `withTeam(params, team?)` — a single helper that appends `teamId` when present.
  **Every** service function goes through it. Delta #1 is a silent failure; one
  chokepoint is the only way to stop it recurring.
- `toVercelError(e)` → `{ status, message, code?, invalidToken }`, mirroring
  `toHerokuError`. Vercel answers `{ error: { code, message } }`. Map at minimum:
  `forbidden` / 401 → `invalidToken: true`; `not_found` → 404;
  `rate_limited` / 429 → 429 with the `x-ratelimit-reset` time in the message;
  `ECONNABORTED` → 504.
- `readRateLimit(response)` → `{ limit, remaining, resetAt }` from the
  `x-ratelimit-*` headers, or `null`. Cached per account in memory for the
  account page to display.

**Done when:** a revoked token produces `invalidToken: true`, a 429 carries a
human reset time, and no service function builds its own query string.

### VWO-04 — Cursor pagination helper — **BLOCKER, S**
**File:** `backend/lib/vercel/paginate.ts` (new)

`pagedGet(token, path, { limit = 50, until, team, params })` → `{ items, next }`,
reading `pagination.next` from the response body. The caller passes `next` back as
`until`. `range.ts` is Heroku-specific and is not reused.
**Done when:** deployments and projects both page through it and a second page
returns different rows.

### VWO-05 — Short-TTL cache — **M**
**File:** `backend/lib/vercel/cache.ts` (new)

Same in-process TTL map as `lib/heroku/cache.ts`, keyed
`accountId + teamId + kind + suffix`. **The team must be in the key** — the same
`kind` under two teams is two different answers, and leaving it out serves one
team's project list to another.

Starting TTLs (seconds), to be revised from VWO-01 #4:
`user 60 · teams 300 · projects 60 · project 30 · deployments 15 ·
deployment 10 · domains 120 · resources 300`.

**Never cached, and must not be added:** env vars, build logs, runtime logs.
Every mutating controller invalidates its account+team keys explicitly.
**Done when:** two project-page loads inside 30s make one set of upstream calls,
and a promote invalidates deployments immediately.

### VWO-06 — Model folder — **BLOCKER, M**
**Files:** `backend/models/vercel/{model,settings,config,document.types}.ts` (new),
exported from `backend/models/index.ts`

`VercelAccount`, modelled on `models/heroku/model.ts` — including both `pre('save')`
hooks, the sealing guard, and `next(error)` on the Counter failure (not the bare
`next()` the `credentials` model uses).

| field | notes |
|---|---|
| `code` | `VRC-0001`, Counter slug `vercel` |
| `label` | required |
| `apiToken` | **`select: false`**, sealed by `lib/crypto` on save |
| `tokenLast4`, `tokenFingerprint` | same roles as the Heroku pair |
| `userId`, `username`, `userEmail`, `userName` | snapshot of `GET /v2/user` |
| `plan` | `hobby` \| `pro` \| `enterprise` — drives every "not on this plan" notice |
| `teams[]` | `[{ teamId, slug, name }]` — snapshot; **`[]` on a personal account** |
| `defaultTeamId` | optional; unset on a personal account, and unset is valid |
| `status` | `active` \| `invalid` \| `unverified` |
| `lastSyncedAt`, `lastError`, `projectCount` | as Heroku |
| `client`, `project`, `note` | the same ownership block |
| `privacy`, `addedBy`, `access[]` | the same access block — `hasAccess()` needs it |

`settings.ts` copies the Heroku file's shape, including `apiToken` with
`required: true, edit: false, exclude: true` and `schema.readOnlyOnUpdate: true`
(WO-16's fix — do not re-introduce the bug).

`config.ts`: table `['code','label','userEmail','status','projectCount','client','lastSyncedAt']`,
route `path: 'vercels'`, `toPath: '/vercels'`, `button.title: 'Connect Account'`,
`guideHref: '/vercel-doc'`, the same four-item `menu`.

**Done when:** the model round-trips a token through seal/open, `GET /vercels`
returns rows with no `apiToken` on any of them, and a CSV export has no token column.

### VWO-07 — Token resolver — **BLOCKER, S**
**File:** `backend/controllers/vercel/resolveToken.ts` (new)

`resolveAccount(id, res)` and `handleVercelFailure(e, res, account)`, copied from
the Heroku pair. `select('+apiToken')` appears **here and nowhere else**.

Improve on the original while copying it: the Heroku decrypt catch answers the
same sentence whether `SECRET_ENCRYPTION_KEY` is missing, different, or the row
was hand-edited. Distinguish the three — `getKey()` throwing means missing/short,
a format mismatch means a hand-edited row, a GCM auth failure means a wrong key —
and say which. That ambiguity cost a production debugging session on the Heroku side.
**Done when:** each of the three failures produces a different message, and none
of them leaks the underlying crypto error.

### VWO-08 — Audit model — **BLOCKER, M**
**Files:** `backend/models/vercel/activity.model.ts` (new), export from `models/index.ts`

`VercelActivity`: `{ account (ref), teamId, projectName, deploymentId, action,
summary, changes[], performedBy, performedByName, status: 'success'|'failed',
errorMessage, createdAt }`, indexed `{ account: 1, createdAt: -1 }`.

`changes[]` for env writes is `{ key, target, kind: 'added'|'updated'|'removed' }`.
`target` is new versus Heroku and is required — "changed `DATABASE_URL`" is not
useful when it could mean preview or production. **Never a value, on either side.**

`recordActivity({ req, account, teamId, projectName, action, summary, changes,
status, errorMessage })`, called by every mutating controller on both paths.
**Done when:** a promote, an env change and a failed redeploy each leave one row,
and no row contains an env value.

---

## Phase 2 — Service layer

### VWO-09 — `account.ts` and `teams.ts` — **BLOCKER, S**
**Files:** `backend/lib/vercel/account.ts`, `teams.ts` (new)
`getUser(token)`, `listTeams(token)`, `getTeam(token, teamId)`,
`listTeamMembers(token, teamId)`. All return camelCase; no raw response shape
escapes `lib/vercel`.

`listTeams` returning `[]` is the **normal** result on the Hobby account this is
built for, not an error and not an empty state — everything downstream treats a
teamless account as the default case. `getTeam` and `listTeamMembers` are
written because a Pro account may be connected later; neither is called on a
personal account, and no screen depends on them (VWO-21).

`getUser` also carries back the plan (`user.version` / billing plan field,
whichever VWO-01 #1 confirms) so the account page can label the plan and each
Pro-only surface can say so rather than failing.
**Done when:** `getUser` fills every snapshot field including the plan, and
`listTeams` returning `[]` leaves the account fully usable.

### VWO-10 — `projects.ts` — **BLOCKER, M**
**File:** `backend/lib/vercel/projects.ts` (new)
`listProjects({ team, search, limit, until })` via `pagedGet`,
`getProject(idOrName, team)`, `createProject({ name, framework, gitRepository, team })`,
`updateProject(idOrName, patch, team)`, `deleteProject(idOrName, team)`.

`getProject` must normalise the pieces the UI actually needs into a flat shape:
`{ id, name, framework, nodeVersion, rootDirectory, buildCommand, installCommand,
outputDirectory, gitRepo: { type, org, repo, url }, latestProductionDeployment,
createdAt, updatedAt }`. The raw project object is large and nested; normalising
once here is what keeps six tab components readable.
**Done when:** the list pages, the detail flattens, and creation succeeds against
a real GitHub repo.

### VWO-11 — `env.ts` — **BLOCKER, L**
**File:** `backend/lib/vercel/env.ts` (new)

`listEnv({ project, team, decrypt, gitBranch })`, `getEnvValue(project, envId, team)`,
`createEnv(project, records[], team)`, `updateEnv(project, envId, patch, team)`,
`deleteEnv(project, envId, team)`.

Plus the two that carry the real design weight:

- `diffEnv(existing, staged)` → `{ added[], updated[], removed[] }` keyed on
  **`key` + sorted `target` + `gitBranch`**, not on `key`. Keying on `key` alone
  silently merges the production and preview records for the same name, which
  would report one change and then write two.
- `toEnvFile(records, target)` / `toJsonFile(records, target)` — a download is
  **per target**, because a flat `.env` cannot represent three values for one key.
  Reuse the escaping from `lib/heroku/configVars.ts` (post-WO-15: single-quote
  preferred, double-quote fallback, `.json` when a value holds both quote types)
  and reuse its tests.

`sensitive` records come back without a readable value. `toEnvFile` writes
`KEY=` with a trailing `# sensitive — value not retrievable from the API` comment
rather than omitting the line, so a downloaded file still documents the full set.
**Done when:** the three-targets-one-key case round-trips, a `sensitive` var is
never claimed to have a value, and `diffEnv` reports two changes for two targets.

### VWO-12 — `deployments.ts` — **BLOCKER, L**
**File:** `backend/lib/vercel/deployments.ts` (new)
```
listDeployments({ project, team, target, state, limit, until })
getDeployment(idOrUrl, team)
createDeployment({ name, project, gitSource, target, team })   // deploy a ref
redeploy({ deploymentId, name, target, team })                 // shape per VWO-01 #7
cancelDeployment(id, team)
deleteDeployment(id, team)
promote(projectId, deploymentId, team)
listPromoteCandidates(projectId, team)
getDeploymentEvents(idOrUrl, team)                             // build logs
listChecks(deploymentId, team)
listDeploymentAliases(id, team)
```
Normalise `readyState` (`QUEUED` `BUILDING` `ERROR` `CANCELED` `READY`) to the
five `StatusDot` tones once, here — not in each component.
**Done when:** a promote moves the production alias and `listDeployments` marks
the current production deployment.

### VWO-13 — `resources.ts` and `domains.ts` — **M**
**Files:** `backend/lib/vercel/resources.ts`, `domains.ts` (new)

`domains.ts`: `listProjectDomains`, `addProjectDomain`, `verifyProjectDomain`,
`removeProjectDomain`, `getDomainConfig`.

`resources.ts` answers "what is this project using" in one call —
`getProjectResources({ project, team })` returning
`{ integrations[], stores[], edgeConfigs[], logDrains[], certs[], gitRepo }`,
assembled from `GET /v1/integrations/configurations`, ⚠`GET /v1/storage/stores`
and the project's own `link` block. Each sub-fetch is independently
failure-tolerant: one 404 returns an empty array for that section with a `notes[]`
entry, it does not fail the whole call. Half a resources page beats an error page.
**Done when:** a project with a Blob store, a Postgres store and one marketplace
integration lists all four sections, and a plan without storage still renders.

---

## Phase 3 — Controllers, routes, permissions

### VWO-14 — Controllers — **BLOCKER, L**
**Files:** `backend/controllers/vercel/*.ts` (new), barrel `index.ts`

One controller per route below, each: `resolveAccount` → service call →
`handleVercelFailure` on throw → `recordActivity` on both paths for mutations.
Follow `controllers/heroku/` naming (`getVercelProjects.controller.ts`, …).

**Put these in `backend/controllers/vercel/` and export through
`backend/controllers/index.ts`.** This repo has two parallel controller trees —
`library/controllers/*` and `controllers/*` — and the router mounts the second.
The Heroku console has exactly one copy of each controller, and the category-icon
bug earlier this month came from editing the copy that was not mounted. Do not
create a `library/controllers/vercel`.

### VWO-15 — Routes — **BLOCKER, M**
**File:** `backend/routes-admin/admin.router.ts`

`router.use('/vercels', defineRoutes({ Model: VercelAccount, settings: vercelSettings,
permission: 'vercel', route: 'vercels', frontendConfig: vercelConfig,
replaceController: { post: createVercelAccount },
injectMiddleware: { getAll: [hasAccess()], getById: [hasAccess()], export: [hasAccess()] },
customRoutes: [...] }))`

| method | path | permission |
|---|---|---|
| post | `/verify` | `create-vercel` |
| put | `/:id/key` | `edit-vercel` |
| get | `/:id/account` | `view-vercel` |
| get | `/:id/teams` | `view-vercel` |
| get | `/:id/activity` | `view-vercel` |
| get | `/:id/projects` | `view-vercel` |
| post | `/:id/projects` | `create-vercel` |
| get | `/:id/projects/:project` | `view-vercel` |
| patch | `/:id/projects/:project` | `edit-vercel` |
| delete | `/:id/projects/:project` | `delete-vercel` |
| get | `/:id/projects/:project/env` | `view-vercel-env` |
| get | `/:id/projects/:project/env/download` | `create-vercel-env` |
| post | `/:id/projects/:project/env` | `edit-vercel-env` |
| patch | `/:id/projects/:project/env/:envId` | `edit-vercel-env` |
| delete | `/:id/projects/:project/env/:envId` | `edit-vercel-env` |
| get | `/:id/projects/:project/deployments` | `view-vercel` |
| post | `/:id/projects/:project/deploy` | `edit-vercel` |
| post | `/:id/projects/:project/promote/:deployment` | `edit-vercel` |
| get | `/:id/projects/:project/domains` | `view-vercel` |
| post | `/:id/projects/:project/domains` | `edit-vercel` |
| post | `/:id/projects/:project/domains/:domain/verify` | `edit-vercel` |
| delete | `/:id/projects/:project/domains/:domain` | `edit-vercel` |
| get | `/:id/projects/:project/resources` | `view-vercel` |
| get | `/:id/deployments/:deployment` | `view-vercel` |
| patch | `/:id/deployments/:deployment/cancel` | `edit-vercel` |
| delete | `/:id/deployments/:deployment` | `delete-vercel` |
| get | `/:id/deployments/:deployment/events` | `view-vercel-env` |
| get | `/:id/deployments/:deployment/runtime-logs` | `view-vercel-env` (Phase 7) |

Every route accepts `?team=`, defaulting to the account's `defaultTeamId`.

Notes:
- **Build logs sit behind `view-vercel-env`, not `view-vercel`** — see
  Non-negotiables #5. `Cache-Control: no-store` on that response.
- `create-vercel-env` stands in for Download, exactly as `create-heroku-config`
  does. `getAdminPermissionList` builds labels as `"<Verb> " + permission.name`,
  so name the seeded doc **`Vercel Env Download`**.
**Done when:** the boot log prints one `📍 Registering custom route:` per row and
every route answers 401 unauthenticated and 403 to a role without the string.

### VWO-16 — Permission + sidebar seeds — **BLOCKER, S**
**Files:** `backend/scripts/seedVercelPermissions.js`, `seedVercelSidebarItem.js`,
`seedVercelDocSidebarItem.js` (new)

Two Permission documents:
- key `vercel` — create / view / edit / delete, all `true`.
- key `vercel-env` — `view: true`, `create: true` (means Download),
  **`edit: true`** (means write env vars — do not repeat VWO-02), `delete: false`.

Cross-check every `adminPermissions([...])` string in VWO-15 against these two
docs' options before merging. A guard string with no matching option is
unreachable for every role but `*`.

Sidebar item: name `Vercel Accounts`, `href: 'vercels'`, `icon: 'triangle'`,
category `Project Management`, `priority: 27`, `permission: 'view-vercel'`.
The category itself carries the lucide glyph now — do not add a `sectionIcon`
here, and remember `getAdminSidebar.data.ts` under `controllers/common/` is the
mounted copy.
**Done when:** a fresh role can be granted all seven strings from the Role UI and
the sidebar link appears for it and not for a role without `view-vercel`.

### VWO-17 — Connect and rotate — **M**
**Files:** `backend/controllers/vercel/{verifyVercelToken,createVercelAccount,updateVercelToken}.controller.ts`

`POST /verify` calls `GET /v2/user` + `GET /v2/teams` with the pasted token and
returns `{ valid, user, teams[] }` **without storing anything** — so the connect
form can show whose account it is and let the operator pick a default team before
committing. `createVercelAccount` replaces the generic POST, verifies, snapshots,
then saves. `PUT /:id/key` rotates, re-verifies, and **must reject a token whose
`userId` differs from the stored one** unless the caller passes an explicit
`allowAccountChange` flag — silently repointing a record at a different Vercel
account while keeping its label and audit history is the kind of thing nobody
notices until it matters.
**Done when:** a bad token is refused at the form with Vercel's own message, a
good one shows the team picker, and rotation to a different user's token is blocked.

---

## Phase 4 — Account page

### VWO-18 — Shared UI: reuse, do not rebuild — **BLOCKER, S**
**Files:** `admin/src/app/herokus/_components/` → `admin/src/components/library/console/`

`Panel`, `StatusDot`, `DataTable`, `FilterInput`, `ConfirmAction`, `CopyValue`,
`PageHeader`, `Crumbs`, `States` are already built and already generic —
they live under `app/herokus/_components/` only because that is where they were
needed first. `StatTile` has already been promoted to
`components/library/stat/StatTile.tsx` for the dashboard; do the same for the rest
and re-export from `app/herokus/_components/index.ts` so the Heroku pages keep
their imports (the `StatTile.tsx` one-line re-export is the pattern).

**No new panel, table or status component may be written for Vercel.** If one of
these does not fit, change it once in the shared copy.
**Done when:** `app/vercels/**` imports zero components from `app/herokus/**`,
both consoles render from the same files, and the Heroku pages are untouched.

### VWO-19 — Store service — **BLOCKER, M**
**Files:** `admin/src/components/library/store/services/vercelApi.ts` (new),
`mainApi.ts` tag types, `store/index.ts`

Mirror `herokuApi.ts` exactly, including its two hard-won rules:
fixed tag names (never a tag derived from a per-id path), and
**`keepUnusedDataFor: 0` on anything holding secrets** — here that is
`getVercelEnv` and `getVercelBuildLogs`.

Tags: `vercel-account`, `vercel-teams`, `vercel-projects`, `vercel-project`,
`vercel-env`, `vercel-deployments`, `vercel-domains`, `vercel-resources`,
`vercel-activity`, `vercels`.

Fix the two download bugs while copying rather than inheriting them: destructure
`isError, error` and render a `<Toast>` (WO-17), and call
`window.URL.revokeObjectURL(url)` after `link.remove()` (WO-18) — a blob of
production secrets should not outlive the click.
**Done when:** every endpoint has a fixed tag, a 403 download raises a toast, and
no blob URL survives a download.

### VWO-20 — List page — **S**
**File:** `admin/src/app/vercels/page.tsx` (new) — `<ServerPage route='vercels' />`.
Nothing else. The generic table is driven entirely by `config.ts`.
**Done when:** the list renders with the seven configured columns and the
connect-account modal creates a record.

### VWO-21 — Account page — **L**
**File:** `admin/src/app/vercels/[id]/page.tsx` (new)

Header: breadcrumb · `{label}` + status dot · team switcher *(conditional)* ·
right cluster `[Sync] [Rotate Token] [⋯]`.
Sub-line: `userEmail · Hobby · Token ••••1234 · N requests remaining`.

The team switcher **renders only when `teams[]` has more than one entry**. On the
Hobby account this is built against it never appears and the page is one scope
deep — which is the layout to get right first. When it does render it sets
`?team=` for every request on the page and on every project page opened from it,
and persists to the URL so a link is shareable.

Stat row: **Projects** · **Deployments (30d)** · **Domains** · **Plan**.
Each tile links to the tab that explains it; Deployments links to Usage. The Plan
tile is not decoration — it is what every "not available on Hobby" notice
elsewhere in the console points back to.

Tabs (`Tabs.Root` subtle, `lazyMount`): **Overview** (user detail grid, plan,
linked client/project, note) · **Projects** (`FilterInput` over name/framework/repo,
then `DataTable`: Name, Framework, Repo, Last Deployment + status dot, Updated, `⋯`)
· **Usage** (VWO-22) · **Resources** (VWO-23) · **Domains** (account-level) ·
**Activity**.

No Members tab. Team membership does not exist on a personal account, and a tab
that is always empty is worse than one that is absent.

Rotate Token: modal, pre-flight `POST /verify`, then `PUT /:id/key`, using
`ui/password-input.tsx`. Use the `!id || !stored || stored.status === 'invalid'`
skip guard — the Heroku page's `!id || stored?.status === 'invalid'` fires one
request against a known-bad key before `stored` loads (WO-22).
**Done when:** every tab renders loading / empty / error / forbidden on a
teamless account with the switcher absent, search filters without a request, and
a second account with two teams shows the switcher and re-scopes on change.

### VWO-22 — Usage tab — **PRIMARY, L**
**Files:** `backend/lib/vercel/usage.ts` (new),
`backend/controllers/vercel/getVercelUsage.controller.ts` (new),
`get /:id/usage?days=30` → `view-vercel`, account page tab

Primary need #3. Built entirely from the deployment list (delta #4), because the
metered figures are not exposed.

`accountUsage({ team, days = 30 })` pulls every deployment in the window via
`pagedGet` across every project, then returns one computed object — **the
arithmetic lives here, not in a component**:

```
{ window: { from, to, days },
  builds:  { total, succeeded, failed, canceled, queuedNow },
  buildMinutes: { total, byProject[] },
  perDay:  [{ date, count, minutes }],
  byProject: [{ projectId, name, deployments, minutes, lastDeployedAt,
                isStorefront }],
  limits:  { dailyCap, capSource: 'confirmed' | 'assumed', concurrentBuilds },
  unavailable: ['bandwidth', 'functionInvocations', ...] }
```

`byProject` is the answer to "which project is burning the account" and it
carries `isStorefront` from VWO-33, so a spike in builds can be traced to a shop.

The tab renders: a stat row (Builds · Build minutes · Failed · Queued now), a
**per-day table** of builds and minutes with the daily cap called out on any day
that reached it, then the per-project breakdown sorted by minutes. **No chart** —
the same explicit call the Heroku work order made; numbers and tables only.

Below that, a plainly-worded panel: *Not available through the API* — bandwidth,
function invocations, edge requests, image optimisation — each a row with a link
to that account's dashboard Usage page. This panel is required, not optional. It
is what stops someone reading the build numbers as the whole picture.

The window is expensive — a 30-day fetch across many projects is many requests —
so it is cached at the account+team+days key for 300s (VWO-05) and the range
selector offers 7 / 30 / 90 days rather than a free date picker.
**Done when:** the figures reconcile against the Vercel dashboard's deployment
list for the same window, every derived number is labelled as derived, and the
unavailable panel names what it cannot show.

### VWO-23 — Account resource rollup — **PRIMARY, M**
**Files:** `backend/lib/vercel/resources.ts` (extend),
`get /:id/resources` → `view-vercel`, account page tab

Primary need #9, the collective half. VWO-30 answers "what does *this project*
use"; this inverts it to "what does this account have, and who is using it".

`accountResources({ team })` returns one object per resource with the projects
attached to it:

```
{ stores:       [{ id, name, type, region, projects[] }],
  integrations: [{ id, name, slug, projects[] }],
  domains:      [{ name, projectName, verified, expiresAt }],
  edgeConfigs:  [{ id, slug, projects[] }],
  orphans:      { stores[], integrations[], domains[] } }
```

`orphans` is the part worth building: a store or a paid integration attached to
**no** project is money leaving the account for nothing, and it is invisible in
the per-project view by definition. Surface it as its own panel with an amber
dot, not as a footnote.

Same three-state panel rule as VWO-30 — *has* / *has none* / *not on this plan*.
Renders as a **Resources** tab on the account page, one `DataTable` per resource
kind, each row expandable to the projects using it, and each project name links
to its project page.
**Done when:** a store used by two projects lists both, an unattached store
appears under orphans, and every row links through.

---

## Phase 5 — Project page

### VWO-24 — Shell and Overview — **BLOCKER, L**
**File:** `admin/src/app/vercels/[id]/projects/[project]/page.tsx` (new)

Header: breadcrumb (account by **label**, never the ObjectId — WO-19) · project
name · right cluster `[Visit ↗] [Deploy ▾] [⋯]`.
Sub-line: `framework · repo · team · last deployed`.
`Deploy ▾`: *Redeploy latest production* · *Deploy a branch…*.
`⋯`: Open on Vercel · Project settings · Delete project.

**Production Deployment panel** (the hero): status dot, deployment URL, commit
message, branch, author, when, and `[Redeploy] [Promote…]`.

Tabs: Overview · Environment · Deployments · Domains · Resources · Settings.
Overview: production URL, git repo (`CopyValue`), framework, node version, root
directory, build/install/output commands, created, project id.
**Done when:** the shell renders and every tab is reachable with real data.

### VWO-25 — Environment tab, read — **BLOCKER, M**
Grouped by key, with a row per `target` + `gitBranch` combination — never a flat
key/value table (delta #2). Columns: Key, Target(s), Branch, Value, Type, Updated, `⋯`.

- Values masked by default, per-row Reveal, a Reveal-all that is itself confirmed.
- `sensitive` rows show a permanent lock with the tooltip "Vercel never returns
  this value to anyone" and offer *Replace*, not *Reveal*.
- `FilterInput` across key and target.
- Download `▾`: `.env (production)`, `.env (preview)`, `.env (development)`,
  `.json (all targets)`. A flat `.env` cannot hold three values for one key, so
  the target is part of the choice, not a setting hidden elsewhere.
**Done when:** one key with three targets shows three rows, a `sensitive` var is
never claimed to have a value, and each download contains exactly its target's set.

### VWO-26 — Environment tab, write — **L**
Inline edit, add row, delete row, and bulk paste from a `.env` block (paste picks
a target first).

Edits **stage locally**. The confirm dialog shows the diff from `diffEnv` —
**names and targets only, never values** — and states plainly which targets are
affected and that production changes take effect on the next deployment (unlike
Heroku, saving does **not** restart anything, and the dialog must not claim it
does). Type-to-confirm the project name when production is among the targets.

**Vercel has no atomic multi-record write.** A staged batch is N requests, and
request 4 of 7 can fail. The controller applies them in order, stops on the first
failure, and returns `{ applied[], failed, remaining[] }`. The UI then shows what
landed, what did not, and offers to retry the remainder — it must not report a
partial write as either a success or a clean failure. One `VercelActivity` row per
batch, `status: 'failed'` when any record failed, with the applied ones still
listed in `changes[]`.
**Env changes do nothing until the next deployment**, and that is primary need
#5's real content. A dashboard user learns this the hard way; this console should
not make them. After a successful batch that touched `production`, the result
panel offers **[Redeploy production now]** as its primary action, with one line
explaining that the running deployment still holds the old values. The button
calls VWO-28's redeploy with the current production deployment id, and the
confirm dialog names both the variables that changed and the deployment that will
be replaced.

The same affordance appears from the other direction in VWO-27: a deployment's
`⋯` menu carries *Edit environment and redeploy*, which opens this tab with the
redeploy step pre-armed. Same flow, two entrances — that pairing is the feature,
not two separate buttons.

Skipping the redeploy is always allowed and must never be a dead end: when
production env differs from what the live deployment was built with, the project
header shows a muted "environment changed since last deploy" note until the next
production deployment lands.
**Done when:** a 3-add / 2-update / 1-delete batch across two targets commits,
a forced mid-batch failure reports exactly what was applied, no value appears in
any activity row, and a production env change offers the redeploy and leaves the
header note when declined.

### VWO-27 — Deployments tab — **L**
List via `pagedGet` with "Load more". Row: state dot, target badge
(production/preview), commit message, branch, author, duration, when, `⋯`.
Filters: target, state, branch.

`⋯` → *View build logs* · *Promote to production* (confirm; names the commit it
will replace) · *Redeploy* · **_Edit environment and redeploy_** (primary need #5
— opens the Environment tab with the redeploy step pre-armed, see VWO-26) ·
*Cancel* (only while `BUILDING`/`QUEUED`) · *Delete* (confirm).

**`QUEUED` is a first-class state here, not an edge case.** Hobby allows one
concurrent build, so a second deploy genuinely waits, and a row that renders
queued as a vague grey "pending" makes a working system look broken. Give it its
own dot tone and the label "Queued — waiting for the current build", and show the
position where the API provides it (VWO-01 #7).

Build logs open in a side panel: mono 12px on `bg.subtle`, newest line visible,
level coloured where parseable, with a one-line warning that build output
routinely contains secrets. Gated on `view-vercel-env`; a role without it sees
the forbidden state naming the permission, not an empty panel.
**Done when:** a promote moves production and the hero panel updates, a cancel
stops a running build, two simultaneous deploys show one building and one clearly
queued, and the logs panel 403s cleanly for a `view-vercel`-only role.

### VWO-28 — Deploy actions — **M**
*Redeploy latest production*: one confirm, fires
`POST /:id/projects/:project/deploy` with the current production deployment id.
*Deploy a branch…*: branch input (a select when `GET /v1/integrations/search-repo`
returns branches — a plain input otherwise, do not block the feature on it),
target select, confirm naming branch and target.
Both land the user on the new deployment's build log.

**The daily deployment cap needs its own error path.** Hobby caps deployments per
day, and hitting it is a normal Tuesday on an account that also serves storefront
deploys from `controllers/hongo`. `toVercelError` maps that response (shape from
VWO-01 #7) to its own message — what the limit is, when it resets, and that
storefront deploys share it — not to a generic "deploy failed". Every other
console action stays usable when it fires.
**Done when:** a branch deploy produces a preview URL, a production redeploy
replaces the live one, and a simulated cap response renders the cap message.

### VWO-29 — Domains tab — **M**
Table: domain, target, verified dot, CNAME/A record, redirect, age. Add domain
(form + the DNS records to set, via `getDomainConfig`), Verify, Remove (confirm).
An unverified domain shows exactly what record to create, in `CopyValue` mono —
that is the only reason anyone opens this tab.
**Done when:** adding a domain shows its DNS instructions and Verify flips the dot.

### VWO-30 — Resources tab — **M**
The direct answer to "what is this project using". Read-only, one `Panel` per
section, each independently tolerant of a missing endpoint (VWO-13).

A panel here has **three** states, not two, and the third is the one that matters
on Hobby: *has resources* · *has none* · **not available on this plan**. The
third says which plan it needs and links to the account page's Plan tile. It is
never rendered as an error and never silently omitted — an operator should be
able to see the shape of what they are not getting.

- **Git** — provider, org/repo, production branch, link to the repo. Available.
- **Stores** — Blob / Postgres / KV / Edge Config: name, type, region, linked
  environments. ⚠ Gated on VWO-01 #3. A 403 there means this panel is a plan
  notice, not a feature.
- **Integrations** — installed marketplace integrations: name, scope, installed by.
  Available on Hobby, though likely empty on this account.
- **Log drains** — believed **Pro and above**; confirm in VWO-01 #5. On Hobby this
  is expected to be the plan-notice state, and it is also the honest answer to
  "where do I send runtime logs" when Phase 7 turns out to be unavailable.
- **Certificates** — CN, issuer, expiry, with an amber dot inside 30 days.
  Vercel manages these automatically for custom domains on every plan.
**Done when:** the Hobby account renders every panel in one of the three states
with nothing showing an error, and each plan notice names the plan it needs.

### VWO-31 — Settings tab — **M**
Read-only project configuration (framework, root directory, build/install/output
commands, node version) with an inline edit for the safe ones via
`PATCH /v9/projects/{idOrName}`, then a **Danger Zone** alone at the bottom:
delete project behind type-the-project-name, ghost red.
**Done when:** a build command edit round-trips and delete is unreachable without
typing the exact name.

### VWO-32 — Create project — **M**
`[New Project]` on the account page: name, framework select, GitHub repo
(`GET /v1/integrations/search-repo` when available, free text otherwise), team,
and an optional starting env block. Posts `/vercels/:id/projects`.
Names the constraint plainly in helper text: a Vercel project name is globally
unique within the team and cannot be changed freely afterwards.
**Done when:** a project is created, appears in the list, and is audited.

### VWO-33 — Storefront projects are guarded — **BLOCKER, M**
**Files:** `backend/lib/vercel/managed.ts` (new), `backend/controllers/vercel/*`,
project list and project page

`controllers/hongo` creates a Vercel project per shop and stores the result in the
`Deployment` model — `vercelId` holds the **Vercel project id**, `vercelName` the
project name, and `shop` the owning shop. Because everything here is one personal
account (delta #1), those storefronts are in the same project list this console
renders. Without a guard, *Delete project* and *Environment → save* in an admin
console reach a paying customer's live shop, and nothing on screen says so.

`isManagedProject(vercelIds[])` → a map of `vercelId → { shop, shopId, slug }`,
resolved in one `Deployment.find({ vercelId: { $in } })` per page rather than per
row. Then:

- The project list shows a **Storefront** tag on those rows, with the shop name.
- The project page header carries the same tag and links to the shop record.
- `ConfirmAction` on **any** destructive or env-writing action against a managed
  project switches to the type-to-confirm variant and names **the shop**, not the
  project: "This will change the live storefront for *Acme Threads*."
- Deleting a managed project is **refused** by the controller with a message
  pointing at the shop's own delete flow. `controllers/hongo/deleteProject.controller.ts`
  is the path that removes a storefront properly, because it also clears the
  `Deployment`, `Shop.deployment` and `PurchasedTheme.isDeployed` links. Deleting
  it from here leaves three dangling references and a shop that believes it is
  deployed.

This is the single guard that makes the rest of the console safe to hand to
someone who did not build it, which is why it is a blocker and not a polish item.
**Done when:** a storefront project is tagged everywhere it appears, its delete is
refused with the shop named, an env write against it requires typing the project
name, and a non-storefront project is unaffected.

---

## Phase 6 — Docs page

### VWO-34 — `/vercel-doc` — **PRIMARY, M**
**File:** `admin/src/app/vercel-doc/page.tsx` (new), mirroring `app/heroku-doc/page.tsx`,
linked from `config.ts` via `guideHref`

Explicitly requested, and structured as **one section per primary need** rather
than as an API tour — someone opens this to do a thing, not to learn Vercel:

1. **Connect an account** — creating a token, why a personal-account token cannot
   be scoped and what that means, connecting more than one account.
2. **Create a project and deploy it** — git connection, first deploy, what to
   expect when the build queues.
3. **Domains** — adding one, the DNS records to set, what "unverified" means.
4. **Usage** — *what these numbers are and are not.* Say plainly that builds and
   build minutes are counted from the deployment list, and that bandwidth and
   function invocations are not available through the API, with the dashboard
   link. This section is the reason the page exists; without it the Usage tab
   reads as complete when it is not.
5. **Environment variables** — the target/branch model, the three types and the
   warning that `sensitive` is unreadable forever, and **the fact that changes
   only take effect on the next deployment**.
6. **Logs** — build logs, where they are, why they are permission-gated, and
   whichever answer VWO-01 #4 produced for runtime logs. If Phase 7 was dropped,
   this section says so and points at the dashboard, rather than the page staying
   silent about a need that was asked for.
7. **Storefront projects** — what the Storefront tag means, why delete is refused
   there, and which flow to use instead (VWO-33).
8. **Permissions** — the seven strings and what each one grants, as a table.

**Done when:** the page renders, the list page's guide link reaches it, all nine
primary needs are addressed including the two constrained ones, and nothing in it
claims a capability VWO-01 did not confirm.

---

## Phase 7 — Runtime logs (experimental, flag-gated)

The Vercel analogue of Heroku's Kolkrabbi decision, under the same conditions.

### VWO-35 — Runtime logs service, isolated — **M**
**File:** `backend/lib/vercel/runtimeLogs.ts` (new — the **only** file that may
reference `/runtime-logs`)

Gated on `VERCEL_EXPERIMENTAL_LOGS=true`. With the flag unset the route returns
**501 Not Implemented** with a message saying the feature is disabled — it must
not 404, so the UI can tell "off" from "broken", and no outbound request is made.

File-header comment states: not in the published SDK, may change without notice,
nothing outside this file may call it. If VWO-01 #2 finds the endpoint does not
exist on this plan, **drop Phase 7 entirely** rather than shipping a dead tab —
log drains (VWO-30) are the supported answer.
**Done when:** with the flag off every call returns 501 and makes no request.

### VWO-36 — Runtime logs UI — **M**
A **Logs** tab beside Deployments, tagged `Experimental` with a tooltip saying it
uses an unpublished API. Controls: deployment select, line count, level filter,
Refresh. No live tail. Same secrets warning as build logs, same
`view-vercel-env` gate. Flag off → one muted line, not an error.
**Done when:** logs render for a real deployment with the flag on and the tab
degrades quietly with it off.

---

## Phase 8 — Verification

### VWO-37 — Automated gates — **BLOCKER, S**
- `npx tsc --noEmit` clean in both repos; `npm run build` succeeds in `admin`.
- Unit tests, all new: `toVercelError` mapping, `withTeam` parameter building,
  `pagedGet` cursor handling, `diffEnv` across targets and branches,
  `toEnvFile` round-trip through the installed dotenv (reuse the Heroku fixtures),
  and the crypto round-trip on `apiToken`.
- Server boots and registers every VWO-15 route; each answers 401 unauthenticated.

### VWO-38 — Secret-leak grep — **BLOCKER, S**
```
grep -rn "select('+apiToken')" backend/            # exactly one hit: resolveToken.ts
grep -rn "runtime-logs" backend/ --include="*.ts"  # exactly one file: lib/vercel/runtimeLogs.ts
grep -rn "decrypt" backend/lib/vercel              # only env.ts
```
Then read every `VercelActivity` row written during VWO-39 and confirm no env var
**value** appears in any of them.
**Done when:** all four are clean and pasted into the PR.

### VWO-39 — Manual pass — **L**
Record results in the PR.
1. Connect the Hobby account → no team picker appears → the account is fully
   usable with `teams[] === []` and `defaultTeamId` unset.
2. Rotate to a token for a *different* Vercel user → refused (VWO-17).
3. Env batch: add, update, delete across two targets in one commit → diff dialog
   correct, activity row holds **names and targets only**.
4. Force a mid-batch env failure → partial-write report is accurate.
5. Promote an older deployment → production URL serves it; audited.
6. Cancel a running build → state goes `CANCELED`.
7. Build logs gated on `view-vercel-env`; a `view-vercel`-only role sees the
   forbidden state naming the permission.
8. Delete project → only reachable by typing the exact name. **Use a throwaway
   project, never a storefront.**
9. **Storefront guard (VWO-33):** a `hongo`-created project is tagged in the list
   and on its page, its delete is refused with the shop named, and an env write
   against it demands the typed project name. Verify against a real `Deployment`
   row, not a fixture.
10. Every Pro-only surface (stores, log drains, runtime logs — whichever VWO-01
    found) renders its plan notice naming the plan, with no error and no empty
    table anywhere.
11. **Usage (VWO-22):** build counts and minutes for a 30-day window reconcile
    against the dashboard's deployment list for the same window, the per-project
    breakdown names the right projects, and the *not available through the API*
    panel is present and names each missing figure.
12. **Resource rollup (VWO-23):** a store or integration attached to two projects
    lists both, an unattached one appears under orphans, and every row links to
    its project page.
13. **Env → redeploy (need #5):** change a production variable, decline the
    redeploy → the header note appears; take it → the new deployment carries the
    new value and the note clears.
14. Queue behaviour: trigger two deploys at once → one builds, one is clearly
    labelled queued.
15. Deployment cap: if the account is near its daily limit, confirm the cap
    message renders; otherwise simulate the response shape from VWO-01 #7.
16. Team scoping still works: connect a second account that *does* have a team
    (a client's, or a throwaway Pro trial) → switcher appears, switching
    re-scopes, and the cache does not serve team A's list under team B. If no
    such account is available, note it in the PR as untested rather than
    claiming it passed.
17. Rate limit: load a project page 10× in a minute, confirm the cache holds and a
    429 renders the error state with a reset time rather than an empty table.
18. Every table at 360px wide — no horizontal page scroll.
19. Both colour modes on every page. Watch for `gray.*` regressions.
20. **`controllers/hongo` storefront deploy still works end to end** — nothing in
    this work order should have touched it, and on a shared account that is worth
    proving, not assuming.

---

## Critical path

```
VWO-01 (spike) ─> VWO-02
   └─> VWO-03, VWO-04 ─> VWO-05
         └─> VWO-06 ─> VWO-07 ─> VWO-08
               └─> VWO-09..13 ─> VWO-14 ─> VWO-15 ─> VWO-16 ─> VWO-17
                                    VWO-18 ─> VWO-19 ─> VWO-20 ─> VWO-21
                                                          ├─> VWO-22, VWO-23
                                                          └─> VWO-24 ─> VWO-25..32
                                                    VWO-33 ─┘  (gates VWO-26, VWO-31)
                                                          VWO-34
                                                    VWO-35 ─> VWO-36
                                                          └─> VWO-37..39
```

### Shipping order, by the nine primary needs

The numbering is dependency order, not priority order. If this ships in slices,
this is the order that puts a usable thing in front of someone soonest:

| slice | delivers | items |
|---|---|---|
| **1 — Foundation** | nothing visible, everything depends on it | VWO-01..17 |
| **2 — See it** | needs #8, #9 (per project) | VWO-18..21, VWO-24, VWO-30 |
| **3 — Ship it** | needs #1, #5, #7 | VWO-27, VWO-28, VWO-32, **VWO-33 first** |
| **4 — Configure it** | needs #2, #4 | VWO-25, VWO-26, VWO-29 |
| **5 — Account view** | needs #3, #9 (collective) | VWO-22, VWO-23 |
| **6 — Logs, docs, proof** | need #6, the docs page | VWO-34..39 |

**VWO-33 leads slice 3, not follows it.** Slice 3 is the first slice that can
touch a live storefront, and the guard has to exist before the button does.

**VWO-01 gates everything** — five of the endpoints this console wants are not in
the installed SDK, and two of the nine primary needs (#3 usage, #6 runtime logs)
are decided entirely by what it finds. Building on a guess is how the Heroku
billing-units problem started.

**VWO-18** (promoting the shared components) has no backend dependency and should
start on day one in parallel; it is also the item most likely to be skipped under
time pressure, which is how two consoles end up with two different tables.

**Rough size:** 39 items, ~17 L / M-heavy. Phases 1–3 are two thirds of the risk
and about a third of the effort; Phases 4–5 are the reverse.

---

## Open decisions

1. **`DELETE /v9/projects/{idOrName}` is specced in (VWO-31)** on the same
   "everything the API can do, the UI can do" instruction the Heroku console got.
   It is the one action here with no undo — deleting a Vercel project takes its
   deployments and its domain attachments with it. Type-to-confirm is the
   mitigation. Worth a second look before VWO-31 ships; dropping it costs nothing
   else in the plan.
2. **`controllers/hongo` uses a global `VERCEL_TOKEN`** while this console stores
   per-account tokens, with more accounts to be added. Two systems, two
   credential models, and `hongo`'s one is pointed at an account this console will
   also manage.
   Consolidating hongo onto a stored account would remove an unrotatable
   full-access token from the environment — but it would put storefront deployment
   on the critical path of an admin feature. **Explicitly deferred**; VWO-33 makes
   the overlap safe without merging them. If it is ever done, it is its own work
   order with its own verification.
3. **`VERCEL_FULL_ACCESS` exists and is used by exactly one controller**
   (`getDomains.ts`) while everything else uses `VERCEL_TOKEN`. Nobody currently
   knows why there are two. Worth finding out independently of this work.
4. **Team scoping is built even though this account has no team** (delta #1). The
   alternative — hardcode the personal scope and add teams later — is cheaper
   today by about a day and costs a migration the first time a client's team is
   connected. The cost of building it now is one helper and one conditional
   render. Worth revisiting only if the answer to "will any Pro account ever be
   connected here" is a firm no.
5. **Hobby is a non-commercial plan, and customer storefronts run on it.** Stated
   in *The account this is built against*; repeated here because it is the only
   item in this document whose worst case takes every shop offline at once and
   whose fix is not code. An upgrade to Pro also unlocks log drains, deployment
   protection and concurrent builds, three things this plan currently renders as
   plan notices.
6. **The Usage tab is derived, not metered** (delta #4, VWO-22). Builds and build
   minutes are real and exact; bandwidth and invocations are absent and labelled
   absent. The alternative — omit the tab until Vercel exposes metered usage —
   was rejected because "how close am I to the build cap, and which project is
   causing it" is answerable today and is most of what the question means in
   practice. If VWO-01 #11 finds a real usage endpoint, this becomes a correction
   to the delta and an addition to VWO-22, not a redesign.
7. **Runtime logs (#6) is the one primary need this plan cannot promise.** It sits
   behind a flag, in one isolated file, and gets dropped outright if VWO-01 #4
   says Hobby cannot see it. Raising it from "maybe" to "yes" is a plan upgrade,
   not a code change — worth knowing before the work starts rather than after.
8. **Build logs are gated on `view-vercel-env` rather than `view-vercel`** because
   builds print env values. If that proves too restrictive, add a dedicated
   permission rather than loosening it — the same call the Heroku work order made.
