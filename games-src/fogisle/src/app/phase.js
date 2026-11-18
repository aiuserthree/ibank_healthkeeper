// 주는 것: 단계 기계 — setPhase. boot → title → play ⇄ pause → result → (play · title), 어디서든 error, 그릴 수 없으면 nogl.
// 받는 것: CTX. 단계는 <html data-fg-phase> 로 나가고 덮개의 보임은 CSS 가 그 값으로 정한다 — 놀이 중에는 덮개가 display:none 이라
// 「계속하기」 같은 글자 단추가 화면에 없다(no-zoom.js 가 Space 로 누르지 못한다 — tdd §12-3). 표에 없는 건넘은 예외다.
import { CTX } from './ctx.js';

const NEXT = Object.freeze({
  boot: ['title', 'nogl', 'error'],
  title: ['play', 'error'],
  play: ['pause', 'result', 'title', 'error'],
  pause: ['play', 'result', 'title', 'error'],
  result: ['play', 'title', 'error'],
  error: ['title'],
  nogl: [],
});

// 바뀌었으면 true. 같은 단계면 아무 일도 하지 않는다
export function setPhase(to) {
  const from = CTX.phase;
  if (from === to) return false;
  if (!NEXT[from] || !NEXT[from].includes(to)) throw new Error('단계를 건널 수 없다: ' + from + ' → ' + to);
  CTX.phase = to;
  document.documentElement.dataset.fgPhase = to;
  return true;
}
