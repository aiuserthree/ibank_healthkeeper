// 주는 것: 개발 창구 window.__fg v0(판 번호 v) — 시험과 조정 패널이 게임 안쪽 이름에 기대지 않도록 좁은 문 하나만 둔다. 개발판에만 묶인다.
//   읽기(판을 더럽히지 않는다): state() · events(n) · perf() · tune(path) · simHash(seed, steps) · probeHash(seed, steps) · worker(seed, steps[, fn])
//   손대기(그 뒤로는 「시험 판」 — 판 신호를 보내지 않는다): hold(on) · step(n) · bot(kind) · snapshot() · restore() · tune(path, value)
// 받는 것: app(CTX · 고리 · 워커 러너) · bot · sim · shared. station · mask · gl 같은 문은 그것이 처음 필요한 단계가 더한다(build-plan 부록 A).
// state().events 는 「지금 나무를 step() 으로 민 동안」 나온 사건의 해시다(bot/run.js 의 runHash 뒤쪽과 같은 셈법 — 나무가 바뀌면 새로 세고,
//   밀기 전에 통에 있던 사건(복원의 restored 따위)은 기록에만 남기고 해시에는 넣지 않는다).
import { CTX } from '../app/ctx.js';
import { stepOnce } from '../app/loop.js';
import { runJob } from '../app/worker.js';
import { makeRun, advance, runHash, probeBot } from '../bot/run.js';
import { snapshot, restore } from '../sim/step.js';
import { probeRun, runAll } from '../shared/probe.js';
import { hashState } from '../shared/state.js';
import { EVENTS, EV_NAMES, EV_FIELDS, clearEvents, hashEvents } from '../shared/events.js';
import { hashNew, hashHex } from '../shared/hash.js';
import { tuneGet, tuneSet } from '../shared/tune/index.js';
import { APP } from '../shared/tune/app.js';

const BOTS = Object.freeze({ probe: probeBot });
const D = { ring: [], eh: hashNew(), of: null, snap: null };

function taint() { CTX.tainted = true; document.documentElement.dataset.fgTaint = '1'; }

// 사건 통을 읽어 최근 RING 개를 적어 둔다(고리의 sinks 에도 걸려 있다)
function record(ev) {
  const at = CTX.state ? CTX.state.clock.step : -1;
  for (let i = 0; i < ev.n; i++) {
    const name = EV_NAMES[ev.kind[i]], row = { step: at, kind: name };
    EVENTS[name].forEach((field, k) => { row[field] = ev.data[i * EV_FIELDS + k]; });
    D.ring.push(row);
  }
  if (D.ring.length > APP.devRing) D.ring.splice(0, D.ring.length - APP.devRing);
}
CTX.sinks.push(record);

const fg = {
  v: 0,
  state() {
    const s = CTX.state, L = CTX.lock;
    return {
      v: fg.v, phase: CTX.phase, lock: L.s, wait: L.wait, hint: L.hint, hold: CTX.hold, tainted: CTX.tainted, mission: CTX.mission, seed: CTX.seed,
      step: s ? s.clock.step : -1, hash: s ? hashState(s) : null, events: hashHex(D.eh), yaw: CTX.look.yaw, pitch: CTX.look.pitch, input: { ...CTX.input },
    };
  },
  // 고리의 시계를 세운다(true) · 다시 흐르게 한다(false)
  hold(on = true) { taint(); CTX.hold = !!on; return CTX.hold; },
  // 시계를 세우고 n 단계를 지금 민다
  step(n = 1) {
    if (!CTX.state) throw new Error('판이 없다 — 출격한 뒤에 민다');
    taint(); CTX.hold = true;
    if (D.of !== CTX.state) { D.of = CTX.state; D.eh = hashNew(); }
    record(CTX.ev);
    for (let i = 0; i < n; i++) { clearEvents(CTX.ev); stepOnce(); hashEvents(D.eh, CTX.ev); record(CTX.ev); }
    clearEvents(CTX.ev);
    return fg.state();
  },
  // 입력 표를 봇이 채운다(null 이면 다시 장치가)
  bot(kind) {
    if (kind && !Object.prototype.hasOwnProperty.call(BOTS, kind)) throw new Error('모르는 봇: ' + kind);
    taint(); CTX.bot = kind ? BOTS[kind] : null;
    return kind || null;
  },
  snapshot() { if (!CTX.state) throw new Error('판이 없다'); D.snap = snapshot(CTX.state); return hashState(D.snap); },
  restore() { if (!D.snap) throw new Error('스냅숏이 없다'); taint(); CTX.state = restore(D.snap, CTX.ev); return fg.state(); },
  tune(path, value) { if (value === undefined) return tuneGet(path); taint(); return tuneSet(path, value); },
  events(n = 20) { return D.ring.slice(-n); },
  perf() { return { ...CTX.perf }; },
  simHash(seed, steps) { const run = makeRun(seed, probeBot); advance(run, steps); return runHash(run); },
  probeHash(seed, steps) { return runAll(probeRun(seed, steps)).hash; },
  // fn = shared/probe.js 가 내보낸 함수 이름(없는 이름을 주면 워커 러너의 거절 길을 탄다)
  worker(seed, steps, fn = 'probeRun') {
    return runJob('shared/probe.js', fn, [seed, steps]).then((r) => ({ where: r.where, slices: r.slices, moved: r.moved, hash: r.value.hash, pos: Array.from(r.value.pos), kind: r.value.pos.constructor.name }));
  },
};
globalThis.__fg = Object.freeze(fg);
