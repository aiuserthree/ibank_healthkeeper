# 로컬 Teams SSO (Microsoft Entra) 테스트

헬스키퍼는 **Microsoft Entra ID** OAuth2 + PKCE로 Teams(사내 Microsoft) 계정 로그인을 지원합니다.  
로컬에서는 Vite(`5173`)가 `/api`를 FastAPI(`8100`)로 프록시하므로, **리다이렉트 URI는 5173 기준**으로 등록합니다.

## 1. Azure 앱 등록

[Microsoft Entra admin center](https://entra.microsoft.com/) → **앱 등록** → **새 등록**

| 항목 | 값 |
|------|-----|
| 이름 | `헬스키퍼 로컬` (임의) |
| 지원 계정 유형 | 조직 디렉터리만 (단일 테넌트) |
| 리디렉션 URI | **웹** → `http://localhost:5173/api/auth/sso/callback` |

등록 후 메모:

- **애플리케이션(클라이언트) ID** → `ENTRA_CLIENT_ID`
- **디렉터리(테넌트) ID** → `ENTRA_TENANT_ID`

### 클라이언트 시크릿

**인증서 및 비밀** → **새 클라이언트 비밀** → 값 복사 → `ENTRA_CLIENT_SECRET`  
(비밀은 한 번만 표시됩니다.)

### API 권한

**API 권한** → **Microsoft Graph** → **위임된 권한**:

- `openid`
- `profile`
- `email`
- `User.Read` (**필수** — 부서·직급 등 Graph 프로필 조회)

**관리자 동의 허용**이 필요한 테넌트면 동의를 진행합니다.

예약 **5분 전 Teams 1:1 알림**을 쓰려면 애플리케이션 권한 `Chat.Create`, `ChatMessage.Send` 가 추가로 필요합니다.  
→ [teams-reminder.md](./teams-reminder.md)

## 2. `.env` 설정

프로젝트 루트 `.env` ( `scripts/dev.sh` 가 `backend/.env` 로 동기화):

```env
APP_BASE_URL=http://localhost:5173
SSO_PROVIDER=entra
ENTRA_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
ENTRA_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
ENTRA_CLIENT_SECRET=your-client-secret
ENTRA_REDIRECT_URI=http://localhost:5173/api/auth/sso/callback
SSO_ALLOWED_DOMAIN=yourcompany.com
SSO_SUCCESS_PATH=/사용자/예약하기.html
```

- `SSO_ALLOWED_DOMAIN`: 사내 이메일 도메인만 허용 (비우면 모든 도메인 허용)
- `SSO_PROVIDER=mock` 이면 Microsoft 없이 Mock 계정 선택 화면으로 테스트

## 3. 개발 서버 실행

```bash
./scripts/dev.sh
```

시작 로그에 SSO 모드가 표시됩니다. Entra 모드일 때:

```bash
curl -s http://localhost:8100/api/auth/sso/status | python3 -m json.tool
```

`ready: true` 이면 설정이 완료된 상태입니다.

## 4. 로그인 테스트

1. http://localhost:5173/사용자/로그인.html
2. **Microsoft Teams로 로그인** 클릭
3. Microsoft 로그인 → 동의 → 예약하기 페이지로 리다이렉트
4. 첫 로그인 시 DB에 회원 자동 생성 (`entra_oid` 기준)

## 5. 문제 해결

| 증상 | 확인 |
|------|------|
| `AADSTS50011` redirect URI 불일치 | Azure에 `http://localhost:5173/api/auth/sso/callback` 정확히 등록 |
| 로그인 실패 / AUTH_FAILED | API 터미널 로그 (`DEBUG=true` 시 Entra token 오류 출력) |
| SSO 설정 미완료 메시지 | `/api/auth/sso/status` 의 `missing` 필드 확인 |
| 쿠키/세션 안 됨 | `APP_BASE_URL` 이 `http://localhost:5173` 인지 확인 (8100 아님) |
| 도메인 거부 | `SSO_ALLOWED_DOMAIN` 과 로그인 계정 이메일 도메인 일치 여부 |

빠른 점검:

```bash
./scripts/check-sso-env.sh
```
