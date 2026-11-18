// 주는 것: CTX — app 의 살아 있는 값 한 곳(단계 · 판 · 입력 표 · 시점 · 잠금 · 계측). 개발 창구(__fg)와 __fg_status 가 같은 것을 읽는다.
// 받는 것: shared(입력 표 · 사건 통). 여기에는 값만 두고 일은 저마다의 모듈이 한다. sim 의 상태는 CTX.state 한 그루뿐이고 판마다 새로 만든다.
// lock 가지의 뜻은 app/lock.js, perf 는 app/loop.js. sinks = 한 프레임의 단계를 다 밟은 뒤 사건 통을 읽는 쪽들(view · 개발 창구).
// ready · busy = 타이틀의 준비가 끝났다 · 도는 중 / error = 덮개를 띄운 예외 / stray = 고리 밖에서 난 마지막 예외(적기만 한다).
import { makeInput } from '../shared/input.js';
import { makeEvents } from '../shared/events.js';

export const CTX = {
  phase: 'boot', arcade: false, tainted: false, hold: false, ready: false, busy: false, error: '', stray: '',
  mission: 'probe', seed: 0, state: null, world: null, bot: null,
  input: makeInput(), ev: makeEvents(), sinks: [],
  look: { yaw: 0, pitch: 0 },
  lock: { s: 'off', want: false, wait: false, hint: false, denies: 0, pending: false, since: -1e9, arcade: false },
  perf: { frames: 0, steps: 0, dropped: 0, frameMs: 0 },
  titleAt: 0, readySec: null, worker: null, probe: null,
};
