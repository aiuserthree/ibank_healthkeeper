// 주는 것: 세계를 모으는 통 — makeBuild · addMesh(정적 묶음: 재질 × 색조 × 32m 칸) · makePart(따로 그리는 조각의 한 부분) · mergeParts(같은 재질 · 색조의 부분 합치기) ·
//   addSolid(충돌 삼각형 + 임자) · vertexData(꼭짓점 색 · 주된 입힘 축) · SURF(표면 종류 이름 — 발소리 · 착탄이 읽는다) + (x, z) 위의 면 찾기 다섯:
//   landAt(민 뒤의 땅 높이 — 조각 · 등불이 이것으로 높이를 잡는다) · groundAt(지형 면) · groundFlat(그 면이 누운 정도) · groundHits(지형 수직선이 만나는 높이 전부) ·
//   topAt(가장 높은 충돌 면) · floorAt(설 수 있는 가장 낮은 바닥 — 표식이 다 이것으로 높이를 잡는다).
// 받는 것: noise · mesh · terrain(밀기 전 높이) · tune/world · tune/bake(사람 키 · 물 깊이 — 걷기 격자와 같은 값). 꼭짓점 속성 둘을 여기서 만든다:
//   col(Uint8 ×4) = 앞 세 칸이 같은 값인 「약한 얼룩」(1 − blotch.depth ~ 1 — 자리의 느린 잡음 + 돌 · 판자마다의 밝기. 색조는 여기 없다: 묶음 · 부분의 tint 가 색조다 —
//     재질(F2a)이 무늬에 tint 를 곱하고 이 얼룩으로 반복을 깬다) · 넷째 칸 = 그늘(틈 · 밑동, 255 = 없음)
//   axis(Uint8) = 「주된 입힘 축」(법선의 가장 큰 축: 0 x · 1 y · 2 z — 값싼 경로는 이 축으로 무늬를 한 번만 읽는다. flat 으로 넘겨 삼각형마다 한 축).
// 충돌 삼각형의 임자(owner): 0 = 지형 · 1 = 바위 · 2 + k = 레시피의 kit[k] — 검증(맞닿은 조각 · 벽 속 표식)이 조각을 가리킬 때 읽는다.
// 칸 통(bins): 충돌 삼각형을 넣을 때마다 그것이 걸치는 bin(2m) 칸에 번호를 적어 둔다. 면을 찾을 때는 그 자리의 칸 하나만 훑는다 —
//   전부 훑으면 임무 크기(충돌 21만)에서 한 번에 3ms 라 바위 · 표식 수만큼 부를 수 없다. 지형이 맨 먼저 들어가므로 칸마다 앞쪽이 지형 삼각형이다(groundEnd 앞).
import { clamp, lerp, sstep, fbm3 } from '../geom/noise.js';
import { dominantAxis } from '../geom/mesh.js';
import { heightAt } from './terrain.js';
import { WORLD } from '../tune/world.js';
import { BAKE } from '../tune/bake.js';

export const SURF = Object.freeze(['rock', 'gravel', 'wet', 'turf', 'wood', 'iron', 'stone', 'glass', 'rubber', 'rope']);
// 삼각형의 모서리에 꼭 걸친 자리를 놓치지 않게 두는 틈(무게 중심 좌표)
const EDGE = 1e-9;

export function makeBuild(recipe, salt) {
  const w = recipe.size[0], d = recipe.size[1], nx = Math.ceil(w / WORLD.bin), nz = Math.ceil(d / WORLD.bin);
  return {
    x0: -w / 2, z0: -d / 2, cx: Math.ceil(w / WORLD.cell), cz: Math.ceil(d / WORLD.cell), salt, batches: [], byKey: new Map(),
    solid: { pos: [], idx: [], surf: [], owner: [] }, bins: { nx, nz, cells: Array.from({ length: nx * nz }, () => []) }, groundEnd: 0, hits: [],
  };
}

// o = { shade: 꼭짓점마다의 그늘(없으면 1) · low: 밑동을 어둡게 하는 정도(0 ~ 1 — 맨 아래에서 이만큼 어둡고 위로 가며 풀린다) ·
//       tone: 이 덩이의 밝기(0 ~ 1 — 돌 · 판자마다 다르게) · grain: 제 좌표로 두는 형상의 얼룩 배율(없으면 세계 좌표 그대로) }
export function vertexData(mesh, o, salt) {
  const n = mesh.pos.length / 3, col = new Uint8Array(n * 4), axis = new Uint8Array(n), B = WORLD.blotch, g = (o.grain || 1) / B.size;
  let y0 = Infinity, y1 = -Infinity;
  for (let v = 0; v < n; v++) { y0 = Math.min(y0, mesh.pos[v * 3 + 1]); y1 = Math.max(y1, mesh.pos[v * 3 + 1]); }
  for (let v = 0; v < n; v++) {
    const x = mesh.pos[v * 3], y = mesh.pos[v * 3 + 1], z = mesh.pos[v * 3 + 2], up = o.low ? (y - y0) / Math.max(1e-6, y1 - y0) : 1;
    const noise = sstep(B.from, B.to, fbm3(x * g, y * g, z * g, 3, salt)), mix = o.tone == null ? noise : (noise + o.tone) / 2;
    col[v * 4] = col[v * 4 + 1] = col[v * 4 + 2] = Math.round((1 - B.depth * (1 - clamp(mix, 0, 1))) * 255);
    col[v * 4 + 3] = Math.round(clamp((o.shade ? o.shade[v] : 1) * (o.low ? lerp(1 - o.low, 1, up) : 1), 0, 1) * 255);
    axis[v] = dominantAxis(mesh.nor[v * 3], mesh.nor[v * 3 + 1], mesh.nor[v * 3 + 2]);
  }
  return { col, axis };
}

// 충돌 삼각형을 넣고 칸 통에 적는다(삼각형의 xz 테두리 상자가 걸치는 칸 전부 — 세계 밖으로 나간 것은 가장자리 칸에). owner = 임자(머리 주석)
export function addSolid(B, mesh, surf, owner) {
  const S = B.solid, N = B.bins, P = mesh.pos, base = S.pos.length / 3, first = S.idx.length, size = WORLD.bin;
  for (let i = 0; i < P.length; i++) S.pos.push(P[i]);
  for (let i = 0; i < mesh.idx.length; i++) S.idx.push(mesh.idx[i] + base);
  for (let t = 0; t < mesh.idx.length; t += 3) {
    const a = mesh.idx[t] * 3, b = mesh.idx[t + 1] * 3, c = mesh.idx[t + 2] * 3;
    const i0 = clamp(Math.floor((Math.min(P[a], P[b], P[c]) - B.x0) / size), 0, N.nx - 1), i1 = clamp(Math.floor((Math.max(P[a], P[b], P[c]) - B.x0) / size), 0, N.nx - 1);
    const j0 = clamp(Math.floor((Math.min(P[a + 2], P[b + 2], P[c + 2]) - B.z0) / size), 0, N.nz - 1), j1 = clamp(Math.floor((Math.max(P[a + 2], P[b + 2], P[c + 2]) - B.z0) / size), 0, N.nz - 1);
    S.surf.push(typeof surf === 'number' ? surf : surf[t / 3]); S.owner.push(owner);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) N.cells[j * N.nx + i].push(first + t);
  }
}

// (x, z) 의 수직선이 충돌 삼각형 [0, end) 와 만나는 곳을 B.hits 에 [높이, 위를 보는 면인가(1 · 0), 삼각형 번호] 셋씩 채우고 만난 수를 돌려준다. 세계 밖 · 틀린 수는 0.
function scan(B, x, z, end) {
  const N = B.bins, i = Math.floor((x - B.x0) / WORLD.bin), j = Math.floor((z - B.z0) / WORLD.bin), P = B.solid.pos, I = B.solid.idx, out = B.hits;
  if (!(i >= 0 && i < N.nx && j >= 0 && j < N.nz)) return 0;
  const list = N.cells[j * N.nx + i];
  let n = 0;
  for (let k = 0; k < list.length && list[k] < end; k++) {
    const t = list[k], a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const d = (P[b + 2] - P[c + 2]) * (P[a] - P[c]) + (P[c] - P[b]) * (P[a + 2] - P[c + 2]);
    if (d === 0) continue;
    const u = ((P[b + 2] - P[c + 2]) * (x - P[c]) + (P[c] - P[b]) * (z - P[c + 2])) / d, v = ((P[c + 2] - P[a + 2]) * (x - P[c]) + (P[a] - P[c]) * (z - P[c + 2])) / d;
    if (!(u >= -EDGE && v >= -EDGE && u + v <= 1 + EDGE)) continue;
    out[n * 3] = u * P[a + 1] + v * P[b + 1] + (1 - u - v) * P[c + 1];
    out[n * 3 + 1] = d < 0 ? 1 : 0;
    out[n * 3 + 2] = t;
    n++;
  }
  return n;
}

// 지형(가로로 민 뒤의 꼭짓점)의 수직선이 만나는 높이들 — B.hits 의 셋마다 첫 칸에 n 개(처마가 있으면 한 자리에 면이 셋이다). 바위가 땅속인지 볼 때 쓴다.
export function groundHits(B, x, z) { return scan(B, x, z, B.groundEnd); }

// 지형의 위를 보는 면 가운데 높이 near 에 가장 가까운 것이 B.hits 의 몇째인가(없으면 −1)
function nearest(B, x, z, near) {
  const n = scan(B, x, z, B.groundEnd), H = B.hits;
  let best = -1;
  for (let k = 0; k < n; k++) if (H[k * 3 + 1] === 1 && (best < 0 || Math.abs(H[k * 3] - near) < Math.abs(H[best * 3] - near))) best = k;
  return best;
}

// 지형의 위를 보는 면 가운데 높이 near 에 가장 가까운 것(처마 밑에 놓을 것은 처마 밑에, 위에 놓을 것은 위에). 그 자리에 지형이 없으면 null.
export function groundAt(B, x, z, near) {
  const k = nearest(B, x, z, near);
  return k < 0 ? null : B.hits[k * 3];
}

// 그 면이 누운 정도: 법선의 위쪽 성분(1 = 평지 · 0 = 수직 벽). 지형이 없으면 0 — 바위를 가파른 면에 붙이지 않으려고 본다.
export function groundFlat(B, x, z, near) {
  const k = nearest(B, x, z, near), P = B.solid.pos, I = B.solid.idx;
  if (k < 0) return 0;
  const t = B.hits[k * 3 + 2], a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
  const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  return ny / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1);
}

// 민 뒤의 땅 높이: 그리는 지형 · 충돌과 같은 면에서 잡는다(격자의 높이 heightAt 은 가로로 밀기 전이라 절벽에서는 그림과 어긋난다).
// 면이 여럿이면 밀기 전 높이에 가장 가까운 것, 지형이 없는 자리(가장자리가 밀려 빈 곳)는 밀기 전 높이.
export function landAt(B, T, x, z) {
  const before = heightAt(T, x, z), y = groundAt(B, x, z, before);
  return y === null ? before : y;
}

// (x, z) 위에 놓인 충돌 면(지형 · 바위 · 조각) 가운데 가장 높은 높이. 없으면 null — 물건을 「밑에 있는 것 위에」 올릴 때 쓴다.
export function topAt(B, x, z) {
  const n = scan(B, x, z, Infinity), H = B.hits;
  let best = null;
  for (let k = 0; k < n; k++) if (best === null || H[k * 3] > best) best = H[k * 3];
  return best;
}

// 설 수 있는 가장 낮은 바닥(표식의 높이 규칙 하나 — 걷기 격자(shared/bake/nav.js)가 「걷는 칸」을 고르는 것과 같은 눈으로 본다): 위를 보는 충돌 면 가운데
//   ① 걸어 들어갈 수 없게 깊은 물속이 아니고 ② 바로 위의 면이 또 위를 보는 면이 아니며(그러면 덩이 속이다) ③ 머리 위로 사람 키만큼 비어 있는 것. 없으면 null.
//   탑 발치의 표식은 땅에(난간 바닥이 아니라), 지붕 밑의 표식은 방바닥에 선다. top 이 참이면 가장 높은 바닥(부두 밑의 얕은 물이 아니라 부두 위 — 레시피의 표식 끝에 'top').
//   돌담 줄 위의 표식은 돌담 위에 선다 — 그런 것은 굽기 검증이 「벽 속 표식」으로 잡는다.
export function floorAt(B, x, z, sea, top) {
  const n = scan(B, x, z, Infinity), H = B.hits;
  let best = null;
  for (let k = 0; k < n; k++) {
    const y = H[k * 3];
    if (H[k * 3 + 1] !== 1 || y < sea - BAKE.nav.wade || (best !== null && (top ? y <= best : y >= best))) continue;
    let above = Infinity, up = 0;
    for (let m = 0; m < n; m++) if (H[m * 3] > y + BAKE.nav.unit && H[m * 3] < above) { above = H[m * 3]; up = H[m * 3 + 1]; }
    if (up !== 1 && above - y >= BAKE.nav.height) best = y;
  }
  return best;
}

// 세계 좌표의 형상을 「재질 × 색조 × 형상 가운데가 든 32m 칸」 묶음에 붙인다. o.tint = 색조 [r, g, b] · o.solid = 표면 종류 번호(충돌에 넣는다 — o.owner = 임자) · o.lay = 지형 겹.
export function addMesh(B, mat, mesh, o) {
  let ax = 0, az = 0;
  for (let v = 0; v < mesh.pos.length; v += 3) { ax += mesh.pos[v]; az += mesh.pos[v + 2]; }
  const n = mesh.pos.length / 3, cell = WORLD.cell;
  const ci = clamp(Math.floor((ax / n - B.x0) / cell), 0, B.cx - 1), cj = clamp(Math.floor((az / n - B.z0) / cell), 0, B.cz - 1), key = mat + '|' + o.tint.join(',') + '|' + (cj * B.cx + ci);
  let b = B.byKey.get(key);
  if (!b) { b = { mat, tint: o.tint.slice(), cell: cj * B.cx + ci, pos: [], nor: [], col: [], axis: [], lay: o.lay ? [] : null, idx: [] }; B.byKey.set(key, b); B.batches.push(b); }
  const base = b.pos.length / 3, data = vertexData(mesh, o, B.salt);
  for (let i = 0; i < mesh.pos.length; i++) { b.pos.push(mesh.pos[i]); b.nor.push(mesh.nor[i]); }
  for (let i = 0; i < data.col.length; i++) b.col.push(data.col[i]);
  for (let i = 0; i < n; i++) b.axis.push(data.axis[i]);
  for (let i = 0; o.lay && i < o.lay.length; i++) b.lay.push(o.lay[i]);
  for (let i = 0; i < mesh.idx.length; i++) b.idx.push(mesh.idx[i] + base);
  if (o.solid != null) addSolid(B, mesh, o.solid, o.owner);
}

// 제 좌표로 두는 형상(인스턴스 원형 · 따로 그리는 조각)의 한 부분 — 얼룩은 제 좌표에서 뽑는다(자리가 정해지지 않았다 · 작은 것이라 결을 blotch.own 배 잘게)
export function makePart(mat, mesh, o, salt) {
  const data = vertexData(mesh, { ...o, grain: WORLD.blotch.own }, salt);
  return { mat, tint: o.tint.slice(), pos: mesh.pos, nor: mesh.nor, col: data.col, axis: data.axis, idx: mesh.idx };
}

// 따로 그리는 조각의 부분들을 재질 · 색조가 같은 것끼리 하나로 합친다(처음 나온 차례) — 부분 하나가 그리기 호출 하나라서다(등롱 9 → 3).
export function mergeParts(parts) {
  const out = [], slot = new Map();
  for (const p of parts) {
    const key = p.mat + '|' + p.tint.join(',');
    if (!slot.has(key)) { slot.set(key, out.length); out.push({ mat: p.mat, tint: p.tint, pos: [], nor: [], col: [], axis: [], idx: [] }); }
    const m = out[slot.get(key)], base = m.pos.length / 3;
    for (let i = 0; i < p.pos.length; i++) { m.pos.push(p.pos[i]); m.nor.push(p.nor[i]); }
    for (let i = 0; i < p.col.length; i++) m.col.push(p.col[i]);
    for (let i = 0; i < p.axis.length; i++) m.axis.push(p.axis[i]);
    for (let i = 0; i < p.idx.length; i++) m.idx.push(p.idx[i] + base);
  }
  return out.map((m) => ({ mat: m.mat, tint: m.tint, pos: Float32Array.from(m.pos), nor: Float32Array.from(m.nor), col: Uint8Array.from(m.col), axis: Uint8Array.from(m.axis), idx: Uint32Array.from(m.idx) }));
}
