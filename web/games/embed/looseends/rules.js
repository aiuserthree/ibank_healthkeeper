/* 실타래 풀기(looseends) — 규칙 · 풀이기 · 퍼즐 생성기. 브라우저와 Node 시험이 같이 쓴다.
 *
 * 규칙
 *  - 판 둘레(와 안쪽)에 구멍이 있고, 줄마다 양 끝 핀이 서로 다른 구멍에 걸려 있다.
 *  - 줄은 위아래 순서(z)가 있다. 다른 줄과 교차할 때 자기가 모두 「위」에 있어야 움직일 수 있다.
 *  - 움직일 수 있는 줄의 핀 하나를 빈 구멍으로 옮긴다(한 번 = 1수). 옮긴 줄은 맨 위로 올라간다.
 *  - 모든 줄의 교차를 풀면 줄이 한꺼번에 빠져나간다. 그 전에는 모든 핀이 판에 남는다.
 *  꼬임(2026-11-21)
 *  - 덮인 줄도 옮길 수 있다. 옮기는 줄과 「얽힌」 줄(위에서 덮고 있거나 이미 감긴 줄)마다 감긴 수 w 가 ±1 바뀐다.
 *    방향 σ 는 핀이 지나간 길(h1 → h2)이 그 줄을 기준으로 어느 쪽으로 돌았는가. 반대로 돌리면 풀린다.
 *  - 감긴 쌍(w ≠ 0)이 하나라도 있으면 엇갈림이 없어도 빠지지 않는다.
 *  - 「깔끔한 수」 = 어느 쌍의 |w| 도 늘리지 않는 수. 목표 수 · 힌트는 깔끔한 수만으로 구한다.
 *  상태의 꼬임은 tw = { 'id-id': w } (작은 id 먼저). 없으면 {} 로 본다.
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
  const TW_MAX = 3;
  const pairKey = (x, y) => (x < y ? x + '-' + y : y + '-' + x);
  const twOf = (tw, x, y) => (tw && tw[pairKey(x, y)]) || 0;
  const twCount = tw => { let n = 0; for (const k in tw || {}) if (tw[k]) n += Math.abs(tw[k]); return n; };
  const twPairs = tw => Object.keys(tw || {}).filter(k => tw[k]).map(k => { const [x, y] = k.split('-').map(Number); return { x, y, w: tw[k] }; });
  // 핀이 h1 → h2 로 갈 때 줄 s 를 기준으로 돈 방향(+1 / -1)
  function sigma(holes, s, h1, h2) {
    const lo = Math.min(s.a, s.b), hi = Math.max(s.a, s.b), A = holes[lo], B = holes[hi], P = holes[h1], Q = holes[h2];
    const c = cross2(B.x - A.x, B.y - A.y, Q.x - P.x, Q.y - P.y);
    if (Math.abs(c) < 1e-9) return h2 > h1 ? 1 : -1;
    return c > 0 ? 1 : -1;
  }
  // 줄 i 와 얽힌 줄 번호들: 위에서 덮고 있거나 이미 감긴 줄
  function entangled(holes, ropes, i, m, tw) {
    m = m || crossMatrix(holes, ropes);
    const out = [], id = ropes[i].id;
    for (let j = 0; j < ropes.length; j++) if (j !== i && ((j > i && m[i][j]) || twOf(tw, id, ropes[j].id))) out.push(j);
    return out;
  }
  // 한 수가 꼬임에 주는 변화: [{ id, w0, w1 }] (상대 줄 id, 전 · 뒤 감긴 수)
  function twistDelta(holes, ropes, ri, end, hole, m, tw) {
    const r = ropes[ri], h1 = r[end], out = [];
    for (const j of entangled(holes, ropes, ri, m, tw)) {
      const s = ropes[j], w0 = twOf(tw, r.id, s.id), raw = w0 + sigma(holes, s, h1, hole), w1 = Math.max(-TW_MAX, Math.min(TW_MAX, raw));
      if (w1 !== w0) out.push({ id: s.id, w0, w1 });
      else if (raw !== w0) out.push({ id: s.id, w0, w1, over: true }); // 상한에 막혀 그대로지만 더 꼬려는 수
    }
    return out;
  }
  const isClean = delta => delta.every(d => !d.over && Math.abs(d.w1) <= Math.abs(d.w0));
  // 한 수 적용: 옮긴 줄을 맨 위로 올린 새 상태 반환. tw 를 주면 { ropes, tw } 를 돌려준다.
  function applyMove(ropes, ri, end, hole, holes, tw) {
    const next = ropes.map(r => ({ ...r }));
    const [r] = next.splice(ri, 1);
    let ntw = null;
    if (holes) {
      ntw = { ...(tw || {}) };
      for (const d of twistDelta(holes, ropes, ri, end, hole, null, tw)) { const k = pairKey(r.id, d.id); if (d.w1) ntw[k] = d.w1; else delete ntw[k]; }
    }
    r[end] = hole;
    next.push(r); // 맨 위로
    return holes ? { ropes: next, tw: ntw } : next;
  }
  function settle(holes, ropes, tw) {
    return freed(holes, ropes).length === ropes.length && !twCount(tw)
      ? { ropes: [], gone: ropes }
      : { ropes, gone: [] };
  }
  const keyOf = (ropes, tw) => ropes.map(r => (r.a < r.b ? r.a + '-' + r.b : r.b + '-' + r.a)).join('|') + (twCount(tw) ? '#' + Object.keys(tw).filter(k => tw[k]).sort().map(k => k + ':' + tw[k]).join(',') : '');

  // 둘 수 있는 수. opts.all 이면 꼬임을 늘리는 수까지, 아니면 깔끔한 수만. 각 수에 delta(꼬임 변화)를 붙인다.
  function moves(holes, ropes, m = crossMatrix(holes, ropes), tw, opts) {
    const out = [], occ = occupied(ropes), all = opts && opts.all;
    const empties = [];
    for (let h = 0; h < holes.length; h++) if (!occ.has(h)) empties.push(h);
    for (let i = 0; i < ropes.length; i++) {
      const ent = entangled(holes, ropes, i, m, tw);
      if (!ent.length) { for (const end of ['a', 'b']) for (const h of empties) out.push({ rope: i, end, to: h, delta: [] }); continue; }
      for (const end of ['a', 'b']) for (const h of empties) {
        const delta = twistDelta(holes, ropes, i, end, h, m, tw);
        if (all || isClean(delta)) out.push({ rope: i, end, to: h, delta });
      }
    }
    return out;
  }

  // 엇갈리거나 감긴 쌍 하나마다 둘 중 하나는 최소 한 번 옮겨야 한다(겹치지 않는 쌍 수 = 하한).
  function moveLowerBound(matrix, ropes, tw) {
    const matched = new Set(), n = matrix.length;
    const bad = (i, j) => matrix[i][j] || (tw && ropes && twOf(tw, ropes[i].id, ropes[j].id));
    for (let i = 0; i < n; i++) {
      if (matched.has(i)) continue;
      for (let j = i + 1; j < n; j++) {
        if (!bad(i, j) || matched.has(j)) continue;
        matched.add(i); matched.add(j);
        break;
      }
    }
    return matched.size / 2;
  }

  // 깊이 제한을 한 수씩 늘려 최소 풀이를 찾는다. 한도를 넘으면 null.
  // opts.tw: 시작 꼬임, opts.all: 꼬임을 늘리는 수도 쓴다(기본은 깔끔한 수만).
  function solve(holes, ropes, opts) {
    const cap = (opts && opts.nodes) || 120000, maxDepth = (opts && opts.depth) || 12, all = !!(opts && opts.all);
    const tw0 = (opts && opts.tw) || {};
    const visited = new Map(), path = [];
    let nodes = 0;
    function search(current, tw, remaining) {
      if (++nodes > cap) return false;
      const key = keyOf(current, tw);
      if (visited.get(key) >= remaining) return false;
      visited.set(key, remaining);
      const matrix = crossMatrix(holes, current);
      const bound = moveLowerBound(matrix, current, tw);
      if (bound === 0) return true;
      if (bound > remaining) return false;
      for (const mv of moves(holes, current, matrix, tw, { all })) {
        path.push({ id: current[mv.rope].id, end: mv.end, to: mv.to });
        const nx = applyMove(current, mv.rope, mv.end, mv.to, holes, tw);
        if (search(nx.ropes, nx.tw, remaining - 1)) return true;
        path.pop();
        if (nodes > cap) return false;
      }
      return false;
    }
    const start = moveLowerBound(crossMatrix(holes, ropes), ropes, tw0);
    for (let depth = start; depth <= maxDepth && nodes <= cap; depth++) {
      visited.clear();
      if (search(ropes, tw0, depth)) return path;
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

  // 처음부터 꼬인 판: 깔끔한 판에서 덮인 줄 하나를 억지로 뺀 상태로 시작. 깔끔한 풀이 최소 수가 목표.
  function twist(p, seed, opts) {
    const rand = rng(seed * 40503 + 977), holes = p.holes, cap = (opts && opts.nodes) || 90000, maxMoves = (opts && opts.maxMoves) || 8;
    const cand = moves(holes, p.ropes, undefined, {}, { all: true }).filter(mv => mv.delta.length);
    for (let t = 0; t < Math.min(12, cand.length); t++) {
      const mv = cand.splice(Math.floor(rand() * cand.length), 1)[0];
      const nx = applyMove(p.ropes, mv.rope, mv.end, mv.to, holes, {});
      if (settle(holes, nx.ropes, nx.tw).gone.length) continue;
      const sol = solve(holes, nx.ropes, { tw: nx.tw, nodes: cap, depth: maxMoves });
      if (!sol || sol.length < 2) continue;
      return { ...p, ropes: nx.ropes.map(r => ({ a: r.a, b: r.b, id: r.id })), tw: nx.tw, target: sol.length, solution: sol };
    }
    return null;
  }

  return { rng, layout, crosses, crossMatrix, movable, coveredBy, freed, occupied, applyMove, settle, moves, solve, generate, twist, keyOf, NEAR, pairKey, twOf, twCount, twPairs, sigma, entangled, twistDelta, isClean, TW_MAX };
});
