#!/usr/bin/env node
// 주는 것: dist/fogisle.dev.html(개발판 = 배포판 + src/dev + src/bot) · dist/fogisle.html(배포판). 같은 원본 → 같은 바이트(시각 · 기계 이름을 넣지 않는다).
//   node tools/build.mjs [--out <폴더>]      두 판을 쓴다(임시 이름으로 쓴 뒤 rename — 동시에 돌려도 반쯤 쓴 파일이 안 보인다)
//   node tools/build.mjs --check [경로]      게시된 파일(기본: web/games/embed/fogisle.html)이 지금 원본의 배포판과 같은지 — 읽기만 한다
//   node tools/build.mjs --publish <경로>    배포판을 그 경로에 복사한다. 게시는 PM 이 정한 때에만 하므로 기본 경로가 없다(인자가 없으면 거절)
//   그 밖의 인자(모르는 깃발 · 남는 낱말)는 종료 코드 2 로 거절한다 — 오타가 조용히 dist 에만 묶고 끝나지 않게.
// 받는 것: src/**(모듈) · shell/{head.html,body.html,style.css}(있으면) · vendor/three-r160.min.js. Node 기본 기능만 쓴다.
// 묶는 법(tdd §3-2): 모듈을 위상 순서로 함수 하나씩에 싸서 등록부(__m)에 잇는다. 주석만 있는 줄과 빈 줄만 지우고 이름은 줄이지 않는다
// (모듈마다 「// ---- 경로」 표지). shared/ 는 따로 <script id="fg-shared"> 한 덩이 — 그 글만으로 돌 수 있어 워커 · Node 가 같은 코드를 쓴다.
// 그 덩이는 globalThis.__fgShared(얼린 등록부 — 열쇠는 'shared/dmath.js' 같은 모듈 경로)를 남기고, 나머지(<script id="fg-main">)의 등록부는 밖에서 안 보인다.
// 들머리는 따로 없다: src 의 모든 모듈이 묶이고(개발판만 dev · bot 포함) 의존하는 것부터 차례로 실행된다. 다 올린 뒤에
// app/main.js 가 boot 를 내보내면 그것을 한 번 부른다(「// ==== boot」 뒤) — dev 모듈이 먼저 손잡이를 걸어 둘 수 있다.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTree, wrapModule, DEV_ONLY } from './lib/modules.mjs';

export const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const REPO = resolve(SRC, '..', '..');
export const PUBLISHED = join(REPO, 'web', 'games', 'embed', 'fogisle.html');
export const FILES = { dev: 'fogisle.dev.html', release: 'fogisle.html' };
const ENTRY = 'app/main.js';
export const sha256 = (data) => createHash('sha256').update(data).digest('hex');

function chunk(open, blocks, close) { return `(function (G) {\n'use strict';\n${open}\n${blocks.join('\n')}\n// ==== ${close}\n})(globalThis);`; }

// 원본 → { files: { 파일 이름: HTML }, info: { 판: { build, modules } } } — 디스크에는 쓰지 않는다
export function buildAll(root = SRC) {
  const tree = loadTree(join(root, 'src'));
  if (tree.errors.length) throw new Error('묶을 수 없다(lint 를 먼저 본다):\n' + tree.errors.map((e) => `  src/${e.file}:${e.line} [${e.rule}] ${e.msg}`).join('\n'));
  const text = (...p) => (existsSync(join(root, ...p)) ? readFileSync(join(root, ...p), 'utf8').trim() : '');
  const three = readFileSync(join(root, 'vendor', 'three-r160.min.js'), 'utf8');
  if (!readFileSync(join(root, 'vendor', 'README'), 'utf8').includes(sha256(three))) throw new Error('vendor/three-r160.min.js 의 sha256 이 vendor/README 와 다르다');
  const head = text('shell', 'head.html'), body = text('shell', 'body.html'), css = text('shell', 'style.css');
  const layer = (id) => tree.mods.get(id).layer;
  const sharedIds = tree.order.filter((id) => layer(id) === 'shared');
  const sharedJs = chunk('const __m = Object.create(null);', sharedIds.map((id) => wrapModule(tree.mods.get(id))), 'export\nG.__fgShared = Object.freeze(__m);');
  const entry = tree.mods.get(ENTRY), boot = entry && entry.exports.includes('boot') ? `boot\n__m[${JSON.stringify(ENTRY)}].boot();` : 'boot (app/main.js 의 boot 가 아직 없다)';
  const files = {}, info = {};
  for (const mode of ['dev', 'release']) {
    const mainIds = tree.order.filter((id) => layer(id) !== 'shared' && (mode === 'dev' || !DEV_ONLY.includes(layer(id))));
    const mainJs = chunk('const __m = Object.create(G.__fgShared);', mainIds.map((id) => wrapModule(tree.mods.get(id))), boot);
    for (const [name, js] of [['fg-shared', sharedJs], ['fg-main', mainJs], ['fg-three', three]]) {
      if (/<\/script|<!--/i.test(js)) throw new Error(`${name} 덩이에 </script 나 <!-- 가 들어 있다 — HTML 안에 넣을 수 없다`);
    }
    const modules = [...sharedIds, ...mainIds];
    const build = sha256(JSON.stringify([mode, sha256(three), head, body, css, sharedJs, mainJs])).slice(0, 12);   // 묶인 내용 전체의 지문(도구가 바뀌어 묶음이 달라져도 바뀐다)
    files[FILES[mode]] = [
      '<!doctype html>', `<html lang="ko" data-fg-mode="${mode}" data-fg-build="${build}">`, '<head>', '<meta charset="utf-8">',
      ...(head ? [head] : []), ...(css ? [`<style>\n${css}\n</style>`] : []), '</head>', '<body>', ...(body ? [body] : []),
      `<script id="fg-three">\n${three}</script>`, `<script id="fg-shared">\n${sharedJs}\n</script>`, `<script id="fg-main">\n${mainJs}\n</script>`,
      '</body>', '</html>', '',
    ].join('\n');
    info[mode] = { build, modules };
  }
  return { files, info };
}

export function writeAtomic(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, data);
  renameSync(tmp, file);
}

const FLAGS = ['--out', '--check', '--publish'];
const usage = (msg) => Object.assign(new Error(msg), { code: 2 });

// 인자 → { '--out': 경로 | true, … }. 깃발 뒤의 낱말 하나가 그 깃발의 경로다(없으면 true)
function parseArgs(argv) {
  const opt = {};
  for (let i = 0; i < argv.length; i++) {
    if (!FLAGS.includes(argv[i])) throw usage(`모르는 인자: ${argv[i]} — 쓸 수 있는 것은 --out <폴더> · --check [경로] · --publish <경로>`);
    opt[argv[i]] = argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? resolve(argv[++i]) : true;
  }
  return opt;
}

function main(argv) {
  const sum = { ok: true, cmd: 'build' };
  try {
    const opt = parseArgs(argv), check = opt['--check'], publish = opt['--publish'];
    const { files, info } = buildAll(), release = files[FILES.release];
    if (check) {
      const file = check === true ? PUBLISHED : check, has = existsSync(file), text = has ? readFileSync(file, 'utf8') : '';
      const made = /^<html lang="ko" data-fg-mode="(\w+)" data-fg-build="(\w+)">$/m.exec(text.slice(0, 200));
      Object.assign(sum, { cmd: 'build --check', published: file, same: has && text === release, build: info.release.build, publishedBuild: made ? made[2] : null });
      sum.ok = sum.same;
      console.log(sum.same ? '게시 파일이 지금 원본의 배포판과 같다' : !has ? '게시 파일이 없다' : made ? '게시 파일이 낡았다(원본이 바뀌었다)' : '게시 파일은 이 도구가 만든 것이 아니다(옛 구현)');
    } else if (publish === true) {
      throw usage('--publish 에는 대상 경로를 준다. 게시(web/games/embed/fogisle.html 바꾸기)는 PM 이 정한 때에만 한다');
    } else {
      const out = opt['--out'] || join(SRC, 'dist');
      if (out === true) throw usage('--out 에는 폴더 경로를 준다');
      sum.out = out; sum.files = {};
      for (const mode of ['dev', 'release']) {
        const name = FILES[mode], data = Buffer.from(files[name], 'utf8');
        writeAtomic(join(out, name), data);
        sum.files[name] = { bytes: data.length, sha256: sha256(data), build: info[mode].build, modules: info[mode].modules.length };
        console.log(`${name}  ${data.length} 바이트  모듈 ${info[mode].modules.length}  sha256 ${sum.files[name].sha256.slice(0, 16)}…`);
      }
      if (publish) { writeAtomic(publish, Buffer.from(release, 'utf8')); sum.published = publish; console.log('게시: ' + publish); }
    }
  } catch (e) {
    sum.ok = false; sum.error = e.message; sum.code = e.code === 2 ? 2 : 1;
    console.error(e.message);
  }
  console.log(JSON.stringify(sum));
  process.exit(sum.ok ? 0 : sum.code || 1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
