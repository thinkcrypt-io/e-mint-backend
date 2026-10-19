# Automations — work orders

Plan: `README.md`. Log: `CHANGELOG.md`. Commit and push each WO when it's done
(backend → `mint` v3; mint-tenant and admin → `origin` main; mint-docs and
mint-webpage → `origin` main), then go on.

## Status

| WO | Title | Repo | Size | Status |
|---|---|---|---|---|
| AU-01 | Plan & docs | backend | S | done 2026-10-14 |
| AU-02 | Engine + API: models, triggers, conditions, five actions, limits, chain guard, runs log, dry run | backend | L | done 2026-10-14 |
| AU-03 | Panel: Build → Automations — list, editor, dry run, runs; guide; website | panels + docs | L | done 2026-10-14 |
| AU-03a | Email to the address in a linked record's field (a bill's Customer → Email) | backend + panels + docs | S | done 2026-10-16 |
| AU-03b | Email attachments: the page's published PDF templates printed for the record (a bill's invoice to its customer) | backend + panels + docs | S | done 2026-10-16 |
| AU-03c | Email editor (field at the cursor, click menu: bold / italic / list, preview); every automation email kept — the eye shows it as sent, Resend for a failed one | backend + panels + docs | M | done 2026-10-19 |
| AU-04 | Date-reached and schedule triggers (job queue), waits | both | L | later |
| AU-05 | MCP tools, recipes, template blueprints | both | M | later |

## Handoff

- Dev: private backend from `git archive HEAD` + changed files (another session may have work in progress in the
  tree), `PORT=5031`, Mongo `27996`; panel launch config `mint-tenant-5031` (:3033).
- Smoke: `scripts/tenancy-smoke/automations.mjs`, `automation-pdfs.mjs`, `automation-email-resend.mjs` (all in `run-all.sh`;
  the last two run SMTP sinks on :2587 / :2525 — not beside `mail-accounts.mjs`).

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

## AU-03c — Email editor, seeing and resending emails (M)

- The user: "when a field is inserted it gets inserted at the end not where the cursor is … on editor left click should
  open option to insert, bold/italic text. Also in case of failed emails, should have a resend option … also an eye icon
  that opens a modal to view the email."
- Panel: Insert a field goes in at the cursor / over the selection (subject, title, values); the email message is
  `MessageEditor` — a click (after the cursor lands) or right-click opens a menu at the pointer: Insert a field, Bold,
  Italic, Bulleted list; ⌘B/⌘I; Preview. Marks: `**bold**`, `*italic*`, "- " lines (server `emailBody`/`formatHtml`).
- Backend: automation emails keep text + HTML (`MailMessage.kept`), the run/record they came from, and their files while
  failed; every address gets its try; no account → logged failed (resendable). Runs carry `emails`; `GET/POST
  /automations/emails/:id[/resend]` (Build) and `/mail-accounts/messages/:id[/resend]` (manage projects).
- Done when: smoke `automation-email-resend.mjs`; both panels; guide + website.
