---
name: Privacy and Security Audit
description: Audit RxPDF Cool for privacy, security, CSP, validation and supply-chain regressions before a release or after a dependency change. Use when reviewing index.html, netlify.toml, vendor/, SECURITY.md or any change that touches file intake, encryption, or external origins.
---

# Privacy and Security Audit

Use this skill to audit this repository. It is a static, client-side app, so the
threat model is narrow and mostly about *not* regressing the guarantees the
project advertises. Report findings; only change code when asked.

## 1. No-egress audit

Grep for anything that could leave the device or persist data:

```bash
grep -rnE "fetch\(|XMLHttpRequest|WebSocket|sendBeacon|navigator\.sendBeacon" index.html js
grep -rnE "localStorage|sessionStorage|indexedDB|document\.cookie" index.html js
grep -rnoE "https?://[^\"' )]+" index.html js assets/css
```

Expected: no network API call for user data; the **only** storage allowed is
`localStorage['rxpdf.lang']` (no `sessionStorage`, `indexedDB`, cookies or any
other key); the only URLs in `index.html` are metadata (Open Graph, JSON-LD) and
the outbound links to <https://teer.id/rxdiag> and <https://rxdiag.my.id> (both
must use `target="_blank"` + `rel="noopener noreferrer"` and must not be
fetched). Any runtime asset must be first-party under `vendor/`, `js/` or
`assets/`.

## 2. CSP and headers (`netlify.toml`)

- `default-src 'self'`; no third-party origin in `script-src`, `style-src`,
  `worker-src`, `connect-src`, `font-src`.
- `object-src 'none'`, `base-uri 'self'`, `form-action 'none'`.
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy`, `Permissions-Policy` present.
- `'unsafe-inline'`/`'unsafe-eval'` are known, accepted debt: inline
  `onclick`/`onchange` handlers and `style` attributes still need the former,
  and pdf.js needs the latter. Application JS is external under `js/`; flag any
  *additional* relaxation.

## 3. Supply chain (`vendor/`)

- Every file listed in `vendor/README.md` with version, source, license and
  SHA-256/SHA-384; recompute the hashes and compare.
- No CDN `<script>` or font link reintroduced in `index.html`.
- Worker `importScripts` target is `PDFLIB_URL` (absolute first-party path).
- pdf.js version is noted in `SECURITY.md` with its CVE status.

## 4. Input handling

- All intake flows through `readPdfFile()`; confirm no tool calls
  `file.arrayBuffer()` directly.
- `hasPdfMagic()` runs before any parse; `allowEncrypted` is used *only* by
  Unlock.
- `esc()` wraps every user-controlled interpolation; `safeName()` wraps every
  download name.
- `LIMITS` is the only place numbers like 1.5 GB / 3000 / 50 live.

## 5. Cryptography claims

- Protect uses `doc.encrypt(...)` (AES-256 via `@cantoo/pdf-lib`); verify the
  output contains `/Encrypt` and `/AESV3`, and refuses to open without the
  password.
- Unlock rebuilds a fresh document via `copyPages`; verify the output has no
  `/Encrypt` and opens without a prompt.
- No copy anywhere claims a cipher the code does not use.

## 6. Report format

```text
Finding: <one line>
Severity: critical | high | medium | low
Location: <file>:<line or section>
Evidence: <command output / observed behaviour>
Impact: <what an attacker or user gets>
Fix: <smallest correct change>
```

Order findings by severity. If nothing is wrong in an area, state it explicitly
so the audit is auditable itself.
