// 묶기: 두 번 묶어 같은 바이트 · 개발판 − 배포판 = dev · bot 모듈뿐 · 묶은 파일의 덩이를 떼어 Node 로 돌려 원본과 같은 해시 · --check / --publish.
// 묶기는 진짜 명령(node tools/build.mjs --out …)을 따로 띄워 돌리고, 그 산출 파일을 읽어 본다. 임시 산출은 dist/.tmp-<pid>/ 에 두고 끝나면 지운다.
// Node 에서 돌리는 것은 fg-shared 덩이와 fg-main 의 결정성 층(sim · bot · data) 모듈뿐이다. app · view · dev 는 DOM · three 를 만지므로
// 브라우저 하네스(check.py smoke · hash)가 본다 — 그 층에 무엇이 들어와도 이 시험은 깨지지 않아야 한다.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { buildAll, sha256, SRC, PUBLISHED, FILES } from '../../tools/build.mjs';
import { blankCode, topCode, parseModule, wrapModule, DEV_ONLY, DET_LAYERS } from '../../tools/lib/modules.mjs';
import { makeRun, advance, runHash, probeBot } from '../../src/bot/run.js';
import { probeRun, runAll } from '../../src/shared/probe.js';
import { hashState } from '../../src/shared/state.js';

const SEED = 20261118, STEPS = 3000, TMP = join(SRC, 'dist', '.tmp-' + process.pid);
const spawnBuild = (opts, args) => { const r = spawnSync(process.execPath, [join(SRC, 'tools', 'build.mjs'), ...args], { encoding: 'utf8', ...opts }); return { code: r.status, last: JSON.parse(r.stdout.trim().split('\n').pop()) }; };
const build = (...args) => spawnBuild({}, args);
const part = (html, id) => { const m = new RegExp(`<script id="${id}">\\n([\\s\\S]*?)\\n?</script>`).exec(html); assert.ok(m, id + ' 덩이가 없다'); return m[1]; };
const ids = (js) => [...js.matchAll(/^\/\/ ---- (.+)$/gm)].map((m) => m[1]);
const isDevOnly = (id) => DEV_ONLY.includes(id.split('/')[0]);
const cleanup = () => rmSync(TMP, { recursive: true, force: true });
// fg-main 덩이에서 결정성 층의 모듈만 남기고, 등록부(__m)를 읽는 식 하나를 끝에 붙인다(값은 전역 __out 으로 나온다)
const detOnly = (main, expr) => {
  const end = main.indexOf('\n// ==== boot'), [head, ...blocks] = main.slice(0, end).split('\n// ---- ');
  return [head, ...blocks.filter((b) => DET_LAYERS.includes(b.split('/', 1)[0]))].join('\n// ---- ') + `\nG.__out = ${expr};\n})(globalThis);`;
};
// 묶은 HTML 에서 shared 덩이 → main 의 결정성 층만 빈 전역에서 돌리고 식의 값을 돌려준다
const runDet = (html, expr) => {
  const ctx = vm.createContext({});
  vm.runInContext(part(html, 'fg-shared'), ctx); vm.runInContext(detOnly(part(html, 'fg-main'), expr), ctx);
  return ctx.__out;
};
// 진짜 명령으로 묶어 디스크에 쓴 파일을 읽어 온다(이 시험 파일에서 한 번만 묶는다)
const built = { files: null, info: null };
function builtFiles() {
  if (built.files) return built;
  try {
    const r = build('--out', join(TMP, 'built'));
    assert.equal(r.code, 0, '묶기 명령이 실패했다');
    built.files = Object.fromEntries(Object.values(FILES).map((name) => [name, readFileSync(join(TMP, 'built', name), 'utf8')]));
    built.info = buildAll().info;
  } finally { cleanup(); }
  return built;
}

function sameBytes(t) {
  try {
    // 두 번째는 다른 작업 폴더 · 시간대 · 지역 설정에서 — 그래도 같은 바이트여야 한다
    const one = build('--out', join(TMP, 'one')), mem = buildAll();
    const two = spawnBuild({ cwd: '/', env: { ...process.env, TZ: 'Pacific/Kiritimati', LANG: 'C', LC_ALL: 'C' } }, ['--out', join(TMP, 'two')]);
    assert.equal(one.code, 0); assert.equal(two.code, 0);
    for (const name of Object.values(FILES)) {
      const a = readFileSync(join(TMP, 'one', name)), b = readFileSync(join(TMP, 'two', name));
      assert.ok(a.equals(b), name + ': 두 번 묶은 바이트가 다르다');
      assert.equal(a.toString('utf8'), mem.files[name], name + ': 명령으로 묶은 것과 메모리에서 묶은 것이 다르다');
      assert.equal(one.last.files[name].sha256, sha256(a));
      assert.ok(!a.toString('utf8').includes(SRC) && !a.toString('utf8').includes(homedir()), name + ' 에 이 기계의 경로가 들어 있다');
      const dist = join(SRC, 'dist', name);
      if (existsSync(dist)) assert.ok(readFileSync(dist).equals(a), `dist/${name} 이 지금 원본과 다르다 — node tools/build.mjs 를 다시 돌린다`);
    }
    t.note('묶음 sha256', Object.fromEntries(Object.values(FILES).map((name) => [name, one.last.files[name].sha256.slice(0, 16)])));
  } finally { cleanup(); }
}

function devMinusRelease(t) {
  const { files, info } = builtFiles(), dev = files[FILES.dev], rel = files[FILES.release];
  const extra = info.dev.modules.filter((id) => !info.release.modules.includes(id));
  assert.ok(extra.length > 0 && extra.every(isDevOnly), '개발판에만 있는 모듈이 dev · bot 밖에 있다: ' + extra);
  assert.ok(extra.some((id) => id.startsWith('dev/')) && extra.some((id) => id.startsWith('bot/')), '견줄 dev · bot 모듈이 하나씩은 있어야 한다');
  assert.ok(info.release.modules.every((id) => info.dev.modules.includes(id) && !isDevOnly(id)), '배포판에 dev · bot 모듈이 있다');
  assert.deepEqual(ids(part(rel, 'fg-shared')).concat(ids(part(rel, 'fg-main'))), info.release.modules, '배포판의 모듈 표지가 묶은 목록과 다르다');
  assert.equal(part(dev, 'fg-shared'), part(rel, 'fg-shared')); assert.equal(part(dev, 'fg-three'), part(rel, 'fg-three'));
  // 개발판의 fg-main 에서 dev · bot 모듈 덩이만 들어내면 배포판과 한 글자도 다르지 않다
  const main = part(dev, 'fg-main'), end = main.indexOf('\n// ==== boot');
  assert.ok(end > 0 && main.indexOf('\n// ==== ', end + 1) < 0 && main.endsWith('\n})(globalThis);'));
  const [head, ...blocks] = main.slice(0, end).split('\n// ---- ');
  const stripped = [head, ...blocks.filter((b) => !isDevOnly(b.split('\n', 1)[0]))].join('\n// ---- ') + main.slice(end);
  assert.equal(stripped, part(rel, 'fg-main'), '개발판에서 dev · bot 덩이를 뺀 것이 배포판과 다르다');
  const norm = (html) => html.replace(/data-fg-mode="\w+" data-fg-build="\w+"/, '');
  assert.equal(norm(dev.replace(main, () => stripped)), norm(rel), 'fg-main 과 머리 표시 말고도 다른 곳이 있다');   // 함수로 넣는다 — 코드 속 $& 가 바꿔치기 무늬로 읽히지 않게
  assert.notEqual(info.dev.build, info.release.build);
  // dev · bot 폴더를 통째로 뺀 나무의 배포판도 한 글자도 다르지 않다 — 봇이나 개발 창구만 고쳐서는 배포판(빌드 지문)이 안 바뀐다
  try {
    for (const dir of ['src', 'shell', 'vendor']) if (existsSync(join(SRC, dir))) cpSync(join(SRC, dir), join(TMP, 'bare', dir), { recursive: true });
    for (const layer of DEV_ONLY) rmSync(join(TMP, 'bare', 'src', layer), { recursive: true, force: true });
    assert.equal(buildAll(join(TMP, 'bare')).files[FILES.release], rel, 'dev · bot 모듈이 배포판의 모듈 순서나 내용을 바꾼다');
  } finally { cleanup(); }
  t.note('개발판에만 있는 모듈', extra);
}

function chunksInNode(t) {
  const { files } = builtFiles(), bare = makeRun(SEED, null), wantProbe = runAll(probeRun(SEED, STEPS)).hash;
  const wantSim = (() => { const r = makeRun(SEED, probeBot); advance(r, STEPS); return runHash(r); })();
  advance(bare, STEPS);
  // ① fg-shared 덩이만 — 빈 전역에서(브라우저 것도 Node 것도 없이) 돈다. 워커가 받는 것이 이 덩이다: 전역에는 얼린 등록부 하나만 남는다
  const alone = vm.createContext({});
  vm.runInContext(part(files[FILES.release], 'fg-shared'), alone);
  assert.deepEqual(Object.keys(alone), ['__fgShared']);
  const probeExpr = `(function () { const P = __fgShared['shared/probe.js']; return P.runAll(P.probeRun(${SEED}, ${STEPS})).hash; })()`;
  assert.equal(vm.runInContext(probeExpr, alone), wantProbe, 'fg-shared 덩이만 돌린 탐침 해시가 원본과 다르다');
  assert.ok(vm.runInContext(`Object.isFrozen(__fgShared) && Object.isFrozen(__fgShared['shared/dmath.js'])`, alone));
  assert.ok(!Object.keys(alone.__fgShared).some((id) => !id.startsWith('shared/')), 'shared 등록부에 다른 층이 섞였다');
  // ② 개발판의 shared → 결정성 층(sim · bot) — 묶인 봇으로 sim 을 돌린 해시 = 원본
  const botExpr = `(function () { const B = __m['bot/run.js'], r = B.makeRun(${SEED}, B.probeBot); B.advance(r, ${STEPS}); return B.runHash(r); })()`;
  assert.equal(runDet(files[FILES.dev], botExpr), wantSim, '묶은 개발판의 sim 해시가 원본과 다르다');
  // ③ 배포판의 shared → 결정성 층(sim) — 봇이 없으니 빈 입력으로 민 상태 나무의 해시 = 원본
  const bareExpr = `(function () {
    const S = __m['sim/step.js'], ev = __m['shared/events.js'].makeEvents(), input = __m['shared/input.js'].makeInput();
    const state = S.newGame('probe', ${SEED}, 'normal', null);
    for (let i = 0; i < ${STEPS}; i++) { ev.n = 0; S.step(state, null, input, ev); }
    return __m['shared/state.js'].hashState(state);
  })()`;
  assert.equal(runDet(files[FILES.release], bareExpr), hashState(bare.state), '묶은 배포판의 sim 해시가 원본과 다르다');
  assert.equal(sha256(part(files[FILES.release], 'fg-three') + '\n'), /sha256 ([0-9a-f]{64})/.exec(readFileSync(join(SRC, 'vendor', 'README'), 'utf8'))[1]);
  t.note('묶은 파일 = 원본', { sim: wantSim, bare: hashState(bare.state), probe: wantProbe });
}

function checkAndPublish() {
  const before = existsSync(PUBLISHED) ? sha256(readFileSync(PUBLISHED)) : null, target = join(TMP, 'published', 'fogisle.html');
  try {
    assert.equal(build('--out', join(TMP, 'p'), '--publish', target).code, 0);
    assert.ok(readFileSync(target).equals(readFileSync(join(TMP, 'p', FILES.release))));
    const fresh = build('--check', target); assert.equal(fresh.code, 0); assert.equal(fresh.last.same, true);
    writeFileSync(target, readFileSync(target, 'utf8').replace('</body>', '<!-- 손댐 --></body>'));
    const stale = build('--check', target); assert.equal(stale.code, 1); assert.equal(stale.last.same, false); assert.ok(stale.last.publishedBuild);
    assert.equal(build('--check', join(TMP, 'none.html')).code, 1);
    assert.equal(build('--publish').code, 2, '--publish 가 경로 없이도 돌았다 — 게시는 PM 이 정한 때에만');
    assert.deepEqual(readdirSync(join(TMP, 'p')).sort(), Object.values(FILES).sort(), '묶은 폴더에 임시 파일이 남았다');
    assert.deepEqual(readdirSync(join(TMP, 'published')), ['fogisle.html'], '게시 폴더에 임시 파일이 남았다');
    for (const args of [['--pubish', target], ['--out', join(TMP, 'q'), 'stray'], ['-o', join(TMP, 'q')]]) {
      const r = build(...args);
      assert.equal(r.code, 2, '모르는 인자를 조용히 넘겼다: ' + args[0]); assert.equal(r.last.ok, false);
    }
    assert.equal(existsSync(join(TMP, 'q')), false, '거절한 명령이 파일을 썼다');
  } finally { cleanup(); }
  assert.equal(existsSync(PUBLISHED) ? sha256(readFileSync(PUBLISHED)) : null, before, '시험이 진짜 게시 자리(web/games/embed/fogisle.html)를 건드렸다');
}

// 여럿이 같은 폴더에 동시에 묶어도, 그 사이에 읽는 쪽은 늘 온전한 파일만 본다(임시 이름으로 쓴 뒤 rename)
async function concurrent(t) {
  const out = join(TMP, 'race'), want = sha256(Buffer.from(buildAll().files[FILES.release], 'utf8')), file = join(out, FILES.release);
  try {
    assert.equal(build('--out', out).code, 0);
    let running = 6, reads = 0;
    const codes = [];
    for (let i = 0; i < 6; i++) spawn(process.execPath, [join(SRC, 'tools', 'build.mjs'), '--out', out], { stdio: 'ignore' }).on('exit', (code) => { codes.push(code); running--; });
    while (running > 0) {
      assert.equal(sha256(readFileSync(file)), want, '묶는 도중에 읽은 파일이 온전하지 않다');
      reads++;
      await new Promise((done) => setImmediate(done));
    }
    assert.deepEqual(codes, [0, 0, 0, 0, 0, 0]);
    assert.deepEqual(readdirSync(out).sort(), Object.values(FILES).sort(), '임시 파일이 남았다');
    t.note('동시에 묶기', `묶기 6개가 도는 동안 ${reads}번 읽음 — 전부 온전`);
  } finally { cleanup(); }
}

// 다음 단계(F0b)가 기대는 약속을 임시 나무로 미리 본다: shell 세 파일이 제자리에 들어가고, 모든 모듈을 올린 뒤(dev 포함) app/main.js 의 boot 가 한 번 불린다
function shellAndBoot() {
  const root = join(TMP, 'tree'), put = (rel, text) => { mkdirSync(join(root, rel, '..'), { recursive: true }); writeFileSync(join(root, rel), text); };
  try {
    for (const name of ['three-r160.min.js', 'README']) put('vendor/' + name, readFileSync(join(SRC, 'vendor', name)));
    put('shell/head.html', '<title>시험</title>\n'); put('shell/body.html', '<canvas id="view"></canvas>\n'); put('shell/style.css', 'body { margin: 0; }\n');
    put('src/shared/a.js', '// 주는 것: A / 받는 것: 없음\nexport const A = 7;\n');
    put('src/app/main.js', "// 주는 것: boot / 받는 것: A\nimport { A } from '../shared/a.js';\nexport function boot() { globalThis.order.push('boot ' + A + ' ' + typeof globalThis.hook); }\n");
    put('src/dev/hook.js', "// 주는 것: 손잡이 / 받는 것: 없음\nglobalThis.hook = 1;\nglobalThis.order.push('dev');\n");
    const { files } = buildAll(root), run = (html) => { const ctx = vm.createContext({ order: [] }); vm.runInContext(part(html, 'fg-shared'), ctx); vm.runInContext(part(html, 'fg-main'), ctx); return ctx.order; };
    assert.deepEqual(run(files[FILES.dev]), ['dev', 'boot 7 number']); assert.deepEqual(run(files[FILES.release]), ['boot 7 undefined']);
    const html = files[FILES.release], at = (text) => { const i = html.indexOf(text); assert.ok(i > 0, text + ' 가 없다'); return i; };
    assert.ok(at('<meta charset="utf-8">') < at('<title>시험</title>') && at('<title>시험</title>') < at('<style>\nbody { margin: 0; }\n</style>') && at('</head>') < at('<canvas id="view"></canvas>'));
    assert.ok(at('<canvas id="view"></canvas>') < at('<script id="fg-three">') && at('<script id="fg-three">') < at('<script id="fg-shared">') && at('<script id="fg-shared">') < at('<script id="fg-main">'));
    // 다음 단계들이 넣을 꼴: boot 가 DOM 을 만지고, view 가 맨 위에서 three 를 쓰고, dev 가 창을 만진다 — 결정성 층만 떼어 돌리면 Node 에서 그대로 돈다
    put('src/sim/s.js', "// 주는 것: twice / 받는 것: A\nimport { A } from '../shared/a.js';\nexport function twice() { return A * 2; }\n");
    put('src/view/v.js', "// 주는 것: draw / 받는 것: sim\nimport { twice } from '../sim/s.js';\nconst TMP = new THREE.Vector3();\nexport function draw() { return TMP.x + twice(); }\n");
    put('src/app/main.js', "// 주는 것: boot / 받는 것: view\nimport { draw } from '../view/v.js';\nexport function boot() { document.getElementById('view').width = draw(); }\n");
    put('src/dev/hook.js', "// 주는 것: 손잡이 / 받는 것: 없음\nwindow.__fg = { v: 0 };\n");
    const next = buildAll(root).files;
    assert.throws(() => run(next[FILES.dev]), /THREE|document|window/, '이 나무의 fg-main 은 빈 전역에서 통째로 돌 수 없어야 한다(시험의 전제)');
    assert.equal(runDet(next[FILES.dev], "__m['sim/s.js'].twice()"), 14); assert.equal(runDet(next[FILES.release], "__m['sim/s.js'].twice()"), 14);
    put('src/app/bad.js', "// 주는 것: 없음 / 받는 것: 없음\nexport const S = '</scr' + 'ipt>'; // </script>\n");
    assert.throws(() => buildAll(root), /<\/script/);
  } finally { cleanup(); }
}

// 까다롭지만 허용 안인 꼴을 모은 모듈 — 묶음에 들어가는 꼴로 돌린 값이 원본(ESM)과 같아야 한다
const TRICKY = `// 주는 것: 까다로운 꼴 / 받는 것: 없음
/* 여러 줄 주석은
   주석만 있는 줄에서 열고 닫는다 */
const quote = (s) => /['"\`]/.test(s) + /\`/.test(s);   // => · + 뒤는 정규식이다(속의 백틱이 템플릿을 열지 않는다)
const half = (n) => { let i = n; return i++ / 2 / 1; }; /* 후위 ++ 뒤는 나눗셈 */
const marks = [];
function mark(s) { if (s) /\`/.test(s) && marks.push(s); return (marks.length) / 1; }   // if (…) 뒤는 정규식, 다른 괄호 뒤는 나눗셈
const TEXT = \`첫 줄
// 템플릿 속 줄은 주석이 아니다 \${half(4)} /* 이것도 */

export const 도 글자다 \${/\\//.test('a/b') ? \`안 \${1 + 1}\` : 'x'}\`;
function helper() { return 2; }
export const ALL = [quote('a\`b'), quote('ab'), half(3), TEXT, helper(), 'a // b'.length, 6 / 2 / 3, mark('a\`b'), mark('')];
export function useLater() { return helper() + ALL.length; }
`;

async function parser() {
  const src = "const a = 'x // y'; // 주석 Math.sin\n/* Date */ const b = `t ${a + `in ${1}`} //\nlet z` + /[/'\"]+/.test(a) / 2;\nconst c = 4 / 2 / 1; // 끝\n";
  const { code, tpl } = blankCode(src);
  assert.equal(code.length, src.length); assert.equal(code.split('\n').length, src.split('\n').length);
  assert.ok(!/Math|Date|let z|주석|끝/.test(code) && code.includes('const c = 4 / 2 / 1;') && code.includes('a + `') && code.includes('.test(a) / 2;'), code);
  assert.deepEqual([...tpl], [2]);
  const m = parseModule('sim/x.js', "// 머리\nimport { a, b as c } from './y.js';\nimport * as T from '../shared/t.js';\n\nexport const K = `\n// 템플릿 속 줄은 남긴다\n\n`;\n  // 주석 줄\nexport function* gen() { yield a; }\nfunction hidden() {}\nexport { hidden };\n");
  assert.deepEqual(m.errors, []); assert.deepEqual(m.exports, ['K', 'gen', 'hidden']);
  assert.deepEqual(m.imports.map((i) => [i.target, i.ns, i.names]), [['sim/y.js', null, [['a'], ['b', 'c']]], ['shared/t.js', 'T', null]]);
  assert.deepEqual(m.body, [null, null, 'const K = `', '// 템플릿 속 줄은 남긴다', '', '`;', 'function* gen() { yield a; }', 'function hidden() {}']);
  // 정규식 판별: 연산자 · => · 낱말(yield …) 뒤는 정규식, 값 · 후위 ++ 뒤는 나눗셈. 여러 줄 주석의 자리 · 맨 바깥 글
  const re = blankCode("f = (s) => /`/.test(s) + /'/.test(s); g = i++ / 2 / `${/\"/.test(s)}`; function* h() { yield /'/; }\nexport const k = 1;\n");
  assert.equal(re.tpl.size, 0);
  assert.ok(re.code.startsWith("f = (s) => /_/.test(s) + /_/.test(s); g = i++ / 2 / `${/_/.test(s)}`; function* h() { yield /_/; }\nexport const k = 1;"), re.code);
  // 조건 괄호(if · while · for · with) 바로 뒤의 '/' 는 정규식, 그 밖의 닫는 괄호 뒤는 나눗셈
  const cond = "if (a / (b)) /'/.test(s); while (x) /`/.test(s); y = (a) / 2 / f(1) / 3; for (;;) /\"/.test(s); o.if(1) / 2 / 1;\n";
  assert.equal(blankCode(cond).code, cond.replace(/\/['`"]\//g, '/_/')); assert.equal(blankCode(cond).tpl.size, 0);
  assert.deepEqual(blankCode('a; /* x\n y */ b;\n/* z */\n/* p\n q */\n').blocks, [[0, 1], [3, 4]]);
  assert.equal(topCode('a = { b: [1, (2)] }, c;\nf(x);'), 'a = {             }, c;\nf( );');
  // 템플릿 속 줄(셰이더 글 따위)이 묶음의 모듈 표지 꼴로 시작하면 거부한다 — 주석 줄로 쓴 같은 꼴은 묶을 때 빠지므로 괜찮다
  assert.equal(parseModule('view/g.js', '// 머리\n// ---- 주석 줄\nexport const G = `\n// ---- 셰이더 속 구분 줄\n// ==== 이것도\n //---- 이것은 괜찮다\n`;\n').errors.length, 2);
  // 묶음에 들어가는 꼴 = 원본: 임시 파일을 ESM 으로 읽은 값과, 풀어서 싼 덩이를 빈 전역에서 돌린 값
  try {
    mkdirSync(join(TMP, 'tricky'), { recursive: true }); writeFileSync(join(TMP, 'tricky', 't.js'), TRICKY);
    const esm = await import(pathToFileURL(join(TMP, 'tricky', 't.js')).href), t = parseModule('shared/t.js', TRICKY);
    assert.deepEqual(t.errors, []);
    const got = vm.runInNewContext(`const __m = {};\n${wrapModule(t)}\nJSON.stringify([__m['shared/t.js'].ALL, __m['shared/t.js'].useLater()])`);
    assert.equal(got, JSON.stringify([esm.ALL, esm.useLater()]), '까다로운 꼴에서 묶음과 원본이 갈렸다');
    assert.ok(esm.ALL[3].includes('// 템플릿 속 줄') && esm.ALL[3].includes('export const 도 글자다 안 2') && esm.ALL[0] === 2 && esm.ALL[1] === 0 && esm.ALL[7] === 1);
  } finally { cleanup(); }
}

export const tests = [
  { name: '묶기 두 번 = 같은 바이트(명령 두 번 + 메모리 · dist 와도 같음)', tags: ['gate', 'bundle'], run: sameBytes },
  { name: '개발판 − 배포판 = dev · bot 모듈뿐(글자 단위)', tags: ['gate', 'bundle'], run: devMinusRelease },
  { name: '묶은 파일의 덩이를 Node 로 — fg-shared 만으로 탐침 해시 · 개발판 sim 해시 = 원본', tags: ['gate', 'bundle', 'determinism'], run: chunksInNode },
  { name: '--check · --publish(임시 경로) — 진짜 게시 자리는 건드리지 않는다', tags: ['gate', 'bundle'], run: checkAndPublish },
  { name: '동시에 묶기 — 읽는 쪽은 늘 온전한 파일', tags: ['gate', 'bundle'], run: concurrent },
  { name: 'shell 넣기 · boot 약속(임시 나무) · </script 막기', tags: ['gate', 'bundle'], run: shellAndBoot },
  { name: '주석 · 문자열 가리기와 모듈 풀기', tags: ['gate', 'bundle'], run: parser },
];
