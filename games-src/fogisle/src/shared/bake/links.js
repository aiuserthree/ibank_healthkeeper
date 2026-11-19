// 주는 것: 걷기 격자 위의 것들 — linkSteps(자동 고리 · function*) · groupSteps(닿는 무리 번호를 nav.group 에 · function*) · markDoors(문 밑의 칸에 문 번호를 nav.door 에) ·
//   coverSteps(엄폐 점 · function*).
// 받는 것: nav · solid(nav.js) · bvh(엄폐 광선) · tune/bake(link · cover). 적도 플레이어도 같은 고리를 쓴다.
// 자동 고리: 이웃이 없는 쪽(가장자리)으로 reach 안을 훑어, 사이에 몸을 막는 높은 것이 없을 때
//   넘기 vault(0) = 높이 vaultLo ~ vaultHi 의 턱 너머 같은 높이의 칸으로 · 오르기 climb(1) = climb 보다 높고 climbHi 이하인 턱 위로 · 떨어지기 drop(2) = drop 이하의 아래로.
//   층이 여럿인 칸에서는 「몸이 실제로 닿는 층」만 고른다: 떨어지기는 내려설 칸의 머리 위가 떠나는 높이의 몸(머리)까지 비어 있어야 한다 — 그 사이에 다른 덩이(선반 · 다리 ·
//   못 걷는 바위)가 있으면 그 밑의 바닥으로는 못 간다(바닥을 뚫는 고리가 없다 = 발밑에서 처음 닿는 바닥으로만). 오르기는 떠나는 칸의 머리 위가 올라설 높이의 몸까지 비어 있어야 한다.
//   links = { from · to(Uint32: 걷는 칸) · kind(Uint8) · rise(Int16: 높이 단위 — 넘기는 턱의 높이, 오르기 · 떨어지기는 두 칸의 높이 차) }
// 닿는 무리: 걸어서 이어진 덩어리를, 서로 오갈 수 있는 고리(넘기 · 오르기 — 오른 턱은 뛰어내릴 수 있다)로 합친 번호. 떨어지기만 있는 쪽은 합치지 않는다(돌아올 수 없다).
//   번호는 걷는 칸의 차례대로 0 부터 — 길 없는 요청을 0 비용으로 거른다.
// 엄폐 점: 가장자리 칸에서 장애물 쪽으로 높이 low · mid · high 의 광선을 쏜다 — 가운데와 옆으로 ±side 비킨 자리 셋에서(몸 폭까지 가려져야 엄폐다: 가는 말뚝 · 기둥 · 덩이의
//   모서리는 엄폐가 아니다). low 와 mid 가 셋 다 막힌 쪽 = 낮은 엄폐, high 까지 셋 다 막힌 쪽 = 높은 엄폐. gap 마다 하나씩 뽑는다.
//   cover = { n · pos(Float32 ×3: 바닥) · span(Uint32: 걷는 칸) · group(Uint32: 그 칸의 닿는 무리 — 시작 자리의 무리가 아닌 점(못 가는 고원 · 바위 위)을 가를 때) ·
//             low · high(Uint8: 쪽마다 한 비트 — 1 = +x · 2 = +z · 4 = −x · 8 = −z) } — 열린 쪽은 두 비트가 다 0 인 쪽이다.
//   (높은 엄폐의 「옆으로 내다보는 자리」는 F7a 가 이 비트에서 고른다.)
// 쉬는 자리는 훑은 걷는 칸 수로 정한다(주 스레드 길의 한 조각이 길지 않게 — 결과와는 무관하다).
import { dsin, dcos } from '../dmath.js';
import { rayAny } from './bvh.js';
import { DX, DZ, spanPos } from './nav.js';
import { BAKE } from '../tune/bake.js';

export function* linkSteps(nav, solid) {
  const L = BAKE.link, ich = 1 / nav.unit, W = nav.w, D = nav.d, tall = Math.ceil(BAKE.nav.height * ich - 1e-4), step = Math.floor(BAKE.nav.climb * ich + 1e-4);
  const vLo = Math.round(L.vaultLo * ich), vHi = Math.round(L.vaultHi * ich), up = Math.round(L.climbHi * ich), down = Math.round(L.drop * ich), far = Math.round(L.reach / nav.cell) + 2;
  const from = [], to = [], kind = [], rise = [];
  for (let s = 0; s < nav.y.length; s++) {
    if ((s & 8191) === 8191) yield;
    const col = nav.col[s], i = col % W, j = (col - i) / W, y = nav.y[s];
    for (let d = 0; d < 4; d++) {
      if (nav.nb[s * 4 + d] >= 0) continue;
      // peak = 지나온 칸들에서 몸 높이에 걸리는 덩이의 가장 높은 윗면
      let peak = 0;
      for (let k = 1; k <= far; k++) {
        const i2 = i + DX[d] * k, j2 = j + DZ[d] * k;
        if (i2 < 0 || j2 < 0 || i2 >= W || j2 >= D) break;
        const c2 = j2 * W + i2;
        let made = -1, dy = 0;
        for (let s2 = nav.start[c2]; s2 < nav.start[c2 + 1] && made < 0; s2++) {
          const y2 = nav.y[s2], clear = peak <= Math.max(y, y2) + step;
          dy = y2 - y;
          if (clear && dy > step && dy <= up && nav.ceil[s] >= y2 + tall) made = 1;
          else if (clear && dy < -step && dy >= -down && nav.ceil[s2] >= y + tall) made = 2;
          else if (!clear && k >= 2 && Math.abs(dy) <= step && peak - y >= vLo && peak - y <= vHi) { made = 0; dy = peak - y; }
          if (made >= 0) { from.push(s); to.push(s2); kind.push(made); rise.push(dy); }
        }
        if (made >= 0) break;
        for (let q = solid.start[c2]; q < solid.start[c2 + 1]; q++) if (solid.lo[q] < y + tall && solid.hi[q] > peak) peak = solid.hi[q];
        if (peak > y + up) break;
      }
    }
  }
  return { from: Uint32Array.from(from), to: Uint32Array.from(to), kind: Uint8Array.from(kind), rise: Int16Array.from(rise) };
}

// 닿는 무리의 번호를 nav.group 에 적고 무리의 수를 돌려준다(훑은 칸 65536 개마다 쉰다)
export function* groupSteps(nav, links) {
  const ns = nav.y.length, comp = new Int32Array(ns).fill(-1), stack = [];
  let count = 0, work = 0;
  for (let s = 0; s < ns; s++) {
    if (comp[s] >= 0) continue;
    comp[s] = count; stack.push(s);
    while (stack.length) {
      const u = stack.pop();
      for (let d = 0; d < 4; d++) { const v = nav.nb[u * 4 + d]; if (v >= 0 && comp[v] < 0) { comp[v] = count; stack.push(v); } }
      if (++work === 65536) { work = 0; yield; }
    }
    count++;
  }
  yield;
  const root = new Int32Array(count), find = (x) => { while (root[x] !== x) { root[x] = root[root[x]]; x = root[x]; } return x; };
  for (let k = 0; k < count; k++) root[k] = k;
  for (let k = 0; k < links.kind.length; k++) {
    if (links.kind[k] === 2) continue;
    const a = find(comp[links.from[k]]), b = find(comp[links.to[k]]);
    if (a !== b) root[Math.max(a, b)] = Math.min(a, b);
  }
  const name = new Int32Array(count).fill(-1);
  let groups = 0;
  for (let s = 0; s < ns; s++) { const r = find(comp[s]); if (name[r] < 0) name[r] = groups++; nav.group[s] = name[r]; }
  return groups;
}

// 문 표식 밑의 걷는 칸에 문 번호(1 부터)를 적는다 — 문이 닫히면 길에서 빠질 칸이다. 문의 요 = 지나는 쪽, 폭은 그것에 수직. 문 둘레의 칸만 훑는다.
export function markDoors(nav, doors) {
  const p = [0, 0, 0];
  doors.forEach((door, k) => {
    const fx = dsin(door.yaw), fz = dcos(door.yaw), r = door.width / 2 + nav.cell * 2;
    const i0 = Math.max(0, Math.floor((door.at[0] - r - nav.x0) / nav.cell)), i1 = Math.min(nav.w - 1, Math.floor((door.at[0] + r - nav.x0) / nav.cell));
    const j0 = Math.max(0, Math.floor((door.at[2] - r - nav.z0) / nav.cell)), j1 = Math.min(nav.d - 1, Math.floor((door.at[2] + r - nav.z0) / nav.cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) for (let s = nav.start[j * nav.w + i]; s < nav.start[j * nav.w + i + 1]; s++) {
      spanPos(nav, s, p);
      const dx = p[0] - door.at[0], dz = p[2] - door.at[2];
      if (Math.abs(dx * fx + dz * fz) <= nav.cell && Math.abs(dx * fz - dz * fx) <= door.width / 2 && Math.abs(p[1] - door.at[1]) <= BAKE.nav.height) nav.door[s] = k + 1;
    }
  });
}

export function* coverSteps(nav, bvh) {
  const C = BAKE.cover, p = [0, 0, 0], cell = new Map(), pos = [], span = [], low = [], high = [], gap2 = C.gap * C.gap;
  // d 쪽으로 높이 h 의 광선 셋(가운데 · 옆으로 ±side)이 다 막혔는가
  const blocked = (d, h) => {
    for (let o = -1; o <= 1; o++) if (!rayAny(bvh, p[0] + DZ[d] * C.side * o, p[1] + h, p[2] - DX[d] * C.side * o, DX[d], 0, DZ[d], C.reach)) return false;
    return true;
  };
  for (let s = 0; s < nav.y.length; s++) {
    if ((s & 8191) === 8191) yield;
    let edge = false;
    for (let d = 0; d < 4; d++) if (nav.nb[s * 4 + d] < 0) edge = true;
    if (!edge) continue;
    spanPos(nav, s, p);
    // gap 안에 이미 뽑은 점이 있으면 건너뛴다(gap 크기의 칸으로 둘레 아홉 칸만 본다) — 광선보다 먼저 본다(값싸다 · 뽑히는 점은 같다)
    const gi = Math.floor(p[0] / C.gap), gj = Math.floor(p[2] / C.gap);
    let taken = false;
    for (let a = -1; a <= 1 && !taken; a++) for (let b = -1; b <= 1 && !taken; b++) {
      for (const k of cell.get((gi + a) + ',' + (gj + b)) || []) {
        const dx = pos[k * 3] - p[0], dy = pos[k * 3 + 1] - p[1], dz = pos[k * 3 + 2] - p[2];
        if (dx * dx + dz * dz < gap2 && Math.abs(dy) < BAKE.nav.height) taken = true;
      }
    }
    if (taken) continue;
    let lo = 0, hi = 0;
    for (let d = 0; d < 4; d++) {
      if (nav.nb[s * 4 + d] >= 0) continue;
      if (blocked(d, C.low) && blocked(d, C.mid)) { lo |= 1 << d; if (blocked(d, C.high)) hi |= 1 << d; }
    }
    if (!lo) continue;
    const key = gi + ',' + gj;
    if (!cell.has(key)) cell.set(key, []);
    cell.get(key).push(span.length);
    pos.push(p[0], p[1], p[2]); span.push(s); low.push(lo); high.push(hi);
  }
  return { n: span.length, pos: Float32Array.from(pos), span: Uint32Array.from(span), group: Uint32Array.from(span, (s) => nav.group[s]), low: Uint8Array.from(low), high: Uint8Array.from(high) };
}
