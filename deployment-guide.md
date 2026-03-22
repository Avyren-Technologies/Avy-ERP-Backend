### 1. `Dockerfile` — Multi-stage production build
- **Stage 1 (builder)**: Installs all deps, generates Prisma client, compiles TypeScript
- **Stage 2 (production)**: Only production deps + compiled JS = minimal image
- Uses `node:20-alpine` for small footprint
- `dumb-init` as PID 1 for proper signal handling (graceful shutdown with your SIGTERM handler)
- Runs as non-root `appuser` (security best practice)
- Built-in health check hitting `/health`

### 2. `docker-compose.yml` — Full production stack
| Service | Image | Notes |
|---------|-------|-------|
| **postgres** | `postgres:18` | Volume mounted at `/var/lib/postgresql` (required for 18+), health check, scram-sha-256 auth |
| **redis** | `redis:latest` | Password-protected, AOF persistence, 256MB limit with LRU eviction |
| **app** | Built from Dockerfile | Depends on both being healthy before starting |

- All env vars from your `env.ts` Zod schema are mapped
- `DATABASE_URL` and `REDIS_URL` auto-constructed to point to Docker service hostnames (`postgres`, `redis`)
- Required vars use `?` syntax (docker compose will error if missing)
- Volumes for postgres data, redis data, app logs, and uploads

### 3. `.env.production` — Template with all variables
- Fill in your actual passwords, JWT secrets, SMTP credentials, domain, and CORS origins

### 4. `deploy.sh` — Deployment helper script
- `./deploy.sh up` — builds, starts everything, runs migrations
- `./deploy.sh restart` — rebuilds only the app (keeps DB/Redis)
- `./deploy.sh logs app` — tail logs
- `./deploy.sh migrate` — run Prisma migrations

### 5. `.dockerignore` — Keeps image clean

## Deployment Steps on Your Linux Server

```bash
# 1. Clone/copy the repo to your server
# 2. Configure environment
cp .env.production .env.production   # edit with real values
nano .env.production

# 3. Generate strong secrets
openssl rand -base64 64   # use for JWT_SECRET
openssl rand -base64 64   # use for JWT_REFRESH_SECRET
openssl rand -base64 32   # use for POSTGRES_PASSWORD
openssl rand -base64 32   # use for REDIS_PASSWORD

# 4. Deploy
./deploy.sh up

# 5. Configure Cloudflared tunnel to point to http://localhost:3000
cloudflared tunnel route dns <tunnel-name> api.yourdomain.com
```

### Cloudflared Config
Your `~/.cloudflared/config.yml` should include:
```yaml
ingress:
  - hostname: api.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
```

Update `CORS_ALLOWED_ORIGINS` and `APP_URL` in `.env.production` to match your actual domain.