#!/usr/bin/env bash
# 원격 서버 SSL 준비 (Let's Encrypt 또는 자체 서명)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
source .env

HOST="${REMOTE_HOST:-115.68.221.73}"
DOMAIN="${APP_DOMAIN:-healthkeeper.ibank.co.kr}"
USER="${REMOTE_USER:-root}"
EMAIL="${CERTBOT_EMAIL:-}"

ssh "$USER@$HOST" "DOMAIN='$DOMAIN' CERTBOT_EMAIL='$EMAIL'" bash -s <<'REMOTE'
set -euo pipefail
NGINX_DIR="/opt/healthkeeper/deploy/nginx"
CERT="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
SSL_DIR="/etc/healthkeeper/ssl"

mkdir -p /var/www/certbot

if [[ ! -f "$CERT" && -n "${CERTBOT_EMAIL}" ]] && command -v certbot &>/dev/null; then
  cp "$NGINX_DIR/healthkeeper.bootstrap.conf" /etc/nginx/sites-available/healthkeeper
  ln -sf /etc/nginx/sites-available/healthkeeper /etc/nginx/sites-enabled/healthkeeper
  nginx -t && systemctl reload nginx
  certbot certonly --webroot -w /var/www/certbot -d "${DOMAIN}" \
    --email "${CERTBOT_EMAIL}" --agree-tos --non-interactive --no-eff-email \
    2>/dev/null || echo "WARN: Let's Encrypt failed — self-signed fallback"
fi

bash /opt/healthkeeper/deploy/ssl/prepare-cert.sh "${DOMAIN}" "${SSL_DIR}"
cp "$NGINX_DIR/healthkeeper.conf" /etc/nginx/sites-available/healthkeeper
ln -sf /etc/nginx/sites-available/healthkeeper /etc/nginx/sites-enabled/healthkeeper
nginx -t && systemctl reload nginx
echo "SSL ready: https://${DOMAIN}/"
REMOTE
