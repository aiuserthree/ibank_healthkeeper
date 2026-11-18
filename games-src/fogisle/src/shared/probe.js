// 주는 것: 결정성 탐침 — 떠다니는 점의 알맹이(makeProbe · probeInit · probeAdvance) · 자가 점검 한 판(probeRun — 조각내 돌릴 수 있는 function*) · runAll.
// 받는 것: dmath · rng · hash · state · events · tune. shared 만으로 도는 자가 점검이라 Node · 크롬 주 스레드 · Blob 워커가 같은 해시를 내는지 본다.
// dmath 의 열 함수를 모두 타고, 함수마다 결과의 비트를 p.fold 에 접어 넣는다(더해서 모으면 끝자리 차이가 묻힌다). 여기 적힌 낱 숫자는 탐침 전용이다.
import { PI, TAU, dsin, dcos, dtan, datan, datan2, dasin, dacos, dexp, dlog, dpow } from './dmath.js';
import { makeRng, rngNext, seedFrom } from './rng.js';
import { hashNew, hashNum } from './hash.js';
import { hashState } from './state.js';
import { EV, emit } from './events.js';
import { PROBE } from './tune/probe.js';
import { STEP } from './tune/sim.js';

export function makeProbe() {
  const n = PROBE.count;
  return { pos: new Float64Array(n * 2), vel: new Float64Array(n * 2), dir: new Float64Array(n), bounces: 0, fold: hashNew() };
}

export function probeInit(p, rng) {
  const half = PROBE.arena / 2;
  for (let i = 0; i < PROBE.count; i++) {
    p.pos[i * 2] = (rngNext(rng) * 2 - 1) * half;
    p.pos[i * 2 + 1] = (rngNext(rng) * 2 - 1) * half;
    p.dir[i] = (rngNext(rng) * 2 - 1) * PI;
  }
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// 단계 n 을 한 번 밟는다. 점마다 끌림 점(pullX, pullZ) 쪽으로 조금 돌며 떠다니고 벽에서 튄다. ev 가 있으면 튄 것을 사건으로 적는다.
export function probeAdvance(p, rng, n, pullX, pullZ, ev) {
  const half = PROBE.arena / 2, t = n * STEP, k = 1 - dexp(-PROBE.follow * STEP);
  for (let i = 0; i < PROBE.count; i++) {
    let x = p.pos[i * 2], z = p.pos[i * 2 + 1], d = p.dir[i];
    let turn = datan2(pullZ - z, pullX - x) - d;
    turn -= Math.floor(turn / TAU + 0.5) * TAU;
    d += turn * PROBE.pull * STEP + (rngNext(rng) - 0.5) * PROBE.turnNoise + 0.02 * dsin(t * 1.7 + i);
    const sp = PROBE.speed * (1 + 0.4 * dcos(t * 0.5 + i * 0.37));
    const vx = p.vel[i * 2] + (dcos(d) * sp - p.vel[i * 2]) * k;
    const vz = p.vel[i * 2 + 1] + (dsin(d) * sp - p.vel[i * 2 + 1]) * k;
    x += vx * STEP; z += vz * STEP;
    if (x < -half || x > half) { d = PI - d; x = clamp(x, -half, half); p.bounces += 1; if (ev) emit(ev, EV.probeBounce, i, x, z); }
    if (z < -half || z > half) { d = -d; z = clamp(z, -half, half); p.bounces += 1; if (ev) emit(ev, EV.probeBounce, i, x, z); }
    d -= Math.floor(d / TAU + 0.5) * TAU;
    p.pos[i * 2] = x; p.pos[i * 2 + 1] = z; p.vel[i * 2] = vx; p.vel[i * 2 + 1] = vz; p.dir[i] = d;
    hashNum(p.fold, datan(vz * 0.3)); hashNum(p.fold, dtan(d * 0.1));
    hashNum(p.fold, dacos(dcos(d))); hashNum(p.fold, dasin(dsin(d) * 0.5));
    hashNum(p.fold, dlog(1 + x * x + z * z)); hashNum(p.fold, dpow(Math.abs(vx) + 0.1, 0.37));
    hashNum(p.fold, dpow(1 + i * 0.01, n % 7 - 3));
  }
}

// 자가 점검 한 판: 끝난 값은 { hash, steps, pos }. PROBE.slice 단계마다 한 번 쉰다(yield) — 어떻게 조각내 돌려도 결과가 같아야 한다.
export function* probeRun(seed, steps) {
  const rng = makeRng(seedFrom(seed, 'probe')), p = makeProbe(), half = PROBE.arena / 2;
  probeInit(p, rng);
  for (let n = 0; n < steps; n++) {
    probeAdvance(p, rng, n, half * dsin(n * 0.011), half * dcos(n * 0.007), null);
    if (n % PROBE.slice === PROBE.slice - 1) yield n + 1;
  }
  return { hash: hashState({ probe: p, rng }), steps, pos: p.pos };
}

// function* 를 끝까지 돌려 끝난 값을 돌려준다(Node · 워커가 쓰는 길)
export function runAll(it) {
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}
