#!/usr/bin/env python3
"""Static file server for local development.

Identical to `python3 -m http.server`, except it tells the browser never to
cache anything. Plain http.server sends Last-Modified, so browsers happily
reuse ES modules from disk cache; editing a system under core/ then reloading
would silently keep running the old code, which makes fixes look ineffective.
"""

import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # Keep the console readable; errors still surface via the game.


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f"Dev server (no-cache) on http://localhost:{port}")
    ThreadingHTTPServer(("", port), NoCacheHandler).serve_forever()
