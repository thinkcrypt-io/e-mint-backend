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

## 2026-10-14 — AU-03 Panel, guide, website
- Sidebar Build → Automations (`tenantNav`, after PDF templates; `automations` reserved as a project address).
- Panels (mint-tenant + admin, same files): `src/app/automations` — list (sentence, on/off, last run, counts, last error),
  editor dialog (name; when: page, created/changed/deleted, changed fields; only if: the shared ConditionsEditor; then:
  action cards with "Insert a field" placeholders, order, remove; webhook secret), Try on a record (dry run), Runs tab
  (filter by automation/result, each step). Server refusals show under their input (`on`) and in the footer.
  `tenantApi` hooks, `automation` notification icon, GuideLink anchors, PROJECT_PAGES / TENANT_ONLY_PAGES.
- Guide: mint-docs `/automations` (in the Build group). Website changelog.
- Verified: tsc clean in both panels; screenshots on a private stack (list, runs with a failed email, editor top and
  actions, a `{{nope}}` refused under Title, Try dialog).

## 2026-10-16 — AU-03a Email to a linked record's address
- The user: when a bill is created, email its customer — choose which field holds the address. `to.fields` now takes
  `customer.email` (a reference field of the record, then an email/text field of the page it links to) beside the
  record's own fields; `checkAddressField` checks it at save (400 on `actions.<i>.to.fields`), `addressesAt` reads the
  linked records (up to 20) at run time.
- Panels (mint-tenant + admin, same files): the email action's "Send to the address in a field…" picker — the record's
  email fields and each linked page's ("Customer → Email"); text fields only when named like an email, so no more
  "The record's Name"; chosen ones listed with a remove button; a hint when no page has an Email field.
- Guide (mint-docs `/automations`) and website changelog.
- Verified: `automations.mjs` all passed (new: unknown linked field refused, a non-link path refused, a dry run emailing
  the client's address and the deal's own); tsc clean in backend and both panels; the picker on a private stack (a Bill
  linked to Customers offers only "Customer → Email"). Not deployed.

## 2026-10-16 — AU-03b PDFs attached to emails
- The user: "if we have a PDF linked to a model … when a bill is created we'd like to send the invoice to the client's email
  too … as an attachment. In automation we can link the PDFs too."
- `printRecords` pulled out of `exportTemplate.controller.ts` (the page's download uses it unchanged); the email action
  takes `attach` (≤ 3 published PdfTemplates of the same page — a draft, another page's or a delete-only automation is a
  400 on `actions.<i>.attach`). At run time `attachmentsOf` prints each for the record as the automation's maker
  (`resources(null)` — in a project scope the registry needs no app), with linked records and lists; a removed or
  drafted template fails the step ("better no email than one without its invoice"). `sendOrgMail` takes `attachments`.
  The dry run and Runs name the files.
- Panels (both): "Attach PDFs" under the message — the page's published templates as checkboxes, or a hint to make one.
- Guides: mint-docs `/automations` (Send an email) and `/pdf-templates` (Downloading). Website changelog.
- Verified: new `scripts/tenancy-smoke/automation-pdfs.mjs` all passed (save checks, dry run naming the file, the customer's
  email carrying "Invoice B-1001.pdf", a real 12 KB PDF showing the linked customer's name and both bill lines, a
  removed template failing the run with nothing sent) — in run-all; `pdf-templates/smoke.mjs`, `automations.mjs`,
  `mail-designs.mjs`, `business.mjs` still pass; tsc clean (backend, both panels, docs). Panel: the option listed the
  page's Invoice and saved `attach`. Not deployed.
