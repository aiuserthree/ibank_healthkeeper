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

// 꼬임: 덮인 줄을 빼면 감긴다 · 반대로 돌리면 풀린다 · 감긴 채로는 안 빠진다
{
  const holes = R.layout(8, 0);
  const ropes = [{ a: 0, b: 4, id: 0 }, { a: 2, b: 6, id: 1 }]; // 0 이 아래, 1 이 위(덮음)
  const m = R.crossMatrix(holes, ropes);
  // 덮인 줄 0 의 a 핀을 0 → 3 으로: 줄 1 밑으로 빠져나가 한 번 감긴다
  const mvAll = R.moves(holes, ropes, m, {}, { all: true }), mvClean = R.moves(holes, ropes, m, {});
  assert.ok(mvAll.some(x => x.rope === 0), '덮인 줄도 옮길 수 있다(모든 수)');
  assert.ok(!mvClean.some(x => x.rope === 0), '깔끔한 수에는 덮인 줄이 없다(옛 규칙과 같음)');
  const one = R.applyMove(ropes, 0, 'a', 3, holes, {});
  assert.equal(Math.abs(R.twOf(one.tw, 0, 1)), 1, '덮인 줄을 빼면 감긴 수 1');
  assert.equal(one.ropes[one.ropes.length - 1].id, 0, '옮긴 줄은 맨 위로');
  // 3-4 와 2-6 은 엇갈리지 않지만 감겨 있으니 빠지지 않는다
  assert.equal(R.freed(holes, one.ropes).length, 2, '엇갈림은 없다');
  assert.equal(R.settle(holes, one.ropes, one.tw).gone.length, 0, '감긴 채로는 빠지지 않는다');
  // 같은 핀을 반대로(3 → 0) 되돌리면 풀린다
  const back = R.applyMove(one.ropes, one.ropes.findIndex(r => r.id === 0), 'a', 0, holes, one.tw);
  assert.equal(R.twCount(back.tw), 0, '반대로 지나가면 감김이 풀린다');
  const s1 = R.sigma(holes, ropes[1], 0, 3), s2 = R.sigma(holes, ropes[1], 3, 0);
  assert.equal(s1, -s2, '길을 거꾸로 하면 방향도 반대');
  // 감긴 쌍을 다른 줄(위 줄)로 풀 수도 있다: 위 줄 1 의 핀을 옮겨 반대 방향으로 돌리면 0
  const i1 = one.ropes.findIndex(r => r.id === 1), w = R.twOf(one.tw, 0, 1);
  const unw = R.moves(holes, one.ropes, undefined, one.tw).filter(x => x.rope === i1 && x.delta.some(d => d.w1 === 0));
  assert.ok(unw.length > 0, '위 줄을 돌려서도 감김을 풀 수 있다');
  assert.ok(R.solve(holes, one.ropes, { tw: one.tw, nodes: 50000, depth: 6 }), '꼬인 상태에서도 깔끔한 풀이가 나온다');
  void w;
}
console.log('PASS twist: wind / unwind / no release while wound');


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


// 꼬인 상태에서 힌트(깔끔한 풀이기)를 따라가면 끝까지 풀린다 · 막히면 되돌리기로 늘 시작으로 돌아간다
{
  const rand = R.rng(11); let solvedByHint = 0, tried = 0;
  for (let t = 0; t < 24; t++) {
    const d = LV[(t * 7) % 40], holes = R.layout(d.ring, d.inner);
    let ropes = d.ropes.map(([a, b], k) => ({ a, b, id: k })), tw = {};
    for (let k = 0; k < 3; k++) {
      const ms = R.moves(holes, ropes, undefined, tw, { all: true }).filter(x => x.delta.length);
      if (!ms.length) break;
      const mv = ms[Math.floor(rand() * ms.length)], nx = R.applyMove(ropes, mv.rope, mv.end, mv.to, holes, tw);
      if (R.settle(holes, nx.ropes, nx.tw).gone.length) break;
      ropes = nx.ropes; tw = nx.tw;
    }
    if (!R.twCount(tw)) continue;
    tried++;
    const sol = R.solve(holes, ropes, { tw, nodes: 150000, depth: 14 });
    if (!sol) continue;
    let cur = ropes, ctw = tw;
    for (const mv of sol) { const ri = cur.findIndex(r => r.id === mv.id); const nx = R.applyMove(cur, ri, mv.end, mv.to, holes, ctw); cur = nx.ropes; ctw = nx.tw; }
    assert.equal(R.settle(holes, cur, ctw).gone.length, cur.length, 'hint path from twisted state clears');
    solvedByHint++;
  }
  assert.ok(tried >= 10 && solvedByHint / tried >= 0.7, `twisted states mostly solvable by hint (${solvedByHint}/${tried})`);
  console.log('PASS hint from twisted states', solvedByHint + '/' + tried);
}

// 처음부터 꼬인 판(끝없는 실 · 오늘): 결정적 · 풀이가 목표 수와 같다 · 풀이 재생으로 빠진다
{
  const base = R.generate(77, { ring: 12, inner: 4, ropes: 6, minMoves: 4, maxMoves: 6 });
  const t1 = R.twist(base, 5, { maxMoves: 8 }), t2 = R.twist(base, 5, { maxMoves: 8 });
  assert.ok(t1 && R.twCount(t1.tw) > 0, 'twisted start has twist');
  assert.deepEqual(t1, t2, 'twist deterministic');
  let cur = t1.ropes, tw = t1.tw;
  for (const mv of t1.solution) { const ri = cur.findIndex(r => r.id === mv.id); const nx = R.applyMove(cur, ri, mv.end, mv.to, t1.holes, tw); cur = nx.ropes; tw = nx.tw; }
  assert.equal(R.settle(t1.holes, cur, tw).gone.length, cur.length, 'twisted start solution clears');
  console.log('PASS twisted start generator, target', t1.target);
}

// 점수 상한: 본편 40판 최대 + 끝없는 실 한도가 서버 상한 이하
const per = 1000 + 3 * 500 + 300, max = per * 40 + 400 * 250;
assert.ok(max <= 250000, 'score cap');
console.log('PASS score max', max);

// 결정적 생성: 같은 씨앗은 같은 판
const a = R.generate(42, { ring: 10, inner: 0, ropes: 4, minMoves: 2, maxMoves: 4 }), b = R.generate(42, { ring: 10, inner: 0, ropes: 4, minMoves: 2, maxMoves: 4 });
assert.deepEqual(a.ropes, b.ropes); console.log('PASS deterministic generator');
