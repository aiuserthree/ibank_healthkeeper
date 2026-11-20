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
    '동그라미 친 핀을 빈 동그라미로 끌어 놓으세요.', '어느 줄이 위에 걸쳐 있는지 보세요.', '다른 줄에 덮인 줄은 못 움직여요. 위에 있는 줄부터!',
    '길을 터 주면 아래 줄이 풀려요.', '핀을 어디에 놓느냐에 따라 줄이 서로 비켜요.', '빈 구멍은 많을수록 좋아요.',
    '한 번 옮긴 줄은 맨 위로 올라가요.', '목표 수에 맞추면 별 세 개!', '막히면 힌트를 눌러 보세요.', '되돌리기는 얼마든지 괜찮아요.',
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
  function genLevel(seed, spec, name, kind, idx) {
    const [ring, inner, ropes, min, max] = spec;
    for (let k = 0; k < 8; k++) {
      const p = Rules.generate(seed + k * 7919, { ring, inner, ropes, minMoves: Math.max(1, min - (k > 4 ? 1 : 0)), maxMoves: max + (k > 5 ? 1 : 0), tries: 300, nodes: 120000 });
      if (p) return { kind, idx, name, holes: p.holes, ropes: p.ropes, target: p.target };
    }
    return mapLevel(Math.min(39, 10 + (seed % 20)));
  }
  const endlessSpec = n => [[10, 0, 4, 2, 4], [12, 0, 5, 3, 5], [12, 4, 6, 4, 6], [14, 4, 7, 5, 7], [14, 6, 8, 6, 8]][Math.min(4, Math.floor((n - 1) / 4))];
  const hashStr = s => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

  function begin(level) {
    closeModal(true);
    S = { ...level, ropes: level.ropes.map(r => ({ ...r })), moves: 0, hist: [], held: null, sel: null, cursor: 0, kb: false, hint: null, anim: [], busy: false, won: false, shake: null, flash: null, mv: new Set(), tip: '' };
    S.tip = level.kind === 'map' ? (TIPS[level.idx] || '맨 위 줄의 핀을 빈 구멍으로 옮기세요.') : level.kind === 'daily' ? '오늘의 퍼즐이에요. 차분히 풀어 보세요.' : '끝없이 이어지는 퍼즐이에요.';
    S.cursor = S.ropes.length ? S.ropes[S.ropes.length - 1].a : 0;
    particles = []; recalc(); setCoach(S.tip); hud();
    if (level.kind === 'map') { rec.cur = level.idx; save(); }
    if (level.kind === 'map' && level.idx === 0 && rec.stars[0] === 0) showHint(true);
    send('hk:resumed'); send('hk:start'); send('hk:live', { score: total() });
  }
  const restart = () => { if (!S) return; sfx.click(); begin(S.kind === 'map' ? mapLevel(S.idx) : S.initialLevel); };

  function recalc() {
    const m = Rules.crossMatrix(S.holes, S.ropes); S.cm = m;
    S.mv = new Set(); S.ropes.forEach((r, i) => { if (Rules.movable(S.holes, S.ropes, i, m)) S.mv.add(r.id); });
  }
  const ropeIdx = id => S.ropes.findIndex(r => r.id === id);
  const occupiedSet = () => Rules.occupied(S.ropes);

  // ---------- 좌표 ----------
  function resize() {
    const r = canvas.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height); DPR = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    const narrow = matchMedia('(max-width: 640px)').matches;
    const short = H <= 430 && !narrow, top = narrow ? 70 : short ? 54 : 80, bot = narrow ? 156 : short ? 58 : 76;
    const availH = H - top - bot;
    geo = { cx: W / 2, cy: top + availH / 2, R: Math.max(60, Math.min(W * (narrow ? .47 : .4), availH / 2 * .99)) };
    bgCache = null;
  }
  const holeXY = i => { const h = S.holes[i]; return { x: geo.cx + h.x * geo.R * .88, y: geo.cy + h.y * geo.R * .88 }; };
  const endPos = (rope, end) => (S.held && S.held.id === rope.id && S.held.end === end) ? { x: S.held.x, y: S.held.y } : holeXY(rope[end]);
  const pegR = () => geo.R * .05;
  const toLocal = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  // ---------- 그리기 ----------
  const mix = (hex, to, t) => {
    const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), a = p(hex), b = p(to);
    return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
  };
  const shade = (h, t) => t >= 0 ? mix(h, '#ffffff', t) : mix(h, '#000000', -t);

  function buildBg() {
    const c = document.createElement('canvas'); c.width = Math.round(W * DPR); c.height = Math.round(H * DPR);
    const g = c.getContext('2d'); g.scale(DPR, DPR);
    const garden = rec.settings.loom === 'garden', rand = Rules.rng(garden ? 99 : 7);
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
    g.strokeStyle = 'rgba(160,125,80,.22)'; g.lineWidth = 1;
    for (let k = -R; k < R; k += 4) { g.beginPath(); g.moveTo(cx + k, cy - R); g.lineTo(cx + k, cy + R); g.stroke(); g.beginPath(); g.moveTo(cx - R, cy + k); g.lineTo(cx + R, cy + k); g.stroke(); }
    const ig = g.createRadialGradient(cx, cy, R * .6, cx, cy, R * .77); ig.addColorStop(0, 'rgba(90,55,20,0)'); ig.addColorStop(1, 'rgba(90,55,20,.28)');
    g.fillStyle = ig; g.fillRect(cx - R, cy - R, R * 2, R * 2); g.restore();
    bgCache = c; bgKey = rec.settings.loom + W + 'x' + H;
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

  function ropeBody(A, B, color, style, w) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const line = () => { ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); };
    if (style === 'candy') {
      ctx.strokeStyle = '#fff6ec'; ctx.lineWidth = w; line(); ctx.stroke();
      ctx.strokeStyle = color; ctx.setLineDash([w * 1.1, w * 1.1]); line(); ctx.stroke(); ctx.setLineDash([]);
    } else if (style === 'ribbon') {
      ctx.strokeStyle = shade(color, -.28); ctx.lineWidth = w * 2.1; line(); ctx.stroke();
      ctx.strokeStyle = color; ctx.lineWidth = w * 1.6; line(); ctx.stroke();
      ctx.strokeStyle = shade(color, .5); ctx.lineWidth = w * .35; line(); ctx.stroke();
    } else if (style === 'neon') {
      ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = w * 3; ctx.strokeStyle = shade(color, .15); ctx.lineWidth = w * .95; line(); ctx.stroke(); ctx.restore();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = w * .3; line(); ctx.stroke();
    } else if (style === 'gold') {
      const g = ctx.createLinearGradient(A.x, A.y, B.x, B.y); g.addColorStop(0, '#fff0a0'); g.addColorStop(.5, '#d9a232'); g.addColorStop(1, '#fff0a0');
      ctx.strokeStyle = '#a97a1b'; ctx.lineWidth = w * 1.25; line(); ctx.stroke();
      ctx.strokeStyle = g; ctx.lineWidth = w; line(); ctx.stroke();
      ctx.strokeStyle = 'rgba(120,80,10,.4)'; ctx.lineWidth = w * .7; ctx.setLineDash([1.5, 3.5]); line(); ctx.stroke(); ctx.setLineDash([]);
    } else if (style === 'rainbow') {
      const g = ctx.createLinearGradient(A.x, A.y, B.x, B.y);
      ['#ef6b6b', '#f3b04b', '#f2e060', '#7cc87c', '#62a9e0', '#a07ad8'].forEach((c, i) => g.addColorStop(i / 5, c));
      ctx.strokeStyle = 'rgba(70,40,20,.35)'; ctx.lineWidth = w * 1.2; line(); ctx.stroke();
      ctx.strokeStyle = g; ctx.lineWidth = w; line(); ctx.stroke();
    } else {
      ctx.strokeStyle = shade(color, -.22); ctx.lineWidth = w * 1.15; line(); ctx.stroke();
      ctx.strokeStyle = color; ctx.lineWidth = w * .92; line(); ctx.stroke();
      ctx.strokeStyle = shade(color, -.3); ctx.globalAlpha *= .55; ctx.lineWidth = w * .9; ctx.setLineDash([1.6, 3.2]); line(); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha /= .55;
      ctx.strokeStyle = shade(color, .45); ctx.lineWidth = w * .22; line(); ctx.stroke();
    }
  }
  function drawRope(rope, opt = {}) {
    const A = endPos(rope, 'a'), B = endPos(rope, 'b'), color = COLORS[rope.id % 8], w = geo.R * .036, off = opt.off || { x: 0, y: 0 };
    ctx.save(); ctx.globalAlpha = opt.alpha == null ? 1 : opt.alpha; ctx.translate(off.x, off.y);
    ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(55,30,8,.3)'; ctx.lineWidth = w + 2.5; ctx.beginPath(); ctx.moveTo(A.x + 1.5, A.y + 3); ctx.lineTo(B.x + 1.5, B.y + 3); ctx.stroke();
    ropeBody(A, B, color, rec.settings.thread, w);
    if (opt.flash) { ctx.strokeStyle = `rgba(255,255,255,${opt.flash})`; ctx.lineWidth = w * 1.5; ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke(); }
    for (const [P, end] of [[A, 'a'], [B, 'b']]) {
      let px = P.x, py = P.y;
      if (opt.shake && opt.shake.end === end) px += opt.shake.dx;
      const r = pegR(), held = S.held && S.held.id === rope.id && S.held.end === end, mvOk = S.mv.has(rope.id) && !opt.gone;
      if (held) { ctx.fillStyle = 'rgba(40,20,5,.28)'; circle(px + 3, py + 7, r * 1.05); ctx.fill(); py -= 4; }
      const g = ctx.createRadialGradient(px - r * .3, py - r * .35, r * .1, px, py, r * 1.1); g.addColorStop(0, shade(color, .45)); g.addColorStop(1, shade(color, -.28));
      ctx.fillStyle = g; circle(px, py, r * (held ? 1.2 : 1)); ctx.fill();
      ctx.strokeStyle = mvOk ? 'rgba(255,255,255,.95)' : shade(color, -.45); ctx.lineWidth = mvOk ? 2.2 : 1.5; ctx.stroke();
      symbol(px, py, r * .5, rope.id);
    }
    ctx.restore();
  }

  function drawHoles(now) {
    const occ = occupiedSet(), r = pegR();
    for (let i = 0; i < S.holes.length; i++) {
      const p = holeXY(i), g = ctx.createRadialGradient(p.x, p.y - r * .3, r * .2, p.x, p.y, r * 1.15);
      g.addColorStop(0, '#2c2118'); g.addColorStop(1, '#5a4430');
      ctx.fillStyle = g; circle(p.x, p.y, r * (occ.has(i) ? .95 : 1.1)); ctx.fill();
      ctx.strokeStyle = 'rgba(255,240,205,.55)'; ctx.lineWidth = 1.5; circle(p.x, p.y + .8, r * (occ.has(i) ? .95 : 1.1) + .8); ctx.stroke();
    }
    // 집어 든 핀 / 선택 — 놓을 수 있는 빈 구멍 안내
    const picked = S.held || S.sel;
    if (picked) {
      const pulse = gentle() ? .8 : .55 + Math.sin(now / 230) * .25;
      for (let i = 0; i < S.holes.length; i++) if (!occ.has(i)) {
        const p = holeXY(i); ctx.strokeStyle = `rgba(255,255,255,${pulse})`; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); circle(p.x, p.y, r * 1.9); ctx.stroke(); ctx.setLineDash([]);
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
    if (!bgCache || bgKey !== rec.settings.loom + W + 'x' + H) buildBg();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, W, H); ctx.drawImage(bgCache, 0, 0, W, H);
    drawHoles(now);
    const flashT = S.flash ? 1 - (now - S.flash.t0) / 900 : 0;
    const shakeT = S.shake ? (now - S.shake.t0) / 350 : 1;
    if (S.flash && flashT <= 0) S.flash = null; if (S.shake && shakeT >= 1) S.shake = null;
    for (const rope of S.ropes) {
      const opt = {};
      if (S.flash && S.flash.ids.includes(rope.id)) opt.flash = Math.max(0, Math.sin(flashT * Math.PI * 3)) * .6;
      if (S.shake && S.shake.id === rope.id) opt.shake = { end: S.shake.end, dx: Math.sin(shakeT * Math.PI * 6) * (1 - shakeT) * 6 };
      drawRope(rope, opt);
    }
    // 빠져나가는 줄
    S.anim = S.anim.filter(a => {
      const t = (now - a.t0) / a.dur; if (t >= 1) return false;
      const e = t * t * (3 - 2 * t), mx = (holeXY(a.rope.a).x + holeXY(a.rope.b).x) / 2 - geo.cx, my = (holeXY(a.rope.a).y + holeXY(a.rope.b).y) / 2 - geo.cy;
      const l = Math.hypot(mx, my) || 1, dx = mx / l, dy = my / l, dist = geo.R * (gentle() ? .12 : .55) * e;
      drawRope(a.rope, { alpha: 1 - e, off: { x: dx * dist, y: dy * dist - geo.R * .1 * e }, gone: true }); return true;
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
    $('ropes-dots').innerHTML = S.ropes.map(r => `<i style="background:${COLORS[r.id % 8]}"></i>`).join('');
    $('ropes-text').textContent = `${S.ropes.length}줄 남음`;
  }
  function setCoach(text, ms = 0) {
    clearTimeout(coachTimer); $('coach').textContent = text || '';
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
  function warn(id, end) {
    sfx.warn(); const i = ropeIdx(id), cover = Rules.coveredBy(S.holes, S.ropes, i, S.cm).map(j => S.ropes[j].id);
    S.shake = { id, end, t0: performance.now() }; S.flash = { ids: cover, t0: performance.now() };
    setCoach('이 줄은 다른 줄에 덮여 있어요. 위에 있는 줄부터 옮겨 보세요.', 2600);
  }
  function doMove(id, end, hole) {
    const i = ropeIdx(id); if (i < 0 || S.busy || S.won) return false;
    const occ = occupiedSet(); if (occ.has(hole) || !S.mv.has(id)) return false;
    S.hist.push({ ropes: S.ropes.map(r => ({ ...r })), moves: S.moves }); S.hist.length > 200 && S.hist.shift();
    const moved = Rules.applyMove(S.ropes, i, end, hole), { ropes: after, gone } = Rules.settle(S.holes, moved);
    S.moves++; S.hint = null; S.sel = null; S.held = null;
    if (!gone.length) { S.ropes = after; sfx.drop(); recalc(); hud(); setCoach(S.tip); return true; }
    S.ropes = after; sfx.free(); S.busy = true;
    const now = performance.now();
    for (const r of gone) { S.anim.push({ rope: r, t0: now, dur: gentle() ? 260 : 560 }); sparkle(holeXY(r.a), COLORS[r.id % 8]); sparkle(holeXY(r.b), COLORS[r.id % 8]); }
    recalc(); hud(); setCoach(S.tip);
    const cleared = S;
    setTimeout(() => { if (S !== cleared) return; S.busy = false; win(); }, gentle() ? 300 : 620);
    return true;
  }
  function undo() {
    if (!S || !S.hist.length || S.busy || S.won) return;
    const h = S.hist.pop(); S.ropes = h.ropes; S.moves = h.moves; S.hint = null; S.held = null; S.sel = null; S.anim = [];
    sfx.click(); recalc(); hud(); setCoach(S.tip);
  }

  // ---------- 힌트 ----------
  function showHint(silent) {
    if (!S || S.busy || S.won) return;
    let mv = null;
    const path = Rules.solve(S.holes, S.ropes, { nodes: 150000, depth: 14 });
    if (path && path.length) mv = path[0];
    else {
      let bestScore = 1e9; const occ = occupiedSet(); void occ;
      for (const m of Rules.moves(S.holes, S.ropes)) {
        const after = Rules.settle(S.holes, Rules.applyMove(S.ropes, m.rope, m.end, m.to)).ropes, cm = Rules.crossMatrix(S.holes, after);
        let c = 0; for (const row of cm) for (const v of row) if (v) c++;
        if (c < bestScore) { bestScore = c; mv = { id: S.ropes[m.rope].id, end: m.end, to: m.to }; }
      }
    }
    if (!mv) return;
    S.hint = mv; S.sel = null; if (!silent) sfx.click();
    setCoach(silent ? S.tip : '동그라미 친 핀을 점선 끝의 빈 구멍으로 옮겨 보세요.', silent ? 0 : 4000);
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
    if (!S.mv.has(peg.id)) { warn(peg.id, peg.end); return; }
    pointerId = e.pointerId; downAt = p; S.held = { id: peg.id, end: peg.end, x: p.x, y: p.y, hover: null, from: S.ropes[ropeIdx(peg.id)][peg.end] };
    sfx.pick(); canvas.setPointerCapture(e.pointerId); e.preventDefault();
  });
  canvas.addEventListener('pointermove', e => {
    if (!S || !S.held || e.pointerId !== pointerId) return;
    const p = toLocal(e); S.held.x = p.x; S.held.y = p.y; S.held.hover = nearestEmpty(p);
  });
  const release = (e, cancel) => {
    if (!S || !S.held || e.pointerId !== pointerId) return;
    const h = S.held, p = toLocal(e), tap = Math.hypot(p.x - downAt.x, p.y - downAt.y) < 9;
    pointerId = null; S.held = null; try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* 이미 놓임 */ }
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
    if (best != null) { S.cursor = best; if (S.held && S.held.kb) { const p = holeXY(best); S.held.x = p.x; S.held.y = p.y; S.held.hover = occupiedSet().has(best) ? null : best; } sfx.click(); }
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
      if (!S.mv.has(r.id)) { warn(r.id, end); return; }
      const p = holeXY(S.cursor); S.held = { id: r.id, end, x: p.x, y: p.y, hover: null, from: S.cursor, kb: true }; sfx.pick(); return;
    }
  }
  function cancelHeld() { if (S) { S.held = null; S.sel = null; } }
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
      <div class="step"><i>1</i><span>맨 위에 있는 핀을 끌어서 빈 구멍에 놓아요.</span></div>
      <div class="step"><i>2</i><span>모든 줄이 서로 엇갈리지 않게 옮기면 한꺼번에 빠져요.</span></div>
      <div class="step"><i>3</i><span>막혔다면 한 수 되돌리거나 되돌리기를 눌러요.</span></div>
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
    setTimeout(() => { const lv = genLevel(hashStr('looseends' + today) || 5, [12, 4, 6, 4, 6], '오늘의 퍼즐', 'daily', 0); lv.date = today; begin(lv); }, 20);
  }
  function startEndless() {
    const n = rec.endless.cleared + 1; setCoach('새 실을 엮는 중…'); closeModal(true);
    setTimeout(() => begin(genLevel(rec.endless.seed * 1009 + n * 31, endlessSpec(n), `끝없는 실 ${n}`, 'endless', n)), 20);
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
    const praise = stars === 3 ? '한 수도 낭비 없이!' : stars === 2 ? '아주 좋아요!' : '해냈어요!';
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
  begin = level => { origBegin(level); S.initialLevel = { ...level, ropes: level.ropes.map(r => ({ ...r })) }; S.initial = S.initialLevel.ropes; };
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
  window.__looseends = { get state() { return S; }, rec, Rules, mapLevel, begin, doMove, total, win, geo: () => geo, holeXY };
})();
