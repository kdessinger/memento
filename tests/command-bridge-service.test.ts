import assert from 'node:assert/strict';
import test from 'node:test';
import { formatCommandBridgeBatch } from '../server/src/services/commandBridgeService.js';

test('formatCommandBridgeBatch returns only command-relevant fields and advances the cursor', () => {
  const result = formatCommandBridgeBatch([
    {
      id: 41,
      limitlessId: 'limitless-41',
      date: '2026-08-04',
      startTime: new Date('2026-08-04T18:00:00.000Z'),
      endTime: new Date('2026-08-04T18:02:00.000Z'),
      title: 'Command',
      summary: 'Hermes, add a task',
      markdownContent: 'Hermes, add a task'
    }
  ]);

  assert.deepEqual(result, {
    nextCursor: 41,
    lifelogs: [{
      id: 41,
      sourceId: 'limitless-41',
      date: '2026-08-04',
      startTime: '2026-08-04T18:00:00.000Z',
      endTime: '2026-08-04T18:02:00.000Z',
      text: 'Hermes, add a task'
    }]
  });
});
