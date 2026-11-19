// 주는 것: WORLD — 세계 생성의 수치(지형 단면 · 가로 밀기 · 지형 겹 · 바위 · 흩기 띠 · 큰 얼룩 · 키트 공통 · 예산 · 개발 뷰어). TUNE.world.
// 받는 것: 없음. 길이는 m, 각은 도. 같은 레시피라도 이 표가 바뀌면 세계 해시(tests/golden/world.json)가 바뀐다 — 넘겨주기에 까닭을 적는다.
//   조각의 옆모습(선반 깎기 단면 같은 모양 자료)은 shared/gen/kit.js 에 조각과 함께 있다. 여기에는 여러 조각 · 여러 세계가 같이 쓰는 값만 둔다.
// 띠(band) = 절벽 발치에서 바다 쪽으로 잰 거리 u 의 [가까운 쪽, 먼 쪽](음수 = 절벽 · 고원 쪽). budget 은 조각 세계(slice) 하나의 상한이다.
export const WORLD = {
  cell: 32, eye: 1.7, markGap: 0.6, edge: 0.5,
  terrain: {
    rise: 2.4, slope: 0.1, seaSlope: 0.22, floor: -6, backSlope: 0.02, curve: 1.25, run: 12.5, heightVary: 0.3, heightFreq: 0.035, wobble: 5, wobbleFreq: 0.03,
    topSlope: 0.04, roll: 2.6, rollFreq: 0.021, crag: 2.4, cragFreq: 0.11, cragFrom: 0.52, cragFull: 0.68, strataMix: 0.8, strataNoise: 1.25, strataFreq: 0.035, strataLo: 0.22, strataHi: 0.7,
    grain: 0.25, grainSteep: 0.9, grainFreq: 0.16, pathBlend: 3, pathRipple: 0.12, terraceLo: 0.3, terraceHi: 0.7,
  },
  push: {
    steepFrom: 0.82, steepFull: 0.55, cell: 3.3, big: 2.6, bigFreq: 0.07, bigBias: 0.38, slab: 2.3, slabBias: 0.45, chip: 0.3, chipFreq: 0.85, lift: 0.5,
    minDot: 0.12, passes: 5, crackWide: 0.16, crackFine: 0.12,
  },
  layer: {
    pebbleTop: 3.6, pebbleFull: 1.9, pebbleNoise: 1.6, pathPebble: 0.85, turfFlat: 0.8, turfFull: 0.93, turfFrom: 4.5, turfTo: 7.5,
    wetTop: 3, wetFull: 0.3, wetNoise: 0.28, wetSteep: 0.15,
  },
  blotch: { size: 7, lo: 0.74, hi: 1.12, from: 0.3, to: 0.7 },
  rock: {
    kinds: 9, bigKinds: 6, detailBig: 2, detailSmall: 1, unit: 1.8, staticOver: 2, collideOver: 0.8, smallUnder: 1.4,
    bulge: 0.6, bulgeBase: 0.72, cut: 0.92, grit: 0.07, baseDark: 0.5, sink: 0.14, faceSink: 0.1, faceDig: 0.62, tilt: 0.25,
    kidChance: 0.55, kids: 3, kidSpread: 1.1, kidLo: 0.35, kidHi: 1.3,
  },
  band: { foot: { near: -1.5, far: 7 }, shore: { near: 14, far: 27 }, surf: { near: 25, far: 38 }, face: { near: -11, far: -1.5 }, top: { near: -30, far: -14 } },
  kit: { maxEdge: 1.25, embed: 0.35, clear: 1.2, lightRadius: 12 },
  budget: { genMs: 600, tris: 150000, verts: 150000, instances: 1500, collideTris: 120000 },
  viewer: { fovH: 90, far: 520, fogNear: 70, sun: 1.9, sky: 0.8, gray: 0.8, facet: 0.6, sunX: -0.75, sunY: 0.5, sunZ: 0.42, sideX: -30, sideY: 26, sideZ: 78, lookY: 9, eyePitch: 22 },
};
