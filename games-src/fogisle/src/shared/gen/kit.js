// 주는 것: 키트 — PIECES(조각 이름 → 만드는 함수와 성질) · optOf(조각의 치수 — 안 적으면 기본값) · LIT(등불 표시의 꼴) · parseLit · LAMP(등불 색).
//   조각은 제 좌표(y = 0 이 놓인 자리)에 그리고 put 이 세계로 옮긴다.
//   원경 등대 lighthouse · 등불 기둥 lamppost · 등롱 lantern · 돌담 wall · 판자 부두 pier · 병 bottle · 부표 buoy · 말뚝과 밧줄 rope · 상자 crate · 드럼통 drum ·
//   고무보트 boat(바위 덩이는 rocks.js 가 흩는다).
// 받는 것: shapes · mesh · dmath · rng · build · tune/world. 조각의 생김새(모서리 깎기 · 두께 · 반복 깨기)는 여기서 책임진다(tdd §4-2).
//   땅과 조각은 0.3m 넘게 겹쳐 박는다(embed). 정적 부분은 모서리 kit.maxEdge 이하로 쪼갠다(꼭짓점 빛 규칙). 과녁(target)인 조각은 정적 묶음에 넣지 않고
//   따로 그리는 조각(prop)으로 낸다 — 깨지고 사라질 수 있게. 등불이 달린 조각(lamp)은 레시피에 lit 을 꼭 적는다:
//   'on' 늘 켜짐 · 'switch:N' 스위치 묶음 N(대본으로 켜고 끈다) · 'break:N' 깨지는 등불(묶음 N — 깨지면 꺼진다). N 은 0 ~ tune 의 lit.groups − 1.
//   과녁인 등불(등롱)은 'break:N' 만, 과녁이 아닌 등불은 'on' · 'switch:N' 만 된다(레시피 검사가 본다).
// 아래 색조(C)와 옆모습(선반 깎기 단면) · 치수의 기본값과 범위(PIECES 의 opt)는 조각의 모양 자료다 — 여러 조각이 같이 쓰는 수치만 tune/world 에 있다.
// 색조는 꼭짓점에 싣지 않는다: 부분마다의 색조가 묶음(batches[].tint) · 따로 그리는 부분(parts[].tint)의 값이 된다(색조가 다르면 다른 묶음). 밑동 색(tint2)은 그늘 칸의 어둡기로만 남긴다.
import { PI, TAU, dsin, dcos, dpow, datan2 } from '../dmath.js';
import { rngNext } from '../rng.js';
import { cbox, bar, extrude, lathe, sweep, displace, ico, place, xf } from '../geom/shapes.js';
import { shade, subdivide } from '../geom/mesh.js';
import { addMesh, makePart, landAt, SURF } from './build.js';
import { WORLD } from '../tune/world.js';

const C = Object.freeze({
  plaster: [0.95, 0.95, 0.93], plasterLow: [0.7, 0.71, 0.69], concrete: [0.84, 0.86, 0.87], concreteLow: [0.46, 0.48, 0.5], iron: [0.13, 0.16, 0.17],
  copper: [0.37, 0.58, 0.53], copperLow: [0.23, 0.42, 0.38], wood: [0.5, 0.42, 0.35], woodDark: [0.37, 0.31, 0.26], pane: [0.08, 0.1, 0.12], glass: [1, 0.74, 0.42],
  glow: [1, 0.78, 0.45], stone: [0.66, 0.67, 0.66], bottle: [0.22, 0.42, 0.32], buoy: [0.86, 0.4, 0.15], white: [0.9, 0.9, 0.87], hemp: [0.42, 0.36, 0.27], rubber: [0.1, 0.11, 0.12],
});
export const LAMP = Object.freeze({ warm: [1, 0.68, 0.34] });
export const LIT = /^(on|(switch|break):\d)$/;

export function parseLit(lit) { return { mode: lit.split(':')[0], group: lit.includes(':') ? Number(lit.split(':')[1]) : -1 }; }

const lum = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];

// 조각의 한 부분을 넣는다. o = { tint2: 밑동 색(그늘 칸의 어둡기로 남는다), tone: 이 덩이의 밝기 0 ~ 1, solid: 표면 종류 이름(충돌에 넣는다), crease: 꺾임 각,
//   fixed: 과녁 조각 안의 안 움직이는 부분 }
function put(K, mat, soup, tint, o = {}) {
  const look = { tint, low: o.tint2 ? Math.max(0, 1 - lum(o.tint2) / lum(tint)) : 0, tone: o.tone };
  if (K.prop && !o.fixed) { K.prop.parts.push(makePart(mat, shade(soup, o.crease), look, K.salt)); return; }
  const mesh = shade(subdivide(place(soup, K.frame), WORLD.kit.maxEdge), o.crease);
  addMesh(K.B, mat, mesh, { ...look, solid: o.solid ? SURF.indexOf(o.solid) : null, owner: K.owner });
}

function light(K, p, radius) {
  const F = K.frame, lit = parseLit(K.it.lit);
  K.lit = K.lights.length;
  K.lights.push({
    at: [F[0] * p[0] + F[1] * p[1] + F[2] * p[2] + F[3], F[4] * p[0] + F[5] * p[1] + F[6] * p[2] + F[7], F[8] * p[0] + F[9] * p[1] + F[10] * p[2] + F[11]],
    color: LAMP[K.it.color || 'warm'].slice(), radius: K.it.radius || radius, mode: lit.mode, group: lit.group, piece: K.it.piece,
  });
}

const circle = (r, y, n) => Array.from({ length: n }, (v, i) => [r * dcos(TAU * i / n), y, r * dsin(TAU * i / n)]);
const rod = (a, b, r) => sweep([a, b], r, 5);
const around = (soup, a, r, y) => place(soup, xf(dsin(a) * r, y, dcos(a) * r, 0, a, 0));
const jitter = (K, amp) => (rngNext(K.rng) - 0.5) * 2 * amp;

// 원경 등대: 기단 → 살짝 볼록하게 좁아지는 탑(띠 둘 · 창 셋 · 문) → 처마받침과 난간 → 등실(창살 · 유리 · 등) → 구리 지붕과 꼭대기 장식
function lighthouse(K, it) {
  const H = optOf(it, 'height'), g = H - 6.9, L = g - 1.3, deck = g + 1.05, top = deck + 2.5, e = -WORLD.kit.embed - 0.3;
  const rAt = (t) => 3.75 - 1.25 * dpow(t, 0.85) + 0.05 * dsin(t * PI), tower = [[3.75, 1]];
  for (let i = 0; i <= 18; i++) tower.push([rAt(i / 18), 1.3 + L * i / 18]);
  tower.push([2.75, g + 0.1], [3.05, g + 0.4], [3.6, g + 0.85], [3.6, deck], [2.8, deck], [2.1, deck]);
  put(K, 'concrete', lathe([[5, e], [5, 1], [4.75, 1.25], [4.2, 1.3], [3.5, 1.3]], 28), C.concrete, { tint2: C.concreteLow, solid: 'stone' });
  put(K, 'plaster', lathe(tower, 28), C.plaster, { tint2: C.plasterLow, solid: 'stone' });
  for (const t of [0.3, 0.66]) put(K, 'concrete', sweep(circle(rAt(t) + 0.05, 1.3 + L * t, 28), 0.09, 5, true), C.concrete);
  for (const [t, a] of [[0.17, 0.3], [0.47, 2.2], [0.77, 4.1]]) {
    const r = rAt(t), y = 1.3 + L * t;
    put(K, 'concrete', around(cbox(0.95, 1.5, 0.3, 0.04), a, r, y), C.concrete);
    put(K, 'concrete', around(cbox(1.15, 0.1, 0.42, 0.02), a, r + 0.04, y - 0.8), C.concreteLow);
    put(K, 'glass', around(cbox(0.66, 1.2, 0.06), a, r + 0.14, y), C.pane);
  }
  put(K, 'concrete', around(cbox(1.5, 2.5, 0.5, 0.05), 1.15, 3.72, 2.5), C.concrete);
  put(K, 'wood', around(cbox(1.1, 2.2, 0.1, 0.02), 1.15, 3.96, 2.4), C.copperLow);
  put(K, 'concrete', place(cbox(1.9, 0.14, 0.9, 0.03), xf(dsin(1.15) * 3.92, 3.85, dcos(1.15) * 3.92, 0.12, 1.15, 0)), C.concreteLow);
  for (const [dy, r] of [[1, 0.045], [0.55, 0.025], [0.2, 0.025]]) put(K, 'iron', sweep(circle(3.45, deck + dy, 32), r, 4, true), C.iron);
  for (let i = 0; i < 16; i++) { const a = TAU * i / 16; put(K, 'iron', rod([dsin(a) * 3.45, deck - 0.05, dcos(a) * 3.45], [dsin(a) * 3.45, deck + 1, dcos(a) * 3.45], 0.03), C.iron); }
  put(K, 'concrete', lathe([[2.25, deck - 0.1], [2.25, deck + 0.2], [2.1, deck + 0.25], [1.1, deck + 0.25], [0, deck + 0.25]], 24), C.concreteLow);
  for (let i = 0; i < 12; i++) put(K, 'iron', around(cbox(0.07, 2.5, 0.1, 0.01), TAU * i / 12, 2.05, deck + 1.3), C.iron);
  put(K, 'iron', sweep(circle(2.05, deck + 1.35, 24), 0.06, 4, true), C.iron);
  put(K, 'glass', lathe([[2, deck + 0.25], [2, top]], 24), C.glass);
  put(K, 'glow', place(ico(1), xf(0, deck + 1.35, 0, 0, 0, 0, 0.55)), C.glow);
  put(K, 'copper', lathe([[2, top - 0.05], [2.4, top], [2.4, top + 0.2], [2.15, top + 0.35], [1.9, top + 0.9], [1.35, top + 1.45], [0.7, top + 1.8], [0.22, top + 1.93],
    [0.2, top + 2.25], [0.32, top + 2.4], [0.2, top + 2.55], [0.05, top + 2.57], [0.04, top + 3.35], [0, top + 3.35]], 28), C.copper, { tint2: C.copperLow });
  light(K, [0, deck + 1.35, 0], WORLD.kit.beaconRadius);
}

// 등불 기둥: 밑동이 굵은 기둥 + 굽은 팔 + 갓 + 전구
function lamppost(K, it) {
  const h = optOf(it, 'height'), arm = [];
  for (let s = 0; s <= 6; s++) { const u = s / 6 * 1.45; arm.push([0, h - 0.05 + 0.36 * (1 - dcos(u)) - 0.25 * Math.max(0, u - 1), 0.55 * dsin(u)]); }
  put(K, 'iron', lathe([[0, -WORLD.kit.embed], [0.13, -WORLD.kit.embed], [0.13, 0.3], [0.075, 0.38], [0.05, h], [0, h]], 8), C.iron, { solid: 'iron' });
  put(K, 'iron', sweep(arm, 0.03, 5), C.iron);
  put(K, 'iron', place(lathe([[0, 0.03], [0.26, 0], [0.07, 0.2], [0, 0.22]], 10), xf(0, h + 0.02, 0.55)), C.iron);
  put(K, 'glow', place(ico(1), xf(0, h, 0.55, 0, 0, 0, 0.085)), C.glow);
  light(K, [0, h, 0.55], WORLD.kit.lightRadius);
}

// 등롱: 받침 · 유리 · 갓 · 살 넷 · 손잡이. stake = 놓인 자리까지 땅에서 올라오는 말뚝(받침판 + 까치발) — 과녁이어도 말뚝은 남는다.
function lantern(K, it) {
  if (it.stake) {
    const down = -(it.up || 0) - WORLD.kit.embed;
    put(K, 'wood', lathe([[0, down], [0.06, down], [0.05, -0.04], [0, -0.04]], 7), C.woodDark, { fixed: true, solid: 'wood' });
    put(K, 'wood', place(cbox(0.3, 0.04, 0.3, 0.008), xf(0, -0.02, 0)), C.wood, { fixed: true });
    put(K, 'wood', place(extrude([[0, 0], [0.13, 0.16], [0, 0.16]], 0.04), xf(0.05, -0.2, 0)), C.woodDark, { fixed: true });
  }
  put(K, 'iron', lathe([[0, 0], [0.09, 0], [0.09, 0.03], [0.06, 0.06], [0, 0.06]], 10), C.iron);
  put(K, 'glass', lathe([[0.045, 0.06], [0.075, 0.13], [0.075, 0.21], [0.045, 0.27]], 10), C.glass);
  put(K, 'iron', lathe([[0, 0.265], [0.085, 0.27], [0.06, 0.31], [0.025, 0.34], [0, 0.345]], 10), C.iron);
  for (let i = 0; i < 4; i++) { const a = TAU * (i + 0.5) / 4; put(K, 'iron', rod([dsin(a) * 0.082, 0.04, dcos(a) * 0.082], [dsin(a) * 0.082, 0.28, dcos(a) * 0.082], 0.006), C.iron); }
  put(K, 'iron', sweep(Array.from({ length: 7 }, (v, i) => [-0.085 * dcos(PI * i / 6), 0.3 + 0.14 * dsin(PI * i / 6), 0]), 0.006, 4), C.iron);
  put(K, 'glow', place(ico(0), xf(0, 0.16, 0, 0, 0, 0, 0.03)), C.glow);
  light(K, [0, 0.16, 0], WORLD.kit.lightRadius * WORLD.kit.lanternLight);
}

// 돌담: 선을 따라 두 켜의 돌(이음매를 반 칸 어긋나게). 돌마다 길이 · 높이 · 두께 · 기울기 · 색이 다르고 잡음으로 밀어 막돌처럼 보이게 한다.
function wall(K, it) {
  const h = optOf(it, 'height'), w = optOf(it, 'width'), E = WORLD.kit.embed;
  for (let s = 0; s + 1 < it.line.length; s++) {
    const a = it.line[s], b = it.line[s + 1], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.sqrt(dx * dx + dz * dz), yaw = datan2(-dz, dx);
    if (!(len > 0 && len <= WORLD.range.size[1])) throw new Error(`돌담의 마디 ${s} 의 길이가 틀리다(${len}) — 선의 점을 본다`);
    for (let course = 0; course < 2; course++) {
      for (let d = course ? -0.3 : 0; d < len;) {
        const l = 0.45 + rngNext(K.rng) * 0.55, tall = 0.85 + rngNext(K.rng) * 0.3, tone = 0.78 + rngNext(K.rng) * 0.34, thick = w * (0.85 + rngNext(K.rng) * 0.3);
        const ch = course ? h * 0.42 * tall : h * 0.58 + E, cy = course ? h * 0.58 + ch / 2 - 0.03 : (h * 0.58 - E) / 2;
        const m = Math.min(len, Math.max(0, d + l / 2)), x = a[0] + dx * m / len, z = a[1] + dz * m / len;
        const stone = displace(cbox(l + 0.06, ch + 0.04, thick, 0.1), 0.055, 2.4, K.salt + Math.floor(d * 8) + course);
        const T = xf(x, landAt(K.B, K.T, x, z) + cy, z, jitter(K, 0.06), yaw + jitter(K, 0.1), jitter(K, 0.06));
        put(K, 'stone', place(stone, T), C.stone, { solid: 'stone', crease: 50, tone: (tone - 0.78) / 0.34 });
        d += l;
      }
    }
  }
}

// 판자 부두: 제 좌표의 +z 가 바다 쪽, y = 0 이 해수면. 기둥 짝(하나 걸러 계류 기둥) · 가로대 · 세로대 · 판자(한 장씩 조금 어긋나게)
function pier(K, it) {
  const L = optOf(it, 'length'), w = optOf(it, 'width'), deck = optOf(it, 'deck'), half = w / 2, turn = PI / 2;
  for (let z = 0.4; z < L; z += 2.4) {
    for (const e of [-1, 1]) {
      const yTop = deck + ((Math.floor(z / 2.4) & 1) === 0 ? 0.85 : -0.06), post = [[0, yTop], [0.13, yTop]];
      for (let y = yTop - 1; y > -2.6; y -= 1) post.push([0.14, y]);
      post.push([0.15, -2.6]);
      put(K, 'wood', place(lathe(post, 7), xf(e * (half - 0.05), 0, z, jitter(K, 0.025), 0, jitter(K, 0.025))), C.woodDark, { solid: 'wood' });
    }
    put(K, 'wood', place(bar(w + 0.4, 0.16, 0.18), xf(0, deck - 0.14, z)), C.woodDark);
  }
  for (const e of [-1, 1]) put(K, 'wood', place(bar(L + 0.6, 0.2, 0.14), xf(e * (half - 0.35), deck - 0.3, L / 2 - 0.3, 0, turn, 0)), C.woodDark);
  for (let z = -0.5; z < L; z += 0.42) {
    const tone = 0.82 + rngNext(K.rng) * 0.3;
    put(K, 'wood', place(bar(w + 0.3, 0.06, 0.38), xf(jitter(K, 0.03), deck + jitter(K, 0.008), z, 0, jitter(K, 0.015), 0)), C.wood, { solid: 'wood', tone: (tone - 0.82) / 0.3 });
  }
}

function bottle(K) {
  put(K, 'glass', lathe([[0, 0], [0.04, 0], [0.042, 0.02], [0.042, 0.16], [0.03, 0.21], [0.014, 0.25], [0.014, 0.29], [0.017, 0.3], [0, 0.3]], 10), C.bottle);
}

// 부표: 물에 반쯤 잠긴 몸통 + 장대 + 머리 표지. 놓인 자리의 y = 0 이 해수면
function buoy(K) {
  put(K, 'paint', lathe([[0, -0.4], [0.3, -0.33], [0.45, -0.05], [0.45, 0.12], [0.3, 0.38], [0.1, 0.46], [0.06, 1.25], [0, 1.25]], 12), C.buoy);
  put(K, 'paint', lathe([[0, 1.22], [0.15, 1.4], [0, 1.58]], 8), C.white);
}

// 말뚝과 밧줄: 선을 따라 3m 쯤마다 말뚝, 말뚝 머리 사이에 처진 밧줄. 밧줄도 충돌에 넣는다(보이는 것 = 막는 것 — 밑으로는 못 지나가고 넘기 고리로 넘는다)
function rope(K, it) {
  let prev = null;
  for (let s = 0; s + 1 < it.line.length; s++) {
    const a = it.line[s], b = it.line[s + 1], len = Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1])), n = Math.max(1, Math.round(len / 3));
    if (!(len > 0 && len <= WORLD.range.size[1])) throw new Error(`밧줄의 마디 ${s} 의 길이가 틀리다(${len}) — 선의 점을 본다`);
    for (let k = s ? 1 : 0; k <= n; k++) {
      const x = a[0] + (b[0] - a[0]) * k / n, z = a[1] + (b[1] - a[1]) * k / n, y = landAt(K.B, K.T, x, z), head = [x, y + 0.93, z];
      put(K, 'wood', place(lathe([[0, -WORLD.kit.embed], [0.075, -WORLD.kit.embed], [0.06, 0.97], [0, 0.99]], 6), xf(x, y, z, jitter(K, 0.08), 0, jitter(K, 0.08))), C.woodDark, { solid: 'wood' });
      if (prev) {
        const sag = Array.from({ length: 7 }, (v, i) => [prev[0] + (head[0] - prev[0]) * i / 6, prev[1] + (head[1] - prev[1]) * i / 6 - dsin(PI * i / 6) * 0.2, prev[2] + (head[2] - prev[2]) * i / 6]);
        put(K, 'hemp', sweep(sag, 0.018, 4), C.hemp, { solid: 'rope' });
      }
      prev = head;
    }
  }
}

// 상자: 띠 두 줄을 두른 나무 상자(높이 = 크기 × 0.8). 땅에 얹는다(박지 않는다)
function crate(K, it) {
  const s = optOf(it, 'size');
  put(K, 'wood', place(cbox(s, s * 0.8, s, 0.025), xf(0, s * 0.4 - 0.04, 0)), C.wood, { solid: 'wood' });
  for (const e of [-1, 1]) put(K, 'wood', place(cbox(s + 0.04, 0.07, s + 0.04, 0.01), xf(0, s * 0.4 - 0.04 + e * s * 0.33, 0)), C.woodDark);
}

function drum(K) {
  const side = [[0, -0.04], [0.29, -0.04], [0.3, 0.02], [0.3, 0.28], [0.315, 0.3], [0.3, 0.32], [0.3, 0.58], [0.315, 0.6], [0.3, 0.62], [0.3, 0.86], [0.29, 0.9], [0, 0.88]];
  put(K, 'iron', lathe(side, 14), C.copperLow, { solid: 'iron' });
}

// 고무보트: 뱃머리가 +z. 굽은 공기 관 하나(뱃머리로 갈수록 살짝 들린다) + 바닥판 + 고물 판. 관의 밑이 놓인 자리보다 4cm 아래다(상자 · 드럼통처럼 땅에 살짝 앉는다).
function boat(K) {
  const tube = [], side = (t, e) => [e * 0.78 * Math.min(1, 1.65 - 1.65 * t * t), 0.22 + 0.16 * t * t * t, -1.5 + 3.3 * t];
  for (let i = 0; i <= 8; i++) tube.push(side(i / 8, -1));
  for (let i = 7; i >= 0; i--) tube.push(side(i / 8, 1));
  put(K, 'rubber', sweep(tube, 0.26, 8), C.rubber, { solid: 'rubber' });
  put(K, 'rubber', place(cbox(1.5, 0.06, 2.9, 0.02), xf(0, 0.04, -0.1)), C.rubber, { solid: 'rubber' });
  put(K, 'wood', place(cbox(1.5, 0.5, 0.08, 0.02), xf(0, 0.28, -1.5)), C.woodDark, { solid: 'wood' });
}

// lamp = 등불이 달렸다(lit 필수) · line = 자리 대신 선(line)을 받는다 · sea = 해수면에 놓는다 · clear = 바위를 비워 둘 반지름 ·
//   loose = 땅에 얹는 소품이다(박지 않는다 — 땅의 기울기대로 기울여 앉힌다(world.js 의 restFrame). 검증 「맞닿은 조각」은 얹는 소품이 떠 있는지 · 한쪽이 떴는지를 본다) ·
//   foot = 얹는 소품의 발자국(제 좌표의 반 폭 [x, z] — 그 끝에서 땅 높이를 재어 앉힌다) ·
//   reach = 제 +z 쪽으로 뻗는 길이를 적는 칸 이름 · aim = 과녁의 가운데 높이(이것이 있는 조각만 과녁이 될 수 있다) ·
//   opt = 레시피에 적을 수 있는 치수: 이름 → [기본값, 작은, 큰](m) — 기본값은 여기 한 곳에만 있다(만드는 함수 · 바위 비움 · 레시피 검사가 같이 읽는다)
export const PIECES = Object.freeze({
  lighthouse: { make: lighthouse, lamp: true, clear: 7, opt: { height: [25.4, 12, 60] } }, lamppost: { make: lamppost, lamp: true, clear: 0.8, opt: { height: [3.6, 2, 8] } },
  lantern: { make: lantern, lamp: true, clear: 0.6, aim: 0.17, opt: {} }, wall: { make: wall, line: true, clear: 0.9, opt: { height: [1.1, 0.3, 3], width: [0.55, 0.2, 2] } },
  pier: { make: pier, sea: true, clear: 2.4, reach: 'length', opt: { length: [16, 2, 80], width: [2.6, 1, 6], deck: [1.3, 0.3, 4] } },
  bottle: { make: bottle, clear: 0.4, aim: 0.15, opt: {} }, buoy: { make: buoy, sea: true, clear: 0.9, aim: 0.5, opt: {} },
  rope: { make: rope, line: true, clear: 0.6, opt: {} },
  crate: { make: crate, loose: true, foot: (it) => [optOf(it, 'size') / 2, optOf(it, 'size') / 2], clear: 1, opt: { size: [1, 0.5, 2] } },
  drum: { make: drum, loose: true, foot: () => [0.3, 0.3], clear: 0.6, opt: {} }, boat: { make: boat, loose: true, foot: () => [0.78, 1.5], clear: 2.2, opt: {} },
});

// 조각의 치수 하나: 레시피에 적혀 있으면 그 값, 아니면 PIECES 의 기본값. 범위 밖 · 수가 아닌 값은 여기서 예외다(검사를 안 거친 레시피가 길이로 도는 고리를 끝없이 돌리지 않게).
export function optOf(it, name) {
  const o = PIECES[it.piece].opt[name], v = it[name] != null ? it[name] : o[0];
  if (!(typeof v === 'number' && v >= o[1] && v <= o[2])) throw new Error(`조각 ${it.piece} 의 ${name} = ${String(v)} — ${o[1]} ~ ${o[2]} 안의 수여야 한다`);
  return v;
}
