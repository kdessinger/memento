import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fetchWakeCommandLifelogsForDates,
  readWakeCommandBridgeSettings,
  wakeCommandCronExpression,
  wakeCommandFetchDates
} from '../server/src/services/wakeCommandRuntime.js';

test('readWakeCommandBridgeSettings stays disabled unless explicitly enabled', () => {
  assert.deepEqual(readWakeCommandBridgeSettings({}), { enabled: false });
  assert.deepEqual(readWakeCommandBridgeSettings({ MEMENTO_WAKE_BRIDGE_ENABLED: 'false' }), { enabled: false });
});

test('wake command cron expression stays within the configured minute cadence', () => {
  assert.equal(wakeCommandCronExpression(1), '*/1 * * * *');
  assert.equal(wakeCommandCronExpression(15), '*/15 * * * *');
  assert.throws(() => wakeCommandCronExpression(0), /between 1 and 15/);
});

test('wake command fetch dates include current and previous local calendar dates for delayed finalization', () => {
  assert.deepEqual(
    wakeCommandFetchDates('America/New_York', '2026-09-02T02:00:00.000Z'),
    ['2026-09-01', '2026-08-31']
  );
  assert.deepEqual(
    wakeCommandFetchDates('America/New_York', '2026-09-02T16:00:00.000Z'),
    ['2026-09-02', '2026-09-01']
  );
});

test('wake command polling retains successful date results when another date request fails', async () => {
  const result = await fetchWakeCommandLifelogsForDates(
    ['2026-09-02', '2026-09-01'],
    async (date) => {
      if (date === '2026-09-01') throw new Error('upstream gateway timeout');
      return [{ id: 'current-day-log', contents: [] }];
    }
  );

  assert.deepEqual(result.lifelogs, [{ id: 'current-day-log', contents: [] }]);
  assert.deepEqual(result.failedDates, ['2026-09-01']);
});

test('readWakeCommandBridgeSettings validates the signed local webhook configuration', () => {
  assert.throws(
    () => readWakeCommandBridgeSettings({ MEMENTO_WAKE_BRIDGE_ENABLED: 'true' }),
    /HERMES_WEBHOOK_URL/
  );

  assert.deepEqual(
    readWakeCommandBridgeSettings({
      MEMENTO_WAKE_BRIDGE_ENABLED: 'true',
      HERMES_WEBHOOK_URL: 'http://10.20.30.21:8644/webhooks/limitless-wake',
      HERMES_WAKE_WEBHOOK_SECRET: 'test-secret',
      MEMENTO_WAKE_BRIDGE_INTERVAL_MINUTES: '2'
    }),
    {
      enabled: true,
      webhookUrl: 'http://10.20.30.21:8644/webhooks/limitless-wake',
      webhookSecret: 'test-secret',
      intervalMinutes: 2
    }
  );
});
