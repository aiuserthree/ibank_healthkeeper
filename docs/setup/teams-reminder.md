# Teams 예약 리마인더 (10분 전 1:1 채팅)

확정된 예약 시작 **10분 전**(기본값)에 예약자에게 **Microsoft Teams 1:1 채팅**으로 알림을 보냅니다.

발송 주체는 **`healthkeeper@ibank.co.kr`** (발송용 M365 계정)이며, Graph **위임 권한**으로 메시지를 보냅니다.

## 동작 요약

| 항목 | 내용 |
|------|------|
| 트리거 | APScheduler — **매 1분** (`job_teams_reminder`) |
| 발송 계정 | `healthkeeper@ibank.co.kr` (refresh token) |
| 대상 | 당일 `CONFIRMED` 예약 + `member.entra_oid` 보유 |
| 발송 | Graph — 발송 계정 ↔ 예약자 1:1 채팅 생성 후 메시지 POST |
| 중복 방지 | `dedupe_key = teams-reminder:{reservation_id}` |
| 로그 | DB `teams_message` 테이블 |

## Entra 앱 권한 (필수)

**헬스키퍼 로그인_팀즈 SSO** 앱 → **API 권한** → **Microsoft Graph** → **위임된 권한**:

| 권한 | 용도 |
|------|------|
| `User.Read` | SSO (기존) |
| `Chat.Create` | 1:1 채팅 생성 |
| `ChatMessage.Send` | 채팅 메시지 발송 |

세 권한 모두 **ibank에 대해 허용됨** ✅ 상태여야 합니다.

> **애플리케이션 권한**은 사용하지 않습니다. 백그라운드 발송은 발송 계정 refresh token으로 처리합니다.

## 1회 설정 — refresh token 발급 (권장)

### Azure 리디렉션 URI 추가 (1회)

앱 등록 → **인증** → **리디렉션 URI** → **웹** 추가:

```
http://localhost:5173/api/auth/teams-sender/callback
```

운영: `https://healthkeeper.ibank.co.kr/api/auth/teams-sender/callback`

### 브라우저로 발급 (가장 쉬움)

```bash
./scripts/dev.sh   # dev 서버 켜기
```

브라우저에서 열기:

```
http://localhost:5173/api/auth/teams-sender/setup
```

1. `healthkeeper@ibank.co.kr` 로 로그인·동의
2. 성공 페이지에 `TEAMS_SENDER_REFRESH_TOKEN=...` 표시
3. `.env`에 복사·저장 → dev 서버 재시작

> 수동 스크립트(`obtain-teams-sender-token.sh`)는 code 붙여넣기·만료 이슈가 있어 **위 방법을 권장**합니다.

### (구) 수동 스크립트

```bash
./scripts/obtain-teams-sender-token.sh
```

dev 서버를 **끈 상태**에서 URL 붙여넣기 + **Enter** 필수.

```env
TEAMS_SENDER_EMAIL=healthkeeper@ibank.co.kr
TEAMS_SENDER_REFRESH_TOKEN=0.AX...
TEAMS_REMINDER_ENABLED=true
TEAMS_REMINDER_MINUTES_BEFORE=10
```

서버 재시작 후 적용됩니다.

## 환경 변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `TEAMS_SENDER_EMAIL` | `healthkeeper@ibank.co.kr` | 발송 계정 |
| `TEAMS_SENDER_REFRESH_TOKEN` | (없음) | 1회 발급 refresh token |
| `TEAMS_REMINDER_ENABLED` | `true` | `false`면 잡 스킵 |
| `TEAMS_REMINDER_MINUTES_BEFORE` | `10` | 시작 몇 분 전 |

`TEAMS_SENDER_REFRESH_TOKEN`이 없으면 알림을 보내지 않습니다.

## DB 마이그레이션

```bash
cd backend && .venv/bin/alembic upgrade head
```

## 로컬 1:1 채팅 테스트

### 0. refresh token (아직 없으면)

```bash
./scripts/obtain-teams-sender-token.sh
```

`healthkeeper@ibank.co.kr`로 로그인 후 `.env`에 `TEAMS_SENDER_REFRESH_TOKEN` 추가.

### 1. 수신자 준비

테스트 받을 본인 계정으로 **한 번 Teams SSO 로그인** (DB에 `entra_oid` 저장).

http://localhost:5173/login.html

### 2. 테스트 발송

```bash
./scripts/test-teams-chat.py 본인이메일@ibank.co.kr
```

성공 시 Teams에서 **healthkeeper@ibank.co.kr**과의 1:1 채팅에 메시지가 옵니다.

## 수동 실행 (관리자 API)

```http
POST /api/admin/jobs/teams-reminder/run
```

## 메시지 예시

> **[헬스키퍼]** 안마 예약 10분 전 알림  
> 홍길동님, **6/24(화) 14:00** 예약 시간이 곧 시작됩니다.  
> 헬스키퍼 공간으로 이동해 주세요.

## 문제 해결

| 증상 | 확인 |
|------|------|
| 발송 안 됨 | `.env`에 `TEAMS_SENDER_REFRESH_TOKEN` 있는지 |
| `Graph sender token failed` | refresh token 만료 → 스크립트로 재발급 |
| `403` / 권한 오류 | Graph 위임 권한 `Chat.Create`, `ChatMessage.Send` 동의 |
| `404` user | 예약자 `member.entra_oid` (Teams SSO 로그인) |
| 토큰 로테이션 경고 | 로그에 새 refresh token 안내 → `.env` 갱신 |

실패 건은 **최대 3회** 재시도 후 `DEAD` 상태로 남습니다.
