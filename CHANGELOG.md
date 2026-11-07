# Changelog

All notable changes to RxPDF Cool. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-11-07

First public release. Everything runs in the browser: no backend, no upload, no
accounts, no telemetry.

### Tools

- **Split** — visual page manager: extract, reorder, rotate, delete, custom
  range, every-N, and visual cuts with per-part or ZIP downloads.
- **Merge** — combine up to 50 PDFs with drag-to-reorder.
- **Compress** — Lossless, Balanced (150 DPI), Small (100 DPI), Target size
  (KB/MB) and Percentage of original, with a bounded DPI/quality search.
- **PDF to images** — PNG/JPEG up to 216 DPI, bundled as ZIP.
- **Watermark** — text, size, colour, opacity and five positions.
- **Page numbers** — start number, five positions, font size.
- **Protect** — real AES-256 (ISO 32000-2 R6) via `@cantoo/pdf-lib`.
- **Unlock** — decrypt with a known password and rebuild an unencrypted copy.
- **Edit** — draw a signature with mouse/touch, add text, images, shapes,
  freehand ink, highlights and cover boxes; move/resize/duplicate/layer objects;
  rotate, duplicate, insert, delete and reorder pages; edit metadata.

### Platform

- **Installable PWA** — manifest, maskable icons, service worker precache,
  address-bar install and an in-app Install button; all tools work offline after
  the first visit.
- **Bilingual UI** — English and Indonesian, switchable in the topbar, saved in
  `localStorage["rxpdf.lang"]`; `?lang=` still wins.
- **Deep links** — `?tab=split|merge|compress|images|watermark|pagenums|protect|unlock|edit`.
- **SEO** — canonical/Open Graph/JSON-LD, `sitemap.xml`, `robots.txt`,
  `llms.txt`.
- **Versioning** — `VERSION` is the single source, stamped into the footer and
  the manifest; asset URLs carry `?v=<content hash>`; the service-worker cache
  name is derived from the version plus every precached file.

### Security and quality

- Vendored pdf.js, `@cantoo/pdf-lib`, JSZip and Inter (no third-party runtime).
- Content-hashed CSS/JS, immutable cache headers for assets, revalidating shell.
- One validation gate for every file (extension, size, `%PDF-`, parse), clamped
  form values, sanitized download names, password fields cleared after use.
- No document data is stored; the only persisted value is the language key.
- `tools/check-i18n.js` (translation coverage), `tools/stamp-assets.js`
  (hashes + precache + version), `tools/serve.py` (correct MIME types).

### Known limitations

- Lossy compression rasterizes pages (text is no longer selectable).
- Editing overlays content; existing text cannot be edited, and "cover" is not
  redaction.
- `pdf.js` 3.11.174 is affected by CVE-2024-4367 (documented, accepted risk).
- Text drawing uses the standard Latin fonts.

[1.0.0]: https://github.com/abidzk01/cool-pdf/releases/tag/v1.0.0