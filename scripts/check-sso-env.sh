#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${1:-$ROOT/.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

echo "=== SSO 환경 변수 ==="
echo "SSO_PROVIDER=${SSO_PROVIDER:-mock}"
echo "APP_BASE_URL=${APP_BASE_URL:-http://localhost:5173}"
echo "ENTRA_REDIRECT_URI=${ENTRA_REDIRECT_URI:-http://localhost:5173/api/auth/sso/callback}"
echo "SSO_ALLOWED_DOMAIN=${SSO_ALLOWED_DOMAIN:-(제한 없음)}"
echo ""

if [[ "${SSO_PROVIDER:-mock}" != "entra" ]]; then
  echo "현재 mock 모드입니다. 실제 Teams SSO 테스트:"
  echo "  1. Azure 앱 등록 (docs/setup/sso-local.md)"
  echo "  2. .env 에 ENTRA_* 값 입력"
  echo "  3. SSO_PROVIDER=entra"
  exit 0
fi

missing=()
[[ -z "${ENTRA_TENANT_ID:-}" ]] && missing+=("ENTRA_TENANT_ID")
[[ -z "${ENTRA_CLIENT_ID:-}" ]] && missing+=("ENTRA_CLIENT_ID")
[[ -z "${ENTRA_CLIENT_SECRET:-}" ]] && missing+=("ENTRA_CLIENT_SECRET")

if ((${#missing[@]})); then
  echo "❌ 누락: ${missing[*]}"
  echo "   docs/setup/sso-local.md 참고"
  exit 1
fi

echo "✅ Entra 필수 값이 모두 설정되어 있습니다."
echo ""
echo "Azure 앱 등록 Redirect URI:"
echo "  ${ENTRA_REDIRECT_URI:-http://localhost:5173/api/auth/sso/callback}"
echo ""
echo "서버 실행 후 확인:"
echo "  curl -s http://localhost:8100/api/auth/sso/status"
