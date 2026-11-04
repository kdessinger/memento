import { getSystemSetting, setSystemSetting } from './systemService.js';
import { DEFAULT_WAKE_WORD, normalizeWakeWord } from './commandBridgeService.js';

export const WAKE_BRIDGE_PREFERENCES_KEY = 'wake_bridge_preferences';
export const MIN_WAKE_BRIDGE_INTERVAL_MINUTES = 1;
export const MAX_WAKE_BRIDGE_INTERVAL_MINUTES = 15;
// Limitless returns lifelog metadata but omits transcript contents above this limit.
export const MAX_WAKE_BRIDGE_LIFELOGS_PER_PULL = 25;

export interface WakeBridgePreferences {
  enabled: boolean;
  wakeWord: string;
  pollIntervalMinutes: number;
  maxLifelogsPerPull: number;
}

export const DEFAULT_WAKE_BRIDGE_PREFERENCES: WakeBridgePreferences = {
  enabled: true,
  wakeWord: DEFAULT_WAKE_WORD,
  pollIntervalMinutes: 1,
  maxLifelogsPerPull: MAX_WAKE_BRIDGE_LIFELOGS_PER_PULL
};

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

export function normalizeWakeBridgePreferences(value: unknown): WakeBridgePreferences {
  const source = value && typeof value === 'object' ? value as Partial<WakeBridgePreferences> : {};
  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : DEFAULT_WAKE_BRIDGE_PREFERENCES.enabled,
    wakeWord: normalizeWakeWord(source.wakeWord),
    pollIntervalMinutes: boundedInteger(
      source.pollIntervalMinutes,
      DEFAULT_WAKE_BRIDGE_PREFERENCES.pollIntervalMinutes,
      MIN_WAKE_BRIDGE_INTERVAL_MINUTES,
      MAX_WAKE_BRIDGE_INTERVAL_MINUTES
    ),
    maxLifelogsPerPull: boundedInteger(
      source.maxLifelogsPerPull,
      DEFAULT_WAKE_BRIDGE_PREFERENCES.maxLifelogsPerPull,
      1,
      MAX_WAKE_BRIDGE_LIFELOGS_PER_PULL
    )
  };
}

export async function getWakeBridgePreferences(): Promise<WakeBridgePreferences> {
  const stored = await getSystemSetting(WAKE_BRIDGE_PREFERENCES_KEY);
  if (!stored) return DEFAULT_WAKE_BRIDGE_PREFERENCES;
  try {
    return normalizeWakeBridgePreferences(JSON.parse(stored));
  } catch {
    return DEFAULT_WAKE_BRIDGE_PREFERENCES;
  }
}

export async function saveWakeBridgePreferences(value: unknown): Promise<WakeBridgePreferences> {
  const preferences = normalizeWakeBridgePreferences(value);
  await setSystemSetting(WAKE_BRIDGE_PREFERENCES_KEY, JSON.stringify(preferences));
  return preferences;
}

export function isWakeBridgePollDue(
  lastPollStartedAt: string | null,
  pollIntervalMinutes: number,
  now: string = new Date().toISOString()
): boolean {
  if (!lastPollStartedAt) return true;
  const elapsed = Date.parse(now) - Date.parse(lastPollStartedAt);
  return !Number.isFinite(elapsed) || elapsed >= pollIntervalMinutes * 60_000;
}
