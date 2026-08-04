import { DateTime } from 'luxon';

export interface LimitlessLifeLogInput {
  id: string;
  startTime?: string;
  endTime?: string;
  title?: string;
  summary?: string;
  contents?: unknown[];
  markdown?: string;
  segmentType?: string;
  date?: string;
}

function resolveTimezone(timezone: string | undefined): string {
  if (!timezone) return 'UTC';
  return DateTime.now().setZone(timezone).isValid ? timezone : 'UTC';
}

function determineSegmentType(title: string, summary: string): string {
  const combined = `${title} ${summary}`.toLowerCase();
  if (['meeting', 'call', 'zoom', 'conference'].some((keyword) => combined.includes(keyword))) return 'meeting';
  if (['conversation', 'chat', 'talk', 'discussion'].some((keyword) => combined.includes(keyword))) return 'conversation';
  if (['work', 'coding', 'development', 'project'].some((keyword) => combined.includes(keyword))) return 'work';
  if (['break', 'lunch', 'meal', 'coffee'].some((keyword) => combined.includes(keyword))) return 'break';
  return 'general';
}

export function normalizeLifeLog(log: LimitlessLifeLogInput, fallbackDate: string, timezone?: string) {
  if (!log.id) return null;

  const startDateTime = log.startTime ? DateTime.fromISO(log.startTime, { zone: 'utc' }) : null;
  const endDateTime = log.endTime ? DateTime.fromISO(log.endTime, { zone: 'utc' }) : null;
  const validStart = startDateTime?.isValid ? startDateTime : null;
  const validEnd = endDateTime?.isValid ? endDateTime : null;
  const date = validStart?.setZone(resolveTimezone(timezone)).toISODate() ?? log.date ?? fallbackDate;
  if (!date) return null;

  const title = log.title ?? '';
  const summary = typeof log.summary === 'string' && log.summary.trim()
    ? log.summary.trim()
    : Array.isArray(log.contents) && log.contents.length ? String(log.contents[0]).slice(0, 500) : '';

  return {
    limitlessId: log.id,
    date,
    title,
    summary,
    markdownContent: typeof log.markdown === 'string' ? log.markdown : '',
    segmentType: log.segmentType ?? determineSegmentType(title, summary),
    startTime: validStart?.toJSDate() ?? null,
    endTime: validEnd?.toJSDate() ?? null,
    lastSyncedAt: new Date()
  };
}
