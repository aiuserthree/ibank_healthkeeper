// 주는 것: makeTextures(자산, 열쇠들, { normals, aniso, strength }, 등록) → { 열쇠: { map(바탕색 무늬), nrm(법선 무늬 — normals 가 거짓이면 null), mean(선형 밝기의 평균), rgb(선형 평균색) } }.
// 받는 것: 자산(app/assets 가 넘긴 { 열쇠: { image | null, color } } — 그림을 못 받았거나 ?noart=1 이면 image 가 null) · 전역 THREE.
//   그림이 없으면 대체 색(color — 그 무늬의 평균색)으로 코드 무늬(이어 붙는 값 잡음 세 옥타브)를 만든다 — 못 받아도 장면의 밝기와 색이 남는다.
// 법선은 파일로 두지 않고 불러올 때 색 무늬의 밝기에서 뽑는다(tdd §5-2: 3 × 3 으로 흐린 뒤 넓은 차분 — 화면 미분 방식은 비스듬한 땅에서 지글거린다). 밉맵을 만든다.
//   법선 무늬의 줄은 색 무늬와 같은 uv 에 오게 뒤집어 담는다(그림은 위가 먼저, 자료 무늬는 아래가 먼저다). R · G = 법선 xy, B = 흐린 밝기.
import { lin } from './uni.js';

const FALLBACK = 256;

function pixels(image) {
  const cv = document.createElement('canvas'), w = cv.width = image.naturalWidth || image.width, h = cv.height = image.naturalHeight || image.height;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(image, 0, 0, w, h);
  return { data: cx.getImageData(0, 0, w, h).data, w, h };
}

// 이어 붙는 값 잡음(칸 수 cells 로 한 바퀴)
function tile(x, y, cells, salt) {
  const fx = x * cells, fy = y * cells, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const h = (i, j) => { let v = Math.imul((i % cells) * 374761393 + (j % cells) * 668265263 + salt * 974711, 1274126177); v ^= v >>> 13; return (Math.imul(v, 1274126177) >>> 16) / 65535; };
  const a = h(ix, iy), b = h(ix + 1, iy), c = h(ix, iy + 1), d = h(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fallback(color, salt) {
  const n = FALLBACK, data = new Uint8ClampedArray(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / n, v = y / n, k = 0.7 + 0.6 * (0.45 * tile(u, v, 6, salt) + 0.35 * tile(u, v, 24, salt + 1) + 0.2 * tile(u, v, 96, salt + 2)), o = (y * n + x) * 4;
    data[o] = color[0] * 255 * k; data[o + 1] = color[1] * 255 * k; data[o + 2] = color[2] * 255 * k; data[o + 3] = 255;
  }
  return { data, w: n, h: n };
}

function normalFrom(px, strength) {
  const { data, w, h } = px, L = new Float32Array(w * h), B = new Float32Array(w * h), out = new Uint8Array(w * h * 4);
  const xi = new Int32Array(w + 6), yi = new Int32Array(h + 6);
  for (let k = 0; k < w + 6; k++) xi[k] = (k - 3 + w) % w;
  for (let k = 0; k < h + 6; k++) yi[k] = ((k - 3 + h) % h) * w;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const k = ((h - 1 - y) * w + x) * 4; L[y * w + x] = (data[k] * 0.299 + data[k + 1] * 0.587 + data[k + 2] * 0.114) / 255; }
  for (let y = 0; y < h; y++) {
    const r0 = yi[y + 2], r1 = yi[y + 3], r2 = yi[y + 4];
    for (let x = 0; x < w; x++) {
      const a = xi[x + 2], b = xi[x + 3], c = xi[x + 4];
      B[r1 + b] = (L[r1 + b] * 4 + (L[r1 + a] + L[r1 + c] + L[r0 + b] + L[r2 + b]) * 2 + L[r0 + a] + L[r0 + c] + L[r2 + a] + L[r2 + c]) / 16;
    }
  }
  for (let y = 0; y < h; y++) {
    const r = yi[y + 3];
    for (let x = 0; x < w; x++) {
      const du = B[r + xi[x + 4]] - B[r + xi[x + 2]] + 0.5 * (B[r + xi[x + 6]] - B[r + xi[x]]), dv = B[yi[y + 4] + x] - B[yi[y + 2] + x] + 0.5 * (B[yi[y + 6] + x] - B[yi[y] + x]);
      const nx = -du * strength * 2, ny = -dv * strength * 2, l = Math.sqrt(nx * nx + ny * ny + 1), o = (r + x) * 4;
      out[o] = (nx / l * 0.5 + 0.5) * 255; out[o + 1] = (ny / l * 0.5 + 0.5) * 255; out[o + 2] = B[r + x] * 255; out[o + 3] = 255;
    }
  }
  return out;
}

function dress(t, srgb, aniso) {
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

export function makeTextures(assets, keys, opt, add) {
  const out = {};
  keys.forEach((key, at) => {
    const a = assets[key] || { image: null, color: [0.5, 0.5, 0.5] }, px = a.image ? (opt.normals ? pixels(a.image) : null) : fallback(a.color, at * 7 + 1);
    const map = add(dress(a.image ? new THREE.Texture(a.image) : new THREE.DataTexture(new Uint8Array(px.data.buffer), px.w, px.h, THREE.RGBAFormat), true, opt.aniso));
    const nrm = opt.normals ? add(dress(new THREE.DataTexture(normalFrom(px, opt.strength), px.w, px.h, THREE.RGBAFormat), false, opt.aniso)) : null;
    // 평균색: 그림이 있으면 성기게 훑어 재고(값싼 길은 화소를 안 읽었으니 대체 색으로), 없으면 대체 색
    const rgb = [lin(a.color[0]), lin(a.color[1]), lin(a.color[2])];
    if (px && a.image) {
      rgb.fill(0);
      let n = 0;
      for (let k = 0; k < px.data.length; k += 4 * 37) { for (let c = 0; c < 3; c++) rgb[c] += lin(px.data[k + c] / 255); n++; }
      for (let c = 0; c < 3; c++) rgb[c] /= n;
    }
    out[key] = { map, nrm, mean: Math.max(0.01, (rgb[0] + rgb[1] + rgb[2]) / 3), rgb };
  });
  return out;
}
