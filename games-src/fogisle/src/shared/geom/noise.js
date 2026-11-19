// 주는 것: 씨앗 잡음 — clamp · lerp · sstep · hash3 · noise2 · noise3 · fbm2 · fbm3 · ridge3 · worley3(3D 보로노이: 칸의 난수와 틈까지의 거리).
// 받는 것: 없음. 정수 섞기(Math.imul)와 사칙 연산뿐이라 Node · 크롬 · 워커가 같은 비트를 낸다. salt = 세계 씨앗에서 갈라 낸 정수(rng.seedFrom).
// 값의 범위: hash3 · noise · fbm 은 0 이상 1 미만(fbm 은 옥타브 합이라 가운데 0.5 근처에 몰린다), ridge3 는 0 ~ 1(능선에서 크다).
export function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }

export function lerp(a, b, t) { return a + (b - a) * t; }

// a → b 사이를 부드럽게 0 → 1 로(a > b 이면 거꾸로 — 「a 에서 0, b 에서 1」은 그대로다)
export function sstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function hash3(x, y, z, salt) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 506952113) ^ salt;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }

export function noise2(x, y, salt) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = fade(x - xi), yf = fade(y - yi);
  const a = hash3(xi, yi, 7, salt), b = hash3(xi + 1, yi, 7, salt), c = hash3(xi, yi + 1, 7, salt), d = hash3(xi + 1, yi + 1, 7, salt);
  return (a + (b - a) * xf) * (1 - yf) + (c + (d - c) * xf) * yf;
}

export function noise3(x, y, z, salt) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = fade(x - xi), yf = fade(y - yi), zf = fade(z - zi);
  const a = lerp(hash3(xi, yi, zi, salt), hash3(xi + 1, yi, zi, salt), xf), b = lerp(hash3(xi, yi + 1, zi, salt), hash3(xi + 1, yi + 1, zi, salt), xf);
  const c = lerp(hash3(xi, yi, zi + 1, salt), hash3(xi + 1, yi, zi + 1, salt), xf), d = lerp(hash3(xi, yi + 1, zi + 1, salt), hash3(xi + 1, yi + 1, zi + 1, salt), xf);
  return lerp(lerp(a, b, yf), lerp(c, d, yf), zf);
}

export function fbm2(x, y, oct, salt) {
  let sum = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { sum += amp * noise2(x * f, y * f, salt + i); f *= 2.03; amp *= 0.5; }
  return sum;
}

export function fbm3(x, y, z, oct, salt) {
  let sum = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { sum += amp * noise3(x * f, y * f, z * f, salt + i); f *= 2.03; amp *= 0.5; }
  return sum;
}

export function ridge3(x, y, z, oct, salt) {
  let sum = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    const n = 1 - Math.abs(noise3(x * f, y * f, z * f, salt + i) * 2 - 1);
    sum += amp * n * n; f *= 2.1; amp *= 0.5;
  }
  return sum;
}

// 칸마다 점 하나인 3D 보로노이. out[0] = 가장 가까운 칸의 난수(0 ~ 1 — 칸마다 다른 값), out[1] = 「둘째로 가까운 점 − 가장 가까운 점」 거리(틈에서 0)
export function worley3(x, y, z, salt, out) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let f1 = 9, f2 = 9, id = 0;
  for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = xi + i, cy = yi + j, cz = zi + k;
    const px = cx + hash3(cx, cy, cz, salt), py = cy + hash3(cx + 31, cy + 17, cz + 5, salt), pz = cz + hash3(cx + 7, cy + 53, cz + 29, salt);
    const d = (px - x) * (px - x) + (py - y) * (py - y) + (pz - z) * (pz - z);
    if (d < f1) { f2 = f1; f1 = d; id = hash3(cx + 101, cy + 211, cz + 307, salt); } else if (d < f2) f2 = d;
  }
  out[0] = id; out[1] = Math.sqrt(f2) - Math.sqrt(f1);
  return out;
}
