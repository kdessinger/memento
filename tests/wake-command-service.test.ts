import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  buildHermesWebhookRequest,
  extractWakeCommands,
  type LimitlessLifeLogForCommands
} from '../server/src/services/commandBridgeService.js';

const baseLog: LimitlessLifeLogForCommands = {
  id: 'lifelog-42',
  startTime: '2026-09-01T12:00:00.000Z',
  isStarred: true,
  contents: []
};

test('extractWakeCommands accepts a user utterance that begins with Hermes', () => {
  const commands = extractWakeCommands({
    ...baseLog,
    contents: [{
      type: 'blockquote',
      content: 'Hermes, check the weather tomorrow.',
      speakerIdentifier: 'user',
      startTime: '2026-09-01T12:00:01.000Z'
    }]
  });

  assert.equal(commands.length, 1);
  assert.equal(commands[0]?.command, 'check the weather tomorrow.');
  assert.equal(commands[0]?.lifelogId, 'lifelog-42');
  assert.equal(commands[0]?.speakerVerified, true);
  assert.equal(commands[0]?.passphraseVerified, false);
});

test('extractWakeCommands accepts an unattributed direct “Hey Hermes” command', () => {
  const commands = extractWakeCommands({
    ...baseLog,
    contents: [{
      type: 'blockquote',
      content: 'Hey Hermes, confirm the bridge is working.',
      speakerName: 'Unknown',
      startTime: '2026-09-01T12:00:01.000Z'
    }]
  });

  assert.equal(commands.length, 1);
  assert.equal(commands[0]?.command, 'confirm the bridge is working.');
  assert.equal(commands[0]?.speakerVerified, false);
  assert.equal(commands[0]?.passphraseVerified, false);
});

test('extractWakeCommands accepts an unattributed direct “Hey, Hermes” command', () => {
  const commands = extractWakeCommands({
    ...baseLog,
    contents: [{
      type: 'blockquote',
      content: 'Hey, Hermes. Confirm the bridge is working.',
      speakerName: 'Unknown',
      startTime: '2026-09-01T12:00:01.000Z'
    }]
  });

  assert.equal(commands.length, 1);
  assert.equal(commands[0]?.command, 'Confirm the bridge is working.');
  assert.equal(commands[0]?.speakerVerified, false);
  assert.equal(commands[0]?.passphraseVerified, false);
});

test('extractWakeCommands ignores a casual mention and a wake phrase from somebody else', () => {
  const commands = extractWakeCommands({
    ...baseLog,
    contents: [
      {
        type: 'blockquote',
        content: 'Can you ask Hermes about the weather?',
        speakerIdentifier: 'user'
      },
      {
        type: 'blockquote',
        content: 'Hey Hermes, open the garage.',
        speakerIdentifier: 'other'
      }
    ]
  });

  assert.deepEqual(commands, []);
});

test('extractWakeCommands ignores a wake phrase unless the pendant button starred its lifelog', () => {
  const commands = extractWakeCommands({
    ...baseLog,
    isStarred: false,
    contents: [{
      type: 'blockquote',
      content: 'Hey Hermes, this should remain ambient memory.',
      speakerIdentifier: 'user',
      startTime: '2026-09-01T12:00:01.000Z'
    }]
  });

  assert.deepEqual(commands, []);
});

test('extractWakeCommands accepts a direct wake turn in the middle of a starred lifelog', () => {
  const commands = extractWakeCommands({
    ...baseLog,
    contents: [
      {
        type: 'blockquote',
        content: 'I was talking with someone about a project plan.',
        speakerIdentifier: 'user',
        startTime: '2026-09-01T12:00:01.000Z'
      },
      {
        type: 'blockquote',
        content: 'Hey Hermes, draft the follow-up email.',
        speakerIdentifier: 'user',
        startTime: '2026-09-01T12:02:01.000Z'
      }
    ]
  });

  assert.equal(commands.length, 1);
  assert.equal(commands[0]?.command, 'draft the follow-up email.');
  assert.equal(commands[0]?.capturedAt, '2026-09-01T12:02:01.000Z');
});

test('extractWakeCommands preserves a contiguous multi-utterance command after a standalone wake phrase', () => {
  const commands = extractWakeCommands({
    ...baseLog,
    contents: [
      {
        type: 'blockquote',
        content: 'Hey Hermes',
        speakerName: 'Unknown',
        startTime: '2026-09-01T12:00:01.000Z'
      },
      {
        type: 'blockquote',
        content: 'I need you to do me a favor.',
        speakerName: 'Unknown',
        startTime: '2026-09-01T12:00:04.000Z'
      },
      {
        type: 'blockquote',
        content: 'Review my meeting notes from this morning.',
        speakerName: 'Unknown',
        startTime: '2026-09-01T12:00:09.000Z'
      },
      {
        type: 'blockquote',
        content: 'Then create the initial project draft and send me a Slack message when it is done.',
        speakerName: 'Unknown',
        startTime: '2026-09-01T12:00:14.000Z'
      }
    ]
  });

  assert.equal(commands.length, 1);
  assert.equal(
    commands[0]?.command,
    'I need you to do me a favor. Review my meeting notes from this morning. Then create the initial project draft and send me a Slack message when it is done.'
  );
});

test('extractWakeCommands accepts a configured wake word only at the start of an identified utterance', () => {
  const commands = extractWakeCommands({
    ...baseLog,
    contents: [{
      type: 'blockquote',
      content: 'Atlas, check the bridge settings.',
      speakerIdentifier: 'user',
      startTime: '2026-09-03T20:00:01.000Z'
    }]
  }, { wakeWord: 'Atlas' });

  assert.equal(commands.length, 1);
  assert.equal(commands[0]?.wakeWord, 'Atlas');
  assert.equal(commands[0]?.command, 'check the bridge settings.');
});

test('buildHermesWebhookRequest signs the exact command payload without putting it in the audit identity', () => {
  const candidate = extractWakeCommands({
    ...baseLog,
    contents: [{
      type: 'blockquote',
      content: 'Hermes, summarize today.',
      speakerIdentifier: 'user',
      startTime: '2026-09-01T12:00:01.000Z'
    }]
  })[0]!;

  const request = buildHermesWebhookRequest(candidate, 'test-secret');
  const payload = JSON.parse(request.body);

  assert.equal(payload.event_type, 'voice.command.detected');
  assert.equal(payload.source, 'limitless-pendant');
  assert.equal(payload.command, 'summarize today.');
  assert.equal(payload.speaker_verified, true);
  assert.equal(payload.starred_lifelog, true);
  assert.equal(payload.passphrase_verified, false);
  assert.equal(payload.command_id, candidate.id);
  assert.match(candidate.auditHash, /^[a-f0-9]{64}$/);
  assert.notEqual(candidate.auditHash, candidate.command);
  assert.equal(
    request.signature,
    `sha256=${createHmac('sha256', 'test-secret').update(request.body).digest('hex')}`
  );
});
