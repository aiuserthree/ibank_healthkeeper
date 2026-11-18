// 주는 것: 아케이드 약속(tdd §12-4) — arcadeInit · hkSend · 판 신호(roundStart · roundLive · roundEnd · roundOn) · 부모 말 듣기(listenParent).
// 받는 것: CTX · tune/app. 부모로 가는 말은 location.origin 으로만 보내고, 오는 말은 출처와 source(부모 창)를 검사한다. 회원 정보는 오지 않는다.
// 한 판 = 출격 한 번: hk:start 한 번 → sim 시간 2초마다 hk:live(지금 그만두면 받을 점수) → hk:score 한 번(0 ~ 상한의 정수).
// 손잡이를 쓴 판(CTX.tainted — 개발판의 봇 · 단계 밀기 · 표 고치기)은 판 신호를 보내지 않는다.
import { CTX } from './ctx.js';
import { APP } from '../shared/tune/app.js';

const HK = location.origin;
const R = { on: false, liveAt: 0 };

export function arcadeInit() { CTX.arcade = /[?&]hk=1(&|$)/.test(location.search) && window.parent !== window; }

export function hkSend(type, score) {
  if (!CTX.arcade) return;
  try { window.parent.postMessage(score === undefined ? { type } : { type, score }, HK); } catch (e) { return; }
}

function toScore(v) { return Math.max(0, Math.min(APP.arcade.scoreMax, Math.floor(v) || 0)); }

export function roundOn() { return R.on; }

export function roundStart() {
  R.on = true; R.liveAt = APP.arcade.liveSec;
  if (!CTX.tainted) hkSend('hk:start');
}

export function roundLive(simSec, score) {
  if (!R.on || simSec < R.liveAt) return;
  R.liveAt += APP.arcade.liveSec;
  if (!CTX.tainted) hkSend('hk:live', toScore(score));
}

// 판을 닫는다 — 열려 있던 판이면 true. 점수는 한 판에 한 번만 나간다(두 번째 부름은 아무것도 보내지 않는다)
export function roundEnd(score) {
  if (!R.on) return false;
  R.on = false;
  if (!CTX.tainted) hkSend('hk:score', toScore(score));
  return true;
}

// handlers = { 'hk:pause': 함수, … } — 표에 제 이름으로 있는 종류만 부른다
export function listenParent(handlers) {
  window.addEventListener('message', (e) => {
    if (!CTX.arcade || e.origin !== HK || e.source !== window.parent || !e.data || typeof e.data !== 'object') return;
    const type = e.data.type;
    if (typeof type === 'string' && Object.prototype.hasOwnProperty.call(handlers, type)) handlers[type]();
  });
}
