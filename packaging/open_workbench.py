"""Open an installed Workbench in the user's browser, including stopped services."""
import argparse
import json
import subprocess
import time
import urllib.request
import webbrowser
from pathlib import Path
from mino_platform import executable


def main(argv=None):
    ap = argparse.ArgumentParser(prog='mino-workbench open')
    ap.add_argument('--root', type=Path, required=True)
    ap.add_argument('--print-url', action='store_true', help='Only print the configured local URL; do not start or open')
    args = ap.parse_args(argv)
    root = args.root.expanduser().resolve(strict=True)
    conf = json.loads((root / 'config/installation.json').read_text())
    if conf.get('component') != 'workbench':
        ap.error('installation is not Workbench')
    host = str(conf['host'])
    if host in {'0.0.0.0', '::', 'localhost'}:
        host = '127.0.0.1' if host != '::' else '::1'
    port = int(conf['port'])
    if not 1 <= port <= 65535 or any(c in host for c in '/?#@\\\r\n'):
        ap.error('invalid installation address')
    url = f'http://{"[" + host + "]" if ":" in host else host}:{port}'
    print(url, flush=True)
    if args.print_url:
        return 0
    subprocess.run([str(executable(root / 'launcher/mino-maintain')), 'start', '--root', str(root)], check=True)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    deadline = time.monotonic() + 30
    while True:
        try:
            with opener.open(url + '/health', timeout=2) as response:
                health = json.load(response)
            if health.get('installation_id') != conf['installation_id'] or health.get('status') != 'ok':
                raise ValueError('address belongs to a different or unhealthy installation')
            break
        except (OSError, ValueError):
            if time.monotonic() >= deadline:
                print('Workbench 未就绪，请运行 mino-workbench status 检查服务。')
                return 1
            time.sleep(0.25)
    if not webbrowser.open(url, new=2):
        print('无法启动默认浏览器，请手动打开上面的地址。')
        return 1
    return 0
