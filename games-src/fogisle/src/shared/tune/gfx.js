// 주는 것: GFX — 그리기의 수치(카메라 · 하늘 · 해 · 안개 · 구운 빛을 입히는 세기 · 젖음 · 화면 톤 · 재질 표 · 견본 판 · 계측). TUNE.gfx.
// 받는 것: 없음. 전부 [출발값]이다 — 캡처를 보고 고친다(넘겨주기에 까닭). view/gfx 가 프레임마다 읽어 uniform 에 싣는 값(sky · sun · fog · bake · wet · look · tone)은
//   개발판에서 __fg.tune 으로 바꾸면 바로 보이고, 재질 표(surf)는 장면을 다시 만들 때 먹는다. 해가 있는 쪽은 여기 없다 — 구운 「해 가림」과 맞게 tune/bake 의 light.sun 을 읽는다.
// 색은 선형 값이 아니라 화면에서 보는 값(sRGB 0 ~ 1)으로 적고 view 가 선형으로 바꾼다(sun.color 만은 빛의 색이라 그대로 곱한다). 길이는 m, 각은 도.
// camera  fovH = 수평 시야각 · eye = 걷는 몸이 생기기 전의 눈높이(F3 의 값이 생기면 그것 하나로) · pixelRatioMax = 화면 픽셀 비율의 끝 · fly = 개발판 자유 비행의 속도(m/s) · flyFast = 달리기 단추를 누른 배율
// sky     하늘 이름마다: turn = 하늘 그림을 돌리는 각(그림의 밝은 쪽이 구운 해의 방위에 오게) · gain = 하늘 밝기 · env = 환경광 배율 · light = 환경광에 곱하는 색(푸른 하늘빛을 받은 회색이 너무 푸르지 않게 — 표면이 받는 빛만 고치고 하늘 · 안개의 색은 그대로) ·
//         ground = 아래 반구를 어둡게 한 정도(수평선 색 × 이 값 — 환경광이 밑에서 올라오지 않게) · far = 하늘에 안개를 먹일 때의 거리 · band = 수평선 띠를 뽑는 그림의 세로 자리(0 = 맨 위 · 0.5 = 수평선)
// sun     하늘 이름마다: color · power = 주광의 색과 세기(조도 — π 가 「바탕색 그대로」) · haze = 해 쪽 안개의 번짐 색 · hazePow = 그 번짐의 좁기
// fog     하늘 이름마다: base = 기준 높이에서의 밀도(1/m) · fall = 높이 감쇠(1/m) · at = 기준 높이 · even = 높이와 무관한 고른 밀도 · tint = 수평선 띠에 곱하는 색 · max = 안개의 끝(0 ~ 1)
// bake    lamp = 구운 등불 빛을 조도로 바꾸는 배율 · sun = 구운 해 가림의 세기(0 = 안 가린다) · spec = 하늘 열림이 반사를 가리는 지수 · shade = 틈 · 밑동 그늘이 바탕색을 누르는 정도 ·
//         glow = 빛나는 알의 밝기 · glass = 불 켜진 유리의 발광 무게(0 ~ 1 — glow 에 곱한다) · link = 빛나는 부분이 제 등불을 찾는 거리 · rockUp = 인스턴스 바위의 밑면을 어둡게 하는 정도(줄마다 값 하나라 납작해서)
// wet     world = 세계 젖음(0 ~ 1: 평평한 면에 고인다) · shore = 물가 젖음이 닿는 높이(해수면 위 m) · full = 그 가운데 다 젖는 높이의 비율 · dark = 젖은 면의 바탕색 배율 · rough = 젖은 면의 거칠기 · floor = 거칠기 바닥
// look    facet = 가파른 면을 각지게(0 ~ 1) · facetLo ~ facetHi = 그 섞임이 다 차는 · 시작하는 누운 정도 · blotch = 꼭짓점 얼룩의 세기(1 = 생성한 그대로) ·
//         normal = 법선 무늬 켬(0 · 1) · occlude = 하늘 가림 켬(0 · 1) · normalFade = 멀어지며 법선 무늬를 줄이는 정도 · strength = 법선을 뽑을 때의 세기 · aniso = 무늬의 비등방 거름(정식 · 값싼)
// tone    exposure = 노출 · dither = 합성의 디더(8비트 계단 가리기 — 0 이면 끔)
// surf    세계의 재질 이름 → mode(terrain 지형 겹 · tri 세 방향 · plain 평범 — 인스턴스 · 과녁 · 움직이는 것은 view 가 제 좌표(own)로 바꿔 쓴다) · a · b · c = 무늬 이름(자산 표의 열쇠) ·
//         scale = 무늬 배율(1/m — 0.5 면 한 장이 2m) · rough · metal · bump = 법선 세기 · macro = 큰 얼룩 세기 · wet = 젖음을 받는 정도 · base = 「무늬 그대로」를 뜻하는 색조(묶음의 tint ÷ 이 값을 무늬에 곱한다) ·
//         fit = 1 이면 base 대신 무늬의 평균색으로 나눈다(칠한 것 · 쇠: 무늬의 평균이 tint 가 되고 무늬는 결로만 남는다) · gain = 그 위의 밝기 배율
// swatch  재질 견본 판: at = 놓는 자리(바다 쪽 먼 하늘) · cols = 한 줄의 칸 수 · cell = 칸 · ball · slab = 공 · 받침의 크기 · cam* = 카메라 · dynAt = 「움직이는 것」이 빛을 읽는 자리(야영지 등불 곁) /
//         bench 계측(n 프레임 + 1픽셀 · GPU 시간 질의)의 횟수와 크기
export const GFX = {
  camera: { fovH: 90, eye: 1.7, near: 0.08, far: 900, pixelRatioMax: 2, fly: 6, flyFast: 4 },
  sky: {
    dawn: { turn: 131, gain: 1.15, env: 1, light: [1.03, 1, 0.96], ground: 0.16, far: 220, band: 0.53 },
  },
  sun: {
    dawn: { color: [1, 0.95, 0.9], power: 0.7, haze: [0.42, 0.3, 0.2], hazePow: 6 },
  },
  fog: {
    dawn: { base: 0.0115, fall: 0.085, at: 0, even: 0.0011, tint: [0.97, 0.99, 1.02], max: 1 },
  },
  bake: { lamp: 26, sun: 1, spec: 2, shade: 0.55, glow: 9, glass: 0.18, link: 2.6, rockUp: 0.55 },
  wet: { world: 0.5, shore: 2.4, full: 0.3, dark: 0.48, rough: 0.2, floor: 0.12 },
  look: { facet: 0.4, facetLo: 0.55, facetHi: 0.86, blotch: 1.3, normal: 1, occlude: 1, normalFade: 0.00025, strength: 2.2, aniso: 4, anisoLean: 2 },
  tone: { exposure: 1, dither: 1 },
  surf: {
    ground: { mode: 'terrain', a: 'rock', b: 'pebbles', c: 'turf', scale: 0.36, scaleB: 0.42, scaleC: 0.3, rough: 0.9, metal: 0, bump: 1.4, macro: 0.75, wet: 1, base: [1, 1, 1] },
    rock: { mode: 'tri', a: 'rock', scale: 0.42, rough: 0.9, metal: 0, bump: 1.4, macro: 0.7, wet: 1, base: [0.86, 0.87, 0.88] },
    stone: { mode: 'tri', a: 'quarry', scale: 0.55, rough: 0.92, metal: 0, bump: 0.9, macro: 0.4, wet: 0.8, base: [0.66, 0.67, 0.66] },
    concrete: { mode: 'tri', a: 'concrete', scale: 0.4, rough: 0.88, metal: 0, bump: 0.6, macro: 0.3, wet: 0.8, base: [0.84, 0.86, 0.87] },
    plaster: { mode: 'tri', a: 'plaster', scale: 0.3, rough: 0.9, metal: 0, bump: 0.5, macro: 0.25, wet: 0.5, base: [0.95, 0.95, 0.93] },
    wood: { mode: 'tri', a: 'planks', scale: 0.7, rough: 0.82, metal: 0, bump: 0.9, macro: 0.3, wet: 0.9, base: [0.5, 0.42, 0.35] },
    iron: { mode: 'tri', a: 'rustplate', scale: 0.9, rough: 0.58, metal: 0.5, bump: 0.5, macro: 0.3, wet: 0.6, base: [0.13, 0.16, 0.17], fit: 1, gain: 1.8 },
    copper: { mode: 'tri', a: 'rustplate', scale: 0.5, rough: 0.6, metal: 0.35, bump: 0.4, macro: 0.3, wet: 0.6, base: [0.3, 0.36, 0.33], fit: 1, gain: 1 },
    paint: { mode: 'tri', a: 'plaster', scale: 1.4, rough: 0.6, metal: 0, bump: 0.3, macro: 0.2, wet: 0.7, base: [0.95, 0.95, 0.93], fit: 1, gain: 0.9 },
    hemp: { mode: 'tri', a: 'burlap', scale: 3, rough: 0.95, metal: 0, bump: 0.4, macro: 0.2, wet: 0.4, base: [0.42, 0.36, 0.27] },
    rubber: { mode: 'plain', a: '', scale: 1, rough: 0.5, metal: 0, bump: 0, macro: 0, wet: 0.9, base: [1, 1, 1] },
    glass: { mode: 'plain', a: '', scale: 1, rough: 0.08, metal: 0, bump: 0, macro: 0, wet: 0, base: [1, 1, 1] },
    glow: { mode: 'plain', a: '', scale: 1, rough: 0.6, metal: 0, bump: 0, macro: 0, wet: 0, base: [1, 1, 1] },
  },
  swatch: { at: [0, 70, 420], cols: 6, cell: 2.6, ball: 0.85, slab: 2.3, camBack: 12.6, camUp: 8.6, camPitch: -43, dynAt: [-0.5, 3.4, 10.5] },
  bench: { frames: 12, rounds: 7, warm: 3, sizes: [[1280, 720], [1920, 1080], [2560, 1440], [3840, 2160]] },
};
