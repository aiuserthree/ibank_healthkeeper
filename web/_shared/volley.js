/**
 * 옥상 배구 — 1:1 배구 엔진 (캔버스 · 60Hz 고정 계산)
 *
 *   const game = HKVolley.create(canvas, opts)
 *     → { start, pause, resume, destroy, score, control, isPaused, isOver, setLink, saveState, debug }
 *
 *   opts.mode    "cpu"(컴퓨터와) | "local"(한 화면 둘이) | "host"(온라인 — 판을 계산하는 쪽) | "guest"(온라인 — 받아서 그리는 쪽)
 *                | "demo"(첫 화면 뒤에서 도는 구경용 — 컴퓨터끼리, 소리 없음)
 *   opts.level   "easy" | "normal" | "hard" — 컴퓨터 실력 (cpu)
 *   opts.target  먼저 이 점수를 내면 이긴다 (7 · 15)
 *   opts.me      { name, avatarUrl } — 나(1P). opts.rival — 상대(컴퓨터 · 2P · 동료)
 *   opts.net     { send(obj), onMessage(fn) } — host · guest 만. obj 는 JSON 으로 바꿀 수 있는 작은 객체
 *   opts.touch   true 면 화면 안내를 터치 버튼 말로 (점프 버튼 등)
 *   opts.firstServe  0(왼쪽) | 1(오른쪽) — 없으면 cpu 는 내가, 나머지는 무작위
 *   opts.onEnd(result)  경기가 끝나면 한 번
 *                       { win, winner(0|1), me, rival, left, right, rally(가장 긴 랠리), spikes:{me, rival}, sec, mode, level, target }
 *   opts.onEvent(e)     { type: "start" | "serve" | "point" | "end" | "lag", ... } — 페이지가 필요하면 쓴다
 *   opts.sfx(name)      효과음 — 기본 HKSound.play (소리 끄기는 공통 버튼이 맡는다)
 *   opts.resume         host 만 — saveState() 로 받아 둔 값. 새로고침한 주인이 그 점수 · 서브부터 이어 간다
 *
 *   control(name, down) — 화면 버튼: "left" "right" "up"(강타 방향 위) "down"(강타 방향 아래) "jump" "dive" "hit"
 *   setLink(kind)       온라인 — 페이지가 아는 연결 상태: "ok" | "away"(상대가 안 보임) | "retry"(다시 연결하는 중).
 *                       ok 가 아니면 host 는 판을 멈추고(공 · 사람 그대로), 돌아오면 1초 뒤 이어 간다
 *   saveState()         host — 이어 하기용 값 { sc, sv, sp, be, ss, sec, tg } (점수 · 서브 · 강타 수 · 가장 긴 랠리 · 경기 시간)
 *
 * 자리: 왼쪽 = 0, 오른쪽 = 1. cpu · local · host 는 나(1P)가 왼쪽. guest 는 오른쪽 사람이지만 화면을 좌우로 뒤집어
 *   나를 왼쪽에 그린다 (조작도 화면 기준).
 *
 * 규칙: 공이 바닥에 닿으면 반대편 1점 · 점수를 내준 쪽이 서브 · 서브는 서버가 공을 건드리면 시작(6초 지나면 저절로 떨어짐) ·
 *   터치 수 제한 없음 · 몸에 닿으면 저절로 받아 올림 · 강타는 0.2초 동안 닿으면 — 높이서(점프 중 그물 위 높이) 치면 내리꽂고
 *   낮게 치면 높이 넘긴다. 강타 때 누른 방향: 상대 쪽(또는 화면 막대 위) 길게 · ↓ 내리꽂기 · 내 쪽 살짝 넘기기
 *   (점프 키 ↑ 는 방향으로 치지 않는다 — 뛰려고 누르고 있어도 기본 강타가 나가게)
 *
 * 온라인: host 가 60Hz 로 판을 계산하고 30Hz 로 상태(snapshot)와 그 사이 사건을 보낸다. guest 는 입력이 바뀔 때(+0.12초마다 다시)
 *   보내고, 받은 상태를 4프레임(약 0.07초) 늦게 보간해 그린다.
 *   guest → host  {t:"hi", d, h, j} 준비됨(대기 상태를 받는 동안 0.5초마다 다시 — d · h · j 는 지금 누른 횟수, 다시 맞추기용)
 *                 {t:"in", k, d, h, j} 입력 · {t:"away"} 화면을 숨김(다른 탭 · 잠금) · {t:"ping", c}
 *                  k 비트: 1 왼 · 2 오 · 4 점프 · 8 위 · 16 아래 (세계 기준 — 뒤집힌 화면이면 좌우를 바꿔 보낸다)
 *                  d · h · j: 다이빙 · 강타 · 점프를 누른 횟수 (짧게 눌러도 빠지지 않게 횟수로 보낸다)
 *   host → guest  {t:"go", e} 시작 · {t:"s", e, f, ph, …, ev:[사건]} 상태 · {t:"hold", e, r} 멈춤 · {t:"pong", c}
 *                  e: 주인 판 번호(엔진을 만들 때마다 새로) — 바뀌면 손님은 받아 둔 상태를 비우고 처음부터 다시 맞춘다
 *                  r: 멈춘 까닭 — "away"(상대가 안 보임) · "retry"(연결 다시) · "slow"(손님 입력이 끊김) · "rest"(주인 화면 숨김) ·
 *                     "resume"(곧 이어 감, 1초)
 *   host 는 손님 입력이 0.8초 넘게 안 오거나 손님이 화면을 숨기면 판을 멈춘다 — 한쪽만 움직이는 일이 없게.
 */
(function () {
  "use strict";

  // ───────── 세계 (논리 좌표 800×450 — 화면 크기에 맞춰 늘려 그린다)
  const W = 800, H = 450, FLOOR = 404, NET_X = 400, NET_TOP = 262, NET_HW = 5;
  const DT = 1 / 60;
  const PR = 26, BR = 19; // 사람 몸(캡슐) · 공 반지름
  const RUN = 330, JUMP_V = 760, P_GRAV = 2300;
  const DIVE_V = 560, DIVE_T = 0.26, DIVE_REC = 0.36;
  const HIT_WIN = 0.2, HIT_COOL = 0.42, SWING_T = 0.3;
  const B_GRAV = 1000, B_MAX = 1250;
  const COUNT_T = 1.8, GO_AT = 1.0, POINT_T = 1.5, SERVE_AUTO = 6, END_T = 1.2;
  const HOLD_Y = FLOOR - 200;
  const START_X = [150, 650];
  const PH = ["wait", "count", "serve", "play", "point", "end"];
  const K_L = 1, K_R = 2, K_JUMP = 4, K_UP = 8, K_DOWN = 16;
  const SNAP_EVERY = 2; // 60Hz 계산 · 30Hz 전송
  const GUEST_DELAY = 4; // guest 가 늦게 그리는 프레임 수

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const r1 = (v) => Math.round(v * 10) / 10;
  const r2 = (v) => Math.round(v * 100) / 100;

  // ───────── 상태
  function newPlayer(side) {
    return {
      side, x: START_X[side], y: FLOOR, vx: 0, vy: 0, ground: 1, face: side ? -1 : 1,
      dive: 0, diveDir: 1, rec: 0, hitT: 0, hitCd: 0, swing: 0, touchCd: 0, land: 0, run: 0, mood: 0,
      seenD: 0, seenH: 0, seenJ: 0,
    };
  }
  function newBall(x) {
    return { x, y: HOLD_Y, vx: 0, vy: 0, rot: 0, held: 1, pow: 0, last: -1 };
  }
  function newState(target, serve, phase) {
    return {
      f: 0, phase, t: 0, target, score: [0, 0], serve, rally: 0, best: 0, spikes: [0, 0], winner: -1, scorer: -1,
      serves: [0, 0], ball: newBall(START_X[serve]), p: [newPlayer(0), newPlayer(1)],
    };
  }
  // 서브 자리 — 서버 쪽 위에 공을 띄우고 둘 다 제자리로
  function placeServe(S) {
    S.p.forEach((p, i) => { S.p[i] = Object.assign(newPlayer(i), { seenD: p.seenD, seenH: p.seenH, seenJ: p.seenJ }); });
    S.ball = newBall(START_X[S.serve]);
    S.rally = 0;
  }

  // ───────── 공
  function stepBall(b, ev, rest) {
    if (b.held) return;
    b.vy += B_GRAV * DT;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > B_MAX) { b.vx *= B_MAX / sp; b.vy *= B_MAX / sp; }
    b.x += b.vx * DT;
    b.y += b.vy * DT;
    b.rot += (b.vx * DT) / BR;
    if (b.pow > 0) b.pow -= DT;
    // 옆 울타리
    if (b.x < BR) {
      b.x = BR;
      if (ev && Math.abs(b.vx) > 60) ev.push({ k: "wall", x: 0, y: b.y });
      b.vx = Math.abs(b.vx) * 0.92;
    } else if (b.x > W - BR) {
      b.x = W - BR;
      if (ev && Math.abs(b.vx) > 60) ev.push({ k: "wall", x: W, y: b.y });
      b.vx = -Math.abs(b.vx) * 0.92;
    }
    // 그물 — 위 끝이 둥근 기둥(바닥까지)
    const cy = clamp(b.y, NET_TOP, FLOOR);
    const dx = b.x - NET_X, dy = b.y - cy, d = Math.hypot(dx, dy), rr = BR + NET_HW;
    if (d < rr) {
      const nx = d > 0.001 ? dx / d : b.vx > 0 ? -1 : 1, ny = d > 0.001 ? dy / d : 0;
      b.x = NET_X + nx * rr;
      b.y = cy + ny * rr;
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) { b.vx -= 1.68 * vn * nx; b.vy -= 1.68 * vn * ny; }
      // 그물 꼭대기에 얹혀 멈추지 않게 살짝 민다
      if (ny < -0.5 && Math.abs(b.vx) < 30) b.vx += (b.x >= NET_X ? 1 : -1) * 50;
      if (ev && Math.abs(vn) > 60) ev.push({ k: "net", x: b.x, y: b.y, hard: Math.abs(vn) > 300 ? 1 : 0 });
    }
    if (rest && b.y + BR > FLOOR) {
      b.y = FLOOR - BR;
      b.vy = Math.abs(b.vy) > 90 ? -Math.abs(b.vy) * 0.42 : 0;
      b.vx *= 0.82;
    }
    if (rest && b.vy === 0) b.vx *= 0.95;
  }

  // 컴퓨터가 공이 갈 길을 미리 본다 (사람은 빼고 같은 계산)
  function predict(b0, steps) {
    const b = { ...b0, held: 0 };
    const path = [];
    if (b0.held) { for (let i = 0; i < steps; i++) path.push(b0.x, b0.y); return path; }
    for (let i = 0; i < steps; i++) {
      stepBall(b, null);
      path.push(b.x, b.y);
      if (b.y + BR >= FLOOR) break;
    }
    return path;
  }

  // ───────── 사람
  function capsuleOf(p) {
    if (p.dive > 0 || p.rec > 0) return [p.x - 22, p.y - 20, p.x + 22, p.y - 20, 20];
    return [p.x, p.y - 28, p.x, p.y - 56, PR];
  }
  function stepPlayer(S, p, ip, ev) {
    const toNet = p.side ? -1 : 1;
    if (p.touchCd > 0) p.touchCd -= DT;
    if (p.hitT > 0) p.hitT -= DT;
    if (p.hitCd > 0) p.hitCd -= DT;
    if (p.swing > 0) p.swing -= DT;
    if (p.land > 0) p.land -= DT;
    let diveP = false, hitP = false, dir = 0, up = false;
    if (ip) {
      diveP = ip.d !== p.seenD;
      hitP = ip.h !== p.seenH;
      const jumpP = (ip.j | 0) !== p.seenJ; // 아주 짧게 톡 눌러도 뛰게 — 누른 횟수로도 본다
      p.seenD = ip.d;
      p.seenH = ip.h;
      p.seenJ = ip.j | 0;
      dir = (ip.k & K_R ? 1 : 0) - (ip.k & K_L ? 1 : 0);
      up = !!(ip.k & K_JUMP) || jumpP;
    }
    if (p.dive > 0) {
      p.dive -= DT;
      p.vx = p.diveDir * DIVE_V;
      if (p.dive <= 0) p.rec = DIVE_REC;
    } else if (p.rec > 0) {
      p.rec -= DT;
      p.vx *= 0.8;
    } else if (!ip) {
      // 득점 뒤 · 경기 끝 — 손을 놓는다. 점수를 낸 쪽은 제자리에서 폴짝
      p.vx = 0;
      p.face = toNet;
      if (p.mood > 0 && p.ground && S.t > 0.1 && S.t < (S.phase === "end" ? 9 : 1.0)) { p.vy = -520; p.ground = 0; }
    } else {
      p.vx = dir * RUN;
      p.face = dir || toNet; // 서 있을 땐 그물 쪽을 본다
      if (p.ground) {
        if (diveP) {
          p.dive = DIVE_T;
          p.diveDir = dir || toNet;
          p.face = p.diveDir;
          p.vx = p.diveDir * DIVE_V;
          ev.push({ k: "dive", s: p.side, x: p.x, y: p.y });
        } else if (up) {
          p.vy = -JUMP_V;
          p.ground = 0;
          ev.push({ k: "jump", s: p.side, x: p.x, y: p.y });
        }
      }
      if (hitP && p.hitCd <= 0 && p.dive <= 0) {
        p.hitT = HIT_WIN;
        p.hitCd = HIT_COOL;
        p.swing = SWING_T;
        ev.push({ k: "swing", s: p.side });
      }
    }
    if (!p.ground) {
      p.vy += P_GRAV * DT;
      p.y += p.vy * DT;
      if (p.y >= FLOOR) {
        p.y = FLOOR; p.vy = 0; p.ground = 1; p.land = 0.12;
        ev.push({ k: "land", s: p.side, x: p.x, y: FLOOR });
      }
    }
    p.x += p.vx * DT;
    const lo = p.side ? NET_X + NET_HW + PR : PR + 4;
    const hi = p.side ? W - PR - 4 : NET_X - NET_HW - PR;
    if (p.x < lo) p.x = lo;
    if (p.x > hi) p.x = hi;
    if (p.ground && Math.abs(p.vx) > 1 && p.dive <= 0 && p.rec <= 0) p.run += DT * 13;
  }

  // 공이 몸에 닿았나 — 닿으면 저절로 받거나(리시브) 강타
  function touch(S, p, ip, ev) {
    const b = S.ball;
    if (p.touchCd > 0) return;
    const [ax, ay, bx, by, r] = capsuleOf(p);
    const sx = bx - ax, sy = by - ay, len2 = sx * sx + sy * sy;
    const u = len2 ? clamp(((b.x - ax) * sx + (b.y - ay) * sy) / len2, 0, 1) : 0;
    const cx = ax + sx * u, cy = ay + sy * u;
    const dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy);
    const reach = r + BR + (p.hitT > 0 ? 10 : 0); // 휘두르는 팔만큼 조금 더 닿는다
    if (d >= reach) return;
    const nx = d > 0.001 ? dx / d : 0, ny = d > 0.001 ? dy / d : -1;
    if (d < r + BR) { b.x = cx + nx * (r + BR); b.y = cy + ny * (r + BR); }
    p.touchCd = 0.12;
    const inSp = Math.hypot(b.vx, b.vy); // 날아온 공 빠르기
    const serving = !!b.held; // 서브 첫 터치
    if (b.held) { b.held = 0; S.phase = "play"; S.t = 0; S.serves[p.side]++; }
    const toOpp = p.side ? -1 : 1;
    S.rally++;
    b.last = p.side;
    if (p.hitT > 0) {
      p.hitT = 0;
      const k = ip ? ip.k : 0;
      const hold = (k & K_R ? 1 : 0) - (k & K_L ? 1 : 0);
      const fwd = hold === toOpp, back = hold === -toOpp, upk = !!(k & K_UP), dnk = !!(k & K_DOWN);
      const high = !p.ground && b.y < NET_TOP + 24;
      let vx, vy, kind;
      if (high) {
        kind = "spike";
        if (back) { vx = 240; vy = -140; kind = "feint"; } // 살짝 넘기기
        else if (dnk) { vx = 780; vy = 620; } // 내리꽂기
        else if (fwd || upk) { vx = 1060; vy = -30; } // 길게 (낮고 곧게 뒤쪽까지)
        else { vx = 980; vy = 330; }
        // 그물에서 멀리서 때리면 그물을 넘을 만큼 저절로 눕힌다 (뒤에서 때려도 넘어가게)
        const dist = Math.abs(NET_X - b.x), clear = NET_TOP - BR - 8 - b.y;
        if (kind === "spike" && dist > 30) {
          const tt = dist / vx, maxVy = (clear - (B_GRAV / 2) * tt * tt) / tt;
          if (vy > maxVy) vy = Math.max(maxVy, -260);
        }
      } else {
        kind = "loft"; // 낮게 치면 높이 넘긴다
        if (back) { vx = 250; vy = -860; }
        else if (fwd) { vx = 470; vy = -690; }
        else { vx = 360; vy = -740; }
      }
      b.vx = vx * toOpp;
      b.vy = vy;
      b.pow = kind === "spike" ? 0.7 : 0;
      if (kind === "spike") S.spikes[p.side]++; // 결과의 「강타」는 내리꽂은 것만 센다 (높이 넘기기 · 살짝 넘기기 빼고)
      ev.push({ k: "power", s: p.side, x: b.x, y: b.y, kind, r: S.rally });
    } else {
      const ddx = b.x - p.x;
      const dig = p.dive > 0 || p.rec > 0;
      if (dig) {
        b.vx = clamp(toOpp * 110 + ddx * 3, -300, 300);
        b.vy = -680;
      } else if (ny > 0.6 && !p.ground) {
        // 공이 몸 아래에 깔림 — 아래로 눌린다
        b.vx = clamp(ddx * 6, -380, 380);
        b.vy = Math.max(Math.abs(b.vy) * 0.5, 240);
      } else {
        b.vx = clamp(ddx * 7 + p.vx * 0.2 + toOpp * 45, -430, 430);
        b.vy = p.ground ? -560 : Math.max(-820, Math.min(-600, p.vy - 200));
        // 강타처럼 빠른 공은 받아도 손이 밀린다 — 덜 높고 옆으로 튄다
        if (inSp > 760 && p.ground) {
          const k2 = clamp((inSp - 760) / 400, 0, 1);
          b.vy = lerp(b.vy, -430, k2);
          b.vx = clamp(b.vx * (1 + k2 * 0.8) + (S.f % 2 ? 1 : -1) * 70 * k2, -480, 480);
        }
        // 서브는 공 밑에서 뛰어 치기만 해도 그물을 넘어가게 — 상대 쪽으로 넉넉히 민다
        if (serving) {
          b.vx = toOpp * clamp(toOpp * b.vx, 230, 430);
          b.vy = Math.min(b.vy, -640);
        }
      }
      b.pow = 0;
      ev.push({ k: "bump", s: p.side, x: b.x, y: b.y, dig: dig ? 1 : 0, r: S.rally });
    }
  }

  // 한 프레임 (1/60초)
  function step(S, inp, ev) {
    S.f++;
    S.t += DT;
    const b = S.ball;
    if (S.phase === "wait") return;
    if (S.phase === "count") {
      S.p.forEach((p, i) => { p.seenD = inp[i].d; p.seenH = inp[i].h; p.seenJ = inp[i].j | 0; }); // 기다리는 동안 누른 건 버린다
      if (S.t - DT < GO_AT && S.t >= GO_AT) ev.push({ k: "go" });
      if (S.t >= COUNT_T) { S.phase = "serve"; S.t = 0; ev.push({ k: "serve", s: S.serve }); }
      return;
    }
    const live = S.phase === "serve" || S.phase === "play";
    // 득점 뒤 쉬는 동안 · 끝난 뒤에 누른 것도 버린다 (다음 서브 첫 프레임에 저절로 나가지 않게)
    if (!live) S.p.forEach((p, i) => { p.seenD = inp[i].d; p.seenH = inp[i].h; p.seenJ = inp[i].j | 0; });
    for (let i = 0; i < 2; i++) stepPlayer(S, S.p[i], live ? inp[i] : null, ev);
    if (live) {
      if (S.phase === "serve" && S.t >= SERVE_AUTO) { b.held = 0; S.phase = "play"; S.t = 0; } // 너무 오래 안 치면 저절로 떨어진다
      stepBall(b, ev);
      for (let i = 0; i < 2; i++) touch(S, S.p[i], inp[i], ev);
      if (!b.held && b.y + BR >= FLOOR) {
        const scorer = b.x < NET_X ? 1 : 0;
        S.score[scorer]++;
        S.scorer = scorer;
        S.serve = 1 - scorer; // 점수를 내준 쪽이 서브
        S.best = Math.max(S.best, S.rally);
        S.phase = "point";
        S.t = 0;
        b.y = FLOOR - BR;
        ev.push({ k: "point", s: scorer, x: b.x, y: FLOOR, sp: Math.hypot(b.vx, b.vy) | 0, r: S.rally });
        b.vy = -Math.abs(b.vy) * 0.42;
        b.vx *= 0.7;
        S.p[scorer].mood = 1;
        S.p[1 - scorer].mood = -1;
      }
    } else if (S.phase === "point") {
      stepBall(b, ev, true);
      if (S.t >= POINT_T) {
        if (S.score[S.scorer] >= S.target) {
          S.phase = "end"; S.t = 0; S.winner = S.scorer;
          ev.push({ k: "end", s: S.winner });
        } else {
          S.phase = "serve"; S.t = 0;
          placeServe(S);
          ev.push({ k: "serve", s: S.serve });
        }
      }
    } else if (S.phase === "end") {
      stepBall(b, ev, true);
    }
  }

  // ───────── 컴퓨터 — 사람과 같은 입력(방향 · 점프 · 다이빙 · 강타)만 쓴다
  const AI_LEVEL = {
    easy: { set: 0.1, react: 0.3, fast: 0.14, err: 34, dead: 12, move: 0.8, spike: 0.16, dive: 0, serve: 0, mods: 0.15, reach: 18, wait: [0.9, 1.6] },
    normal: { set: 0.45, react: 0.17, fast: 0.08, err: 15, dead: 7, move: 0.93, spike: 0.48, dive: 0.4, serve: 0.25, mods: 0.5, reach: 10, wait: [0.6, 1.2] },
    hard: { set: 0.7, react: 0.12, fast: 0.08, err: 9, dead: 4, move: 1, spike: 0.72, dive: 0.75, serve: 0.5, mods: 0.75, reach: 6, wait: [0.45, 0.9] },
  };
  function makeAI(side, levelKey) {
    const L = AI_LEVEL[levelKey] || AI_LEVEL.normal;
    const toNet = side ? -1 : 1, home = side ? 600 : 200;
    const fwdBit = toNet > 0 ? K_R : K_L, backBit = toNet > 0 ? K_L : K_R;
    const out = { k: 0, d: 0, h: 0 };
    const rnd = (a, b) => a + Math.random() * (b - a);
    let seenRally = -1, planF = -1, path = null, pathF = 0, target = home, onMine = false;
    let wantSpike = false, wantDive = false, contactT = 0, hitDone = false, modBits = 0, modT = 0, moveAcc = 0;
    let serveKey = -1, serveAt = 0, serveSpike = false, serveOff = 0;
    let fastIn = false; // 상대가 세게 친 공 — 늦게 보고 덜 정확하게
    let setting = false; // 방금 토스했다 — 다음엔 때린다
    function plan(S) {
      path = predict(S.ball, 200);
      pathF = S.f;
      const n = path.length / 2;
      let ci = -1;
      for (let i = 1; i < n; i++) {
        const y = path[i * 2 + 1];
        if (y > path[i * 2 - 1] && y >= FLOOR - 100) { ci = i; break; }
      }
      if (ci < 0) ci = n - 1;
      const cx = path[ci * 2];
      contactT = ci * DT;
      onMine = side ? cx > NET_X : cx < NET_X;
      const err = L.err * (fastIn ? 1.7 : 1);
      wantSpike = setting || Math.random() < L.spike;
      wantDive = Math.random() < L.dive;
      setting = false;
      if (!onMine) target = home + rnd(-25, 25);
      else if (wantSpike && Math.abs(cx - NET_X) > 150 && Math.random() < L.set) {
        // 먼저 그물 앞으로 올려 놓고(토스) 다음에 뛰어 때린다
        const setX = NET_X - toNet * rnd(90, 130);
        const ddx = clamp(((setX - cx) / 1.1 - toNet * 45) / 7, -34, 34);
        target = cx - ddx + rnd(-err, err) * 0.6;
        setting = true;
      } else target = cx - toNet * rnd(10, 30) + rnd(-err, err);
    }
    function moveTo(me, tx, dead) {
      const diff = tx - me.x;
      if (Math.abs(diff) <= dead) return 0;
      moveAcc += L.move;
      if (moveAcc < 1) return 0;
      moveAcc -= 1;
      return diff > 0 ? K_R : K_L;
    }
    function think(S) {
      const me = S.p[side], foe = S.p[1 - side], b = S.ball;
      let k = 0;
      if (me.ground) hitDone = false;
      // 랠리 밖(서브 대기 · 득점 · 끝)에서는 「본 랠리」를 잊는다 — 새 랠리의 첫 터치에도 늘 반응하게
      if (S.phase !== "play") { seenRally = -1; planF = -1; path = null; }
      if (S.phase === "serve") {
        if (S.serve === side) {
          const key = S.score[0] * 100 + S.score[1];
          if (serveKey !== key) {
            serveKey = key;
            serveAt = rnd(L.wait[0], L.wait[1]);
            serveSpike = Math.random() < L.serve;
            serveOff = serveSpike ? rnd(2, 8) : rnd(18, 30);
          }
          const tx = b.x - toNet * serveOff;
          k |= moveTo(me, tx, 3);
          if (S.t > serveAt && Math.abs(me.x - tx) < 8 && me.ground) k |= K_JUMP;
          if (serveSpike && !me.ground && !hitDone && me.vy > -420 && Math.hypot(b.x - me.x, b.y - (me.y - 56)) < 66) {
            out.h++; hitDone = true; modBits = fwdBit; modT = HIT_WIN;
          }
        } else k |= moveTo(me, home, 10);
      } else if (S.phase === "play") {
        if (S.rally !== seenRally) {
          seenRally = S.rally;
          fastIn = S.ball.last !== side && Math.hypot(S.ball.vx, S.ball.vy) > 700;
          planF = S.f + Math.round((L.react + (fastIn ? L.fast : 0)) / DT);
        }
        if (planF >= 0 && S.f >= planF) { planF = -1; plan(S); }
        if (me.dive <= 0 && me.rec <= 0) k |= moveTo(me, target, L.dead);
        if (path) {
          const cur = S.f - pathF;
          // 지금 뛰면 0.3초 뒤 손이 닿는 곳에 공이 오는지 — 그물 가까이 높은 공이면 뛰어서 강타
          if (wantSpike && onMine && me.ground && me.dive <= 0 && me.rec <= 0) {
            const j = cur + 18;
            if (j * 2 + 1 < path.length) {
              const bx = path[j * 2], by = path[j * 2 + 1];
              if (Math.abs(bx - NET_X) < 210 && by > FLOOR - 235 && by < FLOOR - 150 && Math.abs(bx - me.x) < 30 + L.reach) k |= K_JUMP;
            }
          }
          // 몸을 날려 받기
          if (wantDive && onMine && me.ground && me.dive <= 0 && me.rec <= 0) {
            const left = contactT - cur * DT, dist = target - me.x;
            if (left > 0.05 && left < 0.4 && Math.abs(dist) > RUN * left + 12 && Math.abs(dist) < 200) {
              out.d++;
              wantDive = false;
              k = (k & ~(K_L | K_R)) | (dist > 0 ? K_R : K_L);
            }
          }
        }
        if (!me.ground && wantSpike && !hitDone && (side ? b.x > NET_X : b.x < NET_X) && Math.hypot(b.x - me.x, b.y - (me.y - 56)) < 60) {
          out.h++; hitDone = true;
          modBits = 0;
          const far = Math.abs(me.x - NET_X) > 150, foeBack = Math.abs(foe.x - NET_X) > 190;
          if (Math.random() < L.mods) {
            if (far) modBits = fwdBit;
            else if (foeBack) modBits = Math.random() < 0.45 ? backBit : K_DOWN;
            else modBits = Math.random() < 0.6 ? fwdBit : 0;
          } else if (far && Math.random() < 0.5) modBits = fwdBit;
          modT = HIT_WIN;
        }
      } else {
        serveKey = -1;
      }
      if (modT > 0) { modT -= DT; if (modBits & (K_L | K_R)) k &= ~(K_L | K_R); k |= modBits; }
      out.k = k;
      return out;
    }
    return { think };
  }

  // ───────── 그림 — 배경 · 사람 · 공
  const LOOKS = [
    { shirt: "#2f6bff", dark: "#1d4ed8", light: "#7aa3ff", shorts: "#1e293b", hair: "#1f2937", band: "#ffffff", skin: "#ffd6b3", shoe: "#ffffff", sole: "#1e3a8a", lanyard: "#1d4ed8", style: 0 },
    { shirt: "#ff7a3d", dark: "#e85d1c", light: "#ffb48a", shorts: "#3f3f46", hair: "#7a4527", band: "#ffd23f", skin: "#ffdcc2", shoe: "#ffffff", sole: "#9a3412", lanyard: "#c2410c", style: 1 },
  ];
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

  function paintSky(g) {
    const sky = g.createLinearGradient(0, -120, 0, FLOOR);
    sky.addColorStop(0, "#4aa8ec");
    sky.addColorStop(0.55, "#9fd7fb");
    sky.addColorStop(1, "#e6f6ff");
    g.fillStyle = sky;
    g.fillRect(-400, -400, W + 800, FLOOR + 400);
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

  function paintScene(g, font) {
    const rnd = seeded(20261104);
    // 먼 빌딩 숲
    const far = (y0, color, minH, maxH, winColor) => {
      let x = -20;
      while (x < W + 20) {
        const w = 34 + rnd() * 58, h = minH + rnd() * (maxH - minH);
        g.fillStyle = color;
        g.fillRect(x, y0 - h, w, h + 2);
        if (rnd() < 0.25) { g.fillRect(x + w * 0.45, y0 - h - 14, 2, 14); } // 안테나
        if (winColor) {
          g.fillStyle = winColor;
          for (let wy = y0 - h + 8; wy < y0 - 8; wy += 11) for (let wx = x + 6; wx < x + w - 8; wx += 10) if (rnd() < 0.82) g.fillRect(wx, wy, 5, 6);
        }
        x += w + 2 + rnd() * 10;
      }
    };
    far(FLOOR - 92, "#b7d3ea", 70, 200, null);
    far(FLOOR - 92, "#8fb3d3", 40, 130, "rgba(225,240,252,.55)");
    // 옥상 물탱크 (울타리 뒤)
    g.fillStyle = "#7d8fa3";
    [62, 92, 122].forEach((x) => g.fillRect(x, FLOOR - 128, 5, 92));
    g.fillStyle = "#cfe0ec";
    rr(g, 46, FLOOR - 212, 96, 90, 12); g.fill();
    g.fillStyle = "#b5cad9";
    g.fillRect(46, FLOOR - 184, 96, 5);
    g.fillRect(46, FLOOR - 154, 96, 5);
    g.fillStyle = "#e4eef5";
    rr(g, 52, FLOOR - 220, 84, 14, 7); g.fill();
    g.fillStyle = "#5c7a96";
    g.font = `800 13px ${font}`;
    g.textAlign = "center";
    g.fillText("H2O", 94, FLOOR - 160);
    // 낮은 담 (난간)
    g.fillStyle = "#dcd7ce";
    g.fillRect(0, FLOOR - 40, W, 40);
    g.fillStyle = "#efebe4";
    g.fillRect(0, FLOOR - 44, W, 7);
    g.fillStyle = "rgba(120,110,95,.18)";
    for (let x = 96; x < W; x += 120) g.fillRect(x, FLOOR - 37, 2, 37);
    // 초록 안전 울타리
    const top = FLOOR - 138, bot = FLOOR - 44;
    g.save();
    g.beginPath(); g.rect(0, top, W, bot - top); g.clip();
    g.strokeStyle = "rgba(46,125,90,.30)";
    g.lineWidth = 1.2;
    for (let x = -120; x < W + 120; x += 14) {
      g.beginPath(); g.moveTo(x, top); g.lineTo(x + (bot - top), bot); g.stroke();
      g.beginPath(); g.moveTo(x, top); g.lineTo(x - (bot - top), bot); g.stroke();
    }
    g.restore();
    g.fillStyle = "#3e8c66";
    for (let x = 4; x < W; x += 99) g.fillRect(x, top - 4, 6, bot - top + 4);
    g.fillRect(0, top - 4, W, 5);
    // 울타리 줄 깃발
    const flags = ["#ff7a3d", "#ffd23f", "#2f6bff", "#22c55e", "#ec4899"];
    for (let x0 = 7; x0 < W - 20; x0 += 99) {
      const x1 = Math.min(W - 4, x0 + 99);
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
    rr(g, 214, FLOOR - 120, 104, 30, 5); g.fill();
    g.strokeStyle = "#3e8c66"; g.lineWidth = 2; g.stroke();
    g.fillStyle = "#2f6d50";
    g.font = `800 12px ${font}`;
    g.fillText("옥상 배구장", 266, FLOOR - 104);
    g.font = `600 9px ${font}`;
    g.fillStyle = "#64748b";
    g.fillText("공은 쓰고 제자리에", 266, FLOOR - 94);
    // 실외기
    const unit = (x, y) => {
      g.fillStyle = "#e7ebef"; rr(g, x, y, 64, 44, 4); g.fill();
      g.strokeStyle = "#b6bec8"; g.lineWidth = 1.5; g.stroke();
      g.fillStyle = "#c9d1da"; g.beginPath(); g.arc(x + 24, y + 22, 15, 0, 7); g.fill();
      g.strokeStyle = "#9aa6b3"; g.lineWidth = 1;
      for (let a = 0; a < 3; a++) { g.beginPath(); g.arc(x + 24, y + 22, 5 + a * 4.5, 0, 7); g.stroke(); }
      g.fillStyle = "#b6bec8"; for (let i = 0; i < 4; i++) g.fillRect(x + 46, y + 9 + i * 7, 12, 3);
    };
    unit(722, FLOOR - 46);
    unit(652, FLOOR - 40);
    // 화분
    const pot = (x, s) => {
      g.fillStyle = "#2f8f5b";
      for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(x + (i - 2) * 6 * s, FLOOR - 32 * s - Math.abs(i - 2) * -3 * s, 7 * s, 16 * s, (i - 2) * 0.38, 0, 7); g.fill(); }
      g.fillStyle = "#48b77a";
      for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(x + (i - 1) * 7 * s, FLOOR - 36 * s, 5 * s, 12 * s, (i - 1) * 0.5, 0, 7); g.fill(); }
      g.fillStyle = "#c2703d"; rr(g, x - 13 * s, FLOOR - 22 * s, 26 * s, 22 * s, 4 * s); g.fill();
      g.fillStyle = "#a95d2f"; g.fillRect(x - 14 * s, FLOOR - 22 * s, 28 * s, 5 * s);
    };
    pot(24, 1);
    pot(590, 0.8);
    // 코트 바닥 (우레탄)
    g.fillStyle = "#4bae78";
    g.fillRect(-400, FLOOR, W + 800, 16);
    g.fillStyle = "#7fd3a3";
    g.fillRect(-400, FLOOR, W + 800, 2);
    g.fillStyle = "rgba(255,255,255,.9)";
    g.fillRect(14, FLOOR + 7, W - 28, 2.5);
    g.fillStyle = "#2f855a";
    g.fillRect(-400, FLOOR + 16, W + 800, H - FLOOR + 200);
    g.fillStyle = "rgba(0,0,0,.08)";
    for (let x = 0; x < W; x += 40) g.fillRect(x, FLOOR + 16, 20, H - FLOOR);
    g.fillStyle = "rgba(0,0,0,.12)";
    g.fillRect(-400, FLOOR + 16, W + 800, 3);
  }

  function drawNet(g, wob) {
    // 받침
    g.fillStyle = "#475569";
    rr(g, NET_X - 15, FLOOR - 8, 30, 10, 3); g.fill();
    // 기둥
    const pole = g.createLinearGradient(NET_X - 4, 0, NET_X + 4, 0);
    pole.addColorStop(0, "#94a3b8"); pole.addColorStop(0.5, "#e2e8f0"); pole.addColorStop(1, "#64748b");
    g.fillStyle = pole;
    g.fillRect(NET_X - 4, NET_TOP - 2, 8, FLOOR - NET_TOP);
    // 그물 (위쪽 띠)
    const sx = Math.sin(wob * 40) * wob * 6;
    g.save();
    g.translate(sx, 0);
    g.fillStyle = "rgba(15,23,42,.18)";
    g.fillRect(NET_X - 7, NET_TOP + 4, 14, 84);
    g.strokeStyle = "rgba(15,23,42,.55)";
    g.lineWidth = 1;
    for (let y = NET_TOP + 4; y <= NET_TOP + 88; y += 7) { g.beginPath(); g.moveTo(NET_X - 7, y); g.lineTo(NET_X + 7, y); g.stroke(); }
    for (let x = NET_X - 7; x <= NET_X + 7; x += 7) { g.beginPath(); g.moveTo(x, NET_TOP + 4); g.lineTo(x, NET_TOP + 88); g.stroke(); }
    g.fillStyle = "#ffffff";
    g.fillRect(NET_X - 8, NET_TOP - 1, 16, 6);
    g.fillRect(NET_X - 8, NET_TOP + 86, 16, 3);
    g.restore();
    // 안테나 (빨강 · 하양)
    for (let i = 0; i < 5; i++) {
      g.fillStyle = i % 2 ? "#ffffff" : "#ef4444";
      g.fillRect(NET_X - 2, NET_TOP - 48 + i * 9.6, 4, 9.6);
    }
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
    const air = !p.ground && !lying;
    const runA = p.ground && !lying && Math.abs(p.vx) > 5 ? Math.sin(p.run) : 0;
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
    g.fillStyle = L.band;
    g.beginPath(); g.moveTo(hx - hr - 2, hy - 13); g.lineTo(hx + hr + 2, hy - 15); g.lineTo(hx + hr + 2, hy - 9); g.lineTo(hx - hr - 2, hy - 7); g.closePath(); g.fill();
    g.restore();
    // 머리띠 끈 (뒤로 날림)
    g.fillStyle = L.band;
    const flap = Math.sin(time * 9 + p.side) * 2 + (Math.abs(p.vx) > 5 ? 3 : 0);
    g.beginPath(); g.moveTo(hx - hr + 1, hy - 11); g.lineTo(hx - hr - 11, hy - 15 - flap); g.lineTo(hx - hr - 9, hy - 8 - flap * 0.5); g.closePath(); g.fill();
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
    // 앞팔 + 휘두르는 자국
    const [ahx, ahy] = arm(8, -39, front, flen);
    if (sw >= 0 && sw < 0.75) {
      const e = 1 - Math.pow(1 - sw, 3), a1 = lerp(-2.15, 0.95, e);
      g.strokeStyle = p.hitT > 0 ? "rgba(255,214,64,.9)" : "rgba(255,255,255,.8)";
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
    const level = AI_LEVEL[opts.level] ? opts.level : "normal";
    const target = Math.max(1, Math.min(99, Number(opts.target) || 7));
    const mySide = mode === "guest" ? 1 : 0;
    const mirror = mode === "guest";
    const touchUI = !!opts.touch;
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

    // 상태 — guest 는 받은 상태를 여기에 풀어 놓고 그린다
    const firstServe = opts.firstServe === 0 || opts.firstServe === 1 ? opts.firstServe : mode === "cpu" ? 0 : Math.random() < 0.5 ? 0 : 1;
    let S = newState(target, firstServe, mode === "host" || mode === "guest" ? "wait" : "count");
    // 새로고침한 주인 — 받아 둔 점수 · 서브부터 (값이 이상하면 처음부터)
    const rs = mode === "host" && opts.resume && typeof opts.resume === "object" ? opts.resume : null;
    const okInt = (v, hi) => Number.isInteger(v) && v >= 0 && v <= hi;
    const pair = (a, hi) => Array.isArray(a) && a.length === 2 && okInt(a[0], hi) && okInt(a[1], hi);
    if (rs && rs.tg === target && pair(rs.sc, target - 1) && (rs.sv === 0 || rs.sv === 1) && pair(rs.sp, 9999) && pair(rs.ss, 9999) && okInt(rs.be, 9999) && rs.sec >= 0 && rs.sec < 7200) {
      S = newState(target, rs.sv, "wait");
      S.score = rs.sc.slice(); S.spikes = rs.sp.slice(); S.serves = rs.ss.slice(); S.best = rs.be;
      S.f = Math.round(rs.sec / DT);
    }
    const ai = [null, null];
    if (mode === "cpu") ai[1] = makeAI(1, level);
    if (mode === "demo") { ai[0] = makeAI(0, "hard"); ai[1] = makeAI(1, "normal"); }

    // 그리기 상태
    const g = canvas.getContext("2d");
    let cssW = 0, cssH = 0, dpr = 1, scale = 1, ox = 0, oy = 0;
    let bgSky = null, bgScene = null;
    let raf = 0, lastTs = 0, acc = 0, started = false, paused = false, destroyed = false, ended = false;
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
    const KEYS_SOLO = { left: ["ArrowLeft", "KeyA"], right: ["ArrowRight", "KeyD"], up: ["ArrowUp", "KeyW"], down: ["ArrowDown", "KeyS"], hit: ["Space", "KeyZ", "KeyX", "KeyF", "KeyJ", "Enter", "NumpadEnter"] };
    const KEYS_1P = { left: ["KeyA"], right: ["KeyD"], up: ["KeyW"], down: ["KeyS"], hit: ["Space", "KeyF", "KeyG", "KeyZ"] };
    const KEYS_2P = { left: ["ArrowLeft"], right: ["ArrowRight"], up: ["ArrowUp"], down: ["ArrowDown"], hit: ["Enter", "NumpadEnter", "Slash", "ShiftRight", "Numpad0", "Period"] };
    const keymaps = mode === "demo" ? [] : mode === "local" ? [[0, KEYS_1P], [1, KEYS_2P]] : [[mySide, KEYS_SOLO]];
    const pads = [0, 1].map(() => ({ codes: new Set(), d: 0, h: 0, j: 0, t: { left: 0, right: 0, up: 0, down: 0, jump: 0 } }));
    const padOut = [{ k: 0, d: 0, h: 0, j: 0 }, { k: 0, d: 0, h: 0, j: 0 }];
    function padBits(slot) {
      const pd = pads[slot], map = keymaps.find((m) => m[0] === slot);
      const has = (act) => !!(map && map[1][act].some((c) => pd.codes.has(c)));
      let k = 0;
      if (has("left") || pd.t.left) k |= K_L;
      if (has("right") || pd.t.right) k |= K_R;
      if (has("up")) k |= K_JUMP;
      if (pd.t.jump) k |= K_JUMP;
      if (pd.t.up) k |= K_UP;
      if (has("down") || pd.t.down) k |= K_DOWN;
      // 뒤집힌 화면(guest)은 화면 왼쪽 = 세계 오른쪽
      if (mirror) k = (k & ~(K_L | K_R)) | (k & K_L ? K_R : 0) | (k & K_R ? K_L : 0);
      const o = padOut[slot];
      o.k = k; o.d = pd.d; o.h = pd.h; o.j = pd.j;
      return o;
    }
    function clearPads() {
      pads.forEach((pd) => { pd.codes.clear(); Object.keys(pd.t).forEach((k) => (pd.t[k] = 0)); });
      inputChanged();
    }
    function onKey(e, down) {
      if (destroyed || !started) return;
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.altKey || e.metaKey || e.ctrlKey) return;
      let used = false;
      for (const [slot, map] of keymaps) {
        for (const act in map) {
          if (!map[act].includes(e.code)) continue;
          used = true;
          const pd = pads[slot];
          if (down) {
            if (!e.repeat && !paused && !ended) { if (act === "down") pd.d++; if (act === "hit") pd.h++; if (act === "up") pd.j++; }
            pd.codes.add(e.code);
          } else pd.codes.delete(e.code);
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

    function control(name, down) {
      if (destroyed) return;
      const pd = pads[mySide];
      down = down ? 1 : 0;
      if (name === "dive" || name === "hit") {
        if (down && started && !paused && !ended) { if (name === "dive") pd.d++; else pd.h++; }
      } else if (name in pd.t) {
        if (name === "jump" && down && !pd.t.jump && started && !paused && !ended) pd.j++;
        pd.t[name] = down;
      }
      inputChanged();
    }

    // ───── 온라인
    let remote = { k: 0, d: 0, h: 0, j: 0 }; // host: guest 의 입력
    let gotGo = false, lastHi = 0, lastIn = 0, lastSent = "", lastPing = 0, rtt = -1, lastHeard = 0;
    const epoch = 1 + Math.floor(Math.random() * 2e9); // host: 이번 판 번호 — 주인이 새로고침하면 바뀐다
    let gEpoch = 0; // guest: 지금 맞춰 그리는 주인 판 번호
    let link = "ok"; // 페이지가 알려 준 연결 상태 (ok · away · retry)
    let guestIn = 0, guestAway = false, selfHidden = false; // host: 손님 입력을 받은 때 · 손님이 화면을 숨김 · 내 화면이 숨겨짐
    let holdWhy = "", resumeAt = 0, lastHoldSent = 0; // host: 지금 멈춘 까닭 · 이 시각까지 1초 쉬고 이어 감
    let gHold = ""; // guest: 주인이 알려 준 멈춤 까닭
    const snaps = []; // guest: 받은 상태
    const gev = []; // guest: 아직 안 보여 준 사건
    let gf = -1; // guest: 지금 그리는 프레임 (소수)
    let outEv = []; // host: 다음 상태에 실어 보낼 사건
    const SNAP_KEEP = 90, GEV_KEEP = 200, SLOW_MS = 800;
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
        sp: S.spikes.slice(), w: S.winner, sr: S.scorer, tg: S.target, ss: S.serves.slice(),
        b: [r1(b.x), r1(b.y), r1(b.vx), r1(b.vy), r2(b.rot), b.held, r2(b.pow)],
        p: S.p.map((p) => [r1(p.x), r1(p.y), r1(p.vx), r1(p.vy), p.ground, r2(p.dive), r2(p.rec), p.face, r2(p.swing), r2(p.land), p.mood, r2(p.run), r2(p.hitT)]),
        ev: outEv,
      };
      outEv = [];
      return m;
    }
    function unpack(m, into) {
      into.f = m.f; into.phase = PH[m.ph] || "play"; into.t = m.pt; into.score = m.sc; into.serve = m.sv; into.rally = m.ry;
      into.best = m.be; into.spikes = m.sp; into.winner = m.w; into.scorer = m.sr; into.target = m.tg; into.serves = m.ss || [0, 0];
      const b = into.ball;
      [b.x, b.y, b.vx, b.vy, b.rot, b.held, b.pow] = m.b;
      m.p.forEach((a, i) => {
        const p = into.p[i];
        [p.x, p.y, p.vx, p.vy, p.ground, p.dive, p.rec, p.face, p.swing, p.land, p.mood, p.run, p.hitT] = a;
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
      snaps.length = 0; gev.length = 0; gf = -1; gHold = "";
      rallyShown = 0; banner = null;
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
            if (S.phase === "wait") { S.phase = "count"; S.t = 0; handleEv({ k: "ready" }); outEv.push({ k: "ready", f: S.f }); }
            send({ t: "go", e: epoch });
          } else if (m.t === "in") {
            guestIn = now; guestAway = false;
            const d = m.d | 0, h = m.h | 0, j = m.j | 0;
            if (d < remote.d || h < remote.h || j < remote.j) syncRemote(m); // 횟수가 줄었다 = 새로 센 손님
            remote = { k: m.k | 0, d, h, j };
          } else if (m.t === "away") guestAway = true;
          else if (m.t === "ping") send({ t: "pong", c: m.c });
        } else {
          if (ended) return; // 끝난 손님 판은 그대로 둔다 — 주인이 같은 판을 새로 열어도 새 경기로 끌려가지 않게
          if ((m.t === "s" || m.t === "go" || m.t === "hold") && typeof m.e === "number" && m.e !== gEpoch) guestReset(m.e);
          if (m.t === "go") gotGo = true;
          else if (m.t === "pong") rtt = Math.round(performance.now() - m.c);
          else if (m.t === "hold") gHold = String(m.r || "slow");
          else if (m.t === "s" && typeof m.f === "number" && Array.isArray(m.b) && Array.isArray(m.p)) {
            gotGo = m.ph !== 0; // 기다리는 중 상태를 받는 동안은 「준비됨」을 다시 보낸다
            gHold = "";
            if (snaps.length && m.f <= snaps[snaps.length - 1].f) return; // 늦게 온 옛 상태
            snaps.push(m);
            if (snaps.length > SNAP_KEEP) snaps.splice(0, snaps.length - SNAP_KEEP); // 화면을 숨긴 동안 쌓이지 않게
            if (Array.isArray(m.ev)) m.ev.forEach((e) => { if (e && typeof e === "object") gev.push(e); });
            if (gev.length > GEV_KEEP) gev.splice(0, gev.length - GEV_KEEP);
          }
        }
      });
    }
    // 화면을 숨기면(다른 탭 · 잠금) 그리기가 멈춘다 — 상대에게 알리고, 돌아오면 1초 뒤 이어 간다
    function onVisibility() {
      if (destroyed || !started) return;
      const hidden = document.visibilityState === "hidden";
      if (mode === "guest") { if (hidden) send({ t: "away" }); return; }
      selfHidden = hidden;
      if (hidden) send({ t: "hold", e: epoch, r: "rest" });
      else resumeAt = performance.now() + 1000;
    }
    if (online) document.addEventListener("visibilitychange", onVisibility);

    // host: 판을 멈출 까닭 — 상대가 안 보이거나 · 다시 연결하는 중 · 손님 입력이 끊김 · 손님이 화면을 숨김
    const LIVE = ["count", "serve", "play", "point"];
    function hostHold(now) {
      if (mode !== "host" || !LIVE.includes(S.phase)) return "";
      if (link !== "ok") return link;
      if (selfHidden) return "rest";
      if (guestAway) return "gone";
      if (now - guestIn > SLOW_MS) return "slow";
      return "";
    }

    // ───── 계산 (cpu · local · host · demo)
    function inputFor(side) {
      if (ai[side]) return ai[side].think(S);
      if (mode === "host" && side === 1) return remote;
      return padBits(side);
    }
    function simTick() {
      prevB.x = S.ball.x; prevB.y = S.ball.y; prevB.rot = S.ball.rot;
      S.p.forEach((p, i) => { prevP[i].x = p.x; prevP[i].y = p.y; });
      if (hitStop > 0) { hitStop--; return; }
      evq.length = 0;
      step(S, [inputFor(0), inputFor(1)], evq);
      for (const e of evq) {
        e.f = S.f;
        handleEv(e);
        if (mode === "host") outEv.push(e);
      }
      // 기다리는 동안은 0.25초마다만 (손님이 주인의 새 판 번호를 알아채기에 넉넉하다)
      // 경기가 끝나고 3초 뒤부터도 0.25초마다 끝 장면을 보낸다 — 결과를 못 내고 다시 들어온 손님이 끝을 받아 결과를 낼 수 있게
      const slow = S.phase === "wait" || (S.phase === "end" && S.t > END_T + 3);
      if (mode === "host" && S.f % (slow ? 15 : SNAP_EVERY) === 0) send(packState());
      if (S.phase === "end" && S.t >= END_T) finish();
    }

    // ───── guest — 받은 상태를 보간해 그린다
    const G0 = newState(target, 0, "wait"), G1 = newState(target, 0, "wait");
    function guestTick(dt) {
      if (ended) return; // 끝난 뒤에는 받은 상태로 다시 그리지 않는다 (끝 장면 그대로)
      const now = performance.now();
      if (!gotGo && now - lastHi > 500) { lastHi = now; const o = padBits(mySide); send({ t: "hi", d: o.d, h: o.h, j: o.j }); }
      if (now - lastIn > 120) { lastIn = now; const o = padBits(mySide); send({ t: "in", k: o.k, d: o.d, h: o.h, j: o.j }); }
      if (now - lastPing > 2000) { lastPing = now; send({ t: "ping", c: now }); }
      if (!snaps.length) return;
      const latest = snaps[snaps.length - 1];
      const want = latest.f - GUEST_DELAY;
      if (gf < 0) gf = want;
      gf += dt * 60;
      if (Math.abs(want - gf) > 30) {
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
      unpack(s1, S);
      const near = (x0, y0, x1, y1) => Math.abs(x1 - x0) + Math.abs(y1 - y0) < 140;
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
          sfx("pop");
          looks[e.s].bump = 0.18;
          ballSq = 0.1;
          ring(e.x, e.y, "rgba(255,255,255,.9)", 8, 34, 0.28);
          burst(e.x, e.y, 5, ["#ffffff", "#fde68a"], 120, 0.35, 2.6, 300);
          if (e.dig) popText(e.x, e.y - 30, "나이스!", "#16a34a", 0.9);
          rallyFx(e.r);
          break;
        }
        case "power": {
          ballSq = 0.12;
          if (e.kind === "spike") {
            sfx("hit"); sfx("whoosh");
            shake = 0.22; shakeMag = 6;
            if (mode !== "guest") hitStop = 4;
            ring(e.x, e.y, "rgba(255,196,64,.95)", 10, 60, 0.35);
            burst(e.x, e.y, 14, ["#ffd23f", "#ff7a3d", "#ffffff"], 260, 0.45, 3.2, 400);
            popText(e.x, e.y - 34, "강타!", "#ef4444", 1.15);
          } else if (e.kind === "feint") {
            sfx("tap");
            ring(e.x, e.y, "rgba(255,255,255,.9)", 8, 30, 0.25);
            popText(e.x, e.y - 30, "살짝~", "#7c3aed", 0.9);
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
          if (sp) popText(sp.x, Math.min(sp.y, FLOOR) - 122, "+1", TEAM[e.s], 1.1);
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
            parts.push({ x: (sp ? sp.x : 400) + (Math.random() - 0.5) * 160, y: -10 - Math.random() * 120, vx: (Math.random() - 0.5) * 60, vy: 60 + Math.random() * 80, life: 2.6, max: 2.6, c: ["#ffd23f", "#ff7a3d", "#2f6bff", "#22c55e", "#ec4899"][i % 5], r: 3.5, gr: 20, conf: 1, spin: Math.random() * 6 });
          }
          break;
        }
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
        sec: Math.round((S.f * DT) * 10) / 10, mode, level, target,
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
        x.setTransform(dpr * scale, 0, 0, dpr * scale, ox * dpr, oy * dpr);
        paint(x);
        return c;
      };
      bgSky = mk(paintSky);
      bgScene = mk((x) => paintScene(x, FONT));
    }
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => { resize(); if (!raf) draw(); }) : null;
    if (ro) ro.observe(canvas);
    const onWinResize = () => { resize(); if (!raf) draw(); };
    window.addEventListener("resize", onWinResize);

    // ───── 그리기
    const CLOUDS = [[60, 70, 1.1, 7], [300, 40, 0.8, 5], [520, 120, 1.3, 9], [760, 86, 0.9, 6], [190, 150, 0.7, 4]];
    function drawClouds(g2) {
      g2.fillStyle = "rgba(255,255,255,.92)";
      for (const [x0, y, s, sp] of CLOUDS) {
        const x = ((x0 + clock * sp) % (W + 240)) - 120;
        for (const [dx, dy, rx, ry] of [[0, 0, 34, 14], [-22, 4, 20, 11], [24, 3, 22, 12], [2, -9, 20, 13]]) {
          g2.beginPath(); g2.ellipse(x + dx * s, y + dy * s, rx * s, ry * s, 0, 0, Math.PI * 2); g2.fill();
        }
      }
    }
    const VX = (x) => (mirror ? W - x : x);
    function screenOf(x, y) { return [ox + VX(x) * scale, oy + y * scale]; }

    function drawPlayer(p, i, px, py) {
      const L = LOOKS[i];
      const x = VX(px), y = py, f = (mirror ? -1 : 1) * p.face;
      const air = FLOOR - y;
      g.fillStyle = `rgba(22,70,45,${Math.max(0.08, 0.3 - air / 600)})`;
      g.beginPath(); g.ellipse(x, FLOOR + 3, Math.max(14, 30 - air / 10), 5.5, 0, 0, 7); g.fill();
      g.save();
      g.translate(x, y);
      const lying = p.dive > 0 || p.rec > 0;
      if (lying) {
        const k = p.dive > 0 ? 1 : clamp(p.rec / (DIVE_REC * 0.55), 0, 1);
        g.scale(f, 1);
        g.translate(-36 * k, -16 * k);
        g.rotate(1.41 * k);
      } else {
        let sx = 1, sy = 1;
        if (p.land > 0) { const k = p.land / 0.12; sx = 1 + 0.13 * k; sy = 1 - 0.13 * k; }
        else if (!p.ground) { const k = clamp(-p.vy / JUMP_V, -1, 1); sx = 1 - 0.05 * k; sy = 1 + 0.06 * k; }
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

    function drawHud() {
      const hs = clamp(cssW / 900, 0.78, 1.25);
      const pad = 10 * hs;
      const sides = mirror ? [1, 0] : [0, 1]; // 화면 왼쪽 · 오른쪽 사람
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
      // 가운데 — 목표 점수 · 랠리
      const cx = ox + (W * scale) / 2;
      hudText(`${S.target}점 내기`, cx, top + 11 * hs, 11.5 * hs, "rgba(15,23,42,.6)", "center", 700);
      if ((S.phase === "play" || S.phase === "point") && S.rally >= 2) {
        hudText(`랠리 ${S.rally}`, cx, top + 30 * hs, 16 * hs, "#ffffff", "center", 800, "rgba(15,23,42,.55)");
      }
      // 나 · 1P · 2P 표시
      if (mode !== "demo") {
        for (let side = 0; side < 2; side++) {
          if (!(mode === "local" || side === mySide)) continue;
          const p = S.p[side];
          const [mx, my] = screenOf(lerp(prevP[side].x, p.x, alpha), lerp(prevP[side].y, p.y, alpha) - (p.dive > 0 || p.rec > 0 ? 54 : 96));
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
      // 화면 위로 나간 공
      const b = S.ball, by = lerp(prevB.y, b.y, alpha);
      if (by + BR < 0) {
        const [mx] = screenOf(lerp(prevB.x, b.x, alpha), 0);
        const my = oy + 58 * hs;
        g.fillStyle = "rgba(15,23,42,.55)";
        g.beginPath(); g.moveTo(mx, my - 9 * hs); g.lineTo(mx - 7 * hs, my + 2 * hs); g.lineTo(mx + 7 * hs, my + 2 * hs); g.closePath(); g.fill();
        hudText(`${Math.round(-by / 10)}m`, mx, my + 10 * hs, 10 * hs, "rgba(15,23,42,.7)", "center", 700);
      }
      // 가운데 큰 글자
      const midY = oy + H * scale * 0.36;
      const big = (text, color, size) => hudText(text, cx, midY, size * hs, color, "center", 900, "rgba(15,23,42,.6)");
      // 손님 — 주인이 들어와 있으면(link ok) 시작 신호를 받기 전까지 「연결하는 중…」, 아직 없으면 「상대를 기다리는 중…」
      if (S.phase === "wait") big(mode === "guest" && !gotGo && link !== "away" ? "연결하는 중…" : "상대를 기다리는 중…", "#ffffff", 26);
      else if (S.phase === "count") big(S.t < GO_AT ? "준비" : "시작!", S.t < GO_AT ? "#ffffff" : "#ffd23f", 44);
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
      // 서브 안내 — 사람이 서브할 때 처음 두 번
      if (S.phase === "serve" && human[S.serve] && mode !== "demo" && (S.serves[S.serve] < 2 || S.t > 3)) {
        const local2 = mode === "local";
        const key = touchUI ? "점프 버튼" : local2 ? (S.serve ? "↑" : "W") : "↑";
        const who2 = local2 ? `${S.serve ? "2P" : "1P"} 서브 · ` : online && S.serve !== mySide ? "" : "";
        if (!(online && S.serve !== mySide)) {
          const txt = `${who2}공 밑에서 ${key}${touchUI ? "을 눌러" : " 키로"} 뛰어올라 치면 서브예요`;
          const y = oy + H * scale - 30 * hs;
          g.font = `700 ${12.5 * hs}px ${FONT}`;
          const tw = g.measureText(txt).width + 26 * hs;
          g.fillStyle = "rgba(15,23,42,.62)";
          rr(g, cx - tw / 2, y - 13 * hs, tw, 26 * hs, 13 * hs); g.fill();
          hudText(txt, cx, y + 0.5, 12.5 * hs, "#ffffff", "center", 700);
        }
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
      if (mode === "guest" && rtt >= 0) hudText(`지연 ${rtt}ms`, ox + W * scale - 8 * hs, oy + H * scale - 10 * hs, 10 * hs, "rgba(255,255,255,.75)", "right", 700);
    }
    const HOLD_TEXT = { away: "상대를 기다리는 중…", retry: "다시 연결하는 중…", gone: "상대가 잠깐 자리를 비웠어요", slow: "상대 연결이 불안정해요…", rest: "", resume: "곧 이어서 해요" };
    function netNote() {
      if (!online || S.phase === "wait" || S.phase === "end") return "";
      if (link === "retry") return "다시 연결하는 중…";
      if (link === "away") return "상대를 기다리는 중…";
      if (mode === "host") return HOLD_TEXT[holdWhy] || "";
      const quiet = !!snaps.length && performance.now() - lastHeard > 1500;
      if (gHold === "rest") return "상대가 잠깐 자리를 비웠어요";
      if (gHold === "resume" && !quiet) return "곧 이어서 해요";
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
      g.setTransform(k, 0, 0, k, ox * dpr, oy * dpr);
      drawClouds(g);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(bgScene, sx * k, sy * k);
      g.setTransform(k, 0, 0, k, (ox + sx * scale) * dpr, (oy + sy * scale) * dpr);
      // 공 그림자
      const b = S.ball;
      const bx = lerp(prevB.x, b.x, alpha), by = lerp(prevB.y, b.y, alpha), brot = lerp(prevB.rot, b.rot, alpha);
      const bh = FLOOR - by;
      g.fillStyle = `rgba(22,70,45,${clamp(0.32 - bh / 900, 0.06, 0.3)})`;
      g.beginPath(); g.ellipse(VX(bx), FLOOR + 3, clamp(18 - bh / 40, 7, 18), 4.5, 0, 0, 7); g.fill();
      drawNet(g, netWob);
      // 사람
      const order = mirror ? [1, 0] : [0, 1];
      order.forEach((i) => {
        const p = S.p[i];
        drawPlayer(p, i, lerp(prevP[i].x, p.x, alpha), lerp(prevP[i].y, p.y, alpha));
      });
      // 공 잔상 · 공
      const fast = Math.hypot(b.vx, b.vy) > 720 || b.pow > 0;
      if (!b.held && (fast || trail.length)) {
        for (let i = 0; i < trail.length; i++) {
          const t = trail[i], a2 = (i + 1) / (trail.length + 1);
          g.fillStyle = b.pow > 0 || t.pow ? `rgba(255,${120 + i * 10},60,${a2 * 0.45})` : `rgba(255,255,255,${a2 * 0.5})`;
          g.beginPath(); g.arc(VX(t.x), t.y, BR * (0.5 + a2 * 0.45), 0, 7); g.fill();
        }
      }
      const hb = b.held ? Math.sin(clock * 3.2) * 3 : 0;
      let ssx = 1, ssy = 1;
      if (ballSq > 0) { const q = ballSq / 0.12; ssx = 1 + 0.18 * q; ssy = 1 - 0.18 * q; }
      if (b.pow > 0) {
        const glow = g.createRadialGradient(VX(bx), by, 4, VX(bx), by, BR * 2.2);
        glow.addColorStop(0, "rgba(255,200,64,.55)"); glow.addColorStop(1, "rgba(255,120,40,0)");
        g.fillStyle = glow; g.beginPath(); g.arc(VX(bx), by, BR * 2.2, 0, 7); g.fill();
      }
      drawBallShape(g, VX(bx), by + hb, mirror ? -brot : brot, ssx, ssy);
      // 조각 · 고리
      for (const q of parts) {
        const a3 = Math.max(0, q.life / q.max);
        if (q.ring) {
          g.strokeStyle = q.c; g.globalAlpha = a3; g.lineWidth = 3 * a3 + 1;
          g.beginPath(); g.arc(VX(q.x), q.y, lerp(q.r1, q.r0, a3), 0, 7); g.stroke();
          g.globalAlpha = 1;
        } else if (q.conf) {
          g.save(); g.translate(VX(q.x), q.y); g.rotate(q.spin); g.globalAlpha = Math.min(1, a3 * 2);
          g.fillStyle = q.c; g.fillRect(-q.r, -q.r * 0.5, q.r * 2, q.r); g.restore();
        } else {
          g.globalAlpha = a3; g.fillStyle = q.c;
          g.beginPath(); g.arc(VX(q.x), q.y, q.r * (0.5 + a3 * 0.5), 0, 7); g.fill();
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

    function loop(ts) {
      raf = requestAnimationFrame(loop);
      let dt = (ts - lastTs) / 1000;
      lastTs = ts;
      if (!(dt > 0)) dt = 0;
      if (dt > 0.1) dt = 0.1;
      const now = performance.now();
      const why = hostHold(now);
      if (mode === "guest") { guestTick(dt); alpha = 1; }
      else if (why || (mode === "host" && now < resumeAt && LIVE.includes(S.phase))) {
        // host — 판을 멈춘다 (공 · 사람 그대로). 다시 가기 전 1초는 「곧 이어서 해요」
        if (why) resumeAt = now + 1000;
        holdWhy = why || "resume";
        acc = 0; alpha = 1;
        if (now - lastHoldSent > 250) { lastHoldSent = now; send({ t: "hold", e: epoch, r: holdWhy }); }
      } else {
        holdWhy = "";
        acc += dt;
        let n = 0;
        while (acc >= DT && n < 6) { simTick(); acc -= DT; n++; }
        if (n >= 6) acc = 0;
        alpha = clamp(acc / DT, 0, 1);
      }
      fxTick(dt);
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
        lastTs = performance.now();
        raf = requestAnimationFrame(loop);
        emit({ type: "start", mode });
      },
      // 온라인은 멈출 수 없다 (상대 화면이 같이 멈추지 않으니)
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
        lastTs = performance.now();
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
      control,
      isPaused: () => paused,
      isOver: () => ended,
      // 온라인 — 페이지가 아는 연결 상태 ("ok" · "away" · "retry")
      setLink(kind) { link = kind === "away" || kind === "retry" ? kind : "ok"; if (!raf) draw(); },
      // host — 이어 하기용 (새로고침 뒤 opts.resume 으로 돌려준다)
      saveState: () => ({ sc: S.score.slice(), sv: S.serve, sp: S.spikes.slice(), be: S.best, ss: S.serves.slice(), sec: Math.round(S.f * DT * 10) / 10, tg: S.target }),
      phase: () => S.phase,
      // 시험용 — 지금 판 상태(읽기만)
      debug: () => S,
      debugNet: () => ({ link, holdWhy, gHold, rtt, epoch, gEpoch, gotGo, snaps: snaps.length, gev: gev.length, sinceIn: Math.round(performance.now() - guestIn) }),
    };
    return api;
  }

  window.HKVolley = {
    create,
    WORLD: { W, H, FLOOR, NET_X, NET_TOP },
    // 시험용 — 계산만 따로 (브라우저 없이 컴퓨터끼리 돌려 보기)
    _sim: { newState, step, makeAI, placeServe, DT, K: { L: K_L, R: K_R, JUMP: K_JUMP, UP: K_UP, DOWN: K_DOWN } },
  };
})();
