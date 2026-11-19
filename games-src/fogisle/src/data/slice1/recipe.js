// 주는 것: recipe — 첫 조각 세계 slice1: 임무 1 의 상륙 해안 ~ 동굴 입구(만 하나, 128 × 96m) + 절벽 위 등대(원경).
// 받는 것: 없음(자료). 형식과 검사는 shared/gen/recipe.js, 조각은 shared/gen/kit.js, 띠 이름은 tune/world 의 band.
// 바다는 +z(남쪽). 절벽 선이 양 끝에서 바다로 나와 만을 닫는다(세계의 끝 = 물과 절벽). 동굴은 아직 입구의 우묵한 자리뿐이다(안은 F12).
// 지형 도장 여덟을 다 쓴다: 등대 터와 동굴 어귀(평평하게) · 물속 바위섬(올리기) · 물웅덩이(깎기) · 동쪽 곶 발치의 선반(계단밭) · 부두 ~ 동굴 길 · 가로 밀기 · 틈.
// 과녁 자리 8(등롱 3 · 병 3 · 부표 2 — target) · 책갈피 6 · 등불 7(등대 = 스위치 묶음 0 · 야영지와 부두 = 늘 켜짐 · 과녁 등롱 = 깨지는 묶음 4 ~ 6).
export const recipe = {
  id: 'slice1', size: [128, 96], seed: 11, sea: 0, sky: 'dawn',
  terrain: [
    { op: 'base', coast: 'south', shore: 30, cliff: { line: [[-64, 58], [-52, 44], [-41, 25], [-31, 11], [-15, 5], [5, 3], [21, 6], [33, 13], [42, 27], [51, 44], [64, 58]], height: 20, strata: 2.6 } },
    { op: 'flatten', area: ['circle', 24, -17, 8], blend: 6 },
    { op: 'flatten', area: ['circle', -18, 2, 3.4], to: 2.7, blend: 2.6 },
    { op: 'raise', area: ['circle', -27, 36, 2.2], by: 6, blend: 2.6 },
    { op: 'carve', area: ['circle', -22, 24, 4], by: 0.9, blend: 3.5 },
    { op: 'terrace', area: ['circle', 36, 22, 9], step: 0.8, blend: 3 },
    { op: 'path', line: [[10, 17], [-2, 12.5], [-18, 6.5]], width: 2.2 },
    { op: 'push', amount: 1.3, cell: 3.3 },
    { op: 'crack', dark: 0.3 },
  ],
  scatter: [
    { what: 'rocks', region: 'foot', n: 80, size: [0.5, 4.2] },
    { what: 'rocks', region: 'shore', n: 54, size: [0.3, 2.4] },
    { what: 'rocks', region: 'surf', n: 30, size: [0.8, 4.4] },
    { what: 'rocks', region: 'face', n: 30, size: [2.1, 4.2] },
    { what: 'rocks', region: 'top', n: 36, size: [0.5, 3] },
  ],
  kit: [
    { piece: 'lighthouse', at: [24, -17], height: 24, lit: 'switch:0' },
    { piece: 'pier', at: [10, 17.5], rot: 0, length: 18, deck: 1.25 },
    { piece: 'lamppost', at: [8.2, 16.4], rot: 90, lit: 'on' },
    { piece: 'lamppost', at: [-2.2, 9], rot: 0, lit: 'on' },
    { piece: 'wall', line: [[-14, 13.6], [-9.5, 15.2], [-4.5, 15.4]], height: 1.1 },
    { piece: 'wall', line: [[-7.5, 8.2], [-4.2, 7.6]], height: 0.9 },
    { piece: 'lantern', at: [-5.6, 7.86], on: 'top', lit: 'on' },
    { piece: 'lantern', at: [-20, 12.5], up: 1.2, stake: true, target: true, lit: 'break:4' },
    { piece: 'lantern', at: [14.5, 12], up: 1.1, stake: true, target: true, lit: 'break:5' },
    { piece: 'lantern', at: [26, 16.5], up: 1.3, stake: true, target: true, lit: 'break:6' },
    { piece: 'bottle', at: [-11.8, 14.4], on: 'top', target: true },
    { piece: 'bottle', at: [-6.5, 15.3], on: 'top', target: true },
    { piece: 'bottle', at: [10.7, 34.6], on: 'top', target: true },
    { piece: 'buoy', at: [-12, 36], lean: 7, target: true },
    { piece: 'buoy', at: [18, 39], lean: -5, target: true },
  ],
  lights: [],
  zones: [],
  marks: {
    spawn: [-2, 25, -32],
    stations: {
      landing: [10, 33, 14, 6], beach: [-2, 25, -32, 20], camp: [-1, 13.5, 70, 0],
      cave: [-13.5, 11, 30, 8], rocks: [24, 24, 115, 0], cliff: [14, 9, -20, 35],
    },
    points: { cave: [-18, 4] },
  },
};
