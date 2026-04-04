#!/bin/bash
# ============================================
# Avy ERP Backend — Production Deployment Script
# Usage: ./deploy.sh [up|down|restart|logs|migrate|migrate-baseline|seed|db-push-reset|seed-company|status]
#
# If `migrate deploy` fails with P3005 (schema not empty, no migration history), the DB was likely
# created before Prisma Migrate. Run ONCE: ./deploy.sh migrate-baseline
# then ./deploy.sh migrate — see https://www.prisma.io/docs/guides/migrate/developing-with-prisma-migrate/add-prisma-migrate-to-an-existing-project
#
# Prisma uses a modular schema (prisma/base.prisma + prisma/modules/**/*.prisma).
# npm scripts run `node scripts/merge-prisma.js` first; Docker commands here do the same
# inside the app container before migrate deploy / db push.
# ============================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="docker-compose.yml"
ENV_FILE=".env.production"

# Docker Compose helper (app service)
compose_app_exec() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec app "$@"
}

# Modular Prisma: base.prisma + prisma/modules → schema.prisma (scripts/merge-prisma.js), then run a shell snippet.
# Matches package.json "prisma:merge" + prisma CLI; requires merge script in the app image (see Dockerfile).
run_in_app_after_prisma_merge() {
  local inner="${1:?command required}"
  compose_app_exec sh -c "node scripts/merge-prisma.js && ${inner}"
}

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[AVY-ERP]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Host port published by docker-compose (${APP_PORT}:3000). Not always exported in shell.
host_app_port() {
  if [ -n "${APP_PORT:-}" ]; then
    echo "$APP_PORT"
    return
  fi
  if [ -f "$ENV_FILE" ]; then
    local v
    v=$(grep -E '^[[:space:]]*APP_PORT[[:space:]]*=' "$ENV_FILE" | tail -1 | sed 's/^[[:space:]]*APP_PORT[[:space:]]*=[[:space:]]*//')
    v="${v%$'\r'}"
    v="${v#\"}"
    v="${v%\"}"
    v="${v#\'}"
    v="${v%\'}"
    if [ -n "$v" ]; then
      echo "$v"
      return
    fi
  fi
  echo "3000"
}

# Check prerequisites
check_prereqs() {
  command -v docker >/dev/null 2>&1 || error "Docker is not installed"
  command -v docker compose >/dev/null 2>&1 || error "Docker Compose plugin is not installed"

  if [ ! -f "$ENV_FILE" ]; then
    error "$ENV_FILE not found. Copy .env.production and fill in your values."
  fi

  # Check for placeholder passwords
  if grep -q "CHANGE_ME" "$ENV_FILE"; then
    error "Please update all CHANGE_ME values in $ENV_FILE before deploying"
  fi
}

# Build and start all services
cmd_up() {
  check_prereqs
  log "Starting Avy ERP Backend (production)..."
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build
  log "Waiting for services to be healthy..."
  sleep 10
  cmd_status
  log "Running database migrations..."
  cmd_migrate
  log "Deployment complete!"
  echo ""
  HP="$(host_app_port)"
  log "Backend (on this host): http://localhost:${HP}  (container listens on port 3000)"
  log "Health check: http://localhost:${HP}/health"
  echo ""
  warn "Point Cloudflared at the host port, e.g. http://localhost:${HP} (not 3000 unless APP_PORT=3000)"
}

# Stop all services
cmd_down() {
  log "Stopping all services..."
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" down
  log "All services stopped."
}

# Restart app only (keeps DB & Redis running)
cmd_restart() {
  log "Restarting app container..."
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build app
  log "App restarted."
}

# View logs
cmd_logs() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" logs -f "${2:-}"
}

# Run Prisma migrations inside the app container (merge modular schema first)
cmd_migrate() {
  log "Merging Prisma modules → schema.prisma, then migrate deploy..."
  run_in_app_after_prisma_merge "npx prisma migrate deploy"
  log "Migrations complete."
}

# One-time: register the initial migration as already applied (fixes P3005 on non-empty DBs with no _prisma_migrations rows).
# Only use if your public schema already matches prisma/migrations/20260403060633_init (e.g. created via db push).
cmd_migrate_baseline() {
  log "Baselining: marking migration 20260403060633_init as applied (no SQL runs)..."
  run_in_app_after_prisma_merge "npx prisma migrate resolve --applied 20260403060633_init"
  log "Baseline recorded. Next: ./deploy.sh migrate"
}

# Run database seed
cmd_seed() {
  log "Seeding database..."
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec app \
    npx -y -p ts-node@10.9.2 -p typescript@5.3.3 \
    ts-node --transpile-only --skip-project \
    --compiler-options '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' \
    prisma/seed.ts
  log "Seed complete."
}

# DESTRUCTIVE: drop DB data and apply current schema (dev/staging only).
# Requires explicit --yes. Merges prisma/modules → schema.prisma before push (same as npm run db:push + --force-reset).
cmd_db_push_reset() {
  check_prereqs
  log "Merging Prisma modules → schema.prisma, then db push --force-reset (this DROPS ALL DATA)..."
  run_in_app_after_prisma_merge "npx prisma db push --force-reset --accept-data-loss"
  log "db push --force-reset complete."
}

# Run scripts/seed-company.ts (in this repo) against the API (host-side; not inside Docker).
# Forwards all arguments to the script, e.g.:
#   ./deploy.sh seed-company --count 1 --multi-location --employees 10 --api-url http://localhost:3000/api/v1
cmd_seed_company() {
  command -v npx >/dev/null 2>&1 || error "npx is required to run seed-company"
  local seed_script
  seed_script="$SCRIPT_DIR/scripts/seed-company.ts"
  if [ ! -f "$seed_script" ]; then
    error "seed-company script not found at $seed_script"
  fi
  log "Running seed-company (tsx) with args: $*"
  (cd "$SCRIPT_DIR" && npx --yes tsx "$seed_script" "$@")
  log "seed-company finished."
}

# Show service status
cmd_status() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps
}

# Show help
cmd_help() {
  echo "Usage: ./deploy.sh [command]"
  echo ""
  echo "Commands:"
  echo "  up              Build and start all services (postgres, redis, app)"
  echo "  down            Stop all services"
  echo "  restart         Rebuild and restart app only (keeps DB & Redis)"
  echo "  logs            View logs (optionally: ./deploy.sh logs app)"
  echo "  migrate         Merge modular Prisma schema, then prisma migrate deploy"
  echo "  migrate-baseline  One-time P3005 fix: resolve --applied 20260403060633_init (existing DB, no history)"
  echo "  seed            Run prisma/seed-rbac-fix.ts inside the app container"
  echo "  db-push-reset   DANGER: merge schema, then prisma db push --force-reset (./deploy.sh db-push-reset --yes)"
  echo "  seed-company    Run scripts/seed-company.ts on host (pass script flags after command)"
  echo "  status          Show service status"
  echo "  help            Show this help"
}

# Main
case "${1:-help}" in
  up)       cmd_up ;;
  down)     cmd_down ;;
  restart)  cmd_restart ;;
  logs)     cmd_logs "$@" ;;
  migrate)  cmd_migrate ;;
  migrate-baseline) cmd_migrate_baseline ;;
  seed)     cmd_seed ;;
  db-push-reset)
    if [ "${2:-}" != "--yes" ]; then
      error "Refusing to reset DB without confirmation. Usage: ./deploy.sh db-push-reset --yes"
    fi
    cmd_db_push_reset
    ;;
  seed-company)
    shift
    cmd_seed_company "$@"
    ;;
  status)   cmd_status ;;
  help|*)   cmd_help ;;
esac
