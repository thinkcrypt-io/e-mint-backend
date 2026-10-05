# Messaging — work orders

Plan: `README.md`. Site widgets: `../widgets/` (CATALOGUE, WORK_ORDERS).

## Handoff — read this first (last updated 2026-10-05)

Planned only; nothing built (W-05 cart, the step before M-02, done
2026-10-05). MD1–MD4 (provider, shared domain, quotas,
double opt-in) wait on the user. Suggested order, interleaved with the
widget work orders: **W-05 cart → M-02 core → M-03 templates → M-04
customer auth emails → W-06/W-07 payments and checkout (order confirmation
email) → W-07b** — then M-05/M-06/M-07 with W-08 forms and W-14 Collection,
then M-08 campaigns and M-09 automations with W-09 booking reminders, then
M-10 SMS/WhatsApp and M-11 inbox. Commit and push each WO when it's done.

## Status

| WO | Title | Repo | Size | Status |
|---|---|---|---|---|
| M-01 | Plan & docs | backend | S | done 2026-10-05 |
| M-02 | Core: channels, message log, job queue, MINT sender on SES, suppression list, bounce/complaint handling, quotas | backend | L | open |
| M-03 | Templates: block editor, variables from models, preview, test send; system templates | both | L | open |
| M-04 | Customer auth emails: password reset, email verification, magic link; login widget upgrade | both | M | open |
| M-05 | Send one email from any record; logged on its history; attachments | both | M | open |
| M-06 | Own domain (DKIM/SPF/DMARC shown and checked); bring-your-own SMTP or provider key | both | M | open |
| M-07 | Contacts & consent; newsletter signup widget (double opt-in); preferences and one-click unsubscribe | both | M | open |
| M-08 | Campaigns: audiences, compose, schedule, batched send, reports | both | L | open |
| M-09 | Automations: triggers, waits, conditions, actions; recipes | both | L | open |
| M-10 | SMS (Bangladeshi gateway, Twilio) and WhatsApp Cloud API channels | both | L | open |
| M-11 | Inbox: replies, live chat, WhatsApp threads | both | L | later |
| M-12 | Templates + MCP: blueprint `messages` part; MCP tools to draft templates and campaigns | both | M | after M-09 |
| M-13 | Guides (`/user-docs/email`) + marketing site | admin + website | M | with each WO |

## M-02 — Core (L)
Channel adapters (email first: SES, SMTP, provider keys), `Message` log,
`Job` queue with a worker loop, batching to the provider's rate, the shared
sender (MD2), suppression list, SES bounce and complaint notifications (SNS →
webhook), automatic pause (MD7), monthly quotas and usage (MD3).
**Done when** a test email to a verified address is delivered and logged, a
bounce suppresses the address, and a quota stops sending with a clear message.

## M-03 — Templates (L)
`MessageTemplate`; block editor in the panel; variables picked from the
project's models; email-safe HTML rendering (tables, inline styles, dark
mode); preview at desktop and mobile width; send a test. System templates
seeded per project: password reset, verify email, order confirmation, booking
confirmation, shipping update.

## M-04 — Customer auth emails (M)
Password reset (expiring token), email verification, sign-in by link or
code; the login widget gains "Forgot password?" and "Email me a link".

## M-05 — Send from a record (M)
A *Send email* action on any record whose model has an email field; template
or free text; attachments from the media library; a history entry on the
record; replies to the organization's reply-to.

## M-06 — Own domain and providers (M)
Add a domain → DNS records shown with plain explanations → checked until
verified; from addresses on it. Or SMTP / Resend / Postmark / SendGrid /
Mailgun credentials, encrypted, with a test.

## M-07 — Contacts & consent (M)
`Consent`; newsletter signup widget with double opt-in; preference page and
one-click unsubscribe (List-Unsubscribe headers); import a list with a
consent statement; export.

## M-08 — Campaigns (L)
Audience: customers, subscribers, or any model with an email field narrowed
by table filters; content from a template; schedule or send now; batched;
reports (delivered, opened, clicked, unsubscribed, bounced, complained) with
the caveat that opens are estimates (Apple Mail).

## M-09 — Automations (L)
Triggers from record events (webhooks hook), date fields, forms, abandoned
carts, schedules; waits and conditions; actions: send (any channel), webhook,
update a field. Recipes for every T-13 template.

## M-10 — SMS and WhatsApp (L)
SMS through the Bangladeshi gateway and Twilio; WhatsApp Cloud API with
Meta-approved templates; both logged in `Message` and counted in quotas.

## M-11 — Inbox (L) — later
Inbound email replies, live chat (widget #44) and WhatsApp threads in one
inbox per project, by customer.
