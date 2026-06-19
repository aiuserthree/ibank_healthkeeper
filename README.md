# ibank_healthkeeper

사내 안마서비스 예약 시스템 **헬스키퍼** (iBank).

## Stack

- Frontend: HTML / CSS / JavaScript (Vite dev server)
- Backend: FastAPI, PostgreSQL, Redis
- Auth: Microsoft Entra ID (Teams SSO)

## Local development

개발 DB는 세 가지 방식 중 선택합니다.

| 방식 | Docker | 운영 DB 영향 |
|------|--------|-------------|
| **서버 dev DB** (`remote-dev`) | 불필요 | 없음 — `healthkeeper_dev` |
| 로컬 Docker (`local`) | 필요 | 없음 |
| 운영 DB 직접 (`USE_REMOTE_DB=1`) | 불필요 | **있음** |

**권장 — 서버 개발 DB (Docker 없음):**

```bash
./scripts/setup-server-dev-db.sh      # 최초 1회
./scripts/switch-to-remote-dev-db.sh
./scripts/dev.sh
```

- Frontend: http://localhost:5173
- API: http://localhost:8100

## Deploy

**운영 반영은 deploy 시에만** 이루어집니다 (코드 + 원격 DB 마이그레이션).

```bash
./scripts/deploy.sh
```

Production: https://healthkeeper.ibank.co.kr

## Docs

- [로컬 Teams SSO 설정](docs/setup/sso-local.md)
