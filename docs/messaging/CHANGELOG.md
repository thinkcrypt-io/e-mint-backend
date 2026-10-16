# Messaging — changelog

Newest last. One entry per work order: what, files, how verified.

## M-01 — Plan & docs (2026-10-05)
- `README.md` (layers, what a tenant gets, decisions MD1–MD12, data, where it
  plugs in), `WORK_ORDERS.md` (M-01…M-13 with handoff), this file.
- From the user's request: "email can be a widget, like users can integrate
  their email and send email to clients, newsletters from panel"; "think and plan".
- Checked against the code: `webhooks.function.ts` (record events), the old
  platform's nodemailer sender (`library/controllers/marketing/mail`), SMS and
  WhatsApp controllers, `node-cron` and `aws-sdk` already in package.json,
  `SECRET_ENCRYPTION_KEY` in the environment.

## M-02 — Email core, the organization's own server (2026-10-06)
- **The user's words:** "for email, it can be sent via nodemailer, they would
  manually add their email config, on signup and invite wishlist signup
  everyone gets email." Recorded as MD1′ (README §3).
- **Models:** `MailSettings` (`mailsettings`, one per organization; password
  sealed with `lib/crypto/secret.ts`, `select: false`), `MailMessage`
  (`mailmessages`, kind / to / subject / status / error / messageId, TTL 180
  days). Both shared collections (MD10).
- **`library/functions/mail.function.ts`:** `saveMailSettings` (empty password
  keeps the stored one; connection changes clear "verified"),
  `loadMailConfig`, `sendOrgMail` (nodemailer, 10 s connect timeout, logs
  sent/failed, keeps `verifiedAt` / `lastError`), `mailProblem` (EAUTH, refused
  address, unknown host, refused port, timeout, TLS → plain words),
  `welcomeCustomer`, `mailPage`/`para`/`button`/`esc` (email-safe HTML, values
  escaped). Ports limited to SMTP ones (25, 465, 587, 2465, 2525, 2587); on
  production hosts resolving to private/loopback addresses are refused.
- **Routes:** `/tenant/api/org/mail` GET / PUT / POST /test / DELETE
  (`manage-organization`), `routes-tenant/org/mail.router.ts`. Sidebar:
  Organization → Email.
- **Emails now sent:** a customer signing up on a tenant's site gets a welcome
  from the business (its server; quiet when not set up or switched off);
  MINT's own: "Welcome to MINT" on tenant sign-up, "You're on the MINT
  waitlist — number N" on a new waitlist entry (`MARKETING_URL`, default
  https://mintapp.shop). Invitations, password resets and codes already went
  out (unchanged). All fire after the answer; a mail failure never fails a
  sign-up.
- `sendMail.controller.ts` left on port 587: `MAIL_PORT` is 465 locally but
  587 is what has always worked — not changed.
- **Panel:** `/org/email` (provider presets for Gmail, Outlook, Zoho,
  Namecheap Private Email, Hostinger; status line; Save / Discard / Remove with
  PromptDialog; Send test; the log), guide `/user-docs/email`, GuideLink
  anchors, `tenantApi` `getOrgMail` / `saveOrgMail` / `testOrgMail` /
  `removeOrgMail`.
- **Verified:** new suite `tenancy-smoke/mail.mjs` (30 checks) with a tiny SMTP
  server in the test on 127.0.0.1:2587 — refusals, password never returned,
  test send with From/Reply-To, wrong password and refused address explained,
  welcome sent and HTML-escaped, welcome off, the log, other organizations
  isolated, removal; with `SMOKE_LOG` it also checks MINT's own welcome and
  waitlist emails in the dev log. `run-all.sh` passes (the sign-up rate limit
  needs a backend restart before the last suites, as before).

## M-14 — Email accounts per project (2026-10-16)
- **The user's words:** "connect email accounts under projects … smtp server,
  port, email, password … test result will be red or green … connecting an
  email account should be modal … select which default account to use."
- **Model:** `MailAccount` (`mailaccounts`, shared, filtered by `project`; not
  tenantScoped): name, fromName, host, port, secure (from the port: 465/2465),
  email (login and from), password sealed `select: false`, isDefault,
  verifiedAt / lastError / lastErrorAt. `MailMessage` gains `account`.
- **`mail.function.ts`:** `loadAccountConfig`, `resolveMailConfig` (project
  default → organization server), `verifyMail` (nodemailer `verify()`: connect
  + sign in, nothing sent → `{ ok, message }`), `accountView`, `SECURE_PORTS`;
  `sendOrgMail` takes `meta.account`, falls back as above, keeps the status on
  the account it used; `recentMail(org, limit, project?)`; `welcomeCustomer`
  goes through the project (the organization's welcome switch still applies).
- **Routes:** `routes-tenant/mailAccounts.router.ts` at
  `/tenant/api/p/:project/mail-accounts` — GET (accounts, project log,
  `fallback`), POST /test, POST /, PUT /:id (empty password keeps it),
  POST /:id/default, POST /:id/send-test, DELETE /:id (oldest left becomes the
  default). Saving re-checks the connection without blocking the save.
  History events per change. `mail-accounts` / `email-accounts` reserved as
  model routes; `email-accounts` as a project slug. Project delete removes the
  project's accounts (`projectLifecycle.function.ts`).
- **Panel (mint-tenant + admin):** Project → Email (`/email-accounts`,
  `PROJECT_PAGES`, tenantNav): accounts with Working/Not working, Send from
  (default), ⋯ Make default / Edit / Send a test email / Remove, the log with
  a Through column; `_components/ConnectDialog.tsx` (provider presets, port
  list, Test connection → green/red box, cleared on any edit). Org Email page
  and the automation email hint say projects use their own accounts first.
- **Guide:** mint-docs `/email` — #email-accounts, #connect-email,
  #default-account.
- **Verified:** `scripts/tenancy-smoke/mail-accounts.mjs` 33/33 on a private
  backend (local SMTP sink with logins: test ok/refused/no answer/bad port,
  add, default, sends through the default and a chosen account, fallback to
  the organization, other organizations 404, project delete). `mail.mjs`
  26/26 and `automations.mjs` still pass (its no-server message assertion
  updated). Headless Chrome on mint-tenant: dialog red → green → Connect,
  second account, default switch, send test, log, edit with the saved
  password, 390px with no sideways scroll.

