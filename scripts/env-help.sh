#!/usr/bin/env bash
# 로컬 개발 환경 안내 (PostgreSQL/Redis는 원격 전용)
set -euo pipefail

cat <<'EOF'
헬스키퍼 개발 환경
==================

아키텍처
  로컬  : Vite(5173) + FastAPI(8100)
  원격  : nginx + API + PostgreSQL(pgvector) + Redis  @ healthkeeper.ibank.co.kr (115.68.221.73)

로컬 개발 시작
  1. .env.example → .env 복사 (이미 생성됨)
  2. 터미널 1: ./scripts/dev-tunnel.sh   # 원격 DB/Redis SSH 터널
  3. 터미널 2: cd backend && .venv/bin/python run.py
  4. 터미널 3: cd frontend && npm run dev

  또는: ./scripts/dev.sh (터널+API+Vite 일괄)

원격 배포
  ./scripts/deploy.sh

헬스체크
  로컬 API : http://localhost:8100/api/health
  원격     : https://healthkeeper.ibank.co.kr/api/health
  원격 웹  : https://healthkeeper.ibank.co.kr/

주의: PostgreSQL·Redis·pgvector는 로컬에 설치하지 않습니다.
EOF
