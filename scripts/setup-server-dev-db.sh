#!/usr/bin/env bash
# 서버 PostgreSQL에 healthkeeper_dev DB 생성 + 마이그레이션 (최초 1회)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "Missing .env"
  exit 1
fi

# shellcheck disable=SC1091
source .env

HOST="${REMOTE_HOST:-115.68.221.73}"
USER="${REMOTE_USER:-root}"
DEV_DB="${DEV_POSTGRES_DB:-healthkeeper_dev}"
PG_USER="${POSTGRES_USER:-healthkeeper}"
PG_PASS="${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD in .env (운영 DB 비밀번호 — dev DB 접속에도 동일)}"

echo "==> Create dev database on $HOST ($DEV_DB)"
ssh "$USER@$HOST" \
  "DEV_DB='$DEV_DB' PG_USER='$PG_USER' PG_PASS='$PG_PASS'" \
  bash -s <<'REMOTE'
set -euo pipefail
source /opt/healthkeeper/deploy/.env

exists=$(docker exec healthkeeper-postgres psql -U "$POSTGRES_USER" -d postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname='${DEV_DB}'")
if [[ "$exists" != "1" ]]; then
  docker exec healthkeeper-postgres psql -U "$POSTGRES_USER" -d postgres -c \
    "CREATE DATABASE \"${DEV_DB}\" OWNER \"${POSTGRES_USER}\";"
  echo "Created database ${DEV_DB}"
else
  echo "Database ${DEV_DB} already exists"
fi

DEV_URL="postgresql+asyncpg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:5432/${DEV_DB}"
cd /opt/healthkeeper/app/backend
if [[ ! -d .venv ]]; then
  python3 -m venv .venv
  .venv/bin/pip install -q -r requirements.txt
fi
DATABASE_URL="$DEV_URL" .venv/bin/alembic upgrade head
echo "Migrations applied to ${DEV_DB}"
REMOTE

echo ""
echo "Done. Local dev setup:"
echo "  ./scripts/switch-to-remote-dev-db.sh"
echo "  ./scripts/dev.sh"
