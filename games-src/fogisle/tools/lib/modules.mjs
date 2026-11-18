// 주는 것: 원본 나무 읽기(walk) · 주석과 문자열 가리기(blankCode) · 맨 바깥 코드만 남기기(topCode) · 모듈 풀기(parseModule) ·
//   묶음에 들어갈 꼴로 싸기(wrapModule) · 나무 싣기 + 층 · 이름 · 순환 검사 + 위상 순서(loadTree).
// 받는 것: Node 기본 기능만. build.mjs 와 lint.mjs 가 같은 눈으로 원본을 본다 — 허용 문법 네 꼴(tdd §3-2):
//   import { a, b as c } from './x.js';   import * as X from './x.js';   export const|function|class 이름   export { a, b };
// 허용 밖 꼴은 여기서 오류로 만든다(lint 와 묶기가 같이 거부). 그래도 샌 것은 loadTree 가 묶은 꼴을 한 번 컴파일해 보고 잡는다.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import vm from 'node:vm';

export const LAYERS = ['shared', 'sim', 'bot', 'data', 'view', 'app', 'dev'];
export const DEV_ONLY = ['bot', 'dev'];                  // 배포판에서 빠지는 층
export const DET_LAYERS = ['shared', 'sim', 'bot', 'data'];   // 결정성 규칙(tdd §2-2)이 걸리는 층
// 의존 방향: shared ← sim ← bot, shared · sim ← view, data → shared, app → 배포판에 있는 전부, dev → 전부
export const MAY_IMPORT = {
  shared: ['shared'], sim: ['shared', 'sim'], bot: ['shared', 'sim', 'bot'], data: ['shared', 'data'],
  view: ['shared', 'sim', 'view'], app: ['shared', 'sim', 'data', 'view', 'app'], dev: LAYERS,
};

// 폴더 아래 모든 파일의 상대 경로(이름 순 — 파일 시스템이 주는 순서에 기대지 않는다)
export function walk(dir, rel = '', out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith('.')) continue;
    const full = join(dir, name), r = rel ? rel + '/' + name : name;
    if (statSync(full).isDirectory()) walk(full, r, out); else out.push(r);
  }
  return out;
}

// '/' 앞의 낱말이 이것이면 뒤는 나눗셈이 아니라 정규식이다
const RE_WORD_BEFORE_REGEX = /(?:^|[^.\w$])(?:return|typeof|case|in|of|void|delete|instanceof|new|do|else|yield|await|throw)$/;
// '(' 앞의 낱말이 이것이면 그 괄호는 조건이다 — 닫는 ')' 바로 뒤의 '/' 는 문장을 여는 정규식이다(값의 끝이 아니다)
const RE_WORD_BEFORE_COND = /(?:^|[^.\w$])(?:if|while|for|with)$/;

// 주석은 빈칸으로, 문자열 · 템플릿 · 정규식의 속은 '_' 로 바꾼다(길이와 줄바꿈은 그대로).
// tpl = 템플릿 글자 안에서 시작하는 줄 번호(0부터) — 묶을 때 그 줄은 건드리지 않는다.
// blocks = 여러 줄에 걸친 블록 주석의 [여는 줄, 닫는 줄](0부터).
export function blankCode(src) {
  const out = [], tpl = new Set(), blocks = [], depth = [], cond = [], n = src.length;
  let i = 0, line = 0, prev = '', at = -1, afterCond = false;   // prev = 바로 앞의 뜻 있는 글자, at = 그 자리, afterCond = 방금 닫힌 ')' 가 조건 괄호였나
  const put = (fill) => { const ch = src[i++]; if (ch === '\n') { out.push(ch); line++; } else out.push(fill === undefined ? ch : fill); return ch; };
  const quoted = (q) => {
    while (i < n && src[i] !== q && src[i] !== '\n') { if (src[i] === '\\') put('_'); if (i < n) put('_'); }
    if (i < n && src[i] === q) put();
  };
  // 템플릿 글자를 읽는다. ${ 를 만나 코드로 돌아가면 '(' 를(식의 시작), 닫는 ` 까지 읽었으면 '`' 를(값의 끝) 돌려준다
  const template = () => {
    while (i < n) {
      const c = src[i];
      if (c === '`') { put(); return '`'; }
      if (c === '$' && src[i + 1] === '{') { put(); put(); depth.push(0); return '('; }
      if (c === '\\') { put('_'); if (i < n && put('_') === '\n') tpl.add(line); continue; }
      if (put('_') === '\n') tpl.add(line);
    }
    return '`';
  };
  // '/' 가 정규식의 시작인가: 앞이 값의 끝(이름 · 수 · 닫는 괄호 · 문자열 · 후위 ++ --)이면 나눗셈이고,
  // 그 밖(연산자 · 여는 괄호 · => · } · return 같은 낱말 · if (…) 같은 조건 괄호의 끝 · 파일 처음)이면 정규식이다.
  // 틀리게 읽으면 정규식 속의 따옴표 · 백틱이 문자열을 열어 뒤 코드를 가린다 — 헷갈리는 자리는 정규식 쪽으로 읽는다(해가 그 줄에서 끝난다).
  const regexHere = () => {
    if (prev === '') return true;
    if (/[\w$]/.test(prev)) return RE_WORD_BEFORE_REGEX.test(src.slice(Math.max(0, at - 11), at + 1));
    if (prev === ')') return afterCond;
    if (']\'"`'.includes(prev)) return false;
    return !((prev === '+' || prev === '-') && src[at - 1] === prev);
  };
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') put(' '); continue; }
    if (c === '/' && d === '*') {
      const from = line;
      put(' '); put(' ');
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) put(' ');
      if (i < n) { put(' '); put(' '); }
      if (line > from) blocks.push([from, line]);
      continue;
    }
    if (c === '"' || c === "'") { put(); quoted(c); prev = c; continue; }
    if (c === '`') { put(); prev = template(); continue; }
    if (c === '{' && depth.length) depth[depth.length - 1]++;
    if (c === '}' && depth.length) {
      if (depth[depth.length - 1] === 0) { depth.pop(); put(); prev = template(); continue; }
      depth[depth.length - 1]--;
    }
    if (c === '/' && regexHere()) {
      put(); let cls = false;
      while (i < n && src[i] !== '\n' && (cls || src[i] !== '/')) {
        if (src[i] === '\\') put('_'); else if (src[i] === '[') cls = true; else if (src[i] === ']') cls = false;
        if (i < n) put('_');
      }
      if (i < n && src[i] === '/') put();
      prev = ']'; continue;                                 // 정규식 글자도 값의 끝이다(뒤의 '/' 는 나눗셈)
    }
    if (c === '(') cond.push(/[\w$]/.test(prev) && RE_WORD_BEFORE_COND.test(src.slice(Math.max(0, at - 5), at + 1)));
    else if (c === ')') afterCond = cond.pop() === true;
    if (c > ' ') { prev = c; at = i; }
    put();
  }
  return { code: out.join(''), tpl, blocks };
}

// 맨 바깥(괄호 깊이 0)의 글자만 남기고 괄호 안은 빈칸으로 바꾼다(길이와 줄바꿈은 그대로 · 괄호 글자 자신은 남는다). blankCode 를 거친 글에 쓴다.
export function topCode(code) {
  const out = [];
  let depth = 0;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (ch === ')' || ch === ']' || ch === '}') depth = Math.max(0, depth - 1);
    out.push(ch === '\n' || depth === 0 ? ch : ' ');
    if (ch === '(' || ch === '[' || ch === '{') depth++;
  }
  return out.join('');
}

const NAME = '[A-Za-z_$][\\w$]*';
const IMP = new RegExp(`^import (?:\\{ ([^}]+) \\}|\\* as (${NAME})) from '(\\.{1,2}/[^']+\\.js)';\\s*$`);
const EXP_DECL = new RegExp(`^export ((?:async )?function\\*?|const|class) (${NAME})`);
const EXP_LIST = /^export \{ ([^}]+) \};\s*$/;
const RE_KEYWORD = /(?<![.\w$])(?:import|export)\b(?!\s*[(.])/g;
// 맨 바깥 글에서: export const 문장 안의 쉼표(다음 줄이 들여 썼거나 닫는 괄호로 시작하면 같은 문장으로 본다)
const RE_MANY_DECL = /^export const (?:[^;,\n]|\n(?=[ \t)\]}]))*,/gm;
const lineAt = (text, index) => text.slice(0, index).split('\n').length - 1;

// 모듈 하나를 푼다. body = 묶음에 들어갈 줄(주석만 있는 줄 · 빈 줄은 빠지고, import 줄은 null 자리표 — wrapModule 이 채운다).
// code = 주석 · 문자열을 가린 글, top = 그 가운데 맨 바깥 글(lint 가 맨 위 let 을 여기서 찾는다).
export function parseModule(id, raw) {
  const { code, tpl, blocks } = blankCode(raw), L = raw.split('\n'), C = code.split('\n'), top = topCode(code), listed = [];
  const m = { id, layer: id.split('/')[0], raw, code, top, lines: L.length - (raw.endsWith('\n') ? 1 : 0), imports: [], exports: [], errors: [], body: [] };
  const err = (i, msg) => m.errors.push({ line: i + 1, msg });
  for (let i = 0; i < L.length; i++) {
    let x;
    if (tpl.has(i)) {
      if (/^\/\/ (?:----|====) /.test(L[i])) err(i, '템플릿 글자 속 줄이 묶음의 표지(「// ---- 경로」 · 「// ==== 」) 꼴로 시작한다 — 묶음에서 모듈 덩이를 떼는 쪽이 헷갈린다');
      m.body.push(L[i]); continue;
    }
    if (/^\s*import\b/.test(C[i]) && !/^\s*import\s*[(.]/.test(C[i])) {
      if ((x = IMP.exec(L[i]))) {
        const names = x[1] ? x[1].split(',').map((s) => s.trim().split(/\s+as\s+/)) : null;
        m.imports.push({ line: i + 1, spec: x[3], target: posix.normalize(posix.join(posix.dirname(id), x[3])), ns: x[2] || null, names });
        m.body.push(null);
      } else err(i, "import 는 맨 앞 칸에서 한 줄로, 두 꼴만: import { a, b as c } from './x.js'; · import * as X from './x.js';");
    } else if (/^\s*export\b/.test(C[i])) {
      if ((x = EXP_DECL.exec(L[i]))) { m.exports.push(x[2]); m.body.push(L[i].slice(7)); }
      else if ((x = EXP_LIST.exec(L[i])) && !/\bas\b/.test(x[1])) for (const s of x[1].split(',')) { m.exports.push(s.trim()); listed.push([i, s.trim()]); }
      else err(i, 'export 는 맨 앞 칸에서 두 꼴만: export const|function|class 이름 · export { a, b }; (default · let · 다시 내보내기 금지)');
    } else if (C[i].trim() !== '') m.body.push(L[i]);
    for (const k of C[i].matchAll(RE_KEYWORD)) if (C[i].slice(0, k.index).trim() !== '') err(i, 'import · export 는 줄 맨 앞 칸에서만 시작한다(한 줄에 하나) — 줄 가운데의 것은 묶음에 그대로 남는다');
  }
  for (const [a, b] of blocks) if (C[a].trim() !== '' || C[b].trim() !== '') err(a, '여러 줄 주석(/* … */)은 주석만 있는 줄에서 열고 닫는다 — 묶을 때 주석만 있는 줄이 빠져 코드 줄에 걸친 주석이 깨진다');
  for (const x of top.matchAll(RE_MANY_DECL)) err(lineAt(top, x.index), 'export const 는 이름 하나만 — export const a = 1, b = 2 는 묶음이 a 만 내보낸다');
  for (const [i, name] of listed) {
    const decl = new RegExp('(?<![.\\w$])(?:let|var)\\s(?:[^;\\n]*,)?\\s*' + name.replace(/\$/g, '\\$') + '\\s*(?:[=,;]|$)', 'm');
    if (decl.test(top)) err(i, `export { ${name} } — let · var 는 내보낼 수 없다(묶음은 그때의 값 사본을 내보내 ESM 의 살아 있는 묶임과 달라진다)`);
  }
  for (const x of code.matchAll(/\bimport\s*(\(|\.\s*meta\b)/g)) err(lineAt(code, x.index), '동적 import · import.meta 는 쓸 수 없다');
  for (const x of code.matchAll(/^(?:await\b|(?:const|let|var)\s[^=\n]*=\s*await\b)/gm)) err(lineAt(code, x.index), '최상위 await 는 쓸 수 없다');
  return m;
}

// 모듈 하나 → 등록부(__m)에 잇는 함수 한 덩이(묶음에 들어가는 꼴 그대로)
export function wrapModule(m) {
  let k = 0;
  const body = m.body.map((line) => {
    if (line !== null) return line;
    const im = m.imports[k++], ref = `__m[${JSON.stringify(im.target)}]`;
    return im.ns ? `const ${im.ns} = ${ref};` : `const { ${im.names.map(([a, b]) => (b ? `${a}: ${b}` : a)).join(', ')} } = ${ref};`;
  });
  return `// ---- ${m.id}\n__m[${JSON.stringify(m.id)}] = (function () {\n${body.join('\n')}\nreturn Object.freeze({ ${m.exports.join(', ')} });\n})();`;
}

// src 폴더를 통째로 싣는다 → { mods(id → 모듈), order(위상 순서 — 의존하는 것이 먼저), errors[{ file, line, rule, msg }] }
export function loadTree(srcDir) {
  const mods = new Map(), errors = [], order = [], mark = new Map();
  const bad = (file, line, rule, msg) => errors.push({ file, line, rule, msg });
  for (const rel of walk(srcDir)) {
    if (!rel.endsWith('.js')) { bad(rel, 0, 'syntax', 'src 에는 .js 모듈만 둔다'); continue; }
    const m = parseModule(rel, readFileSync(join(srcDir, rel), 'utf8'));
    mods.set(rel, m);
    for (const e of m.errors) bad(rel, e.line, 'syntax', e.msg);
    // 마지막 그물: 묶음에 들어갈 꼴을 컴파일만 해 본다(실행하지 않는다) — 위 규칙을 빠져나간 꼴이 묶음을 문법 오류로 만들면 여기서 걸린다
    if (!m.errors.length) try { new vm.Script(`(function () {\n'use strict';\nconst __m = {};\n${wrapModule(m)}\n})`); } catch (e) { bad(rel, 0, 'syntax', '묶은 꼴이 문법 오류다(허용 밖 꼴일 수 있다): ' + e.message); }
    if (!rel.includes('/') || !LAYERS.includes(m.layer)) bad(rel, 0, 'layer', '층 폴더(' + LAYERS.join(' · ') + ') 밖의 파일');
  }
  for (const m of mods.values()) for (const im of m.imports) {
    const dep = mods.get(im.target);
    if (!dep) { bad(m.id, im.line, 'resolve', '없는 모듈: ' + im.spec); continue; }
    for (const [name] of im.names || []) if (!dep.exports.includes(name)) bad(m.id, im.line, 'resolve', `${im.target} 는 ${name} 을(를) 내보내지 않는다`);
    if (!(MAY_IMPORT[m.layer] || []).includes(dep.layer)) bad(m.id, im.line, 'layer', `${m.layer} 는 ${dep.layer} 를 import 할 수 없다(${im.spec})`);
  }
  const visit = (id, stack) => {
    if (mark.get(id) === 2) return;
    if (mark.get(id) === 1) { bad(id, 0, 'cycle', '순환 import: ' + [...stack.slice(stack.indexOf(id)), id].join(' → ')); return; }
    mark.set(id, 1);
    for (const im of mods.get(id).imports) if (mods.has(im.target)) visit(im.target, [...stack, id]);
    mark.set(id, 2); order.push(id);
  };
  // 배포판에 들어가는 모듈부터 돈다 — 배포판의 모듈 순서(바이트 · 빌드 지문)가 dev · bot 모듈에 좌우되지 않게
  const ids = [...mods.keys()].sort(), devOnly = (id) => DEV_ONLY.includes(mods.get(id).layer);
  for (const id of [...ids.filter((id) => !devOnly(id)), ...ids.filter(devOnly)]) visit(id, []);
  return { mods, order, errors };
}
