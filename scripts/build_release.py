"""Build one native, self-contained baseline release; never publishes by itself."""
from __future__ import annotations
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "packaging"))

def command(args, **kwargs):
    subprocess.run(args, check=True, **kwargs)

def build(args):
    component = "nexus" if (ROOT / "mino_nexus").is_dir() else "workbench"
    version = ((ROOT / "mino_nexus/VERSION").read_text().strip() if component == "nexus"
               else json.loads((ROOT / "package.json").read_text())["version"])
    commit = subprocess.check_output(["git", "-C", str(ROOT), "rev-parse", "HEAD"], text=True).strip()
    dirty = bool(subprocess.check_output(["git", "-C", str(ROOT), "status", "--porcelain"], text=True).strip())
    if dirty and not args.allow_dirty:
        raise SystemExit("dirty source cannot produce a published release; use --allow-dirty for local verification")
    build_id = version + "-" + commit[:12] + ("-local-" + datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d%H%M%S") if dirty else "")
    osn, arch = sys.platform, "arm64" if platform.machine().lower() in {"arm64", "aarch64"} else "x64"
    out = args.output.expanduser().resolve()
    work = out / ("build-" + build_id)
    work.mkdir(parents=True, exist_ok=False)
    identity = {"component": component, "version":version, "build_id":build_id,
                "source_commit":commit, "dirty":dirty, "os":osn, "arch":arch}
    if component == "workbench":
        from hi3d_release import CONTRACT, package_info, sha, runtime_digest
        identity.update(workbench_contract=CONTRACT, payload="static" if args.static_from else "binary",
                        tested_nexus_builds=args.tested_nexus_build or (json.loads((ROOT / "packaging/hi3d-compatibility.json").read_text())["tested_nexus_builds"] if (ROOT / "packaging/hi3d-compatibility.json").is_file() else []))
        if args.static_from:
            original = package_info(args.static_from, sha(args.static_from))
            if original["payload"] != "binary":
                raise ValueError("--static-from requires a complete native runtime package")
            identity["runtime_id"] = original["runtime_id"]
    elif args.static_from:
        raise ValueError("static updates only apply to Workbench")
    env = dict(os.environ, MINO_NEXUS_DATA_DIR=str(work / "isolated-data"), MINO_NEXUS_MDNS="0",
               PYINSTALLER_CONFIG_DIR=str(work / "pyinstaller-cache"), PYTHONDONTWRITEBYTECODE="1")
    source = work / "source"
    source.mkdir()
    if component == "nexus":
        shutil.copytree(ROOT / "mino_nexus", source / "mino_nexus", ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
        (source / "mino_nexus/BUILD.json").write_text(json.dumps(identity))
        entry = work / "hi3d-entry.py"
        entry.write_text("from mino_nexus.cli import main\nraise SystemExit(main())\n")
        extra = ["--paths", str(source), "--collect-submodules", "mino_nexus",
                 "--add-data", str(source / "mino_nexus") + os.pathsep + "mino_nexus",
                 "--collect-all", "litellm", "--collect-all", "tiktoken_ext", "--collect-all", "lark_oapi",
                 "--collect-all", "zeroconf", "--collect-all", "sqlalchemy",
                 "--copy-metadata", "litellm", "--copy-metadata", "uvicorn"]
        env["PYTHONPATH"] = str(source) + os.pathsep + env.get("PYTHONPATH", "")
    else:
        web = work / "web"
        command(["npm", "run", "build", "--", "--base", "./", "--outDir", str(web)], cwd=ROOT, env=env)
        (web / "BUILD.json").write_text(json.dumps(identity))
        entry = ROOT / "packaging/workbench_server.py"
        extra = ["--add-data", str(web) + os.pathsep + "web"]
    if not args.static_from:
        base = [sys.executable, "-m", "PyInstaller", "--noconfirm", "--console",
                "--distpath", str(work / "dist"), "--workpath", str(work / "freeze"),
                "--specpath", str(work)]
        command([*base, "--name", "mino-" + component, *extra, str(entry)], cwd=source, env=env)
        command([*base, "--name", "mino-maintain", str(ROOT / "packaging/maintain.py")], cwd=source, env=env)
        executable = work / "dist" / ("mino-" + component) / ("mino-" + component + (".exe" if osn == "win32" else ""))
        command([str(executable), "--help"], env=env)
        if component == "nexus":
            command([str(executable), "migrate", "--data-dir", str(work / "package-probe-data")], env=env)
        else:
            command([str(executable), "--identity"], env=env)
        if component == "workbench":
            identity["runtime_id"] = runtime_digest(executable.parent)
            (executable.parent / "_internal/hi3d-runtime.json").write_text(json.dumps({"runtime_id": identity["runtime_id"]}))
            (executable.parent / "_internal/web/BUILD.json").write_text(json.dumps(identity))
    archive = out / ("hi3d-Mino" + component.capitalize() + "-" + build_id + "-" + osn + "-" + arch + ".zip")
    with zipfile.ZipFile(archive, "x", compression=zipfile.ZIP_DEFLATED) as z:
        z.writestr("release.json", json.dumps(identity))
        folders = [(web, "app/_internal/web")] if args.static_from else [(executable.parent, "app"), (work / "dist/mino-maintain", "launcher")]
        for folder, prefix in folders:
            # Materialize framework links as ordinary entries for a portable,
            # path-safe installer. Do not include build data or credentials.
            for current, dirs, files in os.walk(folder, followlinks=True):
                for name in files:
                    path = Path(current) / name
                    z.write(path, prefix + "/" + path.relative_to(folder).as_posix())
    item = {"os":osn, "arch":arch, "filename":archive.name, "sha256":hashlib.sha256(archive.read_bytes()).hexdigest(),
            "bytes":archive.stat().st_size, "payload":"binary", "installer":"baseline-v1", **identity}
    (out / ("item-" + osn + "-" + arch + ".json")).write_text(json.dumps(item, indent=2))
    print(json.dumps(item))

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--output", type=Path, required=True)
    ap.add_argument("--allow-dirty", action="store_true")
    ap.add_argument("--tested-nexus-build", action="append", default=[], help="exact Nexus build already verified with this source; repeatable")
    ap.add_argument("--static-from", type=Path, help="native release whose exact runtime will be reused")
    build(ap.parse_args())
