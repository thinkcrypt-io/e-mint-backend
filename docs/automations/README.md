# Automations — overview

**Start here.** This folder is the plan for **Automations** in tenant projects:
"when a record is created or changed, and it matches these conditions, then send
an email, call a webhook, update or create a record, or notify someone." Read
this file, then `WORK_ORDERS.md`; every step is logged in `CHANGELOG.md`.

It is messaging's M-09 (docs/messaging README §2, "Automations"), started with
record triggers; date and schedule triggers, waits, SMS/WhatsApp and recipes
follow (§7).

## 1. The user's words (2026-10-14)

> Next feature: automations — "When a record is created or changed, and it
> matches these conditions, then send an email, call a webhook, update or
> create another record, or notify someone." The pieces already exist: the
> conditions editor, Linked Relationships, email over each organization's own
> server, webhooks, and notifications. … plan and execute.

## 2. Automations vs Linked Relationships

| | Linked Relationships | Automations |
|---|---|---|
| When | **During** the save, before the response | **After** the save, in the background |
| On failure | The save is refused and rolled back | The save stands; the run is logged as failed |
| Does | Changes the record this one picks (stamps, balances) | Emails, webhooks, notifications, updates, new records |
| Where | A page's builder tab | Build → Automations (spans pages) |

Rule of thumb in the guide: if the record must not save without the other
change, use a Linked Relationship; if it's something that should *follow* a
save, use an automation.

## 3. An automation

```ts
type Automation = {
  name: string;
  enabled: boolean;
  route: string;                       // the page whose records start it
  on: ('create' | 'update' | 'delete')[];
  changed?: string[];                  // update: only when one of these fields changed
  when?: Condition[];                  // {field, op, value} — the shared ConditionsEditor shape
  match?: 'all' | 'any';
  actions: Action[];                   // 1–10, run in order; the first failure stops the rest
};

type Action =
  | { type: 'notify'; to: Recipients; title: string; message?: string }
  | { type: 'email'; to: Recipients & { emails?: string[] }; subject: string; body: string;
      design?: string;                   // a MailDesign of the project (docs/messaging M-03a); none: the default
      attach?: string[] }                // ≤ 3 published PdfTemplates of this page, printed for the record (AU-03b)
  | { type: 'webhook'; url: string }                      // signed with the automation's secret
  | { type: 'update'; target: 'this' | string;            // 'this', or a reference field of the record
      set: { field: string; value?: any; from?: string; clear?: boolean }[] }
  | { type: 'create'; route: string;
      set: { field: string; value?: any; from?: string }[] };

type Recipients = {
  people?: string[];      // project members, by id
  actor?: boolean;        // whoever made the change
  fields?: string[];      // email: address fields — the record's own ("email") or a linked record's ("customer.email")
};
```

Text (titles, subjects, bodies, set values) takes **placeholders**:
`{{<field key>}}` (a reference shows the picked record's name; a date its day), `{{<reference>.<field>}}` — a
field of the linked record, one level (`{{member.email}}`; several linked records joined by commas),
`{{link}}` (the record in the panel), `{{page}}`, `{{project}}`, `{{actor}}`,
`{{event}}`, `{{today}}`.

## 4. How a run works

```
any write (panel, API, bulk, import, another automation)
  → recordHistory / public router → fireAutomations({ route, event, doc, changes, actor })
      after the response (setImmediate), in the project's scope:
      automations on this page and event, enabled
        → changed-fields filter (update) → conditions (record as saved)
        → limits (runs/hour, emails/day) → chain guard (depth ≤ 3, no repeats)
        → actions in order → AutomationRun log + counters on the automation
```

- **Acts as the automation**, not the person: an update/create needs no
  permission of the person who saved — whoever can *build* the project made
  the rule. History reads "Automation “Overdue reminder” updated …".
- **Writes by actions are records like any other**: they write History, fire
  webhooks and can start other automations — up to 3 deep, and never the same
  automation on the same record twice in one chain.
- **Delete**: the record is gone; actions read its last values. `update`
  with target `this` is refused at save time for delete-only automations.

## 5. Where things are

| Part | File |
|---|---|
| Models | `library/models/tenancy/automation.model.ts`, `automationRun.model.ts` |
| Engine | `library/functions/automations.function.ts` |
| API | `routes-tenant/automations.router.ts` → `/tenant/api/p/:project/automations` |
| Hooks | `recordHistory.function.ts`, `routes-public/public.router.ts` |
| Panel | `src/app/automations` (mint-tenant + admin), sidebar Build → Automations |
| Smoke | `scripts/tenancy-smoke/automations.mjs` |
| Guide | mint-docs `/automations` |

## 6. Decisions

| # | Decision | Status |
|---|---|---|
| A1 | Run **after** the save, in the background; never block or undo it (that's Linked Relationships) | assumed 2026-10-14 |
| A2 | Act as the automation (the project), not the person; only roles with **Build** create, change or see them | assumed |
| A3 | One shared, scoped `Automation` collection and an `AutomationRun` log kept 30 days (TTL), never one per project (Atlas collection cap) | assumed |
| A4 | Phase 1 triggers: created / changed (optionally: only when chosen fields change) / deleted, plus conditions. Date-reached and schedules need the job queue — phase 2 | assumed |
| A5 | Actions run in order; the first failure stops the rest and the run is "failed" with the reason | assumed |
| A6 | Chains at most 3 deep; an automation never runs twice on the same record in one chain | assumed |
| A7 | Limits per project: 500 runs an hour, 300 automation emails a day; at most 10 typed email addresses per action | assumed |
| A8 | Webhook action: same address rules as project webhooks (no private/metadata addresses in production), signed with the automation's own secret, one try, 10 s | assumed |
| A9 | Tenant projects only for now; the super-admin panel later | assumed |
| A10 | "Run on a record" in the editor is a **dry run**: it shows what each action would do, sends and writes nothing | assumed |

The "assumed" ones are the defaults taken to build without stopping; each is
easy to change.

## 7. Later (phase 2+)

Date reached (a booking tomorrow, an invoice due) and schedules — with the
Mongo job queue (messaging MD9); waits between actions; SMS/WhatsApp (M-10);
ready-made recipes and template blueprints shipping automations (M-12); MCP
tools to read and write automations; the super-admin panel.
