import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { runMigrations } from '../server/src/db/init.js';
import {
  beginVoiceCommandBridgePoll,
  recordVoiceCommandEvent
} from '../server/src/services/voiceCommandStore.js';

test('voice command bridge bootstraps existing history without making it dispatchable', () => {
  const db = new Database(':memory:');
  runMigrations(db);
  db.prepare("INSERT INTO users (username, password_hash) VALUES ('wake-user', 'hash')").run();
  const user = db.prepare("SELECT id FROM users WHERE username = 'wake-user'").get() as { id: number };

  assert.equal(beginVoiceCommandBridgePoll(db, user.id, '2026-09-01T12:00:00.000Z'), true);
  assert.equal(beginVoiceCommandBridgePoll(db, user.id, '2026-09-01T12:01:00.000Z'), false);

  const stored = recordVoiceCommandEvent(db, {
    userId: user.id,
    commandId: 'command-1',
    auditHash: 'a'.repeat(64),
    lifelogId: 'lifelog-1',
    capturedAt: '2026-09-01T12:00:00.000Z',
    status: 'ignored_initial_history'
  });

  assert.equal(stored, 'inserted');
  const columns = db.prepare("PRAGMA table_info('voice_command_events')").all() as Array<{ name: string }>;
  assert.equal(columns.some((column) => column.name === 'command'), false);
  const event = db.prepare('SELECT command_id, status FROM voice_command_events').get() as { command_id: string; status: string };
  assert.deepEqual(event, { command_id: 'command-1', status: 'ignored_initial_history' });
});

test('voice command bridge deduplicates a repeated transcript command', () => {
  const db = new Database(':memory:');
  runMigrations(db);
  db.prepare("INSERT INTO users (username, password_hash) VALUES ('wake-user', 'hash')").run();
  const user = db.prepare("SELECT id FROM users WHERE username = 'wake-user'").get() as { id: number };
  const event = {
    userId: user.id,
    commandId: 'command-repeat',
    auditHash: 'b'.repeat(64),
    lifelogId: 'lifelog-2',
    capturedAt: '2026-09-01T12:02:00.000Z',
    status: 'detected' as const
  };

  assert.equal(recordVoiceCommandEvent(db, event), 'inserted');
  assert.equal(recordVoiceCommandEvent(db, event), 'existing');
  const count = db.prepare('SELECT COUNT(*) AS count FROM voice_command_events').get() as { count: number };
  assert.equal(count.count, 1);
});
