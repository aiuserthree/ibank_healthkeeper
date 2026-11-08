// 오피스 타운 — 빈 동네 땅에 작은 회사를 차리고, 회사와 함께 커 가는 귀여운 회사 동네를 꾸미는 매일 키우기 게임(매니지먼트, key: civ — 옛 이름 「회사 문명」)
// 화면 말 ↔ 코드 이름: 단계=era · 땅 사기=expand · 사업 아이디어(아이디어 회의)=research · 회사 문화=policy · 오늘의 소식=cards · 인기=rep · 분위기=morale · 기운=ap
//
// 규칙과 계산(CivCore)은 화면과 따로 두어 node 에서도 돌려 볼 수 있다(밸런스 시험). 화면(HKCiv.mount)은 web/games/civ.html 이 부른다.
//
// 시간: 모든 진행은 상태의 t(마지막으로 계산한 서버 시각 ms)에서 store.now() 까지 advance() 로 계산한다.
//   자리 비운 동안은 최대 8시간까지만 쌓인다(그 뒤로는 멈춤). 건설 · 연구는 「남은 초」로 들고 있어 같은 시간 안에서만 줄어든다.
// 자원: 자금(원) · 아이디어(사업 아이디어 회의에 씀) · 분위기(morale 0~100, 계산값 — 낮으면 생산 · 직원 증가가 느려짐) · 인기(rep, 쌓이기만 — 문턱마다 땅이 한 칸씩 저절로 넓어짐)
// 기운(ap): 20분마다 1, 최대 24 — 땅 사기 2 · 건설 시작 1 · 회사 문화 바꾸기 2.
// 단계(era): 차고 창업 → 골목 스타트업 → 오피스 타운. 넘어가려면 그 단계 핵심 아이디어 + 직원 수. 마지막 단계에서 새 사옥을 다 지으면 1차 완주(오피스 타운 완성).
// 지도: 7×7 네모 칸(state.grid = "sq"). 예전 판은 반지름 3 육각(37칸)이었고, 불러올 때 migrate() 가 네모 칸으로 옮긴다.
(function (G) {
  "use strict";

  const H = 3600, MIN = 60;
  const MAX_AWAY = 8 * H;          // 자리 비운 동안 쌓이는 최대 시간(초)
  const AP_MAX = 24, AP_SEC = 20 * MIN;
  const AP = { expand: 2, build: 1, policy: 2 };
  const RADIUS = 3;

  // ── 네모 칸 동네 지도(7×7, 칸 번호 = 줄 × 7 + 칸) ───────────────────
  //   c: 왼쪽→오른쪽(0~6) · r: 위→아래(0~6) · d: 본사에서 몇 겹째인지(0~3). 이웃은 위 · 아래 · 왼쪽 · 오른쪽 4칸.
  //   (이름 HEX 는 예전 육각 시절 그대로 둔다 — 화면 · 저장이 칸 번호로만 말하므로)
  const N = 2 * RADIUS + 1;
  const HEX = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) HEX.push({ c, r, d: Math.max(Math.abs(c - RADIUS), Math.abs(r - RADIUS)) });
  const HQ = RADIUS * N + RADIUS;
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const idxOf = (c, r) => (c >= 0 && c < N && r >= 0 && r < N ? r * N + c : -1);
  const NB = HEX.map((h) => DIRS.map(([dc, dr]) => idxOf(h.c + dc, h.r + dr)).filter((i) => i >= 0));

  // ── 칸 종류 — 내 땅일 때 시간당 기본 산출 ─────────────────────────
  const TILES = {
    H: { k: "hq", name: "본사", icon: "warehouse", desc: "우리 회사예요. 단계가 오를 때마다 모습이 커져요." },
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
      key: "invest", needStaff: 6, desc: "빈 동네 차고에서 노트북 두 대로 시작했어요." },
    { name: "골목 스타트업", hqName: "아담한 사무실", hqCap: 5, hqMoney: 50e4, hqIdeas: 8, staffMoney: 7e4, staffIdeas: 3, grow: 3, slots: 2, cost: 60e4,
      key: "corp", needStaff: 16, desc: "투자를 받아 골목 안 아담한 사무실로 옮겼어요. 동시에 두 곳을 지을 수 있어요." },
    { name: "오피스 타운", hqName: "본사 빌딩", hqCap: 8, hqMoney: 80e4, hqIdeas: 12, staffMoney: 10e4, staffIdeas: 4, grow: 4, slots: 2, cost: 150e4,
      key: null, needStaff: 0, desc: "동네에서 제일 북적이는 회사가 됐어요. 마지막으로 랜드마크 새 사옥을 올려요." },
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
    tower: { name: "새 사옥", icon: "building-2", req: "tower", cost: 1.5e8, time: 8 * H, hqOnly: true, money: 200e4, ideas: 30, rep: 10, morale: 10, desc: "본사 자리에 동네 랜드마크 사옥을 올려요. 다 지으면 오피스 타운 완성!" },
  };

  // ── 연구 — 시대별 나무. 아이디어를 내고 실제 시간이 지나면 끝난다 ──
  const RES = {
    sheet: { era: 0, name: "표 계산", icon: "table", cost: 10, time: 2 * MIN, need: [], opens: "영업 사무실을 지을 수 있어요." },
    messenger: { era: 0, name: "사내 메신저", icon: "message-circle", cost: 25, time: 5 * MIN, need: ["sheet"], opens: "회의실 · 회사 문화 「유연 근무」" },
    card: { era: 0, name: "명함 만들기", icon: "id-card", cost: 50, time: 12 * MIN, need: ["sheet"], opens: "홍보팀을 지을 수 있어요." },
    welfare: { era: 0, name: "복지 제도", icon: "heart-handshake", cost: 100, time: 25 * MIN, need: ["messenger"], opens: "휴게실 · 회사 문화 「야근 금지」" },
    invest: { era: 0, name: "첫 투자 받기", icon: "hand-coins", cost: 200, time: 50 * MIN, need: ["card", "welfare"], key: true, opens: "골목 스타트업 단계로 가는 열쇠(직원 6명도 필요)" },
    video: { era: 1, name: "화상 회의", icon: "video", cost: 500, time: 60 * MIN, need: ["invest"], opens: "회사 문화 「재택 근무」" },
    server: { era: 1, name: "서버 구축", icon: "server", cost: 600, time: 80 * MIN, need: ["invest"], opens: "서버실을 지을 수 있어요." },
    logistics: { era: 1, name: "물류 관리", icon: "truck", cost: 700, time: 90 * MIN, need: ["server"], opens: "물류창고를 지을 수 있어요." },
    cloud: { era: 1, name: "온라인 공동 작업", icon: "cloud", cost: 800, time: 2 * H, need: ["server", "video"], opens: "모든 아이디어 +15%", fx: { ideas: 0.15 } },
    lab: { era: 1, name: "사내 연구", icon: "flask-conical", cost: 900, time: 2 * H, need: ["video"], opens: "연구소 · 회사 문화 「집중 근무 시간」" },
    club: { era: 1, name: "사내 동아리", icon: "users", cost: 700, time: 90 * MIN, need: ["video"], opens: "옥상 정원 · 회사 문화 「동아리 활동」" },
    corp: { era: 1, name: "법인 전환", icon: "landmark", cost: 1500, time: 4 * H, need: ["cloud", "lab"], key: true, opens: "오피스 타운 단계로 가는 열쇠(직원 16명도 필요)" },
    auto: { era: 2, name: "업무 자동화", icon: "bot", cost: 2000, time: 3 * H, need: ["corp"], opens: "모든 자금 +20%", fx: { money: 0.2 } },
    care: { era: 2, name: "가족 친화 제도", icon: "baby", cost: 2000, time: 3 * H, need: ["corp"], opens: "직장 보육실 · 회사 문화 「신입 공채」" },
    brand: { era: 2, name: "브랜드 전략", icon: "sparkles", cost: 2200, time: 3 * H, need: ["corp"], opens: "인기 +30% · 회사 문화 「성과급」", fx: { rep: 0.3 } },
    tower: { era: 2, name: "사옥 설계", icon: "building-2", cost: 3500, time: 5 * H, need: ["auto", "brand"], key: true, opens: "새 사옥을 지을 수 있어요(1차 마지막)." },
  };
  const RES_KEYS = Object.keys(RES);

  // ── 회사 문화(policy) — 칸 1개(인기 60부터 2개) ─────────────────────
  const POL = {
    casual: { name: "자유 복장", icon: "shirt", req: null, morale: 5, desc: "분위기 +5" },
    flex: { name: "유연 근무", icon: "clock-3", req: "messenger", morale: 10, money: -0.05, desc: "분위기 +10 · 자금 −5%" },
    nolate: { name: "야근 금지", icon: "moon", req: "welfare", morale: 16, money: -0.1, ideas: -0.1, desc: "분위기 +16 · 자금 · 아이디어 −10%" },
    remote: { name: "재택 근무", icon: "house", req: "video", morale: 6, grow: 0.3, desc: "분위기 +6 · 직원 증가 +30%" },
    focus: { name: "집중 근무 시간", icon: "target", req: "lab", morale: -6, ideas: 0.2, desc: "아이디어 +20% · 분위기 −6" },
    club: { name: "동아리 활동", icon: "users", req: "club", morale: 4, rep: 2, desc: "분위기 +4 · 인기 시간당 +2" },
    hire: { name: "신입 공채", icon: "user-plus", req: "care", grow: 0.6, money: -0.08, desc: "직원 증가 +60% · 자금 −8%" },
    bonus: { name: "성과급", icon: "badge-percent", req: "brand", morale: -8, money: 0.2, desc: "자금 +20% · 분위기 −8" },
  };

  // ── 인기(rep) — 문턱마다 땅이 한 칸 저절로 넓어지고, 몇몇 문턱은 해금 ──
  const repTileAt = (n) => 20 + 25 * n + 5 * n * n; // 20 · 50 · 90 · 140 · 200 · 270 …
  const PERKS = [
    { rep: 60, k: "slot2", name: "회사 문화 칸 2개", desc: "회사 문화를 두 개까지 걸 수 있어요." },
    { rep: 200, k: "fastbuild", name: "소문난 회사", desc: "업체가 먼저 와 줘서 건설 시간 −10%." },
    { rep: 400, k: "talent", name: "가고 싶은 회사", desc: "지원자가 몰려 직원 증가 +25%." },
  ];
  const hasPerk = (s, k) => PERKS.some((p) => p.k === k && s.rep >= p.rep);

  // ── 오늘의 소식(cards) — 하루 한 장, 최대 3장까지 쌓임 ─────────────
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

  const POOL = [["h", 22], ["s", 17], ["p", 14], ["w", 12], ["m", 12], ["l", 12], ["c", 11]];
  function picker(rnd, pool) {
    const total = pool.reduce((a, [, w]) => a + w, 0);
    return () => { let x = rnd() * total; for (const [c, w] of pool) { if ((x -= w) < 0) return c; } return "h"; };
  }
  // 새 동네 — 강줄기 하나가 지도를 가로지르고(본사는 피함), 처음 내 땅(본사 둘레 9칸)에 주택가 · 상가 · 쉴 곳이 꼭 있다
  function makeMap(seed) {
    const rnd = rng(seed);
    const pick = picker(rnd, POOL.filter(([c]) => c !== "w"));
    const m = HEX.map((h, i) => (i === HQ ? "H" : pick()));
    const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
    const flip = rnd() < 0.5; // true 면 위→아래로 흐르는 강
    const at = (a, b) => (flip ? idxOf(b, a) : idxOf(a, b));
    let row = [1, 2, 4, 5][Math.floor(rnd() * 4)];
    for (let a = 0; a < N; a++) {
      m[at(a, row)] = "w";
      if (a < N - 1 && rnd() < 0.35) {
        const nr = row + (rnd() < 0.5 ? -1 : 1);
        if (nr >= 0 && nr < N && at(a, nr) !== HQ && at(a + 1, nr) !== HQ) { row = nr; m[at(a, row)] = "w"; }
      }
    }
    const ring1 = shuffle(HEX.map((h, i) => (h.d === 1 && m[i] !== "w" ? i : -1)).filter((i) => i >= 0));
    m[ring1[0]] = "h"; m[ring1[1]] = "s";
    if (!HEX.some((h, i) => h.d === 1 && (m[i] === "p" || m[i] === "w"))) m[ring1[2]] = "p";
    const ring2 = shuffle(HEX.map((h, i) => (h.d === 2 && m[i] !== "w" ? i : -1)).filter((i) => i >= 0));
    let k = 0;
    for (const c of ["c", "m", "l", "h"]) { if (!ring2.some((i) => m[i] === c)) m[ring2[k++]] = c; }
    return m.join("");
  }

  // 예전 육각 판(반지름 3, 37칸) → 7×7 네모 칸. 축 좌표(q, r)를 홀수 줄 밀기 좌표로 바꿔 그대로 얹는다.
  //   칸 종류 · 내 땅 · 건물 · 짓는 중은 그대로, 새로 생기는 모서리 12칸은 무작위 칸 종류의 남의 땅.
  const OLD_HEX = [];
  for (let q = -RADIUS; q <= RADIUS; q++) for (let r = Math.max(-RADIUS, -q - RADIUS); r <= Math.min(RADIUS, -q + RADIUS); r++) OLD_HEX.push([q, r]);
  const OLD_TO_SQ = OLD_HEX.map(([q, r]) => idxOf(q + (r - (r & 1)) / 2 + RADIUS, r + RADIUS));
  function migrate(s) {
    if (!s || s.grid === "sq") return s;
    if (typeof s.map !== "string" || s.map.length !== OLD_HEX.length) return s;
    const pick = picker(rng((s.seed >>> 0) ^ 0x5bd1e995), POOL);
    const map = HEX.map(() => null), own = HEX.map(() => "0");
    OLD_TO_SQ.forEach((j, o) => { map[j] = s.map[o]; own[j] = s.own && s.own[o] === "1" ? "1" : "0"; });
    s.map = map.map((c) => c || pick()).join("");
    s.own = own.join("");
    const bld = {};
    for (const [o, k] of Object.entries(s.bld || {})) { const j = OLD_TO_SQ[+o]; if (j != null && j >= 0) bld[j] = k; }
    s.bld = bld;
    s.builds = (s.builds || []).filter((b) => OLD_TO_SQ[b.i] != null).map((b) => Object.assign({}, b, { i: OLD_TO_SQ[b.i] }));
    s.grid = "sq";
    return s;
  }

  function blank(now) {
    const seed = (Math.random() * 2 ** 31) >>> 0;
    const own = HEX.map((h) => (h.d <= 1 ? "1" : "0")).join("");
    const s = {
      v: 1, grid: "sq", t: now, seed, map: makeMap(seed), own, bld: {}, builds: [], res: null, done: [], era: 0,
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
      if (P.morale) mor.push([`회사 문화 「${P.name}」`, P.morale]);
      mMul += P.money || 0; iMul += P.ideas || 0; grow += P.grow || 0; rep += P.rep || 0;
    }
    for (const k of s.done) { const fx = RES[k].fx; if (fx) { mMul += fx.money || 0; iMul += fx.ideas || 0; rMul += fx.rep || 0; } }
    const buff = s.buffs.reduce((a, b) => a + b.v, 0);
    if (buff) mor.push(["오늘의 소식", buff]);
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
      line: s.fin ? `${ERAS[s.era].name} 완성 · 직원 ${s.staff}명` : `${ERAS[s.era].name} · 직원 ${s.staff}명`,
      level: 1 + s.done.length + (s.fin ? 1 : 0),
    };
  }

  // ── 행동 — 성공하면 null, 안 되면 이유 글자 ───────────────────────
  function canExpand(s, i) {
    if (owned(s, i)) return "이미 내 땅이에요";
    if (!isFrontier(s, i)) return "내 땅과 맞붙은 블록만 살 수 있어요";
    if (s.ap < AP.expand) return `기운이 ${AP.expand} 필요해요`;
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
    if (B.req && !s.done.includes(B.req)) return `「${RES[B.req].name}」 아이디어가 필요해요`;
    return null;
  }
  function canBuild(s, i, k) {
    const B = BLD[k];
    if (!owned(s, i)) return "내 땅에만 지을 수 있어요";
    if (B.hqOnly ? i !== HQ : i === HQ) return B.hqOnly ? "본사 자리에만 지을 수 있어요" : "본사 칸에는 지을 수 없어요";
    if (s.bld[i]) return "이미 건물이 있어요";
    if (building(s, i)) return "짓고 있는 칸이에요";
    const lock = bldLock(s, k); if (lock) return lock;
    if (s.builds.length >= buildSlots(s)) return buildSlots(s) > 1 ? "동시에 두 곳까지만 지을 수 있어요" : "한 번에 한 곳씩 지어요(골목 스타트업부터 두 곳)";
    if (s.ap < AP.build) return `기운이 ${AP.build} 필요해요`;
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
    if (st === "doing") return "회의하고 있어요";
    if (st === "era") return `「${ERAS[RES[k].era].name}」 단계에서 열려요`;
    if (st === "locked") return "먼저 낼 아이디어가 있어요";
    if (s.res) return "회의는 한 번에 하나씩 해요";
    if (s.ideas < RES[k].cost) return "아이디어가 모자라요";
    return null;
  }
  function research(s, k) {
    const why = canResearch(s, k); if (why) return why;
    const t = resTime(s, k);
    s.ideas -= RES[k].cost; s.res = { k, rem: t, tot: t };
    return null;
  }

  function polLock(s, k) { const P = POL[k]; return P.req && !s.done.includes(P.req) ? `「${RES[P.req].name}」 아이디어가 필요해요` : null; }
  function canPolicy(s, slot, k) {
    if (slot >= slotsOf(s)) return "인기 60이 되면 열려요";
    if (k && polLock(s, k)) return polLock(s, k);
    if (k && s.pol.includes(k)) return "이미 걸어 둔 문화예요";
    if (s.ap < AP.policy) return `기운이 ${AP.policy} 필요해요`;
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
      { label: `아이디어 「${RES[E.key].name}」`, ok: s.done.includes(E.key) },
      { label: `직원 ${E.needStaff}명`, ok: s.staff >= E.needStaff, cur: `${s.staff}/${E.needStaff}` },
    ];
  }
  function canEraUp(s) {
    const n = eraNeeds(s);
    if (!n) return "1차의 마지막 단계예요";
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
    H, MIN, MAX_AWAY, AP_MAX, AP_SEC, AP, HEX, N, HQ, NB, idxOf, migrate, TILES, TYPE_BY_KEY, ERAS, BLD, RES, RES_KEYS, POL, PERKS, CARDS,
    repTileAt, hasPerk, blank, rates, advance, catchUp, newLog, grantCards, summarize, dayKey,
    owned, typeOf, isFrontier, ownedCount, expandCost, slotsOf, buildSlots, building, buildTime, buildCost, resTime,
    canExpand, expand, bldLock, canBuild, build, resState, canResearch, research, polLock, canPolicy, setPolicy,
    eraNeeds, canEraUp, eraUp, cardFx, canCard, chooseCard,
  };
  G.CivCore = CivCore;
})(typeof window !== "undefined" ? window : globalThis);

// ══ 화면 ════════════════════════════════════════════════════════════
// HKCiv.mount(el) — 불러오기 · 정산 · 1초마다 진행 · 그리기. 페이지 전용 CSS(.cv-*)는 web/games/civ.html 에 있고,
// 공통 게임 부품(.mgx-* · HKFx)은 /_shared/mgmt-ui.css · /_shared/mgmt-fx.js 를 쓴다.
// 장면: 떠 있는 입체 육각 섬(윗면 + 두께 있는 옆면) — 손가락으로 끌어 옮기고 두 손가락 · 휠로 확대. 시대마다 땅 · 건물 재질, 실제 시각에 맞춰 낮 · 노을 · 밤.
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
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  // 받침에 맞춘 조사 — 을/를 · 으로/로 · 이에요/예요
  const bat = (w) => { const c = String(w).replace(/[^가-힣]+$/, "").slice(-1).charCodeAt(0) - 0xac00; return c >= 0 && c < 11172 ? c % 28 : 0; };
  const eul = (w) => `${w}${bat(w) ? "을" : "를"}`;
  const ro = (w) => { const b = bat(w); return `${w}${b && b !== 8 ? "으로" : "로"}`; };
  const ieyo = (w) => `${w}${bat(w) ? "이에요" : "예요"}`;

  // ── 색 · 빛 ─────────────────────────────────────────────────────────
  // 귀여운 장난감 동네 — 팔레트는 열두어 색으로 묶고(풀 · 보도 · 길 · 물 · 크림 벽 · 파스텔 지붕 여섯), 회색조로 봐도 밝기로 갈리게.
  // 빛은 늘 왼쪽 위 해 하나 — 윗면이 제일 밝고, 왼쪽 앞면 보통, 오른쪽 앞면이 조금 어둡다. 그림자는 옅은 보랏빛.
  const rgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const hexc = (a) => "#" + a.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("");
  const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return hexc(A.map((v, i) => v + (B[i] - v) * t)); };
  const COL = {
    grass: "#bfe59a", grass2: "#a8dc80", meadow: "#d9f0bd", walk: "#f8f0de", curb: "#e4d6b9", road: "#aeb8cf", lane: "#ffffff",
    soil: "#e2b384", water: "#79d4e4", water2: "#b9eff4", wall: "#fff8ec", glass: "#a6dcff", tree: "#7fcb6c", tree2: "#5cb35f", blossom: "#ffb5c8",
    fog: "#ffffff", fogShade: "#dfe4fb", ink: "#4a3f74",
  };
  const ROOF = { coral: "#ff8f7e", mint: "#6fd6b4", butter: "#ffd166", sky: "#7cc6ff", lav: "#b9a2ff", peach: "#ffb58a" };
  // 판 · 알림의 아이콘 색(진한 쪽) · 장면 지붕 색(파스텔 쪽)
  const BCOL = { cafe: "#ff7d6b", dorm: "#9b7cf0", sales: "#3a9be0", meeting: "#22a88f", pr: "#f0679e", lounge: "#1fae9e", server: "#5b7fd6", warehouse: "#e09a12", lab: "#8b6cf0", garden: "#3fa956", daycare: "#ff8a5c", tower: "#1497ae" };
  const BROOF = { cafe: ROOF.coral, dorm: ROOF.lav, sales: ROOF.sky, meeting: ROOF.mint, pr: "#ffa3c6", lounge: ROOF.mint, server: ROOF.sky, warehouse: ROOF.butter, lab: ROOF.lav, garden: ROOF.mint, daycare: ROOF.peach };
  const TCOL = { hq: "#1497ae", house: "#f29a3a", shop: "#ff7d6b", park: "#3fa956", river: "#2aa7d6", hill: "#7bae3c", lot: "#c89a52", campus: "#8b6cf0" };
  const LOTC = { hq: "#ffe3a0", house: "#c4e79f", shop: "#ffe6c9", park: "#a8dc80", river: "#c4e79f", hill: "#b8e18f", lot: "#f1ddb2", campus: "#cde9a9" };
  let phase = "day";
  const SKY = { day: ["#bfe7ff", "#eaf8f1"], dusk: ["#ffc4a6", "#ffeedd"], night: ["#272b6b", "#4a4a92"] };
  // 실제 시각 — 낮은 그대로, 노을은 복숭아빛, 밤은 짙은 남보라(채도는 살리고 회색으로 죽지 않게). 창문 · 가로등은 따뜻한 노랑으로 따로 켠다.
  function tone(c) {
    if (phase === "day") return c;
    const [r, g, b] = rgb(c);
    return hexc(phase === "night" ? [r * 0.5 + 18, g * 0.56 + 20, b * 0.74 + 60] : [r * 0.97 + 8, g * 0.88 + 8, b * 0.8 + 8]);
  }
  function withLook(ph, fn) { const b = phase; phase = ph; try { return fn(); } finally { phase = b; } }
  const PH_PIN = (() => { try { const v = new URLSearchParams(location.search).get("ph"); return ["day", "dusk", "night"].includes(v) ? v : null; } catch (_) { return null; } })(); // 시험용: ?ph=day|dusk|night
  function kstPhase(ms) {
    if (PH_PIN) return PH_PIN;
    const h = new Date(ms + 9 * 3600e3).getUTCHours();
    return h >= 19 || h < 5 ? "night" : h >= 17 || h < 7 ? "dusk" : "day";
  }
  const night = () => phase === "night";

  // ── 비스듬히 내려다본 네모 칸 ───────────────────────────────────────
  // 칸 안 좌표 a(오른쪽 아래 = 칸 번호 c 방향) · b(왼쪽 아래 = 줄 r 방향) · z(높이) → 화면 (a − b, (a + b)/2 − z)
  const A = 13, K = 0.5, RW = 2.7, CURB = 2.4, BH = A - RW, LOT = BH - 1.7;
  const f1 = (v) => (Math.round(v * 10) / 10).toString();
  const P = (pts) => pts.map(([x, y]) => `${f1(x)},${f1(y)}`).join(" ");
  const pt = (a, b, z = 0) => [a - b, (a + b) * K - z];
  const pos = (h) => ({ x: 2 * A * (h.c - h.r), y: A * (h.c + h.r - (C.N - 1)) });
  const up = (p, z) => [p[0], p[1] - z];
  const poly = (pts, fill, ex = "") => `<polygon points="${P(pts)}" fill="${fill}" stroke="${fill}" stroke-width=".7" stroke-linejoin="round"${ex}/>`;
  const sh = (x, y, rx, ry, o = 0.15) => `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(rx)}" ry="${f1(ry)}" fill="${COL.ink}" opacity="${night() ? o * 1.4 : o}"/>`;
  const shades = (c) => ({ top: tone(mix(c, "#ffffff", 0.2)), l: tone(c), r: tone(mix(c, "#6a5a96", 0.2)) });
  function corners(x, y, a, b) {
    return { L: [x - a - b, y + (b - a) * K], B: [x + a - b, y + (a + b) * K], R: [x + a + b, y + (a - b) * K], Bk: [x - a + b, y - (a + b) * K] };
  }
  const onFace = (P1, P2, t, z) => [P1[0] + (P2[0] - P1[0]) * t, P1[1] + (P2[1] - P1[1]) * t - z];
  function quadOn(P1, P2, t1, t2, z1, z2) { return [onFace(P1, P2, t1, z1), onFace(P1, P2, t2, z1), onFace(P1, P2, t2, z2), onFace(P1, P2, t1, z2)]; }
  const dQuad = (q) => `M${f1(q[0][0])} ${f1(q[0][1])}L${f1(q[1][0])} ${f1(q[1][1])}L${f1(q[2][0])} ${f1(q[2][1])}L${f1(q[3][0])} ${f1(q[3][1])}Z`;
  // 큰 창문 점 — 모서리를 둥글게(같은 색 굵은 테두리). 밤엔 따뜻한 노란 불빛이 켜진다
  function windows(P1, P2, h, w, dark) {
    const n = w.n || 2, m = w.m || 1, z0 = w.z0 == null ? 0.22 : w.z0, z1 = w.z1 == null ? 0.84 : w.z1;
    let d = "";
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < m; j++) {
        const t1 = (i + 0.24) / n, t2 = (i + 0.76) / n;
        const za = h * (z0 + ((z1 - z0) * (j + 0.2)) / m), zb = h * (z0 + ((z1 - z0) * (j + 0.8)) / m);
        d += dQuad(quadOn(P1, P2, t1, t2, za, zb));
      }
    }
    if (night()) return `<path d="${d}" fill="#ffd56b" stroke="#ffd56b" stroke-width=".9" stroke-linejoin="round" class="cv-lit"/>`;
    const g = phase === "dusk" ? "#ffe0a8" : w.c || COL.glass;
    const c = tone(dark ? mix(g, "#6a5a96", 0.16) : g);
    return `<path d="${d}" fill="${c}" stroke="${c}" stroke-width=".9" stroke-linejoin="round"/>`;
  }
  // 상자 — x,y: 바닥 가운데 · a: 오른쪽 아래로 반 길이 · b: 왼쪽 아래로 반 길이 · h: 높이
  //   roof: "hip"(네 모 지붕) · "gable"(박공, ridge "a" | "b") · "dome" · 없으면 평지붕(rc 로 윗면 색)
  function box(x, y, a, b, h, col, o = {}) {
    const { L, B, R: Rr, Bk } = corners(x, y, a, b);
    const c = shades(col);
    let out = poly([L, B, up(B, h), up(L, h)], c.l) + poly([B, Rr, up(Rr, h), up(B, h)], c.r);
    if (o.win) out += windows(L, B, h, o.win) + windows(B, Rr, h, o.winR || o.win, true);
    if (o.door) { const dc = tone(o.doorC || "#d09468"); out += `<path d="${dQuad(quadOn(L, B, o.door[0], o.door[1], 0, h * o.door[2]))}" fill="${dc}" stroke="${dc}" stroke-width=".8" stroke-linejoin="round"/>`; }
    if (o.band) { const bc = shades(o.band); out += poly(quadOn(L, B, 0, 1, h * 0.86, h), bc.l) + poly(quadOn(B, Rr, 0, 1, h * 0.86, h), bc.r); }
    const LP = (aa, bb, zz) => [x + aa - bb, y + (aa + bb) * K - zz];
    const rc = shades(o.rc || ROOF.coral), ov = o.ov == null ? 0.8 : o.ov, rh = o.rh || 4;
    if (o.roof === "hip") {
      const a2 = a + ov, b2 = b + ov, he = h - 0.3, ap = LP(0, 0, h + rh);
      out += poly([LP(-a2, b2, he), LP(a2, b2, he), ap], rc.l) + poly([LP(a2, b2, he), LP(a2, -b2, he), ap], rc.r);
      out += `<polyline points="${P([LP(-a2, b2, he), LP(a2, b2, he), LP(a2, -b2, he)])}" fill="none" stroke="${tone(mix(o.rc || ROOF.coral, "#6a5a96", 0.35))}" stroke-width=".7" stroke-linejoin="round"/>`;
    } else if (o.roof === "gable") {
      const a2 = a + ov, b2 = b + ov, he = h - 0.3;
      const wr = shades(col).r, wl = shades(col).l;
      if (o.ridge === "b") {
        const rS = LP(0, -b2, h + rh), rE = LP(0, b2, h + rh);
        out += poly([LP(-a, b, h), LP(a, b, h), LP(0, b, h + rh - 0.3)], wl);
        out += poly([LP(a2, -b2, he), LP(a2, b2, he), rE, rS], rc.r) + poly([LP(-a2, b2, he), rE, LP(-a2 * 0.15, b2, he + rh * 0.85)], rc.l);
        out += `<polyline points="${P([LP(-a2, b2, he), rE, LP(a2, b2, he), LP(a2, -b2, he)])}" fill="none" stroke="${tone(mix(o.rc || ROOF.coral, "#6a5a96", 0.35))}" stroke-width=".7" stroke-linejoin="round"/>`;
      } else {
        const rS = LP(-a2, 0, h + rh), rE = LP(a2, 0, h + rh);
        out += poly([LP(a, b, h), LP(a, -b, h), LP(a, 0, h + rh - 0.3)], wr);
        out += poly([LP(-a2, b2, he), LP(a2, b2, he), rE, rS], rc.l);
        out += `<polyline points="${P([LP(-a2, b2, he), LP(a2, b2, he), rE])}" fill="none" stroke="${tone(mix(o.rc || ROOF.coral, "#6a5a96", 0.35))}" stroke-width=".7" stroke-linejoin="round"/>`;
      }
    } else {
      out += poly([up(Bk, h), up(Rr, h), up(B, h), up(L, h)], o.rc ? rc.top : c.top);
      if (o.roof === "dome") {
        const rr = Math.min(a, b) * 1.15, cy = y - h;
        out += `<path d="M${f1(x - rr)} ${f1(cy)}A${f1(rr)} ${f1(rr * 0.95)} 0 0 1 ${f1(x + rr)} ${f1(cy)}A${f1(rr)} ${f1(rr * K)} 0 0 1 ${f1(x - rr)} ${f1(cy)}Z" fill="${rc.l}"/>` +
          `<circle cx="${f1(x - rr * 0.38)}" cy="${f1(cy - rr * 0.5)}" r="${f1(rr * 0.2)}" fill="#fff" opacity=".55"/>`;
      }
    }
    return out;
  }
  // 막대사탕 나무 · 덤불 · 사람 · 가로등
  function lolly(x, y, sc = 1, d = 0, col = COL.tree) {
    const c1 = tone(col), c2 = tone(mix(col, "#2f7a4a", 0.22)), hl = tone(mix(col, "#ffffff", 0.45));
    return sh(x + 1.4 * sc, y + 0.5, 3.6 * sc, 1.7 * sc) +
      `<g class="cv-sway" style="animation-delay:-${f1(d)}s"><rect x="${f1(x - 0.55 * sc)}" y="${f1(y - 5 * sc)}" width="${f1(1.1 * sc)}" height="${f1(5 * sc)}" rx=".5" fill="${tone("#b77d55")}"/>` +
      `<circle cx="${f1(x)}" cy="${f1(y - 7.6 * sc)}" r="${f1(3.9 * sc)}" fill="${c2}"/><circle cx="${f1(x - 0.5 * sc)}" cy="${f1(y - 8.1 * sc)}" r="${f1(3.3 * sc)}" fill="${c1}"/>` +
      `<circle cx="${f1(x - 1.5 * sc)}" cy="${f1(y - 9.4 * sc)}" r="${f1(1.1 * sc)}" fill="${hl}"/></g>`;
  }
  const bush = (x, y, sc = 1, col = COL.tree) => sh(x + 0.8, y + 0.4, 3 * sc, 1.2 * sc) + `<circle cx="${f1(x - 1.4 * sc)}" cy="${f1(y - 1.2 * sc)}" r="${f1(1.7 * sc)}" fill="${tone(mix(col, "#2f7a4a", 0.15))}"/><circle cx="${f1(x + 0.6 * sc)}" cy="${f1(y - 1.6 * sc)}" r="${f1(2 * sc)}" fill="${tone(col)}"/><circle cx="${f1(x)}" cy="${f1(y - 2.4 * sc)}" r="${f1(0.7 * sc)}" fill="${tone(mix(col, "#ffffff", 0.45))}"/>`;
  function person(x, y, col, d, dx = 3, dy = 1.5) {
    return `<g class="cv-walk" style="--dx:${dx}px;--dy:${dy}px;animation-delay:-${f1(d)}s"><ellipse cx="${f1(x)}" cy="${f1(y + 0.3)}" rx="1.3" ry=".55" fill="${COL.ink}" opacity=".2"/><rect x="${f1(x - 0.85)}" y="${f1(y - 2.7)}" width="1.7" height="2.7" rx=".85" fill="${tone(col)}"/><circle cx="${f1(x)}" cy="${f1(y - 3.6)}" r="1.05" fill="${tone("#ffd9b8")}"/></g>`;
  }
  function lamp(x, y) {
    let o = `<path d="M${f1(x)} ${f1(y)}V${f1(y - 7)}" stroke="${tone("#7b80a8")}" stroke-width=".7" stroke-linecap="round"/>`;
    if (night()) o = `<ellipse cx="${f1(x)}" cy="${f1(y + 0.4)}" rx="7" ry="3.4" fill="url(#cvLampG)" class="cv-lampg"/>` + o + `<circle cx="${f1(x)}" cy="${f1(y - 7.2)}" r="3.6" fill="url(#cvLampH)"/>`;
    return o + `<circle cx="${f1(x)}" cy="${f1(y - 7.2)}" r="1" fill="${night() ? "#fff1b8" : tone("#fff6d6")}" stroke="${tone("#7b80a8")}" stroke-width=".4"/>`;
  }
  const flag = (x, y, h, col, w = 4.4) => `<path d="M${f1(x)} ${f1(y)}V${f1(y - h)}" stroke="${tone("#7b6a8f")}" stroke-width=".6" stroke-linecap="round"/><path class="cv-flag" d="M${f1(x)} ${f1(y - h)}h${f1(w)}l-1 1.3 1 1.3H${f1(x)}z" fill="${tone(col)}"/>`;
  // 앞면(+b 면)에 줄무늬 차양
  function awning(x, y, a, b, h, col, z1 = 0.46, z2 = 0.66) {
    const c = corners(x, y, a, b);
    let o = "";
    for (let n = 0; n < 6; n++) o += `<path d="${dQuad(quadOn(c.L, c.B, n / 6, (n + 1) / 6, h * z1, h * z2).map(([px, py], j) => (j < 2 ? [px - 0.9, py + 1.1] : [px, py])))}" fill="${tone(n % 2 ? "#ffffff" : col)}"/>`;
    return o;
  }
  // 그릴 것들을 깊이(a + b) 순으로 — 뒤에서 앞으로
  const layer = (items) => items.sort((p, q) => p[0] - q[0]).map((it) => it[1]()).join("");
  const at = (a, b) => pt(a, b);

  // 집 한 채 — 몸통은 짧고 지붕은 크게(머리 큰 비율)
  function cottage(a, b, s, rc, ridge = "a", wall = COL.wall) {
    const [x, y] = at(a, b);
    return sh(x + 1.2, y + 1.2, 4.6 * s, 2.2 * s) + box(x, y, 2.8 * s, 2.5 * s, 3.6 * s, wall, {
      win: { n: 1, m: 1, z0: 0.3, z1: 0.8 }, door: ridge === "b" ? [0.38, 0.62, 0.62] : [0.15, 0.42, 0.62], roof: "gable", ridge, rh: 4.2 * s, ov: 0.75 * s, rc,
    });
  }
  // 칸 종류마다 귀여운 상징물(빈 내 땅 · 살 수 있는 땅)
  function riverDirs(i) {
    const h = HEX[i], out = [];
    const isW = (c, r) => { const j = C.idxOf(c, r); return j >= 0 && s.map[j] === "w"; };
    if (isW(h.c + 1, h.r)) out.push("+a");
    if (isW(h.c - 1, h.r)) out.push("-a");
    if (isW(h.c, h.r + 1)) out.push("+b");
    if (isW(h.c, h.r - 1)) out.push("-b");
    return out.length ? out : ["-a", "+a"];
  }
  function canal(i, reach) {
    const dirs = riverDirs(i), w = 3.3, e = reach;
    const band = (d, hw) => d === "+a" ? [[-hw, -hw], [e, -hw], [e, hw], [-hw, hw]] : d === "-a" ? [[-e, -hw], [hw, -hw], [hw, hw], [-e, hw]] : d === "+b" ? [[-hw, -hw], [hw, -hw], [hw, e], [-hw, e]] : [[-hw, -e], [hw, -e], [hw, hw], [-hw, hw]];
    const quad = (q, col) => `<polygon points="${P(q.map(([aa, bb]) => pt(aa, bb)))}" fill="${col}" stroke="${col}" stroke-width=".6" stroke-linejoin="round"/>`;
    let o = dirs.map((d) => quad(band(d, w + 0.9), tone("#e9dcc0"))).join("") + quad([[-w - 0.9, -w - 0.9], [w + 0.9, -w - 0.9], [w + 0.9, w + 0.9], [-w - 0.9, w + 0.9]], tone("#e9dcc0"));
    o += dirs.map((d) => quad(band(d, w), tone(COL.water))).join("") + quad([[-w, -w], [w, -w], [w, w], [-w, w]], tone(COL.water));
    o += dirs.map((d, n) => {
      const along = d[1] === "a";
      const [x1, y1] = along ? pt(d[0] === "+" ? 0.5 : -e + 1, -0.8) : pt(-0.8, d[0] === "+" ? 0.5 : -e + 1);
      const [x2, y2] = along ? pt(d[0] === "+" ? e - 1 : -0.5, -0.8) : pt(-0.8, d[0] === "+" ? e - 1 : -0.5);
      return `<path class="cv-wave" style="animation-delay:-${n * 0.7}s" d="M${f1(x1)} ${f1(y1)}L${f1(x2)} ${f1(y2)}" stroke="${tone(COL.water2)}" stroke-width="1.1" stroke-linecap="round"/>`;
    }).join("");
    return o;
  }
  function motif(k, i) {
    const d = (i * 0.37) % 3;
    switch (k) {
      case "house":
        return layer([
          [-7.2, () => cottage(-3.6, -3.6, 1, ROOF.coral, "b")],
          [1, () => cottage(3.9, -2.9, 0.92, ROOF.sky, "a")],
          [0.8, () => cottage(-2.9, 3.7, 0.95, ROOF.butter, "b")],
          [9, () => lolly(...at(4.8, 4.4), 0.8, d)],
          [-2, () => bush(...at(-6.6, 0.4), 0.8)],
        ]);
      case "shop": {
        const s1 = at(-2.4, -2.4), s2 = at(4.4, 3.6);
        return layer([
          [-4.8, () => sh(s1[0] + 1.5, s1[1] + 2, 9, 3.6) + box(s1[0], s1[1], 3.9, 3.5, 6, COL.wall, { win: { n: 2, m: 1, z0: 0.06, z1: 0.42, c: "#c9ecff" }, winR: { n: 2, m: 1, z0: 0.56, z1: 0.88 }, band: ROOF.coral, rc: "#fbe7d0" }) + awning(s1[0], s1[1], 3.9, 3.5, 6, ROOF.coral)],
          [8, () => sh(s2[0] + 1.2, s2[1] + 1.4, 6.4, 2.6) + box(s2[0], s2[1], 2.7, 2.8, 5, "#fff1e2", { win: { n: 1, m: 1, z0: 0.06, z1: 0.42, c: "#c9ecff" }, band: ROOF.mint, rc: "#fbe7d0" }) + awning(s2[0], s2[1], 2.7, 2.8, 5, ROOF.mint)],
          [2, () => person(...at(-3, 4.6), ROOF.sky, d, 3, 1.5)],
          [3.4, () => person(...at(1.8, 1.6), ROOF.coral, d + 2.4, -2.6, 1.3)],
          [-0.5, () => lamp(...at(7.2, -7.6))],
        ]);
      }
      case "park": {
        const [px, py] = at(1.6, 1.4);
        return `<path d="M${P([at(-8.6, 3), at(-2, 1.5), at(1, 6), at(3, 8.6)]).replace(/ /g, " L")}" fill="none" stroke="${tone("#f6ecd2")}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>` +
          `<ellipse cx="${f1(px)}" cy="${f1(py)}" rx="5" ry="2.5" fill="${tone(COL.water)}" stroke="${tone("#e9dcc0")}" stroke-width=".9"/><ellipse cx="${f1(px - 1.2)}" cy="${f1(py - 0.5)}" rx="2" ry=".7" fill="${tone(COL.water2)}"/>` +
          `<g class="cv-bob"><circle cx="${f1(px + 1.6)}" cy="${f1(py - 0.4)}" r=".9" fill="${tone("#ffd84d")}"/><circle cx="${f1(px + 2.3)}" cy="${f1(py - 0.9)}" r=".55" fill="${tone("#ffd84d")}"/></g>` +
          layer([
            [-8, () => lolly(...at(-4.6, -3.4), 1, d)],
            [-3, () => lolly(...at(2.4, -5.4), 0.9, d + 1, COL.blossom)],
            [6, () => lolly(...at(5.6, 0.8), 0.85, d + 2, COL.tree2)],
            [3.6, () => lolly(...at(-1.4, 5), 0.75, d + 0.6, COL.blossom)],
            [-2, () => `<rect x="${f1(at(-5, 2.4)[0] - 2)}" y="${f1(at(-5, 2.4)[1] - 1.6)}" width="4" height="1.2" rx=".5" fill="${tone("#c98e5f")}"/>`],
            [5, () => person(...at(-2.2, 1.4), ROOF.lav, d + 1, 2.4, 1.2)],
          ]);
      }
      case "river":
        return canal(i, BH + 0.2) + layer([
          [-9, () => lolly(...at(-5.6, -5.4), 0.8, d)],
          [8.6, () => lolly(...at(5.8, 5.2), 0.7, d + 1, COL.blossom)],
          [-1, () => `<path d="M${f1(at(-6.4, 4.4)[0])} ${f1(at(-6.4, 4.4)[1])}v-3.2M${f1(at(-5.6, 5)[0])} ${f1(at(-5.6, 5)[1])}v-4M${f1(at(-4.8, 5.4)[0])} ${f1(at(-4.8, 5.4)[1])}v-2.6" stroke="${tone(COL.tree2)}" stroke-width=".8" stroke-linecap="round"/>`],
          [0.2, () => `<g class="cv-bob" style="animation-delay:-${f1(d)}s"><ellipse cx="0.6" cy=".2" rx="1.5" ry="1" fill="${tone("#ffffff")}"/><circle cx="1.6" cy="-.7" r=".8" fill="${tone("#ffffff")}"/><path d="M2.3 -.7l.9 .25-.9 .25z" fill="${tone("#ff9a3c")}"/></g>`],
        ]);
      case "hill": {
        const m1 = tone("#9fd36f"), m2 = tone("#86c35c"), m3 = tone("#c5ec9c");
        const [wx, wy] = [1.2, -6.6];
        return sh(1, 2.4, 13, 4.4) + `<path d="M-13 2.4C-11 -9 9 -10 13 2.4Q0 7 -13 2.4Z" fill="${m2}"/><path d="M-13 2.4C-11 -9 2 -10 4 -6C0 -3 -3 2 -2 5.4Q-8 4.6 -13 2.4Z" fill="${m1}"/><path d="M-8 -4C-6 -7.5 -2 -8 0 -7.4C-3 -6 -5 -4 -6.4 -1.8Z" fill="${m3}"/>` +
          `<circle cx="-7" cy="1" r=".8" fill="${tone("#ffffff")}"/><circle cx="-4.6" cy="2.6" r=".8" fill="${tone("#ffd84d")}"/><circle cx="6" cy="1.6" r=".8" fill="${tone("#ff9fb6")}"/>` +
          `<path d="M${wx - 1.8} ${wy + 6.4}L${wx - 1} ${wy - 1}H${wx + 1}L${wx + 1.8} ${wy + 6.4}Z" fill="${tone("#fff8ec")}" stroke="${tone("#fff8ec")}" stroke-width=".6" stroke-linejoin="round"/><path d="M${wx - 1.6} ${wy - 0.8}L${wx} ${wy - 3}L${wx + 1.6} ${wy - 0.8}Z" fill="${tone(ROOF.coral)}"/><rect x="${wx - 0.5}" y="${wy + 3.6}" width="1" height="2.4" rx=".4" fill="${tone("#d09468")}"/>` +
          `<g transform="translate(${wx} ${wy - 0.8})"><g class="cv-mill">${[0, 90, 180, 270].map((r) => `<path transform="rotate(${r})" d="M-.5 0L-.9 -6.4H.9L.5 0Z" fill="${tone("#ffffff")}" stroke="${tone("#e7dccb")}" stroke-width=".3"/>`).join("")}<circle r=".8" fill="${tone(ROOF.coral)}"/></g></g>`;
      }
      case "lot": {
        const c = corners(...at(-1.6, -1.4), 4.6, 3.8);
        const cone = (a, b) => { const [x, y] = at(a, b); return sh(x + 0.6, y + 0.3, 1.8, 0.7) + `<path d="M${f1(x - 1.4)} ${f1(y)}L${f1(x)} ${f1(y - 4)}L${f1(x + 1.4)} ${f1(y)}Z" fill="${tone("#ff9a3c")}"/><path d="M${f1(x - 0.75)} ${f1(y - 1.9)}h1.5l.25 .8h-2z" fill="#fff"/><rect x="${f1(x - 1.8)}" y="${f1(y - 0.3)}" width="3.6" height=".8" rx=".3" fill="${tone("#ef7d22")}"/>`; };
        const fl = ["#ff9fb6", "#ffd84d", "#ffffff", "#b9a2ff", "#ff8f7e"];
        let flowers = "";
        for (let n = 0; n < 9; n++) { const [x, y] = at(2.4 + (n % 3) * 1.9, 2.2 + Math.floor(n / 3) * 1.9); flowers += `<circle cx="${f1(x)}" cy="${f1(y - 0.8)}" r=".9" fill="${tone(fl[(n + i) % fl.length])}"/><path d="M${f1(x)} ${f1(y)}v-.6" stroke="${tone(COL.tree2)}" stroke-width=".5"/>`; }
        return `<polygon points="${P([c.Bk, c.R, c.B, c.L])}" fill="${tone("#ead2a0")}" stroke="${tone("#c9ad7c")}" stroke-width=".8" stroke-dasharray="2 1.6"/>` +
          box(...at(-3.6, -2.2), 1.6, 1.6, 1.6, "#e9b48a") + box(...at(-1.2, -2.8), 1.6, 1.6, 1.6, "#f2c49c") + box(...at(-2.4, -2.5), 1.6, 1.6, 3.2, "#e9b48a") +
          `<polygon points="${P([at(1.6, 1.4), at(8, 1.4), at(8, 7.8), at(1.6, 7.8)])}" fill="${tone("#a7cf7a")}"/>` + flowers + cone(-5.6, 3.4) + cone(-2.6, 5.6);
      }
      case "campus": {
        const m = at(1.6, 1.4), t = at(-4, -3);
        return layer([
          [-7, () => sh(t[0] + 1, t[1] + 1, 3.4, 1.6) + box(t[0], t[1], 1.9, 1.9, 11, COL.wall, { win: { n: 1, m: 2, z0: 0.15, z1: 0.6 }, roof: "hip", rh: 4.4, ov: 0.5, rc: ROOF.lav }) +
            `<circle cx="${f1(t[0] - 1.1)}" cy="${f1(t[1] - 8.8)}" r="1.25" fill="${tone("#ffffff")}" stroke="${tone(ROOF.lav)}" stroke-width=".4"/><path d="M${f1(t[0] - 1.1)} ${f1(t[1] - 8.8)}v-.8M${f1(t[0] - 1.1)} ${f1(t[1] - 8.8)}h.6" stroke="${tone(COL.ink)}" stroke-width=".35" stroke-linecap="round"/>`],
          [3, () => sh(m[0] + 1.5, m[1] + 1.6, 9, 3.4) + box(m[0], m[1], 5, 3.4, 5.6, COL.wall, { win: { n: 4, m: 1, z0: 0.18, z1: 0.8 }, winR: { n: 2, m: 1 }, door: [0.42, 0.58, 0.56], roof: "hip", rh: 3.6, ov: 0.7, rc: ROOF.lav })],
          [9, () => lolly(...at(6.6, 3.6), 0.65, d)],
          [-1, () => lolly(...at(-6.8, 3.2), 0.6, d + 1.2, COL.blossom)],
          [6, () => person(...at(-2.4, 6.4), ROOF.peach, d, 2.6, 1.3)],
        ]);
      }
      default: return "";
    }
  }
  // 건물이 선 칸에도 남는 땅 모습
  function groundDeco(k, i) {
    const d = (i * 0.37) % 3;
    if (k === "river") return canal(i, BH + 0.2);
    if (k === "park") return lolly(...at(-7, -6.4), 0.7, d) + lolly(...at(6.6, -6.8), 0.6, d + 1, COL.blossom);
    if (k === "house") return lolly(...at(-7, -6.6), 0.6, d);
    if (k === "campus") return lolly(...at(-7, -6.6), 0.6, d, COL.blossom);
    if (k === "hill") return `<path d="M-15 -2C-13 -9 -5 -10 -2 -4Z" fill="${tone("#9fd36f")}"/>`;
    if (k === "lot") return `<path d="M${f1(at(-7.6, -2)[0] - 1.2)} ${f1(at(-7.6, -2)[1])}L${f1(at(-7.6, -2)[0])} ${f1(at(-7.6, -2)[1] - 3.4)}L${f1(at(-7.6, -2)[0] + 1.2)} ${f1(at(-7.6, -2)[1])}Z" fill="${tone("#ff9a3c")}"/>`;
    return "";
  }

  // 회사 건물 — 칸 하나에 하나. 저마다 알아보기 쉬운 모양 + 둥실 떠 있는 간판 아이콘
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
  const BHT = [6, 8.5, 11]; // 단계별 회사 건물 몸통 높이
  const BSPEC = {
    cafe: { roof: "hip", rh: 4.4, a: 5, b: 4.6 },
    dorm: { roof: "gable", ridge: "a", rh: 4.6, a: 5.2, b: 4.2, n: 3 },
    sales: { a: 5, b: 4.8, n: 3, band: true },
    meeting: { roof: "hip", rh: 3.6, a: 5.4, b: 4.6, n: 3 },
    pr: { a: 4.8, b: 4.6, band: true },
    lounge: { a: 5.2, b: 4.8, hk: 0.85 },
    server: { a: 4.6, b: 4.6, n: 2, wall: "#e6ebfb", band: true },
    warehouse: { roof: "gable", ridge: "a", rh: 2.8, a: 6.2, b: 4.8, hk: 0.75, n: 3 },
    lab: { roof: "dome", a: 5, b: 5, n: 3 },
    garden: { roof: "gable", ridge: "b", rh: 3.4, a: 5, b: 4.8, wall: "#e9fbff", n: 3, glass: true },
    daycare: { roof: "hip", rh: 4.6, a: 5, b: 4.6 },
  };
  const bldBody = (k, era) => BHT[era] * (BSPEC[k].hk || 1);
  const bldSignY = (k, era) => -(bldBody(k, era) + (BSPEC[k].rh || (BSPEC[k].roof === "dome" ? 5.5 : 2)) + 7);
  function sign(k, y) {
    return `<g transform="translate(0 ${f1(y)})"><g class="cv-bob"><path d="M0 4.6l-1.6 -2.4h3.2z" fill="#fff"/><circle r="5.4" fill="#fff"/><circle r="4.4" fill="${BCOL[k]}"/><g transform="scale(.6)">${GLYPH[k] || ""}</g></g></g>`;
  }
  function bldArt(k, era) {
    const S = BSPEC[k], h = bldBody(k, era), rc = BROOF[k], a = S.a || 5, b = S.b || 4.8;
    const wall = S.wall || COL.wall, rows = era + 1;
    let o = sh(1.6, 3.2, a + b + 2.4, (a + b) * 0.42);
    o += box(0, 0, a, b, h, wall, {
      win: S.glass ? { n: 3, m: 1, z0: 0.08, z1: 0.92, c: "#c8f0e6" } : { n: S.n || 2, m: rows, z0: 0.16, z1: 0.86 },
      door: k === "warehouse" ? [0.3, 0.7, 0.62] : [0.42, 0.58, rows > 1 ? 0.28 : 0.5], doorC: k === "warehouse" ? "#f3e2b6" : null,
      band: S.band ? rc : null, roof: S.roof, ridge: S.ridge, rh: S.rh, ov: 0.8, rc,
    });
    const top = [0, -h];
    if (k === "cafe") o += awning(0, 0, a, b, h, ROOF.coral, 0.4, 0.62 / rows + 0.1) + (() => { const [x, y] = at(7, 6.6); return `<path d="M${f1(x)} ${f1(y)}v-4" stroke="${tone("#9a8fb8")}" stroke-width=".5"/><path d="M${f1(x - 3)} ${f1(y - 3.6)}Q${f1(x)} ${f1(y - 7)} ${f1(x + 3)} ${f1(y - 3.6)}Z" fill="${tone(ROOF.coral)}"/><path d="M${f1(x - 1)} ${f1(y - 3.9)}Q${f1(x)} ${f1(y - 6.6)} ${f1(x + 1)} ${f1(y - 3.9)}Z" fill="${tone("#ffffff")}"/>`; })();
    if (k === "dorm") o += box(2.2, -h - 1.8, 0.8, 0.8, 3.4, "#e9a98a", { rc: "#d98c6c" });
    if (k === "sales" || k === "pr") o += box(top[0] - 1, top[1] - 0.4, 3.6, 0.5, 3.2, BCOL[k], { rc: mix(BCOL[k], "#ffffff", 0.3) }) + `<path d="M${f1(top[0] - 4)} ${f1(top[1] - 1.7)}h4.4" stroke="#fff" stroke-width=".7" stroke-linecap="round" opacity=".9"/>`;
    if (k === "lounge") o += `<path d="M1 ${f1(top[1] + 0.6)}v-4.6" stroke="${tone("#9a8fb8")}" stroke-width=".5"/><path d="M-3 ${f1(top[1] - 3.6)}Q1 ${f1(top[1] - 7.4)} 5 ${f1(top[1] - 3.6)}Z" fill="${tone(ROOF.mint)}"/>` + lolly(-3.6, top[1] + 2.8, 0.45, 1);
    if (k === "server") {
      const c = corners(0, 0, a, b);
      o += `<path d="M2 ${f1(top[1] + 1)}V${f1(top[1] - 6)}" stroke="${tone("#8a90b8")}" stroke-width=".6"/><circle cx="2" cy="${f1(top[1] - 6.2)}" r=".9" fill="#ff6b8a" class="cv-blink"/>`;
      for (let n = 0; n < rows + 1; n++) { const p = onFace(c.B, c.R, 0.3, h * (0.2 + n * 0.22)); o += `<circle cx="${f1(p[0])}" cy="${f1(p[1])}" r=".55" fill="${n % 2 ? "#5ee8a0" : "#7cc6ff"}" class="cv-blink" style="animation-delay:-${n * 0.4}s"/>`; }
    }
    if (k === "lab") o += `<path d="M-2.4 ${f1(top[1] - 4.6)}V${f1(top[1] - 9)}" stroke="${tone("#8a90b8")}" stroke-width=".6"/><circle cx="-2.4" cy="${f1(top[1] - 9.2)}" r=".9" fill="#7cf0c9" class="cv-blink"/>`;
    if (k === "garden") o += [-2.6, 0, 2.6].map((dx, n) => `<circle cx="${f1(dx)}" cy="${f1(-h * 0.35 + n * 0.6)}" r="1.3" fill="${tone(n % 2 ? COL.blossom : COL.tree)}" opacity=".9"/>`).join("");
    if (k === "daycare") o += `<g class="cv-bob"><path d="M6.2 ${f1(-h + 1)}q-.8 -3 .4 -6M7.4 ${f1(-h + 1)}q.6 -2.4 1.6 -4.6" fill="none" stroke="${tone("#9a8fb8")}" stroke-width=".35"/><ellipse cx="6.6" cy="${f1(-h - 6.4)}" rx="1.5" ry="1.8" fill="${tone(ROOF.coral)}"/><ellipse cx="9" cy="${f1(-h - 4.6)}" rx="1.4" ry="1.7" fill="${tone(ROOF.sky)}"/></g>`;
    return o + sign(k, bldSignY(k, era));
  }

  // 본사 — 차고(셔터 문 작은 집) → 아담한 사무실(간판) → 본사 빌딩(깃발 · 로고 · 옥상 정원) → 새 사옥(랜드마크). 다른 건물보다 한눈에 띄게
  const HQ_TOP = [-19, -29, -50];
  const TOWER_TOP = -76;
  const logo = (x, y, r) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="#fff"/><circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r * 0.8)}" fill="${tone("#1fb3c8")}"/><path d="M${f1(x)} ${f1(y - r * 0.5)}l${f1(r * 0.16)} ${f1(r * 0.34)} ${f1(r * 0.36)} .02 -${f1(r * 0.28)} ${f1(r * 0.22)} .1 ${f1(r * 0.36)} -${f1(r * 0.34)} -${f1(r * 0.2)} -${f1(r * 0.34)} ${f1(r * 0.2)} .1 -${f1(r * 0.36)} -${f1(r * 0.28)} -${f1(r * 0.22)} ${f1(r * 0.36)} -.02z" fill="#fff"/>`;
  function hqArt(era, tower) {
    const acc = "#1fb3c8";
    if (tower) {
      let o = sh(2, 4.4, 17, 6.6, 0.2);
      o += box(0, 0, 8, 7.6, 4.4, "#fff8ec", { win: { n: 4, m: 1, z0: 0.12, z1: 0.88, c: "#c9ecff" }, rc: "#bde8a0" });
      o += lolly(...at(-6.2, -5.6), 0.5, 0.4) + lolly(...at(6.2, -6), 0.5, 1.2, COL.blossom);
      o += box(0, -4.4, 5.2, 4.8, 44, "#e3f4ff", { win: { n: 3, m: 11, z0: 0.04, z1: 0.96, c: "#8fd0f5" }, band: acc, rc: "#bfe6ff" });
      o += box(0, -48.4, 3.8, 3.5, 5, acc, { win: { n: 2, m: 1, z0: 0.3, z1: 0.75, c: "#ffffff" }, rc: "#bdeef5" });
      o += `<path d="M-4.2 -53.4A4.2 4.4 0 0 1 4.2 -53.4A4.2 2.1 0 0 1 -4.2 -53.4Z" fill="${tone(ROOF.butter)}"/><circle cx="-1.6" cy="-55.6" r=".9" fill="#fff" opacity=".6"/>`;
      o += flag(0, -57.6, 11, ROOF.coral, 5) + logo(-3, -42, 2.6);
      o += lolly(...at(5.6, 6.4), 0.55, 0.8) + bush(...at(-6.8, 5.6), 0.7, COL.blossom);
      return o;
    }
    if (era === 0) {
      const c = corners(-0.4, -0.4, 5.4, 4.6), h = 5.2;
      let o = sh(1.6, 3.4, 12, 4.8, 0.17) + box(...at(-0.4, -0.4), 5.4, 4.6, h, COL.wall, { winR: { n: 1, m: 1, z0: 0.3, z1: 0.8 }, roof: "gable", ridge: "b", rh: 5.4, ov: 1, rc: ROOF.coral });
      const sq = quadOn(c.L, c.B, 0.16, 0.84, 0, h * 0.78);
      o += `<path d="${dQuad(sq)}" fill="${tone("#d3dcf0")}" stroke="${tone("#d3dcf0")}" stroke-width=".7" stroke-linejoin="round"/>`;
      let ln = ""; for (let n = 1; n < 5; n++) ln += `M${f1(onFace(c.L, c.B, 0.16, (h * 0.78 * n) / 5)[0])} ${f1(onFace(c.L, c.B, 0.16, (h * 0.78 * n) / 5)[1])}L${f1(onFace(c.L, c.B, 0.84, (h * 0.78 * n) / 5)[0])} ${f1(onFace(c.L, c.B, 0.84, (h * 0.78 * n) / 5)[1])}`;
      o += `<path d="${ln}" stroke="${tone("#a9b6d3")}" stroke-width=".55"/>`;
      o += flag(...at(5.6, -4.4), 11, acc) + bush(...at(-7, 4.4), 0.7) + lolly(...at(-6.8, -6.2), 0.7, 0.5);
      const [mx, my] = at(6.4, 5.6);
      o += `<rect x="${f1(mx - 0.3)}" y="${f1(my - 3.2)}" width=".6" height="3.2" fill="${tone("#9a8fb8")}"/><rect x="${f1(mx - 1.3)}" y="${f1(my - 4.6)}" width="2.6" height="1.8" rx=".8" fill="${tone(ROOF.sky)}"/>`;
      return o;
    }
    if (era === 1) {
      const h = 17;
      let o = sh(2, 4, 14, 5.4, 0.18) + lolly(...at(-6.8, -6), 0.65, 0.4);
      o += box(0, 0, 5.8, 5.2, h, COL.wall, { win: { n: 3, m: 3, z0: 0.24, z1: 0.88 }, door: [0.4, 0.6, 0.2], band: acc, rc: "#f3ead6" });
      o += awning(0, 0, 5.8, 5.2, h, acc, 0.2, 0.28);
      o += box(-0.6, -h - 0.4, 3.4, 0.6, 3.6, acc, { rc: "#8fe0ea" }) + logo(-0.3, -h - 2.4, 1.3);
      o += lolly(...at(7, 3.6), 0.6, 1.1, COL.blossom) + bush(...at(3.4, 7.2), 0.65) + flag(...at(4.6, -4.4).map((v, n) => v - (n ? h : 0)), 7, ROOF.butter);
      return o;
    }
    const h = 30;
    let o = sh(2, 4.4, 15, 6, 0.2) + lolly(...at(-7, -6.4), 0.6, 0.4, COL.blossom);
    o += box(0, 0, 6.2, 5.6, h, "#fffdf6", { win: { n: 3, m: 6, z0: 0.1, z1: 0.88 }, door: [0.4, 0.6, 0.12], band: acc, rc: "#c8eba4" });
    o += lolly(...at(-4.2, -4.6).map((v, n) => v - (n ? h : 0)), 0.45, 0.6) + lolly(...at(4.4, 3.8).map((v, n) => v - (n ? h : 0)), 0.42, 1.4, COL.blossom);
    o += box(0, -h, 3.6, 3.2, 6, ROOF.mint, { win: { n: 2, m: 1, z0: 0.3, z1: 0.7, c: "#ffffff" }, rc: "#bdf0df" });
    o += flag(1.4, -h - 6, 8, ROOF.coral) + logo(-3.6, -h + 3.6, 2.2);
    o += lolly(...at(7, 4.2), 0.6, 1.2) + bush(...at(-6.6, 6), 0.7, COL.blossom);
    return o;
  }
  const RING = 2 * Math.PI * 4.6;
  function craneArt(i, era, top) {
    const h = BHT[era], c = corners(0, 0, 5, 4.8);
    const sc = (z) => P([up(c.L, z), up(c.B, z), up(c.R, z)]);
    let o = `<g><polygon points="${P([c.L, c.B, c.R, up(c.R, h), up(c.Bk, h), up(c.L, h)])}" fill="rgba(255,206,90,.16)"/>`;
    for (const z of [0, h / 2, h]) o += `<polyline points="${sc(z)}" fill="none" stroke="${tone("#ffb020")}" stroke-width=".8"/>`;
    for (const p of [c.L, c.B, c.R]) o += `<path d="M${f1(p[0])} ${f1(p[1])}V${f1(p[1] - h)}" stroke="${tone("#ffb020")}" stroke-width=".8"/>`;
    o += `</g>`;
    const my = top - 6;
    o += `<path d="M10 4V${my}" stroke="${tone("#ffc23a")}" stroke-width="1.6"/><path d="M-8 ${my}H14" stroke="${tone("#ffc23a")}" stroke-width="1.4" stroke-linecap="round"/><rect x="11" y="${my}" width="3.6" height="2.6" rx=".6" fill="${tone("#8a90b8")}"/>` +
      `<g class="cv-hook"><path d="M-4 ${my}V${my + 8}" stroke="${tone("#6b7196")}" stroke-width=".5"/><rect x="-5.4" y="${my + 8}" width="2.8" height="2.2" rx=".5" fill="${tone(ROOF.coral)}"/></g>`;
    o += `<g transform="translate(1 ${my - 8})"><circle r="6.4" fill="#fff" stroke="rgba(74,63,116,.12)"/><circle r="4.6" fill="none" stroke="#e1f3f5" stroke-width="2"/>` +
      `<circle data-sring="${i}" r="4.6" fill="none" stroke="#1fb3c8" stroke-width="2" stroke-linecap="round" stroke-dasharray="${RING.toFixed(2)}" stroke-dashoffset="${RING.toFixed(2)}" transform="rotate(-90)"/>` +
      `<path d="M-1.8 1.9l2.6-2.6M.4 -1.6l1.4 1.4-.8.8-1.4-1.4z" stroke="#1497ae" stroke-width=".9" fill="#1497ae" stroke-linecap="round"/></g>`;
    return o;
  }
  // 아직 남의 땅 — 하얗고 몽글몽글한 구름 덩어리
  const fogArt = (i) => {
    const d = (i * 0.9) % 6, sx = i % 2 ? -1 : 1;
    const c = tone(COL.fog), sd = tone(COL.fogShade);
    return `<g class="cv-fogc" style="animation-delay:-${f1(d)}s"><ellipse cx="0" cy="3" rx="16" ry="4.6" fill="${sd}" opacity=".75"/>` +
      `<circle cx="${-8 * sx}" cy="-1" r="6.4" fill="${c}"/><circle cx="${7 * sx}" cy="0" r="5.6" fill="${c}"/><circle cx="${-1 * sx}" cy="-5" r="8" fill="${c}"/><circle cx="${4 * sx}" cy="2" r="5.2" fill="${c}"/><circle cx="${-5 * sx}" cy="2.6" r="4.6" fill="${c}"/>` +
      `<circle cx="${-3.6 * sx}" cy="-8" r="2.2" fill="#fff" opacity=".9"/></g>`;
  };
  // 살 수 있는 땅 — 작은 집 그림 팻말
  const saleSign = (i) => {
    const [x, y] = at(BH - 2.4, BH - 5.6);
    return `<g class="cv-bob" style="animation-delay:-${f1((i * 0.5) % 2)}s"><path d="M${f1(x)} ${f1(y)}v-6" stroke="${tone("#b8875c")}" stroke-width=".8" stroke-linecap="round"/><rect x="${f1(x - 3.8)}" y="${f1(y - 9.8)}" width="7.6" height="5" rx="1.6" fill="${tone("#fff6d8")}" stroke="${tone(ROOF.butter)}" stroke-width=".7"/>` +
      `<path d="M${f1(x - 1.9)} ${f1(y - 7.3)}L${f1(x)} ${f1(y - 9)}L${f1(x + 1.9)} ${f1(y - 7.3)}Z" fill="${tone(ROOF.coral)}"/><rect x="${f1(x - 1.3)}" y="${f1(y - 7.4)}" width="2.6" height="1.9" rx=".3" fill="${tone(ROOF.sky)}"/></g>`;
  };
  // 그림이 칸 위로 얼마나 솟는지(말풍선 자리)
  function artTop(i) {
    if (i === HQ) return (s.bld[HQ] === "tower" ? TOWER_TOP : HQ_TOP[s.era]) - CURB;
    if (s.bld[i]) return bldSignY(s.bld[i], s.era) - 6 - CURB;
    if (C.building(s, i)) return -BHT[s.era] - 20 - CURB;
    return -12;
  }

  function tileSvg(i) {
    const h = HEX[i], { x, y } = pos(h), T = C.typeOf(s, i), own = C.owned(s, i), front = !own && C.isFrontier(s, i);
    let cls = "cv-tile", g = "";
    const b = C.building(s, i);
    const cell = corners(0, 0, A, A), cellPts = [cell.Bk, cell.R, cell.B, cell.L];
    const label = own ? `${T.name}${s.bld[i] ? " · " + BLD[s.bld[i]].name : b ? " · 짓는 중" : ""}` : front ? `${T.name} · 살 수 있는 땅` : "아직 모르는 땅";
    if (own) {
      cls += " is-own";
      const z = T.k === "river" ? 0.6 : CURB, c = corners(0, 0, BH, BH), cs = shades(COL.curb);
      const top = [c.Bk, c.R, c.B, c.L].map((p) => up(p, z)), lot = corners(0, -z, LOT, LOT);
      let art;
      if (T.k === "hq") art = hqArt(s.era, s.bld[HQ] === "tower") + (b ? craneArt(i, 2, -60) : "");
      else if (s.bld[i]) art = groundDeco(T.k, i) + bldArt(s.bld[i], s.era);
      else if (b) art = groundDeco(T.k, i) + craneArt(i, s.era, -BHT[s.era] - 6);
      else art = motif(T.k, i);
      if (["house", "hq", "campus"].includes(T.k)) art = lamp(...at(BH - 1.2, -BH + 1.2)) + art;
      g += poly([c.L, c.B, up(c.B, z), up(c.L, z)], cs.l) + poly([c.B, c.R, up(c.R, z), up(c.B, z)], cs.r);
      g += `<polygon class="cv-top" points="${P(top)}" fill="${tone(T.k === "river" || T.k === "park" ? COL.grass : COL.walk)}"/>`;
      g += `<polygon points="${P([lot.Bk, lot.R, lot.B, lot.L])}" fill="${tone(LOTC[T.k])}"/>`;
      g += `<polygon class="cv-glow" points="${P(top)}"/>`;
      g += `<g transform="translate(0 ${-z})">${art}</g>`;
    } else if (front) {
      cls += " is-front";
      const c = corners(0, 0, A - 1.2, A - 1.2), z = 1.2;
      const top = [c.Bk, c.R, c.B, c.L].map((p) => up(p, z));
      g += poly([c.L, c.B, up(c.B, z), up(c.L, z)], tone("#9fcf75")) + poly([c.B, c.R, up(c.R, z), up(c.B, z)], tone("#8cc066"));
      g += `<polygon class="cv-top" points="${P(top)}" fill="${tone(mix(LOTC[T.k], COL.meadow, 0.35))}"/>`;
      const ci = corners(0, -z, A - 3, A - 3);
      g += `<polygon points="${P([ci.Bk, ci.R, ci.B, ci.L])}" fill="none" stroke="#fff" stroke-width="1.1" stroke-dasharray="2.6 2.2" stroke-linecap="round" opacity=".95"/>`;
      g += `<polygon class="cv-glow" points="${P(top)}"/>`;
      g += `<g transform="translate(0 ${-z})"><g class="cv-dim">${motif(T.k, i)}</g>${saleSign(i)}</g>`;
    } else {
      cls += " is-fog";
      const cm = corners(0, 0, A - 0.6, A - 0.6);
      g += `<polygon points="${P([cm.Bk, cm.R, cm.B, cm.L])}" fill="${tone(COL.meadow)}"/>`;
      g += `<polygon class="cv-glow" points="${P(cellPts)}"/>`;
      g += fogArt(i);
    }
    if (popTiles.has(i)) cls += " is-pop";
    if (i === sel) cls += " is-sel";
    return `<g class="${cls}" data-tile="${i}" transform="translate(${f1(x)} ${f1(y)})" tabindex="0" role="button" aria-label="${label}"><polygon class="cv-hit" points="${P(cellPts)}" fill="transparent"/><g class="cv-lift">${g}</g></g>`;
  }

  // ── 동네 판 · 길 · 차 ─────────────────────────────────────────────
  const PLATE = 7 * A + 5, PTH = 9;
  const hashI = (n) => { let h = (n * 2654435761) >>> 0; h ^= h >>> 13; h = Math.imul(h, 1274126177) >>> 0; return (h ^ (h >>> 16)) >>> 0; };
  function plateBack() {
    const c = corners(0, 0, PLATE, PLATE), so = shades(COL.soil);
    let o = `<ellipse cx="0" cy="${PLATE * K + PTH + 8}" rx="${PLATE * 2 * 0.86}" ry="22" fill="url(#cvShadow)"/>`;
    o += poly([c.L, c.B, [c.B[0], c.B[1] + PTH], [c.L[0], c.L[1] + PTH]], so.l) + poly([c.B, c.R, [c.R[0], c.R[1] + PTH], [c.B[0], c.B[1] + PTH]], so.r);
    o += `<path d="M${f1(c.L[0])} ${f1(c.L[1] + 3)}L${f1(c.B[0])} ${f1(c.B[1] + 3)}L${f1(c.R[0])} ${f1(c.R[1] + 3)}" fill="none" stroke="${tone(mix(COL.soil, "#ffffff", 0.3))}" stroke-width="1.2" opacity=".7"/>`;
    o += `<polygon points="${P([c.Bk, c.R, c.B, c.L])}" fill="${tone(COL.grass)}"/>`;
    // 뒤쪽 가장자리 나무 줄
    let t = "";
    for (let n = 0; n <= 14; n++) {
      const v = -PLATE + 3 + n * ((2 * PLATE - 6) / 14);
      t += lolly(...pt(-PLATE + 2.6, v), 0.7 + (n % 3) * 0.08, n * 0.4, n % 4 === 1 ? COL.blossom : n % 2 ? COL.tree2 : COL.tree);
      if (n) t += lolly(...pt(v, -PLATE + 2.6), 0.7 + ((n + 1) % 3) * 0.08, n * 0.3, n % 4 === 3 ? COL.blossom : n % 2 ? COL.tree : COL.tree2);
    }
    return o + t;
  }
  function plateFront() {
    // 앞쪽 가장자리 낮은 담 + 덤불
    const e = PLATE - 1.6, posts = [];
    let rail = "", o = "";
    for (let n = 0; n <= 24; n++) {
      const v = -e + n * ((2 * e) / 24);
      posts.push(pt(v, e), pt(e, v));
    }
    const ra = [pt(-e, e, 2.6), pt(e, e, 2.6), pt(e, -e, 2.6)], rb = [pt(-e, e, 1.2), pt(e, e, 1.2), pt(e, -e, 1.2)];
    rail = `<polyline points="${P(ra)}" fill="none" stroke="${tone("#ffffff")}" stroke-width=".8" stroke-linejoin="round"/><polyline points="${P(rb)}" fill="none" stroke="${tone("#ffffff")}" stroke-width=".6" stroke-linejoin="round" opacity=".8"/>`;
    for (const [px, py] of posts) o += `<path d="M${f1(px)} ${f1(py)}v-3.2" stroke="${tone("#ffffff")}" stroke-width=".9" stroke-linecap="round"/>`;
    let b = "";
    for (let n = 0; n < 6; n++) { const v = -e + 10 + n * 32; b += bush(...pt(v, e + 0.4), 0.8, n % 3 === 1 ? COL.blossom : COL.tree) + bush(...pt(e + 0.4, v + 8), 0.75, n % 3 === 2 ? COL.blossom : COL.tree); }
    return `<g opacity=".95">${o}${rail}</g>${b}`;
  }
  const ownAt = (c, r) => { const j = C.idxOf(c, r); return j >= 0 && C.owned(s, j); };
  function roads() {
    let base = "", marks = "";
    const rc = tone(COL.road), edge = tone(mix(COL.road, "#ffffff", 0.45));
    HEX.forEach((h, i) => {
      if (!C.owned(s, i)) return;
      const { x, y } = pos(h), c = corners(x, y, A + 0.3, A + 0.3);
      base += `<polygon points="${P([c.Bk, c.R, c.B, c.L])}" fill="${rc}"/>`;
    });
    HEX.forEach((h, i) => {
      if (!C.owned(s, i)) return;
      const { x, y } = pos(h);
      const E = (a1, b1, a2, b2) => [pt(a1, b1).map((v, n) => v + (n ? y : x)), pt(a2, b2).map((v, n) => v + (n ? y : x))];
      const line = ([p1, p2], t1, t2, st) => `<path d="M${f1(p1[0] + (p2[0] - p1[0]) * t1)} ${f1(p1[1] + (p2[1] - p1[1]) * t1)}L${f1(p1[0] + (p2[0] - p1[0]) * t2)} ${f1(p1[1] + (p2[1] - p1[1]) * t2)}" ${st}/>`;
      // 내 땅 바깥 경계 — 연한 테두리
      const sides = [[h.c + 1, h.r, E(A, -A, A, A)], [h.c - 1, h.r, E(-A, -A, -A, A)], [h.c, h.r + 1, E(-A, A, A, A)], [h.c, h.r - 1, E(-A, -A, A, -A)]];
      for (const [nc, nr, seg] of sides) if (!ownAt(nc, nr)) marks += line(seg, 0, 1, `stroke="${edge}" stroke-width="1" stroke-linecap="round"`);
      // 두 내 땅 사이 — 가운데 점선 차선(교차로 근처는 비움) · 본사 옆은 횡단보도
      for (const [nc, nr, seg] of [sides[0], sides[2]]) {
        if (!ownAt(nc, nr)) continue;
        const j = C.idxOf(nc, nr);
        const zebra = i === HQ || j === HQ;
        if (zebra) {
          marks += line(seg, 0.14, 0.36, `stroke="${tone(COL.lane)}" stroke-width=".7" stroke-dasharray="2.4 1.8" stroke-linecap="round"`) + line(seg, 0.64, 0.86, `stroke="${tone(COL.lane)}" stroke-width=".7" stroke-dasharray="2.4 1.8" stroke-linecap="round"`);
          const [p1, p2] = seg, mx = (p1[0] + p2[0]) / 2, my = (p1[1] + p2[1]) / 2, ux = (p2[0] - p1[0]) / (2 * A), uy = (p2[1] - p1[1]) / (2 * A);
          const wv = nc > h.c ? [1, 0.5] : [-1, 0.5]; // 길 너비 방향(칸 a 또는 b 축)
          for (let n = -2; n <= 2; n++) {
            const ox = mx + wv[0] * n * 1.1, oy = my + wv[1] * n * 1.1;
            marks += `<path d="M${f1(ox - ux * 1.6)} ${f1(oy - uy * 1.6)}L${f1(ox + ux * 1.6)} ${f1(oy + uy * 1.6)}" stroke="${tone("#ffffff")}" stroke-width="1.1" stroke-linecap="round"/>`;
          }
        } else marks += line(seg, 0.14, 0.86, `stroke="${tone(COL.lane)}" stroke-width=".7" stroke-dasharray="2.4 1.8" stroke-linecap="round"`);
      }
      // 강 칸 — 길이 물길을 건너는 곳에 다리 난간
      if (C.typeOf(s, i).k === "river") {
        for (const d of riverDirs(i)) {
          const off = BH + 0.5, w = 4.3;
          const seg = d === "+a" ? E(off, -w, off, w) : d === "-a" ? E(-off, -w, -off, w) : d === "+b" ? E(-w, off, w, off) : E(-w, -off, w, -off);
          const ff = d === "+a" ? E(A, -w + 0.9, A, w - 0.9) : d === "-a" ? E(-A, -w + 0.9, -A, w - 0.9) : d === "+b" ? E(-w + 0.9, A, w - 0.9, A) : E(-w + 0.9, -A, w - 0.9, -A);
          const q = [seg[0], seg[1], ff[1], ff[0]];
          marks += `<polygon points="${P(q)}" fill="${tone(mix(COL.road, "#ffffff", 0.18))}"/>` + `<path d="M${f1(seg[0][0])} ${f1(seg[0][1] - 1.4)}L${f1(seg[1][0])} ${f1(seg[1][1] - 1.4)}" stroke="${tone("#ffffff")}" stroke-width=".9" stroke-linecap="round"/>`;
        }
      }
    });
    return base + marks;
  }
  // 길 위 작은 차 — 두 내 땅 사이 길 한 토막을 지나가고(앞쪽 칸보다 먼저 그려 가려지게), 끝에서 사라진다
  function carSvg(axis, col) {
    const a = axis === "a" ? 2.2 : 1.2, b = axis === "a" ? 1.2 : 2.2;
    let o = `<ellipse cx=".6" cy=".6" rx="3" ry="1.3" fill="${COL.ink}" opacity=".18"/>` + box(0, 0, a, b, 1.5, col, { rc: mix(col, "#ffffff", 0.3) }) + box(0, -1.5, a * 0.58, b * 0.62, 1.2, "#eef8ff", { rc: "#ffffff" });
    if (night()) o += `<circle cx="${axis === "a" ? 2.6 : -2.6}" cy="1.2" r=".7" fill="#fff4b0"/><circle cx="${axis === "a" ? 2.6 : -2.6}" cy="1.2" r="2.4" fill="url(#cvLampH)"/>`;
    return o;
  }
  function carList() {
    if (reduce()) return [];
    const edges = [];
    HEX.forEach((h, i) => {
      if (!C.owned(s, i)) return;
      if (ownAt(h.c + 1, h.r)) edges.push({ i, axis: "b", depth: h.c + h.r + 1 });
      if (ownAt(h.c, h.r + 1)) edges.push({ i, axis: "a", depth: h.c + h.r + 1 });
    });
    const n = Math.min(edges.length, [2, 4, 6][s.era] + Math.floor(edges.length / 10));
    const seed = (s.seed >>> 0) % 997;
    edges.sort((p, q) => hashI(p.i * 7 + (p.axis === "a" ? 1 : 2) + seed) - hashI(q.i * 7 + (q.axis === "a" ? 1 : 2) + seed));
    const cols = [ROOF.coral, ROOF.sky, ROOF.butter, ROOF.mint, ROOF.lav, "#ffffff", ROOF.peach];
    return edges.slice(0, n).map((e, k) => {
      const { x, y } = pos(HEX[e.i]), fwd = hashI(e.i + k) % 2 === 0;
      const lane = (fwd ? -1 : 1) * RW * 0.45;
      // axis "b": 오른쪽 이웃과의 길(칸 a = A 선)을 b 방향으로 / axis "a": 아래 이웃과의 길(칸 b = A 선)을 a 방향으로
      let p0, p1;
      if (e.axis === "b") { p0 = pt(A + lane, -A + 1); p1 = pt(A + lane, A - 1); } else { p0 = pt(-A + 1, A + lane); p1 = pt(A - 1, A + lane); }
      if (!fwd) [p0, p1] = [p1, p0];
      const dur = 4.4 + (hashI(e.i * 3 + k) % 30) / 10, del = (hashI(e.i * 5 + k) % 60) / 10;
      const svg = `<g class="cv-car" style="--x0:${f1(x + p0[0])}px;--y0:${f1(y + p0[1])}px;--x1:${f1(x + p1[0])}px;--y1:${f1(y + p1[1])}px;animation-duration:${dur.toFixed(1)}s;animation-delay:-${del.toFixed(1)}s">${carSvg(e.axis === "b" ? "b" : "a", cols[(k + seed) % cols.length])}</g>`;
      return { depth: e.depth, svg };
    });
  }

  function mapInner() {
    const order = HEX.map((h, i) => i).sort((a, b) => HEX[a].c + HEX[a].r - (HEX[b].c + HEX[b].r) || HEX[a].c - HEX[b].c);
    const cars = carList();
    let tiles = "", D = -1;
    for (const i of order) {
      const dd = HEX[i].c + HEX[i].r;
      if (dd !== D) { D = dd; tiles += cars.filter((k) => k.depth === dd).map((k) => k.svg).join(""); }
      tiles += tileSvg(i);
    }
    return plateBack() + roads() + tiles + plateFront();
  }

  // ── 상태 · 화면 ───────────────────────────────────────────────────
  let store = null, s = null, host = null, root = null, tab = "map", sel = HQ, polSlot = -1, lastSig = "", lastSave = 0, timer = 0;
  const fresh = new Set(), popTiles = new Set();
  const countUntil = {};
  const modalChain = { p: Promise.resolve() };
  const enqueue = (fn) => { modalChain.p = modalChain.p.then(() => new Promise((res) => { try { fn(res); } catch (_) { res(); } })); };
  const $ = (q) => root && root.querySelector(q);

  function fixState(st) {
    if (!st || st.v !== 1) return null;
    C.migrate(st); // 예전 육각 판(37칸)이면 네모 칸(49칸)으로 옮긴다 — state.grid = "sq"
    if (typeof st.map !== "string" || st.map.length !== HEX.length || typeof st.own !== "string" || st.own.length !== HEX.length) return null;
    const b = C.blank(store.now());
    for (const k of Object.keys(b)) if (st[k] === undefined) st[k] = b[k];
    return st;
  }

  const topHtml = (title) => `<div class="mgx-top cv-top">
      <a class="mgx-top__back" href="/manage">${ic("chevron-left", 18)}매니지먼트</a>
      <div class="mgx-top__title"><span class="cv-logo" aria-hidden="true"></span><span class="cv-ttl">${title || "오피스 타운"}</span><span class="mgx-chip cv-erachip" id="cv-era"></span></div>
      <div class="mgx-top__actions"><button type="button" class="mgx-icon" data-act="help" aria-label="도움말">${ic("circle-help", 20)}</button><button type="button" class="mgx-icon" data-act="more" aria-label="더보기">${ic("ellipsis", 20)}</button></div>
    </div>`;

  async function mount(el) {
    host = el;
    try {
      store = await HKMgmt.open("civ", { blank: () => C.blank(Date.now()), onStale, onClosed });
    } catch (e) {
      if (e && e.closed) { showClosed(e.opensAt); return; }
      host.innerHTML = `<div class="mgx mgx-shell cv">${topHtml()}<div class="cv-closed"><div class="hk-mg-closed"><b>회사를 불러오지 못했어요</b><p>${HKUI.escapeHtml((e && e.message) || "잠시 뒤 다시 들어와 주세요.")}</p><a class="hk-btn hk-btn--secondary" href="/manage">매니지먼트 모음으로</a></div></div></div>`;
      HKUI.refreshIcons(host);
      return;
    }
    if (store.isNew) store.state = C.blank(store.now());
    s = fixState(store.state) || (store.state = C.blank(store.now()));
    store.state = s;
    const log = C.catchUp(s, store.now());
    store.dirty();
    for (const i of log.tiles) popTiles.add(i);
    buildShell();
    renderAll();
    if (!s.guide) enqueue(showGuide);
    else if (log.away > 60) enqueue((done) => showAway(log, done));
    checkFinish();
    timer = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", () => {
      const st = $("#cv-stage");
      if (st) st.classList.toggle("is-paused", document.visibilityState !== "visible");
      if (document.visibilityState === "visible") tick();
    });
  }
  function showClosed(opensAt) {
    host.innerHTML = `<div class="mgx mgx-shell cv">${topHtml()}<div class="cv-closed">${HKMgmt.closedHtml(opensAt, "오피스 타운")}</div></div>`;
    root = host.firstElementChild;
    const era = root.querySelector("#cv-era"); if (era) era.remove();
    root.addEventListener("click", (e) => { const b = e.target.closest("[data-act]"); if (b && b.dataset.act === "help") showHelp(); else if (b && b.dataset.act === "more") showHelp(); });
    HKUI.refreshIcons(host);
  }

  function onStale(st) {
    s = fixState(st) || C.blank(store.now());
    store.state = s;
    C.catchUp(s, store.now());
    fresh.clear();
    HKUI.toast("다른 창에서 바꾼 내용으로 다시 불러왔어요", "info");
    renderAll();
  }
  function onClosed(opensAt) {
    clearInterval(timer);
    showClosed(opensAt);
  }

  const sig = () => {
    const R = C.rates(s);
    return [s.staff, s.done.join(), Object.keys(s.bld).length, s.builds.length, s.own, s.cards.length, s.buffs.length, s.era, s.res ? s.res.k : "", C.slotsOf(s), R.morale, R.cap, s.fin].join("|");
  };

  function tick() {
    if (!s) return;
    const now = store.now();
    const ph = kstPhase(now);
    if (ph !== phase) { phase = ph; paintSky(); drawMap(); }
    const away = (now - s.t) / 1000;
    if (away <= 0) return;
    const prevB = s.builds.map((b) => b.i);
    const log = C.catchUp(s, now);
    const doneTiles = prevB.filter((i) => !C.building(s, i) && s.bld[i]);
    for (const i of doneTiles) fresh.add(i);
    for (const i of log.tiles) popTiles.add(i);
    if (away > 60) enqueue((done) => showAway(log, done));
    else announce(log, doneTiles);
    const g = sig();
    if (g !== lastSig) { renderAll(); store.dirty(); }
    else updateLive();
    if (away <= 60) for (const i of doneTiles) sparkle(i);
    if (Date.now() - lastSave > 30000) { lastSave = Date.now(); store.dirty(); }
    checkFinish();
  }

  function announce(log, doneTiles) {
    for (const k of log.builds) HKUI.toast(`${eul(BLD[k].name)} 다 지었어요`);
    for (const k of log.research) { HKUI.toast(`아이디어 「${RES[k].name}」${bat(RES[k].name) ? "이" : "가"} 나왔어요`); HKFx.bump($('[data-tab="research"]')); }
    if (log.tiles.length) HKUI.toast(`동네에 소문이 나서 땅이 ${log.tiles.length}칸 넓어졌어요`);
    if (doneTiles.length || log.research.length) HKFx.confetti(Object.assign(stagePt(doneTiles[0]), { n: 26 }));
  }

  // ── 뼈대 · 그리기 ─────────────────────────────────────────────────
  function buildShell() {
    host.innerHTML = `<div class="mgx mgx-shell cv" id="cv-root">${topHtml()}
      <div class="cv-main">
        <div class="mgx-stage cv-stage" id="cv-stage">
          <div class="cv-sky" aria-hidden="true"><i class="cv-sun"></i><i class="cv-stars"></i>${skyline()}<i class="cv-cl cv-cl--1"></i><i class="cv-cl cv-cl--2"></i><i class="cv-bird"></i><i class="cv-bird is-2"></i></div>
          <svg class="cv-map" id="cv-map" role="group" aria-label="회사 지도 — 끌어서 옮기고, 칸을 눌러 골라요">
            <defs><radialGradient id="cvShadow"><stop offset="0" stop-color="#4a3f74" stop-opacity=".22"/><stop offset="1" stop-color="#4a3f74" stop-opacity="0"/></radialGradient>
              <radialGradient id="cvLampG"><stop offset="0" stop-color="#ffd56b" stop-opacity=".55"/><stop offset="1" stop-color="#ffd56b" stop-opacity="0"/></radialGradient>
              <radialGradient id="cvLampH"><stop offset="0" stop-color="#fff1b8" stop-opacity=".9"/><stop offset="1" stop-color="#ffd56b" stop-opacity="0"/></radialGradient></defs>
            <g id="cv-cam"></g>
          </svg>
          <i class="cv-cshadow" aria-hidden="true"></i>
          <div class="cv-bubs" id="cv-bubs"></div>
          <div class="cv-fxl" id="cv-fxl" aria-hidden="true"></div>
          <div class="mgx-hud cv-hud" id="cv-hud">
            <button type="button" class="mgx-pill cv-pill" data-act="pill" data-k="money" style="--pill:var(--c-money)" aria-label="자금"><span class="mgx-pill__ic">${ic("wallet", 15)}</span><b data-l="money"></b></button>
            <button type="button" class="mgx-pill cv-pill" data-act="pill" data-k="ideas" style="--pill:var(--c-idea)" aria-label="아이디어"><span class="mgx-pill__ic">${ic("lightbulb", 15)}</span><b data-l="ideas"></b></button>
            <button type="button" class="mgx-pill cv-pill" data-act="pill" data-k="morale" style="--pill:var(--c-mor)" aria-label="분위기"><span class="mgx-pill__ic">${ic("smile", 15)}</span><b data-l="morale"></b></button>
            <button type="button" class="mgx-pill cv-pill" data-act="pill" data-k="rep" style="--pill:var(--c-rep)" aria-label="인기"><span class="mgx-pill__ic">${ic("heart", 15)}</span><b data-l="rep"></b></button>
            <button type="button" class="mgx-pill cv-pill cv-pill--ap" data-act="pill" data-k="ap" style="--pill:var(--c-ap)" aria-label="기운"><span class="mgx-pill__ic">${ic("zap", 15)}</span><span class="cv-pill__tx"><b data-l="ap"></b><small data-l="apnext"></small></span></button>
          </div>
          <div class="cv-jobs" id="cv-jobs"></div>
          <div class="cv-zoom"><button type="button" class="mgx-icon" data-act="zoom" data-z="in" aria-label="크게">${ic("plus", 20)}</button><button type="button" class="mgx-icon" data-act="zoom" data-z="out" aria-label="작게">${ic("minus", 20)}</button><button type="button" class="mgx-icon" data-act="zoom" data-z="fit" aria-label="한눈에 보기">${ic("scan", 19)}</button></div>
        </div>
        <div class="mgx-dock cv-dock" id="cv-dock" role="tablist"></div>
        <div class="cv-panel" id="cv-panel"></div>
      </div>
    </div>`;
    root = host.firstElementChild;
    bind();
    bindStage();
    phase = kstPhase(store.now());
    paintSky();
  }

  function renderAll() {
    if (!root || !s) return;
    lastSig = sig();
    root.classList.toggle("is-sub", tab !== "map");
    const era = $("#cv-era"); if (era) era.innerHTML = `${ic("flag", 12)}${s.era < ERAS.length - 1 ? ERAS[s.era].name : s.fin ? "완성!" : "마지막 단계"}`; // 마지막 단계 이름은 게임 이름과 같아서
    paintSky();
    drawMap();
    drawJobs();
    drawDock();
    drawPanel();
    HKUI.refreshIcons(root);
    updateLive();
    popTiles.clear();
  }
  function paintSky() {
    const st = $("#cv-stage"); if (!st) return;
    const sky = SKY[phase];
    st.style.setProperty("--sky1", sky[0]); st.style.setProperty("--sky2", sky[1]);
    st.dataset.ph = phase;
    st.dataset.era = s ? s.era : 0;
  }
  // 먼 도시 실루엣(장면 뒤 하늘 아래쪽) — 밤엔 창문 불빛 점
  function skyline() {
    let sd = 7;
    const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    let b = "", w = "", x = 0;
    while (x < 400) {
      const bw = 14 + Math.floor(r() * 18), bh = 14 + Math.floor(r() * 34), rr = r() < 0.4 ? 5 : 2;
      b += `<rect x="${x}" y="${70 - bh}" width="${bw}" height="${bh + 10}" rx="${rr}"/>`;
      for (let yy = 70 - bh + 5; yy < 64; yy += 7) for (let xx = x + 4; xx < x + bw - 3; xx += 6) if (r() < 0.45) w += `<rect x="${xx}" y="${yy}" width="2.2" height="2.6" rx=".8"/>`;
      x += bw + 2 + Math.floor(r() * 6);
    }
    return `<svg class="cv-skyline" viewBox="0 0 400 74" preserveAspectRatio="xMidYMax slice"><g class="cv-skyline__b">${b}</g><g class="cv-skyline__w">${w}</g></svg>`;
  }
  function drawMap() {
    const cam = $("#cv-cam"); if (!cam || !s) return;
    cam.innerHTML = mapInner();
    drawBubs();
  }
  function drawJobs() {
    const el = $("#cv-jobs"); if (!el) return;
    const items = [];
    for (let n = 0; n < C.buildSlots(s); n++) {
      const b = s.builds[n];
      if (b) items.push(`<button type="button" class="cv-jobc" data-act="goTile" data-i="${b.i}" style="--c:${BCOL[b.k]}"><span class="cv-jobc__ic">${ic(BLD[b.k].icon, 17)}</span><span class="cv-jobc__tx"><b>${BLD[b.k].name}</b><small data-rems="b${b.i}"></small></span><i class="cv-jobc__bar"><i data-bar="b${b.i}"></i></i></button>`);
      else items.push(`<button type="button" class="cv-jobc is-idle" data-act="idleBuild"><span class="cv-jobc__ic">${ic("hammer", 17)}</span><span class="cv-jobc__tx"><b>건설<span class="cv-long"> 비었어요</span></b><small>칸을 골라요</small></span></button>`);
    }
    if (s.res) items.push(`<button type="button" class="cv-jobc" data-act="tab" data-tab="research" style="--c:var(--c-idea)"><span class="cv-jobc__ic">${ic(RES[s.res.k].icon, 17)}</span><span class="cv-jobc__tx"><b>${RES[s.res.k].name}</b><small data-rems="r"></small></span><i class="cv-jobc__bar"><i data-bar="r"></i></i></button>`);
    else items.push(`<button type="button" class="cv-jobc is-idle" data-act="tab" data-tab="research"><span class="cv-jobc__ic">${ic("lightbulb", 17)}</span><span class="cv-jobc__tx"><b>아이디어<span class="cv-long"> 회의 쉬는 중</span></b><small>걸어 둬요</small></span></button>`);
    el.innerHTML = items.join("");
    HKUI.refreshIcons(el);
  }
  function drawDock() {
    const el = $("#cv-dock"); if (!el) return;
    const t = [["map", "map", "동네"], ["research", "lightbulb", "아이디어"], ["company", "building-2", "회사"], ["events", "newspaper", "소식"]];
    el.innerHTML = t.map(([k, i, l]) => {
      let dot = "";
      if (k === "events" && s.cards.length) dot = `<span class="mgx-dot">${s.cards.length}</span>`;
      if (k === "company" && !C.canEraUp(s)) dot = `<span class="mgx-dot">!</span>`;
      if (k === "research" && !s.res) dot = `<span class="mgx-dot cv-dot-s"></span>`;
      return `<button type="button" role="tab" aria-selected="${tab === k}" class="mgx-tab cv-tab" data-act="tab" data-tab="${k}">${ic(i, 22)}<span>${l}</span>${dot}</button>`;
    }).join("");
    HKUI.refreshIcons(el);
  }
  function drawPanel() {
    const el = $("#cv-panel"); if (!el) return;
    el.innerHTML = tab === "research" ? researchHtml() : tab === "company" ? companyHtml() : tab === "events" ? eventsHtml() : panelHtml(sel);
    HKUI.refreshIcons(el);
  }

  // ── 장면 카메라(끌기 · 확대) ───────────────────────────────────────
  const WB = { x0: -200, x1: 200, y0: -124, y1: 116 };
  const cam = { cx: 0, cy: (WB.y0 + WB.y1) / 2, zf: 1 };
  const view = { w: 1, h: 1, fit: 1, ax: 0, ay: 0, sc: 1, tx: 0, ty: 0 };
  let camRaf = 0, camAnim = 0, camReady = false;
  function measure() {
    const st = $("#cv-stage"), svg = $("#cv-map"); if (!st || !svg) return;
    view.w = st.clientWidth; view.h = st.clientHeight;
    const hud = $("#cv-hud"), jobs = $("#cv-jobs");
    const topI = (hud ? hud.offsetHeight : 40) + 18, botI = (jobs ? jobs.offsetHeight : 44) + 14;
    const aw = Math.max(80, view.w - 16), ah = Math.max(80, view.h - topI - botI);
    view.fit = Math.min(aw / (view.w < 600 ? 305 : 335), ah / (WB.y1 - WB.y0)); // 휴대폰은 판 양 끝 모서리가 조금 잘려도 칸이 크게
    view.ax = view.w / 2; view.ay = topI + ah / 2; view.aw = aw; view.ah = ah;
    svg.setAttribute("viewBox", `0 0 ${view.w} ${view.h}`);
    if (!camReady && s) { camReady = true; Object.assign(cam, townCam()); }
    applyCam();
  }
  // 처음 화면 — 내 동네(내 땅 + 살 수 있는 땅)가 장면을 꽉 채우게
  function townCam() {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    HEX.forEach((h, i) => {
      if (!C.owned(s, i) && !C.isFrontier(s, i)) return;
      const p = pos(h);
      x0 = Math.min(x0, p.x - 2 * A); x1 = Math.max(x1, p.x + 2 * A); y0 = Math.min(y0, p.y - A - (C.owned(s, i) ? 26 : 12)); y1 = Math.max(y1, p.y + A + 4);
    });
    if (x0 > x1) return { cx: 0, cy: (WB.y0 + WB.y1) / 2, zf: 1 };
    const zf = clamp(Math.min(view.aw / (x1 - x0 + 16), view.ah / (y1 - y0 + 10)) / view.fit, 1, 2.2);
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, zf };
  }
  function applyCam() {
    camRaf = 0;
    const g = $("#cv-cam"); if (!g) return;
    cam.zf = clamp(cam.zf, 0.9, 2.8);
    const sc = view.fit * cam.zf;
    const ox = Math.max(0, (WB.x1 - WB.x0) / 2 - view.w / 2 / sc) + 50 / sc;
    const oy = Math.max(0, (WB.y1 - WB.y0) / 2 - view.h / 2 / sc) + 50 / sc;
    const mx = 0, my = (WB.y0 + WB.y1) / 2;
    cam.cx = clamp(cam.cx, mx - ox, mx + ox); cam.cy = clamp(cam.cy, my - oy, my + oy);
    view.sc = sc; view.tx = view.ax - cam.cx * sc; view.ty = view.ay - cam.cy * sc;
    g.setAttribute("transform", `translate(${view.tx.toFixed(1)} ${view.ty.toFixed(1)}) scale(${sc.toFixed(4)})`);
    placeBubs();
  }
  const schedCam = () => { if (!camRaf) camRaf = requestAnimationFrame(applyCam); };
  function animCam(to) {
    cancelAnimationFrame(camAnim);
    if (reduce()) { Object.assign(cam, to); applyCam(); return; }
    const from = { ...cam }, t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / 320), e = 1 - Math.pow(1 - t, 3);
      for (const k of ["cx", "cy", "zf"]) if (to[k] != null) cam[k] = from[k] + (to[k] - from[k]) * e;
      applyCam();
      if (t < 1) camAnim = requestAnimationFrame(step);
    };
    camAnim = requestAnimationFrame(step);
  }
  function zoomAt(px, py, zf) {
    zf = clamp(zf, 0.9, 2.8);
    const wx = (px - view.tx) / view.sc, wy = (py - view.ty) / view.sc, sc2 = view.fit * zf;
    cam.zf = zf; cam.cx = (view.ax - (px - wx * sc2)) / sc2; cam.cy = (view.ay - (py - wy * sc2)) / sc2;
    schedCam();
  }
  function tileWorld(i) { const p = pos(HEX[i]); return { x: p.x, y: p.y - (C.owned(s, i) ? CURB : 0) }; }
  function stagePt(i) {
    const st = $("#cv-stage"); if (!st || i == null) return {};
    const r = st.getBoundingClientRect(), w = tileWorld(i);
    return { x: r.left + view.tx + w.x * view.sc, y: r.top + view.ty + (w.y - 10) * view.sc };
  }
  function focusTile(i) {
    const w = tileWorld(i), sc = view.fit * cam.zf;
    const sx = view.tx + w.x * sc, sy = view.ty + w.y * sc;
    if (sx < 40 || sx > view.w - 40 || sy < 80 || sy > view.h - 70) animCam({ cx: w.x, cy: w.y - 10 });
  }
  function bindStage() {
    const svg = $("#cv-map"), st = $("#cv-stage");
    const pts = new Map();
    let start = null, moved = false, pinch = null;
    const local = (x, y) => { const r = svg.getBoundingClientRect(); return [x - r.left, y - r.top]; };
    svg.addEventListener("pointerdown", (e) => {
      if (e.button > 0) return;
      try { svg.setPointerCapture(e.pointerId); } catch (_) { /* 무시 */ }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      cancelAnimationFrame(camAnim);
      if (pts.size === 1) {
        const t = e.target.closest && e.target.closest("[data-tile]");
        start = { x: e.clientX, y: e.clientY, cx: cam.cx, cy: cam.cy, tile: t ? +t.dataset.tile : -1 };
        moved = false;
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, zf: cam.zf };
        moved = true;
      }
    });
    svg.addEventListener("pointermove", (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size >= 2 && pinch) {
        const [a, b] = [...pts.values()];
        const [mx, my] = local((a.x + b.x) / 2, (a.y + b.y) / 2);
        zoomAt(mx, my, (pinch.zf * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.d);
      } else if (start) {
        const dx = e.clientX - start.x, dy = e.clientY - start.y;
        if (!moved && Math.hypot(dx, dy) > 7) { moved = true; st.classList.add("is-drag"); }
        if (moved) { cam.cx = start.cx - dx / view.sc; cam.cy = start.cy - dy / view.sc; schedCam(); }
      }
    });
    const end = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size === 0) {
        if (!moved && start && start.tile >= 0 && e.type === "pointerup") pickTile(start.tile);
        start = null; pinch = null; st.classList.remove("is-drag");
      } else if (pts.size === 1) {
        const [p] = [...pts.values()];
        start = { x: p.x, y: p.y, cx: cam.cx, cy: cam.cy, tile: -1 }; pinch = null;
      }
    };
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", end);
    svg.addEventListener("wheel", (e) => {
      e.preventDefault();
      const [x, y] = local(e.clientX, e.clientY);
      zoomAt(x, y, cam.zf * Math.exp(-e.deltaY * 0.0016));
    }, { passive: false });
    if (window.ResizeObserver) { const ro = new ResizeObserver(() => measure()); ro.observe(st); ro.observe($("#cv-hud")); ro.observe($("#cv-jobs")); }
    else addEventListener("resize", measure);
    requestAnimationFrame(measure);
  }

  // 장면 위 말풍선 — 다 지은 건물 · 다음 단계
  function drawBubs() {
    const el = $("#cv-bubs"); if (!el) return;
    const list = [];
    for (const i of fresh) if (s.bld[i]) list.push(`<button type="button" class="mgx-ready cv-bub" data-act="fresh" data-i="${i}" data-at="${i}"><span>${ic("sparkles", 13)}</span>완공!</button>`);
    if (!C.canEraUp(s)) list.push(`<button type="button" class="mgx-ready cv-bub is-era" data-act="tab" data-tab="company" data-at="${HQ}"><span>${ic("rocket", 13)}</span>다음 단계</button>`);
    el.innerHTML = list.join("");
    HKUI.refreshIcons(el);
    placeBubs();
  }
  function placeBubs() {
    const el = $("#cv-bubs"); if (!el || !s) return;
    el.querySelectorAll("[data-at]").forEach((b) => {
      const i = +b.dataset.at, w = tileWorld(i);
      b.style.left = `${(view.tx + w.x * view.sc).toFixed(1)}px`;
      b.style.top = `${(view.ty + (w.y + artTop(i) - 4) * view.sc).toFixed(1)}px`;
    });
  }
  function sparkle(i) {
    const fx = $("#cv-fxl"); if (!fx || reduce()) return;
    const w = tileWorld(i);
    const x = view.tx + w.x * view.sc, y = view.ty + (w.y - 14) * view.sc;
    const el = document.createElement("div");
    el.className = "cv-spark";
    el.style.left = `${x}px`; el.style.top = `${y}px`;
    el.innerHTML = Array.from({ length: 10 }, (_, n) => { const a = (n / 10) * Math.PI * 2; return `<i style="--dx:${(Math.cos(a) * 46).toFixed(0)}px;--dy:${(Math.sin(a) * 34).toFixed(0)}px"></i>`; }).join("");
    fx.appendChild(el);
    setTimeout(() => el.remove(), 1100);
    const st = $("#cv-stage").getBoundingClientRect();
    HKFx.float({ x: st.left + x, y: st.top + y }, "완공!", { color: "#d98a00" });
  }

  // ── 글자 도우미 ────────────────────────────────────────────────────
  const FXI = { money: ["wallet", "var(--c-money)", "자금"], ideas: ["lightbulb", "var(--c-idea)", "아이디어"], rep: ["heart", "var(--c-rep)", "인기"], morale: ["smile", "var(--c-mor)", "분위기"], cap: ["users", "var(--c-ap)", "직원 자리"], rspeed: ["lightbulb", "var(--c-idea)", "회의 시간"], grow: ["user-plus", "var(--c-ap)", "직원 증가"], ap: ["zap", "var(--c-ap)", "기운"], time: ["clock-3", "#5a6482", "시간"] };
  let fxBonus = false;
  const fxc = (k, v, sub = "") => `<span class="cv-fx${fxBonus ? " is-bonus" : ""}" style="--c:${FXI[k][1]}" title="${fxBonus ? "어울림 보너스 · " : ""}${FXI[k][2]}">${ic(fxBonus ? "sparkles" : FXI[k][0], 13)}${v}${sub ? `<small>${sub}</small>` : ""}</span>`;
  const fxBonusChips = (o) => { fxBonus = true; try { return fxChips(o); } finally { fxBonus = false; } };
  function fxChips(o) {
    const p = [];
    if (o.money) p.push(fxc("money", `+${num(o.money)}`, "/시간"));
    if (o.ideas) p.push(fxc("ideas", `+${o.ideas}`, "/시간"));
    if (o.rep) p.push(fxc("rep", `+${o.rep}`, "/시간"));
    if (o.morale) p.push(fxc("morale", `분위기 ${signed(o.morale)}`));
    if (o.cap) p.push(fxc("cap", `직원 자리 +${o.cap}`));
    if (o.rspeed) p.push(fxc("rspeed", `회의 −${Math.round(o.rspeed * 100)}%`));
    if (o.grow) p.push(fxc("grow", `직원 증가 +${Math.round(o.grow * 100)}%`));
    return p.join("");
  }
  // 산출 글자(창 · 알림용)
  function fxText(o) {
    const p = [];
    if (o.money) p.push(`자금 시간당 +${num(o.money)}`);
    if (o.ideas) p.push(`아이디어 시간당 +${o.ideas}`);
    if (o.rep) p.push(`인기 시간당 +${o.rep}`);
    if (o.morale) p.push(`분위기 ${signed(o.morale)}`);
    if (o.cap) p.push(`직원 자리 +${o.cap}`);
    if (o.rspeed) p.push(`아이디어 회의 시간 −${Math.round(o.rspeed * 100)}%`);
    if (o.grow) p.push(`직원 증가 +${Math.round(o.grow * 100)}%`);
    return p.join(" · ");
  }
  const fitNames = (B) => (B.fit || []).map((k) => TILES[C.TYPE_BY_KEY[k]].name).join(" · ");
  const need = (o) => `data-need="${o.m || 0},${o.i || 0},${o.a || 0}"`;
  const rich = () => Object.assign({}, s, { money: 1e15, ideas: 1e9, ap: 999 });
  const bic = (icon, col, sz = 22, cls = "") => `<span class="cv-bic ${cls}" style="--c:${col}">${ic(icon, sz)}</span>`;

  // ── 지도 탭 — 고른 칸 ──────────────────────────────────────────────
  function panelHtml(i) {
    const T = C.typeOf(s, i), own = C.owned(s, i), front = C.isFrontier(s, i), h = HEX[i];
    const where = ["가운데", "첫째 줄", "둘째 줄", "바깥 줄"][h.d];
    const head = (chip, cls) => `<div class="cv-th">${bic(own || front ? T.icon : "cloud", own || front ? TCOL[T.k] : "#9fb0d6", 26, "is-lg")}<div class="cv-th__tx"><div class="cv-th__name">${own || front ? T.name : "아직 모르는 땅"}</div><div class="cv-th__sub">${where}</div></div><span class="mgx-chip ${cls}">${chip}</span></div>`;
    const wrap = (inner) => `<div class="mgx-card cv-tcard">${inner}</div>`;
    if (!own && !front) {
      return wrap(head("구름 속", "is-gray") + `<p class="cv-desc">아직 무엇이 있는지 몰라요. 내 땅과 맞붙은 블록부터 하나씩 사면 구름이 걷혀요. 동네에 인기가 쌓여도 저절로 넓어져요.</p>`) + mapHint();
    }
    const base = fxChips({ money: T.money, ideas: T.ideas, rep: T.rep, morale: T.morale, cap: T.cap });
    if (!own) {
      const cost = C.expandCost(s);
      return wrap(head("살 수 있어요", "") + `<p class="cv-desc">${T.desc}</p>${base ? `<div class="cv-lbl">내 땅이 되면</div><div class="cv-fxs">${base}</div>` : ""}
        <button type="button" class="mgx-btn is-lg is-wide cv-bigbtn" data-act="expand" data-i="${i}" ${need({ m: cost, a: C.AP.expand })}>${ic("signpost", 20)}땅 사기<span class="cv-costs"><span>${ic("zap", 13)}${C.AP.expand}</span><span>${ic("wallet", 13)}${num(cost)}</span></span></button>`) + mapHint();
    }
    const b = C.building(s, i);
    if (T.k === "hq") {
      const E = ERAS[s.era];
      let out = head("본사", "is-good") + `<p class="cv-desc">지금은 <b>${ieyo(s.bld[HQ] === "tower" ? "새 사옥" : E.hqName)}</b>. ${T.desc}</p><div class="cv-fxs">${fxChips({ money: E.hqMoney, ideas: E.hqIdeas, cap: E.hqCap })}</div>`;
      if (s.bld[HQ] === "tower") out += `<div class="cv-note is-good">${ic("party-popper", 16)}<span>새 사옥이 섰어요. ${fxText(BLD.tower)}</span></div>`;
      else if (b) out += progHtml(i, b);
      else if (s.era === 2) out += `<div class="cv-lbl">여기에 지을 수 있어요</div><div class="cv-opts">${optHtml(i, "tower", T)}</div>`;
      else out += `<div class="cv-note">${ic("info", 16)}<span>본사는 단계가 오를 때마다 커져요. 마지막 단계(오피스 타운)에서 아이디어 「사옥 설계」를 내면 이 자리에 랜드마크 새 사옥을 올릴 수 있어요.</span></div>`;
      if (!C.canEraUp(s)) out += `<button type="button" class="mgx-btn is-gold is-lg is-wide cv-bigbtn" data-act="tab" data-tab="company">${ic("rocket", 20)}다음 단계로 갈 수 있어요</button>`;
      return wrap(out) + mapHint();
    }
    let out = head("내 땅", "is-good") + `<p class="cv-desc">${T.desc}</p>${base ? `<div class="cv-fxs">${base}</div>` : ""}`;
    if (s.bld[i]) {
      const B = BLD[s.bld[i]], fit = (B.fit || []).includes(T.k);
      out += `<div class="cv-built">${bic(B.icon, BCOL[s.bld[i]], 22)}<div><div class="cv-built__nm">${B.name}${fit ? `<span class="cv-fit">${ic("sparkles", 11)}어울려요</span>` : ""}</div><div class="cv-fxs">${fxChips(B)}${fit ? fxBonusChips(B.bonus) : ""}</div><small>${B.desc}</small></div></div>`;
      return wrap(out) + mapHint();
    }
    if (b) return wrap(out + progHtml(i, b)) + mapHint();
    const keys = Object.keys(BLD).filter((k) => !BLD[k].hqOnly);
    const open = keys.filter((k) => !C.bldLock(s, k));
    const locked = keys.filter((k) => C.bldLock(s, k));
    const full = s.builds.length >= C.buildSlots(s);
    open.sort((a, b2) => ((BLD[b2].fit || []).includes(T.k) ? 1 : 0) - ((BLD[a].fit || []).includes(T.k) ? 1 : 0));
    let list = `<div class="cv-h">${ic("hammer", 17)}여기에 지을 건물</div>`;
    if (full) list += `<div class="cv-note">${ic("hourglass", 16)}<span>지금 짓는 곳이 다 찼어요. 다 지으면 또 지을 수 있어요${C.buildSlots(s) < 2 ? "(골목 스타트업부터 두 곳)" : ""}.</span></div>`;
    list += `<div class="cv-opts">${open.map((k) => optHtml(i, k, T)).join("")}</div>`;
    if (locked.length) list += `<details class="cv-locked"><summary>${ic("lock", 15)}아이디어를 내면 열리는 건물 ${locked.length}개${ic("chevron-down", 15)}</summary><ul>${locked.map((k) => `<li>${bic(BLD[k].icon, "#a3abc2", 15, "is-xs")}<b>${BLD[k].name}</b><span>${RES[BLD[k].req].name} · ${ERAS[RES[BLD[k].req].era].name}</span></li>`).join("")}</ul></details>`;
    return wrap(out) + list;
  }
  // 지도 탭 아래 — 지금 해 볼 만한 일(누르면 그곳으로)
  function todoHtml() {
    const it = [];
    if (!C.canEraUp(s)) it.push(["rocket", "var(--mg-gold-deep)", "다음 단계로 올라갈 수 있어요", 'data-act="tab" data-tab="company"']);
    if (s.cards.length) it.push(["newspaper", "#ff9f43", `오늘의 소식 ${s.cards.length}장`, 'data-act="tab" data-tab="events"']);
    if (!s.res) it.push(["lightbulb", "var(--c-idea)", "아이디어 회의를 걸어 두세요", 'data-act="tab" data-tab="research"']);
    if (s.builds.length < C.buildSlots(s)) it.push(["hammer", "#f97316", "빈 땅에 건물을 지어요", 'data-act="idleBuild"']);
    if (s.ap >= C.AP_MAX) it.push(["zap", "var(--c-ap)", "기운이 가득 찼어요 — 옆 땅을 사 봐요", 'data-act="goFront"']);
    if (!it.length) return "";
    return `<div class="cv-todo"><div class="cv-lbl">지금 해 볼 일</div>${it.map(([i, c, t2, a]) => `<button type="button" class="cv-todo__it" ${a}>${bic(i, c, 16, "is-sm")}<span class="cv-todo__tx">${t2}</span>${ic("chevron-right", 16)}</button>`).join("")}</div>`;
  }
  const mapHint = () => todoHtml() + `<p class="cv-hint">${ic("hand", 14)}칸을 눌러 골라요 · 끌어서 옮기고 두 손가락으로 크게 봐요</p>`;
  function optHtml(i, k, T) {
    const B = BLD[k], fit = (B.fit || []).includes(T.k), cost = C.buildCost(s, i, k), time = C.buildTime(s, i, k);
    const hard = C.canBuild(rich(), i, k);
    return `<div class="cv-opt${fit ? " is-fit" : ""}${k === "tower" ? " is-tower" : ""}">
      ${bic(B.icon, BCOL[k], 24)}
      <div class="cv-opt__tx"><div class="cv-opt__nm">${B.name}${fit ? `<span class="cv-fit">${ic("sparkles", 11)}어울려요</span>` : ""}</div>
        <div class="cv-fxs is-sm">${fxChips(B)}${fit ? fxBonusChips(B.bonus) : ""}</div>
        ${B.fit && !fit ? `<small class="cv-opt__tip">${fitNames(B)}에선 ${fxText(B.bonus)} 더</small>` : ""}
        <div class="cv-opt__meta"><span>${ic("wallet", 13)}${num(cost)}</span><span>${ic("clock-3", 13)}${dur(time)}</span><span>${ic("zap", 13)}${C.AP.build}</span></div>
        ${hard ? `<small class="cv-why">${hard}</small>` : ""}</div>
      <button type="button" class="mgx-btn is-sm cv-buildbtn" data-act="build" data-i="${i}" data-k="${k}" ${need({ m: cost, a: C.AP.build })} ${hard ? 'data-hard="1" disabled' : ""}>${ic("hammer", 15)}짓기</button>
    </div>`;
  }
  function progHtml(i, b) {
    const B = BLD[b.k], fit = (B.fit || []).includes(C.typeOf(s, i).k);
    return `<div class="cv-prog">${bic(B.icon, BCOL[b.k], 22)}<div><div class="cv-prog__nm">${B.name} 짓는 중<small data-rem="b${i}"></small></div>
      <div class="mgx-bar" style="--bar:${BCOL[b.k]}"><i data-bar="b${i}"></i></div><div class="cv-fxs is-sm">${fxChips(B)}${fit ? fxBonusChips(B.bonus) : ""}</div></div></div>`;
  }

  // ── 아이디어 탭(research) — 단계별 나무 ──────────────────────────────────────────
  const RH = 108;
  function treeLayout(era) {
    const keys = RES_KEYS.filter((k) => RES[k].era === era);
    const tier = {};
    const tierOf = (k) => {
      if (tier[k] != null) return tier[k];
      const inEra = RES[k].need.filter((n) => RES[n].era === era);
      return (tier[k] = inEra.length ? 1 + Math.max(...inEra.map(tierOf)) : 0);
    };
    keys.forEach(tierOf);
    const rows = [];
    keys.forEach((k) => { (rows[tier[k]] = rows[tier[k]] || []).push(k); });
    const x = {};
    rows.forEach((row, t) => {
      if (t > 0) {
        const bary = (k) => { const ps = RES[k].need.filter((n) => x[n] != null); return ps.length ? ps.reduce((a, n) => a + x[n], 0) / ps.length : 0.5; };
        row.sort((a, b) => bary(a) - bary(b));
      }
      row.forEach((k, n) => { x[k] = (n + 0.5) / row.length; });
    });
    return { keys, tier, x, rows: rows.length };
  }
  function researchHtml() {
    let now;
    if (s.res) {
      const X = RES[s.res.k];
      now = `<div class="mgx-card cv-rnow">${bic(X.icon, "var(--c-idea)", 24)}<div class="cv-rnow__tx"><div class="cv-rnow__t">「${X.name}」 회의 중<small data-rem="r"></small></div><div class="mgx-bar" style="--bar:var(--c-idea)"><i data-bar="r"></i></div><small>${X.opens}</small></div></div>`;
    } else {
      now = `<div class="mgx-card cv-rnow is-idle">${bic("lightbulb", "#a3abc2", 24)}<div class="cv-rnow__tx"><div class="cv-rnow__t">아이디어 회의가 쉬고 있어요</div><small>빛나는 동그라미를 눌러 다음 회의를 걸어 두세요. 일하는 동안엔 <b>오래 걸리는 회의</b>가 좋아요.</small></div></div>`;
    }
    const secs = ERAS.map((E, era) => {
      const L = treeLayout(era);
      const hgt = L.rows * RH;
      const lines = L.keys.flatMap((k) => RES[k].need.filter((n) => RES[n].era === era).map((n) => {
        const x1 = L.x[n] * 100, y1 = L.tier[n] * RH + 62, x2 = L.x[k] * 100, y2 = L.tier[k] * RH + 4, my = (y1 + y2) / 2;
        const dn = s.done.includes(n), dk = s.done.includes(k);
        return `<path class="${dn && dk ? "is-done" : dn ? "is-open" : ""}" d="M${x1} ${y1} C${x1} ${my} ${x2} ${my} ${x2} ${y2}"/>`;
      })).join("");
      const chip = era < s.era ? `<span class="mgx-chip is-good">${ic("check", 12)}지나온 단계</span>` : era === s.era ? `<span class="mgx-chip">${ic("flag", 12)}지금 단계</span>` : `<span class="mgx-chip is-gray">${ic("lock", 12)}다음 단계</span>`;
      const doneN = L.keys.filter((k) => s.done.includes(k)).length;
      return `<div class="cv-tsec${era === s.era ? " is-now" : ""}${era > s.era ? " is-later" : ""}"><div class="cv-tsec__h"><b>${E.name}</b>${chip}<small>${doneN}/${L.keys.length}</small></div>
        <div class="cv-tbox" style="height:${hgt}px"><svg class="cv-tlines" viewBox="0 0 100 ${hgt}" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>${L.keys.map((k) => nodeHtml(k, L)).join("")}</div></div>`;
    });
    const arrow = (era) => `<div class="cv-tarrow">${ic("arrow-down", 15)}「${RES[ERAS[era].key].name}」 · 직원 ${ERAS[era].needStaff}명이면 다음 단계</div>`;
    return now + `<div class="cv-tree">${secs[0]}${arrow(0)}${secs[1]}${arrow(1)}${secs[2]}</div>`;
  }
  function nodeHtml(k, L) {
    const X = RES[k], st = C.resState(s, k);
    const badge = st === "done" ? `<span class="cv-node__ok">${ic("check", 12)}</span>` : st === "locked" || st === "era" ? `<span class="cv-node__lock">${ic("lock", 10)}</span>` : "";
    const meta = st === "done" ? "끝" : st === "doing" ? `<span data-rems="r"></span>` : `${ic("lightbulb", 11)}${num(X.cost)}`;
    const p = st === "doing" ? ` data-ring="r"` : "";
    return `<button type="button" class="cv-node is-${st}${X.key ? " is-key" : ""}" data-act="resPick" data-k="${k}" style="left:${(L.x[k] * 100).toFixed(2)}%;top:${L.tier[k] * RH}px" aria-label="${X.name}">
      <span class="cv-node__ic"${p}><span class="cv-node__g">${ic(X.icon, 22)}</span>${badge}${X.key ? `<span class="cv-node__key">${ic("key-round", 10)}</span>` : ""}</span>
      <span class="cv-node__nm">${X.name}</span><span class="cv-node__meta">${meta}</span></button>`;
  }
  function resSheet(k) {
    const X = RES[k], st = C.resState(s, k);
    const needs = X.need.length ? X.need.map((n) => `<li class="${s.done.includes(n) ? "is-ok" : ""}">${ic(s.done.includes(n) ? "circle-check" : "circle", 16)}${RES[n].name}</li>`).join("") : `<li class="is-ok">${ic("circle-check", 16)}바로 할 수 있어요</li>`;
    let btn;
    if (st === "done") btn = `<div class="cv-note is-good">${ic("circle-check", 16)}<span>이미 낸 아이디어예요.</span></div>`;
    else if (st === "doing") btn = `<div class="cv-prog is-flat"><div><div class="cv-prog__nm">회의 중<small data-rem="r"></small></div><div class="mgx-bar" style="--bar:var(--c-idea)"><i data-bar="r"></i></div></div></div>`;
    else {
      const why = C.canResearch(rich(), k) || (s.res ? "회의는 한 번에 하나씩 해요" : "");
      btn = `<button type="button" class="mgx-btn is-lg is-wide cv-bigbtn" data-act="research" data-k="${k}" ${need({ i: X.cost })} ${why ? 'data-hard="1" disabled' : ""}>${ic("lightbulb", 20)}${why ? why : "회의 시작"}<span class="cv-costs"><span>${ic("lightbulb", 13)}${num(X.cost)}</span><span>${ic("clock-3", 13)}${dur(C.resTime(s, k))}</span></span></button>`;
    }
    return `<div class="cv-rs">${bic(X.icon, st === "done" ? "var(--mg-accent)" : "var(--c-idea)", 30, "is-xl")}<div class="cv-rs__t">${X.name}${X.key ? `<span class="cv-fit">${ic("key-round", 11)}핵심</span>` : ""}</div>
      <div class="cv-rs__era">「${ERAS[X.era].name}」 단계 사업 아이디어</div>
      <div class="cv-rs__opens">${ic("unlock", 16)}<span>${X.opens}</span></div>
      <div class="cv-lbl">먼저 낼 아이디어</div><ul class="cv-needs">${needs}</ul>
      ${btn}</div>`;
  }

  // ── 회사 탭 ────────────────────────────────────────────────────────
  // 본사 칸 하나(회사 탭 · 창 그림용) — 늘 밝은 낮
  function eraMini(era, tower) {
    return withLook("day", () => {
      const c = corners(0, 0, BH, BH), cs = shades(COL.curb), z = CURB, top = [c.Bk, c.R, c.B, c.L].map((p) => up(p, z)), lot = corners(0, -z, LOT, LOT);
      return poly([c.L, c.B, up(c.B, z), up(c.L, z)], cs.l) + poly([c.B, c.R, up(c.R, z), up(c.B, z)], cs.r) + `<polygon points="${P(top)}" fill="${COL.walk}"/><polygon points="${P([lot.Bk, lot.R, lot.B, lot.L])}" fill="${LOTC.hq}"/>` +
        `<g transform="translate(0 ${-z})">${hqArt(era, tower)}</g>`;
    });
  }
  const EVB = ["-24 -30 48 44", "-24 -40 48 54", "-25 -56 50 70"];
  const eraSvg = (era, tower, cls = "cv-mini3d") => `<svg class="${cls}" viewBox="${tower ? "-26 -86 52 100" : EVB[era]}" aria-hidden="true">${eraMini(era, tower)}</svg>`;
  function companyHtml() {
    const R = C.rates(s), E = ERAS[s.era], needs = C.eraNeeds(s);
    const steps = ERAS.map((e, n) => `<div class="cv-step ${n < s.era ? "is-past" : n === s.era ? "is-now" : "is-later"}"><span class="cv-step__art">${eraSvg(n, n === 2 && s.bld[HQ] === "tower")}</span><b>${n < s.era ? ic("check", 13) : ""}${e.name}</b></div>`).join("");
    let eraBox;
    if (needs) {
      const ok = !C.canEraUp(s);
      eraBox = `<div class="cv-lbl">다음 단계 <b>${ro(ERAS[s.era + 1].name)}</b> 가려면</div><ul class="cv-needs">${needs.map((n) => `<li class="${n.ok ? "is-ok" : ""}">${ic(n.ok ? "circle-check" : "circle", 17)}<span>${n.label}</span>${n.cur ? `<small>${n.cur}</small>` : ""}</li>`).join("")}</ul>
        <button type="button" class="mgx-btn is-gold is-lg is-wide cv-bigbtn${ok ? " is-ready" : ""}" data-act="eraUp" ${ok ? "" : "disabled"}>${ic("rocket", 20)}${ro(ERAS[s.era + 1].name)} 올라가기</button>`;
    } else {
      eraBox = s.fin ? `<div class="cv-note is-good">${ic("party-popper", 16)}<span>오피스 타운 완성! 다음 이야기는 다음 업데이트에서 열려요.</span></div>`
        : `<p class="cv-desc">마지막 단계예요. 아이디어 「사옥 설계」를 내고 본사 자리에 랜드마크 <b>새 사옥</b>을 지으면 오피스 타운 완성이에요.</p>`;
    }
    const growTx = R.growth > 0 ? `다음 직원까지 약 ${dur(((1 - s.grow) / R.growth) * H)}` : `자리가 가득 찼어요 — 사택을 짓거나 주택가를 넓혀요`;
    const mor = R.mor.map(([l, v]) => `<li><span>${l}</span><b class="${v < 0 ? "is-neg" : ""}">${signed(v)}</b></li>`).join("");
    const pol = [0, 1].map((slot) => polSlotHtml(slot)).join("");
    const nextTile = C.repTileAt(s.repTiles), prevTile = s.repTiles ? C.repTileAt(s.repTiles - 1) : 0;
    const repP = clamp(((s.rep - prevTile) / Math.max(1, nextTile - prevTile)) * 100, 0, 100);
    const perks = PERKS.map((p) => `<li class="${s.rep >= p.rep ? "is-ok" : ""}">${ic(s.rep >= p.rep ? "circle-check" : "circle", 17)}<div><b>인기 ${p.rep} · ${p.name}</b><small>${p.desc}</small></div></li>`).join("");
    const counts = {};
    for (const k of Object.values(s.bld)) counts[k] = (counts[k] || 0) + 1;
    const blist = Object.keys(counts).length ? Object.entries(counts).map(([k, n]) => `<li>${bic(BLD[k].icon, BCOL[k], 15, "is-xs")}<span>${BLD[k].name}</span><b>${n}</b></li>`).join("") : `<li class="is-empty">아직 지은 건물이 없어요</li>`;
    const head = (icon, t, sub = "") => `<div class="cv-ch">${ic(icon, 18)}<b>${t}</b>${sub ? `<small>${sub}</small>` : ""}</div>`;
    return `<div class="cv-co">
      <div class="mgx-card cv-ccard">${head("flag", "단계")}<div class="cv-track">${steps}</div>${eraBox}</div>
      <div class="mgx-card cv-ccard">${head("trending-up", "시간당 버는 양")}<div class="cv-inc">
        <div style="--c:var(--c-money)">${ic("wallet", 16)}<b data-l="mrate"></b><small>자금</small></div>
        <div style="--c:var(--c-idea)">${ic("lightbulb", 16)}<b data-l="irate"></b><small>아이디어</small></div>
        <div style="--c:var(--c-rep)">${ic("heart", 16)}<b data-l="rrate"></b><small>인기</small></div></div></div>
      <div class="cv-cpair">
        <div class="mgx-card cv-ccard">${head("users", "직원")}<div class="cv-big"><b>${s.staff}</b><span>/ ${R.cap}명</span></div>
          <div class="mgx-bar" style="--bar:var(--c-ap)"><i data-grow="1"></i></div><p class="cv-small">${growTx}</p></div>
        <div class="mgx-card cv-ccard">${head("smile", "분위기")}<div class="cv-big"><b>${R.morale}</b><span>/ 100</span></div>
          <div class="mgx-bar" style="--bar:var(--c-mor)"><i style="width:${R.morale}%"></i></div><p class="cv-small">생산 ×${R.prod.toFixed(2)}</p></div>
      </div>
      <details class="mgx-card cv-ccard cv-fold"><summary>${head("list", "분위기가 어떻게 정해지나요")}${ic("chevron-down", 16)}</summary><ul class="cv-mor">${mor}</ul>
        <p class="cv-small">직원 한 명마다 자금 시간당 +${num(E.staffMoney)} · 아이디어 시간당 +${E.staffIdeas}. 분위기가 좋을수록 빨리 늘어요.</p></details>
      <div class="mgx-card cv-ccard">${head("heart-handshake", "회사 문화", `바꿀 때 ${ic("zap", 11)}${C.AP.policy}`)}${pol}</div>
      <div class="mgx-card cv-ccard">${head("heart", "인기")}<div class="cv-big"><b>${num(s.rep)}</b><span>다음 땅 ${num(nextTile)}</span></div>
        <div class="mgx-bar" style="--bar:var(--c-rep)"><i style="width:${repP.toFixed(1)}%"></i></div>
        <p class="cv-small">인기는 줄지 않아요. 동네에 소문이 날 때마다 땅이 한 칸씩 저절로 넓어져요(지금까지 ${s.repTiles}칸).</p><ul class="cv-perks">${perks}</ul></div>
      <div class="mgx-card cv-ccard">${head("building", "지은 건물", `내 땅 ${C.ownedCount(s)} / ${HEX.length}칸`)}<ul class="cv-blist">${blist}</ul></div>
    </div>`;
  }
  function polSlotHtml(slot) {
    if (slot >= C.slotsOf(s)) return `<div class="cv-pslot is-locked">${ic("lock", 16)}<span>인기 60이 되면 두 번째 회사 문화 칸이 열려요</span></div>`;
    const k = s.pol[slot], P0 = k ? POL[k] : null;
    let html = `<div class="cv-pslot">${bic(P0 ? P0.icon : "plus", P0 ? "var(--mg-accent)" : "#a3abc2", 18)}<div><b>${P0 ? P0.name : "비어 있어요"}</b><small>${P0 ? P0.desc : "회사 문화를 하나 골라 걸어 두세요"}</small></div>
      <button type="button" class="mgx-btn is-sm is-soft" data-act="polOpen" data-slot="${slot}">${polSlot === slot ? "닫기" : "바꾸기"}</button></div>`;
    if (polSlot === slot) {
      html += `<div class="cv-plist">${Object.keys(POL).map((pk) => {
        const X = POL[pk], lock = C.polLock(s, pk), inUse = s.pol.includes(pk);
        return `<div class="cv-popt${lock ? " is-lock" : ""}">${bic(lock ? "lock" : X.icon, lock ? "#b8bfd0" : "var(--mg-accent)", 16, "is-sm")}<div><b>${X.name}</b><small>${lock || X.desc}</small></div>
          ${lock ? "" : inUse ? `<span class="mgx-chip">걸려 있어요</span>` : `<button type="button" class="mgx-btn is-sm" data-act="policy" data-slot="${slot}" data-k="${pk}" ${need({ a: C.AP.policy })}>${ic("zap", 13)}${C.AP.policy} 걸기</button>`}</div>`;
      }).join("")}${k ? `<button type="button" class="cv-link" data-act="policy" data-slot="${slot}" data-k="">이 칸 비우기(기운 ${C.AP.policy})</button>` : ""}</div>`;
    }
    return html;
  }

  // ── 오늘의 소식(cards) — 동네 소식지 카드 두 장 중 하나 뒤집기 ─────────────────────
  function fxCardChips(fx, light) {
    const p = [];
    if (fx.money) p.push(fxc("money", `${fx.money > 0 ? "+" : "−"}${num(Math.abs(fx.money))}원`));
    if (fx.ideas) p.push(fxc("ideas", `+${num(fx.ideas)}`));
    if (fx.rep) p.push(fxc("rep", `인기 +${fx.rep}`));
    if (fx.ap) p.push(fxc("ap", `기운 +${fx.ap}`));
    if (fx.staff) p.push(fxc("cap", `직원 +${fx.staff}`));
    if (fx.buff) p.push(fxc("morale", `분위기 ${signed(fx.buff.v)}`, ` ${fx.buff.h}시간`));
    if (fx.rushBuild) p.push(fxc("time", `건설 ${dur(fx.rushBuild)} 당김`));
    if (fx.rushRes) p.push(fxc("time", `회의 ${dur(fx.rushRes)} 당김`));
    return `<span class="cv-fxs is-sm${light ? " is-light" : ""}">${p.join("")}</span>`;
  }
  function fxDesc(fx) {
    const p = [];
    if (fx.money) p.push(`${fx.money > 0 ? "+" : "−"}${num(Math.abs(fx.money))}원`);
    if (fx.ideas) p.push(`아이디어 +${num(fx.ideas)}`);
    if (fx.rep) p.push(`인기 +${fx.rep}`);
    if (fx.ap) p.push(`기운 +${fx.ap}`);
    if (fx.staff) p.push(`직원 +${fx.staff}`);
    if (fx.buff) p.push(`분위기 ${signed(fx.buff.v)}`);
    if (fx.rushBuild) p.push(`건설 당김`);
    if (fx.rushRes) p.push(`회의 당김`);
    return p;
  }
  function eventsHtml() {
    const top = `<div class="cv-evtop"><b>오늘의 동네 소식</b><span>하루 한 장 · 최대 3장까지 쌓여요. 안 골라도 손해는 없어요.</span></div>`;
    if (!s.cards.length) return top + `<div class="mgx-card cv-empty"><span class="cv-empty__ic">${ic("mail-open", 30)}</span><b>오늘 소식은 다 읽었어요</b><span>내일 새 소식지가 와요.</span></div>`;
    return top + `<div class="cv-evs">${s.cards.map((c, n) => {
      const X = CARDS[c.k];
      const opt = (o) => {
        const fx = C.cardFx(s, c, o), why = C.canCard(s, fx);
        return `<button type="button" class="cv-pc is-${o}" data-act="card" data-id="${c.id}" data-o="${o}" ${fx.money < 0 ? need({ m: -fx.money }) : ""} ${why ? "disabled" : ""}>
          <span class="cv-pc__in"><span class="cv-pc__f"><span class="cv-pc__tag">${o === "a" ? "A" : "B"}</span><b>${X[o][0]}</b>${fxCardChips(fx, o === "a")}${why ? `<small class="cv-why">${why}</small>` : ""}</span>
          <span class="cv-pc__b">${ic("party-popper", 30)}<b>골랐어요!</b><small>${fxDesc(fx).join(" · ")}</small></span></span></button>`;
      };
      return `<div class="cv-ev" style="--d:${n * 0.1}s"><div class="cv-ev__head">${bic(X.icon, "#ff9f43", 24, "is-lg")}<div><div class="cv-ev__t">${X.title}</div><p>${X.body}</p></div></div><div class="cv-ev__pick">${opt("a")}${opt("b")}</div></div>`;
    }).join("")}</div>`;
  }

  // ── 1초마다 바뀌는 글자 · 막대 ─────────────────────────────────────
  function updateLive() {
    if (!root || !s) return;
    const R = C.rates(s), now = performance.now();
    const L = {
      money: num(s.money), ideas: num(s.ideas), morale: `${R.morale}`, rep: num(s.rep),
      ap: `${s.ap}/${C.AP_MAX}`, apnext: s.ap >= C.AP_MAX ? "가득" : `+1 ${dur(C.AP_SEC - s.apAcc)}`,
      mrate: `+${num(R.money)}`, irate: `+${num(R.ideas)}`, rrate: `+${R.rep >= 10 ? Math.round(R.rep) : R.rep.toFixed(1).replace(/\.0$/, "")}`,
    };
    const scopes = [root, ...document.querySelectorAll(".cv-ov")];
    const all = (q, fn) => scopes.forEach((sc) => sc.querySelectorAll(q).forEach(fn));
    all("[data-l]", (el) => { const k = el.dataset.l; if (countUntil[k] > now) return; const v = L[k]; if (v != null && el.textContent !== v) el.textContent = v; });
    const prog = {};
    for (const b of s.builds) prog["b" + b.i] = b;
    if (s.res) prog.r = s.res;
    all("[data-bar]", (el) => { const p = prog[el.dataset.bar]; if (p) el.style.width = pct(p.rem, p.tot).toFixed(1) + "%"; });
    all("[data-rem]", (el) => { const p = prog[el.dataset.rem]; if (p) el.textContent = `${dur(p.rem)} 남았어요`; });
    all("[data-rems]", (el) => { const p = prog[el.dataset.rems]; if (p) el.textContent = dur(p.rem); });
    all("[data-ring]", (el) => { const p = prog[el.dataset.ring]; if (p) el.style.setProperty("--p", pct(p.rem, p.tot).toFixed(1)); });
    all("[data-sring]", (el) => { const p = prog["b" + el.dataset.sring]; if (p) el.setAttribute("stroke-dashoffset", (RING * (1 - pct(p.rem, p.tot) / 100)).toFixed(2)); });
    all("[data-grow]", (el) => { el.style.width = `${(R.growth > 0 ? s.grow * 100 : 100).toFixed(1)}%`; });
    all("[data-need]", (el) => {
      const [m, i, a] = el.dataset.need.split(",").map(Number);
      const off = !!el.dataset.hard || s.money < m || s.ideas < i || s.ap < a;
      if (el.disabled !== off) el.disabled = off;
    });
  }
  // 행동 뒤 HUD 숫자가 굴러가고 알약이 통통
  const hudSnap = () => ({ money: s.money, ideas: s.ideas, rep: s.rep, ap: s.ap });
  function hudAnim(b) {
    const fmts = { money: num, ideas: num, rep: num, ap: (v) => `${Math.round(v)}/${C.AP_MAX}` };
    for (const k of Object.keys(fmts)) {
      const to = s[k], from = b[k];
      if (Math.abs(to - from) < 1) continue;
      const el = $(`[data-l="${k}"]`); if (!el) continue;
      countUntil[k] = performance.now() + 700;
      HKFx.count(el, from, to, { ms: 600, fmt: fmts[k] });
      const pill = el.closest(".cv-pill");
      HKFx.bump(pill);
      const d = to - from;
      HKFx.float(pill, `${d > 0 ? "+" : "−"}${k === "ap" ? Math.abs(Math.round(d)) : num(Math.abs(d))}`, { color: d > 0 ? "#16a34a" : "#e5484d", dy: 44 });
    }
  }

  // ── 누르기 ────────────────────────────────────────────────────────
  function bind() {
    root.addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]");
      if (!b || b.disabled || !root.contains(b)) return;
      if (b.dataset.act === "card") { flipCard(b); return; }
      act(b.dataset.act, b.dataset, b);
    });
    root.addEventListener("keydown", (e) => {
      const t = e.target.closest && e.target.closest("[data-tile]");
      if (t && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); pickTile(+t.dataset.tile); }
    });
  }
  function pickTile(i) {
    if (tab !== "map") { tab = "map"; sel = i; renderAll(); return; }
    const prev = root.querySelector(".cv-tile.is-sel");
    if (prev) prev.classList.remove("is-sel");
    sel = i;
    const t = root.querySelector(`[data-tile="${i}"]`);
    if (t) t.classList.add("is-sel");
    drawPanel();
    updateLive();
    const p = $("#cv-panel");
    if (p && innerWidth < 960) {
      const r = p.getBoundingClientRect();
      if (r.top > innerHeight - 140) window.scrollTo({ top: scrollY + r.top - innerHeight * 0.42, behavior: reduce() ? "auto" : "smooth" });
    }
  }
  function run(why, okMsg) {
    if (why) { HKUI.toast(why, "danger"); return false; }
    C.summarize(s);
    store.saveNow();
    renderAll();
    if (okMsg) HKUI.toast(okMsg);
    return true;
  }
  function flipCard(btn) {
    const ev = btn.closest(".cv-ev");
    if (!ev || ev.classList.contains("is-picking")) return;
    ev.classList.add("is-picking");
    btn.classList.add("is-flip");
    const r = btn.getBoundingClientRect();
    setTimeout(() => act("card", btn.dataset, null, { x: r.left + r.width / 2, y: r.top + r.height / 2 }), reduce() ? 0 : 720);
  }
  function act(a, d, el, at) {
    if (a === "tab") {
      if (tab === d.tab && innerWidth >= 960) return;
      tab = d.tab; polSlot = -1; renderAll();
      if (innerWidth < 960) window.scrollTo({ top: 0, behavior: reduce() ? "auto" : "smooth" });
      return;
    }
    if (a === "goTile") { const i = +d.i; if (tab !== "map") { tab = "map"; sel = i; renderAll(); } else pickTile(i); focusTile(i); return; }
    if (a === "idleBuild") {
      const empty = HEX.map((h, i) => i).find((i) => i !== HQ && C.owned(s, i) && !s.bld[i] && !C.building(s, i));
      if (empty != null) act("goTile", { i: empty }); else HKUI.toast("빈 내 땅이 없어요 — 옆 땅을 사서 넓혀요", "info");
      return;
    }
    if (a === "goFront") {
      const f = HEX.map((h, i) => i).filter((i) => C.isFrontier(s, i)).sort((x, y) => HEX[x].d - HEX[y].d)[0];
      if (f != null) act("goTile", { i: f });
      return;
    }
    if (a === "fresh") {
      const i = +d.i;
      fresh.delete(i);
      const r = el.getBoundingClientRect(), B = BLD[s.bld[i]];
      if (B) {
        const t = fxText(B).split(" · ")[0];
        HKFx.float({ x: r.left + r.width / 2, y: r.top }, t || "완공!", { color: "#2447c7" });
        HKFx.confetti({ x: r.left + r.width / 2, y: r.top + 10, n: 18 });
      }
      el.remove();
      pickTile(i);
      return;
    }
    if (a === "zoom") {
      if (d.z === "fit") { const t = townCam(); animCam(cam.zf > 1.04 && Math.abs(cam.zf - t.zf) < 0.05 && Math.hypot(cam.cx - t.cx, cam.cy - t.cy) < 8 ? { cx: 0, cy: (WB.y0 + WB.y1) / 2, zf: 1 } : t); }
      else { cancelAnimationFrame(camAnim); zoomAt(view.w / 2, view.ay, cam.zf * (d.z === "in" ? 1.3 : 1 / 1.3)); }
      return;
    }
    if (a === "pill") return pillInfo(d.k);
    if (a === "help") { closeMenu(); return showHelp(); }
    if (a === "more") return openMenu(el);
    if (a === "reset") { closeMenu(); return resetFlow(); }
    if (a === "resPick") return openResSheet(d.k);
    const snap = hudSnap();
    if (a === "expand") {
      const i = +d.i;
      popTiles.add(i);
      const ok = run(C.expand(s, i), `${eul(C.typeOf(s, i).name)} 샀어요`);
      popTiles.clear();
      if (ok) { hudAnim(snap); HKFx.confetti(Object.assign(stagePt(i), { n: 22 })); }
      return;
    }
    if (a === "build") {
      const k = d.k;
      if (run(C.build(s, +d.i, k), `${eul(BLD[k].name)} 짓기 시작했어요`)) hudAnim(snap);
      return;
    }
    if (a === "research") {
      closeSheet();
      if (run(C.research(s, d.k), `「${RES[d.k].name}」 아이디어 회의를 시작했어요`)) hudAnim(snap);
      return;
    }
    if (a === "polOpen") { polSlot = polSlot === +d.slot ? -1 : +d.slot; drawPanel(); updateLive(); return; }
    if (a === "policy") {
      const why = C.setPolicy(s, +d.slot, d.k || null);
      if (!why) polSlot = -1;
      if (run(why, d.k ? `회사 문화 「${POL[d.k].name}」${bat(POL[d.k].name) ? "을" : "를"} 걸었어요` : "회사 문화 칸을 비웠어요")) hudAnim(snap);
      return;
    }
    if (a === "card") {
      const before = C.ownedCount(s);
      const card = s.cards.find((c) => c.id === +d.id);
      const fx = card ? C.cardFx(s, card, d.o) : null;
      const ok = run(C.chooseCard(s, +d.id, d.o), "골랐어요");
      if (ok) {
        hudAnim(snap);
        if (at && fx) {
          fxDesc(fx).forEach((t, n) => setTimeout(() => HKFx.float(at, t, { color: t.startsWith("−") ? "#e5484d" : "#2447c7", dy: -n * 4 }), n * 160));
          if (fx.money > 0) HKFx.fly(at, $('[data-k="money"]'), { n: 8 });
          if (fx.ideas > 0) HKFx.fly(at, $('[data-k="ideas"]'), { n: 5, color: "radial-gradient(circle at 35% 30%, #efe6ff, #8b5cf6 60%, #6d28d9)" });
        }
        if (C.ownedCount(s) > before) HKUI.toast(`동네에 소문이 나서 땅이 ${C.ownedCount(s) - before}칸 넓어졌어요`);
      } else renderAll();
      return;
    }
    if (a === "eraUp") {
      const prev = s.era;
      if (run(C.eraUp(s))) enqueue((fin) => showEraUp(prev + 1, fin));
    }
  }
  function pillInfo(k) {
    const R = C.rates(s);
    const t = {
      money: `자금 ${won(s.money)} · 시간당 +${num(R.money)}`,
      ideas: `아이디어 ${num(s.ideas)} · 시간당 +${num(R.ideas)}`,
      morale: `분위기 ${R.morale} · 생산 ×${R.prod.toFixed(2)}`,
      rep: `인기 ${num(s.rep)} · 다음 땅은 ${num(C.repTileAt(s.repTiles))}에서`,
      ap: s.ap >= C.AP_MAX ? `기운 ${s.ap} · 가득 찼어요` : `기운 ${s.ap}/${C.AP_MAX} · ${dur(C.AP_SEC - s.apAcc)} 뒤 +1(20분마다)`,
    }[k];
    HKUI.toast(t, "info");
  }

  // ── 더보기 메뉴 · 아래 판 ──────────────────────────────────────────
  function openMenu(btn) {
    closeMenu();
    const r = btn.getBoundingClientRect();
    const m = document.createElement("div");
    m.className = "cv-ov cv-menuwrap";
    m.innerHTML = `<button type="button" class="cv-menubg" data-esc-close aria-label="닫기"></button>
      <div class="cv-menu" role="menu" style="top:${r.bottom + 8}px;right:${Math.max(8, innerWidth - r.right)}px">
        <button type="button" role="menuitem" data-m="help">${ic("circle-help", 18)}도움말</button>
        <button type="button" role="menuitem" data-m="reset" class="is-danger">${ic("rotate-ccw", 18)}처음부터 다시</button></div>`;
    m.addEventListener("click", (e) => {
      const it = e.target.closest("[data-m]");
      closeMenu();
      if (it) act(it.dataset.m, {});
    });
    document.body.appendChild(m);
    HKUI.refreshIcons(m);
    m.querySelector("[data-m]").focus({ preventScroll: true });
  }
  function closeMenu() { document.querySelectorAll(".cv-menuwrap").forEach((m) => m.remove()); }
  function openSheet(html) {
    closeSheet();
    const w = document.createElement("div");
    w.className = "mgx-sheet-wrap cv-ov cv-sheetwrap";
    w.innerHTML = `<div class="mgx-sheet cv-sheet" role="dialog" aria-modal="true"><button type="button" class="cv-x" data-esc-close data-sclose aria-label="닫기">${ic("x", 20)}</button>${html}</div>`;
    w.addEventListener("click", (e) => {
      if (e.target === w || e.target.closest("[data-sclose]")) { closeSheet(); return; }
      const b = e.target.closest("[data-act]");
      if (b && !b.disabled) act(b.dataset.act, b.dataset, b);
    });
    document.body.appendChild(w);
    HKUI.refreshIcons(w);
    updateLive();
    const f = w.querySelector(".mgx-btn:not([disabled])") || w.querySelector("button");
    if (f) f.focus({ preventScroll: true });
  }
  function closeSheet() { document.querySelectorAll(".cv-sheetwrap").forEach((m) => m.remove()); }
  const openResSheet = (k) => openSheet(resSheet(k));

  // ── 창(모달) ──────────────────────────────────────────────────────
  function modal(html, onClose, cls = "") {
    const ov = document.createElement("div");
    ov.className = "cv-modal cv-ov";
    ov.innerHTML = `<div class="cv-modal__box ${cls}" role="dialog" aria-modal="true">${html}</div>`;
    const close = () => { if (!ov.isConnected) return; ov.remove(); if (onClose) onClose(); };
    ov.addEventListener("click", (e) => { if (e.target === ov || e.target.closest("[data-mclose]")) close(); });
    document.body.appendChild(ov);
    HKUI.refreshIcons(ov);
    const f = ov.querySelector("[data-mfocus]") || ov.querySelector("button");
    if (f) f.focus({ preventScroll: true });
    return { ov, close };
  }
  const xBtn = `<button type="button" class="cv-x" data-mclose data-esc-close aria-label="닫기">${ic("x", 20)}</button>`;
  const skyStyle = () => `--sky1:${SKY.day[0]};--sky2:${SKY.day[1]}`;

  function showAway(log, fin) {
    const rows = [];
    if (log.money >= 1) rows.push(["wallet", "var(--c-money)", "자금", log.money, (v) => `+${won(v)}`]);
    if (log.ideas >= 1) rows.push(["lightbulb", "var(--c-idea)", "아이디어", log.ideas, (v) => `+${num(v)}`]);
    if (log.rep >= 1) rows.push(["heart", "var(--c-rep)", "인기", log.rep, (v) => `+${num(v)}`]);
    if (log.staff) rows.push(["users", "var(--c-ap)", "새 직원", log.staff, (v) => `+${Math.round(v)}명`]);
    if (log.ap) rows.push(["zap", "var(--c-ap)", "기운", log.ap, (v) => `+${Math.round(v)}`]);
    const ends = [
      ...log.builds.map((k) => [BLD[k].icon, BCOL[k], `${eul(BLD[k].name)} 다 지었어요`]),
      ...log.research.map((k) => [RES[k].icon, "var(--c-idea)", `아이디어 「${RES[k].name}」${bat(RES[k].name) ? "이" : "가"} 나왔어요`]),
      ...(log.tiles.length ? [["map", "#22c55e", `동네에 소문이 나서 땅이 ${log.tiles.length}칸 넓어졌어요`]] : []),
    ];
    const m = modal(`${xBtn}<div class="cv-away">
      <div class="cv-hero is-sm" style="${skyStyle(s.era)}"><i class="cv-rays"></i>${eraSvg(s.era, s.bld[HQ] === "tower", "cv-hero__art")}</div>
      <div class="cv-mt">자리 비운 동안</div>
      <p class="cv-msub">${dur(log.away)} 동안 회사가 일했어요.</p>
      ${log.full ? `<div class="cv-note is-warn">${ic("battery-full", 16)}<span>가득 찼어요 — 8시간까지만 쌓이고 그 뒤로는 쉬었어요.</span></div>` : ""}
      <ul class="cv-away__rows">${rows.map(([i, c, l], n) => `<li style="--c:${c}">${bic(i, c, 16, "is-sm")}<span>${l}</span><b data-cnt="${n}">0</b></li>`).join("") || `<li><span>쌓인 게 거의 없어요</span></li>`}</ul>
      <div class="cv-lbl">끝난 일</div>
      <ul class="cv-away__ends">${ends.map(([i, c, t]) => `<li>${bic(i, c, 14, "is-xs")}<span>${t}</span></li>`).join("") || `<li class="is-none">끝난 일은 없어요. 건설 · 아이디어 회의를 걸어 두면 자리 비운 동안 진행돼요.</li>`}</ul>
      <button type="button" class="mgx-btn is-lg is-wide" data-mclose data-mfocus>좋아요</button>
    </div>`, fin);
    rows.forEach(([, , , v, fmt], n) => { const el = m.ov.querySelector(`[data-cnt="${n}"]`); if (el) setTimeout(() => HKFx.count(el, 0, v, { ms: 800, fmt }), 200 + n * 120); });
  }

  function showGuide(fin) {
    const steps = [
      ["map", "var(--mg-accent)", "빈 동네 차고에서 시작해요", "동네 블록을 눌러 건물을 짓고, 내 땅 옆 팻말 블록을 <b>사서</b> 동네를 넓혀요. 기운은 20분마다 1씩 차요(최대 24)."],
      ["lightbulb", "var(--c-idea)", "아이디어 회의가 회사를 키워요", "아이디어를 모아 회의를 걸어 두면 실제 시간이 지나 새 사업 아이디어가 나와요. 새 건물 · 회사 문화 · 다음 단계가 열려요."],
      ["sunrise", "#ff9f43", "출근 전에 걸어 두세요", "일하는 동안에도 최대 8시간까지 회사가 돌아가요. 점심 · 퇴근 후에 들러 정산하고, <b>오늘의 소식</b>도 골라요."],
    ];
    let n = 0;
    const m = modal(`${xBtn}<div class="cv-guide"></div>`, () => { s.guide = true; store.dirty(); fin(); });
    const box = m.ov.querySelector(".cv-guide");
    const draw = () => {
      const [i, c, t, b] = steps[n];
      box.innerHTML = `${n === 0 ? `<div class="cv-hero is-sm" style="${skyStyle(0)}"><i class="cv-rays"></i>${eraSvg(0, false, "cv-hero__art")}</div>` : `<div class="cv-guide__ic">${bic(i, c, 34, "is-xl")}</div>`}<small>${n + 1} / ${steps.length}</small><div class="cv-mt">${t}</div><p class="cv-msub">${b}</p>
        <div class="cv-guide__dots">${steps.map((_, k) => `<i class="${k === n ? "is-on" : ""}"></i>`).join("")}</div>
        <div class="cv-guide__btns"><button type="button" class="mgx-btn is-white" data-g="skip">${n === steps.length - 1 ? "닫기" : "건너뛰기"}</button>
        <button type="button" class="mgx-btn" data-g="next" data-mfocus>${n === steps.length - 1 ? "시작해요" : "다음"}</button></div>`;
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
    const li = (i, c, b, t) => `<li>${bic(i, c, 15, "is-sm")}<div><b>${b}</b><span>${t}</span></div></li>`;
    modal(`${xBtn}<div class="cv-help"><div class="cv-mt">${ic("circle-help", 22)}오피스 타운 도움말</div>
      <div class="cv-lbl">하루 흐름</div><p>출근 전에 건설 · 아이디어 회의를 걸어 두면 일하는 동안 진행돼요. 점심 · 퇴근 후에 들러 정산하고 다음 일을 걸어요. 자리 비운 동안은 <b>최대 8시간</b>까지 쌓여요.</p>
      <div class="cv-lbl">자원</div><ul>
        ${li("wallet", "var(--c-money)", "자금", "땅 사기 · 건설에 써요. 블록 · 건물 · 직원이 벌어요.")}
        ${li("lightbulb", "var(--c-idea)", "아이디어", "아이디어 회의에 써요. 대학가 · 회의실 · 직원이 내요.")}
        ${li("smile", "var(--c-mor)", "분위기", "50이면 보통이에요. 높으면 더 많이 벌고 직원이 빨리 늘어요. 직원이 많아지면 북적여서 내려가요 — 카페테리아 · 휴게실 · 회사 문화로 올려요.")}
        ${li("heart", "var(--c-rep)", "인기", "줄지 않아요. 동네에 소문이 날 때마다 땅이 한 칸씩 저절로 넓어지고, 60 · 200 · 400에 좋은 일이 생겨요.")}
        ${li("zap", "var(--c-ap)", "기운", `20분마다 1(최대 24). 땅 사기 ${C.AP.expand} · 건설 시작 ${C.AP.build} · 회사 문화 바꾸기 ${C.AP.policy}.`)}</ul>
      <div class="cv-lbl">블록과 건물</div><p>블록마다 기본 산출이 달라요. 내 땅 블록 사이엔 길이 저절로 나요. 건물은 블록 하나에 하나씩, 어울리는 블록에 지으면 보너스가 붙어요(예: 강변 · 공원 + 카페테리아 = 분위기 더).</p>
      <div class="cv-lbl">지도 보기</div><p>지도를 끌어서 옮기고, 두 손가락(PC는 휠)으로 크게 · 작게 볼 수 있어요. 오른쪽 아래 단추로 한눈에 다시 볼 수 있어요.</p>
      <div class="cv-lbl">단계</div><p>차고 창업 → 골목 스타트업 → 오피스 타운. 단계마다 핵심 아이디어와 직원 수를 채우면 올라갈 수 있어요. 마지막 단계에서 랜드마크 <b>새 사옥</b>을 다 지으면 오피스 타운 완성이에요(1차 완주).</p>
      <div class="cv-lbl">이용 시간</div><p>업무 시간(평일 9:00~11:30, 13:00~18:00)에는 들어올 수 없지만, 걸어 둔 일은 계속 진행돼요.</p>
      <button type="button" class="mgx-btn is-lg is-wide" data-mclose data-mfocus>알겠어요</button></div>`, null, "is-wide");
  }

  function celebrate() {
    if (reduce()) return;
    HKFx.confetti({ n: 80 });
    setTimeout(() => HKFx.confetti({ x: innerWidth * 0.25, y: innerHeight * 0.3, n: 40 }), 260);
    setTimeout(() => HKFx.confetti({ x: innerWidth * 0.75, y: innerHeight * 0.3, n: 40 }), 480);
  }
  function showEraUp(era, fin) {
    const E = ERAS[era], prev = ERAS[era - 1];
    const news = RES_KEYS.filter((k) => RES[k].era === era).length;
    modal(`${xBtn}<div class="cv-cele"><div class="cv-hero" style="${skyStyle(era)}"><i class="cv-rays"></i>${eraSvg(era, false, "cv-hero__art")}</div>
      <span class="mgx-chip is-gold">${ic("sparkles", 13)}다음 단계로!</span><div class="cv-mt is-big">${E.name} 단계가 열렸어요!</div><p class="cv-msub">${E.desc}</p>
      <ul class="cv-cele__list"><li>${bic("palette", "var(--mg-accent)", 15, "is-sm")}<span>본사가 커지고 건물이 높아졌어요</span></li><li>${bic("lightbulb", "var(--c-idea)", 15, "is-sm")}<span>새 사업 아이디어 ${news}개가 열렸어요</span></li>
      <li>${bic("users", "var(--c-ap)", 15, "is-sm")}<span>본사 직원 자리 ${prev.hqCap} → ${E.hqCap}</span></li>${E.slots > prev.slots ? `<li>${bic("hammer", "#f97316", 15, "is-sm")}<span>이제 동시에 두 곳을 지을 수 있어요</span></li>` : ""}</ul>
      <button type="button" class="mgx-btn is-gold is-lg is-wide" data-mclose data-mfocus>계속 키우기</button></div>`, fin, "is-cele");
    celebrate();
  }
  function checkFinish() {
    if (s && s.fin && !s.cele) {
      s.cele = true; store.saveNow();
      enqueue((fin) => {
        modal(`${xBtn}<div class="cv-cele is-fin"><div class="cv-hero is-tall" style="${skyStyle(2)}"><i class="cv-rays"></i>${eraSvg(2, true, "cv-hero__art")}</div>
          <span class="mgx-chip is-gold">${ic("trophy", 13)}1차 완주</span><div class="cv-mt is-big">오피스 타운 완성!</div>
          <p class="cv-msub">빈 동네 차고에서 시작한 회사가 동네 랜드마크 새 사옥을 올렸어요. 정말 수고 많았어요.</p>
          <div class="cv-note">${ic("sparkles", 16)}<span>다음 이야기는 다음 업데이트에서 열려요. 그동안 땅을 더 사고 건물을 채워 보세요.</span></div>
          <button type="button" class="mgx-btn is-gold is-lg is-wide" data-mclose data-mfocus>고마워요</button></div>`, fin, "is-cele");
        celebrate();
      });
    }
  }

  async function resetFlow() {
    const a = await HKUI.confirmDialog("처음부터 다시 할까요?", "땅 · 건물 · 아이디어 · 직원이 모두 사라지고 차고부터 새로 시작해요.", { confirmLabel: "다시 할래요" });
    if (!a) return;
    const b = await HKUI.confirmDialog("정말 지울까요?", "<b>되돌릴 수 없어요.</b> 지금까지 키운 회사가 모두 지워져요.", { confirmLabel: "모두 지우기", confirmVariant: "danger" });
    if (!b) return;
    try {
      await store.reset();
      s = C.blank(store.now());
      store.state = s;
      await store.saveNow();
      tab = "map"; sel = HQ; polSlot = -1; fresh.clear();
      Object.assign(cam, townCam());
      renderAll();
      applyCam();
      HKUI.toast("차고부터 새로 시작해요");
      enqueue(showGuide);
    } catch (e) {
      HKUI.toast((e && e.message) || "지금은 지울 수 없어요", "danger");
    }
  }

  G.HKCiv = { mount };
})(typeof window !== "undefined" ? window : globalThis);
