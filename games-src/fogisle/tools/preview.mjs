#!/usr/bin/env node
// 주는 것: 세계 미리보기 — 레시피를 검사하고 Node 에서 생성해 지도 그림(PNG)을 뽑는다. 에이전트는 글자 격자가 아니라 이 그림을 보고 맵을 고친다.
//   node tools/preview.mjs <세계> [--out <png>] [--view top|south] [--scale <m 당 화소>] [--update-golden]
//   + drawMap(world, view, scale, over) · png(w, h, rgb) 를 내보낸다 — tools/bake.mjs 가 구운 것(over = { baked, solid, problems })을 얹은 지도를 그릴 때 쓴다:
//     걷는 칸(시작 자리의 닿는 무리 = 풀빛 · 다른 무리 = 푸른빛 · 문 밑 = 흰빛) · 자동 고리(넘기 하늘색 · 오르기 노랑 · 떨어지기 붉은 점) · 엄폐 점(낮은 = 자주 · 높은 = 보라) · 검증에 걸린 자리(붉은 고리)
//   top = 위에서 본 지도(북쪽이 위 · 표식을 얹는다) · south = 바다 쪽에서 본 입면(실루엣 확인용). 종료 코드 0 = 통과, 마지막 줄 JSON
//   (해시 · 생성 시간(세 번의 중앙값) · 삼각형 · 꼭짓점 · 인스턴스 수 · 기준 해시와 같은지). --update-golden 은 tests/golden/world.json 을 새로 적는다.
// 받는 것: src/data/<세계>/recipe.js · shared/gen · tune/world(예산). Node 기본 기능만(PNG 는 zlib 으로 직접 쓴다). 굽기 · 검증 8종은 tools/bake.mjs.
// 지도의 표식: 초록 = 시작 자리(선 = 보는 쪽) · 파랑 + 숫자 = 책갈피(차례대로 1 …) · 주황 + 숫자 = 과녁 · 노랑 고리 = 등불(스위치 묶음은 흰 테, 깨지는 등불은 붉은 테)
//   · 자주 = 그 밖의 표식 · 옅은 줄 = 32m 칸. 땅 색: 자갈 = 회갈색 · 풀 = 풀빛 · 바위 = 회색, 물에 잠긴 곳은 깊을수록 푸르다.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateSync, crc32 } from 'node:zlib';
import { generate, hashWorld } from '../src/shared/gen/world.js';
import { checkRecipe } from '../src/shared/gen/recipe.js';
import { xf } from '../src/shared/geom/shapes.js';
import { WORLD } from '../src/shared/tune/world.js';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..'), GOLDEN = join(SRC, 'tests', 'golden', 'world.json');
const MAT = { ground: [150, 150, 146], rock: [128, 130, 132], wood: [150, 118, 84], stone: [150, 150, 150], iron: [70, 76, 80], glow: [255, 214, 130], glass: [200, 170, 110], paint: [230, 120, 50] };
const LINK = [[90, 220, 240], [250, 220, 60], [230, 70, 50]];
const SUN = [-0.45, 0.72, 0.53];
// 숫자 0 ~ 9 의 3 × 5 점 글꼴(표식 옆의 번호)
const DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];

export function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h), part = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]), out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  for (let y = 0; y < h; y++) Buffer.from(rgb.buffer, y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1);
  const head = Buffer.alloc(13);
  head.writeUInt32BE(w, 0); head.writeUInt32BE(h, 4); head.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), part('IHDR', head), part('IDAT', deflateSync(raw)), part('IEND', Buffer.alloc(0))]);
}

// 직교 투영 그림판: project(x, y, z) → [화소 x, 화소 y, 깊이(클수록 앞)]
function canvas(w, h, project) {
  const rgb = new Uint8Array(w * h * 3).fill(205), depth = new Float32Array(w * h).fill(-1e9), height = new Float32Array(w * h).fill(-1e9);
  const tri = (P, a, b, c, color) => {
    const A = project(P[a], P[a + 1], P[a + 2]), B = project(P[b], P[b + 1], P[b + 2]), C = project(P[c], P[c + 1], P[c + 2]);
    const area = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
    if (area === 0) return;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, nl = Math.hypot(nx, ny, nz) || 1;
    const lit = 0.42 + 0.58 * Math.max(0, (nx * SUN[0] + ny * SUN[1] + nz * SUN[2]) / nl);
    const x0 = Math.max(0, Math.floor(Math.min(A[0], B[0], C[0]))), x1 = Math.min(w - 1, Math.ceil(Math.max(A[0], B[0], C[0])));
    const y0 = Math.max(0, Math.floor(Math.min(A[1], B[1], C[1]))), y1 = Math.min(h - 1, Math.ceil(Math.max(A[1], B[1], C[1])));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5, u = ((B[0] - px) * (C[1] - py) - (B[1] - py) * (C[0] - px)) / area, v = ((C[0] - px) * (A[1] - py) - (C[1] - py) * (A[0] - px)) / area;
      if (u < 0 || v < 0 || u + v > 1) continue;
      const d = u * A[2] + v * B[2] + (1 - u - v) * C[2], k = y * w + x;
      if (d <= depth[k]) continue;
      depth[k] = d; height[k] = u * P[a + 1] + v * P[b + 1] + (1 - u - v) * P[c + 1];
      for (let ch = 0; ch < 3; ch++) rgb[k * 3 + ch] = Math.min(255, color[ch] * lit);
    }
  };
  const dot = (x, y, r, color, ring = 0) => {
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      const q = i * i + j * j, px = Math.round(x) + i, py = Math.round(y) + j;
      if (q > r * r || (ring && q < (r - ring) * (r - ring)) || px < 0 || py < 0 || px >= w || py >= h) continue;
      rgb.set(color, (py * w + px) * 3);
    }
  };
  const digit = (x, y, n, color) => [...DIGITS[n % 10]].forEach((bit, i) => { if (bit === '1') for (let s = 0; s < 4; s++) dot(x + (i % 3) * 2 + (s & 1), y + Math.floor(i / 3) * 2 + (s >> 1), 0, color); });
  return { rgb, height, tri, dot, digit };
}

export function drawMap(world, view, scale, over) {
  const [x0, z0] = world.origin, [sx, sz] = world.size, top = view === 'top';
  let yMax = 0;
  for (const b of world.batches) for (let i = 1; i < b.pos.length; i += 3) yMax = Math.max(yMax, b.pos[i]);
  const w = Math.round(sx * scale), h = Math.round((top ? sz : yMax + 10) * scale);
  const project = top ? (x, y, z) => [(x - x0) * scale, (z - z0) * scale, y] : (x, y, z) => [(x - x0) * scale, (yMax + 4 - y) * scale, z];
  const cv = canvas(w, h, project);
  const mesh = (part, pos) => {
    const base = MAT[part.mat] || part.tint.map((c) => 60 + c * 180);
    for (let t = 0; t < part.idx.length; t += 3) {
      const v = part.idx[t], shade = part.col[v * 4 + 3] / 255, lay = part.lay;
      const tone = lay ? [lerp3(base[0], 142, 96, lay, v), lerp3(base[1], 132, 122, lay, v), lerp3(base[2], 116, 84, lay, v)] : base;
      cv.tri(pos, v * 3, part.idx[t + 1] * 3, part.idx[t + 2] * 3, tone.map((c, ch) => c * shade * part.col[v * 4 + ch] / 255));
    }
  };
  const moved = (part, T) => Float32Array.from(part.pos, (v, i) => { const k = i - i % 3, r = i % 3 * 4; return T[r] * part.pos[k] + T[r + 1] * part.pos[k + 1] + T[r + 2] * part.pos[k + 2] + T[r + 3]; });
  for (const b of world.batches) mesh(b, b.pos);
  for (const g of world.instances) for (let i = 0; i < g.xf.length; i += 8) {
    const [x, y, z, rx, ry, rz, s, tall] = g.xf.subarray(i, i + 8), proto = world.protos[g.proto];
    mesh(proto, moved(proto, xf(x, y, z, rx, ry, rz, s, tall, s)));
  }
  for (const p of world.props) for (const part of p.parts) mesh(part, moved(part, xf(p.at[0], p.at[1], p.at[2], 0, p.yaw, p.lean)));
  if (!top) return { w, h, rgb: cv.rgb };
  for (let k = 0; k < w * h; k++) {
    const deep = Math.min(1, Math.max(0, (world.sea - cv.height[k]) / 3)), gx = (k % w) % (WORLD.cell * scale) === 0 || Math.floor(k / w) % (WORLD.cell * scale) === 0;
    if (cv.height[k] < world.sea) for (let ch = 0; ch < 3; ch++) cv.rgb[k * 3 + ch] = cv.rgb[k * 3 + ch] * (0.75 - 0.45 * deep) + [40, 78, 96][ch] * (0.25 + 0.45 * deep);
    if (gx) for (let ch = 0; ch < 3; ch++) cv.rgb[k * 3 + ch] *= 0.8;
  }
  if (over) overlay(cv, over, world, project, w, h);
  const at = (p) => project(p[0], p[1], p[2]), aim = (p, yaw, color) => { for (let s = 0; s < 3.5 * scale; s++) cv.dot(at(p)[0] - Math.sin(yaw) * s, at(p)[1] - Math.cos(yaw) * s, 0, color); };
  for (const l of world.lights) {
    cv.dot(...at(l.at).slice(0, 2), Math.round(Math.min(l.radius, 9) * scale), [255, 220, 90], 1);
    cv.dot(...at(l.at).slice(0, 2), 4, l.mode === 'on' ? [255, 220, 90] : l.mode === 'switch' ? [255, 255, 255] : [235, 70, 60]); cv.dot(...at(l.at).slice(0, 2), 2, [255, 220, 90]);
  }
  world.marks.targets.forEach((t, i) => { cv.dot(...at(t.at).slice(0, 2), 4, [240, 120, 30]); cv.digit(at(t.at)[0] + 6, at(t.at)[1] - 5, i + 1, [120, 40, 0]); });
  world.marks.stations.forEach((s, i) => { aim(s.at, s.yaw, [30, 80, 220]); cv.dot(...at(s.at).slice(0, 2), 4, [30, 80, 220]); cv.digit(at(s.at)[0] + 6, at(s.at)[1] - 5, i + 1, [10, 30, 140]); });
  for (const p of Object.values(world.marks.points)) cv.dot(...at(p).slice(0, 2), 4, [200, 40, 200]);
  aim(world.marks.spawn.at, world.marks.spawn.yaw, [20, 170, 60]); cv.dot(...at(world.marks.spawn.at).slice(0, 2), 5, [20, 170, 60]);
  return { w, h, rgb: cv.rgb };
}

// 구운 것을 지도에 얹는다: 걷는 칸은 화소를 물들이고(층이 겹치면 위층이 덮는다), 고리 · 엄폐 점 · 걸린 자리는 점과 줄로
function overlay(cv, over, world, project, w, h) {
  const nav = over.baked.nav, L = over.baked.links, C = over.baked.cover, px = (x, z) => project(x, 0, z), home = spanNear(nav, world.marks.spawn.at);
  const tint = (x, y, color, k) => { if (x >= 0 && y >= 0 && x < w && y < h) for (let ch = 0; ch < 3; ch++) cv.rgb[(y * w + x) * 3 + ch] = cv.rgb[(y * w + x) * 3 + ch] * (1 - k) + color[ch] * k; };
  const where = (s) => { const col = nav.col[s], i = col % nav.w; return [nav.x0 + (i + 0.5) * nav.cell, nav.z0 + ((col - i) / nav.w + 0.5) * nav.cell]; };
  for (let s = 0; s < nav.y.length; s++) {
    const [x, z] = where(s), a = px(x - nav.cell / 2, z - nav.cell / 2), b = px(x + nav.cell / 2, z + nav.cell / 2);
    const color = nav.door[s] ? [255, 255, 255] : home >= 0 && nav.group[s] === nav.group[home] ? [60, 200, 90] : [70, 120, 230];
    for (let y = Math.round(a[1]); y < Math.round(b[1]); y++) for (let x2 = Math.round(a[0]); x2 < Math.round(b[0]); x2++) tint(x2, y, color, nav.door[s] ? 0.8 : 0.38);
  }
  for (let k = 0; k < L.kind.length; k++) {
    const a = px(...where(L.from[k])), b = px(...where(L.to[k])), n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1])));
    if (L.kind[k] === 2) cv.dot(a[0], a[1], 0, LINK[2]); else for (let i = 0; i <= n; i++) cv.dot(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n, 0, LINK[L.kind[k]]);
  }
  for (let k = 0; k < C.n; k++) { const a = px(C.pos[k * 3], C.pos[k * 3 + 2]); cv.dot(a[0], a[1], 2, C.high[k] ? [130, 50, 200] : [230, 60, 200]); cv.dot(a[0], a[1], 0, [255, 255, 255]); }
  for (const p of over.problems || []) if (p.at) { const a = px(p.at[0], p.at[2]); cv.dot(a[0], a[1], 9, [255, 30, 30], 2); }
}

// 표식에 가장 가까운 걷는 칸(지도 그림용 — 무리의 색을 고를 때만 쓴다)
function spanNear(nav, at) {
  let best = -1, cost = Infinity;
  const ci = Math.floor((at[0] - nav.x0) / nav.cell), cj = Math.floor((at[2] - nav.z0) / nav.cell);
  for (let j = Math.max(0, cj - 3); j <= Math.min(nav.d - 1, cj + 3); j++) for (let i = Math.max(0, ci - 3); i <= Math.min(nav.w - 1, ci + 3); i++) {
    for (let s = nav.start[j * nav.w + i]; s < nav.start[j * nav.w + i + 1]; s++) {
      const c = (i - ci) * (i - ci) + (j - cj) * (j - cj) + Math.abs(nav.y0 + nav.y[s] * nav.unit - at[1]);
      if (c < cost) { cost = c; best = s; }
    }
  }
  return best;
}

// 지형 겹(자갈 · 풀)으로 바탕색을 섞는다
function lerp3(base, pebble, turf, lay, v) { const p = lay[v * 4] / 255, t = lay[v * 4 + 1] / 255; return (base * (1 - p) + pebble * p) * (1 - t) + turf * t; }

async function main(argv) {
  const sum = { ok: false, cmd: 'preview ' + argv.join(' ') }, flag = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
  try {
    const name = argv.find((a, i) => !a.startsWith('--') && !(argv[i - 1] || '').match(/^--(out|view|scale)$/)), view = flag('--view', 'top'), scale = Number(flag('--scale', 8));
    const file = join(SRC, 'src', 'data', String(name), 'recipe.js');
    const usable = name && existsSync(file) && ['top', 'south'].includes(view) && scale >= 1;
    if (!usable) throw Object.assign(new Error('쓰는 법: node tools/preview.mjs <세계> [--out <png>] [--view top|south] [--scale <m 당 화소>] [--update-golden]'), { code: 2 });
    const { recipe } = await import(pathToFileURL(file).href), problems = checkRecipe(recipe);
    Object.assign(sum, { world: name, problems });
    for (const p of problems) console.log(`레시피 문제 [${p.code}] ${p.msg}`);
    if (problems.length) throw new Error('레시피 검사 실패 ' + problems.length + '건');
    const times = [];
    let world = null;
    for (let i = 0; i < 3; i++) { const t0 = performance.now(); world = generate(recipe); times.push(performance.now() - t0); }
    const hash = hashWorld(world), golden = existsSync(GOLDEN) ? JSON.parse(readFileSync(GOLDEN, 'utf8')) : {}, genMs = Math.round(times.sort((a, b) => a - b)[1] * 10) / 10;
    if (argv.includes('--update-golden')) {
      golden[name] = hash;
      writeFileSync(GOLDEN, JSON.stringify(Object.fromEntries(Object.keys(golden).sort().map((k) => [k, golden[k]])), null, 2) + '\n');
      console.log('기준 해시를 새로 적었다: ' + name);
    }
    Object.assign(sum, { hash, golden: golden[name] === hash ? 'same' : golden[name] ? 'differs' : 'none', genMs, stats: world.stats });
    const out = flag('--out', null);
    if (out) {
      const img = drawMap(world, view, scale);
      mkdirSync(dirname(resolve(out)), { recursive: true }); writeFileSync(resolve(out), png(img.w, img.h, img.rgb));
      Object.assign(sum, { out: resolve(out), view, px: [img.w, img.h] });
    }
    const B = WORLD.budget, st = world.stats;
    const over = [['genMs', genMs], ['tris', st.drawTris], ['verts', st.verts], ['instances', st.instances], ['collideTris', st.collideTris]].filter(([k, v]) => v > B[k]);
    for (const [k, v] of over) console.log(`예산 초과 ${k}: ${v} > ${B[k]}`);
    console.log(`${name}: 해시 ${hash}(기준과 ${sum.golden}) · 생성 ${genMs}ms · 삼각형 ${st.drawTris}(정적 ${st.tris}) · 꼭짓점 ${st.verts} · 인스턴스 ${st.instances} · 충돌 삼각형 ${st.collideTris}`);
    sum.over = over.map(([k]) => k); sum.ok = over.length === 0;
  } catch (e) { sum.error = String(e.message || e).split('\n')[0]; sum.code = e.code === 2 ? 2 : 1; console.log(sum.error); }
  console.log(JSON.stringify(sum));
  process.exit(sum.ok ? 0 : sum.code || 1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
