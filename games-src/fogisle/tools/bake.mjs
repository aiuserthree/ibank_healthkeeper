#!/usr/bin/env node
// 주는 것: 굽기 도구 — 레시피를 검사하고 Node 에서 「생성 → 굽기 → 검증 8종」을 돌려, 구운 것을 얹은 지도 그림(PNG)을 뽑는다. 종료 코드 0 = 통과, 마지막 줄 JSON.
//   node tools/bake.mjs <세계> [--preview <png>] [--scale <m 당 화소>] [--update-golden]
//   <세계> = src/data/<이름>(slice1 …) · broken:<이름>(tests/broken-recipes — 일부러 망가뜨린 레시피: 검증에 걸려 종료 코드 1 이어야 맞다) ·
//     test:<이름>[:수,수,…](tests/worlds 의 시험 세계 — recipe 를 내보내면 그 레시피를, world(…수) 함수를 내보내면 손으로 지은 그 세계를 굽는다.
//     예: test:big · test:door · test:door:1,1.2,0,30 = 문 1.0m · 계단 1.2m · 벽 그대로 · 건물을 30° 돌림 · test:shelf)
//   통과 = 검증 8종에 걸린 것이 없고 · 굽기 해시가 기준(tests/golden/bake.json)과 같고 · 굽기 시간과 엄폐 점 수(시작 자리의 닿는 무리 안)가 예산(tune 의 bake.budget) 안.
//   해시는 여기서 센다(hashWorld · hashBake) — 굽기 자체는 세지 않는다.
//   JSON: 해시 둘(world · bake) · 생성 · 굽기 시간(bakeMs = 처음 한 번 — 예산과 견주는 값 · bakeMsWarm = 데워진 뒤 두 번 가운데 빠른 쪽) · 단계별 시간 · 수 보고 ·
//   checks(검증 1 ~ 8 마다 걸린 수) · problems(걸린 것 — 종류마다 처음 몇 개) · notes(실패는 아닌 알림 — 스위치 묶음이 겹치는 꼭짓점 수 …).
// 받는 것: shared/gen · shared/bake(굽기 · 검증) · tools/preview.mjs(지도 그림) · tune. Node 기본 기능만.
// 깨진 레시피는 레시피 검사에 걸려도 검사 없이(genRaw) 끝까지 만들어 굽고 검증한다 — 검사가 놓친 것을 굽기 쪽이 잡는지 보려는 것이다. 만들다 터지면 거기까지만 적는다.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { genRaw, hashWorld } from '../src/shared/gen/world.js';
import { bakeSteps, hashBake } from '../src/shared/bake/index.js';
import { verify } from '../src/shared/bake/verify.js';
import { BAKE } from '../src/shared/tune/bake.js';
import { drawMap, png } from './preview.mjs';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..'), GOLDEN = join(SRC, 'tests', 'golden', 'bake.json');
const KINDS = { broken: ['tests', 'broken-recipes', '.mjs'], test: ['tests', 'worlds', '.mjs'] };

function run(it, marks) {
  let stage = 'start', t0 = performance.now(), s = it.next();
  while (!s.done) {
    if (typeof s.value === 'string' && marks) { const now = performance.now(); marks[stage] = Math.round((now - t0) * 10) / 10; stage = s.value; t0 = now; }
    s = it.next();
  }
  return s.value;
}

async function main(argv) {
  const sum = { ok: false, cmd: 'bake ' + argv.join(' ') }, flag = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
  try {
    const name = argv.find((a, i) => !a.startsWith('--') && !(argv[i - 1] || '').match(/^--(preview|scale)$/)), scale = Number(flag('--scale', 8)), [kind, rest, nums] = String(name).includes(':') ? String(name).split(':') : ['', name];
    const file = kind ? (KINDS[kind] ? join(SRC, KINDS[kind][0], KINDS[kind][1], rest + KINDS[kind][2]) : '') : join(SRC, 'src', 'data', String(name), 'recipe.js');
    if (!name || !file || !existsSync(file) || !(scale >= 1)) throw Object.assign(new Error('쓰는 법: node tools/bake.mjs <세계 | broken:이름 | test:이름> [--preview <png>] [--scale <m 당 화소>] [--update-golden]'), { code: 2 });
    const mod = await import(pathToFileURL(file).href), recipe = mod.recipe || null, golden = existsSync(GOLDEN) ? JSON.parse(readFileSync(GOLDEN, 'utf8')) : {};
    Object.assign(sum, { world: name, expect: mod.expect || null });
    if (!recipe && typeof mod.world !== 'function') throw new Error(`${name}: 그 파일은 recipe(레시피)도 world(손으로 지은 세계를 돌려주는 함수)도 내보내지 않는다 — 구울 것이 없다`);
    if (nums && (recipe || nums.split(',').some((v) => v === '' || Number(v) !== Number(v)))) throw new Error(`${name}: 이름 뒤의 수는 world(…) 함수에 넘길 수를 쉼표로 적는다(레시피에는 못 붙인다)`);
    let t0 = performance.now();
    const world = recipe ? run(genRaw(recipe)) : mod.world(...(nums ? nums.split(',').map(Number) : [])), genMs = Math.round((performance.now() - t0) * 10) / 10, stages = {}, warm = [];
    t0 = performance.now();
    const { solid, ...baked } = run(bakeSteps(world), stages), bakeMs = Math.round((performance.now() - t0) * 10) / 10;
    for (let i = 0; i < 2; i++) { t0 = performance.now(); run(bakeSteps(world)); warm.push(Math.round((performance.now() - t0) * 10) / 10); }
    const hash = { world: hashWorld(world), bake: hashBake(baked) };
    t0 = performance.now();
    const v = verify(world, baked, recipe), verifyMs = Math.round((performance.now() - t0) * 10) / 10, checks = {};
    for (let c = 1; c <= 8; c++) checks[c] = 0;
    for (const p of v.problems) checks[p.check] += 1;
    if (argv.includes('--update-golden') && !kind) {
      golden[name] = hash.bake;
      writeFileSync(GOLDEN, JSON.stringify(Object.fromEntries(Object.keys(golden).sort().map((k) => [k, golden[k]])), null, 2) + '\n');
      console.log('굽기 기준 해시를 새로 적었다: ' + name);
    }
    const same = kind ? 'n/a' : golden[name] === hash.bake ? 'same' : golden[name] ? 'differs' : 'none', over = [];
    if (!kind && bakeMs > BAKE.budget.bakeMs) over.push(`굽기 ${bakeMs}ms > ${BAKE.budget.bakeMs}ms`);
    if (!kind && baked.stats.coverHome < BAKE.budget.coverMin) over.push(`엄폐 점(시작 자리의 닿는 무리 안) ${baked.stats.coverHome} < ${BAKE.budget.coverMin}`);
    Object.assign(sum, { hash, golden: same, genMs, bakeMs, bakeMsWarm: Math.min(...warm), verifyMs, stages, stats: baked.stats, checks, counts: v.counts, problems: v.problems, notes: v.notes, over });
    const out = flag('--preview', null);
    if (out) {
      const img = drawMap(world, 'top', scale, { baked, solid, problems: v.problems });
      mkdirSync(dirname(resolve(out)), { recursive: true }); writeFileSync(resolve(out), png(img.w, img.h, img.rgb));
      Object.assign(sum, { preview: resolve(out), px: [img.w, img.h] });
    }
    for (const p of v.problems) console.log(`검증 ${p.check} [${p.code}] ${p.msg}${p.at ? ' @ ' + p.at.join(', ') : ''}`);
    for (const o of over) console.log('예산 초과 — ' + o);
    const st = baked.stats, failed = Object.keys(checks).filter((c) => checks[c] > 0);
    if (v.notes.switchOverlap) console.log(`알림 — 스위치 묶음 둘 이상이 세게 닿는 꼭짓점 ${v.notes.switchOverlap}개(본 ${v.notes.switchChecked}개 가운데): 그 꼭짓점에는 큰 묶음 하나만 구워진다 — 등불을 떼어 놓으면 없어진다`);
    console.log(`${name}: 굽기 해시 ${hash.bake}(기준과 ${same}) · 생성 ${genMs}ms · 굽기 ${bakeMs}ms(데워진 뒤 ${Math.min(...warm)}ms) · 검증 ${verifyMs}ms · 걷는 칸 ${st.walk} · 무리 ${st.groups} · 고리 ${st.links}(넘기 ${st.vaults} · 오르기 ${st.climbs} · 떨어지기 ${st.drops}) · 엄폐 점 ${st.cover}(시작 자리의 닿는 무리 안 ${st.coverHome}) · 빛 격자 탐침 ${st.probes} · 구운 꼭짓점 ${st.litVerts}`);
    console.log(failed.length ? `검증 8종 가운데 걸린 것: ${failed.join(', ')}` : '검증 8종 통과');
    sum.failed = failed.map(Number);
    sum.ok = failed.length === 0 && over.length === 0 && (kind !== '' || same === 'same');
    if (!sum.ok && !failed.length && !over.length) console.log('굽기 해시가 기준과 다르다 — 바뀌는 것이 맞으면 --update-golden 으로 갱신하고 넘겨주기에 까닭을 적는다');
  } catch (e) { sum.error = String(e.message || e).split('\n')[0]; sum.code = e.code === 2 ? 2 : 1; console.log(sum.error); }
  console.log(JSON.stringify(sum));
  process.exit(sum.ok ? 0 : sum.code || 1);
}

main(process.argv.slice(2));
