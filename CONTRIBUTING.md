# Contributing to RxPDF Cool

Thanks for your interest in contributing! This is a small, single-file static project — issues, ideas, and pull requests are all welcome.

## Ways to contribute

- **Report bugs** — open an issue with steps to reproduce, the PDF type/size if relevant, your browser, and the browser console output.
- **Suggest features** — open an issue describing the use case before writing code, especially for larger changes.
- **Improve docs** — README fixes, typos, clearer instructions are always welcome.
- **Submit code** — bug fixes, new features, or refactors via pull request.

## Development setup

There is no build step. Markup lives in `index.html`; styles are split by
concern under `assets/css/` and behaviour under `js/`.

Before structural changes, read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md);
[`.opencode/rules.md`](.opencode/rules.md) has the normative code, JavaScript,
UI and validation rules.

1. **Fork** the repo on GitHub.
2. **Clone** your fork:
   ```bash
   git clone https://github.com/<your-username>/pdf-studio.git
   cd pdf-studio
   ```
3. **Open `index.html`** in your browser. That's it.

   For some browsers (and to avoid file:// quirks), serve it locally:
   ```bash
   python tools/serve.py 8000          # correct MIME types; see the note below
   python tools/serve.py 8000 --bind 0.0.0.0   # only if you need LAN access
   # then open http://localhost:8000
   ```

No npm install, no virtualenv, no dependencies to download. The PDF libraries and the font are vendored under `vendor/` and served from the same origin (see `vendor/README.md` for versions and checksums).

> On Windows, `python -m http.server` reports `.js` as `text/plain`, which makes the browser refuse the Split/Merge worker. `tools/serve.py` sends the correct MIME types, so use it. Opening `index.html` straight from `file://` also blocks Blob workers.

## Making a change

1. **Create a branch** from `master`:
   ```bash
   git checkout -b feature/short-description
   ```
   Use `fix/...` for bug fixes, `docs/...` for documentation, `feature/...` for new features.

2. **Keep changes focused** — one logical change per PR. Smaller PRs get reviewed faster.

3. **Edit the file that owns the change.** Markup in `index.html`, styles in
   `assets/css/`, behaviour in `js/`. Keep the load order documented in
   `docs/ARCHITECTURE.md` §4.

4. **Test manually** before pushing:
   - Reload the page in your browser
   - Run through the affected tool with a small PDF (1-10 pages)
   - Try a larger PDF (100+ pages)
   - Try at least one edge case (corrupt PDF, wrong password, oversized file, etc.)
   - Open the browser console — there should be no errors

5. **Commit** with a clear message:
   ```bash
   git commit -m "Fix: handle PDFs with encrypted pages"
   ```
   Prefixes: `Add:`, `Fix:`, `Update:`, `Remove:`, `Docs:`, `Refactor:`.

6. **Push** to your fork and **open a Pull Request** against `master`.

## Pull request guidelines

Your PR description should include:

- **What** the change does
- **Why** it's needed (link to an issue if there is one)
- **How** you tested it (browser, PDF size, what you tried)
- **Screenshots/GIFs** for any UI changes

## Code style

- **Vanilla JS only** — no frameworks, no build tools, no transpilation. The whole point of this project is that every file is plain, auditable and self-hostable instantly.
- **Keep the source editable by hand.** No minification, no concatenation steps, no generated bundles. CSS and JS are split by concern, not bundled.
- **No new runtime dependencies** without discussing in an issue first. If you must add a library, vendor it under `vendor/` and record its version, source, license and SHA-256/SHA-384 in `vendor/README.md`. Any file that must be fetched from a third-party origin needs a security review and an explicit CSP change.
- **Sanitize anything that touches `innerHTML`** — use the existing `esc()` helper or, better, `textContent` / `createElement`.
- **Every user-visible string is bilingual** — `data-i18n` in markup, `t()` in JS, and an Indonesian translation in `js/i18n-data.js`. Run `node tools/check-i18n.js`. The language switch must not use storage; it lives in `?lang=`.
- **No tracking, analytics, or telemetry.** Privacy is the entire pitch of this project.
- **No secrets in the source.** No API keys, no tokens, no third-party services that require accounts.

## What we're looking for

Good fits for this project:

- Performance improvements for large PDFs
- Better error messages for malformed/encrypted PDFs
- Accessibility improvements (keyboard nav, ARIA, contrast)
- Bug fixes
- New PDF tools that can run fully client-side
- Translations / i18n

Probably **not** a fit (open an issue to discuss first):

- Frameworks (React, Vue, Svelte, etc.) on the frontend
- Any backend, database, or persistence
- User accounts or authentication
- Telemetry, analytics, or tracking of any kind
- A build step

## Reporting security issues

If you find a security vulnerability, **please do not open a public issue.** See [SECURITY.md](SECURITY.md) for the disclosure process.

## Code of conduct

Be kind, be patient, assume good intent. Disagreements are fine; rudeness isn't. Maintainers reserve the right to remove comments or close PRs that don't follow this.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE) that covers this project.

---

Thanks again — every contribution, no matter how small, helps make this tool better.
