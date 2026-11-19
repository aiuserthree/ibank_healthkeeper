// 주는 것: checkRecipe(레시피) → 문제 목록 [{ code, msg }](비어 있으면 통과). 생성(world.js)은 문제가 하나라도 있으면 만들지 않고 예외를 낸다.
//   code: shape 꼴이 틀림 · op 모르는 지형 도장 · piece 모르는 조각 · 흩기 · outside 세계 밖의 표식 · 조각 · 등불 · overlap 겹친 표식 · lit 등불 표시 빠짐 · 틀림
// 받는 것: terrain(OPS) · kit(PIECES · LIT) · tune/world. 레시피의 형식(일반 객체 하나 — tdd §4-2):
//   { id, size: [가로, 세로](m · 정수 · 가운데가 원점), seed, sea(해수면 높이), sky,
//     terrain: [{ op: 'base', coast: 'south', shore: 물가의 z, cliff: { line: [[x, z], …](x 가 커지는 차례), height, strata } },
//               { op: 'flatten' | 'raise' | 'carve' | 'terrace', area, to | by | step, blend }, { op: 'path', line, width, blend },
//               { op: 'push', amount, cell }, { op: 'crack', dark }],
//     scatter: [{ what: 'rocks', region: 띠 이름, n, size: [작은, 큰] }],
//     kit: [{ piece, at: [x, z] | line: [[x, z], …], rot(도), up, on: 'top'(밑에 있는 것 위에), lit, target(과녁), … }],
//     lights: [{ at: [x, z], up, lit, color, radius }], zones: [], marks: { spawn: [x, z, 요(도)], stations: { 이름: [x, z, 요, 피치] }, points: { 이름: [x, z] } } }
// 좌표를 손으로 적는 것은 「큰 것의 자리」뿐이고 높이는 땅에서 잡는다. 겹친 표식 = 같은 종류끼리 markGap 보다 가깝다(시작 자리와 책갈피는 겹쳐도 된다).
import { OPS } from './terrain.js';
import { PIECES, LIT } from './kit.js';
import { WORLD } from '../tune/world.js';

const own = (table, key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(table, key);
const num = (v) => typeof v === 'number' && v === v;
const point = (p) => Array.isArray(p) && p.length >= 2 && num(p[0]) && num(p[1]);
const points = (list, min) => Array.isArray(list) && list.length >= min && list.every(point);
const AREA_OPS = Object.freeze({ flatten: null, raise: 'by', carve: 'by', terrace: 'step' });

function checkOp(op, i, bad) {
  const at = `terrain[${i}]`;
  if (!op || !OPS.includes(op.op)) { bad('op', `${at}: 모르는 지형 도장 ${op && op.op}`); return; }
  if (op.op === 'base') {
    const c = op.cliff, rising = c && points(c.line, 2) && c.line.every((p, k) => k === 0 || p[0] > c.line[k - 1][0]);
    if (op.coast !== 'south' || !num(op.shore) || !rising || !num(c.height) || !num(c.strata)) bad('shape', `${at}: base 는 coast 'south' · shore · cliff { line(x 가 커지는 차례) · height · strata }`);
  } else if (own(AREA_OPS, op.op)) {
    const a = op.area, shaped = Array.isArray(a) && ((a[0] === 'circle' && a.length === 4) || (a[0] === 'box' && a.length === 5)) && a.slice(1).every(num);
    if (!shaped || (AREA_OPS[op.op] && !num(op[AREA_OPS[op.op]]))) bad('shape', `${at}: ${op.op} 는 area(['circle', x, z, r] · ['box', x0, z0, x1, z1])` + (AREA_OPS[op.op] ? ' · ' + AREA_OPS[op.op] : ''));
  } else if (op.op === 'path' && !(points(op.line, 2) && num(op.width))) bad('shape', `${at}: path 는 line(점 둘 이상) · width`);
  else if (op.op === 'push' && !num(op.amount)) bad('shape', `${at}: push 는 amount`);
  else if (op.op === 'crack' && !num(op.dark)) bad('shape', `${at}: crack 은 dark`);
}

export function checkRecipe(r) {
  const out = [], bad = (code, msg) => out.push({ code, msg });
  const sized = r && Array.isArray(r.size) && r.size.length === 2 && r.size.every((v) => Number.isInteger(v) && v > 0);
  if (!sized || typeof r.id !== 'string' || !Number.isInteger(r.seed) || !num(r.sea) || !Array.isArray(r.terrain) || !Array.isArray(r.kit) || !r.marks) {
    bad('shape', '레시피에는 id · size [가로, 세로](정수) · seed(정수) · sea · terrain[] · kit[] · marks 가 있어야 한다');
    return out;
  }
  const hw = r.size[0] / 2 - WORLD.edge, hd = r.size[1] / 2 - WORLD.edge, inside = (p) => Math.abs(p[0]) <= hw && Math.abs(p[1]) <= hd;
  r.terrain.forEach((op, i) => checkOp(op, i, bad));
  if (!r.terrain.length || !r.terrain[0] || r.terrain[0].op !== 'base') bad('shape', 'terrain 의 첫 도장은 base 여야 한다');
  (r.scatter || []).forEach((s, i) => {
    if (!s || s.what !== 'rocks' || !own(WORLD.band, s.region)) bad('piece', `scatter[${i}]: 모르는 흩기 ${s && s.what} · ${s && s.region}`);
    else if (!Number.isInteger(s.n) || !points([s.size], 1)) bad('shape', `scatter[${i}]: n(정수) · size [작은, 큰]`);
  });
  // 등불: 표시가 꼴에 맞아야 하고, 한 묶음을 「대본 스위치」와 「깨지는 등불」이 같이 쓰면 안 된다
  const groups = { switch: [], break: [] }, physical = [];
  const lit = (it, at) => {
    if (typeof it.lit !== 'string' || !LIT.test(it.lit)) { bad('lit', `${at}: 등불 표시(lit)가 없거나 틀리다 — 'on' · 'switch:0~7' · 'break:0~7'`); return; }
    const [mode, group] = it.lit.split(':');
    if (mode !== 'on') groups[mode].push(group);
    if (it.color != null && it.color !== 'warm') bad('shape', `${at}: 모르는 등불 색 ${it.color}`);
  };
  r.kit.forEach((it, i) => {
    const at = `kit[${i}]`;
    if (!it || !own(PIECES, it.piece)) { bad('piece', `${at}: 모르는 조각 ${it && it.piece}`); return; }
    const def = PIECES[it.piece], pts = def.line ? it.line : [it.at];
    if (!points(pts, def.line ? 2 : 1)) bad('shape', `${at}(${it.piece}): ${def.line ? 'line(점 둘 이상)' : 'at [x, z]'} 이 있어야 한다`);
    else if (!pts.every(inside)) bad('outside', `${at}(${it.piece}): 세계 밖에 놓였다`);
    else if (it.target) physical.push([`${at}(${it.piece} 과녁)`, it.at]);
    if (def.lamp) lit(it, `${at}(${it.piece})`);
    if (it.target && def.aim == null) bad('piece', `${at}: ${it.piece} 은(는) 과녁이 될 수 없다`);
  });
  (r.lights || []).forEach((it, i) => {
    if (!it || !point(it.at)) bad('shape', `lights[${i}]: at [x, z] 이 있어야 한다`); else if (!inside(it.at)) bad('outside', `lights[${i}]: 세계 밖에 놓였다`);
    if (it) lit(it, `lights[${i}]`);
  });
  for (const g of groups.break) if (groups.switch.includes(g)) bad('lit', `스위치 묶음 ${g} 을(를) 대본 스위치와 깨지는 등불이 같이 쓴다`);
  // 표식: 전부 세계 안에, 같은 종류끼리는 markGap 보다 떨어져 있어야 한다
  const m = r.marks, cams = Object.entries(m.stations || {}).map(([k, v]) => ['책갈피 ' + k, v]);
  physical.unshift(['시작 자리', m.spawn], ...Object.entries(m.points || {}).map(([k, v]) => ['표식 ' + k, v]));
  for (const list of [physical, cams]) {
    for (let i = 0; i < list.length; i++) {
      const [name, p] = list[i];
      if (!point(p)) { bad('shape', `${name}: [x, z, …] 꼴이 아니다`); continue; }
      if (!inside(p)) bad('outside', `${name}: 세계 밖의 표식 [${p[0]}, ${p[1]}]`);
      for (let j = 0; j < i; j++) {
        const q = list[j][1];
        if (point(q) && (p[0] - q[0]) * (p[0] - q[0]) + (p[1] - q[1]) * (p[1] - q[1]) < WORLD.markGap * WORLD.markGap) bad('overlap', `${name} 이(가) ${list[j][0]} 와(과) 겹친다`);
      }
    }
  }
  return out;
}
