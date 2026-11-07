# PDF Studio

A free, open-source, **100% client-side PDF toolkit**. Eight PDF tools that run
entirely in your browser — your files never leave your device.

- **Live demo:** <https://madebybalaji.com/pdfsnip/>
- **Architecture reference:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- **Security policy & threat model:** [`SECURITY.md`](SECURITY.md)

## Features

| Tool | What it does |
| --- | --- |
| ✂️ **Split PDF** | Extract pages, reorder, rotate or delete visually, then cut the document into parts with one click |
| 🔗 **Merge PDFs** | Combine multiple PDFs into one, drag to reorder |
| 🗜️ **Compress PDF** | Re-save with object streams to drop redundant data (results vary by file) |
| 🖼️ **PDF → Images** | Export every page as PNG or JPEG, up to 216 DPI |
| 🔏 **Watermark** | Stamp text on every page with custom size, opacity, position and colour |
| 🔢 **Page Numbers** | Add configurable page numbers in any position and format |
| 🔒 **Password Protect** | **AES-256** encrypt your PDFs in one click |
| 🔓 **Unlock PDF** | Remove the password from a PDF you own |

## Privacy by design

This is a **single static HTML file** plus first-party vendored assets. There is
no server upload, no telemetry, no analytics, no tracking, no cookies, no
fingerprinting and no persistent storage. Every PDF you process is handled
locally by JavaScript in your own browser tab. Close the tab and it is gone.

The Content Security Policy has **no third-party origin** — even the Inter font
is self-hosted under `vendor/`. See [`SECURITY.md`](SECURITY.md) for the full
threat model and hardening details.

## Tech stack

| Layer | Choice |
| --- | --- |
| App | HTML + CSS + vanilla JavaScript, `'use strict'`, **no framework** |
| Build | **None.** No npm, no bundler, no `node_modules`, no transpiler |
| PDF read/render | [pdf.js](https://mozilla.github.io/pdf.js/) `3.11.174` — page counts, thumbnails, page→image |
| PDF read/write | [@cantoo/pdf-lib](https://www.npmjs.com/package/@cantoo/pdf-lib) `2.11.1` — create, copy, merge, draw, **AES-256 encrypt/decrypt** |
| ZIP | [JSZip](https://stuk.github.io/jszip/) `3.10.1` |
| Font | [Inter](https://rsms.me/inter/) variable, self-hosted WOFF2 |
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

- A text editor. You are editing one HTML file.
- Optional: Node 18+ if you want to script PDF fixtures for manual testing.

## Usage

1. Open the page and pick a tool from the tab bar (or from the landing grid).
2. Drop a PDF on the dashed zone, or click to browse.
3. Adjust the tool's options, then press the primary action button.
4. The result downloads immediately — nothing is uploaded and nothing is kept.

## Project structure

```text
pdf-studio/
├── index.html                 # The entire application (markup + CSS + JS)
├── netlify.toml               # Static publish root + security headers (CSP)
├── README.md                  # This file
├── CONTRIBUTING.md            # How to contribute, code style summary
├── SECURITY.md                # Threat model, hardening, known limitations
├── LICENSE                    # MIT
│
├── vendor/                    # First-party runtime dependencies (no CDN)
│   ├── README.md              # Versions, sources, licenses, checksums
│   ├── pdfjs/                 # pdf.min.js, pdf.worker.min.js
│   ├── pdf-lib/pdf-lib.min.js # @cantoo/pdf-lib
│   ├── jszip/jszip.min.js
│   └── inter/InterVariable.woff2
│
├── tools/
│   └── serve.py               # Local dev server with correct MIME types
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
| CSS classes | kebab-case, component prefix | `hl-nav`, `bt-card`, `mi-name`, `dz-icon`, `rv-up`, state classes `.active`/`.selected`/`.deleted`/`.show` |
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
- No build step; `index.html` stays hand-editable.
- Validate every file through `readPdfFile()` and every value through
  `clampInt()`/`normalizeRange()`.
- Use `pdfjsLib` for rendering and `PDFLib` for read/write; encryption goes
  through `doc.encrypt(...)`, never `save({ userPassword })`.
- Verify with `python tools/serve.py` and the manual matrix in
  `docs/ARCHITECTURE.md` §11.

## Deploy

Drop the folder on any static host, or connect this repo to one:

- **Netlify** — drag and drop, or connect the repo (`netlify.toml` is included)
- **Cloudflare Pages / GitHub Pages / Vercel / Surge / S3 / nginx** — serve the
  repository root as-is

The only requirement is that `.js` is served as JavaScript and that the
`netlify.toml` (or equivalent) headers are kept.

## Contributing

Contributions are welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md).

Quick version:

1. Fork and branch from `master` (`fix/…`, `feature/…`, `docs/…`).
2. Edit `index.html` directly.
3. Test with `python tools/serve.py 8000` and run through the affected tool,
   including one edge case.
4. Open a PR with what changed, why, and how you tested it.

## Security

Found a vulnerability? See [`SECURITY.md`](SECURITY.md) for the responsible
disclosure process. Please do not open a public issue for security problems.

## License

MIT — see [`LICENSE`](LICENSE). Use it, fork it, host it, do whatever.
