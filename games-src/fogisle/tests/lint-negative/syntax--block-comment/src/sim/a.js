// 주는 것: lint 음성 시험 판 — 이 폴더 이름 앞머리의 규칙 하나만 걸려야 한다. / 받는 것: 없음
export const A = 1; /* 코드 줄에서 연 주석이
   다음 줄에서 닫힌다 — 이 줄이 묶음에서 빠지면 아래 함수가 주석에 먹힌다(문법은 멀쩡해서 부를 때만 터진다) */
function helper() { return 2; }
export function useLater() { return helper(); } /* 짧은 주석 */
