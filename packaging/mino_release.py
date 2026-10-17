"""Workbench release validation and durable filesystem primitives (no service control)."""
import contextlib
import fcntl
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import stat
import tempfile
import zipfile

CONTRACT = {"updater": 1, "runtime_config": 1, "hot_swap": 1}
TERMINAL = {"succeeded", "failed", "rolled_back", "cancelled", "needs_operator"}


def identifier(value):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,100}", value):
        raise ValueError("invalid build/operation ID")
    return value



def legacy_path(path):
    """Keep pre-branding installation records usable without rewriting user data."""
    old = path.with_name(path.name.replace("mino-", "hi3d-", 1))
    return old if not path.exists() and old.exists() else path

def read(path):
    return json.loads(legacy_path(path).read_text())


def sync_dir(path):
    fd = os.open(path, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def atomic(path, value):
    fd, temporary = tempfile.mkstemp(prefix=".write-", dir=path.parent)
    with os.fdopen(fd, "w") as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)
    sync_dir(path.parent)


def installation(path):
    root = path.expanduser().resolve(strict=True)
    for name in ("updates", "releases", "config", "launcher"):
        if (root / name).is_symlink() or not (root / name).is_dir():
            raise ValueError("installation directory boundary is invalid")
    conf = read(root / "config/installation.json")
    if conf["component"] != "workbench":
        raise ValueError("this updater only handles Workbench, never Nexus data")
    if not conf.get("installation_id"):
        raise ValueError("legacy baseline lacks update identity; install the new baseline in a separate root")
    return root, conf


def current(root):
    target = (root / "current").resolve(strict=True)
    if target.parent != root / "releases":
        raise ValueError("current points outside releases")
    identifier(target.name)
    return target


@contextlib.contextmanager
def lock(root):
    path = legacy_path(root / "updates/mino-update.lock")
    if path.is_symlink():
        raise ValueError("update lock may not be a symlink")
    with path.open("a") as stream:
        try:
            fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError("update helper is busy; query the original operation") from None
        yield


def sha(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def runtime_digest(folder):
    digest = hashlib.sha256()
    paths = []
    for directory, dirs, files in os.walk(folder, followlinks=True):
        if len(Path(directory).relative_to(folder).parts) > 50:
            raise ValueError("runtime directory nesting exceeds limit")
        for name in files:
            path = Path(directory) / name
            if not path.resolve().is_relative_to(folder.resolve()):
                raise ValueError("runtime file escapes release boundary")
            paths.append(path)
    for path in sorted(paths):
        relative = path.relative_to(folder).as_posix()
        if relative.startswith("_internal/web/") or relative in {"release.json", "mino-installed.json", "_internal/mino-runtime.json", "hi3d-installed.json", "_internal/hi3d-runtime.json"}:
            continue
        digest.update(relative.encode() + b"\0" + sha(path).encode() + b"\0")
    return digest.hexdigest()


def check_release(folder, info):
    if info.get("component") != "workbench" or info.get("workbench_contract") != CONTRACT:
        raise ValueError("release does not support the installed Workbench update contract")
    identifier(info["build_id"])
    web = folder / "_internal/web"
    identity = read(web / "BUILD.json")
    if any(identity.get(k) != info.get(k) for k in ("build_id", "source_commit", "component")):
        raise ValueError("web identity does not match release")
    if not (web / "index.html").is_file() or not any((web / "assets").glob("*.js")):
        raise ValueError("release is missing web entry/resources")
    if read(folder / "_internal/mino-runtime.json").get("runtime_id") != info.get("runtime_id"):
        raise ValueError("runtime identity metadata mismatch")
    if runtime_digest(folder) != info.get("runtime_id"):
        raise ValueError("runtime digest mismatch")


def package_info(package, digest):
    if sha(package) != digest:
        raise ValueError("package SHA256 mismatch")
    with zipfile.ZipFile(package) as archive:
        rows = archive.infolist()
        if len(rows) > 100000 or sum(r.file_size for r in rows) > 2_000_000_000:
            raise ValueError("package exceeds installation limits")
        seen = set()
        for row in rows:
            part = Path(row.filename)
            if (part.is_absolute() or ".." in part.parts or "\\" in row.filename or row.filename in seen
                    or stat.S_ISLNK(row.external_attr >> 16)):
                raise ValueError("unsafe/duplicate archive entry")
            seen.add(row.filename)
        info = json.loads(archive.read("release.json"))
        if info.get("component") != "workbench" or info.get("workbench_contract") != CONTRACT:
            raise ValueError("unsupported Workbench contract")
        identifier(info["build_id"])
        machine = "arm64" if platform.machine().lower() in {"arm64", "aarch64"} else "x64"
        import sys
        if (info.get("os"), info.get("arch")) != (sys.platform, machine):
            raise ValueError("release platform mismatch")
        if info.get("payload") not in {"binary", "static"}:
            raise ValueError("unknown payload kind")
        if not re.fullmatch(r"[a-f0-9]{64}", info.get("runtime_id", "")):
            raise ValueError("missing runtime digest")
        for row in rows:
            if info["payload"] == "static" and row.filename != "release.json" and not row.filename.startswith("app/_internal/web/"):
                raise ValueError("static package contains runtime/launcher data")
        return info


def extract_app(package, folder):
    with zipfile.ZipFile(package) as archive:
        for row in archive.infolist():
            if not row.filename.startswith("app/") or row.is_dir():
                continue
            path = folder / row.filename[4:]
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("xb") as stream:
                stream.write(archive.read(row))
            path.chmod((row.external_attr >> 16) & 0o777 or 0o644)


def switch(root, build):
    identifier(build)
    link = root / (".current-" + next(tempfile._get_candidate_names()))
    link.symlink_to(Path("releases") / build)
    os.replace(link, root / "current")
    sync_dir(root)


def manifest_item(path):
    manifest = read(path)
    if manifest.get("manifest_schema_version") != 1 or manifest.get("component") != "workbench":
        raise ValueError("unsupported manifest schema/component")
    import sys
    machine = "arm64" if platform.machine().lower() in {"arm64", "aarch64"} else "x64"
    items = [item for item in manifest["items"] if (item.get("os"), item.get("arch")) == (sys.platform, machine)]
    if len(items) != 1:
        raise ValueError("manifest must contain exactly one item for this platform")
    item = items[0]
    if any(item.get(k) != manifest.get(k) for k in ("component", "build_id", "source_commit", "version")):
        raise ValueError("manifest identity mismatch")
    return manifest, item
