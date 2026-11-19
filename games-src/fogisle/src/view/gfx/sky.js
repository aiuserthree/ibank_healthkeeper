// 주는 것: makeSky(renderer, 자산, 하늘 설정, 값싼 길인가, 등록) → { mesh(하늘 지붕 — 장면에 넣는다) · env(환경광 맵) · horizon(수평선 띠 256 × 1) · colors(값싼 길의 해석 하늘색) · far }.
// 받는 것: 자산({ image | null, color } — 등장방형 하늘 그림. 못 받았으면 대체 색으로 세로 그러데이션을 그린다) · tune/gfx.sky · shader.glsl(SKY_*) · uni(U · lin) · 전역 THREE.
// 하늘 그림 한 장에서 넷을 뽑는다(tdd §5-3): ① 지붕에 입힐 무늬 ② 수평선 띠 = 수평선 바로 아래 줄들의 방위별 평균(안개색 — 보는 방향마다 하늘과 이어진다)
//   ③ 아래 반구를 어둡게 한 등장방형 → PMREM 환경 맵(환경광이 밑에서 올라오지 않게) ④ 값싼 길이 무늬를 읽지 않고 쓰는 색 다섯(위 · 수평선 · 법선이 위 · 옆 · 아래일 때의 하늘빛).
// 그림은 turn(도)만큼 돌려 쓴다: 지붕과 안개는 읽는 자리에 uSkyTurn 을 더하고, 환경 맵은 만들 때 그림을 밀어 둔다(three 가 읽는 자리를 바꿀 수 없어서).
// 지붕의 고리는 수평선 둘레에 촘촘하다 — 값싼 길은 안개를 꼭짓점에서 세는데 높이 안개는 수평선 위 몇 도 안에서 빠르게 걷힌다.
import { SKY_VERT, SKY_FRAG } from './shader.glsl.js';
import { U, lin } from './uni.js';

const W = 1024, H = 512, STRIP = 256, EW = 512, EH = 256;
const RINGS = Object.freeze([-90, -45, -20, -9, -4.5, -2, -0.6, 0.4, 1.3, 2.4, 3.8, 5.6, 8, 11, 15, 21, 30, 43, 60, 78, 90]), SEG = 48;
const srgb = (v) => 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

function dome() {
  const pos = [], idx = [], n = SEG + 1;
  for (const deg of RINGS) for (let s = 0; s <= SEG; s++) {
    const e = deg * Math.PI / 180, a = s / SEG * Math.PI * 2;
    pos.push(Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a));
  }
  for (let r = 0; r + 1 < RINGS.length; r++) for (let s = 0; s < SEG; s++) { const a = r * n + s, b = a + n; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3)); g.setIndex(idx);
  return g;
}

// 그림(또는 대체 그러데이션)을 W × H 로 그려 화소를 읽는다
function canvasOf(asset) {
  const cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true });
  cv.width = W; cv.height = H;
  if (asset.image) cx.drawImage(asset.image, 0, 0, W, H);
  else {
    const c = asset.color, css = (k) => `rgb(${Math.min(255, c[0] * 255 * k) | 0},${Math.min(255, c[1] * 255 * k) | 0},${Math.min(255, c[2] * 255 * k) | 0})`, g = cx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, css(0.82)); g.addColorStop(0.42, css(1)); g.addColorStop(0.5, css(1.16)); g.addColorStop(1, css(1.1));
    cx.fillStyle = g; cx.fillRect(0, 0, W, H);
  }
  return { cv, data: cx.getImageData(0, 0, W, H).data };
}

export function makeSky(renderer, asset, cfg, lean, add) {
  const { cv, data } = canvasOf(asset), strip = new Uint8Array(STRIP * 4), mid = [0, 0, 0], y0 = Math.round((cfg.band - 0.03) * H), y1 = Math.round((cfg.band + 0.03) * H);
  const stripLin = new Float32Array(STRIP * 3);
  for (let s = 0; s < STRIP; s++) {
    const x0 = Math.floor(s * W / STRIP), x1 = Math.floor((s + 1) * W / STRIP);
    let n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++, n++) for (let c = 0; c < 3; c++) stripLin[s * 3 + c] += lin(data[(y * W + x) * 4 + c] / 255);
    for (let c = 0; c < 3; c++) { stripLin[s * 3 + c] /= n; mid[c] += stripLin[s * 3 + c] / STRIP; strip[s * 4 + c] = srgb(stripLin[s * 3 + c]); }
    strip[s * 4 + 3] = 255;
  }
  const horizon = add(new THREE.DataTexture(strip, STRIP, 1, THREE.RGBAFormat));
  horizon.colorSpace = THREE.SRGBColorSpace; horizon.wrapS = THREE.RepeatWrapping; horizon.magFilter = horizon.minFilter = THREE.LinearFilter; horizon.needsUpdate = true;
  // 환경 맵의 바탕: 그림을 turn 만큼 밀고, 수평선 아래는 「수평선 띠 × ground」로 바꾼다. 같은 자료에서 값싼 길의 하늘빛도 잰다(입체각 = cos(고도))
  const ecv = document.createElement('canvas'), ecx = ecv.getContext('2d'), img = ecx.createImageData(EW, EH), shift = Math.round(cfg.turn / 360 * W);
  ecv.width = EW; ecv.height = EH;
  const sum = { top: [0, 0, 0, 0], up: [0, 0, 0, 0], down: [0, 0, 0, 0], side: [0, 0, 0, 0] }, px = [0, 0, 0];
  for (let y = 0; y < EH; y++) {
    const el = (0.5 - (y + 0.5) / EH) * Math.PI, dy = Math.sin(el), solid = Math.cos(el), low = Math.min(1, Math.max(0, (0.02 - dy) / 0.07)), k = low * low * (3 - 2 * low);
    for (let x = 0; x < EW; x++) {
      const sx = (((x * 2 + shift) % W) + W) % W, s = Math.floor(sx * STRIP / W), o = (y * EW + x) * 4, az = (x + 0.5) / EW * Math.PI * 2, dx = Math.abs(solid * Math.cos(az));
      for (let c = 0; c < 3; c++) { px[c] = lin(data[(y * 2 * W + sx) * 4 + c] / 255) * (1 - k) + stripLin[s * 3 + c] * cfg.ground * k; img.data[o + c] = srgb(px[c]); }
      img.data[o + 3] = 255;
      const add4 = (acc, w) => { if (w > 0) { acc[0] += px[0] * w; acc[1] += px[1] * w; acc[2] += px[2] * w; acc[3] += w; } };
      add4(sum.up, dy * solid); add4(sum.down, -dy * solid); add4(sum.side, dx * solid); if (dy > 0.57) add4(sum.top, solid);
    }
  }
  ecx.putImageData(img, 0, 0);
  // 값싼 길은 환경 맵을 읽지 않는다(해석 하늘) — 만들지도 않는다
  let env = null;
  if (!lean) {
    const etex = new THREE.CanvasTexture(ecv), pm = new THREE.PMREMGenerator(renderer);
    etex.mapping = THREE.EquirectangularReflectionMapping; etex.colorSpace = THREE.SRGBColorSpace;
    env = add(pm.fromEquirectangular(etex)).texture;
    pm.dispose(); etex.dispose();
  }
  const mean = (a) => [a[0] / a[3], a[1] / a[3], a[2] / a[3]];
  const tex = add(asset.image ? new THREE.Texture(asset.image) : new THREE.CanvasTexture(cv));
  tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping; tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
  const far = { value: cfg.far }, gain = { value: cfg.gain };
  const mat = add(new THREE.ShaderMaterial({
    name: 'fg-sky', vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, defines: lean ? { FG_LEAN: '' } : {},
    uniforms: { tSky: { value: tex }, uSkyGain: gain, uSkyFar: far, uFogA: U.uFogA, uFogTint: U.uFogTint, uSunFog: U.uSunFog, uSunDirW: U.uSunDirW, uSkyTurn: U.uSkyTurn, tHorizon: U.tHorizon },
    depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false,
  }));
  const mesh = new THREE.Mesh(add(dome()), mat);
  mesh.frustumCulled = false; mesh.renderOrder = 1e6; mesh.matrixAutoUpdate = false;
  return { mesh, env, horizon, far, gain, colors: { top: mean(sum.top), mid, irrUp: mean(sum.up), irrSide: mean(sum.side), irrDown: mean(sum.down) } };
}
