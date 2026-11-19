// 주는 것: 형상 도우미 — 삼각형 더미(soup: 삼각형 하나에 수 9개인 일반 배열)를 만든다. three 를 쓰지 않는다(Node · 워커에서 같은 꼭짓점).
//   cbox(모서리 깎은 상자) · bar(긴 각재 — 길이를 따라 마디를 둔다) · extrude(단면 밀어내기) · lathe(선반 깎기) · sweep(길 따라 쓸기) · loft(고리 잇기) · displace(잡음으로 밀기) · merge(합치기)
//   + ico(공) · xf(변환 12칸) · place(더미 옮기기) · tri(삼각형 하나 넣기 — 점이 겹친 것은 버린다).
// 받는 것: dmath · noise. 모든 도우미는 면이 바깥을 보게 감는다(고리 잇기는 첫 고리와 나아가는 쪽을 보고 감는 방향을 한 번 정한다).
//   법선 · 모서리 나누기는 여기서 하지 않는다 — 더미를 mesh.shade 에 넘기면 꺾인 모서리에서 꼭짓점을 나눠 준다.
import { TAU, dsin, dcos } from '../dmath.js';
import { fbm3 } from './noise.js';

// 변환 12칸(행 셋 × [회전 · 크기 3칸 + 옮김 1칸]). 크기 → 회전(오일러 XYZ — three 의 기본 순서와 같다) → 옮김
export function xf(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  const a = dcos(rx), b = dsin(rx), c = dcos(ry), d = dsin(ry), e = dcos(rz), f = dsin(rz);
  return [
    c * e * sx, -c * f * sy, d * sz, x,
    (a * f + b * e * d) * sx, (a * e - b * f * d) * sy, -b * c * sz, y,
    (b * f - a * e * d) * sx, (b * e + a * f * d) * sy, a * c * sz, z,
  ];
}

export function place(soup, T) {
  const out = new Array(soup.length);
  for (let i = 0; i < soup.length; i += 3) {
    const x = soup[i], y = soup[i + 1], z = soup[i + 2];
    out[i] = T[0] * x + T[1] * y + T[2] * z + T[3];
    out[i + 1] = T[4] * x + T[5] * y + T[6] * z + T[7];
    out[i + 2] = T[8] * x + T[9] * y + T[10] * z + T[11];
  }
  return out;
}

export function merge(list) {
  const out = [];
  for (const soup of list) for (let i = 0; i < soup.length; i++) out.push(soup[i]);
  return out;
}

const same = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

export function tri(out, a, b, c) {
  if (same(a, b) || same(b, c) || same(a, c)) return;
  out.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
}

// 볼록한 덩이(원점이 안에 있다)의 면 하나 — 원점 반대쪽을 보게 감아 부채꼴로 나눈다
function face(out, pts) {
  const a = pts[0], b = pts[1], c = pts[2], ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const flip = (uy * vz - uz * vy) * a[0] + (uz * vx - ux * vz) * a[1] + (ux * vy - uy * vx) * a[2] < 0;
  for (let i = 1; i + 1 < pts.length; i++) { if (flip) tri(out, a, pts[i + 1], pts[i]); else tri(out, a, pts[i], pts[i + 1]); }
}

// 모서리를 c 만큼 깎은 상자(가운데가 원점). 모서리마다 띠 하나, 꼭짓점마다 세모 하나. c = 0 이면 그냥 상자.
export function cbox(w, h, d, c = 0) {
  const e = [w / 2, h / 2, d / 2], k = Math.max(0, Math.min(c, e[0] * 0.49, e[1] * 0.49, e[2] * 0.49)), V = [[], [], []], out = [];
  for (let id = 0; id < 8; id++) for (let ax = 0; ax < 3; ax++) {
    const p = [0, 0, 0];
    for (let j = 0; j < 3; j++) p[j] = ((id >> j) & 1 ? 1 : -1) * (j === ax ? e[j] : e[j] - k);
    V[ax][id] = p;
  }
  for (let ax = 0; ax < 3; ax++) {
    const a = 1 << ax, u = 1 << ((ax + 1) % 3), v = 1 << ((ax + 2) % 3), o1 = V[(ax + 1) % 3], o2 = V[(ax + 2) % 3];
    for (const s of [0, a]) face(out, [V[ax][s], V[ax][s | u], V[ax][s | u | v], V[ax][s | v]]);
    for (const s of [0, u, v, u | v]) face(out, [o1[s], o1[s | a], o2[s | a], o2[s]]);
  }
  for (let id = 0; id < 8; id++) face(out, [V[0][id], V[1][id], V[2][id]]);
  return out;
}

const cross2 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

// 반시계로 감긴 단순 다각형(오목해도 된다)을 귀 자르기로 나눈다 → 꼭짓점 번호 셋씩
function earclip(P) {
  const V = P.map((p, i) => i), out = [];
  for (let guard = P.length * P.length; V.length > 3 && guard > 0; guard--) {
    for (let i = 0; i < V.length; i++) {
      const ia = V[(i + V.length - 1) % V.length], ib = V[i], ic = V[(i + 1) % V.length], a = P[ia], b = P[ib], c = P[ic];
      if (cross2(a, b, c) <= 0) continue;
      const inside = (k) => k !== ia && k !== ib && k !== ic && cross2(a, b, P[k]) >= 0 && cross2(b, c, P[k]) >= 0 && cross2(c, a, P[k]) >= 0;
      if (V.some(inside)) continue;
      out.push(ia, ib, ic); V.splice(i, 1);
      break;
    }
  }
  if (V.length === 3) out.push(V[0], V[1], V[2]);
  return out;
}

// 단면(XY 평면의 다각형 [[x, y], …])을 Z 로 depth 만큼 밀어낸다(가운데가 z = 0). 감긴 방향은 알아서 맞춘다.
export function extrude(poly, depth) {
  let area = 0;
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; area += a[0] * b[1] - b[0] * a[1]; }
  const P = area < 0 ? poly.slice().reverse() : poly, z = depth / 2, out = [], ears = earclip(P), at = (i, s) => [P[i][0], P[i][1], s];
  for (let i = 0; i < ears.length; i += 3) {
    tri(out, at(ears[i], z), at(ears[i + 1], z), at(ears[i + 2], z));
    tri(out, at(ears[i], -z), at(ears[i + 2], -z), at(ears[i + 1], -z));
  }
  for (let i = 0; i < P.length; i++) {
    const j = (i + 1) % P.length;
    tri(out, at(i, -z), at(j, -z), at(j, z)); tri(out, at(i, -z), at(j, z), at(i, z));
  }
  return out;
}

function center(ring) {
  const c = [0, 0, 0];
  for (const p of ring) { c[0] += p[0] / ring.length; c[1] += p[1] / ring.length; c[2] += p[2] / ring.length; }
  return c;
}

// 고리가 도는 방향(넓이 벡터)과 다음 고리로 나아가는 쪽을 견줘, 면이 바깥을 보려면 뒤집어야 하는지 한 번 정한다
function loftFlip(rings, cen) {
  for (let k = 0; k < rings.length; k++) {
    const r = rings[k], n = [0, 0, 0];
    for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length];
      n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1]);
    }
    if (n[0] * n[0] + n[1] * n[1] + n[2] * n[2] < 1e-18) continue;
    for (const j of [...rings.keys()].sort((p, q) => (p < k) - (q < k) || Math.abs(p - k) - Math.abs(q - k) || p - q)) {
      if (j === k || same(cen[j], cen[k])) continue;
      const s = j > k ? 1 : -1;
      return ((cen[j][0] - cen[k][0]) * n[0] + (cen[j][1] - cen[k][1]) * n[1] + (cen[j][2] - cen[k][2]) * n[2]) * s < 0;
    }
  }
  return false;
}

// 점 수가 같은 고리들을 차례로 잇는다. capA · capB = 첫 · 끝 고리를 막는다. 한 점으로 모인 고리(반지름 0)는 세모로 닫힌다.
export function loft(rings, capA = false, capB = false) {
  const out = [], n = rings[0].length, cen = rings.map(center), flip = loftFlip(rings, cen), last = rings.length - 1;
  for (let k = 0; k < last; k++) for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, a = rings[k][i], b = rings[k][j], c = rings[k + 1][j], d = rings[k + 1][i];
    if (flip) { tri(out, a, c, b); tri(out, a, d, c); } else { tri(out, a, b, c); tri(out, a, c, d); }
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (capA) tri(out, cen[0], rings[0][flip ? i : j], rings[0][flip ? j : i]);
    if (capB) tri(out, cen[last], rings[last][flip ? j : i], rings[last][flip ? i : j]);
  }
  return out;
}

// 옆모습 [[반지름, 높이], …] 을 y 축 둘레로 seg 각으로 돌린다. 반지름 0 으로 시작 · 끝나면 닫힌 덩이가 된다.
export function lathe(profile, seg) {
  const rings = [];
  for (const [r, y] of profile) {
    const ring = [];
    for (let i = 0; i < seg; i++) ring.push([r * dcos(TAU * i / seg), y, r * dsin(TAU * i / seg)]);
    rings.push(ring);
  }
  return loft(rings);
}

// 길 [[x, y, z], …] 을 따라 sides 각 관을 쓴다. radius = 수 하나 또는 점마다의 배열. closed = 길의 끝을 처음에 잇는다(고리).
export function sweep(path, radius, sides, closed = false) {
  const n = path.length, rings = [], f = [0, 1, 0];
  for (let i = 0; i < n; i++) {
    const p = path[i], a = path[closed ? (i + n - 1) % n : Math.max(i - 1, 0)], b = path[closed ? (i + 1) % n : Math.min(i + 1, n - 1)];
    const tl = Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]) + (b[2] - a[2]) * (b[2] - a[2]));
    const tx = (b[0] - a[0]) / tl, ty = (b[1] - a[1]) / tl, tz = (b[2] - a[2]) / tl;
    if (i === 0 && Math.abs(ty) > 0.9) { f[0] = 1; f[1] = 0; }
    const dot = f[0] * tx + f[1] * ty + f[2] * tz, fx = f[0] - tx * dot, fy = f[1] - ty * dot, fz = f[2] - tz * dot, fl = Math.sqrt(fx * fx + fy * fy + fz * fz);
    f[0] = fx / fl; f[1] = fy / fl; f[2] = fz / fl;
    const bx = ty * f[2] - tz * f[1], by = tz * f[0] - tx * f[2], bz = tx * f[1] - ty * f[0], r = typeof radius === 'number' ? radius : radius[i], ring = [];
    for (let s = 0; s < sides; s++) {
      const u = r * dcos(TAU * s / sides), v = r * dsin(TAU * s / sides);
      ring.push([p[0] + f[0] * u + bx * v, p[1] + f[1] * u + by * v, p[2] + f[2] * u + bz * v]);
    }
    rings.push(ring);
  }
  if (closed) rings.push(rings[0]);
  return loft(rings, !closed, !closed);
}

// 긴 각재(x 로 len, 단면 h × d, 모서리를 c 만큼 깎는다). 길이를 따라 seg m 마다 마디를 둔다 — 긴 면이 처음부터 1m 안팎으로 나뉜다(꼭짓점 빛 규칙).
export function bar(len, h, d, c = 0, seg = 1) {
  const n = Math.max(1, Math.ceil(len / seg)), y = h / 2, z = d / 2, k = Math.min(c, y * 0.49, z * 0.49), rings = [];
  const cut = k > 0 ? [[y - k, z], [y, z - k], [y, k - z], [y - k, -z], [k - y, -z], [-y, k - z], [-y, z - k], [k - y, z]] : [[y, z], [y, -z], [-y, -z], [-y, z]];
  for (let i = 0; i <= n; i++) rings.push(cut.map((p) => [len * (i / n - 0.5), p[0], p[1]]));
  return loft(rings, true, true);
}

// 점마다 자리에서 뽑은 잡음만큼 세 축으로 민다(같은 자리는 같은 만큼 — 맞닿은 삼각형이 벌어지지 않는다). 더미를 고쳐서 돌려준다.
export function displace(soup, amp, freq, salt) {
  for (let i = 0; i < soup.length; i += 3) {
    const x = soup[i] * freq, y = soup[i + 1] * freq, z = soup[i + 2] * freq;
    soup[i] += amp * (2 * fbm3(x, y, z, 2, salt) - 1);
    soup[i + 1] += amp * (2 * fbm3(x + 31.7, y + 11.3, z + 5.9, 2, salt) - 1);
    soup[i + 2] += amp * (2 * fbm3(x + 7.1, y + 43.9, z + 19.3, 2, salt) - 1);
  }
  return soup;
}

const ICO_T = (1 + Math.sqrt(5)) / 2;
const ICO_V = [[-1, ICO_T, 0], [1, ICO_T, 0], [-1, -ICO_T, 0], [1, -ICO_T, 0], [0, -1, ICO_T], [0, 1, ICO_T], [0, -1, -ICO_T], [0, 1, -ICO_T], [ICO_T, 0, -1], [ICO_T, 0, 1], [-ICO_T, 0, -1], [-ICO_T, 0, 1]];
const ICO_F = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1];

function unit(p) { const l = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]); return [p[0] / l, p[1] / l, p[2] / l]; }

// 반지름 1 인 공(정이십면체를 detail 번 쪼갠 것 — 삼각형 20 × 4^detail)
export function ico(detail) {
  let tris = [];
  for (let i = 0; i < ICO_F.length; i += 3) tris.push([unit(ICO_V[ICO_F[i]]), unit(ICO_V[ICO_F[i + 1]]), unit(ICO_V[ICO_F[i + 2]])]);
  for (let d = 0; d < detail; d++) {
    const next = [];
    for (const [a, b, c] of tris) {
      const ab = unit([a[0] + b[0], a[1] + b[1], a[2] + b[2]]), bc = unit([b[0] + c[0], b[1] + c[1], b[2] + c[2]]), ca = unit([c[0] + a[0], c[1] + a[1], c[2] + a[2]]);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    tris = next;
  }
  const out = [];
  for (const [a, b, c] of tris) tri(out, a, b, c);
  return out;
}
