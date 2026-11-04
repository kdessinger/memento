import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { runMigrations } from '../server/src/db/init.js';
import type { HermesWebhookRequest, LimitlessLifeLogForCommands } from '../server/src/services/commandBridgeService.js';
import { processWakeCommandsForPoll } from '../server/src/services/wakeCommandPoller.js';

function makeLog(id: string, command: string): LimitlessLifeLogForCommands {
  return {
    id,
    startTime: '2026-09-01T12:00:00.000Z',
    isStarred: true,
    contents: [{
      type: 'blockquote',
      content: `Hermes, ${command}`,
      speakerIdentifier: 'user',
      startTime: '2026-09-01T12:00:01.000Z'
    }]
  };
}

test('processWakeCommandsForPoll observes first-poll history and dispatches later commands once', async () => {
  const db = new Database(':memory:');
  runMigrations(db);
  db.prepare("INSERT INTO users (username, password_hash) VALUES ('wake-user', 'hash')").run();
  const user = db.prepare("SELECT id FROM users WHERE username = 'wake-user'").get() as { id: number };
  const sent: HermesWebhookRequest[] = [];
  const sender = { send: async (request: HermesWebhookRequest) => { sent.push(request); } };

  const bootstrap = await processWakeCommandsForPoll({
    db,
    userId: user.id,
    lifelogs: [makeLog('old-log', 'summarize yesterday.')],
    secret: 'bridge-secret',
    sender,
    now: '2026-09-01T12:05:00.000Z'
  });
  assert.deepEqual(bootstrap, { bootstrapped: true, detected: 1, dispatched: 0, failed: 0 });
  assert.equal(sent.length, 0);

  const next = await processWakeCommandsForPoll({
    db,
    userId: user.id,
    lifelogs: [makeLog('old-log', 'summarize yesterday.'), makeLog('new-log', 'show pending approvals.')],
    secret: 'bridge-secret',
    sender,
    now: '2026-09-01T12:06:00.000Z'
  });
  assert.deepEqual(next, { bootstrapped: false, detected: 1, dispatched: 1, failed: 0 });
  assert.equal(sent.length, 1);
  assert.equal(JSON.parse(sent[0]!.body).command, 'show pending approvals.');

  const statuses = db.prepare('SELECT status FROM voice_command_events ORDER BY lifelog_id').all() as Array<{ status: string }>;
  assert.deepEqual(statuses, [{ status: 'dispatched' }, { status: 'ignored_initial_history' }]);
});

test('processWakeCommandsForPoll records dispatch failure without preserving the command text', async () => {
  const db = new Database(':memory:');
  runMigrations(db);
  db.prepare("INSERT INTO users (username, password_hash) VALUES ('wake-user', 'hash')").run();
  const user = db.prepare("SELECT id FROM users WHERE username = 'wake-user'").get() as { id: number };
  const sender = { send: async () => { throw new Error('gateway unavailable'); } };

  await processWakeCommandsForPoll({
    db,
    userId: user.id,
    lifelogs: [],
    secret: 'bridge-secret',
    sender,
    now: '2026-09-01T12:05:00.000Z'
  });
  const result = await processWakeCommandsForPoll({
    db,
    userId: user.id,
    lifelogs: [makeLog('new-log', 'turn off the lights.')],
    secret: 'bridge-secret',
    sender,
    now: '2026-09-01T12:06:00.000Z'
  });

  assert.deepEqual(result, { bootstrapped: false, detected: 1, dispatched: 0, failed: 1 });
  const event = db.prepare('SELECT status, error_message FROM voice_command_events').get() as { status: string; error_message: string };
  assert.deepEqual(event, { status: 'failed', error_message: 'gateway unavailable' });
  const columns = db.prepare("PRAGMA table_info('voice_command_events')").all() as Array<{ name: string }>;
  assert.equal(columns.some((column) => column.name === 'command'), false);
});

test('processWakeCommandsForPoll does not create an event for an unstarred wake phrase', async () => {
  const db = new Database(':memory:');
  runMigrations(db);
  db.prepare("INSERT INTO users (username, password_hash) VALUES ('wake-user', 'hash')").run();
  const user = db.prepare("SELECT id FROM users WHERE username = 'wake-user'").get() as { id: number };
  const sent: HermesWebhookRequest[] = [];
  const sender = { send: async (request: HermesWebhookRequest) => { sent.push(request); } };

  await processWakeCommandsForPoll({
    db,
    userId: user.id,
    lifelogs: [],
    secret: 'bridge-secret',
    sender,
    now: '2026-09-01T12:05:00.000Z'
  });
  const result = await processWakeCommandsForPoll({
    db,
    userId: user.id,
    lifelogs: [{ ...makeLog('ambient-log', 'do not dispatch.'), isStarred: false }],
    secret: 'bridge-secret',
    sender,
    now: '2026-09-01T12:06:00.000Z'
  });

  assert.deepEqual(result, { bootstrapped: false, detected: 0, dispatched: 0, failed: 0 });
  assert.equal(sent.length, 0);
  const eventCount = db.prepare('SELECT count(*) AS count FROM voice_command_events').get() as { count: number };
  assert.equal(eventCount.count, 0);
});
