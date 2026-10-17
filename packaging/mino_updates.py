"""Fixed-version Workbench update transactions; state survives helper/app restarts."""
import json
from pathlib import Path
import shutil
import tempfile
import time
from mino_release import (legacy_path, TERMINAL, atomic, check_release, current, extract_app, identifier,
                         installation, lock, manifest_item, package_info, read, switch, sync_dir)
from mino_update_service import health, schedule, service_record, start_app, stop_app, api_compatibility


def record_path(root, operation):
    return legacy_path(root / "updates" / ("mino-" + identifier(operation) + ".json"))


def records(root):
    return [read(path) for path in sorted(set((root / "updates").glob("mino-*.json")) | set((root / "updates").glob("hi3d-*.json")))]


def save(root, row, state, **fields):
    row.update(fields)
    row.update(state=state, updated_at=time.time())
    row.setdefault("history", []).append({"state": state, "at": row["updated_at"]})
    atomic(record_path(root, row["operation"]), row)


def stage(root, row):
    info = row["release"]
    target = root / "releases" / info["build_id"]
    if target.exists():
        if read(target / "release.json") != info:
            raise ValueError("build ID already exists with different content")
        if row["kind"] == "update" and read(target / "mino-installed.json")["sha256"] != row["sha256"]:
            raise ValueError("build ID already belongs to another package")
        check_release(target, info)
        return
    package = Path(row["package"])
    if package_info(package, row["sha256"]) != info:
        raise ValueError("persisted package identity changed")
    temporary = Path(tempfile.mkdtemp(prefix=".stage-", dir=root / "releases"))
    if info["payload"] == "static":
        source = root / "releases" / row["before"]
        before = read(source / "release.json")
        check_release(source, before)
        if info["runtime_id"] != before["runtime_id"]:
            raise ValueError("static package requires a different runtime")
        # Copy only the runtime; the new web payload never overwrites the old release.
        for path in source.iterdir():
            if path.name in {"release.json", "mino-installed.json", "hi3d-installed.json"}:
                continue
            if path.is_dir():
                shutil.copytree(path, temporary / path.name,
                                ignore=lambda directory, names: ["web"] if Path(directory) == source / "_internal" else [])
            else:
                shutil.copy2(path, temporary / path.name)
    extract_app(package, temporary)
    atomic(temporary / "release.json", info)
    atomic(temporary / "mino-installed.json", {"sha256": row["sha256"]})
    check_release(temporary, info)
    temporary.rename(target)
    sync_dir(target.parent)


def restore(root, conf, row):
    before = root / "releases" / row["before"]
    info = read(before / "release.json")
    check_release(before, info)
    save(root, row, "restoring")
    if row["restart"]:
        stop_app(root, conf)
    switch(root, row["before"])
    if row["restart"]:
        start_app(root, conf)
    health(conf, row["before"], info["runtime_id"])
    save(root, row, "rolled_back")


def perform(root, conf, row):
    target = row["release"]["build_id"]
    try:
        if current(root).name not in {row["before"], target}:
            save(root, row, "needs_operator", error="current changed outside this operation")
            return
        if row["state"] == "restoring":
            restore(root, conf, row)
            return
        if row["state"] in {"requested", "installing"}:
            save(root, row, "installing")
            stage(root, row)
            save(root, row, "prepared")
        if row["state"] == "prepared":
            evidence = api_compatibility(conf, row["release"], row.get("local_verification", False))
            if evidence != row.get("api_evidence"):
                raise ValueError("Nexus compatibility changed since update admission")
            old = read(root / "releases" / row["before"] / "release.json")
            # Ensure a live instance of THIS installation is being changed.
            health(conf, row["before"], old["runtime_id"], timeout=3)
            save(root, row, "stopping" if row["restart"] else "switching")
        if row["state"] == "stopping":
            stop_app(root, conf)
            save(root, row, "switching")
        if row["state"] == "switching":
            check_release(root / "releases" / target, row["release"])
            switch(root, target)
            save(root, row, "restarting" if row["restart"] else "verifying")
        if row["state"] == "restarting":
            start_app(root, conf)
            save(root, row, "verifying")
        if row["state"] == "verifying":
            evidence = health(conf, target, row["release"]["runtime_id"])
            save(root, row, "succeeded", verification=evidence)
    except Exception as exc:
        row["error"] = str(exc)
        if row["state"] in {"stopping", "switching", "restarting", "verifying", "restoring"}:
            try:
                restore(root, conf, row)
            except Exception as recovery:
                save(root, row, "needs_operator", recovery_error=str(recovery))
        else:
            save(root, row, "failed")


def worker(root, conf):
    with lock(root):
        pending = [row for row in records(root) if row["state"] not in TERMINAL]
        if len(pending) > 1:
            raise ValueError("multiple unfinished operations; operator must reconcile")
        if pending:
            perform(root, conf, pending[0])


def dispatch(args):
    root, conf = installation(args.root)
    command = args.command
    if command == "operation":
        row = read(record_path(root, args.operation))
        print(json.dumps(row, ensure_ascii=False))
        return
    if command == "update-worker":
        worker(root, conf)
        return
    if command == "check-update":
        manifest, item = manifest_item(args.manifest)
        print(json.dumps({"current": current(root).name, "target": manifest["build_id"], "item": item}))
        return
    if command == "recover":
        with lock(root):
            row = read(record_path(root, args.operation))
            if row["state"] in TERMINAL:
                print(json.dumps(row)); return
        schedule(root, conf)
        print(json.dumps(row)); return
    if command == "cancel-update":
        with lock(root):
            row = read(record_path(root, args.operation))
            if row["state"] == "requested":
                save(root, row, "cancelled")
            elif row["state"] not in TERMINAL:
                raise ValueError("installation already started; query/recover the original operation")
        print(json.dumps(row)); return
    path = record_path(root, args.operation)
    if path.exists():
        existing = read(path)
        same = (command == "update" and existing["kind"] == "update" and read(args.manifest) == existing.get("manifest")) or (command == "rollback" and existing["kind"] == "rollback" and args.build == existing["release"]["build_id"])
        if not same or bool(existing.get("local_verification", False)) != args.local_verification:
            raise ValueError("operation already has different parameters")
        print(json.dumps(existing, ensure_ascii=False))
        return
    with lock(root):
        path = record_path(root, args.operation)
        if command == "update":
            manifest, item = manifest_item(args.manifest)
            package = args.package.resolve(strict=True)
            if package.stat().st_size != item["bytes"]:
                raise ValueError("package size mismatch")
            info = package_info(package, item["sha256"])
            if any(info.get(key) != manifest.get(key) for key in ("build_id", "source_commit", "component", "version")):
                raise ValueError("package does not match pinned manifest")
            params = {"kind": "update", "release": info, "sha256": item["sha256"], "manifest": manifest}
        else:
            build = identifier(args.build)
            info = read(root / "releases" / build / "release.json")
            check_release(root / "releases" / build, info)
            params = {"kind": "rollback", "release": info}
        if path.exists():
            row = read(path)
            if any(row.get(key) != value for key, value in params.items()):
                raise ValueError("operation already has different parameters")
            print(json.dumps(row)); return
        if any(row["state"] not in TERMINAL or row["state"] == "needs_operator" for row in records(root)):
            raise ValueError("unfinished operation exists; recover it before another update")
        old = read(current(root) / "release.json")
        check_release(current(root), old)
        restart = old["runtime_id"] != info["runtime_id"]
        if restart:
            service_record(root, conf)  # fail before any mutation when runtime restart is unsupported
        evidence = api_compatibility(conf, info, args.local_verification)
        row = {**params, "operation": args.operation, "before": current(root).name, "restart": restart,
               "local_verification": args.local_verification, "api_evidence": evidence}
        if command == "update":
            saved = root / "updates" / ("mino-" + args.operation + ".zip")
            with saved.open("xb") as out, package.open("rb") as inp:
                shutil.copyfileobj(inp, out)
                out.flush()
                import os
                os.fsync(out.fileno())
            row["package"] = str(saved)
        save(root, row, "requested")
    if not args.defer:
        schedule(root, conf)
    print(json.dumps(row, ensure_ascii=False))
