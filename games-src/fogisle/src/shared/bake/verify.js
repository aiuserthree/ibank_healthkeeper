// 주는 것: 검증 8종 — verify(world, baked, recipe) → { problems: [{ check(1 ~ 8), code, msg, at }], counts, notes, reached, samples }. 하나라도 있으면 그 세계는 실패다(tdd §4-6).
// 받는 것: bvh · nav · light · gen/recipe · dmath · tune. 불러올 때의 굽기와 따로 돈다(Node 의 tools/bake.mjs · 시험 — 워커는 검증을 통과한 레시피만 굽는다).
//   1 reach  시작 자리 · 책갈피 · 표식(points) · 문이 같은 닿는 무리인가(떨어진 섬)   2 door  문 표식마다 양쪽을 잇는 길이 그 문을 지나는가(좁은 문 · 막힌 문)
//   3 edge   시작 자리에서 걷고 · 고리를 타고 · 달려 뛰어 세계의 끝(가장자리)에 닿지 않는가(틈)   4 hole  걷는 자리의 눈높이 광선이 뒷면에 맞거나, 닫힌 구역 밖으로 새지 않는가(구멍)
//   5 fit    표식이 설 걷는 칸이 있는가(벽 속 표식) · 걷는 칸 · 엄폐 점에 캡슐이 들어가는가(끼임)   6 seam  조각이 땅 · 다른 조각에 embedMin 넘게 박혔는가(맞닿은 조각 · 뜬 조각 ·
//            한쪽이 뜬 소품)
//   7 light  꼭짓점 빛 규칙(늘 켜진 빛에 깨지는 · 스위치 등불이 안 섞였는가 · 바닥 값 · 조각의 면 크기와 꺾임) + 삼각형 · 호출 · 인스턴스 예산
//   8 recipe 레시피 검사(모르는 조각 · 세계 밖 표식 · 겹친 표식 … — code 는 'recipe:' + 레시피 검사의 code) · 교전 구역마다의 엄폐 점(cover — 시작 자리의 닿는 무리 안에서 센다)
// at = 그 문제의 자리 [x, y, z](지도 미리보기가 붉은 고리로 그린다). 같은 종류의 문제는 처음 몇 개만 적고 수를 counts 에 남긴다.
// notes = 실패는 아니고 알리기만 하는 수(switchOverlap: 스위치 묶음 둘 이상이 세게 닿는 꼭짓점 — 큰 묶음 하나만 구워진다 · switchChecked: 그것을 본 꼭짓점 수).
// 표식의 규칙: 표식(시작 자리 · 책갈피 · points)은 생성이 「설 수 있는 바닥」에 세운다(gen/build.js 의 floorAt). 여기서는 그 자리 둘레 markSnap 안의 칸이 **전부**
//   그 높이(오름 높이 안)의 걷는 칸인지 본다 — 하나라도 아니면 돌담 · 기둥 위(돌 속에 적은 표식은 그 위로 올라선다) · 가파른 면 · 턱 끝 · 깊은 물에 선 표식이다.
//   문 표식은 길목(좁은 자리)이라 이 검사 대신 검증 2 가 본다.
// 검증마다 함수 하나다. 같이 쓰는 것(걷기 격자 · 문제 적기 · 시작 칸 home · 닿은 칸 seen)은 X 한 통에 담아 넘긴다.
import { PI, TAU, dsin, dcos } from '../dmath.js';
import { checkRecipe } from '../gen/recipe.js';
import { PIECES } from '../gen/kit.js';
import { rayHit, column, sphereAny } from './bvh.js';
import { spanAt, spanPos } from './nav.js';
import { lightSetup, lampBytes, switchSums, VLIGHT, PLIGHT } from './light.js';
import { WORLD } from '../tune/world.js';
import { BAKE } from '../tune/bake.js';

const KEEP = 6, DEG = PI / 180;
const inArea = (a, x, z) => (a[0] === 'circle' ? (x - a[1]) * (x - a[1]) + (z - a[2]) * (z - a[2]) <= a[3] * a[3] : x >= a[1] && x <= a[3] && z >= a[2] && z <= a[4]);
const round = (v) => Math.round(v * 100) / 100;
const isEdge = (nav, s) => nav.nb[s * 4] < 0 || nav.nb[s * 4 + 1] < 0 || nav.nb[s * 4 + 2] < 0 || nav.nb[s * 4 + 3] < 0;

// 시작 칸에서 걸어서 + 고리(떨어지기까지)로 닿는 걷는 칸 → seen 에 1. 더 닿은 칸의 수를 돌려준다.
function flood(nav, out, seen, from) {
  const stack = [];
  let n = 0;
  for (const s of from) if (s >= 0 && !seen[s]) { seen[s] = 1; stack.push(s); n++; }
  while (stack.length) {
    const u = stack.pop();
    for (let d = 0; d < 4; d++) { const v = nav.nb[u * 4 + d]; if (v >= 0 && !seen[v]) { seen[v] = 1; stack.push(v); n++; } }
    for (const v of out.get(u) || []) if (!seen[v]) { seen[v] = 1; stack.push(v); n++; }
  }
  return n;
}

// 걷는 칸 가운데 표본: 가로 · 세로 gap m 마다 한 칸(층마다)
function sampled(nav, gap, keep) {
  const g = Math.max(1, Math.round(gap / nav.cell)), out = [];
  for (let s = 0; s < nav.y.length; s++) { const col = nav.col[s], i = col % nav.w, j = (col - i) / nav.w; if (keep(s) && i % g === (g >> 1) && j % g === (g >> 1)) out.push(s); }
  return out;
}

// 표식이 설 칸(둘레 markSnap 안의 칸이 다 걷는 칸이어야 한다 — 아니면 −1)
function stand(X, at) {
  const nav = X.nav, r = Math.floor(X.V.markSnap / nav.cell), ci = Math.floor((at[0] - nav.x0) / nav.cell), cj = Math.floor((at[2] - nav.z0) / nav.cell);
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
    if (i * i + j * j <= r * r && spanAt(nav, nav.x0 + (ci + i + 0.5) * nav.cell, at[1], nav.z0 + (cj + j + 0.5) * nav.cell, 0, X.N.climb) < 0) return -1;
  }
  return spanAt(nav, at[0], at[1], at[2], 0, X.N.climb);
}

// 걷는 칸 s 에 캡슐(반지름 nav.radius — 오름 높이 위 ~ 머리)이 들어가는가: 공 셋으로 본다
function fits(X, s) {
  const p = spanPos(X.nav, s, X.p), r = X.N.radius, N = X.N;
  return !(sphereAny(X.bvh, p[0], p[1] + N.climb + r, p[2], r) || sphereAny(X.bvh, p[0], p[1] + (N.climb + N.height) / 2, p[2], r) || sphereAny(X.bvh, p[0], p[1] + N.height - r, p[2], r));
}

// ---- 5 표식이 설 자리(벽 속 표식) · 1 닿는 무리. 표식마다의 걷는 칸(없으면 −1)을 X.spans 에, 시작 칸을 X.home 에 둔다.
function marks(X) {
  const M = X.M, nav = X.nav;
  X.marks = [['시작 자리', M.spawn.at], ...M.stations.map((s) => ['책갈피 ' + s.id, [s.at[0], s.at[1] - WORLD.eye, s.at[2]]]), ...Object.entries(M.points).map(([id, at]) => ['표식 ' + id, at])];
  X.spans = X.marks.map(([name, at]) => {
    const s = stand(X, at);
    if (s < 0) X.bad(5, 'fit', `${name} 둘레 ${X.V.markSnap}m 가 걷는 바닥이 아니다 — 벽 · 돌 속(위)이거나 가파른 면 · 좁은 턱 · 깊은 물이다`, at);
    return s;
  });
  X.home = X.spans[0];
  if (X.home >= 0) X.marks.forEach(([name, at], k) => {
    if (X.spans[k] >= 0 && nav.group[X.spans[k]] !== nav.group[X.home]) X.bad(1, 'reach', `${name} 이(가) 시작 자리와 다른 닿는 무리다(떨어진 섬 — 걸어서도 고리로도 오갈 수 없다)`, at);
  });
}

// ---- 8 레시피 검사 + 엄폐 분포(교전 구역마다 — 시작 자리의 닿는 무리 안의 엄폐 점만 센다. 시작 칸이 없으면 전부)
function recipeAndCover(X) {
  const C = X.baked.cover, home = X.home >= 0 ? X.nav.group[X.home] : -1;
  if (X.recipe) for (const r of checkRecipe(X.recipe)) X.bad(8, 'recipe:' + r.code, r.msg, null);
  X.world.zones.forEach((z, i) => {
    if (!z.fight) return;
    let n = 0;
    for (let k = 0; k < C.n; k++) if ((home < 0 || C.group[k] === home) && inArea(z.area, C.pos[k * 3], C.pos[k * 3 + 2])) n++;
    if (n < X.V.coverPerZone) X.bad(8, 'cover', `교전 구역 zones[${i}] 의 엄폐 점이 ${n}곳이다 — ${X.V.coverPerZone}곳 이상(시작 자리에서 갈 수 있는 곳만 센다)`, null);
  });
}

// ---- 2 문: 문 둘레(doorReach) 안에서만 걷는다 — 문 밑의 칸을 지나면 건너가야 하고, 그 칸을 빼면 못 건너가야 한다(문이 길목이다)
function doors(X) {
  const { nav, V, N, p } = X;
  X.M.doors.forEach((door, k) => {
    const fx = dsin(door.yaw) * V.doorSide, fz = dcos(door.yaw) * V.doorSide;
    const a = spanAt(nav, door.at[0] + fx, door.at[1], door.at[2] + fz, V.markSnap, N.height), b = spanAt(nav, door.at[0] - fx, door.at[1], door.at[2] - fz, V.markSnap, N.height);
    const cross = (useDoor) => {
      if (a < 0 || b < 0) return false;
      const seen = new Set([a]), stack = [a];
      while (stack.length) {
        const u = stack.pop();
        if (u === b) return true;
        for (let d = 0; d < 4; d++) {
          const v = nav.nb[u * 4 + d];
          if (v < 0 || seen.has(v) || (!useDoor && nav.door[v] === k + 1)) continue;
          spanPos(nav, v, p);
          if ((p[0] - door.at[0]) * (p[0] - door.at[0]) + (p[2] - door.at[2]) * (p[2] - door.at[2]) <= V.doorReach * V.doorReach) { seen.add(v); stack.push(v); }
        }
      }
      return false;
    };
    if (!cross(true)) X.bad(2, 'door', `문 ${door.id}: 양쪽을 잇는 길이 문을 지나지 못한다(좁거나 막혔다 — 걷는 칸이 문 폭에 안 남는다)`, door.at);
    else if (cross(false)) X.bad(2, 'door', `문 ${door.id}: 문을 지나지 않고도 양쪽이 이어진다 — 문 표식이 길목에 있지 않다`, door.at);
    else if (X.home >= 0 && nav.group[a] !== nav.group[X.home]) X.bad(1, 'reach', `문 ${door.id} 이(가) 시작 자리와 다른 닿는 무리다(떨어진 섬)`, door.at);
  });
}

// 걷는 칸 s 의 가운데에서 d 번째 방향으로 달려 뛴다 → 내려선 걷는 칸(없으면 −1). 세계 밖으로 나가면 문제로 적는다.
//   맞은 면이 누운 면(landFlat)이고 내려오는 중이면 내려선 것, 아니면 벽 · 처마다 — 가로 속도를 잃고 그 자리에서 떨어진다(걷는 몸이 생기면 F3 이 진짜 몸으로 바꾼다).
//   걸음마다의 광선은 걸음보다 hitBack 만큼 길게 쏘고 맞으면 그만큼 앞에서 선다 — 걸음의 끝이 면에 꼭 걸치면(다음 광선이 면 위에서 떠나) 벽을 지나치기 때문이다.
function runJump(X, s, d) {
  const { nav, bvh, V, hit, world } = X, p = spanPos(nav, s, X.p), dt = 1 / V.edgeHz, T = bvh.tri;
  const hw = world.size[0] / 2, hd = world.size[1] / 2, cx = world.origin[0] + hw, cz = world.origin[1] + hd;
  let vx = dcos(TAU * d / V.edgeDirs) * V.runSpeed, vz = dsin(TAU * d / V.edgeDirs) * V.runSpeed, vy = Math.sqrt(2 * V.gravity * V.jumpUp), x = p[0], y = p[1] + 0.1, z = p[2];
  for (let step = 0; step < V.edgeSteps; step++) {
    const nx = x + vx * dt, ny = y + vy * dt, nz = z + vz * dt, len = Math.sqrt((nx - x) * (nx - x) + (ny - y) * (ny - y) + (nz - z) * (nz - z)) || 1e-9;
    const t = rayHit(bvh, x, y, z, (nx - x) / len, (ny - y) / len, (nz - z) / len, len + V.hitBack, hit);
    if (hit.slot >= 0) {
      const i = hit.slot * 9, ux = T[i + 3] - T[i], uy = T[i + 4] - T[i + 1], uz = T[i + 5] - T[i + 2], wx = T[i + 6] - T[i], wy = T[i + 7] - T[i + 1], wz = T[i + 8] - T[i + 2];
      const fx = uy * wz - uz * wy, fy = uz * wx - ux * wz, fz = ux * wy - uy * wx, back = Math.max(0, t - V.hitBack);
      x += (nx - x) / len * back; y += (ny - y) / len * back; z += (nz - z) / len * back;
      if (vy <= 0 && fy > V.landFlat * Math.sqrt(fx * fx + fy * fy + fz * fz)) return spanAt(nav, x, y, z, V.markSnap, X.N.height);
      vx = 0; vz = 0; if (vy > 0) vy = 0;
    } else { x = nx; y = ny; z = nz; }
    vy -= V.gravity * dt;
    if (Math.abs(x - cx) > hw || Math.abs(z - cz) > hd) { X.bad(3, 'edge', '가장자리에서 달려 뛰면 세계 밖으로 나간다', [x, y, z]); return -1; }
    if (y < world.sea) return -1;
  }
  return -1;
}

// ---- 3 가장자리: 닿는 칸이 세계의 끝에 붙는가 + 가장자리에서 달려 뛰기. 닿은 칸을 X.seen 에 둔다.
//   가장자리 표본은 가장자리 선을 따라 edgeGap 마다 하나다: 닿은 가장자리 칸을 edgeGap 크기의 통(가로 · 세로 · 층)에 넣어 통마다 처음 것 하나. 한 번 뛴 통은 다시 뛰지 않는다.
function edges(X) {
  const { nav, V, world, p } = X, L = X.baked.links, out = new Map(), seen = new Uint8Array(nav.y.length), taken = new Set(), box = V.edgeGap / nav.cell, layer = X.N.height / nav.unit;
  const hw = world.size[0] / 2, hd = world.size[1] / 2, cx = world.origin[0] + hw, cz = world.origin[1] + hd;
  for (let k = 0; k < L.kind.length; k++) { if (!out.has(L.from[k])) out.set(L.from[k], []); out.get(L.from[k]).push(L.to[k]); }
  X.seen = seen; X.edgeSamples = 0;
  let grown = flood(nav, out, seen, [X.home]);
  for (let pass = 0; pass < 4 && grown > 0; pass++) {
    const landed = [];
    for (let s = 0; s < nav.y.length; s++) {
      if (!seen[s] || !isEdge(nav, s)) continue;
      const col = nav.col[s], i = col % nav.w, key = Math.floor(i / box) + ',' + Math.floor((col - i) / nav.w / box) + ',' + Math.floor(nav.y[s] / layer);
      if (taken.has(key)) continue;
      taken.add(key); X.edgeSamples++;
      for (let d = 0; d < V.edgeDirs; d++) landed.push(runJump(X, s, d));
    }
    grown = flood(nav, out, seen, landed);
  }
  for (let s = 0; s < nav.y.length; s++) {
    if (!seen[s]) continue;
    spanPos(nav, s, p);
    if (hw - Math.abs(p[0] - cx) < V.edgeMargin + nav.cell || hd - Math.abs(p[2] - cz) < V.edgeMargin + nav.cell) X.bad(3, 'edge', '시작 자리에서 걸어서 세계의 끝에 닿는다 — 세계의 끝은 물 · 절벽 · 담이어야 한다(틈)', p.slice());
  }
}

// ---- 4 구멍 광선 · 5 끼임(닿는 칸의 표본 + 엄폐 점 + 표식)
function holes(X) {
  const { nav, bvh, V, world, M, p, hit } = X, C = X.baked.cover, pitches = [V.holeDownA, V.holeDownB, V.holeUp], closed = world.zones.filter((z) => z.enclosed);
  const spots = sampled(nav, V.sampleGap, (k) => X.seen[k] === 1);
  X.samples = spots.length;
  for (const s of spots) {
    if (!fits(X, s)) X.bad(5, 'fit', '걷는 칸에 캡슐이 들어가지 않는다(끼임)', spanPos(nav, s, p).slice());
    spanPos(nav, s, p);
    const ex = p[0], ey = p[1] + WORLD.eye, ez = p[2], foot = p[1], zones = closed.filter((z) => inArea(z.area, ex, ez) && (!z.level || (foot >= z.level[0] && foot <= z.level[1])));
    for (const pitch of pitches) for (let k = 0; k < V.holeYaw; k++) {
      const yaw = TAU * (k + 0.5) / V.holeYaw, dy = dsin(pitch * DEG), flat = dcos(pitch * DEG), dx = dsin(yaw) * flat, dz = dcos(yaw) * flat, t = rayHit(bvh, ex, ey, ez, dx, dy, dz, V.holeReach, hit);
      if (hit.slot >= 0 && hit.back) { X.bad(4, 'hole', '눈높이에서 면의 뒷쪽이 보인다(구멍 — 덩이 속이 들여다보이거나 땅 밑이 보인다)', [ex + dx * t, ey + dy * t, ez + dz * t]); continue; }
      if (hit.slot < 0 && dy < 0 && (ey - world.sea) / -dy > V.holeReach) X.bad(4, 'hole', '아래를 향한 광선이 아무것에도 맞지 않는다(구멍)', [ex, ey, ez]);
      // 닫힌 구역(실내 · 동굴): 맞기 전에 구역 밖으로 나가면 새는 것이다 — 선언된 출입구(문 표식)를 지나는 것만 봐준다
      for (const zone of zones) {
        let far = 0;
        while (far < t && inArea(zone.area, ex + dx * far, ez + dz * far)) far += V.zoneStep;
        if (far >= t && hit.slot >= 0) continue;
        const lx = ex + dx * far, lz = ez + dz * far, exits = (zone.exits || []).map((id) => M.doors.find((door) => door.id === id));
        if (!exits.some((door) => door && (lx - door.at[0]) * (lx - door.at[0]) + (lz - door.at[2]) * (lz - door.at[2]) <= (door.width / 2 + V.exitPad) * (door.width / 2 + V.exitPad))) {
          X.bad(4, 'hole', '닫힌 구역(실내 · 동굴)에서 광선이 선언된 출입구 밖으로 샌다(구멍)', [lx, ey + dy * far, lz]);
        }
      }
    }
  }
  for (let k = 0; k < C.n; k++) if (!fits(X, C.span[k])) X.bad(5, 'fit', '엄폐 점에 캡슐이 들어가지 않는다(벽 속 엄폐 점)', Array.from(C.pos.subarray(k * 3, k * 3 + 3)));
  X.spans.forEach((s, k) => { if (s >= 0 && !fits(X, s)) X.bad(5, 'fit', `${X.marks[k][0]} 에 캡슐이 들어가지 않는다`, X.marks[k][1]); });
}

// ---- 6 맞닿은 조각: 조각(임자 2 이상)의 충돌 꼭짓점마다 수직선을 세워, 땅속(위로 지형 면이 홀수 번)이거나 다른 덩이 속(그 임자의 면이 위로 홀수 번)이면 그 깊이를 잰다.
//   조각마다 가장 깊은 값이 embedMin 에 못 미치면 맞닿았거나 떠 있는 것이다. 조각끼리는 서로 닿았는데(속에 든 꼭짓점이 있는데) 얕으면 걸린다.
//   땅에 얹는 소품(키트의 loose — 상자 · 드럼통 · 보트)은 박지 않는다: 어디에도 닿지 않고 떠 있거나, **한쪽이 떠 있으면** 걸린다 — 소품을 위에서 보아 넷으로 나눈
//   (테두리 상자의 가운데 기준) 구역마다 「밑의 면(다른 임자의 것)에서 가장 덜 뜬 꼭짓점」의 높이를 재어, 어느 구역이든 그 값이 looseGap 을 넘으면 그쪽이 뜬 것이다.
//   조각의 이름은 세계의 kit(조각 이름 목록)에서 읽는다(레시피 없이도 안다).
function seams(X) {
  const { world, bvh, V } = X, C = world.collide, names = world.kit || [], loose = (k) => !!(PIECES[names[k - 2]] && PIECES[names[k - 2]].loose);
  const H = [], deep = new Map(), pair = new Map(), where = new Map(), done = new Set(), up = new Map(), near = new Map(), box = new Map(), quad = new Map();
  // 얹는 소품의 테두리 상자(가로) — 구역을 나눌 가운데
  for (let t = 0; t < C.owner.length; t++) {
    const k = C.owner[t];
    if (!loose(k)) continue;
    if (!box.has(k)) { box.set(k, [Infinity, -Infinity, Infinity, -Infinity]); quad.set(k, [Infinity, Infinity, Infinity, Infinity, null, null, null, null]); }
    for (let e = 0; e < 3; e++) {
      const v = C.idx[t * 3 + e] * 3, b = box.get(k);
      b[0] = Math.min(b[0], C.pos[v]); b[1] = Math.max(b[1], C.pos[v]); b[2] = Math.min(b[2], C.pos[v + 2]); b[3] = Math.max(b[3], C.pos[v + 2]);
    }
  }
  for (let t = 0; t < C.owner.length; t++) {
    const k = C.owner[t];
    if (k < 2) continue;
    if (!deep.has(k)) deep.set(k, -Infinity);
    for (let e = 0; e < 3; e++) {
      const v = C.idx[t * 3 + e];
      if (done.has(v)) continue;
      done.add(v);
      const x = C.pos[v * 3], y = C.pos[v * 3 + 1], z = C.pos[v * 3 + 2], n = column(bvh, x, z, H);
      let under = -Infinity, inside = false;
      up.clear(); near.clear();
      for (let i = 0; i < n; i++) {
        const o = C.owner[bvh.order[H[i * 3 + 2]]], gap = Math.abs(H[i * 3] - y);
        if (o === k) continue;
        if (H[i * 3] > y) up.set(o, (up.get(o) || 0) + 1); else if (H[i * 3] > under) under = H[i * 3];
        if (!near.has(o) || gap < near.get(o)) near.set(o, gap);
      }
      for (const [o, crossings] of up) {
        if (!(crossings & 1)) continue;
        const depth = near.get(o);
        inside = true;
        if (depth > deep.get(k)) { deep.set(k, depth); where.set(k, [x, y, z]); }
        if (o >= 2) { const key = Math.min(o, k) + ':' + Math.max(o, k); if (!(pair.get(key) >= depth)) pair.set(key, depth); }
      }
      if (!where.has(k)) where.set(k, [x, y, z]);
      if (box.has(k)) {
        const b = box.get(k), q = quad.get(k), part = (x > (b[0] + b[1]) / 2 ? 1 : 0) + (z > (b[2] + b[3]) / 2 ? 2 : 0), gap = inside ? 0 : y - under;
        if (gap < q[part]) { q[part] = gap; q[4 + part] = [x, y, z]; }
      }
    }
  }
  const name = (k) => `kit[${k - 2}]${names[k - 2] ? '(' + names[k - 2] + ')' : ''}`;
  // 소품 k 의 가장 뜬 구역: [뜬 높이, 그 자리] (꼭짓점이 없는 구역은 빼고)
  const float = (k) => { const q = quad.get(k); let worst = 0; for (let i = 1; i < 4; i++) if (q[4 + i] && (!q[4 + worst] || q[i] > q[worst])) worst = i; return [q[worst], q[4 + worst]]; };
  for (const [k, depth] of deep) {
    const how = depth > 0 ? round(depth) + 'm 만 박혔다' : '박히지 않았다(맞닿았거나 떠 있다)', rule = loose(k) ? '얹는 소품도 땅에 닿아야 한다' : V.embedMin + 'm 넘게 겹쳐 박는다';
    if (loose(k) ? depth <= 0 : depth < V.embedMin) X.bad(6, 'seam', `${name(k)} 이(가) 땅 · 다른 덩이에 ${how} — ${rule}`, where.get(k));
    else if (loose(k) && float(k)[0] > V.looseGap) {
      const gap = float(k)[0] < 1e9 ? round(float(k)[0]) + 'm' : '허공에';
      X.bad(6, 'seam', `${name(k)} 의 한쪽이 ${gap} 떴다 — 얹는 소품은 밑바닥이 다 땅에 닿아야 한다(${V.looseGap}m 까지 봐준다)`, float(k)[1]);
    }
  }
  for (const [key, depth] of pair) {
    const [a, b] = key.split(':').map(Number);
    if (depth < V.embedMin && !loose(a) && !loose(b)) X.bad(6, 'seam', `${name(a)} 와(과) ${name(b)} 이(가) 맞닿았다(겹침 ${round(depth)}m) — ${V.embedMin}m 넘게 겹치거나 떼어 놓는다`, where.get(a));
  }
}

// 조각 묶음의 면: 모서리가 kit.maxEdge 이하(빛을 받는 큰 면은 쪼갠다) · 꼭짓점 법선이 면 법선에서 creaseMax 넘게 벗어나지 않는다(꺾인 모서리는 나눈다)
function faces(X, b, k) {
  const cosCrease = dcos(X.V.creaseMax * DEG), edge2 = WORLD.kit.maxEdge * WORLD.kit.maxEdge * 1.05, P = b.pos;
  for (let t = 0; t < b.idx.length; t += 3) {
    const i0 = b.idx[t] * 3, i1 = b.idx[t + 1] * 3, i2 = b.idx[t + 2] * 3, ux = P[i1] - P[i0], uy = P[i1 + 1] - P[i0 + 1], uz = P[i1 + 2] - P[i0 + 2], vx = P[i2] - P[i0], vy = P[i2 + 1] - P[i0 + 1], vz = P[i2 + 2] - P[i0 + 2];
    const wx = vx - ux, wy = vy - uy, wz = vz - uz, fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx, fl = Math.sqrt(fx * fx + fy * fy + fz * fz);
    if (Math.max(ux * ux + uy * uy + uz * uz, vx * vx + vy * vy + vz * vz, wx * wx + wy * wy + wz * wz) > edge2) X.bad(7, 'light', `묶음 ${k}(${b.mat})에 모서리가 ${WORLD.kit.maxEdge}m 를 넘는 면이 있다 — 꼭짓점 빛이 번진다`, [P[i0], P[i0 + 1], P[i0 + 2]]);
    for (const i of [i0, i1, i2]) if (fl > 1e-9 && (fx * b.nor[i] + fy * b.nor[i + 1] + fz * b.nor[i + 2]) / fl < cosCrease) X.bad(7, 'crease', `묶음 ${k}(${b.mat})의 꼭짓점 법선이 면에서 ${X.V.creaseMax}° 넘게 벗어난다 — 꺾인 모서리에서 꼭짓점을 나눈다`, [P[i], P[i + 1], P[i + 2]]);
  }
}

// ---- 7 꼭짓점 빛 규칙 + 예산
function lights(X) {
  const { world, baked, V } = X, st = world.stats, B = WORLD.budget, L = BAKE.light, floor = Math.round(L.floor * 255);
  world.marks.targets.forEach((t, i) => {
    if (t.light >= 0 && world.lights[t.light].mode !== 'break') X.bad(7, 'light', `과녁 ${i}(${t.kind})의 등불이 '${world.lights[t.light].mode}' 다 — 깨지는 등불이 「늘 켜진 빛」으로 구워진다(깨도 바닥이 계속 밝다)`, t.at);
  });
  // 구운 「늘 켜진 빛」을 다시 잰다: 깨질 수 없고 스위치도 아닌 등불만으로 잰 값과 같아야 한다(다른 등불이 섞여 구워지면 다르다).
  //   같은 꼭짓점에서 스위치 묶음도 다시 재어, 둘째로 큰 묶음의 세기가 switchSecond 를 넘는 꼭짓점을 센다(알림 — 그 꼭짓점에는 큰 묶음 하나만 구워진다).
  const S = lightSetup(world), fixed = new Set(world.marks.targets.map((t) => t.light)), want = new Uint8Array(4);
  S.bvh = baked.bvh; S.on = world.lights.filter((l, i) => l.mode === 'on' && !fixed.has(i));
  X.notes.switchOverlap = 0; X.notes.switchChecked = 0;
  world.batches.forEach((b, k) => {
    const data = baked.vlight[k];
    if (!data || data.length !== b.pos.length / 3 * VLIGHT) { X.bad(7, 'light', `묶음 ${k}(${b.mat})의 꼭짓점 빛이 꼭짓점 수 × ${VLIGHT} 바이트가 아니다`, null); return; }
    for (let v = 0; v < b.pos.length / 3; v++) {
      if (data[v * VLIGHT] < floor) X.bad(7, 'light', '하늘 열림이 바닥 값보다 어둡다(완전 검정)', Array.from(b.pos.subarray(v * 3, v * 3 + 3)));
      if (v % V.lampCheck) continue;
      const nx = b.nor[v * 3], ny = b.nor[v * 3 + 1], nz = b.nor[v * 3 + 2], ox = b.pos[v * 3] + nx * L.bias, oy = b.pos[v * 3 + 1] + ny * L.bias, oz = b.pos[v * 3 + 2] + nz * L.bias;
      lampBytes(S, want, 0, ox, oy, oz, nx, ny, nz, 0);
      if (want[1] !== data[v * VLIGHT + 1] || want[2] !== data[v * VLIGHT + 2] || want[3] !== data[v * VLIGHT + 3]) {
        X.bad(7, 'light', '「늘 켜진 빛」에 깨지는 · 스위치 등불의 빛이 섞여 구워졌다(끄거나 깨도 바닥이 계속 밝다)', Array.from(b.pos.subarray(v * 3, v * 3 + 3)));
      }
      const best = switchSums(S, ox, oy, oz, nx, ny, nz);
      X.notes.switchChecked++;
      for (let g = 0; g < S.sum.length; g++) if (g !== best && S.sum[g] * L.lampGain >= V.switchSecond) { X.notes.switchOverlap++; break; }
    }
    if (b.mat !== 'ground' && b.mat !== 'rock') faces(X, b, k);
  });
  world.instances.forEach((g, k) => { if (!baked.ilight[k] || baked.ilight[k].length !== g.xf.length / 8 * PLIGHT) X.bad(7, 'light', `인스턴스 ${k} 의 빛이 줄 수 × ${PLIGHT} 바이트가 아니다`, null); });
  const calls = world.batches.length + world.instances.filter((g) => g.xf.length).length + st.propParts;
  for (const [key, value, limit] of [['tris', st.drawTris, B.tris], ['verts', st.verts, B.verts], ['instances', st.instances, B.instances], ['collideTris', st.collideTris, B.collideTris], ['calls', calls, BAKE.budget.calls]]) {
    if (value > limit) X.bad(7, 'budget', `예산 초과 ${key}: ${value} > ${limit}`, null);
  }
}

export function verify(world, baked, recipe) {
  const problems = [], counts = {}, notes = {};
  const bad = (check, code, msg, at) => { counts[code] = (counts[code] || 0) + 1; if (counts[code] <= KEEP) problems.push({ check, code, msg, at: at ? at.map(round) : null }); };
  const X = { world, baked, recipe, nav: baked.nav, bvh: baked.bvh, M: world.marks, V: BAKE.verify, N: BAKE.nav, bad, notes, p: [0, 0, 0], hit: { slot: -1, back: false }, home: -1, marks: [], spans: [], seen: null, samples: 0, edgeSamples: 0 };
  marks(X);
  recipeAndCover(X);
  doors(X);
  edges(X);
  holes(X);
  seams(X);
  lights(X);
  notes.edgeSamples = X.edgeSamples;
  return { problems, counts, notes, reached: X.seen.reduce((sum, v) => sum + v, 0), samples: X.samples };
}
