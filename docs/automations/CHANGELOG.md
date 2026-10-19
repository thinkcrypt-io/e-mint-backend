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

## 2026-10-16 — Failures always end in Runs, never in the save
- The user: "if the automation fails it should log in the automation, do not prevent it from saving the record." Saves were
  already safe (automations start after the save, actions' errors were logged), but an error outside the actions —
  loading the project, the conditions, writing the run — only reached the server log and skipped the page's other
  automations. Now each automation runs in its own try: any error is a failed run ("Couldn't run: …") in its Runs and
  counters, the others still run, and `fireAutomations`' own synchronous part can't throw into the caller.
- Verified: `automations.mjs` (the deal still saves, 201, while its email fails), `automation-pdfs.mjs` (the bill still saves,
  200, while its removed PDF fails the run), `mail-designs.mjs` — all passed; tsc clean.

## 2026-10-19 — AU-03c Email editor; seeing and resending emails
- The user: "on the email writing part, on automation, when a field is inserted it gets inserted at the end not where the
  cursor is … when on editor left click should open option to insert, bold/italic text. Also in case of failed emails,
  should have a resend option … also an eye icon that opens a modal to view the email."
- Writing (panels, both, `src/app/automations/_components`): `PlaceholderText`'s Insert a field puts `{{key}}` at the
  cursor or over the selection (a space where it would touch a word) and puts the cursor after it; new `MessageEditor`
  for the email message — a left click opens a small menu at the pointer once the click has placed the cursor (a drag
  selection too), right-click the same; Insert a field, Bold, Italic, Bulleted list (buttons never take the focus, so the
  selection stays); ⌘B / ⌘I; typing, Escape or a click elsewhere closes it; Preview renders the message with fields as
  chips. Pure helpers in `textEdit.ts` (insertToken, toggleMark — adds or takes off `**`/`*`, toggleList, marksAt,
  previewHtml). A pending edit is kept until the box has caught up, so ⌘B then ⌘I in quick succession compose.
- Formatting (backend `emailBody` / `formatHtml` in automations.function.ts): `**bold**`, `*italic*`, `***both***`,
  runs of "- " lines → a list (even right under a text line), blank line → paragraph. Placeholders are swapped for
  sentinels before formatting and filled (escaped) after, so a value's `*` stays literal; a `*` inside a word (2*3*4)
  isn't italic. The text part has the marks taken out.
- Kept emails (`MailMessage`: `kept`, `text`/`html` select:false, `files` names, `attachments` only while failed, `automation`,
  `run`, `route`, `record`, `design`, `resendOf`, `resent {at, by, status, error, message}`): `sendOrgMail(…, { keep })`;
  with no email account a kept email is logged failed (409 still thrown). The run's id is made before the run so its
  emails point to it. Every address now gets its try — "Emailed a, but not b: …" fails the step (later actions still
  stop). The daily 300 is `emailAllowance()` (429 `email_limit`) and counts resends.
- `mailMessageView`, `findMail`, `resendMail` in mail.function.ts: a resend goes through the project's account as it is
  now, logs a new email with `resendOf`, and records `resent` on the failed one (its files dropped once it went); a sent
  email, or one already resent, is a 400; another project's a 404. Routes: automations router `GET /emails/:id`,
  `POST /emails/:id/resend` (Build, automation kind only), runs carry `emails` (first attempts); mailAccounts router
  `GET /messages/:id`, `POST /messages/:id/resend` (manage projects). History: "resent an … email to …".
- Panels: `SentEmailDialog.tsx` — the eye's dialog (status, resend state, to, subject, files, the error, the HTML in a
  sandboxed iframe or the plain text, Resend in the ModalFooter) and `ResendPrompt` (PromptDialog) + `EmailRowActions`;
  Runs lists each run's emails (open by default when one can be resent); Project → Email's log gets the eye, Resend,
  Resent / A resend. tenantApi: `getSentEmail`, `resendEmail`, `MailLogEntry` fields. GuideLink `automation-emails`.
- Note: messaging MD8 said only the subject is kept — automation emails now keep their body (180 days, same TTL), so they
  can be shown and resent; other kinds unchanged.
- Guide: mint-docs `/automations#automation-emails` (+ `/email#email-log`). Website changelog.
- Verified: new `scripts/tenancy-smoke/automation-email-resend.mjs` 32/32 (in run-all; bold/italic/list in HTML, marks out of
  the text, a value's * kept, one of two addresses refused, resend carrying the PDF, no second resend, a resend failing
  again, no account → failed → resent once connected, the Email log, another project 404); `automations.mjs`,
  `automation-pdfs.mjs`, `mail.mjs`, `mail-accounts.mjs`, `mail-designs.mjs` pass; tsc clean in backend, both panels and
  mint-docs. Browser pane (mint-tenant on a private backend, light and dark): the menu at the pointer with the cursor where
  clicked, a field inserted mid-line, bold/italic on and off keeping the selection, ⌘B/⌘I, typing closing the menu,
  Preview, a field inserted mid-subject, the eye's dialog, Resend from Runs and from Project → Email. Not deployed.

## 2026-10-19 — AU-03d A linked record's details as placeholders
- The user: "like we can enter the member which gives the name, but in case we want to show a detail of the member, for
  example email, or phone number, like nested details, we should be able to enter that too."
- Backend (automations.function.ts): one placeholder pattern (`placeholderRx`) takes `{{key}}` or `{{ref.key}}`;
  `loadRefNames` loads, once per run, the records each used reference field picks (`ctx.linked`, in the field's order) and
  the names of *their* links (so `{{member.company}}` shows a name); `fill` shows each linked record's field with the
  linked page's formatting (`show(…, def)`), several joined by ", ". `checkText` (via `linksOf(def)`, loaded once per
  save) refuses an unknown sub-field ("“nope” isn't a field of Client"), a non-link ("Title doesn't link to another
  record"), more than one level, and password/section fields.
- Panels (both): `placeholdersOf(page, pages)` adds each reference field's page's fields ("Member → Email", group
  "Member"); `PlaceholderText`, `SetRows` and `MessageEditor` take `pages`. The message's click menu groups them under
  "Member's details" and has a search box (Enter inserts the first match) once the list passes 8; Preview chips read
  "Member → Phone".
- Guide (`/automations#automation-placeholders`), website changelog, README placeholder line.
- Verified: `automations.mjs` all passed (new: the three refusals, `{{client.email}}`/`{{client.name}}` saving and a dry run
  reading "Big order for Acme <acme…@example.com> Acme"); `automation-email-resend.mjs`, `automation-pdfs.mjs` pass; tsc clean
  (backend, both panels, docs, website). Headless Chrome on a private stack (the pane was hidden): Jobs → Member, the menu
  listing Member's details, Phone inserted at the cursor as `{{member.phone}}`, the search narrowing to Email, Preview.
  Not deployed.
