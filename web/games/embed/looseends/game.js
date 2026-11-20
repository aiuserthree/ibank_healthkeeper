/* 실타래 풀기 — 렌더링 · 입력 · 저장 · 헬스키퍼 아케이드 연동. 그림은 모두 캔버스로 직접 그린다(외부 이미지 · CDN 없음). */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const Rules = window.LooseRules, LV = window.LooseLevels;
  if (!Rules || !Array.isArray(LV) || LV.length !== 40) { $('loading-error').hidden = false; return; }
  const EMBED = new URLSearchParams(location.search).get('hk') === '1' && parent !== window;
  const send = (type, extras = {}) => { if (EMBED) parent.postMessage({ type, ...extras }, location.origin); };
  const SAVE = 'looseends.v1', SCORE_MAX = 250000, ENDLESS_CAP = 400, ENDLESS_POINTS = 250;
  const canvas = $('board'), ctx = canvas.getContext('2d');

  // ---------- 이름 · 색 ----------
  const CHAPTERS = ['첫 실', '매듭 연습', '얽힌 고리', '깊은 수틀', '큰 매듭'];
  const COLORS = ['#d98a7a', '#e3b04b', '#7fa9a6', '#9a82c8', '#8cb273', '#d6794f', '#6f8fc7', '#c77fa3'];
  const THREADS = [
    { id: 'cotton', name: '무명실', need: 0 }, { id: 'candy', name: '사탕 줄무늬', need: 10 }, { id: 'ribbon', name: '리본', need: 24 },
    { id: 'neon', name: '네온', need: 42 }, { id: 'gold', name: '금실', need: 66 }, { id: 'rainbow', name: '무지개', need: 96 },
  ];
  const LOOMS = [{ id: 'linen', name: '리넨 공방', need: 0 }, { id: 'garden', name: '정원', need: 30 }];
  const TIPS = [
    '흰 테를 두른 핀을 빈 구멍으로 끌어 놓으세요.', '어느 줄이 위에 걸쳐 있는지 보세요.', '덮인 줄을 억지로 빼면 위 줄과 꼬여요. 위에 있는 줄부터!',
    '길을 터 주면 아래 줄이 풀려요.', '핀을 어디에 놓느냐에 따라 줄이 서로 비켜요.', '빈 구멍은 많을수록 좋아요.',
    '한 번 옮긴 줄은 맨 위로 올라가요.', '목표 수에 맞추면 별 세 개!', '꼬였다면 핀을 반대쪽으로 되돌리면 풀려요.', '되돌리기는 얼마든지 괜찮아요.',
  ];

  // ---------- 저장 ----------
  const fresh = () => ({
    stars: Array(40).fill(0), moves: Array(40).fill(0), score: Array(40).fill(0), cur: 0,
    settings: { sound: false, gentle: false, loom: 'linen', thread: 'cotton' },
    daily: { date: '', stars: 0, moves: 0, streak: 0, last: '' }, endless: { cleared: 0, seed: 7 },
  });
  let rec = fresh(), saveOk = true;
  try {
    const s = JSON.parse(localStorage.getItem(SAVE));
    if (s && typeof s === 'object') {
      const arr = (a, max) => Array.from({ length: 40 }, (_, i) => Number.isInteger(a?.[i]) ? Math.max(0, Math.min(max, a[i])) : 0);
      rec.stars = arr(s.stars, 3); rec.moves = arr(s.moves, 999); rec.score = arr(s.score, 3000);
      rec.cur = Number.isInteger(s.cur) ? Math.max(0, Math.min(39, s.cur)) : 0;
      if (s.settings) {
        rec.settings.sound = !!s.settings.sound; rec.settings.gentle = !!s.settings.gentle;
        if (LOOMS.some(l => l.id === s.settings.loom)) rec.settings.loom = s.settings.loom;
        if (THREADS.some(t => t.id === s.settings.thread)) rec.settings.thread = s.settings.thread;
      }
      if (s.daily && typeof s.daily.date === 'string') rec.daily = { date: s.daily.date.slice(0, 10), stars: Math.max(0, Math.min(3, s.daily.stars | 0)), moves: Math.max(0, s.daily.moves | 0), streak: Math.max(0, s.daily.streak | 0), last: String(s.daily.last || '').slice(0, 10) };
      if (s.endless) rec.endless = { cleared: Math.max(0, Math.min(100000, s.endless.cleared | 0)), seed: (s.endless.seed | 0) || 7 };
    }
  } catch (_) { saveOk = false; }
  const save = () => { try { localStorage.setItem(SAVE, JSON.stringify(rec)); } catch (_) { saveOk = false; } };
  const starTotal = () => rec.stars.reduce((a, b) => a + b, 0);
  const total = () => Math.min(SCORE_MAX, rec.score.reduce((a, b) => a + b, 0) + Math.min(ENDLESS_CAP, rec.endless.cleared) * ENDLESS_POINTS);
  const threadOk = t => starTotal() >= t.need, loomOk = l => starTotal() >= l.need;
  const kstDate = (offset = 0) => new Date(Date.now() + 9 * 3600e3 + offset * 864e5).toISOString().slice(0, 10);

  // ---------- 소리 ----------
  let audio;
  function tone(freq, dur = .14, type = 'sine', vol = .05, delay = 0) {
    if (!rec.settings.sound) return;
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const t0 = audio.currentTime + delay, o = audio.createOscillator(), g = audio.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + .015); g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
      o.connect(g); g.connect(audio.destination); o.start(t0); o.stop(t0 + dur + .02);
    } catch (_) { rec.settings.sound = false; }
  }
  const sfx = {
    pick: () => tone(520, .1), drop: () => tone(392, .12, 'triangle'), warn: () => tone(170, .18, 'triangle', .06),
    twist: () => { tone(233, .22, 'sawtooth', .025); tone(196, .26, 'triangle', .05, .06); }, untwist: () => [523, 784].forEach((f, i) => tone(f, .14, 'sine', .04, i * .06)),
    free: () => [660, 880, 1100].forEach((f, i) => tone(f, .16, 'sine', .04, i * .07)),
    win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, .28, 'sine', .05, i * .1)), click: () => tone(600, .06, 'square', .02),
  };
  const gentle = () => rec.settings.gentle || matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- 판 상태 ----------
  let S = null, geo = { cx: 0, cy: 0, R: 100 }, W = 0, H = 0, DPR = 1, bgCache = null, bgKey = '';
  let particles = [], modal = null, coachTimer = 0;

  function mapLevel(i) {
    const d = LV[i];
    return { kind: 'map', idx: i, name: d.name, holes: Rules.layout(d.ring, d.inner), ropes: d.ropes.map(([a, b], k) => ({ a, b, id: k })), target: d.target };
  }
  function genLevel(seed, spec, name, kind, idx, twisted) {
    const [ring, inner, ropes, min, max] = spec;
    for (let k = 0; k < 8; k++) {
      const p = Rules.generate(seed + k * 7919, { ring, inner, ropes, minMoves: Math.max(1, min - (k > 4 ? 1 : 0)), maxMoves: max + (k > 5 ? 1 : 0), tries: 300, nodes: 120000 });
      if (!p) continue;
      // 처음부터 꼬인 판: 덮인 줄 하나를 억지로 뺀 상태에서 시작(목표는 그 상태의 깔끔한 풀이 최소 수)
      const t = twisted ? Rules.twist(p, seed + k, { maxMoves: max + 2, nodes: 90000 }) : null;
      if (t) return { kind, idx, name, holes: t.holes, ropes: t.ropes, tw: t.tw, target: t.target };
      return { kind, idx, name, holes: p.holes, ropes: p.ropes, target: p.target };
    }
    return mapLevel(Math.min(39, 10 + (seed % 20)));
  }
  const endlessSpec = n => [[10, 0, 4, 2, 4], [12, 0, 5, 3, 5], [12, 4, 6, 4, 6], [14, 4, 7, 5, 7], [14, 6, 8, 6, 8]][Math.min(4, Math.floor((n - 1) / 4))];
  const hashStr = s => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

  function begin(level) {
    closeModal(true);
    S = { ...level, ropes: level.ropes.map(r => ({ ...r })), tw: { ...(level.tw || {}) }, hookT: {}, wob: {}, preview: null, moves: 0, hist: [], held: null, sel: null, cursor: 0, kb: false, hint: null, anim: [], busy: false, won: false, shake: null, flash: null, mv: new Set(), tip: '' };
    S.tip = level.kind === 'map' ? (TIPS[level.idx] || '흰 테 두른 핀을 빈 구멍으로 옮기세요.') : Rules.twCount(level.tw) ? '처음부터 꼬여 있어요. 꼬인 줄을 반대쪽으로 돌려 풀어요 — 막히면 힌트!' : level.kind === 'daily' ? '오늘의 퍼즐이에요. 차분히 풀어 보세요.' : '끝없이 이어지는 퍼즐이에요.';
    S.cursor = S.ropes.length ? S.ropes[S.ropes.length - 1].a : 0;
    particles = []; recalc(); setCoach(S.tip); hud();
    if (level.kind === 'map') { rec.cur = level.idx; save(); }
    if (level.kind === 'map' && level.idx === 0 && rec.stars[0] === 0) showHint(true);
    send('hk:resumed'); send('hk:start'); send('hk:live', { score: total() });
  }
  const restart = () => { if (!S) return; sfx.click(); begin(S.kind === 'map' ? mapLevel(S.idx) : S.initialLevel); };

  function recalc() {
    const m = Rules.crossMatrix(S.holes, S.ropes); S.cm = m;
    // mv: 꼬임 없이 옮길 수 있는 줄(흰 테). 그 밖의 줄도 옮길 수는 있지만 얽힌 줄과 감긴다.
    S.mv = new Set(); S.ropes.forEach((r, i) => { if (!Rules.entangled(S.holes, S.ropes, i, m, S.tw).length) S.mv.add(r.id); });
  }
  const ropeIdx = id => S.ropes.findIndex(r => r.id === id);
  const occupiedSet = () => Rules.occupied(S.ropes);

  // ---------- 좌표 ----------
  function resize() {
    const r = canvas.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height); DPR = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    const side = getComputedStyle($('side-left')).display !== 'contents';
    const narrow = !side, short = H <= 430 && side;
    const top = narrow ? 70 : short ? 50 : 66, bot = narrow ? 156 : short ? 8 : 18;
    const availH = H - top - bot;
    let x0 = 0, x1 = W;
    if (side) { x0 = $('side-left').getBoundingClientRect().right - r.left + 8; x1 = $('side-right').getBoundingClientRect().left - r.left - 8; }
    geo = { cx: (x0 + x1) / 2, cy: top + availH / 2, R: Math.max(60, Math.min((x1 - x0) / 2 * (narrow ? .94 : .98), availH / 2 * .99)) };
    bgCache = null;
  }
  const holeXY = i => { const h = S.holes[i]; return { x: geo.cx + h.x * geo.R * .88, y: geo.cy + h.y * geo.R * .88 }; };
  const endPos = (rope, end) => (S.held && S.held.id === rope.id && S.held.end === end) ? { x: S.held.x, y: S.held.y } : holeXY(rope[end]);
  const pegR = () => Math.max(9, geo.R * .066);
  const ropeW = () => Math.max(7, geo.R * .068);
  const toLocal = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  // ---------- 그리기 ----------
  const mix = (hex, to, t) => {
    const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), a = p(hex), b = p(to);
    return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
  };
  const shade = (h, t) => t >= 0 ? mix(h, '#ffffff', t) : mix(h, '#000000', -t);

  // 생성 그림(장마다 다른 책상 · 천, 수틀 천). 못 받으면 아래 캔버스 그림이 대신한다.
  const ART = {};
  function art(name) {
    if (!ART[name]) { const im = new Image(); im.onload = () => { bgCache = null; }; im.onerror = () => {}; im.src = `/assets/games/looseends/${name}.webp`; ART[name] = im; }
    const im = ART[name]; return im.complete && im.naturalWidth ? im : null;
  }
  function bgName() {
    if (rec.settings.loom === 'garden') return 'bg4';
    if (!S) return 'bg1';
    if (S.kind === 'map') return 'bg' + (Math.floor(S.idx / 8) + 1);
    if (S.kind === 'daily') return 'bg3';
    return 'bg' + (((S.idx || 1) - 1) % 5 + 1);
  }
  const bgKeyNow = () => rec.settings.loom + bgName() + W + 'x' + H;
  function coverDraw(g, im, x, y, w, h) {
    const k = Math.max(w / im.naturalWidth, h / im.naturalHeight), dw = im.naturalWidth * k, dh = im.naturalHeight * k;
    g.drawImage(im, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }
  function buildBg() {
    const c = document.createElement('canvas'); c.width = Math.round(W * DPR); c.height = Math.round(H * DPR);
    const g = c.getContext('2d'); g.scale(DPR, DPR);
    const garden = rec.settings.loom === 'garden', rand = Rules.rng(garden ? 99 : 7), photo = art(bgName()), linen = art('linen');
    if (photo) {
      coverDraw(g, photo, 0, 0, W, H);
      const v = g.createRadialGradient(geo.cx, geo.cy, geo.R * .9, geo.cx, geo.cy, Math.max(W, H) * .75); v.addColorStop(0, 'rgba(40,20,5,0)'); v.addColorStop(1, 'rgba(40,20,5,.28)');
      g.fillStyle = v; g.fillRect(0, 0, W, H);
    } else {
    const grad = g.createLinearGradient(0, 0, W, H);
    if (garden) { grad.addColorStop(0, '#eceadf'); grad.addColorStop(1, '#cfd3c2'); } else { grad.addColorStop(0, '#e6b97f'); grad.addColorStop(1, '#cf9559'); }
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    // 나뭇결
    g.lineWidth = 1;
    for (let i = 0; i < 70; i++) {
      const y = rand() * H, amp = 2 + rand() * 5, len = W * (.4 + rand() * .8), x0 = rand() * W - len * .3;
      g.strokeStyle = garden ? `rgba(120,125,105,${.05 + rand() * .06})` : `rgba(120,70,25,${.05 + rand() * .08})`;
      g.beginPath(); g.moveTo(x0, y);
      for (let x = 0; x <= len; x += 20) g.lineTo(x0 + x, y + Math.sin(x * .02 + i) * amp);
      g.stroke();
    }
    g.fillStyle = garden ? 'rgba(90,95,80,.12)' : 'rgba(110,60,20,.14)';
    for (const f of [.34, .67]) g.fillRect(W * f, 0, 2, H);
    // 천 조각(왼쪽 위 · 오른쪽 아래)
    const cloth = (x, y, w, h, rot, base, stripe) => {
      g.save(); g.translate(x, y); g.rotate(rot); g.shadowColor = 'rgba(60,35,10,.3)'; g.shadowBlur = 14; g.shadowOffsetY = 5;
      g.fillStyle = base; g.fillRect(-w / 2, -h / 2, w, h); g.shadowColor = 'transparent';
      g.fillStyle = stripe; for (let k = -w / 2 + 14; k < w / 2; k += 38) g.fillRect(k, -h / 2, 5, h);
      g.restore();
    };
    cloth(W * .08, H * .12, W * .34, H * .3, -.5, garden ? '#e9efe0' : '#f1e3c4', garden ? 'rgba(130,160,120,.5)' : 'rgba(190,80,70,.55)');
    cloth(W * .95, H * .9, W * .3, H * .34, .55, garden ? '#e6e4f1' : '#ead8b0', garden ? 'rgba(150,130,190,.4)' : 'rgba(150,120,80,.4)');
    }
    const sideMode = getComputedStyle($('side-left')).display !== 'contents';
    if (!sideMode && !photo) {
    // 실패(왼쪽 아래)
    const sx = W * .105, sy = H * .79, sw = Math.min(38, W * .05), sh = sw * 1.5;
    g.save(); g.shadowColor = 'rgba(60,35,10,.4)'; g.shadowBlur = 8; g.shadowOffsetY = 4;
    g.fillStyle = '#c99a5b'; g.fillRect(sx - sw, sy - sh * .62, sw * 2, sh * .16); g.fillRect(sx - sw, sy + sh * .46, sw * 2, sh * .16); g.restore();
    const tg = g.createLinearGradient(sx - sw * .8, 0, sx + sw * .8, 0); tg.addColorStop(0, '#d4c19a'); tg.addColorStop(.5, '#f5ead0'); tg.addColorStop(1, '#c2ae84');
    g.fillStyle = tg; g.fillRect(sx - sw * .8, sy - sh * .46, sw * 1.6, sh * .92);
    g.strokeStyle = 'rgba(120,90,50,.35)'; for (let k = -sh * .42; k < sh * .46; k += 5) { g.beginPath(); g.moveTo(sx - sw * .8, sy + k); g.lineTo(sx + sw * .8, sy + k + 2); g.stroke(); }
    // 가위(오른쪽 위)
    g.save(); g.translate(W * .93, H * .09); g.rotate(-.9); g.strokeStyle = '#8a8f97'; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, 0); g.lineTo(60, -12); g.moveTo(0, 0); g.lineTo(60, 12); g.stroke();
    g.strokeStyle = '#b5543f'; g.lineWidth = 4; g.beginPath(); g.ellipse(-12, -8, 10, 7, .3, 0, 7); g.moveTo(-2, 9); g.ellipse(-12, 9, 10, 7, -.3, 0, 7); g.stroke(); g.restore();
    }

    // 수틀
    const { cx, cy, R } = geo;
    g.save(); g.shadowColor = 'rgba(60,35,10,.5)'; g.shadowBlur = R * .14; g.shadowOffsetY = R * .06;
    g.fillStyle = '#d9b077'; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill(); g.restore();
    const fr = g.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
    if (garden) { fr.addColorStop(0, '#f4f1e8'); fr.addColorStop(1, '#bdb9a6'); } else { fr.addColorStop(0, '#f3dba8'); fr.addColorStop(.5, '#e0b878'); fr.addColorStop(1, '#c79556'); }
    g.fillStyle = fr; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, R - 1, 0, 7); g.stroke();
    g.strokeStyle = 'rgba(90,50,15,.35)'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, R * .79, 0, 7); g.stroke();
    g.setLineDash([2, 5]); g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 1.5; g.beginPath(); g.arc(cx, cy, R * .965, 0, 7); g.stroke(); g.setLineDash([]);
    // 천 바닥
    g.save(); g.beginPath(); g.arc(cx, cy, R * .77, 0, 7); g.clip();
    g.fillStyle = '#efe2c4'; g.fillRect(cx - R, cy - R, R * 2, R * 2);
    if (linen) coverDraw(g, linen, cx - R * .77, cy - R * .77, R * 1.54, R * 1.54);
    g.strokeStyle = 'rgba(160,125,80,.22)'; g.lineWidth = 1;
    if (!linen) for (let k = -R; k < R; k += 4) { g.beginPath(); g.moveTo(cx + k, cy - R); g.lineTo(cx + k, cy + R); g.stroke(); g.beginPath(); g.moveTo(cx - R, cy + k); g.lineTo(cx + R, cy + k); g.stroke(); }
    const ig = g.createRadialGradient(cx, cy, R * .6, cx, cy, R * .77); ig.addColorStop(0, 'rgba(90,55,20,0)'); ig.addColorStop(1, 'rgba(90,55,20,.28)');
    g.fillStyle = ig; g.fillRect(cx - R, cy - R, R * 2, R * 2); g.restore();
    bgCache = c; bgKey = bgKeyNow();
  }

  function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); }
  function symbol(x, y, r, id) {
    ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.beginPath();
    const k = id % 8;
    if (k === 0) { ctx.moveTo(x, y - r); ctx.lineTo(x + r * .9, y + r * .75); ctx.lineTo(x - r * .9, y + r * .75); }
    else if (k === 1) { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); }
    else if (k === 2) ctx.arc(x, y, r * .8, 0, 7);
    else if (k === 3) ctx.rect(x - r * .75, y - r * .75, r * 1.5, r * 1.5);
    else if (k === 4) { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } }
    else if (k === 5) { ctx.rect(x - r * .25, y - r, r * .5, r * 2); ctx.rect(x - r, y - r * .25, r * 2, r * .5); }
    else if (k === 6) { for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } }
    else { ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x + r * 1.1, y + r * .2, x, y + r); ctx.quadraticCurveTo(x - r * 1.1, y + r * .2, x, y - r); }
    ctx.fill();
  }

  // 줄 길: A → B, bend 만큼 가운데가 옆으로 휜다(튕김). off 는 법선 방향으로 평행 이동(밝은 면 · 결).
  let PATH = null; // 꼬인 줄: 미리 계산한 점 줄 [{x,y}] — 있으면 이 길로 그린다
  function ropePath(A, B, bend, off = 0) {
    const dx = B.x - A.x, dy = B.y - A.y, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    if (PATH) {
      ctx.beginPath();
      for (let k = 0; k < PATH.length; k++) {
        const P = PATH[k], Q = PATH[Math.min(PATH.length - 1, k + 1)], R0 = PATH[Math.max(0, k - 1)];
        const tx = Q.x - R0.x, ty = Q.y - R0.y, tl = Math.hypot(tx, ty) || 1, ox = -ty / tl * off, oy = tx / tl * off;
        if (k) ctx.lineTo(P.x + ox, P.y + oy); else ctx.moveTo(P.x + ox, P.y + oy);
      }
      return;
    }
    ctx.beginPath(); ctx.moveTo(A.x + nx * off, A.y + ny * off);
    if (Math.abs(bend) > .3) ctx.quadraticCurveTo((A.x + B.x) / 2 + nx * (bend * 2 + off), (A.y + B.y) / 2 + ny * (bend * 2 + off), B.x + nx * off, B.y + ny * off);
    else ctx.lineTo(B.x + nx * off, B.y + ny * off);
  }
  function ropeBody(A, B, color, style, w, bend = 0) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const line = (o = 0) => ropePath(A, B, bend, o);
    const L = Math.hypot(B.x - A.x, B.y - A.y), nx = -(B.y - A.y) / (L || 1);
    const hiSide = nx < 0 ? -1 : 1; // 화면 위쪽(빛이 오는 쪽)으로 밝은 면
    const twistGrain = (c, a) => { // 꼰 실의 비스듬한 결
      ctx.save(); ctx.strokeStyle = c; ctx.globalAlpha *= a; ctx.lineWidth = w * .86; ctx.setLineDash([w * .22, w * .36]); ctx.lineCap = 'butt'; line(); ctx.stroke(); ctx.restore();
    };
    if (style === 'candy') {
      ctx.strokeStyle = '#fff6ec'; ctx.lineWidth = w; line(); ctx.stroke();
      ctx.strokeStyle = color; ctx.lineCap = 'butt'; ctx.setLineDash([w * 1.1, w * 1.1]); line(); ctx.stroke(); ctx.setLineDash([]); ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = w * .2; line(-hiSide * w * .22); ctx.stroke();
    } else if (style === 'ribbon') {
      ctx.strokeStyle = shade(color, -.28); ctx.lineWidth = w * 1.5; line(); ctx.stroke();
      ctx.strokeStyle = color; ctx.lineWidth = w * 1.2; line(); ctx.stroke();
      ctx.strokeStyle = shade(color, .5); ctx.lineWidth = w * .28; line(-hiSide * w * .25); ctx.stroke();
    } else if (style === 'neon') {
      ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = w * 2.4; ctx.strokeStyle = shade(color, .15); ctx.lineWidth = w * .95; line(); ctx.stroke(); ctx.restore();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = w * .3; line(); ctx.stroke();
    } else if (style === 'gold') {
      const g = ctx.createLinearGradient(A.x, A.y, B.x, B.y); g.addColorStop(0, '#fff0a0'); g.addColorStop(.5, '#d9a232'); g.addColorStop(1, '#fff0a0');
      ctx.strokeStyle = g; ctx.lineWidth = w; line(); ctx.stroke();
      twistGrain('#7a5410', .45);
      ctx.strokeStyle = 'rgba(255,250,210,.8)'; ctx.lineWidth = w * .2; line(-hiSide * w * .22); ctx.stroke();
    } else if (style === 'rainbow') {
      const g = ctx.createLinearGradient(A.x, A.y, B.x, B.y);
      ['#ef6b6b', '#f3b04b', '#f2e060', '#7cc87c', '#62a9e0', '#a07ad8'].forEach((c, i) => g.addColorStop(i / 5, c));
      ctx.strokeStyle = g; ctx.lineWidth = w; line(); ctx.stroke();
      twistGrain('#3a2410', .25);
      ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = w * .2; line(-hiSide * w * .22); ctx.stroke();
    } else {
      ctx.strokeStyle = color; ctx.lineWidth = w; line(); ctx.stroke();
      ctx.strokeStyle = shade(color, -.3); ctx.lineWidth = w * .34; line(hiSide * w * .26); ctx.globalAlpha *= .7; ctx.stroke(); ctx.globalAlpha /= .7;
      twistGrain(shade(color, -.45), .6);
      ctx.strokeStyle = shade(color, .55); ctx.lineWidth = w * .22; line(-hiSide * w * .22); ctx.stroke();
    }
  }
  function wobbleOf(rope, now) {
    const wb = S.wob[rope.id]; if (!wb) return 0;
    const t = (now - wb.t0) / 1000; if (t > .9) { delete S.wob[rope.id]; return 0; }
    return wb.amp * Math.sin(t * 26) * Math.exp(-t * 5.5);
  }
  function drawRope(rope, opt = {}) {
    const A = endPos(rope, 'a'), B = endPos(rope, 'b'), color = COLORS[rope.id % 8], w = ropeW(), off = opt.off || { x: 0, y: 0 };
    const bend = opt.gone ? 0 : wobbleOf(rope, opt.now || 0);
    PATH = opt.gone ? null : (opt.path || null);
    ctx.save(); ctx.globalAlpha = opt.alpha == null ? 1 : opt.alpha; ctx.translate(off.x, off.y);
    if (opt.spin) { const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2; ctx.translate(mx, my); ctx.rotate(opt.spin); ctx.translate(-mx, -my); }
    // 그림자(아래 줄 위로 진다) — 넓고 옅은 것 + 좁고 진한 것
    ctx.lineCap = 'round';
    ctx.save(); ctx.translate(w * .35, w * .8);
    ctx.strokeStyle = 'rgba(55,30,8,.13)'; ctx.lineWidth = w * 2; ropePath(A, B, bend); ctx.stroke();
    ctx.strokeStyle = 'rgba(55,30,8,.22)'; ctx.lineWidth = w * 1.2; ropePath(A, B, bend); ctx.stroke(); ctx.restore();
    // 가장자리 테 — 겹친 자리에서 아래 줄이 살짝 끊겨 보인다
    ctx.strokeStyle = 'rgba(70,40,15,.75)'; ctx.lineWidth = w * 1.32; ropePath(A, B, bend); ctx.stroke();
    ropeBody(A, B, color, rec.settings.thread, w, bend);
    if (opt.flash) { ctx.strokeStyle = opt.flashColor ? `rgba(255,140,40,${opt.flash})` : `rgba(255,255,255,${opt.flash})`; ctx.lineWidth = w * 1.6; ropePath(A, B, bend); ctx.stroke(); }
    for (const [P, end] of [[A, 'a'], [B, 'b']]) {
      let px = P.x, py = P.y;
      if (opt.shake && opt.shake.end === end) px += opt.shake.dx;
      const r = pegR(), held = S.held && S.held.id === rope.id && S.held.end === end, mvOk = S.mv.has(rope.id) && !opt.gone;
      if (held) { ctx.fillStyle = 'rgba(40,20,5,.28)'; circle(px + 4, py + 9, r * 1.1); ctx.fill(); py -= 5; }
      else if (mvOk) { ctx.fillStyle = 'rgba(40,20,5,.3)'; circle(px + 1.5, py + 3.5, r); ctx.fill(); }
      const rr = r * (held ? 1.22 : 1);
      // 핀 머리: 금속 테 + 색 구슬
      ctx.fillStyle = mvOk || held ? '#fffaf0' : shade(color, -.5); circle(px, py, rr * 1.12); ctx.fill();
      const g = ctx.createRadialGradient(px - rr * .35, py - rr * .4, rr * .1, px, py, rr);
      g.addColorStop(0, shade(color, .55)); g.addColorStop(.6, color); g.addColorStop(1, shade(color, -.35));
      ctx.fillStyle = g; circle(px, py, rr * (mvOk || held ? .9 : .95)); ctx.fill();
      if (!mvOk && !held && !opt.gone) { ctx.fillStyle = 'rgba(40,25,10,.22)'; circle(px, py, rr * .95); ctx.fill(); }
      symbol(px, py, rr * .48, rope.id);
    }
    ctx.restore(); PATH = null;
  }

  // 걸린 쌍: 아래 줄(x)이 위 줄(y)의 한 점에 걸려 꺾인다. 그 점은 걸릴 때 핀이 위 줄을 지난 자리(hookT, 위 줄 위의 0~1).
  function hookPoint(low, host) {
    const C = endPos(host, 'a'), D = endPos(host, 'b'), k = low.id + '-' + host.id;
    let t = S.hookT[k];
    if (t == null) { // 기록이 없으면(처음부터 꼬인 판) 아래 줄 가운데에서 가장 가까운 점
      const A = endPos(low, 'a'), B = endPos(low, 'b'), M = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 }, dx = D.x - C.x, dy = D.y - C.y;
      t = ((M.x - C.x) * dx + (M.y - C.y) * dy) / (dx * dx + dy * dy || 1);
    }
    t = Math.max(.15, Math.min(.85, t));
    return { x: C.x + (D.x - C.x) * t, y: C.y + (D.y - C.y) * t, ang: Math.atan2(D.y - C.y, D.x - C.x) };
  }
  // 걸린 줄의 길: 아래 줄 r 이 위 줄 s 를 따라 감긴 수만큼 위아래로 번갈아 넘나들며 휘감긴다.
  // 돌려주는 값: { pts: [{x,y}], fronts: [[i0,i1]] } — fronts 는 위 줄보다 앞(위)을 지나는 토막(나중에 덧그린다)
  function quad(P0, C, P1, n) { const out = []; for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; out.push({ x: u * u * P0.x + 2 * u * t * C.x + t * t * P1.x, y: u * u * P0.y + 2 * u * t * C.y + t * t * P1.y }); } return out; }
  function ropeGeom(rope) {
    if (S.held && S.held.id === rope.id) return null;
    const pr = Rules.twPairs(S.tw).find(p => p.x === rope.id); if (!pr) return null;
    const host = S.ropes[ropeIdx(pr.y)]; if (!host) return null;
    const w = ropeW(), turns = Math.abs(pr.w), X = hookPoint(rope, host);
    const C = endPos(host, 'a'), D = endPos(host, 'b'), hl = Math.hypot(D.x - C.x, D.y - C.y) || 1;
    const ex = (D.x - C.x) / hl, ey = (D.y - C.y) / hl, nx = -ey, ny = ex;
    const L = Math.min(hl * .7, w * (3 + 2.2 * turns)), amp = w * 1.05;
    // 꼬임 구간을 위 줄 안쪽으로
    const tX = Math.max(L / 2 + w, Math.min(hl - L / 2 - w, (X.x - C.x) * ex + (X.y - C.y) * ey));
    const S1 = { x: C.x + ex * (tX - L / 2), y: C.y + ey * (tX - L / 2) }, S2 = { x: C.x + ex * (tX + L / 2), y: C.y + ey * (tX + L / 2) };
    let E1 = endPos(rope, 'a'), E2 = endPos(rope, 'b');
    if ((E1.x - C.x) * ex + (E1.y - C.y) * ey > (E2.x - C.x) * ex + (E2.y - C.y) * ey) [E1, E2] = [E2, E1];
    const side = P => ((P.x - S1.x) * nx + (P.y - S1.y) * ny) >= 0 ? 1 : -1, sd1 = side(E1), sd2 = side(E2);
    let h = turns * 2; if ((h % 2 === 1) !== (sd1 !== sd2)) h += 1; // 위 줄을 넘는 횟수(끝 두 핀의 쪽에 맞춘다)
    const off = (u, y) => ({ x: S1.x + ex * L * u + nx * y, y: S1.y + ey * L * u + ny * y });
    const steps = Math.max(18, h * 10), pts = [], fronts = [];
    const p0 = off(0, sd1 * amp), p1 = off(1, sd1 * amp * (h % 2 ? -1 : 1));
    pts.push(...quad(E1, off(-.35, sd1 * amp * 1.3), p0, 14));
    const base = pts.length - 1;
    for (let i = 1; i <= steps; i++) { const u = i / steps; pts.push(off(u, sd1 * amp * Math.cos(Math.PI * h * u))); }
    pts.push(...quad(p1, off(1.35, sd1 * amp * (h % 2 ? -1 : 1) * 1.3), E2, 14).slice(1));
    // 넘는 자리마다 앞/뒤 번갈아: 첫 번째는 위 줄 밑, 두 번째는 위, …
    for (let c = 0; c < h; c++) if (c % 2 === 1) {
      const uc = (c + .5) / h, half = .5 / h * .75;
      fronts.push([base + Math.max(0, Math.floor((uc - half) * steps)), base + Math.min(steps, Math.ceil((uc + half) * steps))]);
    }
    return { pts, fronts };
  }
  function drawFronts(geoms) {
    const w = ropeW();
    for (const { rope, g } of geoms) for (const [i0, i1] of g.fronts) {
      PATH = g.pts.slice(i0, i1 + 1); const A = PATH[0], B = PATH[PATH.length - 1], color = COLORS[rope.id % 8];
      ctx.save(); ctx.lineCap = 'round';
      ctx.save(); ctx.translate(w * .3, w * .7); ctx.strokeStyle = 'rgba(55,30,8,.22)'; ctx.lineWidth = w * 1.25; ropePath(A, B, 0); ctx.stroke(); ctx.restore();
      ctx.strokeStyle = 'rgba(70,40,15,.75)'; ctx.lineWidth = w * 1.32; ropePath(A, B, 0); ctx.stroke();
      ropeBody(A, B, color, rec.settings.thread, w, 0);
      ctx.restore(); PATH = null;
    }
  }
  function drawTwistBadges(spots) {
    const r = Math.max(10, geo.R * .052), placed = [];
    for (const rp of S.ropes) for (const e of ['a', 'b']) { const h = holeXY(rp[e]); placed.push({ x: h.x, y: h.y, peg: true }); }
    for (const sp of spots) {
      let x = sp.P.x + r * 1.6, y = sp.P.y - r * 1.9;
      // 표시끼리 겹치지 않게 비켜 놓는다
      const pr = pegR();
      const hit = () => placed.some(q => q.peg ? Math.abs(q.x - x) < r * 1.45 + pr * 1.2 && Math.abs(q.y - y) < r * .85 + pr * 1.2 : Math.abs(q.x - x) < r * 3.1 && Math.abs(q.y - y) < r * 1.9);
      for (let k = 0; k < 10 && hit(); k++) { if (k % 2) y -= r * 2; else x += r * 3.2 * (k % 4 === 0 ? 1 : -1); }
      placed.push({ x, y });
      ctx.save(); ctx.fillStyle = '#ee8f45'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.shadowColor = 'rgba(60,30,10,.35)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
      ctx.beginPath(); ctx.roundRect(x - r * 1.45, y - r * .85, r * 2.9, r * 1.7, r * .85); ctx.fill(); ctx.shadowColor = 'transparent'; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = `900 ${Math.round(r * 1.15)}px 'Baloo 2', Jua, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText((sp.dir > 0 ? '↻' : '↺') + sp.n, x, y + 1); ctx.restore();
    }
  }

  function drawHoles(now) {
    const occ = occupiedSet(), r = pegR();
    for (let i = 0; i < S.holes.length; i++) {
      const p = holeXY(i), rr = r * (occ.has(i) ? .95 : 1.05);
      // 놋쇠 테 + 깊은 구멍
      const rim = ctx.createLinearGradient(p.x, p.y - rr * 1.3, p.x, p.y + rr * 1.3); rim.addColorStop(0, '#f6e2a8'); rim.addColorStop(.5, '#c99a47'); rim.addColorStop(1, '#8a6224');
      ctx.fillStyle = rim; circle(p.x, p.y, rr * 1.3); ctx.fill();
      const g = ctx.createRadialGradient(p.x, p.y - rr * .35, rr * .15, p.x, p.y, rr);
      g.addColorStop(0, '#1d140d'); g.addColorStop(1, '#4a3624');
      ctx.fillStyle = g; circle(p.x, p.y, rr); ctx.fill();
      ctx.strokeStyle = 'rgba(255,245,215,.6)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(p.x, p.y, rr * 1.3, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    }
    // 집어 든 핀 / 선택 — 놓을 수 있는 빈 구멍 안내
    const picked = S.held || S.sel;
    if (picked) {
      const pulse = gentle() ? .8 : .55 + Math.sin(now / 230) * .25;
      for (let i = 0; i < S.holes.length; i++) if (!occ.has(i)) {
        const p = holeXY(i); ctx.fillStyle = `rgba(255,255,255,${pulse * .22})`; circle(p.x, p.y, r * 1.85); ctx.fill();
        ctx.strokeStyle = `rgba(255,255,255,${pulse})`; ctx.lineWidth = 2.5; ctx.setLineDash([5, 4]); circle(p.x, p.y, r * 1.85); ctx.stroke(); ctx.setLineDash([]);
      }
    }
  }

  function drawHint(now) {
    if (!S.hint) return;
    const rope = S.ropes[ropeIdx(S.hint.id)]; if (!rope) return;
    const from = holeXY(rope[S.hint.end]), to = holeXY(S.hint.to), r = pegR();
    ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 3.2; ctx.setLineDash([9, 8]);
    ctx.lineDashOffset = gentle() ? 0 : -now / 40; ctx.shadowColor = 'rgba(90,60,20,.4)'; ctx.shadowBlur = 3;
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke(); ctx.setLineDash([]);
    ctx.lineWidth = 3; circle(from.x, from.y, r * 2); ctx.stroke(); circle(to.x, to.y, r * 2); ctx.stroke(); ctx.restore();
  }

  let lastFrame = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(.05, (now - lastFrame) / 1000 || .016); lastFrame = now;
    pollPad();
    if (!S) return;
    if (!bgCache || bgKey !== bgKeyNow()) buildBg();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, W, H); ctx.drawImage(bgCache, 0, 0, W, H);
    drawHoles(now);
    const flashT = S.flash ? 1 - (now - S.flash.t0) / 900 : 0;
    const shakeT = S.shake ? (now - S.shake.t0) / 350 : 1;
    if (S.flash && flashT <= 0) S.flash = null; if (S.shake && shakeT >= 1) S.shake = null;
    const prev = S.preview ? S.preview.map(d => d.id) : [], geoms = [];
    for (const rope of S.ropes) {
      const opt = { now };
      if (S.flash && S.flash.ids.includes(rope.id)) { opt.flash = Math.max(0, Math.sin(flashT * Math.PI * 3)) * .6; opt.flashColor = S.flash.warn; }
      if (prev.includes(rope.id)) { opt.flash = .35 + Math.sin(now / 120) * .2; opt.flashColor = true; }
      if (S.shake && S.shake.id === rope.id) opt.shake = { end: S.shake.end, dx: Math.sin(shakeT * Math.PI * 6) * (1 - shakeT) * 6 };
      const g = ropeGeom(rope); if (g) { opt.path = g.pts; geoms.push({ rope, g }); }
      drawRope(rope, opt);
    }
    drawFronts(geoms);
    // 빠져나가는 줄
    S.anim = S.anim.filter(a => {
      const t = (now - a.t0) / a.dur; if (t >= 1) return false;
      const e = t * t * (3 - 2 * t), mx = (holeXY(a.rope.a).x + holeXY(a.rope.b).x) / 2 - geo.cx, my = (holeXY(a.rope.a).y + holeXY(a.rope.b).y) / 2 - geo.cy;
      if (t < 0) { drawRope(a.rope, { gone: true, now }); return true; }
      const l = Math.hypot(mx, my) || 1, dx = mx / l, dy = my / l, dist = geo.R * (gentle() ? .12 : .9) * e;
      drawRope(a.rope, { alpha: 1 - e * e, off: { x: dx * dist, y: dy * dist - geo.R * .25 * Math.sin(e * Math.PI) }, spin: gentle() ? 0 : e * a.spin, gone: true, now }); return true;
    });
    drawHint(now);
    // 키보드 / 패드 커서
    if (S.kb && !S.won) {
      const p = holeXY(S.cursor), r = pegR(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.shadowColor = '#6f5aa3'; ctx.shadowBlur = 6; circle(p.x, p.y, r * 2.3); ctx.stroke(); ctx.shadowBlur = 0;
    }
    // 놓을 구멍 미리보기
    if (S.held && S.held.hover != null) {
      const p = holeXY(S.held.hover), r = pegR(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; circle(p.x, p.y, r * 2.3); ctx.stroke();
    }
    // 입자
    particles = particles.filter(p => (p.life -= dt) > 0);
    for (const p of particles) {
      p.x += p.vx * dt * 60; p.y += p.vy * dt * 60; p.vy += .12 * dt * 60;
      ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.color; circle(p.x, p.y, p.size); ctx.fill(); ctx.globalAlpha = 1;
    }
  }
  function sparkle(P, color) {
    const n = gentle() ? 4 : 12;
    for (let i = 0; i < n; i++) { const a = Math.random() * 7, s = 1 + Math.random() * 2.6; particles.push({ x: P.x, y: P.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: .7, max: .7, color, size: 2 + Math.random() * 3 }); }
  }

  // ---------- HUD ----------
  const pad = n => String(n).padStart(2, '0');
  function hud() {
    if (!S) return;
    $('puzzle-label').textContent = S.kind === 'map' ? `퍼즐 ${pad(S.idx + 1)} / 40` : S.kind === 'daily' ? '오늘의 퍼즐' : `끝없는 실 ${S.idx}`;
    $('puzzle-name').textContent = S.name;
    $('star-total').textContent = `${starTotal()} / 120`;
    $('moves').textContent = S.moves; $('target').textContent = S.target;
    $('btn-undo').disabled = !S.hist.length || S.busy || S.won;
    const SYM = ['▲', '◆', '●', '■', '★', '✚', '⬢', '♦'];
    $('ropes-dots').innerHTML = S.ropes.map(r => `<i style="background:${COLORS[r.id % 8]}">${SYM[r.id % 8]}</i>`).join('');
    $('ropes-text').textContent = S.ropes.length ? `${S.ropes.length}줄 남음` : '모두 풀렸어요!';
    const tn = Rules.twCount(S.tw), tb = $('twist-badge'); tb.hidden = !tn; tb.textContent = `꼬임 ${tn}`;
    $('goal').innerHTML = `<span class="s">★★★</span> ${S.target}수 이하<br><span class="s">★★</span> ${S.target + 2}수 이하`;
  }
  function setCoach(text, ms = 0, warn = false) {
    clearTimeout(coachTimer); $('coach').textContent = text || ''; $('coach').classList.toggle('warn', !!warn);
    if (ms) coachTimer = setTimeout(() => setCoach(S ? S.tip : ''), ms);
  }

  // ---------- 움직임 ----------
  function nearestPeg(p, onlyMovable) {
    let best = null, bd = Math.max(24, pegR() * 3.2);
    for (const r of S.ropes) {
      if (onlyMovable && !S.mv.has(r.id)) continue;
      for (const end of ['a', 'b']) { const h = holeXY(r[end]), d = Math.hypot(h.x - p.x, h.y - p.y); if (d < bd) { bd = d; best = { id: r.id, end, d }; } }
    }
    return best;
  }
  function nearestEmpty(p) {
    const occ = occupiedSet(); let best = null, bd = Math.max(34, geo.R * .17);
    for (let i = 0; i < S.holes.length; i++) if (!occ.has(i)) { const h = holeXY(i), d = Math.hypot(h.x - p.x, h.y - p.y); if (d < bd) { bd = d; best = i; } }
    return best;
  }
  const NAMES = ['분홍', '노랑', '청록', '보라', '연두', '주황', '파랑', '자주'];
  const ropeName = id => `${NAMES[id % 8]} 줄`;
  // 덮인 핀을 집을 때: 얽힌 줄을 주황으로 깜박이고 「놓으면 꼬여요」
  function warnTangle(id, end) {
    const i = ropeIdx(id), ids = Rules.entangled(S.holes, S.ropes, i, S.cm, S.tw).map(j => S.ropes[j].id);
    S.flash = { ids, t0: performance.now(), warn: true };
    setCoach(`${ids.map(ropeName).join(' · ')}에 걸려 있어요. 이대로 옮기면 꼬여요!`, 2600, true);
  }
  // 집은 핀을 hole 에 놓으면 생길 꼬임 변화(미리 보기)
  function previewAt(id, end, hole) {
    if (hole == null) return null;
    const d = Rules.twistDelta(S.holes, S.ropes, ropeIdx(id), end, hole, S.cm, S.tw);
    return d.length ? d : null;
  }
  function doMove(id, end, hole) {
    const i = ropeIdx(id); if (i < 0 || S.busy || S.won) return false;
    const occ = occupiedSet(); if (occ.has(hole)) return false;
    S.hist.push({ ropes: S.ropes.map(r => ({ ...r })), tw: { ...S.tw }, moves: S.moves, mv: { id, end, from: S.ropes[i][end], to: hole } });
    const delta = Rules.twistDelta(S.holes, S.ropes, i, end, hole, S.cm, S.tw);
    const tw0 = Rules.twCount(S.tw), h1 = S.ropes[i][end], nx = Rules.applyMove(S.ropes, i, end, hole, S.holes, S.tw);
    for (const d of delta) if (!d.w0 && d.w1) { // 새로 걸린 자리: 핀이 지난 길과 위 줄이 만나는 점
      const s2 = S.ropes[ropeIdx(d.id)], P = S.holes[h1], Q = S.holes[hole], C = S.holes[s2.a], D = S.holes[s2.b];
      const den = (Q.x - P.x) * (D.y - C.y) - (Q.y - P.y) * (D.x - C.x);
      S.hookT[id + '-' + d.id] = Math.abs(den) > 1e-9 ? ((C.x - P.x) * (Q.y - P.y) - (C.y - P.y) * (Q.x - P.x)) / -den * -1 : .5;
    }
    const { ropes: after, gone } = Rules.settle(S.holes, nx.ropes, nx.tw);
    S.moves++; S.hint = null; S.sel = null; S.held = null; S.preview = null; S.tw = nx.tw;
    const tw1 = Rules.twCount(S.tw);
    S.wob[id] = { t0: performance.now(), amp: ropeW() * (gentle() ? .4 : 1.3) };
    for (const d of delta) S.wob[d.id] = { t0: performance.now(), amp: ropeW() * (gentle() ? .3 : .9) };
    if (!gone.length) {
      S.ropes = after; recalc(); hud();
      if (tw1 > tw0) {
        sfx.twist(); const worse = delta.filter(d => Math.abs(d.w1) > Math.abs(d.w0)).map(d => d.id);
        S.flash = { ids: worse, t0: performance.now(), warn: true };
        setCoach(`${ropeName(id)}이 ${worse.map(ropeName).join(' · ')} 밑으로 지나가다 걸렸어요! 같은 길로 되돌려야 풀려요.`, 4200, true);
      } else if (tw1 < tw0) { sfx.untwist(); setCoach(tw1 ? `걸린 줄 하나가 풀렸어요. 꼬임 ${tw1}개 남았어요.` : '꼬임이 모두 풀렸어요!', 2600); }
      else { sfx.drop(); setCoach(tw1 ? `꼬임 ${tw1}개 — 걸린 줄을 같은 길로 되돌려야 줄이 빠져요.` : S.tip, 0, !!tw1); }
      return true;
    }
    S.ropes = after; sfx.free(); S.busy = true;
    const now = performance.now();
    gone.forEach((r, k) => { const st = gentle() ? 0 : k * 70; S.anim.push({ rope: r, t0: now + st, dur: gentle() ? 260 : 620, spin: (k % 2 ? 1 : -1) * (.5 + (r.id % 3) * .25) }); setTimeout(() => { sparkle(holeXY(r.a), COLORS[r.id % 8]); sparkle(holeXY(r.b), COLORS[r.id % 8]); }, st); });
    recalc(); hud(); setCoach(S.moves < S.target ? '꼬임 지름길! 목표보다 빨리 풀었어요!' : '모두 풀렸어요!');
    const cleared = S;
    setTimeout(() => { if (S !== cleared) return; S.busy = false; win(); }, gentle() ? 300 : 700 + gone.length * 70);
    return true;
  }
  function undo() {
    if (!S || !S.hist.length || S.busy || S.won) return;
    const h = S.hist.pop(); S.ropes = h.ropes; S.tw = h.tw || {}; S.moves = h.moves; S.hint = null; S.held = null; S.sel = null; S.anim = []; S.preview = null;
    $('btn-undo').classList.remove('pulse');
    sfx.click(); recalc(); hud(); const tn = Rules.twCount(S.tw); setCoach(tn ? `꼬임 ${tn}개 — 꽈배기를 풀어야 줄이 빠져요.` : S.tip, 0, !!tn);
  }

  // ---------- 힌트 ----------
  // ① 꼬임을 늘리지 않는 풀이 ② 꼬임 수까지 쓴 풀이(작은 한도) ③ 그래도 없으면 되돌리기로 꼬이기 전으로
  function showHint(silent) {
    if (!S || S.busy || S.won) return;
    const mv = Rules.suggest(S.holes, S.ropes, S.tw, S.hist.map(h => h.mv));
    if (!mv) {
      if (S.hist.length) { $('btn-undo').classList.remove('pulse'); void $('btn-undo').offsetWidth; $('btn-undo').classList.add('pulse'); setCoach('많이 꼬였어요. 꼬이기 전까지 되돌리기를 눌러 보세요.', 4000, true); }
      else setCoach('다시 하기로 처음부터 풀어 보세요.', 3000, true);
      return;
    }
    S.hint = mv; S.sel = null; if (!silent) sfx.click();
    const pv = previewAt(mv.id, mv.end, mv.to);
    setCoach(silent ? S.tip : pv && pv.some(d => Math.abs(d.w1) < Math.abs(d.w0)) ? '점선대로 되돌리면 걸린 줄이 풀려요.' : '동그라미 친 핀을 점선 끝의 빈 구멍으로 옮겨 보세요.', silent ? 0 : 4000);
  }

  // ---------- 입력(마우스 · 터치) ----------
  let pointerId = null, downAt = null;
  canvas.addEventListener('pointerdown', e => {
    if (!S || modal || S.busy || S.won || pointerId !== null) return;
    S.kb = false; const p = toLocal(e), peg = nearestPeg(p, false);
    if (S.sel) { // 탭으로 고른 핀을 놓는 중
      const hole = nearestEmpty(p);
      if (hole != null) { const s = S.sel; S.sel = null; doMove(s.id, s.end, hole); e.preventDefault(); return; }
      if (!peg || (peg.id === S.sel.id && peg.end === S.sel.end)) { S.sel = null; return; }
    }
    if (!peg) return;
    if (!S.mv.has(peg.id)) warnTangle(peg.id, peg.end);
    pointerId = e.pointerId; downAt = p; S.held = { id: peg.id, end: peg.end, x: p.x, y: p.y, hover: null, from: S.ropes[ropeIdx(peg.id)][peg.end] };
    sfx.pick(); canvas.setPointerCapture(e.pointerId); e.preventDefault();
  });
  canvas.addEventListener('pointermove', e => {
    if (!S || !S.held || e.pointerId !== pointerId) return;
    const p = toLocal(e); S.held.x = p.x; S.held.y = p.y; S.held.hover = nearestEmpty(p);
    const pv = previewAt(S.held.id, S.held.end, S.held.hover), was = S.preview;
    S.preview = pv;
    const newHooks = pv ? pv.filter(d => Math.abs(d.w1) > Math.abs(d.w0)) : [];
    if (newHooks.length && (!was || was.map(d => d.id).join() !== pv.map(d => d.id).join())) setCoach(`여기 놓으면 ${newHooks.map(d => ropeName(d.id)).join(' · ')} 밑에 걸려요!`, 1800, true);
  });
  const release = (e, cancel) => {
    if (!S || !S.held || e.pointerId !== pointerId) return;
    const h = S.held, p = toLocal(e), tap = Math.hypot(p.x - downAt.x, p.y - downAt.y) < 9;
    pointerId = null; S.held = null; S.preview = null; try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* 이미 놓임 */ }
    if (cancel) return;
    if (tap) { S.sel = { id: h.id, end: h.end }; S.hint = S.hint; setCoach('옮길 빈 구멍을 눌러 주세요.', 2200); return; }
    const hole = nearestEmpty(p);
    if (hole != null) doMove(h.id, h.end, hole);
  };
  canvas.addEventListener('pointerup', e => release(e, false));
  canvas.addEventListener('pointercancel', e => release(e, true));
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  // ---------- 입력(키보드 · 게임패드) ----------
  function moveCursor(dx, dy) {
    S.kb = true; const from = holeXY(S.cursor); let best = null, bs = 1e9;
    for (let i = 0; i < S.holes.length; i++) {
      if (i === S.cursor) continue;
      const p = holeXY(i), vx = p.x - from.x, vy = p.y - from.y, along = vx * dx + vy * dy; if (along <= 1) continue;
      const perp = Math.abs(vx * dy - vy * dx), sc = along + perp * 1.7; if (sc < bs) { bs = sc; best = i; }
    }
    if (best != null) { S.cursor = best; if (S.held && S.held.kb) { const p = holeXY(best); S.held.x = p.x; S.held.y = p.y; S.held.hover = occupiedSet().has(best) ? null : best; S.preview = previewAt(S.held.id, S.held.end, S.held.hover); } sfx.click(); }
  }
  function confirmCursor() {
    if (!S || S.busy || S.won) return; S.kb = true;
    if (S.held && S.held.kb) {
      const h = S.held;
      if (S.cursor === h.from) { S.held = null; sfx.click(); return; }
      if (occupiedSet().has(S.cursor)) { sfx.warn(); return; }
      S.held = null; doMove(h.id, h.end, S.cursor); return;
    }
    for (const r of S.ropes) for (const end of ['a', 'b']) if (r[end] === S.cursor) {
      if (!S.mv.has(r.id)) warnTangle(r.id, end);
      const p = holeXY(S.cursor); S.held = { id: r.id, end, x: p.x, y: p.y, hover: null, from: S.cursor, kb: true }; sfx.pick(); return;
    }
  }
  function cancelHeld() { if (S) { S.held = null; S.sel = null; S.preview = null; } }
  document.addEventListener('keydown', e => {
    if (e.code === 'Escape') {
      e.preventDefault();
      if (modal && modal.kind !== 'pause') { closeModal(); return; }
      if (EMBED) { send('hk:esc'); return; }
      modal ? closeModal() : openPause(); return;
    }
    if (modal || !S || (e.target instanceof HTMLButtonElement && ['Enter', 'Space'].includes(e.code))) return;
    const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.code];
    if (dir) { e.preventDefault(); moveCursor(dir[0], dir[1]); }
    else if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); if (!e.repeat) confirmCursor(); }
    else if (e.code === 'KeyU') undo();
    else if (e.code === 'KeyH') showHint();
    else if (e.code === 'Backspace') { e.preventDefault(); cancelHeld(); }
  });
  let padPrev = {};
  function pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : []; const gp = [...pads].find(Boolean); if (!gp || !S) return;
    const b = i => !!gp.buttons[i]?.pressed, ax = gp.axes || [];
    const now = { l: b(14) || ax[0] < -.6, r: b(15) || ax[0] > .6, u: b(12) || ax[1] < -.6, d: b(13) || ax[1] > .6, a: b(0), b: b(1), x: b(2), y: b(3), s: b(9) };
    const hit = k => now[k] && !padPrev[k];
    if (!modal) {
      if (hit('l')) moveCursor(-1, 0); if (hit('r')) moveCursor(1, 0); if (hit('u')) moveCursor(0, -1); if (hit('d')) moveCursor(0, 1);
      if (hit('a')) confirmCursor(); if (hit('b')) cancelHeld(); if (hit('x')) undo(); if (hit('y')) showHint();
    }
    if (hit('s')) { if (modal) closeModal(); else EMBED ? send('hk:esc') : openPause(); }
    padPrev = now;
  }

  // ---------- 창 ----------
  function closeModal(silent) {
    if (!modal) return; const m = modal; modal = null; m.el.remove();
    if (m.kind === 'pause') send('hk:resumed');
    if (!silent && m.onClose) m.onClose();
    if (!silent) canvas.focus({ preventScroll: true });
  }
  function openModal(kind, title, body, opts = {}) {
    closeModal(true);
    const ov = document.createElement('div'); ov.className = 'overlay';
    ov.innerHTML = `<div class="card ${opts.wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${title}"><h2>${title}</h2>${opts.noClose ? '' : '<button class="x" aria-label="닫기">×</button>'}<div class="body">${body}</div></div>`;
    $('modal-root').append(ov); modal = { kind, el: ov, onClose: opts.onClose };
    ov.querySelector('.x')?.addEventListener('click', () => closeModal());
    ov.addEventListener('pointerdown', e => { if (e.target === ov && !opts.noClose && kind !== 'result') closeModal(); });
    cancelHeld();
    setTimeout(() => (ov.querySelector('[data-focus]') || ov.querySelector('button.btn'))?.focus({ preventScroll: true }), 30);
    return ov;
  }
  const on = (root, sel, fn) => root.querySelector(sel)?.addEventListener('click', () => { sfx.click(); fn(); });

  function openHelp(back) {
    const el = openModal('help', '게임 방법', `
      <div class="step"><i>1</i><span>흰 테를 두른 핀(맨 위 줄)을 끌어서 빈 구멍에 놓아요.</span></div>
      <div class="step"><i>2</i><span>모든 줄이 서로 엇갈리지 않게 옮기면 한꺼번에 빠져요.</span></div>
      <div class="step"><i class="tw">↻</i><span>덮인 줄을 억지로 빼면 위 줄과 <b>꼬여요</b>. 꼬인 줄은 빠지지 않아요 — 핀을 반대쪽으로 되돌리면 풀려요.</span></div>
      <div class="step"><i>3</i><span>막혔다면 힌트를 보거나 되돌리기를 눌러요.</span></div>
      <p class="note">키보드: 방향키로 고르고, Enter로 집기 · 놓기, U 되돌리기, H 힌트, Esc 멈춤<br>게임패드: 십자키 + A, B 취소, X 되돌리기, Y 힌트</p>
      <button class="btn teal" data-focus>시작하기!</button>`, { onClose: back });
    on(el, '.btn', () => closeModal());
  }
  function threadSwatch(id) {
    const c = '#d98a7a', css = {
      cotton: `background:repeating-linear-gradient(90deg,${c} 0 5px,#b9695d 5px 7px)`, candy: 'background:repeating-linear-gradient(90deg,#d9604f 0 6px,#fff6ec 6px 12px)',
      ribbon: `background:linear-gradient(#f0b5aa,${c} 45%,#a8584b)`, neon: 'background:#e8fff4;box-shadow:0 0 8px 2px #4dffb4', gold: 'background:linear-gradient(90deg,#fff0a0,#d9a232,#fff0a0)',
      rainbow: 'background:linear-gradient(90deg,#ef6b6b,#f3b04b,#f2e060,#7cc87c,#62a9e0,#a07ad8)',
    }[id];
    return `<div class="sw" style="background:repeating-linear-gradient(0deg,#f4ead3 0 3px,#efe3c6 3px 6px);display:grid;place-items:center"><i style="display:block;width:82%;height:11px;border-radius:99px;${css}"></i></div>`;
  }
  function openSettings(back) {
    const body = () => `
      <div class="setting"><div><b>부드러운 소리</b><small>플레이하는 동안 작은 음이 나요.</small></div><button class="toggle" id="t-sound" aria-pressed="${rec.settings.sound}">${rec.settings.sound ? '켜짐' : '꺼짐'}</button></div>
      <div class="setting"><div><b>잔잔한 움직임</b><small>꾸미는 움직임을 줄여요.</small></div><button class="toggle" id="t-gentle" aria-pressed="${rec.settings.gentle}">${rec.settings.gentle ? '켜짐' : '꺼짐'}</button></div>
      <div class="section">실 · 수틀</div>
      <div class="tiles">${THREADS.map(t => `<button class="tile" data-thread="${t.id}" aria-pressed="${rec.settings.thread === t.id}" ${threadOk(t) ? '' : 'disabled'}>${threadSwatch(t.id)}<span>${t.name}</span>${threadOk(t) ? '' : `<small>별 ${t.need}개로 열림</small>`}</button>`).join('')}</div>
      <div class="tiles">${LOOMS.map(l => `<button class="tile" data-loom="${l.id}" aria-pressed="${rec.settings.loom === l.id}" ${loomOk(l) ? '' : 'disabled'}><div class="sw" style="background:${l.id === 'garden' ? 'linear-gradient(135deg,#eceadf,#cfd3c2)' : 'linear-gradient(135deg,#e6b97f,#cf9559)'}"></div><span>${l.name}</span>${loomOk(l) ? '' : `<small>별 ${l.need}개로 열림</small>`}</button>`).join('')}</div>
      <button class="btn teal" id="s-back" data-focus>퍼즐로 돌아가기</button>
      <button class="btn" id="s-help">게임 방법</button>
      <p class="note">${saveOk ? '진행은 이 기기에 저장돼요.' : '저장소를 쓸 수 없어 이번 창에서만 기록해요.'}</p>`;
    const wire = el => {
      on(el, '#t-sound', () => { rec.settings.sound = !rec.settings.sound; save(); re(); });
      on(el, '#t-gentle', () => { rec.settings.gentle = !rec.settings.gentle; save(); re(); });
      el.querySelectorAll('[data-thread]').forEach(b => b.addEventListener('click', () => { rec.settings.thread = b.dataset.thread; save(); sfx.click(); re(); }));
      el.querySelectorAll('[data-loom]').forEach(b => b.addEventListener('click', () => { rec.settings.loom = b.dataset.loom; save(); bgCache = null; sfx.click(); re(); }));
      on(el, '#s-back', () => closeModal()); on(el, '#s-help', () => openHelp(() => openSettings(back)));
    };
    const re = () => { const st = modal.el.querySelector('.body').scrollTop, el = openModal('settings', '설정', body(), { onClose: back }); wire(el); el.querySelector('.body').scrollTop = st; };
    wire(openModal('settings', '설정', body(), { onClose: back }));
  }
  function openPause() {
    if (!S) return;
    const el = openModal('pause', '잠깐 쉬어 가요', `
      <button class="btn teal" data-focus>이어 하기</button>
      <div class="row"><button class="btn" id="p-map">퍼즐 지도</button><button class="btn" id="p-set">설정</button></div>
      <button class="btn" id="p-endless">끝없는 실</button><button class="btn" id="p-help">게임 방법</button>`);
    send('hk:paused');
    on(el, '[data-focus]', () => closeModal());
    on(el, '#p-map', () => openTrail('map', openPause)); on(el, '#p-set', () => openSettings(openPause));
    on(el, '#p-endless', () => openTrail('endless', openPause)); on(el, '#p-help', () => openHelp(openPause));
  }

  // ---------- 지도(탭: 지도 · 오늘 · 실 · 끝없는 실) ----------
  function openTrail(tab, back) {
    const cleared = rec.stars.filter(Boolean).length, nextIdx = rec.stars.findIndex(s => !s) < 0 ? 39 : rec.stars.findIndex(s => !s);
    const ch = Math.floor(nextIdx / 8), inCh = rec.stars.slice(ch * 8, ch * 8 + 8).filter(Boolean).length;
    const tabs = [['map', '지도'], ['daily', '오늘'], ['threads', '실'], ['endless', '끝없는 실']];
    const render = t => {
      if (t === 'map') {
        const pos = i => ({ x: 50 + 30 * Math.sin(i * .85), y: 56 + i * 86 }), hh = 56 + 39 * 86 + 70;
        const pts = Array.from({ length: 40 }, (_, i) => pos(i));
        const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ');
        const nodes = pts.map((p, i) => {
          const s = rec.stars[i], cls = s ? '' : i === nextIdx ? 'next' : '';
          return `${i % 8 === 0 ? `<div class="node-label" style="left:50%;top:${p.y - 62}px;font-size:12px;color:#7a5632;font-weight:900">${i / 8 + 1}장 · ${CHAPTERS[i / 8]}</div>` : ''}
            <button class="node ${cls}" data-lv="${i}" style="left:${p.x}%;top:${p.y}px" aria-label="퍼즐 ${i + 1}, 별 ${s}개">${i === nextIdx ? '<span class="tag">시작</span>' : ''}${s ? '<span class="ck">✓</span>' : ''}${pad(i + 1)}<small>${'★'.repeat(s)}${'☆'.repeat(3 - s)}</small></button>
            <div class="node-label" style="left:${p.x}%;top:${p.y}px">${s ? '완료' : i === nextIdx ? '다음' : '아직'}</div>`;
        }).join('');
        return `<div class="map" id="map"><div style="position:relative;height:${hh}px"><svg width="100%" height="${hh}" viewBox="0 0 100 ${hh}" preserveAspectRatio="none"><path d="${path}" fill="none" stroke="#c9a566" stroke-width="5" stroke-dasharray="2 9" stroke-linecap="round" vector-effect="non-scaling-stroke" opacity=".9"/></svg>${nodes}</div></div>
          <button class="btn teal" id="go-next" data-focus>▶ 이어 하기 · ${pad(nextIdx + 1)}</button>`;
      }
      if (t === 'daily') {
        const today = kstDate(), d = rec.daily, doneToday = d.date === today && d.stars > 0;
        return `<div class="stats2"><div><b>${today.slice(5).replace('-', '/')}</b><small>오늘</small></div><div><b>${d.last === today || d.last === kstDate(-1) ? d.streak : 0}</b><small>연속 일수</small></div><div><b>${doneToday ? '★'.repeat(d.stars) : '—'}</b><small>오늘 결과</small></div></div>
          <p class="praise">${doneToday ? `이동 ${d.moves}번으로 풀었어요. 다시 도전해 더 좋은 기록을 남겨 보세요.` : '하루에 하나, 모두에게 같은 퍼즐이 나와요.'}</p>
          <button class="btn teal" id="go-daily" data-focus>▶ ${doneToday ? '다시 도전' : '오늘의 퍼즐 시작'}</button>`;
      }
      if (t === 'threads') {
        const nx = THREADS.find(x => !threadOk(x));
        return `<div class="tiles">${THREADS.map(x => `<button class="tile" data-thread="${x.id}" aria-pressed="${rec.settings.thread === x.id}" ${threadOk(x) ? '' : 'disabled'}>${threadSwatch(x.id)}<span>${x.name}</span>${threadOk(x) ? '' : `<small>별 ${x.need}개로 열림</small>`}</button>`).join('')}</div>
          <p class="note">${nx ? `별 ${nx.need - starTotal()}개를 더 모으면 「${nx.name}」이 열려요.` : '모든 실을 모았어요!'} 실은 모양만 바뀌고 풀이는 같아요.</p>`;
      }
      const n = rec.endless.cleared + 1, sp = endlessSpec(n);
      return `<div class="stats2"><div><b>${rec.endless.cleared}</b><small>푼 퍼즐</small></div><div><b>${sp[2]}</b><small>다음 줄 수</small></div><div><b>${Math.min(ENDLESS_CAP, rec.endless.cleared) * ENDLESS_POINTS}</b><small>순위 점수</small></div></div>
        <p class="praise">풀 때마다 새 퍼즐이 만들어지고 점점 어려워져요.</p><button class="btn teal" id="go-endless" data-focus>▶ ${n}번째 퍼즐 시작</button>`;
    };
    const el = openModal('trail', '실타래 길', `
      <div class="tabs" style="padding:0">${tabs.map(([k, v]) => `<button data-tab="${k}" aria-selected="${k === tab}">${v}</button>`).join('')}</div>
      <div class="mapmeta"><span>${cleared} / 40 완료</span><span>${CHAPTERS[ch]} · ${inCh} / 8 완료</span><span>★ ${starTotal()} / 120</span></div>
      <div class="bar"><i style="width:${cleared / 40 * 100}%"></i></div><div id="tab-body" style="display:flex;flex-direction:column;gap:10px"></div>`, { wide: true, onClose: back });
    const paint = t => {
      const box = el.querySelector('#tab-body'); box.innerHTML = render(t);
      el.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
      box.querySelectorAll('[data-lv]').forEach(b => b.addEventListener('click', () => { sfx.click(); begin(mapLevel(+b.dataset.lv)); }));
      on(box, '#go-next', () => begin(mapLevel(nextIdx))); on(box, '#go-daily', startDaily); on(box, '#go-endless', startEndless);
      box.querySelectorAll('[data-thread]').forEach(b => b.addEventListener('click', () => { rec.settings.thread = b.dataset.thread; save(); sfx.click(); paint('threads'); }));
      if (t === 'map') { const m = box.querySelector('#map'); m.scrollTop = Math.max(0, 56 + nextIdx * 86 - m.clientHeight / 2); }
    };
    el.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { sfx.click(); paint(b.dataset.tab); }));
    paint(tab);
  }
  function startDaily() {
    const today = kstDate(); setCoach('오늘의 실을 엮는 중…'); closeModal(true);
    setTimeout(() => { const lv = genLevel(hashStr('looseends' + today) || 5, [12, 4, 6, 4, 6], '오늘의 퍼즐', 'daily', 0, (hashStr('looseends' + today) % 3) !== 0); lv.date = today; begin(lv); }, 20);
  }
  function startEndless() {
    const n = rec.endless.cleared + 1; setCoach('새 실을 엮는 중…'); closeModal(true);
    setTimeout(() => begin(genLevel(rec.endless.seed * 1009 + n * 31, endlessSpec(n), `끝없는 실 ${n}`, 'endless', n, n >= 9 && n % 2 === 1)), 20);
  }

  // ---------- 끝 ----------
  function win() {
    S.won = true; const over = Math.max(0, S.moves - S.target), stars = over === 0 ? 3 : over <= 2 ? 2 : 1;
    const levelScore = 1000 + stars * 500 + Math.max(0, 300 - over * 100), starsBefore = starTotal();
    const campaignCleared = S.kind === 'map' && !rec.stars[S.idx] && rec.stars.every((star, index) => index === S.idx || star > 0);
    if (S.kind === 'map') {
      const i = S.idx; rec.stars[i] = Math.max(rec.stars[i], stars); rec.moves[i] = rec.moves[i] ? Math.min(rec.moves[i], S.moves) : S.moves; rec.score[i] = Math.max(rec.score[i], levelScore);
      rec.cur = Math.min(39, i + 1);
    } else if (S.kind === 'daily') {
      const d = rec.daily, today = S.date || kstDate();
      if (d.date !== today || stars > d.stars) { d.stars = d.date === today ? Math.max(d.stars, stars) : stars; d.moves = d.date === today && d.moves ? Math.min(d.moves, S.moves) : S.moves; }
      if (d.last !== today) { d.streak = d.last === kstDate(-1) ? d.streak + 1 : 1; d.last = today; }
      d.date = today;
    } else { rec.endless.cleared++; }
    save(); sfx.win(); hud();
    send(campaignCleared ? 'hk:score' : 'hk:live', { score: total() });
    const newly = THREADS.concat(LOOMS).filter(x => x.need > starsBefore && x.need <= starTotal());
    const nx = THREADS.find(x => !threadOk(x));
    const praise = S.moves < S.target ? '꼬임 지름길을 찾았어요!' : stars === 3 ? '한 수도 낭비 없이!' : stars === 2 ? '아주 좋아요!' : '해냈어요!';
    const hasNext = S.kind === 'map' ? S.idx < 39 : S.kind === 'endless';
    const el = openModal('result', stars === 3 ? '완벽해요!' : stars === 2 ? '잘했어요!' : '풀었어요!', `
      <div class="result-top"><div style="flex:1"><div class="stars3" aria-label="별 ${stars}개">${[1, 2, 3].map(k => `<span class="${k <= stars ? 'on' : ''}">★</span>`).join('')}</div><p class="praise">${praise}</p></div>
        <div class="right-col"><button class="btn teal" id="r-next" data-focus>▶ ${hasNext ? '다음 퍼즐' : '지도 보기'}</button><button class="btn" id="r-again">↻ 다시 하기</button></div></div>
      <div class="stats2"><div><b>${S.moves}</b><small>이동</small></div><div><b>${S.target}</b><small>★3 목표</small></div><div><b>${levelScore}</b><small>점수</small></div></div>
      <p class="note">${newly.length ? `새로 열렸어요: ${newly.map(x => x.name).join(', ')}!` : nx ? `별 ${nx.need - starTotal()}개를 더 모으면 「${nx.name}」이 열려요.` : '모든 실을 모았어요!'}</p>`, { noClose: true });
    on(el, '#r-next', () => { if (S.kind === 'map' && S.idx < 39) begin(mapLevel(S.idx + 1)); else if (S.kind === 'endless') startEndless(); else { closeModal(true); openTrail('map', () => {}); } });
    on(el, '#r-again', () => { if (S.kind === 'map') begin(mapLevel(S.idx)); else begin(S.initialLevel); });
  }

  // ---------- 연결 ----------
  const origBegin = begin;
  begin = level => { origBegin(level); S.initialLevel = { ...level, ropes: level.ropes.map(r => ({ ...r })), tw: { ...(level.tw || {}) } }; S.initial = S.initialLevel.ropes; };
  $('btn-undo').onclick = () => undo(); $('btn-restart').onclick = () => restart(); $('btn-hint').onclick = () => showHint();
  $('btn-help').onclick = () => { sfx.click(); openHelp(); }; $('btn-settings').onclick = () => { sfx.click(); openSettings(); };
  $('btn-map').onclick = () => { sfx.click(); openTrail('map'); }; $('btn-pause').onclick = () => { sfx.click(); EMBED ? send('hk:esc') : openPause(); };
  window.addEventListener('message', e => {
    if (!EMBED || e.source !== parent || e.origin !== location.origin || !e.data) return;
    if (e.data.type === 'hk:pause') { if (!modal) openPause(); }
    if (e.data.type === 'hk:resume') { if (modal && modal.kind === 'pause') closeModal(); }
    if (e.data.type === 'hk:restart') { if (S) { closeModal(true); restart(); } }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && S && !modal && !S.busy) openPause(); });
  window.addEventListener('resize', resize);
  new ResizeObserver(resize).observe(canvas);
  document.addEventListener('gesturestart', e => e.preventDefault());

  resize();
  begin(mapLevel(rec.stars.every(Boolean) ? 39 : Math.min(39, Math.max(0, rec.stars.findIndex(s => !s)))));
  send('hk:ready'); requestAnimationFrame(frame); canvas.focus({ preventScroll: true });
  window.__looseends = { get state() { return S; }, rec, Rules, mapLevel, begin, doMove, undo, showHint, startDaily, startEndless, total, win, geo: () => geo, holeXY };
})();
