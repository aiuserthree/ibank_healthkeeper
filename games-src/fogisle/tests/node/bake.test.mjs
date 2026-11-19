// 굽기(F1b): 결정성(두 번 · 번갈아 · 조각내 · 기준 해시 tests/golden/bake.json) · 시간과 예산(tune 의 bake.budget) · 구운 것의 형식 ·
// 걷기 격자(해변 · 부두 · 길을 덮고 절벽 면 · 덩이 속 · 깊은 물에는 없다 · 걷는 칸에 몸이 선다) · 자동 고리(층이 둘인 칸에서 바닥을 안 뚫는다) · 닿는 무리 ·
// 엄폐 점(몸 폭까지 가려진다) · 구운 빛(처마 밑 · 등불 둘레 · 이음매 · 깨지는 등불) · BVH 질의(빈 나무 · 세로 기둥) ·
// 검증 8종(slice1 통과 · 깨진 레시피 8종이 저마다 그 검증에 걸린다 · 문 1.0m 는 어느 방향으로 돌려도 · 격자에 나란한 0.9m 문 · 계단 1.2m 는 이어진다 · 0.5m 틈은 끊긴다 ·
// 교전 구역의 엄폐 · 섞여 구워진 등불 · 한쪽이 뜬 소품) · 표식의 높이 규칙. 값을 못 박지 않고 표 · 기준 파일과 견준다.
// 기준 해시가 바뀌는 것이 맞으면: node tools/bake.mjs <세계> --update-golden (넘겨주기에 까닭을 적는다).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { generate, genRaw, hashWorld } from '../../src/shared/gen/world.js';
import { bake, bakeSteps, prepSteps, hashBake, stageAt, STAGES } from '../../src/shared/bake/index.js';
import { verify } from '../../src/shared/bake/verify.js';
import { bvhSteps, column, rayHit, rayAny, sphereAny, pillarAny } from '../../src/shared/bake/bvh.js';
import { spanAt, spanPos, DX, DZ } from '../../src/shared/bake/nav.js';
import { VLIGHT, PLIGHT, NO_GROUP } from '../../src/shared/bake/light.js';
import { PIECES } from '../../src/shared/gen/kit.js';
import { clone } from '../../src/shared/state.js';
import { WORLD } from '../../src/shared/tune/world.js';
import { BAKE } from '../../src/shared/tune/bake.js';
import { recipe } from '../../src/data/slice1/recipe.js';
import { cbox, place, xf } from '../../src/shared/geom/shapes.js';
import { doorWorld } from '../worlds/door.mjs';
import { shelfWorld } from '../worlds/shelf.mjs';

const TESTS = resolve(dirname(fileURLToPath(import.meta.url)), '..'), GOLDEN = join(TESTS, 'golden', 'bake.json');
const finish = (it) => { let s = it.next(); while (!s.done) s = it.next(); return s.value; };
const raw = (r) => finish(genRaw(r)), strip = ({ solid, ...baked }) => baked;
// 한 번 구워 여러 시험이 같이 쓴다(구운 것은 안 바뀐다)
const CACHE = {};
function slice1() {
  if (!CACHE.world) { CACHE.world = generate(recipe); CACHE.baked = bake(CACHE.world).baked; }
  return CACHE;
}
const failed = (r) => [...new Set(r.problems.map((p) => p.check))].sort();
const mean = (list) => list.reduce((sum, v) => sum + v, 0) / Math.max(1, list.length);
// 지형 묶음의 꼭짓점 가운데 pick(x, y, z) 에 드는 것의 [묶음, 꼭짓점] 목록
function groundVerts(world, pick) {
  const out = [];
  world.batches.forEach((b, k) => { if (b.mat === 'ground') for (let v = 0; v < b.pos.length / 3; v++) if (pick(b.pos[v * 3], b.pos[v * 3 + 1], b.pos[v * 3 + 2])) out.push([k, v]); });
  return out;
}

function determinism(t) {
  const { world, baked } = slice1(), hash = hashBake(baked), before = hashWorld(world), other = generate({ ...recipe, seed: recipe.seed + 1 }), times = [];
  for (let i = 0; i < 3; i++) { const t0 = performance.now(); bake(world); times.push(performance.now() - t0); }
  assert.equal(hashBake(bake(world).baked), hash, '같은 세계를 두 번 구웠는데 해시가 다르다');
  assert.equal(hashWorld(world), before, '굽기가 세계를 바꿨다');
  // 두 세계를 한 조각씩 번갈아 구워도 혼자 구운 것과 같다(모듈에 숨은 상태가 없다) — 쉬는 자리도 충분히 잦다(조각내 돌릴 수 있다)
  const a = bakeSteps(world), b = bakeSteps(other), stages = [];
  let ra = a.next(), rb = b.next(), yields = 0;
  while (!ra.done || !rb.done) {
    if (!ra.done) { if (typeof ra.value === 'string') stages.push(ra.value); yields++; ra = a.next(); }
    if (!rb.done) rb = b.next();
  }
  assert.equal(hashBake(strip(ra.value)), hash, '번갈아 구운 것이 혼자 구운 것과 다르다');
  const otherHash = hashBake(bake(other).baked);
  assert.equal(hashBake(strip(rb.value)), otherHash); assert.notEqual(otherHash, hash, '씨앗이 다른 세계의 굽기 해시가 같다');
  assert.ok(yields > 40 && stages.every((s) => STAGES.includes(s)) && stages.join() === STAGES.slice(STAGES.indexOf('bvh')).join(), '굽기의 쉬는 자리: ' + yields + ' · ' + stages);
  // 「생성 → 굽기」 한 번에(워커 러너가 돌리는 것): 같은 세계 · 같은 구운 것. 해시는 달라고 할 때만 센다(놀이의 준비 길은 세지 않는다 — hash 가 null)
  const prep = finish(prepSteps(recipe, true)), quiet = finish(prepSteps({ ...recipe, seed: recipe.seed + 1 }));
  assert.deepEqual([prep.hash.world, prep.hash.bake, hashBake(prep.baked)], [before, hash, hash]);
  assert.equal(quiet.hash, null, '달라고 하지 않았는데 준비 길이 해시를 셌다'); assert.equal(hashBake(quiet.baked), otherHash);
  // 준비 띠의 진행: 단계마다의 무게(tune 의 bake.progress)가 단계 이름과 짝이 맞고, 찬 정도는 0 에서 1 까지 줄지 않는다
  const at = STAGES.map((name) => stageAt(name));
  assert.deepEqual(Object.keys(BAKE.progress), [...STAGES]); assert.deepEqual([at[0], at[at.length - 1], stageAt('없는 단계')], [0, 1, 0]);
  assert.ok(at.every((v, i) => i === 0 || v >= at[i - 1]) && new Set(at).size >= STAGES.length - 1, '준비 띠의 진행: ' + at);
  const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')), ms = times.sort((x, y) => x - y)[1];
  assert.equal(hash, golden[recipe.id], `굽기 기준 해시와 다르다 — ${recipe.id}: 기준 ${golden[recipe.id]} · 지금 ${hash}. 바뀌는 것이 맞으면 node tools/bake.mjs ${recipe.id} --update-golden`);
  assert.ok(ms <= BAKE.budget.bakeMs, `굽기 ${ms.toFixed(0)}ms — ${BAKE.budget.bakeMs}ms 안이어야 한다`);
  t.note('굽기 ' + recipe.id, { hash, bakeMs: Math.round(ms * 10) / 10, ...baked.stats });
  clone(baked);        // 일반 객체 · 배열 · 형식 배열만으로 된 나무다(워커에서 넘겨받을 수 있다)
  // 해시는 구운 것의 모든 배열을 덮는다: 종류마다 배열 하나의 값 하나를 바꾸면 해시가 달라진다
  const arrays = new Map(), walk = (node, path) => {
    if (ArrayBuffer.isView(node)) { if (node.length && !arrays.has(path)) arrays.set(path, node); return; }
    if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) walk(v, Array.isArray(node) ? path + '[]' : path + '.' + k);
  };
  walk(baked, 'baked');
  for (const [path, arr] of arrays) { const keep = arr[0]; arr[0] = keep === 1 ? 2 : 1; const changed = hashBake(baked) !== hash; arr[0] = keep; assert.ok(changed, path + ' 의 값을 바꿔도 해시가 같다'); }
  assert.ok(arrays.size >= 24 && hashBake(baked) === hash, '구운 것의 배열 종류: ' + [...arrays.keys()]);
}

function format() {
  const { world, baked } = slice1(), { bvh, nav, links, cover, grid } = baked, tris = world.collide.idx.length / 3;
  // BVH: 삼각형마다 꼭 한 번 · 잎의 상자가 제 삼각형을 품는다
  assert.equal(new Set(bvh.order).size, tris); assert.equal(bvh.tri.length, tris * 9); assert.equal(bvh.meta.length, bvh.count * 2);
  for (let n = 0; n < bvh.count; n++) for (let i = bvh.meta[n * 2], e = bvh.meta[n * 2 + 1] ? i + bvh.meta[n * 2 + 1] : i; i < e; i++) for (let k = 0; k < 9; k++) {
    if (bvh.tri[i * 9 + k] < bvh.nodes[n * 6 + k % 3] || bvh.tri[i * 9 + k] > bvh.nodes[n * 6 + 3 + k % 3]) assert.fail(`BVH 잎 ${n} 의 상자가 삼각형 ${i} 을 못 품는다`);
  }
  // 걷기 격자: 칸의 차례 · 이웃은 서로를 가리키고 높이 차가 오름 높이 안
  const ns = nav.y.length, climb = Math.floor(BAKE.nav.climb / nav.unit + 1e-4);
  assert.ok(nav.start.length === nav.w * nav.d + 1 && nav.start[nav.w * nav.d] === ns && nav.col.length === ns && nav.nb.length === ns * 4 && nav.group.length === ns && nav.door.length === ns);
  for (let s = 0; s < ns; s++) {
    if (!(s >= nav.start[nav.col[s]] && s < nav.start[nav.col[s] + 1])) assert.fail('걷는 칸 ' + s + ' 의 칸 번호가 틀리다');
    for (let d = 0; d < 4; d++) { const v = nav.nb[s * 4 + d]; if (v >= 0 && (nav.nb[v * 4 + (d ^ 2)] !== s || Math.abs(nav.y[v] - nav.y[s]) > climb || nav.group[v] !== nav.group[s])) assert.fail(`걷는 칸 ${s} 의 이웃 ${d} 이 틀리다`); }
  }
  // 고리: 종류마다 높이가 표의 범위 안 · 오르기와 넘기는 같은 닿는 무리
  const L = BAKE.link, u = (m) => m / nav.unit;
  for (let k = 0; k < links.kind.length; k++) {
    const kind = links.kind[k], rise = links.rise[k], ok = kind === 0 ? rise >= u(L.vaultLo) - 1 && rise <= u(L.vaultHi) + 1 : kind === 1 ? rise > climb && rise <= u(L.climbHi) + 1 : rise < -climb && rise >= -u(L.drop) - 1;
    if (!ok || links.from[k] >= ns || links.to[k] >= ns || (kind !== 2 && nav.group[links.from[k]] !== nav.group[links.to[k]])) assert.fail(`고리 ${k}(종류 ${kind} · 높이 ${rise})가 틀리다`);
  }
  assert.ok(baked.stats.vaults > 0 && baked.stats.climbs > 0 && baked.stats.drops > 0 && baked.stats.groups > 1 && baked.stats.links === links.kind.length);
  // 고리는 몸이 실제로 닿는 층으로만: 떨어지기는 내려설 칸의 머리 위가 떠나는 높이의 머리까지 비었고(사이에 다른 층이 없다), 오르기는 떠나는 칸의 머리 위가 올라설 높이의 머리까지 비었다
  const tall = Math.ceil(BAKE.nav.height / nav.unit - 1e-4);
  for (let k = 0; k < links.kind.length; k++) {
    const a = links.from[k], b = links.to[k];
    if (links.kind[k] === 2 && nav.ceil[b] < nav.y[a] + tall) assert.fail(`떨어지기 고리 ${k} 이 다른 층을 뚫는다`);
    if (links.kind[k] === 1 && nav.ceil[a] < nav.y[b] + tall) assert.fail(`오르기 고리 ${k} 의 떠나는 칸 머리 위가 막혔다`);
  }
  // 엄폐 점: 걷는 칸 위 · 막힌 쪽이 있다 · 높은 엄폐는 낮은 엄폐의 부분 · gap 보다 가까운 짝이 없다 · 닿는 무리 번호가 실려 있다 · 시작 자리의 닿는 무리 안에 예산만큼 있다
  const home = spanAt(nav, ...world.marks.spawn.at, 0, BAKE.nav.climb), C = BAKE.cover, p = [0, 0, 0];
  assert.ok(home >= 0 && baked.stats.home === nav.group[home] && baked.stats.coverHome === cover.group.filter((g) => g === nav.group[home]).length && baked.stats.cover === cover.n);
  assert.ok(baked.stats.coverHome >= BAKE.budget.coverMin && cover.pos.length === cover.n * 3, `엄폐 점(시작 자리의 닿는 무리 안) ${baked.stats.coverHome}곳 — ${BAKE.budget.coverMin}곳 이상`);
  for (let k = 0; k < cover.n; k++) {
    assert.ok(cover.span[k] < ns && cover.group[k] === nav.group[cover.span[k]] && cover.low[k] > 0 && cover.low[k] < 16 && (cover.high[k] & ~cover.low[k]) === 0, '엄폐 점 ' + k);
    // 몸 폭까지 가려진다: 막혔다고 적힌 쪽은 옆으로 ±side 비킨 광선도 낮은 · 가운데 높이에서 막힌다(가는 말뚝 · 덩이의 모서리는 엄폐가 아니다)
    spanPos(nav, cover.span[k], p);
    for (let d = 0; d < 4; d++) if (cover.low[k] & (1 << d)) for (const o of [-C.side, C.side]) for (const h of [C.low, C.mid]) {
      if (!rayAny(bvh, p[0] + DZ[d] * o, p[1] + h, p[2] - DX[d] * o, DX[d], 0, DZ[d], C.reach)) assert.fail(`엄폐 점 ${k} 의 ${d} 쪽이 몸 폭까지 가려지지 않는다`);
    }
    for (let j = 0; j < k; j++) if (Math.hypot(cover.pos[k * 3] - cover.pos[j * 3], cover.pos[k * 3 + 2] - cover.pos[j * 3 + 2]) < BAKE.cover.gap - 1e-6 && Math.abs(cover.pos[k * 3 + 1] - cover.pos[j * 3 + 1]) < BAKE.nav.height) assert.fail(`엄폐 점 ${j} · ${k} 이 너무 가깝다`);
  }
  assert.ok(cover.high.some((h) => h > 0) && cover.high.some((h) => h === 0), '낮은 엄폐 · 높은 엄폐가 다 있어야 한다');
  // 구운 빛의 길이: 꼭짓점 × 7 · 인스턴스 줄 × 5 · 과녁 조각 × 5 · 빛 격자는 칸마다 탐침 하나 이상
  world.batches.forEach((b, k) => assert.equal(baked.vlight[k].length, b.pos.length / 3 * VLIGHT, b.mat + ': 꼭짓점 빛의 길이'));
  world.instances.forEach((g, k) => assert.equal(baked.ilight[k].length, g.xf.length / 8 * PLIGHT));
  assert.ok(baked.vlight.length === world.batches.length && baked.plight.length === world.props.length * PLIGHT && grid.data.length === grid.y.length * PLIGHT && grid.start.length === grid.nx * grid.nz + 1);
  for (let c = 0; c < grid.nx * grid.nz; c++) if (grid.start[c + 1] <= grid.start[c]) assert.fail('빛 격자의 칸 ' + c + ' 에 탐침이 없다');
}

function walkGrid() {
  const { world, baked } = slice1(), { nav, bvh } = baked, N = BAKE.nav, p = [0, 0, 0], H = [];
  const at = (x, y, z, rise = N.climb) => spanAt(nav, x, y, z, 0, rise), home = at(...world.marks.spawn.at);
  assert.ok(home >= 0, '시작 자리에 걷는 칸이 없다');
  // 덮는다: 책갈피 · 표식 · 길(레시피의 path 를 따라 0.5m 마다) · 부두(가운데 줄)는 시작 자리와 같은 닿는 무리
  for (const s of world.marks.stations) { const k = at(s.at[0], s.at[1] - WORLD.eye, s.at[2]); assert.ok(k >= 0 && nav.group[k] === nav.group[home], '책갈피 ' + s.id + ' 가 걷기 격자 밖이다'); }
  const path = recipe.terrain.find((op) => op.op === 'path').line, pier = recipe.kit.find((it) => it.piece === 'pier');
  let on = 0, all = 0;
  for (let s = 0; s + 1 < path.length; s++) for (let f = 0; f < 1; f += 0.5 / Math.hypot(path[s + 1][0] - path[s][0], path[s + 1][1] - path[s][1])) {
    const x = path[s][0] + (path[s + 1][0] - path[s][0]) * f, z = path[s][1] + (path[s + 1][1] - path[s][1]) * f, n = column(bvh, x, z, H);
    let top = -Infinity; for (let i = 0; i < n; i++) if (world.collide.owner[bvh.order[H[i * 3 + 2]]] === 0) top = Math.max(top, H[i * 3]);
    all++; if (at(x, top, z) >= 0 && nav.group[at(x, top, z)] === nav.group[home]) on++;
  }
  assert.ok(all > 30 && on / all > 0.9, `길 위의 걷는 칸 ${on} / ${all}`);
  for (let z = pier.at[1] + 1; z < pier.at[1] + pier.length - 1; z += 0.5) { const k = at(pier.at[0], world.sea + pier.deck, z); assert.ok(k >= 0 && nav.group[k] === nav.group[home], '부두 위(z ' + z + ')에 걷는 칸이 없다'); }
  // 없다: 깊은 물속 · 덩이 속(칸 가운데의 수직선에서 위로 「위를 보는 면」이 더 많은 곳) · 가파른 큰 면(절벽 — 지형 삼각형의 가운데)
  const wet = (world.sea - N.wade - nav.y0) / nav.unit - 1;
  for (let s = 0; s < nav.y.length; s++) {
    if (nav.y[s] < wet) assert.fail('깊은 물속에 걷는 칸이 있다: ' + spanPos(nav, s, p));
    if (s % 23) continue;
    spanPos(nav, s, p);
    // 같은 높이 · 같은 쪽의 면은 하나로 센다(칸 가운데가 두 삼각형이 같이 쓰는 모서리에 걸치면 수직선이 둘 다 만난다) — 위를 보는 면이 하나라도 더 많으면 덩이 속이다
    let ups = 0, downs = 0;
    for (let n = column(bvh, p[0], p[2], H), i = 0; i < n; i++) {
      if (H[i * 3] <= p[1] + nav.unit / 2) continue;
      let twin = false;
      for (let j = 0; j < i && !twin; j++) twin = H[j * 3 + 1] === H[i * 3 + 1] && Math.abs(H[j * 3] - H[i * 3]) < 1e-4;
      if (!twin) { if (H[i * 3 + 1]) ups++; else downs++; }
    }
    if (ups > downs) assert.fail('덩이 속에 걷는 칸이 있다: ' + p);
  }
  // 걷는 칸에 몸이 선다(가장자리 깎기 = 칸 가운데에서 장애물까지 몸 반지름): 시작 자리의 닿는 무리의 칸 가운데에서 높이 셋 × 여덟 쪽으로 반지름만큼의 광선이 아무것에도 안 맞는다
  let stood = 0;
  for (let s = 0; s < nav.y.length; s += 5) {
    if (nav.group[s] !== nav.group[home]) continue;
    spanPos(nav, s, p); stood++;
    for (const h of [N.climb + 0.15, N.height / 2, N.height - 0.15]) for (let d = 0; d < 8; d++) {
      if (rayAny(bvh, p[0], p[1] + h, p[2], Math.cos(d * Math.PI / 4), 0, Math.sin(d * Math.PI / 4), N.radius)) assert.fail(`걷는 칸 [${p}] 에서 몸(반지름 ${N.radius})이 높이 ${h} 에서 걸린다`);
    }
  }
  assert.ok(stood > 2000, '(시험의 전제) 몸을 세워 본 칸: ' + stood);
  const C = world.collide;
  let steep = 0;
  for (let t = 0; t < C.owner.length && C.owner[t] === 0; t++) {
    const [a, b, c] = [0, 1, 2].map((e) => C.idx[t * 3 + e] * 3), ux = C.pos[b] - C.pos[a], uy = C.pos[b + 1] - C.pos[a + 1], uz = C.pos[b + 2] - C.pos[a + 2], vx = C.pos[c] - C.pos[a], vy = C.pos[c + 1] - C.pos[a + 1], vz = C.pos[c + 2] - C.pos[a + 2];
    const ny = uz * vx - ux * vz, len = Math.hypot(uy * vz - uz * vy, ny, ux * vy - uy * vx), tall = Math.max(C.pos[a + 1], C.pos[b + 1], C.pos[c + 1]) - Math.min(C.pos[a + 1], C.pos[b + 1], C.pos[c + 1]);
    if (!(ny / len < 0.5 && tall > 1.5)) continue;
    steep++;
    if (at((C.pos[a] + C.pos[b] + C.pos[c]) / 3, (C.pos[a + 1] + C.pos[b + 1] + C.pos[c + 1]) / 3, (C.pos[a + 2] + C.pos[b + 2] + C.pos[c + 2]) / 3, 0.3) >= 0) assert.fail('절벽 면 한가운데에 걷는 칸이 있다(삼각형 ' + t + ')');
  }
  assert.ok(steep > 500, '(시험의 전제) 절벽 면의 삼각형 수: ' + steep);
  // 돌려 넣은 키트(상자 · 드럼통 · 보트)까지 덮는다: 그 자리의 땅은 걷는 칸이 아니고, 엄폐로 둔 큰 상자 곁에는 엄폐 점이 있다
  recipe.kit.forEach((it, k) => {
    if (!PIECES[it.piece].loose) return;
    const tri = Array.from(C.owner).indexOf(2 + k), ground = Math.max(...[...Array(column(bvh, it.at[0], it.at[1], H)).keys()].filter((i) => C.owner[bvh.order[H[i * 3 + 2]]] === 0).map((i) => H[i * 3]));
    assert.ok(tri >= 0 && at(it.at[0], ground, it.at[1], 0.2) < 0, `${it.piece} [${it.at}] 밑의 땅이 걷는 칸이다 — 굽기가 그 조각을 못 봤다`);
    const near = [...Array(baked.cover.n).keys()].some((c) => Math.hypot(baked.cover.pos[c * 3] - it.at[0], baked.cover.pos[c * 3 + 2] - it.at[1]) < it.size * 0.5 + 1.2);
    if (it.piece === 'crate' && it.size * 0.8 >= BAKE.cover.mid + 0.1) assert.ok(near, `큰 상자 [${it.at}] 곁에 엄폐 점이 없다`);
  });
}

function light() {
  const { world, baked } = slice1(), L = BAKE.light, floor = Math.round(L.floor * 255), byte = (k, v, i) => baked.vlight[k][v * VLIGHT + i], sky = (list) => mean(list.map(([k, v]) => byte(k, v, 0)));
  for (const data of baked.vlight) for (let i = 0; i < data.length; i += VLIGHT) {
    if (data[i] < floor || (data[i + 4] !== 0 && data[i + 4] !== 255) || (data[i + 5] !== NO_GROUP && (data[i + 5] >= WORLD.lit.groups || data[i + 6] === 0)) || (data[i + 5] === NO_GROUP && data[i + 6] !== 0)) assert.fail('꼭짓점 빛 한 줄이 틀리다: ' + data.subarray(i, i + VLIGHT));
  }
  // 처마 밑이 어둡다: 부두 판자 밑의 땅은 트인 물가의 땅보다 하늘이 훨씬 덜 열려 있다. 트인 해변은 거의 다 열려 있다.
  const pier = recipe.kit.find((it) => it.piece === 'pier'), wide = pier.width || PIECES.pier.opt.width[0], under = groundVerts(world, (x, y, z) => Math.abs(x - pier.at[0]) < wide / 2 - 0.4 && z > pier.at[1] + 2 && z < pier.at[1] + pier.length - 2);
  const open = groundVerts(world, (x, y, z) => Math.abs(x - pier.at[0]) > 8 && Math.abs(x - pier.at[0]) < 14 && z > pier.at[1] + 6 && z < pier.at[1] + pier.length - 2);
  assert.ok(under.length > 10 && open.length > 50 && sky(open) > 200 && sky(under) < sky(open) * 0.6, `부두 밑 ${sky(under).toFixed(0)}(${under.length}) · 트인 물가 ${sky(open).toFixed(0)}(${open.length})`);
  // 등불 둘레가 밝다: 늘 켜진 등불 기둥 발치의 땅에 따뜻한 빛(R ≥ G ≥ B)이 구워지고, 멀어지면 어두워져 반지름 밖에서는 0 이다
  const lamps = world.lights.filter((l) => l.mode === 'on'), post = lamps.find((l) => l.piece === 'lamppost'), far = (l, x, z) => Math.hypot(x - l.at[0], z - l.at[2]);
  const lampSum = (list) => mean(list.map(([k, v]) => byte(k, v, 1) + byte(k, v, 2) + byte(k, v, 3))), ring = (a, b) => groundVerts(world, (x, y, z) => far(post, x, z) >= a && far(post, x, z) < b);
  assert.ok(lampSum(ring(0, 3)) > lampSum(ring(5, 8)) && lampSum(ring(5, 8)) > 0 && lampSum(ring(0, 3)) > 60, `등불 발치 ${lampSum(ring(0, 3)).toFixed(0)} · 5 ~ 8m ${lampSum(ring(5, 8)).toFixed(0)}`);
  for (const [k, v] of ring(0, 3)) assert.ok(byte(k, v, 1) >= byte(k, v, 2) && byte(k, v, 2) >= byte(k, v, 3), '등불 빛의 색이 따뜻하지 않다');
  // 가려진 곳에는 안 닿는다: 등불 기둥 하나만 닿는 땅의 꼭짓점마다, 등불까지의 줄이 트였는가(가장 가까운 맞은 곳으로 따로 잰다) = 구운 빛이 있는가
  const hit = { slot: -1, back: false }, alone = groundVerts(world, (x, y, z) => lamps.filter((l) => Math.hypot(x - l.at[0], y - l.at[1], z - l.at[2]) < l.radius).length === 1 && Math.hypot(x - post.at[0], y - post.at[1], z - post.at[2]) < post.radius * 0.8);
  let shadowed = 0, wrong = 0;
  for (const [k, v] of alone) {
    const b = world.batches[k], n = [b.nor[v * 3], b.nor[v * 3 + 1], b.nor[v * 3 + 2]], o = [0, 1, 2].map((c) => b.pos[v * 3 + c] + n[c] * L.bias), to = [0, 1, 2].map((c) => post.at[c] - o[c]), d = Math.hypot(...to);
    if ((n[0] * to[0] + n[1] * to[1] + n[2] * to[2]) / d <= 0.05) continue;
    const clear = rayHit(baked.bvh, o[0], o[1], o[2], to[0] / d, to[1] / d, to[2] / d, d - L.lampSkip, hit) >= d - L.lampSkip;
    if (!clear) shadowed++;
    if (clear !== byte(k, v, 1) > 0) wrong++;
  }
  assert.ok(alone.length > 100 && shadowed > 5 && wrong === 0, `등불 기둥 둘레 ${alone.length} 꼭짓점 · 가려진 것 ${shadowed} · 구운 값이 가림과 어긋난 것 ${wrong}`);
  const dark = groundVerts(world, (x, y, z) => lamps.every((l) => Math.hypot(x - l.at[0], y - l.at[1], z - l.at[2]) > l.radius + 0.5));
  assert.ok(dark.length > 1000 && lampSum(dark) === 0, '늘 켜진 등불의 반지름 밖에 등불 빛이 구워졌다');
  // 깨지는 등롱은 「늘 켜진 빛」에 없고 제 스위치 묶음으로만 구워진다(늘 켜진 등불에서 먼 등롱으로 본다). 등대(대본 스위치)의 묶음도 어딘가에는 구워진다
  //   (등대의 등은 제 지붕 · 난간에 세게 닿고, 먼 땅에도 아주 약하게 닿는다 — 반지름이 조각 세계를 다 덮는다).
  const breakable = world.lights.filter((x) => x.mode === 'break' && lamps.every((o) => Math.hypot(x.at[0] - o.at[0], x.at[2] - o.at[2]) > o.radius + 3));
  assert.ok(breakable.length > 0, '(시험의 전제) 늘 켜진 등불에서 먼 깨지는 등롱이 있어야 한다');
  for (const l of breakable) {
    const near = groundVerts(world, (x, y, z) => Math.hypot(x - l.at[0], y - l.at[1], z - l.at[2]) < Math.min(3, l.radius / 2));
    assert.ok(near.length > 3 && lampSum(near) === 0 && near.filter(([k, v]) => byte(k, v, 5) === l.group && byte(k, v, 6) > 0).length > near.length / 2, `${l.piece}(${l.mode}:${l.group}) 둘레 ${near.length} 꼭짓점이 스위치 묶음으로 구워지지 않았다`);
  }
  const tower = world.lights.find((x) => x.mode === 'switch');
  assert.ok(baked.vlight.some((d) => d.some((v, i) => i % VLIGHT === 5 && v === tower.group && d[i + 1] > 0)), '대본 스위치(등대)의 묶음이 어디에도 구워지지 않았다');
  // 이음매: 두 지형 묶음이 같은 자리 · 같은 법선의 꼭짓점을 따로 가져도 구운 값이 같다(광선을 번호가 아니라 자리로 흩는다)
  const seen = new Map();
  let twins = 0;
  world.batches.forEach((b, k) => { if (b.mat === 'ground') for (let v = 0; v < b.pos.length / 3; v++) {
    const key = [...b.pos.subarray(v * 3, v * 3 + 3), ...b.nor.subarray(v * 3, v * 3 + 3)].join(','), row = baked.vlight[k].subarray(v * VLIGHT, v * VLIGHT + VLIGHT).join(',');
    if (seen.has(key)) { twins++; assert.equal(row, seen.get(key), '이음매의 두 꼭짓점이 다른 값으로 구워졌다 — 줄이 생긴다: ' + key); } else seen.set(key, row);
  } });
  assert.ok(twins > 200, '(시험의 전제) 이음매의 꼭짓점 짝: ' + twins);
  // 인스턴스 · 빛 격자: 트인 해변의 탐침은 하늘이 열려 있고, 절벽 밑동의 바위는 덜 열려 있다(값이 한 가지가 아니다)
  const inst = baked.ilight.flatMap((d) => Array.from({ length: d.length / PLIGHT }, (v, i) => d[i * PLIGHT])), s = world.marks.spawn.at, g = baked.grid;
  const cell = Math.floor((s[2] - g.z0) / g.cell) * g.nx + Math.floor((s[0] - g.x0) / g.cell);
  assert.ok(new Set(inst).size > 4 && Math.max(...inst) === 255 && g.data[g.start[cell] * PLIGHT] > 200 && Math.abs(g.y[g.start[cell]] - s[1] - L.probeUp) < 1, '인스턴스 빛 · 빛 격자');
}

async function checks(t) {
  const { world, baked } = slice1(), clean = verify(world, baked, recipe);
  assert.deepEqual(clean.problems, [], 'slice1 이 검증 8종에 걸린다');
  assert.ok(clean.samples > 100 && clean.reached > 1000, '(시험의 전제) 검증이 본 걷는 자리: ' + clean.samples);
  // 깨진 레시피 8종: 저마다 「그 검증」에 걸린다(같이 걸릴 수밖에 없는 것은 파일의 also 에 적혀 있다) — 여덟이 검증 1 ~ 8 을 하나씩 맡는다
  const dir = join(TESTS, 'broken-recipes'), seen = [], notes = {};
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.mjs')).sort()) {
    const mod = await import(pathToFileURL(join(dir, file)).href), bad = raw(mod.recipe), r = verify(bad, bake(bad).baked, mod.recipe), want = [mod.expect.check, ...(mod.also || [])].sort();
    assert.deepEqual(failed(r), want, `${file}: 검증 ${want} 에만 걸려야 한다 — ${JSON.stringify(r.counts)}`);
    assert.ok(r.problems.some((p) => p.check === mod.expect.check && p.code === mod.expect.code), `${file}: [${mod.expect.code}] 가 없다 — ${JSON.stringify(r.counts)}`);
    seen.push(mod.expect.check); notes[file.replace('.mjs', '')] = r.counts;
  }
  assert.deepEqual(seen.sort(), [1, 2, 3, 4, 5, 6, 7, 8], '깨진 레시피가 검증 여덟을 하나씩 맡아야 한다');
  t.note('깨진 레시피 8종', notes);
  // 교전 구역의 엄폐(검증 8): 엄폐물이 있는 야영지는 통과하고, 트인 물가의 구역은 걸린다(시작 자리의 닿는 무리 안의 점만 센다 — 구운 것은 그대로 두고 구역만 바꿔 본다)
  const zoned = (area) => verify({ ...world, zones: [{ area, fight: true }] }, baked, recipe), camp = recipe.kit.find((it) => it.piece === 'crate').at, sp = world.marks.spawn.at;
  assert.deepEqual(zoned(['circle', camp[0], camp[1], 9]).problems, [], '엄폐물이 있는 교전 구역(야영지)이 걸린다');
  const bare = zoned(['circle', sp[0], sp[2] + 2, 2.5]);
  assert.ok(failed(bare).join() === '8' && bare.problems.every((q) => q.code === 'cover'), '엄폐 없는 교전 구역을 못 잡았다: ' + JSON.stringify(bare.counts));
  // 책갈피도 닿는 무리 안이어야 한다(검증 1): 책갈피 하나를 절벽 위 고원(「떨어진 섬」 레시피가 표식을 두는 자리)에 세우면 걸린다 — 지형은 그대로라 구운 것을 그대로 쓴다
  const island = await import(pathToFileURL(join(TESTS, 'broken-recipes', 'island.mjs')).href), up = raw(island.recipe).marks.points.supply;
  const strayed = verify({ ...world, marks: { ...world.marks, stations: [...world.marks.stations, { id: 'far', at: [up[0], up[1] + WORLD.eye, up[2]], yaw: 0, pitch: 0 }] } }, baked, recipe);
  assert.ok(failed(strayed).join() === '1' && strayed.problems.some((q) => /책갈피 far/.test(q.msg)), '닿지 않는 책갈피를 못 잡았다: ' + JSON.stringify(strayed.problems));
  // 섞여 구워진 등불(검증 7): 구운 「늘 켜진 빛」의 값 하나를 바꾸면(굽기가 다른 등불을 섞은 꼴) 다시 잰 값과 달라 걸린다
  const k0 = world.batches.findIndex((b) => b.mat === 'ground'), mixed = { ...baked, vlight: baked.vlight.map((d, k) => (k === k0 ? d.slice() : d)) };
  mixed.vlight[k0][BAKE.verify.lampCheck * 3 * VLIGHT + 1] ^= 64;
  const lit = verify(world, mixed, recipe);
  assert.ok(failed(lit).join() === '7' && lit.problems.some((q) => q.code === 'light' && /섞여/.test(q.msg)), '섞여 구워진 등불을 못 잡았다: ' + JSON.stringify(lit.counts));
  assert.ok(clean.notes.switchChecked > 1000 && clean.notes.switchOverlap >= 0 && clean.notes.edgeSamples > 100, '검증의 알림: ' + JSON.stringify(clean.notes));
  // 문과 계단: 마당 · 방 · 지붕이 한 무리로 이어지고 검증 8종을 통과한다. 좁히면 끊기고 그 검증이 잡는다.
  const tryDoor = (...args) => { const w = doorWorld(...args), b = bake(w).baked, g = (p2) => { const k = spanAt(b.nav, p2[0], p2[1], p2[2], 0, BAKE.nav.climb); return k < 0 ? -1 : b.nav.group[k]; }; return { w, b, r: verify(w, b, null), groups: [g(w.marks.spawn.at), g(w.marks.points.room), g(w.marks.points.roof)] }; };
  const joined = (t) => t.groups[0] >= 0 && t.groups.every((g) => g === t.groups[0]), good = tryDoor(1, 1.2);
  assert.ok(joined(good), '문 1.0m · 계단 1.2m 세계에서 길이 끊겼다: ' + good.groups);
  // 문 밑의 걷는 칸: 가운데가 양쪽 문틀에서 몸 반지름 넘게 떨어진 칸(폭 − 2 × 반지름의 띠)이 문턱의 줄마다 있다
  const doorCells = good.b.nav.door.filter((d) => d === 1).length, across = Math.floor((1 - 2 * BAKE.nav.radius) / BAKE.nav.cell);
  assert.ok(across >= 1 && doorCells >= 2 * across, `문 밑의 걷는 칸 ${doorCells} — 줄마다 ${across}칸씩 두 줄은 있어야 한다`);
  assert.deepEqual(good.r.problems, [], '문 · 계단 세계가 검증에 걸린다');
  // 1.0m 문은 건물을 어느 방향으로 돌려도 · 격자에서 비낀 자리에서도 이어진다(가장자리 깎기가 칸 수가 아니라 장애물까지의 거리다 — 문틀이 한 칸씩 부풀지 않는다)
  const SHIFTS = [[0, 0], [0.07, 0.11], [0.125, 0.125], [0.2, 0.06]];
  for (const turn of [22.5, 30, 45, 60]) for (const [ox, oz] of SHIFTS) {
    const t = tryDoor(1, 1.2, false, turn, ox, oz);
    assert.ok(joined(t) && t.r.problems.length === 0, `1.0m 문을 ${turn}° 돌린 건물(옮김 ${ox}, ${oz})에서 길이 끊겼다: ${t.groups} · ${JSON.stringify(t.r.counts)}`);
  }
  // 격자에 나란한 0.9m 문(tdd §4-3 의 가장 좁은 문)도 어느 자리에서나 이어진다
  for (const [ox, oz] of SHIFTS) { const t = tryDoor(0.9, 1.2, false, 0, ox, oz); assert.ok(joined(t) && t.r.problems.length === 0, `0.9m 문(옮김 ${ox}, ${oz})에서 길이 끊겼다: ${t.groups}`); }
  // 몸(지름 0.6m)이 못 지나가는 0.5m 틈은 어떻게 놓아도 끊기고 검증 1 · 2 가 잡는다. 0.3m 계단도 끊긴다.
  for (const [turn, ox, oz] of [[0, 0, 0], [0, 0.125, 0.125], [30, 0.07, 0.11], [45, 0, 0]]) {
    const t = tryDoor(0.5, 1.2, false, turn, ox, oz);
    assert.ok(t.groups[1] !== t.groups[0] && failed(t.r).join() === '1,2', `0.5m 틈(${turn}° · 옮김 ${ox}, ${oz})이 이어졌다: ` + JSON.stringify(t.r.counts));
  }
  const thin = tryDoor(1, 0.3), leaky = tryDoor(1, 1.2, true);
  assert.ok(thin.groups[2] !== thin.groups[0] && failed(thin.r).join() === '1', '0.3m 계단: ' + JSON.stringify(thin.r.counts));
  assert.equal(failed(leaky.r).join(), '4', '벽이 뚫린 닫힌 구역: ' + JSON.stringify(leaky.r.counts));
  // 얹는 소품(검증 6): 반듯이 놓인 상자는 통과하고, 한쪽 모서리만 땅에 닿게 기운 상자는 「한쪽이 떴다」로 걸린다(세계의 kit 이름으로 소품을 안다 — 레시피 없이)
  const withCrate = (soup) => {
    const w = doorWorld(), old = w.collide.owner.length, pos = Float32Array.from([...w.collide.pos, ...soup]), n = pos.length / 9;
    w.collide = { pos, idx: Uint32Array.from({ length: n * 3 }, (v, i) => i), surf: new Uint8Array(n), owner: Uint16Array.from({ length: n }, (v, t) => (t < old ? w.collide.owner[t] : 4)) };
    w.kit = ['wall', 'wall', 'crate'];
    return verify(w, bake(w).baked, null);
  };
  assert.deepEqual(withCrate(place(cbox(1.4, 1.1, 1.4), xf(7, 0.51, 6))).problems, [], '반듯이 놓인 상자가 걸린다');
  const tipped = withCrate(place(cbox(1.4, 1.1, 1.4), xf(7, 0.7, 6, 0, 0, 0.3)));
  assert.ok(failed(tipped).join() === '6' && tipped.problems.some((q) => /한쪽/.test(q.msg)), '한쪽이 뜬 상자를 못 잡았다: ' + JSON.stringify(tipped.problems));
  // 뒷면이 보이는 구멍: 방의 북쪽 벽을 뒤집으면(면이 안쪽을 본다) 방 안의 눈높이 광선이 뒷면에 맞는다
  const flipped = doorWorld(1, 1.2), P = flipped.collide.pos;
  for (let v = 0; v < P.length; v += 9) if (Math.max(P[v + 2], P[v + 5], P[v + 8]) <= -2.5 && Math.min(P[v + 2], P[v + 5], P[v + 8]) >= -2.8 && Math.min(P[v + 1], P[v + 4], P[v + 7]) < 2.8) for (let c = 0; c < 3; c++) { const keep = P[v + 3 + c]; P[v + 3 + c] = P[v + 6 + c]; P[v + 6 + c] = keep; }
  const hole = verify(flipped, bake(flipped).baked, null);
  assert.ok(hole.problems.some((p) => p.check === 4 && /뒷/.test(p.msg)), '뒤집힌 벽의 뒷면을 못 봤다: ' + JSON.stringify(hole.counts));
  // (자가 눈이 멀지 않았는가) 광선이 벽을 정말 맞힌다
  assert.ok(rayHit(good.b.bvh, 0, 1.7, 0, 0, 0, -1, 50, { slot: -1, back: false }) < 3);
}

// 층이 둘인 칸의 자동 고리(단 + 선반): 단에서 선반 쪽으로 난 떨어지기는 전부 선반 위로 간다 — 선반 밑의 땅(바닥을 뚫는 길)으로는 하나도 안 간다.
//   선반에서는 땅으로 내려갈 수 있다(한 번에 한 층씩).
function layers() {
  const w = shelfWorld(), b = bake(w).baked, nav = b.nav, L = b.links, p = [0, 0, 0], q = [0, 0, 0], high = 2.5, shelf = 1.95, near = (y, to) => Math.abs(y - to) < nav.unit * 1.5;
  assert.ok(high <= BAKE.link.drop, '(시험의 전제) 단의 높이가 떨어지기 한도 안이어야 한다');
  assert.ok(spanAt(nav, -2, high, 0, 0, 0.2) >= 0 && spanAt(nav, 1.5, shelf, 0, 0, 0.2) >= 0 && spanAt(nav, 1.5, 0, 0, 0, 0.2) >= 0, '(시험의 전제) 단 위 · 선반 위 · 선반 밑 땅에 걷는 칸이 있어야 한다');
  let toShelf = 0, through = 0, down = 0;
  for (let k = 0; k < L.kind.length; k++) {
    if (L.kind[k] !== 2) continue;
    spanPos(nav, L.from[k], p); spanPos(nav, L.to[k], q);
    if (near(p[1], high) && q[0] > 0 && q[0] < 3 && Math.abs(q[2]) < 3) { if (near(q[1], shelf)) toShelf++; else through++; }
    if (near(p[1], shelf) && near(q[1], 0)) down++;
  }
  assert.ok(toShelf >= 10 && through === 0 && down >= 10, `단 → 선반 위 ${toShelf} · 단 → 선반 밑 땅(뚫는 고리) ${through} · 선반 → 땅 ${down}`);
  assert.deepEqual(verify(w, b, null).problems, [], '단 · 선반 세계가 검증에 걸린다');
}

// BVH 질의의 가장자리: 삼각형이 없는 나무에서 질의가 끝나고 「없다」고 답한다 · 세로 기둥 질의(가로 거리 · 높이 띠 · 점이 면 안)
function queries() {
  const hit = { slot: 0, back: true }, out = [], empty = finish(bvhSteps(new Float32Array(0), new Uint32Array(0)));
  assert.deepEqual([rayAny(empty, 0, 0, 0, 0, 1, 0, 9), rayHit(empty, 0, 0, 0, 0, 1, 0, 9, hit), hit.slot, column(empty, 0, 0, out), sphereAny(empty, 0, 0, 0, 1), pillarAny(empty, 0, 0, 0, 2, 1)], [false, 9, -1, 0, false, false]);
  // x = 1 에 선 벽(높이 0 ~ 2 · z −1 ~ 1) + 높이 1 의 누운 판(x 3 ~ 5 · z −1 ~ 1)
  const pos = Float32Array.from([1, 0, -1, 1, 2, -1, 1, 2, 1, 1, 0, -1, 1, 2, 1, 1, 0, 1, 3, 1, -1, 3, 1, 1, 5, 1, 1, 3, 1, -1, 5, 1, 1, 5, 1, -1]);
  const bvh = finish(bvhSteps(pos, Uint32Array.from({ length: 12 }, (v, i) => i))), r = BAKE.nav.radius, far = (x, z, y0, y1) => pillarAny(bvh, x, z, y0, y1, r);
  assert.deepEqual([far(1 - r - 0.02, 0, 0.5, 1.5), far(1 - r + 0.02, 0, 0.5, 1.5), far(1 + r - 0.02, 0, 0.5, 1.5), far(1 + r + 0.02, 0, 0.5, 1.5)], [false, true, true, false], '벽까지의 가로 거리');
  assert.deepEqual([far(0.9, 0, 2.1, 3), far(0.9, 0, -1, -0.1), far(0.9, 0, 1.9, 3), far(0.9, 1 + r + 0.05, 0.5, 1.5), far(0.9, 1 + r - 0.05, 0.5, 1.5)], [false, false, true, false, true], '높이 띠 · 벽의 끝');
  assert.deepEqual([far(4, 0, 0.5, 1.5), far(4, 0, 1.1, 1.5), far(4, 0, 0.2, 0.9), far(5 + r + 0.02, 0, 0.5, 1.5), far(5 + r - 0.02, 0, 0.5, 1.5)], [true, false, false, false, true], '누운 판(점이 면 안 · 띠 밖 · 가장자리)');
}

// 표식의 높이 규칙 하나: 설 수 있는 가장 낮은 바닥(끝에 'top' 이면 가장 높은 바닥) — 설 바닥이 없으면 민 뒤의 땅에 두고 검증이 잡는다
function markHeights() {
  const pier = recipe.kit.find((it) => it.piece === 'pier'), tower = recipe.kit.find((it) => it.piece === 'lighthouse'), z = pier.at[1] + pier.length - 2.2;
  const w = generate({ ...recipe, marks: { ...recipe.marks, stations: { ...recipe.marks.stations, deck: [pier.at[0] + 0.7, z, 0, 0, 'top'], wade: [pier.at[0] - 0.7, z, 0, 0], foot: [tower.at[0], tower.at[1] + 4.2, 0, 0] }, doors: { gate: [-2, 22, 90, 1.4] } } });
  const y = (id) => w.marks.stations.find((s) => s.id === id).at[1] - WORLD.eye, cliff = recipe.terrain[0].cliff.height;
  assert.ok(y('deck') > w.sea + pier.deck - 0.1 && y('wade') < w.sea && y('wade') >= w.sea - BAKE.nav.wade, `부두 위(top) ${y('deck')} · 부두 밑(얕은 물) ${y('wade')}`);
  assert.ok(y('foot') < cliff + 6, '탑 발치의 책갈피가 난간 바닥에 섰다: ' + y('foot'));
  assert.deepEqual([w.marks.doors.length, w.marks.doors[0].id, w.marks.doors[0].width], [1, 'gate', 1.4]); assert.ok(Math.abs(w.marks.doors[0].yaw - Math.PI / 2) < 1e-9 && w.marks.doors[0].at[1] > w.sea);
  assert.deepEqual(generate(recipe).marks.doors, []);
}

export const tests = [
  { name: '굽기: 결정성(두 번 · 번갈아 · 생성 → 굽기 한 번에) · 기준 해시 · 시간 · 해시가 덮는 범위', tags: ['gate', 'bake', 'determinism'], run: determinism },
  { name: '구운 것의 꼴: BVH · 걷기 격자의 이웃 · 자동 고리(다른 층을 안 뚫는다) · 닿는 무리 · 엄폐 점(닿는 무리 안 25곳 이상 · 몸 폭까지 가려진다) · 빛의 길이', tags: ['gate', 'bake'], run: format },
  { name: '걷기 격자: 해변 · 부두 · 길을 덮고 깊은 물 · 덩이 속 · 절벽 면에는 없다 · 걷는 칸에 몸이 선다 · 돌려 넣은 키트까지 덮는다', tags: ['gate', 'bake'], run: walkGrid },
  { name: '구운 빛: 처마 밑이 어둡다 · 등불 둘레가 밝다 · 깨지는 등불은 스위치 묶음으로만 · 이음매 · 인스턴스와 빛 격자', tags: ['gate', 'bake'], run: light },
  { name: '검증 8종: slice1 통과 · 깨진 레시피 8종이 저마다 걸린다 · 교전 구역의 엄폐 · 섞인 등불 · 문 1.0m(돌려도) · 0.9m · 계단 1.2m 는 이어지고 0.5m 틈은 끊긴다 · 뜬 소품 · 뒷면', tags: ['gate', 'bake'], run: checks },
  { name: '자동 고리: 층이 둘인 칸(단 + 선반)에서 떨어지기가 바닥을 뚫지 않는다', tags: ['gate', 'bake'], run: layers },
  { name: 'BVH 질의: 삼각형이 없는 나무에서 끝난다 · 세로 기둥(가로 거리 · 높이 띠)', tags: ['gate', 'bake'], run: queries },
  { name: '표식의 높이: 설 수 있는 가장 낮은 바닥 · top · 문 표식', tags: ['gate', 'bake', 'world'], run: markHeights },
];
