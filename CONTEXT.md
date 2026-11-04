# Memento Context

## Ownership / intent

Kenn asked Hermes to take over development because Salman Mian did a strong job building the app but appears to have moved on to other things. This repository is the local maintenance base for continuing the project for Kenn's personal Limitless/Omi workflow.

Original upstream:

- `https://github.com/smian1/memento`
- Local clone: `/root/Kenn/projects/memento`
- Current upstream HEAD at clone time: `c767ec4 Add mode selector for single and bulk action item creation in CreateActionItemPanel`

No public fork or push has been made yet. Ask Kenn before creating a GitHub fork/repo or pushing changes externally.

## Product summary

Memento turns Limitless AI / Omi pendant data into a self-hosted dashboard:

- Daily insights
- Lifelogs / recordings
- Audio playback and audio segment playback
- Action items
- Decisions
- Ideas
- Questions
- Quotes/highlights/themes
- Speaker profiles
- Database explorer
- Sync from Limitless API

## Live deployment summary

Memento is installed and working on Docker1:

- Web UI: `http://10.20.30.113:3000/`
- Docker VM: `Docker1`, VMID `113`
- Proxmox node: `neptune`
- Container: `memento`
- Persistent DB: `/root/docker/memento/data/memento.db`

Hermes created a dedicated admin account in the app:

- Username: `hermes`
- Password: stored only in `/root/.hermes/.env` as `MEMENTO_PASSWORD`
- URL stored as `MEMENTO_URL`

The `hermes` account is admin but has no `user_configs` row / Limitless API key of its own. It can use admin database routes, but normal user-scoped routes may not show Kenn's synced data unless queried via database explorer or unless a config is added intentionally.

## Current technical problems

Observed on 2026-07-23:

1. `npm ci` fails because the upstream root `package-lock.json` is out of sync with `package.json` / nested frontend dependency requirements.
2. `npm run build` fails at frontend TypeScript checks:
   - unused `discoveryApi` in `frontend/src/DashboardApp.tsx`
   - `SectionType` mismatch involving `database`
   - unused `columnType` in `frontend/src/components/DatabaseView.tsx`
   - `DiscoveryNotification.tsx` treats an inferred `never` as having `.data`
   - `SyncDebugPanel.tsx` reads fields from `{}` without typing
3. Server TypeScript also had errors during earlier inspection, mostly in `dataService.ts` and `discoveryService.ts`.
4. There is no first-party Dockerfile/Compose in upstream.
5. Earlier live deployments used `npm run dev`; the current `memento:dual-signal-20260904-r1` container runs the built server entry point, but broader reproducible-build cleanup remains an active priority.
6. **Dual-signal pendant command gate:** Limitless omits `contents` when a list request exceeds 25 records, so the bridge caps pulls at 25 and exposes an admin-only **Pendant Command Bridge** settings panel for pause/resume, 1–15 minute cadence, and a 1–25 lifelog pull limit. Commands require both a lifelog marked `isStarred: true` by the pendant's physical button and a direct `Hey Hermes`/`Hermes` address. An unstarred wake phrase remains ambient memory; a button-only star produces no command. The signed webhook includes `lifelog_id`, `captured_at`, and `starred_lifelog: true`; Hermes treats the first two as the authoritative retrieval anchor. The verified live deployment is `memento:dual-signal-20260904-r1` (2026-09-04), with persisted defaults enabled, 1-minute cadence, and 25 lifelogs per pull.

## Privacy posture

This app contains Kenn's personal lifelog/recording-derived data. Do not dump transcripts, recordings, API keys, cookies, or raw database content into logs, notes, commits, or final replies. Metadata/counts are safer; content inspection requires explicit permission.

## Desired direction

Phase 1: Stabilize the repo.

- Make clean install reproducible.
- Fix TypeScript build errors.
- Add first-party Dockerfile and compose file.
- Add smoke tests / health endpoint that does not require auth.
- Deploy a production-ish container.

Phase 2: Make it useful for Hermes/Omi workflows.

- Safer admin/API access for Hermes.
- Better summaries and task extraction from lifelogs.
- Optional daily digest into LifeOS/Notion/second brain, with Kenn approval boundaries.
- Improved search and filters over Omi recordings.

Phase 3: Product polish.

- Upgrade UI rough edges.
- Add backup/export tools.
- Add retention/privacy controls.
- Improve speaker management and discovery features.
