// 주는 것: 사건 표(EVENTS — 종류와 필드) · 번호(EV) · 사건 통(makeEvents · emit · clearEvents) · evField · hashEvents.
// 받는 것: hash · freeze · tune/sim. 사건은 상태가 아니다 — 단계가 통에 적고, 읽는 쪽(view · 시험)이 읽은 뒤 비운다.
// 통은 형식 배열이라 놀이 중에 새 객체를 만들지 않는다(부록 D-8). 사건 하나는 수 EV_FIELDS 칸이고 글자는 번호로 싣는다.
import { hashU32, hashNum } from './hash.js';
import { deepFreeze } from './freeze.js';
import { SIM } from './tune/sim.js';

export const EV_FIELDS = 8;

export const EVENTS = deepFreeze({
  restored: [],
  probeBounce: ['i', 'x', 'z'],
  probePulse: ['step', 'fold'],
});

export const EV_NAMES = Object.freeze(Object.keys(EVENTS));

export const EV = Object.freeze(Object.fromEntries(EV_NAMES.map((name, i) => [name, i])));

export function makeEvents(cap = SIM.eventCap) {
  return { n: 0, dropped: 0, cap, kind: new Uint16Array(cap), data: new Float64Array(cap * EV_FIELDS) };
}

export function clearEvents(ev) { ev.n = 0; }

// 통이 차면 버리고 dropped 를 센다(시험은 dropped 0 을 본다).
// kind 는 EV.이름 으로만 준다 — 표에 없는 이름(undefined)은 0번(restored)으로 적히므로 여기서 막는다(lint 의 event 규칙도 같은 것을 본다).
// 값은 EV_FIELDS 칸까지다 — 아홉째 값(over)이 오면 조용히 버리지 않고 터진다(arguments 를 쓰지 않아 새 객체가 없다).
export function emit(ev, kind, a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0, h = 0, over) {
  if (!(kind >= 0 && kind < EV_NAMES.length)) throw new Error('사건 표에 없는 종류로 emit 했다: ' + kind);
  if (over !== undefined) throw new Error('사건 하나에 값은 ' + EV_FIELDS + '칸까지다: ' + EV_NAMES[kind]);
  if (ev.n >= ev.cap) { ev.dropped += 1; return; }
  const o = ev.n * EV_FIELDS, D = ev.data;
  ev.kind[ev.n] = kind;
  D[o] = a; D[o + 1] = b; D[o + 2] = c; D[o + 3] = d; D[o + 4] = e; D[o + 5] = f; D[o + 6] = g; D[o + 7] = h;
  ev.n += 1;
}

// 사건 i 의 필드 값은 ev.data[i * EV_FIELDS + evField('probeBounce', 'x')]
export function evField(name, field) {
  const i = EVENTS[name] ? EVENTS[name].indexOf(field) : -1;
  if (i < 0) throw new Error('사건 표에 없는 필드: ' + name + '.' + field);
  return i;
}

export function hashEvents(h, ev) {
  hashU32(h, ev.n); hashU32(h, ev.dropped);
  for (let i = 0; i < ev.n; i++) {
    hashU32(h, ev.kind[i]);
    for (let k = 0; k < EV_FIELDS; k++) hashNum(h, ev.data[i * EV_FIELDS + k]);
  }
}
