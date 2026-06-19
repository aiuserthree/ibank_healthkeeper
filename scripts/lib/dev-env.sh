#!/usr/bin/env bash
# 로컬 개발 DB 공통 헬퍼
# DEV_DB_MODE: local | remote-dev | remote-prod
set -euo pipefail

: "${DEV_ENV_ROOT:?Set DEV_ENV_ROOT before sourcing dev-env.sh}"

dev_db_mode() {
  if [[ "${USE_REMOTE_DB:-0}" == "1" ]]; then
    echo "remote-prod"
    return
  fi
  echo "${DEV_DB_MODE:-local}"
}

dev_is_remote_db() {
  [[ "$(dev_db_mode)" == remote-* ]]
}

dev_is_remote_dev() {
  [[ "$(dev_db_mode)" == "remote-dev" ]]
}

dev_is_remote_prod() {
  [[ "$(dev_db_mode)" == "remote-prod" ]]
}

dev_postgres_port() {
  case "$(dev_db_mode)" in
    local) echo 54321 ;;
    remote-*) echo 15432 ;;
  esac
}

dev_redis_port() {
  case "$(dev_db_mode)" in
    local) echo 63791 ;;
    remote-*) echo 16379 ;;
  esac
}

dev_prod_db_name() {
  echo "${POSTGRES_DB:-healthkeeper}"
}

dev_dev_db_name() {
  echo "${DEV_POSTGRES_DB:-healthkeeper_dev}"
}

dev_assert_db_config() {
  local mode url db_name prod_db dev_db
  mode="$(dev_db_mode)"
  url="${DATABASE_URL:-}"
  prod_db="$(dev_prod_db_name)"
  dev_db="$(dev_dev_db_name)"

  case "$mode" in
    remote-prod)
      echo ""
      echo "⚠️  DEV_DB_MODE=remote-prod — 운영 DB(${prod_db})에 직접 연결됩니다."
      echo "    로컬 변경이 곧바로 production에 반영됩니다."
      echo ""
      ;;
    remote-dev)
      if [[ "$url" != *"/${dev_db}"* ]]; then
        cat <<EOF
ERROR: remote-dev 모드인데 DATABASE_URL 이 ${dev_db} 가 아닙니다.

  ./scripts/switch-to-remote-dev-db.sh
  또는 DATABASE_URL=...@127.0.0.1:15432/${dev_db}
EOF
        exit 1
      fi
      echo "[db] SSH tunnel → server dev DB (${dev_db}), 운영 ${prod_db} 와 분리"
      ;;
    local)
      if [[ "$url" == *":15432"* ]] || [[ "$url" == *"/${prod_db}"* && "$url" != *"${dev_db}"* ]]; then
        cat <<EOF
ERROR: local 모드인데 DATABASE_URL 이 운영 DB를 가리킵니다.

  Docker: ./scripts/switch-to-local-db.sh
  서버 dev DB (Docker 없음): ./scripts/switch-to-remote-dev-db.sh
EOF
        exit 1
      fi
      ;;
  esac
}

dev_wait_port() {
  local port="$1"
  local label="$2"
  local i
  for i in $(seq 1 30); do
    if nc -z 127.0.0.1 "$port" 2>/dev/null; then
      echo "       $label OK (127.0.0.1:$port)"
      return 0
    fi
    sleep 1
  done
  echo "ERROR: $label not ready on port $port"
  return 1
}

dev_start_tunnel() {
  pkill -f "ssh -N -L 15432:127.0.0.1:5432" 2>/dev/null || true
  if ! ssh -f -N \
    -L 15432:127.0.0.1:5432 \
    -L 16379:127.0.0.1:6379 \
    -L 17687:127.0.0.1:7687 \
    -L 17474:127.0.0.1:7474 \
    "${REMOTE_USER:-root}@${REMOTE_HOST:-115.68.221.73}"; then
    echo "ERROR: SSH tunnel failed."
    exit 1
  fi
  sleep 1
  dev_wait_port 15432 "PostgreSQL tunnel"
  dev_wait_port 16379 "Redis tunnel"
}

dev_start_local_db() {
  if ! command -v docker >/dev/null 2>&1; then
    cat <<EOF
ERROR: Docker not found.

  서버 개발 DB (Docker 없음, 권장):
    ./scripts/setup-server-dev-db.sh      # 서버 최초 1회
    ./scripts/switch-to-remote-dev-db.sh
    ./scripts/dev.sh
EOF
    exit 1
  fi
  docker compose -f "$DEV_ENV_ROOT/deploy/docker-compose.local.yml" --env-file "$DEV_ENV_ROOT/.env" up -d
  dev_wait_port "$(dev_postgres_port)" "Local PostgreSQL"
  dev_wait_port "$(dev_redis_port)" "Local Redis"
}

dev_start_db() {
  dev_assert_db_config
  case "$(dev_db_mode)" in
    remote-prod)
      echo "[db] SSH tunnel → REMOTE production ..."
      dev_start_tunnel
      ;;
    remote-dev)
      dev_start_tunnel
      ;;
    local)
      echo "[db] Docker → local PostgreSQL/Redis ..."
      dev_start_local_db
      ;;
  esac
}

dev_sync_backend_env() {
  grep -E '^(DATABASE_URL|REDIS_URL|NEO4J_URI|NEO4J_USER|NEO4J_PASSWORD|SECRET_KEY|DEBUG|API_PORT|SMTP_|APP_BASE_URL|SSO_PROVIDER|ENTRA_TENANT_ID|ENTRA_CLIENT_ID|ENTRA_CLIENT_SECRET|ENTRA_REDIRECT_URI|SSO_ALLOWED_DOMAIN|SSO_SUCCESS_PATH)=' "$DEV_ENV_ROOT/.env" > "$DEV_ENV_ROOT/backend/.env.local.tmp" 2>/dev/null || true
  if [[ -s "$DEV_ENV_ROOT/backend/.env.local.tmp" ]]; then
    while IFS= read -r line; do
      key="${line%%=*}"
      if grep -q "^${key}=" "$DEV_ENV_ROOT/backend/.env" 2>/dev/null; then
        sed -i '' "s|^${key}=.*|${line}|" "$DEV_ENV_ROOT/backend/.env" 2>/dev/null \
          || sed -i "s|^${key}=.*|${line}|" "$DEV_ENV_ROOT/backend/.env"
      else
        echo "$line" >> "$DEV_ENV_ROOT/backend/.env"
      fi
    done < "$DEV_ENV_ROOT/backend/.env.local.tmp"
    rm -f "$DEV_ENV_ROOT/backend/.env.local.tmp"
  fi
}

dev_db_ready() {
  nc -z 127.0.0.1 "$(dev_postgres_port)" 2>/dev/null && nc -z 127.0.0.1 "$(dev_redis_port)" 2>/dev/null
}

# backward compat
dev_assert_local_db_config() { dev_assert_db_config; }
