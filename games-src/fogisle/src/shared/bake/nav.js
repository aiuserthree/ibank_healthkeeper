// 주는 것: 걷기 격자 — navSteps(세계 → { nav, solid }. 조각내 돌릴 수 있는 function*) · spanAt(자리 → 가장 가까운 걷기 칸) · spanPos(칸 → 자리) · DX · DZ(네 이웃의 방향).
// 받는 것: world.collide(그림에서 나온 충돌 삼각형 — 가로로 민 뒤의 땅이다. world.grid 는 밀기 전이라 쓰지 않는다) · bvh(덩이 속인지 볼 때의 수직선) · dmath · tune/bake.nav.
// 만드는 법(Recast 의 생각을 줄인 것): ① 삼각형마다 그것이 걸치는 칸(cell 0.25m)에 「덩이 조각」[아래, 위](높이 단위 unit 0.05m)을 넣는다 — 걸치는 칸은 빠짐없이
//   (삼각형의 세 변을 칸의 반 대각선만큼 넓혀 본다 — 칸의 금에 꼭 걸친 면은 넣지 않는다: 금 위에 선 벽의 면이 열린 쪽 칸까지 막지 않게), 높이는 그 칸 위에서 삼각형의 면이 지나는 범위 ② 칸마다 조각을 아래부터 모아 맞닿은 것끼리 합친다. 합친 덩이의
//   윗면이 걸을 수 있는가는 더 높은 쪽 조각을 따르되, **챌판 규칙**: 높은 쪽이 못 걷는 면이어도 낮은 걷는 면과의 차가 climb 이하면 걷는 면이다(계단 · 낮은 돌)
//   ③ 걷는 칸 = 윗면이 걷는 면(경사 ≤ slope)이고 · 머리 위 height 만큼 비었고 · 닫힌 덩이의 속이 아니고(큰 바위 속의 땅 · 벽 속의 바닥 — 칸 가운데의 수직선에서
//   그 위로 「위를 보는 면」이 「아래를 보는 면」보다 많으면 속이다: 열린 곳에서는 머리 위의 것마다 밑면과 윗면이 짝을 이룬다) · 걸어 들어갈 수 없게 깊은
//   물속(해수면 − wade 아래)이 아닌 것 ④ 네 이웃(높이 차 ≤ climb)을 잇고 ⑤ 둘레 여덟 칸 가운데 하나라도 없는 칸을
//   erode 번 깎는다(벽 · 턱 · 물가에서 한 칸 물러난다 — 남은 칸의 가운데에서 장애물까지 0.375m 가 지켜져 반지름 0.3m 의 몸이 선다. 폭 1.0m 문에는 두 칸이 남는다).
//   층이 여럿이면 한 칸에 걷는 칸이 여럿이다(다리 밑 · 지붕 위).
// nav(형식 배열만): cell · unit · w · d(칸 수) · x0 · y0 · z0(격자의 원점 — 걷는 칸의 높이 = y0 + y[s] × unit) ·
//   start(Uint32, 칸 수 + 1: 칸 c = 세로 칸 × w + 가로 칸 의 걷는 칸은 [start[c], start[c + 1]) — 아래부터) · y(Uint16: 바닥) · ceil(Uint16: 머리 위 덩이의 아래 — 없으면 65535) ·
//   col(Uint32: 걷는 칸 → 칸 번호) · nb(Int32 ×4: +x · +z · −x · −z 이웃, 없으면 −1) · group · door 는 links.js 가 채운다.
// solid = 칸마다의 덩이(자동 고리가 읽는다 — 구운 결과에는 싣지 않는다): start · lo · hi · fl(1 = 윗면이 걷는 면).
import { PI, dcos } from '../dmath.js';
import { column } from './bvh.js';
import { BAKE } from '../tune/bake.js';

export const DX = Object.freeze([1, 0, -1, 0]);
export const DZ = Object.freeze([0, 1, 0, -1]);
const NONE = 65535, SNAP = 1e-4;

// 삼각형을 칸에 넣는다 → 칸마다의 조각을 잇는 줄(head · next)과 조각의 [lo, hi, fl]
function* raster(world, G) {
  const { cs, ich, W, D, x0, y0, z0 } = G, P = world.collide.pos, I = world.collide.idx, half = cs / 2, cosWalk = dcos(BAKE.nav.slope * PI / 180);
  const head = new Int32Array(W * D).fill(-1);
  let cap = 1 << 18, lo = new Uint16Array(cap), hi = new Uint16Array(cap), fl = new Uint8Array(cap), next = new Int32Array(cap), n = 0, work = 0;
  for (let t = 0; t < I.length; t += 3) {
    if (++work === 4096) { work = 0; yield; }
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3, ax = P[a], ay = P[a + 1], az = P[a + 2], bx = P[b], by = P[b + 1], bz = P[b + 2], cx = P[c], cy = P[c + 1], cz = P[c + 2];
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az, nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (!(len > 0)) continue;
    const flag = ny / len >= cosWalk ? 1 : 0, tMin = Math.min(ay, by, cy), tMax = Math.max(ay, by, cy), flat = Math.abs(ny) > 1e-4 * len;
    const gx = flat ? -nx / ny : 0, gz = flat ? -nz / ny : 0, ext = (Math.abs(gx) + Math.abs(gz)) * half;
    // 테두리 상자가 걸치는 칸: 큰 쪽 끝이 칸의 금에 꼭 걸치면 그 너머 칸은 넣지 않는다(금 위에서 끝나는 벽이 문 쪽 칸으로 새지 않게 — 금 위에 선 면은 어느 칸에도 안 든다)
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - x0) / cs)), i1 = Math.min(W - 1, Math.ceil((Math.max(ax, bx, cx) - x0) / cs) - 1);
    const j0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - z0) / cs)), j1 = Math.min(D - 1, Math.ceil((Math.max(az, bz, cz) - z0) / cs) - 1);
    // 변 함수 e(x, z) = ka·x + kb·z + kc(안쪽이 양수). 넓이가 없는 삼각형(수직 벽)은 가장 긴 변의 선에서 반 대각선 안에 든 칸.
    const area = ux * vz - uz * vx, s = area > 0 ? 1 : -1, thin = Math.abs(area) < 1e-10;
    let k1a = -s * (bz - az), k1b = s * (bx - ax), k2a = -s * (cz - bz), k2b = s * (cx - bx), k3a = -s * (az - cz), k3b = s * (ax - cx), p1x = ax, p1z = az;
    if (thin) {
      const l1 = ux * ux + uz * uz, l2 = (cx - bx) * (cx - bx) + (cz - bz) * (cz - bz), l3 = vx * vx + vz * vz;
      if (l2 >= l1 && l2 >= l3) { k1a = k2a; k1b = k2b; p1x = bx; p1z = bz; } else if (l3 >= l1) { k1a = k3a; k1b = k3b; p1x = cx; p1z = cz; }
    }
    const m1 = (Math.abs(k1a) + Math.abs(k1b)) * half, m2 = (Math.abs(k2a) + Math.abs(k2b)) * half, m3 = (Math.abs(k3a) + Math.abs(k3b)) * half;
    for (let j = j0; j <= j1; j++) {
      const zc = z0 + j * cs + half;
      for (let i = i0; i <= i1; i++) {
        const xc = x0 + i * cs + half, e1 = k1a * (xc - p1x) + k1b * (zc - p1z);
        if (thin) { if (Math.abs(e1) >= m1) continue; }
        else if (e1 + m1 <= 0 || k2a * (xc - bx) + k2b * (zc - bz) + m2 <= 0 || k3a * (xc - cx) + k3b * (zc - cz) + m3 <= 0) continue;
        const yc = ay + gx * (xc - ax) + gz * (zc - az), ylo = flat ? Math.min(tMax, Math.max(tMin, yc - ext)) : tMin, yhi = flat ? Math.min(tMax, Math.max(tMin, yc + ext)) : tMax;
        const slo = Math.max(0, Math.floor((ylo - y0) * ich + SNAP)), shi = Math.max(slo + 1, Math.ceil((yhi - y0) * ich - SNAP));
        if (n === cap) {
          cap *= 2;
          const l = new Uint16Array(cap), h = new Uint16Array(cap), f = new Uint8Array(cap), x = new Int32Array(cap);
          l.set(lo); h.set(hi); f.set(fl); x.set(next); lo = l; hi = h; fl = f; next = x;
        }
        const col = j * W + i;
        lo[n] = slo; hi[n] = Math.min(NONE - 1, shi); fl[n] = flag; next[n] = head[col]; head[col] = n++;
      }
    }
  }
  return { head, lo, hi, fl, next, n };
}

// 칸마다 조각을 아래부터 모아 합친다 → 덩이(solid)
function* merge(R, G) {
  const { W, D } = G, climb = G.climb, start = new Uint32Array(W * D + 1), lo = new Uint16Array(R.n), hi = new Uint16Array(R.n), fl = new Uint8Array(R.n), list = [];
  let n = 0;
  for (let col = 0; col < W * D; col++) {
    if ((col & 65535) === 65535) yield;
    start[col] = n;
    if (R.head[col] < 0) continue;
    list.length = 0;
    for (let k = R.head[col]; k >= 0; k = R.next[k]) list.push(k);
    // 아래 → 위 → 표시 차례(같은 값의 조각은 어느 것이 먼저여도 결과가 같다)
    for (let i = 1; i < list.length; i++) {
      const k = list[i];
      let j = i - 1;
      while (j >= 0 && (R.lo[list[j]] > R.lo[k] || (R.lo[list[j]] === R.lo[k] && (R.hi[list[j]] > R.hi[k] || (R.hi[list[j]] === R.hi[k] && R.fl[list[j]] > R.fl[k]))))) { list[j + 1] = list[j]; j--; }
      list[j + 1] = k;
    }
    let cl = R.lo[list[0]], chi = R.hi[list[0]], walk = R.fl[list[0]];
    for (let i = 1; i < list.length; i++) {
      const k = list[i], l = R.lo[k], h = R.hi[k], w = R.fl[k];
      if (l > chi) { lo[n] = cl; hi[n] = chi; fl[n++] = walk; cl = l; chi = h; walk = w; continue; }
      if (chi > h + 1) walk = walk || (chi - h <= climb && w) ? 1 : 0;
      else if (h > chi + 1) walk = w || (h - chi <= climb && walk) ? 1 : 0;
      else walk |= w;
      if (h > chi) chi = h;
    }
    lo[n] = cl; hi[n] = chi; fl[n++] = walk;
  }
  start[W * D] = n;
  return { start, lo: lo.slice(0, n), hi: hi.slice(0, n), fl: fl.slice(0, n) };
}

// 칸 가운데 (x, z) 의 수직선에서 높이 y 위로 「위를 보는 면」이 「아래를 보는 면」보다 많은가(= 닫힌 덩이의 속). 같은 높이 · 같은 쪽의 면은 하나로 센다
//   (칸 가운데가 두 삼각형이 같이 쓰는 모서리에 꼭 걸치면 수직선이 둘 다 만난다).
function buried(bvh, x, z, y, H) {
  const n = column(bvh, x, z, H);
  let ups = 0, downs = 0;
  for (let i = 0; i < n; i++) {
    if (H[i * 3] <= y) continue;
    let twin = false;
    for (let j = 0; j < i && !twin; j++) twin = H[j * 3 + 1] === H[i * 3 + 1] && Math.abs(H[j * 3] - H[i * 3]) < 1e-4;
    if (!twin) { if (H[i * 3 + 1]) ups++; else downs++; }
  }
  return ups > downs;
}

export function* navSteps(world, bvh) {
  const N = BAKE.nav, cs = N.cell, ich = 1 / N.unit, P = world.collide.pos, W = Math.ceil(world.size[0] / cs), D = Math.ceil(world.size[1] / cs);
  let minY = Infinity;
  for (let i = 1; i < P.length; i += 3) if (P[i] < minY) minY = P[i];
  const G = { cs, ich, W, D, x0: world.origin[0], y0: Math.floor(minY) - 1, z0: world.origin[1], climb: Math.floor(N.climb * ich + SNAP), tall: Math.ceil(N.height * ich - SNAP) };
  const S = yield* merge(yield* raster(world, G), G), wet = (world.sea - N.wade - G.y0) * ich;
  // 걷는 칸 뽑기
  const first = new Uint32Array(W * D + 1), ys = [], cs2 = [], H = [];
  for (let col = 0; col < W * D; col++) {
    first[col] = ys.length;
    for (let k = S.start[col], e = S.start[col + 1]; k < e; k++) {
      const roof = k + 1 < e ? S.lo[k + 1] : NONE;
      if (!S.fl[k] || S.hi[k] < wet || roof - S.hi[k] < G.tall) continue;
      // 위에 덩이가 또 있는 칸만 덩이 속인지 본다(거의 모든 칸은 위가 비었다)
      if (k + 1 < e && buried(bvh, G.x0 + (col % W + 0.5) * cs, G.z0 + (Math.floor(col / W) + 0.5) * cs, G.y0 + S.hi[k] * N.unit + N.unit / 2, H)) continue;
      ys.push(S.hi[k]); cs2.push(roof);
    }
    if ((col & 65535) === 65535) yield;
  }
  first[W * D] = ys.length;
  yield;
  // 이웃 잇기(높이가 가장 가까운 칸 — 서로를 고른 짝만 남긴다) → 가장자리 깎기 → 죽은 칸을 빼고 다시 적는다
  const ns = ys.length, near = new Int32Array(ns * 4).fill(-1), dead = new Uint8Array(ns);
  for (let col = 0; col < W * D; col++) {
    const i = col % W, j = (col - i) / W;
    for (let s = first[col]; s < first[col + 1]; s++) for (let d = 0; d < 4; d++) {
      const i2 = i + DX[d], j2 = j + DZ[d];
      if (i2 < 0 || j2 < 0 || i2 >= W || j2 >= D) continue;
      let gap = G.climb + 1;
      for (let s2 = first[j2 * W + i2], e = first[j2 * W + i2 + 1]; s2 < e; s2++) {
        const dy = Math.abs(ys[s2] - ys[s]);
        if (dy < gap && Math.min(cs2[s], cs2[s2]) - Math.max(ys[s], ys[s2]) >= G.tall) { gap = dy; near[s * 4 + d] = s2; }
      }
    }
    if ((col & 65535) === 65535) yield;
  }
  for (let k = 0; k < ns * 4; k++) if (near[k] >= 0 && near[near[k] * 4 + ((k & 3) ^ 2)] !== (k >> 2)) near[k] = -2;
  for (let round = 0; round < N.erode; round++) {
    const kill = [];
    for (let s = 0; s < ns; s++) {
      if (dead[s]) continue;
      let whole = true;
      // 네 이웃과 네 모서리 이웃(이웃의 다음 쪽 이웃)이 다 있어야 남는다 — 모서리까지 봐야 칸 가운데에서 장애물까지 한 칸 반이 지켜진다
      for (let d = 0; d < 4 && whole; d++) whole = near[s * 4 + d] >= 0 && near[near[s * 4 + d] * 4 + ((d + 1) & 3)] >= 0;
      if (!whole) kill.push(s);
    }
    for (const s of kill) dead[s] = 1;
    for (let k = 0; k < ns * 4; k++) if (near[k] >= 0 && dead[near[k]]) near[k] = -1;
  }
  const to = new Int32Array(ns).fill(-1), start = new Uint32Array(W * D + 1);
  let live = 0;
  for (let col = 0; col < W * D; col++) { start[col] = live; for (let s = first[col]; s < first[col + 1]; s++) if (!dead[s]) to[s] = live++; }
  start[W * D] = live;
  const y = new Uint16Array(live), ceil = new Uint16Array(live), colOf = new Uint32Array(live), nb = new Int32Array(live * 4).fill(-1);
  for (let col = 0; col < W * D; col++) for (let s = first[col]; s < first[col + 1]; s++) {
    const k = to[s];
    if (k < 0) continue;
    y[k] = ys[s]; ceil[k] = cs2[s]; colOf[k] = col;
    for (let d = 0; d < 4; d++) nb[k * 4 + d] = near[s * 4 + d] >= 0 ? to[near[s * 4 + d]] : -1;
  }
  const nav = { cell: cs, unit: N.unit, w: W, d: D, x0: G.x0, y0: G.y0, z0: G.z0, start, y, ceil, col: colOf, nb, group: new Uint32Array(live), door: new Uint8Array(live) };
  return { nav, solid: S };
}

// 걷는 칸 s 의 가운데 자리 → out[0 · 1 · 2](x · 바닥 높이 · z)
export function spanPos(nav, s, out) {
  const col = nav.col[s], i = col % nav.w;
  out[0] = nav.x0 + (i + 0.5) * nav.cell; out[1] = nav.y0 + nav.y[s] * nav.unit; out[2] = nav.z0 + ((col - i) / nav.w + 0.5) * nav.cell;
  return out;
}

// (x, y, z) 에 가장 가까운 걷는 칸(둘레 reach m 안 · 높이 차 rise m 안 — 없으면 −1). 가로로 가까운 칸이 먼저고, 같은 거리면 높이가 가까운 칸.
export function spanAt(nav, x, y, z, reach, rise) {
  const ci = Math.floor((x - nav.x0) / nav.cell), cj = Math.floor((z - nav.z0) / nav.cell), r = Math.ceil(reach / nav.cell), yu = (y - nav.y0) / nav.unit, top = rise / nav.unit;
  let best = -1, cost = Infinity;
  for (let j = Math.max(0, cj - r); j <= Math.min(nav.d - 1, cj + r); j++) for (let i = Math.max(0, ci - r); i <= Math.min(nav.w - 1, ci + r); i++) {
    const dx = nav.x0 + (i + 0.5) * nav.cell - x, dz = nav.z0 + (j + 0.5) * nav.cell - z, far = dx * dx + dz * dz;
    if (far > (reach + nav.cell) * (reach + nav.cell)) continue;
    for (let s = nav.start[j * nav.w + i], e = nav.start[j * nav.w + i + 1]; s < e; s++) {
      const dy = Math.abs(nav.y[s] - yu), c = far * 1e6 + dy;
      if (dy <= top && c < cost) { cost = c; best = s; }
    }
  }
  return best;
}
