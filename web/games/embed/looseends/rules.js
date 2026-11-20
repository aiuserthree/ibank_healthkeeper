/* 실타래 풀기(looseends) — 규칙 · 풀이기 · 퍼즐 생성기. 브라우저와 Node 시험이 같이 쓴다.
 *
 * 규칙
 *  - 판 둘레(와 안쪽)에 구멍이 있고, 줄마다 양 끝 핀이 서로 다른 구멍에 걸려 있다.
 *  - 줄은 위아래 순서(z)가 있다. 다른 줄과 교차할 때 자기가 모두 「위」에 있어야 움직일 수 있다.
 *  - 움직일 수 있는 줄의 핀 하나를 빈 구멍으로 옮긴다(한 번 = 1수). 옮긴 줄은 맨 위로 올라간다.
 *  - 모든 줄의 교차를 풀면 줄이 한꺼번에 빠져나간다. 그 전에는 모든 핀이 판에 남는다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LooseRules = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const NEAR = 0.045; // 정규화 좌표에서 핀이 다른 줄에 이만큼 가까우면 걸린 것으로 본다

  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }

  // 구멍 배치: 바깥 고리 ring 개 + 안쪽 고리 inner 개. 좌표는 -1 ~ 1.
  function layout(ring, inner) {
    const holes = [];
    for (let i = 0; i < ring; i++) {
      const a = -Math.PI / 2 + i * 2 * Math.PI / ring;
      holes.push({ x: Math.cos(a), y: Math.sin(a), ring: true });
    }
    for (let i = 0; i < inner; i++) {
      const a = -Math.PI / 2 + Math.PI / inner + i * 2 * Math.PI / inner;
      holes.push({ x: Math.cos(a) * 0.5, y: Math.sin(a) * 0.5, ring: false });
    }
    return holes;
  }

  const cross2 = (ax, ay, bx, by) => ax * by - ay * bx;
  function segDist(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }
  function segCross(p1, p2, p3, p4) {
    const d1 = cross2(p4.x - p3.x, p4.y - p3.y, p1.x - p3.x, p1.y - p3.y);
    const d2 = cross2(p4.x - p3.x, p4.y - p3.y, p2.x - p3.x, p2.y - p3.y);
    const d3 = cross2(p2.x - p1.x, p2.y - p1.y, p3.x - p1.x, p3.y - p1.y);
    const d4 = cross2(p2.x - p1.x, p2.y - p1.y, p4.x - p1.x, p4.y - p1.y);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  }
  // 두 줄이 교차하는가(점이 줄 위에 얹힌 경우 포함)
  function crosses(holes, r, s) {
    const a = holes[r.a], b = holes[r.b], c = holes[s.a], d = holes[s.b];
    if (segCross(a, b, c, d)) return true;
    return segDist(a, c, d) < NEAR || segDist(b, c, d) < NEAR || segDist(c, a, b) < NEAR || segDist(d, a, b) < NEAR;
  }

  // ropes: 아래 → 위 순서의 배열 [{a, b, id}]
  function crossMatrix(holes, ropes) {
    const n = ropes.length, m = ropes.map(() => Array(n).fill(false));
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) m[i][j] = m[j][i] = crosses(holes, ropes[i], ropes[j]);
    return m;
  }
  // 움직일 수 있나 — 교차하는 줄이 모두 자기 아래에 있어야 한다(위에 덮은 줄이 없어야 한다)
  function movable(holes, ropes, i, m) {
    m = m || crossMatrix(holes, ropes);
    for (let j = i + 1; j < ropes.length; j++) if (m[i][j]) return false;
    return true;
  }
  // 어떤 줄이 무엇을 덮고 있나(힌트 · 안내용): 위에서 덮고 있는 줄 번호들
  function coveredBy(holes, ropes, i, m) {
    m = m || crossMatrix(holes, ropes);
    const out = [];
    for (let j = i + 1; j < ropes.length; j++) if (m[i][j]) out.push(j);
    return out;
  }
  // 아무 줄과도 교차하지 않는 줄들
  function freed(holes, ropes) {
    const m = crossMatrix(holes, ropes), out = [];
    for (let i = 0; i < ropes.length; i++) if (!m[i].some(Boolean)) out.push(i);
    return out;
  }
  function occupied(ropes) {
    const set = new Set();
    for (const r of ropes) { set.add(r.a); set.add(r.b); }
    return set;
  }
  // 한 수 적용: 옮긴 줄을 맨 위로 올린 새 상태 반환
  function applyMove(ropes, ri, end, hole) {
    const next = ropes.map(r => ({ ...r }));
    const [r] = next.splice(ri, 1);
    r[end] = hole;
    next.push(r); // 맨 위로
    return next;
  }
  function settle(holes, ropes) {
    return freed(holes, ropes).length === ropes.length
      ? { ropes: [], gone: ropes }
      : { ropes, gone: [] };
  }
  const keyOf = ropes => ropes.map(r => (r.a < r.b ? r.a + '-' + r.b : r.b + '-' + r.a)).join('|');

  function moves(holes, ropes, m = crossMatrix(holes, ropes)) {
    const out = [], occ = occupied(ropes);
    const empties = [];
    for (let h = 0; h < holes.length; h++) if (!occ.has(h)) empties.push(h);
    for (let i = 0; i < ropes.length; i++) {
      if (!movable(holes, ropes, i, m)) continue;
      for (const end of ['a', 'b']) for (const h of empties) out.push({ rope: i, end, to: h });
    }
    return out;
  }

  // 서로 다른 줄로 이루어진 교차 쌍 하나마다 최소 한 번 옮겨야 한다.
  function moveLowerBound(matrix) {
    const matched = new Set();
    for (let i = 0; i < matrix.length; i++) {
      if (matched.has(i)) continue;
      for (let j = i + 1; j < matrix.length; j++) {
        if (!matrix[i][j] || matched.has(j)) continue;
        matched.add(i); matched.add(j);
        break;
      }
    }
    return matched.size / 2;
  }

  // 깊이 제한을 한 수씩 늘려 최소 풀이를 찾는다. 한도를 넘으면 null.
  function solve(holes, ropes, opts) {
    const cap = (opts && opts.nodes) || 120000, maxDepth = (opts && opts.depth) || 12;
    const visited = new Map(), path = [];
    let nodes = 0;
    function search(current, remaining) {
      if (++nodes > cap) return false;
      const key = keyOf(current);
      if (visited.get(key) >= remaining) return false;
      visited.set(key, remaining);
      const matrix = crossMatrix(holes, current);
      const bound = moveLowerBound(matrix);
      if (bound === 0) return true;
      if (bound > remaining) return false;
      for (const mv of moves(holes, current, matrix)) {
        path.push({ id: current[mv.rope].id, end: mv.end, to: mv.to });
        if (search(applyMove(current, mv.rope, mv.end, mv.to), remaining - 1)) return true;
        path.pop();
        if (nodes > cap) return false;
      }
      return false;
    }
    const start = moveLowerBound(crossMatrix(holes, ropes));
    for (let depth = start; depth <= maxDepth && nodes <= cap; depth++) {
      if (search(ropes, depth)) return path;
    }
    return null;
  }

  // 퍼즐 하나 만들기. opts: { ring, inner, ropes, minMoves, maxMoves, tries }
  function generate(seed, opts) {
    const rand = rng(seed * 2654435761 + 12345), tries = opts.tries || 400;
    const holes = layout(opts.ring, opts.inner || 0);
    for (let t = 0; t < tries; t++) {
      const idx = holes.map((_, i) => i);
      for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
      const ropes = [];
      for (let i = 0; i < opts.ropes; i++) ropes.push({ a: idx[i * 2], b: idx[i * 2 + 1], id: i });
      // 위아래 순서는 무작위로 섞는다
      for (let i = ropes.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [ropes[i], ropes[j]] = [ropes[j], ropes[i]]; }
      const m = crossMatrix(holes, ropes);
      // 시작할 때는 모든 줄이 한 번 이상 교차해야 한다.
      if (m.some(row => !row.some(Boolean))) continue;
      const sol = solve(holes, ropes, { nodes: opts.nodes || 90000, depth: opts.maxMoves + 1 });
      if (!sol || sol.length < (opts.minMoves || 1) || sol.length > opts.maxMoves) continue;
      return { holes, ropes: ropes.map(r => ({ a: r.a, b: r.b, id: r.id })), target: sol.length, solution: sol, seed, ring: opts.ring, inner: opts.inner || 0 };
    }
    return null;
  }

  return { rng, layout, crosses, crossMatrix, movable, coveredBy, freed, occupied, applyMove, settle, moves, solve, generate, keyOf, NEAR };
});
