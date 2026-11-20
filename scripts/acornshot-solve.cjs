#!/usr/bin/env node
/* 도토리 새총단 자동 쏘기 풀이기.
 *   node scripts/acornshot-solve.cjs [단계 번호…|new|all] [--jobs 4] [--time 180] [--beam 2] [--random 40] [--robust 20] [--out 결과.json] [--dry]
 * 단계 번호는 0부터(12 = 13단계). 인자가 없으면 new(LEGACY_COUNT 이후 전부).
 * 각 단계: ① 쏘기 전 5초 안정 ② 빔 탐색으로 풀이 ③ 난이도 숫자 ④ scripts/acornshot-solutions.json 저장(--dry 면 저장 안 함).
 * 모든 계산은 결정적이다(같은 단계 자료 → 같은 결과). */
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const P = require('../web/games/embed/acornshot/physics.js');

const SOLUTIONS = path.join(__dirname, 'acornshot-solutions.json');
const STILL_STEPS = 600, STILL_LIMIT = 2;

const signature = level => crypto.createHash('sha1').update(JSON.stringify(level)).digest('hex').slice(0, 12);

// One shot: angle (deg above horizontal, pulled back-left), power (15–100 % of the pull),
// activation (ms after launch for the ability; -1 = bomb on first contact; 0 = none).
// `round` snaps the pull point to whole pixels, like a pointer would.
function fire(sim, angle, power, activation = 0, onStep, round = false) {
  const a = angle * Math.PI / 180, length = power * P.MAX_PULL / 100, S = sim.sling;
  let x = S.x - Math.cos(a) * length, y = S.y + Math.sin(a) * length;
  if (round) { x = Math.round(x); y = Math.round(y); }
  if (!sim.launch(x, y)) return false;
  const ammo = sim.state.active.game.ammo;
  let prev = { ...sim.state.active.velocity };
  for (let i = 0; i < 1500 && sim.state.phase === 'flight'; i++) {
    const b = sim.state.active;
    if (b && ammo !== 'seed' && !sim.state.abilityUsed) {
      if (activation > 0 && sim.state.shotTime >= activation) sim.ability();
      else if (activation < 0 && Math.hypot(b.velocity.x - prev.x, b.velocity.y - prev.y) > 2.5) sim.ability();
    }
    if (sim.state.active) prev = { ...sim.state.active.velocity };
    sim.step();
    if (onStep) onStep(sim);
  }
  return sim.state.phase !== 'flight';
}
function replay(levelIndex, shots, onStep, notify) {
  const sim = P.create(levelIndex, notify);
  for (const shot of shots) { if (sim.state.phase !== 'aim') break; fire(sim, ...shot, onStep); }
  for (let i = 0; i < 300; i++) { sim.step(); if (onStep) onStep(sim); }
  return sim;
}
// Pre-launch stability: nothing may move more than STILL_LIMIT px (angle counts ×20 px) in 5 s.
function stillness(levelIndex) {
  const sim = P.create(levelIndex), s = sim.state;
  const bodies = [...s.blocks, ...s.targets, ...s.devices].filter(b => !b.isStatic);
  const start = new Map(bodies.map(b => [b, { x: b.position.x, y: b.position.y, a: b.angle }]));
  const counts = [s.targets.length, s.blocks.length, s.devices.length];
  let worst = 0, who = '';
  for (let i = 0; i < STILL_STEPS; i++) {
    sim.step();
    for (const b of bodies) {
      const p = start.get(b), d = Math.hypot(b.position.x - p.x, b.position.y - p.y) + Math.abs(b.angle - p.a) * 20;
      if (d > worst) { worst = d; who = `${b.game.kind}${b.game.material ? '/' + b.game.material : ''}@${Math.round(p.x)},${Math.round(p.y)}`; }
    }
  }
  const same = counts[0] === s.targets.length && counts[1] === s.blocks.length && counts[2] === s.devices.length;
  sim.dispose();
  return { ok: same && worst <= STILL_LIMIT, worst: +worst.toFixed(3), who, lost: !same };
}
function evaluate(sim) {
  const s = sim.state;
  const hurt = [...s.blocks, ...s.targets].reduce((n, b) => n + Math.max(0, b.game.maxHp - b.game.hp), 0);
  return (s.phase === 'won' ? 1e6 : 0) + s.destroyed * 5000 + s.score + hurt * 4;
}
const ACTIVATIONS = { seed: [0], split: [450, 900, 1500], bomb: [-1, 700, 1400] };
const COARSE_ANGLES = [4, 10, 16, 22, 28, 34, 40, 46, 54, 62], COARSE_POWERS = [45, 65, 82, 100];
function rng(seed) { let x = seed >>> 0 || 1; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296); }

function solve(levelIndex, { beam = 2, timeLimit = 180000 } = {}) {
  const level = P.LEVELS[levelIndex], t0 = Date.now();
  const cache = new Map();
  let sims = 0;
  const run = shots => {
    const key = JSON.stringify(shots);
    if (cache.has(key)) return cache.get(key);
    const sim = P.create(levelIndex);
    for (const shot of shots) { if (sim.state.phase !== 'aim') break; fire(sim, ...shot); }
    sims++;
    const r = { shots, value: evaluate(sim), won: sim.state.phase === 'won', phase: sim.state.phase, score: sim.state.score, stars: sim.state.stars ?? 0, destroyed: sim.state.destroyed, left: sim.state.targets.length };
    sim.dispose();
    cache.set(key, r);
    return r;
  };
  let frontier = [{ shots: [], value: -Infinity }], best = null, timedOut = false;
  for (let depth = 0; depth < level.ammo.length && !best; depth++) {
    const ammo = level.ammo[depth], next = [];
    for (const node of frontier) {
      const tried = [];
      for (const angle of COARSE_ANGLES) for (const power of COARSE_POWERS) for (const act of ACTIVATIONS[ammo]) {
        if (Date.now() - t0 > timeLimit) { timedOut = true; break; }
        tried.push(run([...node.shots, [angle, power, act]]));
      }
      // Refine around the three best coarse shots.
      const top = tried.filter(r => r.phase !== 'lost' || r.won).sort((a, b) => b.value - a.value).slice(0, 3);
      for (const r of top) {
        const [angle, power, act] = r.shots.at(-1);
        for (const da of [-3, 0, 3]) for (const dp of [-8, 0, 8]) {
          if (!da && !dp) continue;
          if (Date.now() - t0 > timeLimit) { timedOut = true; break; }
          const a2 = Math.max(2, Math.min(75, angle + da)), p2 = Math.max(20, Math.min(100, power + dp));
          tried.push(run([...node.shots, [a2, p2, act]]));
        }
      }
      next.push(...tried);
      if (timedOut) break;
    }
    const won = next.filter(r => r.won).sort((a, b) => a.shots.length - b.shots.length || b.score - a.score);
    if (won.length) { best = won[0]; break; }
    if (timedOut) break;
    // Keep `beam` distinct, still-playable outcomes.
    const seen = new Set();
    frontier = next.filter(r => r.phase === 'aim').sort((a, b) => b.value - a.value).filter(r => { const k = `${r.destroyed}:${r.score}:${Math.round(r.value)}`; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, beam);
    if (!frontier.length) break;
  }
  return { best, sims, ms: Date.now() - t0, timedOut };
}
// How forgiving the stage is: share of random single first shots that score / defeat an enemy.
function randomRates(levelIndex, n = 40) {
  const rand = rng(levelIndex * 7919 + 17), ammo = P.LEVELS[levelIndex].ammo[0];
  let hit = 0, kill = 0;
  for (let i = 0; i < n; i++) {
    const acts = ACTIVATIONS[ammo];
    const shot = [Math.round(4 + rand() * 66), Math.round(30 + rand() * 70), acts[Math.floor(rand() * acts.length)]];
    const sim = P.create(levelIndex);
    fire(sim, ...shot);
    if (sim.state.score > 0) hit++;
    if (sim.state.destroyed > 0) kill++;
    sim.dispose();
  }
  return { hit: +(hit / n).toFixed(3), kill: +(kill / n).toFixed(3) };
}
// Human-hand tolerance: replay the saved shots with jitter (angle ±3°, power ±6 %, ability
// timing ±80 ms, pull snapped to pixels) after a random 0.5–3 s wait in the aim phase. When
// the saved shots run out, keep shooting greedily (best of the saved shots and a small grid,
// judged on a replay of what actually happened) with the same jitter. Share of cleared runs.
const ROBUST_GRID = [10, 18, 26, 34, 42, 50].flatMap(a => [35, 60, 80, 100].map(p => [a, p]));
function robust(levelIndex, shots, n = 20) {
  const level = P.LEVELS[levelIndex], rand = rng(levelIndex * 104729 + 3);
  const DEFAULT_ACT = { seed: 0, split: 900, bomb: -1 };
  const play = (history, extra) => {
    const sim = P.create(levelIndex);
    for (const h of [...history, ...(extra ? [extra] : [])]) {
      if (sim.state.phase !== 'aim') break;
      for (let i = 0; i < h.wait; i++) sim.step();
      fire(sim, h.angle, h.power, h.act, null, true);
    }
    return sim;
  };
  let wins = 0, spentWon = 0;
  for (let k = 0; k < n; k++) {
    const history = [];
    let sim = P.create(levelIndex);
    while (sim.state.phase === 'aim' && sim.state.spent < level.ammo.length) {
      const turn = history.length, ammo = level.ammo[turn], wait = Math.round(60 + rand() * 300);
      let plan;
      if (turn < shots.length) plan = shots[turn];
      else {
        const cands = [...shots.map(s => [s[0], s[1]]), ...ROBUST_GRID];
        let best = null;
        for (const [a, p] of cands) {
          const t = play(history, { wait: 60, angle: a, power: p, act: DEFAULT_ACT[ammo] });
          const v = evaluate(t); t.dispose();
          if (!best || v > best.v) best = { v, plan: [a, p, DEFAULT_ACT[ammo]] };
        }
        plan = best.plan;
      }
      const act = ammo === 'seed' ? 0 : plan[2] > 0 ? Math.max(120, plan[2] + (rand() * 160 - 80)) : plan[2] < 0 ? -1 : DEFAULT_ACT[ammo];
      const h = { wait, angle: Math.max(1, Math.min(80, plan[0] + (rand() * 6 - 3))), power: Math.max(15, Math.min(100, plan[1] * (1 + (rand() * .12 - .06)))), act };
      history.push(h);
      for (let i = 0; i < h.wait; i++) sim.step();
      fire(sim, h.angle, h.power, h.act, null, true);
    }
    if (sim.state.phase === 'won') { wins++; spentWon += sim.state.spent; }
    sim.dispose();
  }
  return { n, wins, rate: +(wins / n).toFixed(2), spent: wins ? +(spentWon / wins).toFixed(1) : null };
}
// Timing of sim.step() while the found solution plays out (collapse included).
function perf(levelIndex, shots) {
  const times = [];
  const sim = P.create(levelIndex);
  const timed = s => s; // placeholder for symmetry
  for (const shot of shots) {
    if (sim.state.phase !== 'aim') break;
    const a = shot[0] * Math.PI / 180, length = shot[1] * P.MAX_PULL / 100, S = sim.sling;
    sim.launch(S.x - Math.cos(a) * length, S.y + Math.sin(a) * length);
    const ammo = sim.state.active.game.ammo; let prev = { ...sim.state.active.velocity };
    for (let i = 0; i < 1500 && sim.state.phase === 'flight'; i++) {
      const b = sim.state.active;
      if (b && ammo !== 'seed' && !sim.state.abilityUsed) {
        if (shot[2] > 0 && sim.state.shotTime >= shot[2]) sim.ability();
        else if (shot[2] < 0 && Math.hypot(b.velocity.x - prev.x, b.velocity.y - prev.y) > 2.5) sim.ability();
      }
      if (sim.state.active) prev = { ...sim.state.active.velocity };
      const t = process.hrtime.bigint(); sim.step(); times.push(Number(process.hrtime.bigint() - t) / 1e6);
      timed(sim);
    }
  }
  sim.dispose();
  times.sort((a, b) => a - b);
  const mean = times.reduce((n, v) => n + v, 0) / (times.length || 1);
  return { steps: times.length, mean: +mean.toFixed(3), p95: +(times[Math.floor(times.length * .95)] ?? 0).toFixed(3), max: +(times.at(-1) ?? 0).toFixed(3) };
}
function work(levelIndex, opts) {
  const level = P.LEVELS[levelIndex];
  const out = { level: levelIndex, name: level.name, place: level.place, width: level.width ?? P.WORLD_WIDTH, signature: signature(level), ammo: level.ammo.length };
  out.still = stillness(levelIndex);
  const { best, sims, ms, timedOut } = solve(levelIndex, opts);
  out.search = { sims, ms, timedOut };
  if (best) {
    const events = [], sim = replay(levelIndex, best.shots, null, e => events.push(e));
    out.solved = sim.state.phase === 'won';
    out.shots = best.shots; out.spent = sim.state.spent; out.score = sim.state.score; out.stars = sim.state.stars ?? 0;
    out.spare = level.ammo.length - sim.state.spent;
    out.events = events.reduce((m, e) => (m[e.type] = (m[e.type] || 0) + 1, m), {});
    sim.dispose();
    out.perf = perf(levelIndex, best.shots);
    if (opts.robust !== 0) out.robust = robust(levelIndex, best.shots, opts.robust ?? 20);
  } else out.solved = false;
  out.random = randomRates(levelIndex, opts.random ?? 40);
  return out;
}
function parseArgs(argv) {
  const opts = { jobs: 4, time: 180, beam: 2, random: 40, robust: 20, dry: false, out: null, levels: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--jobs') opts.jobs = Math.max(1, Math.min(4, +argv[++i]));
    else if (a === '--time') opts.time = +argv[++i];
    else if (a === '--beam') opts.beam = +argv[++i];
    else if (a === '--random') opts.random = +argv[++i];
    else if (a === '--dry') opts.dry = true;
    else if (a === '--robust') opts.robust = +argv[++i];
    else if (a === '--out') opts.out = argv[++i];
    else if (a === '--worker') opts.worker = +argv[++i];
    else if (a === 'all') opts.levels.push(...P.LEVELS.map((_, i) => i));
    else if (a === 'new') opts.levels.push(...P.LEVELS.map((_, i) => i).filter(i => i >= P.LEGACY_COUNT));
    else opts.levels.push(+a);
  }
  if (!opts.levels.length) opts.levels = P.LEVELS.map((_, i) => i).filter(i => i >= P.LEGACY_COUNT);
  return opts;
}
function line(r) {
  if (r.error) return `${r.level} 오류: ${r.error}`;
  const still = r.still.ok ? `안정(최대 ${r.still.worst}px)` : `불안정(${r.still.worst}px ${r.still.who}${r.still.lost ? ', 잃음' : ''})`;
  const solved = r.solved ? `${r.spent}/${r.ammo}발 ${r.score}점 별${r.stars} 여유 ${r.spare}발 ${JSON.stringify(r.shots)}` : (r.search.timedOut ? '못 풂(시간 초과)' : '못 풂');
  const perf = r.perf ? ` step 평균 ${r.perf.mean}ms p95 ${r.perf.p95}ms 최대 ${r.perf.max}ms` : '';
  const hand = r.robust ? ` · 손 견딤 ${(r.robust.rate * 100).toFixed(0)}%(${r.robust.wins}/${r.robust.n})` : '';
  return `${r.level} ${r.name} [${r.place} · ${r.width}px] ${still} · ${solved}${hand} · 무작위 첫 발 맞음 ${(r.random.hit * 100).toFixed(0)}% 처치 ${(r.random.kill * 100).toFixed(0)}% · 탐색 ${r.search.sims}회 ${(r.search.ms / 1000).toFixed(1)}s${perf}`;
}
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.worker != null) {
    process.stdout.write(JSON.stringify(work(opts.worker, { beam: opts.beam, timeLimit: opts.time * 1000, random: opts.random, robust: opts.robust })) + '\n');
    return;
  }
  const queue = [...opts.levels], results = [];
  const runOne = level => new Promise(resolve => {
    const child = spawn(process.execPath, [__filename, '--worker', String(level), '--time', String(opts.time), '--beam', String(opts.beam), '--random', String(opts.random), '--robust', String(opts.robust)], { stdio: ['ignore', 'pipe', 'inherit'] });
    let text = '';
    child.stdout.on('data', d => { text += d; });
    child.on('close', code => {
      let r;
      try { r = JSON.parse(text.trim().split('\n').at(-1)); } catch (_) { r = { level, error: `worker exit ${code}` }; }
      console.log(line(r));
      results.push(r); resolve();
    });
  });
  await Promise.all(Array.from({ length: Math.min(opts.jobs, queue.length) }, async () => { while (queue.length) await runOne(queue.shift()); }));
  if (opts.out) fs.writeFileSync(opts.out, JSON.stringify(results.sort((a, b) => a.level - b.level), null, 1) + '\n');
  if (opts.dry) return;
  const saved = fs.existsSync(SOLUTIONS) ? JSON.parse(fs.readFileSync(SOLUTIONS, 'utf8')) : {};
  for (const r of results.sort((a, b) => a.level - b.level)) {
    if (r.error) continue;
    saved[r.level] = { name: r.name, place: r.place, width: r.width, signature: r.signature, still: r.still, solved: r.solved, shots: r.shots ?? null, spent: r.spent ?? null, ammo: r.ammo, spare: r.spare ?? null, score: r.score ?? null, stars: r.stars ?? null, random: r.random, perf: r.perf ?? null, robust: r.robust ?? null, events: r.events ?? null };
  }
  const ordered = Object.fromEntries(Object.keys(saved).map(Number).sort((a, b) => a - b).map(k => [k, saved[k]]));
  fs.writeFileSync(SOLUTIONS, JSON.stringify(ordered, null, 1) + '\n');
  console.log(`저장: ${path.relative(process.cwd(), SOLUTIONS)} (${Object.keys(ordered).length}단계)`);
}
module.exports = { fire, replay, stillness, robust, signature, SOLUTIONS, STILL_LIMIT };
if (require.main === module) main();
