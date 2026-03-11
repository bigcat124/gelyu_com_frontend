"""Local dev server that mimics Firebase Hosting rewrites.

Usage: python dev_server.py [port]
Default port: 5001
"""

import os
import re
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5001


class RewriteHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        # Rewrite /vaults/<slug>/settings to /vault-settings.html
        if re.match(r"^/vaults/[^/]+/settings$", path):
            path = "/vault-settings.html"
        # Rewrite /vaults/<slug>/<albumSlug> to /vault-album.html
        elif re.match(r"^/vaults/[^/]+/[^/]+$", path):
            path = "/vault-album.html"
        # Rewrite /vaults/<slug> to /vault-detail.html
        elif path.startswith("/vaults/"):
            path = "/vault-detail.html"
        return super().translate_path(path)


os.chdir(os.path.dirname(os.path.abspath(__file__)))
print(f"Serving frontend at http://localhost:{PORT}")
HTTPServer(("", PORT), RewriteHandler).serve_forever()
