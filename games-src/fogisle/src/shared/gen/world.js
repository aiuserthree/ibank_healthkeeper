// 주는 것: 세계 생성 — genSteps(레시피 → 세계. 조각내 돌릴 수 있는 function* — 굽기(F1b)가 뒤에 이어 붙는다) · generate(끝까지) · genRaw(검사 없이) · hashWorld · WORLD_VERSION.
// 받는 것: recipe(검사) · terrain · rocks · kit · build · shapes · rng · state(해시 · 복사) · tune/world. three · DOM 을 모른다 — Node · 크롬 · 워커가 같은 비트를 낸다.
// 세계(일반 객체 · 배열 · 형식 배열만 — 워커에서 넘겨받을 수 있고 hashState 로 해시한다):
//   batches[]  그릴 묶음(재질 × 32m 칸): { mat, cell(칸 번호 = 세로 칸 × 가로 칸 수 + 가로 칸), pos · nor(Float32 ×3), col(Uint8 ×4: 색조 × 큰 얼룩 · 그늘),
//              axis(Uint8: 주된 입힘 축), lay(지형만 Uint8 ×4: 자갈 · 풀 · 젖음 · 예비 — 다른 재질은 null), idx(Uint32) }
//   protos[] · instances[]  인스턴스 원형(제 좌표의 형상)과 줄(xf: Float32 ×8 — rocks.js 머리 주석) · props[]  따로 그리는 조각(과녁): { piece, at, yaw, lean, parts[](재질마다 하나) }
//   collide    충돌 삼각형: { pos, idx, surf(삼각형마다 표면 종류 번호 — world.surf 의 이름 차례) } — 그림에서 나온다(잔 소품 · 0.8m 아래 바위는 뺀다)
//   lights[]   등불: { at, color, radius, mode: 'on' | 'switch' | 'break', group(묶음 번호 · 늘 켜짐은 −1), piece }
//   marks      { spawn: { at, yaw }, stations[{ id, at, yaw, pitch }](책갈피 — 눈 자리 · 라디안), targets[{ kind, at, prop, light }], points{ 이름: [x, y, z] } }
//   grid       가로 밀기 전의 땅 높이(1m 격자 · Float32) · zones(레시피 것의 사본) · surf(표면 종류 이름) ·
//              stats(삼각형 · 꼭짓점 · 인스턴스 수 · rocksMoved 땅에 맞추느라 옮긴 바위 · rocksSteep 가파른 면이라 버린 바위 · rocksDropped 못 맞춰 버린 바위 ·
//              propParts 과녁 조각의 부분 수)
// 높이 잡기: 바위 · 조각 · 돌담의 돌 · 낱 등불 · points 는 「민 뒤의 땅」(build.js 의 landAt — 그리는 지형 · 충돌과 같은 면),
//   시작 자리 · 책갈피 · on: 'top' 조각은 「그 자리에서 가장 높은 충돌 면」(topAt — 부두 · 돌담 위). 두 규칙을 하나로 맞추는 일은 F1b(벽 속 표식 검증)의 몫이다.
import { PI, dsin, dcos } from '../dmath.js';
import { makeRng, seedFrom } from '../rng.js';
import { hashState, clone } from '../state.js';
import { xf } from '../geom/shapes.js';
import { checkRecipe } from './recipe.js';
import { makeTerrain, applyOp, meshTerrain } from './terrain.js';
import { rockProtos, scatterRocks } from './rocks.js';
import { PIECES, LAMP, parseLit, optOf } from './kit.js';
import { makeBuild, addMesh, addSolid, mergeParts, topAt, landAt, SURF } from './build.js';
import { WORLD } from '../tune/world.js';

export const WORLD_VERSION = 2;
const DEG = PI / 180;

// 지형 삼각형의 표면 종류(발소리 · 착탄이 읽는다) — 첫 꼭짓점 k 의 가파름과 지형 겹으로: 가파르면 바위 · 자갈 겹이 짙으면 자갈(젖었으면 젖은 자갈) · 풀 겹이 짙으면 풀
function surfaceOf(tm, k) {
  const S = WORLD.surface, pebble = tm.lay[k * 4] / 255, turf = tm.lay[k * 4 + 1] / 255, wet = tm.lay[k * 4 + 2] / 255;
  if (tm.steep[k] > S.steep) return 'rock';
  if (pebble > S.pebble) return wet > S.wet ? 'wet' : 'gravel';
  return turf > S.turf ? 'turf' : 'rock';
}

// 지형 전체를 충돌에 넣고(맨 먼저 — 칸 통의 앞쪽이 지형이다), 꼭짓점을 32m 칸마다 한 묶음으로 나눠 넣는다(이음매의 꼭짓점은 두 칸이 같은 값을 따로 가진다)
function addTerrain(B, T, tm) {
  const { nx, nz } = T, cell = WORLD.cell, surf = new Uint8Array(tm.idx.length / 3);
  for (let t = 0; t < surf.length; t++) surf[t] = SURF.indexOf(surfaceOf(tm, tm.idx[t * 3]));
  addSolid(B, tm, surf);
  B.groundEnd = B.solid.idx.length;
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
      const len = optOf(it, def.reach), yaw = (it.rot || 0) * DEG;
      out.push([it.at[0], it.at[1], it.at[0] + dsin(yaw) * len, it.at[1] + dcos(yaw) * len, def.clear]);
    } else dot(it.at, def.clear);
  }
  return out;
}

// 조각 하나를 놓는다. 난수 · 잡음의 씨앗은 조각 이름 + 자리(선 조각은 첫 점)에서 뽑는다 — 레시피의 앞이든 뒤든 다른 조각을 끼워도 이 조각의 생김새는 그대로다.
function placePiece(G, it) {
  const def = PIECES[it.piece], spot = def.line ? it.line[0] : it.at, seed = seedFrom(G.salt, 'kit:' + it.piece + ':' + spot[0] + ',' + spot[1]);
  const K = { B: G.B, T: G.T, it, salt: seed, rng: makeRng(seedFrom(seed, 'rng')), lights: G.lights, lit: -1, prop: null, frame: xf(0, 0, 0) };
  if (def.line) { def.make(K, it); return; }
  // 놓는 높이: 해수면(부두 · 부표) · 밑에 있는 것 위(on: 'top' — 먼저 놓인 충돌 면) · 그 밖에는 민 뒤의 땅
  const x = it.at[0], z = it.at[1], top = it.on === 'top' ? topAt(G.B, x, z) : null;
  const y = (def.sea ? G.recipe.sea : top !== null ? top : landAt(G.B, G.T, x, z)) + (it.up || 0), yaw = (it.rot || 0) * DEG, lean = (it.lean || 0) * DEG;
  K.frame = xf(x, y, z, 0, yaw, lean);
  if (it.target) K.prop = { piece: it.piece, at: [x, y, z], yaw, lean, parts: [] };
  def.make(K, it);
  if (!K.prop) return;
  K.prop.parts = mergeParts(K.prop.parts);
  G.targets.push({ kind: it.piece, at: [x, y + def.aim, z], prop: G.props.length, light: K.lit });
  G.props.push(K.prop);
}

// 세계의 수 가운데 유한하지 않은 것을 찾는다 → 처음 걸린 것의 이름(없으면 ''). 틀린 수가 검사를 빠져나와도 NaN 이 든 세계를 내보내지 않는다.
function firstBad(world) {
  const lists = [['grid.h', world.grid.h], ['collide.pos', world.collide.pos]];
  world.batches.forEach((b, i) => lists.push([`batches[${i}](${b.mat}).pos`, b.pos], [`batches[${i}](${b.mat}).nor`, b.nor]));
  world.protos.forEach((p, i) => lists.push([`protos[${i}].pos`, p.pos]));
  world.instances.forEach((g, i) => lists.push([`instances[${i}].xf`, g.xf]));
  world.props.forEach((p, i) => { lists.push([`props[${i}].at`, [...p.at, p.yaw, p.lean]]); p.parts.forEach((q) => lists.push([`props[${i}](${q.mat}).pos`, q.pos])); });
  world.lights.forEach((l, i) => lists.push([`lights[${i}]`, [...l.at, l.radius, l.group]]));
  const m = world.marks;
  lists.push(['marks.spawn', [...m.spawn.at, m.spawn.yaw]], ...m.stations.map((s) => ['marks.stations.' + s.id, [...s.at, s.yaw, s.pitch]]), ...m.targets.map((t, i) => [`marks.targets[${i}]`, t.at]));
  lists.push(...Object.entries(m.points).map(([id, p]) => ['marks.points.' + id, p]));
  for (const [name, list] of lists) for (let i = 0; i < list.length; i++) if (list[i] - list[i] !== 0) return name;
  return '';
}

function finish(G) {
  const { recipe, T, B } = G, m = recipe.marks, count = (list, per) => list.reduce((sum, b) => sum + b.idx.length / per, 0);
  // 책갈피 · 시작 자리의 높이: 그 자리에서 가장 높은 충돌 면(부두 위에 서면 부두 높이) — 책갈피는 거기에 눈높이를 더한다. points 는 민 뒤의 땅.
  const stand = (p) => { const top = topAt(B, p[0], p[1]); return top !== null ? top : landAt(B, T, p[0], p[1]); };
  const batches = B.batches.map((b) => ({
    mat: b.mat, cell: b.cell, pos: Float32Array.from(b.pos), nor: Float32Array.from(b.nor), col: Uint8Array.from(b.col), axis: Uint8Array.from(b.axis),
    lay: b.lay ? Uint8Array.from(b.lay) : null, idx: Uint32Array.from(b.idx),
  }));
  const protos = G.protos.map((p) => ({ name: p.name, ...p.part })), instances = G.inst.map((list, k) => ({ proto: k, xf: Float32Array.from(list) }));
  const collide = { pos: Float32Array.from(B.solid.pos), idx: Uint32Array.from(B.solid.idx), surf: Uint8Array.from(B.solid.surf) };
  const marks = {
    spawn: { at: [m.spawn[0], stand(m.spawn), m.spawn[1]], yaw: (m.spawn[2] || 0) * DEG },
    stations: Object.entries(m.stations || {}).map(([id, p]) => ({ id, at: [p[0], stand(p) + WORLD.eye, p[1]], yaw: (p[2] || 0) * DEG, pitch: (p[3] || 0) * DEG })),
    targets: G.targets, points: Object.fromEntries(Object.entries(m.points || {}).map(([id, p]) => [id, [p[0], landAt(B, T, p[0], p[1]), p[1]]])),
  };
  const instCount = instances.reduce((sum, g) => sum + g.xf.length / 8, 0), instTris = instances.reduce((sum, g) => sum + g.xf.length / 8 * protos[g.proto].idx.length / 3, 0);
  const propTris = G.props.reduce((sum, p) => sum + count(p.parts, 3), 0), tris = count(batches, 3);
  const stats = {
    tris, verts: batches.reduce((sum, b) => sum + b.pos.length / 3, 0), batches: batches.length, staticRocks: G.count.staticRocks, instances: instCount, instTris,
    rocksMoved: G.count.rocksMoved, rocksSteep: G.count.rocksSteep, rocksDropped: G.count.rocksDropped, props: G.props.length, propParts: G.props.reduce((sum, p) => sum + p.parts.length, 0), propTris, drawTris: tris + instTris + propTris, collideTris: collide.idx.length / 3, lights: G.lights.length,
  };
  const world = {
    v: WORLD_VERSION, id: recipe.id, seed: recipe.seed, size: recipe.size.slice(), origin: [T.x0, T.z0], sea: recipe.sea, sky: recipe.sky || '', cell: WORLD.cell,
    grid: { nx: T.nx, nz: T.nz, h: Float32Array.from(T.h) }, surf: SURF.slice(), batches, protos, instances, props: G.props, collide, lights: G.lights,
    marks, zones: clone(recipe.zones || []), stats,
  };
  const broken = firstBad(world);
  if (broken) throw new Error('세계 생성 실패 — ' + broken + ' 에 유한하지 않은 수가 있다(레시피의 수 칸을 본다)');
  // 땅을 만든 뒤에야 알 수 있는 레시피 문제: 시작 자리가 물속
  if (marks.spawn.at[1] < recipe.sea) throw new Error(`레시피 검사 실패 — [water] 시작 자리 [${m.spawn[0]}, ${m.spawn[1]}] 가 물속이다(높이 ${marks.spawn.at[1].toFixed(2)} · 해수면 ${recipe.sea})`);
  return world;
}

// 검사 없이 만든다(시험 · 깨진 레시피를 굽기까지 보내 볼 때). 틀린 수가 들어와도 끝나지 않는 일은 없다 — 수로 도는 고리마다 울타리가 있다:
//   세계 크기(여기) · 지형 도장 뒤의 높이(terrain) · 흩는 수(rocks) · 조각의 치수와 돌담 마디(kit) · 형상 쪼개기(mesh) · 마무리의 NaN 확인.
export function* genRaw(recipe) {
  const big = WORLD.range.size[1];
  if (!(recipe.size[0] > 0 && recipe.size[0] <= big && recipe.size[1] > 0 && recipe.size[1] <= big)) throw new Error('세계 생성 실패 — size [' + recipe.size + '] 는 ' + big + ' 이하의 수여야 한다');
  const salt = seedFrom(recipe.seed, 'world:' + recipe.id), T = makeTerrain(recipe, salt), B = makeBuild(recipe, salt);
  for (const op of recipe.terrain) applyOp(T, op);
  yield 'height';
  addTerrain(B, T, meshTerrain(T));
  yield 'terrain';
  const G = { recipe, salt, T, B, protos: rockProtos(salt), inst: [], keep: keepOut(recipe), lights: [], props: [], targets: [], count: { staticRocks: 0, rocksMoved: 0, rocksSteep: 0, rocksDropped: 0 } };
  for (let k = 0; k < WORLD.rock.kinds; k++) G.inst.push([]);
  // 흩기 줄의 난수 씨앗은 「띠 + 그 띠의 몇 번째 줄인가」에서 뽑는다(rocks.js)
  const regions = [];
  for (const item of recipe.scatter || []) {
    scatterRocks(G, item, regions.filter((name) => name === item.region).length);
    regions.push(item.region);
  }
  yield 'rocks';
  for (const it of recipe.kit) placePiece(G, it);
  for (const it of recipe.lights || []) {
    const lit = parseLit(it.lit), at = [it.at[0], landAt(B, T, it.at[0], it.at[1]) + (it.up || 0), it.at[1]];
    G.lights.push({ at, color: LAMP[it.color || 'warm'].slice(), radius: it.radius || WORLD.kit.lightRadius, mode: lit.mode, group: lit.group, piece: '' });
  }
  yield 'kit';
  return finish(G);
}

export function* genSteps(recipe) {
  const problems = checkRecipe(recipe);
  if (problems.length) throw new Error('레시피 검사 실패 — ' + problems.map((p) => `[${p.code}] ${p.msg}`).join(' / '));
  return yield* genRaw(recipe);
}

export function generate(recipe) {
  const it = genSteps(recipe);
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}

export function hashWorld(world) { return hashState(world); }
