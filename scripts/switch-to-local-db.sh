#!/usr/bin/env bash
# .env 를 로컬 Docker DB 설정으로 전환 (운영 DB 터널 해제)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing .env — run: cp .env.example .env"
  exit 1
fi

set_kv() {
  local key="$1" val="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i '' "s|^${key}=.*|${key}=${val}|" "$ENV_FILE" 2>/dev/null \
      || sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
  else
    echo "${key}=${val}" >> "$ENV_FILE"
  fi
}

set_kv USE_REMOTE_DB 0
set_kv DEV_DB_MODE local
set_kv LOCAL_POSTGRES_PASSWORD localdev
set_kv LOCAL_REDIS_PASSWORD localdev
set_kv DATABASE_URL 'postgresql+asyncpg://healthkeeper:localdev@127.0.0.1:54321/healthkeeper'
set_kv REDIS_URL 'redis://:localdev@127.0.0.1:63791/0'

pkill -f "ssh -N -L 15432:127.0.0.1:5432" 2>/dev/null || true

echo "Done. .env now points to local Docker DB (54321/63791)."
echo "Run: ./scripts/dev.sh"
