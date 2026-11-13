/**
 * 꿀꺽 젤리 숲 대전 — 3D 숲 · 젤리 두 마리 · 실시간 통신 (화면은 web/games/jellyvs.html, 서버 엔진은 backend/app/services/versus_jellyvs.py)
 * 그림 · 물리 · 조작은 혼자 하기 본체 web/games/embed/jelly.html 에서 가져왔다(three.js 는 /_shared/jellyvs-three.js — 같은 r128).
 *
 *   HKJellyVs.create(container, opts) → { start, destroy, pause, resume, isPaused, isOver, phase, setReady, requestPause, setLink, lobby, debug, devSet, devAuto }
 *   opts.mode       "cpu"(컴퓨터 젤리와 연습) | "host"(도전한 사람 — 판을 계산) | "guest"(받은 사람 — 받아 그림) | "demo"(첫 화면 뒤 구경)
 *   opts.level      cpu — "easy" | "normal" | "hard"
 *   opts.me · opts.rival   { name }
 *   opts.net        host · guest — { send(obj) → bool, onMessage(fn) }
 *   opts.onEnd(res) 판이 끝나면 한 번 — { winner: "host"|"guest"|"draw", size: [주인, 손님](×100 정수), eaten, sec, me: 0|1, win, draw, friends: [주인, 손님], bites: [주인, 손님] }
 *   opts.onEvent(e) { type: "lobby", phase, paused, pausedBy: "me"|"rival", pausedWhy, ready: [나, 상대], peer, host } — 준비 · 멈춤 상태가 바뀔 때
 *   opts.isMuted()  소리를 끌지
 *   opts.dev        시험용 devSet · devAuto 를 연다
 *
 * 규칙: 2분(ROUND) 동안 먹고 자라기. 상대보다 1.2배(PVP) 넘게 크면 부딪혀 삼킨다 → 즉시 승. 처음 15초(SAFE)는 서로 못 삼킨다.
 *       2분 뒤 큰 쪽 승, 1.02배(EVEN) 미만 차이면 무승부. 대시 중 · 물린 직후는 삼켜지지 않는다. 가시대왕은 둘 다에게 위협.
 * 동기화: host 가 초당 15번 상태(젤리 둘 · 숲 친구 · 먹을 것 · 알림)를 보내고, guest 는 120ms 늦게 보간해 그린다.
 *         guest 의 내 젤리는 내 입력으로 먼저 움직이고(예측) host 값으로 부드럽게 맞춘다. 먹을 것 자리는 host 시드로 둘이 같게 만든다.
 */
window.HKJellyVs = (function () {
  "use strict";
  const T = window.THREE;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  let RNG = Math.random;
  const rand = (a, b) => (b === undefined ? RNG() * a : a + RNG() * (b - a));
  const reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  // ───────── 규칙 값 (서버 versus_jellyvs.py 와 같은 값: ROUND_SEC · SAFE_SEC · EAT_RATIO · EVEN_RATIO)
  const ROUND = 120, SAFE = 15, PVP = 1.2, EVEN = 1.02;
  let WORLD = 56; // 숲 반지름 — 맵마다 다르다(맵을 고르면 바뀐다)
  const EAT = 1.12, BOSS_S = 4.6, RIVAL_CAP = BOSS_S * 0.84, MAXDASH = 3, COUNT = 3, END_T = 1.8;
  const N_BERRY = 96, N_SHROOM = 28, N_ORB = 8, N_FOOD = N_BERRY + N_SHROOM + N_ORB, N_FRIEND = 12;
  const START = [[-14, 10], [14, 10]]; // 주인 · 손님 시작 자리 (좌우 대칭)
  const JCOL = [0xff7ac8, 0x5fd4ff]; // 주인 분홍 · 손님 하늘
  const SNAP_MS = 66, SLOW_SNAP_MS = 250, INTERP_MS = 120;
  const sizeWinner = (h, g) => { const big = Math.max(h, g), small = Math.min(h, g); if (big * 100 < small * Math.round(EVEN * 100)) return "draw"; return h > g ? "host" : "guest"; };
  const pspd = (s) => 9 + 1.4 * (s - 1);
  const rspd = (s) => 8.6 + 0.55 * (s - 1);
  const r1 = (v) => Math.round(v * 10);
  // 시드 무작위 — 둘이 같은 숲을 만든다
  function mulberry(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const seeded = (seed, i, g) => mulberry((seed ^ Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(g + 7, 0x85ebca77)) | 0);
  const FOOD_GROUPS = [[0, N_BERRY, 2.5], [N_BERRY, N_SHROOM, 2.5], [N_BERRY + N_SHROOM, N_ORB, 4]];
  const foodType = (i) => (i < N_BERRY ? 0 : i < N_BERRY + N_SHROOM ? 1 : 2);
  // 먹을 것 자리 — 처음(gen 0)에는 절반을 좌우로 뒤집어 놓아 두 시작 자리에 똑같이, 다시 돋을 때는 시드 · 번호 · 세대로
  function foodPos(seed, i, gen) {
    const [s0, n, pad] = FOOD_GROUPS[foodType(i)], k = i - s0, half = n >> 1;
    if (gen === 0 && k >= half) { const p = foodPos(seed, s0 + k - half, 0); return { x: -p.x, z: p.z }; }
    return MK.foodPos(seeded(seed, i, gen), pad); // 맵마다 퍼짐이 다르다 · 장애물은 피한다
  }
  const ALPH = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let MK = null; // 맵 도구 (buildWorld 에서 만든다)

  // ───────── 숲 고르기(맵) — 대전 web/_shared/jellyvs-vs.js 와 혼자 하기 web/games/embed/jelly.html 에 같은 글이 들어 있다(한쪽을 고치면 다른 쪽도 같이)
  //   맵마다 하늘 · 안개 · 빛 · 땅 색 · 둘레 장식 · 나무 · 날리는 것(반딧불 · 낙엽 · 눈 · 꽃잎 · 포자) · 장애물(바위 · 물 · 돌기둥) · 미끄러운 얼음 · 먹이 퍼짐이 다르다.
  //   장애물 · 먹이 무리는 모두 좌우 대칭 — 대전에서 좌우에서 출발하는 두 젤리에게 같은 숲이 되게. 출발 자리(±14, 10) · (0, 18) · 가시대왕 자리(0, -34)는 비워 둔다.
  //   obs: [x, z, 반지름, 종류] — rock(바위) · pillar(돌기둥) · water(물) 는 못 지나가고, ice(얼음)는 지나가지만 미끄럽다.
  const JELLY_MAPS = [
    { id: 1, name: "달빛 마법 숲", tip: "지금 숲 · 먹이가 고르게", world: 56,
      sky: ["#0a0722", "#241a60", "#1e5068"], fog: [0x1c1650, 0.0098], hemi: [0xc3b4ff, 0x1f6a52, 1.0], moon: [0xd6e6ff, 0.8], rim: [0xff9ad8, 0.3], exp: 1.15,
      ground: [0x18473f, 0x2c8658, 0x6ad07e, 0x40318f, 0x0b1a2a], edge: "caps", edgeCol: [0x7dffd0, 0xff9ad8, 0xffe27a, 0x9ad0ff],
      tree: "pine", trunk: 0x4a3558, leaves: [0x1f7a6b, 0x186a78, 0x2a8a62, 0x23806e, 0x4a3fa0, 0x7a3fa6], bush: [0x1f7a6b, 0x2a8a62, 0x4a3fa0, 0x186a78], big: 1 / 3,
      grass: [0x3fa46a, 0x56c27c, 0x2f8f72, 0x7ad88a, 0x5d6fd0], grassN: 1500, flowers: [0xffffff, 0xff9ad8, 0x8fe9ff, 0xffe27a], flowerN: 280, flowerSize: 0.55, pebble: 0x6f6a96,
      air: "fly", airCol: [0xffe27a, 0xffe27a, 0x7dffd0], airN: 130, airSize: 0.7,
      food: "even", berry: [0xff4d6d, 0x6b8cff, 0xc77dff, 0xffb347], shroom: [0xff5a6e, 0xffa34d, 0xb07bff], foodScale: 1, obs: [],
      chip: ["#241a60", "#2c8658", "#ff7ac8"] },
    { id: 2, name: "단풍 언덕", tip: "노을빛 바위 언덕 · 먹이는 가장자리에", world: 58,
      sky: ["#2a1640", "#a8436a", "#f2a65a"], fog: [0x7a3d55, 0.0082], hemi: [0xffd8b8, 0x5a3a1a, 1.05], moon: [0xffc58a, 0.95], rim: [0xff7a5a, 0.45], exp: 1.08,
      ground: [0x5a3a1c, 0x8a5a24, 0xc98a3a, 0x8a3a2a, 0x1e120c], edge: "stones", edgeCol: [0xa08a74, 0x8a7460, 0xb89a7a, 0x7a6450],
      tree: "round", trunk: 0x4a2e1e, leaves: [0xd9482b, 0xe8792b, 0xf0b030, 0xb8322a, 0xc95a1a], bush: [0xa8501e, 0xc07a2a, 0x8a3a1e, 0xd0902a], big: 0,
      grass: [0xb08a3a, 0xc9a04a, 0x8a6a2a, 0xd8b060], grassN: 1100, flowers: [0xffd27a, 0xff8a5a, 0xffffff], flowerN: 120, flowerSize: 0.5, pebble: 0x8a7a6a,
      air: "leaf", airCol: [0xe8692b, 0xf0a830, 0xc8402a], airN: 110, airSize: 0.75,
      food: "ring", berry: [0xc0302a, 0x7a3fa6, 0xff8a3d, 0xffd23a], shroom: [0xd9482b, 0xf0b030, 0xa0703a], foodScale: 1,
      obs: [[-20, -8, 3.2, "rock"], [20, -8, 3.2, "rock"], [-9, -20, 2.4, "rock"], [9, -20, 2.4, "rock"], [-31, 16, 2.8, "rock"], [31, 16, 2.8, "rock"], [0, 30, 2.6, "rock"]],
      rock: 0x8a7462, chip: ["#a8436a", "#c98a3a", "#e8792b"] },
    { id: 3, name: "눈 덮인 숲", tip: "하얀 눈밭 · 얼음 위는 미끄러워요", world: 56,
      sky: ["#0b1838", "#33508a", "#9fc0e0"], fog: [0x8aa0c8, 0.0102], hemi: [0xdbe8ff, 0x6a7aa0, 1.0], moon: [0xeaf2ff, 0.85], rim: [0x9ad0ff, 0.35], exp: 0.98,
      ground: [0xb8c8e0, 0xd8e4f4, 0xf4f8ff, 0x9ab0d8, 0x2a3450], edge: "crystals", edgeCol: [0x9ad0ff, 0xcfe8ff, 0x7dffd0, 0xffffff],
      tree: "snowpine", trunk: 0x3e3048, leaves: [0x1f5a5a, 0x245a6a, 0x2a6a5a, 0x1e4a5a], bush: [0xdfe8f5, 0xc8d8ee, 0xeef4ff, 0xb8cce4], big: 0,
      grass: [0xeef4ff, 0xc8d8ee, 0x9ab0c8], grassN: 450, flowers: [0xffffff, 0xbfe0ff], flowerN: 200, flowerSize: 0.45, pebble: 0x8a96b0,
      air: "snow", airCol: [0xffffff, 0xdfeaff], airN: 230, airSize: 0.5,
      food: "even", berry: [0xff2a50, 0x3d6cff, 0xb05aff, 0xff8a1d], shroom: [0xff2a50, 0xff7a1a, 0x7a4aff], foodScale: 1.08,
      obs: [[0, -6, 9, "ice"], [-27, 22, 6, "ice"], [27, 22, 6, "ice"], [-25, -22, 2.4, "rock"], [25, -22, 2.4, "rock"], [-38, -2, 2.2, "rock"], [38, -2, 2.2, "rock"]],
      rock: 0x8a96b0, chip: ["#33508a", "#e6eef8", "#9ad0ff"] },
    { id: 4, name: "꽃밭 호숫가", tip: "호수를 돌아가요 · 꽃밭에 먹이가 모여요", world: 60,
      sky: ["#1a1a4a", "#6a4a9a", "#f0a0b8"], fog: [0x5a4a80, 0.0078], hemi: [0xffe0f0, 0x2a6a4a, 1.05], moon: [0xfff0e0, 0.85], rim: [0xff9ad8, 0.45], exp: 1.1,
      ground: [0x2a6a3a, 0x4a9a4a, 0x8ad06a, 0x8a5aa0, 0x0e2418], edge: "caps", edgeCol: [0xff9ad8, 0xffffff, 0xffe27a, 0xc79aff],
      tree: "round", trunk: 0x5a3a4a, leaves: [0x3a8a4a, 0x4aa05a, 0xe890c0, 0xf0b0d0, 0x2a7a5a], bush: [0xe87ab0, 0x4aa05a, 0xc79aff, 0xf4f0ff], big: 0,
      grass: [0x4aa05a, 0x5ab868, 0x3a8a4a, 0x7ad070], grassN: 1300, flowers: [0xff7ac8, 0xffffff, 0xffe27a, 0xc79aff, 0x8fe9ff], flowerN: 700, flowerSize: 0.8, pebble: 0x8a8aa0,
      air: "petal", airCol: [0xffb0d8, 0xffffff, 0xffd0e8], airN: 120, airSize: 0.55,
      food: "patches", patches: [[-30, -16], [30, -16], [-26, 28], [26, 28], [0, 24]], berry: [0xff4d6d, 0x6b8cff, 0xc77dff, 0xffb347], shroom: [0xff5a6e, 0xffa34d, 0xb07bff], foodScale: 1,
      obs: [[0, -11, 8.5, "water"], [-34, 2, 5, "water"], [34, 2, 5, "water"]],
      water: 0x2f7fb8, shore: 0xc8d8a8, lily: true, chip: ["#6a4a9a", "#4a9a4a", "#ff7ac8"] },
    { id: 5, name: "버섯 동굴", tip: "어둡고 좁은 굴 · 빛나는 버섯 기둥", world: 48,
      sky: ["#03020a", "#0c0a24", "#141a3a"], fog: [0x0a0a22, 0.0155], hemi: [0x6a7aff, 0x101830, 0.75], moon: [0x9ab0ff, 0.45], rim: [0x7dffd0, 0.55], exp: 1.25,
      ground: [0x14142a, 0x1e2040, 0x2a3a5a, 0x1a4a5a, 0x05050c], edge: "crystals", edgeCol: [0x7dffd0, 0x9ad0ff, 0xc79aff, 0x5fd4ff],
      tree: "cave", trunk: 0x2a2840, leaves: [0x2a2840], bush: [0x23264a, 0x2a2a5a, 0x1e2a4a], big: 1 / 2,
      grass: [0x3a4a8a, 0x2a6a8a, 0x5a3a9a], grassN: 600, flowers: [0x7dffd0, 0x9ad0ff, 0xc79aff], flowerN: 420, flowerSize: 0.6, pebble: 0x3a3a5a,
      air: "spore", airCol: [0x7dffd0, 0x9ad0ff, 0xc79aff], airN: 160, airSize: 0.55,
      food: "center", berry: [0x5fd4ff, 0x7dffd0, 0xc77dff, 0xffe27a], shroom: [0x7dffd0, 0x5fd4ff, 0xc79aff], foodScale: 1.15,
      obs: [[-16, -14, 2.6, "pillar"], [16, -14, 2.6, "pillar"], [-30, -2, 2.4, "pillar"], [30, -2, 2.4, "pillar"], [-8, 28, 2.2, "pillar"], [8, 28, 2.2, "pillar"], [0, -16, 2.2, "pillar"]],
      rock: 0x2e2c4a, chip: ["#0c0a24", "#2a3a5a", "#7dffd0"] },
    { id: 6, name: "반딧불 늪", tip: "반딧불이 가득 · 늪 웅덩이를 피해요", world: 56,
      sky: ["#020806", "#0a2a22", "#1a3a2a"], fog: [0x061410, 0.0135], hemi: [0x8ad8b8, 0x061a10, 0.62], moon: [0xb0e8d0, 0.45], rim: [0xffe27a, 0.35], exp: 1.05,
      ground: [0x07160f, 0x0d2818, 0x1c3e1e, 0x0e2426, 0x010503], edge: "stones", edgeCol: [0x4a5a4a, 0x3a4a3a, 0x5a6a52, 0x44503c],
      tree: "willow", trunk: 0x2e2a1e, leaves: [0x2a5a2a, 0x3a6a2a, 0x1e4a32, 0x35602c], bush: [0x1e4a2a, 0x2a5a2a, 0x24502e, 0x30602a], big: 0,
      grass: [0x1e4a22, 0x2a5a2a, 0x355a26, 0x16402a], grassN: 1600, flowers: [0xffe27a, 0xc8ff7a], flowerN: 150, flowerSize: 0.5, pebble: 0x3a4a3a,
      air: "fly", airCol: [0xffe27a, 0xd8ff7a, 0x7dffd0], airN: 320, airSize: 0.8,
      food: "patches", patches: [[-22, -2], [22, -2], [-12, -30], [12, -30], [0, 32]], berry: [0xff4d6d, 0xffe27a, 0xc77dff, 0xffb347], shroom: [0xd8ff7a, 0xffa34d, 0xb07bff], foodScale: 1,
      obs: [[-22, -18, 4.5, "water"], [22, -18, 4.5, "water"], [-34, 12, 4, "water"], [34, 12, 4, "water"], [0, -1, 3.8, "water"]],
      water: 0x1e4a3a, shore: 0x3a4a2a, lily: true, chip: ["#0a2a22", "#1a4a2a", "#ffe27a"] },
  ];
  function JellyMapKit(T, env) {
    const scene = env.scene, renderer = env.renderer, C = env.C, canvasTex = env.canvasTex, glowTex = env.glowTex, G = env.G;
    const TAU = Math.PI * 2;
    const lerp = (a, b, t) => a + (b - a) * t;
    const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
    const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
    function vnoise(x, y) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); return lerp(lerp(hash(xi, yi), hash(xi + 1, yi), u), lerp(hash(xi, yi + 1), hash(xi + 1, yi + 1), u), v); }
    function fbm(x, y) { return vnoise(x, y) * 0.6 + vnoise(x * 2.1, y * 2.1) * 0.28 + vnoise(x * 4.3, y * 4.3) * 0.12; }
    function mulb(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    // 빛은 한 번만 만들고 맵마다 색만 바꾼다
    const hemi = new T.HemisphereLight(0xffffff, 0xffffff, 1); scene.add(hemi);
    const moon = new T.DirectionalLight(0xffffff, 0.8); moon.position.set(-30, 60, 24); scene.add(moon);
    const rim = new T.DirectionalLight(0xffffff, 0.3); rim.position.set(40, 22, -40); scene.add(rim);
    scene.fog = new T.FogExp2(0x000000, 0.01);
    // 맵과 상관없는 질감 · 모양은 한 번만 (맵을 바꿔도 버리지 않는다)
    const grTex = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) { const x = hash(i, 1) * w, y = hash(i, 2) * h, r = 8 + hash(i, 3) * 26; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, "rgba(40,40,90,.09)"); gr.addColorStop(1, "rgba(40,40,90,0)"); g.fillStyle = gr; for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) { g.beginPath(); g.arc(x + ox, y + oy, r, 0, TAU); g.fill(); } }
      g.lineCap = "round";
      for (let i = 0; i < 520; i++) { const x = hash(i, 5) * w, y = hash(i, 6) * h, l = 3 + hash(i, 7) * 6, an = -1.2 + hash(i, 8) * 0.7, lt = hash(i, 9) < 0.35; g.strokeStyle = lt ? "rgba(255,255,230,.28)" : "rgba(10,30,30," + (0.06 + hash(i, 10) * 0.08) + ")"; g.lineWidth = lt ? 1 : 1.4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(an) * l, y + Math.sin(an) * l); g.stroke(); }
    });
    grTex.wrapS = grTex.wrapT = T.RepeatWrapping; grTex.repeat.set(30, 30); grTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const capTex = canvasTex(128, 32, (g, w, h) => { const v = g.createLinearGradient(0, 0, 0, h); v.addColorStop(0, "#fff"); v.addColorStop(1, "#bdb6d6"); g.fillStyle = v; g.fillRect(0, 0, w, h); g.fillStyle = "rgba(255,255,255,.95)"; for (let i = 0; i < 10; i++) { g.beginPath(); g.arc((i * 29 + 7) % w, 5 + ((i * 11) % (h - 14)), 2 + (i % 3), 0, TAU); g.fill(); } });
    const spotTex = canvasTex(256, 64, (g, w, h) => { g.fillStyle = "#000"; g.fillRect(0, 0, w, h); for (let i = 0; i < 22; i++) { const x = (i * 53 + 17) % w, y = 8 + ((i * 29) % (h - 26)), r = 4 + (i % 4) * 2.2; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, "#fff"); gr.addColorStop(0.75, "#e8e0ff"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); } const v = g.createLinearGradient(0, 0, 0, h); v.addColorStop(0, "rgba(255,255,255,.22)"); v.addColorStop(0.5, "rgba(255,255,255,0)"); g.fillStyle = v; g.fillRect(0, 0, w, h); });
    const K = { grass: new T.ConeGeometry(0.1, 0.55, 3).translate(0, 0.27, 0), dodeca: new T.DodecahedronGeometry(1, 0), disc: new T.CircleGeometry(1, 40).rotateX(-Math.PI / 2), shore: new T.RingGeometry(0.96, 1.16, 40).rotateX(-Math.PI / 2) };
    const keep = new Set([grTex, capTex, spotTex, glowTex, ...Object.values(K), ...Object.values(G)]);
    let cur = null, group = null, bg = null, air = null, solid = [], ice = [];
    const dummy = new T.Object3D();
    function own(o) { group.add(o); return o; }
    function inst(geo, mat, n) { const m = new T.InstancedMesh(geo, mat, Math.max(1, n)); m.count = n; m.frustumCulled = false; return own(m); }
    function put(m, i, x, y, z, sx, sy, sz, ry) { dummy.position.set(x, y, z); dummy.rotation.set(0, ry || 0, 0); dummy.scale.set(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); }
    function points(n, size, fill) { const p = new Float32Array(n * 3), c = new Float32Array(n * 3); fill(p, c); const g = new T.BufferGeometry(); g.setAttribute("position", new T.BufferAttribute(p, 3)); g.setAttribute("color", new T.BufferAttribute(c, 3)); const pts = new T.Points(g, new T.PointsMaterial({ size, map: glowTex, vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false })); pts.frustumCulled = false; return own(pts); }
    // 앞 맵의 모양 · 재질 · 질감을 버린다 (같이 쓰는 것은 남긴다)
    function dispose() {
      if (!group) return;
      const geos = new Set(), mats = new Set(), texs = new Set();
      group.traverse((o) => {
        if (o.geometry && !keep.has(o.geometry)) geos.add(o.geometry);
        const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        ms.forEach((m) => { mats.add(m); ["map", "emissiveMap"].forEach((k) => { if (m[k] && !keep.has(m[k])) texs.add(m[k]); }); });
        if (o.isInstancedMesh && o.dispose) o.dispose();
      });
      geos.forEach((g) => g.dispose()); mats.forEach((m) => m.dispose()); texs.forEach((t) => t.dispose());
      scene.remove(group); group = null; air = null;
      if (bg) { bg.dispose(); bg = null; }
    }
    function build(def) {
      const R = mulb(20261113 + def.id * 7919), rand = (a, b) => (b === undefined ? R() * a : a + R() * (b - a)), pick = (arr) => arr[(R() * arr.length) | 0];
      const WORLD = def.world, tmp = new T.Color();
      group = new T.Group(); scene.add(group);
      scene.background = bg = canvasTex(4, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, def.sky[0]); gr.addColorStop(0.5, def.sky[1]); gr.addColorStop(1, def.sky[2]); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
      scene.fog.color.copy(C(def.fog[0])); scene.fog.density = def.fog[1];
      hemi.color.copy(C(def.hemi[0])); hemi.groundColor.copy(C(def.hemi[1])); hemi.intensity = def.hemi[2];
      moon.color.copy(C(def.moon[0])); moon.intensity = def.moon[1]; rim.color.copy(C(def.rim[0])); rim.intensity = def.rim[1];
      renderer.toneMappingExposure = def.exp;
      // 땅 — 맵 색으로 얼룩 · 둘레 밖은 어둡게
      {
        const geo = new T.PlaneGeometry(320, 320, 150, 150); geo.rotateX(-Math.PI / 2);
        const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
        const [a, b, c, v, e] = def.ground.map(C);
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i), z = pos.getZ(i), r = Math.hypot(x, z);
          const n = fbm(x * 0.06 + 7, z * 0.06 + 3), n2 = fbm(x * 0.025 + 40, z * 0.025 - 11);
          tmp.copy(a).lerp(b, sstep(0.3, 0.7, n)); tmp.lerp(c, sstep(0.62, 0.9, n) * 0.55); tmp.lerp(v, sstep(0.5, 0.82, n2) * 0.36);
          tmp.lerp(e, sstep(WORLD - 1, WORLD + 18, r) * 0.88);
          col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
        }
        geo.setAttribute("color", new T.BufferAttribute(col, 3));
        own(new T.Mesh(geo, new T.MeshLambertMaterial({ vertexColors: true, map: grTex })));
      }
      const glow = def.edgeCol.map(C);
      // 둘레 — 여기까지가 놀이터 (빛나는 버섯 고리 · 돌 · 얼음 결정)
      {
        const NR = Math.round(84 * WORLD / 56);
        if (def.edge === "caps") {
          const capM = inst(G.cap, new T.MeshBasicMaterial({ map: capTex }), NR), stemM = inst(G.stem, new T.MeshLambertMaterial({ color: C(0xe9e2ff) }), NR);
          for (let i = 0; i < NR; i++) { const an = (i / NR) * TAU, r = WORLD + 1 + rand(-0.3, 0.5), s = rand(0.9, 1.5); put(stemM, i, Math.cos(an) * r, 0, Math.sin(an) * r, s); put(capM, i, Math.cos(an) * r, 0.5 * s, Math.sin(an) * r, s * 1.25); capM.setColorAt(i, glow[i % glow.length]); }
        } else if (def.edge === "stones") {
          const m = inst(K.dodeca, new T.MeshLambertMaterial(), NR);
          for (let i = 0; i < NR; i++) { const an = (i / NR) * TAU, r = WORLD + 1.2 + rand(-0.3, 0.6), s = rand(0.55, 1.05); put(m, i, Math.cos(an) * r, s * 0.3, Math.sin(an) * r, s, s * 0.7, s, rand(TAU)); m.setColorAt(i, tmp.copy(glow[i % glow.length]).multiplyScalar(rand(0.85, 1.15))); }
        } else {
          const m = inst(G.spike, new T.MeshBasicMaterial({ transparent: true, opacity: 0.85 }), NR);
          for (let i = 0; i < NR; i++) { const an = (i / NR) * TAU, r = WORLD + 1 + rand(-0.3, 0.5), s = rand(0.35, 0.6); put(m, i, Math.cos(an) * r, 0, Math.sin(an) * r, s, s * rand(2.2, 3.6), s, rand(TAU)); m.setColorAt(i, tmp.copy(glow[i % glow.length]).multiplyScalar(0.75)); }
        }
      }
      // 나무 · 덤불 — 카메라 반대편(북쪽 · 양옆)에만 키 크게, 카메라 쪽은 낮게
      const spots = [];
      [[WORLD + 7, 40], [WORLD + 14, 36], [WORLD + 23, 32], [WORLD + 33, 28]].forEach(([Rr, n], ri) => { for (let k = 0; k < n; k++) { const an = ((k + rand(0.7)) / n) * TAU, r = Rr + rand(-2, 2.5); spots.push({ x: Math.cos(an) * r, z: Math.sin(an) * r, front: Math.sin(an), ri }); } });
      const trees = spots.filter((s) => s.front < 0.3), bushes = spots.filter((s) => s.front >= 0.3);
      const pal = def.leaves.map(C), trunkMat = new T.MeshLambertMaterial({ color: C(def.trunk) });
      if (def.tree === "pine" || def.tree === "snowpine") {
        const trunkM = inst(G.trunk, trunkMat, trees.length), leafM = inst(G.tier, new T.MeshLambertMaterial(), trees.length * 3), white = C(0xf4f8ff);
        trees.forEach((t, i) => { const sc = rand(1, 1.9) * (1 + t.ri * 0.12), h = rand(4.5, 7.5) * sc * 0.8, ry = rand(TAU); put(trunkM, i, t.x, 0, t.z, sc, h, sc, ry); const base = pick(pal); for (let k = 0; k < 3; k++) { put(leafM, i * 3 + k, t.x, h * (0.45 + k * 0.3), t.z, sc * (2.9 - k * 0.62), sc * (3.6 - k * 0.4), sc * (2.9 - k * 0.62), ry + k); tmp.copy(base).multiplyScalar(0.8 + k * 0.22 + rand(-0.06, 0.06)); if (def.tree === "snowpine") tmp.lerp(white, 0.3 + k * 0.24); leafM.setColorAt(i * 3 + k, tmp); } });
      } else if (def.tree === "round" || def.tree === "willow") {
        const wil = def.tree === "willow";
        const trunkM = inst(G.trunk, trunkMat, trees.length), crownM = inst(G.sphLo, new T.MeshLambertMaterial(), trees.length * 2);
        trees.forEach((t, i) => { const sc = rand(1, 1.8) * (1 + t.ri * 0.12), h = rand(3.6, 5.6) * sc * (wil ? 1.05 : 0.8), ry = rand(TAU); put(trunkM, i, t.x, 0, t.z, sc * 0.9, h, sc * 0.9, ry); const base = pick(pal);
          if (wil) { put(crownM, i * 2, t.x, h * 0.95, t.z, sc * 3.2, sc * 2.2, sc * 3.2, ry); put(crownM, i * 2 + 1, t.x, h * 0.55, t.z, sc * 2.9, sc * 3.4, sc * 2.9, ry); }
          else { put(crownM, i * 2, t.x, h * 1.05, t.z, sc * 3, sc * 2.6, sc * 3, ry); put(crownM, i * 2 + 1, t.x + rand(-1.2, 1.2), h * 1.45, t.z + rand(-1, 1), sc * 2.1, sc * 1.9, sc * 2.1, ry); }
          crownM.setColorAt(i * 2, tmp.copy(base).multiplyScalar(rand(0.82, 1.02))); crownM.setColorAt(i * 2 + 1, tmp.copy(base).multiplyScalar(rand(0.95, 1.18))); });
      } else {
        // 동굴 — 나무 대신 종유석 기둥
        const stM = inst(G.spike, new T.MeshLambertMaterial(), trees.length);
        trees.forEach((t, i) => { const sc = rand(1.4, 2.6) * (1 + t.ri * 0.15); put(stM, i, t.x, 0, t.z, sc, sc * rand(3.5, 7), sc, rand(TAU)); stM.setColorAt(i, tmp.copy(C(def.trunk)).multiplyScalar(rand(0.8, 1.4))); });
      }
      {
        const bpal = def.bush.map(C), bushM = inst(G.sphLo, new T.MeshLambertMaterial(), bushes.length * 2);
        bushes.forEach((t, i) => { const s = rand(1.5, 2.6); put(bushM, i * 2, t.x, s * 0.35, t.z, s, s * 0.62, s); put(bushM, i * 2 + 1, t.x + rand(-1.6, 1.6), s * 0.25, t.z + rand(-1, 1), s * 0.7, s * 0.45, s * 0.7); const c = bpal[i % bpal.length]; bushM.setColorAt(i * 2, tmp.copy(c).multiplyScalar(rand(0.85, 1.1))); bushM.setColorAt(i * 2 + 1, tmp.copy(c).multiplyScalar(rand(0.95, 1.25))); });
      }
      // 빛나는 큰 버섯
      if (def.big > 0) {
        const every = Math.max(1, Math.round(1 / def.big)), big = trees.filter((t) => t.ri < (def.tree === "cave" ? 3 : 2)).filter((_, i) => i % every === 0);
        const bCap = inst(G.capHi, new T.MeshLambertMaterial({ emissive: C(0xffffff), emissiveMap: spotTex, emissiveIntensity: 0.7 }), big.length), bStem = inst(G.stemHi, new T.MeshLambertMaterial({ color: C(0xe4dcfa), emissive: C(0x2a2050) }), big.length);
        const bGill = inst(G.gill, new T.MeshLambertMaterial({ color: C(0x6b5a9a), emissive: C(0x2a1f55), side: T.DoubleSide }), big.length);
        const hp = [], hc = [];
        big.forEach((t, i) => { const s = rand(3.2, 5.6), x = t.x * 0.93 + rand(-2, 2), z = t.z * 0.93 + rand(-2, 2), col = glow[i % glow.length], ry = rand(TAU); put(bStem, i, x, 0, z, s, s, s, ry); put(bCap, i, x, 0.53 * s, z, s * 1.5, s * 1.2, s * 1.5, ry); put(bGill, i, x, 0.53 * s, z, s * 1.5, s, s * 1.5); bCap.setColorAt(i, tmp.copy(col).multiplyScalar(0.8)); hp.push(x, s * 0.8, z); hc.push(col.r * 0.55, col.g * 0.55, col.b * 0.55); });
        points(big.length, 11, (p, c) => { p.set(hp); c.set(hc); });
      }
      // 풀 · 조약돌 · 반짝이는 꽃
      {
        const gp = def.grass.map(C), grassM = inst(K.grass, new T.MeshLambertMaterial(), def.grassN);
        for (let i = 0; i < def.grassN; i++) { const an = rand(TAU), r = Math.sqrt(rand(1)) * (WORLD + 8); put(grassM, i, Math.cos(an) * r, 0, Math.sin(an) * r, rand(0.7, 1.5), rand(0.6, 1.9), rand(0.7, 1.5), rand(TAU)); grassM.setColorAt(i, pick(gp)); }
        const NP = 70, peb = inst(K.dodeca, new T.MeshLambertMaterial({ color: C(def.pebble) }), NP);
        for (let i = 0; i < NP; i++) { const an = rand(TAU), r = Math.sqrt(rand(1)) * (WORLD + 6), s = rand(0.18, 0.5); put(peb, i, Math.cos(an) * r, s * 0.2, Math.sin(an) * r, s, s * 0.55, s, rand(TAU)); }
        const fpal = def.flowers.map(C);
        points(def.flowerN, def.flowerSize, (p, c) => { for (let i = 0; i < def.flowerN; i++) { const an = rand(TAU), r = Math.sqrt(rand(1)) * (WORLD + 4), q = fpal[i % fpal.length], k = rand(0.35, 0.8); p[i * 3] = Math.cos(an) * r; p[i * 3 + 1] = 0.2; p[i * 3 + 2] = Math.sin(an) * r; c[i * 3] = q.r * k; c[i * 3 + 1] = q.g * k; c[i * 3 + 2] = q.b * k; } });
      }
      // 장애물
      solid = []; ice = [];
      const rocks = def.obs.filter((o) => o[3] === "rock");
      if (rocks.length) {
        const rm = inst(K.dodeca, new T.MeshLambertMaterial(), rocks.length * 3);
        rocks.forEach((o, i) => { const [x, z, r] = o; put(rm, i * 3, x, r * 0.3, z, r * 1.08, r * 0.8, r * 1.08, rand(TAU)); for (let k = 1; k < 3; k++) { const an = rand(TAU), s = r * rand(0.28, 0.42); put(rm, i * 3 + k, x + Math.cos(an) * r * 0.95, s * 0.25, z + Math.sin(an) * r * 0.95, s, s * 0.7, s, rand(TAU)); } for (let k = 0; k < 3; k++) rm.setColorAt(i * 3 + k, tmp.copy(C(def.rock || def.pebble)).multiplyScalar(rand(0.85, 1.15))); });
      }
      const pills = def.obs.filter((o) => o[3] === "pillar");
      if (pills.length) {
        const pm = inst(G.spike, new T.MeshLambertMaterial({ color: C(def.rock || def.trunk) }), pills.length), gm = inst(G.sphLo, new T.MeshBasicMaterial(), pills.length);
        pills.forEach((o, i) => { const [x, z, r] = o; put(pm, i, x, 0, z, r * 1.05, r * 4.2, r * 1.05, rand(TAU)); put(gm, i, x, r * 1.6, z, r * 0.45, r * 0.7, r * 0.45); gm.setColorAt(i, glow[i % glow.length]); });
        points(pills.length, 9, (p, c) => { pills.forEach((o, i) => { const q = glow[i % glow.length]; p[i * 3] = o[0]; p[i * 3 + 1] = o[2] * 1.6; p[i * 3 + 2] = o[1]; c[i * 3] = q.r * 0.6; c[i * 3 + 1] = q.g * 0.6; c[i * 3 + 2] = q.b * 0.6; }); });
      }
      def.obs.filter((o) => o[3] === "water" || o[3] === "ice").forEach((o) => {
        const [x, z, r, kind] = o, isIce = kind === "ice";
        const w = own(new T.Mesh(K.disc, new T.MeshStandardMaterial({ color: C(isIce ? 0xcfe6ff : def.water), roughness: isIce ? 0.08 : 0.18, metalness: isIce ? 0.05 : 0.2, emissive: C(isIce ? 0x6a8ab8 : def.water), emissiveIntensity: isIce ? 0.25 : 0.18, transparent: true, opacity: isIce ? 0.82 : 0.92, depthWrite: false })));
        w.position.set(x, 0.035, z); w.scale.setScalar(r);
        const s = own(new T.Mesh(K.shore, new T.MeshLambertMaterial({ color: C(isIce ? 0xffffff : def.shore) }))); s.position.set(x, 0.04, z); s.scale.setScalar(r);
        if (!isIce && def.lily) { const n = Math.round(r * 1.2), lm = inst(K.disc, new T.MeshLambertMaterial({ color: C(0x3a9a4a) }), n); for (let k = 0; k < n; k++) { const an = rand(TAU), rr = Math.sqrt(rand(1)) * r * 0.75; put(lm, k, x + Math.cos(an) * rr, 0.06, z + Math.sin(an) * rr, rand(0.35, 0.65)); } }
      });
      def.obs.forEach((o) => { const q = { x: o[0], z: o[1], r: o[2] }; if (o[3] === "ice") ice.push(q); else solid.push(q); });
      // 날리는 것 — 반딧불 · 낙엽 · 눈 · 꽃잎 · 포자
      {
        const N = def.airN, base = [], acol = def.airCol.map(C);
        for (let i = 0; i < N; i++) { const an = rand(TAU), r = Math.sqrt(rand(1)) * (WORLD + 12); base.push({ x: Math.cos(an) * r, y: rand(def.air === "fly" ? 1 : 0, def.air === "fly" ? 7 : 14), z: Math.sin(an) * r, p: rand(TAU), s: rand(0.3, 0.9), c: acol[i % acol.length] }); }
        const pts = points(N, def.airSize, () => {});
        air = { pts, base, mode: def.air, pos: pts.geometry.attributes.position, col: pts.geometry.attributes.color };
      }
    }
    function update(t) {
      if (!air) return;
      const { base, mode, pos, col } = air, P = pos.array, Cc = col.array;
      for (let i = 0; i < base.length; i++) {
        const f = base[i]; let x = f.x, y = f.y, z = f.z, k = 1;
        if (mode === "fly") { k = 0.45 + 0.55 * Math.sin(t * 1.7 * f.s + f.p * 3); x += Math.sin(t * f.s + f.p) * 2.2; y += Math.sin(t * f.s * 1.3 + f.p * 2) * 0.9; z += Math.cos(t * f.s * 0.8 + f.p) * 2.2; }
        else if (mode === "spore") { k = 0.4 + 0.6 * Math.sin(t * 1.3 * f.s + f.p * 3) ** 2; y = (f.y + t * f.s * 0.9) % 12; x += Math.sin(t * 0.5 * f.s + f.p) * 1.4; z += Math.cos(t * 0.4 * f.s + f.p) * 1.4; }
        else { const sp = mode === "snow" ? 1.5 : mode === "leaf" ? 1.0 : 0.7, sw = mode === "snow" ? 0.8 : 2.2; y = 14 - ((14 - f.y + t * f.s * sp) % 14); x += Math.sin(t * f.s * 1.1 + f.p) * sw; z += Math.cos(t * f.s * 0.9 + f.p) * sw * 0.6; k = mode === "snow" ? 0.75 : 0.6 + 0.4 * Math.sin(t * 3 * f.s + f.p) ** 2; }
        P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z; Cc[i * 3] = f.c.r * k; Cc[i * 3 + 1] = f.c.g * k; Cc[i * 3 + 2] = f.c.b * k;
      }
      pos.needsUpdate = true; col.needsUpdate = true;
    }
    const byId = (id) => JELLY_MAPS.find((m) => m.id === id) || JELLY_MAPS[0];
    return {
      maps: JELLY_MAPS,
      apply(id) { const def = byId(Number(id) || 1); if (cur === def && group) return false; dispose(); cur = def; build(def); return true; },
      get cur() { return cur; },
      world: () => cur.world,
      update,
      // 그 자리가 막혔는지 (물 · 바위 · 기둥 — 얼음은 지나갈 수 있다)
      blocked(x, z, pad) { for (const o of solid) if (Math.hypot(x - o.x, z - o.z) < o.r + pad) return true; return false; },
      onIce(x, z) { for (const o of ice) if (Math.hypot(x - o.x, z - o.z) < o.r) return true; return false; },
      // 장애물 안으로 들어갔으면 가장자리로 밀어내고 그쪽 속도를 없앤다
      push(c, rad) {
        for (const o of solid) {
          let dx = c.x - o.x, dz = c.z - o.z; const d = Math.hypot(dx, dz) || 1e-4, lim = o.r + rad;
          if (d >= lim) continue;
          dx /= d; dz /= d; c.x = o.x + dx * lim; c.z = o.z + dz * lim;
          const vn = c.vx * dx + c.vz * dz; if (vn < 0) { c.vx -= vn * dx; c.vz -= vn * dz; }
        }
      },
      // 가는 방향 앞에 장애물이 있으면 옆으로 돌아가게 (숲 친구 · 컴퓨터 젤리)
      steer(x, z, rad, dx, dz) {
        let sx = dx, sz = dz;
        for (const o of solid) {
          const ox = o.x - x, oz = o.z - z, d = Math.hypot(ox, oz) || 1e-4, gap = d - o.r - rad;
          if (gap > 4) continue;
          const ux = ox / d, uz = oz / d, fw = ux * dx + uz * dz;
          if (fw <= 0.15) continue;
          const side = ux * dz - uz * dx >= 0 ? 1 : -1, w = clamp(1 - gap / 4, 0, 1) * fw;
          sx += -uz * side * w * 1.6 - ux * w * 0.5; sz += ux * side * w * 1.6 - uz * w * 0.5;
        }
        const l = Math.hypot(sx, sz) || 1; return [sx / l, sz / l];
      },
      // 먹이 자리 — 맵마다 퍼짐이 다르다(고르게 · 가운데 · 가장자리 · 무리). rng 는 0~1 수를 내는 함수
      foodPos(rng, pad) {
        const W = cur.world - pad;
        let x = 0, z = 0;
        for (let k = 0; k < 12; k++) {
          const u = rng(), an = rng() * TAU;
          if (cur.food === "patches" && u < 0.7) { const pt = cur.patches[(rng() * cur.patches.length) | 0], rr = Math.sqrt(rng()) * 10; x = pt[0] + Math.cos(an) * rr; z = pt[1] + Math.sin(an) * rr; const l = Math.hypot(x, z); if (l > W) { x *= W / l; z *= W / l; } }
          else { const v = cur.food === "patches" ? (u - 0.7) / 0.3 : u, rr = cur.food === "center" ? Math.pow(v, 0.8) * W : cur.food === "ring" ? Math.sqrt(0.3 + 0.7 * v) * W : Math.sqrt(v) * W; x = Math.cos(an) * rr; z = Math.sin(an) * rr; }
          if (!this.blocked(x, z, 0.8)) break;
        }
        return { x, z };
      },
    };
  }


  // ───────── 화면 글 · 꾸밈 (한 번만 넣는다)
  const CSS = `
.jv-root{position:absolute;inset:0;overflow:hidden;border-radius:inherit;background:#120d2b;color:#f7f0ff;font-family:"Pretendard","Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif;-webkit-user-select:none;user-select:none;touch-action:none}
.jv-root canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}
.jv-hud{position:absolute;inset:0;pointer-events:none;font-variant-numeric:tabular-nums}
.jv-root.is-demo .jv-hud{display:none}
.jv-tl{position:absolute;left:10px;top:10px;display:flex;flex-direction:column;gap:6px}
.jv-stats{display:flex;gap:14px;padding:6px 12px 5px;border-radius:14px;background:rgba(18,13,43,.78);box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.08)}
.jv-stat{display:flex;flex-direction:column-reverse;gap:2px;line-height:1}
.jv-stat b{font-weight:800;font-size:20px}
.jv-stat span{font-size:11.5px;color:#b9add9}
.jv-tc{position:absolute;left:50%;top:8px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:5px;width:min(52%,340px)}
.jv-timer{font-size:30px;font-weight:800;line-height:1;padding:5px 16px 4px;border-radius:999px;background:rgba(18,13,43,.78);box-shadow:inset 0 0 0 2px rgba(255,255,255,.1)}
.jv-timer.is-low{color:#ff5d6c}
.jv-duel{position:relative;width:100%;height:12px;border-radius:7px;overflow:hidden;background:rgba(18,13,43,.75);box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.14);display:flex}
.jv-duel i{display:block;height:100%;transition:width .3s}
.jv-duel__me{background:linear-gradient(90deg,var(--jv-me),#fff0)}
.jv-duel__rv{margin-left:auto;background:linear-gradient(270deg,var(--jv-rv),#fff0)}
.jv-duel::after{content:"";position:absolute;left:50%;top:-2px;bottom:-2px;width:2px;margin-left:-1px;background:rgba(255,255,255,.6)}
.jv-names{display:flex;justify-content:space-between;width:100%;font-size:12px;font-weight:700;text-shadow:0 1px 4px rgba(8,4,26,.95)}
.jv-names span{max-width:48%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.jv-msg{font-size:12.5px;text-shadow:0 1px 4px rgba(8,4,26,.95);white-space:nowrap;text-align:center}
.jv-msg.is-ok{color:#7dffd0;font-weight:800;font-size:14px}
.jv-msg.is-bad{color:#ff8a95;font-weight:800;font-size:14px}
.jv-dash{position:absolute;right:14px;bottom:calc(env(safe-area-inset-bottom,0px) + 14px);pointer-events:auto;width:86px;height:86px;border-radius:50%;border:0;color:#b9add9;
  background:radial-gradient(circle at 35% 30%,#3b2f7a,#1d1548);box-shadow:inset 0 0 0 3px rgba(255,255,255,.12),0 6px 18px rgba(8,4,26,.5);display:none;flex-direction:column;align-items:center;justify-content:center;gap:3px;font:800 13px/1 inherit;touch-action:none;-webkit-tap-highlight-color:transparent}
.jv-root.is-touch .jv-dash{display:flex}
.jv-dash svg{width:28px;height:28px;fill:#6f63a8}
.jv-dash.is-ready{box-shadow:inset 0 0 0 3px #ffe27a,0 0 22px rgba(255,226,122,.45),0 6px 18px rgba(8,4,26,.5);color:#f7f0ff}
.jv-dash.is-ready svg{fill:#ffe27a}
.jv-dash:active{transform:scale(.93)}
.jv-pips{display:flex;gap:4px}
.jv-pips i{width:10px;height:10px;border-radius:50%;background:#3d3270;box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.14)}
.jv-pips i.on{background:#ffe27a;box-shadow:0 0 8px #ffe27a}
.jv-root:not(.is-touch) .jv-tl .jv-pips{display:flex}
.jv-tl .jv-pips{display:none;padding-left:4px}
.jv-keys{position:absolute;left:12px;bottom:10px;font-size:12px;color:#b9add9;text-shadow:0 1px 4px rgba(8,4,26,.95)}
.jv-root.is-touch .jv-keys{display:none}
.jv-keys kbd{font:inherit;font-size:11px;padding:1px 6px;border-radius:5px;background:rgba(18,13,43,.75);box-shadow:inset 0 0 0 1px rgba(255,255,255,.2);color:#f7f0ff}
.jv-stick{position:absolute;left:0;top:0;width:108px;height:108px;margin:-54px 0 0 -54px;border-radius:50%;pointer-events:none;display:none;background:rgba(255,255,255,.07);box-shadow:inset 0 0 0 2px rgba(255,255,255,.22)}
.jv-stick i{position:absolute;left:50%;top:50%;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:rgba(255,255,255,.55);box-shadow:0 0 14px rgba(255,255,255,.4)}
.jv-pop{position:absolute;left:0;top:0;font-size:20px;font-weight:800;white-space:nowrap;color:#ffe27a;will-change:transform,opacity;text-shadow:0 2px 0 #2a1650,0 0 6px #2a1650}
.jv-pop.bad{color:#ff5d6c}.jv-pop.mint{color:#7dffd0}
.jv-tag{position:absolute;left:0;top:0;padding:3px 9px;border-radius:999px;font-size:12px;font-weight:800;white-space:nowrap;background:rgba(18,13,43,.8);box-shadow:inset 0 0 0 2px rgba(255,255,255,.25);transform:translate(-50%,-100%);display:none;max-width:140px;overflow:hidden;text-overflow:ellipsis}
.jv-tag.ok{box-shadow:inset 0 0 0 2px #4dffa0;color:#b8ffd9}
.jv-tag.bad{box-shadow:inset 0 0 0 2px #ff3b4f;color:#ffc2c8}
.jv-tag.me{background:rgba(255,255,255,.9);color:#2a1650;box-shadow:none;font-size:11px;padding:2px 7px}
.jv-arrow{position:absolute;left:0;top:0;width:46px;height:46px;margin:-23px 0 0 -23px;pointer-events:none;display:none;border-radius:50%;background:rgba(18,13,43,.82);box-shadow:inset 0 0 0 2.5px #cfd3ff;place-items:center}
.jv-arrow em{position:absolute;inset:-11px;display:block}
.jv-arrow em::after{content:"";position:absolute;left:50%;top:-3px;margin-left:-7px;border:7px solid transparent;border-bottom:10px solid #cfd3ff}
.jv-arrow span{width:22px;height:22px;border-radius:50%;background:var(--jv-rv)}
.jv-arrow.ok{box-shadow:inset 0 0 0 2.5px #4dffa0}.jv-arrow.ok em::after{border-bottom-color:#4dffa0}
.jv-arrow.bad{box-shadow:inset 0 0 0 2.5px #ff3b4f}.jv-arrow.bad em::after{border-bottom-color:#ff3b4f}
.jv-banner{position:absolute;left:50%;top:30%;transform:translate(-50%,-50%) scale(.9);font-size:clamp(20px,4vw,34px);font-weight:800;text-align:center;pointer-events:none;opacity:0;transition:opacity .25s,transform .25s;text-shadow:0 3px 0 #2a1650,0 0 14px rgba(18,13,43,.9);max-width:92%;word-break:keep-all}
.jv-banner.on{opacity:1;transform:translate(-50%,-50%) scale(1)}
.jv-banner.mint{color:#7dffd0}.jv-banner.bad{color:#ff5d6c}
.jv-big{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:64px;font-weight:900;pointer-events:none;text-shadow:0 4px 0 #2a1650,0 0 20px rgba(18,13,43,.9);display:none}
.jv-hold{position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);padding:10px 18px;border-radius:14px;background:rgba(18,13,43,.85);font-size:16px;font-weight:800;pointer-events:none;display:none;white-space:nowrap}
@media (max-width:560px){.jv-stat b{font-size:17px}.jv-tl{top:116px}.jv-timer{font-size:26px}.jv-tc{width:min(70%,340px)}.jv-msg{font-size:11.5px}.jv-msg.is-ok,.jv-msg.is-bad{font-size:12.5px}}
`;
  function injectCss() { if (document.getElementById("jv-css")) return; const s = document.createElement("style"); s.id = "jv-css"; s.textContent = CSS; document.head.appendChild(s); }

  // ───────── 숲 (한 번만 만들고 판마다 다시 쓴다 — 3D 화면을 여러 번 만들지 않게)
  let W0 = null;
  function C(h) { return new T.Color(h).convertSRGBToLinear(); }
  function buildWorld() {
    if (W0) return W0;
    if (!T) throw new Error("no three");
    const canvas = document.createElement("canvas");
    const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(52, 1, 0.5, 460);
    const canvasTex = (w, h, draw) => { const cv = document.createElement("canvas"); cv.width = w; cv.height = h; draw(cv.getContext("2d"), w, h); const t = new T.CanvasTexture(cv); t.encoding = T.sRGBEncoding; return t; };
    const glowTex = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.22, "rgba(255,255,255,.6)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
    const G = {
      sph: new T.SphereGeometry(1, 30, 22), sphLo: new T.SphereGeometry(1, 14, 10), berry: new T.SphereGeometry(1, 10, 7),
      cyl: new T.CylinderGeometry(1, 1, 1, 7), spike: new T.ConeGeometry(1, 1, 6).translate(0, 0.5, 0), box: new T.BoxGeometry(1, 1, 1),
      disc: new T.CircleGeometry(1, 30).rotateX(-Math.PI / 2), ring: new T.RingGeometry(1.2, 1.36, 44).rotateX(-Math.PI / 2), flat: new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      cap: new T.SphereGeometry(0.5, 14, 8, 0, TAU, 0, Math.PI / 2).scale(1, 0.78, 1), stem: new T.CylinderGeometry(0.15, 0.21, 0.56, 8).translate(0, 0.28, 0),
      trunk: new T.CylinderGeometry(0.34, 0.6, 1, 6).translate(0, 0.5, 0), band: new T.CylinderGeometry(0.44, 0.5, 0.2, 12, 1, true),
      tier: new T.LatheGeometry([[0, 0.1], [0.84, 0.02], [1, 0.08], [0.9, 0.17], [0.55, 0.52], [0.2, 0.86], [0, 1]].map((p) => new T.Vector2(p[0], p[1])), 11),
      capHi: new T.SphereGeometry(0.5, 28, 12, 0, TAU, 0, Math.PI / 2).scale(1, 0.78, 1), gill: new T.CircleGeometry(0.49, 28).rotateX(Math.PI / 2).translate(0, 0.004, 0),
      stemHi: new T.LatheGeometry([[0.27, 0], [0.2, 0.06], [0.16, 0.2], [0.15, 0.4], [0.17, 0.56]].map((p) => new T.Vector2(p[0], p[1])), 12),
    };
    const dummy = new T.Object3D();
    const inst = (geo, mat, n) => { const m = new T.InstancedMesh(geo, mat, n); m.frustumCulled = false; scene.add(m); return m; };
    const put = (m, i, x, y, z, sx, sy, sz, ry) => { dummy.position.set(x, y, z); dummy.rotation.set(0, ry || 0, 0); dummy.scale.set(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); };

    // 하늘 · 빛 · 땅 · 나무 · 날리는 것 · 장애물은 맵 도구가 맵마다 새로 만든다 (앞 맵 것은 버린다)
    MK = JellyMapKit(T, { scene, renderer, C, canvasTex, glowTex, G });
    MK.apply(1); WORLD = MK.world();
    RNG = mulberry(20261113); // 먹을 것 · 젤리 꾸밈은 늘 같은 모습 — 두 사람 화면이 같게
    // 터지는 가루
    const PN = 320, P = [], pPos = new Float32Array(PN * 3), pCol = new Float32Array(PN * 3);
    for (let i = 0; i < PN; i++) { P.push({ life: 0, max: 1, x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, r: 1, g: 1, b: 1 }); pPos[i * 3 + 1] = -99; }
    const pGeo = new T.BufferGeometry(); pGeo.setAttribute("position", new T.BufferAttribute(pPos, 3)); pGeo.setAttribute("color", new T.BufferAttribute(pCol, 3));
    const pPts = new T.Points(pGeo, new T.PointsMaterial({ size: 0.75, map: glowTex, vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false })); pPts.frustumCulled = false; scene.add(pPts);
    let pIdx = 0;
    function burst(x, y, z, n, col, speed, up) { for (let k = 0; k < n; k++) { const p = P[(pIdx = (pIdx + 1) % PN)], a = rand(TAU), e = rand(0.25, 1); p.x = x; p.y = y; p.z = z; p.vx = Math.cos(a) * speed * e; p.vz = Math.sin(a) * speed * e; p.vy = rand(0.4, 1) * up; p.life = p.max = rand(0.35, 0.8); p.r = col.r; p.g = col.g; p.b = col.b; } }
    function updateParticles(dt) { for (let i = 0; i < PN; i++) { const p = P[i]; if (p.life <= 0) continue; p.life -= dt; if (p.life <= 0) { pPos[i * 3 + 1] = -99; pCol[i * 3] = pCol[i * 3 + 1] = pCol[i * 3 + 2] = 0; continue; } p.vy -= 11 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; if (p.y < 0.12) { p.y = 0.12; p.vy *= -0.35; } const f = p.life / p.max; pPos[i * 3] = p.x; pPos[i * 3 + 1] = p.y; pPos[i * 3 + 2] = p.z; pCol[i * 3] = p.r * f; pCol[i * 3 + 1] = p.g * f; pCol[i * 3 + 2] = p.b * f; } pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true; }
    function clearParticles() { for (const p of P) p.life = 0; for (let i = 0; i < PN; i++) { pPos[i * 3 + 1] = -99; pCol[i * 3] = pCol[i * 3 + 1] = pCol[i * 3 + 2] = 0; } }

    // 먹을 것: 열매 · 버섯 · 별빛 구슬
    const BERRY_COL = [C(0xff4d6d), C(0x6b8cff), C(0xc77dff), C(0xffb347)];
    const B_OFF = [[0.2, 0.27, 0], [-0.1, 0.27, 0.17], [-0.1, 0.27, -0.17], [0, 0.56, 0]];
    const berryM = inst(G.berry, new T.MeshStandardMaterial({ roughness: 0.3, metalness: 0, emissive: C(0x2a1030) }), N_BERRY * 4);
    const dotTex = canvasTex(128, 64, (g, w, h) => { g.fillStyle = "#000"; g.fillRect(0, 0, w, h); g.fillStyle = "#fff"; for (let i = 0; i < 16; i++) { g.beginPath(); g.arc((i * 37 + 11) % w, 6 + ((i * 23) % (h - 22)), 3 + (i % 3) * 1.6, 0, TAU); g.fill(); } });
    const SHROOM_COL = [C(0xff5a6e), C(0xffa34d), C(0xb07bff)];
    const shCapM = inst(G.cap, new T.MeshLambertMaterial({ emissive: C(0xffffff), emissiveMap: dotTex, emissiveIntensity: 0.95 }), N_SHROOM);
    const shStemM = inst(G.stem, new T.MeshLambertMaterial({ color: C(0xf3ecdc) }), N_SHROOM);
    const M_orb = new T.MeshStandardMaterial({ color: C(0xffe27a), emissive: C(0xffc93c), emissiveIntensity: 0.85, roughness: 0.28, metalness: 0.15 });
    const M_orbHalo = new T.SpriteMaterial({ map: glowTex, color: C(0xffe27a), blending: T.AdditiveBlending, depthWrite: false, transparent: true });
    const orbGeo = (() => { const sh = new T.Shape(); for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU + Math.PI / 2, r = i % 2 ? 0.2 : 0.46; i ? sh.lineTo(Math.cos(a) * r, Math.sin(a) * r) : sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); } const g = new T.ExtrudeGeometry(sh, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.07, bevelSegments: 3, curveSegments: 1 }); g.center(); return g; })();
    const food = [];
    for (let i = 0; i < N_FOOD; i++) {
      const type = foodType(i), f = { i, type, gen: 0, alive: true, t: 0, pop: 1, x: 0, z: 0, ph: rand(TAU), col: i % 4, sz: 1 };
      if (type === 0) for (let k = 0; k < 4; k++) berryM.setColorAt(i * 4 + k, BERRY_COL[f.col]);
      if (type === 1) { const j = i - N_BERRY; f.sz = 1.05 + ((j * 7) % 10) / 22; shCapM.setColorAt(j, SHROOM_COL[j % 3]); }
      if (type === 2) { const g = new T.Group(), core = new T.Mesh(orbGeo, M_orb), halo = new T.Sprite(M_orbHalo); halo.scale.setScalar(3.2); g.add(core); g.add(halo); scene.add(g); f.g = g; f.core = core; }
      food.push(f);
    }
    function updateFoodVisuals(t, dt) {
      const fsc = MK.cur.foodScale || 1;
      for (let i = 0; i < N_BERRY; i++) { const b = food[i]; b.pop = b.alive ? damp(b.pop, 1, 9, dt) : 0; const s = fsc * b.pop * 0.27 * (1 + 0.07 * Math.sin(t * 3 + b.ph)); for (let k = 0; k < 4; k++) { const o = B_OFF[k]; put(berryM, i * 4 + k, b.x + o[0] * b.pop, o[1] * b.pop, b.z + o[2] * b.pop, s); } }
      berryM.instanceMatrix.needsUpdate = true;
      for (let j = 0; j < N_SHROOM; j++) { const b = food[N_BERRY + j]; b.pop = b.alive ? damp(b.pop, 1, 9, dt) : 0; const s = fsc * b.pop * b.sz, w = 1 + 0.04 * Math.sin(t * 2.4 + b.ph); put(shStemM, j, b.x, 0, b.z, s, s * w, s); put(shCapM, j, b.x, 0.5 * s * w, b.z, s * 1.25, s * 1.25 * (2 - w), s * 1.25, b.ph); }
      shStemM.instanceMatrix.needsUpdate = true; shCapM.instanceMatrix.needsUpdate = true;
      for (let i = N_BERRY + N_SHROOM; i < N_FOOD; i++) { const o = food[i]; o.pop = o.alive ? damp(o.pop, 1, 8, dt) : 0; o.g.visible = o.pop > 0.02; o.g.position.set(o.x, 1.05 + 0.28 * Math.sin(t * 2.2 + o.ph), o.z); o.g.scale.setScalar(o.pop); o.core.rotation.y = t * 2 + o.ph; }
    }

    // 젤리와 숲 친구들
    const KIND_COL = { lime: 0xc3f25c, puff: 0x5ec8ff, ember: 0xffa24f, shade: 0xa98bff, boss: 0x7d2f9c };
    const M = {
      shadow: new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }),
      eyeW: new T.MeshBasicMaterial({ color: C(0xffffff), toneMapped: false }), dark: new T.MeshBasicMaterial({ color: C(0x1a1030) }),
      cheek: new T.MeshBasicMaterial({ color: C(0xff4f9a) }), gold: new T.MeshBasicMaterial({ color: C(0xffe27a) }),
      crown: new T.MeshStandardMaterial({ color: C(0xffd24a), roughness: 0.3, metalness: 0.5, emissive: C(0xffb020), emissiveIntensity: 0.5, side: T.DoubleSide }),
      tooth: new T.MeshLambertMaterial({ color: C(0xfff8e8) }), thorn: new T.MeshLambertMaterial({ color: C(0x221342) }),
      haloGold: new T.SpriteMaterial({ map: glowTex, color: C(0xffe27a), blending: T.AdditiveBlending, depthWrite: false, transparent: true }),
      ringOk: new T.MeshBasicMaterial({ color: C(0x4dffa0), transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false }),
      ringBad: new T.MeshBasicMaterial({ color: C(0xff3b4f), transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false }),
      ringN: new T.MeshBasicMaterial({ color: C(0xcfd3ff), transparent: true, opacity: 0.3, depthWrite: false, toneMapped: false }),
      shine: new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }),
    };
    const part = (geo, mat, x, y, z, sx, sy, sz, parent) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz); parent.add(m); return m; };
    function buildCreature(kind, jcol) {
      const root = new T.Group(), tilt = new T.Group(), sq = new T.Group(); root.add(tilt); tilt.add(sq);
      const shadow = new T.Mesh(G.disc, M.shadow); shadow.position.y = 0.03; shadow.scale.setScalar(0.95); root.add(shadow);
      const o = { root, tilt, sq, ring: null, brows: null, mouth: null };
      o.ring = new T.Mesh(G.ring, M.ringN); o.ring.position.y = 0.06; root.add(o.ring);
      if (kind === "jelly") {
        const gl = new T.Mesh(G.flat, new T.MeshBasicMaterial({ map: glowTex, color: C(jcol), transparent: true, opacity: 0.42, blending: T.AdditiveBlending, depthWrite: false })); gl.position.y = 0.045; gl.scale.setScalar(5.2); root.add(gl);
        const mat = new T.MeshPhysicalMaterial({ color: C(jcol), roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.2, transparent: true, opacity: 0.84, emissive: C(jcol), emissiveIntensity: 0.24 });
        const core = new T.MeshBasicMaterial({ color: C(jcol).lerp(C(0xffffff), 0.6) });
        part(G.sphLo, core, 0, 0.78, 0, 0.55, 0.48, 0.55, sq);
        part(G.sph, mat, 0, 0.88, 0, 1, 0.9, 1, sq);
        { const h = part(G.sphLo, M.shine, -0.42, 1.42, 0.42, 0.2, 0.12, 0.09, sq); h.rotation.set(-0.6, -0.7, 0.5); }
        for (const sx of [-1, 1]) { part(G.sphLo, M.eyeW, sx * 0.34, 1.1, 0.8, 0.25, 0.27, 0.2, sq); part(G.sphLo, M.dark, sx * 0.33, 1.11, 0.95, 0.13, 0.15, 0.09, sq); part(G.sphLo, M.eyeW, sx * 0.33 + 0.05, 1.17, 1.02, 0.04, 0.04, 0.03, sq); part(G.sphLo, M.cheek, sx * 0.63, 0.84, 0.72, 0.13, 0.1, 0.1, sq); }
        o.mouth = part(G.sphLo, M.dark, 0, 0.78, 0.975, 0.12, 0.05, 0.05, sq);
        const st = part(G.cyl, new T.MeshLambertMaterial({ color: C(jcol).multiplyScalar(0.8) }), 0.07, 1.98, 0, 0.035, 0.46, 0.035, sq); st.rotation.z = -0.28;
        part(G.sphLo, M.gold, 0.14, 2.24, 0, 0.12, 0.12, 0.12, sq);
        const halo = new T.Sprite(M.haloGold); halo.position.set(0.14, 2.24, 0); halo.scale.setScalar(0.95); sq.add(halo);
        return o;
      }
      const base = KIND_COL[kind];
      const mat = new T.MeshStandardMaterial({ color: C(base), roughness: 0.42, metalness: 0, emissive: C(base), emissiveIntensity: kind === "boss" ? 0.2 : 0.14 }); o.body = mat; o.fade = 1;
      const dk = new T.MeshLambertMaterial({ color: C(base).multiplyScalar(0.5) });
      part(G.sph, mat, 0, 0.88, 0, 1, 0.9, 1, sq);
      { const h = part(G.sphLo, M.shine, -0.42, 1.42, 0.42, 0.2, 0.12, 0.09, sq); h.rotation.set(-0.6, -0.7, 0.5); }
      const brows = new T.Group(); sq.add(brows); o.brows = brows;
      for (const sx of [-1, 1]) { const b = part(G.box, M.dark, sx * 0.37, 1.4, 0.84, 0.34, 0.08, 0.1, brows); b.rotation.z = sx * 0.5; b.rotation.x = -0.3; }
      if (kind === "boss") {
        for (const sx of [-1, 1]) { part(G.sphLo, M.gold, sx * 0.4, 1.13, 0.79, 0.21, 0.2, 0.18, sq); part(G.sphLo, M.dark, sx * 0.4, 1.13, 0.95, 0.045, 0.15, 0.06, sq); }
        part(G.sphLo, M.dark, 0, 0.62, 0.9, 0.46, 0.11, 0.13, sq);
        for (const x of [-0.28, -0.1, 0.1, 0.28]) { const t = part(G.spike, M.tooth, x, 0.74, 0.985, 0.07, 0.15, 0.07, sq); t.rotation.x = Math.PI; }
        part(G.band, M.crown, 0, 1.84, 0, 1, 1, 1, sq);
        for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + 0.3; part(G.spike, M.crown, Math.cos(a) * 0.42, 1.9, Math.sin(a) * 0.42, 0.11, 0.34, 0.11, sq); }
        for (let k = 0; k < 6; k++) { const an = lerp(0.62, 2.35, k / 5), s = part(G.spike, M.thorn, 0, 0.88 + 0.86 * Math.cos(an), -0.95 * Math.sin(an), 0.15, 0.5, 0.15, sq); s.rotation.x = -an; }
        for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) { const an = lerp(0.9, 2, k / 2), s = part(G.spike, M.thorn, sx * 0.55 * Math.sin(an), 0.88 + 0.84 * Math.cos(an), -0.75 * Math.sin(an), 0.12, 0.36, 0.12, sq); s.rotation.x = -an; s.rotation.z = -sx * 0.6; }
        brows.visible = true;
      } else {
        for (const sx of [-1, 1]) { part(G.sphLo, M.eyeW, sx * 0.35, 1.12, 0.8, 0.21, 0.22, 0.17, sq); part(G.sphLo, M.dark, sx * 0.35, 1.12, 0.93, 0.11, 0.12, 0.08, sq); }
        part(G.sphLo, M.dark, 0, 0.8, 0.975, 0.09, 0.035, 0.05, sq);
        brows.visible = false;
        if (kind === "lime") { for (const sx of [-1, 1]) { const l = part(G.sphLo, dk, sx * 0.2, 1.98, 0, 0.1, 0.34, 0.2, sq); l.rotation.z = -sx * 0.7; } }
        else if (kind === "puff") { for (const sx of [-1, 1]) part(G.sphLo, mat, sx * 0.64, 1.5, -0.05, 0.3, 0.3, 0.3, sq); }
        else if (kind === "ember") { for (let k = 0; k < 4; k++) { const an = lerp(0.15, 1.9, k / 3), s = part(G.spike, dk, 0, 0.88 + 0.86 * Math.cos(an), -0.95 * Math.sin(an), 0.16, 0.42, 0.16, sq); s.rotation.x = -an; } }
        else { for (const sx of [-1, 1]) { const h = part(G.spike, M.tooth, sx * 0.46, 1.58, 0.1, 0.12, 0.46, 0.12, sq); h.rotation.z = -sx * 0.45; } }
      }
      return o;
    }
    const RKINDS = ["lime", "puff", "ember", "shade"];
    const makeEnt = (kind, idx, jcol) => { const g = buildCreature(kind, jcol); scene.add(g.root); return { kind, idx, isJ: kind === "jelly", isBoss: kind === "boss", g, x: 0, z: 0, vx: 0, vz: 0, m: 1, s: 1, ds: 1, yaw: 0, hop: rand(TAU), gulp: 0, state: "ok", t: 0, think: rand(0.3), mode: "wander", tgt: null, wang: rand(TAU), calm: 0, full: 0, chaseT: 0, side: RNG() < 0.5 ? -1 : 1, eater: null, ph: rand(TAU) }; };
    // all: 0 주인 젤리 · 1 손님 젤리 · 2 가시대왕 · 3~ 숲 친구 (둘이 같은 번호를 쓴다)
    const all = [makeEnt("jelly", 0, JCOL[0]), makeEnt("jelly", 1, JCOL[1]), makeEnt("boss", 2)];
    for (let i = 0; i < N_FRIEND; i++) all.push(makeEnt(RKINDS[(i >> 1) % 4], 3 + i));
    RNG = Math.random;

    // 맵 바꾸기 — 숲을 다시 만들고 먹을 것 색을 맵에 맞춘다. 바뀌었으면 true
    function setMap(id) {
      const changed = MK.apply(id); WORLD = MK.world(); W0.mapId = MK.cur.id;
      if (changed) {
        MK.cur.berry.forEach((h, k) => BERRY_COL[k].copy(C(h))); MK.cur.shroom.forEach((h, k) => SHROOM_COL[k].copy(C(h)));
        for (const f of food) { if (f.type === 0) for (let k = 0; k < 4; k++) berryM.setColorAt(f.i * 4 + k, BERRY_COL[f.col]); else if (f.type === 1) shCapM.setColorAt(f.i - N_BERRY, SHROOM_COL[(f.i - N_BERRY) % 3]); }
        berryM.instanceColor.needsUpdate = true; shCapM.instanceColor.needsUpdate = true;
      }
      return changed;
    }
    W0 = { canvas, renderer, scene, camera, all, food, M, KIND_COL, BERRY_COL, SHROOM_COL, C, burst, updateParticles, clearParticles, updateFlies: (t) => MK.update(t), updateFoodVisuals, setMap, mapId: 1, session: null, last: 0, raf: 0, tG: 0 };
    return W0;
  }

  // ───────── 소리 (누른 뒤에만 켠다)
  let AC = null, master = null;
  function initAudio() { if (AC) { if (AC.state === "suspended") AC.resume().catch(() => {}); return; } try { AC = new (window.AudioContext || window.webkitAudioContext)(); master = AC.createGain(); master.gain.value = 0.45; master.connect(AC.destination); } catch (_) { AC = null; } }
  let mutedFn = () => false;
  function tone(f0, f1, dur, type, vol, delay) { if (!AC || mutedFn()) return; try { const t = AC.currentTime + (delay || 0), o = AC.createOscillator(), g = AC.createGain(); o.type = type || "sine"; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.25, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.04); } catch (_) { /* 소리 없이 */ } }
  function whoosh(dur, vol) { if (!AC || mutedFn()) return; try { const n = Math.floor(AC.sampleRate * dur), buf = AC.createBuffer(1, n, AC.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n); const s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain(), t = AC.currentTime; s.buffer = buf; f.type = "bandpass"; f.Q.value = 1.2; f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(2600, t + dur); g.gain.value = vol; s.connect(f); f.connect(g); g.connect(master); s.start(); } catch (_) { /* 소리 없이 */ } }
  const SFX = {
    berry() { tone(640 + Math.random() * 140, 1040, 0.09, "sine", 0.2); }, shroom() { tone(420, 780, 0.13, "triangle", 0.24); },
    orb() { tone(880, 1320, 0.1, "sine", 0.2); tone(1320, 1980, 0.16, "sine", 0.18, 0.08); },
    gulp() { tone(320, 110, 0.2, "sine", 0.42); tone(150, 330, 0.15, "triangle", 0.26, 0.13); },
    dash() { whoosh(0.28, 0.3); tone(300, 900, 0.18, "sine", 0.12); }, hurt() { tone(440, 100, 0.38, "sawtooth", 0.22); },
    tick() { tone(900, 900, 0.05, "square", 0.07); }, ready() { tone(523, 523, 0.12, "triangle", 0.2); tone(784, 784, 0.2, "triangle", 0.2, 0.12); },
    go() { [659, 784, 988].forEach((f, i) => tone(f, f, 0.16, "triangle", 0.22, i * 0.09)); },
    win() { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, f, 0.3, "triangle", 0.24, i * 0.11)); },
    lose() { [392, 330, 262, 196].forEach((f, i) => tone(f, f * 0.96, 0.32, "triangle", 0.24, i * 0.17)); },
  };

  // ───────── 한 판
  function create(container, opts) {
    opts = opts || {};
    injectCss();
    const w = buildWorld();
    if (w.session) w.session.destroy();
    const mode = opts.mode || "cpu";
    if (mode !== "guest") w.setMap(opts.map || 1); // guest 는 주인이 보낸 맵을 쓴다
    const online = mode === "host" || mode === "guest";
    const sim = mode !== "guest"; // 판을 직접 계산하는 쪽
    const me = mode === "guest" ? 1 : 0, rv = 1 - me;
    const touch = !!opts.touch;
    mutedFn = typeof opts.isMuted === "function" ? opts.isMuted : () => false;
    const { all, food, M, C: Cc, burst, renderer, camera, scene } = w;
    const J = [all[0], all[1]], boss = all[2], friends = all.slice(3);
    const names = [mode === "guest" ? (opts.rival && opts.rival.name) || "상대" : (opts.me && opts.me.name) || "나", mode === "guest" ? (opts.me && opts.me.name) || "나" : (opts.rival && opts.rival.name) || (mode === "cpu" ? "컴퓨터" : "상대")];
    const hex = (n) => `#${n.toString(16).padStart(6, "0")}`;

    // 화면 글
    const root = document.createElement("div");
    root.className = `jv-root${touch ? " is-touch" : ""}${mode === "demo" ? " is-demo" : ""}`;
    root.style.setProperty("--jv-me", hex(JCOL[me]));
    root.style.setProperty("--jv-rv", hex(JCOL[rv]));
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    root.innerHTML = `<div class="jv-hud">
        <div class="jv-tl"><div class="jv-stats"><div class="jv-stat"><b data-v="size">1.0</b><span>내 크기</span></div><div class="jv-stat"><b data-v="eat">0</b><span>삼킨 친구</span></div></div><span class="jv-pips" data-v="pips2"><i></i><i></i><i></i></span></div>
        <div class="jv-tc"><div class="jv-timer" data-v="timer">2:00</div>
          <div class="jv-names"><span>${esc(names[me])} <b data-v="ms">1.0</b></span><span><b data-v="rs">1.0</b> ${esc(names[rv])}</span></div>
          <div class="jv-duel"><i class="jv-duel__me" data-v="dm"></i><i class="jv-duel__rv" data-v="dr"></i></div>
          <div class="jv-msg" data-v="msg"></div></div>
        <button type="button" class="jv-dash" data-v="dash" aria-label="대시"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2v11h3v9l7-12h-4l4-8z"/></svg><span class="jv-pips" data-v="pips"><i></i><i></i><i></i></span>대시</button>
        <div class="jv-keys">움직이기 <kbd>WASD</kbd> <kbd>방향키</kbd> · 대시 <kbd>Space</kbd> · 멈춤 <kbd>P</kbd></div>
        <div class="jv-pops" data-v="pops"></div>
        <div class="jv-tag me" data-v="tagme">나</div><div class="jv-tag" data-v="tagrv">${esc(names[rv])}</div>
        <div class="jv-arrow" data-v="arrow"><em></em><span></span></div>
        <div class="jv-banner" data-v="banner"></div><div class="jv-big" data-v="big"></div><div class="jv-hold" data-v="hold"></div>
      </div><div class="jv-stick" data-v="stick"><i></i></div>`;
    root.insertBefore(w.canvas, root.firstChild);
    container.appendChild(root);
    const $ = (k) => root.querySelector(`[data-v="${k}"]`);
    const el = { size: $("size"), eat: $("eat"), timer: $("timer"), ms: $("ms"), rs: $("rs"), dm: $("dm"), dr: $("dr"), msg: $("msg"), dash: $("dash"), pips: [...$("pips").children], pips2: [...$("pips2").children], pops: $("pops"), tagme: $("tagme"), tagrv: $("tagrv"), arrow: $("arrow"), banner: $("banner"), big: $("big"), hold: $("hold"), stick: $("stick") };
    const popEls = [];
    for (let i = 0; i < 10; i++) { const d = document.createElement("div"); d.className = "jv-pop"; d.style.opacity = 0; d.t = 0; el.pops.appendChild(d); popEls.push(d); }
    let popI = 0;
    const v3 = new T.Vector3();
    function pop(text, x, y, z, cls) { const d = popEls[(popI = (popI + 1) % popEls.length)]; d.textContent = text; d.className = "jv-pop" + (cls ? " " + cls : ""); d.t = 1; d.wx = x; d.wy = y; d.wz = z; }
    let VW = 1, VH = 1;
    function updatePops(dt) { for (const d of popEls) { if (d.t <= 0) continue; d.t -= dt * 1.05; if (d.t <= 0) { d.style.opacity = 0; continue; } v3.set(d.wx, d.wy + (1 - d.t) * 2.2 * camZoom, d.wz).project(camera); const k = 1 - d.t, sc = k < 0.15 ? 0.6 + (k / 0.15) * 0.6 : 1.2 - Math.min(0.2, (k - 0.15) * 1.2); d.style.opacity = d.t < 0.3 ? d.t / 0.3 : 1; d.style.transform = `translate(${((v3.x * 0.5 + 0.5) * VW).toFixed(1)}px,${((-v3.y * 0.5 + 0.5) * VH).toFixed(1)}px) translate(-50%,-50%) scale(${sc.toFixed(2)})`; } }
    let bannerT = 0;
    function banner(text, cls, dur) { el.banner.textContent = text; el.banner.className = "jv-banner on" + (cls ? " " + cls : ""); bannerT = dur || 2.4; }

    function resize() {
      VW = Math.max(1, root.clientWidth); VH = Math.max(1, root.clientHeight);
      renderer.setSize(VW, VH, false); camera.aspect = VW / VH; camera.updateProjectionMatrix();
    }
    const ro = window.ResizeObserver ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(root); else addEventListener("resize", resize);

    // ───── 판 상태
    const S = {
      map: w.mapId, seed: (Math.random() * 2147483647) | 0, epoch: Math.random().toString(36).slice(2, 8),
      phase: mode === "demo" ? "play" : "wait", timeLeft: ROUND, playT: 0, countT: 0, endT: 0, result: null, ended: false,
      pz: 0, pzBy: 0, pzWhy: "", ready: [0, 0], resumeT: 0, evId: 0, ev: [], spawnRef: 0, warn30: false, safeSaid: false, lastTick: 99, rel: 0,
    };
    let localPaused = false; // 컴퓨터와 — 내가 멈춤
    let destroyed = false, endFired = false, link = "ok", devAuto = false, rtt = 120, lastSnapAt = 0, myReady = 0;
    let camX = 0, camZ = 18, camZoom = 1.3, shake = 0, slow = 1;
    const hostRng = mulberry(S.seed ^ 0x5bd1e995);
    const srand = (a, b) => (b === undefined ? hostRng() * a : a + hostRng() * (b - a));
    function pushEv(type, a, b) { S.ev.push([++S.evId, type, a, b === undefined ? -1 : b, performance.now()]); if (S.ev.length > 24) S.ev.shift(); handleEv([S.evId, type, a, b === undefined ? -1 : b]); }
    const setSize = (c) => { c.s = Math.sqrt(c.m); };
    function placeFood(f) { const p = foodPos(S.seed, f.i, f.gen % 31); f.x = p.x; f.z = p.z; }
    function resetFood() { for (const f of food) { f.gen = 0; f.alive = true; f.pop = 1; f.t = 0; placeFood(f); } }
    function resetJellies() {
      J.forEach((j, i) => { j.x = START[i][0]; j.z = START[i][1]; j.vx = j.vz = 0; j.m = 1; setSize(j); j.ds = 1; j.state = "ok"; j.yaw = Math.PI; j.g.root.visible = true; j.gulp = 0; j.eater = null; j.dash = 1; j.dashT = 0; j.dashDx = 0; j.dashDz = -1; j.inv = 0; j.eat = 0; j.bites = 0; j.inx = 0; j.inz = 0; j.lastD = 0; j.inAt = performance.now(); });
    }
    function spotFriend(c, s, minD) {
      for (let k = 0; k < 30; k++) {
        const a = srand(TAU), r = Math.sqrt(srand(1)) * (WORLD - s - 2); c.x = Math.cos(a) * r; c.z = Math.sin(a) * r;
        if (J.every((j) => Math.hypot(c.x - j.x, c.z - j.z) > minD) && Math.hypot(c.x - boss.x, c.z - boss.z) > boss.s + s + 3 && !MK.blocked(c.x, c.z, s + 1)) break;
        minD *= 0.94;
      }
    }
    function readyFriend(c, s, calm) { c.m = s * s; setSize(c); c.ds = 0.01; c.vx = c.vz = 0; c.state = "spawn"; c.t = 0; c.mode = "wander"; c.tgt = null; c.calm = calm; c.full = srand(3); c.chaseT = 0; c.eater = null; c.g.root.visible = true; }
    function resetFriends() {
      const tiers = [0.55, 0.62, 0.7, 0.78, 1.45, 2.2];
      for (let k = 0; k < N_FRIEND / 2; k++) {
        const a = friends[k * 2], b = friends[k * 2 + 1], s = tiers[k % tiers.length];
        readyFriend(a, s, 6); spotFriend(a, s, (s > 1 ? 22 : 11) + s);
        readyFriend(b, s, 6); b.x = -a.x; b.z = a.z; // 좌우 대칭 — 두 젤리에게 같은 숲
      }
    }
    function spawnFriend(c) {
      const ref = J[(S.spawnRef ^= 1)], ps = ref.s, danger = ps * 1.25 < RIVAL_CAP && srand(1) < 0.3;
      const s = clamp(danger ? ps * srand(1.25, 1.7) : ps * srand(0.42, 0.8), 0.5, RIVAL_CAP);
      readyFriend(c, s, 0); spotFriend(c, s, 16 + s);
      if (S.phase === "play") burst(c.x, 0.4, c.z, 8, Cc(w.KIND_COL[c.kind]), 4, 5);
    }
    function resetWorld() {
      resetJellies();
      boss.x = 0; boss.z = -34; boss.vx = boss.vz = 0; boss.m = BOSS_S * BOSS_S; setSize(boss); boss.ds = BOSS_S; boss.state = "ok"; boss.mode = "wander"; boss.tgt = null; boss.calm = 6; boss.g.root.visible = true; boss.yaw = 0; boss.eater = null;
      resetFriends(); resetFood();
      S.timeLeft = ROUND; S.playT = 0; S.warn30 = false; S.safeSaid = false; S.lastTick = 99; S.rel = 0;
      camX = J[me].x; camZ = J[me].z; camZoom = 1.32; w.clearParticles();
      for (const d of popEls) { d.t = 0; d.style.opacity = 0; }
    }

    // ───── 먹기 · 물리기 (판을 계산하는 쪽만)
    const playing = () => S.phase === "play" && !S.pz && !localPaused;
    function grow(c, dm) { c.m += dm; if (!c.isJ && !c.isBoss) c.m = Math.min(c.m, RIVAL_CAP * RIVAL_CAP); setSize(c); c.gulp = 1; }
    function eatFood(c) {
      const reach = c.s * 0.92 + 0.32, r2 = reach * reach;
      if (!c.isJ && c.full > 0) return;
      for (const f of food) {
        if (!f.alive || (f.type === 2 && !c.isJ)) continue;
        const dx = f.x - c.x, dz = f.z - c.z, rr = f.type === 2 ? (reach + 0.3) * (reach + 0.3) : r2;
        if (dx * dx + dz * dz >= rr) continue;
        f.alive = false; f.t = f.type === 0 ? srand(7, 12) : f.type === 1 ? srand(9, 15) : srand(6, 10);
        if (c.isJ) {
          grow(c, f.type === 0 ? 0.1 : f.type === 1 ? 0.3 : 0.06);
          if (f.type === 2 && c.dash < MAXDASH) c.dash++;
          pushEv("f", c.idx, f.i);
        } else { grow(c, f.type === 0 ? 0.02 : 0.05); c.full = f.type === 0 ? srand(4, 8) : srand(5, 9); return; }
      }
    }
    function swallow(big, sm) {
      sm.state = "dying"; sm.t = 0; sm.eater = big;
      if (big.isJ) {
        if (sm.isBoss) { grow(big, sm.m * 0.3); pushEv("k", big.idx, sm.idx); return; }
        grow(big, sm.m * 0.42); big.eat++; pushEv("w", big.idx, sm.idx);
      } else { if (!big.isBoss) grow(big, sm.m * 0.4); else big.gulp = 1; pushEv("c", big.idx, sm.idx); }
    }
    function bite(big, j) {
      j.inv = 2.5; j.bites++; big.calm = 4; big.gulp = 1; big.mode = "wander"; big.think = 0.6;
      j.m = Math.max(0.5625, j.m * 0.8); setSize(j);
      let dx = j.x - big.x, dz = j.z - big.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
      j.x = big.x + dx * (big.s + j.s + 0.4); j.z = big.z + dz * (big.s + j.s + 0.4); j.vx = dx * 20; j.vz = dz * 20;
      pushEv("b", j.idx, big.idx);
    }
    function endBy(winner, eaten, by) {
      if (S.phase !== "play") return;
      const size = [Math.round(J[0].s * 100), Math.round(J[1].s * 100)];
      S.result = { winner, size, eaten, sec: eaten ? Math.round(S.playT * 10) / 10 : ROUND, map: S.map, by, friends: [J[0].eat, J[1].eat], bites: [J[0].bites, J[1].bites] };
      S.phase = "end"; S.endT = 0;
      if (eaten) { const big = J[by], sm = J[1 - by]; sm.state = "dying"; sm.t = 0; sm.eater = big; grow(big, sm.m * 0.5); }
      handleEnd();
    }
    function interact() {
      const L = all;
      for (let i = 0; i < L.length; i++) {
        const a = L[i]; if (a.state !== "ok" || (a.isJ && S.phase !== "play")) continue;
        for (let k = i + 1; k < L.length; k++) {
          const b = L[k]; if (b.state !== "ok" || (b.isJ && S.phase !== "play")) continue;
          const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 1e-4, big = a.s >= b.s ? a : b, sm = big === a ? b : a;
          if (a.isJ && b.isJ) {
            if (mode !== "demo" && S.playT >= SAFE && big.s > sm.s * PVP) { if (d < big.s * 0.82 + sm.s * 0.18 && sm.dashT <= 0 && sm.inv <= 0) { endBy(big.idx === 0 ? "host" : "guest", true, big.idx); return; } continue; }
          } else if (big.s > sm.s * EAT) {
            if (d < big.s * 0.82 + sm.s * 0.18) {
              if (sm.isJ) { if (sm.inv <= 0 && sm.dashT <= 0 && big.calm <= 0) bite(big, sm); }
              else swallow(big, sm);
              if (a.state !== "ok") break;
            }
            continue;
          }
          const lim = (a.s + b.s) * 0.8;
          if (d < lim) { const push = lim - d, nx = dx / d, nz = dz / d, wa = b.m / (a.m + b.m); a.x -= nx * push * wa; a.z -= nz * push * wa; b.x += nx * push * (1 - wa); b.z += nz * push * (1 - wa); }
        }
      }
    }
    // 숲 친구들의 머리 (혼자 하기와 같음 — 대왕은 두 젤리를 쫓는다)
    function think(c) {
      const sense = (c.isBoss ? 16 : 9) + c.s * 2.2;
      let thr = null, thrD = 1e9, prey = null, preyD = 1e9;
      for (const o of all) {
        if (o === c || o.state !== "ok" || (o.isJ && S.phase !== "play")) continue;
        const d = Math.hypot(o.x - c.x, o.z - c.z) - o.s - c.s;
        if (o.s > c.s * EAT) { if (d < sense * 0.6 && d < thrD) { thr = o; thrD = d; } }
        else if (c.s > o.s * EAT) {
          if (o.isJ && (o.inv > 0 || c.calm > 0)) continue;
          if (c.isBoss && !o.isJ) continue;
          if (d < sense && d < preyD) { prey = o; preyD = d; }
        }
      }
      if (thr) { c.mode = "flee"; c.tgt = thr; return; }
      if (prey && (prey.isJ || c.mode === "chase" || Math.random() < 0.55)) { c.mode = "chase"; c.tgt = prey; return; }
      if (!c.isBoss && c.full <= 0) {
        let f = null, fd = Math.pow(7 + c.s * 1.5, 2);
        for (let i = 0; i < N_BERRY + N_SHROOM; i++) { const b = food[i]; if (!b.alive) continue; const d = (b.x - c.x) * (b.x - c.x) + (b.z - c.z) * (b.z - c.z); if (d < fd) { fd = d; f = b; } }
        if (f) { c.mode = "graze"; c.tgt = f; return; }
      }
      c.mode = "wander"; c.tgt = null; if (Math.random() < 0.35) c.wang += rand(-1.4, 1.4);
    }
    function moveAI(c, dt) {
      c.think -= dt; if (c.think <= 0) { c.think = 0.2 + rand(0.16); think(c); }
      if (c.calm > 0) c.calm -= dt;
      if (c.full > 0) c.full -= dt;
      let dx = 0, dz = 0, f = 0.38; const o = c.tgt;
      if (c.mode === "chase" && o && o.isJ && !c.isBoss) { c.chaseT += dt; if (c.chaseT > 4.5) { c.chaseT = 0; c.calm = 3.5; c.mode = "wander"; c.think = 0.5; } } else c.chaseT = 0;
      if (c.mode === "chase" && o && o.isJ && (o.inv > 0 || S.phase !== "play")) c.mode = "wander";
      if (c.mode === "flee" && o) { dx = c.x - o.x; dz = c.z - o.z; f = c.isBoss ? 0.6 : 0.82; }
      else if (c.mode === "chase" && o && o.state === "ok") { dx = o.x - c.x; dz = o.z - c.z; f = c.isBoss ? 0.58 : 0.76; }
      else if (c.mode === "graze" && o && o.alive) { dx = o.x - c.x; dz = o.z - c.z; f = 0.5; }
      else { c.mode = "wander"; dx = Math.sin(c.wang); dz = Math.cos(c.wang); f = c.isBoss ? 0.3 : 0.38; }
      let l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const r = Math.hypot(c.x, c.z) || 1e-4, lim = WORLD - c.s * 0.7 - 0.5;
      if (r > lim - 3.5 && c.mode !== "chase" && c.mode !== "graze") {
        const nx = c.x / r, nz = c.z / r, out = dx * nx + dz * nz;
        if (out > 0) { if (c.mode === "wander") c.wang = Math.atan2(-c.x, -c.z) + rand(-0.9, 0.9); dx -= nx * out; dz -= nz * out; const inw = clamp((r - (lim - 3.5)) / 3.5, 0, 1) * 0.5; dx -= nx * inw; dz -= nz * inw; if (Math.hypot(dx, dz) < 0.3) { dx += -nz * c.side; dz += nx * c.side; } l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; }
      }
      [dx, dz] = MK.steer(c.x, c.z, c.s * 0.7, dx, dz); // 물 · 바위는 돌아간다
      const sp = rspd(c.s) * f * (c.state === "spawn" ? 0.25 : 1);
      c.vx = damp(c.vx, dx * sp, 6, dt); c.vz = damp(c.vz, dz * sp, 6, dt);
      c.x += c.vx * dt; c.z += c.vz * dt;
      const r2 = Math.hypot(c.x, c.z); if (r2 > lim) { c.x *= lim / r2; c.z *= lim / r2; }
      MK.push(c, c.s * 0.7);
    }
    // 젤리 움직이기 — 입력(inx · inz)으로. guest 화면은 내 젤리를 같은 셈으로 먼저 움직인다
    function tryDash(j) {
      if (S.phase !== "play" || S.pz || localPaused || j.dash <= 0 || j.dashT > 0 || j.state !== "ok") return false;
      let dx = j.vx, dz = j.vz, l = Math.hypot(dx, dz);
      if (l < 0.5) { dx = Math.sin(j.yaw); dz = Math.cos(j.yaw); l = 1; }
      j.dashDx = dx / l; j.dashDz = dz / l; j.dash--; j.dashT = 0.42;
      if (sim) pushEv("d", j.idx);
      return true;
    }
    function moveJelly(j, dt) {
      let ix = j.inx, iz = j.inz; const l = Math.hypot(ix, iz); if (l > 1) { ix /= l; iz /= l; }
      const sp = pspd(j.s);
      if (j.dashT > 0) {
        j.dashT -= dt;
        if (l > 0.3) { j.dashDx = damp(j.dashDx, ix / l, 5, dt); j.dashDz = damp(j.dashDz, iz / l, 5, dt); const n = Math.hypot(j.dashDx, j.dashDz) || 1; j.dashDx /= n; j.dashDz /= n; }
        j.vx = j.dashDx * sp * 2.7; j.vz = j.dashDz * sp * 2.7;
        j.trail = (j.trail || 0) - dt; if (j.trail <= 0) { j.trail = 0.03; burst(j.x, j.s * 0.7, j.z, 2, Cc(JCOL[j.idx]), 1.5, 2); }
      } else { const k = MK.onIce(j.x, j.z) ? 1.6 : 9; j.vx = damp(j.vx, ix * sp, k, dt); j.vz = damp(j.vz, iz * sp, k, dt); } // 얼음 위는 미끄럽다
      j.x += j.vx * dt; j.z += j.vz * dt;
      const lim = WORLD - j.s * 0.6, r = Math.hypot(j.x, j.z); if (r > lim) { j.x *= lim / r; j.z *= lim / r; }
      MK.push(j, j.s * 0.6);
    }

    // ───── 컴퓨터 젤리 (연습 · 구경 · 시험 자동 조작)
    const brain = [{ t: 0, x: 0, z: 0 }, { t: 0, x: 0, z: 0 }];
    const LV = { easy: { th: 0.45, mag: 0.72, dash: 0, aggr: 0.35 }, normal: { th: 0.28, mag: 0.88, dash: 0.5, aggr: 0.75 }, hard: { th: 0.16, mag: 1, dash: 1, aggr: 1 } };
    function botThink(j, lv, dt) {
      const B = brain[j.idx]; B.t -= dt; if (B.t > 0) return;
      B.t = lv.th + Math.random() * 0.1;
      const o = J[1 - j.idx], safe = S.playT >= SAFE;
      let gx = 0, gz = 0, best = 1e9, flee = null, fleeD = 1e9;
      for (const c of all) {
        if (c === j || c.state !== "ok") continue;
        const d = Math.hypot(c.x - j.x, c.z - j.z) - c.s - j.s;
        const danger = c.isJ ? mode !== "demo" && safe && c.s > j.s * PVP && j.inv <= 0 : c.s > j.s * EAT && j.inv <= 0 && c.calm <= 0;
        if (danger && d < 6 + c.s && d < fleeD) { flee = c; fleeD = d; }
      }
      if (flee) {
        gx = j.x - flee.x; gz = j.z - flee.z;
        if (fleeD < 2.2 && Math.random() < lv.dash) { B.dashNow = true; }
      } else {
        if (mode !== "demo" && safe && j.s > o.s * PVP && o.state === "ok" && Math.random() < lv.aggr) { gx = o.x - j.x; gz = o.z - j.z; best = 0; if (Math.hypot(gx, gz) < 6 + j.s && Math.random() < lv.dash) B.dashNow = true; }
        else {
          for (const c of all) {
            if (c.isJ || c.state !== "ok" || !(j.s > c.s * EAT)) continue;
            const d = Math.hypot(c.x - j.x, c.z - j.z) * (c.isBoss ? 0.5 : 0.8);
            if (d < best && d < 26) { best = d; gx = c.x - j.x; gz = c.z - j.z; }
          }
          for (const f of food) {
            if (!f.alive) continue;
            const d = Math.hypot(f.x - j.x, f.z - j.z) / (f.type === 1 ? 2.2 : f.type === 2 ? 1.6 : 1);
            if (d < best) { best = d; gx = f.x - j.x; gz = f.z - j.z; }
          }
        }
      }
      const [sx, sz] = MK.steer(j.x, j.z, j.s * 0.6, gx / (Math.hypot(gx, gz) || 1), gz / (Math.hypot(gx, gz) || 1)); B.x = sx * lv.mag; B.z = sz * lv.mag;
      const r = Math.hypot(j.x, j.z); if (r > WORLD - 6) { B.x -= (j.x / r) * 0.6; B.z -= (j.z / r) * 0.6; }
    }
    function botDrive(j, lv, dt) {
      botThink(j, lv, dt);
      const B = brain[j.idx]; j.inx = B.x; j.inz = B.z;
      if (B.dashNow) { B.dashNow = false; if (sim) tryDash(j); else myDash(); }
    }

    // ───── 내 조작 (키보드 · 화면 끌기 · 대시)
    const keys = {}, joy = { on: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
    let dashCount = 0; // guest — 대시를 누른 횟수(주인에게 보내 같은 대시를 한다)
    function myInput() {
      let ix = 0, iz = 0;
      if (keys.ArrowLeft || keys.KeyA) ix -= 1; if (keys.ArrowRight || keys.KeyD) ix += 1; if (keys.ArrowUp || keys.KeyW) iz -= 1; if (keys.ArrowDown || keys.KeyS) iz += 1;
      if (joy.on) { ix += joy.x; iz += joy.y; }
      const l = Math.hypot(ix, iz); if (l > 1) { ix /= l; iz /= l; }
      return [ix, iz];
    }
    function myDash() {
      if (mode === "demo") return;
      const j = J[me];
      if (sim) { if (tryDash(j)) SFX.dash(); return; }
      // guest — 남은 대시가 있으면 먼저 내 화면에서 대시하고, 주인에게도 알린다
      if (tryDash(j)) { SFX.dash(); dashCount++; sendInput(true); }
    }
    function stopInput() { for (const k in keys) keys[k] = false; joy.on = false; joy.id = null; joy.x = joy.y = 0; el.stick.style.display = "none"; }
    const editable = (t) => t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA");
    const onKeyDown = (e) => {
      if (destroyed || mode === "demo" || editable(e.target) || document.querySelector(".hk-dialog__overlay")) return;
      if (e.code === "Space" || e.code === "ShiftLeft" || e.code === "ShiftRight" || e.code === "KeyK") {
        if (!playing()) return;
        e.preventDefault(); if (!e.repeat) { initAudio(); myDash(); } return;
      }
      if (/^(Arrow|Key[WASD])/.test(e.code)) { if (e.code.indexOf("Arrow") === 0 && playing()) e.preventDefault(); keys[e.code] = true; }
    };
    const onKeyUp = (e) => { keys[e.code] = false; };
    const onBlur = () => { for (const k in keys) keys[k] = false; };
    addEventListener("keydown", onKeyDown); addEventListener("keyup", onKeyUp); addEventListener("blur", onBlur);
    const cv = w.canvas;
    const onPDown = (e) => {
      if (mode === "demo" || joy.id !== null) return;
      initAudio();
      const rc = root.getBoundingClientRect();
      joy.id = e.pointerId; joy.on = true; joy.ox = e.clientX; joy.oy = e.clientY; joy.x = joy.y = 0; joy.rx = rc.left; joy.ry = rc.top;
      el.stick.style.display = "block"; el.stick.style.transform = `translate(${e.clientX - rc.left}px,${e.clientY - rc.top}px)`; el.stick.firstElementChild.style.transform = "";
      try { cv.setPointerCapture(e.pointerId); } catch (_) { /* 잡지 못해도 움직임은 받는다 */ }
    };
    const onPMove = (e) => {
      if (e.pointerId !== joy.id) return;
      let dx = (e.clientX - joy.ox) / 50, dy = (e.clientY - joy.oy) / 50; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
      if (l < 0.14) { joy.x = joy.y = 0; } else { joy.x = dx; joy.y = dy; }
      el.stick.firstElementChild.style.transform = `translate(${(dx * 36).toFixed(1)}px,${(dy * 36).toFixed(1)}px)`;
    };
    const joyEnd = (e) => { if (e.pointerId !== joy.id) return; joy.on = false; joy.id = null; joy.x = joy.y = 0; el.stick.style.display = "none"; };
    cv.addEventListener("pointerdown", onPDown); cv.addEventListener("pointermove", onPMove); cv.addEventListener("pointerup", joyEnd); cv.addEventListener("pointercancel", joyEnd);
    const onCtx = (e) => e.preventDefault(); cv.addEventListener("contextmenu", onCtx);
    el.dash.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); initAudio(); if (playing()) myDash(); });

    // ───── 알림 (먹기 · 물림 · 대시) — 두 화면에서 같은 소식으로 소리 · 글자를 낸다
    const seenEv = new Set();
    function handleEv(e) {
      const [id, type, a, b] = e;
      if (seenEv.has(id)) return; seenEv.add(id); if (seenEv.size > 200) seenEv.delete(seenEv.values().next().value);
      const j = J[a], mine = a === me;
      if (type === "f") {
        const f = food[b]; if (!f) return;
        if (mine) { if (f.type === 0) SFX.berry(); else if (f.type === 1) { SFX.shroom(); pop("+크기", f.x, 1.2 + j.s, f.z); } else { SFX.orb(); pop("대시 +1", f.x, 1.6 + j.s, f.z); } }
        burst(f.x, f.type === 2 ? 1.1 : 0.5, f.z, f.type === 2 ? 14 : f.type === 1 ? 9 : 5, f.type === 2 ? Cc(0xffe27a) : f.type === 1 ? w.SHROOM_COL[(f.i - N_BERRY) % 3] : w.BERRY_COL[f.col], f.type === 2 ? 5.5 : 4, 5);
      } else if (type === "w" || type === "c" || type === "k") {
        const sm = all[b]; if (!sm) return;
        burst(sm.x, sm.s * 0.8, sm.z, type === "k" ? 60 : 14, Cc(w.KIND_COL[sm.kind] || 0xffffff), 5 + sm.s * 2, 6 + sm.s);
        if (type === "c") return;
        if (mine) { SFX.gulp(); pop(type === "k" ? "가시대왕 꿀꺽!" : "꿀꺽!", sm.x, j.s * 2 + 1, sm.z, type === "k" ? "mint" : ""); if (!reduceMotion) shake = Math.max(shake, 0.12 + sm.s * 0.03); }
        if (type === "k") banner(mine ? "가시대왕을 삼켰어요! 몸이 크게 자라요" : `${names[a]}님이 가시대왕을 삼켰어요`, mine ? "mint" : "bad", 2.6);
      } else if (type === "b") {
        burst(j.x, j.s, j.z, 22, Cc(JCOL[a]), 7, 7);
        if (mine) { SFX.hurt(); pop("아야!", j.x, j.s * 2 + 1.2, j.z, "bad"); if (!reduceMotion) shake = 0.55; }
      } else if (type === "d") {
        if (!(mine && !sim)) { burst(j.x, j.s * 0.6, j.z, 14, Cc(0xffe27a), 6, 4); if (mine) SFX.dash(); }
      }
    }

    // ───── 끝
    function myRes(r) {
      const win = r.winner !== "draw" && (r.winner === "host") === (me === 0);
      return { ...r, me, win, draw: r.winner === "draw", mySize: r.size[me], rivalSize: r.size[rv] };
    }
    function handleEnd() {
      const r = S.result; if (!r) return;
      stopInput();
      const out = myRes(r);
      if (out.draw) banner("크기가 거의 같아요 — 무승부", "", 2.4);
      else if (r.eaten) banner(out.win ? "꿀꺽! 상대를 삼켰어요" : "꿀꺽 삼켜졌어요…", out.win ? "mint" : "bad", 2.4);
      else banner("시간 끝!", out.win ? "mint" : "bad", 2);
      if (out.win) SFX.win(); else if (!out.draw) SFX.lose(); else SFX.ready();
      if (!reduceMotion && r.eaten) { shake = 0.6; slow = 0.4; }
    }
    function fireEnd() {
      if (endFired || !S.result) return;
      endFired = true; S.ended = true;
      try { if (opts.onEnd) opts.onEnd(myRes(S.result)); } catch (_) { /* 페이지 쪽 오류는 무시 */ }
    }

    // ───── 통신
    const net = opts.net;
    function send(m) { try { return !!(net && net.send(m)); } catch (_) { return false; } }
    let lastSnap = 0, lastIn = 0, lastInSig = "", lastPing = 0, lastHi = 0;
    function snapshot() {
      const j = J.map((q) => [r1(q.x), r1(q.z), r1(q.vx), r1(q.vz), Math.round(q.s * 100), q.dash, q.dashT > 0 ? 1 : 0, r1(Math.max(0, q.inv)), q.eat, q.bites, q.state === "ok" ? 0 : 1]);
      const c = all.slice(2).map((q) => [r1(q.x), r1(q.z), Math.round(q.s * 100), q.state === "ok" ? 0 : q.state === "spawn" ? 1 : q.state === "dead" ? 2 : 3 + (q.eater ? q.eater.idx : 0)]);
      let f = ""; for (const q of food) f += ALPH[(q.gen % 31) * 2 + (q.alive ? 1 : 0)];
      const now = performance.now();
      const ev = S.ev.filter((e) => now - e[4] < 900).map((e) => e.slice(0, 4));
      return { t: "s", e: S.epoch, sd: S.seed, mp: S.map, ph: ["wait", "count", "play", "end"].indexOf(S.phase), tl: r1(S.timeLeft), pt: r1(S.playT), cn: r1(Math.max(S.countT, S.resumeT)), rd: S.ready.slice(), pz: S.pz, pb: S.pzBy, pw: S.pzWhy, j, c, f, ev, en: S.result || 0 };
    }
    function sendSnap() { lastSnap = performance.now(); send(snapshot()); }
    function sendInput(force) {
      const [ix, iz] = devAuto ? [J[me].inx, J[me].inz] : myInput();
      const m = { t: "in", x: Math.round(ix * 10), z: Math.round(iz * 10), d: dashCount };
      const sig = `${m.x}.${m.z}.${m.d}`, now = performance.now();
      if (!force && sig === lastInSig && now - lastIn < 200) return;
      if (!force && now - lastIn < 60) return; // 초당 15번 넘게 보내지 않는다
      lastInSig = sig; lastIn = now; send(m);
    }
    function pauseBy(who, why) {
      if (S.phase === "end" || S.pz) return;
      if (S.phase !== "play" && S.phase !== "count") return;
      if (S.phase === "count") { S.phase = "wait"; S.countT = 0; S.ready = [0, 0]; return; }
      S.pz = 1; S.pzBy = who; S.pzWhy = why || "pause"; S.ready = [0, 0]; S.resumeT = 0; stopInput(); sendSnap();
    }
    function checkReady() {
      if (S.phase === "wait" && S.ready[0] && S.ready[1] && S.countT <= 0) { resetWorld(); S.phase = "count"; S.countT = COUNT; S.lastCount = 4; sendSnap(); }
      else if (S.pz && S.ready[0] && S.ready[1] && S.resumeT <= 0) { S.resumeT = COUNT; S.lastCount = 4; sendSnap(); }
    }
    // guest — 받은 상태를 쌓아 두고 120ms 늦게 그린다
    const buf = [];
    let gEpoch = null, gSeed = null, corr = { x: 0, z: 0 };
    function guestReset(ep) {
      gEpoch = ep; buf.length = 0; S.result = null; S.phase = "wait"; endFired = false; S.ended = false; myReady = 0; dashCount = 0; lastInSig = "";
      resetJellies(); seenEv.clear();
    }
    function applySnap(m) {
      if (m.e !== gEpoch) guestReset(m.e);
      lastSnapAt = performance.now();
      if (m.sd !== gSeed) { gSeed = m.sd; S.seed = m.sd; for (const f of food) { f.gen = -1; } }
      if (Number.isInteger(m.mp) && m.mp !== S.map) { w.setMap(m.mp); S.map = w.mapId; for (const f of food) { f.gen = -1; } if (S.phase === "wait") resetJellies(); } // 주인이 고른 맵
      const prevPhase = S.phase;
      S.phase = ["wait", "count", "play", "end"][m.ph] || "wait";
      if (prevPhase === "wait" && S.phase === "count") { resetWorld(); }
      S.timeLeft = m.tl / 10; S.playT = m.pt / 10; S.countT = m.cn / 10; S.resumeT = m.pz ? m.cn / 10 : 0;
      S.ready = [m.rd[0] ? 1 : 0, m.rd[1] ? 1 : 0]; // [주인, 손님]
      if ((S.phase === "play" && !m.pz) || (!S.pz && m.pz)) myReady = 0; // 시작했거나 새로 멈췄다 — 준비는 다시 눌러야
      if ((S.phase === "wait" || m.pz) && !m.rd[1] && myReady && performance.now() - (S.myReadyAt || 0) > 1500) send({ t: "rd", on: 1 }); // 내 준비가 아직 안 닿았다
      if (!S.pz && m.pz) stopInput();
      S.pz = m.pz; S.pzBy = m.pb; S.pzWhy = m.pw;
      // 먹을 것
      for (let i = 0; i < N_FOOD && i < m.f.length; i++) {
        const v = ALPH.indexOf(m.f[i]), alive = v % 2 === 1, gen = v >> 1, f = food[i];
        if (gen !== f.gen % 31 || f.gen < 0) { f.gen = gen; placeFood(f); if (alive) f.pop = f.gen === 0 ? 1 : 0; }
        f.alive = alive;
      }
      // 젤리 · 친구 — 보간용으로 쌓는다
      buf.push({ at: performance.now(), j: m.j, c: m.c });
      if (buf.length > 10) buf.shift();
      // 내 젤리는 예측 — 주인 값으로 부드럽게 맞춘다
      const mj = m.j[me], j = J[me];
      const lat = clamp(rtt / 1000, 0.03, 0.4);
      const tx = mj[0] / 10 + (mj[2] / 10) * lat, tz = mj[1] / 10 + (mj[3] / 10) * lat;
      const newInv = mj[7] / 10;
      if (S.phase !== "play" || Math.hypot(tx - j.x, tz - j.z) > 6 || (newInv > j.inv + 1 && j.inv < 1)) { j.x = mj[0] / 10; j.z = mj[1] / 10; corr.x = corr.z = 0; }
      else { corr.x = tx - j.x; corr.z = tz - j.z; }
      j.m = Math.pow(mj[4] / 100, 2); setSize(j); j.dash = mj[5]; j.inv = newInv; j.eat = mj[8]; j.bites = mj[9];
      const oj = m.j[rv], o = J[rv]; o.eat = oj[8]; o.bites = oj[9]; o.dash = oj[5]; o.dashT = oj[6] ? 0.2 : 0; o.inv = oj[7] / 10; o.m = Math.pow(oj[4] / 100, 2); setSize(o);
      // 친구 상태
      m.c.forEach((q, i) => {
        const c = all[2 + i]; if (!c) return;
        c.m = Math.pow(q[2] / 100, 2); setSize(c);
        const st = q[3] === 0 ? "ok" : q[3] === 1 ? "spawn" : q[3] === 2 ? "dead" : "dying";
        if (st === "dying" && c.state !== "dying") { c.t = 0; c.eater = all[q[3] - 3] || null; }
        if ((st === "spawn" || st === "ok") && (c.state === "dead" || c.state === "dying")) { c.x = q[0] / 10; c.z = q[1] / 10; c.ds = st === "spawn" ? 0.01 : c.s; c.g.root.visible = true; }
        c.state = st;
      });
      if (oj[10] && o.state === "ok" && m.en && m.en.eaten) { o.state = "dying"; o.t = 0; o.eater = J[me]; }
      if (mj[10] && j.state === "ok" && m.en && m.en.eaten) { j.state = "dying"; j.t = 0; j.eater = J[rv]; }
      (m.ev || []).forEach(handleEv);
      if (m.en && !S.result) { S.result = m.en; S.phase = "end"; S.endT = 0; handleEnd(); }
    }
    function interpGuest(now) {
      if (!buf.length) return;
      const rt = now - INTERP_MS;
      let a = buf[0], b = buf[buf.length - 1], k = 1;
      for (let i = buf.length - 1; i > 0; i--) { if (buf[i - 1].at <= rt) { a = buf[i - 1]; b = buf[i]; k = clamp((rt - a.at) / Math.max(1, b.at - a.at), 0, 1.2); break; } }
      const mix = (p, q) => { const x = lerp(p[0], q[0], k) / 10, z = lerp(p[1], q[1], k) / 10; return Math.hypot(q[0] - p[0], q[1] - p[1]) / 10 > 8 ? [q[0] / 10, q[1] / 10] : [x, z]; };
      const o = J[rv], [ox, oz] = mix(a.j[rv], b.j[rv]); o.x = ox; o.z = oz; o.vx = b.j[rv][2] / 10; o.vz = b.j[rv][3] / 10;
      for (let i = 0; i < b.c.length; i++) { const c = all[2 + i]; if (!c || c.state === "dead") continue; const p = a.c[i] || b.c[i], q = b.c[i]; if (c.state === "dying") continue; const [x, z] = mix(p, q); c.vx = (q[0] - p[0]) / 10 / Math.max(0.03, (b.at - a.at) / 1000); c.vz = (q[1] - p[1]) / 10 / Math.max(0.03, (b.at - a.at) / 1000); c.x = x; c.z = z; }
    }
    if (net && typeof net.onMessage === "function") {
      net.onMessage((m) => {
        if (destroyed || !m || typeof m !== "object") return;
        if (mode === "host") {
          if (m.t === "hi") { if (S.phase === "wait" || S.pz) { S.ready[1] = m.rd ? 1 : 0; checkReady(); } sendSnap(); }
          else if (m.t === "rd") { if (S.phase === "wait" || S.pz) { S.ready[1] = m.on ? 1 : 0; checkReady(); sendSnap(); } }
          else if (m.t === "in") { const j = J[1]; j.inx = clamp((m.x | 0) / 10, -1, 1); j.inz = clamp((m.z | 0) / 10, -1, 1); j.inAt = performance.now(); if ((m.d | 0) > j.lastD) { j.lastD = m.d | 0; tryDash(j); } }
          else if (m.t === "pz") pauseBy(1, "pause");
          else if (m.t === "away") pauseBy(1, "away");
          else if (m.t === "ping") send({ t: "pong", c: m.c });
        } else if (mode === "guest") {
          if (m.t === "s" && typeof m.ph === "number" && Array.isArray(m.j) && Array.isArray(m.c) && typeof m.f === "string") applySnap(m);
          else if (m.t === "pong" && typeof m.c === "number") rtt = clamp(performance.now() - m.c, 10, 1500);
        }
      });
    }
    const onVis = () => {
      if (destroyed || !document.hidden) return;
      if (mode === "host") pauseBy(0, "away");
      else if (mode === "guest" && S.phase === "play") send({ t: "away" });
    };
    document.addEventListener("visibilitychange", onVis);

    // ───── 준비 · 멈춤 상태를 페이지에 알린다
    let lobbySig = "";
    function lobbyInfo() {
      const rd = S.ready;
      return { phase: S.phase === "count" ? "wait" : S.phase, counting: S.phase === "count" || S.resumeT > 0, paused: !!S.pz, pausedBy: S.pz ? (S.pzBy === me ? "me" : "rival") : null, pausedWhy: S.pz ? S.pzWhy || "pause" : null,
        ready: [mode === "guest" ? (myReady ? 1 : 0) : rd[me], rd[rv]], peer: link === "ok", host: mode === "host", map: S.map };
    }
    function lobbyTick() {
      if (!online) return;
      const L = lobbyInfo();
      const sig = `${L.phase}.${L.counting}.${L.paused}.${L.pausedBy}.${L.pausedWhy}.${L.ready}.${L.peer}.${L.map}`;
      if (sig !== lobbySig) { lobbySig = sig; try { if (opts.onEvent) opts.onEvent({ type: "lobby", ...L }); } catch (_) { /* 페이지 오류 무시 */ } }
    }

    // ───── 몸짓
    function animate(c, dt) {
      const g = c.g;
      if (c.state === "dead") { g.root.visible = false; return; }
      g.root.visible = true;
      c.ds = damp(c.ds, c.s, 5, dt);
      let sc = c.ds, px = c.x, pz = c.z;
      if (c.state === "dying") { c.t += dt; const k = clamp(c.t / 0.24, 0, 1), e = c.eater; if (e) { px = lerp(c.x, e.x, k); pz = lerp(c.z, e.z, k); } sc *= 1 - k; if (k >= 1) { g.root.visible = false; if (!c.isJ && !sim) { c.state = "dead"; } } }
      const sp = Math.hypot(c.vx, c.vz), mv = clamp(sp / 6, 0, 1);
      if (sp > 0.4) { let d = Math.atan2(c.vx, c.vz) - c.yaw; d = (((d + Math.PI) % TAU) + TAU) % TAU - Math.PI; c.yaw += d * (1 - Math.exp(-10 * dt)); }
      c.hop += dt * (3 + (mv * 9) / Math.sqrt(Math.max(0.5, c.s)));
      if (c.gulp > 0) c.gulp = Math.max(0, c.gulp - dt * 3.2);
      const wv = Math.sin(c.hop * 2), idle = Math.sin(w.tG * 2 + c.ph) * 0.03, gp = Math.sin(c.gulp * Math.PI) * 0.2;
      let sy = 1 + idle + wv * 0.09 * mv + gp * 0.5, sxz = 1 - idle * 0.5 - wv * 0.05 * mv + gp, stretch = 1;
      if (c.isJ && c.dashT > 0) { stretch = 1.3; sy *= 0.88; sxz *= 0.9; }
      g.root.position.set(px, 0, pz); g.root.scale.setScalar(Math.max(0.001, sc));
      g.tilt.rotation.y = c.yaw; g.tilt.position.y = Math.abs(Math.sin(c.hop)) * 0.2 * mv;
      g.sq.scale.set(sxz, sy, sxz * stretch); g.sq.rotation.x = mv * 0.12;
      if (g.mouth) { const m = c.gulp > 0 ? 1 + Math.sin(c.gulp * Math.PI) * 3 : 1; g.mouth.scale.set(0.12 * (1 + (m - 1) * 0.35), 0.05 * m, 0.05); }
      const V = J[me];
      if (c.isJ) {
        if (c.state === "ok") g.root.visible = !(c.inv > 0 && c.dashT <= 0 && S.phase === "play" && Math.floor(w.tG * 14) % 2 === 0);
        // 고리는 상대 젤리에만 — 나보다 1.2배 크면 빨강, 내가 1.2배 크면 초록 (처음 15초는 흐리게)
        const show = c !== V && mode !== "demo" && c.state === "ok";
        g.ring.visible = show;
        if (show) { const safe = S.playT >= SAFE && S.phase === "play", ok = safe && V.s > c.s * PVP, bad = safe && c.s > V.s * PVP; g.ring.material = ok ? M.ringOk : bad ? M.ringBad : M.ringN; g.ring.scale.setScalar(bad ? 1 + 0.05 * Math.sin(w.tG * 6) : 1); }
        return;
      }
      if (g.ring) {
        const pl = mode !== "demo";
        const ok = V.s > c.s * EAT, bad = c.s > V.s * EAT;
        g.ring.material = !pl ? M.ringN : ok ? M.ringOk : bad ? M.ringBad : M.ringN;
        g.ring.visible = c.state === "ok" || c.state === "spawn";
        g.ring.scale.setScalar(bad ? 1 + 0.05 * Math.sin(w.tG * 6 + c.ph) : 1);
        if (!c.isBoss) g.brows.visible = bad;
        let f = 1;
        if (S.phase === "play" && c.state === "ok") { const dz = c.z - V.z, dx = Math.abs(c.x - V.x); if (dz > 0 && dz < c.ds * 2.6 + V.ds && dx < c.ds * 0.95 + V.ds * 0.6 && c.ds > V.ds * 0.75) f = 0.42; }
        g.fade = damp(g.fade, f, 10, dt); const tr = g.fade < 0.98;
        if (g.body.transparent !== tr) { g.body.transparent = tr; g.body.depthWrite = !tr; g.body.needsUpdate = true; }
        g.body.opacity = g.fade;
      }
    }

    // ───── 화면 정보
    const hudLast = {};
    const setText = (k, v) => { if (hudLast[k] !== v) { hudLast[k] = v; el[k].textContent = v; } };
    function updateHud() {
      const sec = Math.max(0, Math.ceil(S.timeLeft));
      setText("timer", `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`);
      const low = sec <= 10 && S.phase === "play"; if (hudLast.low !== low) { hudLast.low = low; el.timer.classList.toggle("is-low", low); }
      const a = J[me], b = J[rv];
      setText("size", a.s.toFixed(1)); setText("eat", a.eat.toLocaleString("ko-KR")); setText("ms", a.s.toFixed(1)); setText("rs", b.s.toFixed(1));
      const tot = a.s + b.s, pa = Math.round((a.s / tot) * 100);
      if (hudLast.pa !== pa) { hudLast.pa = pa; el.dm.style.width = `${pa}%`; el.dr.style.width = `${100 - pa}%`; }
      const dk = `${a.dash}.${a.dashT > 0}`;
      if (hudLast.dk !== dk) { hudLast.dk = dk; el.pips.forEach((e, i) => e.classList.toggle("on", i < a.dash)); el.pips2.forEach((e, i) => e.classList.toggle("on", i < a.dash)); el.dash.classList.toggle("is-ready", a.dash > 0); }
      let msg = "", cls = "";
      const safeLeft = SAFE - S.playT;
      if (S.phase === "play" && safeLeft > 0) msg = `${Math.ceil(safeLeft)}초 뒤부터 서로 삼킬 수 있어요`;
      else if (S.phase === "play" && a.s > b.s * PVP) { msg = "지금 상대를 삼킬 수 있어요!"; cls = "is-ok"; }
      else if (S.phase === "play" && b.s > a.s * PVP) { msg = "조심! 상대가 나를 삼킬 수 있어요"; cls = "is-bad"; }
      else if (S.phase === "play") msg = `상대보다 ${PVP}배 크면 꿀꺽 · 2분 뒤 큰 쪽 승리`;
      if (hudLast.msg !== msg + cls) { hudLast.msg = msg + cls; el.msg.textContent = msg; el.msg.className = `jv-msg ${cls}`; }
      if (S.phase === "play") {
        if (safeLeft <= 0 && !S.safeSaid) { S.safeSaid = true; banner("이제 서로 삼킬 수 있어요", "", 1.8); SFX.ready(); }
        const rel = a.s > b.s * PVP ? 1 : b.s > a.s * PVP ? -1 : 0;
        if (safeLeft <= 0 && rel !== S.rel) { S.rel = rel; if (rel === 1) { banner("상대보다 커졌어요! 지금 삼키세요", "mint", 2.2); SFX.ready(); } else if (rel === -1) banner("상대가 더 커졌어요! 피하세요", "bad", 2.2); }
        if (!S.warn30 && S.timeLeft <= 30) { S.warn30 = true; banner("30초 남았어요", "bad", 1.6); SFX.ready(); }
        if (sec <= 10 && sec < S.lastTick && sec > 0) { S.lastTick = sec; SFX.tick(); }
      }
    }
    function project(x, y, z) { v3.set(x, y, z).project(camera); return v3; }
    function updateTags() {
      const show = S.phase !== "wait" || true;
      const a = J[me], b = J[rv];
      const pa = project(a.x, a.ds * 2.4 + 0.5, a.z);
      if (show && a.state === "ok" && pa.z < 1) { el.tagme.style.display = "block"; el.tagme.style.transform = `translate(${((pa.x * 0.5 + 0.5) * VW).toFixed(1)}px,${((-pa.y * 0.5 + 0.5) * VH).toFixed(1)}px) translate(-50%,-100%)`; } else el.tagme.style.display = "none";
      const safe = S.playT >= SAFE && S.phase === "play", ok = safe && a.s > b.s * PVP, bad = safe && b.s > a.s * PVP;
      const cls = ok ? "ok" : bad ? "bad" : "";
      const pb = project(b.x, b.ds * 2.4 + 0.5, b.z);
      let x = pb.x, y = pb.y; const behind = pb.z > 1; if (behind) { x = -x; y = -y; }
      const onScreen = !behind && Math.abs(x) < 0.94 && Math.abs(y) < 0.9;
      if (b.state === "ok" && onScreen) { el.tagrv.style.display = "block"; el.tagrv.className = `jv-tag ${cls}`; el.tagrv.style.transform = `translate(${((x * 0.5 + 0.5) * VW).toFixed(1)}px,${((-y * 0.5 + 0.5) * VH).toFixed(1)}px) translate(-50%,-100%)`; } else el.tagrv.style.display = "none";
      // 상대가 화면 밖이면 가장자리 화살표
      const pc = project(b.x, b.ds * 0.45, b.z), cOn = pc.z < 1 && Math.abs(pc.x) < 0.9 && Math.abs(pc.y) < 0.88;
      if (b.state !== "ok" || onScreen || cOn || S.phase === "end" || mode === "demo") { el.arrow.style.display = "none"; return; }
      const dx = x * VW, dy = -y * VH, top = VW < 560 ? 150 : 110, cx = VW / 2, cy = (top + VH - 44) / 2, hx = VW / 2 - 40, hy = (VH - 44 - top) / 2;
      const k = Math.min(hx / Math.max(1e-3, Math.abs(dx)), hy / Math.max(1e-3, Math.abs(dy)));
      let ax = cx + dx * k, ay = cy + dy * k; if (touch && ax > VW - 130 && ay > VH - 130) ay = VH - 130;
      el.arrow.style.display = "grid"; el.arrow.className = `jv-arrow ${cls}`;
      el.arrow.style.transform = `translate(${ax.toFixed(1)}px,${ay.toFixed(1)}px)`;
      el.arrow.firstElementChild.style.transform = `rotate(${Math.atan2(dx, -dy).toFixed(3)}rad)`;
    }
    function updateCenter(now) {
      let big = "", hold = "";
      if (S.phase === "count") big = String(Math.max(1, Math.ceil(S.countT)));
      else if (S.pz && S.resumeT > 0) big = String(Math.max(1, Math.ceil(S.resumeT)));
      if (mode === "guest" && S.phase !== "end" && (!lastSnapAt || now - lastSnapAt > 1500)) hold = link !== "ok" ? "상대를 기다리는 중…" : lastSnapAt ? "연결이 불안정해요…" : "연결하는 중…";
      if (hudLast.big !== big) { hudLast.big = big; el.big.textContent = big; el.big.style.display = big ? "block" : "none"; }
      if (hudLast.hold !== hold) { hudLast.hold = hold; el.hold.textContent = hold; el.hold.style.display = hold ? "block" : "none"; }
    }

    // ───── 한 걸음
    const LVL = LV[opts.level] || LV.normal;
    function simStep(rdt, dt) {
      const live = playing();
      if (S.phase === "count" && !localPaused) {
        S.countT -= rdt;
        const n = Math.ceil(S.countT); if (n < S.lastCount && n > 0) { S.lastCount = n; SFX.tick(); }
        if (S.countT <= 0) { S.countT = 0; S.phase = "play"; S.ready = [0, 0]; SFX.go(); banner("꿀꺽! 시작", "", 1.4); sendSnap(); }
      }
      if (S.pz && S.resumeT > 0) {
        S.resumeT -= rdt; const n = Math.ceil(S.resumeT); if (n < S.lastCount && n > 0) { S.lastCount = n; SFX.tick(); }
        if (S.resumeT <= 0) { S.resumeT = 0; S.pz = 0; S.ready = [0, 0]; sendSnap(); }
      }
      if (S.pz || localPaused || S.phase === "count") return;
      if (live) {
        S.timeLeft -= dt; S.playT += dt;
        const [ix, iz] = myInput();
        J.forEach((j, i) => {
          if (j.inv > 0) j.inv -= dt;
          if (mode === "demo" || (mode === "cpu" && i === 1) || (devAuto && i === me)) botDrive(j, mode === "demo" ? LV.normal : i === me ? LV.hard : LVL, dt);
          else if (i === me) { j.inx = ix; j.inz = iz; }
          else if (mode === "host" && performance.now() - j.inAt > 1200) { j.inx = 0; j.inz = 0; } // 손님 입력이 끊겼으면 멈춰 선다
          if (j.state === "ok") { moveJelly(j, dt); eatFood(j); }
        });
        if (S.timeLeft <= 0 && mode !== "demo") { S.timeLeft = 0; endBy(sizeWinner(Math.round(J[0].s * 100), Math.round(J[1].s * 100)), false, -1); }
        if (mode === "demo" && S.timeLeft <= 0) { resetWorld(); S.phase = "play"; }
      } else if (S.phase === "end") {
        S.endT += rdt;
        J.forEach((j) => { j.vx = damp(j.vx, 0, 5, dt); j.vz = damp(j.vz, 0, 5, dt); j.dashT = 0; });
        if (S.endT > END_T) fireEnd();
      }
      if (S.phase === "wait" && !online) return;
      for (const c of all) {
        if (c.isJ) { if (c.state === "dying") { c.t += dt; if (c.t >= 0.24) c.state = "dead"; } continue; }
        if (S.phase === "wait") { if (c.state === "ok" || c.state === "spawn") { moveAI(c, dt); if (c.state === "spawn") { c.t += dt; if (c.t > 0.75) c.state = "ok"; } } continue; }
        if (c.state === "ok" || c.state === "spawn") { moveAI(c, dt); if (c.state === "spawn") { c.t += dt; if (c.t > 0.75) c.state = "ok"; } else if (!c.isBoss) eatFood(c); }
        else if (c.state === "dying") { c.t += dt; if (c.t >= 0.24) { c.state = "dead"; c.t = srand(2.5, 5); c.g.root.visible = false; } }
        else if (c.state === "dead" && !c.isBoss) { c.t -= dt; if (c.t <= 0 && S.phase === "play") spawnFriend(c); }
      }
      if (S.phase === "play") interact();
      for (const f of food) if (!f.alive) { f.t -= dt; if (f.t <= 0) { f.gen++; placeFood(f); f.alive = true; f.pop = 0; } }
    }
    function guestStep(rdt, dt, now) {
      if (S.phase === "play" && !S.pz) {
        const j = J[me];
        if (devAuto) botDrive(j, LV.hard, dt); else { const [ix, iz] = myInput(); j.inx = ix; j.inz = iz; }
        if (j.inv > 0) j.inv -= dt;
        if (j.state === "ok") moveJelly(j, dt);
        // 주인 값으로 부드럽게 (예측 · 보정)
        const k = 1 - Math.exp(-8 * dt); j.x += corr.x * k; j.z += corr.z * k; corr.x *= 1 - k; corr.z *= 1 - k;
        sendInput(false);
      } else if (S.phase === "end") { S.endT += rdt; J[me].vx = damp(J[me].vx, 0, 5, dt); J[me].vz = damp(J[me].vz, 0, 5, dt); if (S.endT > END_T) fireEnd(); }
      if (S.phase === "wait" || S.pz) { if (now - lastHi > 1000) { lastHi = now; send({ t: "hi", rd: myReady }); } }
      if (now - lastPing > 2000) { lastPing = now; send({ t: "ping", c: now }); }
      interpGuest(now);
    }
    function frame(rdt) {
      w.tG += rdt;
      if (slow < 1) slow = Math.min(1, slow + rdt * 0.55);
      const dt = rdt * slow, now = performance.now();
      if (sim) simStep(rdt, dt); else guestStep(rdt, dt, now);
      if (mode === "host") {
        const gap = S.phase === "play" && !S.pz ? SNAP_MS : S.phase === "count" || S.resumeT > 0 ? 100 : SLOW_SNAP_MS;
        if (now - lastSnap > gap) sendSnap();
      }
      for (const c of all) animate(c, dt);
      w.updateFoodVisuals(w.tG, rdt); w.updateFlies(w.tG); w.updateParticles(dt);
      // 카메라 — 내 젤리를 따라간다 (구경은 숲을 천천히 돈다)
      const V = J[me], pm = VH > VW ? lerp(1, 1.28, clamp((VH / VW - 1) / 0.9, 0, 1)) : 1;
      if (mode === "demo") {
        const a = Math.sin(w.tG * 0.12) * 0.55, R = 34 * pm;
        camera.position.set(Math.sin(a) * R, 17 * pm, 14 + Math.cos(a) * R); camera.lookAt(0, 1.5, -2);
      } else {
        camZoom = damp(camZoom, 0.92 + 0.4 * V.ds, 2.2, rdt); camX = damp(camX, V.x, 7, rdt); camZ = damp(camZ, V.z, 7, rdt);
        if (shake > 0) shake = Math.max(0, shake - rdt * 1.6);
        const z = camZoom * pm, sx = (Math.random() - 0.5) * shake * 2, sy = (Math.random() - 0.5) * shake * 2;
        camera.position.set(camX + sx, 14.5 * z + sy, camZ + 12 * z); camera.lookAt(camX + sx, V.ds * 0.6, camZ - 1.4 * z);
      }
      if (mode !== "demo") { updateHud(); updatePops(rdt); updateTags(); updateCenter(now); }
      if (bannerT > 0) { bannerT -= rdt; if (bannerT <= 0) el.banner.classList.remove("on"); }
      lobbyTick();
      renderer.render(scene, camera);
    }
    function loop(t) {
      if (destroyed) return;
      w.raf = requestAnimationFrame(loop);
      const raw = Math.max(0, (t - w.last) / 1000); w.last = t;
      frame(Math.min(0.05, raw));
    }

    // 처음 모습
    resetWorld();
    if (mode === "demo") { boss.calm = 0; }
    resize();

    const api = {
      start() {
        if (destroyed) return;
        if (mode === "cpu") { S.ready = [1, 1]; resetWorld(); S.phase = "count"; S.countT = COUNT; S.lastCount = 4; }
        cancelAnimationFrame(w.raf); w.last = performance.now(); w.raf = requestAnimationFrame(loop);
      },
      destroy() {
        if (destroyed) return;
        destroyed = true; cancelAnimationFrame(w.raf);
        removeEventListener("keydown", onKeyDown); removeEventListener("keyup", onKeyUp); removeEventListener("blur", onBlur);
        document.removeEventListener("visibilitychange", onVis);
        cv.removeEventListener("pointerdown", onPDown); cv.removeEventListener("pointermove", onPMove); cv.removeEventListener("pointerup", joyEnd); cv.removeEventListener("pointercancel", joyEnd); cv.removeEventListener("contextmenu", onCtx);
        if (ro) ro.disconnect(); else removeEventListener("resize", resize);
        if (root.parentNode) root.parentNode.removeChild(root);
        if (w.session === api) w.session = null;
      },
      // 컴퓨터와 — 멈춤 · 이어 가기
      pause() { if (mode !== "cpu" || localPaused || (S.phase !== "play" && S.phase !== "count")) return false; localPaused = true; stopInput(); return true; },
      resume() { if (!localPaused) return false; localPaused = false; w.last = performance.now(); return true; },
      isPaused: () => localPaused || !!S.pz,
      isOver: () => S.phase === "end" || S.ended,
      phase: () => S.phase,
      setReady(on) {
        if (!online || (S.phase !== "wait" && !S.pz)) return;
        initAudio();
        on = on ? 1 : 0;
        if (mode === "host") { S.ready[0] = on; checkReady(); sendSnap(); }
        else { myReady = on; S.myReadyAt = performance.now(); send({ t: "rd", on }); }
        lobbyTick();
      },
      requestPause() { if (!online || S.phase !== "play" || S.pz) return; if (mode === "host") pauseBy(0, "pause"); else send({ t: "pz" }); },
      setLink(kind) {
        link = kind;
        if (mode === "host") {
          if (kind !== "ok") { if (S.phase === "wait") S.ready[1] = 0; else if (S.phase === "play" || S.phase === "count") pauseBy(1, "link"); }
          else sendSnap();
        }
        lobbyTick();
      },
      lobby: () => lobbyInfo(),
      map: () => S.map,
      // 맵 고르기 — 컴퓨터와 · 구경은 언제든(경기 전), 대전은 주인만 경기 전에. 바꾸면 두 사람 준비가 풀린다
      setMap(id) {
        if (mode === "guest" || ((mode === "host" || mode === "cpu") && S.phase !== "wait")) return false;
        if (!w.setMap(id) && S.map === w.mapId) return false;
        S.map = w.mapId;
        if (mode === "host") { S.ready = [0, 0]; S.countT = 0; }
        resetWorld(); if (mode === "demo") S.phase = "play";
        if (mode === "host") sendSnap();
        lobbyTick();
        return true;
      },
      debug: () => ({ mode, phase: S.phase, timeLeft: Math.round(S.timeLeft * 10) / 10, playT: Math.round(S.playT * 10) / 10, pz: S.pz, ready: S.ready.slice(), size: J.map((j) => Math.round(j.s * 100)), pos: J.map((j) => [Math.round(j.x * 10) / 10, Math.round(j.z * 10) / 10]), dash: J.map((j) => j.dash), result: S.result, seed: S.seed, alive: food.filter((f) => f.alive).length, food0: [Math.round(food[0].x * 100) / 100, Math.round(food[0].z * 100) / 100], snapAge: lastSnapAt ? Math.round(performance.now() - lastSnapAt) : null, rtt }),
      devSet(o) { if (!opts.dev || !sim) return; if (o.time !== undefined) S.timeLeft = o.time; if (o.playT !== undefined) S.playT = o.playT; if (o.m) o.m.forEach((v, i) => { if (v) { J[i].m = v; setSize(J[i]); } }); if (o.pos) o.pos.forEach((p, i) => { if (p) { J[i].x = p[0]; J[i].z = p[1]; } }); if (o.inv !== undefined) J.forEach((j) => { j.inv = o.inv; }); },
      devAuto(on) { if (opts.dev) devAuto = !!on; },
    };
    w.session = api;
    return api;
  }

  // 맵 목록(화면 카드용) — { id, name, tip, chip: [색 셋] }
  const MAPS = JELLY_MAPS.map((m) => ({ id: m.id, name: m.name, tip: m.tip, chip: m.chip.slice() }));
  return { create, sizeWinner, ROUND, SAFE, PVP, EVEN, JCOL, MAPS, available: () => !!window.THREE };
})();
