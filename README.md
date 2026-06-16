# ibank_healthkeeper

사내 안마서비스 예약 시스템 **헬스키퍼** (iBank).

## Stack

- Frontend: HTML / CSS / JavaScript (Vite dev server)
- Backend: FastAPI, PostgreSQL, Redis
- Auth: Microsoft Entra ID (Teams SSO)

## Local development

```bash
cp .env.example .env   # DB/SSO 값 설정
./scripts/dev.sh
```

- Frontend: http://localhost:5173
- API: http://localhost:8100

## Deploy

```bash
./scripts/deploy.sh
```

Production: https://healthkeeper.ibank.co.kr

## Docs

- [로컬 Teams SSO 설정](docs/setup/sso-local.md)
