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
  let audio, sound = false, lastLive = -1, submitted = false, keyAim = false;
  const send = (type, extras = {}) => { if (EMBED) parent.postMessage({ type, ...extras }, location.origin); };
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
  function onEvent(e) {
    if (e.type === 'break') {
      burst(e.x, e.y, e.color, e.target ? 20 : 10); shake = Math.max(shake, e.target ? 5 : 2);
      texts.push({ x: e.x, y: e.y, text: e.target ? '+1,000' : '와르르!', life: 1 });
      tone(e.target ? 700 : 180, .1, e.target ? 'sine' : 'triangle');
    }
    if (e.type === 'blast') { rings.push({ x: e.x, y: e.y, life: .6 }); burst(e.x, e.y, '#f7bb4a', 35); shake = 12; tone(90, .4, 'sawtooth'); }
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
    sim?.dispose(); levelIndex = index; submitted = false; lastLive = -1;
    sim = P.create(index, onEvent); screen = 'play'; paused = false; cancelDrag();
    particles = []; rings = []; texts = []; trail = []; accumulator = 0; angle = 27; power = 78;
    $('menu').hidden = $('result').hidden = $('paused').hidden = true;
    $('chapter').textContent = `FOREST ${String(index + 1).padStart(2, '0')} / 08`;
    $('level-name').textContent = P.LEVELS[index].name;
    send('hk:resumed'); send('hk:start'); send('hk:live', { score: 0 });
    canvas.focus({ preventScroll: true }); updateHUD();
  }
  function finish(e) {
    submitted = true; send('hk:score', { score: e.score });
    screen = 'result'; cancelDrag();
    if (e.won) {
      record.best[levelIndex] = Math.max(record.best[levelIndex], e.score);
      record.stars[levelIndex] = Math.max(record.stars[levelIndex], e.stars); save();
    }
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
    if (sim && !submitted && screen === 'play') { submitted = true; send('hk:score', { score: sim.state.score }); }
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
    if (!submitted && s.score !== lastLive) { lastLive = s.score; send('hk:live', { score: s.score }); }
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
  function background() {
    const sky = ctx.createLinearGradient(0, 0, 0, 640); sky.addColorStop(0, '#c5e2df'); sky.addColorStop(.65, '#eef0cf'); sky.addColorStop(1, '#f5e8be'); ctx.fillStyle = sky; ctx.fillRect(0, 0, 1280, 720);
    ellipse(1010, 148, 72, 72, '#fff9d280'); ellipse(1010, 148, 48, 48, '#fff6cb');
    for (const [x, y, s] of [[180, 134, 1], [545, 88, .7], [1110, 240, .6]]) { ellipse(x, y, 62 * s, 18 * s, '#fffdf284'); ellipse(x + 20 * s, y - 10 * s, 30 * s, 20 * s, '#fffdf284'); }
    hill(344, '#b9d2b7', 55, .2); hill(415, '#9bbfa0', 40, 2.5);
    for (let i = 0; i < 11; i++) tree(i * 140 - 30, 520, 110 + (i % 3) * 40, '#87ad8d');
    hill(512, '#7ca47c', 24, 1.2); hill(556, '#9ab47a', 12, 4);
    rounded(0, P.FLOOR, 1280, 146, 0, '#c6a878'); rounded(0, P.FLOOR, 1280, 12, 0, '#607b49'); rounded(0, P.FLOOR + 11, 1280, 12, 0, '#9bab62');
    for (let i = 0; i < 55; i++) { const x = (i * 173) % 1280, y = 612 + (i * 47) % 100; ellipse(x, y, 3 + i % 4, 2, '#b4986a'); }
    for (let i = 0; i < 35; i++) { const x = (i * 79) % 1280; line([[x, 573], [x + 4, 563], [x + 8, 573]], '#668750', 2); }
    tree(40, 570, 240, '#537c59'); tree(1245, 575, 205, '#63875d');
    for (const [x, y] of [[350, 568], [1140, 568], [420, 571]]) { line([[x, y], [x, y - 14]], '#65834f', 2); ellipse(x, y - 18, 5, 5, '#fff0b8'); ellipse(x + 4, y - 15, 4, 4, '#e6b36a'); }
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
      if (y > P.FLOOR - 15) break;
      if (i % 8 === 0) ellipse(x, y, Math.max(2, 4 - i / 65), Math.max(2, 4 - i / 65), `rgba(255,253,230,${.9 - i / 170})`);
    }
  }
  function draw(dt) {
    const dpr = Math.min(devicePixelRatio || 1, 2), width = Math.round(canvas.clientWidth * dpr), height = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const scale = Math.min(width / 1280, height / 720);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#d6e7cf'; ctx.fillRect(0, 0, width, height);
    ctx.setTransform(scale, 0, 0, scale, (width - 1280 * scale) / 2, (height - 720 * scale) / 2);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 1280, 720); ctx.clip();
    if (shake > .1 && !paused) { ctx.translate(Math.sin(renderTime * 81) * shake, Math.cos(renderTime * 95) * shake * .5); shake *= Math.exp(-dt * 8); }
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
    for (const p of particles) {
      if (!paused) { p.x += p.vx * dt * 60; p.y += p.vy * dt * 60; p.vy += dt * 15; p.life -= dt; }
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / .4)); ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rotation + p.life * 4); rounded(-p.size / 2, -p.size / 2, p.size, p.size, 1, p.color); ctx.restore();
    }
    ctx.globalAlpha = 1; particles = particles.filter(p => p.life > 0);
    for (const r of rings) {
      if (!paused) r.life -= dt;
      ctx.strokeStyle = `rgba(255,224,145,${Math.max(0, r.life)})`; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(r.x, r.y, (1 - r.life / .6) * 170 + 8, 0, Math.PI * 2); ctx.stroke();
    }
    rings = rings.filter(r => r.life > 0);
    for (const t of texts) { if (!paused) { t.y -= dt * 32; t.life -= dt; } ctx.globalAlpha = Math.max(0, t.life); ctx.fillStyle = '#fff8dd'; ctx.strokeStyle = '#496547'; ctx.lineWidth = 4; ctx.font = '900 22px sans-serif'; ctx.textAlign = 'center'; ctx.strokeText(t.text, t.x, t.y); ctx.fillText(t.text, t.x, t.y); }
    ctx.globalAlpha = 1; texts = texts.filter(t => t.life > 0); ctx.restore();
  }
  let hudElapsed = 0, trailElapsed = 0;
  function frame(now) {
    const dt = Math.min(.05, (now - (last || now)) / 1000); last = now;
    if (!paused) renderTime += dt;
    if (screen === 'play' && !paused) {
      accumulator += dt * 1000;
      while (accumulator >= P.STEP) { sim.step(); accumulator -= P.STEP; }
      trailElapsed += dt;
      if (sim.state.active && trailElapsed > .07) { trail.push({ ...sim.state.active.position }); if (trail.length > 60) trail.shift(); trailElapsed = 0; }
    }
    hudElapsed += dt; if (hudElapsed > .1) { updateHUD(); hudElapsed = 0; }
    draw(dt); requestAnimationFrame(frame);
  }
  // Read-only diagnostics for browser smoke tests, without gameplay mutation hooks.
  window.AcornGame = { snapshot: () => ({ screen, paused, level: levelIndex, phase: sim?.state.phase, score: sim?.state.score, remaining: sim?.state.targets.length, spent: sim?.state.spent, shot: sim?.state.active ? { ...sim.state.active.position } : null, dragging }) };
  sim = P.create(0); updateLevels(); send('hk:ready'); requestAnimationFrame(frame);
})();
