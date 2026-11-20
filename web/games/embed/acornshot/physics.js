/* 도토리 새총단 — deterministic 120 Hz simulation; also exercised by Node tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./vendor/matter.min.js'), require('./levels.js'));
  else root.AcornPhysics = factory(root.Matter, root.AcornLevels);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M, L) {
  'use strict';
    const { Engine, Bodies, Body, Composite, Events, Vector, Constraint } = M;
  const STEP = 1000 / 120, FLOOR = 574, WORLD_WIDTH = 1500, SLING = { x: 205, y: 432 }, MAX_PULL = 86, SCORE_MAX = 20000;
  // The rotating sprite extends beyond its 22px collider (ears reach 38px).
  const TARGET_MARGIN = 38, TARGET_BOUNCE = .25, TARGET_DAMAGE = 1.75, TARGET_GRAZE = 2, TARGET_FALL_FROM = 45, TARGET_FALL = .22;
  // New-stage limits: a stronger sling never moves a shot more than 17px per 120 Hz step,
  // so even the thinnest 12px pane cannot be tunnelled by the 13px split seeds.
  const SHOT_MAX_SPEED = 34, MAX_POWER = 1.7, BOUNCE_MAX_SPEED = 30;
  const MATERIAL = {
    wood: { hp: 15, density: .0024, color: '#c58a4d', edge: '#754828', points: 120 },
    ice: { hp: 7, density: .0015, color: '#a2e5e6', edge: '#4a969e', points: 150 },
    stone: { hp: 32, density: .0045, color: '#a1ada8', edge: '#5c716d', points: 200 },
    // Resin barrels burst like a bomb acorn (see `blast`).
    resin: { hp: 4, density: .002, color: '#c8803a', edge: '#6b3f1f', points: 100 },
  };
  // Stage data lives in levels.js. The first LEGACY_COUNT stages use the original
  // fixed 1,500px world and must keep bit-identical physics.
  const LEVELS = L.LEVELS, LEGACY_COUNT = L.LEGACY_COUNT;
  function pull(x, y, sling = SLING) {
    let dx = Math.min(0, x - sling.x), dy = y - sling.y;
    const length = Math.hypot(dx, dy);
    if (length > MAX_PULL) { dx *= MAX_PULL / length; dy *= MAX_PULL / length; }
    return { x: sling.x + dx, y: sling.y + dy };
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
  // Playfield size. Old stages leave these out: 1,500 wide, sky at 0, floor at 574.
  function worldOf(level) {
    return { width: level.width ?? WORLD_WIDTH, top: level.top ?? 0, bottom: level.bottom ?? FLOOR };
  }
  // Terrain: a piecewise-linear ground profile per stage, sampled every GROUND_STEP px.
  // Each tower gets a flat pad so it always starts stable on any hill, cliff or step.
  const GROUND_STEP = 20, PAD_HALF = 90;
  // Half-width of the flat pad laid under each part that stands on the ground.
  const PART_HALF = {
    tower: () => 90, wall: p => (p.cols ?? 2) * (p.brick?.[0] ?? 34) / 2 + 20 + (p.enemy === 'behind' ? 60 : 0),
    gate: p => (p.span ?? 150) / 2 + 30, pyramid: p => (p.rows ?? 4) * (p.brick?.[0] ?? 44) / 2 + 20,
    bunker: p => (p.w ?? 130) / 2 + 24, perch: p => Math.max(40, (p.width ?? 180) / 4), pane: p => (p.gap ?? 60) / 2 + 40,
    enemy: () => 30, barrel: () => 30,
  };
  const groundCache = new WeakMap();
  function groundOf(level) {
    const signature = JSON.stringify([level.ground, level.towers, level.parts, level.sling, level.width, level.bottom, level.bridges]);
    const cached = groundCache.get(level);
    if (cached && cached.signature === signature) return cached;
    const world = worldOf(level), FLOOR = world.bottom, WORLD_WIDTH = world.width;
    const points = level.ground ?? [[0, FLOOR], [WORLD_WIDTH, FLOOR]];
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
    for (let x = 0; x <= WORLD_WIDTH; x += GROUND_STEP) ys.push(Math.min(FLOOR, raw(x)));
    const bases = new Map();
    const pad = (x, half) => {
      const base = Math.min(FLOOR, raw(x));
      ys.forEach((_, i) => { if (Math.abs(i * GROUND_STEP - x) <= half) ys[i] = base; });
      return base;
    };
    for (const [towerX] of level.towers ?? []) {
      const base = Math.min(FLOOR, raw(towerX));
      bases.set(towerX, base);
      ys.forEach((_, i) => { if (Math.abs(i * GROUND_STEP - towerX) <= PAD_HALF) ys[i] = base; });
    }
    const partBase = new Map();
    if (level.sling && level.sling[1] == null) partBase.set('sling', pad(level.sling[0], 50));
    for (const part of level.parts ?? []) {
      if (part.on != null || part.y != null || !PART_HALF[part.type] || part.pad === false) continue;
      partBase.set(part, pad(part.x, PART_HALF[part.type](part)));
    }
    const ground = {
      signature, ys, raw, baseAt: towerX => bases.get(towerX) ?? FLOOR, partBase,
      y(x) {
        const t = Math.max(0, Math.min(WORLD_WIDTH, x)) / GROUND_STEP, i = Math.min(ys.length - 2, Math.floor(t));
        return ys[i] + (ys[i + 1] - ys[i]) * (t - i);
      },
    };
    groundCache.set(level, ground);
    return ground;
  }
  // Static terrain that is not ground: platforms (floating islands), the cave roof,
  // water / pits and bridge spans. Shared by physics, drawing and queries.
  const terrainCache = new WeakMap();
  function terrainOf(level) {
    const cached = terrainCache.get(level);
    if (cached) return cached;
    const world = worldOf(level);
    const platforms = (level.platforms ?? []).map(p => {
      const [x, y, w, h = 24, look = 'moss'] = Array.isArray(p) ? p : [p.x, p.y, p.w, p.h, p.look];
      return { x, y, w, h, look, x0: x - w / 2, x1: x + w / 2 };
    });
    const roof = level.roof ?? null;
    const water = (level.water ?? []).map(w => {
      const [x0, x1, y, pit = false] = Array.isArray(w) ? w : [w.x0, w.x1, w.y, w.pit];
      return { x0, x1, y, pit: !!pit };
    });
    const bridges = (level.bridges ?? []).map(b => ({ x0: b.x0, x1: b.x1, y: b.y, piers: b.piers ?? 1, material: b.material ?? 'wood' }));
    const roofAt = x => {
      if (!roof || x < roof[0][0] || x > roof.at(-1)[0]) return null;
      for (let i = 1; i < roof.length; i++) {
        if (x <= roof[i][0]) {
          const [x0, y0] = roof[i - 1], [x1, y1] = roof[i];
          return y0 + (y1 - y0) * (x - x0) / (x1 - x0 || 1);
        }
      }
      return roof.at(-1)[1];
    };
    const result = { world, platforms, roof, water, bridges, roofAt };
    terrainCache.set(level, result);
    return result;
  }
  function slingOf(level) {
    if (!level.sling) return { x: SLING.x, y: SLING.y, power: 1 };
    const [x, y] = level.sling;
    return { x, y: y ?? groundOf(level).partBase.get('sling') - 142, power: Math.min(MAX_POWER, level.power ?? 1) };
  }
  function groundAt(levelIndex, x) { return groundOf(LEVELS[levelIndex]).y(x); }
  function groundProfile(levelIndex) { return groundOf(LEVELS[levelIndex]).ys.slice(); }
  // The first solid surface (ground or platform top) at or below `fromY`.
  function surfaceAt(levelIndex, x, fromY = -Infinity) {
    const level = LEVELS[levelIndex], t = terrainOf(level);
    let y = groundOf(level).y(x);
    for (const p of t.platforms) if (x >= p.x0 && x <= p.x1 && p.y >= fromY && p.y < y) y = p.y;
    return y;
  }
  // True when a point is inside static terrain or outside the playfield.
  function blocked(levelIndex, x, y) {
    const level = LEVELS[levelIndex], t = terrainOf(level), w = t.world;
    if (x < 0 || x > w.width || y < w.top || y > groundOf(level).y(x)) return true;
    const roofY = t.roofAt(x);
    if (roofY != null && y < roofY) return true;
    return t.platforms.some(p => x >= p.x0 && x <= p.x1 && y >= p.y && y <= p.y + p.h);
  }
  function create(levelIndex = 0, notify = () => {}) {
    const level = LEVELS[levelIndex];
    if (!level) throw new RangeError('Unknown level');
    const ground = groundOf(level), world = worldOf(level), terrain = terrainOf(level), sling = slingOf(level);
    const { width: WORLD_WIDTH, top: WORLD_TOP, bottom: FLOOR } = world;
    // Old stages keep the exact original body set and step order.
    const extra = levelIndex >= LEGACY_COUNT;
    const engine = Engine.create({ enableSleeping: true, positionIterations: 10, velocityIterations: 8 });
    engine.gravity.y = 1;
    const state = { engine, levelIndex, phase: 'aim', blocks: [], targets: [], shots: [], devices: [], ropes: [], spent: 0, score: 0, time: 0, shotTime: 0, active: null, abilityUsed: false, destroyed: 0 };
    const removed = new Set();
    const pendingSupports = [];
    const scheduledSupports = new WeakMap();
    const pendingImpacts = [];
    const pendingBlasts = [], pendingBounces = [], pendingDrops = new Set(), pendingShatter = new Set();
    let firstHit = null, hitShown = false, blasting = false;
    let settling = true, quiet = 0, winWait = 0, winQuiet = 0, sweep = 0;
    const add = b => { Composite.add(engine.world, b); return b; };
    add(Bodies.rectangle(WORLD_WIDTH / 2, FLOOR + 50, WORLD_WIDTH + 320, 100, { isStatic: true, friction: .8 }));
    // Terrain pieces: convex quads from the ground profile down to the base floor.
    // New stages merge runs of equal slope into one piece (fewer static bodies).
    for (let i = 0; i < ground.ys.length - 1; i++) {
      const x0 = i * GROUND_STEP, y0 = ground.ys[i];
      let j = i + 1;
      if (extra) {
        const slope = ground.ys[i + 1] - y0;
        while (j < ground.ys.length - 1 && Math.abs(ground.ys[j + 1] - ground.ys[j] - slope) < 1e-9 && (y0 < FLOOR || ground.ys[j] >= FLOOR)) j++;
      }
      const x1 = j * GROUND_STEP, y1 = ground.ys[j];
      if (extra) i = j - 1;
      if (y0 >= FLOOR && y1 >= FLOOR) continue;
      const vertices = [{ x: x0 - 1, y: y0 }, { x: x1 + 1, y: y1 }, { x: x1 + 1, y: FLOOR + 20 }, { x: x0 - 1, y: FLOOR + 20 }];
      const centre = M.Vertices.centre(vertices);
      const piece = add(Bodies.fromVertices(centre.x, centre.y, [vertices], { isStatic: true, friction: .8, restitution: .05 }));
      piece.game = { kind: 'ground' };
    }
    // Invisible walls and ceiling keep every simulated piece inside the world.
    const wallH = 1000 + (FLOOR - 574) - WORLD_TOP;
    for (const [x, y, w, h] of [[-30, WORLD_TOP + 360 + (wallH - 1000) / 2, 60, wallH], [WORLD_WIDTH + 30, WORLD_TOP + 360 + (wallH - 1000) / 2, 60, wallH], [WORLD_WIDTH / 2, WORLD_TOP - 30, WORLD_WIDTH + 200, 60]]) {
      const wall = add(Bodies.rectangle(x, y, w, h, { isStatic: true, friction: .4, restitution: .2 }));
      wall.game = { kind: 'wall' };
    }
    // Cave roof: quads from above the sky line down to the roof polyline.
    if (terrain.roof) {
      for (let i = 1; i < terrain.roof.length; i++) {
        const [x0, y0] = terrain.roof[i - 1], [x1, y1] = terrain.roof[i];
        if (x1 - x0 < 1) continue;
        const vertices = [{ x: x0 - 1, y: WORLD_TOP - 40 }, { x: x1 + 1, y: WORLD_TOP - 40 }, { x: x1 + 1, y: y1 }, { x: x0 - 1, y: y0 }];
        const centre = M.Vertices.centre(vertices);
        add(Bodies.fromVertices(centre.x, centre.y, [vertices], { isStatic: true, friction: .6, restitution: .1 })).game = { kind: 'roof' };
      }
    }
    for (const p of terrain.platforms) add(Bodies.rectangle(p.x, p.y + p.h / 2, p.w, p.h, { isStatic: true, friction: .8, restitution: .05 })).game = { kind: 'platform', look: p.look };
    function block(x, y, w, h, material, hpScale = 1, options) {
      const m = MATERIAL[material];
      const b = add(Bodies.rectangle(x, y, w, h, { density: m.density, friction: .65, frictionStatic: .9, restitution: .04, chamfer: { radius: 2 }, ...options }));
      const hp = m.hp * (level.blockHp ?? 1) * hpScale;
      b.game = { kind: 'block', material, hp, maxHp: hp, w, h };
      if (material === 'resin') b.game.explosive = true;
      state.blocks.push(b);
      return b;
    }
    function target(x, y, hpScale = 1) {
      const b = add(Bodies.circle(x, y, 22, { density: .002, friction: .7, restitution: .05 }));
      // Armored enemies survive harmless bumps; they are defeated by hard impacts only.
      const hp = (level.enemyHp ?? 9) * hpScale;
      b.game = { kind: 'target', hp, maxHp: hp };
      state.targets.push(b);
      return b;
    }
    // A tower: per floor two posts, a deck and (optionally) a guard. The legacy
    // support rules release the floors above when a guard or support is lost.
    function buildTower(x, floors, materialOf, floorY, guardOn = () => true, hpScale = 1, enemyScale = 1, part) {
      const tower = [];
      for (let f = 0; f < floors; f++) {
        const material = materialOf(f), base = floorY - f * 112;
        const posts = [block(x - 55, base - 49, 18, 98, material, hpScale), block(x + 55, base - 49, 18, 98, material, hpScale)];
        const deck = block(x, base - 105, 146, 14, material, hpScale);
        const guard = guardOn(f) ? target(x, base - 23, enemyScale) : null;
        if (guard) guard.game.support = { tower, floor: f };
        for (const piece of [...posts, deck]) piece.game.support = { tower, floor: f };
        if (part) for (const piece of [...posts, deck, guard]) if (piece) piece.game.part = part;
        tower.push({ posts, deck, guard });
      }
      return tower;
    }
    for (const [x, floors, material] of level.towers ?? []) buildTower(x, floors, () => material, ground.baseAt(x));
    // ---- New-stage building kit: bridges, parts and devices (see docs/acornshot.md).
    const parts = [], HANGING = new Set(['hang', 'boulder', 'pendulum', 'icicle']);
    const bridgeAt = x => terrain.bridges.find(b => x >= b.x0 && x <= b.x1);
    function baseOf(part) {
      if (part.y != null) return part.y;
      if (typeof part.on === 'number') return terrain.platforms[part.on].y;
      if (part.on === 'bridge') return bridgeAt(part.x).y;
      return ground.partBase.get(part) ?? Math.min(FLOOR, ground.raw(part.x));
    }
    // The underside a rope, pendulum or icicle hangs from: explicit `top`, else roof, else a platform above.
    function ceilingOf(part, x = part.x) {
      if (part.top != null) return part.top;
      const roofY = terrain.roofAt(x);
      if (roofY != null) return roofY;
      const plat = terrain.platforms.filter(p => x >= p.x0 && x <= p.x1).sort((a, b) => a.y - b.y)[0];
      return plat ? plat.y + plat.h : WORLD_TOP;
    }
    const materials = (part, fallback) => i => (Array.isArray(part.materials) ? part.materials[Math.min(i, part.materials.length - 1)] : null) ?? part.material ?? fallback;
    function rope(anchor, body, offset, length) {
      const constraint = add(Constraint.create({ pointA: { ...anchor }, bodyB: body, pointB: { ...offset }, length, stiffness: 1, damping: .05 }));
      const r = { constraint, anchor: { ...anchor }, body, cut: false };
      state.ropes.push(r);
      return r;
    }
    function device(b, kind, extraGame = {}) {
      b.game = { kind, ...extraGame };
      state.devices.push(b);
      return b;
    }
    const BUILD = {
      tower(p, rec, base) {
        const floors = p.floors ?? 2, mat = materials(p, 'wood');
        const on = p.enemies ?? 'each';
        const guardOn = f => on === 'each' || (on === 'top' && f === floors - 1) || (Array.isArray(on) && on.includes(f));
        buildTower(p.x, floors, mat, base, guardOn, p.blockHp ?? 1, p.hp ?? 1, rec);
      },
      wall(p, rec, base) {
        const cols = p.cols ?? 2, rows = p.rows ?? 5, [bw, bh] = p.brick ?? [34, 30], mat = materials(p, 'stone');
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) block(p.x + (c - (cols - 1) / 2) * bw, base - bh / 2 - r * bh, bw, bh, mat(r), p.blockHp ?? 1);
        if (p.enemy === 'top') target(p.x, base - rows * bh - 23, p.hp ?? 1);
        if (p.enemy === 'behind') target(p.x + cols * bw / 2 + 34, base - 23, p.hp ?? 1);
      },
      gate(p, rec, base) {
        const span = p.span ?? 150, height = p.height ?? 90, mat = materials(p, 'wood');
        block(p.x - span / 2, base - height / 2, 20, height, mat(0), p.blockHp ?? 1);
        block(p.x + span / 2, base - height / 2, 20, height, mat(0), p.blockHp ?? 1);
        block(p.x, base - height - 7, span + 40, 14, mat(1), p.blockHp ?? 1);
        const under = p.enemies ?? 1;
        for (let i = 0; i < under; i++) target(p.x + (under === 1 ? 0 : (i - (under - 1) / 2) * 50), base - 23, p.hp ?? 1);
        if (p.top) target(p.x, base - height - 14 - 23, p.hp ?? 1);
      },
      pyramid(p, rec, base) {
        const rows = p.rows ?? 4, [bw, bh] = p.brick ?? [44, 30], mat = materials(p, 'stone');
        for (let r = 0; r < rows; r++) {
          const n = rows - r;
          for (let i = 0; i < n; i++) block(p.x + (i - (n - 1) / 2) * bw, base - bh / 2 - r * bh, bw - 1, bh, mat(r), p.blockHp ?? 1);
        }
        if (p.enemy !== 'none') target(p.x, base - rows * bh - 23, p.hp ?? 1);
      },
      bunker(p, rec, base) {
        const w = p.w ?? 130, h = p.h ?? 56, mat = materials(p, 'stone');
        block(p.x - w / 2 + 13, base - h / 2, 26, h, mat(0), p.blockHp ?? 1);
        block(p.x + w / 2 - 13, base - h / 2, 26, h, mat(0), p.blockHp ?? 1);
        block(p.x, base - h - 11, w + 20, 22, mat(1), p.blockHp ?? 1);
        target(p.x, base - 23, p.hp ?? 1);
      },
      perch(p, rec, base) {
        const height = p.height ?? 110, width = p.width ?? 180, mat = materials(p, 'wood');
        block(p.x, base - height / 2, 12, height, mat(0), p.blockHp ?? 1);
        block(p.x, base - height - 7, width, 14, mat(1), p.blockHp ?? 1);
        const n = p.enemies ?? 2;
        for (let i = 0; i < n; i++) target(p.x + (n === 1 ? 0 : (i - (n - 1) / 2) * (width - 60) / (n - 1)), base - height - 14 - 23, p.hp ?? 1);
      },
      pane(p, rec, base) {
        const height = p.height ?? 64, gap = p.gap ?? 60, mat = materials(p, 'ice');
        block(p.x - gap / 2 - 6, base - height / 2, 12, height, mat(0), p.blockHp ?? 1);
        block(p.x + gap / 2 + 6, base - height / 2, 12, height, mat(0), p.blockHp ?? 1);
        block(p.x, base - height - 6, gap + 40, 12, mat(1), p.blockHp ?? 1);
        if (p.enemy !== false) target(p.x, base - 23, p.hp ?? 1);
      },
      hang(p, rec) {
        const top = ceilingOf(p), length = p.length ?? 120, mat = materials(p, 'wood');
        if (p.load === 'cage') {
          const w = p.w ?? 110, y = top + length + 6;
          const floor = block(p.x, y, w, 12, mat(0), p.blockHp ?? 1);
          block(p.x - w / 2 + 5, y - 26, 10, 40, mat(0), p.blockHp ?? 1);
          block(p.x + w / 2 - 5, y - 26, 10, 40, mat(0), p.blockHp ?? 1);
          target(p.x, y - 6 - 23, p.hp ?? 1);
          for (const side of [-1, 1]) rope({ x: p.x + side * (w / 2 - 12), y: top }, floor, { x: side * (w / 2 - 12), y: -6 }, length);
        } else {
          const s = p.size ?? 50, crate = block(p.x, top + length + s / 2, s, s, mat(0), p.blockHp ?? 1);
          rope({ x: p.x, y: top }, crate, { x: 0, y: -s / 2 }, length);
        }
      },
      enemy(p, rec, base) { target(p.x, base - 23, p.hp ?? 1); },
      barrel(p, rec, base) { block(p.x, base - 22, 34, 44, 'resin', p.blockHp ?? 1); },
      boulder(p, rec) {
        const r = p.r ?? 30, look = p.look ?? 'stone';
        // Sit the ball on the slope at p.x (contact point C, up-normal n, downhill t).
        const slope = (ground.y(p.x + 4) - ground.y(p.x - 4)) / 8, len = Math.hypot(1, slope);
        const C = { x: p.x, y: ground.y(p.x) }, n = { x: slope / len, y: -1 / len };
        const b = add(Bodies.circle(C.x + n.x * (r + .5), C.y + n.y * (r + .5), r, { density: look === 'stone' ? .006 : look === 'log' ? .0045 : .004, friction: .6, frictionStatic: 1, restitution: .05, frictionAir: .002 }));
        device(b, 'boulder', { look, r, heavy: 2.4 + b.mass * .8 });
        const side = p.wedge ?? (slope > .01 ? 'right' : slope < -.01 ? 'left' : 'none');
        if (side !== 'none') {
          // The chock lies flat on the slope, touching the ball's downhill side. It is
          // pinned (static) until it breaks, so the ball stays put before the first shot.
          const dir = side === 'right' ? 1 : -1, t = { x: dir / len, y: dir * slope / len };
          const h = Math.min(18, r), face = Math.sqrt(r * r - (r - h) ** 2);
          const wedge = block(C.x + t.x * (face + 9.5) + n.x * (h / 2 + .5), C.y + t.y * (face + 9.5) + n.y * (h / 2 + .5), 18, h, 'wood', p.wedgeHp ?? .5, { friction: 1, frictionStatic: 1.2 });
          Body.setAngle(wedge, Math.atan(slope));
          Body.setStatic(wedge, true);
          wedge.game.part = rec; wedge.game.wedge = true;
        }
      },
      mushroom(p, rec, base) {
        const r = p.r ?? 46;
        const b = add(Bodies.circle(p.x, base + r * .45, r, { isStatic: true, friction: .3, restitution: .6 }));
        b.game = { kind: 'mushroom', r, boost: p.boost ?? 8, base };
        state.devices.push(b);
      },
      pendulum(p, rec) {
        const top = ceilingOf(p), length = p.length ?? 160, r = p.r ?? 26;
        const bob = device(add(Bodies.circle(p.x, top + length, r, { density: .006, friction: .5, restitution: .1, frictionAir: .012 })), 'bob', { r });
        bob.game.heavy = 2.4 + bob.mass * .35;
        rope({ x: p.x, y: top }, bob, { x: 0, y: 0 }, length);
      },
      icicle(p, rec) {
        const top = ceilingOf(p), len = p.len ?? 64, w = p.w ?? 26;
        const vertices = [{ x: p.x - w / 2, y: top }, { x: p.x + w / 2, y: top }, { x: p.x, y: top + len }];
        const centre = M.Vertices.centre(vertices);
        const b = add(Bodies.fromVertices(centre.x, centre.y, [vertices], { density: .003, friction: .4, restitution: .05 }));
        Body.setStatic(b, true);
        device(b, 'icicle', { falling: false, w, len, heavy: 5 });
      },
    };
    if (extra) {
      // Bridge spans: planks resting on the cliff edges and on breakable piers.
      for (const br of terrain.bridges) {
        const rec = { type: 'bridge' };
        const supports = [br.x0];
        for (let i = 1; i <= br.piers; i++) supports.push(br.x0 + (br.x1 - br.x0) * i / (br.piers + 1));
        supports.push(br.x1);
        for (let i = 1; i <= br.piers; i++) {
          const px = supports[i], foot = Math.min(FLOOR, ground.raw(px)), h = foot - (br.y + 14);
          block(px, br.y + 14 + h / 2, 24, h, br.material).game.part = rec;
        }
        for (let i = 0; i < supports.length - 1; i++) {
          const a = supports[i] + (i === 0 ? -30 : .5), b = supports[i + 1] + (i === supports.length - 2 ? 30 : -.5);
          block((a + b) / 2, br.y + 7, b - a, 14, br.material).game.part = rec;
        }
      }
      for (const p of level.parts ?? []) {
        if (!BUILD[p.type]) throw new Error(`Unknown part type: ${p.type}`);
        const rec = { type: p.type };
        parts.push(rec);
        const nb = state.blocks.length, nt = state.targets.length, nd = state.devices.length;
        BUILD[p.type](p, rec, HANGING.has(p.type) ? undefined : baseOf(p));
        for (const b of [...state.blocks.slice(nb), ...state.targets.slice(nt), ...state.devices.slice(nd)]) b.game.part ??= rec;
      }
    }
    // Device contacts (new stages only): mushroom bounces, icicle triggers and spikes.
    function deviceContact(a, b, impact) {
      for (const [d, other] of [[a, b], [b, a]]) {
        const kind = d.game?.kind;
        // Heavy rolling / swinging things crush even at low speed: damage scales with their mass.
        if ((kind === 'boulder' || kind === 'bob') && impact >= .8 && (other.game?.kind === 'block' || other.game?.kind === 'target') && !other.game.wedge) damage(other, impact * d.game.heavy * .9);
        // A hard hit on a chocked boulder jolts its chock loose.
        if (kind === 'boulder' && other.game?.kind === 'shot' && impact >= 4) for (const w of state.blocks) if (w.game.wedge && w.game.part === d.game.part) damage(w, impact * 3);
        if (kind === 'mushroom' && !other.isStatic && impact >= 2) pendingBounces.push({ body: other, mush: d, v: { ...other.velocity } });
        if (kind === 'icicle' && !d.game.falling && impact >= 1.8 && ['shot', 'spentShot', 'block', 'bob', 'boulder'].includes(other.game?.kind)) pendingDrops.add(d);
        if (kind === 'icicle' && d.game.falling && impact >= 1.8 && other.game?.kind !== 'shot') {
          if (other.game?.kind === 'block' || other.game?.kind === 'target') damage(other, 12 + impact * d.game.heavy);
          pendingShatter.add(d);
        }
      }
    }
    // Enemies (2026-11-21): a straight acorn hit, a fall of half a floor or more, a hard tumble
    // or a falling plank defeat them; a graze, a slight push or a slow lean does not.
    function targetHit(body, other, impact) {
      let hit = Math.max(0, impact - TARGET_GRAZE);
      if (other.game?.kind === 'shot') hit *= 3.8;
      else if (other.game?.kind === 'block' || other.game?.kind === 'boulder' || other.game?.kind === 'bob') hit *= 2.4 * Math.max(1, Math.sqrt(other.mass) * .8);
      else hit *= 2.4;
      const top = body.game.fallTop ?? body.position.y, drop = body.position.y - top;
      if (drop >= TARGET_FALL_FROM && body.velocity.y - other.velocity.y > 1) {
        hit += (drop - TARGET_FALL_FROM + 10) * TARGET_FALL;
        body.game.fallTop = body.position.y;
      }
      return hit;
    }
    function damage(b, value) {
      if (!b.game || removed.has(b) || (b.game.kind !== 'block' && b.game.kind !== 'target')) return;
      b.game.hp -= value * (b.game.kind === 'target' ? TARGET_DAMAGE : 1);
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
        if (extra) deviceContact(a, b, impact);
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
          if (body.game?.kind === 'target') { damage(body, targetHit(body, other, impact)); continue; }
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
          if (piece && !removed.has(piece) && (state.blocks.includes(piece) || state.targets.includes(piece))) {
            if (piece.game.kind === 'block') piece.game.dropTop ??= piece.position.y;
            M.Sleeping.set(piece, false);
            Body.setVelocity(piece, { x: piece.velocity.x, y: Math.max(piece.velocity.y, .45) });
          }
        }
      }
    }
    // Non-tower parts: wake the rest of the part and anything resting above the lost
    // piece, so sleeping bodies never stay suspended in mid-air.
    function wakeAround(lost) {
      const box = shapeBox(lost), rec = lost.game.part;
      for (const piece of [...state.blocks, ...state.targets, ...state.devices]) {
        if (piece === lost || removed.has(piece) || piece.isStatic) continue;
        const pb = shapeBox(piece);
        const above = pb.max.x > box.min.x - 40 && pb.min.x < box.max.x + 40 && pb.max.y <= box.max.y + 4 && pb.min.y > box.min.y - 420;
        if (!above && !(rec && piece.game.part === rec)) continue;
        if (piece.game.kind === 'block') piece.game.dropTop ??= piece.position.y;
        M.Sleeping.set(piece, false);
        Body.setVelocity(piece, { x: piece.velocity.x, y: Math.max(piece.velocity.y, .45) });
      }
    }
    // Matter never wakes a sleeping body when what held it up breaks or slides away, so
    // after every shot a sweep wakes any sleeping piece with nothing touching its underside
    // (ground, platform, another body; a rope counts as support). Pieces resting directly on
    // a woken one are woken with it. Runs only after a launch, so stages stay still before it.
    const VMIN = M.Vertices;
    function underside(b) {
      const pts = [];
      for (const part of b.parts.length > 1 ? b.parts.slice(1) : [b]) {
        const v = part.vertices, c = part.position;
        // The lowest corner too, so a point standing on its tip still counts as resting.
        const low = v.reduce((m, q) => (q.y > m.y ? q : m), v[0]);
        pts.push({ x: low.x, y: low.y + 3 });
        for (let i = 0; i < v.length; i++) {
          const a = v[i], z = v[(i + 1) % v.length], dx = z.x - a.x, dy = z.y - a.y, len = Math.hypot(dx, dy) || 1;
          let nx = dy / len, ny = -dx / len;
          if (nx * ((a.x + z.x) / 2 - c.x) + ny * ((a.y + z.y) / 2 - c.y) < 0) { nx = -nx; ny = -ny; }
          if (ny < .25) continue;
          const n = Math.max(1, Math.ceil(len / 6));
          for (let k = 0; k <= n; k++) pts.push({ x: a.x + dx * k / n + nx * 3, y: a.y + dy * k / n + ny * 3 });
        }
      }
      return pts;
    }
    function resting(b, all) {
      const pts = underside(b), bb = b.bounds;
      for (const o of all) {
        if (o === b || o.bounds.max.x < bb.min.x - 4 || o.bounds.min.x > bb.max.x + 4 || o.bounds.max.y < bb.min.y - 4 || o.bounds.min.y > bb.max.y + 4) continue;
        for (const part of o.parts.length > 1 ? o.parts.slice(1) : [o]) for (const p of pts) if (VMIN.contains(part.vertices, p)) return true;
      }
      return false;
    }
    function wakeFalling(b) {
      if (b.game.kind === 'block') b.game.dropTop ??= b.position.y;
      if (b.game.kind === 'target') b.game.fallTop = Math.min(b.game.fallTop ?? b.position.y, b.position.y);
      M.Sleeping.set(b, false);
      Body.setVelocity(b, { x: b.velocity.x, y: Math.max(b.velocity.y, .45) });
    }
    function wakeUnsupported() {
      const all = Composite.allBodies(engine.world);
      const hung = new Set(state.ropes.filter(r => !r.cut).map(r => r.body));
      const loose = [...state.blocks, ...state.targets, ...state.devices, ...state.shots].filter(b => !b.isStatic && !removed.has(b));
      const woken = [];
      for (const b of loose) {
        if (!b.isSleeping || hung.has(b) || resting(b, all)) continue;
        // Woken before and still in the same spot: it is wedged or held from the side, not falling.
        const at = b.game.sweptAt;
        if (at && Math.hypot(b.position.x - at.x, b.position.y - at.y) < 2) continue;
        b.game.sweptAt = { x: b.position.x, y: b.position.y };
        wakeFalling(b); woken.push(b);
      }
      // Whatever sits on a woken piece comes down with it.
      for (let i = 0; i < woken.length; i++) {
        const box = woken[i].bounds;
        for (const b of loose) {
          if (!b.isSleeping || hung.has(b)) continue;
          const bb = b.bounds;
          if (bb.max.x > box.min.x - 2 && bb.min.x < box.max.x + 2 && bb.max.y <= box.min.y + 8 && bb.max.y >= box.min.y - 8) { wakeFalling(b); woken.push(b); }
        }
      }
      return woken.length;
    }
    function cutRope(r, reason) {
      if (r.cut) return;
      r.cut = true;
      Composite.remove(engine.world, r.constraint);
      M.Sleeping.set(r.body, false);
      if (r.body.game.kind === 'block') r.body.game.dropTop ??= r.body.position.y;
      for (const piece of [...state.blocks, ...state.targets]) if (r.body.game.part && piece.game.part === r.body.game.part) { M.Sleeping.set(piece, false); if (piece.game.kind === 'block') piece.game.dropTop ??= piece.position.y; }
      notify({ type: 'snap', x: (r.anchor.x + r.body.position.x) / 2, y: (r.anchor.y + r.body.position.y) / 2, reason });
    }
    function dropIcicle(d) {
      if (d.game.falling || !state.devices.includes(d)) return;
      d.game.falling = true;
      Body.setStatic(d, false);
      M.Sleeping.set(d, false);
      notify({ type: 'icicle', ...d.position });
    }
    function scheduleCollapse(tower, floor, delay) {
      let floors = scheduledSupports.get(tower);
      if (!floors) { floors = new Set(); scheduledSupports.set(tower, floors); }
      if (floors.has(floor)) return;
      floors.add(floor);
      pendingSupports.push({ tower, floor, at: state.time + delay });
    }
    function flush() {
      for (const b of removed) {
        Composite.remove(engine.world, b);
        const targetHit = b.game.kind === 'target';
        if (b.game.support) {
          const { tower, floor } = b.game.support;
          if (targetHit) {
            // The bottom guard of a floor braces its posts. Releasing them is
            // delayed briefly so impacts and each collapse read as separate beats.
            if (floor + 1 < tower.length) scheduleCollapse(tower, floor, 140);
          } else {
            // A missing post or deck means this floor no longer braces the stack.
            // Tip any remaining support away so a single sleeping post cannot leave
            // the deck and enemies suspended in mid-air.
            scheduleCollapse(tower, floor, 60);
          }
        } else if (extra) {
          wakeAround(b);
          for (const r of state.ropes) if (r.body === b) cutRope(r, 'broken');
          if (b.game.explosive) pendingBlasts.push({ x: b.position.x, y: b.position.y, at: state.time + (blasting ? 100 : 0) });
        }
        state.score = Math.min(SCORE_MAX, state.score + (targetHit ? 1000 : MATERIAL[b.game.material].points));
        state.destroyed += targetHit ? 1 : 0;
        state.targets = state.targets.filter(v => v !== b);
        state.blocks = state.blocks.filter(v => v !== b);
        notify({ type: 'break', ...b.position, vx: b.velocity.x, vy: b.velocity.y, target: targetHit, material: b.game.material, w: b.game.w, h: b.game.h, color: targetHit ? '#8873ae' : MATERIAL[b.game.material].color, ...(b.game.sunk ? { sunk: true } : {}) });
      }
      removed.clear();
    }
    function releaseImpacts() {
      for (const { body, other, energy } of pendingImpacts) {
        const { x, y } = body.position;
        damage(body, energy * .72);
        damage(other, energy);
        for (const piece of [...state.blocks, ...state.targets]) {
          if (piece === body || piece === other || removed.has(piece) || piece.isStatic) continue;
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
        scheduledSupports.get(tower)?.delete(floor);
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
    // Explosion side effects on devices (new stages): ropes snap, icicles drop, heavy things get shoved.
    function deviceBlast(center, radius) {
      for (const r of state.ropes) {
        if (r.cut) continue;
        const end = Vector.add(r.body.position, r.constraint.pointB);
        if (segmentDistance(center, r.anchor, end) < radius * .7) cutRope(r, 'blast');
      }
      for (const d of [...state.devices]) {
        const delta = Vector.sub(d.position, center), dist = Vector.magnitude(delta);
        if (dist > radius) continue;
        if (d.game.kind === 'icicle') dropIcicle(d);
        if (d.game.kind === 'boulder' || d.game.kind === 'bob') {
          const s = 1 - dist / radius;
          M.Sleeping.set(d, false);
          Body.setVelocity(d, { x: d.velocity.x + (delta.x / (dist || 1)) * s * 6, y: d.velocity.y + (delta.y / (dist || 1)) * s * 6 - 1.5 });
        }
      }
    }
    // Resin barrel burst: same shape as the bomb acorn, slightly smaller.
    const BARREL_RADIUS = 135;
    function blast(center) {
      blasting = true;
      for (const other of [...state.blocks, ...state.targets]) {
        const delta = Vector.sub(other.position, center), d = Vector.magnitude(delta);
        if (d > BARREL_RADIUS) continue;
        if (other.isStatic) { damage(other, 46 * (1 - d / BARREL_RADIUS)); continue; }
        const strength = 1 - d / BARREL_RADIUS;
        damage(other, 46 * strength);
        Body.setVelocity(other, { x: other.velocity.x + (delta.x / (d || 1)) * strength * 12, y: other.velocity.y + (delta.y / (d || 1)) * strength * 12 - 2.5 });
        M.Sleeping.set(other, false);
      }
      deviceBlast(center, BARREL_RADIUS);
      notify({ type: 'blast', ...center, source: 'barrel' });
      flush();
      blasting = false;
    }
    function segmentDistance(p, a, b) {
      const ab = Vector.sub(b, a), len2 = Vector.magnitudeSquared(ab) || 1;
      const t = Math.max(0, Math.min(1, Vector.dot(Vector.sub(p, a), ab) / len2));
      return Vector.magnitude(Vector.sub(p, Vector.add(a, Vector.mult(ab, t))));
    }
    function shot(x, y, kind, velocity, radius = 20) {
      const b = add(Bodies.circle(x, y, radius, { density: .012, friction: .5, restitution: .3, frictionAir: .0003 }));
      b.game = { kind: 'shot', ammo: kind, radius, turn: state.spent };
      Body.setVelocity(b, velocity);
      state.shots.push(b);
      return b;
    }
    function retireCurrentShots() {
      for (const b of state.shots) {
        if (b.game.kind === 'shot' && b.game.turn === state.spent) b.game.kind = 'spentShot';
      }
      state.active = null;
    }
    function launch(x, y) {
      if (state.phase !== 'aim' || state.spent >= level.ammo.length) return false;
      const p = pull(x, y, sling), dx = sling.x - p.x, dy = sling.y - p.y;
      if (Math.hypot(dx, dy) < 8) return false;
      state.active = shot(p.x, p.y, level.ammo[state.spent++], { x: dx * .225 * sling.power, y: dy * .225 * sling.power });
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
          if (other.isStatic) continue;
          Body.setVelocity(other, { x: other.velocity.x + (delta.x / (d || 1)) * strength * 14, y: other.velocity.y + (delta.y / (d || 1)) * strength * 14 - 3 });
          M.Sleeping.set(other, false);
        }
        if (extra) { blasting = true; deviceBlast(center, 165); }
        notify({ type: 'blast', ...center });
        b.game.kind = 'spentShot'; state.active = null;
        Body.setVelocity(b, { x: b.velocity.x * .15, y: Math.min(0, b.velocity.y * .15) });
        flush();
        blasting = false;
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
      for (const b of [...state.blocks, ...state.shots, ...state.devices]) {
        if (b.isStatic) continue;
        let vx = b.velocity.x, vy = b.velocity.y, moved = false;
        for (let pass = 0; pass < 4; pass++) {
          const box = shapeBox(b);
          const dx = box.min.x < 0 ? -box.min.x : box.max.x > WORLD_WIDTH ? WORLD_WIDTH - box.max.x : 0;
          const dy = box.min.y < WORLD_TOP ? WORLD_TOP - box.min.y : box.max.y > FLOOR ? FLOOR - box.max.y : 0;
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
        // An enemy that rode a collapse down (on a sliding plank, a tilting deck) never starts a
        // hard new contact, so its fall is counted when it comes to rest: half a floor or more
        // lower than where it last rested hurts like the same free drop.
        const still = b.isSleeping || b.speed < .3;
        if (still && state.phase === 'flight' && b.game.fallTop != null) {
          const drop = b.position.y - b.game.fallTop;
          if (drop >= TARGET_FALL_FROM) damage(b, (drop - TARGET_FALL_FROM + 10) * TARGET_FALL);
        }
        // Highest point since the enemy last rested: how far it has fallen when it lands.
        if (still) b.game.fallTop = b.position.y;
        else b.game.fallTop = Math.min(b.game.fallTop ?? b.position.y, b.position.y);
        const { x, y } = b.position;
        const nx = Math.max(TARGET_MARGIN, Math.min(WORLD_WIDTH - TARGET_MARGIN, x));
        const ny = Math.max(WORLD_TOP + TARGET_MARGIN, Math.min(FLOOR - 22, y));
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
    // New-stage per-step rules: bounces, speed cap, rope cuts, icicles, water and pits.
    function stepDevices() {
      for (const { body, mush, v } of pendingBounces) {
        if (!body.game || body.isStatic) continue;
        const n = Vector.normalise(Vector.sub(body.position, mush.position));
        const vn = Vector.dot(v, n);
        if (vn >= -.5) continue;
        let out = Vector.mult(Vector.sub(v, Vector.mult(n, 2 * vn)), .8);
        const recent = body.game.bouncedAt != null && state.time - body.game.bouncedAt < 1500;
        if (!recent) out = Vector.add(out, Vector.mult(n, mush.game.boost));
        body.game.bouncedAt = state.time;
        const speed = Vector.magnitude(out);
        if (speed > BOUNCE_MAX_SPEED) out = Vector.mult(out, BOUNCE_MAX_SPEED / speed);
        Body.setVelocity(body, out);
        if (!recent) notify({ type: 'bounce', x: body.position.x, y: body.position.y, mushX: mush.position.x });
      }
      pendingBounces.length = 0;
      for (const b of state.shots) {
        if (b.speed > SHOT_MAX_SPEED) Body.setVelocity(b, Vector.mult(b.velocity, SHOT_MAX_SPEED / b.speed));
        if (b.game.kind !== 'shot' || b.speed < 2) continue;
        for (const r of state.ropes) {
          if (r.cut) continue;
          const end = Vector.add(r.body.position, r.constraint.pointB);
          if (segmentDistance(b.position, r.anchor, end) < b.game.radius + 4) cutRope(r, 'shot');
        }
      }
      for (const d of pendingDrops) dropIcicle(d);
      pendingDrops.clear();
      for (const d of pendingShatter) {
        if (!state.devices.includes(d)) continue;
        Composite.remove(engine.world, d);
        state.devices = state.devices.filter(v => v !== d);
        notify({ type: 'shatter', ...d.position, material: 'ice', color: MATERIAL.ice.color, w: d.game.w, h: d.game.len });
      }
      pendingShatter.clear();
      for (const zone of terrain.water) {
        const inside = b => b.position.x > zone.x0 && b.position.x < zone.x1 && b.position.y > zone.y;
        const splash = b => notify({ type: 'splash', x: b.position.x, y: zone.y, pit: zone.pit, mass: Math.min(30, b.mass) });
        for (const b of [...state.targets, ...state.blocks]) {
          if (!inside(b) || removed.has(b)) continue;
          if (!zone.pit) { Body.setVelocity(b, Vector.mult(b.velocity, .9)); Body.setAngularVelocity(b, b.angularVelocity * .9); }
          if (b.position.y > zone.y + (b.game.kind === 'target' ? 8 : 14)) { b.game.sunk = true; removed.add(b); splash(b); }
        }
        for (const b of [...state.devices, ...state.shots]) {
          if (b.isStatic || !inside(b)) continue;
          if (!zone.pit) Body.setVelocity(b, Vector.mult(b.velocity, .9));
          if (b.position.y < zone.y + 16) continue;
          Composite.remove(engine.world, b);
          for (const r of state.ropes) if (r.body === b) cutRope(r, 'sunk');
          state.devices = state.devices.filter(v => v !== b);
          state.shots = state.shots.filter(v => v !== b);
          if (state.active === b) state.active = null;
          splash(b);
        }
      }
    }
    function step() {
      if (state.phase !== 'aim' && state.phase !== 'flight') return;
      Engine.update(engine, STEP); state.time += STEP;
      releaseSupports();
      if (extra && state.phase === 'flight') stepDevices();
      containBodies();
      containTargets();
      if (state.phase !== 'flight') return;
      state.shotTime += STEP;
      if (firstHit) { notify(firstHit); firstHit = null; hitShown = true; }
      releaseImpacts();
      flush();
      if (pendingBlasts.length) {
        for (const p of pendingBlasts.filter(p => p.at <= state.time)) { pendingBlasts.splice(pendingBlasts.indexOf(p), 1); blast(p); }
      }
      let woke = 0;
      if (++sweep % 6 === 0) woke = wakeUnsupported();
      if (!state.targets.length) {
        winWait += STEP;
        const falling = state.blocks.some(b => b.game.dropTop != null && (b.speed > .5 || b.angularSpeed > .025));
        winQuiet = woke || falling || pendingSupports.length || pendingBlasts.length ? 0 : winQuiet + STEP;
        if (winWait > 900 && winQuiet > 260) finish(true);
        return;
      }
      const moving = [...state.shots, ...state.blocks, ...state.targets, ...state.devices].some(b => b.position.x > -60 && b.position.x < WORLD_WIDTH + 60 && b.position.y < FLOOR + 76 && !b.isSleeping && !b.isStatic && (b.speed > .65 || b.angularSpeed > .04));
      quiet = moving || woke ? 0 : quiet + STEP;
      // Never hand the next shot over while something still hangs in mid-air.
      if (!pendingSupports.length && !pendingBlasts.length && ((state.shotTime > 1800 && quiet > 650) || state.shotTime > 11000) && (state.shotTime > 12000 || !wakeUnsupported())) {
        retireCurrentShots();
        if (state.spent >= level.ammo.length) finish(false);
        else { state.phase = 'aim'; notify({ type: 'reload' }); }
      }
    }
    return { state, step, launch, ability, world, sling, level, pull: (x, y) => pull(x, y, sling), dispose() { Events.off(engine); Composite.clear(engine.world, false); Engine.clear(engine); } };
  }
  const levelAt = i => LEVELS[i];
  return {
    create, pull, shapeBox, groundAt, groundProfile, surfaceAt, blocked,
    worldOf: i => worldOf(levelAt(i)), slingOf: i => slingOf(levelAt(i)), terrainOf: i => terrainOf(levelAt(i)),
    GROUND_STEP, LEVELS, LEGACY_COUNT, MATERIAL, SLING, FLOOR, WORLD_WIDTH, STEP, MAX_PULL, SCORE_MAX, SHOT_MAX_SPEED, MAX_POWER,
  };
});
