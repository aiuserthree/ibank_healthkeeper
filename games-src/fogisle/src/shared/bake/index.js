// 주는 것: 굽기 — bakeSteps(세계 → 구운 것. 조각내 돌릴 수 있는 function*) · bake(끝까지) · prepSteps(레시피[, 해시를 셀까] → { world, baked, hash } — 「생성 → 굽기」를 한 번에:
//   타이틀의 준비가 워커 러너로 이것을 돌린다) · hashBake · STAGES(쉬는 자리의 이름 차례) · stageAt(단계 이름 → 그 단계가 시작될 때 준비 띠가 찬 정도 0 ~ 1) · BAKE_VERSION.
// **해시는 달라고 할 때만 센다**(구운 것을 통째로 훑는 일이라 임무 크기에서 「생성 + 굽기」의 9% 다): 놀이의 준비 길(prepSteps(레시피))은 세지 않고 hash = null 이다.
//   세는 곳 = Node 의 시험과 tools/bake.mjs(hashBake) · 하네스(받은 배열을 주 창에서 다시 센다) · 개발판의 주소 ?bakehash=1(준비 길에서 prepSteps(레시피, true)).
// 받는 것: bvh · nav · links · light · gen/world · state(해시) · tune/bake. three · DOM 을 모른다 — Node · 크롬 주 스레드 · 워커 · 조각내 돌린 것이 같은 비트를 낸다.
// 구운 것(일반 객체 · 형식 배열만 — 워커에서 넘겨받고 hashState 로 해시한다. 세계(world)는 바뀌지 않는다):
//   bvh     충돌 삼각형 전부의 BVH(bvh.js 머리 주석) — 광선 · 지면 붙기 · 캡슐
//   nav     걷기 격자(nav.js 머리 주석) + group(닿는 무리) · door(문 번호)        links  자동 고리(links.js 머리 주석)
//   cover   엄폐 점(links.js 머리 주석 — 점마다 닿는 무리 번호가 있다)            grid   빛 격자(light.js 머리 주석)
//   vlight  꼭짓점 빛 v1: world.batches 와 같은 차례의 Uint8Array(꼭짓점 수 × 7)   ilight 인스턴스 빛: world.instances 와 같은 차례의 Uint8Array(줄 수 × 5)
//   plight  과녁 조각의 빛: Uint8Array(world.props 수 × 5)                         stats  수 보고(걷는 칸 · 무리 · 고리 종류별 · 엄폐 점 cover(전부) ·
//           coverHome(시작 자리의 닿는 무리 안 — 예산과 끝 기준은 이 값) · home(시작 자리의 닿는 무리 번호, 없으면 −1) · 빛 격자의 탐침 …)
// 검증 8종은 여기서 돌리지 않는다(shared/bake/verify.js — Node 의 tools/bake.mjs 와 시험이 돌린다. 불러올 때의 굽기는 검증을 통과한 레시피만 받는다).
// 쉬는 자리: 단계가 바뀔 때 그 이름(STAGES 의 글자)을, 단계 안에서는 값 없이 쉰다. 워커 러너는 이름이 올 때만 진행을 알린다.
import { hashState } from '../state.js';
import { genSteps } from '../gen/world.js';
import { bvhSteps } from './bvh.js';
import { navSteps, spanAt } from './nav.js';
import { linkSteps, groupSteps, markDoors, coverSteps } from './links.js';
import { lightSetup, vertexLightSteps, lightGrid, pointLightSteps, VLIGHT } from './light.js';
import { BAKE } from '../tune/bake.js';

export const BAKE_VERSION = 1;
export const STAGES = Object.freeze(['height', 'terrain', 'rocks', 'kit', 'bvh', 'nav', 'links', 'cover', 'light', 'grid', 'done']);

// 단계 name 이 시작될 때 준비 띠가 찬 정도(0 ~ 1) — 단계마다의 무게(tune 의 bake.progress)를 앞에서부터 더한 비율. 모르는 이름은 0, 'done' 은 1.
export function stageAt(name) {
  const at = STAGES.indexOf(name);
  let before = 0, all = 0;
  for (let k = 0; k < STAGES.length; k++) { const w = BAKE.progress[STAGES[k]]; all += w; if (k < at) before += w; }
  return at < 0 || !(all > 0) ? 0 : before / all;
}

export function* bakeSteps(world) {
  yield 'bvh';
  const bvh = yield* bvhSteps(world.collide.pos, world.collide.idx);
  yield 'nav';
  const { nav, solid } = yield* navSteps(world, bvh);
  yield 'links';
  const links = yield* linkSteps(nav, solid);
  yield;
  const groups = yield* groupSteps(nav, links);
  markDoors(nav, world.marks.doors);
  yield 'cover';
  const cover = yield* coverSteps(nav, bvh);
  yield 'light';
  const S = lightSetup(world);
  S.bvh = bvh;
  const vlight = yield* vertexLightSteps(world, S);
  yield 'grid';
  const grid = yield* lightGrid(world, nav, S), points = yield* pointLightSteps(world, S), kinds = [0, 0, 0], at = world.marks.spawn.at;
  for (let k = 0; k < links.kind.length; k++) kinds[links.kind[k]] += 1;
  // 시작 자리의 닿는 무리 — 엄폐 점의 수는 그 안에서 센다(못 가는 고원 · 바위 위의 점은 놀이에 안 쓰인다)
  const spawn = spanAt(nav, at[0], at[1], at[2], BAKE.verify.markSnap, BAKE.nav.climb), home = spawn < 0 ? -1 : nav.group[spawn];
  let coverHome = 0;
  for (let k = 0; k < cover.n; k++) if (cover.group[k] === home) coverHome++;
  const stats = {
    bvhNodes: bvh.count, navCells: nav.w * nav.d, walk: nav.y.length, groups, home, links: links.kind.length, vaults: kinds[0], climbs: kinds[1], drops: kinds[2],
    cover: cover.n, coverHome, probes: grid.y.length, litVerts: vlight.reduce((sum, v) => sum + v.length / VLIGHT, 0),
  };
  yield 'done';
  return { v: BAKE_VERSION, id: world.id, bvh, nav, links, cover, grid, vlight, ilight: points.inst, plight: points.props, stats, solid };
}

function finish(it) {
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}

// 끝까지 굽는다. 덩이(solid — 걷기 격자를 만들다 나온 것)는 미리보기 · 검증이 읽는 덤이라 구운 것에서 떼어 따로 돌려준다: { baked, solid }
export function bake(world) {
  const { solid, ...baked } = finish(bakeSteps(world));
  return { baked, solid };
}

export function hashBake(baked) { return hashState(baked); }

// 레시피 → 세계 → 구운 것. hash 가 참일 때만 해시 둘을 세어 같이 돌려준다(아니면 null — 놀이의 준비 길은 세지 않는다. 머리 주석).
export function* prepSteps(recipe, hash = false) {
  const world = yield* genSteps(recipe), baked = yield* bakeSteps(world);
  delete baked.solid;
  return { world, baked, hash: hash ? { world: hashState(world), bake: hashState(baked) } : null };
}
