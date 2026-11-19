// 세계 생성(F1a): 형상 도우미(닫힘 · 바깥 보기 · 모서리 나누기 · 쪼개기) · 지형 도장 여덟 · 레시피 검사 · 생성의 결정성과 기준 해시(tests/golden/world.json) ·
// 예산과 시간(tune 의 world.budget) · 생성 결과의 꼴(꼭짓점 속성 둘 · 바위의 정적/인스턴스 규칙 · 등불 표시 · 표식) · 바위가 땅에 박혔는가(뜬 바위 · 통째로 묻힌 바위 0) ·
// 수가 틀린 레시피(검사에 걸리고, 검사를 건너뛰어도 곧바로 예외) · 씨앗이 레시피의 차례에 묶이지 않는가. 값을 못 박지 않고 표 · 기준 파일과 견준다.
// 기준 해시가 바뀌는 것이 맞으면: node tools/preview.mjs <세계> --update-golden (넘겨주기에 까닭을 적는다).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cbox, bar, extrude, lathe, sweep, loft, displace, ico, place, xf } from '../../src/shared/geom/shapes.js';
import { shade, subdivide, placeMesh, dominantAxis } from '../../src/shared/geom/mesh.js';
import { makeTerrain, applyOp, heightAt, meshTerrain, OPS } from '../../src/shared/gen/terrain.js';
import { checkRecipe } from '../../src/shared/gen/recipe.js';
import { generate, genSteps, genRaw, hashWorld } from '../../src/shared/gen/world.js';
import { PIECES } from '../../src/shared/gen/kit.js';
import { clone } from '../../src/shared/state.js';
import { WORLD } from '../../src/shared/tune/world.js';
import { recipe } from '../../src/data/slice1/recipe.js';

const GOLDEN = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'golden', 'world.json');
// 삼각형 더미의 부피(면이 바깥을 보면 양수)
function volume(s) {
  let v = 0;
  for (let t = 0; t < s.length; t += 9) {
    v += s[t] * (s[t + 4] * s[t + 8] - s[t + 5] * s[t + 7]) + s[t + 1] * (s[t + 5] * s[t + 6] - s[t + 3] * s[t + 8]) + s[t + 2] * (s[t + 3] * s[t + 7] - s[t + 4] * s[t + 6]);
  }
  return v / 6;
}
// 닫힌 덩이: 모든 모서리가 꼭 한 번씩 서로 반대 방향으로 두 삼각형에 걸린다 → 열린 모서리의 수
function openEdges(s) {
  const seen = new Map(), key = (i) => [s[i], s[i + 1], s[i + 2]].map((v) => Math.round(v * 4096)).join(',');
  for (let t = 0; t < s.length; t += 9) for (let e = 0; e < 3; e++) { const k = key(t + e * 3) + '>' + key(t + ((e + 1) % 3) * 3); seen.set(k, (seen.get(k) || 0) + 1); }
  return [...seen].filter(([k, n]) => n !== 1 || seen.get(k.split('>').reverse().join('>')) !== 1).length;
}
function maxEdge(s) {
  let m = 0;
  for (let t = 0; t < s.length; t += 9) for (let e = 0; e < 3; e++) {
    const a = t + e * 3, b = t + ((e + 1) % 3) * 3;
    m = Math.max(m, Math.hypot(s[a] - s[b], s[a + 1] - s[b + 1], s[a + 2] - s[b + 2]));
  }
  return m;
}
// 삼각형 t 의 넓이 벡터(법선 방향)
function faceNormal(P, I, t) {
  const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3, u = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], v = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
  return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
}
// 같은 번호의 삼각형끼리 견줘, 민 뒤(bent)에 뒤집힌 삼각형의 수
function foldedCount(bent, straight) {
  let n = 0;
  for (let t = 0; t < bent.idx.length; t += 3) {
    const p = faceNormal(bent.pos, bent.idx, t), q = faceNormal(straight.pos, straight.idx, t);
    if (p[0] * q[0] + p[1] * q[1] + p[2] * q[2] <= 0) n++;
  }
  return n;
}

function shapes() {
  const ring = Array.from({ length: 12 }, (v, i) => [Math.cos(i / 12 * 2 * Math.PI), 0, Math.sin(i / 12 * 2 * Math.PI)]), L = [[0, 0], [2, 0], [2, 1], [1, 1], [1, 3], [0, 3]];
  const solids = {
    cbox: cbox(2, 1, 3, 0.1), box: cbox(2, 1, 3), bar: bar(4.2, 0.2, 0.3, 0.02), extrude: extrude(L, 0.5), 'extrude(거꾸로 감긴 단면)': extrude(L.slice().reverse(), 0.5),
    lathe: lathe([[0, 0], [1, 0], [1.2, 1], [0.5, 2], [0, 2]], 16), 'lathe(위에서 아래로)': lathe([[0, 2], [0.5, 2], [1.2, 1], [1, 0], [0, 0]], 16),
    sweep: sweep([[0, 0, 0], [0, 1, 0], [0.5, 2, 0], [1.5, 2.3, 0.4]], 0.1, 6), 'sweep(고리)': sweep(ring, 0.1, 5, true), ico: ico(2), displace: displace(ico(2), 0.1, 1.3, 5),
    loft: loft([[[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]]], true, true),
    'loft(고리를 거꾸로 감아도)': loft([[[0, 0, 0], [0, 0, 1], [1, 0, 1], [1, 0, 0]], [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]]], true, true),
    subdivide: subdivide(cbox(4, 0.2, 0.3, 0.02), 1), place: place(cbox(1, 2, 3, 0.1), xf(5, 6, 7, 0.3, 0.5, 0.7, 2, 1, 0.5)),
  };
  for (const [name, soup] of Object.entries(solids)) {
    assert.equal(openEdges(soup), 0, name + ': 닫힌 덩이가 아니다(열린 모서리가 있다)');
    assert.ok(volume(soup) > 0, name + ': 면이 안쪽을 본다(부피가 음수)');
  }
  assert.ok(Math.abs(volume(solids.box) - 6) < 1e-9 && volume(solids.cbox) < 6 && volume(solids.cbox) > 5.8, '깎은 상자는 그냥 상자보다 조금 작다');
  assert.ok(Math.abs(volume(solids.extrude) - volume(solids['extrude(거꾸로 감긴 단면)'])) < 1e-9 && Math.abs(volume(solids.extrude) - 2) < 1e-9);
  const long = cbox(4, 0.2, 0.3, 0.02);
  assert.ok(Math.abs(volume(solids.subdivide) - volume(long)) < 1e-9 && maxEdge(solids.subdivide) <= 1 + 1e-9 && maxEdge(long) > 3, '쪼개도 부피는 같고 모서리는 한도 안');
  assert.ok(maxEdge(solids.bar) <= 1.1, '긴 각재는 처음부터 1m 마디로 나뉜다');
  // 쪼개기의 울타리: 유한하지 않은 좌표 · 0 인 한도 · 터무니없이 큰 형상은 끝없이 돌지 않고 예외로 끝난다
  for (const wrong of [NaN, Infinity, 'x']) assert.throws(() => subdivide([0, 0, 0, wrong, 0, 0, 0, 1, 0], 1), /유한/, '쪼개기: 좌표 ' + wrong);
  assert.throws(() => subdivide(long, 0), /maxEdge/); assert.throws(() => subdivide(long, NaN), /maxEdge/); assert.throws(() => subdivide(cbox(4e5, 4e5, 1), 1), /넘는다|쪼개도/);
  // 모서리 나누기: 상자의 큰 면은 축을 보는 법선을 따로 갖고(꺾인 곳에서 꼭짓점이 나뉜다), 선반 깎기의 옆면은 꼭짓점을 같이 쓴다
  const box = shade(cbox(1, 1, 1, 0.1)), round = shade(lathe([[1, 0], [1, 1]], 24)), moved = placeMesh(box, xf(1, 2, 3, 0.3, 0.5, 0.7, 2, 1, 0.5));
  let axisAligned = 0;
  for (let v = 0; v < box.nor.length; v += 3) if (Math.max(Math.abs(box.nor[v]), Math.abs(box.nor[v + 1]), Math.abs(box.nor[v + 2])) > 0.9999) axisAligned++;
  assert.equal(axisAligned, 24, '깎은 상자의 큰 면 여섯에 꼭짓점 넷씩'); assert.equal(round.pos.length / 3, 48, '원기둥 옆면은 고리 둘의 꼭짓점만 쓴다');
  for (let v = 0; v < moved.nor.length; v += 3) assert.ok(Math.abs(Math.hypot(moved.nor[v], moved.nor[v + 1], moved.nor[v + 2]) - 1) < 1e-5, '옮긴 형상의 법선 길이가 1 이 아니다');
  assert.deepEqual([dominantAxis(0.9, 0.1, 0.2), dominantAxis(0.5, 0.5, 0.5), dominantAxis(0.1, -0.2, -0.9)], [0, 1, 2]);
}

// 작은 시험 세계: 절벽 선이 z = 0, 그 남쪽이 해변. 도장 하나를 찍기 전후의 높이를 견준다
function terrainOps() {
  const base = { op: 'base', coast: 'south', shore: 14, cliff: { line: [[-16, 0], [16, 0]], height: 10, strata: 2 } };
  const make = (...ops) => { const T = makeTerrain({ size: [32, 32] }, 7); for (const op of [base, ...ops]) applyOp(T, op); return T; };
  const plain = make(), area = ['circle', 6, 8, 3], at = (T, x, z) => heightAt(T, x, z), far = [-10, 9];
  assert.deepEqual([...OPS].sort(), ['base', 'carve', 'crack', 'flatten', 'path', 'push', 'raise', 'terrace']);
  assert.ok(at(plain, 0, 15) < 0 && at(plain, 0, 6) > 0 && at(plain, 0, -15) > at(plain, 0, 6) + 8, '바탕: 바다 < 해변 < 고원');
  const flat = make({ op: 'flatten', area, to: 5, blend: 2 }), up = make({ op: 'raise', area, by: 2, blend: 2 }), down = make({ op: 'carve', area, by: 1, blend: 2 });
  assert.ok(Math.abs(at(flat, 6, 8) - 5) < 1e-9 && Math.abs(at(flat, 7, 9) - 5) < 1e-9 && at(flat, ...far) === at(plain, ...far), '평평하게: 안은 그 높이, 먼 곳은 그대로');
  assert.ok(Math.abs(at(up, 6, 8) - at(plain, 6, 8) - 2) < 1e-9 && Math.abs(at(down, 6, 8) - at(plain, 6, 8) + 1) < 1e-9 && at(up, ...far) === at(plain, ...far), '올리기 · 깎기');
  assert.ok(at(up, 10, 8) > at(plain, 10, 8) && at(up, 10, 8) < at(plain, 10, 8) + 2, '가장자리 밖 blend 에서 부드럽게 사라진다');
  // 계단밭: 절벽 비탈의 높이가 단 높이의 배수 근처로 모인다
  const steps = make({ op: 'terrace', area: ['box', -14, -11, 14, 0], step: 2.5, blend: 1 });
  const onTread = (T) => {
    let n = 0;
    for (let x = -12; x <= 12; x++) for (let z = -10; z <= -1; z++) { const f = at(T, x, z) / 2.5; if (Math.abs(f - Math.round(f)) < 0.12) n++; }
    return n;
  };
  assert.ok(onTread(steps) > onTread(plain) * 1.5, `계단밭: 단 위에 놓인 칸이 늘어야 한다(${onTread(plain)} → ${onTread(steps)})`);
  // 길: 폭 안은 길 높이를 따라 평탄해진다(가로로 본 높이 차가 준다)
  const road = make({ op: 'path', line: [[-12, -9], [12, -3]], width: 3 }), across = (T) => Math.abs(at(T, 0.5, -7) - at(T, -0.5, -5));
  assert.ok(across(road) < 0.4 && across(plain) > 1 && at(road, ...far) === at(plain, ...far), `길: 가로 높이 차 ${across(plain).toFixed(2)} → ${across(road).toFixed(2)}`);
  // 가로 밀기 · 틈 어둡게: 가파른 꼭짓점만 움직이고 어두워진다. 민 뒤에 뒤집힌 삼각형이 없다.
  const still = meshTerrain(make()), pushed = meshTerrain(make({ op: 'push', amount: 1.3, cell: 3.3 }, { op: 'crack', dark: 0.3 }));
  let movedSteep = 0, movedFlat = 0, darkSteep = 0, darkFlat = 0;
  for (let k = 0; k < pushed.steep.length; k++) {
    const moved = pushed.pos[k * 3] !== still.pos[k * 3] || pushed.pos[k * 3 + 2] !== still.pos[k * 3 + 2], up = still.nor[k * 3 + 1];     // up = 밀기 전 법선의 위쪽 성분
    if (up < WORLD.push.steepFrom - 0.02) { movedSteep += moved; darkSteep += pushed.shade[k] < 1; } else if (up > WORLD.push.steepFrom + 0.02) { movedFlat += moved; darkFlat += pushed.shade[k] < 1; }
    assert.ok(pushed.shade[k] >= 0.3 - 1e-6 && pushed.shade[k] <= 1 && still.shade[k] === 1);
  }
  assert.ok(movedSteep > 50 && movedFlat === 0 && darkSteep > 50 && darkFlat === 0, `가파른 곳만 밀리고 어두워진다(${movedSteep} · ${movedFlat} · ${darkSteep} · ${darkFlat})`);
  assert.equal(foldedCount(pushed, still), 0, '가로로 민 뒤 뒤집힌 삼각형이 있다');
  // 진짜 세계(slice1 의 지형)에서도: 밀기 전과 견줘 뒤집힌 삼각형이 없다(접힘 풀기가 일을 한다)
  const real = (ops) => { const T = makeTerrain(recipe, 7); for (const op of ops) applyOp(T, op); return meshTerrain(T); };
  assert.equal(foldedCount(real(recipe.terrain), real(recipe.terrain.filter((op) => op.op !== 'push'))), 0, 'slice1 지형에 뒤집힌 삼각형이 있다');
  // 틀린 수의 도장은 높이를 NaN 으로 만든다 — 그 도장에서 바로 멈춘다
  assert.throws(() => make({ op: 'terrace', area, step: 0, blend: 2 }), /terrace.*유한/); assert.throws(() => make({ op: 'flatten', area, to: 'low' }), /flatten.*유한/);
}

function recipeCheck() {
  const codes = (r) => [...new Set(checkRecipe(r).map((p) => p.code))], vary = (patch) => ({ ...recipe, ...patch }), marks = (patch) => vary({ marks: { ...recipe.marks, ...patch } });
  const swap = (from, to) => vary({ kit: recipe.kit.map((it) => (it === from ? to : it)) }), op = (name, patch) => vary({ terrain: recipe.terrain.map((o) => (o.op === name ? { ...o, ...patch } : o)) });
  const raw = (r) => { const it = genRaw(r); let s = it.next(); while (!s.done) s = it.next(); return s.value; };
  assert.deepEqual(checkRecipe(recipe), [], 'slice1 레시피가 검사에 걸린다');
  const find = (piece, nth = 0) => recipe.kit.filter((it) => it.piece === piece)[nth], lamp = find('lamppost'), pier = find('pier'), wall = find('wall'), tower = find('lighthouse');
  const lanterns = recipe.kit.filter((it) => it.piece === 'lantern' && it.target), L = WORLD.lit, far = WORLD.range.size[1] * 2;
  const broken = {
    '모르는 조각': [vary({ kit: [...recipe.kit, { piece: 'tank', at: [0, 0] }] }), 'piece'], '모르는 흩기 띠': [vary({ scatter: [{ what: 'rocks', region: 'moon', n: 3, size: [1, 2] }] }), 'piece'],
    '모르는 지형 도장': [vary({ terrain: [...recipe.terrain, { op: 'melt', area: ['circle', 0, 0, 3] }] }), 'op'],
    '세계 밖 시작 자리': [marks({ spawn: [recipe.size[0], 0, 0] }), 'outside'], '세계 밖 책갈피': [marks({ stations: { far: [0, -recipe.size[1], 0] } }), 'outside'],
    '세계 밖 조각': [vary({ kit: [...recipe.kit, { piece: 'bottle', at: [0, recipe.size[1]] }] }), 'outside'],
    '부두의 뻗은 끝이 세계 밖': [swap(pier, { ...pier, length: recipe.size[1] / 2 }), 'outside'],
    '겹친 책갈피': [marks({ stations: { ...recipe.marks.stations, twin: recipe.marks.stations.camp.slice() } }), 'overlap'],
    '시작 자리와 겹친 과녁': [vary({ kit: [...recipe.kit, { piece: 'bottle', at: recipe.marks.spawn.slice(0, 2), target: true }] }), 'overlap'],
    '등불 표시 빠짐': [swap(lamp, { piece: 'lamppost', at: lamp.at }), 'lit'], '틀린 등불 표시': [swap(lamp, { ...lamp, lit: 'blink' }), 'lit'], '표시 없는 낱 등불': [vary({ lights: [{ at: [0, 10] }] }), 'lit'],
    '대본 스위치와 깨지는 등불이 한 묶음': [vary({ lights: [{ at: [0, 10], lit: 'switch:' + lanterns[0].lit.split(':')[1] }] }), 'lit'],
    '깨지는 등롱 둘이 한 묶음': [swap(lanterns[1], { ...lanterns[1], lit: lanterns[0].lit }), 'lit'],
    '과녁 등롱이 늘 켜짐': [swap(lanterns[0], { ...lanterns[0], lit: 'on' }), 'lit'], '과녁 등롱이 대본 스위치': [swap(lanterns[0], { ...lanterns[0], lit: 'switch:1' }), 'lit'],
    '깨질 수 없는 등대가 깨지는 등불': [swap(tower, { ...tower, lit: 'break:1' }), 'lit'], '깨질 수 없는 낱 등불이 깨지는 등불': [vary({ lights: [{ at: [0, 10], lit: 'break:2' }] }), 'lit'],
    '묶음 번호가 끝을 넘는다': [swap(lamp, { ...lamp, lit: 'switch:' + L.groups }), 'lit'],
    '대본 스위치 묶음이 너무 많다': [vary({ lights: Array.from({ length: L.script }, (v, i) => ({ at: [i * 2, 10], lit: 'switch:' + (i + 1) })) }), 'lit'],
    '단 높이가 0 인 계단밭': [op('terrace', { step: 0 }), 'range'], '평평하게의 높이가 글자': [op('flatten', { to: 'low' }), 'shape'], '길의 겹친 점': [op('path', { line: [[10, 17], [10, 17]] }), 'shape'],
    '조각의 돌림이 글자': [swap(pier, { ...pier, rot: 'east' }), 'shape'], '조각의 올림이 글자': [swap(lamp, { ...lamp, up: 'x' }), 'shape'],
    '조각의 기울임이 글자': [swap(find('buoy'), { ...find('buoy'), lean: 'x' }), 'shape'], '같은 자리의 같은 조각': [vary({ kit: [...recipe.kit, { ...lamp }] }), 'overlap'],
    '절벽 선의 좌표가 범위 밖': [op('base', { cliff: { ...recipe.terrain[0].cliff, line: [[-64, 58], [0, far * 8], [64, 58]] } }), 'range'], '길 점의 높이가 범위 밖': [op('path', { line: [[10, 17, far * 8], [-2, 12.5]] }), 'range'],
    '영역의 좌표가 범위 밖': [op('raise', { area: ['circle', far * 8, 36, 2.2] }), 'range'], '세계 밖 문': [marks({ doors: { gate: [recipe.size[0], 0, 0] } }), 'outside'],
    '문 폭이 범위 밖': [marks({ doors: { gate: [0, 20, 0, far] } }), 'range'], '없는 문을 출입구로 적은 구역': [vary({ zones: [{ area: ['circle', 0, 20, 3], exits: ['nowhere'] }] }), 'shape'],
    '영역 없는 구역': [vary({ zones: [{ enclosed: true }] }), 'shape'], '표식 뒤의 모르는 글자': [marks({ points: { cave: [-18, 4, 'roof'] } }), 'shape'],
    '돌담 선의 겹친 점': [swap(wall, { ...wall, line: [wall.line[0], wall.line[0].slice()] }), 'shape'],
    '조각의 치수가 범위 밖': [swap(tower, { ...tower, height: PIECES.lighthouse.opt.height[2] * 2 }), 'range'], '세계가 너무 크다': [vary({ size: [far, recipe.size[1]] }), 'range'],
    '흩는 수가 너무 많다': [vary({ scatter: [{ what: 'rocks', region: 'foot', n: WORLD.range.count[1] + 1, size: [1, 2] }] }), 'range'],
  };
  for (const [name, [bad, code]] of Object.entries(broken)) {
    assert.deepEqual(codes(bad), [code], `${name}: [${code}] 만 걸려야 한다 — ${JSON.stringify(checkRecipe(bad))}`);
    assert.throws(() => generate(bad), /레시피 검사 실패/, name + ': 검사에 걸린 레시피로 세계를 만들었다');
  }
  assert.deepEqual(codes({ id: 'x' }), ['shape']);
  // 묶음 번호의 경계: 마지막 번호(groups − 1)는 된다(위의 「끝을 넘는다」는 groups 에서 걸린다)
  assert.deepEqual(checkRecipe(swap(lamp, { ...lamp, lit: 'switch:' + (L.groups - 1) })), []); assert.deepEqual(checkRecipe(swap(lanterns[0], { ...lanterns[0], lit: 'break:' + (L.groups - 1) })), []);
  // 시작 자리가 물속: 땅을 만든 뒤에야 알 수 있어 검사는 통과하고 생성의 마무리가 [water] 로 멈춘다
  const wet = marks({ spawn: [recipe.marks.spawn[0], recipe.size[1] / 2 - 2, 0] });
  assert.deepEqual(checkRecipe(wet), []); assert.throws(() => generate(wet), /레시피 검사 실패 — \[water\]/);
  // 수가 틀린 레시피는 검사를 건너뛰고 생성에 넣어도(genRaw) 곧바로 예외로 끝난다 — 끝없이 쪼개며 힙을 채우지 않는다. 깨끗한 레시피는 genRaw = generate.
  for (const name of ['단 높이가 0 인 계단밭', '평평하게의 높이가 글자', '조각의 돌림이 글자', '조각의 올림이 글자', '돌담 선의 겹친 점', '조각의 치수가 범위 밖', '세계가 너무 크다', '흩는 수가 너무 많다']) {
    const t0 = performance.now();
    assert.throws(() => raw(broken[name][0]), (e) => !/레시피 검사 실패/.test(e.message), name + ': 검사 없이 생성에 넣었는데 예외가 아니다');
    assert.ok(performance.now() - t0 < WORLD.budget.genMs, name + ': 예외로 끝나는 데 너무 오래 걸린다');
  }
  assert.equal(hashWorld(raw(recipe)), hashWorld(generate(recipe)));
}

function generation(t) {
  const times = [], B = WORLD.budget;
  let world = null;
  for (let i = 0; i < 3; i++) { const t0 = performance.now(); world = generate(recipe); times.push(performance.now() - t0); }
  const hash = hashWorld(world), other = { ...recipe, seed: recipe.seed + 1 }, ms = times.sort((a, b) => a - b)[1], st = world.stats;
  // 결정성: 두 번 같은 해시 · 씨앗이 다르면 다른 해시 · 두 세계를 한 조각씩 번갈아 만들어도 혼자 만든 것과 같다(모듈에 숨은 상태가 없다)
  const a = genSteps(recipe), b = genSteps(other);
  let ra = a.next(), rb = b.next(), slices = 0;
  while (!ra.done || !rb.done) { if (!ra.done) ra = a.next(); if (!rb.done) rb = b.next(); slices++; }
  assert.equal(hashWorld(generate(recipe)), hash);
  assert.notEqual(hashWorld({ ...generate(other), seed: recipe.seed }), hash, '씨앗이 달라도 만든 것이 같다(씨앗 칸만 다르다) — 씨앗을 안 쓰고 있다');
  assert.ok(slices >= 3 && hashWorld(ra.value) === hash && hashWorld(rb.value) === hashWorld(generate(other)), '번갈아 만든 세계가 혼자 만든 것과 다르다 — 숨은 상태가 있다');
  const golden = JSON.parse(readFileSync(GOLDEN, 'utf8'));
  assert.equal(hash, golden[recipe.id], `기준 해시와 다르다 — ${recipe.id}: 기준 ${golden[recipe.id]} · 지금 ${hash}. 바뀌는 것이 맞으면 node tools/preview.mjs ${recipe.id} --update-golden`);
  assert.ok(ms <= B.genMs, `생성 ${ms.toFixed(0)}ms — ${B.genMs}ms 안이어야 한다`);
  assert.ok(st.drawTris <= B.tris && st.verts <= B.verts && st.instances <= B.instances && st.collideTris <= B.collideTris && st.instances > 0 && st.staticRocks > 0, '예산: ' + JSON.stringify(st));
  t.note('세계 ' + recipe.id, { hash, genMs: Math.round(ms * 10) / 10, ...st });
  clone(world);       // 일반 객체 · 배열 · 형식 배열만으로 된 나무다(함수 · undefined · 같은 버퍼를 두 곳에서 가리키기가 있으면 여기서 터진다)
  // 그릴 묶음: 번호가 꼭짓점 수 안 · NaN 없음 · 법선 길이 1 · 주된 입힘 축 = 법선의 가장 큰 축 · 지형만 겹을 가진다 · 꼭짓점 색은 약한 얼룩뿐(세 칸이 같고 1 − depth 이상 — 색조는 tint)
  let tris = 0;
  for (const part of [...world.batches, ...world.protos, ...world.props.flatMap((p) => p.parts)]) {
    const n = part.pos.length / 3;
    assert.ok(part.nor.length === n * 3 && part.col.length === n * 4 && part.axis.length === n && part.idx.every((v) => v < n) && part.pos.every((v) => v === v), part.mat + ': 배열 길이 · 번호 · NaN');
    assert.ok(part.lay == null || part.lay.length === n * 4, part.mat + ': 지형 겹의 길이');
    assert.ok(Array.isArray(part.tint) && part.tint.length === 3 && part.tint.every((c) => c >= 0 && c <= 1), part.mat + ': 색조(tint)는 묶음 · 부분의 값이다');
    for (let v = 0; v < n * 4; v += 4) if (part.col[v] !== part.col[v + 1] || part.col[v] !== part.col[v + 2] || part.col[v] < Math.round((1 - WORLD.blotch.depth) * 255)) assert.fail(`${part.mat}: 꼭짓점 색이 약한 얼룩이 아니다(${part.col.subarray(v, v + 3)})`);
    for (let v = 0; v < n; v++) {
      const [x, y, z] = part.nor.subarray(v * 3, v * 3 + 3);
      if (Math.abs(Math.hypot(x, y, z) - 1) > 1e-4 || part.axis[v] !== dominantAxis(x, y, z)) assert.fail(`${part.mat}: 꼭짓점 ${v} 의 법선 · 주된 축이 틀리다`);
    }
  }
  const cells = Math.ceil(recipe.size[0] / WORLD.cell) * Math.ceil(recipe.size[1] / WORLD.cell);
  for (const b of world.batches) {
    tris += b.idx.length / 3;
    assert.equal(b.lay !== null, b.mat === 'ground', b.mat + ': 지형만 겹을 가진다');
    assert.ok(b.cell >= 0 && b.cell < cells, b.mat + ': 칸 번호');
    assert.equal(world.batches.filter((o) => o.mat === b.mat && o.cell === b.cell && o.tint.join() === b.tint.join()).length, 1, b.mat + ': 재질 · 색조 · 칸이 같은 묶음이 둘');
  }
  const ground = world.batches.find((b) => b.mat === 'ground'), tones = new Set();
  for (let v = 0; v < ground.col.length; v += 4) tones.add(ground.col[v]);
  assert.ok(tones.size > 12 && tris === st.tris && world.batches.filter((b) => b.mat === 'ground').length === cells, `지형은 32m 칸마다 한 묶음(${cells}) · 얼룩의 밝기 단계 ${tones.size}`);
  // 얼룩은 지형 말고도 굽는다(정적 바위 · 인스턴스 원형 · 과녁 조각까지 같은 규칙) — 꼭짓점 색이 여럿이면 얼룩이 구워진 것이다
  const rockTones = new Set(world.batches.filter((b) => b.mat === 'rock').flatMap((b) => Array.from({ length: b.col.length / 4 }, (v, i) => b.col[i * 4])));
  assert.ok(rockTones.size > 1 && world.protos.every((q) => new Set(q.col.filter((v, i) => i % 4 === 0)).size > 1), '바위(정적 · 원형)의 꼭짓점 색이 한 가지다 — 얼룩이 안 구워졌다');
  // 바위: staticOver 를 넘는 것은 인스턴스에 없다. 충돌은 지형보다 많다(바위 · 조각이 들어 있다)
  for (const g of world.instances) for (let i = 6; i < g.xf.length; i += 8) assert.ok(g.xf[i] * WORLD.rock.unit <= WORLD.rock.staticOver + 1e-4, '2m 넘는 바위가 인스턴스에 있다');
  // 조각을 하나 더해 그 자리의 바위가 비켜나도 다른 바위는 그대로다(바위마다 난수를 같은 수만큼 쓴다)
  const rows = (w) => new Set(w.instances.flatMap((g) => Array.from({ length: g.xf.length / 8 }, (v, i) => g.proto + ':' + g.xf.subarray(i * 8, i * 8 + 8).join(','))));
  const first = world.instances.find((g) => g.xf.length), before = rows(world), after = rows(generate({ ...recipe, kit: [...recipe.kit, { piece: 'bottle', at: [first.xf[0], first.xf[2]] }] }));
  assert.ok(after.size < before.size && after.size >= before.size - 6 && [...after].every((row) => before.has(row)), `조각 하나를 더했더니 다른 바위가 바뀌었다(${before.size} → ${after.size})`);
  assert.ok(world.collide.surf.length === world.collide.idx.length / 3 && world.collide.surf.length > recipe.size[0] * recipe.size[1] * 2 && world.collide.surf.every((s) => s < world.surf.length));
  // 충돌 삼각형의 임자: 맨 앞이 지형(0) · 바위(1) · 그 뒤가 조각(2 + kit 번호)
  const C = world.collide, owners = new Set(C.owner);
  assert.ok(C.owner.length === C.surf.length && C.owner[0] === 0 && owners.has(1) && owners.has(2) && [...owners].every((o) => o < 2 + recipe.kit.length), '충돌 삼각형의 임자: ' + [...owners]);
  // 표식과 등불: 책갈피 · 과녁의 수와 종류는 레시피대로(slice1 = 책갈피 6 · 과녁 8) · 등불마다 표시 · 과녁 등롱은 깨지는 등불 · 등대는 스위치 묶음이고 절벽 위에 선다
  const kinds = world.marks.targets.map((m) => m.kind).sort().join(' '), cliff = recipe.terrain[0].cliff.height;
  assert.equal(world.marks.stations.length, Object.keys(recipe.marks.stations).length); assert.equal(kinds, recipe.kit.filter((it) => it.target).map((it) => it.piece).sort().join(' '));
  for (const l of world.lights) assert.ok((l.mode === 'on' && l.group === -1) || (['switch', 'break'].includes(l.mode) && l.group >= 0 && l.group < WORLD.lit.groups), '등불 표시: ' + JSON.stringify(l));
  for (const m of world.marks.targets) assert.ok(world.props[m.prop].piece === m.kind && (m.kind === 'lantern') === (m.light >= 0 && world.lights[m.light].mode === 'break'), '과녁: ' + JSON.stringify(m));
  // 과녁 조각의 부분은 재질 · 색조마다 하나다(부분 하나 = 그리기 호출 하나)
  for (const p of world.props) assert.equal(new Set(p.parts.map((q) => q.mat + q.tint)).size, p.parts.length, p.piece + ': 같은 재질 · 색조의 부분이 둘');
  assert.equal(st.propParts, world.props.reduce((sum, p) => sum + p.parts.length, 0));
  const tower = world.lights.find((l) => l.piece === 'lighthouse');
  assert.ok(tower.mode === 'switch' && tower.at[1] > cliff + 10, '등대의 등은 스위치 묶음이고 절벽 위에 선다');
  assert.ok(world.marks.spawn.at[1] > world.sea && world.marks.stations.every((m) => m.at[1] > world.sea + 1), '시작 자리 · 책갈피는 물 위');
  assert.ok(Array.isArray(world.zones) && world.zones !== recipe.zones, '세계의 zones 는 레시피 배열의 사본이어야 한다');
  // 해시는 세계의 모든 배열을 덮는다: 종류마다(묶음의 pos · 충돌의 idx …) 배열 하나의 값 하나를 바꾸면 해시가 달라진다
  const arrays = new Map(), walk = (node, path) => {
    if (ArrayBuffer.isView(node)) { if (node.length && !arrays.has(path)) arrays.set(path, node); return; }
    if (node !== null && typeof node === 'object') for (const k of Object.keys(node)) walk(node[k], path + '.' + (Array.isArray(node) ? '*' : k));
  };
  walk(world, 'world');
  for (const need of ['world.collide.pos', 'world.collide.idx', 'world.collide.surf', 'world.grid.h', 'world.instances.*.xf', 'world.batches.*.lay', 'world.props.*.parts.*.col', 'world.protos.*.axis']) assert.ok(arrays.has(need), '세계에 ' + need + ' 가 없다');
  for (const [path, list] of arrays) {
    const k = list.length >> 1, old = list[k];
    list[k] = old === 1 ? 2 : 1;
    assert.notEqual(hashWorld(world), hash, path + ' 의 값을 바꿔도 해시가 그대로다 — 해시가 이 배열을 안 본다');
    list[k] = old;
  }
  world.lights[0].radius += 1; assert.notEqual(hashWorld(world), hash, '등불의 값을 바꿔도 해시가 그대로다'); world.lights[0].radius -= 1;
  assert.equal(hashWorld(world), hash);
}

// 지형(그리는 묶음)을 1m 칸에 담은 자 — 생성 쪽의 칸 통(build.js)과 따로 짰다. 돌려주는 것: inside(점들) → 땅속인 점의 수(점 위로 지형 면이 홀수 번 있으면 땅속) ·
//   under(x, z, near) → 그 자리의 위를 보는 면 가운데 높이 near 에 가장 가까운 것의 [높이, 누운 정도(법선의 위쪽 성분)] (없으면 null)
function groundRuler(world) {
  const bins = new Map();
  for (const b of world.batches) if (b.mat === 'ground') for (let t = 0; t < b.idx.length; t += 3) {
    const tri = [0, 1, 2].map((e) => Array.from(b.pos.subarray(b.idx[t + e] * 3, b.idx[t + e] * 3 + 3))), xs = tri.map((q) => q[0]), zs = tri.map((q) => q[2]);
    for (let i = Math.floor(Math.min(...xs)); i <= Math.floor(Math.max(...xs)); i++) for (let j = Math.floor(Math.min(...zs)); j <= Math.floor(Math.max(...zs)); j++) {
      const key = i + ',' + j;
      if (!bins.has(key)) bins.set(key, []);
      bins.get(key).push(tri);
    }
  }
  // (x, z) 의 수직선이 만나는 면마다 [높이, 누운 정도(아래를 보는 면은 음수)]
  const hits = (x, z) => {
    const out = [];
    for (const [a, b, c] of bins.get(Math.floor(x) + ',' + Math.floor(z)) || []) {
      const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
      if (d === 0) continue;
      const u = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d, v = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d;
      if (u < 0 || v < 0 || u + v > 1) continue;
      const p = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], q = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], n = [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
      out.push([u * a[1] + v * b[1] + (1 - u - v) * c[1], n[1] / Math.hypot(...n)]);
    }
    return out;
  };
  const inside = (pts) => pts.reduce((sum, [x, y, z]) => sum + (hits(x, z).filter((h) => h[0] > y).length & 1), 0);
  const under = (x, z, near) => hits(x, z).filter((h) => h[1] > 0).sort((p, q) => Math.abs(p[0] - near) - Math.abs(q[0] - near))[0] || null;
  return { inside, under };
}
// 세계의 바위마다 꼭짓점 목록: 인스턴스는 줄의 변환으로 원형을 옮기고, 정적 바위는 묶음 안에서 자리가 같은 꼭짓점을 하나로 보고 삼각형으로 이어진 덩이마다 하나
function rockList(world) {
  const out = [];
  for (const g of world.instances) for (let i = 0; i < g.xf.length; i += 8) {
    const [x, y, z, rx, ry, rz, s, tall] = g.xf.subarray(i, i + 8), M = xf(x, y, z, rx, ry, rz, s, tall, s), P = world.protos[g.proto].pos, pts = [];
    for (let v = 0; v < P.length; v += 3) pts.push([0, 4, 8].map((r) => M[r] * P[v] + M[r + 1] * P[v + 1] + M[r + 2] * P[v + 2] + M[r + 3]));
    out.push({ at: [x, y, z], size: s * WORLD.rock.unit, pts });
  }
  for (const b of world.batches) if (b.mat === 'rock') {
    const id = new Map(), root = [], of = [], groups = new Map(), find = (a) => { while (root[a] !== a) a = root[a] = root[root[a]]; return a; };
    for (let v = 0; v < b.pos.length; v += 3) { const key = b.pos[v] + ',' + b.pos[v + 1] + ',' + b.pos[v + 2]; if (!id.has(key)) { id.set(key, root.length); root.push(root.length); } of.push(id.get(key)); }
    for (let t = 0; t < b.idx.length; t += 3) { const a = find(of[b.idx[t]]); root[find(of[b.idx[t + 1]])] = a; root[find(of[b.idx[t + 2]])] = a; }
    of.forEach((w, v) => { const r = find(w); if (!groups.has(r)) groups.set(r, []); groups.get(r).push([b.pos[v * 3], b.pos[v * 3 + 1], b.pos[v * 3 + 2]]); });
    // 정적 바위는 놓은 자리가 세계에 안 남는다 — 꼭짓점의 가운데를 자리로, 가로 폭을 크기로 본다(원형이 제 가운데에서 조금 비켜나 있어 어림이다 — 가파름은 덤 ROUGH 를 두고 잰다)
    for (const pts of groups.values()) {
      const mid = [0, 1, 2].map((c) => pts.reduce((sum, q) => sum + q[c], 0) / pts.length), xs = pts.map((q) => q[0]);
      out.push({ at: mid, size: Math.max(...xs) - Math.min(...xs), pts, rough: true });
    }
  }
  return out;
}

// 모든 바위가 땅에 박혀 있다: 땅속 꼭짓점의 비율이 biteMin 이상(안 떴다) · 땅 위 꼭짓점의 비율이 showMin 이상(통째로 묻히지 않았다). 꼭짓점 하나는 봐준다
// (세계의 수는 Float32 로 줄여 적혀 있어 땅에 꼭 걸친 꼭짓점 하나가 넘어갈 수 있다). 그리고 가파른 면(놓인 자리 땅의 누운 정도 < restFlat)에 선 바위가 없다.
function rocksOnGround(t) {
  const R = WORLD.rock, world = generate(recipe), keep = { ...R }, restore = () => Object.assign(R, keep);
  const measure = (w) => {
    const ruler = groundRuler(w);
    return rockList(w).map((r) => {
      const land = ruler.under(r.at[0], r.at[2], r.at[1]);
      return { at: r.at.map((v) => Math.round(v * 10) / 10), size: Math.round(r.size * 100) / 100, n: r.pts.length, inside: ruler.inside(r.pts), flat: land ? Math.round(land[1] * 100) / 100 : 0, rough: !!r.rough };
    });
  };
  const wrong = (rows) => rows.filter((r) => r.inside + 1 < R.biteMin * r.n || r.n - r.inside + 1 < R.showMin * r.n), steep = (rows) => rows.filter((r) => r.flat < R.restFlat - (r.rough ? ROUGH : 0));
  const rows = measure(world), floating = rows.filter((r) => r.inside === 0), buried = rows.filter((r) => r.inside === r.n);
  assert.equal(rows.length, world.stats.staticRocks + world.stats.instances, '바위를 다 세지 못했다(정적 바위를 덩이로 가르는 자가 틀리다)');
  assert.deepEqual([floating, buried, wrong(rows)], [[], [], []], '뜬 바위 · 통째로 묻힌 바위 · 문턱(tune 의 rock.biteMin · showMin)을 못 채운 바위가 있다');
  assert.deepEqual(steep(rows), [], '가파른 면(tune 의 rock.restFlat 보다 가파른 땅)에 선 바위가 있다 — 벽에 붙은 돌로 보인다');
  // 자가 눈이 멀지 않았는가 ①: 가파른 면 · 턱 끝을 가리지 않게 하면(restFlat 0 · perchMax 아주 크게) 같은 자가 가파른 면의 바위를 찾아낸다
  let onWall = null, loose = null;
  try { R.restFlat = 0; R.perchMax = 1e9; onWall = measure(generate(recipe)); } finally { restore(); }
  assert.ok(steep(onWall).length > 0 && world.stats.rocksSteep > 0 && onWall.length > rows.length, `가파른 면을 안 가려도 가파른 면의 바위가 없다(${steep(onWall).length}) — 이 시험이 아무것도 못 본다`);
  // 자가 눈이 멀지 않았는가 ②: 묻는 깊이(sink)를 터무니없이 깊게 하고 맞추기를 끄면(문턱 0) 같은 자가 못 채운 바위를 찾아낸다
  try { R.sink = 0.55; R.biteMin = 0; R.showMin = 0; loose = measure(generate(recipe)); } finally { restore(); }
  assert.ok(wrong(loose).length > 0, `맞추기를 꺼도 못 채운 바위가 없다(${wrong(loose).length}) — 이 시험이 아무것도 못 본다`);
  // 위아래로 옮겨 맞추기가 일을 한다: sink 를 터무니없이 바꿔 바위를 띄우거나 파묻어도, 옮기거나 버려서 문턱을 못 채운 바위가 남지 않는다
  for (const sink of [-0.4, 0.55]) {
    let odd = null;
    try { R.sink = sink; odd = generate(recipe); } finally { restore(); }
    assert.deepEqual(wrong(measure(odd)), [], `sink ${sink}: 못 채운 바위가 남았다`);
    assert.ok(odd.stats.rocksMoved + odd.stats.rocksDropped > world.stats.rocksMoved + world.stats.rocksDropped, `sink ${sink}: 옮기거나 버린 바위가 늘지 않았다`);
  }
  const share = rows.map((r) => r.inside / r.n).sort((a, b) => a - b), flats = rows.map((r) => r.flat).sort((a, b) => a - b);
  t.note('바위와 땅', {
    rocks: rows.length, moved: world.stats.rocksMoved, steep: world.stats.rocksSteep, dropped: world.stats.rocksDropped, 가파른_면을_안_가리면: steep(onWall).length, 맞추기를_끄면: wrong(loose).length,
    땅속_비율: [share[0], share[share.length - 1]].map((v) => Math.round(v * 100) / 100), 가장_가파른_자리: flats[0],
  });
}

// 정적 바위의 자리를 어림으로 잴 때 가파름 문턱에 두는 덤(어림한 가운데가 옆 삼각형에 떨어질 수 있다 — 놓은 자리가 정확한 인스턴스 줄에는 덤이 없다)
const ROUGH = 0.15;

// 씨앗과 차례: 바위 흩기가 세계 씨앗을 탄다 · 조각 · 흩기 줄의 생김새가 레시피 안의 차례에 묶이지 않는다 · 부두의 기본 길이 · 충돌에 들어가는 바위
function seedsAndOrder() {
  const vary = (patch) => ({ ...recipe, ...patch }), world = generate(recipe), R = WORLD.rock;
  const rows = (w) => new Set(w.instances.flatMap((g) => Array.from({ length: g.xf.length / 8 }, (v, i) => g.proto + ':' + g.xf.subarray(i * 8, i * 8 + 8).join(','))));
  const xs = (w) => new Set(w.instances.flatMap((g) => Array.from({ length: g.xf.length / 8 }, (v, i) => g.xf[i * 8])));
  const kitHash = (w) => hashWorld(w.batches.filter((b) => b.mat !== 'ground' && b.mat !== 'rock').map((b) => [b.mat, b.tint, b.cell, b.pos, b.col]));
  // 씨앗이 다르면 바위의 자리(난수로 뽑는 x)가 하나도 안 겹친다 — 지형만 달라져서 다른 것이 아니다
  const other = xs(generate(vary({ seed: recipe.seed + 1 })));
  assert.equal([...xs(world)].filter((x) => other.has(x)).length, 0, '씨앗이 달라도 바위의 x 가 같다 — 흩기가 세계 씨앗을 안 쓴다');
  // 조각을 목록 앞에 끼워도 뒤에 붙여도 다른 조각의 생김새는 그대로(씨앗 = 조각 이름 + 자리)
  const extra = { piece: 'buoy', at: [recipe.size[0] / 2 - 8, recipe.size[1] / 2 - 8], target: true };       // 과녁 = 따로 그리는 조각이라 정적 묶음을 더하지 않는다
  assert.equal(kitHash(generate(vary({ kit: [extra, ...recipe.kit] }))), kitHash(world), '조각을 앞에 끼웠더니 뒤 조각의 생김새가 바뀌었다');
  assert.equal(kitHash(generate(vary({ kit: [...recipe.kit, extra] }))), kitHash(world), '조각을 뒤에 붙였더니 앞 조각의 생김새가 바뀌었다');
  // 흩기 줄의 차례를 뒤집어도 바위는 그대로, 한 줄의 수를 늘리면 있던 바위는 그대로 두고 더 놓인다(씨앗 = 띠 이름 + 그 띠의 몇 번째 줄)
  const flipped = generate(vary({ scatter: recipe.scatter.slice().reverse() })), more = rows(generate(vary({ scatter: recipe.scatter.map((s, i) => (i === 0 ? { ...s, n: s.n + 8 } : s)) })));
  assert.deepEqual([...rows(flipped)].sort(), [...rows(world)].sort(), '흩기 줄의 차례를 바꿨더니 바위가 달라졌다');
  assert.ok(flipped.stats.staticRocks === world.stats.staticRocks && more.size > rows(world).size && [...rows(world)].every((row) => more.has(row)), '흩는 수를 늘렸더니 있던 바위가 바뀌었다');
  // 같은 띠의 둘째 줄: 띠 표(tune 의 band) 맨 뒤에 띠를 더해도 그 줄의 바위는 그대로다(둘째 줄부터의 씨앗 = 띠 이름 + 몇 번째 줄 — 띠의 수에 안 묶인다)
  const twice = vary({ scatter: [...recipe.scatter, { ...recipe.scatter[0], n: 12 }] }), was = rows(generate(twice));
  try { WORLD.band.extra = { near: 0, far: 1 }; assert.deepEqual([...rows(generate(twice))].sort(), [...was].sort(), '띠를 더했더니 둘째 줄의 바위가 바뀌었다'); } finally { delete WORLD.band.extra; }
  assert.ok(was.size > rows(world).size, '같은 띠의 둘째 줄이 바위를 더 놓지 않았다');
  // 부두의 길이를 안 적으면 기본 길이(PIECES 한 곳)만큼 뻗고, 바위도 그만큼 비운다
  const pier = recipe.kit.find((it) => it.piece === 'pier'), bare = { piece: 'pier', at: pier.at, rot: 0 }, len = PIECES.pier.opt.length[0];
  const crowded = generate(vary({ scatter: [{ what: 'rocks', region: 'shore', n: 1500, size: [0.3, 1.2] }], kit: recipe.kit.map((it) => (it === pier ? bare : it)) }));
  let under = 0;
  for (const g of crowded.instances) for (let i = 0; i < g.xf.length; i += 8) if (Math.abs(g.xf[i] - pier.at[0]) < PIECES.pier.clear / 2 && g.xf[i + 2] > pier.at[1] + PIECES.pier.clear && g.xf[i + 2] < pier.at[1] + len) under++;
  assert.ok(under === 0 && crowded.stats.instances > 500, `길이를 안 적은 부두 밑에 바위가 ${under}개 놓였다(인스턴스 ${crowded.stats.instances})`);
  // collideOver 를 넘는 인스턴스 바위는 충돌에 들어간다: 바위가 보탠 충돌 삼각형 = 정적 바위 + 그런 인스턴스 바위의 삼각형(경계에 꼭 걸친 크기는 봐준다)
  const none = generate(vary({ scatter: [] })), fromRocks = world.stats.collideTris - none.stats.collideTris, tris = world.protos.map((q) => q.idx.length / 3), slack = 1e-4;
  const staticTris = world.batches.filter((b) => b.mat === 'rock').reduce((sum, b) => sum + b.idx.length / 3, 0);
  let sure = 0, maybe = 0;
  for (const g of world.instances) for (let i = 6; i < g.xf.length; i += 8) { const size = g.xf[i] * R.unit; if (size >= R.collideOver + slack) sure += tris[g.proto]; if (size >= R.collideOver - slack) maybe += tris[g.proto]; }
  assert.ok(sure > 0 && fromRocks >= staticTris + sure && fromRocks <= staticTris + maybe, `바위의 충돌 삼각형 ${fromRocks} — 정적 ${staticTris} + 인스턴스 ${sure} ~ ${maybe} 이어야 한다`);
}

export const tests = [
  { name: '형상 도우미: 닫힌 덩이 · 면이 바깥 · 모서리 나누기 · 쪼개기', tags: ['gate', 'world'], run: shapes },
  { name: '지형 도장 여덟: 바탕 · 평평하게 · 길 · 올리기 · 깎기 · 계단밭 · 가로 밀기 · 틈 어둡게', tags: ['gate', 'world'], run: terrainOps },
  { name: '레시피 검사: 모르는 조각 · 세계 밖 표식 · 겹친 표식 · 등불 표시 빠짐 · 틀린 수 → 각각 실패(검사를 건너뛰어도 곧바로 예외)', tags: ['gate', 'world'], run: recipeCheck },
  { name: '생성: 결정성 · 기준 해시 · 시간과 예산 · 꼭짓점 속성 둘 · 바위 규칙 · 표식과 등불 · 해시가 덮는 범위', tags: ['gate', 'world'], run: generation },
  { name: '바위와 땅: 뜬 바위 0 · 통째로 묻힌 바위 0 · 가파른 면에 선 바위 0(가로로 민 뒤의 지형과 견준다)', tags: ['gate', 'world'], run: rocksOnGround },
  { name: '씨앗과 차례: 흩기가 씨앗을 탄다 · 조각 · 흩기 줄이 레시피의 차례에 안 묶인다 · 부두 기본 길이 · 바위의 충돌', tags: ['gate', 'world'], run: seedsAndOrder },
];
