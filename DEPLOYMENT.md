# Deployment Guide

## Environments

| Mode | How to run | Backend URL | Served on |
|------|-----------|-------------|-----------|
| **Local dev** | `npm run dev` | `http://localhost:8000` (direct) | `http://localhost:5173` |
| **Docker (local test)** | `docker compose up` | nginx proxy → backend IP | `http://localhost:6002` |
| **Docker (production)** | pull from DockerHub + `docker compose up` | nginx proxy → backend IP | `http://localhost:6002` |

---

## Local Development

Requirements: backend running on `localhost:8000`, Node 20+.

```bash
cd FrontEnd/dashinterface
npm install        # first time only
npm run dev
```

The Vite dev server loads `FrontEnd/dashinterface/.env.development` automatically:
```
VITE_API_BASE=http://localhost:8000
```
All API calls go directly to the backend. No nginx, no Docker.

---

## Docker Build & DockerHub Publish

### 1. Update the backend URL in `Dockerfile.dev`

Before building, confirm the backend host:port is correct.
Find this line in `Dockerfile.dev` and update it:

```nginx
proxy_pass http://72.60.199.165:8002/;
```

> This is the **only** place to change when the backend IP/port changes.
> The build bakes this URL into the nginx config — rebuild required after any change.

### 2. Build the image

```bash
# Run from repo root (MVP-Demo/)
docker build -f Dockerfile.dev -t thaarushi/freight-fe-beta:development .
```

### 3. Push to DockerHub

```bash
docker login
docker push thaarushi/freight-fe-beta:development
```

### 4. Deploy on server

```bash
docker compose pull
docker compose up -d
```

The `docker-compose.yml` pulls `thaarushi/freight-fe-beta:development` and exposes it on port `6002`.

---

## How the Proxy Works (Docker mode)

```
Browser → nginx :80 /api/* → backend :8002/*   (strips /api prefix)
Browser → nginx :80 /*     → React SPA (index.html fallback)
```

The frontend is built **without** `VITE_API_BASE`, so it defaults to `/api`. Nginx rewrites that to the real backend URL at runtime.

---

## Checklist Before Publishing to DockerHub

- [ ] Backend IP/port in `Dockerfile.dev` `proxy_pass` is correct
- [ ] `npm run build` passes locally with zero errors (`npx tsc --noEmit`)
- [ ] Tested locally with `npm run dev` against `localhost:8000`
- [ ] `docker build` completes without errors
- [ ] Smoke-tested the Docker image locally on `localhost:6002` before pushing
- [ ] `docker push thaarushi/freight-fe-beta:development`

---

## Key Files

| File | Purpose |
|------|---------|
| `Dockerfile.dev` | Builds React app + nginx image for Docker deployment |
| `docker-compose.yml` | Pulls image from DockerHub, maps port 6002→80 |
| `FrontEnd/dashinterface/.env.development` | Vite env for local dev (`VITE_API_BASE=http://localhost:8000`) |
| `FrontEnd/dashinterface/vite.config.ts` | Vite config (dev server on port 5173) |
| `FrontEnd/dashinterface/src/api.ts` | All API calls — `BASE` reads from `VITE_API_BASE` or falls back to `/api` |
