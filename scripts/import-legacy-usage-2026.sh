#!/usr/bin/env bash
# 2026 예약현황 → legacy_usage 이관 및 회원 last_used_date 반영
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"
export DEV_ENV_ROOT="$ROOT"

# shellcheck disable=SC1091
source "$ROOT/.env" 2>/dev/null || true
# shellcheck source=scripts/lib/dev-env.sh
source "$ROOT/scripts/lib/dev-env.sh"

if [[ ! -d .venv ]]; then
  echo "Missing backend/.venv — run ./scripts/dev.sh once first."
  exit 1
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

.venv/bin/python "$ROOT/scripts/import-legacy-usage-2026.py" "$@"
