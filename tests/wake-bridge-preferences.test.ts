import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_WAKE_BRIDGE_PREFERENCES,
  normalizeWakeBridgePreferences,
  isWakeBridgePollDue
} from '../server/src/services/wakeBridgePreferences.js';

test('wake bridge preferences use safe, transcript-capable defaults', () => {
  assert.deepEqual(DEFAULT_WAKE_BRIDGE_PREFERENCES, {
    enabled: true,
    wakeWord: 'Hermes',
    pollIntervalMinutes: 1,
    maxLifelogsPerPull: 25
  });
  assert.deepEqual(normalizeWakeBridgePreferences(null), DEFAULT_WAKE_BRIDGE_PREFERENCES);
});

test('wake bridge preferences reject values outside their safe bounds', () => {
  assert.deepEqual(
    normalizeWakeBridgePreferences({ enabled: false, pollIntervalMinutes: 0, maxLifelogsPerPull: 1000 }),
    { enabled: false, wakeWord: 'Hermes', pollIntervalMinutes: 1, maxLifelogsPerPull: 25 }
  );
  assert.deepEqual(
    normalizeWakeBridgePreferences({ enabled: true, pollIntervalMinutes: 15, maxLifelogsPerPull: 5 }),
    { enabled: true, wakeWord: 'Hermes', pollIntervalMinutes: 15, maxLifelogsPerPull: 5 }
  );
});

test('wake bridge preferences normalize a configurable wake word without allowing unsafe punctuation', () => {
  assert.deepEqual(
    normalizeWakeBridgePreferences({ wakeWord: '  Hey  Atlas  ' }),
    { enabled: true, wakeWord: 'Hey Atlas', pollIntervalMinutes: 1, maxLifelogsPerPull: 25 }
  );
  assert.deepEqual(
    normalizeWakeBridgePreferences({ wakeWord: '<script>' }),
    DEFAULT_WAKE_BRIDGE_PREFERENCES
  );
});

test('wake bridge polling honors the saved interval without delaying the first poll', () => {
  assert.equal(isWakeBridgePollDue(null, 5, '2026-09-03T19:00:00.000Z'), true);
  assert.equal(isWakeBridgePollDue('2026-09-03T18:56:00.000Z', 5, '2026-09-03T19:00:00.000Z'), false);
  assert.equal(isWakeBridgePollDue('2026-09-03T18:55:00.000Z', 5, '2026-09-03T19:00:00.000Z'), true);
});
