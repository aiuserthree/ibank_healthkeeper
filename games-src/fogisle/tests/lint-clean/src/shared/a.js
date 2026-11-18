// 주는 것: lint 양성 대조 — 이 나무는 한 건도 걸리면 안 된다(결정성 층에서 되는 것들). / 받는 것: 없음
const SCRATCH = new Float64Array(2);
export const TABLE = Object.freeze({ gain: 0.5 });
export function order(list) { return list.slice().sort((x, y) => x.t - y.t || x.id - y.id); }
export function* slices(n) { for (let i = 0; i < n; i++) { SCRATCH[0] = Math.sqrt(i) * Math.PI; yield `${i / 2} // 주석이 아니다 Math.sin`; } }
export function looksLikeRatio(a, b) { return a / b / 2 > 1 ? /^\d+\/\d+$/.test(a + '/' + b) : false; }
/* 여러 줄 주석은
   주석만 있는 줄에서 열고 닫으면 된다 */
const FILL = new Float64Array(4);
for (let i = 0; i < FILL.length; i++) FILL[i] = i / 2; /* 맨 위 for 의 let 은 숨은 상태가 아니다 */
export const hasQuote = (s) => /['"`]/.test(s) && s.length > 0;
export const half = (n) => { let i = n; return i++ / 2 + Math.max(...FILL) + [...FILL].length; };
export const PAIR = Object.freeze({
  a: [1, 2],
  b: (x, y) => x + y,
});
export const sorted = (list) => list.toSorted((x, y) => x - y || x.id - y.id);
export function flood(n, d) { const stack = [n]; let sum = 0; while (stack.length) sum += (stack.pop() + d) / 2 / d; if (d) return (sum) / d; return sum; }
