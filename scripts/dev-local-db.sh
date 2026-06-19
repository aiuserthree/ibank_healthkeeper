#!/usr/bin/env bash
# 로컬 Docker PostgreSQL + Redis 기동/중지 (운영 DB와 분리)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "Missing .env — copy from .env.example"
  exit 1
fi

CMD="${1:-up}"

case "$CMD" in
  up)
    export DEV_ENV_ROOT="$ROOT"
    # shellcheck source=scripts/lib/dev-env.sh
    source "$ROOT/scripts/lib/dev-env.sh"
    dev_start_local_db
    echo "Local DB running. Stop: ./scripts/dev-local-db.sh down"
    ;;
  down)
    docker compose -f deploy/docker-compose.local.yml --env-file .env down
    echo "Local DB stopped."
    ;;
  status)
    docker compose -f deploy/docker-compose.local.yml --env-file .env ps
    ;;
  *)
    echo "Usage: $0 [up|down|status]"
    exit 1
    ;;
esac
