# Deploy to Railway (Always-On Cloud)

## What you need
- [Railway account](https://railway.app) (free to start, ~$10-20/mo for always-on)
- Your code pushed to a GitHub repo
- 10 minutes

---

## Step 1 — Push to GitHub

```bash
cd c:/Users/User/agent-hub
git init
git add .
git commit -m "initial commit"
# Create a repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/agent-hub.git
git push -u origin main
```

---

## Step 2 — Create Railway Project

1. Go to [railway.app](https://railway.app) → **New Project**
2. Click **"Deploy from GitHub repo"** → connect your repo

---

## Step 3 — Add PostgreSQL & Redis

In your Railway project:
1. Click **"+ New"** → **Database** → **PostgreSQL** → Deploy
2. Click **"+ New"** → **Database** → **Redis** → Deploy

Railway auto-generates `DATABASE_URL` and `REDIS_URL` — you'll reference them as variables.

---

## Step 4 — Create the 3 App Services

### Service 1: API
1. Click **"+ New"** → **GitHub Repo** → your repo
2. In service settings:
   - **Root Directory**: `/` (root)
   - **Dockerfile Path**: `Dockerfile.api`
   - **Port**: `3001`
3. Add environment variables (see below)

### Service 2: Worker
1. Click **"+ New"** → **GitHub Repo** → your repo (same repo, new service)
2. Settings:
   - **Root Directory**: `/`
   - **Dockerfile Path**: `Dockerfile.worker`
   - **No port** needed
3. Add environment variables (same as API, minus PORT/CORS)

### Service 3: Web
1. Click **"+ New"** → **GitHub Repo** → your repo
2. Settings:
   - **Root Directory**: `/`
   - **Dockerfile Path**: `Dockerfile.web`
   - **Port**: `3000`
3. Add environment variables (see below)

---

## Step 5 — Environment Variables

### API + Worker services (set on both)

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Railway auto-fills from your PG service |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` | Railway auto-fills from Redis service |
| `JWT_ACCESS_SECRET` | run `openssl rand -hex 32` | Generate once, use everywhere |
| `JWT_REFRESH_SECRET` | run `openssl rand -hex 32` | Different value from access secret |
| `ENCRYPTION_KEY` | run `openssl rand -hex 32` | Used to encrypt agent API keys |
| `JWT_ACCESS_EXPIRES` | `15m` | |
| `JWT_REFRESH_EXPIRES` | `7d` | |
| `PORT` | `3001` | API only |
| `HOST` | `0.0.0.0` | API only |
| `NODE_ENV` | `production` | |
| `WORKER_CONCURRENCY` | `5` | Worker only |
| `CORS_ORIGIN` | `https://your-web.railway.app` | Your web service URL |

### Web service

| Variable | Value | Notes |
|---|---|---|
| `NEXTAUTH_SECRET` | run `openssl rand -hex 32` | |
| `NEXTAUTH_URL` | `https://your-web.railway.app` | Your Railway web URL |
| `NEXT_PUBLIC_API_URL` | `https://your-api.railway.app` | Your Railway API URL |
| `NEXT_PUBLIC_SOCKET_URL` | `https://your-api.railway.app` | Same as API (Socket.io on same port) |
| `NEXT_OUTPUT` | `standalone` | Required for Docker build |

---

## Step 6 — Deploy

Railway auto-deploys on every push to `main`. First deploy takes ~5 minutes to build.

After deploy:
- API health: `https://your-api.railway.app/health`
- Web app: `https://your-web.railway.app`

Agents will run **24/7** — even when your PC is off.

---

## Generate secret keys

Run these in your terminal and copy the output:

```bash
# JWT Access Secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# JWT Refresh Secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Encryption Key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# NextAuth Secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## After first deploy — run DB migrations

In the Railway API service terminal (or via Railway CLI):
```bash
npx prisma migrate deploy
npx prisma db seed
```

Or it runs automatically on API startup (migration is in the Docker CMD).
