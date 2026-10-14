# Automations — work orders

Plan: `README.md`. Log: `CHANGELOG.md`. Commit and push each WO when it's done
(backend → `mint` v3; mint-tenant and admin → `origin` main; mint-docs and
mint-webpage → `origin` main), then go on.

## Status

| WO | Title | Repo | Size | Status |
|---|---|---|---|---|
| AU-01 | Plan & docs | backend | S | done 2026-10-14 |
| AU-02 | Engine + API: models, triggers, conditions, five actions, limits, chain guard, runs log, dry run | backend | L | done 2026-10-14 |
| AU-03 | Panel: Build → Automations — list, editor, dry run, runs; guide; website | panels + docs | L | open |
| AU-04 | Date-reached and schedule triggers (job queue), waits | both | L | later |
| AU-05 | MCP tools, recipes, template blueprints | both | M | later |

## Handoff

- Dev: private backend from `git archive HEAD` + changed files (another session may have work in progress in the
  tree), `PORT=5031`, Mongo `27996`; panel launch config `mint-tenant-5031` (:3033).
- Smoke: `scripts/tenancy-smoke/automations.mjs` (in `run-all.sh`).

## AU-02 — Engine + API (L)

- `Automation` (tenantScoped): name, enabled, route, on[], changed[], when[], match, actions[], secret (select:false),
  stats {runs, failures, lastRunAt, lastStatus, lastError}, createdBy.
- `AutomationRun` (tenantScoped, TTL 30 days): automation, name, route, record, event, status
  success|failed|skipped, steps [{type, ok, detail}], error, depth.
- `fireAutomations({ route|model, event, doc, changes?, actor? })` beside `fireWebhooks` in recordHistory and the public
  router; background, scoped; filters, limits, chain guard (AsyncLocalStorage), actions, log.
- Actions: notify (people, actor), email (people, actor, email fields, typed addresses — org SMTP, kind `automation`),
  webhook (signed POST), update (this / via a reference field; values, copies, clear), create (another page).
  Placeholders `{{field}}`, `{{link}}`, `{{page}}`, `{{project}}`, `{{actor}}`, `{{event}}`, `{{today}}`.
- API `/p/:project/automations` (Build): list, get, create, update, delete, runs (one / all), dry run on a record.
  Saving checks the page, fields, references, conditions, recipients, the webhook address, the create page.
- Done when: smoke covers each trigger, each action, conditions, changed-fields, the limits, a chain stopping at 3,
  failures logged, permissions, dry run; neighbouring suites pass.

## AU-03 — Panel (L)

- Sidebar Build → Automations (`/automations`), for Build.
- List: name, the sentence ("When a Deal is changed …"), on/off switch, last run, runs/failures.
- Editor (dialog, steps): Trigger (page, events, changed fields), Conditions (ConditionsEditor), Actions (add, order,
  remove; each with its own form and placeholder chips), Dry run on a record. Errors under the field, as in the builder.
- Runs: newest first, each step's result; per automation and for all.
- Guide in mint-docs (`/automations`, doc links on each panel/dialog), website changelog, both panels.
