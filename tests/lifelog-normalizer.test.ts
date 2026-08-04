import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeLifeLog } from '../server/src/services/lifelogNormalizer.js';

test('normalizeLifeLog assigns a UTC-near-midnight lifelog to the configured New York date', () => {
  const result = normalizeLifeLog(
    {
      id: 'log-1',
      startTime: '2026-08-04T02:30:00.000Z',
      endTime: '2026-08-04T03:00:00.000Z',
      title: 'Test log',
      summary: 'A safe test fixture'
    },
    '2026-08-04',
    'America/New_York'
  );

  assert.ok(result);
  assert.equal(result.date, '2026-08-03');
});

test('normalizeLifeLog falls back to UTC for an invalid configured timezone', () => {
  const result = normalizeLifeLog(
    {
      id: 'log-2',
      startTime: '2026-08-04T02:30:00.000Z',
      title: 'Test log'
    },
    '2026-08-04',
    'not/a-real-timezone'
  );

  assert.ok(result);
  assert.equal(result.date, '2026-08-04');
});
