// 토대 조각의 불변 조건: 상태 나무(clone · hashState) · 사건 통 · tune 표 · 난수 · 입력 표.
import assert from 'node:assert/strict';
import { makeState, clone, hashState } from '../../src/shared/state.js';
import { EVENTS, EV, EV_NAMES, EV_FIELDS, makeEvents, emit, clearEvents, evField, hashEvents } from '../../src/shared/events.js';
import { TUNE, tuneGet, tuneSet, tuneSnapshot, tuneApply } from '../../src/shared/tune/index.js';
import { SIM, STEP } from '../../src/shared/tune/sim.js';
import { makeRng, rngNext, rngInt, rngRange, seedFrom } from '../../src/shared/rng.js';
import { hashNew, hashHex } from '../../src/shared/hash.js';
import { makeInput, quantAngle } from '../../src/shared/input.js';
import { GAME } from '../../src/shared/game.js';
import { newGame } from '../../src/sim/step.js';
import { makeRun, advance, runHash, probeBot } from '../../src/bot/run.js';

const sample = () => ({ ...makeState('probe', 7, 'normal'), n: 1.5, flag: true, name: '솔개', none: null, list: [1, { a: 2 }, [3]], f: new Float32Array([1, 2]), u: new Uint16Array([7]) });

function tree() {
  const a = sample(), b = clone(a);
  assert.deepEqual(b, a); assert.equal(hashState(b), hashState(a)); assert.notEqual(b.f, a.f); assert.notEqual(b.list[1], a.list[1]);
  assert.deepEqual(Object.keys(b), Object.keys(a), '복제가 열쇠 순서를 바꿨다');
  b.f[0] = 9; b.list[1].a = 5; b.clock.step = 3;
  assert.equal(a.f[0], 1); assert.equal(a.list[1].a, 2); assert.equal(a.clock.step, 0);
  const base = hashState(a), seen = new Set([base]);
  const edits = [(s) => { s.n = 1.5000000000000002; }, (s) => { s.n = -0; }, (s) => { s.flag = false; }, (s) => { s.name = '솔개 '; }, (s) => { s.none = 0; },
    (s) => { s.list[2][0] = 4; }, (s) => { s.list.push(0); }, (s) => { s.f[1] = 2.5; }, (s) => { s.u = new Int16Array([7]); }, (s) => { s.extra = 0; },
    (s) => { s.rng.s += 1; }, (s) => { s.clock = { step: 0, extra: 0 }; }, (s) => { delete s.flag; s.flag = true; }];
  for (const edit of edits) { const s = sample(); edit(s); const h = hashState(s); assert.ok(!seen.has(h), '잎 하나를 바꿨는데 해시가 같다: ' + edit); seen.add(h); }
  const zero = sample(), nanA = sample(), nanB = sample(); zero.n = 0;
  nanA.n = NaN; nanB.n = new Float64Array(new Uint32Array([1, 0xfff80000]).buffer)[0];        // 부호 · 꼬리가 다른 NaN
  assert.equal(hashState(nanA), hashState(nanB), 'NaN 의 비트 꼴에 따라 해시가 갈린다'); assert.notEqual(hashState(nanA), hashState(zero));
  const minus = sample(); minus.n = -0; assert.notEqual(hashState(minus), hashState(zero), '−0 과 +0 이 같은 해시다(비트 그대로 봐야 한다)');
  // 부호 비트를 짝수 번 뒤집어도 해시의 앞 절반 · 뒤 절반이 저마다 달라져야 한다(두 줄이 모두 일한다)
  const plus = sample(), flipped = sample(); plus.list = [1.5, 2.5, 3.5, 4.5]; flipped.list = [-1.5, -2.5, -3.5, -4.5];
  const hp = hashState(plus), hf = hashState(flipped);
  assert.notEqual(hp.slice(0, 8), hf.slice(0, 8), '부호 넷을 뒤집었는데 해시의 앞 절반이 그대로다'); assert.notEqual(hp.slice(8), hf.slice(8));
  const shared = { x: 1 }, loop = { a: {} }; loop.a.back = loop;
  const view = new Float64Array(4);
  for (const bad of [{ f() {} }, { u: undefined }, { m: new Map() }, { d: new Date(0) }, { c: new (class Foo {})() }, { s: Symbol('x') }, { a: shared, b: shared }, loop,
    { a: view, b: view.subarray(1) }, { v: new DataView(new ArrayBuffer(8)) }, { b: new BigInt64Array(1) }, [1, , 3]]) assert.throws(() => clone(bad), /상태/);
  assert.throws(() => hashState({ b: new BigUint64Array(1) }), /상태/);
  const g = newGame('probe', 7, 'normal', null);
  assert.equal(hashState(clone(g)), hashState(g)); assert.equal(g.seed, 7); assert.equal(g.clock.step, 0);
  assert.notEqual(hashState(newGame('probe', 8, 'normal', null)), hashState(g));
}

function events() {
  assert.deepEqual(EV_NAMES.map((name) => EV[name]), EV_NAMES.map((_, i) => i), '사건 번호는 표에 적힌 순서다');
  for (const name of EV_NAMES) { assert.ok(EVENTS[name].length <= EV_FIELDS, name + ' 의 필드가 칸보다 많다'); assert.equal(new Set(EVENTS[name]).size, EVENTS[name].length); }
  assert.ok(Object.isFrozen(EVENTS) && Object.isFrozen(EVENTS.probeBounce) && Object.isFrozen(EV));
  const ev = makeEvents(2);
  emit(ev, EV.probeBounce, 3, 1.5, -2); emit(ev, EV.probePulse, 60); emit(ev, EV.restored);
  assert.equal(ev.n, 2); assert.equal(ev.dropped, 1);
  assert.equal(ev.data[evField('probeBounce', 'z')], -2); assert.equal(ev.data[EV_FIELDS + evField('probePulse', 'step')], 60); assert.equal(ev.data[EV_FIELDS + 1], 0);
  assert.throws(() => evField('probeBounce', 'nope'), /사건 표/); assert.throws(() => evField('nope', 'x'), /사건 표/);
  // 표에 없는 이름(EV.shot = undefined)은 0번(restored)으로 적히지 않고 바로 터진다
  for (const kind of [EV.shot, EV_NAMES.length, -1, NaN, 'probeBounce']) assert.throws(() => emit(ev, kind, 1, 2, 3), /사건 표/);
  // 값은 여덟 칸까지 — 아홉째는 조용히 버리지 않는다
  const wide = makeEvents(1); emit(wide, EV.restored, 1, 2, 3, 4, 5, 6, 7, 8); assert.equal(wide.data[EV_FIELDS - 1], 8);
  assert.throws(() => emit(ev, EV.probeBounce, 1, 2, 3, 4, 5, 6, 7, 8, 9), /칸까지/);
  assert.equal(ev.n, 2); assert.equal(ev.dropped, 1);
  const h1 = hashNew(), h2 = hashNew(); hashEvents(h1, ev); ev.data[1] = 1.25; hashEvents(h2, ev); assert.notEqual(hashHex(h1), hashHex(h2));
  clearEvents(ev); assert.equal(ev.n, 0); assert.equal(makeEvents().cap, SIM.eventCap);
}

function tune() {
  const leaves = [], walk = (node, path) => { for (const k of Object.keys(node)) { if (node[k] !== null && typeof node[k] === 'object') walk(node[k], path + k + '.'); else leaves.push([path + k, node[k]]); } };
  walk(TUNE, '');
  assert.ok(leaves.length > 0);
  for (const [path, v] of leaves) { assert.ok((typeof v === 'number' && Number.isFinite(v)) || typeof v === 'boolean' || typeof v === 'string', 'tune 잎은 유한한 수 · 불리언 · 글자: ' + path); assert.equal(tuneGet(path), v); }
  assert.equal(STEP, 1 / SIM.hz); assert.equal(tuneGet('nope.x'), undefined); assert.equal(tuneGet('probe.toString'), undefined);
  const refuse = [['nope.x', 1], ['probe', 1], ['probe.speed', '3'], ['probe.speed', NaN], ['probe.nope', 1], ['__proto__.x', 1], ['probe.constructor', 1], ['sim.hz', 30]];
  for (const [path, v] of refuse) assert.equal(tuneSet(path, v), false, 'tuneSet 이 받으면 안 되는 값을 받았다: ' + path);
  assert.ok(Object.isFrozen(SIM) && STEP === 1 / SIM.hz, '뼈대 수치(SIM)는 얼려 둔다 — hz 를 바꿔도 STEP 은 안 따라온다');
  const snap = tuneSnapshot(), old = tuneGet('probe.speed'), run = (seed) => { const r = makeRun(seed, probeBot); advance(r, 300); return runHash(r); }, before = run(5);
  assert.ok(tuneSet('probe.speed', old * 1.5));
  try { assert.equal(tuneGet('probe.speed'), old * 1.5); assert.notEqual(run(5), before, 'tune 을 바꿨는데 sim 이 그대로다 — 표를 안 읽고 있다'); assert.equal(snap.probe.speed, old); } finally { tuneSet('probe.speed', old); }
  assert.equal(run(5), before); assert.deepEqual(tuneSnapshot(), snap);
  // tuneApply: 스냅숏을 통째로 넣는다(워커 안의 사본을 주 창의 표에 맞추는 길). 못 넣는 잎이 있으면 false
  const changed = tuneSnapshot(); changed.probe.speed = old * 2; changed.probe.pull = snap.probe.pull + 0.25;
  try {
    assert.equal(tuneApply(changed), true); assert.deepEqual(tuneSnapshot(), changed); assert.notEqual(run(5), before);
    assert.equal(tuneApply({ sim: { hz: 30 } }), false); assert.equal(tuneApply({ probe: { nope: 1 } }), false); assert.equal(tuneApply({ probe: { speed: '3' } }), false);
    assert.deepEqual(tuneSnapshot(), changed, '못 넣는 스냅숏이 표를 바꿨다');
  } finally { assert.equal(tuneApply(snap), true); }
  assert.deepEqual(tuneSnapshot(), snap); assert.equal(run(5), before);
}

function rngAndInput() {
  const a = makeRng(42), b = makeRng(42), c = makeRng(43);
  let sum = 0, same = 0;
  for (let i = 0; i < 100000; i++) { const x = rngNext(a); assert.ok(x >= 0 && x < 1); sum += x; assert.equal(rngNext(b), x); if (rngNext(c) === x) same++; }
  assert.ok(Math.abs(sum / 100000 - 0.5) < 0.01 && same < 10 && a.s === b.s);
  for (let i = 0; i < 1000; i++) { const n = rngInt(a, 6), x = rngRange(a, -2, 3); assert.ok(Number.isInteger(n) && n >= 0 && n < 6 && x >= -2 && x < 3); }
  assert.notEqual(seedFrom(7, 'sim'), seedFrom(7, 'probe')); assert.notEqual(seedFrom(7, 'sim'), seedFrom(8, 'sim')); assert.equal(seedFrom(7, 'sim'), seedFrom(7, 'sim'));
  assert.deepEqual(Object.keys(makeInput()), ['mx', 'mz', 'yaw', 'pitch', 'held', 'edge', 'wheel']);
  for (const x of [0.123456789, -3.14159265, 2e-5, 1.00005]) { const q = quantAngle(x); assert.ok(Math.abs(q - x) <= 0.5 / SIM.angleSteps + 1e-12); assert.equal(quantAngle(q), q); }
  assert.ok(Object.isFrozen(GAME) && GAME.store === GAME.key + '.' && GAME.title.length > 0);
}

export const tests = [
  { name: '상태 나무 — 복제는 깊고, 잎 하나만 달라도 해시가 다르고, 나무가 아닌 것은 거부', tags: ['gate', 'roundtrip'], run: tree },
  { name: '사건 표 · 사건 통', tags: ['gate'], run: events },
  { name: 'tune 표 — 잎의 형 · tuneSet 규칙 · 바꾸면 sim 이 달라지고 되돌리면 돌아온다', tags: ['gate'], run: tune },
  { name: '난수 · 입력 표 · 이름', tags: ['gate'], run: rngAndInput },
];
