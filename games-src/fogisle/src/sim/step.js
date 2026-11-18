// 주는 것: newGame(새 나무 — 다시 시작도 이것) · step(고정 1/60초 한 단계) · snapshot · restore.
// 받는 것: shared/state · 사건 통 · 체계들. 체계는 상태 없는 함수 system(state, world, input, ev) 이고, 한 단계의 순서는 이 파일 한 곳에 적는다.
// 시간은 「정수 단계 번호 × STEP」 하나다(state.clock.step). world 는 바뀌지 않는 자료, input 은 입력 표 한 장, ev 는 사건 통.
import { makeState, clone } from '../shared/state.js';
import { EV, emit } from '../shared/events.js';
import { initProbe, stepProbe } from './probe.js';

export function newGame(mission, seed, difficulty, world) {
  const state = makeState(mission, seed, difficulty);
  initProbe(state, world);
  return state;
}

// 사건은 통에 이어 적는다 — 통은 읽는 쪽이 비운다(한 프레임에 여러 단계를 밟아도 잃지 않게)
export function step(state, world, input, ev) {
  stepProbe(state, world, input, ev);
  state.clock.step += 1;
}

export function snapshot(state) { return clone(state); }

// 복원 = 나무 갈아 끼우기 + restored 사건. 돌려준 나무를 그 뒤의 상태로 쓴다(스냅숏은 그대로 남아 몇 번이고 다시 쓸 수 있다)
export function restore(snap, ev) {
  const state = clone(snap);
  emit(ev, EV.restored);
  return state;
}
