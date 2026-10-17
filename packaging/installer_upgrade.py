"""Full native installer upgrade; retain the previous launcher and command."""
import os
from pathlib import Path
import shutil
import tempfile
import uuid
import zipfile

from mino_release import installation, current, read, lock, atomic, switch, package_info
from mino_update_service import api_compatibility, stop_app, start_app, health
from mino_updates import records, stage


def upgrade(root, manifest, package):
    raw = root.expanduser().absolute()
    if raw.resolve() != raw:
        raise ValueError('Installation path must not traverse links')
    root, conf = installation(raw)
    with lock(root):
        if any(row.get('state') not in {'succeeded', 'failed', 'rolled_back', 'cancelled'} for row in records(root)):
            raise ValueError('Unfinished update preserved; resolve it before installer upgrade')
        doc = read(manifest)
        import platform, sys
        arch = 'arm64' if platform.machine().lower() in {'arm64', 'aarch64'} else 'x64'
        item = next(x for x in doc['items'] if x['os'] == sys.platform and x['arch'] == arch)
        info = package_info(package, item['sha256'])
        if info['component'] != 'workbench' or info['build_id'] != doc['build_id'] or info['payload'] != 'binary':
            raise ValueError('Upgrade requires the exact full Workbench package')
        old = read(current(root) / 'release.json')
        if tuple(map(int, info['version'].split('.'))) < tuple(map(int, old['version'].split('.'))):
            raise ValueError('Installer does not downgrade')
        api_compatibility(conf, info)
        if info['build_id'] == old['build_id']:
            start_app(root, conf)
            health(conf, old['build_id'], old['runtime_id'])
            return {'state': 'unchanged', 'build_id': old['build_id']}
        for folder in ('config', 'launcher'):
            path = root / folder
            for p in [path, *path.rglob('*')]:
                if p.is_symlink() or getattr(p, 'is_junction', lambda: False)() or (p.is_file() and p.stat().st_nlink != 1):
                    raise ValueError('Linked installation files require manual review')
        operation = 'installer-' + uuid.uuid4().hex
        backup = root / 'updates' / operation
        backup.mkdir()
        shutil.copytree(root / 'config', backup / 'config')
        import command_entry
        saved_command = root / 'config/command.json'
        saved = read(saved_command) if saved_command.is_file() else {}
        command = Path(saved['path']) if saved else command_entry.command_file(command_entry.command_dir(), 'workbench')
        command_backup = None
        if command.exists():
            command_entry.check_upgrade(command.parent, 'workbench', root)
            command_backup = backup / 'previous-command'
            shutil.copy2(command, command_backup)
        row = {'kind': 'update', 'operation': operation, 'before': old['build_id'],
               'release': info, 'sha256': item['sha256'], 'package': str(package)}
        stage(root, row)
        prepared = backup / 'launcher-new'
        prepared.mkdir()
        with zipfile.ZipFile(package) as archive:
            for entry in archive.infolist():
                if not entry.filename.startswith('launcher/') or entry.is_dir():
                    continue
                relative = Path(entry.filename).relative_to('launcher')
                if '..' in relative.parts or relative.is_absolute():
                    raise ValueError('Unsafe launcher path')
                dest = prepared / relative
                dest.parent.mkdir(parents=True, exist_ok=True)
                with dest.open('xb') as f:
                    f.write(archive.read(entry))
                dest.chmod((entry.external_attr >> 16) & 0o777 or 0o644)
        journal = root / 'updates' / ('mino-' + operation + '.json')
        row.update(state='installing', backup=str(backup))
        atomic(journal, row)
        moved = False
        try:
            stop_app(root, conf)
            os.rename(root / 'launcher', backup / 'launcher-old')
            moved = True
            os.rename(prepared, root / 'launcher')
            switch(root, info['build_id'])
            row['state'] = 'verifying'; atomic(journal, row)
            start_app(root, conf)
            health(conf, info['build_id'], info['runtime_id'], timeout=60)
            from command_entry import refresh_workbench
            refresh_workbench(root)
            row['state'] = 'succeeded'; atomic(journal, row)
            return {'state': 'succeeded', 'build_id': info['build_id'], 'backup': str(backup)}
        except Exception as exc:
            row.update(state='needs_operator', error=str(exc)); atomic(journal, row)
            try:
                stop_app(root, conf)
                if moved:
                    if (root / 'launcher').exists():
                        os.rename(root / 'launcher', backup / 'launcher-failed')
                    os.rename(backup / 'launcher-old', root / 'launcher')
                switch(root, old['build_id'])
                if command_backup is not None:
                    # A running new app may already have refreshed the command.
                    # Restore only our unchanged generated file; preserve user edits.
                    command_entry.check_upgrade(command.parent, 'workbench', root)
                    shutil.copy2(command, backup / 'failed-command')
                    fd, temporary = tempfile.mkstemp(prefix='.mino-command-', dir=command.parent)
                    with os.fdopen(fd, 'wb') as output:
                        output.write(command_backup.read_bytes())
                    os.chmod(temporary, command_backup.stat().st_mode & 0o777)
                    os.replace(temporary, command)
                    if saved:
                        atomic(saved_command, saved)
                    else:
                        command_entry.remember(root, command, command.read_text(encoding='utf-8'))
                start_app(root, conf)
                health(conf, old['build_id'], old['runtime_id'], timeout=60)
                row['state'] = 'rolled_back'; atomic(journal, row)
            except Exception as recovery:
                row['recovery_error'] = str(recovery); atomic(journal, row)
            raise RuntimeError('Workbench upgrade failed; backups retained at ' + str(backup)) from exc
