# 그룹웨어 휴가 → 헬스키퍼 보내기 (`gw-leave-sync.py`)

휴가 · 반차 · 반반차 · 특별휴가인 사람은 쉬는 시간대에 업무 시간이어도 아케이드가 열려요.
그룹웨어 DB 는 헬스키퍼 서버에서 닿지 않아서, **사내망 맥**에서 이 프로그램을 돌려 헬스키퍼로 보내요.
헬스키퍼는 받기만 해요(`POST /api/internal/leave-sync`).

- 그룹웨어는 **읽기만** 해요 (읽기 전용 연결 · `search_path=groupware` · `default_transaction_read_only=on`).
- 오늘 · 내일(한국 시간)에 걸친 결재 문서만 읽어요.
  - 양식: 1 휴가신청서 · 11 반차신청서 · 13 반반차신청서 · 14 특별휴가신청서
  - 상태: 진행중(002) · 완료(003) — 임시저장(001) · 취소(004)는 빼요
  - 퇴사(`rtm_yn='Y'`) · 미사용(`use_yn<>'Y'`) 계정은 빼요
- 헬스키퍼 회원과는 회사 메일(소문자)로 맞춰요. 못 찾은 줄은 헬스키퍼가 버리고 개수만 알려 줘요.
- 이름 · 메일 · 본문 · 비밀값은 화면에 찍지 않아요.

## 쉬는 시간대

| 종류 | 시간대 |
| --- | --- |
| 휴가 · 특별휴가 | 시작일 ~ 종료일, 그날 하루 종일(00:00~24:00) |
| 반차 오전(`rmk_seg2=001`) | 00:00~14:00 |
| 반차 오후(`rmk_seg2=002`) | 13:00~24:00 |
| 반반차 | 본문에 적힌 시간(예: 「16:00~18:00」) 앞뒤 30분 여유 · 없으면 16:00~18:00 |

반반차 본문 시간이 「03:00~05:00」처럼 12시간제면 9시 전 시각은 오후로 봐요(→ 15:00~17:00, 여유 붙여 14:30~17:30).
시간대가 끝나면 다른 사람과 똑같이 닫혀요(막 끝난 판의 점수 저장은 10분 여유).

## 설치

```bash
python3 -m venv ~/.venvs/gw-leave-sync
~/.venvs/gw-leave-sync/bin/pip install "psycopg[binary]"
```

표준 라이브러리 + psycopg(3) 만 써요.

## 설정 파일 두 개

**1) 그룹웨어 접속 env** (`--gw-env`) — 아래 키만 읽고 나머지는 보지 않아요. 지출결의 시스템의 env 파일을 그대로 가리켜도 돼요.

```
GW_DB_HOST=...
GW_DB_PORT=5432
GW_DB_NAME=...
GW_DB_USER=...      # 읽기 전용 계정
GW_DB_PASSWORD=...
```

**2) 헬스키퍼 쪽 env** (`--hk-env`) — 예: `~/.config/healthkeeper/leave-sync.env` (권한 600)

```
HK_URL=https://healthkeeper.ibank.co.kr
LEAVE_SYNC_TOKEN=...   # 서버 backend/.env 의 LEAVE_SYNC_TOKEN 과 같은 값
```

`LEAVE_SYNC_TOKEN` 은 길고 맞히기 어려운 값으로 한 번 만들어(예: `python3 -c "import secrets;print(secrets.token_urlsafe(32))"`)
서버 `.env` 와 이 파일 두 곳에만 넣어요. 서버 값이 비어 있으면 받는 입구가 꺼져 있어요(503).

```bash
chmod 600 ~/.config/healthkeeper/leave-sync.env
```

## 돌리기

```bash
# 건수만 확인 (보내지 않음)
~/.venvs/gw-leave-sync/bin/python scripts/gw-leave-sync.py --gw-env <그룹웨어 env> --dry-run
# → [dry-run] 오늘(2026-11-13) 20명 · 내일(2026-11-14) 2명 · 종류별 휴가 13건 · 반차 5건 · … — 보내지 않았어요

# 보내기
~/.venvs/gw-leave-sync/bin/python scripts/gw-leave-sync.py --gw-env <그룹웨어 env> --hk-env ~/.config/healthkeeper/leave-sync.env
# → 보냈어요 — 오늘 … · 저장 21줄 · 회원 못 찾음 2줄
```

실패하면 종료 코드 1과 한 줄 이유(비밀값 없이)를 남겨요. 예: `실패: 헬스키퍼가 받지 않았어요 (HTTP 403)`.
보낼 때마다 오늘 · 내일 줄을 통째로 바꿔 넣으니 여러 번 보내도 괜찮아요(취소된 휴가는 다음 번에 빠져요).

## 자동으로 돌리기 (launchd 예시)

평일 07:30~19:30 사이 10분마다 보내는 예시예요. **아래는 문서용 예시이고 실제 등록은 하지 않았어요.**
`~/Library/LaunchAgents/kr.co.ibank.healthkeeper.leave-sync.plist` 로 저장해 쓰면 돼요(경로는 맞게 고치기).

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>kr.co.ibank.healthkeeper.leave-sync</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/ME/.venvs/gw-leave-sync/bin/python</string>
    <string>/Users/ME/헬스키퍼/scripts/gw-leave-sync.py</string>
    <string>--gw-env</string>
    <string>/Users/ME/그룹웨어/env/.env</string>
    <string>--hk-env</string>
    <string>/Users/ME/.config/healthkeeper/leave-sync.env</string>
  </array>
  <!-- 10분마다 (맥이 잠들어 있으면 깨어난 뒤 한 번) -->
  <key>StartInterval</key>
  <integer>600</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/Users/ME/Library/Logs/healthkeeper-leave-sync.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/ME/Library/Logs/healthkeeper-leave-sync.log</string>
</dict>
</plist>
```

```bash
# 등록 · 해제 (직접 할 때만)
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/kr.co.ibank.healthkeeper.leave-sync.plist
launchctl bootout   gui/$(id -u) ~/Library/LaunchAgents/kr.co.ibank.healthkeeper.leave-sync.plist
```

로그에는 건수만 남아요(이름 · 메일 없음). 맥이 꺼져 있거나 사내망이 아니면 그동안은 갱신되지 않고,
헬스키퍼는 마지막으로 받은 휴가를 그대로 써요(관리자 > 아케이드 이용현황 위쪽 「마지막 갱신」에서 확인).

## 헬스키퍼 쪽

- 받는 입구: `POST /api/internal/leave-sync` · 헤더 `X-Leave-Sync-Token` · 본문 512KB · 2,000줄까지
- 본문: `{"from":"YYYY-MM-DD","to":"YYYY-MM-DD","items":[{"email","day","start":"HH:MM","end":"HH:MM","kind","doc"}]}`
  - `kind`: `VACATION` 휴가 · `HALF` 반차 · `QUARTER` 반반차 · `SPECIAL` 특별휴가
- 응답: `{"data":{"saved":N,"unmatched":M,"days":D}}`
- 표: `member_leave` (마이그레이션 `0036_member_leave`) — 30일 지난 줄은 받을 때 지워요.
