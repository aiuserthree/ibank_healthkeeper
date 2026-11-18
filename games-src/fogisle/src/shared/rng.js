// 주는 것: 씨앗 난수(mulberry32) — makeRng · rngNext([0, 1)) · rngRange · rngInt · seedFrom(씨앗에서 갈래 씨앗).
// 받는 것: hash. sim · 세계 생성의 유일한 난수원이다. 난수의 상태는 { s } 한 칸이고 상태 나무 안에 둔다(함수 안에 숨기지 않는다).
import { hashStr, mix32 } from './hash.js';

export function makeRng(seed) { return { s: seed >>> 0 }; }

export function rngNext(r) {
  r.s = (r.s + 0x6D2B79F5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function rngRange(r, lo, hi) { return lo + (hi - lo) * rngNext(r); }

export function rngInt(r, n) { return Math.floor(rngNext(r) * n); }

// 같은 씨앗에서 쓰임새(이름표)마다 서로 다른 난수 줄기를 얻는다 — 한 줄기를 더 써도 다른 줄기가 안 밀린다
export function seedFrom(seed, label) { return mix32((seed >>> 0) ^ hashStr(label)); }
