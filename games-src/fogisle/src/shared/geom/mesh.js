// 주는 것: 삼각형 더미 → 그릴 수 있는 형상. shade(꺾인 모서리에서 꼭짓점을 나누고 법선을 낸다) · subdivide(긴 모서리를 반씩 쪼갠다) ·
//   placeMesh(형상을 옮긴다 — 법선도) · dominantAxis(법선의 가장 큰 축: 0 x · 1 y · 2 z — 값싼 경로가 무늬를 한 번만 읽는 「주된 입힘 축」).
// 받는 것: dmath. 형상(mesh) = { pos: Float32Array, nor: Float32Array, idx: Uint32Array } — three 와 무관한 형식 배열이다.
// 꼭짓점 빛 규칙(tdd §4-5): 큰 면은 1m 이하로 쪼개고(subdivide) 법선이 꺾이는 모서리는 꼭짓점을 나눈다(shade 의 crease).
import { PI, dcos } from '../dmath.js';

const QUANT = 4096;

// 모서리가 maxEdge 를 넘는 삼각형을 가장 긴 모서리의 가운데에서 둘로 — 다 될 때까지. 맞닿은 삼각형은 같은 가운데 점을 쓴다(틈 없음).
export function subdivide(soup, maxEdge) {
  const out = [], m2 = maxEdge * maxEdge, st = [];
  const d2 = (p, i, j) => (p[i] - p[j]) * (p[i] - p[j]) + (p[i + 1] - p[j + 1]) * (p[i + 1] - p[j + 1]) + (p[i + 2] - p[j + 2]) * (p[i + 2] - p[j + 2]);
  for (let t = 0; t < soup.length; t += 9) {
    st.push(soup.slice(t, t + 9));
    while (st.length) {
      const p = st.pop(), l0 = d2(p, 0, 3), l1 = d2(p, 3, 6), l2 = d2(p, 6, 0), e = l0 >= l1 && l0 >= l2 ? 0 : l1 >= l2 ? 1 : 2;
      if (Math.max(l0, l1, l2) <= m2) { for (let k = 0; k < 9; k++) out.push(p[k]); continue; }
      const i = e * 3, j = ((e + 1) % 3) * 3, k = ((e + 2) % 3) * 3, mx = (p[i] + p[j]) / 2, my = (p[i + 1] + p[j + 1]) / 2, mz = (p[i + 2] + p[j + 2]) / 2;
      st.push([p[i], p[i + 1], p[i + 2], mx, my, mz, p[k], p[k + 1], p[k + 2]], [mx, my, mz, p[j], p[j + 1], p[j + 2], p[k], p[k + 1], p[k + 2]]);
    }
  }
  return out;
}

// 같은 자리의 꼭짓점을 모으되, 면 법선이 creaseDeg 넘게 꺾이면 따로 둔다. 넓이가 0 인 삼각형은 버린다. 법선은 넓이로 무게를 준 평균.
export function shade(soup, creaseDeg = 40) {
  const cosC = dcos(creaseDeg * PI / 180), pos = [], nor = [], rep = [], q = [], idx = [], buckets = new Map();
  for (let t = 0; t < soup.length; t += 9) {
    const ux = soup[t + 3] - soup[t], uy = soup[t + 4] - soup[t + 1], uz = soup[t + 5] - soup[t + 2];
    const vx = soup[t + 6] - soup[t], vy = soup[t + 7] - soup[t + 1], vz = soup[t + 8] - soup[t + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (!(len > 1e-10)) continue;
    for (let c = 0; c < 9; c += 3) {
      const x = soup[t + c], y = soup[t + c + 1], z = soup[t + c + 2], qx = Math.round(x * QUANT), qy = Math.round(y * QUANT), qz = Math.round(z * QUANT);
      const key = Math.imul(qx, 73856093) ^ Math.imul(qy, 19349663) ^ Math.imul(qz, 83492791);
      let list = buckets.get(key), v = -1;
      if (!list) { list = []; buckets.set(key, list); }
      for (const w of list) {
        if (q[w * 3] === qx && q[w * 3 + 1] === qy && q[w * 3 + 2] === qz && rep[w * 3] * nx + rep[w * 3 + 1] * ny + rep[w * 3 + 2] * nz >= cosC * len) { v = w; break; }
      }
      if (v < 0) { v = pos.length / 3; list.push(v); pos.push(x, y, z); q.push(qx, qy, qz); rep.push(nx / len, ny / len, nz / len); nor.push(0, 0, 0); }
      nor[v * 3] += nx; nor[v * 3 + 1] += ny; nor[v * 3 + 2] += nz;
      idx.push(v);
    }
  }
  for (let v = 0; v < nor.length; v += 3) {
    const l = Math.sqrt(nor[v] * nor[v] + nor[v + 1] * nor[v + 1] + nor[v + 2] * nor[v + 2]) || 1;
    nor[v] /= l; nor[v + 1] /= l; nor[v + 2] /= l;
  }
  return { pos: Float32Array.from(pos), nor: Float32Array.from(nor), idx: Uint32Array.from(idx) };
}

// 형상을 변환 T(shapes.xf)로 옮긴 새 형상. T 는 회전 × 축 크기라서 법선은 열마다 크기의 제곱으로 나눈 뒤 돌리고 다시 1 로 맞춘다. 번호는 같이 쓴다.
export function placeMesh(mesh, T) {
  const n = mesh.pos.length, pos = new Float32Array(n), nor = new Float32Array(n);
  const s0 = T[0] * T[0] + T[4] * T[4] + T[8] * T[8], s1 = T[1] * T[1] + T[5] * T[5] + T[9] * T[9], s2 = T[2] * T[2] + T[6] * T[6] + T[10] * T[10];
  for (let i = 0; i < n; i += 3) {
    const x = mesh.pos[i], y = mesh.pos[i + 1], z = mesh.pos[i + 2], a = mesh.nor[i] / s0, b = mesh.nor[i + 1] / s1, c = mesh.nor[i + 2] / s2;
    pos[i] = T[0] * x + T[1] * y + T[2] * z + T[3]; pos[i + 1] = T[4] * x + T[5] * y + T[6] * z + T[7]; pos[i + 2] = T[8] * x + T[9] * y + T[10] * z + T[11];
    const nx = T[0] * a + T[1] * b + T[2] * c, ny = T[4] * a + T[5] * b + T[6] * c, nz = T[8] * a + T[9] * b + T[10] * c, l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nor[i] = nx / l; nor[i + 1] = ny / l; nor[i + 2] = nz / l;
  }
  return { pos, nor, idx: mesh.idx };
}

// 동률이면 y → x → z 순으로 고른다(같은 법선은 어디서나 같은 축)
export function dominantAxis(nx, ny, nz) {
  const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
  return ay >= ax && ay >= az ? 1 : ax >= az ? 0 : 2;
}
