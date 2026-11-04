import type Database from 'better-sqlite3';
import {
  buildHermesWebhookRequest,
  extractWakeCommands,
  type HermesWebhookRequest,
  type LimitlessLifeLogForCommands
} from './commandBridgeService.js';
import { beginVoiceCommandBridgePoll, markVoiceCommandEvent, recordVoiceCommandEvent } from './voiceCommandStore.js';

export interface HermesWebhookSender {
  send(request: HermesWebhookRequest): Promise<void>;
}

export interface WakeCommandPollInput {
  db: Database.Database;
  userId: number;
  lifelogs: LimitlessLifeLogForCommands[];
  secret: string;
  sender: HermesWebhookSender;
  wakeWord?: string;
  now?: string;
}

export interface WakeCommandPollResult {
  bootstrapped: boolean;
  detected: number;
  dispatched: number;
  failed: number;
}

function errorSummary(error: unknown): string {
  if (error instanceof Error && error.message) return error.message.slice(0, 240);
  return 'Webhook dispatch failed';
}

/**
 * Handles one transcript batch. The first successful batch is a bootstrap pass:
 * it creates only ignored history records. Subsequent batches dispatch new,
 * identified-user wake commands exactly once.
 */
export async function processWakeCommandsForPoll(input: WakeCommandPollInput): Promise<WakeCommandPollResult> {
  const bootstrapped = beginVoiceCommandBridgePoll(
    input.db,
    input.userId,
    input.now ?? new Date().toISOString()
  );
  const result: WakeCommandPollResult = { bootstrapped, detected: 0, dispatched: 0, failed: 0 };

  for (const lifelog of input.lifelogs) {
    for (const command of extractWakeCommands(lifelog, { wakeWord: input.wakeWord })) {
      const status = bootstrapped ? 'ignored_initial_history' : 'detected';
      const record = recordVoiceCommandEvent(input.db, {
        userId: input.userId,
        commandId: command.id,
        auditHash: command.auditHash,
        lifelogId: command.lifelogId,
        capturedAt: command.capturedAt,
        status
      });
      if (record === 'existing') continue;
      result.detected += 1;
      if (bootstrapped) continue;

      try {
        await input.sender.send(buildHermesWebhookRequest(command, input.secret));
        markVoiceCommandEvent(input.db, input.userId, command.id, 'dispatched');
        result.dispatched += 1;
      } catch (error) {
        markVoiceCommandEvent(input.db, input.userId, command.id, 'failed', errorSummary(error));
        result.failed += 1;
      }
    }
  }

  return result;
}
