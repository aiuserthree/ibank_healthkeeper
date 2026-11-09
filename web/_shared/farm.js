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

  // ── 아이소메트릭 옥상 장면 ── 보드 좌표(viewBox 0 0 BW BH). 칸 (u, v) → 화면 (x, y). 빛은 늘 왼쪽 위.
  //    밭 칸 i(5×5, 처음 3×3 은 i = 0·1·2·5·6·7·10·11·12) 는 앞쪽(보는 사람 쪽)부터 놓는다 — 잠긴 칸은 뒤쪽 하늘 쪽에.
  const BW = 530, BH = 418, OX = 265, OY = 84, HW = 50, HH = 25;
  const iso = (u, v) => [OX + (u - v) * HW, OY + (u + v) * HH];
  const cellUV = (i) => [4 - Math.floor(i / 5), 4 - (i % 5)];
  const cellFloor = (i) => { const [u, v] = cellUV(i); return iso(u + 0.5, v + 0.5); };
  const DEPTH = Array.from({ length: 25 }, (_, i) => i).sort((a, b) => { const [ua, va] = cellUV(a), [ub, vb] = cellUV(b); return ua + va - (ub + vb) || ua - ub; });
  const BOX = { ax: 42, ay: 21, h: 15 }; // 화단 상자: 반 너비 · 반 높이 · 벽 높이
  const f1 = (n) => +n.toFixed(1);
  const P = (pts) => pts.map((p) => `${f1(p[0])},${f1(p[1])}`).join(" ");
  const pct = (x, y) => `left:${f1((x / BW) * 100)}%;top:${f1((y / BH) * 100)}%`;

  // 작물 색 — 날아가는 구슬 · 씨앗 봉투
  const CROP_COLOR = { sprout: "#84cc16", lettuce: "#22c55e", scallion: "#16a34a", tomato: "#ef4444", pepper: "#dc2626", eggplant: "#8b3fd1", cucumber: "#15803d", carrot: "#f97316", strawberry: "#e11d48", corn: "#eab308", pumpkin: "#f97316", watermelon: "#16a34a" };
  const ballOf = (k) => `radial-gradient(circle at 35% 30%, #fff 0, ${CROP_COLOR[k] || "#22b35e"} 48%, ${CROP_COLOR[k] || "#22b35e"})`;

  // 화단 상자(두께 있는 나무 상자 · 윗면 흙). cx, cy = 바닥 가운데. st: -1 빈 칸(마른 흙) · 그 밖 심은 칸(젖은 흙)
  function boxSvg(cx, cy, st) {
    const { ax, ay, h } = BOX, t = cy - h;
    const L = [cx - ax, t], R = [cx + ax, t], F = [cx, t + ay], B = [cx, t - ay];
    const Lf = [cx - ax, cy], Rf = [cx + ax, cy], Ff = [cx, cy + ay];
    let s = `<ellipse cx="${cx + 7}" cy="${cy + 5}" rx="${ax + 5}" ry="${ay + 4}" fill="rgba(60,40,20,.16)"/>`;
    s += `<g class="fm-hit"><polygon points="${P([L, F, Ff, Lf])}" fill="#c98a4f"/><polygon points="${P([F, R, Rf, Ff])}" fill="#9c6232"/>`;
    for (const k of [0.36, 0.7]) s += `<path d="M${f1(cx - ax)} ${f1(t + h * k)} L${cx} ${f1(t + ay + h * k)} L${f1(cx + ax)} ${f1(t + h * k)}" stroke="rgba(80,44,16,.3)" stroke-width="1.1" fill="none"/>`;
    s += `<path d="M${cx} ${f1(t + ay)} V${f1(cy + ay)}" stroke="rgba(255,226,180,.55)" stroke-width="1.6"/>`;
    s += `<polygon points="${P([B, R, F, L])}" fill="#e6b077"/><path d="M${f1(L[0])} ${f1(L[1])} L${B[0]} ${f1(B[1])} L${f1(R[0])} ${f1(R[1])}" stroke="#f6cf9c" stroke-width="1.4" fill="none"/>`;
    const k = 0.76, sx = ax * k, sy = ay * k;
    const q = (p, r) => [cx + ((p - r) * sx) / 2, t + ((p + r) * sy) / 2];
    s += `<polygon class="fm-soil" points="${P([q(-1, -1), q(1, -1), q(1, 1), q(-1, 1)])}" fill="${st === -1 ? "#a67449" : "#6b4124"}"/>`;
    s += `<path d="M${P([q(-1, 1), q(-1, -1), q(1, -1)]).replace(/ /g, " L")}" stroke="rgba(0,0,0,.24)" stroke-width="2" fill="none"/>`;
    for (const r of [-0.5, 0, 0.5]) { const a = q(-0.82, r), b = q(0.82, r); s += `<path d="M${f1(a[0])} ${f1(a[1])} L${f1(b[0])} ${f1(b[1])}" stroke="${st === -1 ? "rgba(120,78,44,.55)" : "rgba(40,22,10,.4)"}" stroke-width="2" stroke-linecap="round"/>`; }
    s += `</g>`;
    return s;
  }
  // 작물 — 앞에서 본 그림(PLANT)을 흙 가운데 (cx, sy) 에 세운다. 단계: 0 씨 · 1 싹 · 2 잎 · 3 열매
  function plantSvg(k, stage, cx, sy, seedN = 0) {
    if (stage === 0) {
      return `<g class="fm-seedbed"><ellipse cx="${cx}" cy="${sy + 1}" rx="11" ry="4.6" fill="#4a2c16"/><g fill="#f5d98a"><ellipse cx="${cx - 5}" cy="${sy}" rx="1.9" ry="1.3"/><ellipse cx="${cx + 1}" cy="${sy + 2}" rx="1.9" ry="1.3"/><ellipse cx="${cx + 5}" cy="${sy - 1}" rx="1.9" ry="1.3"/></g></g>`;
    }
    let inner, sc;
    if (stage === 1) { inner = `<path d="M50 72 V56" stroke="#65a30d" stroke-width="3" stroke-linecap="round"/>${leaf(50, 57, 13, -150, "#84cc16", 0.5)}${leaf(50, 57, 13, -30, "#65a30d", 0.5)}`; sc = 1.05; }
    else if (stage === 2) { inner = PLANT[k] ? PLANT[k](false) : ""; sc = 0.92; }
    else { inner = PLANT[k] ? PLANT[k](true) : ""; sc = 1.14; }
    return `<g transform="translate(${f1(cx)} ${f1(sy)}) scale(${sc}) translate(-50 -72)"><g class="fm-plant" style="--d:-${((seedN * 0.53) % 2.4).toFixed(2)}s">${inner}</g></g>`;
  }
  // 칸 하나의 그림(보드 좌표). 화단 + 작물 + 자동 물주기 표시 + 남은 시간 고리
  function cellArt(i, cx, cy, st, opt = {}) {
    const t = cy - BOX.h, ready = st.stage === 3;
    let s = `<g class="fm-lift">` + boxSvg(cx, cy, st.stage);
    if (ready) s += `<polygon class="fm-glow" points="${P([[cx, t - 18], [cx + 36, t], [cx, t + 18], [cx - 36, t]])}" fill="#ffe27a"/>`;
    if (st.stage >= 0) s += `<g class="fm-nohit">${plantSvg(st.k, st.stage, cx, t, opt.seedN || 0)}</g>`;
    if (ready) s += `<g class="fm-nohit fm-sparkle"><path d="M${cx - 22} ${t - 40} l2 -5 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2z" fill="#fff6c4"/><path d="M${cx + 20} ${t - 26} l1.4 -3.6 l1.4 3.6 l3.6 1.4 l-3.6 1.4 l-1.4 3.6 l-1.4 -3.6 l-3.6 -1.4z" fill="#fff"/></g>`;
    if (opt.auto) s += `<g class="fm-nohit" transform="translate(${f1(cx - BOX.ax + 6)} ${f1(t - 3)})"><circle r="7.5" fill="#fff"/><circle r="6" fill="#3b82f6"/><path d="M0 -3.6 C2.4 -0.6 2.8 0.6 2.8 1.4 A2.8 2.8 0 0 1 -2.8 1.4 C-2.8 0.6 -2.4 -0.6 0 -3.6Z" fill="#fff"/></g>`;
    if (opt.ring) s += `<g class="fm-nohit" transform="translate(${cx} ${f1(t + BOX.ay + 4)})"><circle r="9.5" fill="#fff" stroke="rgba(0,0,0,.08)"/><circle r="6.4" fill="none" stroke="#e3efe2" stroke-width="3.4"/><circle r="6.4" fill="none" stroke="#22b35e" stroke-width="3.4" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="${opt.ring.off}" transform="rotate(-90)" data-ring="${opt.ring.p}" data-rd="${opt.ring.d}"/></g>`;
    return s + `</g>`;
  }
  // 따로 쓰는 화단 그림(팝업 · 안내)
  function planterSvg(k, stage, cls = "fm-planter") {
    return `<svg class="${cls}" viewBox="0 0 120 110" aria-hidden="true">${cellArt(0, 60, 86, { stage, k })}</svg>`;
  }

  // 작물 아이콘 (목록용)
  function cropIco(k) {
    const big = { pumpkin: 1.35, watermelon: 1.3, lettuce: 1.45, sprout: 1.45 }[k] || 1.4;
    return `<svg class="fm-ico" viewBox="0 0 40 40" aria-hidden="true"><ellipse cx="20" cy="33" rx="11" ry="2.6" fill="rgba(0,0,0,.08)"/>${at(20, 20, big, FRUIT[k] || "")}</svg>`;
  }
  const coinSvg = (s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10.6" r="9" fill="#d98a00"/><circle cx="10" cy="9.6" r="9" fill="#ffb020"/><circle cx="10" cy="9.6" r="6.3" fill="#ffd25e"/><path d="M7 8 L8.4 12.2 L10 8.6 L11.6 12.2 L13 8" stroke="#a86400" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const starSvg = (s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.8 L12.5 7 L18.2 7.6 L13.9 11.4 L15.2 17 L10 14.1 L4.8 17 L6.1 11.4 L1.8 7.6 L7.5 7Z" fill="#ffb020" stroke="#e08f00" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
  const markSvg = `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M4 24 L20 16 L36 24 L20 32Z" fill="#e6b077"/><path d="M4 24 L20 32 V37 L4 29Z" fill="#c98a4f"/><path d="M36 24 L20 32 V37 L36 29Z" fill="#9c6232"/><path d="M8 24 L20 18 L32 24 L20 30Z" fill="#6b4124"/><path d="M20 25 V13" stroke="#16a34a" stroke-width="2.4" stroke-linecap="round"/>${leaf(20, 15, 10, -150, "#4ade80", 0.5)}${leaf(20, 15, 10, -30, "#22c55e", 0.5)}${at(28, 12, 0.55, FRUIT.tomato)}</svg>`;

  // 작은 그림 아이콘(독 · HUD · 카드)
  const ART = {
    seed: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7 6 h18 v21 a2 2 0 0 1 -2 2 h-14 a2 2 0 0 1 -2 -2z" fill="#fff4d6" stroke="#e7b75f" stroke-width="1.4"/><path d="M7 6 l2 -2 l2 2 l2 -2 l2 2 l2 -2 l2 2 l2 -2 l2 2 l2 -2 l2 2" fill="none" stroke="#e7b75f" stroke-width="1.4" stroke-linejoin="round"/><rect x="10" y="11" width="12" height="10" rx="3" fill="#dcf5df"/><path d="M16 20 V15" stroke="#16a34a" stroke-width="1.8" stroke-linecap="round"/>${leaf(16, 16, 6, -150, "#4ade80", 0.55)}${leaf(16, 16, 6, -30, "#22c55e", 0.55)}<rect x="10" y="23.5" width="12" height="2" rx="1" fill="#e7b75f"/></svg>`,
    crate: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 12 L16 7 L28 12 L16 17Z" fill="#7a4a26"/><circle cx="12" cy="11.4" r="3" fill="#ef4444"/><circle cx="17" cy="10" r="3" fill="#22c55e"/><circle cx="20" cy="12.6" r="2.8" fill="#f97316"/><path d="M4 12 L16 17 V28 L4 23Z" fill="#d79a5c"/><path d="M28 12 L16 17 V28 L28 23Z" fill="#a8693a"/><path d="M4 17.5 L16 22.5 L28 17.5" stroke="rgba(80,40,10,.35)" stroke-width="1.2" fill="none"/></svg>`,
    memo: `<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="6" y="5" width="20" height="23" rx="3" fill="#ffe98a" transform="rotate(-4 16 16)"/><rect x="12" y="2.6" width="8" height="5" rx="1.5" fill="rgba(160,200,255,.85)" transform="rotate(-4 16 5)"/><path d="M10 13 h11 M10 17.5 h11 M10 22 h7" stroke="#b8932a" stroke-width="1.8" stroke-linecap="round" transform="rotate(-4 16 16)"/></svg>`,
    can: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 12 Q4 4 13 6" stroke="#167f9c" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M6 12 h14 l-1.4 14 a2 2 0 0 1 -2 1.8 h-7.2 a2 2 0 0 1 -2 -1.8z" fill="#22a6c9"/><path d="M19 17 L27 10" stroke="#22a6c9" stroke-width="3.2" stroke-linecap="round"/><ellipse cx="27.6" cy="9.4" rx="3" ry="2" transform="rotate(-42 27.6 9.4)" fill="#167f9c"/><path d="M9 15 l.6 9" stroke="rgba(255,255,255,.5)" stroke-width="2" stroke-linecap="round"/></svg>`,
    book: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 7 a2 2 0 0 1 2 -2 h17 v21 h-17 a2 2 0 0 0 -2 2z" fill="#2f9e5b"/><path d="M5 28 a2 2 0 0 1 2 -2 h17 v3 h-17 a2 2 0 0 1 -2 -1z" fill="#fff4d6"/><rect x="10" y="9" width="10" height="7" rx="2" fill="#dcf5df"/><circle cx="21" cy="21" r="3.6" fill="#ffd25e" stroke="#fff" stroke-width="1.4"/><path d="M19 4 v8 l2 -1.6 l2 1.6 v-8" fill="#ef4444"/></svg>`,
  };
  const TOOL_ART = {
    can: ART.can,
    fert: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 8 h16 l2 18 a2 2 0 0 1 -2 2 h-16 a2 2 0 0 1 -2 -2z" fill="#e9c46a"/><path d="M8 8 l2 -3 h12 l2 3z" fill="#c99a3a"/><rect x="10" y="13" width="12" height="9" rx="2" fill="#fff8e3"/><path d="M16 21 V16" stroke="#16a34a" stroke-width="1.6" stroke-linecap="round"/>${leaf(16, 17, 5, -150, "#4ade80", 0.55)}${leaf(16, 17, 5, -30, "#22c55e", 0.55)}</svg>`,
    auto: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 29 V14" stroke="#64748b" stroke-width="3" stroke-linecap="round"/><ellipse cx="16" cy="29" rx="6" ry="2" fill="#94a3b8"/><rect x="11" y="10" width="10" height="5" rx="2.5" fill="#3b82f6"/><g stroke="#7dd3fc" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-dasharray="2 3"><path d="M14 10 Q8 2 3 9"/><path d="M18 10 Q24 2 29 9"/><path d="M16 9 V2"/></g></svg>`,
    shed: ART.crate,
    plot: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M2 16 L16 9 L30 16 L16 23Z" fill="#e6b077"/><path d="M2 16 L16 23 V27 L2 20Z" fill="#c98a4f"/><path d="M30 16 L16 23 V27 L30 20Z" fill="#9c6232"/><path d="M9 16 L16 12.5 L23 16 L16 19.5Z" fill="#6b4124"/><circle cx="24" cy="8" r="6" fill="#22b35e"/><path d="M24 5 v6 M21 8 h6" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>`,
  };

  // 동료 얼굴 — 이름표 색 · 머리 모양은 주문 id 로 고정
  function faceSvg(o) {
    const h = hashStr(o.id || o.name || "x");
    const skin = ["#ffd9b8", "#f6c9a0", "#eab38a", "#ffe2c8"][h % 4];
    const hair = ["#3b2a20", "#5a3a22", "#1f1f2b", "#7a4a2a", "#2b2b2b"][(h >>> 3) % 5];
    const style = (h >>> 6) % 3;
    const hairPath = style === 0 ? `<path d="M9 19 Q8 7 20 7 Q32 7 31 19 Q28 12 20 12 Q12 12 9 19Z" fill="${hair}"/>`
      : style === 1 ? `<path d="M8 22 Q6 6 20 6 Q34 6 32 22 L30 22 Q30 13 20 12 Q12 12 10 22Z" fill="${hair}"/>`
      : `<path d="M9 18 Q9 7 20 7 Q31 7 31 18 Q26 10 17 13 Q12 14 9 18Z" fill="${hair}"/><circle cx="20" cy="6" r="3.6" fill="${hair}"/>`;
    return `<svg class="fm-face" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="20" fill="${o.color}" opacity=".18"/><path d="M8 40 Q8 29 20 29 Q32 29 32 40Z" fill="${o.color}"/><circle cx="20" cy="19" r="10.5" fill="${skin}"/>${hairPath}<circle cx="16.4" cy="20" r="1.3" fill="#2b2118"/><circle cx="23.6" cy="20" r="1.3" fill="#2b2118"/><path d="M17.4 24 Q20 26.4 22.6 24" stroke="#2b2118" stroke-width="1.3" fill="none" stroke-linecap="round"/><circle cx="14" cy="23.4" r="1.8" fill="#ff8f8f" opacity=".45"/><circle cx="26" cy="23.4" r="1.8" fill="#ff8f8f" opacity=".45"/></svg>`;
  }

  // ── 장면 배경: 시간대 · 먼 도시 · 옥상 바닥(두께) · 난간 ──
  const timeOf = (hour) => (hour >= 5 && hour < 10 ? "morning" : hour >= 10 && hour < 17 ? "day" : hour >= 17 && hour < 20 ? "evening" : "night");
  const CITY = [[-260, 52, 30], [-212, 40, 64], [-160, 58, 18], [-96, 44, 46], [-48, 36, 8], [-6, 50, 40], [48, 40, 22], [92, 56, 50], [152, 34, 12], [190, 46, 34], [240, 52, 4], [296, 40, 30], [340, 54, 14], [398, 42, 44], [444, 50, 20], [498, 38, 56], [540, 56, 10], [600, 44, 36], [648, 52, 24], [704, 40, 50], [748, 60, 16]];
  function backdropSvg(t) {
    const C = { morning: ["#c3d9ee", "#9dbcdc", "rgba(255,255,255,.7)", "#d3e3f1"], day: ["#a8cae8", "#84afd6", "rgba(255,255,255,.6)", "#c6dcef"],
      evening: ["#d79aa6", "#b06f86", "#ffd88a", "#e4aeae"], night: ["#2b3b74", "#1f2b5e", "#ffd76a", "#2a3a72"] }[t];
    const lit = t === "night" || t === "evening";
    let s = `<g class="fm-city">`;
    // 먼 줄
    CITY.forEach(([x, w, top], j) => {
      const y = 6 + ((top * 7 + j * 13) % 40);
      s += `<rect x="${x + 18}" y="${y}" width="${w - 6}" height="${260 - y}" fill="${C[3]}"/>`;
    });
    // 가까운 줄 + 창문
    CITY.forEach(([x, w, top], j) => {
      const y = 22 + top;
      s += `<rect x="${x}" y="${y}" width="${w}" height="${250 - y}" fill="${j % 2 ? C[0] : C[1]}"/>`;
      if (j % 4 === 1) s += `<rect x="${x + w / 2 - 1}" y="${y - 14}" width="2" height="14" fill="${C[1]}"/>`;
      for (let yy = y + 6; yy < 150; yy += 11) for (let xx = x + 5; xx < x + w - 6; xx += 9) {
        const on = (xx * 3 + yy * 7 + j) % (lit ? 3 : 4);
        if (on) s += `<rect x="${xx}" y="${yy}" width="4" height="5" rx="1" fill="${C[2]}" opacity="${lit ? (on === 1 ? 0.95 : 0.25) : 0.5}"/>`;
      }
    });
    s += `</g>`;
    // 옥상 바닥 판 — 두께 있는 콘크리트 + 밭 자리(자갈)
    const b = iso(-0.2, -0.2), r = iso(6.2, -0.2), f = iso(6.2, 6.2), l = iso(-0.2, 6.2), T = 18;
    s += `<polygon points="${P([[l[0] + 10, l[1] + T + 4], [f[0] + 10, f[1] + T + 8], [r[0] + 10, r[1] + T + 4]])}" fill="rgba(40,50,70,.12)" filter="url(#fm-blur)"/>`;
    s += `<polygon points="${P([l, f, [f[0], f[1] + T], [l[0], l[1] + T]])}" fill="#d3c2a5"/><polygon points="${P([f, r, [r[0], r[1] + T], [f[0], f[1] + T]])}" fill="#ad9876"/>`;
    s += `<path d="M${l[0]} ${l[1] + 6} L${f[0]} ${f[1] + 6} L${r[0]} ${r[1] + 6}" stroke="rgba(90,70,40,.18)" stroke-width="2" fill="none"/>`;
    s += `<polygon points="${P([b, r, f, l])}" fill="#eee4d4"/>`;
    let lines = "";
    for (let k = 0; k <= 6; k++) { const a = iso(k, -0.2), c = iso(k, 6.2), d = iso(-0.2, k), e = iso(6.2, k); lines += `M${a[0]} ${a[1]} L${c[0]} ${c[1]} M${d[0]} ${d[1]} L${e[0]} ${e[1]} `; }
    s += `<path d="${lines}" stroke="rgba(130,110,80,.13)" stroke-width="1.2"/>`;
    const g0 = iso(-0.06, -0.06), g1 = iso(5.06, -0.06), g2 = iso(5.06, 5.06), g3 = iso(-0.06, 5.06);
    s += `<polygon points="${P([g0, g1, g2, g3])}" fill="#d9c5a1"/><path d="M${P([g3, g2, g1]).replace(/ /g, " L")}" stroke="#fff8ec" stroke-width="2.4" fill="none"/>`;
    let dots = "";
    for (let k = 0; k < 70; k++) { const u = ((k * 37) % 100) / 20, v = ((k * 61) % 100) / 20, [x, y] = iso(u, v); dots += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${k % 3 ? 1 : 1.5}"/>`; }
    s += `<g fill="rgba(120,90,50,.28)">${dots}</g>`;
    s += `<path d="M${l[0]} ${l[1]} L${f[0]} ${f[1]} L${r[0]} ${r[1]}" stroke="#fffaf2" stroke-width="2" fill="none"/>`;
    // 난간(뒤쪽 두 변) + 꼬마전구
    let rail = "", top = [], bulbs = "";
    const posts = [];
    for (let k = 6.2; k >= -0.2; k -= 0.8) posts.push(iso(-0.2, k));
    for (let k = 0.6; k <= 6.21; k += 0.8) posts.push(iso(k, -0.2));
    posts.forEach(([x, y]) => { rail += `<path d="M${f1(x)} ${f1(y)} v-24" stroke="#93a1b3" stroke-width="2.6" stroke-linecap="round"/>`; top.push([x, y - 24]); });
    const mid = top.map(([x, y]) => [x, y + 12]);
    rail += `<polyline points="${P(mid)}" stroke="#a9b6c6" stroke-width="2" fill="none"/><polyline points="${P(top)}" stroke="#d6dee8" stroke-width="3.2" fill="none" stroke-linejoin="round"/>`;
    for (let k = 0; k < top.length - 1; k++) {
      const [x1, y1] = top[k], [x2, y2] = top[k + 1], mx = (x1 + x2) / 2, my = (y1 + y2) / 2 + 6;
      bulbs += `<path d="M${f1(x1)} ${f1(y1)} Q${f1(mx)} ${f1(my + 3)} ${f1(x2)} ${f1(y2)}" stroke="rgba(70,70,80,.35)" stroke-width="1" fill="none"/><circle class="fm-bulb" cx="${f1(mx)}" cy="${f1(my + 2.6)}" r="2.6" style="--bd:${(k % 4) * 0.4}s"/>`;
    }
    s += `<g class="fm-rail">${rail}${bulbs}</g>`;
    return s;
  }

  // ── 장면 소품 — 누르면 그 판이 열린다 ──
  function propBox(cx, cy, ax, ay, h, cols) {
    const t = cy - h;
    return `<polygon points="${P([[cx - ax, t], [cx, t + ay], [cx, cy + ay], [cx - ax, cy]])}" fill="${cols[0]}"/><polygon points="${P([[cx, t + ay], [cx + ax, t], [cx + ax, cy], [cx, cy + ay]])}" fill="${cols[1]}"/><polygon points="${P([[cx, t - ay], [cx + ax, t], [cx, t + ay], [cx - ax, t]])}" fill="${cols[2]}"/>`;
  }
  const shadowAt = (x, y, rx, ry) => `<ellipse cx="${f1(x + 5)}" cy="${f1(y + 4)}" rx="${rx}" ry="${ry}" fill="rgba(60,40,20,.17)"/>`;
  const lvBadge = (x, y, n) => (n ? `<g transform="translate(${f1(x)} ${f1(y)})"><circle r="8.5" fill="#fff" stroke="rgba(0,0,0,.08)"/><text y="3.6" text-anchor="middle" font-size="10" font-weight="900" fill="#158a45">${n}</text></g>` : "");
  function canProp(lv) {
    const [x, y] = iso(1.1, 5.65);
    const body = lv ? "#22a6c9" : "#a9bcc6", dark = lv ? "#167f9c" : "#8aa0ab";
    return `<g class="fm-prop" id="fm-prop-can" data-act="tab" data-tab="tools" role="button" tabindex="0" aria-label="도구 — 물뿌리개 ${lv}단계">
      ${shadowAt(x, y, 24, 9)}<g transform="translate(${f1(x)} ${f1(y)})">
      <path d="M-12 -26 Q-30 -46 2 -40" stroke="${dark}" stroke-width="4.4" fill="none" stroke-linecap="round"/>
      <path d="M-17 -2 L-14 -28 Q0 -32 14 -28 L17 -2 Q0 5 -17 -2Z" fill="${body}"/><ellipse cy="-28" rx="14" ry="5" fill="${dark}"/>
      <path d="M13 -11 L35 -33" stroke="${body}" stroke-width="5.4" stroke-linecap="round"/><ellipse cx="36.5" cy="-34.5" rx="6" ry="3.4" fill="${dark}" transform="rotate(-45 36.5 -34.5)"/>
      <path d="M-11 -7 L-9.4 -23" stroke="rgba(255,255,255,.5)" stroke-width="3.2" stroke-linecap="round"/></g>${lvBadge(x + 14, y - 40, lv)}</g>`;
  }
  function sprinklerProp(lv) {
    if (!lv) return "";
    const [x, y] = iso(3.2, 5.6);
    return `<g class="fm-prop" id="fm-prop-auto" data-act="tab" data-tab="tools" role="button" tabindex="0" aria-label="도구 — 자동 물주기 ${lv}단계">
      ${shadowAt(x, y, 12, 5)}<g transform="translate(${f1(x)} ${f1(y)})"><ellipse rx="9" ry="4" fill="#94a3b8"/><rect x="-2.6" y="-36" width="5.2" height="36" rx="2" fill="#64748b"/><rect x="-9" y="-42" width="18" height="8" rx="4" fill="#3b82f6"/><rect x="-6" y="-41" width="6" height="3" rx="1.5" fill="#93c5fd"/>
      <g class="fm-spray" stroke="#7dd3fc" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-dasharray="3 6"><path d="M-6 -42 Q-24 -64 -44 -36"/><path d="M6 -42 Q24 -64 44 -36"/><path d="M0 -44 Q-6 -70 -18 -64"/></g></g>${lvBadge(x + 14, y - 44, lv)}</g>`;
  }
  function crateProp() {
    const [x, y] = iso(5.62, 1.25);
    const fill = Math.min(1, invTotal() / cap()), full = invTotal() >= cap(), lv = S.tools.shed;
    let s = `<g class="fm-prop" id="fm-prop-shed" data-act="tab" data-tab="shed" role="button" tabindex="0" aria-label="창고 ${invTotal()}/${cap()}">${shadowAt(x, y, 40, 18)}`;
    if (lv >= 3) s += propBox(x + 30, y - 6, 18, 9, 18, ["#d79a5c", "#a8693a", "#e7b77d"]);
    s += propBox(x, y, 34, 17, 30, ["#d79a5c", "#a8693a", "#5e3a1e"]);
    const t = y - 30;
    s += `<path d="M${x - 34} ${t + 10} L${x} ${t + 27} L${x + 34} ${t + 10} M${x - 34} ${t + 20} L${x} ${t + 37} L${x + 34} ${t + 20}" stroke="rgba(80,40,10,.3)" stroke-width="1.4" fill="none"/>`;
    s += `<path d="M${x - 34} ${t} L${x} ${t - 17} L${x + 34} ${t} L${x} ${t + 17}Z" fill="none" stroke="#f0c48e" stroke-width="3"/>`;
    const kinds = Object.keys(S.inv).filter((k) => S.inv[k] > 0);
    const n = Math.round(fill * 9);
    const spots = [[-12, 2], [10, -1], [0, 6], [-4, -6], [16, 5], [-18, -2], [6, -9], [-8, 9], [20, -4]];
    for (let k = 0; k < n; k++) {
      const [dx, dy] = spots[k], kk = kinds[k % Math.max(1, kinds.length)] || "tomato";
      s += `<circle cx="${x + dx}" cy="${t + dy - fill * 4}" r="5.4" fill="${CROP_COLOR[kk]}" stroke="rgba(0,0,0,.12)"/><circle cx="${x + dx - 1.6}" cy="${t + dy - fill * 4 - 1.8}" r="1.6" fill="#fff" opacity=".45"/>`;
    }
    if (full) s += `<g transform="translate(${x} ${t - 30})"><g class="fm-warnbob"><circle r="10" fill="#e5484d" stroke="#fff" stroke-width="2.4"/><path d="M0 -5 v5.4" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><circle cy="4.6" r="1.5" fill="#fff"/></g></g>`;
    return s + `</g>`;
  }
  function bookProp() {
    const [x, y] = iso(5.6, 3.55), n = dexCount();
    let s = `<g class="fm-prop" id="fm-prop-dex" data-act="tab" data-tab="dex" role="button" tabindex="0" aria-label="도감 ${n}/${CROPS.length}">${shadowAt(x, y, 28, 12)}`;
    s += propBox(x, y, 26, 13, 12, ["#fff4d6", "#e8d6ac", "#2f9e5b"]);
    s += `<path d="M${x - 26} ${y - 12} L${x} ${y + 1} L${x} ${y + 13} L${x - 26} ${y}Z" fill="#2f9e5b" opacity=".0"/>`;
    s += `<path d="M${x - 26} ${y - 9} L${x} ${y + 4} M${x - 26} ${y - 5} L${x} ${y + 8}" stroke="#d9c79a" stroke-width="1"/>`;
    s += `<polygon points="${P([[x - 10, y - 14], [x + 2, y - 20], [x + 12, y - 15], [x, y - 9]])}" fill="#dcf5df"/>`;
    s += `<path d="M${x + 14} ${y - 22} l0 14 l3 -2 l3 3 l0 -14z" fill="#ef4444"/>`;
    if (n >= 3) s += `<g transform="translate(${x - 4} ${y - 15}) scale(.9)"><circle r="6.5" fill="#ffd25e" stroke="#fff" stroke-width="1.6"/><path d="M0 -3.4 L1 -1 L3.4 -.8 L1.6 .8 L2.1 3.2 L0 2 L-2.1 3.2 L-1.6 .8 L-3.4 -.8 L-1 -1Z" fill="#fff"/></g>`;
    s += `<g transform="translate(${x + 2} ${y - 32})"><rect x="-15" y="-9" width="30" height="16" rx="8" fill="#fff" stroke="rgba(0,0,0,.08)"/><text y="3" text-anchor="middle" font-size="10" font-weight="900" fill="#158a45">${n}/${CROPS.length}</text></g>`;
    return s + `</g>`;
  }
  function boardProp() {
    const [x, y] = iso(5.72, 5.72);
    const active = S.orders.filter((o) => o.items).length, ok = S.orders.filter(canDeliver).length;
    let s = `<g class="fm-prop" id="fm-prop-orders" data-act="tab" data-tab="orders" role="button" tabindex="0" aria-label="동료 주문판 — 드릴 수 있는 주문 ${ok}장">${shadowAt(x, y, 26, 8)}`;
    s += `<g transform="translate(${x} ${y})"><path d="M-16 0 L-13 -20 M16 0 L13 -20" stroke="#8a5a2e" stroke-width="3.4" stroke-linecap="round"/><rect x="-24" y="-40" width="48" height="32" rx="4" fill="#c58e5b"/><rect x="-21" y="-37" width="42" height="26" rx="2.6" fill="#e9c393"/>`;
    const papers = [["#fff3a6", -14, -35, -6], ["#c8f0d2", 0, -36, 5], ["#ffd3d8", -6, -27, 3]];
    for (let k = 0; k < Math.min(3, active); k++) { const [c, px, py, rot] = papers[k]; s += `<g transform="translate(${px} ${py}) rotate(${rot})"><rect width="13" height="12" rx="1.5" fill="${c}"/><circle cx="6.5" cy="1.4" r="1.6" fill="#e5484d"/><path d="M3 6 h7 M3 9 h5" stroke="rgba(0,0,0,.25)" stroke-width="1"/></g>`; }
    s += `</g>`;
    if (ok) s += `<g transform="translate(${x + 22} ${y - 42})"><g class="fm-warnbob"><circle r="9" fill="#22b35e" stroke="#fff" stroke-width="2.2"/><text y="3.6" text-anchor="middle" font-size="10.5" font-weight="900" fill="#fff">${ok}</text></g></g>`;
    return s + `</g>`;
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

  let store, root, S, tickTimer = 0, lastSky = "", lastBarSig = "", lastTabSig = "", popping = false, ticksSinceSave = 0;
  let lastStripSig = "", lastPropSig = "", lastMoney = null, lastLv = null, lastTodaySig = ""; // 화면 다시 그리기 판단용
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
      ? `<button type="button" class="mgx-btn is-lg ${isAuto ? "is-white" : ""}" data-m="auto">${ic("refresh-cw", 18)} ${isAuto ? "자동 다시 심기 끄기" : "자동 다시 심기 켜기"}</button>`
      : "";
    const frac = Math.max(0, Math.min(1, (S.ft - p.p) / p.d));
    const stageName = ["씨앗", "새싹", "잎이 자라는 중", "다 자람"][st.stage] || "";
    const v = await modal(`<div class="fm-timer"><svg class="fm-timer__ring" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52" fill="none" stroke="#e3efe2" stroke-width="10"/><circle cx="60" cy="60" r="52" fill="none" stroke="#22b35e" stroke-width="10" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="${f1(100 - frac * 100)}" transform="rotate(-90 60 60)" data-ring="${p.p}" data-rd="${p.d}"/></svg>${planterSvg(p.k, st.stage, "fm-planter fm-timer__art")}</div>
      <div class="fm-modal__title is-center">${c.n} <span class="mgx-chip">${stageName}</span></div>
      <p class="fm-sub is-center"><b class="fm-bigtime" data-cd="${p.p + p.d}">${dur(st.left)}</b> 뒤에 거둘 수 있어요<br>다 자라도 시들지 않으니 편할 때 거두세요.</p>
      <ul class="fm-list"><li><span class="fm-li-ico">${cropIco(p.k)}</span><span>거두면 ${c.n} <b>${yieldOf(p.k)}개</b> · 경험치 ${c.xp}</span></li>
      ${S.tools.auto ? `<li><span class="fm-li-ico">${ic("refresh-cw", 18)}</span><span>자동 다시 심기 ${isAuto ? "<b>켜짐</b>" : "꺼짐"} · ${S.autos.length}/${autoMax()}칸</span></li>` : ""}</ul>
      <div class="fm-modal__btns">${autoRow}<button type="button" class="mgx-btn is-white is-lg" data-m="pull">${ic("shovel", 18)} 뽑기</button></div>`, "is-sheet");
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
  // cls: "is-sheet"(휴대폰에선 아래에서 올라오는 판) · "is-party"(축하)
  function modal(html, cls = "") {
    return new Promise((res) => {
      const ov = document.createElement("div");
      ov.className = `fm-ov mgx fm-theme ${cls}`;
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
      countdowns();
      const f = ov.querySelector("[data-m]");
      if (f) f.focus({ preventScroll: true });
    });
  }
  async function flush() {
    if (popping) return;
    popping = true;
    try { while (queue.length) await queue.shift()(); } finally { popping = false; }
  }
  const party = (n = 90) => { HKFx.confetti({ x: innerWidth / 2, y: innerHeight * 0.32, n, colors: ["#22b35e", "#ffb020", "#ef4444", "#7cc8ff", "#f9a8d4", "#a3e635"] }); };
  function levelUpPopup(L) {
    const items = unlocksAt(L);
    setTimeout(() => party(), 60);
    return modal(`<div class="fm-burst"><div class="fm-burst__rays"></div><div class="fm-lvbadge"><small>텃밭 레벨</small><b>${L}</b></div></div>
      <div class="fm-modal__title is-center">레벨 업!</div>
      <p class="fm-sub is-center">${L >= MAX_LV ? "1차 마지막 레벨이에요." : "새로 열린 것들이에요."}</p>
      <ul class="fm-list">${items.map((it) => `<li>${it.ico || `<span class="fm-li-ico">${ic(it.icon, 18)}</span>`}<span>${it.txt}</span></li>`).join("") || `<li>계속 가꿔 보세요</li>`}</ul>
      <div class="fm-modal__btns"><button type="button" class="mgx-btn is-lg is-wide" data-m="ok">좋아요</button></div>`, "is-party");
  }
  function dexPopup(list, before, after) {
    const miles = DEX_MILES.filter((m) => m.n > before && m.n <= after);
    const one = list.length === 1 ? CROP[list[0]] : null;
    if (miles.length) setTimeout(() => party(50), 60);
    return modal(`<div class="fm-stickers">${list.slice(0, 4).map((k, j) => `<span class="fm-sticker" style="--r:${[-8, 6, -3, 9][j]}deg">${cropIco(k)}</span>`).join("")}</div>
      <div class="fm-modal__title is-center">${one ? `도감에 ${jo(one.n, "이", "가")} 올랐어요` : `도감에 ${list.length}종이 올랐어요`}</div>
      <p class="fm-sub is-center">처음 거둔 작물은 경험치를 더 받아요 · 도감 ${after}/${CROPS.length}</p>
      <ul class="fm-list">${list.map((k) => `<li>${cropIco(k)}<span><b>${CROP[k].n}</b> — 경험치 +${10 + CROP[k].xp}</span></li>`).join("")}
      ${miles.map((m) => `<li class="is-warn"><span class="fm-li-ico">${ic("award", 18)}</span><span>도감 ${m.n}종 보너스 — <b>${m.txt}</b> (계속 적용돼요)</span></li>`).join("")}</ul>
      <div class="fm-modal__btns"><button type="button" class="mgx-btn is-lg is-wide" data-m="ok">좋아요</button></div>`);
  }
  function donePopup() {
    const days = S.stats.start ? Math.max(1, Math.ceil((store.now() - S.stats.start) / 86400e3)) : 1;
    setTimeout(() => { party(120); setTimeout(() => party(80), 700); }, 60);
    return modal(`<div class="fm-burst is-gold"><div class="fm-burst__rays"></div>${planterSvg("watermelon", 3, "fm-planter is-hero")}</div>
      <div class="fm-modal__title is-center">1차 완주를 축하해요!</div>
      <p class="fm-sub is-center">텃밭 레벨 15, 밭 25칸 — 옥상이 온통 초록이에요.<br>앞으로도 계속 가꾸고 주문을 채울 수 있어요.</p>
      <div class="fm-stats3"><div><b>${num(days)}일</b><small>가꾼 날</small></div><div><b>${num(S.stats.harv)}번</b><small>거둔 횟수</small></div><div><b>${num(S.stats.orders)}장</b><small>끝낸 주문</small></div></div>
      <ul class="fm-list"><li><span class="fm-li-ico">${coinSvg(18)}</span><span>모두 번 돈 <b>${won(S.stats.earned)}</b></span></li><li><span class="fm-li-ico">${ic("book-open", 18)}</span><span>도감 <b>${dexCount()}/${CROPS.length}</b></span></li></ul>
      <div class="fm-modal__btns"><button type="button" class="mgx-btn is-gold is-lg is-wide" data-m="ok">계속 가꾸기</button></div>`, "is-party");
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
    const hero = grown.length ? `<div class="fm-stickers">${grown.slice(0, 4).map(([k], j) => `<span class="fm-sticker" style="--r:${[-8, 6, -3, 9][j]}deg">${cropIco(k)}</span>`).join("")}</div>` : `<div class="fm-modal__hero">${planterSvg("lettuce", 1)}</div>`;
    return modal(`${hero}<div class="fm-modal__title is-center">자리 비운 동안</div><p class="fm-sub is-center">옥상 텃밭은 그동안에도 조용히 자랐어요.</p><ul class="fm-list">${rows.join("")}</ul>
      <div class="fm-modal__btns">${ready ? `<button type="button" class="mgx-btn is-gold is-lg" data-m="harvest">${ic("hand", 18)} 모두 거두기 (${ready}칸)</button>` : ""}<button type="button" class="mgx-btn is-lg ${ready ? "is-white" : ""}" data-m="ok">확인</button></div>`)
      .then((v) => { if (v === "harvest") doHarvestAll(); });
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
      { ico: planterSvg("lettuce", 1, "fm-planter is-hero"), h: "씨앗을 심어요", p: "빈 화단을 누르면 고른 씨앗이 바로 심어져요. 「모두 심기」로 빈 칸을 한 번에 채울 수도 있어요." },
      { ico: planterSvg("tomato", 3, "fm-planter is-hero"), h: "다 자라면 거둬요", p: "실제 시간으로 자라요. 출근 전에 심고 점심 · 퇴근 후에 거두세요. 자리 비운 동안에도 8시간까지 자라고, 다 자라도 시들지 않아요." },
      { ico: `<span class="fm-tut-art">${ART.crate}${ART.memo}${ART.can}</span>`, h: "팔고, 주문을 채우고, 넓혀요", p: "거둔 작물은 창고에 쌓여요. 팔거나 동료 주문에 쓰면 돈과 경험치를 받아요. 레벨이 오르면 새 작물 · 밭 · 도구가 열려요." },
    ];
    let i = 0;
    const ov = document.createElement("div");
    ov.className = "fm-ov mgx fm-theme";
    const draw = () => {
      const s = steps[i];
      ov.innerHTML = `<div class="fm-modal" role="dialog" aria-modal="true"><button type="button" class="fm-x" data-esc-close aria-label="닫기">${ic("x", 20)}</button>
        <div class="fm-steps">${steps.map((_, j) => `<i class="${j === i ? "is-on" : ""}"></i>`).join("")}</div>
        <div class="fm-modal__hero is-big">${s.ico}</div><div class="fm-modal__title is-center">${s.h}</div><p class="fm-sub is-center">${s.p}</p>
        <div class="fm-modal__btns">${i ? `<button type="button" class="mgx-btn is-white is-lg" data-t="prev">이전</button>` : `<button type="button" class="mgx-btn is-white is-lg" data-t="close">건너뛰기</button>`}
        <button type="button" class="mgx-btn is-lg" data-t="${i === steps.length - 1 ? "close" : "next"}">${i === steps.length - 1 ? "시작하기" : "다음"}</button></div></div>`;
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
    document.body.appendChild(ov);
    draw();
  }
  function help() {
    return modal(`<div class="fm-modal__title">옥상 텃밭 도움말</div><div class="fm-help">
      <h3>하루 리듬</h3><ul><li>출근 전에 심고, 점심 · 퇴근 후에 거둬요. 업무 시간에는 들어올 수 없지만 작물은 계속 자라요.</li>
      <li>자리 비운 동안은 <b>8시간</b>까지만 자라요. 그 뒤로는 멈춰 기다려요. 밤에는 8시간짜리 딸기가 딱 맞아요.</li>
      <li>다 자란 작물은 시들지 않아요. 언제 와도 손해가 없어요.</li></ul>
      <h3>밭과 창고</h3><ul><li>빈 칸을 누르면 고른 씨앗을 심고, 다 자란 칸(말풍선)을 누르면 거둬요. 자라는 칸을 누르면 남은 시간을 볼 수 있어요.</li>
      <li>거둔 작물은 창고에 쌓여요. 창고가 가득 차면 거둘 수 없으니 팔거나 창고를 넓혀요.</li>
      <li>밭은 레벨과 돈으로 넓혀요. 처음 3×3에서 5×5(25칸)까지.</li></ul>
      <h3>주문 · 오늘의 일</h3><ul><li>동료 주문을 채우면 그냥 팔 때보다 돈을 더 받고 경험치도 받아요. 끝내거나 넘기면 ${dur(ORDER_WAIT)} 뒤 새 주문이 와요.</li>
      <li>「오늘의 작물」은 하루 동안 판매가가 2배예요. 「오늘의 일」을 끝내면 작은 보너스를 받아요. 놓쳐도 손해는 없어요.</li></ul>
      <h3>도구 · 도감</h3><ul><li>물뿌리개는 자라는 시간을 줄이고, 비료는 수확량을 늘려요. 자동 물주기를 켠 칸은 거두면 같은 작물을 저절로 다시 심어요.</li>
      <li>처음 거둔 작물은 도감에 올라가요. 3 · 6 · 9 · 12종을 모으면 계속 적용되는 보너스를 받아요.</li>
      <li>옥상의 물뿌리개 · 창고 상자 · 도감 책 · 주문판을 누르면 그 판이 바로 열려요.</li>
      <li>텃밭 레벨 15와 밭 25칸을 채우면 1차 완주예요.</li></ul></div>
      <div class="fm-modal__btns" style="margin-top:16px"><button type="button" class="mgx-btn is-white is-lg" data-m="tut">처음 안내 다시 보기</button><button type="button" class="mgx-btn is-lg" data-m="ok">닫기</button></div>`, "is-sheet")
      .then((v) => { if (v === "tut") tutorial(); });
  }
  function moreMenu() {
    return modal(`<div class="fm-modal__title">더보기</div>
      <div class="fm-menu"><button type="button" class="fm-menu__item" data-m="tut">${ic("graduation-cap", 20)}<span><b>처음 안내 다시 보기</b><small>심고 · 거두고 · 넓히는 방법</small></span></button>
      <button type="button" class="fm-menu__item is-danger" data-m="reset">${ic("rotate-ccw", 20)}<span><b>처음부터 다시</b><small>밭 · 창고 · 도구 · 도감 · 레벨을 모두 지워요</small></span></button></div>`, "is-sheet")
      .then((v) => { if (v === "tut") tutorial(); else if (v === "reset") resetAll(); });
  }

  // ══ 화면 ══════════════════════════════════════════════════
  const DOCK = [["seed", "씨앗", "seed"], ["shed", "창고", "crate"], ["orders", "주문", "memo"], ["tools", "도구", "can"], ["dex", "도감", "book"]];
  const topBar = (full) => `<div class="mgx-top fm-top">
      <a class="mgx-top__back" href="/manage">${ic("chevron-left", 18)}매니지먼트</a>
      <div class="mgx-top__title"><span class="fm-logo">${markSvg}</span><span class="fm-top__name">${TITLE}</span>${full ? `<span class="mgx-chip" id="fm-lvchip"></span><span id="fm-donebadge"></span>` : ""}</div>
      ${full ? `<div class="mgx-top__actions">${window.HKMgmtMusic ? HKMgmtMusic.buttonHtml() : ""}<button type="button" class="mgx-icon" data-act="help" aria-label="도움말">${ic("circle-help", 20)}</button><button type="button" class="mgx-icon" data-act="more" aria-label="더보기">${ic("ellipsis", 20)}</button></div>` : ""}
    </div>`;
  function showMessage(html) {
    root.innerHTML = topBar(false) + `<div class="fm-msg">${html}</div>`;
    HKUI.refreshIcons(root);
  }
  function build() {
    root.innerHTML = topBar(true) + `
      <div class="fm-main">
        <div class="fm-left">
          <div class="mgx-stage fm-stage" id="fm-stage" role="region" aria-label="옥상 텃밭 장면">
            <div class="fm-sky" aria-hidden="true"><i class="fm-orb"></i><i class="fm-stars"></i>
              <svg class="fm-cloud is-1" viewBox="0 0 120 40"><path d="M14 34 Q2 34 4 24 Q6 15 18 17 Q22 4 38 6 Q52 0 62 12 Q76 6 84 18 Q100 14 104 26 Q116 26 114 34Z" fill="#fff"/></svg>
              <svg class="fm-cloud is-2" viewBox="0 0 120 40"><path d="M14 34 Q2 34 4 24 Q6 15 18 17 Q22 4 38 6 Q52 0 62 12 Q76 6 84 18 Q100 14 104 26 Q116 26 114 34Z" fill="#fff"/></svg>
              <svg class="fm-cloud is-3" viewBox="0 0 120 40"><path d="M14 34 Q2 34 4 24 Q6 15 18 17 Q22 4 38 6 Q52 0 62 12 Q76 6 84 18 Q100 14 104 26 Q116 26 114 34Z" fill="#fff"/></svg>
              <svg class="fm-birds" viewBox="0 0 60 24"><g stroke="#334155" stroke-width="2" fill="none" stroke-linecap="round"><path class="fm-wing" d="M2 10 Q7 4 12 10 Q17 4 22 10"/><path class="fm-wing" d="M24 18 Q28 13 32 18 Q36 13 40 18"/><path class="fm-wing" d="M40 6 Q44 1 48 6 Q52 1 56 6"/></g></svg>
            </div>
            <div class="mgx-hud fm-hud" id="fm-hud">
              <div class="mgx-pill fm-pill" id="fm-pill-lv" role="img"><span class="fm-ring"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" fill="#fff"/><circle cx="18" cy="18" r="13.5" fill="none" stroke="#e3efe2" stroke-width="4"/><circle id="fm-lvring" cx="18" cy="18" r="13.5" fill="none" stroke="#22b35e" stroke-width="4" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100" transform="rotate(-90 18 18)"/></svg><b id="fm-lvnum"></b></span><span class="fm-pill__txt"><small>레벨</small><em id="fm-xp"></em></span></div>
              <div class="mgx-pill fm-pill" id="fm-pill-money"><span class="fm-pill__art">${coinSvg(26)}</span><b id="fm-money"></b></div>
              <button type="button" class="mgx-pill fm-pill" id="fm-pill-shed" data-act="tab" data-tab="shed"><span class="fm-pill__art">${ART.crate}</span><b id="fm-shed"></b></button>
              <button type="button" class="mgx-pill fm-pill is-today" id="fm-pill-today" data-act="tab" data-tab="seed"></button>
            </div>
            <div class="fm-board" id="fm-board">
              <svg class="fm-board__svg" viewBox="0 0 ${BW} ${BH}"><defs><filter id="fm-blur" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="6"/></filter></defs>
                <g id="fm-back"></g>
                <g id="fm-cells">${DEPTH.map((i) => `<g class="fm-cell" data-i="${i}"></g>`).join("")}</g>
                <g id="fm-props"></g>
              </svg>
              <div class="fm-overlay" id="fm-overlay"></div>
              <i class="fm-butterfly" aria-hidden="true"><i><svg viewBox="0 0 24 20"><g class="fm-wings"><path d="M12 10 Q4 -2 1 5 Q0 11 12 10Z" fill="#f9a8d4"/><path d="M12 10 Q20 -2 23 5 Q24 11 12 10Z" fill="#f472b6"/><path d="M12 10 Q5 18 4 14 Q4 10 12 10Z" fill="#fbcfe8"/><path d="M12 10 Q19 18 20 14 Q20 10 12 10Z" fill="#f9a8d4"/></g><path d="M12 5 V15" stroke="#3b2a20" stroke-width="1.6" stroke-linecap="round"/></svg></i></i>
            </div>
          </div>
          <div class="fm-act">
            <div class="fm-strip" id="fm-strip" role="group" aria-label="심을 씨앗 고르기"></div>
            <div class="fm-act__btns" id="fm-btns"></div>
          </div>
        </div>
        <div class="fm-right">
          <div class="fm-quest" id="fm-today"></div>
          <div class="mgx-dock fm-dock" role="tablist" id="fm-tabs"></div>
          <div class="fm-panel" id="fm-panel"></div>
        </div>
      </div>`;
    lastSky = ""; lastBarSig = ""; lastTabSig = ""; lastStripSig = ""; lastPropSig = ""; lastMoney = null; lastLv = null; lastTodaySig = "";
    refresh();
    HKUI.refreshIcons(root);
  }
  function refresh() {
    drawHud();
    drawSky();
    drawField();
    drawProps();
    drawStrip();
    drawBar(true);
    drawToday();
    drawTabs(true);
    drawPanel();
    countdowns();
  }
  function drawHud() {
    const need = NEED[S.lv] || 0, max = S.lv >= MAX_LV, full = invTotal() >= cap();
    const f = max ? 1 : Math.min(1, S.xp / need);
    const $ = (id) => root.querySelector(id);
    $("#fm-lvring").setAttribute("stroke-dashoffset", String(f1(100 - f * 100)));
    $("#fm-lvnum").textContent = S.lv;
    $("#fm-xp").textContent = max ? "최고" : `${num(S.xp)}/${num(need)}`;
    $("#fm-pill-lv").setAttribute("aria-label", `텃밭 레벨 ${S.lv}${max ? " (최고 레벨)" : ` · 경험치 ${num(S.xp)} / ${num(need)}`}`);
    $("#fm-lvchip").textContent = `Lv ${S.lv}`;
    if (lastLv != null && S.lv > lastLv) { HKFx.bump($("#fm-pill-lv")); HKFx.bump($("#fm-lvchip")); }
    lastLv = S.lv;
    const m = $("#fm-money");
    if (lastMoney == null || lastMoney === S.money) m.textContent = num(S.money);
    else HKFx.count(m, lastMoney, S.money, { fmt: (v) => num(Math.round(v)) });
    lastMoney = S.money;
    $("#fm-pill-money").setAttribute("aria-label", `가진 돈 ${won(S.money)}`);
    const sp = $("#fm-pill-shed");
    sp.classList.toggle("is-full", full);
    $("#fm-shed").innerHTML = `${num(invTotal())}<small>/${num(cap())}</small>${full ? `<span class="fm-pill__warn">가득</span>` : ""}`;
    sp.setAttribute("aria-label", `창고 ${num(invTotal())} / ${num(cap())}${full ? " — 가득 찼어요" : ""}`);
    const d = S.daily, tsig = d ? d.crop : "";
    if (tsig !== lastTodaySig) {
      lastTodaySig = tsig;
      $("#fm-pill-today").innerHTML = d ? `<span class="fm-pill__art">${cropIco(d.crop)}</span><span class="fm-pill__txt"><small>오늘</small><em>×2</em></span>` : "";
      $("#fm-pill-today").setAttribute("aria-label", d ? `오늘의 작물 ${CROP[d.crop].n} — 판매가 2배` : "오늘의 작물");
    }
    $("#fm-donebadge").innerHTML = S.done ? `<span class="mgx-chip is-gold">1차 완주</span>` : "";
  }
  function drawSky() {
    const t = timeOf(hourKst(store.now()));
    if (t === lastSky) return;
    lastSky = t;
    const st = root.querySelector("#fm-stage");
    st.classList.remove("is-morning", "is-day", "is-evening", "is-night");
    st.classList.add(`is-${t}`);
    root.querySelector("#fm-back").innerHTML = backdropSvg(t);
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
    let changed = false;
    root.querySelectorAll("#fm-cells .fm-cell").forEach((g) => {
      const i = +g.dataset.i, sig = cellSig(i);
      if (g.dataset.sig === sig) return;
      const old = g.dataset.sig || "";
      g.dataset.sig = sig;
      changed = true;
      const [cx, cy] = cellFloor(i);
      g.removeAttribute("data-act"); g.removeAttribute("role"); g.removeAttribute("tabindex"); g.removeAttribute("aria-label");
      g.setAttribute("class", "fm-cell");
      if (!plotOpen(i)) {
        const k = 0.86, pts = P([[cx, cy - HH * k], [cx + HW * k, cy], [cx, cy + HH * k], [cx - HW * k, cy]]);
        if (i === nextPlotIdx()) {
          const r = nextPlotReq(), lvOk = S.lv >= r[0];
          g.setAttribute("class", `fm-cell is-next ${lvOk ? "" : "is-wait"}`);
          g.setAttribute("data-act", "plot"); g.setAttribute("role", "button"); g.setAttribute("tabindex", "0");
          g.setAttribute("aria-label", lvOk ? `밭 넓히기 ${won(r[1])}` : `텃밭 레벨 ${r[0]}부터 넓힐 수 있어요`);
          g.innerHTML = `<polygon class="fm-hit fm-nextpad" points="${pts}"/>`;
        } else {
          g.setAttribute("class", "fm-cell is-locked");
          g.innerHTML = `<polygon points="${pts}" fill="rgba(255,255,255,.22)" stroke="rgba(110,95,75,.32)" stroke-width="1.6" stroke-dasharray="5 4"/><g transform="translate(${cx} ${cy - 2})" opacity=".32"><rect x="-5" y="-2" width="10" height="8" rx="2" fill="#7c6f60"/><path d="M-3 -2 v-2.4 a3 3 0 0 1 6 0 V-2" stroke="#7c6f60" stroke-width="1.8" fill="none"/></g>`;
        }
        return;
      }
      const st = plotState(i), p = S.plots[i];
      g.setAttribute("data-act", "plot"); g.setAttribute("role", "button"); g.setAttribute("tabindex", "0");
      let ring = null;
      if (st.stage === -1) {
        g.classList.add("is-empty");
        g.setAttribute("aria-label", `빈 칸 — 눌러서 ${CROP[S.seed].n} 심기`);
      } else if (st.stage === 3) {
        g.classList.add("is-ready");
        g.setAttribute("aria-label", `${CROP[p.k].n} 다 자랐어요 — 눌러서 거두기`);
      } else {
        g.classList.add("is-grow");
        g.setAttribute("aria-label", `${CROP[p.k].n} 자라는 중 — 눌러서 남은 시간 보기`);
        ring = { p: p.p, d: p.d, cd: p.p + p.d, off: f1(100 - Math.min(1, (S.ft - p.p) / p.d) * 100) };
      }
      g.innerHTML = cellArt(i, cx, cy, st, { auto: S.autos.includes(i), seedN: i });
      if (old.startsWith("-1:") && sig.startsWith("0:")) { g.classList.add("is-fresh"); setTimeout(() => g.classList.remove("is-fresh"), 600); }
    });
    if (changed) drawOverlay();
  }
  // 장면 위 HTML — 다 자란 칸 말풍선 · 넓히기 표
  function drawOverlay() {
    let h = "", n = 0;
    DEPTH.forEach((i) => {
      const [cx, cy] = cellFloor(i);
      if (!plotOpen(i)) {
        if (i !== nextPlotIdx()) return;
        const r = nextPlotReq(), lvOk = S.lv >= r[0], money = S.money >= r[1];
        h += `<button type="button" class="fm-addtag ${lvOk ? (money ? "" : "is-poor") : "is-wait"}" style="${pct(cx, cy)}" data-act="plot" data-i="${i}" aria-label="${lvOk ? `밭 넓히기 ${won(r[1])}` : `텃밭 레벨 ${r[0]}부터 넓힐 수 있어요`}">
          <span class="fm-addtag__ic">${ic(lvOk ? "plus" : "lock", 16)}</span><span>${lvOk ? `${coinSvg(13)}${num(r[1])}` : `Lv ${r[0]}`}</span></button>`;
        return;
      }
      const p = S.plots[i];
      // 자라는 칸 — 남은 시간을 칸 아래에 바로 보여 준다(맨 위 층이라 앞줄 화단에 가리지 않는다)
      // 고리 + 시간 알약 — 자기 화단 흙 위(작물 바로 앞)에 겹쳐 올려, 어느 화단의 시간인지 바로 보이게
      if (p && p.p + p.d > S.ft) {
        const off = f1(100 - Math.min(1, (S.ft - p.p) / p.d) * 100);
        h += `<span class="fm-cdtag" style="${pct(cx, cy - BOX.h + 8)}"><svg class="fm-cdtag__ring" viewBox="-8 -8 16 16" aria-hidden="true"><circle r="5.6" fill="none" stroke="#e3efe2" stroke-width="2.8"/><circle r="5.6" fill="none" stroke="#22b35e" stroke-width="2.8" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="${off}" transform="rotate(-90)" data-ring="${p.p}" data-rd="${p.d}"/></svg><b data-cd="${p.p + p.d}">${dur(p.p + p.d - S.ft)}</b></span>`;
      }
      if (p && p.p + p.d <= S.ft) {
        h += `<button type="button" class="mgx-ready fm-bubble" style="${pct(cx, cy - BOX.h - 56)};animation-delay:-${((n++ * 0.31) % 1.6).toFixed(2)}s" data-act="plot" data-i="${i}" aria-label="${CROP[p.k].n} 거두기"><span>${cropIco(p.k)}</span></button>`;
      }
    });
    const el = root.querySelector("#fm-overlay");
    el.innerHTML = h;
    HKUI.refreshIcons(el);
  }
  function drawProps(force) {
    const sig = `${S.tools.can}|${S.tools.auto}|${S.tools.shed}|${Math.round(Math.min(1, invTotal() / cap()) * 9)}|${invTotal() >= cap()}|${Object.keys(S.inv).join()}|${invTotal()}|${dexCount()}|${S.orders.filter((o) => o.items).length}|${S.orders.filter(canDeliver).length}`;
    if (!force && sig === lastPropSig) return;
    lastPropSig = sig;
    root.querySelector("#fm-props").innerHTML = canProp(S.tools.can) + sprinklerProp(S.tools.auto) + crateProp() + bookProp() + boardProp();
  }
  function drawStrip() {
    const av = unlocked(), nxt = CROPS.find((c) => c.lv > S.lv);
    const sig = `${S.seed}|${S.lv}|${S.daily ? S.daily.crop : ""}|${av.map((c) => (S.money >= c.seed ? 1 : 0)).join("")}|${S.tools.can}|${dexCount() >= 12}`;
    if (sig === lastStripSig) return;
    lastStripSig = sig;
    const el = root.querySelector("#fm-strip");
    const keep = el.scrollLeft;
    el.innerHTML = av.map((c) => {
      const on = S.seed === c.k;
      return `<button type="button" class="fm-chipseed ${on ? "is-on" : ""} ${S.money >= c.seed ? "" : "is-poor"}" data-act="seed" data-k="${c.k}" aria-pressed="${on}" aria-label="${c.n} 씨앗 ${won(c.seed)} · ${dur(growTime(c.k))}">
        ${S.daily && S.daily.crop === c.k ? `<span class="fm-chipseed__x2">×2</span>` : ""}${cropIco(c.k)}<span class="fm-chipseed__n">${c.n}</span><span class="fm-chipseed__p">${coinSvg(12)}${num(c.seed)}</span></button>`;
    }).join("") + (nxt ? `<span class="fm-chipseed is-lock" aria-label="${nxt.n} — 레벨 ${nxt.lv}에 열려요">${cropIco(nxt.k)}<span class="fm-chipseed__n">Lv ${nxt.lv}</span><span class="fm-chipseed__p">${ic("lock", 11)}</span></span>` : "");
    el.scrollLeft = keep;
    HKUI.refreshIcons(el);
    const on = el.querySelector(".is-on");
    if (on && !keep) on.scrollIntoView({ block: "nearest", inline: "center" });
  }
  function drawBar(force) {
    const ready = readyIdx().length, empty = emptyIdx().length, c = CROP[S.seed];
    const sig = `${ready}|${empty}|${S.seed}|${S.money >= c.seed}`;
    if (!force && sig === lastBarSig) return;
    lastBarSig = sig;
    root.querySelector("#fm-btns").innerHTML = `
      <button type="button" class="mgx-btn is-gold is-lg fm-harvest ${ready ? "is-live" : ""}" data-act="harvestAll" ${ready ? "" : "disabled"}>${ART.crate}<span>모두 거두기</span><em>${ready}</em></button>
      <button type="button" class="mgx-btn is-lg fm-plantall" data-act="plantAll" ${empty ? "" : "disabled"}>${cropIco(S.seed)}<span>모두 심기</span><em>${empty}</em></button>`;
  }
  function drawToday() {
    const d = S.daily;
    if (!d) return;
    const c = CROP[d.crop], done = d.prog >= d.task.n;
    const el = root.querySelector("#fm-today");
    el.innerHTML = `
      <div class="fm-quest__crop">${cropIco(d.crop)}<span><small>오늘의 작물</small><b>${c.n}</b><em>${won(unitPrice(d.crop))} · 2배</em></span></div>
      <div class="fm-quest__task ${d.claimed ? "is-claimed" : done ? "is-done" : ""}">
        <span class="fm-quest__txt"><small>오늘의 텃밭 일</small><b>${dailyText(d)}</b>
        ${d.claimed ? `<em>받았어요. 내일 또 새 일이 와요.</em>` : `<span class="mgx-bar ${done ? "is-full" : ""}"><i style="--v:${f1((d.prog / d.task.n) * 100)}%"></i></span><em>${num(d.prog)}/${num(d.task.n)} · ${coinSvg(12)} ${num(d.money)} · ${starSvg(12)} ${d.xp}</em>`}</span>
        ${d.claimed ? `<span class="fm-quest__ok">${ic("check", 18)}</span>` : `<button type="button" class="mgx-btn is-sm ${done ? "is-gold" : ""}" data-act="claim" ${done ? "" : "disabled"}>받기</button>`}
      </div>`;
    HKUI.refreshIcons(el);
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
    root.querySelector("#fm-tabs").innerHTML = DOCK.map(([k, n, art]) => {
      let dot = "";
      if (k === "orders" && b.orders) dot = `<span class="mgx-dot">${b.orders}</span>`;
      if (k === "tools" && b.tools) dot = `<span class="mgx-dot is-pip"></span>`;
      if (k === "shed" && b.shed) dot = `<span class="mgx-dot is-pip"></span>`;
      return `<button type="button" class="mgx-tab fm-tab" role="tab" aria-selected="${S.tab === k}" data-act="tab" data-tab="${k}"><span class="fm-tab__art">${ART[art]}</span>${n}${dot}</button>`;
    }).join("");
  }
  function drawPanel() {
    const el = root.querySelector("#fm-panel");
    el.innerHTML = ({ seed: panelSeed, shed: panelShed, orders: panelOrders, tools: panelTools, dex: panelDex }[S.tab] || panelSeed)();
    HKUI.refreshIcons(el);
  }
  const panelHead = (title, sub, extra = "") => `<div class="fm-phead"><div><div class="fm-phead__t">${title}</div>${sub ? `<p>${sub}</p>` : ""}</div>${extra}</div>`;
  function panelSeed() {
    return panelHead("씨앗 봉투", "고른 씨앗은 빈 화단을 누르거나 「모두 심기」로 심어요.") + `<div class="fm-packs">` + CROPS.map((c) => {
      const lock = c.lv > S.lv, on = S.seed === c.k, today = S.daily && S.daily.crop === c.k;
      return `<button type="button" class="fm-pack ${on ? "is-on" : ""} ${lock ? "is-lock" : ""}" style="--pk:${CROP_COLOR[c.k]}" ${lock ? "disabled" : `data-act="seed" data-k="${c.k}"`} aria-pressed="${on}">
        <span class="fm-pack__zig"></span>
        ${today ? `<span class="fm-pack__ribbon">오늘 2배</span>` : ""}
        <span class="fm-pack__win">${cropIco(c.k)}</span>
        <b class="fm-pack__n">${c.n}</b>
        <span class="fm-pack__time">${ic("clock", 12)} ${dur(lock ? c.t : growTime(c.k))}</span>
        <span class="fm-pack__row"><span>${coinSvg(14)}<b>${num(c.seed)}</b></span><span class="fm-pack__yield">${lock ? c.y : yieldOf(c.k)}개 × ${won(lock ? c.p : unitPrice(c.k))}</span></span>
        <span class="fm-pack__xp">${starSvg(12)} 경험치 ${c.xp}</span>
        ${lock ? `<span class="fm-pack__lock">${ic("lock", 14)} 레벨 ${c.lv}</span>` : on ? `<span class="fm-pack__check">${ic("check", 16)}</span>` : ""}
      </button>`;
    }).join("") + `</div>`;
  }
  function panelShed() {
    const items = Object.entries(S.inv).filter(([, n]) => n > 0).sort((a, b) => CROPS.indexOf(CROP[a[0]]) - CROPS.indexOf(CROP[b[0]]));
    const need = {};
    S.orders.forEach((o) => (o.items || []).forEach((it) => { need[it.k] = (need[it.k] || 0) + it.n; }));
    const total = items.reduce((a, [k, n]) => a + n * unitPrice(k), 0);
    const t = TOOLS.shed, l = S.tools.shed, full = invTotal() >= cap();
    let out = panelHead("창고", full ? "가득 찼어요 — 팔거나 넓혀야 더 거둘 수 있어요." : `${num(cap() - invTotal())}개 더 들어가요.`);
    out += `<div class="mgx-card fm-capcard ${full ? "is-full" : ""}"><span class="fm-capcard__art">${ART.crate}</span><div class="fm-grow"><b>${num(invTotal())} <small>/ ${num(cap())}</small></b><span class="mgx-bar ${full ? "is-full" : ""}" style="--bar:#d98a3a"><i style="--v:${f1(Math.min(100, (invTotal() / cap()) * 100))}%"></i></span>
      <p>${l < t.cost.length ? `다음 단계 ${SHED_CAP[l + 1]}개 · ${won(t.cost[l])} · 레벨 ${t.lv[l]}` : "가장 큰 창고예요"}</p></div>
      ${l < t.cost.length ? `<button type="button" class="mgx-btn is-soft is-sm" data-act="tool" data-k="shed" ${S.lv >= t.lv[l] && S.money >= t.cost[l] ? "" : "disabled"}>넓히기</button>` : ""}</div>`;
    if (!items.length) return out + `<div class="fm-empty">${ART.crate}<b>창고가 비었어요</b><span>다 자란 화단의 말풍선을 눌러 거둬 보세요.</span></div>`;
    out += `<button type="button" class="mgx-btn is-gold is-lg is-wide fm-sellall" data-act="sellAll">${coinSvg(22)} 모두 팔기 <em>${won(total)}</em></button>`;
    return out + `<div class="fm-slots">` + items.map(([k, n]) => `<div class="fm-slot">
      <div class="fm-slot__top">${cropIco(k)}<span class="fm-slot__n">×${num(n)}</span>${S.daily && S.daily.crop === k ? `<span class="fm-slot__x2">2배</span>` : ""}</div>
      <b>${CROP[k].n}</b><small>한 개 ${won(unitPrice(k))}</small>${need[k] ? `<span class="mgx-chip fm-slot__need">주문에 ${need[k]}개</span>` : ""}
      <div class="fm-slot__btns"><button type="button" class="mgx-btn is-white is-sm" data-act="sell" data-k="${k}" data-n="1" aria-label="${CROP[k].n} 1개 팔기">1개</button><button type="button" class="mgx-btn is-soft is-sm" data-act="sell" data-k="${k}" data-n="all" aria-label="${CROP[k].n} 모두 팔기 ${won(n * unitPrice(k))}">모두</button></div></div>`).join("") + `</div>`;
  }
  function panelOrders() {
    const tilts = [-1.2, 0.9, -0.5], papers = ["#fff6bf", "#e6f7df", "#ffe6e1"];
    return panelHead("동료 주문", `채우면 그냥 팔 때보다 더 받아요. 끝내거나 넘기면 ${dur(ORDER_WAIT)} 뒤 새 주문이 와요.`) + S.orders.map((o, si) => {
      if (!o.items) return `<div class="fm-memo is-wait" style="--tilt:${tilts[si % 3]}deg">${ic("hourglass", 20)}<span>새 주문이 오고 있어요 · <b data-cd="${o.wait}">${dur(o.wait - S.ft)}</b></span></div>`;
      const ok = canDeliver(o);
      return `<div class="fm-memo ${ok ? "is-ok" : ""}" style="--tilt:${tilts[si % 3]}deg;--paper:${papers[si % 3]}"><span class="fm-memo__tape"></span>
        <div class="fm-memo__who">${faceSvg(o)}<div><b>${esc(o.dept)} ${esc(o.name)}</b><p>“${esc(o.line)}”</p></div></div>
        <div class="fm-memo__items">${o.items.map((it) => { const have = S.inv[it.k] || 0, done = have >= it.n; return `<span class="fm-need ${done ? "is-ok" : ""}">${cropIco(it.k)}<span><b>${CROP[it.k].n} ${it.n}</b><em>${Math.min(have, it.n)}/${it.n}</em></span>${done ? `<i>${ic("check", 12)}</i>` : ""}</span>`; }).join("")}</div>
        <div class="fm-memo__foot"><div class="fm-memo__reward"><span>${coinSvg(16)} ${won(o.money)}</span><span>${starSvg(15)} ${o.xp}</span></div>
          <button type="button" class="mgx-btn is-white is-sm" data-act="skip" data-i="${si}">넘기기</button><button type="button" class="mgx-btn is-sm" data-act="deliver" data-i="${si}" ${ok ? "" : "disabled"}>드리기</button></div></div>`;
    }).join("");
  }
  function panelTools() {
    const req = nextPlotReq();
    let out = panelHead("도구", "도구를 사면 옥상에도 놓여요.");
    if (req) {
      const can = S.lv >= req[0] && S.money >= req[1];
      out += `<div class="mgx-card fm-tool"><span class="fm-tool__art">${TOOL_ART.plot}</span><div class="fm-grow"><b>밭 넓히기 <span class="mgx-chip is-gray">${S.open} / 25칸</span></b>
        <p>다음 칸 · 텃밭 레벨 ${req[0]}${S.lv >= req[0] ? "" : "에 열려요"}</p></div><button type="button" class="mgx-btn is-sm fm-buy" data-act="expand" ${can ? "" : "disabled"}>${coinSvg(15)}${num(req[1])}</button></div>`;
    } else out += `<div class="mgx-card fm-tool"><span class="fm-tool__art">${TOOL_ART.plot}</span><div class="fm-grow"><b>밭 25칸 완성</b><p>옥상을 모두 텃밭으로 채웠어요.</p></div></div>`;
    out += TOOL_KEYS.map((tk) => {
      const t = TOOLS[tk], l = S.tools[tk], max = t.cost.length, maxed = l >= max;
      const can = !maxed && S.lv >= t.lv[l] && S.money >= t.cost[l];
      const dots = `<span class="fm-lvdots">${Array.from({ length: max }, (_, j) => `<i class="${j < l ? "is-on" : ""}"></i>`).join("")}</span>`;
      const extra = tk === "auto" && l ? `<br>자라는 칸을 눌러 켜요 · 지금 ${S.autos.length}/${autoMax()}칸` : "";
      return `<div class="mgx-card fm-tool ${l ? "" : "is-none"}"><span class="fm-tool__art" style="--tb:${t.bg}">${TOOL_ART[tk]}</span><div class="fm-grow"><b>${t.n} ${dots}</b>
        <p>${t.desc}<br>${l || tk === "shed" ? `지금 <b>${t.eff(l)}</b>${maxed ? " (최고 단계)" : ` → 다음 ${t.eff(l + 1)}`}` : `사면 <b>${t.eff(1)}</b>`}${extra}</p>
        ${maxed || S.lv >= t.lv[l] ? "" : `<span class="mgx-chip is-gray">${ic("lock", 12)} 텃밭 레벨 ${t.lv[l]}에 열려요</span>`}</div>
        ${maxed ? `<span class="mgx-chip is-good">최고</span>` : `<button type="button" class="mgx-btn is-sm fm-buy" data-act="tool" data-k="${tk}" ${can ? "" : "disabled"} aria-label="${t.n} ${l + 1}단계 사기 ${won(t.cost[l])}">${coinSvg(15)}${num(t.cost[l])}</button>`}</div>`;
    }).join("");
    return out;
  }
  function panelDex() {
    const n = dexCount();
    const track = `<div class="fm-track"><span class="mgx-bar"><i style="--v:${f1((n / CROPS.length) * 100)}%"></i></span>${DEX_MILES.map((m) => `<span class="fm-track__node ${n >= m.n ? "is-on" : ""}" style="left:${(m.n / CROPS.length) * 100}%">${n >= m.n ? ic("check", 12) : m.n}</span>`).join("")}</div>`;
    return panelHead(`작물 도감 <span class="mgx-chip">${n} / ${CROPS.length}</span>`, "처음 거둔 작물이 스티커로 붙어요.") + `<div class="fm-book">${track}
      <div class="fm-miles">${DEX_MILES.map((m) => `<div class="fm-mile ${n >= m.n ? "is-on" : ""}"><i>${n >= m.n ? ic("check", 12) : m.n}</i>${m.n}종 — ${m.txt}</div>`).join("")}</div>
      <div class="fm-dex">${CROPS.map((c, j) => {
        const got = S.dex[c.k];
        return `<div class="fm-dexcard ${got ? "is-got" : ""}" style="--r:${[-5, 4, -2, 6, -4, 3][j % 6]}deg"><span class="fm-dexcard__slot">${cropIco(c.k)}${got ? "" : `<i>?</i>`}</span><b>${got ? c.n : "???"}</b><small>${got ? `${num(got)}개 거둠` : c.lv > S.lv ? `레벨 ${c.lv}` : "아직이에요"}</small></div>`;
      }).join("")}</div></div>`;
  }
  // 남은 시간 글자 — data-cd="텃밭 시계 목표(초)" · 남은 시간 고리 — data-ring="심은 시각" data-rd="자라는 시간"
  function countdowns() {
    document.querySelectorAll("[data-cd]").forEach((el) => {
      const left = +el.dataset.cd - S.ft;
      el.textContent = left > 0 ? dur(left) : "곧";
    });
    document.querySelectorAll("[data-ring]").forEach((el) => {
      const f = Math.max(0, Math.min(1, (S.ft - +el.dataset.ring) / +el.dataset.rd));
      el.setAttribute("stroke-dashoffset", String(f1(100 - f * 100)));
    });
  }

  // ══ 반응(손맛) ═════════════════════════════════════════════
  const ptOf = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  const cellPt = (i) => ptOf(root.querySelector(`#fm-overlay [data-i="${i}"]`) || root.querySelector(`#fm-cells [data-i="${i}"] .fm-soil`) || root.querySelector(`#fm-cells [data-i="${i}"]`));
  function flyCrops(from, k, q) {
    if (!from) return;
    const crate = root.querySelector("#fm-prop-shed"), pill = root.querySelector("#fm-pill-shed");
    HKFx.float(from, `+${q}`, { color: "#158a45" });
    HKFx.fly(from, crate || pill, { n: Math.min(6, Math.max(2, q)), color: ballOf(k), done: () => HKFx.bump(pill) });
  }
  function flyCoins(from, gain) {
    const pill = root.querySelector("#fm-pill-money");
    if (gain <= 0 || !pill) return;
    HKFx.fly(from, pill, { n: Math.min(10, 3 + Math.floor(gain / 60)) });
    HKFx.float(pill, `+${won(gain)}`, { color: "#c27c00", dy: 24 });
  }
  function spendFx(cost) {
    const pill = root.querySelector("#fm-pill-money");
    if (cost > 0 && pill) { HKFx.float(pill, `−${won(cost)}`, { color: "#e5484d", dy: 24 }); HKFx.bump(pill); }
  }
  function doHarvestAll() {
    const pts = readyIdx().slice(0, 8).map((i) => ({ i, k: S.plots[i].k, pt: cellPt(i) }));
    harvestAll();
    pts.forEach(({ i, k, pt }, j) => {
      const p = S.plots[i];
      if (!p || p.p + p.d > S.ft) setTimeout(() => flyCrops(pt, k, yieldOf(k)), j * 70);
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
    if (newDay || ordersChanged) { store.dirty(); drawToday(); drawHud(); drawStrip(); drawProps(); if (S.tab === "orders" || S.tab === "shed" || S.tab === "seed") drawPanel(); }
    drawSky();
    drawField();
    drawBar(false);
    drawTabs(false);
    countdowns();
    // 5분마다 한 번은 저장(오래 켜 둔 동안의 시계)
    if (++ticksSinceSave >= 300) { ticksSinceSave = 0; store.dirty(); }
  }

  async function onClick(e) {
    const b = e.target.closest("[data-act]");
    if (!b || b.disabled || !root.contains(b)) return;
    const a = b.dataset.act;
    const m0 = S.money, from = ptOf(b);
    if (a === "plot") {
      const i = +b.dataset.i, st = plotOpen(i) ? plotState(i) : null;
      if (st && st.stage === 3) {
        const pt = cellPt(i), h0 = S.stats.harv;
        await onPlot(i);
        if (S.stats.harv > h0) flyCrops(pt, st.k, yieldOf(st.k));
      } else {
        const opened = S.open;
        await onPlot(i);
        if (S.open > opened) {
          spendFx(m0 - S.money);
          const g = root.querySelector(`#fm-cells [data-i="${i}"]`);
          if (g) { g.classList.add("is-fresh"); setTimeout(() => g.classList.remove("is-fresh"), 600); }
          const p = cellPt(i);
          if (p) HKFx.confetti({ x: p.x, y: p.y, n: 36 });
        }
      }
    } else if (a === "harvestAll") doHarvestAll();
    else if (a === "plantAll") { plantAll(); if (S.money < m0) spendFx(m0 - S.money); }
    else if (a === "tab") {
      S.tab = b.dataset.tab;
      store.dirty();
      drawTabs(true); drawPanel();
      if (!b.closest("#fm-tabs") && b.classList.contains("fm-prop")) HKFx.bump(b);
      if (matchMedia("(max-width: 959px)").matches) { // 패널이 화면 아래에 있을 때만 내려서 보여 준다(위로는 올리지 않는다)
        const r = root.querySelector("#fm-panel").getBoundingClientRect();
        if (r.top > innerHeight * 0.55) root.querySelector("#fm-panel").scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
      }
    } else if (a === "seed") {
      S.seed = b.dataset.k; store.dirty(); drawStrip(); drawBar(true); drawField();
      if (S.tab === "seed") drawPanel();
      HKUI.toast(`이제 빈 칸을 누르면 ${jo(CROP[S.seed].n, "을", "를")} 심어요`);
    }
    else if (a === "sell") { sell(b.dataset.k, b.dataset.n === "all" ? Infinity : +b.dataset.n); flyCoins(from, S.money - m0); }
    else if (a === "sellAll") { await sellAll(); flyCoins(from, S.money - m0); }
    else if (a === "deliver") { deliver(+b.dataset.i); if (S.money > m0) { flyCoins(from, S.money - m0); HKFx.confetti({ x: from.x, y: from.y, n: 28 }); } }
    else if (a === "skip") skipOrder(+b.dataset.i);
    else if (a === "tool") {
      const tk = b.dataset.k, l0 = S.tools[tk];
      buyTool(tk);
      if (S.tools[tk] > l0) {
        spendFx(m0 - S.money);
        const prop = root.querySelector(`#fm-prop-${tk}`);
        if (prop) HKFx.bump(prop);
        HKFx.confetti({ x: from.x, y: from.y, n: 24 });
      }
    }
    else if (a === "expand") { const o = S.open; await expand(); if (S.open > o) spendFx(m0 - S.money); }
    else if (a === "claim") { claimDaily(); flyCoins(from, S.money - m0); }
    else if (a === "help") help();
    else if (a === "more") moreMenu();
    else if (a === "reset") resetAll();
  }
  // 장면 속 칸 · 소품(svg)은 단추가 아니라서 Enter · 스페이스를 따로 받는다
  function onKey(e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    const t = e.target;
    if (!(t instanceof SVGElement) || !t.matches("[data-act][role=button]")) return;
    e.preventDefault();
    onClick({ target: t });
  }

  async function mount(container) {
    root = container;
    try {
      store = await HKMgmt.open(KEY, {
        blank,
        onStale: (st) => { S = fix(st); advance(store.now()); ensureDaily(store.now()); ensureOrders(); build(); HKUI.toast("다른 창에서 바뀐 내용을 불러왔어요"); },
        onClosed: (opensAt) => { clearInterval(tickTimer); S = null; showMessage(HKMgmt.closedHtml(opensAt, TITLE)); },
      });
    } catch (e) {
      if (e && e.closed) { showMessage(HKMgmt.closedHtml(e.opensAt, TITLE)); return; }
      showMessage(`<div class="fm-empty">${ART.crate}<b>텃밭을 불러오지 못했어요</b><span>잠시 뒤 다시 들어와 주세요.<br><small>${esc(e && e.message)}</small></span></div>`);
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
    root.addEventListener("keydown", onKey);
    // 화면이 안 보이면 장면 움직임도 멈춘다
    document.addEventListener("visibilitychange", () => root.classList.toggle("is-paused", document.hidden));
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
