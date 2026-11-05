// 옥상 헤딩 축구 — 점심시간 회사 옥상 풋살장에서 머리 큰 직원 둘이 겨루는 1:1 축구 (경기 엔진: 물리 · 컴퓨터 · 그리기 · 실시간 통신)
//
// window.HKSoccer.create(canvas, opts) → engine
//   opts.mode      "cpu"(컴퓨터와) · "local"(한 화면 둘이) · "host"(동료와 — 판을 계산) · "guest"(동료와 — 받아 그림) · "demo"(구경)
//   opts.level     "easy" · "normal" · "hard" · "best" — 컴퓨터 난이도(쉬움 · 보통 · 어려움 · 최강 — 레퍼런스 AI Skill 의 Low · Medium · Good · Best) (cpu)
//   opts.minutes   1 · 2 · 3 · 5 — 경기 시간(기본 2). guest 는 host 가 보낸 값을 쓴다
//   opts.quality   "low" · "medium" · "good" · "best" — 화질(낮음 · 보통 · 좋음 · 최고, 기본 좋음). 그리기만 바꾼다 — 판 · 물리 · 통신은 그대로(동료와도 내 화면만)
//   opts.me · opts.rival   { name, avatarUrl, look } — 나 · 상대.
//                  왼쪽 팀(파랑)은 나(cpu) · 1P · host, 오른쪽 팀(주황)은 컴퓨터 · 2P · guest. guest 화면은 오른쪽이 나
//                  avatarUrl 이 없거나 못 불러오면 팀 색 동그라미 + 첫 글자. look(0~3)을 주면 그린 얼굴(컴퓨터 · 구경)
//   opts.net       { send(obj) → bool, onMessage(fn) } — host · guest. HKRt.connect 결과를 이어 준다
//   opts.restore   exportState() 로 받아 둔 판 — host 가 새로고침한 뒤 이어 하기
//   opts.touch     휴대폰(화면 단추) — 키 안내 대신 단추를 쓴다
//   opts.onEnd(result)  끝나면 한 번 — { left, right, me, rival, win, draw, side, sec, kicks, heads }
//   opts.onEvent(e)     { type: "start" | "goal" | "out" | "over" | "hold" | "stall", … } — 화면이 알림 · 덮개를 고칠 때
// engine
//   start() · destroy() · pause() → bool · resume() · score() · isOver() · phase() · setQuality(q) → bool · quality()
//   begin()             host — 둘 다 들어오면 3 · 2 · 1 로 경기 시작 (cpu · local · demo 는 start 가 바로 시작)
//   hold(reason, on)    host — 멈출 까닭을 켜고 끈다("peer" 상대 없음 · "net" 내 연결 끊김 · "away" 내 화면 숨김).
//                       모두 풀리면 3 · 2 · 1 뒤 이어서(짧게 멈췄으면 1 만). guest 는 "away" 만 — host 에 알려 멈추게 한다
//   resync()            host — 전체 판을 다시 보낸다(상대가 다시 들어왔을 때) · guest — 전체 판을 달라고 한다
//   peerTrouble()       동료와 — 상대가 접속은 해 있는데 경기를 못 하는 까닭: "away"(화면을 떠남) · "silent"(소식이 끊김) · null
//                       바뀔 때마다 onEvent({type:"trouble", what}) — 화면이 알림 띠 · 오래 가면 「기권/더 기다리기」를 띄운다
//   control(act, on, side)  화면 단추 — act "left" · "right" · "jump" · "kick". side 를 빼면 내 선수
//   exportState()       host — 판 전체(JSON). 새로고침 뒤 opts.restore 로 이어 한다
//
// 실시간 메시지 (모두 4KB 이하 JSON 객체 — rt.js 가 실어 나른다)
//   host → guest  {t:"s", f, ph, pt, cd, c, sc, b, p, a, fz, e, h, o}  초당 30번. f: host 프레임 · a: 이 판에 반영된 guest 입력 프레임 · o: 아웃 중이면 막던 쪽 + 1 ·
//                                                                 fz: 멈춤 비트(1 host 자리 비움 · 2 상대 없음 · 4 guest 자리 비움 · 8 멈춤 · 16 guest 소식 끊김) ·
//                                                                 e: 최근 일(득점 · 휘슬 · 킥 · 아웃 · 끝) — 1.5초(득점은 10초) 동안 거듭 실어 한 번 놓쳐도 받는다 ·
//                                                                 h: host 화면 번호(새로고침하면 바뀐다)
//                 {t:"full", …s 와 같음, mi, ev, st}              전체 판 — 다시 들어왔을 때 · 달라고 했을 때
//   guest → host  {t:"i", s, n, m, j, k, w, q}   입력이 바뀔 때 + 0.2초마다 다시 (n: guest 프레임, m: 1 왼쪽 · 2 오른쪽, j · k: 점프 · 킥 누른 횟수,
//                                                w: 1 이면 guest 화면이 숨겨짐, q: guest 가 host 판을 마지막으로 받은 지 ms · 아직 못 받았으면 -1)
//                 {t:"hi", w, q} 전체 판 달라기 · {t:"away", on} 화면을 떠남 · 돌아옴(한 번 놓쳐도 w 로 다시 맞춘다)
//   host 는 guest 소식이 1초 넘게 없거나(q 포함) 판이 guest 에 1.2초 넘게 안 가면 멈춘다(망이 조용히 죽어도 혼자 경기하지 않게)
//   점수 · 시계 · 끝은 host 만 정한다. guest 는 득점 일(goal)만 하나씩 세어 결과를 보낸다 — host 판의 점수가 득점 없이 바뀌면
//   (저장된 판을 고쳐 새로고침하는 식) 자기가 센 점수를 보내 결과가 어긋나게(MISMATCH · 순위 제외) 한다
window.HKSoccer = (function () {
  "use strict";

  // ── 경기장 (월드 단위 960 × 540 — 화면 크기에 맞춰 늘인다) ──
  const W = 960, H = 540, GROUND = 466;
  // 골대 — 고전 1:1 헤딩 축구(플래시)를 재어 맞췄다: 크로스바 높이는 공 지름의 2.5~2.96배(두 번 잰 값) — 가운데쯤인 바닥에서 176(공 지름 64 의 2.75배).
  // 서 있는 수비수 머리 위와 크로스바 사이가 공 지름의 1.4배쯤 비어(레퍼런스 1.5배) 골문 앞에 선 사람 위로 넘기는 슛이 들어갈 수 있다.
  // 그쪽 골대는 공 지름 4배만큼 깊지만 이 구장은 한 화면이라 깊이는 큰 공이 다 들어가고 남을 만큼만(공 지름 1.7배) 늘렸다
  const GOAL_W = 108, BAR_Y = 290, ROOF_Y = 236, BAR_R = 6; // 골대 깊이 · 크로스바(앞 끝) 높이 · 지붕 뒤 높이(앞으로 기울어 공이 경기장 쪽으로 굴러 나온다)
  const CEIL = -140; // 하늘 끝(만약을 위한 벽) — 화면 위로 넘어간 공은 화살표로 보여 준다
  // 공이 솟는 꼭대기 — 공 가운데가 화면 위 끝까지만 솟는다(공이 다 사라지지 않는다). 그보다 높이 갈 빠르기는 덜어 내 꼭짓점이 여기서 부드럽게 꺾인다
  // (센 헤딩이 화면 밖으로 사라지거나 보이지 않는 천장에 부딪쳐 되튀지 않게). 점수판 뒤에 가리면 점수판 아래에 표시한다(offMark).
  // 더 낮게(점수판 아래까지만) 잡으면 높은 공이 너무 빨리 꺾여 컴퓨터 단계 차이가 흐려졌다(보통이 쉬움에 졌다)
  const TOP_Y = 0;
  // 손맛은 고전 1:1 헤딩 축구(플래시)를 재어 맞췄다 — 공이 머리만 하고(그쪽 화면에서 공 지름 57 · 머리 지름 57 — 공이 머리의 0.97~1배),
  // 바닥에서 0.75~0.9 로 다시 튀며, 머리 · 몸에 닿으면 세게 튕겨 나가고, 점프는 1초쯤 공 지름 3배 높이로 뜬다.
  // 다만 이 구장은 한 화면이라(그쪽은 화면이 공을 따라 옆으로 흐르는 긴 구장) 옆으로 나는 힘은 줄였다
  // 공 — 머리만큼 큰 공(반지름 32 — 머리 33 의 0.97)이 가볍게 떠서 통통 튄다(바닥에서 0.82 만큼 다시 튀어 오른다). 가벼운 공이라 옆으로는 바람을 더 받아
  // 높이 솟아도 멀리까지 날아가지 않는다(좁은 옥상 구장에서 먼 데서 찬 공이 그대로 골이 되지 않게)
  const BALL_R = 32, G_BALL = 0.3, AIR = 0.997, AIR_X = 0.992, BOUNCE = 0.82, ROLL = 0.988, MAX_V = 22, SUB = 3;
  // 선수 — 레퍼런스처럼 큰 머리 밑에 작은 몸 · 발만 붙은 모양. 서 있을 때 머리 가운데가 바닥에서 50(공 지름의 0.78배 — 레퍼런스 0.6~0.8배),
  // 머리 위끝은 83(공 지름 1.3배). 머리 아랫부분이 바닥 공에 먼저 닿는다(그래서 킥은 몸 앞 낮은 공이 머리 · 몸 · 발 어디에 닿아도 된다 — tryKick)
  const HEAD_R = 33, HEAD_Y = 50, BODY_R = 16, BODY_Y = 20, HIP_Y = 12, LEG = 11, FOOT_R = 9;
  // 선수 — 레퍼런스처럼 공 지름 3배(189) 높이를 1초 동안 뜨는 점프, 살짝 미끄러지듯 서는 걸음
  const SPEED = 4.6, JUMP_V = 13, G_P = 0.433, ACC_G = 0.26, ACC_A = 0.16;
  const KICK_T = 18, JUMP_BUF = 6, KICK_BUF = 8;
  const START_X = 250, DROP_Y = 150;
  // 선수에 닿은 공 — 거의 그대로 되튀고(e), 살짝만 닿아도 이만큼은 튕겨 나가며(POP) 위로도 뜬다(UP)
  const E_HEAD = 0.92, E_BODY = 0.86, E_FOOT = 0.8;
  const POP_HEAD = 7.5, POP_BODY = 7.5, POP_FOOT = 7;
  const UP_HEAD = 5, UP_BODY = 5.5, UP_FOOT = 5;
  const HEAD_LIFT = 0.6; // 뛰어오르는 머리가 공에 싣는 위로 빠르기 몫
  // 낀 공 — 두 선수(또는 선수와 크로스바 · 벽) 사이에서 이만큼 못 움직이면 위로 튀겨 빼낸다. 빠져나가는 동안은 선수를 뚫고 지나간다
  // (그동안에도 선수 안에 남아 있으면 GHOST_MORE 프레임까지 더, 그 뒤에도 남았으면 GHOST_LAST 프레임 동안 한 프레임에 GHOST_PUSH 씩 밀어낸다 — 끝나는 순간 확 튕겨 나오지 않게)
  const WEDGE_T = 16, WEDGE_MOVE = 26, POP_V = 12.5, GHOST_T = 16, GHOST_MORE = 20, GHOST_LAST = 20, GHOST_PUSH = 6;
  // 눌린 공을 차면 거의 곧게 위로(앞으로 조금) 띄운다 — 낮게 날아가 상대 몸을 뚫고 골이 되지 않게
  const CHIP_V = 12, CHIP_VK = 2.5, CHIP_X = 2.6;
  // 골대 앞(크로스바 끝 아래까지) — 여기서 빼내는 공은 경기장 쪽으로 보낸다(크로스바에 막히거나 골키퍼를 뚫고 골망으로 가지 않게)
  const GOAL_ZONE = GOAL_W + BALL_R + BAR_R + 12;
  const STEP_MS = 1000 / 60;
  const SAVE_VER = 4; // 판 형식 — 2: 큰 공(BALL_R 26) · 낀 공 빼내기 · 3: 머리만 한 공(BALL_R 32) · 깊어진 골대(GOAL_W 108) · 4: 낮은 머리 · 높아진 크로스바 · 아웃
  const GOAL_PT = 120, READY_PT = 60, OVER_PT = 80, COUNT_CD = 180, RESUME_CD = 180, SHORT_CD = 60, LOCAL_RESUME_CD = 90;
  // 아웃 — 레퍼런스처럼 공이 크로스바 위로 골라인을 다 넘어가면(골대 지붕 위 · 뒤) 「아웃!」을 OUT_PT(2초) 동안 보이고(그동안에도 시계는 간다),
  // 막던 쪽 골대 앞(페널티 줄 끝 — 골라인에서 OUT_X)에 공을 떨어뜨려 다시 한다. 공격하던 쪽은 제 킥오프 자리로 물러나고(공에서 공 지름 7배쯤), 막던 쪽은 그 자리에 선다
  const OUT_PT = 120, OUT_X = 112;
  const SHORT_FREEZE_MS = 2500; // 이보다 짧게 멈췄다 풀리면 3 · 2 · 1 대신 1 만 세고 이어 간다
  const PH = ["wait", "ready", "play", "goal", "over"]; // 판 단계 — 메시지에는 번호로
  const INTERP = 6; // guest 가 그릴 때 늦춰 보는 프레임(100ms) — 그 사이 판 두 장을 이어 그린다
  // host 가 guest 소식을 보는 기준 — guest 는 0.2초마다 입력을 보낸다
  const STALE_MS = 450;   // 이만큼 입력이 없으면 guest 가 누르던 방향을 뗀 것으로 본다(마지막 입력대로 계속 달리지 않게)
  const SILENT_MS = 1000; // 이만큼 입력이 없으면 멈춘다
  const LAG_MS = 1200;    // guest 가 이만큼 host 판을 못 받았다고 하면 멈춘다(host → guest 쪽만 끊긴 경우)
  const GOAL_KEEP = 600;  // 득점 일은 이 프레임(10초) 동안 판에 실어 보낸다 — 끊겼다 돌아온 guest 도 득점을 센다
  const FONT = '"Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';
  const TEAM = [
    { main: "#2f6bff", dark: "#1c48c9", light: "#dbe7ff", shorts: "#173a8f", sock: "#f8fafc" },
    { main: "#ff7a3d", dark: "#d4521a", light: "#ffe3d4", shorts: "#8f2f10", sock: "#f8fafc" },
  ];
  // 컴퓨터 — 레퍼런스 AI Skill(Low · Medium · Good · Best)처럼 네 단계. 사람과 같은 단추(좌우 · 점프 · 킥)로만 움직인다.
  // 몇 가지 단추 조합을 판을 복사해 미리 굴려 보고 가장 좋은 것을 고른다(아래 「컴퓨터」). 단계는 빠르기(spd) · 내다보는 길이(hz) ·
  // 다시 생각하는 간격(every) · 판단 흔들림(err)으로 나누고, 손이 늦는 프레임(lag)은 쉬움만 둔다 — 늦게 누르는 컴퓨터는 골문을 지키며 걷어 내기만 하는
  // 사람에게 크게 졌다(보통에 lag 3 이면 30판에 6승 17패). 내다보는 길이는 모두 32 이상(짧으면 골키퍼에 맞고 되튀는 공을 못 봐 공격도 약해졌다)
  //   hold 고른 조합을 누르는 프레임(그 뒤는 「공 뒤에 붙어 밀기」로 굴려 본다) · err 판단 흔들림(같은 판에서도 늘 똑같이 움직이지 않게)
  const AI_LEVEL = {
    easy: { hz: 32, hold: 8, lag: 8, spd: 0.85, every: 6, err: 0.08 },
    normal: { hz: 36, hold: 10, lag: 0, spd: 0.88, every: 3, err: 0.04 },
    hard: { hz: 40, hold: 12, lag: 0, spd: 0.93, every: 3, err: 0.03 },
    best: { hz: 48, hold: 12, lag: 0, spd: 1, every: 2, err: 0.02 },
  };
  // 화질 — 레퍼런스의 Quality(Low · Medium · Good · Best)처럼 네 단계(낮음 · 보통 · 좋음 · 최고). 그리기만 바꾼다(판 · 물리 · 통신은 그대로)
  //   dpr 화면 픽셀 배율 상한 · bg 배경 자세히(0 하늘 · 옥상 · 바닥만, 1 건물 창 · 철망 · 잔디 줄무늬 빼고, 2 다) · shadow 그림자 ·
  //   net 골망 그물코 · shade 공 · 유니폼 입체 무늬 · fx 불꽃 · 꽃가루 몫 · trail 빠른 공 잔상 수
  const QUALITY = {
    low: { dpr: 1, bg: 0, shadow: false, net: false, shade: false, fx: 0.25, trail: 0 },
    medium: { dpr: 1.5, bg: 1, shadow: true, net: true, shade: false, fx: 0.6, trail: 0 },
    good: { dpr: 2, bg: 2, shadow: true, net: true, shade: true, fx: 1, trail: 2 },
    best: { dpr: 3, bg: 2, shadow: true, net: true, shade: true, fx: 1.4, trail: 3 },
  };
  const hasKey = (o, k) => typeof k === "string" && Object.prototype.hasOwnProperty.call(o, k); // 저장된 값이 표에 있는 이름인지(constructor 같은 것 빼고)


  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const r1 = (v) => Math.round(v * 10) / 10;
  function rngOf(seed) { // 작은 씨앗 난수(mulberry32) — 컴퓨터 · 효과
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function sfx(name, arg) { try { if (window.HKSound) window.HKSound.play(name, arg); } catch (_) { /* 소리는 부가 기능 */ } }

  // ───────────────────────── 판 (물리) ─────────────────────────
  function newPlayer(side) {
    return { side, x: side ? W - START_X : START_X, y: GROUND, vx: 0, vy: 0, face: side ? -1 : 1, ground: true, kick: 0, hit: false, jb: 0, kb: 0, spd: 1, run: 0 };
  }
  function newState(minutes) {
    return {
      frame: 0, phase: "wait", pt: 0, cd: 0, clock: minutes * 3600, minutes,
      score: [0, 0], ball: { x: W / 2, y: DROP_Y, vx: 0, vy: 0, rot: 0 },
      pl: [newPlayer(0), newPlayer(1)],
      ev: 0, stats: { kicks: [0, 0], heads: [0, 0] }, played: 0, stuck: 0, conceded: -1,
      ver: SAVE_VER, wedge: 0, wx: 0, wy: 0, wya: 0, ghost: 0, gx: 0, pops: 0, // 판 형식 번호(저장한 판 이어 하기) · 낀 공 — 낀 프레임 · 낀 자리 · 선수를 뚫고 빠져나가는 남은 프레임 · 그 연장 · 빼낸 횟수(좌우 번갈아)
      out: 0, outs: [0, 0], // 아웃 중이면 막던 쪽 + 1(「아웃!」 · 시계는 간다) · 쪽마다 아웃이 난 횟수(그 쪽 골대 위로 넘어감)
      ties: Math.random() < 0.5 ? 0 : 1, // 공에 두 선수가 똑같이 닿을 때 누구를 나중에 볼지 — 번갈아(첫 번은 무작위)
    };
  }
  // 킥오프 자리 — 선수는 제자리, 공은 가운데 위에서 떨어진다(먹힌 쪽으로 살짝)
  function placeKickoff(S, toward) {
    for (const p of S.pl) {
      const fresh = newPlayer(p.side);
      Object.assign(p, fresh, { spd: p.spd });
    }
    Object.assign(S.ball, { x: W / 2, y: DROP_Y, vx: toward ? toward * 0.9 : 0, vy: 0 });
    S.stuck = 0; S.wedge = 0; S.ghost = 0; S.gx = 0; S.out = 0;
  }
  // 아웃 뒤 자리 — d: 막던 쪽(그 쪽 골대 위로 넘어감). 공은 d 쪽 골대 앞에서 떨어지고, 공격하던 쪽은 제 킥오프 자리로 물러나며(막던 선수와 겹치면 더 뒤로),
  // 막던 쪽은 그 자리 땅에 선다(뛰던 중이면 내려선다 — 「아웃!」 동안 판이 멈춰 있으니 공중에 떠 있지 않게)
  function placeOut(S, d) {
    const att = S.pl[1 - d], def = S.pl[d];
    Object.assign(att, newPlayer(att.side), { spd: att.spd });
    if (Math.abs(att.x - def.x) < HEAD_R * 2.2) att.x = clamp(def.x + (att.side ? 1 : -1) * HEAD_R * 2.2, HEAD_R, W - HEAD_R);
    if (Math.abs(att.x - def.x) < HEAD_R * 2.2) att.x = clamp(def.x - (att.side ? 1 : -1) * HEAD_R * 2.2, HEAD_R, W - HEAD_R);
    Object.assign(def, { y: GROUND, vx: 0, vy: 0, ground: true, kick: 0, hit: false, jb: 0, kb: 0 });
    Object.assign(S.ball, { x: d === 0 ? GOAL_W + OUT_X : W - GOAL_W - OUT_X, y: DROP_Y, vx: 0, vy: 0 });
    S.stuck = 0; S.wedge = 0; S.ghost = 0; S.gx = 0;
  }

  // 차는 다리 각도 — 0 은 곧게 아래, + 는 앞으로. 뒤로 뺐다(준비) → 앞으로 휘두름(때림) → 돌아옴
  function legAngle(p) {
    if (!p.kick) return p.ground ? 0.12 : 0.45;
    const s = 1 - p.kick / KICK_T;
    if (s < 0.18) return lerp(0.12, -0.6, s / 0.18);
    if (s < 0.52) return lerp(-0.6, 1.95, (s - 0.18) / 0.34);
    return lerp(1.95, 0.12, (s - 0.52) / 0.48);
  }
  function footOf(p) {
    const a = legAngle(p);
    return { x: p.x + Math.sin(a) * LEG * p.face, y: p.y - HIP_Y + Math.cos(a) * LEG, a };
  }
  const striking = (p) => p.kick > 0 && !p.hit && 1 - p.kick / KICK_T >= 0.18 && 1 - p.kick / KICK_T <= 0.6;

  // 선수 한 칸 — inp: { l, r, jp(이번에 점프 누름), kp(이번에 킥 누름) }
  function stepPlayer(p, inp, fx) {
    const dir = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
    const target = dir * SPEED * p.spd;
    p.vx += (target - p.vx) * (p.ground ? ACC_G : ACC_A);
    if (Math.abs(p.vx) < 0.02) p.vx = 0;
    if (inp.jp) p.jb = JUMP_BUF;
    if (inp.kp) p.kb = KICK_BUF;
    if (p.jb > 0) {
      p.jb--;
      if (p.ground) { p.vy = -JUMP_V; p.ground = false; p.jb = 0; if (fx) fx("jump", p.side); }
    }
    p.vy += G_P;
    p.x += p.vx;
    p.y += p.vy;
    if (p.y >= GROUND) { p.y = GROUND; p.vy = 0; p.ground = true; } else p.ground = false;
    p.x = clamp(p.x, HEAD_R, W - HEAD_R);
    if (p.ground && p.vx) p.run += Math.abs(p.vx);
    if (p.kick > 0) p.kick--;
    if (p.kb > 0) {
      p.kb--;
      if (!p.kick) { p.kick = KICK_T; p.hit = false; p.kb = 0; if (fx) fx("swing", p.side); }
    }
    // 골대 지붕에 머리가 닿으면 막힌다
    for (const bar of BARS) {
      const c = closestOnSeg(p.x, p.y - HEAD_Y, bar);
      const dx = p.x - c.x, dy = p.y - HEAD_Y - c.y, d = Math.hypot(dx, dy), rr = HEAD_R + BAR_R;
      if (d < rr && d > 0.0001) {
        const nx = dx / d, ny = dy / d;
        p.x += nx * (rr - d); p.y += ny * (rr - d);
        if (ny > 0.3 && p.vy < 0) p.vy = 0;
        if (Math.abs(nx) > 0.5) p.vx = 0;
        if (p.y > GROUND) p.y = GROUND;
        p.x = clamp(p.x, HEAD_R, W - HEAD_R);
      }
    }
  }
  const BARS = [
    { ax: 0, ay: ROOF_Y, bx: GOAL_W, by: BAR_Y },
    { ax: W, ay: ROOF_Y, bx: W - GOAL_W, by: BAR_Y },
  ];
  function closestOnSeg(x, y, s) {
    const abx = s.bx - s.ax, aby = s.by - s.ay;
    const t = clamp(((x - s.ax) * abx + (y - s.ay) * aby) / (abx * abx + aby * aby), 0, 1);
    return { x: s.ax + abx * t, y: s.ay + aby * t };
  }

  // 선수끼리 — 옆으로 밀어내고, 위에서 떨어지면 상대 머리 위에 잠깐 올라섰다 미끄러진다
  function collidePlayers(a, b) {
    const dx = b.x - a.x, adx = Math.abs(dx);
    const reach = HEAD_R * 2 - 8;
    if (adx >= reach) return;
    const [top, low] = a.y < b.y ? [a, b] : [b, a];
    const headTop = low.y - HEAD_Y - HEAD_R;
    if (top.y <= headTop + 10 && top.vy >= 0 && adx < HEAD_R + BODY_R) {
      top.y = headTop + 4; top.vy = 0; top.ground = true;
      top.x += (top.x >= low.x ? 1 : -1) * 1.4; // 머리 위에 오래 서 있지 못하게
      top.x = clamp(top.x, HEAD_R, W - HEAD_R);
      return;
    }
    if (top.y < headTop + 4) return; // 머리 위로 넘어가는 중
    const push = (reach - adx) / 2, s = dx >= 0 ? 1 : -1;
    a.x -= s * push; b.x += s * push;
    if ((b.vx - a.vx) * s < 0) { const m = (a.vx + b.vx) / 2; a.vx = m; b.vx = m; }
    a.x = clamp(a.x, HEAD_R, W - HEAD_R); b.x = clamp(b.x, HEAD_R, W - HEAD_R);
    const gap = Math.abs(b.x - a.x);
    if (gap < reach - 0.5) { // 벽에 몰려 다 못 밀었으면 벽 아닌 쪽을 더 민다
      const atWall = (p) => p.x <= HEAD_R + 0.5 || p.x >= W - HEAD_R - 0.5;
      if (atWall(a)) b.x = clamp(b.x + s * (reach - gap), HEAD_R, W - HEAD_R);
      else a.x = clamp(a.x - s * (reach - gap), HEAD_R, W - HEAD_R);
    }
  }

  // 공과 원(머리 · 몸 · 발 · 기둥) — 겹치면 밀어내고 튕긴다. 부딪친 빠르기를 돌려준다(안 닿으면 0)
  // 선수에 닿으면(pop · up) 거의 그대로 되튀고, 살짝 닿아도 pop 만큼은 튕겨 나가며, 아래에서 받친 게 아니면 위로 up 만큼은 뜬다
  function hitCircle(b, cx, cy, cr, cvx, cvy, e, pop, up) {
    const dx = b.x - cx, dy = b.y - cy, rr = BALL_R + cr, d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) return 0;
    const d = Math.sqrt(d2) || 0.0001, nx = dx / d, ny = dy / d;
    b.x = cx + nx * rr; b.y = cy + ny * rr;
    const vn = (b.vx - cvx) * nx + (b.vy - cvy) * ny;
    if (vn < 0) {
      const out = pop ? Math.max(-vn * e, pop) : -vn * e; // 떨어지는 빠르기(닿은 쪽으로)
      b.vx += (out - vn) * nx; b.vy += (out - vn) * ny;
      if (up && ny >= 0.55 && b.y > GROUND - BALL_R - 6) {
        // 선수 밑(바닥)에 깔린 공 — 바닥으로 짓누르지 않고 옆으로 튀어 나간다(밟고 선 공이 발밑에 갇히지 않게)
        b.vx = (nx >= 0 ? 1 : -1) * Math.max(Math.abs(b.vx), pop || up); b.vy = -up;
      } else if (up && ny < 0.55 && b.vy > -up) b.vy = -up;
      return { imp: -vn, nx, ny };
    }
    return { imp: 0.0001, nx, ny };
  }

  // 킥 — 다리를 휘두르는 동안 발에 닿으면 찬다. 발이 움직이는 방향(닿은 때)과 닿은 자리로 방향이, 휘두름 한가운데일수록 세게.
  // 머리가 크고 낮아 몸 앞 낮은 공은 발보다 머리 아랫부분 · 몸에 먼저 닿는다 — 휘두르는 중(뒤로 뺄 때 포함)에 머리 가운데보다 낮은 몸 앞 공이
  // 머리 · 몸 · 발 어디에 닿아도 찬 것으로 본다(헛발이 되지 않게. 그보다 높은 공은 헤딩).
  // 낀 공(상대 몸 · 벽에 눌린 공)을 차면 거의 곧게 위로 떠올라 그 사이를 빠져나간다 — 눌린 채 차도 헛발이 되지 않고, 낮게 날아가 상대 몸을 뚫고 골이 되지도 않게.
  // 다만 골대 앞 높은 곳(지붕 밑 · 크로스바 끝)에 눌린 공은 위가 막혀 있으니 경기장 쪽 옆으로 뺀다 — 위로 띄우면 지붕에 맞고 골대 안쪽 아래로 꺾여
  // 뚫고 지나가는 동안 골키퍼 몸을 지나 골망으로 들어갔다
  function tryKick(S, p, fx) {
    if (!p.kick || p.hit) return false;
    const s = 1 - p.kick / KICK_T;
    if (s > 0.6) return false;
    const b = S.ball;
    let f = footOf(p), dx = b.x - f.x, dy = b.y - f.y, d = Math.hypot(dx, dy), t, body = false;
    if (s >= 0.18 && d <= BALL_R + FOOT_R + 2) {
      if ((b.x - p.x) * p.face < -6) return false; // 등 뒤 공은 못 찬다
      t = clamp((s - 0.18) / 0.34, 0, 1);
    } else {
      if ((b.x - p.x) * p.face < 6 || b.y < p.y - HEAD_Y || nearPart(b, p).g - BALL_R > 2) return false;
      // 휘두름 한가운데쯤 발로 찬 것으로 친다
      t = 0.55; body = true;
      const a = lerp(-0.6, 1.95, t);
      f = { x: p.x + Math.sin(a) * LEG * p.face, y: p.y - HIP_Y + Math.cos(a) * LEG, a };
      dx = b.x - f.x; dy = b.y - f.y; d = Math.hypot(dx, dy);
    }
    const timing = Math.sin(Math.PI * clamp(t * 1.12, 0, 1));
    const power = 10.5 + 8.5 * timing;
    const nx = dx / (d || 1), ny = dy / (d || 1);
    const pin = pinnedBy(S, b, p);
    if (pin === "opp" || pin === "wall" || (S.wedge >= 3 && pin !== "bar")) {
      // 눌린 공 — 거의 곧게 위로(앞으로 조금). 골대 앞이면 경기장 쪽으로(크로스바에 막히거나 골키퍼를 뚫고 골망으로 가지 않게).
      // 머리들 사이를 빠져나갈 때까지 선수를 뚫고 지나간다(S.ghost)
      const gd = goalDir(b.x);
      if (gd && (nearBar(b) || b.y - BALL_R < BAR_Y + BAR_R + 4)) { b.vx = gd * 7.5; b.vy = -2; } // 골대 앞 높은 곳 — 경기장 쪽 옆으로
      else {
        b.vx = (gd || p.face) * (gd ? 4 : CHIP_X);
        b.vy = -(CHIP_V + CHIP_VK * timing);
      }
      S.ghost = Math.max(S.ghost, 12); S.gx = 0; S.wedge = 0;
    } else {
      const tx = Math.cos(f.a) * p.face, ty = -Math.sin(f.a);
      let ux = tx * 0.62 + nx * 0.38, uy = ty * 0.62 + ny * 0.38;
      if (ux * p.face < 0.22) ux = 0.22 * p.face;
      const m = Math.hypot(ux, uy) || 1;
      ux /= m; uy /= m;
      b.vx = ux * power + p.vx * 0.3;
      b.vy = uy * power + Math.min(0, p.vy) * 0.3;
      // 빠져나가는 중(S.ghost)에 다시 찬 공은 선수에 다시 부딪친다 — 세게 찬 공이 상대 몸을 뚫고 날아가지 않게
      S.ghost = 0; S.gx = 0;
      if (body) {
        // 머리 · 몸에 먼저 닿은 공 — 닿은 부위 밖으로만 꺼낸다(발 자리로 옮기지 않는다)
        const q = nearPart(b, p), ex = b.x - q.x, ey = b.y - q.y, e = Math.hypot(ex, ey) || 1, rr = q.r + BALL_R + 0.5;
        if (e < rr) { b.x = q.x + (ex / e) * rr; b.y = q.y + (ey / e) * rr; }
      } else {
        const rr = BALL_R + FOOT_R + 0.5;
        b.x = f.x + nx * rr; b.y = f.y + ny * rr;
      }
      b.y = Math.min(b.y, GROUND - BALL_R);
    }
    p.hit = true;
    S.stats.kicks[p.side]++;
    if (fx) fx("kick", p.side, Math.round(power));
    return true;
  }
  // 차는 선수 말고 다른 것에 공이 눌려 있나 — "opp" 상대 몸 · "wall" 벽 · "bar" 크로스바 · "" 아님
  function pinnedBy(S, b, p) {
    if (gapTo(b, S.pl[1 - p.side]) < BALL_R + 2) return "opp";
    if (b.x < BALL_R + 2 || b.x > W - BALL_R - 2) return "wall";
    return nearBar(b) ? "bar" : "";
  }
  const nearBar = (b) => BARS.some((bar) => { const c = closestOnSeg(b.x, b.y, bar); return Math.hypot(b.x - c.x, b.y - c.y) < BALL_R + BAR_R + 2; });
  const goalDir = (x) => (x < GOAL_ZONE ? 1 : x > W - GOAL_ZONE ? -1 : 0); // 골대 앞이면 경기장 쪽 방향(1 오른쪽 · -1 왼쪽), 아니면 0

  // 공과 가장 가까운 선수 부위(머리 · 몸 · 발) — g: 틈(음수면 겹침), x · y: 그 부위 가운데, r: 그 부위 반지름
  function nearPart(b, p) {
    const f = footOf(p);
    let best = null;
    for (const [x, y, r] of [[p.x, p.y - HEAD_Y, HEAD_R], [p.x, p.y - BODY_Y, BODY_R], [f.x, f.y, FOOT_R]]) {
      const g = Math.hypot(b.x - x, b.y - y) - r;
      if (!best || g < best.g) best = { g, x, y, r };
    }
    return best;
  }
  // 공과 선수 사이 가장 가까운 틈 — 공 반지름보다 작으면 닿음
  const gapTo = (b, p) => nearPart(b, p).g;
  // 공이 두 선수 사이(양옆)에 눌렸나 — 공이 둘 사이에 있고, 두 선수 사이 틈이 공보다 좁거나 겨우 맞을 때(빠르게 오가며 한쪽에서 잠깐 떨어져 있어도).
  // 두 머리 위에 얹힌 공(닿은 자리가 둘 다 공 아래)은 그냥 튀면 된다
  function pinched(S, b) {
    const a = S.pl[0], c = S.pl[1];
    if ((b.x - a.x) * (b.x - c.x) >= 0) return false;
    const qa = nearPart(b, a), qc = nearPart(b, c);
    if (qa.g >= BALL_R + 8 || qc.g >= BALL_R + 8 || qa.g + qc.g >= 2 * BALL_R + 6) return false;
    const under = (q) => b.y - q.y < -0.6 * Math.hypot(b.x - q.x, b.y - q.y);
    return !(under(qa) && under(qc));
  }
  // 공이 TOP_Y 보다 높이 솟지 않게 위로 가는 빠르기를 덜어 낸다(꼭짓점이 TOP_Y)
  function topOut(b) {
    if (b.vy >= 0) return;
    const lim = Math.sqrt(2 * G_BALL * Math.max(0, b.y - TOP_Y));
    if (-b.vy > lim) b.vy = -lim;
  }
  function capSpeed(b) {
    const v = Math.hypot(b.vx, b.vy);
    if (v > MAX_V) { b.vx *= MAX_V / v; b.vy *= MAX_V / v; }
  }

  // 공 한 칸(SUB 번 나눠 움직여 빠른 공이 머리 · 기둥을 뚫지 않게)
  function stepBall(S, fx) {
    const b = S.ball, h = 1 / SUB, air = Math.pow(AIR, h), airX = Math.pow(AIR_X, h), roll = Math.pow(ROLL, h);
    // S.ghost > 0 — 낀 공을 빼내는 중(눌린 공을 찬 때 포함): 선수를 뚫고 지나간다(킥은 된다). 이번 칸 안에서 찬 공도 바로 뚫고 나가게 칸마다 본다
    for (let k = 0; k < SUB; k++) {
      b.vy += G_BALL * h;
      b.vx *= airX; b.vy *= air;
      b.x += b.vx * h; b.y += b.vy * h;
      b.rot += (b.vx * h) / BALL_R;
      // 공에서 먼 선수를 먼저, 가까운(더 깊이 닿은) 선수를 나중에 본다 — 나중에 본 쪽이 공의 마지막 방향을 정한다.
      // 왼쪽 · 오른쪽을 바꿔도 같은 규칙이라 어느 편도 늘 유리하지 않다(프레임 번호로 번갈아 보면 경기 흐름에 따라 한쪽으로 쏠렸다)
      // 거의 같은 거리(킥오프처럼 두 선수가 거울처럼 같이 다가올 때 — 소수점 끝자리만 다르다)는 비긴 것으로 보고, 비길 때마다 번갈아 정한다.
      // 소수점 끝자리로 정하면 늘 같은 쪽(오른쪽)이 나중이 되어 킥오프 공을 가져갔고, 프레임 번호로 정하면 킥오프 때가 늘 같아 한쪽으로 쏠렸다
      const g0 = gapTo(b, S.pl[0]), g1 = gapTo(b, S.pl[1]);
      const tie = Math.abs(g0 - g1) < 1e-6 && ++S.ties;
      const order = tie ? (S.ties % 2 ? [S.pl[1], S.pl[0]] : S.pl) : g0 < g1 ? [S.pl[1], S.pl[0]] : S.pl;
      // 양옆에서 눌린 공은 튕김을 더하지 않고 덜 튄다(사이에서 떨기만 하니) — 곧 unwedge 가 빼낸다
      const squeezed = !(S.ghost > 0) && pinched(S, b);
      for (const p of order) {
        tryKick(S, p, fx);
        if (S.ghost > 0) continue;
        // 머리 — 통통 되튄다. 뛰어오르며 받으면 세지만 너무 높이 솟지 않게 위로 미는 힘은 덜 싣는다
        const hd = hitCircle(b, p.x, p.y - HEAD_Y, HEAD_R, p.vx, p.vy < 0 ? p.vy * HEAD_LIFT : p.vy, squeezed ? 0.3 : E_HEAD, squeezed ? 0 : POP_HEAD, UP_HEAD);
        if (hd) {
          if (hd.ny < -0.2) {
            // 헤딩은 바라보는 쪽(상대 골대)으로 — 머리 윗부분에 맞으면 앞으로 꺾어 보낸다. 얹힌 공도 앞으로 흘러내린다(머리 위에 머물지 않게)
            if (hd.imp > 0.001) b.vx += p.face * Math.min(3.5, 1.2 + hd.imp * 0.25);
            if (b.vy < 0) b.vy *= 0.92;
            if (hd.imp > 3.4) { S.stats.heads[p.side]++; if (fx) fx("head", p.side, Math.round(hd.imp)); }
          } else if (hd.imp > 4 && fx) fx("thud", p.side);
        }
        const bd = hitCircle(b, p.x, p.y - BODY_Y, BODY_R, p.vx, p.vy, squeezed ? 0.3 : E_BODY, squeezed ? 0 : POP_BODY, UP_BODY);
        if (bd && bd.imp > 2.5 && fx) fx("thud", p.side);
        if (!striking(p)) { const f = footOf(p); hitCircle(b, f.x, f.y, FOOT_R, p.vx, p.vy, squeezed ? 0.3 : E_FOOT, squeezed ? 0 : POP_FOOT, UP_FOOT); }
      }
      if (squeezed && !(S.ghost > 0)) {
        // 두 선수 사이에 눌린 공 — 두 선수가 번갈아 밀어 좌우로 떨거나 한 선수를 뚫고 나가지(골키퍼를 뚫고 골망으로) 않게
        // 두 선수 가운데로 모으고 같이 움직인다. 같이 밀려 가도 unwedge 가 곧 위로 빼낸다
        const a = S.pl[0], c = S.pl[1];
        b.x += ((a.x + c.x) / 2 - b.x) * 0.5;
        b.vx = (a.vx + c.vx) / 2;
      }
      for (const bar of BARS) {
        const c = closestOnSeg(b.x, b.y, bar);
        const hb = hitCircle(b, c.x, c.y, BAR_R, 0, 0, 0.7);
        if (hb && hb.imp > 2 && fx) fx("bar", 0, Math.round(hb.imp));
        // 골대 지붕 위에 얹혀 느리게 구르는 공은 경기장 쪽으로 미끄러져 내려온다(지붕 위에 머물지 않게)
        if (hb && hb.ny < -0.5 && Math.abs(b.vx) < 3) b.vx += (bar.bx > bar.ax ? 1 : -1) * 0.35 * h;
        // 빠져나가는 중(선수를 뚫고 지나가는 공)이 골대에 맞으면 늘 경기장 쪽으로 — 지붕 밑에 맞고 골대 안쪽으로 꺾여 골키퍼를 뚫고 골망에 들어가지 않게
        if (hb && S.ghost > 0) { const out = bar.bx > bar.ax ? 1 : -1; if (b.vx * out < 3) b.vx = out * 3; }
      }
      const inNet = b.y > ROOF_Y; // 골대 뒤 그물(지붕 아래)
      if (b.y > GROUND - BALL_R) {
        b.y = GROUND - BALL_R;
        if (b.vy > 0) { if (b.vy > 2.6 && fx) fx("bounce", 0, Math.round(b.vy)); b.vy = -b.vy * BOUNCE; if (b.vy > -1.05) b.vy = 0; }
        b.vx *= roll;
      }
      if (b.x < BALL_R) { b.x = BALL_R; if (b.vx < 0) b.vx = -b.vx * (inNet ? 0.22 : 0.75); }
      if (b.x > W - BALL_R) { b.x = W - BALL_R; if (b.vx > 0) b.vx = -b.vx * (inNet ? 0.22 : 0.75); }
      if (b.y < CEIL + BALL_R) { b.y = CEIL + BALL_R; if (b.vy < 0) b.vy = -b.vy * 0.5; }
      topOut(b);
      capSpeed(b);
    }
    if (S.ghost > 0) {
      S.ghost--; S.wedge = 0;
      // 빠져나가는 동안 아직 선수 안에 남아 있으면 조금 더 뚫고 지나간다 — 끝나는 순간 선수 밖으로 확 튕겨 나오지(순간이동) 않게.
      // 그래도(GHOST_MORE 뒤에도 — 공과 같이 뛰어오르는 선수 등) 남아 있으면 튕기는 힘 없이 한 프레임에 GHOST_PUSH 씩 바깥으로 밀어낸다(GHOST_LAST 까지)
      if (!S.ghost && S.pl.some((p) => gapTo(b, p) < BALL_R - 3)) {
        S.gx = (S.gx | 0) + 1;
        if (S.gx <= GHOST_MORE + GHOST_LAST) S.ghost = 1;
        if (S.gx > GHOST_MORE && S.ghost) {
          for (const p of S.pl) {
            const q = nearPart(b, p), need = q.r + BALL_R - Math.hypot(b.x - q.x, b.y - q.y);
            if (need <= 0) continue;
            const dx = b.x - q.x, dy = b.y - q.y, d = Math.hypot(dx, dy) || 1, m = Math.min(GHOST_PUSH, need);
            if (b.y + (dy / d) * m > GROUND - BALL_R) b.x += (dx >= 0 ? 1 : -1) * m; // 바닥 쪽으로 막혔으면 옆으로
            else { b.x += (dx / d) * m; b.y += (dy / d) * m; }
            b.x = clamp(b.x, BALL_R, W - BALL_R);
          }
        }
      }
      if (!S.ghost) S.gx = 0;
      return;
    }
    unwedge(S, fx);
    // 벽 · 바닥에 낀 공 — 선수를 밀어낸다(공은 벽을 뚫지 못하니)
    for (const p of S.pl) {
      for (const [cy, cr] of [[p.y - HEAD_Y, HEAD_R], [p.y - BODY_Y, BODY_R]]) {
        const dx = p.x - b.x, dy = cy - b.y, d = Math.hypot(dx, dy), rr = cr + BALL_R - 1;
        if (d < rr) { p.x = clamp(p.x + (dx >= 0 ? 1 : -1) * Math.min(6, rr - Math.abs(dy) * 0.3 - Math.abs(dx) + 1), HEAD_R, W - HEAD_R); }
      }
    }
  }

  // 낀 공 빼내기 — 두 선수 사이(발 · 몸 · 머리), 선수와 크로스바 · 벽 사이, 머리 위에 얹혀 WEDGE_T 프레임 동안 제자리면
  // 위로 세게 튀겨(좌우는 번갈아 — 어느 편도 유리하지 않게) 잠깐 선수를 뚫고 빠져나가게 한다.
  // 골대 앞이면 경기장 쪽으로(크로스바 끝에 막히거나 골키퍼를 뚫고 골망으로 가지 않게), 크로스바 밑에 끼었으면 위가 막혔으니 경기장 가운데 쪽으로 빼낸다.
  // 경기 중에만 — 골 뒤 축하 때 골망 안 공에 선수가 닿아도 튀어나오지 않게
  function unwedge(S, fx) {
    const b = S.ball;
    if (S.phase !== "play") { S.wedge = 0; return; }
    const t0 = gapTo(b, S.pl[0]) < BALL_R + 2, t1 = gapTo(b, S.pl[1]) < BALL_R + 2;
    const bar = nearBar(b);
    const wall = b.x < BALL_R + 2 || b.x > W - BALL_R - 2;
    const headP = S.pl.find((p) => b.y < p.y - HEAD_Y - HEAD_R * 0.4 && Math.hypot(b.x - p.x, b.y - (p.y - HEAD_Y)) < HEAD_R + BALL_R + 2);
    // 두 선수 바로 사이(둘 다 공 한 개 거리 안, 공은 두 머리보다 아래)에 멈춘 공 — 둘이 같이 뛰어올라 잠깐 안 닿아도 낀 것으로 본다(제자리에 죽은 공이 남지 않게)
    const boxed = (b.x - S.pl[0].x) * (b.x - S.pl[1].x) < 0 && Math.hypot(b.vx, b.vy) < 4 &&
      S.pl.every((p) => gapTo(b, p) < BALL_R + 10 && b.y > p.y - HEAD_Y);
    const two = (t0 && t1) || boxed;
    const caught = two || ((t0 || t1) && (bar || wall)) || !!headP;
    if (!caught) {
      // 둘이 같이 뛰어올라 공 위를 넘나드는 동안(공은 두 선수 사이 제자리에서 낮게 튀기만 한다) — 낀 시간을 지우지 않고 멈춰 둔다.
      // 몸이 짧아 두 선수가 바닥 공 위로 같이 뛰면 내려앉을 때만 잠깐 끼고 떨어져, 지우면 1초마다 다시 끼기를 끝없이 되풀이했다
      const hover = S.wedge > 0 && (b.x - S.pl[0].x) * (b.x - S.pl[1].x) < 0 && Math.hypot(b.vx, b.vy) < 6 &&
        S.pl.every((p) => Math.abs(b.x - p.x) < HEAD_R + BALL_R + 24);
      if (!hover) S.wedge = 0;
      return;
    }
    // 낀 자리는 붙잡은 쪽에서 잰다 — 두 선수 사이면 두 선수 가운데에서(둘이 같이 밀려 가도 시간이 쌓이게), 머리 위면 그 머리에서, 크로스바 · 벽이면 그 자리 그대로
    const ref = two ? { x: (S.pl[0].x + S.pl[1].x) / 2, y: (S.pl[0].y + S.pl[1].y) / 2 } : headP || { x: 0, y: 0 };
    const rx = b.x - ref.x, ry = b.y - ref.y;
    // 두 선수 사이 공은 높이를 바닥에서도 잰다 — 둘이 같이 뛰었다 내려앉으며 공을 누르면 두 선수 가운데 높이만 오르내리고 공은 제자리라서
    const moved = Math.hypot(rx - S.wx, ry - S.wy) > WEDGE_MOVE && !(two && Number.isFinite(S.wya) && Math.hypot(rx - S.wx, b.y - S.wya) <= WEDGE_MOVE);
    if (!S.wedge || moved) { S.wedge = 1; S.wx = rx; S.wy = ry; S.wya = b.y; return; }
    if (++S.wedge < WEDGE_T) return;
    S.pops = (S.pops | 0) + 1;
    const gd = goalDir(b.x);
    if (bar && (t0 || t1)) {
      b.vx = (b.x < W / 2 ? 1 : -1) * 7.5; b.vy = -2;
    } else {
      const side = gd || ((S.pops + S.frame) % 2 ? 1 : -1); // 첫 번도 늘 한쪽으로 가지 않게 판 프레임과 섞는다
      b.vx = side * (gd ? 4 : 2.6); b.vy = -POP_V;
    }
    S.ghost = GHOST_T; S.gx = 0; S.wedge = 0;
    if (fx) fx("squeeze", 0);
  }

  // 골 — 공 전체가 골라인(앞 기둥)을 넘어 골대 안(지붕 아래)에 들어가야 골. 지붕은 뚫리지 않으니 골대 안 공은 크로스바 밑으로 들어온 공이다.
  // 골대 안 높은 곳(뒤로 갈수록 높아지는 지붕 밑)에 뜬 공도 골이다 — 크로스바 높이 밑으로 다 내려와야 골로 치면 그 자리에 낀 공을
  // 빼낼 때 골키퍼를 뚫고 골망으로 떨어지는 일이 생겼다
  const roofAt = (d) => ROOF_Y + ((BAR_Y - ROOF_Y) * d) / GOAL_W; // 골대 지붕 높이 — 뒤 벽에서 d 만큼 앞
  function goalSide(b) {
    if (b.x + BALL_R < GOAL_W && b.y > roofAt(b.x)) return 1; // 왼쪽 골대에 들어감 → 오른쪽 팀 득점
    if (b.x - BALL_R > W - GOAL_W && b.y > roofAt(W - b.x)) return 0;
    return -1;
  }
  // 아웃 — 공 전체가 골라인을 넘었는데 골대 지붕보다 위(크로스바 위로 넘어감 · 지붕 위에 얹힘). 그 쪽 골대를 막던 쪽(0 왼쪽 · 1 오른쪽)을 돌려준다
  function outSide(b) {
    if (b.x + BALL_R < GOAL_W && b.y <= roofAt(Math.max(0, b.x))) return 0;
    if (b.x - BALL_R > W - GOAL_W && b.y <= roofAt(Math.max(0, W - b.x))) return 1;
    return -1;
  }

  // 판 한 칸 — inputs[팀]: { l, r, jp, kp }. fx(type, side, n): 소리 · 효과
  function simStep(S, inputs, fx) {
    S.frame++;
    if (S.phase === "wait" || S.phase === "over") return;
    if (S.phase === "ready") {
      if (S.out) {
        // 「아웃!」 동안에도 시계는 간다(레퍼런스처럼). 그 사이 시간이 다 되면 그대로 끝
        S.played++;
        if (S.clock > 0) S.clock--;
        if (S.clock <= 0) { S.out = 0; S.phase = "over"; S.pt = OVER_PT; if (fx) fx("over", 0); return; }
      }
      if (S.pt > 0) S.pt--;
      if (S.pt > 0) return;
      S.phase = "play"; S.out = 0;
      if (fx) fx("whistle", 0);
    }
    for (let i = 0; i < 2; i++) stepPlayer(S.pl[i], inputs[i] || {}, fx);
    collidePlayers(S.pl[0], S.pl[1]);
    stepBall(S, fx);
    const b = S.ball;
    // 어딘가에 걸려 멈춘 공(머리 위 · 지붕 끝)은 4초 뒤 가운데에서 다시
    if (b.y < GROUND - BALL_R - 2 && Math.hypot(b.vx, b.vy) < 0.25) S.stuck++; else S.stuck = 0;
    if (S.phase === "play") {
      S.played++;
      if (S.clock > 0) S.clock--;
      const g = goalSide(b), o = g >= 0 ? -1 : outSide(b);
      if (g >= 0) {
        S.score[g]++;
        S.conceded = 1 - g;
        S.phase = "goal"; S.pt = GOAL_PT;
        if (fx) fx("goal", g, S.score[g]);
      } else if (o >= 0) {
        if (!Array.isArray(S.outs)) S.outs = [0, 0];
        S.outs[o]++;
        placeOut(S, o); S.phase = "ready"; S.pt = OUT_PT; S.out = o + 1;
        if (fx) fx("out", o);
      } else if (S.clock <= 0) {
        S.phase = "over"; S.pt = OVER_PT;
        if (fx) fx("over", 0);
      } else if (S.stuck > 240) {
        placeKickoff(S, 0); S.phase = "ready"; S.pt = READY_PT;
      }
    } else if (S.phase === "goal") {
      if (--S.pt <= 0) {
        if (S.clock <= 0) { S.phase = "over"; S.pt = OVER_PT; if (fx) fx("over", 0); }
        else { placeKickoff(S, S.conceded === 0 ? -1 : 1); S.phase = "ready"; S.pt = READY_PT; }
      }
    }
  }

  // ───────────────────────── 컴퓨터 ─────────────────────────
  // 미리 굴려 보고 고르기 — 단추 조합 9가지(앞 · 그대로 · 뒤 × 그냥 · 점프 · 킥)를 판을 복사해 hz 프레임 앞까지 굴려 보고 가장 좋은 것을 고른다.
  // 처음 hold 프레임은 그 조합대로, 그 뒤는 「공 뒤에 붙어 밀기」(공을 지나가야 하면 뛰어넘기)로 굴린다. 상대는 지금 달리던 쪽으로 계속 달리고,
  // 공이 발 앞에 오면 차고 머리 위로 떨어지면 뛴다고 본다.
  // 좋고 나쁨 — 굴리는 동안 공이 상대 골문에 가까울수록 +, 우리 골문에 가까울수록 −(지키기가 더 무겁다), 골은 크게 ±(빠를수록 크게), 아웃은 AI_OUT_*.
  // 끝에서는 공이 날아가는 쪽(나빠질 때만) · 공을 민 거리 · 공 뒤 자리(공이 우리 골대 가까울수록 무겁게)를 더한다.
  // 손이 늦는 단계(lag)는 정한 단추가 그만큼 뒤에 눌리고, 굴려 볼 때도 이미 눌러 둔 단추를 먼저 누른 뒤 고른다.
  // 화면 · 소리 · 판 난수는 건드리지 않는다(복사한 판에서만 굴린다). 좌우는 바라보는 쪽(face)으로만 정해 어느 편도 유리하지 않다
  const AI_BACK = BODY_R + BALL_R - 2; // 공 뒤에 서는 거리(몸 + 공)
  const AI_REACH = 250, AI_DEF = 3, AI_POS = 0.15, AI_SIDE = 0.1; // 골문까지 거리 눈금 · 지키기 무게 · 공 뒤 자리 무게 · 공보다 우리 골대 쪽에 섰을 때 덤
  const AI_OUT_ATT = -0.4, AI_OUT_DEF = -0.6; // 아웃 값 — 공격하던 쪽(상대 골대 위로 넘김) · 막던 쪽(우리 골대 위로 넘어감)
  const AI_OPP_KICK = 85; // 굴려 볼 때 상대가 차는 거리(바라보는 쪽 공까지)
  const AI_URG = 4; // 공이 우리 골대 가까이 있을 때 끝 자리 값을 키우는 몫
  const AI_HOP = 100; // 굴려 볼 때 공을 지나가야 하면 이만큼 앞에서 뛰어넘는다
  const AI_JUMP_COST = 0.06; // 점프 조합에 빼는 값(비슷하면 땅에 있게)
  const AI_PROG = 0.5; // 굴리는 동안 공을 상대 골대 쪽으로 민 거리 값(구장 너비 하나에 이만큼)
  const AI_PROJ = 24, AI_PROJ_W = 1; // 굴려 본 끝에서 공을 그 빠르기대로 더 보내 보는 프레임 · 그 값의 무게(프레임당)
  const AI_ACTS = [[1, 0, 0], [0, 0, 0], [-1, 0, 0], [1, 1, 0], [0, 1, 0], [-1, 1, 0], [1, 0, 1], [0, 0, 1], [-1, 0, 1]]; // [앞(+1 상대 골대 쪽) · 뒤, 점프, 킥]
  const NO_KEYS = { l: false, r: false, jp: false, kp: false };
  function makeAI(level, seed, extra) {
    const L = Object.assign({}, hasKey(AI_LEVEL, level) ? AI_LEVEL[level] : AI_LEVEL.normal, extra || {});
    return { L, rng: rngOf(seed || 7), plan: null, planT: 0, q: [] };
  }
  function cloneState(S) {
    return {
      frame: S.frame, phase: "play", pt: 0, cd: 0, clock: 1e9, minutes: S.minutes, score: [0, 0], ball: { ...S.ball },
      pl: S.pl.map((p) => ({ ...p })), ev: 0, stats: { kicks: [0, 0], heads: [0, 0] }, played: 0, stuck: 0, conceded: -1,
      ver: S.ver, wedge: S.wedge, wx: S.wx, wy: S.wy, wya: S.wya, ghost: S.ghost, gx: S.gx, pops: S.pops, ties: S.ties, out: 0, outs: [0, 0],
    };
  }
  // 공 자리 값 — 상대 골문(입구 가운데)에 가까울수록 +, 우리 골문에 가까울수록 −
  function ballValue(b, side) {
    const oppX = side === 0 ? W : 0, myX = W - oppX, gy = GROUND - 70;
    return Math.exp(-Math.hypot(b.x - oppX, (b.y - gy) * 0.7) / AI_REACH) - AI_DEF * Math.exp(-Math.hypot(b.x - myX, (b.y - gy) * 0.7) / AI_REACH);
  }
  function rollout(S0, side, act, L, queued) {
    const S = cloneState(S0), me = S.pl[side], opp = S.pl[1 - side], f = me.face;
    const oDir = Math.abs(opp.vx) > 1 ? Math.sign(opp.vx) : 0;
    const theirs = { l: oDir < 0, r: oDir > 0, jp: false, kp: false };
    const nq = queued.length;
    let val = 0, n = 0;
    for (let t = 0; t < L.hz + nq; t++) {
      // 상대 — 공이 발 앞(바라보는 쪽 · 낮은 공)에 오면 찬다, 머리 위로 떨어지는 공에는 뛴다고 본다(걷어 내기 · 헤딩을 미리 보게)
      const tb = S.ball, ahead = (tb.x - opp.x) * opp.face;
      theirs.kp = !opp.kick && ahead > -8 && ahead < AI_OPP_KICK && tb.y > opp.y - HEAD_Y - 20;
      theirs.jp = opp.ground && tb.vy > 0 && Math.abs(tb.x - opp.x) < 60 && tb.y < opp.y - HEAD_Y - 70 && tb.y > opp.y - HEAD_Y - 260;
      let mine;
      if (t < nq) mine = queued[t];
      else {
        const u = t - nq;
        let mv, hop = false;
        if (u < L.hold) mv = act[0] * f;
        else {
          const d = S.ball.x - f * AI_BACK - me.x; mv = d > 8 ? 1 : d < -8 ? -1 : 0;
          // 공 뒤 자리로 가려면 공을 지나가야 할 때(공이 나보다 우리 골대 쪽) — 낮은 공은 앞에서 뛰어넘는다.
          // 그냥 달려가면 공을 우리 골대로 밀어 넣으니, 이게 없으면 우리 골대로 천천히 굴러가는 공을 쫓는 수가 다 자책골로 보여 지켜보기만 했다
          const behind = (S.ball.x - me.x) * f;
          hop = me.ground && behind < 0 && behind > -AI_HOP && S.ball.y > GROUND - 150;
        }
        mine = { l: mv < 0, r: mv > 0, jp: (u === 0 && act[1] === 1) || hop, kp: u === 0 && act[2] === 1 };
      }
      const sc0 = S.score[0] + S.score[1];
      simStep(S, side ? [theirs, mine] : [mine, theirs], null);
      if (S.score[0] + S.score[1] > sc0) return (S.score[side] > 0 ? 1 : -1) * (10 - t * 0.05);
      // 아웃 — 남은 프레임은 아웃 값으로(공격하던 쪽은 기회를 날려 손해, 막던 쪽은 걷어 낸 셈이지만 공이 우리 골대 앞에서 다시 시작한다)
      if (S.out) { const total = L.hz + nq; return (val + (total - n) * (S.out - 1 === side ? AI_OUT_DEF : AI_OUT_ATT)) / total; }
      val += ballValue(S.ball, side);
      n++;
    }
    // 끝 자리 — 공보다 우리 골대 쪽(공 뒤)에 섰으면 조금 좋고, 공 뒤 자리에 가까울수록 좋다(공이 멀어 굴려 봐도 차이가 없을 때 공 쪽으로 가게).
    // 공이 우리 골대에 가까울수록 이 값을 키운다(AI_URG) — 걷어 낸 공이 내 머리 위로 넘어가 우리 빈 골대로 천천히 굴러갈 때
    // 굴려 보는 동안엔 골이 안 나 단추마다 값이 거의 같아(판단 흔들림보다 작아) 제자리에서 갈팡질팡하다 먹혔다
    const gap = Math.abs(S.ball.x - f * AI_BACK - me.x), myX = side === 0 ? 0 : W;
    const urg = 1 + AI_URG * Math.exp(-Math.abs(S.ball.x - myX) / AI_REACH);
    // 굴려 본 끝에서 공이 날아가는 쪽 — 그 빠르기로 AI_PROJ 프레임 더 가면 어디쯤일지도 값에 넣는다(골키퍼 머리에 맞고 되튀어
    // 우리 골대 쪽으로 날아오는 공처럼 굴려 보는 길이 밖에서 벌어질 일을 미리 보게). 나빠지는 쪽으로만 — 좋아지는 쪽까지 넣으면
    // 멀리 차 넣기만 노려 가만히 선 사람에게 2분에 88골을 넣었다(레퍼런스 최강 29골)
    const b = S.ball, px = clamp(b.x + b.vx * AI_PROJ * 0.8, GOAL_W, W - GOAL_W), py = clamp(b.y + b.vy * AI_PROJ + 0.15 * AI_PROJ * AI_PROJ, 0, GROUND - BALL_R);
    const v = Math.min(val / n, (val + AI_PROJ_W * AI_PROJ * ballValue({ x: px, y: py }, side)) / (n + AI_PROJ_W * AI_PROJ)); // 나빠질 때만(공격 쪽으로 부풀리지 않게)
    // 공을 상대 골대 쪽으로 얼마나 몰았나(AI_PROG) — 이게 없으면 「아직 건드리지 말고 끝에 공 바로 뒤에 서 있기」가 늘 「지금 밀기」보다 좋아 보여
    // 가운데에 멈춘 공 앞에서 2분 내내 기다리기만 한 판이 있었다
    return v + AI_PROG * ((S.ball.x - S0.ball.x) * f) / W + urg * (((S.ball.x - me.x) * f > 0 ? AI_SIDE : -AI_SIDE) + AI_POS * (1 - Math.min(1, gap / 500)));
  }
  function aiInput(ai, S, side) {
    const L = ai.L, me = S.pl[side];
    if (S.phase !== "play" && S.phase !== "goal") { ai.plan = null; ai.q.length = 0; return { ...NO_KEYS }; }
    if (!ai.plan || --ai.planT <= 0) {
      let best = -Infinity, pick = AI_ACTS[1];
      for (const act of AI_ACTS) {
        if ((act[1] && !me.ground) || (act[2] && me.kick)) continue;
        // 점프는 1초 동안 공중에 묶이니(공중에선 방향을 잘 못 바꾼다) 값이 거의 같으면 땅에 있는 쪽을 고른다
        const v = rollout(S, side, act, L, ai.q) + (L.err ? (ai.rng() * 2 - 1) * L.err : 0) - (act[1] ? AI_JUMP_COST : 0);
        if (v > best) { best = v; pick = act; }
      }
      ai.plan = { act: pick, t: 0 };
      ai.planT = L.every;
    }
    const a = ai.plan.act, t = ai.plan.t++, mv = a[0] * me.face;
    const now = { l: mv < 0, r: mv > 0, jp: t === 0 && a[1] === 1, kp: t === 0 && a[2] === 1 };
    if (!L.lag) return now;
    // 손이 늦다 — 정한 단추가 lag 프레임 뒤에 눌린다(사람이 보고 누르기까지 걸리는 시간)
    ai.q.push(now);
    return ai.q.length > L.lag ? ai.q.shift() : { ...NO_KEYS };
  }

  // ───────────────────────── 그림 ─────────────────────────
  // 배경(하늘 · 건물 · 옥상 · 철망 · 바닥 · 골대 그물) — 크기 · 화질이 바뀔 때만 다시 그려 둔다.
  // detail(화질 bg): 0 하늘 · 먼 산 · 빌딩 덩어리 · 옥상 벽 · 펜스 기둥 · 현수막 · 바닥 선만, 1 + 해 빛무리 · 구름 · 물탱크 · 계단실 · 실외기 · 조명탑, 2 + 빌딩 창 · 철망 · 잔디 줄무늬
  function paintBackground(g, detail) {
    if (detail == null) detail = 2;
    // 하늘
    const sky = g.createLinearGradient(0, 0, 0, GROUND);
    sky.addColorStop(0, "#3f9fe8"); sky.addColorStop(0.55, "#8fd0fa"); sky.addColorStop(1, "#e3f5ff");
    g.fillStyle = sky; g.fillRect(0, 0, W, GROUND);
    // 해
    if (detail >= 1) {
      const sun = g.createRadialGradient(838, 74, 8, 838, 74, 120);
      sun.addColorStop(0, "rgba(255,250,214,1)"); sun.addColorStop(0.28, "rgba(255,240,170,.85)"); sun.addColorStop(1, "rgba(255,240,170,0)");
      g.fillStyle = sun; g.beginPath(); g.arc(838, 74, 120, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = "#fffbe0"; g.beginPath(); g.arc(838, 74, 30, 0, Math.PI * 2); g.fill();
    // 구름
    const cloud = (x, y, s) => {
      g.fillStyle = "rgba(255,255,255,.92)";
      g.beginPath();
      [[0, 0, 22], [24, -10, 26], [52, -2, 22], [74, 6, 16], [-20, 8, 14], [30, 10, 20]].forEach(([dx, dy, r]) => { g.moveTo(x + dx * s + r * s, y + dy * s); g.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2); });
      g.fill();
    };
    if (detail >= 1) { cloud(120, 92, 1); cloud(452, 58, 0.8); cloud(640, 128, 0.62); cloud(300, 150, 0.45); }
    // 먼 산
    g.fillStyle = "#b8dbef";
    g.beginPath(); g.moveTo(0, 300);
    for (let x = 0; x <= W; x += 40) g.lineTo(x, 268 + Math.sin(x * 0.012) * 18 + Math.sin(x * 0.031) * 9);
    g.lineTo(W, 340); g.lineTo(0, 340); g.fill();
    // 먼 빌딩 · 가까운 빌딩 (늘 같은 모양)
    const rnd = rngOf(20261104);
    const towers = (base, minH, maxH, col, win, step) => {
      for (let x = -10; x < W + 20;) {
        const w = 34 + Math.floor(rnd() * 46), h = minH + Math.floor(rnd() * (maxH - minH));
        g.fillStyle = col; g.fillRect(x, base - h, w, h + 60);
        if (rnd() < 0.3) g.fillRect(x + w * 0.4, base - h - 14, 3, 14); // 안테나
        g.fillStyle = win;
        if (detail >= 2) for (let wy = base - h + 8; wy < base - 4; wy += step) for (let wx = x + 5; wx < x + w - 6; wx += 9) g.fillRect(wx, wy, 5, step * 0.45);
        x += w + 2 + Math.floor(rnd() * 8);
      }
    };
    towers(338, 40, 150, "#a9c8e0", "rgba(235,246,255,.55)", 11);
    towers(352, 30, 110, "#86abc9", "rgba(214,235,250,.6)", 10);
    // 옥상 난간(콘크리트 벽)
    g.fillStyle = "#d9d2c5"; g.fillRect(0, 352, W, GROUND - 352);
    g.fillStyle = "#efe9de"; g.fillRect(0, 346, W, 9);
    g.fillStyle = "rgba(120,104,84,.18)";
    for (let x = 60; x < W; x += 120) g.fillRect(x, 355, 2, GROUND - 355);
    if (detail >= 1) paintRoofStuff(g);
    // 철망(풋살장 둘레 그물 펜스)
    if (detail >= 2) {
      g.save();
      g.beginPath(); g.rect(0, 150, W, GROUND - 150); g.clip();
      g.strokeStyle = "rgba(31,92,62,.22)"; g.lineWidth = 1.2;
      for (let x = -GROUND; x < W + GROUND; x += 16) {
        g.beginPath(); g.moveTo(x, 150); g.lineTo(x + (GROUND - 150), GROUND); g.stroke();
        g.beginPath(); g.moveTo(x, 150); g.lineTo(x - (GROUND - 150), GROUND); g.stroke();
      }
      g.restore();
    }
    g.fillStyle = "#2f6b4c";
    g.fillRect(0, 146, W, 5);
    for (let x = 90; x < W; x += 156) g.fillRect(x - 2.5, 146, 5, GROUND - 146);
    // 펜스 현수막
    const bx = 372, by = 160, bw = 216, bh = 34;
    g.fillStyle = "rgba(15,23,42,.18)"; g.fillRect(bx + 3, by + 4, bw, bh);
    g.fillStyle = "#fffdf5"; g.fillRect(bx, by, bw, bh);
    g.fillStyle = "#2f6bff"; g.fillRect(bx, by, 8, bh); g.fillStyle = "#ff7a3d"; g.fillRect(bx + bw - 8, by, 8, bh);
    g.fillStyle = "#0f2a4a"; g.font = `900 17px ${FONT}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("점심 헤딩 리그", bx + bw / 2, by + bh / 2 + 1);
    g.fillStyle = "#94a3b8"; [bx + 14, bx + bw - 14].forEach((x) => { g.beginPath(); g.arc(x, by + 6, 2.4, 0, Math.PI * 2); g.fill(); });
    // 바닥(인조 잔디) — 줄무늬 · 선
    const turf = g.createLinearGradient(0, GROUND, 0, H);
    turf.addColorStop(0, "#5cbf5f"); turf.addColorStop(1, "#3c9a45");
    g.fillStyle = turf; g.fillRect(0, GROUND, W, H - GROUND);
    if (detail >= 2) {
      for (let i = 0; i < 12; i++) {
        if (i % 2) continue;
        const x0 = (W / 12) * i, x1 = (W / 12) * (i + 1);
        g.fillStyle = "rgba(255,255,255,.07)";
        g.beginPath(); g.moveTo(x0, GROUND); g.lineTo(x1, GROUND); g.lineTo(lerp(W / 2, x1, 1.18), H); g.lineTo(lerp(W / 2, x0, 1.18), H); g.fill();
      }
    }
    g.strokeStyle = "rgba(255,255,255,.9)"; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, GROUND + 1.5); g.lineTo(W, GROUND + 1.5); g.stroke();
    g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(W / 2, GROUND); g.lineTo(W / 2, H); g.stroke();
    g.beginPath(); g.ellipse(W / 2, GROUND + 38, 104, 24, 0, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(GOAL_W + 92, GROUND); g.quadraticCurveTo(GOAL_W + 128, GROUND + 40, GOAL_W + 70, H); g.stroke();
    g.beginPath(); g.moveTo(W - GOAL_W - 92, GROUND); g.quadraticCurveTo(W - GOAL_W - 128, GROUND + 40, W - GOAL_W - 70, H); g.stroke();
    g.fillStyle = "rgba(0,0,0,.08)"; g.fillRect(0, H - 6, W, 6);
  }
  // 옥상 살림(물탱크 · 사다리 · 계단실 · 실외기 · 조명탑) — 화질 보통부터
  function paintRoofStuff(g) {
    // 물탱크(네모 판 물탱크 — 옥상마다 있는 그것) · 사다리
    const tx = 118, ty = 214, tw = 150, th = 116;
    g.fillStyle = "#6f7f8c"; g.fillRect(tx + 10, ty + th, 8, 352 - ty - th); g.fillRect(tx + tw - 18, ty + th, 8, 352 - ty - th); g.fillRect(tx + 4, ty + th - 2, tw - 8, 8);
    g.fillStyle = "#cfe9e6"; g.fillRect(tx, ty, tw, th);
    g.strokeStyle = "#9cc9c3"; g.lineWidth = 2;
    for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(tx + (tw / 4) * i, ty); g.lineTo(tx + (tw / 4) * i, ty + th); g.stroke(); }
    for (let i = 1; i < 3; i++) { g.beginPath(); g.moveTo(tx, ty + (th / 3) * i); g.lineTo(tx + tw, ty + (th / 3) * i); g.stroke(); }
    g.fillStyle = "#b5dcd7"; g.fillRect(tx - 4, ty - 8, tw + 8, 10);
    g.fillStyle = "#2f6f6a"; g.font = `800 15px ${FONT}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("물탱크", tx + tw / 2, ty + th / 2 + 1);
    g.strokeStyle = "#5c6b77"; g.lineWidth = 3;
    g.beginPath(); g.moveTo(tx + tw + 8, ty - 6); g.lineTo(tx + tw + 8, 352); g.moveTo(tx + tw + 22, ty - 6); g.lineTo(tx + tw + 22, 352); g.stroke();
    g.lineWidth = 2; for (let y = ty + 4; y < 352; y += 14) { g.beginPath(); g.moveTo(tx + tw + 8, y); g.lineTo(tx + tw + 22, y); g.stroke(); }
    // 계단실 · 문 · 실외기
    const hx = 640, hy = 250;
    g.fillStyle = "#ece6da"; g.fillRect(hx, hy, 150, 352 - hy);
    g.fillStyle = "#c9c0b0"; g.fillRect(hx - 6, hy - 10, 162, 12);
    g.fillStyle = "#3f8a63"; g.fillRect(hx + 20, hy + 34, 46, 352 - hy - 34);
    g.fillStyle = "#e8c35a"; g.beginPath(); g.arc(hx + 58, hy + 72, 3, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#16a34a"; g.fillRect(hx + 22, hy + 14, 42, 14);
    g.fillStyle = "#fff"; g.font = `800 10px ${FONT}`; g.fillText("비상구", hx + 43, hy + 21.5);
    g.fillStyle = "#b7d4ea"; g.fillRect(hx + 88, hy + 30, 40, 30);
    g.strokeStyle = "#8a99a6"; g.lineWidth = 2; g.strokeRect(hx + 88, hy + 30, 40, 30);
    g.fillStyle = "#94a3b8"; g.beginPath(); g.ellipse(hx + 120, hy - 26, 16, 7, -0.5, 0, Math.PI * 2); g.fill();
    g.fillRect(hx + 118, hy - 22, 4, 14);
    const unit = (x) => {
      g.fillStyle = "#f4f6f8"; g.fillRect(x, 314, 64, 40);
      g.strokeStyle = "#c3ccd5"; g.lineWidth = 2; g.strokeRect(x, 314, 64, 40);
      g.beginPath(); g.arc(x + 24, 334, 13, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(x + 24, 334, 6, 0, Math.PI * 2); g.stroke();
      for (let i = 0; i < 4; i++) g.fillRect(x + 44, 322 + i * 7, 14, 2);
    };
    unit(500); unit(800);
    // 조명탑
    for (const lx of [36, W - 36]) {
      g.fillStyle = "#64748b"; g.fillRect(lx - 3, 74, 6, 280);
      g.fillStyle = "#334155"; g.fillRect(lx - 26, 56, 52, 24);
      g.fillStyle = "#fef9c3";
      for (let i = 0; i < 4; i++) g.fillRect(lx - 22 + i * 12, 60, 9, 8), g.fillRect(lx - 22 + i * 12, 70, 9, 7);
    }
  }
  function goalX(side, x) { return side === 0 ? x : W - x; }
  // 골대 그물 — shake 는 골이 들어간 뒤 그물이 출렁이는 정도 · mesh 가 거짓이면(화질 낮음) 그물코 없이 반투명 면만
  function paintNet(g, side, shake, mesh) {
    const X = (x) => goalX(side, x);
    const wob = (y) => shake * Math.sin(y * 0.09 + shake * 9) * 3;
    g.save();
    g.beginPath(); g.moveTo(X(4), ROOF_Y); g.lineTo(X(GOAL_W), BAR_Y); g.lineTo(X(GOAL_W), GROUND); g.lineTo(X(4), GROUND); g.closePath();
    g.fillStyle = mesh === false ? "rgba(255,255,255,.26)" : "rgba(255,255,255,.16)"; g.fill();
    if (mesh !== false) {
      g.clip();
      g.strokeStyle = "rgba(255,255,255,.55)"; g.lineWidth = 1.1;
      for (let y = ROOF_Y - 70; y < GROUND + 10; y += 11) { g.beginPath(); g.moveTo(X(0), y + wob(y)); g.lineTo(X(GOAL_W), y + 22 + wob(y + 22)); g.stroke(); }
      for (let x = 0; x < GOAL_W + 10; x += 11) { g.beginPath(); g.moveTo(X(x) + wob(x * 3), ROOF_Y - 10); g.lineTo(X(x) + wob(x * 3 + 40), GROUND); g.stroke(); }
    }
    g.restore();
    // 뒤 기둥 · 지붕
    g.strokeStyle = "#e5e7eb"; g.lineWidth = 5; g.lineCap = "round";
    g.beginPath(); g.moveTo(X(4), GROUND); g.lineTo(X(4), ROOF_Y); g.lineTo(X(GOAL_W), BAR_Y); g.stroke();
    g.lineCap = "butt";
  }
  function paintGoalFront(g, side) {
    const X = (x) => goalX(side, x);
    g.fillStyle = "rgba(0,0,0,.16)";
    g.beginPath(); g.ellipse(X(GOAL_W), GROUND + 4, 10, 3, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#ffffff"; g.lineWidth = 2 * BAR_R; g.lineCap = "round";
    g.beginPath(); g.moveTo(X(GOAL_W), GROUND); g.lineTo(X(GOAL_W), BAR_Y); g.lineTo(X(GOAL_W - 20), BAR_Y - (20 * (BAR_Y - ROOF_Y)) / GOAL_W); g.stroke();
    g.strokeStyle = "rgba(148,163,184,.55)"; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(X(GOAL_W) + (side ? -3 : 3), GROUND - 2); g.lineTo(X(GOAL_W) + (side ? -3 : 3), BAR_Y + 4); g.stroke();
    g.lineCap = "butt";
  }

  // 얼굴 사진 — 동그라미에 꽉 차게(가운데 기준으로 잘라)
  function drawPhoto(g, img, x, y, r) {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const s = Math.min(iw, ih);
    g.drawImage(img, (iw - s) / 2, (ih - s) / 2, s, s, x - r, y - r, r * 2, r * 2);
  }
  // 그린 얼굴(컴퓨터 · 구경용) — look 0 신입(짧은 머리) · 1 대리(안경) · 2 부장(넓은 이마 · 콧수염) · 3 과장(묶은 머리)
  function drawCartoon(g, x, y, r, face, look, mood, team) {
    g.fillStyle = "#ffd7b5"; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    const hair = ["#2b2118", "#3a2a1c", "#4b4b4b", "#3b1f12"][look % 4];
    g.fillStyle = hair;
    g.beginPath();
    if (look === 2) { g.arc(x, y, r, Math.PI * 1.05, Math.PI * 1.25); g.arc(x, y, r, Math.PI * 1.75, Math.PI * 1.95); g.lineTo(x, y - r * 0.4); }
    else { g.arc(x, y, r, Math.PI * 0.98, Math.PI * 2.02); g.quadraticCurveTo(x + face * r * 0.2, y - r * 0.35, x - face * r * 0.9, y - r * 0.15); }
    g.fill();
    if (look === 3) { g.beginPath(); g.arc(x - face * r * 0.95, y - r * 0.25, r * 0.32, 0, Math.PI * 2); g.fill(); }
    // 머리띠(팀 색)
    g.strokeStyle = team.main; g.lineWidth = r * 0.18;
    g.beginPath(); g.arc(x, y, r * 0.93, Math.PI * 1.14, Math.PI * 1.86); g.stroke();
    // 눈 · 눈썹 · 입 — 바라보는 쪽으로
    const ex = x + face * r * 0.26, ey = y + r * 0.02;
    g.fillStyle = "#fff";
    [-1, 1].forEach((k) => { g.beginPath(); g.ellipse(ex + k * r * 0.24, ey, r * 0.14, r * 0.17, 0, 0, Math.PI * 2); g.fill(); });
    g.fillStyle = "#1f2937";
    [-1, 1].forEach((k) => { g.beginPath(); g.arc(ex + k * r * 0.24 + face * r * 0.05, ey + r * 0.02, r * 0.075, 0, Math.PI * 2); g.fill(); });
    g.strokeStyle = hair; g.lineWidth = r * 0.07; g.lineCap = "round";
    [-1, 1].forEach((k) => { g.beginPath(); g.moveTo(ex + k * r * 0.24 - r * 0.12, ey - r * 0.27 - (mood === "kick" ? r * 0.05 : 0)); g.lineTo(ex + k * r * 0.24 + r * 0.12, ey - r * 0.3); g.stroke(); });
    if (look === 1) { g.strokeStyle = "#1f2937"; g.lineWidth = r * 0.05; [-1, 1].forEach((k) => { g.beginPath(); g.arc(ex + k * r * 0.24, ey, r * 0.2, 0, Math.PI * 2); g.stroke(); }); g.beginPath(); g.moveTo(ex - r * 0.04, ey); g.lineTo(ex + r * 0.04, ey); g.stroke(); }
    g.fillStyle = "rgba(244,114,114,.35)"; g.beginPath(); g.arc(ex + face * r * 0.36, y + r * 0.3, r * 0.12, 0, Math.PI * 2); g.fill();
    const mx = x + face * r * 0.3, my = y + r * 0.42;
    if (mood === "kick" || mood === "goal") { g.fillStyle = "#7f1d1d"; g.beginPath(); g.ellipse(mx, my, r * 0.13, r * 0.12, 0, 0, Math.PI * 2); g.fill(); }
    else { g.strokeStyle = "#7f1d1d"; g.lineWidth = r * 0.06; g.beginPath(); g.arc(mx, my - r * 0.1, r * 0.15, Math.PI * 0.15, Math.PI * 0.85); g.stroke(); }
    if (look === 2) { g.fillStyle = "#4b4b4b"; g.beginPath(); g.ellipse(mx, my - r * 0.16, r * 0.16, r * 0.05, 0, 0, Math.PI * 2); g.fill(); }
    g.lineCap = "butt";
  }

  // flat — 입체 무늬(빛 받은 쪽 밝게) 없이 한 색으로(화질 보통 · 낮음)
  function drawBall(g, b, alpha, flat) {
    g.save();
    g.globalAlpha = alpha == null ? 1 : alpha;
    g.translate(b.x, b.y);
    if (flat) g.fillStyle = "#f1f5f9";
    else {
      const shade = g.createRadialGradient(-BALL_R * 0.35, -BALL_R * 0.4, 2, 0, 0, BALL_R);
      shade.addColorStop(0, "#ffffff"); shade.addColorStop(1, "#d5dde6");
      g.fillStyle = shade;
    }
    g.beginPath(); g.arc(0, 0, BALL_R, 0, Math.PI * 2); g.fill();
    g.clip();
    g.rotate(b.rot);
    const pent = (cx, cy, r, rot) => {
      g.beginPath();
      for (let i = 0; i < 5; i++) { const a = rot + (i * Math.PI * 2) / 5; g[i ? "lineTo" : "moveTo"](cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
      g.closePath(); g.fill();
    };
    g.fillStyle = "#1e293b";
    pent(0, 0, BALL_R * 0.38, -Math.PI / 2);
    g.strokeStyle = "rgba(30,41,59,.45)"; g.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / 5, c = Math.cos(a), s = Math.sin(a);
      g.beginPath(); g.moveTo(c * BALL_R * 0.38, s * BALL_R * 0.38); g.lineTo(c * BALL_R * 0.72, s * BALL_R * 0.72); g.stroke();
      const a2 = a + Math.PI / 5;
      pent(Math.cos(a2) * BALL_R * 1.02, Math.sin(a2) * BALL_R * 1.02, BALL_R * 0.36, a2 + Math.PI);
    }
    g.restore();
    g.strokeStyle = "rgba(15,23,42,.28)"; g.lineWidth = 1.2;
    g.beginPath(); g.arc(b.x, b.y, BALL_R, 0, Math.PI * 2); g.stroke();
  }

  // ───────────────────────── 엔진 ─────────────────────────
  function create(canvas, opts) {
    opts = opts || {};
    const mode = ["cpu", "local", "host", "guest", "demo"].includes(opts.mode) ? opts.mode : "cpu";
    const online = mode === "host" || mode === "guest";
    const mySide = mode === "guest" ? 1 : 0;
    const level = hasKey(AI_LEVEL, opts.level) ? opts.level : "normal";
    let Q = QUALITY[hasKey(QUALITY, opts.quality) ? opts.quality : "good"]; // 화질 — 이 화면에서만(통신에 싣지 않는다)
    const minutes = [1, 2, 3, 5].includes(Number(opts.minutes)) ? Number(opts.minutes) : mode === "demo" ? 99 : 2;
    const quiet = mode === "demo";
    const g = canvas.getContext("2d");
    const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
    const fxRnd = rngOf(seed + 3);

    // 왼쪽 · 오른쪽 사람
    const meInfo = opts.me || { name: "나" }, rivalInfo = opts.rival || { name: "상대" };
    const people = mode === "guest" ? [rivalInfo, meInfo] : [meInfo, rivalInfo];
    const faces = people.map((p, i) => {
      const f = { name: String((p && p.name) || (i ? "상대" : "나")), img: null, ok: false, look: p && p.look != null ? Number(p.look) : null };
      if (p && p.avatarUrl && f.look == null) {
        const img = new Image();
        img.decoding = "async";
        img.onload = () => { f.ok = img.naturalWidth > 0; };
        img.onerror = () => { f.ok = false; f.img = null; };
        img.src = p.avatarUrl;
        f.img = img;
      }
      return f;
    });

    let S = newState(minutes);
    if (mode === "cpu") S.pl[1].spd = AI_LEVEL[level].spd;
    if (mode === "demo") { S.pl[0].spd = AI_LEVEL.normal.spd; S.pl[1].spd = AI_LEVEL.normal.spd; }
    const ais = [null, null];
    if (mode === "cpu") ais[1] = makeAI(level, seed);
    if (mode === "demo") { ais[0] = makeAI("normal", seed + 1, { every: 8 }); ais[1] = makeAI("normal", seed + 2, { every: 8 }); } // 구경 — 둘이라 덜 자주 생각한다

    // 입력 — 팀마다 { l, r, jq(점프 누른 수), kq(킥 누른 수) }
    const ctl = [{ l: false, r: false, jq: 0, kq: 0 }, { l: false, r: false, jq: 0, kq: 0 }];
    const keySrc = [{}, {}]; // 키보드 · 화면 단추 따로 — 하나를 떼도 다른 것이 눌려 있으면 그대로
    let running = false, paused = false, ended = false, destroyed = false;
    const holds = new Set(mode === "host" ? ["peer"] : []);
    let frozen = mode === "host";
    let raf = 0, lastTs = 0, acc = 0;
    // 효과
    let shake = 0, netShake = [0, 0], flash = 0, goalFx = null, sparks = [], meMark = 0;
    let overSent = false, endTimer = 0;

    // ── 효과 · 소리 (host · cpu · local · demo 는 판에서, guest 는 받은 일에서)
    const recent = []; // host 가 guest 에게 거듭 실어 보내는 최근 일(킥 · 헤딩 · 휘슬 …)
    const marks = [];  // 득점 · 끝 — 더 오래 싣고, 킥이 많아도 밀려나지 않게 따로 둔다
    function fx(type, side, n) {
      if (mode === "host" && ["kick", "head", "bar", "goal", "whistle", "over", "out"].includes(type)) {
        S.ev++;
        const row = [S.ev, type, side | 0, n | 0, S.frame, S.score[0], S.score[1]];
        const list = type === "goal" || type === "over" ? marks : recent;
        list.push(row);
        while (list.length > 12) list.shift();
      }
      effect(type, side, n);
    }
    function effect(type, side, n) {
      const human = mode === "local" || side === mySide;
      const snd = quiet ? () => {} : sfx;
      switch (type) {
        case "kick": snd("hit"); spark(S.ball.x, S.ball.y, 7 * Q.fx, "#fde68a"); if (n > 15) shake = Math.max(shake, 3); break;
        case "head": snd("pop"); spark(S.ball.x, S.ball.y + BALL_R, 5 * Q.fx, "#ffffff"); break;
        case "bar": snd("drop"); shake = Math.max(shake, 4); break;
        case "thud": snd("tap"); break;
        case "jump": if (human) snd("jump"); break;
        case "goal":
          snd("line"); setTimeout(() => snd(side === mySide || mode === "local" ? "powerup" : "fail"), 260);
          netShake[side === 0 ? 1 : 0] = 1; flash = 1; shake = 8;
          goalFx = { side, t: 0 };
          for (let i = 0, n = Math.round(46 * Q.fx); i < n; i++) confetti(side);
          emit({ type: "goal", side, score: S.score.slice() });
          break;
        case "whistle": snd("go"); meMark = 150; emit({ type: "start" }); break;
        case "out": snd("whoosh"); emit({ type: "out", side }); break; // 「아웃!」 글자는 판(S.out · S.pt)을 보고 그린다 — guest 가 이 일을 놓쳐도 보인다
        case "over": snd("go"); setTimeout(() => snd("go"), 180); break;
      }
    }
    function spark(x, y, k, col) {
      k = Math.round(k);
      for (let i = 0; i < k; i++) {
        const a = fxRnd() * Math.PI * 2, v = 1.5 + fxRnd() * 2.5;
        sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life: 18 + fxRnd() * 10, col, s: 2 + fxRnd() * 2, g: 0.05 });
      }
    }
    function confetti(side) {
      const gx = side === 0 ? W - GOAL_W / 2 : GOAL_W / 2;
      const cols = side === 0 ? ["#2f6bff", "#93c5fd", "#fde047", "#ffffff"] : ["#ff7a3d", "#fdba74", "#fde047", "#ffffff"];
      const a = (side === 0 ? Math.PI : 0) + (fxRnd() - 0.5) * 1.6 - (side === 0 ? -0.6 : 0.6);
      const v = 4 + fxRnd() * 7;
      sparks.push({ x: gx, y: BAR_Y + 30, vx: Math.cos(a) * v, vy: -Math.abs(Math.sin(a) * v) - 3 - fxRnd() * 4, life: 70 + fxRnd() * 50, col: cols[Math.floor(fxRnd() * cols.length)], s: 3 + fxRnd() * 3, g: 0.16, rect: true, rot: fxRnd() * 6 });
    }
    function emit(e) { if (typeof opts.onEvent === "function") { try { opts.onEvent(e); } catch (err) { console.error(err); } } }

    // ── 키보드
    const KEYS = mode === "local"
      ? { KeyA: [0, "l"], KeyD: [0, "r"], KeyW: [0, "j"], KeyF: [0, "k"], KeyS: [0, "k"], Space: [0, "k"], ArrowLeft: [1, "l"], ArrowRight: [1, "r"], ArrowUp: [1, "j"], ArrowDown: [1, "k"], Enter: [1, "k"], NumpadEnter: [1, "k"], Slash: [1, "k"] }
      : { ArrowLeft: [mySide, "l"], KeyA: [mySide, "l"], ArrowRight: [mySide, "r"], KeyD: [mySide, "r"], ArrowUp: [mySide, "j"], KeyW: [mySide, "j"], Space: [mySide, "k"], KeyF: [mySide, "k"], ArrowDown: [mySide, "k"], KeyS: [mySide, "k"] };
    const humanSides = mode === "local" ? [0, 1] : mode === "demo" ? [] : [mySide];
    function press(side, act, on, src) {
      if (!humanSides.includes(side)) return;
      const c = ctl[side], k = keySrc[side];
      if (act === "l" || act === "r") {
        k[act + src] = on;
        c[act] = !!(k[act + "k"] || k[act + "t"]);
      } else if (on) {
        if (act === "j") c.jq++; else c.kq++;
      }
    }
    function typing(e) { const t = e.target; return t && t.closest && t.closest("input, textarea, select, [contenteditable]"); }
    function onKey(e) {
      const m = KEYS[e.code];
      if (!m || typing(e) || document.querySelector(".hk-dialog__overlay")) return;
      if (!running || ended || mode === "demo") return;
      const down = e.type === "keydown";
      if (down && e.repeat && (m[1] === "j" || m[1] === "k")) { e.preventDefault(); return; }
      e.preventDefault();
      press(m[0], m[1], down, "k");
    }
    function releaseAll() {
      for (const s of [0, 1]) { keySrc[s] = {}; ctl[s].l = ctl[s].r = false; }
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", releaseAll);

    // ── 판 넘기기 · 입력 꺼내기
    function takeInput(side) {
      const c = ctl[side];
      const out = { l: c.l, r: c.r, jp: c.jq > 0, kp: c.kq > 0 };
      c.jq = 0; c.kq = 0;
      return out;
    }

    // host — guest 입력
    // ms: 마지막으로 guest 소식을 받은 때 · q: guest 가 host 판을 마지막으로 받은 지 ms(-1 모름) · qNone: q 를 모른 채 지난 때부터
    // qGrace: 전체 판을 막 보냈으니 이때까지는 q 를 보지 않는다(guest 가 받기 전에 보낸 입력은 q 가 클 수밖에 없다)
    const remote = { m: 0, j: 0, k: 0, n: -1, at: 0, seen: false, s: null, ms: 0, q: 0, qNone: 0, qGrace: 0 };
    function onRemoteInput(msg) {
      const n = Number(msg.n), m = Number(msg.m) | 0, j = Number(msg.j) | 0, k = Number(msg.k) | 0;
      if (!Number.isFinite(n)) return;
      if (msg.s !== remote.s) { remote.seen = false; remote.s = msg.s; } // guest 가 새로 들어옴 — 처음부터 센다
      if (remote.seen && n < remote.n) return; // 늦게 온 옛 입력
      const c = ctl[1];
      c.l = !!(m & 1); c.r = !!(m & 2);
      if (remote.seen && !frozen && S.phase !== "wait") {
        if (j > remote.j) c.jq++;
        if (k > remote.k) c.kq++;
      }
      remote.m = m; remote.j = j; remote.k = k; remote.n = n; remote.at = S.frame; remote.seen = true;
      peerAlive(msg);
    }
    // guest 가 살아 있다는 소식(입력 · 전체 판 달라기) — 화면 숨김(w)도 이 소식으로 다시 맞춘다(「away 끝」을 놓쳐도 풀리게)
    function peerAlive(msg) {
      const now = performance.now();
      remote.ms = now;
      const q = Number(msg.q);
      if (Number.isFinite(q) && q >= 0) { remote.q = q; remote.qNone = 0; }
      else { remote.q = -1; if (!remote.qNone) remote.qNone = now; }
      setHold("peerAway", Number(msg.w) === 1);
      checkPeer();
    }
    // 상대 소식 보기 — 입력이 끊기면 누르던 방향을 떼고, 더 길면 멈춘다. 둘이 모두 접속 중인데 망이 조용히 죽은 경우
    function checkPeer() {
      if (mode !== "host") return;
      // 내가 화면을 떠났거나(판을 못 보냄) 내 연결이 끊긴 동안은 상대 탓으로 치지 않는다
      const live = !holds.has("peer") && !holds.has("net") && !holds.has("away") && !ended && (S.phase === "ready" || S.phase === "play" || S.phase === "goal");
      if (!live) { setHold("peerSilent", false); return; }
      const now = performance.now(), quiet = now - remote.ms;
      if (quiet > STALE_MS) { ctl[1].l = false; ctl[1].r = false; }
      const lag = now < remote.qGrace ? 0 : remote.q >= 0 ? remote.q : remote.qNone ? now - remote.qNone : 0;
      setHold("peerSilent", quiet > SILENT_MS || lag > LAG_MS);
    }

    // ── 멈춤 · 이어 하기
    let frozenAt = 0, cdBefore = 0;
    function refreshFrozen() {
      const fz = paused || holds.size > 0;
      if (fz === frozen) return;
      frozen = fz;
      if (fz) {
        cdBefore = S.cd; S.cd = 0; frozenAt = performance.now();
        // host 는 내 키는 그대로 두고(키를 떼면 keyup 이 온다) guest 쪽만 뗀다 — 잠깐 멈췄다 풀려도 다시 누르지 않게
        if (mode === "host") { ctl[1].l = ctl[1].r = false; for (const c of ctl) { c.jq = 0; c.kq = 0; } } else releaseAll();
      } else if (S.phase !== "wait" && S.phase !== "over") {
        if (mode !== "host") S.cd = LOCAL_RESUME_CD;
        else S.cd = Math.max(cdBefore, S.played === 0 || performance.now() - frozenAt > SHORT_FREEZE_MS ? RESUME_CD : SHORT_CD); // 세던 3 · 2 · 1 은 이어서
      }
      if (mode === "host") { emit({ type: "hold", reasons: [...holds] }); sendSnap(true); }
    }
    function setHold(reason, on) {
      on = !!on;
      if (on === holds.has(reason)) return;
      if (on) holds.add(reason); else holds.delete(reason);
      // 상대가 (다시) 들어왔거나 내 연결 · 화면이 돌아왔다 — guest 소식 시계를 새로 센다
      if (!on && (reason === "peer" || reason === "net" || reason === "away")) { const now = performance.now(); remote.ms = now; remote.q = 0; remote.qNone = 0; remote.qGrace = now + 1500; }
      refreshFrozen();
      noteTrouble();
    }
    // 상대가 접속은 해 있는데 경기를 못 하는 까닭 — 화면이 알림 띠 · 오래 가면 고르기를 띄운다
    function peerTrouble() {
      if (ended) return null;
      if (mode === "host") {
        if (S.phase === "wait" || S.phase === "over") return null;
        return holds.has("peerAway") ? "away" : holds.has("peerSilent") ? "silent" : null;
      }
      if (mode === "guest") {
        if (!view || view.phase === "wait" || view.phase === "over") return null;
        if (view.fz & 8 && view.fz & 1) return "away";
        return stalled ? "silent" : null;
      }
      return null;
    }
    let lastTrouble = null;
    function noteTrouble() {
      const t = peerTrouble();
      if (t !== lastTrouble) { lastTrouble = t; emit({ type: "trouble", what: t }); }
    }

    function tick() {
      if (mode === "guest") return guestTick();
      if (mode === "host") { checkPeer(); noteTrouble(); }
      // 끝난 판은 멈춤과 상관없이 마무리한다 — 상대가 끝나자마자 나가도 내 결과는 보낸다
      if (S.phase === "over") {
        if (S.pt > 0) S.pt--;
        if (S.pt <= 0 && !ended) finish();
        hostSend();
        return;
      }
      // 3 · 2 · 1
      if (!frozen && S.cd > 0) {
        cdBeep(S.cd);
        S.cd--;
        for (const c of ctl) { c.jq = 0; c.kq = 0; }
        hostSend();
        return;
      }
      if (frozen) { hostSend(); return; }
      const inputs = [0, 1].map((side) => (ais[side] ? aiInput(ais[side], S, side) : takeInput(side)));
      savePrev();
      simStep(S, inputs, fx);
      hostSend();
    }
    let prev = null, lastBeep = 0;
    function savePrev() {
      prev = { b: { x: S.ball.x, y: S.ball.y, rot: S.ball.rot }, p: S.pl.map((p) => ({ x: p.x, y: p.y })) };
    }
    function cdBeep(cd) { // 3 · 2 · 1 — 숫자가 바뀔 때 한 번
      const n = Math.ceil(cd / 60);
      if (n !== lastBeep) { lastBeep = n; if (n > 0 && !quiet) sfx("countdown"); }
    }

    function result(score) {
      const left = score[0], right = score[1];
      const me = mode === "guest" ? right : left, rival = mode === "guest" ? left : right;
      return {
        left, right, me, rival, side: mySide, mode,
        win: mode === "local" ? left !== right : me > rival, draw: left === right,
        winner: left === right ? null : left > right ? 0 : 1,
        sec: Math.round((S.played || 0) / 60), kicks: S.stats.kicks.slice(), heads: S.stats.heads.slice(),
      };
    }
    function finish() {
      if (ended) return;
      ended = true;
      releaseAll();
      // guest 는 제가 센 득점으로 결과를 낸다(host 판의 점수가 득점 없이 바뀌었으면 어긋나게 — 순위 제외)
      const fin = mode === "guest" && tally ? tally.slice() : S.score.slice();
      if (mode === "guest") S.score = fin.slice();
      const r = result(fin);
      emit({ type: "over", score: fin.slice() });
      if (mode === "host") sendSnap(true);
      if (typeof opts.onEnd === "function") { try { opts.onEnd(r); } catch (err) { console.error(err); } }
    }

    // ── host: 판 보내기
    const hostSess = Math.floor(Math.random() * 1e9); // 이 host 화면의 번호 — 새로고침하면 바뀌어 guest 가 알아본다
    function snapObj(full) {
      const P = (p) => [r1(p.x), r1(p.y), r1(p.vx), r1(p.vy), p.kick, p.ground ? 1 : 0];
      const b = S.ball;
      const o = {
        t: full ? "full" : "s", f: S.frame, ph: PH.indexOf(S.phase), pt: S.pt, cd: S.cd, c: S.clock, sc: S.score.slice(),
        b: [r1(b.x), r1(b.y), r1(b.vx), r1(b.vy), Math.round(b.rot * 100) / 100],
        p: [P(S.pl[0]), P(S.pl[1])],
        a: remote.seen ? remote.n + (S.frame - remote.at) : -1,
        fz: frozen ? (holds.has("away") || holds.has("net") ? 1 : 0) | (holds.has("peer") ? 2 : 0) | (holds.has("peerAway") ? 4 : 0) | 8 | (holds.has("peerSilent") ? 16 : 0) : 0,
        e: recent.filter((x) => S.frame - x[4] < 90).concat(marks.filter((x) => x[1] === "over" || S.frame - x[4] < GOAL_KEEP)).sort((x, y) => x[0] - y[0]),
        h: hostSess,
      };
      if (full || S.phase === "over") { o.mi = S.minutes; o.ev = S.ev; o.st = S.stats; o.pl = S.played; }
      if (S.out) o.o = S.out; // 아웃 중(막던 쪽 + 1)
      return o;
    }
    let sendGap = 0;
    function sendSnap(full) {
      if (mode !== "host" || !opts.net) return;
      try { opts.net.send(snapObj(full)); } catch (_) { /* 다음 판에서 다시 */ }
    }
    function hostSend() {
      if (mode !== "host") return;
      const every = S.phase === "over" ? 30 : frozen || S.phase === "wait" ? 15 : 2;
      if (++sendGap >= every) { sendGap = 0; sendSnap(false); }
    }

    // ── guest: 받아 그리기 + 내 선수 미리 움직이기
    const buf = []; // 받은 판(host 프레임 순)
    let tickN = 0, offs = null, seenEv = -1, lastRecv = 0, stalled = false, gotFull = false, askedAt = 0;
    let view = null; // 그릴 판 — 받은 판을 이어 만든 것
    const own = newPlayer(1); // 미리 움직인 내 선수
    let ownOff = { x: 0, y: 0 };
    const hist = new Map(); // guest 프레임 → { m, j, k }
    let inSent = { m: -1, j: -1, k: -1, at: -1000 };
    const sess = Math.floor(Math.random() * 1e9); // 이 화면의 입력 묶음 번호
    let myJ = 0, myK = 0, awayMe = false;
    // 득점 세기 — host 판의 점수를 그대로 믿지 않고 득점 일(goal)을 하나씩 센다. tally 가 null 이면 아직 모름(첫 전체 판에서 맞춘다)
    let tally = null, tallyEv = -1, tainted = false, hostSess0 = null;
    function countGoals(evs) {
      for (const ev of evs) {
        if (!Array.isArray(ev) || ev[1] !== "goal" || !(Number(ev[0]) > tallyEv)) continue;
        tallyEv = Number(ev[0]);
        if (tally) tally[ev[2] ? 1 : 0]++;
      }
    }
    const lastQ = () => (lastRecv ? Math.round(performance.now() - lastRecv) : -1);
    function askFull() {
      if (performance.now() - askedAt < 1000 || !opts.net) return;
      askedAt = performance.now();
      try { opts.net.send({ t: "hi", w: awayMe ? 1 : 0, q: lastQ() }); } catch (_) { /* 다음에 */ }
    }
    function guestInput() {
      const c = ctl[1];
      if (c.jq > 0) { myJ += c.jq; c.jq = 0; }
      if (c.kq > 0) { myK += c.kq; c.kq = 0; }
      return { m: (c.l ? 1 : 0) | (c.r ? 2 : 0), j: myJ, k: myK };
    }
    function stepOwn(cur, before) {
      const inp = { l: !!(cur.m & 1), r: !!(cur.m & 2), jp: before ? cur.j > before.j : false, kp: before ? cur.k > before.k : false };
      stepPlayer(own, inp, null);
    }
    function guestTick() {
      tickN++;
      const cur = guestInput();
      hist.set(tickN, cur);
      hist.delete(tickN - 300);
      const changed = cur.m !== inSent.m || cur.j !== inSent.j || cur.k !== inSent.k;
      if (opts.net && (changed || tickN - inSent.at >= 12)) {
        let ok = false;
        try { ok = opts.net.send({ t: "i", s: sess, n: tickN, m: cur.m, j: cur.j, k: cur.k, w: awayMe ? 1 : 0, q: lastQ() }); } catch (_) { ok = false; }
        if (ok !== false) inSent = { m: cur.m, j: cur.j, k: cur.k, at: tickN };
      }
      // 소리 — 내 점프 · 헛발질은 바로
      const before = hist.get(tickN - 1);
      const moving = view && view.phase === "play" || view && view.phase === "goal";
      if (moving && view.cd <= 0 && !(view.fz & 8)) {
        if (before && cur.j > before.j && own.ground) sfx("jump");
        stepOwn(cur, before);
      }
      ownOff.x *= 0.82; ownOff.y *= 0.82;
      if (performance.now() - lastRecv > 700 && lastRecv && !ended) { if (!stalled) { stalled = true; emit({ type: "stall", on: true }); } }
      else if (stalled) { stalled = false; emit({ type: "stall", on: false }); }
      advanceView();
      noteTrouble();
    }
    function onSnap(s) {
      if (!Array.isArray(s.b) || !Array.isArray(s.p) || s.p.length !== 2) return;
      lastRecv = performance.now();
      const f = Number(s.f) || 0;
      const sc = Array.isArray(s.sc) ? [s.sc[0] | 0, s.sc[1] | 0] : [0, 0];
      const evs = Array.isArray(s.e) ? s.e : [];
      const hs = s.h == null ? null : s.h;
      if (s.t === "full") {
        buf.length = 0; offs = null; gotFull = true;
        if (Number(s.mi)) S.minutes = Number(s.mi);
        if (s.st && s.st.kicks) S.stats = s.st;
        if (Number.isFinite(Number(s.ev))) seenEv = Number(s.ev); // 다시 들어온 뒤 옛 득점 소리를 또 내지 않게
        const P = s.p[1];
        Object.assign(own, { x: P[0], y: P[1], vx: P[2], vy: P[3], kick: P[4], ground: !!P[5] });
        ownOff = { x: 0, y: 0 };
        if (hs !== hostSess0 || !tally) {
          // 처음 받은 판이거나 host 가 새로 시작(새로고침) — 새 판(0 : 0)이면 처음부터, 이어 하는 판이면 내가 센 점수를 그대로 둔다
          const fresh = !(Number(s.pl) > 0) && sc[0] + sc[1] === 0;
          if (!tally || fresh) { tally = sc.slice(); tainted = false; }
          hostSess0 = hs;
          tallyEv = Number.isFinite(Number(s.ev)) ? Number(s.ev) : tallyEv; // 이 번호까지의 득점은 sc 에 들어 있다
        } else countGoals(evs);
        if (tally[0] !== sc[0] || tally[1] !== sc[1]) tainted = true;
      } else if (!gotFull || hs !== hostSess0) {
        // 전체 판보다 보통 판이 먼저 왔다(또는 host 가 새로 시작) — 전체 판을 다시 달라고 하고, 지난 일은 건너뛴다
        askFull();
        for (const ev of evs) if (Array.isArray(ev) && ev[1] !== "over") seenEv = Math.max(seenEv, ev[0]);
      } else {
        countGoals(evs);
        if (tally && (tally[0] !== sc[0] || tally[1] !== sc[1])) tainted = true; // 득점 없이 점수가 바뀜
      }
      if (Number.isFinite(Number(s.pl)) && s.pl != null) S.played = Number(s.pl);
      if (buf.length && f < buf[buf.length - 1].f) {
        if (buf[buf.length - 1].f - f > 600) buf.length = 0; else return; // 판이 새로 시작됐거나(되감김) 늦게 온 판
      }
      const snap = {
        f, phase: PH[s.ph] || "play", pt: s.pt | 0, cd: s.cd | 0, clock: s.c | 0, score: sc,
        b: s.b, p: s.p, fz: s.fz | 0, e: evs, out: s.o === 1 || s.o === 2 ? s.o : 0,
      };
      buf.push(snap);
      while (buf.length > 40) buf.shift();
      const sample = f - tickN;
      if (offs == null || sample > offs || sample < offs - 10) offs = sample; else offs -= 0.02;
      // 내 선수 맞추기 — host 판의 내 선수에서 그 뒤 내 입력을 다시 밟는다
      const a = Number(s.a);
      const P = s.p[1];
      const moving = (snap.phase === "play" || snap.phase === "goal") && snap.cd <= 0 && !(snap.fz & 8);
      const bx = own.x, by = own.y;
      Object.assign(own, { x: P[0], y: P[1], vx: P[2], vy: P[3], kick: P[4], ground: !!P[5] });
      if (moving && a >= 0 && a <= tickN && tickN - a < 60) {
        own.hit = true;
        for (let t = a + 1; t <= tickN; t++) { const cur = hist.get(t), b4 = hist.get(t - 1); if (cur) stepOwn(cur, b4); }
      }
      if (moving) {
        ownOff.x += bx - own.x; ownOff.y += by - own.y;
        if (Math.hypot(ownOff.x, ownOff.y) > 90) ownOff = { x: 0, y: 0 };
      } else ownOff = { x: 0, y: 0 };
    }
    // 그릴 판 — host 프레임으로 INTERP 만큼 늦춰 앞뒤 판 사이를 잇는다. 일(득점 등)도 그 때에 맞춰 낸다
    let viewF = 0;
    function advanceView() {
      if (!buf.length) return;
      const target = tickN + (offs || 0) - INTERP;
      viewF = target;
      let i = buf.length - 1;
      while (i > 0 && buf[i - 1].f > target) i--;
      const s1 = buf[i], s0 = i > 0 ? buf[i - 1] : s1;
      const base = target >= buf[buf.length - 1].f ? buf[buf.length - 1] : s0.f <= target ? s0 : s1;
      const t = s1.f > s0.f ? clamp((target - s0.f) / (s1.f - s0.f), 0, 1) : 1;
      const useOld = base === s0 && target < s1.f;
      const A = useOld ? s0 : base, B = useOld ? s1 : base;
      const k = useOld ? t : 0;
      view = {
        phase: A.phase, pt: A.pt, cd: A.cd, clock: A.clock, score: A.score, fz: A.fz, out: A.out,
        b: { x: lerp(A.b[0], B.b[0], k), y: lerp(A.b[1], B.b[1], k), vx: A.b[2], vy: A.b[3], rot: lerp(A.b[4], B.b[4], k) },
        p: [0, 1].map((j) => ({ x: lerp(A.p[j][0], B.p[j][0], k), y: lerp(A.p[j][1], B.p[j][1], k), vx: A.p[j][2], vy: A.p[j][3], kick: A.p[j][4], ground: !!A.p[j][5] })),
      };
      // 일 — 아직 안 낸 것 중 그 때가 된 것
      for (const s of buf) {
        if (s.f > target + 1) break;
        for (const ev of s.e) {
          if (!Array.isArray(ev) || ev[0] <= seenEv) continue;
          if (ev[4] > target + 1 && ev[1] !== "over") continue;
          seenEv = ev[0];
          guestEvent(ev);
        }
      }
      // 판을 보여 줄 S 에 옮긴다(점수판 · 결과). host 판의 점수가 득점 없이 바뀌었으면 내가 센 점수를 보인다
      S.phase = view.phase; S.pt = view.pt; S.cd = view.cd; S.clock = view.clock; S.out = view.out; S.score = tainted && tally ? tally.slice() : view.score.slice();
      Object.assign(S.ball, view.b);
      S.pl[0].run += Math.abs(view.p[0].x - S.pl[0].x);
      S.pl[0].x = view.p[0].x; S.pl[0].y = view.p[0].y; S.pl[0].kick = view.p[0].kick; S.pl[0].ground = view.p[0].ground; S.pl[0].vx = view.p[0].vx;
      const live = (view.phase === "play" || view.phase === "goal") && view.cd <= 0 && !(view.fz & 8);
      const me = S.pl[1];
      if (live) { me.x = own.x + ownOff.x; me.y = own.y + ownOff.y; me.kick = own.kick; me.ground = own.ground; me.vx = own.vx; me.run = own.run; }
      else { me.run += Math.abs(view.p[1].x - me.x); me.x = view.p[1].x; me.y = view.p[1].y; me.kick = view.p[1].kick; me.ground = view.p[1].ground; me.vx = view.p[1].vx; }
      if (view.cd > 0) cdBeep(view.cd); else lastBeep = 0;
      if (view.phase === "over" && !ended) { overGuestAt = overGuestAt || performance.now(); if (performance.now() - overGuestAt > 1300) finish(); }
    }
    let overGuestAt = 0;
    function guestEvent(ev) {
      const [, type, side, n, , l, r] = ev;
      if ((type === "goal" || type === "over") && !tainted) S.score = [l | 0, r | 0];
      if (type === "kick" || type === "head") S.stats[type === "kick" ? "kicks" : "heads"][side ? 1 : 0]++;
      effect(type, side, n);
    }
    function onMessage(msg) {
      if (!msg || typeof msg !== "object" || destroyed) return;
      if (mode === "host") {
        if (msg.t === "i") onRemoteInput(msg);
        else if (msg.t === "hi") { sendSnap(true); remote.qGrace = performance.now() + 1500; peerAlive(msg); }
        else if (msg.t === "away") setHold("peerAway", !!msg.on);
      } else if (mode === "guest") {
        if (msg.t === "s" || msg.t === "full") onSnap(msg);
      }
    }
    if (online && opts.net && typeof opts.net.onMessage === "function") opts.net.onMessage(onMessage);

    // host 새로고침 뒤 이어 하기
    if (mode === "host" && opts.restore && opts.restore.ball && Array.isArray(opts.restore.pl)) {
      try {
        const R = JSON.parse(JSON.stringify(opts.restore));
        const oldFmt = R.ver !== SAVE_VER; // 합치기 전에 본다 — newState 가 새 ver 를 넣어 두어 합친 뒤에는 늘 같아 보인다
        S = Object.assign(newState(R.minutes || minutes), R);
        S.cd = 0;
        // 공이 작던 때(ver 없음 · 2)에 저장한 판 — 큰 공이 바닥 · 벽에 묻히지 않게 자리만 맞춘다.
        // 경기 중이던 공이 깊어진 골대 안(크로스바 아래)에 들어와 있으면 골대 밖으로 꺼낸다(이어 하자마자 없던 골이 나지 않게)
        if (oldFmt) {
          const b = S.ball;
          b.x = clamp(Number(b.x) || W / 2, BALL_R, W - BALL_R); b.y = Math.min(Number(b.y) || DROP_Y, GROUND - BALL_R);
          for (const k of ["vx", "vy", "rot"]) if (!Number.isFinite(Number(b[k]))) b[k] = 0;
          if (S.phase !== "goal" && S.phase !== "over" && goalSide(b) >= 0) { b.x = b.x < W / 2 ? GOAL_W + BALL_R + BAR_R + 2 : W - GOAL_W - BALL_R - BAR_R - 2; b.vx = 0; }
          S.ver = SAVE_VER;
        }
        S.ev = (Number(S.ev) || 0) + 100; // 저장 뒤에 낸 일 번호와 겹치지 않게 건너뛴다(guest 가 새 득점을 옛 일로 여기지 않게)
        if (S.phase === "over") ended = false;
        // 멈춘 때를 모른다(새로고침 · 창을 닫았다 다시 엶 — performance.now() 는 이 화면이 열린 뒤부터 잰다) — 짧은 멈춤(1 만 세기)으로 치지 않고 늘 3 · 2 · 1
        frozenAt = -Infinity;
      } catch (_) { S = newState(minutes); }
    }

    // ───── 그리기
    let cw = 0, ch = 0, dpr = 1, bg = null, scale = 1;
    function resize() {
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(160, Math.round(rect.width)), h = Math.max(90, Math.round(rect.height));
      dpr = Math.min(Q.dpr, window.devicePixelRatio || 1);
      if (w === cw && h === ch && bg) return;
      cw = w; ch = h;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      scale = canvas.width / W;
      bg = document.createElement("canvas");
      bg.width = canvas.width; bg.height = canvas.height;
      const bgc = bg.getContext("2d");
      bgc.setTransform(scale, 0, 0, canvas.height / H, 0, 0);
      paintBackground(bgc, Q.bg);
    }
    function drawPlayer(p, rp, info, team) {
      const x = rp.x, y = rp.y, f = p.face, side = p.side;
      // 그림자
      if (Q.shadow) {
        const air = clamp((GROUND - y) / 140, 0, 1);
        g.fillStyle = `rgba(15,40,20,${0.28 - air * 0.16})`;
        g.beginPath(); g.ellipse(x, GROUND + 3, 30 - air * 10, 6 - air * 2, 0, 0, Math.PI * 2); g.fill();
      }
      const moving = p.ground && Math.abs(p.vx) > 0.5;
      const swing = moving ? Math.sin(((p.run || 0) + (rp.run || 0)) * 0.16) * 0.6 : 0;
      const kickA = p.kick ? legAngle(p) : p.ground ? swing : 0.5;
      const backA = p.kick ? -0.12 : p.ground ? -swing : -0.25;
      // 레퍼런스처럼 큰 머리 밑에 작은 몸 — 몸통 윗부분은 머리 뒤에 가리고, 셔츠 밑단 · 사원증 · 반바지 · 짧은 다리 · 신발이 머리 밑으로 보인다
      const leg = (hx, a, front) => {
        const fx2 = hx + Math.sin(a) * LEG * f, fy = y - HIP_Y + Math.cos(a) * LEG;
        g.lineCap = "round";
        g.strokeStyle = "#f2c6a2"; g.lineWidth = 6;
        g.beginPath(); g.moveTo(hx, y - HIP_Y); g.lineTo(lerp(hx, fx2, 0.5), lerp(y - HIP_Y, fy, 0.5)); g.stroke();
        g.strokeStyle = front ? team.sock : "#e2e8f0"; g.lineWidth = 6.5;
        g.beginPath(); g.moveTo(lerp(hx, fx2, 0.45), lerp(y - HIP_Y, fy, 0.45)); g.lineTo(fx2, fy); g.stroke();
        g.lineCap = "butt";
        g.save(); g.translate(fx2, fy); g.rotate(f > 0 ? a * 0.6 : -a * 0.6);
        g.fillStyle = front ? "#111827" : "#1f2937";
        g.beginPath(); g.ellipse(f * 4, 1.5, 8, 5, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = team.main; g.fillRect(f > 0 ? 2 : -7, -1, 5, 2);
        g.restore();
      };
      leg(x - 4 * f, backA, false);
      // 팔(뒤쪽) — 머리 옆으로 손만 살짝
      const armA = moving ? swing * 0.8 : p.ground ? 0.25 : -1.1;
      g.strokeStyle = "#f2c6a2"; g.lineWidth = 5.5; g.lineCap = "round";
      g.beginPath(); g.moveTo(x - 11 * f, y - BODY_Y - 4); g.lineTo(x - 11 * f - Math.sin(armA) * 10 * f, y - BODY_Y - 4 + Math.cos(armA) * 10); g.stroke();
      g.lineCap = "butt";
      // 몸통(유니폼) · 반바지 · 사원증
      g.fillStyle = team.shorts;
      roundRect(x - 12, y - HIP_Y - 5, 24, 8, 3); g.fill();
      if (Q.shade) {
        const tg = g.createLinearGradient(x - 14, 0, x + 14, 0);
        tg.addColorStop(0, team.main); tg.addColorStop(1, team.dark);
        g.fillStyle = tg;
      } else g.fillStyle = team.main;
      roundRect(x - 14, y - BODY_Y - 12, 28, 21, 8); g.fill();
      g.fillStyle = "rgba(255,255,255,.85)"; g.fillRect(x - 14, y - HIP_Y - 5, 28, 2);
      g.fillStyle = "#fff"; roundRect(x + 2 * f - (f < 0 ? 7 : 0), y - BODY_Y + 1, 7, 7, 1.2); g.fill();
      g.fillStyle = team.main; g.fillRect(x + 2 * f - (f < 0 ? 7 : 0), y - BODY_Y + 1, 7, 2);
      leg(x + 3 * f, kickA, true);
      // 머리 — 사진 · 그린 얼굴 · 첫 글자
      const hx = x, hy = y - HEAD_Y;
      if (Q.shadow) { g.fillStyle = "rgba(0,0,0,.14)"; g.beginPath(); g.arc(hx + 2, hy + 3, HEAD_R + 1, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = team.main; g.beginPath(); g.arc(hx, hy, HEAD_R + 1, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#ffffff"; g.beginPath(); g.arc(hx, hy, HEAD_R - 2.5, 0, Math.PI * 2); g.fill();
      const ir = HEAD_R - 5;
      g.save(); g.beginPath(); g.arc(hx, hy, ir, 0, Math.PI * 2); g.clip();
      const mood = goalFx && goalFx.side === side && goalFx.t < 110 ? "goal" : p.kick ? "kick" : "";
      if (info.look != null) drawCartoon(g, hx, hy, ir, f, info.look, mood, team);
      else if (info.img && info.ok) drawPhoto(g, info.img, hx, hy, ir);
      else {
        const cg = g.createLinearGradient(hx - ir, hy - ir, hx + ir, hy + ir);
        cg.addColorStop(0, team.main); cg.addColorStop(1, team.dark);
        g.fillStyle = cg; g.fillRect(hx - ir, hy - ir, ir * 2, ir * 2);
        g.fillStyle = "#fff"; g.font = `900 ${Math.round(ir * 1.05)}px ${FONT}`; g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText(Array.from(info.name || "?")[0] || "?", hx, hy + 2);
      }
      g.restore();
      // 반짝 테두리(내 선수)
      if (humanSides.includes(side) && mode !== "local" && meMark > 0) {
        const a = Math.min(1, meMark / 40);
        g.strokeStyle = `rgba(253,224,71,${a})`; g.lineWidth = 3;
        g.beginPath(); g.arc(hx, hy, HEAD_R + 5, 0, Math.PI * 2); g.stroke();
      }
    }
    function roundRect(x, y, w, h, r) {
      g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
    }
    function tagAbove(x, y, text, col) {
      g.font = `800 15px ${FONT}`; g.textAlign = "center"; g.textBaseline = "middle";
      const w = g.measureText(text).width + 16;
      g.fillStyle = col; roundRect(x - w / 2, y - 12, w, 22, 11); g.fill();
      g.beginPath(); g.moveTo(x - 6, y + 9); g.lineTo(x + 6, y + 9); g.lineTo(x, y + 16); g.fill();
      g.fillStyle = "#fff"; g.fillText(text, x, y);
    }

    function render(alpha) {
      resize();
      const sx = canvas.width / W, sy = canvas.height / H;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(bg, 0, 0);
      let ox = 0, oy = 0;
      if (shake > 0.2) { ox = (fxRnd() - 0.5) * shake; oy = (fxRnd() - 0.5) * shake; }
      g.setTransform(sx, 0, 0, sy, ox * sx, oy * sy);
      // 골대 그물(뒤) — 골이 들어가면 출렁인다. 앞 기둥은 선수 앞에 그린다
      for (const s of [0, 1]) paintNet(g, s, netShake[s] > 0.02 ? netShake[s] : 0, Q.net);
      // 공 · 선수 — 판과 판 사이를 이어 부드럽게
      const lp = (i) => {
        const p = S.pl[i];
        if (mode !== "guest" && prev && alpha < 1) return { x: lerp(prev.p[i].x, p.x, alpha), y: lerp(prev.p[i].y, p.y, alpha) };
        return { x: p.x, y: p.y };
      };
      const bpos = mode !== "guest" && prev && alpha < 1
        ? { x: lerp(prev.b.x, S.ball.x, alpha), y: lerp(prev.b.y, S.ball.y, alpha), rot: lerp(prev.b.rot, S.ball.rot, alpha) }
        : { x: S.ball.x, y: S.ball.y, rot: S.ball.rot };
      // 공 그림자
      const bh = clamp((GROUND - bpos.y) / 320, 0, 1);
      if (Q.shadow && bpos.y > 0) { g.fillStyle = `rgba(15,40,20,${0.26 - bh * 0.18})`; g.beginPath(); g.ellipse(bpos.x, GROUND + 3, BALL_R * (0.95 - bh * 0.45), 4.5 - bh * 1.5, 0, 0, Math.PI * 2); g.fill(); }
      const order = S.pl[0].y < S.pl[1].y ? [1, 0] : [0, 1];
      order.forEach((i) => drawPlayer(S.pl[i], lp(i), faces[i], TEAM[i]));
      // 빠른 공 잔상
      const sp = Math.hypot(S.ball.vx, S.ball.vy);
      if (sp > 13) for (let k = Q.trail; k >= 1; k--) drawBall(g, { x: bpos.x - S.ball.vx * k * 0.9, y: bpos.y - S.ball.vy * k * 0.9, rot: bpos.rot }, 0.18 / k, !Q.shade);
      drawBall(g, bpos, 1, !Q.shade);
      // 앞 기둥
      paintGoalFront(g, 0); paintGoalFront(g, 1);
      // 불꽃 · 꽃가루
      for (const s of sparks) {
        g.globalAlpha = clamp(s.life / 20, 0, 1);
        g.fillStyle = s.col;
        if (s.rect) { g.save(); g.translate(s.x, s.y); g.rotate(s.rot); g.fillRect(-s.s, -s.s * 0.6, s.s * 2, s.s * 1.2); g.restore(); }
        else { g.beginPath(); g.arc(s.x, s.y, s.s, 0, Math.PI * 2); g.fill(); }
      }
      g.globalAlpha = 1;
      // 내 선수 표시(경기 시작 · 다시 시작 때)
      if (mode !== "demo" && (S.phase === "wait" || S.phase === "ready" || S.cd > 0 || meMark > 0)) {
        if (mode === "local") { [0, 1].forEach((i) => { const p = lp(i); tagAbove(p.x, p.y - HEAD_Y - HEAD_R - 22, i ? "2P" : "1P", TEAM[i].dark); }); }
        else { const p = lp(mySide); tagAbove(p.x, p.y - HEAD_Y - HEAD_R - 22, "나", TEAM[mySide].dark); }
      }
      // 화면 단위(CSS px)로 — 점수판 · 큰 글씨
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      hudBox = null;
      if (mode !== "demo") hud();
      offMark(bpos);
      overlayText();
      if (flash > 0.02) { g.fillStyle = `rgba(255,255,255,${flash * 0.35})`; g.fillRect(0, 0, cw, ch); }
    }
    function fmtClock(frames) {
      const s = Math.max(0, Math.ceil(frames / 60));
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    }
    function fitText(text, maxW) {
      if (g.measureText(text).width <= maxW) return text;
      const chars = Array.from(text);
      while (chars.length > 1 && g.measureText(chars.join("") + "…").width > maxW) chars.pop();
      return chars.join("") + "…";
    }
    // 화면 위로 넘어간(또는 점수판 뒤에 가린) 공 — 점수판 다음에 그려 가리지 않게, 점수판과 겹치는 자리면 점수판 바로 아래에
    let hudBox = null; // 점수판 자리(CSS px)
    function offMark(bp) {
      const kx = cw / W, ky = ch / H;
      const x = clamp(bp.x * kx, 12, cw - 12), bottom = (bp.y + BALL_R) * ky;
      const underHud = hudBox && x > hudBox.x - 14 && x < hudBox.x + hudBox.w + 14;
      const top = underHud ? hudBox.y + hudBox.h : 0;
      if (bottom > top + 4) return; // 공이 보인다
      const r = clamp(BALL_R * kx * 0.42, 6, 12), y = top + 5;
      g.fillStyle = "rgba(15,23,42,.62)";
      g.beginPath(); g.moveTo(x, y); g.lineTo(x - r, y + r * 1.1); g.lineTo(x + r, y + r * 1.1); g.closePath(); g.fill();
      g.fillStyle = "#ffffff"; g.strokeStyle = "rgba(15,23,42,.8)"; g.lineWidth = 1.5;
      g.beginPath(); g.arc(x, y + r * 2.2 + 2, r, 0, Math.PI * 2); g.fill(); g.stroke();
    }
    function hud() {
      const compact = cw < 600;
      const hgt = clamp(Math.round(cw * 0.052), 30, 50);
      const fs = Math.round(hgt * 0.56);
      const nameW = compact ? 0 : clamp(cw * 0.12, 70, 150);
      const scoreW = Math.round(hgt * 1.05), clockW = Math.round(hgt * 1.9), avaR = Math.round(hgt * 0.34);
      const sideW = (compact ? 0 : nameW + 10) + avaR * 2 + 12 + scoreW;
      const total = sideW * 2 + clockW;
      const x0 = Math.round((cw - total) / 2), y0 = Math.round(clamp(ch * 0.02, 6, 14));
      hudBox = { x: x0, y: y0, w: total, h: hgt };
      g.fillStyle = "rgba(10,25,52,.82)";
      roundRectPx(x0, y0, total, hgt, hgt * 0.32); g.fill();
      g.textBaseline = "middle";
      const mid = y0 + hgt / 2;
      [0, 1].forEach((i) => {
        const left = i === 0;
        const sx0 = left ? x0 : x0 + sideW + clockW;
        // 점수 칸
        const scX = left ? sx0 + sideW - scoreW : sx0;
        g.fillStyle = TEAM[i].main;
        g.fillRect(scX, y0, scoreW, hgt);
        g.fillStyle = "#fff"; g.font = `900 ${Math.round(hgt * 0.7)}px ${FONT}`; g.textAlign = "center";
        g.fillText(String(S.score[i]), scX + scoreW / 2, mid + 1);
        // 얼굴
        const ax = left ? sx0 + 8 + avaR : sx0 + sideW - 8 - avaR;
        g.save(); g.beginPath(); g.arc(ax, mid, avaR, 0, Math.PI * 2); g.clip();
        const info = faces[i];
        if (info.look != null) drawCartoon(g, ax, mid, avaR, left ? 1 : -1, info.look, "", TEAM[i]);
        else if (info.img && info.ok) drawPhoto(g, info.img, ax, mid, avaR);
        else { g.fillStyle = TEAM[i].main; g.fillRect(ax - avaR, mid - avaR, avaR * 2, avaR * 2); g.fillStyle = "#fff"; g.font = `800 ${Math.round(avaR * 1.1)}px ${FONT}`; g.fillText(Array.from(info.name)[0] || "?", ax, mid + 1); }
        g.restore();
        g.strokeStyle = TEAM[i].main; g.lineWidth = 2; g.beginPath(); g.arc(ax, mid, avaR, 0, Math.PI * 2); g.stroke();
        if (!compact) {
          g.font = `700 ${Math.round(fs * 0.86)}px ${FONT}`; g.fillStyle = "#e2e8f0"; g.textAlign = left ? "left" : "right";
          const nx = left ? ax + avaR + 8 : ax - avaR - 8;
          g.fillText(fitText(faces[i].name, nameW), nx, mid + 1);
        }
      });
      // 시계
      const low = S.clock <= 600 && S.phase !== "over" && S.phase !== "wait";
      g.textAlign = "center";
      g.font = `800 ${Math.round(hgt * 0.5)}px ${FONT}`;
      g.fillStyle = S.phase === "over" ? "#fde68a" : low && Math.floor(S.clock / 30) % 2 ? "#fca5a5" : "#ffffff";
      g.fillText(S.phase === "over" ? "끝" : fmtClock(S.clock), x0 + sideW + clockW / 2, mid + 1);
    }
    function roundRectPx(x, y, w, h, r) { roundRect(x, y, w, h, r); }
    function bigText(text, sub, col, scaleT, ring) {
      const size = clamp(cw * 0.11, 44, 120) * (scaleT || 1);
      g.textAlign = "center"; g.textBaseline = "middle";
      g.font = `900 ${Math.round(size)}px ${FONT}`;
      g.lineJoin = "round";
      g.lineWidth = Math.max(4, size * (ring ? 0.2 : 0.09)); g.strokeStyle = "rgba(10,25,52,.9)";
      g.strokeText(text, cw / 2, ch * 0.42);
      if (ring) { g.lineWidth = Math.max(3, size * 0.1); g.strokeStyle = ring; g.strokeText(text, cw / 2, ch * 0.42); }
      g.fillStyle = col; g.fillText(text, cw / 2, ch * 0.42);
      if (sub) {
        const s2 = clamp(cw * 0.032, 15, 30);
        g.font = `800 ${Math.round(s2)}px ${FONT}`;
        g.lineWidth = Math.max(3, s2 * 0.2); g.strokeText(sub, cw / 2, ch * 0.42 + size * 0.62);
        g.fillStyle = "#fff"; g.fillText(sub, cw / 2, ch * 0.42 + size * 0.62);
      }
    }
    function dim(a) { g.fillStyle = `rgba(10,25,52,${a})`; g.fillRect(0, 0, cw, ch); }
    function overlayText() {
      if (mode === "demo") return;
      const cd = S.cd;
      const fzCode = mode === "guest" ? (view ? view.fz : 0) : frozen ? 8 : 0;
      if (fzCode & 8 && !(mode !== "guest" && paused)) {
        dim(0.35);
        let msg = "잠깐 멈췄어요";
        if (mode === "host") msg = holds.has("net") ? "다시 연결하는 중…" : holds.has("peer") ? (S.phase === "wait" ? "상대를 기다리는 중…" : "상대 연결을 기다리는 중…") : holds.has("peerAway") ? "상대가 잠깐 화면을 떠났어요" : holds.has("peerSilent") ? "상대 연결이 고르지 않아요…" : msg;
        if (mode === "guest") msg = fzCode & 1 ? "상대가 잠깐 화면을 떠났어요" : fzCode & 4 ? "잠깐 멈췄어요" : fzCode & 16 ? "연결이 고르지 않아요…" : "상대를 기다리는 중…";
        bigText(msg, "", "#ffffff", 0.36);
        return;
      }
      if (mode === "guest" && stalled && S.phase !== "over") { dim(0.25); bigText("연결이 고르지 않아요…", "", "#ffffff", 0.34); return; }
      if (cd > 0) {
        const n = Math.ceil(cd / 60);
        const k = (cd % 60) / 60;
        dim(0.18);
        bigText(String(n), S.phase === "ready" && S.score[0] + S.score[1] === 0 && S.played === 0 ? "곧 시작해요" : "이어서 해요", "#fde047", 1 + k * 0.3);
        return;
      }
      if (S.phase === "goal" && goalFx) {
        const t = goalFx.t;
        const pop = t < 12 ? 0.6 + (t / 12) * 0.55 : t < 20 ? 1.15 - ((t - 12) / 8) * 0.15 : 1;
        bigText("골!", `${S.score[0]} : ${S.score[1]}`, "#ffffff", pop, TEAM[goalFx.side].main);
        return;
      }
      if (S.phase === "ready" && S.out) {
        // 아웃 — 레퍼런스의 「OUT!!!」처럼 다시 시작할 때까지 크게(그동안에도 시계는 간다)
        const t = OUT_PT - S.pt, pop = t < 10 ? 0.6 + (t / 10) * 0.5 : t < 16 ? 1.1 - ((t - 10) / 6) * 0.1 : 1;
        dim(0.12);
        bigText("아웃!", "골대 위로 넘어갔어요 · 막던 쪽 공으로 다시 해요", "#ffffff", pop * 0.9, "#475569");
        return;
      }
      if (S.phase === "ready" && S.pt > 0 && S.played > 0) { bigText("준비", "", "#ffffff", 0.5); return; }
      if (S.phase === "over") { dim(0.3); bigText("경기 끝", `${S.score[0]} : ${S.score[1]}`, "#fde047", 0.8); }
    }

    function stepFx() {
      if (shake > 0) shake *= 0.86;
      for (const s of [0, 1]) netShake[s] *= 0.96;
      if (flash > 0) flash *= 0.85;
      if (meMark > 0) meMark--;
      if (goalFx) { goalFx.t++; if (goalFx.t > GOAL_PT + 20) goalFx = null; }
      for (const s of sparks) { s.x += s.vx; s.y += s.vy; s.vy += s.g; s.vx *= 0.99; s.life--; if (s.rot != null) s.rot += 0.2; }
      if (sparks.length) sparks = sparks.filter((s) => s.life > 0 && s.y < H + 20);
    }

    function loop(ts) {
      if (destroyed) return;
      raf = requestAnimationFrame(loop);
      if (!lastTs) lastTs = ts;
      let dt = Math.min(250, ts - lastTs);
      lastTs = ts;
      if (!running) { render(1); return; }
      acc += dt;
      let n = 0;
      while (acc >= STEP_MS && n < 8) { tick(); stepFx(); acc -= STEP_MS; n++; }
      if (n >= 8) acc = 0;
      render(acc / STEP_MS);
    }

    // ── 밖에서 쓰는 것
    function start() {
      if (running || destroyed) return;
      running = true;
      if (mode === "cpu" || mode === "local" || mode === "demo") {
        placeKickoff(S, 0); S.phase = "ready"; S.pt = 0; S.cd = mode === "demo" ? 0 : COUNT_CD; prev = null;
        if (mode === "demo") { S.pt = 20; }
      }
      if (mode === "guest" && opts.net) { try { opts.net.send({ t: "hi", w: awayMe ? 1 : 0, q: -1 }); } catch (_) { /* 연결되면 다시 */ } }
      lastTs = 0; acc = 0;
      if (!raf) raf = requestAnimationFrame(loop);
    }
    function begin() {
      if (mode !== "host" || S.phase !== "wait") return false;
      placeKickoff(S, 0); S.phase = "ready"; S.pt = 0; prev = null;
      if (!frozen) S.cd = COUNT_CD;
      sendSnap(true);
      return true;
    }
    function hold(reason, on) {
      if (mode === "guest") {
        // 바로 알리고, 놓쳐도 다음 입력 · 전체 판 달라기에 w 로 다시 실린다
        if (reason === "away") { awayMe = !!on; if (opts.net) { try { opts.net.send({ t: "away", on: awayMe }); } catch (_) { /* 다시 붙으면 */ } } }
        return;
      }
      if (mode !== "host") return;
      setHold(reason, on); // 풀리면 3 · 2 · 1 (첫 킥오프 전이면 늘 3 · 2 · 1)
    }
    function pause() {
      if (online || mode === "demo" || ended || paused || !running) return false;
      paused = true; refreshFrozen();
      return true;
    }
    function resume() {
      if (!paused) return;
      paused = false; refreshFrozen();
    }
    function resync() {
      if (mode === "host") sendSnap(true);
      else if (mode === "guest" && opts.net) { try { opts.net.send({ t: "hi", w: awayMe ? 1 : 0, q: lastQ() }); } catch (_) { /* 다시 */ } }
    }
    function control(act, on, side) {
      const s = side == null ? mySide : side;
      const map = { left: "l", right: "r", jump: "j", kick: "k" };
      if (!map[act] || !running || ended) return;
      press(s, map[act], !!on, "t");
    }
    // 화질 바꾸기 — 다음 그림부터(배경을 새로 그려 둔다). 판 · 물리 · 통신은 그대로
    function setQuality(q) {
      if (!hasKey(QUALITY, q) || QUALITY[q] === Q) return false;
      Q = QUALITY[q]; bg = null;
      return true;
    }
    function destroy() {
      destroyed = true; running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", releaseAll);
    }
    // 첫 화면을 바로 그린다(시작 전 · 덮개 뒤)
    raf = requestAnimationFrame(loop);

    const api = {
      start, begin, hold, pause, resume, resync, control, destroy, peerTrouble, setQuality,
      quality: () => Object.keys(QUALITY).find((k) => QUALITY[k] === Q),
      score: () => ({ left: S.score[0], right: S.score[1], me: S.score[mySide], rival: S.score[1 - mySide] }),
      isOver: () => ended || S.phase === "over",
      phase: () => S.phase,
      exportState: () => (mode === "host" ? JSON.parse(JSON.stringify(S)) : null),
      side: mySide,
    };
    if (/^(localhost|127\.0\.0\.1)$|\.test$/.test(location.hostname)) api._debug = { get S() { return S; }, set S(v) { S = v; }, ctl, holds, get view() { return view; }, own, faces, fx, render, sparks: () => sparks, get dpr() { return dpr; }, setPose: (fn) => { fn(S); prev = null; }, get tally() { return tally && { tally: tally.slice(), tainted, tallyEv }; }, remote };
    return api;
  }

  return {
    create,
    // 시험용 — 물리 · 컴퓨터만 따로(화면 없이 판을 돌려 본다)
    _sim: { W, H, GROUND, GOAL_W, BAR_Y, BALL_R, HEAD_R, HEAD_Y, AI_LEVEL, newState, placeKickoff, simStep, makeAI, aiInput, rngOf, goalSide, outSide },
  };
})();
