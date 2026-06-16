#!/usr/bin/env bash
# 원격 서버(115.68.221.73) 초기 환경 구성
# PostgreSQL·pgvector·Redis는 Docker로만 설치 (로컬 설치 없음)
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

apt-get update -qq
apt-get install -y -qq \
  ca-certificates curl gnupg lsb-release \
  nginx \
  certbot \
  python3 python3-pip python3-venv \
  rsync ufw

# Docker
if ! command -v docker &>/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable --now docker
fi

# Node.js 20 (Vite 빌드용)
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi

# 앱 디렉터리
mkdir -p /opt/healthkeeper/{app,deploy,logs}
chown -R root:root /opt/healthkeeper

# 방화벽: SSH + HTTP/HTTPS
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "=== Server base setup complete ==="
docker --version
node --version
python3 --version
nginx -v
