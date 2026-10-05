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
