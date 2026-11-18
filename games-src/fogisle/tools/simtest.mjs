#!/usr/bin/env node
// 주는 것: Node 시험 러너 — tests/node/*.test.mjs 의 시험을 하위 명령(= 꼬리표)으로 골라 돌린다. 종료 코드 0 = 통과, 마지막 줄 JSON.
//   node tools/simtest.mjs gate          빠른 판(30초 안 — 넘으면 실패)      node tools/simtest.mjs full          전부
//   node tools/simtest.mjs determinism | roundtrip | bundle | dmath | tools  그 꼬리표만
//   … --update-golden                    바뀌는 것이 맞는 기준 해시(tests/golden/sim.json)를 새 값으로 적는다(넘겨주기에 까닭을 쓴다)
// 받는 것: 시험 파일은 export const tests = [{ name, tags: ['gate', …], run(t) }] 꼴. t.note(이름, 값) = 요약에 싣기 · t.golden(열쇠, 해시) = 기준과 견주기.
// 아직 없는 하위 명령(mission · fair · pace …)은 그것이 처음 필요한 단계가 만든다(build-plan 부록 A).
// 어떻게 실패해도(시험 파일이 문법 오류 · 꼴이 틀림 · 러너 안의 예외) 마지막 줄은 JSON 이다 — 하네스가 그 줄을 읽는다.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GOLDEN = join(SRC, 'tests', 'golden', 'sim.json');
const BUDGET_MS = { gate: 30000 };

const argv = process.argv.slice(2), cmd = argv.find((a) => !a.startsWith('--')) || 'gate', update = argv.includes('--update-golden');
process.on('uncaughtException', (e) => {
  console.log(String(e.stack || e));
  console.log(JSON.stringify({ ok: false, cmd: 'simtest ' + cmd, error: String(e.message || e).split('\n')[0] }));
  process.exit(1);
});
const golden = existsSync(GOLDEN) ? JSON.parse(readFileSync(GOLDEN, 'utf8')) : {};
const notes = {}, updated = [], results = [], problems = [], t0 = Date.now();

const t = {
  note(name, value) { notes[name] = value; },
  golden(key, hash) {
    if (golden[key] === hash) return;
    if (!update) throw new Error(`기준 해시와 다르다 — ${key}: 기준 ${golden[key] || '(없음)'} · 지금 ${hash}. 바뀌는 것이 맞으면 --update-golden 으로 갱신하고 넘겨주기에 까닭을 적는다`);
    golden[key] = hash; updated.push(key);
  },
};

const files = readdirSync(join(SRC, 'tests', 'node')).filter((f) => f.endsWith('.test.mjs')).sort();
const all = [];
for (const f of files) {
  try {
    const { tests } = await import(pathToFileURL(join(SRC, 'tests', 'node', f)).href);
    if (!Array.isArray(tests)) throw new Error('export const tests = [...] 가 없다');
    for (const test of tests) {
      const shaped = test && typeof test.name === 'string' && Array.isArray(test.tags) && typeof test.run === 'function';
      if (!shaped) throw new Error('시험은 { name, tags: [...], run } 꼴이어야 한다: ' + JSON.stringify(test && test.name));
    }
    for (const test of tests) all.push({ file: f, ...test });
  } catch (e) { problems.push(`시험 파일을 읽지 못했다 — ${f}: ${String(e.message || e).split('\n')[0]}`); }
}
const picked = cmd === 'full' ? all : all.filter((test) => test.tags.includes(cmd));

for (const test of picked) {
  const s = Date.now();
  let error = null;
  try { await test.run(t); } catch (e) { error = e; }
  results.push({ name: test.name, ok: !error, ms: Date.now() - s });
  console.log(`${error ? '실패' : '통과'}  ${test.file.replace('.test.mjs', '')} · ${test.name}  (${Date.now() - s}ms)`);
  if (error) console.log('      ' + String(error.stack || error).split('\n').slice(0, 6).join('\n      '));
}

if (updated.length) {
  const sorted = Object.fromEntries(Object.keys(golden).sort().map((k) => [k, golden[k]]));
  writeFileSync(GOLDEN, JSON.stringify(sorted, null, 2) + '\n');
  console.log('기준 해시를 새로 적었다: ' + updated.join(', '));
}

const ms = Date.now() - t0, failed = results.filter((r) => !r.ok).length, budget = BUDGET_MS[cmd] || null;
if (!picked.length) problems.push(`'${cmd}' 꼬리표의 시험이 없다 — 아직 없는 하위 명령이거나 오타다`);
if (budget && ms > budget) problems.push(`${cmd} 가 ${ms}ms 걸렸다 — ${budget}ms 안이어야 한다`);
for (const p of problems) console.log('실패  ' + p);
const ok = failed === 0 && problems.length === 0;
console.log(JSON.stringify({ ok, cmd: 'simtest ' + cmd, passed: results.length - failed, failed, ms, budgetMs: budget, goldenUpdated: updated, problems, notes }));
process.exit(ok ? 0 : 1);
