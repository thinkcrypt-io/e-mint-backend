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
