# Messaging — email, SMS and WhatsApp for tenants

Planned 2026-10-05 from the user's request: "email can be a widget, like users
can integrate their email and send email to clients, newsletters from panel".
Work orders: `WORK_ORDERS.md`. The site widgets that feed it are in
`../widgets/CATALOGUE.md`.

## 1. What we are building

Email is not one widget. It is a **messaging core in the panel** that a
project's business uses, with **site widgets** that feed it and **events**
that trigger it:

| Layer | What | Examples |
|---|---|---|
| Panel | Set up sending, write templates, send one email to a client from their record, send newsletters, build automations, read the results | "Email this client", a monthly newsletter to subscribers, an overdue-invoice reminder |
| Site widgets | Collect consent and let customers manage it | Newsletter signup (double opt-in), email preferences / one-click unsubscribe, password reset |
| Events | Something happens in a project → a message goes out | Order placed → confirmation; booking tomorrow → reminder; cart left for 2 hours → nudge; leave approved → email |

The same core sends **SMS** and **WhatsApp**: a message is a channel + a
template + a recipient, logged the same way.

## 2. What a tenant gets

**Setting up.** Works on day one with MINT's shared sender (from
"Acme via MINT", replies to the organization's own address). To send from
their own domain they add it, copy the DNS records MINT shows (DKIM, SPF,
DMARC) and MINT checks them. Or they bring their own SMTP server or provider
key (Resend, Postmark, SendGrid, Mailgun), stored encrypted.

**Templates.** A block editor (heading, text, button, image, divider,
columns, a record's fields, a product list) with variables from the project's
models — `{{customer.name}}`, `{{order.code}}`. Desktop and mobile preview,
send a test. Two kinds: **transactional** (order confirmation, password reset
— always sent) and **marketing** (newsletters — only to people who agreed).

**Send one email.** On any record with an email field — a client in a CRM,
an employee, an enquiry — a *Send email* action: pick a template or write
one, attach files from the media library. It's logged on the record's
history. Replies go to the organization's own inbox (reply-to); a panel inbox
comes later (M-11).

**Newsletters (campaigns).** Choose an audience — the project's customers,
newsletter subscribers, or any model with an email field narrowed by the same
filters the tables use — write it, schedule or send now. Reports: delivered,
opened, clicked, unsubscribed, bounced. Every marketing email carries an
unsubscribe link and the one-click unsubscribe header Gmail and Yahoo require.

**Automations.** A trigger, optional waits and conditions, then actions.
Triggers: a record created or changed (the same hook webhooks use), a date
field reached (a booking's date, an invoice's due date), a form submitted, a
cart left behind, a schedule. Actions: send an email, SMS or WhatsApp; call a
webhook; update a field. Ready-made recipes: order confirmation and shipping
updates, booking confirmation and a reminder the day before, welcome series,
abandoned cart, review request, overdue invoice, leave approved, birthday.

**SMS and WhatsApp.** SMS through a Bangladeshi gateway (the old platform
already integrates one) and Twilio elsewhere. WhatsApp through the WhatsApp
Business Cloud API — business-initiated messages need templates Meta
approves, so it comes after email and SMS.

## 3. Decisions (proposed — the user decides MD1–MD4)

| # | Decision | Why |
|---|---|---|
| MD1 | **Amazon SES** for MINT's own sending (shared sender and verified tenant domains); bring-your-own SMTP / provider as the alternative. | MINT already runs on AWS (S3); SES is the cheapest at volume and verifies domains per tenant. Resend is simpler but costs more. |
| MD2 | A **shared sending domain** on MINT's domain (e.g. `mail.mintapp.shop`), separate from the marketing site's mail. | One tenant's bad list must not hurt MINT's own email. Needs DNS records from the user. |
| MD3 | **Quotas per organization** (emails and SMS a month, by plan), new organizations start low until their first sends go cleanly. | Sending costs money, and spam from one tenant hurts every tenant on the shared sender. Numbers are the user's call. |
| MD4 | **Double opt-in** for newsletter signups. | Clean lists, proof of consent, far fewer complaints. |
| MD5 | **Transactional and marketing kept apart** — separate sending streams; an unsubscribe never blocks an order confirmation or password reset. | The law and the mailbox providers treat them differently. |
| MD6 | **Consent is data**: per project and address — subscribed / unsubscribed / bounced / complained, with source, time and IP. Suppressed addresses are never sent marketing. | GDPR proof; deliverability. |
| MD7 | **The guard pauses a sender automatically** when its bounce rate passes 5% or complaints 0.1%, and tells the organization why. | Protects the shared sender's reputation. |
| MD8 | **A message log** for every send (channel, recipient, template, campaign or automation, record, status, provider id), kept 180 days. | Answering "did they get it?", reports, billing. |
| MD9 | **Sending runs in the background**: a Mongo-backed job queue, batched to the provider's rate, run by the web dyno for now and a worker dyno when volume needs it. | Campaigns can be thousands of emails; no request should wait for them. |
| MD10 | **Messaging collections are shared and scoped** (`tenantScope`), never one per project. | The production cluster counts collections (see the Atlas note in multi-tenancy WORK_ORDERS). |
| MD11 | **Templates ship messages**: a `messages` part in template blueprints — E-commerce ships order emails, Booking API its confirmation and reminder. | A template's project sends the right emails on day one. |
| MD12 | **Explained everywhere** — a guide (`/user-docs/email`), a doc link on every screen, DNS records explained in plain words. | The user's standing rule. |

## 4. Data (all shared, scoped collections — MD10)

| Collection | Holds |
|---|---|
| `MessagingSettings` (per organization) | Sender identities (domains, status, DNS records), default from name, reply-to, postal address (required for marketing), provider (MINT / own SMTP / provider key, encrypted with `SECRET_ENCRYPTION_KEY`), quotas and usage |
| `MessageTemplate` (per project) | Key, name, channel, kind (transactional / marketing), subject, preheader, blocks, variables |
| `Consent` (per project + address or phone) | Status, lists or topics, source, time, IP, double opt-in token |
| `Campaign` (per project) | Audience (customers / subscribers / a model + filters), content, schedule, status, totals |
| `Automation` (per project) | Trigger, conditions, steps (wait, send, webhook, update), on/off, run counts |
| `Message` (log, TTL 180 days) | Channel, to, template, campaign / automation, record, status history, provider id, error |
| `Job` | Queue: run-at, kind, payload, attempts, lock |

## 5. Where it plugs in

- `library/functions/webhooks.function.ts` already fires on every record
  create/update/delete (record history + public router) — automations listen
  at the same place.
- The old platform's `nodemailer` SMTP sender (`MAIL_HOST`), SMS gateway and
  WhatsApp code are the starting point for the channel adapters.
- Customer accounts (`routes-public` auth) gain password reset, email
  verification and magic links once the core exists (M-04).
- Panel: a **Messages** area per project (Email setup, Templates, Campaigns,
  Automations, Log); a *Send email* action on record pages; usage on the
  organization's billing page.
