#!/bin/bash
# ============================================
# Avy ERP Backend — Production Deployment Script
# Usage: ./deploy.sh [up|down|restart|logs|migrate|seed|status]
# ============================================

set -euo pipefail

COMPOSE_FILE="docker-compose.yml"
ENV_FILE=".env.production"

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

# Run Prisma migrations inside the app container
cmd_migrate() {
  log "Running Prisma migrations..."
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec app \
    npx prisma migrate deploy
  log "Migrations complete."
}

# Run database seed
cmd_seed() {
  log "Seeding database..."
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec app \
    npx ts-node prisma/seed.ts
  log "Seed complete."
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
  echo "  up        Build and start all services (postgres, redis, app)"
  echo "  down      Stop all services"
  echo "  restart   Rebuild and restart app only (keeps DB & Redis)"
  echo "  logs      View logs (optionally: ./deploy.sh logs app)"
  echo "  migrate   Run Prisma database migrations"
  echo "  seed      Run database seed script"
  echo "  status    Show service status"
  echo "  help      Show this help"
}

# Main
case "${1:-help}" in
  up)       cmd_up ;;
  down)     cmd_down ;;
  restart)  cmd_restart ;;
  logs)     cmd_logs "$@" ;;
  migrate)  cmd_migrate ;;
  seed)     cmd_seed ;;
  status)   cmd_status ;;
  help|*)   cmd_help ;;
esac
