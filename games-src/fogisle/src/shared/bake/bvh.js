// 주는 것: 삼각형 BVH — bvhSteps(pos, idx → BVH. 조각내 돌릴 수 있는 function*) + 질의: rayAny(가리는 것이 있는가) · rayHit(가장 가까운 맞은 곳) ·
//   column((x, z) 수직선이 만나는 면 전부) · sphereAny(공에 닿는 삼각형이 있는가) · pillarAny(세로 기둥에 닿는 삼각형이 있는가 — 가로 거리).
//   광선(탄 · 시야 · 빛) · 지면 붙기 · 캡슐 끼임 · 걷기 격자의 가장자리 깎기가 다 이것을 쓴다. 삼각형이 하나도 없는 BVH 에서는 질의가 「없다」로 바로 돌아간다.
// 받는 것: tune/bake(잎 크기 · 한 번에 훑는 삼각형 수). 사칙 연산과 Math.sqrt 뿐이라 Node · 크롬 · 워커가 같은 비트를 낸다.
// BVH(형식 배열만 — 워커에서 넘겨받고 해시한다):
//   nodes  Float32 ×6: 마디의 상자 [x0, y0, z0, x1, y1, z1]. 마디 0 이 뿌리, 왼쪽 자식은 늘 「제 번호 + 1」이다.
//   meta   Int32 ×2: 잎이면 [첫 삼각형 칸, 삼각형 수(> 0)] · 가지면 [오른쪽 자식의 번호, 0]
//   tri    Float32 ×9: 삼각형의 세 꼭짓점 — 잎의 차례대로 다시 적은 것(질의가 번호를 거치지 않는다)
//   order  Uint32: 칸 → 원래 삼각형 번호(world.collide 의 surf · owner 를 읽을 때) · count = 마디 수
// 나누기: 삼각형 가운데들이 가장 길게 퍼진 축을 12칸으로 나눠 「겉넓이 × 삼각형 수」가 가장 작은 금에서(못 가르면 가운데의 중앙값 — 동률은 삼각형 번호로 깬다).
//   어디서 돌려도 같은 나무가 나온다.
// 질의의 쌓는 통(STACK)과 자른 다각형을 두는 통(CLIP)은 부를 때마다 처음부터 다시 쓴다 — 부름 사이에 남는 뜻이 없다. 나무의 깊이는 DEEP + log₂(삼각형 수)를 넘지 않는다
//   (깊이 DEEP 부터는 늘 중앙값으로 반씩 가른다 — 한쪽으로 쏠린 금이 이어져도 통이 넘치지 않는다).
import { BAKE } from '../tune/bake.js';

const STACK = new Int32Array(256), CLIP = new Float64Array(36), BINS = 12, DEEP = 40;
// 광선이 삼각형의 면과 나란한지 보는 틈 · 맞은 곳이 출발점에 붙었는지 보는 거리
const FLAT = 1e-12, NEAR = 1e-4;

// order[s, e) 를 m 번째가 제자리에 오도록 가른다(가운데 key = cen[번호 × 3 + axis], 동률은 번호)
function select(order, cen, axis, s, e, m) {
  let lo = s, hi = e - 1;
  while (lo < hi) {
    const p = order[(lo + hi) >> 1], pk = cen[p * 3 + axis];
    let i = lo, j = hi;
    while (i <= j) {
      while (cen[order[i] * 3 + axis] < pk || (cen[order[i] * 3 + axis] === pk && order[i] < p)) i++;
      while (cen[order[j] * 3 + axis] > pk || (cen[order[j] * 3 + axis] === pk && order[j] > p)) j--;
      if (i <= j) { const t = order[i]; order[i] = order[j]; order[j] = t; i++; j--; }
    }
    if (m <= j) hi = j; else if (m >= i) lo = i; else return;
  }
}

export function* bvhSteps(pos, idx) {
  const nt = idx.length / 3, leaf = BAKE.bvh.leaf, chunk = BAKE.bvh.chunk, order = new Uint32Array(nt), box = new Float32Array(nt * 6), cen = new Float32Array(nt * 3);
  for (let t = 0; t < nt; t++) {
    if (t % chunk === chunk - 1) yield;
    const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3;
    order[t] = t;
    for (let k = 0; k < 3; k++) {
      const lo = Math.min(pos[a + k], pos[b + k], pos[c + k]), hi = Math.max(pos[a + k], pos[b + k], pos[c + k]);
      box[t * 6 + k] = lo; box[t * 6 + 3 + k] = hi; cen[t * 3 + k] = (lo + hi) / 2;
    }
  }
  const cap = Math.max(1, 2 * nt), nodes = new Float32Array(cap * 6), meta = new Int32Array(cap * 2), todo = [0, nt, -1, 0];
  const binN = new Int32Array(BINS), binB = new Float64Array(BINS * 6), right = new Float64Array(BINS);
  let count = 0, work = 0;
  // 쉬는 자리는 훑은 삼각형 수로 정한다(큰 마디는 한 마디 안에서도 상자 · 칸 나누기 · 가르기 사이에 쉰다 — 주 스레드 길의 한 조각이 길지 않게)
  while (todo.length) {
    const depth = todo.pop(), parent = todo.pop(), e = todo.pop(), s = todo.pop(), id = count++, o = id * 6;
    if (parent >= 0) meta[parent * 2] = id;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let i = s; i < e; i++) {
      const t = order[i] * 6;
      if (box[t] < x0) x0 = box[t]; if (box[t + 1] < y0) y0 = box[t + 1]; if (box[t + 2] < z0) z0 = box[t + 2];
      if (box[t + 3] > x1) x1 = box[t + 3]; if (box[t + 4] > y1) y1 = box[t + 4]; if (box[t + 5] > z1) z1 = box[t + 5];
    }
    nodes[o] = x0; nodes[o + 1] = y0; nodes[o + 2] = z0; nodes[o + 3] = x1; nodes[o + 4] = y1; nodes[o + 5] = z1;
    if (e - s <= leaf) { meta[id * 2] = s; meta[id * 2 + 1] = e - s; continue; }
    work += e - s;
    if (work > chunk) { work = 0; yield; }
    // 삼각형 가운데들의 상자에서 가장 긴 축을 BINS 칸으로 나눠, 「겉넓이 × 삼각형 수」가 가장 작게 갈리는 금을 고른다(광선이 덜 헤맨다). 못 가르면 중앙값으로.
    let c0x = Infinity, c0y = Infinity, c0z = Infinity, c1x = -Infinity, c1y = -Infinity, c1z = -Infinity;
    for (let i = s; i < e; i++) {
      const t = order[i] * 3;
      if (cen[t] < c0x) c0x = cen[t]; if (cen[t] > c1x) c1x = cen[t]; if (cen[t + 1] < c0y) c0y = cen[t + 1]; if (cen[t + 1] > c1y) c1y = cen[t + 1]; if (cen[t + 2] < c0z) c0z = cen[t + 2]; if (cen[t + 2] > c1z) c1z = cen[t + 2];
    }
    const dx = c1x - c0x, dy = c1y - c0y, dz = c1z - c0z, axis = dx >= dy && dx >= dz ? 0 : dy >= dz ? 1 : 2, from = axis === 0 ? c0x : axis === 1 ? c0y : c0z, span = Math.max(dx, dy, dz);
    let m = (s + e) >> 1, cut = -1;
    work += e - s;
    if (work > chunk) { work = 0; yield; }
    if (span > 0 && depth < DEEP) {
      const scale = BINS / span;
      binN.fill(0); binB.fill(Infinity, 0, BINS * 3); binB.fill(-Infinity, BINS * 3);
      for (let i = s; i < e; i++) {
        const t = order[i], b = Math.min(BINS - 1, Math.floor((cen[t * 3 + axis] - from) * scale));
        binN[b]++;
        for (let k = 0; k < 3; k++) { if (box[t * 6 + k] < binB[b * 3 + k]) binB[b * 3 + k] = box[t * 6 + k]; if (box[t * 6 + 3 + k] > binB[(BINS + b) * 3 + k]) binB[(BINS + b) * 3 + k] = box[t * 6 + 3 + k]; }
      }
      work += e - s;
      if (work > chunk) { work = 0; yield; }
      // 오른쪽부터 쌓은 겉넓이 × 수를 적어 두고, 왼쪽부터 쌓으며 더한다
      let ax = Infinity, ay = Infinity, az = Infinity, bx = -Infinity, by = -Infinity, bz = -Infinity, n = 0, best = Infinity;
      for (let b = BINS - 1; b > 0; b--) {
        if (binB[b * 3] < ax) ax = binB[b * 3]; if (binB[b * 3 + 1] < ay) ay = binB[b * 3 + 1]; if (binB[b * 3 + 2] < az) az = binB[b * 3 + 2];
        if (binB[(BINS + b) * 3] > bx) bx = binB[(BINS + b) * 3]; if (binB[(BINS + b) * 3 + 1] > by) by = binB[(BINS + b) * 3 + 1]; if (binB[(BINS + b) * 3 + 2] > bz) bz = binB[(BINS + b) * 3 + 2];
        n += binN[b];
        right[b] = n ? n * ((bx - ax) * (by - ay) + (by - ay) * (bz - az) + (bz - az) * (bx - ax)) : Infinity;
      }
      ax = ay = az = Infinity; bx = by = bz = -Infinity; n = 0;
      for (let b = 0; b < BINS - 1; b++) {
        if (binB[b * 3] < ax) ax = binB[b * 3]; if (binB[b * 3 + 1] < ay) ay = binB[b * 3 + 1]; if (binB[b * 3 + 2] < az) az = binB[b * 3 + 2];
        if (binB[(BINS + b) * 3] > bx) bx = binB[(BINS + b) * 3]; if (binB[(BINS + b) * 3 + 1] > by) by = binB[(BINS + b) * 3 + 1]; if (binB[(BINS + b) * 3 + 2] > bz) bz = binB[(BINS + b) * 3 + 2];
        n += binN[b];
        const cost = n ? n * ((bx - ax) * (by - ay) + (by - ay) * (bz - az) + (bz - az) * (bx - ax)) + right[b + 1] : Infinity;
        if (cost < best) { best = cost; cut = b; }
      }
      if (cut >= 0) {
        // 금 왼쪽 칸의 것을 앞으로 모은다(만난 차례대로 — 어디서 돌려도 같은 차례)
        let i = s, j = e - 1;
        while (i <= j) {
          if (Math.min(BINS - 1, Math.floor((cen[order[i] * 3 + axis] - from) * scale)) <= cut) i++;
          else { const t = order[i]; order[i] = order[j]; order[j] = t; j--; }
        }
        if (i > s && i < e) m = i; else cut = -1;
      }
    }
    if (cut < 0) select(order, cen, axis, s, e, m);
    todo.push(m, e, id, depth + 1, s, m, -1, depth + 1);
    work += e - s;
    if (work > chunk) { work = 0; yield; }
  }
  const tri = new Float32Array(nt * 9);
  for (let i = 0; i < nt; i++) {
    if (i % chunk === chunk - 1) yield;
    for (let k = 0; k < 3; k++) { const v = idx[order[i] * 3 + k] * 3; tri[i * 9 + k * 3] = pos[v]; tri[i * 9 + k * 3 + 1] = pos[v + 1]; tri[i * 9 + k * 3 + 2] = pos[v + 2]; }
  }
  return { nodes: nodes.slice(0, count * 6), meta: meta.slice(0, count * 2), tri, order, count };
}

// 광선(출발 o · 방향 d — 길이 1) 이 마디의 상자를 [0, far] 안에서 지나는가
function slab(N, o, ox, oy, oz, ix, iy, iz, far) {
  let t0 = (N[o] - ox) * ix, t1 = (N[o + 3] - ox) * ix, a, b;
  if (t0 > t1) { a = t0; t0 = t1; t1 = a; }
  a = (N[o + 1] - oy) * iy; b = (N[o + 4] - oy) * iy;
  if (a > b) { const s = a; a = b; b = s; }
  if (a > t0) t0 = a; if (b < t1) t1 = b;
  a = (N[o + 2] - oz) * iz; b = (N[o + 5] - oz) * iz;
  if (a > b) { const s = a; a = b; b = s; }
  if (a > t0) t0 = a; if (b < t1) t1 = b;
  return t1 >= 0 && t0 <= t1 && t0 <= far;
}

// 광선과 삼각형(칸 i) — 맞은 거리(안 맞으면 −1). 양쪽 면 다 맞는다. det 의 부호는 hit.back 을 정할 때 다시 본다.
function triAt(T, i, ox, oy, oz, dx, dy, dz) {
  const e1x = T[i + 3] - T[i], e1y = T[i + 4] - T[i + 1], e1z = T[i + 5] - T[i + 2], e2x = T[i + 6] - T[i], e2y = T[i + 7] - T[i + 1], e2z = T[i + 8] - T[i + 2];
  const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x, det = e1x * px + e1y * py + e1z * pz;
  if (det > -FLAT && det < FLAT) return -1;
  const inv = 1 / det, tx = ox - T[i], ty = oy - T[i + 1], tz = oz - T[i + 2], u = (tx * px + ty * py + tz * pz) * inv;
  if (u < 0 || u > 1) return -1;
  const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x, v = (dx * qx + dy * qy + dz * qz) * inv;
  if (v < 0 || u + v > 1) return -1;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return t > NEAR ? t : -1;
}

const inverse = (d) => 1 / (d === 0 ? 1e-30 : d);

// 출발점에서 방향 d(길이 1)로 far 안에 가리는 삼각형이 있는가
export function rayAny(bvh, ox, oy, oz, dx, dy, dz, far) {
  const N = bvh.nodes, M = bvh.meta, T = bvh.tri, ix = inverse(dx), iy = inverse(dy), iz = inverse(dz);
  let top = 0;
  if (T.length) STACK[top++] = 0;
  while (top) {
    const n = STACK[--top];
    if (!slab(N, n * 6, ox, oy, oz, ix, iy, iz, far)) continue;
    const count = M[n * 2 + 1];
    if (!count) { STACK[top++] = M[n * 2]; STACK[top++] = n + 1; continue; }
    for (let i = M[n * 2] * 9, e = i + count * 9; i < e; i += 9) { const t = triAt(T, i, ox, oy, oz, dx, dy, dz); if (t >= 0 && t < far) return true; }
  }
  return false;
}

// 가장 가까운 맞은 곳까지의 거리(없으면 far). hit = { slot: 맞은 삼각형의 칸(없으면 −1), back: 뒷면에 맞았는가 } 를 채운다.
export function rayHit(bvh, ox, oy, oz, dx, dy, dz, far, hit) {
  const N = bvh.nodes, M = bvh.meta, T = bvh.tri, ix = inverse(dx), iy = inverse(dy), iz = inverse(dz);
  let top = 0, best = far, slot = -1;
  if (T.length) STACK[top++] = 0;
  while (top) {
    const n = STACK[--top];
    if (!slab(N, n * 6, ox, oy, oz, ix, iy, iz, best)) continue;
    const count = M[n * 2 + 1];
    if (!count) { STACK[top++] = M[n * 2]; STACK[top++] = n + 1; continue; }
    for (let i = M[n * 2] * 9, e = i + count * 9; i < e; i += 9) { const t = triAt(T, i, ox, oy, oz, dx, dy, dz); if (t >= 0 && t < best) { best = t; slot = i / 9; } }
  }
  if (hit) {
    hit.slot = slot;
    if (slot >= 0) {
      const i = slot * 9, ux = T[i + 3] - T[i], uy = T[i + 4] - T[i + 1], uz = T[i + 5] - T[i + 2], vx = T[i + 6] - T[i], vy = T[i + 7] - T[i + 1], vz = T[i + 8] - T[i + 2];
      hit.back = (uy * vz - uz * vy) * dx + (uz * vx - ux * vz) * dy + (ux * vy - uy * vx) * dz > 0;
    } else hit.back = false;
  }
  return best;
}

// (x, z) 의 수직선이 만나는 면 전부 → out 에 [높이, 위를 보는 면인가(1 · 0), 칸] 셋씩 채우고 만난 수를 돌려준다(차례는 나무를 훑은 차례 — 쓰는 쪽이 고른다)
export function column(bvh, x, z, out) {
  const N = bvh.nodes, M = bvh.meta, T = bvh.tri;
  let top = 0, n = 0;
  if (T.length) STACK[top++] = 0;
  while (top) {
    const id = STACK[--top], o = id * 6;
    if (x < N[o] || x > N[o + 3] || z < N[o + 2] || z > N[o + 5]) continue;
    const count = M[id * 2 + 1];
    if (!count) { STACK[top++] = M[id * 2]; STACK[top++] = id + 1; continue; }
    for (let i = M[id * 2] * 9, e = i + count * 9; i < e; i += 9) {
      const d = (T[i + 5] - T[i + 8]) * (T[i] - T[i + 6]) + (T[i + 6] - T[i + 3]) * (T[i + 2] - T[i + 8]);
      if (d === 0) continue;
      const u = ((T[i + 5] - T[i + 8]) * (x - T[i + 6]) + (T[i + 6] - T[i + 3]) * (z - T[i + 8])) / d, v = ((T[i + 8] - T[i + 2]) * (x - T[i + 6]) + (T[i] - T[i + 6]) * (z - T[i + 8])) / d;
      if (u < 0 || v < 0 || u + v > 1) continue;
      out[n * 3] = u * T[i + 1] + v * T[i + 4] + (1 - u - v) * T[i + 7]; out[n * 3 + 1] = d < 0 ? 1 : 0; out[n * 3 + 2] = i / 9;
      n++;
    }
  }
  return n;
}

// 점 p 에서 삼각형(칸 i)의 가장 가까운 점까지 거리의 제곱(Ericson 의 영역 나누기)
function triDist2(T, i, px, py, pz) {
  const ax = T[i], ay = T[i + 1], az = T[i + 2], abx = T[i + 3] - ax, aby = T[i + 4] - ay, abz = T[i + 5] - az, acx = T[i + 6] - ax, acy = T[i + 7] - ay, acz = T[i + 8] - az;
  const apx = px - ax, apy = py - ay, apz = pz - az, d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  let v = 0, w = 0;
  if (!(d1 <= 0 && d2 <= 0)) {
    const d3 = d1 - (abx * abx + aby * aby + abz * abz), d4 = d2 - (abx * acx + aby * acy + abz * acz);
    const d5 = d1 - (abx * acx + aby * acy + abz * acz), d6 = d2 - (acx * acx + acy * acy + acz * acz);
    const vc = d1 * d4 - d3 * d2, vb = d5 * d2 - d1 * d6, va = d3 * d6 - d5 * d4;
    if (d3 >= 0 && d4 <= d3) v = 1;
    else if (vc <= 0 && d1 >= 0 && d3 <= 0) v = d1 / (d1 - d3);
    else if (d6 >= 0 && d5 <= d6) w = 1;
    else if (vb <= 0 && d2 >= 0 && d6 <= 0) w = d2 / (d2 - d6);
    else if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { w = (d4 - d3) / (d4 - d3 + d5 - d6); v = 1 - w; }
    else { const k = 1 / (va + vb + vc); v = vb * k; w = vc * k; }
  }
  const qx = apx - abx * v - acx * w, qy = apy - aby * v - acy * w, qz = apz - abz * v - acz * w;
  return qx * qx + qy * qy + qz * qz;
}

// 가운데 c · 반지름 r 인 공에 닿는 삼각형이 있는가(캡슐 끼임 — 공 몇 개로 본다)
export function sphereAny(bvh, cx, cy, cz, r) {
  const N = bvh.nodes, M = bvh.meta, T = bvh.tri, r2 = r * r;
  let top = 0;
  if (T.length) STACK[top++] = 0;
  while (top) {
    const n = STACK[--top], o = n * 6;
    if (cx + r < N[o] || cx - r > N[o + 3] || cy + r < N[o + 1] || cy - r > N[o + 4] || cz + r < N[o + 2] || cz - r > N[o + 5]) continue;
    const count = M[n * 2 + 1];
    if (!count) { STACK[top++] = M[n * 2]; STACK[top++] = n + 1; continue; }
    for (let i = M[n * 2] * 9, e = i + count * 9; i < e; i += 9) if (triDist2(T, i, cx, cy, cz) < r2) return true;
  }
  return false;
}

// 다각형(src 의 so 부터 n 꼭짓점 × 3)을 높이 y 의 평면으로 자른다 — up 이면 그 위쪽을, 아니면 아래쪽을 남긴다. CLIP 의 to 부터 적고 남은 꼭짓점 수를 돌려준다.
function clipY(src, so, n, to, y, up) {
  let m = 0;
  for (let i = 0; i < n; i++) {
    const a = so + i * 3, b = so + ((i + 1) % n) * 3, da = up ? src[a + 1] - y : y - src[a + 1], db = up ? src[b + 1] - y : y - src[b + 1];
    if (da >= 0) { CLIP[to + m * 3] = src[a]; CLIP[to + m * 3 + 1] = src[a + 1]; CLIP[to + m * 3 + 2] = src[a + 2]; m++; }
    if ((da > 0 && db < 0) || (da < 0 && db > 0)) {
      const t = da / (da - db);
      CLIP[to + m * 3] = src[a] + (src[b] - src[a]) * t; CLIP[to + m * 3 + 1] = y; CLIP[to + m * 3 + 2] = src[a + 2] + (src[b + 2] - src[a + 2]) * t; m++;
    }
  }
  return m;
}

// 가운데 (x, z) · 반지름 r 인 세로 기둥의 높이 y0 ~ y1 에 닿는 삼각형이 있는가(= 그 높이 띠 안의 것 가운데 가운데 줄에서 가로로 r 보다 가까운 것이 있는가).
//   삼각형을 높이 띠로 자른 다각형(꼭짓점 다섯까지 — 위에서 보면 볼록하다)과 점 (x, z) 의 가로 거리를 잰다: 변까지의 거리가 r 보다 작거나 점이 다각형 안이면 닿은 것.
//   걷기 격자가 「칸 가운데에서 장애물까지의 거리 ≥ 몸 반지름」을 이것으로 본다(nav.js).
export function pillarAny(bvh, x, z, y0, y1, r) {
  const N = bvh.nodes, M = bvh.meta, T = bvh.tri, r2 = r * r;
  let top = 0;
  if (T.length) STACK[top++] = 0;
  while (top) {
    const id = STACK[--top], o = id * 6;
    if (x + r < N[o] || x - r > N[o + 3] || y1 < N[o + 1] || y0 > N[o + 4] || z + r < N[o + 2] || z - r > N[o + 5]) continue;
    const count = M[id * 2 + 1];
    if (!count) { STACK[top++] = M[id * 2]; STACK[top++] = id + 1; continue; }
    for (let i = M[id * 2] * 9, e = i + count * 9; i < e; i += 9) {
      if (Math.max(T[i + 1], T[i + 4], T[i + 7]) < y0 || Math.min(T[i + 1], T[i + 4], T[i + 7]) > y1) continue;
      const n = clipY(CLIP, 0, clipY(T, i, 3, 0, y0, true), 18, y1, false);
      let sign = 0, inside = n >= 3;
      for (let k = 0; k < n; k++) {
        const a = 18 + k * 3, b = 18 + ((k + 1) % n) * 3, ex = CLIP[b] - CLIP[a], ez = CLIP[b + 2] - CLIP[a + 2], px = x - CLIP[a], pz = z - CLIP[a + 2];
        const len2 = ex * ex + ez * ez, t = len2 > 0 ? Math.min(1, Math.max(0, (px * ex + pz * ez) / len2)) : 0, dx = px - ex * t, dz = pz - ez * t, turn = ex * pz - ez * px;
        if (dx * dx + dz * dz < r2) return true;
        if (turn > 0) { if (sign < 0) inside = false; sign = 1; } else if (turn < 0) { if (sign > 0) inside = false; sign = -1; }
      }
      if (inside && sign !== 0) return true;
    }
  }
  return false;
}
