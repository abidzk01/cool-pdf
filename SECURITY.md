# Security Policy

RxPDF Cool is a privacy-first, fully client-side tool. This document explains how the project handles security and how to report issues.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security problems.**

Instead, report privately via either:

- GitHub's [private security advisory](https://github.com/abidzk01/cool-pdf/security/advisories/new) (preferred)
- Open a minimal issue asking for a private channel, without disclosing the details

Please include:

- A clear description of the issue
- Steps to reproduce (or a proof-of-concept HTML/PDF)
- Affected version / commit hash
- Your assessment of impact

You can expect an initial acknowledgement within a few days. Critical issues will be patched as quickly as possible; lower-severity findings will be triaged on a best-effort basis (this is a side project, not a commercial product).

## Threat model

RxPDF Cool runs **entirely in the user's browser**. There is no backend, no upload, no account and no shared state between users. The only browser storage used is `localStorage['rxpdf.lang']` for the UI language; no document data is persisted. This shapes what's in scope and what isn't:

### In scope

- XSS / HTML injection in any UI surface
- Tampering with the third-party libraries the app depends on
- Code paths that could leak the contents of one user's PDF to another origin
- Bugs that could let a malicious PDF execute code outside the pdf.js / pdf-lib sandbox
- Incorrect cryptographic claims (e.g. password protection that doesn't actually protect)

### Out of scope

- Issues that require physical access to the user's device or compromised browser
- Social engineering of the user into uploading sensitive files (the tool is local — there is no upload)
- Bugs in the user's own browser, OS, or browser extensions
- Denial of service caused by the user opening their own enormous PDF
- Findings that require disabling the Content Security Policy or SRI hashes
- Findings against forks that have removed the security headers

## Hardening already in place

- **Zero third-party runtime.** Every script and the font are first-party files under `vendor/`, kept with version, source URL, license and SHA-256/SHA-384 in `vendor/README.md`. There is no CDN origin to tamper with, and the CSP references no external host. The vendored `.js` files were verified against the SHA-384 hashes the project used while it still loaded them from a CDN.
- **Strict security headers** via `netlify.toml`:
  - `Content-Security-Policy` with `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'none'`, and no third-party origin in `script-src`, `style-src`, `worker-src`, `connect-src` or `font-src`
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy` denying camera, microphone, geolocation, and FLoC
- **Filename sanitization** strips path separators, control characters, and Windows-reserved names from every download.
- **Password fields are cleared** from the DOM immediately after the encrypt/unlock operation completes.
- **No storage of document data.** The only persisted value is `localStorage['rxpdf.lang']` (EN/ID). No PDF bytes, names, passwords, cookies or analytics are stored, and no `sessionStorage`/`indexedDB` is used.
- **No analytics, telemetry, or tracking of any kind.** There are no third-party scripts at all.
- **One validation gate for every file**: extension check, size ceiling, `%PDF-` magic bytes within the first 1024 bytes, and a real pdf-lib parse before any tool touches the bytes. Form values are clamped or allowlisted, and page ranges are validated against the document's page count.
- **Encryption is real.** Protect applies **AES-256** (ISO 32000-2 R6) through `@cantoo/pdf-lib`'s `encrypt()`, with a random 32-byte owner password per save; Unlock decrypts with the supplied password and rebuilds a fresh document so the output carries no `/Encrypt` dictionary. (Upstream `pdf-lib@1.17.1` silently ignored password options, which is why the project switched to the maintained fork.)
- **MIT-licensed source** — anyone can audit the entire app: a ~570-line `index.html` shell plus plain CSS in `assets/css/` and JavaScript in `js/`.
- **Editor stays local.** Signatures are drawn on a canvas, cropped client-side and embedded as PNG; no ink, image or metadata value is stored or transmitted.

## Known limitations

These are tracked, documented, and not currently considered emergencies:

### `pdf.js` version

The app uses **pdf.js 3.11.174**, which is affected by [CVE-2024-4367](https://nvd.nist.gov/vuln/detail/CVE-2024-4367) (arbitrary JS execution via a crafted font in a PDF, fixed in 4.2.67).

**Why it's not yet upgraded:** pdf.js 4.x dropped the UMD build and ships only as ES modules (`.mjs`), which would require restructuring how the app loads and calls the library.

**Why the impact is limited here:** pdf.js is used only to render small page thumbnails for the visual split UI. There is no cross-user state, no server, no persistent storage. A malicious PDF crafted to exploit this CVE can only affect the current tab of the user who deliberately opened it — and that user already has the file.

**Mitigation:** the version is pinned by the checksums in `vendor/README.md` (and was verified against the project's former SHA-384 SRI hash). An upgrade to pdf.js 4.x is planned.

### CSP `unsafe-inline` and `unsafe-eval`

The Content Security Policy currently allows `'unsafe-inline'` (the markup still uses inline `onclick`/`onchange` handlers and `style` attributes) and `'unsafe-eval'` (required by some pdf.js code paths). Application JavaScript itself now lives in external files under `js/`, so no executable inline `<script>` block remains except the non-executable JSON-LD data block.

**Why the impact is limited here:** the app processes **only PDF files** as user input. No text input is ever rendered into HTML. The `esc()` helper escapes filenames before they touch any `innerHTML`. There is no realistic XSS vector.

**Mitigation planned:** replace the remaining inline event handlers with delegated listeners so `'unsafe-inline'` can be dropped from `script-src`.

### Local development server

`python -m http.server` on Windows reports `.js` as `text/plain`, and some
browsers then refuse the Split/Merge Blob worker (`importScripts` MIME error).
That is a local tooling quirk, not a vulnerability, but it makes two tools
unusable. Use `python tools/serve.py` (which sets correct MIME types), or any
host that serves `.js` as JavaScript.

## Security-relevant changes

Material security changes are noted in commit messages and, for any disclosed CVE, in this document. For a full audit trail, see the [git log](https://github.com/abidzk01/cool-pdf/commits/master).

## Disclosure policy

- **Coordinated:** I'll work with you on a fix, then credit you (if you'd like) when the patch ships.
- **No bug bounty:** this is an unpaid side project. A thank-you and credit are all I can offer.
- **No legal action:** good-faith security research is welcome and appreciated.

Thanks for helping keep RxPDF Cool safe.
