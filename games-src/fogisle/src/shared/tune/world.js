// 주는 것: WORLD — 세계 생성의 수치(지형 단면 · 가로 밀기 · 지형 겹 · 바위 · 흩기 띠 · 큰 얼룩 · 키트 공통 · 예산 · 개발 뷰어). TUNE.world.
// 받는 것: 없음. 길이는 m, 각은 도. 같은 레시피라도 이 표가 바뀌면 세계 해시(tests/golden/world.json)가 바뀐다 — 넘겨주기에 까닭을 적는다.
//   조각의 옆모습(선반 깎기 단면 같은 모양 자료)은 shared/gen/kit.js 에 조각과 함께 있다. 여기에는 여러 조각 · 여러 세계가 같이 쓰는 값만 둔다.
// 띠(band) = 절벽 발치에서 바다 쪽으로 잰 거리 u 의 [가까운 쪽, 먼 쪽](음수 = 절벽 · 고원 쪽). budget 은 조각 세계(slice) 하나의 상한이다.
//   띠의 차례는 흩기의 난수 씨앗에 들어간다(rocks.js) — 새 띠는 맨 뒤에 더한다.
// eye = 책갈피의 눈 자리 높이 — 걷는 몸(F3)의 눈높이 값이 생기면 그것 하나로 합친다. bin = 「칸 통」(충돌 삼각형을 담아 두는 칸)의 한 변.
export const WORLD = {
  cell: 32, eye: 1.7, markGap: 0.6, edge: 0.5, bin: 2,
  terrain: {
    rise: 2.4, slope: 0.1, seaSlope: 0.22, floor: -6, backSlope: 0.02, curve: 1.25, run: 12.5, heightVary: 0.3, heightFreq: 0.035, wobble: 5, wobbleFreq: 0.03,
    topSlope: 0.04, roll: 2.6, rollFreq: 0.021, crag: 2.4, cragFreq: 0.11, cragFrom: 0.52, cragFull: 0.68, strataMix: 0.8, strataNoise: 1.25, strataFreq: 0.035, strataLo: 0.22, strataHi: 0.7,
    grain: 0.25, grainSteep: 0.9, grainFreq: 0.16, pathBlend: 3, pathRipple: 0.12, terraceLo: 0.3, terraceHi: 0.7,
  },
  push: {
    steepFrom: 0.82, steepFull: 0.55, cell: 3.3, big: 2.6, bigFreq: 0.07, bigBias: 0.38, slab: 2.3, slabBias: 0.45, chip: 0.3, chipFreq: 0.85, lift: 0.5,
    minDot: 0.12, passes: 5, crackWide: 0.16, crackFine: 0.12,
  },
  // 지형 겹. pathPebbleFar → Near = 길에서 이 거리 안으로 들어오며 자갈이 짙어진다 · pathTurfFrom → To = 길에서 이만큼 떨어져야 풀이 난다 · wetFlat = 물가 젖음의 세기
  layer: {
    pebbleTop: 3.6, pebbleFull: 1.9, pebbleNoise: 1.6, pathPebble: 0.85, pathPebbleFar: 2.6, pathPebbleNear: 1.2, turfFlat: 0.8, turfFull: 0.93, turfFrom: 4.5, turfTo: 7.5,
    pathTurfFrom: 1.4, pathTurfTo: 3, wetTop: 3, wetFull: 0.3, wetFlat: 0.95, wetNoise: 0.28, wetSteep: 0.15,
  },
  // 지형 삼각형의 표면 종류(발소리 · 착탄)를 가르는 문턱: 가파름(0 ~ 1)이 steep 을 넘으면 바위, 지형 겹(0 ~ 1)이 pebble · turf 를 넘으면 자갈 · 풀, 자갈의 젖음이 wet 을 넘으면 젖은 자갈
  surface: { steep: 0.5, pebble: 0.5, turf: 0.5, wet: 0.785 },
  blotch: { size: 7, lo: 0.74, hi: 1.12, from: 0.3, to: 0.7 },
  // 바위. biteMin = 땅속에 든 꼭짓점의 최소 비율(이보다 적으면 떴다) · showMin = 땅 위로 나온 꼭짓점의 최소 비율(이보다 적으면 통째로 묻혔다) ·
  //   settleMax = 맞추려고 위아래로 옮길 수 있는 높이(× 크기 — 넘으면 그 바위를 버린다) · settlePad = 옮길 때의 덤(m) · settleTries = 옮겨서 다시 재 보는 횟수 ·
  //   restFlat = 바위를 둘 수 있는 땅의 누운 정도(놓는 자리 땅의 법선 위쪽 성분: 1 = 평지 · 0 = 수직 벽 — 이보다 가파르면 크든 작든 안 둔다. 0.6 ≈ 53°) ·
  //   perchMax = 바위 둘레의 땅이 가운데보다 꺼져도 되는 높이(× 크기 — 넘으면 좁은 선반 · 벼랑 끝에 걸친 것이라 안 둔다)
  rock: {
    kinds: 9, bigKinds: 6, detailBig: 2, detailSmall: 1, unit: 1.8, staticOver: 2, collideOver: 0.8, smallUnder: 1.4,
    bulge: 0.6, bulgeBase: 0.72, cut: 0.92, grit: 0.07, baseDark: 0.5, sink: 0.14, restFlat: 0.6, perchMax: 0.5, tilt: 0.25,
    kidChance: 0.55, kids: 3, kidSpread: 1.1, kidLo: 0.35, kidHi: 1.3, biteMin: 0.08, showMin: 0.1, settleMax: 0.5, settlePad: 0.02, settleTries: 2,
  },
  band: { foot: { near: -1.5, far: 7 }, shore: { near: 14, far: 27 }, surf: { near: 25, far: 38 }, face: { near: -11, far: -1.5 }, top: { near: -30, far: -14 } },
  // beaconRadius = 등대의 빛 반지름 · lanternLight = 등롱의 빛 반지름(× lightRadius)
  kit: { maxEdge: 1.25, embed: 0.35, clear: 1.2, lightRadius: 12, beaconRadius: 80, lanternLight: 0.6 },
  // 등불의 스위치 묶음(tdd §4-5): 번호는 0 ~ groups − 1, 대본 스위치는 script 묶음까지 · 깨지는 등불은 breakable 묶음까지
  lit: { groups: 8, script: 4, breakable: 4 },
  // 레시피의 수 칸이 들 수 있는 범위 [작은, 큰](검사 code 'range') — 생성이 끝나지 않거나 터지는 값을 막는 울타리다. 조각마다의 치수는 kit.js 의 PIECES.opt.
  //   coord = 물가의 z · level = 높이(해수면 · 평평하게) · cliff = 절벽 높이 · by = 올리기 · 깎기 · count = 흩는 수 · rock = 바위 크기 · turn = 요(도)
  range: {
    size: [16, 512], coord: [-512, 512], level: [-50, 150], cliff: [1, 100], strata: [0, 20], blend: [0, 64], by: [0, 60], step: [0.05, 20], width: [0.3, 40],
    amount: [0, 4], cell: [0.5, 40], dark: [0, 1], count: [0, 5000], rock: [0.1, 8], up: [-20, 60], turn: [-360, 360], lean: [-60, 60], pitch: [-90, 90], radius: [1, 200],
  },
  budget: { genMs: 600, tris: 150000, verts: 150000, instances: 1500, collideTris: 120000 },
  viewer: { fovH: 90, far: 520, fogNear: 70, sun: 1.9, sky: 0.8, gray: 0.8, facet: 0.6, sunX: -0.75, sunY: 0.5, sunZ: 0.42, sideX: -30, sideY: 26, sideZ: 78, lookY: 9, eyePitch: 22 },
};
