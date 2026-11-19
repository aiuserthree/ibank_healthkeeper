/* 문구 팡팡(deskpop) — 판 규칙 엔진
 * 그림 · DOM 과 떨어진 순수 규칙. 브라우저에선 window.DeskEngine, node 에선 module.exports.
 * 난수는 시드로만(브라우저 기본 난수 안 씀) — 같은 시드 · 같은 수 → 같은 이벤트.
 * 명세: .claude/work/deskpop/spec.md §3 · §4 · §5-4 · §6-4
 *
 * 칸(§3-2): cells[r][c] = { hole, spawn, lower, item, upper, blind }
 *   item = {id, t:'tile', color} | {id, t:'sp', sp:'lineH'|'lineV'|'plane'|'stamp'|'globe', color}
 *        | {id, t:'ob', ob, hp, fixed, color?, pens?, n?} (큰 칸의 나머지 칸은 {id(본체와 같음), t:'ob', ob, fixed, part:{ar,ac}})
 *        | {id, t:'col', col:'duck'|'capsule'}   (+ ls: 마지막으로 내려앉은 차례)
 *   lower = {t:'stain'|'paint', hp} · upper = {t:'tape', hp} · blind = 블라인드 id | null
 * 자리는 늘 [r, c](r=0 이 맨 위).
 *
 * apply(move) 가 돌려주는 이벤트(화면은 차례대로 재생, 한 단계 안에서는 t(ms) 에 맞춰):
 *   {e:'swap', a, b, ok, ida, idb} · {e:'tap', p, id} · {e:'move', left}
 *   {e:'combo', key, a, b, fx}      특수 + 특수(key 는 'globe+line' 처럼 이름 차례로 이은 것, fx 는 COMBOS 값)
 *   {e:'step', n, dur}              연쇄 n번째 단계 시작(n=0 이 사람의 수), dur = 그 단계 효과가 끝나는 ms
 *   {e:'match', t, color, cells, make, at} · {e:'clear', t, p, id, color, by, to} · {e:'create', t, p, item}
 *   {e:'trigger', t, p, id, sp}     특수 블록이 다른 효과에 맞아 곧 터짐
 *   {e:'fx', t, sp, p, id, cells, target?, land?, carry?, targets?, color?}   효과(cells 는 [r,c,d] — d 는 닿는 늦음 ms)
 *       sp 는 단독 넷 + 조합 'line+line' · 'line+stamp' · 'stamp+stamp' · 'plane+plane' · 'globe+globe'
 *       (비행기가 싣고 나는 조합은 sp:'plane' + carry, 스노볼 바꾸기 조합은 'convert' 이벤트)
 *   {e:'convert', t, p, id, id2, kind, items:[{p, id, sp, d}]}   스노볼 조합 — 블록들이 특수 블록으로 바뀜
 *   {e:'hit', t, p, id?, layer:'item'|'lower'|'upper', what, hp, gone, pens?, pen?}   한 겹
 *   {e:'spread', t, p, what, cells}  커피포트 · 물감 통이 깨지며 아래층을 깜
 *   {e:'morph', t, p, from, item}    캡슐 뽑기가 둘레 블록을 캡슐로 바꿈
 *   {e:'collect', t, p, id, what}    캡슐 모음 · {e:'ducks', dur, items:[{id,p}]} 떨어짐 뒤 맨 아래 오리 모음(뒤에 fall)
 *   {e:'blind', t, id, left, p} · {e:'blindOpen', t, id}   블라인드 남은 수 · 걷힘
 *   {e:'goal', t, id, left, p}       목표 하나 줄어듦
 *   {e:'fall', ticks, items:[{id, from, steps:[[tick,r,c],...], spawn?:item}]}
 *   {e:'shuffle', moves:[{id, from, to}]} · {e:'recolor', items:[{id, p, color}]}
 *   {e:'overflow'} 연쇄 상한(200) — 생기면 안 됨 · {e:'end', result}
 * finishBonus(): {e:'bonus', moves} · {e:'place', t, p, from, item, left} 뒤에 위와 같은 단계 이벤트
 * useBooster(kind, p): {e:'booster', kind, p} 뒤에 위와 같은 단계 이벤트(이동은 안 씀)
 *   첫 단계 안 {e:'boost', t:0, hit, kind, p, cells} — 뿅망치(1칸) · 긴 자(행) · 롤 테이프(열) 효과(hit = 처음 닿는 ms), 탁상 선풍기는 {e:'shuffle'}
 * create(level, {preBoosters:['line'|'stamp'|'globe'], gift:['line'|'plane'|'stamp'|'globe'], goldGlobe}) 는 처음 판에
 *   특수 블록을 미리 놓는다 — 놓은 것은 game.placed() = [{p, sp, from:'pre'|'gift', id}]
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DeskEngine = factory();
}(typeof self !== 'undefined' ? self : this, function () {
'use strict';

var VERSION = 3;
var MAX_ROWS = 10, MAX_COLS = 9, CHAIN_LIMIT = 200, CONTINUE_MAX = 3, BONUS_COIN_MAX = 150;
// 덩어리 모양 → 특수 블록 차례(§3-4). 2×2 를 4줄보다 앞에 두려면 'plane' 을 'line' 앞으로 옮긴다.
var PRIORITY = ['globe', 'stamp', 'line', 'plane'];
// 한 단계 안의 시간(ms) — 화면 시간표(§9-1)와 맞춘다. 엔진은 순서 · 늦음만 정하고 그리지는 않는다.
var T = { wave: 60, lineCell: 22, stampLift: 200, planeTake: 100, planeFly: 420, globeGather: 200, globeStep: 30, globeMax: 600, create: 120, clear: 180, tail: 220,
  comboLift: 160, bigLift: 280, convert: 300, convStep: 50, convMax: 1200, allStep: 35, planeGap: 70, duck: 300, bonusGap: 120, bonusFire: 90, hammer: 220, toolLead: 160 };
var SPECIALS = ['lineH', 'lineV', 'plane', 'stamp', 'globe'];
var DIRS4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];
var DIRS8 = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];

// 장애물 규칙표(§4-3) — side: 옆 맞춤으로 깨짐 · sp: 특수로 깨짐 · fixed: 안 떨어짐 · w,h: 크기 · hp0: 처음 겹
// per: 맞을 때마다 목표 1(서류 · 펜) · color: 색 조건('one' 그 색만 · 'pens' 남은 펜 색) · spread: 깨지면 둘레 1칸까지 아래층을 깜
// endless: 'fax'(맞을 때마다 팩스 1장, 목표를 다 채우면 꺼져 사라짐) · 'gacha'(3번마다 둘레 블록 하나를 캡슐로)
var OBS = {
  box:     { fixed: true,  side: true,  sp: true, maxHp: 4, goal: 'ob:box' },
  cabinet: { fixed: true,  side: true,  sp: true, maxHp: 4, hp0: 4, w: 2, h: 2, per: 1, goal: 'ob:cabinet' },
  fax:     { fixed: true,  side: true,  sp: true, maxHp: 1, endless: 'fax', goal: 'ob:fax' },
  paper:   { fixed: false, side: true,  sp: true, maxHp: 1, goal: 'ob:paper' },
  pens:    { fixed: true,  side: true,  sp: true, maxHp: 4, hp0: 4, h: 2, per: 1, color: 'pens', goal: 'ob:pens' },
  mug:     { fixed: false, side: true,  sp: true, maxHp: 3, goal: 'ob:mug' },
  weight:  { fixed: true,  side: false, sp: true, maxHp: 1, goal: 'ob:weight' },
  pot:     { fixed: true,  side: true,  sp: true, maxHp: 5, hp0: 5, w: 2, h: 2, spread: 'stain', goal: 'ob:pot' },
  locker:  { fixed: true,  side: false, sp: true, maxHp: 5, hp0: 5, w: 2, h: 2, goal: 'ob:locker' },
  folder:  { fixed: true,  side: true,  sp: true, maxHp: 3, color: 'one', goal: 'ob:folder' },
  gacha:   { fixed: true,  side: true,  sp: true, maxHp: 1, endless: 'gacha', goal: 'capsule' },
  paint:   { fixed: false, side: true,  sp: true, maxHp: 2, hp0: 2, spread: 'paint', goal: 'ob:paint' },
  brick:   { fixed: true,  side: false, sp: true, maxHp: 3, hp0: 3, goal: 'ob:brick' }
};
var LOWERS = { stain: { maxHp: 2, goal: 'lower' }, paint: { maxHp: 1, goal: 'lower' } };
var UPPERS = { tape: { maxHp: 1, side: true, goal: 'ob:tape' } };
// 모으는 물건 — 오리는 맨 아래 칸에 닿으면, 캡슐은 옆 맞춤 · 특수로
var COLS = { duck: { side: false, sp: false, goal: 'duck' }, capsule: { side: true, sp: true, goal: 'capsule' } };
// 조합표(§4-2) — 키는 두 특수 블록 종류를 이름 차례로 이은 것
var COMBOS = { 'line+line': 'cross', 'line+stamp': 'bigcross', 'stamp+stamp': 'bigstamp', 'plane+plane': 'plane3', 'line+plane': 'carry',
  'plane+stamp': 'carry', 'globe+line': 'convert', 'globe+plane': 'convert', 'globe+stamp': 'convert', 'globe+globe': 'all' };
var BONUS_MIX = [['line', 0.6], ['plane', 0.85], ['stamp', 1]];
// 판 안 아이템(§6-2) — 이동을 안 씀. 판 앞 아이템(§6-1) · 연승 선물(§6-7)은 처음 판에 놓는 특수 블록
var BOOSTERS = ['hammer', 'rowRuler', 'colTape', 'fan'];
var PRE_BOOSTERS = ['line', 'stamp', 'globe'];   // 남은 이동 보너스(§6-4): 형광펜 60% · 비행기 25% · 도장 15%

// ── 시드 난수(mulberry32) — 상태는 게임 상태 안의 정수 하나
function rnd(st) {
  var t = (st.s = (st.s + 0x6D2B79F5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function rint(st, n) { return Math.floor(rnd(st) * n); }

function copy(o) { return JSON.parse(JSON.stringify(o)); }
function key(r, c) { return r * 16 + c; }
function spKind(sp) { return sp === 'lineH' || sp === 'lineV' ? 'line' : sp; }

// ── 칸 성질
function cellAt(S, r, c) { return r >= 0 && c >= 0 && r < S.rows && c < S.cols ? S.cells[r][c] : null; }
function valid(S, r, c) { var cl = cellAt(S, r, c); return !!cl && !cl.hole; }
function movable(it) { return !!it && (it.t === 'tile' || it.t === 'sp' || it.t === 'col' || (it.t === 'ob' && !it.fixed)); }
function canFallFrom(cl) { return !!cl && !cl.hole && !cl.upper && cl.blind == null && movable(cl.item); }
function isOpen(cl) { return !!cl && !cl.hole && !cl.item && !cl.upper && cl.blind == null; }
function swappable(cl) { return !!cl && !cl.hole && !cl.upper && cl.blind == null && movable(cl.item); }
function colorAt(S, r, c) {
  var cl = cellAt(S, r, c);
  return cl && !cl.hole && cl.item && cl.item.t === 'tile' && !cl.upper && cl.blind == null ? cl.item.color : -1;
}
function obRule(it) { return it && it.t === 'ob' ? OBS[it.ob] : null; }
function anchorItem(S, it) { return it.part ? S.cells[it.part.ar][it.part.ac].item : it; }

function newTile(S, color) { return { id: ++S.nid, t: 'tile', color: color, ls: 0 }; }
function newSp(S, sp, color) { return { id: ++S.nid, t: 'sp', sp: sp, color: color == null ? -1 : color, ls: 0 }; }

// ── 단계 자료 → 상태
function parseLevel(level, opts) {
  opts = opts || {};
  var mask = level.mask || ['#########', '#########', '#########', '#########', '#########', '#########', '#########', '#########', '#########'];
  var rows = Math.min(MAX_ROWS, mask.length), cols = 0, r, c;
  for (r = 0; r < rows; r++) cols = Math.max(cols, mask[r].length);
  cols = Math.min(MAX_COLS, cols);
  var S = {
    v: VERSION, n: level.n || 0, rows: rows, cols: cols, cells: [], blinds: [], bottom: [],
    moves: level.moves || 20, colors: Math.max(2, Math.min(5, level.colors || 5)), gold: !!opts.goldGlobe,
    goals: [], rng: { s: (opts.seed != null ? opts.seed : (level.seed || 1)) | 0 }, nid: 0, seq: 0,
    result: 'play', moveNo: 0, continues: 0, bonusDone: false, placed: [],
    stats: { shuffles: 0, recolors: 0, made: { lineH: 0, lineV: 0, plane: 0, stamp: 0, globe: 0 }, cleared: 0, chainMax: 0, overflow: 0, stuck: 0, boosters: 0 }
  };
  for (r = 0; r < rows; r++) {
    var row = [];
    for (c = 0; c < cols; c++) {
      var ch = mask[r][c] || '.';
      row.push({ hole: ch === '.' || ch === ' ', spawn: false, lower: null, item: null, upper: null, blind: null });
    }
    S.cells.push(row);
  }
  // 입구: 열에 'S' 가 있으면 그 칸들, 없으면 그 열의 맨 위 유효 칸. bottom: 그 열의 마지막 유효 칸(오리가 모이는 곳)
  for (c = 0; c < cols; c++) {
    var hasS = false;
    for (r = 0; r < rows; r++) if ((mask[r][c] || '.') === 'S') { S.cells[r][c].spawn = true; hasS = true; }
    if (!hasS) for (r = 0; r < rows; r++) if (!S.cells[r][c].hole) { S.cells[r][c].spawn = true; break; }
    S.bottom.push(-1);
    for (r = rows - 1; r >= 0; r--) if (!S.cells[r][c].hole) { S.bottom[c] = r; break; }
  }
  (level.place || []).forEach(function (p) { placeOne(S, p); });
  (level.goals || []).forEach(function (g) { S.goals.push({ id: g[0], need: g[1], left: g[1] }); });
  return S;
}
function placeOne(S, p) {
  var kind = p[0], o = p[3] || {}, r = p[1], c = p[2], rule = OBS[kind], i, j;
  if (kind === 'blind') {   // ['blind', [r0,c0,r1,c1], {color, need}]
    var b = { id: ++S.nid, r0: r[0], c0: r[1], r1: r[2], c1: r[3], color: (c && c.color) | 0, need: (c && c.need) || 10 };
    b.left = b.need; S.blinds.push(b);
    for (i = b.r0; i <= b.r1; i++) for (j = b.c0; j <= b.c1; j++) if (valid(S, i, j)) S.cells[i][j].blind = b.id;
    return;
  }
  if (!valid(S, r, c)) return;
  var cl = S.cells[r][c];
  if (kind === 'tile') cl.item = newTile(S, o.color | 0);
  else if (SPECIALS.indexOf(kind) >= 0) cl.item = newSp(S, kind, o.color);
  else if (rule) {
    var w = rule.w || 1, h = rule.h || 1;
    for (i = 0; i < h; i++) for (j = 0; j < w; j++) { var q = cellAt(S, r + i, c + j); if (!q || q.hole || (q.item && q.item.t === 'ob')) return; }
    var it = { id: ++S.nid, t: 'ob', ob: kind, hp: Math.max(1, Math.min(rule.maxHp, o.hp || rule.hp0 || 1)), fixed: rule.fixed, ls: 0 };
    if (rule.color === 'one') it.color = (o.color | 0) % 5;
    if (rule.color === 'pens') { it.pens = (o.pens || [0, 1, 2, 3]).slice(0, 4); it.hp = it.pens.length; }
    if (rule.endless) { it.hp = 1; it.n = Math.min(2, o.n | 0); }
    cl.item = it;
    for (i = 0; i < h; i++) for (j = 0; j < w; j++) if (i || j) S.cells[r + i][c + j].item = { id: it.id, t: 'ob', ob: kind, fixed: true, part: { ar: r, ac: c } };
  }
  else if (kind === 'paintmark') cl.lower = { t: 'paint', hp: 1 };
  else if (LOWERS[kind]) cl.lower = { t: kind, hp: Math.max(1, Math.min(LOWERS[kind].maxHp, o.hp || 1)) };
  else if (UPPERS[kind]) cl.upper = { t: kind, hp: 1 };
  else if (COLS[kind]) cl.item = { id: ++S.nid, t: 'col', col: kind, ls: 0 };
  else if (kind === 'empty') cl.item = null;
}

// ── 맞춤 찾기(§3-4): 3줄 이상 + 2×2 를 표시하고, 같은 색끼리 이어진 덩어리로 묶는다
function findMatches(S) {
  var R = S.rows, C = S.cols, r, c, runs = [], squares = [], mark = {};
  for (r = 0; r < R; r++) {
    c = 0;
    while (c < C) {
      var col = colorAt(S, r, c), e = c;
      if (col < 0) { c++; continue; }
      while (e + 1 < C && colorAt(S, r, e + 1) === col) e++;
      if (e - c + 1 >= 3) { var cs = []; for (var k = c; k <= e; k++) cs.push([r, k]); runs.push({ dir: 'h', color: col, cells: cs }); }
      c = e + 1;
    }
  }
  for (c = 0; c < C; c++) {
    r = 0;
    while (r < R) {
      var col2 = colorAt(S, r, c), e2 = r;
      if (col2 < 0) { r++; continue; }
      while (e2 + 1 < R && colorAt(S, e2 + 1, c) === col2) e2++;
      if (e2 - r + 1 >= 3) { var cs2 = []; for (var k2 = r; k2 <= e2; k2++) cs2.push([k2, c]); runs.push({ dir: 'v', color: col2, cells: cs2 }); }
      r = e2 + 1;
    }
  }
  for (r = 0; r < R - 1; r++) for (c = 0; c < C - 1; c++) {
    var q = colorAt(S, r, c);
    if (q >= 0 && colorAt(S, r, c + 1) === q && colorAt(S, r + 1, c) === q && colorAt(S, r + 1, c + 1) === q)
      squares.push({ color: q, cells: [[r, c], [r, c + 1], [r + 1, c], [r + 1, c + 1]] });
  }
  runs.forEach(function (x) { x.cells.forEach(function (p) { mark[key(p[0], p[1])] = 1; }); });
  squares.forEach(function (x) { x.cells.forEach(function (p) { mark[key(p[0], p[1])] = 1; }); });
  var seen = {}, groups = [], compOf = {};
  for (r = 0; r < R; r++) for (c = 0; c < C; c++) {
    var k0 = key(r, c);
    if (!mark[k0] || seen[k0]) continue;
    var color = colorAt(S, r, c), stack = [[r, c]], cells = [], gi = groups.length;
    seen[k0] = 1;
    while (stack.length) {
      var p = stack.pop(); cells.push(p); compOf[key(p[0], p[1])] = gi;
      for (var d = 0; d < 4; d++) {
        var nr = p[0] + DIRS4[d][0], nc = p[1] + DIRS4[d][1], nk = key(nr, nc);
        if (mark[nk] && !seen[nk] && colorAt(S, nr, nc) === color) { seen[nk] = 1; stack.push([nr, nc]); }
      }
    }
    cells.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    groups.push({ color: color, cells: cells, runs: [], squares: [] });
  }
  runs.forEach(function (x) { groups[compOf[key(x.cells[0][0], x.cells[0][1])]].runs.push(x); });
  squares.forEach(function (x) { groups[compOf[key(x.cells[0][0], x.cells[0][1])]].squares.push(x); });
  return groups;
}

// 덩어리 하나가 무엇을 만드는지(PRIORITY 차례로 처음 맞는 것) — {make, feat:[칸], cross?}
function classify(g) {
  for (var i = 0; i < PRIORITY.length; i++) {
    var kind = PRIORITY[i], j, k;
    if (kind === 'globe') {
      for (j = 0; j < g.runs.length; j++) if (g.runs[j].cells.length >= 5) return { make: 'globe', feat: g.runs[j].cells };
    } else if (kind === 'stamp') {
      for (j = 0; j < g.runs.length; j++) for (k = 0; k < g.runs.length; k++) {
        var a = g.runs[j], b = g.runs[k];
        if (a.dir !== 'h' || b.dir !== 'v') continue;
        for (var x = 0; x < a.cells.length; x++) for (var y = 0; y < b.cells.length; y++)
          if (a.cells[x][0] === b.cells[y][0] && a.cells[x][1] === b.cells[y][1])
            return { make: 'stamp', feat: a.cells.concat(b.cells.filter(function (p) { return !(p[0] === a.cells[x][0] && p[1] === a.cells[x][1]); })), cross: a.cells[x] };
      }
    } else if (kind === 'line') {
      for (j = 0; j < g.runs.length; j++) if (g.runs[j].cells.length >= 4) return { make: g.runs[j].dir === 'h' ? 'lineV' : 'lineH', feat: g.runs[j].cells };
    } else if (kind === 'plane') {
      if (g.squares.length) return { make: 'plane', feat: g.squares[0].cells };
    }
  }
  return null;
}

// 생기는 자리: 사람이 옮긴 칸 → 가장 늦게 내려앉은 칸 → 교차점 → 가운데
function choosePos(S, g, cls, moved) {
  var i, j;
  for (i = 0; i < moved.length; i++) for (j = 0; j < g.cells.length; j++)
    if (g.cells[j][0] === moved[i][0] && g.cells[j][1] === moved[i][1]) return moved[i];
  var best = -1, cand = [];
  cls.feat.forEach(function (p) {
    var it = S.cells[p[0]][p[1]].item, ls = it ? it.ls || 0 : 0;
    if (ls > best) { best = ls; cand = [p]; } else if (ls === best) cand.push(p);
  });
  if (cls.cross) for (i = 0; i < cand.length; i++) if (cand[i][0] === cls.cross[0] && cand[i][1] === cls.cross[1]) return cls.cross;
  cand.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
  return cand[Math.floor((cand.length - 1) / 2)];
}

// ── 목표
function addGoal(S, id, n, p, t, ev) {
  for (var i = 0; i < S.goals.length; i++) {
    var g = S.goals[i];
    if (g.id === id && g.left > 0) { g.left = Math.max(0, g.left - n); ev.push({ e: 'goal', t: t, id: id, left: g.left, p: p }); return; }
  }
}
function goalOpen(S, id) { for (var i = 0; i < S.goals.length; i++) if (S.goals[i].id === id && S.goals[i].left > 0) return true; return false; }

// ── 한 단계 풀기(맞춤 → 지움 → 겹 깸 → 특수 효과 물결)
// fresh: 이 단계에 막 생긴 특수 블록 · pend: 스노볼 조합으로 바뀌어 제 차례를 기다리는 특수 블록 · taken: 비행기들이 이미 고른 곳
function Ctx(S, ev) { this.S = S; this.ev = ev; this.q = []; this.qs = 0; this.fresh = {}; this.pend = {}; this.taken = {}; this.matched = {}; this.sideSeen = {}; this.maxT = 0; }
Ctx.prototype.push = function (e) { if (e.t != null && e.t > this.maxT) this.maxT = e.t; this.ev.push(e); };
Ctx.prototype.skip = function (k) { return this.fresh[k] || this.pend[k]; };

// 지운 블록 색 하나를 셈 — 색 목표 + 블라인드(그 색 N개를 지우면 걷힘)
function countColor(cx, color, p, t) {
  var S = cx.S;
  addGoal(S, 'color:' + color, 1, p, t, cx.ev);
  for (var i = 0; i < S.blinds.length; i++) {
    var b = S.blinds[i];
    if (b.left <= 0 || b.color !== color) continue;
    b.left--; cx.push({ e: 'blind', t: t, id: b.id, left: b.left, p: p });
    if (!b.left) {
      for (var r = b.r0; r <= b.r1; r++) for (var c = b.c0; c <= b.c1; c++) { var cl = cellAt(S, r, c); if (cl && cl.blind === b.id) cl.blind = null; }
      cx.push({ e: 'blindOpen', t: t, id: b.id });
      addGoal(S, 'ob:blind', 1, [(b.r0 + b.r1) >> 1, (b.c0 + b.c1) >> 1], t, cx.ev);
    }
  }
}
function hitLower(cx, r, c, t) {
  var cl = cx.S.cells[r][c];
  if (!cl.lower) return;
  cl.lower.hp--;
  var gone = cl.lower.hp <= 0, what = cl.lower.t;
  cx.push({ e: 'hit', t: t, p: [r, c], layer: 'lower', what: what, hp: Math.max(0, cl.lower.hp), gone: gone });
  if (gone) { cl.lower = null; addGoal(cx.S, LOWERS[what].goal, 1, [r, c], t, cx.ev); }
}
function hitUpper(cx, r, c, t) {
  var cl = cx.S.cells[r][c], what = cl.upper.t;
  cl.upper.hp--;
  var gone = cl.upper.hp <= 0;
  cx.push({ e: 'hit', t: t, p: [r, c], layer: 'upper', what: what, hp: Math.max(0, cl.upper.hp), gone: gone });
  if (gone) { cl.upper = null; addGoal(cx.S, UPPERS[what].goal, 1, [r, c], t, cx.ev); }
}
function removeOb(S, r, c, rule) {
  for (var i = 0; i < (rule.h || 1); i++) for (var j = 0; j < (rule.w || 1); j++) S.cells[r + i][c + j].item = null;
}
// 장애물 한 겹 — 큰 칸은 본체로 모아 친다. 깨졌으면 true(옆 맞춤 「한 단계 1겹」 셈에 씀)
function hitObstacle(cx, r, c, t, cause) {
  var S = cx.S, it = S.cells[r][c].item;
  if (it.part) { r = it.part.ar; c = it.part.ac; it = S.cells[r][c].item; }
  var rule = OBS[it.ob];
  if (!rule || (cause.kind === 'side' ? !rule.side : !rule.sp)) return false;
  var hit = { e: 'hit', t: t, p: [r, c], id: it.id, layer: 'item', what: it.ob, hp: 0, gone: false };
  if (rule.endless === 'fax') {
    hit.hp = 1; cx.push(hit);
    if (goalOpen(S, rule.goal)) addGoal(S, rule.goal, 1, [r, c], t, cx.ev);
    if (!goalOpen(S, rule.goal)) { hit.gone = true; hit.hp = 0; removeOb(S, r, c, rule); }
    return true;
  }
  if (rule.endless === 'gacha') {
    it.n = Math.min(3, (it.n || 0) + 1);
    hit.hp = it.n; cx.push(hit);
    if (it.n >= 3 && morphCapsule(cx, r, c, t)) { it.n = 0; hit.made = true; }
    return true;
  }
  if (rule.color === 'one' && cause.kind === 'side' && cause.color !== it.color) return false;
  if (rule.color === 'pens') {
    var idx = -1, i;
    if (cause.kind === 'side') idx = it.pens.indexOf(cause.color);
    else for (i = 0; i < it.pens.length; i++) if (it.pens[i] >= 0) { idx = i; break; }
    if (idx < 0) return false;
    hit.pen = it.pens[idx]; it.pens[idx] = -1; hit.pens = it.pens.slice();
  }
  it.hp--;
  hit.hp = Math.max(0, it.hp); hit.gone = it.hp <= 0;
  cx.push(hit);
  if (rule.per) addGoal(S, rule.goal, 1, [r, c], t, cx.ev);
  if (hit.gone) {
    removeOb(S, r, c, rule);
    if (!rule.per) addGoal(S, rule.goal, 1, [r, c], t, cx.ev);
    if (rule.spread) spreadLower(cx, r, c, rule, t);
  }
  return true;
}
// 커피포트(2×2 → 둘레 4×4) · 물감 통(1×1 → 3×3): 아래층이 빈 칸에 1겹을 깐다(고정 장애물 · 블라인드 칸은 뺌)
function spreadLower(cx, r, c, rule, t) {
  var S = cx.S, cells = [], i, j;
  for (i = r - 1; i <= r + (rule.h || 1); i++) for (j = c - 1; j <= c + (rule.w || 1); j++) {
    var cl = cellAt(S, i, j);
    if (!cl || cl.hole || cl.lower || cl.blind != null || (cl.item && cl.item.t === 'ob' && cl.item.fixed)) continue;
    cl.lower = { t: rule.spread, hp: 1 }; cells.push([i, j]);
  }
  if (cells.length) cx.push({ e: 'spread', t: t, p: [r, c], what: rule.spread, cells: cells });
}
// 캡슐 뽑기: 둘레 8칸 가운데 블록 하나를 캡슐로
function morphCapsule(cx, r, c, t) {
  var S = cx.S, cand = [];
  DIRS8.forEach(function (d) {
    var rr = r + d[0], cc = c + d[1], cl = cellAt(S, rr, cc);
    if (cl && !cl.hole && !cl.upper && cl.blind == null && cl.item && cl.item.t === 'tile' && !cx.skip(key(rr, cc)) && !cx.matched[key(rr, cc)]) cand.push([rr, cc]);
  });
  if (!cand.length) return false;
  var p = cand[rint(S.rng, cand.length)], cl = S.cells[p[0]][p[1]], old = cl.item;
  cl.item = { id: ++S.nid, t: 'col', col: 'capsule', ls: old.ls };
  cx.push({ e: 'morph', t: t + 80, p: p, from: old.id, item: copy(cl.item) });
  return true;
}
function collect(cx, r, c, t) {
  var S = cx.S, cl = S.cells[r][c], it = cl.item;
  cl.item = null;
  cx.push({ e: 'collect', t: t, p: [r, c], id: it.id, what: it.col });
  addGoal(S, COLS[it.col].goal, 1, [r, c], t, cx.ev);
}
// 옆 맞춤: 일반 맞춤으로 지워진 칸의 상하좌우 — 한 단계에 장애물 하나는 1겹만(실제로 깨진 때만 셈)
function sideHit(cx, r, c, color, t) {
  var cl = cellAt(cx.S, r, c);
  if (!cl || cl.hole || cl.blind != null) return;
  if (cl.upper) {
    if (UPPERS[cl.upper.t].side && !cx.sideSeen['u' + key(r, c)]) { cx.sideSeen['u' + key(r, c)] = 1; hitUpper(cx, r, c, t); }
    return;
  }
  var it = cl.item;
  if (!it) return;
  if (it.t === 'ob' && !cx.sideSeen['o' + it.id] && hitObstacle(cx, r, c, t, { kind: 'side', color: color })) cx.sideSeen['o' + it.id] = 1;
  else if (it.t === 'col' && COLS[it.col].side) collect(cx, r, c, t);
}
function clearTile(cx, r, c, t, by, to) {
  var S = cx.S, cl = S.cells[r][c], it = cl.item;
  cx.push({ e: 'clear', t: t, p: [r, c], id: it.id, color: it.color, by: by, to: to || null });
  cl.item = null; S.stats.cleared++;
  countColor(cx, it.color, [r, c], t);
}
// 특수 효과가 칸 하나에 닿음 — 위층 → 가운데층 → 아래층 차례로 맨 위 것 1겹(블록이면 지우고 그 밑 얼룩도 1겹)
function spHit(cx, r, c, t, fx) {
  var S = cx.S, cl = cellAt(S, r, c);
  if (!cl || cl.hole) return;
  if (cx.skip(key(r, c)) || cl.blind != null) return;
  if (cl.upper) { hitUpper(cx, r, c, t); return; }
  var it = cl.item;
  if (it) {
    if (it.t === 'tile') { clearTile(cx, r, c, t, 'sp'); hitLower(cx, r, c, t); }
    else if (it.t === 'sp') {
      cl.item = null;
      cx.push({ e: 'trigger', t: t, p: [r, c], id: it.id, sp: it.sp });
      enqueue(cx, { r: r, c: c, t: t + T.wave, item: it });
    } else if (it.t === 'ob') {
      if (fx.seen['o' + it.id]) return;
      fx.seen['o' + it.id] = 1;
      hitObstacle(cx, r, c, t, { kind: 'sp' });
    } else if (it.t === 'col' && COLS[it.col].sp) collect(cx, r, c, t);
    return;
  }
  hitLower(cx, r, c, t);
}
function enqueue(cx, a) { a.s = cx.qs++; cx.q.push(a); return a; }
function hitCells(cx, cells, t, fx) { cells.forEach(function (p) { spHit(cx, p[0], p[1], t + p[2], fx); }); }

// 가장 많은 색 n 개(황금 스노볼이면 2)
function topColors(S, cx, n) {
  var cnt = [0, 0, 0, 0, 0], r, c, out = [];
  for (r = 0; r < S.rows; r++) for (c = 0; c < S.cols; c++) { var k = colorAt(S, r, c); if (k >= 0 && !cx.skip(key(r, c))) cnt[k]++; }
  for (var j = 0; j < n; j++) {
    var bi = -1;
    for (var i = 0; i < 5; i++) if (cnt[i] > 0 && out.indexOf(i) < 0 && (bi < 0 || cnt[i] > cnt[bi])) bi = i;
    if (bi >= 0) out.push(bi);
  }
  return out;
}
function tilesOf(S, cx, colors, r0, c0) {
  var list = [];
  for (var r = 0; r < S.rows; r++) for (var c = 0; c < S.cols; c++)
    if (colors.indexOf(colorAt(S, r, c)) >= 0 && !cx.skip(key(r, c))) list.push([r, c, Math.abs(r - r0) + Math.abs(c - c0)]);
  list.sort(function (x, y) { return x[2] - y[2] || x[0] - y[0] || x[1] - y[1]; });
  return list;
}

// 노리는 곳(§4-1) 한 칸의 등급 — [0, 겹]: 남은 목표에 드는 것 · [2, 겹]: 아무 장애물 · [3, 0]: 블록 · null
function tierOf(S, r, c) {
  var cl = S.cells[r][c], it = cl.item;
  if (cl.upper) return [goalOpen(S, UPPERS[cl.upper.t].goal) ? 0 : 2, cl.upper.hp];
  if (it && it.t === 'ob') {
    var an = anchorItem(S, it), rule = OBS[an.ob];
    if (rule.endless === 'gacha') return [goalOpen(S, 'capsule') ? 0 : 2, 3 - an.n];
    return [goalOpen(S, rule.goal) ? 0 : 2, an.hp];
  }
  if (it && it.t === 'col') return it.col === 'capsule' && goalOpen(S, 'capsule') ? [0, 1] : null;
  if (cl.lower && goalOpen(S, LOWERS[cl.lower.t].goal)) return [0, cl.lower.hp + (it ? 1 : 0)];
  if (it && it.t === 'tile') return goalOpen(S, 'color:' + it.color) ? [0, 1] : [3, 0];
  return null;
}
function usable(S, cx, skip, r, c) { var cl = S.cells[r][c], k = key(r, c); return !cl.hole && cl.blind == null && !skip[k] && !cx.skip(k) && !cx.taken[k]; }
// 종이비행기가 노리는 곳: ① 남은 목표 가운데 겹이 가장 적은 것 ② 맨 아래에 가까운 오리 바로 아래 칸 ③ 아무 장애물 ④ 무작위 블록
function planeTarget(S, cx, skip) {
  var r, c, tiers = [[], [], [], []], best = [1e9, 1e9, 1e9, 1e9];
  function add(tier, p, w) { if (w < best[tier]) { best[tier] = w; tiers[tier] = [p]; } else if (w === best[tier]) tiers[tier].push(p); }
  var duckGoal = goalOpen(S, 'duck');
  for (r = 0; r < S.rows; r++) for (c = 0; c < S.cols; c++) {
    var it = S.cells[r][c].item;
    if (duckGoal && it && it.t === 'col' && it.col === 'duck' && r + 1 <= S.bottom[c] && valid(S, r + 1, c) && usable(S, cx, skip, r + 1, c)) add(1, [r + 1, c], S.bottom[c] - r);
    if (!usable(S, cx, skip, r, c)) continue;
    var tr = tierOf(S, r, c);
    if (tr) add(tr[0], [r, c], tr[1]);
  }
  for (var i = 0; i < 4; i++) if (tiers[i].length) return take(cx, tiers[i][rint(S.rng, tiers[i].length)]);
  return null;
}
function take(cx, p) { cx.taken[key(p[0], p[1])] = 1; return p; }
// 형광펜을 실은 비행기: 그 방향 줄에 남은 목표가 가장 많은 줄 → 그 줄에서 겹이 가장 적은 목표 칸
function lineTarget(S, cx, skip, dir) {
  var n = dir === 'h' ? S.rows : S.cols, m = dir === 'h' ? S.cols : S.rows, bestN = 0, lines = [], i, j;
  for (i = 0; i < n; i++) {
    var cnt = 0;
    for (j = 0; j < m; j++) { var r = dir === 'h' ? i : j, c = dir === 'h' ? j : i; if (usable(S, cx, skip, r, c)) { var tr = tierOf(S, r, c); if (tr && tr[0] === 0) cnt++; } }
    if (cnt > bestN) { bestN = cnt; lines = [i]; } else if (cnt === bestN && cnt > 0) lines.push(i);
  }
  if (!bestN) return planeTarget(S, cx, skip);
  var li = lines[rint(S.rng, lines.length)], bw = 1e9, cand = [];
  for (j = 0; j < m; j++) {
    var rr = dir === 'h' ? li : j, cc = dir === 'h' ? j : li;
    if (!usable(S, cx, skip, rr, cc)) continue;
    var t2 = tierOf(S, rr, cc);
    if (!t2 || t2[0]) continue;
    if (t2[1] < bw) { bw = t2[1]; cand = [[rr, cc]]; } else if (t2[1] === bw) cand.push([rr, cc]);
  }
  return take(cx, cand[rint(S.rng, cand.length)]);
}

// 효과 칸 모음 — [r, c, 늦음ms]
function lineCells(S, r, c, dir, d0, out) {
  out = out || [];
  var len = dir === 'h' ? S.cols : S.rows;
  if (dir === 'h' ? (r < 0 || r >= S.rows) : (c < 0 || c >= S.cols)) return out;
  for (var i = 0; i < len; i++) {
    var rr = dir === 'h' ? r : i, cc = dir === 'h' ? i : c;
    if (valid(S, rr, cc)) out.push([rr, cc, d0 + Math.abs(dir === 'h' ? cc - c : rr - r) * T.lineCell]);
  }
  return out;
}
function boxCells(S, r, c, R, d) { var out = []; for (var dr = -R; dr <= R; dr++) for (var dc = -R; dc <= R; dc++) if (valid(S, r + dr, c + dc)) out.push([r + dr, c + dc, d]); return out; }
function uniq(cells) {
  var m = {}, out = [];
  cells.forEach(function (p) { var k = key(p[0], p[1]); if (!(k in m) || p[2] < m[k][2]) m[k] = p; });
  for (var k in m) out.push(m[k]);
  out.sort(function (x, y) { return x[2] - y[2] || x[0] - y[0] || x[1] - y[1]; });
  return out;
}
function fxEv(cx, t, sp, r, c, it, cells, extra) {
  var e = { e: 'fx', t: t, sp: sp, p: [r, c], id: it.id, color: it.color, cells: cells };
  for (var k in extra) e[k] = extra[k];
  cx.push(e); return e;
}
// 비행기 이륙(제자리 + 상하좌우) → 노리는 곳으로 날아가 침. carry 가 있으면 도착 칸에서 그 특수 블록이 터짐
function flyPlane(cx, r, c, t, it, carry) {
  var S = cx.S, cells = [[r, c, T.planeTake]], skip = {}, i;
  skip[key(r, c)] = 1;
  for (i = 0; i < 4; i++) { var nr = r + DIRS4[i][0], nc = c + DIRS4[i][1]; if (valid(S, nr, nc)) { cells.push([nr, nc, T.planeTake]); skip[key(nr, nc)] = 1; } }
  hitCells(cx, cells, t, { seen: {} });
  var tg = carry && spKind(carry.sp) === 'line' ? lineTarget(S, cx, skip, carry.sp === 'lineH' ? 'h' : 'v') : planeTarget(S, cx, skip);
  var land = T.planeTake + T.planeFly;
  fxEv(cx, t, 'plane', r, c, it, cells, carry ? { target: tg, land: land, carry: carry.sp } : { target: tg, land: land });
  if (!tg) return;
  cx.maxT = Math.max(cx.maxT, t + land);
  if (carry) enqueue(cx, { r: tg[0], c: tg[1], t: t + land, item: { id: carry.id, t: 'sp', sp: carry.sp, color: carry.color } });
  else spHit(cx, tg[0], tg[1], t + land, { seen: {} });
}

function activate(cx, a) {
  if (a.combo) return combo(cx, a);
  if (a.booster) return boosterFx(cx, a);
  var S = cx.S, r = a.r, c = a.c, it = a.item, t = a.t, cells, sp = it.sp;
  if (a.own) { var c0 = S.cells[r][c]; if (c0.item && c0.item.id === it.id) c0.item = null; delete cx.pend[key(r, c)]; }
  if (sp === 'lineH' || sp === 'lineV') {
    cells = lineCells(S, r, c, sp === 'lineH' ? 'h' : 'v', 0).sort(function (x, y) { return x[2] - y[2]; });
    fxEv(cx, t, sp, r, c, it, cells);
    hitCells(cx, cells, t, { seen: {} });
  } else if (sp === 'stamp') {
    cells = boxCells(S, r, c, 2, T.stampLift);
    fxEv(cx, t, sp, r, c, it, cells);
    hitCells(cx, cells, t, { seen: {} });
  } else if (sp === 'plane') flyPlane(cx, r, c, t, it, null);
  else if (sp === 'globe') {
    var colors = a.color != null && a.color >= 0 ? [a.color] : topColors(S, cx, S.gold ? 2 : 1);
    if (S.gold && a.color != null && a.color >= 0) { var more = topColors(S, cx, 2).filter(function (k) { return k !== a.color; }); if (more.length) colors.push(more[0]); }
    var list = tilesOf(S, cx, colors, r, c), stp = list.length ? Math.min(T.globeStep, T.globeMax / list.length) : 0;
    cells = list.map(function (p, j) { return [p[0], p[1], Math.round(T.globeGather + j * stp)]; });
    cells.push([r, c, 0]);
    fxEv(cx, t, sp, r, c, it, cells, { color: colors.length ? colors[0] : -1, colors: colors });
    hitCells(cx, cells, t, { seen: {} });
  }
}
// 조합(§4-2) — 도착 칸(사람이 끌어 놓은 칸) 기준. a.item = 끌어 놓은 것, a.item2 = 원래 그 자리에 있던 것
function combo(cx, a) {
  var S = cx.S, r = a.r, c = a.c, t = a.t, x = a.item, y = a.item2, k = a.combo, cells = [], d;
  var kx = spKind(x.sp);
  function pick(kind) { return kx === kind ? x : y; }
  function other(kind) { return kx === kind ? y : x; }
  if (k === 'line+line') cells = uniq(lineCells(S, r, c, 'h', 0, lineCells(S, r, c, 'v', 0)));
  else if (k === 'line+stamp') { for (d = -1; d <= 1; d++) { lineCells(S, r + d, c, 'h', T.comboLift, cells); lineCells(S, r, c + d, 'v', T.comboLift, cells); } cells = uniq(cells); }
  else if (k === 'stamp+stamp') cells = boxCells(S, r, c, 4, T.bigLift);
  else if (k === 'globe+globe') {
    for (var rr = 0; rr < S.rows; rr++) for (var cc = 0; cc < S.cols; cc++) if (valid(S, rr, cc)) cells.push([rr, cc, T.globeGather + (Math.abs(rr - r) + Math.abs(cc - c)) * T.allStep]);
    cells = uniq(cells);
  } else if (k === 'plane+plane') {
    var skip = {}, targets = [];
    cells.push([r, c, T.planeTake]); skip[key(r, c)] = 1;
    DIRS4.forEach(function (q) { if (valid(S, r + q[0], c + q[1])) { cells.push([r + q[0], c + q[1], T.planeTake]); skip[key(r + q[0], c + q[1])] = 1; } });
    hitCells(cx, cells, t, { seen: {} });
    for (d = 0; d < 3; d++) { var tg = planeTarget(S, cx, skip); if (tg) targets.push(tg); }
    fxEv(cx, t, k, r, c, x, cells, { targets: targets, land: T.planeTake + T.planeFly, gap: T.planeGap, id2: y.id });
    targets.forEach(function (p, j) { var ht = t + T.planeTake + T.planeFly + j * T.planeGap; cx.maxT = Math.max(cx.maxT, ht); spHit(cx, p[0], p[1], ht, { seen: {} }); });
    return;
  } else if (k === 'line+plane' || k === 'plane+stamp') {
    var pl = pick('plane'), cr = other('plane');
    cx.push({ e: 'trigger', t: t, p: [r, c], id: cr.id, sp: cr.sp, ride: pl.id });
    flyPlane(cx, r, c, t, pl, cr);
    return;
  } else {   // 스노볼 + 형광펜 · 비행기 · 도장: 가장 많은 색 블록이 전부 그 특수 블록으로 바뀐 뒤 가까운 칸부터 터짐
    var gl = pick('globe'), sp2 = other('globe'), kind = spKind(sp2.sp), cols = topColors(S, cx, S.gold ? 2 : 1);
    var list = tilesOf(S, cx, cols, r, c), gap = list.length ? Math.min(T.convStep, T.convMax / list.length) : 0, zap = list.length ? Math.min(T.globeStep, T.globeMax / list.length) : 0;
    var conv = { e: 'convert', t: t, p: [r, c], id: gl.id, id2: sp2.id, kind: kind, colors: cols, items: [] };
    cx.push(conv);
    list.forEach(function (p, j) {
      var cl = S.cells[p[0]][p[1]], old = cl.item, sp = kind === 'line' ? (rnd(S.rng) < 0.5 ? 'lineH' : 'lineV') : kind, tc = Math.round(T.globeGather + j * zap);
      countColor(cx, old.color, [p[0], p[1]], t + tc); S.stats.cleared++;
      cl.item = { id: old.id, t: 'sp', sp: sp, color: old.color, ls: old.ls };
      cx.pend[key(p[0], p[1])] = 1;
      conv.items.push({ p: [p[0], p[1]], id: old.id, sp: sp, d: tc });
      var fire = t + T.convert + Math.round(j * gap);
      enqueue(cx, { r: p[0], c: p[1], t: fire, item: cl.item, own: true });
      if (S.gold && kind === 'stamp') enqueue(cx, { r: p[0], c: p[1], t: fire + 260, item: { id: old.id, t: 'sp', sp: 'stamp', color: old.color } });
    });
    cx.maxT = Math.max(cx.maxT, t + T.convert);
    return;
  }
  fxEv(cx, t, k, r, c, x, cells, { id2: y.id });
  hitCells(cx, cells, t, { seen: {} });
}

function resolveStep(S, ev, groups, moved, acts) {
  var cx = new Ctx(S, ev), i;
  groups.forEach(function (g) { g.cells.forEach(function (p) { cx.matched[key(p[0], p[1])] = 1; }); });
  groups.forEach(function (g) {
    var cls = classify(g), pos = cls ? choosePos(S, g, cls, moved) : null;
    cx.push({ e: 'match', t: 0, color: g.color, cells: g.cells, make: cls ? cls.make : null, at: pos });
    g.cells.forEach(function (p) {
      var r = p[0], c = p[1], cl = S.cells[r][c];
      if (!cl.item || cl.item.t !== 'tile') return;
      if (pos && pos[0] === r && pos[1] === c) {
        var old = cl.item;
        cx.push({ e: 'clear', t: 0, p: [r, c], id: old.id, color: old.color, by: 'match', to: pos });
        S.stats.cleared++;
        countColor(cx, old.color, [r, c], 0);
        cl.item = newSp(S, cls.make, g.color);
        cl.item.ls = ++S.seq;
        cx.fresh[key(r, c)] = 1;
        S.stats.made[cls.make]++;
        cx.push({ e: 'create', t: T.create, p: [r, c], item: copy(cl.item) });
      } else clearTile(cx, r, c, 0, 'match', pos);
      hitLower(cx, r, c, 0);
    });
    g.cells.forEach(function (p) { for (var d = 0; d < 4; d++) sideHit(cx, p[0] + DIRS4[d][0], p[1] + DIRS4[d][1], g.color, 0); });
  });
  for (i = 0; i < acts.length; i++) { if (acts[i].own) cx.pend[key(acts[i].r, acts[i].c)] = 1; enqueue(cx, acts[i]); }
  var guard = 0;
  while (cx.q.length && guard++ < 3000) {
    var bi = 0;
    for (i = 1; i < cx.q.length; i++) if (cx.q[i].t < cx.q[bi].t || (cx.q[i].t === cx.q[bi].t && cx.q[i].s < cx.q[bi].s)) bi = i;
    activate(cx, cx.q.splice(bi, 1)[0]);
  }
  return cx.maxT;
}

// ── 떨어짐(§3-3): 틱마다 ① 곧게(아래 줄부터) · 입구에서 새 블록 ② 곧은 것이 하나도 없을 때만 대각선(왼쪽 위 → 오른쪽 위)
function gravity(S) {
  var R = S.rows, C = S.cols, cells = S.cells, rec = {}, order = [], tick = 0, r, c, guard = 0;
  function note(it, fr, fc, tr, tc) {
    var k = rec[it.id];
    if (!k) { k = rec[it.id] = { id: it.id, from: [fr, fc], steps: [] }; order.push(k); }
    k.steps.push([tick, tr, tc]);
  }
  while (guard++ < 2000) {
    var any = false, moved = {};
    for (r = R - 1; r >= 0; r--) for (c = 0; c < C; c++) {
      var cl = cells[r][c];
      if (!isOpen(cl)) continue;
      var up = r > 0 ? cells[r - 1][c] : null;
      if (up && !up.hole) {
        if (canFallFrom(up)) { if (!moved[up.item.id]) { var it = up.item; up.item = null; cl.item = it; moved[it.id] = 1; note(it, r - 1, c, r, c); any = true; } continue; }
        if (isOpen(up)) continue;
      }
      if (cl.spawn) {
        var nt = newTile(S, rint(S.rng, S.colors));
        cl.item = nt; moved[nt.id] = 1; note(nt, r - 1, c, r, c); rec[nt.id].spawn = copy(nt); any = true;
      }
    }
    if (!any) {
      var vac = {};
      for (r = R - 1; r >= 1; r--) for (c = 0; c < C; c++) {
        var e = cells[r][c];
        // 곧게 오는 것이 하나도 없는 틱 — 이때 빈 칸은 모두 위에서 받을 길이 없는 칸(막힌 칸 밑 · 그 밑으로 이어진 빈 칸)
        if (!isOpen(e) || e.spawn || vac[key(r, c)]) continue;
        if (canFallFrom(cells[r - 1][c])) continue;   // 이 틱에 위가 막 차서 다음 틱에 곧게 올 칸
        for (var s = 0; s < 2; s++) {
          var sc = c + (s === 0 ? -1 : 1), src = cellAt(S, r - 1, sc);
          if (!canFallFrom(src) || moved[src.item.id]) continue;
          if (isOpen(cellAt(S, r, sc))) continue;                   // 제 열로 곧게 떨어질 것은 뺏지 않음
          var it2 = src.item; src.item = null; e.item = it2; moved[it2.id] = 1; vac[key(r - 1, sc)] = 1; note(it2, r - 1, sc, r, c); any = true;
          break;
        }
      }
    }
    if (!any) break;
    tick++;
  }
  order.slice().sort(function (a, b) {
    var la = a.steps[a.steps.length - 1], lb = b.steps[b.steps.length - 1];
    return la[0] - lb[0] || lb[1] - la[1] || la[2] - lb[2];
  }).forEach(function (k) { var l = k.steps[k.steps.length - 1]; var it = cells[l[1]][l[2]].item; if (it && it.id === k.id) it.ls = ++S.seq; });
  return { e: 'fall', ticks: tick, items: order };
}
// 떨어짐 뒤: 그 열의 마지막 칸에 닿은 오리를 모으고 다시 떨어뜨림
function collectDucks(S, ev) {
  for (var guard = 0; guard < 30; guard++) {
    var got = [], c;
    for (c = 0; c < S.cols; c++) {
      var br = S.bottom[c]; if (br < 0) continue;
      var cl = S.cells[br][c];
      if (cl.item && cl.item.t === 'col' && cl.item.col === 'duck' && !cl.upper && cl.blind == null) got.push([br, c]);
    }
    if (!got.length) return;
    var e = { e: 'ducks', dur: T.duck, items: [] };
    ev.push(e);
    got.forEach(function (p) { var it = S.cells[p[0]][p[1]].item; S.cells[p[0]][p[1]].item = null; e.items.push({ id: it.id, p: p }); addGoal(S, 'duck', 1, p, 0, ev); });
    ev.push(gravity(S));
  }
}

// ── 둘 수 있는 수
function lineLen(S, r, c, dr, dc, col) { var n = 0; r += dr; c += dc; while (colorAt(S, r, c) === col) { n++; r += dr; c += dc; } return n; }
function matchAt(S, r, c) {
  var col = colorAt(S, r, c);
  if (col < 0) return false;
  if (lineLen(S, r, c, 0, -1, col) + lineLen(S, r, c, 0, 1, col) >= 2) return true;
  if (lineLen(S, r, c, -1, 0, col) + lineLen(S, r, c, 1, 0, col) >= 2) return true;
  for (var dr = -1; dr <= 0; dr++) for (var dc = -1; dc <= 0; dc++) {
    var a = r + dr, b = c + dc;
    if (colorAt(S, a, b) === col && colorAt(S, a, b + 1) === col && colorAt(S, a + 1, b) === col && colorAt(S, a + 1, b + 1) === col) return true;
  }
  return false;
}
function swapItems(S, a, b) { var x = S.cells[a[0]][a[1]], y = S.cells[b[0]][b[1]], t = x.item; x.item = y.item; y.item = t; }
function swapMakesMatch(S, a, b) {
  swapItems(S, a, b);
  var ok = matchAt(S, a[0], a[1]) || matchAt(S, b[0], b[1]);
  swapItems(S, a, b);
  return ok;
}
function legalMoves(S, countOnly) {
  var out = [], n = 0, r, c;
  for (r = 0; r < S.rows; r++) for (c = 0; c < S.cols; c++) {
    var cl = S.cells[r][c];
    if (!swappable(cl)) continue;
    if (cl.item.t === 'sp') { n++; if (!countOnly) out.push({ type: 'tap', p: [r, c] }); }
    for (var d = 0; d < 2; d++) {
      var nr = r + (d ? 1 : 0), nc = c + (d ? 0 : 1), o = cellAt(S, nr, nc);
      if (!swappable(o)) continue;
      if (cl.item.t === 'sp' || o.item.t === 'sp' || swapMakesMatch(S, [r, c], [nr, nc])) { n++; if (!countOnly) out.push({ type: 'swap', a: [r, c], b: [nr, nc] }); }
    }
  }
  return countOnly ? n : out;
}

// ── 섞기(§3-6): 일반 블록만 섞어 「맞춤 없음 + 둘 수 있는 수 있음」, 50번 안 되면 색을 새로 뽑음
function shuffle(S, ev) {
  var pos = [], items = [], r, c, i, tr;
  for (r = 0; r < S.rows; r++) for (c = 0; c < S.cols; c++) {
    var cl = S.cells[r][c];
    if (swappable(cl) && cl.item.t === 'tile') { pos.push([r, c]); items.push(cl.item); }
  }
  if (pos.length < 2) { S.stats.stuck++; return false; }
  S.stats.shuffles++;
  for (tr = 0; tr < 50; tr++) {
    var perm = items.slice();
    for (i = perm.length - 1; i > 0; i--) { var j = rint(S.rng, i + 1), t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
    perm.forEach(function (it, k) { S.cells[pos[k][0]][pos[k][1]].item = it; });
    if (!findMatches(S).length && legalMoves(S, true) > 0) {
      var mv = [];
      items.forEach(function (it, k) {
        for (var m = 0; m < perm.length; m++) if (perm[m] === it) { mv.push({ id: it.id, from: pos[k], to: pos[m] }); break; }
      });
      ev.push({ e: 'shuffle', moves: mv });
      return true;
    }
  }
  items.forEach(function (it, k) { S.cells[pos[k][0]][pos[k][1]].item = it; });
  S.stats.recolors++;
  for (tr = 0; tr < 200; tr++) {
    items.forEach(function (it) { it.color = rint(S.rng, S.colors); });
    if (!findMatches(S).length && legalMoves(S, true) > 0) {
      ev.push({ e: 'recolor', items: items.map(function (it, k) { return { id: it.id, p: pos[k], color: it.color }; }) });
      return true;
    }
  }
  S.stats.stuck++;
  return false;
}

// ── 처음 판(§3-7): 정해 둔 칸은 그대로, 나머지를 시드로 채워 「맞춤 없음 + 둘 수 있는 수 ≥ 3」
function fillBoard(S) {
  var empty = [], r, c;
  for (r = 0; r < S.rows; r++) for (c = 0; c < S.cols; c++) { var cl = S.cells[r][c]; if (!cl.hole && !cl.item) empty.push([r, c]); }
  var bestState = null;
  for (var tr = 0; tr < 200; tr++) {
    empty.forEach(function (p) { S.cells[p[0]][p[1]].item = null; });
    empty.forEach(function (p) {
      var r = p[0], c = p[1], bad = {}, opts = [];
      if (colorAt(S, r, c - 1) >= 0 && colorAt(S, r, c - 1) === colorAt(S, r, c - 2)) bad[colorAt(S, r, c - 1)] = 1;
      if (colorAt(S, r - 1, c) >= 0 && colorAt(S, r - 1, c) === colorAt(S, r - 2, c)) bad[colorAt(S, r - 1, c)] = 1;
      var q = colorAt(S, r - 1, c - 1);
      if (q >= 0 && colorAt(S, r - 1, c) === q && colorAt(S, r, c - 1) === q) bad[q] = 1;
      for (var k = 0; k < S.colors; k++) if (!bad[k]) opts.push(k);
      if (!opts.length) for (k = 0; k < S.colors; k++) opts.push(k);
      S.cells[r][c].item = newTile(S, opts[rint(S.rng, opts.length)]);
    });
    if (!findMatches(S).length) {
      var n = legalMoves(S, true);
      if (n >= 3) return tr;
      if (!bestState || n > bestState.n) bestState = { n: n, items: empty.map(function (p) { return S.cells[p[0]][p[1]].item; }) };
    }
  }
  if (bestState) empty.forEach(function (p, k) { S.cells[p[0]][p[1]].item = bestState.items[k]; });
  return -1;
}

// ── 한 동작
function cascade(S, ev, groups, moved, acts) {
  var n = 0;
  for (;;) {
    if (n >= CHAIN_LIMIT) { S.stats.overflow++; ev.push({ e: 'overflow' }); break; }
    var stepEv = { e: 'step', n: n, dur: 0 };
    ev.push(stepEv);
    stepEv.dur = resolveStep(S, ev, groups, moved, acts) + T.tail;
    ev.push(gravity(S));
    collectDucks(S, ev);
    if (n > S.stats.chainMax) S.stats.chainMax = n;
    groups = findMatches(S); moved = []; acts = [];
    if (!groups.length) break;
    n++;
  }
}
function judge(S) {
  var done = S.goals.length > 0 && S.goals.every(function (g) { return g.left <= 0; });
  if (done) S.result = 'won';
  else if (S.moves <= 0) S.result = 'lost';
  else S.result = 'play';
}
function adjacent(a, b) { return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1; }

function apply(S, move) {
  var ev = [];
  if (S.result !== 'play') return [{ e: 'reject', why: 'over' }];
  if (!move) return [{ e: 'reject', why: 'bad' }];
  if (move.type === 'tap') {
    var p = move.p, cl = cellAt(S, p[0], p[1]);
    if (!swappable(cl) || cl.item.t !== 'sp') return [{ e: 'reject', why: 'bad' }];
    var it = cl.item; cl.item = null;
    ev.push({ e: 'tap', p: [p[0], p[1]], id: it.id });
    S.moves--; S.moveNo++; ev.push({ e: 'move', left: S.moves });
    cascade(S, ev, [], [], [{ r: p[0], c: p[1], t: 0, item: it }]);
  } else if (move.type === 'swap') {
    var a = move.a, b = move.b, ca = cellAt(S, a[0], a[1]), cb = cellAt(S, b[0], b[1]);
    if (!adjacent(a, b) || !swappable(ca) || !swappable(cb)) return [{ e: 'reject', why: 'bad' }];
    var spA = ca.item.t === 'sp', spB = cb.item.t === 'sp', ida = ca.item.id, idb = cb.item.id;
    if (!spA && !spB && !swapMakesMatch(S, a, b)) return [{ e: 'swap', a: a, b: b, ok: false, ida: ida, idb: idb }];
    swapItems(S, a, b);
    ev.push({ e: 'swap', a: a, b: b, ok: true, ida: ida, idb: idb });
    S.moves--; S.moveNo++; ev.push({ e: 'move', left: S.moves });
    var acts = [], groups = findMatches(S);
    // 바꾼 뒤 a 칸에는 원래 b 의 것, b 칸(도착 칸)에는 원래 a 의 것(사람이 끈 것)
    var atA = ca.item, atB = cb.item;
    if (atA.t === 'sp' && atB.t === 'sp') {
      var ck = [spKind(atA.sp), spKind(atB.sp)].sort().join('+');
      ev.push({ e: 'combo', key: ck, a: a, b: b, fx: COMBOS[ck] });
      ca.item = null; cb.item = null;
      acts.push({ r: b[0], c: b[1], t: 0, item: atB, item2: atA, combo: ck });
    } else {
      [[a, atA, atB], [b, atB, atA]].forEach(function (x) {
        var pp = x[0], me = x[1], other = x[2];
        if (me.t !== 'sp') return;
        S.cells[pp[0]][pp[1]].item = null;
        acts.push({ r: pp[0], c: pp[1], t: 0, item: me, color: me.sp === 'globe' && other.t === 'tile' ? other.color : null });
      });
    }
    cascade(S, ev, groups, [b, a], acts);
  } else return [{ e: 'reject', why: 'bad' }];
  judge(S);
  if (S.result === 'play' && legalMoves(S, true) === 0) shuffle(S, ev);
  ev.push({ e: 'end', result: S.result });
  return ev;
}

// 깬 뒤 남은 이동 보너스(§6-4): 남은 이동마다 무작위 블록 칸에 특수 블록을 놓고, 판의 특수 블록을 모두 차례로 터뜨린다
function finishBonus(S) {
  if (S.result !== 'won' || S.bonusDone) return { events: [], cleared: 0, coins: 0 };
  S.bonusDone = true;
  var ev = [{ e: 'bonus', moves: S.moves }], c0 = S.stats.cleared, r, c;
  // 한 번에 놓는 수는 판 블록의 절반까지(블록보다 남은 이동이 많으면 여러 번 나눠 놓고 터뜨림)
  for (var round = 0; round < 60; round++) {
    var cand = [];
    for (r = 0; r < S.rows; r++) for (c = 0; c < S.cols; c++) { var cl = S.cells[r][c]; if (swappable(cl) && cl.item.t === 'tile') cand.push([r, c]); }
    var n = Math.min(S.moves, Math.max(1, cand.length >> 1));
    for (var i = 0; i < n; i++) {
      S.moves--;
      if (!cand.length) { ev.push({ e: 'place', t: i * T.bonusGap, p: null, left: S.moves }); continue; }
      var p = cand.splice(rint(S.rng, cand.length), 1)[0], q = rnd(S.rng), kind = 'stamp', j;
      for (j = 0; j < BONUS_MIX.length; j++) if (q < BONUS_MIX[j][1]) { kind = BONUS_MIX[j][0]; break; }
      var sp = kind === 'line' ? (rnd(S.rng) < 0.5 ? 'lineH' : 'lineV') : kind, old = S.cells[p[0]][p[1]].item, nit = newSp(S, sp, old.color);
      S.cells[p[0]][p[1]].item = nit;
      ev.push({ e: 'place', t: i * T.bonusGap, p: p, from: old.id, item: copy(nit), left: S.moves });
    }
    var acts = [];   // 놓인 것 + 판에 남은 특수 블록을 차례로(서로 먼저 터뜨리지 않고 제 차례에)
    for (r = 0; r < S.rows; r++) for (c = 0; c < S.cols; c++) {
      var cl2 = S.cells[r][c];
      if (swappable(cl2) && cl2.item.t === 'sp') acts.push({ r: r, c: c, t: acts.length * T.bonusFire, item: cl2.item, own: true });
    }
    if (acts.length) cascade(S, ev, [], [], acts);
    else if (S.moves <= 0) break;
  }
  if (legalMoves(S, true) === 0) shuffle(S, ev);
  ev.push({ e: 'end', result: S.result, bonus: true });
  var cleared = S.stats.cleared - c0;
  return { events: ev, cleared: cleared, coins: Math.min(BONUS_COIN_MAX, cleared) };
}

// ── 판 안 아이템(§6-2): 뿅망치 1칸 · 긴 자 행 · 롤 테이프 열 — 특수 효과와 같은 맞음 규칙(덮개 먼저 · 장애물 1겹 · 특수 블록은 터짐)
function boosterFx(cx, a) {
  var S = cx.S, r = a.r, c = a.c, cells;
  if (a.booster === 'hammer') cells = [[r, c, 0]];
  else cells = lineCells(S, r, c, a.booster === 'rowRuler' ? 'h' : 'v', 0).sort(function (x, y) { return x[2] - y[2] || x[0] - y[0] || x[1] - y[1]; });
  cx.push({ e: 'boost', t: 0, hit: a.t, kind: a.booster, p: [r, c], cells: cells });
  hitCells(cx, cells, a.t, { seen: {} });
}
// 뿅망치로 칠 것이 있는 칸인가(블라인드 · 구멍 · 오리만 있는 칸은 아님)
function hammerable(S, r, c) {
  var cl = cellAt(S, r, c);
  if (!cl || cl.hole || cl.blind != null) return false;
  if (cl.upper || cl.lower) return true;
  var it = cl.item;
  if (!it) return false;
  if (it.t === 'col') return COLS[it.col].sp;
  if (it.t === 'ob') { var an = anchorItem(S, it); return !!OBS[an.ob].sp; }
  return true;
}
function useBooster(S, kind, p) {
  if (S.result !== 'play') return [{ e: 'reject', why: 'over' }];
  if (BOOSTERS.indexOf(kind) < 0) return [{ e: 'reject', why: 'bad' }];
  var ev = [{ e: 'booster', kind: kind, p: p ? [p[0], p[1]] : null }];
  if (kind === 'fan') {
    var sh = S.stats.shuffles;
    if (!shuffle(S, ev)) return [{ e: 'reject', why: 'nothing' }];
    S.stats.shuffles = sh;   // 저절로 섞기 셈(§5-4 부적격 판정)에는 안 넣음
  } else {
    if (!p || !valid(S, p[0], p[1])) return [{ e: 'reject', why: 'bad' }];
    if (kind === 'hammer' && !hammerable(S, p[0], p[1])) return [{ e: 'reject', why: 'nothing' }];
    cascade(S, ev, [], [], [{ r: p[0], c: p[1], t: kind === 'hammer' ? T.hammer : T.toolLead, booster: kind }]);
  }
  S.stats.boosters++;
  judge(S);
  if (S.result === 'play' && legalMoves(S, true) === 0) shuffle(S, ev);
  ev.push({ e: 'end', result: S.result });
  return ev;
}
// ── 처음 판에 특수 블록 놓기(판 앞 아이템 · 연승 선물): 목표 근처(둘레 2칸 안에 장애물 · 아래층 · 덮개 · 모으는 물건) 블록 칸, 없으면 아무 블록 칸
function nearGoal(S, r, c) {
  for (var dr = -2; dr <= 2; dr++) for (var dc = -2; dc <= 2; dc++) {
    var q = cellAt(S, r + dr, c + dc);
    if (q && !q.hole && (q.lower || q.upper || q.blind != null || (q.item && (q.item.t === 'ob' || q.item.t === 'col')))) return true;
  }
  return false;
}
function placeStart(S, list, from) {
  var near = [], any = [], r, c;
  for (r = 0; r < S.rows; r++) for (c = 0; c < S.cols; c++) {
    var cl = S.cells[r][c];
    if (swappable(cl) && cl.item.t === 'tile') { any.push([r, c]); if (nearGoal(S, r, c)) near.push([r, c]); }
  }
  (list || []).forEach(function (kind) {
    if (kind !== 'line' && SPECIALS.indexOf(kind) < 0) return;
    var pool = near.length ? near : any;
    if (!pool.length) return;
    var p = pool[rint(S.rng, pool.length)];
    var dif = function (q) { return q[0] !== p[0] || q[1] !== p[1]; }; near = near.filter(dif); any = any.filter(dif);
    var sp = kind === 'line' ? (rnd(S.rng) < 0.5 ? 'lineH' : 'lineV') : kind, old = S.cells[p[0]][p[1]].item;
    var it = newSp(S, sp, old.color);
    S.cells[p[0]][p[1]].item = it;
    S.placed.push({ p: [p[0], p[1]], sp: sp, from: from, id: it.id });
  });
}

// 탐욕 점수(§5-4) — 힌트 · 봇이 쓴다
var SP_SCORE = { globe: 40, stamp: 25, lineH: 15, lineV: 15, plane: 15 };
function scoreEvents(before, after, ev) {
  var s = 0, i;
  for (i = 0; i < before.length; i++) s += (before[i].left - after[i].left) * 100;
  for (i = 0; i < ev.length; i++) {
    var e = ev[i];
    if (e.e === 'create') s += SP_SCORE[e.item.sp] || 0;
    else if (e.e === 'clear') s += 1;
    else if (e.e === 'combo') s += 50;
  }
  return s;
}

// ── 게임 겉(공개 API)
function Game(S) { this._S = S; }
Game.prototype.moves = function () { return this._S.moves; };
Game.prototype.goals = function () { return copy(this._S.goals); };
Game.prototype.blinds = function () { return copy(this._S.blinds); };
Game.prototype.result = function () { return this._S.result; };
Game.prototype.snapshot = function () { return copy(this._S); };
Game.prototype.clone = function () { return new Game(copy(this._S)); };
Game.prototype.legalMoves = function () { return legalMoves(this._S, false); };
Game.prototype.apply = function (move) { return apply(this._S, move); };
Game.prototype.findMatches = function () { return findMatches(this._S); };
Game.prototype.canSwap = function (a, b, busy) {
  var S = this._S;
  if (S.result !== 'play' || !adjacent(a, b) || !swappable(cellAt(S, a[0], a[1])) || !swappable(cellAt(S, b[0], b[1]))) return false;
  if (busy && (busy.has ? (busy.has(key(a[0], a[1])) || busy.has(key(b[0], b[1]))) : (busy[key(a[0], a[1])] || busy[key(b[0], b[1])]))) return false;
  return true;
};
Game.prototype.cell = function (r, c) { return cellAt(this._S, r, c); };
// 수마다 탐욕 점수(§5-4) — 높은 차례. 미리 보기 판은 난수를 섞어 둬 앞으로 떨어질 새 블록 색은 모른다
// (사람이 볼 수 있는 것만으로 고르게. peek=true 면 실제 난수 그대로 — 시험용)
Game.prototype.rankMoves = function (peek) {
  var list = this.legalMoves(), out = [], before = this._S.goals;
  for (var i = 0; i < list.length; i++) {
    var g = this.clone();
    if (!peek) g._S.rng.s = (g._S.rng.s ^ 0x5bd1e995) + i * 7919 | 0;
    var ev = g.apply(list[i]);
    out.push({ move: list[i], score: scoreEvents(before, g._S.goals, ev) + (g._S.result === 'won' ? 10000 : 0) });
  }
  out.sort(function (x, y) { return y.score - x.score; });
  return out;
};
Game.prototype.bestMove = function (peek) { var r = this.rankMoves(peek); return r.length ? r[0] : null; };
Game.prototype.useBooster = function (kind, p) { return useBooster(this._S, kind, p); };
Game.prototype.canBoost = function (kind, p) { var S = this._S; if (S.result !== 'play') return false; if (kind === 'fan') return true; if (!p || !valid(S, p[0], p[1])) return false; return kind !== 'hammer' || hammerable(S, p[0], p[1]); };
Game.prototype.placed = function () { return copy(this._S.placed); };
Game.prototype.finishBonus = function () { return finishBonus(this._S); };
// 이어 하기(+N 이동, 한 단계 CONTINUE_MAX 번까지) — 코인은 ③ 에서 묶는다
Game.prototype.continueWith = function (n) {
  var S = this._S;
  if (S.result !== 'lost' || S.continues >= CONTINUE_MAX) return false;
  S.continues++; S.moves += n; S.result = 'play';
  if (legalMoves(S, true) === 0) shuffle(S, []);
  return true;
};

function create(level, opts) {
  opts = opts || {};
  var S = parseLevel(level, opts);
  if (!opts.raw) S.fillTries = fillBoard(S);
  if (opts.preBoosters && opts.preBoosters.length) placeStart(S, opts.preBoosters.filter(function (k) { return PRE_BOOSTERS.indexOf(k) >= 0; }), 'pre');
  if (opts.gift && opts.gift.length) placeStart(S, opts.gift, 'gift');
  return new Game(S);
}

// 시험용: 글자 판 → 단계 자료. '0'~'4' 블록 · '.' 구멍 · '_' 빈 칸 · '#' 아무 블록 · 'B'~'E' 상자 1~4겹 · 'H' 'V' 'P' 'T' 'G' 특수 · 'S' 입구(빈 칸)
// 'U' 오리 · 'K' 캡슐 · 'W' 돌 문진 · 'R' 벽돌(3겹) · 'Q' 종이공 · 'M' 머그(1겹)
function grid(rows, extra) {
  extra = extra || {};
  var mask = [], place = [], ONE = { U: 'duck', K: 'capsule', W: 'weight', R: 'brick', Q: 'paper', M: 'mug', H: 'lineH', V: 'lineV', P: 'plane', T: 'stamp', G: 'globe' };
  rows.forEach(function (row, r) {
    var m = '';
    for (var c = 0; c < row.length; c++) {
      var ch = row[c];
      m += ch === '.' ? '.' : ch === 'S' ? 'S' : '#';
      if (ch >= '0' && ch <= '4') place.push(['tile', r, c, { color: +ch }]);
      else if (ch >= 'B' && ch <= 'E') place.push(['box', r, c, { hp: ch.charCodeAt(0) - 65 }]);
      else if (ONE[ch]) place.push([ONE[ch], r, c]);
    }
    mask.push(m);
  });
  return { n: 0, mask: mask, place: place.concat(extra.place || []), goals: extra.goals || [['color:0', 999]], moves: extra.moves || 99, colors: extra.colors || 5, seed: extra.seed || 1 };
}

return {
  VERSION: VERSION, MAX_ROWS: MAX_ROWS, MAX_COLS: MAX_COLS, CHAIN_LIMIT: CHAIN_LIMIT, CONTINUE_MAX: CONTINUE_MAX, BONUS_COIN_MAX: BONUS_COIN_MAX,
  PRIORITY: PRIORITY, T: T, OBS: OBS, BOOSTERS: BOOSTERS, PRE_BOOSTERS: PRE_BOOSTERS, LOWERS: LOWERS, UPPERS: UPPERS, COLS: COLS, COMBOS: COMBOS, SPECIALS: SPECIALS, SP_SCORE: SP_SCORE,
  create: create, grid: grid, key: key,
  _place: placeOne, _gravity: gravity, _findMatches: findMatches, _classify: classify, _choosePos: choosePos, _shuffle: shuffle, _legal: legalMoves, _rnd: rnd
};
}));
