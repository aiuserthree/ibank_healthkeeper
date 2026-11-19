// 주는 것: 굽기 — bakeSteps(세계 → 구운 것. 조각내 돌릴 수 있는 function*) · bake(끝까지) · prepSteps(레시피 → { world, baked, hash } — 「생성 → 굽기」를 한 번에:
//   타이틀의 준비가 워커 러너로 이것을 돌린다) · hashBake · STAGES(쉬는 자리의 이름 차례 — 준비 띠가 진행으로 읽는다) · BAKE_VERSION.
// 받는 것: bvh · nav · links · light · gen/world · state(해시) · tune/bake. three · DOM 을 모른다 — Node · 크롬 주 스레드 · 워커 · 조각내 돌린 것이 같은 비트를 낸다.
// 구운 것(일반 객체 · 형식 배열만 — 워커에서 넘겨받고 hashState 로 해시한다. 세계(world)는 바뀌지 않는다):
//   bvh     충돌 삼각형 전부의 BVH(bvh.js 머리 주석) — 광선 · 지면 붙기 · 캡슐
//   nav     걷기 격자(nav.js 머리 주석) + group(닿는 무리) · door(문 번호)        links  자동 고리(links.js 머리 주석)
//   cover   엄폐 점(links.js 머리 주석)                                           grid   빛 격자(light.js 머리 주석)
//   vlight  꼭짓점 빛 v1: world.batches 와 같은 차례의 Uint8Array(꼭짓점 수 × 7)   ilight 인스턴스 빛: world.instances 와 같은 차례의 Uint8Array(줄 수 × 5)
//   plight  과녁 조각의 빛: Uint8Array(world.props 수 × 5)                         stats  수 보고(걷는 칸 · 무리 · 고리 종류별 · 엄폐 점 · 빛 격자의 탐침 …)
// 검증 8종은 여기서 돌리지 않는다(shared/bake/verify.js — Node 의 tools/bake.mjs 와 시험이 돌린다. 불러올 때의 굽기는 검증을 통과한 레시피만 받는다).
// 쉬는 자리: 단계가 바뀔 때 그 이름(STAGES 의 글자)을, 단계 안에서는 값 없이 쉰다. 워커 러너는 이름이 올 때만 진행을 알린다.
import { hashState } from '../state.js';
import { genSteps } from '../gen/world.js';
import { bvhSteps } from './bvh.js';
import { navSteps } from './nav.js';
import { makeLinks, reachGroups, markDoors, coverPoints } from './links.js';
import { lightSetup, vertexLightSteps, lightGrid, pointLights } from './light.js';

export const BAKE_VERSION = 1;
export const STAGES = Object.freeze(['height', 'terrain', 'rocks', 'kit', 'bvh', 'nav', 'links', 'cover', 'light', 'grid', 'done']);

export function* bakeSteps(world) {
  yield 'bvh';
  const bvh = yield* bvhSteps(world.collide.pos, world.collide.idx);
  yield 'nav';
  const { nav, solid } = yield* navSteps(world, bvh);
  yield 'links';
  const links = makeLinks(nav, solid), groups = reachGroups(nav, links);
  markDoors(nav, world.marks.doors);
  yield 'cover';
  const cover = coverPoints(nav, bvh);
  yield 'light';
  const S = lightSetup(world);
  S.bvh = bvh;
  const vlight = yield* vertexLightSteps(world, S);
  yield 'grid';
  const grid = yield* lightGrid(world, nav, S), points = pointLights(world, S), kinds = [0, 0, 0];
  for (let k = 0; k < links.kind.length; k++) kinds[links.kind[k]] += 1;
  const stats = {
    bvhNodes: bvh.count, navCells: nav.w * nav.d, walk: nav.y.length, groups, links: links.kind.length, vaults: kinds[0], climbs: kinds[1], drops: kinds[2],
    cover: cover.n, probes: grid.y.length, litVerts: vlight.reduce((sum, v) => sum + v.length / 7, 0),
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

// 레시피 → 세계 → 구운 것. 해시 둘을 같이 돌려준다(워커에서 세면 주 스레드가 안 멈춘다 — 캐시의 열쇠 · 하네스의 견줌에 쓴다).
export function* prepSteps(recipe) {
  const world = yield* genSteps(recipe), baked = yield* bakeSteps(world);
  delete baked.solid;
  return { world, baked, hash: { world: hashState(world), bake: hashState(baked) } };
}
