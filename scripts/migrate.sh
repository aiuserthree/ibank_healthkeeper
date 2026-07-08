#!/usr/bin/env bash
# DB 마이그레이션 — 기본은 로컬 Docker DB, USE_REMOTE_DB=1 일 때만 운영 터널
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"
export DEV_ENV_ROOT="$ROOT"

# shellcheck disable=SC1091
source "$ROOT/.env" 2>/dev/null || true
# shellcheck source=scripts/lib/dev-env.sh
source "$ROOT/scripts/lib/dev-env.sh"

if [[ ! -d .venv ]]; then
  python3 -m venv .venv
  .venv/bin/pip install -q -r requirements.txt
fi

if ! dev_db_ready; then
  if dev_is_remote_db; then
    echo "SSH tunnel not active. Run: ./scripts/dev-tunnel.sh"
  else
    echo "Local DB not running. Run: ./scripts/dev-local-db.sh up"
  fi
  exit 1
fi

dev_assert_local_db_config
dev_sync_backend_env

.venv/bin/alembic upgrade head
echo "Migration complete ($(dev_is_remote_db && echo remote || echo local) DB)."
