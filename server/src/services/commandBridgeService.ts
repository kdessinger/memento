export interface CommandBridgeSourceLog {
  id: number;
  limitlessId: string;
  date: string;
  startTime: Date | null;
  endTime: Date | null;
  title: string | null;
  summary: string | null;
  markdownContent: string | null;
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export function formatCommandBridgeBatch(logs: CommandBridgeSourceLog[]) {
  return {
    nextCursor: logs.at(-1)?.id ?? null,
    lifelogs: logs.map((log) => ({
      id: log.id,
      sourceId: log.limitlessId,
      date: log.date,
      startTime: toIso(log.startTime),
      endTime: toIso(log.endTime),
      text: log.markdownContent?.trim() || log.summary?.trim() || log.title?.trim() || ''
    }))
  };
}
