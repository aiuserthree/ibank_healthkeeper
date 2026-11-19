// 주는 것: 높이 지형 — makeTerrain(1m 격자) · applyOp(도장 하나 찍기) · heightAt(땅 높이) · coastU(절벽 발치에서 바다 쪽으로 잰 거리) ·
//   zAtU(그 거리의 z) · pathDist(가장 가까운 길까지) · meshTerrain(격자 → 꼭짓점: 가로 밀기 · 접힘 풀기 · 법선 · 지형 겹 · 틈 그늘) · OPS(도장 이름).
// 받는 것: dmath · noise · tune/world. 도장: base 바탕(해변 → 절벽 → 고원 단면을 절벽 선 따라 휨 + 지층) · flatten 평평하게 · path 길 다지기 ·
//   raise 올리기 · carve 깎기 · terrace 계단밭(높이 도장 — 적힌 순서대로) / push 가파른 면 가로 밀기 · crack 틈 어둡게(꼭짓점 도장 — 높이가 다 끝난 뒤 한 번).
// 영역(area) = ['circle', x, z, 반지름] 또는 ['box', x0, z0, x1, z1]. 가장자리 밖 blend m 에 걸쳐 부드럽게 사라진다. 바다는 +z 쪽(coast: 'south').
import { dpow } from '../dmath.js';
import { clamp, lerp, sstep, fbm2, ridge3, worley3 } from '../geom/noise.js';
import { dominantAxis } from '../geom/mesh.js';
import { WORLD } from '../tune/world.js';

export const OPS = Object.freeze(['base', 'flatten', 'path', 'raise', 'carve', 'terrace', 'push', 'crack']);

export function makeTerrain(recipe, salt) {
  const w = recipe.size[0], d = recipe.size[1], nx = w + 1, nz = d + 1;
  return { x0: -w / 2, z0: -d / 2, w, d, nx, nz, salt, h: new Float64Array(nx * nz), cliff: null, paths: [], push: null, crack: null };
}

export function heightAt(T, x, z) {
  const fx = clamp(x - T.x0, 0, T.w - 1e-9), fz = clamp(z - T.z0, 0, T.d - 1e-9), i = Math.floor(fx), j = Math.floor(fz), k = j * T.nx + i;
  return lerp(lerp(T.h[k], T.h[k + 1], fx - i), lerp(T.h[k + T.nx], T.h[k + T.nx + 1], fx - i), fz - j);
}

// 절벽 선(x 가 커지는 차례의 [x, z] 점들)을 매끄럽게 이은 곡선의 z
function lineZ(line, x) {
  let i = 0;
  while (i < line.length - 2 && x > line[i + 1][0]) i++;
  const a = line[Math.max(i - 1, 0)], b = line[i], c = line[i + 1], d = line[Math.min(i + 2, line.length - 1)], dx = c[0] - b[0];
  const t = clamp((x - b[0]) / dx, 0, 1), m0 = (c[1] - a[1]) / (c[0] - a[0]) * dx, m1 = (d[1] - b[1]) / (d[0] - b[0]) * dx, t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * b[1] + (t3 - 2 * t2 + t) * m0 + (3 * t2 - 2 * t3) * c[1] + (t3 - t2) * m1;
}

function footZ(T, x) { return lineZ(T.cliff.line, x) + WORLD.terrain.wobble * (fbm2(x * WORLD.terrain.wobbleFreq, 1.7, 3, T.salt) - 0.5); }

export function coastU(T, x, z) { return z - footZ(T, x); }

export function zAtU(T, x, u) { return u + footZ(T, x); }

// 영역 가장자리까지의 거리(안쪽은 0 이하)에서 도장의 세기 1 → 0
function weight(op, x, z) {
  const a = op.area, blend = op.blend || 1e-6;
  const dist = a[0] === 'circle' ? Math.sqrt((x - a[1]) * (x - a[1]) + (z - a[2]) * (z - a[2])) - a[3]
    : Math.max(Math.abs(x - (a[1] + a[3]) / 2) - (a[3] - a[1]) / 2, Math.abs(z - (a[2] + a[4]) / 2) - (a[4] - a[2]) / 2);
  return 1 - sstep(0, blend, dist);
}

function each(T, fn) {
  for (let j = 0; j < T.nz; j++) for (let i = 0; i < T.nx; i++) T.h[j * T.nx + i] = fn(T.x0 + i, T.z0 + j, T.h[j * T.nx + i]);
}

// 길에서 가장 가까운 점까지의 거리와 그 점의 길 높이 → out[0] · out[1]
function nearPath(pts, x, z, out) {
  out[0] = 1e9;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz), 0, 1);
    const d = Math.sqrt((x - a[0] - dx * t) * (x - a[0] - dx * t) + (z - a[1] - dz * t) * (z - a[1] - dz * t));
    if (d < out[0]) { out[0] = d; out[1] = lerp(a[2], b[2], t); }
  }
  return out;
}

export function pathDist(T, x, z) {
  const out = [0, 0];
  let best = 1e9;
  for (const p of T.paths) best = Math.min(best, nearPath(p.pts, x, z, out)[0] - p.half);
  return best;
}

const HEIGHT = {
  // 해변(완만) → 절벽(run m 에 걸쳐 height 만큼, 지층 strata m 마다 선반) → 고원(느린 오르막 + 굴곡). 물가는 z = shore, 그 너머는 바다 밑.
  base(T, op) {
    const W = WORLD.terrain, c = op.cliff, s = T.salt;
    T.cliff = c;
    each(T, (x, z) => {
      const u = coastU(T, x, z), face = sstep(1, 1 - W.run, u);
      let h = Math.max(W.floor, Math.min(W.rise - Math.max(u, 0) * W.slope, (op.shore - z) * W.seaSlope));
      if (u < 0) h += -u * W.backSlope;
      h += c.height * (1 + W.heightVary * (fbm2(x * W.heightFreq, 4.3, 2, s + 17) - 0.5)) * dpow(face, W.curve);
      if (u < -W.run) {
        // 고원: 느린 오르막 + 큰 굴곡 + 군데군데 솟은 바위 턱(잡음이 높은 곳만 — 매끈한 언덕으로 보이지 않게)
        const far = sstep(-W.run, -2 * W.run, u);
        h += (-W.run - u) * W.topSlope + far * W.roll * (fbm2(x * W.rollFreq + 9, z * W.rollFreq, 3, s) - 0.5);
        h += far * W.crag * sstep(W.cragFrom, W.cragFull, fbm2(x * W.cragFreq, z * W.cragFreq, 3, s + 29)) * (0.3 + 1.4 * fbm2(x * W.cragFreq * 3, z * W.cragFreq * 3, 2, s + 37));
      }
      const mask = sstep(0.02, 0.2, face) * sstep(1, 0.86, face);
      if (mask > 0 && c.strata > 0) {
        const n = W.strataNoise * fbm2(x * W.strataFreq, z * W.strataFreq, 2, s + 11), t = h / c.strata + n, fl = Math.floor(t);
        h = lerp(h, (fl + sstep(W.strataLo, W.strataHi, t - fl) - n) * c.strata, W.strataMix * mask);
      }
      return h + (fbm2(x * W.grainFreq, z * W.grainFreq, 3, s + 23) - 0.5) * (W.grain + W.grainSteep * mask);
    });
  },
  flatten(T, op) {
    const a = op.area, to = op.to != null ? op.to : a[0] === 'circle' ? heightAt(T, a[1], a[2]) : heightAt(T, (a[1] + a[3]) / 2, (a[2] + a[4]) / 2);
    each(T, (x, z, h) => lerp(h, to, weight(op, x, z)));
  },
  raise(T, op) { each(T, (x, z, h) => h + op.by * weight(op, x, z)); },
  carve(T, op) { each(T, (x, z, h) => h - op.by * weight(op, x, z)); },
  terrace(T, op) {
    const W = WORLD.terrain;
    each(T, (x, z, h) => { const t = h / op.step, fl = Math.floor(t); return lerp(h, (fl + sstep(W.terraceLo, W.terraceHi, t - fl)) * op.step, weight(op, x, z)); });
  },
  // 길: 점마다 높이를 적지 않으면 그 자리의 땅 높이를 쓴다. 폭 안은 길 높이로, 그 밖 blend m 에 걸쳐 원래 땅으로.
  path(T, op) {
    const W = WORLD.terrain, half = op.width / 2, blend = op.blend || W.pathBlend, out = [0, 0];
    const pts = op.line.map((p) => [p[0], p[1], p.length > 2 ? p[2] : heightAt(T, p[0], p[1])]);
    T.paths.push({ pts, half });
    each(T, (x, z, h) => {
      if (nearPath(pts, x, z, out)[0] >= half + blend) return h;
      return lerp(h, out[1] + (fbm2(x * 0.5, z * 0.5, 2, T.salt + 31) - 0.5) * W.pathRipple, sstep(half + blend, half, out[0]));
    });
  },
};

export function applyOp(T, op) {
  if (op.op === 'push' || op.op === 'crack') T[op.op] = op; else HEIGHT[op.op](T, op);
}

// 격자 → 꼭짓점. 돌려주는 것: pos · nor(Float32 ×3) · lay(Uint8 ×4: 자갈 · 풀 · 젖음 · 예비) · shade(틈 그늘 0 ~ 1) · axis · idx(삼각형) ·
//   steep(가파름 0 ~ 1 — 삼각형의 표면 종류를 정할 때 쓴다).
export function meshTerrain(T) {
  const { nx, nz, h, salt } = T, n = nx * nz, P = WORLD.push, L = WORLD.layer, wv = [0, 0], wf = [0, 0];
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), lay = new Uint8Array(n * 4), shade = new Float32Array(n).fill(1);
  const axis = new Uint8Array(n), steep = new Float32Array(n), off = new Float64Array(n * 3), flat = new Float32Array(n);
  const at = (i, j) => h[clamp(j, 0, nz - 1) * nx + clamp(i, 0, nx - 1)];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, x = T.x0 + i, z = T.z0 + j, y = h[k], gx = (at(i + 1, j) - at(i - 1, j)) / 2, gz = (at(i, j + 1) - at(i, j - 1)) / 2;
    flat[k] = 1 / Math.sqrt(1 + gx * gx + gz * gz);
    const st = sstep(P.steepFrom, P.steepFull, flat[k]);
    steep[k] = st;
    if (!(st > 0) || (!T.push && !T.crack)) continue;
    const cell = (T.push && T.push.cell) || P.cell, layer = (T.cliff && T.cliff.strata) || cell / 2;
    // 덩이의 세로 크기는 지층 한 켜(strata)에 맞춘다 — 같은 켜의 바위가 한 덩이로 밀려 턱과 선반이 가로로 이어진다
    worley3(x / cell + 3.3, y / layer + 0.37, z / cell + 1.7, salt + 41, wv); worley3(x * P.chipFreq, y * 1.5 + 9, z * P.chipFreq, salt + 43, wf);
    if (T.push) {
      // 큰 굴곡(능선 잡음) + 깨진 바위 덩이(보로노이 칸마다 들쭉날쭉) — 높이 지형의 「늘어난 벽」을 턱 · 판 · 처마로 바꾼다
      const gl = Math.sqrt(gx * gx + gz * gz) || 1, amt = T.push.amount * st;
      const dsp = (ridge3(x * P.bigFreq, y * 0.2, z * P.bigFreq, 3, salt + 47) - P.bigBias) * P.big + (wv[0] - P.slabBias) * P.slab + (wf[0] - 0.5) * P.chip;
      off[k * 3] = -gx / gl * dsp * amt; off[k * 3 + 1] = (wv[0] - 0.5) * P.lift * amt; off[k * 3 + 2] = -gz / gl * dsp * amt;
    }
    if (T.crack) shade[k] = lerp(1, T.crack.dark + (1 - T.crack.dark) * sstep(0, P.crackWide, wv[1]) * (0.7 + 0.3 * sstep(0, P.crackFine, wf[1])), st);
  }
  // 삼각형(칸마다 대각선을 번갈아) — 민 뒤에 뒤집히거나 접힌 것은 그 꼭짓점의 밀기를 반씩 줄이고, passes 번을 넘기면 0 으로(접힌 것이 없을 때까지)
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
  for (let j = 0, o = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    if ((i + j) & 1) { idx[o++] = a; idx[o++] = c; idx[o++] = b; idx[o++] = b; idx[o++] = c; idx[o++] = d; } else { idx[o++] = a; idx[o++] = c; idx[o++] = d; idx[o++] = a; idx[o++] = d; idx[o++] = b; }
  }
  const px = (k, m) => T.x0 + k % nx + off[k * 3] * m, py = (k, m) => h[k] + off[k * 3 + 1] * m, pz = (k, m) => T.z0 + Math.floor(k / nx) + off[k * 3 + 2] * m;
  const normal = (a, b, c, m, out) => {
    const ux = px(b, m) - px(a, m), uy = py(b, m) - py(a, m), uz = pz(b, m) - pz(a, m), vx = px(c, m) - px(a, m), vy = py(c, m) - py(a, m), vz = pz(c, m) - pz(a, m);
    out[0] = uy * vz - uz * vy; out[1] = uz * vx - ux * vz; out[2] = ux * vy - uy * vx;
    return out;
  };
  const moved = (k) => off[k * 3] !== 0 || off[k * 3 + 1] !== 0 || off[k * 3 + 2] !== 0, n0 = [0, 0, 0], n1 = [0, 0, 0];
  for (let pass = 0, found = 1; T.push && found > 0; pass++) {
    const bad = new Uint8Array(n);
    found = 0;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2];
      if (!moved(a) && !moved(b) && !moved(c)) continue;
      normal(a, b, c, 0, n0); normal(a, b, c, 1, n1);
      const dot = n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2], l2 = (n0[0] * n0[0] + n0[1] * n0[1] + n0[2] * n0[2]) * (n1[0] * n1[0] + n1[1] * n1[1] + n1[2] * n1[2]);
      if (dot <= P.minDot * Math.sqrt(l2)) { bad[a] = bad[b] = bad[c] = 1; found++; }
    }
    const keep = pass < P.passes ? 0.5 : 0;
    for (let k = 0; k < n; k++) if (bad[k]) { off[k * 3] *= keep; off[k * 3 + 1] *= keep; off[k * 3 + 2] *= keep; }
  }
  for (let k = 0; k < n; k++) { pos[k * 3] = px(k, 1); pos[k * 3 + 1] = py(k, 1); pos[k * 3 + 2] = pz(k, 1); }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, x = T.x0 + i, z = T.z0 + j, y = h[k];
    const e = (clamp(j, 0, nz - 1) * nx + clamp(i + 1, 0, nx - 1)) * 3, w = (j * nx + clamp(i - 1, 0, nx - 1)) * 3, s = (clamp(j + 1, 0, nz - 1) * nx + i) * 3, q = (clamp(j - 1, 0, nz - 1) * nx + i) * 3;
    const ax = pos[e] - pos[w], ay = pos[e + 1] - pos[w + 1], az = pos[e + 2] - pos[w + 2], bx = pos[s] - pos[q], by = pos[s + 1] - pos[q + 1], bz = pos[s + 2] - pos[q + 2];
    const cx = by * az - bz * ay, cy = bz * ax - bx * az, cz = bx * ay - by * ax, cl = Math.sqrt(cx * cx + cy * cy + cz * cz) || 1;
    nor[k * 3] = cx / cl; nor[k * 3 + 1] = cy / cl; nor[k * 3 + 2] = cz / cl;
    axis[k] = dominantAxis(cx, cy, cz);
    // 지형 겹: 자갈(낮은 곳 · 길) · 풀(평평하고 높은 곳) · 젖음(물가 · 가파른 면)
    const pd = pathDist(T, x, z);
    const pebble = Math.max(sstep(L.pebbleTop, L.pebbleFull, y + (fbm2(x * 0.2, z * 0.2, 2, salt + 53) - 0.5) * L.pebbleNoise), sstep(2.6, 1.2, pd) * L.pathPebble);
    const turf = sstep(L.turfFlat, L.turfFull, flat[k]) * sstep(L.turfFrom, L.turfTo, y) * (0.55 + 0.9 * fbm2(x * 0.06 + 5, z * 0.06, 3, salt + 59)) * sstep(1.4, 3, pd);
    const wet = sstep(L.wetTop, L.wetFull, y) * 0.95 + L.wetNoise * fbm2(x * 0.09 + 20, z * 0.09, 2, salt + 61) + (1 - flat[k]) * L.wetSteep;
    lay[k * 4] = Math.round(clamp(pebble, 0, 1) * 255); lay[k * 4 + 1] = Math.round(clamp(turf, 0, 1) * 255); lay[k * 4 + 2] = Math.round(clamp(wet, 0, 1) * 255);
  }
  return { pos, nor, lay, shade, axis, idx, steep };
}
