// 주는 것: CTX — app 의 살아 있는 값 한 곳(단계 · 판 · 입력 표 · 시점 · 잠금 · 계측). 개발 창구(__fg)와 __fg_status 가 같은 것을 읽는다.
// 받는 것: shared(입력 표 · 사건 통). 여기에는 값만 두고 일은 저마다의 모듈이 한다. sim 의 상태는 CTX.state 한 그루뿐이고 판마다 새로 만든다.
// lock 가지의 뜻은 app/lock.js, perf 는 app/loop.js. sinks = 한 프레임의 단계를 다 밟은 뒤 사건 통을 읽는 쪽들(view · 개발 창구).
// ready · busy = 타이틀의 준비가 끝났다 · 도는 중 / error = 덮개를 띄운 예외 / stray = 고리 밖에서 난 마지막 예외(적기만 한다).
// world · baked = 준비가 만든 세계와 구운 것(shared/gen · shared/bake — 바뀌지 않는다) · prep = 준비의 지금 단계 이름 · made = 그 세계의 { id, hash, bake, where, slices }
//   (hash · bake = 세계 · 구운 것의 해시 — 개발판의 ?bakehash=1 일 때만 세고 아니면 null · stats = 구운 것의 수 보고).
// eye = 카메라 자리 [x, y, z, 요, 피치](시점 look 은 여기에 더한다 — 걷는 몸이 생기기 전의 자리) · q = 화질('low' = 값싼 길 · 'mid' · 'high' = 정식 길) · noart = 그림 없이 ·
//   assets = 받아 온 자산(그림) · art = 그 요약 { want, ok, missing }.
import { makeInput } from '../shared/input.js';
import { makeEvents } from '../shared/events.js';

export const CTX = {
  phase: 'boot', arcade: false, tainted: false, hold: false, ready: false, busy: false, error: '', stray: '',
  mission: 'probe', seed: 0, state: null, world: null, baked: null, prep: '', made: null, bot: null,
  input: makeInput(), ev: makeEvents(), sinks: [],
  look: { yaw: 0, pitch: 0 },
  lock: { s: 'off', want: false, wait: false, hint: false, denies: 0, pending: false, since: -1e9, arcade: false },
  perf: { frames: 0, steps: 0, dropped: 0, frameMs: 0 },
  eye: [0, 0, 0, 0, 0], q: 'mid', noart: false, assets: null, art: null,
  titleAt: 0, readySec: null, worker: null, probe: null,
};
