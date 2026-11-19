/* node scripts/test-acornshot.cjs — physics regressions and real-shot solvability. */
const assert = require('node:assert/strict');
const P = require('../web/games/embed/acornshot/physics.js');
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
// Replay all earlier chosen shots for each candidate: no state teleport or target deletion.
for (let l = 0; l < P.LEVELS.length; l++) {
  const path = [];
  let won = false;
  for (let shot = 0; shot < P.LEVELS[l].ammo.length && !won; shot++) {
    let best;
    for (const angle of [12, 20, 28, 36, 44, 52]) {
      for (const power of [64, 76, 88, 100]) {
        const sim = P.create(l);
        for (const prev of path) fire(sim, ...prev);
        if (sim.state.phase !== 'aim') { sim.dispose(); continue; }
        const choice = [angle, power, P.LEVELS[l].ammo[shot] === 'bomb' ? 800 : 550];
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
    if (won) {
      const events = [], replay = P.create(l, e => events.push(e));
      for (const shot of path) fire(replay, ...shot);
      for (let i = 0; i < 300; i++) replay.step();
      assert.equal(events.filter(e => e.type === 'finish').length, 1, 'Exactly one result');
      assert.ok(replay.state.score > 0 && replay.state.score <= P.SCORE_MAX);
      assert.ok(replay.state.stars >= 1 && replay.state.stars <= 3);
      console.log(`PASS stage ${l + 1}: ${path.length} shots, ${replay.state.score} points, solution ${JSON.stringify(path)}`);
      replay.dispose();
    }
  }
  assert.ok(won, `Stage ${l + 1} must be solvable within its ammo budget; best sequence ${JSON.stringify(path)}`);
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
