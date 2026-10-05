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
