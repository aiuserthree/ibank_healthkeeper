#!/usr/bin/env bash
# .env → 서버 개발 DB (healthkeeper_dev) + SSH 터널 — Docker 불필요, 운영 DB와 분리
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing .env"
  exit 1
fi

# shellcheck disable=SC1091
source "$ENV_FILE"

PG_USER="${POSTGRES_USER:-healthkeeper}"
PG_PASS="${POSTGRES_PASSWORD:-}"
REDIS_PASS="${REDIS_PASSWORD:-}"
DEV_DB="${DEV_POSTGRES_DB:-healthkeeper_dev}"
DEV_REDIS="${DEV_REDIS_DB:-1}"

if [[ -z "$PG_PASS" || -z "$REDIS_PASS" ]]; then
  echo "ERROR: POSTGRES_PASSWORD and REDIS_PASSWORD must be set in .env (deploy용 값)"
  exit 1
fi

upsert() {
  local key="$1"
  shift
  local val="$*"
  if grep -q "^${key}=" "$ENV_FILE"; then
    python3 - "$ENV_FILE" "$key" "$val" <<'PY'
import sys
path, key, val = sys.argv[1], sys.argv[2], sys.argv[3]
lines = open(path).read().splitlines()
out = []
found = False
for line in lines:
    if line.startswith(key + "="):
        out.append(f"{key}={val}")
        found = True
    else:
        out.append(line)
if not found:
    out.append(f"{key}={val}")
open(path, "w").write("\n".join(out) + "\n")
PY
  else
    echo "${key}=${val}" >> "$ENV_FILE"
  fi
}

upsert DEV_DB_MODE remote-dev
upsert USE_REMOTE_DB 0
upsert DEV_POSTGRES_DB "$DEV_DB"
upsert DEV_REDIS_DB "$DEV_REDIS"
upsert DATABASE_URL "postgresql+asyncpg://${PG_USER}:${PG_PASS}@127.0.0.1:15432/${DEV_DB}"
upsert REDIS_URL "redis://:${REDIS_PASS}@127.0.0.1:16379/${DEV_REDIS}"

echo "Done. .env → server dev DB (${DEV_DB}), Redis db ${DEV_REDIS}"
echo "First time on server: ./scripts/setup-server-dev-db.sh"
echo "Then: ./scripts/dev.sh"
