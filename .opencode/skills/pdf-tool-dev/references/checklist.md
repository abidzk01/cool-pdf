# Pre-commit checklist — RxPDF Cool change

Copy this into the PR description and tick what you verified.

## Intake and validation

- [ ] Every touched tool calls `readPdfFile()` and reports failures with
      `toast(err.message, 'e')`.
- [ ] Numeric inputs use `clampInt(value, min, max, fallback)`; enums are
      allowlisted; the split range uses `normalizeRange(value, totalPages)`.
- [ ] New limits were added to the `LIMITS` object, not inline as magic numbers.
- [ ] Password rules hold: non-empty, `<= 128` chars, confirm match, fields
      cleared after the operation.
- [ ] Failure cases tried: wrong extension, empty file, truncated PDF,
      oversized file, encrypted input, invalid range, wrong password.

## Behaviour

- [ ] The tool produces correct output for a small PDF (1–10 pages) and a large
      one (100+ pages or a big MB size).
- [ ] Buttons disable during the run and re-enable afterwards, including when
      the run fails.
- [ ] Progress advances and the ETA/counter are sensible; the bar hides on
      clear.
- [ ] Downloads use the sanitised name from `safeName()` and land with the
      expected filename.
- [ ] Split and Merge still work (Blob worker + `importScripts` + `PDFLIB_URL`).
- [ ] Protect output requires the password; Unlock output opens without one.

## Quality

- [ ] No console errors (a `favicon.ico` 404 aside).
- [ ] Light and dark themes both look right; only theme variables are used for
      colour.
- [ ] No new network origin, no `localStorage`/cookies/IndexedDB, no telemetry.
- [ ] `esc()` guards every user-controlled value interpolated into HTML.
- [ ] Diff is focused; no unrelated reformatting; dead code removed only where
      touched.

## Docs

- [ ] `docs/ARCHITECTURE.md` updated (pipelines §6.4, gaps §9, matrix §11) if
      structure, limits, or behaviour changed.
- [ ] `README.md` updated if tools, requirements, or the folder structure
      changed.
- [ ] `vendor/README.md` updated with version, source, license and hashes if a
      vendored file changed.
- [ ] `SECURITY.md` updated for any security-relevant change.
- [ ] Commit message uses the project prefix (`Add:`, `Fix:`, `Update:`,
      `Remove:`, `Docs:`, `Refactor:`).
