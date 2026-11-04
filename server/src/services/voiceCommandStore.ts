import type Database from 'better-sqlite3';

export type VoiceCommandEventStatus = 'detected' | 'dispatched' | 'failed' | 'ignored_initial_history';

export interface VoiceCommandEventInput {
  userId: number;
  commandId: string;
  auditHash: string;
  lifelogId: string;
  capturedAt: string | null;
  status: VoiceCommandEventStatus;
}

/**
 * Returns true exactly once per user. That first poll is a bootstrap pass and
 * records pre-existing wake commands as history instead of replaying them.
 */
export function beginVoiceCommandBridgePoll(
  db: Database.Database,
  userId: number,
  initializedAt: string
): boolean {
  const existing = db.prepare('SELECT user_id FROM voice_command_bridge_state WHERE user_id = ?').get(userId);
  if (existing) return false;
  db.prepare('INSERT INTO voice_command_bridge_state (user_id, initialized_at) VALUES (?, ?)').run(userId, initializedAt);
  return true;
}

/**
 * Stores only an opaque command ID/hash and source metadata. The plaintext
 * command remains in memory only long enough to sign and deliver the webhook.
 */
export function recordVoiceCommandEvent(
  db: Database.Database,
  input: VoiceCommandEventInput
): 'inserted' | 'existing' {
  const result = db.prepare(`
    INSERT INTO voice_command_events (
      user_id, command_id, audit_hash, lifelog_id, captured_at, status
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, command_id) DO NOTHING
  `).run(
    input.userId,
    input.commandId,
    input.auditHash,
    input.lifelogId,
    input.capturedAt,
    input.status
  );
  return result.changes === 1 ? 'inserted' : 'existing';
}

export function markVoiceCommandEvent(
  db: Database.Database,
  userId: number,
  commandId: string,
  status: Extract<VoiceCommandEventStatus, 'dispatched' | 'failed'>,
  errorMessage: string | null = null
): void {
  db.prepare(`
    UPDATE voice_command_events
    SET status = ?, error_message = ?, attempts = attempts + 1,
        dispatched_at = CASE WHEN ? = 'dispatched' THEN datetime('now') ELSE dispatched_at END,
        updated_at = datetime('now')
    WHERE user_id = ? AND command_id = ?
  `).run(status, errorMessage, status, userId, commandId);
}
