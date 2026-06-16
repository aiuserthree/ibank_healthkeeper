#!/usr/bin/env bash
# 원격 PostgreSQL(5432)·Redis(6379) SSH 터널
# 로컬에서 DB/Redis를 설치하지 않고 원격에 접속할 때 사용
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=/dev/null
source "$ROOT/.env" 2>/dev/null || true

HOST="${REMOTE_HOST:-115.68.221.73}"
USER="${REMOTE_USER:-root}"

echo "Opening SSH tunnel to $USER@$HOST"
echo "  localhost:15432 -> remote PostgreSQL"
echo "  localhost:16379 -> remote Redis"
echo "  localhost:17687 -> remote Neo4j (bolt)"
echo "  localhost:17474 -> remote Neo4j (browser)"
echo "Press Ctrl+C to close."

exec ssh -N \
  -L 15432:127.0.0.1:5432 \
  -L 16379:127.0.0.1:6379 \
  -L 17687:127.0.0.1:7687 \
  -L 17474:127.0.0.1:7474 \
  "$USER@$HOST"
