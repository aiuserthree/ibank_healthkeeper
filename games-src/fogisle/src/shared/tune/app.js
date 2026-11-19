// 주는 것: APP — 셸 쪽 뼈대 수치(고리 · 둘러보기 · 잠금 · 아케이드 신호 · 워커 러너 · 자가 점검 · 준비 띠).
// 받는 것: 없음. app · dev 가 읽고, 하네스는 Node 로 이 표를 읽어 같은 값으로 견준다. 감도는 출발값이다(확인지 ① 에서 확정 — tdd §2-4).
// prep = 준비 띠가 찬 정도(0 ~ 1): 굽기의 단계들이 0 ~ bake 를 채우고, 그 뒤의 걸음(assets 그림 받기 · scene 장면 만들기와 셰이더 컴파일)이 적힌 자리에서 시작한다.
// seed 는 「오늘의 판」 씨앗이 생기기 전의 자리다. 카메라 · 하늘 · 안개의 수치는 tune/gfx 에 있다.
// errorChars = 오류 덮개 · __fg_status 에 싣는 오류 글의 길이 · devRing = 개발 창구가 적어 두는 최근 사건 수.
export const APP = {
  seed: 20261118, errorChars: 200, devRing: 256,
  loop: { maxSteps: 5, dropSec: 0.1, perfBlend: 0.1 },
  look: { sens: 0.0012, pitchMax: 1.55 },
  lock: { escIgnoreMs: 400, denyFree: 2 },
  arcade: { liveSec: 2, scoreMax: 250000 },
  worker: { sliceMs: 8, readyMs: 10000 },
  selfCheck: { seed: 20261118, steps: 3000 },
  prep: { bake: 0.6, assets: 0.6, scene: 0.75 },
};
