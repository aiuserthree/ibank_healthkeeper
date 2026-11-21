/* 도토리 새총단 — 화면 · 입력 · 카메라 · 저장. 로컬 Matter.js, 외부 네트워크 · 계정 정보 없음.
   그림: 생성 그림(web/assets/games/acornshot/*.webp)을 받으면 쓰고, 못 받으면 Canvas 그림으로 그대로 돈다. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  if (!window.AcornPhysics) { $('loading-error').hidden = false; return; }
  const win = window, P = win.AcornPhysics, canvas = $('world'), ctx = canvas.getContext('2d'), game = $('game');
  const query = new URLSearchParams(location.search);
  const EMBED = query.get('hk') === '1' && parent !== window;
  const SAVE = 'acornshot.v1';
  const VIEW_WIDTH = 1280, VIEW_HEIGHT = 720, N = P.LEVELS.length;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  let record = { best: Array(N).fill(0), stars: Array(N).fill(0) }, saveAvailable = true;
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE));
    if (saved) for (const k of ['best', 'stars']) record[k] = Array.from({ length: N }, (_, i) => Number.isInteger(saved[k]?.[i]) ? Math.max(0, Math.min(k === 'best' ? P.SCORE_MAX : 3, saved[k][i])) : 0);
  } catch (_) { saveAvailable = false; }

  // ---- Places: six places × eight stages, grouped by each stage's `place`.
  const PLACES = [
    { key: 'forest', name: '도토리 숲', en: 'FOREST' },
    { key: 'valley', name: '이끼 계곡', en: 'VALLEY' },
    { key: 'swamp', name: '안개 늪', en: 'SWAMP' },
    { key: 'snow', name: '눈 덮인 산', en: 'SNOW' },
    { key: 'castle', name: '밤의 성채', en: 'CASTLE' },
    { key: 'summit', name: '달빛 망루', en: 'SUMMIT' },
  ];
  const placeKey = i => { const p = P.LEVELS[i]?.place; return PLACES.some(q => q.key === p) ? p : i < 8 ? 'forest' : 'valley'; };
  const placeIndex = i => PLACES.findIndex(p => p.key === placeKey(i));
  const LISTS = PLACES.map(p => P.LEVELS.map((_, i) => i).filter(i => placeKey(i) === p.key));
  const ORDER = LISTS.flat();
  const cleared = i => record.stars[i] > 0;
  const need = list => Math.min(list.length, Math.ceil(list.length * .75));
  function placeOpen(pi) {
    if (pi <= 0) return true;
    const prev = LISTS[pi - 1];
    if (!prev.length) return placeOpen(pi - 1);
    return prev.filter(cleared).length >= need(prev);
  }
  // A stage opens when the one before it is cleared (the original rule, so every saved
  // unlock stays open); a place's first stage also opens once 6 of the previous place's 8 are cleared.
  function unlocked(i) {
    if (i < 0 || i >= N) return false;
    if (i > 0 && cleared(i - 1)) return true;
    const list = LISTS[placeIndex(i)], k = list.indexOf(i);
    return k > 0 ? cleared(list[k - 1]) : placeOpen(placeIndex(i));
  }
  function lockReason(i) {
    const pi = placeIndex(i), list = LISTS[pi], k = list.indexOf(i);
    if (k > 0) return `${k}단계를 깨면 열려요`;
    const prev = LISTS[pi - 1] || [];
    return `${PLACES[pi - 1]?.name ?? ''} ${need(prev)}단계 깨기 (${prev.filter(cleared).length}/${need(prev)})`;
  }
  const continueStage = () => ORDER.find(i => unlocked(i) && !cleared(i)) ?? ORDER[0];
  const nextStage = i => { const j = ORDER[ORDER.indexOf(i) + 1]; return j != null && unlocked(j) ? j : null; };
  const stageLabel = i => { const pi = placeIndex(i), list = LISTS[pi]; return `${PLACES[pi].name} ${list.indexOf(i) + 1} / ${list.length}`; };

  let sim, levelIndex = 0, screen = 'menu', paused = false, dragging = false;
  let aim = { x: P.SLING.x, y: P.SLING.y }, angle = 27, power = 78;
  let particles = [], texts = [], rings = [], trail = [], prevTrails = [], shake = 0, last = 0, accumulator = 0, renderTime = 0;
  let lastCrashSound = -Infinity, hitStop = 0, chain = 0, chainLabel = null;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let audio, sound = false, keyAim = false;
  let runOpen = false, runBest = 0, lastLive = -1;
  let mapPlace = 0, resultNext = null, pendingResult = null, bonus = null, everPulled = false;
  let turnBroken = 0, taunt = 0, lastPullStep = 0;
  const hurtAt = new WeakMap(), hpSeen = new WeakMap(), squash = new Map();

  // Per-stage playfield and sling (levels.js `width` · `top` · `bottom` · `sling` · `power`).
  const S = () => sim?.sling ?? { ...P.SLING, power: 1 };
  const W = () => sim?.world ?? { width: P.WORLD_WIDTH ?? 1500, top: 0, bottom: P.FLOOR ?? 574 };
  // Terrain lookups are cached per stage (cheap per-frame queries for the preview and particles).
  const NO_TERRAIN = { platforms: [], roof: null, water: [], bridges: [], roofAt: () => null };
  let groundYs = null, terr = NO_TERRAIN;
  const GSTEP = P.GROUND_STEP || 20;
  function loadTerrain() {
    groundYs = typeof P.groundProfile === 'function' ? P.groundProfile(levelIndex) : null;
    terr = typeof P.terrainOf === 'function' ? P.terrainOf(levelIndex) : NO_TERRAIN;
  }
  function groundY(x) {
    if (!groundYs) return P.FLOOR ?? 574;
    const t = Math.max(0, Math.min(W().width, x)) / GSTEP, i = Math.max(0, Math.min(groundYs.length - 2, Math.floor(t)));
    return groundYs[i] + (groundYs[i + 1] - groundYs[i]) * (t - i);
  }
  function surface(x, fromY = -Infinity) {
    let y = groundY(x);
    for (const p of terr.platforms) if (x >= p.x0 && x <= p.x1 && p.y >= fromY && p.y < y) y = p.y;
    return y;
  }
  function solid(x, y) {
    const w = W();
    if (x < 0 || x > w.width || y < w.top || y > groundY(x)) return true;
    const roofY = terr.roofAt(x);
    if (roofY != null && y < roofY) return true;
    return terr.platforms.some(p => x >= p.x0 && x <= p.x1 && y >= p.y && y <= p.y + p.h);
  }

  const send = (type, extras = {}) => { if (EMBED) parent.postMessage({ type, ...extras }, location.origin); };
  function publishLiveScore() {
    const score = Math.max(runBest, sim.state.score);
    if (runOpen && score !== lastLive) { lastLive = score; send('hk:live', { score }); }
  }
  function submitRun() {
    if (!runOpen) return;
    runOpen = false;
    send('hk:score', { score: Math.max(runBest, sim.state.score) });
  }

  // ---- Sound: synthesized only, created after the player turns it on.
  function ensureAudio() {
    if (!sound || paused) return null;
    try {
      audio ||= new (win.AudioContext || win.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      return audio;
    } catch (_) { sound = false; return null; }
  }
  function tone(freq, duration = .12, type = 'sine', volume = .045, end = .55, delay = 0) {
    const a = ensureAudio(); if (!a) return;
    try {
      const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * end, t + duration);
      g.gain.setValueAtTime(volume, t); g.gain.exponentialRampToValueAtTime(.001, t + duration);
      o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + duration);
    } catch (_) { sound = false; }
  }
  let noiseBuffer = null;
  function noise(duration = .2, freq = 900, volume = .05, kind = 'lowpass') {
    const a = ensureAudio(); if (!a) return;
    try {
      if (!noiseBuffer) {
        noiseBuffer = a.createBuffer(1, a.sampleRate * .6, a.sampleRate);
        const d = noiseBuffer.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
      src.buffer = noiseBuffer; f.type = kind; f.frequency.value = freq;
      g.gain.setValueAtTime(volume, a.currentTime); g.gain.exponentialRampToValueAtTime(.001, a.currentTime + duration);
      src.connect(f); f.connect(g); g.connect(a.destination); src.start(); src.stop(a.currentTime + duration);
    } catch (_) { sound = false; }
  }
  const BREAK_SOUND = {
    wood: () => { tone(190, .11, 'triangle', .05); noise(.08, 1400, .035); },
    ice: () => { tone(1500, .09, 'sine', .028, .8); tone(2100, .08, 'sine', .02, .7, .03); noise(.06, 5000, .02, 'highpass'); },
    stone: () => { tone(105, .18, 'triangle', .07, .6); noise(.14, 420, .05); },
    resin: () => { tone(160, .12, 'sawtooth', .03); },
  };

  // ---- Effects
  function burst(x, y, color, count = 12) {
    for (let i = 0; i < count; i++) particles.push({ x, y, vx: (Math.random() - .5) * 7, vy: -Math.random() * 7, life: .7 + Math.random() * .4, max: 1.1, color, size: 3 + Math.random() * 6, rotation: Math.random() * 6 });
  }
  function shock(x, y, radius, color, duration = .36, flat = 1) {
    if (rings.length >= 24) rings.shift();
    rings.push({ x, y, radius, color, duration, life: duration, flat });
  }
  function debris(e, count, force) {
    const amount = reducedMotion.matches ? Math.ceil(count / 3) : count;
    if (particles.length + amount > 280) particles.splice(0, particles.length + amount - 280);
    for (let i = 0; i < amount; i++) {
      const rand = Math.random, large = i < 4;
      particles.push({ x: e.x + (rand() - .5) * Math.min(e.w || 20, 70), y: e.y + (rand() - .5) * Math.min(e.h || 20, 60),
        vx: (rand() - .5) * force + Math.max(-4, Math.min(4, (e.vx || 0) * .35)), vy: -1.5 - rand() * force * .65,
        size: large ? 10 + rand() * 10 : 3 + rand() * 6, life: .55 + rand() * .65, color: e.color,
        material: e.material, rotation: rand() * 6, spin: (rand() - .5) * 15, fragment: true });
    }
  }
  function dust(x, y, count, spread, color) {
    for (let i = 0; i < (reducedMotion.matches ? Math.ceil(count / 3) : count); i++) {
      const side = i % 2 ? 1 : -1;
      particles.push({ x: x + side * Math.random() * 18, y, vx: side * (1 + Math.random() * spread), vy: -Math.random() * 2,
        life: .35 + Math.random() * .45, color: color || (i % 3 ? '#e5c797' : '#fff2cf'), size: 7 + Math.random() * 14, dust: true });
    }
  }
  function droplets(x, y, count, color = '#bfeaf0') {
    for (let i = 0; i < (reducedMotion.matches ? Math.ceil(count / 3) : count); i++) {
      particles.push({ x: x + (Math.random() - .5) * 20, y: y - 2, vx: (Math.random() - .5) * 6, vy: -3 - Math.random() * 6,
        life: .5 + Math.random() * .35, color, size: 2.5 + Math.random() * 3, drop: true });
    }
  }
  // Camera focus after impacts: the place where things are breaking.
  let impact = null;
  function noteImpact(e) {
    if (!sim || sim.state.phase !== 'flight' || e.x == null) return;
    if (impact && renderTime - impact.t < 1.2) { impact.x += (e.x - impact.x) * .35; impact.y += (e.y - impact.y) * .35; impact.t = renderTime; }
    else impact = { x: e.x, y: e.y, t: renderTime };
  }
  function onEvent(e) {
    if (['hit', 'break', 'blast', 'crash', 'splash', 'shatter'].includes(e.type)) noteImpact(e);
    if (e.type === 'hit') {
      shock(e.x, e.y, 68 + e.energy * 2, '#fff6c7', .25);
      debris({ ...e, color: '#fff1bc' }, 12, 9);
      shake = Math.max(shake, Math.min(15, e.energy));
      if (!reducedMotion.matches) hitStop = .046;
      tone(145, .14, 'triangle', .07); noise(.07, 900, .04);
    }
    if (e.type === 'buckling') {
      dust(e.x - 53, e.y + 9, 6, 3); dust(e.x + 53, e.y + 9, 6, 3);
      tone(225, .12, 'triangle', .025);
    }
    if (e.type === 'break') {
      turnBroken++;
      if (e.target) {
        burst(e.x, e.y, e.color, 15); shock(e.x, e.y, 43, '#eed4fc', .26);
        texts.push({ x: e.x, y: e.y - 10, text: '+1,000', life: .95 });
        tone(700, .1, 'sine'); tone(980, .12, 'sine', .03, .5, .05);
      } else {
        debris(e, 15, 13); dust(e.x, e.y, 5, 4);
        if (++chain >= 3) chainLabel = { text: `연쇄 붕괴 ×${chain}`, life: 1.05 };
        (BREAK_SOUND[e.material] || BREAK_SOUND.wood)();
      }
      if (e.sunk) { droplets(e.x, e.y, 10); }
      shake = Math.max(shake, e.target ? 7 : 4);
    }
    if (e.type === 'blast') {
      const barrel = e.source === 'barrel';
      shock(e.x, e.y, barrel ? 140 : 165, barrel ? '#ffc061' : '#ffdb79', .46); shock(e.x, e.y, 96, '#fff3bb', .27);
      dust(e.x, e.y, 16, 8, barrel ? '#d9a868' : null); debris({ ...e, color: barrel ? '#c8803a' : '#f7bb4a' }, 26, 16); shake = 17;
      if (!reducedMotion.matches) hitStop = .055;
      tone(90, .4, 'sawtooth'); noise(.45, 600, .08);
    }
    if (e.type === 'crash') {
      const big = e.energy >= 18;
      debris(e, big ? 12 : 6, e.energy * .54); dust(e.x, e.y + 8, big ? 14 : 6, e.energy * .27);
      if (big) shock(e.x, e.y + 8, 40 + e.energy * 2.1, '#fff1cf', .32, .36);
      shake = Math.max(shake, Math.min(17, e.energy * .48));
      if (sim.state.time - lastCrashSound > 85) { lastCrashSound = sim.state.time; tone(big ? 90 : 135, .18, 'triangle', big ? .08 : .04); if (big) noise(.16, 500, .05); }
    }
    if (e.type === 'bounce') {
      squash.set(Math.round(e.mushX), renderTime);
      tone(200, .24, 'sine', .06, 2.4); burst(e.x, e.y, '#fbe8cf', 6);
    }
    if (e.type === 'snap') { tone(820, .12, 'triangle', .04, .35); burst(e.x, e.y, '#c9a46a', 6); }
    if (e.type === 'icicle') { tone(1800, .05, 'sine', .03, .8); burst(e.x, e.y, '#eafcff', 4); }
    if (e.type === 'shatter') {
      debris({ ...e, color: '#d9f3f6', material: 'ice' }, 14, 10);
      tone(2200, .12, 'sine', .03, .7); tone(2800, .1, 'sine', .02, .7, .04); noise(.08, 6000, .02, 'highpass');
    }
    if (e.type === 'splash') {
      if (e.pit) { dust(e.x, e.y, 8, 3, '#6b5a45'); tone(80, .2, 'triangle', .05); }
      else { droplets(e.x, e.y, 8 + Math.round((e.mass || 4) / 2)); shock(e.x, e.y, 46, '#dff7f8', .5, .22); noise(.32, 1100, .06); }
    }
    if (e.type === 'launch') {
      chain = 0; chainLabel = null; turnBroken = 0; impact = null;
      flightZ = cam.z; camMode = 'flight'; manual = null;
      if (trail.length) prevTrails = [trail, ...prevTrails].slice(0, 2);
      trail = [];
      tone(520, .12, 'triangle', .05, .5); noise(.09, 2400, .04, 'bandpass');
    }
    if (e.type === 'split') { tone(460, .18, 'triangle'); burst(e.x, e.y, '#9fcf9a', 8); }
    if (e.type === 'reload') {
      aim = { x: S().x, y: S().y }; keyAim = false;
      if (!turnBroken && sim.state.targets.length) taunt = renderTime + 1.3;
      if (camMode !== 'manual' || !pan) { camMode = 'home'; manual = null; }
    }
    if (e.type === 'finish') finish(e);
  }
  function save() {
    try { localStorage.setItem(SAVE, JSON.stringify(record)); }
    catch (_) { saveAvailable = false; }
  }

  // ---- Stage map: place tabs + eight stage cells per place.
  function updateLevels() {
    const total = N * 3, got = record.stars.reduce((a, b) => a + b, 0);
    $('total-stars').textContent = `★ ${got} / ${total}`;
    const tabs = $('places'); tabs.replaceChildren();
    PLACES.forEach((pl, pi) => {
      const list = LISTS[pi], stars = list.reduce((a, i) => a + record.stars[i], 0), open = list.length > 0 && unlocked(list[0]);
      const b = document.createElement('button');
      b.className = 'place-tab' + (pi === mapPlace ? ' on' : '') + (open ? '' : ' locked');
      b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(pi === mapPlace)); b.tabIndex = pi === mapPlace ? 0 : -1;
      b.innerHTML = `<span>${pl.name}</span><small>${!list.length ? '준비 중' : open ? `★ ${stars}/${list.length * 3}` : '🔒 잠김'}</small>`;
      b.onclick = () => showPlace(pi, true);
      b.onkeydown = e => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); showPlace((mapPlace + (e.key === 'ArrowRight' ? 1 : PLACES.length - 1)) % PLACES.length, true); }
      };
      tabs.append(b);
    });
    const pl = PLACES[mapPlace], list = LISTS[mapPlace], stars = list.reduce((a, i) => a + record.stars[i], 0);
    $('place-name').textContent = pl.name;
    $('place-stars').textContent = `★ ${stars} / ${list.length * 3}`;
    $('levels').replaceChildren();
    list.forEach((i, k) => {
      const level = P.LEVELS[i], open = unlocked(i), button = document.createElement('button');
      button.className = 'level-button' + (open ? '' : ' locked') + (cleared(i) ? ' done' : '');
      button.disabled = !open;
      button.innerHTML = open
        ? `<b>${k + 1}</b><span class="lv-name">${level.name}</span><span class="lv-stars">${'★'.repeat(record.stars[i])}<i>${'★'.repeat(3 - record.stars[i])}</i></span><span class="lv-best">${record.best[i] ? record.best[i].toLocaleString() + '점' : '처음'}</span>`
        : `<b>🔒</b><span class="lv-name">${level.name}</span><span class="lv-lock">${lockReason(i)}</span>`;
      button.setAttribute('aria-label', `${pl.name} ${k + 1}. ${level.name}${open ? `, 별 ${record.stars[i]}개, 최고 ${record.best[i]}점` : `, 잠김 — ${lockReason(i)}`}`);
      button.onclick = () => start(i);
      $('levels').append(button);
    });
    const pi = mapPlace, placeLocked = list.length && !unlocked(list[0]);
    $('place-lock').hidden = !placeLocked;
    if (placeLocked) $('place-lock').textContent = `${PLACES[pi - 1].name}에서 ${need(LISTS[pi - 1])}단계를 깨면 열려요 — 지금 ${LISTS[pi - 1].filter(cleared).length}단계`;
    const c = continueStage(), any = record.stars.some(s => s > 0);
    $('start').innerHTML = `${any ? '이어 하기' : '숲으로 출발'} <small>${stageLabel(c)}</small><span>→</span>`;
    if (!saveAvailable) $('save-note').textContent = '브라우저 저장소를 사용할 수 없어 이번 창에서만 기록을 보관해요.';
  }
  function showPlace(pi, focus) {
    mapPlace = Math.max(0, Math.min(PLACES.length - 1, pi)); updateLevels();
    if (focus) $('places').querySelector?.('.place-tab.on')?.focus?.();
  }

  function cancelDrag() { dragging = false; grab = null; aim = { x: S().x, y: S().y }; keyAim = false; }
  function start(index, retry = false) {
    sim?.dispose(); levelIndex = index;
    sim = P.create(index, onEvent); screen = 'play'; paused = false; cancelDrag(); loadTerrain();
    particles = []; rings = []; texts = []; trail = []; prevTrails = []; accumulator = 0; angle = 27; power = 78;
    lastCrashSound = -Infinity; shake = 0; hitStop = 0; chain = 0; chainLabel = null; pendingResult = null; bonus = null; impact = null; taunt = 0;
    pointers.clear(); pan = null; pinch = null; manual = null; aimPick = null; aimFocus = null; miniPress = null;
    $('menu').hidden = $('result').hidden = $('paused').hidden = true;
    if (game.dataset) { game.dataset.screen = 'play'; game.dataset.place = placeKey(index); }
    loadArt('bg-' + placeKey(index)); setAtmosphere();
    camMode = 'home'; Object.assign(cam, homeView());
    if (!retry && !reducedMotion.matches) beginSurvey();
    $('chapter').textContent = stageLabel(index);
    $('level-name').textContent = P.LEVELS[index].name;
    send('hk:resumed');
    if (!runOpen) {
      runOpen = true; runBest = 0; lastLive = -1;
      send('hk:start');
    }
    canvas.focus({ preventScroll: true }); updateHUD();
  }
  // 받침 있는 말 뒤 「을」, 없는 말 뒤 「를」(밤의 성채를 · 달빛 망루를 · 안개 늪을).
  const objectOf = w => { const c = w.charCodeAt(w.length - 1) - 0xac00; return w + (c >= 0 && c < 11172 && c % 28 ? '을' : '를'); };
  function finish(e) {
    screen = 'result'; cancelDrag();
    if (e.won) {
      runBest = Math.max(runBest, e.score);
      record.best[levelIndex] = Math.max(record.best[levelIndex], e.score);
      record.stars[levelIndex] = Math.max(record.stars[levelIndex], e.stars); save();
    }
    const finalLevel = levelIndex === ORDER.at(-1);
    if (!e.won || finalLevel) submitRun();
    else publishLiveScore();
    resultNext = e.won && !finalLevel ? nextStage(levelIndex) : null;
    const list = LISTS[placeIndex(levelIndex)], placeEnd = list.at(-1) === levelIndex;
    $('result-label').textContent = e.won ? (finalLevel ? 'ALL PLACES SAVED' : placeEnd ? 'PLACE CLEAR' : 'STAGE CLEAR') : 'ONE MORE SHOT';
    $('result-title').textContent = e.won ? (finalLevel ? '모든 망루를 되찾았어요!' : placeEnd ? `${objectOf(PLACES[placeIndex(levelIndex)].name)} 지켜냈어요!` : '멋진 한 방이었어요!') : '조금만 더 정확하게!';
    $('stars').innerHTML = e.won ? '★'.repeat(e.stars) + `<span class="empty">${'★'.repeat(3 - e.stars)}</span>` : '↻';
    $('result-score').textContent = `${e.score.toLocaleString()}점`;
    const left = P.LEVELS[levelIndex].ammo.length - sim.state.spent;
    let copy = e.won ? `남긴 도토리 ${left}개 · 최고 ${record.best[levelIndex].toLocaleString()}점` : `밤도깨비 ${sim.state.targets.length}마리가 남았어요. 지난 발 자취를 보고 각도를 조금 바꿔 보세요.`;
    if (e.won && !finalLevel && resultNext == null) { const pi = placeIndex(levelIndex) + 1; copy += ` · ${PLACES[pi]?.name ?? '다음 장소'}는 ${lockReason(LISTS[pi]?.[0] ?? 0)}`; }
    $('result-copy').textContent = copy;
    $('next').hidden = !e.won;
    $('next').textContent = resultNext == null ? '지도 보기 →' : placeKey(resultNext) !== placeKey(levelIndex) ? `다음 장소: ${PLACES[placeIndex(resultNext)].name} →` : '다음 단계 →';
    // Spare acorns pop into points one by one before the result card.
    const spare = e.won ? left : 0;
    if (spare > 0 && !reducedMotion.matches) bonus = { at: renderTime + .35, count: spare, shown: 0 };
    pendingResult = { at: renderTime + (spare > 0 && !reducedMotion.matches ? .45 + spare * .3 : .25), won: e.won };
  }
  function showResult() {
    const r = pendingResult; pendingResult = null;
    $('result').hidden = false; if (game.dataset) game.dataset.screen = 'result';
    $(r.won && !$('next').hidden ? 'next' : 'again').focus({ preventScroll: true });
    if (r.won) { tone(660, .16, 'triangle', .05); tone(880, .18, 'triangle', .05, .6, .12); tone(1175, .3, 'sine', .05, .6, .24); }
    else tone(220, .3);
  }
  function home() {
    submitRun();
    screen = 'menu'; paused = false; cancelDrag(); pendingResult = null; bonus = null;
    mapPlace = Math.max(0, placeIndex(levelIndex));
    $('menu').hidden = false; $('result').hidden = $('paused').hidden = true; $('flight-hint').hidden = true;
    if (game.dataset) { game.dataset.screen = 'menu'; game.dataset.place = ''; }
    $('chapter').textContent = 'ACORN RANGERS'; $('level-name').textContent = '도토리 새총단';
    send('hk:resumed'); updateLevels();
  }
  function pause(value) {
    if (screen !== 'play') { send('hk:resumed'); return; }
    paused = value; cancelDrag(); accumulator = 0; $('paused').hidden = !value;
    send(value ? 'hk:paused' : 'hk:resumed');
  }
  function updateHUD() {
    if (!sim) return;
    const s = sim.state, level = P.LEVELS[levelIndex];
    $('score').textContent = s.score.toLocaleString();
    const markup = level.ammo.map((type, i) => `<span class="ammo-chip ${i < s.spent ? 'used' : i === s.spent ? 'current' : ''}" title="${type === 'bomb' ? '폭탄 도토리' : type === 'split' ? '세 갈래 도토리' : '기본 도토리'}">${type === 'bomb' ? '✹' : type === 'split' ? '❧' : '●'}</span>`).join('');
    if ($('ammo').innerHTML !== markup) $('ammo').innerHTML = markup;
    const ability = screen === 'play' && s.phase === 'flight' && !s.abilityUsed && s.active && s.active.game.ammo !== 'seed';
    $('ability').disabled = !ability; $('flight-hint').hidden = !ability || paused;
    $('hint').textContent = survey ? '전장을 둘러보는 중 · 누르면 건너뛰어요'
      : s.phase === 'aim' ? (keyAim ? `각도 ${angle}° · 힘 ${power}% · SPACE 발사` : level.tip)
      : `남은 밤도깨비 ${s.targets.length}마리 · 무너지는 중…`;
    const away = camMode === 'overview' || camMode === 'manual';
    $('overview').setAttribute('aria-pressed', String(camMode === 'overview'));
    $('overview').setAttribute('aria-label', away ? '새총으로 돌아가기' : '한눈에 보기');
    $('overview').textContent = away ? '◎' : '⤢';
    publishLiveScore();
  }

  // ---- View and camera. The board keeps a 1280×720 base and widens (or deepens) to fill the screen.
  const view = { w: VIEW_WIDTH, h: VIEW_HEIGHT, k: 1, ox: 0, oy: 0, cw: VIEW_WIDTH, ch: VIEW_HEIGHT };
  function measure() {
    const cw = canvas.clientWidth || VIEW_WIDTH, ch = canvas.clientHeight || VIEW_HEIGHT;
    const k = Math.min(cw / VIEW_WIDTH, ch / VIEW_HEIGHT);
    const w = Math.min(cw / k, VIEW_WIDTH * 1.4), h = Math.min(ch / k, VIEW_HEIGHT * 1.34);
    Object.assign(view, { cw, ch, k, w, h, ox: (cw - w * k) / 2, oy: (ch - h * k) / 2 });
  }
  const cam = { x: 0, y: 0, z: 1 };
  let camMode = 'home', manual = null, survey = null, flightZ = 1, lastFocus = null;
  const SLING_AT = { x: 205, y: 432 };
  function bounds() { const w = W(); return { x0: 0, x1: w.width, y0: Math.min(0, w.top) - 30, y1: Math.max(VIEW_HEIGHT, w.bottom + 80) }; }
  function zoomMin() { const b = bounds(); return Math.min(1, view.w / (b.x1 - b.x0), view.h / (b.y1 - b.y0)); }
  const zoomClamp = z => Math.max(zoomMin(), Math.min(1.4, z));
  // Bottom strip (ammo · hint · ability) height in view units: the camera may look that much further below the
  // ground so that zoomed-out views keep the structures above the strip instead of under it.
  const bandV = () => (view.ch <= 540 ? 58 : 84) / (view.k || 1);
  function clampCam(c) {
    const b = bounds(), z = zoomClamp(c.z), vw = view.w / z, vh = view.h / z, bw = b.x1 - b.x0;
    const y1 = Math.max(b.y1, W().bottom + bandV() / z + 10), bh = y1 - b.y0;
    const x = vw >= bw ? b.x0 - (vw - bw) / 2 : Math.max(b.x0, Math.min(b.x1 - vw, c.x));
    const y = vh >= bh ? y1 - vh : Math.max(b.y0, Math.min(y1 - vh, c.y));
    return { x, y, z };
  }
  const slingScreen = () => ({ x: SLING_AT.x, y: SLING_AT.y + (view.h - VIEW_HEIGHT) });
  // Zoom (sling kept at its screen spot) that brings every remaining enemy into view; used when it is a mild zoom.
  function fitTargets() {
    const s = S(), at = slingScreen(), ts = sim?.state.targets ?? [];
    let rx = s.x, ry0 = s.y, ry1 = s.y;
    for (const b of ts) { if (!b.position) continue; rx = Math.max(rx, b.position.x + 90); ry0 = Math.min(ry0, b.position.y - 90); ry1 = Math.max(ry1, b.position.y + 60); }
    const z = Math.min(1, (view.w - at.x) / Math.max(1, rx - s.x), at.y / Math.max(1, s.y - ry0), (view.h - at.y) / Math.max(1, ry1 - s.y));
    return z >= .8 ? z : 1;
  }
  function homeView() { const s = S(), at = slingScreen(), z = zoomClamp(fitTargets()); return clampCam({ z, x: s.x - at.x / z, y: s.y - at.y / z }); }
  // What the pull is aimed at: the spot picked on the minimap, else the remaining enemy nearest to where the
  // predicted path ends (kept unless another is clearly nearer, so the view does not flicker), else the nearest block.
  let aimPick = null, aimFocus = null;
  function aimTarget(path) {
    if (aimPick) return aimPick;
    const end = path.at(-1), s = S(), arc = preview?.ghost?.length ? [...path, ...preview.ghost] : path;
    if (!end || !sim) return null;
    // An enemy the arc passes close to (through the structures in front) is the one aimed at; else the one nearest the end.
    const near = d => { let m = Infinity; for (let i = 0; i < arc.length; i += 2) m = Math.min(m, (arc[i].x - d.x) ** 2 + (arc[i].y - d.y) ** 2); return Math.sqrt(m); };
    const far = d => near(d) < 90 ? near(d) : 90 + Math.hypot(d.x - end.x, (d.y - end.y) * 1.4);
    const pool = sim.state.targets.filter(b => b.position && b.position.x > s.x + 40);
    const list = pool.length ? pool : sim.state.blocks.filter(b => b.position && b.position.x > s.x + 40);
    let best = null, bd = Infinity;
    for (const b of list) { const d = far(b.position); if (d < bd) { bd = d; best = b; } }
    if (aimFocus && list.includes(aimFocus) && far(aimFocus.position) < bd * 1.25 + 40) best = aimFocus;
    aimFocus = best;
    return best ? { x: best.position.x, y: best.position.y } : null;
  }
  // While pulling: zoom out just enough that the predicted path's end and the thing aimed at are on screen (above the
  // bottom strip); the sling keeps its place. The pull itself is measured at the zoom it was grabbed with (pullTo).
  function aimView(path) {
    const s = S(), at = slingScreen(), band = bandV();
    let rx = s.x + view.w - at.x, ry0 = s.y - at.y, ry1 = s.y + 150;
    for (const p of path) { rx = Math.max(rx, p.x + 150); ry0 = Math.min(ry0, p.y - 90); ry1 = Math.max(ry1, p.y + 70); }
    const t = aimTarget(path);
    if (t) { rx = Math.max(rx, t.x + 110); ry0 = Math.min(ry0, t.y - 100); ry1 = Math.max(ry1, t.y + 40); }
    const z = zoomClamp(Math.min(fitTargets(), (view.w - at.x) / (rx - s.x), at.y / Math.max(1, s.y - ry0), (view.h - band - at.y) / Math.max(1, ry1 - s.y)));
    return clampCam({ z, x: s.x - at.x / z, y: s.y - at.y / z });
  }
  function overviewView() { return clampCam({ z: 0, x: 0, y: Infinity }); } // ground side first (above the bottom strip)
  function followView(f, lead) {
    const z = zoomClamp(Math.min(1, flightZ)), vw = view.w / z, vh = view.h / z;
    return clampCam({ z, x: f.x - vw * .4 + Math.max(-vw * .25, Math.min(vw * .3, lead.x)), y: f.y - vh * .48 + Math.max(-vh * .25, Math.min(vh * .25, lead.y)) });
  }
  function flightTarget() {
    const s = sim.state, moving = s.shots.filter(b => b.game.kind === 'shot' && b.game.turn === s.spent && b.speed > 3.5);
    const recentImpact = impact && renderTime - impact.t < 1.3;
    if (moving.length && !recentImpact) {
      let x = 0, y = 0, vx = 0, vy = 0;
      for (const b of moving) { x += b.position.x; y += b.position.y; vx += b.velocity.x; vy += b.velocity.y; }
      const n = moving.length; lastFocus = { x: x / n, y: y / n };
      return followView(lastFocus, { x: vx / n * 10, y: vy / n * 10 });
    }
    if (impact) lastFocus = { x: impact.x, y: impact.y };
    return lastFocus ? followView(lastFocus, { x: 0, y: 0 }) : null;
  }
  function beginSurvey() {
    const s = sim.state, things = [...(s.targets ?? []), ...(s.blocks ?? [])].filter(b => b.position);
    if (!things.length) return;
    const home = homeView(), far = things.reduce((m, b) => Math.max(m, b.position.x), 0);
    const topY = (s.targets ?? []).filter(b => b.position).reduce((m, b) => Math.min(m, b.position.y), home.y + 400);
    if (far + 90 <= home.x + view.w / home.z) return;
    const from = clampCam({ z: 1, x: far + 140 - view.w, y: Math.min(home.y, topY - 180) });
    const dur = Math.max(1.5, Math.min(2.5, 1.4 + (far - view.w) / 2200));
    survey = { t: 0, hold: .45, dur, from };
    Object.assign(cam, from); camMode = 'survey';
  }
  function skipSurvey() { if (!survey) return; survey = null; camMode = 'home'; updateHUD(); }
  const smooth = t => t * t * (3 - 2 * t);
  function updateCamera(dt) {
    if (!sim) return;
    let target = null, rate = 5;
    if (survey && screen === 'play') {
      if (!paused) survey.t += dt;
      const to = homeView(), u = smooth(Math.max(0, Math.min(1, (survey.t - survey.hold) / (survey.dur - survey.hold))));
      Object.assign(cam, { x: survey.from.x + (to.x - survey.from.x) * u, y: survey.from.y + (to.y - survey.from.y) * u, z: survey.from.z + (to.z - survey.from.z) * u });
      if (survey.t >= survey.dur) { survey = null; camMode = 'home'; updateHUD(); }
      return;
    }
    if (screen === 'menu') target = homeView();
    else if (camMode === 'manual' && manual) { target = clampCam(manual); rate = 11; }
    else if (camMode === 'overview') target = overviewView();
    else if (sim.state.phase !== 'aim') { target = flightTarget(); rate = 6; }
    else if ((dragging || keyAim) && preview) { target = aimView(preview.pts); rate = 3.2; }
    else target = homeView();
    if (!target) return;
    const a = 1 - Math.exp(-dt * rate);
    cam.z += (target.z - cam.z) * a; cam.x += (target.x - cam.x) * a; cam.y += (target.y - cam.y) * a;
    Object.assign(cam, clampCam(cam));
  }
  const visible = (m = 0) => ({ x0: cam.x - m, y0: cam.y - m, x1: cam.x + view.w / cam.z + m, y1: cam.y + view.h / cam.z + m });
  const inView = (v, x, y, r = 0) => x + r > v.x0 && x - r < v.x1 && y + r > v.y0 && y - r < v.y1;

  // ---- Portrait phones: the whole game turns 90° (same way as the moon cannon game), pointers turn back.
  const touch = (() => { try { return matchMedia('(pointer: coarse)').matches || (typeof navigator !== 'undefined' && (navigator.maxTouchPoints || 0) > 0); } catch (_) { return false; } })();
  let rotated = false, rotW = 0, rotHintShown = false, layoutKey = '', hintUntil = 0;
  function layout() {
    const iw = win.innerWidth || VIEW_WIDTH, ih = win.innerHeight || VIEW_HEIGHT, key = iw + 'x' + ih;
    if (key === layoutKey) return; layoutKey = key;
    const rot = touch && ih > iw && iw < 760;
    // Turning the phone while pulling would leave the finger and the aim in different frames: drop the pull (no shot).
    if (rot !== rotated && grab) { pointers.delete(grab.id); cancelDrag(); }
    rotated = rot; rotW = iw;
    if (game.style) {
      game.style.width = rot ? ih + 'px' : ''; game.style.height = rot ? iw + 'px' : '';
      game.style.transform = rot ? `translate(${iw}px,0) rotate(90deg)` : '';
    }
    game.classList?.toggle('rotated', rot);
    const narrow = !rot && ih > iw && iw < 760;
    if ($('portrait-note')) $('portrait-note').hidden = !narrow;
    if (rot && !rotHintShown && $('rot-hint')) { rotHintShown = true; $('rot-hint').hidden = false; hintUntil = renderTime + 3.5; }
  }

  // ---- Input
  const pointers = new Map();
  let grab = null, pan = null, pinch = null, preview = null, lastAim = null, miniPress = null;
  function local(e) {
    if (rotated) return { u: e.clientY, v: rotW - e.clientX };
    const r = canvas.getBoundingClientRect(); return { u: e.clientX - r.left, v: e.clientY - r.top };
  }
  function toWorld(l) { return { x: cam.x + (l.u - view.ox) / view.k / cam.z, y: cam.y + (l.v - view.oy) / view.k / cam.z }; }
  function toScreen(x, y) { return { u: view.ox + (x - cam.x) * cam.z * view.k, v: view.oy + (y - cam.y) * cam.z * view.k }; }
  // The pull follows the finger at the zoom it was grabbed with, so zooming never shifts the aim.
  function pullTo(l) {
    const z = grab.z * view.k;
    aim = sim.pull(grab.base.x + (l.u - grab.l0.u) / z, grab.base.y + (l.v - grab.l0.v) / z);
    const s = S(), len = Math.hypot(aim.x - s.x, aim.y - s.y), step = Math.floor(len / 14);
    if (step !== lastPullStep) { if (step > lastPullStep) tone(170 + len * 3.2, .05, 'triangle', .018, .9); lastPullStep = step; }
  }
  canvas.addEventListener('pointerdown', e => {
    if (screen !== 'play' || paused) return;
    const l = local(e);
    if (survey) { skipSurvey(); e.preventDefault(); return; }
    if (!grab && !pan && minimapHit(l)) {
      miniPress = { id: e.pointerId, l0: l }; pointers.set(e.pointerId, l);
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault(); return;
    }
    pointers.set(e.pointerId, l);
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    canvas.focus({ preventScroll: true }); e.preventDefault();
    if (grab) return;
    if (pointers.size >= 2 && pan) { startPinch(); return; }
    if (sim.state.phase === 'flight' && sim.ability()) { updateHUD(); return; }
    const p = toWorld(l), s = S(), reach = Math.max(72, 54 / (view.k * cam.z));
    if (sim.state.phase === 'aim' && (Math.hypot(p.x - s.x, p.y - s.y) <= reach || Math.hypot(p.x - aim.x, p.y - aim.y) <= reach)) {
      if (camMode === 'manual' || camMode === 'overview') { camMode = 'home'; manual = null; }
      const base = keyAim && Math.hypot(p.x - aim.x, p.y - aim.y) < Math.hypot(p.x - s.x, p.y - s.y) ? { ...aim } : p;
      grab = { id: e.pointerId, l0: l, base, z: cam.z }; dragging = true; keyAim = false; everPulled = true; lastPullStep = 0;
      pullTo(l);
    } else {
      pan = { id: e.pointerId, last: l }; camMode = 'manual'; manual = { ...cam };
    }
  });
  function startPinch() {
    const [a, b] = [...pointers.values()];
    const mid = { u: (a.u + b.u) / 2, v: (a.v + b.v) / 2 };
    pinch = { d0: Math.hypot(a.u - b.u, a.v - b.v) || 1, z0: cam.z, world: toWorld(mid) };
    camMode = 'manual'; manual = { ...cam };
  }
  canvas.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    const l = local(e); pointers.set(e.pointerId, l);
    if (miniPress && e.pointerId === miniPress.id) {
      if (Math.hypot(l.u - miniPress.l0.u, l.v - miniPress.l0.v) < 8) return;
      pan = { id: e.pointerId, last: miniPress.l0 }; camMode = 'manual'; manual = { ...cam }; miniPress = null;
    }
    if (grab && e.pointerId === grab.id) { pullTo(l); return; }
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()], mid = { u: (a.u + b.u) / 2, v: (a.v + b.v) / 2 };
      const z = zoomClamp(pinch.z0 * Math.hypot(a.u - b.u, a.v - b.v) / pinch.d0);
      manual = clampCam({ z, x: pinch.world.x - (mid.u - view.ox) / view.k / z, y: pinch.world.y - (mid.v - view.oy) / view.k / z });
      Object.assign(cam, manual); return;
    }
    if (pan && e.pointerId === pan.id) {
      manual.x -= (l.u - pan.last.u) / view.k / manual.z; manual.y -= (l.v - pan.last.v) / view.k / manual.z;
      manual = clampCam(manual); Object.assign(cam, manual); pan.last = l;
    }
  });
  function release(e, cancel) {
    if (!pointers.has(e.pointerId)) return;
    if (miniPress && e.pointerId === miniPress.id) { if (!cancel) minimapGo(local(e)); miniPress = null; pointers.delete(e.pointerId); return; }
    if (grab && e.pointerId === grab.id) {
      if (cancel) cancelDrag();
      else { pullTo(local(e)); const a = aim; lastAim = { ...a }; cancelDrag(); aimPick = null; sim.launch(a.x, a.y); updateHUD(); }
    }
    pointers.delete(e.pointerId);
    if (pinch && pointers.size < 2) { pinch = null; const [id] = pointers.keys(); pan = id != null ? { id, last: pointers.get(id) } : null; }
    if (pan && e.pointerId === pan.id) pan = null;
  }
  canvas.addEventListener('pointerup', e => release(e, false));
  canvas.addEventListener('pointercancel', e => release(e, true));
  canvas.addEventListener('lostpointercapture', e => { if (grab && e.pointerId === grab.id) release(e, true); });
  canvas.addEventListener('wheel', e => {
    if (screen !== 'play' || paused) return;
    e.preventDefault(); skipSurvey();
    const l = local(e), w = toWorld(l), z = zoomClamp(cam.z * Math.exp(-e.deltaY * .0015));
    camMode = 'manual'; manual = clampCam({ z, x: w.x - (l.u - view.ox) / view.k / z, y: w.y - (l.v - view.oy) / view.k / z }); Object.assign(cam, manual); updateHUD();
  }, { passive: false });
  function toggleOverview() {
    skipSurvey();
    if (camMode === 'overview' || camMode === 'manual') { camMode = sim.state.phase === 'aim' ? 'home' : 'flight'; manual = null; }
    else camMode = 'overview';
    updateHUD();
  }
  function panBy(dx, dy) {
    skipSurvey();
    if (camMode !== 'manual' || !manual) manual = { ...cam };
    camMode = 'manual';
    manual = clampCam({ ...manual, x: manual.x + dx * view.w / manual.z, y: manual.y + dy * view.h / manual.z });
    updateHUD();
  }
  function keyboardAim() { const a = angle * Math.PI / 180, length = power * P.MAX_PULL / 100; aim = { x: S().x - Math.cos(a) * length, y: S().y + Math.sin(a) * length }; keyAim = true; }
  document.addEventListener('keydown', e => {
    if (e.code === 'Escape') { e.preventDefault(); EMBED ? send('hk:esc') : pause(!paused); return; }
    if (screen === 'result' && e.code === 'KeyR' && !e.repeat) { start(levelIndex, true); return; }
    if (screen !== 'play' || paused || (e.target instanceof HTMLButtonElement)) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (survey) { skipSurvey(); if (e.code === 'Space') return; }
    if (e.code === 'KeyR' && !e.repeat) { start(levelIndex, true); return; }
    if (e.code === 'KeyZ' && !e.repeat) { toggleOverview(); return; }
    if (e.code === 'KeyA' || (e.shiftKey && e.code === 'ArrowLeft')) { panBy(-.35, 0); return; }
    if (e.code === 'KeyD' || (e.shiftKey && e.code === 'ArrowRight')) { panBy(.35, 0); return; }
    if (e.shiftKey && (e.code === 'ArrowUp' || e.code === 'ArrowDown')) { panBy(0, e.code === 'ArrowUp' ? -.3 : .3); return; }
    if (e.code === 'Space' && !e.repeat) {
      if (sim.state.phase === 'flight') sim.ability();
      else if (sim.state.phase === 'aim') { keyboardAim(); const a = aim; cancelDrag(); aimPick = null; if (camMode !== 'home') { camMode = 'home'; manual = null; } sim.launch(a.x, a.y); }
    } else if (sim.state.phase === 'aim') {
      if (e.code === 'ArrowLeft') angle = Math.min(75, angle + 1);
      if (e.code === 'ArrowRight') angle = Math.max(5, angle - 1);
      if (e.code === 'ArrowUp') power = Math.min(100, power + 2);
      if (e.code === 'ArrowDown') power = Math.max(15, power - 2);
      if (e.code.startsWith('Arrow')) { keyboardAim(); everPulled = true; if (camMode === 'manual' || camMode === 'overview') { camMode = 'home'; manual = null; } }
    }
    updateHUD();
  });
  window.addEventListener('message', e => {
    if (!EMBED || e.source !== parent || e.origin !== location.origin || !e.data) return;
    if (e.data.type === 'hk:hello') return;
    if (e.data.type === 'hk:pause') pause(true);
    if (e.data.type === 'hk:resume') pause(false);
    if (e.data.type === 'hk:restart') start(levelIndex, true);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && screen === 'play') pause(true); });
  win.addEventListener('resize', layout);
  win.addEventListener('orientationchange', () => { for (const ms of [60, 250, 600]) setTimeout(layout, ms); });
  if ($('rot-hint')) $('rot-hint').onclick = () => { $('rot-hint').hidden = true; hintUntil = 0; };
  $('start').onclick = () => start(continueStage());
  $('home').onclick = home; $('select-level').onclick = home;
  $('retry').onclick = () => { if (screen !== 'menu') start(levelIndex, true); };
  $('again').onclick = () => start(levelIndex, true);
  $('next').onclick = () => {
    if (resultNext != null) { start(resultNext); return; }
    const pi = placeIndex(levelIndex);
    home(); if (levelIndex !== ORDER.at(-1)) showPlace(Math.min(PLACES.length - 1, pi + 1));
  };
  $('pause').onclick = () => pause(!paused); $('resume').onclick = () => { pause(false); canvas.focus(); };
  $('ability').onclick = () => { sim?.ability(); updateHUD(); canvas.focus(); };
  $('overview').onclick = () => { if (screen === 'play') toggleOverview(); canvas.focus(); };
  $('sound').onclick = () => { sound = !sound; $('sound').setAttribute('aria-pressed', String(sound)); $('sound').setAttribute('aria-label', sound ? '소리 끄기' : '소리 켜기'); $('sound').style.opacity = sound ? '1' : '.55'; tone(660); };
  // 전체 화면 — 휴대폰에서 아케이드 머리줄 · 주소창 없이 전장을 화면 가득. 전체 화면을 못 쓰는 곳(아이폰 사파리 등)은 단추를 숨긴다
  (() => {
    const btn = $('fullscreen'), root = document.documentElement;
    const can = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled) && !!(root.requestFullscreen || root.webkitRequestFullscreen);
    if (!can) return;
    const isOn = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
    const sync = () => { const on = isOn(); btn.setAttribute('aria-pressed', String(on)); btn.setAttribute('aria-label', on ? '전체 화면 끝내기' : '전체 화면으로'); btn.classList.toggle('is-on', on); };
    btn.hidden = false;
    btn.onclick = () => {
      try {
        if (isOn()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        else { const r = (root.requestFullscreen || root.webkitRequestFullscreen).call(root, { navigationUI: 'hide' }); if (r && r.catch) r.catch(() => {}); }
      } catch (_) {}
      canvas.focus();
    };
    document.addEventListener('fullscreenchange', sync); document.addEventListener('webkitfullscreenchange', sync);
  })();
  // Swipe the stage map sideways to change place.
  (() => {
    const panel = $('place-panel'); let down = null;
    panel.addEventListener('pointerdown', e => { down = local(e); });
    panel.addEventListener('pointerup', e => {
      if (!down) return; const l = local(e), du = l.u - down.u, dv = l.v - down.v; down = null;
      if (Math.abs(du) > 60 && Math.abs(dv) < 50) showPlace(mapPlace + (du < 0 ? 1 : -1));
    });
  })();

  // ---- Art (generated pictures). Missing or failed pictures fall back to canvas drawing.
  const ART = {}, ART_BASE = '../../assets/games/acornshot/', NOART = query.get('noart') === '1';
  const art = n => ART[n] || null;
  const EDGE = {};
  function loadArt(name) {
    if (NOART || name in ART || typeof Image === 'undefined') return;
    ART[name] = null;
    const img = new Image(); img.decoding = 'async';
    img.onload = () => {
      ART[name] = img;
      if (name === 'title') { $('menu').style.backgroundImage = `url("${img.src}")`; $('menu').classList.add('art'); }
      if (name.startsWith('bg-')) {
        try {
          const c = document.createElement('canvas'); c.width = 8; c.height = 1; const g = c.getContext('2d');
          g.drawImage(img, 0, 0, img.width, 4, 0, 0, 8, 1); const d = g.getImageData(0, 0, 8, 1).data;
          let r = 0, gg = 0, b = 0; for (let i = 0; i < 32; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
          EDGE[name] = `rgb(${r / 8 | 0},${gg / 8 | 0},${b / 8 | 0})`;
        } catch (_) {}
      }
    };
    img.onerror = () => { ART[name] = false; };
    img.src = ART_BASE + name + '.webp';
  }
  for (const n of ['title', 'acorn-seed', 'acorn-bomb', 'acorn-split', 'goblin', 'goblin-hurt', 'sling']) loadArt(n);

  // ---- Drawing helpers
  function ellipse(x, y, rx, ry, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); }
  function line(points, color, width = 3) { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); }
  function rounded(x, y, w, h, r, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); }
  const hash = i => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

  // Place looks: sky, far and mid scenery, ground band, veil over the picture, atmosphere.
  const LOOK = {
    forest: { sky: ['#c5e2df', '#eef0cf', '#f5e8be'], far: ['#b9d2b7', '#9bbfa0'], mid: '#87ad8d', mid2: '#7ca47c', band: '#b8c898', h0: .59, orb: '#fff6cb', air: 'leaf' },
    valley: { sky: ['#cfe3d8', '#efe9c8', '#f0dcae'], far: ['#cdb991', '#b79f76'], mid: '#a48c63', mid2: '#8f9e6a', band: '#b3ac7a', h0: .63, veil: 'rgba(255,250,235,.2)', orb: '#fff3c4', air: 'mist' },
    swamp: { sky: ['#a9c3bd', '#c9d6c2', '#d9dcc0'], far: ['#8fa89a', '#7c9688'], mid: '#5f7a66', mid2: '#6b8670', band: '#889c8a', h0: .56, veil: 'rgba(225,238,228,.12)', orb: '#eef3d6', air: 'firefly' },
    snow: { sky: ['#b5d3ea', '#e1eff7', '#f2f7fa'], far: ['#d6e6f1', '#c0d6e6'], mid: '#6f8f9d', mid2: '#a8c2cc', band: '#d9f0fc', h0: .58, veil: 'rgba(40,70,95,.12)', orb: '#ffffff', air: 'snow' },
    castle: { sky: ['#272650', '#463b74', '#74609a'], far: ['#4a4072', '#584b80'], mid: '#3a335e', mid2: '#463e6c', band: '#78668b', h0: .54, orb: '#fff3b8', air: 'star', night: true },
    // 달빛 망루: 청록 밤하늘 · 은빛 초승달 · 안개 낀 바위 봉우리(bg-summit.webp, 땅 띠는 그림 높이 0.59 부터 #3c6b74).
    summit: { sky: ['#123a46', '#24596a', '#4a8290'], far: ['#3f6d7a', '#4e7e89'], mid: '#2f5866', mid2: '#3a6773', band: '#3c6b74', h0: .59, orb: '#eef6f4', air: 'glint', night: true },
  };
  const look = () => LOOK[placeKey(levelIndex)] || LOOK.forest;
  let atmosphere = [];
  function setAtmosphere() {
    const kind = look().air, count = { leaf: 10, mist: 6, firefly: 22, snow: 46, star: 34, glint: 30 }[kind] || 0;
    atmosphere = Array.from({ length: count }, (_, i) => ({ x: hash(i + 1), y: hash(i + 50), s: hash(i + 99), p: hash(i + 7) * 6.28 }));
  }

  // Far layer: drawn in screen space (very distant, does not zoom), slides slowly with the camera.
  function farLayer() {
    const L = look(), key = placeKey(levelIndex), bx = view.ox, by = view.oy, bw = view.w * view.k, bh = view.h * view.k, img = art('bg-' + key);
    const b = bounds(), travel = Math.max(1, (b.x1 - b.x0) - view.w) * view.k;
    const groundScreen = toScreen(0, W().bottom - 40).v;
    if (img) {
      const ih = bh * 1.1, iw = img.width * ih / img.height, pf = Math.min(.3, Math.max(0, iw - bw) / travel);
      const x = Math.max(bx + bw - iw, Math.min(bx, bx - cam.x * view.k * pf));
      const horizon = (by + bh * .64) * .7 + groundScreen * .3, y = horizon - L.h0 * ih;
      ctx.fillStyle = EDGE['bg-' + key] || L.sky[0]; ctx.fillRect(bx, by, bw, Math.max(0, y - by) + 2);
      ctx.drawImage(img, x, y, iw, ih);
      if (y + ih < by + bh) { ctx.fillStyle = L.band; ctx.fillRect(bx, y + ih - 1, bw, by + bh - y - ih + 2); }
      if (L.veil) { ctx.fillStyle = L.veil; ctx.fillRect(bx, by, bw, bh); }
    } else {
      const sky = ctx.createLinearGradient(0, by, 0, by + bh); sky.addColorStop(0, L.sky[0]); sky.addColorStop(.62, L.sky[1]); sky.addColorStop(1, L.sky[2]);
      ctx.fillStyle = sky; ctx.fillRect(bx, by, bw, bh);
      const u = view.k, shift = cam.x * u * .12;
      ellipse(bx + bw * .78 - shift * .2, by + bh * .2, 72 * u, 72 * u, L.orb + '80'); ellipse(bx + bw * .78 - shift * .2, by + bh * .2, 48 * u, 48 * u, L.orb);
      if (key === 'summit') ellipse(bx + bw * .78 - shift * .2 - 20 * u, by + bh * .2 - 12 * u, 42 * u, 42 * u, L.sky[0]); // 초승달
      const horizon = (by + bh * .6) * .7 + groundScreen * .3;
      L.far.forEach((color, i) => {
        ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(bx, by + bh);
        for (let x = 0; x <= bw + 30; x += 24 * u) {
          const wx = (x + shift * (1 + i)) / u;
          const hgt = key === 'snow' ? Math.abs(Math.sin(wx / 260 + i * 2)) * 120 + Math.sin(wx / 90) * 12
            : key === 'valley' ? (Math.sin(wx / 300 + i) > .2 ? 80 : 30) + Math.sin(wx / 70) * 6
            : key === 'castle' ? (Math.sin(wx / 160 + i * 3) > .55 ? 110 : 40) + Math.sin(wx / 60) * 4
            : key === 'summit' ? Math.pow(Math.abs(Math.sin(wx / 210 + i * 1.7)), 3) * 150 + Math.sin(wx / 50) * 5
            : Math.sin(wx / 220 + i * 2.3) * 44 + Math.sin(wx / 130 + i) * 13;
          ctx.lineTo(bx + x, horizon - (i ? 30 : 90) * u - hgt * u * .6);
        }
        ctx.lineTo(bx + bw + 30, by + bh); ctx.closePath(); ctx.fill();
      });
      ctx.fillStyle = L.band; ctx.fillRect(bx, horizon, bw, by + bh - horizon);
    }
    // Atmosphere: stars, leaves, mist, snowflakes and fireflies (screen space; cheap).
    const t = renderTime * (reducedMotion.matches ? .2 : 1), mod = (a, m) => ((a % m) + m) % m;
    for (const a of atmosphere) {
      const kind = L.air;
      if (kind === 'glint') {
        // 은빛 별 반짝임(위) + 봉우리 사이를 흐르는 은빛 안개(아래).
        if (a.s > .35) {
          const x = bx + mod(a.x * bw * 1.3 - cam.x * view.k * .05, bw * 1.3), y = by + a.y * bh * .42, r = 1.2 + a.s * 1.4, tw = .5 + .5 * Math.sin(t * 2.4 + a.p);
          ctx.globalAlpha = .35 + .55 * tw; ellipse(x, y, r, r, '#e8fbff');
          if (a.s > .8) { ctx.globalAlpha = .4 * tw; line([[x - 6 * r, y], [x + 6 * r, y]], '#dff6fb', 1); line([[x, y - 6 * r], [x, y + 6 * r]], '#dff6fb', 1); }
        } else {
          const x = bx + mod(a.x * bw * 1.4 + t * 10 - cam.x * view.k * .2, bw * 1.4) - bw * .2, y = by + bh * (.5 + a.y * .3);
          ctx.globalAlpha = .14; ellipse(x, y, 180 * view.k, 22 * view.k, '#d6eef0');
        }
      } else if (kind === 'star') {
        const x = bx + mod(a.x * bw * 1.3 - cam.x * view.k * .05, bw * 1.3), y = by + a.y * bh * .45;
        ctx.globalAlpha = .45 + .45 * Math.sin(t * 2 + a.p); ellipse(x, y, 1.4 + a.s * 1.6, 1.4 + a.s * 1.6, '#fff8d8');
      } else if (kind === 'snow') {
        const x = bx + mod(a.x * bw + Math.sin(t * .8 + a.p) * 20 - cam.x * view.k * .3, bw), y = by + mod(a.y * bh + t * (30 + a.s * 40), bh);
        ctx.globalAlpha = .8; ellipse(x, y, 1.5 + a.s * 2.5, 1.5 + a.s * 2.5, '#ffffff');
      } else if (kind === 'firefly') {
        const x = bx + mod(a.x * bw + Math.sin(t * .5 + a.p) * 40 - cam.x * view.k * .5, bw), y = by + bh * (.45 + a.y * .45) + Math.sin(t * .9 + a.p * 2) * 18;
        ctx.globalAlpha = .35 + .5 * Math.max(0, Math.sin(t * 1.7 + a.p)); ellipse(x, y, 7, 7, '#f4ff9a30'); ellipse(x, y, 2.4, 2.4, '#f4ffb0');
      } else if (kind === 'leaf') {
        const x = bx + mod(a.x * bw + t * (18 + a.s * 20) - cam.x * view.k * .4, bw), y = by + mod(a.y * bh * .8 + t * (22 + a.s * 16), bh * .85);
        ctx.globalAlpha = .7; ctx.save(); ctx.translate(x, y); ctx.rotate(t * 2 + a.p); ellipse(0, 0, 5, 2.4, a.s > .5 ? '#d9a35e' : '#9bb069'); ctx.restore();
      } else if (kind === 'mist') {
        const x = bx + mod(a.x * bw * 1.4 + t * 8 - cam.x * view.k * .2, bw * 1.4) - bw * .2, y = by + bh * (.45 + a.y * .35);
        ctx.globalAlpha = .18; ellipse(x, y, 160 * view.k, 26 * view.k, '#ffffff');
      }
    }
    ctx.globalAlpha = 1;
  }
  // Mid layer: world space, scrolls at half speed, covers the whole field (no seam at any width).
  function midLayer(v) {
    const L = look(), key = placeKey(levelIndex), para = .45, base = 560 + (W().bottom - 574) * .5;
    const left = v.x0 - 80, right = v.x1 + 80;
    const band = (y, color, amp, off) => {
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(left, v.y1 + 40);
      for (let x = left; x <= right + 24; x += 24) { const lx = x - cam.x * para; ctx.lineTo(x, y + Math.sin(lx / 220 + off) * amp + Math.sin(lx / 130 + off) * amp * .3); }
      ctx.lineTo(right + 24, v.y1 + 40); ctx.closePath(); ctx.fill();
    };
    if (!art('bg-' + key)) { band(base - 216, L.far[0] + 'c0', 55, .2); band(base - 145, L.far[1] + 'd0', 40, 2.5); }
    const spacing = key === 'castle' ? 260 : key === 'valley' ? 230 : key === 'summit' ? 280 : 150;
    const i0 = Math.floor((left - cam.x * para) / spacing) - 1, i1 = Math.ceil((right - cam.x * para) / spacing) + 1;
    for (let i = i0; i <= i1; i++) {
      const x = i * spacing + cam.x * para + hash(i) * 40, s = .7 + hash(i + 3) * .6, y = base - 40;
      if (key === 'forest') tree(x, y, 110 * s + 30, L.mid);
      else if (key === 'valley') {
        const h = 120 + hash(i + 9) * 110, w = 70 + hash(i + 4) * 50;
        rounded(x - w / 2, y - h, w, h + 50, 18, L.mid); rounded(x - w / 2 - 4, y - h - 6, w + 8, 20, 10, L.mid2);
        if (hash(i + 11) > .7) { ctx.globalAlpha = .55; rounded(x - 6, y - h + 10, 12, h, 6, '#e8f4ee'); ctx.globalAlpha = 1; }
      } else if (key === 'swamp') {
        line([[x, y + 20], [x - 4, y - 70 * s], [x - 26 * s, y - 100 * s]], L.mid, 9 * s); line([[x - 3, y - 50 * s], [x + 24 * s, y - 82 * s]], L.mid, 6 * s);
        for (let r = 0; r < 3; r++) line([[x + 30 + r * 9, y + 20], [x + 28 + r * 9, y - 22 - r * 6]], L.mid2, 3);
        ellipse(x + 46, y - 26, 3, 9, '#7b5a3a');
      } else if (key === 'snow') {
        for (let k = 0; k < 3; k++) {
          const w = (46 - k * 11) * s, top = y - (40 + k * 34) * s;
          ctx.fillStyle = L.mid; ctx.beginPath(); ctx.moveTo(x - w, top + 44 * s); ctx.lineTo(x, top); ctx.lineTo(x + w, top + 44 * s); ctx.fill();
          ctx.fillStyle = '#f4fafc'; ctx.beginPath(); ctx.moveTo(x - w * .45, top + 18 * s); ctx.lineTo(x, top); ctx.lineTo(x + w * .45, top + 18 * s); ctx.fill();
        }
      } else if (key === 'summit') {
        // 뾰족한 바위 봉우리, 몇 곳 꼭대기에 작은 망루와 불빛.
        const h = 130 + hash(i + 9) * 130, w = 90 + hash(i + 4) * 60;
        ctx.fillStyle = L.mid; ctx.beginPath(); ctx.moveTo(x - w, y + 60); ctx.lineTo(x - w * .35, y - h * .7); ctx.lineTo(x - w * .1, y - h); ctx.lineTo(x + w * .2, y - h * .92); ctx.lineTo(x + w * .45, y - h * .55); ctx.lineTo(x + w, y + 60); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#6f9a8a'; ctx.beginPath(); ctx.moveTo(x - w * .22, y - h * .97); ctx.lineTo(x - w * .1, y - h); ctx.lineTo(x + w * .2, y - h * .92); ctx.lineTo(x + w * .05, y - h * .88); ctx.closePath(); ctx.fill();
        if (hash(i + 13) > .55) {
          const tx = x + w * .04, ty = y - h * .96;
          ctx.fillStyle = '#26444f'; ctx.fillRect(tx - 9, ty - 26, 18, 26);
          ctx.beginPath(); ctx.moveTo(tx - 14, ty - 26); ctx.lineTo(tx, ty - 38); ctx.lineTo(tx + 14, ty - 26); ctx.fill();
          ellipse(tx, ty - 15, 10, 10, '#ffd98a26'); ellipse(tx, ty - 15, 3, 4, '#ffdf96');
        }
      } else if (key === 'castle') {
        const h = 120 + hash(i + 9) * 120, w = 60 + hash(i + 4) * 40;
        ctx.fillStyle = L.mid; ctx.fillRect(x - w / 2, y - h, w, h + 60);
        for (let c = 0; c < 3; c++) ctx.fillRect(x - w / 2 + c * w / 2.5, y - h - 14, w / 5, 14);
        if (hash(i + 13) > .35) { ellipse(x, y - h * .6, 5, 8, '#ffd98a'); ellipse(x, y - h * .6, 12, 14, '#ffd98a22'); }
      }
    }
    band(base - 48, key === 'castle' ? '#4d4572' : key === 'snow' ? '#c9dde6' : key === 'summit' ? '#46717b' : L.mid2, 24, 1.2);
    band(base - 4, key === 'castle' ? '#5d5480' : key === 'snow' ? '#e2eef3' : key === 'swamp' ? '#7c9270' : key === 'summit' ? '#557f86' : '#9ab47a', 12, 4);
  }
  function tree(x, y, size, color) {
    line([[x, y], [x - size * .02, y - size * .65]], '#728a66', size * .055);
    ellipse(x, y - size * .67, size * .26, size * .34, color);
    ellipse(x - size * .18, y - size * .48, size * .22, size * .26, color);
    ellipse(x + size * .18, y - size * .48, size * .22, size * .27, color);
    line([[x, y - size * .15], [x - size * .12, y - size * .45]], '#78916b', size * .018);
  }
  // Per-theme ground palette: soil, grass edge, highlight and pebble colours.
  const THEMES = {
    meadow: { soil: '#c6a878', grass: '#607b49', light: '#9bab62', pebble: '#b4986a', tuft: '#668750' },
    cliff: { soil: '#b79a70', grass: '#6c8450', light: '#a1ae65', pebble: '#a58660', tuft: '#6f8a55' },
    stone: { soil: '#a8a398', grass: '#7a8b72', light: '#a9b79b', pebble: '#8d887e', tuft: '#7e9071' },
    ice: { soil: '#b6cdd2', grass: '#e6f4f4', light: '#ffffff', pebble: '#9bbcc4', tuft: '#c8e6ea' },
    snow: { soil: '#aebfc6', grass: '#f4fafb', light: '#ffffff', pebble: '#93abb4', tuft: '#d5e8ec' },
    swamp: { soil: '#8f8a66', grass: '#55703f', light: '#7f9455', pebble: '#77724f', tuft: '#5d7a45' },
    castle: { soil: '#9d9087', grass: '#6f7c66', light: '#97a58c', pebble: '#85786f', tuft: '#74826b' },
    summit: { soil: '#8aa3a4', grass: '#6f9a8a', light: '#b8d3cf', pebble: '#6f8b8f', tuft: '#8fb5a6' },
  };
  function terrain(v) {
    if (!groundYs) return;
    const ys = groundYs, step = GSTEP, key = placeKey(levelIndex);
    const theme = THEMES[P.LEVELS[levelIndex].theme] || THEMES.meadow;
    const width = W().width, bottom = v.y1 + 40;
    const i0 = Math.max(0, Math.floor(v.x0 / step) - 1), i1 = Math.min(ys.length - 1, Math.ceil(v.x1 / step) + 1);
    const pts = []; for (let i = i0; i <= i1; i++) pts.push([i * step, ys[i]]);
    if (i0 === 0) pts.unshift([v.x0 - 60, ys[0]]);
    if (i1 === ys.length - 1) pts.push([Math.max(width, v.x1 + 60), ys.at(-1)]);
    if (key === 'snow' || key === 'castle' || key === 'summit') {
      const soil = ctx.createLinearGradient(0, 430, 0, Math.max(760, W().bottom + 120)); soil.addColorStop(0, theme.soil); soil.addColorStop(1, key === 'castle' ? '#6f6470' : key === 'summit' ? '#4d6e74' : '#8aa3ad');
      ctx.fillStyle = soil;
    } else ctx.fillStyle = theme.soil;
    ctx.beginPath(); ctx.moveTo(pts[0][0], bottom); for (const [x, y] of pts) ctx.lineTo(x, y); ctx.lineTo(pts.at(-1)[0], bottom); ctx.closePath(); ctx.fill();
    line(pts.map(([x, y]) => [x, y + 6]), theme.light, 11);
    line(pts.map(([x, y]) => [x, y + 1]), theme.grass, key === 'snow' ? 13 : 9);
    const n0 = Math.floor(v.x0 / 37), n1 = Math.ceil(v.x1 / 37);
    for (let n = n0; n <= n1; n++) {
      const x = n * 37 + hash(n) * 20; if (x < 0 || x > width) continue;
      const top = groundY(x);
      if (hash(n + 5) > .55) ellipse(x, top + 22 + hash(n + 2) * Math.max(24, W().bottom + 120 - top - 30), 3 + (n & 3), 2, theme.pebble);
      if (key === 'snow') { if (hash(n + 8) > .7) ellipse(x, top - 2, 9, 4, '#ffffff'); }
      else if (key === 'swamp') { if (hash(n + 8) > .72) { line([[x, top + 2], [x - 2, top - 26]], '#5b7444', 2.4); ellipse(x - 2, top - 26, 2.6, 7, '#7b5a3a'); } }
      else if (key === 'castle') { if (hash(n + 8) > .5) line([[x - 10, top + 14], [x + 10, top + 14]], theme.pebble, 2); }
      else if (key === 'summit') { if (hash(n + 8) > .62) { ellipse(x, top - 1, 7, 3, '#e6f5f2'); } else if (hash(n + 9) > .6) line([[x, top], [x + 3, top - 8], [x + 6, top]], theme.tuft, 2); }
      else line([[x, top], [x + 4, top - 10], [x + 8, top]], theme.tuft, 2);
    }
    // Rock faces make steep steps and cliffs read as solid stone.
    for (let i = Math.max(1, i0); i <= i1; i++) {
      if (Math.abs(ys[i] - ys[i - 1]) < 14) continue;
      const x = i * step, top = Math.min(ys[i], ys[i - 1]), bot = Math.max(ys[i], ys[i - 1]);
      for (let y = top + 14; y < bot; y += 22) line([[x - 16, y], [x + 4, y + 3]], theme.pebble, 3);
      if (key === 'snow') for (let k = 0; k < 3; k++) { ctx.fillStyle = '#e9f8fb'; ctx.beginPath(); ctx.moveTo(x - 14 + k * 9, top + 4); ctx.lineTo(x - 10 + k * 9, top + 18 + k * 4); ctx.lineTo(x - 6 + k * 9, top + 4); ctx.fill(); }
    }
    if (key === 'forest') for (const x of [350, 1140, 420]) {
      if (!inView(v, x, 560, 40)) continue;
      const gy = groundY(x) - 6;
      line([[x, gy], [x, gy - 14]], '#65834f', 2); ellipse(x, gy - 18, 5, 5, '#fff0b8'); ellipse(x + 4, gy - 15, 4, 4, '#e6b36a');
    }
  }
  function nearProps(v) {
    const s = S(), ox = s.x - P.SLING.x, oy = s.y - P.SLING.y, key = placeKey(levelIndex);
    if (inView(v, 40 + ox, 450 + oy, 160)) {
      if (key === 'snow') {
        for (let k = 0; k < 4; k++) {
          const w = 70 - k * 14, top = 470 + oy - k * 50;
          ctx.fillStyle = '#4f7380'; ctx.beginPath(); ctx.moveTo(40 + ox - w, top + 60); ctx.lineTo(40 + ox, top); ctx.lineTo(40 + ox + w, top + 60); ctx.fill();
          ctx.fillStyle = '#f6fbfc'; ctx.beginPath(); ctx.moveTo(40 + ox - w * .5, top + 24); ctx.lineTo(40 + ox, top); ctx.lineTo(40 + ox + w * .5, top + 24); ctx.fill();
        }
      } else if (key === 'summit') {
        ctx.fillStyle = '#2c4f5a'; ctx.beginPath(); ctx.moveTo(-10 + ox, 575 + oy); ctx.lineTo(18 + ox, 430 + oy); ctx.lineTo(44 + ox, 400 + oy); ctx.lineTo(70 + ox, 450 + oy); ctx.lineTo(88 + ox, 575 + oy); ctx.closePath(); ctx.fill();
        line([[26 + ox, 424 + oy], [44 + ox, 400 + oy], [60 + ox, 430 + oy]], '#9cc3bb', 4);
        line([[44 + ox, 400 + oy], [44 + ox, 372 + oy]], '#2c4f5a', 3); ellipse(44 + ox, 368 + oy, 12, 12, '#ffe7a630'); ellipse(44 + ox, 368 + oy, 4, 5, '#ffe7a6');
      } else if (key === 'castle') { rounded(30 + ox, 420 + oy, 14, 150, 4, '#3e3a52'); ellipse(37 + ox, 412 + oy, 16, 16, '#ffd98a40'); ellipse(37 + ox, 412 + oy, 8, 9, '#ffe7a6'); }
      else if (key === 'swamp') { line([[40 + ox, 572 + oy], [44 + ox, 430 + oy], [12 + ox, 392 + oy]], '#56664f', 18); line([[44 + ox, 470 + oy], [86 + ox, 430 + oy]], '#56664f', 10); }
      else tree(40 + ox, 570 + oy, 240, key === 'valley' ? '#6f8f52' : '#537c59');
    }
    const w = W().width;
    if (key === 'forest' && groundY(w - 35) >= W().bottom - 1 && inView(v, w - 35, 470, 120)) tree(w - 35, 575, 205, '#63875d');
    // The team's little supply cart.
    if (inView(v, 100 + ox, 540 + oy, 80)) {
      rounded(55 + ox, 523 + oy, 88, 40, 6, '#a37949'); line([[60 + ox, 538 + oy], [138 + ox, 538 + oy]], '#795936', 3);
      ellipse(74 + ox, 564 + oy, 10, 10, '#52654b'); ellipse(124 + ox, 564 + oy, 10, 10, '#52654b');
    }
  }
  function acorn(x, y, r, type = 'seed', rotation = 0) {
    ctx.save(); ctx.translate(x, y);
    const grow = Math.min(2, Math.max(1, 14 / (2 * r * cam.z * view.k))); // at least 14px across on screen
    if (grow > 1) ctx.scale(grow, grow);
    ctx.rotate(rotation);
    const img = art('acorn-' + type);
    if (img) { const size = r * 5.03; ctx.drawImage(img, -size / 2, -size / 2, size, size); ctx.restore(); return; }
    const colors = type === 'bomb' ? ['#d88648', '#734e37'] : type === 'split' ? ['#81b39a', '#3e7965'] : ['#d9a263', '#876044'];
    ellipse(0, 2, r, r * 1.02, colors[0]);
    ctx.fillStyle = colors[1]; ctx.beginPath(); ctx.ellipse(0, -r * .43, r * 1.08, r * .6, 0, Math.PI, Math.PI * 2); ctx.lineTo(r, -r * .05); ctx.quadraticCurveTo(0, r * .3, -r, -r * .05); ctx.closePath(); ctx.fill();
    line([[-r * .2, -r], [0, -r * 1.28], [r * .24, -r * 1.2]], '#5c6443', r * .18);
    if (type === 'split') { ellipse(r * .35, -r * 1.25, r * .4, r * .14, '#6a9a61'); }
    if (type === 'bomb') { ellipse(r * .25, -r * 1.3, 4, 4, '#ffd16b'); }
    ellipse(-r * .28, r * .1, r * .09, r * .13, '#302c25'); ellipse(r * .3, r * .1, r * .09, r * .13, '#302c25');
    line([[-r * .13, r * .43], [0, r * .49], [r * .15, r * .42]], '#785134', 2);
    ellipse(-r * .47, r * .35, r * .15, r * .08, '#eaba8b'); ctx.restore();
  }
  function creature(b) {
    const { x, y } = b.position, g = b.game;
    const seen = hpSeen.get(b);
    if (seen != null && g.hp < seen - .01) hurtAt.set(b, renderTime);
    hpSeen.set(b, g.hp);
    const hurt = renderTime - (hurtAt.get(b) ?? -9) < .7 || g.hp < g.maxHp * .45;
    const hop = taunt > renderTime && !hurt ? -Math.abs(Math.sin((taunt - renderTime) * 9)) * 7 : 0;
    ctx.save(); ctx.translate(x, y + hop);
    // Zoomed far out (wide stages, small phones) an enemy is drawn at least 18px across so it stays readable.
    const grow = Math.min(2.2, Math.max(1, 18 / (44 * cam.z * view.k)));
    if (grow > 1) ctx.scale(grow, grow);
    ctx.rotate(b.angle);
    if (look().night) ellipse(0, -6, 40, 40, '#fff4d824');
    ellipse(0, 20, 24, 6, '#304a3528');
    const img = art(hurt ? 'goblin-hurt' : 'goblin') || (hurt ? art('goblin') : null);
    if (img) {
      const size = 70, breathe = 1 + Math.sin(renderTime * 2.4 + x * .01) * .025;
      ctx.scale(1 / breathe, breathe); ctx.drawImage(img, -size / 2, 23.4 - size, size, size); ctx.restore(); return;
    }
    ctx.fillStyle = '#806b9d'; ctx.beginPath(); ctx.moveTo(-21, -4); ctx.lineTo(-19, -32); ctx.lineTo(-4, -19); ctx.lineTo(9, -21); ctx.lineTo(21, -32); ctx.lineTo(21, 0); ctx.fill();
    ellipse(0, 0, 23, 23, '#9c89b4'); ellipse(-7, 3, 10, 11, '#e6d7d5'); ellipse(8, 3, 10, 11, '#e6d7d5');
    if (hurt) { line([[-10, -1], [-4, 5]], '#3e3448', 2.5); line([[-10, 5], [-4, -1]], '#3e3448', 2.5); line([[5, -1], [11, 5]], '#3e3448', 2.5); line([[5, 5], [11, -1]], '#3e3448', 2.5); ellipse(1, 13, 5, 4, '#65516c'); }
    else {
      const blink = (renderTime + x * .013) % 3.4 < .12;
      ellipse(-6, 2, 2.5, blink ? .6 : 4, '#3e3448'); ellipse(9, 2, 2.5, blink ? .6 : 4, '#3e3448');
      ellipse(1, 11, 4, 3, '#65516c');
    }
    line([[-12, -7], [-4, -5]], '#544563', 3); line([[6, -5], [14, -8]], '#544563', 3);
    if (g.hp < g.maxHp * .6) { line([[-17, -13], [-12, -9], [-18, -5]], '#564a62', 2); }
    ctx.restore();
  }
  function drawBlock(b) {
    const { w, h, material, hp, maxHp } = b.game, m = P.MATERIAL[material], key = placeKey(levelIndex);
    ctx.save(); ctx.translate(b.position.x, b.position.y); ctx.rotate(b.angle);
    if (look().night) rounded(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4, 4, '#fff4d855');
    const edge = material === 'ice' && key === 'snow' ? '#2f7783' : m.edge;
    if (material === 'resin') {
      // Resin barrel: staves, hoops and a glowing bung.
      rounded(-w / 2, -h / 2, w, h, 9, m.edge); rounded(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4, 8, m.color);
      for (const yy of [-h * .3, h * .3]) line([[-w / 2 + 1, yy], [w / 2 - 1, yy]], '#4a2e1a', 4);
      line([[-w * .18, -h / 2 + 4], [-w * .18, h / 2 - 4]], '#a96a2f', 2); line([[w * .18, -h / 2 + 4], [w * .18, h / 2 - 4]], '#a96a2f', 2);
      ellipse(0, 0, w * .2, h * .12, '#ffd77a'); ellipse(0, 0, w * .32, h * .2, '#ffd77a30');
    } else {
      rounded(-w / 2, -h / 2, w, h, 3, edge); rounded(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4, 2, m.color);
      if (material === 'wood') {
        line([[-w / 2 + 5, -h / 2 + 5], [w / 2 - 5, h / 2 - 5]], '#e3b77b', 2);
        for (const sign of [-1, 1]) ellipse(w > h ? sign * (w / 2 - 9) : 0, h > w ? sign * (h / 2 - 10) : 0, 2, 2, '#755338');
      } else if (material === 'ice') { line([[-w / 2 + 4, h / 2 - 3], [w / 2 - 4, -h / 2 + 3]], '#eafff2', 3); }
      else { line([[-w / 2 + 3, -h / 2 + 4], [w / 2 - 4, -h / 2 + 4]], '#c2c9bd', 2); }
    }
    if (hp < maxHp * .7) line([[-w * .25, -h / 2], [w * .15, -h * .1], [-w * .1, h * .2], [w * .3, h / 2]], edge, 2);
    ctx.restore();
  }
  // Terrain extras: floating islands, cave roof, water and pits.
  const PLATFORM_LOOK = { moss: ['#7c6a4c', '#6f8f4e'], wood: ['#8a6038', '#b3804a'], stone: ['#7d8580', '#a4aca6'], ice: ['#7fb3bd', '#d6f1f3'] };
  function drawTerrainExtras(front, v) {
    const t = terr, w = W();
    if (front) {
      for (const z of t.water) {
        if (z.x1 < v.x0 || z.x0 > v.x1) continue;
        const bottom = groundY((z.x0 + z.x1) / 2) + 12, depth = Math.max(30, bottom - z.y);
        const g = ctx.createLinearGradient(0, z.y, 0, z.y + depth);
        if (z.pit) { g.addColorStop(0, '#2a3a3300'); g.addColorStop(.35, '#20302acc'); g.addColorStop(1, '#141e1aee'); }
        else { g.addColorStop(0, look().night ? '#5a6f9acc' : '#5fa3aab0'); g.addColorStop(1, look().night ? '#2b3557ee' : '#2f6d75dd'); }
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(z.x0, z.y + depth);
        for (let x = z.x0; x <= z.x1; x += 16) ctx.lineTo(x, z.y + (z.pit ? 0 : Math.sin(x / 38 + renderTime * 2.2) * 2.4));
        ctx.lineTo(z.x1, z.y + depth); ctx.closePath(); ctx.fill();
        if (!z.pit) {
          const pts = []; for (let x = z.x0; x <= z.x1; x += 16) pts.push([x, z.y + Math.sin(x / 38 + renderTime * 2.2) * 2.4]);
          line(pts, '#d8f4f2', 3);
          ctx.globalAlpha = .45; for (let x = z.x0 + 30; x < z.x1 - 30; x += 90) line([[x + Math.sin(renderTime + x) * 8, z.y + 14], [x + 34 + Math.sin(renderTime + x) * 8, z.y + 14]], '#e9fbfa', 2); ctx.globalAlpha = 1;
        }
      }
      return;
    }
    if (t.roof && t.roof.at(-1)[0] > v.x0 && t.roof[0][0] < v.x1) {
      const g = ctx.createLinearGradient(0, w.top - 60, 0, Math.max(...t.roof.map(p => p[1])));
      g.addColorStop(0, '#4a4842'); g.addColorStop(1, '#77736a');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(t.roof[0][0], v.y0 - 60);
      for (const [x, y] of t.roof) ctx.lineTo(x, y);
      ctx.lineTo(t.roof.at(-1)[0], v.y0 - 60); ctx.closePath(); ctx.fill();
      line(t.roof.map(([x, y]) => [x, y - 3]), '#4c4a45', 6);
      for (let x = t.roof[0][0] + 24; x < t.roof.at(-1)[0] - 10; x += 46) {
        const y = t.roofAt(x); if (y == null) continue; const l = 10 + hash(x) * 14;
        ctx.fillStyle = '#5f5c55'; ctx.beginPath(); ctx.moveTo(x - 7, y - 2); ctx.lineTo(x, y + l); ctx.lineTo(x + 7, y - 2); ctx.fill();
      }
    }
    for (const p of t.platforms) {
      if (p.x1 < v.x0 || p.x0 > v.x1) continue;
      const [edge, top] = PLATFORM_LOOK[p.look] || PLATFORM_LOOK.moss;
      if (p.look === 'moss') {
        ellipse(p.x, p.y + p.h, p.w / 2 - 6, Math.min(20, p.h * .8), edge);
        for (let k = 0; k < 4; k++) line([[p.x0 + 20 + k * (p.w - 40) / 3, p.y + p.h], [p.x0 + 16 + k * (p.w - 40) / 3, p.y + p.h + 14 + hash(k + p.x) * 10]], '#5e7a3e', 2);
      }
      rounded(p.x0, p.y, p.w, p.h, 6, edge); rounded(p.x0, p.y, p.w, Math.min(9, p.h), 5, top);
      if (p.look === 'wood') for (let x = p.x0 + 24; x < p.x1 - 8; x += 34) { line([[x, p.y + 4], [x, p.y + p.h - 3]], '#6b4628', 2); ellipse(x - 12, p.y + p.h / 2 + 2, 1.6, 1.6, '#3f2a18'); }
      if (p.look === 'stone') for (let x = p.x0 + 30; x < p.x1 - 8; x += 40) line([[x, p.y + 9], [x, p.y + p.h - 2]], '#5e6662', 2);
      if (p.look === 'ice') { line([[p.x0 + 8, p.y + 5], [p.x0 + p.w * .4, p.y + 5]], '#ffffff', 2); for (let x = p.x0 + 14; x < p.x1 - 6; x += 26) { ctx.fillStyle = '#cdeef2'; ctx.beginPath(); ctx.moveTo(x - 4, p.y + p.h); ctx.lineTo(x, p.y + p.h + 10); ctx.lineTo(x + 4, p.y + p.h); ctx.fill(); } }
    }
  }
  function drawDevices(v) {
    for (const r of sim.state.ropes) {
      if (r.cut) continue;
      const end = { x: r.body.position.x + r.constraint.pointB.x, y: r.body.position.y + r.constraint.pointB.y };
      if (!inView(v, (r.anchor.x + end.x) / 2, (r.anchor.y + end.y) / 2, 260)) continue;
      rounded(r.anchor.x - 10, r.anchor.y - 5, 20, 9, 3, '#4f4a46'); ellipse(r.anchor.x, r.anchor.y + 4, 4, 4, '#8b8278');
      line([[r.anchor.x, r.anchor.y], [end.x, end.y]], '#7a5a34', 4);
      ctx.setLineDash([4, 5]); line([[r.anchor.x, r.anchor.y], [end.x, end.y]], '#d2ae74', 2); ctx.setLineDash([]);
    }
    for (const d of sim.state.devices) {
      const g = d.game, { x, y } = d.position;
      if (!inView(v, x, y, 120)) continue;
      if (g.kind === 'mushroom') {
        const k = renderTime - (squash.get(Math.round(x)) ?? -9), sq = k < .4 ? Math.sin(k / .4 * Math.PI) * (1 - k / .4) * .35 : 0;
        const stemTop = g.base - g.r * .35;
        rounded(x - g.r * .22, stemTop, g.r * .44, g.base - stemTop + 4, 6, '#efe2c4');
        ctx.save(); ctx.translate(x, g.base); ctx.scale(1 + sq * .6, 1 - sq); ctx.translate(-x, -g.base);
        ctx.fillStyle = '#7d2f24'; ctx.beginPath(); ctx.arc(x, y, g.r + 2, Math.PI, Math.PI * 2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#c4523e'; ctx.beginPath(); ctx.arc(x, y, g.r, Math.PI, Math.PI * 2); ctx.closePath(); ctx.fill();
        for (const [dx, dy, rr] of [[-.45, -.45, .14], [.2, -.7, .12], [.5, -.3, .1]]) ellipse(x + dx * g.r, y + dy * g.r, rr * g.r, rr * g.r, '#fbe8cf');
        ctx.restore();
      } else if (g.kind === 'boulder' || g.kind === 'bob') {
        ctx.save(); ctx.translate(x, y); ctx.rotate(d.angle);
        const lk = g.kind === 'bob' ? 'stone' : g.look;
        const [fill, edge] = lk === 'log' ? ['#a8743f', '#6d4426'] : lk === 'snow' ? ['#f4fbfc', '#8fb0b9'] : ['#8f9893', '#5b6461'];
        ellipse(0, 0, g.r, g.r, edge); ellipse(0, 0, g.r - 3, g.r - 3, fill);
        if (lk === 'log') { ellipse(0, 0, g.r * .55, g.r * .55, '#c99a5e'); ellipse(0, 0, g.r * .2, g.r * .2, '#8a5a32'); line([[-g.r * .8, 0], [g.r * .8, 0]], '#8a5a32', 1.5); }
        else if (lk === 'snow') { ellipse(-g.r * .3, -g.r * .3, g.r * .3, g.r * .2, '#ffffff'); ellipse(g.r * .25, g.r * .2, 2, 2, '#c7dde3'); }
        else { line([[-g.r * .5, -g.r * .2], [g.r * .1, g.r * .3], [g.r * .45, g.r * .1]], edge, 2); ellipse(-g.r * .35, -g.r * .4, g.r * .22, g.r * .14, '#7f9a63'); }
        if (g.kind === 'bob') { ctx.strokeStyle = '#3d3a38'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, g.r - 6, 0, Math.PI * 2); ctx.stroke(); }
        ctx.restore();
      } else if (g.kind === 'icicle') {
        const gr = ctx.createLinearGradient(d.bounds.min.x, 0, d.bounds.max.x, 0); gr.addColorStop(0, '#f4fdff'); gr.addColorStop(1, '#a9dde6');
        ctx.fillStyle = gr; ctx.strokeStyle = '#4f99a6'; ctx.lineWidth = 2; ctx.beginPath();
        d.vertices.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }
  }
  // Sling: generated picture when available; size follows the stage's sling power.
  function slingGeometry() {
    const s = S(), scale = 1 + (s.power - 1) * .35, H = 156 * scale, Wd = H * 327 / 512, cx = s.x + 3, bottom = s.y + 140;
    const top = bottom - H;
    return { scale, H, Wd, cx, bottom, top, left: { x: cx - (.5 - .135) * Wd, y: top + .05 * H }, right: { x: cx + (.869 - .5) * Wd, y: top + .05 * H } };
  }
  function sling(front, gm) {
    const img = art('sling');
    if (img) { if (!front) { ellipse(gm.cx, gm.bottom, 48 * gm.scale, 9, '#314b3424'); ctx.drawImage(img, gm.cx - gm.Wd / 2, gm.top, gm.Wd, gm.H); } return; }
    const s = S();
    ctx.save(); ctx.translate(s.x, gm.bottom); ctx.scale(gm.scale, gm.scale); ctx.translate(-205, -572);
    if (!front) {
      ellipse(207, 571, 48, 9, '#314b3420');
      line([[205, 568], [211, 482], [179, 424]], '#644c32', 18);
      line([[205, 566], [211, 483], [179, 426]], '#ba8c52', 10);
    } else {
      line([[210, 490], [232, 421]], '#654a30', 16); line([[210, 485], [232, 423]], '#bd9158', 8);
      for (let y = 483; y < 520; y += 7) line([[201, y], [216, y + 2]], '#d4bb86', 3);
    }
    ctx.restore();
  }
  function slingTips(gm) {
    if (art('sling')) return [gm.left, gm.right];
    const s = S(), f = (x, y) => ({ x: s.x + (x - 205) * gm.scale, y: gm.bottom + (y - 572) * gm.scale });
    return [f(179, 425), f(232, 424)];
  }
  // Predicted path: same per-step integration as the physics (one point per 120 Hz step).
  function predict() {
    const s = S(), x0 = aim.x, y0 = aim.y;
    if (Math.hypot(s.x - x0, s.y - y0) < 8) return { pts: [], hit: null };
    let x = x0, y = y0, vx = (s.x - x) * .225 * s.power, vy = (s.y - y) * .225 * s.power, hit = null;
    const pts = [], bodies = [...sim.state.blocks, ...sim.state.targets, ...sim.state.devices];
    for (let i = 0; i < 1100; i++) {
      vx *= 1 - .0003 * .5; vy = vy * (1 - .0003 * .5) + .1388889;
      x += vx * .5; y += vy * .5;
      if (i % 2 === 0) pts.push({ x, y });
      if (solid(x, y + 14)) { hit = { x, y }; break; }
      if (i > 6 && i % 2 === 0 && bodies.some(b => x > b.bounds.min.x - 16 && x < b.bounds.max.x + 16 && y > b.bounds.min.y - 16 && y < b.bounds.max.y + 16)) { hit = { x, y }; break; }
    }
    // Where the same arc would go past the structures (terrain only, not drawn): tells the camera what is aimed at.
    const ghost = [];
    if (hit && !solid(x, y + 14)) for (let i = 0; i < 1100; i++) {
      vx *= 1 - .0003 * .5; vy = vy * (1 - .0003 * .5) + .1388889;
      x += vx * .5; y += vy * .5;
      if (i % 4 === 0) ghost.push({ x, y });
      if (solid(x, y + 14)) break;
    }
    return { pts, hit, ghost };
  }
  function trajectory(p) {
    // Must read on every sky (bright day, snow, night): a thin path line under bold dots,
    // each dot a bright fill inside an opaque dark rim, sized in screen pixels so zooming out keeps it legible.
    const n = p.pts.length, unit = 1 / Math.min(1, cam.z), night = look().night;
    // Snow and pale skies swallow white dots — there the dots are warm orange inside a navy rim.
    const snowy = placeKey(levelIndex) === 'snow' || P.LEVELS[levelIndex].theme === 'ice';
    const rim = night ? '#1d1838' : snowy ? '#1f2d4a' : '#2f3b2a', fill = night ? '#ffe17a' : snowy ? '#ff8a2a' : '#ffffff';
    if (n > 1) {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const [w, c] of [[6 * unit, rim + (snowy ? 'b0' : '80')], [2.4 * unit, fill + 'cc']]) {
        ctx.lineWidth = w; ctx.strokeStyle = c; ctx.beginPath();
        p.pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.stroke();
      }
    }
    p.pts.forEach((q, i) => {
      if (i % 3) return;
      const t = i / Math.max(1, n), r = (5.6 - t * 1.6) * unit;
      ctx.globalAlpha = 1 - t * .2;
      ellipse(q.x, q.y, r + 2.2 * unit, r + 2.2 * unit, rim);
      ellipse(q.x, q.y, r, r, fill);
    });
    ctx.globalAlpha = 1;
    if (p.hit) {
      ctx.lineWidth = 7 * unit; ctx.strokeStyle = rim; ctx.beginPath(); ctx.arc(p.hit.x, p.hit.y, 16 * unit, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 3.4 * unit; ctx.strokeStyle = night ? '#ffe17a' : '#ffd24a'; ctx.stroke();
    }
  }
  // Upcoming acorns wait in the cart, then on the ground behind it.
  function queueSpots() {
    const s = S(), ox = s.x - P.SLING.x, oy = s.y - P.SLING.y, out = [];
    for (let i = 0; i < 12; i++) {
      if (i < 3) out.push({ x: 77 + ox + i * 22, y: 511 + oy, r: 11 });
      else { const x = 30 + ox - (i - 3) * 26; if (x < 14) break; out.push({ x, y: surface(x, s.y) - 11, r: 11 }); }
    }
    return out;
  }
  function drawQueue() {
    const s = sim.state, ammo = P.LEVELS[levelIndex].ammo, spots = queueSpots();
    const first = s.phase === 'aim' ? s.spent + 1 : s.spent;
    let k = 0;
    for (let i = first; i < ammo.length && k < spots.length; i++, k++) {
      if (bonus && k < bonus.shown) continue;
      const q = spots[k], bob = Math.sin(renderTime * 3 + k) * (k === 0 ? 1.5 : .6);
      acorn(q.x, q.y + bob, q.r, ammo[i]);
    }
  }
  function drawParticle(p, dt, v) {
    if (p.life <= 0) return;
    if (!paused) {
      p.x += p.vx * dt * 60; p.y += p.vy * dt * 60;
      p.vy += dt * (p.dust ? 2 : 20); p.life -= dt;
      if (p.fragment || p.drop) {
        const groundAt = surface(p.x, p.y - 24);
        if (p.y > groundAt - p.size * .25) {
          if (p.drop) p.life = 0;
          p.y = groundAt - p.size * .25; p.vy = p.vy > 1.4 ? p.vy * -.32 : 0;
          p.vx *= Math.exp(-dt * 9); if (p.spin) p.spin *= Math.exp(-dt * 8);
        }
      }
      if (p.fragment) p.rotation += p.spin * dt;
      // Particles are visual only, but must still never leave the playfield.
      const edge = p.dust ? p.size * 1.6 : p.size;
      if (p.x < edge) { p.x = edge; p.vx = Math.abs(p.vx) * .35; }
      else if (p.x > W().width - edge) { p.x = W().width - edge; p.vx = -Math.abs(p.vx) * .35; }
      if (p.y < W().top + edge) { p.y = W().top + edge; p.vy = Math.abs(p.vy) * .2; }
    }
    if (!inView(v, p.x, p.y, 40)) return;
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life / .32));
    if (p.dust) {
      const size = p.size * (1.65 - Math.min(.8, p.life));
      ctx.globalAlpha *= .45; ellipse(p.x, p.y, size, size * .63, p.color);
      return;
    }
    if (p.drop) { ellipse(p.x, p.y, p.size * .8, p.size, p.color); return; }
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rotation);
    const s = p.size;
    if (p.material === 'wood') {
      rounded(-s, -s * .25, s * 2, s * .5, 1, '#855539');
      line([[-s * .85, -s * .1], [s * .84, 0]], '#e8b779', Math.max(1, s * .12));
    } else if (p.material === 'ice' || p.material === 'stone') {
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.moveTo(-s * .6, s * .33); ctx.lineTo(-s * .22, -s * .63);
      ctx.lineTo(s * .58, -s * .23); ctx.lineTo(s * .34, s * .62); ctx.closePath(); ctx.fill();
      line([[-s * .57, s * .31], [-s * .22, -s * .59], [s * .55, -s * .22]], p.material === 'ice' ? '#f2fff8' : '#d4dcd0', 1.4);
    } else rounded(-s / 2, -s / 2, s, s, 2, p.color);
    ctx.restore();
  }
  // A hand shows the first pull of a brand-new player.
  function handGuide() {
    const s = S(), t = (renderTime % 1.8) / 1.8, u = t < .7 ? smooth(t / .7) : 1, a = t > .85 ? 1 - (t - .85) / .15 : 1;
    const x = s.x - 64 * u, y = s.y + 36 * u;
    ctx.globalAlpha = .55 * a; acorn(x, y, 20, 'seed'); ctx.globalAlpha = a;
    ellipse(x + 10, y + 18, 15, 13, '#fbe2c8'); rounded(x + 2, y - 4, 10, 24, 5, '#fbe2c8');
    ctx.strokeStyle = '#8a6a52'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x + 10, y + 18, 15, 13, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // ---- Screen-space overlays: off-screen enemy arrows, minimap strip, labels.
  const hudBottom = () => (view.ch <= 540 ? 58 : 70);
  let mini = null;
  function minimapRect() {
    const b = bounds(), bw = view.w * view.k;
    if ((b.x1 - b.x0) <= view.w * 1.12 && (b.y1 - b.y0) <= view.h * 1.12) return null;
    const w = Math.min(320, bw * .3), h = view.ch <= 540 ? 30 : 38;
    return { x: view.ox + (bw - w) / 2, y: Math.max(view.oy + 6, hudBottom() + 4), w, h, b };
  }
  function minimapHit(l) {
    const m = mini; if (!m || screen !== 'play') return false;
    return !(l.u < m.x - 6 || l.u > m.x + m.w + 6 || l.v < m.y - 8 || l.v > m.y + m.h + 8);
  }
  // A tap (moved < 8px) on the minimap goes there and makes it the spot the next pull keeps in view.
  function minimapGo(l) {
    const m = mini; if (!m) return;
    const wx = m.b.x0 + Math.max(0, Math.min(1, (l.u - m.x) / m.w)) * (m.b.x1 - m.b.x0), wy = m.b.y0 + Math.max(0, Math.min(1, (l.v - m.y) / m.h)) * (m.b.y1 - m.b.y0);
    camMode = 'manual'; manual = clampCam({ z: cam.z, x: wx - view.w / cam.z / 2, y: wy - view.h / cam.z / 2 });
    aimPick = { x: wx, y: Math.min(wy, groundY(wx) - 30) }; updateHUD();
  }
  function drawMinimap() {
    mini = screen === 'play' ? minimapRect() : null;
    const m = mini; if (!m) return;
    const sx = x => m.x + (x - m.b.x0) / (m.b.x1 - m.b.x0) * m.w, sy = y => m.y + (y - m.b.y0) / (m.b.y1 - m.b.y0) * m.h;
    rounded(m.x - 4, m.y - 3, m.w + 8, m.h + 6, 9, look().night ? '#1c1a38b8' : '#fff8e6c8');
    ctx.save(); ctx.beginPath(); ctx.rect(m.x, m.y, m.w, m.h); ctx.clip();
    if (groundYs) {
      ctx.fillStyle = look().night ? '#8d8197' : '#a7b88a'; ctx.beginPath(); ctx.moveTo(m.x, m.y + m.h);
      for (let i = 0; i < groundYs.length; i += 3) ctx.lineTo(sx(i * GSTEP), sy(groundYs[i]));
      ctx.lineTo(m.x + m.w, sy(groundYs.at(-1))); ctx.lineTo(m.x + m.w, m.y + m.h); ctx.closePath(); ctx.fill();
    }
    for (const z of terr.water) { ctx.fillStyle = z.pit ? '#34403a' : '#6fb4bd'; ctx.fillRect(sx(z.x0), sy(z.y), sx(z.x1) - sx(z.x0), m.y + m.h - sy(z.y)); }
    ctx.fillStyle = '#8a6a48'; for (const p of terr.platforms) ctx.fillRect(sx(p.x0), sy(p.y), Math.max(2, sx(p.x1) - sx(p.x0)), 2);
    ctx.fillStyle = '#7a5a3c'; for (const b of sim.state.blocks) ctx.fillRect(sx(b.position.x) - 1, sy(b.position.y) - 1, 2, 2);
    for (const b of sim.state.targets) ellipse(sx(b.position.x), sy(b.position.y), 2.8, 2.8, '#7d4fb0');
    const s = S(); ellipse(sx(s.x), sy(s.y), 3.2, 3.2, '#d17c32');
    for (const b of sim.state.shots) if (b.game.kind === 'shot') ellipse(sx(b.position.x), sy(b.position.y), 2.4, 2.4, '#b8661f');
    ctx.restore();
    const v = visible(); ctx.strokeStyle = look().night ? '#fff3c8' : '#2c5544'; ctx.lineWidth = 1.6;
    const x0 = Math.max(m.x, sx(v.x0)), y0 = Math.max(m.y, sy(v.y0));
    ctx.strokeRect(x0, y0, Math.min(m.x + m.w, sx(v.x1)) - x0, Math.min(m.y + m.h, sy(v.y1)) - y0);
  }
  function drawArrows() {
    if (screen !== 'play' || !sim) return;
    const v = visible(-10), bx = view.ox, by = view.oy, bw = view.w * view.k, bh = view.h * view.k;
    const top = Math.max(by, hudBottom() + (mini ? mini.h + 12 : 0)) + 24, bottom = by + bh - (view.ch <= 540 ? 66 : 84), left = bx + 26, right = bx + bw - 26;
    const marks = [];
    for (const b of sim.state.targets) {
      if (inView(v, b.position.x, b.position.y)) continue;
      const p = toScreen(b.position.x, b.position.y), cx = Math.max(left, Math.min(right, p.u)), cy = Math.max(top, Math.min(bottom, p.v));
      const near = marks.find(m => Math.hypot(m.x - cx, m.y - cy) < 46);
      if (near) near.n++; else marks.push({ x: cx, y: cy, a: Math.atan2(p.v - cy, p.u - cx), n: 1 });
    }
    for (const m of marks) {
      const pulse = 1 + Math.sin(renderTime * 4) * .06;
      ctx.save(); ctx.translate(m.x, m.y); ctx.scale(pulse, pulse);
      ctx.save(); ctx.rotate(m.a); ctx.fillStyle = '#5b3f86'; ctx.beginPath(); ctx.moveTo(26, 0); ctx.lineTo(13, -9); ctx.lineTo(13, 9); ctx.fill(); ctx.restore();
      ellipse(0, 0, 15, 15, '#fff8e8'); ellipse(0, 1, 11, 11, '#9c89b4');
      ellipse(-4, 1, 2.6, 3.2, '#fff'); ellipse(4, 1, 2.6, 3.2, '#fff'); ellipse(-4, 1.5, 1.2, 1.6, '#3e3448'); ellipse(4, 1.5, 1.2, 1.6, '#3e3448');
      if (m.n > 1) { ellipse(12, -11, 9, 9, '#d17c32'); ctx.fillStyle = '#fff'; ctx.font = '800 12px Pretendard, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(m.n), 12, -10.5); ctx.textBaseline = 'alphabetic'; }
      ctx.restore();
    }
  }
  function drawTexts(dt) {
    const fs = view.ch <= 540 ? 15 : 20;
    ctx.font = `900 ${fs}px Pretendard, sans-serif`; ctx.textAlign = 'center'; ctx.lineWidth = 4;
    const bx = view.ox, by = view.oy, bw = view.w * view.k, bh = view.h * view.k;
    for (const t of texts) {
      if (!paused) { t.y -= dt * 32; t.life -= dt; }
      const p = toScreen(t.x, t.y), x = Math.max(bx + 50, Math.min(bx + bw - 50, p.u)), y = Math.max(by + hudBottom() + 20, Math.min(by + bh - 70, p.v));
      ctx.globalAlpha = Math.max(0, Math.min(1, t.life)); ctx.fillStyle = '#fff8dd'; ctx.strokeStyle = '#496547';
      ctx.strokeText(t.text, x, y); ctx.fillText(t.text, x, y);
    }
    ctx.globalAlpha = 1; texts = texts.filter(t => t.life > 0);
    if (chainLabel && screen === 'play') {
      if (!paused) chainLabel.life -= dt;
      if (chainLabel.life <= 0) chainLabel = null;
      else {
        const cx = bx + bw / 2, cy = hudBottom() + (mini ? mini.h + 34 : 30), w = fs * 9.5;
        ctx.globalAlpha = Math.min(1, chainLabel.life * 4);
        rounded(cx - w / 2, cy - fs * 1.1, w, fs * 1.9, fs, '#274539');
        ctx.fillStyle = '#fff0aa'; ctx.fillText(chainLabel.text, cx, cy + fs * .3); ctx.globalAlpha = 1;
      }
    }
    if (screen === 'play' && sim.state.phase === 'aim' && !dragging && !keyAim && !survey) {
      const s = toScreen(S().x, S().y - 70), size = view.ch <= 540 ? 13 : 15;
      ctx.font = `800 ${size}px Pretendard, sans-serif`; ctx.fillStyle = look().night ? '#fff3c8' : '#2f5544';
      ctx.fillText('← 뒤로 당겨요', s.u, s.v + Math.sin(renderTime * 3) * 4);
    }
  }

  // ---- Frame
  function draw(dt) {
    measure();
    const dpr = Math.min(win.devicePixelRatio || 1, 2), width = Math.round(view.cw * dpr), height = Math.round(view.ch * dpr);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    preview = sim && screen === 'play' && (dragging || keyAim) && sim.state.phase === 'aim' ? predict() : null;
    updateCamera(dt);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = look().night ? '#24223f' : '#d6e7cf'; ctx.fillRect(0, 0, view.cw, view.ch);
    ctx.save(); ctx.beginPath(); ctx.rect(view.ox, view.oy, view.w * view.k, view.h * view.k); ctx.clip();
    farLayer();
    const s = dpr * view.k * cam.z;
    let shx = 0, shy = 0;
    if (shake > .1 && !paused) { if (!reducedMotion.matches) { shx = Math.sin(renderTime * 81) * shake; shy = Math.cos(renderTime * 95) * shake * .5; } shake *= Math.exp(-dt * 8); }
    ctx.setTransform(s, 0, 0, s, dpr * view.ox - cam.x * s + shx * s, dpr * view.oy - cam.y * s + shy * s);
    const v = visible(60);
    midLayer(v); terrain(v); nearProps(v);
    const gm = slingGeometry();
    if (sim) {
      drawTerrainExtras(false, v);
      drawDevices(v);
      for (const b of sim.state.blocks) if (inView(v, b.position.x, b.position.y, 90)) drawBlock(b);
      for (const b of sim.state.targets) if (inView(v, b.position.x, b.position.y, 60)) creature(b);
      prevTrails.forEach((tr, k) => { for (const p of tr) ellipse(p.x, p.y, 2.2, 2.2, k ? '#fff6df40' : '#fff6df78'); });
      for (const p of trail) ellipse(p.x, p.y, 2.6, 2.6, '#fff6dfb0');
      for (const b of sim.state.shots) if (inView(v, b.position.x, b.position.y, 60)) acorn(b.position.x, b.position.y, b.game.radius, b.game.ammo, b.angle);
      drawTerrainExtras(true, v);
      if (screen !== 'menu') drawQueue();
    }
    sling(false, gm);
    const ready = !sim || sim.state.phase === 'aim';
    let pos = ready && screen === 'play' ? aim : S();
    const s0 = S(), pulled = Math.hypot(pos.x - s0.x, pos.y - s0.y) / P.MAX_PULL;
    if (pulled > .96 && dragging && !reducedMotion.matches) pos = { x: pos.x + Math.sin(renderTime * 70) * 1.2, y: pos.y + Math.cos(renderTime * 63) * 1.2 };
    const [tipL, tipR] = slingTips(gm), bandColor = pulled > .9 ? '#8f3f2c' : pulled > .5 ? '#734232' : '#5f4536', bandW = 6 + pulled * 2.5;
    line([[tipL.x, tipL.y], [pos.x - 8, pos.y + 4]], bandColor, bandW);
    if (ready) rounded(pos.x - 14, pos.y - 2, 22, 16, 6, '#6a4630');
    if (ready || screen === 'menu') acorn(pos.x, pos.y, 20, sim && screen === 'play' ? P.LEVELS[levelIndex].ammo[sim.state.spent] : 'seed');
    line([[tipR.x, tipR.y], [pos.x + 6, pos.y + 4]], bandColor, bandW);
    sling(true, gm);
    if (preview && !paused) { trajectory(preview); ellipse(aim.x, aim.y, 26, 26, '#fff6df20'); }
    if (screen === 'play' && ready && !dragging && !keyAim && !survey && !everPulled && sim.state.spent === 0 && record.stars.every(x => !x)) handGuide();
    if (particles.length > 280) particles.splice(0, particles.length - 280);
    for (const p of particles) drawParticle(p, dt, v);
    ctx.globalAlpha = 1; particles = particles.filter(p => p.life > 0);
    for (const r of rings) {
      if (!paused) r.life -= dt;
      if (r.life <= 0) continue;
      const t = r.life / r.duration, radius = 7 + (1 - t * t) * r.radius;
      ctx.globalAlpha = t * .8; ctx.strokeStyle = r.color; ctx.lineWidth = 1 + t * 5;
      ctx.beginPath(); ctx.ellipse(r.x, r.y, radius, radius * r.flat, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1; rings = rings.filter(r => r.life > 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawMinimap(); drawArrows(); drawTexts(dt);
    ctx.restore();
  }
  function updateBonus() {
    if (!bonus || paused || renderTime < bonus.at || bonus.shown >= bonus.count) return;
    const q = queueSpots()[bonus.shown];
    if (q) { texts.push({ x: q.x, y: q.y - 20, text: '+1,000', life: .9 }); burst(q.x, q.y, '#ffd98a', 10); }
    tone(660 + bonus.shown * 110, .12, 'triangle', .045, 1.2);
    bonus.shown++; bonus.at = renderTime + .3;
  }
  // Frame timing (read-only diagnostics): work = step + draw time, gap = time between frames.
  const perf = { work: [], gap: [] };
  const perfPush = (a, v) => { a.push(v); if (a.length > 1800) a.shift(); };
  const perfSum = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return { n: a.length, avg: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2), p95: +s[Math.floor(s.length * .95)].toFixed(2), max: +s.at(-1).toFixed(2) }; };
  let hudElapsed = 0, trailElapsed = 0;
  function frame(t) {
    const dt = Math.min(.05, (t - (last || t)) / 1000); last = t;
    const w0 = now();
    if (!paused) renderTime += dt;
    if (screen === 'play' && !paused && sim.state.phase !== 'aim') {
      // Physics runs only while a shot is out: aiming and the opening look-around never move the
      // structures, so a shot plays out exactly like the stored solutions (launched right at reload).
      const frozen = reducedMotion.matches ? 0 : Math.min(dt, hitStop);
      hitStop = reducedMotion.matches ? 0 : hitStop - frozen;
      accumulator += (dt - frozen) * 1000;
      while (accumulator >= P.STEP && hitStop <= 0 && screen === 'play' && sim.state.phase === 'flight') {
        sim.step(); accumulator -= P.STEP;
        if (hitStop > 0) accumulator %= P.STEP;
      }
      if (sim.state.phase !== 'flight') accumulator = 0;
      trailElapsed += dt;
      if (sim.state.active && trailElapsed > .05) { trail.push({ ...sim.state.active.position }); if (trail.length > 90) trail.shift(); trailElapsed = 0; }
    } else accumulator = 0;
    if (screen === 'result') updateBonus();
    if (pendingResult && renderTime >= pendingResult.at && !paused) showResult();
    if (hintUntil && renderTime > hintUntil) { hintUntil = 0; $('rot-hint').hidden = true; }
    hudElapsed += dt; if (hudElapsed > .1) { updateHUD(); hudElapsed = 0; }
    draw(dt);
    if (screen === 'play' || screen === 'result') { perfPush(perf.work, now() - w0); perfPush(perf.gap, dt * 1000); }
    requestAnimationFrame(frame);
  }
  if (typeof setInterval === 'function') setInterval(layout, 500);
  // Read-only diagnostics for browser smoke tests, without gameplay mutation hooks.
  window.AcornGame = {
    snapshot: () => ({ screen, paused, level: levelIndex, place: placeKey(levelIndex), phase: sim?.state.phase, score: sim?.state.score, remaining: sim?.state.targets.length, spent: sim?.state.spent, shot: sim?.state.active ? { ...sim.state.active.position } : null, shotVel: sim?.state.active ? { ...sim.state.active.velocity } : null, shotTime: sim?.state.shotTime, abilityUsed: sim?.state.abilityUsed, lastAim, dragging, aim: { ...aim }, preview: preview ? { n: preview.pts.length, hit: preview.hit } : null, camera: { ...cam, mode: camMode, survey: !!survey }, view: { ...view }, rotated, effects: { chain, particles: particles.length, shockwaves: rings.length }, art: Object.fromEntries(Object.entries(ART).map(([k, v]) => [k, v ? 'ok' : v === false ? 'failed' : 'loading'])) }),
    toScreen: (x, y) => { const p = toScreen(x, y); if (rotated) return { x: rotW - p.v, y: p.u }; const r = canvas.getBoundingClientRect(); return { x: r.left + p.u, y: r.top + p.v }; },
    sling: () => ({ ...S() }),
    perf: () => ({ work: perfSum(perf.work), gap: perfSum(perf.gap), long: perf.gap.filter(g => g > 33.4).length }),
    perfReset: () => { perf.work = []; perf.gap = []; },
  };
  sim = P.create(0); loadTerrain(); setAtmosphere(); layout(); updateLevels(); send('hk:ready'); requestAnimationFrame(frame);
})();
