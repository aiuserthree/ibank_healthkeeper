#!/usr/bin/env bash
# 원격 DB에 Alembic 마이그레이션 적용 (SSH 터널 필요)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"

if [[ ! -d .venv ]]; then
  python3 -m venv .venv
  .venv/bin/pip install -q -r requirements.txt
fi

if ! nc -z 127.0.0.1 15432 2>/dev/null; then
  echo "SSH tunnel not active. Run: ./scripts/dev-tunnel.sh"
  exit 1
fi

grep -E '^(DATABASE_URL|REDIS_URL|NEO4J_|SECRET_KEY|DEBUG|API_PORT|SMTP_|APP_BASE_URL)=' "$ROOT/.env" 2>/dev/null | while IFS= read -r line; do
  key="${line%%=*}"
  if grep -q "^${key}=" .env 2>/dev/null; then
    sed -i '' "s|^${key}=.*|${line}|" .env 2>/dev/null || sed -i "s|^${key}=.*|${line}|" .env
  else
    echo "$line" >> .env
  fi
done

.venv/bin/alembic upgrade head
echo "Migration complete."
