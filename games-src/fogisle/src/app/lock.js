// 주는 것: 잠금 · 멈춤 상태 기계(tdd §12-3) — lockStep(전이 표 — 순수 함수) · lockInit · lockEvent(사건 하나를 넣고 효과를 실행).
// 받는 것: CTX.lock · tune/app. 상태 s: off(판 밖) · locked(잠금 놀이) · free(잠금 없이 놀이 — 누른 채 끌어 둘러보기) · paused.
//   want = 멈출 때 잠겨 있었다(이어 하려면 다시 잠근다) · wait = 「클릭하면 이어서」 · hint = 「한 번 더 눌러 주세요」 · pending = 잠금 요청이 가는 중.
// 사건: sortie · stop · granted · denied · lost · press · click · esc · hkPause · hkResume · away(blur · 숨은 탭).
// 효과: request(잠금 요청 — 사용자 동작 안에서 바로) · exit · pause · resume · repause(hk:paused 다시) · esc(hk:esc) · clear(hk:resumed 만). 규칙:
//   풀리면 즉시 멈춤 / 풀린 뒤 escIgnoreMs 안의 Esc 는 무시 / 다시 잠그기가 거절되면 타이머로 다시 시도하지 않고 hint 만 /
//   거절이 denyFree 번 쌓이면 다음 누름은 잠금 없이 이어 간다(막다른 길을 두지 않는다) / 부모의 hk:resume 으로는 잠글 수 없어 wait 만 켠다.
// 부모(hk-embed.js)는 제 멈춤 깃발로 Esc 를 「멈춤 / 이어 하기」로 가른다 → 그 깃발이 게임과 어긋나지 않게 한다(clear):
//   멈춘 판을 닫을 때 · 판 밖에서 hk:pause 를 받았을 때 「안 멈췄다」(hk:resumed)고 알리고, 판 밖의 Esc 는 hk:esc 로 올리지 않는다.
import { CTX } from './ctx.js';
import { APP } from '../shared/tune/app.js';

const H = { canvas: null, onPause: null, onResume: null, onEsc: null, onClear: null, promised: false };

export function lockStep(L, ev, now) {
  const fx = [], playing = L.s === 'locked' || L.s === 'free';
  const pause = () => { L.want = L.s === 'locked'; L.s = 'paused'; L.wait = false; L.hint = false; L.denies = 0; L.pending = false; fx.push('pause'); };
  if (ev === 'sortie') {
    if (L.s === 'off') { L.s = 'free'; L.pending = true; fx.push('request'); }
  } else if (ev === 'stop') {
    if (L.s === 'locked') fx.push('exit'); else if (L.s === 'paused') fx.push('clear');
    L.s = 'off'; L.pending = false; L.wait = false; L.hint = false;
  } else if (ev === 'granted') {
    if (L.s === 'free' || (L.s === 'paused' && L.pending)) {
      const was = L.s;
      L.s = 'locked'; L.pending = false; L.denies = 0; L.wait = false; L.hint = false;
      if (was === 'paused') fx.push('resume');
    } else if (L.s !== 'locked') fx.push('exit');
  } else if (ev === 'denied') {
    if (L.s === 'paused' && L.pending) { L.hint = true; L.denies += 1; }
    L.pending = false;
  } else if (ev === 'lost') {
    if (L.s === 'locked') { pause(); L.since = now; }
  } else if (ev === 'press') {
    if (L.s === 'free' && !L.pending) { L.pending = true; fx.push('request'); }
  } else if (ev === 'hkPause' || ev === 'away') {
    if (playing) { if (L.s === 'locked') fx.push('exit'); pause(); }
    else if (L.s === 'paused') L.pending = false;       // 가는 중이던 잠금 요청을 거둔다 — 뒤늦은 허락이 판을 다시 돌리지 않게
    else if (ev === 'hkPause') fx.push('clear');
  } else if (ev === 'hkResume') {
    if (L.s === 'paused') { L.wait = true; fx.push('repause'); }
  } else if (ev === 'click') {
    if (L.s === 'paused') {
      L.pending = true; fx.push('request');
      if (!L.want || L.denies >= APP.lock.denyFree) { L.s = 'free'; L.wait = false; L.hint = false; fx.push('resume'); }
    }
  } else if (ev === 'esc') {
    if (L.s === 'off' || L.s === 'locked' || now - L.since < APP.lock.escIgnoreMs) return fx;
    if (L.arcade) fx.push('esc'); else if (L.s === 'free') pause(); else L.wait = true;
  }
  return fx;
}

// 정밀 입력(unadjustedMovement)을 먼저 청하고, 그것을 모르는 브라우저면 조용히 일반 잠금으로. 거절은 denied 사건 하나로 모은다
function request() {
  const el = H.canvas, deny = () => lockEvent('denied');
  try {
    const p = el.requestPointerLock({ unadjustedMovement: true });
    if (!p || typeof p.then !== 'function') return;
    H.promised = true;
    p.catch((e) => (e && e.name === 'NotSupportedError' ? el.requestPointerLock() : Promise.reject(e))).catch(deny);
  } catch (e) { Promise.resolve().then(deny); }
}

export function lockEvent(ev) {
  const L = CTX.lock, root = document.documentElement;
  for (const fx of lockStep(L, ev, performance.now())) {
    if (fx === 'request') request();
    else if (fx === 'exit') { if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock(); }
    else if (fx === 'pause' || fx === 'repause') H.onPause();
    else if (fx === 'resume') H.onResume();
    else if (fx === 'esc') H.onEsc();
    else if (fx === 'clear') H.onClear();
  }
  root.dataset.fgLock = L.s; root.dataset.fgWait = L.wait ? '1' : '0'; root.dataset.fgHint = L.hint ? '1' : '0';
}

// hooks = { canvas, onPause, onResume, onEsc, onClear } — onPause 는 이미 멈춰 있어도 다시 불릴 수 있다(hk:paused 를 한 번 더 알릴 때)
export function lockInit(hooks) {
  Object.assign(H, hooks);
  CTX.lock.arcade = CTX.arcade;
  document.addEventListener('pointerlockchange', () => lockEvent(document.pointerLockElement === H.canvas ? 'granted' : 'lost'));
  document.addEventListener('pointerlockerror', () => { if (!H.promised) lockEvent('denied'); });
}
