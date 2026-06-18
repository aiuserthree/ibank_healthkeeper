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

HOST="${REMOTE_HOST:-115.68.221.73}"
DOMAIN="${APP_DOMAIN:-healthkeeper.ibank.co.kr}"
USER="${REMOTE_USER:-root}"
EMAIL="${CERTBOT_EMAIL:-}"

# docker compose용 NEO4J (루트 .env에 없으면 backend/.env에서 보충)
NEO4J_USER="${NEO4J_USER:-neo4j}"
NEO4J_PASSWORD="${NEO4J_PASSWORD:-}"
if [[ -z "$NEO4J_PASSWORD" && -f backend/.env ]]; then
  # shellcheck disable=SC1091
  source backend/.env
fi
NEO4J_PASSWORD="${NEO4J_PASSWORD:-CHANGE_ME}"

echo "==> Sync to $USER@$HOST"
rsync -avz --delete --exclude '.env' deploy/ "$USER@$HOST:/opt/healthkeeper/deploy/"
rsync -avz --delete \
  --exclude '.venv' --exclude '__pycache__' --exclude '.env' \
  backend/ "$USER@$HOST:/opt/healthkeeper/app/backend/"
rsync -avz --delete web/ "$USER@$HOST:/opt/healthkeeper/app/web/"

echo "==> Upload deploy/.env (docker compose)"
ssh "$USER@$HOST" "cat > /opt/healthkeeper/deploy/.env" <<DEPLOY_ENV
POSTGRES_USER=${POSTGRES_USER:-healthkeeper}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=${POSTGRES_DB:-healthkeeper}
REDIS_PASSWORD=${REDIS_PASSWORD}
NEO4J_USER=${NEO4J_USER}
NEO4J_PASSWORD=${NEO4J_PASSWORD}
SMTP_HOST=${SMTP_HOST:-localhost}
SMTP_PORT=${SMTP_PORT:-587}
SMTP_USER=${SMTP_USER:-}
SMTP_PASSWORD=${SMTP_PASSWORD:-}
SMTP_FROM=${SMTP_FROM:-noreply@healthkeeper.local}
SMTP_USE_TLS=${SMTP_USE_TLS:-true}
DEPLOY_ENV

echo "==> Remote setup"
ssh "$USER@$HOST" \
  "DOMAIN='${DOMAIN}' HOST='${HOST}' CERTBOT_EMAIL='${EMAIL}' SSO_PROVIDER='${SSO_PROVIDER:-mock}' ENTRA_TENANT_ID='${ENTRA_TENANT_ID:-}' ENTRA_CLIENT_ID='${ENTRA_CLIENT_ID:-}' ENTRA_CLIENT_SECRET='${ENTRA_CLIENT_SECRET:-}' SSO_ALLOWED_DOMAIN='${SSO_ALLOWED_DOMAIN:-}' SSO_SUCCESS_PATH='${SSO_SUCCESS_PATH:-/reserve}' SECRET_KEY='${SECRET_KEY}' ENABLE_NEO4J='${ENABLE_NEO4J:-false}' SMTP_HOST='${SMTP_HOST:-smtp.office365.com}' SMTP_PORT='${SMTP_PORT:-587}' SMTP_USER='${SMTP_USER:-}' SMTP_PASSWORD='${SMTP_PASSWORD:-}' SMTP_FROM='${SMTP_FROM:-}' SMTP_FROM_NAME='${SMTP_FROM_NAME:-헬스키퍼}' SMTP_USE_TLS='${SMTP_USE_TLS:-true}'" \
  bash -s <<'REMOTE'
set -euo pipefail
if [[ ! -f /opt/healthkeeper/deploy/.env ]]; then
  echo "ERROR: /opt/healthkeeper/deploy/.env missing — re-run deploy from local."
  exit 1
fi
source /opt/healthkeeper/deploy/.env

NGINX_DIR="/opt/healthkeeper/deploy/nginx"
CERT="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
SSL_DIR="/etc/healthkeeper/ssl"

cd /opt/healthkeeper/deploy
docker compose up -d postgres redis
if [[ "${ENABLE_NEO4J}" == "true" ]]; then
  docker compose --profile neo4j up -d neo4j 2>/dev/null || echo "INFO: neo4j skipped (optional, Docker Hub unreachable)"
fi

mkdir -p /var/www/certbot

# Let's Encrypt 시도 (서버 외부망 차단 시 실패 가능)
if [[ ! -f "$CERT" && -n "${CERTBOT_EMAIL}" ]]; then
  if ! command -v certbot &>/dev/null; then
    apt-get update -qq 2>/dev/null || true
    apt-get install -y -qq certbot 2>/dev/null || echo "WARN: certbot install skipped"
  fi
  if command -v certbot &>/dev/null; then
    cp "$NGINX_DIR/healthkeeper.bootstrap.conf" /etc/nginx/sites-available/healthkeeper
    ln -sf /etc/nginx/sites-available/healthkeeper /etc/nginx/sites-enabled/healthkeeper
    rm -f /etc/nginx/sites-enabled/default
    nginx -t && systemctl reload nginx
    echo "==> Requesting Let's Encrypt certificate for ${DOMAIN}"
    certbot certonly --webroot -w /var/www/certbot -d "${DOMAIN}" \
      --email "${CERTBOT_EMAIL}" --agree-tos --non-interactive --no-eff-email \
      2>/dev/null || echo "WARN: Let's Encrypt failed (outbound blocked?) — self-signed fallback"
  fi
fi

# LE 실패 시 자체 서명 인증서로 HTTPS 활성화
bash /opt/healthkeeper/deploy/ssl/prepare-cert.sh "${DOMAIN}" "${SSL_DIR}"
if [[ -f "$CERT" ]]; then
  echo "SSL: Let's Encrypt"
else
  echo "SSL: self-signed (사내 CA 인증서는 ${SSL_DIR}/ 에 fullchain.pem, privkey.pem 업로드)"
fi

cp "$NGINX_DIR/healthkeeper.conf" /etc/nginx/sites-available/healthkeeper
ln -sf /etc/nginx/sites-available/healthkeeper /etc/nginx/sites-enabled/healthkeeper
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

if [[ -f "$CERT" ]] && systemctl list-unit-files certbot.timer &>/dev/null; then
  systemctl enable certbot.timer 2>/dev/null || true
  systemctl start certbot.timer 2>/dev/null || true
fi

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
if [[ ! -d .venv ]]; then
  python3 -m venv .venv
fi
if .venv/bin/pip install -q -r requirements.txt; then
  echo "pip install OK"
elif .venv/bin/python -c "import fastapi, uvicorn, asyncpg, redis" 2>/dev/null; then
  echo "WARN: pip install failed (network?) — using existing venv"
else
  echo "ERROR: pip install failed and venv is incomplete. Fix server outbound network or install wheels offline."
  exit 1
fi
.venv/bin/alembic upgrade head

cp /opt/healthkeeper/deploy/systemd/healthkeeper-api.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable healthkeeper-api
systemctl restart healthkeeper-api

echo "Deploy complete: ${BASE_URL}/"
echo "Health check: ${BASE_URL}/api/health"
echo "Direct IP   : http://${HOST}/"
REMOTE
