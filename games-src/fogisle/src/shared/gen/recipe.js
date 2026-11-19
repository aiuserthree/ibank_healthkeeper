// 주는 것: checkRecipe(레시피) → 문제 목록 [{ code, msg }](비어 있으면 통과). 생성(world.js)은 문제가 하나라도 있으면 만들지 않고 예외를 낸다.
//   code: shape 꼴이 틀림(수 칸에 수가 아닌 것 · 겹친 점이 있는 선 포함) · range 수가 범위 밖(tune 의 world.range · 조각 치수는 kit.js 의 PIECES.opt) ·
//         op 모르는 지형 도장 · piece 모르는 조각 · 흩기 · outside 세계 밖의 표식 · 조각 · 등불 · 뻗는 조각(부두)의 끝 · overlap 겹친 표식 · 같은 자리의 같은 조각 ·
//         lit 등불 표시 빠짐 · 틀림 · 묶음을 겹쳐 씀 (+ water 시작 자리가 물속 — 땅을 만든 뒤에야 알 수 있어 world.js 의 마무리가 낸다)
// 받는 것: terrain(OPS) · kit(PIECES · LIT · optOf) · dmath · tune/world. 레시피의 형식(일반 객체 하나 — tdd §4-2):
//   { id, size: [가로, 세로](m · 정수 · 가운데가 원점), seed, sea(해수면 높이), sky,
//     terrain: [{ op: 'base', coast: 'south', shore: 물가의 z, cliff: { line: [[x, z], …](x 가 커지는 차례), height, strata } },
//               { op: 'flatten' | 'raise' | 'carve' | 'terrace', area, to | by | step, blend }, { op: 'path', line, width, blend },
//               { op: 'push', amount, cell }, { op: 'crack', dark }],
//     scatter: [{ what: 'rocks', region: 띠 이름, n, size: [작은, 큰] }],
//     kit: [{ piece, at: [x, z] | line: [[x, z], …], rot(도), up, on: 'top'(밑에 있는 것 위에), lit, target(과녁), 조각의 치수(height · length …) }],
//     lights: [{ at: [x, z], up, lit, color, radius }], zones: [{ area, level: [아래, 위](높이 범위 — 없으면 전부), enclosed(실내 · 동굴 — 구멍 광선이 밖으로 새면 안 된다), exits: [문 이름], fight(교전 구역 — 엄폐 분포를 본다) }],
//     marks: { spawn: [x, z, 요(도)], stations: { 이름: [x, z, 요, 피치] }, points: { 이름: [x, z] }, doors: { 이름: [x, z, 요(문을 지나는 쪽), 폭] } } }
//   표식은 설 수 있는 가장 낮은 바닥에 선다. 끝에 'top' 을 적으면 가장 높은 바닥이다(부두 위의 책갈피: [x, z, 요, 피치, 'top']).
// 좌표를 손으로 적는 것은 「큰 것의 자리」뿐이고 높이는 땅에서 잡는다. 겹친 표식 = 같은 종류끼리 markGap 보다 가깝다(시작 자리와 책갈피는 겹쳐도 된다).
// 수 칸은 전부 「유한한 수 + 범위」를 본다 — 틀린 수(0 인 단 높이 · 글자 · NaN)는 높이나 좌표를 NaN 으로 만들어 생성을 끝나지 않게 한다.
//   절벽 선 · 영역 · 길의 좌표는 range.coord, 길 점의 높이는 range.level 안이어야 한다(조각 · 표식의 좌표는 「세계 안」이 범위다).
// 등불: 과녁인 등불 = 'break:N'(묶음 하나에 등불 하나) · 그 밖의 등불 = 'on' · 'switch:N'. 대본 스위치와 깨지는 등불은 묶음을 같이 쓰지 못한다.
import { PI, dsin, dcos } from '../dmath.js';
import { OPS } from './terrain.js';
import { PIECES, LIT, optOf } from './kit.js';
import { WORLD } from '../tune/world.js';

const own = (table, key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(table, key);
const fin = (v) => typeof v === 'number' && v - v === 0;
const point = (p) => Array.isArray(p) && p.length >= 2 && fin(p[0]) && fin(p[1]);
// 표식의 수 칸 i: 끝의 'top'(층 고르기)은 수 칸이 아니다
const markNum = (p, i) => (i === p.length - 1 && p[i] === 'top' ? undefined : p[i]);
const points = (list, min) => Array.isArray(list) && list.length >= min && list.every(point);
// 이웃한 두 점이 같은 자리면 길이 0 인 마디가 생긴다(0 으로 나눈다)
const apart = (line) => line.every((p, k) => k === 0 || p[0] !== line[k - 1][0] || p[1] !== line[k - 1][1]);
const area = (a) => Array.isArray(a) && a.slice(1).every(fin) && ((a[0] === 'circle' && a.length === 4 && a[3] > 0) || (a[0] === 'box' && a.length === 5 && a[3] > a[1] && a[4] > a[2]));
const within = (list, lim) => list.every((v) => v >= lim[0] && v <= lim[1]);
// 도장마다의 수 칸: [이름, 범위 이름(tune 의 world.range), 꼭 있어야 하는가]
const OP_NUMS = Object.freeze({
  base: [['shore', 'coord', true]], flatten: [['to', 'level', false], ['blend', 'blend', false]], raise: [['by', 'by', true], ['blend', 'blend', false]],
  carve: [['by', 'by', true], ['blend', 'blend', false]], terrace: [['step', 'step', true], ['blend', 'blend', false]],
  path: [['width', 'width', true], ['blend', 'blend', false]], push: [['amount', 'amount', true], ['cell', 'cell', false]], crack: [['dark', 'dark', true]],
});

// 수 칸 하나: 없어도 되는 칸(need 가 거짓)은 비어 있으면 통과. 유한한 수가 아니면 shape, 범위 [작은, 큰] 밖이면 range.
function numAt(bad, at, obj, key, lim, need) {
  const v = obj[key];
  if (v == null && !need) return;
  if (!fin(v)) bad('shape', `${at}: ${key} 은(는) 유한한 수여야 한다 — ${String(v)}`);
  else if (v < lim[0] || v > lim[1]) bad('range', `${at}: ${key} = ${v} 은(는) ${lim[0]} ~ ${lim[1]} 안이어야 한다`);
}

function checkOp(op, i, bad) {
  const at = `terrain[${i}]`, R = WORLD.range;
  if (!op || !OPS.includes(op.op)) { bad('op', `${at}: 모르는 지형 도장 ${op && op.op}`); return; }
  if (op.op === 'base') {
    const c = op.cliff || {}, rising = points(c.line, 2) && c.line.every((p, k) => k === 0 || p[0] > c.line[k - 1][0]);
    if (op.coast !== 'south' || !rising) bad('shape', `${at}: base 는 coast 'south' · cliff { line(x 가 커지는 차례의 점 둘 이상) · height · strata }`);
    else if (!within(c.line.flat(), R.coord)) bad('range', `${at}: 절벽 선의 좌표는 ${R.coord[0]} ~ ${R.coord[1]} 안이어야 한다`);
    numAt(bad, at + '.cliff', c, 'height', R.cliff, true); numAt(bad, at + '.cliff', c, 'strata', R.strata, true);
  } else if (op.op === 'path') {
    const lined = points(op.line, 2) && apart(op.line) && op.line.every((p) => p.length < 3 || fin(p[2]));
    if (!lined) bad('shape', `${at}: path 는 line(겹치지 않는 점 둘 이상 — [x, z] 또는 [x, z, 높이])`);
    else if (!within(op.line.flatMap((p) => p.slice(0, 2)), R.coord) || !within(op.line.filter((p) => p.length > 2).map((p) => p[2]), R.level)) bad('range', `${at}: 길의 좌표 · 높이가 범위 밖이다`);
  } else if (op.op !== 'push' && op.op !== 'crack') {
    if (!area(op.area)) bad('shape', `${at}: ${op.op} 는 area(['circle', x, z, 반지름] · ['box', x0, z0, x1, z1] — 반지름 · 변은 0 보다 크게)`);
    else if (!within(op.area.slice(1), R.coord)) bad('range', `${at}: 영역의 좌표 · 반지름은 ${R.coord[0]} ~ ${R.coord[1]} 안이어야 한다`);
  }
  for (const [key, lim, need] of OP_NUMS[op.op]) numAt(bad, at, op, key, R[lim], need);
}

export function checkRecipe(r) {
  const out = [], bad = (code, msg) => out.push({ code, msg }), R = WORLD.range;
  const sized = r && Array.isArray(r.size) && r.size.length === 2 && r.size.every((v) => Number.isInteger(v) && v > 0);
  if (!sized || typeof r.id !== 'string' || !Number.isInteger(r.seed) || !fin(r.sea) || !Array.isArray(r.terrain) || !Array.isArray(r.kit) || !r.marks) {
    bad('shape', '레시피에는 id · size [가로, 세로](정수) · seed(정수) · sea · terrain[] · kit[] · marks 가 있어야 한다');
    return out;
  }
  numAt(bad, '레시피', r.size, 0, R.size, true); numAt(bad, '레시피', r.size, 1, R.size, true); numAt(bad, '레시피', r, 'sea', R.level, true);
  if (out.length) return out;
  const hw = r.size[0] / 2 - WORLD.edge, hd = r.size[1] / 2 - WORLD.edge, inside = (p) => Math.abs(p[0]) <= hw && Math.abs(p[1]) <= hd;
  r.terrain.forEach((op, i) => checkOp(op, i, bad));
  if (!r.terrain.length || !r.terrain[0] || r.terrain[0].op !== 'base') bad('shape', 'terrain 의 첫 도장은 base 여야 한다');
  (r.scatter || []).forEach((s, i) => {
    const at = `scatter[${i}]`;
    if (!s || s.what !== 'rocks' || !own(WORLD.band, s.region)) { bad('piece', `${at}: 모르는 흩기 ${s && s.what} · ${s && s.region}`); return; }
    if (!Number.isInteger(s.n) || !Array.isArray(s.size) || s.size.length !== 2 || !(s.size[0] <= s.size[1])) bad('shape', `${at}: n(정수) · size [작은, 큰]`);
    else { numAt(bad, at, s, 'n', R.count, true); numAt(bad, at + '.size', s.size, 0, R.rock, true); numAt(bad, at + '.size', s.size, 1, R.rock, true); }
  });
  // 등불: 표시가 꼴에 맞아야 한다. breakable = 깨질 수 있는 등불(과녁)인가 — 과녁은 'break' 만, 그 밖은 'on' · 'switch' 만
  const groups = { switch: [], break: [] }, physical = [], spots = [];
  const lit = (it, at, breakable) => {
    const [mode, group] = typeof it.lit === 'string' && LIT.test(it.lit) ? it.lit.split(':') : [];
    if (!mode || (group != null && Number(group) >= WORLD.lit.groups)) bad('lit', `${at}: 등불 표시(lit)가 없거나 틀리다 — 'on' · 'switch:N' · 'break:N'(N 은 0 ~ ${WORLD.lit.groups - 1})`);
    else if (breakable && mode !== 'break') bad('lit', `${at}: 과녁인 등불은 'break:N' 이어야 한다 — '${it.lit}' 로는 깨뜨려도 바닥의 빛이 안 꺼진다`);
    else if (!breakable && mode === 'break') bad('lit', `${at}: 깨질 수 없는 등불에 '${it.lit}' 을(를) 적었다 — 'on' · 'switch:N' 만 된다`);
    else if (mode !== 'on') groups[mode].push(group);
    if (it.color != null && it.color !== 'warm') bad('shape', `${at}: 모르는 등불 색 ${it.color}`);
    numAt(bad, at, it, 'radius', R.radius, false);
  };
  r.kit.forEach((it, i) => {
    if (!it || !own(PIECES, it.piece)) { bad('piece', `kit[${i}]: 모르는 조각 ${it && it.piece}`); return; }
    const def = PIECES[it.piece], pts = def.line ? it.line : [it.at], at = `kit[${i}](${it.piece})`, before = out.length;
    numAt(bad, at, it, 'rot', R.turn, false); numAt(bad, at, it, 'lean', R.lean, false); numAt(bad, at, it, 'up', R.up, false);
    for (const key of Object.keys(def.opt)) numAt(bad, at, it, key, def.opt[key].slice(1), false);
    if (it.on != null && it.on !== 'top') bad('shape', `${at}: on 은 'top' 만 된다`);
    if (!points(pts, def.line ? 2 : 1) || !apart(pts)) bad('shape', `${at}: ${def.line ? 'line(겹치지 않는 점 둘 이상)' : 'at [x, z]'} 이 있어야 한다`);
    else if (!pts.every(inside)) bad('outside', `${at}: 세계 밖에 놓였다`);
    else if (def.reach && out.length === before) {
      // 뻗는 조각(부두)은 뻗은 끝도 세계 안이어야 한다
      const yaw = (it.rot || 0) * PI / 180, len = optOf(it, def.reach);
      if (!inside([it.at[0] + dsin(yaw) * len, it.at[1] + dcos(yaw) * len])) bad('outside', `${at}: 뻗은 끝(${def.reach} ${len}m)이 세계 밖이다`);
    }
    // 같은 조각을 같은 자리(선 조각은 같은 첫 점)에 둘 놓으면 둘의 난수 씨앗이 같아 생김새가 똑같이 겹친다
    const spot = points(pts, 1) ? it.piece + ':' + pts[0][0] + ',' + pts[0][1] : '';
    if (spot && spots.includes(spot)) bad('overlap', `${at}: 같은 조각이 같은 자리에 또 있다`);
    spots.push(spot);
    if (it.target && def.aim == null) bad('piece', `${at}: 과녁이 될 수 없는 조각이다`);
    else if (it.target && point(it.at) && inside(it.at)) physical.push([`${at} 과녁`, it.at]);
    if (def.lamp) lit(it, at, !!it.target);
  });
  (r.lights || []).forEach((it, i) => {
    if (!it || !point(it.at)) bad('shape', `lights[${i}]: at [x, z] 이 있어야 한다`); else if (!inside(it.at)) bad('outside', `lights[${i}]: 세계 밖에 놓였다`);
    if (it) { numAt(bad, `lights[${i}]`, it, 'up', R.up, false); lit(it, `lights[${i}]`, false); }
  });
  // 스위치 묶음: 깨지는 등불은 묶음 하나에 등불 하나(둘이 같이 쓰면 하나를 깨도 둘의 바닥 빛이 같이 꺼진다) · 대본 스위치와 깨지는 등불은 묶음을 따로 쓴다
  const used = { switch: [...new Set(groups.switch)], break: [...new Set(groups.break)] };
  for (const g of used.break) {
    if (groups.break.indexOf(g) !== groups.break.lastIndexOf(g)) bad('lit', `깨지는 등불의 묶음 ${g} 을(를) 등불 둘이 같이 쓴다`);
    if (used.switch.includes(g)) bad('lit', `스위치 묶음 ${g} 을(를) 대본 스위치와 깨지는 등불이 같이 쓴다`);
  }
  if (used.switch.length > WORLD.lit.script) bad('lit', `대본 스위치 묶음이 ${used.switch.length}개다 — ${WORLD.lit.script}개까지`);
  if (used.break.length > WORLD.lit.breakable) bad('lit', `깨지는 등불 묶음이 ${used.break.length}개다 — ${WORLD.lit.breakable}개까지`);
  // 표식: 전부 세계 안에, 같은 종류끼리는 markGap 보다 떨어져 있어야 한다. 요 · 피치는 적었으면 유한한 수.
  const m = r.marks, cams = Object.entries(m.stations || {}).map(([k, v]) => ['책갈피 ' + k, v]), doors = Object.entries(m.doors || {}).map(([k, v]) => ['문 ' + k, v]);
  physical.unshift(['시작 자리', m.spawn], ...Object.entries(m.points || {}).map(([k, v]) => ['표식 ' + k, v]));
  for (const [name, p] of doors) if (point(p)) numAt(bad, name, { 3: markNum(p, 3) }, 3, R.width, false);
  // 구역: 영역이 꼴에 맞고, 출입구(exits)는 있는 문 이름이어야 한다
  (r.zones || []).forEach((z, i) => {
    if (!z || !area(z.area)) bad('shape', `zones[${i}]: area(['circle', x, z, 반지름] · ['box', x0, z0, x1, z1])가 있어야 한다`);
    else if (z.exits != null && !(Array.isArray(z.exits) && z.exits.every((id) => own(m.doors || {}, id)))) bad('shape', `zones[${i}]: exits 는 문 표식(marks.doors)의 이름들이어야 한다`);
    else if (z.level != null && !(Array.isArray(z.level) && z.level.length === 2 && z.level.every(fin) && z.level[0] < z.level[1])) bad('shape', `zones[${i}]: level 은 [아래, 위] 높이여야 한다`);
  });
  for (const list of [physical, cams, doors]) {
    for (let i = 0; i < list.length; i++) {
      const [name, p] = list[i];
      if (!point(p)) { bad('shape', `${name}: [x, z, …] 꼴이 아니다`); continue; }
      if (!inside(p)) bad('outside', `${name}: 세계 밖의 표식 [${p[0]}, ${p[1]}]`);
      const nums = { 2: markNum(p, 2), 3: markNum(p, 3) };
      if (list === doors) numAt(bad, name, nums, 2, R.turn, false);
      else if (list === cams || i === 0) { numAt(bad, name, nums, 2, R.turn, false); numAt(bad, name, nums, 3, R.pitch, false); }
      else if (p.length > 2 && nums[2] !== undefined) bad('shape', `${name}: [x, z] 뒤에는 'top' 만 적을 수 있다`);
      for (let j = 0; j < i; j++) {
        const q = list[j][1];
        if (point(q) && (p[0] - q[0]) * (p[0] - q[0]) + (p[1] - q[1]) * (p[1] - q[1]) < WORLD.markGap * WORLD.markGap) bad('overlap', `${name} 이(가) ${list[j][0]} 와(과) 겹친다`);
      }
    }
  }
  return out;
}
