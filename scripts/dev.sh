#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "Missing .env — copy .env.example and set passwords."
  exit 1
fi

# shellcheck disable=SC1091
source .env

echo "[1/3] Starting SSH tunnel (background)..."
pkill -f "ssh -N -L 15432:127.0.0.1:5432" 2>/dev/null || true
if ! ssh -f -N \
  -L 15432:127.0.0.1:5432 \
  -L 16379:127.0.0.1:6379 \
  -L 17687:127.0.0.1:7687 \
  -L 17474:127.0.0.1:7474 \
  "${REMOTE_USER:-root}@${REMOTE_HOST:-115.68.221.73}"; then
  echo "ERROR: SSH tunnel failed — Teams 로그인(SSO)에 Redis(16379)가 필요합니다."
  echo "       서버 SSH 비밀번호를 확인하고 다시 실행하세요."
  exit 1
fi
sleep 1
if ! nc -z 127.0.0.1 15432 2>/dev/null || ! nc -z 127.0.0.1 16379 2>/dev/null; then
  echo "ERROR: SSH tunnel ports not open (15432/16379)."
  echo "       ./scripts/dev-tunnel.sh 를 다른 터미널에서 먼저 실행하거나 dev.sh 를 재시작하세요."
  exit 1
fi
echo "       Tunnel OK (PostgreSQL :15432, Redis :16379)"

echo "[2/3] FastAPI (port ${API_PORT:-8100})..."
cd backend
if [[ ! -d .venv ]]; then
  python3 -m venv .venv
  .venv/bin/pip install -q -r requirements.txt
fi
cp -n .env.example .env 2>/dev/null || true
# sync root .env DB urls into backend/.env
grep -E '^(DATABASE_URL|REDIS_URL|NEO4J_URI|NEO4J_USER|NEO4J_PASSWORD|SECRET_KEY|DEBUG|API_PORT|SMTP_|APP_BASE_URL|SSO_PROVIDER|ENTRA_TENANT_ID|ENTRA_CLIENT_ID|ENTRA_CLIENT_SECRET|ENTRA_REDIRECT_URI|SSO_ALLOWED_DOMAIN|SSO_SUCCESS_PATH)=' "$ROOT/.env" > .env.local.tmp 2>/dev/null || true
if [[ -s .env.local.tmp ]]; then
  while IFS= read -r line; do
    key="${line%%=*}"
    sed -i '' "s|^${key}=.*|${line}|" .env 2>/dev/null || sed -i "s|^${key}=.*|${line}|" .env
  done < .env.local.tmp
  rm -f .env.local.tmp
fi

echo "       Applying DB migrations..."
.venv/bin/alembic upgrade head

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
echo "  Tunnel   : localhost:15432 / :16379 / :17687 -> remote"
if [[ "${SSO_PROVIDER:-mock}" == "entra" ]]; then
  echo "  SSO      : Microsoft Entra (redirect: ${ENTRA_REDIRECT_URI:-http://localhost:5173/api/auth/sso/callback})"
  echo "             status: http://localhost:${API_PORT:-8100}/api/auth/sso/status"
else
  echo "  SSO      : mock — real Teams test: set SSO_PROVIDER=entra in .env (see docs/setup/sso-local.md)"
fi
echo ""
echo "Stop: kill $API_PID $VITE_PID && pkill -f 'ssh -N -L 15432'"

wait
