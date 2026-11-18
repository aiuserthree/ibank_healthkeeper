// 주는 것: 시험용 봇(probeBot — 입력 표를 채운다) · 봇으로 한 판 돌리기(makeRun · advance · runHash).
// 받는 것: sim/step · shared. 봇의 입력은 (씨앗, 단계 번호)만의 함수다 — 숨은 상태가 없어 복원 뒤에도 같은 입력이 나온다.
// runHash = 상태 나무 해시 + ':' + 그때까지 나온 사건의 해시. 여기 적힌 낱 숫자는 시험 입력의 무늬일 뿐이다.
import { newGame, step } from '../sim/step.js';
import { makeEvents, clearEvents, hashEvents } from '../shared/events.js';
import { makeInput, quantAngle } from '../shared/input.js';
import { hashNew, hashHex, mix32 } from '../shared/hash.js';
import { hashState } from '../shared/state.js';
import { dsin } from '../shared/dmath.js';

export function probeBot(input, seed, n) {
  const r = mix32((seed ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0);
  input.mx = dsin(n * 0.013);
  input.mz = ((r & 255) - 127.5) / 127.5;
  input.yaw = quantAngle(dsin(n * 0.004) * 3 + (r >>> 24) * 0.001);
  input.pitch = quantAngle(dsin(n * 0.009) * 0.6);
  input.edge = ((r >>> 8) & 63) === 0 ? 1 : 0;
  input.held = (r >>> 14) & 1;
  input.wheel = ((r >>> 15) & 127) === 0 ? 1 : 0;
}

// bot 이 null 이면 빈 입력 표로 돈다
export function makeRun(seed, bot) {
  return { seed, bot, state: newGame('probe', seed, 'normal', null), ev: makeEvents(), input: makeInput(), eh: hashNew() };
}

export function advance(run, steps) {
  for (let i = 0; i < steps; i++) {
    if (run.bot) run.bot(run.input, run.seed, run.state.clock.step);
    clearEvents(run.ev);
    step(run.state, null, run.input, run.ev);
    hashEvents(run.eh, run.ev);
  }
}

export function runHash(run) { return hashState(run.state) + ':' + hashHex(run.eh); }
