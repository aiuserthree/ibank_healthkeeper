// 주는 것: boot — 묶음이 모든 모듈을 올린 뒤 한 번 부른다. 셸의 뼈대에 단계 기계 · 고리 · 입력 · 잠금 · 아케이드 약속 · 워커 러너를 잇는다.
//   + 읽기 전용 window.__fg_status(배포판에서 밖으로 보이는 것은 이것뿐이다 — 손잡이 없음. hash = 지금 판의 상태 나무 해시 — 배포판의 고리도 Node 와 견준다).
// 받는 것: app 의 모듈들 · shared(game · probe 자가 점검 · tune) · shell 의 DOM(#fgView · #fgGo …). 화면 글은 shell 에 있고 여기서는 data-* 만 바꾼다.
// 토대 단계의 판: 출격 → 빈 장면에서 둘러보기 → 멈춤 덮개의 「임무 그만두기」 → 결과. 규칙이 없으므로 점수는 늘 0 이다(임무 엔진이 채운다).
import { CTX } from './ctx.js';
import { setPhase } from './phase.js';
import { arcadeInit, hkSend, listenParent, roundStart, roundEnd } from './arcade.js';
import { lockInit, lockEvent } from './lock.js';
import { inputInit, clearKeys } from './input.js';
import { newRound, startLoop } from './loop.js';
import { stageInit, stageResize, stageDraw } from './stage.js';
import { runJob } from './worker.js';
import { GAME } from '../shared/game.js';
import { hashState } from '../shared/state.js';
import { stageAt } from '../shared/bake/index.js';
import { recipe as slice1 } from '../data/slice1/recipe.js';
import { tuneFreeze } from '../shared/tune/index.js';
import { APP } from '../shared/tune/app.js';

const $ = (id) => document.getElementById(id);
const root = document.documentElement;

// 지금 그만두면 받을 점수(실패 점수 규칙) — 목표가 생기기 전이라 0
function failScore() { return 0; }

function focusView() {
  const a = document.activeElement;
  if (a && a !== document.body && a.blur) a.blur();
  $('fgView').focus({ preventScroll: true });
}

function pickSeed() {
  const m = /[?&]seed=(\d+)(&|$)/.exec(location.search);
  return m && root.dataset.fgMode === 'dev' ? Number(m[1]) : APP.seed;
}

// 출격 = 판 하나의 시작. 사용자 동작(클릭) 안에서 잠금을 청하고, 단추에 남은 초점을 캔버스로 옮긴다(Space 가 단추를 다시 누르지 않게)
function sortie() {
  if (!CTX.ready || (CTX.phase !== 'title' && CTX.phase !== 'result')) return;
  try { newRound(pickSeed()); } catch (e) { crash(e); return; }
  CTX.look.yaw = 0; CTX.look.pitch = 0;
  clearKeys();
  setPhase('play');
  roundStart();
  lockEvent('sortie');
  focusView();
}

// 판을 닫고(열려 있었으면 실패 점수를 먼저 보낸다) 잠금을 놓는다
function closeRound() {
  const score = failScore();
  if (roundEnd(score)) $('fgScore').textContent = String(score);
  lockEvent('stop');
  clearKeys();
}

function quit() { if (CTX.phase !== 'pause' && CTX.phase !== 'play') return; closeRound(); setPhase('result'); }

// 타이틀로 — 준비가 덜 됐으면(지난 준비가 실패했으면) 다시 돌린다
function toTitle() { if (CTX.phase === 'nogl' || CTX.phase === 'boot') return; closeRound(); setPhase('title'); prepare(); }

function errText(e) { return String((e && e.message) || e || '알 수 없는 오류').slice(0, APP.errorChars); }

// sim · 그리기 · 불러오기에서 난 예외: 멈추고 덮개를 띄운 뒤 규칙대로 실패 점수 신호
function crash(e) {
  if (CTX.phase === 'error' || CTX.phase === 'nogl') return;
  CTX.error = errText(e);
  $('fgErrorText').textContent = CTX.error;
  try { closeRound(); } catch (err) { CTX.error += ' / ' + String(err && err.message); }
  setPhase('error');
}

// 고리 · 준비 밖에서 난 예외와 처리 안 한 거절(tdd §12-2 의 「sim 이나 그리기」가 아닌 것): 적어만 두고 판은 잇는다 — 판과 기록을 날리지 않는다.
// 뜨는 중(boot)에 난 것만은 덮개로 알린다(타이틀까지 못 간 것이라 이을 판이 없다)
function stray(e) { if (CTX.phase === 'boot') crash(e); else CTX.stray = errText(e); }

function publishStatus() {
  const st = {}, def = (key, get) => Object.defineProperty(st, key, { get, enumerable: true });
  def('v', () => 0); def('mode', () => root.dataset.fgMode); def('build', () => root.dataset.fgBuild);
  def('phase', () => CTX.phase); def('lock', () => CTX.lock.s); def('arcade', () => CTX.arcade);
  def('mission', () => CTX.mission); def('objective', () => 0); def('step', () => (CTX.state ? CTX.state.clock.step : 0)); def('hash', () => (CTX.state ? hashState(CTX.state) : null));
  def('frameMs', () => Math.round(CTX.perf.frameMs * 100) / 100); def('quality', () => null); def('readySec', () => CTX.readySec);
  def('worker', () => CTX.worker); def('probe', () => CTX.probe); def('prep', () => CTX.prep); def('world', () => CTX.made); def('tainted', () => CTX.tainted); def('error', () => CTX.error); def('stray', () => CTX.stray);
  Object.defineProperty(window, '__fg_status', { value: Object.freeze(st), enumerable: true });
}

// 준비의 진행: 단계 이름을 <html data-fg-prep> 에, 찬 정도(0 ~ 1)를 CSS 변수 --fg-prep 에 적는다(준비 띠의 그림은 셸이 정한다 — 화면 글은 셸에 있다).
// 찬 정도는 단계 수가 아니라 단계마다의 무게(걸리는 시간의 어림 — tune 의 bake.progress)로 센다: 가장 긴 「구운 빛」에서 띠가 멈춘 듯 보이지 않게.
function prepStep(name) {
  CTX.prep = name; root.dataset.fgPrep = name;
  root.style.setProperty('--fg-prep', String(stageAt(name)));
}

// 개발판에서 주소에 ?bakehash=1 을 붙이면 준비 길에서 세계 · 구운 것의 해시를 센다(워커가 센 값 → __fg_status.world.hash · bake). 배포판 · 보통의 준비는 세지 않는다 —
// 구운 것을 통째로 훑는 일이라 임무 크기에서 「생성 + 굽기」의 9% 다. 하네스는 받은 배열을 주 창에서 다시 세어 견준다(__fg.prepHash · 묶인 shared 의 hashState).
function wantBakeHash() { return root.dataset.fgMode === 'dev' && /[?&]bakehash=1(&|$)/.test(location.search); }

// 타이틀이 떠 있는 동안: 워커 러너로 ① 결정성 자가 점검 한 판(워커 길이 되는지 · 어느 길로 돌았는지 · 해시) ② 「바로 출격」이 갈 세계의 생성 → 굽기를 돌리고,
// 끝나면 출격을 연다(tdd §3-5 — 셰이더 예열은 F2a ~ F2c 가 이 뒤에 잇는다). 굽는 동안 워커가 단계 이름을 알려 온다(prepStep).
// 실패하면 덮개 → 「다시 시작」이 타이틀로 오며 한 번 더 돌린다. 덜 된 동안은 단추가 잠기고 그 아래 「작전 지역 준비 중」 줄이 보인다(<html data-fg-ready>).
// 세계는 안 바뀌므로 다시 하기 · 타이틀로 돌아오기에서는 다시 만들지 않는다(CTX.ready 가 그대로다).
function prepare() {
  if (CTX.ready || CTX.busy) return;
  CTX.busy = true; CTX.titleAt = performance.now();
  prepStep('check');
  runJob('shared/probe.js', 'probeRun', [APP.selfCheck.seed, APP.selfCheck.steps]).then((r) => {
    CTX.worker = r.where; CTX.probe = r.value.hash;
    return runJob('shared/bake/index.js', 'prepSteps', [slice1, wantBakeHash()], prepStep);
  }).then((r) => {
    const hash = r.value.hash || { world: null, bake: null };
    CTX.world = r.value.world; CTX.baked = r.value.baked;
    CTX.made = Object.freeze({ id: slice1.id, hash: hash.world, bake: hash.bake, where: r.where, slices: r.slices });
    prepStep('done');
    CTX.readySec = Math.round(performance.now() - CTX.titleAt) / 1000;
    CTX.ready = true; root.dataset.fgReady = '1';
    $('fgGo').disabled = false;
  }).catch(crash).then(() => { CTX.busy = false; });
}

export function boot() {
  const view = $('fgView');
  if (root.dataset.fgMode !== 'dev') tuneFreeze();
  arcadeInit();
  publishStatus();
  window.addEventListener('error', (e) => stray(e.error || e.message));
  window.addEventListener('unhandledrejection', (e) => stray(e.reason));
  document.title = GAME.title; $('fgLogo').textContent = GAME.title;
  listenParent({
    'hk:hello': () => root.classList.add('in-hk'),
    'hk:pause': () => lockEvent('hkPause'),
    'hk:resume': () => lockEvent('hkResume'),
    'hk:restart': toTitle,
  });
  lockInit({
    canvas: view,
    onPause: () => { clearKeys(); setPhase('pause'); hkSend('hk:paused'); },
    onResume: () => { setPhase('play'); focusView(); hkSend('hk:resumed'); },
    onEsc: () => hkSend('hk:esc'),
    onClear: () => hkSend('hk:resumed'),
  });
  try { stageInit(view); } catch (e) { CTX.error = errText(e); setPhase('nogl'); hkSend('hk:ready'); return; }
  inputInit(view);
  $('fgGo').addEventListener('click', sortie);
  $('fgAgain').addEventListener('click', sortie);
  $('fgResume').addEventListener('click', (e) => { e.stopPropagation(); lockEvent('click'); });
  $('fgPause').addEventListener('click', () => { if (CTX.lock.wait) lockEvent('click'); });
  $('fgQuit').addEventListener('click', (e) => { e.stopPropagation(); quit(); });
  $('fgMenu').addEventListener('click', toTitle);
  $('fgRestart').addEventListener('click', toTitle);
  window.addEventListener('blur', () => { clearKeys(); lockEvent('away'); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) lockEvent('away'); });
  window.addEventListener('resize', () => { stageResize(); stageDraw(); });       // 크기를 바꾸면 그림이 지워진다 — 덮개 뒤(결과 · 오류)여도 다시 그린다
  startLoop(stageDraw, failScore, crash);
  setPhase('title');
  prepare();
  hkSend('hk:ready');
}
