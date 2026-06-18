#!/usr/bin/env bash
# 로컬 테스트용 예약 OPEN + 신청 데이터 초기화 (원격 DB SSH 터널 필요)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"

if [[ ! -d .venv ]]; then
  echo "Missing backend/.venv — run ./scripts/dev.sh once first."
  exit 1
fi

# shellcheck disable=SC1091
source "$ROOT/.env" 2>/dev/null || true
REMOTE_HOST="${REMOTE_HOST:-115.68.221.73}"
REMOTE_USER="${REMOTE_USER:-root}"

if ! nc -z 127.0.0.1 15432 2>/dev/null; then
  echo "Starting SSH tunnel to ${REMOTE_USER}@${REMOTE_HOST} ..."
  ssh -f -N \
    -L 15432:127.0.0.1:5432 \
    -L 16379:127.0.0.1:6379 \
    "${REMOTE_USER}@${REMOTE_HOST}"
  sleep 1
fi

if ! nc -z 127.0.0.1 15432 2>/dev/null; then
  echo "PostgreSQL tunnel failed — check SSH access."
  exit 1
fi

.venv/bin/python "$ROOT/scripts/dev-open-reserve.py" "$@"
