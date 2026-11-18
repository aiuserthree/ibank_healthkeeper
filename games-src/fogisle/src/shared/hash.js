// 주는 것: 해시 누적기(hashNew · hashU32 · hashNum · hashText · hashHex — 32비트 두 줄을 16진 글자 16개로) + 32비트 도우미(hashStr · mix32).
// 두 줄 모두 낱말마다 윗비트를 아래로 내려 섞는다 — 곱셈만 하면 맨 윗비트(실수의 부호)의 변화가 맨 윗비트에만 남아 짝수 번 뒤집으면 그 줄이 그대로다.
// 받는 것: 없음. 실수는 비트 그대로 넣는다(−0 과 +0 은 다른 값이다). NaN 은 한 가지 비트로 고정한다(기계마다 부호와 꼬리가 다르다).
// 리틀 엔디언 기계만(크롬 · Node 가 도는 x86 · ARM 전부).
const F64 = new Float64Array(1);
const U32 = new Uint32Array(F64.buffer);

export function mix32(x) {
  x ^= x >>> 16; x = Math.imul(x, 0x85ebca6b);
  x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}

export function hashNew() { return { a: 0x811c9dc5 | 0, b: 0x9e3779b9 | 0 }; }

export function hashU32(h, w) {
  h.a = Math.imul(h.a ^ w, 0x01000193);
  h.a ^= h.a >>> 13;
  h.b = Math.imul(h.b ^ w, 0x5bd1e995);
  h.b ^= h.b >>> 15;
}

export function hashNum(h, x) {
  if (x !== x) { hashU32(h, 0); hashU32(h, 0x7ff80000); return; }
  F64[0] = x;
  hashU32(h, U32[0]); hashU32(h, U32[1]);
}

export function hashText(h, s) {
  hashU32(h, s.length);
  for (let i = 0; i < s.length; i++) hashU32(h, s.charCodeAt(i));
}

function hex8(x) { return (x >>> 0).toString(16).padStart(8, '0'); }

export function hashHex(h) { return hex8(mix32(h.a)) + hex8(mix32(h.b)); }

// 글자 → 32비트(씨앗 갈래 · 이름표용)
export function hashStr(s) {
  let a = 0x811c9dc5 | 0;
  for (let i = 0; i < s.length; i++) a = Math.imul(a ^ s.charCodeAt(i), 0x01000193);
  return mix32(a);
}
