// 주는 것: lint 양성 대조 — app 은 창 · 저장 · 타이머 · 워커를 쓴다. confirmQuit · prompts 같은 이름은 alert 류가 아니다. / 받는 것: view
import { tick, warm as preheat } from '../view/v.js';
export function boot() {
  const confirmQuit = () => window.parent.postMessage({ type: 'hk:esc' }, location.origin), prompts = [localStorage.getItem('fogisle.settings.v2')];
  setTimeout(() => preheat(null, null, null), 0); requestAnimationFrame(() => tick(document.getElementById('view')));
  return { confirmQuit, prompts, worker: new Worker(URL.createObjectURL(new Blob([document.getElementById('fg-shared').textContent]))) };
}
