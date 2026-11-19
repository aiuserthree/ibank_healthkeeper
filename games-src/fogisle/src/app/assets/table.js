// 주는 것: ASSETS — 자산 표(열쇠 → 주소 · 대체 색). 그림은 전부 /assets/games/fogisle/ 아래의 -v1 파일이다(30일 캐시 — 덮어쓰지 않는다. 바꾸면 -v2 새 이름 · tdd §3-4).
// 받는 것: 없음(자료). lint 가 「표의 파일이 실제로 있음」을 본다(없는 자산 → 실패). 바깥 주소 · CDN 은 둘 수 없다.
//   무늬(tex — 512², 한 장이 한 번 되풀이되는 크기는 재질 표 tune/gfx.surf 의 scale 이 정한다): 되풀이해 깔고 sRGB 로 읽는다.
//   하늘(sky-이름 — 등장방형 1536 × 768): 가로로만 되풀이하고 sRGB 로 읽는다. 수평선 띠 · 환경 맵은 view 가 이 그림에서 뽑는다.
//   color = 대체 색(그 그림의 평균색 · 화면에서 보는 값 0 ~ 1): 못 받았거나 ?noart=1 이면 view 가 이 색으로 코드 무늬 · 그러데이션을 만든다 — 그래도 게임은 진행한다.
// 법선 · 거칠기 · 얼룩은 파일로 두지 않는다(불러올 때 색 무늬에서 뽑는다). 사람 · 총의 천과 휘장, 브리핑 그림, 음악은 그것을 처음 쓰는 단계가 표에 더한다.
const TEX = '/assets/games/fogisle/tex/', SKY = '/assets/games/fogisle/sky/';

export const ASSETS = Object.freeze({
  burlap: { url: '/assets/games/fogisle/tex/burlap-v1.jpg', color: [0.51, 0.46, 0.38] },
  concrete: { url: '/assets/games/fogisle/tex/concrete-v1.jpg', color: [0.54, 0.55, 0.55] },
  corrugated: { url: '/assets/games/fogisle/tex/corrugated-v1.jpg', color: [0.6, 0.6, 0.58] },
  pebbles: { url: '/assets/games/fogisle/tex/pebbles-v1.jpg', color: [0.35, 0.34, 0.33] },
  planks: { url: '/assets/games/fogisle/tex/planks-v1.jpg', color: [0.54, 0.49, 0.44] },
  plaster: { url: '/assets/games/fogisle/tex/plaster-v1.jpg', color: [0.81, 0.8, 0.77] },
  quarry: { url: '/assets/games/fogisle/tex/quarry-v1.jpg', color: [0.55, 0.54, 0.54] },
  rock: { url: '/assets/games/fogisle/tex/rock-v1.jpg', color: [0.37, 0.37, 0.36] },
  rustplate: { url: '/assets/games/fogisle/tex/rustplate-v1.jpg', color: [0.33, 0.32, 0.28] },
  salt: { url: '/assets/games/fogisle/tex/salt-v1.jpg', color: [0.76, 0.76, 0.76] },
  turf: { url: '/assets/games/fogisle/tex/turf-v1.jpg', color: [0.38, 0.37, 0.24] },
  wetground: { url: '/assets/games/fogisle/tex/wetground-v1.jpg', color: [0.22, 0.21, 0.2] },
  'sky-dawn': { url: '/assets/games/fogisle/sky/dawn-v1.webp', color: [0.59, 0.65, 0.72] },
  'sky-overcast': { url: '/assets/games/fogisle/sky/overcast-v1.webp', color: [0.73, 0.75, 0.77] },
  'sky-duskrain': { url: '/assets/games/fogisle/sky/duskrain-v1.webp', color: [0.42, 0.39, 0.41] },
  'sky-storm': { url: '/assets/games/fogisle/sky/storm-v1.webp', color: [0.2, 0.29, 0.39] },
});

// 무늬의 열쇠 전부(재질 견본 판이 쓴다)
export const TEX_KEYS = Object.freeze(Object.keys(ASSETS).filter((k) => ASSETS[k].url.startsWith(TEX)).sort());
export const SKY_KEYS = Object.freeze(Object.keys(ASSETS).filter((k) => ASSETS[k].url.startsWith(SKY)).sort());
