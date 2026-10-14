# Automations — changelog

Newest last. One entry per work order or meaningful step: what changed, files, how it was verified.

## 2026-10-14 — AU-01 Plan & docs
- `docs/automations/README.md` (design, decisions A1–A10 — assumed defaults, the user asked to plan and execute),
  `WORK_ORDERS.md` (AU-01…05), this log. Messaging's M-09 points here.

## 2026-10-14 — AU-02 Engine + API
- Models `Automation`, `AutomationRun` (both tenantScoped; runs TTL 30 days); deleted with the project.
- `library/functions/automations.function.ts`: `checkAutomation` (400s carry `on`, the input's path), `fireAutomations`
  (after the response, in scope; changed-fields filter, conditions via `meets`, 500 runs/hour, chain guard by
  AsyncLocalStorage — depth ≤ 3, no repeat of an automation on a record), actions notify / email (org SMTP, kind
  `automation`, 300/day) / webhook (signed with the automation's `whsec_` secret, same address rules) / update (this or a
  reference field, up to 20 records, `doc.save()` + History "Automation “X” …") / create (another page; `from: '_id'`
  links back), placeholders (references by name, dates by day), `dryRun`.
- Hooks: `recordHistory` (every panel write, with its changes and the person), the public router (create/update/delete,
  actor "Website") and checkout payments (actor "Checkout"), each beside `fireWebhooks`.
- `routes-tenant/automations.router.ts` at `/p/:project/automations` (Build): list, runs (all / one), get (with secret),
  create, update, PATCH on/off, dry run, delete; project History entries.
- Verified: new `scripts/tenancy-smoke/automations.mjs` (41 checks: save checks, a won deal notifying + webhook + updating
  its client + adding a task, changed-field filter, email failure logged and stopping the rest, counters, dry run, off,
  chain stopping at 3 with a skipped run, delete trigger, list/runs/delete, project delete) — added to run-all; in order on
  a fresh DB: admin…secrets, projects, comments, project-invites, activity, business, webhooks, collections, access,
  widgets, widgets-cart; linked-relationships smoke. tsc clean. Not deployed.

