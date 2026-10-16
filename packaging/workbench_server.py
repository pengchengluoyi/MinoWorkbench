"""Standalone Workbench static service with validated runtime configuration."""
from __future__ import annotations
import argparse
import json
import mimetypes
import re
import sys
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, unquote

def main():
    ap = argparse.ArgumentParser(prog="mino-workbench")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=5273)
    ap.add_argument("--nexus-url", default="http://mino.local:10104")
    ap.add_argument("--web-root", type=Path)
    ap.add_argument("--releases-root", type=Path)
    ap.add_argument("--identity", action="store_true")
    args = ap.parse_args()
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
    web = (args.web_root or base / "web").resolve()
    identity = json.loads((web / "BUILD.json").read_text())
    if args.identity:
        print(json.dumps(identity))
        return 0
    build = identity["build_id"]
    if not re.fullmatch(r"[A-Za-z0-9._-]+", build):
        ap.error("invalid build id")
    url = urlsplit(args.nexus_url)
    if url.scheme not in {"http", "https"} or not url.hostname or url.username or url.password or url.path not in {"", "/"} or url.query or url.fragment:
        ap.error("--nexus-url must be an HTTP(S) origin")
    config = {"nexusUrl":args.nexus_url.rstrip("/"), "buildId":build}
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format, *values):
            # Do not log URL/query strings which could contain login material.
            pass
        def do_GET(self):
            path = unquote(urlsplit(self.path).path)
            if path == "/health":
                return self.send(json.dumps({"status":"ok", **identity}).encode(), "application/json")
            if path == "/runtime-config.js":
                return self.send(("window.__MINO_CONFIG__=" + json.dumps(config) + ";").encode(), "text/javascript")
            selected = web
            relative = path.lstrip("/")
            if relative.startswith("releases/"):
                parts = relative.split("/", 2)
                if len(parts) != 3 or not re.fullmatch(r"[A-Za-z0-9._-]+", parts[1]):
                    return self.send_error(404)
                if parts[1] != build:
                    if args.releases_root is None:
                        return self.send_error(404)
                    selected = (args.releases_root / parts[1] / "_internal" / "web").resolve()
                    if not selected.is_relative_to(args.releases_root.resolve()):
                        return self.send_error(403)
                relative = parts[2]
            target = (selected / relative).resolve()
            if not target.is_relative_to(selected):
                return self.send_error(403)
            if target.is_file() and target.name != "index.html":
                return self.send(target.read_bytes(), mimetypes.guess_type(target.name)[0] or "application/octet-stream",
                                 immutable=path.startswith("/releases/"))
            # Never replace missing resources with index.html.
            if (Path(relative).suffix and relative != "index.html") or path.startswith("/releases/"):
                return self.send_error(404)
            html = (web / "index.html").read_text()
            html = html.replace("<head>", '<head><base href="/releases/' + build + '/"><script src="/runtime-config.js"></script>', 1)
            return self.send(html.encode(), "text/html; charset=utf-8")
        def send(self, data, content_type, immutable=False):
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "public, max-age=31536000, immutable" if immutable else "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(data)
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    try:
        server.serve_forever()
    finally:
        server.server_close()
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
