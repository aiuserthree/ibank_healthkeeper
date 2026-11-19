/* 문구 팡팡(deskpop) — 단계 자료(엔진과 같은 순수 자료, 명세 §5)
 * 1~40 · 새 장애물 첫 단계(41 · 51 · … · 261 · 301)는 손으로 짠 틀, 나머지 41~300 은 씨앗 생성(build(n, 변형)),
 * 301~ 은 genLevel(n) — 번호가 씨앗, 이동 수는 측정으로 맞춘 식(fitMoves).
 * 이동 수는 .claude/work/deskpop/tune.js 가 사람 흉내 봇(시드 40개)으로 재어 MOVES · VARS 에 적는다(손으로 고치지 않음).
 * 자료 크기를 줄이려고 41~300 생성 단계는 「변형 번호 + 이동 수」만 적고 불러올 때 생성기로 펼친다(같은 번호 → 늘 같은 단계).
 * mask: '#' 칸 · '.' 구멍 · 'S' 입구 / place: [종류, r, c, {hp|color|pens|n}] · ['blind', [r0,c0,r1,c1], {color, need}]
 * goals: [['color:k'|'ob:<id>'|'lower'|'duck'|'capsule', N]] / diff: 0 보통 · 1 어려움 · 2 아주 어려움
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DeskLevels = factory();
}(typeof self !== 'undefined' ? self : this, function () {
'use strict';
var COUNT = 300;
// ── 이동 수(tune.js 가 씀) — 11~301단계 한 글자씩: 문자 코드 - 48 = 이동 수(10~45)
var MOVES = '@LEIMJHGAAB>BD@KHHM=?FFJEDA>VAESRRISQKNQBOIQNPMCUM@VWMNK]IU[?LNNFVJGPPCLS\\\\WQG\\]CPQKJSMPOGETQOGPSTNN]QMJHHMLMECPZRMNRHUKLNNIJZKE[T[KKPURMQWGHXGUDNQFNMUOIMOZWLVPGQVVGOUPUO?XRYUDMH]VPNKSM\\\\\\XOROMWIOVD[CJMY]TWNSJXP\\Q]ULWRKSFWR\\O]]QUTQQSLRNLZ[Q][TNPTMBXR?UOQNXSS\\TOPUMSRULNLK[UQJPUYWSLJYTL\\RQ[TC';
// ── 41~300 생성 단계의 변형 번호(부적격이면 씨앗을 바꿔 다시 만든 횟수) — 한 글자씩 36진수
var VARS = '00000000110000000000000000000000000000000000000000000000000000000010001000000000000100000000000000001000000000000000000001010000000000000000000100000001000011001000000000011000000100010010000100001000000101001101010000200101000000010000000000000001000010001000';
// ── 41~300 생성 단계마다 「끝없는 단계 목표 통과 비율」에서 잰 이동 수(끝없는 단계가 바탕으로 씀) — MOVES 와 같은 글자 방식
var ENDM = '00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000H[GV0NQFRPYPKLOYULXSHRUUHNU0UN0XPZ0CNJ0ROLLON]0[YPPQNXJRTC]EMMV0RSNRKYS0P0UMVRLV0WU]N\\]OVRQVSNRPN[ZO00XNPUQ0XU0WRR0ZUW]PTRVQSRUMQMOZYPJNVWTULMSRO0U0]0';
// ── 일의 양 어림 무게(tune.js 의 측정 회귀 — 사람 흉내 봇이 깨는 데 드는 이동, 65번째 백분위). 생성기가 단계마다 일의 양을 고르게 맞출 때 쓴다
var WORK = { a0: 9.3, color: 0.106, box: 0.295, lower: 0.108, cabinet: 0.294, fax: 0.354, paper: 0.185, pens: 0.35, mug: 0.289, weight: 0.566, pot: 2.36, tape: 0.19,
  locker: 1.67, duck: 1.6, folder: 0.7, blind: 1.87, capsule: 1.41, paint: 0.82, brick: 1.5, c4: -11.7 };
function estWork(goals, place, colors) {
  var m = WORK.a0;
  goals.forEach(function (g) { var id = g[0], k = id.indexOf('color:') === 0 ? 'color' : id.replace('ob:', ''); if (k === 'blind') m += WORK.blind * g[1]; else if (!{ box: 1, mug: 1, locker: 1, folder: 1, brick: 1, lower: 1 }[k]) m += (WORK[k] || 0.5) * g[1]; });
  place.forEach(function (p) { var k = p[0], hp = p[3] && p[3].hp; if (k === 'box' || k === 'mug' || k === 'folder' || k === 'brick') m += WORK[k] * (hp || 1); else if (k === 'locker') m += WORK.locker * (hp || 5); else if (k === 'stain') m += WORK.lower * (hp || 1); });
  if (colors === 4) m += WORK.c4;
  return m;
}
// 단계 번호에 따른 일의 양 목표(이동 수 어림) — 번호가 오를수록 고르게 조금씩 많아짐
function workGoal(n) { return 25 + Math.min(1, Math.max(0, (n - 41) / 260)) * 9; }

// 장애물 첫 등장 단계(명세 §4-3)
var FIRST = { box: 1, stain: 4, cabinet: 11, fax: 21, paper: 31, pens: 41, mug: 51, weight: 61, pot: 71, tape: 81, locker: 91, duck: 101, folder: 121, blind: 181, gacha: 231, paint: 261, brick: 301 };
var ORDER = ['box', 'stain', 'cabinet', 'fax', 'paper', 'pens', 'mug', 'weight', 'pot', 'tape', 'locker', 'duck', 'folder', 'blind', 'gacha', 'paint', 'brick'];

function rng(seed) { var s = seed | 0; return function () { s = (s + 0x6D2B79F5) | 0; var t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function rect(kind, r0, c0, r1, c1, o) { var a = []; for (var r = r0; r <= r1; r++) for (var c = c0; c <= c1; c++) a.push([kind, r, c, o || {}]); return a; }
function pts(kind, list, o) { return list.map(function (p) { return [kind, p[0], p[1], p[2] || o || {}]; }); }
// 왼쪽 반의 자리를 가운데 기준으로 거울처럼 오른쪽에도(cols 열 판)
function mir(kind, list, o, cols, w) { var a = []; cols = cols || 9; w = w || 1; list.forEach(function (p) { a.push([kind, p[0], p[1], o || {}]); var m = cols - w - p[1]; if (m !== p[1]) a.push([kind, p[0], m, o || {}]); }); return a; }
function full(cols, rows) { var a = [], s = new Array(cols + 1).join('#'); for (var j = 0; j < rows; j++) a.push(s); return a; }
function cat() { var a = []; for (var i = 0; i < arguments.length; i++) a = a.concat(arguments[i]); return a; }

// ── 판 모양 틀 24가지(우리 것)
var SH = {
  r99: full(9, 9), r910: full(9, 10), r89: full(8, 9), r810: full(8, 10), r79: full(7, 9), r88: full(8, 8),
  diamond: ['...###...', '..#####..', '.#######.', '#########', '#########', '#########', '.#######.', '..#####..', '...###...'],
  oct: ['..#####..', '.#######.', '#########', '#########', '#########', '#########', '#########', '#########', '.#######.', '..#####..'],
  plus: ['..#####..', '..#####..', '..#####..', '#########', '#########', '#########', '#########', '..#####..', '..#####..', '..#####..'],
  heart: ['.###.###.', '#########', '#########', '#########', '#########', '#########', '.#######.', '..#####..', '...###...'],
  hourglass: ['#########', '#########', '#########', '.#######.', '..#####..', '..#####..', '.#######.', '#########', '#########', '#########'],
  donut: ['#########', '#########', '#########', '###...###', '###...###', '###...###', '#########', '#########', '#########'],
  islands: ['####.####', '####.####', '####.####', '####.####', '####.####', '####.####', '####.####', '####.####', '####.####'],
  stairsL: ['#####....', '######...', '#######..', '########.', '#########', '#########', '#########', '#########', '#########', '#########'],
  stairsR: ['....#####', '...######', '..#######', '.########', '#########', '#########', '#########', '#########', '#########', '#########'],
  vee: ['#########', '#########', '#########', '#########', '#########', '#########', '.#######.', '..#####..', '...###...'],
  cup: ['###...###', '###...###', '###...###', '###...###', '#########', '#########', '#########', '#########', '#########', '#########'],
  tee: ['#########', '#########', '#########', '.#######.', '..#####..', '..#####..', '..#####..', '..#####..', '..#####..', '..#####..'],
  arch: ['#########', '#########', '#########', '#########', '#########', '#########', '#########', '###...###', '###...###', '###...###'],
  wave: ['##.###.##', '#########', '#########', '#########', '#########', '#########', '#########', '#########', '#########'],
  frame: ['#########', '#########', '#########', '#########', '.#######.', '.#######.', '#########', '#########', '#########', '#########'],
  bowtie: ['###...###', '###...###', '####.####', '#########', '#########', '#########', '#########', '####.####', '###...###', '###...###'],
  roof: ['....#....', '...###...', '..#####..', '.#######.', '#########', '#########', '#########', '#########', '#########', '#########'],
  dots: ['#########', '#########', '##.###.##', '#########', '#########', '#########', '##.###.##', '#########', '#########']
};
var SHAPES = Object.keys(SH);

// 한 열에 칸 덩어리가 여럿이면(가운데 구멍 밑) 덩어리마다 맨 위 칸을 입구로 — 자료에 'S' 가 이미 있는 열은 그대로
function seg(mask) {
  var m = mask.map(function (row) { return row.split(''); }), rows = m.length, cols = 0, r, c;
  for (r = 0; r < rows; r++) cols = Math.max(cols, m[r].length);
  for (c = 0; c < cols; c++) {
    var tops = [], hasS = false;
    for (r = 0; r < rows; r++) { var ch = m[r][c] || '.'; if (ch === 'S') hasS = true; if (ch !== '.' && (r === 0 || (m[r - 1][c] || '.') === '.')) tops.push(r); }
    if (!hasS && tops.length > 1) tops.forEach(function (t) { m[t][c] = 'S'; });
  }
  return m.map(function (row) { return row.join(''); });
}

// ── 단계 설계 규칙 검사(생성기 · 시험이 같이 씀): 막혀 안 움직이는 것(고정 장애물 · 테이프 · 블라인드 · 구멍 · 판 밖) 밑의 칸이
// 바로 위 · 왼쪽 위 · 오른쪽 위가 모두 막혀 있고 입구도 아니면, 그 칸은 비면 다시 못 채운다. 고정 장애물 칸 자신도 깨지면 빈 칸이 되므로 같이 본다
// (같은 큰 장애물 · 같은 블라인드의 위아래 칸은 한꺼번에 비므로 뺌)
var FIXED = { box: 1, cabinet: [2, 2], fax: 1, pens: [1, 2], weight: 1, pot: [2, 2], locker: [2, 2], folder: 1, gacha: 1, brick: 1 };
function blockGrid(mask, place) {
  var rows = mask.length, cols = 0, g = [], r, c;
  for (r = 0; r < rows; r++) cols = Math.max(cols, mask[r].length);
  for (r = 0; r < rows; r++) { g.push([]); for (c = 0; c < cols; c++) g[r].push((mask[r][c] || '.') === '.' ? 'H' : 0); }
  place.forEach(function (p, idx) {
    var k = p[0], f = FIXED[k], w = 1, h = 1, i, j, id = k.charAt(0) + idx;
    if (k === 'blind') { for (i = p[1][0]; i <= p[1][2]; i++) for (j = p[1][1]; j <= p[1][3]; j++) if (g[i] && g[i][j] === 0) g[i][j] = 'b' + idx; return; }
    if (k === 'tape') { if (g[p[1]] && g[p[1]][p[2]] === 0) g[p[1]][p[2]] = id; return; }
    if (!f) return;
    if (f !== 1) { w = f[0]; h = f[1]; }
    for (i = 0; i < h; i++) for (j = 0; j < w; j++) if (g[p[1] + i] && g[p[1] + i][p[2] + j] === 0) g[p[1] + i][p[2] + j] = id;
  });
  return g;
}
function starveCells(mask, place) {
  var g = blockGrid(mask, place), rows = g.length, cols = g[0].length, out = [], r, c;
  function blk(r, c) { return r < 0 || c < 0 || c >= cols || g[r][c] !== 0; }
  for (r = 1; r < rows; r++) for (c = 0; c < cols; c++) {
    if (g[r][c] === 'H' || (mask[r][c] || '.') === 'S') continue;
    var up = g[r - 1][c];
    if (up === 'H' || (up !== 0 && up === g[r][c])) continue;   // 구멍 밑은 입구(seg) · 같은 것의 아래 칸
    if (blk(r - 1, c) && blk(r - 1, c - 1) && blk(r - 1, c + 1)) out.push([r, c]);
  }
  return out;
}

// ── 난이도(§5-3): 21단계 전에는 없음 · …5 로 끝나는 단계와 20단계마다 …8 단계는 어려움 · 30단계마다 아주 어려움 · 새 장애물 첫 단계는 보통
function isIntro(n) { for (var k in FIRST) if (FIRST[k] === n) return true; return false; }
function diffOf(n) {
  if (n < 21 || isIntro(n)) return 0;
  if (n % 30 === 0) return 2;
  if (n % 10 === 5 || n % 20 === 18) return 1;
  return 0;
}

// ── 손으로 짠 단계 1~40 + 새 장애물 첫 단계(이동 수는 MOVES 에서)
var DIAMOND = SH.diamond;
var HAND = [
  { n: 1, moves: 18, colors: 4, mask: full(7, 7), tut: 'swap', place: pts('box', [[3, 2], [3, 4], [2, 3], [4, 3]]), goals: [['color:1', 50], ['ob:box', 4]] },
  { n: 2, moves: 21, colors: 4, mask: full(7, 8), tut: 'line', place: [], goals: [['color:2', 80]] },
  { n: 3, moves: 18, colors: 4, mask: full(8, 8), tut: 'plane', place: pts('box', [[0, 0], [0, 7], [7, 0], [7, 7], [1, 0], [1, 7]]), goals: [['ob:box', 6], ['color:3', 75]] },
  { n: 4, moves: 16, colors: 4, mask: full(8, 8), tut: 'stain', place: rect('stain', 1, 1, 6, 6), goals: [['lower', 36], ['color:0', 50]] },
  { n: 5, moves: 17, colors: 4, mask: full(8, 9), tut: 'stamp', place: pts('box', [[4, 1], [4, 2], [4, 5], [4, 6], [6, 0], [6, 7]], { hp: 2 }), goals: [['ob:box', 6], ['color:0', 75]] },
  { n: 6, moves: 26, colors: 5, mask: DIAMOND, place: [], goals: [['color:0', 40], ['color:4', 40]] },
  { n: 7, moves: 22, colors: 5, mask: full(9, 9), tut: 'globe',
    place: cat(rect('stain', 2, 2, 2, 6, { hp: 2 }), rect('stain', 6, 2, 6, 6, { hp: 2 }), rect('stain', 3, 2, 5, 2, { hp: 2 }), rect('stain', 3, 6, 5, 6, { hp: 2 }), rect('stain', 0, 0, 1, 8, { hp: 1 })), goals: [['lower', 34]] },
  { n: 8, moves: 24, colors: 5, mask: SH.islands, place: pts('box', [[5, 1], [5, 3], [6, 0], [6, 2], [7, 1], [7, 3], [5, 6], [5, 8], [6, 5], [6, 7], [7, 6], [7, 8]]), goals: [['ob:box', 12]] },
  { n: 9, moves: 23, colors: 5, mask: ['###SSS###', '#########', '#########', '###...###', '###SSS###', '#########', '#########', '#########', '#########', '#########'],
    place: cat(rect('stain', 7, 0, 9, 2), rect('stain', 7, 6, 9, 8), [['box', 5, 4, { hp: 2 }], ['box', 6, 1, {}], ['box', 6, 7, {}], ['box', 7, 3, {}], ['box', 7, 5, {}], ['box', 2, 0, {}], ['box', 2, 8, {}], ['box', 8, 4, { hp: 2 }]]), goals: [['lower', 18], ['ob:box', 8]] },
  { n: 10, moves: 28, colors: 5, mask: full(9, 10), tut: 'combo', place: cat(pts('box', [[0, 0], [0, 8], [1, 2], [1, 6], [9, 3], [9, 4], [9, 5], [8, 4]], { hp: 2 }), rect('stain', 4, 3, 5, 5, { hp: 2 })), goals: [['color:2', 50], ['ob:box', 8], ['lower', 6]] },
  // 11~20: 서류함이 나옴
  { n: 11, mask: SH.r99, tut: 'ob:cabinet', place: cat([['cabinet', 3, 1], ['cabinet', 3, 6]], pts('box', [[7, 0], [7, 8], [6, 4]])), goals: [['ob:cabinet', 8], ['ob:box', 3], ['color:2', 31]] },
  { n: 12, mask: DIAMOND, place: cat(mir('box', [[2, 2], [4, 1], [6, 2], [4, 3]], { hp: 2 }), mir('box', [[1, 3], [7, 3]], { hp: 3 })), goals: [['ob:box', 12], ['color:3', 68]] },
  { n: 13, mask: SH.r89, place: cat(rect('stain', 6, 0, 7, 7), rect('stain', 8, 0, 8, 7, { hp: 2 }), [['cabinet', 2, 3]], mir('box', [[4, 0], [4, 2]], { hp: 2 }, 8)), goals: [['lower', 24], ['ob:cabinet', 4], ['ob:box', 4], ['color:3', 35]] },
  { n: 14, mask: SH.hourglass, place: cat(mir('box', [[3, 2], [4, 3], [6, 2]], { hp: 2 }), [['box', 5, 4, { hp: 3 }]], mir('box', [[8, 1], [8, 3]])), goals: [['ob:box', 11], ['color:1', 68]] },
  { n: 15, mask: SH.donut, place: cat(rect('stain', 2, 2, 2, 6, { hp: 2 }), rect('stain', 6, 2, 6, 6, { hp: 2 }), rect('stain', 3, 2, 5, 2, { hp: 2 }), rect('stain', 3, 6, 5, 6, { hp: 2 }), mir('box', [[0, 0], [8, 0], [4, 0]], { hp: 2 })), goals: [['lower', 16], ['ob:box', 6], ['color:0', 34]] },
  { n: 16, mask: SH.islands, place: [['cabinet', 2, 1], ['cabinet', 5, 6], ['box', 6, 1, { hp: 2 }], ['box', 1, 7, { hp: 2 }], ['box', 8, 2, {}], ['box', 8, 5, {}]], goals: [['ob:cabinet', 8], ['ob:box', 4], ['color:4', 42]] },
  { n: 17, mask: SH.heart, place: cat(rect('stain', 2, 2, 5, 6, { hp: 2 }), mir('stain', [[1, 1], [1, 2], [2, 1], [3, 1]])), goals: [['lower', 28], ['color:4', 60]] },
  { n: 18, mask: SH.stairsL, place: pts('box', [[1, 5, { hp: 2 }], [2, 6, { hp: 2 }], [3, 7, { hp: 3 }], [5, 1, { hp: 2 }], [6, 3, { hp: 3 }], [7, 5, { hp: 2 }], [8, 7, { hp: 2 }], [4, 3, { hp: 2 }], [9, 1, { hp: 2 }]]), goals: [['ob:box', 9], ['color:2', 68]] },
  { n: 19, mask: SH.plus, place: cat([['cabinet', 4, 1], ['cabinet', 4, 6]], pts('box', [[2, 4], [7, 4], [1, 2], [1, 6], [8, 2], [8, 6]], { hp: 2 })), goals: [['ob:cabinet', 8], ['ob:box', 6], ['color:1', 42]] },
  { n: 20, mask: SH.r910, place: cat(pts('box', [[3, 0], [3, 2], [3, 4], [3, 6], [3, 8], [5, 1], [5, 7]], { hp: 3 }), rect('stain', 7, 0, 9, 8)), goals: [['ob:box', 7], ['lower', 27], ['color:3', 34]] },
  // 21~30: 팩스기가 나옴
  { n: 21, mask: SH.r99, tut: 'ob:fax', place: cat([['fax', 4, 2], ['fax', 4, 6]], pts('box', [[7, 1], [7, 4], [7, 7]], { hp: 2 })), goals: [['ob:fax', 12], ['ob:box', 3], ['color:0', 32]] },
  { n: 22, mask: SH.oct, place: cat([['fax', 4, 4]], mir('box', [[2, 2], [6, 1], [6, 3], [8, 2]], { hp: 2 })), goals: [['ob:fax', 10], ['ob:box', 8], ['color:2', 42]] },
  { n: 23, mask: SH.vee, place: cat([['fax', 2, 1], ['fax', 2, 7]], rect('stain', 4, 2, 6, 6, { hp: 2 }), mir('stain', [[3, 0], [3, 1], [4, 0], [4, 1]])), goals: [['ob:fax', 10], ['lower', 23], ['color:4', 34]] },
  { n: 24, mask: SH.cup, place: cat([['cabinet', 5, 1], ['cabinet', 5, 6], ['fax', 7, 4]], mir('box', [[1, 1], [8, 0]], { hp: 2 })), goals: [['ob:cabinet', 8], ['ob:fax', 8], ['ob:box', 4], ['color:4', 35]] },
  { n: 25, mask: SH.r910, place: cat(mir('box', [[2, 1], [2, 3], [5, 0], [5, 2], [8, 1], [8, 3]], { hp: 3 }), rect('stain', 4, 3, 6, 5, { hp: 2 }), rect('stain', 9, 0, 9, 8)), goals: [['ob:box', 12], ['lower', 18], ['color:1', 42]] },
  { n: 26, mask: SH.wave, place: cat([['fax', 3, 4]], rect('stain', 5, 0, 8, 2, { hp: 2 }), rect('stain', 5, 6, 8, 8, { hp: 2 }), mir('box', [[2, 1]], { hp: 3 })), goals: [['ob:fax', 10], ['lower', 24], ['ob:box', 2], ['color:1', 35]] },
  { n: 27, mask: SH.arch, place: cat([['cabinet', 2, 3]], mir('box', [[5, 1], [5, 3], [8, 1], [2, 0]], { hp: 2 }), rect('stain', 5, 4, 6, 4)), goals: [['ob:cabinet', 4], ['ob:box', 8], ['lower', 2], ['color:3', 51]] },
  { n: 28, mask: SH.tee, place: cat(rect('stain', 4, 2, 9, 6, { hp: 2 }), mir('box', [[1, 1], [1, 3]], { hp: 2 })), goals: [['lower', 30], ['ob:box', 4], ['color:3', 42]] },
  { n: 29, mask: SH.bowtie, place: cat([['fax', 6, 4]], mir('box', [[3, 1], [6, 1], [4, 3], [5, 3]], { hp: 2 }), mir('box', [[1, 0]], { hp: 3 })), goals: [['ob:fax', 10], ['ob:box', 10], ['color:0', 34]] },
  { n: 30, mask: SH.r910, place: cat([['cabinet', 1, 1], ['cabinet', 1, 6], ['fax', 4, 4]], rect('stain', 7, 0, 9, 8, { hp: 2 }), mir('box', [[4, 1], [5, 3]], { hp: 3 })), goals: [['ob:cabinet', 8], ['ob:fax', 10], ['lower', 27], ['ob:box', 4]] },
  // 31~40: 구긴 종이공이 나옴
  { n: 31, mask: SH.r99, tut: 'ob:paper', place: cat(pts('paper', [[0, 1], [0, 4], [0, 7], [1, 2], [1, 6], [2, 4], [1, 0], [1, 8], [2, 1], [2, 7]]), mir('box', [[6, 1], [6, 3]])), goals: [['ob:paper', 10], ['ob:box', 4], ['color:4', 32]] },
  { n: 32, mask: DIAMOND, place: cat(pts('paper', [[1, 3], [1, 5], [2, 2], [2, 6], [0, 4], [2, 4], [1, 4]]), mir('box', [[5, 1], [5, 3], [7, 3]], { hp: 2 })), goals: [['ob:paper', 7], ['ob:box', 6], ['color:1', 51]] },
  { n: 33, mask: SH.roof, place: cat(pts('paper', [[2, 3], [2, 5], [3, 2], [3, 6], [4, 1], [4, 7], [1, 4], [3, 4]]), rect('stain', 7, 1, 9, 7, { hp: 2 })), goals: [['ob:paper', 8], ['lower', 21], ['color:2', 34]] },
  { n: 34, mask: SH.dots, place: cat([['cabinet', 4, 1], ['cabinet', 4, 6]], pts('paper', [[0, 2], [0, 6], [1, 4], [0, 4], [1, 1], [1, 7]]), mir('box', [[8, 1], [8, 3]], { hp: 2 })), goals: [['ob:cabinet', 8], ['ob:paper', 6], ['ob:box', 4], ['color:4', 35]] },
  { n: 35, mask: SH.hourglass, place: cat(pts('paper', [[0, 1], [0, 7], [1, 3], [1, 5], [0, 4], [2, 2], [2, 6]]), mir('box', [[7, 1], [7, 3], [9, 0]], { hp: 3 }), [['fax', 4, 4]]), goals: [['ob:paper', 7], ['ob:box', 6], ['ob:fax', 10], ['color:0', 35]] },
  { n: 36, mask: SH.frame, place: cat(rect('stain', 6, 1, 9, 7, { hp: 2 }), pts('paper', [[0, 2], [0, 6], [1, 4], [0, 4], [1, 1], [1, 7]])), goals: [['lower', 28], ['ob:paper', 6], ['color:0', 42]] },
  { n: 37, mask: SH.stairsR, place: cat([['fax', 6, 2], ['fax', 6, 6]], pts('paper', [[1, 4], [1, 6], [2, 3], [3, 5], [0, 7], [2, 8]]), mir('box', [[8, 0], [8, 4]], { hp: 2 })), goals: [['ob:fax', 12], ['ob:paper', 6], ['ob:box', 3], ['color:2', 35]] },
  { n: 38, mask: SH.r810, place: cat([['cabinet', 3, 1], ['cabinet', 3, 5]], pts('box', [[7, 0], [7, 3], [7, 4], [7, 7], [1, 0], [1, 7]], { hp: 3 }), rect('stain', 9, 0, 9, 7)), goals: [['ob:cabinet', 8], ['ob:box', 6], ['lower', 8], ['color:3', 35]] },
  { n: 39, mask: SH.donut, place: cat(pts('paper', [[0, 1], [0, 4], [0, 7], [1, 3], [1, 5], [2, 4], [1, 0], [1, 8]]), rect('stain', 7, 0, 8, 8, { hp: 2 })), goals: [['ob:paper', 8], ['lower', 18], ['color:3', 42]] },
  { n: 40, mask: SH.r910, place: cat([['cabinet', 5, 3]], [['fax', 2, 1], ['fax', 2, 7]], pts('paper', [[0, 3], [0, 5], [1, 4], [0, 1], [0, 7]]), mir('box', [[8, 0], [8, 2]], { hp: 3 })), goals: [['ob:cabinet', 4], ['ob:fax', 8], ['ob:paper', 5], ['ob:box', 4]] },
  // 새 장애물 첫 단계(그 장애물 위주 · 쉬움)
  { n: 41, mask: SH.r99, tut: 'ob:pens', place: cat([['pens', 3, 1], ['pens', 3, 4], ['pens', 3, 7]], mir('box', [[7, 1], [7, 3]], { hp: 2 })), goals: [['ob:pens', 12], ['ob:box', 4], ['color:3', 26]] },
  { n: 51, mask: SH.r99, tut: 'ob:mug', place: cat(pts('mug', [[0, 1, { hp: 1 }], [0, 4, { hp: 2 }], [0, 7, { hp: 1 }], [1, 2, { hp: 2 }], [1, 6, { hp: 2 }], [2, 4, { hp: 1 }], [1, 0, { hp: 1 }], [1, 8, { hp: 1 }]])), goals: [['ob:mug', 8], ['color:1', 39]] },
  { n: 61, mask: SH.r99, tut: 'ob:weight', place: cat(pts('weight', [[4, 1], [4, 4], [4, 7], [6, 3], [6, 5]]), [['lineH', 8, 2, {}], ['stamp', 8, 6, {}]], mir('box', [[2, 1], [2, 3]], { hp: 2 })), goals: [['ob:weight', 5], ['ob:box', 4], ['color:0', 26]] },
  { n: 71, mask: SH.r910, tut: 'ob:pot', place: cat([['pot', 3, 1], ['pot', 3, 6]], rect('stain', 9, 0, 9, 8)), goals: [['ob:pot', 2], ['lower', 20], ['color:4', 32]] },
  { n: 81, mask: SH.r99, tut: 'ob:tape', place: cat(pts('tape', [[3, 1], [3, 4], [3, 7], [5, 0], [5, 2], [5, 6], [5, 8], [7, 3], [7, 5], [1, 2], [1, 6]])), goals: [['ob:tape', 11], ['color:2', 39]] },
  { n: 91, mask: SH.r910, tut: 'ob:locker', place: cat([['locker', 3, 3, { hp: 3 }]], [['stamp', 7, 2, {}], ['lineV', 7, 6, {}]], mir('box', [[1, 0], [6, 1]], { hp: 2 })), goals: [['ob:locker', 1], ['ob:box', 4], ['color:2', 32]] },
  { n: 101, mask: SH.r99, tut: 'ob:duck', place: cat(pts('duck', [[0, 1], [0, 4], [0, 7]]), mir('box', [[4, 2], [6, 0]], { hp: 2 })), goals: [['duck', 3], ['ob:box', 4], ['color:3', 32]] },
  { n: 121, mask: SH.r99, tut: 'ob:folder', place: pts('folder', [[4, 1, { color: 0, hp: 2 }], [4, 3, { color: 1, hp: 2 }], [4, 5, { color: 2, hp: 2 }], [4, 7, { color: 3, hp: 2 }], [7, 2, { color: 4 }], [7, 6, { color: 0 }]]), goals: [['ob:folder', 6], ['color:1', 32]] },
  { n: 181, mask: SH.r910, tut: 'ob:blind', place: cat([['blind', [7, 0, 9, 8], { color: 2, need: 14 }]], mir('box', [[3, 1], [3, 3]], { hp: 2 })), goals: [['ob:blind', 1], ['ob:box', 4], ['color:4', 32]] },
  { n: 231, mask: SH.r99, tut: 'ob:gacha', place: cat(pts('gacha', [[4, 2], [4, 6]]), mir('box', [[7, 1], [7, 3]], { hp: 2 })), goals: [['capsule', 6], ['ob:box', 4], ['color:0', 26]] },
  { n: 261, mask: SH.r99, tut: 'ob:paint', place: cat(pts('paint', [[1, 2], [1, 6], [0, 4]]), mir('box', [[6, 1], [6, 3]], { hp: 2 })), goals: [['ob:paint', 3], ['ob:box', 4], ['color:2', 32]] },
  { n: 301, mask: SH.r99, tut: 'ob:brick', place: cat(pts('brick', [[4, 1, { hp: 1 }], [4, 4, { hp: 2 }], [4, 7, { hp: 1 }]]), [['stamp', 7, 4, {}]], mir('box', [[2, 1], [7, 1]], { hp: 2 })), goals: [['ob:brick', 3], ['ob:box', 4], ['color:1', 32]] }
];
var HANDN = {};
HAND.forEach(function (lv) { HANDN[lv.n] = lv; });

// ── 생성기: 번호 n · 변형 v → 단계(이동 수 없이). 같은 (n, v) → 늘 같은 단계
var W2 = { cabinet: 1, pot: 1, locker: 1 };   // 2×2
function build(n, v) {
  var best = null, E = workGoal(n);
  for (var att = 0; att < 12; att++) {
    var lv = build1(n, v, att), w = estWork(lv.goals, lv.place, lv.colors);
    // 모자라면 색 목표로 채움(90 까지)
    if (w < E) {
      var cg = null; lv.goals.forEach(function (g) { if (g[0].indexOf('color:') === 0) cg = g; });
      var add = Math.round((E - w) / WORK.color);
      if (cg) cg[1] = Math.min(90, cg[1] + add); else if (lv.goals.length < 4) lv.goals.push(['color:' + (n % lv.colors), Math.min(90, Math.max(12, add))]);
      w = estWork(lv.goals, lv.place, lv.colors);
    }
    lv.work = Math.round(w * 10) / 10;
    if (Math.abs(w - E) <= 4) return lv;
    if (!best || Math.abs(w - E) < Math.abs(best.work - E)) best = lv;
  }
  return best;
}
function build1(n, v, att) {
  var R = rng(n * 92821 + (v | 0) * 6151 + att * 131 + 17), ri = function (k) { return Math.floor(R() * k); };
  var shape = SHAPES[ri(SHAPES.length)], mask = SH[shape], rows = mask.length, cols = 0, r, c;
  for (r = 0; r < rows; r++) cols = Math.max(cols, mask[r].length);
  var diff = diffOf(n), colors = R() < 0.12 ? 4 : 5, s = (1.7 + Math.min(n, 400) / 400 * 0.7) * (1 + 0.08 * diff);
  var occ = [], place = [], goals = [], used = {};
  for (r = 0; r < rows; r++) { occ.push([]); for (c = 0; c < cols; c++) occ[r].push((mask[r][c] || '.') === '.' ? 9 : 0); }
  // 풀린 장애물 — 새로 풀린 것일수록 자주(30단계 동안)
  var open = ORDER.filter(function (k) { return FIRST[k] <= n; }), pool = [];
  open.forEach(function (k) { var age = n - FIRST[k], wgt = age < 30 ? 4 : k === 'box' || k === 'stain' ? 1.2 : 1; for (var i = 0; i < wgt * 4; i++) pool.push(k); });
  var nk = 1 + (R() < (n < 80 ? 0.55 : 0.75) ? 1 : 0) + (n > 150 && R() < 0.2 ? 1 : 0), kinds = [], hardOnly = { weight: 1, locker: 1, brick: 1 }, tries = 0;
  while (kinds.length < nk && tries++ < 60) {
    var k = pool[ri(pool.length)];
    if (kinds.indexOf(k) >= 0) continue;
    if (hardOnly[k] && kinds.some(function (x) { return hardOnly[x]; })) continue;
    if ((k === 'duck' && (kinds.indexOf('blind') >= 0 || kinds.indexOf('tape') >= 0)) || ((k === 'blind' || k === 'tape') && kinds.indexOf('duck') >= 0)) continue;
    if (k === 'blind' && rows < 9) continue;
    kinds.push(k);
  }
  var lastRow = function (c) { for (var q = rows - 1; q >= 0; q--) if (occ[q][c] !== 9) return q; return -1; };
  function free(r, c, w, h) { for (var i = 0; i < (h || 1); i++) for (var j = 0; j < (w || 1); j++) { if (!occ[r + i] || occ[r + i][c + j] !== 0) return false; } return true; }
  function okFix(r, c, w, h, kind) {
    if (!free(r, c, w, h)) return false;
    var test = place.concat([[kind, r, c, {}]]);
    return starveCells(seg(mask), test).length === 0;
  }
  function mark(r, c, w, h, val) { for (var i = 0; i < (h || 1); i++) for (var j = 0; j < (w || 1); j++) occ[r + i][c + j] = val; }
  var top = 0, bot = rows - 1;
  // 블라인드는 판 맨 아래 줄부터(먼저 놓아 둔다)
  if (kinds.indexOf('blind') >= 0) {
    var bh = 2 + ri(2), c0 = ri(2), c1 = cols - 1 - ri(2), nb = cols >= 8 && R() < 0.35 ? 2 : 1, mid = (c0 + c1) >> 1;
    var spans = nb === 2 ? [[c0, mid], [mid + 1, c1]] : [[c0, c1]];
    spans.forEach(function (sp) {
      var need = Math.round((7 + ri(6)) * s), col = ri(colors);
      place.push(['blind', [rows - bh, sp[0], rows - 1, sp[1]], { color: col, need: need }]);
      for (var i = rows - bh; i < rows; i++) for (var j = sp[0]; j <= sp[1]; j++) if (occ[i][j] === 0) occ[i][j] = 7;
    });
    goals.push(['ob:blind', spans.length]); bot = rows - bh - 1;
  }
  // 놓는 자리 무늬: 거울 · 띠 · 섬 · 흩음
  function spots(cnt, w, h, zone, kind, fixed) {
    var out = [], pat = ri(4), guard = 0, r0 = zone[0], r1 = zone[1];
    function tryAt(r, c) {
      if (r < r0 || r + (h || 1) - 1 > r1 || c < 0 || c + (w || 1) > cols) return false;
      if (fixed ? !okFix(r, c, w, h, kind) : !free(r, c, w, h)) return false;
      out.push([r, c]); mark(r, c, w, h, fixed ? 2 : 1);
      if (fixed) place.push([kind, r, c, {}]);   // 검사용 임시(뒤에서 다시 씀)
      return true;
    }
    var cr = r0 + ri(Math.max(1, r1 - r0 + 1)), cc = ri(cols);
    while (out.length < cnt && guard++ < 400) {
      var rr, cc2;
      if (pat === 0) { rr = r0 + ri(r1 - r0 + 1); cc2 = ri(Math.ceil(cols / 2)); if (tryAt(rr, cc2) && out.length < cnt) tryAt(rr, cols - (w || 1) - cc2); }
      else if (pat === 1) { rr = r0 + ((guard / 5) | 0) % Math.max(1, r1 - r0 + 1); cc2 = (guard % 5) * 2 + (rr & 1); tryAt(rr, cc2); }
      else if (pat === 2) { rr = cr + ri(5) - 2; cc2 = cc + ri(5) - 2; tryAt(rr, cc2); if (guard % 60 === 59) { cr = r0 + ri(r1 - r0 + 1); cc = ri(cols); } }
      else { tryAt(r0 + ri(r1 - r0 + 1), ri(cols)); }
    }
    if (fixed) place.splice(place.length - out.length, out.length);
    return out;
  }
  var lowerN = 0, spOnly = 0;
  kinds.forEach(function (k) {
    var a, list, i, o;
    if (k === 'blind') return;
    if (k === 'stain') {
      a = Math.round((10 + ri(12)) * s); var hp2 = R() < n / 400;
      var st = rows - 1 - ri(3), rh = Math.max(2, Math.min(4, Math.ceil(a / cols))), sc = ri(2), pat2 = ri(3), cnt = 0;
      for (r = 0; r < rows && cnt < a; r++) for (c = 0; c < cols && cnt < a; c++) {
        var inZ = pat2 === 0 ? r > bot - rh && r <= bot : pat2 === 1 ? Math.abs(r - (rows >> 1)) <= 1 + (rh >> 1) && c >= sc + 1 && c <= cols - 2 - sc : (c < 3 || c > cols - 4) && r > rows - 1 - rh * 2 && r <= bot;
        if (!inZ || occ[r][c] === 9 || occ[r][c] === 7 || used['l' + r + ',' + c]) continue;
        used['l' + r + ',' + c] = 1; place.push(['stain', r, c, hp2 && (r + c) % 2 ? { hp: 2 } : {}]); cnt++;
      }
      lowerN += cnt; if (cnt) goals.push(['lower', cnt]); return;
    }
    if (k === 'box') {
      a = Math.round((5 + ri(6)) * s); var bhp = 1 + ri(Math.min(4, 1 + Math.floor(n / 60)));
      list = spots(a, 1, 1, [1, bot], 'box', true);
      list.forEach(function (p, j) { place.push(['box', p[0], p[1], { hp: Math.max(1, bhp - (j % 3 === 2 ? 1 : 0)) }]); });
      if (list.length) goals.push(['ob:box', list.length]); return;
    }
    if (W2[k] || k === 'pens') {
      var w = k === 'pens' ? 1 : 2, h = 2, m = k === 'locker' ? 1 + ri(2) : 2 + ri(2);
      list = spots(m, w, h, [1, bot], k, true);
      list.forEach(function (p) { o = {}; if (k === 'locker') o.hp = 3 + ri(3); if (k === 'cabinet' && R() < 0.3) o.hp = 3; place.push([k, p[0], p[1], o]); });
      if (!list.length) return;
      var per = k === 'pens' ? 4 : k === 'cabinet' ? null : 1;
      if (k === 'cabinet') { var dr = 0; place.forEach(function (q) { if (q[0] === 'cabinet') dr += q[3].hp || 4; }); goals.push(['ob:cabinet', dr]); }
      else goals.push(['ob:' + k, list.length * per]);
      if (k === 'locker') spOnly++;
      return;
    }
    if (k === 'fax' || k === 'gacha') {
      list = spots(1 + ri(2), 1, 1, [2, bot], k, true);
      list.forEach(function (p) { place.push([k, p[0], p[1], {}]); });
      if (list.length) goals.push(k === 'fax' ? ['ob:fax', Math.round((4 + ri(4)) * s) + list.length] : ['capsule', Math.round((3 + ri(3)) * s) + list.length]);
      return;
    }
    if (k === 'weight' || k === 'brick' || k === 'folder') {
      a = Math.round((k === 'folder' ? 4 + ri(4) : 3 + ri(3)) * (k === 'folder' ? s : 1));
      list = spots(a, 1, 1, [2, bot], k, true);
      list.forEach(function (p) { o = {}; if (k === 'brick') o.hp = 1 + ri(3); if (k === 'folder') { o.color = ri(colors); o.hp = 1 + ri(Math.min(3, 1 + Math.floor((n - 120) / 50))); } place.push([k, p[0], p[1], o]); });
      if (list.length) goals.push(['ob:' + k, list.length]);
      if (k !== 'folder') spOnly++;
      return;
    }
    if (k === 'tape') {
      a = Math.round((7 + ri(7)) * s);
      list = spots(a, 1, 1, [1, bot], 'tape', true);
      list.forEach(function (p) { place.push(['tape', p[0], p[1], {}]); });
      if (list.length) goals.push(['ob:tape', list.length]); return;
    }
    if (k === 'paper' || k === 'mug' || k === 'paint') {
      a = Math.round((k === 'paint' ? 3 + ri(2) : 5 + ri(5)) * (k === 'paint' ? 1 : s));
      list = spots(a, 1, 1, [0, Math.min(bot, Math.floor(rows / 2))], k, false);
      list.forEach(function (p) { o = {}; if (k === 'mug') o.hp = 1 + ri(Math.min(3, 1 + Math.floor((n - 50) / 60))); place.push([k, p[0], p[1], o]); });
      if (list.length) goals.push(['ob:' + k, list.length]); return;
    }
    if (k === 'duck') {
      // 오리는 맨 아래까지 칸이 끊기지 않은 열에만(구멍에 걸리지 않게)
      a = 2 + ri(3); list = []; var dcs = [];
      for (c = 0; c < cols; c++) { var tops = 0, first = -1; for (r = 0; r < rows; r++) if (occ[r][c] !== 9 && (r === 0 || occ[r - 1][c] === 9)) { tops++; if (first < 0) first = r; } if (tops === 1 && first <= 2) dcs.push([first, c]); }
      while (list.length < a && dcs.length) { var di = ri(dcs.length), dp = dcs.splice(di, 1)[0]; if (free(dp[0], dp[1])) { list.push(dp); mark(dp[0], dp[1], 1, 1, 1); } }
      list.forEach(function (p) { place.push(['duck', p[0], p[1], {}]); });
      if (list.length) goals.push(['duck', list.length]);
    }
  });
  // 색 목표: 목표가 하나뿐이거나 반쯤은 덧붙임(4개까지)
  if (goals.length < 4 && (goals.length < 2 || R() < 0.35)) goals.push(['color:' + ri(colors), Math.round((14 + ri(16)) * s)]);
  if (!goals.length) goals.push(['color:' + ri(colors), Math.round(30 * s)]);
  return { n: n, diff: diff, colors: colors, mask: seg(mask), place: place, goals: goals.slice(0, 4), tut: null, seed: n, shape: shape };
}

function moveAt(i) { var ch = MOVES.charCodeAt(i); return ch >= 58 && ch <= 93 ? ch - 48 : 0; }
function endAt(n) { var ch = ENDM.charCodeAt(n - 41); return ch >= 58 && ch <= 93 ? ch - 48 : 0; }
// 아직 안 잰 단계의 이동 수 어림(일의 양 + 여유) — tune.js 가 재기 전에만 쓰임
function fitMoves(lv) { return Math.max(10, Math.min(45, Math.round(estWork(lv.goals, lv.place, lv.colors) * 1.15 + 3))); }
function finish(lv) {
  var o = {}; for (var k in lv) o[k] = lv[k];
  o.mask = seg(o.mask); o.diff = diffOf(o.n); if (o.colors == null) o.colors = 5; if (o.seed == null) o.seed = o.n; if (!o.tut) o.tut = o.tut || null;
  var m = o.n >= 11 && o.n <= COUNT + 1 ? moveAt(o.n - 11) : 0;
  if (o.n > 10) o.moves = m || fitMoves(o);
  return o;
}
function varOf(n) { var ch = VARS.charAt(n - 41); return ch ? parseInt(ch, 36) : 0; }
// 1~300: 자료 / 301~: 끝없는 단계
function make(n, v) {
  if (HANDN[n]) return finish(HANDN[n]);
  var lv = build(n, v == null ? (n <= COUNT ? varOf(n) : 0) : v);
  return finish(lv);
}
var LEVELS = [];
for (var i = 1; i <= COUNT; i++) LEVELS.push(make(i));
// ── 끝없는 단계(301~): 번호 n 이 씨앗. 41~300 의 잰 생성 단계 가운데 난이도가 같은 것을 바탕으로 골라
// 색 바꾸기 · 같은 규칙 장애물 바꾸기(돌 문진 → 1겹 벽돌) · 다른 처음 판(시드 = n)으로 만든다. 이동 수는 바탕 단계를 끝없는 단계 목표에서
// 시드 200개로 잰 값(ENDM — 잰 값이 목표에 가까운 단계만 바탕이 됨). 목표 양 → 이동 수 회귀식은 오차가 ±5이동이라 통과 비율 범위를 못 지켜 이렇게 했다.
var BASES = [[], [], []], PERM = false;   // 색 바꾸기는 끔 — 같은 수 세기에서 낮은 번호 색이 먼저 골라져 통과 비율이 달라짐(재 봄)
for (var b = 61; b <= COUNT; b++) if (!HANDN[b] && (endAt(b) || !ENDM)) BASES[diffOf(b)].push(b);
function remix(n) {
  var R = rng(n * 2654435761 + 7), diff = diffOf(n), list = BASES[diff], base = LEVELS[list[Math.floor(R() * list.length)] - 1];
  var cols = 0, perm = [0, 1, 2, 3, 4], i, j, t;
  base.mask.forEach(function (row) { cols = Math.max(cols, row.length); });
  if (PERM) for (i = base.colors - 1; i > 0; i--) { j = Math.floor(R() * (i + 1)); t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  var brick = R() < 0.6;
  var place = base.place.map(function (p) {
    var o = {}, k = p[0], src = k === 'blind' ? p[2] : p[3];
    for (var x in src) o[x] = src[x];
    if (o.color != null) o.color = perm[o.color];
    if (o.pens) o.pens = o.pens.map(function (c) { return c < 0 ? c : perm[c]; });
    if (k === 'blind') return [k, p[1].slice(), o];
    if (k === 'weight' && brick) { k = 'brick'; o.hp = 1; }
    return [k, p[1], p[2], o];
  });
  var goals = base.goals.map(function (g) {
    var id = g[0];
    if (id.indexOf('color:') === 0) id = 'color:' + perm[+id.slice(6)];
    if (id === 'ob:weight' && brick) id = 'ob:brick';
    return [id, g[1]];
  });
  return { n: n, diff: diff, colors: base.colors, mask: base.mask.slice(), place: place, goals: goals, tut: null, seed: n, moves: endAt(base.n) || base.moves, base: base.n };
}
function genLevel(n) { n = Math.max(1, Math.floor(n)); return n <= COUNT ? LEVELS[n - 1] : n === COUNT + 1 ? make(n) : remix(n); }
return { LEVELS: LEVELS, COUNT: COUNT, FIRST: FIRST, SHAPES: SHAPES,
  get: function (n) { return n >= 1 && n <= COUNT ? LEVELS[n - 1] : null; }, genLevel: genLevel,
  _build: build, _make: make, _finish: finish, _seg: seg, _starve: starveCells, _diffOf: diffOf, _est: estWork, _workGoal: workGoal, _remix: remix, BASES: BASES, HAND: HAND, isIntro: isIntro };
}));
