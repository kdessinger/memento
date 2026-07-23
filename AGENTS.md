# Memento — Agent Guide

This repo is Kenn's maintained local working copy of Salman Mian's Memento app.

## Project purpose

Memento is a self-hosted web app for browsing and organizing Limitless AI / Omi pendant Daily Insights, lifelogs, action items, decisions, ideas, questions, audio segments, speakers, and related SQLite-backed data.

## Current deployment

Live homelab deployment:

- URL: `http://10.20.30.113:3000/`
- Sun Proxmox cluster VM: `Docker1`
- VMID: `113`
- Proxmox node: `neptune`
- Container name: `memento`
- Image: `memento:latest`
- Runtime command: `npm run dev`
- Persistent data: `/root/docker/memento/data`
- SQLite database: `/root/docker/memento/data/memento.db`

Access path when SSH to the Docker VM fails:

```bash
ssh mars 'pvesh get /cluster/resources --type vm --output-format json'
ssh mars 'pvesh get /nodes/neptune/qemu/113/agent/network-get-interfaces --output-format json'
ssh mars "pvesh create /nodes/neptune/qemu/113/agent/exec --command /bin/sh --command -lc --command 'docker ps' --output-format json"
ssh mars 'pvesh get /nodes/neptune/qemu/113/agent/exec-status --pid <pid> --output-format json'
```

## Rules for agents

- Do not commit secrets, Limitless API keys, cookies, exported lifelog/audio content, or raw database dumps.
- Treat lifelogs and recordings as private user data. Query content only when Kenn explicitly asks.
- Prefer app/API access over raw SQLite reads when practical.
- Do not replace the live container until changes have been tested locally and Kenn approves deployment.
- Preserve upstream attribution. Salman wrote the original app; this is Kenn's maintained local continuation.
- For new code, favor small commits and keep `npm run build` moving toward green.

## Known current state

The app works in the homelab, but upstream build hygiene is not clean yet:

- `npm ci` fails against the upstream lockfile because package/package-lock are out of sync.
- `npm run build` fails TypeScript checks.
- The live Docker deployment therefore uses the documented dev launch path, `npm run dev`, inside a container.

First priority is to make the repo reproducible and production-buildable before large feature work.

## Useful commands

Local development:

```bash
npm install
npm run dev
```

Build check:

```bash
npm run build
```

Frontend-only checks:

```bash
npm --prefix frontend run build
npm --prefix frontend run lint
```

Server-only check:

```bash
npm run build:server
```

Live API login uses the `hermes` admin account stored in `/root/.hermes/.env`:

```bash
source /root/.hermes/.env
curl -sS -c /tmp/memento.cookies \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$MEMENTO_USERNAME\",\"password\":\"$MEMENTO_PASSWORD\"}" \
  "$MEMENTO_URL/api/auth/login"
```
