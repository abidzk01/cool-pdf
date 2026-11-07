# RxPDF Cool

A free, open-source, **100% client-side PDF toolkit**. Nine PDF tools that run
entirely in your browser — your files never leave your device. The page opens
straight on the tools: a compact topbar, one line of copy, then the drop zone.

- **Architecture reference:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- **Security policy & threat model:** [`SECURITY.md`](SECURITY.md)
- **Brand assets:** [`assets/`](assets/) (app icon, favicons)

## Features

| Tool | What it does |
| --- | --- |
| ✂️ **Split PDF** | Extract pages, reorder, rotate or delete visually, then cut the document into parts with one click |
| 🔗 **Merge PDFs** | Combine multiple PDFs into one, drag to reorder |
| 🗜️ **Compress PDF** | Five modes: Lossless re-save, Balanced (150 DPI), Small (100 DPI), Target size (KB/MB) and Percentage of original. Lossy modes rasterize each page, so expect unselectable text |
| 🖼️ **PDF → Images** | Export every page as PNG or JPEG, up to 216 DPI |
| 🔏 **Watermark** | Stamp text on every page with custom size, opacity, position and colour |
| 🔢 **Page Numbers** | Add configurable page numbers in any position and format |
| 🔒 **Password Protect** | **AES-256** encrypt your PDFs in one click |
| 🔓 **Unlock PDF** | Remove the password from a PDF you own |
| 🖊️ **Edit PDF** | Draw a signature with mouse/touch, add text, images, shapes, freehand ink, highlights or cover boxes, rotate/duplicate/insert/delete pages, and edit metadata |
| 🌐 **Bilingual UI** | English and Indonesian, switchable from the topbar (`EN` / `ID`); no reload and no storage |

## Privacy by design

This is a **static site**: one HTML shell plus first-party CSS, JavaScript,
fonts and icons. There is
no server upload, no telemetry, no analytics, no tracking, no cookies and no
fingerprinting. Your documents are never stored: the only value saved locally is
your language choice (`localStorage["rxpdf.lang"]`). Every PDF you process is
handled locally by JavaScript in your own browser tab. Close the tab and it is
gone.

The Content Security Policy has **no third-party origin** — even the Inter font
and the brand icons are first-party (`vendor/`, `assets/`). See
[`SECURITY.md`](SECURITY.md) for the full threat model and hardening details.

## Tech stack

| Layer | Choice |
| --- | --- |
| App | HTML + CSS + vanilla JavaScript, `'use strict'`, **no framework** |
| Structure | `index.html` markup shell + `assets/css/*.css` + `js/*.js`, classic scripts in dependency order (no modules, no bundler) |
| Build | **None.** No npm, no bundler, no `node_modules`, no transpiler |
| PDF read/render | [pdf.js](https://mozilla.github.io/pdf.js/) `3.11.174` — page counts, thumbnails, page→image |
| PDF read/write | [@cantoo/pdf-lib](https://www.npmjs.com/package/@cantoo/pdf-lib) `2.11.1` — create, copy, merge, draw, **AES-256 encrypt/decrypt** |
| ZIP | [JSZip](https://stuk.github.io/jszip/) `3.10.1` |
| Font | [Inter](https://rsms.me/inter/) variable, self-hosted WOFF2 |
| Brand | `assets/` — square app icon, `favicon.ico`, 32×32 PNG, Apple touch icon |
| i18n | `js/i18n-data.js` (English→Indonesian strings) + `js/i18n.js` (`t()`, `data-i18n`, language switch); the choice is saved in `localStorage["rxpdf.lang"]`, `?lang=` still wins |
| Concurrency | One Blob Worker (from an inline source string) for Split and Merge |
| Hosting | Any static host; `netlify.toml` ships the security headers (CSP, `X-Frame-Options`, `nosniff`, …) |

All four vendored assets are recorded with version, source URL, license and
SHA-256/SHA-384 in [`vendor/README.md`](vendor/README.md).

> **Note on `pdf-lib`:** upstream `pdf-lib@1.17.1` silently ignores
> `save({ userPassword })` and cannot open encrypted documents. This project
> uses the API-compatible MIT fork `@cantoo/pdf-lib`, which is what makes the
> Protect and Unlock tools real rather than cosmetic.

## Requirements

### To use the app

- A modern browser: Chrome/Edge 90+, Firefox 88+, Safari 14+.
- That is all. Files up to 1.5 GB / ~3,000 pages are supported in principle;
  large files need proportionally more RAM.

### To run it locally

- Python 3 **or** any static file server.
- Use the included dev server — it sets the correct MIME types:

  ```bash
  python tools/serve.py 8000
  # open http://127.0.0.1:8000/
  ```

  > **Windows note:** `python -m http.server` reports `.js` as `text/plain`,
  > which makes the browser refuse the Split/Merge worker
  > (`importScripts` MIME error). `tools/serve.py` fixes this.
  >
  > **Opening `index.html` from `file://`:** the page renders, but `file://`
  > blocks Blob workers, so Split and Merge will not run. Serve it over HTTP.

### To develop

- A text editor. Markup lives in `index.html`; CSS and JS live in `assets/css/` and `js/`.
- Optional: Node 18+ if you want to script PDF fixtures for manual testing.

## Usage

1. Open the page — the tools are already on screen, no intro to scroll past.
2. Pick a tool from the tab bar, drop a PDF on the dashed zone (or click to
   browse), and adjust its options.
3. Press the primary action button. The result downloads immediately — nothing
   is uploaded and nothing is kept.

Use **EN / ID** in the topbar to switch language. The choice is saved in
`localStorage["rxpdf.lang"]`, so the next visit opens in the same language; a
`?lang=id` link still overrides it. The topbar also links to the support page
(<https://teer.id/rxdiag>) and the footer links to
<https://rxdiag.my.id>.

## Project structure

```text
pdf-studio/
├── index.html                 # Markup shell (~570 lines): head, topbar, hero,
│                              # tabs, panels, footer, signature modal
├── netlify.toml               # Static publish root + security headers (CSP)
├── README.md                  # This file
├── CONTRIBUTING.md            # How to contribute, code style summary
├── SECURITY.md                # Threat model, hardening, known limitations
├── LICENSE                    # MIT
│
├── assets/
│   ├── css/                   # Styles split by concern, loaded in this order:
│   │   ├── theme.css          #   tokens, font, reset, base
│   │   ├── layout.css         #   app shell, topbar, hero
│   │   ├── components.css     #   tabs, cards, drop zones, buttons, toasts, forms
│   │   ├── editor.css         #   overlay editor + signature modal
│   │   └── responsive.css     #   media queries (must stay last)
│   ├── icon-rxpdf-cool.png    # Square app mark used in the topbar
│   ├── favicon.ico
│   ├── favicon-32x32.png
│   ├── favicon-rxpdf-cool.png # Apple touch icon
│   └── logo-utama-rxpdf-cool.png # Wide lockup (reference artwork)
│
├── js/                        # Classic scripts, loaded in this order:
│   ├── i18n-data.js           #   English→Indonesian string map
│   ├── i18n.js                #   t(), data-i18n, language switch (no storage)
│   ├── core.js                #   validation, S state, helpers, theme, tabs,
│   │                          #   drag & drop, downloads, progress, worker
│   ├── split.js               #   Split
│   ├── merge.js               #   Merge
│   ├── tools.js               #   Compress, Images, Watermark, Page Numbers,
│   │                          #   Protect, Unlock
│   ├── editor.js              #   Edit + signature pad
│   └── app.js                 #   init, global listeners
│
├── vendor/                    # First-party runtime dependencies (no CDN)
│   ├── README.md              # Versions, sources, licenses, checksums
│   ├── pdfjs/                 # pdf.min.js, pdf.worker.min.js
│   ├── pdf-lib/pdf-lib.min.js # @cantoo/pdf-lib
│   ├── jszip/jszip.min.js
│   └── inter/InterVariable.woff2
│
├── tools/
│   ├── serve.py               # Local dev server with correct MIME types
│   ├── check-i18n.js          # i18n coverage check
│   └── stamp-assets.js        # Adds ?v=<hash> cache busters to index.html
│
├── deploy/
│   ├── README.md              # VPS cache/deploy checklist
│   ├── nginx.conf.example
│   └── apache.htaccess.example
│
├── docs/
│   └── ARCHITECTURE.md        # How the app and each PDF pipeline works
│
└── .opencode/                 # Agent setup for this repository
    ├── opencode.jsonc         # Registers rules.md + ARCHITECTURE.md as instructions
    ├── rules.md               # Code style, JS, UI (incl. Tailwind) and validation rules
    └── skills/
        ├── pdf-tool-dev/      # Add or change a PDF tool
        └── privacy-security-audit/
```

### Naming conventions

| Kind | Convention | Examples |
| --- | --- | --- |
| DOM ids | `<prefix>-<tab>` / `<prefix>-<action>` | `panel-split`, `dz-merge`, `fi-protect`, `pw-compress`, `pf-split`, `btn-merge`, `fg-range`, `tc-0`, `pname-2` |
| Functions | verb-first camelCase | `loadSplitFile`, `startMerge`, `renderPageGrid`, `clearSplit`, `suggestCutHalf`, `toggleDelete` |
| State | one `S` object, camelCase keys | `S.splitFile`, `S.pageOrder`, `S.mergeFiles`, `S.cuts` |
| CSS classes | kebab-case, named by component | `topbar`, `brand-text`, `brand-accent`, `hero-facts`, `theme-group`, `dz-icon`, `mi-name`, state classes `.active`/`.selected`/`.deleted`/`.show` |
| Data attributes | `data-*`, lowercase | `data-orig`, `data-pos`, `data-idx`, `data-wd` |
| Commits / branches | `Prefix: summary`; `fix/`, `feature/`, `docs/`, `refactor/` | `Fix: handle encrypted input in Unlock` |

Full details, including the index-space rules for Split, are in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §12.

## Using OpenCode agents in this project

This repository carries its own agent configuration, so any OpenCode session
started in it inherits the project rules automatically.

### What is loaded

| File | Purpose |
| --- | --- |
| [`.opencode/rules.md`](.opencode/rules.md) | Normative project rules: invariants, code style, JavaScript rules, UI/Tailwind rules, validation rules, security, review checklist |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Architecture context (state, worker protocol, per-tool pipelines, known gaps) |
| [`.opencode/opencode.jsonc`](.opencode/opencode.jsonc) | Registers both files as project instructions via the `instructions` array |

`opencode.jsonc` is project configuration (not the global one), so it applies
only here and it is safe to commit.

### Available skills

Load a skill by mentioning it as `@<skill-id>` or by asking for the task it
covers. Skills live in `.opencode/skills/`.

| Skill ID | Use it when |
| --- | --- |
| `pdf-tool-dev` | Adding a ninth tool, or changing Split, Merge, Compress, Images, Watermark, Page Numbers, Protect or Unlock. Covers markup, state, validation, the Blob worker, progress, downloads and docs. Includes `references/checklist.md` for pre-commit. |
| `privacy-security-audit` | Auditing the project for privacy, CSP, supply-chain, validation or cryptography regressions before a release or after a dependency change. Produces severity-ordered findings. |

### Typical prompts

```text
@pdf-tool-dev add a "Crop PDF" tool that trims margins on every page
@privacy-security-audit review my changes before I tag a release
Split tool: clicking between two pages should place a cut marker
Why does the Compress tool not shrink my scanned PDF?
```

### Rules an agent must follow here

- No backend, no storage, no telemetry, no new third-party origin.
- No build step; the HTML, CSS and JS stay hand-editable.
- Validate every file through `readPdfFile()` and every value through
  `clampInt()`/`normalizeRange()`.
- Use `pdfjsLib` for rendering and `PDFLib` for read/write; encryption goes
  through `doc.encrypt(...)`, never `save({ userPassword })`.
- Every user-visible string goes through i18n (`data-i18n` in markup,
  `t()` in JS) and gets an Indonesian entry in `js/i18n-data.js`. The language
  preference is the only thing allowed in `localStorage`.
- Verify with `python tools/serve.py` and the manual matrix in
  `docs/ARCHITECTURE.md` §11; run `node tools/check-i18n.js` and
  `node tools/stamp-assets.js` after text/CSS/JS changes.

## Deploy

Drop the folder on any static host, or connect this repo to one:

- **Netlify** — drag and drop, or connect the repo (`netlify.toml` is included)
- **Cloudflare Pages / GitHub Pages / Vercel / Surge / S3 / nginx** — serve the
  repository root as-is

The only requirement is that `.js` is served as JavaScript and that the
`netlify.toml` (or equivalent) headers are kept.

**Styles/scripts not updating after a deploy?** The repository stamps every
CSS/JS link with `?v=<content-hash>`; run `node tools/stamp-assets.js` after
changes, upload all folders (`assets/`, `js/`, `vendor/`), and apply the cache
policy in [`deploy/`](deploy/README.md). The usual cause is a cached
`index.html` or a partial upload. See
[`deploy/README.md`](deploy/README.md) for nginx/Apache configs and a
verification checklist.

## Contributing

Contributions are welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md).

Quick version:

1. Fork and branch from `master` (`fix/…`, `feature/…`, `docs/…`).
2. Edit the file that owns the change: `index.html` for markup,
   `assets/css/` for styles, `js/` for behaviour.
3. Test with `python tools/serve.py 8000` and run through the affected tool,
   including one edge case.
4. Open a PR with what changed, why, and how you tested it.

## Security

Found a vulnerability? See [`SECURITY.md`](SECURITY.md) for the responsible
disclosure process. Please do not open a public issue for security problems.

## License

MIT — see [`LICENSE`](LICENSE). Use it, fork it, host it, do whatever.
