// 옥상 헤딩 축구 — 점심시간 회사 옥상 풋살장에서 머리 큰 직원 둘이 겨루는 1:1 축구 (경기 엔진: 물리 · 컴퓨터 · 그리기 · 실시간 통신)
//
// window.HKSoccer.create(canvas, opts) → engine
//   opts.mode      "cpu"(컴퓨터와) · "local"(한 화면 둘이) · "host"(동료와 — 판을 계산) · "guest"(동료와 — 받아 그림) · "demo"(구경)
//   opts.level     "easy" · "normal" · "hard" — 컴퓨터 난이도 (cpu · demo)
//   opts.minutes   1 · 2 · 3 — 경기 시간(기본 2). guest 는 host 가 보낸 값을 쓴다
//   opts.me · opts.rival   { name, avatarUrl, look } — 나 · 상대.
//                  왼쪽 팀(파랑)은 나(cpu) · 1P · host, 오른쪽 팀(주황)은 컴퓨터 · 2P · guest. guest 화면은 오른쪽이 나
//                  avatarUrl 이 없거나 못 불러오면 팀 색 동그라미 + 첫 글자. look(0~3)을 주면 그린 얼굴(컴퓨터 · 구경)
//   opts.net       { send(obj) → bool, onMessage(fn) } — host · guest. HKRt.connect 결과를 이어 준다
//   opts.restore   exportState() 로 받아 둔 판 — host 가 새로고침한 뒤 이어 하기
//   opts.touch     휴대폰(화면 단추) — 키 안내 대신 단추를 쓴다
//   opts.onEnd(result)  끝나면 한 번 — { left, right, me, rival, win, draw, side, sec, kicks, heads }
//   opts.onEvent(e)     { type: "start" | "goal" | "over" | "hold" | "stall", … } — 화면이 알림 · 덮개를 고칠 때
// engine
//   start() · destroy() · pause() → bool · resume() · score() · isOver() · phase()
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
//   host → guest  {t:"s", f, ph, pt, cd, c, sc, b, p, a, fz, e, h}  초당 30번. f: host 프레임 · a: 이 판에 반영된 guest 입력 프레임 ·
//                                                                 fz: 멈춤 비트(1 host 자리 비움 · 2 상대 없음 · 4 guest 자리 비움 · 8 멈춤 · 16 guest 소식 끊김) ·
//                                                                 e: 최근 일(득점 · 휘슬 · 킥 · 끝) — 1.5초(득점은 10초) 동안 거듭 실어 한 번 놓쳐도 받는다 ·
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
  const GOAL_W = 66, BAR_Y = 296, ROOF_Y = 274, BAR_R = 6; // 골대 깊이 · 크로스바(앞 끝) 높이 · 지붕 뒤 높이(앞으로 기울어 공이 경기장 쪽으로 굴러 나온다)
  const CEIL = -140; // 하늘 끝 — 화면 위로 넘어간 공은 화살표로 보여 준다
  const BALL_R = 15, G_BALL = 0.36, AIR = 0.996, BOUNCE = 0.66, ROLL = 0.986, MAX_V = 21, SUB = 2;
  const HEAD_R = 33, HEAD_Y = 82, BODY_R = 19, BODY_Y = 38, HIP_Y = 32, LEG = 24, FOOT_R = 11;
  const SPEED = 4.3, JUMP_V = 11.6, G_P = 0.56, ACC_G = 0.36, ACC_A = 0.2;
  const KICK_T = 18, JUMP_BUF = 6, KICK_BUF = 8;
  const START_X = 250, DROP_Y = 150;
  const E_HEAD = 0.7, E_BODY = 0.5, E_FOOT = 0.34;
  const STEP_MS = 1000 / 60;
  const GOAL_PT = 120, READY_PT = 60, OVER_PT = 80, COUNT_CD = 180, RESUME_CD = 180, SHORT_CD = 60, LOCAL_RESUME_CD = 90;
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
  // 컴퓨터 — 늦게 보는 프레임 · 생각 간격 · 빠르기 · 자리 흔들림 · 헤딩(뛰는 확률 · 때 맞춤 오차) · 킥 · 골대 막기 · 멍때리기 · 공 넘기.
  // 사람과 같은 단추(좌우 · 점프 · 킥)로만 움직인다. 시험(사람 흉내 봇)에서 쉬움은 초보에게 지고, 어려움은 잘 막고 차야 이긴다
  const AI_LEVEL = {
    easy: { delay: 16, think: 6, spd: 0.72, noise: 36, jump: 0.4, jerr: 26, kick: 0.14, guard: 0, nap: 0.007, hop: 0.25 },
    normal: { delay: 13, think: 4, spd: 0.8, noise: 24, jump: 0.58, jerr: 18, kick: 0.2, guard: 0.1, nap: 0.003, hop: 0.5 },
    hard: { delay: 10, think: 3, spd: 0.88, noise: 14, jump: 0.78, jerr: 12, kick: 0.28, guard: 0.2, nap: 0.001, hop: 0.75 },
  };

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
    };
  }
  // 킥오프 자리 — 선수는 제자리, 공은 가운데 위에서 떨어진다(먹힌 쪽으로 살짝)
  function placeKickoff(S, toward) {
    for (const p of S.pl) {
      const fresh = newPlayer(p.side);
      Object.assign(p, fresh, { spd: p.spd });
    }
    Object.assign(S.ball, { x: W / 2, y: DROP_Y, vx: toward ? toward * 0.9 : 0, vy: 0 });
    S.stuck = 0;
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
  function hitCircle(b, cx, cy, cr, cvx, cvy, e) {
    const dx = b.x - cx, dy = b.y - cy, rr = BALL_R + cr, d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) return 0;
    const d = Math.sqrt(d2) || 0.0001, nx = dx / d, ny = dy / d;
    b.x = cx + nx * rr; b.y = cy + ny * rr;
    const vn = (b.vx - cvx) * nx + (b.vy - cvy) * ny;
    if (vn < 0) { b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny; return { imp: -vn, nx, ny }; }
    return { imp: 0.0001, nx, ny };
  }

  // 킥 — 다리를 휘두르는 동안 발에 닿으면 찬다. 발이 움직이는 방향(닿은 때)과 닿은 자리로 방향이, 휘두름 한가운데일수록 세게
  function tryKick(S, p, fx) {
    if (!striking(p)) return false;
    const b = S.ball, f = footOf(p);
    const dx = b.x - f.x, dy = b.y - f.y, d = Math.hypot(dx, dy);
    if (d > BALL_R + FOOT_R + 2) return false;
    if ((b.x - p.x) * p.face < -6) return false; // 등 뒤 공은 못 찬다
    const s = 1 - p.kick / KICK_T, t = clamp((s - 0.18) / 0.34, 0, 1);
    const timing = Math.sin(Math.PI * clamp(t * 1.12, 0, 1));
    const power = 9 + 8.6 * timing;
    const tx = Math.cos(f.a) * p.face, ty = -Math.sin(f.a);
    const nx = dx / (d || 1), ny = dy / (d || 1);
    let ux = tx * 0.62 + nx * 0.38, uy = ty * 0.62 + ny * 0.38;
    if (ux * p.face < 0.22) ux = 0.22 * p.face;
    const m = Math.hypot(ux, uy) || 1;
    ux /= m; uy /= m;
    b.vx = ux * power + p.vx * 0.3;
    b.vy = uy * power + Math.min(0, p.vy) * 0.3;
    const rr = BALL_R + FOOT_R + 0.5;
    b.x = f.x + nx * rr; b.y = Math.min(f.y + ny * rr, GROUND - BALL_R);
    p.hit = true;
    S.stats.kicks[p.side]++;
    if (fx) fx("kick", p.side, Math.round(power));
    return true;
  }

  // 공과 선수(머리 · 몸 · 발) 사이 가장 가까운 틈 — 음수면 겹침
  function gapTo(b, p) {
    const f = footOf(p);
    return Math.min(
      Math.hypot(b.x - p.x, b.y - (p.y - HEAD_Y)) - HEAD_R,
      Math.hypot(b.x - p.x, b.y - (p.y - BODY_Y)) - BODY_R,
      Math.hypot(b.x - f.x, b.y - f.y) - FOOT_R,
    );
  }
  function capSpeed(b) {
    const v = Math.hypot(b.vx, b.vy);
    if (v > MAX_V) { b.vx *= MAX_V / v; b.vy *= MAX_V / v; }
  }

  // 공 한 칸(SUB 번 나눠 움직여 빠른 공이 머리 · 기둥을 뚫지 않게)
  function stepBall(S, fx) {
    const b = S.ball, h = 1 / SUB, air = Math.pow(AIR, h), roll = Math.pow(ROLL, h);
    for (let k = 0; k < SUB; k++) {
      b.vy += G_BALL * h;
      b.vx *= air; b.vy *= air;
      b.x += b.vx * h; b.y += b.vy * h;
      b.rot += (b.vx * h) / BALL_R;
      // 공에서 먼 선수를 먼저, 가까운(더 깊이 닿은) 선수를 나중에 본다 — 나중에 본 쪽이 공의 마지막 방향을 정한다.
      // 왼쪽 · 오른쪽을 바꿔도 같은 규칙이라 어느 편도 늘 유리하지 않다(프레임 번호로 번갈아 보면 경기 흐름에 따라 한쪽으로 쏠렸다)
      const g0 = gapTo(b, S.pl[0]), g1 = gapTo(b, S.pl[1]);
      const order = g0 < g1 ? [S.pl[1], S.pl[0]] : g1 < g0 ? S.pl : (S.frame + k) % 2 ? [S.pl[1], S.pl[0]] : S.pl;
      for (const p of order) {
        tryKick(S, p, fx);
        // 머리 — 뛰어오르며 받으면 세지만 너무 높이 솟지 않게 위로 미는 힘은 덜 싣는다
        const hd = hitCircle(b, p.x, p.y - HEAD_Y, HEAD_R, p.vx, p.vy < 0 ? p.vy * 0.6 : p.vy, E_HEAD);
        if (hd) {
          if (hd.ny < -0.2) {
            // 헤딩은 바라보는 쪽(상대 골대)으로 — 머리 윗부분에 맞으면 앞으로 꺾어 보낸다. 얹힌 공은 앞으로 흘러내린다
            b.vx += p.face * (hd.imp > 1.5 ? Math.min(5.5, 0.9 + hd.imp * 0.3) : 0.12);
            if (b.vy < 0) b.vy *= 0.9;
            if (hd.imp > 3.4) { S.stats.heads[p.side]++; if (fx) fx("head", p.side, Math.round(hd.imp)); }
          } else if (hd.imp > 5 && fx) fx("thud", p.side);
        }
        const bd = hitCircle(b, p.x, p.y - BODY_Y, BODY_R, p.vx, p.vy, E_BODY);
        if (bd && bd.imp > 3 && fx) fx("thud", p.side);
        if (!striking(p)) { const f = footOf(p); hitCircle(b, f.x, f.y, FOOT_R, p.vx, p.vy, E_FOOT); }
      }
      for (const bar of BARS) {
        const c = closestOnSeg(b.x, b.y, bar);
        const hb = hitCircle(b, c.x, c.y, BAR_R, 0, 0, 0.55);
        if (hb && hb.imp > 2 && fx) fx("bar", 0, Math.round(hb.imp));
      }
      const inNet = b.y > BAR_Y;
      if (b.y > GROUND - BALL_R) {
        b.y = GROUND - BALL_R;
        if (b.vy > 0) { if (b.vy > 2.6 && fx) fx("bounce", 0, Math.round(b.vy)); b.vy = -b.vy * BOUNCE; if (b.vy > -1.05) b.vy = 0; }
        b.vx *= roll;
      }
      if (b.x < BALL_R) { b.x = BALL_R; if (b.vx < 0) b.vx = -b.vx * (inNet ? 0.22 : 0.7); }
      if (b.x > W - BALL_R) { b.x = W - BALL_R; if (b.vx > 0) b.vx = -b.vx * (inNet ? 0.22 : 0.7); }
      if (b.y < CEIL + BALL_R) { b.y = CEIL + BALL_R; if (b.vy < 0) b.vy = -b.vy * 0.5; }
      capSpeed(b);
    }
    // 두 선수 사이에 낀 공 — 발 사이든 머리 사이든 위로 튀어 오른다(서로 밀기만 하다 멈추지 않게)
    const touching = (p) => {
      const f = footOf(p);
      return [[p.x, p.y - HEAD_Y, HEAD_R], [p.x, p.y - BODY_Y, BODY_R], [f.x, f.y, FOOT_R]].some(([cx, cy, cr]) => Math.hypot(b.x - cx, b.y - cy) < BALL_R + cr + 1.5);
    };
    if (Math.hypot(b.vx, b.vy) < 5 && touching(S.pl[0]) && touching(S.pl[1])) {
      b.vy = Math.min(b.vy, -7.5); b.vx *= 0.3;
      if (fx) fx("squeeze", 0);
    }
    // 벽 · 바닥에 낀 공 — 선수를 밀어낸다(공은 벽을 뚫지 못하니)
    for (const p of S.pl) {
      for (const [cy, cr] of [[p.y - HEAD_Y, HEAD_R], [p.y - BODY_Y, BODY_R]]) {
        const dx = p.x - b.x, dy = cy - b.y, d = Math.hypot(dx, dy), rr = cr + BALL_R - 1;
        if (d < rr) { p.x = clamp(p.x + (dx >= 0 ? 1 : -1) * Math.min(6, rr - Math.abs(dy) * 0.3 - Math.abs(dx) + 1), HEAD_R, W - HEAD_R); }
      }
    }
  }

  // 골 — 공 전체가 골라인을 넘어 크로스바 아래로 들어가야 골
  function goalSide(b) {
    if (b.y - BALL_R <= BAR_Y) return -1;
    if (b.x + BALL_R < GOAL_W) return 1; // 왼쪽 골대에 들어감 → 오른쪽 팀 득점
    if (b.x - BALL_R > W - GOAL_W) return 0;
    return -1;
  }

  // 판 한 칸 — inputs[팀]: { l, r, jp, kp }. fx(type, side, n): 소리 · 효과
  function simStep(S, inputs, fx) {
    S.frame++;
    if (S.phase === "wait" || S.phase === "over") return;
    if (S.phase === "ready") {
      if (S.pt > 0) S.pt--;
      if (S.pt > 0) return;
      S.phase = "play";
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
      const g = goalSide(b);
      if (g >= 0) {
        S.score[g]++;
        S.conceded = 1 - g;
        S.phase = "goal"; S.pt = GOAL_PT;
        if (fx) fx("goal", g, S.score[g]);
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
  // 공이 어디로 갈지 미리 본다(선수 · 골대는 빼고 바닥 · 벽만)
  function predict(x, y, vx, vy, n) {
    const out = [{ x, y }];
    for (let t = 1; t <= n; t++) {
      vy += G_BALL; vx *= AIR; vy *= AIR;
      x += vx; y += vy;
      if (y > GROUND - BALL_R) { y = GROUND - BALL_R; if (vy > 0) { vy = -vy * BOUNCE; if (vy > -1.05) vy = 0; } vx *= ROLL; }
      if (x < BALL_R) { x = BALL_R; vx = -vx * 0.5; } else if (x > W - BALL_R) { x = W - BALL_R; vx = -vx * 0.5; }
      out.push({ x, y });
    }
    return out;
  }
  function makeAI(level, seed) {
    const L = AI_LEVEL[level] || AI_LEVEL.normal;
    return { L, rng: rngOf(seed || 7), hist: [], t: 0, want: null, tr: null, wob: 0, wobT: 0, nap: 0, jcd: 0, kcd: 0 };
  }
  function aiInput(ai, S, side) {
    const L = ai.L, me = S.pl[side], opp = S.pl[1 - side], f = me.face, rnd = ai.rng, b = S.ball;
    const out = { l: false, r: false, jp: false, kp: false };
    ai.hist.push([b.x, b.y, b.vx, b.vy]);
    if (ai.hist.length > 40) ai.hist.shift();
    if (S.phase !== "play" && S.phase !== "goal") { ai.want = null; return out; }
    if (ai.jcd > 0) ai.jcd--;
    if (ai.kcd > 0) ai.kcd--;
    if (ai.nap > 0) { ai.nap--; return out; }
    if (L.nap && rnd() < L.nap) ai.nap = 20 + Math.floor(rnd() * 40);
    if (--ai.wobT <= 0) { ai.wobT = 30 + Math.floor(rnd() * 40); ai.wob = (rnd() * 2 - 1) * L.noise; }
    const o = ai.hist[Math.max(0, ai.hist.length - 1 - L.delay)]; // 늦게 본 공
    const ox = o[0], oy = o[1];
    const speed = SPEED * me.spd;
    const myGoal = side === 0 ? GOAL_W + 46 : W - GOAL_W - 46;
    if (--ai.t <= 0 || ai.want == null) {
      ai.t = L.think;
      const tr = predict(o[0], o[1], o[2], o[3], 70);
      ai.tr = tr;
      let want = null;
      for (let t = 1; t < tr.length; t++) {
        const q = tr[t];
        if (q.y < GROUND - 210) continue; // 머리로도 닿지 않는 높이
        const stand = q.x - f * (q.y < GROUND - 80 ? 10 : 26);
        if (Math.abs(stand - me.x) <= speed * t + 12) { want = stand; break; }
      }
      if (want == null) { const q = tr[tr.length - 1]; want = q.x - f * 26; }
      // 상대가 공 뒤에서 우리 골대 쪽으로 몰고 오는데 내가 늦으면 골대 앞을 막는다
      const oppDist = Math.abs(ox - opp.x), myDist = Math.abs(ox - me.x);
      const oppBehind = (ox - opp.x) * opp.face > -8;
      const nearMyHalf = side === 0 ? ox < W * 0.62 : ox > W * 0.38;
      if (oppBehind && oppDist < 110 && myDist > oppDist + 40 && nearMyHalf && rnd() < L.guard) want = lerp(myGoal, ox, 0.42);
      ai.want = clamp(want + ai.wob, HEAD_R, W - HEAD_R);
    }
    const dx = ai.want - me.x;
    const rel = (ox - me.x) * f; // 공이 내 앞으로 얼마나
    const hgt = GROUND - oy;
    const move = dx > 6 ? 1 : dx < -6 ? -1 : 0;
    // 공이 등 뒤에 낮게 있으면 밀어 우리 골대로 넣지 않게 뛰어넘는다
    if (rel < -6 && rel > -64 && hgt < 64 && move === -f && me.ground && ai.jcd === 0 && rnd() < L.hop * 0.3) { out.jp = true; ai.jcd = 30; }
    if (move > 0) out.r = true; else if (move < 0) out.l = true;
    // 공이 머리 위에 얹혀 있거나 바로 위에서 느리게 맴돌면 뛰어 받아 낸다(머리 사이에 끼어 한참 멈추지 않게)
    const hx = ox - me.x, hy = me.y - HEAD_Y - oy;
    if (me.ground && ai.jcd === 0 && Math.abs(hx) < HEAD_R + BALL_R && hy > 0 && hy < HEAD_R + BALL_R + 24 && Math.hypot(o[2], o[3]) < 3 && rnd() < L.jump * 0.2) {
      out.jp = true; ai.jcd = 24;
    }
    // 헤딩 — 머리 위로 올 공에 맞춰 뛴다
    if (ai.tr && me.ground && ai.jcd === 0) {
      for (let k = 4; k <= 22 && k < ai.tr.length; k++) {
        const q = ai.tr[k];
        if (Math.abs(q.x - (me.x + f * 6)) > 34) continue;
        const need = me.y - HEAD_Y - HEAD_R - (q.y + BALL_R) + 8;
        if (need < 20) continue;
        const rise = JUMP_V * k - (G_P * k * k) / 2 + (rnd() * 2 - 1) * L.jerr;
        if (Math.abs(rise - need) < 16) {
          if (rnd() < L.jump) out.jp = true;
          ai.jcd = 24;
          break;
        }
      }
    }
    // 킥 — 공이 발 앞 낮은 곳에 있으면. 우리 골대 가까이면 일단 걷어 낸다
    if (!me.kick && ai.kcd === 0 && rel > 8 && rel < 52 && hgt < 82) {
      const clear = Math.abs(ox - myGoal) < 160;
      const good = rel > 16 && rel < 46;
      if (rnd() < (clear ? 0.6 : good ? L.kick : L.kick * 0.3)) { out.kp = true; ai.kcd = L.kcd || 20; }
    }
    return out;
  }

  // ───────────────────────── 그림 ─────────────────────────
  // 배경(하늘 · 건물 · 옥상 · 철망 · 바닥 · 골대 그물) — 크기가 바뀔 때만 다시 그려 둔다
  function paintBackground(g) {
    // 하늘
    const sky = g.createLinearGradient(0, 0, 0, GROUND);
    sky.addColorStop(0, "#3f9fe8"); sky.addColorStop(0.55, "#8fd0fa"); sky.addColorStop(1, "#e3f5ff");
    g.fillStyle = sky; g.fillRect(0, 0, W, GROUND);
    // 해
    const sun = g.createRadialGradient(838, 74, 8, 838, 74, 120);
    sun.addColorStop(0, "rgba(255,250,214,1)"); sun.addColorStop(0.28, "rgba(255,240,170,.85)"); sun.addColorStop(1, "rgba(255,240,170,0)");
    g.fillStyle = sun; g.beginPath(); g.arc(838, 74, 120, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#fffbe0"; g.beginPath(); g.arc(838, 74, 30, 0, Math.PI * 2); g.fill();
    // 구름
    const cloud = (x, y, s) => {
      g.fillStyle = "rgba(255,255,255,.92)";
      g.beginPath();
      [[0, 0, 22], [24, -10, 26], [52, -2, 22], [74, 6, 16], [-20, 8, 14], [30, 10, 20]].forEach(([dx, dy, r]) => { g.moveTo(x + dx * s + r * s, y + dy * s); g.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2); });
      g.fill();
    };
    cloud(120, 92, 1); cloud(452, 58, 0.8); cloud(640, 128, 0.62); cloud(300, 150, 0.45);
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
        for (let wy = base - h + 8; wy < base - 4; wy += step) for (let wx = x + 5; wx < x + w - 6; wx += 9) g.fillRect(wx, wy, 5, step * 0.45);
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
    // 철망(풋살장 둘레 그물 펜스)
    g.save();
    g.beginPath(); g.rect(0, 150, W, GROUND - 150); g.clip();
    g.strokeStyle = "rgba(31,92,62,.22)"; g.lineWidth = 1.2;
    for (let x = -GROUND; x < W + GROUND; x += 16) {
      g.beginPath(); g.moveTo(x, 150); g.lineTo(x + (GROUND - 150), GROUND); g.stroke();
      g.beginPath(); g.moveTo(x, 150); g.lineTo(x - (GROUND - 150), GROUND); g.stroke();
    }
    g.restore();
    g.fillStyle = "#2f6b4c";
    g.fillRect(0, 146, W, 5);
    for (let x = 90; x < W; x += 156) g.fillRect(x - 2.5, 146, 5, GROUND - 146);
    // 펜스 현수막
    const bx = 372, by = 160, bw = 216, bh = 34;
    g.fillStyle = "rgba(15,23,42,.18)"; g.fillRect(bx + 3, by + 4, bw, bh);
    g.fillStyle = "#fffdf5"; g.fillRect(bx, by, bw, bh);
    g.fillStyle = "#2f6bff"; g.fillRect(bx, by, 8, bh); g.fillStyle = "#ff7a3d"; g.fillRect(bx + bw - 8, by, 8, bh);
    g.fillStyle = "#0f2a4a"; g.font = `900 17px ${FONT}`; g.fillText("점심 헤딩 리그", bx + bw / 2, by + bh / 2 + 1);
    g.fillStyle = "#94a3b8"; [bx + 14, bx + bw - 14].forEach((x) => { g.beginPath(); g.arc(x, by + 6, 2.4, 0, Math.PI * 2); g.fill(); });
    // 바닥(인조 잔디) — 줄무늬 · 선
    const turf = g.createLinearGradient(0, GROUND, 0, H);
    turf.addColorStop(0, "#5cbf5f"); turf.addColorStop(1, "#3c9a45");
    g.fillStyle = turf; g.fillRect(0, GROUND, W, H - GROUND);
    for (let i = 0; i < 12; i++) {
      if (i % 2) continue;
      const x0 = (W / 12) * i, x1 = (W / 12) * (i + 1);
      g.fillStyle = "rgba(255,255,255,.07)";
      g.beginPath(); g.moveTo(x0, GROUND); g.lineTo(x1, GROUND); g.lineTo(lerp(W / 2, x1, 1.18), H); g.lineTo(lerp(W / 2, x0, 1.18), H); g.fill();
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
  function goalX(side, x) { return side === 0 ? x : W - x; }
  // 골대 그물 — shake 는 골이 들어간 뒤 그물이 출렁이는 정도
  function paintNet(g, side, shake) {
    const X = (x) => goalX(side, x);
    const wob = (y) => shake * Math.sin(y * 0.09 + shake * 9) * 3;
    g.save();
    g.beginPath(); g.moveTo(X(4), ROOF_Y); g.lineTo(X(GOAL_W), BAR_Y); g.lineTo(X(GOAL_W), GROUND); g.lineTo(X(4), GROUND); g.closePath();
    g.fillStyle = "rgba(255,255,255,.16)"; g.fill();
    g.clip();
    g.strokeStyle = "rgba(255,255,255,.55)"; g.lineWidth = 1.1;
    for (let y = ROOF_Y - 70; y < GROUND + 10; y += 11) { g.beginPath(); g.moveTo(X(0), y + wob(y)); g.lineTo(X(GOAL_W), y + 22 + wob(y + 22)); g.stroke(); }
    for (let x = 0; x < GOAL_W + 10; x += 11) { g.beginPath(); g.moveTo(X(x) + wob(x * 3), ROOF_Y - 10); g.lineTo(X(x) + wob(x * 3 + 40), GROUND); g.stroke(); }
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
    g.beginPath(); g.moveTo(X(GOAL_W), GROUND); g.lineTo(X(GOAL_W), BAR_Y); g.lineTo(X(GOAL_W - 20), BAR_Y - 6); g.stroke();
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

  function drawBall(g, b, alpha) {
    g.save();
    g.globalAlpha = alpha == null ? 1 : alpha;
    g.translate(b.x, b.y);
    const shade = g.createRadialGradient(-BALL_R * 0.35, -BALL_R * 0.4, 2, 0, 0, BALL_R);
    shade.addColorStop(0, "#ffffff"); shade.addColorStop(1, "#d5dde6");
    g.fillStyle = shade; g.beginPath(); g.arc(0, 0, BALL_R, 0, Math.PI * 2); g.fill();
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
    const level = AI_LEVEL[opts.level] ? opts.level : "normal";
    const minutes = [1, 2, 3].includes(Number(opts.minutes)) ? Number(opts.minutes) : mode === "demo" ? 99 : 2;
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
    if (mode === "demo") { ais[0] = makeAI("normal", seed + 1); ais[1] = makeAI("normal", seed + 2); }

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
      if (mode === "host" && ["kick", "head", "bar", "goal", "whistle", "over"].includes(type)) {
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
        case "kick": snd("hit"); spark(S.ball.x, S.ball.y, 7, "#fde68a"); if (n > 15) shake = Math.max(shake, 3); break;
        case "head": snd("pop"); spark(S.ball.x, S.ball.y + BALL_R, 5, "#ffffff"); break;
        case "bar": snd("drop"); shake = Math.max(shake, 4); break;
        case "thud": snd("tap"); break;
        case "jump": if (human) snd("jump"); break;
        case "goal":
          snd("line"); setTimeout(() => snd(side === mySide || mode === "local" ? "powerup" : "fail"), 260);
          netShake[side === 0 ? 1 : 0] = 1; flash = 1; shake = 8;
          goalFx = { side, t: 0 };
          for (let i = 0; i < 46; i++) confetti(side);
          emit({ type: "goal", side, score: S.score.slice() });
          break;
        case "whistle": snd("go"); meMark = 150; emit({ type: "start" }); break;
        case "over": snd("go"); setTimeout(() => snd("go"), 180); break;
      }
    }
    function spark(x, y, k, col) {
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
      ? { KeyA: [0, "l"], KeyD: [0, "r"], KeyW: [0, "j"], KeyF: [0, "k"], Space: [0, "k"], ArrowLeft: [1, "l"], ArrowRight: [1, "r"], ArrowUp: [1, "j"], Enter: [1, "k"], NumpadEnter: [1, "k"], Slash: [1, "k"] }
      : { ArrowLeft: [mySide, "l"], KeyA: [mySide, "l"], ArrowRight: [mySide, "r"], KeyD: [mySide, "r"], ArrowUp: [mySide, "j"], KeyW: [mySide, "j"], Space: [mySide, "k"], KeyF: [mySide, "k"] };
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
        b: s.b, p: s.p, fz: s.fz | 0, e: evs,
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
        phase: A.phase, pt: A.pt, cd: A.cd, clock: A.clock, score: A.score, fz: A.fz,
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
      S.phase = view.phase; S.pt = view.pt; S.cd = view.cd; S.clock = view.clock; S.score = tainted && tally ? tally.slice() : view.score.slice();
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
        S = Object.assign(newState(R.minutes || minutes), R);
        S.cd = 0;
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
      dpr = Math.min(2, window.devicePixelRatio || 1);
      if (w === cw && h === ch && bg) return;
      cw = w; ch = h;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      scale = canvas.width / W;
      bg = document.createElement("canvas");
      bg.width = canvas.width; bg.height = canvas.height;
      const bgc = bg.getContext("2d");
      bgc.setTransform(scale, 0, 0, canvas.height / H, 0, 0);
      paintBackground(bgc);
    }
    function drawPlayer(p, rp, info, team) {
      const x = rp.x, y = rp.y, f = p.face, side = p.side;
      // 그림자
      const air = clamp((GROUND - y) / 140, 0, 1);
      g.fillStyle = `rgba(15,40,20,${0.28 - air * 0.16})`;
      g.beginPath(); g.ellipse(x, GROUND + 3, 30 - air * 10, 6 - air * 2, 0, 0, Math.PI * 2); g.fill();
      const moving = p.ground && Math.abs(p.vx) > 0.5;
      const swing = moving ? Math.sin(((p.run || 0) + (rp.run || 0)) * 0.16) * 0.6 : 0;
      const kickA = p.kick ? legAngle(p) : p.ground ? swing : 0.5;
      const backA = p.kick ? -0.12 : p.ground ? -swing : -0.25;
      const leg = (hx, a, front) => {
        const fx2 = hx + Math.sin(a) * LEG * f, fy = y - HIP_Y + Math.cos(a) * LEG;
        g.lineCap = "round";
        g.strokeStyle = "#f2c6a2"; g.lineWidth = 9;
        g.beginPath(); g.moveTo(hx, y - HIP_Y); g.lineTo(lerp(hx, fx2, 0.55), lerp(y - HIP_Y, fy, 0.55)); g.stroke();
        g.strokeStyle = front ? team.sock : "#e2e8f0"; g.lineWidth = 9.5;
        g.beginPath(); g.moveTo(lerp(hx, fx2, 0.5), lerp(y - HIP_Y, fy, 0.5)); g.lineTo(fx2, fy); g.stroke();
        g.lineCap = "butt";
        g.save(); g.translate(fx2, fy); g.rotate(f > 0 ? a * 0.6 : -a * 0.6);
        g.fillStyle = front ? "#111827" : "#1f2937";
        g.beginPath(); g.ellipse(f * 5, 2, 10, 6, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = team.main; g.fillRect(f > 0 ? 2 : -8, -1, 6, 2.5);
        g.restore();
      };
      leg(x - 4 * f, backA, false);
      // 몸통(유니폼) · 반바지 · 사원증
      g.fillStyle = team.shorts;
      roundRect(x - 15, y - HIP_Y - 8, 30, 13, 5); g.fill();
      const tg = g.createLinearGradient(x - 16, 0, x + 16, 0);
      tg.addColorStop(0, team.main); tg.addColorStop(1, team.dark);
      g.fillStyle = tg;
      roundRect(x - 16, y - BODY_Y - 18, 32, 30, 9); g.fill();
      g.fillStyle = "rgba(255,255,255,.85)"; g.fillRect(x - 16, y - BODY_Y - 2, 32, 3);
      g.strokeStyle = "#cbd5e1"; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(x - 5 * f, y - BODY_Y - 17); g.lineTo(x + 7 * f, y - BODY_Y + 2); g.lineTo(x + 2 * f, y - BODY_Y - 17); g.stroke();
      g.fillStyle = "#fff"; roundRect(x + 4 * f, y - BODY_Y + 1, 8, 10, 1.5); g.fill();
      g.fillStyle = team.main; g.fillRect(x + 4 * f, y - BODY_Y + 1, 8, 3);
      // 팔
      const armA = moving ? swing * 0.8 : p.ground ? 0.15 : -1.1;
      g.strokeStyle = "#f2c6a2"; g.lineWidth = 7; g.lineCap = "round";
      g.beginPath(); g.moveTo(x - 9 * f, y - BODY_Y - 10); g.lineTo(x - 9 * f - Math.sin(armA) * 13 * f, y - BODY_Y - 10 + Math.cos(armA) * 13); g.stroke();
      g.lineCap = "butt";
      leg(x + 3 * f, kickA, true);
      // 머리 — 사진 · 그린 얼굴 · 첫 글자
      const hx = x, hy = y - HEAD_Y;
      g.fillStyle = "rgba(0,0,0,.14)"; g.beginPath(); g.arc(hx + 2, hy + 3, HEAD_R + 1, 0, Math.PI * 2); g.fill();
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
      for (const s of [0, 1]) paintNet(g, s, netShake[s] > 0.02 ? netShake[s] : 0);
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
      const bh = clamp((GROUND - bpos.y) / 260, 0, 1);
      if (bpos.y > 0) { g.fillStyle = `rgba(15,40,20,${0.26 - bh * 0.18})`; g.beginPath(); g.ellipse(bpos.x, GROUND + 3, 14 - bh * 6, 3.5, 0, 0, Math.PI * 2); g.fill(); }
      const order = S.pl[0].y < S.pl[1].y ? [1, 0] : [0, 1];
      order.forEach((i) => drawPlayer(S.pl[i], lp(i), faces[i], TEAM[i]));
      // 빠른 공 잔상
      const sp = Math.hypot(S.ball.vx, S.ball.vy);
      if (sp > 11) for (let k = 2; k >= 1; k--) drawBall(g, { x: bpos.x - S.ball.vx * k * 0.9, y: bpos.y - S.ball.vy * k * 0.9, rot: bpos.rot }, 0.18 / k);
      drawBall(g, bpos);
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
      // 화면 위로 넘어간 공
      if (bpos.y < -BALL_R) {
        const ay = 8;
        g.fillStyle = "rgba(15,23,42,.55)";
        g.beginPath(); g.moveTo(bpos.x, ay); g.lineTo(bpos.x - 10, ay + 14); g.lineTo(bpos.x + 10, ay + 14); g.fill();
      }
      // 내 선수 표시(경기 시작 · 다시 시작 때)
      if (mode !== "demo" && (S.phase === "wait" || S.phase === "ready" || S.cd > 0 || meMark > 0)) {
        if (mode === "local") { [0, 1].forEach((i) => { const p = lp(i); tagAbove(p.x, p.y - HEAD_Y - HEAD_R - 22, i ? "2P" : "1P", TEAM[i].dark); }); }
        else { const p = lp(mySide); tagAbove(p.x, p.y - HEAD_Y - HEAD_R - 22, "나", TEAM[mySide].dark); }
      }
      // 화면 단위(CSS px)로 — 점수판 · 큰 글씨
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (mode !== "demo") hud();
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
    function hud() {
      const compact = cw < 600;
      const hgt = clamp(Math.round(cw * 0.052), 30, 50);
      const fs = Math.round(hgt * 0.56);
      const nameW = compact ? 0 : clamp(cw * 0.12, 70, 150);
      const scoreW = Math.round(hgt * 1.05), clockW = Math.round(hgt * 1.9), avaR = Math.round(hgt * 0.34);
      const sideW = (compact ? 0 : nameW + 10) + avaR * 2 + 12 + scoreW;
      const total = sideW * 2 + clockW;
      const x0 = Math.round((cw - total) / 2), y0 = Math.round(clamp(ch * 0.02, 6, 14));
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
      start, begin, hold, pause, resume, resync, control, destroy, peerTrouble,
      score: () => ({ left: S.score[0], right: S.score[1], me: S.score[mySide], rival: S.score[1 - mySide] }),
      isOver: () => ended || S.phase === "over",
      phase: () => S.phase,
      exportState: () => (mode === "host" ? JSON.parse(JSON.stringify(S)) : null),
      side: mySide,
    };
    if (/^(localhost|127\.0\.0\.1)$|\.test$/.test(location.hostname)) api._debug = { get S() { return S; }, set S(v) { S = v; }, ctl, holds, get view() { return view; }, own, faces, fx, render, sparks: () => sparks, setPose: (fn) => { fn(S); prev = null; }, get tally() { return tally && { tally: tally.slice(), tainted, tallyEv }; }, remote };
    return api;
  }

  return {
    create,
    // 시험용 — 물리 · 컴퓨터만 따로(화면 없이 판을 돌려 본다)
    _sim: { W, H, GROUND, GOAL_W, BAR_Y, BALL_R, HEAD_R, HEAD_Y, AI_LEVEL, newState, placeKickoff, simStep, makeAI, aiInput, rngOf, goalSide },
  };
})();
