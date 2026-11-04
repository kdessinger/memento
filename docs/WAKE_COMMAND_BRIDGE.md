# Memento Wake Command Bridge

## What it does

When explicitly enabled, Memento polls newly finalized Limitless Pendant lifelog transcripts on a bounded cadence. A command requires **both**: (1) a physical pendant-button press that Limitless records as `isStarred: true` on the lifelog, and (2) a direct-address utterance that begins with `Hey Hermes` or `Hermes`. The wake utterance may appear anywhere inside that starred lifelog; it does not need to be the first utterance or start a new lifelog. Limitless frequently reports the pendant wearer as `Unknown`, so the physical star plus the wake phrase—not voice attribution or an additional spoken passphrase—is the trigger.

For a match, it:

1. identifies the wake phrase and records its source lifelog ID plus exact capture time;
2. keeps contiguous compatible speech after a standalone wake phrase as a fallback command preview;
3. creates a metadata-only audit/dedupe record in Memento SQLite;
4. POSTs a signed `voice.command.detected` event to a Hermes webhook; and
5. lets Hermes retrieve and read the source lifelog before acting, under its normal tool and approval rules.

Hermes must still require explicit scoped approval for external, destructive, financial, physical-world, or otherwise guarded actions. A wake word is not blanket authorization.

## Limitless constraint

Limitless exposes finalized lifelog transcripts through its REST API. It does **not** provide a raw, low-latency audio stream or a wake-word webhook. This is therefore a polling bridge, not a real-time microphone listener.

The default enabled cadence is one minute. Each poll rescans the current and previous local calendar day, with command IDs preventing repeat delivery. This deliberately handles transcripts that finalize after their original speech timestamp.

## Safety and privacy behavior

- The bridge is **disabled by default**.
- It accepts only `isStarred: true` lifelogs. Within those, it accepts nodes marked `speakerIdentifier: "user"` and unattributed/`Unknown` nodes that begin with the wake phrase. Nodes explicitly attributed to someone else are rejected.
- You may be in the middle of a normal conversation: press the pendant button, then begin a new direct utterance with `Hey Hermes`. Earlier unrelated speech in the same lifelog is not included in the command.
- A button-only star records no command; a wake phrase in an unstarred lifelog is ambient memory and records no command event.
- For an unattributed match, the payload truthfully reports `speaker_verified: false`. The `passphrase_verified` compatibility field remains `false`; no passphrase is used.
- It only accepts the wake word at the beginning of an utterance; “ask Hermes…” does not trigger it.
- The first poll is a bootstrap pass: existing matches are marked `ignored_initial_history` and never replayed.
- Memento stores command ID, SHA-256 audit hash, source lifelog ID, timestamp, status, and failure metadata. It never stores the plaintext command in SQLite.
- The plaintext command exists in memory only long enough to build the signed Hermes webhook payload.
- Duplicate source commands are blocked by a unique `(user_id, command_id)` key.

## In-app settings

Administrators can open **User menu → Pendant Command Bridge**. The panel provides:

- a pause/resume switch for transcript polling;
- a configurable wake word (letters, spaces, and hyphens; up to 32 characters);
- a polling cadence from 1 to 15 minutes; and
- a 1–25 lifelog pull limit, capped because larger Limitless list responses omit transcript content.

These preferences persist in Memento’s server-side settings store and take effect on the next scheduled check. The signed Hermes route URL and HMAC secret deliberately remain Docker-only configuration, not browser-editable fields.

## Required Memento environment

Set these in the **Docker1 Memento container environment**, not in the Git repository or browser settings:

```dotenv
MEMENTO_WAKE_BRIDGE_ENABLED=true
HERMES_WEBHOOK_URL=http://<hermes-host>:8644/webhooks/limitless-wake
HERMES_WAKE_WEBHOOK_SECRET=<route-specific-random-secret>
```

`MEMENTO_WAKE_BRIDGE_ENABLED` is the server-side safety gate; it and the signed webhook credentials remain container-only configuration. Once the bridge is enabled, an administrator can use **User menu → Pendant Command Bridge** inside Memento to pause/resume polling, set a 1–15 minute cadence, and select 1–25 lifelogs per pull. The service checks preferences every minute, so saved changes apply without a container restart. Limitless omits transcript contents above 25 lifelogs, so the UI intentionally will not permit a larger pull.

The webhook URL must be an `http` or `https` URL. Do not put the secret in documentation, shell history, Git, or Memento’s SQLite database.

## Required Hermes route

Before enabling Memento, create a named Hermes webhook route with a route-specific HMAC secret. The route should tell Hermes that the payload is a voice-derived command, preserve the command as untrusted input, and retain normal approval requirements.

The Hermes listener must be reachable only from Docker1/the trusted LAN, protected by HMAC, and configured with the minimum tool scope needed. Do not give webhook-originated agent runs broad terminal or destructive privileges by default.

## Deployment order

1. Build and test this Memento code locally.
2. Back up `/root/docker/memento/data/memento.db` on Docker1.
3. Create and test the Hermes signed route without exposing its secret.
4. Add the required environment variables to Memento’s runtime configuration.
5. Deploy the tested Memento image/container replacement.
6. Confirm startup logs show `Wake command bridge enabled; checking in-app polling preferences every minute.` Then open **User menu → Pendant Command Bridge** and confirm the desired cadence and pull limit.
7. The first successful poll bootstraps history and sends no command. Verify an `ignored_initial_history` record appears only as metadata.
8. Say a harmless new command such as `Hermes, what time is it?` and verify exactly one signed event reaches Hermes.
9. Verify the audit row is `dispatched`; inspect only metadata unless Kenn explicitly requests transcript/command content.

## Rollback

Disable the bridge by removing `MEMENTO_WAKE_BRIDGE_ENABLED=true` and restart the Memento container. The application otherwise continues normal sync behavior. The audit tables are additive and do not alter existing lifelogs.
