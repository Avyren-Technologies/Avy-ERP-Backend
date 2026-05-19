# MEMORY: Production Prisma Migration Recovery (P3009)

> **Purpose:** Runbook for recovering failed Prisma migrations in production.
> **Incident resolved:** 2026-05-19 — `20260518125807_pip_operations_added` failed on Avy ERP production.

---

## Symptoms

`./deploy.sh up` or `./deploy.sh migrate` fails with:

```text
Error: P3009
migrate found failed migrations in the target database, new migrations will not be applied.
The `20260518125807_pip_operations_added` migration started at ... failed
```

Migration log (`_prisma_migrations.logs`) may show:

```text
Database error code: 23502
ERROR: column "operationId" of relation "pip_slab_configs" contains null values
```

---

## Root causes (this incident)

1. **Migration SQL unsafe for existing rows** — `pip_slab_configs` had rows; migration tried `ADD COLUMN operationId TEXT NOT NULL` without backfill.
2. **PgBouncer + Prisma migrate** — `./deploy.sh migrate` uses app `DATABASE_URL` → `pgbouncer:5432`. Prisma needs Postgres advisory locks; PgBouncer transaction pooling causes `P1002` timeouts.
3. **Shell quoting** — Single-quoted `sh -c '...${POSTGRES_USER}...'` does not expand host env vars → `P1010 User '' was denied access`.

---

## Before you fix anything

### 1. Backup

```bash
docker exec avy-erp-postgres pg_dump -U avy_admin avy_erp > avy_erp_backup_$(date +%F_%H%M).sql
```

### 2. Inspect failed migration + schema state

```bash
docker exec -i avy-erp-postgres psql -U avy_admin -d avy_erp -c "
SELECT migration_name, started_at, finished_at, rolled_back_at, logs
FROM \"_prisma_migrations\"
WHERE migration_name = '<failed_migration_name>';
"

docker exec -i avy-erp-postgres psql -U avy_admin -d avy_erp -c "
SELECT to_regclass('public.operations');
SELECT column_name FROM information_schema.columns
WHERE table_name = 'pip_slab_configs' AND column_name = 'operationId';
"
```

- If `operations` does **not** exist and `operationId` column does **not** exist → migration rolled back fully (no manual DDL cleanup needed).
- If partial objects exist → inspect logs and clean up manually before retrying.

### 3. Decide on data

If failed migration affects disposable feature data (e.g. unreleased PIP), truncate only those tables:

```sql
BEGIN;
TRUNCATE TABLE
  pip_daily_entries,
  pip_slab_configs,
  pip_monthly_reports,
  pip_incentive_configs
RESTART IDENTITY CASCADE;
COMMIT;
```

Verify counts are 0 before continuing.

---

## Recovery procedure (what worked in production)

Run from `avy-erp-backend/` on the production server.

### Step 1 — Load env on host

```bash
set -a
source .env.production
set +a
echo "$POSTGRES_USER $POSTGRES_DB"
```

### Step 2 — Stop app + restart PgBouncer (clear stale advisory locks)

```bash
docker compose --env-file .env.production -f docker-compose.yml stop app
docker compose --env-file .env.production -f docker-compose.yml restart pgbouncer
sleep 3
```

Check no advisory locks remain:

```bash
docker exec -i avy-erp-postgres psql -U avy_admin -d avy_erp -c "
SELECT COUNT(*) FROM pg_locks WHERE locktype = 'advisory';
"
```

If locks persist, terminate holders:

```bash
docker exec -i avy-erp-postgres psql -U avy_admin -d avy_erp -c "
SELECT pg_terminate_backend(l.pid)
FROM pg_locks l
WHERE l.locktype = 'advisory' AND l.granted = true;
"
```

### Step 3 — Mark failed migration as rolled back

**Use `run --rm` (not `exec`) when app is stopped.**  
**Use direct Postgres (`postgres:5432`), not PgBouncer.**  
**Use double quotes on outer `sh -c` so host expands `${POSTGRES_USER}` etc.**

```bash
docker compose --env-file .env.production -f docker-compose.yml run --rm app sh -c \
"node scripts/merge-prisma.js && DATABASE_URL=\"postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}?schema=public\" npx prisma migrate resolve --rolled-back 20260518125807_pip_operations_added"
```

Expected: `Migration ... marked as rolled back.`

Verify:

```bash
docker exec -i avy-erp-postgres psql -U avy_admin -d avy_erp -c "
SELECT migration_name, finished_at, rolled_back_at
FROM \"_prisma_migrations\"
WHERE migration_name = '20260518125807_pip_operations_added';
"
```

### Step 4 — Apply pending migrations

```bash
docker compose --env-file .env.production -f docker-compose.yml run --rm app sh -c \
"node scripts/merge-prisma.js && DATABASE_URL=\"postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}?schema=public\" npx prisma migrate deploy"
```

Expected: `All migrations have been successfully applied.`

### Step 5 — Verify + start app

```bash
docker compose --env-file .env.production -f docker-compose.yml run --rm app sh -c \
"node scripts/merge-prisma.js && DATABASE_URL=\"postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}?schema=public\" npx prisma migrate status"

docker compose --env-file .env.production -f docker-compose.yml start app
curl -s http://localhost:3001/health
```

(Use actual `APP_PORT` from `.env.production`.)

---

## SQL fallback (if `migrate resolve` still fails on lock)

Only when migration fully rolled back and you need to unblock `_prisma_migrations`:

```sql
UPDATE "_prisma_migrations"
SET rolled_back_at = NOW()
WHERE migration_name = '20260518125807_pip_operations_added'
  AND finished_at IS NULL
  AND rolled_back_at IS NULL;
```

Then run Step 4 (`migrate deploy`) only.

---

## Common errors quick reference

| Error | Cause | Fix |
|-------|--------|-----|
| `P3009` | Failed migration record in `_prisma_migrations` | `migrate resolve --rolled-back`, fix data/schema, then `migrate deploy` |
| `P1010 User '' denied` | `${POSTGRES_*}` not expanded (single quotes) | `source .env.production` on host; use double quotes in `sh -c "..."` |
| `P1002 advisory lock timeout` | Migrate via PgBouncer or stale lock | Stop app, restart pgbouncer, use `postgres:5432` directly |
| `service "app" is not running` | Used `exec` while app stopped | Use `docker compose run --rm app` instead |
| `23502 operationId contains null values` | NOT NULL column on non-empty table | Truncate/backfill affected rows, then retry |

---

## Do NOT do in production

- `db-push-reset` / `prisma db push --force-reset` (drops all data)
- Manually delete rows from `_prisma_migrations` (use `migrate resolve`)
- `migrate resolve --applied` unless migration SQL actually succeeded
- Run `migrate deploy` through PgBouncer when advisory lock errors occur

---

## Prevention (TODO for deploy.sh)

1. Run `prisma migrate deploy` against **direct Postgres** (`postgres:5432`), not PgBouncer.
2. Use `docker compose run --rm app` for migrations so they work even when app is stopped.
3. Avoid `ADD COLUMN ... NOT NULL` on tables that may have rows — use nullable → backfill → NOT NULL.

---

## Successful outcome (2026-05-19)

- Failed migration marked rolled back
- Applied: `20260518125807_pip_operations_added`, `20260519031934_pip_operations_fix`, `20260519043332_pip_fixes_v1`
- `prisma migrate status`: **Database schema is up to date!**
- App health: `GET /health` → `success: true`
