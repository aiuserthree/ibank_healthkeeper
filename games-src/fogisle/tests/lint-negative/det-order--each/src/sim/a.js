// 주는 것: lint 음성 시험 판(--each) — 이 줄 뒤의 모든 줄이 저마다 폴더 이름 앞머리의 규칙에 걸려야 한다. / 받는 것: 없음
export const o1 = (list) => list.sort();
export const o2 = (list) => list.sort(undefined);
export const o3 = (list) => list.toSorted();
export const o4 = (table) => { let n = 0; for (var k in table) n += k.length; return n; };
