// 주는 것: 구운 빛 — lightSetup(세계 → 굽기에 쓸 등불 · 해 · 광선 방향) · vertexLightSteps(꼭짓점 빛 v1 — 묶음마다 Uint8 ×7 · function*) · probeLight(한 점의 빛 5바이트) ·
//   lightGrid(빛 격자 2m) · lightAt(빛 격자에서 한 자리의 5바이트 읽기 — 움직이는 것의 조명 · 은신의 밝기) · pointLightSteps(인스턴스 · 과녁 조각의 빛 5바이트 · function*) · lampBytes(늘 켜진 등불의 RGB 만) · switchSums(스위치 묶음마다의 세기 —
//   굽기와 검증이 같이 쓴다) + 형식의 상수 VLIGHT(7) · PLIGHT(5) · NO_GROUP(255).
// 받는 것: bvh(광선) · nav(빛 격자의 높이) · noise · dmath · tune/bake.light · tune/world.lit(스위치 묶음 수). 재질 · 하늘은 모른다(F2a) — 여기서 굽는 것은 「얼마나 가려졌는가」와 등불의 색뿐이다.
// 꼭짓점 빛 v1(꼭짓점마다 7바이트 — 재질이 읽는 법):
//   [0] 하늘 열림: 법선 둘레 반구 광선(rays 개 · 코사인 분포) 가운데 하늘로 빠져나간 비율 × 255(바닥 값 floor). 하늘빛 × 이 값.
//       (광선의 반을 먼저 쏘아 다 열렸거나 다 막혔으면 거기서 정한다 — 섞인 곳에서만 rays 개를 다 쓴다.)
//   [1 · 2 · 3] 늘 켜진 등불(mode 'on')의 빛 RGB: 가려지지 않은 등불마다 색 × (법선·방향) × 거리 감쇠를 더해 √ 로 눌러 담는다 → 빛 = (바이트 / 255)² / lampGain.
//   [4] 해 가림: 해 쪽 한 줄기가 안 막혔으면 255, 막혔으면 0.
//   [5] 스위치 묶음 번호: 그 꼭짓점에 가장 크게 닿는 묶음(0 ~ 7 — 대본 스위치 · 깨지는 등불), 닿는 것이 없으면 NO_GROUP. **섞이면 안 되는 값이다 — 재질은 flat 으로 읽는다.**
//   [6] 그 묶음의 세기(색 없이 — √ 로 눌러 담는다). 재질은 여기에 uSwitch[묶음](묶음의 색 × 켜진 정도)을 곱한다.
//   깜빡이거나 깨지거나 대본으로 켜고 끄는 등불(mode 'switch' · 'break')은 [1 ~ 3] 에 절대 넣지 않는다 — 구운 빛은 고정이라 등을 꺼도 바닥이 계속 밝다.
// 빛 5바이트(방향이 없는 점 — 빛 격자 · 인스턴스 · 과녁 조각): [0] 하늘 열림(위쪽 반구) · [1 ~ 3] 늘 켜진 등불 RGB(법선 대신 probeFacing) · [4] 해 가림.
// 광선은 꼭짓점 번호가 아니라 자리로 흩는다(자리의 해시로 반구 광선 묶음을 법선 둘레로 돌린다) — 지형 이음매처럼 두 묶음이 같은 자리 · 같은 법선의 꼭짓점을 따로 가져도 같은 값이 나온다.
// 빛 격자 grid = { cell · nx · nz · x0 · z0 · start(Uint32, 칸 수 + 1) · y(Float32: 탐침의 높이 — 칸마다 걷는 층 수만큼, 아래부터) · data(Uint8 ×5) }.
//   칸 = 세로 칸 × nx + 가로 칸. 읽는 쪽은 그 칸에서 높이가 가장 가까운 탐침을 고른다. 걷는 칸이 없는 칸에는 그 자리의 가장 높은 면(물이면 수면) 위 탐침 하나.
import { TAU, dsin, dcos } from '../dmath.js';
import { hash3 } from '../geom/noise.js';
import { rayAny, column } from './bvh.js';
import { spanPos } from './nav.js';
import { WORLD } from '../tune/world.js';
import { BAKE } from '../tune/bake.js';

export const VLIGHT = 7;
export const PLIGHT = 5;
export const NO_GROUP = 255;
const TURNS = 32;
const pack = (v) => Math.round(255 * Math.sqrt(Math.min(1, Math.max(0, v))));

export function lightSetup(world) {
  const L = BAKE.light, sun = L.sun[world.sky] || L.sun.dawn, len = Math.sqrt(sun[0] * sun[0] + sun[1] * sun[1] + sun[2] * sun[2]);
  const dirs = new Float64Array(L.rays * 3), turn = new Float64Array(TURNS * 2);
  for (let i = 0; i < L.rays; i++) {
    const u = (i + 0.5) / L.rays, a = i * 2.399963229728653, r = Math.sqrt(u);
    dirs[i * 3] = r * dcos(a); dirs[i * 3 + 1] = Math.sqrt(1 - u); dirs[i * 3 + 2] = r * dsin(a);
  }
  for (let k = 0; k < TURNS; k++) { turn[k * 2] = dcos(TAU * k / TURNS); turn[k * 2 + 1] = dsin(TAU * k / TURNS); }
  return {
    bvh: null, dirs, turn, sun: [sun[0] / len, sun[1] / len, sun[2] / len], far: world.size[0] + world.size[1] + 200, salt: world.seed,
    on: world.lights.filter((l) => l.mode === 'on'), other: world.lights.filter((l) => l.mode !== 'on'), sum: new Float64Array(WORLD.lit.groups),
  };
}

// 등불 l 이 점 o(법선 n — facing 이 0 보다 크면 법선 대신 그 값)에 주는 세기(가려졌거나 닿지 않으면 0)
function lamp(S, l, ox, oy, oz, nx, ny, nz, facing) {
  const L = BAKE.light, dx = l.at[0] - ox, dy = l.at[1] - oy, dz = l.at[2] - oz, d2 = dx * dx + dy * dy + dz * dz;
  if (d2 >= l.radius * l.radius) return 0;
  const d = Math.sqrt(d2) || 1e-9, toward = facing > 0 ? facing : (nx * dx + ny * dy + nz * dz) / d;
  if (toward <= 0 || (d > L.lampSkip && rayAny(S.bvh, ox, oy, oz, dx / d, dy / d, dz / d, d - L.lampSkip))) return 0;
  const fade = 1 - d / l.radius;
  return toward * fade * fade / (1 + L.lampFall * d2);
}

// 늘 켜진 등불(S.on)의 빛을 out[at + 1 · 2 · 3] 에 — 검증이 「늘 켜진 빛」에 다른 등불이 섞였는지 다시 잴 때도 쓴다
export function lampBytes(S, out, at, ox, oy, oz, nx, ny, nz, facing) {
  let r = 0, g = 0, b = 0;
  for (const l of S.on) { const f = lamp(S, l, ox, oy, oz, nx, ny, nz, facing); if (f > 0) { r += l.color[0] * f; g += l.color[1] * f; b += l.color[2] * f; } }
  out[at + 1] = pack(r * BAKE.light.lampGain); out[at + 2] = pack(g * BAKE.light.lampGain); out[at + 3] = pack(b * BAKE.light.lampGain);
}

// 반구 광선: 축 n(길이 1) 둘레, 자리의 해시로 돌려서. 하늘로 빠져나간 비율(0 ~ 1)
function skyOpen(S, ox, oy, oz, nx, ny, nz) {
  const L = BAKE.light, D = S.dirs, k = Math.floor(hash3(Math.round(ox * 1000), Math.round(oy * 1000), Math.round(oz * 1000), S.salt) * TURNS) % TURNS, c = S.turn[k * 2], s = S.turn[k * 2 + 1];
  // 법선에 수직인 두 축(t · b)
  let tx = Math.abs(nx) > 0.9 ? 0 : 1, ty = Math.abs(nx) > 0.9 ? 1 : 0, tz = 0, bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;
  const bl = Math.sqrt(bx * bx + by * by + bz * bz) || 1;
  bx /= bl; by /= bl; bz /= bl; tx = by * nz - bz * ny; ty = bz * nx - bx * nz; tz = bx * ny - by * nx;
  // 광선을 하나 걸러 반만 먼저 쏜다. 그 반이 다 열렸거나 다 막혔으면 나머지도 같다고 본다(트인 땅 · 묻힌 꼭짓점이 대부분이다) — 섞인 곳만 전부 쏜다.
  let open = 0, half = 0;
  for (let pass = 0; pass < 6; pass += 3) {
    for (let i = pass; i < D.length; i += 6) {
      const lx = D[i] * c - D[i + 2] * s, lz = D[i] * s + D[i + 2] * c, dy = ty * lx + ny * D[i + 1] + by * lz;
      if (dy > L.skyDip && !rayAny(S.bvh, ox, oy, oz, tx * lx + nx * D[i + 1] + bx * lz, dy, tz * lx + nz * D[i + 1] + bz * lz, L.skyReach)) open++;
    }
    if (pass === 0) { half = Math.ceil(D.length / 6); if (open === 0) return 0; if (open === half) return 1; }
  }
  return open / (D.length / 3);
}

// 스위치 묶음(늘 켜진 것이 아닌 등불): 묶음마다 세기를 더해 S.sum 에 두고, 가장 큰 묶음의 번호를 돌려준다(동률이면 번호가 작은 쪽 · 닿는 것이 없으면 −1)
export function switchSums(S, ox, oy, oz, nx, ny, nz) {
  let best = -1;
  S.sum.fill(0);
  for (const l of S.other) S.sum[l.group] += lamp(S, l, ox, oy, oz, nx, ny, nz, 0);
  for (let g = 0; g < S.sum.length; g++) if (S.sum[g] > 0 && (best < 0 || S.sum[g] > S.sum[best])) best = g;
  return best;
}

export function* vertexLightSteps(world, S) {
  const L = BAKE.light, out = [], floor = Math.round(L.floor * 255);
  let work = 0;
  for (const b of world.batches) {
    const n = b.pos.length / 3, data = new Uint8Array(n * VLIGHT);
    for (let v = 0; v < n; v++) {
      const nx = b.nor[v * 3], ny = b.nor[v * 3 + 1], nz = b.nor[v * 3 + 2], ox = b.pos[v * 3] + nx * L.bias, oy = b.pos[v * 3 + 1] + ny * L.bias, oz = b.pos[v * 3 + 2] + nz * L.bias, at = v * VLIGHT;
      data[at] = Math.max(floor, Math.round(skyOpen(S, ox, oy, oz, nx, ny, nz) * 255));
      lampBytes(S, data, at, ox, oy, oz, nx, ny, nz, 0);
      data[at + 4] = rayAny(S.bvh, ox, oy, oz, S.sun[0], S.sun[1], S.sun[2], S.far) ? 0 : 255;
      const best = switchSums(S, ox, oy, oz, nx, ny, nz);
      data[at + 5] = best < 0 ? NO_GROUP : best; data[at + 6] = best < 0 ? 0 : Math.max(1, pack(S.sum[best] * L.lampGain));
      if (++work === 256) { work = 0; yield; }
    }
    out.push(data);
  }
  return out;
}

// 방향이 없는 점의 빛 5바이트를 out[at …] 에
export function probeLight(S, x, y, z, out, at) {
  out[at] = Math.max(Math.round(BAKE.light.floor * 255), Math.round(skyOpen(S, x, y, z, 0, 1, 0) * 255));
  lampBytes(S, out, at, x, y, z, 0, 1, 0, BAKE.light.probeFacing);
  out[at + 4] = rayAny(S.bvh, x, y, z, S.sun[0], S.sun[1], S.sun[2], S.far) ? 0 : 255;
}

export function* lightGrid(world, nav, S) {
  const L = BAKE.light, nx = Math.ceil(world.size[0] / L.grid), nz = Math.ceil(world.size[1] / L.grid), per = Math.round(L.grid / nav.cell), layer = L.grid / nav.unit;
  const start = new Uint32Array(nx * nz + 1), ys = [], data = [], hits = [], p = [0, 0, 0], five = new Uint8Array(PLIGHT), spans = [];
  for (let gj = 0; gj < nz; gj++) {
    for (let gi = 0; gi < nx; gi++) {
      const cx = nav.x0 + (gi + 0.5) * L.grid, cz = nav.z0 + (gj + 0.5) * L.grid;
      start[gj * nx + gi] = ys.length;
      // 이 칸의 걷는 칸을 높이 차례로 — 한 층(칸 높이 안)마다 가운데에 가장 가까운 걷는 칸 위에 탐침 하나
      spans.length = 0;
      for (let j = gj * per; j < Math.min(nav.d, (gj + 1) * per); j++) for (let i = gi * per; i < Math.min(nav.w, (gi + 1) * per); i++) {
        for (let s = nav.start[j * nav.w + i]; s < nav.start[j * nav.w + i + 1]; s++) spans.push(s);
      }
      spans.sort((a, b) => nav.y[a] - nav.y[b] || a - b);
      for (let k = 0; k < spans.length;) {
        let pick = spans[k], near = Infinity, e = k;
        for (; e < spans.length && nav.y[spans[e]] - nav.y[spans[k]] < layer; e++) {
          spanPos(nav, spans[e], p);
          const far = (p[0] - cx) * (p[0] - cx) + (p[2] - cz) * (p[2] - cz);
          if (far < near) { near = far; pick = spans[e]; }
        }
        spanPos(nav, pick, p);
        probeLight(S, p[0], p[1] + L.probeUp, p[2], five, 0);
        ys.push(p[1] + L.probeUp); for (let c = 0; c < PLIGHT; c++) data.push(five[c]);
        k = e;
      }
      if (ys.length === start[gj * nx + gi]) {
        let top = world.sea;
        for (let n = column(S.bvh, cx, cz, hits), k = 0; k < n; k++) if (hits[k * 3] > top) top = hits[k * 3];
        probeLight(S, cx, top + L.probeUp, cz, five, 0);
        ys.push(top + L.probeUp); for (let c = 0; c < PLIGHT; c++) data.push(five[c]);
      }
    }
    yield;
  }
  start[nx * nz] = ys.length;
  return { cell: L.grid, nx, nz, x0: nav.x0, z0: nav.z0, start, y: Float32Array.from(ys), data: Uint8Array.from(data) };
}

// 빛 격자에서 자리 (x, y, z) 의 빛 5바이트를 out[at …] 에 옮긴다 — 그 칸에서 높이가 가장 가까운 탐침(격자 밖은 가장자리 칸). 돌려주는 값 = 그 탐침의 번호.
export function lightAt(grid, x, y, z, out, at) {
  const gi = Math.min(grid.nx - 1, Math.max(0, Math.floor((x - grid.x0) / grid.cell))), gj = Math.min(grid.nz - 1, Math.max(0, Math.floor((z - grid.z0) / grid.cell))), c = gj * grid.nx + gi;
  let best = grid.start[c];
  for (let k = best + 1; k < grid.start[c + 1]; k++) if (Math.abs(grid.y[k] - y) < Math.abs(grid.y[best] - y)) best = k;
  for (let b = 0; b < PLIGHT; b++) out[at + b] = grid.data[best * PLIGHT + b];
  return best;
}

// 인스턴스 줄마다(원형 좌표 높이 instUp × 크기 위의 점) · 과녁 조각마다(과녁의 가운데)의 빛 5바이트. 탐침 256개마다 쉰다.
export function* pointLightSteps(world, S) {
  const up = BAKE.light.instUp, inst = [], props = new Uint8Array(world.props.length * PLIGHT);
  let work = 0;
  for (const g of world.instances) {
    const n = g.xf.length / 8, data = new Uint8Array(n * PLIGHT);
    for (let i = 0; i < n; i++) {
      probeLight(S, g.xf[i * 8], g.xf[i * 8 + 1] + up * g.xf[i * 8 + 7] + BAKE.light.bias, g.xf[i * 8 + 2], data, i * PLIGHT);
      if (++work === 256) { work = 0; yield; }
    }
    inst.push(data);
  }
  for (const t of world.marks.targets) probeLight(S, t.at[0], t.at[1], t.at[2], props, t.prop * PLIGHT);
  return { inst, props };
}
