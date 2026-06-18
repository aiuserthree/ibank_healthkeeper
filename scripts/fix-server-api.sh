#!/usr/bin/env bash
# 원격 API(.env) 복구 + 마이그레이션 + 서비스 재시작 (DB 연결 설정 오류 수정용)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
source .env

HOST="${REMOTE_HOST:-115.68.221.73}"
DOMAIN="${APP_DOMAIN:-healthkeeper.ibank.co.kr}"
USER="${REMOTE_USER:-root}"

ssh "$USER@$HOST" \
  "DOMAIN='${DOMAIN}' HOST='${HOST}' SSO_PROVIDER='${SSO_PROVIDER:-mock}' ENTRA_TENANT_ID='${ENTRA_TENANT_ID:-}' ENTRA_CLIENT_ID='${ENTRA_CLIENT_ID:-}' ENTRA_CLIENT_SECRET='${ENTRA_CLIENT_SECRET:-}' SSO_ALLOWED_DOMAIN='${SSO_ALLOWED_DOMAIN:-}' SSO_SUCCESS_PATH='${SSO_SUCCESS_PATH:-/reserve}' SECRET_KEY='${SECRET_KEY}' SMTP_HOST='${SMTP_HOST:-smtp.office365.com}' SMTP_PORT='${SMTP_PORT:-587}' SMTP_USER='${SMTP_USER:-}' SMTP_PASSWORD='${SMTP_PASSWORD:-}' SMTP_FROM='${SMTP_FROM:-}' SMTP_FROM_NAME='${SMTP_FROM_NAME:-헬스키퍼}' SMTP_USE_TLS='${SMTP_USE_TLS:-true}'" \
  bash -s <<'REMOTE'
set -euo pipefail
source /opt/healthkeeper/deploy/.env

SCHEME=https
BASE_URL="${SCHEME}://${DOMAIN}"

cat > /opt/healthkeeper/app/backend/.env <<EOF
DATABASE_URL=postgresql+asyncpg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:5432/${POSTGRES_DB}
REDIS_URL=redis://:${REDIS_PASSWORD}@127.0.0.1:6379/0
NEO4J_URI=bolt://127.0.0.1:7687
NEO4J_USER=${NEO4J_USER:-neo4j}
NEO4J_PASSWORD=${NEO4J_PASSWORD}
SECRET_KEY=${SECRET_KEY}
DEBUG=false
APP_BASE_URL=${BASE_URL}
CORS_ORIGINS=["${BASE_URL}","http://${HOST}","http://localhost:5173"]
SSO_PROVIDER=${SSO_PROVIDER}
ENTRA_TENANT_ID=${ENTRA_TENANT_ID}
ENTRA_CLIENT_ID=${ENTRA_CLIENT_ID}
ENTRA_CLIENT_SECRET=${ENTRA_CLIENT_SECRET}
ENTRA_REDIRECT_URI=${BASE_URL}/api/auth/sso/callback
SSO_ALLOWED_DOMAIN=${SSO_ALLOWED_DOMAIN}
SSO_SUCCESS_PATH=${SSO_SUCCESS_PATH}
SMTP_HOST=${SMTP_HOST:-smtp.office365.com}
SMTP_PORT=${SMTP_PORT:-587}
SMTP_USER=${SMTP_USER:-healthkeeper@ibank.co.kr}
SMTP_PASSWORD=${SMTP_PASSWORD:-}
SMTP_FROM=${SMTP_FROM:-healthkeeper@ibank.co.kr}
SMTP_FROM_NAME=${SMTP_FROM_NAME:-헬스키퍼}
SMTP_USE_TLS=${SMTP_USE_TLS:-true}
EOF

cd /opt/healthkeeper/app/backend
.venv/bin/alembic upgrade head
systemctl restart healthkeeper-api
sleep 2
systemctl is-active --quiet healthkeeper-api
echo "API restarted OK"
REMOTE

echo "Done. Check: https://${DOMAIN}/api/health"
