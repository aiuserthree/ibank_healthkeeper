// dmath 가 Math 와 얼마나 가까운가(표본 10만 · 함수마다) + 끝 값 · 범위 · 대칭. 「Node 와 크롬이 같은 비트를 내는가」는 탐침 해시가 본다(determinism · 브라우저 하네스).
// 오차 = |dmath − Math| ÷ max(1, |Math|). 표본은 씨앗 난수라 돌릴 때마다 같다. 시험 코드는 Math 를 마음대로 쓴다.
import assert from 'node:assert/strict';
import { PI, HALF_PI, dsin, dcos, dtan, datan, datan2, dasin, dacos, dexp, dlog, dpow } from '../../src/shared/dmath.js';
import { makeRng, rngRange } from '../../src/shared/rng.js';

const SAMPLES = 100000, TOL = 1e-12;
const mag = (r, lo, hi) => (rngRange(r, 0, 1) < 0.5 ? -1 : 1) * Math.pow(10, rngRange(r, lo, hi));   // 자릿수를 고르게 뽑은 ± 값
const edge = (r) => (rngRange(r, 0, 1) < 0.5 ? -1 : 1) * (1 - Math.pow(10, rngRange(r, -15, 0)));    // ±1 에 바짝 붙은 값까지
// [이름, dmath, Math, 인자 뽑기]
const CASES = [
  ['dsin', dsin, Math.sin, (r) => [rngRange(r, -1400, 1400)]],
  ['dcos', dcos, Math.cos, (r) => [rngRange(r, -1400, 1400)]],
  ['dsin(작은 각)', dsin, Math.sin, (r) => [mag(r, -9, 0)]],
  ['dsin(큰 각 — 2³⁰ 까지)', dsin, Math.sin, (r) => [mag(r, 3, 9)]],
  ['dcos(큰 각 — 2³⁰ 까지)', dcos, Math.cos, (r) => [mag(r, 3, 9)]],
  ['dtan', dtan, Math.tan, (r) => [rngRange(r, -1.5, 1.5)]],
  ['datan', datan, Math.atan, (r) => [mag(r, -8, 6)]],
  ['datan2', datan2, Math.atan2, (r) => [rngRange(r, -100, 100), rngRange(r, -100, 100)]],
  ['datan2(크기 섞음)', datan2, Math.atan2, (r) => [mag(r, -6, 6), mag(r, -6, 6)]],
  ['dasin', dasin, Math.asin, (r) => [rngRange(r, -1, 1)]],
  ['dacos', dacos, Math.acos, (r) => [rngRange(r, -1, 1)]],
  ['dasin(끝)', dasin, Math.asin, (r) => [edge(r)]],
  ['dacos(끝)', dacos, Math.acos, (r) => [edge(r)]],
  ['dexp', dexp, Math.exp, (r) => [rngRange(r, -40, 40)]],
  ['dlog', dlog, Math.log, (r) => [Math.abs(mag(r, -12, 12))]],
  ['dlog(1 근처)', dlog, Math.log, (r) => [1 + mag(r, -12, -1)]],
  ['dpow', dpow, Math.pow, (r) => [Math.abs(mag(r, -2, 2)), rngRange(r, -8, 8)]],
  ['dpow(정수 지수)', dpow, Math.pow, (r) => [rngRange(r, -9, 9), Math.round(rngRange(r, -20, 20))]],
];

function accuracy(t) {
  const worst = {};
  for (const [name, mine, ref, pick] of CASES) {
    const r = makeRng(20261118);
    let max = 0, at = null;
    for (let i = 0; i < SAMPLES; i++) {
      const a = pick(r), want = ref(...a), got = mine(...a);
      const err = Math.abs(got - want) / Math.max(1, Math.abs(want));
      if (!(err <= max)) { max = err; at = a; }                     // NaN 도 여기 걸린다
    }
    worst[name] = Number(max.toExponential(2));
    assert.ok(max <= TOL, `${name}: 최대 오차 ${max} (인자 ${at}) — ${TOL} 이하여야 한다`);
  }
  t.note('dmath 최대 오차(표본 ' + SAMPLES + ')', worst);
}

function specials() {
  assert.equal(dsin(0), 0); assert.equal(dcos(0), 1); assert.equal(dexp(0), 1); assert.equal(dlog(1), 0); assert.equal(datan(0), 0);
  assert.equal(datan2(0, 0), 0); assert.equal(datan2(1, 0), HALF_PI); assert.equal(datan2(-1, 0), -HALF_PI); assert.equal(datan2(0, -1), PI);
  assert.equal(dacos(1), 0); assert.equal(dacos(1.0000000001), 0); assert.equal(dasin(1), HALF_PI); assert.equal(dasin(-1.0000000001), -HALF_PI);
  assert.equal(dexp(1000), Infinity); assert.equal(dexp(-1000), 0); assert.ok(Number.isNaN(dexp(NaN)));
  assert.equal(dlog(0), -Infinity); assert.equal(dlog(Infinity), Infinity); assert.ok(Number.isNaN(dlog(-1))); assert.ok(Number.isNaN(dlog(NaN)));
  assert.ok(Math.abs(dlog(5e-324) - Math.log(5e-324)) < 1e-9 && Math.abs(dlog(1.7e308) - Math.log(1.7e308)) < 1e-9);
  assert.equal(dpow(7.5, 0), 1); assert.equal(dpow(2, 10), 1024); assert.equal(dpow(-2, 3), -8); assert.equal(dpow(2, -2), 0.25);
  assert.equal(dpow(0, 2.5), 0); assert.equal(dpow(0, -2.5), Infinity); assert.ok(Number.isNaN(dpow(-8, 1 / 3)));
  assert.ok(Math.abs(dpow(-1.5, 21) - Math.pow(-1.5, 21)) < 1e-9 && dpow(-1.5, 21) < 0 && dpow(-1.5, 22) > 0);
  assert.ok(Number.isNaN(dsin(Infinity)) && Number.isNaN(dsin(NaN)) && Number.isNaN(datan(NaN)));
  assert.equal(datan(Infinity), HALF_PI); assert.equal(datan(-Infinity), -HALF_PI);
  // NaN 은 삼키지 않는다 · 무한대끼리의 datan2 는 대각선
  for (const v of [dasin(NaN), dacos(NaN), datan2(NaN, NaN), datan2(1, NaN), datan2(NaN, 1), dtan(NaN), dcos(NaN), dpow(NaN, 2), dpow(2, NaN)]) assert.ok(Number.isNaN(v));
  assert.ok(Math.abs(datan2(Infinity, Infinity) - PI / 4) < 1e-15 && Math.abs(datan2(-Infinity, -Infinity) + 3 * PI / 4) < 1e-15);
  assert.equal(datan2(1, Infinity), 0); assert.equal(datan2(1, -Infinity), PI); assert.equal(datan2(-Infinity, 1), -HALF_PI);
  // 일부러 Math 와 다르게 정한 곳(머리 주석): |x| > 1 은 접는다 · datan2 는 0 의 부호를 안 본다 · dpow 의 0 은 Math 와 같다
  assert.equal(dasin(2), HALF_PI); assert.equal(dacos(-2), PI); assert.equal(datan2(-0, -1), PI); assert.equal(datan2(0, -0), 0);
  for (const [x, y] of [[0, 3], [-0, 3], [-0, -3], [-0, 17], [-0, -17], [-0, 18], [-0, -18], [0, -2.5], [-0, 2.5]]) assert.ok(Object.is(dpow(x, y), Math.pow(x, y)), `dpow(${Object.is(x, -0) ? '-0' : x}, ${y})`);
  // 쓸 수 있는 범위: 2³⁰ 까지. 그 밖은 NaN — 틀린 값(1 을 넘는 sin)을 조용히 내지 않는다
  const LIMIT = 2 ** 30;
  assert.ok(Math.abs(dsin(LIMIT) - Math.sin(LIMIT)) < TOL && Math.abs(dcos(-LIMIT) - Math.cos(LIMIT)) < TOL);
  for (const x of [LIMIT * 1.0000001, -LIMIT * 2, 1e16, 1e22, -1e300, Infinity, -Infinity]) assert.ok(Number.isNaN(dsin(x)) && Number.isNaN(dcos(x)) && Number.isNaN(dtan(x)), 'x = ' + x);
  const r = makeRng(7);
  for (let i = 0; i < 200000; i++) {                                // 홀 · 짝 대칭은 비트까지, 값은 늘 [−1, 1] 안
    const x = i < 101 ? (i - 50) * 0.137 + 0.01 : mag(r, -3, 9), s = dsin(x), c = dcos(x);
    assert.ok(s >= -1 && s <= 1 && c >= -1 && c <= 1, 'x = ' + x);
    assert.ok(Object.is(dsin(-x), -s) && Object.is(dcos(-x), c), 'x = ' + x);
    if (i < 101) { assert.equal(datan(-x), -datan(x)); assert.equal(dasin(-x / 8), -dasin(x / 8)); }
  }
  assert.ok(Object.is(dsin(-0), -0) && Object.is(dsin(0), 0));
}

export const tests = [
  { name: 'dmath 와 Math 의 차 ≤ 10⁻¹² (표본 10만 × 18)', tags: ['gate', 'dmath'], run: accuracy },
  { name: 'dmath 끝 값 · 범위 밖은 NaN · 대칭(비트까지)', tags: ['gate', 'dmath'], run: specials },
];
