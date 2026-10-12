# PDF templates — changelog

Newest last. Each entry: what changed, where, how it was checked, commits.

## 2026-10-13 — plan
- The user asked for visually designed PDFs (invoice / bill / receipt first)
  with record data placed by tokens like `{{invoice.total}}`, pre-built
  templates added from the admin panel, templates people can edit, build or
  have AI build, and Download making the PDF.
- Plan written (`README.md`, decisions D1–D13; `WORK_ORDERS.md`, PT-01…PT-10).
  Server-side pdfkit (Heroku can't carry a headless browser), JSON blocks,
  gallery = the super admin's published templates with code starters as the
  fallback, slots mapped to the page's fields when a starter is used.

## 2026-10-13 — PT-01 engine
- `library/functions/pdfTemplates/`: `schema.ts` (normalizeTemplate /
  normalizeSettings — known props only, clamped, errors name the block),
  `tokens.ts` (`{{path | filter:arg}}`, 20 filters, Indian grouping, dates in
  the reader's time zone, amount in words), `fonts.ts` (Geist Sans/Mono +
  PDF built-ins; per-character fallback to Noto Sans Bengali), `images.ts`
  (http(s)/data images, address checked as the socket connects, 5 s / 5 MB,
  WebP/GIF/SVG → PNG via sharp), `render.ts` (layout then draw; own line
  breaker so one line can mix fonts; tables split between rows and repeat
  their heading; header/footer per page with per-record page numbers).
- `starters.ts`: Invoice Classic, Invoice Modern, Bill, Receipt, Compact
  receipt (A5), each with slots + sample data (used from PT-04).
- Fonts: `public/fonts/geist` (OFL, copied from the `geist` package);
  dependency `@fontsource/noto-sans-bengali`.
- Checked: every starter rendered with its sample and looked at as images;
  a 60-row table with Bangla descriptions over 4 pages (heading repeated,
  "Page 3 of 4"), two records in one file; a broken template returns six
  readable errors. Fixed on the way: value columns 6 pt past the edge,
  letter-spaced words running together, bold labels left grey.

## 2026-10-13 — PT-02 storage + API, PT-03 record data, PT-04 starters
- Models `library/models/pdf-templates`: `PdfTemplate` (route, alias,
  isDefault, blocks, lists, slots/sample, `gallery.published/order`, `key`,
  `from`) and `PdfSettings` (key `default`), both tenantScoped.
- `/pdf-templates` (`library/controllers/pdfTemplates`, admin + tenant
  project router): list (?route=), get, create, update, delete (the default
  passes on), `:id/default`, `:id/duplicate`, `settings` GET/PUT, `gallery`
  (super admin's published, else the code starters as `starter:<key>`),
  `gallery/starters` (super admin only: adds the missing built-ins,
  published), `fields/:route`, `render` (sample data, inline or by id),
  `guess`, `use`. Handlers can't crash the process (`safe`).
- Per page: `POST /<route>/export/template { ids, template?, tz? }` behind the
  page's export middleware; no template → the page's default.
- `data.ts`: paths the template reads → populate (two steps, readable fields
  only, access-restricted targets matched), `cleanRecord`, declared `lists`
  (only for readers of that page), the field tree with section lists' fields
  and backlinking pages. `mapping.ts`: synonym/type guesses per slot,
  rewriting tokens (filters' field arguments too) and adding a list when a
  slot is matched to another page.
- `viewDocument.controller.ts` now exports `readable`, `refModelOf`,
  `routeForModel`, `labelOf`, `instanceOf` for reuse.
- Checked: smoke 23/23 on the private server (:5021, Mongo :27997) — gallery
  fallback + seeding, guesses (total→grandTotal, client.name, items →
  item.unitPrice / lineTotal), use-a-starter, downloads (one / two records),
  a payments list, a password token printing nothing, permissions (reader
  lists + downloads, can't edit; no read → 403), one default per page.
  Downloaded files looked at as images.
