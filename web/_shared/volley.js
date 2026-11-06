/**
 * 옥상 배구 — 1:1 배구 엔진 (캔버스 · 120Hz 고정 계산)
 *
 *   const game = HKVolley.create(canvas, opts)
 *     → { start, pause, resume, destroy, score, control, isPaused, isOver, setLink, saveState, setReady, setTarget,
 *         setLook, setFps, setCourt, requestPause, lobby, phase, debug }
 *   HKVolley.LOOKS [{ id, name }] 고를 수 있는 선수 모습(능력은 같음) · HKVolley.thumb(id) 그 선수 작은 그림(data URL)
 *   HKVolley.COURTS [{ id, name }] 고를 수 있는 코트 배경(한낮 · 노을 · 야간 · 눈 오는 날 — 그림만 다름)
 *
 *   opts.mode    "cpu"(컴퓨터와) | "local"(한 화면 둘이) | "host"(온라인 — 판을 계산하는 쪽) | "guest"(온라인 — 받아서 그리는 쪽)
 *                | "demo"(첫 화면 뒤에서 도는 구경용 — 컴퓨터끼리, 소리 없음)
 *   opts.level   "easy" | "normal" | "hard" — 컴퓨터 실력 (cpu)
 *   opts.target  먼저 이 점수를 내면 이긴다 (7 · 15, 듀스 없음). 온라인은 주인이 준비 화면에서 바꿀 수 있다
 *   opts.me      { name, avatarUrl } — 나(1P). opts.rival — 상대(컴퓨터 · 2P · 동료)
 *   opts.net     { send(obj), onMessage(fn) } — host · guest 만. obj 는 JSON 으로 바꿀 수 있는 작은 객체
 *   opts.touch   true 면 화면 안내를 터치 버튼 말로 (점프 버튼 등)
 *   opts.best    cpu — 이 난이도 · 점수의 내 최고 랠리(화면 위 안내용)
 *   opts.looks   cpu · local · demo — [왼쪽, 오른쪽] 선수 모습(LOOKS 번호). 자리는 발밑 표시(왼쪽 이어진 줄 · 오른쪽 끊긴 줄)로 구별
 *   opts.look    host · guest — 내 선수 모습. 상대 모습은 상대가 알려 준다 (경기 전에만 바꿀 수 있다)
 *   opts.fps     60(기본) | 30(가볍게 — 그리는 횟수만 줄인다. 계산은 그대로 120Hz)
 *   opts.court   코트 배경 "day"(기본) | "sunset" | "night" | "snow" — 내 화면에만(통신에 싣지 않는다)
 *   opts.onEnd(result)  경기가 끝나면 한 번
 *                       { win, winner(0|1), me, rival, left, right, rally(가장 긴 랠리), spikes:{me, rival}, sec, mode, level, target }
 *   opts.onEvent(e)     { type: "start" | "serve" | "point" | "end" | "lobby" | "autopause" | "inputreset", ... } — 페이지가 필요하면 쓴다
 *                       lobby: 온라인 준비 · 멈춤 상태가 바뀜 { phase, paused, pausedBy, pausedWhy, ready:[나, 상대], target, peer, host }
 *                       autopause: cpu · local 에서 화면이 너무 오래 멈췄다(0.25초 넘게) — 페이지가 멈춤 화면을 띄운다
 *                       inputreset: 단계가 바뀌어 누르던 조작을 모두 풀었다 { drop } — drop 이면 페이지도 잡고 있던 터치를 놓는다
 *                                   (혼자 · 둘이: 득점 · 다음 서브 때. 온라인: 단계 · 일시정지가 바뀔 때마다 — 서브 → 랠리만 drop 아님)
 *   opts.sfx(name)      효과음 — 기본 HKSound.play (소리 끄기는 공통 버튼이 맡는다)
 *   opts.resume         host 만 — saveState() 로 받아 둔 값. 새로고침한 주인이 그 점수 · 서브부터 이어 간다
 *
 *   control(name, down) — 화면 버튼: "left" "right" "jump" "dive" "spike"("hit" 도 같음). 누르기는 서브 · 랠리 중에만 먹는다
 *   setLink(kind)       온라인 — 페이지가 아는 연결 상태: "ok" | "away"(상대가 안 보임) | "retry"(다시 연결하는 중).
 *                       ok 가 아니면 host 는 판을 멈추고(공 · 사람 그대로), 돌아오면 1초 뒤 이어 간다 — 3초를 넘기면 일시정지(둘 다 계속 준비)
 *   setReady(on)        온라인 — 경기 전 「준비」 · 일시정지 뒤 「계속 준비」. 두 사람 모두 준비하면 3초 뒤 시작(이어 감)
 *   setTarget(t)        온라인 주인만 · 경기 전 — 목표 점수 7 · 15 (바꾸면 두 사람 준비가 풀린다)
 *   setLook(id)         온라인 · 경기 전 — 내 선수 모습 (바꾸면 두 사람 준비가 풀린다 — 레퍼런스 친구 대전과 같음)
 *   setFps(n)           화면 표시 60 · 30
 *   setCourt(id)        코트 배경 바꾸기 — 바로 다시 그린다(경기 · 통신은 그대로)
 *   requestPause()      온라인 — 일시정지. 두 사람 모두 「계속 준비」를 눌러야 이어 간다
 *   saveState()         host — 이어 하기용 값 { sc, sv, sp, be, ss, sec, tg } (점수 · 서브 · 강타 수 · 가장 긴 랠리 · 경기 시간 · 목표)
 *
 * 자리: 왼쪽 = 0, 오른쪽 = 1. cpu · local · host 는 나(1P)가 왼쪽, guest 는 오른쪽. 화면은 뒤집지 않는다 —
 *   손님도 자기 화면 오른쪽에서 뛰고, ← 는 늘 화면(세계) 왼쪽이다 (레퍼런스 친구 대전과 같음). 내 자리는 머리 위 「나」로 알려 준다.
 *
 * 규칙 · 물리 (세계 960×540, 바닥 470, 1/120초마다 한 번 계산 — 모든 수는 이 단위)
 *   사람: 반지름 30 원(서 있으면 가운데 높이 440 · 발이 바닥), 다이빙 중 반지름 39. 좌우 350/초(바로 그 속도, 가속 없음).
 *         점프 위로 840/초 · 중력 1850/초² (약 188 높이 · 0.9초 체공). 바닥에서만 뛴다. 누를 때 한 번 — 누르고 있어도 다시 뛰지 않는다.
 *         다이빙: 바닥에서 · 보는 쪽으로 650/초로 34틱(0.28초) 미끄러짐 + 살짝 뜸(위로 115/초), 그 뒤 76틱(0.63초) 동안 다이빙 · 강타 못 함.
 *         강타: 28틱(0.23초) 동안 「강타 준비」 — 그 안에 공이 몸에 닿으면 강타. 그 뒤 48틱(0.4초) 쉼. 누르기만 해서는 뛰지 않는다.
 *   공:   반지름 13 · 중력 900/초² · 세로 속도 ±1050 까지. 양옆 벽 · 천장에서 그대로 튄다. 그물(가운데 폭 12 · 꼭대기 278)은 0.8 로 튄다.
 *   닿기: 공이 몸(원)에 닿으면 저절로 받는다 — 상대 쪽 330/초 + 닿은 자리(몸 가운데에서 얼마나 옆) × 140 + 내 속도 × 0.18,
 *         위로 650/초(위로 뛰는 중이면 730). 강타 준비 중이면 상대 쪽 690/초 + 내 속도 × 0.1 로 — 공이 높으면(가운데 233 위) 아래로 150,
 *         낮으면 위로 350. 닿은 뒤 0.1초(12틱)는 다시 닿지 않는다. 공이 낮으면(265 아래) 내 코트 쪽에 남긴다. 터치 수 제한 없음.
 *   서브: 공은 서브하는 쪽 머리 위(높이 235)에 멈춰 있다 — 서브하는 사람 몸이 닿아야(점프) 상대 쪽 340 · 위 400 으로 출발.
 *         시간만 지나서는 출발하지 않는다. 점수를 내준 쪽이 서브. 첫 서브는 왼쪽(나 · 1P · 주인).
 *   점수: 공이 바닥에 닿으면 반대편 1점 — 그 자리에 멈추고 1.5초 보여 준 뒤 다음 서브. 먼저 목표 점수(7 · 15)를 내면 끝(듀스 없음).
 *
 * 온라인: host 가 120Hz 로 판을 계산하고 30Hz 로 상태(snapshot)와 그 사이 사건을 보낸다. guest 는 입력이 바뀔 때(+0.12초마다 다시)
 *   보내고, 받은 상태를 8틱(약 0.07초) 늦게 보간해 그린다.
 *   guest → host  {t:"hi", d, h, j, rd, c, u} 준비됨(대기 상태를 받는 동안 0.5초마다 다시 — d · h · j 는 지금 누른 횟수, 다시 맞추기용 · c 내 선수 · u 마지막으로 받은 준비 풀기 번호)
 *                 {t:"ch", c} 경기 전 선수를 바꿈
 *                 {t:"in", k, d, h, j} 입력 · {t:"away"} 화면을 숨김(다른 탭 · 잠금) · {t:"ping", c}
 *                 {t:"rd", on, u} 준비 · 계속 준비 · {t:"pz"} 일시정지
 *                  k 비트: 1 왼 · 2 오 (세계 기준 = 화면 기준)
 *                  d · h · j: 다이빙 · 강타 · 점프를 누른 횟수 (짧게 눌러도 빠지지 않게 횟수로 보낸다)
 *   host → guest  {t:"go", e} 시작 · {t:"s", e, f, ph, …, rd, pz, pb, pw, lk, ev:[사건]} 상태(lk: [왼쪽, 오른쪽] 선수 모습) · {t:"hold", e, r, rd, pz, pb, pw, n} 멈춤 · {t:"pong", c}
 *                 {t:"unrd", e, u} 목표 점수 · 선수가 바뀌어 두 사람 준비를 풀었다(손님은 「준비됨」을 다시 보내지 않게 제 준비도 푼다)
 *                  u: 준비 풀기 번호 — 손님은 받은 u 를 hi · rd 에 실어 보내고, 주인은 지금 번호보다 옛 u 가 달린 「준비됨」을 버린다
 *                     (준비를 푼 순간 오던 옛 「준비됨」 때문에 손님이 확인하지 않았는데 준비로 되살아나지 않게)
 *                  e: 주인 판 번호(엔진을 만들 때마다 새로) — 바뀌면 손님은 받아 둔 상태를 비우고 처음부터 다시 맞춘다
 *                  r: 멈춘 까닭 — "away"(상대가 안 보임) · "retry"(연결 다시) · "slow"(손님 입력이 끊김) · "rest"(주인 화면 숨김) ·
 *                     "gone"(손님 화면 숨김) · "pause"(일시정지 — 둘 다 계속 준비해야) · "resume"(곧 이어 감)
 *                  rd: [주인 준비, 손님 준비] · pz: 일시정지 중(1) · pb: 누구 때문에(0 주인 · 1 손님) · pw: 까닭(pause · away · slow · link)
 *   host 는 손님 입력이 0.8초 넘게 안 오면 판을 멈춘다 — 한쪽만 움직이는 일이 없게. 손님이 화면을 숨기면(away) 누르던 조작만 풀고 이어 가다가
 *   입력이 끊긴 채 0.8초가 지나면 멈춘다(gone).
 *   이런 멈춤(또는 주인 화면 숨김)이 3초를 넘으면 일시정지로 바꾼다 — 레퍼런스 친구 대전처럼 두 사람 모두 「계속 준비」를 눌러야 이어 간다.
 *   조작: 키는 처음 누를 때만(자동 반복은 버림), 서브 · 랠리 중에만 먹는다. 단계가 바뀌면 누르던 것을 모두 풀어 다시 눌러야 한다.
 */
(function () {
  "use strict";

  // ───────── 세계 — 960×540 (화면 크기에 맞춰 늘려 그린다). 바닥 470, 그물 가운데 480
  const W = 960, H = 540, FLOOR = 470;
  const HZ = 120, DT = 1 / HZ;
  const P_Y = 440; // 서 있을 때 몸(원) 가운데 높이
  const PR = 30, PR_DIVE = 39, BR = 13; // 몸 · 다이빙 중 몸 · 공 반지름
  const NET_X = 480, NET_L = 474, NET_R = 486, NET_TOP = 278;
  const RUN = 350, AI_RUN = { easy: 260, normal: 320, hard: 350 };
  const JUMP_V = 840, P_GRAV = 1850;
  const DIVE_TICKS = 34, DIVE_COOL = 76, DIVE_HOP = 115, DIVE_V = 650;
  const SPIKE_TICKS = 28, SPIKE_COOL = 48;
  const X_MIN = [30, 516], X_MAX = [444, 930];
  const B_GRAV = 900, B_VMAX = 1050, B_FLOOR = FLOOR - BR; // 457 — 공이 바닥에 닿은 높이
  const SERVE_X = [225, 735], SERVE_Y = 235, SERVE_VX = 340, SERVE_VY = -400, SERVE_WAIT = 84;
  const TOUCH_CD = 12;
  const BALL_SPIN = (3 * Math.PI) / 180; // 공 무늬는 틱마다 3도씩 돈다(그림만 — 서브 · 랠리 틱을 센 값으로, 레퍼런스와 같음)
  const SPIKE_VX = 690, SPIKE_HIGH = 233, SPIKE_DOWN = 150, SPIKE_UP = -350;
  const HIT_VX = 330, HIT_SPREAD = 140, HIT_VY = -650, HIT_RISE = 80;
  const KEEP_Y = 265, KEEP_X = [461, 499]; // 낮게 받은 공은 그물을 뚫지 않게 내 코트 쪽에 둔다
  const NET_BOUNCE = 1.8; // 그물에 맞으면 들어온 속도의 0.8 로 튄다
  const AI_EVERY = { easy: 25, normal: 14, hard: 7 }; // 컴퓨터가 다시 생각하는 간격(틱)
  const COUNT_T = 3, POINT_T = 1.5, END_T = 0;
  // 득점 뒤 · 시작 전 쉼은 틱 수로 센다 (1/120 을 더해 가면 소수 오차로 한 틱 길어진다 — 레퍼런스는 1500ms 그대로)
  const POINT_TICKS = Math.round(POINT_T * HZ), COUNT_TICKS = Math.round(COUNT_T * HZ);
  const HOLD_PAUSE_MS = 3000; // 온라인 — 멈춤(상대 안 보임 · 연결 끊김 · 입력 끊김)이 이보다 길면 일시정지로 바꾼다(둘 다 계속 준비)
  const SWING_T = SPIKE_TICKS * DT + 0.07; // 강타 팔 휘두르기 그림 시간(초)
  const PH = ["wait", "count", "serve", "play", "point", "end"];
  const K_L = 1, K_R = 2;
  const SNAP_EVERY = 4; // 120Hz 계산 · 30Hz 전송
  const GUEST_DELAY = 8; // guest 가 늦게 그리는 틱 수

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const r1 = (v) => Math.round(v * 10) / 10;
  const r2 = (v) => Math.round(v * 100) / 100;
  const onGround = (p) => p.y >= P_Y - 0.01;
  const noInput = () => ({ axis: 0, jump: false, dive: false, spike: false });

  // ───────── 상태
  function newPlayer(side) {
    return {
      side, x: SERVE_X[side], y: P_Y, vx: 0, vy: 0, face: side ? -1 : 1,
      dive: 0, cd: 0, spk: 0, // 다이빙 · 쉼 · 강타 준비 남은 틱
      swing: 0, land: 0, run: 0, mood: 0, // 그림용 (초)
      seenD: 0, seenH: 0, seenJ: 0,
    };
  }
  function newBall(x) {
    return { x, y: SERVE_Y, vx: 0, vy: 0, rot: 0, held: 1, cd: 0, pow: 0, last: -1 };
  }
  function newState(target, serve, phase) {
    return {
      f: 0, tick: 0, phase, t: 0, hold: 0, target, score: [0, 0], serve, wait: SERVE_WAIT, rally: 0, best: 0, spikes: [0, 0], winner: -1, scorer: -1,
      serves: [0, 0], ball: newBall(SERVE_X[serve]), p: [newPlayer(0), newPlayer(1)],
      ai: [noInput(), noInput()], aiT: [0, 0], ready: [0, 0], pz: 0, pzBy: -1, pzWhy: "",
      looks: [0, 1], // 왼쪽 · 오른쪽 선수 모습(LOOKS 번호) — 그림만, 계산에는 쓰지 않는다
    };
  }
  // 서브 자리 — 서버 쪽 위에 공을 멈춰 두고 둘 다 제자리로
  function placeServe(S) {
    S.p.forEach((p, i) => { S.p[i] = Object.assign(newPlayer(i), { seenD: p.seenD, seenH: p.seenH, seenJ: p.seenJ }); });
    S.ball = newBall(SERVE_X[S.serve]);
    S.ball.rot = S.tick * BALL_SPIN;
    S.rally = 0;
    S.wait = SERVE_WAIT;
    S.ai = [noInput(), noInput()];
    S.aiT = [0, 0];
  }
  // 득점 안내가 끝남(또는 득점 안내 중 멈췄다 이어 감) — 바로 다음 서브
  function toServe(S, ev) {
    S.phase = "serve"; S.t = 0; S.hold = 0;
    S.p.forEach((p) => { p.mood = 0; });
    placeServe(S);
    ev.push({ k: "serve", s: S.serve });
  }

  // ───────── 공 — 중력 · 벽 · 천장 · 그물. 그물에 맞았으면 true
  // (계산 순서 · 나눗셈 꼴까지 레퍼런스와 같게 — 같은 입력이면 틱마다 같은 값이 나온다)
  function stepBall(b) {
    b.vy = clamp(b.vy + B_GRAV / HZ, -B_VMAX, B_VMAX);
    b.x += b.vx / HZ;
    b.y += b.vy / HZ;
    if (b.x < BR) { b.x = BR; b.vx = Math.abs(b.vx); } else if (b.x > W - BR) { b.x = W - BR; b.vx = -Math.abs(b.vx); }
    if (b.y < BR) { b.y = BR; b.vy = Math.abs(b.vy); }
    // 그물 — 폭 12 기둥(꼭대기 278 ~ 바닥). 가장 가까운 점에서 밀어내고 0.8 로 튕긴다
    const cx = clamp(b.x, NET_L, NET_R), cy = clamp(b.y, NET_TOP, FLOOR);
    const dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy);
    if (d < BR) {
      const nx = d > 1e-8 ? dx / d : b.vx > 0 ? -1 : 1, ny = d > 1e-8 ? dy / d : 0;
      b.x += nx * (BR - d + 0.01);
      b.y += ny * (BR - d + 0.01);
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) { b.vx -= NET_BOUNCE * vn * nx; b.vy -= NET_BOUNCE * vn * ny; return true; }
    }
    return false;
  }

  // ───────── 사람 — in: { axis(-1~1), jump, dive, spike } (jump · dive · spike 는 이번 틱에 누른 것만)
  function movePlayer(p, side, inp, speed, ev) {
    const ax = Number.isFinite(inp.axis) ? clamp(inp.axis, -1, 1) : 0;
    const ground = onGround(p);
    p.cd = Math.max(0, p.cd - 1);
    p.spk = Math.max(0, p.spk - 1);
    if (ax) p.face = ax > 0 ? 1 : -1;
    if (inp.jump && ground && !p.dive) {
      p.vy = -JUMP_V;
      if (ev) ev.push({ k: "jump", s: side, x: p.x, y: p.y });
    }
    if (inp.dive && ground && !p.cd && !p.dive) {
      p.dive = DIVE_TICKS; p.cd = DIVE_COOL; p.vy = -DIVE_HOP;
      if (ev) ev.push({ k: "dive", s: side, x: p.x, y: p.y });
    }
    if (inp.spike && !p.cd && !p.dive) {
      p.spk = SPIKE_TICKS; p.cd = SPIKE_COOL;
      if (ev) { p.swing = SWING_T; ev.push({ k: "swing", s: side }); }
    }
    p.vx = p.dive ? p.face * DIVE_V : ax * speed;
    p.x = clamp(p.x + p.vx / HZ, X_MIN[side], X_MAX[side]);
    const air = !ground;
    p.vy += P_GRAV / HZ;
    p.y += p.vy / HZ;
    if (p.y >= P_Y) {
      p.y = P_Y; p.vy = 0;
      if (air && ev) { p.land = 0.12; ev.push({ k: "land", s: side, x: p.x, y: FLOOR }); }
    }
    p.dive = Math.max(0, p.dive - 1);
  }

  // 공이 몸에 닿았나 — 닿으면 저절로 받거나(강타 준비 중이면) 강타. 한 틱에 한 사람만
  function contact(S, ev) {
    const b = S.ball;
    for (let side = 0; side < 2; side++) {
      const p = S.p[side], r = p.dive ? PR_DIVE : PR;
      const ax = b.x - p.x, ay = b.y - p.y, d = Math.hypot(ax, ay);
      if (d > r + BR) continue;
      const toOpp = side ? -1 : 1, nx = d ? ax / d : 0, ny = d ? ay / d : -1;
      b.x = p.x + nx * (r + BR + 1);
      b.y = Math.min(p.y + ny * (r + BR + 1), B_FLOOR - 1);
      let kind;
      if (p.spk) {
        kind = "spike";
        b.vx = toOpp * SPIKE_VX + p.vx * 0.1;
        b.vy = b.y < SPIKE_HIGH ? SPIKE_DOWN : SPIKE_UP;
        p.spk = 0;
        S.spikes[side]++;
      } else {
        kind = "hit";
        b.vx = toOpp * HIT_VX + clamp(ax / r, -1, 1) * HIT_SPREAD + p.vx * 0.18;
        b.vy = HIT_VY - (p.vy < 0 ? HIT_RISE : 0);
      }
      if (b.y > KEEP_Y) b.x = side ? Math.max(b.x, KEEP_X[1]) : Math.min(b.x, KEEP_X[0]);
      b.cd = TOUCH_CD;
      S.rally = Math.min(10000, S.rally + 1);
      S.best = Math.max(S.best, S.rally);
      b.last = side;
      b.pow = kind === "spike" ? 0.45 : 0;
      ev.push(kind === "spike"
        ? { k: "power", s: side, x: b.x, y: b.y, kind: b.vy > 0 ? "spike" : "loft", r: S.rally }
        : { k: "bump", s: side, x: b.x, y: b.y, dig: p.dive ? 1 : 0, r: S.rally });
      return;
    }
  }

  // 사람 입력(누른 횟수) → 이번 틱 입력
  function readPad(p, ip) {
    if (!ip) return noInput();
    const d = ip.d | 0, h = ip.h | 0, j = ip.j | 0;
    const o = { axis: (ip.k & K_R ? 1 : 0) - (ip.k & K_L ? 1 : 0), jump: j !== p.seenJ, dive: d !== p.seenD, spike: h !== p.seenH };
    p.seenD = d; p.seenH = h; p.seenJ = j;
    return o;
  }
  function syncSeen(p, ip) { if (ip && typeof ip.d === "number") { p.seenD = ip.d | 0; p.seenH = ip.h | 0; p.seenJ = ip.j | 0; } }

  // 한 틱 (1/120초). ctl[i] = { pad } (사람 — 누른 횟수) | { ai: 난이도 } (컴퓨터)
  function step(S, ctl, ev) {
    S.f++;
    S.t += DT;
    const b = S.ball;
    if (S.phase === "wait") { S.t = 0; return; }
    if (S.phase === "count") {
      for (let i = 0; i < 2; i++) syncSeen(S.p[i], ctl[i].pad); // 기다리는 동안 누른 건 버린다
      if (--S.hold <= 0) { S.phase = "serve"; S.t = 0; S.hold = 0; ev.push({ k: "serve", s: S.serve }); }
      return;
    }
    if (S.phase === "point" || S.phase === "end") {
      // 득점 뒤 · 끝 — 공 · 사람 그대로 멈춘다(누른 것도 버린다 — 다음 서브 첫 틱에 저절로 나가지 않게)
      for (let i = 0; i < 2; i++) syncSeen(S.p[i], ctl[i].pad);
      if (b.pow > 0) b.pow -= DT;
      if (S.phase === "point" && --S.hold <= 0) toServe(S, ev); // 180틱(1.5초) 뒤 다음 서브
      return;
    }
    // serve · play
    S.tick++;
    b.rot = S.tick * BALL_SPIN;
    const inp = [0, 1].map((i) => {
      const c = ctl[i];
      if (!c.ai) return readPad(S.p[i], c.pad);
      if (S.aiT[i] <= 0) { S.ai[i] = aiThink(S, i, c.ai); S.aiT[i] = AI_EVERY[c.ai] || AI_EVERY.normal; }
      else { S.aiT[i]--; S.ai[i] = { axis: S.ai[i].axis, jump: false, dive: false, spike: false }; }
      return S.ai[i];
    });
    for (let i = 0; i < 2; i++) movePlayer(S.p[i], i, inp[i], ctl[i].ai ? AI_RUN[ctl[i].ai] || RUN : RUN, ev);
    for (const p of S.p) {
      if (p.swing > 0) p.swing -= DT;
      if (p.land > 0) p.land -= DT;
      if (onGround(p) && Math.abs(p.vx) > 1 && !p.dive) p.run += DT * 13;
    }
    if (S.phase === "serve") {
      const sv = S.p[S.serve];
      S.wait = Math.max(0, S.wait - 1);
      if (Math.hypot(b.x - sv.x, b.y - sv.y) <= PR + BR) {
        S.phase = "play"; S.t = 0;
        b.held = 0;
        b.vx = S.serve ? -SERVE_VX : SERVE_VX;
        b.vy = SERVE_VY;
        b.cd = TOUCH_CD;
        b.last = S.serve;
        S.serves[S.serve]++;
        ev.push({ k: "bump", s: S.serve, x: b.x, y: b.y, serve: 1, r: 0 });
      }
      return;
    }
    b.cd = Math.max(0, b.cd - 1);
    if (b.pow > 0) b.pow -= DT;
    const vx0 = b.vx;
    if (stepBall(b)) ev.push({ k: "net", x: b.x, y: b.y, hard: Math.abs(b.vx) + Math.abs(b.vy) > 500 ? 1 : 0 });
    if (Math.sign(b.vx) !== Math.sign(vx0) && (b.x <= BR + 0.01 || b.x >= W - BR - 0.01)) ev.push({ k: "wall", x: b.x < NET_X ? 0 : W, y: b.y });
    if (!b.cd) contact(S, ev);
    if (b.y >= B_FLOOR) {
      b.y = B_FLOOR;
      const sp = Math.hypot(b.vx, b.vy);
      b.vx = 0; b.vy = 0;
      const scorer = b.x < NET_X ? 1 : 0;
      S.score[scorer]++;
      S.scorer = scorer;
      S.serve = 1 - scorer; // 점수를 내준 쪽이 서브
      S.t = 0;
      S.hold = POINT_TICKS;
      S.p[scorer].mood = 1;
      S.p[1 - scorer].mood = -1;
      ev.push({ k: "point", s: scorer, x: b.x, y: FLOOR, sp: sp | 0, r: S.rally });
      if (S.score[scorer] >= S.target) {
        S.phase = "end"; S.winner = scorer;
        ev.push({ k: "end", s: scorer });
      } else S.phase = "point";
    }
  }

  // ───────── 컴퓨터 — 오른쪽(1) 자리 기준으로 생각한다. 왼쪽 컴퓨터(구경 경기)는 좌우를 뒤집어 같은 계산을 쓴다
  function aiThink(S, side, lv) {
    const m = side === 1 ? (x) => x : (x) => W - x, s = side === 1 ? 1 : -1;
    const b = S.ball, p = S.p[side];
    const v = {
      ball: { x: m(b.x), y: b.y, vx: b.vx * s, vy: b.vy, cd: b.cd },
      me: { x: m(p.x), y: p.y, vx: p.vx * s, vy: p.vy, face: p.face * s, dive: p.dive, cd: p.cd, spk: p.spk },
    };
    const o = aiPick(v, S, side, lv);
    return { axis: o.axis * s, jump: o.jump, dive: o.dive, spike: o.spike };
  }
  function aiPick(v, S, side, lv) {
    const me = v.me, b = v.ball;
    const ground = me.y >= P_Y - 1;
    if (S.phase === "serve" && S.serve === side) {
      // 서브 — 공 밑으로 가서 잠깐(0.7초) 기다렸다 뛰어 친다
      const d = b.x - me.x;
      return { axis: Math.abs(d) > 30 ? Math.sign(d) : 0, jump: S.wait <= 0 && Math.abs(d) <= 30 && ground, dive: false, spike: false };
    }
    if (lv === "hard" && S.phase === "play") return aiPlan(v);
    const wob = lv === "easy" ? 52 : lv === "normal" ? 24 : 8;
    const lead = lv === "easy" ? 0.12 : lv === "normal" ? 0.24 : 0.36;
    const a = clamp(b.x + b.vx * lead + Math.sin(S.tick * 0.014) * wob, 535, 910);
    const to = b.x > 380 ? a : 740;
    const near = Math.abs(b.x - me.x);
    return {
      axis: Math.abs(to - me.x) > 15 ? Math.sign(to - me.x) : 0,
      jump: lv !== "easy" && b.x > NET_X && near < (lv === "hard" ? 108 : 80) && b.y > 190 && b.y < 350 && b.vy > 0 && ground,
      dive: near > 80 && near < 180 && b.y > 385 && b.vy > 0,
      spike: lv !== "easy" && near < 80 && b.y < me.y && me.y < 428,
    };
  }
  // 어려움 — 공이 갈 길을 2초 앞까지 그려 보고, 가만히 · 점프 · 다이빙 중 닿는 것을 고른다 (사람과 같은 계산으로)
  function aiPlan(v) {
    const t = v.me, n = { ...v.ball }, ground = t.y >= P_Y - 0.01;
    const opts = [noInput()];
    if (ground && !t.dive) opts.push({ ...noInput(), jump: true });
    if (ground && !t.dive && !t.cd) opts.push({ ...noInput(), dive: true });
    for (let r = 1; r <= 240; r++) {
      stepBall(n);
      const landing = n.y >= B_FLOOR;
      if (r >= v.ball.cd && n.x >= NET_R && (r <= 8 || r % 4 === 0 || landing)) {
        for (const e of opts) {
          const i = { x: t.x, y: t.y, vx: t.vx, vy: t.vy, face: t.face, dive: t.dive, cd: t.cd, spk: t.spk };
          const a = clamp((n.x - t.x) / ((RUN * r) / HZ), -1, 1);
          for (let k = 0; k < r; k++) movePlayer(i, 1, { axis: a, jump: k === 0 && e.jump, dive: k === 0 && e.dive, spike: false }, RUN, null);
          const reach = (i.dive ? PR_DIVE : PR) + BR;
          if (!(Math.hypot(n.x - i.x, n.y - i.y) > reach - 5)) {
            return { axis: a, jump: e.jump, dive: e.dive, spike: !e.dive && !t.dive && !t.cd && t.y < 428 && r <= 24 && n.y < SPIKE_HIGH };
          }
        }
      }
      if (landing) break;
    }
    return { axis: clamp((740 - t.x) / (2800 / HZ), -1, 1), jump: false, dive: false, spike: false };
  }

  // ───────── 그림 — 배경 · 사람 · 공
  // 선수 모습 셋 — 능력은 모두 같다(모습만 다름). 자리(왼쪽 · 오른쪽)는 발밑 표시 · 점수판 색(TEAM)으로 구별한다
  const LOOKS = [
    { name: "파랑", shirt: "#2f6bff", dark: "#1d4ed8", light: "#7aa3ff", shorts: "#1e293b", hair: "#1f2937", band: "#ffffff", skin: "#ffd6b3", shoe: "#ffffff", sole: "#1e3a8a", lanyard: "#1d4ed8", style: 0 },
    { name: "주황", shirt: "#ff7a3d", dark: "#e85d1c", light: "#ffb48a", shorts: "#3f3f46", hair: "#7a4527", band: "#ffd23f", skin: "#ffdcc2", shoe: "#ffffff", sole: "#9a3412", lanyard: "#c2410c", style: 1 },
    { name: "초록", shirt: "#16a34a", dark: "#15803d", light: "#86efac", shorts: "#334155", hair: "#3f2a1d", band: "#3f2a1d", skin: "#f8cfa8", shoe: "#ffffff", sole: "#166534", lanyard: "#15803d", style: 2 },
  ];
  const okLook = (v) => Number.isInteger(v) && v >= 0 && v < LOOKS.length;
  const TEAM = ["#2f6bff", "#ff7a3d"];

  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  // 늘 같은 도시 — 정해진 씨앗으로
  function seeded(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 배경 그림 좌표 — 예전 800×450 그림을 1.2배로 늘려 세계(960×540)에 맞춘다. 그림 속 바닥 = 세계 바닥(470) ÷ 1.2
  const ART = W / 800, AW = 800, AH = 450, AF = FLOOR / ART;
  // 코트 배경 — 그림만 바꾼다(판 · 물리 · 통신은 그대로, 동료와도 내 화면에만).
  //   sky 하늘 세 색 · sun 지는 해 [x, y, 색, 반지름] · moon · stars 달 · 별 · tint 하늘 앞 풍경 전체에 덮는 색(밤은 어둡게 · 노을은 주황으로) ·
  //   cloud 구름 색 · lights 창문 · 전구 불빛 · snow 쌓인 눈 · 내리는 눈
  const COURTS = {
    day: { name: "한낮" },
    sunset: { name: "노을", sky: ["#3a3f7c", "#e9786a", "#ffc98e"], sun: [606, 232, "#ffd9a0", 34], tint: "rgba(255,118,52,.17)", cloud: "rgba(255,205,188,.85)" },
    night: { name: "야간", sky: ["#060b22", "#14224d", "#2f4176"], moon: true, stars: true, tint: "rgba(8,15,50,.6)", cloud: "rgba(150,166,210,.16)", lights: true },
    snow: { name: "눈 오는 날", sky: ["#8fa2b8", "#bccad8", "#e9eff5"], tint: "rgba(214,226,242,.24)", cloud: "rgba(244,247,250,.8)", snow: true },
  };
  const okCourt = (k) => typeof k === "string" && Object.prototype.hasOwnProperty.call(COURTS, k);
  // 내리는 눈(그림 좌표) — 늘 같은 자리에서 시작해 시각(clock)에 따라 떨어진다
  const FLAKES = (() => { const r = seeded(9311); return Array.from({ length: 80 }, () => ({ x: r() * (AW + 60), y: r() * (AF + 60), sp: 16 + r() * 26, sz: 1.1 + r() * 2.2, ph: r() * 6.3 })); })();
  function paintSky(g, C) {
    C = C || COURTS.day;
    const cols = C.sky || ["#4aa8ec", "#9fd7fb", "#e6f6ff"];
    const sky = g.createLinearGradient(0, -120, 0, AF);
    sky.addColorStop(0, cols[0]);
    sky.addColorStop(0.55, cols[1]);
    sky.addColorStop(1, cols[2]);
    g.fillStyle = sky;
    g.fillRect(-400, -400, AW + 800, AF + 400);
    if (C.stars) {
      const r = seeded(4242);
      for (let i = 0; i < 90; i++) {
        const x = -60 + r() * (AW + 120), y = -90 + r() * (AF - 120), a = 0.35 + r() * 0.6;
        g.fillStyle = `rgba(255,255,240,${a})`;
        g.fillRect(x, y, r() < 0.15 ? 2.2 : 1.3, r() < 0.15 ? 2.2 : 1.3);
      }
    }
    if (C.moon) {
      const glow = g.createRadialGradient(668, 70, 8, 668, 70, 110);
      glow.addColorStop(0, "rgba(235,240,255,.55)");
      glow.addColorStop(1, "rgba(235,240,255,0)");
      g.fillStyle = glow;
      g.fillRect(540, -60, 260, 260);
      g.fillStyle = "#f3f0dc";
      g.beginPath(); g.arc(668, 70, 22, 0, 7); g.fill();
      g.fillStyle = "rgba(190,186,160,.45)";
      g.beginPath(); g.arc(661, 64, 5, 0, 7); g.fill();
      g.beginPath(); g.arc(675, 78, 3.5, 0, 7); g.fill();
      return;
    }
    if (C.sun) {
      const [x, y, col, rad] = C.sun;
      const glow = g.createRadialGradient(x, y, 10, x, y, 190);
      glow.addColorStop(0, "rgba(255,226,170,.9)");
      glow.addColorStop(0.3, "rgba(255,190,130,.45)");
      glow.addColorStop(1, "rgba(255,190,130,0)");
      g.fillStyle = glow;
      g.fillRect(x - 200, y - 200, 400, 400);
      g.fillStyle = col;
      g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill();
      return;
    }
    if (C.snow) return; // 흐린 하늘 — 해가 안 보인다
    // 한낮의 해
    const sun = g.createRadialGradient(668, 64, 10, 668, 64, 130);
    sun.addColorStop(0, "rgba(255,251,225,.95)");
    sun.addColorStop(0.25, "rgba(255,247,205,.55)");
    sun.addColorStop(1, "rgba(255,247,205,0)");
    g.fillStyle = sun;
    g.fillRect(500, -80, 340, 300);
    g.fillStyle = "#fffbe6";
    g.beginPath(); g.arc(668, 64, 26, 0, 7); g.fill();
  }

  function paintScene(g, font, C) {
    C = C || COURTS.day;
    const rnd = seeded(20261104);
    const lrnd = seeded(5150), lit = []; // 야간 — 불 켜진 창(건물 모양은 그대로 두려고 따로 뽑는다)
    // 먼 빌딩 숲
    const far = (y0, color, minH, maxH, winColor) => {
      let x = -20;
      while (x < AW + 20) {
        const w = 34 + rnd() * 58, h = minH + rnd() * (maxH - minH);
        g.fillStyle = color;
        g.fillRect(x, y0 - h, w, h + 2);
        if (rnd() < 0.25) { g.fillRect(x + w * 0.45, y0 - h - 14, 2, 14); } // 안테나
        if (winColor) {
          g.fillStyle = winColor;
          for (let wy = y0 - h + 8; wy < y0 - 8; wy += 11) for (let wx = x + 6; wx < x + w - 8; wx += 10) if (rnd() < 0.82) { g.fillRect(wx, wy, 5, 6); if (C.lights && lrnd() < 0.3) lit.push([wx, wy]); }
        }
        x += w + 2 + rnd() * 10;
      }
    };
    far(AF - 92, "#b7d3ea", 70, 200, null);
    far(AF - 92, "#8fb3d3", 40, 130, "rgba(225,240,252,.55)");
    // 옥상 물탱크 (울타리 뒤)
    g.fillStyle = "#7d8fa3";
    [62, 92, 122].forEach((x) => g.fillRect(x, AF - 128, 5, 92));
    g.fillStyle = "#cfe0ec";
    rr(g, 46, AF - 212, 96, 90, 12); g.fill();
    g.fillStyle = "#b5cad9";
    g.fillRect(46, AF - 184, 96, 5);
    g.fillRect(46, AF - 154, 96, 5);
    g.fillStyle = "#e4eef5";
    rr(g, 52, AF - 220, 84, 14, 7); g.fill();
    g.fillStyle = "#5c7a96";
    g.font = `800 13px ${font}`;
    g.textAlign = "center";
    g.fillText("H2O", 94, AF - 160);
    // 낮은 담 (난간)
    g.fillStyle = "#dcd7ce";
    g.fillRect(0, AF - 40, AW, 40);
    g.fillStyle = "#efebe4";
    g.fillRect(0, AF - 44, AW, 7);
    g.fillStyle = "rgba(120,110,95,.18)";
    for (let x = 96; x < AW; x += 120) g.fillRect(x, AF - 37, 2, 37);
    // 초록 안전 울타리
    const top = AF - 138, bot = AF - 44;
    g.save();
    g.beginPath(); g.rect(0, top, AW, bot - top); g.clip();
    g.strokeStyle = "rgba(46,125,90,.30)";
    g.lineWidth = 1.2;
    for (let x = -120; x < AW + 120; x += 14) {
      g.beginPath(); g.moveTo(x, top); g.lineTo(x + (bot - top), bot); g.stroke();
      g.beginPath(); g.moveTo(x, top); g.lineTo(x - (bot - top), bot); g.stroke();
    }
    g.restore();
    g.fillStyle = "#3e8c66";
    for (let x = 4; x < AW; x += 99) g.fillRect(x, top - 4, 6, bot - top + 4);
    g.fillRect(0, top - 4, AW, 5);
    // 울타리 줄 깃발
    const flags = ["#ff7a3d", "#ffd23f", "#2f6bff", "#22c55e", "#ec4899"];
    for (let x0 = 7; x0 < AW - 20; x0 += 99) {
      const x1 = Math.min(AW - 4, x0 + 99);
      g.strokeStyle = "rgba(60,60,60,.45)";
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(x0, top); g.quadraticCurveTo((x0 + x1) / 2, top + 18, x1, top); g.stroke();
      for (let i = 1; i < 6; i++) {
        const tt = i / 6, fx = lerp(x0, x1, tt), fy = top + 2 * 18 * tt * (1 - tt) * 2 * 0.5 + 0.5;
        g.fillStyle = flags[(i + Math.round(x0 / 99)) % flags.length];
        g.beginPath(); g.moveTo(fx - 6, fy); g.lineTo(fx + 6, fy); g.lineTo(fx, fy + 11); g.closePath(); g.fill();
      }
    }
    // 울타리 표지판
    g.fillStyle = "#ffffff";
    rr(g, 214, AF - 120, 104, 30, 5); g.fill();
    g.strokeStyle = "#3e8c66"; g.lineWidth = 2; g.stroke();
    g.fillStyle = "#2f6d50";
    g.font = `800 12px ${font}`;
    g.fillText("옥상 배구장", 266, AF - 104);
    g.font = `600 9px ${font}`;
    g.fillStyle = "#64748b";
    g.fillText("공은 쓰고 제자리에", 266, AF - 94);
    // 실외기
    const unit = (x, y) => {
      g.fillStyle = "#e7ebef"; rr(g, x, y, 64, 44, 4); g.fill();
      g.strokeStyle = "#b6bec8"; g.lineWidth = 1.5; g.stroke();
      g.fillStyle = "#c9d1da"; g.beginPath(); g.arc(x + 24, y + 22, 15, 0, 7); g.fill();
      g.strokeStyle = "#9aa6b3"; g.lineWidth = 1;
      for (let a = 0; a < 3; a++) { g.beginPath(); g.arc(x + 24, y + 22, 5 + a * 4.5, 0, 7); g.stroke(); }
      g.fillStyle = "#b6bec8"; for (let i = 0; i < 4; i++) g.fillRect(x + 46, y + 9 + i * 7, 12, 3);
    };
    unit(722, AF - 46);
    unit(652, AF - 40);
    // 화분
    const pot = (x, s) => {
      g.fillStyle = "#2f8f5b";
      for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(x + (i - 2) * 6 * s, AF - 32 * s - Math.abs(i - 2) * -3 * s, 7 * s, 16 * s, (i - 2) * 0.38, 0, 7); g.fill(); }
      g.fillStyle = "#48b77a";
      for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(x + (i - 1) * 7 * s, AF - 36 * s, 5 * s, 12 * s, (i - 1) * 0.5, 0, 7); g.fill(); }
      g.fillStyle = "#c2703d"; rr(g, x - 13 * s, AF - 22 * s, 26 * s, 22 * s, 4 * s); g.fill();
      g.fillStyle = "#a95d2f"; g.fillRect(x - 14 * s, AF - 22 * s, 28 * s, 5 * s);
    };
    pot(24, 1);
    pot(590, 0.8);
    // 코트 바닥 (우레탄)
    g.fillStyle = "#4bae78";
    g.fillRect(-400, AF, AW + 800, 16);
    g.fillStyle = "#7fd3a3";
    g.fillRect(-400, AF, AW + 800, 2);
    g.fillStyle = "rgba(255,255,255,.9)";
    g.fillRect(14, AF + 7, AW - 28, 2.5);
    g.fillStyle = "#2f855a";
    g.fillRect(-400, AF + 16, AW + 800, AH - AF + 200);
    g.fillStyle = "rgba(0,0,0,.08)";
    for (let x = 0; x < AW; x += 40) g.fillRect(x, AF + 16, 20, AH - AF);
    g.fillStyle = "rgba(0,0,0,.12)";
    g.fillRect(-400, AF + 16, AW + 800, 3);
    paintCourtMood(g, C, lit, top);
  }
  // 코트 배경 덧칠 — 풍경 전체에 색을 덮고(그려진 곳만), 야간 불빛 · 쌓인 눈을 얹는다
  function paintCourtMood(g, C, lit, top) {
    if (C.tint) {
      g.save();
      g.globalCompositeOperation = "source-atop";
      g.fillStyle = C.tint;
      g.fillRect(-400, -400, AW + 800, AH + 800);
      g.restore();
    }
    if (C.lights) {
      g.fillStyle = "rgba(255,212,120,.88)";
      lit.forEach(([x, y]) => g.fillRect(x, y, 5, 6));
      // 울타리 줄 전구 · 코트를 비추는 불빛
      g.save();
      g.globalCompositeOperation = "lighter";
      const pool = g.createRadialGradient(AW / 2, AF, 20, AW / 2, AF, 420);
      pool.addColorStop(0, "rgba(255,214,150,.22)");
      pool.addColorStop(1, "rgba(255,214,150,0)");
      g.fillStyle = pool;
      g.fillRect(-400, AF - 420, AW + 800, 560);
      for (let x0 = 7; x0 < AW - 20; x0 += 99) {
        const x1 = Math.min(AW - 4, x0 + 99);
        for (let i = 1; i < 6; i++) {
          const tt = i / 6, fx = lerp(x0, x1, tt), fy = top + 18 * tt * (1 - tt) * 2 + 1;
          const b = g.createRadialGradient(fx, fy, 0, fx, fy, 9);
          b.addColorStop(0, "rgba(255,236,170,.95)");
          b.addColorStop(1, "rgba(255,236,170,0)");
          g.fillStyle = b;
          g.fillRect(fx - 9, fy - 9, 18, 18);
        }
      }
      g.restore();
    }
    if (C.snow) {
      g.fillStyle = "#f7fafd";
      const cap = (x, y, w, h) => { rr(g, x, y, w, h, h / 2); g.fill(); };
      cap(-4, AF - 49, AW + 8, 7); // 난간 위
      cap(-4, top - 8, AW + 8, 5); // 울타리 위
      cap(48, AF - 227, 92, 10); // 물탱크 위
      cap(650, AF - 45, 68, 6); cap(720, AF - 51, 68, 6); // 실외기 위
      // 난간 밑에 쌓인 눈
      for (let x = -10; x < AW + 20; x += 26) { g.beginPath(); g.ellipse(x, AF - 1, 18, 5 + ((x * 7) % 5), 0, Math.PI, 0); g.fill(); }
    }
  }

  function drawNet(g, wob) {
    // 그물 — 공이 부딪히는 기둥(폭 12 · 꼭대기 278 ~ 바닥)을 그대로 그린다
    g.fillStyle = "#475569";
    rr(g, NET_X - 16, FLOOR - 8, 32, 10, 3); g.fill();
    const sx = Math.sin(wob * 40) * wob * 3;
    g.save();
    g.translate(sx, 0);
    const pole = g.createLinearGradient(NET_L, 0, NET_R, 0);
    pole.addColorStop(0, "#94a3b8"); pole.addColorStop(0.5, "#f1f5f9"); pole.addColorStop(1, "#64748b");
    g.fillStyle = pole;
    g.fillRect(NET_L, NET_TOP, NET_R - NET_L, FLOOR - NET_TOP);
    // 그물 눈
    g.strokeStyle = "rgba(15,23,42,.45)";
    g.lineWidth = 1.2;
    for (let y = NET_TOP + 12; y < FLOOR - 4; y += 12) { g.beginPath(); g.moveTo(NET_L, y); g.lineTo(NET_R, y); g.stroke(); }
    g.beginPath(); g.moveTo(NET_X, NET_TOP + 6); g.lineTo(NET_X, FLOOR - 6); g.stroke();
    // 꼭대기 흰 띠
    g.fillStyle = "#ffffff";
    rr(g, NET_L - 1, NET_TOP - 2, NET_R - NET_L + 2, 8, 3); g.fill();
    g.strokeStyle = "rgba(15,23,42,.35)"; g.lineWidth = 1; g.stroke();
    g.restore();
  }

  function drawBallShape(g, x, y, rot, sx, sy) {
    g.save();
    g.translate(x, y);
    if (sx !== 1 || sy !== 1) g.scale(sx, sy);
    g.beginPath(); g.arc(0, 0, BR, 0, 7);
    g.fillStyle = "#ffffff"; g.fill();
    g.save();
    g.clip();
    g.rotate(rot);
    // 배구공 무늬 — 가운데에서 세 갈래로 휘어 나가는 띠 (노랑 · 파랑 · 하양)
    const cols = ["#ffd23f", "#2f6bff", "#ffffff"];
    for (let i = 0; i < 3; i++) {
      g.save();
      g.rotate((i * Math.PI * 2) / 3);
      g.strokeStyle = cols[i];
      g.lineWidth = BR * 0.38;
      g.beginPath(); g.arc(BR * 0.95, -BR * 0.95, BR * 0.95, Math.PI * 0.5, Math.PI); g.stroke();
      g.strokeStyle = "rgba(30,41,59,.5)";
      g.lineWidth = 1;
      g.beginPath(); g.arc(BR * 0.95, -BR * 0.95, BR * 0.76, Math.PI * 0.5, Math.PI); g.stroke();
      g.beginPath(); g.arc(BR * 0.95, -BR * 0.95, BR * 1.14, Math.PI * 0.5, Math.PI); g.stroke();
      g.restore();
    }
    g.restore();
    const sh = g.createRadialGradient(-6, -7, 2, 0, 0, BR);
    sh.addColorStop(0, "rgba(255,255,255,.6)");
    sh.addColorStop(0.55, "rgba(255,255,255,0)");
    sh.addColorStop(1, "rgba(15,23,42,.3)");
    g.fillStyle = sh;
    g.beginPath(); g.arc(0, 0, BR, 0, 7); g.fill();
    g.strokeStyle = "#1e293b";
    g.lineWidth = 1.6;
    g.stroke();
    g.restore();
  }

  // 사람 한 명 — 오른쪽을 본다고 치고 그린다 (발 = 원점, 위 = -y)
  function drawFigure(g, p, L, time, lying, look) {
    const air = !onGround(p) && !lying;
    const runA = onGround(p) && !lying && Math.abs(p.vx) > 5 ? Math.sin(p.run) : 0;
    const line = (x1, y1, x2, y2) => { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
    g.lineCap = "round";
    // 다리 · 신발
    let bx = -8, by = -3, fx = 9, fy = -3;
    if (air) { bx = -9; by = -9; fx = 10; fy = -5; }
    else if (runA) { bx = -8 - runA * 6; by = -3 - Math.max(0, runA) * 5; fx = 9 + runA * 6; fy = -3 - Math.max(0, -runA) * 5; }
    g.strokeStyle = L.skin; g.lineWidth = 6;
    line(-6, -14, bx, by); line(6, -14, fx, fy);
    const shoe = (x, y) => { g.fillStyle = L.shoe; rr(g, x - 7, y - 4, 16, 8, 4); g.fill(); g.fillStyle = L.sole; g.fillRect(x - 7, y + 2.2, 16, 2.4); };
    shoe(bx, by); shoe(fx, fy);
    // 반바지
    g.fillStyle = L.shorts;
    rr(g, -16, -25, 32, 14, 6); g.fill();
    // 팔 그리기
    const arm = (sx, sy, ang, len, color) => {
      const hx = sx + Math.cos(ang) * len, hy = sy + Math.sin(ang) * len;
      g.strokeStyle = L.skin; g.lineWidth = 6.5;
      line(sx, sy, hx, hy);
      g.fillStyle = L.skin; g.beginPath(); g.arc(hx, hy, 4.3, 0, 7); g.fill();
      g.fillStyle = color || L.shirt; g.beginPath(); g.arc(sx, sy, 6, 0, 7); g.fill();
      return [hx, hy];
    };
    // 자세별 팔 각도 (0 = 앞, π/2 = 아래)
    const sw = p.swing > 0 ? 1 - p.swing / SWING_T : -1;
    let back = 1.85 - runA * 0.6, front = 1.3 + runA * 0.6, flen = 17, blen = 16;
    if (lying) { back = -1.6; front = -1.72; flen = 56; blen = 46; }
    else if (p.mood > 0) { back = -1.95; front = -1.25; }
    else if (p.mood < 0) { back = 1.65; front = 1.5; }
    else if (sw >= 0) { const e = 1 - Math.pow(1 - sw, 3); front = lerp(-2.15, 0.95, e); back = -2.5; flen = 20; }
    else if (look.bump > 0) { front = 0.6; back = 0.75; flen = 19; blen = 18; }
    else if (air) { front = -0.55 - Math.min(0.6, -p.vy / 1200); back = -2.5; }
    arm(-7, -39, back, blen, L.dark);
    // 몸통
    g.fillStyle = L.shirt;
    g.beginPath(); g.ellipse(0, -33, 20, 17, 0, 0, 7); g.fill();
    g.save();
    g.beginPath(); g.ellipse(0, -33, 20, 17, 0, 0, 7); g.clip();
    g.fillStyle = L.dark; g.globalAlpha = 0.35;
    g.beginPath(); g.ellipse(-14, -30, 10, 18, 0, 0, 7); g.fill();
    g.globalAlpha = 1;
    g.fillStyle = L.light; g.fillRect(-20, -22, 40, 3); // 아랫단 줄
    g.restore();
    // 사원증 목걸이
    g.strokeStyle = L.lanyard; g.lineWidth = 1.6;
    line(0, -47, 6, -33); line(12, -46, 8, -33);
    g.fillStyle = "#ffffff"; rr(g, 3, -34, 10, 12, 2); g.fill();
    g.fillStyle = L.dark; g.fillRect(3, -34, 10, 3);
    g.fillStyle = "#cbd5e1"; g.fillRect(5, -28, 6, 1.5); g.fillRect(5, -25.5, 4, 1.5);
    // 머리 — 뒤 머리끈 · 머리 · 머리카락 · 머리띠
    const hx = 3, hy = -63, hr = 19;
    if (L.style === 1) { g.fillStyle = L.hair; g.beginPath(); g.arc(-13, -79, 8.5, 0, 7); g.fill(); g.fillStyle = L.band; g.fillRect(-9, -76, 4, 6); }
    g.fillStyle = L.skin;
    g.beginPath(); g.arc(hx, hy, hr, 0, 7); g.fill();
    g.save();
    g.beginPath(); g.arc(hx, hy, hr + 0.5, 0, 7); g.clip();
    g.fillStyle = L.hair;
    g.fillRect(hx - hr - 2, hy - hr - 2, hr * 2 + 4, 13);
    g.fillRect(hx - hr - 2, hy - hr, 11, hr + 6); // 뒷머리
    g.beginPath(); g.moveTo(hx + 4, hy - 9); g.lineTo(hx + 22, hy - 11); g.lineTo(hx + 22, hy - 20); g.lineTo(hx - 2, hy - 20); g.closePath(); g.fill(); // 앞머리
    if (L.style === 2) {
      // 가르마 머리 — 머리띠 대신 옆으로 넘긴 앞머리
      g.beginPath(); g.moveTo(hx - hr, hy - 8); g.quadraticCurveTo(hx - 4, hy - hr - 8, hx + hr + 2, hy - 6); g.lineTo(hx + hr + 2, hy - hr - 2); g.lineTo(hx - hr - 2, hy - hr - 2); g.closePath(); g.fill();
    } else {
      g.fillStyle = L.band;
      g.beginPath(); g.moveTo(hx - hr - 2, hy - 13); g.lineTo(hx + hr + 2, hy - 15); g.lineTo(hx + hr + 2, hy - 9); g.lineTo(hx - hr - 2, hy - 7); g.closePath(); g.fill();
    }
    g.restore();
    // 머리띠 끈 (뒤로 날림)
    const flap = Math.sin(time * 9 + p.side) * 2 + (Math.abs(p.vx) > 5 ? 3 : 0);
    if (L.style !== 2) {
      g.fillStyle = L.band;
      g.beginPath(); g.moveTo(hx - hr + 1, hy - 11); g.lineTo(hx - hr - 11, hy - 15 - flap); g.lineTo(hx - hr - 9, hy - 8 - flap * 0.5); g.closePath(); g.fill();
    }
    if (L.style === 0) { // 삐친 머리
      g.strokeStyle = L.hair; g.lineWidth = 3;
      g.beginPath(); g.moveTo(hx - 2, hy - hr + 1); g.quadraticCurveTo(hx + 1, hy - hr - 9, hx + 8, hy - hr - 6); g.stroke();
    }
    // 얼굴
    const ex1 = hx + 6, ex2 = hx + 14, ey = hy + 1;
    g.fillStyle = "rgba(255,110,110,.42)";
    g.beginPath(); g.ellipse(hx + 16, hy + 8, 3.8, 2.4, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(hx + 1, hy + 8, 3.2, 2.2, 0, 0, 7); g.fill();
    g.strokeStyle = "#1f2937"; g.fillStyle = "#1f2937"; g.lineWidth = 2;
    const blink = (time + p.side * 1.7) % 3.4 < 0.12;
    if (p.mood > 0) {
      [ex1, ex2].forEach((ex) => { g.beginPath(); g.arc(ex, ey + 1.5, 2.8, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); });
    } else if (p.mood < 0 || lying) {
      [ex1, ex2].forEach((ex, i) => line(ex - 2.6, ey + (i ? -0.8 : 0.8), ex + 2.6, ey + (i ? 0.8 : -0.8)));
    } else if (blink) {
      [ex1, ex2].forEach((ex) => line(ex - 2.4, ey, ex + 2.4, ey));
    } else {
      [ex1, ex2].forEach((ex) => {
        g.fillStyle = "#1f2937"; g.beginPath(); g.ellipse(ex, ey, 2.3, 3.1, 0, 0, 7); g.fill();
        g.fillStyle = "#ffffff"; g.beginPath(); g.arc(ex + 0.8, ey - 1.1, 0.9, 0, 7); g.fill();
      });
    }
    if (L.style === 2) {
      // 동그란 안경
      g.strokeStyle = "#1f2937"; g.lineWidth = 1.5;
      [ex1, ex2].forEach((ex) => { g.beginPath(); g.arc(ex, ey, 4.6, 0, 7); g.stroke(); });
      line(ex1 + 4.6, ey - 0.5, ex2 - 4.6, ey - 0.5);
      line(ex1 - 4.6, ey - 0.5, hx - 8, ey - 2.5);
    }
    // 입
    g.strokeStyle = "#7f1d1d"; g.lineWidth = 1.6;
    if (p.mood > 0 || sw >= 0 || lying) {
      g.fillStyle = "#9f1239";
      g.beginPath(); g.ellipse(hx + 11, hy + 9, 3, sw >= 0 || lying ? 3.2 : 2.4, 0, 0, Math.PI * 2); g.fill();
    } else if (p.mood < 0) {
      g.beginPath(); g.arc(hx + 11, hy + 12, 3, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
    } else {
      g.beginPath(); g.arc(hx + 11, hy + 7, 3, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
    }
    // 앞팔 + 휘두르는 자국 · 강타 준비 중이면 손이 빛난다
    const [ahx, ahy] = arm(8, -39, front, flen);
    if (p.spk > 0) {
      const gl = g.createRadialGradient(ahx, ahy, 1, ahx, ahy, 17);
      gl.addColorStop(0, "rgba(255,240,150,.95)"); gl.addColorStop(1, "rgba(255,196,64,0)");
      g.fillStyle = gl; g.beginPath(); g.arc(ahx, ahy, 17, 0, 7); g.fill();
    }
    if (sw >= 0 && sw < 0.75) {
      const e = 1 - Math.pow(1 - sw, 3), a1 = lerp(-2.15, 0.95, e);
      g.strokeStyle = p.spk > 0 ? "rgba(255,214,64,.9)" : "rgba(255,255,255,.8)";
      g.lineWidth = 5;
      g.beginPath(); g.arc(8, -39, 28, Math.max(-2.15, a1 - 1.3), a1); g.stroke();
    }
    return [ahx, ahy];
  }

  // ───────── 엔진
  function create(canvas, opts) {
    opts = opts || {};
    const mode = ["cpu", "local", "host", "guest", "demo"].includes(opts.mode) ? opts.mode : "cpu";
    const online = mode === "host" || mode === "guest";
    const level = AI_EVERY[opts.level] ? opts.level : "normal";
    const target0 = Math.max(1, Math.min(99, Number(opts.target) || 7));
    const mySide = mode === "guest" ? 1 : 0;
    const touchUI = !!opts.touch;
    const best0 = Math.max(0, Number(opts.best) || 0);
    const sfx = mode === "demo" ? () => {} : opts.sfx || ((n, a) => window.HKSound && window.HKSound.play(n, a));
    const emit = (e) => { try { if (opts.onEvent) opts.onEvent(e); } catch (_) { /* 페이지 쪽 오류는 무시 */ } };
    const net = online ? opts.net : null;
    const FONT = (() => {
      try { return getComputedStyle(document.body).fontFamily || "sans-serif"; } catch (_) { return "sans-serif"; }
    })();

    // 이름표 — 왼쪽 · 오른쪽 사람
    const who = [{}, {}];
    who[mySide] = { name: (opts.me && opts.me.name) || "나", avatarUrl: opts.me && opts.me.avatarUrl };
    who[1 - mySide] = { name: (opts.rival && opts.rival.name) || (mode === "cpu" ? "컴퓨터" : "상대"), avatarUrl: opts.rival && opts.rival.avatarUrl };
    who.forEach((w) => {
      if (!w.avatarUrl) return;
      const im = new Image();
      im.referrerPolicy = "no-referrer";
      im.onload = () => { w.img = im; };
      im.src = w.avatarUrl;
    });
    const human = [mode !== "demo", mode === "local" || online];
    // 누가 조작하나 — 사람(누른 횟수) 또는 컴퓨터(난이도)
    const ctlAI = [mode === "demo" ? "hard" : null, mode === "cpu" ? level : mode === "demo" ? "normal" : null];

    // 상태 — guest 는 받은 상태를 여기에 풀어 놓고 그린다. 첫 서브는 왼쪽(나 · 1P · 주인)
    const firstServe = opts.firstServe === 0 || opts.firstServe === 1 ? opts.firstServe : mode === "demo" ? (Math.random() < 0.5 ? 0 : 1) : 0;
    let S = newState(target0, firstServe, online ? "wait" : "serve");
    // 새로고침한 주인 — 받아 둔 점수 · 서브 · 목표부터 (값이 이상하면 처음부터)
    const rs = mode === "host" && opts.resume && typeof opts.resume === "object" ? opts.resume : null;
    const okInt = (v, hi) => Number.isInteger(v) && v >= 0 && v <= hi;
    const pair = (a, hi) => Array.isArray(a) && a.length === 2 && okInt(a[0], hi) && okInt(a[1], hi);
    if (rs && (rs.tg === 7 || rs.tg === 15) && pair(rs.sc, rs.tg - 1) && (rs.sv === 0 || rs.sv === 1) && pair(rs.sp, 9999) && pair(rs.ss, 9999) && okInt(rs.be, 9999) && rs.sec >= 0 && rs.sec < 7200) {
      S = newState(rs.tg, rs.sv, "wait");
      S.score = rs.sc.slice(); S.spikes = rs.sp.slice(); S.serves = rs.ss.slice(); S.best = rs.be;
      S.f = Math.round(rs.sec / DT);
    }
    // 선수 모습 — 혼자 · 둘이 · 구경: opts.looks [왼쪽, 오른쪽]. 온라인: opts.look 은 내 모습(상대 모습은 상대가 알려 준다)
    let myLook = okLook(opts.look) ? opts.look : mySide;
    if (online) S.looks[mySide] = myLook;
    else if (Array.isArray(opts.looks) && okLook(opts.looks[0]) && okLook(opts.looks[1])) S.looks = opts.looks.slice();
    let court = COURTS[okCourt(opts.court) ? opts.court : "day"]; // 코트 배경 — 내 화면에만
    let fps = opts.fps === 30 ? 30 : 60, lastDraw = 0; // 화면 표시 — 가볍게(30fps)면 두 화면에 한 번만 그린다(계산은 그대로 120Hz)

    // 그리기 상태
    const g = canvas.getContext("2d");
    let cssW = 0, cssH = 0, dpr = 1, scale = 1, ox = 0, oy = 0;
    let bgSky = null, bgScene = null;
    let raf = 0, lastTs = 0, acc = 0, started = false, paused = false, destroyed = false, ended = false;
    let restartAt = false; // 혼자 · 둘이: 득점 안내가 끝나 다음 서브로 — 이 화면의 남은 계산을 버리고 다음 화면은 기준 시각만 잡는다
    let hitStop = 0, shake = 0, shakeMag = 0, netWob = 0, clock = 0, alpha = 1;
    const prevP = [{ x: 0, y: 0 }, { x: 0, y: 0 }], prevB = { x: 0, y: 0, rot: 0 };
    const looks = [{ bump: 0 }, { bump: 0 }];
    let ballSq = 0;
    const trail = [];
    const parts = [];
    const texts = [];
    let banner = null; // { text, color, t }
    let rallyShown = 0;
    const evq = [];

    // ───── 입력 — 키보드 칸(slot)마다 누른 키 · 누른 횟수
    // 혼자 · 온라인: ← → / A D 이동 · ↑ / W / Space 점프 · ↓ / S 다이빙 · Z / X 강타
    const KEYS_SOLO = { left: ["ArrowLeft", "KeyA"], right: ["ArrowRight", "KeyD"], jump: ["ArrowUp", "KeyW", "Space"], dive: ["ArrowDown", "KeyS"], spike: ["KeyZ", "KeyX"] };
    // 둘이 한 화면: 1P 는 왼손(A D · W/Space · S · Z/X), 2P 는 오른손(방향키 · Enter 등)
    const KEYS_1P = { left: ["KeyA"], right: ["KeyD"], jump: ["KeyW", "Space"], dive: ["KeyS"], spike: ["KeyZ", "KeyX"] };
    const KEYS_2P = { left: ["ArrowLeft"], right: ["ArrowRight"], jump: ["ArrowUp"], dive: ["ArrowDown"], spike: ["Enter", "NumpadEnter", "Slash", "Period", "ShiftRight", "Numpad0"] };
    const keymaps = mode === "demo" ? [] : mode === "local" ? [[0, KEYS_1P], [1, KEYS_2P]] : [[mySide, KEYS_SOLO]];
    const pads = [0, 1].map(() => ({ codes: new Set(), d: 0, h: 0, j: 0, t: { left: 0, right: 0 } }));
    const padOut = [{ k: 0, d: 0, h: 0, j: 0 }, { k: 0, d: 0, h: 0, j: 0 }];
    function padBits(slot) {
      const pd = pads[slot], map = keymaps.find((m) => m[0] === slot);
      const has = (act) => !!(map && map[1][act].some((c) => pd.codes.has(c)));
      let k = 0;
      if (has("left") || pd.t.left) k |= K_L;
      if (has("right") || pd.t.right) k |= K_R;
      const o = padOut[slot];
      o.k = k; o.d = pd.d; o.h = pd.h; o.j = pd.j;
      return o;
    }
    function clearPads() {
      pads.forEach((pd) => { pd.codes.clear(); Object.keys(pd.t).forEach((k) => (pd.t[k] = 0)); });
      inputChanged();
    }
    // 조작이 먹는 때 — 서브 · 랠리 중이고 멈추지 않았을 때만 (레퍼런스: 멈춤 · 득점 안내 · 준비 · 세기 중 누른 것은 버린다)
    let gPh = 0, gPz = 0; // guest: 마지막으로 받은 단계 · 일시정지
    function live() {
      if (!started || paused || ended) return false;
      if (mode === "guest") return (gPh === 2 || gPh === 3) && !gPz && gHold !== "pause" && gHold !== "resume";
      if (S.pz || (mode === "host" && holdWhy === "resume")) return false;
      return S.phase === "serve" || S.phase === "play";
    }
    // 키는 처음 누를 때만 잡는다 — 자동 반복(e.repeat)은 버린다. 그래서 득점 · 멈춤으로 풀린 키는 떼고 다시 눌러야 먹는다(레퍼런스와 같음)
    function onKey(e, down) {
      if (destroyed || !started) return;
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.altKey || e.metaKey || e.ctrlKey) return;
      const fresh = down && !e.repeat && live();
      let used = false;
      for (const [slot, map] of keymaps) {
        for (const act in map) {
          if (!map[act].includes(e.code)) continue;
          used = true;
          const pd = pads[slot];
          if (!down) { pd.codes.delete(e.code); continue; }
          if (!fresh || pd.codes.has(e.code)) continue;
          pd.codes.add(e.code);
          // 점프 · 다이빙 · 강타는 누를 때 한 번 (누르고 있어도 다시 나가지 않는다)
          if (act === "dive") pd.d++; else if (act === "spike") pd.h++; else if (act === "jump") pd.j++;
        }
      }
      if (!used) return;
      e.preventDefault();
      inputChanged();
    }
    const kd = (e) => onKey(e, true), ku = (e) => onKey(e, false);
    const blur = () => clearPads();
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("blur", blur);

    // 화면 버튼 — left · right 는 누르는 동안, jump · dive · spike 는 누를 때 한 번 (누르기는 조작이 먹는 때만, 떼기는 언제나)
    function control(name, down) {
      if (destroyed) return;
      const pd = pads[mySide];
      down = down && live() ? 1 : 0;
      if (name === "hit") name = "spike";
      if (name === "jump" || name === "dive" || name === "spike") {
        if (down) { if (name === "dive") pd.d++; else if (name === "spike") pd.h++; else pd.j++; }
      } else if (name === "left" || name === "right") pd.t[name] = down;
      inputChanged();
    }
    // 단계가 바뀜 — 누르던 조작을 모두 푼다. 혼자 · 둘이: 득점 · 다음 서브 때(서브 → 랠리는 그대로).
    // 온라인: 단계 · 일시정지가 바뀔 때마다(레퍼런스 친구 대전과 같음). drop: 페이지가 잡고 있던 터치도 놓는다(다시 대야 먹는다)
    function flowChanged(prev, next) {
      const serveHit = prev === "serve" && next === "play";
      if (serveHit && !online) return;
      clearPads();
      emit({ type: "inputreset", drop: !serveHit });
    }

    // ───── 온라인
    let remote = { k: 0, d: 0, h: 0, j: 0 }; // host: guest 의 입력
    let gotGo = false, lastHi = 0, lastIn = 0, lastSent = "", lastPing = 0, rtt = -1, lastHeard = 0;
    const epoch = 1 + Math.floor(Math.random() * 2e9); // host: 이번 판 번호 — 주인이 새로고침하면 바뀐다
    let gEpoch = 0; // guest: 지금 맞춰 그리는 주인 판 번호
    let link = "ok"; // 페이지가 알려 준 연결 상태 (ok · away · retry)
    let guestIn = 0, guestAway = false, selfHidden = false; // host: 손님 입력을 받은 때 · 손님이 화면을 숨김 · 내 화면이 숨겨짐
    let holdWhy = "", resumeAt = 0, lastHoldSent = 0; // host: 지금 멈춘 까닭 · 이 시각까지 쉬고 이어 감
    let holdSince = 0, hiddenAt = 0; // host: 이번 멈춤이 시작된 때 · 내 화면이 숨겨진 때 (길어지면 일시정지로)
    let gHold = "", gHoldN = 0, gHoldRd = null, gHoldPz = 0, gHoldPb, gHoldPw = ""; // guest: 주인이 알려 준 멈춤 까닭 · 이어 가기까지 남은 초 · 준비 · 일시정지
    // guest: 받은 단계 · 일시정지가 바뀌면 누르던 조작을 푼다 (레퍼런스 친구 대전 — 새 상태를 받을 때 단계가 바뀌었으면 입력을 비운다)
    function guestFlow(ph, pz) {
      const changed = gPh !== ph || gPz !== pz;
      const prev = gPz ? "pause" : PH[gPh], next = pz ? "pause" : PH[ph];
      gPh = ph; gPz = pz;
      if (changed && started) flowChanged(prev, next);
    }
    const snaps = []; // guest: 받은 상태
    const gev = []; // guest: 아직 안 보여 준 사건
    let gf = -1; // guest: 지금 그리는 틱 (소수)
    let outEv = []; // host: 다음 상태에 실어 보낼 사건
    const SNAP_KEEP = 180, GEV_KEEP = 300, SLOW_MS = 800;
    function send(m) { try { if (net) net.send(m); } catch (_) { /* 연결이 끊겼으면 페이지가 알린다 */ } }
    function inputChanged() {
      if (mode !== "guest" || !started) return;
      const o = padBits(mySide);
      const sig = `${o.k}.${o.d}.${o.h}.${o.j}`;
      if (sig !== lastSent) { lastSent = sig; lastIn = performance.now(); send({ t: "in", k: o.k, d: o.d, h: o.h, j: o.j }); }
    }
    function packState() {
      const b = S.ball;
      const m = {
        t: "s", e: epoch, f: S.f, ph: PH.indexOf(S.phase), pt: r2(S.t), sc: S.score.slice(), sv: S.serve, ry: S.rally, be: S.best,
        sp: S.spikes.slice(), w: S.winner, sr: S.scorer, tg: S.target, ss: S.serves.slice(), rd: S.ready.slice(), pz: S.pz, pb: S.pzBy, pw: S.pzWhy, lk: S.looks.slice(),
        b: [r1(b.x), r1(b.y), r1(b.vx), r1(b.vy), r2(b.rot), b.held, r2(b.pow)],
        p: S.p.map((p) => [r1(p.x), r1(p.y), r1(p.vx), r1(p.vy), p.face, p.dive, p.cd, p.spk, r2(p.swing), r2(p.land), p.mood, r2(p.run)]),
        ev: outEv,
      };
      outEv = [];
      return m;
    }
    function unpack(m, into) {
      into.f = m.f; into.phase = PH[m.ph] || "play"; into.t = m.pt; into.score = m.sc; into.serve = m.sv; into.rally = m.ry;
      into.best = m.be; into.spikes = m.sp; into.winner = m.w; into.scorer = m.sr; into.target = m.tg; into.serves = m.ss || [0, 0];
      if (Array.isArray(m.rd)) into.ready = m.rd;
      if (Array.isArray(m.lk) && okLook(m.lk[0]) && okLook(m.lk[1])) into.looks = m.lk;
      into.pz = m.pz | 0;
      into.pzBy = m.pb;
      into.pzWhy = m.pw || "";
      const b = into.ball;
      [b.x, b.y, b.vx, b.vy, b.rot, b.held, b.pow] = m.b;
      m.p.forEach((a, i) => {
        const p = into.p[i];
        [p.x, p.y, p.vx, p.vy, p.face, p.dive, p.cd, p.spk, p.swing, p.land, p.mood, p.run] = a;
      });
    }
    // host: 손님이 (다시) 들어옴 — 누른 횟수를 맞춘다 (새로고침한 손님은 0부터 다시 센다 → 저절로 뛰거나 치지 않게)
    function syncRemote(m) {
      remote = { k: 0, d: m.d | 0, h: m.h | 0, j: m.j | 0 };
      const p = S.p[1];
      p.seenD = remote.d; p.seenH = remote.h; p.seenJ = remote.j;
    }
    // guest: 주인이 새로 시작했다(새로고침 등) — 받아 둔 것을 비우고 처음부터 맞춘다
    function guestReset(e) {
      gEpoch = e;
      myUn = 0; // 새 주인 판은 준비 풀기 번호를 0부터 다시 센다
      snaps.length = 0; gev.length = 0; gf = -1; gHold = ""; gotGo = false;
      rallyShown = 0; banner = null;
    }
    // host: 경기 전 설정(목표 점수 · 선수)을 바꿈 — 두 사람 준비를 풀고 알린다 (손님은 「준비됨」을 다시 보내지 않게 자기 준비도 푼다)
    function unready(change) {
      change();
      S.ready = [0, 0];
      unGen++;
      send({ t: "unrd", e: epoch, u: unGen });
      send(packState());
    }
    // host: 준비 — 경기 전이면 3초 세고 시작, 일시정지 중이면 3초 뒤 이어 감
    const guestHere = (now) => link === "ok" && now - guestIn < SLOW_MS * 2 && !guestAway;
    function checkReady() {
      if (mode !== "host" || !S.ready[0] || !S.ready[1]) return;
      const now = performance.now();
      if (!guestHere(now)) return;
      if (S.phase === "wait") {
        S.ready = [0, 0];
        S.phase = "count"; S.t = 0; S.hold = COUNT_TICKS;
        handleEv({ k: "ready" }); outEv.push({ k: "ready", f: S.f });
        flowChanged("wait", "count");
        send(packState());
      } else if (S.pz) {
        S.pz = 0; S.ready = [0, 0];
        resumeAt = now + 3000;
        flowChanged("pause", S.phase);
      }
    }
    // 일시정지 — why: "pause"(직접 누름) · "away"(다른 화면) · "slow"(조작 신호가 늦음) · "link"(연결 끊김). 두 사람 모두 계속 준비해야 이어 간다
    function pauseBy(side, why) {
      if (mode !== "host" || S.pz || ended || !["serve", "play", "point"].includes(S.phase)) return;
      S.pz = 1; S.pzBy = side; S.pzWhy = why || "pause"; S.ready = [0, 0];
      resumeAt = 0; holdSince = 0;
      outEv.push({ k: "pz", s: side, w: S.pzWhy, f: S.f });
      handleEv({ k: "pz", s: side });
      flowChanged(S.phase, "pause");
    }
    if (net && typeof net.onMessage === "function") {
      net.onMessage((m) => {
        if (destroyed || !m || typeof m !== "object") return;
        const now = performance.now();
        lastHeard = now;
        if (mode === "host") {
          if (m.t === "hi") {
            guestIn = now; guestAway = false;
            syncRemote(m);
            if (S.phase === "wait" && okLook(m.c)) S.looks[1] = m.c; // 손님이 고른 선수 (경기 전에만 바뀐다)
            if (S.phase === "wait" || S.pz) { S.ready[1] = m.rd && (m.u | 0) >= unGen ? 1 : 0; checkReady(); }
            send({ t: "go", e: epoch });
          } else if (m.t === "ch") {
            // 손님이 선수를 바꿈 — 경기 전에만. 바꾸면 두 사람 준비가 풀린다 (레퍼런스 친구 대전과 같음)
            guestIn = now;
            if (S.phase === "wait" && okLook(m.c) && m.c !== S.looks[1]) unready(() => { S.looks[1] = m.c; });
          } else if (m.t === "in") {
            guestIn = now; guestAway = false;
            const d = m.d | 0, h = m.h | 0, j = m.j | 0;
            if (d < remote.d || h < remote.h || j < remote.j) syncRemote(m); // 횟수가 줄었다 = 새로 센 손님
            remote = { k: m.k | 0, d, h, j };
          } else if (m.t === "rd") {
            guestIn = now;
            if (S.phase === "wait" || S.pz) { S.ready[1] = m.on && (m.u | 0) >= unGen ? 1 : 0; checkReady(); }
          } else if (m.t === "pz") pauseBy(1, "pause");
          // 손님이 화면을 숨김 — 누르던 조작만 풀고 판은 이어 간다(레퍼런스 친구 대전의 release_input). 입력이 끊긴 채 0.8초가 지나면 멈춘다
          else if (m.t === "away") { guestAway = true; remote = { k: 0, d: remote.d, h: remote.h, j: remote.j }; }
          else if (m.t === "ping") send({ t: "pong", c: m.c });
        } else {
          if (ended) return; // 끝난 손님 판은 그대로 둔다 — 주인이 같은 판을 새로 열어도 새 경기로 끌려가지 않게
          if ((m.t === "s" || m.t === "go" || m.t === "hold") && typeof m.e === "number" && m.e !== gEpoch) guestReset(m.e);
          if (m.t === "go") gotGo = true;
          else if (m.t === "unrd") { myReady = 0; myReadyAt = 0; myUn = Math.max(myUn, m.u | 0); } // 주인이 목표 점수 · 선수 변경으로 두 사람 준비를 풀었다 — 「준비됨」을 다시 보내지 않게
          else if (m.t === "pong") rtt = Math.round(performance.now() - m.c);
          else if (m.t === "hold") {
            gHold = String(m.r || "slow");
            gHoldN = m.n | 0;
            if (Array.isArray(m.rd)) gHoldRd = m.rd;
            gHoldPz = m.pz | 0; gHoldPb = m.pb; gHoldPw = m.pw || "";
            S.ready = gHoldRd || S.ready; S.pz = gHoldPz; S.pzBy = gHoldPb; S.pzWhy = gHoldPw;
            guestFlow(gPh, gHoldPz);
          } else if (m.t === "s" && typeof m.f === "number" && Array.isArray(m.b) && Array.isArray(m.p)) {
            gotGo = m.ph !== 0; // 기다리는 중 상태를 받는 동안은 「준비됨」을 다시 보낸다(주인이 새로 열었을 때 누른 횟수를 맞추게)
            gHold = "";
            if (snaps.length && m.f <= snaps[snaps.length - 1].f) return; // 늦게 온 옛 상태
            snaps.push(m);
            if (snaps.length > SNAP_KEEP) snaps.splice(0, snaps.length - SNAP_KEEP); // 화면을 숨긴 동안 쌓이지 않게
            if (Array.isArray(m.ev)) m.ev.forEach((e) => { if (e && typeof e === "object") gev.push(e); });
            if (gev.length > GEV_KEEP) gev.splice(0, gev.length - GEV_KEEP);
            // 준비 표시는 바로 보여 준다(그리기는 늦게 해도)
            if (Array.isArray(m.rd)) S.ready = m.rd;
            S.pz = m.pz | 0;
            guestFlow(m.ph | 0, m.pz | 0);
          }
        }
      });
    }
    // 화면을 숨기면(다른 탭 · 잠금) 그리기가 멈춘다 — 누르던 조작을 풀고 상대에게 알린다.
    // 돌아오면 1초 뒤 이어 가고, 3초 넘게 숨겼으면 일시정지로 바꾼다(두 사람 모두 계속 준비 — 레퍼런스 친구 대전의 「다른 화면으로 이동」 멈춤)
    function onVisibility() {
      if (destroyed || !started) return;
      const hidden = document.visibilityState === "hidden";
      if (hidden) clearPads();
      if (mode === "guest") { if (hidden) send({ t: "away" }); return; }
      selfHidden = hidden;
      const now = performance.now();
      if (hidden) { hiddenAt = now; send({ t: "hold", e: epoch, r: "rest", rd: S.ready, pz: S.pz, pb: S.pzBy, pw: S.pzWhy }); return; }
      const long = hiddenAt && now - hiddenAt > HOLD_PAUSE_MS;
      hiddenAt = 0;
      if (long && ["serve", "play", "point"].includes(S.phase)) pauseBy(0, "away");
      else resumeAt = Math.max(resumeAt, now + 1000);
    }
    if (online) document.addEventListener("visibilitychange", onVisibility);

    // host: 판을 멈출 까닭 — 일시정지 · 상대가 안 보이거나 · 다시 연결하는 중 · 손님 입력이 끊김 · 손님이 화면을 숨김
    const LIVE = ["count", "serve", "play", "point"];
    function hostHold(now) {
      if (mode !== "host" || !LIVE.includes(S.phase)) return "";
      if (S.pz) return "pause";
      if (link !== "ok") return link;
      if (selfHidden) return "rest";
      if (now - guestIn > SLOW_MS) return guestAway ? "gone" : "slow";
      return "";
    }

    // ───── 계산 (cpu · local · host · demo)
    const ctl = [{ pad: null, ai: ctlAI[0] }, { pad: null, ai: ctlAI[1] }];
    function simTick() {
      prevB.x = S.ball.x; prevB.y = S.ball.y; prevB.rot = S.ball.rot;
      S.p.forEach((p, i) => { prevP[i].x = p.x; prevP[i].y = p.y; });
      if (hitStop > 0) { hitStop--; return; }
      evq.length = 0;
      for (let i = 0; i < 2; i++) ctl[i].pad = ctl[i].ai ? null : mode === "host" && i === 1 ? remote : padBits(i);
      const ph0 = S.phase;
      step(S, ctl, evq);
      for (const e of evq) {
        e.f = S.f;
        handleEv(e);
        if (mode === "host") outEv.push(e);
      }
      // 득점 · 다음 서브 — 누르던 조작을 이 틱에서 바로 푼다 (다음 틱이 묵은 키를 읽지 않게)
      if (S.phase !== ph0 && mode !== "demo") flowChanged(ph0, S.phase);
      if (ph0 === "point" && S.phase === "serve") {
        // 다음 서브 자리로 옮겼다 — 그리기가 득점 자리에서 새 자리로 미끄러지지 않게 바로 맞춘다
        S.p.forEach((p, i) => { prevP[i].x = p.x; prevP[i].y = p.y; });
        prevB.x = S.ball.x; prevB.y = S.ball.y; prevB.rot = S.ball.rot;
        // 혼자 · 둘이 — 레퍼런스는 1.5초 안내가 끝난 화면에서 계산을 멈추고, 다음 화면은 기준 시각만 잡은 뒤 그다음 화면부터 센다
        if (mode === "cpu" || mode === "local") restartAt = true;
      }
      // 기다리는 동안은 0.25초마다만 (손님이 주인의 새 판 번호를 알아채기에 넉넉하다)
      // 경기가 끝나고 3초 뒤부터도 0.25초마다 끝 장면을 보낸다 — 결과를 못 내고 다시 들어온 손님이 끝을 받아 결과를 낼 수 있게
      const slow = S.phase === "wait" || (S.phase === "end" && S.t > END_T + 3);
      if (mode === "host" && S.f % (slow ? 30 : SNAP_EVERY) === 0) send(packState());
      if (S.phase === "end" && S.t >= END_T) finish();
    }

    // ───── guest — 받은 상태를 보간해 그린다
    const G0 = newState(target0, 0, "wait"), G1 = newState(target0, 0, "wait");
    function guestTick(dt) {
      if (ended) return; // 끝난 뒤에는 받은 상태로 다시 그리지 않는다 (끝 장면 그대로)
      const now = performance.now();
      if (!gotGo && now - lastHi > 500) { lastHi = now; const o = padBits(mySide); send({ t: "hi", d: o.d, h: o.h, j: o.j, rd: myReady, c: myLook, u: myUn }); }
      if (now - lastIn > 120) { lastIn = now; const o = padBits(mySide); send({ t: "in", k: o.k, d: o.d, h: o.h, j: o.j }); }
      if (now - lastPing > 2000) { lastPing = now; send({ t: "ping", c: now }); }
      if (!snaps.length) return;
      const latest = snaps[snaps.length - 1];
      const want = latest.f - GUEST_DELAY;
      if (gf < 0) gf = want;
      gf += dt * HZ;
      if (Math.abs(want - gf) > 60) {
        // 많이 밀렸다(화면을 숨겼다 돌아옴 등) — 지난 사건은 소리 · 효과 없이 버린다 (끝 장면만 남긴다)
        for (let i = gev.length - 1; i >= 0; i--) if ((gev[i].f || 0) <= want && gev[i].k !== "end") gev.splice(i, 1);
        gf = want;
      } else gf += (want - gf) * Math.min(1, dt * 4);
      if (gf > latest.f) gf = latest.f;
      while (snaps.length > 2 && snaps[1].f <= gf) snaps.shift();
      while (gev.length && (gev[0].f || 0) <= gf) handleEv(gev.shift());
      const s0 = snaps[0], s1 = snaps[1] || s0;
      unpack(s0, G0);
      unpack(s1, G1);
      const a = s1.f > s0.f ? clamp((gf - s0.f) / (s1.f - s0.f), 0, 1) : 1;
      const rd = latest.rd, pz = latest.pz | 0;
      unpack(s1, S);
      if (gHold) { S.ready = gHoldRd || S.ready; S.pz = gHoldPz; S.pzBy = gHoldPb; S.pzWhy = gHoldPw; } // 멈춘 동안은 hold 로 받은 준비 표시가 더 새것
      else if (Array.isArray(rd)) { S.ready = rd; S.pz = pz; } // 준비 표시는 늦추지 않는다
      const near = (x0, y0, x1, y1) => Math.abs(x1 - x0) + Math.abs(y1 - y0) < 170;
      if (near(G0.ball.x, G0.ball.y, G1.ball.x, G1.ball.y)) {
        S.ball.x = lerp(G0.ball.x, G1.ball.x, a); S.ball.y = lerp(G0.ball.y, G1.ball.y, a); S.ball.rot = lerp(G0.ball.rot, G1.ball.rot, a);
      }
      for (let i = 0; i < 2; i++) {
        const p0 = G0.p[i], p1 = G1.p[i];
        if (near(p0.x, p0.y, p1.x, p1.y)) { S.p[i].x = lerp(p0.x, p1.x, a); S.p[i].y = lerp(p0.y, p1.y, a); }
      }
      // 단계가 바뀌는 사이(득점 → 끝 등)는 섞지 않는다 — 섞으면 끝 장면이 시작하자마자 끝난 것으로 보인다
      S.t = G0.phase === G1.phase ? lerp(G0.t, G1.t, a) : G1.t;
      prevB.x = S.ball.x; prevB.y = S.ball.y; prevB.rot = S.ball.rot;
      S.p.forEach((p, i) => { prevP[i].x = p.x; prevP[i].y = p.y; });
      if (S.phase === "end" && S.t >= END_T) finish();
    }

    // ───── 사건 → 소리 · 효과
    function burst(x, y, n, colors, speed, life, size, gravity) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.8);
        parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - speed * 0.3, life, max: life, c: colors[i % colors.length], r: size * (0.6 + Math.random() * 0.7), gr: gravity });
      }
    }
    function ring(x, y, color, r0, r1, life) { parts.push({ ring: 1, x, y, r0, r1, life, max: life, c: color }); }
    function popText(x, y, text, color, size) { texts.push({ x, y, text, c: color, s: size || 1, life: 0.9, max: 0.9 }); }
    const isHuman = (s) => human[s];
    function handleEv(e) {
      switch (e.k) {
        case "ready": sfx("countdown"); break;
        case "go": sfx("go"); break;
        case "jump":
          if (isHuman(e.s)) sfx("jump");
          burst(e.x, FLOOR - 2, 4, ["#e2e8f0", "#cbd5e1"], 60, 0.3, 3, 0);
          break;
        case "land": burst(e.x, FLOOR - 2, 3, ["#e2e8f0"], 40, 0.25, 2.5, 0); break;
        case "dive":
          sfx("whoosh");
          burst(e.x, FLOOR - 4, 8, ["#e2e8f0", "#cbd5e1", "#a7f3d0"], 90, 0.4, 3.5, 200);
          break;
        case "bump": {
          sfx(e.serve ? "tap" : "pop");
          looks[e.s].bump = 0.18;
          ballSq = 0.1;
          ring(e.x, e.y, "rgba(255,255,255,.9)", 8, 30, 0.28);
          burst(e.x, e.y, 5, ["#ffffff", "#fde68a"], 120, 0.35, 2.6, 300);
          if (e.dig) popText(e.x, e.y - 30, "나이스!", "#16a34a", 0.9);
          if (!e.serve) rallyFx(e.r);
          break;
        }
        case "power": {
          ballSq = 0.12;
          if (e.kind === "spike") {
            sfx("hit"); sfx("whoosh");
            shake = 0.22; shakeMag = 6;
            ring(e.x, e.y, "rgba(255,196,64,.95)", 10, 60, 0.35);
            burst(e.x, e.y, 14, ["#ffd23f", "#ff7a3d", "#ffffff"], 260, 0.45, 3.2, 400);
            popText(e.x, e.y - 34, "강타!", "#ef4444", 1.15);
          } else {
            sfx("pop"); sfx("whoosh");
            ring(e.x, e.y, "rgba(255,255,255,.95)", 8, 44, 0.3);
            burst(e.x, e.y, 8, ["#ffffff", "#bae6fd"], 160, 0.4, 2.6, 300);
            popText(e.x, e.y - 32, "높이!", "#0284c7", 0.95);
          }
          rallyFx(e.r);
          break;
        }
        case "wall": sfx("tap"); burst(e.x, e.y, 4, ["#ffffff"], 80, 0.25, 2, 0); break;
        case "net":
          sfx(e.hard ? "drop" : "tap");
          netWob = 0.4;
          break;
        case "point": {
          sfx("land");
          shake = 0.2; shakeMag = e.sp > 700 ? 6 : 3.5;
          burst(e.x, FLOOR - 4, 16, ["#e7e5e4", "#d6d3d1", "#bbf7d0"], 170, 0.6, 4, 500);
          ring(e.x, FLOOR - 6, "rgba(255,255,255,.8)", 12, 48, 0.4);
          const mine = mode === "local" || mode === "demo" ? true : e.s === mySide;
          setTimeout(() => !destroyed && sfx(mine ? "coin" : "fail"), 120);
          banner = { text: `${who[e.s].name} 득점!`, color: TEAM[e.s], t: 0 };
          const sp = S.p[e.s];
          if (sp) popText(sp.x, Math.min(sp.y, P_Y) - 78, "+1", TEAM[e.s], 1.1);
          emit({ type: "point", side: e.s, mine: e.s === mySide, left: S.score[0], right: S.score[1] });
          break;
        }
        case "serve":
          rallyShown = 0;
          emit({ type: "serve", side: e.s, mine: e.s === mySide });
          break;
        case "end": {
          const won = e.s === mySide;
          setTimeout(() => !destroyed && sfx(mode === "local" || won ? "win" : "lose"), 250);
          const sp = S.p[e.s];
          for (let i = 0; i < 40; i++) {
            parts.push({ x: (sp ? sp.x : NET_X) + (Math.random() - 0.5) * 160, y: -10 - Math.random() * 120, vx: (Math.random() - 0.5) * 60, vy: 60 + Math.random() * 80, life: 2.6, max: 2.6, c: ["#ffd23f", "#ff7a3d", "#2f6bff", "#22c55e", "#ec4899"][i % 5], r: 3.5, gr: 20, conf: 1, spin: Math.random() * 6 });
          }
          break;
        }
        case "pz": sfx("tap"); break;
        default: break;
      }
    }
    function rallyFx(n) {
      if (!n || n < 10 || n % 10 !== 0 || n === rallyShown) return;
      rallyShown = n;
      sfx("combo", Math.min(10, n / 10 + 2));
      banner = { text: `랠리 ${n}!`, color: "#7c3aed", t: 0, small: 1 };
    }

    function finish() {
      if (ended) return;
      ended = true;
      const res = {
        win: S.winner === mySide, winner: S.winner,
        me: S.score[mySide], rival: S.score[1 - mySide], left: S.score[0], right: S.score[1],
        rally: S.best, spikes: { me: S.spikes[mySide], rival: S.spikes[1 - mySide] },
        sec: Math.round((S.f * DT) * 10) / 10, mode, level, target: S.target,
      };
      emit({ type: "end", ...res });
      try { if (opts.onEnd) opts.onEnd(res); } catch (_) { /* 페이지 쪽 오류는 무시 */ }
    }

    // ───── 화면 크기
    function resize() {
      const r = canvas.getBoundingClientRect();
      const w = Math.max(1, r.width), h = Math.max(1, r.height);
      const nd = Math.min(2, window.devicePixelRatio || 1);
      if (w === cssW && h === cssH && nd === dpr && bgSky) return;
      cssW = w; cssH = h; dpr = nd;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      scale = Math.min(cssW / W, cssH / H);
      ox = (cssW - W * scale) / 2;
      oy = (cssH - H * scale) / 2;
      bgSky = bgScene = null;
    }
    function buildBg() {
      const mk = (paint) => {
        const c = document.createElement("canvas");
        c.width = canvas.width; c.height = canvas.height;
        const x = c.getContext("2d");
        x.setTransform(dpr * scale * ART, 0, 0, dpr * scale * ART, ox * dpr, oy * dpr);
        paint(x);
        return c;
      };
      bgSky = mk((x) => paintSky(x, court));
      bgScene = mk((x) => paintScene(x, FONT, court));
    }
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => { resize(); if (!raf) draw(); }) : null;
    if (ro) ro.observe(canvas);
    const onWinResize = () => { resize(); if (!raf) draw(); };
    window.addEventListener("resize", onWinResize);

    // ───── 그리기
    const CLOUDS = [[60, 70, 1.1, 7], [300, 40, 0.8, 5], [520, 120, 1.3, 9], [760, 86, 0.9, 6], [190, 150, 0.7, 4]];
    function drawClouds(g2) {
      g2.fillStyle = court.cloud || "rgba(255,255,255,.92)";
      for (const [x0, y, s, sp] of CLOUDS) {
        const x = ((x0 + clock * sp) % (AW + 240)) - 120;
        for (const [dx, dy, rx, ry] of [[0, 0, 34, 14], [-22, 4, 20, 11], [24, 3, 22, 12], [2, -9, 20, 13]]) {
          g2.beginPath(); g2.ellipse(x + dx * s, y + dy * s, rx * s, ry * s, 0, 0, Math.PI * 2); g2.fill();
        }
      }
    }
    // 눈 오는 날 — 풍경 앞 · 사람 뒤로 눈이 내린다
    function drawSnow(g2) {
      g2.fillStyle = "rgba(255,255,255,.9)";
      const span = AF + 40;
      for (const f of FLAKES) {
        const y = ((f.y + clock * f.sp) % span) - 30;
        const x = ((f.x + clock * 7 + Math.sin(clock * 0.9 + f.ph) * 10) % (AW + 60) + AW + 60) % (AW + 60) - 30;
        g2.beginPath(); g2.arc(x, y, f.sz, 0, 7); g2.fill();
      }
    }
    function screenOf(x, y) { return [ox + x * scale, oy + y * scale]; }

    const FIG = 64 / 87; // 그림 사람(발 ~ 머리카락 끝 약 87)을 레퍼런스 선수 키(64)로
    function drawPlayer(p, i, px, py) {
      const L = LOOKS[okLook(S.looks[i]) ? S.looks[i] : i];
      const x = px, y = py, f = p.face;
      const air = P_Y - y;
      g.fillStyle = `rgba(22,70,45,${Math.max(0.08, 0.3 - air / 600)})`;
      g.beginPath(); g.ellipse(x, FLOOR + 3, Math.max(14, 31 - air / 10), 5, 0, 0, 7); g.fill();
      // 자리 표시 — 발밑 짧은 줄(왼쪽 사람은 이어진 줄, 오른쪽 사람은 끊긴 줄). 두 사람이 같은 선수를 골라도 구별된다
      g.strokeStyle = TEAM[i]; g.lineWidth = 3; g.lineCap = "round";
      g.beginPath();
      if (i === 0) { g.moveTo(x - 9, y + PR + 5); g.lineTo(x + 9, y + PR + 5); }
      else { g.moveTo(x - 9, y + PR + 5); g.lineTo(x - 3, y + PR + 5); g.moveTo(x + 3, y + PR + 5); g.lineTo(x + 9, y + PR + 5); }
      g.stroke();
      g.save();
      g.translate(x, y + PR);
      g.scale(FIG, FIG);
      const lying = p.dive > 0;
      if (lying) {
        // 다이빙 — 보는 쪽으로 몸을 눕힌다 (발이 뒤, 머리가 앞)
        g.scale(f, 1);
        g.translate(-40, -14);
        g.rotate(1.45);
      } else {
        let sx = 1, sy = 1;
        if (p.land > 0) { const k = p.land / 0.12; sx = 1 + 0.13 * k; sy = 1 - 0.13 * k; }
        else if (!onGround(p)) { const k = clamp(-p.vy / JUMP_V, -1, 1); sx = 1 - 0.05 * k; sy = 1 + 0.06 * k; }
        g.scale(f * sx, sy);
      }
      drawFigure(g, p, L, clock, lying, looks[i]);
      g.restore();
    }

    function hudText(text, x, y, size, color, align, weight, stroke) {
      g.font = `${weight || 800} ${size}px ${FONT}`;
      g.textAlign = align || "center";
      g.textBaseline = "middle";
      if (stroke) { g.lineJoin = "round"; g.lineWidth = Math.max(3, size * 0.22); g.strokeStyle = stroke; g.strokeText(text, x, y); }
      g.fillStyle = color;
      g.fillText(text, x, y);
    }
    function avatarAt(w, side, cx, cy, r) {
      g.save();
      g.beginPath(); g.arc(cx, cy, r, 0, 7);
      g.fillStyle = TEAM[side]; g.fill();
      g.clip();
      if (w.img) g.drawImage(w.img, cx - r, cy - r, r * 2, r * 2);
      else hudText((w.name || "?").trim().charAt(0) || "?", cx, cy + 0.5, r * 1.05, "#ffffff", "center", 800);
      g.restore();
      g.beginPath(); g.arc(cx, cy, r, 0, 7);
      g.lineWidth = 2; g.strokeStyle = "#ffffff"; g.stroke();
    }

    // 나 · 1P · 2P 표시 — 공보다 먼저 그린다(머리 위에서 받는 공을 가리지 않게. 레퍼런스는 공이 늘 보인다)
    function drawTags() {
      if (mode === "demo") return;
      const hs = clamp(cssW / 900, 0.78, 1.25);
      for (let side = 0; side < 2; side++) {
        if (!(mode === "local" || side === mySide)) continue;
        const p = S.p[side];
        const [mx, my] = screenOf(lerp(prevP[side].x, p.x, alpha), lerp(prevP[side].y, p.y, alpha) - (p.dive > 0 ? 34 : 52));
        const label = mode === "local" ? (side ? "2P" : "1P") : "나";
        const fs = 11 * hs;
        g.font = `800 ${fs}px ${FONT}`;
        const tw = g.measureText(label).width + 10 * hs;
        g.fillStyle = TEAM[side];
        rr(g, mx - tw / 2, my - 9 * hs, tw, 16 * hs, 8 * hs); g.fill();
        g.beginPath(); g.moveTo(mx - 4 * hs, my + 7 * hs); g.lineTo(mx + 4 * hs, my + 7 * hs); g.lineTo(mx, my + 11 * hs); g.closePath(); g.fill();
        hudText(label, mx, my - 1 * hs, fs, "#ffffff", "center", 800);
      }
    }

    function drawHud() {
      const hs = clamp(cssW / 900, 0.78, 1.25);
      const pad = 10 * hs;
      const sides = [0, 1]; // 화면 왼쪽 · 오른쪽 사람
      const top = oy + pad;
      sides.forEach((side, k) => {
        const w = who[side], right = k === 1;
        const h = 40 * hs, r = 14 * hs;
        g.font = `700 ${13 * hs}px ${FONT}`;
        const name = w.name.length > 8 ? `${w.name.slice(0, 8)}…` : w.name;
        const nw = g.measureText(name).width;
        const scoreW = 30 * hs;
        const bw = 8 * hs + r * 2 + 8 * hs + nw + 10 * hs + scoreW + 8 * hs;
        const bx = right ? ox + W * scale - pad - bw : ox + pad;
        g.fillStyle = "rgba(255,255,255,.88)";
        rr(g, bx, top, bw, h, h / 2); g.fill();
        g.strokeStyle = TEAM[side]; g.lineWidth = 2; g.stroke();
        const ax = right ? bx + bw - 8 * hs - r : bx + 8 * hs + r;
        avatarAt(w, side, ax, top + h / 2, r);
        const nx = right ? ax - r - 8 * hs : ax + r + 8 * hs;
        hudText(name, nx, top + h / 2 + 0.5, 13 * hs, "#0f172a", right ? "right" : "left", 700);
        const sx = right ? bx + 8 * hs + scoreW / 2 : bx + bw - 8 * hs - scoreW / 2;
        g.fillStyle = TEAM[side];
        rr(g, sx - scoreW / 2, top + 5 * hs, scoreW, h - 10 * hs, (h - 10 * hs) / 2); g.fill();
        hudText(String(S.score[side]), sx, top + h / 2 + 1, 19 * hs, "#ffffff", "center", 800);
        // 서브 표시
        if ((S.phase === "serve" || S.phase === "count") && S.serve === side) {
          const bxx = right ? bx - 14 * hs : bx + bw + 14 * hs;
          g.save(); g.translate(bxx, top + h / 2); g.scale(0.42 * hs, 0.42 * hs); drawBallShape(g, 0, 0, 0, 1, 1); g.restore();
        }
      });
      // 가운데 — 난이도 · 목표 점수, 이번 랠리(두 사람이 공을 받은 횟수) · 내 최고 랠리
      const cx = ox + (W * scale) / 2;
      const LV = { easy: "쉬움", normal: "보통", hard: "어려움" };
      hudText(`${mode === "cpu" ? `${LV[level]} · ` : ""}${S.target}점 선승`, cx, top + 11 * hs, 11.5 * hs, "rgba(15,23,42,.62)", "center", 700);
      if (S.phase !== "wait" && S.phase !== "count") {
        hudText(`이번 랠리 ${S.rally}회${mode === "cpu" ? ` · 최고 ${best0}회` : ""}`, cx, top + 30 * hs, 13.5 * hs, "#ffffff", "center", 800, "rgba(15,23,42,.55)");
      }
      // 가운데 큰 글자
      const midY = oy + H * scale * 0.36;
      const big = (text, color, size) => hudText(text, cx, midY, size * hs, color, "center", 900, "rgba(15,23,42,.6)");
      // 손님 — 주인이 들어와 있으면(link ok) 시작 신호를 받기 전까지 「연결하는 중…」, 아직 없으면 「상대를 기다리는 중…」
      if (S.phase === "wait") big(mode === "guest" && !gotGo && link !== "away" ? "연결하는 중…" : "상대를 기다리는 중…", "#ffffff", 26);
      else if (S.phase === "count") big(String(Math.max(1, Math.ceil(COUNT_T - S.t))), "#ffffff", 52);
      else if (S.phase === "end") {
        const t = S.t;
        const label = mode === "local" ? `${who[S.winner].name} 승리!` : S.winner === mySide ? "이겼어요!" : mode === "demo" ? `${who[S.winner].name} 승리!` : "아쉽게 졌어요";
        g.save();
        const sc = 1 + Math.max(0, 0.35 - t) * 1.2;
        g.translate(cx, midY); g.scale(sc, sc); g.translate(-cx, -midY);
        big(label, S.winner === mySide || mode === "local" ? "#ffd23f" : "#ffffff", 40);
        g.restore();
      }
      if (banner && S.phase !== "end") {
        const t = banner.t, a = t < 0.15 ? t / 0.15 : t > 1.1 ? Math.max(0, 1 - (t - 1.1) / 0.25) : 1;
        if (a > 0) {
          g.save();
          g.globalAlpha = a;
          const size = (banner.small ? 20 : 26) * hs;
          g.font = `900 ${size}px ${FONT}`;
          const tw = g.measureText(banner.text).width + 34 * hs;
          const yy = midY + (banner.small ? -20 : 0) * hs - (1 - Math.min(1, t / 0.15)) * 10;
          g.fillStyle = banner.color;
          rr(g, cx - tw / 2, yy - size * 0.85, tw, size * 1.7, size * 0.85); g.fill();
          hudText(banner.text, cx, yy + 1, size, "#ffffff", "center", 900);
          g.restore();
        }
      }
      // 서브 안내 — 공은 서브하는 사람이 뛰어 닿을 때까지 멈춰 있다
      if (S.phase === "serve" && mode !== "demo") {
        const mine = mode === "local" || S.serve === mySide;
        const txt = mode === "local" ? `${S.serve ? "2P" : "1P"} 서브 · 점프로 공을 직접 쳐 주세요`
          : mine ? `내 서브 · ${touchUI ? "점프 버튼" : "점프"}로 공을 직접 쳐 주세요` : "상대 서브 · 점프해서 공에 닿아야 시작해요";
        const y = oy + H * scale - 26 * hs;
        g.font = `700 ${12.5 * hs}px ${FONT}`;
        const tw = g.measureText(txt).width + 26 * hs;
        g.fillStyle = "rgba(15,23,42,.62)";
        rr(g, cx - tw / 2, y - 13 * hs, tw, 26 * hs, 13 * hs); g.fill();
        hudText(txt, cx, y + 0.5, 12.5 * hs, "#ffffff", "center", 700);
      }
      // 연결 · 멈춤 알림 — 어두운 띠 위에 (준비 글자와 겹치지 않게 그 아래)
      const note = netNote();
      if (note) {
        const size = 18 * hs, yy = midY + (S.phase === "count" ? 52 : 0) * hs;
        g.font = `800 ${size}px ${FONT}`;
        const tw = g.measureText(note).width + 36 * hs;
        g.fillStyle = "rgba(15,23,42,.72)";
        rr(g, cx - tw / 2, yy - size * 0.95, tw, size * 1.9, size * 0.95); g.fill();
        hudText(note, cx, yy + 1, size, "#ffffff", "center", 800);
      }
      // 지연 — 오른쪽 점수판 아래 (판 아래 모서리는 PC 코트 안 조작판 자리)
      if (mode === "guest" && rtt >= 0) hudText(`지연 ${rtt}ms`, ox + W * scale - pad - 6 * hs, top + 52 * hs, 10 * hs, "rgba(15,23,42,.55)", "right", 700);
    }
    const HOLD_TEXT = { away: "상대를 기다리는 중…", retry: "다시 연결하는 중…", gone: "상대가 잠깐 자리를 비웠어요", slow: "상대 연결이 불안정해요…", rest: "", resume: "곧 이어서 해요", pause: "일시정지" };
    const resumeLeft = () => Math.max(1, Math.ceil((resumeAt - performance.now()) / 1000));
    function netNote() {
      if (!online || S.phase === "wait" || S.phase === "end") return "";
      if (link === "retry") return "다시 연결하는 중…";
      if (link === "away") return "상대를 기다리는 중…";
      if (mode === "host") return holdWhy === "resume" ? `곧 이어서 해요 · ${resumeLeft()}` : HOLD_TEXT[holdWhy] || "";
      const quiet = !!snaps.length && performance.now() - lastHeard > 1500;
      if (gHold === "rest") return "상대가 잠깐 자리를 비웠어요";
      if (gHold === "pause") return "일시정지";
      if (gHold === "resume" && !quiet) return `곧 이어서 해요${gHoldN ? ` · ${gHoldN}` : ""}`;
      if (gHold || quiet) return "연결이 불안정해요…";
      return "";
    }

    function draw() {
      if (destroyed) return;
      resize();
      if (!bgSky) buildBg();
      const k = dpr * scale;
      let sx = 0, sy = 0;
      if (shake > 0) { sx = (Math.random() * 2 - 1) * shakeMag * (shake / 0.22); sy = (Math.random() * 2 - 1) * shakeMag * (shake / 0.22); }
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = "#2f855a";
      g.fillRect(0, 0, canvas.width, canvas.height);
      g.drawImage(bgSky, 0, 0);
      g.setTransform(k * ART, 0, 0, k * ART, ox * dpr, oy * dpr);
      drawClouds(g);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(bgScene, sx * k, sy * k);
      if (court.snow) { g.setTransform(k * ART, 0, 0, k * ART, ox * dpr, oy * dpr); drawSnow(g); }
      g.setTransform(k, 0, 0, k, (ox + sx * scale) * dpr, (oy + sy * scale) * dpr);
      // 공 그림자
      const b = S.ball;
      const bx = lerp(prevB.x, b.x, alpha), by = lerp(prevB.y, b.y, alpha), brot = lerp(prevB.rot, b.rot, alpha);
      const bh = FLOOR - by;
      g.fillStyle = `rgba(22,70,45,${clamp(0.32 - bh / 900, 0.06, 0.3)})`;
      g.beginPath(); g.ellipse(bx, FLOOR + 3, clamp(18 - bh / 40, 7, 18), 4.5, 0, 0, 7); g.fill();
      drawNet(g, netWob);
      // 사람
      [0, 1].forEach((i) => {
        const p = S.p[i];
        drawPlayer(p, i, lerp(prevP[i].x, p.x, alpha), lerp(prevP[i].y, p.y, alpha));
      });
      // 나 · 1P · 2P (화면 좌표로) — 공 아래에
      g.save();
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawTags();
      g.restore();
      // 공 잔상 · 공
      const fast = Math.hypot(b.vx, b.vy) > 720 || b.pow > 0;
      if (!b.held && (fast || trail.length)) {
        for (let i = 0; i < trail.length; i++) {
          const t = trail[i], a2 = (i + 1) / (trail.length + 1);
          g.fillStyle = b.pow > 0 || t.pow ? `rgba(255,${120 + i * 10},60,${a2 * 0.45})` : `rgba(255,255,255,${a2 * 0.5})`;
          g.beginPath(); g.arc(t.x, t.y, BR * (0.5 + a2 * 0.45), 0, 7); g.fill();
        }
      }
      const hb = 0; // 서브 공은 그 자리에 멈춰 있다 (닿는 자리 그대로 그린다)
      let ssx = 1, ssy = 1;
      if (ballSq > 0) { const q = ballSq / 0.12; ssx = 1 + 0.18 * q; ssy = 1 - 0.18 * q; }
      if (b.pow > 0) {
        const glow = g.createRadialGradient(bx, by, 4, bx, by, BR * 2.2);
        glow.addColorStop(0, "rgba(255,200,64,.55)"); glow.addColorStop(1, "rgba(255,120,40,0)");
        g.fillStyle = glow; g.beginPath(); g.arc(bx, by, BR * 2.2, 0, 7); g.fill();
      }
      drawBallShape(g, bx, by + hb, brot, ssx, ssy);
      // 조각 · 고리
      for (const q of parts) {
        const a3 = Math.max(0, q.life / q.max);
        if (q.ring) {
          g.strokeStyle = q.c; g.globalAlpha = a3; g.lineWidth = 3 * a3 + 1;
          g.beginPath(); g.arc(q.x, q.y, lerp(q.r1, q.r0, a3), 0, 7); g.stroke();
          g.globalAlpha = 1;
        } else if (q.conf) {
          g.save(); g.translate(q.x, q.y); g.rotate(q.spin); g.globalAlpha = Math.min(1, a3 * 2);
          g.fillStyle = q.c; g.fillRect(-q.r, -q.r * 0.5, q.r * 2, q.r); g.restore();
        } else {
          g.globalAlpha = a3; g.fillStyle = q.c;
          g.beginPath(); g.arc(q.x, q.y, q.r * (0.5 + a3 * 0.5), 0, 7); g.fill();
          g.globalAlpha = 1;
        }
      }
      // 떠오르는 글자 (화면 좌표로 — 작은 화면에서도 읽히게)
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const hs = clamp(cssW / 900, 0.78, 1.25);
      for (const t of texts) {
        const a4 = Math.max(0, t.life / t.max), [tx, ty] = screenOf(t.x, t.y - (1 - a4) * 30);
        g.globalAlpha = Math.min(1, a4 * 2.2);
        hudText(t.text, tx, ty, 17 * hs * t.s, t.c, "center", 900, "#ffffff");
        g.globalAlpha = 1;
      }
      if (mode !== "demo") drawHud();
    }

    function fxTick(dt) {
      clock += dt;
      if (shake > 0) shake -= dt;
      if (netWob > 0) netWob = Math.max(0, netWob - dt);
      if (ballSq > 0) ballSq -= dt;
      looks.forEach((l) => { if (l.bump > 0) l.bump -= dt; });
      if (banner) { banner.t += dt; if (banner.t > 1.4) banner = null; }
      for (let i = parts.length - 1; i >= 0; i--) {
        const q = parts[i];
        q.life -= dt;
        if (q.life <= 0) { parts.splice(i, 1); continue; }
        if (!q.ring) {
          q.vy += (q.gr || 0) * dt;
          q.x += q.vx * dt; q.y += q.vy * dt;
          if (q.conf) { q.spin += dt * 5; q.vx *= 0.99; }
          else if (q.y > FLOOR) { q.y = FLOOR; q.vy *= -0.3; }
        }
      }
      for (let i = texts.length - 1; i >= 0; i--) { texts[i].life -= dt; if (texts[i].life <= 0) texts.splice(i, 1); }
      const b = S.ball;
      const fast = !b.held && (Math.hypot(b.vx, b.vy) > 720 || b.pow > 0);
      if (fast) { trail.push({ x: b.x, y: b.y, pow: b.pow > 0 }); if (trail.length > 7) trail.shift(); }
      else if (trail.length) trail.shift();
    }

    // 온라인 준비 · 일시정지 상태 — 바뀌면 페이지에 알린다(준비 화면 · 계속 준비 화면)
    let lobbySig = "", myReady = 0, myReadyAt = 0;
    let unGen = 0, myUn = 0; // 준비 풀기 번호 — 주인이 센 것(unGen) · 손님이 마지막으로 받은 것(myUn)
    function lobbyInfo() {
      const now = performance.now(), rd = S.ready || [0, 0];
      const mine = mode === "guest" && myReadyAt && now - myReadyAt < 1500 ? myReady : rd[mySide];
      return {
        phase: S.phase, paused: !!S.pz, pausedBy: S.pz ? (S.pzBy === mySide ? "me" : "rival") : null, pausedWhy: S.pz ? S.pzWhy || "pause" : null,
        ready: [!!mine, !!rd[1 - mySide]], target: S.target, host: mode === "host",
        peer: mode === "host" ? guestHere(now) : link === "ok" && (gotGo || snaps.length > 0),
        looks: [mode === "guest" ? myLook : S.looks[mySide], S.looks[1 - mySide]], // [내 선수, 상대 선수]
      };
    }
    function lobbyTick() {
      if (!online) return;
      if (mode === "host" && (S.phase === "wait" || S.pz)) checkReady(); // 두 사람 다 준비했는데 손님 소식이 늦게 온 경우
      const L = lobbyInfo();
      const sig = `${L.phase === "wait"}.${L.paused}.${L.pausedBy}.${L.pausedWhy}.${L.ready}.${L.target}.${L.peer}.${L.looks}`;
      if (sig !== lobbySig) { lobbySig = sig; emit({ type: "lobby", ...L }); }
    }

    function loop(ts) {
      raf = requestAnimationFrame(loop);
      // 시작 · 계속 뒤 첫 화면은 기준 시각만 잡는다 (레퍼런스와 같이 — 첫 화면이 늦게 와도 지연으로 치지 않는다).
      // 첫 화면의 ts 는 누르기 전에 시작된 화면 시각일 수 있어(경기 준비가 길면 그만큼 묵음) 지금 시각과 더 늦은 쪽을 기준으로
      if (lastTs < 0) { lastTs = Math.max(ts, performance.now()); draw(); return; }
      const gapMs = ts - lastTs;
      let dt = gapMs / 1000;
      lastTs = ts;
      if (!(dt > 0)) dt = 0;
      // 혼자 · 둘이 한 화면 — 화면이 0.25초 넘게 멈췄으면(지연) 판을 세우고 멈춤 화면으로 (돌아와도 저절로 이어 가지 않는다)
      if ((mode === "cpu" || mode === "local") && gapMs > 250 && !ended) {
        acc = 0;
        emit({ type: "autopause", why: "lag" });
        draw();
        return;
      }
      if (dt > (online ? 0.1 : 0.25)) dt = online ? 0.1 : 0.25;
      const now = performance.now();
      let why = hostHold(now);
      // host — 상대가 안 보이거나 · 연결이 끊기거나 · 입력이 끊긴 멈춤이 3초를 넘으면 일시정지로 (두 사람 모두 계속 준비해야 이어 감)
      if (mode === "host") {
        if (why && why !== "pause" && ["serve", "play", "point"].includes(S.phase)) {
          if (!holdSince) holdSince = now;
          else if (now - holdSince > HOLD_PAUSE_MS) {
            pauseBy(why === "rest" || why === "retry" ? 0 : 1, why === "slow" ? "slow" : why === "gone" || why === "rest" ? "away" : "link");
            why = hostHold(now);
          }
        } else holdSince = 0;
      }
      if (mode === "guest") { guestTick(dt); alpha = 1; }
      else if (why || (mode === "host" && now < resumeAt && LIVE.includes(S.phase))) {
        // host — 판을 멈춘다 (공 · 사람 그대로). 다시 가기 전 1초(일시정지 뒤엔 3초)는 「곧 이어서 해요」
        if (why && why !== "pause") resumeAt = Math.max(resumeAt, now + 1000);
        holdWhy = why || "resume";
        acc = 0; alpha = 1;
        // 멈춘 동안 누른 것은 버린다 — 이어 갈 때 저절로 뛰거나 치지 않게
        syncSeen(S.p[0], padBits(0));
        syncSeen(S.p[1], remote);
        if (now - lastHoldSent > 250) { lastHoldSent = now; send({ t: "hold", e: epoch, r: holdWhy, rd: S.ready, pz: S.pz, pb: S.pzBy, pw: S.pzWhy, n: holdWhy === "resume" ? resumeLeft() : 0 }); }
      } else {
        holdWhy = "";
        acc += dt;
        let n = 0;
        while (acc >= DT && n < 18) { simTick(); acc -= DT; n++; if (restartAt) break; }
        if (n >= 18) acc = 0;
        if (restartAt) { restartAt = false; acc = 0; lastTs = -1; }
        alpha = clamp(acc / DT, 0, 1);
      }
      lobbyTick();
      fxTick(dt);
      // 가볍게(30fps) — 1/30초가 지나지 않았으면 이번 화면은 건너뛴다 (계산 · 입력은 그대로)
      if (fps === 30 && ts - lastDraw < 1000 / 30 - 4) return;
      lastDraw = ts;
      draw();
    }

    resize();
    S.p.forEach((p, i) => { prevP[i].x = p.x; prevP[i].y = p.y; });
    prevB.x = S.ball.x; prevB.y = S.ball.y;
    draw();

    const api = {
      start() {
        if (started || destroyed) return;
        started = true;
        if (S.phase === "count") handleEv({ k: "ready" });
        lastTs = -1;
        raf = requestAnimationFrame(loop);
        emit({ type: "start", mode });
      },
      // 온라인은 여기서 멈추지 않는다 — requestPause(두 사람 모두 계속 준비해야 이어 감)
      pause() {
        if (!started || paused || destroyed || ended || online) return false;
        paused = true;
        cancelAnimationFrame(raf); raf = 0;
        clearPads();
        draw();
        return true;
      },
      resume() {
        if (!paused || destroyed) return;
        paused = false;
        clearPads();
        // 득점 안내 중에 멈췄다 이어 가면 남은 안내 없이 바로 다음 서브 (레퍼런스와 같음)
        if (S.phase === "point") {
          evq.length = 0;
          toServe(S, evq);
          for (const e of evq) { e.f = S.f; handleEv(e); }
          S.p.forEach((p, i) => { prevP[i].x = p.x; prevP[i].y = p.y; });
          prevB.x = S.ball.x; prevB.y = S.ball.y; prevB.rot = S.ball.rot;
        }
        lastTs = -1;
        acc = 0;
        raf = requestAnimationFrame(loop);
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        cancelAnimationFrame(raf); raf = 0;
        window.removeEventListener("keydown", kd);
        window.removeEventListener("keyup", ku);
        window.removeEventListener("blur", blur);
        window.removeEventListener("resize", onWinResize);
        document.removeEventListener("visibilitychange", onVisibility);
        if (ro) ro.disconnect();
      },
      score: () => ({ left: S.score[0], right: S.score[1], me: S.score[mySide], rival: S.score[1 - mySide] }),
      // 온라인 — 준비 · 계속 준비
      setReady(on) {
        if (!online || ended) return;
        on = on ? 1 : 0;
        if (mode === "host") {
          if (S.phase !== "wait" && !S.pz) return;
          S.ready[0] = on;
          checkReady();
          send(packState());
        } else {
          myReady = on; myReadyAt = performance.now();
          send({ t: "rd", on, u: myUn });
        }
        lobbyTick();
      },
      // 온라인 주인 · 경기 전 — 목표 점수(7 · 15). 바꾸면 두 사람 준비가 풀린다
      setTarget(t) {
        if (mode !== "host" || S.phase !== "wait" || (t !== 7 && t !== 15) || t === S.target) return;
        unready(() => { S.target = t; });
        lobbyTick();
      },
      // 온라인 · 경기 전 — 내 선수 모습 (바꾸면 두 사람 준비가 풀린다)
      setLook(c) {
        if (!online || ended || !okLook(c)) return;
        if (mode === "host") {
          if (S.phase !== "wait" || c === S.looks[0]) return;
          myLook = c;
          unready(() => { S.looks[0] = c; });
        } else {
          if (gPh !== 0 || c === myLook) return;
          myLook = c; myReady = 0; myReadyAt = performance.now();
          send({ t: "ch", c });
        }
        lobbyTick();
        if (!raf) draw();
      },
      // 화면 표시 — 60(기본) · 30(가볍게). 계산은 그대로, 그리는 횟수만 줄인다
      setFps(n) { fps = n === 30 ? 30 : 60; },
      // 코트 배경 — 배경을 새로 그려 둔다(경기 · 통신은 그대로)
      setCourt(id) {
        if (!okCourt(id) || COURTS[id] === court) return false;
        court = COURTS[id]; bgSky = bgScene = null;
        if (!raf) draw();
        return true;
      },
      requestPause() {
        if (!online || ended) return;
        if (mode === "host") pauseBy(0, "pause"); else send({ t: "pz" });
      },
      lobby: () => lobbyInfo(),
      control,
      isPaused: () => paused,
      isOver: () => ended,
      // 온라인 — 페이지가 아는 연결 상태 ("ok" · "away" · "retry")
      setLink(kind) {
        link = kind === "away" || kind === "retry" ? kind : "ok";
        if (mode === "host" && link !== "ok" && S.phase === "wait") S.ready[1] = 0; // 상대가 나가면 상대 준비는 풀린다
        if (!raf) draw();
      },
      // host — 이어 하기용 (새로고침 뒤 opts.resume 으로 돌려준다)
      saveState: () => ({ sc: S.score.slice(), sv: S.serve, sp: S.spikes.slice(), be: S.best, ss: S.serves.slice(), sec: Math.round(S.f * DT * 10) / 10, tg: S.target }),
      phase: () => S.phase,
      // 시험용 — 지금 판 상태(읽기만)
      debug: () => S,
      debugNet: () => ({ link, holdWhy, gHold, rtt, epoch, gEpoch, gotGo, snaps: snaps.length, gev: gev.length, sinceIn: Math.round(performance.now() - guestIn), fps, myLook, myReady }),
    };
    return api;
  }

  // 선수 고르기 그림 — 서 있는 모습(오른쪽을 봄)을 작은 그림으로. 화면 HTML 에 <img> 로 넣는다
  const thumbs = {};
  function thumb(look) {
    if (!okLook(look)) look = 0;
    if (thumbs[look]) return thumbs[look];
    try {
      const c = document.createElement("canvas");
      c.width = 64; c.height = 96; // 머리끝(약 -91) ~ 발(0), 뒤로 날리는 머리띠(-27) ~ 앞머리(+25)
      const x = c.getContext("2d");
      x.translate(33, 94);
      drawFigure(x, Object.assign(newPlayer(0), { y: P_Y }), LOOKS[look], 0.5, false, { bump: 0 });
      thumbs[look] = c.toDataURL();
    } catch (_) { thumbs[look] = ""; }
    return thumbs[look];
  }

  window.HKVolley = {
    create,
    LOOKS: LOOKS.map((l, i) => ({ id: i, name: l.name })),
    COURTS: Object.keys(COURTS).map((id) => ({ id, name: COURTS[id].name })),
    thumb,
    WORLD: { W, H, FLOOR, NET_X, NET_L, NET_R, NET_TOP, PR, PR_DIVE, BR, HZ },
    // 시험용 — 계산만 따로 (브라우저 없이 컴퓨터끼리 돌려 보기 · 레퍼런스와 같은 입력으로 맞춰 보기)
    _sim: { newState, step, placeServe, aiThink, stepBall, movePlayer, DT, HZ, K: { L: K_L, R: K_R } },
  };
})();
