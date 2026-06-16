#!/usr/bin/env bash
# nginx용 SSL 인증서 준비 (Let's Encrypt 실패 시 자체 서명 폴백)
set -euo pipefail

DOMAIN="${1:?domain required}"
SSL_DIR="${2:-/etc/healthkeeper/ssl}"
LE_CERT="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
LE_KEY="/etc/letsencrypt/live/${DOMAIN}/privkey.pem"

mkdir -p "$SSL_DIR"
chmod 755 "$SSL_DIR"

if [[ -f "$LE_CERT" && -f "$LE_KEY" ]]; then
  echo "Using Let's Encrypt certificate"
  cp -L "$LE_CERT" "$SSL_DIR/fullchain.pem"
  cp -L "$LE_KEY" "$SSL_DIR/privkey.pem"
elif [[ -f "$SSL_DIR/fullchain.pem" && -f "$SSL_DIR/privkey.pem" ]]; then
  echo "Using existing certificate in ${SSL_DIR}"
else
  echo "Generating self-signed certificate for ${DOMAIN} (internal use)"
  openssl req -x509 -nodes -days 825 -newkey rsa:2048 \
    -keyout "$SSL_DIR/privkey.pem" \
    -out "$SSL_DIR/fullchain.pem" \
    -subj "/CN=${DOMAIN}" \
    -addext "subjectAltName=DNS:${DOMAIN}"
fi

chmod 644 "$SSL_DIR/fullchain.pem"
chmod 600 "$SSL_DIR/privkey.pem"
