# Multi-tenancy — changelog

Newest last. One entry per work order (or per meaningful step inside one):
date, WO, what changed, files, how it was verified, and anything the next
agent must know. Keep entries factual; decisions live in README.md.

---

## 2026-10-02 — WO-01 Plan & docs
- Wrote `README.md` (goals, decisions D1–D13, architecture, naming, glossary)
  and `WORK_ORDERS.md` (WO-01…WO-19, execution order).
- Inputs: the user's requests in the session of 2026-10-02 — registration with
  business questions, organizations with email invitations and 2FA, projects
  holding models, per-tenant sidebar/dashboard/builders, tenant MCP keys,
  public APIs with optional customer auth and a login widget, website projects
  (configuration, pages, SEO, contents, analytics — like the AGS backend), and
  the tenant panel using the same `components/library` UI components.
- Prior state: backend `fca8140` (mint v3), admin `68878b2` (origin v3).
  The super-admin `WebContent` model (`/web-contents`, ModelDefinition
  `6abeb61bc9633b0e4f72c98f`) was built the same day and is the template for
  the website kit's `WebContent` (WO-18).
