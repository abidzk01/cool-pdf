---
name: PDF Tool Development
description: Add a new client-side PDF tool to PDF Studio, or change the Split, Merge, Compress, Images, Watermark, Page Numbers, Protect or Unlock tool. Use when the task touches index.html, the Blob worker, validation, downloads or progress in this repo.
---

# PDF Tool Development

Use this skill whenever you add or modify a tool in `index.html`. Read
`docs/ARCHITECTURE.md` §5–§6 and `.opencode/rules.md` first; this skill is the
executable checklist on top of them.

## Non-negotiables

- Everything runs in the browser tab. No upload, no backend, no storage, no
  analytics, no new third-party origin.
- No build step: the change lives in `index.html` (plus docs), hand-readable.
- Every file goes through `readPdfFile()`; every numeric/enumerated value goes
  through `clampInt()` or an allowlist.
- Libraries: `pdfjsLib` for rendering, `PDFLib` (`@cantoo/pdf-lib`) for
  read/write. Encryption is `doc.encrypt(...)`, never `save({ userPassword })`.

## Workflow

1. **Locate the pattern.** Pick the closest existing tool and copy its shape:
   `startCompress` (main thread, simple), `startWatermark` (per-page drawing),
   `startSplit`/`startMerge` (Blob worker).
2. **Markup.** Add the tab button, `#panel-<id>` with `.card` + `.drop-zone`
   (`id="dz-<id>"`, `<input id="fi-<id>">`, `dzOver/dzLeave/dzDrop`), options in
   `.form-row`/`.form-group`, and the `#pw-<id>` progress block with
   `#pf-/ps-/pp-/pe-<id>`.
3. **State.** Add a `<tool>File` holder to `S`. Do not create new globals.
4. **Loader.** `load<Name>File(file)` → `try { ab = await readPdfFile(file) }`
   → `catch { toast(err.message,'e'); return }` → store → reveal options.
5. **Runner.** `start<Name>()` with the guard
   `if(S.busy || !S.<tool>File) return;`, clamped inputs, `setAllBusy(true)`,
   `showProgress('<id>', true)`, loop with `setProgress`, `downloadBytes()` or
   `downloadZip()` in `try`, and `finally { setAllBusy(false); }`.
6. **Dispatch.** Add the new id to `dzDrop`'s chain so drag-and-drop works.
7. **Heavy work.** If a transform can exceed ~1 s, add a branch to `WORKER_SRC`
   and call it through `runWorkerTask()`, passing transferables and
   `PDFLibSrc: PDFLIB_URL` (absolute — required inside the Blob worker).
8. **Copy.** Update the bento grid, JSON-LD `featureList`, meta description and
   `README.md` if the tool is new or renamed.
9. **Docs.** Update `docs/ARCHITECTURE.md` §6.4 (pipelines), §9 (gaps) and §11
   (verification matrix).

## Verify (do not skip)

```bash
python tools/serve.py 8000
```

Then in the browser: the new tool handles a 6-page PDF, a corrupt/renamed
`.txt`, an oversized file, and an encrypted file; progress advances; buttons
re-enable after both success and failure; both themes render; DevTools console
is clean. For worker tools, confirm no `importScripts` MIME error appears.

`references/checklist.md` has the full pre-commit list.
