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
  assert.equal(Math.abs(R.twOf(one.tw, 0, 1)), 1, '위 줄 밑으로 지나가면 걸린다(감긴 수 1)');
  assert.equal(one.ropes[one.ropes.length - 1].id, 1, '걸린 줄은 위 줄 밑에 남는다');
  // 3-4 와 2-6 은 엇갈리지 않지만 감겨 있으니 빠지지 않는다
  assert.equal(R.freed(holes, one.ropes).length, 2, '엇갈림은 없다');
  assert.equal(R.settle(holes, one.ropes, one.tw).gone.length, 0, '감긴 채로는 빠지지 않는다');
  // 같은 핀을 반대로(3 → 0) 되돌리면 풀린다
  const back = R.applyMove(one.ropes, one.ropes.findIndex(r => r.id === 0), 'a', 0, holes, one.tw);
  assert.equal(R.twCount(back.tw), 0, '반대로 지나가면 감김이 풀린다');
  const s1 = R.sigma(holes, ropes[1], 0, 3), s2 = R.sigma(holes, ropes[1], 3, 0);
  assert.equal(s1, -s2, '길을 거꾸로 하면 방향도 반대');
  // 다른 줄(위 줄)을 옮겨서는 걸림이 풀리지 않는다
  const i1 = one.ropes.findIndex(r => r.id === 1), w = R.twOf(one.tw, 0, 1);
  for (const mv of R.moves(holes, one.ropes, undefined, one.tw, { all: true }).filter(x => x.rope === i1))
    assert.equal(R.twOf(R.applyMove(one.ropes, i1, mv.end, mv.to, holes, one.tw).tw, 0, 1), w, '위 줄을 옮겨도 걸림은 그대로');
  assert.ok(R.solve(holes, one.ropes, { tw: one.tw, nodes: 50000, depth: 6 }), '꼬인 상태에서도 깔끔한 풀이가 나온다');
  void w;
}
console.log('PASS twist: wind / unwind / no release while wound');

// 꼬이는 상대는 나를 덮고 있는 줄뿐: 덮이지 않은 줄이 다른 줄 밑을 지나가도 꼬이지 않는다(운영자 2026-11-21 「꼬임의 원인이 되는 옆의 줄만」)
{
  const holes = R.layout(8, 0);
  const ropes = [{ a: 0, b: 1, id: 0 }, { a: 3, b: 7, id: 1 }]; // 0 은 아래지만 1 과 엇갈리지 않음(덮이지 않음)
  const one = R.applyMove(ropes, 0, 'b', 5, holes, {});
  assert.equal(R.twCount(one.tw), 0, '덮지 않은 줄 밑을 지나가면 꼬이지 않는다');
  // 덮인 줄 + 다른 줄: 덮은 줄과만 꼬인다
  const h12 = R.layout(12, 0);
  const rs = [{ a: 0, b: 6, id: 0 }, { a: 2, b: 4, id: 1 }, { a: 3, b: 9, id: 2 }]; // 0 은 2(3-9)에 덮임, 1(2-4)은 0 과 안 엇갈림
  const d = R.twistDelta(h12, rs, 0, 'b', 1, null, {}); // 6 → 1: 2-4 와 3-9 를 모두 지나감
  assert.deepEqual(d.map(x => x.id), [2], '덮고 있던 줄과만 꼬인다');
}
console.log('PASS twist only with the rope covering the moved rope');

// 꼬이는 기준: 덮인 줄의 핀을 덮고 있는 줄 너머로 옮길 때만. 반대로 넘기면 풀리고 처음과 같아진다
{
  const holes = R.layout(12, 0);
  const ropes = [{ a: 0, b: 6, id: 0 }, { a: 3, b: 9, id: 1 }]; // 0 이 아래, 1 이 위에서 덮음(엇갈림)
  const one = R.applyMove(ropes, 0, 'b', 1, holes, {}); // 6 → 1: 덮은 줄 3-9 를 넘어감
  assert.equal(Math.abs(R.twOf(one.tw, 0, 1)), 1, '덮은 줄 너머로 옮기면 한 번 꼬임');
  const i0 = one.ropes.findIndex(r => r.id === 0);
  const stay = R.applyMove(one.ropes, i0, 'b', 2, holes, one.tw); // 1 → 2: 같은 쪽 안에서
  assert.equal(R.twOf(stay.tw, 0, 1), R.twOf(one.tw, 0, 1), '덮은 줄을 넘지 않으면 그대로');
  const back = R.applyMove(one.ropes, i0, 'b', 6, holes, one.tw); // 1 → 6: 되돌림
  assert.equal(R.twCount(back.tw), 0, '되돌리면 풀림');
  assert.deepEqual(back.ropes.map(r => [r.id, r.a, r.b]), ropes.map(r => [r.id, r.a, r.b]), '되돌리면 처음과 똑같다(밑 줄은 밑에)');
  const slide = R.applyMove(ropes, 0, 'b', 7, holes, {}); // 6 → 7: 덮은 줄을 넘지 않음
  assert.equal(R.twCount(slide.tw), 0, '덮은 줄을 넘지 않고 옮기면 안 꼬임');
  assert.deepEqual(slide.ropes.map(r => r.id), [0, 1], '여전히 덮인 채 밑에 있다');
}
console.log('PASS twist rule: only crossing the upper rope counts, direction = side to side');




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


// 꼬인 상태에서 힌트(suggest)만 따라가도 끝까지 풀린다 — 막다른 상태가 없다
{
  const rand = R.rng(11); let tried = 0, cleared = 0, maxSteps = 0;
  for (let t = 0; t < 30; t++) {
    const d = LV[(t * 7) % 40], holes = R.layout(d.ring, d.inner);
    let ropes = d.ropes.map(([a, b], k) => ({ a, b, id: k })), tw = {}; const hist = [];
    for (let k = 0; k < 3 + (t % 4); k++) {
      const ms = R.moves(holes, ropes, undefined, tw, { all: true }).filter(x => x.delta.length);
      if (!ms.length) break;
      const mv = ms[Math.floor(rand() * ms.length)], r = ropes[mv.rope], nx = R.applyMove(ropes, mv.rope, mv.end, mv.to, holes, tw);
      if (R.settle(holes, nx.ropes, nx.tw).gone.length) break;
      hist.push({ id: r.id, end: mv.end, from: r[mv.end], to: mv.to }); ropes = nx.ropes; tw = nx.tw;
    }
    if (!R.twCount(tw)) continue;
    tried++;
    // 게임처럼: 힌트가 있으면 두고, 없으면 되돌리기(상태를 그대로 되살림)
    let steps = 0; const snaps = hist.map(() => null); // 무작위 수의 되돌리기 상태는 아래서 다시 만든다
    { let rp = d.ropes.map(([a, b], k) => ({ a, b, id: k })), tp = {}; for (let k = 0; k < hist.length; k++) { snaps[k] = { ropes: rp, tw: tp }; const h = hist[k], i = rp.findIndex(r => r.id === h.id); const nx = R.applyMove(rp, i, h.end, h.to, holes, tp); rp = nx.ropes; tp = nx.tw; } }
    while (steps < 80) {
      const s = R.suggest(holes, ropes, tw, hist); steps++;
      if (!s) { assert.ok(snaps.length, 'undo available when no hint'); do { const b = snaps.pop(); hist.pop(); ropes = b.ropes; tw = b.tw; } while (snaps.length && R.twCount(tw)); continue; }
      const i = ropes.findIndex(r => r.id === s.id); snaps.push({ ropes, tw }); hist.push({ id: s.id, end: s.end, from: ropes[i][s.end], to: s.to });
      const nx = R.applyMove(ropes, i, s.end, s.to, holes, tw);
      if (R.settle(holes, nx.ropes, nx.tw).gone.length) { cleared++; break; }
      ropes = nx.ropes; tw = nx.tw;
    }
    maxSteps = Math.max(maxSteps, steps);
  }
  assert.ok(tried >= 12, 'enough twisted samples');
  assert.equal(cleared, tried, 'following hints always clears');
  console.log('PASS hints clear every twisted state', cleared + '/' + tried, 'max steps', maxSteps);
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


// 40판 모든 꼬이는 수: 같은 길로 되돌리면 처음과 똑같다(꼬임 0 · 엇갈린 쌍의 위아래 그대로) — 운영자 2026-11-21 「되돌리면 밑에 있어야」
{
  const sig = (h, rs) => { const m = R.crossMatrix(h, rs), o = []; for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) if (m[i][j]) o.push(rs[i].id + '<' + rs[j].id); return rs.map(r => r.id + ':' + Math.min(r.a, r.b) + '-' + Math.max(r.a, r.b)).sort().join() + '|' + o.sort().join(); };
  let n = 0;
  LV.forEach((d, li) => { const h = R.layout(d.ring, d.inner), r0 = d.ropes.map(([a, b], k) => ({ a, b, id: k }));
    for (const m of R.moves(h, r0, undefined, {}, { all: true })) { if (!m.delta.length) continue; n++;
      const id = r0[m.rope].id, from = r0[m.rope][m.end], one = R.applyMove(r0, m.rope, m.end, m.to, h, {}), i = one.ropes.findIndex(r => r.id === id), back = R.applyMove(one.ropes, i, m.end, from, h, one.tw);
      assert.equal(R.twCount(back.tw), 0, `level ${li + 1} back leaves twist`);
      assert.equal(sig(h, back.ropes), sig(h, r0), `level ${li + 1} back restores order`); } });
  console.log('PASS twist then move back restores the start exactly', n);
}

// 점수 상한: 본편 40판 최대 + 끝없는 실 한도가 서버 상한 이하
const per = 1000 + 3 * 500 + 300, max = per * 40 + 400 * 250;
assert.ok(max <= 250000, 'score cap');
console.log('PASS score max', max);

// 결정적 생성: 같은 씨앗은 같은 판
const a = R.generate(42, { ring: 10, inner: 0, ropes: 4, minMoves: 2, maxMoves: 4 }), b = R.generate(42, { ring: 10, inner: 0, ropes: 4, minMoves: 2, maxMoves: 4 });
assert.deepEqual(a.ropes, b.ropes); console.log('PASS deterministic generator');
