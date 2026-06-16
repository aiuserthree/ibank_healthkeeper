#!/usr/bin/env bash
# 로컬/원격 API 헬스체크 (4 DB)
set -euo pipefail
BASE="${1:-http://127.0.0.1:8100}"
echo "GET $BASE/api/health"
curl -sf "$BASE/api/health" | python3 -m json.tool
