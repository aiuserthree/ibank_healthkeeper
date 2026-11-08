// 회사 문명 — 육각 땅을 넓히고 연구해 작은 차고 회사를 중소기업으로 키우는 매일 키우기 게임(매니지먼트, key: civ)
//
// 규칙과 계산(CivCore)은 화면과 따로 두어 node 에서도 돌려 볼 수 있다(밸런스 시험). 화면(HKCiv.mount)은 web/games/civ.html 이 부른다.
//
// 시간: 모든 진행은 상태의 t(마지막으로 계산한 서버 시각 ms)에서 store.now() 까지 advance() 로 계산한다.
//   자리 비운 동안은 최대 8시간까지만 쌓인다(그 뒤로는 멈춤). 건설 · 연구는 「남은 초」로 들고 있어 같은 시간 안에서만 줄어든다.
// 자원: 자금(원) · 아이디어(연구에 씀) · 사기(0~100, 계산값 — 낮으면 생산 · 직원 증가가 느려짐) · 평판(쌓이기만 — 문턱마다 땅이 한 칸씩 저절로 넓어짐)
// 행동력: 20분마다 1, 최대 24 — 개척 2 · 건설 시작 1 · 정책 바꾸기 2.
// 시대: 차고 창업 → 벤처 → 중소기업. 넘어가려면 그 시대 핵심 연구 + 직원 수. 중소기업에서 새 사옥을 다 지으면 1차 완주.
(function (G) {
  "use strict";

  const H = 3600, MIN = 60;
  const MAX_AWAY = 8 * H;          // 자리 비운 동안 쌓이는 최대 시간(초)
  const AP_MAX = 24, AP_SEC = 20 * MIN;
  const AP = { expand: 2, build: 1, policy: 2 };
  const RADIUS = 3;

  // ── 육각 지도(뾰족한 머리, 축 좌표 q · r) ─────────────────────────
  const HEX = [];
  for (let q = -RADIUS; q <= RADIUS; q++) {
    for (let r = Math.max(-RADIUS, -q - RADIUS); r <= Math.min(RADIUS, -q + RADIUS); r++) {
      HEX.push({ q, r, d: Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) });
    }
  }
  const HQ = HEX.findIndex((h) => h.d === 0);
  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const idxOf = (q, r) => HEX.findIndex((h) => h.q === q && h.r === r);
  const NB = HEX.map((h) => DIRS.map(([dq, dr]) => idxOf(h.q + dq, h.r + dr)).filter((i) => i >= 0));

  // ── 칸 종류 — 내 땅일 때 시간당 기본 산출 ─────────────────────────
  const TILES = {
    H: { k: "hq", name: "본사", icon: "warehouse", desc: "회사의 심장이에요. 시대가 바뀌면 모습도 바뀌어요." },
    h: { k: "house", name: "주택가", icon: "house", cap: 1, money: 3e4, desc: "직원이 살 집이 많아요. 직원 자리 +1." },
    s: { k: "shop", name: "상가", icon: "store", money: 15e4, desc: "손님이 많아 자금이 잘 들어와요." },
    p: { k: "park", name: "공원", icon: "trees", morale: 3, desc: "산책할 곳이 있어 사기가 올라요." },
    w: { k: "river", name: "강변", icon: "waves", morale: 2, ideas: 2, desc: "물가를 걸으면 생각이 맑아져요." },
    m: { k: "hill", name: "언덕", icon: "mountain", rep: 1, ideas: 1, desc: "멀리서도 잘 보여 평판이 쌓여요." },
    l: { k: "lot", name: "빈터", icon: "square-dashed", money: 2e4, disc: 0.3, desc: "비어 있어 건물을 30% 싸고 빠르게 지어요." },
    c: { k: "campus", name: "대학가", icon: "graduation-cap", ideas: 4, desc: "똑똑한 이웃이 많아 아이디어가 늘어요." },
  };
  const TYPE_BY_KEY = Object.fromEntries(Object.entries(TILES).map(([c, t]) => [t.k, c]));

  // ── 시대 ──────────────────────────────────────────────────────────
  const ERAS = [
    { name: "차고 창업", hqName: "차고", hqCap: 3, hqMoney: 30e4, hqIdeas: 4, staffMoney: 5e4, staffIdeas: 2, grow: 2, slots: 1, cost: 20e4,
      key: "invest", needStaff: 6, desc: "동네 차고에서 노트북 두 대로 시작했어요." },
    { name: "벤처", hqName: "작은 사무실", hqCap: 5, hqMoney: 50e4, hqIdeas: 8, staffMoney: 7e4, staffIdeas: 3, grow: 3, slots: 2, cost: 60e4,
      key: "corp", needStaff: 16, desc: "투자를 받아 번듯한 사무실로 옮겼어요. 동시에 두 곳을 지을 수 있어요." },
    { name: "중소기업", hqName: "본사 건물", hqCap: 8, hqMoney: 80e4, hqIdeas: 12, staffMoney: 10e4, staffIdeas: 4, grow: 4, slots: 2, cost: 150e4,
      key: null, needStaff: 0, desc: "어엿한 중소기업이에요. 마지막으로 새 사옥을 올려요." },
  ];

  // ── 건물 — 칸 하나에 하나. fit: 어울리는 칸 종류 → bonus ──────────
  const BLD = {
    cafe: { name: "카페테리아", icon: "coffee", cost: 60e4, time: 4 * MIN, morale: 6, fit: ["river", "park"], bonus: { morale: 4 }, desc: "따뜻한 밥 한 끼가 사기를 올려요." },
    dorm: { name: "사택", icon: "bed-double", cost: 80e4, time: 6 * MIN, cap: 3, fit: ["house"], bonus: { cap: 2 }, desc: "가까이 살 곳이 생겨 직원 자리가 늘어요." },
    sales: { name: "영업 사무실", icon: "briefcase", req: "sheet", cost: 120e4, time: 10 * MIN, money: 30e4, fit: ["shop"], bonus: { money: 20e4 }, desc: "거래처를 늘려 자금을 벌어요." },
    meeting: { name: "회의실", icon: "presentation", req: "messenger", cost: 150e4, time: 15 * MIN, ideas: 8, fit: ["campus"], bonus: { ideas: 6 }, desc: "모여서 떠들면 아이디어가 나와요." },
    pr: { name: "홍보팀", icon: "megaphone", req: "card", cost: 200e4, time: 25 * MIN, rep: 3, fit: ["shop"], bonus: { rep: 2 }, desc: "회사 이름을 널리 알려 평판을 쌓아요." },
    lounge: { name: "휴게실", icon: "sofa", req: "welfare", cost: 180e4, time: 20 * MIN, morale: 8, fit: ["park"], bonus: { morale: 4 }, desc: "푹신한 소파에서 잠깐 쉬어 가요." },
    server: { name: "서버실", icon: "server", req: "server", cost: 500e4, time: 60 * MIN, ideas: 20, money: 20e4, fit: ["hill"], bonus: { ideas: 8 }, desc: "우리 서비스를 직접 돌려요." },
    warehouse: { name: "물류창고", icon: "package", req: "logistics", cost: 600e4, time: 60 * MIN, money: 80e4, fit: ["lot"], bonus: { money: 40e4 }, desc: "물건을 쌓아 두고 빠르게 보내요." },
    lab: { name: "연구소", icon: "flask-conical", req: "lab", cost: 800e4, time: 90 * MIN, ideas: 25, rspeed: 0.1, fit: ["campus"], bonus: { ideas: 15 }, desc: "아이디어가 늘고 연구 시간이 10% 줄어요(최대 30%)." },
    garden: { name: "옥상 정원", icon: "flower-2", req: "club", cost: 700e4, time: 60 * MIN, morale: 6, rep: 2, fit: ["hill", "river"], bonus: { morale: 3, rep: 1 }, desc: "꽃과 풀이 자라는 쉼터예요." },
    daycare: { name: "직장 보육실", icon: "baby", req: "care", cost: 1500e4, time: 2 * H, morale: 12, grow: 0.3, fit: ["house"], bonus: { morale: 4 }, desc: "아이를 맡길 수 있어 직원이 더 빨리 늘어요." },
    tower: { name: "새 사옥", icon: "building-2", req: "tower", cost: 1.5e8, time: 8 * H, hqOnly: true, money: 200e4, ideas: 30, rep: 10, morale: 10, desc: "본사 자리에 우리만의 사옥을 올려요. 다 지으면 1차 완주!" },
  };

  // ── 연구 — 시대별 나무. 아이디어를 내고 실제 시간이 지나면 끝난다 ──
  const RES = {
    sheet: { era: 0, name: "표 계산", icon: "table", cost: 10, time: 2 * MIN, need: [], opens: "영업 사무실을 지을 수 있어요." },
    messenger: { era: 0, name: "사내 메신저", icon: "message-circle", cost: 25, time: 5 * MIN, need: ["sheet"], opens: "회의실 · 정책 「유연 근무」" },
    card: { era: 0, name: "명함 만들기", icon: "id-card", cost: 50, time: 12 * MIN, need: ["sheet"], opens: "홍보팀을 지을 수 있어요." },
    welfare: { era: 0, name: "복지 제도", icon: "heart-handshake", cost: 100, time: 25 * MIN, need: ["messenger"], opens: "휴게실 · 정책 「야근 금지」" },
    invest: { era: 0, name: "첫 투자 받기", icon: "hand-coins", cost: 200, time: 50 * MIN, need: ["card", "welfare"], key: true, opens: "벤처 시대로 가는 열쇠(직원 6명도 필요)" },
    video: { era: 1, name: "화상 회의", icon: "video", cost: 500, time: 60 * MIN, need: ["invest"], opens: "정책 「재택 근무」" },
    server: { era: 1, name: "서버 구축", icon: "server", cost: 600, time: 80 * MIN, need: ["invest"], opens: "서버실을 지을 수 있어요." },
    logistics: { era: 1, name: "물류 관리", icon: "truck", cost: 700, time: 90 * MIN, need: ["server"], opens: "물류창고를 지을 수 있어요." },
    cloud: { era: 1, name: "온라인 공동 작업", icon: "cloud", cost: 800, time: 2 * H, need: ["server", "video"], opens: "모든 아이디어 +15%", fx: { ideas: 0.15 } },
    lab: { era: 1, name: "사내 연구", icon: "flask-conical", cost: 900, time: 2 * H, need: ["video"], opens: "연구소 · 정책 「집중 근무 시간」" },
    club: { era: 1, name: "사내 동아리", icon: "users", cost: 700, time: 90 * MIN, need: ["video"], opens: "옥상 정원 · 정책 「동아리 활동」" },
    corp: { era: 1, name: "법인 전환", icon: "landmark", cost: 1500, time: 4 * H, need: ["cloud", "lab"], key: true, opens: "중소기업 시대로 가는 열쇠(직원 16명도 필요)" },
    auto: { era: 2, name: "업무 자동화", icon: "bot", cost: 2000, time: 3 * H, need: ["corp"], opens: "모든 자금 +20%", fx: { money: 0.2 } },
    care: { era: 2, name: "가족 친화 제도", icon: "baby", cost: 2000, time: 3 * H, need: ["corp"], opens: "직장 보육실 · 정책 「신입 공채」" },
    brand: { era: 2, name: "브랜드 전략", icon: "sparkles", cost: 2200, time: 3 * H, need: ["corp"], opens: "평판 +30% · 정책 「성과급」", fx: { rep: 0.3 } },
    tower: { era: 2, name: "사옥 설계", icon: "building-2", cost: 3500, time: 5 * H, need: ["auto", "brand"], key: true, opens: "새 사옥을 지을 수 있어요(1차 마지막)." },
  };
  const RES_KEYS = Object.keys(RES);

  // ── 정책 — 칸 1개(평판 60부터 2개) ───────────────────────────────
  const POL = {
    casual: { name: "자유 복장", icon: "shirt", req: null, morale: 5, desc: "사기 +5" },
    flex: { name: "유연 근무", icon: "clock-3", req: "messenger", morale: 10, money: -0.05, desc: "사기 +10 · 자금 −5%" },
    nolate: { name: "야근 금지", icon: "moon", req: "welfare", morale: 16, money: -0.1, ideas: -0.1, desc: "사기 +16 · 자금 · 아이디어 −10%" },
    remote: { name: "재택 근무", icon: "house", req: "video", morale: 6, grow: 0.3, desc: "사기 +6 · 직원 증가 +30%" },
    focus: { name: "집중 근무 시간", icon: "target", req: "lab", morale: -6, ideas: 0.2, desc: "아이디어 +20% · 사기 −6" },
    club: { name: "동아리 활동", icon: "users", req: "club", morale: 4, rep: 2, desc: "사기 +4 · 평판 시간당 +2" },
    hire: { name: "신입 공채", icon: "user-plus", req: "care", grow: 0.6, money: -0.08, desc: "직원 증가 +60% · 자금 −8%" },
    bonus: { name: "성과급", icon: "badge-percent", req: "brand", morale: -8, money: 0.2, desc: "자금 +20% · 사기 −8" },
  };

  // ── 평판 — 문턱마다 땅이 한 칸 저절로 넓어지고, 몇몇 문턱은 해금 ──
  const repTileAt = (n) => 20 + 25 * n + 5 * n * n; // 20 · 50 · 90 · 140 · 200 · 270 …
  const PERKS = [
    { rep: 60, k: "slot2", name: "정책 칸 2개", desc: "정책을 두 개까지 걸 수 있어요." },
    { rep: 200, k: "fastbuild", name: "소문난 회사", desc: "업체가 먼저 와 줘서 건설 시간 −10%." },
    { rep: 400, k: "talent", name: "가고 싶은 회사", desc: "지원자가 몰려 직원 증가 +25%." },
  ];
  const hasPerk = (s, k) => PERKS.some((p) => p.k === k && s.rep >= p.rep);

  // ── 오늘의 사건 — 하루 한 장, 최대 3장까지 쌓임 ────────────────────
  // 선택지 fx(s, R) → { money, ideas, rep, ap, staff, buff: { v, h }, rushBuild, rushRes } (숫자는 고를 때의 산출로 계산)
  const hrs = (rate, h, min = 0) => Math.max(min, Math.round((rate * h) / 1e4) * 1e4);
  const ihrs = (rate, h, min = 0) => Math.max(min, Math.round(rate * h));
  const small = (s) => ERAS[s.era].cost;
  const CARDS = {
    rush: { icon: "phone-call", title: "거래처에서 급한 일을 맡기려 해요", body: "이번 주 안에 끝내 달래요. 돈은 넉넉히 준대요.",
      a: ["맡아요", (s, R) => ({ money: hrs(R.money, 2, 30e4), buff: { v: -5, h: 3 } })],
      b: ["다음에 할게요", () => ({ rep: 10 })] },
    birthday: { icon: "cake", title: "오늘 팀원 생일이에요", body: "다들 몰래 뭔가 준비하고 싶어 해요.",
      a: ["케이크를 사요", (s) => ({ money: -small(s), buff: { v: 10, h: 4 } })],
      b: ["축하 쪽지를 써요", () => ({ buff: { v: 4, h: 4 } })] },
    interview: { icon: "newspaper", title: "동네 신문에서 인터뷰를 하재요", body: "젊은 회사 이야기를 싣고 싶대요.",
      a: ["나가 볼게요", () => ({ rep: 18 })],
      b: ["일에 집중해요", (s, R) => ({ ideas: ihrs(R.ideas, 2, 15) })] },
    hack: { icon: "lightbulb", title: "주말 아이디어 모임을 열까요?", body: "피자 시켜 놓고 밤새 떠들어 보재요.",
      a: ["열어요", (s, R) => ({ ideas: ihrs(R.ideas, 3, 20) })],
      b: ["푹 쉬어요", () => ({ buff: { v: 8, h: 6 } })] },
    market: { icon: "armchair", title: "중고 가구 장터가 열렸어요", body: "쓸 만한 책상과 의자가 잔뜩이에요.",
      a: ["둘러봐요", (s, R) => (s.builds.length ? { rushBuild: 30 * MIN } : { money: hrs(R.money, 1, 20e4) })],
      b: ["그냥 지나가요", (s, R) => ({ money: hrs(R.money, 1, 20e4) })] },
    intern: { icon: "user-plus", title: "인턴 지원서가 왔어요", body: "눈이 반짝반짝한 친구예요.",
      a: ["함께해요", (s, R) => (s.staff < R.cap ? { staff: 1 } : { ideas: ihrs(R.ideas, 2, 15) })],
      b: ["다음 기회에", (s, R) => ({ ideas: ihrs(R.ideas, 1, 10) })] },
    lunch: { icon: "utensils", title: "점심 회식 자리가 생겼어요", body: "근처에 맛집이 새로 열었대요.",
      a: ["다 같이 가요", (s) => ({ money: -small(s), buff: { v: 12, h: 3 } })],
      b: ["도시락 먹어요", (s, R) => ({ money: hrs(R.money, 1, 20e4) })] },
    mentor: { icon: "graduation-cap", title: "선배 사장님이 조언해 주신대요", body: "커피 한 잔 사면 뭐든 알려 주신대요.",
      a: ["조언을 들어요", (s, R) => (s.res ? { rushRes: 40 * MIN } : { ideas: ihrs(R.ideas, 2, 15) })],
      b: ["명함만 받아요", () => ({ rep: 8 })] },
    coffee: { icon: "coffee", title: "커피 기계가 멈췄어요", body: "아침마다 줄 서던 그 기계예요.",
      a: ["새로 사요", (s) => ({ money: -Math.round(small(s) * 1.5), buff: { v: 6, h: 8 } })],
      b: ["고쳐 써요", (s, R) => ({ ideas: ihrs(R.ideas, 1, 10), buff: { v: 2, h: 2 } })] },
    energy: { icon: "zap", title: "다들 기운이 넘치는 날이에요", body: "오늘은 뭐든 할 수 있을 것 같대요.",
      a: ["일을 더 벌여요", () => ({ ap: 4 })],
      b: ["여유를 즐겨요", () => ({ buff: { v: 8, h: 4 } })] },
    contest: { icon: "trophy", title: "작은 창업 대회가 열려요", body: "상은 작지만 이름은 알릴 수 있어요.",
      a: ["나가 봐요", (s, R) => ({ rep: 12, ideas: ihrs(R.ideas, 1, 10) })],
      b: ["준비만 해 둬요", (s, R) => ({ ideas: ihrs(R.ideas, 2, 15) })] },
    neighbor: { icon: "cookie", title: "옆 가게 사장님이 간식을 주셨어요", body: "갓 구운 빵이 한 상자예요.",
      a: ["답례해요", (s) => ({ money: -Math.round(small(s) / 2), rep: 10 })],
      b: ["고맙게 먹어요", () => ({ buff: { v: 6, h: 3 } })] },
  };
  const CARD_KEYS = Object.keys(CARDS);

  // ── 도우미 ────────────────────────────────────────────────────────
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const hashStr = (str) => { let h = 2166136261; for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const dayKey = (ms) => new Date(ms + 9 * H * 1000).toISOString().slice(0, 10); // 한국 날짜

  function makeMap(seed) {
    const rnd = rng(seed);
    const pool = [["h", 22], ["s", 17], ["p", 14], ["w", 12], ["m", 12], ["l", 12], ["c", 11]];
    const total = pool.reduce((a, [, w]) => a + w, 0);
    const pick = () => { let x = rnd() * total; for (const [c, w] of pool) { if ((x -= w) < 0) return c; } return "h"; };
    const m = HEX.map((h, i) => (i === HQ ? "H" : pick()));
    const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
    const ring1 = shuffle(HEX.map((h, i) => (h.d === 1 ? i : -1)).filter((i) => i >= 0));
    m[ring1[0]] = "h"; m[ring1[1]] = "s";
    if (!ring1.some((i) => m[i] === "p" || m[i] === "w")) m[ring1[2]] = rnd() < 0.5 ? "p" : "w";
    const ring2 = shuffle(HEX.map((h, i) => (h.d === 2 ? i : -1)).filter((i) => i >= 0));
    let k = 0;
    for (const c of ["c", "m", "l", "h"]) { if (!ring2.some((i) => m[i] === c)) m[ring2[k++]] = c; }
    return m.join("");
  }

  function blank(now) {
    const seed = (Math.random() * 2 ** 31) >>> 0;
    const own = HEX.map((h) => (h.d <= 1 ? "1" : "0")).join("");
    const s = {
      v: 1, t: now, seed, map: makeMap(seed), own, bld: {}, builds: [], res: null, done: [], era: 0,
      money: 300e4, ideas: 40, rep: 0, staff: 2, grow: 0, ap: 12, apAcc: 0, exp: 0, repTiles: 0,
      pol: ["casual", null], buffs: [], cards: [], evDay: "", cardN: 0, fin: false, cele: false, eraSeen: 0, guide: false,
      summary: null,
    };
    grantCards(s, now);
    summarize(s);
    return s;
  }

  const owned = (s, i) => s.own[i] === "1";
  const setOwn = (s, i) => { s.own = s.own.slice(0, i) + "1" + s.own.slice(i + 1); };
  const typeOf = (s, i) => TILES[s.map[i]];
  const isFrontier = (s, i) => !owned(s, i) && NB[i].some((j) => owned(s, j));
  const ownedCount = (s) => [...s.own].filter((c) => c === "1").length;
  const expandCost = (s) => Math.round((40e4 * Math.pow(1.2, s.exp)) / 1e4) * 1e4;
  const slotsOf = (s) => (hasPerk(s, "slot2") ? 2 : 1);
  const buildSlots = (s) => ERAS[s.era].slots;
  const building = (s, i) => s.builds.find((b) => b.i === i);

  // ── 산출 계산 ─────────────────────────────────────────────────────
  function rates(s) {
    const E = ERAS[s.era];
    let money = 0, ideas = 0, rep = 0, cap = 0, rspeed = 0, grow = 0;
    const mor = [["기본", 55]];
    let tileMor = 0;
    for (let i = 0; i < HEX.length; i++) {
      if (!owned(s, i)) continue;
      const T = typeOf(s, i);
      if (T.k === "hq") { money += E.hqMoney; ideas += E.hqIdeas; cap += E.hqCap; }
      money += T.money || 0; ideas += T.ideas || 0; rep += T.rep || 0; cap += T.cap || 0; tileMor += T.morale || 0;
      const bk = s.bld[i];
      if (bk) {
        const B = BLD[bk];
        const fit = B.fit && B.fit.includes(T.k) ? B.bonus : {};
        money += (B.money || 0) + (fit.money || 0);
        ideas += (B.ideas || 0) + (fit.ideas || 0);
        rep += (B.rep || 0) + (fit.rep || 0);
        cap += (B.cap || 0) + (fit.cap || 0);
        const bm = (B.morale || 0) + (fit.morale || 0);
        if (bm) mor.push([B.name, bm]);
        if (B.rspeed) rspeed += B.rspeed;
        if (B.grow) grow += B.grow;
      }
    }
    if (tileMor) mor.push(["공원 · 강변", tileMor]);
    money += s.staff * E.staffMoney;
    ideas += s.staff * E.staffIdeas;
    const crowd = Math.round(Math.max(0, s.staff - 4) * 1.5);
    if (crowd) mor.push(["북적이는 사무실", -crowd]);
    let mMul = 1, iMul = 1, rMul = 1;
    for (const k of s.pol) {
      if (!k) continue;
      const P = POL[k];
      if (P.morale) mor.push([`정책 「${P.name}」`, P.morale]);
      mMul += P.money || 0; iMul += P.ideas || 0; grow += P.grow || 0; rep += P.rep || 0;
    }
    for (const k of s.done) { const fx = RES[k].fx; if (fx) { mMul += fx.money || 0; iMul += fx.ideas || 0; rMul += fx.rep || 0; } }
    const buff = s.buffs.reduce((a, b) => a + b.v, 0);
    if (buff) mor.push(["오늘의 사건", buff]);
    if (hasPerk(s, "talent")) grow += 0.25;
    const morale = clamp(Math.round(mor.reduce((a, [, v]) => a + v, 0)), 0, 100);
    const prod = clamp(0.5 + morale / 100, 0.6, 1.4);
    const growF = morale < 25 ? 0.3 : clamp(morale / 60, 0.5, 1.5);
    return {
      money: money * prod * mMul, ideas: ideas * prod * iMul, rep: rep * rMul, cap, morale, prod, mor,
      growth: s.staff < cap ? E.grow * growF * (1 + grow) : 0,
      rspeed: Math.min(0.3, rspeed),
    };
  }

  function buildTime(s, i, k) {
    const T = typeOf(s, i);
    let t = BLD[k].time * (1 - (T.disc || 0));
    if (hasPerk(s, "fastbuild")) t *= 0.9;
    return Math.round(t);
  }
  const buildCost = (s, i, k) => Math.round(BLD[k].cost * (1 - (typeOf(s, i).disc || 0)));
  const resTime = (s, k) => Math.round(RES[k].time * (1 - rates(s).rspeed));

  // ── 시간 진행 ─────────────────────────────────────────────────────
  function newLog() { return { money: 0, ideas: 0, rep: 0, staff: 0, ap: 0, tiles: [], builds: [], research: [], full: false, sec: 0 }; }

  function autoExpand(s) {
    const front = HEX.map((h, i) => i).filter((i) => isFrontier(s, i));
    if (!front.length) return -1;
    front.sort((a, b) => HEX[a].d - HEX[b].d || ((hashStr(s.seed + ":" + a) % 997) - (hashStr(s.seed + ":" + b) % 997)));
    setOwn(s, front[0]);
    return front[0];
  }

  // 평판 문턱을 넘었으면 땅을 한 칸씩 넓힌다
  function repCheck(s, log) {
    while (s.rep >= repTileAt(s.repTiles)) {
      s.repTiles++;
      const i = autoExpand(s);
      if (i >= 0 && log) log.tiles.push(i);
    }
  }

  function advance(s, sec, log) {
    log = log || newLog();
    log.sec += sec;
    let guard = 0;
    while (sec > 1e-6 && guard++ < 5000) {
      const R = rates(s);
      let step = Math.min(sec, 60);
      for (const b of s.builds) step = Math.min(step, Math.max(b.rem, 1e-3));
      if (s.res) step = Math.min(step, Math.max(s.res.rem, 1e-3));
      for (const b of s.buffs) step = Math.min(step, Math.max(b.rem, 1e-3));
      const f = step / H;
      s.money += R.money * f; log.money += R.money * f;
      s.ideas += R.ideas * f; log.ideas += R.ideas * f;
      s.rep += R.rep * f; log.rep += R.rep * f;
      if (R.growth > 0) {
        s.grow += R.growth * f;
        if (s.grow >= 1) { s.grow -= 1; s.staff++; log.staff++; }
      } else s.grow = Math.min(s.grow, 0.99);
      if (s.ap < AP_MAX) {
        s.apAcc += step;
        while (s.apAcc >= AP_SEC && s.ap < AP_MAX) { s.apAcc -= AP_SEC; s.ap++; log.ap++; }
      }
      if (s.ap >= AP_MAX) s.apAcc = 0;
      for (const b of s.builds) b.rem -= step;
      const fin = s.builds.filter((b) => b.rem <= 1e-3);
      if (fin.length) {
        s.builds = s.builds.filter((b) => b.rem > 1e-3);
        for (const b of fin) { s.bld[b.i] = b.k; log.builds.push(b.k); if (b.k === "tower") s.fin = true; }
      }
      if (s.res) {
        s.res.rem -= step;
        if (s.res.rem <= 1e-3) { s.done.push(s.res.k); log.research.push(s.res.k); s.res = null; }
      }
      for (const b of s.buffs) b.rem -= step;
      s.buffs = s.buffs.filter((b) => b.rem > 1e-3);
      repCheck(s, log);
      sec -= step;
    }
    return log;
  }

  // 지금(now)까지 따라잡기 — 최대 8시간
  function catchUp(s, now, log) {
    const away = Math.max(0, (now - s.t) / 1000);
    const sec = Math.min(away, MAX_AWAY);
    log = log || newLog();
    if (away > MAX_AWAY) log.full = true;
    log.away = away;
    if (sec > 0) advance(s, sec, log);
    s.t = now;
    grantCards(s, now);
    summarize(s);
    return log;
  }

  function grantCards(s, now) {
    const today = dayKey(now);
    if (s.evDay === today) return 0;
    const days = s.evDay ? Math.max(1, Math.round((Date.parse(today) - Date.parse(s.evDay)) / 864e5)) : 1;
    s.evDay = today;
    let added = 0;
    for (let n = 0; n < days && s.cards.length < 3; n++) {
      const inHand = new Set(s.cards.map((c) => c.k));
      const order = CARD_KEYS.slice().sort((a, b) => hashStr(today + n + a + s.seed) - hashStr(today + n + b + s.seed));
      const k = order.find((x) => !inHand.has(x)) || order[0];
      s.cards.push({ k, id: ++s.cardN });
      added++;
    }
    return added;
  }

  function summarize(s) {
    s.summary = {
      line: s.fin ? `${ERAS[s.era].name} · 직원 ${s.staff}명 · 1차 완주` : `${ERAS[s.era].name} · 직원 ${s.staff}명`,
      level: 1 + s.done.length + (s.fin ? 1 : 0),
    };
  }

  // ── 행동 — 성공하면 null, 안 되면 이유 글자 ───────────────────────
  function canExpand(s, i) {
    if (owned(s, i)) return "이미 내 땅이에요";
    if (!isFrontier(s, i)) return "내 땅과 붙은 칸부터 넓힐 수 있어요";
    if (s.ap < AP.expand) return `행동력이 ${AP.expand} 필요해요`;
    if (s.money < expandCost(s)) return "자금이 모자라요";
    return null;
  }
  function expand(s, i) {
    const why = canExpand(s, i); if (why) return why;
    s.ap -= AP.expand; s.money -= expandCost(s); s.exp++; setOwn(s, i);
    summarize(s); return null;
  }

  function bldLock(s, k) {
    const B = BLD[k];
    if (B.req && !s.done.includes(B.req)) return `「${RES[B.req].name}」 연구가 필요해요`;
    return null;
  }
  function canBuild(s, i, k) {
    const B = BLD[k];
    if (!owned(s, i)) return "내 땅에만 지을 수 있어요";
    if (B.hqOnly ? i !== HQ : i === HQ) return B.hqOnly ? "본사 자리에만 지을 수 있어요" : "본사 칸에는 지을 수 없어요";
    if (s.bld[i]) return "이미 건물이 있어요";
    if (building(s, i)) return "짓고 있는 칸이에요";
    const lock = bldLock(s, k); if (lock) return lock;
    if (s.builds.length >= buildSlots(s)) return buildSlots(s) > 1 ? "동시에 두 곳까지만 지을 수 있어요" : "한 번에 한 곳씩 지어요(벤처부터 두 곳)";
    if (s.ap < AP.build) return `행동력이 ${AP.build} 필요해요`;
    if (s.money < buildCost(s, i, k)) return "자금이 모자라요";
    return null;
  }
  function build(s, i, k) {
    const why = canBuild(s, i, k); if (why) return why;
    const t = buildTime(s, i, k);
    s.ap -= AP.build; s.money -= buildCost(s, i, k);
    s.builds.push({ i, k, rem: t, tot: t });
    return null;
  }

  function resState(s, k) {
    const X = RES[k];
    if (s.done.includes(k)) return "done";
    if (s.res && s.res.k === k) return "doing";
    if (X.era > s.era) return "era";
    if (!X.need.every((n) => s.done.includes(n))) return "locked";
    return "open";
  }
  function canResearch(s, k) {
    const st = resState(s, k);
    if (st === "done") return "이미 끝냈어요";
    if (st === "doing") return "연구하고 있어요";
    if (st === "era") return `${ERAS[RES[k].era].name} 시대에 열려요`;
    if (st === "locked") return "먼저 할 연구가 있어요";
    if (s.res) return "한 번에 하나씩 연구해요";
    if (s.ideas < RES[k].cost) return "아이디어가 모자라요";
    return null;
  }
  function research(s, k) {
    const why = canResearch(s, k); if (why) return why;
    const t = resTime(s, k);
    s.ideas -= RES[k].cost; s.res = { k, rem: t, tot: t };
    return null;
  }

  function polLock(s, k) { const P = POL[k]; return P.req && !s.done.includes(P.req) ? `「${RES[P.req].name}」 연구가 필요해요` : null; }
  function canPolicy(s, slot, k) {
    if (slot >= slotsOf(s)) return "평판 60이 되면 열려요";
    if (k && polLock(s, k)) return polLock(s, k);
    if (k && s.pol.includes(k)) return "이미 걸어 둔 정책이에요";
    if (s.ap < AP.policy) return `행동력이 ${AP.policy} 필요해요`;
    return null;
  }
  function setPolicy(s, slot, k) {
    const why = canPolicy(s, slot, k); if (why) return why;
    s.ap -= AP.policy; s.pol[slot] = k || null;
    return null;
  }

  function eraNeeds(s) {
    const E = ERAS[s.era];
    if (!E.key) return null;
    return [
      { label: `「${RES[E.key].name}」 연구`, ok: s.done.includes(E.key) },
      { label: `직원 ${E.needStaff}명`, ok: s.staff >= E.needStaff, cur: `${s.staff}/${E.needStaff}` },
    ];
  }
  function canEraUp(s) {
    const n = eraNeeds(s);
    if (!n) return "1차의 마지막 시대예요";
    return n.every((x) => x.ok) ? null : "조건을 아직 못 채웠어요";
  }
  function eraUp(s) {
    const why = canEraUp(s); if (why) return why;
    s.era++; summarize(s); return null;
  }

  function cardFx(s, card, opt) {
    const C = CARDS[card.k];
    return C[opt][1](s, rates(s));
  }
  function canCard(s, fx) { return fx.money < 0 && s.money < -fx.money ? "자금이 모자라요" : null; }
  function chooseCard(s, id, opt) {
    const card = s.cards.find((c) => c.id === id); if (!card) return "이미 고른 카드예요";
    const fx = cardFx(s, card, opt);
    const why = canCard(s, fx); if (why) return why;
    if (fx.money) s.money += fx.money;
    if (fx.ideas) s.ideas += fx.ideas;
    if (fx.rep) { s.rep += fx.rep; repCheck(s, null); }
    if (fx.ap) s.ap = Math.min(AP_MAX + 6, s.ap + fx.ap);
    if (fx.staff) s.staff += fx.staff;
    if (fx.buff) s.buffs.push({ v: fx.buff.v, rem: fx.buff.h * H });
    if (fx.rushBuild && s.builds.length) for (const b of s.builds) b.rem = Math.max(1, b.rem - fx.rushBuild);
    if (fx.rushRes && s.res) s.res.rem = Math.max(1, s.res.rem - fx.rushRes);
    s.cards = s.cards.filter((c) => c.id !== id);
    summarize(s);
    return null;
  }

  const CivCore = {
    H, MIN, MAX_AWAY, AP_MAX, AP_SEC, AP, HEX, HQ, NB, TILES, TYPE_BY_KEY, ERAS, BLD, RES, RES_KEYS, POL, PERKS, CARDS,
    repTileAt, hasPerk, blank, rates, advance, catchUp, newLog, grantCards, summarize, dayKey,
    owned, typeOf, isFrontier, ownedCount, expandCost, slotsOf, buildSlots, building, buildTime, buildCost, resTime,
    canExpand, expand, bldLock, canBuild, build, resState, canResearch, research, polLock, canPolicy, setPolicy,
    eraNeeds, canEraUp, eraUp, cardFx, canCard, chooseCard,
  };
  G.CivCore = CivCore;
})(typeof window !== "undefined" ? window : globalThis);

// ══ 화면 ════════════════════════════════════════════════════════════
// HKCiv.mount(el) — 불러오기 · 정산 · 1초마다 진행 · 그리기. 페이지 전용 CSS(.cv-*)는 web/games/civ.html 에 있다.
(function (G) {
  "use strict";
  if (typeof document === "undefined") return;
  const C = G.CivCore;
  const { HEX, HQ, TILES, ERAS, BLD, RES, RES_KEYS, POL, PERKS, CARDS, H } = C;
  const num = (n) => HKMgmt.num(n);
  const won = (n) => `${n < 0 ? "−" : ""}${num(Math.abs(n))}원`;
  const dur = (sec) => HKMgmt.dur(sec);
  const ic = (n, sz = 16) => HKUI.icon(n, sz, "currentColor");
  const pct = (a, b) => (b > 0 ? Math.max(0, Math.min(100, (1 - a / b) * 100)) : 100);
  const signed = (v) => (v >= 0 ? `+${v}` : `−${Math.abs(v)}`);
  // 받침에 맞춘 조사 — 을/를 · 으로/로 · 이에요/예요
  const bat = (w) => { const c = String(w).replace(/[^가-힣]+$/, "").slice(-1).charCodeAt(0) - 0xac00; return c >= 0 && c < 11172 ? c % 28 : 0; };
  const eul = (w) => `${w}${bat(w) ? "을" : "를"}`;
  const ro = (w) => { const b = bat(w); return `${w}${b && b !== 8 ? "으로" : "로"}`; };
  const ieyo = (w) => `${w}${bat(w) ? "이에요" : "예요"}`;

  // ── 시대별 지도 색 ─────────────────────────────────────────────────
  const PAL = [
    { fog: "#e6dfd3", front: "#efe8dc", edge: "#fffaf2", line: "#7c4a1e", roof: "#c2410c", awn: "#f97316", tree: "#7cb342", tree2: "#558b2f", hill: "#c9a46a", hill2: "#b08850",
      t: { hq: "#f6c27a", house: "#f7dcb0", shop: "#f8cf9c", park: "#c5e3a0", river: "#a9d6ef", hill: "#e3cc9d", lot: "#ece2cf", campus: "#efd2df" } },
    { fog: "#dde5f0", front: "#e9eef6", edge: "#ffffff", line: "#1e3a8a", roof: "#2f6bff", awn: "#38bdf8", tree: "#4caf50", tree2: "#2e7d32", hill: "#9fb88a", hill2: "#7f9c6a",
      t: { hq: "#a9c4ff", house: "#d7e4ff", shop: "#ffdcae", park: "#bde6b8", river: "#9fd6f7", hill: "#cfdcb8", lot: "#e6ebf3", campus: "#e0d6f8" } },
    { fog: "#d8e6df", front: "#e6f0eb", edge: "#ffffff", line: "#134e4a", roof: "#0f766e", awn: "#f59e0b", tree: "#43a047", tree2: "#1b5e20", hill: "#8fbf7a", hill2: "#6a9f58",
      t: { hq: "#86dcae", house: "#d3eedd", shop: "#ffe2a8", park: "#a6deb0", river: "#94d3ea", hill: "#c2dbab", lot: "#e2ece6", campus: "#d2e5f8" } },
  ];
  const BCOL = { cafe: "#f97316", dorm: "#8b5cf6", sales: "#0ea5e9", meeting: "#6366f1", pr: "#ec4899", lounge: "#14b8a6", server: "#475569", warehouse: "#a16207", lab: "#7c3aed", garden: "#16a34a", daycare: "#f43f5e", tower: "#2f6bff" };

  // ── 육각 그림 ─────────────────────────────────────────────────────
  const S = 30, SQ3 = Math.sqrt(3);
  const pos = (h) => ({ x: S * SQ3 * (h.q + h.r / 2), y: S * 1.5 * h.r });
  const hexPts = (r) => [0, 1, 2, 3, 4, 5].map((k) => { const a = (Math.PI / 180) * (60 * k - 30); return `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`; }).join(" ");
  const HEXP = hexPts(S - 1.2), HEXSEL = hexPts(S - 3);

  function motif(k, P) {
    switch (k) {
      case "house": {
        const one = (x, y) => `<path d="M${x - 7} ${y} L${x} ${y - 7} L${x + 7} ${y}Z" fill="${P.roof}"/><rect x="${x - 5.5}" y="${y}" width="11" height="8.5" fill="#fffaf2"/><rect x="${x - 1.5}" y="${y + 3.5}" width="3" height="5" fill="${P.roof}" opacity=".8"/>`;
        return one(-7, -3) + one(7, 2);
      }
      case "shop":
        return `<rect x="-12" y="-2" width="24" height="14" rx="1" fill="#fffaf2"/>` +
          [0, 1, 2, 3].map((n) => `<rect x="${-13 + n * 6.5}" y="-8" width="6.5" height="6" fill="${n % 2 ? "#fff" : P.awn}"/>`).join("") +
          `<rect x="-9" y="2" width="8" height="6" fill="#bfe3f7"/><rect x="2" y="2" width="6" height="10" fill="${P.roof}" opacity=".75"/>`;
      case "park":
        return `<rect x="-9" y="3" width="2" height="6" fill="#8d6e63"/><rect x="6" y="1" width="2" height="6" fill="#8d6e63"/>` +
          `<circle cx="-8" cy="0" r="7" fill="${P.tree}"/><circle cx="7" cy="-3" r="6.5" fill="${P.tree2}"/><circle cx="2" cy="9" r="4.5" fill="${P.tree}"/>`;
      case "river":
        return [-7, 1, 9].map((y) => `<path d="M-21 ${y} q5 -4 10 0 t10 0 t10 0 t10 0" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".85"/>`).join("");
      case "hill":
        return `<path d="M-21 12 Q-9 -14 3 12Z" fill="${P.hill2}"/><path d="M-5 12 Q8 -6 21 12Z" fill="${P.hill}"/><path d="M-12 -4 l-2.5 3 h5z" fill="#fff" opacity=".8"/>`;
      case "lot":
        return `<rect x="-13" y="-8" width="26" height="18" rx="2" fill="none" stroke="#a8a29e" stroke-width="1.4" stroke-dasharray="3 2.5"/><path d="M3 9 L6.5 -1 L10 9Z" fill="#f97316"/><rect x="2" y="8.5" width="9" height="2" fill="#ea580c"/>`;
      case "campus":
        return `<path d="M-13 -4 L0 -12 L13 -4Z" fill="${P.roof}"/><rect x="-12" y="-4" width="24" height="3" fill="#fff"/>` +
          [-9, -4, 1, 6].map((x) => `<rect x="${x}" y="-1" width="3" height="10" fill="#fff"/>`).join("") + `<rect x="-13" y="9" width="26" height="3" fill="#fff"/>`;
      default: return "";
    }
  }

  const GLYPH = {
    cafe: `<path d="M-4 -3h7v3.5a3.5 3.5 0 0 1-7 0z" fill="#fff"/><path d="M3 -2h1.5a1.6 1.6 0 0 1 0 3.2H3" fill="none" stroke="#fff" stroke-width="1.3"/>`,
    dorm: `<path d="M-5 4V-3M-5 1H5v3M-3.5 -1.2h3" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>`,
    sales: `<rect x="-5" y="-2" width="10" height="7" rx="1" fill="#fff"/><path d="M-2 -2v-1.8h4V-2" fill="none" stroke="#fff" stroke-width="1.3"/>`,
    meeting: `<rect x="-5" y="-4.5" width="10" height="6.5" rx=".8" fill="#fff"/><path d="M-3 2l-1.5 3.5M3 2l1.5 3.5" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/>`,
    pr: `<path d="M-5 -1.5h2.5l5.5-3.5v10l-5.5-3.5H-5z" fill="#fff"/>`,
    lounge: `<path d="M-5.5 4.5V0h11v4.5M-4 0v-3h8v3" fill="none" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>`,
    server: `<rect x="-4.5" y="-5" width="9" height="4.2" rx=".8" fill="#fff"/><rect x="-4.5" y="0.8" width="9" height="4.2" rx=".8" fill="#fff"/>`,
    warehouse: `<rect x="-5" y="-4" width="10" height="8.5" rx=".8" fill="#fff"/><path d="M-5 -0.8h10M0 -4v3.2" stroke="${BCOL.warehouse}" stroke-width="1.2"/>`,
    lab: `<path d="M-1.6 -5v3.2L-5.5 4.5h11L1.6 -1.8V-5" fill="#fff"/>`,
    garden: `<circle cx="0" cy="-2.8" r="2.3" fill="#fff"/><circle cx="2.8" cy="0" r="2.3" fill="#fff"/><circle cx="0" cy="2.8" r="2.3" fill="#fff"/><circle cx="-2.8" cy="0" r="2.3" fill="#fff"/><circle r="1.5" fill="#fde047"/>`,
    daycare: `<path d="M0 4.5C-6.5 0.5-5 -5.5 0 -2C5 -5.5 6.5 0.5 0 4.5Z" fill="#fff"/>`,
  };
  function bldArt(k, era, P) {
    const col = BCOL[k];
    let body;
    if (era === 0) body = `<path d="M-15 -3L0 -14L15 -3Z" fill="${P.roof}"/><rect x="-13" y="-3" width="26" height="17" rx="1" fill="#fffaf2" stroke="${P.line}" stroke-width=".8"/>`;
    else if (era === 1) body = `<rect x="-13" y="-8" width="26" height="22" rx="2" fill="#f5f8ff" stroke="${P.line}" stroke-width=".8"/><rect x="-14" y="-11" width="28" height="4.5" rx="1.5" fill="${P.roof}"/><rect x="-10" y="-4" width="5" height="4" fill="#bfdbfe"/><rect x="5" y="-4" width="5" height="4" fill="#bfdbfe"/>`;
    else body = `<rect x="-12" y="-12" width="24" height="26" rx="2.5" fill="#fff" stroke="${P.line}" stroke-width=".8"/><rect x="-13" y="-15" width="26" height="4.5" rx="1.5" fill="${P.roof}"/><rect x="-9" y="-8" width="4" height="3.5" fill="#a7f3d0"/><rect x="5" y="-8" width="4" height="3.5" fill="#a7f3d0"/>`;
    return `<ellipse cx="0" cy="15" rx="16" ry="3.5" fill="#000" opacity=".1"/>${body}<g transform="translate(0 5)"><circle r="8.5" fill="${col}" stroke="#fff" stroke-width="1.5"/>${GLYPH[k] || ""}</g>`;
  }
  function hqArt(era, tower) {
    const sh = `<ellipse cx="0" cy="16" rx="21" ry="4" fill="#000" opacity=".12"/>`;
    if (tower) {
      const stripes = [-36, -29, -22, -15, -8, -1, 6].map((y) => `<rect x="-8" y="${y}" width="16" height="3.2" rx=".6" fill="#e0f2fe" opacity=".95"/>`).join("");
      return sh + `<rect x="-19" y="2" width="38" height="13" rx="2" fill="#e2e8f0" stroke="#1e3a8a" stroke-width=".9"/>` +
        `<rect x="-11" y="-42" width="22" height="57" rx="2.5" fill="#3b82f6" stroke="#1e3a8a" stroke-width="1"/>${stripes}` +
        `<path d="M-7 -42L0 -52L7 -42Z" fill="#fbbf24"/><path d="M0 -52V-62" stroke="#1e3a8a" stroke-width="1.4"/><path d="M0 -62h8l-2 3 2 3H0z" fill="#ef4444"/>` +
        `<rect x="-3" y="8" width="6" height="7" fill="#1e3a8a"/>`;
    }
    if (era === 0) {
      return sh + `<path d="M-18 -2L0 -16L18 -2Z" fill="#b45309"/><rect x="-15" y="-3" width="30" height="18" rx="1.5" fill="#fff3e0" stroke="#7c2d12" stroke-width="1"/>` +
        `<rect x="-10" y="1.5" width="20" height="13.5" fill="#94a3b8"/>` + [4.5, 8, 11.5].map((y) => `<path d="M-10 ${y}h20" stroke="#64748b" stroke-width="1"/>`).join("") +
        `<rect x="-3.5" y="-11" width="7" height="5" rx="1" fill="#fde68a"/>`;
    }
    if (era === 1) {
      const win = [-12, -3.5, 5].flatMap((x) => [-9, 0].map((y) => `<rect x="${x}" y="${y}" width="7" height="6" rx=".8" fill="#bfdbfe"/>`)).join("");
      return sh + `<rect x="-16" y="-14" width="32" height="29" rx="2" fill="#f1f5ff" stroke="#1e3a8a" stroke-width="1"/><rect x="-17" y="-19" width="34" height="6.5" rx="2" fill="#2f6bff"/>` +
        `<rect x="-7" y="-17.6" width="14" height="3.6" rx="1" fill="#fff"/>${win}<rect x="-3" y="8" width="6" height="7" fill="#1e3a8a"/>`;
    }
    const win = [-8, -2, 4].flatMap((x) => [-21, -14, -7, 0].map((y) => `<rect x="${x}" y="${y}" width="4" height="4.5" rx=".6" fill="#a7f3d0"/>`)).join("");
    return sh + `<rect x="10" y="-5" width="10" height="20" rx="1.5" fill="#ecfdf5" stroke="#134e4a" stroke-width=".9"/><rect x="12.5" y="0" width="5" height="4" fill="#a7f3d0"/>` +
      `<rect x="-11" y="-26" width="22" height="41" rx="2" fill="#fff" stroke="#134e4a" stroke-width="1"/><rect x="-12" y="-30" width="24" height="5" rx="1.5" fill="#0f766e"/>${win}` +
      `<rect x="-3" y="8" width="6" height="7" fill="#134e4a"/>`;
  }
  const craneArt = (i) =>
    `<path d="M11 13V-19M-12 -19H17M-8 -19V-9" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round"/><rect x="-11" y="-9" width="6" height="4" rx="1" fill="#f59e0b"/>` +
    `<rect x="-14" y="18" width="28" height="4.5" rx="2.2" fill="#fff" opacity=".9"/><rect data-sbar="${i}" x="-14" y="18" width="0" height="4.5" rx="2.2" fill="#f59e0b"/>`;
  const cloudArt = `<g fill="#fff" opacity=".75"><ellipse cx="-7" cy="3" rx="10" ry="6"/><ellipse cx="4" cy="-1" rx="9" ry="7.5"/><ellipse cx="9" cy="5" rx="8" ry="5"/></g>`;

  function mapSvg() {
    const P = PAL[s.era];
    const order = HEX.map((h, i) => i).sort((a, b) => HEX[a].r - HEX[b].r || HEX[a].q - HEX[b].q);
    const tiles = order.map((i) => {
      const h = HEX[i], { x, y } = pos(h), T = C.typeOf(s, i), own = C.owned(s, i), front = !own && C.isFrontier(s, i);
      const b = C.building(s, i);
      let fill, art = "", cls = "cv-tile";
      if (own) {
        fill = P.t[T.k];
        if (T.k === "hq") art = hqArt(s.era, s.bld[HQ] === "tower") + (b ? craneArt(i) : "");
        else if (s.bld[i]) art = bldArt(s.bld[i], s.era, P);
        else if (b) art = `<g opacity=".55">${motif(T.k, P)}</g>` + craneArt(i);
        else art = motif(T.k, P);
        cls += " is-own";
      } else if (front) {
        fill = P.front; art = `<g opacity=".42">${motif(T.k, P)}</g>`; cls += " is-front";
      } else {
        fill = P.fog; art = cloudArt; cls += " is-fog";
      }
      const label = own ? `${T.name}${s.bld[i] ? " · " + BLD[s.bld[i]].name : ""}` : front ? `${T.name} · 개척할 수 있어요` : "안개";
      return `<g class="${cls}${i === sel ? " is-sel" : ""}" data-tile="${i}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})" tabindex="0" role="button" aria-label="${label}">` +
        `<polygon points="${HEXP}" fill="${fill}" class="cv-hex"/>${art}${i === sel ? `<polygon points="${HEXSEL}" class="cv-selring"/>` : ""}</g>`;
    }).join("");
    return `<svg class="cv-map" viewBox="-188 -196 376 366" role="group" aria-label="회사 지도">${tiles}</svg>`;
  }

  // ── 상태 · 화면 ───────────────────────────────────────────────────
  let store = null, s = null, root = null, tab = "map", sel = HQ, polSlot = -1, lastSig = "", lastSave = 0, timer = 0;
  const modalChain = { p: Promise.resolve() };
  const enqueue = (fn) => { modalChain.p = modalChain.p.then(() => new Promise((res) => { try { fn(res); } catch (_) { res(); } })); };

  function fixState(st) {
    if (!st || st.v !== 1 || typeof st.map !== "string" || st.map.length !== HEX.length) return null;
    const b = C.blank(store.now());
    for (const k of Object.keys(b)) if (st[k] === undefined) st[k] = b[k];
    return st;
  }

  async function mount(el) {
    root = el;
    try {
      store = await HKMgmt.open("civ", { blank: () => C.blank(Date.now()), onStale, onClosed });
    } catch (e) {
      if (e && e.closed) { root.innerHTML = HKMgmt.closedHtml(e.opensAt, "회사 문명"); HKUI.refreshIcons(root); return; }
      root.innerHTML = `<div class="hk-mg-closed"><b>회사를 불러오지 못했어요</b><p>${HKUI.escapeHtml((e && e.message) || "잠시 뒤 다시 들어와 주세요.")}</p><a class="hk-btn hk-btn--secondary" href="/manage">매니지먼트 모음으로</a></div>`;
      return;
    }
    if (store.isNew) store.state = C.blank(store.now());
    s = fixState(store.state) || (store.state = C.blank(store.now()));
    store.state = s;
    const log = C.catchUp(s, store.now());
    store.dirty();
    bind();
    renderAll();
    if (!s.guide) enqueue(showGuide);
    else if (log.away > 60) enqueue((done) => showAway(log, done));
    checkFinish();
    timer = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") tick(); });
  }

  function onStale(st) {
    s = fixState(st) || C.blank(store.now());
    store.state = s;
    C.catchUp(s, store.now());
    HKUI.toast("다른 창에서 바꾼 내용으로 다시 불러왔어요", "info");
    renderAll();
  }
  function onClosed(opensAt) {
    clearInterval(timer);
    root.innerHTML = HKMgmt.closedHtml(opensAt, "회사 문명");
    HKUI.refreshIcons(root);
  }

  const sig = () => {
    const R = C.rates(s);
    return [s.staff, s.done.join(), Object.keys(s.bld).length, s.builds.length, s.own, s.cards.length, s.buffs.length, s.era, s.res ? s.res.k : "", C.slotsOf(s), R.morale, R.cap, s.fin].join("|");
  };

  function tick() {
    if (!s) return;
    const now = store.now();
    const away = (now - s.t) / 1000;
    if (away <= 0) return;
    const log = C.catchUp(s, now);
    if (away > 60) enqueue((done) => showAway(log, done));
    else announce(log);
    const g = sig();
    if (g !== lastSig) { renderAll(); store.dirty(); }
    else updateLive();
    if (Date.now() - lastSave > 30000) { lastSave = Date.now(); store.dirty(); }
    checkFinish();
  }

  function announce(log) {
    for (const k of log.builds) HKUI.toast(`${eul(BLD[k].name)} 다 지었어요`);
    for (const k of log.research) HKUI.toast(`「${RES[k].name}」 연구가 끝났어요`);
    if (log.tiles.length) HKUI.toast(`평판이 올라 땅이 ${log.tiles.length}칸 넓어졌어요`);
  }

  // ── 그리기 ────────────────────────────────────────────────────────
  function renderAll() {
    if (!root || !s) return;
    lastSig = sig();
    root.className = `cv cv--era${s.era}`;
    root.innerHTML = `<div class="cv-wrap">${headHtml()}${resHtml()}${stripHtml()}${tabsHtml()}<div class="cv-body">${bodyHtml()}</div></div>`;
    HKUI.refreshIcons(root);
    updateLive();
  }

  function headHtml() {
    const E = ERAS[s.era];
    return `<div class="cv-head">
      <div class="cv-head__l">
        <a class="cv-back" href="/manage">${ic("chevron-left", 16)}매니지먼트</a>
        <h1>회사 문명</h1>
        <p><span class="cv-era-chip">${ic("flag", 13)}${E.name} 시대</span><span>${s.fin ? "1차 완주!" : E.desc}</span></p>
      </div>
      <div class="cv-head__r">
        <button type="button" class="cv-tool" data-act="help">${ic("circle-help", 17)}<span>도움말</span></button>
        <button type="button" class="cv-tool" data-act="reset">${ic("rotate-ccw", 17)}<span>처음부터 다시</span></button>
      </div>
    </div>`;
  }

  function resHtml() {
    return `<div class="cv-res">
      <div class="cv-r cv-r--money"><span class="cv-r__ic">${ic("wallet", 18)}</span><div><small>자금</small><b data-l="money"></b><em data-l="mrate"></em></div></div>
      <div class="cv-r cv-r--idea"><span class="cv-r__ic">${ic("lightbulb", 18)}</span><div><small>아이디어</small><b data-l="ideas"></b><em data-l="irate"></em></div></div>
      <div class="cv-r cv-r--mor"><span class="cv-r__ic">${ic("smile", 18)}</span><div><small>사기</small><b data-l="morale"></b><em data-l="prod"></em></div></div>
      <div class="cv-r cv-r--rep"><span class="cv-r__ic">${ic("star", 18)}</span><div><small>평판</small><b data-l="rep"></b><em data-l="repnext"></em></div></div>
      <div class="cv-r cv-r--ap"><span class="cv-r__ic">${ic("zap", 18)}</span><div><small>행동력</small><b data-l="ap"></b><em data-l="apnext"></em></div></div>
    </div>`;
  }

  function stripHtml() {
    const items = [];
    for (let n = 0; n < C.buildSlots(s); n++) {
      const b = s.builds[n];
      if (b) {
        items.push(`<button type="button" class="cv-job" data-act="goTile" data-i="${b.i}"><span class="cv-job__ic">${ic(BLD[b.k].icon, 18)}</span>
          <span class="cv-job__tx"><b>${BLD[b.k].name} 짓는 중</b><span class="cv-bar"><i data-bar="b${b.i}"></i></span><small data-rem="b${b.i}"></small></span></button>`);
      } else {
        items.push(`<button type="button" class="cv-job is-idle" data-act="tab" data-tab="map"><span class="cv-job__ic">${ic("hammer", 18)}</span>
          <span class="cv-job__tx"><b>건설 쉬는 중</b><small>지도에서 내 땅을 골라 지어요</small></span></button>`);
      }
    }
    if (s.res) {
      items.push(`<button type="button" class="cv-job is-res" data-act="tab" data-tab="research"><span class="cv-job__ic">${ic(RES[s.res.k].icon, 18)}</span>
        <span class="cv-job__tx"><b>「${RES[s.res.k].name}」 연구 중</b><span class="cv-bar"><i data-bar="r"></i></span><small data-rem="r"></small></span></button>`);
    } else {
      items.push(`<button type="button" class="cv-job is-idle is-res" data-act="tab" data-tab="research"><span class="cv-job__ic">${ic("flask-conical", 18)}</span>
        <span class="cv-job__tx"><b>연구 쉬는 중</b><small>아이디어로 다음 연구를 걸어 두세요</small></span></button>`);
    }
    return `<div class="cv-strip">${items.join("")}</div>`;
  }

  function tabsHtml() {
    const t = [["map", "map", "지도"], ["research", "flask-conical", "연구"], ["company", "building-2", "회사"], ["events", "calendar-heart", "오늘의 사건"]];
    return `<div class="cv-tabs" role="tablist">${t.map(([k, i, l]) => `<button type="button" role="tab" aria-selected="${tab === k}" class="cv-tab${tab === k ? " is-on" : ""}" data-act="tab" data-tab="${k}">${ic(i, 17)}<span>${l}</span>${k === "events" && s.cards.length ? `<em>${s.cards.length}</em>` : ""}${k === "company" && !C.canEraUp(s) ? `<em>!</em>` : ""}</button>`).join("")}</div>`;
  }

  function bodyHtml() {
    if (tab === "research") return researchHtml();
    if (tab === "company") return companyHtml();
    if (tab === "events") return eventsHtml();
    return `<div class="cv-maprow"><div class="cv-mapbox">${mapSvg()}<p class="cv-maphint">${ic("hand", 14)}칸을 눌러 보세요 · 점선 칸은 개척할 수 있어요</p></div><div class="cv-panel" id="cv-panel">${panelHtml(sel)}</div></div>`;
  }

  // 산출 글자
  function fxText(o) {
    const p = [];
    if (o.money) p.push(`자금 시간당 +${num(o.money)}`);
    if (o.ideas) p.push(`아이디어 시간당 +${o.ideas}`);
    if (o.rep) p.push(`평판 시간당 +${o.rep}`);
    if (o.morale) p.push(`사기 ${signed(o.morale)}`);
    if (o.cap) p.push(`직원 자리 +${o.cap}`);
    if (o.rspeed) p.push(`연구 시간 −${Math.round(o.rspeed * 100)}%`);
    if (o.grow) p.push(`직원 증가 +${Math.round(o.grow * 100)}%`);
    return p.join(" · ");
  }
  const fitNames = (B) => (B.fit || []).map((k) => TILES[C.TYPE_BY_KEY[k]].name).join(" · ");
  const need = (o) => `data-need="${o.m || 0},${o.i || 0},${o.a || 0}"`;
  const rich = () => Object.assign({}, s, { money: 1e15, ideas: 1e9, ap: 999 });

  function panelHtml(i) {
    const T = C.typeOf(s, i), own = C.owned(s, i), front = C.isFrontier(s, i), h = HEX[i];
    const head = (chip, cls) => `<div class="cv-ph"><span class="cv-ph__ic">${ic(own || front ? T.icon : "cloud-fog", 22)}</span><div><b>${own || front ? T.name : "안개 낀 땅"}</b><small>${["가운데", "첫째 줄", "둘째 줄", "바깥 줄"][h.d]}</small></div><span class="cv-chip ${cls}">${chip}</span></div>`;
    if (!own && !front) {
      return head("안개", "is-fog") + `<p class="cv-pdesc">아직 무엇이 있는지 몰라요. 내 땅과 붙은 칸부터 하나씩 넓히면 보여요. 평판이 쌓여도 저절로 넓어져요.</p>`;
    }
    const base = fxText({ money: T.money, ideas: T.ideas, rep: T.rep, morale: T.morale, cap: T.cap });
    let out = "";
    if (!own) {
      const cost = C.expandCost(s);
      out = head("개척할 수 있어요", "is-front") + `<p class="cv-pdesc">${T.desc}</p>${base ? `<p class="cv-yield">${ic("trending-up", 14)}내 땅이 되면 ${base}</p>` : ""}
        <div class="cv-act"><div><b>개척하기</b><small>행동력 ${C.AP.expand} · ${won(cost)}</small></div>
        <button type="button" class="cv-btn" data-act="expand" data-i="${i}" ${need({ m: cost, a: C.AP.expand })}>${ic("flag", 16)}개척</button></div>`;
      return out;
    }
    const b = C.building(s, i);
    if (T.k === "hq") {
      const E = ERAS[s.era];
      out = head("본사", "is-own") + `<p class="cv-pdesc">지금은 <b>${ieyo(s.bld[HQ] === "tower" ? "새 사옥" : E.hqName)}</b>. ${T.desc}</p>
        <p class="cv-yield">${ic("trending-up", 14)}${fxText({ money: E.hqMoney, ideas: E.hqIdeas, cap: E.hqCap })}</p>`;
      if (s.bld[HQ] === "tower") out += `<div class="cv-note is-good">${ic("party-popper", 16)}새 사옥이 섰어요. ${fxText(BLD.tower)}</div>`;
      else if (b) out += progHtml(i, b);
      else if (s.era === 2) out += optHtml(i, "tower", T);
      else out += `<div class="cv-note">${ic("info", 16)}본사는 시대가 바뀌면 커져요. 마지막 시대(중소기업)에 「사옥 설계」를 마치면 이 자리에 새 사옥을 올릴 수 있어요.</div>`;
      return out;
    }
    out = head("내 땅", "is-own") + `<p class="cv-pdesc">${T.desc}</p>${base ? `<p class="cv-yield">${ic("trending-up", 14)}칸 산출: ${base}</p>` : ""}`;
    if (s.bld[i]) {
      const B = BLD[s.bld[i]], fit = (B.fit || []).includes(T.k);
      out += `<div class="cv-built"><span class="cv-built__ic" style="--c:${BCOL[s.bld[i]]}">${ic(B.icon, 22)}</span><div><b>${B.name}</b><small>${fxText(B)}${fit ? ` · <em>어울림 ${fxText(B.bonus)}</em>` : ""}</small><small>${B.desc}</small></div></div>`;
      return out;
    }
    if (b) return out + progHtml(i, b);
    const keys = Object.keys(BLD).filter((k) => !BLD[k].hqOnly);
    const open = keys.filter((k) => !C.bldLock(s, k));
    const locked = keys.filter((k) => C.bldLock(s, k));
    const full = s.builds.length >= C.buildSlots(s);
    open.sort((a, b2) => ((BLD[b2].fit || []).includes(T.k) ? 1 : 0) - ((BLD[a].fit || []).includes(T.k) ? 1 : 0));
    out += `<h4 class="cv-h4">${ic("hammer", 15)}여기에 지을 건물</h4>`;
    if (full) out += `<div class="cv-note">${ic("hourglass", 16)}지금 짓는 곳이 다 찼어요. 다 지으면 또 지을 수 있어요${C.buildSlots(s) < 2 ? "(벤처 시대부터 두 곳)" : ""}.</div>`;
    out += `<div class="cv-opts">${open.map((k) => optHtml(i, k, T)).join("")}</div>`;
    if (locked.length) out += `<details class="cv-locked"><summary>${ic("lock", 14)}연구하면 열리는 건물 ${locked.length}개</summary><ul>${locked.map((k) => `<li>${ic(BLD[k].icon, 15)}<b>${BLD[k].name}</b><span>${RES[BLD[k].req].name} · ${ERAS[RES[BLD[k].req].era].name}</span></li>`).join("")}</ul></details>`;
    return out;
  }
  function optHtml(i, k, T) {
    const B = BLD[k], fit = (B.fit || []).includes(T.k), cost = C.buildCost(s, i, k), time = C.buildTime(s, i, k);
    const hard = C.canBuild(rich(), i, k);
    return `<div class="cv-opt${fit ? " is-fit" : ""}${k === "tower" ? " is-tower" : ""}">
      <span class="cv-opt__ic" style="--c:${BCOL[k]}">${ic(B.icon, 20)}</span>
      <div class="cv-opt__tx"><b>${B.name}${fit ? `<em>${ic("sparkles", 12)}어울려요</em>` : ""}</b>
        <small>${fxText(B)}${B.fit ? ` · ${fit ? `<i>더해서 ${fxText(B.bonus)}</i>` : `${fitNames(B)}에선 ${fxText(B.bonus)} 더`}` : ""}</small>
        <small class="cv-cost">${ic("wallet", 12)}${won(cost)} · ${ic("clock-3", 12)}${dur(time)} · ${ic("zap", 12)}${C.AP.build}${hard ? ` · <span class="cv-why">${hard}</span>` : ""}</small></div>
      <button type="button" class="cv-btn cv-btn--sm" data-act="build" data-i="${i}" data-k="${k}" ${need({ m: cost, a: C.AP.build })} ${hard ? 'data-hard="1" disabled' : ""}>짓기</button>
    </div>`;
  }
  function progHtml(i, b) {
    return `<div class="cv-prog"><span class="cv-opt__ic" style="--c:${BCOL[b.k]}">${ic(BLD[b.k].icon, 20)}</span><div><b>${BLD[b.k].name} 짓는 중</b>
      <span class="cv-bar"><i data-bar="b${i}"></i></span><small data-rem="b${i}"></small><small>다 지으면 ${fxText(BLD[b.k])}${(BLD[b.k].fit || []).includes(C.typeOf(s, i).k) ? ` · 어울림 ${fxText(BLD[b.k].bonus)}` : ""}</small></div></div>`;
  }

  // 연구 탭
  function researchHtml() {
    const secs = ERAS.map((E, era) => {
      const keys = RES_KEYS.filter((k) => RES[k].era === era);
      const chip = era < s.era ? "지나온 시대" : era === s.era ? "지금 시대" : "다음 시대";
      return `<section class="cv-rsec${era === s.era ? " is-now" : ""}${era > s.era ? " is-later" : ""}"><h3>${E.name}<span class="cv-chip">${chip}</span></h3><div class="cv-rgrid">${keys.map(resCard).join("")}</div></section>`;
    });
    return `<div class="cv-rtop">${ic("lightbulb", 16)}<span>연구는 한 번에 하나씩. 아이디어를 내고 시간이 지나면 끝나요. 밤이나 일하는 동안엔 <b>오래 걸리는 연구</b>를 걸어 두면 좋아요.</span></div>${secs.join("")}`;
  }
  function resCard(k) {
    const X = RES[k], st = C.resState(s, k);
    const needTx = X.need.length ? `먼저: ${X.need.map((n) => RES[n].name).join(" · ")}` : "바로 할 수 있어요";
    let foot;
    if (st === "done") foot = `<span class="cv-chip is-good">${ic("check", 13)}끝</span>`;
    else if (st === "doing") foot = `<div class="cv-rprog"><span class="cv-bar"><i data-bar="r"></i></span><small data-rem="r"></small></div>`;
    else if (st === "era") foot = `<span class="cv-chip is-fog">${ic("lock", 12)}${ERAS[X.era].name} 시대에</span>`;
    else if (st === "locked") foot = `<span class="cv-chip is-fog">${ic("lock", 12)}먼저 할 연구가 있어요</span>`;
    else {
      const hard = s.res ? "다른 연구 중" : "";
      foot = `<button type="button" class="cv-btn cv-btn--sm" data-act="research" data-k="${k}" ${need({ i: X.cost })} ${hard ? 'data-hard="1" disabled' : ""}>${hard || "연구하기"}</button>`;
    }
    return `<div class="cv-rc is-${st}${X.key ? " is-key" : ""}">
      <div class="cv-rc__top"><span class="cv-rc__ic">${ic(X.icon, 18)}</span><b>${X.name}</b>${X.key ? `<em>핵심</em>` : ""}</div>
      <p>${X.opens}</p>
      <small>${needTx}</small>
      <div class="cv-rc__foot"><small class="cv-cost">${ic("lightbulb", 12)}${num(X.cost)} · ${ic("clock-3", 12)}${dur(C.resTime(s, k))}</small>${foot}</div>
    </div>`;
  }

  // 회사 탭
  function companyHtml() {
    const R = C.rates(s), E = ERAS[s.era], needs = C.eraNeeds(s);
    const steps = ERAS.map((e, n) => `<li class="${n < s.era ? "is-past" : n === s.era ? "is-now" : ""}"><span>${n < s.era ? ic("check", 14) : n + 1}</span><b>${e.name}</b></li>`).join("");
    let eraBox;
    if (needs) {
      const ok = !C.canEraUp(s);
      eraBox = `<p class="cv-pdesc">다음 시대 <b>${ro(ERAS[s.era + 1].name)}</b> 가려면</p><ul class="cv-needs">${needs.map((n) => `<li class="${n.ok ? "is-ok" : ""}">${ic(n.ok ? "circle-check" : "circle", 16)}${n.label}${n.cur ? ` <small>(${n.cur})</small>` : ""}</li>`).join("")}</ul>
        <button type="button" class="cv-btn cv-btn--big" data-act="eraUp" ${ok ? "" : "disabled"}>${ic("rocket", 18)}${ERAS[s.era + 1].name} 시대로 올라가기</button>`;
    } else {
      eraBox = s.fin ? `<div class="cv-note is-good">${ic("party-popper", 16)}1차 완주! 다음 시대는 다음 업데이트에서 열려요.</div>`
        : `<p class="cv-pdesc">1차의 마지막 시대예요. 「사옥 설계」를 마치고 본사 자리에 <b>새 사옥</b>을 지으면 1차 완주예요.</p>`;
    }
    const growTx = R.growth > 0 ? `다음 직원까지 약 ${dur(((1 - s.grow) / R.growth) * H)}` : `자리가 가득 찼어요 — 사택을 짓거나 주택가를 넓혀요`;
    const mor = R.mor.map(([l, v]) => `<li><span>${l}</span><b class="${v < 0 ? "is-neg" : ""}">${signed(v)}</b></li>`).join("");
    const pol = [0, 1].map((slot) => polSlotHtml(slot)).join("");
    const nextTile = C.repTileAt(s.repTiles);
    const perks = PERKS.map((p) => `<li class="${s.rep >= p.rep ? "is-ok" : ""}">${ic(s.rep >= p.rep ? "circle-check" : "circle", 16)}<div><b>평판 ${p.rep} · ${p.name}</b><small>${p.desc}</small></div></li>`).join("");
    const counts = {};
    for (const k of Object.values(s.bld)) counts[k] = (counts[k] || 0) + 1;
    const blist = Object.keys(counts).length ? Object.entries(counts).map(([k, n]) => `<li><span class="cv-mini" style="--c:${BCOL[k]}">${ic(BLD[k].icon, 14)}</span>${BLD[k].name}<b>${n}</b></li>`).join("") : `<li class="cv-empty-li">아직 지은 건물이 없어요</li>`;
    return `<div class="cv-cgrid">
      <section class="cv-card cv-card--era"><h3>${ic("flag", 17)}시대</h3><ol class="cv-steps">${steps}</ol>${eraBox}</section>
      <section class="cv-card"><h3>${ic("users", 17)}직원</h3><div class="cv-big"><b>${s.staff}</b><span>/ ${R.cap}명</span></div>
        <p class="cv-pdesc">${growTx}</p><p class="cv-small">직원 한 명마다 자금 시간당 +${num(E.staffMoney)} · 아이디어 시간당 +${E.staffIdeas}. 사기가 높을수록 빨리 늘어요.</p></section>
      <section class="cv-card"><h3>${ic("smile", 17)}사기</h3><div class="cv-big"><b>${R.morale}</b><span>/ 100 · 생산 ×${R.prod.toFixed(2)}</span></div>
        <div class="cv-mbar"><i style="width:${R.morale}%"></i></div><ul class="cv-mor">${mor}</ul></section>
      <section class="cv-card"><h3>${ic("scroll-text", 17)}정책 <small>바꿀 때 행동력 ${C.AP.policy}</small></h3>${pol}</section>
      <section class="cv-card"><h3>${ic("star", 17)}평판</h3><div class="cv-big"><b>${num(s.rep)}</b><span>다음 땅 ${num(nextTile)}에서</span></div>
        <p class="cv-small">평판은 줄지 않아요. 문턱을 넘을 때마다 땅이 한 칸씩 저절로 넓어져요(지금까지 ${s.repTiles}칸).</p><ul class="cv-perks">${perks}</ul></section>
      <section class="cv-card"><h3>${ic("building", 17)}지은 건물</h3><ul class="cv-blist">${blist}</ul><p class="cv-small">내 땅 ${C.ownedCount(s)}칸 / ${HEX.length}칸</p></section>
    </div>`;
  }
  function polSlotHtml(slot) {
    if (slot >= C.slotsOf(s)) return `<div class="cv-pslot is-locked">${ic("lock", 16)}<span>평판 60이 되면 두 번째 정책 칸이 열려요</span></div>`;
    const k = s.pol[slot], P = k ? POL[k] : null;
    let html = `<div class="cv-pslot"><span class="cv-pslot__ic">${ic(P ? P.icon : "plus", 18)}</span><div><b>${P ? P.name : "비어 있어요"}</b><small>${P ? P.desc : "정책을 하나 골라 걸어 두세요"}</small></div>
      <button type="button" class="cv-btn cv-btn--sm cv-btn--ghost" data-act="polOpen" data-slot="${slot}">${polSlot === slot ? "닫기" : "바꾸기"}</button></div>`;
    if (polSlot === slot) {
      html += `<div class="cv-plist">${Object.keys(POL).map((pk) => {
        const X = POL[pk], lock = C.polLock(s, pk), inUse = s.pol.includes(pk);
        return `<div class="cv-popt${lock ? " is-lock" : ""}"><span class="cv-pslot__ic">${ic(lock ? "lock" : X.icon, 16)}</span><div><b>${X.name}</b><small>${lock || X.desc}</small></div>
          ${lock ? "" : inUse ? `<span class="cv-chip">걸려 있어요</span>` : `<button type="button" class="cv-btn cv-btn--sm" data-act="policy" data-slot="${slot}" data-k="${pk}" ${need({ a: C.AP.policy })}>${ic("zap", 13)}${C.AP.policy} 걸기</button>`}</div>`;
      }).join("")}${k ? `<button type="button" class="cv-link" data-act="policy" data-slot="${slot}" data-k="">이 칸 비우기(행동력 ${C.AP.policy})</button>` : ""}</div>`;
    }
    return html;
  }

  // 오늘의 사건 탭
  function fxDesc(fx) {
    const p = [];
    if (fx.money) p.push(`자금 ${fx.money > 0 ? "+" : "−"}${num(Math.abs(fx.money))}원`);
    if (fx.ideas) p.push(`아이디어 +${num(fx.ideas)}`);
    if (fx.rep) p.push(`평판 +${fx.rep}`);
    if (fx.ap) p.push(`행동력 +${fx.ap}`);
    if (fx.staff) p.push(`직원 +${fx.staff}`);
    if (fx.buff) p.push(`사기 ${signed(fx.buff.v)}(${fx.buff.h}시간)`);
    if (fx.rushBuild) p.push(`짓는 건물 ${dur(fx.rushBuild)} 당김`);
    if (fx.rushRes) p.push(`연구 ${dur(fx.rushRes)} 당김`);
    return p.join(" · ");
  }
  function eventsHtml() {
    const top = `<div class="cv-rtop">${ic("calendar-heart", 16)}<span>하루에 한 장씩 와요. 둘 중 하나를 골라요. 안 골라도 손해는 없고, 최대 3장까지 쌓여요.</span></div>`;
    if (!s.cards.length) return top + `<div class="cv-empty">${ic("mail-open", 30)}<b>오늘 사건은 다 골랐어요</b><span>내일 새 카드가 와요.</span></div>`;
    return top + `<div class="cv-cards">${s.cards.map((c) => {
      const X = CARDS[c.k];
      const opt = (o) => {
        const fx = C.cardFx(s, c, o), why = C.canCard(s, fx);
        return `<button type="button" class="cv-choice" data-act="card" data-id="${c.id}" data-o="${o}" ${fx.money < 0 ? need({ m: -fx.money }) : ""} ${why ? "disabled" : ""}><b>${X[o][0]}</b><small>${fxDesc(fx)}</small></button>`;
      };
      return `<article class="cv-ev"><div class="cv-ev__top"><span class="cv-ev__ic">${ic(X.icon, 22)}</span><div><b>${X.title}</b><p>${X.body}</p></div></div><div class="cv-ev__opts">${opt("a")}${opt("b")}</div></article>`;
    }).join("")}</div>`;
  }

  // ── 1초마다 바뀌는 글자 · 막대 ─────────────────────────────────────
  function updateLive() {
    if (!root) return;
    const R = C.rates(s);
    const L = {
      money: won(s.money), mrate: `시간당 +${num(R.money)}`,
      ideas: num(s.ideas), irate: `시간당 +${num(R.ideas)}`,
      morale: `${R.morale}`, prod: `생산 ×${R.prod.toFixed(2)}`,
      rep: num(s.rep), repnext: `다음 땅 ${num(C.repTileAt(s.repTiles))}`,
      ap: `${s.ap} / ${C.AP_MAX}`, apnext: s.ap >= C.AP_MAX ? "가득 찼어요" : `+1까지 ${dur(C.AP_SEC - s.apAcc)}`,
    };
    root.querySelectorAll("[data-l]").forEach((el) => { const v = L[el.dataset.l]; if (v != null && el.textContent !== v) el.textContent = v; });
    const prog = {};
    for (const b of s.builds) prog["b" + b.i] = b;
    if (s.res) prog.r = s.res;
    root.querySelectorAll("[data-bar]").forEach((el) => { const p = prog[el.dataset.bar]; if (p) el.style.width = pct(p.rem, p.tot).toFixed(1) + "%"; });
    root.querySelectorAll("[data-rem]").forEach((el) => { const p = prog[el.dataset.rem]; if (p) el.textContent = `${dur(p.rem)} 남았어요`; });
    root.querySelectorAll("[data-sbar]").forEach((el) => { const p = prog["b" + el.dataset.sbar]; if (p) el.setAttribute("width", ((28 * pct(p.rem, p.tot)) / 100).toFixed(1)); });
    root.querySelectorAll("[data-need]").forEach((el) => {
      const [m, i, a] = el.dataset.need.split(",").map(Number);
      const off = !!el.dataset.hard || s.money < m || s.ideas < i || s.ap < a;
      if (el.disabled !== off) el.disabled = off;
    });
  }

  // ── 누르기 ────────────────────────────────────────────────────────
  function bind() {
    root.addEventListener("click", (e) => {
      const t = e.target.closest("[data-tile]");
      if (t && root.contains(t)) { pickTile(+t.dataset.tile); return; }
      const b = e.target.closest("[data-act]");
      if (!b || b.disabled) return;
      act(b.dataset.act, b.dataset);
    });
    root.addEventListener("keydown", (e) => {
      const t = e.target.closest && e.target.closest("[data-tile]");
      if (t && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); pickTile(+t.dataset.tile, true); }
    });
  }
  function pickTile(i, keyboard) {
    sel = i;
    renderAll();
    if (keyboard) { const el = root.querySelector(`[data-tile="${i}"]`); if (el) el.focus(); }
    const p = document.getElementById("cv-panel");
    if (p && innerWidth < 860) {
      const r = p.getBoundingClientRect();
      if (r.top > innerHeight - 120) p.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
  function done(why, okMsg) {
    if (why) { HKUI.toast(why, "danger"); return false; }
    C.summarize(s);
    store.saveNow();
    renderAll();
    if (okMsg) HKUI.toast(okMsg);
    return true;
  }
  async function act(a, d) {
    if (a === "tab") { tab = d.tab; polSlot = -1; renderAll(); return; }
    if (a === "goTile") { tab = "map"; sel = +d.i; renderAll(); return; }
    if (a === "help") return showHelp();
    if (a === "reset") return resetFlow();
    if (a === "expand") {
      const i = +d.i;
      return done(C.expand(s, i), `${eul(C.typeOf(s, i).name)} 개척했어요`);
    }
    if (a === "build") {
      const k = d.k;
      return done(C.build(s, +d.i, k), `${eul(BLD[k].name)} 짓기 시작했어요`);
    }
    if (a === "research") return done(C.research(s, d.k), `「${RES[d.k].name}」 연구를 시작했어요`);
    if (a === "polOpen") { polSlot = polSlot === +d.slot ? -1 : +d.slot; renderAll(); return; }
    if (a === "policy") {
      const why = C.setPolicy(s, +d.slot, d.k || null);
      if (!why) polSlot = -1;
      return done(why, d.k ? `정책 「${POL[d.k].name}」${bat(POL[d.k].name) ? "을" : "를"} 걸었어요` : "정책 칸을 비웠어요");
    }
    if (a === "card") {
      const before = C.ownedCount(s);
      const ok = done(C.chooseCard(s, +d.id, d.o), "골랐어요");
      if (ok && C.ownedCount(s) > before) HKUI.toast(`평판이 올라 땅이 ${C.ownedCount(s) - before}칸 넓어졌어요`);
      return;
    }
    if (a === "eraUp") {
      const prev = s.era;
      if (done(C.eraUp(s))) enqueue((fin) => showEraUp(prev + 1, fin));
    }
  }

  // ── 창(모달) ──────────────────────────────────────────────────────
  function modal(html, onClose, cls = "") {
    const ov = document.createElement("div");
    ov.className = "cv-modal";
    ov.innerHTML = `<div class="cv-modal__box ${cls}" role="dialog" aria-modal="true">${html}</div>`;
    const close = () => { if (!ov.isConnected) return; ov.remove(); if (onClose) onClose(); };
    ov.addEventListener("click", (e) => { if (e.target === ov || e.target.closest("[data-mclose]")) close(); });
    document.body.appendChild(ov);
    HKUI.refreshIcons(ov);
    const f = ov.querySelector("[data-mfocus]") || ov.querySelector("button");
    if (f) f.focus({ preventScroll: true });
    return { ov, close };
  }
  const xBtn = `<button type="button" class="cv-modal__x" data-mclose data-esc-close aria-label="닫기">${ic("x", 20)}</button>`;

  function showAway(log, fin) {
    const rows = [];
    if (log.money >= 1) rows.push(["wallet", "자금", `+${won(log.money)}`]);
    if (log.ideas >= 1) rows.push(["lightbulb", "아이디어", `+${num(log.ideas)}`]);
    if (log.rep >= 1) rows.push(["star", "평판", `+${num(log.rep)}`]);
    if (log.staff) rows.push(["users", "새 직원", `+${log.staff}명`]);
    if (log.ap) rows.push(["zap", "행동력", `+${log.ap}`]);
    const ends = [
      ...log.builds.map((k) => [BLD[k].icon, `${eul(BLD[k].name)} 다 지었어요`]),
      ...log.research.map((k) => [RES[k].icon, `「${RES[k].name}」 연구가 끝났어요`]),
      ...(log.tiles.length ? [["map", `평판이 올라 땅이 ${log.tiles.length}칸 넓어졌어요`]] : []),
    ];
    modal(`${xBtn}<div class="cv-away">
      <span class="cv-away__badge">${ic("coffee", 26)}</span>
      <h2>자리 비운 동안</h2>
      <p>${dur(log.away)} 동안 회사가 일했어요.</p>
      ${log.full ? `<div class="cv-note is-warn">${ic("battery-full", 16)}가득 찼어요 — 8시간까지만 쌓이고 그 뒤로는 쉬었어요.</div>` : ""}
      <ul class="cv-away__rows">${rows.map(([i, l, v]) => `<li>${ic(i, 17)}<span>${l}</span><b>${v}</b></li>`).join("") || `<li><span>쌓인 게 거의 없어요</span></li>`}</ul>
      <h4>끝난 일</h4>
      <ul class="cv-away__ends">${ends.map(([i, t]) => `<li>${ic(i, 16)}${t}</li>`).join("") || `<li class="is-none">끝난 일은 없어요. 건설 · 연구를 걸어 두면 자리 비운 동안 진행돼요.</li>`}</ul>
      <button type="button" class="cv-btn cv-btn--big" data-mclose data-mfocus>좋아요</button>
    </div>`, fin);
  }

  function showGuide(fin) {
    const steps = [
      ["map", "차고에서 시작해요", "지도에서 칸을 눌러 건물을 짓고, 내 땅 옆 점선 칸을 <b>개척</b>해 넓혀요. 행동력은 20분마다 1씩 차요(최대 24)."],
      ["flask-conical", "연구가 회사를 키워요", "아이디어로 연구를 걸어 두면 실제 시간이 지나 끝나요. 새 건물 · 정책 · 다음 시대가 열려요."],
      ["sunrise", "출근 전에 걸어 두세요", "일하는 동안에도 최대 8시간까지 회사가 돌아가요. 점심 · 퇴근 후에 들러 정산하고, <b>오늘의 사건</b>도 골라요."],
    ];
    let n = 0;
    const m = modal(`${xBtn}<div class="cv-guide"></div>`, () => { s.guide = true; store.dirty(); fin(); });
    const box = m.ov.querySelector(".cv-guide");
    const draw = () => {
      const [i, t, b] = steps[n];
      box.innerHTML = `<span class="cv-guide__ic">${ic(i, 30)}</span><small>${n + 1} / ${steps.length}</small><h2>${t}</h2><p>${b}</p>
        <div class="cv-guide__dots">${steps.map((_, k) => `<i class="${k === n ? "is-on" : ""}"></i>`).join("")}</div>
        <div class="cv-guide__btns"><button type="button" class="cv-btn cv-btn--ghost" data-g="skip">${n === steps.length - 1 ? "닫기" : "건너뛰기"}</button>
        <button type="button" class="cv-btn" data-g="next" data-mfocus>${n === steps.length - 1 ? "시작해요" : "다음"}</button></div>`;
      HKUI.refreshIcons(box);
      box.querySelector('[data-g="next"]').focus({ preventScroll: true });
    };
    box.addEventListener("click", (e) => {
      const g = e.target.closest("[data-g]"); if (!g) return;
      if (g.dataset.g === "next" && n < steps.length - 1) { n++; draw(); } else m.close();
    });
    draw();
  }

  function showHelp() {
    modal(`${xBtn}<div class="cv-help"><h2>${ic("circle-help", 22)}회사 문명 도움말</h2>
      <h4>하루 흐름</h4><p>출근 전에 건설 · 연구를 걸어 두면 일하는 동안 진행돼요. 점심 · 퇴근 후에 들러 정산하고 다음 일을 걸어요. 자리 비운 동안은 <b>최대 8시간</b>까지 쌓여요.</p>
      <h4>자원</h4><ul>
        <li>${ic("wallet", 15)}<b>자금</b> 개척 · 건설에 써요. 칸 · 건물 · 직원이 벌어요.</li>
        <li>${ic("lightbulb", 15)}<b>아이디어</b> 연구에 써요. 대학가 · 회의실 · 직원이 내요.</li>
        <li>${ic("smile", 15)}<b>사기</b> 50이면 보통이에요. 높으면 더 많이 벌고 직원이 빨리 늘어요. 직원이 많아지면 북적여서 내려가요 — 카페테리아 · 휴게실 · 정책으로 올려요.</li>
        <li>${ic("star", 15)}<b>평판</b> 줄지 않아요. 쌓일 때마다 땅이 한 칸씩 저절로 넓어지고, 60 · 200 · 400에 좋은 일이 생겨요.</li>
        <li>${ic("zap", 15)}<b>행동력</b> 20분마다 1(최대 24). 개척 ${C.AP.expand} · 건설 시작 ${C.AP.build} · 정책 바꾸기 ${C.AP.policy}.</li></ul>
      <h4>칸과 건물</h4><p>칸마다 기본 산출이 달라요. 건물은 칸 하나에 하나씩, 어울리는 칸에 지으면 보너스가 붙어요(예: 강변 · 공원 + 카페테리아 = 사기 더).</p>
      <h4>시대</h4><p>차고 창업 → 벤처 → 중소기업. 시대마다 핵심 연구와 직원 수를 채우면 올라갈 수 있어요. 중소기업 시대에 <b>새 사옥</b>을 다 지으면 1차 완주예요.</p>
      <h4>이용 시간</h4><p>업무 시간(평일 9:00~11:30, 13:00~18:00)에는 들어올 수 없지만, 걸어 둔 일은 계속 진행돼요.</p>
      <button type="button" class="cv-btn cv-btn--big" data-mclose data-mfocus>알겠어요</button></div>`, null, "is-wide");
  }

  function eraArt(era, tower) {
    const P = PAL[era];
    return `<svg viewBox="-56 -84 112 142" class="cv-eraart"><polygon points="${hexPts(46)}" fill="${P.t.hq}" transform="translate(0 4)"/><g transform="translate(0 4) scale(1.25)">${hqArt(era, tower)}</g></svg>`;
  }
  function showEraUp(era, fin) {
    const E = ERAS[era], prev = ERAS[era - 1];
    const news = RES_KEYS.filter((k) => RES[k].era === era).length;
    modal(`${xBtn}<div class="cv-cele">${eraArt(era)}<small>새 시대</small><h2>${E.name} 시대가 열렸어요!</h2><p>${E.desc}</p>
      <ul><li>${ic("palette", 15)}지도 색과 건물 모습이 바뀌었어요</li><li>${ic("flask-conical", 15)}새 연구 ${news}개가 열렸어요</li>
      <li>${ic("users", 15)}본사 직원 자리 ${prev.hqCap} → ${E.hqCap}</li>${E.slots > prev.slots ? `<li>${ic("hammer", 15)}이제 동시에 두 곳을 지을 수 있어요</li>` : ""}</ul>
      <button type="button" class="cv-btn cv-btn--big" data-mclose data-mfocus>계속 키우기</button></div>`, fin, "is-cele");
  }
  function checkFinish() {
    if (s && s.fin && !s.cele) {
      s.cele = true; store.saveNow();
      enqueue((fin) => modal(`${xBtn}<div class="cv-cele is-fin">${confetti()}${eraArt(2, true)}<small>1차 완주</small><h2>새 사옥이 섰어요!</h2>
        <p>차고에서 시작한 회사가 어엿한 중소기업이 됐어요. 정말 수고 많았어요.</p>
        <div class="cv-note">${ic("sparkles", 16)}다음 시대는 다음 업데이트에서 열려요. 그동안 땅을 더 넓히고 건물을 채워 보세요.</div>
        <button type="button" class="cv-btn cv-btn--big" data-mclose data-mfocus>고마워요</button></div>`, fin, "is-cele"));
    }
  }
  function confetti() {
    const cols = ["#2f6bff", "#f59e0b", "#ec4899", "#10b981", "#8b5cf6"];
    let out = "";
    for (let n = 0; n < 26; n++) out += `<i style="left:${(n * 37) % 100}%;background:${cols[n % 5]};animation-delay:${((n * 0.13) % 1.6).toFixed(2)}s"></i>`;
    return `<div class="cv-confetti" aria-hidden="true">${out}</div>`;
  }

  async function resetFlow() {
    const a = await HKUI.confirmDialog("처음부터 다시 할까요?", "땅 · 건물 · 연구 · 직원이 모두 사라지고 차고부터 새로 시작해요.", { confirmLabel: "다시 할래요" });
    if (!a) return;
    const b = await HKUI.confirmDialog("정말 지울까요?", "<b>되돌릴 수 없어요.</b> 지금까지 키운 회사가 모두 지워져요.", { confirmLabel: "모두 지우기", confirmVariant: "danger" });
    if (!b) return;
    try {
      await store.reset();
      s = C.blank(store.now());
      store.state = s;
      await store.saveNow();
      tab = "map"; sel = HQ; polSlot = -1;
      renderAll();
      HKUI.toast("차고부터 새로 시작해요");
      enqueue(showGuide);
    } catch (e) {
      HKUI.toast((e && e.message) || "지금은 지울 수 없어요", "danger");
    }
  }

  G.HKCiv = { mount };
})(typeof window !== "undefined" ? window : globalThis);
