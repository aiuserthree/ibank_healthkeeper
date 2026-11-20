/* node scripts/test-acornshot.cjs — physics regressions and real-shot solvability. */
const assert = require('node:assert/strict');
const P = require('../web/games/embed/acornshot/physics.js');
const { Body, Sleeping } = require('../web/games/embed/acornshot/vendor/matter.min.js');
// Keep the entire rotating enemy sprite (including ears) inside the viewport.
// Exercise both aiming and flight, including velocities large enough to tunnel
// through a thin wall. Boundary contact must not count as defeating an enemy.
for (const flight of [false, true]) {
  for (const [x, y, vx, vy] of [[40, 180, -100, 0], [1240, 180, 100, 0], [500, 40, 0, -100], [500, 540, 0, 200], [1240, 40, 100, -100]]) {
    const sim = P.create(0), target = sim.state.targets[0];
    if (flight) sim.launch(180, 490);
    Body.setPosition(target, { x, y }); Body.setVelocity(target, { x: vx, y: vy }); Sleeping.set(target, false);
    sim.step();
    assert.ok(target.position.x >= 38 && target.position.x <= 1242, 'Enemy stays within horizontal sprite-safe bounds');
    assert.ok(target.position.y >= 38 && target.position.y <= P.FLOOR - 22, 'Enemy stays below screen top and above ground');
    assert.equal(sim.state.targets.length, 1, 'Boundary must not delete the enemy');
    assert.equal(sim.state.score, 0, 'Boundary must not award points');
    if (x === 40) assert.ok(target.velocity.x >= 0, 'Left edge redirects velocity inward');
    if (x === 1240) assert.ok(target.velocity.x <= 0, 'Right edge redirects velocity inward');
    if (y === 40) assert.ok(target.velocity.y >= 0, 'Top edge redirects velocity inward');
    sim.dispose();
  }
}
console.log('PASS enemy bounds: aim/flight, all edges, corner, high-speed overshoot, no free score.');
// Every simulated body (blocks, shots and enemies) must stay in the 1280x720 view.
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
      assert.ok(box.min.x >= -2 && box.max.x <= 1282 && box.min.y >= -2 && box.max.y <= 720, `Stage ${level + 1} body stayed in view`);
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
assert.ok(collapse.state.targets.includes(middle) && collapse.state.targets.includes(upper), 'The blast leaves the upper armored guards standing');
for (let i = 0; i < 12; i++) collapse.step();
assert.ok(upper.position.y - upperStart[1] < 3, 'Upper floor does not drop at the moment of defeat');
for (let i = 0; i < 360; i++) collapse.step();
assert.ok(!collapse.state.blocks.includes(lowerDeck) || lowerDeck.position.y - deckStart > 40, 'The unsupported deck falls or breaks');
assert.ok(!collapse.state.blocks.includes(upperDeck) || upperDeck.position.y - upperDeckStart > 50, 'Top roof falls or breaks rather than staying at its original height');
assert.ok(middle.position.y - upperStart[0] > 50 && upper.position.y - upperStart[1] > 50, 'Both higher guards actually fall');
assert.ok(Math.abs(otherTower.position.y - otherStart) < 3, 'A nearby independent tower does not collapse');
const crashes = collapseEvents.filter(event => event.type === 'crash');
assert.ok(crashes.length >= 1, 'Falling floors produce landing impacts');
assert.ok(collapseEvents.filter(event => event.type === 'break' && !event.target).length >= 3, 'The collapse shatters several structural pieces');
collapse.dispose();
console.log('PASS foundation loss releases the floor, roof and upper guards fall, neighboring tower stays standing.');
// A well-placed blast should defeat even the toughest guard without requiring
// the projectile to overlap its body at the moment of activation.
const nearBlast = P.create(6);
const toughestGuard = nearBlast.state.targets[0];
nearBlast.launch(135, 450);
Body.setPosition(nearBlast.state.active, { x: toughestGuard.position.x - 35, y: toughestGuard.position.y });
assert.equal(nearBlast.ability(), true);
assert.ok(!nearBlast.state.targets.includes(toughestGuard), 'A close, off-center blast defeats the stage 7 guard');
assert.equal(nearBlast.state.destroyed, 1, 'The close blast does not wipe out the tower');
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
for (let l = 0; l < P.LEVELS.length; l++) {
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
// Keep the precise stage 7 route: the coarse greedy search clears it, but spends the reserve.
const stageSevenPath = [[16, 88, 800], [36, 88, 650], [36, 88, 0], [12, 88, 800], [8, 100, 0], [28, 94, 0]];
for (let l = 0; l < P.LEVELS.length; l++) {
  const knownPath = P.LEVELS[l].name === '돌담 너머' ? stageSevenPath : null;
  const path = knownPath ?? [];
  let won = false;
  for (let shot = 0; !knownPath && shot < P.LEVELS[l].ammo.length && !won; shot++) {
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
assert.equal(bomb.ability(), true);
assert.equal(bomb.ability(), false, 'One ability per shot');
bomb.dispose();
const split = P.create(2);
split.launch(122, 450); split.ability();
assert.equal(split.state.shots.length, 3);
split.dispose();
console.log('PASS: stable towers, miss/retry lifecycle, 8 solvable stages, score bounds, single finish, bomb and split abilities.');
