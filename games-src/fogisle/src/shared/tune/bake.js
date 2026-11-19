// 주는 것: BAKE — 굽기 · 검증의 수치(BVH · 걷기 격자 · 자동 고리 · 엄폐 점 · 구운 빛 · 빛 격자 · 검증 8종 · 예산). TUNE.bake.
// 받는 것: 없음. 길이는 m, 각은 도, 시간은 ms. 전부 [출발값]이다 — 이 표가 바뀌면 굽기 기준 해시(tests/golden/bake.json)가 바뀐다(넘겨주기에 까닭).
//   사람의 크기(nav.height · nav.radius)와 걷는 속도(verify.runSpeed · jumpUp)는 걷는 몸(F3)의 값이 생기면 그것 하나로 합친다.
// nav   cell = 칸 · unit = 높이 단위 · height = 사람 키(머리 위로 비어야 하는 높이) · climb = 그냥 걸어 오르는 턱 · slope = 걸을 수 있는 경사 ·
//       radius = 몸 반지름(가장자리 깎기: 칸 가운데에서 장애물 · 바닥 없는 칸까지 이만큼 떨어져야 걷는 칸이다 — 칸의 한 칸 반보다 작아야 한다. 검증의 캡슐도 이 값) ·
//       wade = 걸어 들어갈 수 있는 물 깊이(이보다 깊은 바닥에는 걷기 칸이 없다 — 세계의 끝)
// link  자동 고리 — vaultLo ~ vaultHi = 넘는 턱의 높이 · climbHi = 올라설 수 있는 턱(climb 보다 높고 이것 이하) · drop = 뛰어내릴 수 있는 높이 · reach = 고리가 건너는 거리
// cover gap = 엄폐 점 사이 거리 · reach = 장애물을 찾는 거리 · low · mid · high = 광선 높이(low 와 mid 가 막히면 낮은 엄폐, high 까지 막히면 높은 엄폐) ·
//       side = 몸 폭의 반(광선을 가운데와 옆으로 ± 이만큼 비킨 자리 셋에서 쏜다 — 셋 다 막혀야 엄폐다)
// light rays = 꼭짓점 · 탐침마다의 하늘 광선 수 · bias = 광선을 면에서 띄우는 거리 · skyReach = 하늘 광선의 길이 · skyDip = 이보다 아래를 향한 광선은 하늘로 안 센다(방향의 y) ·
//       floor = 하늘 열림의 바닥 값(완전 검정을 막는다) · lampSkip = 등불 바로 앞에서 광선을 멈추는 거리 · lampFall = 등불 빛의 거리 감쇠 · lampGain = 등불 빛을 바이트에 담을 때의 배율 ·
//       probeFacing = 탐침(방향이 없는 점)이 등불 빛을 받는 비율 · grid = 빛 격자의 칸 · probeUp = 탐침을 바닥에서 띄우는 높이 · instUp = 인스턴스 탐침의 높이(원형 좌표 — × 그 줄의 세로 크기. 바위 원형의 반지름이 1 쯤이라 바위 바로 위다) ·
//       sun = 하늘 이름마다 해가 있는 쪽(세계 좌표 — 길이는 1 이 아니어도 된다 · 표에 없는 하늘은 dawn). 재질(F2a)의 해 방향도 이 값을 읽어야 구운 「해 가림」과 맞는다.
// verify 검증 8종 — sampleGap = 걷는 자리 표본 간격 · markSnap = 표식 둘레에서 걷기 칸을 찾는 거리 · embedMin = 조각이 땅 · 다른 조각에 박혀야 하는 깊이 ·
//       looseGap = 얹는 소품의 밑바닥이 땅에서 떠도 되는 높이(이보다 뜬 밑바닥이 있으면 「한쪽이 떴다」) ·
//       edgeMargin = 세계의 끝에서 이 안쪽까지 걸어갈 수 있으면 「세계 밖에 닿는다」 · runSpeed · jumpUp(뛰는 높이) · gravity · edgeGap(가장자리 선을 따라 뽑는 표본의 간격) ·
//       edgeDirs = 가장자리 걷기의 수 · edgeHz = 달려 뛰기를 밟는 잦기(초당) · edgeSteps = 그 걸음 수의 끝 · landFlat = 내려섰다고 보는 면의 누운 정도(법선의 위쪽 성분) ·
//       hitBack = 맞은 면 앞에서 물러서는 거리 ·
//       holeYaw × (holeDownA · holeDownB · holeUp 세 고리) = 구멍 광선 48방향 · holeReach = 그 길이 · zoneStep = 닫힌 구역의 광선을 따라가는 걸음 · exitPad = 출입구(문 폭의 반)에 주는 덤 ·
//       doorReach = 문을 지나는 길을 찾는 반지름 · doorSide = 문 앞뒤에서 길의 두 끝을 잡는 거리 · doorWidth = 문 폭의 기본값 ·
//       coverPerZone = 교전 구역마다의 엄폐 점(시작 자리의 닿는 무리 안) · creaseMax = 꼭짓점 법선이 면 법선에서 벗어나도 되는 각 · lampCheck = 구운 등불 빛을 다시 재어 보는 꼭짓점 간격 ·
//       switchSecond = 스위치 묶음이 겹쳤다고 알리는 둘째 묶음의 세기(빛 — 그 꼭짓점에는 큰 묶음 하나만 구워진다. 지금은 알림만)
// budget bakeMs = 조각 세계 하나의 굽기 시간(Node) · coverMin = 조각 세계의 엄폐 점(시작 자리의 닿는 무리 안) · calls = 그리기 호출(묶음 + 인스턴스 원형 + 과녁 부분)
// progress 준비 띠의 단계별 무게(「생성 → 굽기」의 단계 이름 — shared/bake/index.js 의 STAGES 와 같은 이름. 그 단계가 걸리는 시간의 어림 비율이다 — 띠가 고르게 찬다)
export const BAKE = {
  bvh: { leaf: 4, chunk: 60000 },
  nav: { cell: 0.25, unit: 0.05, height: 1.75, climb: 0.45, slope: 46, radius: 0.3, wade: 0.9 },
  link: { vaultLo: 0.45, vaultHi: 1, climbHi: 1.4, drop: 2.6, reach: 1 },
  cover: { gap: 1.5, reach: 0.9, low: 0.5, mid: 1, high: 1.5, side: 0.25 },
  light: {
    rays: 16, bias: 0.05, skyReach: 24, skyDip: -0.15, floor: 0.06, lampSkip: 0.15, lampFall: 0.15, lampGain: 1, probeFacing: 0.6, grid: 2, probeUp: 1, instUp: 1.4,
    sun: { dawn: [0.62, 0.36, 0.7] },
  },
  verify: {
    sampleGap: 2, markSnap: 0.5, embedMin: 0.3, looseGap: 0.25, edgeMargin: 0.5, runSpeed: 6.75, jumpUp: 0.5, gravity: 20, edgeGap: 1.5, edgeDirs: 12,
    edgeHz: 30, edgeSteps: 150, landFlat: 0.5, hitBack: 0.02, holeYaw: 16, holeDownA: -35, holeDownB: -12, holeUp: 8, holeReach: 160, zoneStep: 0.25, exitPad: 0.5,
    doorReach: 1.5, doorSide: 1, doorWidth: 1, coverPerZone: 8, creaseMax: 75, lampCheck: 7, switchSecond: 0.01,
  },
  budget: { bakeMs: 1500, coverMin: 25, calls: 160 },
  progress: { height: 3, terrain: 6, rocks: 4, kit: 4, bvh: 12, nav: 14, links: 3, cover: 3, light: 45, grid: 6, done: 0 },
};
