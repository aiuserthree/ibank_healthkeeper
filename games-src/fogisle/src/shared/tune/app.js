// 주는 것: APP — 셸 쪽 뼈대 수치(고리 · 둘러보기 · 잠금 · 아케이드 신호 · 워커 러너 · 자가 점검 · 빈 장면).
// 받는 것: 없음. app · dev 가 읽고, 하네스는 Node 로 이 표를 읽어 같은 값으로 견준다. 감도는 출발값이다(확인지 ① 에서 확정 — tdd §2-4).
// stage 가지는 토대 단계의 빈 장면 것이다 — 진짜 장면이 서면(F2a) 뺀다. seed 는 「오늘의 판」 씨앗이 생기기 전의 자리다.
// errorChars = 오류 덮개 · __fg_status 에 싣는 오류 글의 길이 · devRing = 개발 창구가 적어 두는 최근 사건 수.
export const APP = {
  seed: 20261118, errorChars: 200, devRing: 256,
  loop: { maxSteps: 5, dropSec: 0.1, perfBlend: 0.1 },
  look: { sens: 0.0012, pitchMax: 1.55 },
  lock: { escIgnoreMs: 400, denyFree: 2 },
  arcade: { liveSec: 2, scoreMax: 250000 },
  worker: { sliceMs: 8, readyMs: 10000 },
  selfCheck: { seed: 20261118, steps: 3000 },
  stage: { fovH: 90, eye: 1.7, near: 0.1, far: 480, pixelRatioMax: 2, size: 240, cell: 2, fogNear: 8, fogFar: 70, sky: 0x93a6aa, floor: 0x717c7e, line: 0x4f5a5d },
};
