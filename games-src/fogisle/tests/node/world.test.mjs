// 세계 생성(F1a): 형상 도우미(닫힘 · 바깥 보기 · 모서리 나누기 · 쪼개기) · 지형 도장 여덟 · 레시피 검사 · 생성의 결정성과 기준 해시(tests/golden/world.json) ·
// 예산과 시간(tune 의 world.budget) · 생성 결과의 꼴(꼭짓점 속성 둘 · 바위의 정적/인스턴스 규칙 · 등불 표시 · 표식). 값을 못 박지 않고 표 · 기준 파일과 견준다.
// 기준 해시가 바뀌는 것이 맞으면: node tools/preview.mjs <세계> --update-golden (넘겨주기에 까닭을 적는다).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cbox, bar, extrude, lathe, sweep, loft, displace, ico, place, xf } from '../../src/shared/geom/shapes.js';
import { shade, subdivide, placeMesh, dominantAxis } from '../../src/shared/geom/mesh.js';
import { makeTerrain, applyOp, heightAt, meshTerrain, OPS } from '../../src/shared/gen/terrain.js';
import { checkRecipe } from '../../src/shared/gen/recipe.js';
import { generate, genSteps, hashWorld } from '../../src/shared/gen/world.js';
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
}

function recipeCheck() {
  const codes = (r) => [...new Set(checkRecipe(r).map((p) => p.code))], vary = (patch) => ({ ...recipe, ...patch }), marks = (patch) => vary({ marks: { ...recipe.marks, ...patch } });
  assert.deepEqual(checkRecipe(recipe), [], 'slice1 레시피가 검사에 걸린다');
  const lamp = recipe.kit.find((it) => it.piece === 'lamppost'), broken = {
    '모르는 조각': [vary({ kit: [...recipe.kit, { piece: 'tank', at: [0, 0] }] }), 'piece'], '모르는 흩기 띠': [vary({ scatter: [{ what: 'rocks', region: 'moon', n: 3, size: [1, 2] }] }), 'piece'],
    '모르는 지형 도장': [vary({ terrain: [...recipe.terrain, { op: 'melt', area: ['circle', 0, 0, 3] }] }), 'op'],
    '세계 밖 시작 자리': [marks({ spawn: [recipe.size[0], 0, 0] }), 'outside'], '세계 밖 책갈피': [marks({ stations: { far: [0, -recipe.size[1], 0] } }), 'outside'],
    '세계 밖 조각': [vary({ kit: [...recipe.kit, { piece: 'bottle', at: [0, recipe.size[1]] }] }), 'outside'],
    '겹친 책갈피': [marks({ stations: { ...recipe.marks.stations, twin: recipe.marks.stations.camp.slice() } }), 'overlap'],
    '시작 자리와 겹친 과녁': [vary({ kit: [...recipe.kit, { piece: 'bottle', at: recipe.marks.spawn.slice(0, 2), target: true }] }), 'overlap'],
    '등불 표시 빠짐': [vary({ kit: recipe.kit.map((it) => (it === lamp ? { piece: 'lamppost', at: it.at } : it)) }), 'lit'],
    '틀린 등불 표시': [vary({ kit: recipe.kit.map((it) => (it === lamp ? { ...it, lit: 'blink' } : it)) }), 'lit'], '표시 없는 낱 등불': [vary({ lights: [{ at: [0, 10] }] }), 'lit'],
    '대본 스위치와 깨지는 등불이 한 묶음': [vary({ lights: [{ at: [0, 10], lit: 'switch:4' }] }), 'lit'],
  };
  for (const [name, [bad, code]] of Object.entries(broken)) {
    assert.deepEqual(codes(bad), [code], `${name}: [${code}] 만 걸려야 한다 — ${JSON.stringify(checkRecipe(bad))}`);
    assert.throws(() => generate(bad), /레시피 검사 실패/, name + ': 검사에 걸린 레시피로 세계를 만들었다');
  }
  assert.deepEqual(codes({ id: 'x' }), ['shape']);
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
  // 그릴 묶음: 번호가 꼭짓점 수 안 · NaN 없음 · 법선 길이 1 · 주된 입힘 축 = 법선의 가장 큰 축 · 지형만 겹을 가진다 · 큰 얼룩이 꼭짓점 색에 들어 있다
  let tris = 0;
  for (const part of [...world.batches, ...world.protos, ...world.props.flatMap((p) => p.parts)]) {
    const n = part.pos.length / 3;
    assert.ok(part.nor.length === n * 3 && part.col.length === n * 4 && part.axis.length === n && part.idx.every((v) => v < n) && part.pos.every((v) => v === v), part.mat + ': 배열 길이 · 번호 · NaN');
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
  }
  const ground = world.batches.find((b) => b.mat === 'ground'), tones = new Set();
  for (let v = 0; v < ground.col.length; v += 4) tones.add(ground.col[v]);
  assert.ok(tones.size > 12 && tris === st.tris && world.batches.filter((b) => b.mat === 'ground').length === cells, `지형은 32m 칸마다 한 묶음(${cells}) · 큰 얼룩의 밝기 단계 ${tones.size}`);
  // 바위: staticOver 를 넘는 것은 인스턴스에 없다. 충돌은 지형보다 많다(바위 · 조각이 들어 있다)
  for (const g of world.instances) for (let i = 6; i < g.xf.length; i += 8) assert.ok(g.xf[i] * WORLD.rock.unit <= WORLD.rock.staticOver + 1e-4, '2m 넘는 바위가 인스턴스에 있다');
  // 조각을 하나 더해 그 자리의 바위가 비켜나도 다른 바위는 그대로다(바위마다 난수를 같은 수만큼 쓴다)
  const rows = (w) => new Set(w.instances.flatMap((g) => Array.from({ length: g.xf.length / 8 }, (v, i) => g.proto + ':' + g.xf.subarray(i * 8, i * 8 + 8).join(','))));
  const first = world.instances.find((g) => g.xf.length), before = rows(world), after = rows(generate({ ...recipe, kit: [...recipe.kit, { piece: 'bottle', at: [first.xf[0], first.xf[2]] }] }));
  assert.ok(after.size < before.size && after.size >= before.size - 6 && [...after].every((row) => before.has(row)), `조각 하나를 더했더니 다른 바위가 바뀌었다(${before.size} → ${after.size})`);
  assert.ok(world.collide.surf.length === world.collide.idx.length / 3 && world.collide.surf.length > recipe.size[0] * recipe.size[1] * 2 && world.collide.surf.every((s) => s < world.surf.length));
  // 표식과 등불: 책갈피 6 · 과녁 8(등롱 3 · 병 3 · 부표 2) · 등불마다 표시 · 과녁 등롱은 깨지는 등불 · 등대는 스위치 묶음이고 절벽 위에 선다
  const kinds = world.marks.targets.map((m) => m.kind).sort().join(' '), cliff = recipe.terrain[0].cliff.height;
  assert.equal(world.marks.stations.length, 6); assert.equal(kinds, 'bottle bottle bottle buoy buoy lantern lantern lantern');
  for (const l of world.lights) assert.ok((l.mode === 'on' && l.group === -1) || (['switch', 'break'].includes(l.mode) && l.group >= 0 && l.group < 8), '등불 표시: ' + JSON.stringify(l));
  for (const m of world.marks.targets) assert.ok(world.props[m.prop].piece === m.kind && (m.kind === 'lantern') === (m.light >= 0 && world.lights[m.light].mode === 'break'), '과녁: ' + JSON.stringify(m));
  const tower = world.lights.find((l) => l.piece === 'lighthouse');
  assert.ok(tower.mode === 'switch' && tower.at[1] > cliff + 10, '등대의 등은 스위치 묶음이고 절벽 위에 선다');
  assert.ok(world.marks.spawn.at[1] > world.sea && world.marks.stations.every((m) => m.at[1] > world.sea + 1), '시작 자리 · 책갈피는 물 위');
}

export const tests = [
  { name: '형상 도우미: 닫힌 덩이 · 면이 바깥 · 모서리 나누기 · 쪼개기', tags: ['gate', 'world'], run: shapes },
  { name: '지형 도장 여덟: 바탕 · 평평하게 · 길 · 올리기 · 깎기 · 계단밭 · 가로 밀기 · 틈 어둡게', tags: ['gate', 'world'], run: terrainOps },
  { name: '레시피 검사: 모르는 조각 · 세계 밖 표식 · 겹친 표식 · 등불 표시 빠짐 → 각각 실패', tags: ['gate', 'world'], run: recipeCheck },
  { name: '생성: 결정성 · 기준 해시 · 시간과 예산 · 꼭짓점 속성 둘 · 바위 규칙 · 표식과 등불', tags: ['gate', 'world'], run: generation },
];
