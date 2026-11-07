# RxPDF Cool — Agent Rules

Project instructions for any agent (or human) changing this repository.
Read `docs/ARCHITECTURE.md` first for how the app is put together. These rules
are normative: if a request conflicts with them, say so before proceeding.

---

## 0. Project invariants — never violate

1. **Everything is client-side.** No backend, no API calls, no upload, no
   accounts, no persistence (`localStorage`, cookies, IndexedDB), no telemetry,
   analytics, pixels, or beacons. A change that adds any of these is out of
   scope until the maintainer approves it in an issue.
2. **No build step and no package manager for the app.** No npm/bun/pnpm
   dependency, no bundler, no transpiler, no CSS preprocessor for app code.
   `index.html` must stay hand-editable and unminified.
3. **No new runtime dependency without an issue first.** If one is truly
   needed, vendor it under `vendor/` with version, source URL, license, and
   SHA-256/SHA-384 recorded in `vendor/README.md`; update the CSP only if the
   dependency is genuinely external (prefer first-party).
4. **One origin.** Runtime assets are first-party. Do not reintroduce CDN
   `<script>`/font links; do not loosen the CSP to reach a third-party origin.
5. **Privacy of input.** Never log, persist, or transmit file names, contents,
   or passwords. Clear password fields from the DOM immediately after use.
6. **`index.html` is the application.** Tools live inside it, in their own
   clearly-commented section; do not split logic into `src/` modules.

---

## 1. Code style

### General

- Match the surrounding code. This file is dense and consistent: two-space
  indentation, compact one-line statements, section banners such as
  `// ═══ SPLIT ═══` and `/* ── BUTTONS ── */`.
- Prefer the smallest change that fully solves the problem. Do not reformat
  whole files or "fix" unrelated lines in the same change.
- Keep comments explaining *why*, not *what*. Preserve existing `BUG-n` markers
  unless you are fixing that bug (then remove the marker and say so in the
  commit).
- No trailing whitespace; keep the file UTF-8 with LF-safe content.

### Naming (see `docs/ARCHITECTURE.md` §12)

- DOM ids: `panel-<tab>`, `dz-<tab>`, `fi-<tab>`, `pw-<tab>`,
  `pf-/ps-/pp-/pe-<tab>`, `btn-<action>`, `fg-<field>`, `tc-<pageIndex>`,
  `pname-<partIndex>`.
- Functions: verb-first camelCase — `load<Name>File`, `start<Name>`,
  `render<Name>`, `clear<Name>`, `toggle<Name>`, `update<Name>`.
- State keys: camelCase; `Set` for page-index collections; one-shot holders are
  `<tool>File`.
- CSS classes: kebab-case, named by component (`topbar`, `brand`, `hero`,
  `theme-group`) or legacy tool prefix (`mi-`, `dz-`); state classes `.active`,
  `.selected`, `.deleted`, `.show`, `.dragover`, `.dragging`.

### HTML

- Declare controls in markup; build only behaviour-carrying nodes at runtime.
- Use the existing classes (`.card`, `.drop-zone`, `.btn .btn-primary`,
  `.form-row`, `.form-group`, `.info-box`, `.progress-wrap`) rather than new
  bespoke markup.
- Static controls use inline `onclick`/`onchange`/`ondrag*`, matching the file.
- Emoji is the icon system; keep buttons labelled with text where clarity
  matters, and always add `title` to icon-only buttons.
- Every user-visible string is English and sentence case.

### CSS

- Use theme variables only (`var(--card)`, `var(--text-m)`, `var(--border)`,
  `var(--accent)`, …). Never hard-code a hex colour in a component, and never
  introduce a colour that exists in only one theme.
- Add new tokens to **both** `:root` and `[data-theme="dark"]`, or not at all.
- Keep the existing compact declaration style for small rules; use one property
  per line for anything longer than a few declarations.
- Animate with `transform`/`opacity`. Respect `prefers-reduced-motion` for any
  new motion, and never animate layout properties.
- Remove dead CSS you find (e.g. classes no element uses) only when it is in the
  area you already touch, and mention it in the commit.

---

## 2. JavaScript rules

1. **`'use strict'` stays.** No implicit globals. Declare with `const`, and use
   `let` only when reassignment is required.
2. **Single state singleton.** All mutable tool state goes into `S`
   (declared once). Do not add module-level mutable variables, and do not attach
   state to the DOM (`element.__state`).
3. **Validate before you process.** Every file input and drop handler goes
   through `readPdfFile()` (see §4). Every numeric form value goes through
   `clampInt()`/an allowlist. Never pass raw `input.value` into PDF APIs.
4. **Guard re-entrancy.** Long operations start with
   `if(S.busy || !S.<tool>File) return;` and end with
   `finally { setAllBusy(false); }`.
5. **Async discipline.** Use `async`/`await`, never `.then()` chains for tool
   flows. Every user-facing failure ends in `toast(message, 'e')` — never a
   silent `catch {}` (an intentional ignore needs a comment saying why).
6. **XSS.** Any interpolation into `innerHTML` must pass through `esc()`.
   Prefer `textContent` / `createElement` for anything user-controlled. Do not
   add `insertAdjacentHTML` with unescaped data, and do not add inline event
   handler strings that embed user data.
7. **Workers.** CPU-heavy transforms (whole-document parse/save loops) belong in
   the Blob worker: add a branch in `WORKER_SRC`, a message type, and call it
   through `runWorkerTask()`. Pass transferables for large buffers, always pass
   `PDFLibSrc: PDFLIB_URL` (absolute — a Blob worker cannot resolve relative
   paths), and never leak a worker: termination lives in `runWorkerTask`'s exit
   paths.
8. **DOM access** goes through `G(id)`. Do not add `document.querySelector` for
   ids that `G()` already handles.
9. **Progress** uses `showProgress(tab, true)` + `setProgress(tab, cur, tot)`
   with the `pw-/pf-/ps-/pp-/pe-` id convention. A long-running loop must report
   progress on every iteration that can take noticeable time.
10. **Downloads** use `downloadBytes()` / `downloadZip()` so `safeName()`
    sanitisation and URL revocation are never skipped.
11. **No new globals on `window`** unless the code is referenced from inline
    HTML attributes; when you must, keep the pattern the file already uses.
12. **Memory.** Avoid gratuitous `ArrayBuffer` copies; when a copy is
    unavoidable, say why in a comment. Do not hold two copies of a >100 MB
    buffer if one will do.
13. **Libraries.** `pdfjsLib` renders; `PDFLib` reads/writes. Use
    `doc.encrypt(...)` for encryption (never `save({userPassword})`), and
    rebuild a fresh document to strip encryption.

---

## 3. UI rules

### Current stack — plain CSS with custom properties

- The project does **not** use Tailwind, Bootstrap, or any CSS framework. Do not
  add utility classes from another framework, and do not add a framework "while
  you're in there".
- Layout uses the existing primitives: `#app` container, `.topbar`, `.hero`,
  `.tabs`, `.card`, `.form-row` (flex, wraps), `.page-grid` (auto-fill grid),
  responsive `@media` blocks at `640px` (and the tool-specific ones already
  present).
- Radius, spacing and typography follow what is already there: cards `16px`,
  controls `11px` or pill `980px`, muted text `var(--text-m)`, sizes in `rem`.
- Motion is minimal and must never delay the tool: the page has no
  entrance/scroll-reveal gate. Animate property changes (`transform`, `opacity`)
  only; do not add an animation that hides the drop zone on first paint.

### Branding

- The product name is **RxPDF Cool**, written exactly like that (`Rx` + `PDF` +
  `Cool`, `.brand-text` / `.brand-accent` in the topbar).
- Header mark: `assets/icon-rxpdf-cool.png`; favicons: `assets/favicon.ico`,
  `assets/favicon-32x32.png`, `assets/favicon-rxpdf-cool.png` (Apple touch).
  Never inline a third-party logo or emoji as the brand mark.
- Keep the page **straight to the tool**: a compact `.topbar`, a one-paragraph
  `.hero` with fact chips, then `.tabs`. Do not reintroduce a full-viewport
  landing screen, a bento marketing grid, or a scroll-to-start cue.
- Copy claims must stay true: AES-256 (not AES-128/RC4), no uploads, no
  accounts, and no file-size claim beyond `LIMITS.maxBytes`.

### Editor rules (Edit tool)

- **Never mutate the source PDF.** Keep the page plan (`S.edit.plan`) and the
  object list (`S.edit.objects`) until save; the source bytes stay untouched.
- Store object geometry as display fractions (`fx/fy/fw/fh`, 0..1), never
  pixels. Clamp every move/resize/creation so the object stays inside the page.
- All limits live in `EDIT_LIMITS` (file size, page count, objects, text length,
  image size, history depth).
- Convert to PDF coordinates only through the pdf.js viewport
  (`viewport.convertToPdfPoint`); it already handles `/Rotate` and CropBox. Do
  not hand-roll rotation math. Draw content with `rotate: -pageRotation` so it
  stays upright.
- `cover` is a white rectangle and must be labelled as a **cover**, never as
  redaction. Do not add a "redact" claim without true content removal.
- Undo/redo snapshots the object list only. If you make page operations
  undoable, extend the snapshot model instead of hiding the limitation.
- The signature pad uses Pointer Events (mouse, stylus, touch) and a DPR-scaled
  canvas; crop to the stroke bounding box and export a transparent PNG. Do not
  rasterize whole PDF pages unless the user explicitly accepts losing text.

### If Tailwind is ever introduced (rule for that day)

Approved only if it is a **build-time, committed artifact** — no CDN JIT script
(it would violate invariant 4 and the CSP):

1. Compile with the Tailwind CLI into a committed `vendor/tailwind/tailwind.css`
   and link that file; never add a `script`-driven runtime.
2. Configure `darkMode: ['selector', '[data-theme="dark"]']` (the selector form
   for the installed version) so one theme switch drives both systems.
3. Map design tokens to Tailwind theme values
   (`--card` → `bg-card`, `--accent` → `bg-accent`) so tokens stay the single
   source of truth. Do not duplicate palettes.
4. No arbitrary values (`bg-[#123456]`, `w-[437px]`) when a token or spacing
   step exists. No `!important`.
5. Keep utility order stable (layout → spacing → typography → colour → state)
   so diffs stay reviewable, and extract repeated clusters into a component
   class in the existing `<style>` block instead of pasting 10 classes again.
6. Preserve semantics: a button stays a `<button>`, and Tailwind classes never
   replace required `title`/`aria-label`.
7. Migrate one tool per commit behind no flag; do not mix two visual systems in
   the same panel.

### Accessibility (applies regardless of stack)

- Prefer real `<button>`/`<label>` elements; do not add clickable `<div>`s.
- Keep the accessibility baseline visible while refactoring: add `role="tab"` +
  `aria-selected` when you touch the tab bar, `aria-live="polite"` on the toast
  container and progress text, and `aria-label` on icon-only controls.
- Do not remove focus affordances. Add a visible focus style rather than
  `outline:none`.
- Minimum touch target ~40px; keep contrast at the level of the existing muted
  text on both themes.

---

## 4. Validation rules (input & file handling)

**A validation layer already exists in `index.html`** (the `LIMITS` object,
`clampInt`, `isPdfName`, `hasPdfMagic`, `fmtBytes`, `readPdfFile`,
`normalizeRange`). Use it. Do not write per-tool ad-hoc checks that duplicate
it, and never bypass it.

### Required intake pipeline for every file

```js
let ab;
try { ab = await readPdfFile(file); }              // Unlock: { allowEncrypted: true }
catch (err) { toast(err.message, 'e'); return; }
```

`readPdfFile` enforces, in order: existence → `.pdf` extension → non-empty →
`<= LIMITS.maxBytes` (1.5 GB) → `%PDF-` magic bytes within the first 1024 bytes
→ a real pdf-lib parse (rejected for encrypted files unless
`allowEncrypted`). Its messages are shown to the user as-is, so keep them
specific and free of internal detail.

### Required intake rules for values

| Kind | Rule |
| --- | --- |
| Integers (size, opacity, start number, pages-per-chunk) | `clampInt(value, min, max, fallback)` — never `parseInt` alone |
| Enumerations (position, format, scale) | allowlist check; fall back to a safe default (`['1','1.5','2','3']`, `'jpeg'`) |
| Page ranges | `normalizeRange(value, totalPages)`; empty result → toast and abort |
| Free text (watermark) | `trim()`, cap at `LIMITS.maxTextLength`, non-empty default |
| Colours | `#RRGGBB` regex before use |
| Passwords | non-empty, `<= 128` chars, confirm must match; never echo, never persist, clear the fields after the operation |
| Collections (merge queue) | cap at `LIMITS.maxMergeFiles` (50) |
| Derived page counts | warn (do not hard-block) above `LIMITS.maxPages` |

### Standing requirements

- **Add a limit to `LIMITS`, not to a magic number in a tool.**
- Every new tool must validate before it parses anything.
- Validation failures are `toast(msg, 'e')` (user error) or `'w'` (soft limit);
  they must not throw out of the handler.
- Update the visible UI copy when a limit changes, and update
  `docs/ARCHITECTURE.md` §6.4 and §11.
- When you add a validation path, extend the manual matrix in
  `docs/ARCHITECTURE.md` §11 with the failure cases you tried (wrong extension,
  empty file, truncated PDF, oversized file, encrypted input, invalid range,
  wrong password).

---

## 5. Security rules

- Keep `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`,
  `object-src 'none'`, `base-uri 'self'`, `form-action 'none'` in
  `netlify.toml`.
- Do not add `unsafe-*` to the CSP. If you must widen a directive, justify it in
  the commit and update `SECURITY.md`.
- Sanitise any filename that becomes a download name via `safeName()`.
- Never introduce `eval`, `new Function`, remote script injection, or
  `document.write`.
- Any security-relevant change is recorded in `SECURITY.md`; real
  vulnerabilities are disclosed per that file, not in a public issue.

---

## 6. Git and review

- Branch from `master`: `fix/…`, `feature/…`, `docs/…`, `refactor/…`.
- Commit prefixes: `Add:`, `Fix:`, `Update:`, `Remove:`, `Docs:`, `Refactor:`.
- One logical change per commit/PR; keep the diff focused.
- Do not commit `.playwright-mcp/`, scratch files, or `vendor/*` changes without
  checksums.

### Before you call a change done

- [ ] No console errors in the browser (a missing favicon 404 aside).
- [ ] Every touched tool still validates its input and reports failures.
- [ ] Buttons disable during runs and re-enable afterwards (success and failure).
- [ ] Light **and** dark theme both look correct.
- [ ] Split and Merge still work (they exercise the Blob worker,
      `importScripts`, and `PDFLibSrc`).
- [ ] Protect output requires the password; Unlock output does not.
- [ ] `docs/ARCHITECTURE.md` and `README.md` updated if structure, limits, or
      behaviour changed.
- [ ] No new network origin, no new storage, no new telemetry.

### Running it locally

```bash
python tools/serve.py 8000      # correct MIME types; required on Windows
```

Do **not** rely on `python -m http.server` on Windows: it serves `.js` as
`text/plain`, and the Split/Merge worker fails with a MIME error.
