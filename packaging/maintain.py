"""Installation/service management and Workbench update entry point; never rolls back Nexus data."""
from __future__ import annotations
import argparse
import hashlib
import json
import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path
import plistlib
import re
import shutil
import signal
import socket
import stat
import subprocess
import sys
import zipfile
import uuid
from urllib.parse import urlsplit

def load(root):
    root = root.expanduser().resolve(strict=True)
    data = json.loads((root / "config/installation.json").read_text())
    return root, data

def install(args):
    root = args.root.expanduser().absolute()
    if root.exists() or root.is_symlink():
        raise ValueError("installation root already exists; baseline installer never overwrites it")
    if root.parent.resolve() != root.parent:
        raise ValueError("installation parent must be resolved, not a symlink")
    nexus = urlsplit(args.nexus_url)
    if nexus.scheme not in {"http", "https"} or not nexus.hostname or nexus.username or nexus.password or nexus.path not in {"", "/"} or nexus.query or nexus.fragment:
        raise ValueError("invalid Nexus origin")
    _ = nexus.port
    if args.label and not re.fullmatch(r"[A-Za-z0-9.-]+", args.label):
        raise ValueError("invalid service label")
    if args.data_dir and not args.data_dir.expanduser().is_dir():
        raise ValueError("registered data root must already exist")
    archive = args.package.resolve(strict=True)
    if hashlib.sha256(archive.read_bytes()).hexdigest() != args.sha256:
        raise ValueError("package digest mismatch")
    with socket.socket() as listener:
        listener.bind((args.host, args.port))
    with zipfile.ZipFile(archive) as z:
        info = json.loads(z.read("release.json"))
        component, build = info["component"], info["build_id"]
        if component not in {"nexus", "workbench"} or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,100}", build):
            raise ValueError("invalid component/build")
        import platform
        machine = "arm64" if platform.machine().lower() in {"arm64", "aarch64"} else "x64"
        if (info["os"], info["arch"]) != (sys.platform, machine):
            raise ValueError("package platform mismatch")
        for row in z.infolist():
            part = Path(row.filename)
            if part.is_absolute() or ".." in part.parts or "\\" in row.filename:
                raise ValueError("unsafe archive path")
            if stat.S_ISLNK(row.external_attr >> 16):
                raise ValueError("archive symlinks are not accepted")
        if component == "workbench":
            from mino_release import package_info
            checked = package_info(archive, args.sha256)
            if checked["payload"] != "binary":
                raise ValueError("first install requires a full binary package")
        root.mkdir(mode=0o700)
        for name in ("launcher", "releases", "config", "updates", "logs"):
            (root / name).mkdir()
        release = root / "releases" / build
        release.mkdir()
        for row in z.infolist():
            if row.filename.startswith("app/") and not row.is_dir():
                target = release / row.filename[4:]
            elif row.filename.startswith("launcher/") and not row.is_dir():
                target = root / row.filename
            else:
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open("xb") as output:
                output.write(z.read(row))
            target.chmod((row.external_attr >> 16) & 0o777 or 0o644)
        (release / "release.json").write_text(json.dumps(info, indent=2))
    if component == "workbench":
        from mino_release import check_release, atomic
        check_release(release, info)
        atomic(release / "mino-installed.json", {"sha256": args.sha256})
    data_root = args.data_dir.expanduser().resolve() if args.data_dir else root / "data"
    if component == "nexus" and args.data_dir is None:
        data_root.mkdir()
    if component == "nexus" and not data_root.is_dir():
        raise ValueError("registered data root must already exist")
    conf = {"environment": args.environment, "installation_id": str(uuid.uuid4()), "component": component, "build_id": build, "data_dir": str(data_root),
            "host":args.host, "port":args.port, "nexus_url":args.nexus_url,
            "release_repository": "pengchengluoyi/MinoWorkbench", "mdns":args.mdns, "label":args.label or "com.mino." + component}
    if not re.fullmatch(r"[A-Za-z0-9.-]+", conf["label"]):
        raise ValueError("invalid service label")
    (root / "config/installation.json").write_text(json.dumps(conf, indent=2))
    (root / "current").symlink_to(Path("releases") / build, target_is_directory=True)
    print(json.dumps({"installed":str(root), "component":component, "build_id":build}))

def service(args):
    root, conf = load(args.root)
    if sys.platform != "darwin":
        raise ValueError("this baseline service adapter is macOS only")
    target = f"gui/{os.getuid()}/{conf['label']}"
    record = root / "config/service.json"
    if args.command == "register":
        dest = args.service_file.expanduser().absolute()
        if dest.exists() or dest.is_symlink() or dest.parent.resolve() != dest.parent:
            raise ValueError("service file must be a new path in a resolved directory")
        existing = subprocess.run(["launchctl", "print", target], capture_output=True)
        if existing.returncode == 0:
            raise ValueError("service label already registered")
        data = {"Label":conf["label"], "ProgramArguments":[str(root / "launcher/mino-maintain"), "run", "--root", str(root)],
                "RunAtLoad":False, "KeepAlive":False,
                "WorkingDirectory":str(root), "EnvironmentVariables":{"MINO_NEXUS_DATA_DIR":conf["data_dir"]}}
        dest.parent.mkdir(parents=True, exist_ok=True)
        with dest.open("xb") as stream:
            plistlib.dump(data, stream)
        record.write_text(json.dumps({"label":conf["label"], "plist":str(dest)}))
        if conf["component"] == "workbench":
            from mino_update_service import register_helper
            register_helper(root, conf, dest)
        print("service definition registered; use start to bootstrap")
    elif args.command == "start":
        saved = json.loads(record.read_text())
        if saved["label"] != conf["label"]:
            raise ValueError("service registration mismatch")
        probe = subprocess.run(["launchctl", "print", target], capture_output=True)
        if probe.returncode:
            subprocess.run(["launchctl", "bootstrap", f"gui/{os.getuid()}", saved["plist"]], check=True)
        subprocess.run(["launchctl", "kickstart", target], check=True)
    elif args.command == "stop":
        subprocess.run(["launchctl", "bootout", target], check=True)
    elif args.command == "status":
        return subprocess.run(["launchctl", "print", target]).returncode
    return 0

def run(args):
    root, conf = load(args.root)
    release = (root / "current").resolve(strict=True)
    if release.parent != root / "releases":
        raise ValueError("current must resolve to a registered release")
    component = conf["component"]
    executable = release / ("mino-" + component)
    command = [str(executable), "--host", conf["host"], "--port", str(conf["port"])]
    env = dict(os.environ)
    if component == "nexus":
        env["MINO_NEXUS_DATA_DIR"] = conf["data_dir"]
        env["MINO_NEXUS_MDNS"] = "1" if conf["mdns"] else "0"
        command += ["--data-dir", conf["data_dir"]]
    else:
        command += ["--nexus-url", conf["nexus_url"], "--releases-root", str(root / "releases"),
                    "--current-root", str(root), "--installation-id", conf["installation_id"]]
    log = logging.getLogger("service")
    log.setLevel(logging.INFO)
    log.addHandler(RotatingFileHandler(root / "logs/service.log", maxBytes=5*1024*1024, backupCount=3))
    child = subprocess.Popen(command, cwd=release, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    def stop(signum, frame):
        if child.poll() is None:
            child.terminate()
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    while True:
        chunk = os.read(child.stdout.fileno(), 16384)
        if not chunk:
            break
        log.info(chunk.decode("utf-8", errors="replace").rstrip())
    return child.wait()

def main():
    ap = argparse.ArgumentParser(prog="mino-maintain")
    sub = ap.add_subparsers(dest="command", required=True)
    p = sub.add_parser("install")
    p.add_argument("--package", type=Path, required=True)
    p.add_argument("--sha256", required=True)
    p.add_argument("--root", type=Path, required=True)
    p.add_argument("--data-dir", type=Path)
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int)
    p.add_argument("--environment", choices=["test", "production"], default="production")
    p.add_argument("--nexus-url")
    p.add_argument("--label")
    p.add_argument("--mdns", action="store_true")
    for name in ("register", "start", "stop", "status", "run"):
        p = sub.add_parser(name)
        p.add_argument("--root", type=Path, required=True)
        if name == "register":
            p.add_argument("--service-file", type=Path, required=True)
    for name in ("check-update", "update", "rollback", "operation", "recover", "cancel-update", "update-worker"):
        p = sub.add_parser(name)
        p.add_argument("--root", type=Path, required=True)
        if name not in {"check-update", "update-worker"}:
            p.add_argument("--operation", required=True)
        if name in {"check-update", "update"}:
            p.add_argument("--manifest", type=Path, required=True)
        if name == "update":
            p.add_argument("--package", type=Path, required=True)
        if name == "rollback":
            p.add_argument("--build", required=True)
        if name in {"update", "rollback"}:
            p.add_argument("--defer", action="store_true", help="persist request without starting helper")
            p.add_argument("--local-verification", action="store_true", help="explicitly test dirty packages; does not certify business compatibility")
    for name in ("github-check", "github-fetch"):
        p = sub.add_parser(name)
        p.add_argument("--root", type=Path, required=True)
        p.add_argument("--tag", default="", required=name == "github-fetch")
        if name == "github-fetch":
            p.add_argument("--build", required=True)
    args = ap.parse_args()
    if args.command in {"github-check", "github-fetch"}:
        from mino_release import legacy_path, installation, current, read, lock, package_info
        from mino_github_release import check, prepare
        root, conf = installation(args.root)
        repo = conf.get("release_repository", "pengchengluoyi/MinoWorkbench")
        if args.command == "github-check":
            value = check(repo, "workbench", read(current(root) / "release.json"), args.tag)
        else:
            with lock(root):
                manifest, package = prepare(root, repo, "workbench", args.tag, args.build)
                from mino_release import manifest_item
                _, item = manifest_item(legacy_path(package.parent / "mino-manifest.json"))
                info = package_info(package, item["sha256"])
                if any(info.get(k) != manifest.get(k) for k in ("component", "version", "build_id", "source_commit")):
                    raise ValueError("Downloaded package metadata differs from manifest")
            value = {"build_id": args.build, "release_tag": args.tag, "package_verified": True, "compatibility_verified": False}
        print(json.dumps(value))
        return 0
    if args.command in {"check-update", "update", "rollback", "operation", "recover", "cancel-update", "update-worker"}:
        from mino_updates import dispatch
        dispatch(args)
        return 0
    if args.command == "install":
        if args.port is None:
            args.port = 60101 if args.environment == "test" else 60104
        if args.nexus_url is None:
            args.nexus_url = "http://127.0.0.1:50101" if args.environment == "test" else "http://mino.local:50104"
        install(args)
        return 0
    if args.command == "run":
        return run(args)
    return service(args)

if __name__ == "__main__":
    raise SystemExit(main())
