// 주는 것: lint 음성 시험 판(--each) — 이 줄 뒤의 모든 줄이 저마다 폴더 이름 앞머리의 규칙에 걸려야 한다. / 받는 것: 없음
export const d1 = (t) => confirm(t);
export const d2 = (t) => prompt(t);
export const d3 = (t) => window.alert(t);
export const d4 = (t) => self.alert(t);
export const d5 = (t) => globalThis.confirm(t);
