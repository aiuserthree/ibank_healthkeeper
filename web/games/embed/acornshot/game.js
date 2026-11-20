/* Original canvas art + local Matter.js; no network assets or account data. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  if (!window.AcornPhysics) { $('loading-error').hidden = false; return; }
  const P = window.AcornPhysics, canvas = $('world'), ctx = canvas.getContext('2d');
  const EMBED = new URLSearchParams(location.search).get('hk') === '1' && parent !== window;
  const SAVE = 'acornshot.v1';
  let record = { best: Array(8).fill(0), stars: Array(8).fill(0) }, saveAvailable = true;
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE));
    if (saved) for (const k of ['best', 'stars']) record[k] = Array.from({ length: 8 }, (_, i) => Number.isInteger(saved[k]?.[i]) ? Math.max(0, Math.min(k === 'best' ? P.SCORE_MAX : 3, saved[k][i])) : 0);
  } catch (_) { saveAvailable = false; }
  let sim, levelIndex = 0, screen = 'menu', paused = false, dragging = false, pointer = null;
  let aim = { x: P.SLING.x, y: P.SLING.y }, angle = 27, power = 78;
  let particles = [], texts = [], rings = [], trail = [], shake = 0, last = 0, accumulator = 0, renderTime = 0;
  let lastCrashSound = -Infinity;
  let hitStop = 0, chain = 0, chainLabel = null;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let audio, sound = false, keyAim = false;
  let runOpen = false, runBest = 0, lastLive = -1;
  const send = (type, extras = {}) => { if (EMBED) parent.postMessage({ type, ...extras }, location.origin); };
  function publishLiveScore() {
    const score = Math.max(runBest, sim.state.score);
    if (runOpen && score !== lastLive) {
      lastLive = score;
      send('hk:live', { score });
    }
  }
  function submitRun() {
    if (!runOpen) return;
    runOpen = false;
    send('hk:score', { score: Math.max(runBest, sim.state.score) });
  }
  function tone(freq, duration = .12, type = 'sine', volume = .045) {
    if (!sound || paused) return;
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, audio.currentTime); o.frequency.exponentialRampToValueAtTime(freq * .55, audio.currentTime + duration);
      g.gain.setValueAtTime(volume, audio.currentTime); g.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration);
      o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + duration);
    } catch (_) { sound = false; }
  }
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
  function dust(x, y, count, spread) {
    for (let i = 0; i < (reducedMotion.matches ? Math.ceil(count / 3) : count); i++) {
      const side = i % 2 ? 1 : -1;
      particles.push({ x: x + side * Math.random() * 18, y, vx: side * (1 + Math.random() * spread), vy: -Math.random() * 2,
        life: .35 + Math.random() * .45, color: i % 3 ? '#e5c797' : '#fff2cf', size: 7 + Math.random() * 14, dust: true });
    }
  }
  function onEvent(e) {
    if (e.type === 'hit') {
      shock(e.x, e.y, 68 + e.energy * 2, '#fff6c7', .25);
      debris({ ...e, color: '#fff1bc' }, 12, 9);
      shake = Math.max(shake, Math.min(15, e.energy));
      if (!reducedMotion.matches) hitStop = .046;
      tone(145, .14, 'triangle', .07);
    }
    if (e.type === 'buckling') {
      dust(e.x - 53, e.y + 9, 6, 3); dust(e.x + 53, e.y + 9, 6, 3);
      tone(225, .12, 'triangle', .025);
    }
    if (e.type === 'break') {
      if (e.target) {
        burst(e.x, e.y, e.color, 15); shock(e.x, e.y, 43, '#eed4fc', .26);
        texts.push({ x: e.x, y: e.y - 10, text: '+1,000', life: .95 });
      } else {
        debris(e, 15, 13); dust(e.x, e.y, 5, 4);
        if (++chain >= 3) chainLabel = { text: `연쇄 붕괴 ×${chain}`, life: 1.05 };
      }
      shake = Math.max(shake, e.target ? 7 : 4);
      tone(e.target ? 700 : 180, .1, e.target ? 'sine' : 'triangle');
    }
    if (e.type === 'blast') {
      shock(e.x, e.y, 165, '#ffdb79', .46); shock(e.x, e.y, 96, '#fff3bb', .27);
      dust(e.x, e.y, 16, 8); debris({ ...e, color: '#f7bb4a' }, 26, 16); shake = 17;
      if (!reducedMotion.matches) hitStop = .055;
      tone(90, .4, 'sawtooth');
    }
    if (e.type === 'crash') {
      const big = e.energy >= 18;
      debris(e, big ? 12 : 6, e.energy * .54); dust(e.x, e.y + 8, big ? 14 : 6, e.energy * .27);
      if (big) shock(e.x, e.y + 8, 40 + e.energy * 2.1, '#fff1cf', .32, .36);
      shake = Math.max(shake, Math.min(17, e.energy * .48));
      if (sim.state.time - lastCrashSound > 85) { lastCrashSound = sim.state.time; tone(big ? 90 : 135, .18, 'triangle', big ? .08 : .04); }
    }
    if (e.type === 'launch') { chain = 0; chainLabel = null; }
    if (e.type === 'launch' || e.type === 'split') tone(460, .18, 'triangle');
    if (e.type === 'reload') { aim = { ...P.SLING }; trail = []; keyAim = false; }
    if (e.type === 'finish') finish(e);
  }
  function save() {
    try { localStorage.setItem(SAVE, JSON.stringify(record)); }
    catch (_) { saveAvailable = false; }
  }
  function updateLevels() {
    $('levels').replaceChildren();
    P.LEVELS.forEach((level, i) => {
      const button = document.createElement('button'); button.className = 'level-button';
      button.disabled = i > 0 && record.stars[i - 1] === 0;
      button.innerHTML = `${button.disabled ? '·' : i + 1}<small>${'★'.repeat(record.stars[i])}${'☆'.repeat(3 - record.stars[i])}</small>`;
      button.setAttribute('aria-label', `${i + 1}. ${level.name}${button.disabled ? ', 이전 단계 완료 후 열림' : `, 별 ${record.stars[i]}개`}`);
      button.onclick = () => start(i); $('levels').append(button);
    });
    if (!saveAvailable) $('save-note').textContent = '브라우저 저장소를 사용할 수 없어 이번 창에서만 기록을 보관해요.';
  }
  function cancelDrag() { dragging = false; pointer = null; aim = { ...P.SLING }; keyAim = false; }
  function start(index) {
    sim?.dispose(); levelIndex = index;
    sim = P.create(index, onEvent); screen = 'play'; paused = false; cancelDrag();
    particles = []; rings = []; texts = []; trail = []; accumulator = 0; angle = 27; power = 78;
    lastCrashSound = -Infinity; shake = 0; hitStop = 0; chain = 0; chainLabel = null;
    $('menu').hidden = $('result').hidden = $('paused').hidden = true;
    $('chapter').textContent = `FOREST ${String(index + 1).padStart(2, '0')} / 08`;
    $('level-name').textContent = P.LEVELS[index].name;
    send('hk:resumed');
    if (!runOpen) {
      runOpen = true; runBest = 0; lastLive = -1;
      send('hk:start');
    }
    canvas.focus({ preventScroll: true }); updateHUD();
  }
  function finish(e) {
    screen = 'result'; cancelDrag();
    if (e.won) {
      runBest = Math.max(runBest, e.score);
      record.best[levelIndex] = Math.max(record.best[levelIndex], e.score);
      record.stars[levelIndex] = Math.max(record.stars[levelIndex], e.stars); save();
    }
    if (!e.won || levelIndex === P.LEVELS.length - 1) submitRun();
    else publishLiveScore();
    $('result-label').textContent = e.won ? (levelIndex === 7 ? 'FOREST SAVED' : 'STAGE CLEAR') : 'ONE MORE SHOT';
    $('result-title').textContent = e.won ? (levelIndex === 7 ? '숲을 되찾았어요!' : '멋진 한 방이었어요!') : '조금만 더 정확하게!';
    $('stars').innerHTML = e.won ? '★'.repeat(e.stars) + `<span class="empty">${'★'.repeat(3 - e.stars)}</span>` : '↻';
    $('result-score').textContent = `${e.score.toLocaleString()}점`;
    $('result-copy').textContent = e.won ? `남긴 도토리 ${P.LEVELS[levelIndex].ammo.length - sim.state.spent}개 · 최고 ${record.best[levelIndex].toLocaleString()}점` : `밤도깨비 ${sim.state.targets.length}마리가 남았어요. 기둥 아래쪽이나 지붕을 노려 보세요.`;
    $('next').hidden = !e.won; $('next').textContent = levelIndex === 7 ? '숲 지도 보기 →' : '다음 숲으로 →';
    $('result').hidden = false; $('again').focus({ preventScroll: true });
    tone(e.won ? 880 : 220, .3);
  }
  function home() {
    submitRun();
    screen = 'menu'; paused = false; cancelDrag();
    $('menu').hidden = false; $('result').hidden = $('paused').hidden = true; $('flight-hint').hidden = true;
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
    $('hint').textContent = s.phase === 'aim' ? (keyAim ? `각도 ${angle}° · 힘 ${power}% · SPACE 발사` : level.tip) : `남은 밤도깨비 ${s.targets.length}마리 · 무너지는 중…`;
    publishLiveScore();
  }
  const point = e => {
    const rect = canvas.getBoundingClientRect(), scale = Math.min(rect.width / 1280, rect.height / 720);
    return { x: (e.clientX - rect.left - (rect.width - 1280 * scale) / 2) / scale, y: (e.clientY - rect.top - (rect.height - 720 * scale) / 2) / scale };
  };
  canvas.addEventListener('pointerdown', e => {
    if (screen !== 'play' || paused || pointer !== null) return;
    if (sim.state.phase === 'flight') { sim.ability(); updateHUD(); return; }
    const p = point(e);
    if (sim.state.phase !== 'aim' || Math.hypot(p.x - P.SLING.x, p.y - P.SLING.y) > 65) return;
    pointer = e.pointerId; dragging = true; keyAim = false; aim = P.pull(p.x, p.y);
    canvas.setPointerCapture(e.pointerId); canvas.focus({ preventScroll: true }); e.preventDefault();
  });
  canvas.addEventListener('pointermove', e => { if (dragging && e.pointerId === pointer) { const p = point(e); aim = P.pull(p.x, p.y); } });
  canvas.addEventListener('pointerup', e => {
    if (!dragging || e.pointerId !== pointer) return;
    const p = point(e); sim.launch(p.x, p.y); cancelDrag(); updateHUD();
  });
  canvas.addEventListener('pointercancel', cancelDrag);
  canvas.addEventListener('lostpointercapture', () => { if (dragging) cancelDrag(); });
  function keyboardAim() { const a = angle * Math.PI / 180, length = power * P.MAX_PULL / 100; aim = { x: P.SLING.x - Math.cos(a) * length, y: P.SLING.y + Math.sin(a) * length }; keyAim = true; }
  document.addEventListener('keydown', e => {
    if (e.code === 'Escape') { e.preventDefault(); EMBED ? send('hk:esc') : pause(!paused); return; }
    if (screen !== 'play' || paused || (e.target instanceof HTMLButtonElement)) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (e.code === 'Space' && !e.repeat) { if (sim.state.phase === 'flight') sim.ability(); else { keyboardAim(); sim.launch(aim.x, aim.y); cancelDrag(); } }
    else if (sim.state.phase === 'aim') {
      if (e.code === 'ArrowLeft') angle = Math.min(75, angle + 2);
      if (e.code === 'ArrowRight') angle = Math.max(5, angle - 2);
      if (e.code === 'ArrowUp') power = Math.min(100, power + 2);
      if (e.code === 'ArrowDown') power = Math.max(15, power - 2);
      if (e.code.startsWith('Arrow')) keyboardAim();
    }
    updateHUD();
  });
  window.addEventListener('message', e => {
    if (!EMBED || e.source !== parent || e.origin !== location.origin || !e.data) return;
    if (e.data.type === 'hk:hello') return;
    if (e.data.type === 'hk:pause') pause(true);
    if (e.data.type === 'hk:resume') pause(false);
    if (e.data.type === 'hk:restart') start(levelIndex);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && screen === 'play') pause(true); });
  $('start').onclick = () => start(Math.min(7, record.stars.findIndex(s => s === 0) === -1 ? 0 : record.stars.findIndex(s => s === 0)));
  $('home').onclick = home; $('select-level').onclick = home;
  $('retry').onclick = () => { if (screen !== 'menu') start(levelIndex); };
  $('again').onclick = () => start(levelIndex); $('next').onclick = () => levelIndex === 7 ? home() : start(levelIndex + 1);
  $('pause').onclick = () => pause(!paused); $('resume').onclick = () => { pause(false); canvas.focus(); };
  $('ability').onclick = () => { sim?.ability(); updateHUD(); canvas.focus(); };
  $('sound').onclick = () => { sound = !sound; $('sound').setAttribute('aria-pressed', String(sound)); $('sound').setAttribute('aria-label', sound ? '소리 끄기' : '소리 켜기'); $('sound').style.opacity = sound ? '1' : '.5'; tone(660); };
  // All illustrations are original vector drawing commands, rendered at device resolution.
  function ellipse(x, y, rx, ry, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); }
  function line(points, color, width = 3) { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); }
  function rounded(x, y, w, h, r, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); }
  function hill(y, color, amplitude, offset) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, 720); ctx.lineTo(0, y);
    for (let x = 0; x <= 1300; x += 20) ctx.lineTo(x, y + Math.sin(x / 220 + offset) * amplitude + Math.sin(x / 130 + offset) * amplitude * .3);
    ctx.lineTo(1300, 720); ctx.closePath(); ctx.fill();
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
    castle: { soil: '#9d9087', grass: '#6f7c66', light: '#97a58c', pebble: '#85786f', tuft: '#74826b' },
  };
  function terrain() {
    const ys = P.groundProfile(levelIndex), step = P.GROUND_STEP;
    const theme = THEMES[P.LEVELS[levelIndex].theme] || THEMES.meadow;
    ctx.fillStyle = theme.soil; ctx.beginPath(); ctx.moveTo(0, 730);
    ys.forEach((y, i) => ctx.lineTo(i * step, y)); ctx.lineTo(1280, ys.at(-1)); ctx.lineTo(1280, 730); ctx.closePath(); ctx.fill();
    // Layered edge: dark grass line with a lighter band underneath follows every slope.
    line(ys.map((y, i) => [i * step, y + 6]), theme.light, 11);
    line(ys.map((y, i) => [i * step, y + 1]), theme.grass, 9);
    for (let i = 0; i < 70; i++) {
      const x = (i * 173) % 1280, top = P.groundAt(levelIndex, x), y = top + 22 + (i * 47) % Math.max(24, 740 - top - 24);
      ellipse(x, y, 3 + i % 4, 2, theme.pebble);
    }
    for (let i = 0; i < 52; i++) {
      const x = (i * 79) % 1280, y = P.groundAt(levelIndex, x);
      line([[x, y], [x + 4, y - 10], [x + 8, y]], theme.tuft, 2);
    }
    // Rock faces make steep steps and cliffs read as solid stone.
    if (['cliff', 'stone', 'castle'].includes(P.LEVELS[levelIndex].theme)) {
      for (let i = 1; i < ys.length; i++) {
        if (Math.abs(ys[i] - ys[i - 1]) < 14) continue;
        const x = i * step, top = Math.min(ys[i], ys[i - 1]), bottom = Math.max(ys[i], ys[i - 1]);
        for (let y = top + 14; y < bottom; y += 22) line([[x - 16, y], [x + 4, y + 3]], theme.pebble, 3);
      }
    }
    for (const [x, y] of [[350, 568], [1140, 568], [420, 571]]) {
      const gy = P.groundAt(levelIndex, x) - 6;
      line([[x, gy], [x, gy - 14]], '#65834f', 2); ellipse(x, gy - 18, 5, 5, '#fff0b8'); ellipse(x + 4, gy - 15, 4, 4, '#e6b36a');
    }
  }
  function background() {
    const sky = ctx.createLinearGradient(0, 0, 0, 640); sky.addColorStop(0, '#c5e2df'); sky.addColorStop(.65, '#eef0cf'); sky.addColorStop(1, '#f5e8be'); ctx.fillStyle = sky; ctx.fillRect(0, 0, 1280, 720);
    ellipse(1010, 148, 72, 72, '#fff9d280'); ellipse(1010, 148, 48, 48, '#fff6cb');
    for (const [x, y, s] of [[180, 134, 1], [545, 88, .7], [1110, 240, .6]]) { ellipse(x, y, 62 * s, 18 * s, '#fffdf284'); ellipse(x + 20 * s, y - 10 * s, 30 * s, 20 * s, '#fffdf284'); }
    hill(344, '#b9d2b7', 55, .2); hill(415, '#9bbfa0', 40, 2.5);
    for (let i = 0; i < 11; i++) tree(i * 140 - 30, 520, 110 + (i % 3) * 40, '#87ad8d');
    hill(512, '#7ca47c', 24, 1.2); hill(556, '#9ab47a', 12, 4);
    terrain();
    tree(40, 570, 240, '#537c59');
    if (P.groundAt(levelIndex, 1245) >= P.FLOOR - 1) tree(1245, 575, 205, '#63875d');
    // The team's little supply cart.
    rounded(55, 523, 88, 40, 6, '#a37949'); line([[60, 538], [138, 538]], '#795936', 3);
    ellipse(74, 564, 10, 10, '#52654b'); ellipse(124, 564, 10, 10, '#52654b');
  }
  function acorn(x, y, r, type = 'seed', rotation = 0) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rotation);
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
    const { x, y } = b.position; ctx.save(); ctx.translate(x, y); ctx.rotate(b.angle);
    ellipse(0, 18, 24, 6, '#304a3520');
    ctx.fillStyle = '#806b9d'; ctx.beginPath(); ctx.moveTo(-21, -4); ctx.lineTo(-19, -32); ctx.lineTo(-4, -19); ctx.lineTo(9, -21); ctx.lineTo(21, -32); ctx.lineTo(21, 0); ctx.fill();
    ellipse(0, 0, 23, 23, '#9c89b4'); ellipse(-7, 3, 10, 11, '#e6d7d5'); ellipse(8, 3, 10, 11, '#e6d7d5');
    ellipse(-6, 2, 2.5, 4, '#3e3448'); ellipse(9, 2, 2.5, 4, '#3e3448');
    line([[-12, -7], [-4, -5]], '#544563', 3); line([[6, -5], [14, -8]], '#544563', 3);
    ellipse(1, 11, 4, 3, '#65516c');
    if (b.game.hp < b.game.maxHp * .6) { line([[-17, -13], [-12, -9], [-18, -5]], '#564a62', 2); }
    ctx.restore();
  }
  function drawBlock(b) {
    const { w, h, material, hp, maxHp } = b.game, m = P.MATERIAL[material];
    ctx.save(); ctx.translate(b.position.x, b.position.y); ctx.rotate(b.angle);
    rounded(-w / 2, -h / 2, w, h, 3, m.edge); rounded(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4, 2, m.color);
    if (material === 'wood') {
      line([[-w / 2 + 5, -h / 2 + 5], [w / 2 - 5, h / 2 - 5]], '#e3b77b', 2);
      for (const sign of [-1, 1]) ellipse(w > h ? sign * (w / 2 - 9) : 0, h > w ? sign * (h / 2 - 10) : 0, 2, 2, '#755338');
    } else if (material === 'ice') { line([[-w / 2 + 4, h / 2 - 3], [w / 2 - 4, -h / 2 + 3]], '#eafff2', 3); }
    else { line([[-w / 2 + 3, -h / 2 + 4], [w / 2 - 4, -h / 2 + 4]], '#c2c9bd', 2); }
    if (hp < maxHp * .7) line([[-w * .25, -h / 2], [w * .15, -h * .1], [-w * .1, h * .2], [w * .3, h / 2]], m.edge, 2);
    ctx.restore();
  }
  function sling(front) {
    if (!front) {
      ellipse(207, 571, 48, 9, '#314b3420');
      line([[205, 568], [211, 482], [179, 424]], '#644c32', 18);
      line([[205, 566], [211, 483], [179, 426]], '#ba8c52', 10);
    } else {
      line([[210, 490], [232, 421]], '#654a30', 16); line([[210, 485], [232, 423]], '#bd9158', 8);
      for (let y = 483; y < 520; y += 7) line([[201, y], [216, y + 2]], '#d4bb86', 3);
    }
  }
  function trajectory() {
    let x = aim.x, y = aim.y, vx = (P.SLING.x - x) * .225, vy = (P.SLING.y - y) * .225;
    for (let i = 0; i < 130; i++) {
      vx *= 1 - .0003 * .5; vy = vy * (1 - .0003 * .5) + .1388889;
      x += vx * .5; y += vy * .5;
      if (y > P.groundAt(levelIndex, x) - 15) break;
      if (i % 8 === 0) ellipse(x, y, Math.max(2, 4 - i / 65), Math.max(2, 4 - i / 65), `rgba(255,253,230,${.9 - i / 170})`);
    }
  }
  function drawParticle(p, dt) {
    if (p.life <= 0) return;
    if (!paused) {
      p.x += p.vx * dt * 60; p.y += p.vy * dt * 60;
      p.vy += dt * (p.dust ? 2 : 20); p.life -= dt;
      const groundY = P.groundAt(levelIndex, p.x);
      if (p.fragment && p.y > groundY - p.size * .25) {
        p.y = groundY - p.size * .25;
        p.vy = p.vy > 1.4 ? p.vy * -.32 : 0;
        p.vx *= Math.exp(-dt * 9); p.spin *= Math.exp(-dt * 8);
      }
      if (p.fragment) p.rotation += p.spin * dt;
      // Particles are visual only, but must still never leave the playfield.
      const edge = p.dust ? p.size * 1.6 : p.size;
      if (p.x < edge) { p.x = edge; p.vx = Math.abs(p.vx) * .35; }
      else if (p.x > 1280 - edge) { p.x = 1280 - edge; p.vx = -Math.abs(p.vx) * .35; }
      if (p.y < edge) { p.y = edge; p.vy = Math.abs(p.vy) * .2; }
    }
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life / .32));
    if (p.dust) {
      const size = p.size * (1.65 - Math.min(.8, p.life));
      ctx.globalAlpha *= .45; ellipse(p.x, p.y, size, size * .63, p.color);
      return;
    }
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
  function draw(dt) {
    const dpr = Math.min(devicePixelRatio || 1, 2), width = Math.round(canvas.clientWidth * dpr), height = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const scale = Math.min(width / 1280, height / 720);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#d6e7cf'; ctx.fillRect(0, 0, width, height);
    ctx.setTransform(scale, 0, 0, scale, (width - 1280 * scale) / 2, (height - 720 * scale) / 2);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 1280, 720); ctx.clip();
    if (shake > .1 && !paused) { if (!reducedMotion.matches) ctx.translate(Math.sin(renderTime * 81) * shake, Math.cos(renderTime * 95) * shake * .5); shake *= Math.exp(-dt * 8); }
    background();
    if (sim) {
      sim.state.blocks.forEach(drawBlock); sim.state.targets.forEach(creature);
      for (const p of trail) ellipse(p.x, p.y, 2.5, 2.5, '#fff6df88');
      sim.state.shots.forEach(b => acorn(b.position.x, b.position.y, b.game.radius, b.game.ammo, b.angle));
    }
    sling(false);
    const ready = !sim || sim.state.phase === 'aim';
    const pos = ready && screen === 'play' ? aim : P.SLING;
    line([[179, 425], [pos.x, pos.y + 4], [232, 424]], '#5f4536', 6);
    if (ready || screen === 'menu') acorn(pos.x, pos.y, 20, sim && screen === 'play' ? P.LEVELS[levelIndex].ammo[sim.state.spent] : 'seed');
    sling(true);
    if ((dragging || keyAim) && screen === 'play' && !paused) { trajectory(); ellipse(aim.x, aim.y, 26, 26, '#fff6df20'); }
    if (screen === 'play' && ready && !dragging && !keyAim) {
      ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#44644e'; ctx.fillText('← 뒤로 당겨요', 195, 373 + Math.sin(renderTime * 3) * 4);
    }
    if (particles.length > 280) particles.splice(0, particles.length - 280);
    for (const p of particles) drawParticle(p, dt);
    ctx.globalAlpha = 1; particles = particles.filter(p => p.life > 0);
    for (const r of rings) {
      if (!paused) r.life -= dt;
      if (r.life <= 0) continue;
      const t = r.life / r.duration, radius = 7 + (1 - t * t) * r.radius;
      ctx.globalAlpha = t * .8; ctx.strokeStyle = r.color; ctx.lineWidth = 1 + t * 5;
      ctx.beginPath(); ctx.ellipse(r.x, r.y, radius, radius * r.flat, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    rings = rings.filter(r => r.life > 0);
    for (const t of texts) { if (!paused) { t.y -= dt * 32; t.life -= dt; } ctx.globalAlpha = Math.max(0, t.life); ctx.fillStyle = '#fff8dd'; ctx.strokeStyle = '#496547'; ctx.lineWidth = 4; ctx.font = '900 22px sans-serif'; ctx.textAlign = 'center'; const tx = Math.max(58, Math.min(1222, t.x)), ty = Math.max(34, Math.min(P.FLOOR - 12, t.y)); ctx.strokeText(t.text, tx, ty); ctx.fillText(t.text, tx, ty); }
    ctx.globalAlpha = 1; texts = texts.filter(t => t.life > 0); ctx.restore();
    if (chainLabel && screen === 'play') {
      if (!paused) chainLabel.life -= dt;
      if (chainLabel.life <= 0) chainLabel = null;
      else {
        ctx.globalAlpha = Math.min(1, chainLabel.life * 4);
        rounded(523, 108, 234, 46, 20, '#274539');
        ctx.fillStyle = '#fff0aa'; ctx.font = '900 25px Pretendard, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(chainLabel.text, 640, 140); ctx.globalAlpha = 1;
      }
    }
  }
  let hudElapsed = 0, trailElapsed = 0;
  function frame(now) {
    const dt = Math.min(.05, (now - (last || now)) / 1000); last = now;
    if (!paused) renderTime += dt;
    if (screen === 'play' && !paused) {
      const frozen = reducedMotion.matches ? 0 : Math.min(dt, hitStop);
      hitStop = reducedMotion.matches ? 0 : hitStop - frozen;
      accumulator += (dt - frozen) * 1000;
      while (accumulator >= P.STEP && hitStop <= 0 && screen === 'play') {
        sim.step(); accumulator -= P.STEP;
        if (hitStop > 0) accumulator %= P.STEP;
      }
      trailElapsed += dt;
      if (sim.state.active && trailElapsed > .07) { trail.push({ ...sim.state.active.position }); if (trail.length > 60) trail.shift(); trailElapsed = 0; }
    }
    hudElapsed += dt; if (hudElapsed > .1) { updateHUD(); hudElapsed = 0; }
    draw(dt); requestAnimationFrame(frame);
  }
  // Read-only diagnostics for browser smoke tests, without gameplay mutation hooks.
  window.AcornGame = { snapshot: () => ({ screen, paused, level: levelIndex, phase: sim?.state.phase, score: sim?.state.score, remaining: sim?.state.targets.length, spent: sim?.state.spent, shot: sim?.state.active ? { ...sim.state.active.position } : null, dragging, effects: { chain, particles: particles.length, shockwaves: rings.length } }) };
  sim = P.create(0); updateLevels(); send('hk:ready'); requestAnimationFrame(frame);
})();
