// 주는 것: 세계를 모으는 통 — makeBuild · addMesh(정적 묶음: 재질 × 32m 칸) · makePart(따로 그리는 조각의 한 부분) · addSolid(충돌 삼각형) ·
//   topAt(그 자리에서 가장 높은 충돌 면) · vertexData(꼭짓점 색 · 주된 입힘 축) · SURF(표면 종류 이름 — 발소리 · 착탄이 읽는다).
// 받는 것: noise · mesh · tune/world. 꼭짓점 속성 둘을 여기서 만든다:
//   col(Uint8 ×4) = 색조 × 「큰 얼룩」(세계 좌표의 느린 잡음 — 값싼 경로가 반복 깨기를 무늬 읽기 없이 얻는다) · 넷째 칸 = 그늘(틈 · 밑동, 255 = 없음)
//   axis(Uint8) = 「주된 입힘 축」(법선의 가장 큰 축: 0 x · 1 y · 2 z — 값싼 경로는 이 축으로 무늬를 한 번만 읽는다. flat 으로 넘겨 삼각형마다 한 축).
import { clamp, lerp, sstep, fbm3 } from '../geom/noise.js';
import { dominantAxis } from '../geom/mesh.js';
import { WORLD } from '../tune/world.js';

export const SURF = Object.freeze(['rock', 'gravel', 'wet', 'turf', 'wood', 'iron', 'stone', 'glass']);

export function makeBuild(recipe, salt) {
  const w = recipe.size[0], d = recipe.size[1];
  return { x0: -w / 2, z0: -d / 2, cx: Math.ceil(w / WORLD.cell), cz: Math.ceil(d / WORLD.cell), salt, batches: [], byKey: new Map(), solid: { pos: [], idx: [], surf: [] } };
}

// o = { tint: [r, g, b], tint2: 밑동 색(있으면 아래 → 위로 섞는다), shade: 꼭짓점마다의 그늘(없으면 1), blotch: 큰 얼룩을 굽는가 }
export function vertexData(mesh, o, salt) {
  const n = mesh.pos.length / 3, col = new Uint8Array(n * 4), axis = new Uint8Array(n), B = WORLD.blotch;
  let y0 = Infinity, y1 = -Infinity;
  for (let v = 0; v < n; v++) { y0 = Math.min(y0, mesh.pos[v * 3 + 1]); y1 = Math.max(y1, mesh.pos[v * 3 + 1]); }
  for (let v = 0; v < n; v++) {
    const x = mesh.pos[v * 3], y = mesh.pos[v * 3 + 1], z = mesh.pos[v * 3 + 2], up = o.tint2 ? (y - y0) / Math.max(1e-6, y1 - y0) : 1;
    const big = o.blotch === false ? 1 : lerp(B.lo, B.hi, sstep(B.from, B.to, fbm3(x / B.size, y / B.size, z / B.size, 3, salt)));
    for (let c = 0; c < 3; c++) col[v * 4 + c] = Math.round(clamp((o.tint2 ? lerp(o.tint2[c], o.tint[c], up) : o.tint[c]) * big, 0, 1) * 255);
    col[v * 4 + 3] = Math.round(clamp(o.shade ? o.shade[v] : 1, 0, 1) * 255);
    axis[v] = dominantAxis(mesh.nor[v * 3], mesh.nor[v * 3 + 1], mesh.nor[v * 3 + 2]);
  }
  return { col, axis };
}

export function addSolid(B, mesh, surf) {
  const S = B.solid, base = S.pos.length / 3;
  for (let i = 0; i < mesh.pos.length; i++) S.pos.push(mesh.pos[i]);
  for (let i = 0; i < mesh.idx.length; i++) S.idx.push(mesh.idx[i] + base);
  for (let t = 0; t < mesh.idx.length; t += 3) S.surf.push(typeof surf === 'number' ? surf : surf[t / 3]);
}

// 세계 좌표의 형상을 「재질 × 형상 가운데가 든 32m 칸」 묶음에 붙인다. o.solid = 표면 종류 번호(충돌에 넣는다) · 없으면 그림만. o.lay = 지형 겹.
export function addMesh(B, mat, mesh, o) {
  let ax = 0, az = 0;
  for (let v = 0; v < mesh.pos.length; v += 3) { ax += mesh.pos[v]; az += mesh.pos[v + 2]; }
  const n = mesh.pos.length / 3, cell = WORLD.cell;
  const ci = clamp(Math.floor((ax / n - B.x0) / cell), 0, B.cx - 1), cj = clamp(Math.floor((az / n - B.z0) / cell), 0, B.cz - 1), key = mat + '|' + (cj * B.cx + ci);
  let b = B.byKey.get(key);
  if (!b) { b = { mat, cell: cj * B.cx + ci, pos: [], nor: [], col: [], axis: [], lay: o.lay ? [] : null, idx: [] }; B.byKey.set(key, b); B.batches.push(b); }
  const base = b.pos.length / 3, data = vertexData(mesh, o, B.salt);
  for (let i = 0; i < mesh.pos.length; i++) { b.pos.push(mesh.pos[i]); b.nor.push(mesh.nor[i]); }
  for (let i = 0; i < data.col.length; i++) b.col.push(data.col[i]);
  for (let i = 0; i < n; i++) b.axis.push(data.axis[i]);
  for (let i = 0; o.lay && i < o.lay.length; i++) b.lay.push(o.lay[i]);
  for (let i = 0; i < mesh.idx.length; i++) b.idx.push(mesh.idx[i] + base);
  if (o.solid != null) addSolid(B, mesh, o.solid);
}

// 제 좌표로 두는 형상(인스턴스 원형 · 따로 그리는 조각)의 한 부분 — 큰 얼룩은 굽지 않는다(자리가 정해지지 않았다)
export function makePart(mat, mesh, o) {
  const data = vertexData(mesh, { ...o, blotch: false }, 0);
  return { mat, pos: mesh.pos, nor: mesh.nor, col: data.col, axis: data.axis, idx: mesh.idx };
}

// (x, z) 위에 놓인 충돌 면 가운데 가장 높은 높이. 없으면 null — 물건을 「밑에 있는 것 위에」 올릴 때 쓴다.
export function topAt(B, x, z) {
  const P = B.solid.pos, I = B.solid.idx;
  let best = null;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const d = (P[b + 2] - P[c + 2]) * (P[a] - P[c]) + (P[c] - P[b]) * (P[a + 2] - P[c + 2]);
    if (d === 0) continue;
    const u = ((P[b + 2] - P[c + 2]) * (x - P[c]) + (P[c] - P[b]) * (z - P[c + 2])) / d, v = ((P[c + 2] - P[a + 2]) * (x - P[c]) + (P[a] - P[c]) * (z - P[c + 2])) / d;
    if (u < 0 || v < 0 || u + v > 1) continue;
    const y = u * P[a + 1] + v * P[b + 1] + (1 - u - v) * P[c + 1];
    if (best === null || y > best) best = y;
  }
  return best;
}
