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
