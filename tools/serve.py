#!/usr/bin/env python3
"""Static development server for PDF Studio.

Why this exists: on Windows, ``python -m http.server`` resolves the ``.js``
content type from the registry, which reports ``text/plain``. Browsers then
refuse the Blob worker's ``importScripts('vendor/pdf-lib/pdf-lib.min.js')``
with "MIME type ('text/plain') is not executable", and the Split/Merge tools
fail. Production hosts (Netlify, nginx, GitHub Pages) already send the right
type, so this only affects local development.

Usage:
    python tools/serve.py            # http://127.0.0.1:8000
    python tools/serve.py 8080       # custom port
    python tools/serve.py 8080 --bind 0.0.0.0
"""

import argparse
import http.server
import os
import socketserver

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

_MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".pdf": "application/pdf",
    ".webmanifest": "application/manifest+json",
    ".xml": "application/xml; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".toml": "text/plain; charset=utf-8",
}


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, **_MIME}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        # Keep local iteration honest: never cache during development.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        print("%s - %s" % (self.address_string(), fmt % args))


class Server(socketserver.ThreadingTCPServer):
    daemon_threads = True
    allow_reuse_address = True


def main():
    parser = argparse.ArgumentParser(description="Serve PDF Studio locally.")
    parser.add_argument("port", nargs="?", type=int, default=8000)
    parser.add_argument("--bind", default="127.0.0.1")
    args = parser.parse_args()

    with Server((args.bind, args.port), Handler) as httpd:
        print(f"PDF Studio dev server running at http://{args.bind}:{args.port}/")
        print(f"Serving {ROOT}")
        print("Press Ctrl+C to stop.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()
