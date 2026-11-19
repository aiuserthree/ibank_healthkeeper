# 힉스필드 게임을 아케이드에 붙이기

힉스필드(`higgsfield website create --type game`)로 만든 게임을 헬스키퍼 아케이드 화면 안에 창(iframe)으로 넣고,
판 시작 · 점수를 헬스키퍼 순위 · 참여 도장 · 쿠폰으로 잇는다. 헬스키퍼 쪽 코드는 `web/_shared/hk-embed.js`.

## 정해 둔 것 (2026-11-13)
- 힉스필드 프로그램은 이 맥에 jblee 계정으로 로그인돼 있고, 사용자(조준형)가 그 계정 사용 · 공개 주소 · 크레딧 사용을 허락했다.
- 힉스필드에 올리면 바로 누구나 들어갈 수 있는 공개 주소(`이름.higgsfield.app`)로 열린다. 순위 · 도장은 헬스키퍼 안에서 할 때만 남는다.
- 어떤 게임을 만들지는 사용자가 나중에 정한다.

## 붙이는 순서
1. 힉스필드에 게임을 만들고 올린다 — `higgsfield website create --type game --category <장르> --subdomain hk-<이름>`, 게임 규칙은 `app/src/logic.js`, 화면은 `app/public/index.html` · `client.js`.
2. 게임 화면(`client.js`)에 아래 「게임 쪽 연결 코드」를 넣고, 판 시작 · 판 끝에서 부른다.
3. 게임이 다른 사이트의 창 안에서 열리도록 응답 헤더를 확인한다 — `X-Frame-Options` 가 있으면 빼고, `Content-Security-Policy: frame-ancestors https://healthkeeper.ibank.co.kr` 로 헬스키퍼만 허락한다.
4. 헬스키퍼에 등록한다
   - `backend/app/services/game.py` GAMES 맨 위에 `Game("<키>", "<제목>", "MINI", "<설명>", "<아이콘>", "점", <최대 점수>)`
   - `web/arcade.html` GENRE, `web/_shared/play.js` 색(TINTS)
   - `web/games/<키>.html` — 다른 게임과 같은 머리(head) + `<script src="/_shared/hk-embed.js"></script>` 와
     `HKEmbed.mount({ key: "<키>", src: "https://hk-<이름>.higgsfield.app/", origin: "https://hk-<이름>.higgsfield.app" })`
   - 대표 그림 `web/assets/lounge/<키>.jpg` (900×450)
5. 미리보기(5173)에서 해 보고, 「올려」를 받으면 배포.

## 게임 쪽 연결 코드 (client.js 에 넣기)
```js
// 헬스키퍼 아케이드 안에서 열렸을 때만 점수를 넘긴다 — 받는 주소를 꼭 적는다
const HK = "https://healthkeeper.ibank.co.kr";
const inHK = window.parent !== window;
const hk = (msg) => { if (inHK) window.parent.postMessage(msg, HK); };
window.addEventListener("message", (e) => {
  if (e.origin !== HK) return;
  if (e.data?.type === "hk:hello") document.documentElement.classList.add("in-hk"); // 자체 순위 · 로그인 숨기기
  if (e.data?.type === "hk:pause") pauseGame();   // 멈출 때 hk({ type: "hk:paused" })
  if (e.data?.type === "hk:resume") resumeGame(); // 다시 움직일 때 hk({ type: "hk:resumed" }) — 게임 안 덮개로 이어 할 때도
  if (e.data?.type === "hk:restart") restartGame();
});
hk({ type: "hk:ready" });
// 게임 창 안 Esc 는 헬스키퍼가 멈춤/이어 하기를 정한다
window.addEventListener("keydown", (e) => { if (e.key === "Escape" && !e.repeat) hk({ type: "hk:esc" }); });
// 판 시작:      hk({ type: "hk:start" });
// 지금 점수(선택): hk({ type: "hk:live", score });
// 판 끝:        hk({ type: "hk:score", score });   // 0 이상 정수, 한 판에 한 번
```

## 헬스키퍼가 지키는 것 (hk-embed.js)
- 정해 둔 주소에서, 우리가 띄운 창이 보낸 말만 받는다.
- 점수는 판 시작(`hk:start`) 뒤 한 번만, 0 이상 정수로 받는다. 시작 전 점수 · 두 번째 점수는 버린다.
- 창은 sandbox — 게임이 헬스키퍼 화면을 다른 곳으로 옮기거나 새 창을 띄우지 못한다.
- 회원 이름 · 메일 같은 개인 정보는 게임 쪽으로 보내지 않는다.
- 다른 아케이드 게임처럼 점수는 화면(게임)이 보내는 값이라, 마음먹고 조작하면 막을 수 없다(지금 게임들과 같은 수준).

## 힉스필드 프롬프트로 만든 게임 (2026-11-13 운영 반영)

> 2026-11-13 사용자 결정으로 「태양 왕관 군단」(suncrown, Pixel Legion 바탕)은 뺐다 — 기록 0건. 되살리려면 git 기록(df0ea72)에서 web/games/suncrown.html · web/games/embed/suncrown.html · 대표 그림 · GAMES 줄을 가져온다.
다른 채팅(Claude)에서 힉스필드 Playable 예시 게임의 프롬프트를 보고 **코드로만 다시 만든** 게임들이다. 힉스필드 MCP · 생성 크레딧은 쓰지 않았다
(그래서 힉스필드 원본처럼 AI 생성 3D 모델 · 그림은 없고, 코드로 그림을 다듬었다). 모두 `HKEmbed` 로 아케이드 창 안에 끼워 넣었다.

| 아케이드 이름 | 키 | 바탕이 된 힉스필드 예시 | 장르 | 아케이드 점수 |
|---|---|---|---|---|
| 곰돌이 새총 원정대 | `slingfort` | Sling Raiders — https://higgsfield.ai/ko/playable?preset=1b4973cd-b1a7-4b40-9cd4-c278277b807d (직접 해 보고 기능을 똑같이, 3D 로우폴리 · 그림은 힉스필드 GPT 이미지 20장) | 액션 | 원정 점수 = 10단계 각각의 최고 단계 점수 합(단계 점수 = 약탈 금화 + 남은 곰×100 + 첫 함락 보너스 50+5×단계), 상한 100,000 |
| 차 빼기 대작전 3D | `traffic` | Gridlock Out — https://higgsfield.ai/ko/playable?preset=446f4a39-15b7-4798-acb6-97e5bd47823f | 퍼즐 | 3분 동안 번 코인(매 판 1단계부터) |
| 영웅 돌격 다리 3D | `herorush` | Crowd Surge — https://higgsfield.ai/ko/playable?preset=2b20c165-397b-4663-aeef-14afaa2db089 | 액션 | 단계 하나: 이기면 단계×500 + 별×300 + 영웅×10, 지면 진행%×단계×250÷100 |
| 눈꽃 야영지 3D | `frostcamp` | 확인 안 됨(프롬프트 글만 받음 — 겨울 숲 야영지 방치형 경영) | 캐주얼 | 한 판 8분: 건물에 쓴 통나무×20 + 건물 완성(500·1,000·1,500·2,000) + 나무꾼×300 + 장비 단계×200 + 눈보라 버티기×800(2번까지) − 얼어붙음×200, 얼음 문을 열면 +3,000 + 남은 초×10 |
| 빙글빙글 레코드 파티 3D | `vinyl` | 확인 안 됨(사용자가 프롬프트만 줌 — party · 3d, 돌아가는 레코드판 위 봉제 인형 리듬 서바이벌) | 액션 | 한 곡(1분 28초): 버틴 박×10 + 피한 바(20+콤보×2, 박자선 위면 2배) + 밀어 떨어뜨림×300, 완주하면 +1,000 + 남은 목숨×500 |
| 꿀꺽 젤리 숲 3D | `jelly` | 먹고 자라기 3D(`game_type: eat-grow` · `dimension: 3d`) — 프롬프트만 받음, 예시 주소는 확인 안 됨 | 액션 | 열매 10 · 버섯 30 · 별빛 구슬 50 · 삼킨 친구 크기×100, 가시대왕을 삼키면 +5,000 + 남은 초×50 + 남은 하트×500 |
| 먹보 구멍 3D | `holecity` | 먹고 자라기 3D(`game_type: eat-grow` · `dimension: 3d`) — 구멍이 도시를 삼키는 프롬프트만 받음, 예시 주소는 확인 안 됨 | 액션 | 한 판(공원 → 주택가 → 도심): 삼킨 물건 값×10 + 삼킨 구멍 200(그 구멍이 먹은 값×10 더), 구역 정복 1,500 · 3,000 · 4,500 + 남은 초×40, 도심까지 정복하면 +3,000 |
| 야간 분대 작전 3D | `nightsquad` | 3D 분대 슈팅 프롬프트(game_type: shooter · dimension: 3d) — 예시 주소는 확인 안 됨 | 슈팅 | 스테이지 하나(506m): 성공하면 3,000 + 별×500 + 생존 분대원×20, 실패하면 진행률%×15 |
| 선다운 범퍼스 3D | `sundown` | 확인 안 됨(브랜치 `claude/sundown-bumpers` — 노을 카니발 범퍼카 3D 레이싱, 원래 단독 페이지) | 레이싱 | (아케이드 연결하며 정함) |
| 햇살 농장 3D | `eggfarm` | Egg Valley — https://higgsfield.ai/ko/playable?preset=528833a2-3978-4ce9-b3f5-9254acefddb8 | 캐주얼 | 3분 동안 판매로 번 코인(매 판 새 농장) |
| 여우 신사 정원 | `kitsune` | 확인 안 됨(사용자가 준 예시 4개에 없음) | 액션 | 처치×10 + 레벨×200 + 버틴 초×2, 성공하면 +5,000 |

- 파일: 바깥(아케이드 틀) `web/games/<키>.html`, 게임 본체 `web/games/embed/<키>.html`, 대표 그림 `web/assets/lounge/<키>.jpg`.
- 원래 커밋: (뺀 태양 왕관 군단 01e069a) · 여우 신사 정원 8a1b9bf(브랜치 `claude/kitsune-garden-3d`) · 차 빼기 fdf1697(`claude/traffic-jam-escape-3d`) · 햇살 농장 7b2135e(`claude/sunny-side-farm-3d`) · 영웅 돌격 다리 c30dc32(`claude/hero-rush-bridge-game`). 아케이드 연결 · 그림 다듬기는 df0ea72.
- `herorush` · `eggfarm` 은 three.js 를 cdnjs 에서 불러온다(회사망에서 막히면 안 뜸). 나머지는 파일 안에 들어 있다.
- 나중에 힉스필드 크레딧이 생기면: 힉스필드 MCP(`https://mcp.higgsfield.ai/mcp`, claude.ai 커넥터 「힉스필드」)로 같은 게임을 다시 생성해 본체만 바꿔 끼우면 된다. 점수 · 순위 키는 그대로 둔다(기록이 이어지게).

### 2026-11-13 오후에 들어온 5종 메모
- 꿀꺽 젤리 숲 · 눈꽃 야영지 · 야간 분대 작전 · 빙글빙글 레코드 파티는 다른 채팅이 아케이드 연결 · 등록 · 대표 그림까지 해서 브랜치로 올렸고, 선다운 범퍼스는 단독 페이지(`games/sundown-bumpers/`)로 와서 `web/games/embed/sundown.html` 로 옮겨 연결했다. 겹침: 야간 분대 작전 ↔ 영웅 돌격 다리(관문 숫자로 무리 불리기), 눈꽃 야영지 ↔ 햇살 농장 · 매니지먼트(경영) — 사용자 확인 뒤 모두 붙임.
- `frostcamp`(눈꽃 야영지 3D, 브랜치 `claude/frostcamp-3d`)는 three.js r170 을 파일 안 첫 `<script>` 에 통째로 넣었고, 게임 코드는 그 아래 두 번째 `<script>` 에 읽을 수 있는 그대로 있다(그 부분만 고치면 된다). 바깥 글꼴 · 그림 · 소리 파일을 부르지 않는다. 아케이드 창 안(`?hk=1`)에서는 8분 제한, 본체 주소를 직접 열면 시간 제한 없이 논다.
- `vinyl`(2026-11-13, 브랜치 `claude/vinyl-party-3d`)은 three.js r160 을 파일 안에 넣었다. 음악 · 효과음은 파일 없이 WebAudio 로 그 자리에서 만든다. 글꼴(Bagel Fat One · Jua)만 구글 글꼴에서 받아 오고, 막히면 기본 글꼴로 뜬다. 아직 운영 반영 전 — 미리보기(5173)에서 해 본 뒤 「올려」.
- 한 판: 병사 4명으로 출발 → 숫자 게이트(쏘면 값이 오름 · 분대가 양쪽에 걸쳐 지나가면 둘 다 적용) · 숫자 바리케이드(부수면 포로 합류) · 길 가장자리 무기 상자 4개(소총 → 기관단총 → 돌격소총 → 중기관총 → 플라스마 포) → 끝에서 거대 경비 로봇. 별은 생존 80명부터 2개, 130명부터 3개.
- three.js r128 을 파일 안에 넣었다(회사망에서 CDN 이 막혀도 뜸). 글꼴은 `/assets/fonts/PretendardVariable.woff2`.
- 난이도 숫자는 `web/games/embed/nightsquad.html` 안 `CFG` · `WEAPONS` · `ETYPE` · `STAGE` 에 모여 있다. 봇으로 돌려 본 기준(24판씩): 가만히 두거나 한쪽에만 붙어 가면 한 번도 못 깸(가운데 고정은 220m 안팎에서 전멸), 서툴게 하면 두 판에 한 판쯤 성공(생존 110명 안팎), 잘하면 145명 안팎. 봇은 어림이라 사람이 해 보면 다를 수 있다.
- 확인한 것: 헤드리스 크롬(소프트웨어 렌더러)에서 가로 · 세로 화면, 마우스 · 키보드 · 터치 조작, 일시정지, 전멸 · 성공 화면, `hk:ready/start/live/score/pause/resume/esc/restart` 주고받기.
- 아직 안 해 본 것: 미리보기(5173)에서 실제 로그인 상태로 점수 · 도장이 올라가는지, 실제 휴대폰 · 회사 PC 에서의 속도, 소리. 운영 반영 전에 확인할 것.

### 먹보 구멍 3D 메모 (2026-11-13, 브랜치 `claude/hole-city-3d`)
- 같은 `eat-grow` 프롬프트 갈래인 꿀꺽 젤리 숲과 겹친다(먹고 자라기). 이쪽은 구멍이 도시 물건을 삼키는 쪽 — 꽃 · 벤치 → 나무 → 자동차 → 집 → 빌딩.
- 한 판: 공원(목표 45% · 90초) → 주택가(60% · 85초) → 도심(70% · 95초). 구역 목표를 못 채우면 그 자리에서 판이 끝나고, 채우면 번 코인으로 상점에서 크기(시작 크기 +9%) · 속도(+6%) · 시간(+7초)을 5단계까지 올린 뒤 다음 구역으로 간다. 매 판 강화 없이 공원부터.
- 구멍끼리: 1.1배 넘게 크면 삼킨다. 초록 테 = 내가 삼킬 수 있음, 빨간 테 = 나를 삼킴, 노란 테 = 비슷함. 삼켜지면 8초와 몸집 30%를 잃고 다른 자리에서 3초 동안 안전하게 다시 나온다. 라이벌을 삼키면 그 구멍이 먹은 것까지 내 몫이 되고, 조금 뒤 내 크기에 맞춘 새 라이벌이 나온다.
- 라이벌이 맵을 먼저 비우지 않게: 하나 삼킬 때마다 쉬고, 구역 값의 2.5%를 먹으면 「배부름」으로 제자리에 멈췄다가 작은 구멍이 가까이 올 때만 쫓는다. 크기는 내 구멍의 1.7배까지만. 삼킨 비율은 라이벌이 쥔 몫을 빼고 센다(그래서 목표는 늘 채울 수 있다).
- 사람은 넣지 않았다 — 움직이는 것은 자동차 · 버스 · 배달 로봇 · 오리.
- 화면: 내 구멍을 가리는 높은 건물(카메라 쪽)은 납작하게 낮춘다. 바닥은 스텐실로 구멍 자리만 비워 그려서 구멍 속이 보인다. 느린 기기는 놀이 중 3초 평균 40프레임 밑이면 화면 배율 · 그림자를 한 단계씩 낮춘다(두 번까지 — 두 번째에는 그림자를 끈다).
- three.js r128 을 파일 안 첫 `<script>` 에 넣었고(회사망에서 CDN 이 막혀도 뜸), 게임 코드는 그 아래 `<script>` 세 개(규칙 · 화면 · 진행)에 읽을 수 있는 그대로 있다. 본문 글꼴은 `/assets/fonts/PretendardVariable.woff2`, 제목 글꼴(Do Hyeon)만 구글 글꼴에서 받아 오고 막히면 Pretendard 굵은 글씨로 뜬다. 소리는 파일 없이 WebAudio.
- 난이도 숫자는 `web/games/embed/holecity.html` 의 규칙 `<script>` 안 `TUNE` · `AREAS` · `UPGRADES` 에 모여 있다. 봇으로 돌려 본 기준(24판씩, 상점은 싼 것부터 고르게): 잘하면 공원 24 · 주택가 24 · 도심 22판 통과(평균 32,600점), 조금 서툴면 24 · 23 · 19(29,800점), 서툴면 23 · 22 · 9(21,800점). 최고 36,800점 안팎. 봇은 어림이라 사람이 해 보면 다를 수 있다.
- 시험 옵션(본체 주소를 직접 열 때만, 아케이드 창 안 `?hk=1` 에서는 꺼짐): `?dbg=1&bot=1`(자동 조종) · `&area=1~2`(뒤 구역부터) · `&fast=N`(빨리 감기).
- 확인한 것: 헤드리스 크롬(소프트웨어 렌더러)에서 가로 · 세로 화면, 끌기 · 방향키 조작, 일시정지 · 이어 하기, 구역 결과 · 상점 · 최종 결과 화면, 자동 조종으로 한 판 끝까지, 창 안에서 `hk:ready/start/live/score/paused/resumed/esc` 보내기와 `hk:hello/pause/resume/restart` 받기.
- 아직 안 해 본 것: 미리보기(5173)에서 실제 로그인 상태로 점수 · 도장이 올라가는지, 실제 휴대폰 · 회사 PC 에서의 속도, 소리, 사람이 했을 때의 난이도. 운영 반영 전에 확인할 것.
