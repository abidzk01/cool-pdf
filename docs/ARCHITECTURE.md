# RxPDF Cool — Architecture

> Deep-dive reference for how this project is built, how a PDF actually flows
> through it, and where the sharp edges are. Written for contributors and for
> AI agents working in this repository. Companion documents:
> [`../README.md`](../README.md), [`../SECURITY.md`](../SECURITY.md),
> [`.opencode/rules.md`](../.opencode/rules.md).

---

## 1. What this project is

RxPDF Cool is a **single-page, 100% client-side PDF toolkit**. It
ships eight tools — Split, Merge, Compress, PDF→Images, Watermark, Page
Numbers, Password Protect, Unlock — and every byte of processing happens in the
user's browser tab. There is:

- **no backend**, no API, no database, no upload endpoint;
- **no build step** — no npm, no bundler, no `node_modules`;
- **no storage** — no `localStorage`, `sessionStorage`, `indexedDB`, or cookies;
- **no analytics or telemetry** of any kind.

The deployment target is a static host. `netlify.toml` sets the publish root and
the security headers (CSP, `X-Frame-Options`, `nosniff`, `Referrer-Policy`,
`Permissions-Policy`).

### Design principles (in priority order)

1. **Privacy first** — a file must never leave the device, and the page must not
   phone home. All runtime assets are first-party (`vendor/`, `assets/`),
   including fonts and icons.
2. **Auditable & self-hostable in one move** — the entire app stays readable in
   one HTML file: no minification of app code, no generated bundle.
3. **Straight to the tool** — the page opens on the working UI. There is no
   onboarding screen, no full-viewport marketing hero and no scroll required to
   reach a drop zone; brand and copy sit in a compact topbar and one-line hero.
4. **Zero install** — clone and open. No toolchain for the app itself.
5. **Graceful failure** — corrupt/encrypted/wrong input produces a toast, never
   a blank screen or a silent no-op.

---

## 2. Repository layout

```text
pdf-studio/
├── index.html                 # THE application: markup + CSS + JS in one file
├── netlify.toml               # Static publish config + security headers (CSP)
├── README.md                  # Entry point: stack, requirements, conventions
├── CONTRIBUTING.md            # Contribution workflow + code style summary
├── SECURITY.md                # Threat model, hardening, known limitations
├── LICENSE                    # MIT
├── .gitattributes             # LF + byte-exact vendored files
├── .gitignore
│
├── assets/                    # Brand assets served first-party
│   ├── icon-rxpdf-cool.png    # Square app mark used in the topbar
│   ├── favicon.ico            # Browser tab icon
│   ├── favicon-32x32.png      # PNG favicon
│   ├── favicon-rxpdf-cool.png # Apple touch icon
│   └── logo-utama-rxpdf-cool.png # Wide lockup (reference/export artwork)
│
├── vendor/                    # First-party vendored runtime dependencies
│   ├── README.md              # Versions, sources, licenses, SHA-256/SHA-384
│   ├── pdfjs/
│   │   ├── pdf.min.js         # pdf.js 3.11.174 (rendering/thumbnails)
│   │   └── pdf.worker.min.js  # pdf.js worker
│   ├── pdf-lib/
│   │   └── pdf-lib.min.js     # @cantoo/pdf-lib 2.11.1 (read/write/encrypt)
│   ├── jszip/
│   │   └── jszip.min.js       # JSZip 3.10.1 (ZIP downloads)
│   └── inter/
│       └── InterVariable.woff2# Inter variable font (self-hosted)
│
├── tools/
│   └── serve.py               # Local dev server with correct MIME types
│
├── docs/
│   └── ARCHITECTURE.md        # This document
│
└── .opencode/                 # Agent configuration for this repository
    ├── opencode.jsonc         # Registers rules.md as project instructions
    ├── rules.md               # Code style / JS / UI / validation rules
    └── skills/
        ├── pdf-tool-dev/SKILL.md
        └── privacy-security-audit/SKILL.md
```

There is **no** `src/`, no `dist/`, no test folder. `index.html` is the whole
application; everything else is documentation, configuration, or vendored
assets.

---

## 3. Runtime topology

```text
┌─────────────────────────── Browser tab (single origin) ───────────────────────────┐
│                                                                                  │
│  index.html                                                                      │
│  ├── <head>  meta/SEO, JSON-LD, favicons, 3 local <script>, font preload, <style> │
│  ├── <body>  .topbar        (brand + privacy badge + theme switch)                │
│  │           .hero          (one-line pitch + fact chips, no full screen)          │
│  │           .tabs + #panel-<name> × 8  (the working UI)                          │
│  │           footer, #toast-container                                             │
│  └── <script>  all app logic (state, helpers, tools, worker source)               │
│                                                                                  │
│  Main thread ── postMessage ──► Blob Worker (created from WORKER_SRC)             │
│       │                              │ importScripts(vendor/pdf-lib/pdf-lib.min.js)
│       │◄──── progress / result ──────┘                                            │
│       │                                                                           │
│  File → ArrayBuffer → validate → pdf.js (render) / pdf-lib (transform) → Blob      │
│       │                                                                           │
│       └── <a download> + URL.createObjectURL → user's disk                        │
└──────────────────────────────────────────────────────────────────────────────────┘
        no network requests except loading its own first-party files
```

The only network activity at runtime is fetching the page's own assets from the
same origin. There is no third-party origin in the CSP.

---

## 4. `index.html` anatomy

`index.html` is ~1,835 lines, split into four contiguous zones:

| Zone | Approx. lines | Contents |
| --- | --- | --- |
| Head | 1–38 | Title, description/keywords, Open Graph, Twitter, favicons, `theme-color`, `robots`, JSON-LD `WebApplication`, local `<script src>` for the three libraries, font preload |
| Styles | 39–432 | One `<style>` block: `@font-face` for self-hosted Inter, theme custom properties, reset, topbar/brand, compact hero, tool UI (`card`, `drop-zone`, `page-thumb`, `toast`, forms), responsive rules |
| Markup | 434–801 | `.topbar` (brand image + wordmark, privacy badge, theme group), `.hero` (h1 + paragraph + fact chips), `.tabs`, `#panel-<name>` × 8, footer, `#toast-container` |
| Application JS | 803–1832 | `'use strict'` script: local asset URLs, `esc`, validation layer, state, helpers, theme/tabs, drag & drop, downloads, one section per tool, worker source, init |

### Markup conventions

- Every tool is a `.panel` with `id="panel-<tab>"`; only the active panel has
  `.active` (`display:block`).
- Tabs are plain buttons with inline `onclick="switchTab('<tab>')"`. The tab id
  is the single source of truth for panel, drop zone, file input, progress ids,
  and downloaded filename prefix.
- Interactive elements are declared in HTML; anything created at runtime is
  built with `document.createElement` and `addEventListener`.
- Icons are emoji; button labels are text. No icon font, no SVG sprite.

---

## 5. Application architecture (main thread)

### 5.1 Global state — the `S` singleton

There is exactly one mutable global, `S`. Everything else is stateless.

| Field | Type | Used by | Meaning |
| --- | --- | --- | --- |
| `theme` | `'light' \| 'dark'` | theme | Mirrors `data-theme` on `<html>` |
| `busy` | `boolean` | all tools | Global re-entrancy lock |
| `startTime` | `number` | progress | Timestamp for ETA computation |
| `splitFile` | `ArrayBuffer` | split | Validated source bytes |
| `splitFileName` | `string` | split | Base name (no `.pdf`) for part filenames |
| `pdfJsDoc` | pdf.js document | split | Rendering handle for thumbnails |
| `pageBuffers` | `ArrayBuffer[]` | split | Reserved; currently unused |
| `pageOrder` | `number[]` | split | Display/export order, holds **original** page indices |
| `rotations` | `{origIdx: degrees}` | split | Per-page rotation to apply on export |
| `selected` | `Set<number>` | split | Selected original page indices |
| `deleted` | `Set<number>` | split | Deleted original page indices |
| `thumbnails` | `{origIdx: dataURL}` | split | Cache of rendered thumbnails |
| `cuts` | `Set<number>` | split | Visual cut markers, keyed by **position** in `pageOrder` |
| `mergeFiles` | `{name, ab, pageCount}[]` | merge | Ordered merge queue |
| `compressFile`, `imagesFile`, `watermarkFile`, `pageNumFile`, `protectFile`, `unlockFile` | `{name, ab}` | each tool | One-shot validated holders |

The two index spaces matter: `pageOrder`/`selected`/`deleted`/`rotations` are in
**original** page indices, while `cuts` is a **positional** index into
`pageOrder`. See §9 for the consequences.

### 5.2 Core helpers

| Helper | Responsibility |
| --- | --- |
| `G(id)` | `document.getElementById` shorthand |
| `esc(s)` | HTML-escape (`& < > " '`) — the only safe way to interpolate user data into markup |
| `toast(msg, type, dur)` | Non-blocking notification; escapes `msg` itself (`s`/`e`/`i`/`w`) |
| `setAllBusy(v)` | Disables every `.btn`, remembering prior disabled state in `data-wd` |
| `showProgress(tab, show)` / `setProgress(tab, cur, tot)` | Drives `#pw-#pf-#ps-#pp-#pe-<tab>` and computes ETA from `S.startTime` |
| `safeName(name)` | Strips path separators, control chars and Windows-reserved names for downloads |
| `downloadBytes(bytes, name)` | `Blob` → object URL → synthetic `<a download>` click → revoke after 10 s |
| `downloadZip(files, zipName)` | JSZip `DEFLATE` level 6 → same download pattern (15 s revoke) |
| Validation layer | `LIMITS`, `clampInt`, `isPdfName`, `hasPdfMagic`, `fmtBytes`, `readPdfFile`, `normalizeRange` (see §6.2 and `rules.md`) |

### 5.3 Rendering model

Two rendering strategies coexist deliberately:

- **Template strings + `innerHTML`** for static/simple structures, always with
  `esc()` around file names and user input (e.g. parts summary).
- **`createElement` + `addEventListener`** for nodes that carry behaviour
  (page thumbnails, merge list rows) so event handlers never live in HTML.

The Split page grid re-renders wholesale (`renderPageGrid()` rebuilds every
thumbnail) on any change. Thumbnail bitmaps are cached in `S.thumbnails` and
drawn onto `<canvas>` so re-renders are cheap after the first render.

### 5.4 Event model

- Static controls use inline `onclick`/`onchange`/`ondrag*` attributes.
- Dynamic nodes wire handlers in JS.
- File inputs are absolutely positioned inside each `.drop-zone` at
  `opacity:0`, so a click anywhere in the zone opens the picker and the whole
  area is a native drag target.
- `dzOver` / `dzLeave` / `dzDrop` are shared across zones and dispatch on the
  `id` suffix (`split`, `merge`, …).

### 5.5 Theming

`data-theme="light|dark"` on `<html>` selects between two sets of CSS custom
properties (`:root` and `[data-theme="dark"]`). `setTheme()` flips the
attribute and toggles the `.active` state on the single theme group
(`#btnLight` / `#btnDark`). Components only ever reference variables
(`var(--card)`, `var(--accent)`), never raw colours.

### 5.6 Branding

The topbar mark is `assets/icon-rxpdf-cool.png` (square app icon) next to a CSS
wordmark: `Rx` in the text colour, `PDF` in an orange→red gradient
(`.brand-accent`) and `Cool` in the text colour. Favicons come from `assets/`
(`favicon.ico`, `favicon-32x32.png`, `favicon-rxpdf-cool.png` for Apple touch).
The wide `assets/logo-utama-rxpdf-cool.png` is reference artwork: it has a
baked-in "LOGO UTAMA" label and a dark canvas, so it is not used in the layout.
Colour is theme-agnostic for these assets; do not hard-code a dark background
behind them.

### 5.7 Progress and concurrency

Every tool shares one progress idiom: `showProgress('<tab>', true)` reveals
`#pw-<tab>`, and `setProgress('<tab>', cur, tot)` updates the bar, the counter,
the percentage and the ETA. `setAllBusy(true)` disables all buttons for the
duration, which is the project's only concurrency control: one operation at a
time, globally.

---

## 6. How the PDF work is actually done

### 6.1 Libraries and division of labour

| Library | Version | Role |
| --- | --- | --- |
| pdf.js (`pdfjsLib`) | 3.11.174 | **Read/render only.** Page counts, thumbnails, page→image export |
| pdf-lib (`PDFLib`) | @cantoo/pdf-lib 2.11.1 | **Read/write.** Create, copy, merge, rotate, draw text, encrypt, save |
| JSZip | 3.10.1 | Bundle multiple outputs into one `.zip` |

`@cantoo/pdf-lib` is the maintained fork of `pdf-lib` that adds real
**encryption/decryption** (AES-256, ISO 32000-2 R6). Upstream `pdf-lib`
1.17.1 silently ignored `save({ userPassword })`, so the Protect tool produced
unencrypted files. Both are MIT-licensed and API-compatible.

### 6.2 The validation gate (mandatory path)

No tool may touch file bytes without going through this pipeline:

```text
File (input/drop)
  └─► isPdfName(name)        `.pdf` extension (case-insensitive)
  └─► size > 0
  └─► size <= LIMITS.maxBytes (1.5 GB)
  └─► ab = await file.arrayBuffer()
  └─► hasPdfMagic(ab)        '%PDF-' inside the first 1024 bytes
  └─► validatePDF(ab)        pdf-lib parse (unless allowEncrypted)
        └─► ok → ArrayBuffer handed to the tool
        └─► fail → throw Error(message) → toast(type:'e')
```

`readPdfFile(file, opts)` is the single entry point; `opts.allowEncrypted` is
set only by the Unlock tool. Numeric form values pass through `clampInt` and the
split range through `normalizeRange` before they reach PDF code. Limits live in
one `LIMITS` object so UI copy and code cannot drift far apart.

### 6.3 Worker subsystem

Split and Merge run on a **Blob Worker** so a 1.5 GB job does not freeze the UI:

```js
const WORKER_SRC = `self.onmessage = async (e) => { importScripts(e.data.PDFLibSrc); ... }`;
makeWorker()      // Blob([WORKER_SRC]) → URL.createObjectURL → new Worker(url)
runWorkerTask(msg, transfer, onProgress)  // promise wrapper; kills + revokes in every exit path
killWorker(w)     // terminate() + URL.revokeObjectURL()
```

Protocol (plain objects, no id correlation — one task per worker):

| Direction | Message | Payload |
| --- | --- | --- |
| → worker | `{type:'split', buffers, order, rotations, deletedArr, mode, range, every, PDFLibSrc}` | `buffers` are transferred |
| → worker | `{type:'merge', buffers, PDFLibSrc}` | all buffers transferred |
| ← main | `{type:'progress', current, total}` | drives `setProgress` |
| ← main | `{type:'split_done', results:[{bytes,index}], multiple}` | |
| ← main | `{type:'merge_done', bytes}` | |
| ← main | `{type:'error', message}` | rejected promise |

Two hard requirements, both easy to break:

1. **`PDFLibSrc` must be absolute.** A Blob worker has a `blob:` base URL, so a
   relative `importScripts('vendor/…')` cannot resolve. The main thread computes
   `PDFLIB_URL = new URL('vendor/pdf-lib/pdf-lib.min.js', document.baseURI).href`.
2. **The server must send JavaScript for `.js`.** Some local servers (notably
   `python -m http.server` on Windows) label `.js` as `text/plain`; the browser
   then refuses `importScripts` with a MIME error. `tools/serve.py` fixes this.

### 6.4 Per-tool pipelines

| Tool | Validate | Engine | Transform | Output |
| --- | --- | --- | --- | --- |
| **Split** | full gate | pdf.js (UI) + pdf-lib (worker) | Groups pages by cuts / selection / range / every-N; `copyPages` into one document per group, applying `rotations` | `.pdf`, or `.zip` when >1 group |
| **Merge** | gate per file, max 50 files | pdf-lib (worker) | `create()` then `copyPages` from each source in queue order | `merged.pdf` |
| **Compress** | full gate | pdf-lib | Re-save with `useObjectStreams:true`, `addDefaultPage:false` and drop redundant objects | `<base>-compressed.pdf` |
| **PDF → Images** | full gate | pdf.js | Per page: `getViewport({scale})` → canvas → `toDataURL('image/png'|'image/jpeg', 0.92)` → base64 → `Uint8Array` | `<base>-images.zip` |
| **Watermark** | full gate | pdf-lib | Per page: `drawText` at position with RGB + opacity; centre is rotated −45° | `<base>-watermarked.pdf` |
| **Page Numbers** | full gate | pdf-lib | Per page: `drawText(String(start + i))` at one of five positions | `<base>-numbered.pdf` |
| **Protect** | full gate + password rules | pdf-lib | `doc.encrypt({ userPassword, ownerPassword: random 32 bytes hex, permissions })` then `save()` | `<base>-protected.pdf` |
| **Unlock** | gate with `allowEncrypted:true` | pdf-lib | `load(ab, {password})` → `create()` + `copyPages` into a **fresh** document → `save()` | `<base>-unlocked.pdf` |

Two non-obvious details:

- **Encryption is applied by `encrypt()`, not by `save()`.** Passing
  `userPassword` to `save()` is silently ignored by both libraries.
- **Unlock must rebuild the document.** Saving a document that was *loaded* with
  a password keeps its `/Encrypt` dictionary, so the file still prompts for a
  password. `copyPages` into a new document is what actually strips protection.

### 6.5 Byte flow (end to end)

```text
<input type=file> / drop
   → File
   → file.arrayBuffer()                     (ArrayBuffer, owned by the tab)
   → readPdfFile(): name/size/magic/parse
   → tool-specific transform                  (main thread or Blob worker)
   → Uint8Array from doc.save() / canvas.toDataURL()
   → new Blob(...) → URL.createObjectURL()
   → synthetic <a download="safeName(...)">.click()
   → URL.revokeObjectURL() after 10–15 s
```

No intermediate bytes are persisted. Closing the tab discards everything.

---

## 7. Security model (implemented)

- **First-party runtime**: all scripts and the font are served from `vendor/`.
  The CSP has no third-party origin; `default-src 'self'`.
- **No storage, no cookies, no telemetry.** Nothing survives a reload.
- **XSS containment**: `esc()` on every interpolation of user-controlled data;
  filenames additionally pass `safeName()` before becoming download names.
- **Password hygiene**: password inputs are cleared from the DOM right after
  Protect/Unlock completes; the owner password is random per save.
- **Magic-byte validation** plus a real pdf-lib parse before processing.
- **CSP and headers** in `netlify.toml`: `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`,
  `object-src 'none'`, `base-uri 'self'`, `form-action 'none'`.
- **Integrity of vendored code**: `vendor/README.md` records version, source
  URL and SHA-256/SHA-384 for every file; `.js` files were verified against the
  SRI hashes the project used before vendoring.

Known residual risks are enumerated in `SECURITY.md` (pdf.js CVE-2024-4367, and
`'unsafe-inline'`/`'unsafe-eval'` in the CSP because the app logic is inline).

---

## 8. Performance and memory characteristics

- **Copies dominate.** `readPdfFile` parses the file once, then tools keep
  `ab.slice(0)` copies (plus one more per worker transfer). A 1.5 GB input can
  therefore require several GB of transient heap. The 1.5 GB ceiling is an
  advertised maximum, not a comfortable one.
- **Double parsing.** Every tool validates with pdf-lib, then often re-parses
  with pdf.js or pdf-lib again.
- **`downloadAllParts()` is O(n²)-ish**: each part re-parses the whole source in
  a new worker. Splitting one 500-page PDF into 500 parts means 500 full parses.
- **Thumbnails** are rendered at scale 0.35 to an offscreen canvas, cached as
  JPEG data URLs, and drawn into fixed 120×160 canvases.
- **PDF→Images** holds every page's PNG/JPEG bytes in one array before zipping;
  high DPI on many pages can exhaust memory. One bad page aborts the whole run.
- **Zip output** buffers in memory (JSZip) — no streaming.

Practical guidance: prefer the Split tool's "one archive" modes over
"each page", keep DPI moderate, and treat >500 MB as a workstation-class job.

---

## 9. Known gaps and technical debt

| # | Area | Issue | Impact |
| --- | --- | --- | --- |
| 1 | Split UI | `.add-cut-zone` CSS exists but no element is ever created; the "Click between pages to add ✂️ cuts" hint is not backed by UI. Cuts can only be placed via the **Quick split** buttons. | Misleading UX; the core "visual split" promise is only partly delivered |
| 2 | Split model | `cuts` are positions while `selected/deleted/rotations` are original indices; reordering or deleting pages after cuts are placed can shift parts unexpectedly | Edge-case incorrect output |
| 3 | Compress | Re-save only; images are not re-encoded. Files can grow slightly; claimed "up to 80%" is not guaranteed | Overstated promise |
| 4 | Text drawing | `drawText` uses the built-in Helvetica (WinAnsi). Watermark text and filenames with characters outside that set will throw or be dropped | Non-Latin scripts unusable in Watermark |
| 5 | Page numbers | Horizontal centring uses an estimated glyph width (`fontSize * 0.3/0.6 * length`) instead of measured text width | Off-centre numbers on wide glyph runs |
| 6 | Unlock | Rebuilding via `copyPages` drops document-level structures (outlines, named destinations, some form data) | Lossy unlock |
| 7 | pdf.js | 3.11.174 is affected by CVE-2024-4367; upgrade requires ES-module restructuring | Documented, accepted risk |
| 8 | CSP | `'unsafe-inline'`/`'unsafe-eval'` required while app JS stays inline | Weaker XSS posture than ideal |
| 9 | Accessibility | Tabs have no `role`/`aria-selected`; toasts and progress are not `aria-live`; icon buttons rely on `title` only | Screen-reader/keyboard gaps |
| 10 | Dead code | `renderThumb` computes an unused `vp` with a precedence bug; `S.pageBuffers` is unused; the `.add-cut-zone` styles are unused | Confusing, maintenance noise |
| 11 | Testing | No automated tests, no CI, no lint config — verification is the manual matrix in `CONTRIBUTING.md` | Regressions rely on reviewers |
| 12 | Local dev | On Windows, `python -m http.server` serves `.js` as `text/plain`, breaking worker `importScripts` | Use `tools/serve.py` |
| 13 | Brand assets | Only raster PNGs are shipped; the wide lockup carries a baked-in "LOGO UTAMA" label, so the header uses the square icon plus a CSS wordmark (two sources of truth for the name) | Minor; needs an SVG/transparent mark to simplify |

---

## 10. Extension guide — adding a ninth tool

1. **Tab**: add `.tab-btn` with `onclick="switchTab('<id>')"`; the `<id>` keys
   everything below (use a short lowercase noun: `crop`, `stamp`, …).
2. **Panel**: add `<div class="panel" id="panel-<id>">` containing a `.card`,
   a `<h3>`, an optional `.info-box`, and a `.drop-zone` with
   `id="dz-<id>"` + `<input id="fi-<id>">` wired to `dzOver/dzLeave/dzDrop` and
   an `onchange` handler.
3. **Options**: form controls inside `<div class="form-row">` /
   `<div class="form-group">`; give each a stable id (`fg-*` for conditionals).
4. **Progress**: copy the `#pw-<id>` block with `#pf-#ps-#pp-#pe-<id>` children.
5. **JS**: in the tool's own section add
   - `load<Name>File(file)` → `await readPdfFile(file)` in a `try/catch` →
     store in `S.<name>File` → reveal the options block;
   - `start<Name>()` → guard `if(S.busy||!S.<name>File)return;` → clamp inputs →
     `setAllBusy(true)` + `showProgress('<id>',true)` → transform → `download*`
     → `finally{setAllBusy(false)}`;
   - wire the tab into `dzDrop`'s dispatch chain.
6. **Non-blocking?** If the transform can exceed ~1 s on large files, run it in
   the Blob worker: add a branch in `WORKER_SRC` and a message type, and remember
   to pass `PDFLibSrc: PDFLIB_URL`.
7. **Copy**: add the tool to `.tabs`, to the hero fact chips if it changes a
   headline claim, and to the JSON-LD `featureList`, meta description and
   `README.md`. Do not reintroduce a separate landing screen.
8. **Docs**: update this file's §6.4 table and the QA matrix below.

---

## 11. Verification matrix (manual — no automated tests)

| Area | Check |
| --- | --- |
| Load | Page loads with **zero** console errors (aside from a `favicon.ico` 404 if absent); three libraries report defined |
| Split | Load a 6-page PDF → thumbnails render; quick-cut "Into 3 parts" → parts summary shows 3; download each and the ZIP |
| Split edge | Range `1-3,5` works; `9-99` is rejected with a toast; delete + rotate then export |
| Merge | Two PDFs → order drag-and-drop → merged page count = sum |
| Compress | Output opens; size comparison is shown (and honest when nothing shrank) |
| Images | DPI 72 and 216; single-page failure must not abort silently |
| Watermark | Each position; opacity 5 and 100; non-ASCII text is a known limitation |
| Page numbers | Each position; custom start; large page count |
| Protect | Output re-opens **only** with the password; wrong confirm password blocked; fields cleared afterwards |
| Unlock | Encrypted input + correct password → output opens with **no** password prompt; wrong password shows a clear error |
| Validation | `.txt` renamed to `.pdf`, empty file, truncated PDF, >1.5 GB file, encrypted file in each tool |
| Theme | Light/dark toggle swaps the palette and keeps the two theme buttons in sync |
| Concurrency | Buttons disable during a run and re-enable after (success and failure) |

---

## 12. Naming conventions (summary)

- **DOM ids**: `panel-<tab>`, `dz-<tab>`, `fi-<tab>`, `pw-<tab>`,
  `pf-/ps-/pp-/pe-<tab>`, `btn-<action>`, `fg-<field>`, `tc-<pageIndex>`,
  `pname-<partIndex>`.
- **Functions**: verb-first camelCase — `load*File`, `start*`, `render*`,
  `clear*`, `suggestCut*`, `toggle*`, `update*`.
- **State keys**: camelCase; `Set` for page-index collections; one-shot holders
  named `<tool>File`.
- **CSS classes**: kebab-case; component names `topbar`, `brand`, `hero`,
  `theme-group`, plus legacy per-tool prefixes `mi-` (merge item) and `dz-`;
  state classes `.active`, `.selected`, `.deleted`, `.show`, `.dragover`,
  `.dragging`.
- **Data attributes**: `data-orig`, `data-pos`, `data-idx`, `data-wd`.
- **Commits**: `Add:`, `Fix:`, `Update:`, `Remove:`, `Docs:`, `Refactor:`.

Detailed style, JavaScript, UI and validation rules live in
[`.opencode/rules.md`](../.opencode/rules.md).
