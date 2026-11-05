"""Private Docker game snapshots and next-day city restoration. No public HTTP endpoint."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import sqlite3
import subprocess
import time
import uuid
from contextlib import contextmanager

from gateway import Gateway, atomic_text, run

DAY = 86_400_000
SHIFT = 8 * 3_600_000
BUSINESS = ['players', 'runs', 'buildings', 'photo_assets', 'building_facades', 'city_events', 'rate_limits']


def day_start(now):
    return (now + SHIFT) // DAY * DAY - SHIFT


def digest(file):
    h = hashlib.sha256()
    with file.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def private_path(file, *storage):
    if not file.is_absolute():
        raise ValueError('absolute_private_path_required')
    file = file.resolve()
    repo = Path(__file__).resolve().parent.parent
    for root in (repo, *storage):
        root = root.resolve()
        if file == root or root in file.parents or file in root.parents:
            raise ValueError('snapshot_must_be_outside_repository_and_storage')
    return file


def identity(db, photos, game):
    for root in [db, photos]:
        if root.is_symlink() or (root / '.game-id').is_symlink():
            raise ValueError('storage_symlink_rejected')
        if (root / '.game-id').read_text() != game + '\n':
            raise ValueError('storage_identity_mismatch')


def files(root):
    result = {}
    for file in sorted(root.rglob('*')):
        if file.is_symlink():
            raise ValueError('snapshot_symlink_rejected')
        if file.is_file():
            result[file.relative_to(root).as_posix()] = {'sha256': digest(file), 'bytes': file.stat().st_size}
    return result


@contextmanager
def connection(file, writable=False):
    db = sqlite3.connect(file) if writable else sqlite3.connect(file.resolve().as_uri() + '?mode=ro', uri=True)
    try:
        yield db
        if writable:
            db.commit()
    except Exception:
        if writable:
            db.rollback()
        raise
    finally:
        db.close()


def check_database(db):
    if db.execute('PRAGMA integrity_check').fetchall() != [('ok',)] or db.execute('PRAGMA foreign_key_check').fetchall():
        raise ValueError('database_integrity_failed')


def counts(db):
    names = [row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
    return {name: db.execute('SELECT COUNT(*) FROM "' + name.replace('"', '""') + '"').fetchone()[0] for name in names}


def migrations(db):
    return db.execute('SELECT name,sha256 FROM skyline_migrations ORDER BY name').fetchall()


def make_backup(db_root, photo_root, output, game):
    """Caller must stop the one game process first, freezing DB and photo IO together."""
    identity(db_root, photo_root, game)
    output = private_path(output, db_root, photo_root)
    output.mkdir(parents=True, mode=0o700, exist_ok=False)
    with connection(db_root / 'game.sqlite') as source, connection(output / 'database.sqlite', writable=True) as target:
        source.backup(target)
        target.execute('PRAGMA journal_mode=DELETE')
        check_database(target)
        table_counts = counts(target)
        source_day = target.execute("SELECT day_start FROM game_clock WHERE id='daily'").fetchone()[0]
    # Check before copytree: do not follow private image symlinks outside the game volume.
    files(photo_root)
    shutil.copytree(photo_root, output / 'photos')
    shutil.copyfile(db_root / '.game-id', output / 'db.game-id')
    manifest = {'version': 1, 'gameId': game, 'capturedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                'sourceDay': source_day, 'counts': table_counts, 'files': files(output)}
    atomic_text(output / 'manifest.json', json.dumps(manifest, indent=2), 0o600)
    for file in output.rglob('*'):
        file.chmod(0o700 if file.is_dir() else 0o600)
    return manifest


def verify_backup(snapshot, game):
    snapshot = private_path(snapshot)
    manifest = json.loads((snapshot / 'manifest.json').read_text())
    if manifest['version'] != 1 or manifest['gameId'] != game:
        raise ValueError('snapshot_game_or_version_mismatch')
    for key, expected in manifest['files'].items():
        relative = PurePosixPath(key)
        if relative.is_absolute() or '..' in relative.parts or '\\' in key or ':' in key:
            raise ValueError('invalid_snapshot_file')
        file = snapshot.joinpath(*relative.parts)
        if any(p.is_symlink() for p in [file, *file.parents]) or not file.is_file():
            raise ValueError('snapshot_file_missing_or_symlink')
        if file.stat().st_size != expected['bytes'] or digest(file) != expected['sha256']:
            raise ValueError('snapshot_file_hash_mismatch')
    for key in ['database.sqlite', 'db.game-id', 'photos/.game-id']:
        if key not in manifest['files']:
            raise ValueError('snapshot_required_file_missing')
    if (snapshot / 'db.game-id').read_text() != game + '\n' or (snapshot / 'photos/.game-id').read_text() != game + '\n':
        raise ValueError('snapshot_identity_mismatch')
    with connection(snapshot / 'database.sqlite') as db:
        check_database(db)
        if counts(db) != manifest['counts'] or db.execute("SELECT day_start FROM game_clock WHERE id='daily'").fetchone()[0] != manifest['sourceDay']:
            raise ValueError('snapshot_database_manifest_mismatch')
    return manifest


def prepare_restore(snapshot, output, game, now):
    manifest = verify_backup(snapshot, game)
    today = day_start(now)
    if today <= manifest['sourceDay']:
        raise ValueError('restore_requires_later_game_day')
    if today + DAY - now < 120_000:
        raise ValueError('restore_too_close_to_midnight')
    output = private_path(output)
    output.mkdir(parents=True, mode=0o700, exist_ok=False)
    shutil.copyfile(snapshot / 'database.sqlite', output / 'database.sqlite')
    (output / 'photos').mkdir(mode=0o700)
    shutil.copyfile(snapshot / 'photos/.game-id', output / 'photos/.game-id')
    with connection(output / 'database.sqlite', writable=True) as db:
        db.execute('PRAGMA foreign_keys=ON')
        captured = int(datetime.datetime.fromisoformat(manifest['capturedAt']).timestamp() * 1000)
        # Preserve saved works/history, but do not resurrect drafts, uploads or expired/revoked images.
        db.execute("UPDATE building_facades SET asset_id=NULL,version=version+1 WHERE asset_id IN (SELECT id FROM photo_assets WHERE status!='active' OR expires_at<=?)", (captured,))
        db.execute("DELETE FROM photo_assets WHERE status!='active' OR expires_at<=?", (captured,))
        assets = db.execute('SELECT id,image_key,thumbnail_key FROM photo_assets').fetchall()
        for photo_id, image_key, thumbnail_key in assets:
            uuid.UUID(photo_id)
            for old, name in [(image_key, 'image.jpg'), (thumbnail_key, 'thumbnail.jpg')]:
                if old not in manifest['files'] and 'photos/' + old not in manifest['files']:
                    raise ValueError('active_photo_missing_from_snapshot')
                source_key = 'photos/' + old
                if source_key not in manifest['files']:
                    raise ValueError('active_photo_missing_from_snapshot')
                relative = 'photos/' + str(today) + '/' + photo_id + '/' + name
                target = output / 'photos' / relative
                target.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
                shutil.copyfile(snapshot / source_key, target)
                atomic_text(Path(str(target) + '.metadata.json'), json.dumps({'createdAt': now, 'httpMetadata': {'contentType': 'image/jpeg', 'cacheControl': 'no-store'}}), 0o600)
            db.execute('UPDATE photo_assets SET created_at=?,expires_at=?,image_key=?,thumbnail_key=? WHERE id=?',
                       (now, today + DAY, 'photos/' + str(today) + '/' + photo_id + '/image.jpg',
                        'photos/' + str(today) + '/' + photo_id + '/thumbnail.jpg', photo_id))
        db.execute("UPDATE runs SET status='cancelled' WHERE status='active'")
        # Historical anonymous credentials/runs remain expired; clients must rescan for a new identity.
        db.execute('UPDATE players SET expires_at=MIN(expires_at,?)', (today,))
        for (city,) in db.execute('SELECT id FROM cities').fetchall():
            db.execute('UPDATE cities SET epoch=?,revision=revision+1 WHERE id=?', (str(uuid.uuid4()), city))
        db.execute("UPDATE game_clock SET day_start=?,reset_token=? WHERE id='daily'", (today, str(uuid.uuid4())))
        db.commit()
        check_database(db)
        restored_counts = counts(db)
    return {'sourceDay': manifest['sourceDay'], 'targetDay': today, 'counts': restored_counts,
            'restoredPhotos': len(assets), 'oldCredentialsRestored': False}


def install_payload(db_root, photo_root, database, photos):
    """Only call with the game stopped. Preserve the volume identity files."""
    token = str(uuid.uuid4())
    staged = photo_root / ('.restore-' + token)
    retired = photo_root / ('.previous-' + token)
    temporary_db = db_root / ('.restore-' + token + '.sqlite')
    owner = (db_root / 'game.sqlite').stat()
    shutil.copytree(photos / 'photos', staged) if (photos / 'photos').exists() else staged.mkdir(mode=0o700)
    shutil.copyfile(database, temporary_db)
    temporary_db.chmod(0o600)
    if hasattr(os, 'chown'):
        os.chown(temporary_db, owner.st_uid, owner.st_gid)
        for file in [staged, *staged.rglob('*')]:
            os.chown(file, owner.st_uid, owner.st_gid)
            file.chmod(0o700 if file.is_dir() else 0o600)
    live = photo_root / 'photos'
    try:
        if live.exists():
            live.rename(retired)
        staged.rename(live)
        for suffix in ['-wal', '-shm', '-journal']:
            (db_root / ('game.sqlite' + suffix)).unlink(missing_ok=True)
        temporary_db.replace(db_root / 'game.sqlite')
    except Exception:
        if retired.exists():
            if live.exists():
                shutil.rmtree(live)
            retired.rename(live)
        raise
    finally:
        for file in [staged, retired]:
            if file.exists():
                assert file.parent.resolve() == photo_root.resolve() and file.name.startswith(('.restore-', '.previous-'))
                shutil.rmtree(file)
        temporary_db.unlink(missing_ok=True)


def restore_backup(db_root, photo_root, snapshot, work, game, now, replace=False, state=None):
    state = state if state is not None else {}
    state['safe'] = True
    identity(db_root, photo_root, game)
    snapshot = private_path(snapshot, db_root, photo_root)
    verify_backup(snapshot, game)
    work = private_path(work, db_root, photo_root, snapshot)
    work.mkdir(parents=True, mode=0o700, exist_ok=False)
    with connection(db_root / 'game.sqlite') as target, connection(snapshot / 'database.sqlite') as source:
        check_database(target)
        if migrations(target) != migrations(source):
            raise ValueError('snapshot_schema_version_mismatch')
        current = counts(target)
        if not replace and any(current.get(name, 0) for name in BUSINESS):
            raise ValueError('target_game_not_empty_use_explicit_replace')
    prepared = work / 'prepared'
    result = prepare_restore(snapshot, prepared, game, now)
    make_backup(db_root, photo_root, work / 'before-restore', game)
    state['safe'] = False
    try:
        install_payload(db_root, photo_root, prepared / 'database.sqlite', prepared / 'photos')
        identity(db_root, photo_root, game)
        with connection(db_root / 'game.sqlite') as db:
            check_database(db)
    except Exception:
        before = work / 'before-restore'
        install_payload(db_root, photo_root, before / 'database.sqlite', before / 'photos')
        with connection(db_root / 'game.sqlite') as db:
            check_database(db)
        state['safe'] = True
        raise
    state['safe'] = True
    return {**result, 'beforeRestoreBackup': str(work / 'before-restore')}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--file', action='append', required=True)
    parser.add_argument('--env-file', required=True)
    parser.add_argument('--service', default='game', help='Target game service in this Compose project')
    commands = parser.add_subparsers(dest='action', required=True)
    backup = commands.add_parser('backup')
    backup.add_argument('--output', required=True, type=Path)
    restore = commands.add_parser('restore')
    restore.add_argument('--snapshot', required=True, type=Path)
    restore.add_argument('--work', required=True, type=Path)
    restore.add_argument('--replace-current', action='store_true')
    args = parser.parse_args()
    gateway = Gateway(args.file, args.env_file, args.service)
    original = gateway.managed.read_text()
    ids = run(gateway.compose + ['ps', '-q', gateway.game_service]).split()
    if len(ids) != 1:
        raise ValueError('one_running_game_required')
    container = json.loads(run(['docker', 'inspect', ids[0]]))[0]
    mounts = {m['Destination']:Path(m['Source']) for m in container['Mounts'] if m['Type'] == 'volume'}
    db_root, photo_root = mounts['/data/db'], mounts['/data/photos']
    identity(db_root, photo_root, gateway.game_id)
    if args.action == 'backup':
        private_path(args.output, db_root, photo_root)
    else:
        verify_backup(private_path(args.snapshot, db_root, photo_root), gateway.game_id)
        private_path(args.work, db_root, photo_root, args.snapshot)
    gateway.apply('admission')
    stopped = False
    safe_to_start = True
    result = None
    try:
        for _ in range(132):
            now = int(time.time() * 1000)
            with connection(db_root / 'game.sqlite') as db:
                active = db.execute("SELECT COUNT(*) FROM runs WHERE status='active' AND expires_at>?", (now,)).fetchone()[0]
                uploads = db.execute("SELECT COUNT(*) FROM photo_assets WHERE status='uploading' AND expires_at>?", (now,)).fetchone()[0]
            if not active and not uploads:
                break
            time.sleep(5)
        else:
            raise ValueError('game_not_drained')
        gateway.apply('maintenance')
        run(gateway.compose + ['stop', '--timeout', '45', gateway.game_service])
        stopped = True
        state = json.loads(run(['docker', 'inspect', ids[0]]))[0]['State']
        if state['Running'] or state['ExitCode'] != 0:
            safe_to_start = False
            raise ValueError('game_stop_failed')
        if args.action == 'backup':
            result = make_backup(db_root, photo_root, args.output, gateway.game_id)
            result = {'snapshot':str(args.output), **result}
        else:
            restore_state = {'safe': True}
            try:
                result = restore_backup(db_root, photo_root, args.snapshot, args.work, gateway.game_id, int(time.time()*1000), args.replace_current, restore_state)
            finally:
                safe_to_start = restore_state['safe']
            if day_start(int(time.time()*1000)) != result['targetDay']:
                safe_to_start = False
                raise ValueError('day_changed_keep_maintenance')
    finally:
        if stopped and safe_to_start:
            run(['docker', 'start', ids[0]])
            for _ in range(90):
                probe = subprocess.run(['docker', 'exec', ids[0], 'node', '-e',
                    "fetch('http://127.0.0.1:8080/health/ready').then(r=>r.json()).then(x=>{if(!x.ready||x.cleanupPending)process.exit(1);console.log(JSON.stringify(x))})"],
                    text=True, capture_output=True)
                if probe.returncode == 0:
                    health = json.loads(probe.stdout)
                    if args.action == 'restore' and result is not None and health['dayStart'] != result['targetDay']:
                        raise ValueError('day_changed_keep_maintenance')
                    break
                time.sleep(1)
            else:
                raise ValueError('game_not_ready_keep_maintenance')
        if safe_to_start:
            gateway.validate(original)
            atomic_text(gateway.managed, original)
            gateway.reload()
            gateway.verify()
            gateway.remember_good()
    print(json.dumps({'action':args.action, **result}))


if __name__ == '__main__':
    main()
