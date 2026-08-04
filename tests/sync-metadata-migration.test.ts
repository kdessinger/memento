import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { runMigrations } from '../server/src/db/init.js';

test('runMigrations consolidates sync metadata to the newest record and makes user_id unique', () => {
  const db = new Database(':memory:');
  runMigrations(db);
  // Recreate the legacy state from before the unique index existed.
  db.exec('DROP INDEX idx_sync_metadata_user');
  db.prepare("INSERT INTO users (username, password_hash) VALUES ('test-user', 'hash')").run();
  const user = db.prepare("SELECT id FROM users WHERE username = 'test-user'").get() as { id: number };

  db.prepare("INSERT INTO sync_metadata (user_id, last_sync_at, last_sync_status) VALUES (?, ?, 'error')").run(user.id, '2026-08-01T10:00:00.000Z');
  db.prepare("INSERT INTO sync_metadata (user_id, last_sync_at, last_sync_status) VALUES (?, ?, 'success')").run(user.id, '2026-08-01T11:00:00.000Z');

  runMigrations(db);

  const rows = db.prepare('SELECT last_sync_status FROM sync_metadata WHERE user_id = ?').all(user.id) as Array<{ last_sync_status: string }>;
  assert.deepEqual(rows, [{ last_sync_status: 'success' }]);
  assert.throws(
    () => db.prepare("INSERT INTO sync_metadata (user_id, last_sync_status) VALUES (?, 'idle')").run(user.id),
    /UNIQUE constraint failed/
  );
});
