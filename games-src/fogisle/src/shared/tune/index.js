// 주는 것: TUNE(수치 표 전체 — 숫자의 유일한 원본) · tuneGet · tuneSet(개발판 조정 패널) · tuneSnapshot(「복사」용 사본) · tuneApply · tuneFreeze.
// 받는 것: 주제별 표(sim · probe · app · world …). 표의 잎은 수 · 불리언 · 글자뿐이고, tuneSet 은 이미 있는 잎을 같은 형으로만 바꾼다.
// 배포판은 시작할 때 tuneFreeze 로 얼린다. 모듈을 읽을 때 한 번 계산해 둔 값(STEP 같은)은 조정 대상이 아니다.
import { deepFreeze } from '../freeze.js';
import { SIM } from './sim.js';
import { PROBE } from './probe.js';
import { APP } from './app.js';
import { WORLD } from './world.js';

export const TUNE = { sim: SIM, probe: PROBE, app: APP, world: WORLD };

function has(node, key) { return node !== null && typeof node === 'object' && Object.prototype.hasOwnProperty.call(node, key); }

// 'probe.speed' → { node: PROBE, key: 'speed' }. 길이 없으면 null
function locate(path) {
  const keys = path.split('.');
  let node = TUNE;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!has(node, keys[i])) return null;
    node = node[keys[i]];
  }
  const key = keys[keys.length - 1];
  return has(node, key) ? { node, key } : null;
}

export function tuneGet(path) {
  const at = locate(path);
  return at ? at.node[at.key] : undefined;
}

export function tuneSet(path, value) {
  const at = locate(path);
  if (!at || Object.isFrozen(at.node)) return false;
  const old = at.node[at.key];
  if (typeof old === 'object' || typeof old !== typeof value || value !== value) return false;
  at.node[at.key] = value;
  return true;
}

export function tuneSnapshot() { return JSON.parse(JSON.stringify(TUNE)); }

// 스냅숏을 통째로 넣는다 — 워커는 shared 덩이를 새로 실행해 표의 사본을 따로 가지므로, 일을 맡길 때 주 창의 스냅숏을 받아 이것으로 맞춘다.
// 다 넣고 나서 표가 스냅숏과 같으면 true(얼린 잎 · 없는 길 · 형이 다른 값은 못 넣는다 — 그 잎이 이미 같은 값이면 괜찮다).
export function tuneApply(snap, path = '') {
  const keys = Object.keys(snap);
  let same = true;
  for (let i = 0; i < keys.length; i++) {
    const v = snap[keys[i]], p = path + keys[i];
    if (v !== null && typeof v === 'object') same = tuneApply(v, p + '.') && same;
    else same = (tuneGet(p) === v || tuneSet(p, v)) && same;
  }
  return same;
}

export function tuneFreeze() { deepFreeze(TUNE); }
