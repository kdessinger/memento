import axios from 'axios';
import { DateTime } from 'luxon';
import { rawConnection } from '../db/client.js';
import { fetchLifeLogs, type LimitlessLifeLog } from './syncService.js';
import { getUsersWithCredentials } from './userService.js';
import { processWakeCommandsForPoll, type HermesWebhookSender, type WakeCommandPollResult } from './wakeCommandPoller.js';
import { getWakeBridgePreferences, isWakeBridgePollDue } from './wakeBridgePreferences.js';

let lastWakeCommandPollStartedAt: string | null = null;

export type WakeCommandBridgeSettings =
  | { enabled: false }
  | {
    enabled: true;
    webhookUrl: string;
    webhookSecret: string;
    intervalMinutes: number;
  };

function positiveInterval(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '1', 10);
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 15 ? parsed : 1;
}

export function wakeCommandCronExpression(intervalMinutes: number): string {
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 15) {
    throw new Error('Wake command interval must be an integer between 1 and 15 minutes');
  }
  return `*/${intervalMinutes} * * * *`;
}

/** Reads settings without printing them, so secrets cannot reach application logs. */
export function readWakeCommandBridgeSettings(env: NodeJS.ProcessEnv): WakeCommandBridgeSettings {
  if (env.MEMENTO_WAKE_BRIDGE_ENABLED?.toLowerCase() !== 'true') return { enabled: false };

  const webhookUrl = env.HERMES_WEBHOOK_URL?.trim();
  const webhookSecret = env.HERMES_WAKE_WEBHOOK_SECRET?.trim();
  if (!webhookUrl) throw new Error('MEMENTO_WAKE_BRIDGE_ENABLED requires HERMES_WEBHOOK_URL');
  if (!webhookSecret) throw new Error('MEMENTO_WAKE_BRIDGE_ENABLED requires HERMES_WAKE_WEBHOOK_SECRET');

  const url = new URL(webhookUrl);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('HERMES_WEBHOOK_URL must use http or https');

  return {
    enabled: true,
    webhookUrl,
    webhookSecret,
    intervalMinutes: positiveInterval(env.MEMENTO_WAKE_BRIDGE_INTERVAL_MINUTES)
  };
}

/**
 * A transient failure for one calendar date must not discard a usable response
 * for the other date. Callers receive only date metadata for failures so raw
 * upstream errors and transcript data never reach logs.
 */
export async function fetchWakeCommandLifelogsForDates(
  dates: string[],
  fetchForDate: (date: string) => Promise<LimitlessLifeLog[]>
): Promise<{ lifelogs: LimitlessLifeLog[]; failedDates: string[] }> {
  const results = await Promise.allSettled(dates.map(async (date) => ({
    date,
    lifelogs: await fetchForDate(date)
  })));
  const failedDates: string[] = [];
  const lifelogs: LimitlessLifeLog[] = [];
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    if (result.status === 'fulfilled') {
      lifelogs.push(...result.value.lifelogs);
    } else {
      failedDates.push(dates[index]!);
    }
  }
  return {
    lifelogs: [...new Map(lifelogs.map((lifelog) => [lifelog.id, lifelog])).values()],
    failedDates
  };
}

function makeHermesWebhookSender(webhookUrl: string): HermesWebhookSender {
  return {
    async send(request) {
      await axios.post(webhookUrl, request.body, {
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': request.signature,
          'X-GitHub-Event': 'voice.command.detected',
          'X-GitHub-Delivery': `memento-${Date.now()}-${Math.random().toString(16).slice(2)}`
        },
        maxBodyLength: 16 * 1024,
        maxContentLength: 16 * 1024,
        timeout: 10_000,
        validateStatus: (status) => status >= 200 && status < 300
      });
    }
  };
}

function summarizeError(error: unknown): string {
  if (axios.isAxiosError(error)) return `HTTP ${error.response?.status ?? 'request failed'}`;
  if (error instanceof Error) return error.message.slice(0, 240);
  return 'Unknown wake-command polling error';
}

export interface WakeCommandRuntimeResult {
  enabled: boolean;
  usersChecked: number;
  bootstrapped: number;
  detected: number;
  dispatched: number;
  failed: number;
}

export function wakeCommandFetchDates(timezone: string, now: string = DateTime.utc().toISO() ?? new Date().toISOString()): string[] {
  const localNow = DateTime.fromISO(now, { zone: 'utc' }).setZone(timezone);
  const currentDate = localNow.toISODate();
  const previousDate = localNow.minus({ days: 1 }).toISODate();
  if (!currentDate || !previousDate) throw new Error(`Cannot resolve wake-command dates for timezone: ${timezone}`);
  return [currentDate, previousDate];
}

/**
 * Polls finalized lifelog dates rather than a tiny start-time window. Pendant
 * lifelogs commonly become visible after the original speech timestamp, so a
 * time-window query can permanently miss a recently finalized command.
 */
export async function runWakeCommandPolling(
  env: NodeJS.ProcessEnv = process.env
): Promise<WakeCommandRuntimeResult> {
  const settings = readWakeCommandBridgeSettings(env);
  if (!settings.enabled) {
    return { enabled: false, usersChecked: 0, bootstrapped: 0, detected: 0, dispatched: 0, failed: 0 };
  }

  const preferences = await getWakeBridgePreferences();
  const now = new Date().toISOString();
  if (!preferences.enabled || !isWakeBridgePollDue(lastWakeCommandPollStartedAt, preferences.pollIntervalMinutes, now)) {
    return { enabled: preferences.enabled, usersChecked: 0, bootstrapped: 0, detected: 0, dispatched: 0, failed: 0 };
  }
  lastWakeCommandPollStartedAt = now;

  const sender = makeHermesWebhookSender(settings.webhookUrl);
  const users = await getUsersWithCredentials();
  const result: WakeCommandRuntimeResult = {
    enabled: true,
    usersChecked: users.length,
    bootstrapped: 0,
    detected: 0,
    dispatched: 0,
    failed: 0
  };
  for (const user of users) {
    if (!user.apiKey) continue;
    try {
      const timezone = user.timezone ?? 'UTC';
      const { lifelogs, failedDates } = await fetchWakeCommandLifelogsForDates(
        wakeCommandFetchDates(timezone),
        (date) => fetchLifeLogs(user.apiKey!, {
          date,
          // Limitless omits transcript contents when this list request exceeds
          // 25 records. The bridge needs contents to extract a wake command.
          limit: preferences.maxLifelogsPerPull,
          timezone,
          includeContents: true
        })
      );
      if (failedDates.length === wakeCommandFetchDates(timezone).length) {
        throw new Error('all wake-command lifelog date requests failed');
      }
      if (failedDates.length > 0) {
        result.failed += failedDates.length;
        console.warn(`Wake command poll partially degraded for Memento user ${user.id}; unavailable dates: ${failedDates.join(', ')}`);
      }
      const poll: WakeCommandPollResult = await processWakeCommandsForPoll({
        db: rawConnection,
        userId: user.id,
        lifelogs,
        secret: settings.webhookSecret,
        sender,
        wakeWord: preferences.wakeWord
      });
      result.bootstrapped += poll.bootstrapped ? 1 : 0;
      result.detected += poll.detected;
      result.dispatched += poll.dispatched;
      result.failed += poll.failed;
    } catch (error) {
      result.failed += 1;
      console.error(`Wake command poll failed for Memento user ${user.id}: ${summarizeError(error)}`);
    }
  }

  return result;
}
