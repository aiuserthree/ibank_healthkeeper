/**
 * 비타민 특공대 — 레트로 오락실 런앤건 슈팅 (web/games/vitamin.html 이 부른다)
 *
 * HKVitamin.setup(stage, ctx) — HKPlay.mountGame 의 setup 그대로
 *  - 384×216 캔버스에 그리고 CSS 로 키운다(pixelated). 그림 · 소리 모두 코드로 만든다
 *  - 모던 픽셀: 스테이지별 팔레트(색조 이동 명암) · 5겹 시차 + 앞가림 · 빛 번짐 · 림 라이트 · 색 보정 · 입자
 *  - 스프라이트는 처음 한 번 오프스크린 캔버스에 구워(외곽선 · 흰 번쩍 · 림 마스크까지) drawImage 로 그린다
 *  - 고정 간격(1/120초) 갱신 + requestAnimationFrame → 화면 주사율이 달라도 속도는 같다
 *  - 판이 끝나면 ctx.submit(score) 한 번
 */
(function () {
  "use strict";
  const W = 384, H = 216, DT = 1 / 120, BASE = 188;
  const GRAV = 900, RUN = 82, CRAWL = 30;
  // 주인공 점프 — 높이(약 69px)는 그대로, 더 빨리 튀어 오르고 빨리 내려온다(체공 약 0.77초 → 0.55초). 적 · 수류탄은 GRAV 그대로
  const JUMP_V = -470, P_GRAV = 1600, P_FALL = 1.2, P_SHORT = -230;
  const TICK = 1.5; // 남은 시간 1 이 줄어드는 실제 초
  const LIMIT = { pb: 48, eb: 70, enemies: 18, fx: 360 };
  const PTS = { sol: 100, germ: 150, drone: 200, para: 250, shield: 300, mortar: 300, turret: 400, mini: 100 };
  const WPN = {
    B: { name: "기본 블래스터", rate: 0.15, ammo: Infinity },
    S: { name: "퍼짐탄", rate: 0.24, ammo: 50 },
    L: { name: "레이저", rate: 0.16, ammo: 70 },
    F: { name: "불꽃", rate: 0.05, ammo: 220 },
  };
  const ITEM_NAME = { S: "퍼짐탄!", L: "레이저!", F: "불꽃!", G: "수류탄 +5" };

  // ───────────────────────── 색 ─────────────────────────
  // 재질마다 4~5단 램프 — 어두울수록 파랑 · 보라 쪽, 밝을수록 노랑 · 주황 쪽으로 색조를 옮긴다
  const INK = "#140c2a", CREAM = "#fff6e0";
  const C = {
    suit: ["#5c1f3a", "#a8323a", "#e8562e", "#ff8a3d", "#ffc070"], // 주인공 시그니처 — 비타민 주황
    teal: ["#142c4a", "#1d6a7a", "#25b0a0", "#5ee6c8", "#c8fff0"],
    skin: ["#5a2a3a", "#a85a4a", "#e0946a", "#ffc896", "#ffe4c4"],
    navy: ["#140c2a", "#24204e", "#363c7a", "#4f60a8"],
    boot: ["#140c2a", "#2e1f3e", "#4a3050", "#6a4a62"],
    steel: ["#181a38", "#30386a", "#56659e", "#8fa2d0", "#d0dcf4"],
    hairM: ["#140c2a", "#2e1a2e", "#4a2a38", "#6a3c44"],
    hairF: ["#1a0e22", "#4a2030", "#7a3440", "#a85048"],
    caps: ["#1f3a2a", "#3f7a30", "#7cc040", "#c8f070"],
    bot: ["#140c2a", "#2a2560", "#43479a", "#6d78cc", "#aab6f0"], // 적 — 주인공 보색 계열 보라 강철
    virus: ["#13301f", "#1f6a36", "#3ea844", "#86e05a", "#d2ff9a"],
    pink: ["#5a0a30", "#b0185a", "#ff4f9a", "#ffa0c8", "#fff0f6"], // 공격 예고 · 적 탄
    gold: ["#4a2a10", "#9a5a10", "#e0a020", "#ffd650", "#fff2b0"],
    red: ["#3a0a1e", "#8a1830", "#e03048", "#ff7a6a", "#ffd0b8"],
    smoke: ["#2a2440", "#4a4466", "#78728e", "#aaa4b8"],
    fire: ["#7a1e2a", "#e0402a", "#ff8a2a", "#ffd04a", "#fff6c0"],
    shirt: ["#2a2a5a", "#7a86b8", "#c8d4ee", "#f4f6ff"],
    tie: ["#3a0a2a", "#8a1a4a", "#d0306a"],
    rope: ["#3a2010", "#8a5a2a", "#c89050"],
    magenta: ["#2a0a30", "#5a1a6a", "#9a2a9a", "#d050c0", "#ffa0ea"],
  };
  // 외곽선 표 — 칠한 색 → 그 램프의 가장 어두운 색 (선택적 외곽선)
  const DARK = new Map();
  function regRamp(r) { const d = hex(r[0]); r.forEach((c) => DARK.set(key3(hex(c)), d)); }
  function hex(h) {
    const n = parseInt(h.slice(1, 7), 16);
    return h.length === 4 ? [((n >> 8) & 15) * 17, ((n >> 4) & 15) * 17, (n & 15) * 17] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const key3 = (c) => (c[0] << 16) | (c[1] << 8) | c[2];
  const toHex = (c) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  const mix = (a, b, t) => { const x = hex(a), y = hex(b); return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]); };
  Object.values(C).forEach(regRamp);

  // 스테이지 팔레트 — 하늘 · 먼 겹 · 가까운 겹 · 바닥 · 단차 · 빛 · 색 보정
  const PAL = [
    { // 회사 앞 광장 — 맑은 아침
      sky: ["#2f86e8", "#3aa6ff", "#5cbaff", "#7fcbff", "#9fdcff", "#c4ebff", "#e4f6ff"],
      haze: "#b4ddff", hill: "#5a8ad0", city: "#3d5a9a", near: ["#2a3a7a", "#3f5aa0", "#6f90cc", "#a8c4ea", "#e4f0ff"],
      glass: ["#24407a", "#2f6ab0", "#4fa0e0", "#9fdcff", "#e4f6ff"],
      leaf: ["#16324a", "#1f6a4a", "#2bb34a", "#7be05a", "#d8ff8a"],
      trunk: ["#2a1a2a", "#5a3226", "#8a5032"],
      stone: ["#3a3060", "#7a7090", "#c0aa98", "#e4d0b0", "#fff0d0"],
      brick: ["#3a1830", "#7a2e32", "#b8503a", "#e07a4a"],
      soil: ["#2a1a2a", "#4a3038"],
      flower: ["#ff4f9a", "#ffd650", "#fff6e0"],
      grade: "#fff1de", vig: 0.28, rim: { side: -1, col: "#fff2c8", a: 0.55 }, glow: "#fff2b0",
    },
    { // 공장형 지하 주차장 — 차가운 청록 + 경고 노랑
      sky: ["#0a0f1a", "#0e1420", "#121a28", "#16202f", "#1b2738", "#213046", "#2a3d52"],
      haze: "#2a3d52", wall: ["#0e1420", "#1b2738", "#2a3d52", "#3f5a70", "#5f8296"],
      warn: ["#4a3a10", "#a07a10", "#ffcc33", "#fff0a0"], hot: ["#5a1a10", "#c03a20", "#ff5a36", "#ffb08a"],
      lamp: ["#3f5a70", "#9fc2cc", "#e6f1ef", "#fff6e0"],
      conc: ["#0e1420", "#1b2738", "#2a3d52", "#3f5a70", "#5f8296", "#9fc2cc"],
      grade: "#c4dce4", vig: 0.45, rim: { side: 0, col: "#b8f3ff", a: 0.8 }, glow: "#b8f3ff",
    },
    { // 바이러스 본부 옥상 — 노을에서 밤으로
      sky: ["#1a1033", "#2a1648", "#3a1c5c", "#6b2a75", "#a8366f", "#e0505f", "#ff7f50", "#ffb26b", "#ffe0a3"],
      haze: "#a8366f", far: "#45407a", city: "#2b2350",
      roof: ["#1a1033", "#2b2350", "#45407a", "#6b6299", "#a89cc8"],
      neonG: ["#1f6a36", "#3ea844", "#86e05a", "#d2ff9a"], neonP: ["#b0185a", "#ff4f9a", "#ffa0c8", "#fff0f6"],
      sun: ["#e0505f", "#ff7f50", "#ffb26b", "#ffe0a3", "#fff6e0"],
      grade: "#ffd2c0", vig: 0.42, rim: { side: 1, col: "#ffa860", a: 0.85 }, glow: "#ffb26b",
    },
  ];
  PAL.forEach((p) => Object.values(p).forEach((v) => { if (Array.isArray(v) && v.length >= 3 && typeof v[0] === "string") regRamp(v); }));

  // ───────────────────────── 스테이지 ─────────────────────────
  // ground: [시작 x, 땅 높이(옛 기준 184)] — 불러올 때 길이 · 높이를 고친다 / ev: [x, 종류, 수, 간격]
  const STAGES = [
    {
      name: "회사 앞 광장", boss: "감기 탱크", arena: 2300, diff: 1, tune: 0,
      ground: [[0, 184], [360, 172], [470, 184], [760, 176], [840, 166], [930, 176], [1010, 184], [1300, 172], [1420, 184], [1650, 170], [1780, 184], [2000, 174], [2120, 184]],
      ev: [
        [420, "sol"], [560, "sol", 2, 34], [620, "cap", "S"], [700, "germ"], [820, "drone"], [900, "para", 2, 70], [1000, "sol", 2, 38],
        [1180, "turret"], [1200, "germ", 2, 48], [1270, "cap", "G"],
        [1620, "lock", [[0, "sol", 2, 34], [1.6, "para", 2, 80], [3, "drone", 1], [4.4, "sol", 2, 34]]],
        [1690, "shield"], [1740, "cap", "L"], [1820, "germ", 2, 48], [1880, "sol", 2, 34], [1960, "drone", 2, 54], [2060, "para", 2, 70], [2100, "sol"],
        [2150, "turret"], [2250, "cap", "G"],
      ],
    },
    {
      name: "공장형 지하 주차장", boss: "독감 헬리콥터", arena: 2700, diff: 1.25, tune: 1,
      ground: [[0, 184], [300, 170], [420, 184], [600, 176], [700, 184], [900, 164], [1000, 176], [1080, 184], [1350, 170], [1500, 184], [1700, 168], [1820, 178], [1950, 184], [2250, 172], [2400, 184]],
      ev: [
        [380, "sol", 2, 34], [470, "germ"], [520, "cap", "F"], [640, "turret"], [700, "drone", 2, 54], [820, "shield"], [940, "mortar"],
        [1000, "para", 2, 60], [1060, "sol", 2, 34], [1150, "germ", 3, 42], [1210, "cap", "G"], [1300, "bsol"], [1420, "turret"],
        [1480, "lock", [[0, "sol", 3, 34], [1.2, "drone", 2, 60], [2.8, "shield", 1], [4, "para", 3, 60], [5.5, "germ", 2, 48]]],
        [1600, "cap", "S"], [1760, "mortar"], [1780, "sol", 2, 34], [1900, "drone", 2, 54], [2000, "shield"], [2080, "germ", 2, 48],
        [2200, "cap", "L"], [2300, "para", 3, 50], [2380, "turret"], [2450, "sol", 3, 34], [2560, "drone", 2, 54], [2620, "cap", "G"],
      ],
    },
    {
      name: "바이러스 본부 옥상", boss: "슈퍼 바이러스 메카", arena: 3000, diff: 1.5, tune: 2,
      ground: [[0, 184], [280, 172], [380, 160], [470, 172], [560, 184], [820, 170], [960, 184], [1200, 166], [1290, 176], [1400, 184], [1650, 172], [1760, 184], [2000, 168], [2100, 158], [2200, 170], [2300, 184], [2600, 174], [2720, 184]],
      ev: [
        [360, "sol", 2, 34], [420, "drone"], [480, "cap", "S"], [560, "germ", 2, 42], [700, "mortar"], [760, "para", 3, 50], [860, "shield"], [920, "turret"],
        [980, "sol", 2, 34], [1060, "bsol"], [1100, "drone", 2, 54], [1180, "cap", "F"], [1300, "germ", 3, 40],
        [1440, "lock", [[0, "shield", 1], [0.8, "sol", 3, 34], [2, "para", 3, 60], [3.5, "drone", 2, 54], [5, "germ", 2, 48], [6, "bsol", 2, 34]]],
        [1520, "mortar"], [1580, "cap", "G"], [1660, "turret"], [1700, "sol", 2, 34], [1800, "drone", 2, 54], [1900, "shield"], [1960, "para", 2, 60],
        [2050, "germ", 2, 48], [2150, "turret"], [2250, "cap", "L"], [2350, "sol", 3, 34], [2450, "mortar"], [2500, "drone", 3, 44],
        [2600, "para", 3, 50], [2700, "bsol", 2, 34], [2760, "shield"], [2880, "cap", "G"],
      ],
    },
  ];
  const PLACED = { cap: 1, turret: 1, mortar: 1 };
  // 길이 조절 — 지도를 한꺼번에 줄여 다 깨는 데 4~6분 / 단차는 큰 캐릭터에 맞춰 1.3배
  const LEN = [0.92, 0.86, 0.82];
  function scaled(i) {
    const def = STAGES[i], k = LEN[i];
    const sx = (x) => Math.round(x * k);
    return { ...def, arena: sx(def.arena), ground: def.ground.map(([x, y]) => [sx(x), BASE - Math.round((184 - y) * 1.3)]), ev: def.ev.map((e) => [sx(e[0]), ...e.slice(1)]) };
  }

  // ───────────────────────── 글자 ─────────────────────────
  const FONT = {
    "0": [14, 17, 19, 21, 25, 17, 14], "1": [4, 12, 4, 4, 4, 4, 14], "2": [14, 17, 1, 2, 4, 8, 31], "3": [31, 2, 4, 2, 1, 17, 14],
    "4": [2, 6, 10, 18, 31, 2, 2], "5": [31, 16, 30, 1, 1, 17, 14], "6": [6, 8, 16, 30, 17, 17, 14], "7": [31, 1, 2, 4, 8, 8, 8],
    "8": [14, 17, 17, 14, 17, 17, 14], "9": [14, 17, 17, 15, 1, 2, 12],
    A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14], D: [28, 18, 17, 17, 17, 18, 28],
    E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16], G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17],
    I: [14, 4, 4, 4, 4, 4, 14], J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
    M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16],
    Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17], S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
    U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
    Y: [17, 17, 17, 10, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
    "!": [4, 4, 4, 4, 4, 0, 4], "-": [0, 0, 0, 31, 0, 0, 0], ":": [0, 12, 12, 0, 12, 12, 0], ".": [0, 0, 0, 0, 0, 12, 12],
    "+": [0, 4, 4, 31, 4, 4, 0], "*": [0, 17, 10, 4, 10, 17, 0], ">": [8, 4, 2, 1, 2, 4, 8], "/": [1, 2, 2, 4, 8, 8, 16],
    ",": [0, 0, 0, 0, 12, 4, 8], "=": [0, 0, 31, 0, 31, 0, 0], " ": [0, 0, 0, 0, 0, 0, 0],
  };
  // 천 단위 쉼표 — 0으로 채운 점수도 자릿수 그대로 (00,001,234)
  const comma = (v) => String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const txtCache = new Map();
  function cacheGet(key, make) {
    let c = txtCache.get(key);
    if (!c) { if (txtCache.size > 300) txtCache.clear(); c = make(); txtCache.set(key, c); }
    return c;
  }
  const newCanvas = (w, h) => { const c = document.createElement("canvas"); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; };
  // 마스크 → 테두리 두른 글자 그림. color 는 한 색 또는 [위, (가운데), 아래] 그라데이션
  function maskToCanvas(mask, mw, mh, color, outline, thick, scale = 1) {
    const sm = scale > 1 ? scaleMask(mask, mw, mh, scale) : mask;
    mw *= scale; mh *= scale;
    const pad = outline ? thick : 0;
    const w = mw + pad * 2, h = mh + pad * 2 + (outline ? 1 : 0);
    const c = newCanvas(w, h);
    const cx = c.getContext("2d");
    const img = cx.createImageData(w, h);
    const d = img.data;
    const top = hex(Array.isArray(color) ? color[0] : color), bot = hex(Array.isArray(color) ? color[color.length - 1] : color);
    const mid = Array.isArray(color) && color.length > 2 ? hex(color[1]) : null;
    const ol = outline ? hex(outline) : null;
    let y0 = mh, y1 = 0;
    for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) if (sm[y * mw + x]) { if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const at = (x, y) => x >= 0 && y >= 0 && x < mw && y < mh && sm[y * mw + x];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const mx = x - pad, my = y - pad;
        let col = null;
        if (at(mx, my)) {
          const k = y1 > y0 ? Math.max(0, Math.min(1, (my - y0) / (y1 - y0))) : 0;
          if (mid) col = k < 0.5 ? lerp3(top, mid, k * 2) : lerp3(mid, bot, (k - 0.5) * 2);
          else col = lerp3(top, bot, k);
          if (scale > 1) col = col.map((v) => Math.round(v / 12) * 12); // 계단식 — 픽셀 느낌
        } else if (ol) {
          let near = false;
          for (let oy = -thick; oy <= thick + 1 && !near; oy++) for (let ox = -thick; ox <= thick; ox++) if (at(mx + ox, my - oy)) { near = true; break; }
          if (near) col = ol;
        }
        if (col) { const i = (y * w + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255; }
      }
    }
    cx.putImageData(img, 0, 0);
    return c;
  }
  const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  function scaleMask(m, w, h, s) {
    const o = new Uint8Array(w * s * h * s);
    for (let y = 0; y < h * s; y++) for (let x = 0; x < w * s; x++) o[y * w * s + x] = m[((y / s) | 0) * w + ((x / s) | 0)];
    return o;
  }
  function fontCanvas(str, color, scale, outline) {
    return cacheGet(`f|${str}|${color}|${scale}|${outline}`, () => {
      // 쉼표는 좁게(3칸) — 0으로 채운 점수에 쉼표가 들어가도 좁은 HUD 칸에 맞게
      const adv = (ch) => (ch === "," ? 3 : 6);
      let mw = -1;
      for (const ch of str) mw += adv(ch);
      const mh = 7;
      const mask = new Uint8Array(Math.max(1, mw) * mh);
      let ox = 0;
      for (const ch of str) {
        const gl = FONT[ch] || FONT[" "], sx = ch === "," ? -1 : 0;
        for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) if (gl[y] & (16 >> x) && x + sx >= 0) mask[y * mw + ox + x + sx] = 1;
        ox += adv(ch);
      }
      return maskToCanvas(mask, mw, mh, color, outline, 1, scale);
    });
  }
  // 한글 — 픽셀 글꼴 「갈무리」를 제 크기로 쓰고 흐린 점을 버린다 (못 받으면 기본 글꼴)
  let galmuri = false;
  const GSIZE = [[8, "Galmuri7"], [10, "Galmuri9"], [12, "Galmuri11"], [15, "Galmuri14"]];
  function kfont(size, bold) {
    if (galmuri) {
      const f = GSIZE.find(([s]) => s === size);
      if (f) return `${bold && size === 12 ? "700 " : ""}${size}px "${f[1]}"`;
    }
    return `800 ${size}px "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif`;
  }
  function kCanvas(str, size, color, outline, thick = 1, scale = 1, bold = true) {
    return cacheGet(`k|${str}|${size}|${color}|${outline}|${thick}|${scale}|${galmuri}|${bold}`, () => {
      const m = newCanvas(4, 4).getContext("2d", { willReadFrequently: true });
      const font = kfont(size, bold);
      m.font = font;
      const mw = Math.ceil(m.measureText(str).width) + 2, mh = size + 4;
      m.canvas.width = mw; m.canvas.height = mh;
      m.font = font; m.textBaseline = "middle"; m.fillStyle = "#000";
      m.fillText(str, 1, Math.round(mh / 2));
      const d = m.getImageData(0, 0, mw, mh).data;
      const mask = new Uint8Array(mw * mh);
      for (let i = 0; i < mw * mh; i++) mask[i] = d[i * 4 + 3] > 120 ? 1 : 0;
      return maskToCanvas(mask, mw, mh, color, outline, thick, scale);
    });
  }

  // ───────────────────────── 굽기 (스프라이트) ─────────────────────────
  function bctx(c) {
    const g = c.getContext("2d");
    const P = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), w, h); };
    const L = (x0, y0, x1, y1, w, col) => {
      x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      const o = w >> 1;
      g.fillStyle = col;
      for (;;) {
        g.fillRect(x0 - o, y0 - o, w, w);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
    };
    const D = (cx, cy, r, col) => {
      g.fillStyle = col;
      for (let dy = -r; dy <= r; dy++) { const w = Math.floor(Math.sqrt(r * r - dy * dy) + 0.5); g.fillRect(Math.round(cx - w), Math.round(cy + dy), w * 2 + 1, 1); }
    };
    // 빛 받는 공 — 왼쪽 위가 밝고 오른쪽 아래가 어둡다
    const Ball = (cx, cy, r, ramp) => {
      D(cx, cy, r, ramp[1]);
      D(cx - r * 0.18, cy - r * 0.18, Math.max(1, Math.round(r * 0.82)), ramp[2]);
      D(cx - r * 0.35, cy - r * 0.35, Math.max(1, Math.round(r * 0.5)), ramp[3]);
      if (ramp[4] && r >= 4) P(cx - r * 0.5, cy - r * 0.55, 2, 1, ramp[4]);
    };
    // 상자 — 위 · 왼쪽 밝게, 아래 · 오른쪽 어둡게
    const Box = (x, y, w, h, ramp, lit = 2) => {
      P(x, y, w, h, ramp[lit]);
      P(x, y, w, 1, ramp[lit + 1] || ramp[lit]); P(x, y, 1, h, ramp[lit + 1] || ramp[lit]);
      P(x, y + h - 1, w, 1, ramp[lit - 1]); P(x + w - 1, y + 1, 1, h - 1, ramp[lit - 1]);
    };
    return { g, P, L, D, Ball, Box };
  }
  // 선택적 외곽선 — 바깥 1px 를 이웃 색의 가장 어두운 단계로
  function outlinePass(c) {
    const g = c.getContext("2d", { willReadFrequently: true });
    const w = c.width, h = c.height;
    const img = g.getImageData(0, 0, w, h), d = img.data, o = new Uint8ClampedArray(d);
    const dflt = hex(INK);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3] > 0) continue;
      let src = -1;
      if (x > 0 && d[i - 4 + 3] > 0) src = i - 4;
      else if (x < w - 1 && d[i + 4 + 3] > 0) src = i + 4;
      else if (y > 0 && d[i - w * 4 + 3] > 0) src = i - w * 4;
      else if (y < h - 1 && d[i + w * 4 + 3] > 0) src = i + w * 4;
      if (src < 0) continue;
      const dk = DARK.get((d[src] << 16) | (d[src + 1] << 8) | d[src + 2]) || dflt;
      o[i] = dk[0]; o[i + 1] = dk[1]; o[i + 2] = dk[2]; o[i + 3] = 255;
    }
    g.putImageData(new ImageData(o, w, h), 0, 0);
  }
  function flipCanvas(c) { const f = newCanvas(c.width, c.height), g = f.getContext("2d"); g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(c, 0, 0); return f; }
  function silhouette(c, col) {
    const s = newCanvas(c.width, c.height), g = s.getContext("2d");
    g.drawImage(c, 0, 0); g.globalCompositeOperation = "source-in"; g.fillStyle = col; g.fillRect(0, 0, c.width, c.height);
    return s;
  }
  // 림 마스크 — 빛 쪽(side: 1 오른쪽, -1 왼쪽, 0 위) 외곽선 바로 안쪽 픽셀만
  function rimMask(c, side, col) {
    const g0 = c.getContext("2d", { willReadFrequently: true });
    const w = c.width, h = c.height, d = g0.getImageData(0, 0, w, h).data;
    const m = newCanvas(w, h), g = m.getContext("2d"), img = g.createImageData(w, h), o = img.data;
    const rc = hex(col);
    const ix = (x, y) => (y * w + x) * 4;
    const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[ix(x, y) + 3] > 0;
    const dx = side === 0 ? 0 : side, dy = side === 0 ? -1 : 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!solid(x, y)) continue;
      // 바로 옆(빛 쪽)은 외곽선, 그 너머는 빈칸인 픽셀 = 외곽선 안쪽 가장자리
      if (solid(x + dx, y + dy) && !solid(x + dx * 2, y + dy * 2)) { const i = ix(x, y); o[i] = rc[0]; o[i + 1] = rc[1]; o[i + 2] = rc[2]; o[i + 3] = 255; }
    }
    g.putImageData(img, 0, 0);
    return m;
  }
  // 스프라이트 = { c, f(좌우 반전), ax, ay(발 기준점) } + 필요할 때 흰 번쩍 · 림
  function bake(w, h, ax, ay, draw, noOutline) {
    const c = newCanvas(w, h);
    draw(bctx(c));
    if (!noOutline) outlinePass(c);
    return { c, f: flipCanvas(c), w, h, ax, ay, _w: null, _r: {} };
  }
  const whiteOf = (s, flip) => { if (!s._w) s._w = [silhouette(s.c, CREAM), silhouette(s.f, CREAM)]; return s._w[flip ? 1 : 0]; };
  const rimOf = (s, flip, side, col) => { const k = `${flip ? 1 : 0}${side}${col}`; if (!s._r[k]) s._r[k] = rimMask(flip ? s.f : s.c, side, col); return s._r[k]; };

  // 빛 번짐 스프라이트 — 원형 그라데이션을 미리 만들어 lighter 로 겹친다
  const glowCache = new Map();
  function glowSpr(col, r) {
    const k = col + r;
    let c = glowCache.get(k);
    if (!c) {
      c = newCanvas(r * 2, r * 2);
      const g = c.getContext("2d"), [R, G, B] = hex(col);
      const gr = g.createRadialGradient(r, r, 0, r, r, r);
      gr.addColorStop(0, `rgba(${R},${G},${B},0.9)`); gr.addColorStop(0.35, `rgba(${R},${G},${B},0.35)`); gr.addColorStop(1, `rgba(${R},${G},${B},0)`);
      g.fillStyle = gr; g.fillRect(0, 0, r * 2, r * 2);
      glowCache.set(k, c);
    }
    return c;
  }

  // ── 주인공 ── 몸(다리 · 몸통 · 머리)과 팔(총)을 따로 굽는다. 몸 캔버스 40×50, 발 기준점 (20, 47)
  const HX = 20, HY = 47;
  const RUNLEG = [[5, 8, 8, 17], [4, 9, 3, 18], [0, 9, -3, 18], [-3, 8, -9, 15], [2, 6, -4, 12], [7, 5, 5, 12]];
  function heroPoses() {
    const P = {};
    P.idle0 = { hy: -18, back: [-2, 9, -3, 18], front: [2, 9, 3, 18], bob: 0, lean: 0 };
    P.idle1 = { ...P.idle0, bob: 1 };
    for (let i = 0; i < 6; i++) P["run" + i] = { hy: -18, front: RUNLEG[i], back: RUNLEG[(i + 3) % 6], bob: i % 3 === 1 ? -1 : 0, lean: 1, swing: i };
    P.jumpU = { hy: -18, front: [6, 5, 4, 12], back: [-2, 8, -5, 16], bob: -1, lean: 0 };
    P.jumpD = { hy: -18, front: [4, 8, 6, 16], back: [-3, 9, -4, 17], bob: 0, lean: 0 };
    P.land = { hy: -15, front: [5, 7, 7, 15], back: [-5, 7, -7, 15], bob: 0, lean: 0, squash: 1 };
    P.crouch0 = { hy: -9, front: [7, 1, 7, 9], back: [-3, 8, -9, 9], bob: 0, lean: 2, crouch: 1 };
    P.crouch1 = { hy: -9, front: [8, 2, 9, 9], back: [-4, 8, -8, 9], bob: 0, lean: 2, crouch: 1 };
    P.hurt = { hy: -17, front: [5, 6, 9, 13], back: [-4, 7, -8, 15], bob: 0, lean: -2, hurt: 1 };
    return P;
  }
  function drawHeroBody(b, pose, who) {
    const { P, L } = b;
    const hy = pose.hy, bob = pose.bob, lean = pose.lean, ox = HX, oy = HY, hipY = oy + hy;
    const leg = (l, back) => {
      const [kx, ky, fx, fy] = l;
      const sx = ox + (back ? -1 : 1);
      L(sx, hipY, ox + kx, hipY + ky, 4, back ? C.navy[1] : C.navy[2]);
      L(ox + kx, hipY + ky, ox + fx, hipY + fy - 2, 4, back ? C.navy[1] : C.navy[2]);
      if (!back) L(sx - 1, hipY, ox + kx - 1, hipY + ky, 1, C.navy[3]);
      const bx = ox + fx - 2, by = hipY + fy - 3;
      P(bx, by, 6, 3, back ? C.boot[1] : C.boot[2]); P(bx, by, 6, 1, back ? C.boot[2] : C.boot[3]);
      P(bx + 4, by + 1, 2, 2, back ? C.boot[0] : C.boot[1]);
    };
    leg(pose.back, true);
    const th = pose.crouch ? 11 : 13, ty = hipY - th + bob, tx = ox - 5 + lean, tw = pose.squash ? 12 : 11;
    // 비타민 캡슐 등짐
    P(tx - 4, ty + 1, 5, th - 2, C.caps[2]); P(tx - 4, ty + 1, 2, th - 2, C.caps[3]); P(tx, ty + 1, 1, th - 2, C.caps[1]);
    P(tx - 4, ty, 5, 2, C.gold[3]); P(tx - 4, ty + th - 2, 5, 2, C.gold[2]);
    leg(pose.front, false);
    // 몸통 — 주황 특공복, 왼쪽 위 빛
    P(tx, ty, tw, th, C.suit[2]);
    P(tx, ty, 3, th, C.suit[3]); P(tx, ty, tw, 2, C.suit[3]); P(tx + 1, ty, 2, 1, C.suit[4]);
    P(tx + tw - 2, ty + 2, 2, th - 2, C.suit[1]);
    P(tx + 6, ty + 3, 1, 1, C.teal[3]); P(tx + 7, ty + 4, 1, 1, C.teal[3]); P(tx + 8, ty + 3, 1, 1, C.teal[3]);
    P(tx + 3, ty + 2, 1, th - 4, C.teal[2]);
    P(tx, hipY - 2 + bob, tw, 2, C.navy[1]); P(tx + 5, hipY - 2 + bob, 2, 2, C.gold[3]);
    // 머리
    const hx = tx + 1 + (pose.crouch ? 2 : 0) + (pose.hurt ? -2 : 0), hyy = ty - 10;
    P(hx, hyy + 2, 9, 8, C.skin[3]);
    P(hx, hyy + 6, 3, 4, C.skin[2]); P(hx + 6, hyy + 8, 3, 2, C.skin[2]);
    P(hx + 8, hyy + 3, 1, 5, C.skin[4]);
    P(hx + 7, hyy + 5, 1, 2, INK);
    P(hx + 6, hyy + 8, 2, 1, C.skin[1]);
    // 헬멧 — 청록, 이마 위 고글
    P(hx - 1, hyy - 1, 10, 4, C.teal[2]); P(hx - 1, hyy + 3, 3, 4, C.teal[2]);
    P(hx, hyy - 1, 7, 1, C.teal[3]); P(hx + 1, hyy - 1, 3, 1, C.teal[4]); P(hx - 1, hyy, 1, 6, C.teal[1]);
    P(hx + 3, hyy + 2, 6, 2, C.gold[3]); P(hx + 4, hyy + 2, 2, 1, C.gold[4]); P(hx + 8, hyy + 3, 1, 1, C.gold[2]);
    if (who) {
      const sw = pose.swing != null ? [0, 1, 1, 0, -1, -1][pose.swing] : pose.hurt ? 2 : 0;
      P(hx - 3, hyy + 2, 3, 3, C.hairF[2]); P(hx - 4 - sw, hyy + 4, 3, 5, C.hairF[2]); P(hx - 5 - sw, hyy + 8, 2, 2, C.hairF[1]);
      P(hx - 3, hyy + 2, 1, 2, C.hairF[3]);
    } else {
      P(hx + 2, hyy + 3, 1, 3, C.hairM[2]); P(hx - 1, hyy + 6, 2, 2, C.hairM[2]);
    }
    if (pose.hurt) { L(tx + 2, ty + 2, tx - 4, ty - 6, 3, C.suit[2]); L(tx + 8, ty + 2, tx + 13, ty - 6, 3, C.suit[2]); }
  }
  // 팔 · 총 — 조준 방향마다 (m = 총구 위치, 발 기준)
  const ARMS = {
    f: { s: [1, -30], e: [3, -25], h: [8, -26], gun: "h", g0: [6, -28], len: 14, m: [22, -26] },
    u: { s: [1, -30], e: [4, -35], h: [5, -40], gun: "v", g0: [3, -53], len: 14, m: [5, -55] },
    du: { s: [1, -30], e: [5, -33], h: [9, -36], gun: "du", g0: [8, -36], len: 9, m: [18, -46] },
    d: { s: [1, -30], e: [3, -25], h: [4, -20], gun: "vd", g0: [2, -20], len: 13, m: [4, -5] },
    dd: { s: [1, -30], e: [5, -26], h: [9, -23], gun: "dd", g0: [8, -22], len: 8, m: [17, -12] },
    cf: { s: [5, -19], e: [7, -15], h: [11, -16], gun: "h", g0: [9, -18], len: 14, m: [25, -16] },
  };
  function drawHeroArm(b, a) {
    const { P, L } = b;
    const X = (v) => HX + v, Y = (v) => HY + v;
    L(X(a.s[0]), Y(a.s[1]), X(a.e[0]), Y(a.e[1]), 3, C.suit[2]);
    const [gx, gy] = a.g0;
    if (a.gun === "h") {
      P(X(gx), Y(gy), a.len, 4, C.steel[2]); P(X(gx), Y(gy), a.len, 1, C.steel[3]); P(X(gx), Y(gy) + 3, a.len, 1, C.steel[1]);
      P(X(gx + a.len), Y(gy) + 1, 2, 2, C.steel[3]); P(X(gx + 3), Y(gy) - 1, 4, 1, C.gold[3]); P(X(gx + 4), Y(gy) - 2, 2, 1, C.gold[4]);
      P(X(gx + 2), Y(gy) + 4, 2, 3, C.steel[1]); P(X(gx + a.len - 3), Y(gy) + 1, 2, 2, C.teal[3]);
    } else if (a.gun === "v" || a.gun === "vd") {
      P(X(gx), Y(gy), 4, a.len, C.steel[2]); P(X(gx), Y(gy), 1, a.len, C.steel[3]); P(X(gx) + 3, Y(gy), 1, a.len, C.steel[1]);
      const tip = a.gun === "v" ? Y(gy) - 2 : Y(gy) + a.len;
      P(X(gx) + 1, tip, 2, 2, C.steel[3]); P(X(gx) - 1, Y(gy) + 4, 1, 4, C.gold[3]);
      P(X(gx) + 1, a.gun === "v" ? Y(gy) + 2 : Y(gy) + a.len - 4, 2, 2, C.teal[3]);
    } else {
      const dy = a.gun === "du" ? -1 : 1;
      const x1 = gx + a.len, y1 = gy + a.len * dy;
      L(X(gx), Y(gy), X(x1), Y(y1), 4, C.steel[2]);
      L(X(gx) - 1, Y(gy) - 1, X(x1) - 1, Y(y1) - 1, 1, C.steel[3]);
      P(X(x1) + 1, Y(y1) + (dy < 0 ? -2 : 1), 2, 2, C.steel[3]);
      P(X(gx + 3), Y(gy + 3 * dy) - 2, 2, 2, C.teal[3]);
    }
    L(X(a.e[0]), Y(a.e[1]), X(a.h[0]), Y(a.h[1]), 3, C.suit[1]);
    P(X(a.h[0]) - 1, Y(a.h[1]) - 1, 3, 3, C.teal[1]); P(X(a.h[0]) - 1, Y(a.h[1]) - 1, 2, 1, C.teal[2]);
  }
  const HERO = [null, null];
  function heroSprites(who) {
    if (HERO[who]) return HERO[who];
    const poses = heroPoses(), body = {}, arm = {};
    for (const k in poses) body[k] = Object.assign(bake(40, 50, HX, HY, (b) => drawHeroBody(b, poses[k], who)), { pose: poses[k] });
    for (const k in ARMS) arm[k] = bake(40, 72, HX, HY + 10, (b) => { b.g.translate(0, 10); drawHeroArm(b, ARMS[k]); });
    HERO[who] = { body, arm };
    return HERO[who];
  }

  // ── 적 ──
  const SPR = {};
  function virusDome(b, cx, cy, r, ramp, rot = 0, eye = "#ffd650") {
    const { P, L, Ball } = b;
    for (let k = 0; k < 8; k++) {
      const a = rot + (k / 8) * Math.PI * 2;
      L(cx + Math.cos(a) * r, cy + Math.sin(a) * r, cx + Math.cos(a) * (r + 3), cy + Math.sin(a) * (r + 3), 1, ramp[1]);
      P(cx + Math.cos(a) * (r + 3) - 1, cy + Math.sin(a) * (r + 3) - 1, 2, 2, ramp[3]);
    }
    Ball(cx, cy, r, ramp);
    if (eye) { P(cx - 1, cy - 1, r + 1, 3, INK); P(cx + r - 3, cy - 1, 2, 2, eye); }
  }
  function bakeEnemies() {
    // 병사 로봇 — 걷기 4 · 조준 1 (조준은 눈이 핫핑크)
    const solLeg = [[4, 14, -3, 15], [2, 15, 0, 15], [-2, 15, 3, 14], [0, 15, 1, 15]];
    const sol = (b, fr, aim, fall) => {
      const { P, L, Box } = b;
      const ox = 18, oy = 42, hip = oy - 15;
      const [fx, fy, bx, by] = fall ? [3, 13, -4, 13] : solLeg[fr];
      L(ox - 1, hip, ox + bx, hip + by - 1, 4, C.bot[1]); P(ox + bx - 2, hip + by - 2, 5, 3, C.navy[1]);
      L(ox + 1, hip, ox + fx, hip + fy - 1, 4, C.bot[2]); P(ox + fx - 2, hip + fy - 2, 6, 3, C.bot[1]); P(ox + fx - 2, hip + fy - 2, 6, 1, C.bot[3]);
      Box(ox - 6, hip - 12, 13, 13, C.bot, 2);
      P(ox - 4, hip - 9, 4, 4, C.virus[3]); P(ox - 4, hip - 9, 2, 2, C.virus[4]);
      P(ox - 7, hip - 13, 5, 4, C.bot[3]); P(ox + 3, hip - 13, 5, 4, C.bot[2]);
      virusDome(b, ox + 1, hip - 19, 6, C.virus, fr * 0.2, aim ? C.pink[2] : C.gold[3]);
      if (fall) { L(ox - 5, hip - 12, ox - 9, hip - 22, 2, C.bot[2]); L(ox + 6, hip - 12, ox + 10, hip - 22, 2, C.bot[2]); return; }
      if (aim) { P(ox + 2, hip - 11, 14, 4, C.steel[1]); P(ox + 2, hip - 11, 14, 1, C.steel[2]); P(ox + 15, hip - 10, 2, 2, C.pink[3]); P(ox + 3, hip - 7, 3, 3, C.bot[1]); }
      else { L(ox + 2, hip - 6, ox + 13, hip - 3, 4, C.steel[1]); P(ox + 3, hip - 7, 3, 3, C.bot[2]); }
    };
    SPR.sol = [0, 1, 2, 3].map((fr) => bake(36, 46, 18, 42, (b) => sol(b, fr, false)));
    SPR.solAim = bake(36, 46, 18, 42, (b) => sol(b, 0, true));
    SPR.solFall = bake(36, 46, 18, 42, (b) => sol(b, 0, false, true));
    // 낙하산 — 자홍 줄무늬 + 바이러스 무늬
    SPR.chute = bake(40, 28, 20, 26, (b) => {
      const { P, L, D } = b;
      for (let dy = -12; dy <= 0; dy++) { const w = Math.floor(Math.sqrt(144 - dy * dy) * 1.45); for (let x = -w; x <= w; x++) P(20 + x, 13 + dy, 1, 1, Math.floor((x + 40) / 6) % 2 ? C.magenta[3] : C.magenta[2]); }
      P(3, 12, 35, 2, C.magenta[1]); P(16, 3, 8, 2, C.magenta[4]);
      D(20, 7, 3, C.virus[3]);
      for (const sx of [-15, -7, 7, 15]) L(20 + sx, 14, 20 + sx * 0.2, 26, 1, C.shirt[2]);
    });
    // 방패 로봇 — 금색 에너지 방패
    const shield = (b, fr, low, crack, none) => {
      const { P, L, Box } = b;
      const ox = 22, oy = 46, hip = oy - 16, st = fr ? 2 : -2;
      L(ox - 3, hip, ox - 3 - st, oy - 2, 5, C.bot[1]); L(ox + 3, hip, ox + 3 + st, oy - 2, 5, C.bot[2]);
      P(ox - 7 - st, oy - 3, 7, 3, C.bot[1]); P(ox + st, oy - 3, 8, 3, C.bot[2]);
      Box(ox - 9, hip - 15, 18, 16, C.magenta, 2);
      P(ox - 7, hip - 12, 6, 5, C.virus[3]); P(ox - 7, hip - 12, 3, 2, C.virus[4]);
      virusDome(b, ox, hip - 22, 7, C.virus, 0.3, low ? C.pink[2] : C.gold[3]);
      if (none) { P(ox + 4, hip - 10, 16, 4, C.steel[1]); P(ox + 19, hip - 9, 2, 2, C.pink[3]); return; }
      const ramp = crack ? C.fire : C.gold;
      if (low) {
        P(ox + 4, hip - 10, 16, 4, C.steel[1]); P(ox + 19, hip - 9, 2, 2, C.pink[3]);
        P(ox - 14, hip - 18, 5, 26, ramp[2]); P(ox - 14, hip - 18, 1, 26, ramp[3]);
      } else {
        P(ox + 9, hip - 26, 6, 32, ramp[2]); P(ox + 9, hip - 26, 2, 32, ramp[3]); P(ox + 14, hip - 26, 1, 32, ramp[1]);
        for (let y = hip - 22; y < hip + 4; y += 6) P(ox + 11, y, 2, 3, ramp[4]);
        if (crack) { L(ox + 10, hip - 18, ox + 13, hip - 8, 1, C.fire[0]); L(ox + 13, hip - 8, ox + 10, hip + 2, 1, C.fire[0]); }
      }
    };
    SPR.shield = [0, 1].map((fr) => bake(44, 50, 22, 46, (b) => shield(b, fr, false, false)));
    SPR.shieldC = [0, 1].map((fr) => bake(44, 50, 22, 46, (b) => shield(b, fr, false, true)));
    SPR.shieldLow = bake(44, 50, 22, 46, (b) => shield(b, 0, true, false));
    SPR.shieldNo = [0, 1].map((fr) => bake(44, 50, 22, 46, (b) => shield(b, fr, false, false, true)));
    // 굴러오는 세균 공 — 돌기만 돌고 얼굴은 그대로
    SPR.germ = [0, 1, 2, 3].map((fr) => bake(28, 28, 14, 26, (b) => {
      const { P } = b;
      const cx = 14, cy = 16, r = 8;
      for (let k = 0; k < 10; k++) {
        const a = fr * 0.16 + (k / 10) * Math.PI * 2;
        b.L(cx + Math.cos(a) * r, cy + Math.sin(a) * r, cx + Math.cos(a) * (r + 3), cy + Math.sin(a) * (r + 3), 2, C.virus[1]);
        P(cx + Math.cos(a) * (r + 3) - 1, cy + Math.sin(a) * (r + 3) - 1, 2, 2, C.virus[3]);
      }
      b.Ball(cx, cy, r, C.virus);
      P(cx - 4, cy - 3, 3, 3, CREAM); P(cx + 1, cy - 3, 3, 3, CREAM); P(cx - 3, cy - 2, 2, 2, INK); P(cx + 2, cy - 2, 2, 2, INK);
      P(cx - 5, cy - 5, 3, 1, C.virus[0]); P(cx + 2, cy - 5, 3, 1, C.virus[0]);
      P(cx - 3, cy + 2, 6, 2, C.virus[0]); P(cx - 2, cy + 2, 1, 1, CREAM); P(cx + 1, cy + 2, 1, 1, CREAM);
    }));
    // 드론 · 헬기의 꼬마 드론
    const drone = (b, fr, mini) => {
      const { P, Box } = b;
      const ox = 16, oy = 12, hull = mini ? C.magenta : C.bot;
      if (fr) P(ox - 14, oy - 9, 28, 1, C.shirt[2]); else P(ox - 8, oy - 9, 16, 1, C.shirt[3]);
      P(ox - 1, oy - 8, 2, 3, C.steel[1]);
      Box(ox - 10, oy - 5, 20, 7, hull, 2);
      P(ox - 12, oy - 3, 3, 3, hull[1]); P(ox + 10, oy - 3, 3, 3, hull[1]);
      P(ox + 6, oy - 3, 2, 2, C.pink[3]);
      virusDome(b, ox, oy + 5, 4, C.virus, 0, null);
      P(ox - 1, oy + 4, 3, 2, INK);
    };
    SPR.drone = [0, 1].map((fr) => bake(32, 24, 16, 12, (b) => drone(b, fr, false)));
    SPR.mini = [0, 1].map((fr) => bake(32, 24, 16, 12, (b) => drone(b, fr, true)));
    // 포탑 — 받침 + 각도별 포신
    SPR.turret = bake(32, 28, 16, 26, (b) => {
      const { P, D, Box } = b;
      Box(3, 16, 26, 10, C.bot, 2);
      for (let x = 6; x < 27; x += 5) P(x, 22, 2, 2, C.bot[1]);
      D(16, 14, 8, C.bot[2]); D(14, 12, 5, C.bot[3]); P(11, 9, 3, 1, C.bot[4]);
    });
    SPR.barrel = [];
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      SPR.barrel.push(bake(40, 40, 20, 20, (b) => {
        b.L(20, 20, 20 + Math.cos(a) * 15, 20 + Math.sin(a) * 15, 5, C.steel[1]);
        b.L(20, 20, 20 + Math.cos(a) * 15, 20 + Math.sin(a) * 15, 2, C.steel[2]);
        b.P(20 + Math.cos(a) * 16 - 1, 20 + Math.sin(a) * 16 - 1, 3, 3, C.steel[3]);
      }));
    }
    // 박격포 로봇
    const mortar = (b, fire) => {
      const { P, L, Box } = b;
      Box(4, 20, 22, 7, C.bot, 1);
      Box(5, 11, 20, 10, C.gold, 2);
      L(17, 12, 21, 1, 6, C.steel[1]); L(16, 12, 20, 1, 2, C.steel[2]); P(18, 0, 6, 2, C.steel[2]);
      virusDome(b, 9, 10, 4, C.virus, 0.5, fire ? C.pink[2] : C.gold[3]);
    };
    SPR.mortar = [bake(30, 30, 15, 27, (b) => mortar(b, false)), bake(30, 30, 15, 27, (b) => mortar(b, true))];
    // 묶인 동료 · 기뻐하는 동료 · 달리는 동료
    const worker = (b, mode, fr) => {
      const { P, L } = b;
      const ox = 14, oy = 34;
      if (mode === "tied") {
        const w = fr ? 1 : 0;
        P(ox - 7, oy - 4, 14, 4, C.navy[2]); P(ox - 7, oy - 4, 14, 1, C.navy[3]);
        P(ox - 6, oy - 15, 12, 11, C.shirt[2]); P(ox - 6, oy - 15, 3, 11, C.shirt[3]); P(ox - 1, oy - 14, 2, 8, C.tie[2]);
        P(ox - 5, oy - 24 - w, 10, 9, C.skin[3]); P(ox - 5, oy - 24 - w, 10, 3, C.hairM[2]); P(ox - 5, oy - 21 - w, 2, 3, C.hairM[2]);
        P(ox + 1, oy - 20 - w, 2, 2, INK); P(ox - 3, oy - 20 - w, 2, 2, INK); P(ox - 1, oy - 17 - w, 3, 1, C.skin[1]);
        for (const yy of [oy - 13, oy - 8]) P(ox - 8, yy, 16, 2, C.rope[2]);
        P(ox - 8, oy - 13, 2, 7, C.rope[1]);
      } else {
        const run = mode === "run", s = fr ? 2 : -2;
        L(ox - 2, oy - 12, ox - 2 - (run ? s : 2), oy - 1, 3, C.navy[2]); L(ox + 2, oy - 12, ox + 2 + (run ? s : 2), oy - 1, 3, C.navy[2]);
        P(ox - 6, oy - 23, 12, 12, C.shirt[2]); P(ox - 6, oy - 23, 3, 12, C.shirt[3]); P(ox - 1, oy - 22, 2, 8, C.tie[2]);
        P(ox - 5, oy - 33, 10, 10, C.skin[3]); P(ox - 5, oy - 33, 10, 3, C.hairM[2]);
        P(ox + 1, oy - 29, 2, 2, INK); P(ox - 3, oy - 29, 2, 2, INK); P(ox - 2, oy - 26, 4, 1, C.skin[1]);
        if (run) L(ox - 5, oy - 21, ox - 9, oy - 16 + s, 2, C.shirt[3]);
        else { L(ox - 6, oy - 21, ox - 10, oy - 30 - (fr ? 2 : 0), 2, C.shirt[3]); L(ox + 6, oy - 21, ox + 10, oy - 30 - (fr ? 0 : 2), 2, C.shirt[3]); P(ox - 11, oy - 32 - (fr ? 2 : 0), 3, 3, C.skin[3]); P(ox + 9, oy - 32 - (fr ? 0 : 2), 3, 3, C.skin[3]); }
      }
    };
    SPR.tied = [0, 1].map((fr) => bake(28, 38, 14, 34, (b) => worker(b, "tied", fr)));
    SPR.cheer = [0, 1].map((fr) => bake(28, 38, 14, 34, (b) => worker(b, "cheer", fr)));
    SPR.runner = [0, 1].map((fr) => bake(28, 38, 14, 34, (b) => worker(b, "run", fr)));
    // 아이템 — 비타민 캡슐 상자
    SPR.item = {};
    for (const [k, ramp] of [["S", C.fire], ["L", C.teal], ["F", C.red], ["G", C.virus]]) {
      SPR.item[k] = bake(18, 18, 9, 17, (b) => {
        const { P, Box } = b;
        Box(1, 3, 16, 14, C.gold, 2);
        Box(3, 5, 12, 10, ramp, 2);
        P(1, 9, 16, 1, C.gold[1]);
        const gl = FONT[k];
        for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) if (gl[y] & (16 >> x)) P(7 + x, 6 + y, 1, 1, CREAM);
        P(3, 4, 3, 1, C.gold[4]);
      });
    }
    SPR.gren = bake(8, 10, 4, 5, (b) => { b.P(1, 2, 6, 7, C.virus[2]); b.P(1, 2, 2, 7, C.virus[3]); b.P(2, 0, 4, 2, C.gold[3]); });
  }

  // ── 보스 ──
  function bakeBosses() {
    // 감기 탱크 — 보라 차체 · 빨간 코 · 체온계 안테나 · 큰 눈
    SPR.tankHull = [0, 1].map((fr) => bake(116, 50, 58, 48, (b) => {
      const { P, Box, Ball } = b;
      P(4, 34, 108, 14, C.navy[1]);
      for (let k = 0; k < 11; k++) { Ball(10 + k * 10, 41, 4, C.steel); P(9 + k * 10 + (fr ? 2 : 0), 36, 2, 1, C.steel[1]); }
      P(4, 33, 108, 2, C.navy[2]); P(4, 46, 108, 2, C.navy[0]);
      Box(2, 6, 112, 28, C.bot, 2);
      for (let x = 14; x < 110; x += 16) P(x, 10, 1, 20, C.bot[1]);
      P(4, 7, 50, 2, C.bot[4]);
      Box(6, 22, 104, 6, C.magenta, 2);
      for (let k = 0; k < 4; k++) virusDome(b, 66 + k * 11, 16, 3, C.virus, k, null);
      Box(1, 18, 8, 5, C.steel, 2);
      Ball(10, 16, 8, C.red);
    }));
    SPR.tankTop = bake(70, 36, 35, 34, (b) => {
      const { P, Box, Ball } = b;
      Box(6, 8, 58, 26, C.bot, 3);
      P(8, 9, 30, 2, C.bot[4]);
      P(14, 13, 12, 10, CREAM); P(30, 13, 12, 10, CREAM); P(18, 16, 6, 6, INK); P(34, 16, 6, 6, INK); P(19, 16, 2, 2, CREAM); P(35, 16, 2, 2, CREAM);
      P(12, 11, 14, 2, C.bot[0]); P(30, 10, 14, 2, C.bot[0]);
      P(46, 0, 3, 14, CREAM); Ball(47, 13, 3, C.red); P(47, 2, 1, 8, C.red[2]);
      P(14, 26, 30, 3, C.magenta[2]);
    });
    SPR.tankGun = bake(40, 10, 38, 5, (b) => { b.Box(2, 2, 36, 6, C.steel, 2); b.P(0, 1, 5, 8, C.steel[1]); });
    // 독감 헬리콥터
    SPR.heli = bake(140, 56, 64, 30, (b) => {
      const { P, D, Box } = b;
      P(54, 4, 12, 6, C.steel[1]); P(56, 0, 8, 4, C.steel[2]);
      D(40, 30, 20, C.red[1]); D(38, 28, 18, C.red[2]); D(34, 24, 10, C.red[3]);
      Box(40, 12, 60, 34, C.red, 2);
      P(42, 14, 54, 3, C.red[3]);
      Box(96, 22, 40, 9, C.red, 2); Box(128, 10, 8, 22, C.magenta, 2);
      D(28, 26, 11, C.teal[1]); D(26, 24, 9, C.teal[2]); P(20, 19, 5, 3, C.teal[4]);
      for (let k = 0; k < 4; k++) virusDome(b, 54 + k * 12, 30, 4, C.virus, k * 0.4, null);
      Box(46, 44, 46, 4, C.steel, 2);
      P(50, 48, 2, 4, C.steel[1]); P(84, 48, 2, 4, C.steel[1]); Box(36, 52, 64, 3, C.steel, 2);
      P(16, 34, 10, 4, C.steel[1]); P(14, 35, 3, 2, C.pink[3]);
    });
    SPR.rotor = [0, 1, 2].map((fr) => bake(140, 6, 70, 3, (b) => { const w = [64, 44, 22][fr]; b.P(70 - w, 2, w * 2, 2, C.shirt[2]); b.P(70 - w, 2, w * 2, 1, C.shirt[3]); }, true));
    // 슈퍼 바이러스 메카 — 몸통 · 다리(3장) · 핵
    SPR.mechBody = [false, true].map((hurt) => bake(100, 90, 50, 88, (b) => {
      const { P, D, Box } = b;
      Box(14, 24, 72, 62, C.bot, 2);
      P(16, 26, 68, 3, C.bot[4]);
      for (let y = 34; y < 84; y += 10) P(18, y, 64, 1, C.bot[1]);
      D(50, 54, 15, C.bot[0]); D(50, 54, 13, hurt ? C.pink[1] : C.virus[1]);
      virusDome(b, 50, 54, 9, hurt ? C.pink : C.virus, 0.2, null);
      P(45, 51, 3, 3, INK); P(53, 51, 3, 3, INK);
      Box(34, 8, 32, 18, C.bot, 3);
      P(38, 14, 24, 4, INK); P(42, 15, 16, 2, hurt ? C.pink[2] : C.teal[3]);
      Box(0, 14, 22, 18, C.magenta, 2); Box(78, 14, 22, 18, C.magenta, 2);
      for (let k = 0; k < 3; k++) { P(3 + k * 6, 10, 4, 5, C.red[2]); P(81 + k * 6, 10, 4, 5, C.red[2]); }
      Box(2, 40, 14, 12, C.steel, 2); P(0, 44, 6, 5, C.steel[1]);
      Box(86, 36, 12, 34, C.steel, 2);
    }));
    // 다리 — 허벅지 · 무릎 관절 · 정강이 · 발, 두 다리가 번갈아 나간다
    SPR.mechLeg = [0, 1, 2].map((fr) => bake(84, 56, 42, 54, (b) => {
      const { P, Box, Ball } = b;
      const s = [-4, 0, 4][fr];
      const leg = (hx, off, ramp) => {
        Box(hx - 7, 0, 14, 22, ramp, 2); P(hx - 5, 4, 2, 14, ramp[3]);
        Ball(hx + off * 0.5, 24, 6, C.steel); P(hx + off * 0.5 - 1, 22, 2, 2, C.gold[3]);
        Box(hx - 8 + off, 28, 16, 18, ramp, 2); P(hx - 6 + off, 31, 12, 2, ramp[1]); P(hx - 6 + off, 37, 12, 2, ramp[1]);
        Box(hx - 12 + off, 46, 24, 8, C.navy, 2); P(hx - 12 + off, 46, 24, 2, C.navy[3]);
      };
      leg(26, -s, C.bot);
      leg(58, s, C.magenta);
    }));
    SPR.core = [0, 1].map((fr) => bake(70, 70, 35, 35, (b) => {
      const { P, L, D, Ball } = b;
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2 + fr * 0.13;
        L(35 + Math.cos(a) * 22, 35 + Math.sin(a) * 22, 35 + Math.cos(a) * (29 + fr), 35 + Math.sin(a) * (29 + fr), 3, C.magenta[2]);
        Ball(35 + Math.cos(a) * (30 + fr), 35 + Math.sin(a) * (30 + fr), 3, C.pink);
      }
      Ball(35, 35, 23, C.magenta);
      D(35, 35, 12, C.virus[1]); Ball(35, 35, 10, C.virus);
      P(28, 30, 5, 6, INK); P(38, 30, 5, 6, INK); P(29, 31, 2, 2, CREAM); P(39, 31, 2, 2, CREAM);
      P(30, 40, 10, 2, INK); P(32, 40, 2, 3, CREAM); P(36, 40, 2, 3, CREAM);
    }));
  }

  // ───────────────────────── 배경음 ─────────────────────────
  // 짧은 오리지널 칩튠 루프 — 공통 소리 버튼(HKSound)이 꺼져 있으면 울리지 않는다
  const TUNES = [
    { bpm: 138, lead: [72, 0, 76, 0, 79, 0, 76, 74, 72, 0, 74, 76, 74, 0, 71, 0, 69, 0, 72, 0, 76, 0, 74, 72, 71, 0, 72, 74, 71, 0, 67, 0, 72, 0, 76, 0, 79, 0, 81, 79, 77, 0, 76, 74, 76, 0, 72, 0, 74, 0, 74, 76, 77, 0, 76, 74, 72, 0, 0, 0, 67, 0, 71, 0],
      bass: [48, 0, 60, 0, 55, 0, 60, 0, 48, 0, 60, 0, 55, 0, 60, 0, 45, 0, 57, 0, 52, 0, 57, 0, 45, 0, 57, 0, 52, 0, 57, 0, 41, 0, 53, 0, 48, 0, 53, 0, 41, 0, 53, 0, 48, 0, 53, 0, 43, 0, 55, 0, 50, 0, 55, 0, 43, 0, 55, 0, 50, 0, 47, 0] },
    { bpm: 126, lead: [69, 0, 0, 72, 0, 71, 69, 0, 67, 0, 69, 0, 64, 0, 0, 0, 65, 0, 0, 69, 0, 67, 65, 0, 64, 0, 65, 0, 67, 0, 0, 0, 67, 0, 0, 71, 0, 69, 67, 0, 71, 0, 72, 0, 74, 0, 0, 0, 76, 0, 74, 0, 72, 0, 71, 0, 68, 0, 71, 0, 64, 0, 0, 0],
      bass: [45, 45, 0, 45, 57, 0, 45, 0, 45, 45, 0, 45, 57, 0, 52, 0, 41, 41, 0, 41, 53, 0, 41, 0, 41, 41, 0, 41, 53, 0, 48, 0, 43, 43, 0, 43, 55, 0, 43, 0, 43, 43, 0, 43, 55, 0, 50, 0, 40, 40, 0, 40, 52, 0, 40, 0, 40, 40, 0, 40, 52, 0, 44, 0] },
    { bpm: 150, lead: [74, 0, 74, 77, 0, 74, 72, 0, 74, 0, 77, 0, 81, 0, 79, 77, 70, 0, 70, 74, 0, 70, 69, 0, 70, 0, 74, 0, 77, 0, 74, 0, 72, 0, 72, 76, 0, 72, 70, 0, 72, 0, 76, 0, 79, 0, 77, 76, 73, 0, 76, 0, 79, 0, 76, 0, 81, 0, 79, 0, 76, 0, 73, 0],
      bass: [38, 0, 50, 38, 0, 50, 38, 50, 38, 0, 50, 38, 0, 50, 45, 50, 34, 0, 46, 34, 0, 46, 34, 46, 34, 0, 46, 34, 0, 46, 41, 46, 36, 0, 48, 36, 0, 48, 36, 48, 36, 0, 48, 36, 0, 48, 43, 48, 33, 0, 45, 33, 0, 45, 33, 45, 33, 0, 45, 33, 0, 45, 40, 45] },
    { bpm: 162, lead: [76, 0, 0, 75, 0, 0, 74, 0, 73, 0, 74, 0, 75, 0, 76, 0, 79, 0, 0, 78, 0, 0, 77, 0, 76, 0, 77, 0, 78, 0, 71, 0],
      bass: [40, 40, 52, 40, 40, 51, 40, 40, 50, 40, 40, 49, 40, 47, 48, 49, 40, 40, 52, 40, 40, 51, 40, 40, 50, 40, 40, 49, 40, 47, 48, 49] },
  ];
  const Music = (function () {
    let ac = null, out = null, timer = null, tune = -1, step = 0, nextT = 0;
    const muted = () => !window.HKSound || HKSound.isMuted();
    const mf = (n) => 440 * Math.pow(2, (n - 69) / 12);
    function ensure() {
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        try { ac = new AC(); } catch (_) { return null; }
        out = ac.createGain(); out.gain.value = 0.055; out.connect(ac.destination);
      }
      if (ac.state !== "running") ac.resume().catch(() => {});
      return ac;
    }
    function note(type, f, t, len, v) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g).connect(out); o.start(t); o.stop(t + len + 0.02);
    }
    function pump() {
      if (!ac || tune < 0) return;
      if (muted()) { stop(); return; }
      if (ac.state !== "running") { nextT = ac.currentTime + 0.05; return; }
      const T = TUNES[tune], st = 60 / T.bpm / 4;
      if (nextT < ac.currentTime) nextT = ac.currentTime + 0.03;
      while (nextT < ac.currentTime + 0.18) {
        const i = step % T.lead.length;
        if (T.lead[i]) note("square", mf(T.lead[i]), nextT, st * 1.6, 0.5);
        const b = T.bass[step % T.bass.length];
        if (b) note("triangle", mf(b), nextT, st * 1.8, 0.9);
        if (step % 4 === 2) note("square", 5200 + (step % 8) * 60, nextT, 0.02, 0.12);
        step++; nextT += st;
      }
    }
    function play(n) {
      if (muted()) { tune = n; stopTimer(); return; }
      if (!ensure()) return;
      if (tune !== n) step = 0;
      tune = n; nextT = ac.currentTime + 0.05;
      if (!timer) timer = setInterval(pump, 50);
      pump();
    }
    function stopTimer() { clearInterval(timer); timer = null; }
    function stop() { stopTimer(); if (ac) { const old = ac; ac = null; out = null; try { old.close().catch(() => {}); } catch (_) {} } }
    function off() { tune = -1; stop(); }
    document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); });
    window.addEventListener("pagehide", stop);
    // 아이폰은 손을 대는 순간에만 소리 장치가 풀린다 — 입력마다 다시 깨운다
    ["pointerdown", "pointerup", "touchend", "keydown"].forEach((t) => window.addEventListener(t, () => {
      if (ac && ac.state !== "running" && !muted()) ac.resume().catch(() => {});
      else if (!ac && tune >= 0 && !muted()) play(tune);
    }, { passive: true, capture: true }));
    return { play, stop, off, get tune() { return tune; } };
  })();

  // ───────────────────────── 배경 굽기 ─────────────────────────
  // 겹마다 넓이 LW 를 미리 그려 이어 붙인다. 먼 겹일수록 하늘색을 많이 섞는다(대기 원근)
  const LW = 768;
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function bands(b, x, y0, w, colors, step) {
    colors.forEach((c, k) => b.P(x, y0 + k * step, w, step + 1, c));
    for (let k = 1; k < colors.length; k++) for (let xx = 0; xx < w; xx += 2) { b.P(x + xx + (k % 2), y0 + k * step - 1, 1, 1, colors[k - 1]); b.P(x + xx + ((k + 1) % 2), y0 + k * step - 2, 1, 1, colors[k - 1]); }
  }
  function tree(b, x, base, leaf, trunk) {
    b.P(x - 2, base - 22, 5, 22, trunk[1]); b.P(x - 2, base - 22, 2, 22, trunk[2]);
    b.D(x, base - 30, 13, leaf[1]); b.D(x - 6, base - 26, 9, leaf[1]); b.D(x + 7, base - 25, 9, leaf[1]);
    b.D(x - 2, base - 33, 10, leaf[2]); b.D(x - 7, base - 28, 6, leaf[2]);
    b.D(x - 4, base - 36, 6, leaf[3]); b.P(x - 7, base - 39, 3, 2, leaf[4]);
  }
  function makeBG(i) {
    const R = rng(1000 + i * 77), pal = PAL[i];
    const sky = newCanvas(W, H), layers = [], lights = [];
    const b = bctx(sky);
    const mk = (f) => { const c = newCanvas(LW, H); layers.push({ c, f }); return bctx(c); };
    if (i === 0) {
      bands(b, 0, 0, W, pal.sky, 24);
      b.P(0, 168, W, 48, pal.sky[6]);
      for (let a = 0; a < 16; a++) { const t = (a / 16) * Math.PI * 2; b.L(64 + Math.cos(t) * 20, 34 + Math.sin(t) * 20, 64 + Math.cos(t) * (a % 2 ? 24 : 28), 34 + Math.sin(t) * (a % 2 ? 24 : 28), 1, "#fff2c8"); }
      b.D(64, 34, 15, "#ffe4a0"); b.D(64, 34, 13, "#fff2c8"); b.D(61, 31, 8, CREAM);
      const L1 = mk(0.06);
      const hill = mix(pal.hill, pal.haze, 0.62);
      for (let x = 0; x < LW; x++) { const h = 32 + Math.sin((x / LW) * Math.PI * 2 * 11) * 9 + Math.sin((x / LW) * Math.PI * 2 * 33 + 1) * 4; L1.P(x, 168 - h, 1, h + 10, hill); }
      L1.P(300, 96, 3, 50, hill); L1.P(296, 110, 11, 4, hill); L1.D(301, 92, 3, hill);
      const L2 = mk(0.18);
      let x = 0;
      while (x < LW - 30) {
        const w = Math.min(LW - x, 22 + Math.floor(R() * 34)), h = 34 + Math.floor(R() * 56), col = mix(pal.city, pal.haze, 0.55);
        L2.P(x, 168 - h, w, h + 10, col); L2.P(x, 168 - h, w, 2, mix(col, CREAM, 0.25));
        for (let wy = 172 - h; wy < 160; wy += 6) for (let wx = x + 3; wx < x + w - 3; wx += 5) L2.P(wx, wy, 2, 3, mix(col, pal.haze, 0.5));
        x += w + 2 + Math.floor(R() * 8);
      }
      const L3 = mk(0.45);
      for (let bx = 0; bx < LW; bx += 384) {
        const n = pal.near, gl = pal.glass;
        L3.P(bx + 26, 58, 128, 132, n[2]); L3.P(bx + 26, 58, 128, 4, n[3]); L3.P(bx + 26, 58, 4, 132, n[3]); L3.P(bx + 150, 62, 4, 128, n[1]);
        for (let wy = 70; wy < 150; wy += 14) for (let wx = bx + 36; wx < bx + 144; wx += 14) {
          L3.P(wx, wy, 10, 10, gl[2]); L3.P(wx, wy, 10, 3, gl[3]); L3.P(wx, wy, 3, 10, gl[3]); L3.P(wx + 1, wy + 1, 2, 1, gl[4]); L3.P(wx + 7, wy + 6, 3, 4, gl[1]);
        }
        L3.P(bx + 64, 44, 52, 14, pal.leaf[1]); L3.P(bx + 64, 44, 52, 2, pal.leaf[2]);
        L3.P(bx + 72, 156, 36, 36, n[1]); L3.P(bx + 74, 158, 15, 34, gl[3]); L3.P(bx + 91, 158, 15, 34, gl[3]); L3.P(bx + 74, 158, 4, 34, gl[4]);
        L3.P(bx + 200, 96, 120, 96, mix(n[2], pal.haze, 0.2)); L3.P(bx + 200, 96, 120, 3, n[3]);
        for (let wy = 106; wy < 180; wy += 12) L3.P(bx + 206, wy, 108, 6, mix(gl[2], pal.haze, 0.25));
        for (const tx of [bx + 176, bx + 340]) tree(L3, tx, 192, pal.leaf, pal.trunk);
        lights.push({ x: bx + 90, y: 51, layer: 2, col: "#86e05a", r: 18, flick: 0 });
      }
      const L4 = mk(0.75);
      for (let bx = 0; bx < LW; bx += 192) {
        L4.P(bx + 30, 112, 3, 80, pal.near[0]); L4.P(bx + 26, 108, 11, 5, pal.near[1]); L4.P(bx + 27, 113, 9, 2, "#fff2b0");
        for (let k = 0; k < 4; k++) { L4.D(bx + 90 + k * 11, 186, 9, pal.leaf[1]); L4.D(bx + 88 + k * 11, 183, 6, pal.leaf[2]); L4.P(bx + 86 + k * 11, 179, 2, 2, pal.flower[k % 2]); }
        L4.P(bx + 140, 176, 26, 3, pal.trunk[2]); L4.P(bx + 140, 170, 26, 2, pal.trunk[2]); L4.P(bx + 142, 179, 2, 9, pal.near[0]); L4.P(bx + 162, 179, 2, 9, pal.near[0]);
        lights.push({ x: bx + 31, y: 114, layer: 3, col: "#fff2b0", r: 10, flick: 0 });
      }
    } else if (i === 1) {
      bands(b, 0, 0, W, pal.sky, 30);
      const wl = pal.wall;
      const L1 = mk(0.06);
      for (let x = 0; x < LW; x += 3) L1.P(x, 120 + (x % 9 ? 0 : 1), 2, 1, wl[1]);
      // 벽에 칠한 큰 층 표시 「B2」 — 노란 테두리 판
      for (const bx of [120, 520]) {
        L1.P(bx - 6, 58, 76, 48, mix(wl[1], pal.haze, 0.3)); L1.P(bx - 6, 58, 76, 2, mix(pal.warn[1], pal.haze, 0.45)); L1.P(bx - 6, 104, 76, 2, mix(pal.warn[1], pal.haze, 0.45));
        L1.g.drawImage(fontCanvas("B2", mix(pal.warn[1], pal.haze, 0.35), 5, null), bx + 2, 64);
      }
      for (let x = 30; x < LW; x += 140) { L1.P(x, 100, 18, 7, "#1f6a36"); L1.P(x + 2, 102, 14, 3, "#86e05a"); lights.push({ x: x + 9, y: 103, layer: 0, col: "#86e05a", r: 14, flick: 0 }); }
      const L2 = mk(0.2);
      for (let x = 0; x < LW; x += 128) {
        const c = mix(wl[2], pal.haze, 0.3);
        L2.P(x + 30, 24, 30, 170, c); L2.P(x + 30, 24, 3, 170, mix(wl[3], pal.haze, 0.3));
        for (let y = 140; y < 190; y += 10) L2.P(x + 30, y, 30, 5, (y / 10) % 2 ? mix(pal.warn[1], pal.haze, 0.5) : mix(wl[0], pal.haze, 0.3));
        L2.P(x + 70, 166, 46, 18, wl[1]); L2.P(x + 76, 156, 32, 11, wl[1]); L2.P(x + 79, 158, 11, 7, wl[2]); L2.P(x + 93, 158, 12, 7, wl[2]);
        L2.P(x + 113, 170, 3, 3, pal.hot[2]); lights.push({ x: x + 114, y: 171, layer: 1, col: "#ff5a36", r: 7, flick: 0 });
      }
      const L3 = mk(0.45);
      L3.P(0, 0, LW, 20, wl[0]); L3.P(0, 20, LW, 3, wl[2]); L3.P(0, 26, LW, 4, wl[1]); L3.P(0, 26, LW, 1, wl[3]); L3.P(0, 33, LW, 3, wl[2]);
      for (let x = 0; x < LW; x += 96) {
        L3.P(x + 30, 38, 40, 4, pal.lamp[3]); L3.P(x + 30, 42, 40, 1, pal.lamp[1]);
        L3.g.fillStyle = "rgba(230,241,239,.07)"; L3.g.beginPath(); L3.g.moveTo(x + 30, 43); L3.g.lineTo(x + 70, 43); L3.g.lineTo(x + 100, 150); L3.g.lineTo(x, 150); L3.g.fill();
        lights.push({ x: x + 50, y: 40, layer: 2, col: "#e6f1ef", r: 26, flick: x === 288 ? 1 : 0, lamp: true });
      }
      for (let x = 0; x < LW; x += 192) {
        L3.P(x + 10, 144, 96, 48, wl[1]); L3.P(x + 10, 144, 96, 3, wl[3]);
        for (let k = 0; k < 7; k++) { L3.D(x + 18 + k * 13, 156, 4, wl[2]); L3.P(x + 16 + k * 13, 154, 2, 1, wl[4]); }
        L3.P(x + 20, 132, 14, 12, "#9a5a10"); L3.P(x + 20, 132, 14, 2, "#e0a020"); L3.P(x + 52, 134, 12, 10, "#9a5a10"); L3.P(x + 52, 134, 12, 2, "#e0a020");
        L3.P(x + 120, 110, 44, 82, wl[2]); L3.P(x + 120, 110, 44, 3, wl[3]); L3.P(x + 126, 118, 32, 16, wl[0]);
        L3.P(x + 129, 121, 6, 4, "#3ea844"); L3.P(x + 139, 121, 6, 4, pal.hot[2]); L3.P(x + 149, 121, 6, 4, pal.warn[2]);
        lights.push({ x: x + 152, y: 123, layer: 2, col: "#ffcc33", r: 8, flick: 2 });
      }
      const L4 = mk(0.75);
      for (let x = 0; x < LW; x += 160) {
        L4.P(x + 20, 176, 8, 12, pal.hot[1]); L4.P(x + 18, 186, 12, 3, pal.hot[0]); L4.P(x + 21, 179, 6, 2, pal.lamp[3]); L4.P(x + 22, 172, 4, 4, pal.hot[2]);
        L4.P(x + 60, 160, 70, 4, pal.warn[2]); for (let k = 0; k < 70; k += 10) L4.P(x + 60 + k, 160, 5, 4, wl[0]);
        L4.P(x + 64, 164, 4, 24, wl[2]); L4.P(x + 122, 164, 4, 24, wl[2]);
        lights.push({ x: x + 24, y: 173, layer: 3, col: "#ff5a36", r: 8, flick: 0 });
      }
    } else {
      bands(b, 0, 0, W, pal.sky, 20);
      b.P(0, 176, W, 40, pal.sky[8]);
      for (let k = 0; k < 50; k++) b.P(Math.floor(R() * W), Math.floor(R() * 56), 1, 1, R() < 0.3 ? CREAM : "#c7b8ff");
      const sp = pal.sun;
      b.D(300, 150, 26, sp[1]); b.D(300, 150, 22, sp[2]); b.D(300, 150, 17, sp[3]); b.D(296, 146, 10, sp[4]);
      for (const [y, x0, w] of [[124, 210, 120], [132, 250, 110], [140, 196, 70], [108, 40, 90]]) { b.P(x0, y, w, 2, pal.sky[5]); b.P(x0 + 10, y + 2, w - 20, 1, pal.sky[4]); }
      const L1 = mk(0.06);
      let x = 0;
      while (x < LW - 20) {
        const w = Math.min(LW - x, 14 + Math.floor(R() * 24)), h = 24 + Math.floor(R() * 50), col = mix(pal.far, pal.haze, 0.45);
        L1.P(x, 172 - h, w, h + 20, col);
        for (let wy = 176 - h; wy < 168; wy += 5) for (let wx = x + 2; wx < x + w - 2; wx += 4) if (R() < 0.25) L1.P(wx, wy, 1, 1, mix("#ffb26b", pal.haze, 0.3));
        x += w + 1 + Math.floor(R() * 4);
      }
      const L2 = mk(0.18);
      x = 0;
      while (x < LW - 24) {
        const w = Math.min(LW - x, 20 + Math.floor(R() * 30)), h = 40 + Math.floor(R() * 70), col = mix(pal.city, pal.haze, 0.2);
        L2.P(x, 180 - h, w, h + 20, col); L2.P(x + w - 2, 180 - h, 2, h + 20, mix(col, "#ff7f50", 0.35));
        for (let wy = 184 - h; wy < 176; wy += 6) for (let wx = x + 3; wx < x + w - 3; wx += 5) if (R() < 0.4) L2.P(wx, wy, 2, 2, R() < 0.6 ? "#ffd09a" : R() < 0.5 ? "#ff4f9a" : "#5ee6c8");
        if (R() < 0.4) { L2.P(x + (w >> 1), 180 - h - 14, 1, 14, col); lights.push({ x: x + (w >> 1), y: 180 - h - 15, layer: 1, col: "#ff4f9a", r: 7, flick: 3 }); }
        x += w + 2 + Math.floor(R() * 6);
      }
      const L3 = mk(0.45);
      for (let bx = 0; bx < LW; bx += 384) {
        const r = pal.roof;
        L3.P(bx + 60, 40, 84, 152, r[1]); L3.P(bx + 140, 40, 4, 152, mix(r[2], "#ff7f50", 0.4)); L3.P(bx + 60, 40, 84, 3, r[2]);
        for (let wy = 104; wy < 186; wy += 9) for (let wx = bx + 66; wx < bx + 138; wx += 9) L3.P(wx, wy, 5, 4, (wx + wy) % 3 ? r[2] : "#3a1c5c");
        // 큰 네온 바이러스 간판
        L3.D(bx + 102, 72, 22, pal.neonG[0]); L3.D(bx + 102, 72, 19, r[0]);
        for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; L3.L(bx + 102 + Math.cos(a) * 19, 72 + Math.sin(a) * 19, bx + 102 + Math.cos(a) * 27, 72 + Math.sin(a) * 27, 2, pal.neonG[2]); L3.P(bx + 101 + Math.cos(a) * 28, 71 + Math.sin(a) * 28, 3, 3, pal.neonG[3]); }
        for (let a = 0; a < 64; a++) { const t = (a / 64) * Math.PI * 2; L3.P(bx + 102 + Math.cos(t) * 19, 72 + Math.sin(t) * 19, 1, 1, pal.neonG[2]); }
        L3.P(bx + 94, 66, 4, 5, pal.neonP[1]); L3.P(bx + 106, 66, 4, 5, pal.neonP[1]); L3.P(bx + 95, 78, 14, 2, pal.neonP[1]);
        lights.push({ x: bx + 102, y: 72, layer: 2, col: "#86e05a", r: 40, flick: 4 });
        L3.P(bx + 250, 20, 3, 172, r[1]); for (let y = 40; y < 180; y += 18) L3.L(bx + 242, y, bx + 260, y + 14, 1, r[1]);
        lights.push({ x: bx + 251, y: 19, layer: 2, col: "#ff4f9a", r: 9, flick: 3 });
        L3.P(bx + 300, 120, 34, 30, r[1]); L3.P(bx + 330, 120, 4, 30, mix(r[2], "#ff7f50", 0.5)); L3.P(bx + 300, 116, 34, 4, r[2]);
        L3.P(bx + 304, 150, 3, 42, r[0]); L3.P(bx + 326, 150, 3, 42, r[0]);
      }
      const L4 = mk(0.75);
      for (let bx = 0; bx < LW; bx += 192) {
        const r = pal.roof;
        L4.P(bx + 20, 150, 50, 40, r[2]); L4.P(bx + 66, 150, 4, 40, mix(r[3], "#ff7f50", 0.6)); L4.P(bx + 20, 150, 50, 3, r[3]);
        for (let y = 158; y < 186; y += 4) L4.P(bx + 26, y, 36, 2, r[1]);
        L4.D(bx + 140, 160, 10, r[2]); L4.D(bx + 142, 158, 7, r[3]); L4.P(bx + 139, 168, 3, 22, r[1]);
      }
    }
    // 앞가림 겹 (1.3배) — 화면 앞을 지나가는 기둥 · 덤불 · 난간
    const fg = newCanvas(LW * 2, H), F = bctx(fg);
    if (i === 0) {
      for (let x = 0; x < LW * 2; x += 520) {
        const sh = "#20306a";
        F.P(x + 60, 0, 6, H, sh); F.P(x + 54, 30, 18, 6, sh);
        for (let k = 0; k < 6; k++) F.D(x + 220 + k * 16, 216, 14, k % 2 ? "#1a2c58" : sh);
        F.P(x + 216, 200, 2, 2, "#ff4f9a"); F.P(x + 260, 198, 2, 2, "#ffd650");
      }
    } else if (i === 1) {
      for (let x = 0; x < LW * 2; x += 600) {
        F.P(x + 80, 0, 22, H, "#0a0f1a");
        for (let y = 120; y < H; y += 14) F.P(x + 80, y, 22, 7, "#3a2e10");
        F.L(x + 300, 0, x + 340, 30, 2, "#0a0f1a"); F.L(x + 340, 30, x + 400, 8, 2, "#0a0f1a");
      }
    } else {
      for (let x = 0; x < LW * 2; x += 46) F.P(x, 196, 3, 20, "#140c22");
      F.P(0, 195, LW * 2, 3, "#140c22");
      for (let x = 0; x < LW * 2; x += 700) { F.P(x + 120, 0, 4, H, "#140c22"); F.L(x + 124, 20, x + 360, 50, 1, "#140c22"); }
    }
    // 바닥 무늬 (64 폭 반복) · 단차 무늬
    const floor = newCanvas(64, H - BASE + 2), FL = bctx(floor);
    const blockT = newCanvas(64, 64), BL = bctx(blockT);
    if (i === 0) {
      const s = pal.stone;
      FL.P(0, 0, 64, 40, s[2]); FL.P(0, 0, 64, 2, s[4]); FL.P(0, 2, 64, 1, s[3]); FL.P(0, 3, 64, 1, s[1]);
      for (let x = 0; x < 64; x += 16) { FL.P(x, 4, 1, 40, s[1]); FL.P(x + 1, 4, 1, 40, s[3]); }
      FL.P(0, 14, 64, 1, s[1]); FL.P(0, 15, 64, 1, s[3]); FL.P(0, 24, 64, 1, s[1]);
      for (let k = 0; k < 6; k++) FL.P(Math.floor(R() * 60), 6 + Math.floor(R() * 20), 2, 1, s[3]);
      const br = pal.brick;
      BL.P(0, 0, 64, 64, br[2]);
      for (let y = 6; y < 64; y += 5) { BL.P(0, y, 64, 1, br[1]); for (let x = (y / 5) % 2 ? 0 : 6; x < 64; x += 12) BL.P(x, y + 1, 1, 4, br[1]); }
      for (let y = 7; y < 64; y += 5) BL.P(0, y, 64, 1, br[3]);
      BL.P(0, 0, 64, 5, pal.soil[1]); BL.P(0, 0, 64, 1, pal.leaf[1]);
    } else if (i === 1) {
      const c = pal.conc;
      FL.P(0, 0, 64, 40, c[2]); FL.P(0, 0, 64, 2, c[4]); FL.P(0, 2, 64, 1, c[1]);
      FL.P(0, 10, 28, 2, pal.warn[2]); FL.P(0, 12, 28, 1, pal.warn[1]);
      FL.P(36, 18, 20, 3, c[1]); FL.P(38, 18, 14, 1, c[4]);
      for (let k = 0; k < 8; k++) FL.P(Math.floor(R() * 62), 4 + Math.floor(R() * 22), 1, 1, c[3]);
      BL.P(0, 0, 64, 64, c[3]); BL.P(0, 0, 64, 2, c[5]);
      for (let x = 0; x < 64; x += 10) { BL.P(x, 2, 5, 4, pal.warn[2]); BL.P(x + 5, 2, 5, 4, c[0]); }
      for (let x = 0; x < 64; x += 32) { BL.P(x, 6, 1, 58, c[1]); BL.P(x + 1, 6, 1, 58, c[4]); }
      for (let y = 12; y < 64; y += 12) for (let x = 6; x < 64; x += 16) BL.P(x, y, 2, 2, c[1]);
    } else {
      const r = pal.roof;
      FL.P(0, 0, 64, 40, r[2]); FL.P(0, 0, 64, 2, r[4]); FL.P(0, 2, 64, 1, mix(r[3], "#ff7f50", 0.5)); FL.P(0, 3, 64, 1, r[1]);
      for (let x = 0; x < 64; x += 12) FL.P(x, 4, 1, 40, r[1]);
      FL.P(0, 12, 64, 1, r[1]); FL.P(0, 21, 64, 1, r[1]);
      FL.P(20, 6, 18, 1, mix(r[3], "#ff7f50", 0.6)); FL.P(46, 16, 10, 1, mix(r[3], "#ff7f50", 0.4));
      BL.P(0, 0, 64, 64, r[3]); BL.P(0, 0, 64, 2, r[4]);
      for (let x = 0; x < 64; x += 21) { BL.P(x + 3, 6, 15, 54, r[2]); for (let y = 8; y < 58; y += 3) BL.P(x + 4, y, 13, 1, r[1]); }
      BL.P(62, 0, 2, 64, mix(r[4], "#ff7f50", 0.6));
    }
    // 비네트
    const vig = newCanvas(W, H), vg = vig.getContext("2d");
    const gr = vg.createRadialGradient(W / 2, H * 0.48, H * 0.35, W / 2, H * 0.5, W * 0.62);
    gr.addColorStop(0, "rgba(20,12,42,0)"); gr.addColorStop(1, `rgba(20,12,42,${pal.vig})`);
    vg.fillStyle = gr; vg.fillRect(0, 0, W, H);
    // 아침 햇살 빛줄기 (1구역)
    let rays = null;
    if (i === 0) {
      rays = newCanvas(W, H);
      const rg = rays.getContext("2d");
      for (let k = 0; k < 5; k++) {
        rg.fillStyle = `rgba(255,242,200,${0.05 + (k % 2) * 0.03})`;
        rg.beginPath(); rg.moveTo(40 + k * 34, 0); rg.lineTo(64 + k * 40, 0); rg.lineTo(210 + k * 60, H); rg.lineTo(150 + k * 52, H); rg.fill();
      }
    }
    return { sky, layers, fg, floor, blockT, vig, rays, lights, pal };
  }

  // ───────────────────────── 본체 ─────────────────────────
  function setup(stage, ctx) {
    stage.innerHTML = `
      <div class="vt-shell">
        <div class="vt-screen">
          <canvas class="vt-canvas" width="${W}" height="${H}" aria-label="비타민 특공대 게임 화면"></canvas>
        </div>
        <div class="vt-padwrap"></div>
        <div class="vt-hint"><kbd>←</kbd><kbd>→</kbd> 이동 · <kbd>↑</kbd> 위 조준 · <kbd>↓</kbd> 엎드리기 · <kbd>Z</kbd> 쏘기(누르고 있으면 연사) · <kbd>X</kbd> 점프 · <kbd>C</kbd> 수류탄 · <kbd>Esc</kbd> 일시정지</div>
        <div class="vt-pad" aria-hidden="true">
          <div class="vt-stick"><div class="vt-stick__base"><i class="vt-ar vt-ar--u"></i><i class="vt-ar vt-ar--d"></i><i class="vt-ar vt-ar--l"></i><i class="vt-ar vt-ar--r"></i><div class="vt-stick__knob"></div></div></div>
          <div class="vt-btns">
            <div class="vt-btn vt-btn--gren" data-btn="gren" aria-label="수류탄"><svg viewBox="0 0 12 12" shape-rendering="crispEdges"><rect x="4" y="0" width="4" height="2" fill="#ffd650"/><rect x="3" y="2" width="6" height="2" fill="#9a5a10"/><rect x="2" y="4" width="8" height="7" fill="#7cc040"/><rect x="2" y="4" width="2" height="7" fill="#c8f070"/><rect x="2" y="7" width="8" height="1" fill="#3f7a30"/></svg><small data-gren>10</small></div>
            <div class="vt-btn vt-btn--jump" data-btn="jump" aria-label="점프"><svg viewBox="0 0 12 12" shape-rendering="crispEdges"><rect x="5" y="1" width="2" height="2" fill="#c8fff0"/><rect x="4" y="3" width="4" height="1" fill="#c8fff0"/><rect x="3" y="4" width="6" height="1" fill="#c8fff0"/><rect x="2" y="5" width="8" height="1" fill="#c8fff0"/><rect x="5" y="6" width="2" height="5" fill="#c8fff0"/></svg></div>
            <div class="vt-btn vt-btn--fire" data-btn="fire" aria-label="쏘기"><svg viewBox="0 0 12 12" shape-rendering="crispEdges"><rect x="1" y="4" width="7" height="3" fill="#d0dcf4"/><rect x="1" y="7" width="2" height="3" fill="#8fa2d0"/><rect x="8" y="5" width="1" height="1" fill="#d0dcf4"/><rect x="9" y="4" width="2" height="3" fill="#ffd04a"/><rect x="11" y="5" width="1" height="1" fill="#fff6c0"/><rect x="3" y="3" width="3" height="1" fill="#ff8a3d"/></svg></div>
          </div>
        </div>
        <div class="vt-ov" hidden></div>
      </div>`;
    const frameEl = stage.parentElement;
    if (frameEl && frameEl.classList) frameEl.classList.add("vt-wide");
    const shell = stage.querySelector(".vt-shell");
    const canvas = stage.querySelector("canvas");
    const padWrap = stage.querySelector(".vt-padwrap");
    const pad = stage.querySelector(".vt-pad");
    const overlay = stage.querySelector(".vt-ov");
    const elGren = stage.querySelector("[data-gren]");
    const knob = stage.querySelector(".vt-stick__knob");
    const g0 = canvas.getContext("2d");
    let g = g0;
    g.imageSmoothingEnabled = false;

    // 스프라이트 굽기 (한 번)
    bakeEnemies();
    bakeBosses();
    heroSprites(0); heroSprites(1);
    // 갈무리 글꼴 — 받아지면 글자 그림을 새로 굽는다 (못 받으면 기본 글꼴 그대로)
    if (document.fonts && document.fonts.load) {
      Promise.all(["8px Galmuri7", "10px Galmuri9", "12px Galmuri11", "700 12px Galmuri11", "15px Galmuri14"].map((f) => document.fonts.load(f, "가나다").catch(() => [])))
        .then((r) => { if (r.some((x) => x && x.length)) { galmuri = true; txtCache.clear(); draw(); } })
        .catch(() => {});
    }

    // ── 화면 크기 ──
    const PADH = 190;
    let touchUI = false;
    const isTouch = () => matchMedia("(pointer: coarse)").matches || (navigator.maxTouchPoints > 0 && !matchMedia("(pointer: fine)").matches);
    function fit() {
      const cs = getComputedStyle(stage);
      const sw = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const sh = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      if (sw <= 0 || sh <= 0) return;
      touchUI = isTouch();
      let mode = "pc", s;
      if (touchUI) {
        const sBelow = Math.min(sw / W, (sh - PADH) / H);
        if (sBelow * W >= sw * 0.9 && sh - sBelow * H >= PADH) { mode = "below"; s = sBelow; }
        else { mode = "over"; s = Math.min(sw / W, sh / H); }
      } else s = Math.min(sw / W, (sh - 28) / H);
      const dpr = window.devicePixelRatio || 1;
      const si = Math.floor(s * dpr);
      const css = si >= 1 && si / (s * dpr) >= 0.8 ? si / dpr : s;
      canvas.style.width = `${Math.floor(W * css)}px`;
      canvas.style.height = `${Math.floor(H * css)}px`;
      shell.dataset.mode = mode;
      if (mode === "below" && pad.parentElement !== padWrap) padWrap.appendChild(pad);
      if (mode !== "below" && pad.parentElement !== shell) shell.insertBefore(pad, overlay);
      padWrap.style.height = mode === "below" ? `${Math.max(PADH, Math.floor(sh - H * css - 6))}px` : "0px";
      draw();
    }

    // ── 입력 ──
    const keys = { left: 0, right: 0, up: 0, down: 0, fire: 0, jump: 0, gren: 0 };
    const tch = { left: 0, right: 0, up: 0, down: 0, fire: 0, jump: 0, gren: 0 };
    const inp = { left: 0, right: 0, up: 0, down: 0, fire: 0, jump: 0, gren: 0 };
    let jumpEdge = false, grenEdge = false;
    const KEYMAP = {
      ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right", ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down",
      KeyZ: "fire", KeyJ: "fire", KeyX: "jump", KeyK: "jump", Space: "jump", KeyC: "gren", KeyL: "gren",
    };
    // 휴대폰 손가락 — 손가락(또는 마우스 포인터)마다 따로 기억한다.
    // 스틱은 스틱을 누른 손가락이 떨어질 때만, 단추는 그 단추를 누른 손가락이 떨어질 때만 풀린다
    let stickId = null; // "t3"(터치 identifier) 또는 "p1"(마우스 · 펜 pointerId)
    const btnFingers = new Map(); // 손가락 id → 단추 요소
    function releaseStick() {
      stickId = null; tch.left = tch.right = tch.up = tch.down = 0; knob.style.transform = "";
      pad.querySelectorAll(".vt-ar.is-on").forEach((x) => x.classList.remove("is-on"));
    }
    function clearTouch() {
      releaseStick();
      tch.fire = tch.jump = tch.gren = 0;
      btnFingers.clear();
      pad.querySelectorAll(".is-on").forEach((b) => b.classList.remove("is-on"));
    }
    function clearKeys() { for (const k in keys) keys[k] = 0; }
    function clearInput() {
      clearKeys(); clearTouch();
      jumpEdge = grenEdge = false;
    }
    function mergeInput() { for (const k in inp) inp[k] = keys[k] || tch[k] ? 1 : 0; }
    const typing = (e) => { const t = e.target; return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable); };
    const dialogOpen = () => !!document.querySelector(".hk-dialog__overlay");
    window.addEventListener("keydown", (e) => {
      if (typing(e) || dialogOpen()) return;
      const a = KEYMAP[e.code];
      if (mode === "title") {
        if (e.code === "ArrowLeft" || e.code === "ArrowRight") { e.preventDefault(); pickHero(e.code === "ArrowLeft" ? 0 : 1); }
        else if ((e.code === "Enter" || e.code === "KeyZ" || e.code === "KeyJ" || e.code === "KeyX") && !e.repeat) { e.preventDefault(); clickGo(); }
        return;
      }
      if (mode === "play") {
        if (a) e.preventDefault();
        if (e.code === "KeyP" && !e.repeat) { pause(); return; }
        if (!a) return;
        if (a === "jump" && !e.repeat && !keys.jump) jumpEdge = true;
        if (a === "gren" && !e.repeat && !keys.gren) grenEdge = true;
        keys[a] = 1;
        return;
      }
      if (mode === "paused" && (e.code === "Enter" || e.code === "KeyP") && !e.repeat) { e.preventDefault(); resume(); }
      if (mode === "over" && e.code === "Enter" && !e.repeat) { e.preventDefault(); clickGo(); }
      if (a && (mode === "paused" || mode === "over")) e.preventDefault();
    });
    window.addEventListener("keyup", (e) => { const a = KEYMAP[e.code]; if (a) keys[a] = 0; });
    // 창이 포커스를 잃으면 키보드만 지운다 (손가락은 손가락 이벤트가 스스로 정리한다)
    window.addEventListener("blur", () => { clearKeys(); jumpEdge = grenEdge = false; });
    // 휴대폰 조작판 — 왼쪽 방향 패드(끌어서 8방향), 오른쪽 단추 셋 (여러 손가락 동시에)
    function stickAt(e) {
      const base = pad.querySelector(".vt-stick__base").getBoundingClientRect();
      const cx = base.left + base.width / 2, cy = base.top + base.height / 2;
      const dx = e.clientX - cx, dy = e.clientY - cy;
      const R = base.width / 2, len = Math.hypot(dx, dy), dead = Math.max(10, R * 0.22);
      tch.left = tch.right = tch.up = tch.down = 0;
      if (len > dead) {
        if (Math.abs(dx) > dead * 0.6 && Math.abs(dx) > Math.abs(dy) * 0.42) dx < 0 ? (tch.left = 1) : (tch.right = 1);
        if (Math.abs(dy) > dead * 0.6 && Math.abs(dy) > Math.abs(dx) * 0.42) dy < 0 ? (tch.up = 1) : (tch.down = 1);
      }
      const k = len > R * 0.6 ? (R * 0.6) / len : 1;
      knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      pad.querySelector(".vt-ar--l").classList.toggle("is-on", !!tch.left);
      pad.querySelector(".vt-ar--r").classList.toggle("is-on", !!tch.right);
      pad.querySelector(".vt-ar--u").classList.toggle("is-on", !!tch.up);
      pad.querySelector(".vt-ar--d").classList.toggle("is-on", !!tch.down);
    }
    // 손가락이 닿음 — 처음 닿은 곳이 단추면 그 단추, 스틱이면 스틱 (포인터 캡처는 쓰지 않는다)
    function fingerDown(id, target, x, y) {
      const b = target && target.closest && target.closest("[data-btn]");
      if (b && pad.contains(b)) {
        const k = b.dataset.btn;
        if (k === "jump" && !tch.jump) jumpEdge = true;
        if (k === "gren" && !tch.gren) grenEdge = true;
        btnFingers.set(id, b);
        tch[k] = 1;
        b.classList.add("is-on");
        if (mode === "title" || mode === "over") clickGo();
        return;
      }
      if (target && target.closest && target.closest(".vt-stick") && stickId == null) {
        stickId = id;
        stickAt({ clientX: x, clientY: y });
      }
    }
    function fingerMove(id, x, y) { if (id === stickId) stickAt({ clientX: x, clientY: y }); }
    // 손가락이 떨어짐 — 그 손가락이 맡은 것만 푼다 (다른 손가락의 스틱 · 단추는 그대로)
    function fingerUp(id) {
      if (id === stickId) releaseStick();
      const b = btnFingers.get(id);
      if (b) {
        btnFingers.delete(id);
        if (![...btnFingers.values()].includes(b)) { tch[b.dataset.btn] = 0; b.classList.remove("is-on"); }
      }
    }
    // 터치 — 손가락마다 identifier 가 다르다. changedTouches 에 든 손가락만 처리한다
    const tid = (t) => "t" + t.identifier;
    pad.addEventListener("touchstart", (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) fingerDown(tid(t), t.target, t.clientX, t.clientY);
    }, { passive: false });
    pad.addEventListener("touchmove", (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) fingerMove(tid(t), t.clientX, t.clientY);
    }, { passive: false });
    const touchEnd = (e) => { for (const t of e.changedTouches) fingerUp(tid(t)); };
    pad.addEventListener("touchend", touchEnd);
    pad.addEventListener("touchcancel", touchEnd);
    // 마우스 · 펜 (PC 에서 조작판을 눌러 볼 때) — 터치는 위의 터치 이벤트가 맡는다
    const pid = (e) => "p" + e.pointerId;
    pad.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "touch") return;
      e.preventDefault();
      fingerDown(pid(e), e.target, e.clientX, e.clientY);
    });
    window.addEventListener("pointermove", (e) => { if (e.pointerType !== "touch") fingerMove(pid(e), e.clientX, e.clientY); });
    window.addEventListener("pointerup", (e) => { if (e.pointerType !== "touch") fingerUp(pid(e)); });
    window.addEventListener("pointercancel", (e) => { if (e.pointerType !== "touch") fingerUp(pid(e)); });
    canvas.addEventListener("pointerdown", (e) => { e.preventDefault(); if (mode === "title") clickGo(); });

    // ── 상태 ──
    let mode = "title";
    let S = null;
    let hero = 0;
    try { hero = localStorage.getItem("hk-vitamin-hero") === "1" ? 1 : 0; } catch (_) {}
    let T = 0, submitted = false, nextId = 1;
    const rnd = (a, b) => a + Math.random() * (b - a);
    const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
    function sfx(name, gap = 0.04) {
      if (S) { const k = "_s" + name; if (S[k] != null && S.t - S[k] < gap) return; S[k] = S.t; }
      ctx.sfx(name);
    }

    function newGame() {
      S = {
        t: 0, score: 0, bump: 0, lives: 3, gren: 10, weapon: "B", ammo: 0, stage: 0, def: null,
        camX: 0, lockX: 0, lock: null, evIdx: 0, ev: [], queue: [],
        time: 99, timeAcc: 0, phase: "run", phaseT: 0, hitStop: 0,
        p: null, enemies: [], pb: [], eb: [], fx: [], items: [], caps: [], grens: [], amb: [],
        boss: null, banner: null, shake: 0, flash: 0, tally: null, rescued: 0, kills: 0, bg: null, bossLag: 1,
      };
      loadStage(0);
    }
    function loadStage(i) {
      S.stage = i;
      S.def = scaled(i);
      S.camX = 0; S.lockX = S.def.arena; S.lock = null;
      S.ev = S.def.ev.map((e) => ({ at: PLACED[e[1]] ? e[0] - 24 : e[0], x: e[0], kind: e[1], n: e[2], gap: e[3] })).sort((a, b) => a.at - b.at);
      S.evIdx = 0; S.queue = [];
      S.enemies = []; S.pb = []; S.eb = []; S.fx = []; S.items = []; S.caps = []; S.grens = []; S.amb = [];
      S.boss = null; S.bossLag = 1;
      S.time = 99; S.timeAcc = 0;
      S.phase = "run"; S.phaseT = 0;
      S.p = newPlayer(52, groundTop(46, 58));
      S.banner = { kind: "stage", t: 0, life: 3 };
      S.bg = getBG(i);
      S.tally = null;
      Music.play(S.def.tune);
      ctx.sfx("go");
    }
    const bgCache = [];
    const getBG = (i) => bgCache[i] || (bgCache[i] = makeBG(i));
    function newPlayer(x, y) {
      return { x, y, vx: 0, vy: 0, f: 1, ground: true, crouch: false, aim: "f", fireCd: 0, grenCd: 0, anim: 0, invul: 0, dead: 0, shootT: 0, jumpBuf: 0, coyote: 0, spin: 0, landT: 0, idleT: 0, flashT: 0 };
    }

    // ── 지형 ──
    function groundTop(x0, x1) {
      const gr = S.def.ground;
      let top = 999;
      for (let i = 0; i < gr.length; i++) {
        const a = gr[i][0], b = i + 1 < gr.length ? gr[i + 1][0] : 1e9;
        if (b <= x0 || a > x1) continue;
        if (gr[i][1] < top) top = gr[i][1];
      }
      return top === 999 ? BASE : top;
    }
    const groundAt = (x) => groundTop(x, x);
    function moveX(o, dx, hw, maxStep) {
      if (!dx) return false;
      const nx = o.x + dx;
      const top = groundTop(nx - hw, nx + hw);
      if (top < o.y - maxStep) return true;
      o.x = nx;
      if (o.ground && top < o.y) o.y = top;
      return false;
    }
    function fall(o, hw, dt, grav = GRAV) {
      o.vy += grav * dt;
      if (o.vy > 520) o.vy = 520;
      o.y += o.vy * dt;
      const top = groundTop(o.x - hw, o.x + hw);
      if (o.vy >= 0 && o.y >= top) { o.y = top; o.vy = 0; const was = o.ground; o.ground = true; return !was; }
      o.ground = false;
      return false;
    }

    // ── 상자 ──
    const pBox = (p) => (p.crouch ? [p.x - 9, p.y - 24, p.x + 9, p.y] : [p.x - 6, p.y - 37, p.x + 6, p.y]);
    function eBox(e) {
      switch (e.type) {
        case "sol": return [e.x - 8, e.y - 34, e.x + 8, e.y];
        case "shield": return [e.x - 10, e.y - 40, e.x + 10, e.y];
        case "germ": return [e.x - 9, e.y - 19, e.x + 9, e.y];
        case "drone": return [e.x - 12, e.y - 8, e.x + 12, e.y + 8];
        case "para": return [e.x - 8, e.y - 34, e.x + 8, e.y];
        case "turret": return [e.x - 12, e.y - 32, e.x + 12, e.y]; // 서서 쏜 탄(발 위 26)이 닿게 포신까지
        case "mortar": return [e.x - 11, e.y - 32, e.x + 11, e.y];
        case "mini": return [e.x - 9, e.y - 7, e.x + 9, e.y + 7];
      }
      return [e.x - 8, e.y - 16, e.x + 8, e.y];
    }
    const overlap = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
    const inBox = (x, y, b, m = 0) => x > b[0] - m && x < b[2] + m && y > b[1] - m && y < b[3] + m;
    const onScreen = (x, m = 0) => x > S.camX - m && x < S.camX + W + m;

    // ── 생성 ──
    function spawn(kind, i = 0, gap = 30, x = null) {
      if (S.enemies.length >= LIMIT.enemies) return null;
      const right = S.camX + W + 16 + i * gap;
      const base = { id: nextId++, t: 0, flash: 0, f: -1, vx: 0, vy: 0, ground: true, group: 0 };
      let e = null;
      const d = S.def.diff;
      switch (kind) {
        case "sol": e = { ...base, type: "sol", x: right, y: groundAt(right), hp: 1, cd: rnd(1.4, 2.2) / d, state: "walk" }; break;
        case "bsol": { const lx = S.camX - 16 - i * gap; e = { ...base, type: "sol", x: lx, y: groundAt(lx), f: 1, hp: 1, cd: rnd(1.8, 2.6) / d, state: "walk" }; break; }
        case "germ": e = { ...base, type: "germ", x: right, y: groundAt(right), hp: d > 1.2 ? 3 : 2, vx: -rnd(62, 80) * (0.8 + d * 0.2), spin: 0 }; break;
        case "drone": e = { ...base, type: "drone", x: right + 10, y: rnd(44, 76), hp: 2, cd: rnd(1.5, 2.5) / d, hy: rnd(44, 76), ph: Math.random() * 6 }; break;
        case "para": { const px = S.camX + rnd(150, W - 40) + i * 16; e = { ...base, type: "para", x: Math.min(px, S.camX + W - 24), y: -30 - i * 40, hp: 1, shot: false, ground: false, sway: Math.random() * 6 }; break; }
        case "shield": e = { ...base, type: "shield", x: right, y: groundAt(right), hp: 3, shieldHp: 10, cd: 2.2 / d, low: 0 }; break;
        case "turret": e = { ...base, type: "turret", x, y: groundAt(x), hp: 8, cd: 1.6, ang: Math.PI, burst: 0, bt: 0 }; break;
        case "mortar": e = { ...base, type: "mortar", x, y: groundAt(x), hp: 4, cd: 1.8 }; break;
        case "mini": e = { ...base, type: "mini", x: x != null ? x : right, y: 70, hp: 1, cd: 1.5, ph: Math.random() * 6, hy: rnd(56, 96) }; break;
      }
      if (e) S.enemies.push(e);
      return e;
    }
    function fireEvent(ev) {
      if (ev.kind === "cap") { S.caps.push({ x: ev.x, y: groundAt(ev.x), give: ev.n || "G", state: "tied", t: 0 }); return; }
      if (ev.kind === "turret" || ev.kind === "mortar") { spawn(ev.kind, 0, 0, ev.x); return; }
      if (ev.kind === "lock") {
        const id = nextId++;
        S.lock = { id, left: 0, t: 0 };
        S.lockX = Math.min(S.lockX, ev.x - W);
        for (const [delay, kind, n = 1, gap = 30] of ev.n) for (let i = 0; i < n; i++) { S.queue.push({ at: S.t + delay + (kind === "para" ? i * 0.4 : 0), kind, i, gap, group: id }); S.lock.left++; }
        return;
      }
      for (let i = 0; i < (ev.n || 1); i++) spawn(ev.kind, i, ev.gap || 30);
    }

    // ── 플레이어 ──
    function aimVec(p) {
      const s = Math.SQRT1_2;
      switch (p.crouch ? "f" : p.aim) {
        case "u": return [0, -1];
        case "du": return [s * p.f, -s];
        case "d": return [0, 1];
        case "dd": return [s * p.f, s];
      }
      return [p.f, 0];
    }
    function bodyPose(p) {
      if (p.dead > 0) return "hurt";
      if (p.crouch) return p.vx !== 0 ? "crouch" + (Math.floor(p.anim * 0.6) % 2) : "crouch0";
      if (!p.ground) return p.vy < 0 ? "jumpU" : "jumpD";
      if (p.landT > 0) return "land";
      if (p.vx !== 0) return "run" + (Math.floor(p.anim) % 6);
      return "idle" + (Math.floor(p.idleT * 2.2) % 2);
    }
    function armOffset(p, pose) {
      if (p.crouch) return [0, 0];
      return [pose.lean || 0, (pose.bob || 0) + (pose.squash ? 3 : 0)];
    }
    function muzzle(p) {
      const pose = heroSprites(hero).body[bodyPose(p)].pose;
      const a = ARMS[p.crouch ? "cf" : p.aim];
      const [ox, oy] = armOffset(p, pose);
      return [p.x + (a.m[0] + ox) * p.f, p.y + a.m[1] + oy];
    }
    function fire(p) {
      const w = S.weapon;
      const [dx, dy] = aimVec(p);
      const [mx, my] = muzzle(p);
      p.shootT = 0.12; p.flashT = 0.06;
      if (S.pb.length >= LIMIT.pb) return;
      if (w === "B") {
        S.pb.push({ k: "B", x: mx, y: my, vx: dx * 320, vy: dy * 320, life: 1.3, dmg: 1 });
        sfx("shoot", 0.07); casing(p);
      } else if (w === "S") {
        const a0 = Math.atan2(dy, dx);
        for (const o of [-0.3, -0.15, 0, 0.15, 0.3]) S.pb.push({ k: "S", x: mx, y: my, vx: Math.cos(a0 + o) * 260, vy: Math.sin(a0 + o) * 260, life: 0.95, dmg: 1 });
        sfx("shoot", 0.07); casing(p);
      } else if (w === "L") {
        S.pb.push({ k: "L", x: mx, y: my, vx: dx * 440, vy: dy * 440, life: 1, dmg: 2, pierce: true, hits: [] });
        sfx("laser", 0.12);
      } else if (w === "F") {
        const a0 = Math.atan2(dy, dx) + rnd(-0.12, 0.12), sp = rnd(190, 225);
        S.pb.push({ k: "F", x: mx, y: my, vx: Math.cos(a0) * sp, vy: Math.sin(a0) * sp, life: 0.42, age: 0, dmg: 0.55, pierce: true, hits: [] });
        sfx("whoosh", 0.3);
      }
      if (w !== "B") {
        S.ammo--;
        if (S.ammo <= 0) { S.weapon = "B"; S.ammo = 0; popText(p.x, p.y - 48, "기본 총으로", C.shirt[3]); }
      }
    }
    function casing(p) {
      if (S.fx.length > LIMIT.fx) return;
      S.fx.push({ k: "case", x: p.x + 4 * p.f, y: p.y - (p.crouch ? 16 : 26), vx: -p.f * rnd(40, 70), vy: rnd(-140, -90), life: 1, b: 0 });
    }
    function throwGren(p) {
      if (S.gren <= 0 || p.grenCd > 0) return;
      S.gren--; p.grenCd = 0.35;
      const up = p.aim === "u" || p.aim === "du";
      S.grens.push({ x: p.x + 6 * p.f, y: p.y - (p.crouch ? 18 : 32), vx: (up ? 70 : 140) * p.f + p.vx * 0.3, vy: up ? -330 : -210, t: 0 });
      sfx("swap", 0.05);
    }
    function hurtPlayer(why) {
      const p = S.p;
      if (p.dead > 0 || p.invul > 0 || S.god) return;
      if (S.phase !== "run" && S.phase !== "warning" && S.phase !== "boss" && S.phase !== "bossmid") return;
      S.lives--;
      (S.hurtLog || (S.hurtLog = [])).push(why || "?");
      p.dead = 1.3; p.vy = -230; p.vx = -55 * p.f; p.ground = false; p.spin = 0; p.crouch = false;
      boom(p.x, p.y - 18, 14, true);
      sparkle(p.x, p.y - 20, 18, C.gold[3]);
      S.shake = Math.max(S.shake, 5); S.flash = 0.12; S.hitStop = 0.1;
      ctx.sfx("hurt");
      S.eb = S.eb.filter((b) => Math.abs(b.x - p.x) > 100 || b.k === "puddle");
      if (why === "time") popText(p.x, p.y - 52, "시간 초과!", C.red[3]);
    }
    function respawn() {
      const p = S.p;
      if (S.lives <= 0) { gameOver(); return; }
      Object.assign(p, newPlayer(clamp(S.camX + 60, S.camX + 24, S.camX + W - 24), -20));
      p.ground = false; p.invul = 2.6;
      S.weapon = "B"; S.ammo = 0; S.gren = Math.max(S.gren, 6);
    }
    function updatePlayer(dt) {
      const p = S.p;
      if (p.dead > 0) {
        p.dead -= dt; p.spin += dt * 14;
        p.vy += GRAV * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        const top = groundAt(p.x);
        if (p.y > top) { p.y = top; p.vy = -p.vy * 0.3; p.vx *= 0.6; }
        p.x = clamp(p.x, S.camX + 8, S.camX + W - 8);
        if (p.dead <= 0) respawn();
        return;
      }
      const L = inp.left, R = inp.right, U = inp.up, D = inp.down;
      const mv = (R ? 1 : 0) - (L ? 1 : 0);
      if (mv) p.f = mv;
      p.crouch = p.ground && D && !U;
      if (U) p.aim = mv ? "du" : "u";
      else if (D && !p.ground) p.aim = mv ? "dd" : "d";
      else p.aim = "f";
      p.vx = mv * (p.crouch ? CRAWL : RUN);
      moveX(p, p.vx * dt, p.crouch ? 9 : 6, 3);
      // 화면이 멈춘 동안(무리 화면 · 보스)은 오른쪽 끝에 붙지 못한다 — 들어오는 적과 겹치지 않게
      const locked = S.camX >= S.lockX - 0.5;
      p.x = clamp(p.x, S.camX + 8, S.camX + W - (locked ? 48 : 8));
      if (jumpEdge) { p.jumpBuf = 0.12; jumpEdge = false; }
      if (p.jumpBuf > 0) p.jumpBuf -= dt;
      if (p.ground) p.coyote = 0.08; else if (p.coyote > 0) p.coyote -= dt;
      if (p.jumpBuf > 0 && p.coyote > 0) {
        p.vy = JUMP_V; p.ground = false; p.coyote = 0; p.jumpBuf = 0; p.crouch = false;
        sfx("jump", 0.1); dust(p.x, p.y, 3);
      }
      if (!inp.jump && p.vy < P_SHORT) p.vy = P_SHORT; // 짧게 누르면 낮게
      const landed = fall(p, 6, dt, p.vy > 0 ? P_GRAV * P_FALL : P_GRAV); // 내려올 때 조금 더 빨리
      if (p.vy > 600) p.vy = 600;
      if (landed) { sfx("land", 0.2); dust(p.x, p.y, 6); p.landT = 0.08; }
      if (p.landT > 0) p.landT -= dt;
      if (p.ground && mv) { p.anim += dt * 12; if (!p.crouch && Math.random() < dt * 3) dust(p.x - p.f * 4, p.y, 1); }
      else if (!mv) p.anim = 0;
      p.idleT += dt;
      if (p.fireCd > 0) p.fireCd -= dt;
      if (inp.fire && p.fireCd <= 0) { fire(p); p.fireCd = WPN[S.weapon].rate; }
      if (p.grenCd > 0) p.grenCd -= dt;
      if (grenEdge) { grenEdge = false; throwGren(p); }
      if (p.shootT > 0) p.shootT -= dt;
      if (p.flashT > 0) p.flashT -= dt;
      if (p.invul > 0) p.invul -= dt;
    }

    // ── 카메라 · 이벤트 ──
    function updateCamera(dt) {
      const p = S.p;
      const target = p.x - W * 0.4;
      if (target > S.camX) S.camX = Math.min(S.lockX, S.camX + Math.min(target - S.camX, 170 * dt));
      while (S.evIdx < S.ev.length && S.camX + W >= S.ev[S.evIdx].at) { fireEvent(S.ev[S.evIdx]); S.evIdx++; }
      for (let i = S.queue.length - 1; i >= 0; i--) {
        const q = S.queue[i];
        if (S.t >= q.at) {
          S.queue.splice(i, 1);
          const e = spawn(q.kind, q.i, q.gap);
          if (e) e.group = q.group;
          if (S.lock && q.group === S.lock.id) S.lock.left--;
        }
      }
      if (S.lock) S.lock.t += dt;
      if (S.lock && S.lock.left <= 0) {
        // 혹시 어딘가 끼어 못 잡는 적이 있어도 40초 뒤엔 풀린다
        if (S.lock.t > 40) S.enemies.forEach((e) => { if (e.group === S.lock.id) e.dead = true; });
        if (!S.enemies.some((e) => e.group === S.lock.id && !e.dead)) {
          S.lock = null; S.lockX = S.def.arena;
          S.banner = { kind: "go", t: 0, life: 2 };
          ctx.sfx("success");
        }
      }
      if (S.phase === "run" && S.camX >= S.def.arena - 0.5) startWarning();
    }

    // ── 적 ──
    function eShoot(x, y, tx, ty, sp) {
      if (S.eb.length >= LIMIT.eb) return;
      const a = Math.atan2(ty - y, tx - x);
      sp *= 0.85 + S.def.diff * 0.15;
      S.eb.push({ k: "orb", src: "aimed", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 2, life: 4 });
    }
    function lob(x, y, tx, ty, flight = 1.2, k = "shell", grav = 320) {
      if (S.eb.length >= LIMIT.eb) return;
      S.eb.push({ k, x, y, vx: (tx - x) / flight, vy: (ty - y - 0.5 * grav * flight * flight) / flight, grav, r: 3, life: 5 });
    }
    function updateEnemies(dt) {
      const p = S.p, px = p.x, py = p.y - (p.crouch ? 12 : 24), alive = p.dead <= 0, d = S.def.diff;
      for (const e of S.enemies) {
        e.t += dt;
        if (e.flash > 0) e.flash -= dt;
        const vis = onScreen(e.x, -8);
        switch (e.type) {
          case "sol": {
            e.f = px < e.x ? -1 : 1;
            const dist = Math.abs(px - e.x);
            // 화면 밖에 있으면 먼저 화면 안으로 걸어 들어온다 (밖에서 버티면 무리 화면이 안 풀린다)
            const inward = e.x > S.camX + W - 16 ? -1 : e.x < S.camX + 16 ? 1 : 0;
            e.moving = false;
            if (e.state === "walk") {
              if (inward) { e.f = inward; e.moving = true; if (moveX(e, inward * 36 * dt, 6, 3) && e.ground) { e.vy = -290; e.ground = false; } }
              else if (dist > 130) { e.moving = true; if (moveX(e, e.f * 32 * dt, 6, 3) && e.ground) { e.vy = -290; e.ground = false; } }
              else if (dist < 56 && e.t > 1) { const nx = e.x - e.f * 24 * dt; if (nx > S.camX + 18 && nx < S.camX + W - 18) { e.moving = true; moveX(e, -e.f * 24 * dt, 6, 3); } }
              e.cd -= dt;
              if (e.cd <= 0 && vis && alive) { e.state = "aim"; e.st = d > 1.2 ? 0.4 : 0.55; }
            } else if (e.state === "aim") {
              e.st -= dt;
              if (e.st <= 0) {
                e.state = "walk"; e.cd = rnd(2.2, 3.2) / d;
                if (S.eb.length < LIMIT.eb) S.eb.push({ k: "orb", src: "sol", x: e.x + e.f * 17, y: e.y - 27, vx: e.f * (55 + 30 * d), vy: 0, r: 2, life: 4 });
                muzzleFx(e.x + e.f * 17, e.y - 27, true);
                sfx("hit", 0.15);
              }
            }
            fall(e, 6, dt);
            break;
          }
          case "shield": {
            e.f = px < e.x ? -1 : 1;
            const dist = Math.abs(px - e.x);
            e.moving = false;
            if (e.low > 0) {
              e.low -= dt;
              if (e.low < 0.45 && !e.fired) {
                e.fired = true;
                for (let k = 0; k < 2; k++) S.eb.push({ k: "orb", src: "shield", x: e.x + e.f * 20, y: e.y - 27 + k * 12, vx: e.f * (95 + 15 * d), vy: 0, r: 2, life: 4 });
                muzzleFx(e.x + e.f * 20, e.y - 26, true);
                sfx("hit", 0.15);
              }
            } else {
              const inward = e.x > S.camX + W - 18 ? -1 : e.x < S.camX + 18 ? 1 : 0;
              if (inward) { e.f = inward; e.moving = true; moveX(e, inward * 26 * dt, 9, 3); }
              else if (dist > 84) { e.moving = true; moveX(e, e.f * 18 * dt, 9, 3); }
              e.cd -= dt;
              if (e.cd <= 0 && vis && alive) { e.low = 0.9; e.fired = false; e.cd = rnd(2.2, 3) / d; }
            }
            fall(e, 9, dt);
            break;
          }
          case "germ": {
            e.spin += e.vx * dt * 0.2;
            if (moveX(e, e.vx * dt, 7, 3) && e.ground) { e.vy = -300; e.ground = false; }
            fall(e, 7, dt);
            if (d > 1.1 && e.ground && Math.random() < dt * 0.6) { e.vy = -120; e.ground = false; }
            break;
          }
          case "drone":
          case "mini": {
            const want = px + Math.sin(e.t * 0.9 + e.ph) * 54;
            e.x += clamp(want - e.x, -1, 1) * (e.type === "mini" ? 58 : 44) * dt;
            if (e.x > S.camX + W - 16 && e.t > 1.5) e.x = S.camX + W - 16;
            e.y += ((e.hy + Math.sin(e.t * 3 + e.ph) * 8) - e.y) * Math.min(1, dt * 2);
            e.cd -= dt;
            if (e.cd <= 0 && vis && alive) {
              if (e.type === "drone" && Math.abs(px - e.x) < 40) {
                if (S.eb.length < LIMIT.eb) S.eb.push({ k: "bomb", x: e.x, y: e.y + 8, vx: 0, vy: 20, grav: 300, r: 3, life: 4 });
                e.cd = rnd(1.8, 2.6) / d;
              } else if (e.type === "mini") { eShoot(e.x, e.y + 4, px, py, 80); e.cd = rnd(2, 3) / d; }
              else e.cd = 0.3;
            }
            break;
          }
          case "para": {
            if (!e.ground) {
              e.y += 32 * dt;
              e.x += Math.sin(e.t * 1.6 + e.sway) * 16 * dt;
              if (!e.shot && e.y > 64 && alive && vis) { e.shot = true; eShoot(e.x, e.y - 22, px, py, d > 1.2 ? 75 : 62); }
              const top = groundAt(e.x);
              if (e.y >= top) { e.y = top; e.ground = true; e.type = "sol"; e.hp = 1; e.state = "walk"; e.cd = rnd(1, 1.8) / d; e.para = true; dust(e.x, e.y, 5); }
            }
            break;
          }
          case "turret": {
            // 아래쪽은 거의 못 겨눈다 (땅에 박힌 포탑)
            let target = Math.atan2(py - (e.y - 16), px - e.x);
            if (target > 0.35 && target < Math.PI / 2) target = 0.35;
            if (target >= Math.PI / 2 && target < Math.PI - 0.35) target = Math.PI - 0.35;
            let da = target - e.ang;
            while (da > Math.PI) da -= Math.PI * 2;
            while (da < -Math.PI) da += Math.PI * 2;
            e.ang += clamp(da, -2 * dt, 2 * dt);
            e.cd -= dt;
            if (e.cd <= 0 && vis && alive) { e.burst = d > 1.4 ? 3 : d > 1.1 ? 2 : 1; e.bt = 0.45; e.cd = rnd(3, 3.8) / d; }
            if (e.burst > 0) {
              e.bt -= dt;
              if (e.bt <= 0) {
                e.burst--; e.bt = 0.18;
                const bx = e.x + Math.cos(e.ang) * 17, by = e.y - 16 + Math.sin(e.ang) * 17, sp = 40 + 36 * d;
                if (S.eb.length < LIMIT.eb) S.eb.push({ k: "orb", src: "turret", x: bx, y: by, vx: Math.cos(e.ang) * sp, vy: Math.sin(e.ang) * sp, r: 2, life: 4 });
                muzzleFx(bx, by, true);
                sfx("hit", 0.1);
              }
            }
            break;
          }
          case "mortar": {
            e.f = px < e.x ? -1 : 1;
            e.cd -= dt;
            if (e.cd <= 0 && vis && alive) { e.cd = rnd(2.6, 3.4) / d; e.puff = 0.3; lob(e.x + 4 * e.f, e.y - 27, px + rnd(-14, 14), groundAt(px), 1.3); sfx("drop", 0.1); }
            if (e.puff > 0) e.puff -= dt;
            break;
          }
        }
      }
      S.enemies = S.enemies.filter((e) => !e.dead && e.x > S.camX - 70 && e.y < H + 40 && e.x < S.camX + W + 600);
    }
    function damageEnemy(e, dmg) { e.hp -= dmg; e.flash = 0.06; if (e.hp <= 0 && !e.dead) killEnemy(e); }
    function killEnemy(e) {
      e.dead = true;
      addScore(e.para ? PTS.sol : PTS[e.type] || 100, e.x, e.y - 28);
      S.kills++;
      const big = e.type === "turret" || e.type === "shield" || e.type === "mortar";
      const cy = e.type === "drone" || e.type === "mini" ? e.y : e.y - 16;
      boom(e.x, cy, big ? 18 : 12, big);
      sparkle(e.x, cy, big ? 18 : 12, C.virus[3]);
      ctx.sfx("explode");
      if (big) { S.shake = Math.max(S.shake, 3); S.hitStop = Math.max(S.hitStop, 0.04); }
    }
    function addScore(n, x, y) {
      S.score = Math.min(9999999, S.score + n);
      S.bump = 0.15;
      if (x != null) popText(x, y, comma(n), C.gold[3], true);
    }

    // ── 탄 · 충돌 ──
    function updateShots(dt) {
      const p = S.p;
      for (const b of S.pb) {
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
        if (b.k === "F") { b.age += dt; b.vx *= 1 - dt * 1.6; b.vy *= 1 - dt * 1.6; b.vy -= 30 * dt; }
        if (b.y > groundAt(b.x) && b.k !== "F") { b.life = 0; spark(b.x, groundAt(b.x) - 1, C.gold[4]); continue; }
        if (b.x < S.camX - 10 || b.x > S.camX + W + 10 || b.y < -20 || b.y > H + 10) { b.life = 0; continue; }
        // 동료 구하기 — 맞히면 풀려난다
        for (const c of S.caps) if (c.state === "tied" && inBox(b.x, b.y, [c.x - 9, c.y - 26, c.x + 9, c.y], 2)) { freeCaptive(c); if (!b.pierce) b.life = 0; }
        if (b.life <= 0) continue;
        for (const e of S.enemies) {
          if (e.dead || (b.hits && b.hits.includes(e.id))) continue;
          const box = eBox(e);
          const m = b.k === "F" ? 3 + b.age * 12 : 2;
          if (!inBox(b.x, b.y, box, m)) continue;
          // 방패 로봇 — 앞에서 온 탄은 방패가 막는다
          if (e.type === "shield" && e.shieldHp > 0 && e.low <= 0 && Math.sign(b.vx) === -e.f && Math.abs(b.vx) > Math.abs(b.vy) * 0.8) {
            e.shieldHp -= b.dmg;
            spark(e.x + e.f * 12, b.y, C.gold[4]);
            sfx("tick", 0.06);
            if (e.shieldHp <= 0) { sparkle(e.x + e.f * 12, e.y - 20, 14, C.gold[3]); ctx.sfx("pop"); }
            if (b.pierce) b.hits.push(e.id); else b.life = 0;
            break;
          }
          damageEnemy(e, b.dmg);
          spark(b.x, b.y, CREAM);
          if (!e.dead) sfx("hit", 0.08);
          if (b.pierce) b.hits.push(e.id); else { b.life = 0; break; }
        }
        if (b.life > 0 && S.boss && S.boss.hp > 0 && !(b.hits && b.hits.includes("boss"))) {
          for (const box of bossBoxes()) {
            if (inBox(b.x, b.y, box, b.k === "F" ? 3 + b.age * 12 : 1)) {
              hitBoss(b.dmg); spark(b.x, b.y, CREAM);
              if (b.pierce) b.hits.push("boss"); else b.life = 0;
              break;
            }
          }
        }
      }
      S.pb = S.pb.filter((b) => b.life > 0);
      for (const gr of S.grens) {
        gr.t += dt; gr.vy += 620 * dt; gr.x += gr.vx * dt; gr.y += gr.vy * dt;
        let hit = gr.y >= groundAt(gr.x) || gr.t > 2.5;
        if (!hit) for (const e of S.enemies) if (!e.dead && inBox(gr.x, gr.y, eBox(e), 2)) { hit = true; break; }
        if (!hit && S.boss && S.boss.hp > 0) for (const box of bossBoxes()) if (inBox(gr.x, gr.y, box, 2)) { hit = true; break; }
        if (hit) { gr.done = true; blast(gr.x, Math.min(gr.y, groundAt(gr.x)), 36, 8); }
      }
      S.grens = S.grens.filter((gr) => !gr.done);
      const pb = pBox(p), hitBox = [pb[0] + 1, pb[1] + 2, pb[2] - 1, pb[3]];
      const canHurt = p.dead <= 0 && p.invul <= 0;
      for (const b of S.eb) {
        b.life -= dt;
        if (b.k === "puddle") { if (canHurt && overlap(hitBox, [b.x - b.w / 2, b.y - 3, b.x + b.w / 2, b.y + 1])) hurtPlayer("puddle"); continue; }
        if (b.k === "beam") { b.t += dt; if (b.t > b.warn && canHurt && overlap(hitBox, [b.x0, b.y - b.h / 2, b.x1, b.y + b.h / 2])) hurtPlayer("beam"); continue; }
        if (b.k === "wave") { b.x += b.vx * dt; if (canHurt && overlap(hitBox, [b.x - 6, b.y - 14, b.x + 6, b.y])) hurtPlayer("wave"); if (b.x < S.camX - 20 || b.x > S.camX + W + 20) b.life = 0; continue; }
        if (b.k === "blast") {
          if (b.life > b.max - 0.18 && canHurt) { const cx = clamp(b.x, hitBox[0], hitBox[2]), cy = clamp(b.y, hitBox[1], hitBox[3]); if ((cx - b.x) ** 2 + (cy - b.y) ** 2 < b.r * b.r) hurtPlayer("blast"); }
          continue;
        }
        if (b.grav) b.vy += b.grav * dt;
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.k === "missile" || b.k === "shell") { b.tr = (b.tr || 0) + dt; if (b.tr > 0.05 && S.fx.length < LIMIT.fx) { b.tr = 0; S.fx.push({ k: "puff", x: b.x - Math.sign(b.vx) * 5, y: b.y, life: 0.4 }); } }
        const gy = groundAt(b.x);
        if (b.y >= gy) {
          b.life = 0;
          if (b.k === "shell" || b.k === "bomb") enemyBlast(b.x, gy, 17);
          else if (b.k === "glob") { S.eb.push({ k: "puddle", x: b.x, y: gy, w: 24, life: 2.6 }); sparkle(b.x, gy - 2, 6, C.virus[3]); ctx.sfx("drop"); }
          else spark(b.x, gy - 1, C.pink[3]);
          continue;
        }
        if (b.x < S.camX - 30 || b.x > S.camX + W + 30 || b.y < -60) { b.life = 0; continue; }
        if (canHurt && inBox(b.x, b.y, hitBox, b.r - 1)) {
          b.life = 0;
          if (b.k === "shell" || b.k === "bomb") enemyBlast(b.x, b.y, 17);
          else hurtPlayer(b.src ? b.k + ":" + b.src : b.k);
        }
      }
      S.eb = S.eb.filter((b) => b.life > 0);
      // 몸에 닿으면 — 굴러오는 세균 공 · 꼬마 드론 · 보스
      if (canHurt) {
        for (const e of S.enemies) if (!e.dead && (e.type === "germ" || e.type === "mini") && overlap(hitBox, eBox(e))) { hurtPlayer(e.type); break; }
        if (S.boss && S.boss.hp > 0) for (const box of bossBoxes()) if (overlap(hitBox, box)) { hurtPlayer("boss"); break; }
      }
    }
    function blast(x, y, r, dmg) {
      boom(x, y - 6, r * 0.75, true);
      sparkle(x, y - 8, 16, C.gold[3]);
      ring(x, y - 6, r);
      S.shake = Math.max(S.shake, 4); S.hitStop = Math.max(S.hitStop, 0.03); S.flash = Math.max(S.flash, 0.05);
      ctx.sfx("explode");
      for (const e of S.enemies) {
        if (e.dead) continue;
        const b = eBox(e), cx = clamp(x, b[0], b[2]), cy = clamp(y, b[1], b[3]);
        if ((cx - x) ** 2 + (cy - y) ** 2 < r * r) damageEnemy(e, dmg);
      }
      for (const c of S.caps) if (c.state === "tied" && Math.abs(c.x - x) < r) freeCaptive(c);
      if (S.boss && S.boss.hp > 0) for (const b of bossBoxes()) { const cx = clamp(x, b[0], b[2]), cy = clamp(y, b[1], b[3]); if ((cx - x) ** 2 + (cy - y) ** 2 < r * r) { hitBoss(dmg); break; } }
    }
    function enemyBlast(x, y, r) {
      S.eb.push({ k: "blast", x, y: y - 5, r, life: 0.35, max: 0.35 });
      boom(x, y - 6, r * 0.8, false);
      sfx("explode", 0.08);
      S.shake = Math.max(S.shake, 2);
    }

    // ── 동료 · 아이템 ──
    function updateCaps(dt) {
      const pb = pBox(S.p);
      for (const c of S.caps) {
        c.t += dt;
        if (c.state === "tied") { if (S.p.dead <= 0 && overlap(pb, [c.x - 9, c.y - 26, c.x + 9, c.y])) freeCaptive(c); }
        else if (c.state === "free") { c.st -= dt; if (c.st <= 0) c.state = "run"; }
        else c.x -= 80 * dt;
      }
      S.caps = S.caps.filter((c) => c.x > S.camX - 30);
      for (const it of S.items) {
        it.t += dt;
        if (!it.ground) {
          it.vy += 520 * dt; it.y += it.vy * dt; it.x += it.vx * dt;
          const top = groundAt(it.x);
          if (it.y >= top) { it.y = top; it.ground = true; }
        }
        if (S.p.dead <= 0 && it.t > 0.25 && overlap(pb, [it.x - 8, it.y - 16, it.x + 8, it.y])) pickItem(it);
      }
      S.items = S.items.filter((it) => !it.done && it.x > S.camX - 20);
    }
    function freeCaptive(c) {
      if (c.state !== "tied") return;
      c.state = "free"; c.st = 0.9; c.t = 0;
      S.rescued++;
      addScore(1000, c.x, c.y - 36);
      S.items.push({ x: c.x, y: c.y - 20, vx: 26, vy: -190, kind: c.give, t: 0, ground: false });
      popText(c.x, c.y - 48, "고마워요!", C.virus[4]);
      sparkle(c.x, c.y - 16, 10, C.rope[2]);
      ctx.sfx("coin");
    }
    function pickItem(it) {
      it.done = true;
      if (it.kind === "G") S.gren = Math.min(20, S.gren + 5);
      else if (S.weapon === it.kind) S.ammo = Math.min(WPN[it.kind].ammo * 2, S.ammo + WPN[it.kind].ammo);
      else { S.weapon = it.kind; S.ammo = WPN[it.kind].ammo; }
      popText(it.x, it.y - 26, ITEM_NAME[it.kind], C.gold[4]);
      sparkle(it.x, it.y - 8, 12, C.gold[3]);
      ring(it.x, it.y - 8, 18, C.gold[4]);
      ctx.sfx("powerup");
    }

    // ── 효과 ──
    function boom(x, y, r, big) {
      if (S.fx.length > LIMIT.fx) return;
      S.fx.push({ k: "boom", x, y, r, life: big ? 0.55 : 0.4, max: big ? 0.55 : 0.4 });
      if (big) for (let i = 0; i < 3; i++) S.fx.push({ k: "boom", x: x + rnd(-r, r) * 0.6, y: y + rnd(-r, r) * 0.5, r: r * 0.6, life: 0.42 + i * 0.08, max: 0.42 + i * 0.08 });
      for (let i = 0; i < (big ? 5 : 3); i++) S.fx.push({ k: "smoke", x: x + rnd(-r, r) * 0.5, y: y + rnd(-r, r) * 0.3, vx: rnd(-14, 14), vy: rnd(-30, -12), r: rnd(3, 6), life: rnd(0.6, 1), max: 1 });
    }
    function ring(x, y, r, col = CREAM) { if (S.fx.length < LIMIT.fx) S.fx.push({ k: "ring", x, y, r, life: 0.3, max: 0.3, col }); }
    function sparkle(x, y, n, col) {
      for (let i = 0; i < n && S.fx.length < LIMIT.fx; i++) {
        const a = Math.random() * Math.PI * 2, sp = rnd(30, 120);
        S.fx.push({ k: "star", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, life: rnd(0.4, 0.85), col: Math.random() < 0.35 ? CREAM : col });
      }
    }
    function spark(x, y, col) { if (S.fx.length <= LIMIT.fx) S.fx.push({ k: "spark", x, y, life: 0.09, col }); }
    function muzzleFx(x, y, enemy) { if (S.fx.length <= LIMIT.fx) S.fx.push({ k: "mflash", x, y, life: 0.06, enemy }); }
    function dust(x, y, n) { for (let i = 0; i < n && S.fx.length < LIMIT.fx; i++) S.fx.push({ k: "dust", x: x + rnd(-6, 6), y: y - 1, vx: rnd(-30, 30), vy: rnd(-24, -6), life: rnd(0.25, 0.45), max: 0.45 }); }
    function popText(x, y, str, col, small) { if (S.fx.length <= LIMIT.fx) S.fx.push({ k: "text", x, y, str, col, small, life: 0.9 }); }
    function updateFx(dt) {
      for (const f of S.fx) {
        f.life -= dt;
        if (f.k === "star" || f.k === "dust" || f.k === "smoke") { f.x += f.vx * dt; f.y += f.vy * dt; if (f.k === "star") f.vy += 180 * dt; if (f.k === "smoke") f.r += dt * 4; }
        else if (f.k === "case") {
          f.vy += 600 * dt; f.x += f.vx * dt; f.y += f.vy * dt;
          const gy = groundAt(f.x);
          if (f.y > gy) { f.y = gy; if (f.b++ < 1) { f.vy = -f.vy * 0.4; f.vx *= 0.5; if (Math.random() < 0.3) sfx("tick", 0.15); } else { f.vy = 0; f.vx = 0; } }
        } else if (f.k === "text") f.y -= 24 * dt;
        else if (f.k === "confetti") { f.x += f.vx * dt; f.y += f.vy * dt; f.t += dt; }
      }
      S.fx = S.fx.filter((f) => f.life > 0);
      if (S.shake > 0) S.shake = Math.max(0, S.shake - dt * 12);
      if (S.flash > 0) S.flash -= dt;
      if (S.bump > 0) S.bump -= dt;
      updateAmb(S, dt);
    }
    // 살아 있는 배경 — 새 · 꽃잎 · 물방울 · 지나가는 차 · 불씨 · 비행선
    function updateAmb(s, dt) {
      const st = s.stage;
      if (st === 0) {
        if (Math.random() < dt * 0.12 && s.amb.length < 8) { const n = 3 + Math.floor(Math.random() * 3); for (let k = 0; k < n; k++) s.amb.push({ k: "bird", x: W + 10 + k * 9, y: 40 + Math.random() * 30 + k * 3, vx: -rnd(26, 34), t: Math.random() * 3, life: 20 }); }
        if (Math.random() < dt * 1.2) s.amb.push({ k: "leaf", x: Math.random() * W + 40, y: -6, vx: -rnd(12, 26), vy: rnd(14, 24), t: Math.random() * 6, life: 12 });
      } else if (st === 1) {
        if (Math.random() < dt * 1.6) s.amb.push({ k: "drip", x: Math.random() * W, y: 24, vy: 0, life: 3 });
        if (Math.random() < dt * 0.06) s.amb.push({ k: "car", x: -60, y: 172, vx: 120, life: 6 });
      } else {
        if (Math.random() < dt * 2.4) s.amb.push({ k: "ember", x: W + 4, y: rnd(60, 190), vx: -rnd(40, 80), vy: rnd(-12, 4), t: Math.random() * 6, life: 8 });
        if (!s.amb.some((a) => a.k === "blimp") && Math.random() < dt * 0.02) s.amb.push({ k: "blimp", x: W + 40, y: rnd(30, 50), vx: -6, life: 90 });
      }
      for (const a of s.amb) {
        a.life -= dt; a.t = (a.t || 0) + dt;
        if (a.k === "drip") { a.vy += 400 * dt; a.y += a.vy * dt; if (a.y > 186) a.life = 0; }
        else { a.x += (a.vx || 0) * dt; a.y += (a.vy || 0) * dt; if (a.k === "leaf") a.x += Math.sin(a.t * 3) * 10 * dt; }
        if (a.x < -80 || a.x > W + 120) a.life = 0;
      }
      s.amb = s.amb.filter((a) => a.life > 0);
    }

    // ───────────── 보스 ─────────────
    function startWarning() {
      S.phase = "warning"; S.phaseT = 0;
      S.camX = S.def.arena; S.lockX = S.def.arena;
      S.banner = { kind: "warn", t: 0, life: 2.8 };
      S.enemies.forEach((e) => { if (e.type !== "turret" && e.type !== "mortar") { e.dead = true; sparkle(e.x, e.y - 14, 6, C.virus[3]); } });
      Music.play(3);
      for (let i = 0; i < 3; i++) setTimeout(() => { if (S && S.phase === "warning" && mode === "play") ctx.sfx("countdown"); }, i * 520);
    }
    function spawnBoss() {
      const A = S.def.arena, n = S.stage;
      if (n === 0) S.boss = { kind: "tank", name: "감기 탱크", x: A + W + 70, y: BASE, hp: 90, max: 90, t: 0, state: "enter", st: 0, n: 0, dir: -1, flash: 0 };
      else if (n === 1) S.boss = { kind: "heli", name: "독감 헬리콥터", x: A + W + 80, y: 62, hp: 135, max: 135, t: 0, state: "enter", st: 0, n: 0, flash: 0 };
      else S.boss = { kind: "mech", name: "슈퍼 바이러스 메카", x: A + W + 60, y: BASE, vy: 0, hp: 170, max: 170, t: 0, state: "enter", st: 0, n: 0, flash: 0 };
      S.phase = "boss"; S.bossLag = 1;
      S.time = 99; S.timeAcc = 0; // 보스전은 남은 시간을 새로 센다
    }
    function bossBoxes() {
      const b = S.boss;
      if (!b) return [];
      if (b.kind === "tank") return [[b.x - 54, b.y - 44, b.x + 54, b.y], [b.x - 28, b.y - 72, b.x + 30, b.y - 44]];
      if (b.kind === "heli") return [[b.x - 52, b.y - 18, b.x + 36, b.y + 18], [b.x + 32, b.y - 10, b.x + 72, b.y + 4]];
      if (b.kind === "mech") return [[b.x - 36, b.y - 132, b.x + 36, b.y - 52], [b.x - 26, b.y - 52, b.x + 26, b.y]];
      if (b.kind === "core") return [[b.x - 24, b.y - 24, b.x + 24, b.y + 24]];
      return [];
    }
    function hitBoss(dmg) {
      const b = S.boss;
      if (!b || b.hp <= 0 || b.state === "enter" || b.state === "rise") return;
      b.hp -= dmg; b.flash = 0.05;
      sfx("hit", 0.07);
      if (b.hp <= 0) { b.hp = 0; bossDown(); }
    }
    function bossDown() {
      const b = S.boss;
      S.hitStop = 0.14; S.flash = 0.2; S.shake = 7;
      ctx.sfx("explode");
      // 메카 1단계 끝 — 갑옷이 터지고 본체가 떠오른다
      if (b.kind === "mech") { S.phase = "bossmid"; S.phaseT = 0; S.eb = S.eb.filter((x) => x.k === "puddle"); return; }
      S.phase = "bossdown"; S.phaseT = 0; S.eb = [];
      S.enemies.forEach((e) => { e.dead = true; sparkle(e.x, e.y - 10, 5, C.virus[3]); });
    }
    function updateBoss(dt) {
      const b = S.boss;
      if (!b) return;
      b.t += dt;
      if (b.flash > 0) b.flash -= dt;
      const A = S.def.arena, p = S.p, px = p.x, py = p.y - (p.crouch ? 12 : 24), alive = p.dead <= 0, hard = b.hp < b.max * 0.5;
      if (b.kind === "tank") {
        if (b.state === "enter") { b.x -= 55 * dt; if (b.x <= A + 300) { b.state = "move"; b.st = 1.2; } return; }
        b.st -= dt;
        b.tele = (b.state === "mg" || b.state === "shells") && b.k === 0 && b.st > 0;
        if (b.state === "move") {
          b.x += b.dir * 24 * dt;
          if (b.x < A + 266) b.dir = 1;
          if (b.x > A + 320) b.dir = -1;
          if (b.st <= 0 && alive) { const pick = ["shells", "mg", "sneeze"][b.n++ % 3]; b.state = pick; b.st = pick === "mg" ? 0.7 : 0.45; b.k = 0; }
        } else if (b.state === "shells") {
          if (b.st <= 0) {
            if (b.k < (hard ? 5 : 3)) { lob(b.x - 64, b.y - 66, clamp(px + rnd(-36, 36), A + 12, A + W - 90), BASE, 1.15); muzzleFx(b.x - 64, b.y - 66, true); ctx.sfx("drop"); b.k++; b.st = 0.38; b.recoil = 0.12; }
            else { b.state = "move"; b.st = hard ? 1.0 : 1.6; }
          }
        } else if (b.state === "mg") {
          if (b.st <= 0) {
            if (b.k < (hard ? 9 : 6)) { if (S.eb.length < LIMIT.eb) S.eb.push({ k: "orb", src: "boss", x: b.x - 58, y: BASE - 27, vx: -135, vy: 0, r: 2, life: 4 }); muzzleFx(b.x - 58, BASE - 27, true); sfx("shoot", 0.05); b.k++; b.st = 0.13; }
            else { b.state = "move"; b.st = hard ? 1.0 : 1.6; }
          }
        } else if (b.state === "sneeze") {
          if (b.st <= 0) {
            if (b.k < (hard ? 3 : 2)) { lob(b.x - 50, b.y - 34, clamp(px + (b.k - 0.5) * 44, A + 16, A + W - 100), BASE, 0.9, "glob"); ctx.sfx("pop"); b.k++; b.st = 0.3; b.recoil = 0.1; }
            else { b.state = "move"; b.st = hard ? 1.0 : 1.6; }
          }
        }
        if (b.recoil > 0) b.recoil -= dt;
        if (hard && Math.random() < dt * 0.12 && S.enemies.length < 3) { const e = spawn("germ"); if (e) e.x = A + W + 10; }
      } else if (b.kind === "heli") {
        if (b.state === "enter") { b.x -= 80 * dt; if (b.x <= A + 280) { b.state = "move"; b.st = 1; } return; }
        const tx = clamp(px + Math.sin(b.t * 0.7) * 60, A + 60, A + W - 70);
        b.x += clamp(tx - b.x, -1, 1) * (hard ? 64 : 50) * dt;
        b.y = 60 + Math.sin(b.t * 1.7) * 6;
        b.st -= dt;
        b.tele = b.state === "spread" && b.st > 0;
        if (b.state === "move") {
          if (b.st <= 0 && alive) {
            const list = hard ? ["bombs", "spread", "missile", "drones", "bombs", "spread"] : ["bombs", "spread", "drones", "spread"];
            b.state = list[b.n++ % list.length];
            b.st = b.state === "missile" ? 0.7 : b.state === "spread" ? 0.45 : 0.2; b.k = 0;
            if (b.state === "missile") { b.my = Math.random() < 0.5 ? BASE - 8 : BASE - 28; S.fx.push({ k: "warnmark", x: A + W - 14, y: b.my, life: 0.7 }); }
          }
        } else if (b.state === "bombs") {
          if (b.st <= 0) {
            if (b.k < 3) { if (S.eb.length < LIMIT.eb) S.eb.push({ k: "bomb", x: b.x - 4, y: b.y + 22, vx: 0, vy: 30, grav: 300, r: 3, life: 4 }); ctx.sfx("drop"); b.k++; b.st = 0.26; }
            else { b.state = "move"; b.st = hard ? 1 : 1.5; }
          }
        } else if (b.state === "spread") {
          if (b.st <= 0) {
            const n = hard ? 5 : 3, a0 = Math.atan2(py - (b.y + 6), px - (b.x - 50));
            for (let i = 0; i < n; i++) { const a = a0 + (i - (n - 1) / 2) * 0.22; if (S.eb.length < LIMIT.eb) S.eb.push({ k: "orb", src: "boss", x: b.x - 50, y: b.y + 6, vx: Math.cos(a) * 100, vy: Math.sin(a) * 100, r: 2, life: 4 }); }
            muzzleFx(b.x - 50, b.y + 6, true); sfx("shoot", 0.05);
            b.state = "move"; b.st = hard ? 1 : 1.5;
          }
        } else if (b.state === "drones") {
          if (S.enemies.filter((e) => e.type === "mini").length < 3) { spawn("mini", 0, 0, b.x - 14); spawn("mini", 0, 0, b.x + 14); }
          ctx.sfx("whoosh"); b.state = "move"; b.st = 1.6;
        } else if (b.state === "missile") {
          if (b.st <= 0) { if (S.eb.length < LIMIT.eb) S.eb.push({ k: "missile", x: A + W + 10, y: b.my, vx: -155, vy: 0, r: 3, life: 4 }); sfx("laser", 0.1); b.state = "move"; b.st = 1; }
        }
      } else if (b.kind === "mech") {
        if (b.state === "enter") { b.x -= 45 * dt; b.walk = (b.walk || 0) + dt * 3; if (b.x <= A + 310) { b.state = "move"; b.st = 1.2; } return; }
        b.st -= dt;
        b.tele = (b.state === "burst" && b.k === 0 && b.st > 0) || (b.state === "stomp" && b.k === 0);
        if (b.state === "move") {
          const ox = b.x;
          b.x = clamp(b.x + Math.sin(b.t * 0.8) * 16 * dt, A + 284, A + 330);
          b.walk = (b.walk || 0) + Math.abs(b.x - ox) * 0.25;
          if (b.st <= 0 && alive) {
            const list = ["burst", "laser", "stomp", "missiles", "burst", "laser"];
            b.state = list[b.n++ % list.length]; b.k = 0; b.st = 0.4;
            if (b.state === "laser") {
              b.low = Math.random() < 0.5;
              b.beamY = b.low ? BASE - 8 : BASE - 29;
              S.eb.push({ k: "beam", x0: A - 10, x1: b.x - 40, y: b.beamY, h: 10, t: 0, warn: 0.95, life: 1.4, low: b.low });
              b.st = 1.5;
            }
            if (b.state === "stomp") b.st = 0.5;
          }
        } else if (b.state === "burst") {
          if (b.st <= 0) {
            if (b.k < (hard ? 5 : 3)) { eShoot(b.x - 48, b.y - 42, px, py, 105); muzzleFx(b.x - 48, b.y - 42, true); sfx("shoot", 0.05); b.k++; b.st = 0.16; }
            else { b.state = "move"; b.st = hard ? 0.9 : 1.3; }
          }
        } else if (b.state === "laser") {
          if (b.st <= 0.55 && !b.zap) { b.zap = true; ctx.sfx("laser"); S.shake = Math.max(S.shake, 2); }
          if (b.st <= 0) { b.zap = false; b.state = "move"; b.st = 1; }
        } else if (b.state === "stomp") {
          if (b.k === 0 && b.st <= 0) { b.k = 1; b.vy = -300; }
          if (b.k === 1) {
            b.vy += 700 * dt; b.y += b.vy * dt;
            if (b.y >= BASE) {
              b.y = BASE; b.k = 2; b.st = 0.6; S.shake = 7; S.hitStop = 0.05;
              ctx.sfx("explode");
              S.eb.push({ k: "wave", x: b.x - 30, y: BASE, vx: -125, life: 5 });
              if (hard) S.eb.push({ k: "wave", x: b.x - 30, y: BASE, vx: -82, life: 6 });
              dust(b.x - 24, BASE, 8); dust(b.x + 24, BASE, 8);
            }
          }
          if (b.k === 2 && b.st <= 0) { b.state = "move"; b.st = 1.1; }
        } else if (b.state === "missiles") {
          if (b.st <= 0) {
            if (b.k < 4) { lob(b.x + (b.k % 2 ? 38 : -38), b.y - 132, clamp(px + rnd(-40, 40), A + 10, A + W - 100), BASE, 1.3); ctx.sfx("drop"); b.k++; b.st = 0.22; }
            else { b.state = "move"; b.st = 1.2; }
          }
        }
      } else if (b.kind === "core") {
        if (b.state === "rise") { b.y -= 36 * dt; if (b.y <= 90) { b.state = "move"; b.st = 1.2; } return; }
        b.st -= dt;
        b.tele = b.state === "dash" && b.st > 0;
        if (b.state !== "dash") {
          const cx = A + 230 + Math.sin(b.t * 0.7) * 100, cy = 84 + Math.sin(b.t * 1.4) * 26;
          b.x += (cx - b.x) * Math.min(1, dt * 2.2); b.y += (cy - b.y) * Math.min(1, dt * 2.2);
        }
        if (b.state === "move" && b.st <= 0 && alive) {
          const list = hard ? ["ring", "aim", "dash", "ring", "germs", "aim"] : ["ring", "aim", "germs", "dash"];
          b.state = list[b.n++ % list.length]; b.st = b.state === "dash" ? 0.75 : 0.25; b.k = 0;
          if (b.state === "dash") { b.tx = px; b.ty = Math.min(py, BASE - 26); }
        } else if (b.state === "ring" && b.st <= 0) {
          const n = 12, off = b.k * 0.26;
          for (let i = 0; i < n; i++) { const a = off + (i / n) * Math.PI * 2; if (S.eb.length < LIMIT.eb) S.eb.push({ k: "orb", src: "boss", x: b.x, y: b.y, vx: Math.cos(a) * 70, vy: Math.sin(a) * 70, r: 2, life: 5 }); }
          ctx.sfx("pop"); ring(b.x, b.y, 30, C.pink[3]);
          b.k++;
          if (b.k < (hard ? 2 : 1)) b.st = 0.45; else { b.state = "move"; b.st = 1.3; }
        } else if (b.state === "aim" && b.st <= 0) {
          const a0 = Math.atan2(py - b.y, px - b.x);
          for (let i = -2; i <= 2; i++) if (S.eb.length < LIMIT.eb) S.eb.push({ k: "orb", src: "boss", x: b.x, y: b.y, vx: Math.cos(a0 + i * 0.2) * 110, vy: Math.sin(a0 + i * 0.2) * 110, r: 2, life: 4 });
          sfx("shoot", 0.05); b.state = "move"; b.st = 1.2;
        } else if (b.state === "germs" && b.st <= 0) {
          for (let i = 0; i < 2; i++) { const e = spawn("germ", i, 44); if (e) e.x = A + W + 10 + i * 44; }
          b.state = "move"; b.st = 1.4;
        } else if (b.state === "dash") {
          if (b.st <= 0) {
            if (b.k === 0) { b.k = 1; ctx.sfx("whoosh"); }
            const dx = b.tx - b.x, dy = b.ty - b.y, dd = Math.hypot(dx, dy), sp = 250 * dt;
            if (S.fx.length < LIMIT.fx && Math.random() < 0.5) S.fx.push({ k: "after", x: b.x, y: b.y, life: 0.25, max: 0.25 });
            if (dd < sp) { b.state = "move"; b.st = 1.2; S.shake = 3; } else { b.x += (dx / dd) * sp; b.y += (dy / dd) * sp; }
          }
        }
      }
    }

    // ───────────── 흐름 ─────────────
    function update(dt) {
      T += dt;
      if (mode === "title" && titleS) { updateAmb(titleS, dt); return; }
      if (mode !== "play") return;
      mergeInput();
      // 히트 스톱 — 적 · 탄 · 효과만 잠깐 멈춘다. 주인공 이동 · 점프 · 쏘기는 끊기지 않는다
      if (S.hitStop > 0) {
        S.hitStop -= dt;
        if (S.phase === "run" || S.phase === "warning" || S.phase === "boss" || S.phase === "bossmid" || S.phase === "bossdown") { updatePlayer(dt); if (mode === "play" && S.phase !== "gameover") updateCamera(dt); }
        return;
      }
      S.t += dt; S.phaseT += dt;
      if (S.banner) { S.banner.t += dt; if (S.banner.t >= S.banner.life) S.banner = null; }
      if (S.boss) S.bossLag += ((S.boss.hp / S.boss.max) - S.bossLag) * Math.min(1, dt * 2.2);
      const ph = S.phase;
      if (ph === "tally") { updateTally(); updateFx(dt); return; }
      if (ph === "ending") { updateEnding(dt); updateFx(dt); return; }
      if (ph === "gameover") { updateFx(dt); if (S.phaseT > 2.2 && !S.overShown) showOver(false); return; }
      updatePlayer(dt);
      if (mode !== "play" || S.phase === "gameover") return;
      updateCamera(dt);
      updateEnemies(dt);
      if (ph === "warning" && S.phaseT > 2.8) spawnBoss();
      if (S.phase === "boss") updateBoss(dt);
      if (S.phase === "bossmid") {
        if (Math.random() < dt * 14) boom(S.boss.x + rnd(-30, 30), S.boss.y - rnd(20, 120), rnd(8, 14), false);
        if (Math.random() < dt * 5) sfx("explode", 0.1);
        if (S.phaseT > 2.2) {
          const b = S.boss;
          S.boss = { kind: "core", name: "바이러스 본체", x: b.x, y: BASE - 80, hp: 140, max: 140, t: 0, state: "rise", st: 0, n: 0, flash: 0 };
          S.bossLag = 1;
          S.phase = "boss";
          S.banner = { kind: "phase2", t: 0, life: 2 };
          boom(b.x, BASE - 70, 30, true); sparkle(b.x, BASE - 70, 30, C.magenta[3]); S.flash = 0.2;
          ctx.sfx("whoosh");
        }
      }
      if (S.phase === "bossdown") {
        const b = S.boss;
        if (S.phaseT < 2.2) {
          if (Math.random() < dt * 16) boom(b.x + rnd(-44, 44), b.y + (b.kind === "tank" || b.kind === "mech" ? -rnd(8, 60) : rnd(-16, 16)), rnd(8, 16), false);
          if (Math.random() < dt * 6) sfx("explode", 0.1);
          if (b.kind === "heli" || b.kind === "core") b.y += 30 * dt;
        } else if (!b.gone) {
          b.gone = true;
          boom(b.x, b.y - 24, 34, true); sparkle(b.x, b.y - 24, 46, C.gold[3]); ring(b.x, b.y - 24, 60);
          S.shake = 9; S.flash = 0.25; S.hitStop = 0.12;
          addScore(10000 * (S.stage + 1), b.x, b.y - 60);
          ctx.sfx("win"); Music.off();
        }
        if (S.phaseT > 3.6) startTally();
      }
      updateShots(dt);
      updateCaps(dt);
      updateFx(dt);
      if ((S.phase === "run" || S.phase === "boss") && S.p.dead <= 0) {
        S.timeAcc += dt;
        if (S.timeAcc >= TICK) {
          S.timeAcc -= TICK; S.time--;
          if (S.time <= 10 && S.time > 0) sfx("tick", 0.2);
          if (S.time <= 0) { S.time = 99; S.p.invul = 0; hurtPlayer("time"); }
        }
      }
      if (elGren._v !== S.gren) { elGren._v = S.gren; elGren.textContent = S.gren; }
    }
    function startTally() {
      S.phase = "tally"; S.phaseT = 0; S.eb = []; S.pb = [];
      S.tally = { time: S.time, bonus: S.time * 50, shown: 0, added: false };
      ctx.sfx("success");
    }
    function updateTally() {
      const tl = S.tally, t = S.phaseT;
      if (t > 1.2 && tl.shown < tl.bonus) { tl.shown = Math.min(tl.bonus, tl.shown + Math.max(50, Math.ceil(tl.bonus / 40 / 50) * 50)); sfx("tick", 0.05); }
      if (t > 1.2 && tl.shown >= tl.bonus && !tl.added) { tl.added = true; S.score = Math.min(9999999, S.score + tl.bonus); S.bump = 0.2; ctx.sfx("coin"); tl.doneT = t; }
      if (tl.added && t - tl.doneT > 1.8) { if (S.stage < STAGES.length - 1) loadStage(S.stage + 1); else startEnding(); }
    }
    function startEnding() {
      S.phase = "ending"; S.phaseT = 0;
      S.endBonus = S.lives * 20000; S.endShown = 0; S.endAdded = false;
      S.enemies = []; S.eb = []; S.pb = []; S.items = []; S.caps = [];
      S.p = newPlayer(S.camX + W / 2, BASE);
      ctx.sfx("win");
    }
    function updateEnding(dt) {
      const t = S.phaseT;
      if (t > 3.2 && S.endShown < S.endBonus) { S.endShown = Math.min(S.endBonus, S.endShown + Math.max(1000, Math.ceil(S.endBonus / 30 / 1000) * 1000)); sfx("tick", 0.05); }
      if (t > 3.2 && S.endShown >= S.endBonus && !S.endAdded) { S.endAdded = true; S.score = Math.min(9999999, S.score + S.endBonus); S.bump = 0.2; ctx.sfx("coin"); }
      if (Math.random() < dt * 14 && S.fx.length < LIMIT.fx) S.fx.push({ k: "confetti", x: S.camX + rnd(0, W), y: -4, vx: rnd(-20, 20), vy: rnd(30, 60), t: Math.random() * 6, life: 5, col: [C.pink[2], C.gold[3], C.teal[3], C.virus[3], C.suit[3]][Math.floor(Math.random() * 5)] });
      if (t > 8 && !S.overShown) showOver(true);
    }
    function gameOver() { S.phase = "gameover"; S.phaseT = 0; Music.off(); ctx.sfx("lose"); }

    // ───────────── 그리기 ─────────────
    const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
    function pcircle(cx, cy, r, c) {
      g.fillStyle = c; cx = Math.round(cx); cy = Math.round(cy); r = Math.round(r);
      for (let dy = -r; dy <= r; dy++) { const w = Math.floor(Math.sqrt(r * r - dy * dy) + 0.5); g.fillRect(cx - w, cy + dy, w * 2 + 1, 1); }
    }
    function ft(str, x, y, color = CREAM, scale = 1, align = "l", outline = INK) {
      const c = fontCanvas(String(str), color, scale, outline);
      const dx = align === "c" ? Math.round(x - c.width / 2) : align === "r" ? Math.round(x - c.width) : Math.round(x);
      g.drawImage(c, dx, Math.round(y));
      return c.width;
    }
    function kt(str, x, y, size = 12, color = CREAM, align = "c", outline = INK, thick = 1, scale = 1) {
      const c = kCanvas(str, size, color, outline, thick, scale);
      const dx = align === "c" ? Math.round(x - c.width / 2) : align === "r" ? Math.round(x - c.width) : Math.round(x);
      g.drawImage(c, dx, Math.round(y - c.height / 2));
      return c.width;
    }
    // 빛 — 이번 프레임에 빛나는 것들을 모았다가 한 번에 lighter 로 (월드 좌표)
    let lights = [];
    const light = (x, y, r, col, a = 1) => { if (lights.length < 700) lights.push(x, y, r, col, a); };
    function flushLights(camX) {
      g.save();
      g.globalCompositeOperation = "lighter";
      for (let i = 0; i < lights.length; i += 5) {
        const r = Math.max(4, Math.round(lights[i + 2] / 4) * 4);
        g.globalAlpha = Math.max(0, Math.min(1, lights[i + 4]));
        g.drawImage(glowSpr(lights[i + 3], r), Math.round(lights[i] - camX - r), Math.round(lights[i + 1] - r));
      }
      g.restore();
      lights = [];
    }
    function spr(s, x, y, flip, white) {
      const ax = flip ? s.w - s.ax : s.ax;
      g.drawImage(white ? whiteOf(s, flip) : flip ? s.f : s.c, Math.round(x - ax), Math.round(y - s.ay));
    }
    // 림 라이트 — 스테이지 광원 쪽 가장자리를 그 색으로
    function rim(s, x, y, flip, a) {
      const rl = S && S.bg && S.bg.pal.rim;
      if (!rl || a <= 0.03) return;
      const ax = flip ? s.w - s.ax : s.ax;
      g.globalAlpha = Math.min(1, a);
      g.drawImage(rimOf(s, flip, rl.side, rl.col), Math.round(x - ax), Math.round(y - s.ay));
      g.globalAlpha = 1;
    }
    function rimAmount(wx) {
      const rl = S.bg.pal.rim;
      if (S.stage !== 1) return rl.a;
      // 지하 주차장 — 형광등 아래를 지날 때만
      const L = S.bg.layers[2], off = Math.round(S.camX * L.f);
      let best = 0;
      for (const lt of S.bg.lights) {
        if (!lt.lamp) continue;
        const sx = ((lt.x - off) % LW + LW) % LW;
        for (const xx of [sx, sx - LW, sx + LW]) { const d = Math.abs(xx - (wx - S.camX)); if (d < 70) best = Math.max(best, 1 - d / 70); }
      }
      return best * rl.a;
    }

    function drawBG(camX) {
      const bg = S.bg;
      g.drawImage(bg.sky, 0, 0);
      if (S.stage === 0) light(camX + 64, 34, 44, "#fff2c8", 0.9);
      if (S.stage === 2) light(camX + 300, 150, 64, "#ffb26b", 0.8);
      bg.layers.forEach((L, li) => {
        let off = -Math.round(camX * L.f) % LW;
        if (off > 0) off -= LW;
        for (let x = off; x < W; x += LW) g.drawImage(L.c, x, 0);
        if (li === 0) drawAmb("far", camX);
        if (li === 1) drawAmb("mid", camX);
      });
      // 배경 광원 (네온 · 등 · 신호등) — 겹과 같은 빠르기로
      for (const lt of bg.lights) {
        const L = bg.layers[lt.layer];
        const off = Math.round(camX * L.f);
        const sx = ((lt.x - off) % LW + LW) % LW;
        let a = 0.7;
        if (lt.flick === 1) a = Math.sin(T * 40) > 0.2 || Math.floor(T * 1.3) % 4 ? 0.8 : 0.1;
        if (lt.flick === 2) a = Math.floor(T * 2 + lt.x) % 2 ? 0.8 : 0.25;
        if (lt.flick === 3) a = Math.floor(T * 1.4 + lt.x * 0.01) % 2 ? 0.9 : 0.15;
        if (lt.flick === 4) a = Math.floor(T * 7) % 23 === 0 ? 0.2 : 0.75;
        for (const xx of [sx, sx - LW]) if (xx > -60 && xx < W + 60) light(camX + xx, lt.y, lt.r, lt.col, a);
      }
      if (bg.rays) { g.save(); g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.8 + Math.sin(T * 0.6) * 0.2; g.drawImage(bg.rays, 0, 0); g.restore(); }
    }
    function drawAmb(layer, camX) {
      for (const a of S.amb) {
        if (a.k === "bird" && layer === "mid") {
          const fl = Math.floor(a.t * 6) % 2;
          R(a.x - 2, a.y, 5, 1, "#2a3a7a");
          if (fl) { R(a.x - 3, a.y - 1, 2, 1, "#2a3a7a"); R(a.x + 2, a.y - 1, 2, 1, "#2a3a7a"); } else { R(a.x - 3, a.y + 1, 2, 1, "#2a3a7a"); R(a.x + 2, a.y + 1, 2, 1, "#2a3a7a"); }
        }
        if (a.k === "blimp" && layer === "far") {
          const x = Math.round(a.x), y = Math.round(a.y);
          pcircle(x, y, 8, "#45407a"); R(x - 18, y - 6, 36, 13, "#45407a"); pcircle(x - 18, y, 6, "#45407a"); pcircle(x + 18, y, 6, "#45407a");
          R(x - 16, y - 7, 30, 2, "#6b6299"); R(x - 4, y + 7, 10, 3, "#2b2350"); R(x - 10, y - 2, 6, 4, "#86e05a");
          if (Math.floor(T * 2) % 2) light(camX + x + 22, y, 6, "#ff4f9a", 0.8);
        }
        if (a.k === "car" && layer === "mid") { light(camX + a.x + 44, a.y, 28, "#fff2b0", 0.35); R(a.x, a.y - 8, 40, 9, "#1b2738"); R(a.x + 36, a.y - 4, 4, 3, CREAM); }
      }
    }
    function drawNear(camX) {
      for (const a of S.amb) {
        if (a.k === "leaf") { const c = Math.floor(a.t * 4) % 2 ? PAL[0].leaf[3] : PAL[0].flower[0]; R(a.x, a.y, 2, 1, c); R(a.x + (Math.sin(a.t * 3) > 0 ? 1 : 0), a.y + 1, 1, 1, c); }
        if (a.k === "drip") R(a.x, a.y, 1, 3, "#9fc2cc");
        if (a.k === "ember") { R(a.x, a.y, 2, 1, Math.floor(a.t * 6) % 2 ? "#ffb26b" : "#ff7f50"); light(camX + a.x, a.y, 4, "#ff7f50", 0.5); }
      }
    }
    function drawFG(camX) {
      const fg = S.bg.fg, w = fg.width;
      let off = -Math.round(camX * 1.3) % w;
      if (off > 0) off -= w;
      for (let x = off; x < W; x += w) g.drawImage(fg, x, 0);
    }
    function drawTerrain(camX) {
      const gr = S.def.ground, bg = S.bg;
      for (let i = 0; i < gr.length; i++) {
        const a = gr[i][0], b = i + 1 < gr.length ? gr[i + 1][0] : 1e9;
        if (b < camX - 4 || a > camX + W + 4) continue;
        const x0 = Math.max(a, camX - 4), x1 = Math.min(b, camX + W + 4), y = gr[i][1];
        for (let x = Math.floor(x0 / 64) * 64; x < x1; x += 64) {
          const sx = Math.max(0, x0 - x), ex = Math.min(64, x1 - x);
          if (ex > sx) g.drawImage(bg.floor, sx, 0, ex - sx, bg.floor.height, x + sx, BASE, ex - sx, bg.floor.height);
        }
        if (y < BASE) {
          const h = BASE - y;
          for (let x = Math.floor(x0 / 64) * 64; x < x1; x += 64) {
            const sx = Math.max(0, x0 - x), ex = Math.min(64, x1 - x);
            if (ex > sx) g.drawImage(bg.blockT, sx, 0, ex - sx, Math.min(64, h), x + sx, y, ex - sx, Math.min(64, h));
          }
          if (S.stage === 0) for (let x = Math.floor(x0 / 6) * 6; x < x1; x += 6) { R(x + 1, y - 3, 1, 3, bg.pal.leaf[2]); R(x + 3, y - 2, 2, 2, bg.pal.flower[((x / 6) % 3) | 0]); }
          R(a, y, 2, h, "rgba(20,12,42,.35)"); R(b - 2, y, 2, h, "rgba(20,12,42,.45)");
          R(x0, BASE, x1 - x0, 2, "rgba(20,12,42,.35)");
        }
      }
    }
    function drawHero(p, who, opts = {}) {
      const H2 = heroSprites(who);
      const body = H2.body[opts.pose || bodyPose(p)], pose = body.pose;
      const flip = p.f < 0, x = Math.round(p.x), y = Math.round(p.y), white = opts.white;
      spr(body, x, y, flip, white);
      const ra = opts.rim || 0;
      if (ra && !white) rim(body, x, y, flip, ra);
      if (pose.hurt) return;
      const arm = H2.arm[opts.aim || (p.crouch ? "cf" : p.aim)];
      const [ox, oy] = armOffset(p, pose);
      const kick = p.shootT > 0.06 ? -1 : 0;
      spr(arm, x + (ox + kick) * p.f, y + oy, flip, white);
      if (ra && !white) rim(arm, x + (ox + kick) * p.f, y + oy, flip, ra);
    }
    function drawEnemy(e) {
      const x = Math.round(e.x), y = Math.round(e.y), flip = e.f < 0, wh = e.flash > 0;
      const ra = rimAmount(e.x) * 0.8;
      let s;
      switch (e.type) {
        case "sol": s = e.state === "aim" ? SPR.solAim : SPR.sol[e.moving ? Math.floor(e.t * 7) % 4 : 0]; break;
        case "shield": s = e.shieldHp > 0 ? (e.low > 0 ? SPR.shieldLow : (e.shieldHp > 5 ? SPR.shield : SPR.shieldC)[Math.floor(e.t * 4) % 2]) : SPR.shieldNo[Math.floor(e.t * 4) % 2]; break;
        case "germ": s = SPR.germ[((Math.floor(-e.spin * 2) % 4) + 4) % 4]; break;
        case "drone": s = SPR.drone[Math.floor(e.t * 20) % 2]; break;
        case "mini": s = SPR.mini[Math.floor(e.t * 20) % 2]; break;
        case "para": spr(SPR.chute, x + Math.round(Math.sin(e.t * 1.6 + e.sway) * 2), y - 34, false, wh); s = SPR.solFall; break;
        case "turret": {
          spr(SPR.turret, x, y, false, wh);
          const idx = ((Math.round((e.ang / (Math.PI * 2)) * 32) % 32) + 32) % 32;
          spr(SPR.barrel[idx], x, y + 4, false, wh);
          if (e.burst > 0) light(e.x, e.y - 16, 12, C.pink[2], Math.floor(e.t * 16) % 2 ? 0.9 : 0.4);
          if (ra && !wh) rim(SPR.turret, x, y, false, ra);
          return;
        }
        case "mortar": s = SPR.mortar[e.puff > 0 ? 1 : 0]; break;
      }
      if (!s) return;
      spr(s, x, y, flip, wh);
      if (ra && !wh) rim(s, x, y, flip, ra);
      // 공격 예고 — 핫핑크 번쩍
      if ((e.state === "aim" || e.low > 0.45) && Math.floor(e.t * 16) % 2) light(e.x + e.f * 12, e.y - 27, 12, C.pink[2], 0.9);
      if (e.type === "drone" || e.type === "mini") light(e.x, e.y + 5, 8, C.virus[3], 0.4);
    }
    function drawCaptive(c) {
      const x = Math.round(c.x), y = Math.round(c.y);
      if (c.state === "tied") {
        spr(SPR.tied[Math.floor(c.t * 3) % 2], x, y, false);
        if (Math.floor(c.t * 2) % 2 === 0) { R(x + 6, y - 44, 13, 12, CREAM); R(x + 6, y - 33, 3, 2, CREAM); R(x + 6, y - 44, 13, 1, C.shirt[2]); ft("!", x + 10, y - 42, C.red[2], 1, "l", null); }
      } else spr((c.state === "run" ? SPR.runner : SPR.cheer)[Math.floor(c.t * 8) % 2], x, y, c.state === "run");
    }
    function drawItem(it) {
      const bob = it.ground ? Math.round(Math.sin(it.t * 5) * 1.5) - 1 : 0;
      spr(SPR.item[it.kind], it.x, it.y + bob, false);
      light(it.x, it.y - 8 + bob, 14, C.gold[3], 0.55 + Math.sin(it.t * 6) * 0.15);
      if (Math.floor(it.t * 6) % 4 === 0) { R(it.x + 6, it.y - 18 + bob, 1, 3, CREAM); R(it.x + 5, it.y - 17 + bob, 3, 1, CREAM); }
    }
    function drawBoss(b) {
      const x = Math.round(b.x), y = Math.round(b.y), wh = b.flash > 0;
      const tele = b.tele && Math.floor(b.t * 14) % 2;
      const ra = rimAmount(b.x);
      if (b.kind === "tank") {
        const rec = b.recoil > 0 ? 2 : 0;
        spr(SPR.tankGun, x - 22 + rec, y - 62, false, wh);
        spr(SPR.tankTop, x + 2, y - 42, false, wh);
        const hull = SPR.tankHull[Math.floor(b.t * 10) % 2];
        spr(hull, x, y, false, wh);
        if (ra && !wh) { rim(hull, x, y, false, ra); rim(SPR.tankTop, x + 2, y - 42, false, ra); }
        light(x - 48, y - 32, 14, C.red[2], 0.5);
        if (tele) { light(x - 58, y - 27, 16, C.pink[2], 1); light(x - 60, y - 64, 14, C.pink[2], 0.8); }
      } else if (b.kind === "heli") {
        spr(SPR.heli, x, y, false, wh);
        spr(SPR.rotor[Math.floor(b.t * 24) % 3], x - 6, y - 28, false);
        const tr = Math.floor(b.t * 20) % 2;
        R(x + 68, y - 20 + (tr ? 0 : 8), 3, 12 - (tr ? 0 : 8), C.shirt[2]);
        if (ra && !wh) rim(SPR.heli, x, y, false, ra);
        light(x - 50, y + 6, 10, C.pink[2], tele ? 1 : 0.35);
        light(x - 36, y - 4, 16, C.teal[3], 0.25);
      } else if (b.kind === "mech") {
        const lf = b.state === "stomp" && b.k === 1 ? 2 : Math.floor(b.walk || 0) % 3;
        const leg = SPR.mechLeg[lf];
        spr(leg, x, y, false, wh);
        const body = SPR.mechBody[b.hp < b.max * 0.5 ? 1 : 0];
        spr(body, x, y - 46, false, wh);
        if (ra && !wh) { rim(leg, x, y, false, ra); rim(body, x, y - 46, false, ra); }
        light(x, y - 80, 22, b.hp < b.max * 0.5 ? C.pink[2] : C.virus[3], 0.7 + Math.sin(b.t * 6) * 0.2);
        if (b.state === "laser") { R(x - 44, b.beamY - 4, 8, 8, C.steel[1]); R(x - 44, b.beamY - 4, 8, 2, C.steel[3]); light(x - 44, b.beamY, 14, C.pink[2], 0.9); }
        if (tele) light(x - 48, y - 42, 16, C.pink[2], 1);
      } else if (b.kind === "core") {
        spr(SPR.core[Math.floor(b.t * 6) % 2], x, y, false, wh || tele);
        light(x, y, 44, C.magenta[3], 0.6);
        light(x, y, 18, C.virus[3], 0.6);
      }
    }
    function drawShots() {
      for (const b of S.pb) {
        const x = Math.round(b.x), y = Math.round(b.y);
        if (b.k === "B") { const hz = Math.abs(b.vx) > Math.abs(b.vy); R(x - (hz ? 3 : 1), y - (hz ? 1 : 3), hz ? 6 : 3, hz ? 3 : 6, C.gold[3]); R(x - 1, y - 1, 2, 2, CREAM); light(b.x, b.y, 8, C.gold[3], 0.7); }
        else if (b.k === "S") { R(x - 2, y - 2, 4, 4, C.fire[2]); R(x - 1, y - 1, 2, 2, C.fire[4]); light(b.x, b.y, 8, C.fire[2], 0.6); }
        else if (b.k === "L") {
          const n = Math.hypot(b.vx, b.vy);
          for (let k = 0; k < 20; k += 2) R(x - (b.vx / n) * k - 1, y - (b.vy / n) * k - 1, 3, 3, k < 4 ? C.teal[4] : C.teal[3]);
          light(b.x - (b.vx / n) * 8, b.y - (b.vy / n) * 8, 14, C.teal[3], 0.8);
        } else if (b.k === "F") {
          const r = Math.round(2 + b.age * 14);
          pcircle(x, y, r, b.age < 0.12 ? C.fire[4] : b.age < 0.25 ? C.fire[3] : C.fire[2]);
          if (b.age > 0.2) pcircle(x, y - 1, Math.max(1, r - 2), C.fire[3]);
          light(b.x, b.y, r * 3, C.fire[2], 0.35);
        }
      }
      for (const gr of S.grens) { spr(SPR.gren, gr.x, gr.y, false); light(gr.x, gr.y, 6, C.virus[3], 0.5); }
      for (const b of S.eb) {
        const x = Math.round(b.x), y = Math.round(b.y);
        switch (b.k) {
          case "orb": R(x - 2, y - 2, 5, 5, C.pink[2]); R(x - 1, y - 1, 3, 3, C.pink[4]); light(b.x, b.y, 9, C.pink[2], 0.9); break;
          case "shell": pcircle(x, y, 3, C.smoke[1]); R(x - 1, y - 2, 2, 1, C.smoke[3]); light(b.x, b.y, 8, C.red[2], 0.5); break;
          case "bomb": R(x - 3, y - 3, 6, 7, C.smoke[1]); R(x - 3, y - 3, 2, 7, C.smoke[2]); R(x - 2, y - 6, 4, 3, C.red[2]); light(b.x, b.y - 4, 8, C.red[2], Math.floor(S.t * 10) % 2 ? 0.9 : 0.3); break;
          case "glob": pcircle(x, y, 4, C.virus[2]); R(x - 2, y - 2, 2, 2, C.virus[4]); light(b.x, b.y, 8, C.virus[3], 0.5); break;
          case "missile": R(x - 7, y - 2, 14, 5, C.shirt[2]); R(x - 7, y - 2, 14, 1, C.shirt[3]); R(x - 9, y - 2, 3, 5, C.red[2]); R(x + 7, y - 1, 3 + (Math.floor(S.t * 20) % 2) * 3, 3, C.fire[3]); light(b.x + 9, b.y, 10, C.fire[2], 0.9); break;
          case "puddle": R(x - b.w / 2, y - 2, b.w, 2, C.virus[2]); R(x - b.w / 2 + 2, y - 3, b.w - 4, 1, C.virus[3]); if (Math.floor(S.t * 4 + x) % 3 === 0) R(x + ((S.t * 9) % 10) - 5, y - 6, 2, 2, C.virus[4]); light(b.x, b.y - 2, 12, C.virus[3], 0.35); break;
          case "beam":
            if (b.t < b.warn) { if (Math.floor(b.t * 14) % 2) { R(b.x0, y, b.x1 - b.x0, 1, b.low ? C.gold[3] : C.pink[3]); for (let xx = b.x0; xx < b.x1; xx += 60) light(xx, y, 8, C.pink[2], 0.6); } }
            else { R(b.x0, y - b.h / 2, b.x1 - b.x0, b.h, C.pink[2]); R(b.x0, y - b.h / 2 + 2, b.x1 - b.x0, b.h - 4, C.pink[3]); R(b.x0, y - 1, b.x1 - b.x0, 2, C.pink[4]); for (let xx = b.x0; xx < b.x1; xx += 28) light(xx, y, 20, C.pink[2], 0.8); }
            break;
          case "wave": R(x - 6, y - 13, 12, 13, C.magenta[3]); R(x - 4, y - 16, 8, 3, C.magenta[4]); R(x - 6, y - 3, 12, 3, C.magenta[2]); light(b.x, b.y - 8, 16, C.magenta[3], 0.7); break;
        }
      }
    }
    function drawFx() {
      for (const f of S.fx) {
        const x = Math.round(f.x), y = Math.round(f.y);
        switch (f.k) {
          case "boom": {
            const k = 1 - f.life / f.max, r = Math.max(1, Math.round(f.r * (0.4 + k * 0.85)));
            if (k < 0.15) pcircle(x, y, r, CREAM);
            else {
              pcircle(x, y, r, k < 0.45 ? C.fire[3] : k < 0.7 ? C.fire[2] : C.fire[1]);
              pcircle(x - r * 0.2, y - r * 0.2, Math.round(r * 0.6), k < 0.45 ? C.fire[4] : C.fire[3]);
              for (let a = 0; a < 10; a++) { const t = a * 0.63 + k * 3; R(x + Math.cos(t) * r, y + Math.sin(t) * r, 2, 2, C.fire[2]); } // 부글부글 가장자리
            }
            light(f.x, f.y, f.r * 3, C.fire[2], (1 - k) * 0.9);
            break;
          }
          case "smoke": { const k = f.life / f.max; pcircle(x, y, f.r, k > 0.5 ? C.smoke[2] : C.smoke[1]); if (k > 0.4) R(x - 1, y - f.r + 1, 2, 1, C.smoke[3]); break; }
          case "ring": { const k = 1 - f.life / f.max, r = Math.round(f.r * (0.3 + k)); g.globalAlpha = 1 - k; for (let a = 0; a < 28; a++) { const t = (a / 28) * Math.PI * 2; R(x + Math.cos(t) * r, y + Math.sin(t) * r, 1, 1, f.col); } g.globalAlpha = 1; break; }
          case "star": if (Math.floor(f.life * 20) % 2) { R(x - 1, y, 3, 1, f.col); R(x, y - 1, 1, 3, f.col); } else R(x, y, 1, 1, f.col); break;
          case "spark": R(x - 1, y - 1, 3, 3, f.col); R(x - 2, y, 5, 1, f.col); light(f.x, f.y, 6, f.col, 0.6); break;
          case "mflash": { const c = f.enemy ? C.pink : C.fire; R(x - 3, y - 1, 7, 3, c[3]); R(x - 1, y - 3, 3, 7, c[3]); R(x - 1, y - 1, 3, 3, c[4]); light(f.x, f.y, 14, c[2], 0.9); break; }
          case "dust": { const k = f.life / f.max; R(x, y, k > 0.5 ? 3 : 2, k > 0.5 ? 2 : 1, k > 0.5 ? C.smoke[3] : C.smoke[2]); break; }
          case "puff": pcircle(x, y, 2, C.smoke[2]); break;
          case "case": R(x, y - 1, 2, 1, C.gold[3]); R(x, y - 1, 1, 1, C.gold[4]); break;
          case "after": g.globalAlpha = (f.life / f.max) * 0.5; spr(SPR.core[0], x, y, false, true); g.globalAlpha = 1; break;
          case "confetti": R(x, y, Math.floor(f.t * 6) % 2 ? 3 : 1, 2, f.col); break;
          case "text": if (/^[0-9,]+$/.test(f.str)) ft(f.str, x, y - 4, f.col, 1, "c"); else kt(f.str, x, y, 10, f.col, "c"); break;
          case "warnmark": if (Math.floor(f.life * 12) % 2) { R(x - 8, y - 8, 16, 16, C.red[2]); R(x - 8, y - 8, 16, 1, C.red[3]); ft("!", x, y - 4, CREAM, 1, "c", null); light(f.x, f.y, 16, C.red[2], 0.9); } break;
        }
      }
    }
    // HUD — 반투명 판 + 밝은 1px 테두리
    function panel(x, y, w, h) {
      g.fillStyle = "rgba(20,12,42,.62)"; g.fillRect(x, y, w, h);
      R(x, y, w, 1, "rgba(255,246,224,.35)"); R(x, y + h - 1, w, 1, "rgba(255,246,224,.12)"); R(x, y, 1, h, "rgba(255,246,224,.25)"); R(x + w - 1, y, 1, h, "rgba(255,246,224,.12)");
    }
    function drawHUD() {
      panel(3, 3, 76, 25);
      ft("1P", 6, 6, C.teal[3]);
      ft(comma(String(S.score).padStart(8, "0")), 20, 6 - (S.bump > 0 ? 1 : 0), S.bump > 0 ? C.gold[4] : CREAM);
      for (let i = 0; i < S.lives; i++) {
        const x = 7 + i * 10, y = 17;
        R(x, y, 8, 4, C.teal[2]); R(x, y, 8, 1, C.teal[3]); R(x + 1, y + 4, 6, 4, C.skin[3]); R(x + 4, y + 3, 4, 1, C.gold[3]); R(x + 5, y + 5, 1, 1, INK);
      }
      panel(82, 3, 72, 25);
      if (S.weapon === "B") {
        R(86, 9, 14, 12, C.gold[1]); R(87, 10, 12, 10, C.gold[3]); ft("B", 90.5, 11, C.gold[0], 1, "l", null);
        g.fillStyle = CREAM; [[1, 0], [2, 0], [0, 1], [3, 1], [1, 2], [2, 2], [5, 0], [6, 0], [4, 1], [7, 1], [5, 2], [6, 2]].forEach(([a, b]) => g.fillRect(104 + a, 13 + b, 1, 1));
      } else { spr(SPR.item[S.weapon], 93, 25, false); ft(String(S.ammo), 104, 11, C.gold[4]); }
      spr(SPR.gren, 128, 15, false);
      ft("*" + S.gren, 134, 11, CREAM);
      panel(W / 2 - 20, 3, 40, 27);
      ft("TIME", W / 2, 5, C.pink[3], 1, "c");
      const lowT = S.time <= 10 && Math.floor(S.t * 4) % 2;
      ft(String(Math.max(0, S.time)).padStart(2, "0"), W / 2, 13, lowT ? C.red[3] : C.gold[3], 2, "c");
      panel(W - 58, 3, 55, 14);
      ft("STAGE " + (S.stage + 1), W - 30, 6, C.virus[3], 1, "c");
      const b = S.boss;
      if (b && (S.phase === "boss" || S.phase === "bossmid" || S.phase === "bossdown")) {
        const bw = 170, bx = Math.round((W - bw) / 2), by = H - 12;
        panel(bx - 4, by - 15, bw + 8, 24);
        const k = Math.max(0, b.hp / b.max), lag = Math.max(k, S.bossLag);
        R(bx, by, bw, 5, "#2a2440");
        R(bx, by, Math.round(bw * lag), 5, CREAM); // 줄어들 때 흰 잔상이 늦게 따라온다
        const w1 = Math.round(bw * k);
        R(bx, by, w1, 5, k < 0.3 ? C.red[2] : C.pink[2]); R(bx, by, w1, 2, k < 0.3 ? C.red[3] : C.pink[3]);
        kt(b.name + (b.kind === "core" ? " · 2단계" : S.stage === 2 ? " · 1단계" : ""), W / 2, by - 7, 10, C.pink[4], "c");
      }
    }
    // 글자 그림 위로 지나가는 빛 줄기
    function lightSweep(c, t) {
      const tmp = newCanvas(c.width, c.height), tg = tmp.getContext("2d");
      tg.drawImage(c, 0, 0);
      tg.globalCompositeOperation = "source-atop";
      const x = ((t % 2.4) / 2.4) * (c.width + 80) - 40;
      tg.fillStyle = "rgba(255,246,224,.75)";
      tg.beginPath(); tg.moveTo(x, 0); tg.lineTo(x + 10, 0); tg.lineTo(x - 10, c.height); tg.lineTo(x - 20, c.height); tg.fill();
      return tmp;
    }
    function drawBanner() {
      const bn = S.banner;
      if (!bn) return;
      const t = bn.t, camX = S.camX;
      if (bn.kind === "stage") {
        const k = Math.min(1, t / 0.3), out = t > bn.life - 0.3 ? (bn.life - t) / 0.3 : 1, hgt = Math.round(48 * Math.min(k, out));
        if (hgt <= 0) return;
        g.fillStyle = "rgba(20,12,42,.72)"; g.fillRect(0, 76 - hgt / 2, W, hgt);
        R(0, 76 - hgt / 2, W, 1, C.suit[3]); R(0, 76 + hgt / 2 - 1, W, 1, C.suit[3]);
        if (hgt > 40) {
          const slide = Math.round((1 - Math.min(1, t / 0.5)) * 220);
          const c = fontCanvas("STAGE " + (S.stage + 1), [C.gold[4], C.gold[3], C.suit[2]], 3, C.suit[0]);
          g.drawImage(lightSweep(c, t * 1.4), Math.round(W / 2 - slide - c.width / 2), 56);
          kt(S.def.name, W / 2 + slide, 92, 12, CREAM, "c");
          light(camX + W / 2, 70, 60, C.suit[3], 0.35); flushLights(camX);
        }
      } else if (bn.kind === "go") {
        if (Math.floor(t * 4) % 2 === 0) { ft("GO!", W - 48, 70, C.gold[3], 2, "c", C.suit[0]); ft(">>", W - 48, 88, C.gold[3], 2, "c", C.suit[0]); light(camX + W - 48, 82, 26, C.gold[3], 0.6); flushLights(camX); }
      } else if (bn.kind === "warn") {
        const on = Math.floor(t * 5) % 2 === 0;
        g.fillStyle = `rgba(224,48,72,${on ? 0.16 : 0.06})`; g.fillRect(0, 0, W, H);
        // 위아래에서 흐르는 경고 띠
        for (const [yy, dir] of [[54, 1], [104, -1]]) {
          R(0, yy, W, 12, C.red[1]);
          for (let x = ((t * 80 * dir) % 24) - 24; x < W + 24; x += 24) { g.fillStyle = C.gold[3]; g.beginPath(); g.moveTo(x, yy); g.lineTo(x + 10, yy); g.lineTo(x + 4, yy + 12); g.lineTo(x - 6, yy + 12); g.fill(); }
        }
        g.fillStyle = "rgba(58,10,30,.7)"; g.fillRect(0, 66, W, 38);
        if (on || t > 1.8) { ft("WARNING", W / 2, 70, [C.red[4], C.red[3], C.red[2]], 4, "c", C.red[0]); light(camX + W / 2, 84, 90, C.red[2], 0.5); flushLights(camX); }
        kt(`${S.def.boss} 출현!`, W / 2, 128, 12, CREAM, "c");
      } else if (bn.kind === "phase2") {
        if (Math.floor(t * 6) % 2 === 0) kt("본체가 나타났어요!", W / 2, 70, 15, C.magenta[4], "c", C.magenta[0]);
      }
    }
    function drawTally() {
      const tl = S.tally, t = S.phaseT, camX = S.camX;
      const k = Math.min(1, t / 0.35), hh = Math.round(126 * k);
      g.fillStyle = "rgba(20,12,42,.8)"; g.fillRect(34, 108 - hh / 2, W - 68, hh);
      R(34, 108 - hh / 2, W - 68, 1, C.suit[3]); R(34, 108 + hh / 2 - 1, W - 68, 1, C.suit[3]);
      if (k < 1) return;
      const c = fontCanvas("STAGE CLEAR!", [C.gold[4], C.gold[3], C.suit[2]], 2, C.suit[0]);
      g.drawImage(lightSweep(c, t * 1.2), Math.round(W / 2 - c.width / 2), 52);
      light(camX + W / 2, 60, 70, C.gold[3], 0.35); flushLights(camX);
      kt(`${S.def.name} 되찾았어요`, W / 2, 82, 12, C.virus[4], "c");
      if (t > 0.6) { kt("남은 시간", 112, 104, 12, CREAM, "c"); ft(`${tl.time} * 50`, 204, 101, CREAM, 1, "c"); ft("+" + comma(tl.shown), 300, 101, C.gold[4], 1, "c"); }
      if (t > 1) { kt("구한 동료", 112, 122, 12, CREAM, "c"); ft(String(S.rescued), 204, 119, CREAM, 1, "c"); }
      if (tl.added) ft("SCORE " + comma(String(S.score).padStart(8, "0")), W / 2, 140, S.bump > 0 ? C.gold[4] : CREAM, 1, "c");
    }
    // 엔딩 — 노을 옥상에서 대원과 구한 동료들이 기뻐한다
    function drawEndingWorld() {
      const t = S.phaseT, x0 = S.camX;
      for (let i = 0; i < 4; i++) {
        const cx = x0 + 92 + i * 52 + (i > 1 ? 96 : 0), jump = Math.abs(Math.sin(t * 5 + i)) * 10;
        spr(SPR.cheer[Math.floor(t * 6 + i) % 2], cx, BASE - jump, i > 1);
      }
      drawHero({ x: x0 + W / 2, y: BASE - Math.abs(Math.sin(t * 3)) * 4, f: 1, ground: true, vx: 0, aim: "u", shootT: 0, crouch: false, anim: 0, idleT: t, dead: 0 }, hero, { pose: "idle0", aim: "u", rim: S.bg.pal.rim.a });
      if (Math.floor(t * 3) % 2 === 0) light(x0 + W / 2 + 5, BASE - 56, 16, C.fire[3], 0.8);
    }
    function drawEnding() {
      const t = S.phaseT, k = Math.min(1, t / 3);
      g.fillStyle = `rgba(255,214,140,${0.14 * k})`; g.fillRect(0, 0, W, H);
      g.fillStyle = `rgba(20,12,42,${0.5 * k})`; g.fillRect(0, 26, W, 104);
      const type = (s, at) => s.slice(0, Math.max(0, Math.floor((t - at) * 18))); // 한 글자씩
      const l1 = type("바이러스 로봇 군단을 모두 물리쳤어요!", 0.4), l2 = type("회사에 건강한 하루가 돌아왔어요", 2.2);
      if (l1) kt(l1, W / 2, 42, 12, C.gold[4], "c");
      if (l2) kt(l2, W / 2, 60, 12, CREAM, "c");
      if (t > 3.2) { kt("남은 목숨", 128, 84, 12, CREAM, "c"); ft(`${S.lives} * 20,000`, 210, 81, CREAM, 1, "c"); ft("+" + comma(S.endShown), 304, 81, C.gold[4], 1, "c"); }
      if (t > 5.2) { kt("수고했어요, 비타민 특공대!", W / 2, 110, 15, C.virus[4], "c", C.virus[0]); light(S.camX + W / 2, 110, 70, C.virus[3], 0.3); flushLights(S.camX); }
    }
    // 타이틀 — 광장 배경이 천천히 흐르고, 큰 도트 로고에 빛이 지나간다
    let titleS = null;
    function drawTitle() {
      if (!titleS) titleS = { bg: getBG(0), def: scaled(0), stage: 0, t: 0, amb: [], fx: [], camX: 0 };
      const keepS = S;
      S = titleS;
      S.t = T;
      const camX = Math.round(T * 22);
      S.camX = camX;
      drawBG(camX);
      g.save(); g.translate(-camX, 0);
      drawTerrain(camX);
      const p = { x: camX + 86, y: BASE, f: 1, ground: true, vx: 1, anim: T * 12, aim: "f", shootT: (T % 0.4) < 0.06 ? 0.1 : 0, crouch: false, idleT: T, dead: 0 };
      drawHero(p, hero, { rim: 0.5 });
      if ((T % 0.4) < 0.05) light(camX + 86 + 23, BASE - 26, 14, C.fire[2], 0.9);
      for (let k = 0; k < 3; k++) { const bx = camX + 112 + ((T * 260 + k * 90) % 300); R(bx - 3, BASE - 27, 6, 3, C.gold[3]); R(bx - 1, BASE - 26, 2, 1, CREAM); light(bx, BASE - 26, 8, C.gold[3], 0.7); }
      spr(SPR.germ[Math.floor(T * 8) % 4], camX + 360 - ((T * 46) % 220), BASE, false);
      spr(SPR.drone[Math.floor(T * 20) % 2], camX + 300 + Math.sin(T) * 30, 132 + Math.sin(T * 2) * 6, true);
      g.translate(camX, 0);
      drawNear(camX);
      g.restore();
      flushLights(camX);
      drawFG(camX);
      g.save(); g.globalCompositeOperation = "multiply"; g.fillStyle = S.bg.pal.grade; g.fillRect(0, 0, W, H); g.restore();
      g.drawImage(S.bg.vig, 0, 0);
      S = keepS;
      g.fillStyle = "rgba(20,12,42,.42)"; g.fillRect(0, 0, W, 112);
      const bob = Math.round(Math.sin(T * 2) * 2);
      const logo = kCanvas("비타민 특공대", 15, [C.gold[4], C.gold[3], C.suit[2]], C.suit[0], 2, 3);
      const lx = Math.round(W / 2 - logo.width / 2);
      g.save(); g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.45; g.drawImage(glowSpr(C.suit[3], 120), W / 2 - 120, 40 - 120 + bob); g.restore();
      g.globalAlpha = 0.7; g.drawImage(silhouette(logo, INK), lx + 3, 14 + bob + 3); g.globalAlpha = 1;
      g.drawImage(lightSweep(logo, T), lx, 14 + bob);
      kt("바이러스 로봇 군단을 막아라!", W / 2, 80, 12, C.teal[4], "c", C.teal[0]);
      if (Math.floor(T * 2) % 2 === 0) kt(touchUI ? "시작하려면 누르세요" : "시작하려면 누르세요 · Z 또는 Enter", W / 2, 98, 10, CREAM, "c");
    }
    function draw() {
      g = g0;
      g.imageSmoothingEnabled = false;
      if (mode === "title" || !S) { drawTitle(); drawPreviews(); return; }
      const sx = S.shake > 0 ? Math.round(rnd(-S.shake, S.shake)) : 0;
      const sy = S.shake > 0 ? Math.round(rnd(-S.shake, S.shake) * 0.6) : 0;
      const camX = Math.round(S.camX);
      g.save();
      g.translate(sx, sy);
      drawBG(camX);
      g.translate(-camX, 0);
      drawTerrain(camX);
      for (const c of S.caps) drawCaptive(c);
      for (const it of S.items) drawItem(it);
      for (const e of S.enemies) drawEnemy(e);
      if (S.boss && !S.boss.gone) drawBoss(S.boss);
      if (S.phase === "ending") drawEndingWorld();
      else {
        const p = S.p;
        const blink = p.invul > 0 && Math.floor(p.invul * 14) % 2 === 0;
        if (p.dead > 0) { if (Math.floor(p.dead * 10) % 2 === 0) drawHero(p, hero, { white: p.dead > 1.2 }); }
        else if (!blink) drawHero(p, hero, { rim: rimAmount(p.x) });
        // 총구 불꽃
        if (p.flashT > 0 && p.dead <= 0) { const [mx, my] = muzzle(p); const c = S.weapon === "L" ? C.teal : C.fire; R(mx - 3, my - 1, 7, 3, c[3]); R(mx - 1, my - 3, 3, 7, c[3]); R(mx - 1, my - 1, 3, 3, c[4]); light(mx, my, 16, c[2], 0.9); }
      }
      drawShots();
      drawFx();
      g.translate(camX, 0);
      drawNear(camX);
      flushLights(camX);
      drawFG(camX);
      g.restore();
      // 색 보정 · 비네트
      g.save(); g.globalCompositeOperation = "multiply"; g.fillStyle = S.bg.pal.grade; g.fillRect(0, 0, W, H); g.restore();
      g.drawImage(S.bg.vig, 0, 0);
      if (S.flash > 0) { g.fillStyle = `rgba(255,246,224,${Math.min(0.5, S.flash * 2.5)})`; g.fillRect(0, 0, W, H); }
      if (S.phase === "ending") drawEnding();
      drawHUD();
      drawBanner();
      if (S.phase === "tally") drawTally();
      if (S.phase === "gameover") {
        g.fillStyle = `rgba(20,12,42,${Math.min(0.65, S.phaseT * 0.5)})`; g.fillRect(0, 0, W, H);
        if (S.phaseT > 0.4) ft("GAME OVER", W / 2, 78, [C.red[4], C.red[3], C.red[2]], 3, "c", C.red[0]);
        if (S.phaseT > 1) kt("다음엔 꼭 구해 줘요!", W / 2, 118, 12, CREAM, "c");
      }
      if (mode === "paused") { g.fillStyle = "rgba(20,12,42,.4)"; g.fillRect(0, 0, W, H); }
    }
    // 타이틀의 대원 고르기 카드 — 고른 쪽은 달리고, 안 고른 쪽은 숨 쉰다
    function drawPreviews() {
      overlay.querySelectorAll("canvas[data-pv]").forEach((c) => {
        const who = Number(c.dataset.pv), on = who === hero;
        const pg = c.getContext("2d");
        pg.clearRect(0, 0, c.width, c.height);
        const keep = g;
        g = pg;
        const p = { x: 22, y: 49, f: 1, ground: true, vx: on ? 1 : 0, anim: T * 12, aim: "f", shootT: 0, crouch: false, idleT: T, dead: 0 };
        drawHero(p, who, { pose: on ? "run" + (Math.floor(T * 12) % 6) : "idle" + (Math.floor(T * 2.2) % 2) });
        g = keep;
      });
    }

    // ───────────── 루프 ─────────────
    let raf = 0, last = 0;
    function frame(now) {
      raf = 0;
      if (mode !== "play" && mode !== "title") return;
      let el = (now - last) / 1000;
      last = now;
      el = clamp(el, 0, 0.1);
      // 지난 시간을 1/120초 이하 조각으로 나눠 매 프레임 갱신한다 — 갱신 없는 프레임(끊겨 보임)이 없고,
      // 60 · 90 · 120Hz 어디서나 속도는 같다
      try {
        const n = Math.max(1, Math.ceil(el / DT - 1e-6));
        for (let i = 0; i < n && el > 0; i++) { update(el / n); if (mode !== "play" && mode !== "title") break; }
        draw();
      } catch (err) { console.error(err); }
      if (mode === "play" || mode === "title") raf = requestAnimationFrame(frame);
    }
    function run() { if (raf) cancelAnimationFrame(raf); last = performance.now(); raf = requestAnimationFrame(frame); }

    // ───────────── 화면 전환 (DOM 창) ─────────────
    function showOverlay(html, cls) {
      overlay.className = `vt-ov ${cls || ""}`;
      overlay.innerHTML = html;
      overlay.hidden = false;
      const btn = overlay.querySelector("[data-act=start], [data-act=resume], [data-act=again]");
      if (btn) btn.focus({ preventScroll: true });
    }
    function hideOverlay() { overlay.hidden = true; overlay.innerHTML = ""; }
    function clickGo() { const b = overlay.querySelector("[data-act=start], [data-act=again]"); if (b && !overlay.hidden) b.click(); }
    function pickHero(n) {
      hero = n;
      try { localStorage.setItem("hk-vitamin-hero", String(n)); } catch (_) {}
      overlay.querySelectorAll("[data-hero]").forEach((b) => { const on = Number(b.dataset.hero) === n; b.classList.toggle("is-on", on); b.setAttribute("aria-checked", on ? "true" : "false"); });
      ctx.sfx("select");
      draw();
    }
    function showTitle() {
      mode = "title"; S = null; Music.off();
      showOverlay(`<div class="vt-card vt-card--title">
          <div class="vt-pick" role="radiogroup" aria-label="대원 고르기">
            <span class="vt-pick__label">대원 고르기</span>
            <button type="button" class="vt-hero${hero === 0 ? " is-on" : ""}" data-hero="0" role="radio" aria-checked="${hero === 0}"><canvas data-pv="0" width="44" height="52"></canvas>남 대원</button>
            <button type="button" class="vt-hero${hero === 1 ? " is-on" : ""}" data-hero="1" role="radio" aria-checked="${hero === 1}"><canvas data-pv="1" width="44" height="52"></canvas>여 대원</button>
          </div>
          <button type="button" class="vt-go" data-act="start">시작</button>
          <p class="vt-tip">두 대원 성능은 같아요 · 묶인 동료를 구하면 무기를 줘요</p>
        </div>`, "is-bottom");
      run();
    }
    function start() { hideOverlay(); clearInput(); submitted = false; newGame(); mode = "play"; run(); }
    function pause() {
      if (mode !== "play" || !S) return;
      if (S.phase === "gameover" && S.overShown) return;
      mode = "paused"; clearInput(); Music.off(); draw();
      showOverlay(`<div class="vt-card"><h2>잠깐 쉬는 중</h2><p>점수 <b>${S.score.toLocaleString("ko-KR")}</b> · ${S.stage + 1}구역 ${S.def.name}</p><button type="button" class="vt-go" data-act="resume">계속하기</button></div>`);
    }
    function resume() {
      if (mode !== "paused") return;
      hideOverlay(); mode = "play";
      if (S.phase === "boss" || S.phase === "warning") Music.play(3);
      else if (S.phase === "run") Music.play(S.def.tune);
      run();
    }
    function showOver(win) {
      if (S.overShown) return;
      S.overShown = true;
      const score = S.score;
      Music.off();
      if (!win) ctx.sfx("fail");
      showOverlay(`<div class="vt-card">
          <h2>${win ? "임무 완료!" : "게임 오버"}</h2>
          <p>${win ? "회사를 바이러스 로봇 군단에게서 되찾았어요" : `${S.stage + 1}구역 「${S.def.name}」까지 갔어요`} · 구한 동료 ${S.rescued}명</p>
          <div class="vt-big">${score.toLocaleString("ko-KR")}점</div>
          <button type="button" class="vt-go" data-act="again">다시 하기</button>
        </div>`);
      mode = "over";
      if (!submitted) { submitted = true; ctx.submit(score); }
    }
    overlay.addEventListener("click", (e) => {
      const h = e.target.closest("[data-hero]");
      if (h) { pickHero(Number(h.dataset.hero)); return; }
      const b = e.target.closest("[data-act]");
      if (!b) return;
      const a = b.dataset.act;
      if (a === "start" || a === "again") start();
      else if (a === "resume") resume();
    });
    document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });
    if (window.HKSound && HKSound.onChange) HKSound.onChange((m) => {
      if (m) Music.stop();
      else if (mode === "play" && S) Music.play(S.phase === "boss" || S.phase === "warning" ? 3 : S.def.tune);
    });

    ctx.onScore && ctx.onScore(() => (S ? S.score : 0));
    ctx.onRestart(start);
    ctx.onPause(pause);
    if (window.ResizeObserver) new ResizeObserver(() => fit()).observe(stage);
    window.addEventListener("resize", fit);
    fit();
    showTitle();

    // 시험 페이지 전용 — 운영 페이지는 __VT_TEST__ 를 켜지 않는다
    if (window.__VT_TEST__) {
      window.__vt = {
        get S() { return S; },
        get mode() { return mode; },
        god(on = true) { if (S) S.god = on; },
        skipTo(i) { if (S && STAGES[i]) loadStage(i); },
        toBoss() {
          if (!S) return;
          S.evIdx = S.ev.length; S.queue = []; S.lock = null; S.enemies = [];
          S.lockX = S.def.arena; S.camX = S.def.arena - 2; S.p.x = S.def.arena + 170; S.p.y = BASE; S.p.vy = 0;
        },
        hurtBoss(n) { if (S && S.boss) hitBoss(n); },
        killAll() { if (S) S.enemies.forEach((e) => killEnemy(e)); },
        die() { if (S) { S.p.invul = 0; S.god = false; hurtPlayer(); } },
        give(k) { if (S) pickItem({ kind: k, x: S.p.x, y: S.p.y }); },
        step(n = 1) { for (let i = 0; i < n; i++) update(DT); draw(); },
        galmuri: () => galmuri,
      };
    }
  }

  window.HKVitamin = { setup };
})();
