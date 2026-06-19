#!/usr/bin/env bash
# 로컬 테스트용 예약 OPEN + 신청 데이터 (기본: 로컬 Docker DB)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"
export DEV_ENV_ROOT="$ROOT"

if [[ ! -d .venv ]]; then
  echo "Missing backend/.venv — run ./scripts/dev.sh once first."
  exit 1
fi

# shellcheck disable=SC1091
source "$ROOT/.env" 2>/dev/null || true
# shellcheck source=scripts/lib/dev-env.sh
source "$ROOT/scripts/lib/dev-env.sh"

if ! dev_db_ready; then
  if dev_is_remote_db; then
    dev_start_tunnel
  else
    dev_start_local_db
  fi
fi

dev_assert_local_db_config
dev_sync_backend_env

.venv/bin/python "$ROOT/scripts/dev-open-reserve.py" "$@"
