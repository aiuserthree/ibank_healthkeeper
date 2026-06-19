#!/usr/bin/env bash
# ⚠️  운영 PostgreSQL/Redis SSH 터널 (비권장)
# 로컬 개발은 ./scripts/dev.sh (로컬 Docker DB) 를 사용하세요.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=/dev/null
source "$ROOT/.env" 2>/dev/null || true

HOST="${REMOTE_HOST:-115.68.221.73}"
USER="${REMOTE_USER:-root}"

cat <<EOF

⚠️  운영 서버 DB 터널 ($HOST)
    로컬에서 수정한 내용이 운영 DB에 바로 반영됩니다.
    일반 개발: USE_REMOTE_DB=0 + ./scripts/dev.sh

EOF

echo "Opening SSH tunnel to $USER@$HOST"
echo "  localhost:15432 -> remote PostgreSQL"
echo "  localhost:16379 -> remote Redis"
echo "Press Ctrl+C to close."

exec ssh -N \
  -L 15432:127.0.0.1:5432 \
  -L 16379:127.0.0.1:6379 \
  -L 17687:127.0.0.1:7687 \
  -L 17474:127.0.0.1:7474 \
  "$USER@$HOST"
