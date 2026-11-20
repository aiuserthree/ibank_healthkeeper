/* node scripts/test-acornshot.cjs — physics regressions and real-shot solvability. */
const assert = require('node:assert/strict');
const P = require('../web/games/embed/acornshot/physics.js');
const { Body, Sleeping, Composite } = require('../web/games/embed/acornshot/vendor/matter.min.js');
const fs = require('node:fs');
const solver = require('./acornshot-solve.cjs');
// The first LEGACY stages keep the original 1,500px world; their checks below are unchanged.
const LEGACY = P.LEGACY_COUNT;
assert.equal(LEGACY, 12, 'The original twelve stages stay at indexes 0-11');
for (let l = 0; l < LEGACY; l++) {
  assert.deepEqual(P.worldOf(l), { width: P.WORLD_WIDTH, top: 0, bottom: P.FLOOR }, `Stage ${l + 1} keeps the original world`);
  assert.deepEqual(P.slingOf(l), { ...P.SLING, power: 1 }, `Stage ${l + 1} keeps the original sling`);
}
// Keep the entire rotating enemy sprite (including ears) inside the viewport.
// Exercise both aiming and flight, including velocities large enough to tunnel
// through a thin wall. Boundary contact must not count as defeating an enemy.
for (const flight of [false, true]) {
  for (const [x, y, vx, vy] of [[40, 180, -100, 0], [P.WORLD_WIDTH - 40, 180, 100, 0], [500, 40, 0, -100], [500, 540, 0, 200], [P.WORLD_WIDTH - 40, 40, 100, -100]]) {
    const sim = P.create(0), target = sim.state.targets[0];
    if (flight) sim.launch(180, 490);
    Body.setPosition(target, { x, y }); Body.setVelocity(target, { x: vx, y: vy }); Sleeping.set(target, false);
    sim.step();
    assert.ok(target.position.x >= 38 && target.position.x <= P.WORLD_WIDTH - 38, 'Enemy stays within horizontal sprite-safe bounds');
    assert.ok(target.position.y >= 38 && target.position.y <= P.FLOOR - 22, 'Enemy stays below screen top and above ground');
    assert.equal(sim.state.targets.length, 1, 'Boundary must not delete the enemy');
    assert.equal(sim.state.score, 0, 'Boundary must not award points');
    if (x === 40) assert.ok(target.velocity.x >= 0, 'Left edge redirects velocity inward');
    if (x === P.WORLD_WIDTH - 40) assert.ok(target.velocity.x <= 0, 'Right edge redirects velocity inward');
    if (y === 40) assert.ok(target.velocity.y >= 0, 'Top edge redirects velocity inward');
    sim.dispose();
  }
}
console.log('PASS enemy bounds: aim/flight, all edges, corner, high-speed overshoot, no free score.');
// Every simulated body (blocks, shots and enemies) must stay inside the world.
for (const [level, forceX, forceY] of [[7, 120, -60], [7, -120, -60], [1, 160, -160], [3, 220, 40]]) {
  const sim = P.create(level);
  sim.launch(125, 470);
  for (const b of [...sim.state.blocks, ...sim.state.targets, ...sim.state.shots]) {
    Sleeping.set(b, false);
    Body.setVelocity(b, { x: forceX * (Math.random() * .6 + .4), y: forceY * Math.random() });
    Body.setAngularVelocity(b, 1.5);
  }
  for (let i = 0; i < 900 && ['aim', 'flight'].includes(sim.state.phase); i++) {
    sim.step();
    for (const b of [...sim.state.blocks, ...sim.state.targets, ...sim.state.shots]) {
      const box = P.shapeBox(b);
      assert.ok(box.min.x >= -2 && box.max.x <= P.WORLD_WIDTH + 2 && box.min.y >= -2 && box.max.y <= 720, `Stage ${level + 1} body stayed in view`);
    }
  }
  sim.dispose();
}
console.log('PASS all blocks, shots and enemies stay inside the visible playfield under extreme force.');
// Armored guards: a direct bomb defeats the foundation guard, which must release its
// floor and bring the roof and upper guards down.
const collapseEvents = [];
const collapse = P.create(7, event => collapseEvents.push({ ...event, time: collapse.state.time }));
const towerGuards = collapse.state.targets.filter(t => t.position.x < 900);
const [lower, middle, upper] = towerGuards;
const otherTower = collapse.state.targets.find(t => t.position.x > 900);
const upperStart = [middle.position.y, upper.position.y];
const otherStart = otherTower.position.y;
const lowerDeck = collapse.state.blocks.find(b => b.position.x < 900 && b.game.w > 100);
const upperDeck = collapse.state.blocks.filter(b => b.position.x < 900 && b.game.w > 100).at(-1);
const deckStart = lowerDeck.position.y, upperDeckStart = upperDeck.position.y;
collapse.launch(135, 450);
Body.setPosition(collapse.state.active, { x: lower.position.x, y: lower.position.y });
assert.equal(collapse.ability(), true);
assert.ok(!collapse.state.targets.includes(lower), 'A direct bomb defeats the armored foundation guard');
assert.ok(collapse.state.targets.includes(upper), 'The blast does not instantly clear the entire upper tower');
for (let i = 0; i < 12; i++) collapse.step();
assert.ok(upper.position.y - upperStart[1] < 3, 'Upper floor does not drop at the moment of defeat');
for (let i = 0; i < 360; i++) collapse.step();
assert.ok(!collapse.state.blocks.includes(lowerDeck) || lowerDeck.position.y - deckStart > 40, 'The unsupported deck falls or breaks');
assert.ok(!collapse.state.blocks.includes(upperDeck) || upperDeck.position.y - upperDeckStart > 50, 'Top roof falls or breaks rather than staying at its original height');
assert.ok((!collapse.state.targets.includes(middle) || middle.position.y - upperStart[0] > 50)
  && (!collapse.state.targets.includes(upper) || upper.position.y - upperStart[1] > 50),
  'Both higher guards fall or are defeated during the collapse');
assert.ok(Math.abs(otherTower.position.y - otherStart) < 3, 'A nearby independent tower does not collapse');
const crashes = collapseEvents.filter(event => event.type === 'crash');
assert.ok(crashes.length >= 1, 'Falling floors produce landing impacts');
assert.ok(collapseEvents.filter(event => event.type === 'break' && !event.target).length >= 3, 'The collapse shatters several structural pieces');
collapse.dispose();
console.log('PASS foundation loss releases the floor, roof and upper guards fall, neighboring tower stays standing.');
// Destroying a bottom structural piece must also release the stack. This covers
// the player-visible case where the support is gone but sleeping bodies float.
const brokenSupport = P.create(3);
const firstTower = brokenSupport.state.blocks.filter(b => b.position.x < 900);
const bottomPost = firstTower.find(b => b.game.h > b.game.w && b.position.y > 450);
const topDeck = firstTower.filter(b => b.game.w > b.game.h).at(-1);
const topDeckY = topDeck.position.y;
brokenSupport.launch(135, 450);
Body.setPosition(brokenSupport.state.active, { x: bottomPost.position.x, y: bottomPost.position.y });
assert.equal(brokenSupport.ability(), true);
assert.ok(!brokenSupport.state.blocks.includes(bottomPost), 'The lower support is destroyed');
for (let i = 0; i < 360; i++) brokenSupport.step();
assert.ok(!brokenSupport.state.blocks.includes(topDeck) || topDeck.position.y - topDeckY > 45,
  'Destroying a lower structural piece makes the upper deck fall or break');
brokenSupport.dispose();
console.log('PASS broken lower structure cannot leave the upper tower floating.');
// A well-placed blast should defeat even the toughest guard without requiring
// the projectile to overlap its body at the moment of activation.
const nearBlast = P.create(6);
const toughestGuard = nearBlast.state.targets[0];
nearBlast.launch(135, 450);
Body.setPosition(nearBlast.state.active, { x: toughestGuard.position.x - 35, y: toughestGuard.position.y });
assert.equal(nearBlast.ability(), true);
assert.ok(!nearBlast.state.targets.includes(toughestGuard), 'A close, off-center blast defeats the stage 7 guard');
assert.ok(nearBlast.state.destroyed >= 1 && nearBlast.state.targets.length > 0,
  'The close blast defeats nearby guards without clearing the whole stage');
nearBlast.dispose();
function fire(sim, angle, power, activation = 650) {
  const a = angle * Math.PI / 180, length = power * P.MAX_PULL / 100;
  assert.equal(sim.launch(P.SLING.x - Math.cos(a) * length, P.SLING.y + Math.sin(a) * length), true);
  for (let i = 0; i < 1500 && sim.state.phase === 'flight'; i++) {
    if (sim.state.shotTime >= activation) sim.ability();
    sim.step();
  }
  assert.notEqual(sim.state.phase, 'flight', 'Every shot must resolve within the turn timeout');
}
for (let l = 0; l < LEGACY; l++) {
  const sim = P.create(l);
  const initial = sim.state.targets.length;
  for (let i = 0; i < 720; i++) sim.step();
  assert.equal(sim.state.targets.length, initial, `Stage ${l + 1} stable before launch`);
  assert.ok(sim.state.targets.every(b => b.position.y < P.FLOOR && b.position.x > 500), `Stage ${l + 1} towers stay standing`);
  assert.equal(sim.launch(P.SLING.x, P.SLING.y), false, 'Tap does not consume ammo');
  sim.dispose();
}
const miss = P.create(0);
for (let i = 0; i < P.LEVELS[0].ammo.length; i++) fire(miss, 75, 15);
assert.equal(miss.state.phase, 'lost');
assert.equal(miss.state.shots.length, P.LEVELS[0].ammo.length, 'Every thrown ally remains on the field after defeat');
assert.ok(miss.state.shots.every(b => b.game.kind === 'spentShot'), 'Finished shots become harmless resting allies');
assert.equal(miss.launch(120, 432), false, 'Cannot launch after result');
miss.dispose();
// Stage 2 now needs several shots; keep shooting until it is won, then confirm the
// finish waits for the settling roof instead of freezing it in mid-air.
const roofCheck = P.create(1);
const roof = roofCheck.state.blocks.at(-1), roofY = roof.position.y;
for (const [angle, power] of [[8, 76], [12, 88], [16, 100], [12, 100], [20, 88]]) {
  if (roofCheck.state.phase !== 'aim') break;
  fire(roofCheck, angle, power);
}
if (roofCheck.state.phase === 'won') {
  assert.ok(!roofCheck.state.blocks.includes(roof) || (roof.position.y > roofY + 50 && roof.speed <= .5), 'Finishing the stage does not freeze the falling top roof');
}
roofCheck.dispose();
// Replay all earlier chosen shots for each candidate: no state teleport or target deletion.
for (let l = 0; l < LEGACY; l++) {
  const path = [];
  let won = false;
  for (let shot = 0; shot < P.LEVELS[l].ammo.length && !won; shot++) {
    let best;
    for (const angle of [8, 12, 16, 20, 28, 36, 44]) {
      for (const power of [58, 64, 76, 88, 100]) {
        const sim = P.create(l);
        for (const prev of path) fire(sim, ...prev);
        if (sim.state.phase !== 'aim') { sim.dispose(); continue; }
        const choice = [angle, power, P.LEVELS[l].ammo[shot] === 'bomb' ? 800 : P.LEVELS[l].ammo[shot] === 'split' ? 650 : 0];
        fire(sim, ...choice);
        const s = sim.state;
        const value = (s.phase === 'won' ? 100000 : 0) + s.destroyed * 5000 + s.score + s.blocks.reduce((n, b) => n + (b.game.maxHp - b.game.hp), 0);
        if (!best || value > best.value) best = { choice, value, won: s.phase === 'won', remaining: s.targets.length, score: s.score };
        sim.dispose();
        if (best.won) break;
      }
      if (best?.won) break;
    }
    assert.ok(best, `Stage ${l + 1} has a playable next shot`);
    path.push(best.choice); won = best.won;
  }
  const events = [], replay = P.create(l, e => events.push(e));
  for (const shot of path) {
    if (replay.state.phase !== 'aim') break;
    fire(replay, ...shot);
  }
  for (let i = 0; i < 300; i++) replay.step();
  assert.equal(replay.state.phase, 'won', `Stage ${l + 1} must be solvable; sequence ${JSON.stringify(path)}`);
  assert.equal(events.filter(e => e.type === 'finish').length, 1, 'Exactly one result');
  assert.ok(replay.state.score > 0 && replay.state.score <= P.SCORE_MAX);
  assert.ok(replay.state.stars >= 2 && replay.state.stars <= 3,
    `Stage ${l + 1} has a verified clear with at least one spare acorn`);
  console.log(`PASS stage ${l + 1}: ${replay.state.spent} shots, ${replay.state.score} points, solution ${JSON.stringify(path)}`);
  replay.dispose();
}
const bomb = P.create(3);
bomb.launch(122, 450);
const bombBody = bomb.state.active;
assert.equal(bomb.ability(), true);
assert.equal(bomb.ability(), false, 'One ability per shot');
assert.ok(bomb.state.shots.includes(bombBody), 'The bomb ally remains after using its ability');
assert.equal(bombBody.game.kind, 'spentShot', 'The used bomb cannot deal repeated shot damage');
bomb.dispose();
const split = P.create(2);
split.launch(122, 450); split.ability();
assert.equal(split.state.shots.length, 3);
split.dispose();
// ---- New stages (index LEGACY and up): saved solver results must still hold.
const saved = fs.existsSync(solver.SOLUTIONS) ? JSON.parse(fs.readFileSync(solver.SOLUTIONS, 'utf8')) : {};
for (let l = LEGACY; l < P.LEVELS.length; l++) {
  const level = P.LEVELS[l], entry = saved[l], world = P.worldOf(l);
  assert.ok(entry, `Stage ${l + 1} has a saved solution — run: node scripts/acornshot-solve.cjs ${l}`);
  assert.equal(entry.signature, solver.signature(level), `Stage ${l + 1} data changed since its solution was saved — run: node scripts/acornshot-solve.cjs ${l}`);
  assert.ok(entry.solved && entry.shots?.length, `Stage ${l + 1} was solved by the solver`);
  assert.ok(level.place && level.theme, `Stage ${l + 1} names its place and theme`);
  assert.ok(level.width >= 1280 && level.width <= 3600, `Stage ${l + 1} width is within 1,280-3,600`);
  // Human-hand tolerance (solver `robust`: jittered replays, 20 runs): stages 1-4 of a place
  // clear at least 70 %, stages 5-8 at least 35 %. Only a place's first stage may fall to one shot.
  const inPlace = l % 8;
  assert.ok(entry.robust && entry.robust.rate >= (inPlace < 4 ? .7 : .35), `Stage ${l + 1} human-hand clear rate ${entry.robust?.rate} is high enough`);
  assert.ok(inPlace === 0 || entry.spent >= 2, `Stage ${l + 1} is not a one-shot stage`);
  assert.ok(entry.spare >= 1, `Stage ${l + 1} solution leaves a spare acorn`);
  const still = solver.stillness(l);
  assert.ok(still.ok, `Stage ${l + 1} stays still for 5 s before launch (worst ${still.worst}px ${still.who})`);
  const events = [];
  let outside = null;
  const sim = solver.replay(l, entry.shots, s => {
    for (const b of [...s.state.blocks, ...s.state.targets, ...s.state.shots, ...s.state.devices]) {
      const box = P.shapeBox(b);
      if (box.min.x < -2 || box.max.x > world.width + 2 || box.min.y < world.top - 2 || box.max.y > world.bottom + 2) outside ??= `${b.game.kind} at ${Math.round(b.position.x)},${Math.round(b.position.y)}`;
    }
  }, e => events.push(e));
  assert.equal(outside, null, `Stage ${l + 1}: every body stays inside the ${world.width}px world`);
  assert.equal(sim.state.phase, 'won', `Stage ${l + 1} saved solution still clears; shots ${JSON.stringify(entry.shots)}`);
  assert.equal(events.filter(e => e.type === 'finish').length, 1, 'Exactly one result');
  assert.ok(sim.state.score > 0 && sim.state.score <= P.SCORE_MAX);
  assert.equal(sim.state.score, entry.score, `Stage ${l + 1} replays to the saved score`);
  assert.equal(sim.launch(sim.sling.x, sim.sling.y), false, 'Cannot launch after result');
  console.log(`PASS stage ${l + 1} (new, ${level.place}, ${world.width}px): still, ${sim.state.spent}/${level.ammo.length} shots, ${sim.state.score} points, ${sim.state.stars} stars`);
  sim.dispose();
}
// Extreme force on the new stages: bodies stay inside each stage's own world.
for (let l = LEGACY; l < P.LEVELS.length; l++) {
  const sim = P.create(l), world = sim.world;
  sim.launch(sim.sling.x - 80, sim.sling.y + 30);
  let seed = l + 1; const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (const b of [...sim.state.blocks, ...sim.state.targets, ...sim.state.shots, ...sim.state.devices]) {
    if (b.isStatic) continue;
    Sleeping.set(b, false);
    Body.setVelocity(b, { x: (rand() - .5) * 240, y: -rand() * 160 });
    Body.setAngularVelocity(b, 1.5);
  }
  for (let i = 0; i < 900 && ['aim', 'flight'].includes(sim.state.phase); i++) {
    sim.step();
    for (const b of [...sim.state.blocks, ...sim.state.targets, ...sim.state.shots, ...sim.state.devices]) {
      const box = P.shapeBox(b);
      assert.ok(box.min.x >= -2 && box.max.x <= world.width + 2 && box.min.y >= world.top - 2 && box.max.y <= world.bottom + 2, `Stage ${l + 1} body stayed in its world`);
    }
    for (const b of sim.state.shots) assert.ok(b.speed <= P.SHOT_MAX_SPEED + 1e-6 || sim.state.phase !== 'flight', 'Shot speed is capped on new stages');
  }
  sim.dispose();
}
console.log('PASS new stages: all bodies stay inside each stage world under extreme force; shot speed capped.');
// ---- Devices and terrain (new stages). Shots are placed directly, like the guard tests above.
function placeShot(sim, x, y, vx, vy) {
  sim.launch(sim.sling.x - 60, sim.sling.y + 20);
  const b = sim.state.active;
  Body.setPosition(b, { x, y }); Body.setVelocity(b, { x: vx, y: vy });
  return b;
}
const byPart = type => (sim, kind) => sim.state.devices.find(d => d.game.kind === kind);
// Device checks pick their stage by name (stage order may change; names are unique).
const stage = name => { const i = P.LEVELS.findIndex(L => L.name === name); assert.ok(i >= LEGACY, `stage ${name} exists`); return i; };
const BOULDER = stage('굴림돌 비탈'), BARRELS = stage('송진 창고'), MUSHROOM = stage('버섯 징검다리'), WATER = stage('안개 나루');
const BRIDGE = stage('흔들다리 골짜기'), CAGES = stage('늪 위 매달린 우리'), PENDULUM = stage('성문 앞 추'), ICICLES = stage('고드름 동굴');
assert.equal(P.LEVELS.length, 40, 'Forty stages: five places of eight');
for (const [k, place] of ['forest', 'valley', 'swamp', 'snow', 'castle'].entries()) for (let i = 0; i < 8; i++) assert.equal(P.LEVELS[k * 8 + i].place, place, `Stage ${k * 8 + i + 1} belongs to ${place}`);
assert.equal(new Set(P.LEVELS.map(L => L.name)).size, 40, 'Stage names are unique');
{ // Boulder: freeing the chock lets it roll down and crush the tower below.
  const events = [], sim = P.create(BOULDER, e => events.push(e));
  const boulder = byPart()(sim, 'boulder'), wedge = sim.state.blocks.find(b => b.game.wedge), x0 = boulder.position.x;
  assert.ok(wedge && wedge.isStatic, 'The boulder chock is pinned until it breaks');
  sim.launch(sim.sling.x - 10, sim.sling.y + 5);
  Composite.remove(sim.state.engine.world, wedge); sim.state.blocks.splice(sim.state.blocks.indexOf(wedge), 1); Sleeping.set(boulder, false);
  const before = sim.state.targets.length;
  for (let i = 0; i < 1200 && sim.state.phase === 'flight'; i++) sim.step();
  assert.ok(boulder.position.x - x0 > 150, 'The freed boulder rolls downhill');
  assert.ok(sim.state.targets.length < before, 'The rolling boulder defeats guards below');
  sim.dispose();
}
{ // Resin barrels: the first bursts at once, the neighbour about 0.1 s later.
  const events = [], sim = P.create(BARRELS, e => events.push({ ...e, t: sim.state.time }));
  const barrels = sim.state.blocks.filter(b => b.game.explosive).sort((a, b) => a.position.x - b.position.x);
  placeShot(sim, barrels[0].position.x - 40, barrels[0].position.y, 18, 0);
  for (let i = 0; i < 400 && sim.state.phase === 'flight'; i++) sim.step();
  const blasts = events.filter(e => e.type === 'blast' && e.source === 'barrel');
  assert.ok(blasts.length >= 2, 'A barrel chain bursts');
  assert.ok(blasts[1].t - blasts[0].t >= 90 && blasts[1].t - blasts[0].t <= 140, 'The chain spreads about 0.1 s later');
  sim.dispose();
}
{ // Mushroom: a falling shot is thrown back up harder than it came, within the cap.
  const events = [], sim = P.create(MUSHROOM, e => events.push(e));
  const m = byPart()(sim, 'mushroom'), b = placeShot(sim, m.position.x - 10, m.position.y - m.game.r - 40, 2, 8);
  let up = 0;
  for (let i = 0; i < 200; i++) { sim.step(); up = Math.min(up, b.velocity.y); }
  assert.equal(events.filter(e => e.type === 'bounce').length, 1, 'One boosted bounce');
  assert.ok(up < -9 && Math.hypot(b.velocity.x, b.velocity.y) <= 30.01, 'Bounce is strong but capped');
  sim.dispose();
}
{ // Water: an enemy that falls in is defeated for the normal 1,000 points.
  const events = [], sim = P.create(WATER, e => events.push(e));
  const t = sim.state.targets[0], zone = P.terrainOf(WATER).water[0];
  sim.launch(100, 470); Body.setPosition(sim.state.active, { x: 120, y: 300 });
  Sleeping.set(t, false); Body.setPosition(t, { x: (zone.x0 + zone.x1) / 2, y: zone.y - 30 }); Body.setVelocity(t, { x: 0, y: 3 });
  const score = sim.state.score;
  for (let i = 0; i < 300 && sim.state.phase === 'flight'; i++) sim.step();
  assert.ok(!sim.state.targets.includes(t), 'The enemy sinks and is defeated');
  assert.ok(events.some(e => e.type === 'splash') && events.some(e => e.type === 'break' && e.target && e.sunk), 'Splash and sunk-break events');
  assert.ok(sim.state.score - score >= 1000);
  sim.dispose();
}
{ // Bridge over a pit: blowing up a pier drops the planks and the guards on them into the pit.
  const events = [], sim = P.create(BRIDGE, e => events.push(e));
  const pier = sim.state.blocks.find(b => b.game.h > 100), onBridge = sim.state.targets.filter(t => t.position.x > 900 && t.position.x < 1280);
  sim.launch(100, 400); Body.setPosition(sim.state.active, { x: pier.position.x, y: 460 }); sim.ability();
  for (let i = 0; i < 1200 && sim.state.phase === 'flight'; i++) sim.step();
  assert.ok(onBridge.every(t => !sim.state.targets.includes(t)), 'Guards on the broken bridge are defeated');
  assert.ok(events.some(e => e.type === 'splash' && e.pit), 'Falling into the pit reports a pit splash');
  sim.dispose();
}
{ // Hanging cage: a shot through the ropes snaps them and the cage falls.
  const events = [], sim = P.create(CAGES, e => events.push(e));
  const r = sim.state.ropes[0], cage = r.body, y0 = cage.position.y;
  placeShot(sim, r.anchor.x - 60, r.anchor.y + 60, 20, 0);
  for (let i = 0; i < 240; i++) sim.step();
  assert.ok(r.cut && events.some(e => e.type === 'snap'), 'The rope snaps');
  assert.ok(!sim.state.blocks.includes(cage) || cage.position.y - y0 > 100, 'The cage falls');
  sim.dispose();
}
{ // Pendulum: a hit swings the stone into the tower beside it.
  const events = [], sim = P.create(PENDULUM, e => events.push(e));
  const bob = byPart()(sim, 'bob'), x0 = bob.position.x, before = sim.state.blocks.length;
  placeShot(sim, bob.position.x - 60, bob.position.y, 20, 0);
  let swing = 0;
  for (let i = 0; i < 900 && sim.state.phase === 'flight'; i++) { sim.step(); swing = Math.max(swing, bob.position.x - x0); }
  assert.ok(swing > 60 && sim.state.blocks.length < before, 'The pendulum swings and breaks tower pieces');
  assert.ok(!sim.state.ropes.find(v => v.body === bob).cut, 'Hitting the stone does not cut its rope');
  sim.dispose();
}
{ // Icicle: hit, it drops from the cave roof, spikes the guard below and shatters.
  const events = [], sim = P.create(ICICLES, e => events.push(e));
  const ic = sim.state.devices.filter(d => d.game.kind === 'icicle').at(-1), before = sim.state.targets.length;
  assert.ok(ic.isStatic, 'Icicles hang still until triggered');
  placeShot(sim, ic.position.x - 50, ic.position.y, 14, 0);
  for (let i = 0; i < 900 && sim.state.phase === 'flight'; i++) sim.step();
  assert.ok(events.some(e => e.type === 'icicle') && events.some(e => e.type === 'shatter'), 'The icicle drops and shatters');
  assert.ok(sim.state.targets.length < before, 'The falling icicle defeats the guard below');
  sim.dispose();
}
{ // Terrain queries for drawing and aiming previews.
  const t = P.terrainOf(ICICLES);
  assert.ok(P.blocked(ICICLES, 1700, t.roofAt(1700) - 5) && !P.blocked(ICICLES, 1700, t.roofAt(1700) + 40), 'The cave roof blocks above its line');
  const plat = P.terrainOf(WATER).platforms[0];
  assert.equal(P.surfaceAt(WATER, plat.x, plat.y - 50), plat.y, 'surfaceAt finds a platform top');
  assert.ok(P.blocked(WATER, plat.x, plat.y + 5), 'Inside a platform is blocked');
}
console.log('PASS devices: boulder roll, barrel chain delay, mushroom bounce cap, water sink, bridge into pit, rope snap, pendulum swing, icicle drop; terrain queries.');
console.log(`PASS: stable towers, miss/retry lifecycle, ${P.LEVELS.length} solvable stages (${LEGACY} original + ${P.LEVELS.length - LEGACY} new), score bounds, single finish, bomb and split abilities.`);
