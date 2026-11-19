// 주는 것: 세계 생성 — genSteps(레시피 → 세계. 조각내 돌릴 수 있는 function* — 굽기(F1b)가 뒤에 이어 붙는다) · generate(끝까지) · hashWorld · WORLD_VERSION.
// 받는 것: recipe(검사) · terrain · rocks · kit · build · shapes · rng · state(해시) · tune/world. three · DOM 을 모른다 — Node · 크롬 · 워커가 같은 비트를 낸다.
// 세계(일반 객체 · 배열 · 형식 배열만 — 워커에서 넘겨받을 수 있고 hashState 로 해시한다):
//   batches[]  그릴 묶음(재질 × 32m 칸): { mat, cell(칸 번호 = 세로 칸 × 가로 칸 수 + 가로 칸), pos · nor(Float32 ×3), col(Uint8 ×4: 색조 × 큰 얼룩 · 그늘),
//              axis(Uint8: 주된 입힘 축), lay(지형만 Uint8 ×4: 자갈 · 풀 · 젖음 · 예비 — 다른 재질은 null), idx(Uint32) }
//   protos[] · instances[]  인스턴스 원형(제 좌표의 형상)과 줄(xf: Float32 ×8 — rocks.js 머리 주석) · props[]  따로 그리는 조각(과녁): { piece, at, yaw, lean, parts[] }
//   collide    충돌 삼각형: { pos, idx, surf(삼각형마다 표면 종류 번호 — world.surf 의 이름 차례) } — 그림에서 나온다(잔 소품 · 0.8m 아래 바위는 뺀다)
//   lights[]   등불: { at, color, radius, mode: 'on' | 'switch' | 'break', group(묶음 번호 · 늘 켜짐은 −1), piece }
//   marks      { spawn: { at, yaw }, stations[{ id, at, yaw, pitch }](책갈피 — 눈 자리 · 라디안), targets[{ kind, at, prop, light }], points{ 이름: [x, y, z] } }
//   grid       가로 밀기 전의 땅 높이(1m 격자 · Float32) · zones · stats(삼각형 · 꼭짓점 · 인스턴스 수) · surf(표면 종류 이름)
import { PI, dsin, dcos } from '../dmath.js';
import { makeRng, seedFrom } from '../rng.js';
import { hashState } from '../state.js';
import { xf } from '../geom/shapes.js';
import { checkRecipe } from './recipe.js';
import { makeTerrain, applyOp, meshTerrain, heightAt } from './terrain.js';
import { rockProtos, scatterRocks } from './rocks.js';
import { PIECES, LAMP, parseLit } from './kit.js';
import { makeBuild, addMesh, addSolid, topAt, SURF } from './build.js';
import { WORLD } from '../tune/world.js';

export const WORLD_VERSION = 1;
const DEG = PI / 180;

// 지형 꼭짓점을 32m 칸마다 한 묶음으로 나눠 넣고(이음매의 꼭짓점은 두 칸이 같은 값을 따로 가진다) 전체를 충돌에 넣는다
function addTerrain(B, T, tm) {
  const { nx, nz } = T, cell = WORLD.cell, surf = new Uint8Array(tm.idx.length / 3);
  for (let t = 0; t < surf.length; t++) {
    const k = tm.idx[t * 3];
    surf[t] = tm.steep[k] > 0.5 ? 0 : tm.lay[k * 4] > 127 ? (tm.lay[k * 4 + 2] > 200 ? 2 : 1) : tm.lay[k * 4 + 1] > 127 ? 3 : 0;
  }
  addSolid(B, tm, surf);
  for (let j0 = 0; j0 < nz - 1; j0 += cell) for (let i0 = 0; i0 < nx - 1; i0 += cell) {
    const w = Math.min(cell, nx - 1 - i0) + 1, d = Math.min(cell, nz - 1 - j0) + 1, n = w * d;
    const mesh = { pos: new Float32Array(n * 3), nor: new Float32Array(n * 3), idx: new Uint32Array((w - 1) * (d - 1) * 6) }, lay = new Uint8Array(n * 4), shade = new Float32Array(n);
    for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) {
      const k = j * w + i, g = (j0 + j) * nx + i0 + i;
      for (let c = 0; c < 3; c++) { mesh.pos[k * 3 + c] = tm.pos[g * 3 + c]; mesh.nor[k * 3 + c] = tm.nor[g * 3 + c]; }
      for (let c = 0; c < 4; c++) lay[k * 4 + c] = tm.lay[g * 4 + c];
      shade[k] = tm.shade[g];
    }
    for (let j = 0, o = 0; j < d - 1; j++) for (let i = 0; i < w - 1; i++) {
      const a = j * w + i, b = a + 1, c = a + w, e = c + 1, order = (i0 + i + j0 + j) & 1 ? [a, c, b, b, c, e] : [a, c, e, a, e, b];
      for (const v of order) mesh.idx[o++] = v;
    }
    addMesh(B, 'ground', mesh, { tint: [1, 1, 1], shade, lay });
  }
}

// 바위를 비워 둘 자리: [x0, z0, x1, z1, 반지름](점은 길이 0 인 선분) — 표식 · 조각(선 조각은 선분마다 · 부두처럼 뻗는 조각은 뻗는 쪽으로)
function keepOut(recipe) {
  const out = [], m = recipe.marks, dot = (p, r) => out.push([p[0], p[1], p[0], p[1], r]);
  for (const p of [m.spawn, ...Object.values(m.stations || {}), ...Object.values(m.points || {})]) dot(p, WORLD.kit.clear);
  for (const it of recipe.kit) {
    const def = PIECES[it.piece];
    if (def.line) for (let s = 0; s + 1 < it.line.length; s++) out.push([it.line[s][0], it.line[s][1], it.line[s + 1][0], it.line[s + 1][1], def.clear]);
    else if (def.reach) {
      const len = it[def.reach] || 0, yaw = (it.rot || 0) * DEG;
      out.push([it.at[0], it.at[1], it.at[0] + dsin(yaw) * len, it.at[1] + dcos(yaw) * len, def.clear]);
    } else dot(it.at, def.clear);
  }
  return out;
}

function placePiece(G, it, index) {
  const def = PIECES[it.piece];
  const K = { B: G.B, T: G.T, it, salt: G.salt + 101 * (index + 1), rng: makeRng(seedFrom(G.salt, 'kit' + index)), lights: G.lights, lit: -1, prop: null, frame: xf(0, 0, 0) };
  if (def.line) { def.make(K, it); return; }
  const x = it.at[0], z = it.at[1], top = it.on === 'top' ? topAt(G.B, x, z) : null;
  const y = (def.sea ? G.recipe.sea : top !== null ? top : heightAt(G.T, x, z)) + (it.up || 0), yaw = (it.rot || 0) * DEG, lean = (it.lean || 0) * DEG;
  K.frame = xf(x, y, z, 0, yaw, lean);
  if (it.target) K.prop = { piece: it.piece, at: [x, y, z], yaw, lean, parts: [] };
  def.make(K, it);
  if (!K.prop) return;
  G.targets.push({ kind: it.piece, at: [x, y + def.aim, z], prop: G.props.length, light: K.lit });
  G.props.push(K.prop);
}

function finish(G) {
  const { recipe, T, B } = G, m = recipe.marks, count = (list, per) => list.reduce((sum, b) => sum + b.idx.length / per, 0);
  // 책갈피 · 시작 자리의 높이: 그 자리에서 가장 높은 충돌 면(부두 위에 서면 부두 높이) — 책갈피는 거기에 눈높이를 더한다
  const stand = (p) => { const top = topAt(B, p[0], p[1]); return top !== null ? top : heightAt(T, p[0], p[1]); };
  const batches = B.batches.map((b) => ({
    mat: b.mat, cell: b.cell, pos: Float32Array.from(b.pos), nor: Float32Array.from(b.nor), col: Uint8Array.from(b.col), axis: Uint8Array.from(b.axis),
    lay: b.lay ? Uint8Array.from(b.lay) : null, idx: Uint32Array.from(b.idx),
  }));
  const protos = G.protos.map((p) => ({ name: p.name, ...p.part })), instances = G.inst.map((list, k) => ({ proto: k, xf: Float32Array.from(list) }));
  const collide = { pos: Float32Array.from(B.solid.pos), idx: Uint32Array.from(B.solid.idx), surf: Uint8Array.from(B.solid.surf) };
  const marks = {
    spawn: { at: [m.spawn[0], stand(m.spawn), m.spawn[1]], yaw: (m.spawn[2] || 0) * DEG },
    stations: Object.entries(m.stations || {}).map(([id, p]) => ({ id, at: [p[0], stand(p) + WORLD.eye, p[1]], yaw: (p[2] || 0) * DEG, pitch: (p[3] || 0) * DEG })),
    targets: G.targets, points: Object.fromEntries(Object.entries(m.points || {}).map(([id, p]) => [id, [p[0], heightAt(T, p[0], p[1]), p[1]]])),
  };
  const instCount = instances.reduce((sum, g) => sum + g.xf.length / 8, 0), instTris = instances.reduce((sum, g) => sum + g.xf.length / 8 * protos[g.proto].idx.length / 3, 0);
  const propTris = G.props.reduce((sum, p) => sum + count(p.parts, 3), 0), tris = count(batches, 3);
  const stats = {
    tris, verts: batches.reduce((sum, b) => sum + b.pos.length / 3, 0), batches: batches.length, staticRocks: G.count.staticRocks, instances: instCount, instTris,
    props: G.props.length, propTris, drawTris: tris + instTris + propTris, collideTris: collide.idx.length / 3, lights: G.lights.length,
  };
  return {
    v: WORLD_VERSION, id: recipe.id, seed: recipe.seed, size: recipe.size.slice(), origin: [T.x0, T.z0], sea: recipe.sea, sky: recipe.sky || '', cell: WORLD.cell,
    grid: { nx: T.nx, nz: T.nz, h: Float32Array.from(T.h) }, surf: SURF.slice(), batches, protos, instances, props: G.props, collide, lights: G.lights,
    marks, zones: recipe.zones || [], stats,
  };
}

export function* genSteps(recipe) {
  const problems = checkRecipe(recipe);
  if (problems.length) throw new Error('레시피 검사 실패 — ' + problems.map((p) => `[${p.code}] ${p.msg}`).join(' / '));
  const salt = seedFrom(recipe.seed, 'world:' + recipe.id), T = makeTerrain(recipe, salt), B = makeBuild(recipe, salt);
  for (const op of recipe.terrain) applyOp(T, op);
  yield 'height';
  addTerrain(B, T, meshTerrain(T));
  yield 'terrain';
  const G = { recipe, salt, T, B, protos: rockProtos(salt), inst: [], keep: keepOut(recipe), lights: [], props: [], targets: [], count: { staticRocks: 0 } };
  for (let k = 0; k < WORLD.rock.kinds; k++) G.inst.push([]);
  (recipe.scatter || []).forEach((item, i) => scatterRocks(G, item, i));
  yield 'rocks';
  recipe.kit.forEach((it, i) => placePiece(G, it, i));
  for (const it of recipe.lights || []) {
    const lit = parseLit(it.lit), at = [it.at[0], heightAt(T, it.at[0], it.at[1]) + (it.up || 0), it.at[1]];
    G.lights.push({ at, color: LAMP[it.color || 'warm'].slice(), radius: it.radius || WORLD.kit.lightRadius, mode: lit.mode, group: lit.group, piece: '' });
  }
  yield 'kit';
  return finish(G);
}

export function generate(recipe) {
  const it = genSteps(recipe);
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}

export function hashWorld(world) { return hashState(world); }
