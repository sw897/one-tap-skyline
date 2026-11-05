import hashlib
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import game_data as data


class SnapshotTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name).resolve()
        self.db, self.photos = self.root/'db', self.root/'photos'
        for p in [self.db, self.photos]:
            p.mkdir(); (p/'.game-id').write_text('skyline\n')
        self.today = data.day_start(1_800_000_000_000)
        self.now = self.today + 3_600_000
        with data.connection(self.db/'game.sqlite', writable=True) as db:
            db.execute('CREATE TABLE skyline_migrations(name TEXT PRIMARY KEY,sha256 TEXT NOT NULL)')
            for file in sorted((Path(__file__).resolve().parents[1]/'drizzle').glob('*.sql')):
                db.executescript(file.read_text())
                db.execute('INSERT INTO skyline_migrations VALUES(?,?)',(file.stem,hashlib.sha256(file.read_bytes()).hexdigest()))
            db.execute("INSERT INTO game_clock VALUES('daily',?,'source-token')",(self.today,))
            db.execute("INSERT INTO cities(id,epoch,display_name,ruleset_id) VALUES('public','source-entry','城市天际线','p3-b60-v1')")
        self.snapshot = self.root/'snapshot'
        data.make_backup(self.db,self.photos,self.snapshot,'skyline')

    def tearDown(self):
        self.temp.cleanup()

    def test_manifest_and_identity_integrity(self):
        self.assertEqual(data.verify_backup(self.snapshot,'skyline')['sourceDay'],self.today)
        with self.assertRaisesRegex(ValueError,'snapshot_game_or_version_mismatch'):
            data.verify_backup(self.snapshot,'another-game')

    def test_tampered_backup_cannot_be_used(self):
        with (self.snapshot/'database.sqlite').open('ab') as file:
            file.write(b'changed')
        with self.assertRaisesRegex(ValueError,'snapshot_file_hash_mismatch'):
            data.prepare_restore(self.snapshot,self.root/'prepared','skyline',self.now+data.DAY)

    def test_same_day_and_midnight_window_are_rejected(self):
        with self.assertRaisesRegex(ValueError,'restore_requires_later_game_day'):
            data.prepare_restore(self.snapshot,self.root/'same','skyline',self.now)
        with self.assertRaisesRegex(ValueError,'restore_too_close_to_midnight'):
            data.prepare_restore(self.snapshot,self.root/'near','skyline',self.today+2*data.DAY-1000)

    def test_later_day_changes_clock_entry_but_not_original_backup(self):
        original=data.digest(self.snapshot/'database.sqlite')
        result=data.prepare_restore(self.snapshot,self.root/'prepared','skyline',self.now+data.DAY)
        self.assertEqual(result['targetDay'],self.today+data.DAY)
        with data.connection(self.root/'prepared/database.sqlite') as db:
            self.assertNotEqual(db.execute('SELECT epoch FROM cities').fetchone()[0],'source-entry')
        self.assertEqual(data.digest(self.snapshot/'database.sqlite'),original)

    def test_nonempty_target_and_wrong_mount_identity_are_rejected(self):
        with data.connection(self.db/'game.sqlite', writable=True) as db:
            db.execute("INSERT INTO players VALUES('id','public','hash',?,?)",(self.now,self.now+data.DAY))
        with self.assertRaisesRegex(ValueError,'target_game_not_empty'):
            data.restore_backup(self.db,self.photos,self.snapshot,self.root/'work','skyline',self.now+data.DAY)
        (self.photos/'.game-id').write_text('other\n')
        with self.assertRaisesRegex(ValueError,'storage_identity_mismatch'):
            data.restore_backup(self.db,self.photos,self.snapshot,self.root/'wrong','skyline',self.now+data.DAY)

    def test_restore_keeps_identity_and_saves_before_restore_snapshot(self):
        result=data.restore_backup(self.db,self.photos,self.snapshot,self.root/'work','skyline',self.now+data.DAY)
        self.assertTrue(Path(result['beforeRestoreBackup']).is_dir())
        self.assertEqual((self.db/'.game-id').read_text(),'skyline\n')
        self.assertEqual((self.photos/'.game-id').read_text(),'skyline\n')
        with data.connection(self.db/'game.sqlite') as db:
            self.assertEqual(db.execute('SELECT day_start FROM game_clock').fetchone()[0],self.today+data.DAY)

    def test_failed_install_restores_before_snapshot_and_allows_service_restart(self):
        with data.connection(self.db/'game.sqlite') as db:
            original=list(db.iterdump())
        real=data.install_payload
        calls=[]
        def fail_once(*args):
            calls.append(True)
            if len(calls)==1:
                raise OSError('injected installation failure')
            return real(*args)
        state={}
        with patch.object(data,'install_payload',side_effect=fail_once):
            with self.assertRaisesRegex(OSError,'injected installation failure'):
                data.restore_backup(self.db,self.photos,self.snapshot,self.root/'failure','skyline',self.now+data.DAY,state=state)
        self.assertTrue(state['safe'])
        with data.connection(self.db/'game.sqlite') as db:
            self.assertEqual(list(db.iterdump()),original)


if __name__=='__main__':
    unittest.main()
