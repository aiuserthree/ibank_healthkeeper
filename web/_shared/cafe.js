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
    { id: "peachtea", name: "복숭아 아이스티", cat: "tea", price: 1700, prep: 98, pop: 1.1, g: 5, need: 2 },
    { id: "cake", name: "딸기 케이크", cat: "dessert", price: 2600, prep: 90, pop: 1.25, g: 6, need: 2 },
    { id: "cappuccino", name: "카푸치노", cat: "coffee", price: 2000, prep: 160, pop: 1.15, g: 7, need: 3 },
    { id: "ade", name: "레몬 에이드", cat: "tea", price: 1900, prep: 128, pop: 1.2, g: 8, need: 2 },
    { id: "muffin", name: "초코 머핀", cat: "dessert", price: 2100, prep: 72, pop: 1.22, g: 9, need: 3 },
    { id: "vanilla", name: "바닐라 라떼", cat: "coffee", price: 2400, prep: 172, pop: 1.3, g: 10, need: 4 },
    { id: "matcha", name: "말차 라떼", cat: "tea", price: 2600, prep: 125, pop: 1.32, g: 11, need: 3 },
    { id: "macaron", name: "알록달록 마카롱", cat: "dessert", price: 2200, prep: 68, pop: 1.4, g: 12, need: 4 },
    { id: "caramel", name: "캐러멜 마키아토", cat: "coffee", price: 3000, prep: 182, pop: 1.42, g: 13, need: 5 },
    { id: "yuja", name: "꿀 유자차", cat: "tea", price: 2300, prep: 112, pop: 1.35, g: 14, need: 4 },
    { id: "tiramisu", name: "티라미수", cat: "dessert", price: 3200, prep: 95, pop: 1.46, g: 15, need: 5 },
    { id: "tart", name: "과일 타르트", cat: "dessert", price: 3500, prep: 105, pop: 1.5, g: 16, need: 5 },
    { id: "grapefruit", name: "자몽 허니 블랙티", cat: "tea", price: 3600, prep: 138, pop: 1.56, g: 17, need: 6 },
    { id: "coldbrew", name: "구름 크림 콜드브루", cat: "coffee", price: 3900, prep: 168, pop: 1.62, g: 18, need: 6 },
    { id: "sunset", name: "옥상 노을 라떼", cat: "coffee", price: 4300, prep: 195, pop: 1.7, g: 19, need: 6 },
    { id: "starcake", name: "옥상 별빛 케이크", cat: "dessert", price: 4800, prep: 120, pop: 1.8, g: 20, need: 7 },
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
  const menuSlotsAt = (g) => (g >= 17 ? 6 : g >= 13 ? 5 : g >= 9 ? 4 : 3); // 진열 칸: 3 → 등급 9에 4 → 13에 5 → 17에 6
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
  // 재배치 — a 자리의 물건을 b 자리로(비었으면 옮기고, 있으면 서로 바꾼다). 공짜 · 바로. "move" | "swap" | false
  function swapDeco(s, a, b) {
    const open = (i) => !!SPOTS[i] && s.grade >= SPOTS[i].g;
    if (a === b || !open(a) || !open(b) || !s.deco.place[a]) return false;
    const p = s.deco.place, was = p[b];
    p[b] = p[a]; p[a] = was || null;
    return was ? "swap" : "move";
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
    collect, startUpgrade, toggleMenu, bestMenu, hire, buyDeco, placeDeco, swapDeco, claimOrder, menuSlotsFree,
  };

  // ══ 옥상 디오라마(canvas) ═════════════════════════════════════
  // 비스듬히 내려다본(2:1 아이소메트릭) 10×10 칸 옥상 바닥판이 하늘에 떠 있는 미니어처.
  // 논리 좌표 420×330 안에 그리고 장면 크기에 맞춰 키운다. 빛은 늘 왼쪽 위. 하늘 · 조명은 실제 시각(한국 시간).
  //   격자 (gx, gy, z): gx 는 오른쪽 아래로, gy 는 왼쪽 아래로 늘어난다. 맨 위 꼭짓점이 (0, 0).
  //   왼쪽 뒤 벽(gx = 0)에 가게 · 오른쪽 뒤(gy = 0)는 난간 너머 도시 · 오른쪽 구석에 계단실.
  const W = 420, H = 330, OX = 210, OY = 92, HW = 18, HH = 9, SLAB = 20;
  const P = (gx, gy, z = 0) => [OX + (gx - gy) * HW, OY + (gx + gy) * HH - z];
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mixHex = (a, b, t) => { const A = hex(a), B = hex(b); return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join(""); };
  const mix = mixHex;
  const shade = (h, t) => (t >= 0 ? mixHex(h, "#ffffff", t) : mixHex(h, "#000000", -t));
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const SKY = [[0, "#0d1538", "#2a3266"], [5, "#121b44", "#36407a"], [6.3, "#5865a8", "#ffb894"], [7.6, "#86c6ff", "#ffe9d6"], [16.2, "#7cbcff", "#ffe6cf"], [17.6, "#7a6fc4", "#ffae7a"], [18.8, "#3a3780", "#e9849a"], [20, "#161f4c", "#3a3f78"], [24, "#0d1538", "#2a3266"]];
  function skyAt(h) {
    for (let i = 0; i < SKY.length - 1; i++) {
      const [h0, t0, b0] = SKY[i], [h1, t1, b1] = SKY[i + 1];
      if (h >= h0 && h <= h1) { const t = (h - h0) / (h1 - h0); return [mix(t0, t1, t), mix(b0, b1, t)]; }
    }
    return [SKY[0][1], SKY[0][2]];
  }
  const nightOf = (h) => clamp01(h < 5.5 || h > 19.5 ? 1 : h < 7.5 ? (7.5 - h) / 2 : h > 17 ? (h - 17) / 2.5 : 0);
  const duskOf = (h) => (h > 15.8 && h < 19.6 ? Math.sin(((h - 15.8) / 3.8) * Math.PI) : h > 5.6 && h < 8 ? Math.sin(((h - 5.6) / 2.4) * Math.PI) * 0.6 : 0);

  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); c.fill(); }
  function circ(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
  function ell(c, x, y, rx, ry) { c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2); c.fill(); }
  function poly(c, pts, fill) { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); c.fillStyle = fill; c.fill(); }
  function seg(c, a, b, col, w) { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); }
  // 상자 — 윗면 · 앞 왼쪽 면(gy1, 빛 받아 밝음) · 앞 오른쪽 면(gx1, 그늘)
  function box(c, gx0, gy0, gx1, gy1, z0, h, col, o = {}) {
    const z1 = z0 + h;
    poly(c, [P(gx0, gy1, z0), P(gx1, gy1, z0), P(gx1, gy1, z1), P(gx0, gy1, z1)], o.left || shade(col, -0.1));
    poly(c, [P(gx1, gy0, z0), P(gx1, gy1, z0), P(gx1, gy1, z1), P(gx1, gy0, z1)], o.right || shade(col, -0.26));
    poly(c, [P(gx0, gy0, z1), P(gx1, gy0, z1), P(gx1, gy1, z1), P(gx0, gy1, z1)], o.top || col);
    if (o.edge !== false) { c.strokeStyle = "rgba(255,255,255,.42)"; c.lineWidth = 0.6; c.beginPath(); const a = P(gx0, gy1, z1), b = P(gx1, gy1, z1), d = P(gx1, gy0, z1); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(d[0], d[1]); c.stroke(); }
  }
  const qX = (c, gx, a, b, p, q, f) => poly(c, [P(gx, a, p), P(gx, b, p), P(gx, b, q), P(gx, a, q)], f); // gx 가 일정한 면(오른쪽 아래를 봄)
  const qY = (c, gy, a, b, p, q, f) => poly(c, [P(a, gy, p), P(b, gy, p), P(b, gy, q), P(a, gy, q)], f); // gy 가 일정한 면(왼쪽 아래를 봄)
  const qZ = (c, z, x0, y0, x1, y1, f) => poly(c, [P(x0, y0, z), P(x1, y0, z), P(x1, y1, z), P(x0, y1, z)], f); // 바닥과 나란한 면
  function shadow(c, gx, gy, rx, a = 0.17) { const [x, y] = P(gx, gy); c.fillStyle = `rgba(90,45,20,${a})`; ell(c, x + 2.2, y + 1.1, rx, rx * 0.5); }
  const NOFX = { glow() {}, dot() {}, bubble() {} };

  // 김(스팀)
  function steam(c, x, y, tm, a = 0.75) {
    c.strokeStyle = `rgba(255,255,255,${a})`; c.lineWidth = 1; c.lineCap = "round";
    for (let i = 0; i < 2; i++) {
      const t = (tm * 0.8 + i * 0.5) % 1, yy = y - t * 9;
      c.globalAlpha = 1 - t; c.beginPath(); c.moveTo(x + i * 2.2 - 1, yy); c.quadraticCurveTo(x + i * 2.2 - 3, yy - 2.5, x + i * 2.2 - 1, yy - 5); c.stroke();
    }
    c.globalAlpha = 1; c.lineCap = "butt";
  }

  // 사람 — y 는 발끝. o: skin hair shirt pants style(short|bun|long|cap) sit dir walk cup apron
  function person(c, x, y, o) {
    const dir = o.dir || 1, sk = o.skin || "#f3c9a7";
    c.save(); c.translate(x, y);
    if (o.alpha != null) c.globalAlpha = o.alpha;
    if (o.sc) c.scale(o.sc, o.sc);
    c.fillStyle = "rgba(90,45,20,.18)"; ell(c, 1.5, 0.5, 7, 2.6);
    if (o.sit) {
      c.save(); c.scale(dir, 1); c.fillStyle = o.pants || "#475569"; rr(c, -3, -9, 10, 4, 2); rr(c, 5, -9, 3, 9, 1.5); c.fillStyle = "#3b2f2a"; rr(c, 5, -1.5, 5, 2, 1); c.restore();
      c.translate(0, 4);
    } else {
      const sw = o.walk ? Math.sin(o.walk) * 2.2 : 0;
      c.fillStyle = o.pants || "#475569"; rr(c, -4 + sw, -9, 3, 9, 1.4); rr(c, 1 - sw, -9, 3, 9, 1.4);
      c.fillStyle = "#3b2f2a"; rr(c, -4.5 + sw, -1.5, 4, 2, 1); rr(c, 0.5 - sw, -1.5, 4, 2, 1);
      if (o.walk) c.translate(0, -Math.abs(Math.sin(o.walk)) * 1.1);
    }
    c.fillStyle = o.shirt || "#60a5fa"; rr(c, -6, -21, 12, 13, 4.5);
    if (o.apron) { c.fillStyle = o.apron; rr(c, -4, -17, 8, 10, 2); }
    c.fillStyle = shade(o.shirt || "#60a5fa", -0.08); rr(c, -8, -20, 3, 8, 1.5); rr(c, 5, -20, 3, 8, 1.5);
    c.fillStyle = sk; circ(c, -6.5, -11.5, 1.6); circ(c, 6.5, -11.5, 1.6);
    if (o.cup) { c.fillStyle = "#fffaf3"; rr(c, 6, -16, 4, 5, 1); c.fillStyle = "#c27a45"; c.fillRect(6, -15, 4, 1.4); }
    c.fillStyle = sk; circ(c, 0, -27.5, 6.8);
    c.fillStyle = o.hair || "#3b2a20";
    const st = o.style || "short";
    if (st === "long") { rr(c, -7.2, -30, 3, 11, 1.5); rr(c, 4.2, -30, 3, 11, 1.5); }
    c.beginPath(); c.arc(0, -28.5, 7.1, Math.PI * 1.02, Math.PI * 1.98); c.lineTo(6, -27.5); c.quadraticCurveTo(1 * dir, -31, -6, -27.5); c.closePath(); c.fill();
    if (st === "bun") circ(c, 0, -36, 3.4);
    if (st === "cap") { c.fillStyle = o.capColor || "#ef4444"; c.beginPath(); c.arc(0, -29.5, 7.1, Math.PI, 0); c.fill(); rr(c, dir > 0 ? 2 : -10, -30.5, 8, 2.2, 1); }
    c.fillStyle = "#2a1d16"; const ex = dir * 0.9; ell(c, -2.4 + ex, -26.6, 1.05, 1.3); ell(c, 2.4 + ex, -26.6, 1.05, 1.3);
    c.fillStyle = "rgba(255,120,140,.42)"; circ(c, -3.9 + ex, -24.4, 1.3); circ(c, 3.9 + ex, -24.4, 1.3);
    c.restore();
  }

  // 화분 — x, y 는 바닥(화면 좌표), k 종류, sc 크기, sw 흔들림
  function pot(c, x, y, k, sc = 1, sw = 0) {
    c.save(); c.translate(x, y); c.scale(sc, sc);
    c.fillStyle = "rgba(90,45,20,.16)"; ell(c, 2, 0.5, 8, 3);
    const potC = ["#d9714a", "#f2ece3", "#7fb5a0", "#e3a35a"][k % 4];
    c.fillStyle = potC; c.beginPath(); c.moveTo(-6.5, -10); c.lineTo(6.5, -10); c.lineTo(4.8, 0); c.lineTo(-4.8, 0); c.closePath(); c.fill();
    c.fillStyle = shade(potC, -0.18); c.beginPath(); c.moveTo(1.5, -10); c.lineTo(6.5, -10); c.lineTo(4.8, 0); c.lineTo(1, 0); c.closePath(); c.fill();
    c.fillStyle = shade(potC, 0.12); rr(c, -7.2, -11.8, 14.4, 3, 1.4);
    c.translate(0, -11); c.rotate(sw);
    const gr = ["#3fb56b", "#2f9e5b", "#5fcf7f", "#278a4f"];
    c.fillStyle = gr[k % 4];
    if (k % 3 === 0) { ell(c, 0, -8, 7.5, 8.5); c.fillStyle = shade(gr[k % 4], 0.18); ell(c, -2.5, -10, 3.5, 4); }
    else if (k % 3 === 1) { for (let i = -2; i <= 2; i++) { c.save(); c.rotate(i * 0.36); c.fillStyle = i % 2 ? gr[(k + 1) % 4] : gr[k % 4]; ell(c, 0, -8, 2.4, 8.5); c.restore(); } }
    else { circ(c, -3.4, -5, 4.8); circ(c, 3.4, -6, 4.8); circ(c, 0, -10, 4.8); c.fillStyle = ["#ff8fb1", "#ffd23f", "#ff7a6b"][k % 3]; circ(c, -3.4, -7, 1.7); circ(c, 3.4, -9, 1.7); circ(c, 0, -13, 1.7); }
    c.restore();
  }

  // 전구 줄 — a, b 화면 좌표(바닥 위 높은 곳)
  function bulbs(c, a, b, sag, n, night, tm, fx) {
    const mx = (a[0] + b[0]) / 2, my = Math.max(a[1], b[1]) + sag;
    c.strokeStyle = "rgba(70,50,40,.55)"; c.lineWidth = 0.6; c.beginPath(); c.moveTo(a[0], a[1]); c.quadraticCurveTo(mx, my, b[0], b[1]); c.stroke();
    const cols = ["#ffe08a", "#ffb4a2", "#b8f2e6", "#ffe08a", "#ffd1f0"];
    for (let i = 1; i < n; i++) {
      const t = i / n, bx = (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * mx + t * t * b[0], by = (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * my + t * t * b[1] + 1.6;
      const tw = 0.8 + 0.2 * Math.sin(tm * 2.2 + i * 1.3);
      c.fillStyle = "#5b4a40"; c.fillRect(bx - 0.5, by - 2.2, 1, 1);
      c.fillStyle = night > 0.2 ? cols[i % 5] : "#f4efe6"; circ(c, bx, by, 1.45);
      if (night > 0.15) { fx.glow(bx, by, 9, "255,214,140", 0.42 * night * tw); fx.dot(bx, by, cols[i % 5], 1.45); }
    }
  }

  // 꾸미기 물건 — x, y 는 바닥 기준점(화면 좌표)
  function deco(c, id, x, y, night, tm, fx = NOFX) {
    c.save();
    c.fillStyle = "rgba(90,45,20,.15)"; ell(c, x + 2, y, 15, 3.6);
    switch (id) {
      case "parasol": {
        c.fillStyle = "#c9b8a6"; c.fillRect(x - 0.9, y - 36, 1.8, 36); c.fillStyle = "#8b7765"; ell(c, x, y - 1, 6, 2.2);
        const cols = ["#ff7a45", "#fff6ea"];
        for (let i = 0; i < 8; i++) { c.fillStyle = cols[i % 2]; c.beginPath(); c.moveTo(x, y - 46); c.lineTo(x - 24 + i * 6, y - 33 + Math.abs(i - 4) * 0.5); c.lineTo(x - 24 + (i + 1) * 6, y - 33 + Math.abs(i - 3) * 0.5); c.fill(); }
        c.fillStyle = "#d9541f"; circ(c, x, y - 46, 1.7); break;
      }
      case "pots": pot(c, x - 9, y, 2, 0.95, Math.sin(tm * 1.4) * 0.05); pot(c, x + 8, y, 5, 0.95, Math.sin(tm * 1.4 + 1) * 0.05); pot(c, x, y + 3, 8, 0.75, Math.sin(tm * 1.4 + 2) * 0.05); break;
      case "lights": c.fillStyle = "#6b5a50"; c.fillRect(x - 15, y - 34, 1.8, 34); c.fillRect(x + 13, y - 34, 1.8, 34); bulbs(c, [x - 14, y - 33], [x + 14, y - 33], 6, 6, Math.max(night, 0.25), tm, fx); break;
      case "bench":
        c.fillStyle = "#8b5a33"; c.fillRect(x - 14, y - 10, 2, 10); c.fillRect(x + 12, y - 10, 2, 10);
        c.fillStyle = "#c98a55"; rr(c, x - 16, y - 12, 32, 3.5, 1.5); rr(c, x - 16, y - 20, 32, 3, 1.5); rr(c, x - 16, y - 25, 32, 3, 1.5);
        c.fillStyle = "#ffb4a2"; rr(c, x - 10, y - 16, 8, 4, 2); break;
      case "board":
        c.fillStyle = "#8b5a33"; c.save(); c.translate(x, y); c.beginPath(); c.moveTo(-9, 0); c.lineTo(-5, -30); c.lineTo(5, -30); c.lineTo(9, 0); c.lineTo(7, 0); c.lineTo(3.5, -27); c.lineTo(-3.5, -27); c.lineTo(-7, 0); c.fill();
        c.fillStyle = "#24382f"; rr(c, -9, -28, 18, 20, 1.5); c.strokeStyle = "rgba(255,255,255,.8)"; c.lineWidth = 0.8;
        c.beginPath(); c.moveTo(-6, -24); c.lineTo(3, -24); c.moveTo(-6, -20); c.lineTo(5, -20); c.moveTo(-6, -16); c.lineTo(1, -16); c.stroke(); c.fillStyle = "#ffb4c8"; circ(c, 5, -13, 1.6); c.restore(); break;
      case "hammock":
        c.fillStyle = "#8b5a33"; c.fillRect(x - 20, y - 30, 2.4, 30); c.fillRect(x + 18, y - 30, 2.4, 30);
        c.strokeStyle = "#ff9f5a"; c.lineWidth = 3; c.beginPath(); c.moveTo(x - 18, y - 26); c.quadraticCurveTo(x, y - 4 + Math.sin(tm * 1.5) * 1.5, x + 18, y - 26); c.stroke();
        c.strokeStyle = "#ffe0a8"; c.lineWidth = 1; c.beginPath(); c.moveTo(x - 16, y - 24); c.quadraticCurveTo(x, y - 8 + Math.sin(tm * 1.5) * 1.5, x + 16, y - 24); c.stroke(); break;
      case "scope":
        c.strokeStyle = "#6b5a50"; c.lineWidth = 1.4; c.beginPath(); c.moveTo(x, y - 16); c.lineTo(x - 7, y); c.moveTo(x, y - 16); c.lineTo(x + 7, y); c.moveTo(x, y - 16); c.lineTo(x, y); c.stroke();
        c.save(); c.translate(x, y - 18); c.rotate(-0.5); c.fillStyle = "#3d4a8a"; rr(c, -9, -2.6, 18, 5.2, 2); c.fillStyle = "#ffc83d"; c.fillRect(-9, -2.6, 2, 5.2); c.fillStyle = "#a9d6ff"; c.fillRect(7.5, -2, 1.5, 4); c.restore(); break;
      case "fountain": {
        c.fillStyle = "#b9b2a8"; ell(c, x, y - 4, 17, 5.5); c.fillStyle = "#ddd6cc"; c.fillRect(x - 17, y - 8, 34, 4); ell(c, x, y - 8, 17, 5.5);
        c.fillStyle = "#6fc3f0"; ell(c, x, y - 8.5, 14, 3.8); c.fillStyle = "#b9b2a8"; c.fillRect(x - 2, y - 20, 4, 12); ell(c, x, y - 20, 6, 2);
        c.strokeStyle = "rgba(170,220,255,.95)"; c.lineWidth = 1.2;
        for (let i = -1; i <= 1; i += 2) { c.beginPath(); c.moveTo(x, y - 22); c.quadraticCurveTo(x + i * 8, y - 32 - Math.sin(tm * 4) * 1.5, x + i * 12, y - 10); c.stroke(); }
        break;
      }
      case "cathouse": {
        c.fillStyle = "#ff9a5c"; c.fillRect(x - 14, y - 16, 18, 16); c.fillStyle = "#d9541f"; c.beginPath(); c.moveTo(x - 17, y - 15); c.lineTo(x - 5, y - 26); c.lineTo(x + 7, y - 15); c.fill();
        c.fillStyle = "#4a2312"; c.beginPath(); c.arc(x - 5, y - 4, 4.5, Math.PI, 0); c.lineTo(x - 0.5, y); c.lineTo(x - 9.5, y); c.fill();
        const tail = Math.sin(tm * 2) * 3;
        c.strokeStyle = "#6b625c"; c.lineWidth = 2; c.beginPath(); c.moveTo(x + 15, y - 3); c.quadraticCurveTo(x + 21, y - 8, x + 18 + tail, y - 14); c.stroke();
        c.fillStyle = "#6b625c"; ell(c, x + 12, y - 5, 5, 5); circ(c, x + 12, y - 12, 4);
        c.beginPath(); c.moveTo(x + 8.6, y - 14); c.lineTo(x + 9.4, y - 18); c.lineTo(x + 11.4, y - 15); c.fill(); c.beginPath(); c.moveTo(x + 15.4, y - 14); c.lineTo(x + 14.6, y - 18); c.lineTo(x + 12.6, y - 15); c.fill();
        c.fillStyle = "#ffe066"; circ(c, x + 10.5, y - 12.5, 0.9); circ(c, x + 13.5, y - 12.5, 0.9); break;
      }
    }
    c.restore();
  }

  // ── 시설 그림(레벨이 오르면 커지고 화려해진다) — 장면과 카드 그림이 같이 쓴다 ──
  // o: { tm, brew, night, fx }
  const CTR = { x0: 1.25, x1: 2.25, y0: 0.85, y1: 6.5, h: 18 }; // 카운터
  function drawCounter(c, L, o) {
    const top = L >= 6 ? "#f7f1ea" : L >= 4 ? "#e8bf8f" : "#d39a63";
    const front = L >= 6 ? "#3b4a63" : L >= 4 ? "#bf7f4d" : "#ad7045";
    box(c, CTR.x0, CTR.y0, CTR.x1, CTR.y1, 0, CTR.h, top, { left: shade(front, 0.08), right: front });
    c.strokeStyle = L >= 6 ? "rgba(227,176,75,.45)" : "rgba(60,30,10,.16)"; c.lineWidth = 0.6; c.beginPath();
    for (let g = CTR.y0 + 0.45; g < CTR.y1 - 0.05; g += 0.46) { const a = P(CTR.x1 + 0.002, g, 2), b = P(CTR.x1 + 0.002, g, 16); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); }
    c.stroke();
    if (L >= 4) qX(c, CTR.x1 + 0.003, CTR.y0, CTR.y1, 0, 2.6, shade(front, -0.3));
    if (L >= 6) { qX(c, CTR.x1 + 0.004, CTR.y0, CTR.y1, 15.4, 17.2, "#e3b04b"); c.strokeStyle = "rgba(160,150,140,.25)"; c.lineWidth = 0.5; c.beginPath(); const a = P(1.5, 1.6, 18), b = P(2.1, 3.2, 18); c.moveTo(a[0], a[1]); c.quadraticCurveTo(a[0] + 10, a[1] + 8, b[0], b[1]); c.stroke(); }
    // 계산대(POS)
    const pos = (gy, big) => {
      if (!big) { box(c, 1.55, gy - 0.22, 1.95, gy + 0.22, 18, 6, "#4a4458"); qX(c, 1.951, gy - 0.15, gy + 0.15, 20.5, 23, "#a6f0c9"); return; }
      box(c, 1.6, gy - 0.12, 1.85, gy + 0.12, 18, 2, "#5b5566");
      poly(c, [P(1.7, gy - 0.28, 20), P(1.7, gy + 0.28, 20), P(1.86, gy + 0.28, 31), P(1.86, gy - 0.28, 31)], "#2a2633");
      poly(c, [P(1.72, gy - 0.22, 21.4), P(1.72, gy + 0.22, 21.4), P(1.84, gy + 0.22, 29.6), P(1.84, gy - 0.22, 29.6)], "#8fdcff");
    };
    pos(5.9, L >= 4);
    if (L >= 6) { pos(5.15, true); const [bx, by] = P(1.95, 6.25, 18); c.fillStyle = "#e3b04b"; c.beginPath(); c.arc(bx, by - 1, 3, Math.PI, 0); c.fill(); c.fillStyle = "#c48e2a"; c.fillRect(bx - 3.6, by - 1, 7.2, 1.2); }
    // 팁 통 · 쿠키 병
    if (L >= 3) { const [jx, jy] = P(1.85, 6.35, 18); c.fillStyle = "rgba(220,240,255,.7)"; rr(c, jx - 2.2, jy - 6, 4.4, 6, 1.2); c.fillStyle = "#ffc83d"; rr(c, jx - 1.8, jy - 2.6, 3.6, 2.4, 1); }
  }

  function drawCoffee(c, L, o) {
    const t = L >= 7 ? 3 : L >= 5 ? 2 : L >= 3 ? 1 : 0, z = 18, cx = 1.75, cy = 1.8;
    const wy = [0.62, 0.86, 1.04, 1.26][t], dx = [0.26, 0.3, 0.32, 0.35][t], h = [13, 16, 18, 22][t];
    const col = ["#4f5363", "#c6ccd6", "#ef6a4e", "#eef1f5"][t];
    const gy0 = cy - wy / 2, gy1 = cy + wy / 2, gx0 = cx - dx, gx1 = cx + dx;
    box(c, gx0, gy0, gx1, gy1, z, h, col);
    if (t === 2) qY(c, gy1 + 0.001, gx0, gx1, z + h * 0.35, z + h * 0.55, "#fff1e2");
    qX(c, gx1 + 0.002, gy0 + 0.06, gy1 - 0.06, z + 0.6, z + 2.6, "#2c2b33");
    const n = [1, 2, 2, 3][t];
    for (let i = 0; i < n; i++) {
      const a = gy0 + (wy * (i + 0.5)) / n;
      qX(c, gx1 + 0.003, a - 0.09, a + 0.09, z + h * 0.5, z + h * 0.64, "#2c2b33");
      const [ux, uy] = P(gx1 + 0.08, a, z + 2.6); c.fillStyle = "#fffaf3"; rr(c, ux - 2, uy - 3.8, 4, 3.8, 1);
      if (o.brew) steam(c, ux, uy - 5, o.tm + i * 0.33, 0.8);
    }
    if (t >= 1) for (let i = 0; i <= t; i++) { const [ux, uy] = P(cx - 0.06, gy0 + 0.16 + i * 0.19, z + h); c.fillStyle = "#fffaf3"; rr(c, ux - 2.2, uy - 4, 4.4, 4, 1.2); c.fillStyle = "#eadfce"; ell(c, ux, uy - 4, 2.2, 0.8); }
    if (t >= 2) { const [gx2, gy2] = P(gx1 + 0.003, cy, z + h * 0.84); c.fillStyle = t === 3 ? "#e3b04b" : "#fff3e6"; circ(c, gx2, gy2, 2.3); c.fillStyle = "#3a2a22"; c.fillRect(gx2 - 0.3, gy2 - 1.7, 0.6, 1.7); }
    if (t === 3) { qX(c, gx1 + 0.004, gy0, gy1, z + h - 2.2, z + h - 0.8, "#e3b04b"); o.fx.glow(...P(gx1, cy, z + h * 0.84), 7, "255,210,120", 0.5 * (o.night || 0)); }
    const [lx, ly] = P(gx1 + 0.003, gy0 + 0.1, z + h * 0.84); c.fillStyle = t >= 3 ? "#ffd23f" : "#ff5a5a"; circ(c, lx, ly, 1.1);
    if (t >= 1) { // 그라인더
      const g0 = gy1 + 0.06;
      box(c, cx - 0.15, g0, cx + 0.15, g0 + 0.3, z, 9, t === 3 ? "#d8dde4" : "#3f3c48");
      const [hx, hy] = P(cx, g0 + 0.15, z + 9);
      c.fillStyle = "rgba(225,242,255,.7)"; rr(c, hx - 4, hy - 8, 8, 6.5, 2); c.fillStyle = "#6b3f22"; ell(c, hx, hy - 3.8, 3.2, 1.5); c.fillStyle = "#8a5430"; ell(c, hx, hy - 4.6, 2.4, 1);
    }
  }

  function drawDessert(c, L, o) {
    const x0 = 1.42, x1 = 2.08, g0 = 2.85, len = 0.92 + 0.12 * Math.min(8, L), g1 = g0 + len, z = 18;
    const tall = L >= 5 ? 15 : 11, frame = L >= 7 ? "#e3b04b" : L >= 4 ? "#a9805f" : "#9a7457";
    box(c, x0, g0, x1, g1, z, 3, frame);
    const zi = z + 3, rows = L >= 3 ? 2 : 1, cols = Math.max(2, Math.round(len / 0.3));
    const cake = ["#ffb3c1", "#ffe08a", "#f7a8d0", "#c9b6ff", "#ffc48a", "#9fe3c1"];
    const row = (r) => {
      for (let i = 0; i < cols; i++) {
        const [x, y] = P(x0 + 0.33, g0 + (len * (i + 0.5)) / cols, zi + (r ? tall * 0.52 : 0.4));
        c.fillStyle = "#fff6ea"; rr(c, x - 3, y - 3, 6, 3.2, 1.2); c.fillStyle = cake[(i + r * 3) % cake.length]; rr(c, x - 3, y - 4.8, 6, 2.4, 1.1); c.fillStyle = "#ef3b4f"; circ(c, x, y - 5.2, 0.9);
      }
    };
    if (L >= 5) o.fx.glow(...P((x0 + x1) / 2, (g0 + g1) / 2, zi + 7), 20, "255,226,170", 0.55 * (o.night || 0));
    row(0);
    if (rows === 2) { qZ(c, zi + tall * 0.5, x0 + 0.04, g0 + 0.04, x1 - 0.04, g1 - 0.04, "rgba(255,255,255,.45)"); row(1); }
    qY(c, g1, x0, x1, zi, zi + tall, "rgba(205,236,255,.28)");
    qX(c, x1, g0, g1, zi, zi + tall, "rgba(190,226,250,.32)");
    qZ(c, zi + tall, x0, g0, x1, g1, "rgba(230,246,255,.5)");
    c.strokeStyle = L >= 7 ? "#e3b04b" : "rgba(255,255,255,.85)"; c.lineWidth = 0.7; c.beginPath();
    [[P(x0, g1, zi), P(x0, g1, zi + tall)], [P(x1, g1, zi), P(x1, g1, zi + tall)], [P(x1, g0, zi), P(x1, g0, zi + tall)], [P(x0, g1, zi + tall), P(x1, g1, zi + tall)], [P(x1, g1, zi + tall), P(x1, g0, zi + tall)]].forEach(([a, b]) => { c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); });
    c.stroke();
    seg(c, P(x1 - 0.02, g0 + 0.2, zi + tall - 2), P(x1 - 0.02, g0 + 0.45, zi + 3), "rgba(255,255,255,.7)", 0.8);
    if (L >= 7) { const [dx, dy] = P((x0 + x1) / 2, g0 + len * 0.5, zi + tall); c.fillStyle = "rgba(225,245,255,.55)"; c.beginPath(); c.arc(dx, dy - 1, 5, Math.PI, 0); c.fill(); c.fillStyle = "#ffb3c1"; rr(c, dx - 3, dy - 3.6, 6, 2.6, 1); c.fillStyle = "#e3b04b"; ell(c, dx, dy - 0.6, 6, 1.4); }
  }

  const TEA = { x0: 1.05, x1: 2.1, y0: 6.9, y1: 8.25, h: 16 };
  function drawTea(c, L, o) {
    const top = "#f6f0e4", front = L >= 6 ? "#4fae8c" : "#7cc3a0";
    box(c, TEA.x0, TEA.y0, TEA.x1, TEA.y1, 0, TEA.h, top, { left: shade(front, 0.1), right: front });
    if (L >= 4) { c.fillStyle = "rgba(255,255,255,.25)"; for (let g = TEA.y0 + 0.2; g < TEA.y1 - 0.1; g += 0.34) qX(c, TEA.x1 + 0.002, g, g + 0.16, 4, 12, "rgba(255,255,255,.18)"); }
    const z = TEA.h;
    // 주전자
    const [kx, ky] = P(1.62, 7.22, z);
    c.fillStyle = "#e08a4f"; ell(c, kx, ky - 5, 5, 4.6); c.fillStyle = shade("#e08a4f", 0.2); ell(c, kx - 1.5, ky - 6.5, 2, 1.6);
    c.strokeStyle = "#b96b38"; c.lineWidth = 1.4; c.beginPath(); c.moveTo(kx + 4, ky - 5); c.lineTo(kx + 7.5, ky - 8.5); c.stroke(); c.beginPath(); c.arc(kx, ky - 9.4, 3, Math.PI, 0); c.stroke();
    if (o.brew) steam(c, kx + 7.5, ky - 10, o.tm + 0.4, 0.7);
    // 차 병
    const jc = ["#9fd98a", "#ffd166", "#ffb38a", "#f7a8d0", "#b5b0ff", "#7ee0cf"];
    const nj = Math.min(5, L + 1);
    for (let i = 0; i < nj; i++) { const [jx, jy] = P(1.36, 7.55 + i * 0.15, z); c.fillStyle = "rgba(230,245,255,.85)"; rr(c, jx - 1.9, jy - 6.5, 3.8, 6.5, 1.2); c.fillStyle = jc[i]; rr(c, jx - 1.5, jy - 4.2, 3, 4, 1); c.fillStyle = "#8b5a33"; c.fillRect(jx - 1.9, jy - 7.4, 3.8, 1.3); }
    if (L >= 3) { const [tx, ty] = P(1.85, 7.95, z); c.fillStyle = "rgba(225,245,255,.7)"; ell(c, tx, ty - 4, 4, 3.6); c.fillStyle = "#e2a03a"; ell(c, tx, ty - 3, 3.2, 2.2); c.fillStyle = "rgba(255,255,255,.7)"; ell(c, tx - 1.4, ty - 5.4, 1, 0.8); }
    if (L >= 5) { const [bx, by] = P(1.9, 7.15, z); c.fillStyle = "#b5824f"; ell(c, bx, by - 1, 4.4, 1.8); c.fillStyle = "#ffe14d"; circ(c, bx - 1.6, by - 2.6, 1.8); circ(c, bx + 1.4, by - 2.4, 1.8); circ(c, bx, by - 4, 1.8); }
    if (L >= 7) o.fx.glow(...P(0.02, 7.55, 44), 16, "120,240,190", 0.6 * (o.night || 0));
  }

  // 탁자 · 의자 (좌석 레벨에 따라 모양이 바뀐다)
  function tableTop(c, gx, gy, L, cups) {
    shadow(c, gx, gy, 12, 0.14);
    const [x, y] = P(gx, gy, 0);
    const topC = L >= 5 ? "#f8f4ee" : L >= 3 ? "#d7a06a" : "#f4eee6";
    c.fillStyle = "#7d6b5e"; c.fillRect(x - 1, y - 13, 2, 13); ell(c, x, y, 5, 2);
    c.fillStyle = shade(topC, -0.22); ell(c, x, y - 12.2, 12.5, 6.4);
    c.fillStyle = topC; ell(c, x, y - 13.6, 12.5, 6.3);
    if (L >= 7) { c.fillStyle = "#ff9a6b"; ell(c, x, y - 13.7, 9.5, 4.6); c.fillStyle = "#fff4ea"; ell(c, x, y - 13.8, 7.5, 3.5); }
    if (L >= 5) { c.strokeStyle = "#e3b04b"; c.lineWidth = 0.7; c.beginPath(); c.ellipse(x, y - 13.6, 12.5, 6.3, 0, 0, Math.PI * 2); c.stroke(); }
    if (L >= 3) { c.fillStyle = "rgba(220,240,255,.8)"; rr(c, x - 1.3, y - 19, 2.6, 4.6, 1); c.fillStyle = ["#ff8fb1", "#ffd23f", "#ff7a6b"][(gx * 3 + gy) % 3 | 0]; circ(c, x, y - 20, 1.7); }
    cups.forEach((side) => { const cx = x + side * 5, cy = y - 13.6 - side * 2.2; c.fillStyle = "#fffaf3"; rr(c, cx - 1.8, cy - 3, 3.6, 3, 1); c.fillStyle = "#b8743f"; ell(c, cx, cy - 3, 1.6, 0.6); });
  }
  function chairSeat(c, gx, gy, L) {
    const arm = L >= 5, col = L >= 7 ? "#e0527a" : arm ? "#ff9a6b" : L >= 3 ? "#b9824f" : "#e8dccd";
    shadow(c, gx, gy, 6, 0.12);
    const s = arm ? 0.32 : 0.26;
    box(c, gx - s, gy - s, gx + s, gy + s, 0, arm ? 7 : 6, col, { edge: false });
    if (arm) qZ(c, 7.01, gx - s + 0.05, gy - s + 0.05, gx + s - 0.05, gy + s - 0.05, shade(col, 0.15));
  }
  function chairBack(c, gx, gy, side, L) { // side -1: 뒤쪽(gy 작은 쪽) 등받이, 1: 앞쪽
    const arm = L >= 5, col = L >= 7 ? "#e0527a" : arm ? "#ff9a6b" : L >= 3 ? "#b9824f" : "#e8dccd";
    const s = arm ? 0.32 : 0.26, g = gy + side * s, top = side < 0 ? (arm ? 19 : 16) : (arm ? 13 : 12);
    qY(c, g, gx - s, gx + s, 6, top, side < 0 ? shade(col, -0.05) : shade(col, -0.12));
    qZ(c, top, gx - s, g - 0.06, gx + s, g + 0.06, shade(col, 0.1));
  }
  function parasolBig(c, gx, gy, col, tm) {
    const [x, y] = P(gx, gy, 0);
    c.fillStyle = "#d8cfc4"; c.fillRect(x - 0.8, y - 50, 1.6, 36);
    const cols = [col, "#fff6ea"], sw = Math.sin(tm * 0.8) * 0.4;
    for (let i = 0; i < 10; i++) {
      const a0 = (i / 10) * Math.PI * 2, a1 = ((i + 1) / 10) * Math.PI * 2;
      c.fillStyle = cols[i % 2]; c.beginPath(); c.moveTo(x, y - 58); c.lineTo(x + Math.cos(a0) * 21, y - 44 + Math.sin(a0) * 9 + sw); c.lineTo(x + Math.cos(a1) * 21, y - 44 + Math.sin(a1) * 9 + sw); c.closePath(); c.fill();
    }
    c.fillStyle = "rgba(0,0,0,.06)"; c.beginPath(); c.moveTo(x, y - 58); c.lineTo(x + 21, y - 44); c.lineTo(x, y - 35); c.closePath(); c.fill();
    c.fillStyle = shade(col, -0.2); circ(c, x, y - 58, 1.6);
  }
  function lampPost(c, gx, gy, night, fx) {
    shadow(c, gx, gy, 5, 0.15);
    const [x, y] = P(gx, gy, 0);
    c.fillStyle = "#4a3f3a"; c.fillRect(x - 1, y - 44, 2, 44); ell(c, x, y, 4.5, 1.8);
    c.fillStyle = "#4a3f3a"; rr(c, x - 3.4, y - 50, 6.8, 2.2, 1);
    c.fillStyle = night > 0.2 ? "#fff1b8" : "#f4efe6"; rr(c, x - 2.6, y - 48, 5.2, 5, 1.5);
    if (night > 0.15) { fx.glow(x, y - 45, 26, "255,214,140", 0.62 * night); fx.dot(x, y - 45.5, "#fff6d0", 2.2); }
  }

  const TBL = [[4.7, 3.6], [7.5, 3.6], [4.7, 5.9], [7.5, 5.9], [4.7, 8.2], [7.5, 8.2]];
  const PLANT_G = [[2.8, 0.45], [5.0, 0.45], [7.2, 0.45], [9.55, 9.55], [9.55, 7.1], [0.5, 9.55], [9.55, 3.0], [2.3, 9.55]];
  // 꾸미기 자리(격자) — SPOTS 와 같은 순서 · 같은 이름
  const SPOT_G = [[1.6, 9.2], [3.9, 0.95], [6.1, 0.95], [3.2, 9.35], [6.1, 9.45], [9.45, 2.95]];
  const AWN = [["#ff7a45", "#fff3e6"], ["#3cc9a5", "#f2fff9"], ["#d98a4e", "#fff4e6"], ["#e0527a", "#fff0f4"]];
  const LOOKS = [
    { hair: "#3b2a20", shirt: "#7cb7ff", pants: "#3d4a63", style: "short" }, { hair: "#7c4a2d", shirt: "#ffb4c8", pants: "#5b5266", style: "long" },
    { hair: "#1c1a24", shirt: "#9fe3c1", pants: "#36507a", style: "short" }, { hair: "#b45f20", shirt: "#ffe08a", pants: "#4a4458", style: "bun" },
    { hair: "#2a2430", shirt: "#c9b6ff", pants: "#5a4a40", style: "cap", capColor: "#ff7a45" }, { hair: "#5e4a40", shirt: "#ffb38a", pants: "#2c3348", style: "long" },
    { hair: "#2a2220", shirt: "#f4efe6", pants: "#4060a8", style: "short" }, { hair: "#9a3f12", shirt: "#a9d6ff", pants: "#4a4450", style: "bun" },
  ];
  const SKINS = ["#f6d2b5", "#f3c9a7", "#e8b48f", "#f9dcc4", "#d9a07a"];
  const ANCH = { coffee: [1.7, 1.75, 64], counter: [2.3, 6.85, 34], dessert: [1.75, 3.6, 52], tea: [1.55, 7.6, 46], seat: [4.7, 3.6, 40], plant: [5.0, 0.45, 42] };

  // 하늘 미리 보기 — 주소에 ?sky=14 처럼 붙이면 그 시각의 하늘 · 조명으로만 그린다(게임 시간 · 저장은 그대로)
  const SKY_PREVIEW = (() => { try { const v = new URLSearchParams(location.search).get("sky"); return v != null && v !== "" && isFinite(+v) ? ((+v % 24) + 24) % 24 : null; } catch (_) { return null; } })();
  function makeScene(canvas, getState, opts = {}) {
    const ctx = canvas.getContext("2d");
    const off = document.createElement("canvas"), oc = off.getContext("2d");
    const reduce = (() => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (_) { return false; } })();
    let cw = 1, ch = 1, dpr = 1, k = 1, ox = 0, oy = 0, raf = 0, last = 0, tm = 0, spawnIn = 1.2, alive = true, uid = 0, acc = 0;
    const people = [], floats = [];
    let hits = [];
    const stars = Array.from({ length: 56 }, (_, i) => [((i * 97) % 640) - 110, ((i * 53) % 190) - 60, (i % 3) * 0.3 + 0.5]);
    const city = (() => {
      const far = [], near = [];
      for (let x = -170, i = 0; x < 600; i++) { const w = 20 + ((i * 37) % 22); far.push({ x, w, h: 52 + ((i * 41) % 70), r: i % 4 === 0 }); x += w + 2 + (i % 3); }
      for (let x = -160, i = 0; x < 600; i++) { const w = 24 + ((i * 29) % 20); near.push({ x, w, h: 34 + ((i * 53) % 52), ant: i % 5 === 1 }); x += w + 6 + ((i * 7) % 9); }
      return { far, near };
    })();

    function resize() {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(2.5, window.devicePixelRatio || 1);
      cw = Math.max(1, r.width); ch = Math.max(1, r.height);
      canvas.width = off.width = Math.round(cw * dpr); canvas.height = off.height = Math.round(ch * dpr);
      const top = opts.hudSpace ? opts.hudSpace() : 0;
      k = Math.min(cw / (W - 40), (ch - top) / (H - 8)); // 좌우 빈 여백 20씩은 잘려도 된다
      ox = (cw - W * k) / 2; oy = top + Math.max(0, ch - top - (H - 8) * k) * 0.5 - 4 * k;
      if (opts.onLayout) opts.onLayout();
    }
    const toCss = (gx, gy, z = 0) => { const [x, y] = P(gx, gy, z); return [ox + x * k, oy + y * k]; };

    // ── 손님 ──
    const DOOR = [9.0, 1.3], AISLE = 2.0;
    const QUEUE = [[3.05, 5.9], [3.05, 4.95], [3.05, 4.0], [3.05, 3.05]];
    function seatsList(s) {
      const n = TABLES[s.fac.seat] || 0, out = [];
      for (let i = 0; i < n; i++) { const [x, y] = TBL[i]; out.push({ gx: x, gy: y - 0.85, dir: -1, t: i, side: -1 }, { gx: x, gy: y + 0.85, dir: 1, t: i, side: 1 }); }
      return out;
    }
    const aisleOf = (gx) => (gx < 6 ? 3.4 : 6.1);
    function leave(p) {
      const a = p.st === "sit" ? aisleOf(p.gx) : 3.4;
      p.st = "leave"; p.seat = null; p.emo = null;
      p.path = [[a, p.gy], [a, AISLE], [DOOR[0], AISLE], DOOR];
    }
    function update(dt, s, info) {
      tm += dt;
      const seats = seatsList(s);
      const busy = new Set(people.filter((p) => p.seat != null).map((p) => p.seat));
      const want = info.full || !info.served ? 0 : Math.min(seats.length, 1 + Math.round(info.served / 12));
      const q = people.filter((p) => p.st === "come" || p.st === "line" || p.st === "order").sort((a, b) => a.id - b.id);
      spawnIn -= dt;
      if (spawnIn <= 0) {
        spawnIn = 1.8 + Math.random() * 3.4;
        const active = people.filter((p) => p.st !== "leave").length;
        const free = seats.map((_, i) => i).filter((i) => !busy.has(i));
        if (active < want && q.length < 3 && free.length) {
          const seat = free[Math.floor(Math.random() * free.length)];
          people.push({ id: ++uid, gx: DOOR[0], gy: DOOR[1], path: [[DOOR[0], AISLE], [3.4, AISLE]], st: "come", seat, lk: LOOKS[Math.floor(Math.random() * LOOKS.length)], skin: SKINS[Math.floor(Math.random() * SKINS.length)], walk: 0, dir: 1, emo: null, cup: false });
        }
      }
      q.forEach((p, i) => {
        if (p.st === "order" || p.path.length) return;
        const t = QUEUE[Math.min(i, QUEUE.length - 1)];
        if (Math.hypot(t[0] - p.gx, t[1] - p.gy) > 0.03) { p.path = [t]; p.st = "line"; }
        else if (i === 0) { p.st = "order"; p.wait = 1.8; p.emo = { k: "coffee", t: 1.8 }; p.dir = -1; }
      });
      for (const p of people) {
        if (p.emo) { p.emo.t -= dt; if (p.emo.t <= 0) p.emo = null; }
        if (p.st === "order") {
          p.wait -= dt;
          if (p.wait <= 0) {
            const st = seats[p.seat];
            if (info.price) { const [fx2, fy2] = P(2.9, 5.6, 40); floats.push({ x: fx2, y: fy2, a: 1, text: "+" + num(info.price) + "원" }); }
            p.cup = true;
            if (!st) leave(p);
            else { p.st = "toSeat"; const a = aisleOf(st.gx); p.path = a < 5 ? [[3.4, p.gy], [3.4, st.gy], [st.gx, st.gy]] : [[3.4, p.gy], [3.4, AISLE], [6.1, AISLE], [6.1, st.gy], [st.gx, st.gy]]; }
          }
          continue;
        }
        if (p.st === "sit") {
          p.wait -= dt; p.heart -= dt;
          if (p.heart <= 0) { p.emo = { k: Math.random() < 0.7 ? "heart" : "note", t: 1.7 }; p.heart = 6 + Math.random() * 9; }
          if (p.wait <= 0 || !seats[p.seat]) leave(p);
          continue;
        }
        if (!p.path.length) { p.walk = 0; continue; }
        const [tx, ty] = p.path[0], dx = tx - p.gx, dy = ty - p.gy, d = Math.hypot(dx, dy), sp = 2.1 * dt;
        if (Math.abs(dx - dy) > 0.01) p.dir = dx - dy >= 0 ? 1 : -1;
        if (d <= sp) {
          p.gx = tx; p.gy = ty; p.path.shift();
          if (!p.path.length) {
            p.walk = 0;
            if (p.st === "toSeat") { const st = seats[p.seat]; if (!st) leave(p); else { p.st = "sit"; p.gx = st.gx; p.gy = st.gy; p.dir = st.dir; p.wait = 10 + Math.random() * 14; p.heart = 1.4; } }
            else if (p.st === "leave") p.gone = true;
          }
        } else { p.gx += (dx / d) * sp; p.gy += (dy / d) * sp; p.walk += dt * 11; }
      }
      for (let i = people.length - 1; i >= 0; i--) if (people[i].gone) people.splice(i, 1);
      for (const f of floats) { f.y -= dt * 11; f.a -= dt * 0.7; }
      for (let i = floats.length - 1; i >= 0; i--) if (floats[i].a <= 0) floats.splice(i, 1);
    }

    // ── 하늘 · 도시 ──
    function drawSky(c, h, night, L, top) {
      if (night > 0.05) { c.fillStyle = "#fff"; stars.forEach(([x, y, r], i) => { if (x < L.x0 || x > L.x1) return; c.globalAlpha = night * (0.45 + 0.55 * Math.abs(Math.sin(tm * 0.9 + i))); circ(c, x, y, r * 0.75); }); c.globalAlpha = 1; }
      const span = L.x1 - L.x0;
      if (h > 5.8 && h < 19.2) {
        const t = (h - 5.8) / 13.4, sx = L.x0 + span * (0.1 + t * 0.8), sy = 120 - Math.sin(Math.PI * t) * 120;
        const warm = h > 16.5 || h < 7.5;
        const g = c.createRadialGradient(sx, sy, 0, sx, sy, 40); g.addColorStop(0, warm ? "rgba(255,180,110,.6)" : "rgba(255,245,200,.6)"); g.addColorStop(1, "rgba(255,240,200,0)");
        c.fillStyle = g; c.fillRect(sx - 40, sy - 40, 80, 80);
        c.fillStyle = warm ? "#ffb877" : "#fff6cf"; circ(c, sx, sy, 11);
      }
      if (night > 0.3) { const mx = L.x1 - span * 0.16, my = 18; c.globalAlpha = night; const g = c.createRadialGradient(mx, my, 0, mx, my, 30); g.addColorStop(0, "rgba(255,250,220,.35)"); g.addColorStop(1, "rgba(255,250,220,0)"); c.fillStyle = g; c.fillRect(mx - 30, my - 30, 60, 60); c.fillStyle = "#fff6cf"; circ(c, mx, my, 10); c.fillStyle = top; circ(c, mx + 4.5, my - 3.2, 8.6); c.globalAlpha = 1; }
      // 구름
      const ca = 0.85 - night * 0.62;
      [[0, 4, 1.1], [190, 34, 0.8], [330, -14, 1.25], [520, 58, 0.7]].forEach(([o, y, sc], i) => {
        const x = L.x0 - 60 + ((o + tm * 2.6 * sc) % (span + 140));
        c.fillStyle = `rgba(255,255,255,${ca})`; ell(c, x, y, 22 * sc, 7 * sc); ell(c, x + 12 * sc, y - 6 * sc, 13 * sc, 8 * sc); ell(c, x - 10 * sc, y - 3 * sc, 10 * sc, 6 * sc);
        c.fillStyle = `rgba(255,220,200,${ca * 0.35})`; ell(c, x, y + 3 * sc, 20 * sc, 3 * sc);
        void i;
      });
      if (night < 0.4) { // 새
        c.strokeStyle = `rgba(80,70,90,${0.5 * (1 - night)})`; c.lineWidth = 0.9;
        for (let i = 0; i < 3; i++) { const x = L.x0 + ((tm * 9 + i * 26) % (span + 60)) - 30, y = 30 + i * 7 + Math.sin(tm * 2 + i) * 2, f = Math.sin(tm * 9 + i) * 1.6; c.beginPath(); c.moveTo(x - 3, y - f); c.lineTo(x, y); c.lineTo(x + 3, y - f); c.stroke(); }
      }
    }
    function drawCity(c, night, L, bot) {
      const farC = mix("#c7d3e8", "#28325e", night), nearC = mix("#a9b9d4", "#1f2850", night);
      city.far.forEach((b) => { if (b.x + b.w < L.x0 || b.x > L.x1) return; c.fillStyle = farC; c.fillRect(b.x, 236 - b.h, b.w, b.h + 40); if (b.r) c.fillRect(b.x + b.w / 2 - 0.5, 236 - b.h - 8, 1, 8); });
      city.near.forEach((b, i) => {
        if (b.x + b.w < L.x0 || b.x > L.x1) return;
        c.fillStyle = nearC; c.fillRect(b.x, 250 - b.h, b.w, b.h + 40);
        c.fillStyle = mix("#bccbe2", "#2a3462", night); c.fillRect(b.x + b.w - 4, 250 - b.h, 4, b.h + 40);
        if (b.ant) { c.fillStyle = nearC; c.fillRect(b.x + 5, 250 - b.h - 10, 1.2, 10); if (night > 0.3) { c.fillStyle = `rgba(255,90,90,${0.6 + 0.4 * Math.sin(tm * 3 + i)})`; circ(c, b.x + 5.6, 250 - b.h - 10, 1.3); } }
        for (let wy = 250 - b.h + 5; wy < 248; wy += 7) for (let wx = b.x + 3; wx < b.x + b.w - 6; wx += 5.5) {
          const on = ((wx * 7 + wy * 13 + i * 5) | 0) % 5 < 2;
          c.fillStyle = on && night > 0.3 ? `rgba(255,220,140,${night * 0.85})` : `rgba(255,255,255,${0.32 - night * 0.22})`;
          c.fillRect(wx, wy, 2.4, 3.2);
        }
      });
      // 아래로 갈수록 안개에 잠긴다(흐릿한 먼 도시)
      const hz = c.createLinearGradient(0, 120, 0, 266); hz.addColorStop(0, "rgba(255,255,255,0)"); hz.addColorStop(0.55, bot + "99"); hz.addColorStop(1, bot);
      c.fillStyle = hz; c.fillRect(L.x0, 120, L.x1 - L.x0, 146); c.fillStyle = bot; c.fillRect(L.x0, 265.5, L.x1 - L.x0, Math.max(0, L.y1 - 265));
    }

    // ── 디오라마 ──
    function drawSlab(c) {
      const sh = c.createRadialGradient(210, 318, 10, 210, 318, 190); sh.addColorStop(0, "rgba(60,30,30,.22)"); sh.addColorStop(1, "rgba(60,30,30,0)");
      c.save(); c.translate(210, 318); c.scale(1, 0.18); c.translate(-210, -318); c.fillStyle = sh; c.fillRect(0, 128, 420, 380); c.restore();
      // 옆면
      qY(c, 10, 0, 10, -SLAB, 0, "#e7cdb0"); qX(c, 10, 0, 10, -SLAB, 0, "#c9a689");
      qY(c, 10.001, 0, 10, -SLAB, -SLAB + 5, "#d7b896"); qX(c, 10.001, 0, 10, -SLAB, -SLAB + 5, "#b48f72");
      c.fillStyle = "rgba(255,255,255,.14)";
      for (let i = 0.6; i < 10; i += 1.4) { qY(c, 10.002, i, i + 0.5, -14, -8, "rgba(120,170,210,.35)"); qX(c, 10.002, i, i + 0.5, -14, -8, "rgba(90,140,180,.32)"); }
      // 윗면 타일
      for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) qZ(c, 0, i, j, i + 1, j + 1, (i + j) % 2 ? "#f3dfc8" : "#ecd2b6");
      c.strokeStyle = "rgba(160,110,70,.14)"; c.lineWidth = 0.5; c.beginPath();
      for (let i = 0; i <= 10; i++) { let a = P(i, 0), b = P(i, 10); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); a = P(0, i); b = P(10, i); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); }
      c.stroke();
      // 가장자리 턱
      qY(c, 10, 0, 10, 0, 1.6, "#fbeee0"); qX(c, 10, 0, 10, 0, 1.6, "#eedac4");
      // 가게 앞 매트
      qZ(c, 0.05, 2.55, 4.6, 3.55, 6.8, "rgba(255,122,69,.22)");
    }
    function railBack(c) {
      qY(c, 0.02, 0, 8.25, 1, 13, "rgba(200,232,250,.3)");
      for (let g = 0; g <= 8; g += 1) qY(c, 0.03, g, g + 0.08, 0, 14, "#e9dfd3");
      seg(c, P(0, 0.03, 14), P(8.25, 0.03, 14), "#f5ede3", 1.6);
    }
    function railFront(c) {
      const glass = "rgba(210,236,252,.22)", post = "#f1e7db";
      qY(c, 10, 0, 10, 1.6, 11, glass); qX(c, 10, 1.25, 10, 1.6, 11, glass); qX(c, 0, 8.5, 10, 1.6, 11, glass);
      for (let g = 0; g <= 10; g += 1.25) { qY(c, 10.01, Math.min(g, 9.92), Math.min(g, 9.92) + 0.08, 1.6, 12, post); qX(c, 10.01, Math.max(1.25, g), Math.max(1.25, g) + 0.08, 1.6, 12, shade(post, -0.12)); }
      seg(c, P(0, 10, 12), P(10, 10, 12), "#fff8ef", 1.5); seg(c, P(10, 1.25, 12), P(10, 10, 12), "#f3e6d8", 1.5); seg(c, P(0, 8.5, 12), P(0, 10, 12), "#fff8ef", 1.5);
    }
    function drawWall(c, s, info, night, fx) {
      const cream = "#fff4e4";
      qX(c, 0, 0, 8.5, 0, 66, cream);
      qX(c, 0.001, 0, 8.5, 0, 22, "#d6a67a");
      for (let g = 0.4; g < 8.5; g += 0.5) seg(c, P(0.002, g, 1), P(0.002, g, 21), "rgba(110,60,30,.18)", 0.5);
      qY(c, 8.5, -0.3, 0, 0, 66, "#efdcc4"); qZ(c, 66, -0.3, 0, 0, 8.5, "#f6e7d4");
      // 선반(컵 · 원두 병)
      box(c, 0, 0.5, 0.32, 3.6, 38, 1.4, "#b98256", { edge: false });
      for (let i = 0; i < 7; i++) { const [x, y] = P(0.16, 0.75 + i * 0.42, 39.4); if (i % 3 === 2) { c.fillStyle = "rgba(230,245,255,.85)"; rr(c, x - 2, y - 6, 4, 6, 1); c.fillStyle = "#7a4a2a"; rr(c, x - 1.6, y - 3.6, 3.2, 3.4, 0.8); } else { c.fillStyle = ["#fffaf3", "#ffb38a", "#9fe3c1"][i % 3 === 0 ? 0 : (i % 2) + 1]; rr(c, x - 2.2, y - 4.4, 4.4, 4.4, 1.2); } }
      // 차 선반
      if (s.fac.tea > 0) { box(c, 0, 6.95, 0.3, 8.3, 36, 1.4, "#b98256", { edge: false }); for (let i = 0; i < Math.min(7, s.fac.tea + 2); i++) { const [x, y] = P(0.15, 7.12 + i * 0.17, 37.4); c.fillStyle = ["#9fd98a", "#ffd166", "#ffb38a", "#f7a8d0", "#b5b0ff", "#7ee0cf", "#ff9a6b"][i]; rr(c, x - 1.6, y - 5, 3.2, 5, 1); } }
      // 칠판 메뉴판
      qX(c, 0.004, 3.95, 6.35, 30, 54, "#9a6a45"); qX(c, 0.006, 4.08, 6.22, 31.6, 52.4, "#2b4034");
      c.save(); const [tx, ty] = P(0.01, 5.95, 48.5); c.translate(tx, ty); c.transform(1, -0.5, 0, 1, 0, 0);
      c.fillStyle = "rgba(255,255,255,.9)"; c.font = "800 4.6px Pretendard, 'Apple SD Gothic Neo', sans-serif"; c.textAlign = "left"; c.textBaseline = "middle"; c.fillText("오늘의 메뉴", 0, 0);
      const catC = { coffee: "#ffcf9a", dessert: "#ffb3c8", tea: "#b8f0c8" };
      const onB = s.menu.filter((id) => MENU_BY[id]).slice(0, 6), stB = onB.length > 4 ? 11.7 / (onB.length - 1) : 3.9, rB = onB.length > 4 ? 0.9 : 1.1;
      onB.forEach((id, i) => { const m = MENU_BY[id]; c.fillStyle = catC[m.cat]; circ(c, 1.5, 5.2 + i * stB, rB); c.fillStyle = "rgba(255,255,255,.75)"; c.fillRect(4, 4.8 + i * stB, 14 + ((i * 7) % 9), 0.8); });
      c.restore();
      // 진짜 시각 시계
      const [kx, ky] = P(0.01, 7.4, 52); c.fillStyle = "#fffaf3"; ell(c, kx, ky, 5.2, 6); c.strokeStyle = "#c98a55"; c.lineWidth = 1; c.beginPath(); c.ellipse(kx, ky, 5.2, 6, 0, 0, Math.PI * 2); c.stroke();
      const hr = kstHour(info.now), ha = ((hr % 12) / 12) * Math.PI * 2 - Math.PI / 2, ma = ((hr % 1) * Math.PI * 2) - Math.PI / 2;
      seg(c, [kx, ky], [kx + Math.cos(ha) * 2.6, ky + Math.sin(ha) * 3], "#3a2418", 1); seg(c, [kx, ky], [kx + Math.cos(ma) * 3.8, ky + Math.sin(ma) * 4.4], "#3a2418", 0.7);
    }
    function drawAwning(c, s, night, fx) {
      const tier = s.grade >= 15 ? 3 : s.grade >= 10 ? 2 : s.grade >= 5 ? 1 : 0, A = AWN[tier];
      qX(c, 0.003, 0, 8.5, 46, 60, "rgba(80,40,20,.08)");
      for (let i = 0; i < 17; i++) {
        const g = i * 0.5, col = A[i % 2];
        poly(c, [P(0, g, 64), P(0, g + 0.5, 64), P(1.15, g + 0.5, 52), P(1.15, g, 52)], col);
        const [x, y] = P(1.15, g + 0.25, 52); c.fillStyle = shade(col, -0.06); c.beginPath(); c.ellipse(x, y, 4.6, 3, -0.46, 0, Math.PI); c.fill();
      }
      poly(c, [P(0, 0, 64), P(1.15, 0, 52), P(1.15, 0, 50), P(0, 0, 62)], shade(A[0], -0.25));
      // 펜던트 등(카운터 Lv 3부터)
      if (s.fac.counter >= 3) [2.4, 4.6].concat(s.fac.counter >= 6 ? [0.9] : []).forEach((g) => {
        const a = P(1.0, g, 53), b = P(1.0, g, 44); seg(c, a, b, "#5b4a40", 0.5);
        c.fillStyle = s.fac.counter >= 6 ? "#e3b04b" : "#3d3a44"; c.beginPath(); c.moveTo(b[0] - 3.2, b[1] + 2.6); c.lineTo(b[0] + 3.2, b[1] + 2.6); c.lineTo(b[0] + 1.4, b[1]); c.lineTo(b[0] - 1.4, b[1]); c.closePath(); c.fill();
        if (night > 0.15) { fx.glow(b[0], b[1] + 4, 20, "255,214,150", 0.55 * night); fx.dot(b[0], b[1] + 3, "#fff3c4", 1.4); }
      });
      // 간판
      qX(c, 0, 1.3, 7.2, 67, 83, shade(A[0], -0.2)); qX(c, 0.004, 1.45, 7.05, 68.4, 81.6, "#fffaf2");
      c.save(); const [tx, ty] = P(0.01, 4.25, 75); c.translate(tx, ty); c.transform(1, -0.5, 0, 1, 0, 0);
      c.fillStyle = "#3a2418"; c.font = "900 9px Pretendard, 'Apple SD Gothic Neo', sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("옥상 쉼터 카페", 5, 0.5);
      c.fillStyle = A[0] === "#fff3e6" ? "#ff7a45" : A[0]; rr(c, -44, -3.5, 7, 6, 1.6); c.fillRect(-37.5, -2, 2, 2.5);
      c.restore();
      if (night > 0.15) fx.glow(...P(0.2, 4.25, 75), 56, "255,236,200", 0.3 * night);
    }
    function drawHut(c, s, night, fx) {
      box(c, 8.25, 0, 10, 1.25, 0, 50, "#efe3d4", { left: "#f6ebdd", right: "#d9c6b0" });
      box(c, 8.1, -0.15, 10.12, 1.4, 50, 4, "#d9714a");
      box(c, 8.6, 0.2, 9.3, 0.8, 54, 6, "#cfd6dd");
      qY(c, 1.251, 8.62, 9.45, 0, 32, "#9a6243"); qY(c, 1.252, 8.72, 9.35, 17, 28, night > 0.3 ? "#ffe3a3" : "#a9d6f0");
      const [nx, ny] = P(9.32, 1.25, 15); c.fillStyle = "#e3b04b"; circ(c, nx, ny, 0.9);
      qX(c, 10.001, 0.3, 0.95, 26, 38, night > 0.3 ? "#ffe3a3" : "#a9d6f0");
      const [lx, ly] = P(9.04, 1.27, 37); c.fillStyle = "#4a3f3a"; rr(c, lx - 2.5, ly - 1.5, 5, 3, 1); c.fillStyle = night > 0.2 ? "#fff1b8" : "#f4efe6"; rr(c, lx - 2, ly + 1, 4, 2.6, 1);
      if (night > 0.15) { fx.glow(lx, ly + 2, 24, "255,214,140", 0.55 * night); fx.glow(...P(9.05, 1.25, 22), 14, "255,214,140", 0.35 * night); }
      if (s.fac.plant >= 7) { box(c, 8.4, 1.3, 8.58, 1.62, 0, 6, "#d9714a", { edge: false }); pot(c, ...P(8.5, 1.5, 5), 2, 0.6, Math.sin(tm) * 0.05); }
    }

    function drawDiorama(c, s, info, night, fx) {
      const brew = info.served > 0 && !info.full;
      const o = { tm, brew, night, fx };
      drawSlab(c);
      railBack(c);
      drawWall(c, s, info, night, fx);
      drawHut(c, s, night, fx);
      // 카운터 뒤 사람들(나 + 알바생)
      const crew = [{ skin: "#f3c9a7", hair: "#4b3621", shirt: "#5b4a63", style: "short", apron: "#ff7a45" }].concat(s.staff.map((x) => ({ ...STAFF_BY[x.id], apron: "#fffaf3" })));
      const cy = [3.4, 1.55, 4.55, 2.45];
      crew.forEach((p, i) => { const [x, y] = P(0.72, cy[i], 0); person(c, x, y + Math.sin(tm * 2 + i * 1.7) * 0.5, { ...p, dir: 1, pants: "#4a4050", sc: 0.86 }); });
      drawCounter(c, s.fac.counter, o); hit("counter", 1.25, 0.85, 2.25, 6.5, 0, 24);
      drawCoffee(c, s.fac.coffee, o); hit("coffee", 1.3, 1.1, 2.2, 2.5, 18, 46);
      const unlocked = (id) => s.grade >= FAC_BY[id].g;
      if (s.fac.dessert > 0) { drawDessert(c, s.fac.dessert, o); hit("dessert", 1.4, 2.85, 2.1, 4.8, 18, 40); }
      else if (unlocked("dessert")) { dashed(c, [P(1.42, 2.85, 18), P(2.08, 2.85, 18), P(2.08, 4.0, 18), P(1.42, 4.0, 18)]); hit("dessert", 1.4, 2.85, 2.1, 4.0, 18, 28); }
      if (s.fac.tea > 0) { drawTea(c, s.fac.tea, o); hit("tea", TEA.x0, TEA.y0, TEA.x1, TEA.y1, 0, 30); }
      else if (unlocked("tea")) { dashed(c, [P(TEA.x0, TEA.y0), P(TEA.x1, TEA.y0), P(TEA.x1, TEA.y1), P(TEA.x0, TEA.y1)]); hit("tea", TEA.x0, TEA.y0, TEA.x1, TEA.y1, 0, 10); }
      drawAwning(c, s, night, fx);
      if (night > 0.1) { fx.glow(...P(2.2, 3.8, 26), 74, "255,196,130", 0.34 * night); fx.glow(...P(3.4, 4.6, 0), 60, "255,180,110", 0.16 * night); }
      // 바닥 위 물건들 — 깊이(gx + gy) 순서로
      const items = [], add = (d, f) => items.push({ d, f });
      const seats = seatsList(s), nT = TABLES[s.fac.seat] || 0, sL = s.fac.seat;
      const sitters = people.filter((p) => p.st === "sit");
      for (let i = 0; i < nT; i++) {
        const [tx, ty] = TBL[i];
        const cups = sitters.filter((p) => seats[p.seat] && seats[p.seat].t === i).map((p) => seats[p.seat].side);
        add(tx + ty - 0.85 - 0.05, () => chairBack(c, tx, ty - 0.85, -1, sL));
        add(tx + ty - 0.85, () => chairSeat(c, tx, ty - 0.85, sL));
        add(tx + ty + 0.85, () => chairSeat(c, tx, ty + 0.85, sL));
        add(tx + ty + 0.85 + 0.3, () => chairBack(c, tx, ty + 0.85, 1, sL));
        add(tx + ty, () => tableTop(c, tx, ty, sL, cups));
        if ((sL >= 4 && (i === 0 || i === 3)) || (sL >= 7 && i === 5)) add(tx + ty + 0.95, () => parasolBig(c, tx, ty, AWN[i % 2 ? 1 : 0][0], tm + i));
        hit("seat", tx - 1, ty - 1.2, tx + 1, ty + 1.2, 0, 22);
      }
      for (let i = 0; i < Math.min(8, s.fac.plant); i++) {
        const [gx, gy] = PLANT_G[i], sc = 0.9 + 0.05 * s.fac.plant;
        add(gx + gy, () => pot(c, ...P(gx, gy), i, sc, Math.sin(tm * 1.3 + i) * 0.05));
        hit("plant", gx - 0.5, gy - 0.5, gx + 0.5, gy + 0.5, 0, 28);
      }
      if (s.fac.plant >= 5) [[9.7, 5.15], [3.0, 9.7]].forEach(([gx, gy]) => add(gx + gy, () => lampPost(c, gx, gy, night, fx)));
      const poles = [];
      if (s.fac.plant >= 2) poles.push([9.85, 9.85]);
      if (s.fac.plant >= 4) poles.push([9.85, 4.3]);
      poles.forEach(([gx, gy]) => add(gx + gy, () => { shadow(c, gx, gy, 3, 0.12); const [x, y] = P(gx, gy); c.fillStyle = "#6b5a50"; c.fillRect(x - 0.8, y - 46, 1.6, 46); }));
      s.deco.place.forEach((id, i) => { if (!id) return; const [gx, gy] = SPOT_G[i]; add(gx + gy, () => { const [x, y] = P(gx, gy); c.save(); c.translate(x, y); c.scale(0.86, 0.86); deco(c, id, 0, 0, night, tm, fx); c.restore(); }); });
      people.forEach((p) => {
        const st = p.st === "sit" && seats[p.seat];
        const d = st ? p.gx + p.gy + 0.02 : p.gx + p.gy;
        const alpha = Math.abs(p.gx - DOOR[0]) < 0.3 ? clamp01((p.gy - DOOR[1]) / 0.45) : 1;
        add(d, () => {
          const [x, y] = P(p.gx, p.gy, st ? 6 : 0);
          person(c, x, y, { ...p.lk, skin: p.skin, dir: p.dir, walk: p.walk, sit: !!st, cup: p.cup && !st, sc: 0.84, alpha });
          if (p.emo) fx.bubble(x, y - 36, p.emo.k, p.emo.t);
        });
      });
      items.sort((a, b) => a.d - b.d).forEach((it) => it.f());
      // 전구 줄
      if (s.fac.plant >= 2) { bulbs(c, P(0, 0.05, 66), P(8.25, 0.05, 54), 12, 12, night, tm, fx); bulbs(c, P(0, 8.45, 66), P(9.85, 9.85, 46), 22, 13, night, tm, fx); }
      if (s.fac.plant >= 4) bulbs(c, P(0, 4.2, 66), P(9.85, 4.3, 46), 18, 12, night, tm, fx);
      railFront(c);
    }
    function dashed(c, pts) { c.save(); c.setLineDash([2.2, 1.8]); c.strokeStyle = "rgba(217,84,31,.55)"; c.lineWidth = 0.9; c.fillStyle = "rgba(255,122,69,.08)"; c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); c.fill(); c.stroke(); c.restore(); }
    function hit(id, gx0, gy0, gx1, gy1, z0, z1) {
      const pts = [P(gx0, gy0, z0), P(gx1, gy0, z0), P(gx1, gy1, z0), P(gx0, gy1, z0), P(gx0, gy0, z1), P(gx1, gy1, z1), P(gx1, gy0, z1), P(gx0, gy1, z1)];
      hits.push({ id, x0: Math.min(...pts.map((p) => p[0])), x1: Math.max(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), y1: Math.max(...pts.map((p) => p[1])) });
    }
    function bubble(c, x, y, kind, t) {
      const a = Math.min(1, t * 4), s = 0.7 + 0.3 * Math.min(1, (1.8 - t) * 6);
      c.save(); c.globalAlpha = Math.max(0, a); c.translate(x, y); c.scale(s, s);
      c.fillStyle = "rgba(90,45,20,.16)"; rr(c, -7, -6, 15, 12, 5);
      c.fillStyle = "#fff"; rr(c, -7.5, -7, 15, 12, 5); c.beginPath(); c.moveTo(-2, 4.8); c.lineTo(0, 8); c.lineTo(2, 4.8); c.fill();
      if (kind === "coffee") { c.fillStyle = "#b8743f"; rr(c, -3.6, -3.6, 6, 5.6, 1.4); c.strokeStyle = "#b8743f"; c.lineWidth = 1.1; c.beginPath(); c.arc(2.8, -1, 1.7, -Math.PI / 2, Math.PI / 2); c.stroke(); c.fillStyle = "#fff4e4"; c.fillRect(-3.2, -3.4, 5.2, 1.1); }
      else if (kind === "heart") { c.fillStyle = "#ff5c7a"; c.beginPath(); c.moveTo(0, 3); c.bezierCurveTo(-6, -1.5, -3, -6, 0, -3); c.bezierCurveTo(3, -6, 6, -1.5, 0, 3); c.fill(); }
      else { c.fillStyle = "#7a5af5"; ell(c, -1.6, 1.6, 1.8, 1.4); c.fillRect(-0.1, -4.6, 1, 6.2); c.fillRect(-0.1, -4.6, 3.4, 1.1); }
      c.restore();
    }

    function draw(s, info) {
      const c = ctx, h = SKY_PREVIEW != null ? SKY_PREVIEW : kstHour(info.now), night = nightOf(h);
      hits = [];
      const glows = [], dots = [], bubs = [];
      const fx = { glow: (x, y, r, rgb, a) => { if (a > 0.01) glows.push([x, y, r, rgb, a]); }, dot: (x, y, col, r) => dots.push([x, y, col, r]), bubble: (x, y, kd, t) => bubs.push([x, y, kd, t]) };
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const [top, bot] = skyAt(h);
      const g = c.createLinearGradient(0, 0, 0, ch); g.addColorStop(0, top); g.addColorStop(0.75, bot); g.addColorStop(1, bot);
      c.fillStyle = g; c.fillRect(0, 0, cw, ch);
      const T = [dpr * k, 0, 0, dpr * k, dpr * ox, dpr * oy];
      c.setTransform(...T);
      const L = { x0: -ox / k, x1: (cw - ox) / k, y0: -oy / k, y1: (ch - oy) / k };
      drawSky(c, h, night, L, top);
      drawCity(c, night, L, bot);
      const d = oc;
      d.setTransform(1, 0, 0, 1, 0, 0); d.clearRect(0, 0, off.width, off.height);
      d.setTransform(...T);
      drawDiorama(d, s, info, night, fx);
      d.setTransform(1, 0, 0, 1, 0, 0);
      d.globalCompositeOperation = "source-atop";
      const warm = duskOf(h);
      if (warm > 0.01) { d.fillStyle = `rgba(255,130,70,${0.16 * warm})`; d.fillRect(0, 0, off.width, off.height); }
      if (night > 0.01) { d.fillStyle = `rgba(24,26,78,${0.5 * night})`; d.fillRect(0, 0, off.width, off.height); }
      d.globalCompositeOperation = "source-over";
      c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(off, 0, 0);
      c.setTransform(...T);
      if (glows.length) {
        c.globalCompositeOperation = "lighter";
        glows.forEach(([x, y, r, rgb, a]) => { const gg = c.createRadialGradient(x, y, 0, x, y, r); gg.addColorStop(0, `rgba(${rgb},${a})`); gg.addColorStop(1, `rgba(${rgb},0)`); c.fillStyle = gg; c.fillRect(x - r, y - r, r * 2, r * 2); });
        c.globalCompositeOperation = "source-over";
      }
      dots.forEach(([x, y, col, r]) => { c.fillStyle = col; circ(c, x, y, r); });
      bubs.forEach(([x, y, kd, t]) => bubble(c, x, y, kd, t));
      floats.forEach((f) => { c.globalAlpha = Math.max(0, f.a); c.font = "900 8.5px Pretendard, sans-serif"; c.textAlign = "center"; c.lineWidth = 2.6; c.strokeStyle = "#fff"; c.strokeText(f.text, f.x, f.y); c.fillStyle = "#e8890c"; c.fillText(f.text, f.x, f.y); });
      c.globalAlpha = 1;
    }

    function frame(ts) {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, last ? (ts - last) / 1000 : 0.016); last = ts;
      acc += dt;
      if (acc < 1 / 45) return; // 45프레임이면 충분
      const step = acc; acc = 0;
      const s = getState(); const info = opts.info();
      update(step, s, info);
      draw(s, info);
    }
    function start() {
      resize();
      if (reduce) {
        const s = getState(), info = opts.info();
        seatsList(s).slice(0, Math.min(4, Math.round((info.served || 0) / 20))).forEach((st, i) => people.push({ id: ++uid, gx: st.gx, gy: st.gy, st: "sit", seat: i, dir: st.dir, lk: LOOKS[i % 8], skin: SKINS[i % 5], walk: 0, wait: 1e9, heart: 1e9, path: [], cup: true }));
        draw(s, info);
      } else raf = requestAnimationFrame(frame);
    }
    const ro = new ResizeObserver(() => { resize(); if (reduce || !raf) draw(getState(), opts.info()); });
    ro.observe(canvas);
    const onVis = () => { if (reduce || !alive) return; cancelAnimationFrame(raf); raf = 0; last = 0; if (document.visibilityState === "visible") raf = requestAnimationFrame(frame); };
    document.addEventListener("visibilitychange", onVis);
    const pick = (e) => {
      const r = canvas.getBoundingClientRect(), lx = (e.clientX - r.left - ox) / k, ly = (e.clientY - r.top - oy) / k;
      for (let i = hits.length - 1; i >= 0; i--) { const hh = hits[i]; if (lx >= hh.x0 && lx <= hh.x1 && ly >= hh.y0 && ly <= hh.y1) return hh.id; }
      return null;
    };
    canvas.addEventListener("click", (e) => { const id = pick(e); if (id && opts.onPick) opts.onPick(id); });
    canvas.addEventListener("mousemove", (e) => { canvas.style.cursor = pick(e) ? "pointer" : ""; });
    start();
    return {
      toCss, relayout: () => { resize(); if (reduce) draw(getState(), opts.info()); },
      redraw: () => { if (reduce) draw(getState(), opts.info()); },
      destroy: () => { alive = false; cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener("visibilitychange", onVis); },
    };
  }

  // ── 작은 그림(카드용) — canvas 를 dataURL 로 ──
  function thumb(w, h, fn) {
    const cv = document.createElement("canvas"), d = 3;
    cv.width = w * d; cv.height = h * d;
    const c = cv.getContext("2d"); c.scale(d, d); fn(c);
    return cv.toDataURL();
  }
  function tile(c, x, y, rx, col) { c.fillStyle = col; c.beginPath(); c.moveTo(x, y - rx / 2); c.lineTo(x + rx, y); c.lineTo(x, y + rx / 2); c.lineTo(x - rx, y); c.closePath(); c.fill(); }
  const decoThumb = (id) => thumb(72, 60, (c) => { tile(c, 36, 48, 30, "#ffe7da"); tile(c, 36, 47, 26, "#fff3ea"); deco(c, id, 36, 50, 0, 0.6); });
  // 시설 카드 그림 — 장면에서 쓰는 그리기를 그대로, 그 레벨 모양으로
  function facThumb(id, L) {
    const o = { tm: 0.3, brew: false, night: 0, fx: NOFX };
    return thumb(96, 80, (c) => {
      tile(c, 48, 60, 40, "#ffe7da"); tile(c, 48, 58.5, 36, "#fff5ec");
      const at = (gx, gy, z, sc) => { const [ax, ay] = P(gx, gy, z); c.translate(48, 56); c.scale(sc, sc); c.translate(-ax, -ay); };
      c.save();
      if (id === "coffee") { at(1.75, 1.8, 10, 1.55); box(c, 1.25, 0.9, 2.25, 2.9, 0, 18, "#e3b98a", { right: "#b97a4b" }); drawCoffee(c, Math.max(1, L), o); }
      else if (id === "counter") { at(1.75, 3.65, 4, 0.6); drawCounter(c, Math.max(1, L), o); drawCoffee(c, 1, o); }
      else if (id === "dessert") { at(1.75, 3.6, 14, 1.25); box(c, 1.25, 2.6, 2.25, 5.2, 0, 18, "#e3b98a", { right: "#b97a4b" }); drawDessert(c, Math.max(1, L), o); }
      else if (id === "tea") { at(1.55, 7.6, 8, 1.65); drawTea(c, Math.max(1, L), o); }
      else if (id === "seat") {
        const lv = Math.max(1, L);
        at(4.7, 3.6, lv >= 4 ? 14 : 8, lv >= 4 ? 0.95 : 1.35);
        chairBack(c, 4.7, 2.75, -1, lv); chairSeat(c, 4.7, 2.75, lv); tableTop(c, 4.7, 3.6, lv, []); chairSeat(c, 4.7, 4.45, lv); chairBack(c, 4.7, 4.45, 1, lv);
        if (lv >= 4) parasolBig(c, 4.7, 3.6, "#ff7a45", 0);
      } else if (id === "plant") {
        const lv = Math.max(1, L);
        at(5, 5, 14, 0.95);
        const spots = [[5, 5], [4.3, 5.5], [5.6, 4.3], [4.6, 4.2], [5.5, 5.7], [4, 4.6], [6, 5], [5, 6.1]];
        for (let i = 0; i < Math.min(lv, 8); i++) { const [gx, gy] = spots[i]; pot(c, ...P(gx, gy), i, 0.9 + 0.04 * lv, 0); }
        if (lv >= 2) bulbs(c, P(3.4, 4.3, 34), P(6.2, 3.4, 34), 6, 6, 0, 0, NOFX);
      }
      c.restore();
    });
  }

  // ── 카드용 SVG 그림: 음료 · 알바생 얼굴 · 작은 아이콘 ──
  let svgUid = 0;
  const glass = (body) => `<path d="M26 22h28l-3 44a4 4 0 0 1-4 3.6H33a4 4 0 0 1-4-3.6z" fill="#eef8fc" opacity=".95"/>${body}<path d="M29.5 26l2.4 38" stroke="#fff" stroke-width="2" opacity=".7" stroke-linecap="round"/>`;
  const mug = (layers, foam) => `<path d="M56 36h4a8 8 0 0 1 0 16h-4" fill="none" stroke="#dcebf2" stroke-width="4"/><path d="M20 26h36v34a9 9 0 0 1-9 9H29a9 9 0 0 1-9-9z" fill="#eef7fb"/>${layers}<ellipse cx="38" cy="28" rx="16" ry="3.4" fill="${foam}"/><path d="M24 31v27" stroke="#fff" stroke-width="2" opacity=".65" stroke-linecap="round"/>`;
  const steamSvg = (x) => `<path d="M${x - 4} 16c-3-3 3-5 0-9M${x + 4} 16c-3-3 3-5 0-9" stroke="#d8c4b2" stroke-width="2" fill="none" stroke-linecap="round" opacity=".85"/>`;
  const macaron = (y, a, b) => `<ellipse cx="40" cy="${y + 7}" rx="17" ry="6.5" fill="${b}"/><rect x="23.5" y="${y}" width="33" height="4.5" rx="2.2" fill="#fff6f0"/><ellipse cx="40" cy="${y - 1}" rx="17" ry="6.5" fill="${a}"/><ellipse cx="34" cy="${y - 3}" rx="5" ry="1.6" fill="#fff" opacity=".45"/>`;
  function drinkSvg(id, size = 72) {
    const u = "cfd" + ++svgUid;
    const sh = `<ellipse cx="40" cy="71" rx="18" ry="3.6" fill="#5a2d14" opacity=".13"/>`;
    const art = {
      americano: `${sh}<path d="M25 27h30l-3.6 41a3 3 0 0 1-3 2.6H31.6a3 3 0 0 1-3-2.6z" fill="#fffaf3"/><path d="M26.6 40h26.8l-1.5 16H28.1z" fill="#c07a43"/><path d="M27.6 44h24.8" stroke="#8f5428" stroke-width="1.4" opacity=".5"/><rect x="22" y="21" width="36" height="7.5" rx="3.5" fill="#f3e6d6"/><path d="M28 21c2-5 22-5 24 0z" fill="#e6d3bd"/>${steamSvg(40)}`,
      latte: `${sh}${mug(`<path d="M22 50h32v10a7 7 0 0 1-7 7H29a7 7 0 0 1-7-7z" fill="#8b5433"/><path d="M22 37h32v13H22z" fill="#d8ad80"/><path d="M22 29h32v8H22z" fill="#fff4e4"/>`, "#fffaf2")}<path d="M38 31.4c-3-2.2-5-3.6-3.6-5.2 1-1 2.6-.6 3.6.6 1-1.2 2.6-1.6 3.6-.6 1.4 1.6-.6 3-3.6 5.2z" fill="#c98c5a"/>`,
      cookie: `<ellipse cx="40" cy="64" rx="28" ry="7.5" fill="#f1e1cf"/><ellipse cx="40" cy="62" rx="24" ry="5.8" fill="#fffaf3"/><circle cx="29" cy="54" r="10.5" fill="#d99a52"/><circle cx="29" cy="53" r="9" fill="#f0bd75"/><circle cx="51" cy="55" r="10.5" fill="#d99a52"/><circle cx="51" cy="54" r="9" fill="#f0bd75"/><circle cx="40" cy="43" r="10.5" fill="#d99a52"/><circle cx="40" cy="42" r="9" fill="#f5c983"/><g fill="#6b3a1e"><circle cx="26" cy="51" r="1.6"/><circle cx="31" cy="56" r="1.4"/><circle cx="49" cy="52" r="1.6"/><circle cx="54" cy="57" r="1.4"/><circle cx="37" cy="40" r="1.6"/><circle cx="43" cy="45" r="1.4"/><circle cx="42" cy="38" r="1.2"/></g>`,
      greentea: `${sh}<path d="M24 32h32l-2.5 30a7 7 0 0 1-7 6.4H33.5a7 7 0 0 1-7-6.4z" fill="#86bd70"/><path d="M24.8 44h30.4" stroke="#679c54" stroke-width="3"/><ellipse cx="40" cy="32" rx="16" ry="4" fill="#679c54"/><ellipse cx="40" cy="32.6" rx="13.5" ry="3" fill="#d4e8a0"/><path d="M33 56c4-6 10-6 13-4-2 4-8 6-13 4z" fill="#e0f0c0"/>${steamSvg(40)}`,
      cake: `${sh}<path d="M18 46L58 36l6 8-40 10z" fill="#fff8f0"/><path d="M24 54l40-10v14l-40 10z" fill="#ffe8d4"/><path d="M18 46l6 8v14l-6-8z" fill="#f4d0b2"/><path d="M24 60l40-10v3l-40 10z" fill="#ff8fa3"/><path d="M18 52l6 8v3l-6-8z" fill="#ef7a8f"/><g fill="#fff"><circle cx="26" cy="46" r="2.4"/><circle cx="36" cy="43.6" r="2.4"/><circle cx="46" cy="41.2" r="2.4"/><circle cx="56" cy="38.8" r="2.4"/></g><path d="M44 27c4 0 7 3 6 7-1 4-4 6-6 7-2-1-5-3-6-7-1-4 2-7 6-7z" fill="#ef3b4f"/><path d="M40 27c2-2 6-2 8 0-2 1-6 1-8 0z" fill="#4caf50"/><g fill="#ffd8a0"><circle cx="42" cy="32" r=".7"/><circle cx="46" cy="33" r=".7"/><circle cx="44" cy="36" r=".7"/></g>`,
      ade: `${sh}${glass(`<path d="M27.3 34h25.4l-2.2 31.4a3 3 0 0 1-3 2.6H32.5a3 3 0 0 1-3-2.6z" fill="#ffe066"/><rect x="31" y="39" width="8" height="8" rx="2" fill="#fff" opacity=".65" transform="rotate(-12 35 43)"/><rect x="40" y="46" width="8" height="8" rx="2" fill="#fff" opacity=".55" transform="rotate(10 44 50)"/><g fill="#fff" opacity=".7"><circle cx="36" cy="58" r="1.2"/><circle cx="44" cy="61" r="1"/><circle cx="41" cy="55" r=".8"/></g>`)}<path d="M44 33L51 8" stroke="#ff7a45" stroke-width="3.2" stroke-linecap="round"/><circle cx="54" cy="25" r="8.5" fill="#ffd43b"/><circle cx="54" cy="25" r="6.4" fill="#fff3a6"/><path d="M54 18.6v12.8M47.6 25h12.8M49.5 20.5l9 9M58.5 20.5l-9 9" stroke="#ffd43b" stroke-width="1"/>`,
      vanilla: `${sh}${glass(`<path d="M27.6 30h24.8l-2.5 35.4a3 3 0 0 1-3 2.6H32.6a3 3 0 0 1-3-2.6z" fill="url(#${u})"/>`)}<path d="M25 24c0-9 30-9 30 0z" fill="#fffaf2"/><path d="M28 22c4 2 6-2 10 0s6-2 10 0 4 0 4 0" stroke="#d08a3a" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M41 12l2 5" stroke="#ff7a45" stroke-width="3" stroke-linecap="round"/><defs><linearGradient id="${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6e8"/><stop offset=".45" stop-color="#e8c79c"/><stop offset="1" stop-color="#9a5b34"/></linearGradient></defs>`,
      macaron: `<ellipse cx="40" cy="70" rx="19" ry="3.6" fill="#5a2d14" opacity=".13"/>${macaron(58, "#ffa8c5", "#f48fb1")}${macaron(42, "#a8ecd2", "#86dcbc")}${macaron(26, "#ffe08a", "#f7cf5f")}`,
      yuja: `${sh}${mug(`<path d="M22 32h32v28a7 7 0 0 1-7 7H29a7 7 0 0 1-7-7z" fill="#f6a623" opacity=".92"/><g fill="#ffd54a"><rect x="28" y="44" width="9" height="2.4" rx="1.2" transform="rotate(-20 32 45)"/><rect x="40" y="52" width="9" height="2.4" rx="1.2" transform="rotate(15 44 53)"/><rect x="31" y="58" width="7" height="2.2" rx="1.1"/></g>`, "#ffc24a")}${steamSvg(38)}`,
      tart: `<ellipse cx="40" cy="66" rx="28" ry="6" fill="#5a2d14" opacity=".12"/><ellipse cx="40" cy="58" rx="27" ry="9.5" fill="#c9884a"/><ellipse cx="40" cy="54" rx="27" ry="9.5" fill="#e9ad66"/><ellipse cx="40" cy="53" rx="22" ry="7" fill="#fff1c9"/><circle cx="31" cy="52" r="4.2" fill="#8bc34a"/><circle cx="31" cy="52" r="2.4" fill="#c5e1a5"/><circle cx="48" cy="51" r="4.2" fill="#8bc34a"/><circle cx="48" cy="51" r="2.4" fill="#c5e1a5"/><path d="M38 47c2.6 0 4.4 2 3.8 4.6-.6 2.4-2.6 3.6-3.8 4.2-1.2-.6-3.2-1.8-3.8-4.2-.6-2.6 1.2-4.6 3.8-4.6z" fill="#ef3b4f"/><g fill="#3f51b5"><circle cx="42" cy="57" r="1.8"/><circle cx="35" cy="57.5" r="1.8"/><circle cx="45" cy="55" r="1.6"/></g><circle cx="53" cy="55" r="2.4" fill="#ffb74d"/>`,
      sunset: `${sh}${glass(`<path d="M27.6 30h24.8l-2.5 35.4a3 3 0 0 1-3 2.6H32.6a3 3 0 0 1-3-2.6z" fill="url(#${u})"/>`)}<path d="M25 25c0-8 30-8 30 0z" fill="#fff7ee"/><circle cx="52" cy="20" r="6.5" fill="#ffcf3f"/><path d="M45 20h14" stroke="#ff9a3c" stroke-width="1.2"/><defs><linearGradient id="${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb35c"/><stop offset=".5" stop-color="#ff7a8a"/><stop offset="1" stop-color="#8a5cd6"/></linearGradient></defs>`,
      peachtea: `${sh}${glass(`<path d="M27.3 34h25.4l-2.2 31.4a3 3 0 0 1-3 2.6H32.5a3 3 0 0 1-3-2.6z" fill="#ffb38a"/><rect x="31" y="40" width="8" height="8" rx="2" fill="#fff" opacity=".6" transform="rotate(-10 35 44)"/><rect x="40" y="48" width="7" height="7" rx="2" fill="#fff" opacity=".5" transform="rotate(12 43 51)"/><g fill="#fff" opacity=".7"><circle cx="36" cy="60" r="1.1"/><circle cx="44" cy="62" r=".9"/></g>`)}<path d="M36 33L30 9" stroke="#7ee0cf" stroke-width="3.2" stroke-linecap="round"/><path d="M45 25a8 8 0 0 1 16 0z" fill="#ff8a65"/><path d="M47.5 25a5.5 5.5 0 0 1 11 0z" fill="#ffd0a8"/><path d="M53 17c1-3 4-4 6-3-1 2-3 3-6 3z" fill="#6aa84f"/>`,
      cappuccino: `${sh}${mug(`<path d="M22 44h32v16a7 7 0 0 1-7 7H29a7 7 0 0 1-7-7z" fill="#a8693f"/><path d="M22 30h32v14H22z" fill="#fff6ea"/>`, "#fffaf2")}<path d="M22 28c0-10 32-10 32 0z" fill="#fffaf2"/><g fill="#b07040"><circle cx="33" cy="24" r=".9"/><circle cx="39" cy="21.5" r=".9"/><circle cx="45" cy="24.5" r=".9"/><circle cx="41" cy="26" r=".8"/><circle cx="36" cy="26.5" r=".7"/></g>`,
      muffin: `${sh}<path d="M24 46h32l-4 22H28z" fill="#ff9a6b"/><g stroke="#e8774a" stroke-width="1.4"><path d="M29 47l1.6 20"/><path d="M34.5 47l.8 20"/><path d="M40 47v20"/><path d="M45.5 47l-.8 20"/><path d="M51 47l-1.6 20"/></g><path d="M20 47c0-17 40-17 40 0 0 3-40 3-40 0z" fill="#7a4526"/><path d="M26 40c3-6 10-8 14-8" stroke="#a0643a" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".7"/><g fill="#3e2010"><circle cx="31" cy="42" r="1.6"/><circle cx="40" cy="38" r="1.6"/><circle cx="48" cy="42" r="1.6"/><circle cx="44" cy="34.5" r="1.3"/><circle cx="35" cy="35" r="1.3"/></g>`,
      matcha: `${sh}${glass(`<path d="M27.6 30h24.8l-2.5 35.4a3 3 0 0 1-3 2.6H32.6a3 3 0 0 1-3-2.6z" fill="url(#${u})"/>`)}<ellipse cx="40" cy="30" rx="12.4" ry="2.4" fill="#fffdf6"/><path d="M40 27c-5-1-8 2-7 5 4 1 7-1 7-5z" fill="#7cb342"/><path d="M40 27l-5 4" stroke="#558b2f" stroke-width=".8"/><defs><linearGradient id="${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffdf6"/><stop offset=".38" stop-color="#eef4dc"/><stop offset=".52" stop-color="#9ccc65"/><stop offset="1" stop-color="#5f9a3a"/></linearGradient></defs>`,
      caramel: `${sh}${glass(`<path d="M27.6 30h24.8l-2.5 35.4a3 3 0 0 1-3 2.6H32.6a3 3 0 0 1-3-2.6z" fill="url(#${u})"/>`)}<path d="M25 25c0-9 30-9 30 0z" fill="#fffaf2"/><path d="M27 23l5-4 5 4 5-4 5 4 5-4" stroke="#d98a2b" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/><defs><linearGradient id="${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3e0"/><stop offset=".35" stop-color="#f0c890"/><stop offset=".7" stop-color="#b8743c"/><stop offset="1" stop-color="#7a4220"/></linearGradient></defs>`,
      tiramisu: `<ellipse cx="40" cy="68" rx="24" ry="4.5" fill="#5a2d14" opacity=".13"/><path d="M20 40l20 8v18l-20-8z" fill="#f6e6cc"/><path d="M60 40l-20 8v18l20-8z" fill="#ead2ac"/><path d="M20 46l20 8v4l-20-8zM60 46l-20 8v4l20-8z" fill="#8a5232"/><path d="M20 54l20 8v2.4l-20-8zM60 54l-20 8v2.4l20-8z" fill="#8a5232" opacity=".8"/><path d="M20 40l20-8 20 8-20 8z" fill="#7a4526"/><g fill="#4a2410" opacity=".55"><circle cx="34" cy="39" r=".9"/><circle cx="42" cy="36" r=".9"/><circle cx="46" cy="41" r=".9"/><circle cx="38" cy="43" r=".8"/><circle cx="30" cy="41" r=".7"/></g><path d="M41 37c2-5 7-5 8-2-2 2-5 3-8 2z" fill="#6aa84f"/>`,
      grapefruit: `${sh}${glass(`<path d="M27.3 34h25.4l-2.2 31.4a3 3 0 0 1-3 2.6H32.5a3 3 0 0 1-3-2.6z" fill="url(#${u})"/><path d="M31 50c3-2 6-2 9 0" stroke="#fff" stroke-width="1.4" opacity=".5" fill="none"/>`)}<circle cx="53" cy="24" r="8.5" fill="#ff7a6b"/><circle cx="53" cy="24" r="6.6" fill="#ffb3a0"/><path d="M53 17.4v13.2M46.4 24h13.2M48.3 19.3l9.4 9.4M57.7 19.3l-9.4 9.4" stroke="#ff7a6b" stroke-width="1"/><defs><linearGradient id="${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd28a"/><stop offset=".5" stop-color="#e8704a"/><stop offset="1" stop-color="#a8402a"/></linearGradient></defs>`,
      coldbrew: `${sh}${glass(`<path d="M27.6 30h24.8l-2.5 35.4a3 3 0 0 1-3 2.6H32.6a3 3 0 0 1-3-2.6z" fill="#5a3018"/><rect x="31" y="42" width="8" height="8" rx="2" fill="#fff" opacity=".28" transform="rotate(-12 35 46)"/><rect x="40" y="52" width="7" height="7" rx="2" fill="#fff" opacity=".22" transform="rotate(10 43 55)"/>`)}<g fill="#fffdf8"><circle cx="31" cy="26" r="6"/><circle cx="40" cy="22" r="7.5"/><circle cx="49" cy="26" r="6"/><rect x="25" y="25" width="30" height="6.5" rx="3.2"/></g><path d="M34 22a6 6 0 0 1 6-4" stroke="#dfe7f0" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
      starcake: `<ellipse cx="40" cy="68" rx="26" ry="5" fill="#5a2d14" opacity=".13"/><ellipse cx="40" cy="62" rx="24" ry="6.5" fill="#2f3a7a"/><rect x="16" y="44" width="48" height="18" fill="#3d4a9a"/><ellipse cx="40" cy="44" rx="24" ry="6.5" fill="#5a68c8"/><path d="M16 46c3 4 6 4 8 0s5 4 8 0 5 4 8 0 5 4 8 0 5 4 8 0 5 4 8 0" stroke="#fff4c0" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M0-3l.9 2 2.1.2-1.6 1.4.5 2.1L0 1.6-1.9 2.7l.5-2.1L-3-.8l2.1-.2z" fill="#ffd54a" transform="translate(24 54) scale(1)"/><path d="M0-3l.9 2 2.1.2-1.6 1.4.5 2.1L0 1.6-1.9 2.7l.5-2.1L-3-.8l2.1-.2z" fill="#ffd54a" transform="translate(40 56) scale(1.2)"/><path d="M0-3l.9 2 2.1.2-1.6 1.4.5 2.1L0 1.6-1.9 2.7l.5-2.1L-3-.8l2.1-.2z" fill="#ffd54a" transform="translate(55 53) scale(1)"/><path d="M0-3l.9 2 2.1.2-1.6 1.4.5 2.1L0 1.6-1.9 2.7l.5-2.1L-3-.8l2.1-.2z" fill="#ffd54a" transform="translate(32 43) scale(0.8)"/><path d="M0-3l.9 2 2.1.2-1.6 1.4.5 2.1L0 1.6-1.9 2.7l.5-2.1L-3-.8l2.1-.2z" fill="#ffd54a" transform="translate(49 44) scale(0.8)"/><rect x="38.5" y="29" width="3" height="13" rx="1" fill="#ffe8a0"/><path d="M40 21c2.4 3 2.4 5.4 0 6.8-2.4-1.4-2.4-3.8 0-6.8z" fill="#ff9a3c"/>`,
    }[id] || "";
    return `<svg viewBox="0 0 80 80" width="${size}" height="${size}" aria-hidden="true">${art}</svg>`;
  }
  const SKILL_BG = { barista: "#ffe2cf", pastry: "#ffe0ee", service: "#d9f6ec" };
  function faceSvg(st, size = 64) {
    const u = "cff" + ++svgUid, hair = st.hair, skin = st.skin;
    const back = st.style === "long" ? `<path d="M16 34c0-14 7-22 16-22s16 8 16 22v20H16z" fill="${hair}"/>` : "";
    const bun = st.style === "bun" ? `<circle cx="32" cy="12" r="6.5" fill="${hair}"/>` : "";
    return `<svg viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true"><defs><clipPath id="${u}"><circle cx="32" cy="32" r="32"/></clipPath></defs>
      <circle cx="32" cy="32" r="32" fill="${SKILL_BG[st.skill] || "#ffe7da"}"/><g clip-path="url(#${u})">${back}
      <path d="M9 66c1-13 10-18 23-18s22 5 23 18z" fill="${st.shirt}"/><path d="M24.5 50h15l-1.6 16H26.1z" fill="#fffaf3"/>
      <rect x="28" y="41" width="8" height="9" rx="3.5" fill="${skin}"/>
      <ellipse cx="32" cy="31.5" rx="14.5" ry="14" fill="${skin}"/>${bun}
      <path d="M17.4 31c-.6-10.4 6.2-17 14.6-17s15.2 6.6 14.6 17c-2.6-5-7.6-7.8-14-7.8-3.4 3.6-9 6.2-15.2 7.8z" fill="${hair}"/>
      <ellipse cx="26.6" cy="33.2" rx="1.9" ry="2.4" fill="#2a1d16"/><ellipse cx="37.4" cy="33.2" rx="1.9" ry="2.4" fill="#2a1d16"/>
      <circle cx="27.2" cy="32.4" r=".7" fill="#fff"/><circle cx="38" cy="32.4" r=".7" fill="#fff"/>
      <ellipse cx="22.6" cy="37.6" rx="2.6" ry="1.6" fill="#ff8fa3" opacity=".5"/><ellipse cx="41.4" cy="37.6" rx="2.6" ry="1.6" fill="#ff8fa3" opacity=".5"/>
      <path d="M29 39.4q3 2.8 6 0" stroke="#7a3b2a" stroke-width="1.6" fill="none" stroke-linecap="round"/></g></svg>`;
  }
  // 흰 글리프(HUD 알약) · 탭 아이콘(두 톤)
  const G = {
    coin: `<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><circle cx="12" cy="12" r="8.2" fill="none" stroke="#fff" stroke-width="2.2"/><path d="M8.4 9l1.7 6 1.9-4.4 1.9 4.4 1.7-6" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    up: `<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="M4 17l5.5-5.5 3.5 3.5L20 8" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 8h5v5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    guest: `<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><circle cx="12" cy="8.5" r="4" fill="#fff"/><path d="M4.5 20c.6-4.4 3.6-6.6 7.5-6.6s6.9 2.2 7.5 6.6z" fill="#fff"/></svg>`,
    mat: `<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z" fill="#fff"/><circle cx="19" cy="18.5" r="1.8" fill="#fff"/></svg>`,
    hammer: `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M14.5 3.5l6 6-2.4 2.4-1.6-1.6-7.6 7.6a2 2 0 0 1-2.8-2.8l7.6-7.6-1.6-1.6z" fill="currentColor"/></svg>`,
    sun: `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><circle cx="12" cy="12" r="4.4" fill="#ffd23f"/><g stroke="#ffd23f" stroke-width="2" stroke-linecap="round"><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3L7 7M17 17l1.7 1.7M5.3 18.7L7 17M17 7l1.7-1.7"/></g></svg>`,
    moon: `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z" fill="#ffe7a3"/></svg>`,
    plus: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`,
    move: `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M3 12h18"/><path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/></g></svg>`,
    lock: `<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="currentColor"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>`,
  };
  const TABG = {
    fac: `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M3 20.5h18" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".45"/><path d="M14.5 3l6.5 6.5-2.6 2.6-1.7-1.7-7.9 7.9a2.1 2.1 0 0 1-3-3l7.9-7.9-1.7-1.7z" fill="currentColor"/></svg>`,
    menu: `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M8 3.5c-1 1.2 1 2 0 3.2M12 3.5c-1 1.2 1 2 0 3.2" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" opacity=".5"/><path d="M17 10.5h1.4a2.6 2.6 0 0 1 0 5.2H17" stroke="currentColor" stroke-width="2" fill="none"/><path d="M4 9h13v5a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6z" fill="currentColor"/></svg>`,
    staff: `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M3.5 21c.6-4.6 3.9-7 8.5-7s7.9 2.4 8.5 7z" fill="currentColor" opacity=".5"/><circle cx="12" cy="8.2" r="4.6" fill="currentColor"/></svg>`,
    deco: `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M12 13v8M12 17c-2-2.4-4.6-2.6-6-2 .6 2.2 3 3.4 6 2z" stroke="currentColor" stroke-width="1.8" fill="currentColor" opacity=".5" stroke-linecap="round"/><g fill="currentColor"><circle cx="12" cy="5.2" r="2.8"/><circle cx="15.8" cy="8" r="2.8"/><circle cx="14.4" cy="12.2" r="2.8"/><circle cx="9.6" cy="12.2" r="2.8"/><circle cx="8.2" cy="8" r="2.8"/></g><circle cx="12" cy="9" r="2" fill="#fff"/></svg>`,
    orders: `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M5 4a1.5 1.5 0 0 1 1.5-1.5h11A1.5 1.5 0 0 1 19 4v17l-2.3-1.5-2.4 1.5-2.3-1.5-2.3 1.5-2.4-1.5L5 21z" fill="currentColor"/><path d="M8.6 7.5h6.8M8.6 11h6.8M8.6 14.5h4" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  };

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
    { id: "fac", name: "시설" }, { id: "menu", name: "메뉴" }, { id: "staff", name: "알바" },
    { id: "deco", name: "꾸미기" }, { id: "orders", name: "주문" },
  ];
  const CAT_ICON = { coffee: "coffee", dessert: "cake-slice", tea: "leaf" };
  const LIMIT_TEXT = {
    demand: { title: "손님이 더 오면 좋겠어요", body: "화분 · 조명과 꾸미기로 평판을 올리거나, 인기 있는 메뉴를 진열해 보세요.", chip: "손님이 더 오면 좋겠어요", icon: "footprints" },
    seat: { title: "자리가 모자라 손님이 돌아가요", body: "좌석을 늘리면 바로 손님이 늘어요.", chip: "자리가 모자라요", icon: "armchair" },
    service: { title: "주문이 밀려 있어요", body: "계산대를 올리거나 알바생을 뽑으면 더 빨리 받아요.", chip: "주문이 밀려요", icon: "hand-coins" },
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
    MENU.filter((m) => m.g === g).forEach((m) => out.push({ icon: CAT_ICON[m.cat], text: `새 메뉴 「${m.name}」`, drink: m.id }));
    FAC.filter((f) => f.g === g && g > 1).forEach((f) => out.push({ icon: f.icon, text: `새 시설 「${f.name}」` }));
    if (facCapAt(g) > facCapAt(g - 1)) out.push({ icon: "arrow-up-circle", text: `시설을 Lv ${facCapAt(g)}까지 올릴 수 있어요` });
    DECO.filter((d) => d.g === g).forEach((d) => out.push({ icon: "flower-2", text: `꾸미기 「${d.name}」` }));
    STAFF_SLOTS.forEach((x, i) => { if (x.g === g) out.push({ icon: "user-plus", text: `알바 자리 ${i + 1}번째` }); });
    SPOTS.forEach((sp, i) => { if (sp.g === g && g > 1) out.push({ icon: "map-pin", text: `꾸미기 자리 ${i + 1}번 「${sp.name}」` }); });
    if (menuSlotsAt(g) > menuSlotsAt(g - 1)) out.push({ icon: "layout-grid", text: `진열 칸 ${menuSlotsAt(g)}칸` });
    if (buildSlotsAt(g) > buildSlotsAt(g - 1)) out.push({ icon: "hammer", text: `공사를 ${buildSlotsAt(g)}곳 동시에` });
    return out;
  }
  const CONFETTI = ["#ff7a45", "#ffc83d", "#3cc9a5", "#ff8fb1", "#8fd3ff", "#fff3e2"];

  function mount(root) {
    root.classList.add("mgx", "mgx-shell", "cf");
    const topBar = (withActions) => `<div class="mgx-top cf-top">
        <a class="mgx-top__back" href="/manage" aria-label="매니지먼트 모음으로">${ic("chevron-left", 18)}<span class="mgx-top__backtxt">매니지먼트</span></a>
        <div class="mgx-top__title"><span class="cf-logo" aria-hidden="true">${drinkSvg("latte", 26)}</span><span class="cf-top__name">옥상 쉼터 카페</span><span class="mgx-chip cf-top__chip" id="cf-gchip" hidden></span></div>
        ${withActions ? `<div class="mgx-top__actions">
          <button type="button" class="mgx-icon cf-music" data-act="music" id="cf-music"></button>
          <button type="button" class="mgx-icon" data-act="help" aria-label="도움말">${ic("circle-help", 20)}</button>
          <button type="button" class="mgx-icon" data-act="more" aria-label="더보기" aria-haspopup="menu">${ic("ellipsis", 20)}</button>
        </div>` : ""}
      </div>`;
    root.innerHTML = topBar(false) + `<div class="cf-loading"><span class="hk-spin"></span></div>`;
    HKUI.refreshIcons(root);
    let store = null, S = null, scene = null, tab = "fac", sig = "", lastSave = 0, modalOpen = 0, cashLock = 0, hudH = 0, spotSig = "";
    let moving = false, moveSrc = -1; // 재배치 모드 · 고른 자리(-1 = 아직 안 고름)
    let liveLog = newLog();
    const thumbs = {};
    const $ = (id) => root.querySelector("#" + id);
    // 배경음악 「옥상 쉼터 라운지」(mgmt-music.js) — 머리의 음표 단추로 켜고 끈다. 아케이드 공통 소리 설정을 따른다
    const music = window.HKMgmtMusic ? HKMgmtMusic.create("cafe") : null;
    function paintMusic() {
      const b = $("cf-music"); if (!b) return;
      if (!music) { b.hidden = true; return; }
      const on = music.isOn(), label = on ? "배경음악 끄기" : "배경음악 켜기";
      b.innerHTML = ic(on ? "music" : "volume-x", 20);
      b.setAttribute("aria-label", label); b.title = label; b.setAttribute("aria-pressed", String(on));
      b.classList.toggle("is-off", !on);
      HKUI.refreshIcons(b);
    }
    if (music) music.onChange(paintMusic);

    const fresh = (st) => { // 예전 · 빠진 칸 채우기
      const b = blank(st && st.t ? st.t : Date.now());
      if (!st || st.v !== 1) return b;
      for (const k of Object.keys(b)) if (st[k] === undefined) st[k] = b[k];
      st.fac = { ...b.fac, ...st.fac };
      st.deco = { owned: st.deco.owned || [], place: SPOTS.map((_, i) => (st.deco.place || [])[i] || null) };
      st.orders = st.orders && Array.isArray(st.orders.list) ? st.orders : b.orders;
      return st;
    };
    const closed = (opens) => { root.innerHTML = topBar(false) + `<div class="cf-closed">${HKMgmt.closedHtml(opens, "옥상 쉼터 카페")}</div>`; HKUI.refreshIcons(root); };

    HKMgmt.open("cafe", {
      blank: () => blank(Date.now()),
      onStale: (st) => { S = fresh(st); store.state = S; sig = ""; HKUI.toast("다른 창에서 바꾼 내용으로 다시 불러왔어요", "info"); renderAll(); if (moving) paintMove(); },
      onClosed: (opens) => { if (scene) scene.destroy(); closed(opens); },
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
      if (e && e.closed) { closed(e.opensAt); return; }
      root.innerHTML = topBar(false) + `<div class="cf-closed"><div class="hk-mg-closed"><b>카페를 불러오지 못했어요</b><p>${esc((e && e.message) || "잠시 뒤 다시 들어와 주세요.")}</p><button class="hk-btn hk-btn--secondary" onclick="location.reload()">다시 불러오기</button></div></div>`;
      HKUI.refreshIcons(root);
    });

    function info() {
      if (!S) return { now: Date.now(), served: 0, full: false };
      const r = rates(S);
      return { now: store.now(), served: r.served, full: S.pending >= capOf(r) - 1, price: r.avgPrice };
    }

    function build() {
      root.innerHTML = topBar(true) + `
        <div class="cf-main">
          <div class="cf-stagecol">
            <div class="mgx-stage cf-stage" id="cf-stage">
              <canvas id="cf-canvas" role="img" aria-label="옥상 카페 장면 — 물건을 누르면 그 시설로 가요"></canvas>
              <div class="mgx-hud cf-hud" id="cf-hud">
                <div class="mgx-pill cf-pill" id="cf-p-cash" style="--pill:#f5a524"><span class="mgx-pill__ic">${G.coin}</span><b id="cf-cash">0원</b></div>
                <button type="button" class="mgx-pill cf-pill" data-tab="fac" style="--pill:#ff7a45" aria-label="시간당 수입"><span class="mgx-pill__ic">${G.up}</span><b id="cf-ph">0원</b><small>/시간</small></button>
                <button type="button" class="mgx-pill cf-pill" data-tab="fac" style="--pill:#2bb39a" aria-label="시간당 손님"><span class="mgx-pill__ic">${G.guest}</span><b id="cf-guest">0명</b><small>/시간</small></button>
                <button type="button" class="mgx-pill cf-pill" data-tab="deco" style="--pill:#b77cf0" aria-label="꾸미기 재료"><span class="mgx-pill__ic">${G.mat}</span><b id="cf-mat">0</b></button>
                <button type="button" class="mgx-pill cf-gpill" data-act="grade" aria-label="카페 등급">
                  <svg viewBox="0 0 34 34" width="32" height="32" aria-hidden="true"><circle cx="17" cy="17" r="13.5" fill="#fff4ea" stroke="#ffe0cf" stroke-width="4"/><circle id="cf-gring" cx="17" cy="17" r="13.5" fill="none" stroke="#ff7a45" stroke-width="4" stroke-linecap="round" stroke-dasharray="0 85" transform="rotate(-90 17 17)"/><text id="cf-gnum" x="17" y="21.5" text-anchor="middle" font-size="13" font-weight="900" fill="#d9541f">1</text></svg>
                  <span class="cf-gpill__t"><small>카페 등급</small><b id="cf-gpct">0%</b></span>
                </button>
              </div>
              <button type="button" class="mgx-ready cf-ready" id="cf-ready" data-act="collect" hidden><span>${G.coin}</span><b id="cf-ready-n">0원</b></button>
              <div class="cf-tags" id="cf-tags"></div>
              <div class="cf-spots-layer" id="cf-spots"></div>
              <div class="mgx-pill is-dark cf-clock" id="cf-clock"></div>
              <button type="button" class="cf-limit" id="cf-limit" data-act="limit"></button>
              <button type="button" class="mgx-movebtn cf-movebtn" id="cf-movebtn" data-act="move" aria-pressed="false">${G.move}<span>재배치</span></button>
              <div class="mgx-movebar cf-movebar" id="cf-movebar" role="status" aria-live="polite" hidden></div>
            </div>
          </div>
          <div class="cf-side">
            <div class="mgx-card cf-status" id="cf-status">
              <div class="cf-inc">
                <div class="cf-inc__body">
                  <div class="cf-k">쌓인 수입</div>
                  <div class="cf-inc__num" id="cf-pending">0원</div>
                </div>
                <button type="button" class="mgx-btn is-gold cf-inc__btn" data-act="collect" id="cf-collect">${ic("hand-coins", 18)}<span>받기</span></button>
              </div>
              <div class="mgx-bar cf-inc__bar"><i id="cf-pbar"></i></div>
              <div class="cf-mini" id="cf-psub"></div>
              <div class="cf-gr" id="cf-gr"></div>
              <div id="cf-builds"></div>
            </div>
            <div id="cf-done"></div>
            <div class="cf-panel" id="cf-panel"></div>
            <div class="mgx-dock cf-dock" role="tablist">${TABS.map((t) => `<button type="button" role="tab" class="mgx-tab" data-tab="${t.id}">${TABG[t.id]}<span>${t.name}</span><b class="mgx-dot" id="cf-dot-${t.id}" hidden></b></button>`).join("")}</div>
          </div>
        </div>`;
      root.addEventListener("click", onClick);
      scene = makeScene($("cf-canvas"), () => S, {
        info,
        hudSpace: () => { const h = $("cf-hud"); return h ? h.offsetTop + h.offsetHeight + 4 : 0; },
        onLayout: () => { spotSig = ""; placeOverlays(); },
        onPick: (id) => { if (!moving) goFac(id); },
      });
      hudH = $("cf-hud").offsetHeight;
      sig = "";
      renderAll();
      paintMusic();
    }

    // ── 그리기 ──
    function renderAll() { if (!$("cf-panel")) return; renderLive(); renderPanel(); HKUI.refreshIcons(root); }
    function gradeProg() {
      if (S.grade >= MAX_GRADE) return 1;
      const q = GRADE_REQ[S.grade];
      return Math.min(S.sales / q.sales, facSum(S) / q.fac, 1);
    }
    function renderLive() {
      const r = rates(S), cap = capOf(r), full = S.pending >= cap - 1;
      // 위 막대 · HUD
      const chip = $("cf-gchip"); chip.hidden = false; chip.textContent = `등급 ${S.grade}`;
      if (Date.now() > cashLock) $("cf-cash").textContent = won(S.cash);
      $("cf-ph").textContent = won(r.perHour);
      $("cf-guest").textContent = `${num(r.served)}명`;
      $("cf-mat").textContent = num(S.mat);
      const gp = gradeProg();
      $("cf-gring").setAttribute("stroke-dasharray", `${(gp * 84.8).toFixed(1)} 85`);
      $("cf-gnum").textContent = S.grade;
      $("cf-gpct").textContent = S.grade >= MAX_GRADE ? "완주" : `${Math.floor(gp * 100)}%`;
      const hh2 = $("cf-hud").offsetHeight; if (hh2 !== hudH) { hudH = hh2; scene.relayout(); }
      // 시각 · 막힌 곳
      const h = kstHour(store.now()), hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
      const part = h < 6 ? "새벽" : h < 11 ? "아침" : h < 14 ? "점심" : h < 17.5 ? "오후" : h < 20 ? "저녁" : "밤";
      $("cf-clock").innerHTML = `${h >= 6 && h < 19 ? G.sun : G.moon}<span>${part} ${hh % 12 || 12}:${String(mm).padStart(2, "0")}</span>`;
      const LT = LIMIT_TEXT[r.limit], lim = $("cf-limit");
      if (lim.dataset.k !== r.limit) { lim.dataset.k = r.limit; lim.innerHTML = `${ic(LT.icon, 15)}<span>${LT.chip}</span>`; HKUI.refreshIcons(lim); }
      // 말풍선 · 쌓인 수입
      const rd = $("cf-ready");
      rd.hidden = S.pending < 1;
      rd.classList.toggle("is-full", full);
      $("cf-ready-n").textContent = full ? `가득! ${won(S.pending)}` : won(S.pending);
      $("cf-pending").textContent = won(S.pending);
      const pb = $("cf-pbar"); pb.style.setProperty("--v", pct(S.pending, cap) + "%"); pb.parentElement.classList.toggle("is-full", full);
      $("cf-psub").innerHTML = full ? `<b class="cf-warn">가득 찼어요</b> · 받으면 다시 장사해요 (최대 ${CAP_HOURS}시간치 ${won(cap)})`
        : `자리 비운 동안에도 최대 ${CAP_HOURS}시간치(${won(cap)})까지 쌓여요${r.perHour > 0 ? ` · 가득 차기까지 ${dur((cap - S.pending) / r.perHour * 3600)}` : ""}`;
      $("cf-collect").disabled = S.pending < 1;
      // 등급
      const q = GRADE_REQ[S.grade];
      $("cf-gr").innerHTML = S.grade >= MAX_GRADE
        ? `<div class="cf-gr__head"><b>카페 등급 ${S.grade}</b><span class="mgx-chip is-gold">1차 완주</span></div><div class="cf-mini">누적 매출 ${won(S.sales)} · 맞이한 손님 ${num(S.served)}명</div>`
        : `<div class="cf-gr__head"><b>등급 ${S.grade} → ${S.grade + 1}</b><span class="cf-mini">둘 다 채우면 올라요</span></div>
          <div class="cf-req"><span>누적 매출</span><div class="mgx-bar" style="--bar:#ff7a45"><i style="--v:${pct(S.sales, q.sales)}%"></i></div><em>${won(Math.min(S.sales, q.sales))} / ${won(q.sales)}</em></div>
          <div class="cf-req"><span>시설 레벨 합</span><div class="mgx-bar" style="--bar:#3cc9a5"><i style="--v:${pct(facSum(S), q.fac)}%"></i></div><em>${facSum(S)} / ${q.fac}</em></div>`;
      // 공사
      const nb = buildSlotsAt(S.grade);
      $("cf-builds").innerHTML = S.builds.length ? `<div class="cf-builds"><div class="cf-k">${G.hammer} 공사 중 ${S.builds.length} / ${nb}</div>${S.builds.map((b) => {
        const left = Math.max(0, (b.end - store.now()) / 1000), tot = (b.end - b.start) / 1000;
        return `<div class="cf-req"><span>${esc(FAC_BY[b.id].name)} Lv ${b.to}</span><div class="mgx-bar" style="--bar:#ffb020"><i style="--v:${pct(tot - left, tot)}%"></i></div><em>${dur(left)} 남음</em></div>`;
      }).join("")}</div>` : "";
      // 장면 위 공사 표시
      $("cf-tags").innerHTML = S.builds.map((b) => {
        const [gx, gy, z] = ANCH[b.id], [x, y] = scene.toCss(gx, gy, z), left = Math.max(0, (b.end - store.now()) / 1000), tot = (b.end - b.start) / 1000;
        return `<div class="cf-btag" style="left:${x.toFixed(0)}px;top:${y.toFixed(0)}px;--v:${pct(tot - left, tot)}%">${G.hammer}<span>${dur(left)}</span></div>`;
      }).join("");
      const doneHtml = S.done1 ? `<button type="button" class="mgx-card cf-donecard" data-act="done">${ic("award", 24)}<div><b>1차 완주했어요!</b><span>다음 업데이트 안내 보기</span></div>${ic("chevron-right", 18)}</button>` : "";
      if ($("cf-done").dataset.v !== String(S.done1)) { $("cf-done").dataset.v = String(S.done1); $("cf-done").innerHTML = doneHtml; HKUI.refreshIcons($("cf-done")); }
      // 탭 점
      const ordersReady = S.orders.list.filter((o) => !o.claimed && orderDone(o)).length;
      const dO = $("cf-dot-orders"); dO.hidden = !ordersReady; dO.textContent = ordersReady || "";
      const facReady = FAC.filter((f) => !facBlock(S, f.id)).length;
      const dF = $("cf-dot-fac"); dF.hidden = !facReady; dF.textContent = facReady || "";
      root.querySelectorAll(".cf-dock .mgx-tab").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === tab));
      placeOverlays();
      liveFields();
      HKUI.refreshIcons($("cf-status"));
    }
    // 장면 위에 얹는 것들 — 말풍선 · 꾸미기 자리 「+」
    function placeOverlays() {
      if (!scene || !S) return;
      const [rx, ry] = scene.toCss(1.75, 5.9, 50); const rd = $("cf-ready"); rd.style.left = rx.toFixed(0) + "px"; rd.style.top = ry.toFixed(0) + "px";
      const hasLoose = S.deco.owned.some((id) => !S.deco.place.includes(id));
      const key = JSON.stringify([tab, S.grade, S.deco.place, hasLoose, moving, moveSrc, Math.round(scene.toCss(0, 0)[0]), Math.round(scene.toCss(10, 10)[1])]);
      if (key === spotSig) return;
      spotSig = key;
      if (moving) { $("cf-spots").innerHTML = SPOTS.map(movePin).join(""); return; }
      $("cf-spots").innerHTML = SPOTS.map((sp, i) => {
        const open = S.grade >= sp.g, id = S.deco.place[i];
        if (!open) return "";
        if (id && tab !== "deco") return "";
        if (!id && tab !== "deco" && !hasLoose) return "";
        const [x, y] = scene.toCss(SPOT_G[i][0] + (id ? 0.55 : 0), SPOT_G[i][1] + (id ? 0.55 : 0), id ? 0 : 8);
        return `<button type="button" class="cf-spot-pin${id ? " is-filled" : ""}" data-act="spot" data-i="${i}" style="left:${x.toFixed(0)}px;top:${y.toFixed(0)}px" aria-label="${i + 1}번 자리 ${esc(sp.name)}">${id ? `<b>${i + 1}</b>` : G.plus}</button>`;
      }).join("");
    }
    // 재배치 중 핀 — 열린 자리는 모두(물건 있는 곳은 번호, 빈 곳은 「+」), 잠긴 자리는 흐린 자물쇠
    function movePin(sp, i) {
      const open = S.grade >= sp.g, id = S.deco.place[i];
      const [x, y] = scene.toCss(SPOT_G[i][0] + (id ? 0.55 : 0), SPOT_G[i][1] + (id ? 0.55 : 0), id ? 0 : 8);
      const at = `style="left:${x.toFixed(0)}px;top:${y.toFixed(0)}px"`;
      if (!open) return `<button type="button" class="cf-spot-pin is-move is-locked" data-act="spot" data-i="${i}" aria-disabled="true" ${at} aria-label="${i + 1}번 자리 ${esc(sp.name)} · 등급 ${sp.g}에 열려요">${G.lock}</button>`;
      const cls = moveSrc < 0 ? (id ? " is-pickable" : " is-idle") : i === moveSrc ? " is-move-src" : " is-move-ok";
      const what = id ? `「${esc(DECO_BY[id].name)}」` : "비어 있어요";
      return `<button type="button" class="cf-spot-pin is-move${id ? " is-filled" : ""}${cls}" data-act="spot" data-i="${i}" ${at} aria-pressed="${i === moveSrc}" aria-label="${i + 1}번 자리 ${esc(sp.name)} · ${what}">${id ? `<b>${i + 1}</b>` : G.plus}</button>`;
    }
    // 재배치 안내 막대 · 단추 모양
    function paintMove() {
      root.classList.toggle("is-moving", moving);
      const btn = $("cf-movebtn"), bar = $("cf-movebar");
      if (!btn || !bar) return;
      btn.classList.toggle("is-on", moving); btn.setAttribute("aria-pressed", String(moving));
      bar.hidden = !moving;
      if (!moving) { bar.innerHTML = ""; return; }
      if (moveSrc >= 0 && !S.deco.place[moveSrc]) moveSrc = -1;
      const id = moveSrc >= 0 ? S.deco.place[moveSrc] : null;
      bar.innerHTML = id
        ? `<span>「${esc(DECO_BY[id].name)}」${jo(DECO_BY[id].name, "을/를").slice(-1)} 놓을 자리를 눌러요 · 물건이 있으면 서로 바꿔요</span><button type="button" class="is-ghost" data-act="moveCancel">취소</button><button type="button" data-act="moveDone" data-esc-close>다 했어요</button>`
        : `<span>옮길 물건을 눌러요</span><button type="button" data-act="moveDone" data-esc-close>다 했어요</button>`;
    }
    function startMove() {
      if (!S.deco.place.some((id) => id)) { HKUI.toast("옮길 꾸미기 물건이 아직 없어요 · 꾸미기 탭에서 사서 놓아요", "info"); return; }
      const more = document.querySelector(".cf-more"); if (more) more.remove();
      moving = true; moveSrc = -1; spotSig = ""; paintMove(); placeOverlays();
    }
    function endMove() {
      if (!moving) return;
      moving = false; moveSrc = -1; spotSig = ""; paintMove(); placeOverlays();
    }
    function pickMove(i) {
      const sp = SPOTS[i]; if (!sp) return;
      if (moveSrc >= 0 && !S.deco.place[moveSrc]) moveSrc = -1; // 다른 창에서 바뀌었으면 고른 것 풀기
      if (S.grade < sp.g) { HKUI.toast(`${i + 1}번 자리는 등급 ${sp.g}에 열려요`, "info"); return; }
      if (moveSrc < 0) { // 옮길 물건 고르기
        if (!S.deco.place[i]) { HKUI.toast("물건이 있는 자리를 먼저 눌러요", "info"); return; }
        moveSrc = i;
      } else if (i === moveSrc) moveSrc = -1; // 다시 누르면 풀기
      else {
        const a = moveSrc, A = DECO_BY[S.deco.place[a]].name, B = S.deco.place[i] ? DECO_BY[S.deco.place[i]].name : null;
        const res = swapDeco(S, a, i);
        if (!res) return;
        moveSrc = -1;
        HKUI.toast(res === "swap" ? `「${A}」${jo(A, "과/와").slice(-1)} 「${B}」 자리를 바꿨어요` : `「${A}」${jo(A, "을/를").slice(-1)} ${i + 1}번 자리로 옮겼어요`);
        changed(false);
        const [gx, gy] = SPOT_G[i], [x, y] = scene.toCss(gx, gy, 20), r = $("cf-stage").getBoundingClientRect();
        HKFx.confetti({ x: r.left + x, y: r.top + y, n: 18, colors: CONFETTI });
      }
      spotSig = ""; paintMove(); placeOverlays();
    }
    // 패널 안 실시간 글자 — 남은 공사 시간 · 주문 진행 · 알바생 일한 시간
    function liveFields() {
      root.querySelectorAll("[data-live]").forEach((el) => {
        const [k, id] = el.dataset.live.split(":");
        const bar = (v) => el.style.setProperty("--v", v + "%");
        if (k === "build") { const b = S.builds.find((x) => x.id === id); if (b) { const left = Math.max(0, (b.end - store.now()) / 1000), tot = (b.end - b.start) / 1000; if (el.tagName === "I") bar(pct(tot - left, tot)); else el.textContent = `${dur(left)} 남음`; } }
        if (k === "order") { const o = S.orders.list.find((x) => x.id === id); if (o) { if (el.tagName === "I") bar(pct(o.p, o.target)); else el.textContent = orderProg(o); } }
        if (k === "xp") { const st = S.staff.find((x) => x.id === id); if (st) { if (el.tagName === "I") bar(st.lv >= STAFF_MAX ? 100 : pct(st.xp, staffNeed(st.lv))); else el.textContent = st.lv >= STAFF_MAX ? "가장 높은 레벨" : `다음 레벨까지 ${dur((staffNeed(st.lv) - st.xp) * 3600)} 일하기`; } }
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
      const el = $("cf-panel");
      el.innerHTML = tab === "fac" ? panelFac() : tab === "menu" ? panelMenu() : tab === "staff" ? panelStaff() : tab === "deco" ? panelDeco() : panelOrders();
      HKUI.refreshIcons(el);
      liveFields();
    }
    const head = (title, extra = "") => `<div class="cf-phead"><div class="cf-phead__t">${title}</div>${extra}</div>`;
    const coinCost = (n) => `<span class="cf-cost"><i class="cf-coin"></i>${won(n)}</span>`;

    function panelFac() {
      const r = rates(S), L = LIMIT_TEXT[r.limit], mx = Math.max(r.demand, r.seatCap, r.serviceCap, 1);
      const row = (key, label, v, icon) => `<div class="cf-flow__row${r.limit === key ? " is-limit" : ""}"><span class="cf-flow__ic">${ic(icon, 15)}</span><span class="cf-flow__lb">${label}</span><div class="cf-flow__bar"><i style="width:${pct(v, mx)}%"></i></div><b>${num(v)}명</b></div>`;
      return head("시설", `<span class="mgx-chip">공사 ${S.builds.length} / ${buildSlotsAt(S.grade)}곳</span>`) + `<div class="mgx-card cf-hint">
          <div class="cf-hint__head"><span class="cf-hint__ic">${ic("lightbulb", 18)}</span><div><b>${L.title}</b><p>${L.body}</p></div></div>
          <div class="cf-flow">${row("demand", "찾아오는 손님", r.demand, "footprints")}${row("seat", "자리로 받는 손님", r.seatCap, "armchair")}${row("service", "주문 받는 손님", r.serviceCap, "hand-coins")}</div>
          <div class="cf-mini">모두 시간당 · 가장 작은 수만큼 손님을 받아요</div>
        </div>
        <div class="cf-list">${FAC.map((f) => {
          const lv = S.fac[f.id], b = facBlock(S, f.id), building = S.builds.find((x) => x.id === f.id), locked = S.grade < f.g;
          const to = lv + 1, cost = upCost(f.id, Math.min(to, f.max)), t = upTime(Math.min(to, f.max)), cap = facCapAt(S.grade);
          const tk = "f-" + f.id + Math.max(1, lv); thumbs[tk] = thumbs[tk] || facThumb(f.id, lv);
          let foot;
          if (building) foot = `<div class="cf-prog"><div class="mgx-bar" style="--bar:#ffb020"><i data-live="build:${f.id}"></i></div><em data-live="build:${f.id}"></em></div>`;
          else if (b && b.why !== "cash") foot = `<div class="cf-lock">${ic(b.why === "max" ? "check" : "lock", 14)}${esc(b.text)}</div>`;
          else foot = `<button type="button" class="mgx-btn cf-buy" data-act="up" data-id="${f.id}" ${b ? "disabled" : ""}><span>${lv ? `${jo("Lv " + to, "으로/로")} 올리기` : "놓기"}</span><small>${coinCost(cost)}${t ? ` · ${dur(t)}` : " · 바로"}</small></button>${b ? `<div class="cf-mini cf-warn">돈이 모자라요</div>` : ""}`;
          const next = lv < f.max && !locked ? `<div class="cf-next">${ic("arrow-up-right", 13)} ${esc(facEffect(f.id, to))}</div>` : "";
          const pips = Array.from({ length: f.max }, (_, i) => `<i class="${i < lv ? "on" : i >= cap ? "cap" : ""}${building && i === lv ? " build" : ""}"></i>`).join("");
          return `<div class="mgx-card cf-fac${locked ? " is-locked" : ""}${building ? " is-building" : ""}" id="cf-fac-${f.id}">
            <div class="cf-fac__art"><img src="${thumbs[tk]}" alt=""></div>
            <div class="cf-fac__body">
              <div class="cf-fac__head"><b>${esc(f.name)}</b><span class="cf-lv">${lv ? `Lv ${lv}` : "없음"}</span></div>
              <div class="cf-pips" aria-label="레벨 ${lv} / ${f.max}">${pips}</div>
              <div class="cf-fac__now">${esc(facEffect(f.id, lv) || f.desc)}</div>${next}
            </div>
            <div class="cf-fac__foot">${foot}</div></div>`;
        }).join("")}</div>`;
    }

    function panelMenu() {
      const slots = menuSlotsAt(S.grade), r = rates(S);
      const on = S.menu.filter((id) => menuOk(S, MENU_BY[id]));
      const best = bestMenu(S), isBest = best.length === on.length && best.every((x) => on.includes(x));
      return head("메뉴", `<span class="mgx-chip">진열 ${on.length} / ${slots}칸</span>`) + `<div class="mgx-card cf-shelf">
          ${(slots > 4 ? [[0, 3], [3, slots]] : [[0, slots]]).map(([a, z]) => `<div class="cf-shelf__row${slots > 4 ? " is-3" : ""}">${Array.from({ length: z - a }, (_, j) => { const m = MENU_BY[on[a + j]]; return m ? `<div class="cf-slot is-on">${drinkSvg(m.id, 44)}<span>${esc(m.name)}</span></div>` : `<div class="cf-slot">${G.plus}<span>빈 칸</span></div>`; }).join("")}</div>`).join("")}
          ${(() => { const ng = [9, 13, 17].find((g) => g > S.grade); return ng ? `<div class="cf-mini">등급 ${ng}부터 진열 칸이 ${menuSlotsAt(ng)}칸이 돼요</div>` : ""; })()}
          <button type="button" class="mgx-btn is-soft is-sm is-wide" data-act="bestmenu" ${isBest ? "disabled" : ""}>${ic("wand-sparkles", 16)} ${isBest ? "지금이 가장 많이 버는 조합이에요" : "가장 많이 버는 조합으로 진열"}</button>
          <div class="cf-mini">메뉴 매력 ${r.appeal.toFixed(2)} · 손님 한 명이 평균 ${won(r.avgPrice)} 써요. 여러 가지를 진열할수록 손님이 더 와요.</div>
        </div>
        <div class="cf-drinks">${MENU.map((m) => {
          const ok = menuOk(S, m), isOn = on.includes(m.id);
          const facName = FAC_BY[CATS[m.cat].fac].name;
          const lock = S.grade < m.g ? `등급 ${m.g}에 열려요` : `${jo(facName + " Lv " + m.need, "이/가")} 있어야 해요`;
          const stars = Math.round(m.pop * 3) - 1;
          const share = r.items.find((x) => x.id === m.id);
          return `<div class="cf-drink cf-cat-${m.cat}${ok ? "" : " is-locked"}${isOn ? " is-on" : ""}">
            ${isOn ? `<span class="cf-drink__badge">${ic("check", 12)}진열 중</span>` : ""}
            <div class="cf-drink__art">${drinkSvg(m.id, 76)}</div>
            <div class="cf-drink__name">${esc(m.name)}</div>
            <div class="cf-drink__meta"><span class="cf-cost"><i class="cf-coin"></i>${won(ok ? itemPrice(S, m) : m.price)}</span><span>${ic("timer", 12)}${dur(ok ? itemPrep(S, m) : m.prep)}</span></div>
            <div class="cf-stars" aria-label="인기 ${stars}">${"★".repeat(stars)}<i>${"★".repeat(5 - stars)}</i></div>
            <div class="cf-mini cf-drink__sold">${share ? `시간당 ${num(share.perHour)}${CATS[m.cat].unit}쯤 팔려요` : esc(CATS[m.cat].name)}</div>
            ${ok ? `<button type="button" class="mgx-btn is-sm is-wide ${isOn ? "is-white" : ""}" data-act="menu" data-id="${m.id}">${isOn ? "진열 내리기" : "진열하기"}</button>` : `<div class="cf-lock">${ic("lock", 13)}${esc(lock)}</div>`}
          </div>`;
        }).join("")}</div>`;
    }

    function panelStaff() {
      const open = staffSlots(S), n = S.staff.length, slot = STAFF_SLOTS[n];
      const nextG = STAFF_SLOTS.find((x) => x.g > S.grade);
      return head("알바", `<span class="mgx-chip">자리 ${n} / ${open}</span>`) + `<div class="mgx-card cf-crew">
          <div class="cf-crew__slots">${STAFF_SLOTS.map((x, i) => {
            const me = S.staff[i];
            if (me) return `<div class="cf-cslot is-on">${faceSvg(STAFF_BY[me.id], 46)}<small>${esc(STAFF_BY[me.id].name)}</small></div>`;
            if (S.grade >= x.g) return `<div class="cf-cslot is-open"><span>${G.plus}</span><small>빈 자리</small></div>`;
            return `<div class="cf-cslot"><span>${ic("lock", 16)}</span><small>등급 ${x.g}</small></div>`;
          }).join("")}</div>
          <div class="cf-mini">알바생은 일손이 되어 주문을 더 받고, 장기에 따라 효과가 있어요. 장사한 시간만큼 저절로 레벨이 올라요.${nextG ? ` 다음 자리는 등급 ${nextG.g}에 열려요.` : ""}</div>
        </div>
        <div class="cf-list">${STAFF.map((st) => {
          const me = S.staff.find((x) => x.id === st.id);
          let foot;
          if (me) foot = `<div class="cf-prog"><div class="mgx-bar" style="--bar:#3cc9a5"><i data-live="xp:${st.id}"></i></div></div><div class="cf-mini" data-live="xp:${st.id}"></div><div class="cf-fac__now">지금 효과: ${esc(staffEffect(st.skill, me.lv))}</div>`;
          else if (!slot) foot = `<div class="cf-lock">${ic("lock", 14)}알바 자리가 모두 찼어요</div>`;
          else if (S.grade < slot.g) foot = `<div class="cf-lock">${ic("lock", 14)}등급 ${slot.g}에 ${n + 1}번째 자리가 열려요</div>`;
          else foot = `<button type="button" class="mgx-btn cf-buy" data-act="hire" data-id="${st.id}" ${S.cash >= slot.cost ? "" : "disabled"}><span>함께 일하기</span><small>${coinCost(slot.cost)}</small></button>${S.cash < slot.cost ? `<div class="cf-mini cf-warn">돈이 모자라요</div>` : ""}`;
          return `<div class="mgx-card cf-staff cf-sk-${st.skill}${me ? " is-on" : ""}">
            <div class="cf-staff__face">${faceSvg(st, 72)}${me ? `<span class="cf-staff__lv">Lv ${me.lv}</span>` : ""}</div>
            <div class="cf-fac__body">
              <div class="cf-fac__head"><b>${esc(st.name)}</b><span class="mgx-chip cf-skill">${esc(st.skillName)}</span></div>
              <div class="cf-fac__now">${esc(st.desc)}</div>
              <div class="cf-mini">레벨마다 ${esc(staffEffect(st.skill, 1))}</div>
            </div>
            <div class="cf-fac__foot">${foot}</div></div>`;
        }).join("")}</div>`;
    }

    function panelDeco() {
      return head("꾸미기", `<span class="mgx-chip is-gold">평판 +${decoRep(S)}</span>`) + `<div class="mgx-card cf-decohead">
          <div class="cf-mini">꾸미기 물건을 사서 옥상 자리에 놓으면 평판이 올라요. 재료 <b>${num(S.mat)}개</b> — 재료는 오늘의 주문으로 받아요. 장면 속 「+」를 눌러도 놓을 수 있어요.</div>
          <div class="cf-spots">${SPOTS.map((sp, i) => {
            const id = S.deco.place[i], open = S.grade >= sp.g;
            return `<button type="button" class="cf-spot${id ? " is-filled" : ""}" data-act="spot" data-i="${i}" ${open ? "" : "disabled"}>
              <span class="cf-spot__no">${open ? i + 1 : ic("lock", 11)}</span><span class="cf-spot__txt"><b>${esc(sp.name)}</b><small>${open ? (id ? esc(DECO_BY[id].name) : "비어 있어요") : `등급 ${sp.g}에 열려요`}</small></span></button>`;
          }).join("")}</div>
        </div>
        <div class="cf-decos">${DECO.map((d) => {
          thumbs["d-" + d.id] = thumbs["d-" + d.id] || decoThumb(d.id);
          const own = S.deco.owned.includes(d.id), placed = S.deco.place.indexOf(d.id);
          const ok = S.cash >= d.cost && S.mat >= d.mat;
          let foot;
          if (own) foot = `<div class="cf-owned">${ic(placed >= 0 ? "map-pin" : "package", 13)} ${placed >= 0 ? `${placed + 1}번 자리에 있어요` : "가지고 있어요 · 자리를 골라요"}</div>`;
          else if (S.grade < d.g) foot = `<div class="cf-lock">${ic("lock", 13)}등급 ${d.g}에 열려요</div>`;
          else foot = `<button type="button" class="mgx-btn is-sm is-wide cf-buy" data-act="deco" data-id="${d.id}" ${ok ? "" : "disabled"}><span>사기</span><small>${coinCost(d.cost)} · 재료 ${d.mat}</small></button>${ok ? "" : `<div class="cf-mini cf-warn">${S.mat < d.mat ? "재료가" : "돈이"} 모자라요</div>`}`;
          return `<div class="cf-deco${own ? " is-on" : ""}${S.grade < d.g ? " is-locked" : ""}">
            <img src="${thumbs["d-" + d.id]}" alt="">
            <div class="cf-deco__name">${esc(d.name)}</div><span class="mgx-chip is-gold">평판 +${d.rep}</span>${foot}</div>`;
        }).join("")}</div>`;
    }

    function panelOrders() {
      const list = S.orders.list.filter((o) => !o.claimed).sort((a, b) => (orderDone(b) ? 1 : 0) - (orderDone(a) ? 1 : 0));
      const now = store.now(), midnight = Date.parse(dayKey(now) + "T00:00:00+09:00") + 86400000;
      return head("오늘의 주문", `<span class="mgx-chip">${ic("clock", 12)} 새 주문까지 ${dur((midnight - now) / 1000)}</span>`) + `<div class="cf-mini cf-pnote">하루 3개씩 와요. 못 한 주문은 3일치(9개)까지 쌓여 있으니 천천히 해도 괜찮아요.</div>
        ${list.length ? `<div class="cf-list cf-coupons">${list.map((o) => {
          const done = orderDone(o);
          const icon = done ? "check" : o.kind === "keep" ? "clock" : o.kind === "upgrade" ? "hammer" : o.kind === "collect" ? "hand-coins" : o.kind === "earn" ? "coins" : o.kind === "serve" ? "users" : CAT_ICON[o.cat || (MENU_BY[o.item] || {}).cat] || "coffee";
          return `<div class="cf-coupon${done ? " is-done" : ""}">
            <div class="cf-coupon__stub"><span class="cf-coupon__ic">${ic(icon, 22)}</span><b>${won(o.cash)}</b><small>재료 ${o.mat}개</small></div>
            <div class="cf-coupon__body">
              <b class="cf-coupon__t">${esc(orderText(o))}</b>
              <div class="mgx-bar${done ? " is-full" : ""}" style="--bar:#ff7a45"><i data-live="order:${o.id}"></i></div>
              <div class="cf-coupon__row"><em data-live="order:${o.id}"></em>${done ? `<button type="button" class="mgx-btn is-gold is-sm" data-act="claim" data-id="${o.id}">${ic("gift", 15)}보상 받기</button>` : ""}</div>
            </div></div>`;
        }).join("")}</div>` : `<div class="mgx-card cf-empty">${ic("party-popper", 30)}<b>오늘 주문을 모두 마쳤어요</b><span>내일 새 주문이 와요</span></div>`}`;
    }

    // ── 행동 ──
    function changed(big) { sig = ""; summary(S); if (big) store.saveNow(); else store.dirty(); renderAll(); scene && scene.redraw(); }
    function setTab(t, scroll) {
      endMove();
      tab = t; sig = ""; renderAll();
      if (scroll !== false && innerWidth < 960) { const p = $("cf-panel"); const y = p.getBoundingClientRect().top; if (y > innerHeight * 0.62) scrollTo({ top: scrollY + y - 70, behavior: "smooth" }); } // 아래로만 — 위로는 올리지 않는다
    }
    function goFac(id) {
      setTab("fac", false);
      const el = $("cf-fac-" + id);
      if (!el) return;
      const r = el.getBoundingClientRect(); // 아래에 가려 있을 때만 내려서 보여 준다(위로는 올리지 않는다)
      if (r.bottom > innerHeight - 20) scrollTo({ top: scrollY + r.top - innerHeight / 2 + r.height / 2, behavior: "smooth" });
      el.classList.remove("is-flash"); void el.offsetWidth; el.classList.add("is-flash");
    }
    function payFx(btn, cost) { if (btn && cost) HKFx.float(btn, "-" + won(cost), { color: "#e5484d" }); HKFx.bump($("cf-p-cash")); }
    function doCollect(from) {
      const before = S.cash, n = collect(S);
      if (!n) return 0;
      cashLock = Date.now() + 2000;
      const pill = $("cf-p-cash");
      HKFx.float(from || pill, "+" + won(n), { color: "#e8890c" });
      HKFx.fly(from || pill, pill, { n: Math.min(10, 4 + Math.floor(Math.log10(n + 1))), done: () => { HKFx.count($("cf-cash"), before, S.cash, { fmt: won, ms: 700 }); setTimeout(() => { cashLock = 0; }, 720); } });
      changed(true);
      return n;
    }
    async function onClick(e) {
      if (moving) { // 재배치 중 — 장면 위에선 핀 · 안내 막대 · 재배치 단추만, 장면 밖을 누르면 모드를 끄고 원래대로
        const st = $("cf-stage"), mb = e.target.closest("[data-act]");
        if (st && st.contains(e.target)) {
          if (!mb || !st.contains(mb)) return;
          const a = mb.dataset.act;
          if (a === "spot") pickMove(+mb.dataset.i);
          else if (a === "moveCancel") { moveSrc = -1; spotSig = ""; paintMove(); placeOverlays(); }
          else if (a === "moveDone" || a === "move") endMove();
          return;
        }
        endMove();
      }
      const tb = e.target.closest("[data-tab]");
      if (tb && root.contains(tb)) { setTab(tb.dataset.tab); return; }
      const b = e.target.closest("[data-act]");
      if (!b || b.disabled || !root.contains(b)) return;
      const act = b.dataset.act, id = b.dataset.id;
      if (act === "move") { startMove(); return; }
      advance(S, store.now(), liveLog);
      if (act === "collect") {
        const n = doCollect(b);
        if (n) HKUI.toast(`${jo(won(n), "을/를")} 받았어요`);
      } else if (act === "up") {
        const f = FAC_BY[id], lv = S.fac[id], cost = upCost(id, lv + 1);
        if (startUpgrade(S, id, store.now())) {
          const t = upTime(lv + 1);
          payFx(b, cost);
          HKUI.toast(t ? `${f.name} 공사를 시작했어요 · ${dur(t)}` : lv ? `${jo(f.name, "이/가")} ${jo("Lv " + (lv + 1), "이/가")} 됐어요` : `${jo(f.name, "을/를")} 놓았어요`);
          const before = S.grade; checkGrade(S, liveLog); if (S.grade > before) flushGrades();
          changed(true);
          const card = $("cf-fac-" + id); if (card) HKFx.bump(card.querySelector(".cf-fac__art"));
        }
      } else if (act === "menu") {
        const res = toggleMenu(S, id);
        if (res === "full") HKUI.toast("진열 칸이 가득 찼어요. 하나를 먼저 내려 주세요", "info");
        else { changed(false); if (res === "on") HKFx.bump(root.querySelector(".cf-shelf") || root.querySelector(".cf-shelf__row")); }
      } else if (act === "bestmenu") { S.menu = bestMenu(S); HKUI.toast("가장 많이 버는 조합으로 진열했어요"); changed(false); HKFx.bump(root.querySelector(".cf-shelf") || root.querySelector(".cf-shelf__row")); }
      else if (act === "hire") {
        const st = STAFF_BY[id], cost = (STAFF_SLOTS[S.staff.length] || {}).cost;
        if (hire(S, id)) { payFx(b, cost); HKUI.toast(`${jo(st.name, "이/가")} 함께 일하게 됐어요`); changed(true); HKFx.confetti({ ...pt(b), n: 30, colors: CONFETTI }); }
      } else if (act === "deco") {
        const d = DECO_BY[id];
        if (buyDeco(S, id)) { payFx(b, d.cost); window.HKMgmtTop && HKMgmtTop(); const at = S.deco.place.indexOf(id); HKUI.toast(at >= 0 ? `${jo(d.name, "을/를")} ${at + 1}번 자리에 놓았어요` : `${jo(d.name, "을/를")} 샀어요 · 자리를 골라 놓아요`); changed(true); }
      } else if (act === "spot") openSpot(+b.dataset.i);
      else if (act === "claim") {
        const o = claimOrder(S, id);
        if (o) {
          const before = S.cash - o.cash; cashLock = Date.now() + 2000;
          HKFx.float(b, `+${won(o.cash)} · 재료 ${o.mat}`, { color: "#e8890c" });
          HKFx.fly(b, $("cf-p-cash"), { n: 6, done: () => { HKFx.count($("cf-cash"), before, S.cash, { fmt: won }); setTimeout(() => { cashLock = 0; }, 650); } });
          HKFx.bump($("cf-mat").parentElement);
          HKUI.toast(`보상 ${won(o.cash)} · 재료 ${o.mat}개를 받았어요`); changed(true);
        }
      } else if (act === "music") { if (music) music.toggle(); }
      else if (act === "help") showHelp();
      else if (act === "more") toggleMore(b);
      else if (act === "grade") showGradeInfo();
      else if (act === "limit") { const k = rates(S).limit; if (k === "seat") goFac("seat"); else if (k === "service") goFac("counter"); else if (S.grade >= FAC_BY.plant.g) goFac("plant"); else setTab("menu"); }
      else if (act === "done") showDone();
    }
    const pt = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };

    // 더보기(처음 안내 · 처음부터 다시)
    function toggleMore(btn) {
      const was = document.querySelector(".cf-more");
      if (was) { was.remove(); return; }
      const r = btn.getBoundingClientRect();
      const m = document.createElement("div");
      m.className = "mgx cf cf-more"; m.setAttribute("role", "menu"); m.setAttribute("data-esc-close", "");
      m.style.top = (r.bottom + 6) + "px"; m.style.right = Math.max(8, innerWidth - r.right) + "px";
      m.innerHTML = `<button type="button" role="menuitem" data-more="tut">${ic("book-open", 17)}처음 안내 다시 보기</button><button type="button" role="menuitem" class="is-danger" data-more="reset">${ic("rotate-ccw", 17)}처음부터 다시</button>`;
      document.body.appendChild(m); HKUI.refreshIcons(m);
      const off = (e) => { if (!m.contains(e.target) && e.target !== btn && !btn.contains(e.target)) { m.remove(); document.removeEventListener("pointerdown", off, true); } };
      document.addEventListener("pointerdown", off, true);
      m.addEventListener("click", (e) => {
        if (e.target === m) { m.remove(); return; } // Esc
        const it = e.target.closest("[data-more]"); if (!it) return;
        m.remove(); document.removeEventListener("pointerdown", off, true);
        if (it.dataset.more === "tut") showTutorial(); else doReset();
      });
    }

    async function doReset() {
      const a = await HKUI.confirmDialog("처음부터 다시 할까요?", "카페 등급 · 시설 · 메뉴 · 알바생 · 꾸미기가 모두 사라지고 등급 1부터 새로 시작해요.", { confirmLabel: "처음부터 다시", confirmVariant: "danger" });
      if (!a) return;
      const b2 = await HKUI.confirmDialog("정말 지울까요?", "<b>지운 카페는 되돌릴 수 없어요.</b> 그래도 처음부터 다시 할까요?", { confirmLabel: "네, 모두 지울게요", confirmVariant: "danger" });
      if (!b2) return;
      try {
        await store.reset();
        S = store.state = blank(store.now()); advance(S, store.now()); await store.saveNow();
        liveLog = newLog(); tab = "fac"; sig = ""; spotSig = ""; moving = false; moveSrc = -1; root.classList.remove("is-moving");
        if (scene) scene.destroy();
        root.removeEventListener("click", onClick);
        build(); showTutorial();
      } catch (e) { HKUI.toast((e && e.message) || "지우지 못했어요", "danger"); }
    }

    // ── 1초마다 ──
    function tick() {
      if (!S || !$("cf-panel")) return;
      const now = store.now(), gap = now - S.t;
      if (gap > 60000 && !modalOpen) { // 화면을 오래 숨겨 두었다 돌아옴
        const log = newLog(); advance(S, now, log); store.dirty(); sig = ""; renderAll(); showAway(gap, log); return;
      }
      advance(S, now, liveLog);
      if (liveLog.builds.length) { liveLog.builds.forEach((b) => { HKUI.toast(`${FAC_BY[b.id].name} Lv ${b.to} 공사가 끝났어요`); const [gx, gy, z] = ANCH[b.id], [x, y] = scene.toCss(gx, gy, z), r = $("cf-stage").getBoundingClientRect(); HKFx.confetti({ x: r.left + x, y: r.top + y, n: 24, colors: CONFETTI }); }); liveLog.builds = []; store.dirty(); }
      if (liveLog.staffUp.length) { liveLog.staffUp.forEach((u) => HKUI.toast(`${jo(STAFF_BY[u.id].name, "이/가")} ${jo("Lv " + u.lv, "이/가")} 됐어요`)); liveLog.staffUp = []; store.dirty(); }
      if (liveLog.newOrders) { HKUI.toast(`오늘의 주문 ${liveLog.newOrders}개가 새로 왔어요`, "info"); liveLog.newOrders = 0; store.dirty(); }
      if (liveLog.grades.length) flushGrades();
      liveLog.gain = 0; liveLog.served = 0; liveLog.sold = {}; liveLog.fullAt = null;
      if (Date.now() - lastSave > 30000) { lastSave = Date.now(); store.dirty(); }
      renderLive(); renderPanel();
    }
    function flushGrades() { const g = liveLog.grades.slice(); liveLog.grades = []; store.saveNow(); showGrades(g); }

    // ── 팝업(아래에서 올라오는 판 · PC 는 가운데) ──
    function modal(html, { cls = "", onClose } = {}) {
      modalOpen++;
      const ov = document.createElement("div");
      ov.className = "mgx cf mgx-sheet-wrap cf-ov";
      ov.innerHTML = `<div class="mgx-sheet cf-modal ${cls}" role="dialog" aria-modal="true"><button type="button" class="mgx-icon cf-x" data-esc-close aria-label="닫기">${ic("x", 20)}</button>${html}</div>`;
      const close = () => { if (!ov.isConnected) return; ov.remove(); modalOpen--; if (onClose) onClose(); };
      ov.addEventListener("click", (e) => { if (e.target === ov || e.target.closest("[data-esc-close]") || e.target.closest("[data-close]")) close(); });
      document.body.appendChild(ov);
      HKUI.refreshIcons(ov);
      const f = ov.querySelector(".mgx-btn:not(.is-white):not(.is-soft)") || ov.querySelector(".cf-x"); if (f) f.focus({ preventScroll: true });
      return { el: ov, close };
    }
    const mIcon = (name, cls = "") => `<div class="cf-micon ${cls}">${ic(name, 28)}</div>`;

    function showAway(ms, log) {
      const sold = Object.entries(log.sold).filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]).slice(0, 3);
      const rows = [];
      // 손님 수는 소수로 쌓인다 — 1명이 안 되면 「손님 몇 명」으로
      rows.push(`<li>${ic("users", 16)}<span>${Math.floor(log.served) >= 1 ? `손님 <b>${num(log.served)}명</b>이 다녀가` : "손님 몇 명이 다녀가"} <b>${won(log.gain)}</b>어치 팔았어요</span></li>`);
      if (sold.length) rows.push(`<li class="cf-rc__sold">${sold.map(([id, v]) => `<span class="cf-rc__item">${drinkSvg(id, 30)}<span>${esc(MENU_BY[id].name)}</span><b>${num(v)}${CATS[MENU_BY[id].cat].unit}</b></span>`).join("")}</li>`);
      if (log.fullAt) rows.push(`<li class="is-warn">${ic("package-check", 16)}<span>${dur((log.fullAt - (store.now() - ms)) / 1000)} 만에 수입이 가득 차서 그 뒤로는 쉬었어요</span></li>`);
      log.builds.forEach((b) => rows.push(`<li>${ic("hammer", 16)}<span>${esc(FAC_BY[b.id].name)} Lv ${b.to} 공사가 끝났어요</span></li>`));
      const ups = {}; log.staffUp.forEach((u) => { ups[u.id] = u.lv; });
      Object.entries(ups).forEach(([id, lv]) => rows.push(`<li>${ic("user-check", 16)}<span>${jo(esc(STAFF_BY[id].name), "이/가")} ${jo("Lv " + lv, "이/가")} 됐어요</span></li>`));
      if (log.grades.length) rows.push(`<li class="is-good">${ic("award", 16)}<span>카페 <b>${jo("등급 " + log.grades[log.grades.length - 1], "이/가")}</b> 됐어요</span></li>`);
      if (log.newOrders) rows.push(`<li>${ic("clipboard-list", 16)}<span>오늘의 주문이 새로 왔어요</span></li>`);
      const grades = log.grades.slice();
      const m = modal(`<div class="cf-receipt">
          <div class="cf-rc__top">${drinkSvg("americano", 46)}<div><div class="cf-mh">자리 비운 동안</div><div class="cf-mini">${dur(ms / 1000)} 동안 카페가 장사했어요${ms > CAP_HOURS * 3600000 ? ` (쌓이는 건 최대 ${CAP_HOURS}시간)` : ""}</div></div></div>
          <ul class="cf-away">${rows.join("")}</ul>
          <div class="cf-rc__total"><span>받을 수입</span><b>${won(S.pending)}</b></div>
        </div>
        <div class="cf-mbtns">
          <button type="button" class="mgx-btn is-white" data-close>닫기</button>
          <button type="button" class="mgx-btn is-gold" data-away-collect ${S.pending >= 1 ? "" : "disabled"}>${ic("hand-coins", 18)} 수입 받기</button>
        </div>`, { cls: "cf-modal--away", onClose: () => { if (grades.length) showGrades(grades); } });
      m.el.querySelector("[data-away-collect]").addEventListener("click", (e) => {
        const btn = e.currentTarget, from = pt(btn);
        m.close();
        const n = doCollect(from); if (n) HKUI.toast(`${jo(won(n), "을/를")} 받았어요`); else changed(true);
      });
    }

    function showGrades(list) {
      if (!list.length) return;
      const g = list[list.length - 1];
      const items = list.flatMap((x) => unlocksAt(x));
      modal(`<div class="cf-burst"><div class="cf-burst__rays"></div><div class="cf-badge"><small>카페 등급</small><b>${g}</b></div></div>
        <div class="cf-mh cf-center">등급이 올랐어요!</div>
        <p class="cf-lead">옥상 카페가 한층 더 아늑해졌어요${list.length > 1 ? ` (등급 ${list[0]}~${g})` : ""}</p>
        ${items.length ? `<div class="cf-k">새로 열렸어요</div><ul class="cf-unlocks">${items.map((x) => `<li>${x.drink ? drinkSvg(x.drink, 30) : `<span class="cf-unlocks__ic">${ic(x.icon, 16)}</span>`}<span>${esc(x.text)}</span></li>`).join("")}</ul>` : ""}
        <div class="cf-mbtns"><button type="button" class="mgx-btn is-lg is-wide" data-close>좋아요</button></div>`,
      { cls: "cf-modal--grade", onClose: () => { if (g >= MAX_GRADE && !S.done1) { S.done1 = true; changed(true); showDone(); } } });
      HKFx.confetti({ x: innerWidth / 2, y: innerHeight * 0.32, n: 90, colors: CONFETTI });
    }
    function showGradeInfo() {
      const q = GRADE_REQ[S.grade];
      const next = S.grade < MAX_GRADE ? unlocksAt(S.grade + 1) : [];
      modal(`${mIcon("award", "is-gold")}<div class="cf-mh cf-center">카페 등급 ${S.grade}</div>
        ${S.grade >= MAX_GRADE ? `<p class="cf-lead">1차 완주했어요! 누적 매출 ${won(S.sales)} · 맞이한 손님 ${num(S.served)}명</p>` : `<p class="cf-lead">누적 매출과 시설 레벨 합이 모두 채워지면 등급 ${S.grade + 1}이 돼요.</p>
        <div class="mgx-card is-soft cf-ginfo">
          <div class="cf-req"><span>누적 매출</span><div class="mgx-bar" style="--bar:#ff7a45"><i style="--v:${pct(S.sales, q.sales)}%"></i></div><em>${won(Math.min(S.sales, q.sales))} / ${won(q.sales)}</em></div>
          <div class="cf-req"><span>시설 레벨 합</span><div class="mgx-bar" style="--bar:#3cc9a5"><i style="--v:${pct(facSum(S), q.fac)}%"></i></div><em>${facSum(S)} / ${q.fac}</em></div>
        </div>
        ${next.length ? `<div class="cf-k">등급 ${S.grade + 1}에 열려요</div><ul class="cf-unlocks">${next.map((x) => `<li>${x.drink ? drinkSvg(x.drink, 30) : `<span class="cf-unlocks__ic">${ic(x.icon, 16)}</span>`}<span>${esc(x.text)}</span></li>`).join("")}</ul>` : ""}`}
        <div class="cf-mbtns"><button type="button" class="mgx-btn is-wide" data-close>알겠어요</button></div>`);
    }

    function showDone() {
      const days = Math.max(1, Math.ceil((store.now() - S.born) / 86400000));
      modal(`<div class="cf-burst"><div class="cf-burst__rays"></div><div class="cf-done-art">${doneArt()}</div></div>
        <div class="cf-mh cf-center">1차 완주를 축하해요!</div>
        <p class="cf-lead">작은 커피 머신 하나로 시작한 옥상 카페가 등급 ${MAX_GRADE}이 됐어요.</p>
        <div class="cf-done-stats">
          <div><small>누적 매출</small><b>${won(S.sales)}</b></div>
          <div><small>맞이한 손님</small><b>${num(S.served)}명</b></div>
          <div><small>함께한 날</small><b>${days}일</b></div>
        </div>
        <div class="cf-next-up">${ic("calendar-clock", 18)}<div><b>다음 업데이트 안내</b><p>2차에서는 저녁 영업 · 계절 메뉴 · 옥상 정원 가꾸기가 열릴 예정이에요. 그때까지 카페는 지금처럼 계속 장사하고, 시설 · 꾸미기도 이어서 키울 수 있어요.</p></div></div>
        <div class="cf-mbtns"><button type="button" class="mgx-btn is-lg is-wide" data-close>계속 장사하기</button></div>`, { cls: "cf-modal--done" });
      HKFx.confetti({ x: innerWidth / 2, y: innerHeight * 0.3, n: 120, colors: CONFETTI });
      setTimeout(() => HKFx.confetti({ x: innerWidth * 0.3, y: innerHeight * 0.4, n: 50, colors: CONFETTI }), 350);
      setTimeout(() => HKFx.confetti({ x: innerWidth * 0.7, y: innerHeight * 0.4, n: 50, colors: CONFETTI }), 600);
    }
    function doneArt() {
      return `<svg viewBox="0 0 120 90" width="132" height="99" aria-hidden="true"><circle cx="60" cy="48" r="38" fill="#fff1e6"/><path d="M38 38h44v22a22 22 0 0 1-44 0z" fill="#fff" stroke="#ff7a45" stroke-width="3"/><path d="M82 44h6a8 8 0 0 1 0 16h-7" fill="none" stroke="#ff7a45" stroke-width="3"/><path d="M50 30q-4-6 0-12M60 28q-4-6 0-12M70 30q-4-6 0-12" stroke="#ffb38a" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M48 50l8 7 14-15" fill="none" stroke="#3cc9a5" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><g fill="#ff8fb1"><circle cx="20" cy="22" r="3"/><circle cx="102" cy="18" r="3"/></g><g fill="#8fd3ff"><circle cx="14" cy="60" r="2.5"/><circle cx="108" cy="64" r="2.5"/></g><g fill="#ffc83d"><path d="M28 10l2 5 5 1-4 3 1 5-4-3-4 3 1-5-4-3 5-1z"/><path d="M94 76l1.6 4 4 .8-3 2.4.8 4-3.4-2.2-3.4 2.2.8-4-3-2.4 4-.8z"/></g></svg>`;
    }

    function showTutorial() {
      const steps = [
        { art: drinkSvg("americano", 64), title: "옥상에 작은 카페를 열었어요", body: "동료들이 쉬러 와서 커피를 사 가요. 판매 수입은 카운터 위 <b>동전 말풍선</b>에 모이고, 누르면 가진 돈이 돼요." },
        { art: `<div class="cf-micon">${ic("hammer", 30)}</div>`, title: "시설을 올리고 메뉴를 늘려요", body: "좌석 · 계산대 · 커피 머신을 올리면 손님과 값이 늘고, 장면 속 물건도 커져요. 큰 공사는 실제로 몇 분~1시간 걸리니 <b>출근 전에 걸어 두면</b> 일하는 동안 끝나요." },
        { art: `<div class="cf-micon">${ic("clipboard-list", 30)}</div>`, title: "자리 비운 동안에도 장사해요", body: `최대 ${CAP_HOURS}시간치까지 쌓여요. 점심 · 퇴근 뒤에 들러 받아 가세요. <b>오늘의 주문</b>을 하면 돈과 꾸미기 재료를 받아요.` },
      ];
      let i = 0;
      const m = modal(`<div id="cf-tut"></div>`, { cls: "cf-modal--tut", onClose: () => { S.tut = 1; store.dirty(); } });
      const draw = () => {
        const st = steps[i];
        m.el.querySelector("#cf-tut").innerHTML = `<div class="cf-tut__art">${st.art}</div>
          <div class="cf-tut__dots">${steps.map((_, j) => `<i class="${j === i ? "on" : ""}"></i>`).join("")}</div>
          <div class="cf-mh cf-center">${st.title}</div><p class="cf-lead">${st.body}</p>
          <div class="cf-mbtns">${i ? `<button type="button" class="mgx-btn is-white" data-tut="prev">이전</button>` : `<button type="button" class="mgx-btn is-white" data-close>건너뛰기</button>`}
          ${i < steps.length - 1 ? `<button type="button" class="mgx-btn" data-tut="next">다음</button>` : `<button type="button" class="mgx-btn" data-close>시작하기</button>`}</div>`;
        HKUI.refreshIcons(m.el);
        // 스페이스 · 엔터가 「다음 · 시작하기」를 누르게(닫기 X 에 초점이 가 있으면 스페이스 한 번에 안내가 닫혀 버렸다)
        const go = m.el.querySelector(".cf-mbtns .mgx-btn:not(.is-white)"); if (go) go.focus({ preventScroll: true });
      };
      m.el.addEventListener("click", (e) => { const t = e.target.closest("[data-tut]"); if (!t) return; i += t.dataset.tut === "next" ? 1 : -1; draw(); });
      draw();
    }

    function showHelp() {
      const m = modal(`${mIcon("circle-help")}<div class="cf-mh cf-center">옥상 쉼터 카페 도움말</div>
        <div class="cf-help">
          <p><b>손님</b> — 시간당 손님은 「찾아오는 손님(평판 × 메뉴 매력)」, 「좌석이 받을 수 있는 손님」, 「주문 받을 수 있는 손님」 중 가장 작은 수예요. 시설 탭 위와 장면 오른쪽 아래에서 무엇이 모자란지 알려 줘요.</p>
          <p><b>수입</b> — 팔린 만큼 카운터 위 말풍선(쌓인 수입)에 모여요. 시간당 수입 × ${CAP_HOURS}시간이 차면 가득 차서 쉬어요. 받으면 다시 장사해요.</p>
          <p><b>시설</b> — Lv 3부터는 실제 시간이 걸려요(2분~1시간). 공사는 처음엔 한 곳, 등급 3부터 두 곳, 등급 10부터 세 곳 동시에 할 수 있어요. 장면 속 물건을 누르면 그 시설로 가요.</p>
          <p><b>메뉴</b> — 등급과 시설 레벨로 열려요. 진열 칸(3칸, 등급 9부터 4칸 · 13부터 5칸 · 17부터 6칸)에 놓은 것만 팔아요.</p>
          <p><b>알바생</b> — 등급 3 · 7 · 11에 자리가 하나씩 열려요. 장사한 시간만큼 저절로 레벨이 올라요.</p>
          <p><b>카페 등급</b> — 누적 매출과 시설 레벨 합이 모두 채워지면 올라요. 등급 ${MAX_GRADE}이 1차 완주예요.</p>
          <p><b>쉬어도 괜찮아요</b> — 며칠 안 들어와도 카페는 망가지지 않아요. 수입은 가득 찬 채로, 주문은 3일치까지 기다려요.</p>
        </div>
        <div class="cf-mbtns"><button type="button" class="mgx-btn is-white" data-tut-again>처음 안내 다시 보기</button><button type="button" class="mgx-btn" data-close>알겠어요</button></div>`);
      m.el.querySelector("[data-tut-again]").addEventListener("click", () => { m.close(); showTutorial(); });
    }

    function openSpot(i) {
      const sp = SPOTS[i], cur = S.deco.place[i];
      const owned = S.deco.owned;
      const m = modal(`<div class="cf-mh">${i + 1}번 자리 · ${esc(sp.name)}</div>
        <p class="cf-lead cf-left">${cur ? `지금은 「${esc(DECO_BY[cur].name)}」${jo(DECO_BY[cur].name, "이/가").slice(-1)} 있어요.` : "비어 있어요."} 놓을 물건을 골라요.</p>
        ${owned.length ? `<div class="cf-pick">${owned.map((id) => {
          thumbs["d-" + id] = thumbs["d-" + id] || decoThumb(id);
          const at = S.deco.place.indexOf(id);
          return `<button type="button" class="cf-pick__item${id === cur ? " is-on" : ""}" data-pick="${id}"><img src="${thumbs["d-" + id]}" alt=""><b>${esc(DECO_BY[id].name)}</b><small>${at >= 0 ? (at === i ? "여기 있어요" : `${at + 1}번 자리에서 옮겨요`) : "놓지 않았어요"} · 평판 +${DECO_BY[id].rep}</small></button>`;
        }).join("")}</div>` : `<div class="cf-empty">${ic("shopping-bag", 26)}<b>아직 가진 꾸미기 물건이 없어요</b><span>꾸미기 탭에서 사 보세요</span></div>`}
        <div class="cf-mbtns">${cur ? `<button type="button" class="mgx-btn is-white" data-pick="">자리 비우기</button>` : ""}${owned.length ? "" : `<button type="button" class="mgx-btn is-soft" data-go-deco>꾸미기로 가기</button>`}<button type="button" class="mgx-btn" data-close>닫기</button></div>`);
      m.el.addEventListener("click", (e) => {
        if (e.target.closest("[data-go-deco]")) { m.close(); setTab("deco"); return; }
        const p = e.target.closest("[data-pick]"); if (!p) return;
        placeDeco(S, i, p.dataset.pick || null); changed(false); m.close();
        if (p.dataset.pick) { const [gx, gy] = SPOT_G[i], [x, y] = scene.toCss(gx, gy, 20), r = $("cf-stage").getBoundingClientRect(); HKFx.confetti({ x: r.left + x, y: r.top + y, n: 26, colors: CONFETTI }); }
      });
    }
  }

  return { core, mount };
})();
