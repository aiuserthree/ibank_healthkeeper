// 주는 것: SIM — 고리의 뼈대 수치(sim 주파수 · 사건 통 크기 · 시점 각 눈금) · STEP(한 단계의 초).
// 받는 것: 없음. 이 표는 얼려 둔다 — 뼈대 수치는 조정 패널로 바꾸는 값이 아니다(tuneSet 이 거절한다). STEP 은 모듈을 읽을 때 한 번 계산한다.
export const SIM = Object.freeze({
  hz: 60,
  eventCap: 256,
  angleSteps: 10000,
});

export const STEP = 1 / SIM.hz;
