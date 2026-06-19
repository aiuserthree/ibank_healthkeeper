#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export DEV_ENV_ROOT="$ROOT"

if [[ ! -f .env ]]; then
  echo "Missing .env — copy .env.example and set passwords."
  exit 1
fi

# shellcheck disable=SC1091
source .env
# shellcheck source=scripts/lib/dev-env.sh
source "$ROOT/scripts/lib/dev-env.sh"

echo "[1/3] Database ..."
dev_start_db

echo "[2/3] FastAPI (port ${API_PORT:-8100})..."
cd backend
if [[ ! -d .venv ]]; then
  python3 -m venv .venv
  .venv/bin/pip install -q -r requirements.txt
fi
cp -n .env.example .env 2>/dev/null || true
dev_sync_backend_env

echo "       Applying DB migrations..."
.venv/bin/alembic upgrade head

if ! dev_is_remote_prod; then
  echo "       Seeding dev cycles..."
  .venv/bin/python "$ROOT/scripts/dev-seed.py" || true
fi

.venv/bin/python run.py &
API_PID=$!

echo "[3/3] Vite (port 5173)..."
cd "$ROOT/frontend"
npm install --silent
npm run dev &
VITE_PID=$!

echo ""
echo "Dev servers running:"
echo "  Frontend : http://localhost:5173"
echo "  API      : http://localhost:${API_PORT:-8100}/api/health"
if dev_is_remote_prod; then
  echo "  Database : REMOTE production via SSH :15432"
elif dev_is_remote_dev; then
  echo "  Database : REMOTE dev ($(dev_dev_db_name)) via SSH :15432 — 운영 DB와 분리"
else
  echo "  Database : LOCAL Docker :54321 / Redis :63791"
fi
if [[ "${SSO_PROVIDER:-mock}" == "entra" ]]; then
  echo "  SSO      : Microsoft Entra (redirect: ${ENTRA_REDIRECT_URI:-http://localhost:5173/api/auth/sso/callback})"
else
  echo "  SSO      : mock"
fi
echo ""
echo "운영 반영: ./scripts/deploy.sh 실행 시에만 코드·DB 마이그레이션이 서버에 적용됩니다."
echo "Stop: kill $API_PID $VITE_PID"
if dev_is_remote_db; then
  echo "      pkill -f 'ssh -N -L 15432'"
else
  echo "      ./scripts/dev-local-db.sh down  # optional — DB 컨테이너 종료"
fi

wait
