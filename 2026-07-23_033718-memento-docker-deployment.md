# Memento Docker Deployment Plan

> **For Hermes:** Planning mode only. Do not execute deployment until Kenn provides the correct Docker server connection details and explicitly says to proceed.

**Goal:** Deploy `https://github.com/smian1/memento` as a persistent Dockerized web application on Kenn's intended Docker server.

**Architecture:** Memento is a Node.js 18+/Express/Vite app using SQLite via `better-sqlite3`. It exposes HTTP on port `3000` and stores persistent state in `./data/memento.db`. Because the upstream repo currently fails its normal production TypeScript build, the safest first deployment is a containerized version of the app's documented launch path: `npm run dev`, with `/app/data` mounted as persistent storage.

**Tech Stack:** Docker, Node.js 22 slim image, npm, Express, Vite, SQLite, optional reverse proxy/Cloudflare Tunnel/Nginx Proxy Manager after container verification.

---

## Current Context / Findings

- Repo: `https://github.com/smian1/memento`
- App purpose: self-hosted dashboard for Limitless AI Daily Insights.
- Runtime requirement from README: Node.js 18+ and npm.
- App port: `3000` by default (`PORT` env var supported).
- Persistent database path: `data/memento.db` relative to process working directory.
- First-run setup happens in the browser:
  - create admin account
  - enter Limitless API key
  - set timezone
- Upstream repo does not ship Docker assets.
- Upstream build issues observed during inspection:
  - `npm run build` fails frontend TypeScript checks.
  - direct frontend `vite build` succeeds when run from `frontend/`.
  - server `tsc -p server/tsconfig.json` fails type checks.
- Practical deployment implication:
  - do not rely on `npm run build && npm start` until upstream TypeScript errors are fixed.
  - use `npm run dev` in Docker for initial working deployment.

## Docker Server Access Status

Known attempts:

- `ssh mars` works but lands on the Proxmox host at `10.20.30.4`; Docker is not installed there.
- Mars Proxmox containers found:
  - `101 homeassistant` at `10.20.30.173` — has Docker, but this appears to be the Home Assistant container host, not the general app server.
  - `103 pihole` at `10.20.30.104` — not a Docker host.
  - `111 cloudflared` at DHCP `10.20.30.226` — no Docker observed.
- `10.20.30.104` has ports 22/80/443 open, but SSH keys available to Hermes do not authenticate.
- Other reachable hosts with open services found from Mars neighbor/port checks include `.21`, `.9`, `.100`, but available SSH keys do not authenticate.

## Info Needed from Kenn Before Execution

Provide one of these:

1. **SSH access to the real Docker host**
   - hostname/IP
   - username
   - which key Hermes should use, or add Hermes' existing public key to that host
   - whether Docker Compose v2 is available (`docker compose`) or only legacy `docker-compose`

2. **Portainer access path**
   - URL
   - target environment name
   - permission to use an API token or login flow

3. **Confirmation to use the Home Assistant LXC Docker daemon**
   - only if Kenn explicitly wants this app hosted there
   - not recommended as the default, because it mixes a general app into the HA service container host

Also decide exposure:

- Internal only: `http://<docker-host>:3000`
- Reverse-proxied LAN hostname: e.g. `http://memento.home` or existing proxy convention
- Cloudflare Tunnel/public route: only if Kenn explicitly wants external access

## Proposed Deployment Files

Create a deployment directory on the Docker server:

```text
/opt/memento/
├── Dockerfile
├── docker-compose.yml
└── repo/                 # cloned upstream source, or source files copied directly
```

Alternative simpler layout:

```text
/opt/memento/
├── Dockerfile
├── docker-compose.yml
├── package.json
├── package-lock.json
├── frontend/
├── server/
└── data/                 # bind-mounted persistent SQLite storage
```

## Dockerfile

Use this initial image because it follows the upstream documented launch path and handles `better-sqlite3` native dependencies:

```Dockerfile
FROM node:22-bookworm-slim

WORKDIR /app

# better-sqlite3 is a native module; keep build tools available for npm ci/rebuild.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY frontend/package*.json ./frontend/
RUN npm ci

COPY . .

ENV NODE_ENV=development
ENV PORT=3000
EXPOSE 3000
VOLUME ["/app/data"]

CMD ["npm", "run", "dev"]
```

## docker-compose.yml

Use bind-mounted data for easy backup/inspection:

```yaml
services:
  memento:
    build: .
    container_name: memento
    restart: unless-stopped
    environment:
      PORT: "3000"
      NODE_ENV: development
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
```

If port `3000` is occupied, change the host side only:

```yaml
ports:
  - "3010:3000"
```

## Execution Plan After Access Is Available

### Task 1: Confirm target Docker server

**Objective:** Make sure deployment goes to the intended Docker host, not the Proxmox host or Home Assistant LXC by accident.

**Commands:**

```bash
ssh <docker-host> 'hostname; docker --version; docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Ports}}" | head -30'
```

**Expected:** Docker command succeeds and existing services match Kenn's intended app server.

### Task 2: Check port availability

**Objective:** Avoid colliding with an existing service.

**Commands:**

```bash
ssh <docker-host> 'ss -ltnp | grep -E ":3000|:3010" || true'
```

**Expected:** Preferred host port is unused, or choose an alternate host port.

### Task 3: Create deployment directory

**Objective:** Keep Memento isolated and maintainable.

**Commands:**

```bash
ssh <docker-host> 'mkdir -p /opt/memento/data && chmod 700 /opt/memento/data'
```

### Task 4: Clone or update upstream repo

**Objective:** Put the app source on the server.

**Commands:**

```bash
ssh <docker-host> 'cd /opt/memento && if [ -d repo/.git ]; then git -C repo pull --ff-only; else git clone https://github.com/smian1/memento repo; fi'
```

### Task 5: Add Dockerfile and Compose file

**Objective:** Add deployment wrapper without changing upstream app logic.

**Files:**

- `/opt/memento/repo/Dockerfile`
- `/opt/memento/repo/docker-compose.yml`

Use the Dockerfile and Compose content from this plan.

### Task 6: Build image

**Objective:** Prove dependencies compile on the target Docker server.

**Commands:**

```bash
ssh <docker-host> 'cd /opt/memento/repo && docker compose build memento'
```

If the server only has legacy Compose:

```bash
ssh <docker-host> 'cd /opt/memento/repo && docker-compose build memento'
```

**Expected:** Image builds successfully. Warnings about npm audit vulnerabilities may appear; record them but do not run `npm audit fix --force` during deployment.

### Task 7: Start container

**Objective:** Launch Memento with persistent storage.

**Commands:**

```bash
ssh <docker-host> 'cd /opt/memento/repo && docker compose up -d memento'
```

Legacy fallback:

```bash
ssh <docker-host> 'cd /opt/memento/repo && docker-compose up -d memento'
```

### Task 8: Verify container health

**Objective:** Confirm the server answers before exposing it.

**Commands:**

```bash
ssh <docker-host> 'docker ps --filter name=memento --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"'
ssh <docker-host> 'docker logs --tail=80 memento'
ssh <docker-host> 'curl -fsS http://127.0.0.1:3000/api/health'
```

**Expected:**

```json
{"status":"ok"}
```

### Task 9: Verify from Hermes/LAN

**Objective:** Confirm it is reachable off-host.

**Commands from Hermes host:**

```bash
curl -fsS http://<docker-host-ip>:3000/api/health
```

**Expected:**

```json
{"status":"ok"}
```

### Task 10: Configure reverse proxy or tunnel, if requested

**Objective:** Put Memento behind the normal service access pattern.

Options:

- Nginx Proxy Manager / local proxy: route `memento.<domain>` to `<docker-host-ip>:3000`.
- Cloudflare Tunnel: add ingress hostname to the existing tunnel config, then restart cloudflared.
- Internal only: skip this task.

Do not expose publicly until Kenn confirms the desired hostname and access model.

### Task 11: First-run setup

**Objective:** Let Kenn create the admin account and add his Limitless API key without exposing secrets in chat/logs.

Steps:

1. Open `http://<host>:<port>` or the configured hostname.
2. Create admin user.
3. Paste Limitless API key in the browser UI.
4. Set timezone, likely `America/New_York` unless Kenn wants otherwise.
5. Trigger sync from the UI.

## Validation Checklist

- `docker ps` shows `memento` as `Up`.
- `curl http://127.0.0.1:3000/api/health` from Docker host returns `{"status":"ok"}`.
- `curl http://<docker-host-ip>:3000/api/health` from Hermes returns `{"status":"ok"}`.
- Browser loads first-run setup.
- After setup, `/opt/memento/repo/data/memento.db` or bound `./data/memento.db` exists.
- Container restart preserves setup/data:

```bash
docker restart memento
curl -fsS http://127.0.0.1:3000/api/health
ls -lh /opt/memento/repo/data/memento.db
```

## Risks / Tradeoffs

- **Upstream TypeScript build is broken.** A true production image requires fixing frontend/server TS errors or changing build scripts. Initial deployment should use `npm run dev` because that is the upstream README path.
- **Development server in container.** This is acceptable for a first private homelab deployment but not ideal for public exposure. If exposed externally, put it behind HTTPS and consider adding auth/rate limiting at the proxy layer.
- **Limitless dependency.** Memento will appear empty if Kenn's Limitless Daily Insights are unavailable or disabled.
- **Secrets.** Limitless API key should be entered through the app UI, not pasted into shell commands or durable notes.
- **Data backups.** SQLite database should be included in Docker server backups. Path should be confirmed after deployment.

## Future Hardening Plan

After basic deployment works:

1. Fork or patch upstream TypeScript errors.
2. Replace `npm run dev` with a production server start.
3. Use a multi-stage Docker image.
4. Drop build tools from runtime image.
5. Add a healthcheck to Compose:

```yaml
healthcheck:
  test: ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]
  interval: 30s
  timeout: 5s
  retries: 5
```

6. Add backup job for `data/memento.db`.

## Open Questions

1. What is the correct Docker server hostname/IP?
2. What SSH username/key or Portainer access should Hermes use?
3. Should Memento be internal-only or reverse-proxied?
4. Preferred hostname, if proxied?
5. Should this be tied into the existing Cloudflare Tunnel, or stay LAN-only?
6. Is Kenn still able to use Limitless Daily Insights/API, given Limitless subscription constraints?
