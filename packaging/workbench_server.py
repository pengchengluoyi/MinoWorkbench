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
from mino_platform import current_release, watch_stop

def main():
    if len(sys.argv) > 1 and sys.argv[1] == "open":
        from open_workbench import main as open_main
        return open_main(sys.argv[2:])
    ap = argparse.ArgumentParser(prog="mino-workbench")
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--port", type=int, default=None)
    ap.add_argument("--nexus-url")
    ap.add_argument("--web-root", type=Path)
    ap.add_argument("--releases-root", type=Path)
    ap.add_argument("--identity", action="store_true")
    ap.add_argument("--current-root", type=Path)
    ap.add_argument("--installation-id", default="standalone")
    args = ap.parse_args()
    if args.port is None:
        args.port = 60104
    if args.current_root and args.port == 60104 and args.host in {"127.0.0.1", "localhost"}:
        args.host = "0.0.0.0"  # Existing standard installation, effective LAN bind.
    if args.nexus_url is None:
        args.nexus_url = "http://127.0.0.1:50104"
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
    web = (args.web_root or base / "web").resolve()
    identity = json.loads((web / "BUILD.json").read_text())
    if args.identity:
        print(json.dumps(identity))
        return 0
    build = identity["build_id"]
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,100}", build):
        ap.error("invalid build id")
    url = urlsplit(args.nexus_url)
    if url.scheme not in {"http", "https"} or not url.hostname or url.username or url.password or url.path not in {"", "/"} or url.query or url.fragment:
        ap.error("--nexus-url must be an HTTP(S) origin")
    try:
        _ = url.port
    except ValueError:
        ap.error("invalid Nexus port")
    config = {"nexusUrl":args.nexus_url.rstrip("/"), "buildId":build}
    runtime_file = base / "mino-runtime.json"
    runtime_id = json.loads(runtime_file.read_text())["runtime_id"] if runtime_file.exists() else "unmanaged"
    runtime_build = build
    def active():
        if args.current_root is None:
            return web, identity
        releases = (args.current_root / "releases").resolve(strict=True)
        selected = current_release(args.current_root)
        if selected.parent != releases:
            raise ValueError("current is outside releases")
        release_info = json.loads((selected / "release.json").read_text())
        if release_info.get("runtime_id") != runtime_id:
            raise ValueError("runtime changed: restart required")
        selected_web = selected / "_internal/web"
        selected_identity = json.loads((selected_web / "BUILD.json").read_text())
        if selected_identity["build_id"] != selected.name:
            raise ValueError("release/web identity mismatch")
        return selected_web, selected_identity
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format, *values):
            # Do not log URL/query strings which could contain login material.
            pass
        def do_HEAD(self):
            self.do_GET()
        def do_GET(self):
            path = unquote(urlsplit(self.path).path)
            if "\\" in path or "\x00" in path or any(p in {".", ".."} for p in path.split("/")):
                return self.send_error(400)
            try:
                active_web, active_identity = active()
            except (OSError, ValueError, KeyError):
                return self.send_error(503, "Workbench release unavailable; query update operation")
            active_build = active_identity["build_id"]
            if path == "/health":
                value = {"status": "ok", "health_contract_version": 1, **active_identity, "installation_id": args.installation_id,
                         "runtime_id": runtime_id, "runtime_build_id": runtime_build}
                return self.send(json.dumps(value).encode(), "application/json")
            if path == "/runtime-config.js":
                return self.send(("window.__MINO_CONFIG__=" + json.dumps({**config, "buildId": active_build}) + ";").encode(), "text/javascript")
            selected = active_web
            selected_build = active_build
            relative = path.lstrip("/")
            if relative.startswith("releases/"):
                parts = relative.split("/", 2)
                if len(parts) != 3 or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,100}", parts[1]):
                    return self.send_error(404)
                if parts[1] != active_build:
                    if args.releases_root is None:
                        return self.send_error(404)
                    selected = (args.releases_root / parts[1] / "_internal" / "web").resolve()
                    if not selected.is_relative_to(args.releases_root.resolve()):
                        return self.send_error(403)
                selected_build = parts[1]
                relative = parts[2]
            target = (selected / relative).resolve()
            if not target.is_relative_to(selected):
                return self.send_error(403)
            if target.is_file() and target.suffix != ".html":
                return self.send(target.read_bytes(), mimetypes.guess_type(target.name)[0] or "application/octet-stream",
                                 immutable=path.startswith("/releases/"))
            if target.is_file() and target.suffix == ".html":
                html = target.read_text()
            else:
                # Missing assets/API requests must not look like successful HTML responses.
                if Path(relative).suffix or path.startswith("/releases/") or "text/html" not in self.headers.get("Accept", ""):
                    return self.send_error(404)
                html = (active_web / "index.html").read_text()
            html = html.replace("<head>", '<head><base href="/releases/' + selected_build + '/"><script src="/runtime-config.js"></script>', 1)
            return self.send(html.encode(), "text/html; charset=utf-8")
        def send(self, data, content_type, immutable=False):
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "public, max-age=31536000, immutable" if immutable else "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(data)
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    if args.current_root:
        from command_entry import refresh_when_registered
        refresh_when_registered(args.current_root.resolve())
    watch_stop(server.shutdown)
    try:
        server.serve_forever()
    finally:
        server.server_close()
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
