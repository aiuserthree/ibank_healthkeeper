#!/usr/bin/env bash
# Microsoft 365 SMTP 연동 테스트 (로컬 backend/.env 또는 루트 .env 사용)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"

if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  source .env
elif [[ -f "$ROOT/.env" ]]; then
  # shellcheck disable=SC1091
  source "$ROOT/.env"
else
  echo "Missing .env"
  exit 1
fi

TO="${1:-}"
if [[ -z "$TO" ]]; then
  echo "Usage: $0 recipient@ibank.co.kr"
  exit 1
fi

if [[ -z "${SMTP_PASSWORD:-}" ]]; then
  echo "SMTP_PASSWORD is empty — set Microsoft 365 app password in .env first."
  exit 1
fi

.venv/bin/python - <<'PY'
import asyncio
import os
import sys

from app.models import MailMessage, MailStatus, MailType
from app.services.mail import send_smtp

to = sys.argv[1]
msg = MailMessage(
    id=0,
    type=MailType.EMAIL_VERIFY,
    to_email=to,
    subject="[헬스키퍼] SMTP 테스트",
    body=f"Microsoft 365 SMTP 테스트 메일입니다.\n수신: {to}\n발신: {os.environ.get('SMTP_FROM', '')}",
    status=MailStatus.PENDING,
)

async def main():
    await send_smtp(msg)
    print(f"OK: sent test mail to {to}")

asyncio.run(main())
PY
"$TO"
