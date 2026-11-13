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
다른 채팅(Claude)에서 힉스필드 Playable 예시 게임의 프롬프트를 보고 **코드로만 다시 만든** 게임들이다. 힉스필드 MCP · 생성 크레딧은 쓰지 않았다
(그래서 힉스필드 원본처럼 AI 생성 3D 모델 · 그림은 없고, 코드로 그림을 다듬었다). 모두 `HKEmbed` 로 아케이드 창 안에 끼워 넣었다.

| 아케이드 이름 | 키 | 바탕이 된 힉스필드 예시 | 장르 | 아케이드 점수 |
|---|---|---|---|---|
| 차 빼기 대작전 3D | `traffic` | Gridlock Out — https://higgsfield.ai/ko/playable?preset=446f4a39-15b7-4798-acb6-97e5bd47823f | 퍼즐 | 3분 동안 번 코인(매 판 1단계부터) |
| 태양 왕관 군단 | `suncrown` | Pixel Legion — https://higgsfield.ai/ko/playable?preset=0a0d32af-8464-4b33-a8d3-93881eb8feae | 액션 | 단계 하나: 이기면 단계 기본(1,000·2,000·3,000) + 별×500 + 남은 병력×10(목표의 2배까지), 지면 진행률×기본×0.5 |
| 영웅 돌격 다리 3D | `herorush` | Crowd Surge — https://higgsfield.ai/ko/playable?preset=2b20c165-397b-4663-aeef-14afaa2db089 | 액션 | 단계 하나: 이기면 단계×500 + 별×300 + 영웅×10, 지면 진행%×단계×250÷100 |
| 햇살 농장 3D | `eggfarm` | Egg Valley — https://higgsfield.ai/ko/playable?preset=528833a2-3978-4ce9-b3f5-9254acefddb8 | 캐주얼 | 3분 동안 판매로 번 코인(매 판 새 농장) |
| 여우 신사 정원 | `kitsune` | 확인 안 됨(사용자가 준 예시 4개에 없음) | 액션 | 처치×10 + 레벨×200 + 버틴 초×2, 성공하면 +5,000 |

- 파일: 바깥(아케이드 틀) `web/games/<키>.html`, 게임 본체 `web/games/embed/<키>.html`, 대표 그림 `web/assets/lounge/<키>.jpg`.
- 원래 커밋: 태양 왕관 군단 01e069a · 여우 신사 정원 8a1b9bf(브랜치 `claude/kitsune-garden-3d`) · 차 빼기 fdf1697(`claude/traffic-jam-escape-3d`) · 햇살 농장 7b2135e(`claude/sunny-side-farm-3d`) · 영웅 돌격 다리 c30dc32(`claude/hero-rush-bridge-game`). 아케이드 연결 · 그림 다듬기는 df0ea72.
- `herorush` · `eggfarm` 은 three.js 를 cdnjs 에서 불러온다(회사망에서 막히면 안 뜸). 나머지는 파일 안에 들어 있다.
- 나중에 힉스필드 크레딧이 생기면: 힉스필드 MCP(`https://mcp.higgsfield.ai/mcp`, claude.ai 커넥터 「힉스필드」)로 같은 게임을 다시 생성해 본체만 바꿔 끼우면 된다. 점수 · 순위 키는 그대로 둔다(기록이 이어지게).
