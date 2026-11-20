/* 도토리 새총단 — deterministic 120 Hz simulation; also exercised by Node tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./vendor/matter.min.js'));
  else root.AcornPhysics = factory(root.Matter);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M) {
  'use strict';
    const { Engine, Bodies, Body, Composite, Events, Vector } = M;
  const STEP = 1000 / 120, FLOOR = 574, SLING = { x: 205, y: 432 }, MAX_PULL = 86, SCORE_MAX = 20000;
  // The rotating sprite extends beyond its 22px collider (ears reach 38px).
  const TARGET_MARGIN = 38, TARGET_BOUNCE = .25;
  const MATERIAL = {
    wood: { hp: 15, density: .0024, color: '#c58a4d', edge: '#754828', points: 120 },
    ice: { hp: 7, density: .0015, color: '#a2e5e6', edge: '#4a969e', points: 150 },
    stone: { hp: 32, density: .0045, color: '#a1ada8', edge: '#5c716d', points: 200 },
  };
  // Original stage maps. `ground` is a [x, y] polyline (y is clamped to the base floor);
  // every tower gets a flat pad so it always starts stable on the terrain.
  const LEVELS = [
    { name: '숲 입구', theme: 'meadow', tip: '평평한 풀밭. 아래쪽 나무 기둥을 노려 보세요.', ammo: ['seed', 'seed', 'bomb'], towers: [[800, 1, 'wood']], enemyHp: 14, blockHp: 1.2 },
    { name: '반짝이는 온실', theme: 'meadow', tip: '완만한 언덕 위의 얼음탑이에요.', ammo: ['seed', 'split', 'seed'], towers: [[790, 2, 'ice']], enemyHp: 38, blockHp: 2,
      ground: [[0, 574], [520, 574], [700, 536], [1280, 536]] },
    { name: '쌍둥이 망루', theme: 'cliff', tip: '높은 언덕 위 망루와 낮은 평지의 망루, 두 높이를 모두 노려요.', ammo: ['split', 'seed', 'seed', 'bomb'], towers: [[700, 2, 'wood'], [1040, 2, 'ice']], enemyHp: 28, blockHp: 1.7,
      ground: [[0, 574], [440, 574], [600, 510], [830, 510], [920, 574], [1280, 574]] },
    { name: '오래된 돌문', theme: 'stone', tip: '계단처럼 높아지는 지형. 위쪽 망루가 아래쪽을 짓눌러요.', ammo: ['bomb', 'seed', 'seed', 'split'], towers: [[740, 2, 'stone'], [1040, 2, 'wood']], enemyHp: 28, blockHp: 1.6,
      ground: [[0, 574], [560, 574], [620, 546], [860, 546], [920, 510], [1280, 510]] },
    { name: '바람 언덕', theme: 'cliff', tip: '낮은 골짜기의 높은 망루, 그리고 절벽 위의 망루예요.', ammo: ['seed', 'split', 'bomb', 'seed', 'seed'], towers: [[690, 3, 'wood'], [1040, 2, 'stone']], enemyHp: 24, blockHp: 1.5,
      ground: [[0, 574], [880, 574], [950, 470], [1280, 470]] },
    { name: '유리 숲', theme: 'ice', tip: '두 언덕 사이의 골짜기. 얼음탑이 무너지면 골짜기로 쏟아져요.', ammo: ['split', 'seed', 'bomb', 'seed', 'bomb', 'seed'], towers: [[670, 3, 'ice'], [1040, 3, 'wood']], enemyHp: 34, blockHp: 1.9,
      ground: [[0, 574], [520, 574], [580, 508], [780, 508], [850, 574], [930, 574], [990, 504], [1280, 504]] },
    { name: '돌담 너머', theme: 'stone', tip: '앞의 큰 바위 언덕이 직선 사격을 막아요. 위로 높이 쏘세요.', ammo: ['bomb', 'split', 'seed', 'bomb', 'seed', 'seed'], towers: [[650, 3, 'stone'], [1040, 3, 'wood']], enemyHp: 52, blockHp: 2.5,
      ground: [[0, 574], [380, 574], [440, 466], [520, 466], [580, 574], [1280, 574]] },
    { name: '도토리 성채', theme: 'castle', tip: '계단식 절벽 위의 거대한 성채. 아래 받침부터 무너뜨려요.', ammo: ['bomb', 'split', 'seed', 'bomb', 'seed', 'bomb'], towers: [[700, 3, 'wood'], [1040, 3, 'stone']], enemyHp: 32, blockHp: 1.7,
      ground: [[0, 574], [500, 574], [560, 528], [800, 528], [860, 474], [1280, 474]] },
  ];
  function pull(x, y) {
    let dx = Math.min(0, x - SLING.x), dy = y - SLING.y;
    const length = Math.hypot(dx, dy);
    if (length > MAX_PULL) { dx *= MAX_PULL / length; dy *= MAX_PULL / length; }
    return { x: SLING.x + dx, y: SLING.y + dy };
  }
  // Matter widens `bounds` for fast bodies. Use the real shape for containment.
  function shapeBox(b) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const v of b.vertices) {
      if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
      if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
    }
    return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
  }
  // Terrain: a piecewise-linear ground profile per stage, sampled every GROUND_STEP px.
  // Each tower gets a flat pad so it always starts stable on any hill, cliff or step.
  const GROUND_STEP = 20, PAD_HALF = 90;
  const groundCache = new WeakMap();
  function groundOf(level) {
    const signature = JSON.stringify([level.ground, level.towers]);
    const cached = groundCache.get(level);
    if (cached && cached.signature === signature) return cached;
    const points = level.ground ?? [[0, FLOOR], [1280, FLOOR]];
    const raw = x => {
      if (x <= points[0][0]) return points[0][1];
      for (let i = 1; i < points.length; i++) {
        if (x <= points[i][0]) {
          const [x0, y0] = points[i - 1], [x1, y1] = points[i];
          return y0 + (y1 - y0) * (x - x0) / (x1 - x0 || 1);
        }
      }
      return points.at(-1)[1];
    };
    const ys = [];
    for (let x = 0; x <= 1280; x += GROUND_STEP) ys.push(Math.min(FLOOR, raw(x)));
    const bases = new Map();
    for (const [towerX] of level.towers) {
      const base = Math.min(FLOOR, raw(towerX));
      bases.set(towerX, base);
      ys.forEach((_, i) => { if (Math.abs(i * GROUND_STEP - towerX) <= PAD_HALF) ys[i] = base; });
    }
    const ground = {
      signature, ys, baseAt: towerX => bases.get(towerX) ?? FLOOR,
      y(x) {
        const t = Math.max(0, Math.min(1280, x)) / GROUND_STEP, i = Math.min(ys.length - 2, Math.floor(t));
        return ys[i] + (ys[i + 1] - ys[i]) * (t - i);
      },
    };
    groundCache.set(level, ground);
    return ground;
  }
  function groundAt(levelIndex, x) { return groundOf(LEVELS[levelIndex]).y(x); }
  function groundProfile(levelIndex) { return groundOf(LEVELS[levelIndex]).ys.slice(); }
  function create(levelIndex = 0, notify = () => {}) {
    const level = LEVELS[levelIndex];
    if (!level) throw new RangeError('Unknown level');
    const ground = groundOf(level);
    const engine = Engine.create({ enableSleeping: true, positionIterations: 10, velocityIterations: 8 });
    engine.gravity.y = 1;
    const state = { engine, levelIndex, phase: 'aim', blocks: [], targets: [], shots: [], spent: 0, score: 0, time: 0, shotTime: 0, active: null, abilityUsed: false, destroyed: 0 };
    const removed = new Set();
    const pendingSupports = [];
    const pendingImpacts = [];
    let firstHit = null, hitShown = false;
    let settling = true, quiet = 0, winWait = 0, winQuiet = 0;
    const add = b => { Composite.add(engine.world, b); return b; };
    add(Bodies.rectangle(640, FLOOR + 50, 1600, 100, { isStatic: true, friction: .8 }));
    // Terrain pieces: convex quads from the ground profile down to the base floor.
    for (let i = 0; i < ground.ys.length - 1; i++) {
      const x0 = i * GROUND_STEP, x1 = x0 + GROUND_STEP, y0 = ground.ys[i], y1 = ground.ys[i + 1];
      if (y0 >= FLOOR && y1 >= FLOOR) continue;
      const vertices = [{ x: x0 - 1, y: y0 }, { x: x1 + 1, y: y1 }, { x: x1 + 1, y: FLOOR + 20 }, { x: x0 - 1, y: FLOOR + 20 }];
      const centre = M.Vertices.centre(vertices);
      const piece = add(Bodies.fromVertices(centre.x, centre.y, [vertices], { isStatic: true, friction: .8, restitution: .05 }));
      piece.game = { kind: 'ground' };
    }
    // Invisible walls and ceiling keep every simulated piece inside the 1280x720 view.
    for (const [x, y, w, h] of [[-30, 360, 60, 1000], [1310, 360, 60, 1000], [640, -30, 1500, 60]]) {
      const wall = add(Bodies.rectangle(x, y, w, h, { isStatic: true, friction: .4, restitution: .2 }));
      wall.game = { kind: 'wall' };
    }
    function block(x, y, w, h, material) {
      const m = MATERIAL[material];
      const b = add(Bodies.rectangle(x, y, w, h, { density: m.density, friction: .65, frictionStatic: .9, restitution: .04, chamfer: { radius: 2 } }));
      const hp = m.hp * (level.blockHp ?? 1);
      b.game = { kind: 'block', material, hp, maxHp: hp, w, h };
      state.blocks.push(b);
      return b;
    }
    function target(x, y) {
      const b = add(Bodies.circle(x, y, 22, { density: .002, friction: .7, restitution: .05 }));
      // Armored enemies survive harmless bumps; they are defeated by hard impacts only.
      const hp = level.enemyHp ?? 9;
      b.game = { kind: 'target', hp, maxHp: hp };
      state.targets.push(b);
      return b;
    }
    for (const [x, floors, material] of level.towers) {
      const tower = [];
      const floorY = ground.baseAt(x);
      for (let f = 0; f < floors; f++) {
        const base = floorY - f * 112;
        const posts = [block(x - 55, base - 49, 18, 98, material), block(x + 55, base - 49, 18, 98, material)];
        const deck = block(x, base - 105, 146, 14, material);
        const guard = target(x, base - 23);
        guard.game.support = { tower, floor: f };
        for (const piece of [...posts, deck]) piece.game.support = { tower, floor: f };
        tower.push({ posts, deck, guard });
      }
    }
    function damage(b, value) {
      if (!b.game || removed.has(b) || (b.game.kind !== 'block' && b.game.kind !== 'target')) return;
      b.game.hp -= value;
      if (b.game.hp <= 0) removed.add(b);
    }
    Events.on(engine, 'collisionStart', event => {
      if (settling || state.phase !== 'flight') return;
      for (const pair of event.pairs) {
        const a = pair.bodyA, b = pair.bodyB;
        // The invisible playfield walls only stop motion; they never hurt anything.
        if (a.game?.kind === 'wall' || b.game?.kind === 'wall') continue;
        const rv = Vector.sub(a.velocity, b.velocity);
        const impact = Math.abs(Vector.dot(rv, pair.collision.normal));
        if (impact < 1.8) continue;
        if (!hitShown && impact >= 4) {
          const shotBody = a.game?.kind === 'shot' ? a : b.game?.kind === 'shot' ? b : null;
          const struck = shotBody === a ? b : a;
          if (shotBody && (struck.game?.kind === 'block' || struck.game?.kind === 'target') && (!firstHit || impact > firstHit.energy)) {
            firstHit = { type: 'hit', ...struck.position, vx: shotBody.velocity.x, vy: shotBody.velocity.y, energy: impact };
          }
        }
        for (const [body, other] of [[a, b], [b, a]]) {
          if (body.game?.kind === 'block' && body.game.dropTop != null) {
            const drop = body.position.y - body.game.dropTop;
            if (drop >= 18 && body.velocity.y - other.velocity.y >= 2.5 && impact >= 2.5) {
              body.game.dropTop = body.position.y;
              // Heavy pieces and longer falls transfer more energy to the landing.
              const energy = Math.min(35, 4 + impact * Math.sqrt(body.mass) * .85 + drop * .09);
              pendingImpacts.push({ body, other, energy });
            }
          }
          const multiplier = other.game?.kind === 'shot' ? 3.8 : 2.4;
          damage(body, (impact - 1.3) * multiplier);
        }
      }
    });
    // Let stacks settle before enabling damage or player input.
    for (let i = 0; i < 180; i++) Engine.update(engine, STEP);
    settling = false;
    function wakeStack(tower, floor) {
      for (const { posts, deck, guard } of tower.slice(floor)) {
        for (const piece of [...posts, deck, guard]) {
          if (!removed.has(piece) && (state.blocks.includes(piece) || state.targets.includes(piece))) {
            if (piece.game.kind === 'block') piece.game.dropTop ??= piece.position.y;
            M.Sleeping.set(piece, false);
          }
        }
      }
    }
    function flush() {
      for (const b of removed) {
        Composite.remove(engine.world, b);
        const targetHit = b.game.kind === 'target';
        const { tower, floor } = b.game.support;
        if (targetHit) {
          // The bottom guard of a floor braces its posts. Releasing them is
          // delayed briefly so impacts and each collapse read as separate beats.
          if (floor + 1 < tower.length) pendingSupports.push({ tower, floor, at: state.time + 140 });
        } else wakeStack(tower, floor);
        state.score = Math.min(SCORE_MAX, state.score + (targetHit ? 1000 : MATERIAL[b.game.material].points));
        state.destroyed += targetHit ? 1 : 0;
        state.targets = state.targets.filter(v => v !== b);
        state.blocks = state.blocks.filter(v => v !== b);
        notify({ type: 'break', ...b.position, vx: b.velocity.x, vy: b.velocity.y, target: targetHit, material: b.game.material, w: b.game.w, h: b.game.h, color: targetHit ? '#8873ae' : MATERIAL[b.game.material].color });
      }
      removed.clear();
    }
    function releaseImpacts() {
      for (const { body, other, energy } of pendingImpacts) {
        const { x, y } = body.position;
        damage(body, energy * .72);
        damage(other, energy);
        for (const piece of [...state.blocks, ...state.targets]) {
          if (piece === body || piece === other || removed.has(piece)) continue;
          const dx = piece.position.x - x, dy = piece.position.y - y;
          const distance = Math.hypot(dx, dy);
          if (distance >= 92) continue;
          const spill = 1 - distance / 92;
          damage(piece, energy * .58 * spill);
          M.Sleeping.set(piece, false);
          Body.setVelocity(piece, { x: piece.velocity.x + (dx / (distance || 1)) * energy * .09 * spill, y: piece.velocity.y - energy * .095 * spill });
        }
        notify({ type: 'crash', x, y, energy, vx: body.velocity.x, material: body.game.material, color: MATERIAL[body.game.material].color });
      }
      pendingImpacts.length = 0;
    }
    function releaseSupports() {
      while (pendingSupports.length && pendingSupports[0].at <= state.time) {
        const { tower, floor } = pendingSupports.shift();
        const { posts, deck } = tower[floor];
        if (state.blocks.includes(deck)) notify({ type: 'buckling', ...deck.position });
        // Tip the posts outwards; the deck and enemies above move under normal
        // gravity and can take damage only from actual impacts.
        posts.forEach((post, i) => {
          if (!state.blocks.includes(post)) return;
          const direction = i === 0 ? -1 : 1;
          M.Sleeping.set(post, false);
          Body.setVelocity(post, { x: post.velocity.x + direction * 4, y: post.velocity.y });
          Body.setAngularVelocity(post, post.angularVelocity + direction * .12);
        });
        wakeStack(tower, floor);
      }
    }
    function shot(x, y, kind, velocity, radius = 20) {
      const b = add(Bodies.circle(x, y, radius, { density: .012, friction: .5, restitution: .3, frictionAir: .0003 }));
      b.game = { kind: 'shot', ammo: kind, radius };
      Body.setVelocity(b, velocity);
      state.shots.push(b);
      return b;
    }
    function launch(x, y) {
      if (state.phase !== 'aim' || state.spent >= level.ammo.length) return false;
      const p = pull(x, y), dx = SLING.x - p.x, dy = SLING.y - p.y;
      if (Math.hypot(dx, dy) < 8) return false;
      state.active = shot(p.x, p.y, level.ammo[state.spent++], { x: dx * .225, y: dy * .225 });
      state.phase = 'flight'; state.abilityUsed = false; state.shotTime = 0; quiet = 0;
      hitShown = false; firstHit = null;
      notify({ type: 'launch' });
      return true;
    }
    function ability() {
      const b = state.active;
      if (state.phase !== 'flight' || !b || state.abilityUsed || b.game.ammo === 'seed') return false;
      state.abilityUsed = true;
      if (b.game.ammo === 'bomb') {
        const center = { ...b.position };
        for (const other of [...state.blocks, ...state.targets]) {
          const delta = Vector.sub(other.position, center), d = Vector.magnitude(delta);
          if (d > 165) continue;
          const strength = 1 - d / 165;
          damage(other, 55 * strength);
          Body.setVelocity(other, { x: other.velocity.x + (delta.x / (d || 1)) * strength * 14, y: other.velocity.y + (delta.y / (d || 1)) * strength * 14 - 3 });
          M.Sleeping.set(other, false);
        }
        notify({ type: 'blast', ...center });
        Composite.remove(engine.world, b); state.shots = state.shots.filter(s => s !== b); state.active = null;
        flush();
      } else {
        const v = b.velocity;
        for (const direction of [-1, 1]) shot(b.position.x, b.position.y + direction * 30, 'seed', { x: v.x * 1.1, y: v.y + direction * 3.8 }, 13);
        Body.setVelocity(b, { x: v.x * 1.1, y: v.y });
        notify({ type: 'split', ...b.position });
      }
      return true;
    }
    function finish(won) {
      state.phase = won ? 'won' : 'lost';
      if (won) state.score = Math.min(SCORE_MAX, state.score + 2000 + (level.ammo.length - state.spent) * 1000);
      // Efficiency stars: three stars need at most 60% of the ammo; two need a spare acorn.
      state.stars = won ? (state.spent <= Math.floor(level.ammo.length * .6) ? 3 : state.spent < level.ammo.length ? 2 : 1) : 0;
      notify({ type: 'finish', won, score: state.score, stars: state.stars });
    }
    function containBodies() {
      // Even high-speed pieces may tunnel a thin wall; clamp bounds after each step.
      for (const b of [...state.blocks, ...state.shots]) {
        let vx = b.velocity.x, vy = b.velocity.y, moved = false;
        for (let pass = 0; pass < 4; pass++) {
          const box = shapeBox(b);
          const dx = box.min.x < 0 ? -box.min.x : box.max.x > 1280 ? 1280 - box.max.x : 0;
          const dy = box.min.y < 0 ? -box.min.y : box.max.y > FLOOR ? FLOOR - box.max.y : 0;
          if (!dx && !dy) break;
          moved = true;
          if (dx && ((dx > 0 && vx < 0) || (dx < 0 && vx > 0))) vx *= -.35;
          if (dy && ((dy > 0 && vy < 0) || (dy < 0 && vy > 0))) vy *= -.2;
          Body.setPosition(b, { x: b.position.x + dx, y: b.position.y + dy });
        }
        if (moved) Body.setVelocity(b, { x: vx, y: vy });
      }
    }
    function containTargets() {
      for (const b of state.targets) {
        const { x, y } = b.position;
        const nx = Math.max(TARGET_MARGIN, Math.min(1280 - TARGET_MARGIN, x));
        const ny = Math.max(TARGET_MARGIN, Math.min(FLOOR - 22, y));
        if (nx === x && ny === y) continue;
        let vx = b.velocity.x, vy = b.velocity.y;
        if ((x < nx && vx < 0) || (x > nx && vx > 0)) vx *= -TARGET_BOUNCE;
        if ((y < ny && vy < 0) || (y > ny && vy > 0)) vy *= -TARGET_BOUNCE;
        // Clamp after every physics step, so even high-speed overshoot cannot
        // render outside the viewport. This boundary itself deals no damage.
        Body.setPosition(b, { x: nx, y: ny });
        Body.setVelocity(b, { x: vx, y: vy });
      }
    }
    function step() {
      if (state.phase !== 'aim' && state.phase !== 'flight') return;
      Engine.update(engine, STEP); state.time += STEP;
      releaseSupports();
      containBodies();
      containTargets();
      if (state.phase !== 'flight') return;
      state.shotTime += STEP;
      if (firstHit) { notify(firstHit); firstHit = null; hitShown = true; }
      releaseImpacts();
      flush();
      if (!state.targets.length) {
        winWait += STEP;
        const falling = state.blocks.some(b => b.game.dropTop != null && (b.speed > .5 || b.angularSpeed > .025));
        winQuiet = falling || pendingSupports.length ? 0 : winQuiet + STEP;
        if (winWait > 900 && winQuiet > 260) finish(true);
        return;
      }
      const moving = [...state.shots, ...state.blocks, ...state.targets].some(b => b.position.x > -60 && b.position.x < 1340 && b.position.y < 650 && !b.isSleeping && (b.speed > .65 || b.angularSpeed > .04));
      quiet = moving ? 0 : quiet + STEP;
      if (!pendingSupports.length && ((state.shotTime > 1800 && quiet > 650) || state.shotTime > 11000)) {
        for (const b of state.shots) Composite.remove(engine.world, b);
        state.shots = []; state.active = null;
        if (state.spent >= level.ammo.length) finish(false);
        else { state.phase = 'aim'; notify({ type: 'reload' }); }
      }
    }
    return { state, step, launch, ability, dispose() { Events.off(engine); Composite.clear(engine.world, false); Engine.clear(engine); } };
  }
  return { create, pull, shapeBox, groundAt, groundProfile, GROUND_STEP, LEVELS, MATERIAL, SLING, FLOOR, STEP, MAX_PULL, SCORE_MAX };
});
