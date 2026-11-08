// 옥상 텃밭 — 매니지먼트 게임(key: farm). 회사 옥상 텃밭에 씨앗을 심고, 실제 시간이 지나면 거둬 창고에 쌓고, 팔거나 동료 주문에 쓴다.
// 출근 전에 심고 점심 · 퇴근 후에 거두는 리듬. 다 자라도 시들지 않고(벌 없음), 자리 비운 동안은 8시간까지만 자란다.
//
// 시간: state.ft = 「텃밭 시계」(초). 화면이 열려 있으면 실제 시간대로, 자리 비운 동안은 최대 8시간까지만 흐른다.
//       작물 · 새 주문 기다림은 모두 이 시계로 잰다. state.t = 마지막으로 계산한 서버 시각(ms).
// window.HKFarm = { mount(container, { profile }) }
window.HKFarm = (function () {
  "use strict";
  const KEY = "farm";
  const TITLE = "옥상 텃밭";
  const AWAY_CAP = 8 * 3600; // 자리 비운 동안 자라는 최대 시간(초)
  const ORDER_WAIT = 15 * 60; // 주문을 끝내거나 넘기면 이만큼 뒤 새 주문
  const MAX_LV = 15;

  // ── 작물 ── t: 자라는 시간(초) · seed: 씨앗 값 · y: 한 칸 수확량 · p: 한 개 판매가 · xp: 한 칸 거둘 때 경험치
  const CROPS = [
    { k: "sprout", n: "새싹채소", lv: 1, t: 600, seed: 5, y: 2, p: 5, xp: 2 },
    { k: "lettuce", n: "상추", lv: 1, t: 1800, seed: 10, y: 3, p: 8, xp: 4 },
    { k: "scallion", n: "쪽파", lv: 2, t: 3600, seed: 18, y: 3, p: 15, xp: 7 },
    { k: "tomato", n: "방울토마토", lv: 2, t: 7200, seed: 30, y: 4, p: 20, xp: 12 },
    { k: "pepper", n: "고추", lv: 3, t: 10800, seed: 40, y: 5, p: 22, xp: 17 },
    { k: "eggplant", n: "가지", lv: 4, t: 14400, seed: 55, y: 4, p: 36, xp: 22 },
    { k: "cucumber", n: "오이", lv: 5, t: 18000, seed: 70, y: 5, p: 34, xp: 27 },
    { k: "carrot", n: "당근", lv: 6, t: 21600, seed: 90, y: 6, p: 36, xp: 32 },
    { k: "strawberry", n: "딸기", lv: 7, t: 28800, seed: 110, y: 6, p: 48, xp: 42 },
    { k: "corn", n: "옥수수", lv: 9, t: 32400, seed: 130, y: 4, p: 80, xp: 46 },
    { k: "pumpkin", n: "호박", lv: 10, t: 36000, seed: 150, y: 3, p: 125, xp: 52 },
    { k: "watermelon", n: "수박", lv: 12, t: 43200, seed: 200, y: 2, p: 250, xp: 62 },
  ];
  const CROP = Object.fromEntries(CROPS.map((c) => [c.k, c]));

  // 레벨 n → n+1 에 필요한 경험치 (1~14)
  const NEED = [0, 20, 30, 80, 140, 220, 320, 440, 580, 750, 950, 1200, 1500, 1850, 2250];

  // 밭: 5×5 중 처음 3×3, 넓히는 순서는 4×4 → 5×5
  const PLOT_ORDER = [0, 1, 2, 5, 6, 7, 10, 11, 12, 3, 8, 13, 15, 16, 17, 18, 4, 9, 14, 19, 20, 21, 22, 23, 24];
  // 10번째 칸부터 [필요 레벨, 값]
  const PLOT_REQ = [[2, 80], [3, 150], [4, 250], [5, 400], [6, 600], [6, 800], [7, 1000], [8, 1300], [9, 1600], [10, 2000], [11, 2400], [12, 2900], [13, 3400], [13, 4000], [14, 4700], [15, 5500]];

  // 도구 — lv: 단계마다 필요한 텃밭 레벨 · cost: 값
  const AUTO_PLOTS = [0, 2, 4, 6];
  const SHED_CAP = [40, 60, 90, 130, 180, 240, 320];
  const TOOLS = {
    can: { n: "물뿌리개", lv: [2, 4, 7, 10, 13], cost: [150, 500, 1200, 2500, 4500], color: "#0ea5e9", bg: "#e0f2fe", icon: "droplets",
      eff: (l) => (l ? `자라는 시간 −${l * 6}%` : "아직 없어요"), desc: "새로 심는 작물이 더 빨리 자라요" },
    fert: { n: "비료", lv: [3, 5, 8, 11, 14], cost: [200, 600, 1400, 2800, 5000], color: "#a16207", bg: "#fef3c7", icon: "sprout",
      eff: (l) => (l ? `수확량 +${l * 12}%` : "아직 없어요"), desc: "한 칸에서 더 많이 거둬요" },
    auto: { n: "자동 물주기", lv: [6, 9, 12], cost: [800, 2500, 5000], color: "#2563eb", bg: "#dbeafe", icon: "refresh-cw",
      eff: (l) => (l ? `${AUTO_PLOTS[l]}칸 자동 다시 심기` : "아직 없어요"), desc: "고른 칸은 거두면 같은 작물을 저절로 다시 심어요" },
    shed: { n: "창고", lv: [2, 4, 6, 8, 10, 12], cost: [100, 300, 800, 1600, 3000, 5000], color: "#b45309", bg: "#ffedd5", icon: "warehouse",
      eff: (l) => `${SHED_CAP[l]}개까지 보관`, desc: "거둔 작물을 더 많이 쌓아 둬요" },
  };
  const TOOL_KEYS = ["can", "fert", "auto", "shed"];

  // 도감 보너스
  const DEX_MILES = [
    { n: 3, txt: "판매가 +3%" },
    { n: 6, txt: "경험치 +5%" },
    { n: 9, txt: "판매가 +5% 더(모두 +8%)" },
    { n: 12, txt: "자라는 시간 −5%" },
  ];

  // 동료(가상 인물)
  const DEPTS = [["총무팀", "#f59e0b"], ["인사팀", "#ec4899"], ["재무팀", "#14b8a6"], ["영업1팀", "#f97316"], ["개발팀", "#6366f1"], ["디자인팀", "#a855f7"],
    ["마케팅팀", "#ef4444"], ["고객지원팀", "#0ea5e9"], ["품질팀", "#22c55e"], ["기획팀", "#3b82f6"], ["구매팀", "#84cc16"], ["홍보팀", "#e11d48"]];
  const SURNAMES = ["박", "김", "이", "최", "정", "한", "윤", "서", "조", "강", "오", "문", "임", "송", "배", "노"];
  const RANKS = ["사원", "주임", "대리", "과장", "차장", "팀장"];
  const LINES = ["점심 샐러드에 넣으려고요", "팀 회식 때 쓰려고요", "부모님께 보내 드리려고요", "탕비실 간식으로 놓아 두려고요", "주말 캠핑에 가져가려고요",
    "도시락 반찬 하려고요", "아이 간식으로 주려고요", "요즘 채소를 챙겨 먹고 있어요", "부서 생일 파티에 쓸 거예요", "신입 환영회에 내려고요",
    "옥상 텃밭 거라고 자랑하려고요", "비빔밥 해 먹으려고요"];

  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (n) => HKMgmt.num(n);
  const won = (n) => `${num(n)}원`;
  const dur = (s) => HKMgmt.dur(s);
  const ic = (name, size = 16, color = "currentColor") => (window.HKUI ? HKUI.icon(name, size, color) : "");
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  // 받침에 따라 조사 고르기 — jo("상추", "을", "를") → "상추를"
  const jo = (w, a, b) => { const c = String(w).charCodeAt(String(w).length - 1) - 0xac00; return w + (c >= 0 && c < 11172 && c % 28 ? a : b); };
  const reduceMotion = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (_) { return false; } };

  // ══ 그림 ══════════════════════════════════════════════════
  // 열매 모양 — 가운데(0,0) 기준, 크기 약 20
  const FRUIT = {
    tomato: `<circle r="7" fill="#ef4444"/><circle cx="-2.4" cy="-2.4" r="2" fill="#fff" opacity=".5"/><path d="M-3.5 -6.2 L0 -4.4 L3.5 -6.2 L1.6 -7.4 L0 -9.4 L-1.6 -7.4Z" fill="#16a34a"/>`,
    pepper: `<path d="M0 -12 v-3" stroke="#15803d" stroke-width="2" stroke-linecap="round"/><path d="M-4.2 -9 Q-5.4 4 1.5 12 Q2.6 2 4.2 -9Z" fill="#dc2626"/><path d="M-2.6 -6 Q-3.2 1 -0.6 6" stroke="#fca5a5" stroke-width="1.4" fill="none" stroke-linecap="round"/><path d="M-4.8 -9 Q0 -12.4 4.8 -9 Q0 -7.4 -4.8 -9Z" fill="#15803d"/>`,
    eggplant: `<path d="M0 -10 C4 -10 4 -4 6.2 1 C8.4 7 4.6 11.5 0 11.5 C-4.6 11.5 -8.4 7 -6.2 1 C-4 -4 -4 -10 0 -10Z" fill="#7e22ce"/><path d="M-3.4 0 Q-4.4 5 -1.6 8" stroke="#c084fc" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M-4.6 -8 Q0 -3.6 4.6 -8 Q2.4 -11.6 0 -11.6 Q-2.4 -11.6 -4.6 -8Z" fill="#15803d"/><path d="M0 -11.6 v-3" stroke="#15803d" stroke-width="2" stroke-linecap="round"/>`,
    cucumber: `<rect x="-3.6" y="-12" width="7.2" height="24" rx="3.6" fill="#15803d"/><path d="M-1.2 -9 v17" stroke="#4ade80" stroke-width="1.4" stroke-linecap="round"/><g fill="#bbf7d0"><circle cx="1.8" cy="-6" r=".8"/><circle cx="1.8" cy="0" r=".8"/><circle cx="1.8" cy="6" r=".8"/></g><path d="M0 -12 v-2.6" stroke="#65a30d" stroke-width="1.8" stroke-linecap="round"/>`,
    carrot: `<path d="M0 -6 l-4.5 -8 M0 -6 l0 -9.5 M0 -6 l4.5 -8" stroke="#22c55e" stroke-width="2.4" stroke-linecap="round"/><path d="M-5.4 -6 Q0 -8 5.4 -6 L1 12 Q0 13.4 -1 12Z" fill="#f97316"/><path d="M-2.4 -1 h3 M-1.4 4 h2.6" stroke="#c2410c" stroke-width="1.2" stroke-linecap="round"/>`,
    strawberry: `<path d="M0 10 C-8.6 3 -8.6 -5 -4.6 -6.6 C-2.4 -7.6 0 -6 0 -6 C0 -6 2.4 -7.6 4.6 -6.6 C8.6 -5 8.6 3 0 10Z" fill="#e11d48"/><g fill="#fde68a"><circle cx="-3" cy="-2" r=".8"/><circle cx="2.6" cy="-2.4" r=".8"/><circle cx="0" cy="1.6" r=".8"/><circle cx="-3.4" cy="2.8" r=".8"/><circle cx="3.2" cy="2.4" r=".8"/><circle cx="0" cy="6" r=".8"/></g><path d="M-5 -6.6 L-1.6 -8 L0 -10.6 L1.6 -8 L5 -6.6 L1.6 -5.6 L0 -4.4 L-1.6 -5.6Z" fill="#16a34a"/>`,
    corn: `<path d="M-6 9 Q-9 -4 -2 -12 Q-4 0 -1 10Z" fill="#65a30d"/><ellipse cx="1" cy="-1" rx="4.8" ry="10.5" fill="#facc15"/><g fill="#eab308"><circle cx="-1" cy="-7" r=".9"/><circle cx="2.4" cy="-5" r=".9"/><circle cx="-1" cy="-2" r=".9"/><circle cx="2.4" cy="0" r=".9"/><circle cx="-1" cy="3" r=".9"/><circle cx="2.4" cy="5" r=".9"/></g><path d="M7 9 Q9.6 -3 3 -11 Q5.6 0 2.6 10Z" fill="#4d7c0f"/>`,
    pumpkin: `<ellipse rx="12.5" ry="9" fill="#f97316"/><ellipse rx="5.4" ry="9" fill="#fb923c"/><path d="M-6.4 -8 Q-11 0 -6.4 8 M6.4 -8 Q11 0 6.4 8" stroke="#ea580c" stroke-width="1.6" fill="none"/><path d="M0 -8 q1 -4 3.4 -5.2" stroke="#4d7c0f" stroke-width="2.8" stroke-linecap="round" fill="none"/>`,
    watermelon: `<ellipse rx="13" ry="9.5" fill="#16a34a"/><path d="M-9 -6.4 Q-11.4 0 -9 6.4 M-3.4 -9.2 Q-5.6 0 -3.4 9.2 M3.4 -9.2 Q5.6 0 3.4 9.2 M9 -6.4 Q11.4 0 9 6.4" stroke="#14532d" stroke-width="2.2" fill="none"/><ellipse cx="-5" cy="-4.6" rx="3.6" ry="1.6" fill="#fff" opacity=".28" transform="rotate(-20 -5 -4.6)"/>`,
    lettuce: `<circle cx="-5.4" cy="2" r="7" fill="#22c55e"/><circle cx="5.4" cy="2" r="7" fill="#22c55e"/><circle cy="-2.4" r="8" fill="#86efac"/><circle cy="3.6" r="6" fill="#4ade80"/><path d="M0 9 V-6 M0 2 l-4 -4 M0 2 l4 -4" stroke="#dcfce7" stroke-width="1.3" stroke-linecap="round" fill="none"/>`,
    scallion: `<g stroke-linecap="round"><path d="M-4 9 V-2 M-1.4 9 V-12 M1.4 9 V-9 M4 9 V-4" stroke="#22c55e" stroke-width="2.6"/><path d="M-4 11 V5 M-1.4 11 V5 M1.4 11 V5 M4 11 V5" stroke="#f1f5f9" stroke-width="2.8"/></g><rect x="-6" y="3" width="12" height="2.6" rx="1.2" fill="#f59e0b"/>`,
    sprout: `<path d="M-8 6 h16 l-2 6 h-12z" fill="#f59e0b"/><g stroke="#84cc16" stroke-width="1.4" stroke-linecap="round"><path d="M-5 6 V-4 M-2 6 V-7 M1 6 V-5 M4 6 V-8 M6 6 V-2"/></g><g fill="#65a30d"><ellipse cx="-6.4" cy="-5" rx="2.2" ry="1.2"/><ellipse cx="-3.6" cy="-4.2" rx="2.2" ry="1.2"/><ellipse cx="-2" cy="-8.4" rx="2.2" ry="1.2"/><ellipse cx="2.6" cy="-6" rx="2.2" ry="1.2"/><ellipse cx="4" cy="-9.4" rx="2.2" ry="1.2"/><ellipse cx="6.8" cy="-3.4" rx="2.2" ry="1.2"/></g>`,
  };
  const at = (x, y, s, inner, rot = 0) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">${inner}</g>`;
  // 잎 — (x,y) 에서 angle 방향으로 len 만큼
  const leaf = (x, y, len, angle, color, w = 0.38) => `<path d="M0 0 Q${len * 0.5} ${-len * w} ${len} 0 Q${len * 0.5} ${len * w} 0 0Z" transform="translate(${x} ${y}) rotate(${angle})" fill="${color}"/>`;
  const flower = (x, y, c = "#fde047") => `<g transform="translate(${x} ${y})"><circle r="2.6" cx="-2" fill="#fff"/><circle r="2.6" cx="2" fill="#fff"/><circle r="2.6" cy="-2" fill="#fff"/><circle r="2.6" cy="2" fill="#fff"/><circle r="1.8" fill="${c}"/></g>`;

  // 잎과 줄기(밭 칸 좌표 0~100, 뿌리는 (50,70) 근처). ripe=true 면 열매까지
  const PLANT = {
    sprout(r) {
      let s = "";
      const xs = r ? [-15, -10, -5, 0, 5, 10, 15] : [-9, -3, 3, 9];
      xs.forEach((dx, i) => {
        const x = 50 + dx, h = 16 + ((i * 7) % 5) * 3;
        s += `<path d="M${x} 72 Q${x + (i % 2 ? 2 : -2)} ${72 - h / 2} ${x} ${72 - h}" stroke="#a3e635" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
        s += `<ellipse cx="${x - 3}" cy="${72 - h}" rx="4" ry="2.2" fill="#65a30d" transform="rotate(-20 ${x - 3} ${72 - h})"/><ellipse cx="${x + 3}" cy="${72 - h}" rx="4" ry="2.2" fill="#84cc16" transform="rotate(20 ${x + 3} ${72 - h})"/>`;
      });
      return s;
    },
    lettuce(r) {
      let s = "";
      [-150, -120, -90, -60, -30, -170, -10].forEach((a, i) => { s += leaf(50, 66, r ? 27 : 22, a, i % 2 ? "#4ade80" : "#22c55e", 0.5); });
      return s + (r ? at(50, 58, 1.25, FRUIT.lettuce) : `<circle cx="50" cy="62" r="7" fill="#86efac"/>`);
    },
    scallion(r) {
      let s = "";
      [-12, -6, 0, 6, 12].forEach((dx, i) => {
        const top = r ? 18 + (i % 2) * 8 : 34 + (i % 2) * 6;
        s += `<path d="M${50 + dx} 72 L${50 + dx * 1.1} ${top}" stroke="${i % 2 ? "#16a34a" : "#22c55e"}" stroke-width="4.4" stroke-linecap="round"/>`;
        if (r) s += `<path d="M${50 + dx} 73 L${50 + dx * 1.02} 62" stroke="#f8fafc" stroke-width="4.8" stroke-linecap="round"/>`;
      });
      return s;
    },
    tomato(r) {
      let s = `<path d="M50 72 Q44 52 52 30 Q55 22 50 16" stroke="#15803d" stroke-width="3.2" fill="none" stroke-linecap="round"/><path d="M38 72 V22 M64 72 V22" stroke="#a16207" stroke-width="2.4" stroke-linecap="round"/>`;
      [[48, 58, 200], [50, 50, -20], [47, 40, 190], [52, 30, -30], [50, 22, 210]].forEach(([x, y, a]) => { s += leaf(x, y, 15, a, "#16a34a"); });
      if (r) s += at(40, 46, 0.85, FRUIT.tomato) + at(47, 52, 0.75, FRUIT.tomato) + at(60, 38, 0.85, FRUIT.tomato) + at(58, 58, 0.8, FRUIT.tomato) + at(43, 30, 0.7, FRUIT.tomato);
      else s += flower(42, 44) + flower(60, 36);
      return s;
    },
    pepper(r) {
      let s = `<path d="M50 72 V28" stroke="#15803d" stroke-width="3.2" stroke-linecap="round"/>`;
      [[50, 62, 200], [50, 62, -20], [50, 48, 210], [50, 48, -30], [50, 36, 220], [50, 36, -40], [50, 28, -90]].forEach(([x, y, a]) => { s += leaf(x, y, 17, a, "#15803d"); });
      if (r) s += at(38, 52, 0.85, FRUIT.pepper, 10) + at(62, 48, 0.85, FRUIT.pepper, -10) + at(50, 60, 0.8, FRUIT.pepper) + at(44, 36, 0.65, FRUIT.pepper, 15);
      else s += flower(40, 52) + flower(60, 44);
      return s;
    },
    eggplant(r) {
      let s = `<path d="M50 72 V30" stroke="#6b21a8" stroke-width="3.4" stroke-linecap="round"/>`;
      [[50, 60, 195], [50, 60, -15], [50, 44, 210], [50, 44, -30], [50, 32, -90]].forEach(([x, y, a]) => { s += leaf(x, y, 21, a, "#166534", 0.45); });
      if (r) s += at(36, 56, 1.05, FRUIT.eggplant, 12) + at(63, 56, 1.05, FRUIT.eggplant, -12);
      else s += flower(40, 50, "#c084fc") + flower(60, 46, "#c084fc");
      return s;
    },
    cucumber(r) {
      let s = `<path d="M30 74 V16 M70 74 V16 M28 24 H72 M28 46 H72" stroke="#a16207" stroke-width="2.6" stroke-linecap="round"/><path d="M50 72 Q36 58 48 44 Q60 32 46 18" stroke="#16a34a" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
      [[48, 60, 200], [44, 50, -20], [52, 38, 200], [50, 26, -30], [46, 18, 190]].forEach(([x, y, a]) => { s += leaf(x, y, 16, a, "#22c55e", 0.5); });
      if (r) s += at(36, 56, 0.9, FRUIT.cucumber, 6) + at(62, 52, 0.9, FRUIT.cucumber, -6) + at(56, 32, 0.7, FRUIT.cucumber, -10);
      else s += flower(38, 40) + flower(62, 30);
      return s;
    },
    carrot(r) {
      let s = "";
      [-60, -75, -90, -105, -120].forEach((a, i) => {
        const len = r ? 34 : 24;
        const rad = (a * Math.PI) / 180, x2 = 50 + Math.cos(rad) * len, y2 = 68 + Math.sin(rad) * len;
        s += `<path d="M50 68 L${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="#16a34a" stroke-width="2" stroke-linecap="round"/>`;
        for (let k = 0.45; k < 1; k += 0.18) {
          const px = 50 + Math.cos(rad) * len * k, py = 68 + Math.sin(rad) * len * k;
          s += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${i % 2 ? 3.2 : 3.8}" fill="${i % 2 ? "#22c55e" : "#4ade80"}"/>`;
        }
      });
      if (r) s += `<g fill="#f97316"><path d="M35 72 Q41 60 47 72Z"/><path d="M45 72 Q51 58 57 72Z"/><path d="M55 72 Q61 61 67 72Z"/></g><path d="M38 68 h4 M48 66 h4 M58 68 h4" stroke="#c2410c" stroke-width="1.4" stroke-linecap="round"/>`;
      return s;
    },
    strawberry(r) {
      let s = "";
      [[36, 60], [64, 58], [50, 50], [42, 46], [58, 44]].forEach(([x, y], i) => {
        s += `<path d="M50 72 Q${(50 + x) / 2} ${y + 8} ${x} ${y}" stroke="#15803d" stroke-width="2" fill="none"/>`;
        s += `<g transform="translate(${x} ${y})"><circle cx="-4" r="5.4" fill="${i % 2 ? "#16a34a" : "#22c55e"}"/><circle cx="4" r="5.4" fill="${i % 2 ? "#16a34a" : "#22c55e"}"/><circle cy="-4.4" r="5.4" fill="#4ade80"/></g>`;
      });
      if (r) s += at(34, 68, 0.9, FRUIT.strawberry) + at(65, 66, 0.9, FRUIT.strawberry) + at(50, 62, 0.95, FRUIT.strawberry);
      else s += flower(34, 66) + flower(64, 64);
      return s;
    },
    corn(r) {
      let s = `<path d="M50 74 V${r ? 10 : 24}" stroke="#65a30d" stroke-width="4.4" stroke-linecap="round"/>`;
      [[50, 64, 200, 26], [50, 56, -20, 28], [50, 44, 205, 24], [50, 36, -25, 24], [50, 28, 215, 18]].forEach(([x, y, a, l]) => { s += leaf(x, y, l, a, "#4d7c0f", 0.22); });
      if (r) s += at(59, 46, 0.95, FRUIT.corn, 18) + `<path d="M50 12 l-5 -7 M50 12 l0 -8 M50 12 l5 -7" stroke="#eab308" stroke-width="2.2" stroke-linecap="round"/>`;
      return s;
    },
    pumpkin(r) {
      let s = `<path d="M50 72 Q30 66 26 52 M50 72 Q70 64 74 50" stroke="#4d7c0f" stroke-width="2.4" fill="none"/>`;
      [[34, 50, -110], [66, 48, -70], [26, 60, 200], [74, 58, -20]].forEach(([x, y, a]) => { s += leaf(x, y, 18, a, "#15803d", 0.55); });
      if (r) s += at(50, 62, 1.45, FRUIT.pumpkin);
      else s += at(52, 64, 0.6, FRUIT.pumpkin.replace(/#f97316/g, "#84cc16").replace(/#fb923c/g, "#a3e635").replace(/#ea580c/g, "#65a30d")) + flower(36, 50, "#f59e0b");
      return s;
    },
    watermelon(r) {
      let s = `<path d="M50 72 Q28 70 24 56 Q22 46 32 44 M50 72 Q74 70 76 56" stroke="#15803d" stroke-width="2.2" fill="none"/>`;
      [[30, 46, -120], [70, 50, -60], [24, 60, 190], [76, 60, -10], [50, 52, -90]].forEach(([x, y, a]) => { s += leaf(x, y, 16, a, "#16a34a", 0.55); });
      if (r) s += at(50, 63, 1.55, FRUIT.watermelon);
      else s += at(52, 66, 0.6, FRUIT.watermelon) + flower(34, 46, "#facc15");
      return s;
    },
  };

  // 밭 칸 하나 (viewBox 0 0 100 100). stage: -1 빈 칸 · 0 씨 · 1 싹 · 2 잎 · 3 다 자람
  function plotSvg(k, stage) {
    let s = `<svg viewBox="0 0 100 100" aria-hidden="true">`;
    s += `<rect x="3" y="7" width="94" height="90" rx="15" fill="#9a5b2c"/><rect x="3" y="3" width="94" height="88" rx="15" fill="${stage === 3 ? "#d6995f" : "#c98a52"}"/>`;
    s += `<path d="M14 6 H40 M60 6 H86" stroke="#e0a872" stroke-width="2" stroke-linecap="round" opacity=".7"/>`;
    s += `<rect x="11" y="11" width="78" height="72" rx="10" fill="${stage === 3 ? "#7a4f2c" : "#6b4425"}"/>`;
    s += `<path d="M20 30h60M20 47h60M20 64h60" stroke="#58371c" stroke-width="3" stroke-linecap="round" opacity=".55"/>`;
    s += `<g fill="#7f5534"><circle cx="24" cy="22" r="1.6"/><circle cx="70" cy="38" r="1.4"/><circle cx="36" cy="56" r="1.5"/><circle cx="78" cy="72" r="1.6"/><circle cx="58" cy="20" r="1.2"/></g>`;
    if (stage === 0) {
      s += `<ellipse cx="50" cy="52" rx="16" ry="6.5" fill="#4a2e17"/><g fill="#fde68a"><circle cx="44" cy="50" r="2"/><circle cx="51" cy="52" r="2"/><circle cx="57" cy="49" r="2"/></g>`;
    } else if (stage === 1) {
      s += `<g transform="translate(0 -12)"><ellipse cx="50" cy="70" rx="12" ry="4" fill="#4a2e17"/><g class="fm-plant"><path d="M50 70 V56" stroke="#65a30d" stroke-width="3" stroke-linecap="round"/>${leaf(50, 57, 12, -150, "#84cc16", 0.5)}${leaf(50, 57, 12, -30, "#65a30d", 0.5)}</g></g>`;
    } else if (stage >= 2 && PLANT[k]) {
      // 아래쪽은 남은 시간 글자가 덮으니 그림을 조금 위로 올린다
      s += `<g transform="translate(0 -9)"><ellipse cx="50" cy="72" rx="16" ry="4.5" fill="#4a2e17"/>`;
      const inner = PLANT[k](stage === 3);
      s += stage === 2 ? `<g class="fm-plant"><g transform="translate(50 72) scale(.82) translate(-50 -72)">${inner}</g></g>` : `<g class="fm-plant">${inner}</g>`;
      s += `</g>`;
    }
    return s + `</svg>`;
  }
  // 작물 아이콘 (목록용)
  function cropIco(k) {
    const big = { pumpkin: 1.35, watermelon: 1.3, lettuce: 1.45, sprout: 1.45 }[k] || 1.4;
    return `<svg class="fm-ico" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="19" fill="#f0fdf4"/>${at(20, 21, big, FRUIT[k] || "")}</svg>`;
  }
  const coinSvg = (s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="#f59e0b"/><circle cx="10" cy="10" r="6.4" fill="#fbbf24"/><path d="M7 8.4 L8.4 12.6 L10 9 L11.6 12.6 L13 8.4" stroke="#b45309" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const markSvg = `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="5" y="22" width="30" height="13" rx="4" fill="#c98a52"/><rect x="8" y="25" width="24" height="7" rx="2" fill="#6b4425"/><path d="M20 26 V14" stroke="#16a34a" stroke-width="2.4" stroke-linecap="round"/>${leaf(20, 16, 11, -150, "#4ade80", 0.5)}${leaf(20, 16, 11, -30, "#22c55e", 0.5)}${at(29, 13, 0.55, FRUIT.tomato)}</svg>`;

  // 옥상 하늘(시간대에 따라)
  function skySvg(hour) {
    const t = hour >= 5 && hour < 10 ? "morning" : hour >= 10 && hour < 17 ? "day" : hour >= 17 && hour < 20 ? "evening" : "night";
    const sky = { morning: ["#bae6fd", "#fef9c3"], day: ["#7dd3fc", "#e0f2fe"], evening: ["#fb923c", "#fde68a"], night: ["#1e3a8a", "#475569"] }[t];
    const bld = t === "night" ? ["#1e293b", "#334155"] : t === "evening" ? ["#c2410c", "#ea580c"] : ["#93c5fd", "#bfdbfe"];
    const win = t === "night" ? "#fde68a" : "rgba(255,255,255,.7)";
    let b = "";
    const tall = [[0, 30, 44], [34, 22, 30], [60, 26, 52], [92, 18, 26], [116, 30, 40], [152, 24, 58], [182, 34, 34], [222, 20, 46], [248, 28, 30], [282, 26, 54], [314, 22, 36], [342, 32, 48], [380, 24, 32]];
    tall.forEach(([x, w, h], i) => {
      b += `<rect x="${x}" y="${66 - h}" width="${w}" height="${h}" fill="${bld[i % 2]}"/>`;
      for (let yy = 70 - h; yy < 58; yy += 9) for (let xx = x + 4; xx < x + w - 4; xx += 8) if ((xx + yy + i) % 3) b += `<rect x="${xx}" y="${yy}" width="3" height="4" fill="${win}" opacity="${t === "night" ? 0.8 : 0.5}"/>`;
    });
    const orb = t === "night"
      ? `<circle cx="340" cy="18" r="9" fill="#fef3c7"/><circle cx="345" cy="15" r="8" fill="${sky[0]}"/><g fill="#fff"><circle cx="60" cy="12" r="1"/><circle cx="140" cy="20" r="1.2"/><circle cx="230" cy="10" r="1"/><circle cx="290" cy="24" r="1"/></g>`
      : `<circle cx="${t === "evening" ? 70 : 330}" cy="${t === "evening" ? 30 : 18}" r="11" fill="${t === "evening" ? "#fef08a" : "#fde047"}" opacity=".95"/><g fill="#fff" opacity=".85"><ellipse cx="120" cy="18" rx="18" ry="6"/><ellipse cx="134" cy="14" rx="12" ry="6"/><ellipse cx="250" cy="26" rx="16" ry="5"/></g>`;
    return `<svg viewBox="0 0 400 76" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><defs><linearGradient id="fm-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient></defs>
      <rect width="400" height="76" fill="url(#fm-sky)"/>${orb}${b}
      <rect x="0" y="62" width="400" height="14" fill="#d6d3d1"/><path d="M0 50 H400 M0 62 H400" stroke="#78716c" stroke-width="2.4"/>
      ${Array.from({ length: 21 }, (_, i) => `<path d="M${i * 20} 50 V62" stroke="#78716c" stroke-width="1.6"/>`).join("")}
      <g transform="translate(18 34)"><rect width="34" height="28" rx="4" fill="#60a5fa"/><rect y="4" width="34" height="3" fill="#3b82f6"/><rect y="14" width="34" height="3" fill="#3b82f6"/><rect x="4" y="28" width="4" height="6" fill="#64748b"/><rect x="26" y="28" width="4" height="6" fill="#64748b"/></g>
      <g transform="translate(352 44)"><rect width="30" height="18" rx="3" fill="#fbbf24"/><rect x="2" y="-4" width="26" height="6" rx="2" fill="#f59e0b"/><path d="M6 6 h18 M6 11 h18" stroke="#d97706" stroke-width="1.6"/></g>
    </svg>`;
  }

  // ══ 상태 ══════════════════════════════════════════════════
  function blank() {
    return {
      v: 1, t: null, ft: 0, money: 100, xp: 0, lv: 1, open: 9,
      plots: Array(25).fill(null), autos: [], inv: {}, tools: { can: 0, fert: 0, auto: 0, shed: 0 },
      seed: "sprout", orders: [], daily: null, dex: {}, stats: { harv: 0, earned: 0, orders: 0, start: null },
      tut: false, done: false, tab: "seed", summary: { line: "텃밭 레벨 1 · 밭 9칸", level: 1 },
    };
  }
  function fix(S) {
    const b = blank();
    for (const k of Object.keys(b)) if (S[k] === undefined || S[k] === null && k !== "t" && k !== "daily") S[k] = b[k];
    if (!Array.isArray(S.plots) || S.plots.length !== 25) S.plots = b.plots;
    S.tools = Object.assign({}, b.tools, S.tools || {});
    S.stats = Object.assign({}, b.stats, S.stats || {});
    if (!CROP[S.seed] || CROP[S.seed].lv > S.lv) S.seed = "sprout";
    if (!Array.isArray(S.orders)) S.orders = [];
    return S;
  }

  let store, root, S, tickTimer = 0, lastSky = -1, lastBarSig = "", lastTabSig = "", popping = false, ticksSinceSave = 0;
  const queue = []; // 보여 줄 팝업들 (() => Promise)
  let newDex = []; // 이번 행동에서 처음 거둔 작물 — commit 때 팝업 하나로 묶는다
  const plotOpen = (i) => PLOT_ORDER.indexOf(i) < S.open;
  const nextPlotIdx = () => (S.open < 25 ? PLOT_ORDER[S.open] : -1);
  const nextPlotReq = () => (S.open < 25 ? PLOT_REQ[S.open - 9] : null);
  const invTotal = () => Object.values(S.inv).reduce((a, b) => a + b, 0);
  const cap = () => SHED_CAP[S.tools.shed] || 40;
  const dexCount = () => CROPS.filter((c) => S.dex[c.k]).length;
  const growMult = () => Math.max(0.5, 1 - S.tools.can * 0.06 - (dexCount() >= 12 ? 0.05 : 0));
  const growTime = (k) => Math.round(CROP[k].t * growMult());
  const yieldOf = (k) => CROP[k].y + Math.round(CROP[k].y * 0.12 * S.tools.fert);
  const sellBonus = () => (dexCount() >= 9 ? 0.08 : dexCount() >= 3 ? 0.03 : 0);
  const unitPrice = (k) => Math.max(1, Math.round(CROP[k].p * (S.daily && S.daily.crop === k ? 2 : 1) * (1 + sellBonus())));
  const xpMult = () => (dexCount() >= 6 ? 1.05 : 1);
  const unlocked = () => CROPS.filter((c) => c.lv <= S.lv);
  const autoMax = () => AUTO_PLOTS[S.tools.auto] || 0;

  function plotState(i) {
    const p = S.plots[i];
    if (!p) return { stage: -1 };
    const left = p.p + p.d - S.ft;
    if (left <= 0) return { stage: 3, left: 0, k: p.k };
    const f = (S.ft - p.p) / p.d;
    return { stage: f < 0.12 ? 0 : f < 0.45 ? 1 : 2, left, k: p.k };
  }
  const readyIdx = () => PLOT_ORDER.slice(0, S.open).filter((i) => S.plots[i] && S.plots[i].p + S.plots[i].d <= S.ft);
  const emptyIdx = () => PLOT_ORDER.slice(0, S.open).filter((i) => !S.plots[i]);

  function dayKey(now) { return new Date(now + 9 * 3600e3).toISOString().slice(0, 10); }
  function hourKst(now) { return new Date(now + 9 * 3600e3).getUTCHours(); }
  function hashStr(s) { let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; }

  // ── 오늘의 텃밭 일 ──
  function ensureDaily(now) {
    const day = dayKey(now);
    if (S.daily && S.daily.day === day && S.daily.task && S.daily.task.kind) return false;
    const h = hashStr(day + ":" + (S.stats.start || 0));
    const av = unlocked();
    const crop = av[h % av.length].k;
    const kind = ["harvest", "order", "plant"][(h >>> 4) % 3];
    let task;
    if (kind === "harvest") {
      const short = av.slice(-4);
      const c = short[(h >>> 8) % short.length];
      task = { kind, k: c.k, n: c.y * 3 };
    } else if (kind === "order") task = { kind, n: 2 };
    else task = { kind, n: Math.min(15, Math.max(6, S.open)) };
    S.daily = { day, crop, task, prog: 0, claimed: false, money: 40 + S.lv * 20, xp: 15 + S.lv * 8 };
    return true;
  }
  function dailyText(d) {
    const t = d.task;
    if (t.kind === "harvest") return `${CROP[t.k].n} ${num(t.n)}개 거두기`;
    if (t.kind === "order") return `동료 주문 ${t.n}장 끝내기`;
    return `씨앗 ${t.n}칸 심기`;
  }
  function dailyProg(kind, k, n) {
    const d = S.daily;
    if (!d || d.claimed || d.task.kind !== kind) return;
    if (kind === "harvest" && d.task.k !== k) return;
    d.prog = Math.min(d.task.n, d.prog + n);
  }

  // ── 주문 ──
  function makeOrder(first) {
    if (first) return { ...person(), items: first, ...orderReward(first) };
    const pool = unlocked().slice(-6);
    const kinds = S.lv >= 6 && Math.random() < 0.3 ? 3 : Math.random() < 0.55 ? 2 : 1;
    const chosen = [];
    while (chosen.length < Math.min(kinds, pool.length)) { const c = pick(pool); if (!chosen.includes(c)) chosen.push(c); }
    const harvests = 1 + Math.ceil(S.open / 9);
    let items = chosen.map((c) => ({ k: c.k, n: c.y * rnd(1, harvests) }));
    const total = items.reduce((a, b) => a + b.n, 0), lim = Math.floor(cap() * 0.6);
    if (total > lim) items = items.map((it) => ({ k: it.k, n: Math.max(1, Math.floor((it.n * lim) / total)) }));
    return { ...person(), items, ...orderReward(items) };
  }
  function person() {
    const d = pick(DEPTS);
    return { id: Math.random().toString(36).slice(2, 9), dept: d[0], color: d[1], name: `${pick(SURNAMES)} ${pick(RANKS)}`, line: pick(LINES) };
  }
  function orderReward(items) {
    const val = items.reduce((a, it) => a + it.n * CROP[it.k].p, 0);
    const xp = items.reduce((a, it) => a + (it.n * CROP[it.k].xp) / CROP[it.k].y, 0);
    return { money: Math.round((val * 1.6) / 5) * 5 + 10, xp: Math.round(xp * 1.5) + 5 };
  }
  function ensureOrders() {
    let changed = false;
    while (S.orders.length < 3) {
      const firsts = [[{ k: "sprout", n: 4 }], [{ k: "lettuce", n: 6 }], [{ k: "sprout", n: 4 }, { k: "lettuce", n: 3 }]];
      S.orders.push(makeOrder(S.stats.orders === 0 && S.lv === 1 ? firsts[S.orders.length] : null));
      changed = true;
    }
    S.orders.forEach((o, i) => { if (o.wait != null && S.ft >= o.wait) { S.orders[i] = makeOrder(); changed = true; } });
    return changed;
  }
  const canDeliver = (o) => o && o.items && o.items.every((it) => (S.inv[it.k] || 0) >= it.n);

  // ── 경험치 · 레벨 ──
  function gainXp(n) {
    S.xp += Math.round(n * xpMult());
    while (S.lv < MAX_LV && S.xp >= NEED[S.lv]) {
      S.xp -= NEED[S.lv];
      S.lv++;
      const L = S.lv;
      queue.push(() => levelUpPopup(L));
    }
  }
  function unlocksAt(L) {
    const out = [];
    CROPS.filter((c) => c.lv === L).forEach((c) => out.push({ ico: cropIco(c.k), txt: `새 작물 <b>${c.n}</b> — ${dur(c.t)}` }));
    const plots = PLOT_REQ.filter((r) => r[0] === L).length;
    if (plots) out.push({ icon: "grid-3x3", txt: `밭을 <b>${plots}칸</b> 더 넓힐 수 있어요` });
    TOOL_KEYS.forEach((tk) => {
      const t = TOOLS[tk], idx = t.lv.indexOf(L);
      if (idx >= 0) out.push({ icon: t.icon, txt: `<b>${t.n} ${idx + 1}단계</b>를 살 수 있어요 — ${t.eff(idx + 1)}` });
    });
    return out;
  }

  // ── 진행 ──
  function advance(now) {
    if (!S.t) S.t = now;
    const gap = Math.max(0, (now - S.t) / 1000);
    const step = Math.min(gap, AWAY_CAP);
    const before = S.ft;
    S.ft += step;
    S.t = now;
    return { gap, step, before, capped: gap > AWAY_CAP };
  }
  function summary() {
    S.summary = { line: `텃밭 레벨 ${S.lv} · 밭 ${S.open}칸`, level: S.lv };
  }
  function commit(now) {
    if (newDex.length) {
      const list = newDex, after = dexCount();
      newDex = [];
      queue.unshift(() => dexPopup(list, after - list.length, after));
    }
    summary();
    checkDone();
    if (now) store.saveNow(); else store.dirty();
    refresh();
    flush();
  }
  function checkDone() {
    if (!S.done && S.lv >= MAX_LV && S.open >= 25) { S.done = true; queue.push(donePopup); store.saveNow(); }
  }

  // ══ 행동 ══════════════════════════════════════════════════
  function plant(i, k, quiet) {
    const c = CROP[k];
    if (!c || c.lv > S.lv || S.plots[i] || !plotOpen(i)) return false;
    if (S.money < c.seed) { if (!quiet) HKUI.toast(`돈이 모자라요 — ${c.n} 씨앗은 ${won(c.seed)}이에요`, "error"); return false; }
    S.money -= c.seed;
    S.plots[i] = { k, p: S.ft, d: growTime(k) };
    dailyProg("plant", k, 1);
    return true;
  }
  // 거두기 — 성공하면 거둔 수, 창고가 모자라면 -1
  function harvest(i) {
    const p = S.plots[i];
    if (!p || p.p + p.d > S.ft) return 0;
    const q = yieldOf(p.k);
    if (invTotal() + q > cap()) return -1;
    const c = CROP[p.k];
    S.inv[p.k] = (S.inv[p.k] || 0) + q;
    const firstTime = !S.dex[p.k];
    S.dex[p.k] = (S.dex[p.k] || 0) + q;
    S.stats.harv++;
    gainXp(c.xp);
    if (firstTime) {
      gainXp(10 + c.xp);
      newDex.push(p.k);
    }
    dailyProg("harvest", p.k, q);
    S.plots[i] = null;
    if (S.autos.includes(i) && S.money >= c.seed) plant(i, p.k, true);
    return q;
  }

  async function onPlot(i) {
    if (!plotOpen(i)) {
      if (i === nextPlotIdx()) return expand();
      return;
    }
    const st = plotState(i);
    if (st.stage === -1) {
      if (plant(i, S.seed)) commit();
      return;
    }
    if (st.stage === 3) {
      const q = harvest(i);
      if (q === -1) { HKUI.toast("창고가 가득 찼어요 — 팔거나 창고를 넓혀 주세요", "error"); return; }
      HKUI.toast(`${CROP[st.k].n} ${q}개를 거뒀어요`);
      commit();
      return;
    }
    plotInfo(i);
  }

  async function plotInfo(i) {
    const p = S.plots[i], c = CROP[p.k], st = plotState(i);
    const isAuto = S.autos.includes(i);
    const autoRow = S.tools.auto
      ? `<button type="button" class="fm-btn ${isAuto ? "" : "fm-btn--blue"}" data-m="auto">${ic("refresh-cw", 16)} ${isAuto ? "자동 다시 심기 끄기" : "자동 다시 심기 켜기"}</button>`
      : "";
    const v = await modal(`<h2>${c.n}</h2><p class="fm-sub">자라는 중이에요. 다 자라도 시들지 않으니 편할 때 거두세요.</p>
      <div class="fm-modal__hero">${plotSvg(p.k, st.stage)}</div>
      <ul class="fm-list"><li><span class="fm-li-ico">${ic("clock", 18)}</span><span><b data-cd="${p.p + p.d}">${dur(st.left)}</b> 뒤에 거둘 수 있어요</span></li>
      <li><span class="fm-li-ico">${ic("package", 18)}</span><span>거두면 ${c.n} <b>${yieldOf(p.k)}개</b> · 경험치 ${c.xp}</span></li>
      ${S.tools.auto ? `<li><span class="fm-li-ico">${ic("refresh-cw", 18)}</span><span>자동 다시 심기 ${isAuto ? "<b>켜짐</b>" : "꺼짐"} · ${S.autos.length}/${autoMax()}칸</span></li>` : ""}</ul>
      <div class="fm-modal__btns">${autoRow}<button type="button" class="fm-btn" data-m="pull">${ic("shovel", 16)} 뽑기</button></div>`);
    if (v === "auto") {
      if (isAuto) S.autos = S.autos.filter((x) => x !== i);
      else if (S.autos.length >= autoMax()) { HKUI.toast(`자동 다시 심기는 ${autoMax()}칸까지예요 — 다른 칸을 먼저 꺼 주세요`, "error"); return; }
      else S.autos.push(i);
      HKUI.toast(isAuto ? "자동 다시 심기를 껐어요" : "이 칸은 거두면 저절로 다시 심어요");
      commit();
    } else if (v === "pull") {
      const ok = await HKUI.confirmDialog("작물을 뽑을까요?", `${jo(c.n, "을", "를")} 뽑으면 씨앗 값은 돌아오지 않아요.`, { confirmLabel: "뽑기" });
      if (!ok || !S.plots[i]) return;
      S.plots[i] = null;
      commit();
    }
  }

  function harvestAll() {
    const idx = readyIdx();
    if (!idx.length) return;
    const got = {};
    let n = 0, full = 0;
    for (const i of idx) {
      const k = S.plots[i].k, q = harvest(i);
      if (q === -1) { full++; continue; }
      got[k] = (got[k] || 0) + q; n++;
    }
    if (n) HKUI.toast(`${n}칸을 거뒀어요 · ${Object.entries(got).map(([k, q]) => `${CROP[k].n} ${q}`).join(", ")}${full ? ` (창고가 가득 차 ${full}칸은 남겨 뒀어요)` : ""}`);
    else HKUI.toast("창고가 가득 찼어요 — 팔거나 창고를 넓혀 주세요", "error");
    commit();
  }
  function plantAll() {
    const idx = emptyIdx(), c = CROP[S.seed];
    if (!idx.length) return;
    let n = 0;
    for (const i of idx) { if (S.money < c.seed) break; if (plant(i, S.seed, true)) n++; }
    if (!n) { HKUI.toast(`돈이 모자라요 — ${c.n} 씨앗은 ${won(c.seed)}이에요`, "error"); return; }
    HKUI.toast(`${jo(c.n, "을", "를")} ${n}칸에 심었어요 (−${won(n * c.seed)})${n < idx.length ? ` · 돈이 모자라 ${idx.length - n}칸은 비워 뒀어요` : ""}`);
    commit();
  }
  async function expand() {
    const req = nextPlotReq();
    if (!req) return;
    if (S.lv < req[0]) { HKUI.toast(`텃밭 레벨 ${req[0]}부터 넓힐 수 있어요`, "error"); return; }
    if (S.money < req[1]) { HKUI.toast(`돈이 모자라요 — 넓히려면 ${won(req[1])}이 필요해요`, "error"); return; }
    const ok = await HKUI.confirmDialog("밭을 넓힐까요?", `${won(req[1])}으로 밭 한 칸을 더 만들어요. (지금 ${S.open}칸 → ${S.open + 1}칸)`, { confirmLabel: "넓히기" });
    if (!ok || S.money < req[1]) return;
    S.money -= req[1];
    S.open++;
    HKUI.toast(`밭이 ${S.open}칸이 됐어요`);
    commit(true);
  }
  function sell(k, n) {
    const have = S.inv[k] || 0;
    n = Math.min(have, n);
    if (n <= 0) return;
    const money = n * unitPrice(k);
    S.inv[k] = have - n;
    if (!S.inv[k]) delete S.inv[k];
    S.money += money;
    S.stats.earned += money;
    HKUI.toast(`${CROP[k].n} ${n}개를 ${won(money)}에 팔았어요`);
    commit();
  }
  async function sellAll() {
    const total = Object.entries(S.inv).reduce((a, [k, n]) => a + n * unitPrice(k), 0);
    if (!total) return;
    const needed = S.orders.some((o) => o.items && o.items.some((it) => S.inv[it.k]));
    const ok = await HKUI.confirmDialog("창고를 모두 팔까요?", `모두 ${won(total)}을 받아요.${needed ? "<br>주문에 쓸 작물도 함께 팔려요." : ""}`, { confirmLabel: "모두 팔기" });
    if (!ok) return;
    let got = 0;
    for (const [k, n] of Object.entries(S.inv)) got += n * unitPrice(k);
    S.inv = {};
    S.money += got;
    S.stats.earned += got;
    HKUI.toast(`창고를 비우고 ${won(got)}을 받았어요`);
    commit();
  }
  function deliver(si) {
    const o = S.orders[si];
    if (!canDeliver(o)) return;
    o.items.forEach((it) => { S.inv[it.k] -= it.n; if (!S.inv[it.k]) delete S.inv[it.k]; });
    S.money += o.money;
    S.stats.earned += o.money;
    S.stats.orders++;
    gainXp(o.xp);
    dailyProg("order", null, 1);
    S.orders[si] = { wait: S.ft + ORDER_WAIT };
    HKUI.toast(`${o.dept} ${o.name}에게 드렸어요 · +${won(o.money)} · 경험치 +${o.xp}`);
    commit(true);
  }
  async function skipOrder(si) {
    const o = S.orders[si];
    if (!o || !o.items) return;
    const ok = await HKUI.confirmDialog("이 주문을 넘길까요?", `${esc(o.dept)} ${esc(o.name)}의 주문을 넘기면 ${dur(ORDER_WAIT)} 뒤 새 주문이 와요.`, { confirmLabel: "넘기기" });
    if (!ok) return;
    S.orders[si] = { wait: S.ft + ORDER_WAIT };
    commit();
  }
  function buyTool(tk) {
    const t = TOOLS[tk], l = S.tools[tk];
    if (l >= t.cost.length) return;
    if (S.lv < t.lv[l]) { HKUI.toast(`텃밭 레벨 ${t.lv[l]}부터 살 수 있어요`, "error"); return; }
    if (S.money < t.cost[l]) { HKUI.toast(`돈이 모자라요 — ${won(t.cost[l])}이 필요해요`, "error"); return; }
    S.money -= t.cost[l];
    S.tools[tk] = l + 1;
    HKUI.toast(`${t.n} ${l + 1}단계! ${t.eff(l + 1)}`);
    commit(true);
  }
  function claimDaily() {
    const d = S.daily;
    if (!d || d.claimed || d.prog < d.task.n) return;
    d.claimed = true;
    S.money += d.money;
    S.stats.earned += d.money;
    gainXp(d.xp);
    HKUI.toast(`오늘의 텃밭 일 끝! +${won(d.money)} · 경험치 +${d.xp}`);
    commit(true);
  }
  async function resetAll() {
    const a = await HKUI.confirmDialog("처음부터 다시 할까요?", "밭 · 창고 · 도구 · 도감 · 레벨이 모두 처음으로 돌아가요.", { confirmLabel: "다음", confirmVariant: "danger" });
    if (!a) return;
    const b = await HKUI.confirmDialog("정말 지울까요?", "<b>되돌릴 수 없어요.</b> 지금까지 가꾼 옥상 텃밭이 모두 사라져요.", { confirmLabel: "모두 지우고 다시 시작", confirmVariant: "danger" });
    if (!b) return;
    try {
      await store.reset();
      S = fix(store.state);
      S.t = store.now();
      S.stats.start = store.now();
      ensureDaily(store.now());
      ensureOrders();
      summary();
      await store.saveNow();
      build();
      HKUI.toast("새 텃밭을 시작했어요");
      tutorial();
    } catch (e) {
      HKUI.toast(e.message || "다시 시작하지 못했어요", "error");
    }
  }

  // ══ 팝업 ══════════════════════════════════════════════════
  function modal(html) {
    return new Promise((res) => {
      const ov = document.createElement("div");
      ov.className = "fm-ov";
      ov.innerHTML = `<div class="fm-modal" role="dialog" aria-modal="true"><button type="button" class="fm-x" data-esc-close aria-label="닫기">${ic("x", 20)}</button>${html}</div>`;
      const close = (v) => { if (!ov.isConnected) return; ov.remove(); res(v); };
      ov.addEventListener("click", (e) => {
        if (e.target === ov) return close();
        const b = e.target.closest("[data-m]");
        if (b) close(b.dataset.m);
      });
      ov.querySelector(".fm-x").onclick = () => close();
      document.body.appendChild(ov);
      HKUI.refreshIcons(ov);
      const f = ov.querySelector("[data-m]");
      if (f) f.focus({ preventScroll: true });
    });
  }
  async function flush() {
    if (popping) return;
    popping = true;
    try { while (queue.length) await queue.shift()(); } finally { popping = false; }
  }
  function levelUpPopup(L) {
    const items = unlocksAt(L);
    return modal(`<div class="fm-modal__hero">${markSvg}</div><h2 style="text-align:center;margin-right:0">텃밭 레벨 ${L}!</h2>
      <p class="fm-sub" style="text-align:center">${L >= MAX_LV ? "1차 마지막 레벨이에요." : "새로 열린 것들이에요."}</p>
      <ul class="fm-list">${items.map((it) => `<li>${it.ico || `<span class="fm-li-ico">${ic(it.icon, 18)}</span>`}<span>${it.txt}</span></li>`).join("") || `<li>계속 가꿔 보세요</li>`}</ul>
      <div class="fm-modal__btns"><button type="button" class="fm-btn fm-btn--blue" data-m="ok">좋아요</button></div>`);
  }
  function dexPopup(list, before, after) {
    const miles = DEX_MILES.filter((m) => m.n > before && m.n <= after);
    const one = list.length === 1 ? CROP[list[0]] : null;
    return modal(`<div class="fm-modal__hero">${one ? cropIco(one.k) : markSvg}</div>
      <h2 style="text-align:center;margin-right:0">${one ? `도감에 ${jo(one.n, "이", "가")} 올랐어요` : `도감에 ${list.length}종이 올랐어요`}</h2>
      <p class="fm-sub" style="text-align:center">처음 거둔 작물은 경험치를 더 받아요 · 도감 ${after}/${CROPS.length}</p>
      <ul class="fm-list">${list.map((k) => `<li>${cropIco(k)}<span><b>${CROP[k].n}</b> — 경험치 +${10 + CROP[k].xp}</span></li>`).join("")}
      ${miles.map((m) => `<li class="is-warn"><span class="fm-li-ico">${ic("award", 18)}</span><span>도감 ${m.n}종 보너스 — <b>${m.txt}</b> (계속 적용돼요)</span></li>`).join("")}</ul>
      <div class="fm-modal__btns"><button type="button" class="fm-btn fm-btn--blue" data-m="ok">좋아요</button></div>`);
  }
  function donePopup() {
    const days = S.stats.start ? Math.max(1, Math.ceil((store.now() - S.stats.start) / 86400e3)) : 1;
    return modal(`<div class="fm-modal__hero">${markSvg}</div><h2 style="text-align:center;margin-right:0">1차 완주를 축하해요!</h2>
      <p class="fm-sub" style="text-align:center">텃밭 레벨 15, 밭 25칸 — 옥상이 온통 초록이에요.<br>앞으로도 계속 가꾸고 주문을 채울 수 있어요.</p>
      <div class="fm-stats3"><div><b>${num(days)}일</b><small>가꾼 날</small></div><div><b>${num(S.stats.harv)}번</b><small>거둔 횟수</small></div><div><b>${num(S.stats.orders)}장</b><small>끝낸 주문</small></div></div>
      <ul class="fm-list"><li><span class="fm-li-ico">${coinSvg(18)}</span><span>모두 번 돈 <b>${won(S.stats.earned)}</b></span></li><li><span class="fm-li-ico">${ic("book-open", 18)}</span><span>도감 <b>${dexCount()}/${CROPS.length}</b></span></li></ul>
      <div class="fm-modal__btns"><button type="button" class="fm-btn fm-btn--blue" data-m="ok">계속 가꾸기</button></div>`);
  }
  function awayPopup(info) {
    const rows = [];
    rows.push(`<li><span class="fm-li-ico">${ic("clock", 18)}</span><span>자리 비운 시간 <b>${dur(info.gap)}</b></span></li>`);
    if (info.capped) rows.push(`<li class="is-warn"><span class="fm-li-ico">${ic("battery-full", 18)}</span><span>가득 찼어요 — 작물은 <b>8시간</b>까지만 자라고 그 뒤로는 멈춰 있었어요</span></li>`);
    const grown = Object.entries(info.grown);
    if (grown.length) rows.push(`<li><span class="fm-li-ico">${ic("sprout", 18)}</span><span>다 자란 칸 <b>${info.grownN}칸</b> — ${grown.map(([k, n]) => `${CROP[k].n} ${n}`).join(", ")}</span></li>`);
    if (info.growing) rows.push(`<li><span class="fm-li-ico">${ic("hourglass", 18)}</span><span>아직 자라는 칸 ${info.growing}칸 · 가장 빨리 <b>${dur(info.soonest)}</b> 뒤</span></li>`);
    if (info.orders) rows.push(`<li><span class="fm-li-ico">${ic("clipboard-list", 18)}</span><span>새 주문 <b>${info.orders}장</b>이 왔어요</span></li>`);
    if (info.newDay) rows.push(`<li><span class="fm-li-ico">${ic("sun", 18)}</span><span>새 날이에요 — 오늘의 작물은 <b>${CROP[S.daily.crop].n}</b> (판매가 2배)</span></li>`);
    if (!grown.length && !info.growing) rows.push(`<li><span class="fm-li-ico">${ic("shovel", 18)}</span><span>심어 둔 작물이 없었어요. 떠나기 전에 심어 두면 그동안 자라요.</span></li>`);
    const ready = readyIdx().length;
    return modal(`<h2>자리 비운 동안</h2><p class="fm-sub">옥상 텃밭은 그동안에도 조용히 자랐어요.</p><ul class="fm-list">${rows.join("")}</ul>
      <div class="fm-modal__btns">${ready ? `<button type="button" class="fm-btn fm-btn--green" data-m="harvest">${ic("hand", 16)} 모두 거두기 (${ready}칸)</button>` : ""}<button type="button" class="fm-btn ${ready ? "" : "fm-btn--blue"}" data-m="ok">확인</button></div>`)
      .then((v) => { if (v === "harvest") harvestAll(); });
  }
  function awayInfo(adv, newDay, ordersBefore) {
    const info = { gap: adv.gap, capped: adv.capped, grown: {}, grownN: 0, growing: 0, soonest: Infinity, orders: 0, newDay };
    PLOT_ORDER.slice(0, S.open).forEach((i) => {
      const p = S.plots[i];
      if (!p) return;
      const end = p.p + p.d;
      if (end <= S.ft && end > adv.before) { info.grown[p.k] = (info.grown[p.k] || 0) + 1; info.grownN++; }
      else if (end > S.ft) { info.growing++; info.soonest = Math.min(info.soonest, end - S.ft); }
    });
    info.orders = ordersBefore.filter((w) => w != null && w <= S.ft).length;
    return info;
  }

  function tutorial() {
    const steps = [
      { ico: plotSvg("lettuce", 1), h: "씨앗을 심어요", p: "빈 칸을 누르면 고른 씨앗이 바로 심어져요. 「같은 씨앗 모두 심기」로 빈 칸을 한 번에 채울 수도 있어요." },
      { ico: plotSvg("tomato", 3), h: "다 자라면 거둬요", p: "실제 시간으로 자라요. 출근 전에 심고 점심 · 퇴근 후에 거두세요. 자리 비운 동안에도 8시간까지 자라고, 다 자라도 시들지 않아요." },
      { ico: markSvg, h: "팔고, 주문을 채우고, 넓혀요", p: "거둔 작물은 창고에 쌓여요. 팔거나 동료 주문에 쓰면 돈과 경험치를 받아요. 레벨이 오르면 새 작물 · 밭 · 도구가 열려요." },
    ];
    let i = 0;
    const ov = document.createElement("div");
    ov.className = "fm-ov";
    const draw = () => {
      const s = steps[i];
      ov.innerHTML = `<div class="fm-modal" role="dialog" aria-modal="true"><button type="button" class="fm-x" data-esc-close aria-label="닫기">${ic("x", 20)}</button>
        <div class="fm-steps">${steps.map((_, j) => `<i class="${j === i ? "is-on" : ""}"></i>`).join("")}</div>
        <div class="fm-modal__hero">${s.ico}</div><h2 style="text-align:center;margin-right:0">${s.h}</h2><p class="fm-sub" style="text-align:center">${s.p}</p>
        <div class="fm-modal__btns">${i ? `<button type="button" class="fm-btn" data-t="prev">이전</button>` : `<button type="button" class="fm-btn" data-t="close">건너뛰기</button>`}
        <button type="button" class="fm-btn fm-btn--blue" data-t="${i === steps.length - 1 ? "close" : "next"}">${i === steps.length - 1 ? "시작하기" : "다음"}</button></div></div>`;
      HKUI.refreshIcons(ov);
    };
    const close = () => { ov.remove(); if (!S.tut) { S.tut = true; store.dirty(); } flush(); };
    ov.addEventListener("click", (e) => {
      if (e.target === ov || e.target.closest(".fm-x")) return close();
      const b = e.target.closest("[data-t]");
      if (!b) return;
      if (b.dataset.t === "next") i++;
      else if (b.dataset.t === "prev") i--;
      else return close();
      draw();
    });
    draw();
    document.body.appendChild(ov);
  }
  function help() {
    return modal(`<h2>옥상 텃밭 도움말</h2><div class="fm-help">
      <h3>하루 리듬</h3><ul><li>출근 전에 심고, 점심 · 퇴근 후에 거둬요. 업무 시간에는 들어올 수 없지만 작물은 계속 자라요.</li>
      <li>자리 비운 동안은 <b>8시간</b>까지만 자라요. 그 뒤로는 멈춰 기다려요. 밤에는 8시간짜리 딸기가 딱 맞아요.</li>
      <li>다 자란 작물은 시들지 않아요. 언제 와도 손해가 없어요.</li></ul>
      <h3>밭과 창고</h3><ul><li>빈 칸을 누르면 고른 씨앗을 심고, 다 자란 칸을 누르면 거둬요. 자라는 칸을 누르면 남은 시간을 볼 수 있어요.</li>
      <li>거둔 작물은 창고에 쌓여요. 창고가 가득 차면 거둘 수 없으니 팔거나 창고를 넓혀요.</li>
      <li>밭은 레벨과 돈으로 넓혀요. 처음 3×3에서 5×5(25칸)까지.</li></ul>
      <h3>주문 · 오늘의 일</h3><ul><li>동료 주문을 채우면 그냥 팔 때보다 돈을 더 받고 경험치도 받아요. 끝내거나 넘기면 ${dur(ORDER_WAIT)} 뒤 새 주문이 와요.</li>
      <li>「오늘의 작물」은 하루 동안 판매가가 2배예요. 「오늘의 일」을 끝내면 작은 보너스를 받아요. 놓쳐도 손해는 없어요.</li></ul>
      <h3>도구 · 도감</h3><ul><li>물뿌리개는 자라는 시간을 줄이고, 비료는 수확량을 늘려요. 자동 물주기를 켠 칸은 거두면 같은 작물을 저절로 다시 심어요.</li>
      <li>처음 거둔 작물은 도감에 올라가요. 3 · 6 · 9 · 12종을 모으면 계속 적용되는 보너스를 받아요.</li>
      <li>텃밭 레벨 15와 밭 25칸을 채우면 1차 완주예요.</li></ul></div>
      <div class="fm-modal__btns" style="margin-top:16px"><button type="button" class="fm-btn" data-m="tut">처음 안내 다시 보기</button><button type="button" class="fm-btn fm-btn--blue" data-m="ok">닫기</button></div>`)
      .then((v) => { if (v === "tut") tutorial(); });
  }

  // ══ 화면 ══════════════════════════════════════════════════
  function build() {
    root.innerHTML = `
      <a class="hk-mg-back" href="/manage">${ic("chevron-left", 16)}매니지먼트</a>
      <div class="fm-top">
        <div class="fm-top__mark">${markSvg}</div>
        <div class="fm-top__title"><h1>${TITLE}<span id="fm-donebadge"></span></h1><p>출근 전에 심고, 점심 · 퇴근 후에 거둬요</p></div>
        <div class="fm-top__btns">
          <button type="button" class="fm-iconbtn" data-act="help" aria-label="도움말">${ic("circle-help", 18)}<span>도움말</span></button>
          <button type="button" class="fm-iconbtn" data-act="reset" aria-label="처음부터 다시">${ic("rotate-ccw", 18)}<span>처음부터 다시</span></button>
        </div>
      </div>
      <div class="fm-hud" id="fm-hud"></div>
      <div class="fm-main">
        <div class="fm-scene" role="region" aria-label="옥상 텃밭">
          <div class="fm-sky" id="fm-sky"></div>
          <div class="fm-floor"><div class="fm-field" id="fm-field"></div></div>
          <div class="fm-bar" id="fm-bar"></div>
        </div>
        <div class="fm-side">
          <div class="fm-today" id="fm-today"></div>
          <div class="fm-tabs" role="tablist" id="fm-tabs"></div>
          <div class="fm-panel" id="fm-panel"></div>
        </div>
      </div>`;
    const field = root.querySelector("#fm-field");
    field.innerHTML = Array.from({ length: 25 }, (_, i) => `<button type="button" class="fm-cell" data-act="plot" data-i="${i}"></button>`).join("");
    lastSky = -1; lastBarSig = ""; lastTabSig = "";
    refresh();
    HKUI.refreshIcons(root);
  }
  function refresh() {
    drawHud();
    drawSky();
    drawField();
    drawBar(true);
    drawToday();
    drawTabs(true);
    drawPanel();
    countdowns();
  }
  function drawHud() {
    const el = root.querySelector("#fm-hud");
    const need = NEED[S.lv] || 0, full = invTotal() >= cap();
    el.innerHTML = `
      <div class="fm-stat"><small>텃밭 레벨</small><b>${S.lv} <em>${S.lv >= MAX_LV ? "최고 레벨" : `${num(S.xp)} / ${num(need)}`}</em></b><div class="fm-xp"><i style="width:${S.lv >= MAX_LV ? 100 : Math.min(100, (S.xp / need) * 100)}%"></i></div></div>
      <div class="fm-stat"><small>가진 돈</small><div class="fm-stat__row">${coinSvg(18)}<b>${num(S.money)}</b></div></div>
      <div class="fm-stat ${full ? "is-full" : ""}"><small>창고</small><b>${num(invTotal())}<em> / ${num(cap())}</em></b></div>`;
    root.querySelector("#fm-donebadge").innerHTML = S.done ? ` <span class="fm-done-badge">1차 완주</span>` : "";
  }
  function drawSky() {
    const h = hourKst(store.now());
    if (h === lastSky) return;
    lastSky = h;
    root.querySelector("#fm-sky").innerHTML = skySvg(h);
  }
  function cellSig(i) {
    if (!plotOpen(i)) {
      if (i !== nextPlotIdx()) return "L";
      const r = nextPlotReq();
      return `N${S.lv >= r[0] ? 1 : 0}${S.money >= r[1] ? 1 : 0}`;
    }
    const st = plotState(i);
    return `${st.stage}:${st.k || ""}:${S.autos.includes(i) ? "a" : ""}`;
  }
  function drawField() {
    root.querySelectorAll("#fm-field .fm-cell").forEach((btn) => {
      const i = +btn.dataset.i, sig = cellSig(i);
      if (btn.dataset.sig === sig) return;
      btn.dataset.sig = sig;
      btn.className = "fm-cell";
      if (!plotOpen(i)) {
        if (i === nextPlotIdx()) {
          const r = nextPlotReq(), lvOk = S.lv >= r[0];
          btn.classList.add("is-next");
          if (!lvOk) btn.classList.add("is-wait");
          btn.innerHTML = `${ic(lvOk ? "plus" : "lock", 16)}<b>넓히기</b><small>${lvOk ? won(r[1]) : `레벨 ${r[0]}`}</small>`;
          btn.setAttribute("aria-label", lvOk ? `밭 넓히기 ${won(r[1])}` : `텃밭 레벨 ${r[0]}부터 넓힐 수 있어요`);
          HKUI.refreshIcons(btn);
        } else {
          btn.classList.add("is-locked");
          btn.innerHTML = "";
          btn.setAttribute("aria-label", "아직 없는 칸");
          btn.tabIndex = -1;
        }
        return;
      }
      btn.tabIndex = 0;
      const st = plotState(i), p = S.plots[i];
      let extra = "";
      if (S.autos.includes(i)) extra += `<span class="fm-cell__auto">${ic("refresh-cw", 12)}</span>`;
      if (st.stage === -1) {
        btn.setAttribute("aria-label", `빈 칸 — 눌러서 ${CROP[S.seed].n} 심기`);
        btn.innerHTML = plotSvg(null, -1) + extra;
      } else if (st.stage === 3) {
        btn.classList.add("is-ready");
        btn.setAttribute("aria-label", `${CROP[p.k].n} 다 자랐어요 — 눌러서 거두기`);
        btn.innerHTML = plotSvg(p.k, 3) + `<span class="fm-cell__ok">${ic("check", 14)}</span><span class="fm-cell__tm">거두기</span>` + extra;
      } else {
        btn.setAttribute("aria-label", `${CROP[p.k].n} 자라는 중`);
        btn.innerHTML = plotSvg(p.k, st.stage) + `<span class="fm-cell__tm" data-cd="${p.p + p.d}">${dur(st.left)}</span>` + extra;
      }
      HKUI.refreshIcons(btn);
    });
  }
  function drawBar(force) {
    const ready = readyIdx().length, empty = emptyIdx().length, c = CROP[S.seed];
    const sig = `${ready}|${empty}|${S.seed}|${S.money >= c.seed}|${S.tools.can}|${dexCount()}`;
    if (!force && sig === lastBarSig) return;
    lastBarSig = sig;
    root.querySelector("#fm-bar").innerHTML = `
      <button type="button" class="fm-seedchip" data-act="tab" data-tab="seed">${cropIco(S.seed)}<span>심을 씨앗 <b>${c.n}</b> · ${won(c.seed)} · ${dur(growTime(S.seed))}</span>${ic("chevron-right", 18)}</button>
      <button type="button" class="fm-bigbtn fm-bigbtn--green" data-act="harvestAll" ${ready ? "" : "disabled"}>${ic("hand", 18)} 모두 거두기 <em>${ready}칸</em></button>
      <button type="button" class="fm-bigbtn fm-bigbtn--blue" data-act="plantAll" ${empty ? "" : "disabled"}>${ic("shovel", 18)} 같은 씨앗 모두 심기 <em>${empty}칸</em></button>`;
    HKUI.refreshIcons(root.querySelector("#fm-bar"));
  }
  function drawToday() {
    const d = S.daily;
    if (!d) return;
    const c = CROP[d.crop], done = d.prog >= d.task.n;
    root.querySelector("#fm-today").innerHTML = `
      <div class="fm-today__card is-crop">${cropIco(d.crop)}<div class="fm-today__txt"><small>오늘의 작물</small><b>${c.n} 판매가 2배</b><p>오늘 하루 ${won(unitPrice(d.crop))}에 팔려요</p></div></div>
      <div class="fm-today__card"><span class="fm-today__ico">${ic("calendar-check", 20)}</span><div class="fm-today__txt"><small>오늘의 텃밭 일</small><b>${dailyText(d)}</b>
        ${d.claimed ? `<p>받았어요. 내일 또 새 일이 와요.</p>` : `<div class="fm-mini"><i style="width:${(d.prog / d.task.n) * 100}%"></i></div><p>${num(d.prog)} / ${num(d.task.n)} · 보상 ${won(d.money)} · 경험치 ${d.xp}</p>`}</div>
        ${d.claimed ? "" : `<button type="button" class="fm-btn ${done ? "fm-btn--green" : ""}" data-act="claim" ${done ? "" : "disabled"}>받기</button>`}</div>`;
    HKUI.refreshIcons(root.querySelector("#fm-today"));
  }
  function tabBadges() {
    const deliverable = S.orders.filter(canDeliver).length;
    const toolBuy = TOOL_KEYS.some((tk) => { const t = TOOLS[tk], l = S.tools[tk]; return l < t.cost.length && S.lv >= t.lv[l] && S.money >= t.cost[l]; });
    return { orders: deliverable, tools: toolBuy, shed: invTotal() >= cap() };
  }
  function drawTabs(force) {
    const b = tabBadges();
    const sig = `${S.tab}|${b.orders}|${b.tools}|${b.shed}`;
    if (!force && sig === lastTabSig) return;
    lastTabSig = sig;
    const tabs = [["seed", "씨앗", "sprout"], ["shed", "창고", "warehouse"], ["orders", "주문", "clipboard-list"], ["tools", "도구", "wrench"], ["dex", "도감", "book-open"]];
    root.querySelector("#fm-tabs").innerHTML = tabs.map(([k, n, icn]) => {
      let dot = "";
      if (k === "orders" && b.orders) dot = `<span class="fm-tab__dot">${b.orders}</span>`;
      if (k === "tools" && b.tools) dot = `<span class="fm-tab__dot is-dot"></span>`;
      if (k === "shed" && b.shed) dot = `<span class="fm-tab__dot is-dot"></span>`;
      return `<button type="button" class="fm-tab ${S.tab === k ? "is-on" : ""}" role="tab" aria-selected="${S.tab === k}" data-act="tab" data-tab="${k}">${ic(icn, 15)}${n}${dot}</button>`;
    }).join("");
    HKUI.refreshIcons(root.querySelector("#fm-tabs"));
  }
  function drawPanel() {
    const el = root.querySelector("#fm-panel");
    el.innerHTML = ({ seed: panelSeed, shed: panelShed, orders: panelOrders, tools: panelTools, dex: panelDex }[S.tab] || panelSeed)();
    HKUI.refreshIcons(el);
  }
  function panelSeed() {
    return `<p class="fm-note">고른 씨앗은 빈 칸을 누르거나 「같은 씨앗 모두 심기」로 심어요.</p>` + CROPS.map((c) => {
      const lock = c.lv > S.lv, on = S.seed === c.k;
      return `<button type="button" class="fm-card fm-seed ${on ? "is-on" : ""} ${lock ? "is-lock" : ""}" ${lock ? "disabled" : `data-act="seed" data-k="${c.k}"`} aria-pressed="${on}">
        <div class="fm-row">${cropIco(c.k)}<div class="fm-row__txt"><b>${c.n}${S.daily && S.daily.crop === c.k ? ` <span class="fm-tag fm-tag--gold">오늘 2배</span>` : ""}${lock ? ` <span class="fm-tag">레벨 ${c.lv}에 열려요</span>` : ""}</b>
          <div class="fm-facts"><span>${ic("clock", 13)} ${dur(lock ? c.t : growTime(c.k))}</span><span>씨앗 ${won(c.seed)}</span><span>${lock ? c.y : yieldOf(c.k)}개 × ${won(lock ? c.p : unitPrice(c.k))}</span><span>경험치 ${c.xp}</span></div></div>
          ${lock ? "" : `<span class="fm-seed__check">${on ? ic("check", 15) : ""}</span>`}</div></button>`;
    }).join("");
  }
  function panelShed() {
    const items = Object.entries(S.inv).filter(([, n]) => n > 0).sort((a, b) => CROPS.indexOf(CROP[a[0]]) - CROPS.indexOf(CROP[b[0]]));
    const need = {};
    S.orders.forEach((o) => (o.items || []).forEach((it) => { need[it.k] = (need[it.k] || 0) + it.n; }));
    const total = items.reduce((a, [k, n]) => a + n * unitPrice(k), 0);
    const t = TOOLS.shed, l = S.tools.shed;
    let head = `<div class="fm-card"><div class="fm-row"><div class="fm-row__txt"><b>창고 ${num(invTotal())} / ${num(cap())}</b><div class="fm-cap"><i style="width:${Math.min(100, (invTotal() / cap()) * 100)}%"></i></div>
      <p>${invTotal() >= cap() ? "가득 찼어요 — 팔거나 넓혀야 더 거둘 수 있어요." : `${num(cap() - invTotal())}개 더 들어가요.`}${l < t.cost.length ? ` 다음 단계는 ${SHED_CAP[l + 1]}개 (${won(t.cost[l])} · 레벨 ${t.lv[l]})` : ""}</p></div>
      ${l < t.cost.length ? `<button type="button" class="fm-btn" data-act="tool" data-k="shed" ${S.lv >= t.lv[l] && S.money >= t.cost[l] ? "" : "disabled"}>넓히기</button>` : ""}</div></div>`;
    if (!items.length) return head + `<div class="fm-card fm-empty">창고가 비었어요. 다 자란 칸을 눌러 거둬 보세요.</div>`;
    head += `<div class="fm-card"><div class="fm-row"><div class="fm-row__txt"><b>모두 팔기</b><p>창고에 있는 걸 한 번에 팔면 ${won(total)}</p></div><button type="button" class="fm-btn fm-btn--blue" data-act="sellAll">${coinSvg(16)} 모두 팔기</button></div></div>`;
    return head + items.map(([k, n]) => `<div class="fm-card"><div class="fm-row">${cropIco(k)}<div class="fm-row__txt"><b>${CROP[k].n} <span class="fm-tag">${num(n)}개</span>${S.daily && S.daily.crop === k ? ` <span class="fm-tag fm-tag--gold">오늘 2배</span>` : ""}${need[k] ? ` <span class="fm-tag fm-tag--blue">주문에 ${need[k]}개</span>` : ""}</b>
      <p>한 개 ${won(unitPrice(k))} · 모두 ${won(n * unitPrice(k))}</p></div>
      <div class="fm-btns"><button type="button" class="fm-btn" data-act="sell" data-k="${k}" data-n="1" aria-label="${CROP[k].n} 1개 팔기">1개</button><button type="button" class="fm-btn" data-act="sell" data-k="${k}" data-n="all">모두</button></div></div></div>`).join("");
  }
  function panelOrders() {
    return `<p class="fm-note">주문을 채우면 그냥 팔 때보다 더 받아요. 끝내거나 넘기면 ${dur(ORDER_WAIT)} 뒤 새 주문이 와요.</p>` + S.orders.map((o, si) => {
      if (!o.items) return `<div class="fm-card fm-wait">${ic("hourglass", 18)}<span>새 주문이 오고 있어요 · <b data-cd="${o.wait}">${dur(o.wait - S.ft)}</b></span></div>`;
      const ok = canDeliver(o);
      return `<div class="fm-card"><div class="fm-order__who"><span class="fm-avatar" style="background:${o.color}">${esc(o.name.charAt(0))}</span><div><b>${esc(o.dept)} ${esc(o.name)}</b><p>“${esc(o.line)}”</p></div></div>
        <div class="fm-order__items">${o.items.map((it) => { const have = S.inv[it.k] || 0; return `<span class="fm-need ${have >= it.n ? "is-ok" : ""}">${cropIco(it.k)}${CROP[it.k].n} ${it.n} <em>(${Math.min(have, it.n)}/${it.n})</em></span>`; }).join("")}</div>
        <div class="fm-order__foot"><div class="fm-order__reward"><span>${coinSvg(16)} ${won(o.money)}</span><span>${ic("star", 15, "#f59e0b")} 경험치 ${o.xp}</span></div>
          <div class="fm-btns"><button type="button" class="fm-btn" data-act="skip" data-i="${si}">넘기기</button><button type="button" class="fm-btn ${ok ? "fm-btn--green" : ""}" data-act="deliver" data-i="${si}" ${ok ? "" : "disabled"}>드리기</button></div></div></div>`;
    }).join("");
  }
  function panelTools() {
    const req = nextPlotReq();
    let out = "";
    if (req) {
      const can = S.lv >= req[0] && S.money >= req[1];
      out += `<div class="fm-card"><div class="fm-row"><span class="fm-toolico" style="background:#dcfce7;color:#16a34a">${ic("grid-3x3", 22)}</span><div class="fm-row__txt"><b>밭 넓히기 <span class="fm-tag">${S.open} / 25칸</span></b>
        <p>다음 칸 ${won(req[1])} · 텃밭 레벨 ${req[0]}</p></div><button type="button" class="fm-btn ${can ? "fm-btn--blue" : ""}" data-act="expand" ${can ? "" : "disabled"}>넓히기</button></div></div>`;
    } else out += `<div class="fm-card"><div class="fm-row"><span class="fm-toolico" style="background:#dcfce7;color:#16a34a">${ic("grid-3x3", 22)}</span><div class="fm-row__txt"><b>밭 25칸 완성</b><p>옥상을 모두 텃밭으로 채웠어요.</p></div></div></div>`;
    out += TOOL_KEYS.map((tk) => {
      const t = TOOLS[tk], l = S.tools[tk], max = t.cost.length, maxed = l >= max;
      const can = !maxed && S.lv >= t.lv[l] && S.money >= t.cost[l];
      const dots = `<span class="fm-lvdots">${Array.from({ length: max }, (_, j) => `<i class="${j < l ? "is-on" : ""}"></i>`).join("")}</span>`;
      const extra = tk === "auto" && l ? `<br>자라는 칸을 눌러 켜요 · 지금 ${S.autos.length}/${autoMax()}칸` : "";
      return `<div class="fm-card"><div class="fm-row"><span class="fm-toolico" style="background:${t.bg};color:${t.color}">${ic(t.icon, 22)}</span><div class="fm-row__txt"><b>${t.n} ${dots}</b>
        <p>${t.desc}<br>${l || tk === "shed" ? `지금: ${t.eff(l)}${maxed ? " (최고 단계)" : ` → 다음: ${t.eff(l + 1)}`}` : `사면: ${t.eff(1)}`}${extra}</p>
        ${maxed ? "" : `<div class="fm-facts"><span>${won(t.cost[l])}</span><span>텃밭 레벨 ${t.lv[l]}${S.lv >= t.lv[l] ? "" : "에 열려요"}</span></div>`}</div>
        ${maxed ? `<span class="fm-tag fm-tag--green">최고</span>` : `<button type="button" class="fm-btn ${can ? "fm-btn--blue" : ""}" data-act="tool" data-k="${tk}" ${can ? "" : "disabled"}>사기</button>`}</div></div>`;
    }).join("");
    return out;
  }
  function panelDex() {
    const n = dexCount();
    return `<div class="fm-card"><b style="font-size:15px">도감 ${n} / ${CROPS.length}</b><div class="fm-cap"><i style="width:${(n / CROPS.length) * 100}%;background:#16a34a"></i></div>
      <div class="fm-miles">${DEX_MILES.map((m) => `<div class="fm-mile ${n >= m.n ? "is-on" : ""}"><i>${n >= m.n ? ic("check", 13) : ""}</i>${m.n}종 — ${m.txt}</div>`).join("")}</div></div>
      <div class="fm-dex">${CROPS.map((c) => {
        const got = S.dex[c.k];
        return `<div class="fm-dexcard ${got ? "" : "is-off"}">${cropIco(c.k)}<b>${got ? c.n : "?"}</b><small>${got ? `모두 ${num(got)}개 거둠` : c.lv > S.lv ? `레벨 ${c.lv}` : "아직 못 거뒀어요"}</small></div>`;
      }).join("")}</div>`;
  }
  // 남은 시간 글자 — data-cd="텃밭 시계 목표(초)"
  function countdowns() {
    document.querySelectorAll("[data-cd]").forEach((el) => {
      const left = +el.dataset.cd - S.ft;
      el.textContent = left > 0 ? dur(left) : "곧";
    });
  }

  // ══ 시계 ══════════════════════════════════════════════════
  function tick() {
    // 화면이 숨겨진 동안은 계산을 쉬었다가, 돌아왔을 때 한 번에 정산한다(정산 팝업이 여러 번 쌓이지 않게)
    if (!S || document.hidden) return;
    const now = store.now();
    const ordersBefore = S.orders.map((o) => (o.items ? null : o.wait));
    const adv = advance(now);
    const newDay = ensureDaily(now);
    const ordersChanged = ensureOrders();
    if (adv.gap > 60) {
      // 화면이 잠들었다 깨어났을 때도 정산 팝업
      queue.push(() => awayPopup(awayInfo(adv, newDay, ordersBefore)));
      store.saveNow();
      refresh();
      flush();
      return;
    }
    if (newDay || ordersChanged) { store.dirty(); drawToday(); if (S.tab === "orders" || S.tab === "shed") drawPanel(); }
    drawSky();
    drawField();
    drawBar(false);
    drawTabs(false);
    countdowns();
    // 5분마다 한 번은 저장(오래 켜 둔 동안의 시계)
    if (++ticksSinceSave >= 300) { ticksSinceSave = 0; store.dirty(); }
  }

  function onClick(e) {
    const b = e.target.closest("[data-act]");
    if (!b || b.disabled || !root.contains(b)) return;
    const a = b.dataset.act;
    if (a === "plot") onPlot(+b.dataset.i);
    else if (a === "harvestAll") harvestAll();
    else if (a === "plantAll") plantAll();
    else if (a === "tab") {
      S.tab = b.dataset.tab;
      drawTabs(true); drawPanel();
      if (b.classList.contains("fm-seedchip") && matchMedia("(max-width: 919px)").matches) root.querySelector("#fm-tabs").scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
    } else if (a === "seed") { S.seed = b.dataset.k; store.dirty(); drawBar(true); drawPanel(); drawField(); HKUI.toast(`이제 빈 칸을 누르면 ${jo(CROP[S.seed].n, "을", "를")} 심어요`); }
    else if (a === "sell") sell(b.dataset.k, b.dataset.n === "all" ? Infinity : +b.dataset.n);
    else if (a === "sellAll") sellAll();
    else if (a === "deliver") deliver(+b.dataset.i);
    else if (a === "skip") skipOrder(+b.dataset.i);
    else if (a === "tool") buyTool(b.dataset.k);
    else if (a === "expand") expand();
    else if (a === "claim") claimDaily();
    else if (a === "help") help();
    else if (a === "reset") resetAll();
  }

  async function mount(container) {
    root = container;
    try {
      store = await HKMgmt.open(KEY, {
        blank,
        onStale: (st) => { S = fix(st); advance(store.now()); ensureDaily(store.now()); ensureOrders(); build(); HKUI.toast("다른 창에서 바뀐 내용을 불러왔어요"); },
        onClosed: (opensAt) => { clearInterval(tickTimer); S = null; root.innerHTML = HKMgmt.closedHtml(opensAt, TITLE); HKUI.refreshIcons(root); },
      });
    } catch (e) {
      if (e && e.closed) { root.innerHTML = HKMgmt.closedHtml(e.opensAt, TITLE); HKUI.refreshIcons(root); return; }
      root.innerHTML = `<div class="fm-card fm-empty">텃밭을 불러오지 못했어요. 잠시 뒤 다시 들어와 주세요.<br><small>${esc(e && e.message)}</small></div>`;
      return;
    }
    S = fix(store.state);
    const now = store.now();
    const first = !S.t;
    if (!S.stats.start) S.stats.start = now;
    const ordersBefore = S.orders.map((o) => (o.items ? null : o.wait));
    const adv = advance(now);
    const newDay = ensureDaily(now) && !first;
    ensureOrders();
    summary();
    root.addEventListener("click", onClick);
    build();
    if (first || store.isNew) store.saveNow();
    else store.dirty();
    if (!first && adv.gap > 60) queue.push(() => awayPopup(awayInfo(adv, newDay, ordersBefore)));
    if (!S.tut) tutorial();
    else flush();
    tickTimer = setInterval(tick, 1000);
  }

  // 시험용 통로는 로컬(localhost · 127.0.0.1)에서만
  const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  return { mount, CROPS, ...(local ? { _debug: () => ({ store, S }) } : {}) };
})();
