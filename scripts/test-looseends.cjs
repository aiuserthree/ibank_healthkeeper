/* node scripts/test-looseends.cjs — 실타래 풀기 규칙 · 40판 풀이 가능 · 점수 상한 검사. */
const assert = require('node:assert/strict');
const R = require('../web/games/embed/looseends/rules.js');
const LV = require('../web/games/embed/looseends/levels.js');

// 규칙: 두 줄이 엇갈리면 위에 있는 줄만 움직일 수 있다
{
  const holes = R.layout(8, 0);
  const ropes = [{ a: 0, b: 4, id: 0 }, { a: 2, b: 6, id: 1 }]; // 아래, 위
  assert.ok(R.crosses(holes, ropes[0], ropes[1]), 'X 모양은 교차');
  const m = R.crossMatrix(holes, ropes);
  assert.equal(R.movable(holes, ropes, 1, m), true, '맨 위 줄은 움직일 수 있다');
  assert.equal(R.movable(holes, ropes, 0, m), false, '덮인 줄은 못 움직인다');
  const moved = R.applyMove(ropes, 1, 'a', 7), after = R.settle(holes, moved);
  assert.equal(after.gone.length, ropes.length, '모든 교차가 풀리면 줄이 한꺼번에 빠진다');
  const stage = LV[1], stageRopes = stage.ropes.map(([a, b], id) => ({ a, b, id }));
  const [move] = R.solve(holes, stageRopes);
  const oneMove = R.applyMove(stageRopes, stageRopes.findIndex(r => r.id === move.id), move.end, move.to);
  assert.ok(R.freed(holes, oneMove).length > 0, '첫 수로 일부 줄의 교차가 풀린다');
  assert.deepEqual(R.settle(holes, oneMove), { ropes: oneMove, gone: [] }, '일부만 풀렸을 때 모든 줄과 핀이 남는다');
}
console.log('PASS rules: cross / cover / settle');

// 본편 40판: 시작부터 풀린 줄 없음 · 풀이기가 목표 수와 같은 풀이를 찾는다 · 구멍 번호가 겹치지 않는다
assert.equal(LV.length, 40);
let totalTarget = 0;
LV.forEach((d, i) => {
  const holes = R.layout(d.ring, d.inner), ropes = d.ropes.map(([a, b], k) => ({ a, b, id: k }));
  const used = new Set(); for (const r of ropes) { assert.ok(r.a !== r.b && !used.has(r.a) && !used.has(r.b), `level ${i + 1} hole reuse`); used.add(r.a); used.add(r.b); assert.ok(r.a < holes.length && r.b < holes.length); }
  assert.equal(R.freed(holes, ropes).length, 0, `level ${i + 1} starts with a free rope`);
  const sol = R.solve(holes, ropes, { nodes: 400000, depth: d.target + 1 });
  assert.ok(sol, `level ${i + 1} unsolved`);
  assert.equal(sol.length, d.target, `level ${i + 1} target`);
  // 풀이를 그대로 재생해서 실제로 모두 빠지는지 확인
  let cur = R.settle(holes, ropes).ropes;
  for (const mv of sol) { const ri = cur.findIndex(r => r.id === mv.id); assert.ok(ri >= 0 && R.movable(holes, cur, ri), 'replay move legal'); cur = R.settle(holes, R.applyMove(cur, ri, mv.end, mv.to)).ropes; }
  assert.equal(cur.length, 0, `level ${i + 1} replay clears`);
  totalTarget += d.target;
});
console.log('PASS 40 levels solvable, targets match, total target moves', totalTarget);

// 점수 상한: 본편 40판 최대 + 끝없는 실 한도가 서버 상한 이하
const per = 1000 + 3 * 500 + 300, max = per * 40 + 400 * 250;
assert.ok(max <= 250000, 'score cap');
console.log('PASS score max', max);

// 결정적 생성: 같은 씨앗은 같은 판
const a = R.generate(42, { ring: 10, inner: 0, ropes: 4, minMoves: 2, maxMoves: 4 }), b = R.generate(42, { ring: 10, inner: 0, ropes: 4, minMoves: 2, maxMoves: 4 });
assert.deepEqual(a.ropes, b.ropes); console.log('PASS deterministic generator');
