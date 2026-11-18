// 주는 것: 고정 단계 고리(tdd §2-4) — newRound(새 판의 나무) · stepOnce(sim 한 단계) · flushEvents · startLoop(rAF 고리).
// 받는 것: CTX · input(입력 표 채우기) · arcade(hk:live) · sim/step · tune. 한 프레임의 순서:
//   ① 입력은 장치 사건이 올 때 이미 모였다(시점은 mousemove 에서 바로) ② 쌓인 시간만큼 1/60 단계를 밟는다(한 프레임 maxSteps 번까지,
//   dropSec 넘는 간격은 버림) ③ 사건 통을 읽는 쪽에 넘기고 비운다 ④ 그린다. sim 은 단계 수만 본다 — 프레임이 어떻게 끊겨도 결과가 같다.
// CTX.hold(개발 창구가 켠다)면 고리는 단계를 밟지 않는다. 발사 가장자리 보장(단계 앞당기기)과 보간은 F3 이 더한다.
import { CTX } from './ctx.js';
import { fillInput } from './input.js';
import { roundLive } from './arcade.js';
import { newGame, step } from '../sim/step.js';
import { clearEvents } from '../shared/events.js';
import { APP } from '../shared/tune/app.js';
import { STEP } from '../shared/tune/sim.js';

const T = { last: -1, acc: 0 };

export function newRound(seed) {
  CTX.seed = seed >>> 0;
  CTX.state = newGame(CTX.mission, CTX.seed, 'normal', CTX.world);
  clearEvents(CTX.ev);
  T.acc = 0;
}

// 입력 표 한 장(봇이 있으면 봇, 없으면 장치) → sim 한 단계. 사건은 통에 쌓인다
export function stepOnce() {
  if (CTX.bot) CTX.bot(CTX.input, CTX.seed, CTX.state.clock.step); else fillInput(CTX.input);
  step(CTX.state, CTX.world, CTX.input, CTX.ev);
  CTX.perf.steps += 1;
}

export function flushEvents() {
  for (const sink of CTX.sinks) sink(CTX.ev);
  clearEvents(CTX.ev);
}

function frame(now, draw, score) {
  const dt = T.last < 0 ? 0 : Math.max(0, (now - T.last) / 1000), P = CTX.perf;
  T.last = now;
  if (CTX.phase !== 'play') return;
  P.frames += 1;
  P.frameMs += (Math.min(dt, APP.loop.dropSec) * 1000 - P.frameMs) * APP.loop.perfBlend;
  if (!CTX.hold) {
    if (dt > APP.loop.dropSec) P.dropped += 1; else T.acc += dt;
    const due = Math.floor(T.acc / STEP), n = Math.min(due, APP.loop.maxSteps);
    T.acc -= due * STEP;
    for (let i = 0; i < n; i++) stepOnce();
    roundLive(CTX.state.clock.step * STEP, score());
  }
  flushEvents();
  draw();
}

// draw = 한 프레임 그리기 · score = 지금 그만두면 받을 점수 · fail = 고리 안에서 난 예외를 받는 쪽(멈추고 덮개를 띄운다)
export function startLoop(draw, score, fail) {
  const tick = (now) => {
    requestAnimationFrame(tick);
    try { frame(now, draw, score); } catch (e) { fail(e); }
  };
  requestAnimationFrame(tick);
}
