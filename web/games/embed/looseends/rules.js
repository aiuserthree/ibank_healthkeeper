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
  // j 가 i 를 덮나: 엇갈리고, j 가 쌓인 순서로 위인데 i 의 핀이 j 너머로 넘어와 i 가 실제로 위에 놓인 경우(ov)는 뺀다.
  // 거꾸로 i 보다 아래에 쌓였어도 그 줄의 ov 에 i 가 있으면(그 줄이 i 위로 넘어옴) i 를 덮는다.
  const inOv = (r, id) => !!(r.ov && r.ov.includes(id));
  function covers(ropes, m, i, j) {
    if (!m[i][j]) return false;
    return j > i ? !inOv(ropes[i], ropes[j].id) : inOv(ropes[j], ropes[i].id);
  }
  function movable(holes, ropes, i, m) {
    m = m || crossMatrix(holes, ropes);
    for (let j = 0; j < ropes.length; j++) if (j !== i && covers(ropes, m, i, j)) return false;
    return true;
  }
  // 어떤 줄이 무엇을 덮고 있나(힌트 · 안내용): 위에서 덮고 있는 줄 번호들
  function coveredBy(holes, ropes, i, m) {
    m = m || crossMatrix(holes, ropes);
    const out = [];
    for (let j = 0; j < ropes.length; j++) if (j !== i && covers(ropes, m, i, j)) out.push(j);
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
  // 걸림(꼬임) 키: '아래줄id-위줄id' — 아래 줄(옮긴 줄)이 위 줄에 걸렸다. 순서가 있다.
  const pairKey = (low, host) => low + '-' + host;
  const twOf = (tw, low, host) => (tw && tw[pairKey(low, host)]) || 0;
  const twAny = (tw, x, y) => twOf(tw, x, y) || twOf(tw, y, x);
  const twCount = tw => { let n = 0; for (const k in tw || {}) if (tw[k]) n += Math.abs(tw[k]); return n; };
  const twPairs = tw => Object.keys(tw || {}).filter(k => tw[k]).map(k => { const [x, y] = k.split('-').map(Number); return { x, y, w: tw[k] }; });
  // 핀이 h1 → h2 로 갈 때 줄 s 를 기준으로 돈 방향(+1 / -1)
  function sigma(holes, s, h1, h2) {
    const lo = Math.min(s.a, s.b), hi = Math.max(s.a, s.b), A = holes[lo], B = holes[hi], P = holes[h1], Q = holes[h2];
    const c = cross2(B.x - A.x, B.y - A.y, Q.x - P.x, Q.y - P.y);
    if (Math.abs(c) < 1e-9) return h2 > h1 ? 1 : -1;
    return c > 0 ? 1 : -1;
  }
  // 핀이 h1 → h2 로 가는 동안 줄 s 를 「지나갔나」: 길이 s 를 가로지르거나, 옮기기 전후로 s 와의 엇갈림이 바뀌었다(s 의 핀을 돌아감)
  // 꼬이는 기준은 하나: 핀이 옛 구멍 → 새 구멍으로 곧게 가는 길이 그 줄을 가로지른다(그 줄 밑으로 지나간다).
  function passes(holes, r, end, h1, h2, s) {
    return segCross(holes[h1], holes[h2], holes[s.a], holes[s.b]);
  }
  // 줄 i 를 end 핀으로 hole 까지 옮길 때 걸림 변화: [{ id(위 줄), w0, w1, over? }]
  //  - 이미 걸린 위 줄: 그 줄을 다시 지나가면 방향대로 ±1(반대로 지나가면 풀림)
  //  - 아직 안 걸린 줄: 지금 나를 덮고 있는 줄 밑을 지나가면 걸린다(지나가는 길의 다른 줄은 상관없음)
  //  - 다른 줄을 옮겨서는 걸림이 바뀌지 않는다
  function twistDelta(holes, ropes, ri, end, hole, m, tw) {
    const r = ropes[ri], h1 = r[end], out = [], cm = m || crossMatrix(holes, ropes);
    for (let j = 0; j < ropes.length; j++) {
      if (j === ri) continue;
      const s = ropes[j], w0 = twOf(tw, r.id, s.id);
      // 새로 꼬이는 줄은 지금 나를 덮고 있는 줄(내 위에서 나와 엇갈린 줄)뿐 — 길에 있는 다른 줄은 꼬이지 않는다
      if (!w0 && !covers(ropes, cm, ri, j)) continue;
      if (!passes(holes, r, end, h1, hole, s)) continue;
      // 방향: 위 줄의 어느 쪽에서 어느 쪽으로 건너갔나(반대로 건너가면 풀림)
      const raw = w0 + sigma(holes, s, h1, hole), w1 = Math.max(-TW_MAX, Math.min(TW_MAX, raw));
      if (w1 !== w0) out.push({ id: s.id, w0, w1 });
      else out.push({ id: s.id, w0, w1, over: true });
    }
    return out;
  }
  // 줄 i 와 얽힌 줄(안내용): 위에서 덮고 있거나 i 가 걸려 있는 줄
  function entangled(holes, ropes, i, m, tw) {
    m = m || crossMatrix(holes, ropes);
    const out = [], id = ropes[i].id;
    for (let j = 0; j < ropes.length; j++) if (j !== i && (covers(ropes, m, i, j) || twOf(tw, id, ropes[j].id))) out.push(j);
    return out;
  }
  const isClean = delta => delta.every(d => !d.over && Math.abs(d.w1) <= Math.abs(d.w0));
  // 한 수 적용. holes 를 주면 { ropes, tw } — 옮긴 줄은 맨 위로 가되, 옮긴 뒤에도 엇갈리거나 걸려 있는 위 줄보다는 아래에 남는다.
  // holes 없이 부르면 옛 방식(맨 위로) 배열만 돌려준다.
  function applyMove(ropes, ri, end, hole, holes, tw) {
    const next = ropes.map(r => ({ ...r })), before0 = ropes[ri];
    if (!holes) { const [r] = next.splice(ri, 1); r[end] = hole; next.push(r); return next; }
    const ntw = { ...(tw || {}) }, rid = ropes[ri].id, passed = new Set(), cm = crossMatrix(holes, ropes);
    for (const d of twistDelta(holes, ropes, ri, end, hole, cm, tw)) { passed.add(d.id); const k = pairKey(rid, d.id); if (d.w1) ntw[k] = d.w1; else delete ntw[k]; }
    const covered = !movable(holes, ropes, ri, cm), h1 = ropes[ri][end];
    const [r] = next.splice(ri, 1);
    r[end] = hole;
    if (!covered && !passed.size) {
      // 옛 규칙: 맨 위 줄을 들어 옮기면 맨 위로. 이 줄이 다른 줄 위로 넘어왔던 기록(ov)은 지운다
      delete r.ov; next.push(r);
      for (const q of next) if (q.ov) { q.ov = q.ov.filter(id => id !== rid); if (!q.ov.length) delete q.ov; }
      return { ropes: next, tw: ntw };
    }
    // 덮인 줄 · 꼬이거나 풀리는 수: 쌓인 높이는 그대로(그래서 같은 길로 되돌리면 처음과 같다).
    // 핀이 꼬임 없이 넘어간 줄은 이제 내가 그 위에 놓였다(ov), 다시 넘어오면 지운다.
    const ov = new Set((r.ov || []));
    for (const q of next) {
      if (q.id === rid || passed.has(q.id)) continue;
      if (passes(holes, before0, end, h1, hole, q)) { if (ov.has(q.id)) ov.delete(q.id); else if (ropes.indexOf(ropes.find(x => x.id === q.id)) > ri) ov.add(q.id); }
    }
    for (const id of [...ov]) { const q = next.find(x => x.id === id); if (!q || !crosses(holes, r, q)) ov.delete(id); }
    if (ov.size) r.ov = [...ov].sort((x, y) => x - y); else delete r.ov;
    next.splice(ri, 0, r);
    return { ropes: next, tw: ntw };
  }
  function settle(holes, ropes, tw) {
    return freed(holes, ropes).length === ropes.length && !twCount(tw)
      ? { ropes: [], gone: ropes }
      : { ropes, gone: [] };
  }
  const keyOf = (ropes, tw) => ropes.map(r => (r.a < r.b ? r.a + '-' + r.b : r.b + '-' + r.a) + (r.ov ? '^' + r.ov.join('.') : '')).join('|') + (twCount(tw) ? '#' + Object.keys(tw).filter(k => tw[k]).sort().map(k => k + ':' + tw[k]).join(',') : '');

  // 둘 수 있는 수. opts.all 이면 꼬임을 늘리는 수까지, 아니면 깔끔한 수만. 각 수에 delta(꼬임 변화)를 붙인다.
  function moves(holes, ropes, m = crossMatrix(holes, ropes), tw, opts) {
    const out = [], occ = occupied(ropes), all = opts && opts.all;
    const empties = [];
    for (let h = 0; h < holes.length; h++) if (!occ.has(h)) empties.push(h);
    for (let i = 0; i < ropes.length; i++) {
      // 위에서 덮인 줄은 깔끔하게 옮길 수 없다(옛 규칙) — 모든 수(all)일 때만
      const covered = !movable(holes, ropes, i, m);
      if (covered && !all && !Object.keys(tw || {}).some(k => tw[k] && k.startsWith(ropes[i].id + '-'))) continue;
      for (const end of ['a', 'b']) for (const h of empties) {
        const delta = twistDelta(holes, ropes, i, end, h, m, tw);
        if (all || (isClean(delta) && !covered) || (covered && delta.length && delta.every(d => Math.abs(d.w1) < Math.abs(d.w0)))) out.push({ rope: i, end, to: h, delta });
      }
    }
    return out;
  }

  // 엇갈리거나 감긴 쌍 하나마다 둘 중 하나는 최소 한 번 옮겨야 한다(겹치지 않는 쌍 수 = 하한).
  function moveLowerBound(matrix, ropes, tw) {
    const matched = new Set(), n = matrix.length;
    const bad = (i, j) => matrix[i][j] || (tw && ropes && twAny(tw, ropes[i].id, ropes[j].id));
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

  // 힌트 한 수: ① 꼬임을 늘리지 않는 최소 풀이의 첫 수 ② 걸림을 만든 최근 수를 거꾸로(history: [{id,end,from,to}])
  // ③ 걸림 합을 가장 줄이는 수. 없으면 null(되돌리기 · 다시 하기 안내).
  function suggest(holes, ropes, tw, history, opts) {
    const n = twCount(tw);
    const path = solve(holes, ropes, { tw, nodes: (opts && opts.nodes) || (n ? 60000 : 150000), depth: 14 });
    if (path && path.length) return { ...path[0], how: 'solve' };
    if (!n) {
      const deep = solve(holes, ropes, { tw, nodes: 900000, depth: 12 });
      return deep && deep.length ? { ...deep[0], how: 'solve' } : null;
    }
    const occ = occupied(ropes), idx = id => ropes.findIndex(r => r.id === id);
    const after = m => twCount(applyMove(ropes, idx(m.id), m.end, m.to, holes, tw).tw);
    for (let k = (history || []).length - 1; k >= 0; k--) {
      const h = history[k]; if (!h) continue;
      const i = idx(h.id); if (i < 0 || occ.has(h.from) || ropes[i][h.end] !== h.to) continue;
      const m = { id: h.id, end: h.end, to: h.from }; if (after(m) < n) return { ...m, how: 'reverse' };
    }
    let best = n, mv = null;
    for (const m of moves(holes, ropes, undefined, tw, { all: true })) {
      if (!m.delta.length) continue;
      const c = { id: ropes[m.rope].id, end: m.end, to: m.to }, v = after(c); if (v < best) { best = v; mv = c; }
    }
    if (mv) return { ...mv, how: 'greedy' };
    // ④ 두 수 앞: 먼저 둔 한 수 뒤에 걸림을 줄이는 수가 생기면 그 첫 수(막힌 구멍 비우기)
    for (const m1 of moves(holes, ropes, undefined, tw, { all: true })) {
      if (m1.delta.some(d => Math.abs(d.w1) > Math.abs(d.w0) || d.over)) continue;
      const nx = applyMove(ropes, m1.rope, m1.end, m1.to, holes, tw);
      for (const m2 of moves(holes, nx.ropes, undefined, nx.tw, { all: true })) {
        if (!m2.delta.length) continue;
        if (twCount(applyMove(nx.ropes, m2.rope, m2.end, m2.to, holes, nx.tw).tw) < n) return { id: ropes[m1.rope].id, end: m1.end, to: m1.to, how: 'clear' };
      }
    }
    return null; // 되돌리기 안내
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
      return { ...p, ropes: nx.ropes.map(r => (r.ov ? { a: r.a, b: r.b, id: r.id, ov: r.ov } : { a: r.a, b: r.b, id: r.id })), tw: nx.tw, target: sol.length, solution: sol };
    }
    return null;
  }

  return { rng, layout, crosses, crossMatrix, movable, coveredBy, freed, occupied, applyMove, settle, moves, solve, generate, twist, keyOf, NEAR, pairKey, twOf, twCount, twPairs, sigma, entangled, twistDelta, isClean, TW_MAX, twAny, passes, suggest };
});
