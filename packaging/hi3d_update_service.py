"""Independent helper scheduling and verified macOS application service transitions."""
import json
import os
from pathlib import Path
import plistlib
import subprocess
import sys
import time
import urllib.request
from hi3d_release import read, atomic


def service_record(root, conf):
    record = read(root / "config/service.json")
    path = Path(record["plist"])
    spec = plistlib.loads(path.read_bytes())
    expected = [str(root / "launcher/mino-maintain"), "run", "--root", str(root)]
    if record["label"] != conf["label"] or spec.get("Label") != conf["label"] or spec.get("ProgramArguments") != expected:
        raise ValueError("service registration does not belong to this installation")
    return record


def stop_app(root, conf):
    if sys.platform != "darwin":
        raise ValueError("runtime restart currently requires the macOS service adapter")
    service_record(root, conf)
    label = f"gui/{os.getuid()}/{conf['label']}"
    if subprocess.run(["launchctl", "print", label], capture_output=True).returncode == 0:
        subprocess.run(["launchctl", "bootout", label], check=True, capture_output=True)
    # bootout does not prove the listener has exited; require the port to be free.
    import socket
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        with socket.socket() as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind((conf["host"], conf["port"]))
                return
            except OSError:
                time.sleep(.2)
    raise RuntimeError("Workbench listener did not stop; no forced kill performed")


def start_app(root, conf):
    record = service_record(root, conf)
    target = f"gui/{os.getuid()}/{conf['label']}"
    if subprocess.run(["launchctl", "print", target], capture_output=True).returncode:
        subprocess.run(["launchctl", "bootstrap", f"gui/{os.getuid()}", record["plist"]], check=True, capture_output=True)
    subprocess.run(["launchctl", "kickstart", target], check=True, capture_output=True)


def health(conf, build, runtime_id, timeout=15):
    host = "127.0.0.1" if conf["host"] in {"0.0.0.0", "::"} else conf["host"]
    if ":" in host:
        host = f"[{host}]"
    url = f"http://{host}:{conf['port']}/health"
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    deadline = time.monotonic() + timeout
    while True:
        try:
            with opener.open(url, timeout=2) as response:
                value = json.load(response)
            if (value.get("installation_id") == conf["installation_id"] and value.get("build_id") == build
                    and value.get("runtime_id") == runtime_id and value.get("status") == "ok"):
                return value
        except (OSError, ValueError):
            pass
        if time.monotonic() >= deadline:
            raise RuntimeError("Workbench health/build/runtime/installation verification failed")
        time.sleep(.2)


def register_helper(root, conf, app_plist):
    path = app_plist.with_name(app_plist.stem + ".updater.plist")
    if path.exists() or path.is_symlink():
        raise ValueError("helper service definition already exists")
    label = conf["label"] + ".updater"
    spec = {"Label": label, "ProgramArguments": [str(root / "launcher/mino-maintain"), "update-worker", "--root", str(root)],
            "WorkingDirectory": str(root), "RunAtLoad": False, "KeepAlive": False}
    with path.open("xb") as stream:
        plistlib.dump(spec, stream)
    atomic(root / "config/updater-service.json", {"label": label, "plist": str(path)})


def schedule(root, conf):
    executable = root / "launcher/mino-maintain"
    if not executable.is_file():
        raise ValueError("independent helper executable is missing")
    record = root / "config/updater-service.json"
    if record.exists() and sys.platform == "darwin":
        value = read(record)
        spec = plistlib.loads(Path(value["plist"]).read_bytes())
        expected = [str(executable), "update-worker", "--root", str(root)]
        if value["label"] != conf["label"] + ".updater" or spec.get("ProgramArguments") != expected:
            raise ValueError("helper registration mismatch")
        label = f"gui/{os.getuid()}/{value['label']}"
        if subprocess.run(["launchctl", "print", label], capture_output=True).returncode:
            subprocess.run(["launchctl", "bootstrap", f"gui/{os.getuid()}", value["plist"]], check=True, capture_output=True)
        subprocess.run(["launchctl", "kickstart", label], check=True, capture_output=True)
    else:
        # The stable launcher is outside current and has its own session/process group.
        subprocess.Popen([str(executable), "update-worker", "--root", str(root)], cwd=root,
                         stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                         start_new_session=True, close_fds=True)


def api_compatibility(conf, release, local_verification=False):
    if local_verification:
        if not release.get("dirty"):
            raise ValueError("local-verification is only for explicitly dirty development packages")
        return {"mode": "local-verification", "business_compatibility_verified": False}
    if release.get("dirty"):
        raise ValueError("dirty package requires explicit --local-verification in an isolated installation")
    supported = release.get("tested_nexus_builds", [])
    if not supported or not all(isinstance(value, str) and value for value in supported):
        raise ValueError("release has no tested Nexus build declarations; automatic admission denied")
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(conf["nexus_url"].rstrip("/") + "/sys/server_info", timeout=5) as response:
            value = json.load(response)
    except (OSError, ValueError) as exc:
        raise ValueError("cannot verify configured Nexus build") from exc
    data = value.get("data", value)
    build = data.get("build_id")
    if build not in supported:
        raise ValueError("configured Nexus build is not in this release's tested build pairs")
    return {"mode": "tested-build-pair", "nexus_build_id": build, "workbench_build_id": release["build_id"]}
