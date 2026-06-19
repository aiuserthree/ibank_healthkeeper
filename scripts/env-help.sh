#!/usr/bin/env bash
set -euo pipefail

cat <<'EOF'
헬스키퍼 개발 환경
==================

★ 서버 개발 DB (Docker 없음, 운영과 분리) — 권장
  1. .env 에 POSTGRES_PASSWORD / REDIS_PASSWORD (deploy용) 설정
  2. ./scripts/setup-server-dev-db.sh   # 서버에 healthkeeper_dev 최초 1회
  3. ./scripts/switch-to-remote-dev-db.sh
  4. ./scripts/dev.sh

  → 같은 서버 Postgres, DB 이름만 healthkeeper_dev (운영 healthkeeper 와 분리)
  → Redis는 db index 1 사용 (운영은 0)

로컬 Docker DB
  ./scripts/switch-to-local-db.sh && ./scripts/dev.sh

운영 배포 (코드 + 운영 DB 마이그레이션)
  ./scripts/deploy.sh
EOF
