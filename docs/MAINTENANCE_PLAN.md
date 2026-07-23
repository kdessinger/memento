# Memento Maintenance Plan

## Goal

Make Kenn's Memento deployment maintainable, reproducible, and safe to extend now that upstream maintenance may be slow or inactive.

## Baseline verified 2026-07-23

- Local repo cloned at `/root/Kenn/projects/memento`.
- Live app works at `http://10.20.30.113:3000/`.
- Live deployment uses Docker container `memento` on Docker1 VMID `113`.
- Current live runtime uses `npm run dev` because production build is broken.

## Phase 0 — Safety baseline

- [ ] Confirm no secrets are committed.
- [ ] Add `.env.example` if missing.
- [ ] Add/verify `.gitignore` excludes `.env`, SQLite DBs, cookies, audio exports, and local data.
- [ ] Document backup/restore for `/root/docker/memento/data/memento.db`.
- [ ] Snapshot live DB before any schema migration or container replacement.

## Phase 1 — Build hygiene

- [ ] Fix root package lock so `npm ci` works.
- [ ] Fix frontend TypeScript errors.
- [ ] Fix server TypeScript errors.
- [ ] Add a build CI script that runs:

```bash
npm ci
npm --prefix frontend ci
npm run build
npm --prefix frontend run lint
```

If nested npm/project structure changes, update this command list accordingly.

## Phase 2 — Dockerization

- [ ] Add first-party `Dockerfile`.
- [ ] Add `docker-compose.yml` or `compose.yaml`.
- [ ] Decide production runtime:
  - Option A: keep ViteExpress production mode after fixing build.
  - Option B: serve built frontend statically from Express.
- [ ] Add unauthenticated health endpoint, e.g. `/api/health`, before auth middleware catches it.
- [ ] Add Docker healthcheck.
- [ ] Test local build and container before deploying to Docker1.

## Phase 3 — Deployment workflow

- [ ] Create deployment script or documented commands for Docker1.
- [ ] Backup DB before redeploy.
- [ ] Build image with deterministic tag.
- [ ] Start replacement container.
- [ ] Verify:

```bash
curl -fsS http://10.20.30.113:3000/
curl -fsS http://10.20.30.113:3000/api/health
```

- [ ] Confirm login still works.
- [ ] Confirm DB path/mount still points to `/root/docker/memento/data`.

## Phase 4 — Hermes integration

- [ ] Add a small local helper script for Memento API login using `/root/.hermes/.env`.
- [ ] Query metadata through API first; query raw content only when Kenn asks.
- [ ] Build a safe daily/weekly digest workflow if Kenn wants it.
- [ ] Consider LifeOS/Notion integration for approved tasks and insights.

## First implementation target

Start with build hygiene. Do not add features until the repo can cleanly install and build.

Initial commands to reproduce current failure:

```bash
cd /root/Kenn/projects/memento
npm install
npm run build
```

Observed frontend failures:

```text
frontend/src/DashboardApp.tsx: unused discoveryApi
frontend/src/DashboardApp.tsx: SectionType mismatch; database not allowed
frontend/src/components/DatabaseView.tsx: unused columnType
frontend/src/components/DiscoveryNotification.tsx: Property data on never
frontend/src/components/SyncDebugPanel.tsx: details/synced/updated/skipped on {}
```
