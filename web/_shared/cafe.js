// 매니지먼트 「옥상 쉼터 카페」(key: cafe) — 회사 옥상에 작은 카페를 차려 키우는 아늑한 방치형 운영 게임
//
// 화면: /games/cafe (web/games/cafe.html) — HKCafe.mount(el) 이 모두 그린다.
// 저장: HKMgmt(web/_shared/mgmt.js). 상태 안의 t(마지막 계산 시각, 서버 ms)부터 store.now() 까지 진행시킨다.
//
// 흐름
//   손님 수(시간당) = min(찾아오는 손님, 좌석이 받을 수 있는 손님, 계산대 · 일손이 받을 수 있는 손님)
//     찾아오는 손님 = 평판 × 메뉴 매력 × DEMAND_K   (평판 = 화분 · 조명 + 꾸미기 + 등급 + 접객 알바)
//   판매 수입은 「쌓인 수입」에 모인다 — 시간당 수입 × 8시간이 차면 「가득 찼어요」로 멈춘다(받으면 다시 장사).
//   시설 업그레이드는 돈 + (Lv 3부터) 실제 시간. 공사는 등급 1에 1곳, 등급 3부터 2곳, 등급 10부터 3곳 동시에.
//   카페 등급 1~20 = 누적 매출 + 시설 레벨 합. 등급마다 메뉴 · 시설 · 꾸미기 · 알바 자리가 열린다.
//   오늘의 주문: 하루 3개, 못 한 건 3일(9개)까지 쌓인다. 보상은 돈 · 꾸미기 재료.
//
// HKCafe.core 는 DOM 없이 돈다(밸런스 시험용) — blank · advance · rates · 행동 함수들.
window.HKCafe = (function () {
  "use strict";

  // ── 자료 ──────────────────────────────────────────────────────
  const CAP_HOURS = 8; // 자리 비운 동안 쌓이는 최대 시간
  const DEMAND_K = 2.0; // 평판 × 메뉴 매력 → 시간당 찾아오는 손님
  const TURN = 4; // 좌석 하나가 한 시간에 받는 손님(15분씩 앉았다 간다)
  const MAX_GRADE = 20;

  const CATS = { coffee: { name: "커피", unit: "잔", fac: "coffee" }, dessert: { name: "디저트", unit: "개", fac: "dessert" }, tea: { name: "차 · 음료", unit: "잔", fac: "tea" } };

  // price 원 · prep 초(주문 받고 내기까지) · pop 인기도 · g 열리는 등급 · need 그 종류 시설 레벨
  const MENU = [
    { id: "americano", name: "아메리카노", cat: "coffee", price: 1000, prep: 135, pop: 1.0, g: 1, need: 1 },
    { id: "latte", name: "카페라떼", cat: "coffee", price: 1500, prep: 158, pop: 1.1, g: 2, need: 2 },
    { id: "cookie", name: "버터 쿠키", cat: "dessert", price: 1200, prep: 60, pop: 1.0, g: 3, need: 1 },
    { id: "greentea", name: "따뜻한 녹차", cat: "tea", price: 1300, prep: 105, pop: 0.95, g: 4, need: 1 },
    { id: "cake", name: "딸기 케이크", cat: "dessert", price: 2600, prep: 90, pop: 1.25, g: 6, need: 2 },
    { id: "ade", name: "레몬 에이드", cat: "tea", price: 1900, prep: 128, pop: 1.2, g: 8, need: 2 },
    { id: "vanilla", name: "바닐라 라떼", cat: "coffee", price: 2400, prep: 172, pop: 1.3, g: 10, need: 4 },
    { id: "macaron", name: "알록달록 마카롱", cat: "dessert", price: 2200, prep: 68, pop: 1.4, g: 12, need: 4 },
    { id: "yuja", name: "꿀 유자차", cat: "tea", price: 2300, prep: 112, pop: 1.35, g: 14, need: 4 },
    { id: "tart", name: "과일 타르트", cat: "dessert", price: 3500, prep: 105, pop: 1.5, g: 16, need: 5 },
    { id: "sunset", name: "옥상 노을 라떼", cat: "coffee", price: 4300, prep: 195, pop: 1.7, g: 19, need: 6 },
  ];
  const MENU_BY = Object.fromEntries(MENU.map((m) => [m.id, m]));

  // base 첫 업그레이드 값 · grow 레벨마다 몇 배 · g 열리는 등급
  const FAC = [
    { id: "coffee", name: "커피 머신", icon: "coffee", max: 8, g: 1, base: 1500, grow: 3.4, desc: "커피 값이 오르고 더 빨리 내려요" },
    { id: "seat", name: "좌석", icon: "armchair", max: 8, g: 1, base: 1200, grow: 3.4, desc: "앉을 자리가 늘어 손님을 더 받아요" },
    { id: "counter", name: "계산대", icon: "hand-coins", max: 8, g: 1, base: 1500, grow: 3.4, desc: "주문을 더 빨리 받아요" },
    { id: "plant", name: "화분 · 조명", icon: "sprout", max: 8, g: 2, base: 2500, grow: 3.3, desc: "옥상이 예뻐져 평판이 올라요" },
    { id: "dessert", name: "디저트 진열장", icon: "cake-slice", max: 8, g: 3, base: 4000, grow: 3.3, desc: "디저트를 팔고, 값이 올라요" },
    { id: "tea", name: "차 코너", icon: "leaf", max: 8, g: 4, base: 6000, grow: 3.3, desc: "차 · 음료를 팔고, 값이 올라요" },
  ];
  const FAC_BY = Object.fromEntries(FAC.map((f) => [f.id, f]));
  const SEATS = [0, 4, 8, 14, 24, 40, 64, 96, 136]; // 좌석 레벨 → 자리 수
  const TABLES = [0, 2, 3, 3, 4, 4, 5, 5, 6]; // 그림에 보이는 탁자 수

  const STAFF = [
    { id: "haram", name: "하람", skill: "barista", skillName: "바리스타", desc: "커피를 빨리 · 맛있게 내려요", hair: "#3b2a20", shirt: "#3b82f6", skin: "#f6d2b5", style: "short" },
    { id: "dain", name: "다인", skill: "pastry", skillName: "제과", desc: "디저트 · 차를 더 맛있게 만들어요", hair: "#9a5b34", shirt: "#f472b6", skin: "#f3c9a7", style: "bun" },
    { id: "soi", name: "소이", skill: "service", skillName: "접객", desc: "손님을 반갑게 맞아 평판이 올라요", hair: "#1f2937", shirt: "#10b981", skin: "#efc4a0", style: "long" },
  ];
  const STAFF_BY = Object.fromEntries(STAFF.map((s) => [s.id, s]));
  const STAFF_SLOTS = [{ g: 3, cost: 12000 }, { g: 7, cost: 150000 }, { g: 11, cost: 1200000 }];
  const STAFF_MAX = 10;
  const staffNeed = (lv) => 1.5 * lv; // 다음 레벨까지 일한 시간(시간)

  const DECO = [
    { id: "parasol", name: "줄무늬 파라솔", rep: 3, cost: 5000, mat: 1, g: 2 },
    { id: "pots", name: "꽃 화분 세트", rep: 4, cost: 15000, mat: 2, g: 4 },
    { id: "lights", name: "전구 줄 기둥", rep: 5, cost: 40000, mat: 2, g: 6 },
    { id: "bench", name: "나무 벤치", rep: 6, cost: 150000, mat: 3, g: 8 },
    { id: "board", name: "칠판 메뉴판", rep: 6, cost: 400000, mat: 3, g: 10 },
    { id: "hammock", name: "흔들 해먹", rep: 8, cost: 1200000, mat: 4, g: 12 },
    { id: "scope", name: "별 보는 망원경", rep: 8, cost: 2500000, mat: 4, g: 14 },
    { id: "fountain", name: "작은 분수", rep: 10, cost: 5000000, mat: 5, g: 16 },
    { id: "cathouse", name: "옥상 고양이 집", rep: 12, cost: 10000000, mat: 6, g: 18 },
  ];
  const DECO_BY = Object.fromEntries(DECO.map((d) => [d.id, d]));
  // 꾸미기 자리 — 그림 좌표(400×230 기준, 바닥 기준점)
  const SPOTS = [
    { name: "가게 옆", x: 136, y: 152, g: 1 },
    { name: "난간 가운데", x: 222, y: 147, g: 1 },
    { name: "난간 오른쪽", x: 300, y: 147, g: 1 },
    { name: "앞쪽 왼편", x: 150, y: 224, g: 9 },
    { name: "앞쪽 가운데", x: 262, y: 226, g: 13 },
    { name: "문 앞", x: 352, y: 214, g: 17 },
  ];

  // 등급 g → g+1 : 누적 매출 sales 이상 + 시설 레벨 합 fac 이상
  const GRADE_REQ = [null,
    { sales: 2500, fac: 5 }, { sales: 5500, fac: 7 }, { sales: 25000, fac: 9 }, { sales: 60000, fac: 11 },
    { sales: 130000, fac: 13 }, { sales: 250000, fac: 15 }, { sales: 450000, fac: 17 }, { sales: 750000, fac: 19 },
    { sales: 1200000, fac: 21 }, { sales: 1900000, fac: 23 }, { sales: 2900000, fac: 25 }, { sales: 4300000, fac: 27 },
    { sales: 6200000, fac: 29 }, { sales: 8800000, fac: 31 }, { sales: 12300000, fac: 33 }, { sales: 24000000, fac: 35 },
    { sales: 38000000, fac: 37 }, { sales: 60000000, fac: 39 }, { sales: 100000000, fac: 41 },
  ];
  const facCapAt = (g) => Math.min(8, 2 + Math.floor(g / 3)); // 등급마다 올릴 수 있는 시설 최고 레벨
  const menuSlotsAt = (g) => (g >= 9 ? 4 : 3);
  const buildSlotsAt = (g) => (g >= 10 ? 3 : g >= 3 ? 2 : 1);

  // ── 도우미 ────────────────────────────────────────────────────
  const KST = 9 * 3600 * 1000;
  const dayKey = (ms) => new Date(ms + KST).toISOString().slice(0, 10);
  const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  const kstHour = (ms) => { const d = new Date(ms + KST); return d.getUTCHours() + d.getUTCMinutes() / 60; };
  const r100 = (n) => Math.round(n / 100) * 100;
  const nice = (n) => { // 주문 목표를 보기 좋은 수로
    if (n < 10) return Math.max(3, Math.round(n));
    if (n < 50) return Math.round(n / 5) * 5;
    if (n < 200) return Math.round(n / 10) * 10;
    const p = Math.pow(10, Math.floor(Math.log10(n)) - 1);
    return Math.round(n / p / 5) * 5 * p;
  };
  function rand(s) { // 상태 안 씨앗으로 도는 작은 난수 — 같은 판은 같은 주문
    s.seed = (Math.imul(s.seed || 1, 1103515245) + 12345) >>> 0;
    return s.seed / 4294967296;
  }

  function blank(now) {
    return {
      v: 1, t: now, born: now, seed: (now % 100000) + 7,
      cash: 3000, mat: 0, pending: 0, sales: 0, grade: 1,
      fac: { coffee: 1, seat: 1, counter: 1, plant: 0, dessert: 0, tea: 0 },
      builds: [], // { id, to, start, end }
      menu: ["americano"],
      staff: [], // { id, lv, xp(시간) }
      deco: { owned: [], place: [null, null, null, null, null, null] },
      orders: { day: dayKey(now), list: [] },
      sold: {}, served: 0, collects: 0, upgrades: 0,
      tut: 0, done1: false, seen: { menu: ["americano"] },
      summary: { line: "카페 등급 1", level: 1 },
    };
  }

  // ── 계산 ──────────────────────────────────────────────────────
  const staffLv = (s, skill) => { const st = s.staff.find((x) => STAFF_BY[x.id].skill === skill); return st ? st.lv : 0; };
  function decoRep(s) { return s.deco.place.reduce((a, id) => a + (id ? DECO_BY[id].rep : 0), 0); }
  function rep(s) { return 10 + 5 * s.fac.plant + decoRep(s) + 1.5 * (s.grade - 1) + 2 * staffLv(s, "service"); }
  function itemPrice(s, m) {
    const L = s.fac[CATS[m.cat].fac] || 1;
    let mult = 1 + 0.12 * (L - 1);
    if (m.cat === "coffee") mult += 0.04 * staffLv(s, "barista");
    else mult += 0.04 * staffLv(s, "pastry");
    return m.price * mult;
  }
  function itemPrep(s, m) {
    const L = s.fac[CATS[m.cat].fac] || 1;
    let mult = 1 - 0.04 * (L - 1);
    if (m.cat === "coffee") mult -= 0.03 * staffLv(s, "barista");
    else mult -= 0.02 * staffLv(s, "pastry");
    return m.prep * Math.max(0.4, mult);
  }
  const menuOk = (s, m) => s.grade >= m.g && (s.fac[CATS[m.cat].fac] || 0) >= m.need;

  function rates(s, menuIds) {
    const ids = (menuIds || s.menu).filter((id) => MENU_BY[id] && menuOk(s, MENU_BY[id]));
    const items = ids.map((id) => { const m = MENU_BY[id]; return { id, m, price: itemPrice(s, m), prep: itemPrep(s, m), pop: m.pop }; });
    const popSum = items.reduce((a, x) => a + x.pop, 0);
    const R = rep(s);
    const appeal = items.length ? 0.4 + 0.3 * popSum : 0;
    const demand = R * appeal * DEMAND_K;
    const seats = SEATS[s.fac.seat] || 0;
    const seatCap = seats * TURN;
    const avgPrep = popSum ? items.reduce((a, x) => a + x.prep * x.pop, 0) / popSum : 90;
    const workers = 1 + s.staff.length;
    const serviceCap = (workers * 3600 / avgPrep) * (1 + 0.3 * (s.fac.counter - 1));
    const served = Math.min(demand, seatCap, serviceCap);
    const avgPrice = popSum ? items.reduce((a, x) => a + x.price * x.pop, 0) / popSum : 0;
    const perHour = served * avgPrice;
    items.forEach((x) => { x.share = x.pop / popSum; x.perHour = served * x.share; });
    const limit = served === demand ? "demand" : served === seatCap ? "seat" : "service";
    return { rep: R, appeal, demand, seats, seatCap, serviceCap, served, avgPrice, perHour, items, limit, workers };
  }
  const capOf = (r) => Math.max(5000, r.perHour * CAP_HOURS);
  const facSum = (s) => Object.values(s.fac).reduce((a, b) => a + b, 0);

  const COST_X = [0, 0.7, 1, 40, 170, 600, 2000, 6500, 20000]; // 레벨(목표) → 값 배수
  function upCost(id, to) { const f = FAC_BY[id]; return r100(f.base * COST_X[to]); }
  const UP_MIN = [0, 0, 0, 2, 5, 10, 20, 35, 60]; // 레벨(목표) → 공사 시간(분)
  function upTime(to) { return UP_MIN[to] * 60; } // 초
  function facBlock(s, id) { // 못 올리는 까닭 — 없으면 null
    const f = FAC_BY[id], lv = s.fac[id];
    if (s.grade < f.g) return { why: "grade", text: `등급 ${f.g}에 열려요` };
    if (s.builds.some((b) => b.id === id)) return { why: "building", text: "공사 중이에요" };
    if (lv >= f.max) return { why: "max", text: "가장 높은 레벨이에요" };
    if (lv + 1 > facCapAt(s.grade)) { let g = s.grade; while (facCapAt(g) < lv + 1) g++; return { why: "cap", text: `등급 ${g}부터 더 올려요` }; }
    if (s.builds.length >= buildSlotsAt(s.grade)) return { why: "slot", text: s.grade < 3 ? "공사는 한 번에 하나씩 · 등급 3부터 둘" : s.grade < 10 ? "공사는 두 곳까지 · 등급 10부터 셋" : "공사 자리가 모두 찼어요" };
    if (s.cash < upCost(id, lv + 1)) return { why: "cash", text: "돈이 모자라요" };
    return null;
  }

  // ── 진행 ──────────────────────────────────────────────────────
  // log: 자리 비운 동안 정산에 쓴다 { gain, served, sold:{}, builds:[], grades:[], staffUp:[], fullAt, orders }
  function newLog() { return { gain: 0, served: 0, sold: {}, builds: [], grades: [], staffUp: [], fullAt: null, newOrders: 0 }; }

  function sellFor(s, sec, now, log) {
    const r = rates(s);
    if (r.perHour <= 0 || sec <= 0) return;
    const room = capOf(r) - s.pending;
    if (room <= 0) { if (log && !log.fullAt) log.fullAt = now; return; }
    let dt = Math.min(sec, room / (r.perHour / 3600));
    const gain = r.perHour * dt / 3600;
    const cust = r.served * dt / 3600;
    s.pending += gain; s.sales += gain; s.served += cust;
    r.items.forEach((x) => { s.sold[x.id] = (s.sold[x.id] || 0) + cust * x.share; });
    s.staff.forEach((st) => {
      if (st.lv >= STAFF_MAX) return;
      st.xp += dt / 3600;
      while (st.lv < STAFF_MAX && st.xp >= staffNeed(st.lv)) { st.xp -= staffNeed(st.lv); st.lv++; if (log) log.staffUp.push({ id: st.id, lv: st.lv }); }
      if (st.lv >= STAFF_MAX) st.xp = 0;
    });
    // 주문 진행
    const cats = new Set(r.items.map((x) => x.m.cat));
    s.orders.list.forEach((o) => {
      if (o.claimed || o.p >= o.target) return;
      if (o.kind === "item") { const x = r.items.find((y) => y.id === o.item); if (x) o.p += cust * x.share; }
      else if (o.kind === "cat") r.items.forEach((x) => { if (x.m.cat === o.cat) o.p += cust * x.share; });
      else if (o.kind === "serve") o.p += cust;
      else if (o.kind === "earn") o.p += gain;
      else if (o.kind === "keep" && cats.has(o.cat)) o.p += dt;
      o.p = Math.min(o.p, o.target);
    });
    if (log) {
      log.gain += gain; log.served += cust;
      r.items.forEach((x) => { log.sold[x.id] = (log.sold[x.id] || 0) + cust * x.share; });
      if (dt < sec - 0.001 && !log.fullAt) log.fullAt = now + dt * 1000;
    }
  }

  function checkGrade(s, log) {
    let up = false;
    while (s.grade < MAX_GRADE) {
      const q = GRADE_REQ[s.grade];
      if (s.sales < q.sales || facSum(s) < q.fac) break;
      s.grade++; up = true;
      if (log) log.grades.push(s.grade);
    }
    return up;
  }

  function finishBuilds(s, now, log) {
    const done = s.builds.filter((b) => b.end <= now);
    if (!done.length) return;
    s.builds = s.builds.filter((b) => b.end > now);
    done.forEach((b) => { s.fac[b.id] = Math.max(s.fac[b.id], b.to); if (log) log.builds.push({ id: b.id, to: b.to }); });
  }

  function advance(s, to, log) {
    let t = s.t || to;
    if (to - t > 400 * 86400000) t = to - 400 * 86400000; // 아주 오래 비웠어도 계산은 가볍게
    let guard = 0;
    while (t < to && guard++ < 5000) {
      let step = Math.min(to - t, 600000);
      s.builds.forEach((b) => { if (b.end > t && b.end - t < step) step = b.end - t; });
      // 가득 찼으면 공사 끝날 때까지 건너뛰어도 된다
      sellFor(s, step / 1000, t, log);
      t += step;
      finishBuilds(s, t, log);
      checkGrade(s, log);
    }
    s.t = to;
    rollOrders(s, to, log);
    summary(s);
  }

  function summary(s) {
    const r = rates(s);
    s.summary = { line: `카페 등급 ${s.grade} · 시간당 ${won(r.perHour)}`, level: s.grade };
  }
  function won(n) { const t = num(n); return /[만억]$/.test(t) ? `${t} 원` : `${t}원`; }
  function num(n) {
    if (window.HKMgmt) return HKMgmt.num(n);
    n = Math.floor(n || 0);
    if (n >= 1e8) return `${(n / 1e8).toFixed(n >= 1e9 ? 0 : 1)}억`;
    if (n >= 1e4) return `${(n / 1e4).toFixed(n >= 1e5 ? 0 : 1)}만`;
    return n.toLocaleString("ko-KR");
  }

  // ── 오늘의 주문 ───────────────────────────────────────────────
  function makeOrder(s, first) {
    const r = rates(s);
    const ph = Math.max(r.perHour, 8000);
    const pool = [];
    r.items.forEach((x) => pool.push({ w: 3, kind: "item", item: x.id }));
    const cats = [...new Set(r.items.map((x) => x.m.cat))];
    cats.forEach((c) => { pool.push({ w: 1.5, kind: "cat", cat: c }); if (c !== "coffee") pool.push({ w: 2, kind: "keep", cat: c }); });
    pool.push({ w: 2, kind: "serve" }, { w: 2, kind: "earn" }, { w: 1.5, kind: "upgrade" });
    if (first) pool.push({ w: 2, kind: "collect" });
    const used = s.orders.list.filter((o) => !o.claimed && o.day === s.orders.day).map((o) => o.kind + (o.item || o.cat || ""));
    const choices = pool.filter((p) => !used.includes(p.kind + (p.item || p.cat || "")));
    const list = choices.length ? choices : pool;
    let w = list.reduce((a, p) => a + p.w, 0) * rand(s), pick = list[0];
    for (const p of list) { w -= p.w; if (w <= 0) { pick = p; break; } }
    const H = first ? 0.25 : 1 + rand(s) * 1.2; // 몇 시간 장사하면 되는 양
    const o = { id: Math.floor(rand(s) * 1e9).toString(36), day: s.orders.day, kind: pick.kind, p: 0, claimed: false };
    if (pick.item) o.item = pick.item;
    if (pick.cat) o.cat = pick.cat;
    if (o.kind === "item") o.target = nice(r.items.find((x) => x.id === o.item).perHour * H);
    else if (o.kind === "cat") o.target = nice(r.items.filter((x) => x.m.cat === o.cat).reduce((a, x) => a + x.perHour, 0) * H);
    else if (o.kind === "serve") o.target = nice(r.served * H);
    else if (o.kind === "earn") o.target = nice(ph * H);
    else if (o.kind === "keep") o.target = (first ? 1 : rand(s) < 0.5 ? 1 : 2) * 3600;
    else if (o.kind === "upgrade") o.target = first ? 1 : rand(s) < 0.6 ? 1 : 2;
    else if (o.kind === "collect") o.target = 2;
    const hard = o.kind === "keep" ? o.target / 3600 : o.kind === "upgrade" || o.kind === "collect" ? 1 : H;
    o.cash = r100(Math.max(1500, ph * (0.6 + 0.5 * hard)));
    o.mat = first ? 1 : 1 + (rand(s) < 0.45 ? 1 : 0) + (hard > 1.6 ? 1 : 0);
    return o;
  }
  function rollOrders(s, now, log) {
    const today = dayKey(now);
    const O = s.orders;
    if (!O.list.length && !O.started) { // 첫날 — 금방 끝나는 주문 셋
      O.started = true; O.day = today;
      O.list.push({ id: "f1", day: today, kind: "serve", target: 3, p: 0, cash: 1500, mat: 1, claimed: false });
      O.list.push({ id: "f2", day: today, kind: "upgrade", target: 1, p: 0, cash: 1500, mat: 1, claimed: false });
      O.list.push({ id: "f3", day: today, kind: "collect", target: 2, p: 0, cash: 1500, mat: 1, claimed: false });
      return;
    }
    if (O.day === today) return;
    const days = Math.min(3, Math.max(1, dayDiff(O.day, today)));
    O.list = O.list.filter((o) => !o.claimed);
    for (let d = days - 1; d >= 0; d--) {
      O.day = d === 0 ? today : O.day; // 지난날 몫도 오늘 날짜로 쌓는다(정리용)
      for (let i = 0; i < 3; i++) O.list.push(makeOrder(s, false));
    }
    O.day = today;
    if (O.list.length > 9) O.list = O.list.slice(O.list.length - 9);
    if (log) log.newOrders += days * 3;
  }
  const orderDone = (o) => o.p >= o.target - 1e-6;
  function orderText(o) {
    const m = o.item && MENU_BY[o.item];
    switch (o.kind) {
      case "item": return `${m.name} ${num(o.target)}${CATS[m.cat].unit} 팔기`;
      case "cat": return `${CATS[o.cat].name} ${num(o.target)}${CATS[o.cat].unit} 팔기`;
      case "serve": return `손님 ${num(o.target)}명 맞이하기`;
      case "earn": return `판매 수입 ${won(o.target)} 모으기`;
      case "keep": return `${CATS[o.cat].name} 진열한 채 ${o.target / 3600}시간 장사하기`;
      case "upgrade": return `시설 ${o.target}번 업그레이드 시작하기`;
      case "collect": return `수입 ${o.target}번 받기`;
    }
    return "";
  }
  function orderProg(o) {
    if (o.kind === "keep") return `${HKMgmtDur(o.p)} / ${o.target / 3600}시간`;
    if (o.kind === "earn") return `${won(o.p)} / ${won(o.target)}`;
    return `${num(o.p)} / ${num(o.target)}`;
  }
  function HKMgmtDur(sec) {
    if (window.HKMgmt) return HKMgmt.dur(sec);
    return Math.round(sec / 60) + "분";
  }
  function bump(s, kind) {
    s.orders.list.forEach((o) => { if (!o.claimed && o.kind === kind && o.p < o.target) o.p = Math.min(o.target, o.p + 1); });
  }

  // ── 행동 ──────────────────────────────────────────────────────
  function collect(s) {
    const n = Math.floor(s.pending);
    if (n <= 0) return 0;
    s.cash += n; s.pending -= n; s.collects++;
    bump(s, "collect");
    return n;
  }
  function startUpgrade(s, id, now) {
    if (facBlock(s, id)) return false;
    const to = s.fac[id] + 1, sec = upTime(to);
    s.cash -= upCost(id, to); s.upgrades++;
    bump(s, "upgrade");
    if (sec <= 0) s.fac[id] = to;
    else s.builds.push({ id, to, start: now, end: now + sec * 1000 });
    if (id === "dessert" && to === 1 && menuSlotsFree(s)) s.menu.push("cookie");
    if (id === "tea" && to === 1 && menuSlotsFree(s)) s.menu.push("greentea");
    return true;
  }
  const menuSlotsFree = (s) => s.menu.filter((id) => menuOk(s, MENU_BY[id])).length < menuSlotsAt(s.grade);
  function toggleMenu(s, id) {
    const i = s.menu.indexOf(id);
    if (i >= 0) { s.menu.splice(i, 1); return "off"; }
    if (!menuOk(s, MENU_BY[id])) return "lock";
    s.menu = s.menu.filter((x) => menuOk(s, MENU_BY[x]));
    if (s.menu.length >= menuSlotsAt(s.grade)) return "full";
    s.menu.push(id); return "on";
  }
  function bestMenu(s) { // 가장 많이 버는 진열 조합
    const ok = MENU.filter((m) => menuOk(s, m)).map((m) => m.id);
    const k = Math.min(menuSlotsAt(s.grade), ok.length);
    let best = null, bestV = -1;
    const pick = (start, cur) => {
      if (cur.length === k) { const v = rates(s, cur).perHour; if (v > bestV + 1e-6) { bestV = v; best = cur.slice(); } return; }
      for (let i = start; i < ok.length; i++) { cur.push(ok[i]); pick(i + 1, cur); cur.pop(); }
    };
    pick(0, []);
    return best || [];
  }
  const staffSlots = (s) => STAFF_SLOTS.filter((x) => s.grade >= x.g).length;
  function hire(s, id) {
    const n = s.staff.length, slot = STAFF_SLOTS[n];
    if (!slot || s.grade < slot.g || s.cash < slot.cost || s.staff.some((x) => x.id === id)) return false;
    s.cash -= slot.cost; s.staff.push({ id, lv: 1, xp: 0 });
    return true;
  }
  function buyDeco(s, id) {
    const d = DECO_BY[id];
    if (s.grade < d.g || s.cash < d.cost || s.mat < d.mat || s.deco.owned.includes(id)) return false;
    s.cash -= d.cost; s.mat -= d.mat; s.deco.owned.push(id);
    const free = SPOTS.findIndex((sp, i) => s.grade >= sp.g && !s.deco.place[i]);
    if (free >= 0) s.deco.place[free] = id;
    return true;
  }
  function placeDeco(s, spot, id) {
    if (!SPOTS[spot] || s.grade < SPOTS[spot].g) return false;
    if (id) { const j = s.deco.place.indexOf(id); if (j >= 0) s.deco.place[j] = null; }
    s.deco.place[spot] = id || null;
    return true;
  }
  function claimOrder(s, oid) {
    const o = s.orders.list.find((x) => x.id === oid);
    if (!o || o.claimed || !orderDone(o)) return null;
    o.claimed = true; s.cash += o.cash; s.mat += o.mat;
    return o;
  }

  const core = {
    CAP_HOURS, MAX_GRADE, CATS, MENU, MENU_BY, FAC, FAC_BY, SEATS, TABLES, STAFF, STAFF_BY, STAFF_SLOTS, STAFF_MAX, DECO, DECO_BY, SPOTS, GRADE_REQ,
    facCapAt, menuSlotsAt, buildSlotsAt, staffNeed, staffSlots, dayKey, kstHour,
    blank, rates, rep, capOf, facSum, upCost, upTime, facBlock, menuOk, itemPrice, itemPrep, staffLv, decoRep,
    newLog, advance, checkGrade, summary, won, num, orderText, orderProg, orderDone,
    collect, startUpgrade, toggleMenu, bestMenu, hire, buyDeco, placeDeco, claimOrder, menuSlotsFree,
  };


  // ══ 옥상 그림(canvas) ═════════════════════════════════════════
  // 400×230 기준 좌표로 그리고, 화면 폭에 맞춰 늘린다. 하늘은 실제 시각(한국 시간)에 맞춘다.
  const W = 400, H = 230, FLOOR = 146;
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mix = (a, b, t) => { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(",")})`; };
  const SKY = [[0, "#0b1433", "#24305e"], [5, "#0f1a3d", "#2c3a6e"], [6.3, "#4a5aa0", "#f6b38e"], [7.6, "#7cc0ff", "#d9eeff"], [16.2, "#78b9ff", "#d4ecff"], [17.6, "#6d78c8", "#ffb17a"], [18.8, "#2f3577", "#c4708f"], [20, "#141d45", "#2e3a6c"], [24, "#0b1433", "#24305e"]];
  function skyAt(h) {
    for (let i = 0; i < SKY.length - 1; i++) {
      const [h0, t0, b0] = SKY[i], [h1, t1, b1] = SKY[i + 1];
      if (h >= h0 && h <= h1) { const t = (h - h0) / (h1 - h0); return [mix(t0, t1, t), mix(b0, b1, t)]; }
    }
    return [SKY[0][1], SKY[0][2]];
  }
  const nightOf = (h) => (h < 5.5 || h > 19.5 ? 1 : h < 7.5 ? (7.5 - h) / 2 : h > 17 ? (h - 17) / 2.5 : 0);
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); c.fill(); }
  function circ(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
  function ell(c, x, y, rx, ry) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill(); }
  function glow(c, x, y, r, color, a) { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, color.replace("A", a)); g.addColorStop(1, color.replace("A", 0)); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); }

  // 사람 — y 는 발끝. o: skin hair shirt pants style(short|bun|long|cap) sit dir walk cup apron
  function person(c, x, y, o) {
    const dir = o.dir || 1, sk = o.skin || "#f3c9a7";
    c.save(); c.translate(x, y);
    if (o.sit) {
      c.save(); c.scale(dir, 1); c.fillStyle = o.pants || "#475569"; rr(c, -3, -9, 10, 4, 2); rr(c, 5, -9, 3, 9, 1.5); c.fillStyle = "#334155"; rr(c, 5, -1.5, 5, 2, 1); c.restore();
      c.translate(0, 5);
    } else {
      const sw = o.walk ? Math.sin(o.walk) * 2.2 : 0;
      c.fillStyle = o.pants || "#475569"; rr(c, -4 + sw, -9, 3, 9, 1.4); rr(c, 1 - sw, -9, 3, 9, 1.4);
      c.fillStyle = "#334155"; rr(c, -4.5 + sw, -1.5, 4, 2, 1); rr(c, 0.5 - sw, -1.5, 4, 2, 1);
      if (o.walk) c.translate(0, -Math.abs(Math.sin(o.walk)) * 1.1);
    }
    c.fillStyle = o.shirt || "#60a5fa"; rr(c, -6, -21, 12, 13, 4);
    if (o.apron) { c.fillStyle = o.apron; rr(c, -4, -17, 8, 10, 2); }
    c.fillStyle = o.shirt || "#60a5fa"; rr(c, -8, -20, 3, 8, 1.5); rr(c, 5, -20, 3, 8, 1.5);
    c.fillStyle = sk; circ(c, -6.5, -11.5, 1.6); circ(c, 6.5, -11.5, 1.6);
    if (o.cup) { c.fillStyle = "#fff"; rr(c, 6, -16, 4, 5, 1); c.fillStyle = "#a16207"; c.fillRect(6, -15, 4, 1.4); }
    c.fillStyle = sk; circ(c, 0, -27, 6.2);
    c.fillStyle = o.hair || "#3b2a20";
    const st = o.style || "short";
    c.beginPath(); c.arc(0, -28, 6.6, Math.PI * 1.02, Math.PI * 1.98); c.lineTo(5.5, -27); c.quadraticCurveTo(0, -29.5, -5.5, -27); c.closePath(); c.fill();
    if (st === "bun") circ(c, 0, -35, 3.2);
    if (st === "long") { rr(c, -6.8, -29, 2.6, 10, 1.3); rr(c, 4.2, -29, 2.6, 10, 1.3); }
    if (st === "cap") { c.fillStyle = o.capColor || "#ef4444"; c.beginPath(); c.arc(0, -29, 6.6, Math.PI, 0); c.fill(); rr(c, dir > 0 ? 2 : -9, -30, 7, 2, 1); }
    c.fillStyle = "#1e1b2e"; const ex = dir * 0.8; circ(c, -2.2 + ex, -26.5, 0.9); circ(c, 2.2 + ex, -26.5, 0.9);
    c.fillStyle = "rgba(244,114,182,.45)"; circ(c, -3.6 + ex, -24.6, 1.2); circ(c, 3.6 + ex, -24.6, 1.2);
    c.restore();
  }

  function chair(c, x, y, side) { // side -1: 등받이가 왼쪽
    c.fillStyle = "#9a6b45"; c.fillRect(x - 5, y - 8, 10, 2.5); c.fillRect(x - 4.5, y - 6, 1.6, 6); c.fillRect(x + 3, y - 6, 1.6, 6);
    c.fillStyle = "#b07a4f"; c.fillRect(side < 0 ? x - 5.5 : x + 3.5, y - 18, 2, 12);
  }
  function table(c, x, y) {
    c.fillStyle = "rgba(0,0,0,.08)"; ell(c, x, y + 1, 13, 3);
    c.fillStyle = "#6b7280"; c.fillRect(x - 1, y - 12, 2, 12); c.fillRect(x - 6, y - 1, 12, 1.6);
    c.fillStyle = "#f8fafc"; ell(c, x, y - 13, 12, 4); c.fillStyle = "#e2e8f0"; c.fillRect(x - 12, y - 13, 24, 1.4);
  }
  function pot(c, x, y, k, night) {
    const greens = ["#22c55e", "#16a34a", "#4ade80", "#15803d"];
    c.fillStyle = "#c2410c"; c.beginPath(); c.moveTo(x - 6, y - 10); c.lineTo(x + 6, y - 10); c.lineTo(x + 4.5, y); c.lineTo(x - 4.5, y); c.fill();
    c.fillStyle = "#ea580c"; c.fillRect(x - 6.5, y - 11, 13, 2.4);
    c.fillStyle = greens[k % 4];
    if (k % 3 === 0) { ell(c, x, y - 18, 7, 8); ell(c, x - 4, y - 14, 4, 4); }
    else if (k % 3 === 1) { for (let i = -2; i <= 2; i++) { c.save(); c.translate(x, y - 11); c.rotate(i * 0.35); ell(c, 0, -8, 2.2, 8); c.restore(); } }
    else { circ(c, x - 3, y - 15, 4.5); circ(c, x + 3, y - 16, 4.5); circ(c, x, y - 20, 4.5); c.fillStyle = ["#f472b6", "#facc15", "#f87171"][k % 3]; circ(c, x - 3, y - 17, 1.6); circ(c, x + 3, y - 19, 1.6); circ(c, x, y - 23, 1.6); }
  }
  function bulbs(c, x1, y1, x2, y2, sag, n, night, tm) {
    c.strokeStyle = "rgba(51,65,85,.7)"; c.lineWidth = 0.7; c.beginPath(); c.moveTo(x1, y1); c.quadraticCurveTo((x1 + x2) / 2, Math.max(y1, y2) + sag, x2, y2); c.stroke();
    const cols = ["#fde68a", "#fca5a5", "#a5f3fc", "#fde68a", "#bbf7d0"];
    for (let i = 1; i < n; i++) {
      const t = i / n, mx = (x1 + x2) / 2, my = Math.max(y1, y2) + sag;
      const bx = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * mx + t * t * x2, by = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * my + t * t * y2;
      const tw = 0.75 + 0.25 * Math.sin(tm * 2 + i);
      if (night > 0.2) glow(c, bx, by + 2, 6, "rgba(253,230,138,A)", 0.5 * night * tw);
      c.fillStyle = night > 0.2 ? cols[i % 5] : "#e5e7eb"; circ(c, bx, by + 2, 1.5);
    }
  }

  // 꾸미기 물건 — x, y 는 바닥 기준점
  function deco(c, id, x, y, night, tm) {
    c.save();
    c.fillStyle = "rgba(0,0,0,.08)"; ell(c, x, y, 14, 3);
    switch (id) {
      case "parasol": {
        c.fillStyle = "#94a3b8"; c.fillRect(x - 0.8, y - 36, 1.6, 36); c.fillStyle = "#64748b"; ell(c, x, y - 1, 6, 2);
        const cols = ["#f87171", "#fff", "#f87171", "#fff", "#f87171", "#fff"];
        for (let i = 0; i < 6; i++) { c.fillStyle = cols[i]; c.beginPath(); c.moveTo(x, y - 44); c.lineTo(x - 22 + i * 7.33, y - 32); c.lineTo(x - 22 + (i + 1) * 7.33, y - 32); c.fill(); }
        c.fillStyle = "#ef4444"; circ(c, x, y - 44, 1.6); break;
      }
      case "pots": pot(c, x - 9, y, 2, night); pot(c, x + 8, y, 5, night); c.save(); c.translate(x, y + 2); c.scale(0.75, 0.75); pot(c, 0, 0, 8, night); c.restore(); break;
      case "lights": c.fillStyle = "#475569"; c.fillRect(x - 15, y - 34, 1.8, 34); c.fillRect(x + 13, y - 34, 1.8, 34); bulbs(c, x - 14, y - 33, x + 14, y - 33, 6, 6, Math.max(night, 0.25), tm); break;
      case "bench":
        c.fillStyle = "#8b5a33"; c.fillRect(x - 14, y - 10, 2, 10); c.fillRect(x + 12, y - 10, 2, 10);
        c.fillStyle = "#b7794a"; rr(c, x - 16, y - 12, 32, 3.5, 1.5); rr(c, x - 16, y - 20, 32, 3, 1.5); rr(c, x - 16, y - 25, 32, 3, 1.5); break;
      case "board":
        c.fillStyle = "#8b5a33"; c.save(); c.translate(x, y); c.beginPath(); c.moveTo(-9, 0); c.lineTo(-5, -30); c.lineTo(5, -30); c.lineTo(9, 0); c.lineTo(7, 0); c.lineTo(3.5, -27); c.lineTo(-3.5, -27); c.lineTo(-7, 0); c.fill();
        c.fillStyle = "#1f3b2d"; rr(c, -9, -28, 18, 20, 1.5); c.strokeStyle = "rgba(255,255,255,.8)"; c.lineWidth = 0.8;
        c.beginPath(); c.moveTo(-6, -24); c.lineTo(3, -24); c.moveTo(-6, -20); c.lineTo(5, -20); c.moveTo(-6, -16); c.lineTo(1, -16); c.stroke(); c.fillStyle = "#f9a8d4"; circ(c, 5, -13, 1.6); c.restore(); break;
      case "hammock":
        c.fillStyle = "#8b5a33"; c.fillRect(x - 20, y - 30, 2.4, 30); c.fillRect(x + 18, y - 30, 2.4, 30);
        c.strokeStyle = "#f59e0b"; c.lineWidth = 3; c.beginPath(); c.moveTo(x - 18, y - 26); c.quadraticCurveTo(x, y - 4 + Math.sin(tm * 1.5) * 1.5, x + 18, y - 26); c.stroke();
        c.strokeStyle = "#fde68a"; c.lineWidth = 1; c.beginPath(); c.moveTo(x - 16, y - 24); c.quadraticCurveTo(x, y - 8 + Math.sin(tm * 1.5) * 1.5, x + 16, y - 24); c.stroke(); break;
      case "scope":
        c.strokeStyle = "#475569"; c.lineWidth = 1.4; c.beginPath(); c.moveTo(x, y - 16); c.lineTo(x - 7, y); c.moveTo(x, y - 16); c.lineTo(x + 7, y); c.moveTo(x, y - 16); c.lineTo(x, y); c.stroke();
        c.save(); c.translate(x, y - 18); c.rotate(-0.5); c.fillStyle = "#1e3a8a"; rr(c, -9, -2.6, 18, 5.2, 2); c.fillStyle = "#facc15"; c.fillRect(-9, -2.6, 2, 5.2); c.fillStyle = "#93c5fd"; c.fillRect(7.5, -2, 1.5, 4); c.restore(); break;
      case "fountain": {
        c.fillStyle = "#94a3b8"; ell(c, x, y - 4, 17, 5); c.fillStyle = "#cbd5e1"; c.fillRect(x - 17, y - 8, 34, 4); ell(c, x, y - 8, 17, 5);
        c.fillStyle = "#60a5fa"; ell(c, x, y - 8.5, 14, 3.6); c.fillStyle = "#94a3b8"; c.fillRect(x - 2, y - 20, 4, 12); ell(c, x, y - 20, 6, 2);
        c.strokeStyle = "rgba(147,197,253,.9)"; c.lineWidth = 1.2;
        for (let i = -1; i <= 1; i += 2) { c.beginPath(); c.moveTo(x, y - 22); c.quadraticCurveTo(x + i * 8, y - 32 - Math.sin(tm * 4) * 1.5, x + i * 12, y - 10); c.stroke(); }
        break;
      }
      case "cathouse": {
        c.fillStyle = "#fb923c"; c.fillRect(x - 14, y - 16, 18, 16); c.fillStyle = "#c2410c"; c.beginPath(); c.moveTo(x - 17, y - 15); c.lineTo(x - 5, y - 26); c.lineTo(x + 7, y - 15); c.fill();
        c.fillStyle = "#431407"; c.beginPath(); c.arc(x - 5, y - 4, 4.5, Math.PI, 0); c.lineTo(x - 0.5, y); c.lineTo(x - 9.5, y); c.fill();
        // 고양이
        const tail = Math.sin(tm * 2) * 3;
        c.strokeStyle = "#57534e"; c.lineWidth = 2; c.beginPath(); c.moveTo(x + 15, y - 3); c.quadraticCurveTo(x + 21, y - 8, x + 18 + tail, y - 14); c.stroke();
        c.fillStyle = "#57534e"; ell(c, x + 12, y - 5, 5, 5); circ(c, x + 12, y - 12, 4);
        c.beginPath(); c.moveTo(x + 8.6, y - 14); c.lineTo(x + 9.4, y - 18); c.lineTo(x + 11.4, y - 15); c.fill(); c.beginPath(); c.moveTo(x + 15.4, y - 14); c.lineTo(x + 14.6, y - 18); c.lineTo(x + 12.6, y - 15); c.fill();
        c.fillStyle = "#fde047"; circ(c, x + 10.5, y - 12.5, 0.9); circ(c, x + 13.5, y - 12.5, 0.9); break;
      }
    }
    c.restore();
  }

  const TABLE_POS = [[176, 176], [250, 172], [318, 182], [206, 204], [282, 206], [150, 200], [236, 190], [330, 210]];
  const PLANT_POS = [124, 166, 200, 258, 292, 336, 180, 314];
  const LOOKS = [
    { hair: "#3b2a20", shirt: "#60a5fa", pants: "#334155", style: "short" }, { hair: "#7c4a2d", shirt: "#f9a8d4", pants: "#475569", style: "long" },
    { hair: "#111827", shirt: "#a7f3d0", pants: "#1e3a8a", style: "short" }, { hair: "#b45309", shirt: "#fde68a", pants: "#334155", style: "bun" },
    { hair: "#1f2937", shirt: "#c4b5fd", pants: "#44403c", style: "cap", capColor: "#2563eb" }, { hair: "#57534e", shirt: "#fca5a5", pants: "#0f172a", style: "long" },
    { hair: "#292524", shirt: "#e5e7eb", pants: "#1e40af", style: "short" }, { hair: "#9a3412", shirt: "#93c5fd", pants: "#3f3f46", style: "bun" },
  ];
  const SKINS = ["#f6d2b5", "#f3c9a7", "#e8b48f", "#f9dcc4", "#d9a07a"];

  function makeScene(canvas, getState, opts = {}) {
    const ctx = canvas.getContext("2d");
    const reduce = (() => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (_) { return false; } })();
    let cw = 0, ch = 0, dpr = 1, raf = 0, last = 0, tm = 0, spawnIn = 1.5, alive = true;
    const people = [], floats = [];
    const stars = Array.from({ length: 34 }, (_, i) => [((i * 97) % 389) + 5, ((i * 53) % 100) + 4, (i % 3) * 0.3 + 0.6]);
    const blds = Array.from({ length: 12 }, (_, i) => { const w = 22 + ((i * 37) % 18); return { x: i * 34 - 6 + ((i * 13) % 9), w, h: 34 + ((i * 41) % 46), tone: i % 3 }; });

    function resize() {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(3, window.devicePixelRatio || 1);
      cw = Math.max(1, r.width); ch = cw * H / W;
      canvas.style.height = ch + "px";
      canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    }
    function seatsList(s) {
      const n = TABLES[s.fac.seat] || 0, out = [];
      for (let i = 0; i < n; i++) { const [x, y] = TABLE_POS[i]; out.push({ x: x - 15, y, dir: 1 }, { x: x + 15, y, dir: -1 }); }
      return out;
    }

    function update(dt, s, info) {
      tm += dt;
      const seats = seatsList(s);
      const busy = new Set(people.map((p) => p.seat));
      const want = info.full || !info.served ? 0 : Math.min(seats.length, 1 + Math.round(info.served / 12));
      spawnIn -= dt;
      if (spawnIn <= 0 && people.filter((p) => p.st !== "out").length < want) {
        const free = seats.map((_, i) => i).filter((i) => !busy.has(i));
        if (free.length) {
          const seat = free[Math.floor(Math.random() * free.length)];
          const lk = LOOKS[Math.floor(Math.random() * LOOKS.length)];
          people.push({ x: 371, y: 150, st: "in", tx: 128 + Math.random() * 10, ty: 160 + Math.random() * 6, seat, lk, skin: SKINS[Math.floor(Math.random() * SKINS.length)], walk: 0, wait: 0, cup: false });
        }
        spawnIn = 2 + Math.random() * 4;
      }
      for (const p of people) {
        if (p.st === "order") { p.wait -= dt; if (p.wait <= 0) { const st = seats[p.seat]; if (!st) { p.st = "out"; p.tx = 371; p.ty = 150; } else { p.st = "seat"; p.tx = st.x; p.ty = st.y; } p.cup = true; } continue; }
        if (p.st === "sit") { p.wait -= dt; if (p.wait <= 0 || !seats[p.seat]) { p.st = "out"; p.tx = 371; p.ty = 150; } continue; }
        const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy), sp = 34 * dt;
        p.dir = dx >= 0 ? 1 : -1;
        if (d <= sp) {
          p.x = p.tx; p.y = p.ty; p.walk = 0;
          if (p.st === "in") { p.st = "order"; p.wait = 1.6; if (info.price) floats.push({ x: 109, y: 100, a: 1, text: "+" + num(info.price) }); }
          else if (p.st === "seat") { p.st = "sit"; p.wait = 10 + Math.random() * 14; p.dir = seats[p.seat] ? seats[p.seat].dir : 1; }
          else if (p.st === "out") p.gone = true;
        } else { p.x += dx / d * sp; p.y += dy / d * sp; p.walk += dt * 11; }
      }
      for (let i = people.length - 1; i >= 0; i--) if (people[i].gone) people.splice(i, 1);
      for (const f of floats) { f.y -= dt * 10; f.a -= dt * 0.7; }
      for (let i = floats.length - 1; i >= 0; i--) if (floats[i].a <= 0) floats.splice(i, 1);
    }

    function draw(s, info) {
      const c = ctx, k = (cw / W) * dpr;
      c.setTransform(k, 0, 0, k, 0, 0);
      const h = kstHour(info.now), night = Math.max(0, Math.min(1, nightOf(h)));
      // 하늘
      const [top, bot] = skyAt(h);
      const g = c.createLinearGradient(0, 0, 0, FLOOR); g.addColorStop(0, top); g.addColorStop(1, bot);
      c.fillStyle = g; c.fillRect(0, 0, W, FLOOR + 2);
      if (night > 0.05) { c.fillStyle = "#fff"; stars.forEach(([x, y, r], i) => { c.globalAlpha = night * (0.5 + 0.5 * Math.sin(tm * 1.3 + i)); circ(c, x, y, r * 0.7); }); c.globalAlpha = 1; }
      if (h > 5.8 && h < 19.2) { // 해
        const t = (h - 5.8) / 13.4, sx = 30 + t * 340, sy = 118 - Math.sin(Math.PI * t) * 96;
        glow(c, sx, sy, 26, h > 16.5 || h < 7.5 ? "rgba(255,170,90,A)" : "rgba(255,240,180,A)", 0.55);
        c.fillStyle = h > 16.5 || h < 7.5 ? "#ffb26b" : "#fff3c4"; circ(c, sx, sy, 9);
      }
      if (night > 0.3) { c.globalAlpha = night; c.fillStyle = "#fef9c3"; circ(c, 330, 30, 9); c.fillStyle = top; circ(c, 334, 27, 8); c.globalAlpha = 1; }
      // 구름
      c.fillStyle = `rgba(255,255,255,${0.75 - night * 0.55})`;
      [[0, 26, 1], [140, 46, 0.8], [260, 18, 1.1]].forEach(([ox, y, sc]) => {
        const x = ((ox + tm * 3 * sc) % 470) - 50;
        ell(c, x, y, 16 * sc, 5 * sc); ell(c, x + 10 * sc, y - 4 * sc, 10 * sc, 6 * sc); ell(c, x - 9 * sc, y - 1, 8 * sc, 4 * sc);
      });
      // 먼 빌딩
      blds.forEach((b, i) => {
        const base = [["#a9bdd6", "#93a8c5", "#b9cade"], ["#26315a", "#1f2a4f", "#2c3866"]];
        c.fillStyle = mix(base[0][b.tone], base[1][b.tone], night); c.fillRect(b.x, FLOOR - 12 - b.h, b.w, b.h + 12);
        for (let wy = FLOOR - 6 - b.h; wy < FLOOR - 16; wy += 7) for (let wx = b.x + 4; wx < b.x + b.w - 4; wx += 6) {
          const on = ((wx * 7 + wy * 13 + i) % 5) < 2;
          c.fillStyle = on && night > 0.3 ? `rgba(253,224,130,${night * 0.9})` : `rgba(255,255,255,${0.25 - night * 0.15})`;
          c.fillRect(wx, wy, 2.6, 3.4);
        }
      });
      // 난간 · 바닥
      c.fillStyle = mix("#d6d0c6", "#5b5f78", night * 0.6); c.fillRect(0, FLOOR - 14, W, 14);
      c.fillStyle = mix("#ebe6dd", "#6e7290", night * 0.6); c.fillRect(0, FLOOR - 15, W, 3);
      c.fillStyle = mix("#8a94a6", "#4b5370", night * 0.5);
      c.fillRect(0, FLOOR - 30, W, 2); for (let x = 4; x < W; x += 18) c.fillRect(x, FLOOR - 30, 1.6, 16);
      const fg = c.createLinearGradient(0, FLOOR, 0, H); fg.addColorStop(0, mix("#e7dccb", "#6f6a7d", night * 0.6)); fg.addColorStop(1, mix("#d8c9b2", "#5d586b", night * 0.6));
      c.fillStyle = fg; c.fillRect(0, FLOOR, W, H - FLOOR);
      c.strokeStyle = `rgba(120,100,80,${0.18})`; c.lineWidth = 0.6; c.beginPath();
      for (let y = FLOOR + 12; y < H; y += 14) { c.moveTo(0, y); c.lineTo(W, y); }
      for (let x = -200; x < W + 200; x += 28) { c.moveTo(200 + (x - 200) * 0.55, FLOOR); c.lineTo(x, H); }
      c.stroke();
      // 화분 · 조명 (전구 줄은 Lv 2부터)
      if (s.fac.plant >= 2) bulbs(c, 122, FLOOR - 30, 236, FLOOR - 30, 9, 9, night, tm), bulbs(c, 236, FLOOR - 30, 342, FLOOR - 30, 9, 8, night, tm);
      // 계단실(문)
      c.fillStyle = mix("#cfd6df", "#4a5170", night * 0.6); c.fillRect(346, 76, 52, FLOOR - 76 + 4);
      c.fillStyle = mix("#8b98ab", "#3a4060", night * 0.6); c.fillRect(342, 70, 60, 8);
      c.fillStyle = "#5b6b82"; rr(c, 358, 98, 26, FLOOR - 98 + 4, 2); c.fillStyle = night > 0.4 ? "#fde68a" : "#93c5fd"; c.fillRect(364, 104, 14, 9);
      c.fillStyle = "#e2e8f0"; circ(c, 380, 128, 1.4);
      if (night > 0.3) glow(c, 371, 90, 16, "rgba(253,230,138,A)", night * 0.6);
      c.fillStyle = "#fde68a"; c.fillRect(368, 84, 6, 3);
      // 가게
      drawBooth(c, s, night, info);
      // 앞쪽 물건들 — 바닥 기준 y 순서로
      const items = [];
      for (let i = 0; i < Math.min(8, s.fac.plant); i++) items.push({ y: FLOOR + 4, f: () => pot(c, PLANT_POS[i], FLOOR + 4, i, night) });
      if (s.fac.plant >= 5) [[140, 222], [387, 219]].forEach(([x, y]) => items.push({ y, f: () => { c.fillStyle = "#334155"; c.fillRect(x - 1, y - 40, 2, 40); ell(c, x, y, 5, 1.6); if (night > 0.2) glow(c, x, y - 42, 22, "rgba(253,224,138,A)", night * 0.7); c.fillStyle = night > 0.2 ? "#fef08a" : "#f1f5f9"; circ(c, x, y - 42, 3.5); } }));
      const nT = TABLES[s.fac.seat] || 0;
      for (let i = 0; i < nT; i++) { const [x, y] = TABLE_POS[i]; items.push({ y: y - 0.5, f: () => { chair(c, x - 15, y, -1); chair(c, x + 15, y, 1); } }, { y: y + 0.5, f: () => table(c, x, y) }); }
      s.deco.place.forEach((id, i) => { if (id) items.push({ y: SPOTS[i].y, f: () => deco(c, id, SPOTS[i].x, SPOTS[i].y, night, tm) }); });
      people.forEach((p) => items.push({ y: p.y, f: () => person(c, p.x, p.y, { ...p.lk, skin: p.skin, dir: p.dir, walk: p.walk, sit: p.st === "sit", cup: p.cup }) }));
      items.sort((a, b) => a.y - b.y).forEach((it) => it.f());
      // 꾸미기 자리 표시
      if (opts.showSpots && opts.showSpots()) SPOTS.forEach((sp, i) => {
        const open = s.grade >= sp.g;
        c.save(); c.setLineDash([2.5, 2]); c.strokeStyle = open ? "#2f6bff" : "rgba(100,116,139,.6)"; c.lineWidth = 1.2;
        c.fillStyle = open ? "rgba(47,107,255,.14)" : "rgba(100,116,139,.12)"; c.beginPath(); c.ellipse(sp.x, sp.y - 2, 15, 5, 0, 0, Math.PI * 2); c.fill(); c.stroke(); c.restore();
        c.fillStyle = open ? "#2f6bff" : "#94a3b8"; circ(c, sp.x, sp.y - 30, 7);
        c.fillStyle = "#fff"; c.font = "bold 9px Pretendard, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(String(i + 1), sp.x, sp.y - 29.5);
      });
      floats.forEach((f) => { c.globalAlpha = Math.max(0, f.a); c.fillStyle = "#16a34a"; c.font = "bold 9px Pretendard, sans-serif"; c.textAlign = "center"; c.fillText(f.text + "원", f.x, f.y); });
      c.globalAlpha = 1;
      if (night > 0.2) { c.fillStyle = `rgba(20,24,60,${night * 0.18})`; c.fillRect(0, 0, W, H); }
    }

    function drawBooth(c, s, night, info) {
      const tier = s.grade >= 15 ? 3 : s.grade >= 10 ? 2 : s.grade >= 5 ? 1 : 0;
      const aw = [["#2f6bff", "#fff"], ["#10b981", "#fff"], ["#f97316", "#fff7ed"], ["#be185d", "#fdf2f8"]][tier];
      c.fillStyle = mix("#fff7ec", "#8c86a3", night * 0.5); c.fillRect(8, 64, 110, FLOOR - 64);
      c.fillStyle = mix("#d9b48f", "#6c5a63", night * 0.5); c.fillRect(8, 100, 110, 8);
      // 뒤 선반 — 차 코너
      if (s.fac.tea > 0) {
        c.fillStyle = "#a16207"; c.fillRect(14, 84, 48, 2.4);
        const jc = ["#86efac", "#fde68a", "#fdba74", "#f9a8d4", "#a5b4fc", "#5eead4", "#fca5a5", "#c4b5fd"];
        for (let i = 0; i < Math.min(8, s.fac.tea + 1); i++) { c.fillStyle = jc[i]; rr(c, 15 + i * 6, 76, 4.6, 8, 1.2); c.fillStyle = "#78350f"; c.fillRect(15 + i * 6, 75, 4.6, 1.6); }
      }
      // 메뉴판
      c.fillStyle = "#1f3b2d"; rr(c, 70, 70, 42, 26, 2); c.fillStyle = "#8b5a33"; c.fillRect(70, 95, 42, 2);
      c.strokeStyle = "rgba(255,255,255,.75)"; c.lineWidth = 0.9; c.beginPath();
      s.menu.forEach((_, i) => { c.moveTo(75, 76 + i * 5); c.lineTo(96 + (i % 2) * 8, 76 + i * 5); }); c.stroke();
      // 알바생 · 사장님(카운터 뒤)
      const crew = [{ id: "me", skin: "#f3c9a7", hair: "#4b3621", shirt: "#334155", style: "short", apron: "#2f6bff" }].concat(s.staff.map((x) => ({ ...STAFF_BY[x.id], apron: "#fff" })));
      const xs = [50, 26, 72, 94];
      crew.forEach((p, i) => { const b = Math.sin(tm * 2 + i * 1.7) * 0.6; person(c, xs[i], 131 + b, { ...p, dir: i % 2 ? -1 : 1, pants: "#334155" }); });
      // 차양 · 간판
      for (let i = 0; i < 11; i++) { c.fillStyle = aw[i % 2]; c.fillRect(4 + i * 10.4, 56, 10.4, 12); c.beginPath(); c.arc(4 + i * 10.4 + 5.2, 68, 5.2, 0, Math.PI); c.fill(); }
      c.fillStyle = mix("#475569", "#2b3150", night * 0.5); c.fillRect(4, 54, 114, 3);
      c.fillStyle = "#fffdf7"; rr(c, 22, 36, 78, 17, 4); c.strokeStyle = aw[0]; c.lineWidth = 1.4; c.strokeRect(23, 37, 76, 15);
      if (night > 0.3) glow(c, 61, 44, 40, "rgba(255,240,200,A)", night * 0.35);
      c.fillStyle = "#1e293b"; c.font = "bold 9px Pretendard, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("옥상 쉼터 카페", 61, 45);
      // 카운터
      c.fillStyle = mix("#c08552", "#6b4e4a", night * 0.4); c.fillRect(6, 120, 114, FLOOR - 120 + 6);
      c.fillStyle = mix("#8a5a35", "#4f3a36", night * 0.4); c.fillRect(4, 117, 118, 5);
      c.fillStyle = "rgba(255,255,255,.12)"; for (let x = 14; x < 118; x += 16) c.fillRect(x, 125, 1.2, 22);
      // 커피 머신
      const L = s.fac.coffee;
      const mc = L >= 7 ? "#e5e7eb" : L >= 4 ? "#94a3b8" : "#475569";
      c.fillStyle = mc; rr(c, 10, 98, L >= 4 ? 30 : 22, 19, 2);
      c.fillStyle = "#1e293b"; c.fillRect(13, 109, L >= 4 ? 24 : 16, 2);
      c.fillStyle = L >= 7 ? "#facc15" : "#ef4444"; circ(c, 14, 102, 1.4); if (L >= 4) circ(c, 36, 102, 1.4);
      c.fillStyle = "#fff"; c.fillRect(17, 112, 4, 5); if (L >= 4) c.fillRect(29, 112, 4, 5);
      if (info.served && !info.full) { c.strokeStyle = "rgba(255,255,255,.7)"; c.lineWidth = 0.8; c.beginPath(); const sy = 96 - (tm * 6 % 6); c.moveTo(19, sy); c.quadraticCurveTo(17, sy - 3, 19, sy - 6); c.stroke(); }
      // 계산대
      const C2 = s.fac.counter;
      c.fillStyle = "#334155"; rr(c, 102, 106, 14, 11, 1.5); c.fillStyle = C2 >= 4 ? "#7dd3fc" : "#a7f3d0"; c.fillRect(104, 108, 10, 4);
      if (C2 >= 6) { c.fillStyle = "#334155"; c.fillRect(94, 110, 6, 7); c.fillStyle = "#e2e8f0"; c.fillRect(95, 111, 4, 3); }
      // 디저트 진열장
      if (s.fac.dessert > 0) {
        c.fillStyle = "rgba(186,230,253,.55)"; rr(c, 56, 98, 36, 19, 2); c.strokeStyle = "#94a3b8"; c.lineWidth = 0.8; c.strokeRect(56.5, 98.5, 35, 18);
        c.fillStyle = "#cbd5e1"; c.fillRect(57, 107, 34, 1);
        const n = Math.min(10, 2 + s.fac.dessert), cols = ["#fda4af", "#fde68a", "#f9a8d4", "#c4b5fd", "#fdba74"];
        for (let i = 0; i < n; i++) { const row = i < 5 ? 0 : 1, x = 61 + (i % 5) * 6.5, y = row ? 113 : 104; c.fillStyle = "#fff7ed"; rr(c, x - 2.5, y, 5, 3, 1); c.fillStyle = cols[i % 5]; rr(c, x - 2.5, y - 1.5, 5, 2, 1); }
      }
    }

    function frame(ts) {
      if (!alive) return;
      const dt = Math.min(0.1, last ? (ts - last) / 1000 : 0.016); last = ts;
      const s = getState(); const info = opts.info();
      if (!reduce) update(dt, s, info);
      draw(s, info);
      raf = requestAnimationFrame(frame);
    }
    function start() {
      resize();
      if (reduce) { const s = getState(); const info = opts.info(); seatsList(s).slice(0, Math.min(4, Math.round((info.served || 0) / 20))).forEach((st, i) => people.push({ x: st.x, y: st.y, st: "sit", seat: i, dir: st.dir, lk: LOOKS[i % 8], skin: SKINS[i % 5], walk: 0, wait: 1e9, cup: true })); draw(s, info); }
      else raf = requestAnimationFrame(frame);
    }
    const ro = new ResizeObserver(() => { resize(); if (reduce) draw(getState(), opts.info()); });
    ro.observe(canvas);
    document.addEventListener("visibilitychange", () => { if (reduce || !alive) return; cancelAnimationFrame(raf); last = 0; if (document.visibilityState === "visible") raf = requestAnimationFrame(frame); });
    start();
    return {
      redraw: () => { if (reduce) draw(getState(), opts.info()); },
      destroy: () => { alive = false; cancelAnimationFrame(raf); ro.disconnect(); },
    };
  }

  // 작은 그림(꾸미기 · 알바생 얼굴) — canvas 를 dataURL 로
  function thumb(w, h, fn) {
    const cv = document.createElement("canvas"), d = 2;
    cv.width = w * d; cv.height = h * d;
    const c = cv.getContext("2d"); c.scale(d, d); fn(c);
    return cv.toDataURL();
  }
  const decoThumb = (id) => thumb(64, 52, (c) => { c.fillStyle = "#f1f5f9"; c.fillRect(0, 0, 64, 52); c.fillStyle = "#e7dccb"; c.fillRect(0, 36, 64, 16); deco(c, id, 32, 46, 0, 0); });
  const staffThumb = (st) => thumb(56, 56, (c) => { c.fillStyle = "#eef3ff"; c.fillRect(0, 0, 56, 56); c.save(); c.translate(28, 0); c.scale(1.5, 1.5); person(c, 0, 37, { ...st, pants: "#334155", apron: "#fff" }); c.restore(); });

  // ══ 화면 ══════════════════════════════════════════════════════
  // 조사 — jo("커피 머신", "이/가") → "커피 머신이", jo("Lv 3", "으로/로") → "Lv 3으로"
  function jo(w, pair) {
    const [a, b] = pair.split("/"), ch = String(w).trim().slice(-1), code = ch.charCodeAt(0);
    let fin = 0; // 0 받침 없음 · 1 받침 · 2 ㄹ 받침
    if (code >= 0xac00 && code <= 0xd7a3) { const f = (code - 0xac00) % 28; fin = f === 0 ? 0 : f === 8 ? 2 : 1; }
    else if (/[0-9]/.test(ch)) fin = "1278".includes(ch) ? ("178".includes(ch) ? 2 : 0) : "036".includes(ch) ? 1 : 0;
    const has = a === "으로" ? fin === 1 : fin > 0;
    return w + (has ? a : b);
  }
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const ic = (name, size = 18) => (window.HKUI ? HKUI.icon(name, size, "currentColor") : "");
  const dur = (sec) => (window.HKMgmt ? HKMgmt.dur(sec) : Math.round(sec) + "초");
  const pct = (a, b) => Math.max(0, Math.min(100, b > 0 ? (a / b) * 100 : 0));
  const TABS = [
    { id: "fac", name: "시설", icon: "hammer" }, { id: "menu", name: "메뉴", icon: "coffee" }, { id: "staff", name: "알바", icon: "users" },
    { id: "deco", name: "꾸미기", icon: "flower-2" }, { id: "orders", name: "주문", icon: "clipboard-list" },
  ];
  const CAT_ICON = { coffee: "coffee", dessert: "cake-slice", tea: "leaf" };
  const LIMIT_TEXT = {
    demand: { title: "손님이 더 오면 좋겠어요", body: "화분 · 조명과 꾸미기로 평판을 올리거나, 인기 있는 메뉴를 진열해 보세요." },
    seat: { title: "자리가 모자라 손님이 돌아가요", body: "좌석을 늘리면 바로 손님이 늘어요." },
    service: { title: "주문이 밀려 있어요", body: "계산대를 올리거나 알바생을 뽑으면 더 빨리 받아요." },
  };

  function facEffect(id, L) {
    switch (id) {
      case "coffee": return L > 1 ? `커피 값 +${Math.round(12 * (L - 1))}% · 내리는 시간 −${4 * (L - 1)}%` : "기본 커피 머신이에요";
      case "dessert": return L > 1 ? `디저트 값 +${Math.round(12 * (L - 1))}%` : L ? "디저트를 팔 수 있어요" : "아직 없어요 · 놓으면 디저트를 팔아요";
      case "tea": return L > 1 ? `차 · 음료 값 +${Math.round(12 * (L - 1))}%` : L ? "차 · 음료를 팔 수 있어요" : "아직 없어요 · 놓으면 차를 팔아요";
      case "seat": return `자리 ${SEATS[L]}개 · 시간당 손님 ${SEATS[L] * TURN}명까지`;
      case "counter": return L > 1 ? `주문 받는 속도 +${30 * (L - 1)}%` : "기본 속도예요";
      case "plant": return L ? `평판 +${5 * L}` : "아직 없어요 · 놓으면 평판이 올라요";
    }
    return "";
  }
  function staffEffect(skill, L) {
    if (skill === "barista") return `커피 값 +${4 * L}% · 내리는 시간 −${3 * L}%`;
    if (skill === "pastry") return `디저트 · 차 값 +${4 * L}% · 만드는 시간 −${2 * L}%`;
    return `평판 +${2 * L}`;
  }
  function unlocksAt(g) {
    const out = [];
    MENU.filter((m) => m.g === g).forEach((m) => out.push({ icon: CAT_ICON[m.cat], text: `새 메뉴 「${m.name}」` }));
    FAC.filter((f) => f.g === g && g > 1).forEach((f) => out.push({ icon: f.icon, text: `새 시설 「${f.name}」` }));
    if (facCapAt(g) > facCapAt(g - 1)) out.push({ icon: "arrow-up-circle", text: `시설을 Lv ${facCapAt(g)}까지 올릴 수 있어요` });
    DECO.filter((d) => d.g === g).forEach((d) => out.push({ icon: "flower-2", text: `꾸미기 「${d.name}」` }));
    STAFF_SLOTS.forEach((x, i) => { if (x.g === g) out.push({ icon: "user-plus", text: `알바 자리 ${i + 1}번째` }); });
    SPOTS.forEach((sp, i) => { if (sp.g === g && g > 1) out.push({ icon: "map-pin", text: `꾸미기 자리 ${i + 1}번 「${sp.name}」` }); });
    if (menuSlotsAt(g) > menuSlotsAt(g - 1)) out.push({ icon: "layout-grid", text: `진열 칸 ${menuSlotsAt(g)}칸` });
    if (buildSlotsAt(g) > buildSlotsAt(g - 1)) out.push({ icon: "hammer", text: `공사를 ${buildSlotsAt(g)}곳 동시에` });
    return out;
  }

  function mount(root) {
    root.innerHTML = `<div class="cf-loading"><span class="hk-spin"></span></div>`;
    let store = null, S = null, scene = null, tab = "fac", sig = "", lastSave = 0, modalOpen = 0;
    let liveLog = newLog();
    const thumbs = {};

    const fresh = (st) => { // 예전 · 빠진 칸 채우기
      const b = blank(st && st.t ? st.t : Date.now());
      if (!st || st.v !== 1) return b;
      for (const k of Object.keys(b)) if (st[k] === undefined) st[k] = b[k];
      st.fac = { ...b.fac, ...st.fac };
      st.deco = { owned: st.deco.owned || [], place: SPOTS.map((_, i) => (st.deco.place || [])[i] || null) };
      st.orders = st.orders && Array.isArray(st.orders.list) ? st.orders : b.orders;
      return st;
    };

    HKMgmt.open("cafe", {
      blank: () => blank(Date.now()),
      onStale: (st) => { S = fresh(st); store.state = S; sig = ""; HKUI.toast("다른 창에서 바꾼 내용으로 다시 불러왔어요", "info"); renderAll(); },
      onClosed: (opens) => { if (scene) scene.destroy(); root.innerHTML = HKMgmt.closedHtml(opens, "옥상 쉼터 카페"); HKUI.refreshIcons(root); },
    }).then((st) => {
      store = st;
      const now = store.now();
      if (store.isNew) { store.state = blank(now); }
      S = store.state = fresh(store.state);
      const away = now - S.t;
      const log = newLog();
      advance(S, now, log);
      build();
      if (store.isNew) { store.saveNow(); showTutorial(); }
      else if (away > 60000) showAway(away, log);
      else if (log.grades.length) showGrades(log.grades);
      if (away <= 60000 && log.newOrders) HKUI.toast(`오늘의 주문 ${log.newOrders}개가 새로 왔어요`, "info");
      store.dirty();
      setInterval(tick, 1000);
      const hide = () => { if (document.visibilityState === "hidden") { advance(S, store.now()); store.saveNow({ keepalive: true }); } };
      document.addEventListener("visibilitychange", hide);
    }).catch((e) => {
      if (e && e.closed) { root.innerHTML = HKMgmt.closedHtml(e.opensAt, "옥상 쉼터 카페"); HKUI.refreshIcons(root); return; }
      root.innerHTML = `<div class="hk-mg-closed"><b>카페를 불러오지 못했어요</b><p>${esc((e && e.message) || "잠시 뒤 다시 들어와 주세요.")}</p><button class="hk-btn hk-btn--secondary" onclick="location.reload()">다시 불러오기</button></div>`;
    });

    function info() {
      if (!S) return { now: Date.now(), served: 0, full: false };
      const r = rates(S);
      return { now: store.now(), served: r.served, full: S.pending >= capOf(r) - 1, price: r.avgPrice };
    }

    function build() {
      root.innerHTML = `
        <a class="hk-mg-back" href="/manage">${ic("chevron-left", 16)}매니지먼트</a>
        <div class="cf-head">
          <div class="cf-head__title"><div><h1>옥상 쉼터 카페</h1><p>회사 옥상의 작은 쉼터를 키워요</p></div></div>
          <div class="cf-head__btns">
            <button type="button" class="cf-iconbtn" data-act="help">${ic("circle-help", 18)}<span>도움말</span></button>
            <button type="button" class="cf-iconbtn" data-act="reset">${ic("rotate-ccw", 18)}<span>처음부터 다시</span></button>
          </div>
        </div>
        <div class="cf-grid">
          <div class="cf-left">
            <div class="cf-scene">
              <canvas id="cf-canvas" aria-label="옥상 카페 그림"></canvas>
              <div class="cf-scene__chips"><span class="cf-chip cf-chip--grade" id="cf-chip-grade"></span><span class="cf-chip" id="cf-chip-time"></span></div>
              <div class="cf-scene__full" id="cf-full" hidden>${ic("package-check", 16)}<span>가득 찼어요 · 수입을 받아 주세요</span></div>
            </div>
            <div class="cf-stats" id="cf-stats"></div>
            <div class="cf-card cf-income">
              <div class="cf-income__top">
                <div><div class="cf-label">쌓인 수입</div><div class="cf-income__num" id="cf-pending">0원</div></div>
                <button type="button" class="hk-btn hk-btn--primary cf-collect" data-act="collect" id="cf-collect">${ic("hand-coins", 18)}<span>수입 받기</span></button>
              </div>
              <div class="cf-bar"><i id="cf-pend-bar"></i></div>
              <div class="cf-sub" id="cf-pend-sub"></div>
            </div>
            <div class="cf-card cf-grade" id="cf-grade"></div>
            <div id="cf-builds"></div>
            <div id="cf-done"></div>
          </div>
          <div class="cf-right">
            <div class="cf-tabs" role="tablist">${TABS.map((t) => `<button type="button" role="tab" class="cf-tab" data-tab="${t.id}">${ic(t.icon, 18)}<span>${t.name}</span><b class="cf-tab__dot" id="cf-dot-${t.id}" hidden></b></button>`).join("")}</div>
            <div class="cf-panel" id="cf-panel"></div>
          </div>
        </div>`;
      root.addEventListener("click", onClick);
      scene = makeScene(root.querySelector("#cf-canvas"), () => S, { info, showSpots: () => tab === "deco" });
      sig = "";
      renderAll();
    }

    // ── 그리기 ──
    function renderAll() { if (!root.querySelector("#cf-panel")) return; renderLive(); renderPanel(); HKUI.refreshIcons(root); }
    function renderLive() {
      const r = rates(S), cap = capOf(r), full = S.pending >= cap - 1;
      const $ = (id) => root.querySelector("#" + id);
      $("cf-chip-grade").textContent = `카페 등급 ${S.grade}`;
      const h = kstHour(store.now()), hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
      const part = h < 6 ? "새벽" : h < 11 ? "아침" : h < 14 ? "점심" : h < 17.5 ? "오후" : h < 20 ? "저녁" : "밤";
      $("cf-chip-time").textContent = `${part} ${hh % 12 || 12}:${String(mm).padStart(2, "0")}`;
      $("cf-full").hidden = !full;
      $("cf-stats").innerHTML = `
        <div class="cf-stat"><span>${ic("wallet", 16)}</span><div><small>가진 돈</small><b>${won(S.cash)}</b></div></div>
        <div class="cf-stat"><span>${ic("trending-up", 16)}</span><div><small>시간당 수입</small><b>${won(r.perHour)}</b></div></div>
        <div class="cf-stat"><span>${ic("users", 16)}</span><div><small>시간당 손님</small><b>${num(r.served)}명</b></div></div>
        <div class="cf-stat"><span>${ic("sparkles", 16)}</span><div><small>꾸미기 재료</small><b>${num(S.mat)}개</b></div></div>`;
      $("cf-pending").textContent = won(S.pending);
      $("cf-pend-bar").style.width = pct(S.pending, cap) + "%";
      $("cf-pend-bar").classList.toggle("is-full", full);
      $("cf-pend-sub").innerHTML = full ? `<b class="cf-full-txt">가득 찼어요</b> · 받으면 다시 장사해요 (최대 ${CAP_HOURS}시간치 ${won(cap)})`
        : `자리 비운 동안에도 최대 ${CAP_HOURS}시간치(${won(cap)})까지 쌓여요${r.perHour > 0 ? ` · 가득 차기까지 ${dur((cap - S.pending) / r.perHour * 3600)}` : ""}`;
      const btn = $("cf-collect"); btn.disabled = S.pending < 1;
      // 등급
      const q = GRADE_REQ[S.grade];
      $("cf-grade").innerHTML = S.grade >= MAX_GRADE
        ? `<div class="cf-grade__head"><b>카페 등급 ${S.grade}</b><span class="cf-pill cf-pill--gold">${ic("award", 14)} 1차 완주</span></div><div class="cf-sub">누적 매출 ${won(S.sales)} · 맞이한 손님 ${num(S.served)}명</div>`
        : `<div class="cf-grade__head"><b>카페 등급 ${S.grade}</b><span class="cf-sub">다음 등급까지</span></div>
          <div class="cf-req"><span>누적 매출</span><div class="cf-bar cf-bar--sm"><i style="width:${pct(S.sales, q.sales)}%"></i></div><em>${won(Math.min(S.sales, q.sales))} / ${won(q.sales)}</em></div>
          <div class="cf-req"><span>시설 레벨 합</span><div class="cf-bar cf-bar--sm cf-bar--violet"><i style="width:${pct(facSum(S), q.fac)}%"></i></div><em>${facSum(S)} / ${q.fac}</em></div>`;
      // 공사
      const nb = buildSlotsAt(S.grade);
      $("cf-builds").innerHTML = S.builds.length ? `<div class="cf-card cf-builds"><div class="cf-label">${ic("hammer", 14)} 공사 중 ${S.builds.length} / ${nb}</div>${S.builds.map((b) => {
        const left = Math.max(0, (b.end - store.now()) / 1000), tot = (b.end - b.start) / 1000;
        return `<div class="cf-build"><span>${esc(FAC_BY[b.id].name)} Lv ${b.to}</span><div class="cf-bar cf-bar--sm cf-bar--amber"><i style="width:${pct(tot - left, tot)}%"></i></div><em>${dur(left)} 남음</em></div>`;
      }).join("")}</div>` : "";
      $("cf-done").innerHTML = S.done1 ? `<button type="button" class="cf-card cf-donecard" data-act="done">${ic("award", 22)}<div><b>1차 완주했어요!</b><span>다음 업데이트 안내 보기</span></div>${ic("chevron-right", 18)}</button>` : "";
      // 탭 점
      const ordersReady = S.orders.list.filter((o) => !o.claimed && orderDone(o)).length;
      const dOrders = root.querySelector("#cf-dot-orders"); dOrders.hidden = !ordersReady; dOrders.textContent = ordersReady || "";
      root.querySelector("#cf-dot-fac").hidden = !FAC.some((f) => !facBlock(S, f.id));
      root.querySelectorAll(".cf-tab").forEach((b) => { b.classList.toggle("is-on", b.dataset.tab === tab); b.setAttribute("aria-selected", b.dataset.tab === tab); });
      liveFields();
      HKUI.refreshIcons(root.querySelector("#cf-stats"));
      HKUI.refreshIcons(root.querySelector("#cf-grade"));
      HKUI.refreshIcons(root.querySelector("#cf-builds"));
      HKUI.refreshIcons(root.querySelector("#cf-done"));
    }
    // 패널 안 실시간 글자 — 남은 공사 시간 · 주문 진행 · 알바생 일한 시간
    function liveFields() {
      root.querySelectorAll("[data-live]").forEach((el) => {
        const [k, id] = el.dataset.live.split(":");
        if (k === "build") { const b = S.builds.find((x) => x.id === id); if (b) { const left = Math.max(0, (b.end - store.now()) / 1000), tot = (b.end - b.start) / 1000; if (el.tagName === "I") el.style.width = pct(tot - left, tot) + "%"; else el.textContent = `${dur(left)} 남음`; } }
        if (k === "order") { const o = S.orders.list.find((x) => x.id === id); if (o) { if (el.tagName === "I") el.style.width = pct(o.p, o.target) + "%"; else el.textContent = orderProg(o); } }
        if (k === "xp") { const st = S.staff.find((x) => x.id === id); if (st) { if (el.tagName === "I") el.style.width = pct(st.xp, staffNeed(st.lv)) + "%"; else el.textContent = st.lv >= STAFF_MAX ? "가장 높은 레벨" : `다음 레벨까지 ${dur((staffNeed(st.lv) - st.xp) * 3600)} 일하기`; } }
      });
    }

    function panelSig() {
      const aff = [
        FAC.map((f) => { const b = facBlock(S, f.id); return b ? b.why : "ok"; }).join(""),
        STAFF_SLOTS.map((x) => (S.cash >= x.cost ? 1 : 0)).join(""),
        DECO.map((d) => (S.cash >= d.cost && S.mat >= d.mat ? 1 : 0)).join(""),
      ];
      return JSON.stringify([tab, S.grade, S.fac, S.builds.map((b) => b.id + b.to), S.staff.map((x) => x.id + x.lv), S.menu, S.deco, S.orders.list.map((o) => o.id + (o.claimed ? "c" : orderDone(o) ? "d" : "")), aff, rates(S).limit]);
    }

    function renderPanel() {
      const s2 = panelSig();
      if (s2 === sig) return;
      sig = s2;
      const el = root.querySelector("#cf-panel");
      el.innerHTML = tab === "fac" ? panelFac() : tab === "menu" ? panelMenu() : tab === "staff" ? panelStaff() : tab === "deco" ? panelDeco() : panelOrders();
      HKUI.refreshIcons(el);
      liveFields();
    }

    function panelFac() {
      const r = rates(S), L = LIMIT_TEXT[r.limit];
      const row = (label, v, on) => `<div class="cf-flow__row${on ? " is-limit" : ""}"><span>${label}</span><b>${num(v)}명</b></div>`;
      return `<div class="cf-hint">
          <div class="cf-hint__icon">${ic("lightbulb", 18)}</div>
          <div><b>${L.title}</b><p>${L.body}</p>
            <div class="cf-flow">${row("찾아오는 손님", r.demand, r.limit === "demand")}${row("자리로 받을 수 있는", r.seatCap, r.limit === "seat")}${row("주문 받을 수 있는", r.serviceCap, r.limit === "service")}</div>
            <small>모두 시간당 · 가장 작은 수만큼 손님을 받아요</small></div>
        </div>
        <div class="cf-list">${FAC.map((f) => {
          const lv = S.fac[f.id], b = facBlock(S, f.id), building = S.builds.find((x) => x.id === f.id);
          const to = lv + 1, cost = upCost(f.id, Math.min(to, f.max)), t = upTime(Math.min(to, f.max));
          let foot;
          if (building) foot = `<div class="cf-prog"><div class="cf-bar cf-bar--sm cf-bar--amber"><i data-live="build:${f.id}"></i></div><em data-live="build:${f.id}"></em></div>`;
          else if (b && b.why !== "cash") foot = `<div class="cf-lock">${ic(b.why === "max" ? "check" : "lock", 14)}${esc(b.text)}</div>`;
          else foot = `<button type="button" class="hk-btn ${b ? "hk-btn--secondary" : "hk-btn--primary"} cf-act" data-act="up" data-id="${f.id}" ${b ? "disabled" : ""}><span>${lv ? `${jo("Lv " + to, "으로/로")} 올리기` : "놓기"}</span><small>${won(cost)}${t ? ` · ${dur(t)} 걸려요` : " · 바로 끝나요"}</small></button>`;
          const next = lv < f.max && S.grade >= f.g ? `<div class="cf-next">${ic("arrow-right", 12)} ${esc(facEffect(f.id, to))}</div>` : "";
          return `<div class="cf-item${S.grade < f.g ? " is-locked" : ""}">
            <div class="cf-item__icon cf-c-${f.id}">${ic(f.icon, 22)}</div>
            <div class="cf-item__body">
              <div class="cf-item__title"><b>${esc(f.name)}</b><span class="cf-lv">${lv ? `Lv ${lv}` : "없음"}<small> / ${f.max}</small></span></div>
              <div class="cf-item__desc">${esc(f.desc)}</div>
              <div class="cf-now">${esc(facEffect(f.id, lv) || "")}</div>${next}
              ${foot}
            </div></div>`;
        }).join("")}</div>`;
    }

    function panelMenu() {
      const slots = menuSlotsAt(S.grade), r = rates(S);
      const on = S.menu.filter((id) => menuOk(S, MENU_BY[id]));
      const best = bestMenu(S), isBest = best.length === on.length && best.every((x) => on.includes(x));
      return `<div class="cf-slots">
          <div class="cf-slots__head"><b>진열 칸 ${on.length} / ${slots}</b>${slots < 4 ? `<span class="cf-sub">등급 9부터 4칸</span>` : ""}</div>
          <div class="cf-slots__row">${Array.from({ length: slots }, (_, i) => { const m = MENU_BY[on[i]]; return m ? `<div class="cf-slot is-on">${ic(CAT_ICON[m.cat], 16)}<span>${esc(m.name)}</span></div>` : `<div class="cf-slot">빈 칸</div>`; }).join("")}</div>
          <button type="button" class="hk-btn hk-btn--secondary cf-act" data-act="bestmenu" ${isBest ? "disabled" : ""}>${ic("wand-sparkles", 16)} ${isBest ? "지금이 가장 많이 버는 조합이에요" : "가장 많이 버는 조합으로 진열"}</button>
          <div class="cf-sub">메뉴 매력 ${r.appeal.toFixed(2)} · 손님 한 명이 평균 ${won(r.avgPrice)} 써요. 여러 가지를 진열할수록 손님이 더 와요.</div>
        </div>
        <div class="cf-list">${MENU.map((m) => {
          const ok = menuOk(S, m), isOn = on.includes(m.id);
          const facName = FAC_BY[CATS[m.cat].fac].name;
          const lock = S.grade < m.g ? `등급 ${m.g}에 열려요` : `${jo(facName + " Lv " + m.need, "이/가")} 있어야 해요`;
          const stars = Math.round(m.pop * 3) - 1;
          const share = r.items.find((x) => x.id === m.id);
          return `<div class="cf-item cf-item--menu${ok ? "" : " is-locked"}${isOn ? " is-on" : ""}">
            <div class="cf-item__icon cf-c-${m.cat}">${ic(CAT_ICON[m.cat], 20)}</div>
            <div class="cf-item__body">
              <div class="cf-item__title"><b>${esc(m.name)}</b><span class="cf-tag">${CATS[m.cat].name}</span></div>
              <div class="cf-meta"><span>${ic("tag", 13)} ${won(ok ? itemPrice(S, m) : m.price)}</span><span>${ic("timer", 13)} ${dur(ok ? itemPrep(S, m) : m.prep)}</span><span class="cf-stars" aria-label="인기 ${stars}">${"★".repeat(stars)}<i>${"★".repeat(5 - stars)}</i></span></div>
              ${share ? `<div class="cf-sub">시간당 ${num(share.perHour)}${CATS[m.cat].unit}쯤 팔려요</div>` : ""}
              ${ok ? `<button type="button" class="hk-btn ${isOn ? "hk-btn--secondary" : "hk-btn--primary"} cf-act" data-act="menu" data-id="${m.id}">${isOn ? "진열 내리기" : "진열하기"}</button>` : `<div class="cf-lock">${ic("lock", 14)}${esc(lock)}</div>`}
            </div></div>`;
        }).join("")}</div>`;
    }

    function panelStaff() {
      const open = staffSlots(S), n = S.staff.length, slot = STAFF_SLOTS[n];
      const nextG = STAFF_SLOTS.find((x) => x.g > S.grade);
      return `<div class="cf-note">${ic("users", 16)}<span>알바 자리 <b>${n} / ${open}</b>${nextG ? ` · 다음 자리는 등급 ${nextG.g}에 열려요` : ""}. 알바생은 일손이 되어 주문을 더 받고, 장기에 따라 효과가 있어요. 장사한 시간만큼 저절로 레벨이 올라요.</span></div>
        <div class="cf-list">${STAFF.map((st) => {
          const me = S.staff.find((x) => x.id === st.id);
          thumbs["st-" + st.id] = thumbs["st-" + st.id] || staffThumb(st);
          let foot;
          if (me) foot = `<div class="cf-prog"><div class="cf-bar cf-bar--sm cf-bar--green"><i data-live="xp:${st.id}"></i></div><em data-live="xp:${st.id}"></em></div><div class="cf-now">지금 효과: ${esc(staffEffect(st.skill, me.lv))}</div>`;
          else if (!slot) foot = `<div class="cf-lock">${ic("lock", 14)}알바 자리가 모두 찼어요</div>`;
          else if (S.grade < slot.g) foot = `<div class="cf-lock">${ic("lock", 14)}등급 ${slot.g}에 ${n + 1}번째 자리가 열려요</div>`;
          else foot = `<button type="button" class="hk-btn ${S.cash >= slot.cost ? "hk-btn--primary" : "hk-btn--secondary"} cf-act" data-act="hire" data-id="${st.id}" ${S.cash >= slot.cost ? "" : "disabled"}><span>함께 일하기</span><small>${won(slot.cost)}</small></button>${S.cash < slot.cost ? `<div class="cf-sub">돈이 모자라요</div>` : ""}`;
          return `<div class="cf-item${me ? " is-on" : ""}">
            <img class="cf-face" src="${thumbs["st-" + st.id]}" alt="">
            <div class="cf-item__body">
              <div class="cf-item__title"><b>${esc(st.name)}</b><span class="cf-tag cf-tag--${st.skill}">${esc(st.skillName)}</span>${me ? `<span class="cf-lv">Lv ${me.lv}<small> / ${STAFF_MAX}</small></span>` : ""}</div>
              <div class="cf-item__desc">${esc(st.desc)} · 레벨마다 ${esc(staffEffect(st.skill, 1))}</div>
              ${foot}
            </div></div>`;
        }).join("")}</div>`;
    }

    function panelDeco() {
      return `<div class="cf-note">${ic("flower-2", 16)}<span>꾸미기 물건을 사서 옥상 자리에 놓으면 평판이 올라요. 지금 꾸미기 평판 <b>+${decoRep(S)}</b> · 재료 <b>${num(S.mat)}개</b> (재료는 오늘의 주문으로 받아요)</span></div>
        <div class="cf-spots">${SPOTS.map((sp, i) => {
          const id = S.deco.place[i], open = S.grade >= sp.g;
          return `<button type="button" class="cf-spot${id ? " is-filled" : ""}" data-act="spot" data-i="${i}" ${open ? "" : "disabled"}>
            <span class="cf-spot__no">${i + 1}</span><span class="cf-spot__name">${esc(sp.name)}</span>
            <span class="cf-spot__item">${open ? (id ? esc(DECO_BY[id].name) : "비어 있어요") : `등급 ${sp.g}에 열려요`}</span></button>`;
        }).join("")}</div>
        <div class="cf-list cf-list--deco">${DECO.map((d) => {
          thumbs["d-" + d.id] = thumbs["d-" + d.id] || decoThumb(d.id);
          const own = S.deco.owned.includes(d.id), placed = S.deco.place.indexOf(d.id);
          const ok = S.cash >= d.cost && S.mat >= d.mat;
          let foot;
          if (own) foot = `<div class="cf-now">${placed >= 0 ? `${ic("map-pin", 13)} ${placed + 1}번 자리에 놓았어요` : "가지고 있어요 · 위 자리를 눌러 놓아요"}</div>`;
          else if (S.grade < d.g) foot = `<div class="cf-lock">${ic("lock", 14)}등급 ${d.g}에 열려요</div>`;
          else foot = `<button type="button" class="hk-btn ${ok ? "hk-btn--primary" : "hk-btn--secondary"} cf-act" data-act="deco" data-id="${d.id}" ${ok ? "" : "disabled"}><span>사기</span><small>${won(d.cost)} · 재료 ${d.mat}개</small></button>${ok ? "" : `<div class="cf-sub">${S.mat < d.mat ? "재료가" : "돈이"} 모자라요</div>`}`;
          return `<div class="cf-item${own ? " is-on" : ""}${S.grade < d.g ? " is-locked" : ""}">
            <img class="cf-face cf-face--deco" src="${thumbs["d-" + d.id]}" alt="">
            <div class="cf-item__body"><div class="cf-item__title"><b>${esc(d.name)}</b><span class="cf-tag">평판 +${d.rep}</span></div>${foot}</div></div>`;
        }).join("")}</div>`;
    }

    function panelOrders() {
      const list = S.orders.list.filter((o) => !o.claimed).sort((a, b) => (orderDone(b) ? 1 : 0) - (orderDone(a) ? 1 : 0));
      const now = store.now(), midnight = Date.parse(dayKey(now) + "T00:00:00+09:00") + 86400000;
      return `<div class="cf-note">${ic("clipboard-list", 16)}<span>오늘의 주문은 하루 3개씩 와요. 못 한 주문은 3일치(9개)까지 쌓여 있으니 천천히 해도 괜찮아요. 새 주문까지 <b>${dur((midnight - now) / 1000)}</b></span></div>
        ${list.length ? `<div class="cf-list">${list.map((o) => {
          const done = orderDone(o);
          return `<div class="cf-item cf-order${done ? " is-done" : ""}">
            <div class="cf-item__icon ${done ? "cf-c-done" : "cf-c-order"}">${ic(done ? "check" : o.kind === "keep" ? "clock" : o.kind === "upgrade" ? "hammer" : o.kind === "collect" ? "hand-coins" : o.kind === "earn" ? "coins" : o.kind === "serve" ? "users" : CAT_ICON[o.cat || (MENU_BY[o.item] || {}).cat] || "coffee", 20)}</div>
            <div class="cf-item__body">
              <div class="cf-item__title"><b>${esc(orderText(o))}</b></div>
              <div class="cf-prog"><div class="cf-bar cf-bar--sm ${done ? "cf-bar--green" : ""}"><i data-live="order:${o.id}"></i></div><em data-live="order:${o.id}"></em></div>
              <div class="cf-reward">${ic("gift", 13)} ${won(o.cash)} · 재료 ${o.mat}개</div>
              ${done ? `<button type="button" class="hk-btn hk-btn--primary cf-act" data-act="claim" data-id="${o.id}">보상 받기</button>` : ""}
            </div></div>`;
        }).join("")}</div>` : `<div class="cf-empty">${ic("party-popper", 26)}<b>오늘 주문을 모두 마쳤어요</b><span>내일 새 주문이 와요</span></div>`}`;
    }

    // ── 행동 ──
    function changed(big) { sig = ""; summary(S); if (big) store.saveNow(); else store.dirty(); renderAll(); scene && scene.redraw(); }
    async function onClick(e) {
      const tb = e.target.closest("[data-tab]");
      if (tb) { tab = tb.dataset.tab; sig = ""; renderAll(); return; }
      const b = e.target.closest("[data-act]");
      if (!b || b.disabled || !root.contains(b)) return;
      const act = b.dataset.act, id = b.dataset.id;
      advance(S, store.now(), liveLog);
      if (act === "collect") {
        const n = collect(S);
        if (n) { HKUI.toast(`${jo(won(n), "을/를")} 받았어요`); changed(true); }
      } else if (act === "up") {
        const f = FAC_BY[id], lv = S.fac[id];
        if (startUpgrade(S, id, store.now())) {
          const t = upTime(lv + 1);
          HKUI.toast(t ? `${f.name} 공사를 시작했어요 · ${dur(t)}` : lv ? `${jo(f.name, "이/가")} ${jo("Lv " + (lv + 1), "이/가")} 됐어요` : `${jo(f.name, "을/를")} 놓았어요`);
          const before = S.grade; checkGrade(S, liveLog); if (S.grade > before) flushGrades();
          changed(true);
        }
      } else if (act === "menu") {
        const res = toggleMenu(S, id);
        if (res === "full") HKUI.toast("진열 칸이 가득 찼어요. 하나를 먼저 내려 주세요", "info");
        else changed(false);
      } else if (act === "bestmenu") { S.menu = bestMenu(S); HKUI.toast("가장 많이 버는 조합으로 진열했어요"); changed(false); }
      else if (act === "hire") {
        const st = STAFF_BY[id];
        if (hire(S, id)) { HKUI.toast(`${jo(st.name, "이/가")} 함께 일하게 됐어요`); changed(true); }
      } else if (act === "deco") {
        const d = DECO_BY[id];
        if (buyDeco(S, id)) { const at = S.deco.place.indexOf(id); HKUI.toast(at >= 0 ? `${jo(d.name, "을/를")} ${at + 1}번 자리에 놓았어요` : `${jo(d.name, "을/를")} 샀어요 · 자리를 골라 놓아요`); changed(true); }
      } else if (act === "spot") openSpot(+b.dataset.i);
      else if (act === "claim") {
        const o = claimOrder(S, id);
        if (o) { HKUI.toast(`보상 ${won(o.cash)} · 재료 ${o.mat}개를 받았어요`); changed(true); }
      } else if (act === "help") showHelp();
      else if (act === "reset") doReset();
      else if (act === "done") showDone();
    }

    async function doReset() {
      const a = await HKUI.confirmDialog("처음부터 다시 할까요?", "카페 등급 · 시설 · 메뉴 · 알바생 · 꾸미기가 모두 사라지고 등급 1부터 새로 시작해요.", { confirmLabel: "처음부터 다시", confirmVariant: "danger" });
      if (!a) return;
      const b2 = await HKUI.confirmDialog("정말 지울까요?", "<b>지운 카페는 되돌릴 수 없어요.</b> 그래도 처음부터 다시 할까요?", { confirmLabel: "네, 모두 지울게요", confirmVariant: "danger" });
      if (!b2) return;
      try {
        await store.reset();
        S = store.state = blank(store.now()); advance(S, store.now()); await store.saveNow();
        liveLog = newLog(); tab = "fac"; sig = "";
        if (scene) scene.destroy();
        build(); showTutorial();
      } catch (e) { HKUI.toast((e && e.message) || "지우지 못했어요", "danger"); }
    }

    // ── 1초마다 ──
    function tick() {
      if (!S || !root.querySelector("#cf-panel")) return;
      const now = store.now(), gap = now - S.t;
      if (gap > 60000 && !modalOpen) { // 화면을 오래 숨겨 두었다 돌아옴
        const log = newLog(); advance(S, now, log); store.dirty(); sig = ""; renderAll(); showAway(gap, log); return;
      }
      advance(S, now, liveLog);
      if (liveLog.builds.length) { liveLog.builds.forEach((b) => HKUI.toast(`${FAC_BY[b.id].name} Lv ${b.to} 공사가 끝났어요`)); liveLog.builds = []; store.dirty(); }
      if (liveLog.staffUp.length) { liveLog.staffUp.forEach((u) => HKUI.toast(`${jo(STAFF_BY[u.id].name, "이/가")} ${jo("Lv " + u.lv, "이/가")} 됐어요`)); liveLog.staffUp = []; store.dirty(); }
      if (liveLog.newOrders) { HKUI.toast(`오늘의 주문 ${liveLog.newOrders}개가 새로 왔어요`, "info"); liveLog.newOrders = 0; store.dirty(); }
      if (liveLog.grades.length) flushGrades();
      liveLog.gain = 0; liveLog.served = 0; liveLog.sold = {}; liveLog.fullAt = null;
      if (Date.now() - lastSave > 30000) { lastSave = Date.now(); store.dirty(); }
      renderLive(); renderPanel();
    }
    function flushGrades() { const g = liveLog.grades.slice(); liveLog.grades = []; store.saveNow(); showGrades(g); }

    // ── 팝업 ──
    function modal(html, { cls = "", onClose } = {}) {
      modalOpen++;
      const ov = document.createElement("div");
      ov.className = "cf-ov";
      ov.innerHTML = `<div class="cf-modal ${cls}" role="dialog" aria-modal="true"><button type="button" class="cf-modal__x" data-esc-close aria-label="닫기">${ic("x", 20)}</button>${html}</div>`;
      const close = () => { if (!ov.isConnected) return; ov.remove(); modalOpen--; if (onClose) onClose(); };
      ov.addEventListener("click", (e) => { if (e.target === ov || e.target.closest("[data-esc-close]") || e.target.closest("[data-close]")) close(); });
      document.body.appendChild(ov);
      HKUI.refreshIcons(ov);
      const f = ov.querySelector(".hk-btn--primary") || ov.querySelector(".cf-modal__x"); if (f) f.focus({ preventScroll: true });
      return { el: ov, close };
    }

    function showAway(ms, log) {
      const r = rates(S);
      const sold = Object.entries(log.sold).filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]).slice(0, 3);
      const rows = [];
      // 손님 수는 소수로 쌓인다 — 1명이 안 되면 「손님 몇 명」으로
      rows.push(`<li>${ic("users", 16)}<span>${Math.floor(log.served) >= 1 ? `손님 <b>${num(log.served)}명</b>이 다녀가` : "손님 몇 명이 다녀가"} <b>${won(log.gain)}</b>어치 팔았어요</span></li>`);
      if (sold.length) rows.push(`<li>${ic("coffee", 16)}<span>${sold.map(([id, v]) => `${esc(MENU_BY[id].name)} ${num(v)}${CATS[MENU_BY[id].cat].unit}`).join(" · ")}</span></li>`);
      if (log.fullAt) rows.push(`<li class="is-warn">${ic("package-check", 16)}<span>${dur((log.fullAt - (store.now() - ms)) / 1000)} 만에 수입이 가득 차서 그 뒤로는 쉬었어요</span></li>`);
      log.builds.forEach((b) => rows.push(`<li>${ic("hammer", 16)}<span>${esc(FAC_BY[b.id].name)} Lv ${b.to} 공사가 끝났어요</span></li>`));
      const ups = {}; log.staffUp.forEach((u) => { ups[u.id] = u.lv; });
      Object.entries(ups).forEach(([id, lv]) => rows.push(`<li>${ic("user-check", 16)}<span>${jo(esc(STAFF_BY[id].name), "이/가")} ${jo("Lv " + lv, "이/가")} 됐어요</span></li>`));
      if (log.grades.length) rows.push(`<li class="is-good">${ic("award", 16)}<span>카페 <b>${jo("등급 " + log.grades[log.grades.length - 1], "이/가")}</b> 됐어요</span></li>`);
      if (log.newOrders) rows.push(`<li>${ic("clipboard-list", 16)}<span>오늘의 주문이 새로 왔어요</span></li>`);
      const grades = log.grades.slice();
      const m = modal(`<div class="cf-modal__icon">${ic("sunrise", 26)}</div>
        <h2>자리 비운 동안</h2>
        <p class="cf-modal__lead">${dur(ms / 1000)} 동안 카페가 장사했어요${ms > CAP_HOURS * 3600000 ? ` (쌓이는 건 최대 ${CAP_HOURS}시간)` : ""}</p>
        <ul class="cf-away">${rows.join("")}</ul>
        <div class="cf-modal__btns">
          <button type="button" class="hk-btn hk-btn--secondary" data-close>닫기</button>
          <button type="button" class="hk-btn hk-btn--primary" data-away-collect ${S.pending >= 1 ? "" : "disabled"}>${ic("hand-coins", 16)} 수입 받기 · ${won(S.pending)}</button>
        </div>`, { onClose: () => { if (grades.length) showGrades(grades); } });
      void r;
      m.el.querySelector("[data-away-collect]").addEventListener("click", () => {
        const n = collect(S); if (n) HKUI.toast(`${jo(won(n), "을/를")} 받았어요`); changed(true); m.close();
      });
    }

    function showGrades(list) {
      if (!list.length) return;
      const g = list[list.length - 1];
      const items = list.flatMap((x) => unlocksAt(x));
      const m = modal(`<div class="cf-modal__icon cf-modal__icon--gold">${ic("award", 28)}</div>
        <h2>카페 등급 ${g}!</h2>
        <p class="cf-modal__lead">옥상 카페가 한층 더 아늑해졌어요${list.length > 1 ? ` (등급 ${list[0]}~${g})` : ""}</p>
        ${items.length ? `<div class="cf-label">새로 열렸어요</div><ul class="cf-away">${items.map((x) => `<li>${ic(x.icon, 16)}<span>${esc(x.text)}</span></li>`).join("")}</ul>` : ""}
        <div class="cf-modal__btns"><button type="button" class="hk-btn hk-btn--primary" data-close>좋아요</button></div>`,
      { onClose: () => { if (g >= MAX_GRADE && !S.done1) { S.done1 = true; changed(true); showDone(); } } });
      void m;
    }

    function showDone() {
      const days = Math.max(1, Math.ceil((store.now() - S.born) / 86400000));
      modal(`<div class="cf-done-art">${doneArt()}</div>
        <h2>1차 완주를 축하해요!</h2>
        <p class="cf-modal__lead">작은 커피 머신 하나로 시작한 옥상 카페가 등급 ${MAX_GRADE}이 됐어요.</p>
        <div class="cf-done-stats">
          <div><small>누적 매출</small><b>${won(S.sales)}</b></div>
          <div><small>맞이한 손님</small><b>${num(S.served)}명</b></div>
          <div><small>함께한 날</small><b>${days}일</b></div>
        </div>
        <div class="cf-next-up">${ic("calendar-clock", 18)}<div><b>다음 업데이트 안내</b><p>2차에서는 저녁 영업 · 계절 메뉴 · 옥상 정원 가꾸기가 열릴 예정이에요. 그때까지 카페는 지금처럼 계속 장사하고, 시설 · 꾸미기도 이어서 키울 수 있어요.</p></div></div>
        <div class="cf-modal__btns"><button type="button" class="hk-btn hk-btn--primary" data-close>계속 장사하기</button></div>`, { cls: "cf-modal--done" });
    }
    function doneArt() {
      return `<svg viewBox="0 0 120 90" width="120" height="90" aria-hidden="true"><circle cx="60" cy="48" r="38" fill="#fef3c7"/><path d="M38 38h44v22a22 22 0 0 1-44 0z" fill="#fff" stroke="#f59e0b" stroke-width="3"/><path d="M82 44h6a8 8 0 0 1 0 16h-7" fill="none" stroke="#f59e0b" stroke-width="3"/><path d="M50 30q-4-6 0-12M60 28q-4-6 0-12M70 30q-4-6 0-12" stroke="#f59e0b" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M48 50l8 7 14-15" fill="none" stroke="#2f6bff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><g fill="#f472b6"><circle cx="20" cy="22" r="3"/><circle cx="102" cy="18" r="3"/></g><g fill="#60a5fa"><circle cx="14" cy="60" r="2.5"/><circle cx="108" cy="64" r="2.5"/></g><g fill="#facc15"><path d="M28 10l2 5 5 1-4 3 1 5-4-3-4 3 1-5-4-3 5-1z"/><path d="M94 76l1.6 4 4 .8-3 2.4.8 4-3.4-2.2-3.4 2.2.8-4-3-2.4 4-.8z"/></g></svg>`;
    }

    function showTutorial() {
      const steps = [
        { icon: "store", title: "옥상에 작은 카페를 열었어요", body: "동료들이 쉬러 와서 커피를 사 가요. 판매 수입은 「쌓인 수입」에 모이고, <b>수입 받기</b>를 누르면 가진 돈이 돼요." },
        { icon: "hammer", title: "시설을 올리고 메뉴를 늘려요", body: "좌석 · 계산대 · 커피 머신을 올리면 손님과 값이 늘어요. 큰 공사는 실제로 몇 분~1시간 걸리니 <b>출근 전에 걸어 두면</b> 일하는 동안 끝나요." },
        { icon: "clipboard-list", title: "자리 비운 동안에도 장사해요", body: `최대 ${CAP_HOURS}시간치까지 쌓여요. 점심 · 퇴근 뒤에 들러 받아 가세요. <b>오늘의 주문</b>을 하면 돈과 꾸미기 재료를 받아요.` },
      ];
      let i = 0;
      const m = modal(`<div id="cf-tut"></div>`, { cls: "cf-modal--tut", onClose: () => { S.tut = 1; store.dirty(); } });
      const draw = () => {
        const st = steps[i];
        m.el.querySelector("#cf-tut").innerHTML = `<div class="cf-modal__icon">${ic(st.icon, 26)}</div>
          <div class="cf-tut__step">${i + 1} / ${steps.length}</div>
          <h2>${st.title}</h2><p class="cf-modal__lead">${st.body}</p>
          <div class="cf-modal__btns">${i ? `<button type="button" class="hk-btn hk-btn--secondary" data-tut="prev">이전</button>` : `<button type="button" class="hk-btn hk-btn--secondary" data-close>건너뛰기</button>`}
          ${i < steps.length - 1 ? `<button type="button" class="hk-btn hk-btn--primary" data-tut="next">다음</button>` : `<button type="button" class="hk-btn hk-btn--primary" data-close>시작하기</button>`}</div>`;
        HKUI.refreshIcons(m.el);
      };
      m.el.addEventListener("click", (e) => { const t = e.target.closest("[data-tut]"); if (!t) return; i += t.dataset.tut === "next" ? 1 : -1; draw(); });
      draw();
    }

    function showHelp() {
      modal(`<div class="cf-modal__icon">${ic("circle-help", 26)}</div><h2>옥상 쉼터 카페 도움말</h2>
        <div class="cf-help">
          <p><b>손님</b> — 시간당 손님은 「찾아오는 손님(평판 × 메뉴 매력)」, 「좌석이 받을 수 있는 손님」, 「주문 받을 수 있는 손님」 중 가장 작은 수예요. 시설 탭 위에서 무엇이 모자란지 알려 줘요.</p>
          <p><b>수입</b> — 팔린 만큼 「쌓인 수입」에 모여요. 시간당 수입 × ${CAP_HOURS}시간이 차면 가득 차서 쉬어요. 받으면 다시 장사해요.</p>
          <p><b>시설</b> — Lv 3부터는 실제 시간이 걸려요(2분~1시간). 공사는 처음엔 한 곳, 등급 3부터 두 곳, 등급 10부터 세 곳 동시에 할 수 있어요.</p>
          <p><b>메뉴</b> — 등급과 시설 레벨로 열려요. 진열 칸(3칸, 등급 9부터 4칸)에 놓은 것만 팔아요.</p>
          <p><b>알바생</b> — 등급 3 · 7 · 11에 자리가 하나씩 열려요. 장사한 시간만큼 저절로 레벨이 올라요.</p>
          <p><b>카페 등급</b> — 누적 매출과 시설 레벨 합이 모두 채워지면 올라요. 등급 ${MAX_GRADE}이 1차 완주예요.</p>
          <p><b>쉬어도 괜찮아요</b> — 며칠 안 들어와도 카페는 망가지지 않아요. 수입은 가득 찬 채로, 주문은 3일치까지 기다려요.</p>
        </div>
        <div class="cf-modal__btns"><button type="button" class="hk-btn hk-btn--secondary" data-tut-again>처음 안내 다시 보기</button><button type="button" class="hk-btn hk-btn--primary" data-close>알겠어요</button></div>`);
      const again = document.querySelector("[data-tut-again]");
      if (again) again.addEventListener("click", () => { const ov = again.closest(".cf-ov"); ov.querySelector("[data-esc-close]").click(); showTutorial(); });
    }

    function openSpot(i) {
      const sp = SPOTS[i], cur = S.deco.place[i];
      const owned = S.deco.owned;
      const m = modal(`<h2>${i + 1}번 자리 · ${esc(sp.name)}</h2>
        <p class="cf-modal__lead">${cur ? `지금은 「${esc(DECO_BY[cur].name)}」${jo(DECO_BY[cur].name, "이/가").slice(-1)} 있어요.` : "비어 있어요."} 놓을 물건을 골라요.</p>
        ${owned.length ? `<div class="cf-pick">${owned.map((id) => {
          thumbs["d-" + id] = thumbs["d-" + id] || decoThumb(id);
          const at = S.deco.place.indexOf(id);
          return `<button type="button" class="cf-pick__item${id === cur ? " is-on" : ""}" data-pick="${id}"><img src="${thumbs["d-" + id]}" alt=""><b>${esc(DECO_BY[id].name)}</b><small>${at >= 0 ? (at === i ? "여기 있어요" : `${at + 1}번 자리에서 옮겨요`) : "놓지 않았어요"} · 평판 +${DECO_BY[id].rep}</small></button>`;
        }).join("")}</div>` : `<div class="cf-empty">${ic("shopping-bag", 24)}<b>아직 가진 꾸미기 물건이 없어요</b><span>아래 목록에서 사 보세요</span></div>`}
        <div class="cf-modal__btns">${cur ? `<button type="button" class="hk-btn hk-btn--secondary" data-pick="">자리 비우기</button>` : ""}<button type="button" class="hk-btn hk-btn--primary" data-close>닫기</button></div>`);
      m.el.addEventListener("click", (e) => {
        const p = e.target.closest("[data-pick]"); if (!p) return;
        placeDeco(S, i, p.dataset.pick || null); changed(false); m.close();
      });
    }
  }

  return { core, mount };
})();
