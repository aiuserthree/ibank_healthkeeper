// 주는 것: 시험용 체계(initProbe · stepProbe) — 토대 단계가 결정성 · 왕복 · 사건 · 입력 표를 시험하려고 둔 자리다. 진짜 체계가 서면(F3) 뺀다.
// 받는 것: shared/probe 의 알맹이 · 입력 표 · 사건 통 · tune. 상태는 state.probe · state.pull 가지에만 둔다.
import { makeProbe, probeInit, probeAdvance } from '../shared/probe.js';
import { EV, emit } from '../shared/events.js';
import { dsin, dcos } from '../shared/dmath.js';
import { PROBE } from '../shared/tune/probe.js';
import { STEP } from '../shared/tune/sim.js';

export function initProbe(state) {
  state.probe = makeProbe();
  state.pull = { x: 0, z: 0, kicks: 0 };
  probeInit(state.probe, state.rng);
}

// 이동 축이 끌림 점을 옮기고, 시점 각이 끌림 점을 그 방향으로 밀고, 단추 가장자리가 미는 거리를 바꾼다
export function stepProbe(state, world, input, ev) {
  const pull = state.pull, half = PROBE.arena / 2, n = state.clock.step;
  pull.x = Math.max(-half, Math.min(half, pull.x + input.mx * PROBE.speed * STEP));
  pull.z = Math.max(-half, Math.min(half, pull.z + input.mz * PROBE.speed * STEP));
  if (input.edge & 1) pull.kicks += 1;
  const reach = 1 + pull.kicks % 3 + input.wheel + (input.held & 1) * 0.5;
  probeAdvance(state.probe, state.rng, n, pull.x + dcos(input.yaw) * reach, pull.z + dsin(input.yaw + input.pitch) * reach, ev);
  if (n % PROBE.pulseEvery === 0) emit(ev, EV.probePulse, n, state.probe.fold.a);
}
