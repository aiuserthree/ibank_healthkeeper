#!/usr/bin/env bash
# healthkeeper@ 발송 계정 refresh token 1회 발급
# (권장) Python 버전 — code 붙여넣기 불필요:
#   backend/.venv/bin/python scripts/obtain-teams-sender-token.py
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "Missing .env — copy from .env.example first."
  exit 1
fi

# shellcheck disable=SC1091
source .env

TENANT="${ENTRA_TENANT_ID:?ENTRA_TENANT_ID required}"
CLIENT="${ENTRA_CLIENT_ID:?ENTRA_CLIENT_ID required}"
SECRET="${ENTRA_CLIENT_SECRET:?ENTRA_CLIENT_SECRET required}"
REDIRECT="${ENTRA_REDIRECT_URI:-http://localhost:5173/api/auth/sso/callback}"
SCOPE="Chat.Create ChatMessage.Send offline_access"
SENDER="${TEAMS_SENDER_EMAIL:-healthkeeper@ibank.co.kr}"

ENCODED_SCOPE="${SCOPE// /%20}"
ENCODED_REDIRECT="$(python3 -c "import urllib.parse; print(urllib.parse.quote('''$REDIRECT''', safe=''))")"

AUTH_URL="https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize?client_id=${CLIENT}&response_type=code&redirect_uri=${ENCODED_REDIRECT}&response_mode=query&scope=${ENCODED_SCOPE}&login_hint=${SENDER}"

echo "=============================================="
echo " Teams 발송 계정 refresh token 발급"
echo "=============================================="
echo ""
echo "1) 아래 URL을 브라우저에서 엽니다."
echo "2) ${SENDER} 계정으로 로그인·동의합니다."
echo "3) 리다이렉트된 URL의 'code=' 뒤 값을 복사합니다."
echo ""
echo "$AUTH_URL"
echo ""
echo "※ URL 붙여넣은 뒤 반드시 Enter 키를 누르세요!"
read -r -p "authorization code: " CODE
echo "(입력 완료 — 처리 중...)"

if [[ -z "$CODE" ]]; then
  echo "code가 비어 있습니다."
  exit 1
fi

# URL 전체를 붙여넣은 경우 code= 만 추출
if [[ "$CODE" == *"code="* ]]; then
  CODE="$(python3 -c "import sys, urllib.parse; q=urllib.parse.urlparse(sys.argv[1].strip()).query; print(dict(urllib.parse.parse_qsl(q)).get('code',''))" "$CODE")"
fi

if [[ -z "$CODE" ]]; then
  echo "URL에서 code 값을 찾지 못했습니다."
  exit 1
fi

echo ""
echo "Microsoft에 토큰 교환 요청 중... (최대 30초)"
RESP="$(curl -4 -sS --connect-timeout 15 --max-time 30 -X POST "https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token" \
  -d "grant_type=authorization_code" \
  -d "client_id=${CLIENT}" \
  -d "client_secret=${SECRET}" \
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
echo "성공. .env에 아래를 추가하세요:"
echo ""
echo "TEAMS_SENDER_EMAIL=${SENDER}"
echo "TEAMS_SENDER_REFRESH_TOKEN=${REFRESH}"
echo ""
