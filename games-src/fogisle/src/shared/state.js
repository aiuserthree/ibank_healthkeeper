// 주는 것: 상태 나무 — makeState(뿌리) · clone(깊은 복사 + 규칙 검사) · hashState.
// 받는 것: rng · hash. 나무에는 수 · 불리언 · 글자 · null · 일반 객체 · 배열 · 형식 배열(수 — BigInt 배열은 안 된다)만 둔다.
// 함수 · 클래스 인스턴스 · undefined · 같은 객체를 두 곳에서 가리키기는 clone 이 거부한다(tdd §2-3). 체크포인트 = clone, 다시 시작 = 새 나무.
import { hashNew, hashU32, hashNum, hashText, hashHex } from './hash.js';
import { makeRng, seedFrom } from './rng.js';

export const STATE_VERSION = 1;

// 뿌리와 공통 가지만 만든다. 체계의 가지는 sim/step.js 의 newGame 이 체계마다 init 을 불러 붙인다.
export function makeState(mission, seed, difficulty) {
  return { v: STATE_VERSION, mission, seed: seed >>> 0, difficulty, clock: { step: 0 }, rng: makeRng(seedFrom(seed, 'sim')) };
}

// 0 = 값 · 1 = 배열 · 2 = 형식 배열 · 3 = 일반 객체 · −1 = 나무에 둘 수 없는 것
function kindOf(x) {
  if (x === null) return 0;
  const t = typeof x;
  if (t === 'number' || t === 'boolean' || t === 'string') return 0;
  if (t !== 'object') return -1;
  if (Array.isArray(x)) return 1;
  if (ArrayBuffer.isView(x)) return x.BYTES_PER_ELEMENT && !(x instanceof BigInt64Array) && !(x instanceof BigUint64Array) ? 2 : -1;
  const p = Object.getPrototypeOf(x);
  return p === Object.prototype || p === null ? 3 : -1;
}

function copyNode(node, path, seen) {
  const k = kindOf(node);
  if (k === 0) return node;
  if (k < 0) throw new Error('상태 나무에 둘 수 없는 값: ' + path + ' (' + typeof node + ')');
  const mark = k === 2 ? node.buffer : node;
  if (seen.has(mark)) throw new Error('상태가 나무가 아니다 — 같은 객체를 두 곳에서 가리킨다: ' + path);
  seen.add(mark);
  if (k === 2) return node.slice();
  if (k === 1) {
    const out = new Array(node.length);
    for (let i = 0; i < node.length; i++) out[i] = copyNode(node[i], path + '[' + i + ']', seen);
    return out;
  }
  const out = {}, keys = Object.keys(node);
  for (let i = 0; i < keys.length; i++) out[keys[i]] = copyNode(node[keys[i]], path + '.' + keys[i], seen);
  return out;
}

export function clone(state) { return copyNode(state, 'state', new Set()); }

function hashNode(h, x) {
  const k = kindOf(x);
  if (k === 0) {
    if (x === null) hashU32(h, 1);
    else if (typeof x === 'number') { hashU32(h, 2); hashNum(h, x); }
    else if (typeof x === 'boolean') hashU32(h, x ? 4 : 3);
    else { hashU32(h, 5); hashText(h, x); }
  } else if (k === 1) {
    hashU32(h, 6); hashU32(h, x.length);
    for (let i = 0; i < x.length; i++) hashNode(h, x[i]);
  } else if (k === 2) {
    hashU32(h, 7); hashText(h, x.constructor.name); hashU32(h, x.length);
    for (let i = 0; i < x.length; i++) hashNum(h, x[i]);
  } else if (k === 3) {
    const keys = Object.keys(x);
    hashU32(h, 8); hashU32(h, keys.length);
    for (let i = 0; i < keys.length; i++) { hashText(h, keys[i]); hashNode(h, x[keys[i]]); }
  } else throw new Error('상태 나무에 둘 수 없는 값은 해시할 수 없다');
}

// 열쇠는 넣은 순서 그대로 읽는다 — 내용이 같아도 만든 순서가 다르면 다른 해시다(순서가 흔들리는 코드를 잡는다)
export function hashState(state) {
  const h = hashNew();
  hashNode(h, state);
  return hashHex(h);
}
