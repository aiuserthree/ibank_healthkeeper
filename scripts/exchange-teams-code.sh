#!/usr/bin/env bash
# 브라우저 주소창 URL(또는 code 값) → refresh token 교환
# 사용: ./scripts/exchange-teams-code.sh 'http://localhost:5173/api/auth/sso/callback?code=...'
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# shellcheck disable=SC1091
source .env

INPUT="${1:-}"
if [[ -z "$INPUT" ]]; then
  echo "Usage: $0 '<browser URL or code>'"
  exit 1
fi

CODE="$INPUT"
if [[ "$CODE" == *"code="* ]]; then
  CODE="$(python3 -c "import sys, urllib.parse; q=urllib.parse.urlparse(sys.argv[1].strip()).query; print(dict(urllib.parse.parse_qsl(q)).get('code',''))" "$CODE")"
fi

if [[ -z "$CODE" ]]; then
  echo "code를 찾지 못했습니다."
  exit 1
fi

REDIRECT="${ENTRA_REDIRECT_URI:-http://localhost:5173/api/auth/sso/callback}"
SCOPE="Chat.Create ChatMessage.Send offline_access"
SENDER="${TEAMS_SENDER_EMAIL:-healthkeeper@ibank.co.kr}"

echo "Microsoft에 토큰 교환 요청 중..."
RESP="$(curl -4 -sS --connect-timeout 15 --max-time 30 -X POST \
  "https://login.microsoftonline.com/${ENTRA_TENANT_ID}/oauth2/v2.0/token" \
  -d "grant_type=authorization_code" \
  -d "client_id=${ENTRA_CLIENT_ID}" \
  -d "client_secret=${ENTRA_CLIENT_SECRET}" \
  -d "code=${CODE}" \
  -d "redirect_uri=${REDIRECT}" \
  -d "scope=${SCOPE}")"

REFRESH="$(python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('refresh_token',''))" <<<"$RESP")"

if [[ -z "$REFRESH" ]]; then
  echo "토큰 교환 실패:"
  echo "$RESP" | python3 -m json.tool 2>/dev/null || echo "$RESP"
  exit 1
fi

echo ""
echo "성공. .env에 추가:"
echo ""
echo "TEAMS_SENDER_EMAIL=${SENDER}"
echo "TEAMS_SENDER_REFRESH_TOKEN=${REFRESH}"
echo ""
