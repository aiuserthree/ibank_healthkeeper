// 도구의 가장자리: lint 의 크기 규칙(음성 판을 임시 나무로) · 양성 대조가 없으면 실패 · --each 판은 줄마다 · 층 표 전체 ·
// simtest · lint 는 어떻게 실패해도 마지막 줄이 JSON. 임시 나무는 dist/.tmp-tools-<pid>/ 에 두고 끝나면 지운다(원본 나무는 읽기만 한다).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { lintAll, lintTree, BUDGET, ENV } from '../../tools/lint.mjs';
import { SRC } from '../../tools/build.mjs';
import { LAYERS } from '../../tools/lib/modules.mjs';

const TMP = join(SRC, 'dist', '.tmp-tools-' + process.pid), HEAD = '// 주는 것: 시험 / 받는 것: 없음\n';
const put = (root, rel, text) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), text); };
const cleanup = () => rmSync(TMP, { recursive: true, force: true });
const copy = (root, dir) => { if (existsSync(join(SRC, dir))) cpSync(join(SRC, dir), join(root, dir), { recursive: true }); };
// 원본 나무의 거울(src · shell · vendor · lint 판). 하네스 폴더와 게시 자리는 거울 안의 빈 자리로 돌린다
function mirror(name) {
  const root = join(TMP, name);
  for (const dir of ['src', 'shell', 'vendor', 'tests/lint-negative', 'tests/lint-clean']) copy(root, dir);
  return { root, env: { web: ENV.web, harness: join(root, 'harness'), published: join(root, 'none.html') } };
}
const sized = (result) => result.findings.filter((f) => f.rule === 'size').map((f) => `${f.level} ${f.file}`).sort();
const lines = (n) => HEAD + '// 줄\n'.repeat(n - 1);                        // 꼭 n 줄짜리 모듈
const pad = (bytes) => HEAD + `export const PAD = '${'x'.repeat(bytes)}';\n`;   // bytes 보다 조금 큰 모듈

function lintEdges() {
  try {
    const { root, env } = mirror('lint'), base = lintAll(root, env);
    assert.equal(base.ok, true, '거울 나무가 깨끗하지 않다(뒤의 단언이 뜻을 잃는다): ' + JSON.stringify(base.findings.slice(0, 3)));
    // 양성 대조 나무가 없으면 조용히 통과하지 않는다
    rmSync(join(root, 'tests', 'lint-clean'), { recursive: true });
    const noClean = lintAll(root, env);
    assert.equal(noClean.ok, false); assert.ok(noClean.findings.some((f) => f.rule === 'clean'));
    copy(root, 'tests/lint-clean');
    // --each 판: 안 걸리는 줄이 하나라도 섞이면 그 판이 실패하고 그 줄을 알려 준다
    appendFileSync(join(root, 'tests', 'lint-negative', 'det-ident--each', 'src', 'sim', 'a.js'), 'export const fine = (x) => x + 1;\n');
    const loose = lintAll(root, env), failed = loose.neg.cases.filter((c) => !c.ok);
    assert.equal(loose.ok, false); assert.deepEqual(failed.map((c) => c.name), ['det-ident--each']); assert.equal(failed[0].missed.length, 1);
    copy(root, 'tests/lint-negative');
    assert.equal(lintAll(root, env).ok, true);
  } finally { cleanup(); }
}

// size 규칙의 음성 판: 문턱을 한 칸 넘긴 것은 저마다 걸리고, 문턱에 딱 맞춘 것은 안 걸린다
function sizeRules() {
  try {
    const { root, env } = mirror('size');
    put(root, 'src/view/at.js', lines(BUDGET.lines[0])); put(root, 'src/view/at.glsl.js', lines(BUDGET.glslLines[0]));
    // 원본 나무가 스스로 내는 크기 지적(뒤 단계의 400줄 넘는 모듈 경고 따위)은 빼고, 이 시험이 더한 것만 견준다
    const had = sized(lintAll(root, env)), added = (result) => sized(result).filter((x) => !had.includes(x));
    assert.ok(!had.some((x) => x.includes('/at.')), '문턱에 딱 맞춘 파일이 걸렸다: ' + had);
    put(root, 'src/view/warn.js', lines(BUDGET.lines[0] + 1)); put(root, 'src/view/fail.js', lines(BUDGET.lines[1] + 1));
    put(root, 'src/view/warn.glsl.js', lines(BUDGET.glslLines[0] + 1)); put(root, 'src/view/fail.glsl.js', lines(BUDGET.glslLines[1] + 1));
    put(root, 'src/data/m9/recipe.js', pad(BUDGET.missionData)); put(root, 'src/dev/pad.js', pad(BUDGET.devOnly));
    put(root, 'tests/node/long.test.mjs', '\n'.repeat(BUDGET.testLines + 1));
    put(root, 'harness/check.py', '#\n'.repeat(BUDGET.checkPyLines + 1));
    put(root, 'harness/big.bin', 'x'.repeat(lintAll(root, env).stats.harnessCap));   // 하네스 한도는 게임 코드를 따라 커진다 — 지금 한도만큼 더 얹는다
    const over = lintAll(root, env);
    assert.equal(over.ok, false);
    assert.deepEqual(added(over), [
      'error scripts/games/fogisle/check.py', 'error src/data/m9', 'error src/dev + src/bot', 'error src/view/fail.glsl.js', 'error src/view/fail.js',
      'error tests + scripts/games/fogisle', 'error tests/node/long.test.mjs', 'warn src/view/warn.glsl.js', 'warn src/view/warn.js',
    ]);
    // 배포 HTML 의 크기: 경고 문턱을 넘으면 경고(통과), 실패 문턱을 넘으면 오류
    const html = mirror('html'), now = lintAll(html.root, html.env).stats.htmlBytes, dist = (result) => sized(result).filter((x) => x.includes('dist/'));
    put(html.root, 'src/view/huge.js', pad(Math.max(0, BUDGET.htmlWarn - now)));
    const warned = lintAll(html.root, html.env);
    assert.deepEqual(dist(warned), ['warn dist/fogisle.html']); assert.equal(warned.ok, true);
    put(html.root, 'src/view/huge.js', pad(Math.max(0, BUDGET.htmlFail - now)));
    const tooBig = lintAll(html.root, html.env);
    assert.deepEqual(dist(tooBig), ['error dist/fogisle.html']); assert.equal(tooBig.ok, false);
  } finally { cleanup(); }
}

// 층 표 전체(7 × 7): 설계서(tdd §2-1)의 의존 방향을 여기 따로 적어 두고, lint 가 쌍마다 그대로 판정하는지 본다
const MAY = { shared: 'shared', sim: 'shared sim', bot: 'shared sim bot', data: 'shared data', view: 'shared sim view', app: 'shared sim data view app', dev: LAYERS.join(' ') };
function layerTable() {
  try {
    for (const from of LAYERS) for (const to of LAYERS) {
      const root = join(TMP, 'layer', from + '-' + to);
      put(root, `src/${to}/b.js`, HEAD + 'export const B = 1;\n');
      put(root, `src/${from}/a.js`, HEAD + `import { B } from '${from === to ? '.' : '../' + to}/b.js';\nexport const A = B;\n`);
      assert.deepEqual(lintTree(root).findings.map((f) => f.rule), MAY[from].split(' ').includes(to) ? [] : ['layer'], `${from} → ${to}`);
    }
  } finally { cleanup(); }
}

// simtest 러너의 사본을 임시 나무에서 돌린다: 시험 파일이 문법 오류든 꼴이 틀리든 기준 파일이 깨졌든, 종료 코드 1 + 마지막 줄 JSON
function simtestJson() {
  try {
    const root = join(TMP, 'sim'), bad = join(root, 'tests', 'node', 'bad.test.mjs');
    const run = () => {
      const r = spawnSync(process.execPath, [join(root, 'tools', 'simtest.mjs'), 'gate'], { encoding: 'utf8' });
      return { code: r.status, last: JSON.parse(r.stdout.trim().split('\n').pop()) };
    };
    put(root, 'tools/simtest.mjs', readFileSync(join(SRC, 'tools', 'simtest.mjs'), 'utf8'));
    put(root, 'tests/node/ok.test.mjs', "export const tests = [{ name: '통과', tags: ['gate'], run() {} }];\n");
    let r = run();
    assert.equal(r.code, 0); assert.equal(r.last.ok, true); assert.equal(r.last.passed, 1);
    for (const text of ['export const tests = [;\n', "export const tests = [{ name: '꼬리표 없음', run() {} }];\n", 'export const other = 1;\n']) {
      writeFileSync(bad, text);
      r = run();
      assert.equal(r.code, 1); assert.equal(r.last.ok, false); assert.ok(r.last.problems.some((p) => p.includes('bad.test.mjs')), text);
      assert.equal(r.last.passed, 1, '읽지 못한 파일 때문에 다른 시험까지 안 돌았다');
    }
    writeFileSync(bad, "export const tests = [{ name: '실패', tags: ['gate'], run() { throw new Error('일부러'); } }];\n");
    r = run();
    assert.equal(r.code, 1); assert.equal(r.last.failed, 1); assert.equal(r.last.passed, 1);
    rmSync(bad); put(root, 'tests/golden/sim.json', '{ 깨진 기준');
    r = run();
    assert.equal(r.code, 1); assert.equal(r.last.ok, false); assert.ok(r.last.error);
    // lint 도 같다: 도구의 사본을 읽을 수 없는 파일(끊긴 링크)이 있는 나무에서 돌린다
    cpSync(join(SRC, 'tools'), join(root, 'tools'), { recursive: true });
    mkdirSync(join(root, 'src', 'sim'), { recursive: true }); symlinkSync(join(root, 'none.js'), join(root, 'src', 'sim', 'a.js'));
    const lint = spawnSync(process.execPath, [join(root, 'tools', 'lint.mjs')], { encoding: 'utf8' }), last = JSON.parse(lint.stdout.trim().split('\n').pop());
    assert.equal(lint.status, 1); assert.equal(last.ok, false); assert.equal(last.cmd, 'lint'); assert.ok(last.error);
  } finally { cleanup(); }
}

export const tests = [
  { name: 'lint — 양성 대조가 없으면 실패 · --each 판은 줄마다 걸려야 통과', tags: ['gate', 'tools'], run: lintEdges },
  { name: 'lint size 규칙의 음성 판(줄 수 · 임무 자료 · 개발 전용 · 하네스 · 배포 HTML — 문턱 한 칸 넘김)', tags: ['gate', 'tools'], run: sizeRules },
  { name: 'lint 층 표 7 × 7 — 설계서의 의존 방향 그대로', tags: ['gate', 'tools'], run: layerTable },
  { name: 'simtest · lint — 어떻게 실패해도 종료 코드 1 + 마지막 줄 JSON', tags: ['gate', 'tools'], run: simtestJson },
];
