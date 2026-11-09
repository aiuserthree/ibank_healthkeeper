/**
 * 종이비행기 편대 (key: paperjet) — 레트로 오락실 · 횡스크롤 비행 슈팅
 *
 * web/games/paperjet.html 이 HKPlay.mountGame({ key: "paperjet", setup: HKPaperJet.setup }) 로 부른다.
 * - 그림: 384 × 216 저해상도 캔버스에 픽셀로 그려 CSS 로 키운다(image-rendering: pixelated).
 *         한글 글자만 그 위의 선명한 층(ui 캔버스)에 쓴다. 그림 · 소리 파일 없이 모두 코드로.
 * - 갱신: requestAnimationFrame + 1/120초 고정 간격(화면 주사율과 상관없이 같은 속도).
 * - 소리: 공통 효과음(ctx.sfx) + 이 파일의 짧은 칩튠 배경음(공통 음소거 HKSound 를 따른다).
 * - 시험 페이지에서 window.__PJ_TEST__ 를 켜 두면 window.__pj 디버그 훅(무적 · 스테이지 건너뛰기)이 생긴다.
 */
window.HKPaperJet = (function () {
  "use strict";
  const W = 384, H = 216, STEP = 1 / 120, LW = 768;
  const FONT_KO = '"Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const TAU = Math.PI * 2;
  function mkCanvas(w, h) { const c = document.createElement("canvas"); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; }
  // 같은 그림이 늘 같게 나오는 난수 (배경 · 지형)
  let seedV = 1;
  function srand(s) { seedV = (s >>> 0) || 1; }
  function sr() { seedV ^= seedV << 13; seedV >>>= 0; seedV ^= seedV >>> 17; seedV ^= seedV << 5; seedV >>>= 0; return seedV / 4294967296; }
  const srr = (a, b) => a + sr() * (b - a);
  const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

  // ================= 픽셀 글꼴 =================
  // 5 × 7 (큰 글자: STAGE · WARNING · GAME OVER ...)
  const F5 = {
    "0": [14, 17, 19, 21, 25, 17, 14], "1": [4, 12, 4, 4, 4, 4, 14], "2": [14, 17, 1, 2, 4, 8, 31], "3": [30, 1, 1, 14, 1, 1, 30],
    "4": [2, 6, 10, 18, 31, 2, 2], "5": [31, 16, 30, 1, 1, 17, 14], "6": [6, 8, 16, 30, 17, 17, 14], "7": [31, 1, 2, 4, 8, 8, 8],
    "8": [14, 17, 17, 14, 17, 17, 14], "9": [14, 17, 17, 15, 1, 2, 12],
    A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14], D: [28, 18, 17, 17, 17, 18, 28],
    E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16], G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17],
    I: [14, 4, 4, 4, 4, 4, 14], J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
    M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16],
    Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17], S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
    U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
    Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
    "!": [4, 4, 4, 4, 4, 0, 4], "+": [0, 4, 4, 31, 4, 4, 0], "-": [0, 0, 0, 31, 0, 0, 0], ".": [0, 0, 0, 0, 0, 0, 4],
    ":": [0, 4, 0, 0, 0, 4, 0], "×": [0, 0, 17, 10, 4, 10, 17], ",": [0, 0, 0, 0, 0, 4, 8],
  };
  // 3 × 5 (작은 점수 숫자)
  const F3 = {
    "0": [7, 5, 5, 5, 7], "1": [2, 6, 2, 2, 7], "2": [7, 1, 7, 4, 7], "3": [7, 1, 7, 1, 7], "4": [5, 5, 7, 1, 1],
    "5": [7, 4, 7, 1, 7], "6": [7, 4, 7, 5, 7], "7": [7, 1, 2, 2, 2], "8": [7, 5, 7, 5, 7], "9": [7, 5, 7, 1, 7],
    x: [0, 5, 2, 5, 0], "+": [0, 2, 7, 2, 0], "!": [2, 2, 2, 0, 2],
  };
  function glyphs(g, str, x, y, s, color, font, gw, gh, adv) {
    const two = Array.isArray(color);
    for (let i = 0; i < str.length; i++) {
      const gl = font[str[i]];
      if (!gl) continue;
      for (let r = 0; r < gh; r++) {
        const bits = gl[r];
        if (!bits) continue;
        g.fillStyle = two ? (r < gh / 2 ? color[0] : color[1]) : color;
        for (let c = 0; c < gw; c++) if (bits & (1 << (gw - 1 - c))) g.fillRect(x + i * adv + c * s, y + r * s, s, s);
      }
    }
  }
  function ptext(g, str, x, y, s, color, shadow, align) {
    str = String(str).toUpperCase();
    const adv = 6 * s, w = str.length * adv - s;
    if (align === "center") x -= w / 2; else if (align === "right") x -= w;
    x = Math.round(x); y = Math.round(y);
    if (shadow) { glyphs(g, str, x + s, y + s, s, shadow, F5, 5, 7, adv); glyphs(g, str, x, y + s, s, shadow, F5, 5, 7, adv); }
    glyphs(g, str, x, y, s, color, F5, 5, 7, adv);
    return w;
  }
  function stext(g, str, x, y, color, align, shadow) {
    str = String(str);
    const w = str.length * 4 - 1;
    if (align === "center") x -= w / 2; else if (align === "right") x -= w;
    x = Math.round(x); y = Math.round(y);
    if (shadow) glyphs(g, str, x + 1, y + 1, 1, shadow, F3, 3, 5, 4);
    glyphs(g, str, x, y, 1, color, F3, 3, 5, 4);
  }
  // ================= 색 =================
  function hex2rgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mix(a, b, t) { const A = hex2rgb(a), B = hex2rgb(b); return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join(""); }
  function rgba(h, a) { const [r, gg, b] = hex2rgb(h); return `rgba(${r},${gg},${b},${a})`; }
  const DEEP = "#140c2a", CREAM = "#fff6e0";
  // 재질 램프 [외곽선, 그림자, 바탕, 밝음, 하이라이트] — 어두울수록 파랑 · 보라, 밝을수록 노랑 쪽으로 색조를 옮긴다
  const RAMP = {
    paper: ["#3d335e", "#9a90c4", "#e4ddf4", "#fbf3e2", CREAM],
    paper2: ["#352c55", "#7f76ab", "#c3bbe0", "#e6def2", "#fbf3e2"],
    paperY: ["#5a2c18", "#c27a2a", "#ffcf5a", "#ffeaa0", CREAM],
    mint: ["#0b4a52", "#13917f", "#3dffd0", "#a8ffe6", "#efffe9"],
    crane: ["#14286b", "#2f5fc0", "#6aa8ff", "#bcdcff", "#f0f6ff"],
    coral: ["#2e0e2c", "#782246", "#d2466a", "#ff8a7a", "#ffd6b0"],
    plum: ["#1a0d2c", "#3a1d56", "#653a88", "#9a63b6", "#d6a8e0"],
    steel: ["#1b1733", "#3d3d68", "#7074a4", "#b0b5da", "#eceeff"],
    red: ["#360a26", "#861538", "#df2f4b", "#ff7a5c", "#ffc6a0"],
    wood: ["#26120f", "#5a2c1a", "#985826", "#cf8a44", "#f6c47a"],
    ylw: ["#43200f", "#a35c18", "#f0ad36", "#ffd66a", "#fff1b0"],
    lav: ["#211b3b", "#53517e", "#9298c4", "#ccd1ec", CREAM],
    green: ["#0e3426", "#1d7446", "#3cbf60", "#8ae47a", "#dcffb0"],
    cloudN: ["#060918", "#101838", "#1c2a5c", "#2e4580", "#5a78b5"],
    beige: ["#35253b", "#7c6573", "#c6b2a2", "#ecdac2", CREAM],
    hull: ["#120a26", "#2a2150", "#463a78", "#6c5ca6", "#a796de"],
    gold: ["#4a2408", "#ac6416", "#ffb02e", "#ffd98a", CREAM],
    iRed: ["#420a22", "#9c1832", "#ff4848", "#ff9a7a", "#ffd8b8"],
    iBlue: ["#0f1f4a", "#2756b6", "#4a9cff", "#a8d6ff", "#eaf6ff"],
    iGreen: ["#0e3622", "#1b8448", "#3cdc6a", "#9cf59a", "#e6ffd0"],
    iYel: ["#462708", "#ad6c18", "#ffc83a", "#ffe68a", CREAM],
  };
  const V = (r) => { const a = r.slice(); a.v = true; return a; };
  // 스테이지 팔레트 — 이 안의 색으로만 배경 · 지형을 칠한다
  const PAL = {
    sky: { sky: ["#2a78de", "#3592f2", "#3aa6ff", "#5ab6ff", "#7cc8ff", "#9fdcff", "#c4ecff", "#e4f6ff"], cloud: ["#6f9fd6", "#a9d0f2", "#dff1ff", CREAM], bld: ["#1c2356", "#2c3874", "#41548f", "#5f78bf", "#9fb6e6"], win: ["#9fdcff", "#d4f1ff", "#ffd166"], green: ["#14532d", "#2bb34a", "#7be05a", "#d8ff8a"], tint: "#fff6ea", vig: "#1b1f4b", vigA: 0.32, fg: CREAM },
    duct: { bg: ["#0b111b", "#0e1420", "#141d2c", "#1b2738", "#22324a", "#2a3d52"], metal: ["#0e1420", "#1b2738", "#2a3d52", "#3f5a70", "#5f8296", "#9fc2cc"], light: "#e6f1ef", warn: "#ffcc33", hot: "#ff5a36", cyan: "#6fb8e8", tint: "#d6e8f6", vig: "#04070d", vigA: 0.55, fg: "#070b12" },
    storm: { sky: ["#070a1c", "#0b0f24", "#0f1632", "#16204a", "#1c2a5c", "#24346e"], cloud: ["#0b0f24", "#16204a", "#24346e", "#3c5a99", "#7aa2d6"], bld: ["#060918", "#0b0f24", "#141d44", "#24346e", "#3c5a99"], win: "#ffd166", neon: "#ff4f9a", neon2: "#6fd3e8", bolt: "#fffbe0", rain: "#7aa2d6", tint: "#cdd6f6", vig: "#04050e", vigA: 0.55, fg: "#05071a" },
    sunset: { sky: ["#1a1033", "#2b1a4a", "#3a1c5c", "#6b2a75", "#a8366f", "#e0505f", "#ff7f50", "#ffb26b", "#ffe0a3"], sun: ["#ffb26b", "#ffe0a3", CREAM], far: "#45407a", bld: ["#120a26", "#1a1033", "#2b2350", "#45407a", "#6b5f9e"], win: "#ffb26b", rim: "#ff7f50", tint: "#ffe6cc", vig: "#1a1033", vigA: 0.42, fg: "#140c2a" },
  };

  // ================= 스프라이트 굽기 =================
  // 모양(다각형 · 타원 · 사각형 · 선)을 재질 칸에 찍은 뒤, 한 번에 명암(왼쪽 위 빛) · 선택적 외곽선 · 림 라이트를 입혀 캔버스로 굽는다
  function makeSpr(w, h, mats, draw, opts) {
    opts = opts || {};
    const grid = new Array(w * h).fill(null);
    const set = (x, y, m) => { x = Math.floor(x); y = Math.floor(y); if (x >= 0 && y >= 0 && x < w && y < h) grid[y * w + x] = m; };
    const api = {
      px: set,
      rect(x, y, rw, rh, m) { for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) set(x + i, y + j, m); },
      ell(cx, cy, rx, ry, m) { for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) { const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry; if (dx * dx + dy * dy <= 1) set(x, y, m); } },
      poly(pts, m) {
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        for (let y = Math.floor(y0); y <= y1; y++) for (let x = Math.floor(x0); x <= x1; x++) {
          const px = x + 0.5, py = y + 0.5;
          let inside = false;
          for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside; }
          if (inside) set(x, y, m);
        }
      },
      line(x0, y0, x1, y1, m) { const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)))); for (let i = 0; i <= n; i++) set(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), m); },
      erase(x, y, rw, rh) { for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) set(x + i, y + j, null); },
    };
    draw(api);
    const get = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? null : grid[y * w + x]);
    // 재질별 범위(세로 그라데이션 재질용)
    const box = {};
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const m = grid[y * w + x]; if (!m) continue; const b = box[m] || (box[m] = [y, y]); if (y < b[0]) b[0] = y; if (y > b[1]) b[1] = y; }
    const c = mkCanvas(w + 2, h + 2), g = c.getContext("2d");
    const outl = (R, lit) => (Array.isArray(R) ? (lit ? R[1] : R[0]) : mix(R, DEEP, 0.65));
    if (!opts.noOutline) {
      for (let y = -1; y <= h; y++) for (let x = -1; x <= w; x++) {
        if (get(x, y)) continue;
        const r = get(x + 1, y), d = get(x, y + 1), l = get(x - 1, y), u = get(x, y - 1);
        const n = r || d || l || u;
        if (!n) continue;
        const lit = !!(r || d) && !(l || u);
        g.fillStyle = outl(mats[n], lit && !opts.hardOutline);
        g.fillRect(x + 1, y + 1, 1, 1);
      }
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const m = grid[y * w + x];
      if (!m) continue;
      const R = mats[m];
      let col;
      if (typeof R === "string") col = R;
      else {
        const edge = (xx, yy) => { const n = get(xx, yy); return !n || mats[n] !== R; };
        const up = edge(x, y - 1), lf = edge(x - 1, y), dn = edge(x, y + 1), rt = edge(x + 1, y);
        let idx = 2;
        if (R.v) {
          const b = box[m], f = (y - b[0]) / Math.max(1, b[1] - b[0]);
          idx = f < 0.3 ? 3 : f > 0.68 ? 1 : 2;
          if (Math.abs(f - 0.3) * (b[1] - b[0]) < 1 && (x + y) & 1) idx = 2;
          if (Math.abs(f - 0.68) * (b[1] - b[0]) < 1 && (x + y) & 1) idx = 2;
        }
        if (up && lf) idx = 4; else if (up || lf) idx = Math.max(idx, 3); else if (dn || rt) idx = 1;
        col = R[idx];
        if (opts.rim && (dn || rt) && !(up || lf)) col = opts.rim;
      }
      g.fillStyle = col;
      g.fillRect(x + 1, y + 1, 1, 1);
    }
    return c;
  }
  function whiteOf(c, color) {
    const o = mkCanvas(c.width, c.height), g = o.getContext("2d");
    g.drawImage(c, 0, 0); g.globalCompositeOperation = "source-in"; g.fillStyle = color || CREAM; g.fillRect(0, 0, o.width, o.height);
    return o;
  }
  function flipC(c, fx, fy) {
    const o = mkCanvas(c.width, c.height), g = o.getContext("2d");
    g.translate(fx ? c.width : 0, fy ? c.height : 0); g.scale(fx ? -1 : 1, fy ? -1 : 1); g.drawImage(c, 0, 0);
    return o;
  }
  function pixRows(rows, pal) {
    const h = rows.length, w = rows[0].length, c = mkCanvas(w, h), g = c.getContext("2d");
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const ch = rows[y][x]; if (ch !== "." && pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); } }
    return c;
  }
  // 빛 번짐 — 미리 만든 원형 그라데이션을 lighter 로 겹친다
  const glowCache = new Map();
  function glowSpr(color, r) {
    const k = color + r;
    if (glowCache.has(k)) return glowCache.get(k);
    const c = mkCanvas(r * 2, r * 2), g = c.getContext("2d");
    const gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, rgba(color, 0.9)); gr.addColorStop(0.35, rgba(color, 0.35)); gr.addColorStop(1, rgba(color, 0));
    g.fillStyle = gr; g.fillRect(0, 0, r * 2, r * 2);
    glowCache.set(k, c);
    return c;
  }

  // 종이비행기 3기 — 빠름 / 보통 / 튼튼 (시그니처 색: 민트 꼬리 바람 · 민트 탄)
  const SHIPS = [
    {
      id: "swift", name: "쌩쌩호", trait: "빠름", desc: "제일 빨라요 · 차지는 조금 느려요", speed: 124, charge: 1.15, bombs: 2, respawnShield: false, icon: "#3dffd0",
      mats: { P: RAMP.paper, Q: RAMP.paper2, A: RAMP.mint, c: "#9a90c4" },
      shape: [["poly", [[0, 6], [31, 9], [10, 9]], "P"], ["poly", [[5, 9], [31, 9], [11, 12.5]], "Q"], ["line", [3, 7, 29, 9], "c"], ["poly", [[8, 7.5], [24, 8.6], [24, 9], [9, 9]], "A"], ["poly", [[25, 8.2], [31, 9], [25, 10]], "A"], ["poly", [[13, 4.5], [21, 8], [16, 8]], "Q"]],
    },
    {
      id: "basic", name: "반듯호", trait: "보통", desc: "무난해요 · 차지가 빨리 차요", speed: 104, charge: 0.8, bombs: 2, respawnShield: false, icon: "#7cc8ff",
      mats: { P: RAMP.paper, Q: RAMP.paper2, A: RAMP.crane, c: "#9a90c4" },
      shape: [["poly", [[1, 2], [31, 9], [12, 9]], "P"], ["poly", [[6, 9], [31, 9], [13, 14.5]], "Q"], ["line", [3, 3, 29, 9], "c"], ["poly", [[9, 6], [26, 8.8], [12, 8.8]], "A"], ["poly", [[1, 9], [8, 9], [3, 12]], "Q"]],
    },
    {
      id: "tough", name: "두툼호", trait: "튼튼", desc: "느리지만 되살아날 때마다 방패 · 폭탄 하나 더", speed: 88, charge: 1.0, bombs: 3, respawnShield: true, icon: "#ffcf5a",
      mats: { P: RAMP.paperY, Q: RAMP.paper2, A: RAMP.red, c: "#c27a2a" },
      shape: [["poly", [[0, 0], [31, 9], [13, 9]], "P"], ["poly", [[3, 9], [31, 9], [9, 17]], "Q"], ["line", [2, 1, 29, 9], "c"], ["poly", [[7, 4], [22, 8], [10, 8]], "A"], ["poly", [[18, 9], [27, 9], [21, 13]], "P"]],
    },
  ];
  function shipSprite(s, ang) {
    const cx = 16, cy = 9, ca = Math.cos(ang), sa = Math.sin(ang);
    const rot = ([x, y]) => [cx + (x - cx) * ca - (y - cy) * sa, cy + 1 + (x - cx) * sa + (y - cy) * ca];
    return makeSpr(32, 20, s.mats, (a) => {
      for (const [k, d, m] of s.shape) {
        if (k === "poly") a.poly(d.map(rot), m);
        else { const [p0, p1] = [rot([d[0], d[1]]), rot([d[2], d[3]])]; a.line(p0[0], p0[1], p1[0], p1[1], m); }
      }
    });
  }

  const ITEMS = {
    red: { ramp: RAMP.iRed, c: "#ff4848", l: "#ff9a7a", sym: [4, 14, 31, 4, 4], name: "무기 업" },
    blue: { ramp: RAMP.iBlue, c: "#4a9cff", l: "#a8d6ff", sym: [17, 27, 14, 4, 0], name: "종이학" },
    green: { ramp: RAMP.iGreen, c: "#3cdc6a", l: "#9cf59a", sym: [31, 31, 31, 14, 4], name: "방패" },
    yellow: { ramp: RAMP.iYel, c: "#ffc83a", l: "#ffe68a", sym: [14, 17, 21, 17, 14], name: "폭탄" },
  };

  let ART = null;
  function buildArt() {
    if (ART) return ART;
    ART = {};
    ART.ships = SHIPS.map((s) => {
      const up = shipSprite(s, -0.16), mid = shipSprite(s, 0), down = shipSprite(s, 0.16);
      return { up, mid, down, white: whiteOf(mid) };
    });
    const cm = { B: RAMP.crane, W: RAMP.paper, e: "#14286b" };
    ART.crane = [
      makeSpr(18, 13, cm, (a) => { a.poly([[2, 8], [15, 8], [11, 12], [5, 12]], "B"); a.poly([[5, 8], [9, 0], [12, 8]], "W"); a.line(13, 8, 16, 3, "B"); a.px(17, 3, "B"); a.line(4, 8, 0, 4, "B"); a.px(16, 3, "e"); }),
      makeSpr(18, 13, cm, (a) => { a.poly([[2, 6], [15, 6], [11, 10], [5, 10]], "B"); a.poly([[5, 7], [13, 7], [8, 12]], "W"); a.line(13, 6, 16, 2, "B"); a.px(17, 2, "B"); a.line(4, 6, 0, 3, "B"); a.px(16, 2, "e"); }),
    ];
    // 잔소리 드론 — 산호색 몸통 · 핫핑크 눈
    const dm = { B: RAMP.coral, S: RAMP.steel, P: RAMP.plum, v: "#2b1030", e: "#ff4f9a", w: "#ffd0e0" };
    const drone = (long) => makeSpr(22, 15, dm, (a) => {
      if (long) { a.rect(0, 1, 10, 1, "S"); a.rect(12, 1, 10, 1, "S"); } else { a.rect(3, 1, 5, 1, "S"); a.rect(14, 1, 5, 1, "S"); }
      a.rect(3, 3, 16, 1, "S"); a.rect(5, 3, 1, 2, "S"); a.rect(16, 3, 1, 2, "S");
      a.ell(11, 9, 9, 5, "B"); a.rect(4, 12, 14, 1, "P");
      a.ell(6.5, 9, 3.2, 2.6, "v"); a.px(5, 9, "e"); a.px(6, 9, "e"); a.px(5, 8, "w");
      a.px(9, 14, "S"); a.px(14, 14, "S");
    });
    ART.drone = [drone(true), drone(false)];
    ART.droneW = whiteOf(ART.drone[0]);
    const sm = { S: RAMP.steel, r: "#ff4f9a" };
    ART.clip = makeSpr(22, 9, sm, (a) => {
      a.rect(3, 0, 17, 1, "S"); a.rect(3, 8, 15, 1, "S"); a.rect(20, 1, 1, 7, "S"); a.rect(2, 1, 1, 7, "S");
      a.rect(6, 2, 12, 1, "S"); a.rect(6, 6, 12, 1, "S"); a.rect(5, 3, 1, 3, "S"); a.rect(18, 3, 1, 3, "S"); a.rect(9, 4, 9, 1, "S");
      a.rect(0, 3, 2, 3, "r");
    });
    ART.clipW = whiteOf(ART.clip);
    const tm = { S: RAMP.steel, R: RAMP.red, e: "#ffd0e0" };
    ART.turret = makeSpr(18, 11, tm, (a) => { a.rect(0, 8, 18, 3, "S"); a.rect(7, 5, 4, 3, "S"); a.ell(9, 5, 6, 4.5, "R"); a.px(7, 3, "e"); });
    ART.turretD = flipC(ART.turret, false, true);
    ART.turretW = whiteOf(ART.turret); ART.turretDW = whiteOf(ART.turretD);
    const gm = { R: RAMP.red, P: RAMP.paper, l: "#9a90c4" };
    ART.glove = makeSpr(14, 14, gm, (a) => { a.ell(7.5, 5.5, 6.2, 5.5, "R"); a.ell(2, 7, 1.8, 2.8, "R"); a.rect(2, 10, 11, 4, "P"); a.rect(3, 11, 9, 1, "l"); });
    ART.gloveD = flipC(ART.glove, false, true);
    ART.gloveW = whiteOf(ART.glove); ART.gloveDW = whiteOf(ART.gloveD);
    const hm = { L: V(RAMP.lav), P: RAMP.paper, k: "#1a1033", w: CREAM, m: "#e0304a", e: "#ff4f9a" };
    ART.head = makeSpr(18, 15, hm, (a) => { a.rect(1, 1, 16, 13, "L"); a.rect(3, 3, 12, 2, "k"); a.rect(5, 0, 8, 3, "P"); a.rect(3, 6, 4, 3, "w"); a.rect(11, 6, 4, 3, "w"); a.px(3, 7, "k"); a.px(11, 7, "k"); a.rect(5, 11, 8, 2, "m"); a.px(15, 12, "e"); });
    ART.headW = whiteOf(ART.head); ART.headR = flipC(ART.head, true, false);
    const pm = { P: V(RAMP.paper), l: "#9a90c4", o: "#53517e" };
    ART.seg = [
      makeSpr(10, 12, pm, (a) => { a.rect(0, 0, 10, 12, "P"); a.rect(2, 3, 6, 1, "l"); a.rect(2, 6, 6, 1, "l"); a.rect(2, 9, 4, 1, "l"); }),
      makeSpr(10, 12, pm, (a) => { a.rect(0, 0, 10, 12, "P"); a.rect(2, 3, 6, 1, "l"); a.rect(2, 6, 6, 1, "l"); a.px(1, 2, "o"); a.px(1, 9, "o"); }),
    ];
    const stm = { W: RAMP.wood, G: RAMP.gold, R: V(RAMP.red), I: RAMP.plum, w: CREAM, k: "#1a1033" };
    ART.hopper = makeSpr(16, 22, stm, (a) => { a.ell(8, 3, 4, 3, "W"); a.rect(6, 5, 4, 6, "W"); a.rect(3, 10, 10, 2, "G"); a.rect(1, 12, 14, 8, "R"); a.rect(3, 14, 3, 3, "w"); a.rect(10, 14, 3, 3, "w"); a.px(3, 15, "k"); a.px(10, 15, "k"); a.rect(0, 20, 16, 2, "I"); });
    ART.hopperW = whiteOf(ART.hopper);
    const bm = { R: RAMP.red, Y: RAMP.ylw, W: RAMP.wood, l: "#5a2c1a" };
    ART.balloon = makeSpr(20, 28, bm, (a) => { a.ell(10, 10, 9.5, 10, "R"); a.ell(10, 10, 3.5, 10, "Y"); a.poly([[4, 17], [16, 17], [12, 21], [8, 21]], "R"); a.line(7, 20, 7, 23, "l"); a.line(13, 20, 13, 23, "l"); a.rect(6, 23, 8, 5, "W"); });
    ART.balloonW = whiteOf(ART.balloon);
    const mm = { C: RAMP.coral, Q: RAMP.plum };
    ART.mini = makeSpr(15, 8, mm, (a) => { a.poly([[15, 0], [0, 4], [9, 4]], "C"); a.poly([[15, 7.5], [0, 4], [9, 4]], "Q"); });
    ART.miniW = whiteOf(ART.mini);
    // 적 탄 — 빨강~분홍 + 가운데 흰빛 (배경과 확실히 구분)
    ART.bul = {
      orb: { c: pixRows(["..ooo..", ".ommmo.", "omhhhmo", "omhwhmo", "omhhhmo", ".ommmo.", "..ooo.."], { o: "#6a1038", m: "#ff3f7a", h: "#ff9ab8", w: CREAM }), r: 2.4, gl: "#ff3f7a" },
      big: { c: pixRows(["...ooo...", ".oommmoo.", ".ommhhmo.", "omhhwhhmo", "omhwwwhmo", "omhhwhhmo", ".ommhhmo.", ".oommmoo.", "...ooo..."], { o: "#4a0a30", m: "#e8185a", h: "#ff7aa0", w: CREAM }), r: 3.4, gl: "#ff2a5a" },
      drop: { c: pixRows(["..o..", ".omo.", "omhmo", "ohwho", "ohhho", ".ooo."], { o: "#6a1038", m: "#ff3f7a", h: "#ffb3d1", w: CREAM }), r: 2.2, gl: "#ff4f9a" },
      sheet: { c: pixRows(["ooooooo", "owwwwwo", "ohhhhho", "owwwwwo", "ooooooo"], { o: "#b0123f", w: CREAM, h: "#ff9ab8" }), r: 2.4, gl: "#ff3f7a" },
      memo: { c: pixRows(["oooooo", "ommmmo", "omhhmo", "omhwmo", "ommmoo", "ooooo."], { o: "#7a1240", m: "#ff6f9a", h: "#ffc0d6", w: CREAM }), r: 2.4, gl: "#ff4f9a" },
      dust: { c: pixRows([".o.o.o.", "ommmmmo", ".mhhhm.", "omhwhmo", ".mhhhm.", "ommmmmo", ".o.o.o."], { o: "#5a1a3a", m: "#d9577e", h: "#ffa8c4", w: CREAM }), r: 2.4, gl: "#ff5a8a" },
    };
    // 색종이 아이템 — 접은 종이 + 금테 + 흰 기호
    ART.items = {};
    for (const k of Object.keys(ITEMS)) {
      const it = ITEMS[k];
      const c = makeSpr(13, 13, { I: V(it.ramp), G: RAMP.gold, s: CREAM, f: it.ramp[1] }, (a) => {
        a.rect(0, 0, 13, 13, "G"); a.rect(1, 1, 11, 11, "I");
        a.poly([[8, 12], [12, 8], [12, 12]], "f");
        it.sym.forEach((bits, r) => { for (let cc = 0; cc < 5; cc++) if (bits & (1 << (4 - cc))) a.px(4 + cc, 4 + r, "s"); });
      });
      ART.items[k] = c;
    }
    const P = "#ff4f9a";
    ART.droneP = whiteOf(ART.drone[0], P); ART.clipP = whiteOf(ART.clip, P); ART.turretP = whiteOf(ART.turret, P); ART.turretDP = whiteOf(ART.turretD, P);
    ART.gloveP = whiteOf(ART.glove, P); ART.gloveDP = whiteOf(ART.gloveD, P); ART.hopperP = whiteOf(ART.hopper, P);
    buildBossArt(ART);
    return ART;
  }

  // 보스 그림 — 화면 높이의 절반 안팎으로 크게
  function buildBossArt(A) {
    // 거대 복합기
    A.copier = makeSpr(112, 98, { C: V(RAMP.lav), D: RAMP.steel, g: "#8ff0ff", k: "#1a1033", l: "#53517e", r: "#ff4f9a", y: "#ffd166", m: "#3dffd0" }, (a) => {
      a.rect(10, 14, 96, 74, "C"); a.rect(6, 4, 104, 12, "D"); a.rect(12, 8, 92, 3, "g");
      a.rect(62, 22, 38, 22, "k");
      for (let i = 0; i < 4; i++) a.rect(66, 54 + i * 6, 32, 2, "l");
      a.rect(16, 88, 12, 8, "D"); a.rect(88, 88, 12, 8, "D");
      a.rect(0, 34, 12, 32, "k");
      a.px(66, 48, "r"); a.px(70, 48, "y"); a.px(74, 48, "m");
      a.rect(14, 20, 40, 2, "l"); a.rect(14, 26, 30, 2, "l");
    });
    A.copierGun = makeSpr(38, 14, { S: V(RAMP.steel), y: "#ffcc33", k: "#1a1033" }, (a) => { a.rect(8, 1, 30, 12, "S"); a.rect(0, 4, 10, 6, "S"); a.rect(18, 1, 3, 12, "y"); a.rect(0, 6, 2, 2, "k"); });
    A.copierTray = makeSpr(52, 13, { T: V(RAMP.lav), k: "#53517e", P: RAMP.paper }, (a) => { a.rect(0, 0, 52, 13, "T"); a.rect(20, 5, 12, 2, "k"); a.rect(-1, 2, 6, 9, "P"); });
    A.paperTongue = makeSpr(16, 20, { P: V(RAMP.paper), l: "#9a90c4" }, (a) => { a.rect(0, 0, 16, 20, "P"); a.rect(3, 5, 10, 1, "l"); a.rect(3, 9, 10, 1, "l"); a.rect(3, 13, 7, 1, "l"); });
    // 덕트 청소 로봇
    A.robot = makeSpr(96, 80, { Y: V(RAMP.ylw), k: "#1a1033", v: "#6fe0ff", S: RAMP.steel, w: CREAM, r: "#ff5a36" }, (a) => {
      a.poly([[20, 0], [76, 0], [96, 20], [96, 60], [76, 80], [20, 80], [0, 60], [0, 20]], "Y");
      a.rect(20, 12, 58, 22, "k"); a.rect(22, 14, 54, 18, "v"); a.rect(24, 15, 50, 2, "w");
      a.rect(28, 46, 40, 22, "S");
      for (let i = 0; i < 3; i++) a.rect(32, 50 + i * 6, 32, 2, "k");
      a.px(8, 24, "r"); a.px(8, 56, "r"); a.px(88, 24, "r"); a.px(88, 56, "r");
    });
    // 천둥 회의실
    A.thunder = makeSpr(140, 116, { N: V(RAMP.cloudN), R: V(RAMP.beige), S: RAMP.steel, k: "#1a1033", W: RAMP.wood }, (a) => {
      for (const [x, y, rx, ry] of [[30, 32, 30, 22], [70, 22, 38, 20], [110, 32, 30, 22], [124, 62, 16, 22], [104, 96, 32, 18], [62, 102, 36, 14], [22, 90, 24, 20], [12, 60, 14, 22]]) a.ell(x, y, rx, ry, "N");
      a.rect(26, 32, 92, 58, "R"); a.rect(22, 27, 100, 6, "S");
      a.rect(36, 40, 58, 36, "k");
      a.rect(100, 52, 12, 38, "W");
      a.rect(56, 14, 32, 12, "k");
    }, { rim: "#7aa2d6" });
    A.speaker = makeSpr(18, 20, { S: V(RAMP.steel), k: "#1a1033", g: "#3d3d68" }, (a) => { a.rect(0, 0, 18, 20, "S"); a.ell(8, 10, 6, 6, "k"); a.ell(8, 10, 3, 3, "g"); });
    // 야근 비행선 — 노을빛 림 라이트
    A.hull = makeSpr(260, 92, { H: V(RAMP.hull), y: "#ffd166", s: "#2a2150", F: RAMP.hull }, (a) => {
      a.ell(130, 44, 128, 40, "H");
      a.poly([[226, 10], [256, 0], [258, 26], [236, 30]], "F"); a.poly([[226, 78], [256, 90], [258, 62], [236, 58]], "F");
      for (let x = 30; x < 230; x += 22) a.line(x, 8 + Math.abs(x - 130) * 0.12, x, 80 - Math.abs(x - 130) * 0.12, "s");
      a.rect(16, 46, 220, 2, "y");
    }, { rim: "#ff7f50" });
    A.gondola = makeSpr(56, 18, { G: V(RAMP.steel), k: "#1a1033" }, (a) => { a.rect(0, 0, 56, 18, "G"); a.rect(4, 5, 48, 7, "k"); });
    A.front = makeSpr(26, 16, { R: V(RAMP.red), S: RAMP.steel }, (a) => { a.ell(15, 8, 10, 7.5, "R"); a.rect(0, 6, 9, 4, "S"); });
    A.pod = makeSpr(32, 16, { S: V(RAMP.steel), w: CREAM, r: "#ff4f9a" }, (a) => { a.rect(0, 2, 32, 14, "S"); for (let i = 0; i < 3; i++) { a.rect(4 + i * 9, 0, 6, 6, "w"); a.px(5 + i * 9, 0, "r"); } });
    A.engine = makeSpr(22, 24, { S: V(RAMP.steel), k: "#1a1033", o: "#ff7f50" }, (a) => { a.rect(0, 0, 22, 24, "S"); a.rect(3, 4, 16, 4, "k"); a.rect(3, 16, 16, 2, "o"); });
    A.clock = makeSpr(42, 42, { C: RAMP.gold, F: RAMP.paper, k: "#1a1033" }, (a) => { a.ell(21, 21, 21, 21, "C"); a.ell(21, 21, 16, 16, "F"); for (let i = 0; i < 12; i++) { const an = (i / 12) * TAU; a.px(21 + Math.cos(an) * 13, 21 + Math.sin(an) * 13, "k"); } });
    A.miniBalloon = makeSpr(34, 26, { B: V(RAMP.plum), y: "#ffd166" }, (a) => { a.ell(17, 11, 16, 11, "B"); a.rect(2, 11, 30, 2, "y"); a.line(10, 20, 15, 25, "B"); a.line(24, 20, 19, 25, "B"); }, { rim: "#ff7f50" });
    for (const k of ["copierGun", "copierTray", "speaker", "front", "pod", "engine", "clock"]) A[k + "W"] = whiteOf(A[k]);
    for (const k of ["copierGun", "copierTray", "speaker", "front", "pod", "engine"]) A[k + "X"] = whiteOf(A[k], "#2a2346");
  }

  // ================= 배경음 (칩튠) =================
  // 공통 음소거(HKSound)를 따른다. 효과음과 따로 작은 소리 장치를 쓰고, 화면을 떠나면 닫는다.
  const NOTE = { c: 0, "c#": 1, db: 1, d: 2, "d#": 3, eb: 3, e: 4, f: 5, "f#": 6, gb: 6, g: 7, "g#": 8, ab: 8, a: 9, "a#": 10, bb: 10, b: 11 };
  function midiOf(tok) { const m = /^([a-g](?:#|b)?)(\d)$/.exec(tok); return m ? 12 * (+m[2] + 1) + NOTE[m[1]] : null; }
  function parseLine(str) {
    const out = [];
    for (const t of str.trim().split(/\s+/)) {
      if (t === "-") { for (let j = out.length - 1; j >= 0; j--) if (out[j]) { out[j].len++; break; } out.push(null); }
      else if (t === ".") out.push(null);
      else { const m = midiOf(t); out.push(m == null ? null : { m, len: 1 }); }
    }
    return out;
  }
  function track(bpm, lead, roots, bassPat, drums) {
    return { bpm, lead: parseLine(lead.join(" ")), roots: roots.map(midiOf), bassPat, drums, len: lead.length * 16 };
  }
  const TRACKS = {
    sky: track(138, [
      "e5 - g5 - c6 - b5 a5 g5 - e5 - d5 e5 g5 -",
      "a5 - - g5 e5 - c5 - d5 e5 - c5 a4 - - -",
      "f5 - a5 - c6 - a5 - g5 f5 e5 - f5 - a5 -",
      "g5 - b5 - d6 - b5 g5 a5 - b5 - c6 - - -",
    ], ["c3", "a2", "f2", "g2"], "r.o.r.o.r.o.r.o.", "k.h.s.h.k.k.s.h."),
    duct: track(150, [
      "a4 . c5 . e5 . a4 . c5 e5 . a5 . g5 e5 .",
      "a4 . c5 . e5 . a5 . b5 . c6 . b5 a5 g5 e5",
      "f5 . a5 . c6 . a5 . f5 . e5 . d5 . c5 .",
      "e5 . g#5 . b5 . g#5 . e5 - - - d5 c5 b4 .",
    ], ["a2", "a2", "f2", "e2"], "rorororororororo", "k.hhs.hhk.hhs.hk"),
    storm: track(160, [
      "d5 - f5 - a5 - d6 - c6 a5 - f5 - g5 a5 -",
      "bb5 - - a5 g5 - f5 - d5 f5 - bb4 - - - -",
      "c5 - e5 - g5 - c6 - bb5 g5 - e5 - f5 g5 -",
      "a5 - c#6 - e6 - c#6 a5 e5 - a5 - c#6 - - -",
    ], ["d2", "bb1", "c2", "a1"], "r.rorr.or.rorr.o", "k.h.s.hkk.h.s.hh"),
    sunset: track(128, [
      "a5 - - c6 a5 - f5 - g5 - a5 - c6 - - -",
      "d6 - - c6 a5 - f5 - e5 - f5 - d5 - - -",
      "bb5 - - a5 g5 - f5 - d5 - f5 - g5 - - -",
      "c6 - - bb5 a5 - g5 - e5 - g5 - c6 - - -",
    ], ["f2", "d2", "bb1", "c2"], "r...o.r.r...o.r.", "k...s..hk.k.s..h"),
    boss: track(168, [
      "e5 e5 . g5 . e5 b5 . a5 g5 . e5 . d5 e5 .",
      "c6 . b5 . g5 . e5 . g5 a5 . g5 . e5 c5 .",
      "d5 d5 . f#5 . a5 d6 . c6 a5 . f#5 . a5 c6 .",
      "b5 - - - d#6 - - - f#6 - - - d#6 . b5 .",
    ], ["e2", "c2", "d2", "b1"], "rrorrrorrrorrror", "k.hsk.hsk.hsk.ss"),
  };
  const Music = (function () {
    let ac = null, out = null, timer = null, cur = null, want = null, step = 0, nextT = 0, noiseBuf = null;
    const muted = () => !!(window.HKSound && HKSound.isMuted && HKSound.isMuted());
    function ensure() {
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        try { ac = new AC(); } catch (_) { ac = null; return null; }
        out = ac.createGain(); out.gain.value = 0.55; out.connect(ac.destination);
        noiseBuf = null;
      }
      if (ac.state !== "running") ac.resume().catch(() => {});
      return ac;
    }
    function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }
    function close() {
      stopTimer();
      if (!ac) return;
      const old = ac; ac = null; out = null; noiseBuf = null; cur = null;
      try { old.close().catch(() => {}); } catch (_) { /* 이미 닫힘 */ }
    }
    function tone(type, f, t0, dur, v) {
      const o = ac.createOscillator(), gn = ac.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t0);
      gn.gain.setValueAtTime(0.0001, t0);
      gn.gain.linearRampToValueAtTime(v, t0 + 0.006);
      gn.gain.setValueAtTime(v, t0 + dur * 0.55);
      gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(gn).connect(out); o.start(t0); o.stop(t0 + dur + 0.02);
    }
    function noise(t0, dur, v, f, type) {
      if (!noiseBuf) {
        noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), gn = ac.createGain();
      s.buffer = noiseBuf; fl.type = type; fl.frequency.value = f;
      gn.gain.setValueAtTime(v, t0); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      s.connect(fl).connect(gn).connect(out); s.start(t0); s.stop(t0 + dur + 0.02);
    }
    const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
    function schedule(tr, i, t0, spb) {
      const n = tr.lead[i];
      if (n) tone("square", hz(n.m), t0, n.len * spb * 0.92, 0.032);
      const s = i % 16, bar = (i / 16) | 0, root = tr.roots[bar % tr.roots.length];
      const b = tr.bassPat[s];
      if (b === "r") tone("triangle", hz(root), t0, spb * 0.9, 0.075);
      else if (b === "o") tone("triangle", hz(root + 12), t0, spb * 0.9, 0.06);
      const d = tr.drums[s];
      if (d === "k") { const o = ac.createOscillator(), gn = ac.createGain(); o.type = "sine"; o.frequency.setValueAtTime(130, t0); o.frequency.exponentialRampToValueAtTime(40, t0 + 0.1); gn.gain.setValueAtTime(0.11, t0); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12); o.connect(gn).connect(out); o.start(t0); o.stop(t0 + 0.14); }
      else if (d === "s") noise(t0, 0.09, 0.05, 1900, "bandpass");
      else if (d === "h") noise(t0, 0.03, 0.022, 7000, "highpass");
    }
    function tick() {
      if (!ac || !cur || ac.state !== "running") return;
      const spb = 60 / cur.bpm / 4;
      if (nextT < ac.currentTime - 0.2 || nextT > ac.currentTime + 1) nextT = ac.currentTime + 0.05;
      while (nextT < ac.currentTime + 0.14) {
        try { schedule(cur, step, nextT, spb); } catch (_) { /* 소리는 부가 기능 */ }
        nextT += spb; step = (step + 1) % cur.len;
      }
    }
    function start() {
      if (!want || muted()) return;
      if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
      if (!ensure()) return;
      if (cur !== TRACKS[want]) { cur = TRACKS[want]; step = 0; nextT = ac.currentTime + 0.08; }
      if (out) { out.gain.cancelScheduledValues(ac.currentTime); out.gain.setValueAtTime(0.55, ac.currentTime); }
      if (!timer) timer = setInterval(tick, 30);
      tick();
    }
    function silence() {
      stopTimer();
      if (ac && out) { try { out.gain.setTargetAtTime(0.0001, ac.currentTime, 0.05); } catch (_) { /* 무시 */ } }
    }
    if (window.HKSound && HKSound.onChange) HKSound.onChange((m) => { if (m) silence(); else if (want && active) start(); });
    let active = false; // 판이 도는 중(일시정지 · 끝 화면이 아님)
    document.addEventListener("visibilitychange", () => { if (document.hidden) close(); });
    window.addEventListener("pagehide", close);
    return {
      play(name) { want = name; active = true; start(); },
      pause() { active = false; silence(); },
      resume() { active = true; start(); },
      stop() { want = null; active = false; cur = null; silence(); },
      get name() { return want; },
    };
  })();

  // ================= 스테이지 =================
  // terrain: [월드 x, 천장 y, 바닥 y, 경사 길이] — 천장 -8 · 바닥 224 는 '없음'
  // ev: [x, 종류, 옵션] — 날아오는 적은 x = 스크롤 위치에서 등장, 땅에 붙은 것(포탑 · 펀치 · 도장 · 문 · 팬)은 x = 월드 위치
  const ANCHORED = { turret: 1, punch: 1, hopper: 1, gate: 1, ductfan: 1 };
  const STAGES = [
    {
      name: "사무실 위 하늘", theme: "sky", music: "sky", len: 1800, speed: 34, bs: 60, hpMul: 0, fire: 1, seed: 11,
      boss: "copier", bossName: "거대 복합기", bossTip: "용지와 토너를 피해 출력구를 노려요",
      terrain: [[0, -8, 224], [760, -8, 196], [824, -8, 180], [904, -8, 200], [952, -8, 184], [1032, -8, 168], [1096, -8, 192], [1176, -8, 176], [1256, -8, 224], [1336, -8, 188], [1416, -8, 170], [1500, -8, 196], [1580, -8, 224]],
      ev: [
        [60, "form", { pat: "sine", n: 5, y: 70, amp: 18, drop: "red" }],
        [230, "form", { pat: "sine", n: 5, y: 150, amp: 18 }],
        [380, "balloon", { y: 100, item: "blue" }],
        [480, "form", { pat: "v", n: 5, y: 108 }],
        [640, "form", { pat: "line", n: 4, y: 46, shoot: 0.3 }],
        [700, "form", { pat: "line", n: 4, y: 132, shoot: 0.3 }],
        [820, "clip", { y: 60 }], [850, "clip", { y: 130 }],
        [860, "turret", { side: 1 }],
        [960, "form", { pat: "loop", n: 6, y: 70 }],
        [1064, "turret", { side: 1 }],
        [1120, "fan", { y: 70 }],
        [1230, "balloon", { y: 60, item: "green" }],
        [1300, "form", { pat: "sine", n: 5, y: 104, amp: 24, shoot: 0.25 }],
        [1456, "turret", { side: 1 }],
        [1460, "clip", { y: 40 }], [1480, "clip", { y: 96 }],
        [1560, "form", { pat: "swoop", n: 5, y: 120 }],
        [1620, "form", { pat: "swoop", n: 5, y: 90, up: true }],
        [1680, "fan", { y: 120 }],
        [1740, "balloon", { y: 90, item: "yellow" }],
      ],
    },
    {
      name: "환기 덕트 속", theme: "duct", music: "duct", len: 2000, speed: 34, bs: 66, hpMul: 0.25, fire: 1.1, seed: 22,
      boss: "robot", bossName: "덕트 청소 로봇", bossTip: "솔을 먼저 부수면 편해요 · 빨아들일 땐 왼쪽으로 버텨요",
      terrain: [[0, 24, 192], [420, 40, 176, 48], [700, 64, 152, 48], [980, 40, 176, 48], [1160, 24, 120, 64], [1360, 24, 192, 48], [1460, 100, 192, 64], [1640, 40, 176, 48], [1820, 60, 156, 48], [1960, 32, 184, 48]],
      ev: [
        [60, "form", { pat: "sine", n: 5, y: 108, amp: 30, drop: "red" }],
        [200, "form", { pat: "line", n: 4, y: 64, shoot: 0.3 }],
        [260, "form", { pat: "line", n: 4, y: 150, shoot: 0.3 }],
        [520, "turret", { side: -1 }], [560, "turret", { side: 1 }],
        [380, "balloon", { y: 108, item: "blue" }],
        [640, "ductfan", { y: 108, r: 22, w: 1.6 }],
        [520, "form", { pat: "sine", n: 5, y: 108, amp: 16 }],
        [790, "punch", { side: 1 }], [850, "punch", { side: -1 }],
        [930, "gate", { gap: 50, amp: 20, spd: 1.3 }],
        [720, "snake", { y: 140 }],
        [1070, "ductfan", { y: 108, r: 22, w: -1.4 }],
        [860, "form", { pat: "v", n: 5, y: 108, shoot: 0.3 }],
        [1240, "turret", { side: 1 }], [1300, "turret", { side: -1 }],
        [1000, "form", { pat: "line", n: 5, y: 66, shoot: 0.3 }],
        [1110, "fan", { y: 70 }],
        [1410, "ductfan", { y: 108, r: 26, w: 1.2 }],
        [1550, "punch", { side: 1 }],
        [1290, "balloon", { y: 146, item: "green" }],
        [1730, "gate", { gap: 52, amp: 26, spd: 1.7 }],
        [1400, "clip", { y: 140 }], [1430, "clip", { y: 170 }],
        [1500, "snake", { y: 108 }],
        [1890, "turret", { side: -1 }], [1940, "turret", { side: 1 }],
        [1620, "form", { pat: "loop", n: 6, y: 90 }],
        [1780, "fan", { y: 108 }],
        [1860, "clip", { y: 80 }], [1880, "clip", { y: 140 }],
        [1930, "balloon", { y: 108, item: "red" }],
      ],
    },
    {
      name: "폭풍우 치는 밤 빌딩숲", theme: "storm", music: "storm", len: 2100, speed: 34, bs: 72, hpMul: 0.5, fire: 1.2, seed: 33,
      boss: "thunder", bossName: "천둥 회의실", bossTip: "번개 줄이 깜빡이면 그 자리를 비켜요",
      terrain: [[0, -8, 200], [440, -8, 184], [520, -8, 196], [600, -8, 168], [680, -8, 188], [780, -8, 150], [860, -8, 176], [960, 44, 190], [1080, -8, 164], [1180, -8, 184], [1260, -8, 140], [1340, -8, 172], [1440, 48, 180], [1580, -8, 160], [1660, -8, 190], [1760, -8, 150], [1840, -8, 176], [1960, 52, 186], [2080, -8, 170], [2180, -8, 190], [2300, -8, 184]],
      ev: [
        [60, "form", { pat: "sine", n: 5, y: 70, amp: 20, shoot: 0.3, drop: "red" }],
        [480, "hopper", {}], [630, "hopper", {}],
        [200, "bolt", {}],
        [260, "form", { pat: "v", n: 5, y: 96 }],
        [810, "turret", { side: 1 }],
        [400, "fan", { y: 60 }],
        [480, "bolt", {}],
        [1010, "turret", { side: -1 }],
        [560, "balloon", { y: 100, item: "blue" }],
        [640, "snake", { y: 70 }],
        [1120, "hopper", {}],
        [1290, "turret", { side: 1 }],
        [860, "form", { pat: "swoop", n: 5, y: 110 }],
        [920, "form", { pat: "swoop", n: 5, y: 80, up: true }],
        [980, "bolt", {}], [1040, "bolt", {}],
        [1490, "punch", { side: -1 }],
        [1080, "clip", { y: 80 }], [1100, "clip", { y: 120 }],
        [1180, "balloon", { y: 90, item: "green" }],
        [1240, "fan", { y: 110 }],
        [1620, "hopper", {}],
        [1790, "turret", { side: 1 }],
        [1300, "bolt", {}],
        [1380, "snake", { y: 100 }],
        [1440, "form", { pat: "loop", n: 6, y: 76 }],
        [2000, "punch", { side: -1 }], [2050, "punch", { side: 1 }],
        [1580, "bolt", {}],
        [1640, "form", { pat: "sine", n: 5, y: 96, amp: 28, shoot: 0.4 }],
        [1720, "fan", { y: 70 }],
        [1780, "clip", { y: 60 }], [1800, "clip", { y: 120 }], [1820, "bolt", {}],
        [1900, "balloon", { y: 100, item: "yellow" }],
        [1960, "form", { pat: "line", n: 6, y: 80, shoot: 0.4 }],
      ],
    },
    {
      name: "노을 지는 퇴근 하늘", theme: "sunset", music: "sunset", len: 2100, speed: 36, bs: 78, hpMul: 0.6, fire: 1.3, seed: 44,
      boss: "airship", bossName: "야근 비행선", bossTip: "포탑 · 포드 · 엔진을 모두 부수면 속이 드러나요",
      terrain: [[0, -8, 224], [900, -8, 196], [980, -8, 180], [1060, -8, 200], [1180, -8, 172], [1280, -8, 224], [1480, -8, 190], [1580, -8, 176], [1680, -8, 196], [1800, -8, 224]],
      ev: [
        [60, "form", { pat: "sine", n: 6, y: 60, amp: 16, shoot: 0.4, drop: "red" }],
        [130, "form", { pat: "sine", n: 6, y: 150, amp: 16, shoot: 0.4 }],
        [260, "fan", { y: 108 }],
        [300, "clip", { y: 50 }], [320, "clip", { y: 160 }],
        [400, "snake", { y: 60 }],
        [440, "balloon", { y: 150, item: "blue" }],
        [520, "form", { pat: "v", n: 5, y: 108, shoot: 0.5 }],
        [600, "form", { pat: "loop", n: 6, y: 70 }],
        [1020, "gate", { gap: 54, amp: 30, spd: 1.5 }],
        [1120, "hopper", {}],
        [1220, "turret", { side: 1 }],
        [760, "fan", { y: 70 }],
        [820, "form", { pat: "swoop", n: 6, y: 110 }],
        [880, "form", { pat: "swoop", n: 6, y: 90, up: true }],
        [1360, "gate", { gap: 54, amp: 36, spd: 1.7 }],
        [960, "snake", { y: 140 }], [980, "clip", { y: 40 }],
        [1530, "turret", { side: 1 }], [1620, "punch", { side: 1 }], [1710, "hopper", {}],
        [1760, "gate", { gap: 52, amp: 32, spd: 2.0 }],
        [1200, "balloon", { y: 90, item: "green" }],
        [1260, "fan", { y: 60 }], [1280, "fan", { y: 150 }],
        [1400, "form", { pat: "line", n: 6, y: 56, shoot: 0.5 }],
        [1440, "form", { pat: "line", n: 6, y: 156, shoot: 0.5 }],
        [1520, "snake", { y: 100 }],
        [1600, "clip", { y: 50 }], [1615, "clip", { y: 108 }], [1630, "clip", { y: 160 }],
        [1700, "form", { pat: "loop", n: 6, y: 100 }],
        [1800, "balloon", { y: 100, item: "yellow" }],
        [1860, "fan", { y: 108 }],
        [1940, "form", { pat: "v", n: 6, y: 108, shoot: 0.5 }],
      ],
    },
  ];
  STAGES.forEach((st) => {
    st.events = st.ev.map(([x, type, opt]) => ({ type, opt, wx: x, trig: ANCHORED[type] ? x - W - 12 : x })).sort((a, b) => a.trig - b.trig);
  });

  // 적 기본값 — 체력 · 점수 · 판정(반폭)
  const ENEMY = {
    drone: { hp: 1, pts: 50, hw: 9, hh: 6 },
    clip: { hp: 1, pts: 80, hw: 9, hh: 4 },
    fan: { hp: 6, pts: 200, hw: 10, hh: 10 },
    turret: { hp: 4, pts: 150, hw: 8, hh: 6 },
    punch: { hp: 5, pts: 120, hw: 6, hh: 6 },
    snake: { hp: 14, pts: 500, hw: 8, hh: 7 },
    hopper: { hp: 3, pts: 100, hw: 7, hh: 10 },
    balloon: { hp: 3, pts: 100, hw: 9, hh: 13 },
    mini: { hp: 1, pts: 30, hw: 6, hh: 3 },
  };

  // ================= 게임 =================
  function setup(stage, ctx) {
    const isCoarse = () => window.matchMedia("(pointer: coarse)").matches;
    const A = buildArt();
    const PLANE_SVG = (c) => `<svg viewBox="0 0 16 10" width="15" height="10" aria-hidden="true"><path d="M0 0 L16 5 L0 10 L4 5 Z" fill="${c}" stroke="#0b0820" stroke-width="1"/></svg>`;
    const CLIP_SVG = `<svg viewBox="0 0 8 14" width="7" height="13" aria-hidden="true"><path d="M2 12V3a2 2 0 0 1 4 0v8a1 1 0 0 1-2 0V5" fill="none" stroke="#fcd34d" stroke-width="1.7" stroke-linecap="round"/></svg>`;
    stage.innerHTML = `
      <div class="pj">
        <div class="pj-hud">
          <div class="pj-hud__score"><small>점수</small><b data-score>00000000</b></div>
          <div class="pj-hud__stat"><small>스테이지</small><span class="pj-stage" data-stage>1</span></div>
          <div class="pj-hud__stat"><small>목숨</small><span class="pj-icons" data-lives></span></div>
          <div class="pj-hud__stat"><small>폭탄</small><span class="pj-icons" data-bombs></span></div>
          <div class="pj-hud__stat"><small>무기</small><span class="pj-icons" data-weapon></span></div>
        </div>
        <div class="pj-screen">
          <canvas class="pj-cv" aria-label="종이비행기 편대 게임 화면"></canvas>
          <canvas class="pj-ui" aria-hidden="true"></canvas>
        </div>
        <div class="pj-hint" data-hint><kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd>·<kbd>WASD</kbd> 이동 · <kbd>Z</kbd>/<kbd>J</kbd> 쏘기(꾹 눌렀다 떼면 차지) · <kbd>X</kbd>/<kbd>K</kbd> 클립 폭탄 · <kbd>Esc</kbd> 일시정지 <span class="pj-hint__items"><i style="background:#ff4848"></i>무기 <i style="background:#4a9cff"></i>종이학 <i style="background:#3cdc6a"></i>방패 <i style="background:#ffc83a"></i>폭탄</span></div>
        <div class="pj-pad">
          <div class="pj-panel" data-panel></div>
          <div class="pj-touch" data-touch hidden>
            <span class="pj-touch__hint">이 칸을 끌어도 움직여요 · 누르는 동안 자동 연사</span>
            <button type="button" class="pj-btn pj-btn--charge" data-charge tabindex="-1" aria-label="차지 샷 — 누르고 있다가 떼요"><svg class="pj-ico" viewBox="0 0 10 9" shape-rendering="crispEdges" aria-hidden="true"><rect x="0" y="1" width="1" height="1" fill="#3dffd0"/><rect x="1" y="2" width="1" height="1" fill="#3dffd0"/><rect x="2" y="3" width="1" height="1" fill="#3dffd0"/><rect x="3" y="4" width="1" height="1" fill="#3dffd0"/><rect x="2" y="5" width="1" height="1" fill="#3dffd0"/><rect x="1" y="6" width="1" height="1" fill="#3dffd0"/><rect x="0" y="7" width="1" height="1" fill="#3dffd0"/><rect x="3" y="1" width="1" height="1" fill="#3dffd0"/><rect x="4" y="2" width="1" height="1" fill="#3dffd0"/><rect x="5" y="3" width="1" height="1" fill="#3dffd0"/><rect x="6" y="4" width="1" height="1" fill="#3dffd0"/><rect x="5" y="5" width="1" height="1" fill="#3dffd0"/><rect x="4" y="6" width="1" height="1" fill="#3dffd0"/><rect x="3" y="7" width="1" height="1" fill="#3dffd0"/><rect x="6" y="1" width="1" height="1" fill="#fff6e0"/><rect x="7" y="2" width="1" height="1" fill="#fff6e0"/><rect x="8" y="3" width="1" height="1" fill="#fff6e0"/><rect x="9" y="4" width="1" height="1" fill="#fff6e0"/><rect x="8" y="5" width="1" height="1" fill="#fff6e0"/><rect x="7" y="6" width="1" height="1" fill="#fff6e0"/><rect x="6" y="7" width="1" height="1" fill="#fff6e0"/></svg><small>차지</small></button>
            <button type="button" class="pj-btn pj-btn--bomb" data-bomb tabindex="-1" aria-label="클립 폭탄"><svg class="pj-ico" viewBox="0 0 6 10" shape-rendering="crispEdges" aria-hidden="true"><rect x="1" y="0" width="1" height="1" fill="#ffd166"/><rect x="2" y="0" width="1" height="1" fill="#ffd166"/><rect x="3" y="0" width="1" height="1" fill="#ffd166"/><rect x="4" y="0" width="1" height="1" fill="#ffd166"/><rect x="0" y="1" width="1" height="1" fill="#ffd166"/><rect x="5" y="1" width="1" height="1" fill="#ffd166"/><rect x="0" y="2" width="1" height="1" fill="#ffd166"/><rect x="5" y="2" width="1" height="1" fill="#ffd166"/><rect x="0" y="3" width="1" height="1" fill="#ffd166"/><rect x="2" y="3" width="1" height="1" fill="#ffd166"/><rect x="3" y="3" width="1" height="1" fill="#ffd166"/><rect x="5" y="3" width="1" height="1" fill="#ffd166"/><rect x="0" y="4" width="1" height="1" fill="#ffd166"/><rect x="2" y="4" width="1" height="1" fill="#ffd166"/><rect x="5" y="4" width="1" height="1" fill="#ffd166"/><rect x="0" y="5" width="1" height="1" fill="#ffd166"/><rect x="2" y="5" width="1" height="1" fill="#ffd166"/><rect x="5" y="5" width="1" height="1" fill="#ffd166"/><rect x="0" y="6" width="1" height="1" fill="#ffd166"/><rect x="2" y="6" width="1" height="1" fill="#ffd166"/><rect x="5" y="6" width="1" height="1" fill="#ffd166"/><rect x="0" y="7" width="1" height="1" fill="#ffd166"/><rect x="2" y="7" width="1" height="1" fill="#ffd166"/><rect x="5" y="7" width="1" height="1" fill="#ffd166"/><rect x="0" y="8" width="1" height="1" fill="#ffd166"/><rect x="5" y="8" width="1" height="1" fill="#ffd166"/><rect x="1" y="9" width="1" height="1" fill="#ffd166"/><rect x="2" y="9" width="1" height="1" fill="#ffd166"/><rect x="3" y="9" width="1" height="1" fill="#ffd166"/><rect x="4" y="9" width="1" height="1" fill="#ffd166"/></svg><small>폭탄</small><em data-bombn>0</em></button>
          </div>
        </div>
      </div>`;
    const root = stage.querySelector(".pj");
    const hudEl = stage.querySelector(".pj-hud");
    const screenEl = stage.querySelector(".pj-screen");
    const hintEl = stage.querySelector("[data-hint]");
    const padEl = stage.querySelector(".pj-pad");
    // 가로로 긴 화면이라 공통 창(세로 비율)을 이 게임만 가운데 영역 가득 넓힌다 (비타민 특공대와 같은 방식)
    const frameEl = stage.parentElement;
    if (frameEl && frameEl.classList) frameEl.classList.add("pj-wide");
    const cv = stage.querySelector(".pj-cv");
    const uiCv = stage.querySelector(".pj-ui");
    const panel = stage.querySelector("[data-panel]");
    const touch = stage.querySelector("[data-touch]");
    const btnBomb = stage.querySelector("[data-bomb]");
    const btnCharge = stage.querySelector("[data-charge]");
    const elBombN = stage.querySelector("[data-bombn]");
    const elScore = stage.querySelector("[data-score]");
    const elStage = stage.querySelector("[data-stage]");
    const elLives = stage.querySelector("[data-lives]");
    const elBombs = stage.querySelector("[data-bombs]");
    const elWeapon = stage.querySelector("[data-weapon]");
    cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    g.imageSmoothingEnabled = false;
    const u = uiCv.getContext("2d");

    // ---------- 화면 크기 ----------
    let cssW = W, uiScale = 1, uiDpr = 1, txtK = 1;
    // 화면 배치 — pc: 캔버스를 최대로 키우고 메뉴는 게임 화면 위에 · below: 휴대폰 세로(위 게임 · 아래 조작 칸) · over: 휴대폰 가로(조작 단추를 화면 위에)
    let mode = "pc";
    function placeMode() {
      root.dataset.mode = mode;
      const inScreen = mode !== "below";
      if (inScreen && panel.parentElement !== screenEl) screenEl.appendChild(panel);
      if (!inScreen && panel.parentElement !== padEl) padEl.insertBefore(panel, padEl.firstChild);
      if (mode === "over" && touch.parentElement !== screenEl) screenEl.insertBefore(touch, panel);
      if (mode !== "over" && touch.parentElement !== padEl) padEl.appendChild(touch);
      if (state === "play") playPanel();
    }
    function fit() {
      const cs = getComputedStyle(stage);
      const sw = Math.max(240, stage.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0));
      let sh = stage.clientHeight - parseFloat(cs.paddingTop || 0) - parseFloat(cs.paddingBottom || 0);
      if (!(sh > 240)) sh = Math.max(380, window.innerHeight - 140);
      const hudH = hudEl.offsetHeight || 42;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      let cw, next;
      if (!isCoarse()) {
        next = "pc";
        const hintH = (hintEl.offsetHeight || 22) + 8;
        cw = Math.min(sw, ((sh - hudH - hintH) * W) / H);
      } else {
        const below = Math.min(sw, ((sh - hudH - 150) * W) / H);
        if (below >= sw * 0.9) { next = "below"; cw = below; }
        else { next = "over"; cw = Math.min(sw, ((sh - hudH) * W) / H); }
      }
      cw = Math.max(Math.min(240, sw), cw);
      // 기기 픽셀로 정수배가 되면 도트가 고르게 — PC는 정수배가 0.8 이상 차지하면 정수배로, 고해상도 휴대폰은 점이 작아 거의 손해가 없을 때만
      const k = (cw * dpr) / W, ki = Math.floor(k);
      if (ki >= 2 && ki / k >= (dpr >= 2 ? 0.95 : 0.8)) cw = (ki * W) / dpr;
      const ch = (cw * H) / W;
      cssW = cw;
      if (next !== mode || root.dataset.mode !== next) { mode = next; placeMode(); }
      root.style.width = `${cw}px`;
      root.style.height = mode === "below" ? `${Math.floor(sh)}px` : "";
      screenEl.style.width = `${cw}px`; screenEl.style.height = `${ch}px`;
      cv.style.width = `${cw}px`; cv.style.height = `${ch}px`;
      uiCv.width = Math.round(cw * dpr); uiCv.height = Math.round(ch * dpr);
      uiCv.style.width = `${cw}px`; uiCv.style.height = `${ch}px`;
      uiScale = uiCv.width / W; uiDpr = dpr;
      txtK = clamp(cw / 420, 0.92, 1.45);
      fontUnit = Math.max(1, Math.round(dpr * clamp(cw / 400, 0.95, 1.6)));
      render();
    }

    // ---------- 상태 ----------
    let state = "title"; // title | play | paused | over
    let S = null;
    let shipSel = 0;
    try { shipSel = clamp(parseInt(localStorage.getItem("hk-paperjet-ship") || "0", 10) || 0, 0, 2); } catch (_) { /* 기억 못 해도 됨 */ }
    let ST = STAGES[0], BG = null, TER = null;
    const keys = { l: false, r: false, u: false, d: false, fire: false };
    let touchFire = false, chargeBtn = false, dragDX = 0, dragDY = 0;
    const TEST = !!window.__PJ_TEST__;
    let god = false;

    // 오브젝트 풀 — 만들어 둔 것을 다시 쓴다
    const pool = (n) => Array.from({ length: n }, () => ({ on: false }));
    function take(arr) { for (let i = 0; i < arr.length; i++) if (!arr[i].on) { arr[i].on = true; return arr[i]; } return null; }
    const EN = pool(64), ES = pool(200), PS = pool(110), PT = pool(460), IT = pool(10), HZ = pool(16), POP = pool(28), RAIN = pool(70);
    const clearPool = (arr) => { for (const o of arr) o.on = false; };

    function sfx(name, gap, arg) {
      if (S && gap) {
        const k = "_s_" + name;
        if (S[k] != null && S.t - S[k] < gap) return;
        S[k] = S.t;
      }
      ctx.sfx(name, arg);
    }

    // ---------- 지형 ----------
    function buildTerrain(st) {
      const len = st.len + W + 200, cols = Math.ceil(len / 8) + 1;
      const ceil = new Int16Array(cols), floor = new Int16Array(cols);
      const sg = st.terrain;
      for (let c = 0; c < cols; c++) {
        const x = c * 8;
        let i = 0;
        while (i + 1 < sg.length && sg[i + 1][0] <= x) i++;
        const s = sg[i];
        let cy = s[1], fy = s[2];
        const ramp = s[3] || 0;
        if (ramp && i > 0 && x < s[0] + ramp) {
          const p = sg[i - 1], k = (x - s[0] + 8) / (ramp + 8);
          cy = Math.round((p[1] + (s[1] - p[1]) * k) / 4) * 4;
          fy = Math.round((p[2] + (s[2] - p[2]) * k) / 4) * 4;
        }
        ceil[c] = cy; floor[c] = fy;
      }
      const tc = mkCanvas(cols * 8, H), tg = tc.getContext("2d");
      srand(st.seed * 7919);
      const lamps = [];
      paintTerrain(tg, st.theme, ceil, floor, cols, lamps);
      return { ceil, floor, cv: tc, cols, lamps };
    }
    const colOf = (wx) => clamp(Math.floor(wx / 8), 0, TER.cols - 1);
    const ceilAt = (wx) => TER.ceil[colOf(wx)];
    const floorAt = (wx) => TER.floor[colOf(wx)];
    function solidAt(sx, sy) {
      const wx = S.scroll + sx, c = colOf(wx);
      return sy < TER.ceil[c] || sy > TER.floor[c];
    }
    function runs(arr, cols, skip) {
      const out = [];
      let s = 0;
      for (let c = 1; c <= cols; c++) if (c === cols || arr[c] !== arr[s]) { if (!skip(arr[s])) out.push([s * 8, c * 8, arr[s]]); s = c; }
      return out;
    }
    function bakeGlow(c, x, y, r, color, a) {
      c.save(); c.globalCompositeOperation = "lighter"; c.globalAlpha = a; c.drawImage(glowSpr(color, r), Math.round(x - r), Math.round(y - r)); c.restore();
    }
    function windows(tg, x0, x1, top, bot, glass, glassHi, warm, warmP, glowA, stepX, stepY) {
      for (let y = top; y < bot - 3; y += stepY) for (let x = x0; x < x1 - 3; x += stepX) {
        if (sr() < warmP) { tg.fillStyle = warm; tg.fillRect(x, y, 3, 3); if (glowA) bakeGlow(tg, x + 1.5, y + 1.5, 5, warm, glowA); }
        else { tg.fillStyle = glass; tg.fillRect(x, y, 3, 3); if (glassHi) { tg.fillStyle = glassHi; tg.fillRect(x, y, 3, 1); } }
      }
    }
    // 건물(바닥) · 매달린 구조물(천장)
    function paintBuilding(tg, x0, x1, top, theme, down, lamps) {
      const w = x1 - x0;
      if (theme === "sky") {
        const P = PAL.sky, b = P.bld;
        if (down) return;
        tg.fillStyle = b[2]; tg.fillRect(x0, top, w, H - top);
        tg.fillStyle = b[3]; tg.fillRect(x0, top, 3, H - top);
        tg.fillStyle = b[1]; tg.fillRect(x1 - 2, top, 2, H - top);
        tg.fillStyle = b[4]; tg.fillRect(x0, top, w, 1);
        tg.fillStyle = b[3]; tg.fillRect(x0, top + 1, w, 2);
        tg.fillStyle = b[1]; tg.fillRect(x0, top + 3, w, 1);
        windows(tg, x0 + 5, x1 - 3, top + 7, H, P.win[0], P.win[1], P.win[2], 0.14, 0.3, 6, 7);
        for (let y = top + 40; y < H; y += 2) { tg.fillStyle = rgba(b[0], Math.min(0.35, (y - top - 40) / 300)); tg.fillRect(x0, y, w, 2); }
        if (w >= 30) {
          const r = sr();
          if (r < 0.34) { // 옥상 정원
            for (let x = x0 + 4; x < x1 - 6; x += 7) { const s = 3 + (sr() * 2 | 0); discG(tg, x + 3, top - s + 1, s, P.green[1]); tg.fillStyle = P.green[2]; tg.fillRect(x + 1, top - s, 3, 2); tg.fillStyle = P.green[3]; tg.fillRect(x + 1, top - s, 1, 1); }
          } else if (r < 0.62) { // 실외기
            for (let x = x0 + 5; x < x1 - 14; x += 16) { tg.fillStyle = RAMP.steel[1]; tg.fillRect(x, top - 7, 12, 7); tg.fillStyle = RAMP.steel[3]; tg.fillRect(x, top - 7, 12, 1); tg.fillStyle = RAMP.steel[0]; discG(tg, x + 4, top - 3, 2, RAMP.steel[0]); }
          } else if (r < 0.82) { // 물탱크
            const tx = x0 + Math.round(w * 0.6);
            tg.fillStyle = RAMP.steel[1]; tg.fillRect(tx, top - 4, 2, 4); tg.fillRect(tx + 9, top - 4, 2, 4);
            tg.fillStyle = RAMP.steel[2]; tg.fillRect(tx - 1, top - 14, 13, 10); tg.fillStyle = RAMP.steel[3]; tg.fillRect(tx - 1, top - 14, 3, 10); tg.fillStyle = RAMP.steel[4]; tg.fillRect(tx - 1, top - 14, 13, 1);
          }
          tg.fillStyle = b[4]; for (let x = x0 + 2; x < x1 - 2; x += 3) tg.fillRect(x, top - 3, 1, 3);
          tg.fillStyle = b[3]; tg.fillRect(x0 + 1, top - 3, w - 2, 1);
        }
      } else if (theme === "storm") {
        const P = PAL.storm, b = P.bld;
        if (!down) {
          tg.fillStyle = b[1]; tg.fillRect(x0, top, w, H - top);
          tg.fillStyle = b[2]; tg.fillRect(x0, top, 2, H - top);
          tg.fillStyle = b[0]; tg.fillRect(x1 - 2, top, 2, H - top);
          tg.fillStyle = b[4]; tg.fillRect(x0, top, w, 1);
          tg.fillStyle = b[3]; tg.fillRect(x0, top + 1, w, 1);
          windows(tg, x0 + 5, x1 - 3, top + 7, H, b[2], null, P.win, 0.26, 0.45, 6, 7);
          if (w >= 30) {
            const r = sr();
            if (r < 0.4) { const ax = x0 + Math.round(w * 0.7); tg.fillStyle = b[2]; tg.fillRect(ax, top - 16, 1, 16); tg.fillRect(ax - 3, top - 10, 7, 1); lamps.push([ax, top - 17, "#ff4f6a"]); }
            else if (r < 0.75) { // 옥상 네온 간판
              const sx = x0 + 6, sw = Math.min(40, w - 12), nc = sr() < 0.5 ? P.neon : P.neon2;
              tg.fillStyle = b[0]; tg.fillRect(sx + 3, top - 4, 1, 4); tg.fillRect(sx + sw - 4, top - 4, 1, 4);
              tg.fillStyle = b[0]; tg.fillRect(sx, top - 15, sw, 11);
              tg.fillStyle = nc; tg.fillRect(sx, top - 15, sw, 1); tg.fillRect(sx, top - 5, sw, 1); tg.fillRect(sx, top - 15, 1, 11); tg.fillRect(sx + sw - 1, top - 15, 1, 11);
              for (let x = sx + 4; x < sx + sw - 5; x += 6) tg.fillRect(x, top - 12, 4, 5);
              bakeGlow(tg, sx + sw / 2, top - 10, 22, nc, 0.55);
            }
          }
        } else {
          tg.fillStyle = b[2]; tg.fillRect(x0, 0, w, top);
          tg.fillStyle = b[4]; tg.fillRect(x0, top - 1, w, 1);
          tg.fillStyle = b[1];
          for (let x = x0; x < x1; x += 12) for (let i = 0; i < Math.min(12, top - 2); i++) { tg.fillRect(x + i, top - 3 - i, 1, 1); tg.fillRect(x + 11 - i, top - 3 - i, 1, 1); }
          if (w >= 64) {
            const bx = x0 + Math.round(w * 0.25), bw = Math.min(56, w - 24);
            tg.fillStyle = b[0]; tg.fillRect(bx + 6, top, 1, 4); tg.fillRect(bx + bw - 7, top, 1, 4); tg.fillRect(bx, top + 4, bw, 14);
            tg.fillStyle = P.neon; tg.fillRect(bx, top + 4, bw, 1); tg.fillRect(bx, top + 17, bw, 1);
            tg.fillStyle = P.neon2; for (let x = bx + 4; x < bx + bw - 5; x += 7) tg.fillRect(x, top + 8, 5, 6);
            bakeGlow(tg, bx + bw / 2, top + 11, 26, P.neon, 0.5);
          }
        }
      } else if (theme === "sunset") {
        const P = PAL.sunset, b = P.bld;
        if (down) return;
        tg.fillStyle = b[1]; tg.fillRect(x0, top, w, H - top);
        tg.fillStyle = b[2]; tg.fillRect(x0, top, 2, H - top);
        tg.fillStyle = P.rim; tg.fillRect(x1 - 1, top, 1, H - top);
        tg.fillStyle = "#ffb26b"; tg.fillRect(x0, top, w, 1);
        tg.fillStyle = b[3]; tg.fillRect(x0, top + 1, w, 1);
        windows(tg, x0 + 5, x1 - 3, top + 7, H, b[2], null, P.win, 0.34, 0.4, 6, 7);
        if (w >= 30 && sr() < 0.5) { const ax = x0 + Math.round(w * 0.3); tg.fillStyle = b[0]; tg.fillRect(ax, top - 12, 1, 12); lamps.push([ax, top - 13, "#ff4f6a"]); }
      }
    }
    function paintMetal(tg, x0, x1, edgeY, down) {
      const M = PAL.duct.metal;
      const y0 = down ? 0 : edgeY, y1 = down ? edgeY : H;
      for (let y = y0; y < y1; y++) {
        const d = down ? edgeY - y : y - edgeY;
        tg.fillStyle = d < 10 ? M[3] : d < 24 ? ((x0 + y) % 2 && d < 12 ? M[3] : M[2]) : M[1];
        tg.fillRect(x0, y, x1 - x0, 1);
      }
      tg.fillStyle = M[1];
      for (let x = Math.ceil(x0 / 32) * 32; x < x1; x += 32) tg.fillRect(x, y0, 1, y1 - y0);
      tg.fillStyle = M[4];
      for (let x = Math.ceil(x0 / 32) * 32 + 1; x < x1; x += 32) tg.fillRect(x, y0, 1, y1 - y0);
      if (down) { tg.fillStyle = M[5]; tg.fillRect(x0, edgeY - 2, x1 - x0, 1); tg.fillStyle = M[4]; tg.fillRect(x0, edgeY - 3, x1 - x0, 1); tg.fillStyle = M[0]; tg.fillRect(x0, edgeY - 1, x1 - x0, 1); }
      else { tg.fillStyle = M[5]; tg.fillRect(x0, edgeY, x1 - x0, 1); tg.fillStyle = M[4]; tg.fillRect(x0, edgeY + 1, x1 - x0, 1); tg.fillStyle = M[0]; tg.fillRect(x0, edgeY + 3, x1 - x0, 1); }
      const ry = down ? edgeY - 7 : edgeY + 6;
      for (let x = Math.ceil(x0 / 16) * 16 + 4; x < x1; x += 16) { tg.fillStyle = M[5]; tg.fillRect(x, ry, 1, 1); tg.fillStyle = M[1]; tg.fillRect(x + 1, ry + 1, 1, 1); }
    }
    function paintTerrain(tg, theme, ceil, floor, cols, lamps) {
      if (theme === "duct") {
        const P = PAL.duct;
        for (let c = 0; c < cols; c++) {
          if (floor[c] < H) paintMetal(tg, c * 8, c * 8 + 8, floor[c], false);
          if (ceil[c] > 0) paintMetal(tg, c * 8, c * 8 + 8, ceil[c], true);
        }
        // 통풍구(청록 빛) · 경고등
        for (let c = 4; c < cols - 4; c += 12 + (sr() * 6 | 0)) {
          const x = c * 8;
          if (floor[c] < H - 20 && floor[c] === floor[c + 2]) { const y = floor[c] + 9; tg.fillStyle = P.metal[0]; tg.fillRect(x, y, 16, 7); tg.fillStyle = P.cyan; for (let i = 0; i < 3; i++) tg.fillRect(x + 2, y + 1 + i * 2, 12, 1); bakeGlow(tg, x + 8, y + 3, 14, P.cyan, 0.4); }
          if (ceil[c] > 20 && ceil[c] === ceil[c + 1] && sr() < 0.6) lamps.push([x + 4, ceil[c] - 6, P.hot]);
        }
        for (let c = 1; c < cols; c++) {
          if (floor[c] < floor[c - 1] - 10) for (let y = floor[c] + 2; y < Math.min(H, floor[c - 1]); y += 4) { tg.fillStyle = ((y >> 2) % 2) ? P.warn : P.metal[0]; tg.fillRect(c * 8, y, 3, 4); }
          if (floor[c] > floor[c - 1] + 10) for (let y = floor[c - 1] + 2; y < Math.min(H, floor[c]); y += 4) { tg.fillStyle = ((y >> 2) % 2) ? P.warn : P.metal[0]; tg.fillRect(c * 8 - 3, y, 3, 4); }
          if (ceil[c] > ceil[c - 1] + 10) for (let y = Math.max(0, ceil[c - 1]); y < ceil[c] - 2; y += 4) { tg.fillStyle = ((y >> 2) % 2) ? P.warn : P.metal[0]; tg.fillRect(c * 8, y, 3, 4); }
          if (ceil[c] < ceil[c - 1] - 10) for (let y = Math.max(0, ceil[c]); y < ceil[c - 1] - 2; y += 4) { tg.fillStyle = ((y >> 2) % 2) ? P.warn : P.metal[0]; tg.fillRect(c * 8 - 3, y, 3, 4); }
        }
        return;
      }
      for (const [x0, x1, top] of runs(floor, cols, (v) => v >= H)) paintBuilding(tg, x0, x1, top, theme, false, lamps);
      for (const [x0, x1, bot] of runs(ceil, cols, (v) => v <= 0)) paintBuilding(tg, x0, x1, bot, theme, true, lamps);
    }

    // ---------- 배경 (5~6겹 시차 스크롤 + 대기 원근 + 앞쪽 가림막) ----------
    function discG(c, cx, cy, r, col) {
      c.fillStyle = col;
      cx = Math.round(cx); cy = Math.round(cy); r = Math.max(1, Math.round(r));
      for (let dy = -r; dy <= r; dy++) { const w = Math.round(Math.sqrt(r * r - dy * dy)); c.fillRect(cx - w, cy + dy, w * 2 + 1, 1); }
    }
    function bandsG(c, cols, y0, y1, w) {
      const n = cols.length, h = (y1 - y0) / n;
      for (let i = 0; i < n; i++) { c.fillStyle = cols[i]; c.fillRect(0, Math.round(y0 + i * h), w, Math.ceil(h) + 1); }
      for (let i = 1; i < n; i++) {
        const y = Math.round(y0 + i * h);
        for (let k = 0; k < 3; k++) {
          c.fillStyle = k < 2 ? cols[i] : cols[i - 1];
          const yy = y - 2 + k, step = k === 1 ? 2 : 4;
          for (let x = (yy & 1) * (k === 1 ? 1 : 2); x < w; x += step) c.fillRect(x, yy, 1, 1);
        }
      }
    }
    function layer(f, painter) { const c = mkCanvas(LW, H), lg = c.getContext("2d"); painter(lg); return { c, f }; }
    const wrapX = (fn, x, w) => { fn(x); if (x + w > LW) fn(x - LW); if (x < 0) fn(x + LW); };
    function cloud(lg, x, y, s, col, lit, shade) {
      wrapX((xx) => {
        const parts = [[0, 0, 1], [1.05, 0.25, 0.75], [-1.05, 0.3, 0.7], [0.45, -0.5, 0.72], [-0.5, -0.25, 0.6], [1.7, 0.45, 0.5], [-1.7, 0.5, 0.45]];
        for (const [dx, dy, k] of parts) discG(lg, xx + dx * s, y + dy * s, s * k, shade);
        for (const [dx, dy, k] of parts) discG(lg, xx + dx * s - 1, y + dy * s - 2, s * k - 1, col);
        for (const [dx, dy, k] of parts.slice(0, 5)) discG(lg, xx + dx * s - s * 0.25, y + dy * s - s * 0.35, Math.max(1, s * k * 0.45), lit);
        lg.fillStyle = shade; lg.fillRect(Math.round(xx - s * 2.1), Math.round(y + s * 0.62), Math.round(s * 4.2), 2);
      }, x - s * 2.4, s * 4.8);
    }
    function skyline(lg, base, minH, maxH, minW, maxW, body, lit, dark, win, winP, glowA, extra) {
      let x = 0;
      while (x < LW) {
        const w = Math.round(srr(minW, maxW)), h = Math.round(srr(minH, maxH)), top = base - h;
        wrapX((xx) => {
          lg.fillStyle = body; lg.fillRect(xx, top, w, H - top);
          if (lit) { lg.fillStyle = lit; lg.fillRect(xx, top, 2, H - top); lg.fillRect(xx, top, w, 1); }
          if (dark) { lg.fillStyle = dark; lg.fillRect(xx + w - 1, top, 1, H - top); }
          if (win) for (let y = top + 4; y < H - 2; y += 5) for (let wx = xx + 3; wx < xx + w - 3; wx += 4) if (sr() < winP) { lg.fillStyle = win; lg.fillRect(wx, y, 2, 2); if (glowA) bakeGlow(lg, wx + 1, y + 1, 4, win, glowA); }
          if (extra) extra(lg, xx, top, w);
        }, x, w);
        x += w + Math.round(srr(0, 5));
      }
    }
    function wires(lg, y0, sag, col, poleEvery) {
      for (let x = 0; x < LW; x += poleEvery) {
        lg.fillStyle = col; lg.fillRect(x, y0 - 6, 3, H - y0 + 6); lg.fillRect(x - 6, y0 - 4, 15, 2);
        for (const off of [-4, 4]) for (let i = 0; i <= poleEvery; i++) { const t = i / poleEvery, y = y0 + off * 0.3 + Math.sin(t * Math.PI) * sag; lg.fillRect((x + i) % LW, Math.round(y - 4), 1, 1); }
      }
    }
    function gradeCanvas(P) {
      const c = mkCanvas(W, H), cg = c.getContext("2d");
      const gr = cg.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62);
      gr.addColorStop(0, rgba(P.vig, 0)); gr.addColorStop(1, rgba(P.vig, P.vigA));
      cg.fillStyle = gr; cg.fillRect(0, 0, W, H);
      cg.fillStyle = "rgba(10,6,24,.05)";
      for (let y = 0; y < H; y += 2) cg.fillRect(0, y, W, 1);
      return c;
    }
    function buildBG(theme) {
      srand(theme.length * 977 + theme.charCodeAt(0) * 31);
      const sky = mkCanvas(W, H), sg = sky.getContext("2d");
      const layers = [], dyn = { blinks: [], fans: [], track: 0 };
      let fg = null, lit = null;
      if (theme === "sky") {
        const P = PAL.sky;
        bandsG(sg, P.sky, 0, H, W);
        bakeGlow(sg, 40, 8, 90, CREAM, 0.35);
        const far = (c, k) => mix(c, P.sky[5], k);
        layers.push(layer(0.03, (lg) => { for (let i = 0; i < 5; i++) cloud(lg, srr(0, LW), srr(56, 100), Math.round(srr(13, 20)), far(P.cloud[2], 0.35), far(CREAM, 0.3), far(P.cloud[1], 0.45)); }));
        layers.push(layer(0.08, (lg) => skyline(lg, H, 18, 46, 14, 30, far(P.bld[2], 0.78), far(P.bld[3], 0.75), null, null, 0)));
        layers.push(layer(0.18, (lg) => skyline(lg, H, 36, 92, 16, 32, far(P.bld[2], 0.55), far(P.bld[4], 0.5), far(P.bld[1], 0.55), far(P.win[1], 0.4), 0.45, 0, (c, x, top, w) => { if (sr() < 0.3) { c.fillStyle = far(P.bld[1], 0.5); c.fillRect(x + (w >> 1), top - 10, 1, 10); dyn.blinks.push([x + (w >> 1), top - 11, 0.18, "#ff4f6a"]); } })));
        layers.push(layer(0.36, (lg) => skyline(lg, H, 24, 70, 22, 46, far(P.bld[2], 0.25), far(P.bld[3], 0.2), far(P.bld[1], 0.25), far(P.win[0], 0.15), 0.4, 0, (c, x, top, w) => { c.fillStyle = far(P.win[1], 0.2); for (let y = top + 4; y < H; y += 5) c.fillRect(x + 3, y, w - 6, 1); })));
        layers.push(layer(0.62, (lg) => { for (let i = 0; i < 4; i++) cloud(lg, srr(0, LW), srr(14, 54), Math.round(srr(6, 9)), P.cloud[2], CREAM, P.cloud[1]); }));
        fg = layer(1.35, (lg) => { for (let i = 0; i < 3; i++) { const x = srr(0, LW), y = srr(10, 200), w = srr(50, 110); wrapX((xx) => { lg.fillStyle = "rgba(255,246,224,.42)"; lg.fillRect(Math.round(xx), Math.round(y), Math.round(w), 2); lg.fillStyle = "rgba(255,246,224,.22)"; lg.fillRect(Math.round(xx + 8), Math.round(y - 1), Math.round(w * 0.6), 1); }, x, w); } });
      } else if (theme === "duct") {
        const P = PAL.duct, M = P.metal;
        bandsG(sg, [P.bg[0], P.bg[1], P.bg[2], P.bg[3], P.bg[4], P.bg[3], P.bg[2], P.bg[1]], 0, H, W);
        layers.push(layer(0.06, (lg) => { for (let x = 0; x < LW; x += 48) { lg.fillStyle = P.bg[3]; lg.fillRect(x, 0, 2, H); lg.fillStyle = P.bg[1]; lg.fillRect(x + 2, 0, 1, H); } lg.fillStyle = P.bg[4]; lg.fillRect(0, 70, LW, 1); lg.fillRect(0, 146, LW, 1); }));
        layers.push(layer(0.2, (lg) => {
          for (const [py, th] of [[52, 10], [160, 8]]) {
            lg.fillStyle = M[1]; lg.fillRect(0, py, LW, th); lg.fillStyle = M[2]; lg.fillRect(0, py, LW, 3); lg.fillStyle = M[3]; lg.fillRect(0, py, LW, 1); lg.fillStyle = M[0]; lg.fillRect(0, py + th - 1, LW, 1);
            for (let x = 20; x < LW; x += 96) { lg.fillStyle = M[2]; lg.fillRect(x, py - 2, 6, th + 4); lg.fillStyle = M[3]; lg.fillRect(x, py - 2, 1, th + 4); }
          }
          for (let x = 60; x < LW; x += 190) { lg.fillStyle = M[1]; lg.fillRect(x, 0, 7, H); lg.fillStyle = M[2]; lg.fillRect(x, 0, 2, H); discG(lg, x + 3, 108, 6, P.hot); discG(lg, x + 3, 108, 3, M[1]); }
          for (let x = 140; x < LW; x += 256) { lg.fillStyle = P.warn; lg.fillRect(x, 84, 22, 12); lg.fillStyle = M[0]; for (let i = 0; i < 22; i += 6) lg.fillRect(x + i, 84, 3, 12); }
        }));
        layers.push(layer(0.4, (lg) => {
          for (let i = 0; i < 3; i++) { const x = 60 + i * 256, y = 108; discG(lg, x, y, 30, M[0]); discG(lg, x, y, 27, P.bg[1]); for (let a = 0; a < 24; a++) { const an = (a / 24) * TAU; lg.fillStyle = M[2]; lg.fillRect(Math.round(x + Math.cos(an) * 28), Math.round(y + Math.sin(an) * 28), 1, 1); } dyn.fans.push([x, y, 24, 0.4]); }
          for (let i = 0; i < 5; i++) {
            const x = Math.round(srr(0, LW - 30));
            lg.fillStyle = rgba(P.cyan, 0.06); for (let y = 0; y < H; y++) lg.fillRect(Math.round(x + y * 0.3), y, 16, 1);
            lg.fillStyle = M[0]; lg.fillRect(x, 20, 22, 9); lg.fillStyle = P.cyan; for (let k = 0; k < 3; k++) lg.fillRect(x + 2, 21 + k * 3, 18, 1);
            bakeGlow(lg, x + 11, 25, 18, P.cyan, 0.45);
          }
        }));
        layers.push(layer(0.66, (lg) => {
          for (let x = 0; x < LW; x += 150) { const sag = srr(10, 24); for (let i = 0; i < 150; i++) { const t = i / 150; lg.fillStyle = M[0]; lg.fillRect(x + i, Math.round(30 + Math.sin(t * Math.PI) * sag), 1, 2); } discG(lg, x + 75, Math.round(30 + sag + 4), 2, P.hot); bakeGlow(lg, x + 75, 34 + sag, 10, P.hot, 0.5); }
        }));
        fg = layer(1.32, (lg) => { for (let x = 120; x < LW; x += 380) { lg.fillStyle = rgba(P.fg, 0.9); lg.fillRect(x, 0, 10, H); lg.fillStyle = rgba(M[2], 0.55); lg.fillRect(x, 0, 1, H); for (let y = 10; y < H; y += 24) { lg.fillStyle = rgba(M[3], 0.6); lg.fillRect(x + 4, y, 2, 2); } } });
      } else if (theme === "storm") {
        const P = PAL.storm, b = P.bld;
        bandsG(sg, P.sky, 0, H, W);
        const cloudL = (litOn) => layer(0.03, (lg) => { srand(91); for (let i = 0; i < 10; i++) cloud(lg, srr(0, LW), srr(2, 46), Math.round(srr(12, 20)), litOn ? P.cloud[3] : P.cloud[1], litOn ? P.cloud[4] : P.cloud[2], litOn ? P.cloud[2] : P.cloud[0]); });
        layers.push(cloudL(false));
        lit = cloudL(true);
        srand(1234);
        layers.push(layer(0.1, (lg) => skyline(lg, H, 50, 120, 14, 28, mix(b[3], P.sky[4], 0.55), mix(b[4], P.sky[4], 0.5), null, mix(P.win, P.sky[4], 0.6), 0.12, 0)));
        layers.push(layer(0.22, (lg) => skyline(lg, H, 40, 104, 18, 36, b[2], b[3], b[1], P.win, 0.16, 0.25, (c, x, top, w) => { if (sr() < 0.35) { c.fillStyle = b[1]; c.fillRect(x + (w >> 1), top - 12, 1, 12); dyn.blinks.push([x + (w >> 1), top - 13, 0.22, "#ff4f6a"]); } else if (sr() < 0.3) { const nc = sr() < 0.5 ? P.neon : P.neon2; c.fillStyle = nc; c.fillRect(x + 3, top + 6, w - 6, 1); c.fillRect(x + 3, top + 12, w - 6, 1); bakeGlow(c, x + w / 2, top + 9, 16, nc, 0.45); } })));
        layers.push(layer(0.45, (lg) => skyline(lg, H, 24, 72, 24, 46, b[1], b[2], b[0], P.win, 0.12, 0.3)));
        fg = layer(1.4, (lg) => wires(lg, 34, 18, rgba(P.fg, 0.92), 384));
      } else {
        const P = PAL.sunset, b = P.bld;
        bandsG(sg, P.sky, 0, 166, W);
        sg.fillStyle = P.sky[8]; sg.fillRect(0, 166, W, H - 166);
        bakeGlow(sg, 290, 150, 120, "#ff7f50", 0.45);
        bakeGlow(sg, 290, 150, 60, "#ffe0a3", 0.5);
        discG(sg, 290, 150, 30, P.sun[0]); discG(sg, 290, 147, 26, P.sun[1]); discG(sg, 288, 143, 18, P.sun[2]);
        for (let i = 0; i < 6; i++) { sg.fillStyle = i % 2 ? P.sky[6] : P.sky[5]; sg.fillRect(254, 152 + i * 4, 72, 1 + (i >> 1)); }
        layers.push(layer(0.03, (lg) => { for (let i = 0; i < 12; i++) { const x = srr(0, LW), y = srr(18, 120), w = srr(40, 110); wrapX((xx) => { lg.fillStyle = P.sky[3]; lg.fillRect(Math.round(xx), Math.round(y), Math.round(w), 4); lg.fillStyle = P.sky[6]; lg.fillRect(Math.round(xx + 3), Math.round(y + 3), Math.round(w - 8), 1); lg.fillStyle = P.sky[7]; lg.fillRect(Math.round(xx + 10), Math.round(y + 4), Math.round(w * 0.5), 1); }, x, w); } }));
        layers.push(layer(0.08, (lg) => { let y = 156; for (let x = 0; x < LW; x += 3) { y = clamp(y + Math.round(srr(-3, 3)), 132, 172); lg.fillStyle = mix(P.far, P.sky[6], 0.45); lg.fillRect(x, y, 3, H - y); } }));
        layers.push(layer(0.18, (lg) => skyline(lg, H, 30, 84, 16, 32, mix(b[3], P.sky[5], 0.35), mix(P.rim, P.sky[5], 0.4), null, mix(P.win, P.sky[6], 0.3), 0.18, 0)));
        layers.push(layer(0.4, (lg) => {
          skyline(lg, H, 20, 60, 20, 44, b[2], b[3], P.rim, P.win, 0.22, 0.3);
          lg.fillStyle = b[1]; lg.fillRect(0, 150, LW, 3); for (let x = 0; x < LW; x += 32) lg.fillRect(x, 150, 3, H - 150);
          dyn.track = 149;
        }));
        fg = layer(1.4, (lg) => wires(lg, 26, 16, rgba(P.fg, 0.92), 384));
      }
      return { sky, layers, theme, fg, lit, dyn, grade: gradeCanvas(PAL[theme]), tint: PAL[theme].tint };
    }

    // ---------- 판 시작 ----------
    function newGame(shipIdx) {
      const ship = SHIPS[shipIdx];
      S = {
        ship: shipIdx, score: 0, lives: 3, bombs: ship.bombs, weapon: 1, options: 0, shield: ship.respawnShield,
        stage: 0, t: 0, phase: "intro", phaseT: 0, scroll: 0, scrollSpeed: 0, bg: 0,
        px: -16, py: 108, alive: true, invul: 0, respawnT: 0, autoT: 0, autoX: 56, tilt: 0,
        fireCd: 0, volleyN: 0, charge: 0, holdT: 0, trail: [], nomiss: true, gid: 0, groups: {}, queue: [], ei: 0,
        boss: null, shake: 0, flash: 0, flashC: CREAM, banner: null, tally: null, notes: [], pull: 0, waitT: 0,
        kills: 0, bombCd: 0, amb: [], hitStop: 0, lightT: rnd(3, 6), lightning: 0, lightX: 0, cleared: false, overT: 0, endT: 0,
      };
      initStage(0);
    }
    function initStage(i) {
      S.stage = i;
      ST = STAGES[i];
      TER = buildTerrain(ST);
      BG = buildBG(ST.theme);
      S.scroll = 0; S.scrollSpeed = ST.speed; S.bg = 0;
      S.phase = "intro"; S.phaseT = 0; S.ei = 0; S.queue = []; S.groups = {}; S.boss = null; S.waitT = 0; S.tally = null;
      S.nomiss = true; S.pull = 0; S.pullNow = 0;
      clearPool(EN); clearPool(ES); clearPool(PS); clearPool(IT); clearPool(HZ); clearPool(POP); S.amb = [];
      S.px = -16; S.py = safeY(56, 108); S.autoT = 1.1; S.autoX = 56; S.alive = true; S.invul = Math.max(S.invul, 1.4);
      S.trail = [];
      S.banner = { big: `STAGE ${i + 1}`, sub: ST.name, t: 2.8, len: 2.8 };
      if (ST.theme === "storm") for (const r of RAIN) { r.on = true; r.x = rnd(0, W + 60); r.y = rnd(0, H); r.l = rnd(3, 6) | 0; }
      else clearPool(RAIN);
      Music.play(ST.music);
      ctx.sfx("go");
      hud(true);
    }
    function safeY(sx, prefer) {
      const wx = S.scroll + sx;
      let top = -8, bot = 224;
      for (let d = -8; d <= 16; d += 8) { top = Math.max(top, ceilAt(wx + d)); bot = Math.min(bot, floorAt(wx + d)); }
      top = Math.max(8, top + 8); bot = Math.min(H - 8, bot - 8);
      return prefer >= top && prefer <= bot ? prefer : (top + bot) / 2;
    }

    // ---------- 갱신 ----------
    function update(dt) {
      // 히트 스톱 — 세상만 잠깐 멈추고 내 기체 이동 · 쏘기는 그대로 (멈춘 것처럼 느껴지지 않게)
      if (S.hitStop > 0) { S.hitStop -= dt; updatePlayer(dt); return; }
      S.t += dt; S.phaseT += dt;
      const bossTime = S.phase === "warning" || S.phase === "boss" || S.phase === "bossdown" || S.phase === "clear";
      if (bossTime) S.scrollSpeed = Math.max(0, S.scrollSpeed - (ST.speed * dt) / 1.4);
      else if (S.phase !== "ending") S.scrollSpeed = ST.speed;
      S.scroll += S.scrollSpeed * dt;
      S.bg += (S.phase === "ending" ? 26 : ST.speed) * dt;
      if (S.shake > 0) S.shake = Math.max(0, S.shake - dt * 10);
      if (S.flash > 0) S.flash = Math.max(0, S.flash - dt);
      if (S.banner) { S.banner.t -= dt; if (S.banner.t <= 0) S.banner = null; }
      for (let i = S.notes.length - 1; i >= 0; i--) { const n = S.notes[i]; n.t -= dt; n.y -= 10 * dt; if (n.t <= 0) S.notes.splice(i, 1); }
      updateWeather(dt);

      // 단계
      if (S.phase === "intro") { if (S.phaseT >= 2.6) { S.phase = "stage"; S.phaseT = 0; } }
      else if (S.phase === "stage") {
        while (S.ei < ST.events.length && ST.events[S.ei].trig <= S.scroll) runEvent(ST.events[S.ei++]);
        if (S.scroll >= ST.len) {
          S.waitT += dt;
          const flyers = EN.some((e) => e.on && !e.anchored);
          if (!flyers || S.waitT > 6) { S.phase = "warning"; S.phaseT = 0; Music.stop(); ctx.sfx("countdown"); S.warnN = 1; }
        }
      } else if (S.phase === "warning") {
        if (S.phaseT > S.warnN * 0.8 && S.warnN < 3) { S.warnN++; ctx.sfx("countdown"); }
        if (S.phaseT >= 3.2) { S.phase = "boss"; S.phaseT = 0; S.boss = makeBoss(ST.boss); Music.play("boss"); }
      } else if (S.phase === "bossdown") {
        updateBossDown(dt);
      } else if (S.phase === "clear") {
        updateTally(dt);
      } else if (S.phase === "ending") {
        S.endT += dt;
        if (S.endT >= 10.5) { finish(true); return; }
      } else if (S.phase === "gameover") {
        S.overT += dt;
        if (S.overT >= 3.2) { finish(false); return; }
      }

      // 기다리던 등장(편대의 뒷줄 등)
      for (let i = S.queue.length - 1; i >= 0; i--) { const q = S.queue[i]; if (q.at <= S.t) { S.queue.splice(i, 1); spawnEnemy(q.type, q.x, q.y, q.opt); } }

      updatePlayer(dt);
      S.pull = 0;
      if (S.boss && S.phase === "boss") updateBoss(S.boss, dt);
      updateEnemies(dt);
      updateHazards(dt);
      updateShots(dt);
      updateEnemyShots(dt);
      updateItems(dt);
      updateParticles(dt);
      checkPlayerHits();
      if (S.invul > 0) S.invul -= dt;
      if (S.bombCd > 0) S.bombCd -= dt;
      hud();
    }

    // ---------- 내 기체 ----------
    const canControl = () => S.phase !== "ending" && S.phase !== "gameover" && !(S.phase === "clear" && S.tally && S.tally.leaving);
    const canFire = () => S.phase === "stage" || S.phase === "warning" || S.phase === "boss" || (S.phase === "intro" && S.phaseT > 1.1);
    function updatePlayer(dt) {
      if (!S.alive) {
        if (S.phase === "gameover") return;
        S.respawnT -= dt;
        if (S.respawnT <= 0) respawn();
        return;
      }
      const ship = SHIPS[S.ship];
      const oy = S.py, ox = S.px;
      if (S.autoT > 0) {
        S.autoT -= dt;
        S.px += (S.autoX - S.px) * Math.min(1, dt * 5);
        dragDX = dragDY = 0;
      } else if (S.phase === "clear" && S.tally && S.tally.leaving) {
        S.px += 220 * dt;
      } else if (S.phase === "ending") {
        // 엔딩은 따로 그린다
      } else if (canControl()) {
        const mx = (keys.r ? 1 : 0) - (keys.l ? 1 : 0), my = (keys.d ? 1 : 0) - (keys.u ? 1 : 0);
        const k = mx && my ? Math.SQRT1_2 : 1;
        let nx = S.px + mx * ship.speed * k * dt, ny = S.py + my * ship.speed * k * dt;
        if (dragDX || dragDY) { nx += dragDX; ny += dragDY; dragDX = dragDY = 0; }
        S.px = clamp(nx, 12, W - 20);
        S.py = clamp(ny, 8, H - 8);
      }
      if (S.pullNow) S.px = clamp(S.px + S.pullNow * dt, 12, W - 20);
      const vy = (S.py - oy) / Math.max(dt, 1e-4) / ship.speed;
      S.tilt += (clamp(vy * 1.4, -1, 1) - S.tilt) * Math.min(1, dt * 12);
      // 종이학이 따라올 길
      const last = S.trail[S.trail.length - 1];
      if (!last || Math.abs(last[0] - S.px) + Math.abs(last[1] - S.py) > 1.2) { S.trail.push([S.px, S.py]); if (S.trail.length > 80) S.trail.shift(); }
      else if (ox === S.px && oy === S.py && S.trail.length) { /* 멈춰 있으면 그대로 */ }

      // 쏘기 · 차지
      S.fireCd -= dt;
      if (canFire()) {
        const firing = keys.fire || touchFire;
        const chargeIn = keys.fire || chargeBtn;
        if (chargeIn) {
          S.holdT += dt;
          if (S.holdT > 0.18) {
            const before = S.charge;
            S.charge = Math.min(1, S.charge + dt / ship.charge);
            if (before < 1 && S.charge >= 1) ctx.sfx("select");
          }
        } else {
          if (S.charge >= 0.5) fireCharge(S.charge >= 1 ? 2 : 1);
          S.charge = 0; S.holdT = 0;
        }
        if (firing && S.fireCd <= 0) { S.fireCd = 0.1; volley(); }
      } else { S.charge = 0; S.holdT = 0; }
    }
    function optionPos(i) {
      const n = S.trail.length;
      if (!n) return [S.px - 20, S.py];
      const p = S.trail[Math.max(0, n - 1 - (i + 1) * 12)];
      return [p[0] - 10, p[1] + (i ? 8 : -8)];
    }
    function shot(x, y, ang, dmg, look) {
      const p = take(PS);
      if (!p) return;
      p.x = x; p.y = y; p.vx = Math.cos(ang) * 330; p.vy = Math.sin(ang) * 330; p.dmg = dmg; p.look = look; p.big = 0;
      p.hw = look === 1 ? 4 : 3; p.hh = look === 1 ? 2 : 1; p.hits = null; p.kills = 0; p.erase = false; p.pierce = 0;
    }
    function volley() {
      const lv = S.weapon, x = S.px + 15, y = S.py;
      if (lv === 1) shot(x, y, 0, 1, 0);
      else if (lv === 2) { shot(x, y - 3, 0, 1, 0); shot(x, y + 3, 0, 1, 0); }
      else if (lv === 3) { shot(x, y - 3, 0, 1, 0); shot(x, y + 3, 0, 1, 0); shot(x - 2, y - 2, -0.2, 1, 0); shot(x - 2, y + 2, 0.2, 1, 0); }
      else { shot(x + 1, y, 0, 1.6, 1); shot(x, y - 5, 0, 1, 0); shot(x, y + 5, 0, 1, 0); shot(x - 2, y - 3, -0.24, 1, 0); shot(x - 2, y + 3, 0.24, 1, 0); }
      for (let i = 0; i < S.options; i++) { const [ox, oy] = optionPos(i); shot(ox + 9, oy, 0, 1, 2); }
      S.volleyN++;
      if (S.volleyN % 2 === 1) sfx("shoot", 0.05);
    }
    function fireCharge(lv) {
      const mk = (x, y, l) => {
        const p = take(PS);
        if (!p) return;
        p.x = x; p.y = y; p.vx = 280; p.vy = 0; p.big = l; p.look = 3; p.dmg = l === 2 ? 10 : 4;
        p.hw = l === 2 ? 11 : 6; p.hh = l === 2 ? 9 : 5; p.hits = []; p.kills = 0; p.erase = l === 2; p.pierce = l === 2 ? 99 : 3;
      };
      mk(S.px + 20, S.py, lv);
      if (lv === 2) for (let i = 0; i < S.options; i++) { const [ox, oy] = optionPos(i); mk(ox + 8, oy, 1); }
      ctx.sfx(lv === 2 ? "laser" : "shoot");
      if (lv === 2) S.shake = Math.max(S.shake, 1.5);
      for (let i = 0; i < (lv === 2 ? 10 : 5); i++) part(S.px + 18, S.py, rnd(40, 140), rnd(-60, 60), 0.3, "#a8ffe6", 1);
    }
    function useBomb() {
      if (state !== "play" || !S || !S.alive || S.bombs <= 0 || S.bombCd > 0 || !canFire()) return;
      S.bombs--; S.bombCd = 1.0; S.invul = Math.max(S.invul, 1.2);
      S.flash = 0.35; S.flashC = CREAM; S.shake = 5;
      ctx.sfx("explode"); sfx("whoosh");
      for (const b of ES) if (b.on) { b.on = false; part(b.x, b.y, 0, -20, 0.4, "#ffe0a3", 4); addScore(10); }
      for (const e of EN) if (e.on && !e.dying && onScreen(e)) damageEnemy(e, 14, null);
      const B = S.boss;
      if (B && !B.enter && !B.dying) for (const p of B.parts) if (p.alive && !p.armored) damagePart(B, p, 24);
      ringFx(S.px, S.py, 90, "#ffd166");
      ringFx(S.px, S.py, 60, CREAM);
      for (let i = 0; i < 40; i++) { const a = rnd(0, TAU), v = rnd(60, 220); part(S.px, S.py, Math.cos(a) * v, Math.sin(a) * v, rnd(0.4, 0.9), pick(["#ffd166", CREAM, "#d2d6ee"]), 0); }
      note("클립 폭탄!", S.px, S.py - 14, "#ffd166");
      hud(true);
    }
    function pick(a) { return a[(Math.random() * a.length) | 0]; }

    function hitPlayer(kind) {
      if (god) return;
      if (!S.alive || S.invul > 0) return;
      if (S.shield) {
        S.shield = false; S.invul = 1.4;
        ctx.sfx("hit");
        ringFx(S.px, S.py, 18, "#3cdc6a");
        note("방패가 막았어요", S.px, S.py - 12, "#9cf59a");
        if (kind === "wall") S.py = safeY(S.px, S.py);
        hud(true);
        return;
      }
      die();
    }
    function die() {
      S.alive = false; S.lives--; S.nomiss = false; S.hitStop = 0.1;
      S.weapon = Math.max(1, S.weapon - 1);
      S.charge = 0; S.holdT = 0;
      ctx.sfx("hurt"); ctx.sfx("explode");
      S.shake = 6;
      boom(S.px, S.py, 3);
      for (const b of ES) b.on = false;
      S.respawnT = 1.3;
      if (S.lives <= 0) { S.phase = "gameover"; S.overT = 0; Music.stop(); }
      hud(true);
    }
    function respawn() {
      S.alive = true;
      S.px = -16; S.py = safeY(50, S.py); S.autoT = 0.8; S.autoX = 50;
      S.invul = 2.6; S.trail = [];
      if (SHIPS[S.ship].respawnShield) S.shield = true;
      hud(true);
    }

    // ---------- 등장 ----------
    function runEvent(ev) {
      const o = ev.opt;
      if (ev.type === "form") spawnForm(o);
      else if (ev.type === "bolt") spawnBolt(clamp(S.px + rnd(-20, 30), 16, W - 30), 1.1);
      else if (ANCHORED[ev.type]) {
        if (ev.type === "gate" || ev.type === "ductfan") spawnHazard(ev.type, ev.wx, o);
        else spawnEnemy(ev.type, ev.wx - S.scroll, 0, Object.assign({ wx: ev.wx }, o));
      } else spawnEnemy(ev.type, W + 14, o.y, o);
    }
    function spawnForm(o) {
      const gid = ++S.gid;
      S.groups[gid] = { n: o.n, killed: 0, lost: 0, drop: o.drop || null };
      const c = (o.n - 1) / 2;
      for (let i = 0; i < o.n; i++) {
        const opt = Object.assign({}, o, { group: gid, idx: i });
        let delay = i * 0.42, y = o.y;
        if (o.pat === "v") { delay = Math.abs(i - c) * 0.22; y = o.y + (i - c) * 15; opt.sx = 236 + Math.abs(i - c) * 20; }
        if (o.pat === "line") delay = i * 0.3;
        if (o.pat === "swoop") delay = i * 0.36;
        S.queue.push({ at: S.t + delay, type: "drone", x: W + 14, y, opt });
      }
    }
    function onScreen(e) { return e.x > -8 && e.x < W + 8 && e.y > -8 && e.y < H + 8; }
    function spawnEnemy(type, x, y, opt) {
      const e = take(EN);
      if (!e) return null;
      const d = ENEMY[type];
      e.type = type; e.x = x; e.y = y; e.t = 0; e.vx = 0; e.vy = 0; e.flash = 0; e.mode = 0; e.cd = 0; e.dying = false;
      e.o = opt || {}; e.group = e.o.group || null; e.anchored = !!ANCHORED[type]; e.wx = e.o.wx || 0;
      e.hp = d.hp + Math.floor(d.hp * ST.hpMul) + (type === "drone" && S.stage >= 2 ? 1 : 0);
      e.pts = d.pts; e.hw = d.hw; e.hh = d.hh; e.a = 0; e.fireAt = 0; e.seg = null;
      if (type === "drone") {
        if (e.o.pat === "swoop") { e.sy = e.o.up ? H + 12 : -12; e.y = e.sy; }
        if (e.o.shoot && Math.random() < e.o.shoot) e.fireAt = rnd(0.9, 2.4);
      } else if (type === "clip") { e.mode = 0; e.cd = e.o.launch ? 0.3 : 0.55; e.tx = e.o.launch ? x : W - 26; }
      else if (type === "fan") { e.cd = rnd(0.8, 1.6); }
      else if (type === "turret") {
        e.side = e.o.side || 1;
        e.base = e.side > 0 ? floorAt(e.wx) : ceilAt(e.wx);
        e.y = e.base - e.side * 7; e.cd = rnd(0.8, 1.4); e.a = Math.PI;
      } else if (type === "punch") {
        e.side = e.o.side || 1;
        e.base = e.side > 0 ? floorAt(e.wx) : ceilAt(e.wx);
        const room = Math.abs(floorAt(e.wx) - ceilAt(e.wx));
        e.len = clamp(Math.min(78, room - 30), 24, 78); e.ext = 0; e.mode = 0; e.y = e.base - e.side * 10;
      } else if (type === "hopper") {
        e.base = floorAt(e.wx); e.y = e.base - 11; e.vy = 0; e.cd = rnd(0.6, 1.4); e.air = false;
      } else if (type === "snake") {
        e.a = Math.PI; e.trail = []; e.seg = Array.from({ length: 7 }, () => [x, y]); e.hp += S.stage * 4;
      } else if (type === "balloon") { e.item = e.o.item || null; }
      else if (type === "mini") { e.vx = -96; }
      return e;
    }
    function spawnHazard(type, wx, o) {
      const h = take(HZ);
      if (!h) return;
      h.type = type; h.wx = wx; h.x = wx - S.scroll; h.t = 0; h.o = o;
      if (type === "gate") {
        h.top = Math.max(0, ceilAt(wx)); h.bot = Math.min(H, floorAt(wx));
        h.mid = (h.top + h.bot) / 2; h.ph = rnd(0, TAU); h.gy = h.mid;
      } else if (type === "ductfan") { h.y = o.y; h.r = o.r; h.w = o.w; h.a = 0; }
    }
    function spawnBolt(x, warn) {
      const h = take(HZ);
      if (!h) return;
      h.type = "bolt"; h.x = x; h.wx = 0; h.t = 0; h.warn = warn; h.struck = false;
      h.bot = Math.min(H, floorAt(S.scroll + x));
      h.pts = [];
      let bx = x;
      for (let y = 0; y <= h.bot; y += 6) { h.pts.push([bx, y]); bx = clamp(bx + rnd(-4, 4), x - 6, x + 6); }
    }

    // ---------- 적 ----------
    function aimAt(x, y) { return Math.atan2(S.py - y, S.px - x); }
    function canShoot(e) { return S.alive && e.x > 18 && e.x < W - 6 && Math.hypot(e.x - S.px, e.y - S.py) > 50 && S.phase !== "clear"; }
    function eshot(x, y, ang, sp, kind) {
      const b = take(ES);
      if (!b) return null;
      const k = kind || "orb";
      b.x = x; b.y = y; b.vx = Math.cos(ang) * sp; b.vy = Math.sin(ang) * sp; b.kind = k; b.r = A.bul[k].r; b.t = 0; b.g = 0;
      return b;
    }
    function fan(x, y, n, base, step, sp, kind) { for (let i = 0; i < n; i++) eshot(x, y, base + (i - (n - 1) / 2) * step, sp, kind); }
    function updateEnemies(dt) {
      const bs = ST.bs, fr = ST.fire;
      for (const e of EN) {
        if (!e.on) continue;
        e.t += dt;
        if (e.flash > 0) e.flash -= dt;
        if (e.anchored) e.x = e.wx - S.scroll;
        const o = e.o;
        switch (e.type) {
          case "drone": {
            if (o.pat === "sine") { e.x -= 58 * dt; e.y = o.y + Math.sin(e.t * 2.6) * (o.amp || 16); }
            else if (o.pat === "line") e.x -= 76 * dt;
            else if (o.pat === "v") {
              if (e.mode === 0) { e.x += (o.sx - e.x) * Math.min(1, dt * 2.4); if (Math.abs(e.x - o.sx) < 2) { e.mode = 1; e.cd = 1.3; if (o.shoot && Math.random() < o.shoot && canShoot(e)) eshot(e.x - 4, e.y, aimAt(e.x, e.y), bs, "orb"); } }
              else if (e.mode === 1) { e.cd -= dt; if (e.cd <= 0) { e.mode = 2; e.vy = e.y < 108 ? -64 : 64; } }
              else { e.x -= 110 * dt; e.y += e.vy * dt; }
            } else if (o.pat === "loop") {
              if (e.mode === 0) { e.x -= 82 * dt; if (e.x < 214) { e.mode = 1; e.s = o.y < 108 ? 1 : -1; e.cx = e.x; e.cy = e.y + 30 * e.s; e.lt = 0; } }
              else if (e.mode === 1) {
                e.lt += dt * 2.9;
                const th = -e.s * Math.PI / 2 - e.s * e.lt;
                e.x = e.cx + Math.cos(th) * 30; e.y = e.cy + Math.sin(th) * 30;
                if (e.lt >= TAU) e.mode = 2;
              } else e.x -= 96 * dt;
            } else if (o.pat === "swoop") {
              const k = Math.min(1, e.t / 4.6), ik = 1 - k;
              e.x = ik * ik * (W + 14) + 2 * ik * k * 140 + k * k * -30;
              e.y = ik * ik * e.sy + 2 * ik * k * (o.y * 2 - (e.sy + e.sy) / 2) + k * k * e.sy;
            }
            if (e.fireAt && e.t >= e.fireAt) { e.fireAt = 0; if (canShoot(e)) eshot(e.x - 4, e.y, aimAt(e.x, e.y), bs, "orb"); }
            break;
          }
          case "clip": {
            if (e.mode === 0) { e.x += (e.tx - e.x) * Math.min(1, dt * 6); e.cd -= dt; if (e.cd <= 0) { e.mode = 1; let a = aimAt(e.x, e.y); if (Math.cos(a) > -0.35) a = Math.PI + Math.sign(Math.sin(a) || 1) * 1.2; e.a = a; e.sp = 30; sfx("whoosh", 0.3); } }
            else { e.sp = Math.min(175, e.sp + 260 * dt); e.x += Math.cos(e.a) * e.sp * dt; e.y += Math.sin(e.a) * e.sp * dt; if (Math.random() < 0.5) part(e.x + 6, e.y, rnd(10, 40), rnd(-10, 10), 0.25, "#ffb26b", 1); }
            break;
          }
          case "fan": {
            e.x -= (S.scrollSpeed * 0.35 + 22) * dt; e.y = o.y + Math.sin(e.t * 1.6) * 10; e.a += dt * 3.2;
            e.cd -= dt;
            if (e.cd <= 0) { e.cd = 2.1 / fr; if (canShoot(e)) for (let k = 0; k < 4; k++) eshot(e.x, e.y, e.a + k * Math.PI / 2, bs * 0.85, "orb"); }
            break;
          }
          case "turret": {
            const want = aimAt(e.x, e.y);
            e.a += clamp(angDiff(want, e.a), -2 * dt, 2 * dt);
            e.cd -= dt;
            if (e.cd <= 0) {
              e.cd = 2.3 / fr;
              if (canShoot(e) && (e.side > 0 ? S.py < e.y : S.py > e.y)) {
                const nx = e.x + Math.cos(e.a) * 6, ny = e.y + Math.sin(e.a) * 6;
                if (S.stage === 0) eshot(nx, ny, e.a, bs, "drop"); else fan(nx, ny, 3, e.a, 0.22, bs, "drop");
              }
            }
            break;
          }
          case "punch": {
            const near = S.alive && S.px > e.x - 74 && S.px < e.x + 16;
            if (e.mode === 0) { if (near && e.x < W - 10) { e.mode = 1; e.cd = 0.4; sfx("tick", 0.2); } }
            else if (e.mode === 1) { e.cd -= dt; if (e.cd <= 0) { e.mode = 2; sfx("jump", 0.2); } }
            else if (e.mode === 2) { e.ext = Math.min(e.len, e.ext + e.len * dt / 0.14); if (e.ext >= e.len) { e.mode = 3; e.cd = 0.45; } }
            else if (e.mode === 3) { e.cd -= dt; if (e.cd <= 0) e.mode = 4; }
            else if (e.mode === 4) { e.ext = Math.max(0, e.ext - e.len * dt / 0.5); if (e.ext <= 0) { e.mode = 5; e.cd = 1.2; } }
            else if (e.mode === 5) { e.cd -= dt; if (e.cd <= 0) e.mode = 0; }
            e.y = e.base - e.side * (10 + e.ext);
            break;
          }
          case "hopper": {
            if (!e.air) {
              e.y = e.base - 11; e.cd -= dt;
              if (e.cd <= 0 && e.x < W - 10) { e.air = true; e.vy = -150; e.fired = false; e.hv = S.px < e.x ? -18 : 6; }
            } else {
              e.vy += 300 * dt; e.y += e.vy * dt; e.wx += e.hv * dt;
              if (!e.fired && e.vy >= 0) { e.fired = true; if (canShoot(e)) fan(e.x, e.y - 4, 3, aimAt(e.x, e.y), 0.3, bs * 0.95, "orb"); }
              e.base = floorAt(e.wx);
              if (e.y >= e.base - 11) { e.air = false; e.y = e.base - 11; e.cd = rnd(1.0, 1.6) / fr; }
            }
            break;
          }
          case "snake": {
            const life = e.t;
            let want = life < 0.8 ? Math.PI : aimAt(e.x, e.y);
            if (life > 13) want = Math.PI;
            const turn = (1.3 + S.stage * 0.15) * dt;
            e.a += clamp(angDiff(want, e.a), -turn, turn);
            const sp = life > 13 ? 90 : 56;
            e.x += Math.cos(e.a) * sp * dt; e.y += Math.sin(e.a) * sp * dt;
            e.y = clamp(e.y, 6, H - 6);
            const last = e.trail[e.trail.length - 1];
            if (!last || Math.hypot(last[0] - e.x, last[1] - e.y) >= 2) { e.trail.push([e.x, e.y]); if (e.trail.length > 44) e.trail.shift(); }
            for (let i = 0; i < e.seg.length; i++) { const p = e.trail[Math.max(0, e.trail.length - 1 - (i + 1) * 5)] || [e.x + (i + 1) * 10, e.y]; e.seg[i][0] = p[0]; e.seg[i][1] = p[1]; }
            break;
          }
          case "balloon": e.x -= (S.scrollSpeed * 0.45 + 10) * dt; e.y = o.y + Math.sin(e.t * 1.2) * 6; break;
          case "mini": {
            e.x += e.vx * dt;
            e.y += clamp(S.py - e.y, -26 * dt, 26 * dt);
            break;
          }
        }
        // 화면 밖으로 나가면 사라짐
        const gone = e.anchored ? e.x < -30 : (e.t > 1 && (e.x < -34 || e.x > W + 70 || e.y < -40 || e.y > H + 40)) || (e.type === "snake" && e.t > 13 && e.x < -80);
        if (gone && !(e.type === "snake" && e.x > -80)) {
          e.on = false;
          if (e.group && S.groups[e.group]) S.groups[e.group].lost++;
        }
      }
    }
    function damageEnemy(e, dmg, shot) {
      if (!e.on || e.dying) return;
      e.hp -= dmg; e.flash = 0.07;
      if (e.hp <= 0) killEnemy(e, shot);
      else sfx("hit", 0.07);
    }
    function killEnemy(e, shot) {
      e.on = false;
      let mult = 1;
      if (shot && shot.big) { shot.kills++; mult = Math.min(8, shot.kills); }
      const pts = e.pts * mult;
      addScore(pts);
      S.kills++;
      popup(e.x, e.y - 6, mult > 1 ? `${pts}x${mult}` : `${pts}`, mult > 1 ? "#ffd166" : CREAM);
      const big = e.type === "fan" || e.type === "snake" || e.type === "turret";
      if (big) S.hitStop = Math.max(S.hitStop || 0, 0.03);
      boom(e.x, e.y, big ? 2 : 1);
      ctx.sfx(big ? "explode" : "pop");
      if (e.type === "snake") for (const s of e.seg) { boom(s[0], s[1], 1); addScore(20); }
      if (e.type === "punch") boom(e.x, e.base - e.side * 4, 1);
      if (e.type === "balloon") dropItem(e.x, e.y, e.item || needItem());
      if (e.group && S.groups[e.group]) {
        const gr = S.groups[e.group];
        gr.killed++;
        if (gr.killed + gr.lost >= gr.n && gr.lost === 0) {
          const bonus = gr.n >= 5 ? 1000 : 500;
          addScore(bonus);
          popup(e.x, e.y - 14, `+${bonus}`, "#9cf59a");
          note("편대 전멸 보너스!", e.x, e.y - 20, "#9cf59a");
          ctx.sfx("coin");
          dropItem(e.x, e.y, gr.drop || needItem());
        }
      }
    }
    function addScore(n) { S.score = Math.min(99999999, S.score + Math.round(n)); }

    // ---------- 장애물(움직이는 벽 · 회전 팬 · 번개) ----------
    function updateHazards(dt) {
      for (const h of HZ) {
        if (!h.on) continue;
        h.t += dt;
        if (h.type === "bolt") {
          if (h.t >= h.warn && !h.struck) { h.struck = true; S.flash = Math.max(S.flash, 0.12); S.flashC = "#cfe3ff"; sfx("laser", 0.15); S.shake = Math.max(S.shake, 2); for (let i = 0; i < 8; i++) part(h.x, h.bot - 2, rnd(-60, 60), rnd(-90, -20), 0.4, "#ffd166", 1); }
          if (h.t >= h.warn + 0.3) h.on = false;
          continue;
        }
        h.x = h.wx - S.scroll;
        if (h.x < -50) { h.on = false; continue; }
        if (h.type === "gate") h.gy = h.mid + Math.sin(h.ph + h.t * h.o.spd) * h.o.amp;
        else if (h.type === "ductfan") h.a += h.w * dt;
      }
    }
    function gateRects(h) {
      const gh = h.o.gap / 2;
      return [[h.x - 8, h.top, 16, Math.max(0, h.gy - gh - h.top)], [h.x - 8, h.gy + gh, 16, Math.max(0, h.bot - (h.gy + gh))]];
    }
    function segDist(px, py, x0, y0, x1, y1) {
      const dx = x1 - x0, dy = y1 - y0, l = dx * dx + dy * dy || 1;
      const t = clamp(((px - x0) * dx + (py - y0) * dy) / l, 0, 1);
      return Math.hypot(px - (x0 + dx * t), py - (y0 + dy * t));
    }
    function fanHit(h, x, y, pad) {
      if (Math.hypot(x - h.x, y - h.y) > h.r + pad + 2) return false;
      if (Math.hypot(x - h.x, y - h.y) < 4 + pad) return true;
      for (let k = 0; k < 3; k++) { const a = h.a + k * TAU / 3; if (segDist(x, y, h.x, h.y, h.x + Math.cos(a) * h.r, h.y + Math.sin(a) * h.r) < 2 + pad) return true; }
      return false;
    }
    function hazardBlocks(x, y) {
      for (const h of HZ) {
        if (!h.on || h.type === "bolt") continue;
        if (h.type === "gate") { for (const [rx, ry, rw, rh] of gateRects(h)) if (x > rx && x < rx + rw && y > ry && y < ry + rh) return true; }
        else if (fanHit(h, x, y, 0)) return true;
      }
      return false;
    }

    // ---------- 내 탄 ----------
    const boxHit = (ax, ay, ahw, ahh, bx, by, bhw, bhh) => Math.abs(ax - bx) < ahw + bhw && Math.abs(ay - by) < ahh + bhh;
    // 0: 안 맞음 · 1: 맞음(피해) · 2: 단단한 곳(탄이 막힘)
    function enemyHitTest(e, x, y, hw, hh) {
      if (e.type === "punch") {
        if (boxHit(x, y, hw, hh, e.x, e.y, 6, 6)) return 1;
        if (boxHit(x, y, hw, hh, e.x, e.base - e.side * 3, 8, 3)) return 2;
        return 0;
      }
      if (e.type === "snake") {
        if (boxHit(x, y, hw, hh, e.x, e.y, e.hw, e.hh)) return 1;
        for (const s of e.seg) if (boxHit(x, y, hw, hh, s[0], s[1], 5, 6)) return 2;
        return 0;
      }
      return boxHit(x, y, hw, hh, e.x, e.y, e.hw, e.hh) ? 1 : 0;
    }
    function updateShots(dt) {
      const B = S.boss;
      for (const p of PS) {
        if (!p.on) continue;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.x > W + 20 || p.y < -12 || p.y > H + 12) { p.on = false; continue; }
        if (!p.big) {
          if (solidAt(p.x, p.y) || hazardBlocks(p.x, p.y)) { p.on = false; part(p.x, p.y, -30, rnd(-30, 30), 0.15, "#d2d6ee", 1); continue; }
        } else {
          if (Math.random() < 0.6) part(p.x - p.hw, p.y + rnd(-p.hh, p.hh), -40, 0, 0.3, p.big === 2 ? "#a8ffe6" : "#a8ffe6", 1);
          if (p.erase) for (const b of ES) if (b.on && boxHit(p.x, p.y, p.hw, p.hh, b.x, b.y, b.r, b.r)) { b.on = false; part(b.x, b.y, 0, -10, 0.3, "#ffe68a", 4); addScore(10); }
        }
        // 적
        for (const e of EN) {
          if (!e.on || e.dying) continue;
          const r = enemyHitTest(e, p.x, p.y, p.hw, p.hh);
          if (!r) continue;
          if (p.big) {
            if (r !== 1 || p.hits.includes(e)) continue;
            p.hits.push(e);
            damageEnemy(e, p.dmg, p);
            if (p.hits.length >= p.pierce) { p.on = false; break; }
          } else {
            p.on = false;
            if (r === 1) damageEnemy(e, p.dmg, null);
            else { part(p.x, p.y, -40, rnd(-40, 40), 0.15, CREAM, 1); sfx("tick", 0.08); }
            break;
          }
        }
        if (!p.on || !B || B.enter || B.dying) continue;
        // 보스
        for (const bp of B.parts) {
          if (!bp.alive) continue;
          if (!boxHit(p.x, p.y, p.hw, p.hh, B.x + bp.ox, B.y + bp.oy, bp.hw, bp.hh)) continue;
          if (p.big) {
            if (p.hits.includes(bp)) continue;
            p.hits.push(bp);
            if (bp.armored) { part(p.x, p.y, -30, 0, 0.2, CREAM, 4); continue; }
            damagePart(B, bp, p.dmg);
          } else {
            p.on = false;
            if (bp.armored) { part(p.x, p.y, -40, rnd(-40, 40), 0.15, CREAM, 1); sfx("tick", 0.1); }
            else damagePart(B, bp, p.dmg);
            break;
          }
        }
        if (p.on && !p.big) for (const r of B.body) if (boxHit(p.x, p.y, p.hw, p.hh, B.x + r[0], B.y + r[1], r[2], r[3])) { p.on = false; part(p.x, p.y, -40, rnd(-40, 40), 0.15, CREAM, 1); break; }
      }
    }
    function updateEnemyShots(dt) {
      for (const b of ES) {
        if (!b.on) continue;
        b.t += dt;
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.x < -10 || b.x > W + 10 || b.y < -14 || b.y > H + 10) b.on = false;
      }
    }

    // ---------- 아이템 ----------
    function needItem() {
      const w = { red: S.weapon < 4 ? 4 : 0.4, blue: S.options < 2 ? 3 : 0.3, green: S.shield ? 0.4 : 2, yellow: S.bombs < 5 ? 2 : 0.3 };
      let sum = 0; for (const k in w) sum += w[k];
      let r = Math.random() * sum;
      for (const k in w) { r -= w[k]; if (r <= 0) return k; }
      return "red";
    }
    function dropItem(x, y, kind) {
      const it = take(IT);
      if (!it) return;
      it.kind = kind; it.x = clamp(x, 20, W - 10); it.t = 0;
      it.by = clamp(y, 12, H - 12);
      if (solidAt(it.x, it.by)) it.by = safeY(it.x, it.by);
    }
    function updateItems(dt) {
      for (const it of IT) {
        if (!it.on) continue;
        it.t += dt;
        it.x -= (14 + S.scrollSpeed * 0.3) * dt;
        it.y = it.by + Math.sin(it.t * 3) * 4;
        if (it.x < -10) { it.on = false; continue; }
        if (S.alive && Math.abs(it.x - S.px) < 15 && Math.abs(it.y - S.py) < 12) { it.on = false; takeItem(it.kind, it.x, it.y); }
      }
    }
    function takeItem(kind, x, y) {
      ctx.sfx("powerup");
      let text = "";
      if (kind === "red") { if (S.weapon < 4) { S.weapon++; text = `무기 ${S.weapon}단계!`; } else { addScore(1000); text = "무기 최고 · +1000"; } }
      else if (kind === "blue") { if (S.options < 2) { S.options++; text = S.options === 2 ? "종이학 둘째 합류!" : "종이학 합류!"; } else { addScore(1000); text = "종이학 가득 · +1000"; } }
      else if (kind === "green") { if (!S.shield) { S.shield = true; text = "방패!"; } else { addScore(1000); text = "방패 있음 · +1000"; } }
      else { if (S.bombs < 5) { S.bombs++; text = "클립 폭탄 +1"; } else { addScore(1000); text = "폭탄 가득 · +1000"; } }
      note(text, x, y - 10, ITEMS[kind].l);
      for (let i = 0; i < 12; i++) { const a = rnd(0, TAU); part(x, y, Math.cos(a) * 70, Math.sin(a) * 70, 0.4, ITEMS[kind].c, 4); }
      hud(true);
    }

    // ---------- 이펙트 ----------
    function part(x, y, vx, vy, life, color, kind, size) {
      const p = take(PT);
      if (!p) return;
      p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.max = life; p.c = color; p.k = kind || 0; p.s = size || 0;
    }
    function ringFx(x, y, size, color) { part(x, y, 0, 0, 0.45, color, 2, size); }
    function boom(x, y, size) {
      const n = size === 3 ? 34 : size === 2 ? 22 : 10;
      ringFx(x, y, size === 3 ? 26 : size === 2 ? 18 : 10, CREAM);
      part(x, y, 0, 0, 0.12, CREAM, 5, size * 4 + 2);
      for (let i = 0; i < n; i++) {
        const a = rnd(0, TAU), v = rnd(30, 90 + size * 40);
        part(x, y, Math.cos(a) * v, Math.sin(a) * v - 20, rnd(0.5, 1.1), PAPER[(Math.random() * PAPER.length) | 0], 0);
      }
      for (let i = 0; i < n / 3; i++) { const a = rnd(0, TAU), v = rnd(20, 80); part(x, y, Math.cos(a) * v, Math.sin(a) * v, rnd(0.3, 0.7), "#ffd166", 4); }
    }
    function updateParticles(dt) {
      for (const p of PT) {
        if (!p.on) continue;
        p.life -= dt;
        if (p.life <= 0) { p.on = false; continue; }
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.k === 0) { p.vy += 70 * dt; p.vx *= 1 - 1.6 * dt; p.vy *= 1 - 0.8 * dt; }
        else { p.vx *= 1 - 2.5 * dt; p.vy *= 1 - 2.5 * dt; }
      }
      for (const p of POP) { if (!p.on) continue; p.t -= dt; p.y -= 14 * dt; if (p.t <= 0) p.on = false; }
    }
    function popup(x, y, text, color) { const p = take(POP); if (!p) return; p.x = x; p.y = y; p.text = text; p.c = color; p.t = 0.9; }
    function note(text, x, y, color) { S.notes.push({ text, x: clamp(x, 60, W - 60), y: clamp(y, 16, H - 16), color, t: 1.4 }); if (S.notes.length > 4) S.notes.shift(); }
    function updateWeather(dt) {
      const th = ST.theme;
      if (th !== "storm" && S.amb.length < 12 && Math.random() < dt * 3) S.amb.push({ kind: th === "sky" ? 0 : 1, x: W + 4, y: rnd(8, H - 20), t: 0, vx: -rnd(18, 40) - S.scrollSpeed * 0.4, ph: rnd(0, TAU), c: th === "duct" ? "#9fc2cc" : "#ffe0a3" });
      for (let i = S.amb.length - 1; i >= 0; i--) { const a = S.amb[i]; a.t += dt; a.x += a.vx * dt; a.y += Math.sin(a.t * 1.7 + a.ph) * 8 * dt; if (a.x < -6) S.amb.splice(i, 1); }
      if (th !== "storm") return;
      for (const r of RAIN) { if (!r.on) continue; r.x -= 80 * dt; r.y += 280 * dt; if (r.y > H) { r.y -= H + 10; r.x = rnd(0, W + 80); } if (r.x < -10) r.x += W + 40; }
      S.lightT -= dt;
      if (S.lightT <= 0) { S.lightT = rnd(4, 8); S.lightning = 0.22; S.lightX = rnd(30, W - 30); S.flash = Math.max(S.flash, 0.18); S.flashC = "#cfe3ff"; }
      if (S.lightning > 0) S.lightning -= dt;
    }

    // ---------- 충돌: 나 ----------
    function terrainHit(x, y) {
      for (const dx of [-7, 0, 7]) { const wx = S.scroll + x + dx, c = colOf(wx); if (y - 3 < TER.ceil[c] || y + 3 > TER.floor[c]) return true; }
      return false;
    }
    function checkPlayerHits() {
      if (!S.alive || S.phase === "clear" || S.phase === "ending" || S.autoT > 0.5) return;
      if (S.invul > 0) {
        if (terrainHit(S.px, S.py)) S.py = safeY(S.px, S.py);
        return;
      }
      const x = S.px + 1, y = S.py;
      for (const b of ES) if (b.on) { const dx = b.x - x, dy = b.y - y, r = b.r + 1.6; if (dx * dx + dy * dy < r * r) { b.on = false; hitPlayer(); return; } }
      if (terrainHit(S.px, S.py)) { hitPlayer("wall"); return; }
      for (const e of EN) {
        if (!e.on || e.dying) continue;
        if (enemyHitTest(e, x, y, 5, 3)) { if (e.type !== "punch" && e.type !== "snake") damageEnemy(e, 3, null); hitPlayer(); return; }
      }
      for (const h of HZ) {
        if (!h.on) continue;
        if (h.type === "gate") { for (const [rx, ry, rw, rh] of gateRects(h)) if (x + 6 > rx && x - 6 < rx + rw && y + 3 > ry && y - 3 < ry + rh) { hitPlayer("wall"); return; } }
        else if (h.type === "ductfan") { if (fanHit(h, x, y, 1.5)) { hitPlayer("wall"); return; } }
        else if (h.type === "bolt" && h.struck && h.t < h.warn + 0.3 && Math.abs(x - h.x) < 6 && y < h.bot) { hitPlayer(); return; }
      }
      const B = S.boss;
      if (B && !B.dying) {
        for (const r of B.body) if (boxHit(x, y, 5, 3, B.x + r[0], B.y + r[1], r[2], r[3])) { S.px = Math.max(8, S.px - 16); hitPlayer(); return; }
        for (const p of B.parts) if (p.alive && p.touch && boxHit(x, y, 5, 3, B.x + p.ox, B.y + p.oy, p.hw, p.hh)) { S.px = Math.max(8, S.px - 16); hitPlayer(); return; }
      }
    }

    // ---------- 보스 ----------
    function bpart(id, name, ox, oy, hw, hh, hp, core, touch) { return { id, name, ox, oy, hw, hh, hp, max: hp, alive: true, flash: 0, core: !!core, armored: false, touch: !!touch }; }
    function makeBoss(kind) {
      const B = { kind, x: W + 90, y: 108, t: 0, enter: true, tx: 316, phase: 1, cd: {}, angry: false, mode: "move", modeT: 0, parts: [], body: [], spin: 0, burst: 0, burstT: 0, dying: false, dieT: 0, hullY: 0, ph: 0, spinT: 0, spinCd: 0, shakeX: 0 };
      if (kind === "copier") {
        B.parts = [bpart("core", "출력구", -58, 2, 10, 15, 170, true), bpart("gun", "토너 포", -30, -52, 18, 7, 36), bpart("tray", "용지함", -22, 44, 26, 7, 36)];
        B.body = [[2, 0, 52, 44]]; B.tx = 306; B.cd = { a: 1.6, b: 2.6, c: 3.6 };
      } else if (kind === "robot") {
        B.parts = [bpart("core", "흡입구", -50, 6, 11, 11, 240, true), bpart("bt", "위 솔", -38, -50, 14, 14, 48, false, true), bpart("bb", "아래 솔", -38, 50, 14, 14, 48, false, true)];
        B.body = [[0, 0, 46, 38]]; B.tx = 300; B.cd = { a: 1.8, b: 2.4, c: 3.9, d: 6.5, e: 10 };
      } else if (kind === "thunder") {
        B.parts = [bpart("core", "회의실 창", -5, 0, 28, 17, 320, true), bpart("s1", "위 스피커", -64, -34, 9, 10, 58), bpart("s2", "아래 스피커", -64, 34, 9, 10, 58)];
        B.body = [[20, 4, 42, 46]]; B.tx = 296; B.cd = { a: 2.2, b: 3.4, c: 2.0, d: 3.3, e: 4 };
      } else {
        B.parts = [bpart("front", "앞 포탑", -100, 0, 12, 8, 90), bpart("pod", "미사일 포드", -10, -50, 16, 8, 90), bpart("eng", "프로펠러 엔진", 70, 34, 11, 12, 90), bpart("core", "야근 시계", 0, 40, 28, 9, 400, true)];
        B.parts[3].armored = true;
        B.body = [[30, -8, 118, 34]]; B.tx = 300; B.y = 92; B.cd = { a: 1.4, b: 2.6, c: 2.0, d: 3.0 };
      }
      B.maxHp = B.parts.reduce((s, p) => s + p.max, 0);
      S.banner = { big: "", sub: ST.bossName, tip: ST.bossTip, t: 3 };
      return B;
    }
    const bossHp = (B) => B.parts.reduce((s, p) => s + (p.alive ? Math.max(0, p.hp) : 0), 0);
    function damagePart(B, p, dmg) {
      if (!p.alive || p.armored || B.dying || B.enter) return;
      p.hp -= dmg; p.flash = 0.06;
      if (p.hp > 0) { sfx("hit", 0.09); return; }
      if (p.core) { bossDefeated(B); return; }
      p.alive = false;
      S.hitStop = 0.07;
      const bonus = 2000 * (S.stage + 1);
      addScore(bonus);
      boom(B.x + p.ox, B.y + p.oy, 2);
      ctx.sfx("explode"); S.shake = Math.max(S.shake, 3);
      popup(B.x + p.ox, B.y + p.oy - 10, `+${bonus}`, "#ffd166");
      note(`${p.name} 파괴! +${bonus.toLocaleString("ko-KR")}`, B.x + p.ox - 40, B.y + p.oy - 16, "#ffd166");
    }
    function bossDefeated(B) {
      B.dying = true; B.dieT = 0; S.pullNow = 0; S.hitStop = 0.14;
      for (const p of B.parts) p.alive = false;
      const bonus = 15000 * (S.stage + 1);
      addScore(bonus);
      popup(B.x, B.y - 30, `+${bonus}`, "#ffd166");
      for (const b of ES) b.on = false;
      for (const e of EN) if (e.on) { e.on = false; boom(e.x, e.y, 1); }
      for (const h of HZ) if (h.on && h.type === "bolt") h.on = false;
      Music.stop();
      ctx.sfx("explode");
      S.phase = "bossdown"; S.phaseT = 0; S.bossBonus = bonus;
      S.shake = 6;
    }
    function updateBossDown(dt) {
      const B = S.boss;
      if (!B) return;
      B.dieT += dt;
      B.y += 10 * dt;
      if (Math.random() < dt * 14) { boom(B.x + rnd(-60, 50), B.y + rnd(-44, 44), Math.random() < 0.3 ? 2 : 1); sfx("explode", 0.12); S.shake = Math.max(S.shake, 3); }
      if (B.dieT >= 2.4 && !B.gone) {
        B.gone = true;
        boom(B.x, B.y, 3); boom(B.x - 20, B.y + 10, 3); boom(B.x + 16, B.y - 14, 2);
        S.flash = 0.4; S.flashC = CREAM; S.shake = 8;
        ctx.sfx("explode");
      }
      if (B.dieT >= 3.2) {
        S.boss = null;
        startTally();
      }
    }
    function updateBoss(B, dt) {
      B.t += dt;
      for (const p of B.parts) if (p.flash > 0) p.flash -= dt;
      if (B.enter) {
        B.x += (B.tx - B.x) * Math.min(1, dt * 1.3);
        if (B.kind === "robot") B.y = 108;
        if (Math.abs(B.x - B.tx) < 1.5) { B.enter = false; B.t = 0; }
        return;
      }
      BOSS[B.kind](B, dt);
    }
    const ppos = (B, p) => [B.x + p.ox, B.y + p.oy];
    const BOSS = {
      copier(B, dt) {
        const [core, gun, tray] = B.parts, bs = ST.bs;
        B.y = 108 + Math.sin(B.t * 0.55) * 40;
        B.angry = core.hp < core.max * 0.5;
        const r = B.angry ? 0.72 : 1;
        if ((B.cd.a -= dt) <= 0) {
          B.cd.a = 2.5 * r;
          const [x, y] = ppos(B, core), k = B.angry ? 7 : 5;
          fan(x - 10, y, k, aimAt(x, y), 0.2, bs * 0.95, "sheet");
        }
        if (gun.alive && (B.cd.b -= dt) <= 0) { B.cd.b = 2.8 * r; B.burst = 3; B.burstT = 0; }
        if (B.burst > 0 && gun.alive) { B.burstT -= dt; if (B.burstT <= 0) { B.burstT = 0.16; B.burst--; const [x, y] = ppos(B, gun); eshot(x - 18, y, aimAt(x - 18, y), bs * 1.15, "orb"); } }
        if (tray.alive && (B.cd.c -= dt) <= 0) { B.cd.c = 4.6 * r; const [x, y] = ppos(B, tray); for (let i = 0; i < 2; i++) S.queue.push({ at: S.t + i * 0.35, type: "mini", x: x - 16, y, opt: {} }); }
      },
      robot(B, dt) {
        const [core, bt, bb] = B.parts, bs = ST.bs;
        B.angry = core.hp < core.max * 0.5;
        const r = B.angry ? 0.75 : 1;
        B.spin += dt * (B.mode === "dash" ? 16 : 7);
        B.shakeX = 0;
        const tuck = B.mode === "wind" || B.mode === "dash" || B.mode === "back";
        for (const p of [bt, bb]) { const want = Math.sign(p.oy) * (tuck ? 30 : 50); p.oy += clamp(want - p.oy, -60 * dt, 60 * dt); }
        const [cx, cy] = ppos(B, core);
        if (B.mode === "move") {
          B.y = clamp(B.y + clamp(S.py - B.y, -38 * dt, 38 * dt), 96, 120);
          B.x += (B.tx - B.x) * Math.min(1, dt * 2);
          if ((B.cd.a -= dt) <= 0) {
            B.cd.a = 2.7 * r;
            const n = 14, gap = Math.floor(rnd(0, n)), base = rnd(0, TAU);
            for (let i = 0; i < n; i++) { if ((i - gap + n) % n < 3) continue; eshot(cx, cy, base + (i / n) * TAU, bs * 0.8, "dust"); }
          }
          if (bt.alive && (B.cd.b -= dt) <= 0) { B.cd.b = 3.0 * r; const [x, y] = ppos(B, bt); fan(x - 8, y, 2, aimAt(x, y), 0.18, bs, "orb"); }
          if (bb.alive && (B.cd.c -= dt) <= 0) { B.cd.c = 3.0 * r; const [x, y] = ppos(B, bb); fan(x - 8, y, 2, aimAt(x, y), 0.18, bs, "orb"); }
          if ((B.cd.d -= dt) <= 0) { B.cd.d = 8.5 * r; B.mode = "wind"; B.modeT = 0.8; ctx.sfx("tick"); note("돌진해요!", B.x - 60, B.y - 30, "#ff9a7a"); }
          else if ((B.cd.e -= dt) <= 0) { B.cd.e = 11 * r; B.mode = "suck"; B.modeT = 3; B.suckCd = 0.6; ctx.sfx("whoosh"); note("빨아들여요 · 왼쪽으로 버텨요!", B.x - 90, B.y - 34, "#a8ffe6"); }
        } else if (B.mode === "wind") {
          B.modeT -= dt; B.shakeX = Math.sin(B.t * 70) * 1.5;
          if (B.modeT <= 0) { B.mode = "dash"; ctx.sfx("whoosh"); }
        } else if (B.mode === "dash") {
          B.x -= 250 * dt;
          if (B.x <= 150) { B.mode = "back"; for (let i = 0; i < 10; i++) eshot(cx, cy, (i / 10) * TAU, bs * 0.7, "dust"); }
        } else if (B.mode === "back") {
          B.x += 110 * dt;
          if (B.x >= B.tx) { B.x = B.tx; B.mode = "move"; }
        } else if (B.mode === "suck") {
          B.modeT -= dt;
          S.pullNow = 34;
          if (Math.random() < 0.7) part(cx - rnd(60, 200), cy + rnd(-60, 60), 0, 0, 0.6, "#9a90c4", 6);
          B.suckCd -= dt;
          if (B.suckCd <= 0) { B.suckCd = 0.9; fan(cx, cy, 3, aimAt(cx, cy), 0.28, bs * 0.65, "dust"); }
          if (B.modeT <= 0) { B.mode = "move"; S.pullNow = 0; }
        }
        if (B.mode !== "suck") S.pullNow = 0;
      },
      thunder(B, dt) {
        const [core, s1, s2] = B.parts, bs = ST.bs;
        B.angry = core.hp < core.max * 0.5;
        const r = B.angry ? 0.75 : 1;
        B.x = B.tx + Math.sin(B.t * 0.5) * 12; B.y = 104 + Math.sin(B.t * 0.85) * 34;
        if ((B.cd.a -= dt) <= 0) {
          B.cd.a = 4.4 * r;
          [S.px, S.px - 74, S.px + 74].forEach((x, i) => { if (x > 14 && x < W - 110) spawnBolt(x, 1.0 + i * 0.14); });
        }
        if ((B.cd.b -= dt) <= 0) { B.cd.b = 3.6 * r; for (let i = 0; i < 7; i++) eshot(rnd(14, 290), -4, Math.PI / 2 + rnd(-0.18, 0.18), bs * rnd(0.55, 0.75), "memo"); }
        if (s1.alive && (B.cd.c -= dt) <= 0) { B.cd.c = 2.6 * r; const [x, y] = ppos(B, s1); fan(x - 6, y, 5, aimAt(x, y), 0.17, bs, "orb"); }
        if (s2.alive && (B.cd.d -= dt) <= 0) { B.cd.d = 2.6 * r; const [x, y] = ppos(B, s2); fan(x - 6, y, 5, aimAt(x, y), 0.17, bs, "orb"); }
        if (B.angry) {
          if ((B.cd.e -= dt) <= 0) { B.cd.e = 6.5; B.spinT = 2.4; }
          if (B.spinT > 0) {
            B.spinT -= dt; B.spinCd -= dt;
            if (B.spinCd <= 0) { B.spinCd = 0.13; B.spin += 0.42; const [x, y] = ppos(B, core); for (let k = 0; k < 3; k++) { const a = B.spin + k * TAU / 3; if (Math.cos(a) < 0.3) eshot(x, y, a, bs * 0.8, "big"); } }
          }
        }
      },
      airship(B, dt) {
        const [front, pod, eng, core] = B.parts, bs = ST.bs;
        if (B.phase === 1) {
          B.x = B.tx + Math.sin(B.t * 0.4) * 6; B.y = 92 + Math.sin(B.t * 0.5) * 16;
          if (front.alive && (B.cd.a -= dt) <= 0) { B.cd.a = 1.9; const [x, y] = ppos(B, front); fan(x - 12, y, 3, aimAt(x, y), 0.22, bs * 1.05, "orb"); }
          if (pod.alive && (B.cd.b -= dt) <= 0) { B.cd.b = 4.4; const [x, y] = ppos(B, pod); for (let i = 0; i < 2; i++) S.queue.push({ at: S.t + i * 0.4, type: "clip", x: x - 10, y: y - 4 + i * 8, opt: { launch: true } }); }
          if (eng.alive && (B.cd.c -= dt) <= 0) { B.cd.c = 2.4; const [x, y] = ppos(B, eng); fan(x - 6, y, 4, Math.PI, 0.3, bs * 0.7, "big"); }
          if ((B.cd.d -= dt) <= 0) { B.cd.d = 3.2; const [x, y] = ppos(B, core); eshot(x - 10, y, aimAt(x - 10, y), bs * 0.9, "big"); }
          if (!front.alive && !pod.alive && !eng.alive) {
            B.phase = 1.5; B.modeT = 2.6; B.body = [];
            for (const b of ES) b.on = false;
            S.banner = { big: "", sub: "껍데기가 벗겨졌어요!", tip: "야근 시계를 노려요", t: 2.4 };
            ctx.sfx("explode"); S.shake = 5;
          }
        } else if (B.phase === 1.5) {
          B.modeT -= dt; B.hullY += 40 * dt;
          if (Math.random() < dt * 14) { boom(B.x + rnd(-80, 90), B.y + B.hullY + rnd(-24, 20), 1); sfx("explode", 0.15); }
          if (B.modeT <= 0) {
            B.phase = 2; core.armored = false; core.ox = 0; core.oy = 0; core.hw = 20; core.hh = 20;
            B.body = [[0, -36, 16, 12]]; B.ph = 0; B.cd = { a: 0.1, b: 1.6, c: 3, d: 7 }; B.spinT = 3;
            ctx.sfx("go");
          }
        } else {
          B.ph += dt * 0.7;
          B.x = 290 + Math.sin(B.ph) * 46; B.y = 112 + Math.sin(B.ph * 1.6) * 50;
          B.angry = core.hp < core.max * 0.35;
          B.spin += dt * (B.angry ? 2.5 : 1.9);
          if ((B.cd.c -= dt) <= 0) { B.cd.c = 6; B.spinT = 3; }
          if (B.spinT > 0) {
            B.spinT -= dt;
            if ((B.cd.a -= dt) <= 0) { B.cd.a = B.angry ? 0.09 : 0.12; const arms = B.angry ? 3 : 2; for (let k = 0; k < arms; k++) { const a = B.spin + k * TAU / arms; if (Math.cos(a) < 0.4) eshot(B.x, B.y, a, bs * 0.72, "orb"); } }
          }
          if ((B.cd.b -= dt) <= 0) { B.cd.b = B.angry ? 1.7 : 2.2; fan(B.x - 14, B.y, 5, aimAt(B.x, B.y), 0.2, bs, "big"); }
          if ((B.cd.d -= dt) <= 0) { B.cd.d = 9; spawnForm({ pat: "line", n: 4, y: clamp(S.py + rnd(-30, 30), 30, 186), shoot: 0.4 }); }
          if (B.angry) { B.cd.e = (B.cd.e || 2.6) - dt; if (B.cd.e <= 0) { B.cd.e = 2.6; for (let i = 0; i < 14; i++) eshot(B.x, B.y, (i / 14) * TAU + B.spin, bs * 0.6, "orb"); } }
        }
      },
    };

    // ---------- 스테이지 클리어 · 엔딩 ----------
    function startTally() {
      S.phase = "clear"; S.phaseT = 0;
      ctx.sfx("success");
      const n = S.stage + 1, lines = [];
      lines.push(["보스 격파", S.bossBonus || 15000 * n, true]);
      lines.push([`남은 목숨 ${S.lives} × 5,000`, S.lives * 5000, false]);
      lines.push(["노미스 보너스", S.nomiss ? 10000 : 0, false, !S.nomiss]);
      const last = S.stage === STAGES.length - 1;
      if (last) {
        lines.push([`모두 클리어 · 남은 목숨 ${S.lives} × 30,000`, S.lives * 30000, false]);
        lines.push([`남은 폭탄 ${S.bombs} × 5,000`, S.bombs * 5000, false]);
      }
      S.tally = { lines, shown: 0, t: 0, leaving: false, last, total: 0, disp: S.score };
    }
    function updateTally(dt) {
      const T = S.tally;
      T.t += dt;
      const want = Math.min(T.lines.length, Math.floor((T.t - 0.8) / 0.6) + 1);
      while (T.shown < want) {
        const ln = T.lines[T.shown++];
        ln.at = T.t;
        if (!ln[2]) addScore(ln[1]);
        T.total += ln[1];
        ctx.sfx(ln[3] ? "tick" : "coin");
      }
      T.disp += (S.score - T.disp) * Math.min(1, dt * 5);
      if (T.shown && T.t - T.lines[T.shown - 1].at < 0.45 && Math.floor(T.t * 30) % 2 === 0) sfx("tick", 0.05);
      const endAt = 0.8 + T.lines.length * 0.6 + 2.2;
      if (T.t >= endAt - 1 && !T.leaving) { T.leaving = true; if (!T.last) sfx("whoosh"); }
      if (T.t >= endAt) {
        if (T.last) { S.phase = "ending"; S.endT = 0; S.cleared = true; Music.play("sunset"); ctx.sfx("win"); S.alive = true; S.px = -20; S.py = 120; clearPool(PS); clearPool(IT); }
        else initStage(S.stage + 1);
      }
    }

    // ---------- 그리기 ----------
    function rect(x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
    function disc(cx, cy, r, c) { discG(g, cx, cy, Math.max(1, Math.round(r)), c); }
    function ringPx(cx, cy, r, c) {
      g.fillStyle = c;
      const n = Math.max(10, Math.round(r * 5));
      for (let i = 0; i < n; i++) { const a = (i / n) * TAU; g.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 1, 1); }
    }
    function linePx(x0, y0, x1, y1, c, s) {
      g.fillStyle = c;
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
      for (let i = 0; i <= n; i++) g.fillRect(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), s || 1, s || 1);
    }
    function blit(c, x, y) { g.drawImage(c, Math.round(x - c.width / 2), Math.round(y - c.height / 2)); }
    function glow(x, y, color, r, a) { g.globalAlpha = a; g.drawImage(glowSpr(color, r), Math.round(x - r), Math.round(y - r)); }
    const layerX = (lx, f, scroll) => { let x = (lx - scroll * f) % LW; if (x < -40) x += LW; return x; };
    function drawBG(bg, scroll, t) {
      g.drawImage(bg.sky, 0, 0);
      const flash = S && S.lightning > 0 && bg.lit;
      bg.layers.forEach((L, i) => {
        const off = Math.round(scroll * L.f) % LW;
        const c = flash && i === 0 ? bg.lit.c : L.c;
        g.drawImage(c, -off, 0);
        if (LW - off < W) g.drawImage(c, LW - off, 0);
        // 살아 있는 배경 요소 — 그 겹과 같은 속도로
        if (i === 2 || (bg.theme === "duct" && i === 3)) {
          for (const [lx, ly, f, col] of bg.dyn.blinks) if (Math.abs(f - L.f) < 0.01) { const x = layerX(lx, f, scroll); if (x > -4 && x < W + 4 && Math.floor(t * 1.5 + lx) % 3 === 0) rect(x, ly, 1, 1, col); }
          for (const [lx, ly, r, f] of bg.dyn.fans) if (Math.abs(f - L.f) < 0.01) {
            const x = layerX(lx, f, scroll);
            if (x < -30 || x > W + 30) continue;
            for (let k = 0; k < 4; k++) { const a = t * 2.2 + (k * TAU) / 4; linePx(x, ly, x + Math.cos(a) * r, ly + Math.sin(a) * r, PAL.duct.metal[2], 2); linePx(x + Math.cos(a + 0.12) * 4, ly + Math.sin(a + 0.12) * 4, x + Math.cos(a + 0.12) * (r - 2), ly + Math.sin(a + 0.12) * (r - 2), PAL.duct.metal[3], 1); }
            disc(x, ly, 4, PAL.duct.metal[1]); disc(x, ly, 2, PAL.duct.metal[3]);
          }
        }
        if (bg.theme === "sunset" && i === 3 && S) drawTrain(scroll, t);
      });
      if (bg.theme === "sky" || bg.theme === "sunset") drawBirds(t, bg.theme);
      if (bg.theme === "sky") drawPlane(t);
      if (bg.theme === "storm" && S && S.lightning > 0) {
        let x = S.lightX, y = 0;
        while (y < 110) { const nx = x + rnd(-7, 7), ny = y + rnd(6, 12); linePx(x, y, nx, ny, PAL.storm.bolt); x = nx; y = ny; }
      }
    }
    function drawBirds(t, theme) {
      const col = theme === "sky" ? "#2c3874" : "#1a1033";
      const cyc = (t * 22) % 900, bx = W + 40 - cyc;
      if (bx < -60) return;
      for (let i = 0; i < 5; i++) {
        const x = bx + i * 9 + (i % 2) * 3, y = 54 + Math.abs(i - 2) * 5 + Math.sin(t * 2 + i) * 2, up = Math.floor(t * 6 + i) % 2;
        rect(x, y, 1, 1, col); rect(x - 1, y - up, 1, 1, col); rect(x + 1, y - up, 1, 1, col); rect(x - 2, y - 1 + up, 1, 1, col); rect(x + 2, y - 1 + up, 1, 1, col);
      }
    }
    function drawPlane(t) {
      const cyc = (t * 9) % 700, x = cyc - 40, y = 26;
      if (x > W + 20) return;
      rect(x - 30, y + 1, 30, 1, "rgba(255,246,224,.55)");
      rect(x, y, 6, 2, "#d4f1ff"); rect(x + 2, y - 1, 2, 1, "#d4f1ff"); rect(x + 2, y + 2, 2, 1, "#9fdcff");
    }
    function drawTrain(scroll, t) {
      const y = BG.dyn.track - 6, x = W + 60 - ((t * 60 + 200) % 900);
      if (x < -120 || x > W + 10) return;
      for (let i = 0; i < 4; i++) {
        const cx = x + i * 26;
        rect(cx, y, 24, 6, "#45407a"); rect(cx, y, 24, 1, "#ff7f50"); rect(cx + 23, y, 1, 6, "#ff7f50");
        for (let k = 0; k < 5; k++) rect(cx + 2 + k * 4, y + 2, 2, 2, "#ffe0a3");
      }
    }
    function drawFG(bg, scroll) {
      if (!bg.fg) return;
      const off = Math.round(scroll * bg.fg.f) % LW;
      g.drawImage(bg.fg.c, -off, 0);
      if (LW - off < W) g.drawImage(bg.fg.c, LW - off, 0);
    }
    function drawTerrain() {
      const sx = Math.round(S.scroll);
      g.drawImage(TER.cv, sx, 0, W + 2, H, 0, 0, W + 2, H);
    }
    const scr = (wx) => Math.round(wx) - Math.round(S.scroll);
    function drawHazards() {
      for (const h of HZ) {
        if (!h.on) continue;
        if (h.type === "gate") {
          const x = scr(h.wx);
          const R = ST.theme === "sunset" ? RAMP.wood : RAMP.steel;
          for (const [rx, ry, rw, rh] of gateRects(h)) {
            if (rh <= 0) continue;
            rect(x - 9, ry, 18, rh, R[0]);
            rect(x - 8, ry, 16, rh, R[2]);
            rect(x - 8, ry, 3, rh, R[3]); rect(x - 8, ry, 1, rh, R[4]);
            rect(x + 6, ry, 2, rh, R[1]);
            for (let y = Math.ceil(ry / 8) * 8; y < ry + rh; y += 8) { rect(x - 5, y, 10, 1, R[1]); rect(x - 5, y + 1, 10, 1, R[3]); }
          }
          const gh = h.o.gap / 2;
          for (let i = -8; i < 8; i += 4) { rect(x + i, h.gy - gh - 3, 2, 3, "#ffcc33"); rect(x + i + 2, h.gy - gh - 3, 2, 3, DEEP); rect(x + i, h.gy + gh, 2, 3, "#ffcc33"); rect(x + i + 2, h.gy + gh, 2, 3, DEEP); }
        } else if (h.type === "ductfan") {
          const x = scr(h.wx), y = h.y, M = PAL.duct.metal;
          ringPx(x, y, h.r + 4, M[1]); ringPx(x, y, h.r + 3, M[4]); ringPx(x, y, h.r + 2, M[2]);
          for (let k = 0; k < 3; k++) {
            const a = h.a + (k * TAU) / 3;
            // 잔상(움직임 흐림)
            for (let t = 6; t < h.r; t += 2) { const pa = a - 0.22 * Math.sign(h.w); rect(x + Math.cos(pa) * t, y + Math.sin(pa) * t, 1, 1, M[2]); }
            for (let t = 4; t < h.r; t += 1) { const w = t < h.r * 0.7 ? 3 : 2; rect(x + Math.cos(a) * t - 1, y + Math.sin(a) * t - 1, w, w, M[4]); }
            linePx(x + Math.cos(a + 0.1) * 5, y + Math.sin(a + 0.1) * 5, x + Math.cos(a + 0.06) * (h.r - 1), y + Math.sin(a + 0.06) * (h.r - 1), M[5]);
          }
          disc(x, y, 5, M[0]); disc(x, y, 3, "#ffcc33"); rect(x - 1, y - 2, 1, 1, CREAM);
        } else if (h.type === "bolt") {
          if (!h.struck) {
            if (Math.floor(h.t * 12) % 2 === 0) for (let y = 0; y < h.bot; y += 6) rect(h.x, y, 1, 3, "#ff4f9a");
            disc(h.x, 4, 6, "#24346e"); disc(h.x, 3, 4, "#3c5a99");
          } else {
            for (let i = 1; i < h.pts.length; i++) { const [x0, y0] = h.pts[i - 1], [x1, y1] = h.pts[i]; linePx(x0 - 1, y0, x1 - 1, y1, "#7aa2d6", 3); linePx(x0, y0, x1, y1, PAL.storm.bolt, 1); }
          }
        }
      }
    }
    const tele = (on) => on && Math.floor(S.t * 16) % 2 === 0; // 공격 예고 — 핫핑크 번쩍임
    function drawEnemy(e) {
      const f = e.flash > 0;
      switch (e.type) {
        case "drone": {
          const warn = e.fireAt && e.fireAt - e.t < 0.35;
          blit(f ? A.droneW : tele(warn) ? A.droneP : A.drone[Math.floor(e.t * 14) % 2], e.x, e.y); break;
        }
        case "clip": blit(f ? A.clipW : tele(e.mode === 0) ? A.clipP : A.clip, e.x, e.y); break;
        case "fan": {
          const R = RAMP.steel, warn = tele(e.cd < 0.3);
          rect(e.x - 1, e.y + 11, 3, 6, R[1]); rect(e.x - 5, e.y + 16, 11, 2, R[2]); rect(e.x - 5, e.y + 16, 11, 1, R[3]);
          ringPx(e.x, e.y, 11, f ? CREAM : R[0]); ringPx(e.x, e.y, 10, f ? CREAM : R[3]); ringPx(e.x, e.y, 9, f ? CREAM : R[2]);
          for (let k = 0; k < 3; k++) { const a = e.a + (k * TAU) / 3; linePx(e.x + Math.cos(a) * 2, e.y + Math.sin(a) * 2, e.x + Math.cos(a) * 8, e.y + Math.sin(a) * 8, f ? CREAM : warn ? "#ff4f9a" : RAMP.coral[2], 2); linePx(e.x + Math.cos(a - 0.3) * 4, e.y + Math.sin(a - 0.3) * 4, e.x + Math.cos(a - 0.2) * 8, e.y + Math.sin(a - 0.2) * 8, RAMP.coral[1], 1); }
          disc(e.x, e.y, 2, f ? CREAM : RAMP.coral[3]);
          break;
        }
        case "turret": {
          const warn = tele(e.cd < 0.35);
          const top = e.side > 0;
          linePx(e.x, e.y, e.x + Math.cos(e.a) * 9, e.y + Math.sin(e.a) * 9, f ? CREAM : RAMP.steel[3], 2);
          const art = top ? (f ? A.turretW : warn ? A.turretP : A.turret) : (f ? A.turretDW : warn ? A.turretDP : A.turretD);
          g.drawImage(art, Math.round(e.x - art.width / 2), top ? e.base - art.height + 1 : e.base - 1);
          break;
        }
        case "punch": {
          const s = e.side, by = e.base;
          const shake = e.mode === 1 ? Math.round(Math.sin(e.t * 80)) : 0;
          const R = RAMP.steel;
          rect(e.x - 8 + shake, s > 0 ? by - 6 : by, 16, 6, R[1]); rect(e.x - 8 + shake, s > 0 ? by - 6 : by + 5, 16, 1, R[3]);
          const from = s > 0 ? by - 6 : by + 6, n = Math.abs(from - e.y);
          for (let i = 0; i < n - 4; i += 2) { rect(e.x + ((i >> 1) % 2 ? 1 : -3) + shake, from - s * i, 3, 1, R[3]); rect(e.x + ((i >> 1) % 2 ? 1 : -3) + shake, from - s * i + 1, 3, 1, R[1]); }
          const warn = tele(e.mode === 1);
          blit(f ? (s > 0 ? A.gloveW : A.gloveDW) : warn ? (s > 0 ? A.gloveP : A.gloveDP) : (s > 0 ? A.glove : A.gloveD), e.x + shake, e.y);
          break;
        }
        case "hopper": blit(f ? A.hopperW : tele(!e.air && e.cd < 0.3) ? A.hopperP : A.hopper, e.x, e.y); break;
        case "balloon": blit(f ? A.balloonW : A.balloon, e.x, e.y); if (e.item && !f) blit(A.items[e.item], e.x, e.y + 19); break;
        case "snake": {
          for (let i = e.seg.length - 1; i >= 0; i--) blit(A.seg[i % 2], e.seg[i][0], e.seg[i][1]);
          blit(f ? A.headW : Math.cos(e.a) > 0 ? A.headR : A.head, e.x, e.y);
          break;
        }
        case "mini": blit(f ? A.miniW : A.mini, e.x, e.y); break;
      }
    }
    function partArt(B, id, base) {
      const p = B.parts.find((q) => q.id === id);
      if (!p) return null;
      if (!p.alive) return A[base + "X"];
      return p.flash > 0 ? A[base + "W"] : A[base];
    }
    function drawBoss(B) {
      if (!B || B.gone) return;
      const fl = (id) => { const p = B.parts.find((q) => q.id === id); return p && p.flash > 0; };
      const pt = (id) => B.parts.find((q) => q.id === id);
      const x = Math.round(B.x + (B.shakeX || 0) + (B.dying ? Math.sin(B.dieT * 50) * 2 : 0)), y = Math.round(B.y);
      if (B.kind === "copier") {
        for (const px of [x - 30, x + 30]) { rect(px - 1, y - 56, 2, 8, RAMP.steel[1]); const w = Math.abs(Math.round(Math.sin(B.t * 30) * 12)); rect(px - w, y - 58, w * 2 + 1, 2, RAMP.steel[3]); }
        blit(A.copier, x, y);
        // 화면 얼굴
        const sx = x + 7, sy = y - 21;
        rect(sx, sy, 34, 18, B.angry ? "#ff4f6a" : "#3dffd0");
        rect(sx, sy, 34, 1, B.angry ? "#ffb3c0" : "#a8ffe6");
        const blink = Math.floor(B.t * 2) % 7 === 0;
        rect(sx + 6, sy + 5, 5, blink ? 1 : 4, DEEP); rect(sx + 22, sy + 5, 5, blink ? 1 : 4, DEEP);
        if (B.angry) { rect(sx + 5, sy + 3, 7, 1, DEEP); rect(sx + 21, sy + 3, 7, 1, DEEP); }
        rect(sx + 12, sy + 13, 10, 1, DEEP);
        // 출력구(약점) — 종이가 펄럭인다
        const flap = Math.round(Math.sin(B.t * 6) * 2);
        const warn = tele(B.cd.a < 0.35);
        blit(fl("core") ? whiteOf(A.paperTongue) : A.paperTongue, x - 62, y + 2 + flap);
        if (warn) rect(x - 56, y - 14, 4, 30, "#ff4f9a");
        const gun = partArt(B, "gun", "copierGun"); if (gun) blit(gun, x - 30, y - 52);
        const tray = partArt(B, "tray", "copierTray"); if (tray) blit(tray, x - 22, y + 44);
      } else if (B.kind === "robot") {
        const fold = B.mode === "dash" || B.mode === "wind";
        for (const id of ["bt", "bb"]) {
          const p = pt(id), bx = x + p.ox, by = y + p.oy;
          linePx(x - 6, y + Math.sign(p.oy) * 30, bx + 6, by, RAMP.steel[1], 4); linePx(x - 6, y + Math.sign(p.oy) * 30, bx + 6, by, RAMP.steel[3], 1);
          if (!p.alive) { disc(bx, by, 7, "#2a2346"); continue; }
          const c1 = p.flash > 0 ? CREAM : RAMP.green[2], c2 = p.flash > 0 ? CREAM : RAMP.green[3], c0 = RAMP.green[0];
          disc(bx, by, 15, c0); disc(bx, by, 13, RAMP.green[1]);
          for (let k = 0; k < 16; k++) { const a = B.spin + (k / 16) * TAU; rect(bx + Math.cos(a) * 12 - 1, by + Math.sin(a) * 12 - 1, 3, 3, k % 2 ? c1 : c2); }
          disc(bx, by, 4, "#ffcc33"); rect(bx - 1, by - 2, 1, 1, CREAM);
        }
        void fold;
        blit(A.robot, x, y);
        const look = clamp((S.py - y) / 40, -1, 1) * 3;
        rect(x - 18, y - 22 + look, 6, 6, DEEP); rect(x + 8, y - 22 + look, 6, 6, DEEP);
        rect(x - 17, y - 21 + look, 2, 2, CREAM); rect(x + 9, y - 21 + look, 2, 2, CREAM);
        // 흡입구(약점)
        const c = pt("core"), mx = x + c.ox, my = y + c.oy;
        disc(mx, my, 13, RAMP.steel[0]); disc(mx, my, 11, RAMP.steel[2]); disc(mx, my, 8, B.mode === "suck" ? "#0b111b" : c.flash > 0 ? CREAM : "#2a1f3a");
        if (B.mode === "suck") ringPx(mx, my, 9 + ((B.t * 20) % 5), "#9fc2cc");
        if (tele(B.mode === "wind")) disc(mx, my, 5, "#ff4f9a");
        if (Math.floor(B.t * 20) % 2) { rect(x + 48, y - 14, 5, 6, "#ff7f50"); rect(x + 48, y + 8, 5, 6, "#ffd166"); }
      } else if (B.kind === "thunder") {
        blit(A.thunder, x, y);
        // 회의실 창(약점)
        const c = pt("core"), wx = x - 33, wy = y - 17;
        rect(wx, wy, 56, 34, c.flash > 0 ? CREAM : B.angry ? "#ffb3c0" : "#cfe3ff");
        rect(wx, wy, 56, 2, CREAM);
        rect(wx + 6, wy + 22, 44, 5, "#985826"); rect(wx + 6, wy + 22, 44, 1, "#cf8a44");
        for (let i = 0; i < 5; i++) { rect(wx + 8 + i * 9, wy + 14 + (Math.floor(B.t * 3 + i) % 2), 5, 7, "#53517e"); rect(wx + 9 + i * 9, wy + 11 + (Math.floor(B.t * 3 + i) % 2), 3, 3, "#c6b2a2"); }
        rect(wx + 27, wy, 2, 34, "#53517e");
        const lamp = Math.floor(B.t * 3) % 2 ? "#ff4f6a" : "#7a1240";
        rect(x - 13, y - 43, 30, 10, lamp); rect(x - 13, y - 43, 30, 1, "#ffb3c0");
        for (const id of ["s1", "s2"]) {
          const p = pt(id), art = partArt(B, id, "speaker");
          blit(art, x + p.ox, y + p.oy);
          if (p.alive) ringPx(x + p.ox - 1, y + p.oy, 3 + (Math.floor(B.t * 8) % 3), "#7aa2d6");
        }
        if (Math.random() < 0.1) { const a = rnd(0, TAU); linePx(x + Math.cos(a) * 46, y + Math.sin(a) * 40, x + Math.cos(a) * 62, y + Math.sin(a) * 54, PAL.storm.bolt); }
      } else {
        const hy = y + Math.round(B.hullY);
        if (B.phase < 2) {
          g.globalAlpha = B.phase === 1.5 ? clamp(B.modeT / 2.6, 0, 1) : 1;
          blit(A.hull, x + 30, hy - 8);
          blit(A.gondola, x, hy + 40);
          for (let i = 0; i < 6; i++) rect(x - 22 + i * 8, hy + 37, 5, 5, Math.floor(B.t * 2 + i) % 3 ? "#ffd166" : "#ff7f50");
          const fr = partArt(B, "front", "front"); if (fr) blit(fr, x - 100, hy);
          const pd = partArt(B, "pod", "pod"); if (pd) blit(pd, x - 10, hy - 50);
          const en = partArt(B, "eng", "engine"); if (en) blit(en, x + 70, hy + 34);
          if (pt("eng").alive) { const w = Math.abs(Math.round(Math.sin(B.t * 28) * 12)); rect(x + 82, hy + 34 - w, 2, w * 2 + 1, RAMP.steel[4]); }
          g.globalAlpha = 1;
        }
        if (B.phase >= 1.5) {
          const cx = B.phase === 2 ? x : x, cy = B.phase === 2 ? y : y + 40;
          if (B.phase === 2) { blit(A.miniBalloon, cx, cy - 36); linePx(cx - 6, cy - 24, cx - 3, cy - 18, RAMP.steel[2]); linePx(cx + 6, cy - 24, cx + 3, cy - 18, RAMP.steel[2]); }
          const p = pt("core");
          blit(p.flash > 0 ? A.clockW : A.clock, cx, cy);
          linePx(cx, cy, cx + Math.cos(B.t * 6) * 12, cy + Math.sin(B.t * 6) * 12, DEEP, 1);
          linePx(cx, cy, cx + Math.cos(B.t * 0.8) * 8, cy + Math.sin(B.t * 0.8) * 8, "#e0304a", 2);
          rect(cx - 8, cy - 7, 5, 1, DEEP); rect(cx + 4, cy - 7, 5, 1, DEEP);
          if (B.angry) { rect(cx - 8, cy - 9, 5, 1, "#e0304a"); rect(cx + 4, cy - 9, 5, 1, "#e0304a"); }
        }
      }
    }
    function drawPlayer() {
      if (!S.alive) return;
      if (S.invul > 0 && S.phase !== "clear" && Math.floor(S.t * 16) % 2 === 0) return;
      const art = A.ships[S.ship];
      const fr = S.tilt < -0.35 ? art.up : S.tilt > 0.35 ? art.down : art.mid;
      // 시그니처 민트 꼬리 바람
      for (let i = 0; i < 4; i++) rect(S.px - 16 - i * 3 - (Math.floor(S.t * 30 + i) % 2), S.py + 1, 2, 1, i < 2 ? "#3dffd0" : "#13917f");
      blit(fr, S.px, S.py);
      if (S.shield) { const r = 15 + Math.round(Math.sin(S.t * 6)); ringPx(S.px, S.py, r, "#9cf59a"); ringPx(S.px, S.py, r - 1, "#3cdc6a"); }
      if (S.charge > 0.12) {
        const c = S.charge, nx = S.px + 17;
        if (c >= 1) { const r = 3 + (Math.floor(S.t * 20) % 2); disc(nx, S.py, r + 1, "#3dffd0"); disc(nx, S.py, r, CREAM); }
        else if (Math.random() < c) { const a = rnd(0, TAU); part(nx + Math.cos(a) * 14, S.py + Math.sin(a) * 14, -Math.cos(a) * 60, -Math.sin(a) * 60, 0.22, "#a8ffe6", 1); }
      }
    }
    function drawOptions() {
      if (!S.alive) return;
      for (let i = 0; i < S.options; i++) { const [ox, oy] = optionPos(i); blit(A.crane[Math.floor(S.t * 8 + i) % 2], ox, oy + Math.sin(S.t * 5 + i) * 1.5); }
    }
    function drawShots() {
      for (const p of PS) {
        if (!p.on) continue;
        if (p.big) {
          const hw = p.hw, hh = p.hh, x = Math.round(p.x), y = Math.round(p.y);
          for (let i = -hh; i <= hh; i++) { const w = Math.round(hw * 2 * (1 - Math.abs(i) / (hh + 1))); rect(x + hw - w, y + i, w, 1, Math.abs(i) < hh / 3 ? CREAM : Math.abs(i) < hh * 0.7 ? "#a8ffe6" : "#3dffd0"); }
          rect(x - hw - 6, y - 1, hw + 6, 2, "rgba(61,255,208,.5)");
        } else if (p.look === 1) { rect(p.x - 5, p.y - 2, 11, 4, "#13917f"); rect(p.x - 4, p.y - 1, 10, 2, "#3dffd0"); rect(p.x - 2, p.y - 1, 7, 1, CREAM); }
        else if (p.look === 2) { rect(p.x - 3, p.y - 1, 6, 2, "#6aa8ff"); rect(p.x - 2, p.y - 1, 5, 1, "#f0f6ff"); }
        else { rect(p.x - 4, p.y - 1, 9, 3, "#13917f"); rect(p.x - 3, p.y, 8, 1, CREAM); rect(p.x + 3, p.y - 1, 2, 3, "#3dffd0"); }
      }
    }
    function drawEnemyShots() { for (const b of ES) if (b.on) blit(A.bul[b.kind].c, b.x, b.y); }
    function drawItems() {
      for (const it of IT) {
        if (!it.on) continue;
        if (it.x < 30 && Math.floor(it.t * 10) % 2) continue;
        blit(A.items[it.kind], it.x, it.y);
        if (Math.floor(it.t * 3) % 4 === 0) rect(it.x - 4, it.y - 5, 2, 2, CREAM);
      }
    }
    const PAPER = [CREAM, "#ffe0a3", "#ffd166", "#bcdcff", "#ffb3d1", "#d2d6ee"];
    function drawParticles() {
      for (const p of PT) {
        if (!p.on) continue;
        const k = p.life / p.max;
        if (p.k === 0) { const flip = Math.floor(p.life * 12) % 2; rect(p.x, p.y, flip ? 2 : 1, flip ? 1 : 2, p.c); }
        else if (p.k === 1) rect(p.x, p.y, 1, 1, p.c);
        else if (p.k === 2) ringPx(p.x, p.y, Math.max(1, p.s * (1 - k)), p.c);
        else if (p.k === 4) { if (Math.floor(p.life * 20) % 2) { rect(p.x - 1, p.y, 3, 1, p.c); rect(p.x, p.y - 1, 1, 3, p.c); } }
        else if (p.k === 5) disc(p.x, p.y, p.s * (0.6 + k * 0.4), p.c);
        else if (p.k === 6) { const B = S.boss; if (B) { const c = B.parts[0]; p.x += (B.x + c.ox - p.x) * 0.06; p.y += (B.y + c.oy - p.y) * 0.06; } rect(p.x, p.y, 2, 1, p.c); }
        else if (p.k === 7) { g.globalAlpha = Math.min(1, k * 2) * 0.8; disc(p.x, p.y, p.s * (1.4 - k), p.c); g.globalAlpha = 1; }
      }
      for (const p of POP) if (p.on) stext(g, p.text, p.x, p.y, p.c, "center", DEEP);
    }
    function drawAmbient() {
      for (const a of S.amb) {
        if (a.kind === 0) { const f = Math.floor(a.t * 4) % 2; rect(a.x, a.y, f ? 3 : 2, f ? 2 : 3, "rgba(255,246,224,.85)"); }
        else rect(a.x, a.y, 1, 1, a.c);
      }
    }
    function drawRain() {
      if (!RAIN[0].on) return;
      g.fillStyle = rgba(PAL.storm.rain, 0.55);
      for (const r of RAIN) if (r.on) for (let i = 0; i < r.l; i++) g.fillRect(Math.round(r.x - i * 0.3), Math.round(r.y - i), 1, 1);
    }
    // 빛 번짐 — 탄 · 폭발 · 아이템 · 약점 · 꼬리 바람
    function drawGlows(t) {
      g.globalCompositeOperation = "lighter";
      for (const b of ES) if (b.on) glow(b.x, b.y, A.bul[b.kind].gl, b.kind === "big" ? 9 : 7, 0.55);
      for (const p of PS) if (p.on) { if (p.big) glow(p.x, p.y, "#3dffd0", p.big === 2 ? 26 : 16, 0.6); else glow(p.x, p.y, p.look === 2 ? "#6aa8ff" : "#3dffd0", 5, 0.4); }
      for (const it of IT) if (it.on) glow(it.x, it.y, ITEMS[it.kind].c, 13, 0.4 + Math.sin(it.t * 6) * 0.15);
      for (const p of PT) if (p.on) { if (p.k === 5) glow(p.x, p.y, "#ffd166", p.s * 5 + 6, 0.7); else if (p.k === 4) glow(p.x, p.y, p.c, 5, 0.45); }
      if (S.alive && S.phase !== "ending") {
        glow(S.px - 20, S.py + 1, "#3dffd0", 8, 0.35);
        if (S.charge > 0.12) glow(S.px + 17, S.py, "#3dffd0", 6 + S.charge * 12, 0.3 + S.charge * 0.4);
        if (S.shield) glow(S.px, S.py, "#3cdc6a", 18, 0.18);
      }
      const B = S.boss;
      if (B && !B.dying && !B.gone) {
        const c = B.parts.find((p) => p.core);
        if (c && !c.armored) glow(B.x + c.ox, B.y + c.oy, "#ff4f9a", 22, 0.22 + Math.sin(t * 5) * 0.12);
        if (B.kind === "robot" && Math.floor(B.t * 20) % 2) glow(B.x + 50, B.y, "#ff7f50", 14, 0.4);
      }
      for (const [lx, ly, col] of TER.lamps) { const x = lx - Math.round(S.scroll); if (x < -10 || x > W + 10) continue; if (Math.floor(t * 1.6 + lx * 0.01) % 2 === 0) { rect(x, ly, 2, 2, col); glow(x + 1, ly + 1, col, 9, 0.55); } }
      for (const h of HZ) if (h.on && h.type === "bolt" && h.struck) for (let i = 0; i < h.pts.length; i += 3) glow(h.pts[i][0], h.pts[i][1], "#cfe3ff", 12, 0.5);
      g.globalAlpha = 1;
      g.globalCompositeOperation = "source-over";
    }
    function grade(bg) {
      g.globalCompositeOperation = "multiply";
      g.fillStyle = bg.tint; g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = "source-over";
      g.drawImage(bg.grade, 0, 0);
    }
    function bar(x, y, w, h, k, lag, c1, c2) {
      rect(x - 2, y - 2, w + 4, h + 4, DEEP);
      rect(x - 1, y - 1, w + 2, h + 2, "#53517e");
      rect(x, y, w, h, "#231a4a");
      if (lag > k) rect(x, y, Math.round(w * clamp(lag, 0, 1)), h, CREAM);
      const fw = Math.round(w * clamp(k, 0, 1));
      rect(x, y, fw, Math.ceil(h / 2), c1); rect(x, y + Math.ceil(h / 2), fw, Math.floor(h / 2), c2);
    }
    const ease = (k) => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
    function drawOverlayLow() {
      const B = S.boss;
      if (B && !B.dying && S.phase === "boss") {
        const k = bossHp(B) / B.maxHp;
        B.lag = B.lag == null ? k : Math.max(k, B.lag - 0.004);
        bar(92, 6, 200, 4, k, B.lag, "#ffb26b", "#ff4f6a");
      }
      if (S.alive && S.phase !== "ending" && S.phase !== "clear") {
        const full = S.charge >= 1;
        bar(8, H - 9, 44, 3, S.charge, 0, full ? (Math.floor(S.t * 10) % 2 ? CREAM : "#3dffd0") : "#a8ffe6", full ? "#3dffd0" : "#13917f");
        rect(8 + 22, H - 10, 1, 5, "#9298c4");
      }
      if (S.banner && S.banner.big) {
        const b = S.banner, age = b.len - b.t;
        const open = ease(age / 0.25), shut = b.t < 0.3 ? ease(b.t / 0.3) : 1;
        const hh = Math.round(22 * open * shut);
        if (hh > 0) {
          rect(0, 96 - hh, W, hh * 2, "rgba(20,12,42,.78)");
          rect(0, 96 - hh, W, 1, "#ffd166"); rect(0, 95 + hh, W, 1, "#ffd166");
          for (let i = 0; i < 8; i++) { const lx = (W + 40) - ((age * 260 + i * 57) % (W + 80)); rect(lx, 96 - hh + 3 + ((i * 7) % (hh * 2 - 6 || 1)), 18, 1, "rgba(255,209,102,.35)"); }
          const tx = W / 2 + (1 - ease(age / 0.45)) * 220 - (b.t < 0.3 ? (1 - b.t / 0.3) * 220 : 0);
          ptext(g, b.big, tx, 84, 3, [CREAM, "#ffb26b"], "#3a1c5c", "center");
        }
      }
      if (S.phase === "warning") {
        const p = S.phaseT, on = Math.floor(p * 4) % 2 === 0;
        g.globalAlpha = 0.18 + Math.sin(p * 8) * 0.08; rect(0, 0, W, H, "#ff2a5a"); g.globalAlpha = 1;
        for (const yy of [0, H - 14]) {
          rect(0, yy, W, 14, "#7a1240");
          const dir = yy ? -1 : 1;
          for (let x = ((p * 80 * dir) % 24) - 24; x < W + 24; x += 24) { g.fillStyle = "#ff4f6a"; for (let i = 0; i < 10; i++) g.fillRect(Math.round(x + i), yy + 2 + i, 8, 1); }
          rect(0, yy, W, 1, "#ffb3c0"); rect(0, yy + 13, W, 1, "#3a0a24");
        }
        rect(0, 78, W, 36, "rgba(58,10,36,.82)");
        rect(0, 78, W, 1, "#ff4f6a"); rect(0, 113, W, 1, "#ff4f6a");
        if (on) ptext(g, "WARNING", W / 2, 85, 3, ["#ffd0d8", "#ff4f6a"], "#3a0a24", "center");
      }
      if (S.phase === "clear" && S.tally) {
        rect(0, 24, W, 162, "rgba(20,12,42,.78)");
        rect(0, 24, W, 1, "#ffd166"); rect(0, 185, W, 1, "#ffd166");
        ptext(g, S.tally.last ? "ALL CLEAR" : "STAGE CLEAR", W / 2, 34, 2, [CREAM, "#ffb26b"], "#3a1c5c", "center");
      }
      if (S.phase === "gameover") {
        rect(0, 82, W, 34, "rgba(20,12,42,.8)");
        ptext(g, "GAME OVER", W / 2, 88, 3, ["#e6e2ff", "#9298c4"], "#140c2a", "center");
      }
    }
    function drawEnding() {
      const k = Math.min(1, S.endT / 8);
      const art = A.ships[S.ship].mid;
      const x = -20 + k * 270, y = 124 - Math.sin(k * Math.PI) * 34 - k * 22;
      const hx = 296, hy = 104, b = PAL.sunset.bld;
      rect(hx, hy, 52, H - hy, b[1]); rect(hx, hy, 52, 1, "#ffb26b"); rect(hx + 51, hy, 1, H - hy, "#ff7f50"); rect(hx, hy, 2, H - hy, b[2]);
      for (let r = 0; r < 13; r++) for (let c = 0; c < 6; c++) { const home = r === 3 && c === 3; rect(hx + 4 + c * 8, hy + 6 + r * 8, 4, 4, home ? (Math.floor(S.t * 2) % 2 ? CREAM : "#ffd166") : (r * 6 + c) % 3 ? b[2] : "#ffb26b"); }
      g.globalCompositeOperation = "lighter"; glow(hx + 30, hy + 32, "#ffd166", 16, 0.6); g.globalCompositeOperation = "source-over"; g.globalAlpha = 1;
      const sc = Math.max(0.4, 1 - k * 0.6);
      g.drawImage(art, Math.round(x - (art.width * sc) / 2), Math.round(y - (art.height * sc) / 2), Math.max(1, Math.round(art.width * sc)), Math.max(1, Math.round(art.height * sc)));
      if (Math.floor(S.t * 10) % 2) part(x - 10 * sc, y, -20, rnd(-6, 6), 0.6, "#3dffd0", 1);
      if (S.endT > 1) ptext(g, "CONGRATULATIONS", W / 2, 22, 2, [CREAM, "#ffb26b"], "#3a1c5c", "center");
    }
    // 타이틀 로고 — 갈무리14 를 도트로 굽고 두꺼운 외곽선 · 위아래 2색 · 지나가는 빛줄기
    let LOGO = null;
    function buildLogo() {
      const text = "종이비행기 편대", font = `14px Galmuri14, ${FONT_KO}`;
      const m = mkCanvas(8, 8).getContext("2d");
      m.font = font;
      const tw = Math.ceil(m.measureText(text).width) + 4, th = 20;
      const t = mkCanvas(tw, th), tg = t.getContext("2d", { willReadFrequently: true });
      tg.font = font; tg.textBaseline = "top"; tg.fillStyle = "#000"; tg.fillText(text, 2, 2);
      const d = tg.getImageData(0, 0, tw, th).data;
      const on = (x, y) => x >= 0 && y >= 0 && x < tw && y < th && d[(y * tw + x) * 4 + 3] > 110;
      let y0 = th, y1 = 0;
      for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) if (on(x, y)) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      const Z = 2, P = 5, ow = tw * Z + P * 2, oh = th * Z + P * 2 + 2;
      const c = mkCanvas(ow, oh), cg = c.getContext("2d");
      const each = (fn) => { for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) if (on(x, y)) fn(x * Z + P, y * Z + P, x, y); };
      cg.fillStyle = DEEP; each((X, Y) => cg.fillRect(X - 3, Y - 2, Z + 6, Z + 7));
      cg.fillStyle = "#3a1c5c"; each((X, Y) => cg.fillRect(X - 2, Y - 2, Z + 4, Z + 4));
      cg.fillStyle = "#a8366f"; each((X, Y) => cg.fillRect(X - 1, Y - 1, Z + 2, Z + 2));
      const mid = (y0 + y1) / 2;
      each((X, Y, x, y) => {
        const f = (y - y0) / Math.max(1, y1 - y0);
        cg.fillStyle = y < mid ? (f < 0.2 ? CREAM : "#ffe0a3") : (f > 0.85 ? "#e0505f" : "#ff9a5a");
        cg.fillRect(X, Y, Z, Z);
        if (!on(x, y - 1)) { cg.fillStyle = CREAM; cg.fillRect(X, Y, Z, 1); }
      });
      const mask = mkCanvas(ow, oh);
      LOGO = { c, tmp: mask, w: ow, h: oh };
    }
    function drawLogo(x, y, t) {
      if (!LOGO) buildLogo();
      const L = LOGO, tg = L.tmp.getContext("2d");
      tg.globalCompositeOperation = "source-over";
      tg.clearRect(0, 0, L.w, L.h); tg.drawImage(L.c, 0, 0);
      tg.globalCompositeOperation = "source-atop";
      const sx = ((t * 120) % (L.w + 160)) - 80;
      tg.fillStyle = "rgba(255,246,224,.75)";
      for (let i = 0; i < L.h; i++) tg.fillRect(Math.round(sx - i * 0.6), i, 7, 1);
      tg.fillStyle = "rgba(255,246,224,.35)";
      for (let i = 0; i < L.h; i++) tg.fillRect(Math.round(sx + 12 - i * 0.6), i, 3, 1);
      g.drawImage(L.tmp, Math.round(x - L.w / 2), Math.round(y));
    }
    function drawTitle(t) {
      if (!BG || BG.theme !== "sky") BG = buildBG("sky");
      drawBG(BG, t * 30, t);
      drawFG(BG, t * 30);
      const bob = Math.round(Math.sin(t * 2) * 2);
      drawLogo(W / 2, 14 + bob, t);
      ptext(g, "PAPER JET SQUADRON", W / 2, 68 + bob, 1, [CREAM, "#ffd166"], "#2c3874", "center");
      for (let i = 0; i < 3; i++) {
        const sel = i === shipSel, art = A.ships[i].mid, cx = 112 + i * 80, cy = (mode === "below" ? 122 : 114) + (sel ? Math.round(Math.sin(t * 5) * 2) : 0);
        if (sel) {
          const c = Math.floor(t * 4) % 2 === 0 ? "#ffd166" : "#ff7f50";
          for (const [dx, dy] of [[-30, -18], [24, -18], [-30, 16], [24, 16]]) { rect(cx + dx, cy + dy, 6, 2, c); rect(cx + dx + (dx < 0 ? 0 : 4), cy + dy + (dy < 0 ? 0 : -2), 2, 4, c); }
          for (let k = 0; k < 5; k++) rect(cx - 30 - k * 4 - (Math.floor(t * 20 + k) % 3), cy + 2, 3, 1, k < 2 ? "#3dffd0" : "#13917f");
        }
        g.globalAlpha = sel ? 1 : 0.75;
        g.drawImage(art, Math.round(cx - art.width), Math.round(cy - art.height), art.width * 2, art.height * 2);
        g.globalAlpha = 1;
      }
      g.globalCompositeOperation = "lighter";
      glow(112 + shipSel * 80 - 30, mode === "below" ? 124 : 116, "#3dffd0", 12, 0.4);
      g.globalCompositeOperation = "source-over"; g.globalAlpha = 1;
      grade(BG);
    }

    // ---------- 선명한 글자 층(한글 — 갈무리 픽셀 글꼴) ----------
    let fontUnit = 1;
    function utext(str, x, y, base, color, align, shadow) {
      const fam = base >= 14 ? "Galmuri14" : base <= 9 ? "Galmuri9" : "Galmuri11";
      const o = fontUnit;
      u.font = `${base * o}px ${fam}, ${FONT_KO}`;
      u.textAlign = align || "center"; u.textBaseline = "middle";
      const X = Math.round(x * uiScale), Y = Math.round(y * uiScale);
      u.fillStyle = shadow || DEEP;
      for (const [dx, dy] of [[-o, 0], [o, 0], [0, -o], [0, o], [-o, -o], [o, -o], [-o, o], [o, o], [0, 2 * o], [o, 2 * o], [-o, 2 * o]]) u.fillText(str, X + dx, Y + dy);
      u.fillStyle = color; u.fillText(str, X, Y);
    }
    function drawUI(t) {
      u.setTransform(1, 0, 0, 1, 0, 0);
      u.clearRect(0, 0, uiCv.width, uiCv.height);
      if (state === "title" || !S) {
        if (mode === "below" && cssW >= 520) { // 기체 카드에 이름이 있으니 보통은 그림 위에 쓰지 않는다
          for (let i = 0; i < 3; i++) utext(SHIPS[i].name, 112 + i * 80, 148, 11, i === shipSel ? "#ffd166" : "#e4ddf4");
          for (let i = 0; i < 3; i++) utext(SHIPS[i].trait, 112 + i * 80, 162, 9, i === shipSel ? CREAM : "#c3bbe0");
        }
        if (Math.floor(t * 2) % 2 === 0) utext("시작하려면 누르세요", W / 2, mode === "below" ? 196 : 84, 11, CREAM);
        return;
      }
      if (S.banner) {
        const b = S.banner;
        if (b.big) { const age = b.len - b.t; if (age > 0.3 && b.t > 0.25) utext(b.sub, W / 2, 110, 11, "#ffe0a3"); }
        else { utext(b.sub, W / 2, 92, 14, "#ffd166"); if (b.tip) utext(b.tip, W / 2, 112, 9, CREAM); }
      }
      if (S.phase === "warning" && S.phaseT > 0.4) utext(`${ST.bossName} 접근 중!`, W / 2, 124, 11, "#ffd0d8");
      const B = S.boss;
      if (B && !B.dying && S.phase === "boss") utext(ST.bossName, W / 2, 19, 9, "#ffe0a3");
      for (const n of S.notes) utext(n.text, n.x, n.y, 9, n.color);
      if (S.phase === "clear" && S.tally) {
        const T = S.tally;
        T.lines.slice(0, T.shown).forEach((ln, i) => {
          const yy = 62 + i * 17, k = ease((T.t - ln.at) / 0.45), v = Math.round(ln[1] * k);
          utext(ln[0], 64, yy, 11, ln[3] ? "#9298c4" : "#e4ddf4", "left");
          utext(ln[3] ? "다음 기회에" : `+${v.toLocaleString("ko-KR")}`, W - 64, yy, 11, ln[3] ? "#9298c4" : "#ffd166", "right");
        });
        if (T.shown >= T.lines.length) utext(`점수 ${Math.round(T.disp).toLocaleString("ko-KR")}`, W / 2, 168, 14, CREAM);
      }
      if (S.phase === "ending") {
        const lines = [[1.5, "야근 비행선을 물리쳤어요!"], [3.5, "오늘은 칼퇴근 성공"], [5.5, "종이비행기 편대, 수고했어요"], [7.5, `최종 점수 ${S.score.toLocaleString("ko-KR")}점`]];
        lines.forEach(([at, txt], i) => { if (S.endT >= at) utext(txt, W / 2, 54 + i * 20, i === 3 ? 14 : 11, i === 3 ? "#ffd166" : CREAM); });
      }
      if (S.phase === "intro" && S.stage === 0 && S.phaseT > 0.4) utext("Z 쏘기 · 꾹 눌렀다 떼면 차지 · X 폭탄", W / 2, 198, 9, "#d4f1ff");
      if (state === "paused" && mode === "below") utext("잠깐 쉬는 중", W / 2, 118, 11, CREAM);
    }

    function render() {
      const t = performance.now() / 1000;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.imageSmoothingEnabled = false;
      g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
      if (state === "title" || !S) { drawTitle(t); drawUI(t); return; }
      const sh = S.shake > 0 ? Math.round(S.shake) : 0;
      const ox = sh ? Math.round(rnd(-sh, sh) * 0.6) : 0, oy = sh ? Math.round(rnd(-sh, sh) * 0.6) : 0;
      g.setTransform(1, 0, 0, 1, ox, oy);
      drawBG(BG, S.bg, t);
      if (S.phase !== "ending") {
        drawTerrain();
        drawHazards();
        drawItems();
        for (const e of EN) if (e.on) drawEnemy(e);
        drawBoss(S.boss);
        drawShots();
        drawOptions();
        drawPlayer();
        drawEnemyShots();
      } else drawEnding();
      drawParticles();
      drawAmbient();
      drawRain();
      drawFG(BG, S.bg);
      drawGlows(t);
      g.setTransform(1, 0, 0, 1, 0, 0);
      grade(BG);
      if (S.flash > 0) { g.globalAlpha = Math.min(0.7, S.flash * 2); g.fillStyle = S.flashC; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
      drawOverlayLow();
      if (state === "paused") { rect(0, 0, W, H, "rgba(20,12,42,.55)"); ptext(g, "PAUSE", W / 2, mode === "below" ? 88 : 30, 3, [CREAM, "#ffb26b"], "#3a1c5c", "center"); }
      drawUI(t);
    }

    // ---------- 머리 줄(HUD) ----------
    let hudCache = "", lastScore = 0;
    function hud(force) {
      if (!S) return;
      const key = `${S.score}|${S.stage}|${S.lives}|${S.bombs}|${S.weapon}|${S.options}|${S.shield}|${S.ship}`;
      if (!force && key === hudCache) return;
      hudCache = key;
      const s = String(S.score).padStart(8, "0"), lead = s.match(/^0*/)[0].length;
      const zeros = Math.min(lead, 7);
      elScore.innerHTML = `<i>${s.slice(0, zeros)}</i>${s.slice(zeros)}`;
      if (S.score !== lastScore) { if (S.score - lastScore >= 100) { elScore.classList.remove("is-bump"); void elScore.offsetWidth; elScore.classList.add("is-bump"); } lastScore = S.score; }
      elStage.textContent = `${S.stage + 1}/4`;
      elLives.innerHTML = Array.from({ length: Math.max(0, S.lives) }, () => PLANE_SVG(SHIPS[S.ship].icon)).join("") || "<em>-</em>";
      elBombs.innerHTML = Array.from({ length: S.bombs }, () => CLIP_SVG).join("") || "<em>0</em>";
      elWeapon.innerHTML = `<span class="pj-pips">${[1, 2, 3, 4].map((i) => `<i class="${i <= S.weapon ? "is-on" : ""}"></i>`).join("")}</span>${S.options ? `<span class="pj-tag pj-tag--blue">학${S.options}</span>` : ""}${S.shield ? `<span class="pj-tag pj-tag--green">방패</span>` : ""}`;
      elBombN.textContent = S.bombs;
      btnBomb.disabled = S.bombs <= 0;
    }
    function hudReset() {
      elScore.innerHTML = "<i>0000000</i>0"; elStage.textContent = "1/4";
      elLives.innerHTML = PLANE_SVG(SHIPS[shipSel].icon).repeat(3);
      elBombs.innerHTML = CLIP_SVG.repeat(SHIPS[shipSel].bombs);
      elWeapon.innerHTML = `<span class="pj-pips"><i class="is-on"></i><i></i><i></i><i></i></span>`;
      hudCache = ""; lastScore = 0;
    }
    let lastCharge = -1;
    function chargeUi() {
      const c = S && state === "play" ? Math.round(S.charge * 20) / 20 : 0;
      if (c === lastCharge) return;
      lastCharge = c;
      btnCharge.style.setProperty("--c", c);
      btnCharge.classList.toggle("is-full", c >= 1);
    }

    // ---------- 루프 ----------
    let raf = 0, lastT = 0, acc = 0, titleT = 0;
    function loop(now) {
      raf = 0;
      if (state !== "play" && state !== "title") return;
      let dt = (now - lastT) / 1000;
      lastT = now;
      if (!(dt > 0)) dt = 0;
      if (dt > 0.1) dt = 0.1;
      acc += dt;
      try {
        let n = 0;
        while (acc >= STEP && n < 14) {
          acc -= STEP; n++;
          if (state === "play") update(STEP); else titleT += STEP;
          if (state !== "play" && state !== "title") break;
        }
        render();
        chargeUi();
      } catch (err) { console.error(err); }
      if (state === "play" || state === "title") raf = requestAnimationFrame(loop);
    }
    function run() {
      if (raf) cancelAnimationFrame(raf);
      lastT = performance.now(); acc = 0;
      raf = requestAnimationFrame(loop);
    }

    // ---------- 판 흐름 · 아래 칸 ----------
    function setPanel(html, kind) { panel.innerHTML = html; panel.dataset.kind = kind || "card"; panel.hidden = false; touch.hidden = true; }
    function playPanel() {
      root.classList.add("is-playing");
      panel.hidden = true; panel.innerHTML = "";
      touch.hidden = mode === "pc";
    }
    function shipCards() {
      return `<div class="pj-ships" role="radiogroup" aria-label="기체 고르기">${SHIPS.map((s, i) => `<button type="button" class="pj-ship" data-ship="${i}" role="radio" aria-pressed="${i === shipSel}" aria-checked="${i === shipSel}"><canvas width="34" height="22" data-shipart="${i}"></canvas><b>${s.name}</b><small>${s.trait}</small></button>`).join("")}</div>`;
    }
    function paintShipCards() {
      panel.querySelectorAll("[data-shipart]").forEach((c) => {
        const art = A.ships[+c.dataset.shipart].mid, cg = c.getContext("2d");
        cg.imageSmoothingEnabled = false; cg.clearRect(0, 0, 34, 22);
        cg.drawImage(art, 0, 0);
      });
    }
    function selectShip(i) {
      shipSel = clamp(i, 0, 2);
      try { localStorage.setItem("hk-paperjet-ship", String(shipSel)); } catch (_) { /* 무시 */ }
      panel.querySelectorAll("[data-ship]").forEach((b) => { const on = +b.dataset.ship === shipSel; b.setAttribute("aria-pressed", on); b.setAttribute("aria-checked", on); });
      const d = panel.querySelector("[data-shipdesc]");
      if (d) d.textContent = SHIPS[shipSel].desc;
      if (state === "title") hudReset();
    }
    function showTitle() {
      state = "title";
      S = null;
      Music.stop();
      root.classList.remove("is-playing");
      hudReset();
      setPanel(`<div class="pj-title">
          ${shipCards()}
          <p class="pj-desc" data-shipdesc>${SHIPS[shipSel].desc}</p>
          <button type="button" class="pj-go" data-act="start">시작</button>
          <div class="pj-keys">방향키 · WASD 이동 · <kbd>Z</kbd>/<kbd>J</kbd> 쏘기(꾹 눌렀다 떼면 차지) · <kbd>X</kbd>/<kbd>K</kbd> 폭탄 · <kbd>Esc</kbd> 일시정지<br>휴대폰은 화면이나 아래 칸을 끌어 움직이고, 누르는 동안 자동으로 쏴요</div>
        </div>`, "title");
      paintShipCards();
      run();
    }
    function start() {
      keys.l = keys.r = keys.u = keys.d = keys.fire = false;
      touchFire = false; chargeBtn = false; dragDX = dragDY = 0;
      newGame(shipSel);
      state = "play";
      playPanel();
      hud(true);
      run();
    }
    function pause() {
      if (state !== "play") return;
      state = "paused";
      keys.l = keys.r = keys.u = keys.d = keys.fire = false;
      touchFire = false; chargeBtn = false; endDrag();
      Music.pause();
      root.classList.remove("is-playing");
      setPanel(`<div class="pj-card"><h3>잠깐 쉬는 중</h3><p>지금 점수 <b>${S.score.toLocaleString("ko-KR")}</b>점 · 스테이지 ${S.stage + 1}</p><button type="button" class="pj-go" data-act="resume">계속하기</button></div>`);
      const b = panel.querySelector("button");
      if (b) b.focus({ preventScroll: true });
      render();
    }
    function resume() {
      if (state !== "paused") return;
      state = "play";
      playPanel();
      Music.resume();
      run();
    }
    function finish(cleared) {
      if (state === "over") return;
      state = "over";
      Music.stop();
      root.classList.remove("is-playing");
      render();
      ctx.sfx(cleared ? "win" : "lose");
      const score = S.score;
      setPanel(`<div class="pj-card">
          <h3>${cleared ? "퇴근 성공!" : "게임 오버"}</h3>
          <p>${cleared ? "네 스테이지를 모두 깼어요" : `스테이지 ${S.stage + 1} · ${STAGES[S.stage].name}까지 날았어요`} · 격추 ${S.kills}</p>
          <div class="pj-big">${score.toLocaleString("ko-KR")}점</div>
          <div class="pj-row"><button type="button" class="pj-go" data-act="start">다시 하기</button></div>
          <button type="button" class="pj-sub" data-act="title">기체 바꾸기</button>
        </div>`);
      ctx.submit(score);
    }
    panel.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.ship != null) { selectShip(+b.dataset.ship); ctx.sfx("select"); return; }
      const act = b.dataset.act;
      if (act === "start") start();
      else if (act === "resume") resume();
      else if (act === "title") showTitle();
    });
    function clickGo() { const b = panel.querySelector('[data-act="start"]'); if (b) b.click(); }

    // ---------- 입력 ----------
    const typing = (e) => { const t = e.target; return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable); };
    const dialogOpen = () => !!document.querySelector(".hk-dialog__overlay");
    const KEYMAP = { ArrowLeft: "l", KeyA: "l", ArrowRight: "r", KeyD: "r", ArrowUp: "u", KeyW: "u", ArrowDown: "d", KeyS: "d" };
    window.addEventListener("keydown", (e) => {
      if (typing(e) || dialogOpen()) return;
      const c = e.code;
      if (state === "play") {
        if (KEYMAP[c]) { keys[KEYMAP[c]] = true; e.preventDefault(); }
        else if (c === "KeyZ" || c === "KeyJ") { if (!e.repeat && !keys.fire) S.fireCd = Math.min(S.fireCd, 0); keys.fire = true; e.preventDefault(); }
        else if (c === "KeyX" || c === "KeyK") { if (!e.repeat) useBomb(); e.preventDefault(); }
        else if (c === "KeyP") pause();
        else if (c === "Space") e.preventDefault();
      } else if (state === "title") {
        if (c === "ArrowLeft" || c === "KeyA") { selectShip(shipSel - 1); ctx.sfx("select"); e.preventDefault(); }
        else if (c === "ArrowRight" || c === "KeyD") { selectShip(shipSel + 1); ctx.sfx("select"); e.preventDefault(); }
        else if ((c === "KeyZ" || c === "KeyJ" || c === "Enter") && !e.repeat) { e.preventDefault(); clickGo(); }
      } else if (state === "paused") {
        if (c === "Enter" || c === "KeyP") { e.preventDefault(); const b = panel.querySelector('[data-act="resume"]'); if (b) b.click(); }
        if (KEYMAP[c]) e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => {
      const c = e.code;
      if (KEYMAP[c]) keys[KEYMAP[c]] = false;
      if (c === "KeyZ" || c === "KeyJ") keys.fire = false;
    });
    window.addEventListener("blur", () => { keys.l = keys.r = keys.u = keys.d = keys.fire = false; touchFire = false; chargeBtn = false; endDrag(); });

    // 끌기 — 손가락을 움직인 만큼만 기체가 따라 움직인다 (화면 · 아래 칸 어디든)
    let dragId = null, lastX = 0, lastY = 0;
    function dragScale() { return (W / Math.max(1, cssW)) * (isCoarse() ? 1.25 : 1); }
    function onDown(e) {
      if (state === "title" && e.currentTarget === cv) { clickGo(); return; }
      if (state !== "play") return;
      e.preventDefault();
      if (dragId != null) return;
      dragId = e.pointerId; lastX = e.clientX; lastY = e.clientY;
      touchFire = true;
      if (S) S.fireCd = Math.min(S.fireCd, 0);
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) { /* 무시 */ }
    }
    function onMove(e) {
      if (e.pointerId !== dragId || state !== "play") return;
      const k = dragScale();
      dragDX += (e.clientX - lastX) * k; dragDY += (e.clientY - lastY) * k;
      lastX = e.clientX; lastY = e.clientY;
    }
    function endDrag(e) {
      if (e && e.pointerId !== dragId) return;
      dragId = null; touchFire = false;
    }
    for (const el of [cv, touch]) {
      el.addEventListener("pointerdown", onDown);
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerup", endDrag);
      el.addEventListener("pointercancel", endDrag);
    }
    btnBomb.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); useBomb(); });
    btnCharge.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); chargeBtn = true; try { btnCharge.setPointerCapture(e.pointerId); } catch (_) { /* 무시 */ } });
    const chargeUp = (e) => { if (e) { e.preventDefault(); e.stopPropagation(); } chargeBtn = false; };
    btnCharge.addEventListener("pointerup", chargeUp);
    btnCharge.addEventListener("pointercancel", chargeUp);
    btnCharge.addEventListener("lostpointercapture", () => { chargeBtn = false; });
    for (const b of [btnBomb, btnCharge]) b.addEventListener("contextmenu", (e) => e.preventDefault());
    cv.addEventListener("contextmenu", (e) => e.preventDefault());

    document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });

    // ---------- 시작 ----------
    ctx.onScore && ctx.onScore(() => (S ? S.score : 0));
    ctx.onRestart(() => { if (S) shipSel = S.ship; start(); });
    ctx.onPause(pause);
    if (document.fonts && document.fonts.load) Promise.all(["11px Galmuri11", "14px Galmuri14", "9px Galmuri9"].map((f) => document.fonts.load(f))).then(() => { LOGO = null; render(); }).catch(() => {});
    if (window.ResizeObserver) new ResizeObserver(() => fit()).observe(stage);
    window.addEventListener("resize", fit);
    showTitle();
    fit();

    // 시험 페이지 전용 디버그 훅
    if (TEST) {
      window.__pj = {
        get state() { return state; },
        get S() { return S; },
        get stages() { return STAGES.length; },
        god(on) { god = on !== false; return god; },
        goStage(i) { if (!S) return; initStage(clamp(i, 0, STAGES.length - 1)); },
        skipToBoss() { if (!S) return; S.ei = ST.events.length; S.scroll = ST.len; for (const e of EN) e.on = false; S.queue = []; S.phase = "stage"; },
        hurtBoss(frac) { const B = S && S.boss; if (!B || B.enter) return false; for (const p of B.parts) if (p.alive && !p.core && !p.armored) damagePart(B, p, p.max * (frac || 1)); const c = B.parts.find((p) => p.core); if (c && c.alive && !c.armored && frac >= 1) damagePart(B, c, c.max * 2); return true; },
        killPlayer() { if (S) { S.invul = 0; S.shield = false; const gd = god; god = false; hitPlayer(); god = gd; } },
        give(kind) { if (S) takeItem(kind, S.px, S.py); },
        counts() { const c = (a) => a.filter((o) => o.on).length; return { en: c(EN), es: c(ES), ps: c(PS), pt: c(PT), it: c(IT), hz: c(HZ) }; },
        music() { return Music.name; },
        step(sec) { let n = Math.round(sec * 120); while (n-- > 0 && state === "play") update(STEP); render(); return state; },
        keys,
        renderCost() { const t = performance.now(); for (let i = 0; i < 60; i++) render(); return (performance.now() - t) / 60; },
        enemies() { return EN.filter((e) => e.on); },
        items() { return IT.filter((o) => o.on); },
        set touchFire(v) { touchFire = v; },
      };
    }
  }

  return { setup, SHIPS, STAGES };
})();
