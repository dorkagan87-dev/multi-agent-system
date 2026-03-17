# Deploy to Railway (Always-On Cloud)

## What you need
- [Railway account](https://railway.app) (free to start, ~$10-20/mo for always-on)
- Your code pushed to GitHub
- Railway CLI: `npm i -g @railway/cli` then `railway login`

---

## Step 1 — Push to GitHub

```bash
git add .
git commit -m "ready for staging"
git push
```

---

## Step 2 — Create Railway Project

```bash
railway init          # creates a new project and links it
railway link          # or link to an existing project
```

Or via dashboard: railway.app → **New Project** → **Deploy from GitHub repo**

---

## Step 3 — Add PostgreSQL & Redis

In your Railway project dashboard:
1. **+ New** → **Database** → **PostgreSQL** → Deploy
2. **+ New** → **Database** → **Redis** → Deploy

Railway auto-generates `DATABASE_URL` and `REDIS_URL`.

---

## Step 4 — Create the 3 App Services

### Service 1: API
- **Dockerfile**: `Dockerfile.api`
- **Port**: `3001`
- Socket.io shares this same port — no second port needed

### Service 2: Worker
- **Dockerfile**: `Dockerfile.worker`
- **No port** (background process)

### Service 3: Web
- **Dockerfile**: `Dockerfile.web`
- **Port**: `3000`

---

## Step 5 — Environment Variables

### API service

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Railway reference variable |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` | Railway reference variable |
| `JWT_ACCESS_SECRET` | `openssl rand -hex 32` | |
| `JWT_REFRESH_SECRET` | `openssl rand -hex 32` | Different from access secret |
| `ENCRYPTION_KEY` | `openssl rand -hex 32` | Encrypts agent API keys |
| `JWT_ACCESS_EXPIRES` | `15m` | |
| `JWT_REFRESH_EXPIRES` | `7d` | |
| `PORT` | `3001` | |
| `HOST` | `0.0.0.0` | |
| `NODE_ENV` | `production` | |
| `CORS_ORIGIN` | `https://your-web.up.railway.app` | Web service URL |
| `APP_URL` | `https://your-web.up.railway.app` | For password reset emails |
| `SENTRY_DSN` | *(optional)* | From sentry.io project settings |

### Worker service (same as API except PORT/CORS/APP_URL)

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` |
| `JWT_ACCESS_SECRET` | *(same as API)* |
| `JWT_REFRESH_SECRET` | *(same as API)* |
| `ENCRYPTION_KEY` | *(same as API)* |
| `JWT_ACCESS_EXPIRES` | `15m` |
| `JWT_REFRESH_EXPIRES` | `7d` |
| `NODE_ENV` | `production` |
| `WORKER_CONCURRENCY` | `5` |
| `SENTRY_DSN` | *(optional, same as API)* |

### Web service

| Variable | Value | Notes |
|---|---|---|
| `NEXTAUTH_SECRET` | `openssl rand -hex 32` | |
| `NEXTAUTH_URL` | `https://your-web.up.railway.app` | |
| `NEXT_PUBLIC_API_URL` | `https://your-api.up.railway.app` | API service URL |
| `NEXT_PUBLIC_SOCKET_URL` | `https://your-api.up.railway.app` | Same as API — Socket.io on same port |
| `NEXT_OUTPUT` | `standalone` | Required for Docker build |
| `NEXT_PUBLIC_SENTRY_DSN` | *(optional)* | Client-side Sentry DSN (build-time arg) |
| `SENTRY_DSN` | *(optional)* | Server-side Sentry DSN |

---

## Step 6 — Deploy

```bash
railway up            # deploy current branch
```

Or push to GitHub — Railway auto-deploys on every push to `main`.

First deploy takes ~5–8 minutes to build all 3 images.

---

## Step 7 — Schema sync (first deploy only)

The API container runs `prisma db push` automatically on startup.
No manual migration step needed — the database is ready when the container starts.

To seed default data (tools, templates) via Railway CLI:

```bash
railway run --service api -- node apps/api/dist/prisma/seed.js
```

---

## Health checks

- API: `https://your-api.up.railway.app/health` → `{"status":"ok"}`
- Web: `https://your-web.up.railway.app`

---

## Generate secret keys

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Run once per secret — JWT access, JWT refresh, encryption key, NextAuth secret are all different values.

---

## Smoke-test checklist

- [ ] `GET /health` returns 200
- [ ] Register a new user
- [ ] Login → redirects to /dashboard
- [ ] Create an agent
- [ ] Create a project + task → task runs and completes
- [ ] Socket.io: live activity feed updates in real-time
- [ ] Contract analyzer: upload PDF → analysis appears
- [ ] Password reset email (check server logs if SMTP not configured)
