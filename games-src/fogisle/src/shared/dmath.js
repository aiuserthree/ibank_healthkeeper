// 주는 것: 결정적 수학 — dsin · dcos · dtan · datan · datan2 · dasin · dacos · dexp · dlog · dpow + 상수 PI · TAU · HALF_PI.
// 받는 것: 없음. 더하기 · 빼기 · 곱하기 · 나누기 · Math.sqrt · Math.floor 만 쓴다(IEEE 754 가 결과를 정해 주는 연산).
// Math.sin 류는 Node 와 크롬이 다른 값을 낸다(실험 M1) — sim · shared · bot · data 는 이것만 쓴다(lint 가 막는다).
// 쓸 수 있는 범위와 끝 값(Math 와 다른 곳은 일부러 정한 것이다 — tests/node/dmath.test.mjs 가 붙잡아 둔다):
//   dsin · dcos · dtan — |x| ≤ 2³⁰(약 10⁹)에서 Math 와의 차 10⁻¹² 아래. 그 밖(무한대 포함)은 NaN 이다(조용히 틀린 값을 내지 않는다).
//     dsin 은 비트까지 홀 대칭, dcos 는 비트까지 짝 대칭. dtan 은 극(±π/2 …) 가까이에서 쓰지 않는다.
//   dasin · dacos — |x| > 1 은 ±1 로 접는다(내적이 1 을 살짝 넘어도 NaN 이 안 나게). datan2(0, 0) = 0.
//   NaN 은 모든 함수에서 NaN 으로 나온다(dpow(x, 0) = 1 만 예외 — Math 와 같다).
//   datan2 는 0 의 부호를 보지 않는다(−0 = +0): datan2(−0, −1) = +π · datan2(0, −0) = 0. dpow 의 0 · −0 은 Math.pow 와 같다.
//   dexp 는 x ≤ −745 에서 0, dpow 는 결과가 넘치기 바로 앞(10³⁰⁸ 근처)에서 무한대 대신 큰 수를 낼 수 있다.
export const PI = 3.141592653589793;
export const TAU = 6.283185307179586;
export const HALF_PI = 1.5707963267948966;
const LN2 = 0.6931471805599453;
// 주기 · ln 2 를 「윗자리(곱해도 정확한 짧은 수) + 나머지」로 나눠 뺀다 — 큰 각 · 큰 지수에서도 자릿수를 잃지 않는다.
// 주기는 세 조각(8비트 + 24비트 + 나머지): 바퀴 수 k 가 2²⁸ 아래면 k·TAU_A · k·TAU_B 가 정확하다.
const TAU_A = 6.28125;
const TAU_B = 0.0019353071693331003;
const TAU_C = 1.0253376606378076e-11;
const ANGLE_MAX = 1073741824;
const LN2_HI = 0.6931471803691238;
const LN2_LO = 1.9082149292705877e-10;
const SQRT2 = 1.4142135623730951;
const SQRT1_2 = 0.7071067811865476;
const P32 = 4294967296;
const N32 = 2.3283064365386963e-10;

// |x| 가 3π/2 를 넘지 않는 각의 sin — 먼저 ±π/2 안으로 접는다
function sinFold(x) {
  if (x > HALF_PI) x = PI - x; else if (x < -HALF_PI) x = -PI - x;
  const s = x * x;
  return x * (1 + s * (-1 / 6 + s * (1 / 120 + s * (-1 / 5040 + s * (1 / 362880 + s * (-1 / 39916800 + s * (1 / 6227020800
    + s * (-1 / 1307674368000 + s * (1 / 355687428096000 + s * (-1 / 121645100408832000 + s * (1 / 51090942171709440000)))))))))));
}

// 0 이상의 각을 ±π 안으로. 범위(ANGLE_MAX) 밖과 NaN 은 NaN
function wrap(x) {
  if (!(x <= ANGLE_MAX)) return NaN;
  const k = Math.floor(x / TAU + 0.5);
  return ((x - k * TAU_A) - k * TAU_B) - k * TAU_C;
}

export function dsin(x) { return x < 0 ? -sinFold(wrap(-x)) : sinFold(wrap(x)); }

export function dcos(x) { return sinFold(wrap(x < 0 ? -x : x) + HALF_PI); }

export function dtan(x) { return dsin(x) / dcos(x); }

// |z| ≤ 1 → 반각 공식 두 번으로 줄인 뒤 급수
function atan01(z) {
  z = z / (1 + Math.sqrt(1 + z * z));
  z = z / (1 + Math.sqrt(1 + z * z));
  const s = z * z;
  return 4 * z * (1 + s * (-1 / 3 + s * (1 / 5 + s * (-1 / 7 + s * (1 / 9 + s * (-1 / 11 + s * (1 / 13 + s * (-1 / 15
    + s * (1 / 17 + s * (-1 / 19 + s * (1 / 21 + s * (-1 / 23))))))))))));
}

export function datan(z) { return z > 1 ? HALF_PI - atan01(1 / z) : z < -1 ? -HALF_PI - atan01(1 / z) : atan01(z); }

export function datan2(y, x) {
  if (x !== x || y !== y) return NaN;
  if ((x === Infinity || x === -Infinity) && (y === Infinity || y === -Infinity)) { x = x > 0 ? 1 : -1; y = y > 0 ? 1 : -1; }
  if (x > 0) return datan(y / x);
  if (x < 0) return y >= 0 ? datan(y / x) + PI : datan(y / x) - PI;
  return y > 0 ? HALF_PI : y < 0 ? -HALF_PI : 0;
}

// 1 − c² 대신 (1 − c)(1 + c) — 끝(±1) 가까이에서 자릿수를 잃지 않는다
export function dacos(c) { return datan2(Math.sqrt(Math.max(0, (1 - c) * (1 + c))), c); }

export function dasin(s) { return datan2(s, Math.sqrt(Math.max(0, (1 - s) * (1 + s)))); }

export function dexp(x) {
  if (x !== x) return x;
  if (x > 710) return Infinity;
  if (x < -746) return 0;
  const k = Math.floor(x / LN2 + 0.5), r = (x - k * LN2_HI) - k * LN2_LO;
  let e = 1 + r * (1 + r * (1 / 2 + r * (1 / 6 + r * (1 / 24 + r * (1 / 120 + r * (1 / 720 + r * (1 / 5040 + r * (1 / 40320
    + r * (1 / 362880 + r * (1 / 3628800 + r * (1 / 39916800 + r * (1 / 479001600))))))))))));
  if (k > 0) for (let i = 0; i < k; i++) e *= 2; else for (let i = 0; i < -k; i++) e *= 0.5;
  return e;
}

// x = m × 2^e (m 은 √½ 이상 √2 미만) 로 나눈 뒤 ln m = 2·atanh((m − 1)/(m + 1))
export function dlog(x) {
  if (!(x > 0)) return x === 0 ? -Infinity : NaN;
  if (x === Infinity) return x;
  let e = 0;
  while (x >= P32) { x *= N32; e += 32; }
  while (x < N32) { x *= P32; e -= 32; }
  while (x >= SQRT2) { x *= 0.5; e += 1; }
  while (x < SQRT1_2) { x *= 2; e -= 1; }
  const s = (x - 1) / (x + 1), q = s * s;
  return e * LN2 + 2 * s * (1 + q * (1 / 3 + q * (1 / 5 + q * (1 / 7 + q * (1 / 9 + q * (1 / 11 + q * (1 / 13 + q * (1 / 15
    + q * (1 / 17 + q * (1 / 19 + q * (1 / 21 + q * (1 / 23))))))))))));
}

// 작은 정수 지수(|y| ≤ 16)는 거듭 곱해서, 나머지는 exp(y · ln x) 로
export function dpow(x, y) {
  if (y === 0) return 1;
  const n = y < 0 ? -y : y, whole = n === Math.floor(n);
  if (whole && n <= 16) {
    let b = x, r = 1, m = n;
    while (m > 0) { if (m % 2 === 1) r *= b; b *= b; m = Math.floor(m / 2); }
    return y < 0 ? 1 / r : r;
  }
  if (x === 0) {
    const odd = whole && n % 2 === 1;
    return y > 0 ? (odd ? x : 0) : odd ? 1 / x : Infinity;
  }
  if (x < 0) {
    if (!whole) return NaN;
    const r = dexp(y * dlog(-x));
    return n % 2 === 1 ? -r : r;
  }
  return dexp(y * dlog(x));
}
