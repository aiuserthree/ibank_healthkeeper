// 주는 것: 워커 러너 — runJob(mod, fn, args) → Promise<{ value, where, slices, moved }>. shared 의 함수(보통 function* — 굽기 같은 긴 일)를
//   Blob 워커에서 끝까지 돌리고 결과 속 형식 배열의 버퍼를 transfer 로 돌려받는다. 얇은 틀이다 — 일의 내용은 모른다.
//   워커는 답을 두 통으로 보낸다: 값(버퍼를 넘기며) → 맺음(moved = 보낸 뒤 워커 쪽에서 정말 비워진 버퍼 수 — 복사가 아니라 넘김이었다는 증거).
// 받는 것: <script id="fg-shared"> 의 글(워커가 그 글을 그대로 실행한다 — 한 파일 배포에서도 주 창과 같은 코드) · tune(스냅숏) · tune/app.worker.
// 워커를 못 만들거나(생성자가 없거나 막힘 · 오류 사건 · readyMs 안에 준비 신호 없음) 워커가 끊기면 주 스레드에서 MessageChannel 로
//   sliceMs 조각을 잇달아 돌린다(rAF 에 묶지 않는다 — 60Hz 에 묶으면 일하는 시간이 절반이 된다). 어느 길이든 값은 같다(tdd §2-2 의 6).
// 워커는 표의 사본을 따로 가지므로 일마다 주 창의 tuneSnapshot 을 같이 보내고, 워커는 tuneApply 가 false 면 그 일을 거절한다.
import { tuneSnapshot } from '../shared/tune/index.js';
import { APP } from '../shared/tune/app.js';

const W = { worker: null, dead: false, ready: false, seq: 0, jobs: new Map(), timer: 0, url: '' };

// 이 함수의 글이 워커 안에서 돈다 — 바깥(이 모듈)의 이름을 쓰지 않는다
function workerMain() {
  const S = self.__fgShared, T = S['shared/tune/index.js'];
  const buffers = (v, out) => {
    if (v === null || typeof v !== 'object') return out;
    if (ArrayBuffer.isView(v)) { if (!out.includes(v.buffer)) out.push(v.buffer); return out; }
    for (const k of Object.keys(v)) buffers(v[k], out);
    return out;
  };
  self.onmessage = (e) => {
    const job = e.data;
    try {
      if (!T.tuneApply(job.tune)) throw new Error('워커의 수치 표를 주 창과 맞추지 못했다');
      let r = S[job.mod][job.fn](...job.args);
      if (r && typeof r.next === 'function') { let s = r.next(); while (!s.done) s = r.next(); r = s.value; }
      const list = buffers(r, []);
      self.postMessage({ id: job.id, value: r }, list);
      self.postMessage({ id: job.id, ok: true, moved: list.filter((b) => b.byteLength === 0).length });
    } catch (err) { self.postMessage({ id: job.id, ok: false, error: String((err && err.message) || err) }); }
  };
  self.postMessage({ ready: true });
}

// 주 스레드 길: function* 이면 sliceMs 조각으로 나눠 돈다(조각 사이에 화면과 입력이 돈다)
function runOnMain(job) {
  const done = (value, slices) => job.resolve({ value, where: 'main', slices, moved: 0 });
  try {
    const it = globalThis.__fgShared[job.mod][job.fn](...job.args);
    if (!it || typeof it.next !== 'function') { done(it, 1); return; }
    const ch = new MessageChannel();
    let slices = 0;
    ch.port1.onmessage = () => {
      const t0 = performance.now();
      slices += 1;
      try {
        let s = it.next();
        while (!s.done && performance.now() - t0 < APP.worker.sliceMs) s = it.next();
        if (s.done) { ch.port1.close(); done(s.value, slices); } else ch.port2.postMessage(0);
      } catch (e) { ch.port1.close(); job.reject(e); }
    };
    ch.port2.postMessage(0);
  } catch (e) { job.reject(e); }
}

// 준비 신호를 받았거나 포기했다 — 기다리던 타이머와 Blob 주소를 치운다
function settle() {
  clearTimeout(W.timer);
  if (W.url) URL.revokeObjectURL(W.url);
  W.url = '';
}

// 워커를 버리고, 걸려 있던 일을 전부 주 스레드로 돌린다(오류 사건으로 불리면 그 사건이 콘솔 오류로 번지지 않게 한다)
function giveUp(e) {
  if (e && e.preventDefault) e.preventDefault();
  if (W.dead) return;
  W.dead = true;
  settle();
  if (W.worker) { try { W.worker.terminate(); } catch (err) { W.worker = null; } }
  W.worker = null;
  const jobs = [...W.jobs.values()];
  W.jobs.clear();
  for (const job of jobs) runOnMain(job);
}

function onMessage(e) {
  const m = e.data || {};
  if (m.ready) { W.ready = true; settle(); return; }
  const job = W.jobs.get(m.id);
  if (!job) return;
  if (m.ok === undefined) { job.value = m.value; return; }
  W.jobs.delete(m.id);
  if (m.ok) job.resolve({ value: job.value, where: 'worker', slices: 1, moved: m.moved }); else job.reject(new Error(m.error));
}

function spawn() {
  try {
    const text = document.getElementById('fg-shared').textContent + '\n;(' + workerMain.toString() + ')();\n';
    W.url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
    const w = new Worker(W.url);
    w.onmessage = onMessage; w.onerror = giveUp; w.onmessageerror = giveUp;
    W.worker = w;
    W.timer = setTimeout(() => { if (!W.ready) giveUp(); }, APP.worker.readyMs);
  } catch (e) { W.dead = true; settle(); }
}

export function runJob(mod, fn, args) {
  return new Promise((resolve, reject) => {
    const job = { id: ++W.seq, mod, fn, args, resolve, reject };
    if (!W.worker && !W.dead) spawn();
    if (W.dead) { runOnMain(job); return; }
    W.jobs.set(job.id, job);
    try { W.worker.postMessage({ id: job.id, mod, fn, args, tune: tuneSnapshot() }); } catch (e) { giveUp(); }
  });
}
