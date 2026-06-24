#!/usr/bin/env bash
# 운영 DB(healthkeeper) — 활성 주차 신청 데이터만 초기화 (슬롯·주차 일정·회원 계정 유지)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"
export DEV_ENV_ROOT="$ROOT"

if [[ ! -f "$ROOT/.env" ]]; then
  echo "Missing .env"
  exit 1
fi

# shellcheck disable=SC1091
source "$ROOT/.env"

PG_USER="${POSTGRES_USER:-healthkeeper}"
PG_PASS="${POSTGRES_PASSWORD:-}"
PROD_DB="${POSTGRES_DB:-healthkeeper}"

if [[ -z "$PG_PASS" ]]; then
  echo "ERROR: POSTGRES_PASSWORD 가 .env 에 없습니다."
  exit 1
fi

if [[ "${1:-}" != "--yes" ]]; then
  echo ""
  echo "⚠️  운영 DB (${PROD_DB}) 의 활성 주차 신청 데이터를 삭제합니다."
  echo "    · 예약(신청/확정/탈락) 레코드 삭제"
  echo "    · 해당 주차 슬롯 상태 OPEN 으로 복구"
  echo "    · 회원 마지막 이용일 재계산"
  echo "    · healthkeeper_dev(개발 DB)는 건드리지 않습니다."
  echo ""
  read -r -p "계속하시겠습니까? [y/N] " ans
  if [[ "${ans,,}" != "y" && "${ans,,}" != "yes" ]]; then
    echo "취소되었습니다."
    exit 0
  fi
fi

if [[ ! -d .venv ]]; then
  echo "Missing backend/.venv"
  exit 1
fi

# shellcheck source=scripts/lib/dev-env.sh
source "$ROOT/scripts/lib/dev-env.sh"

if ! nc -z 127.0.0.1 15432 2>/dev/null; then
  echo "==> SSH tunnel to ${REMOTE_USER:-root}@${REMOTE_HOST:-115.68.221.73}"
  dev_start_tunnel
fi

export DATABASE_URL="postgresql+asyncpg://${PG_USER}:${PG_PASS}@127.0.0.1:15432/${PROD_DB}"
export REDIS_URL="${REDIS_URL:-redis://:dummy@127.0.0.1:16379/0}"

echo "[db] 운영 DB → ${PROD_DB} @ 127.0.0.1:15432"
.venv/bin/python "$ROOT/scripts/dev-open-reserve.py" --reset-only
