# Work Order — Heroku Console

**Scope:** a full Heroku management console inside the admin. Multiple accounts,
searchable apps, config vars (read + edit + download), deploys, dynos, logs,
maintenance mode, add-ons, domains, dyno hours and billing.
**Status:** Phases 0–6 implemented. Phase 7 (Kolkrabbi) and Phase 8 (manual
verification against a live account) not started.
**Audit date:** 2026-09-21 (revision 3 — implementation notes below)

Each item: **files → change → done-when**. `BLOCKER` marks items that gate later work.
Sizes: **S** ≤ 1h, **M** ≤ half-day, **L** ≤ 2 days.

Paths are from the monorepo root `/Users/asifistiaque/Desktop/proj/e-mint`.
Backend and admin are **separate git repos** — do not expect one commit to span both.

---

## Implementation status

| Phase | State |
|---|---|
| 0 — Foundation | done, and now unit-tested |
| 1–3 — Model, routes, first pages | done |
| 3.5 — Defect fixes (WO-15…24) | **done**, WO-19/20 folded into WO-31 |
| 4 — Backend expansion (WO-25…29) | **done** — 26 routes register and are auth-gated |
| 5 — UI kit + account page (WO-30, 31) | **done** |
| 6 — App page (WO-32…37) | **done** — 7 tabs |
| 7 — Kolkrabbi (WO-38, 39) | **not started** |
| 8 — Verification (WO-40, 41) | WO-41 gates pass; WO-40 needs a live key |

Verified by execution, not by reading:
- `npx tsc --noEmit` clean in both repos; `npm run build` succeeds in `admin`.
- 17 unit tests pass (`backend`): crypto round-trip, `.env` quoting round-trip
  through the installed dotenv, Range header construction, config-var diffing.
- Server boots and registers all 26 Heroku routes; each answers 401 unauthenticated.
- WO-41 greps: exactly one `select('+apiKey')`, zero `kolkrabbi` references, and
  the audit model has no value field.

**Not verified** — needs a real Heroku API key and a login, neither of which
this session had: every item in WO-40, and the unit questions in Open Decisions.
The pages have never been rendered against real data.

Two follow-ups found while implementing:
- `jest.config.ts` had no `moduleNameMapper` for the repo's `.js` ESM import
  style, so **every** suite failed to load. Fixed, plus `/dist/` ignored.
- `lib/functions/convertToOptions.ts` returned `undefined` for nullish input,
  contradicting its own return type. Its test had been failing silently behind
  the jest config problem. Fixed.

---

## Revision 2 — what changed

Revision 1 was cut down to "view and download the env keys, nothing
experimental". That restriction is **lifted**. The instruction now is: a
Vercel-quality UI where *everything the API can do, the UI can do* — redeploy,
maintenance mode, branch switching, logs — plus dyno hours and current spend on
the account page, and search across an account's apps.

Two decisions were taken explicitly and are **not** open for an agent to revisit:

1. **Kolkrabbi is allowed, behind a flag.** Branch switching and GitHub-connected
   deploys need `kolkrabbi.heroku.com`, which is undocumented and unsupported.
   It is approved **only** under the conditions in Phase 7: one isolated file,
   one env flag, and every surface it powers labelled experimental in the UI.
   Nothing outside `lib/heroku/kolkrabbi.ts` may call it.
2. **No charting library.** Dyno hours and spend are stat tiles and a breakdown
   table. Do not add recharts/d3/visx, and do not hand-roll a chart — numbers
   only was the explicit choice.

### Still out of scope

- Heroku Postgres / Redis data APIs (`api.data.heroku.com`) — separate service,
  separate work order if ever wanted.
- Pipelines, review apps, app transfers, Heroku Spaces.
- Persisting config var **values** anywhere. Still absolute (see Non-negotiables).

---

## Background

### The framework this plugs into

Models are 4-file folders (`model.ts`, `settings.ts`, `config.ts`,
`document.types.ts`), exported from `backend/models/index.ts`, mounted in
`backend/routes-admin/admin.router.ts` via
`defineRoutes({ Model, settings, permission, frontendConfig, customRoutes })`
(`backend/routes-admin/common/router.ts`).

`settings.ts` drives everything through `constructConfig`
(`backend/lib/configurator/constructConfig.ts`). Three flags matter here:

| flag | effect |
|---|---|
| `edit: true` | field enters `EDITS.allowEdits` **and** the UPDATE Joi validator |
| `exclude: true` | field is appended to `QUERY_OPTIONS.exclude` as `-field` |
| `required: true` | field becomes `.required()` in the INSERT validator |

The INSERT validator contains **every** settings key regardless of `edit`; the
UPDATE validator contains only `edit: true` keys. That asymmetry is what lets
`apiKey` be settable on create and rejected on a generic update.

### What already exists and is verified

Phases 0–3 shipped. Both repos type-check clean. Verified by execution, not
reading:

- **Crypto** (`backend/lib/crypto/secret.ts`) — AES-256-GCM round-trip,
  non-deterministic ciphertext, tamper detection, wrong-key detection,
  malformed-input rejection. 9/9.
- **Key containment** — exactly one `select('+apiKey')` in the codebase
  (`controllers/heroku/resolveToken.ts:22`). No response path carries the key.
- **Multi-line config values** (PEM blocks) round-trip through dotenv 16.4.5.

Working endpoints: `POST /verify`, `PUT /:id/key`, `GET /:id/account`,
`GET /:id/apps`, `GET /:id/apps/:app`, `GET /:id/apps/:app/config-vars`,
`GET /:id/apps/:app/config-vars/download`.

Working pages: `/herokus` (list), `/herokus/[id]` (account),
`/herokus/[id]/apps/[app]` (config vars, read-only).

**Phase 3.5 below lists ten open defects from the review. Fix those first** —
several are in files Phases 4–6 will touch heavily, and rebasing a redesign on
top of known-broken quoting is wasted work.

### The Heroku API surface

Everything here is in the Platform API reference unless marked ⚠.
https://devcenter.heroku.com/articles/platform-api-reference

| purpose | call |
|---|---|
| account identity | `GET /account` |
| rate budget | `GET /account/rate-limits` |
| invoices | `GET /account/invoices`, `GET /teams/{team}/invoices` |
| dyno hours & spend | `GET /accounts/{account_id}/usage/monthly?start=YYYY-MM&end=YYYY-MM` |
| apps | `GET /apps`, `GET /apps/{app}` |
| rename / maintenance | `PATCH /apps/{app}` body `{ name }` or `{ maintenance }` |
| destroy | `DELETE /apps/{app}` |
| config vars | `GET` / `PATCH /apps/{app}/config-vars` (a `null` value deletes a key) |
| releases | `GET /apps/{app}/releases`, `POST /apps/{app}/releases` body `{ slug }` |
| builds | `GET /apps/{app}/builds`, `POST /apps/{app}/builds` body `{ source_blob: { url, version } }` |
| dynos | `GET /apps/{app}/dynos`, `DELETE /apps/{app}/dynos` (all), `DELETE /apps/{app}/dynos/{dyno}` (one) |
| scaling | `GET` / `PATCH /apps/{app}/formation` body `{ updates: [{ type, quantity, size }] }` |
| logs | `POST /apps/{app}/log-sessions` body `{ lines, source, dyno, tail: false }` → fetch the returned `logplex_url` |
| add-ons / domains / collaborators | `GET /apps/{app}/addons`, `/domains`, `/collaborators` |
| ⚠ GitHub link | `GET`/`PATCH https://kolkrabbi.heroku.com/apps/{app_id}/github`, `POST .../github/push` — **undocumented, Phase 7 only** |

**Pagination:** `releases`, `builds` and `dynos` are Range-paginated. Send
`Range: version ..; order=desc, max=50` and read the `Next-Range` response
header. `backend/lib/heroku/range.ts` (WO-25) owns this.

**Units are not documented reliably.** Before labelling anything in the billing
or usage UI, hit a real account and confirm whether `charges_total` is dollars or
cents, and whether `usage.dynos` is dyno-hours or dyno-units. Do not guess, and
do not let the UI say "$" until it is confirmed.

### Non-negotiables

1. **The plaintext API key never leaves the backend.** `select: false` +
   `exclude: true` + the single resolver. Removing any one breaks it.
2. **Config var *values* are never written to Mongo** — not to a cache, not to
   the audit log. The audit log records key *names* and whether a value changed,
   never a before/after value.
3. **Every mutating call is audited** (WO-26) and **confirmed in the UI** before
   it fires. No one-click restarts of production.
4. Kolkrabbi only under Phase 7's conditions.

### House conventions

- **Tabs** for indentation, **single quotes**, semicolons.
- Backend is ESM: relative imports carry the **`.js` extension** even from `.ts`.
- **Never run `npx prettier`** in this repo. No config exists; it reformats to
  2-space/double-quote defaults against the codebase convention. Fix by hand.
- Backend `tsconfig` targets **es2016** — `Object.fromEntries` and
  `Array.prototype.flat` will not type-check. Use `reduce` / `Object.keys`.
  (The admin targets ES2017 with `lib: esnext`, so it is unrestricted.)
- Admin is Chakra UI **v3**. Copy idioms from
  `admin/src/components/library/utils/inputs/VVariant.tsx` (tables) and
  `.../VSeo/VSeo.tsx` (tabs).
- Confirm dialogs use `GenericModal` from `@/components/library/modals`.
- **No `backdropFilter` blur** on any overlay. Dim the scrim instead.
- Prefer semantic tokens (`fg`, `fg.muted`, `border`, `bg.subtle`) or
  `neutral.*` over raw `gray.*` — the `gray` scale is collapsed onto brand
  values in `admin/src/theme/colors.theme.ts` and goes black-on-black in dark mode.

---

## Design language — read before writing any Phase 5/6 component

The brief is "like Vercel". That means specific things, not just "modern".
Build these once as shared components (WO-30) and use them everywhere.

**Restraint.** Monochrome base, one accent, colour used only to carry meaning.
A page should read as text and rules, not as a field of coloured boxes.

**Status is a dot, not a badge.** An 8px filled circle plus plain-text label.
`green` running · `neutral` idle/off · `amber` building/pending ·
`red` crashed/failed · `blue` maintenance. Reserve filled badges for the one
place a status is the subject (the account header), not for every table row.

**Panels, not cards.** `borderWidth='1px'`, `borderColor='border'`,
`borderRadius={radius.CONTAINER}`, `bg='bg.panel'`, **no shadow**. A panel has a
header row (title left, actions right) separated by a 1px rule, then body at
16px padding. Shadows are what make an admin look dated.

**Type scale.** Page title 20px/600. Panel title 14px/600. Body and table cells
13px/400. Metadata and helper text 12px/400 in `fg.muted`. Monospace
(`fontFamily='mono'`) for anything copied verbatim: config values, git URLs,
release ids, log lines, dyno names.

**Tables.** Horizontal row rules only — no vertical borders, no zebra striping.
Column headers 11px, uppercase, `letterSpacing='0.04em'`, `fg.muted`. Row hover
`bg.subtle`. Right-align every numeric column. Row actions live in a trailing
`⋯` menu, never as a row of visible buttons.

**Action hierarchy.** One primary (solid) action per view, at most. Everything
else is `variant='outline'` or `variant='ghost'`. Destructive actions are ghost
with `colorPalette='red'` and live at the bottom of a Settings tab or inside a
`⋯` menu — never adjacent to a benign action.

**States are designed, not defaulted.** Every async surface needs four:
*loading* is a skeleton shaped like the content (never a centred spinner),
*empty* is a centred one-line explanation plus at most one action,
*error* is one plain sentence in `fg.error` with a Retry,
*forbidden* (403 from the permission split) says which permission is missing.

**Search is instant and local.** The apps list is already fully fetched, so
filtering is client-side on every keystroke with no debounce and no request.
Leading magnifier icon, `size='sm'`, placeholder naming the fields it matches,
a clear affordance, and a live "N of M" count.

**Density.** 24px between panels, 16px inside them, 8px between a label and its
value. Tables cap at `maxW='1200px'`. Long values truncate with a tooltip, they
do not wrap and reflow the row.

**Motion.** Hover and focus transitions only, ≤120ms. No entrance animation on
data.

---

## Phase 3.5 — Outstanding defects from the review

**BLOCKER for everything after it.** These are real, confirmed by execution.

### WO-15 — `.env` download corrupts values containing `"` — **BLOCKER, S**
**File:** `backend/lib/heroku/configVars.ts:24`
`escapeEnvValue` emits `KEY="say \"hi\""`. dotenv 16.4.5 (the installed version)
unescapes **only** `\n` and `\r` inside double quotes — never `\"` — so it parses
back with the backslashes intact. Confirmed against the installed dotenv.
Single-quoted values are fully literal in dotenv, so prefer them:
```ts
if (value === '') return '';
if (!/[\s"'#\\]/.test(value)) return value;
// Literal in dotenv — ", #, \ and real newlines all survive untouched.
if (!value.includes("'")) return `'${value}'`;
// dotenv unescapes \n and \r only inside double quotes; \" is NOT unescaped,
// so a value holding both ' and " has no faithful .env form — use .json.
return `"${value.replace(/\n/g, '\\n').replace(/\r/g, '\\r')}"`;
```
**Done when:** a value containing `"`, one containing `'`, and a PEM block all
round-trip through `dotenv.parse` unchanged, with a test covering each.

### WO-16 — Edit form shows an unsaveable API Key field — **S**
**File:** `backend/models/heroku/settings.ts:7`
Add `readOnlyOnUpdate: true` to the `apiKey` `schema` block. `apiKey` is in
`formFields` and `edit-server-modal` serves that layout for updates, but
`edit: false` makes the generic PUT answer `Invalid fields: 'apiKey' not allowed`.
`createType` gates on `type == 'update' && isReadOnly`, so create stays editable.
**Done when:** Edit Details renders the key field read-only and saving other
fields succeeds.

### WO-17 — Download failures are silent — **S**
**Files:** `admin/src/components/library/store/services/herokuApi.ts:63`, the app page
The empty catch swallows 403 and 429. Destructure `isError, error` from the
mutation and render `<Toast isError={isError} error={error} />`.
**Done when:** a 403 download shows a toast naming the missing permission.

### WO-18 — Blob URL never revoked — **S**
**File:** `admin/src/components/library/store/services/herokuApi.ts:55`
Add `window.URL.revokeObjectURL(url)` after `link.remove()`. The blob is a file
of production secrets held for the tab's lifetime.
**Done when:** no live blob URLs after a download completes.

### WO-19 — Breadcrumb shows a raw ObjectId — **S**
**File:** `admin/src/app/herokus/[id]/apps/[app]/page.tsx:64`
Superseded by WO-30's shared header if that lands first — otherwise fetch the
stored record and use `label`.

### WO-20 — Key rotation is unreachable — **M**
**Files:** `herokuApi.ts`, account page
`PUT /:id/key` works but has no client. `useVerifyHerokuKeyMutation` is exported
(line 76) and never used. Add a `rotateHerokuKey` mutation and a Rotate Key
modal that pre-flights with `verify`, then rotates. Folded into WO-31.

### WO-21 — Both download buttons share one spinner — **S**
Track the in-flight format, or call the mutation hook once per button.

### WO-22 — Ineffective skip guard — **S**
**File:** `admin/src/app/herokus/[id]/page.tsx`
`skip: !id || stored?.status === 'invalid'` evaluates before `stored` loads, so
one request fires against a known-bad key. Use `!id || !stored || stored.status === 'invalid'`.

### WO-23 — Counter hook can save a document with no `code` — **S**
**File:** `backend/models/heroku/model.ts`
The catch calls `next()` without the error, so a Counter failure yields
`code: undefined` on a `unique` path — the second occurrence then fails on a
duplicate null. Pass `next(error)`. This diverges from the `credentials` model's
pattern; that is intentional, note it in a comment.

### WO-24 — Inaccurate permission comment — **S**
**File:** `backend/routes-admin/admin.router.ts:957`
The `create-heroku-config` substitution is correct — the `Permission` model has
only create/view/edit/delete slots. But the comment's claim that it can be
"relabeled Download" is wrong: `getAdminPermissionList` builds the label as
`"Create " + permission.name`. Reword, and name the seeded Permission doc
`Heroku Config Download` so the Role UI reads sensibly.

---

## Phase 4 — Backend expansion

### WO-25 — Range pagination helper — **BLOCKER, S**
**File:** `backend/lib/heroku/range.ts` (new)
`rangedGet(token, path, { order = 'desc', max = 50, cursor })` sends
`Range: version ..; order=<order>, max=<max>` (or the raw `cursor` when
continuing) and returns `{ items, nextRange }` from the `Next-Range` header.
**Done when:** `releases`, `builds` and `dynos` all paginate through it.

### WO-26 — Audit model — **BLOCKER, M**
**Files:** `backend/models/heroku/activity.model.ts` (new), export from `models/index.ts`
`HerokuActivity`: `{ account (ref), appName, action, summary, changes[], performedBy,
performedByName, status: 'success'|'failed', errorMessage, createdAt }`, indexed
`{ account: 1, createdAt: -1 }`.

**Config var changes record key names and a change *kind* only** —
`{ key, kind: 'added'|'updated'|'removed' }`. Never a value, on either side.
That distinction is the whole difference between an audit log and a second copy
of the secrets.

A `recordActivity({ req, account, appName, action, summary, changes, status, errorMessage })`
helper wraps it, and **every** mutating controller calls it on both paths.
**Done when:** a restart, a config change and a failed rollback each leave one row.

### WO-27 — Short-TTL cache — **M**
**File:** `backend/lib/heroku/cache.ts` (new)
In-process TTL map keyed by `accountId + path`. The app page fires ~8 requests
against a 4500/hour budget shared by every admin on that key.
TTLs: apps 60s, app detail 30s, formation/dynos 10s, addons/domains 120s,
releases/builds 15s. **Config vars and logs are never cached.** Every mutating
controller invalidates that account's keys explicitly.
**Done when:** reloading the app page twice in 30s produces one set of upstream
calls, and a restart invalidates the dyno entry immediately.

### WO-28 — Service layer — **BLOCKER, L**
**Files:** `backend/lib/heroku/` — extend
```
deploys.ts    listReleases, rollback(slug), reRelease(currentSlug),
              listBuilds, createBuild({sourceUrl, version})
dynos.ts      listDynos, restartAll, restartOne, getFormation,
              updateFormation(updates)
appAdmin.ts   setMaintenance(enabled), rename(name), destroy()
logs.ts       fetchLogs({lines, source, dyno}) — POST a log-session, then GET
              the returned logplex_url. That URL is pre-signed: fetch it WITHOUT
              the Authorization header, and never hand it to the browser.
resources.ts  listAddons, listDomains, listCollaborators
billing.ts    listInvoices (personal + team), monthlyUsage({start, end})
```
Every function returns a camelCase shape; no snake_case reaches a controller.
**Done when:** each has a controller and all snake_case is confined to `lib/heroku`.

### WO-29 — Controllers and routes — **BLOCKER, L**
**Files:** `backend/controllers/heroku/*`, `backend/routes-admin/admin.router.ts`

| method | path | permission |
|---|---|---|
| get | `/:id/billing` | `view-heroku` |
| get | `/:id/usage?start&end` | `view-heroku` |
| patch | `/:id/apps/:app/config-vars` | `edit-heroku-config` |
| get | `/:id/apps/:app/releases` | `view-heroku` |
| post | `/:id/apps/:app/releases/:release/rollback` | `edit-heroku` |
| post | `/:id/apps/:app/redeploy` | `edit-heroku` |
| get | `/:id/apps/:app/builds` | `view-heroku` |
| post | `/:id/apps/:app/builds` | `edit-heroku` |
| get | `/:id/apps/:app/dynos` | `view-heroku` |
| post | `/:id/apps/:app/restart` | `edit-heroku` |
| post | `/:id/apps/:app/dynos/:dyno/restart` | `edit-heroku` |
| get/patch | `/:id/apps/:app/formation` | `view-heroku` / `edit-heroku` |
| patch | `/:id/apps/:app/maintenance` | `edit-heroku` |
| patch | `/:id/apps/:app/rename` | `edit-heroku` |
| delete | `/:id/apps/:app` | `delete-heroku` |
| get | `/:id/apps/:app/logs` | `view-heroku-config` |
| get | `/:id/apps/:app/addons` · `/domains` · `/collaborators` | `view-heroku` |
| get | `/:id/activity` | `view-heroku` |

Notes:
- **Logs carry secrets.** Applications print tokens and connection strings to
  stdout constantly. Gate logs behind `view-heroku-config`, not `view-heroku`,
  and set `Cache-Control: no-store`.
- `PATCH config-vars`: compute the key-level diff, call Heroku, then
  `recordActivity` with the key names. Respond with the new full set.
- Every mutating route: `recordActivity` on success **and** failure.
- `adminPermissions` takes an array and the `Permission` model has only
  create/view/edit/delete slots — reuse the nearest verb and name the seeded
  Permission doc so `"<Verb> <name>"` reads correctly (see WO-24).
**Done when:** every row returns its shape against a real account, and the
server logs one `📍 Registering custom route:` line per entry.

---

## Phase 5 — Shared UI shell and the account page

### WO-30 — Shared Heroku UI kit — **BLOCKER, L**
**Files:** `admin/src/app/herokus/_components/` (new)
Build the Design Language section once:
```
Panel.tsx          bordered container + header row + actions slot
StatTile.tsx       label, big number, optional sub-line; grid-friendly
StatusDot.tsx      8px dot + label, the five states
DataTable.tsx      header/row rules, hover, right-aligned numerics, ⋯ slot
FilterInput.tsx    instant local search, magnifier, clear, "N of M"
EmptyState.tsx     icon + line + one action
ErrorState.tsx     sentence + Retry, and a 403 variant naming the permission
PanelSkeleton.tsx  content-shaped skeletons
ConfirmAction.tsx  GenericModal wrapper: title, consequence line, typed
                   confirmation for destructive actions, loading state
CopyValue.tsx      mono text + copy button + copied state
PageHeader.tsx     breadcrumb, title, status, action cluster
```
`ConfirmAction` must support **type-to-confirm** (the user types the app name)
for destroy and for config var writes that restart a production app.
**Done when:** every Phase 5/6 page is assembled from these, with no bespoke
panel or table markup.

### WO-31 — Account page — **L**
**File:** `admin/src/app/herokus/[id]/page.tsx` (rewrite)

Header: breadcrumb · `{label}` + status dot · right cluster `[Sync] [Rotate Key] [⋯]`.
Sub-line: `accountEmail · Key ••••1234 · N requests remaining this hour`.
`⋯` holds Edit Details, Open on Heroku, Delete.

Stat row — four `StatTile`s: **Apps**, **Dyno Hours (this month)**,
**Month-to-date spend**, **Latest invoice** (amount + state + period).
Confirm the units against a live response before adding a currency symbol.

Tabs (`Tabs.Root` subtle, `lazyMount`):
- **Overview** — account detail grid: email, name, verified, 2FA, default team,
  created, last login, linked client/project, note.
- **Apps** — `FilterInput` over name / team / region, a team filter chip row when
  more than one team is present, then `DataTable`: Name (+ maintenance dot),
  Region, Stack, Dynos, Last Released, `⋯` (Open · Restart · Toggle maintenance ·
  Open on Heroku). Row click opens the app page.
- **Billing** — invoice table: number, period, charges, credits, total, state.
- **Usage** — month range selector, per-app breakdown table (app, dyno-hours,
  add-ons, data, partner, total) with a totals row. **No chart.**
- **Activity** — the `HerokuActivity` feed for this account.

Rotate Key: modal, pre-flight with `verify`, then `PUT /:id/key`, using
`ui/password-input.tsx`.
**Done when:** every tab renders all four states, and search filters without a request.

---

## Phase 6 — The app page

### WO-32 — App shell and Overview — **BLOCKER, L**
**File:** `admin/src/app/herokus/[id]/apps/[app]/page.tsx` (rewrite)

Header: breadcrumb (account by **label**, not id) · app name · maintenance pill
when on · right cluster `[Visit ↗] [Redeploy ▾] [⋯]`.
Sub-line: `region · stack · team · last released`.
`Redeploy ▾`: *Restart dynos* · *Re-release current slug* · *Build from URL…*.
`⋯`: Toggle maintenance · Rename · Open on Heroku · Delete app.

**Current Release panel** (the hero, Vercel's Production Deployment analogue):
status dot, `v123`, description, who, when, and `[Rollback] [Restart]`.

Tabs: Overview · Config Vars · Deploys · Dynos · Logs · Add-ons · Domains · Settings.

Overview: web URL, git URL (`CopyValue`), buildpack, stack, region, owner, team,
slug size, repo size.
**Done when:** the shell renders and every tab is reachable with real data.

### WO-33 — Config Vars, editable — **L**
Keep reveal / copy / download. Add: inline edit, add row, delete row, and
bulk paste from a `.env` block.

Edits **stage locally** and commit as one `PATCH`. The confirm dialog shows the
key-level diff (added / updated / removed, names only) and states plainly that
**saving restarts the app**. Type-to-confirm the app name.
**Done when:** a staged multi-key change commits as one request, appears in
`HerokuActivity` with names only, and no value is ever logged.

### WO-34 — Deploys — **L**
Release list via `rangedGet` with "Load more". Each row: version, description,
status dot, user, when, `⋯` → *Rollback to this release* (confirm, names the
version it will restore). Build list with status and source. "Build from tarball
URL" form (`sourceUrl`, `version`) — helper text explaining a GitHub tarball URL
works here.
**Done when:** a rollback succeeds, is audited, and the Current Release panel updates.

### WO-35 — Dynos and scaling — **M**
Formation table: process type, size, quantity, inline quantity stepper and size
select, Save per row. Dyno list: name, state dot, command, uptime, `⋯` → Restart.
`[Restart all]` in the panel header, confirmed.
**Scaling costs money** — the confirm dialog must say so.
**Done when:** scaling web 1→2 persists and shows in the formation table.

### WO-36 — Logs — **M**
Controls: line count (100/500/1500), source (app/heroku), dyno filter, Refresh.
Mono, 12px, on `bg.subtle`, scrolled to the newest line, with the level coloured
where parseable. No live tail in this phase — a Refresh button only.
Panel carries a one-line warning that logs routinely contain secrets.
**Done when:** logs render for a real app and the view is gated on `view-heroku-config`.

### WO-37 — Add-ons, Domains, Settings — **M**
Add-ons: name, plan, state, price. Domains: hostname, kind, CNAME, ACM status.
Both read-only.
Settings: rename (confirm), maintenance toggle, and a **Danger Zone** —
destroy app behind type-the-app-name confirmation, ghost red, alone at the bottom.
**Done when:** rename and maintenance round-trip; destroy is unreachable without
typing the exact name.

---

## Phase 7 — GitHub integration (experimental, approved under conditions)

### WO-38 — Kolkrabbi service, isolated — **M**
**File:** `backend/lib/heroku/kolkrabbi.ts` (new — the **only** file that may
reference `kolkrabbi.heroku.com`)
`getGithubLink(token, appId)`, `setBranch(token, appId, branch)`,
`setAutoDeploy(token, appId, enabled)`, `deployBranch(token, appId, branch)`.
Base `https://kolkrabbi.heroku.com`, `Authorization: Bearer <heroku token>`.

Gated on `HEROKU_EXPERIMENTAL_GITHUB=true`. When unset, the routes return **501
Not Implemented** with a message saying the feature is disabled — they must not
404, so the UI can tell "off" from "broken".

File-header comment must state: undocumented, unsupported, may break without
notice, and that nothing outside this file may call it.
**Done when:** with the flag off, every Kolkrabbi route returns 501 and no
outbound request is made.

### WO-39 — Branch UI — **M**
In the Deploys tab, behind the flag: a **GitHub** panel with an
`Experimental` tag — connected repo, current branch (select, populated from the
link response), auto-deploy toggle, and `[Deploy branch]`.
When the flag is off the panel renders a single muted line saying the
integration is disabled, not an error.
The tag needs a tooltip: this uses an unsupported Heroku API and may stop
working without notice.
**Done when:** switching a branch and deploying it works with the flag on, and
the panel degrades quietly with it off.

---

## Phase 8 — Verification

### WO-40 — Manual pass — **L**
Record results in the PR. Beyond the Phase 3 list:
1. Config var edit: add, update, delete in one commit → diff dialog correct,
   one `PATCH`, `HerokuActivity` row holds **names only**.
2. Rollback → app serves the older release; audited.
3. Scale web 1→2 → `heroku ps` agrees.
4. Maintenance on → the maintenance page serves; pill appears everywhere.
5. Logs gated on `view-heroku-config`; 403 renders the forbidden state.
6. Destroy app → only reachable by typing the exact name. **Use a throwaway app.**
7. Rate limit: load the app page 10× in a minute, confirm the cache holds the
   budget and a 429 renders the error state rather than an empty table.
8. Every table at 360px wide — no horizontal page scroll.
9. Both colour modes on every page. Watch for `gray.*` regressions.

### WO-41 — Secret-leak grep — **BLOCKER, S**
```
grep -rn "select('+apiKey')" backend/          # exactly one hit: resolveToken.ts
grep -rn "kolkrabbi" backend/ --include="*.ts" # exactly one file: lib/heroku/kolkrabbi.ts
```
Then read every `HerokuActivity` row written during WO-40 and confirm no config
var **value** appears in any of them.
**Done when:** all three are clean and pasted into the PR.

---

## Critical path

```
Phase 3.5 (WO-15..24)
  └─> WO-25, WO-26, WO-27 ─> WO-28 ─> WO-29 ─┬─> WO-31 ─────────────┐
                                  WO-30 ─────┴─> WO-32 ─> WO-33..37 ─┴─> WO-40 ─> WO-41
                                                     WO-38 ─> WO-39 ─┘
```

WO-30 (the UI kit) gates every page and has no backend dependency — start it in
parallel with Phase 4 on day one. Phase 7 is independent and can slot in late.

---

## Open decisions

1. **`DELETE /apps/{app}` is specced in (WO-37) because the instruction was
   "everything the API can do, the UI can do".** It is still the one action here
   that destroys production with no undo, from a panel whose other actions are
   all recoverable. Type-to-confirm is the mitigation. Worth a second look before
   WO-37 ships — dropping it costs nothing else.
2. **`GET /apps` returns every app across every team the token can see.** If a
   real account returns hundreds, WO-31's Apps tab needs server-side paging, not
   just a client-side filter. Check the real number before building WO-31.
3. **Units in billing and usage are unconfirmed.** See Background. Do not ship a
   currency symbol or an "hours" label until a live response proves it.
4. **Logs are gated on `view-heroku-config` rather than `view-heroku`** because
   apps print secrets to stdout. If that turns out to be too restrictive in
   practice, add a dedicated permission rather than loosening it.
