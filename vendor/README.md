# Vendored dependencies

Everything the app loads at runtime lives here, so the page never talks to a
third-party origin. There is no package manager and no install step: these are
the exact bytes the browser executes.

## Check an update before trusting it

```powershell
# SHA-256, per file
Get-FileHash vendor\pdf-lib\pdf-lib.min.js -Algorithm SHA256
```

```bash
# or from any shell with sha256sum / openssl
sha256sum vendor/pdf-lib/pdf-lib.min.js
```

## Inventory

| File | Package | Version | License | SHA-256 |
| --- | --- | --- | --- | --- |
| `pdfjs/pdf.min.js` | [pdf.js](https://mozilla.github.io/pdf.js/) | 3.11.174 | Apache-2.0 | `W1eZ5vjGgGYyB6xbQu4U7tKkBvp69I9QwVTwwLFWaUY=` |
| `pdfjs/pdf.worker.min.js` | pdf.js | 3.11.174 | Apache-2.0 | `/qvfMJdw7SS7oxpUZ4Ns3Iz2OccFryfVK1hbBBu4Uns=` |
| `pdf-lib/pdf-lib.min.js` | [@cantoo/pdf-lib](https://www.npmjs.com/package/@cantoo/pdf-lib) | 2.11.1 | MIT | `IpSgu4dC2JSK4tSaYMtqNgDAtd6ubeGY5X+zaNG3m6k=` |
| `jszip/jszip.min.js` | [JSZip](https://stuk.github.io/jszip/) | 3.10.1 | MIT | `rMfkFFWoB2W1/Zx+4bgHim0WC7vKRVrq6FTeZclH1Z4=` |
| `inter/InterVariable.woff2` | [Inter](https://rsms.me/inter/) | variable (100–900) | OFL-1.1 | `aTt31PMu6bi/yZVYm1+tXpmt8oMnOGYfVAL5l4QpqOM=` |

Full SHA-384 (base64) values, useful because they are the format SRI uses:

```text
pdfjs/pdf.min.js          sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e
pdfjs/pdf.worker.min.js   sha384-SnzOobpRMLXZ52iJvZm/C0fYw0OQemTXzTjIsdsfMcrCtCEe9qgzxTd3RSklO5x2
pdf-lib/pdf-lib.min.js    sha384-BcRbGROz3cx4LSKcOw2L5YxAxiJPWIEmXRMrYbXu87aSiU5uMQ4qB9v8FEjrBhhq
jszip/jszip.min.js        sha384-+mbV2IY1Zk/X1p/nWllGySJSUN8uMs+gUAN10Or95UBH0fpj6GfKgPmgC5EXieXG
inter/InterVariable.woff2 sha384-NDj3qtsUEjin1XBDZ9zwBRsJjDf51qDfUnZZfiNICq+3AWnh8dTXCRjW9qQHFnEK
```

## Sources

```text
https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js
https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js
https://unpkg.com/@cantoo/pdf-lib@2.11.1/dist/pdf-lib.min.js
https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
https://rsms.me/inter/font-files/InterVariable.woff2
```

## Why `@cantoo/pdf-lib` and not `pdf-lib`

Upstream `pdf-lib@1.17.1` accepts `save({ userPassword, ownerPassword })` and
**silently ignores them**, producing an unencrypted file, and it cannot open a
password-protected document. `@cantoo/pdf-lib` is the API-compatible, MIT
fork that implements AES-256 (ISO 32000-2 R6) encryption and password
decryption via `doc.encrypt(...)` / `load(..., { password })`. This is what
makes the Protect and Unlock tools real rather than cosmetic.

## Update procedure

1. Download the new file to a scratch path; never overwrite in place first.
2. Verify the file against the publisher's release checksum or signature.
3. Compute SHA-256 and SHA-384 and update the tables above in the same commit.
4. Grep the app for the old filename/version strings (for example
   `PDFLIB_URL`, `pdfjsLib.version` assertions in tests or docs).
5. Run the manual verification matrix in `docs/ARCHITECTURE.md` §11, at minimum
   Split (worker), Merge (worker), Protect, and Unlock.
