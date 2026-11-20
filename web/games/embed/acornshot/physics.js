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
  const LEVELS = [
    { name: '숲 입구', tip: '아래쪽 나무 기둥을 노려 보세요.', ammo: ['seed', 'seed', 'bomb'], towers: [[800, 1, 'wood']] },
    { name: '반짝이는 온실', tip: '얼음은 가볍고 쉽게 부서져요.', ammo: ['seed', 'split', 'seed'], towers: [[790, 2, 'ice']] },
    { name: '쌍둥이 망루', tip: '공중에서 한 번 누르면 세 갈래로 갈라져요.', ammo: ['split', 'seed', 'bomb', 'seed'], towers: [[730, 1, 'wood'], [1000, 1, 'ice']] },
    { name: '오래된 돌문', tip: '폭탄 도토리는 공중에서 누르면 펑!', ammo: ['bomb', 'seed', 'bomb', 'seed'], towers: [[850, 2, 'stone']] },
    { name: '바람 언덕', tip: '높은 곳의 지붕을 무너뜨려 연쇄 충돌을 만드세요.', ammo: ['seed', 'split', 'bomb', 'seed'], towers: [[760, 3, 'wood']] },
    { name: '유리 숲', tip: '세 갈래 도토리로 양쪽 망루를 함께 노려요.', ammo: ['split', 'split', 'bomb', 'seed'], towers: [[720, 2, 'ice'], [1000, 2, 'ice']] },
    { name: '돌담 너머', tip: '단단한 돌담 뒤에도 약한 기둥이 있어요.', ammo: ['bomb', 'split', 'bomb', 'seed', 'seed'], towers: [[720, 1, 'stone'], [1000, 3, 'wood']] },
    { name: '도토리 성채', tip: '마지막 성채! 남긴 도토리마다 보너스 1,000점.', ammo: ['bomb', 'split', 'bomb', 'split', 'seed'], towers: [[720, 3, 'wood'], [1020, 3, 'ice']] },
  ];
  function pull(x, y) {
    let dx = Math.min(0, x - SLING.x), dy = y - SLING.y;
    const length = Math.hypot(dx, dy);
    if (length > MAX_PULL) { dx *= MAX_PULL / length; dy *= MAX_PULL / length; }
    return { x: SLING.x + dx, y: SLING.y + dy };
  }
  function create(levelIndex = 0, notify = () => {}) {
    const level = LEVELS[levelIndex];
    if (!level) throw new RangeError('Unknown level');
    const engine = Engine.create({ enableSleeping: true, positionIterations: 10, velocityIterations: 8 });
    engine.gravity.y = 1;
    const state = { engine, levelIndex, phase: 'aim', blocks: [], targets: [], shots: [], spent: 0, score: 0, time: 0, shotTime: 0, active: null, abilityUsed: false, destroyed: 0 };
    const removed = new Set();
    let settling = true, quiet = 0, winWait = 0;
    const add = b => { Composite.add(engine.world, b); return b; };
    add(Bodies.rectangle(640, FLOOR + 50, 1600, 100, { isStatic: true, friction: .8 }));
    function block(x, y, w, h, material) {
      const m = MATERIAL[material];
      const b = add(Bodies.rectangle(x, y, w, h, { density: m.density, friction: .65, frictionStatic: .9, restitution: .04, chamfer: { radius: 2 } }));
      b.game = { kind: 'block', material, hp: m.hp, maxHp: m.hp, w, h };
      state.blocks.push(b);
    }
    function target(x, y) {
      const b = add(Bodies.circle(x, y, 22, { density: .002, friction: .7, restitution: .05 }));
      b.game = { kind: 'target', hp: 9, maxHp: 9 };
      state.targets.push(b);
    }
    for (const [x, floors, material] of level.towers) {
      for (let f = 0; f < floors; f++) {
        const base = FLOOR - f * 112;
        block(x - 55, base - 49, 18, 98, material);
        block(x + 55, base - 49, 18, 98, material);
        block(x, base - 105, 146, 14, material);
        target(x, base - 23);
      }
    }
    function damage(b, value) {
      if (!b.game || removed.has(b) || b.game.kind === 'shot') return;
      b.game.hp -= value;
      if (b.game.hp <= 0) removed.add(b);
    }
    Events.on(engine, 'collisionStart', event => {
      if (settling || state.phase !== 'flight') return;
      for (const pair of event.pairs) {
        const a = pair.bodyA, b = pair.bodyB;
        const rv = Vector.sub(a.velocity, b.velocity);
        const impact = Math.abs(Vector.dot(rv, pair.collision.normal));
        if (impact < 1.8) continue;
        for (const [body, other] of [[a, b], [b, a]]) {
          const multiplier = other.game?.kind === 'shot' ? 3.8 : 2.4;
          damage(body, (impact - 1.3) * multiplier);
        }
      }
    });
    // Let stacks settle before enabling damage or player input.
    for (let i = 0; i < 180; i++) Engine.update(engine, STEP);
    settling = false;
    function flush() {
      for (const b of removed) {
        Composite.remove(engine.world, b);
        const targetHit = b.game.kind === 'target';
        state.score = Math.min(SCORE_MAX, state.score + (targetHit ? 1000 : MATERIAL[b.game.material].points));
        state.destroyed += targetHit ? 1 : 0;
        state.targets = state.targets.filter(v => v !== b);
        state.blocks = state.blocks.filter(v => v !== b);
        notify({ type: 'break', x: b.position.x, y: b.position.y, target: targetHit, color: targetHit ? '#8873ae' : MATERIAL[b.game.material].color });
      }
      removed.clear();
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
      state.stars = won ? (state.spent <= Math.ceil(level.ammo.length / 2) ? 3 : state.spent < level.ammo.length ? 2 : 1) : 0;
      notify({ type: 'finish', won, score: state.score, stars: state.stars });
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
      containTargets();
      if (state.phase !== 'flight') return;
      state.shotTime += STEP;
      for (const b of state.blocks) {
        if (b.position.y > 690 || b.position.x > 1380 || b.position.x < -100) removed.add(b);
      }
      flush();
      if (!state.targets.length) {
        winWait += STEP;
        if (winWait > 900) finish(true);
        return;
      }
      const moving = [...state.shots, ...state.blocks, ...state.targets].some(b => b.position.x > -60 && b.position.x < 1340 && b.position.y < 650 && !b.isSleeping && (b.speed > .65 || b.angularSpeed > .04));
      quiet = moving ? 0 : quiet + STEP;
      if ((state.shotTime > 1800 && quiet > 650) || state.shotTime > 11000) {
        for (const b of state.shots) Composite.remove(engine.world, b);
        state.shots = []; state.active = null;
        if (state.spent >= level.ammo.length) finish(false);
        else { state.phase = 'aim'; notify({ type: 'reload' }); }
      }
    }
    return { state, step, launch, ability, dispose() { Events.off(engine); Composite.clear(engine.world, false); Engine.clear(engine); } };
  }
  return { create, pull, LEVELS, MATERIAL, SLING, FLOOR, STEP, MAX_PULL, SCORE_MAX };
});
