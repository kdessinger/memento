import { createHash, createHmac } from 'node:crypto';

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

export interface LimitlessContentNode {
  type?: string;
  content?: string;
  startTime?: string;
  endTime?: string;
  speakerIdentifier?: string | null;
  speakerName?: string | null;
  children?: LimitlessContentNode[];
}

export interface LimitlessLifeLogForCommands {
  id: string;
  startTime?: string;
  endTime?: string;
  isStarred?: boolean;
  contents?: LimitlessContentNode[];
}

export interface WakeCommand {
  id: string;
  auditHash: string;
  lifelogId: string;
  command: string;
  wakeWord: string;
  speakerVerified: boolean;
  starredLifelog: true;
  passphraseVerified: boolean;
  capturedAt: string | null;
}

export interface HermesWebhookRequest {
  body: string;
  signature: string;
}

export const DEFAULT_WAKE_WORD = 'Hermes';
export const MAX_WAKE_WORD_LENGTH = 32;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeWakeWord(value: unknown): string {
  const normalized = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  return /^[A-Za-z][A-Za-z -]*[A-Za-z]$|^[A-Za-z]$/.test(normalized) && normalized.length <= MAX_WAKE_WORD_LENGTH
    ? normalized
    : DEFAULT_WAKE_WORD;
}

function wakePrefix(wakeWord: string): RegExp {
  return new RegExp(`^\\s*(?:hey[\\s,]+)?${escapeRegex(wakeWord)}\\b[\\s,!:.-]*`, 'i');
}

// A wake phrase is frequently transcribed as its own node. Keep collecting the
// same speaker's immediately continuous speech instead of treating the first
// post-wake sentence as the whole command. A meaningful pause still terminates
// the command boundary.
const MAX_FOLLOW_UP_GAP_MS = 60_000;

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function flattenContents(nodes: LimitlessContentNode[] | undefined): LimitlessContentNode[] {
  const flattened: LimitlessContentNode[] = [];
  for (const node of nodes ?? []) {
    if (typeof node.content === 'string' && node.content.trim()) {
      flattened.push(node);
    }
    flattened.push(...flattenContents(node.children));
  }
  return flattened;
}

function gapExceedsLimit(previous: string | undefined, current: string | undefined): boolean {
  if (!previous || !current) return false;
  const priorMs = Date.parse(previous);
  const currentMs = Date.parse(current);
  return Number.isFinite(priorMs) && Number.isFinite(currentMs) && currentMs - priorMs > MAX_FOLLOW_UP_GAP_MS;
}

function cleanCommand(text: string): string {
  return text.replace(/^[\s,!:.-]+/, '').trim();
}

/**
 * Finds explicit wake-word utterances in one Limitless lifelog. Limitless often
 * marks the pendant wearer as Unknown, so a beginning-of-utterance “Hey Hermes”
 * (or “Hermes”) is the direct-address signal. Nodes explicitly attributed to
 * somebody else remain ineligible, and casual mentions in the middle of speech
 * do not trigger the bridge.
 */
export function extractWakeCommands(
  lifelog: LimitlessLifeLogForCommands,
  options: { wakeWord?: string } = {}
): WakeCommand[] {
  // The pendant's physical button is the explicit intent signal. A direct
  // address without a newly starred lifelog is ambient conversation, not a
  // command, even if it begins with the configured wake phrase.
  if (lifelog.isStarred !== true) return [];

  const wakeWord = normalizeWakeWord(options.wakeWord);
  const prefix = wakePrefix(wakeWord);
  const nodes = flattenContents(lifelog.contents);
  const commands: WakeCommand[] = [];

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const content = node?.content?.trim() ?? '';
    if (!content) continue;

    const match = content.match(prefix);
    if (!match) continue;

    const afterWakeWord = cleanCommand(content.slice(match[0].length));
    const speakerVerified = node.speakerIdentifier === 'user';
    if (node.speakerIdentifier === 'other') continue;

    const pieces = [afterWakeWord].filter(Boolean);
    let previousTime = node.startTime;

    for (let followingIndex = index + 1; ; followingIndex += 1) {
      const following = nodes[followingIndex];
      const sameSpeakerClass = speakerVerified
        ? following?.speakerIdentifier === 'user'
        : following?.speakerIdentifier !== 'user' && following?.speakerIdentifier !== 'other';
      const isStructuralContent = /^heading\d*$/i.test(following?.type ?? '');
      if (!following || !sameSpeakerClass || !following.content?.trim() || isStructuralContent) break;
      if (gapExceedsLimit(previousTime, following.startTime)) break;
      pieces.push(following.content.trim());
      previousTime = following.startTime;
    }

    const command = pieces.join(' ').trim();
    if (!command) continue;

    const identity = `${lifelog.id}:${index}:${command.toLowerCase()}`;
    commands.push({
      id: createHash('sha256').update(identity).digest('hex'),
      auditHash: createHash('sha256').update(command).digest('hex'),
      lifelogId: lifelog.id,
      command,
      wakeWord,
      speakerVerified,
      starredLifelog: true,
      // Retained in the signed payload for backwards compatibility. A wake word
      // is the trigger, not a separate spoken passphrase.
      passphraseVerified: false,
      capturedAt: node.startTime ?? lifelog.startTime ?? null
    });
  }

  return commands;
}

/** Builds the exact JSON body that Hermes validates with X-Hub-Signature-256. */
export function buildHermesWebhookRequest(command: WakeCommand, secret: string): HermesWebhookRequest {
  const body = JSON.stringify({
    event_type: 'voice.command.detected',
    source: 'limitless-pendant',
    wake_word: command.wakeWord,
    command_id: command.id,
    command: command.command,
    lifelog_id: command.lifelogId,
    captured_at: command.capturedAt,
    speaker_verified: command.speakerVerified,
    starred_lifelog: command.starredLifelog,
    passphrase_verified: command.passphraseVerified,
    requires_confirmation_for_external_actions: true
  });
  const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  return { body, signature };
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
