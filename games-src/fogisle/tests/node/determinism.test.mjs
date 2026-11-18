// 결정성 3종(시험용 체계 3,000단계 — tdd §2-2 · §2-3): ① 같은 씨앗 두 번 ② 두 판을 한 단계씩 번갈아 ③ 복제 → 복원 왕복.
// + 탐침(shared 만으로 도는 자가 점검)을 조각내 돌리기, 기준 해시(tests/golden/sim.json — 「바뀌었는지」만 본다).
import assert from 'node:assert/strict';
import { cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeRun, advance, runHash, probeBot } from '../../src/bot/run.js';
import { snapshot, restore } from '../../src/sim/step.js';
import { clearEvents, hashEvents, EV } from '../../src/shared/events.js';
import { hashState } from '../../src/shared/state.js';
import { makeRng, rngInt } from '../../src/shared/rng.js';
import { probeRun, runAll } from '../../src/shared/probe.js';

const STEPS = 3000, SEED_A = 20261118, SEED_B = 77, SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const solo = (seed, steps = STEPS, bot = probeBot) => { const run = makeRun(seed, bot); advance(run, steps); return run; };

function sameSeedTwice(t) {
  const a = solo(SEED_A), b = solo(SEED_A), c = solo(SEED_B);
  assert.equal(runHash(a), runHash(b), '같은 씨앗 두 번이 다른 해시를 냈다');
  assert.notEqual(runHash(a), runHash(c), '씨앗이 달라도 해시가 같다 — 씨앗을 안 쓰고 있다');
  assert.notEqual(runHash(a), runHash(solo(SEED_A, STEPS - 1)), '단계 수가 달라도 해시가 같다');
  assert.notEqual(runHash(a), runHash(solo(SEED_A, STEPS, null)), '입력 표를 비워도 해시가 같다 — 입력을 안 읽고 있다');
  assert.equal(a.state.clock.step, STEPS);
  assert.equal(a.ev.dropped, 0, '사건 통이 넘쳤다');
  assert.ok(a.state.probe.bounces > 0 && a.state.pull.kicks > 0, '시험용 체계가 사건 · 단추 가장자리를 한 번도 안 탔다');
  t.note('sim 해시(씨앗 ' + SEED_A + ' · ' + STEPS + '단계)', runHash(a));
  t.golden(`probe|${SEED_A}|probeBot|${STEPS}`, runHash(a));
}

function interleaved() {
  const a = makeRun(SEED_A, probeBot), b = makeRun(SEED_B, probeBot), c = makeRun(SEED_A, probeBot);
  for (let i = 0; i < STEPS; i++) { advance(a, 1); advance(b, 1); advance(c, 1); }
  assert.equal(runHash(a), runHash(solo(SEED_A)), '번갈아 돌린 판 A 가 혼자 돌린 것과 다르다 — 모듈에 숨은 상태가 있다');
  assert.equal(runHash(b), runHash(solo(SEED_B)), '번갈아 돌린 판 B 가 혼자 돌린 것과 다르다 — 모듈에 숨은 상태가 있다');
  assert.equal(runHash(c), runHash(a), '같은 씨앗 두 판을 번갈아 돌렸더니 서로 달라졌다');
}

function roundTrip(t) {
  const pick = makeRng(SEED_A), tried = [];
  for (let round = 0; round < 6; round++) {
    const k = 1 + rngInt(pick, 1800), m = 200 + rngInt(pick, STEPS - k - 200);        // k 단계에서 복제, M 단계 더
    const run = makeRun(SEED_A + round, probeBot);
    advance(run, k);
    const snap = snapshot(run.state), atK = hashState(run.state), eh = { a: run.eh.a, b: run.eh.b };
    advance(run, m);
    const first = runHash(run);
    assert.equal(hashState(snap), atK, '앞으로 더 돌렸더니 스냅숏이 바뀌었다 — 복제가 얕다');
    clearEvents(run.ev);
    run.state = restore(snap, run.ev);
    assert.equal(run.ev.n, 1); assert.equal(run.ev.kind[0], EV.restored, '복원이 restored 사건을 내지 않았다');
    assert.equal(hashState(run.state), atK, '복원한 나무가 복제한 때와 다르다');
    run.eh.a = eh.a; run.eh.b = eh.b;
    advance(run, m);
    assert.equal(runHash(run), first, `왕복이 어긋났다(k = ${k}, M = ${m}) — 나무 밖에 상태가 있다`);
    assert.equal(first, runHash(solo(SEED_A + round, k + m)), '복제를 끼운 판이 그냥 돌린 판과 다르다');
    // 같은 체크포인트에서 두 번 쓰러지는 경우: 복원한 판을 돌려도 스냅숏은 그대로이고, 그 스냅숏으로 다시 복원해도 같은 길을 간다
    assert.equal(hashState(snap), atK, '복원한 판을 돌렸더니 스냅숏이 바뀌었다 — restore 가 스냅숏을 복제하지 않는다');
    clearEvents(run.ev);
    run.state = restore(snap, run.ev); run.eh.a = eh.a; run.eh.b = eh.b;
    advance(run, m);
    assert.equal(runHash(run), first, '같은 스냅숏으로 두 번째 복원한 판이 어긋났다');
    tried.push(`${k}+${m}`);
  }
  t.note('왕복(k+M)', tried.join(' · '));
}

function probeSliced(t) {
  const whole = runAll(probeRun(SEED_A, STEPS));
  const a = probeRun(SEED_A, STEPS), b = probeRun(SEED_B, STEPS), c = probeRun(SEED_A, STEPS);
  let ra = a.next(), rb = b.next(), rc = { done: false }, slices = 1;
  while (!ra.done || !rb.done) {                                    // 두 판을 조각마다 번갈아
    if (!ra.done) { ra = a.next(); slices++; }
    if (!rb.done) rb = b.next();
  }
  while (!rc.done) rc = c.next();
  assert.equal(ra.value.hash, whole.hash, '조각내 번갈아 돌린 탐침이 한 번에 돌린 것과 다르다');
  assert.equal(rc.value.hash, whole.hash);
  assert.notEqual(rb.value.hash, whole.hash, '씨앗이 달라도 탐침 해시가 같다');
  assert.notEqual(runAll(probeRun(SEED_A, STEPS - 1)).hash, whole.hash);
  assert.ok(slices > 10, '탐침이 쉬지 않는다(yield) — 조각내 돌릴 수 없다');
  assert.ok(whole.pos instanceof Float64Array && whole.steps === STEPS);
  t.note('탐침 해시(씨앗 ' + SEED_A + ' · ' + STEPS + '단계)', whole.hash);
  t.golden(`shared-probe|${SEED_A}|-|${STEPS}`, whole.hash);
}

// 탐침이 정말 dmath 를 다 타는가: 열 함수 가운데 하나의 결과를 끝자리 하나(1ulp)만 틀어도 탐침 해시가 달라져야 한다.
// (이 해시가 「Node = 크롬 = 워커」의 근거라서, 탐침이 안 타는 함수가 있으면 그 함수의 차이는 아무도 못 본다.)
async function probeCoversDmath(t) {
  const tmp = join(SRC, 'dist', '.tmp-mut-' + process.pid), want = runAll(probeRun(SEED_A, 600)).hash, changed = [];
  try {
    for (const fn of ['dsin', 'dcos', 'dtan', 'datan', 'datan2', 'dasin', 'dacos', 'dexp', 'dlog', 'dpow']) {
      const root = join(tmp, fn, 'src'), file = join(root, 'shared', 'dmath.js');
      cpSync(join(SRC, 'src'), root, { recursive: true });
      const text = readFileSync(file, 'utf8'), head = `export function ${fn}(`;
      assert.ok(text.includes(head), fn + ' 가 dmath 에 없다');
      writeFileSync(file, text.replace(head, `function ${fn}_exact(`) + `\nexport function ${fn}(a, b) { return ${fn}_exact(a, b) * 1.0000000000000002; }\n`);
      const P = await import(pathToFileURL(join(root, 'shared', 'probe.js')).href);
      if (P.runAll(P.probeRun(SEED_A, 600)).hash !== want) changed.push(fn);
      else assert.fail(`${fn} 의 끝자리를 틀어도 탐침 해시가 그대로다 — 탐침이 ${fn} 을 타지 않는다`);
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  t.note('끝자리를 틀면 탐침 해시가 달라지는 dmath 함수', changed.join(' · '));
}

export const tests = [
  { name: '① 같은 씨앗 두 번 = 같은 해시(다른 씨앗 · 단계 수 · 입력은 다른 해시)', tags: ['gate', 'determinism'], run: sameSeedTwice },
  { name: '② 두 판을 한 단계씩 번갈아 = 각자 혼자 돌린 해시', tags: ['gate', 'determinism'], run: interleaved },
  { name: '③ 복제 → M 단계 = 복원 → 같은 입력 M 단계(자리 6곳)', tags: ['gate', 'determinism', 'roundtrip'], run: roundTrip },
  { name: '탐침(shared) — 조각내 번갈아 돌려도 같은 해시', tags: ['gate', 'determinism'], run: probeSliced },
  { name: '탐침은 dmath 열 함수를 모두 탄다(함수마다 끝자리 하나를 틀면 해시가 달라진다)', tags: ['gate', 'determinism', 'dmath'], run: probeCoversDmath },
];
