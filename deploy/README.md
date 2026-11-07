# Deploying RxPDF Cool

This is a static site: upload the repository contents and serve them. There is
no build step and no server-side code.

## Why styles sometimes do not update

Browsers and CDNs cache `assets/css/*.css` and `js/*.js` aggressively. If a VPS
keeps the old CSS after a deploy, it is almost always one of these:

1. Only `index.html` was uploaded — `assets/`, `js/` and `vendor/` must be
   uploaded too.
2. `index.html` is cached by the server/CDN, so it still points at the old
   assets.
3. The server sends no cache policy, so the browser guesses (heuristic caching).

The repository solves this in two layers:

- **Content-hashed URLs.** `index.html` links every first-party asset with
  `?v=<sha256-8>`, e.g. `assets/css/editor.css?v=111a5759`. When a file changes,
  its URL changes and old caches are bypassed.
- **Cache policy.** `index.html` revalidates; hashed assets are immutable.

## Checklist for a VPS

```bash
# 1. Pull the repository (all folders, not just index.html)
git pull

# 2. Re-stamp the asset URLs after any CSS/JS change, then commit
node tools/stamp-assets.js

# 3. Install the cache config (nginx example, or the .htaccess one)
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/rxpdf-cool
# edit server_name/root, enable the site, then:
sudo nginx -t && sudo systemctl reload nginx
```

If you use **Cloudflare** or another CDN, purge the cache after a deploy (or
set a rule that bypasses cache for `/index.html`).

Verify the headers:

```bash
curl -sI https://your.site/index.html | grep -i cache-control
# Cache-Control: no-cache, must-revalidate

curl -sI https://your.site/assets/css/theme.css | grep -i cache-control
# Cache-Control: public, max-age=31536000, immutable
```

Then hard-reload once (Ctrl+F5) to drop the old HTML.

## Other hosts

- **Netlify** — `netlify.toml` already sets the cache and security headers.
- **Apache** — rename `deploy/apache.htaccess.example` to `.htaccess`.
- **GitHub Pages / Cloudflare Pages** — the hashed URLs do the work; the
  platform's default caching is fine.

## Local development

```bash
python tools/serve.py 8000   # correct MIME types (required on Windows)
```

`tools/serve.py` sends `Cache-Control: no-store`, so local iterations never hit
a stale file.