// 주는 것: loadAssets(열쇠들, 그림 없이) → Promise<{ 열쇠: { image | null, color, state } }> — 자산 표의 그림을 받아 온다. **거절하지 않는다**: 못 받은 것은 image = null 로 돌려주고
//   view 가 대체 색으로 그린다(자산 폴더가 전부 404 여도 게임은 진행한다 — tdd §3-4). state = 'ok' · 'missing'(못 받음) · 'off'(?noart=1) · 'unknown'(표에 없는 열쇠).
// 받는 것: assets/table(ASSETS). 그림은 Image 로 받아 decode 까지 기다린다(첫 그리기에서 풀지 않게). 음악 · 소리는 그것을 처음 쓰는 단계가 받는 법을 더한다(F5a · F5b).
import { ASSETS } from './table.js';

const GRAY = Object.freeze([0.5, 0.5, 0.5]);

function one(key, noart) {
  const a = ASSETS[key];
  if (!a) return Promise.resolve([key, { image: null, color: GRAY, state: 'unknown' }]);
  if (noart) return Promise.resolve([key, { image: null, color: a.color, state: 'off' }]);
  return new Promise((done) => {
    const img = new Image(), fail = () => done([key, { image: null, color: a.color, state: 'missing' }]), ok = () => done([key, { image: img, color: a.color, state: 'ok' }]);
    img.onerror = fail;
    img.onload = () => (img.decode ? img.decode().then(ok, fail) : ok());
    img.src = a.url;
  });
}

export function loadAssets(keys, noart) {
  return Promise.all(keys.map((key) => one(key, noart))).then((rows) => Object.fromEntries(rows));
}

// 받은 결과의 요약: { want, ok, missing } — __fg_status.art 에 싣는다
export function artSummary(assets) {
  const rows = Object.values(assets);
  return Object.freeze({ want: rows.length, ok: rows.filter((r) => r.state === 'ok').length, missing: rows.filter((r) => r.state === 'missing' || r.state === 'unknown').length });
}
