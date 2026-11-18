#!/usr/bin/env node
// 주는 것: 정적 검사(lintTree — 원본 나무 하나를 본다) + 음성 시험(tests/lint-negative 의 판마다 「그 규칙만」 걸리는지) +
//   양성 대조(tests/lint-clean 은 한 건도 안 걸려야 한다). 종료 코드 0 = 통과, 마지막 줄 JSON. lintAll(root, env) 로 다른 나무도 본다(시험용).
// 받는 것: src/** · shell/** · vendor · tests/lint-negative/** · tests/lint-clean/**. 크기는 묶기를 메모리에서 돌려 잰다(dist 를 읽지 않는다).
// 규칙(이름 = 음성 시험 폴더 이름의 앞머리) — 근거는 tdd §2-2 · §3-1 · §3-2 · §3-6 · §14-1 · §14-7, build-plan 0-2:
//   syntax 허용 밖 문법 · resolve 없는 모듈/이름 · layer 거꾸로 import · cycle 순환 · header 머리 주석 · size 줄 수/크기 예산
//   det-ident 금지 식별자 · det-math 초월 함수와 ** · top-let 모듈 맨 위 let/var · det-order for…in 과 비교 함수 없는 sort (shared · sim · bot · data 만)
//   dialog alert 류 · event 사건 표에 없는 EV.이름 · url 바깥 주소 · asset 없는 자산 · word 금지어 (모든 층 — 뒤의 셋은 shell 도)
// 음성 시험 판: 폴더 이름의 -- 앞이 규칙 이름이다. 이름이 --each 로 끝나는 판은 머리 줄 뒤의 「모든 줄」이 저마다 그 규칙에 걸려야 한다
//   (목록 꼴 규칙에서 낱말 하나가 빠져도 그 줄이 알린다). size 규칙의 음성 시험은 판이 커서 tests/node/tools.test.mjs 가 임시 나무로 한다.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTree, topCode, walk, DET_LAYERS, DEV_ONLY } from './lib/modules.mjs';
import { buildAll, SRC, REPO, PUBLISHED, FILES } from './build.mjs';
import { WORDS_LATIN, WORDS_HANGUL } from './lint-words.mjs';

// 나무 밖의 자리: 자산을 찾는 web 폴더 · 브라우저 하네스 폴더 · 게시 파일
export const ENV = { web: join(REPO, 'web'), harness: join(REPO, 'scripts', 'games', 'fogisle'), published: PUBLISHED };
// 크기 예산(바이트 · 줄). 하네스는 게임 코드의 25% 이하 — 다만 게임 코드가 아직 작은 앞 단계에서는 바닥 값까지는 허용한다.
// 바닥 300KB = PM 결정(2026-11-18 — F0b 까지 141KB 를 썼고 F1a · F1b 가 레시피 검사 · 생성 해시 · 굽기 하네스를 더할 자리).
export const BUDGET = {
  htmlWarn: 2.4e6, htmlFail: 3.0e6, missionData: 40e3, devOnly: 200e3, harnessRatio: 0.25, harnessFloor: 300e3,
  lines: [400, 600], glslLines: [600, 900], testLines: 400, checkPyLines: 600,
};
// 음성 시험이 꼭 한 판 이상 있어야 하는 규칙(build-plan F0a 의 9종)
const REQUIRED = ['det-ident', 'det-math', 'layer', 'cycle', 'syntax', 'top-let', 'url', 'asset', 'word'];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// 낱말 사이 빈칸은 몇 칸이든(한글은 붙여 써도) 같은 낱말로 본다
const RE_LATIN = new RegExp('(?<![a-z0-9])(?:' + WORDS_LATIN.map((w) => esc(w).replace(/ /g, '\\s+')).join('|') + ')(?![a-z0-9])', 'gi');
const RE_HANGUL = new RegExp(WORDS_HANGUL.map((w) => esc(w).replace(/ /g, '\\s*')).join('|'), 'g');
// 맨 이름의 앞: 다른 이름의 꼬리가 아니고 속성 접근(.)도 아니다 — 전개(...) 바로 뒤는 맨 이름이다
const BARE = '(?<![\\w$]|(?<!\\.\\.)\\.)';
const DET_IDENTS = [
  'Date', 'performance', 'setTimeout', 'setInterval', 'setImmediate', 'requestAnimationFrame', 'cancelAnimationFrame', 'queueMicrotask',
  'MessageChannel', 'document', 'window', 'self', 'globalThis', 'navigator', 'location', 'localStorage', 'sessionStorage', 'console',
  'THREE', 'Image', 'fetch', 'XMLHttpRequest', 'WebSocket', 'Worker', 'crypto', 'process', 'require', 'structuredClone', 'Atomics',
  'SharedArrayBuffer', 'async', 'await', 'Promise', 'Intl', 'eval', 'Function', 'WeakRef', 'FinalizationRegistry',
];
const RE_DET_IDENT = new RegExp(BARE + '(' + DET_IDENTS.join('|') + ')\\b|\\.(localeCompare|toLocale\\w+|stack)\\b', 'g');
const RE_MATH = /\bMath\b(?!\.(?:abs|floor|ceil|round|trunc|min|max|sqrt|sign|imul|fround|PI|E|LN2|LN10|LOG2E|LOG10E|SQRT2|SQRT1_2)\b)(?:\.(\w+))?/g;
const RE_TOP_LET = new RegExp(BARE + '(?:let|var)\\b', 'g');
const RE_SORT = /\.(?:sort|toSorted)\(\s*(?:undefined\s*)?\)/g;
const RE_DIALOG = new RegExp('(?:' + BARE + '|(?<=\\b(?:window|self|globalThis|parent|top)\\s*\\.\\s*))(alert|confirm|prompt)\\s*\\(', 'g');
const RE_EV = new RegExp(BARE + 'EV\\.([A-Za-z_$][\\w$]*)', 'g');
// 프로토콜이 있는 주소 · 따옴표나 url( 바로 뒤의 //호스트 · CDN 이름
const RE_URL = /\b(?:https?|wss?|ftp):\/\/(?!www\.w3\.org\/)[^\s'"`)]*|(?<=['"`]|url\()\/\/[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}[^\s'"`)]*|\b(?:cdnjs|unpkg|jsdelivr)\.[\w.]*/g;
const RE_ASSET = /(?<![\w.:/])\/(?:assets|_shared)\/[\w\-./]+\.[A-Za-z0-9]+/g;
const lineOf = (text, index) => text.slice(0, index).split('\n').length;

// 사건 표(shared/events.js 의 EVENTS)에 적힌 종류 이름. 그 모듈이 없는 나무면 null(검사하지 않는다), 표를 못 읽으면 빈 목록
function eventNames(tree) {
  const m = tree.mods.get('shared/events.js');
  if (!m) return null;
  const at = m.code.search(/^export const EVENTS\b/m), open = at < 0 ? -1 : m.code.indexOf('{', at);
  if (open < 0) return [];
  let depth = 0, close = open;
  for (; close < m.code.length; close++) {
    if (m.code[close] === '{') depth++;
    else if (m.code[close] === '}' && --depth === 0) break;
  }
  return [...topCode(m.code.slice(open + 1, close)).matchAll(/([A-Za-z_$][\w$]*)\s*:/g)].map((x) => x[1]);
}

// 원본 나무 하나(root/src · root/shell)를 본다 → { findings[{ level, rule, file, line, msg }], tree }
export function lintTree(root, webRoot = ENV.web) {
  const findings = [], add = (level, rule, file, line, msg) => findings.push({ level, rule, file, line, msg });
  const tree = loadTree(join(root, 'src')), events = eventNames(tree);
  for (const e of tree.errors) add('error', e.rule, 'src/' + e.file, e.line, e.msg);
  if (events && !events.length) add('error', 'event', 'src/shared/events.js', 0, 'EVENTS 표를 읽지 못했다 — export const EVENTS = …({ 종류: [필드…], … }) 꼴로 적는다');
  for (const m of tree.mods.values()) {
    const file = 'src/' + m.id;
    const hit = (re, rule, msg, text = m.code) => { for (const x of text.matchAll(re)) add('error', rule, file, lineOf(text, x.index), msg(x)); };
    const head = m.raw.split('\n', 5).join('\n');
    if (!m.raw.startsWith('//') || !head.includes('주는 것') || !head.includes('받는 것')) add('error', 'header', file, 1, '파일 맨 위 주석에 「주는 것 / 받는 것」을 적는다');
    const [warnAt, failAt] = m.id.endsWith('.glsl.js') ? BUDGET.glslLines : BUDGET.lines;
    if (m.lines > warnAt) add(m.lines > failAt ? 'error' : 'warn', 'size', file, m.lines, `${m.lines}줄 — ${warnAt}줄을 넘으면 경고, ${failAt}줄을 넘으면 실패(나눈다)`);
    hit(RE_DIALOG, 'dialog', (x) => `${x[1]}() 은 아케이드 창(sandbox)에서 쓸 수 없다`);
    if (events) for (const x of m.code.matchAll(RE_EV)) {
      if (!events.includes(x[1])) add('error', 'event', file, lineOf(m.code, x.index), `EV.${x[1]} — 사건 표(shared/events.js 의 EVENTS)에 없는 종류다`);
    }
    if (!DET_LAYERS.includes(m.layer)) continue;
    hit(RE_DET_IDENT, 'det-ident', (x) => `${x[1] || x[2]} — ${m.layer} 층은 DOM · three · 벽시계 · 비동기 · 지역 설정 · 글자로 만든 코드 · 오류의 .stack(기계마다 다른 글)을 모른다`);
    hit(RE_MATH, 'det-math', (x) => `Math${x[1] ? '.' + x[1] : ''} 은 허용 밖이다 — 초월 함수는 shared/dmath, 난수는 shared/rng`);
    hit(/\*\*/g, 'det-math', () => '거듭제곱 연산자(**) 대신 dpow 를 쓴다');
    hit(RE_TOP_LET, 'top-let', () => '모듈 맨 위 let · var 는 숨은 상태다 — 상태는 나무 안에, 표는 const 로', m.top);
    hit(/\bfor\s*\([^()]*\sin\s/g, 'det-order', () => 'for…in 은 쓰지 않는다(도는 순서)');
    hit(RE_SORT, 'det-order', () => '비교 함수 없는 sort · toSorted 는 쓰지 않는다(동률은 id 로 깬다)');
  }
  const texts = [...tree.mods.values()].map((m) => ['src/' + m.id, m.raw]);
  for (const rel of walk(join(root, 'shell'))) texts.push(['shell/' + rel, readFileSync(join(root, 'shell', rel), 'utf8')]);
  for (const [file, raw] of texts) {
    for (const x of raw.matchAll(RE_URL)) add('error', 'url', file, lineOf(raw, x.index), '바깥 주소 · CDN 은 둘 수 없다: ' + x[0]);
    for (const x of raw.matchAll(RE_ASSET)) if (!existsSync(join(webRoot, x[0]))) add('error', 'asset', file, lineOf(raw, x.index), '없는 자산: ' + x[0]);
    for (const re of [RE_LATIN, RE_HANGUL]) for (const x of raw.matchAll(re)) add('error', 'word', file, lineOf(raw, x.index), '금지어: ' + x[0]);
  }
  return { findings, tree };
}

// 나무 전체: lintTree + 묶기 · vendor · 크기 예산 · 시험 파일 줄 수 · 게시 파일 상태
function lintProject(root, env) {
  const { findings, tree } = lintTree(root, env.web), add = (level, rule, file, line, msg) => findings.push({ level, rule, file, line, msg });
  const bytes = (dir, pick = () => true) => walk(dir).filter(pick).reduce((sum, rel) => sum + statSync(join(dir, rel)).size, 0);
  const lines = (file) => readFileSync(file, 'utf8').split('\n').length - 1;
  const stats = { modules: tree.mods.size, htmlBytes: null, published: 'unknown' };
  if (!findings.some((f) => f.level === 'error')) {
    try {
      const release = buildAll(root).files[FILES.release];
      stats.htmlBytes = Buffer.byteLength(release);
      if (stats.htmlBytes > BUDGET.htmlWarn) {
        add(stats.htmlBytes > BUDGET.htmlFail ? 'error' : 'warn', 'size', 'dist/' + FILES.release, 0, `배포 HTML ${stats.htmlBytes} 바이트(경고 ${BUDGET.htmlWarn} · 실패 ${BUDGET.htmlFail})`);
      }
      const pub = existsSync(env.published) ? readFileSync(env.published, 'utf8') : null;
      stats.published = pub === null ? 'none' : pub === release ? 'fresh' : pub.slice(0, 200).includes('data-fg-build=') ? 'stale' : 'legacy';
      if (stats.published === 'stale') add('warn', 'publish', 'web/games/embed/fogisle.html', 0, '게시 파일이 지금 원본과 다르다(게시는 PM 이 정한 때에)');
    } catch (e) { add('error', 'build', 'tools/build.mjs', 0, e.message); }
  }
  const dataDir = join(root, 'src', 'data');
  for (const name of existsSync(dataDir) ? readdirSync(dataDir).sort() : []) {
    const b = bytes(join(dataDir, name));
    if (b > BUDGET.missionData) add('error', 'size', 'src/data/' + name, 0, `임무 자료 ${b} 바이트 — ${BUDGET.missionData} 이하`);
  }
  stats.devBytes = DEV_ONLY.reduce((sum, layer) => sum + bytes(join(root, 'src', layer)), 0);
  stats.gameBytes = bytes(join(root, 'src')) - stats.devBytes;
  stats.harnessBytes = bytes(env.harness, (rel) => !rel.includes('__pycache__')) + bytes(join(root, 'tests'), (rel) => !rel.startsWith('golden/'));
  stats.harnessCap = Math.round(Math.max(BUDGET.harnessFloor, stats.gameBytes * BUDGET.harnessRatio));
  if (stats.devBytes > BUDGET.devOnly) add('error', 'size', 'src/dev + src/bot', 0, `개발 전용 ${stats.devBytes} 바이트 — ${BUDGET.devOnly} 이하`);
  if (stats.harnessBytes > stats.harnessCap) {
    add('error', 'size', 'tests + scripts/games/fogisle', 0, `하네스 ${stats.harnessBytes} 바이트 — 게임 코드(${stats.gameBytes})의 25% 와 바닥 ${BUDGET.harnessFloor} 가운데 큰 값 이하`);
  }
  for (const rel of walk(join(root, 'tests', 'node'))) {
    const n = lines(join(root, 'tests', 'node', rel));
    if (n > BUDGET.testLines) add('error', 'size', 'tests/node/' + rel, n, `Node 시험 파일은 ${BUDGET.testLines}줄 이하(주제별로 나눈다)`);
  }
  const checkPy = join(env.harness, 'check.py');
  if (existsSync(checkPy) && lines(checkPy) > BUDGET.checkPyLines) add('error', 'size', 'scripts/games/fogisle/check.py', 0, `check.py 는 ${BUDGET.checkPyLines}줄 이하(cases/*.py 로 나눈다)`);
  return { findings, stats };
}

// 음성 시험: 판(폴더)마다 이름 앞머리의 규칙이 걸려야 하고, 다른 규칙은 걸리지 않아야 한다(그 규칙이 정말 그것을 잡는다는 뜻).
// --each 판은 머리 줄(첫 줄) 뒤의 빈 줄 아닌 모든 줄에 그 규칙의 지적이 하나씩은 있어야 한다 — 없는 줄은 missed 에 적힌다.
function runNegative(root, env) {
  const dir = join(root, 'tests', 'lint-negative'), cases = [];
  for (const name of existsSync(dir) ? readdirSync(dir).sort() : []) {
    if (name.startsWith('.') || !statSync(join(dir, name)).isDirectory()) continue;
    const rule = name.split('--')[0], errors = lintTree(join(dir, name), env.web).findings.filter((f) => f.level === 'error');
    const mine = errors.filter((f) => f.rule === rule), other = [...new Set(errors.filter((f) => f.rule !== rule).map((f) => f.rule))], missed = [];
    if (name.endsWith('--each')) for (const rel of walk(join(dir, name, 'src'))) {
      readFileSync(join(dir, name, 'src', rel), 'utf8').split('\n').forEach((text, i) => {
        if (i > 0 && text.trim() !== '' && !mine.some((f) => f.file === 'src/' + rel && f.line === i + 1)) missed.push(`${rel}:${i + 1}`);
      });
    }
    cases.push({ name, rule, hits: mine.length, other, missed, ok: mine.length > 0 && other.length === 0 && missed.length === 0 });
  }
  return { cases, missing: REQUIRED.filter((rule) => !cases.some((c) => c.rule === rule && c.ok)) };
}

// 나무 하나를 통째로 본다 → { ok, findings, neg, stats, caught }. 양성 대조 나무가 없거나 비었으면 실패다(조용히 빠지지 않게).
export function lintAll(root = SRC, env = ENV) {
  const { findings, stats } = lintProject(root, env), neg = runNegative(root, env), clean = lintTree(join(root, 'tests', 'lint-clean'), env.web);
  // 양성 대조: 다음 단계가 쓸 법한 꼴을 모아 둔 나무는 한 건도 걸리면 안 된다 — 규칙이 엉뚱한 것을 잡지 않는지 본다
  if (!clean.tree.mods.size) findings.push({ level: 'error', rule: 'clean', file: 'tests/lint-clean', line: 0, msg: '양성 대조 나무가 없다 — 규칙이 엉뚱한 것을 잡는지 볼 수 없다' });
  for (const f of clean.findings) findings.push({ ...f, level: 'error', file: 'tests/lint-clean/' + f.file, msg: '(양성 대조가 걸렸다) ' + f.msg });
  const errors = findings.filter((f) => f.level === 'error').length, caught = neg.cases.filter((c) => c.ok).length;
  return { ok: errors === 0 && caught === neg.cases.length && neg.missing.length === 0, findings, neg, stats, caught, errors };
}

// 검사 도중에 터져도(읽을 수 없는 파일 따위) 마지막 줄은 JSON 이다 — 하네스가 그 줄을 읽는다
function main() {
  const t0 = Date.now();
  let all;
  try { all = lintAll(); } catch (e) {
    console.log(String(e.stack || e));
    console.log(JSON.stringify({ ok: false, cmd: 'lint', error: String(e.message || e).split('\n')[0] }));
    process.exit(1);
  }
  const { ok, findings, neg, stats, caught, errors } = all, warnings = findings.length - errors;
  for (const f of findings) console.log(`${f.level === 'error' ? '오류' : '경고'} [${f.rule}] ${f.file}${f.line ? ':' + f.line : ''} — ${f.msg}`);
  for (const c of neg.cases) {
    if (c.ok) continue;
    const why = [c.hits ? '' : '안 걸림', c.other.length ? '다른 규칙도 걸림: ' + c.other.join(', ') : '', c.missed.length ? '안 걸린 줄: ' + c.missed.join(', ') : ''];
    console.log(`음성 시험 실패 ${c.name} — ${c.rule} ${c.hits}건 · ${why.filter(Boolean).join(' · ')}`);
  }
  if (neg.missing.length) console.log('음성 시험이 없는 필수 규칙: ' + neg.missing.join(', '));
  const rules = [...new Set(neg.cases.filter((c) => c.ok).map((c) => c.rule))];
  console.log(`정적 검사: 모듈 ${stats.modules}개 · 오류 ${errors} · 경고 ${warnings} / 음성 시험: ${caught} / ${neg.cases.length}판 걸림(규칙 ${rules.length}종)`);
  console.log(JSON.stringify({ ok, cmd: 'lint', errors, warnings, negative: { cases: neg.cases.length, caught, rules, missing: neg.missing }, ...stats, ms: Date.now() - t0 }));
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
