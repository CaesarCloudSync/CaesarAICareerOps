#!/usr/bin/env bash

# ==============================================================================
# CaesarAICareerOps — Unified Local Stack Orchestrator
# Patterned on BluStoryApp Local Stack
# ==============================================================================

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ANSI Color Codes
BOLD="\033[1m"
GREEN="\033[0;32m"
CYAN="\033[0;36m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
RESET="\033[0m"

COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"
ENV_FILE="$SCRIPT_DIR/.env.local"
if [ ! -f "$ENV_FILE" ]; then
  ENV_FILE="$SCRIPT_DIR/.env.example"
fi

# Load variables
if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

POSTGRES_USER="${POSTGRES_USER:-caesar}"
POSTGRES_DB="${POSTGRES_DB:-caesar_ops}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
APP_PORT="${PORT:-8000}"

usage() {
  echo -e "${BOLD}CaesarAICareerOps Local Stack CLI${RESET}"
  echo "Usage: ./build_app.sh [COMMAND] [OPTIONS]"
  echo ""
  echo -e "${BOLD}Commands:${RESET}"
  echo -e "  ${CYAN}--local | local${RESET}          Build & run all containers in Docker with live terminal logs [DEFAULT]"
  echo -e "  ${CYAN}--host | host | --dev${RESET}    Run Postgres in Docker + App on Host"
  echo -e "  ${CYAN}--down | down${RESET}            Stop and tear down the local stack containers"
  echo -e "  ${CYAN}--restart | restart${RESET}      Restart the local stack containers"
  echo -e "  ${CYAN}--logs | logs [service]${RESET}  Follow container logs (e.g. ./build_app.sh --logs postgres)"
  echo -e "  ${CYAN}--migrate | migrate${RESET}        Migrate SQLite data into PostgreSQL"
  echo -e "  ${CYAN}--login | login${RESET}            Run interactive AGY OAuth terminal login"
  echo -e "  ${CYAN}--db-shell | db-shell${RESET}    Launch interactive psql terminal inside PostgreSQL container"
  echo -e "  ${CYAN}--db-backup | db-backup${RESET}  Dump PostgreSQL database to data/backups/"
  echo -e "  ${CYAN}--db-restore <file>${RESET}     Restore PostgreSQL database from a SQL dump file"
  echo -e "  ${CYAN}--status | status${RESET}        Check container health, volume persistence, and ports"
  echo -e "  ${CYAN}--test | test${RESET}            Run backend unit test suite"
  echo -e "  ${CYAN}--clean | clean${RESET}          Stop containers and purge images/volumes"
  echo -e "  ${CYAN}--help | help${RESET}            Show this help manual"
  echo ""
}

check_docker() {
  if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Error: docker is not installed or not in PATH.${RESET}"
    exit 1
  fi
  if ! docker compose version &> /dev/null; then
    echo -e "${RED}❌ Error: docker compose (v2) is not available.${RESET}"
    exit 1
  fi
}

cmd_local() {
  check_docker
  echo -e "${CYAN}================================================================${RESET}"
  echo -e "${BOLD}🚀 Starting Persistent PostgreSQL in Docker & Co-Pilot on Host${RESET}"
  echo -e "${CYAN}================================================================${RESET}"
  echo -e "🐘 Database:       ${BOLD}PostgreSQL in Docker (localhost:${POSTGRES_PORT})${RESET}"
  echo -e "💾 Persistence:    ${BOLD}caesar_postgres_data (Docker volume)${RESET}"
  echo -e "⚡ AGY Execution:  ${BOLD}Native Host CLI (Google One AI Premium - \$0 per token)${RESET}"
  echo -e "🌐 Web Dashboard:  ${BOLD}http://127.0.0.1:${APP_PORT}${RESET}"
  echo -e "📚 API Docs:       ${BOLD}http://127.0.0.1:${APP_PORT}/docs${RESET}"
  echo -e "${CYAN}----------------------------------------------------------------${RESET}"

  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d postgres

  echo -e "⏳ Waiting for PostgreSQL to be healthy..."
  local retries=20
  local count=0
  until docker compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; do
    count=$((count + 1))
    if [ "$count" -ge "$retries" ]; then
      echo -e "${RED}❌ PostgreSQL failed to reach healthy state in time.${RESET}"
      docker compose -f "$COMPOSE_FILE" logs postgres
      exit 1
    fi
    sleep 1
  done
  echo -e "${GREEN}✅ PostgreSQL is healthy and accepting connections on port ${POSTGRES_PORT}.${RESET}"

  # Ensure port is completely free so Uvicorn never hits [Errno 98] Address already in use
  local stale_pid
  stale_pid=$(lsof -ti :${APP_PORT} 2>/dev/null || true)
  if [ -n "$stale_pid" ]; then
    echo -e "🧹 Freeing port ${APP_PORT} (cleaning up stale process PID: ${stale_pid})..."
    kill -9 $stale_pid 2>/dev/null || true
    sleep 1
  fi

  echo -e "🚀 Starting CaesarAICareerOps Co-Pilot in foreground (live logs below)..."
  cd "$ROOT_DIR"
  exec python3 "$ROOT_DIR/application.py"
}

cmd_docker() {
  check_docker
  echo -e "${CYAN}================================================================${RESET}"
  echo -e "${BOLD}🚀 Deploying CaesarAICareerOps in Docker (PostgreSQL + App)${RESET}"
  echo -e "${CYAN}================================================================${RESET}"

  echo -e "🐘 Main Provider:  ${BOLD}PostgreSQL (container: caesar-postgres)${RESET}"
  echo -e "💾 Persistence:    ${BOLD}Docker volume: caesar_postgres_data${RESET}"
  echo -e "🌐 Web Dashboard:  ${BOLD}http://localhost:${APP_PORT}${RESET}"
  echo -e "📚 API Docs:       ${BOLD}http://localhost:${APP_PORT}/docs${RESET}"
  echo -e "🩺 Health Check:   ${BOLD}http://localhost:${APP_PORT}/api/health${RESET}"
  echo -e "${CYAN}----------------------------------------------------------------${RESET}"

  echo -e "🛑 Stopping any existing stack containers..."
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down --remove-orphans || true

  echo -e "🔨 Building and starting containers..."
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up --build -d

  echo -e "⏳ Waiting for PostgreSQL to be healthy..."
  local retries=20
  local count=0
  until docker compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; do
    count=$((count + 1))
    if [ "$count" -ge "$retries" ]; then
      echo -e "${RED}❌ PostgreSQL failed to reach healthy state in time.${RESET}"
      docker compose -f "$COMPOSE_FILE" logs postgres
      exit 1
    fi
    sleep 1
  done
  echo -e "${GREEN}✅ PostgreSQL is healthy and accepting connections on port ${POSTGRES_PORT}.${RESET}"

  echo -e "⏳ Waiting for CaesarAICareerOps application to start..."
  count=0
  until curl -sf "http://localhost:${APP_PORT}/api/health" >/dev/null 2>&1; do
    count=$((count + 1))
    if [ "$count" -ge 25 ]; then
      echo -e "${YELLOW}⚠️ App is taking longer than usual. Inspecting logs...${RESET}"
      docker compose -f "$COMPOSE_FILE" logs app
      break
    fi
    sleep 1
  done

  if curl -sf "http://localhost:${APP_PORT}/api/health" >/dev/null 2>&1; then
    echo -e "${GREEN}================================================================${RESET}"
    echo -e "${GREEN}🎉 CaesarAICareerOps Stack successfully deployed and verified!${RESET}"
    echo -e "${GREEN}================================================================${RESET}"
    curl -s "http://localhost:${APP_PORT}/api/health" | python3 -m json.tool || true
    echo ""
    echo -e "Open the dashboard in your browser: ${BOLD}http://localhost:${APP_PORT}${RESET}"
  else
    echo -e "${YELLOW}Stack is starting. Check status with: ./build_app.sh --status${RESET}"
  fi
}

cmd_down() {
  check_docker
  echo -e "🛑 Stopping CaesarAICareerOps stack..."
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down
  echo -e "${GREEN}✅ Stack stopped successfully.${RESET}"
}

cmd_restart() {
  check_docker
  echo -e "🔄 Restarting CaesarAICareerOps stack..."
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" restart
  echo -e "${GREEN}✅ Stack restarted.${RESET}"
}

cmd_logs() {
  check_docker
  local svc="${1:-}"
  if [ -n "$svc" ]; then
    docker compose -f "$COMPOSE_FILE" logs -f "$svc"
  else
    docker compose -f "$COMPOSE_FILE" logs -f
  fi
}

cmd_migrate() {
  echo -e "🚀 Running SQLite ➔ PostgreSQL Migration..."
  python3 "$ROOT_DIR/backend/application/repository/migrate_sqlite_to_postgres.py"
}

cmd_login() {
  echo -e "${CYAN}================================================================${RESET}"
  echo -e "${BOLD}🔑 Antigravity (AGY) Interactive OAuth Login${RESET}"
  echo -e "${CYAN}================================================================${RESET}"
  if command -v agy &> /dev/null; then
    agy
  else
    check_docker
    docker compose -f "$COMPOSE_FILE" exec -it app agy
  fi
}

cmd_db_shell() {
  check_docker
  echo -e "🔌 Opening interactive PostgreSQL shell (${POSTGRES_DB})..."
  docker compose -f "$COMPOSE_FILE" exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
}

cmd_db_backup() {
  check_docker
  local backup_dir="$ROOT_DIR/data/backups"
  mkdir -p "$backup_dir"
  local timestamp=$(date +"%Y%m%d_%H%M%S")
  local backup_file="$backup_dir/caesar_ops_backup_${timestamp}.sql"

  echo -e "💾 Backing up PostgreSQL database '${POSTGRES_DB}' to: $backup_file..."
  docker compose -f "$COMPOSE_FILE" exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" > "$backup_file"
  echo -e "${GREEN}✅ Database backup saved (${backup_file}, $(du -h "$backup_file" | cut -f1))${RESET}"
}

cmd_db_restore() {
  check_docker
  local restore_file="$1"
  if [ -z "$restore_file" ] || [ ! -f "$restore_file" ]; then
    echo -e "${RED}❌ Please specify a valid SQL backup file.${RESET}"
    echo "Usage: ./build_app.sh --db-restore data/backups/caesar_ops_backup_YYYYMMDD_HHMMSS.sql"
    exit 1
  fi
  echo -e "⚠️  Restoring database '${POSTGRES_DB}' from: $restore_file..."
  docker compose -f "$COMPOSE_FILE" exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$restore_file"
  echo -e "${GREEN}✅ Database restored successfully!${RESET}"
}

cmd_status() {
  check_docker
  echo -e "${BOLD}📊 Container Status:${RESET}"
  docker compose -f "$COMPOSE_FILE" ps
  echo ""
  echo -e "${BOLD}💾 Volume Persistence:${RESET}"
  docker volume ls | grep -E "caesar_postgres_data|caesar_app_data" || true
  echo ""
  echo -e "${BOLD}🩺 Live Health Check:${RESET}"
  curl -s "http://localhost:${APP_PORT}/api/health" || echo "App not responding on http://localhost:${APP_PORT}"
  echo ""
}

cmd_test() {
  echo -e "🧪 Running CaesarAICareerOps test suite..."
  python3 -m pytest backend/tests/ -v --disable-warnings 2>/dev/null || pytest -v --disable-warnings || true
}

cmd_clean() {
  check_docker
  echo -e "${YELLOW}⚠️  WARNING: This will stop all containers and remove the persistent database volume!${RESET}"
  read -p "Are you sure you want to proceed? (y/N): " confirm
  if [[ "$confirm" =~ ^[Yy]$ ]]; then
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down -v --remove-orphans
    echo -e "${GREEN}✅ Containers and persistent volumes cleaned.${RESET}"
  else
    echo "Aborted."
  fi
}

MODE="${1:-local}"

case "$MODE" in
  --local|local|--dev|dev|host)
    cmd_local
    ;;
  --docker|docker|--container|container)
    cmd_docker
    ;;
  --down|down|stop)
    cmd_down
    ;;
  --restart|restart)
    cmd_restart
    ;;
  --migrate|migrate)
    cmd_migrate
    ;;
  --login|login|--agy-login)
    cmd_login
    ;;
  --logs|logs)
    shift
    cmd_logs "$@"
    ;;
  --db-shell|db-shell|psql)
    cmd_db_shell
    ;;
  --db-backup|db-backup|backup)
    cmd_db_backup
    ;;
  --db-restore|db-restore|restore)
    shift
    cmd_db_restore "$@"
    ;;
  --status|status|ps)
    cmd_status
    ;;
  --test|test)
    cmd_test
    ;;
  --clean|clean)
    cmd_clean
    ;;
  --help|help|-h)
    usage
    ;;
  *)
    echo -e "${RED}Unknown command: $MODE${RESET}"
    usage
    exit 1
    ;;
esac
