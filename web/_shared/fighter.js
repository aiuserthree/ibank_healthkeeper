/**
 * 스트레스 파이터 — 옛날 오락실풍 벨트스크롤 격투 (혼자 하기 · 점수가 사내 순위에 올라간다)
 * web/games/fighter.html 이 HKPlay.mountGame 의 setup 에서 HKFighter.mount(stage, ctx) 로 부른다.
 *
 * - 화면은 384×240 작은 캔버스에 도트로 그리고 CSS 로 키운다(image-rendering: pixelated)
 * - 그림 · 소리는 모두 코드로 만든다(외부 파일 없음). 인물은 관절 좌표로 그린 도트 인형을 프레임마다 한 번만 그려 둔다
 * - 고정 시간 간격(1/60초)으로 움직여 화면 주사율이 달라도 게임 속도가 같다
 * - 시험 페이지에서 window.HK_FIGHTER_DEBUG = true 를 먼저 두면 window.__fighter 훅(스테이지 건너뛰기 등)이 열린다
 */
(function () {
  "use strict";
  const VW = 384, VH = 240;
  const FT = 160, FB = 232; // 걸을 수 있는 바닥(깊이) 범위 — 발 위치 y
  const STEP = 1 / 60;
  const GRAV = 780;
  const INK = "#1a1330";

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const sgn = (v) => (v < 0 ? -1 : 1);
  function mk(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }

  // ───────────────────────── 도트 글꼴 (영문 · 숫자 5×7, 작은 숫자 3×5)
  const F5 = {
    "0": "01110100011001110101110011000101110", "1": "00100011000010000100001000010001110", "2": "01110100010000100010001000100011111",
    "3": "11110000010000101110000010000111110", "4": "00010001100101010010111110001000010", "5": "11111100001111000001000011000101110",
    "6": "00110010001000011110100011000101110", "7": "11111000010001000100010000100001000", "8": "01110100011000101110100011000101110",
    "9": "01110100011000101111000010001001100", A: "01110100011000111111100011000110001", B: "11110100011000111110100011000111110",
    C: "01110100011000010000100001000101110", D: "11100100101000110001100011001011100", E: "11111100001000011110100001000011111",
    G: "01110100011000010111100011000101111", I: "01110001000010000100001000010001110", K: "10001100101010011000101001001010001",
    L: "10000100001000010000100001000011111", M: "10001110111010110101100011000110001", N: "10001110011010110011100011000110001",
    O: "01110100011000110001100011000101110", P: "11110100011000111110100001000010000", R: "11110100011000111110101001001010001",
    S: "01111100001000001110000010000111110", T: "11111001000010000100001000010000100", U: "10001100011000110001100011000101110",
    W: "10001100011000110101101011010101010", X: "10001100010101000100010101000110001", "+": "00000001000010011111001000010000000",
    "-": "00000000000000011111000000000000000", "!": "00100001000010000100001000000000100", ">": "00000001000001011111000100010000000",
    ":": "00000011000110000000011000110000000", ",": "00000000000000000000001100010001000", ".": "00000000000000000000000000110001100",
    "*": "00000100010101000100010101000100000", " ": "00000000000000000000000000000000000",
  };
  const F3 = {
    "0": "111101101101111", "1": "010110010010111", "2": "111001111100111", "3": "111001111001111", "4": "101101111001001",
    "5": "111100111001111", "6": "111100111101111", "7": "111001010010010", "8": "111101111101111", "9": "111101111001111",
    "+": "000010111010000", "*": "000101010101000", " ": "000000000000000",
  };
  function pixW(str, sc, small) { return str.length * (small ? 4 : 6) * sc - sc; }
  function pix(g, str, x, y, sc, col, shadow, small) {
    const font = small ? F3 : F5, gw = small ? 3 : 5, gh = small ? 5 : 7, adv = (gw + 1) * sc;
    const pass = (ox, oy, c) => {
      g.fillStyle = c;
      for (let i = 0; i < str.length; i++) {
        const gl = font[str[i]] || font[" "];
        for (let k = 0; k < gl.length; k++) if (gl.charCodeAt(k) === 49) g.fillRect(x + i * adv + (k % gw) * sc + ox, y + ((k / gw) | 0) * sc + oy, sc, sc);
      }
    };
    if (shadow) pass(sc, sc, shadow);
    pass(0, 0, col);
  }

  // 한글 도트 글씨 — 작은 캔버스에 글자를 쓴 뒤 반쯤 칠해진 점은 버리고 또렷한 점만 남긴다 (테두리 · 그림자 포함)
  const PT = new Map();
  // 한글 픽셀 글꼴 「갈무리」 — 크기는 글꼴 기준 크기 그대로 (못 받으면 기본 글꼴)
  const FB_FONT = '"Apple SD Gothic Neo", Pretendard, "Malgun Gothic", "Noto Sans KR", sans-serif';
  function fontFor(size) {
    if (size >= 24) return `30px Galmuri14, ${FB_FONT}`;
    if (size >= 14) return `15px Galmuri14, ${FB_FONT}`;
    if (size >= 11) return `700 12px Galmuri11, ${FB_FONT}`;
    return `10px Galmuri9, ${FB_FONT}`;
  }
  function ptext(str, size, fill, line, shadow) {
    const key = str + "|" + size + "|" + fill + "|" + line + "|" + shadow;
    let c = PT.get(key);
    if (c) return c;
    const t = mk(8, 8).getContext("2d", { willReadFrequently: true });
    const font = fontFor(size);
    t.font = font;
    const px = +/(\d+)px/.exec(font)[1], w = Math.ceil(t.measureText(str).width) + 4, h = Math.ceil(px * 1.4) + 2;
    t.canvas.width = w; t.canvas.height = h;
    t.font = font; t.textBaseline = "middle"; t.fillStyle = "#000";
    t.fillText(str, 2, h / 2 + 1);
    const d = t.getImageData(0, 0, w, h).data;
    const W = w + 4, H = h + 4;
    const on = new Uint8Array(W * H);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 120) on[(y + 2) * W + x + 2] = 1;
    c = mk(W, H);
    const g = c.getContext("2d");
    const fills = Array.isArray(fill) ? fill : [fill];
    if (shadow) { g.fillStyle = shadow; for (let i = 0; i < on.length; i++) if (on[i]) g.fillRect((i % W) + 1, ((i / W) | 0) + 2, 1, 1); }
    if (line) {
      g.fillStyle = line;
      for (let i = 0; i < on.length; i++) if (on[i]) { const x = i % W, y = (i / W) | 0; g.fillRect(x - 1, y - 1, 3, 3); }
    }
    let y0 = H, y1 = 0;
    for (let i = 0; i < on.length; i++) if (on[i]) { const y = (i / W) | 0; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    for (let i = 0; i < on.length; i++) if (on[i]) {
      const x = i % W, y = (i / W) | 0;
      const k = fills.length === 1 ? 0 : Math.min(fills.length - 1, Math.floor(((y - y0) / Math.max(1, y1 - y0 + 1)) * fills.length));
      g.fillStyle = fills[k];
      g.fillRect(x, y, 1, 1);
    }
    PT.set(key, c);
    return c;
  }
  function drawPT(g, c, x, y, sc, align) {
    sc = sc || 1;
    const w = c.width * sc, h = c.height * sc;
    const dx = align === "c" ? x - w / 2 : align === "r" ? x - w : x;
    g.drawImage(c, Math.round(dx), Math.round(y - h / 2), w, h);
  }

  // ───────────────────────── 도트 붓 — 부위(묶음)마다 먼저 테두리를 두르고 안을 칠한다
  function thick(g, x0, y0, x1, y1, w) {
    const dx = x1 - x0, dy = y1 - y0;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
    const h = w / 2;
    for (let i = 0; i <= n; i++) g.fillRect(Math.round(x0 + (dx * i) / n - h), Math.round(y0 + (dy * i) / n - h), w, w);
  }
  function ell(g, cx, cy, rx, ry) {
    if (ry <= 0) { g.fillRect(cx - rx, cy, rx * 2 + 1, 1); return; }
    for (let dy = -ry; dy <= ry; dy++) {
      const k = 1 - (dy * dy) / ((ry + 0.45) * (ry + 0.45));
      const hw = Math.round(rx * Math.sqrt(Math.max(0, k)));
      g.fillRect(cx - hw, cy + dy, hw * 2 + 1, 1);
    }
  }
  class Pen {
    constructor(s) { this.s = s || 1; this.groups = [[]]; }
    g() { if (this.groups[this.groups.length - 1].length) this.groups.push([]); return this; }
    _a(op) { this.groups[this.groups.length - 1].push(op); }
    r(x, y, w, h, c) { this._a([0, x, y, w, h, c]); } // 테두리 있는 네모
    l(x0, y0, x1, y1, w, c) { this._a([1, x0, y0, x1, y1, w, c]); } // 테두리 있는 굵은 선
    o(x, y, rx, ry, c) { this._a([2, x, y, rx, ry, c]); } // 테두리 있는 타원
    d(x, y, w, h, c) { this._a([3, x, y, w, h, c]); } // 무늬(테두리 없음)
    dl(x0, y0, x1, y1, w, c) { this._a([4, x0, y0, x1, y1, w, c]); }
    de(x, y, rx, ry, c) { this._a([5, x, y, rx, ry, c]); }
  }

  // ───────────────────────── 색 — 색조 이동 명암 (어두울수록 파랑 · 보라, 밝을수록 노랑 · 주황)
  function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function rgbHex(r, g, b) { return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1); }
  function rgbHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    if (mx === mn) return [0, 0, l];
    const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
  }
  function hslRgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
  }
  const towardHue = (h, target, amt) => { let d = ((target - h + 540) % 360) - 180; return h + Math.sign(d) * Math.min(Math.abs(d), amt); };
  const RAMP = new Map();
  function rampRgb(r, g, b, k) {
    const key = (r << 16) | (g << 8) | b, ck = key * 16 + Math.round(k * 2) + 8;
    let v = RAMP.get(ck);
    if (v) return v;
    let [h, s, l] = rgbHsl(r, g, b);
    if (k < 0) {
      const n = -k;
      h = s < 0.06 ? 250 : towardHue(h, 255, 13 * n);
      s = Math.min(1, Math.max(s, 0.18) + 0.06 * n);
      l = Math.max(0.07, l - 0.12 * n);
      if (s < 0.25) s = 0.25;
    } else if (k > 0) {
      h = s < 0.06 ? h : towardHue(h, 50, 10 * k);
      s = Math.max(0, s - 0.05 * k);
      l = Math.min(0.95, l + 0.1 * k);
    }
    v = hslRgb(h, s, l);
    RAMP.set(ck, v);
    return v;
  }
  function ramp(hex, k) { const [r, g, b] = hexRgb(hex); const v = rampRgb(r, g, b, k); return rgbHex(v[0], v[1], v[2]); }
  function mix(a, b, t) { const A = hexRgb(a), B = hexRgb(b); return rgbHex(Math.round(A[0] + (B[0] - A[0]) * t), Math.round(A[1] + (B[1] - A[1]) * t), Math.round(A[2] + (B[2] - A[2]) * t)); }
  const rgba = (hex, a) => { const [r, g, b] = hexRgb(hex); return `rgba(${r},${g},${b},${a})`; };

  // 붓으로 그린 묶음(부위)마다 — 안을 칠하고, 오른쪽 아래 가장자리는 한 단계 어둡게 · 왼쪽 위는 한 단계 밝게,
  // 바깥 테두리는 검정 대신 그 부위 색의 가장 어두운 단계로 (빛 받는 왼쪽 위 테두리는 조금 밝게)
  function shapeOp(g, op, ox, oy, s) {
    const R = (v) => Math.round(v * s), t = op[0] % 3;
    if (t === 0) g.fillRect(ox + R(op[1]), oy + R(op[2]), Math.max(1, R(op[3])), Math.max(1, R(op[4])));
    else if (t === 1) thick(g, ox + op[1] * s, oy + op[2] * s, ox + op[3] * s, oy + op[4] * s, Math.max(1, R(op[5])));
    else ell(g, ox + R(op[1]), oy + R(op[2]), Math.max(0, R(op[3])), Math.max(0, R(op[4])));
  }
  let bakeTmp = null;
  function bakePen(pen, W, H, ox, oy) {
    if (!bakeTmp || bakeTmp.width < W || bakeTmp.height < H) bakeTmp = mk(Math.max(W, bakeTmp ? bakeTmp.width : 0), Math.max(H, bakeTmp ? bakeTmp.height : 0));
    const tg = bakeTmp.getContext("2d", { willReadFrequently: true });
    const out = new ImageData(W, H), O = out.data;
    const mask = new Uint8Array(W * H);
    for (const grp of pen.groups) {
      if (!grp.length) continue;
      tg.clearRect(0, 0, W, H);
      for (const op of grp) { tg.fillStyle = op[op.length - 1]; shapeOp(tg, op, ox, oy, pen.s); }
      const D = tg.getImageData(0, 0, W, H).data;
      for (let i = 0; i < W * H; i++) mask[i] = D[i * 4 + 3] > 128 ? 1 : 0;
      const M = (x, y) => x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x] === 1;
      // 테두리
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (mask[i]) continue;
        let n = -1, light = false;
        if (M(x + 1, y)) { n = i + 1; light = true; } else if (M(x, y + 1)) { n = i + W; light = true; } else if (M(x - 1, y)) n = i - 1; else if (M(x, y - 1)) n = i - W;
        if (n < 0) continue;
        const c = rampRgb(D[n * 4], D[n * 4 + 1], D[n * 4 + 2], light ? -1.7 : -2.8);
        O[i * 4] = c[0]; O[i * 4 + 1] = c[1]; O[i * 4 + 2] = c[2]; O[i * 4 + 3] = 255;
      }
      // 안쪽 명암
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!mask[i]) continue;
        let r = D[i * 4], g = D[i * 4 + 1], b = D[i * 4 + 2];
        const dark = !M(x + 1, y) || !M(x, y + 1) || !M(x + 1, y + 1);
        const lite = !dark && (!M(x - 1, y) || !M(x, y - 1));
        if (dark || lite) { const c = rampRgb(r, g, b, dark ? -1 : 1); r = c[0]; g = c[1]; b = c[2]; }
        O[i * 4] = r; O[i * 4 + 1] = g; O[i * 4 + 2] = b; O[i * 4 + 3] = 255;
      }
    }
    return out;
  }

  // 그림 보관함 — (그림, 동작, 프레임, 덧붙임)마다 한 번만 굽는다. 번쩍임 · 예고 · 림 라이트는 구운 그림에서 바로 만든다
  const SPR = new Map();
  function variant(base, kind, col) {
    const c = mk(base.c.width, base.c.height), g = c.getContext("2d");
    g.drawImage(base.c, 0, 0);
    g.globalCompositeOperation = "source-atop";
    g.fillStyle = kind === "f" ? "#fff6e0" : kind === "t" ? "rgba(255,79,154,.62)" : col;
    g.fillRect(0, 0, c.width, c.height);
    return { c, ax: base.ax, ay: base.ay };
  }
  function sprite(def, anim, frame, fx, extra) {
    const key = def.id + "|" + anim + "|" + frame + "|" + (extra || "");
    let s = SPR.get(key);
    if (!s) {
      const pen = new Pen(def.scale);
      def.draw(pen, anim, frame, extra || "");
      const c = mk(def.cw, def.ch);
      c.getContext("2d").putImageData(bakePen(pen, def.cw, def.ch, def.ax, def.ay), 0, 0);
      s = { c, ax: def.ax, ay: def.ay };
      SPR.set(key, s);
    }
    if (!fx) return s;
    const vk = key + "|" + fx;
    let v = SPR.get(vk);
    if (!v) { v = fx.length > 1 ? variant(s, "r", fx) : variant(s, fx); SPR.set(vk, v); }
    return v;
  }
  function blit(g, s, x, y, dir, alpha) {
    if (alpha != null && alpha < 1) { if (alpha <= 0) return; g.globalAlpha = alpha; }
    x = Math.round(x); y = Math.round(y);
    if (dir >= 0) g.drawImage(s.c, x - s.ax, y - s.ay);
    else { g.save(); g.translate(x, 0); g.scale(-1, 1); g.drawImage(s.c, -s.ax, y - s.ay); g.restore(); }
    g.globalAlpha = 1;
  }
  // 은은한 빛 번짐 — 미리 만든 둥근 빛을 더하기(lighter)로 얹는다
  const GLOW = new Map();
  function glowSprite(col, r) {
    const k = col + r;
    let c = GLOW.get(k);
    if (c) return c;
    c = mk(r * 2, r * 2);
    const g = c.getContext("2d"), gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, rgba(col, 0.9)); gr.addColorStop(0.35, rgba(col, 0.38)); gr.addColorStop(1, rgba(col, 0));
    g.fillStyle = gr; g.fillRect(0, 0, r * 2, r * 2);
    GLOW.set(k, c);
    return c;
  }
  function glow(g, x, y, r, col, a) {
    if (a <= 0) return;
    g.globalCompositeOperation = "lighter"; g.globalAlpha = Math.min(1, a);
    g.drawImage(glowSprite(col, r), Math.round(x - r), Math.round(y - r));
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
  }

  // ───────────────────────── 사람 모양 인형 (오른쪽을 보는 자세 · 발 = (0,0))
  function human(p, L, P, ex) {
    const kneeOf = (h, f, k) => k || [(h[0] + f[0]) / 2 + 2.5, (h[1] + f[1]) / 2];
    const elbowOf = (s, h, e) => e || [(s[0] + h[0]) / 2 - 1.5, (s[1] + h[1]) / 2 + 2];
    const hip = P.hip, neck = P.neck;
    const hipF = [hip[0] + 1, hip[1]], hipB = [hip[0] - 2, hip[1]];
    const shF = [neck[0] + 1, neck[1] + 2], shB = [neck[0] - 2, neck[1] + 2];
    if (L.behind) L.behind(p, P, ex);
    arm(p, L, shB, P.hB, elbowOf(shB, P.hB, P.eB), true);
    leg(p, L, hipB, P.fB, kneeOf(hipB, P.fB, P.kB), true);
    L.torso(p, P, ex);
    leg(p, L, hipF, P.fF, kneeOf(hipF, P.fF, P.kF), false);
    p.g(); p.l(neck[0], neck[1], P.head[0], P.head[1] + 3, L.neckW || 3, L.skin);
    L.head(p, P, ex);
    if (L.weapon) L.weapon(p, P, ex);
    arm(p, L, shF, P.hF, elbowOf(shF, P.hF, P.eF), false);
    if (L.front) L.front(p, P, ex);
  }
  function leg(p, L, h, f, k, back) {
    const c = back ? L.pantsD : L.pants;
    p.g();
    p.l(h[0], h[1], k[0], k[1], L.lw, c);
    p.l(k[0], k[1], f[0], f[1] - 1, L.lw, c);
    p.r(f[0] - 1.5, f[1] - 2, L.lw + 2, 2, back ? L.shoeD : L.shoe);
  }
  function arm(p, L, s, h, e, back) {
    p.g();
    p.l(s[0], s[1], e[0], e[1], L.aw, back ? L.topD : L.top);
    p.l(e[0], e[1], h[0], h[1], L.aw, back ? L.skinD || L.skin : L.skin);
    p.o(h[0], h[1], L.fist || 1.5, L.fist || 1.5, back ? L.skinD || L.skin : L.skin);
  }
  function torsoLine(p, P, w, c) {
    const [hx, hy] = P.hip, [nx, ny] = P.neck;
    p.l(hx + (nx - hx) * 0.12, hy + (ny - hy) * 0.12, nx + (hx - nx) * 0.2, ny + (hy - ny) * 0.2, w, c);
  }
  // 자세 만들기 — 서 있는 기본 자세에 바꿀 것만 덮어쓴다
  function P(o) {
    const by = o.by || 0, lean = o.lean || 0;
    const q = { hip: [0, -17 + by], neck: [lean, -30 + by], fF: [5, 0], fB: [-5, 0], hF: [8 + lean, -24 + by], hB: [5 + lean, -23 + by], wa: -1.0 };
    for (const k in o) if (k !== "by" && k !== "lean" && k !== "hx" && k !== "hy") q[k] = o[k];
    if (!q.head) q.head = [q.neck[0] + 1 + (o.hx || 0), q.neck[1] - 7 + (o.hy || 0)];
    return q;
  }
  const FALL = { hip: [-1, -13], neck: [-12, -20], head: [-18, -24], fF: [10, -14], fB: [8, -9], hF: [-14, -29], hB: [-17, -20], wa: -2.5 };
  const LIE = { hip: [0, -3], neck: [-13, -4], head: [-19, -5], fF: [13, -1], fB: [12, 0], kF: [7, -4], kB: [6, -3], hF: [-6, -1], hB: [-9, -1], wa: 3 };
  const GETUP = { hip: [-1, -10], neck: [2, -22], head: [3, -29], fF: [6, 0], fB: [-6, 0], kF: [8, -6], kB: [-1, -7], hF: [8, -12], hB: [4, -11], wa: -0.5 };
  const HERO_POSE = {
    idle: [P({}), P({ by: 1 })],
    walk: [P({ fF: [6, 0], fB: [-6, 0] }), P({ by: -1, fF: [2, -3], fB: [-1, 0] }), P({ fF: [-5, 0], fB: [6, 0] }), P({ by: -1, fF: [0, 0], fB: [3, -3] })],
    run: [
      P({ lean: 3, by: -1, fF: [9, 0], fB: [-8, -3], hF: [11, -27], hB: [-3, -21], wa: -0.6 }),
      P({ lean: 3, fF: [3, -5], fB: [-2, 0], hF: [7, -24], hB: [3, -24], wa: -0.6 }),
      P({ lean: 3, by: -1, fF: [-7, -3], fB: [9, 0], hF: [-1, -21], hB: [10, -27], wa: -0.6 }),
      P({ lean: 3, fF: [-2, 0], fB: [3, -5], hF: [5, -24], hB: [6, -24], wa: -0.6 }),
    ],
    jab1: [P({ lean: 1, hF: [5, -26] }), P({ lean: 2, hF: [16, -27], fF: [6, 0], fB: [-6, 0] })],
    jab2: [P({ lean: 1, hB: [3, -25] }), P({ lean: 3, hB: [16, -26], hF: [5, -25], fF: [6, 0], fB: [-6, 0] })],
    kick: [P({ lean: -1, fF: [7, -9], kF: [8, -14] }), P({ lean: -3, fF: [19, -19], kF: [9, -17], fB: [-3, 0], hF: [2, -26], hB: [-3, -25] })],
    swing: [P({ lean: -1, hF: [1, -35], eF: [-1, -30], wa: -2.4 }), P({ lean: 3, hF: [13, -24], wa: 0.35, fF: [7, 0], fB: [-6, 0] })],
    jump: [P({ fF: [5, -6], kF: [7, -12], fB: [-4, -4], kB: [0, -10], hF: [8, -31], hB: [-2, -30], wa: -1.4 })],
    jkick: [P({ lean: -2, fF: [17, -8], kF: [8, -13], fB: [-5, -8], kB: [-1, -13], hF: [2, -29], hB: [-5, -27], wa: -1.8 })],
    hurt: [P({ lean: -4, hx: -2, hF: [-1, -31], hB: [-7, -27], fF: [4, 0], fB: [-6, 0], wa: -2 })],
    fall: [FALL], lie: [LIE], getup: [GETUP],
    grab: [P({ lean: 1, hF: [12, -25], hB: [11, -27], fF: [6, 0], fB: [-5, 0] })],
    knee: [P({ lean: 1, fF: [8, -10], kF: [11, -16], hF: [12, -27], hB: [11, -28] })],
    throw: [P({ lean: -3, hF: [-9, -31], hB: [-11, -28], fF: [7, 0], fB: [-6, 0] })],
    spin: [P({ hF: [15, -28], hB: [-14, -28], fF: [4, 0], fB: [-4, 0], wa: 0 }), P({ by: -1, hF: [14, -26], hB: [-15, -29], fF: [5, -2], fB: [-4, 0], wa: 0 })],
    win: [P({ hF: [5, -41], eF: [3, -34], hB: [-4, -20], wa: -1.5 })],
  };
  const HERO_LOOK = {
    mint: { skin: "#f7cfa8", skinD: "#dcae8a", top: "#2ee6c0", topD: "#18b096", pants: "#34306e", pantsD: "#252257", shoe: "#fff6e0", shoeD: "#cfc6e0", hair: "#5a3040", band: "#ff4f9a", collar: "#fff6e0", lw: 4, aw: 3, tw: 9, hr: 6 },
    gom: { skin: "#eab68b", skinD: "#cf9670", top: "#ff7a2a", topD: "#d9551c", pants: "#2c3566", pantsD: "#1f2650", shoe: "#3a3550", shoeD: "#2a2640", hair: "#2a1d24", band: "#ffe066", collar: "#fff6e0", lw: 5, aw: 4, tw: 12, hr: 6.5, fist: 2 },
  };
  function drawWeapon(p, kind, hx, hy, a) {
    if (!kind) return;
    const c = Math.cos(a), s = Math.sin(a);
    p.g();
    if (kind === "paper") {
      p.l(hx - c * 3, hy - s * 3, hx + c * 13, hy + s * 13, 3.4, "#f8fafc");
      p.dl(hx + c * 6, hy + s * 6, hx + c * 7, hy + s * 7, 3, "#74c0fc");
      p.dl(hx + c * 11, hy + s * 11, hx + c * 12, hy + s * 12, 3, "#ffd43b");
    } else {
      p.l(hx - c * 3, hy - s * 3, hx + c * 19, hy + s * 19, 3, "#7048e8");
      p.dl(hx + c * 5, hy + s * 5, hx + c * 17, hy + s * 17, 1, "#9775fa");
      p.l(hx - c * 3, hy - s * 3, hx - c * 3 - s * 3, hy - s * 3 + c * 3, 2, "#6b4226");
    }
  }
  function heroDef(id) {
    const L = HERO_LOOK[id];
    const look = Object.assign({}, L, {
      behind(p, P0) {
        const [x, y] = P0.head;
        p.g();
        if (id === "mint") { p.l(x - 5, y - 3, x - 10, y + 3, 3, L.hair); p.o(x - 10, y + 4, 2, 2, L.hair); }
        else { p.l(x - 5, y - 4, x - 11, y - 2, 1.5, L.band); p.l(x - 5, y - 4, x - 10, y + 1, 1.5, L.band); }
      },
      torso(p, P0) {
        p.g(); torsoLine(p, P0, L.tw, L.top);
        const [nx, ny] = P0.neck;
        p.dl(nx - 2, ny + 1, nx + 1, ny + 4, 1, L.collar);
        p.dl(nx + 3, ny + 1, nx + 1, ny + 4, 1, L.collar);
        if (P0.hip[1] < -8) p.d(nx + (id === "gom" ? 3 : 2), ny + 6, 2, 2, "#ff5d8f");
      },
      head(p, P0, ex) {
        const [x, y] = P0.head, r = L.hr;
        p.g(); p.o(x, y, r, r, L.skin);
        if (id === "mint") {
          p.de(x - 1.5, y - 3.5, r, 3.4, L.hair);
          p.d(x - 6, y - 4, 4, 7, L.hair);
          p.dl(x - 6, y - 4.5, x + 4, y - 6.5, 1.4, L.band);
        } else {
          p.de(x - 1, y - 4, r, 3, L.hair);
          p.d(x - 6.5, y - 4, 3, 5, L.hair);
          p.dl(x - 5, y - 7.5, x - 3, y - 9.5, 1.5, L.hair); p.dl(x - 1, y - 8, x + 1, y - 10.5, 1.5, L.hair); p.dl(x + 3, y - 7.5, x + 5, y - 9, 1.5, L.hair);
          p.dl(x - 6, y - 3.5, x + 5.5, y - 4.5, 1.6, L.band);
          p.d(x + 1, y - 2.5, 4, 1, L.hair);
        }
        if (ex.hurt) { p.d(x + 1, y - 0.5, 2, 1, INK); p.d(x + 4, y - 0.5, 2, 1, INK); p.d(x + 3, y + 3, 2, 1, "#9b3d52"); }
        else { p.d(x + 1.5, y - 1.5, 1, 2, INK); p.d(x + 4.2, y - 1.5, 1, 2, INK); p.d(x + 3, y + 2.5, 2, 1, "#b0475b"); p.d(x - 0.5, y + 1.5, 2, 1, "#ff9db5"); }
      },
      weapon(p, P0, ex) { if (ex.w) drawWeapon(p, ex.w, P0.hF[0], P0.hF[1], P0.wa); },
    });
    return {
      id: "h_" + id, cw: 96, ch: 84, ax: 48, ay: 76, scale: id === "gom" ? 1.24 : 1.18,
      draw(p, anim, f, extra) {
        const fr = HERO_POSE[anim] || HERO_POSE.idle;
        const P0 = fr[f % fr.length];
        human(p, look, P0, { hurt: anim === "hurt" || anim === "fall" || anim === "lie", w: anim === "lie" || anim === "fall" ? "" : extra });
      },
    };
  }

  // ───────────────────────── 잡몹
  const ZLOOK = { skin: "#a8cfa0", skinD: "#8fb987", top: "#bcd7f5", topD: "#93b6dc", pants: "#596273", pantsD: "#434a57", shoe: "#3a2f2a", shoeD: "#2a221e", lw: 4, aw: 3, tw: 9 };
  const ZPOSE = {
    move: [0, 1, 2, 3].map((i) => P({ neck: [4, -27 + (i % 2)], head: [11, -26 + (i % 2)], hF: [10, -15], hB: [7, -14], fF: [[4, 0], [1, -2], [-4, 0], [0, 0]][i], fB: [[-4, 0], [0, 0], [4, 0], [1, -2]][i] })),
    wind: [P({ neck: [1, -28], head: [2, -35], hF: [5, -18], hB: [2, -17], fF: [5, 0], fB: [-5, 0] })],
    atk: [P({ neck: [6, -27], head: [23, -25], hF: [11, -17], hB: [9, -16], fF: [7, 0], fB: [-6, 0] })],
    hurt: [P({ neck: [-2, -29], head: [-5, -34], hF: [-3, -29], hB: [-8, -26], fF: [4, 0], fB: [-6, 0] })],
    fall: [FALL], lie: [LIE], getup: [GETUP],
  };
  const ZOMBIE = {
    id: "zombie", cw: 92, ch: 80, ax: 38, ay: 74, scale: 1.2,
    draw(p, anim, f) {
      const fr = ZPOSE[anim] || ZPOSE.move;
      const P0 = fr[f % fr.length];
      human(p, Object.assign({}, ZLOOK, {
        torso(pp, Q) {
          pp.g(); torsoLine(pp, Q, 9, ZLOOK.top);
          if (Q.hip[1] < -8) { const [nx, ny] = Q.neck; pp.dl(nx + 1, ny + 2, nx + 1.5, ny + 9, 2, "#e03131"); }
        },
        head(pp, Q) {
          const [x, y] = Q.head;
          pp.g(); pp.o(x, y, 6, 5.5, ZLOOK.skin);
          pp.dl(x - 5, y - 4, x + 4, y - 5, 1, "#5d6b62"); pp.dl(x - 4, y - 5, x + 2, y - 6, 1, "#5d6b62");
          if (anim === "hurt" || anim === "fall" || anim === "lie") { pp.d(x + 1, y - 1, 2, 1, INK); pp.d(x + 4, y - 1, 2, 1, INK); }
          else { pp.d(x + 1, y - 2, 2, 2, "#fff"); pp.d(x + 4, y - 2, 2, 2, "#fff"); pp.d(x + 2, y - 1, 1, 1, INK); pp.d(x + 5, y - 1, 1, 1, INK); pp.d(x + 1, y, 5, 1, "#6f9468"); }
          pp.d(x + 2, y + 3, 3, 1, "#4a5a48");
        },
      }), P0, {});
    },
  };
  const LUMP = {
    id: "lump", cw: 64, ch: 50, ax: 32, ay: 46, scale: 1.35,
    draw(p, anim, f) {
      let rx = 11, ry = 9, cy = -9, ox = 0;
      if (anim === "idle" && f) { rx = 12; ry = 8; cy = -8; }
      if (anim === "move") { if (f % 2) { rx = 12; ry = 8; cy = -8; } else { rx = 10; ry = 10; cy = -11; } }
      if (anim === "wind") { rx = 13; ry = 7; cy = -7; ox = -2; }
      if (anim === "atk") { rx = 13; ry = 8; cy = -9; ox = 4; }
      if (anim === "lie" || anim === "fall") { rx = 13; ry = 5; cy = -5; }
      p.g(); p.o(ox, cy, rx, ry, "#b06ad9");
      p.de(ox - 3, cy - 3, Math.round(rx * 0.45), Math.round(ry * 0.35), "#d39bf2");
      p.dl(ox - 7, cy + 1, ox - 2, cy + 4, 1, "#7a3aa3"); p.dl(ox - 2, cy + 4, ox + 3, cy + 1, 1, "#7a3aa3");
      p.dl(ox - 8, cy - 3, ox - 5, cy - 6, 1, "#7a3aa3"); p.dl(ox + 6, cy + 3, ox + 9, cy - 1, 1, "#7a3aa3");
      if (anim === "hurt" || anim === "lie" || anim === "fall") {
        p.dl(ox + 1, cy - 4, ox + 4, cy - 1, 1, INK); p.dl(ox + 1, cy - 1, ox + 4, cy - 4, 1, INK);
        p.dl(ox + 6, cy - 4, ox + 9, cy - 1, 1, INK); p.dl(ox + 6, cy - 1, ox + 9, cy - 4, 1, INK);
      } else {
        p.d(ox + 1, cy - 3, 3, 3, "#fff"); p.d(ox + 6, cy - 3, 3, 3, "#fff");
        p.d(ox + 3, cy - 2, 1, 2, INK); p.d(ox + 8, cy - 2, 1, 2, INK);
        p.dl(ox + 0, cy - 5, ox + 4, cy - 4, 1, INK); p.dl(ox + 9, cy - 5, ox + 6, cy - 4, 1, INK);
        p.d(ox + 4, cy + 2, 4, 1, INK);
      }
    },
  };
  const BAT = {
    id: "bat", cw: 60, ch: 44, ax: 30, ay: 34, scale: 1.35,
    draw(p, anim, f) {
      const dive = anim === "dive" || anim === "wind";
      const up = dive ? 0 : f % 2 === 0;
      const hurt = anim === "hurt" || anim === "lie" || anim === "fall";
      p.g();
      for (const s of [-1, 1]) {
        if (dive) { p.l(s * 3, -7, s * 11, -12, 3, "#3b2a45"); p.l(s * 11, -12, s * 14, -5, 2, "#3b2a45"); }
        else if (up) { p.l(s * 3, -7, s * 11, -16, 3, "#3b2a45"); p.l(s * 11, -16, s * 15, -9, 2, "#3b2a45"); }
        else { p.l(s * 3, -6, s * 11, -2, 3, "#3b2a45"); p.l(s * 11, -2, s * 14, -9, 2, "#3b2a45"); }
      }
      p.g(); p.o(0, -7, 5, 5.5, "#7a4b2a");
      p.dl(0, -11, 1, -3, 1, "#4a2a15");
      p.d(-2, -14, 1, 2, "#7a4b2a"); p.d(2, -14, 1, 2, "#7a4b2a");
      if (hurt) { p.d(-3, -8, 2, 1, INK); p.d(2, -8, 2, 1, INK); }
      else { p.d(-3, -9, 2, 2, "#ffe066"); p.d(2, -9, 2, 2, "#ffe066"); p.d(-2, -8, 1, 1, "#c92a2a"); p.d(3, -8, 1, 1, "#c92a2a"); p.d(-1, -5, 1, 1, "#fff"); p.d(1, -5, 1, 1, "#fff"); }
    },
  };
  const GHOST = {
    id: "ghost", cw: 60, ch: 62, ax: 30, ay: 58, scale: 1.3,
    draw(p, anim, f) {
      const w = anim === "move" && f % 2 ? 1 : 0;
      const lie = anim === "lie" || anim === "fall";
      p.g();
      if (lie) { p.o(0, -6, 12, 6, "#e7f5ff"); p.d(-5, -8, 3, 1, INK); p.d(2, -8, 3, 1, INK); return; }
      p.l(-8, -16, -12, -12 - w, 3, "#e7f5ff"); p.l(8, -16, 12, -13 + w, 3, "#e7f5ff");
      p.o(0, -22, 9, 9, "#e7f5ff");
      p.r(-9, -22, 18, 11, "#e7f5ff");
      p.r(-9, -12, 4, 3 + w, "#e7f5ff"); p.r(-3, -12, 5, 3 - w + 1, "#e7f5ff"); p.r(4, -12, 5, 3 + w, "#e7f5ff");
      p.de(-3, -26, 3, 2, "#ffffff");
      p.d(0, -16, 2, 5, "#e03131"); p.d(-1, -17, 4, 1, "#c92a2a");
      if (anim === "hurt") { p.d(-5, -23, 3, 1, INK); p.d(2, -23, 3, 1, INK); }
      else { p.d(-5, -24, 3, 2, INK); p.d(2, -24, 3, 2, INK); p.d(-5, -24, 3, 1, "#cfe8ff"); p.d(2, -24, 3, 1, "#cfe8ff"); p.d(-5, -21, 3, 1, "#a5c8ef"); p.d(2, -21, 3, 1, "#a5c8ef"); }
      if (anim === "wind" || anim === "atk") p.de(0, -18, 2, 2, "#364152"); else p.d(-1, -19, 3, 1, "#364152");
    },
  };
  const BOMB = {
    id: "bomb", cw: 56, ch: 56, ax: 28, ay: 50, scale: 1.35,
    draw(p, anim, f) {
      const lie = anim === "lie" || anim === "fall";
      const big = anim === "fuse" && f % 2 ? 1 : 0;
      p.g();
      if (!lie) {
        const a = f % 2;
        p.r(-6, -3 - (a ? 2 : 0), 4, 3, "#343a40"); p.r(2, -3 - (a ? 0 : 2), 4, 3, "#343a40");
      }
      p.g(); p.o(0, lie ? -6 : -11, 8 + big, (lie ? 6 : 8) + big, anim === "fuse" && f % 2 ? "#ff8787" : "#f03e3e");
      p.de(-3, lie ? -9 : -15, 2, 2, "#ffa8a8");
      p.g(); p.l(4, lie ? -11 : -18, 7, lie ? -14 : -22, 2, "#868e96");
      p.d(6 + (f % 2), (lie ? -16 : -25) + (f % 2), 2, 2, f % 2 ? "#ffd43b" : "#ff922b");
      const cy = lie ? -6 : -11;
      if (anim === "hurt" || lie) { p.d(-4, cy - 2, 3, 1, INK); p.d(1, cy - 2, 3, 1, INK); }
      else {
        p.d(-4, cy - 3, 3, 3, "#fff"); p.d(1, cy - 3, 3, 3, "#fff"); p.d(-2, cy - 2, 1, 2, INK); p.d(3, cy - 2, 1, 2, INK);
        p.dl(-5, cy - 5, -1, cy - 3, 1, INK); p.dl(5, cy - 5, 1, cy - 3, 1, INK);
        p.d(-3, cy + 2, 6, 2, "#fff"); p.d(-1, cy + 2, 1, 2, INK); p.d(1, cy + 2, 1, 2, INK);
      }
    },
  };

  // ───────────────────────── 보스
  const GOLEM = {
    id: "golem", cw: 150, ch: 130, ax: 68, ay: 122, scale: 1.42,
    draw(p, anim, f) {
      const lie = anim === "lie" || anim === "die";
      if (lie) {
        for (let i = 0; i < 6; i++) { p.g(); p.r(-30 + i * 9 + (i % 2) * 3, -6 - (i % 3) * 3, 16, 5, i % 2 ? "#f1f3f5" : "#dee2e6"); }
        p.g(); p.r(-6, -14, 14, 4, "#212529");
        p.d(-14, -7, 3, 1, INK); p.d(-6, -7, 3, 1, INK);
        return;
      }
      const jit = (i) => (anim === "idle" ? ((i + f) % 3) - 1 : anim === "hurt" ? (i % 2 ? 2 : -2) : (i % 2)) * 0.7;
      const step = anim === "move" ? f % 4 : 0;
      p.g(); p.r(-15, -8 - (step === 1 ? 2 : 0), 11, 8, "#ced4da"); p.g(); p.r(5, -8 - (step === 3 ? 2 : 0), 11, 8, "#ced4da");
      // 뒤쪽 팔 (서류 두루마리)
      let aB = [-24, -26], aF = [26, -28];
      if (anim === "wind") { aB = [-14, -66]; aF = [12, -70]; }
      if (anim === "slam") { aB = [10, -8]; aF = [30, -6]; }
      if (anim === "throwW") { aF = [-22, -52]; }
      if (anim === "throw") { aF = [34, -46]; }
      if (anim === "slide") { aB = [-26, -34]; aF = [30, -40]; }
      p.g(); p.l(-14, -42, aB[0], aB[1], 7, "#e9ecef"); p.o(aB[0], aB[1], 4, 4, "#dee2e6");
      for (let i = 0; i < 10; i++) {
        p.g();
        const y = -10 - i * 5;
        p.r(-18 + jit(i), y - 5, 36 + (i % 2 ? 2 : 0), 5, i % 2 ? "#f8f9fa" : "#e3e7eb");
        if (i === 3) p.d(-12 + jit(i), y - 4, 5, 3, "#ffe066");
        if (i % 3 === 1) p.d(15 + jit(i), y - 4, 4, 3, ["#ff8fb8", "#8fd3ff", "#ffd166"][i % 3 === 1 ? (i / 3) | 0 : 0] || "#ff8fb8");
        if (i === 8) p.d(-20 + jit(i), y - 4, 4, 3, "#8fe0a8");
        if (i === 6) p.d(8 + jit(i), y - 4, 5, 3, "#a5d8ff");
      }
      p.d(-13, -46, 26, 5, "#2b2f36");
      if (anim === "hurt") { p.dl(-9, -45, -6, -42, 1, "#ff6b6b"); p.dl(-9, -42, -6, -45, 1, "#ff6b6b"); p.dl(5, -45, 8, -42, 1, "#ff6b6b"); p.dl(5, -42, 8, -45, 1, "#ff6b6b"); }
      else { p.d(-9, -45, 4, 2, "#ff6b6b"); p.d(5, -45, 4, 2, "#ff6b6b"); p.d(-8, -45, 2, 1, "#ffe3e3"); p.d(6, -45, 2, 1, "#ffe3e3"); }
      p.g(); p.r(-9, -66, 18, 6, "#212529"); p.d(-7, -65, 14, 1, "#495057");
      p.g(); p.l(-6, -66, -10, -74, 2, "#adb5bd"); p.l(6, -66, 10, -74, 2, "#adb5bd");
      p.g(); p.l(14, -42, aF[0], aF[1], 8, "#f8f9fa"); p.o(aF[0], aF[1], 4.5, 4.5, "#e9ecef");
      p.dl(14 + (aF[0] - 14) * 0.5, -42 + (aF[1] + 42) * 0.5, 14 + (aF[0] - 14) * 0.55, -42 + (aF[1] + 42) * 0.55, 8, "#74c0fc");
    },
  };
  const KLOOK = { skin: "#d5dbe1", skinD: "#aeb6bf", top: "#adb5bd", topD: "#7d8791", pants: "#8a939c", pantsD: "#68717a", shoe: "#495057", shoeD: "#343a40", lw: 5, aw: 4, tw: 11, fist: 2 };
  const KPOSE = {
    idle: [P({ hF: [9, -23], wa: -0.9 }), P({ by: 1, hF: [9, -22], wa: -0.9 })],
    move: [P({ fF: [6, 0], fB: [-6, 0], hF: [9, -23], wa: -0.9 }), P({ by: -1, fF: [2, -3], fB: [-1, 0], hF: [9, -23], wa: -0.9 }), P({ fF: [-5, 0], fB: [6, 0], hF: [9, -23], wa: -0.9 }), P({ by: -1, fF: [0, 0], fB: [3, -3], hF: [9, -23], wa: -0.9 })],
    windDash: [P({ lean: -2, by: 1, hF: [-3, -33], eF: [-2, -27], wa: -2.7, fF: [7, 0], fB: [-7, 0] })],
    dash: [P({ lean: 4, by: 1, hF: [15, -23], wa: 0.05, fF: [9, 0], fB: [-9, -2] })],
    windSpin: [P({ by: 2, hF: [10, -27], wa: -0.3, fF: [7, 0], fB: [-7, 0] })],
    spin: [P({ hF: [15, -26], hB: [-12, -26], wa: 0 }), P({ hF: [-13, -26], hB: [12, -26], wa: Math.PI })],
    call: [P({ hF: [5, -40], eF: [3, -34], wa: -1.6 })],
    hurt: [P({ lean: -4, hx: -2, hF: [0, -30], hB: [-7, -27], wa: -2.2 })],
    lie: [LIE], die: [LIE],
  };
  const KNIGHT = {
    id: "knight", cw: 230, ch: 134, ax: 104, ay: 126, scale: 2.15,
    draw(p, anim, f, extra) {
      const fr = KPOSE[anim] || KPOSE.idle;
      const P0 = fr[f % fr.length];
      human(p, Object.assign({}, KLOOK, {
        behind(pp, Q) { if (Q.hip[1] > -8) return; pp.g(); pp.l(Q.neck[0] - 3, Q.neck[1] + 2, Q.hip[0] - 7, -3, 7, "#c92a2a"); pp.dl(Q.neck[0] - 3, Q.neck[1] + 4, Q.hip[0] - 6, -4, 2, "#e03131"); },
        torso(pp, Q) { pp.g(); torsoLine(pp, Q, 11, "#b6bec6"); if (Q.hip[1] < -8) { pp.d(Q.hip[0] - 5, Q.hip[1] - 3, 11, 2, "#f2b33d"); pp.d(Q.neck[0] - 2, Q.neck[1] + 5, 4, 3, "#ced4da"); } },
        head(pp, Q) {
          const [x, y] = Q.head;
          pp.g(); pp.o(x, y, 7, 7, "#f2b33d"); pp.o(x, y, 5, 5, "#fff6d5");
          const a1 = -Math.PI / 2 + (f % 4) * 0.4, a2 = -Math.PI / 2 + 2.6;
          pp.dl(x, y, x + Math.cos(a1) * 4, y + Math.sin(a1) * 4, 1, INK); pp.dl(x, y, x + Math.cos(a2) * 3, y + Math.sin(a2) * 3, 1, INK);
          pp.d(x - 3, y - 2, 2, 1, "#e03131"); pp.d(x + 2, y - 2, 2, 1, "#e03131");
          pp.g(); pp.l(x - 2, y - 7, x - 6, y - 11, 2, "#c92a2a"); pp.l(x, y - 7, x - 2, y - 12, 2, "#e03131");
        },
        weapon(pp, Q) {
          const c = Math.cos(Q.wa), s = Math.sin(Q.wa), [hx, hy] = Q.hF;
          pp.g(); pp.l(hx - c * 3, hy - s * 3, hx + c * 26, hy + s * 26, 2.5, "#343a40");
          pp.l(hx + c * 22, hy + s * 22, hx + c * 28, hy + s * 28, 3.5, "#f2b33d");
          pp.l(hx - s * 3, hy + c * 3, hx + s * 3, hy - c * 3, 2, "#f2b33d");
        },
      }), P0, {});
    },
  };
  const GLOOK = { skin: "#f0c8a0", skinD: "#d9ad85", top: "#2f9e44", topD: "#237a35", pants: "#3d4451", pantsD: "#2d333d", shoe: "#22252b", shoeD: "#16181c", lw: 6, aw: 5, tw: 15, fist: 2.5, neckW: 5 };
  const GPOSE = {
    idle: [P({ hF: [10, -15], hB: [-7, -15] }), P({ by: 1, hF: [10, -14], hB: [-7, -14] })],
    move: [P({ fF: [5, 0], fB: [-5, 0], hF: [10, -15], hB: [-7, -15] }), P({ by: -1, fF: [2, -3], fB: [-1, 0], hF: [10, -16], hB: [-6, -16] }), P({ fF: [-4, 0], fB: [5, 0], hF: [10, -15], hB: [-7, -15] }), P({ by: -1, fF: [0, 0], fB: [3, -3], hF: [10, -16], hB: [-6, -16] })],
    windRush: [P({ lean: -2, by: 2, hF: [-6, -18], hB: [-10, -17], fF: [7, 0], fB: [-7, 0] })],
    rush: [P({ lean: 5, by: 1, hF: [15, -23], hB: [13, -21], fF: [8, 0], fB: [-8, -2] })],
    jump: [P({ by: -3, fF: [5, -6], kF: [8, -12], fB: [-5, -5], kB: [-1, -11], hF: [10, -34], hB: [-6, -33] })],
    windSwing: [P({ lean: -3, hF: [-9, -31], hB: [-6, -17] })],
    swing: [P({ lean: 4, hF: [17, -26], hB: [-5, -18], fF: [7, 0], fB: [-6, 0] })],
    hurt: [P({ lean: -4, hx: -2, hF: [0, -28], hB: [-8, -25] })],
    lie: [LIE], die: [LIE],
  };
  const GIANT = {
    id: "giant", cw: 176, ch: 136, ax: 82, ay: 128, scale: 2.35,
    draw(p, anim, f) {
      const fr = GPOSE[anim] || GPOSE.idle;
      const P0 = fr[f % fr.length];
      human(p, Object.assign({}, GLOOK, {
        torso(pp, Q) {
          pp.g(); torsoLine(pp, Q, 15, GLOOK.top);
          if (Q.hip[1] < -8) {
            const [hx, hy] = Q.hip, [nx, ny] = Q.neck, mx = (hx + nx) / 2, my = (hy + ny) / 2;
            pp.d(mx - 6, my - 3, 4, 3, "#fff3bf"); pp.d(mx - 1, my - 3, 4, 3, "#fff3bf"); pp.d(mx + 4, my - 3, 3, 3, "#fff3bf");
            pp.d(mx - 7, my + 2, 15, 1, "#fab005");
          }
        },
        head(pp, Q) {
          const [x, y] = Q.head;
          pp.g(); pp.o(x, y, 6, 6, GLOOK.skin);
          pp.de(x - 1, y - 4, 6, 2.5, "#343a40");
          pp.g(); pp.l(x - 6, y - 3, x + 4, y - 8, 1.5, "#495057"); pp.o(x - 5, y, 2, 2.5, "#f03e3e");
          if (anim === "hurt" || anim === "lie" || anim === "die") { pp.d(x + 1, y - 1, 2, 1, INK); pp.d(x + 4, y - 1, 2, 1, INK); }
          else { pp.d(x + 1, y - 2, 2, 1, INK); pp.d(x + 4, y - 2, 2, 1, INK); pp.d(x + 1, y, 5, 1, "#c9a27f"); }
          pp.d(x + 2, y + 3, 4, 1, "#7a4b3a");
        },
        front(pp, Q) {
          if (Q.hip[1] > -8) return;
          const [hx, hy] = Q.hF;
          pp.g(); pp.l(hx, hy, hx, hy + 5, 1, "#ced4da"); pp.o(hx, hy + 7, 2, 2, "#fab005");
        },
      }), P0, {});
    },
  };
  const DLOOK = { skin: "#c9b6ea", skinD: "#a993d2", top: "#6741d9", topD: "#4c2fb0", pants: "#3b2a7a", pantsD: "#2b1f5a", shoe: "#211a3a", shoeD: "#18132a", lw: 5, aw: 4, tw: 12, fist: 2 };
  const DPOSE = {
    idle: [P({ hF: [9, -24], hB: [-5, -22] }), P({ by: -1, hF: [9, -25], hB: [-5, -23] })],
    move: [P({ hF: [9, -24], hB: [-5, -22] }), P({ by: -1, hF: [10, -25], hB: [-5, -23] })],
    cast: [P({ lean: 2, hF: [16, -30], hB: [-4, -26] })],
    windSwipe: [P({ lean: -2, hF: [-6, -37], eF: [-3, -32], hB: [-5, -22] })],
    swipe: [P({ lean: 4, hF: [17, -21], hB: [-3, -24] })],
    raise: [P({ hF: [6, -42], eF: [4, -35], hB: [-4, -42], eB: [-3, -35] })],
    hurt: [P({ lean: -4, hx: -2, hF: [0, -30], hB: [-8, -26] })],
    lie: [LIE], die: [LIE],
  };
  const DEMON = {
    id: "demon", cw: 176, ch: 138, ax: 82, ay: 130, scale: 2.1,
    draw(p, anim, f, extra) {
      const p2 = extra === "p2";
      const fr = DPOSE[anim] || DPOSE.idle;
      const P0 = fr[f % fr.length];
      const robe = p2 ? "#9c36b5" : "#6741d9", robeD = p2 ? "#6f1f85" : "#4c2fb0";
      human(p, Object.assign({}, DLOOK, { top: robe, topD: robeD,
        behind(pp, Q) {
          if (Q.hip[1] > -8) return;
          pp.g(); pp.l(Q.neck[0] - 2, Q.neck[1] + 1, Q.hip[0] - 10, -2, 10, "#1b1530"); pp.dl(Q.neck[0] - 3, Q.neck[1] + 4, Q.hip[0] - 10, -3, 3, p2 ? "#ff6b6b" : "#c92a2a");
        },
        torso(pp, Q) {
          pp.g(); torsoLine(pp, Q, 12, robe);
          if (Q.hip[1] < -8) {
            pp.g(); pp.l(Q.hip[0], Q.hip[1] - 2, Q.hip[0] + 1, -3, 14, robe);
            pp.d(Q.hip[0] - 6, -6, 13, 2, "#f2b33d");
            pp.d(Q.neck[0] - 1, Q.neck[1] + 4, 3, 4, "#f2b33d");
          }
        },
        head(pp, Q) {
          const [x, y] = Q.head;
          pp.g(); pp.l(x - 4, y - 4, x - 7, y - 10, 2, "#f1e3c8"); pp.l(x - 7, y - 10, x - 5, y - 14, 1.5, "#f1e3c8");
          pp.l(x + 3, y - 4, x + 6, y - 10, 2, "#f1e3c8"); pp.l(x + 6, y - 10, x + 4, y - 14, 1.5, "#f1e3c8");
          pp.g(); pp.o(x, y, 6, 6, DLOOK.skin);
          pp.g(); pp.r(x - 5, y - 9, 10, 3, "#f2b33d"); pp.d(x - 2, y - 11, 4, 3, "#fff"); pp.d(x - 2, y - 11, 4, 1, "#e03131");
          const eye = p2 ? "#ff3b3b" : "#ffe066";
          if (anim === "hurt" || anim === "lie" || anim === "die") { pp.d(x + 1, y - 1, 2, 1, INK); pp.d(x + 4, y - 1, 2, 1, INK); }
          else { pp.d(x + 1, y - 2, 2, 2, eye); pp.d(x + 4, y - 2, 2, 2, eye); pp.dl(x, y - 4, x + 3, y - 3, 1, INK); pp.dl(x + 6, y - 4, x + 4, y - 3, 1, INK); }
          pp.d(x + 1, y + 3, 5, 1, "#3b1f4f"); pp.d(x + 2, y + 3, 1, 2, "#fff"); pp.d(x + 4, y + 3, 1, 2, "#fff");
        },
      }), P0, {});
    },
  };

  // ───────────────────────── 깨지는 물건 · 아이템
  const PROP = {
    id: "prop", cw: 46, ch: 54, ax: 23, ay: 50, scale: 1.3,
    draw(p, kind) {
      p.g();
      if (kind === "cooler") {
        p.r(-6, -18, 12, 18, "#e9ecef"); p.d(-4, -14, 2, 2, "#e03131"); p.d(2, -14, 2, 2, "#4dabf7"); p.d(-5, -6, 10, 1, "#ced4da");
        p.g(); p.r(-5, -29, 10, 11, "#74c0fc"); p.d(-3, -27, 2, 7, "#d0ebff"); p.r(-2, -31, 4, 2, "#4dabf7");
      } else if (kind === "plant") {
        p.r(-6, -10, 12, 10, "#d9480f"); p.d(-6, -10, 12, 2, "#f76707");
        p.g(); p.o(-4, -15, 4, 4, "#40c057"); p.o(4, -16, 4, 4, "#37b24d"); p.o(0, -21, 4, 5, "#51cf66"); p.d(-1, -22, 2, 2, "#8ce99a");
      } else if (kind === "trash") {
        p.r(-6, -16, 12, 16, "#adb5bd"); p.d(-3, -13, 1, 11, "#868e96"); p.d(1, -13, 1, 11, "#868e96");
        p.g(); p.r(-7, -19, 14, 3, "#868e96"); p.r(-2, -21, 4, 2, "#868e96");
      } else if (kind === "box") {
        p.r(-8, -14, 16, 14, "#d4a373"); p.d(-1, -14, 2, 14, "#f1e3b5"); p.d(-8, -9, 16, 1, "#b8865b");
      } else {
        p.r(-5, -18, 10, 18, "#ff922b"); p.d(-5, -12, 10, 3, "#fff"); p.g(); p.r(-7, -2, 14, 2, "#e8590c");
      }
    },
  };
  const ITEM = {
    id: "item", cw: 38, ch: 28, ax: 19, ay: 23, scale: 1.25,
    draw(p, kind) {
      p.g();
      if (kind === "bento") { p.r(-7, -8, 14, 8, "#fff4e6"); p.g(); p.r(-8, -10, 16, 3, "#e03131"); p.d(-5, -6, 4, 3, "#ffd43b"); p.d(0, -6, 5, 3, "#69db7c"); }
      else if (kind === "banana") { p.l(-6, -6, -2, -2, 3, "#ffd43b"); p.l(-2, -2, 4, -3, 3, "#ffd43b"); p.l(4, -3, 6, -7, 3, "#ffd43b"); p.d(6, -9, 1, 2, "#5c3d2e"); }
      else if (kind === "vita") { p.r(-3, -12, 6, 12, "#a9721f"); p.d(-3, -8, 6, 4, "#ff922b"); p.r(-2, -14, 4, 2, "#fab005"); }
      else if (kind === "coupon") { p.r(-8, -8, 16, 8, "#fff3bf"); p.d(-6, -6, 4, 4, "#8d5524"); p.d(-1, -6, 6, 1, "#e8590c"); p.d(-1, -3, 5, 1, "#e8590c"); }
      else if (kind === "envelope") { p.r(-7, -9, 14, 9, "#ffffff"); p.dl(-7, -9, 0, -4, 1, "#adb5bd"); p.dl(7, -9, 0, -4, 1, "#adb5bd"); p.o(0, -4, 1.5, 1.5, "#e03131"); }
      else if (kind === "paper") { p.l(-8, -4, 7, -6, 4, "#f8fafc"); p.dl(-2, -5, -1, -5, 4, "#74c0fc"); p.dl(5, -6, 6, -6, 4, "#ffd43b"); }
      else if (kind === "umbrella") { p.l(-9, -4, 9, -6, 3, "#7048e8"); p.l(-9, -4, -11, -1, 2, "#6b4226"); }
    },
  };
  const ITEMS = {
    bento: { name: "도시락", heal: 45 }, banana: { name: "바나나", heal: 20 }, vita: { name: "비타민 음료", heal: 30 },
    coupon: { name: "커피 쿠폰", pts: 500 }, envelope: { name: "보너스 봉투", pts: 1500 },
    paper: { name: "둘둘 만 서류", weapon: true }, umbrella: { name: "우산", weapon: true },
  };
  const WEAPON = {
    paper: { dmg: 3, reach: 6, uses: 8, s: 3, a: 3, r: 7 },
    umbrella: { dmg: 6, reach: 12, uses: 6, s: 5, a: 4, r: 9 },
  };

  // ───────────────────────── 주인공 · 적 · 스테이지 자료
  const HERO = {
    mint: { name: "민트", spd: 76, spdY: 48, run: 152, hp: 100, dmg: 1, throwPow: 1, jab: [3, 3, 6], kick: [4, 4, 11], pace: 1 },
    gom: { name: "곰손", spd: 60, spdY: 40, run: 124, hp: 110, dmg: 1.5, throwPow: 1.6, jab: [5, 3, 8], kick: [6, 4, 14], pace: 0.85 },
  };
  // reach: 이만큼 붙으면 공격 · wait: 차례를 기다리며 서 있는 거리 · cd: 다음 공격까지 [최소, 최대]초
  const FOE = {
    lump: { name: "뭉침 덩어리", def: LUMP, hp: 22, pts: 100, w: 14, h: 26, spd: 36, reach: 26, wait: 62, wind: 0.48, atkT: 0.26, hitAt: 0.04, rec: 0.55, lunge: 150, box: [0, 22, 0, 20], dmg: 8, cd: [1.3, 2.3], grab: true },
    zombie: { name: "거북목 좀비", def: ZOMBIE, hp: 30, pts: 150, w: 10, h: 48, spd: 27, reach: 34, wait: 66, wind: 0.55, atkT: 0.24, hitAt: 0.05, rec: 0.6, box: [6, 38, 22, 44], dmg: 10, cd: [1.5, 2.5], grab: true },
    bat: { name: "카페인 박쥐", def: BAT, hp: 11, pts: 200, w: 10, h: 16, spd: 70, dmg: 6, cd: [1.8, 2.8] },
    ghost: { name: "야근 유령", def: GHOST, hp: 24, pts: 250, w: 11, h: 36, spd: 24, dmg: 7, cd: [2.4, 3.4], grab: true },
    bomb: { name: "짜증 폭탄", def: BOMB, hp: 8, pts: 300, w: 10, h: 24, spd: 64, dmg: 16, grab: true },
  };
  const BOSS = {
    golem: { name: "서류 더미 골렘", def: GOLEM, hp: 170, w: 26, h: 96, spd: 32 },
    knight: { name: "마감 시계 기사", def: KNIGHT, hp: 215, w: 20, h: 94, spd: 46 },
    giant: { name: "만원 지하철 거인", def: GIANT, hp: 265, w: 28, h: 100, spd: 28 },
    demon: { name: "월요병 대마왕", def: DEMON, hp: 350, w: 20, h: 100, spd: 38 },
  };
  // 구역(at = 카메라가 멈추는 자리)마다 몰려오는 무리 · 물건은 [x, y, 종류, 나오는 것]
  const STAGES = [
    {
      name: "야근 사무실", boss: "golem", song: "s1", end: 1500,
      zones: [
        { at: 230, waves: [["lump", "lump"], ["lump", "zombie"]] },
        { at: 640, waves: [["zombie", "lump", "lump"], ["zombie", "lump"]] },
        { at: 1050, waves: [["lump", "bomb", "zombie"], ["zombie", "lump", "bomb", "lump"]] },
      ],
      props: [[150, 176, "cooler", "banana"], [470, 214, "plant", "paper"], [560, 172, "trash", "coupon"], [880, 200, "cooler", "vita"], [990, 222, "box", "envelope"], [1330, 186, "trash", "bento"]],
    },
    {
      name: "엘리베이터 홀 · 계단", boss: "knight", song: "s2", end: 1560,
      zones: [
        { at: 240, waves: [["zombie", "bat", "lump"], ["bomb", "zombie", "bat"]] },
        { at: 660, waves: [["bat", "lump", "zombie"], ["bomb", "lump", "zombie"]] },
        { at: 1080, waves: [["zombie", "zombie", "bat"], ["bomb", "bat", "zombie"]] },
      ],
      props: [[160, 212, "plant", "vita"], [500, 178, "box", "umbrella"], [600, 222, "trash", "coupon"], [930, 190, "plant", "banana"], [1010, 170, "box", "envelope"], [1380, 210, "trash", "bento"]],
    },
    {
      name: "지하철역 승강장", boss: "giant", song: "s3", end: 1600,
      zones: [
        { at: 250, waves: [["ghost", "lump", "zombie"], ["bat", "ghost", "bomb"]] },
        { at: 680, waves: [["zombie", "ghost", "lump"], ["bomb", "ghost", "zombie"]] },
        { at: 1110, waves: [["ghost", "bat", "lump"], ["bomb", "zombie", "ghost", "bat"]] },
      ],
      props: [[170, 184, "trash", "banana"], [520, 216, "box", "paper"], [610, 176, "cooler", "envelope"], [960, 206, "trash", "vita"], [1040, 228, "box", "coupon"], [1420, 182, "cooler", "bento"]],
    },
    {
      name: "퇴근길 거리 · 노을", boss: "demon", song: "s4", end: 1640,
      zones: [
        { at: 250, waves: [["zombie", "bat", "ghost"], ["bomb", "zombie", "lump"]] },
        { at: 700, waves: [["ghost", "zombie", "bomb"], ["lump", "ghost", "zombie", "bat"]] },
        { at: 1140, waves: [["zombie", "ghost", "bomb", "lump"], ["bat", "ghost", "zombie", "bomb", "lump"]] },
      ],
      props: [[160, 200, "cone", "vita"], [520, 176, "plant", "umbrella"], [620, 222, "trash", "envelope"], [980, 186, "box", "banana"], [1060, 214, "cone", "coupon"], [1460, 196, "plant", "bento"]],
    },
  ];

  // ───────────────────────── 배경 — 스테이지마다 고유 팔레트, 하늘 → 아주 먼 실루엣 → 먼 건물 → 중간 → 벽 · 바닥 → 앞 가림막
  const PAL = [
    { ink: "#140c2a", sky: ["#140c2a", "#18103a", "#1e1546", "#251b52", "#2d225f", "#36296c", "#3f3178"], star: ["#ffb3d1", "#fff6e0", "#9fc3ff"],
      far: ["#2a2360", "#30296a"], bld: ["#1f1848", "#261e55", "#2e2562"], win: "#ffd166", winD: "#8a6e66", neon: "#ff4f9a", neon2: "#ffb3d1",
      wall: ["#1f1844", "#272052", "#302862", "#3b3272", "#473e84"], desk: ["#2e1d3c", "#46294f", "#5e3762", "#7a4a74"], mon: "#9fc3ff", monD: "#2f3f8a",
      paper: ["#9d97c7", "#c9c3e6", "#ece7f7"], carpet: ["#211c46", "#28224f", "#2f2959", "#373064", "#41396f"], cream: "#fff6e0", warm: "#ffd166",
      grade: [124, 108, 220, 0.15], rim: ["#ff8fc7", -1], dust: ["#ffb3d1", "#9fc3ff"] },
    { ink: "#1a1220", sky: ["#140d18", "#1a1220", "#201627", "#271b2f", "#2e2036"], far: ["#2a1e30", "#33253a"],
      marble: ["#5b4352", "#77596a", "#937378", "#b08f88", "#ccad99", "#e6cbae"], brass: ["#6e4424", "#a8692e", "#d89a44", "#f2c46a", "#ffe6a8"],
      steel: ["#2f3446", "#454d65", "#626e88", "#8795ae", "#b0bdd2", "#dbe4f0"], green: "#3ddc84", amber: "#ffb340", floor: ["#22161f", "#2c1d29", "#382634", "#4a3444", "#5e4555"],
      velvet: ["#5a1f3a", "#7a2a4c", "#a03a5e"], cream: "#fff6e0", warm: "#ffd27a",
      grade: [255, 196, 150, 0.12], rim: ["#ffd27a", -1], dust: ["#ffe6a8", "#f2c46a"] },
    { ink: "#0e1420", sky: ["#0a0f18", "#0e1420", "#121a28", "#162030", "#1b2738"], far: ["#18233a", "#1f2c44"],
      tile: ["#22324a", "#2a3d52", "#35506a", "#3f5a70", "#5f8296", "#9fc2cc"], light: "#e6f1ef", warn: "#ffcc33", warn2: "#ff5a36",
      train: ["#56697a", "#7d93a3", "#a9bcc8", "#cfdde4", "#eef6f6"], conc: ["#2c3c4f", "#344659", "#3e5266", "#4a6074", "#5b7286"], cream: "#e6f1ef", warm: "#ffe08a",
      grade: [120, 168, 220, 0.15], rim: ["#9fe3ff", -1], dust: ["#9fc2cc", "#e6f1ef"] },
    { ink: "#1a1033", sky: ["#2e1650", "#3a1c5c", "#52226b", "#6b2a75", "#8a3074", "#a8366f", "#c4426a", "#e0505f", "#ef6a55", "#ff7f50", "#ff9a5e", "#ffb26b"],
      far: ["#6a3a7e", "#7a4384"], bld: ["#3a2462", "#43296c", "#4c3076"], mid: ["#2b2350", "#35295e", "#45407a"], sun: ["#ffe0a3", "#fff6e0"],
      shop: ["#2b2350", "#3a3068", "#45407a", "#574e8c", "#6a5f9e"], awn: ["#e0505f", "#ffe0a3", "#a8366f"], win: "#ffd08a", walk: ["#4c3a6c", "#5c4878", "#6e5786", "#806694", "#9a7aa4"],
      cream: "#fff6e0", warm: "#ffb26b",
      grade: [255, 150, 100, 0.14], rim: ["#ffb26b", 1], dust: ["#ffb3c7", "#ffe0a3"] },
  ];
  const R = (g, c, x, y, w, h) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  function bandsV(g, x, y, w, h, cols) {
    const n = cols.length, bh = h / n;
    for (let i = 0; i < n; i++) {
      const y0 = Math.round(y + i * bh), y1 = Math.round(y + (i + 1) * bh);
      R(g, cols[i], x, y0, w, y1 - y0);
      if (i < n - 1) {
        g.fillStyle = cols[i + 1];
        for (let xx = x; xx < x + w; xx += 4) { g.fillRect(xx + 2, y1 - 3, 1, 1); }
        for (let xx = x + ((y1 - 2) & 1); xx < x + w; xx += 2) g.fillRect(xx, y1 - 2, 1, 1);
        for (let xx = x; xx < x + w; xx += 4) { g.fillRect(xx, y1 - 1, 3, 1); }
      }
    }
  }
  function disc(g, c, cx, cy, r) { g.fillStyle = c; ell(g, cx, cy, r, r); }
  function cone(g, x, y, tw, bw, h, col, a) {
    const gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, rgba(col, a)); gr.addColorStop(1, rgba(col, 0));
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(x - tw / 2, y); g.lineTo(x + tw / 2, y); g.lineTo(x + bw / 2, y + h); g.lineTo(x - bw / 2, y + h); g.closePath(); g.fill();
  }
  function seeded(n) { let sd = n; return () => (sd = (sd * 16807) % 2147483647) / 2147483647; }
  function buildArt(theme) {
    const P = PAL[theme], r = seeded(theme * 7919 + 101);
    const L = (w, h, par, y) => ({ c: mk(w, h), par, y: y || 0, glows: [], pools: [] });
    const sky = mk(VW, 152), gs = sky.getContext("2d");
    const skyGlows = [];
    const l1 = L(384, 152, 0.07), l2 = L(512, 152, 0.2), l3 = L(512, 152, 0.42), wall = L(512, 164, 1), fg = L(640, VH, 1.35);
    const floor = mk(128, 88), gf = floor.getContext("2d");
    const g1 = l1.c.getContext("2d"), g2 = l2.c.getContext("2d"), g3 = l3.c.getContext("2d"), gw = wall.c.getContext("2d"), gx = fg.c.getContext("2d");
    let layers = [l1, l2, l3];
    let reflect = false, train = false;
    if (theme === 0) {
      bandsV(gs, 0, 0, VW, 152, P.sky);
      for (let i = 0; i < 46; i++) { const x = (r() * VW) | 0, y = (r() * 90) | 0; R(gs, pick2(r, P.star), x, y, 1, 1); if (r() < 0.12) { R(gs, P.cream, x - 1, y, 3, 1); R(gs, P.cream, x, y - 1, 1, 3); } }
      disc(gs, mix(P.cream, P.sky[3], 0.15), 318, 30, 10); disc(gs, "#e8dcc0", 314, 27, 2); disc(gs, "#e8dcc0", 321, 34, 3); skyGlows.push([318, 30, 34, "#ffe0b0", 0.35]);
      for (let x = 0; x < 384;) { const w = 10 + ((r() * 20) | 0), h = 40 + ((r() * 70) | 0); R(g1, pick2(r, P.far), x, 152 - h, w, h); if (r() < 0.4) { R(g1, P.far[1], x + (w >> 1), 152 - h - 8, 1, 8); l1.glows.push([x + (w >> 1), 152 - h - 9, 5, "#ff4f6a", 0.7, "blink"]); R(g1, "#ff6a7a", x + (w >> 1), 152 - h - 9, 1, 1); } x += w + ((r() * 3) | 0); }
      for (let x = 0; x < 512;) {
        const w = 22 + ((r() * 34) | 0), h = 46 + ((r() * 74) | 0), c = pick2(r, P.bld);
        R(g2, c, x, 152 - h, w, h); R(g2, ramp(c, 0.6), x, 152 - h, w, 1); R(g2, ramp(c, 0.4), x, 152 - h, 1, h);
        for (let yy = 152 - h + 5; yy < 150; yy += 6) for (let xx = x + 3; xx < x + w - 3; xx += 5) { const q = r(); if (q < 0.26) R(g2, q < 0.08 ? P.win : P.winD, xx, yy, 2, 3); }
        if (r() < 0.3 && w > 30) { const sy = 152 - h + 10; R(g2, "#2a1430", x + 4, sy, w - 8, 9); R(g2, P.neon, x + 6, sy + 2, w - 12, 1); R(g2, P.neon2, x + 6, sy + 5, (w - 12) >> 1, 1); l2.glows.push([x + w / 2, sy + 4, 20, P.neon, 0.42, "flick"]); }
        x += w + 2 + ((r() * 6) | 0);
      }
      layers = [l1, l2];
      R(gw, P.wall[1], 0, 0, 512, 152);
      for (let y = 14; y < 112; y += 4) if ((y / 4) % 3 === 0) R(gw, mix(P.wall[1], P.wall[2], 0.35), 0, y, 512, 1);
      R(gw, P.wall[0], 0, 0, 512, 12); for (let x = 0; x < 512; x += 32) R(gw, mix(P.wall[0], P.ink, 0.5), x, 0, 1, 12); R(gw, P.ink, 0, 12, 512, 1);
      for (const wx of [20, 276]) {
        gw.clearRect(wx, 22, 156, 82);
        gw.fillStyle = "rgba(159,195,255,.07)"; gw.fillRect(wx, 22, 156, 82);
        for (let k = 0; k < 3; k++) { gw.fillStyle = "rgba(220,230,255,.05)"; gw.beginPath(); gw.moveTo(wx + 20 + k * 50, 22); gw.lineTo(wx + 34 + k * 50, 22); gw.lineTo(wx + 8 + k * 50, 104); gw.lineTo(wx - 6 + k * 50, 104); gw.fill(); }
        R(gw, P.wall[0], wx - 3, 19, 162, 3); R(gw, P.wall[0], wx - 3, 104, 162, 3); R(gw, P.wall[3], wx - 3, 107, 162, 2);
        R(gw, P.wall[0], wx - 3, 19, 3, 88); R(gw, P.wall[0], wx + 156, 19, 3, 88); R(gw, P.wall[0], wx + 76, 22, 3, 82); R(gw, P.wall[0], wx, 61, 156, 2);
      }
      R(gw, P.wall[2], 0, 112, 512, 40); R(gw, P.wall[3], 0, 112, 512, 1); R(gw, P.wall[0], 0, 150, 512, 2);
      for (const lx of [100, 356]) { wall.pools.push([lx, 120, "#fff1d0", 0.22]); R(gw, P.cream, lx - 22, 12, 44, 2); R(gw, P.wall[4], lx - 24, 14, 48, 1); cone(gw, lx, 15, 44, 120, 137, "#fff1d0", 0.09); wall.glows.push([lx, 14, 30, "#fff1d0", 0.32, "flick2"]); }
      // 벽시계 18:50 · 실적 화이트보드 · 하트 포스터
      disc(gw, P.wall[0], 236, 54, 10); disc(gw, "#ece7f7", 236, 54, 8); disc(gw, "#c9c3e6", 237, 55, 7); disc(gw, "#ece7f7", 236, 54, 6);
      R(gw, P.ink, 236, 48, 1, 6); R(gw, P.ink, 236, 54, 1, 1); R(gw, P.ink, 233, 56, 3, 1);
      R(gw, P.wall[0], 196, 68, 84, 40); R(gw, "#d9d4ee", 198, 70, 80, 36); R(gw, "#b5aedb", 198, 104, 80, 2);
      let gy = 96; for (let x = 202; x < 274; x += 4) { const ny = clamp(gy + ((r() * 9) | 0) - 5, 76, 100); R(gw, P.neon, x, Math.min(gy, ny), 1, Math.abs(ny - gy) + 1); R(gw, P.neon, x, ny, 4, 1); gy = ny; }
      R(gw, P.wall[0], 450, 30, 26, 34); R(gw, "#ffd1e6", 452, 32, 22, 30); disc(gw, P.neon, 459, 43, 3); disc(gw, P.neon, 466, 43, 3); R(gw, P.neon, 457, 44, 12, 4); R(gw, P.neon, 459, 48, 8, 2); R(gw, P.neon, 461, 50, 4, 2);
      for (const dx of [12, 140, 268, 396]) {
        R(gw, P.desk[3], dx, 121, 108, 2); R(gw, P.desk[2], dx, 123, 108, 4); R(gw, P.desk[0], dx, 127, 108, 1);
        R(gw, P.desk[1], dx + 4, 128, 100, 24); R(gw, P.desk[0], dx + 4, 128, 100, 1); R(gw, P.desk[2], dx + 70, 133, 28, 1); R(gw, P.desk[2], dx + 70, 141, 28, 1);
        R(gw, P.ink, dx + 18, 94, 36, 26); bandsV(gw, dx + 20, 96, 32, 21, [P.monD, mix(P.monD, P.mon, 0.4), mix(P.monD, P.mon, 0.7)]);
        for (let k = 0; k < 4; k++) R(gw, k === 1 ? "#ffd1e6" : "#e3eeff", dx + 23 + (k % 2) * 3, 99 + k * 4, 8 + ((r() * 14) | 0), 1);
        R(gw, P.ink, dx + 33, 120, 6, 2); R(gw, P.desk[0], dx + 26, 117, 0, 0);
        wall.glows.push([dx + 36, 106, 24, P.mon, 0.38, "mon"]); wall.pools.push([dx + 36, 70, P.mon, 0.16]);
        R(gw, "#3a3366", dx + 22, 118, 26, 3);
        const n = 3 + ((r() * 5) | 0);
        for (let k = 0; k < n; k++) { R(gw, P.paper[0], dx + 62 + (k % 2), 118 - k * 3, 24, 3); R(gw, P.paper[2 - (k % 2)], dx + 62 + (k % 2), 118 - k * 3, 24, 1); }
        R(gw, "#c2416a", dx + 92, 114, 6, 7); R(gw, "#e86a8e", dx + 92, 114, 6, 1); R(gw, "#c2416a", dx + 98, 116, 2, 3);
        if (dx === 140) { R(gw, P.ink, dx + 6, 104, 2, 17); R(gw, P.warm, dx + 2, 100, 10, 4); cone(gw, dx + 7, 104, 8, 26, 17, P.warm, 0.25); wall.glows.push([dx + 7, 104, 16, P.warm, 0.45]); }
        if (dx === 396) { R(gw, "#6a3a54", dx + 8, 110, 8, 11); disc(gw, "#3d9a6a", dx + 10, 104, 5); disc(gw, "#56b880", dx + 14, 100, 4); }
      }
      bandsV(gf, 0, 0, 128, 88, [P.carpet[3], P.carpet[2], P.carpet[2], P.carpet[1], P.carpet[1], P.carpet[0]]);
      for (let x = 0; x < 128; x += 32) for (let row = 0; row < 4; row++) { const y0 = [0, 14, 32, 56][row], h0 = [14, 18, 24, 32][row]; if ((x / 32 + row) % 2) { gf.fillStyle = "rgba(20,12,42,.18)"; gf.fillRect(x, y0, 32, h0); } }
      for (const y of [14, 32, 56]) R(gf, P.carpet[0], 0, y, 128, 1);
      for (let i = 0; i < 40; i++) R(gf, P.carpet[4], (r() * 128) | 0, (r() * 88) | 0, 1, 1);
      R(gf, P.carpet[4], 0, 0, 128, 1); gf.fillStyle = "rgba(159,195,255,.06)"; gf.fillRect(0, 1, 128, 6);
      for (let x = 30; x < 640; x += 210) { R(gx, P.ink, x, 214, 30, 4); R(gx, P.ink, x + 4, 206, 22, 10); R(gx, P.wall[2], x + 4, 206, 22, 1); R(gx, P.ink, x + 13, 218, 4, 22); }
      R(gx, P.ink, 452, 0, 20, VH); R(gx, P.wall[2], 452, 0, 1, VH); R(gx, mix(P.ink, P.wall[1], 0.4), 466, 0, 2, VH);
    } else if (theme === 1) {
      bandsV(gs, 0, 0, VW, 152, P.sky);
      const stairs = (g, col, hi, step, x0, rise) => { for (let k = 0; k < 40; k++) { const x = x0 + k * step, y = 150 - ((k % 10) * rise) - (Math.floor(k / 10) % 2 ? 0 : 0); R(g, col, x, y, step + 1, 152 - y); R(g, hi, x, y, step, 1); } };
      stairs(g1, P.far[0], mix(P.far[0], P.marble[1], 0.25), 10, 0, 8);
      for (let k = 0; k < 26; k++) { const x = k * 20, y = 148 - (k % 13) * 7; R(g2, P.far[1], x, y, 21, 152 - y); R(g2, mix(P.far[1], P.marble[2], 0.25), x, y, 20, 1); R(g2, P.steel[1], x + 2, y - 14, 1, 14); }
      for (let x = 0; x < 512; x += 2) R(g2, P.steel[2], x, 134 - ((x % 260) * 0.35) - 14, 2, 1);
      for (const ex of [90, 350]) { R(g2, "#1d3a2a", ex, 30, 12, 6); R(g2, P.green, ex + 2, 32, 8, 2); l2.glows.push([ex + 6, 33, 16, P.green, 0.5]); }
      layers = [l1, l2];
      R(gw, P.marble[2], 0, 0, 512, 152);
      for (let i = 0; i < 70; i++) { const x = (r() * 512) | 0, y = 14 + ((r() * 120) | 0), len = 6 + ((r() * 20) | 0), c = r() < 0.5 ? P.marble[3] : P.marble[1]; for (let k = 0; k < len; k++) R(gw, c, x + k, y + ((k * 0.5) | 0), 1, 1); }
      for (let x = 0; x < 512; x += 64) { R(gw, P.marble[1], x, 14, 1, 124); R(gw, P.marble[4], x + 1, 14, 1, 124); }
      R(gw, P.sky[2], 0, 0, 512, 10); R(gw, P.brass[2], 0, 10, 512, 2); R(gw, P.brass[3], 0, 10, 512, 1); R(gw, P.brass[0], 0, 12, 512, 1);
      for (const lx of [32, 160, 288, 416]) { wall.pools.push([lx, 80, "#ffd27a", 0.3]); R(gw, P.brass[3], lx - 3, 6, 6, 3); cone(gw, lx, 9, 8, 70, 128, "#ffe6b0", 0.1); wall.glows.push([lx, 9, 22, P.warm, 0.4, "flick2"]); }
      for (const ex of [40, 200]) {
        R(gw, P.steel[0], ex - 5, 34, 82, 106); R(gw, P.steel[1], ex - 4, 35, 80, 104);
        bandsV(gw, ex, 40, 72, 100, [P.steel[4], P.steel[3], P.steel[3], P.steel[2]]);
        R(gw, P.steel[1], ex + 35, 40, 2, 100); R(gw, P.steel[5], ex + 37, 40, 1, 100);
        for (let k = 0; k < 2; k++) { gw.fillStyle = "rgba(255,246,224,.13)"; gw.beginPath(); gw.moveTo(ex + 6 + k * 38, 40); gw.lineTo(ex + 16 + k * 38, 40); gw.lineTo(ex + 6 + k * 38, 140); gw.lineTo(ex - 4 + k * 38 + 4, 140); gw.fill(); }
        R(gw, "#120a10", ex + 18, 22, 36, 10); pix(gw, "18", ex + 22, 23, 1, P.amber); R(gw, P.amber, ex + 40, 25, 1, 1); R(gw, P.amber, ex + 39, 26, 3, 1); R(gw, P.amber, ex + 38, 27, 5, 1);
        wall.glows.push([ex + 36, 27, 16, P.amber, 0.45]);
        R(gw, P.brass[1], ex + 80, 78, 8, 18); R(gw, P.brass[3], ex + 80, 78, 8, 1); disc(gw, P.amber, ex + 84, 83, 1); disc(gw, "#d6e0ee", ex + 84, 90, 1); wall.glows.push([ex + 84, 83, 8, P.amber, 0.6]);
      }
      gw.clearRect(368, 30, 118, 110);
      R(gw, P.marble[0], 364, 26, 126, 4); R(gw, P.marble[0], 364, 26, 4, 114); R(gw, P.marble[0], 486, 26, 4, 114); R(gw, P.marble[4], 368, 30, 118, 1);
      R(gw, "#16402a", 404, 12, 44, 12); R(gw, P.green, 405, 13, 42, 10); R(gw, "#e8fff0", 408, 15, 3, 6); R(gw, "#e8fff0", 412, 17, 5, 2); R(gw, "#e8fff0", 418, 15, 2, 6); pix(gw, "EXIT", 421, 15, 1, "#e8fff0");
      wall.glows.push([426, 18, 30, P.green, 0.5]);
      R(gw, P.brass[1], 290, 120, 3, 16); R(gw, P.brass[1], 336, 120, 3, 16); R(gw, P.velvet[1], 286, 114, 58, 7); R(gw, P.velvet[2], 286, 114, 58, 1);
      R(gw, "#6e3a2a", 336, 118, 0, 0);
      R(gw, P.floor[1], 0, 140, 512, 12); R(gw, P.brass[2], 0, 139, 512, 1);
      bandsV(gf, 0, 0, 128, 88, [P.floor[3], P.floor[2], P.floor[2], P.floor[1], P.floor[1], P.floor[0]]);
      for (let x = 0; x < 128; x += 16) for (let row = 0; row < 6; row++) if ((x / 16 + row) % 2) { gf.fillStyle = "rgba(255,230,200,.06)"; gf.fillRect(x, row * 15, 16, 15); }
      for (let x = 0; x < 128; x += 16) R(gf, "rgba(0,0,0,.18)", x, 0, 1, 88);
      for (let k = 0; k < 3; k++) { gf.fillStyle = "rgba(255,230,190,.07)"; gf.beginPath(); gf.moveTo(10 + k * 44, 0); gf.lineTo(22 + k * 44, 0); gf.lineTo(2 + k * 44, 88); gf.lineTo(-10 + k * 44, 88); gf.fill(); }
      R(gf, P.marble[4], 0, 0, 128, 1);
      reflect = true;
      for (let x = 60; x < 640; x += 260) { R(gx, P.ink, x, 196, 4, 44); R(gx, P.brass[2], x, 196, 4, 2); R(gx, P.ink, x + 120, 196, 4, 44); R(gx, P.brass[2], x + 120, 196, 4, 2); for (let k = 0; k <= 116; k += 2) R(gx, P.velvet[0], x + 4 + k, 204 + Math.round(Math.sin((k / 116) * Math.PI) * 9), 2, 2); }
      for (let k = 0; k < 7; k++) { const a = -1.2 + k * 0.4; thick(gx, 560, 240, 560 + Math.cos(a) * 34, 240 - Math.abs(Math.sin(a)) * 46 - 10, 4); }
      gx.globalCompositeOperation = "source-in"; R(gx, P.ink, 0, 0, 640, VH); gx.globalCompositeOperation = "source-over";
    } else if (theme === 2) {
      bandsV(gs, 0, 0, VW, 152, P.sky);
      for (let k = 0; k < 5; k++) { const rr = 140 - k * 22, c = mix(P.far[0], P.sky[1], k * 0.15); g1.fillStyle = c; for (let x = -rr; x <= rr; x++) { const y = Math.round(150 - Math.sqrt(Math.max(0, rr * rr - x * x)) * 0.8); g1.fillRect(192 + x, y, 1, 2); } l1.glows.push([192, 152 - rr * 0.8, 6, "#ffd28a", 0.5]); R(g1, "#ffd28a", 192, Math.round(152 - rr * 0.8), 1, 1); }
      R(g2, mix(P.tile[0], P.sky[3], 0.4), 0, 0, 512, 152);
      for (let y = 8; y < 104; y += 6) for (let x = (y / 6) % 2 ? 0 : 6; x < 512; x += 12) R(g2, mix(P.tile[1], P.sky[3], 0.45), x, y, 11, 5);
      for (const ax of [40, 200, 360]) { R(g2, mix(P.tile[0], P.sky[0], 0.3), ax - 2, 26, 84, 54); R(g2, mix("#a86a8a", P.sky[3], 0.55), ax, 28, 80, 50); R(g2, mix(P.warn, P.sky[3], 0.5), ax + 6, 34, 30, 3); R(g2, mix(P.light, P.sky[3], 0.5), ax + 6, 40, 50, 2); disc(g2, mix("#ffd1a0", P.sky[3], 0.45), ax + 62, 60, 10); }
      R(g2, P.sky[0], 0, 104, 512, 48); R(g2, mix(P.tile[2], P.sky[0], 0.4), 0, 132, 512, 1); R(g2, mix(P.tile[2], P.sky[0], 0.4), 0, 144, 512, 1);
      for (let x = 0; x < 512; x += 12) R(g2, "#20160f", x, 135, 6, 9);
      layers = [l1, l2]; train = true;
      R(gw, P.sky[1], 0, 0, 512, 30); R(gw, P.tile[0], 0, 28, 512, 2);
      for (let x = 0; x < 512; x += 128) {
        gw.fillStyle = "rgba(159,194,204,.09)"; gw.fillRect(x + 12, 30, 116, 104);
        gw.fillStyle = "rgba(230,241,239,.08)"; gw.beginPath(); gw.moveTo(x + 30, 30); gw.lineTo(x + 46, 30); gw.lineTo(x + 26, 134); gw.lineTo(x + 10, 134); gw.fill();
        R(gw, P.tile[2], x, 30, 12, 108); R(gw, P.tile[4], x + 1, 30, 2, 108); R(gw, P.tile[0], x + 11, 30, 1, 108);
        R(gw, P.tile[3], x + 12, 30, 116, 2); R(gw, P.tile[1], x + 69, 34, 2, 100);
        R(gw, P.warn, x + 16, 74, 50, 2); R(gw, P.warn, x + 74, 74, 50, 2);
        R(gw, "#05080e", x + 56, 18, 28, 7); for (let k = 0; k < 5; k++) R(gw, P.warn, x + 59 + k * 5, 20, 3, 3); wall.glows.push([x + 70, 21, 18, P.warn, 0.35, "blink"]);
        cone(gw, x + 70, 30, 30, 90, 104, "#e6f1ef", 0.05); wall.pools.push([x + 70, 100, "#cfe8ff", 0.16]);
      }
      R(gw, P.tile[2], 0, 134, 512, 18); R(gw, P.tile[4], 0, 134, 512, 1);
      R(gw, "#05080e", 330, 4, 118, 18); pix(gw, "18:30", 336, 9, 1, P.warn); for (let x = 372; x < 444; x += 3) R(gw, mix(P.warn2, "#05080e", 0.3), x, 12, 2, 2); wall.glows.push([388, 13, 30, P.warn2, 0.3]);
      R(gw, P.tile[0], 140, 3, 94, 22); R(gw, P.light, 142, 5, 90, 18); R(gw, "#2f9e6a", 142, 5, 90, 3); R(gw, "#2f9e6a", 142, 20, 90, 3);
      wall.signAt = [187, 14];
      bandsV(gf, 0, 0, 128, 88, [P.conc[4], P.conc[3], P.conc[3], P.conc[2], P.conc[2], P.conc[1]]);
      R(gf, P.light, 0, 0, 128, 2); R(gf, P.warn, 0, 4, 128, 9); R(gf, ramp(P.warn, 0.8), 0, 4, 128, 1);
      for (let x = 1; x < 128; x += 4) { R(gf, ramp(P.warn, -1), x, 6, 2, 2); R(gf, ramp(P.warn, -1), x + 2, 9, 2, 2); }
      R(gf, ramp(P.warn, -2), 0, 13, 128, 1);
      for (let x = 0; x < 128; x += 32) R(gf, P.conc[0], x, 14, 1, 74);
      R(gf, P.conc[0], 0, 40, 128, 1); R(gf, P.conc[0], 0, 66, 128, 1);
      for (let i = 0; i < 30; i++) R(gf, P.conc[4], (r() * 128) | 0, 16 + ((r() * 70) | 0), 1, 1);
      for (let x = 120; x < 640; x += 320) { R(gx, P.ink, x, 0, 26, VH); for (let y = 8; y < VH; y += 8) R(gx, mix(P.ink, P.tile[0], 0.6), x + 2, y, 22, 1); R(gx, P.tile[1], x, 0, 1, VH); R(gx, P.ink, x - 30, 20, 86, 18); R(gx, "#2f9e6a", x - 28, 22, 82, 14); pix(gx, ">", x + 20, 25, 1, P.light); }
    } else {
      bandsV(gs, 0, 0, VW, 152, P.sky);
      disc(gs, P.sun[0], 300, 62, 24); disc(gs, P.sun[1], 298, 59, 16);
      for (let k = 0; k < 5; k++) R(gs, P.sky[5 + Math.min(2, k >> 1)], 272, 66 + k * 5, 56, 1 + (k >> 1));
      skyGlows.push([300, 62, 76, "#ffb26b", 0.5]);
      for (const [cx, cy, w] of [[40, 34, 70], [180, 22, 54], [120, 62, 90], [330, 46, 40]]) { R(gs, mix(P.sky[4], "#ffb3a0", 0.55), cx, cy, w, 3); R(gs, mix(P.sky[3], P.sky[0], 0.4), cx + 6, cy + 3, w - 10, 2); R(gs, "#ffd0b8", cx + 8, cy, w - 24, 1); }
      for (let x = 0; x < 384; x++) { const h = 22 + Math.round(Math.sin(x * 0.03) * 8 + Math.sin(x * 0.11) * 3); R(g1, mix(P.far[0], P.sky[9], 0.45), x, 152 - h, 1, h); }
      for (let x = 0; x < 512;) { const w = 18 + ((r() * 30) | 0), h = 40 + ((r() * 70) | 0), c = pick2(r, P.bld); R(g2, c, x, 152 - h, w, h); R(g2, mix(c, "#ff9a5e", 0.35), x + w - 1, 152 - h, 1, h); for (let yy = 152 - h + 5; yy < 148; yy += 6) for (let xx = x + 3; xx < x + w - 3; xx += 5) if (r() < 0.2) R(g2, mix(P.win, c, 0.35), xx, yy, 2, 2); if (r() < 0.25) { R(g2, c, x + 4, 152 - h - 8, 8, 8); } x += w + 1 + ((r() * 5) | 0); }
      R(g2, P.bld[0], 300, 30, 2, 122); for (let k = 0; k < 10; k++) R(g2, P.bld[0], 296 + (k % 2) * 6, 40 + k * 10, 4, 1); R(g2, "#ff5a6a", 300, 29, 2, 2); l2.glows.push([301, 30, 8, "#ff5a6a", 0.8, "blink"]);
      for (let x = 0; x < 512; x += 40) { const h = 20 + ((r() * 18) | 0); disc(g3, P.mid[0], x + 18, 152 - h, 18); disc(g3, P.mid[1], x + 14, 148 - h, 12); R(g3, mix(P.mid[1], "#e0505f", 0.5), x + 30, 140 - h, 2, 10); }
      R(g3, P.mid[0], 0, 136, 512, 16);
      for (let x = 0; x < 512; x += 128) { R(g3, P.mid[0], x + 60, 40, 3, 100); R(g3, P.mid[0], x + 52, 46, 19, 2); }
      for (let x = 0; x < 512; x++) { const u = (x % 128) / 128, y = 47 + Math.round(Math.sin(u * Math.PI) * 10); R(g3, P.mid[0], x, y, 1, 1); R(g3, P.mid[0], x, y + 5, 1, 1); }
      for (let i = 0; i < 4; i++) { const bx = 40 + i * 120; R(gs, "#3a1c5c", 0, 0, 0, 0); void bx; }
      layers = [l1, l2, l3];
      const shops = [["cafe", P.shop[2]], ["pharm", P.shop[3]], ["store", P.shop[1]]];
      shops.forEach(([k, c], i) => {
        const x = 8 + i * 170, Y = 66, W2 = 134;
        R(gw, c, x, Y, W2, 152 - Y); R(gw, ramp(c, 0.6), x, Y, W2, 2); R(gw, ramp(c, -1), x + W2 - 1, Y, 1, 152 - Y);
        R(gw, ramp(c, -0.5), x - 2, Y - 3, W2 + 4, 3);
        for (let s2 = 0; s2 < 11; s2++) { const sw = s2 === 10 ? W2 - 120 : 12; R(gw, s2 % 2 ? P.awn[1] : P.awn[0], x + s2 * 12, Y + 18, sw, 9); R(gw, s2 % 2 ? mix(P.awn[1], P.awn[2], 0.4) : P.awn[2], x + s2 * 12, Y + 25, sw, 2); }
        bandsV(gw, x + 8, Y + 32, 72, 44, ["#ffe6b0", P.win, mix(P.win, "#e0505f", 0.25)]);
        R(gw, ramp(c, -1.5), x + 8, Y + 32, 72, 2); R(gw, ramp(c, -1.5), x + 43, Y + 32, 2, 44);
        R(gw, "#6a3a5e", x + 14, Y + 62, 9, 14); disc(gw, "#6a3a5e", x + 18, Y + 58, 4); R(gw, "#7e4a6c", x + 56, Y + 60, 8, 16); disc(gw, "#7e4a6c", x + 60, Y + 56, 4);
        wall.glows.push([x + 44, Y + 54, 40, "#ffb26b", 0.3]);
        R(gw, ramp(c, -1.5), x + 92, Y + 36, 32, 52); R(gw, mix(P.win, c, 0.5), x + 96, Y + 40, 24, 30); R(gw, P.warm, x + 115, Y + 72, 3, 3);
        R(gw, P.ink, x + 38, Y + 4, 58, 12); R(gw, P.cream, x + 40, Y + 6, 54, 8);
        const cx2 = x + 67, cy2 = Y + 7;
        if (k === "cafe") { R(gw, "#a8366f", cx2 - 4, cy2 + 1, 7, 6); R(gw, "#a8366f", cx2 + 3, cy2 + 2, 2, 3); }
        if (k === "pharm") { R(gw, "#2bb36a", cx2 - 2, cy2, 4, 8); R(gw, "#2bb36a", cx2 - 4, cy2 + 2, 8, 4); wall.glows.push([cx2, cy2 + 4, 14, "#3ddc84", 0.45]); }
        if (k === "store") { R(gw, "#e0505f", cx2 - 6, cy2 + 1, 12, 6); R(gw, "#e0505f", cx2 - 3, cy2, 6, 1); }
        wall.glows.push([cx2, cy2 + 4, 26, "#fff6e0", 0.25]);
        wall.pools.push([x + 44, 90, "#ffb26b", 0.35]);
      });
      for (const lx of [155, 325, 495]) { R(gw, P.ink, lx, 60, 3, 92); R(gw, P.ink, lx - 7, 56, 17, 4); R(gw, "#fff1c4", lx - 5, 60, 13, 3); cone(gw, lx + 1, 63, 12, 60, 89, "#ffd08a", 0.14); wall.glows.push([lx + 1, 61, 26, "#ffd08a", 0.55, "flick2"]); wall.pools.push([lx + 1, 70, "#ffd08a", 0.45]); }
      R(gw, P.shop[0], 0, 148, 512, 4);
      bandsV(gf, 0, 0, 128, 88, [P.walk[4], P.walk[3], P.walk[2], P.walk[2], P.walk[1], P.walk[1]]);
      for (let row = 0; row < 7; row++) { R(gf, P.walk[0], 0, row * 12 + 1, 128, 1); for (let x = (row % 2) * 8; x < 128; x += 16) R(gf, P.walk[0], x, row * 12 + 1, 1, 12); }
      for (let row = 0; row < 7; row++) for (let x = (row % 2) * 8 + 1; x < 128; x += 16) R(gf, mix(P.walk[3], "#ffb26b", 0.25), x, row * 12 + 2, 14, 1);
      R(gf, P.shop[0], 0, 80, 128, 8); R(gf, P.shop[2], 0, 80, 128, 1);
      for (let x = 100; x < 640; x += 300) { R(gx, P.ink, x, 0, 8, VH); R(gx, ramp(P.ink, 2), x + 7, 0, 1, VH); disc(gx, P.ink, x - 30, 236, 26); disc(gx, P.ink, x + 40, 240, 22); }
      for (let x = 0; x < 640; x += 3) R(gx, P.ink, x, 4 + Math.round(Math.sin(x * 0.012) * 6), 3, 1);
    }
    if (wall.signAt) drawPT(gw, ptext("퇴근역", 12, "#1b2738"), wall.signAt[0], wall.signAt[1], 1, "c");
    return { theme, P, sky, skyGlows, layers, wall, floor, fg, reflect, train };
  }
  function pick2(r, arr) { return arr[(r() * arr.length) | 0]; }

  // ───────────────────────── 배경음 — 스테이지마다 다른 짧은 칩튠 (오리지널 · 공통 소리 켜기/끄기를 따른다)
  const SONGS = {
    s1: { bpm: 138,
      lead: "E5 . G5 . C6 - B5 . G5 . E5 . D5 - C5 . D5 . E5 . F5 - E5 . D5 . C5 . G4 - - . E5 . G5 . C6 - D6 . E6 - D6 . C6 . A5 . G5 - E5 . F5 . D5 . C5 - - - . . . .",
      bass: "C3 . C3 . G2 . G2 . A2 . A2 . F2 . G2 . F2 . F2 . C3 . C3 . G2 . G2 . G2 . B2 . C3 . C3 . E3 . E3 . F3 . F3 . A2 . A2 . G2 . G2 . G2 . B2 . C3 . G2 . C3 . . .",
      drum: "k . h . s . h . k . h k s . h h" },
    s2: { bpm: 132,
      lead: "A4 . C5 . E5 . A5 - G5 . E5 . C5 . D5 . E5 - - . D5 . C5 . B4 . G4 . A4 - - . A4 . C5 . E5 . A5 - B5 . C6 - B5 . G5 . A5 - E5 . F5 - E5 . D5 . B4 . A4 - - .",
      bass: "A2 . A2 A2 . A2 . A2 . F2 . F2 F2 . F2 . G2 . G2 G2 . G2 . G2 . E2 . E2 E2 . E2 . A2 . A2 A2 . A2 . A2 . F2 . F2 F2 . F2 . E2 . E2 E2 . E2 . E2 . G#2 . B2 . E3 . .",
      drum: "k . h k s . h . k . h k s . h s" },
    s3: { bpm: 148,
      lead: "D5 . D5 F5 . G5 . A5 . C6 . A5 G5 . F5 . G5 . G5 A5 . F5 . D5 . C5 . D5 - - . . D5 . D5 F5 . G5 . A5 . C6 . D6 C6 . A5 . G5 . A5 G5 . F5 . E5 . C5 . D5 - - - .",
      bass: "D3 D3 . D3 D3 . D3 . C3 C3 . C3 C3 . C3 . G2 G2 . G2 G2 . G2 . A2 A2 . A2 C3 . A2 . D3 D3 . D3 D3 . D3 . C3 C3 . C3 C3 . C3 . G2 G2 . G2 G2 . G2 . A2 A2 . A2 C3 . A2 .",
      drum: "k h s h k h s h k h s h k k s h" },
    s4: { bpm: 124,
      lead: "A5 - - . G5 . F5 . C5 - - . F5 . G5 . A5 - - . C6 . A5 . G5 - - - . . . . F5 - - . E5 . D5 . C5 - - . D5 . F5 . G5 - - . A5 . G5 . F5 - - - . . . .",
      bass: "F2 . C3 . F3 . C3 . A2 . E3 . A3 . E3 . A#2 . F3 . A#3 . F3 . C3 . G3 . C4 . G3 . D3 . A3 . D4 . A3 . A2 . E3 . A3 . E3 . A#2 . F3 . C3 . G3 . F2 . C3 . F3 . . .",
      drum: "k . h . s . h . k . h . s . h h" },
    boss: { bpm: 160,
      lead: "E5 . E5 . G5 . E5 . A5 . G5 . F#5 . D5 . E5 . E5 . G5 . B5 . A5 - G5 . F#5 - - . E5 . E5 . G5 . E5 . C6 . B5 . A5 . F#5 . G5 . F#5 . E5 . D#5 . E5 - - - . . . .",
      bass: "E2 E3 E2 E3 E2 E3 E2 E3 C3 C4 C3 C4 D3 D4 D3 D4 E2 E3 E2 E3 E2 E3 E2 E3 C3 C4 C3 C4 D3 D4 D3 D4 E2 E3 E2 E3 E2 E3 E2 E3 C3 C4 C3 C4 D3 D4 D3 D4 B1 B2 B1 B2 B1 B2 B1 B2 E2 E3 E2 E3 E2 . . .",
      drum: "k h s h k k s h k h s h k k s s" },
    end: { bpm: 104, wave: "triangle",
      lead: "E5 - G5 - C6 - - - B5 - G5 - A5 - - - F5 - A5 - D6 - - - C6 - B5 - C6 - - -",
      bass: "C3 - - - G2 - - - F2 - - - G2 - - - F2 - - - G2 - - - C3 - - - C3 - - -",
      drum: "k . . . h . . . k . . . h . . ." },
  };
  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function parseTrack(str) {
    const toks = str.trim().split(/\s+/), out = [];
    for (let i = 0; i < toks.length; i++) {
      const m = /^([A-G])(#|b)?(\d)$/.exec(toks[i]);
      if (!m) { out.push(toks[i] === "-" ? -1 : 0); continue; }
      const midi = 12 * (+m[3] + 1) + NOTE[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
      let len = 1;
      while (toks[i + len] === "-") len++;
      out.push({ f: 440 * Math.pow(2, (midi - 69) / 12), len });
    }
    return out;
  }
  const Music = (function () {
    let ac = null, master = null, noise = null, timer = null, cur = null, want = null, step = 0, nextT = 0;
    const parsed = {};
    function song(name) {
      if (!parsed[name]) { const s = SONGS[name]; parsed[name] = { bpm: s.bpm, wave: s.wave || "square", lead: parseTrack(s.lead), bass: parseTrack(s.bass), drum: s.drum.split(/\s+/) }; }
      return parsed[name];
    }
    const muted = () => !!(window.HKSound && HKSound.isMuted());
    function ensure() {
      if (ac) { if (ac.state !== "running") ac.resume().catch(() => {}); return ac; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ac = new AC(); } catch (_) { return null; }
      master = ac.createGain(); master.gain.value = 0.3; master.connect(ac.destination);
      noise = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      return ac;
    }
    function tone(type, f, t, len, v) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.006);
      g.gain.exponentialRampToValueAtTime(v * 0.55, t + Math.min(0.08, len * 0.4)); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g).connect(master); o.start(t); o.stop(t + len + 0.02);
    }
    function drum(k, t) {
      if (k === "k") {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = "sine"; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
        g.gain.setValueAtTime(0.32, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
        o.connect(g).connect(master); o.start(t); o.stop(t + 0.16);
      } else if (k === "s" || k === "h") {
        const src = ac.createBufferSource(), flt = ac.createBiquadFilter(), g = ac.createGain();
        src.buffer = noise; flt.type = k === "s" ? "bandpass" : "highpass"; flt.frequency.value = k === "s" ? 1800 : 7000;
        const len = k === "s" ? 0.12 : 0.04;
        g.gain.setValueAtTime(k === "s" ? 0.12 : 0.045, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
        src.connect(flt).connect(g).connect(master); src.start(t); src.stop(t + len + 0.02);
      }
    }
    function tick() {
      if (!ac || !cur) return;
      const s = song(cur), dt = 60 / s.bpm / 4;
      if (nextT < ac.currentTime) nextT = ac.currentTime + 0.05;
      while (nextT < ac.currentTime + 0.2) {
        const L = s.lead[step % s.lead.length], B = s.bass[step % s.bass.length], D = s.drum[step % s.drum.length];
        try {
          if (L && L.f) tone(s.wave, L.f, nextT, L.len * dt * 0.95, s.wave === "triangle" ? 0.12 : 0.06);
          if (B && B.f) tone("triangle", B.f, nextT, B.len * dt * 0.9, 0.13);
          if (D && D !== ".") drum(D, nextT);
        } catch (_) { /* 소리는 부가 기능 */ }
        nextT += dt; step++;
      }
    }
    function start() {
      if (!want || muted() || document.hidden) return;
      if (!ensure()) return;
      if (cur !== want) { cur = want; step = 0; nextT = ac.currentTime + 0.08; }
      if (!timer) timer = setInterval(tick, 40);
      tick();
    }
    function halt() {
      if (timer) { clearInterval(timer); timer = null; }
      cur = null;
      if (ac) { const old = ac; ac = null; try { old.close().catch(() => {}); } catch (_) { /* 이미 닫힘 */ } }
    }
    if (window.HKSound && HKSound.onChange) HKSound.onChange((m) => { if (m) halt(); else start(); });
    document.addEventListener("visibilitychange", () => { if (document.hidden) halt(); });
    return {
      play(name) { if (want === name && cur === name) return; want = name; if (cur && cur !== name) { const w = want; halt(); want = w; } start(); },
      stop() { want = null; halt(); },
      resume() { start(); },
      get current() { return want; },
    };
  })();

  const HERO_DEF = { mint: heroDef("mint"), gom: heroDef("gom") };
  const MOVE_FRAMES = { lump: 2, zombie: 4, bat: 2, ghost: 2, bomb: 2 };

  // ═════════════════════════ 게임 본체
  function mount(stage, ctx) {
    const IS_TOUCH = matchMedia("(pointer: coarse)").matches;
    const HERO_KEY = "hk-fighter-hero", HOW_KEY = "hk-fighter-how";
    let hero = "mint";
    try { if (localStorage.getItem(HERO_KEY) === "gom") hero = "gom"; } catch (_) { /* 저장 못 해도 됨 */ }
    let firstHow = true;
    try { firstHow = localStorage.getItem(HOW_KEY) !== "1"; } catch (_) { /* 그대로 */ }

    stage.innerHTML = `
      <div class="ft" data-mode="pc">
        <div class="ft-top">
          <div class="ft-hud">
            <div class="ft-me">
              <canvas class="ft-face" width="24" height="24" aria-hidden="true"></canvas>
              <div class="ft-me__info">
                <div class="ft-me__name"><b data-name>민트</b><span class="ft-lives" data-lives aria-label="목숨"></span></div>
                <div class="ft-bar is-me"><b data-hp-lag></b><i data-hp></i></div>
              </div>
            </div>
            <div class="ft-time"><small>TIME</small><canvas data-time aria-label="남은 시간"></canvas></div>
            <div class="ft-score"><small>SCORE</small><canvas data-score aria-label="점수"></canvas></div>
          </div>
          <div class="ft-sub">
            <span class="ft-stage" data-stage></span>
            <span class="ft-foe" data-foe hidden><b data-foe-name></b><span class="ft-bar is-foe"><b data-foe-lag></b><i data-foe-hp></i></span></span>
          </div>
        </div>
        <div class="ft-screen"><canvas class="ft-canvas" width="${VW}" height="${VH}" aria-label="스트레스 파이터 게임 화면"></canvas></div>
        <div class="ft-panel" data-panel hidden></div>
        <div class="ft-keys" data-keys>
          <span><kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> 이동</span>
          <span><kbd>Z</kbd> 공격</span><span><kbd>X</kbd> 점프</span><span><kbd>C</kbd> 필살기</span>
          <span><kbd>→</kbd><kbd>→</kbd> 달리기</span><span><kbd>Esc</kbd> 일시정지</span>
        </div>
        <div class="ft-pad" data-pad>
          <div class="ft-dpad" data-dpad aria-label="이동 패드"><i class="is-u"></i><i class="is-d"></i><i class="is-l"></i><i class="is-r"></i><span class="ft-dpad__knob" data-knob></span></div>
          <div class="ft-btns" data-btns>
            <button type="button" class="ft-btn is-sp" data-b="sp" tabindex="-1" aria-label="필살기"><svg viewBox="0 0 12 12" shape-rendering="crispEdges"><path d="M5 1h2v3H5zM5 8h2v3H5zM1 5h3v2H1zM8 5h3v2H8zM3 3h1v1H3zM8 3h1v1H8zM3 8h1v1H3zM8 8h1v1H8z"/><path class="hi" d="M5 5h2v2H5z"/></svg></button>
            <button type="button" class="ft-btn is-jmp" data-b="jmp" tabindex="-1" aria-label="점프"><svg viewBox="0 0 12 12" shape-rendering="crispEdges"><path d="M5 1h2v1H5zM4 2h4v1H4zM3 3h6v1H3zM2 4h8v1H2zM4 5h4v1H4zM5 6h2v5H5z"/></svg></button>
            <button type="button" class="ft-btn is-atk" data-b="atk" tabindex="-1" aria-label="공격"><svg viewBox="0 0 12 12" shape-rendering="crispEdges"><path d="M3 2h7v2H3zM2 4h9v4H2zM3 8h7v2H3zM4 10h5v1H4z"/><path class="hi" d="M4 2h1v2H4zM6 2h1v2H6zM8 2h1v2H8zM3 5h2v1H3z"/></svg></button>
          </div>
        </div>
      </div>`;
    const $ = (s) => stage.querySelector(s);
    // 가로로 긴 화면이라 공통 창(세로 비율)을 이 게임만 가운데 영역 가득 넓힌다
    if (stage.parentElement && stage.parentElement.classList) stage.parentElement.classList.add("ft-wide");
    const root = $(".ft"), topEl = $(".ft-top"), canvas = $(".ft-canvas"), G = canvas.getContext("2d");
    const panel = $("[data-panel]"), keysEl = $("[data-keys]"), padEl = $("[data-pad]");
    const elName = $("[data-name]"), elLives = $("[data-lives]"), elHp = $("[data-hp]"), elHpLag = $("[data-hp-lag]"), elStage = $("[data-stage]"), elFoeLag = $("[data-foe-lag]");
    const elFoe = $("[data-foe]"), elFoeName = $("[data-foe-name]"), elFoeHp = $("[data-foe-hp]");
    const cvTime = $("[data-time]"), cvScore = $("[data-score]"), cvFace = $(".ft-face");
    G.imageSmoothingEnabled = false;

    let state = "title"; // title | play | paused | over
    let S = null;
    let mode = IS_TOUCH ? (window.innerWidth > window.innerHeight ? "land" : "port") : "pc";
    let titleT = 0;
    const sfxAt = {};
    function sfx(name, gap, arg) {
      const now = performance.now();
      if (gap && sfxAt[name] && now - sfxAt[name] < gap * 1000) return;
      sfxAt[name] = now;
      ctx.sfx(name, arg);
    }

    // ───────── 입력
    const keys = { l: 0, r: 0, u: 0, d: 0 };
    const tpad = { x: 0, y: 0 };
    const held = { atk: false, jmp: false, sp: false };
    const tHeld = { atk: 0, jmp: 0, sp: 0 };
    const latch = { atk: 0, jmp: 0, sp: 0 };
    let runDir = 0;
    const lastTap = { "-1": 0, "1": 0 };
    const dirX = () => ((keys.r ? 1 : 0) - (keys.l ? 1 : 0)) || tpad.x;
    const dirY = () => ((keys.d ? 1 : 0) - (keys.u ? 1 : 0)) || tpad.y;
    const atkHeld = () => held.atk || tHeld.atk > 0;
    function tapDir(d, gap) { const now = performance.now(); if (now - lastTap[d] < gap) runDir = d; lastTap[d] = now; }
    function consume(a) { if (latch[a]) { latch[a] = 0; return true; } return false; }
    function clearInput() {
      keys.l = keys.r = keys.u = keys.d = 0; tpad.x = tpad.y = 0; runDir = 0;
      held.atk = held.jmp = held.sp = false; tHeld.atk = tHeld.jmp = tHeld.sp = 0; latch.atk = latch.jmp = latch.sp = 0;
      padEl.querySelectorAll(".is-down").forEach((b) => b.classList.remove("is-down"));
      const knob = $("[data-knob]"); if (knob) knob.style.transform = "";
    }

    // ───────── 판 상태
    function makePlayer() {
      const H = HERO[hero];
      return { kind: "hero", x: -24, y: 196, z: 0, vx: 0, vz: 0, dir: 1, st: "auto", t: 0, f: 0, hp: H.hp, maxHp: H.hp, w: 10, h: 50,
        invul: 0, comboStep: 2, comboT: 0, atkBuf: 0, jmpBuf: 0, spBuf: 0, holdT: 0, hits: new Set(), weapon: null, wdur: 0, grabbed: null, grabPush: 0, knees: 0, flash: 0, hitTimes: [], trail: [] };
    }
    function newRun() {
      S = { hero, score: 0, lives: 3, stage: 0, t: 0, frame: 0, hitstop: 0, shake: 0, slowT: 0, slowAcc: 0,
        p: makePlayer(), en: [], props: [], items: [], shots: [], fx: [], pops: [], marks: [], spawnQ: [],
        camX: 0, zone: null, zoneIdx: 0, goT: 0, phase: "intro", phaseT: 0, time: 99, timeAcc: 0,
        banner2: null, target: null, targetT: 0, boss: null, tally: null, fade: 1, submitted: false, cleared: false,
        train: null, trainCd: 3, flick: 0, flickCd: 3, sideFlip: 1, song: null, god: false, kills: 0 };
      startStage(0);
    }
    function playSong(name) { if (S) S.song = name; Music.play(name); }
    function startStage(n) {
      const D = STAGES[n];
      S.stage = n; S.def = D; S.bg = buildArt(n); S.amb = null; S.birds = null;
      S.camX = 0; S.zone = null; S.zoneIdx = 0; S.goT = 0; S.en = []; S.items = []; S.shots = []; S.marks = []; S.fx = []; S.pops = []; S.spawnQ = [];
      S.props = D.props.map(([x, y, kind, item]) => ({ kind: "prop", pk: kind, x, y, z: 0, item, hp: 2, flash: 0, wob: 0, w: 8, h: 26 }));
      S.boss = null; S.target = null; S.tally = null; S.banner2 = null;
      const p = S.p, H = HERO[S.hero];
      p.x = -24; p.y = 196; p.z = 0; p.vx = p.vz = 0; p.st = "auto"; p.dir = 1; p.t = 0; p.grabbed = null; p.invul = 0; p.hp = p.maxHp = H.hp; p.comboT = 0;
      S.phase = "intro"; S.phaseT = 0; S.time = 99; S.timeAcc = 0; S.fade = 1;
      S.mul = { hp: 1 + 0.14 * n, dmg: 1 + 0.12 * n, spd: 1 + 0.07 * n, cd: 1 - 0.1 * n };
      S.maxAtk = [1, 2, 2, 3][n]; S.maxE = [5, 6, 6, 7][n];
      S.train = null; S.trainCd = 3; S.flick = 0; S.flickCd = 2;
      playSong(D.song);
      sfx("go");
      queueBake(n);
    }
    // 이번 스테이지에 나올 그림을 소개 띠가 도는 동안 조금씩 미리 굽는다 (싸움 중에 처음 굽느라 끊기지 않게)
    let bakeQ = [];
    function queueBake(n) {
      bakeQ = [];
      const add = (def, anims, frames, extras) => { for (const a of anims) for (let f = 0; f < (typeof frames === "function" ? frames(a) : frames); f++) for (const ex of extras || [""]) bakeQ.push([def, a, f, ex]); };
      add(HERO_DEF[S.hero], Object.keys(HERO_POSE), (a) => HERO_POSE[a].length, ["", "paper", "umbrella"]);
      const kinds = new Set();
      STAGES[n].zones.forEach((z) => z.waves.forEach((w) => w.forEach((k) => kinds.add(k))));
      if (n === 1) { kinds.add("bomb"); kinds.add("lump"); }
      if (n === 3) kinds.add("bat");
      for (const k of kinds) add(FOE[k].def, ["idle", "move", "wind", "atk", "dive", "hurt", "fall", "lie", "getup", "fuse"], MOVE_FRAMES[k]);
      const bk = STAGES[n].boss, bd = BOSS[bk].def;
      const banims = bk === "golem" ? ["idle", "move", "wind", "slam", "throwW", "throw", "slide", "hurt", "lie", "die"] : Object.keys(bk === "knight" ? KPOSE : bk === "giant" ? GPOSE : DPOSE);
      const BP = bk === "knight" ? KPOSE : bk === "giant" ? GPOSE : bk === "demon" ? DPOSE : null;
      add(bd, banims, (a) => (BP ? (BP[a] || [0]).length : a === "move" ? 4 : 2), bk === "demon" ? ["", "p2"] : [""]);
      for (const pk of ["cooler", "plant", "trash", "box", "cone"]) bakeQ.push([PROP, pk, 0, ""]);
      for (const ik of Object.keys(ITEMS)) bakeQ.push([ITEM, ik, 0, ""]);
    }
    function runBake(ms) {
      const t0 = performance.now();
      while (bakeQ.length && performance.now() - t0 < ms) { const [d, a, f, ex] = bakeQ.shift(); sprite(d, a, f, 0, ex); }
    }

    // ───────── 점수 · 효과
    function addScore(n, at, col) {
      S.score = Math.min(9999999, S.score + n);
      if (at && n >= 50) S.pops.push({ x: at.x, y: at.y, z: (at.z || 0) + Math.min(at.h || 30, 40) + 4, txt: String(n), t: 0, col: col || "#ffe066" });
    }
    function popText(at, txt, col) { S.pops.push({ x: at.x, y: at.y, z: (at.z || 0) + 48, ko: txt, t: 0, col: col || "#ffffff" }); }
    function fx(k, x, y, z, o) { if (S.fx.length < 220) S.fx.push(Object.assign({ k, x, y, z, vx: 0, vy: 0, vz: 0, t: 0, life: 0.4, c: "#fff", g: 0 }, o || {})); }
    function spark(x, y, z, big) {
      fx("star", x, y, z, { life: big ? 0.22 : 0.16, s: big ? 1 : 0 });
      for (let i = 0; i < (big ? 7 : 4); i++) fx("bit", x, y, z, { vx: rnd(-90, 90), vz: rnd(20, 120), life: rnd(0.2, 0.35), c: pick(["#ffffff", "#ffe066", "#ffd43b"]), g: 300 });
    }
    function dust(x, y, n) { for (let i = 0; i < n; i++) fx("puff", x + rnd(-8, 8), y + rnd(-2, 2), 1, { vx: rnd(-30, 30), vz: rnd(5, 20), life: rnd(0.3, 0.5), c: "#d8d2c6", r: 2 }); }
    function release(e) {
      for (let i = 0; i < 4; i++) fx("heart", e.x + rnd(-8, 8), e.y, (e.z || 0) + rnd(6, 20), { vz: rnd(18, 34), vx: rnd(-10, 10), life: rnd(0.8, 1.2), c: pick(["#ff6fa8", "#ff9ec4", "#ffd1e1"]) });
      for (let i = 0; i < 5; i++) fx("puff", e.x + rnd(-10, 10), e.y, (e.z || 0) + rnd(2, 18), { vz: rnd(14, 30), vx: rnd(-12, 12), life: rnd(0.6, 0.9), c: "#f1f3f5", r: 3 });
    }
    function boom(x, y, z) {
      fx("ring", x, y, z, { life: 0.35, r: 34 });
      for (let i = 0; i < 12; i++) fx("bit", x, y, z + 6, { vx: rnd(-140, 140), vz: rnd(40, 180), life: rnd(0.3, 0.6), c: pick(["#ffd43b", "#ff922b", "#ff6b6b", "#fff"]), g: 340 });
      for (let i = 0; i < 6; i++) fx("puff", x + rnd(-14, 14), y + rnd(-3, 3), z + rnd(2, 16), { vz: rnd(10, 30), life: rnd(0.5, 0.8), c: "#868e96", r: 4 });
    }

    // ───────── 주인공
    function hasControl() { return S.phase === "play" || S.phase === "warning"; }
    const playerOpen = () => { const st = S.p.st; return hasControl() && st !== "ko" && st !== "drop" && st !== "down" && st !== "getup" && st !== "air" && st !== "auto"; };
    function startAttack() {
      const p = S.p, H = HERO[S.hero];
      const step = p.comboT > 0 ? (p.comboStep + 1) % 3 : 0;
      let A;
      if (p.weapon) {
        const W = WEAPON[p.weapon];
        A = { anim: "swing", s: W.s, a: W.a, r: W.r, dmg: Math.round((5 + W.dmg) * H.dmg), x0: 4, x1: 28 + W.reach, zlo: 6, zhi: 46, knock: step === 2, fin: step === 2, weapon: true };
      } else if (step < 2) {
        const [s, a, r] = H.jab;
        A = { anim: step ? "jab2" : "jab1", s, a, r, dmg: Math.round(5 * H.dmg), x0: 4, x1: 26, zlo: 10, zhi: 40, knock: false };
      } else {
        const [s, a, r] = H.kick;
        A = { anim: "kick", s, a, r, dmg: Math.round(9 * H.dmg), x0: 4, x1: 32, zlo: 4, zhi: 36, knock: true, fin: true };
      }
      A.step = step;
      p.atk = A; p.st = "atk"; p.f = 0; p.t = 0; p.hits = new Set(); p.queued = false; p.connected = false;
    }
    function startJump(ix, run) {
      const p = S.p, H = HERO[S.hero];
      p.st = "jump"; p.t = 0; p.vz = 255; p.vx = ix * (run ? H.run * 0.85 : H.spd); if (ix) p.dir = ix;
      p.jk = 0; p.hits = new Set(); p.connected = false;
      sfx("jump");
    }
    function startDash() {
      const p = S.p, H = HERO[S.hero];
      p.st = "dash"; p.f = 0; p.t = 0; p.hits = new Set(); p.connected = false; p.vx = p.dir * H.run * 1.25;
      sfx("whoosh", 0.2);
    }
    function startSpecial() {
      const p = S.p;
      dropGrab();
      p.hp = Math.max(1, p.hp - 8);
      p.st = "special"; p.f = 0; p.t = 0; p.z = 0; p.invul = Math.max(p.invul, 0.62); p.sdir = p.dir; p.hits = new Set(); p.connected = false;
      fx("ring", p.x, p.y, 4, { life: 0.4, r: 42, c: "#a5f3fc" });
      sfx("whoosh"); sfx("powerup");
    }
    function grabTarget() {
      const p = S.p;
      for (const e of S.en) {
        if (e.boss || !FOE[e.kind].grab || e.dead) continue;
        if (!(e.st === "move" || e.st === "hurt" || e.st === "rec" || e.st === "wind" || e.st === "fuse")) continue;
        if (e.z > 6 || e.inv) continue;
        const dx = (e.x - p.x) * p.dir;
        if (dx > 5 && dx < 25 && Math.abs(e.y - p.y) < 6) return e;
      }
      return null;
    }
    function startGrab(e) {
      const p = S.p;
      p.st = "grab"; p.t = 0; p.grabbed = e; p.knees = 0;
      e.st = "held"; e.t = 0; e.token = false;
      sfx("swap");
    }
    function dropGrab() {
      const p = S.p, e = p.grabbed;
      if (e && e.st === "held") { e.st = "move"; e.t = 0; e.cd = Math.max(e.cd, 0.6); e.x += p.dir * 4; e.z = 0; }
      p.grabbed = null;
      if (p.st === "grab" || p.st === "knee" || p.st === "throw") { p.st = "idle"; p.t = 0; }
    }
    function throwEnemy(e) {
      const p = S.p, H = HERO[S.hero];
      e.st = "thrown"; e.t = 0; e.vx = p.dir * 165 * H.throwPow; e.vz = 150; e.z = Math.max(e.z, 16);
      e.thrownDmg = Math.round(14 * H.dmg); e.thrownHits = new Set();
      if (e.kind === "bomb") e.lit = true;
      p.grabbed = null;
      addScore(100, e);
      sfx("whoosh");
    }
    function dropWeapon() {
      const p = S.p;
      S.items.push({ kind: "item", ik: p.weapon, x: p.x - p.dir * 12, y: p.y, z: 14, vz: 90, t: 0, dur: p.wdur, w: 6, h: 8 });
      p.weapon = null;
    }
    function useWeapon() {
      const p = S.p;
      p.wdur--;
      if (p.wdur <= 0) {
        for (let i = 0; i < 8; i++) fx("bit", p.x + p.dir * 16, p.y, 24, { vx: rnd(-80, 80), vz: rnd(30, 120), life: 0.4, c: p.weapon === "paper" ? "#f8fafc" : "#9775fa", g: 300 });
        popText(p, `${ITEMS[p.weapon].name} 부서졌어요`, "#ffd8a8");
        p.weapon = null;
        sfx("pop");
      }
    }
    function boxHit(a, A, t) {
      const dx = (t.x - a.x) * a.dir;
      if (dx + t.w < A.x0 || dx - t.w > A.x1) return false;
      if (Math.abs(t.y - a.y) > (A.dy || 9)) return false;
      const z0 = a.z + A.zlo, z1 = a.z + A.zhi;
      return !(t.z > z1 || t.z + t.h < z0);
    }
    function hittable(e) { return !e.dead && !e.inv && e.st !== "fade" && e.st !== "held" && e.st !== "down" && e.st !== "getup" && e.st !== "air" && e.st !== "thrown" && e.st !== "die" && e.st !== "enter"; }
    function doHits(A) {
      const p = S.p;
      let any = false;
      for (const e of S.en) {
        if (p.hits.has(e) || !hittable(e) || !boxHit(p, A, e)) continue;
        p.hits.add(e); any = true;
        const dir = A.special ? sgn(e.x - p.x) : p.dir;
        hurtEnemy(e, A.dmg, { knock: A.knock, dir, pow: A.pow || 1, special: A.special });
        if (A.fin && !A.special) addScore(50);
      }
      for (const o of S.props) {
        if (p.hits.has(o) || o.hp <= 0 || !boxHit(p, A, o)) continue;
        p.hits.add(o); any = true; hitProp(o);
      }
      if (any && !p.connected) {
        p.connected = true;
        S.hitstop = Math.max(S.hitstop, A.fin ? 5 : 3);
        if (A.fin) S.shake = Math.max(S.shake, 2);
        if (A.weapon && p.weapon) useWeapon();
      }
    }
    const JK = { x0: 2, x1: 27, zlo: -4, zhi: 30, dy: 10, knock: true, fin: true };
    const DASH = { x0: 0, x1: 26, zlo: -2, zhi: 36, dy: 10, knock: true, fin: true, pow: 1.2 };
    const SPEC = { x0: -46, x1: 46, zlo: -4, zhi: 56, dy: 20, knock: true, fin: true, special: true, pow: 1.3 };

    function updatePlayer() {
      const p = S.p, H = HERO[S.hero];
      p.t += STEP;
      if (p.invul > 0) p.invul -= STEP;
      if (p.comboT > 0) p.comboT -= STEP;
      if (p.flash > 0) p.flash--;
      const ctl = hasControl();
      const ix = ctl ? dirX() : 0, iy = ctl ? dirY() : 0;
      if (runDir && ix !== runDir) runDir = 0;
      if (ctl) {
        if (consume("atk")) p.atkBuf = 8; else if (p.atkBuf > 0) p.atkBuf--;
        if (consume("jmp")) p.jmpBuf = 6; else if (p.jmpBuf > 0) p.jmpBuf--;
        if (consume("sp")) p.spBuf = 6; else if (p.spBuf > 0) p.spBuf--;
        if (atkHeld()) { p.holdT += STEP; if (p.holdT > 0.26) { p.holdT -= 0.15; p.atkBuf = Math.max(p.atkBuf, 3); } } else p.holdT = 0;
      } else { p.atkBuf = p.jmpBuf = p.spBuf = 0; p.holdT = 0; }
      const free = p.st === "idle" || p.st === "walk" || p.st === "run" || p.st === "land";
      if (p.spBuf && (free || p.st === "atk" || p.st === "hurt" || p.st === "grab" || p.st === "knee")) {
        p.spBuf = 0;
        if (p.hp > 12) startSpecial(); else popText(p, "체력이 모자라요", "#ffc9c9");
      }
      switch (p.st) {
        case "idle": case "walk": case "run": case "land": {
          if (p.st === "land" && p.t < 0.07) break;
          if (p.jmpBuf) { p.jmpBuf = 0; startJump(ix, p.st === "run"); break; }
          if (p.atkBuf) { p.atkBuf = 0; if (p.st === "run") startDash(); else startAttack(); break; }
          const run = runDir !== 0 && ix === runDir;
          if (ix || iy) {
            if (ix) p.dir = ix;
            const k = ix && iy ? 0.8 : 1;
            p.x += ix * (run ? H.run : H.spd) * k * STEP;
            p.y += iy * H.spdY * k * STEP;
            const ns = run ? "run" : "walk";
            if (p.st !== ns) { p.st = ns; p.t = 0; }
          } else if (p.st !== "idle") { p.st = "idle"; p.t = 0; }
          if (ix && ix === p.dir && !run && !iy) {
            const e = grabTarget();
            if (e) { p.grabPush += STEP; if (p.grabPush > 0.12) { p.grabPush = 0; startGrab(e); } } else p.grabPush = 0;
          } else p.grabPush = 0;
          break;
        }
        case "atk": {
          const A = p.atk;
          p.f++;
          if (p.f >= A.s && p.f < A.s + A.a) { if (A.fin) p.x += p.dir * 0.6; doHits(A); }
          if (p.atkBuf && p.f >= A.s - 1) { p.queued = true; p.atkBuf = 0; }
          if (p.jmpBuf && p.f >= A.s + A.a) { p.jmpBuf = 0; startJump(ix, false); break; }
          if (p.f >= A.s + A.a + A.r) {
            p.comboStep = A.step; p.comboT = 0.4;
            if (p.queued) startAttack(); else { p.st = "idle"; p.t = 0; }
          }
          break;
        }
        case "jump": {
          p.x += p.vx * STEP; p.z += p.vz * STEP; p.vz -= GRAV * STEP;
          if (p.atkBuf && !p.jk) { p.atkBuf = 0; p.jk = 1; p.hits = new Set(); p.connected = false; }
          if (p.jk) doHits(Object.assign({ dmg: Math.round(9 * H.dmg) }, JK));
          if (p.z <= 0) { p.z = 0; p.vz = 0; p.st = "land"; p.t = 0; dust(p.x, p.y, 3); }
          break;
        }
        case "dash": {
          p.f++;
          p.x += p.vx * STEP; p.vx *= 0.94;
          p.z = Math.sin(Math.min(1, p.f / 24) * Math.PI) * 8;
          if (p.f >= 3 && p.f <= 17) doHits(Object.assign({ dmg: Math.round(10 * H.dmg) }, DASH));
          if (p.f >= 26) { p.z = 0; p.st = "idle"; p.t = 0; }
          break;
        }
        case "grab": {
          const e = p.grabbed;
          if (!e || e.dead || e.st !== "held") { p.grabbed = null; p.st = "idle"; p.t = 0; break; }
          e.x = p.x + p.dir * 17; e.y = p.y + 0.5; e.z = 0; e.dir = -p.dir;
          if (p.atkBuf) { p.atkBuf = 0; if (ix === -p.dir) { p.st = "throw"; p.f = 0; p.t = 0; } else { p.st = "knee"; p.f = 0; } }
          else if (p.jmpBuf) { p.jmpBuf = 0; dropGrab(); }
          else if (p.t > 1.7) dropGrab();
          break;
        }
        case "knee": {
          p.f++;
          const e = p.grabbed;
          if (!e || e.dead || e.st !== "held") { p.grabbed = null; p.st = "idle"; p.t = 0; break; }
          e.x = p.x + p.dir * 17; e.y = p.y + 0.5;
          if (p.f === 6) {
            p.knees++;
            const fin = p.knees >= 3;
            hurtEnemy(e, Math.round((fin ? 9 : 6) * H.dmg), { knock: fin, dir: p.dir });
            S.hitstop = Math.max(S.hitstop, fin ? 5 : 3);
            if (fin) { addScore(50); p.grabbed = null; }
          }
          if (p.f >= 18) {
            if (p.grabbed && p.grabbed.st === "held") { p.st = "grab"; p.t = 0; }
            else { p.grabbed = null; p.st = "idle"; p.t = 0; }
          }
          break;
        }
        case "throw": {
          p.f++;
          const e = p.grabbed;
          if (p.f === 1) p.dir = -p.dir;
          if (e && e.st === "held") {
            e.x = p.x - p.dir * (8 - p.f); e.z = 6 + p.f * 2.2; e.y = p.y + 0.5;
            if (p.f >= 8) throwEnemy(e);
          }
          if (p.f >= 22) { p.grabbed = null; p.st = "idle"; p.t = 0; }
          break;
        }
        case "special": {
          p.f++;
          if (p.f === 7 || p.f === 21) { p.hits = new Set(); p.connected = false; doHits(Object.assign({ dmg: Math.round(10 * H.dmg) }, SPEC)); }
          p.dir = Math.floor(p.f / 4) % 2 ? -p.sdir : p.sdir;
          if (p.f >= 34) { p.dir = p.sdir; p.st = "idle"; p.t = 0; }
          break;
        }
        case "hurt": p.x += p.vx * STEP; p.vx *= 0.85; if (p.t > 0.32) { p.st = "idle"; p.t = 0; } break;
        case "air": {
          p.x += p.vx * STEP; p.z += p.vz * STEP; p.vz -= GRAV * STEP;
          if (p.z <= 0) {
            p.z = 0; p.vx = 0; p.t = 0; dust(p.x, p.y, 6);
            if (p.hp <= 0) { p.st = "ko"; sfx("fail"); } else { p.st = "down"; sfx("land", 0.1); }
          }
          break;
        }
        case "down": if (p.t > 0.6) { p.st = "getup"; p.t = 0; } break;
        case "getup": if (p.t > 0.3) { p.st = "idle"; p.t = 0; p.invul = Math.max(p.invul, 1.0); } break;
        case "ko": if (p.t > 1.5) loseLife(); break;
        case "drop": {
          p.z += p.vz * STEP; p.vz -= GRAV * STEP;
          if (p.z <= 0) {
            p.z = 0; p.st = "idle"; p.t = 0; S.shake = 5; dust(p.x, p.y, 10); fx("ring", p.x, p.y, 2, { life: 0.4, r: 60, c: "#ffe066" });
            sfx("land");
            for (const e of S.en) if (!e.boss && hittable(e) && Math.abs(e.x - p.x) < 90) { e.token = false; knockFoe(e, sgn(e.x - p.x), 1); }
          }
          break;
        }
        case "auto": p.x += 72 * STEP; p.dir = 1; break;
        case "win": break;
      }
      if (p.st !== "auto" && p.st !== "win") p.x = clamp(p.x, S.camX + 10, S.camX + VW - 10);
      p.y = clamp(p.y, FT, FB);
      // 아이템 줍기
      if (p.z < 6 && p.st !== "down" && p.st !== "ko" && p.st !== "air" && p.st !== "drop") {
        for (const it of S.items) {
          if (it.gone || it.z > 4 || Math.abs(it.x - p.x) > 12 || Math.abs(it.y - p.y) > 8) continue;
          const I = ITEMS[it.ik];
          if (I.weapon) {
            if (p.weapon) continue;
            p.weapon = it.ik; p.wdur = it.dur || WEAPON[it.ik].uses;
            popText(p, I.name, "#d0bfff"); sfx("powerup");
          } else if (I.heal) {
            p.hp = Math.min(p.maxHp, p.hp + I.heal);
            popText(p, `${I.name} +${I.heal}`, "#b2f2bb"); sfx("powerup");
          } else {
            addScore(I.pts); popText(p, `${I.name} +${I.pts.toLocaleString("ko-KR")}`, "#ffe066"); sfx("coin");
          }
          it.gone = true;
        }
        S.items = S.items.filter((it) => !it.gone);
      }
    }
    function hurtPlayer(dmg, dir, knock) {
      const p = S.p;
      if (S.god || p.invul > 0 || !hasControl()) return false;
      if (p.st === "special" || p.st === "air" || p.st === "down" || p.st === "getup" || p.st === "ko" || p.st === "drop" || p.st === "auto") return false;
      dmg = Math.round(dmg * S.mul.dmg);
      p.hp = Math.max(0, p.hp - dmg); p.flash = 6;
      dropGrab();
      const now = S.t;
      p.hitTimes = p.hitTimes.filter((t) => now - t < 1.2); p.hitTimes.push(now);
      sfx("hurt", 0.05); S.shake = Math.max(S.shake, knock ? 5 : 3); S.hitstop = Math.max(S.hitstop, 3);
      spark(p.x, p.y, p.z + 28, false);
      if (knock || p.hp <= 0 || p.hitTimes.length >= 3 || p.st === "jump" || p.st === "dash") {
        p.hitTimes = []; p.st = "air"; p.t = 0; p.vx = dir * 95; p.vz = 170; p.z = Math.max(p.z, 1);
        if (p.weapon) dropWeapon();
      } else { p.st = "hurt"; p.t = 0; p.vx = dir * 50; }
      return true;
    }
    function loseLife() {
      const p = S.p;
      S.lives--;
      if (S.lives <= 0) {
        S.lives = 0; S.phase = "gameover"; S.phaseT = 0; Music.stop(); sfx("lose");
        return;
      }
      p.hp = p.maxHp; p.st = "drop"; p.t = 0; p.z = 130; p.vz = 0; p.invul = 2.6; p.weapon = null; p.flash = 0;
      p.x = clamp(p.x, S.camX + 40, S.camX + VW - 40);
      S.time = 99; S.timeAcc = 0;
    }
    function timeOver() {
      const p = S.p;
      S.time = 0;
      if (p.st === "ko" || p.st === "drop" || p.hp <= 0) return;
      dropGrab();
      p.hp = 0; p.st = "air"; p.t = 0; p.vx = -p.dir * 60; p.vz = 150; p.z = Math.max(1, p.z);
      S.banner2 = { text: "시간 초과!", t: 0 };
    }

    // ───────── 잡몹
    function liveCount() { let n = 0; for (const e of S.en) if (!e.dead && e.st !== "fade") n++; return n; }
    function tokens() { let n = 0; for (const e of S.en) if (e.token) n++; return n; }
    function takeToken(e) { if (e.token) return true; if (tokens() < S.maxAtk) { e.token = true; return true; } return false; }
    function spawnFoe(kind, at) {
      const K = FOE[kind];
      S.sideFlip = -S.sideFlip;
      const side = at ? at.side : S.sideFlip;
      const e = { kind, def: K.def, x: side < 0 ? S.camX - 26 : S.camX + VW + 26, y: rnd(FT + 4, FB - 4), z: kind === "bat" ? 58 : 0, vx: 0, vz: 0, dir: -side,
        hp: Math.round(K.hp * S.mul.hp), w: K.w, h: K.h, st: "enter", t: 0, anim: 0, cd: rnd(0.6, 1.4), flash: 0, slot: S.en.length % 3, yoff: rnd(-16, 16), seed: rnd(0, 6), alpha: 1, token: false };
      e.maxHp = e.hp;
      if (kind === "ghost") { e.x = clamp(S.p.x + side * 70, S.camX + 30, S.camX + VW - 30); e.st = "appear"; e.inv = true; e.alpha = 0; e.z = 4; }
      S.en.push(e);
      return e;
    }
    function knockFoe(e, dir, pow) {
      e.st = "air"; e.t = 0; e.token = false;
      e.vx = dir * 105 * pow;
      e.vz = e.kind === "bat" && e.z > 12 ? 30 : 140 + 40 * pow;
      e.z = Math.max(e.z, 1);
    }
    function startFade(e) {
      e.st = "fade"; e.t = 0; e.token = false; e.inv = true;
      if (!e.scored) { e.scored = true; S.kills++; addScore(e.boss ? 0 : FOE[e.kind].pts, e, "#ffffff"); }
      release(e);
      sfx("pop", 0.06);
    }
    function hurtEnemy(e, dmg, o) {
      if (e.dead || e.inv || e.st === "fade" || e.st === "die") return false;
      e.hp -= dmg; e.flash = 5;
      addScore(10);
      S.target = e; S.targetT = 3;
      spark(e.x, e.y, (e.z || 0) + Math.min(e.h * 0.6, 34), o.knock);
      sfx("hit", 0.04);
      if (e.boss) { bossHurt(e, o); return true; }
      e.token = false;
      if (e.hp <= 0) {
        e.hp = 0; e.dying = true;
        if (e.st === "held") S.p.grabbed = null;
        if (e.kind === "bomb") { startFade(e); return true; }
        knockFoe(e, o.dir, 1.1);
        return true;
      }
      if (o.knock) { if (e.st === "held") S.p.grabbed = null; knockFoe(e, o.dir, o.pow || 1); }
      else if (e.st !== "held") {
        if (e.kind === "bat" && e.z > 12) knockFoe(e, o.dir, 0.6);
        else { e.st = "hurt"; e.t = 0; e.vx = o.dir * 36; }
      }
      return true;
    }
    function explode(e, byPlayer) {
      if (e.dead) return;
      e.dead = true; e.st = "fade";
      if (byPlayer && !e.scored) addScore(FOE.bomb.pts, e);
      e.scored = true;
      boom(e.x, e.y, e.z || 0);
      sfx("explode"); S.shake = Math.max(S.shake, 6);
      const p = S.p;
      if (Math.abs(p.x - e.x) < 38 && Math.abs(p.y - e.y) < 16 && p.z < 30) hurtPlayer(FOE.bomb.dmg, sgn(p.x - e.x), true);
      for (const o of S.en) if (o !== e && hittable(o) && Math.abs(o.x - e.x) < 38 && Math.abs(o.y - e.y) < 16 && o.z < 30) hurtEnemy(o, 20, { knock: true, dir: sgn(o.x - e.x) });
      for (const o of S.props) if (o.hp > 0 && Math.abs(o.x - e.x) < 34 && Math.abs(o.y - e.y) < 16) { o.hp = 1; hitProp(o); }
    }
    function airFoe(e) {
      e.x += e.vx * STEP; e.z += e.vz * STEP; e.vz -= GRAV * STEP;
      const L = S.camX + 8, R = S.camX + VW - 8;
      if (e.x < L) { e.x = L; e.vx = Math.abs(e.vx) * 0.35; } else if (e.x > R) { e.x = R; e.vx = -Math.abs(e.vx) * 0.35; }
      if (e.st === "thrown") {
        for (const o of S.en) {
          if (o === e || e.thrownHits.has(o) || !hittable(o)) continue;
          if (Math.abs(o.x - e.x) < 16 && Math.abs(o.y - e.y) < 10 && o.z < 26) {
            e.thrownHits.add(o);
            if (e.kind === "bomb") { explode(e, true); return; }
            hurtEnemy(o, Math.round(12 * HERO[S.hero].dmg), { knock: true, dir: sgn(e.vx) });
            addScore(100, o);
          }
        }
      }
      if (e.z <= 0) {
        e.z = 0;
        dust(e.x, e.y, 5);
        if (e.st === "thrown") {
          if (e.kind === "bomb") { explode(e, true); return; }
          e.hp -= e.thrownDmg; S.shake = Math.max(S.shake, 3); sfx("land", 0.08);
          if (e.hp <= 0) { e.hp = 0; e.dying = true; }
        }
        if (e.kind === "bomb" && e.lit && !e.dying) { explode(e, false); return; }
        if (e.dying) { startFade(e); return; }
        e.st = "down"; e.t = 0; e.vx = 0;
      }
    }
    function stepTo(e, tx, ty, spd) {
      const mx = tx - e.x, my = ty - e.y;
      e.moving = false;
      if (Math.abs(mx) > 2) { e.x += sgn(mx) * Math.min(Math.abs(mx), spd * STEP); e.moving = true; }
      if (Math.abs(my) > 1) { e.y += sgn(my) * Math.min(Math.abs(my), spd * 0.62 * STEP); e.moving = true; }
    }
    function hitP(e, box, dmg, knock) {
      const p = S.p, dx = (p.x - e.x) * e.dir;
      if (dx < box[0] - p.w || dx > box[1] + p.w) return false;
      if (Math.abs(p.y - e.y) > 9) return false;
      if (p.z > (e.z || 0) + box[3] || p.z + p.h < (e.z || 0) + box[2]) return false;
      return hurtPlayer(dmg, e.dir, knock);
    }
    function areaHit(cx, cy, rx, ry, dmg, knock) {
      const p = S.p, ux = (p.x - cx) / rx, uy = (p.y - cy) / ry;
      if (ux * ux + uy * uy > 1 || p.z > 16) return false;
      return hurtPlayer(dmg, sgn(p.x - cx), knock);
    }
    const AI = {
      lump: aiMelee, zombie: aiMelee,
      bat(e, K) {
        const p = S.p;
        if (e.st === "move") {
          e.dir = p.x >= e.x ? 1 : -1;
          const side = e.x < p.x ? -1 : 1;
          stepTo(e, p.x + side * (52 + e.slot * 8) + Math.sin(e.t * 3 + e.seed) * 10, clamp(p.y - 4, FT, FB), K.spd * S.mul.spd);
          e.z += (46 + Math.sin(e.t * 6) * 3 - e.z) * Math.min(1, 2.5 * STEP);
          if (e.cd <= 0 && e.z > 30 && Math.abs(p.x - e.x) < 72 && Math.abs(p.y - e.y) < 14 && playerOpen() && takeToken(e)) { e.st = "wind"; e.t = 0; sfx("tick", 0.2); }
        } else if (e.st === "wind") {
          e.x += Math.sin(e.t * 70) * 0.7;
          if (e.t > 0.42) { e.st = "dive"; e.t = 0; e.x0 = e.x; e.y0 = e.y; e.z0 = e.z; e.tx = p.x + sgn(p.x - e.x) * 18; e.ty = p.y; e.hitDone = false; e.dir = sgn(p.x - e.x); }
        } else if (e.st === "dive") {
          const u = Math.min(1, e.t / 0.6), s = Math.sin(u * Math.PI);
          e.x = e.x0 + (e.tx - e.x0) * u; e.y = e.y0 + (e.ty - e.y0) * u; e.z = e.z0 * (1 - s) + 6 * s;
          if (!e.hitDone && e.z < 20 && Math.abs(p.x - e.x) < 14 && Math.abs(p.y - e.y) < 8 && p.z < e.z + 12 && p.z + p.h > e.z) { e.hitDone = true; hurtPlayer(K.dmg, e.dir, false); }
          if (u >= 1) { e.st = "rec"; e.t = 0; }
        } else if (e.st === "rec") {
          e.z += (46 - e.z) * Math.min(1, 3 * STEP);
          if (e.t > 0.6) { e.st = "move"; e.t = 0; e.cd = rnd(K.cd[0], K.cd[1]) * S.mul.cd; e.token = false; }
        } else { e.st = "move"; e.t = 0; }
      },
      ghost(e, K) {
        const p = S.p;
        if (e.st !== "vanish" && e.st !== "appear") e.z = 4 + Math.sin(e.t * 3 + e.seed) * 2;
        if (e.st === "move") {
          e.dir = p.x >= e.x ? 1 : -1;
          const side = e.x < p.x ? -1 : 1;
          stepTo(e, p.x + side * 66, clamp(p.y + e.yoff * 0.4, FT, FB), K.spd * S.mul.spd);
          if (e.cd <= 0 && playerOpen()) { e.st = "vanish"; e.t = 0; e.inv = true; sfx("whoosh", 0.3); }
        } else if (e.st === "vanish") {
          e.alpha = Math.max(0, 1 - e.t / 0.4);
          if (e.t >= 0.4) {
            const side = Math.random() < 0.5 ? -1 : 1;
            e.x = clamp(p.x + side * 52, S.camX + 20, S.camX + VW - 20); e.y = clamp(p.y + rnd(-5, 5), FT, FB);
            e.st = "appear"; e.t = 0;
          }
        } else if (e.st === "appear") {
          e.alpha = Math.min(1, e.t / 0.4); e.dir = p.x >= e.x ? 1 : -1;
          if (e.t >= 0.4) { e.alpha = 1; e.inv = false; if (playerOpen() && takeToken(e)) { e.st = "wind"; e.t = 0; } else { e.st = "move"; e.t = 0; e.cd = rnd(1.4, 2.2) * S.mul.cd; } }
        } else if (e.st === "wind") {
          e.dir = p.x >= e.x ? 1 : -1;
          if (e.t >= 0.42) {
            S.shots.push({ k: "puff", x: e.x + e.dir * 12, y: e.y, z: 16, vx: e.dir * 82, vy: (p.y - e.y) * 0.4, life: 3, dmg: K.dmg, t: 0 });
            e.st = "rec"; e.t = 0; sfx("pop", 0.1);
          }
        } else if (e.st === "rec") {
          if (e.t >= 0.6) { e.st = "move"; e.t = 0; e.cd = rnd(K.cd[0], K.cd[1]) * S.mul.cd; e.token = false; }
        } else { e.st = "move"; e.t = 0; }
      },
      bomb(e, K) {
        const p = S.p;
        if (e.st === "move") {
          e.dir = p.x >= e.x ? 1 : -1;
          if (playerOpen()) stepTo(e, p.x - e.dir * 10, p.y, K.spd * S.mul.spd);
          else e.moving = false;
          if (Math.abs(p.x - e.x) < 24 && Math.abs(p.y - e.y) < 8 && playerOpen()) { e.st = "fuse"; e.t = 0; e.lit = true; sfx("tick"); }
        } else if (e.st === "fuse") {
          if (Math.floor(e.t * 8) !== Math.floor((e.t - STEP) * 8)) sfx("tick", 0.08);
          if (e.t >= 0.9) explode(e, false);
        } else { e.st = e.lit ? "fuse" : "move"; e.t = e.lit ? 0.5 : 0; }
      },
    };
    function aiMelee(e, K) {
      const p = S.p, dx = p.x - e.x, dy = p.y - e.y;
      if (e.st === "move") {
        e.dir = dx >= 0 ? 1 : -1;
        const ready = e.cd <= 0 && playerOpen() && takeToken(e);
        const side = e.x < p.x ? -1 : 1;
        const dist = ready ? K.reach - 4 : K.wait + e.slot * 12;
        stepTo(e, p.x + side * dist, ready ? p.y : clamp(p.y + e.yoff, FT, FB), K.spd * S.mul.spd * (ready ? 1.15 : 1));
        if (ready && Math.abs(dx) <= K.reach + 3 && Math.abs(dy) < 5) { e.st = "wind"; e.t = 0; }
      } else if (e.st === "wind") {
        if (e.t >= K.wind) { e.st = "atk"; e.t = 0; e.hitDone = false; if (K.lunge) e.vx = e.dir * K.lunge; }
      } else if (e.st === "atk") {
        if (K.lunge) { e.x += e.vx * STEP; e.vx *= 0.9; }
        if (!e.hitDone && e.t >= K.hitAt && e.t <= K.hitAt + 0.14 && hitP(e, K.box, K.dmg, false)) e.hitDone = true;
        if (e.t >= K.atkT) { e.st = "rec"; e.t = 0; }
      } else if (e.st === "rec") {
        if (e.t >= K.rec) { e.st = "move"; e.t = 0; e.cd = rnd(K.cd[0], K.cd[1]) * S.mul.cd; e.token = false; }
      } else { e.st = "move"; e.t = 0; }
    }
    function updateFoe(e) {
      const K = FOE[e.kind];
      e.t += STEP; e.anim += STEP;
      if (e.flash > 0) e.flash--;
      if (e.cd > 0) e.cd -= STEP;
      switch (e.st) {
        case "enter": {
          const tx = clamp(e.x, S.camX + 24, S.camX + VW - 24), d = tx - e.x;
          e.dir = d > 0 ? 1 : d < 0 ? -1 : e.dir;
          if (Math.abs(d) < 1) { e.st = "move"; e.t = 0; }
          else { e.x += sgn(d) * Math.min(Math.abs(d), Math.max(K.spd, 44) * STEP); e.moving = true; }
          if (e.kind === "bat") e.z += (46 - e.z) * Math.min(1, 2 * STEP);
          break;
        }
        case "hurt": e.x += e.vx * STEP; e.vx *= 0.86; if (e.t > 0.3) { e.st = "move"; e.t = 0; e.cd = Math.max(e.cd, 0.35); } break;
        case "air": case "thrown": airFoe(e); break;
        case "down": if (e.t > 0.75) { e.st = "getup"; e.t = 0; e.inv = true; } break;
        case "getup": if (e.t > 0.35) { e.inv = false; e.st = e.kind === "bomb" && e.lit ? "fuse" : "move"; e.t = e.kind === "bomb" && e.lit ? 0.45 : 0; e.cd = Math.max(e.cd, 0.6); } break;
        case "held": if (e.t > 2.4) { e.st = "move"; e.t = 0; S.p.grabbed = null; } break;
        case "fade": if (e.t > 0.85) e.dead = true; break;
        default: AI[e.kind](e, K);
      }
      e.y = clamp(e.y, FT, FB);
      if (e.st !== "enter" && e.st !== "fade") e.x = clamp(e.x, S.camX + 6, S.camX + VW - 6);
    }

    // ───────── 보스
    const BOSS_RANGE = { golem: 84, knight: 74, giant: 80, demon: 96 };
    function mark(x, y, rx, ry, dur, fn, kind) { const m = { x, y, rx, ry, t: 0, dur, fn, kind: kind || "ring" }; S.marks.push(m); return m; }
    function laneMark(b) { S.marks.push({ lane: true, y: b.ty, x: b.x, dir: b.dir, t: 0, dur: b.windT, kind: "lane" }); }
    const atEdge = (b) => (b.dir < 0 && b.x <= S.camX + 22) || (b.dir > 0 && b.x >= S.camX + VW - 22);
    const MOVES = {
      throw: { wind: 0.5, anim: ["throwW", "throw"], rec: 0.6,
        step(b) {
          for (let k = 0; k < 3; k++) if (!b.fired[k] && b.t >= k * 0.2) {
            b.fired[k] = 1;
            S.shots.push({ k: "paper", x: b.x + b.dir * 36, y: clamp(S.p.y + rnd(-3, 3), FT, FB), z: 30, vx: b.dir * 150, vy: 0, life: 3, dmg: 9, t: 0 });
            sfx("swap", 0.05);
          }
          return b.t > 0.55;
        } },
      slam: { wind: 0.75, anim: ["wind", "slam"], rec: 0.85,
        start(b) { mark(b.x + b.dir * 40, b.y, 44, 16, 0.75); },
        step(b) {
          if (!b.hitDone) { b.hitDone = true; S.shake = 7; sfx("explode"); dust(b.x + b.dir * 40, b.y, 12); fx("ring", b.x + b.dir * 40, b.y, 1, { life: 0.35, r: 46, c: "#fff6e0" }); areaHit(b.x + b.dir * 40, b.y, 44, 16, 14, true); }
          return b.t > 0.25;
        } },
      slide: { wind: 0.45, anim: ["slide", "slide"], rec: 0.75,
        start(b) { b.ty = S.p.y; laneMark(b); },
        step(b) { b.y += (b.ty - b.y) * 0.2; b.x += b.dir * 185 * STEP; if (!b.hitDone && hitP(b, [0, 38, 0, 90], 12, true)) b.hitDone = true; return b.t > 0.65 || atEdge(b); } },
      dash: { wind: 0.65, anim: ["windDash", "dash"], rec: 0.8,
        start(b) { b.ty = S.p.y; laneMark(b); },
        step(b) { b.y += (b.ty - b.y) * 0.3; b.x += b.dir * 275 * STEP; if (!b.hitDone && hitP(b, [-6, 46, 0, 90], 14, true)) b.hitDone = true; return b.t > 0.95 || atEdge(b); } },
      spin: { wind: 0.48, anim: ["windSpin", "spin"], rec: 0.65,
        start(b) { mark(b.x, b.y, 56, 18, 0.48); },
        step(b) { if (!b.hitDone && areaHit(b.x, b.y, 56, 18, 12, true)) b.hitDone = true; return b.t > 0.5; } },
      call: { wind: 0.5, anim: ["call", "call"], rec: 0.5,
        step(b) { if (!b.hitDone) { b.hitDone = true; b.called++; spawnFoe("bomb"); spawnFoe("lump"); sfx("countdown"); popText(b, "알람 소환!", "#ffd8a8"); } return b.t > 0.3; } },
      rush: { wind: 0.85, anim: ["windRush", "rush"], rec: 1.15,
        start(b) { b.ty = S.p.y; laneMark(b); },
        step(b) {
          b.y += (b.ty - b.y) * 0.2; b.x += b.dir * 235 * STEP;
          if (Math.floor(b.t * 10) !== Math.floor((b.t - STEP) * 10)) dust(b.x - b.dir * 14, b.y, 2);
          if (!b.hitDone && hitP(b, [-6, 48, 0, 100], 18, true)) b.hitDone = true;
          if (atEdge(b)) { S.shake = 8; sfx("explode"); return true; }
          return b.t > 1.5;
        } },
      stomp: { wind: 0.35, anim: ["jump", "jump"], rec: 0.95,
        start(b) { b.tx = clamp(S.p.x, S.camX + 30, S.camX + VW - 30); b.tyy = S.p.y; mark(b.tx, b.tyy, 52, 18, 1.05); },
        step(b) {
          if (b.t <= STEP * 1.5) { b.sx = b.x; b.sy = b.y; }
          const u = Math.min(1, b.t / 0.7);
          b.x = b.sx + (b.tx - b.sx) * u; b.y = b.sy + (b.tyy - b.sy) * u; b.z = Math.sin(u * Math.PI) * 90;
          if (u >= 1 && !b.hitDone) { b.hitDone = true; b.z = 0; S.shake = 8; sfx("explode"); dust(b.x, b.y, 14); fx("ring", b.x, b.y, 1, { life: 0.4, r: 56, c: "#fff6e0" }); areaHit(b.x, b.y, 52, 18, 16, true); }
          return u >= 1;
        } },
      swing: { wind: 0.5, anim: ["windSwing", "swing"], rec: 0.65,
        step(b) { if (!b.hitDone && b.t > 0.04) { b.hitDone = true; hitP(b, [0, 62, 10, 100], 12, true); sfx("whoosh", 0.2); } return b.t > 0.28; } },
      orbs: { wind: 0.5, anim: ["cast", "cast"], rec: 0.65,
        step(b) {
          if (!b.hitDone) {
            b.hitDone = true;
            const n = b.p2 ? 5 : 3;
            for (let i = 0; i < n; i++) S.shots.push({ k: "orb", x: b.x + b.dir * 34, y: b.y, z: 40, vx: b.dir * (b.p2 ? 105 : 92), vy: (i - (n - 1) / 2) * 20, life: 4.5, dmg: 10, t: 0 });
            sfx("laser");
          }
          return b.t > 0.3;
        } },
      warp: { wind: 0.4, anim: ["idle", "swipe"], rec: 0.6,
        start(b) { b.inv = true; },
        step(b) {
          if (b.t <= STEP * 1.5) {
            const p = S.p;
            b.x = clamp(p.x - p.dir * 44, S.camX + 24, S.camX + VW - 24); b.y = p.y; b.dir = sgn(p.x - b.x); b.alpha = 1; b.inv = false;
            fx("ring", b.x, b.y, 20, { life: 0.3, r: 22, c: "#d0bfff" });
          }
          if (b.t >= 0.4 && !b.hitDone) { b.hitDone = true; hitP(b, [0, 54, 10, 90], 14, true); sfx("whoosh", 0.2); }
          return b.t > 0.6;
        } },
      rain: { wind: 0.4, anim: ["raise", "raise"], rec: 0.7,
        step(b) {
          if (!b.hitDone) {
            b.hitDone = true;
            const p = S.p;
            for (let k = 0; k < 4; k++) {
              const x = clamp(k === 0 ? p.x : p.x + rnd(-90, 90), S.camX + 16, S.camX + VW - 16), y = clamp(k === 0 ? p.y : p.y + rnd(-26, 26), FT, FB);
              mark(x, y, 20, 8, 0.95 + k * 0.12, () => { areaHit(x, y, 21, 9, 12, true); boom(x, y, 0); sfx("explode", 0.1); }, "clock");
            }
          }
          return b.t > 0.4;
        } },
      summon: { wind: 0.5, anim: ["raise", "raise"], rec: 0.5,
        step(b) { if (!b.hitDone) { b.hitDone = true; b.called++; spawnFoe("bat"); spawnFoe("bat"); sfx("countdown"); } return b.t > 0.3; } },
    };
    function spawnBoss(kind) {
      const B = BOSS[kind];
      const b = { boss: true, kind, def: B.def, name: B.name, x: S.camX + VW + 56, y: 196, z: 0, vx: 0, vz: 0, dir: -1, hp: B.hp, maxHp: B.hp, w: B.w, h: B.h,
        st: "enter", t: 0, cd: 1.2, poise: 5, flash: 0, anim: 0, move: null, p2: false, called: 0, alpha: 1, fired: [] };
      S.en.push(b); S.boss = b; S.target = b; S.targetT = 99;
      return b;
    }
    function chooseMove(b, adx, ady) {
      const r = Math.random();
      let m;
      if (b.kind === "golem") m = adx < 90 && ady < 14 && r < 0.6 ? "slam" : r < 0.45 ? "slide" : "throw";
      else if (b.kind === "knight") m = adx < 58 && ady < 14 ? "spin" : !b.called && b.hp < b.maxHp * 0.6 && liveCount() < 3 ? "call" : r < 0.7 ? "dash" : "spin";
      else if (b.kind === "giant") m = adx < 70 && ady < 12 ? "swing" : r < 0.5 ? "rush" : "stomp";
      else {
        const minions = liveCount() - 1;
        if (b.called < (b.p2 ? 2 : 1) && b.hp < b.maxHp * (b.p2 ? 0.35 : 0.8) && minions < 2) m = "summon";
        else if (b.p2) m = r < 0.35 ? "rain" : r < 0.68 ? "warp" : "orbs";
        else m = r < 0.55 ? "orbs" : "warp";
      }
      const M = MOVES[m];
      b.move = m; b.st = "wind"; b.t = 0; b.windT = M.wind * (b.p2 ? 0.85 : 1); b.hitDone = false; b.fired = [];
      if (M.start) M.start(b);
    }
    function bossHurt(b, o) {
      if (b.hp <= 0) { bossDie(b); return; }
      if (b.kind === "demon" && !b.p2 && b.hp <= b.maxHp / 2) {
        b.st = "transform"; b.t = 0; b.inv = true; b.alpha = 1; S.marks = []; S.shots = [];
        S.banner2 = { text: "월요병 대마왕이 화났어요!", t: 0 };
        sfx("countdown"); S.shake = 6;
        return;
      }
      b.poise -= o.special ? 3 : o.knock ? 2 : 1;
      if (b.poise <= 0 && (b.st === "idle" || b.st === "rec")) { b.st = "flinch"; b.t = 0; b.poise = 5 + S.stage; b.vx = o.dir * 40; }
      if (b.poise < -3) b.poise = -3;
    }
    function bossDie(b) {
      b.st = "die"; b.t = 0; b.inv = true; b.hp = 0; b.z = 0;
      S.marks = []; S.shots = [];
      addScore(5000 * (S.stage + 1), b, "#ffd43b");
      for (const e of S.en) if (!e.boss && e.st !== "fade" && !e.dead) { e.scored = true; startFade(e); }
      S.spawnQ = [];
      dropGrab();
      S.slowT = 1.3; S.shake = 9; sfx("explode"); Music.stop();
      S.phase = "clear"; S.phaseT = 0;
    }
    function updateBoss(b) {
      const B = BOSS[b.kind], p = S.p;
      b.t += STEP; b.anim += STEP;
      if (b.flash > 0) b.flash--;
      if (b.cd > 0 && S.phase === "play") b.cd -= STEP;
      const dx = p.x - b.x, dy = p.y - b.y;
      switch (b.st) {
        case "enter":
          b.dir = -1; b.x -= B.spd * 1.3 * STEP; b.moving = true;
          if (b.x <= S.camX + VW - 72) { b.st = "idle"; b.t = 0; b.cd = 0.9; }
          break;
        case "idle": {
          b.dir = dx >= 0 ? 1 : -1;
          if (playerOpen()) stepTo(b, p.x - b.dir * BOSS_RANGE[b.kind], p.y, B.spd * (b.p2 ? 1.35 : 1));
          else stepTo(b, p.x - b.dir * 110, b.y, B.spd * 0.6);
          if (b.cd <= 0 && playerOpen() && S.phase === "play") chooseMove(b, Math.abs(dx), Math.abs(dy));
          break;
        }
        case "flinch": b.x += b.vx * STEP; b.vx *= 0.85; if (b.t > 0.3) { b.st = "idle"; b.t = 0; b.cd = Math.min(b.cd, 0.5); } break;
        case "wind": {
          const M = MOVES[b.move];
          if (b.move === "warp") b.alpha = Math.max(0, 1 - b.t / 0.4);
          if (b.move === "stomp") b.z = Math.min(8, b.t * 30);
          if (b.t >= b.windT) { b.st = "atk"; b.t = 0; b.hitDone = false; if (b.move === "stomp") b.z = 0; void M; }
          break;
        }
        case "atk":
          if (MOVES[b.move].step(b)) {
            b.z = 0; b.alpha = 1; b.inv = false;
            if (b.move === "warp" && b.p2 && !b.rep) { b.rep = true; b.st = "wind"; b.t = 0; b.hitDone = false; b.inv = true; }
            else { b.rep = false; b.st = "rec"; b.t = 0; b.recT = MOVES[b.move].rec * (b.p2 ? 0.8 : 1); }
          }
          break;
        case "rec": if (b.t >= b.recT) { b.st = "idle"; b.t = 0; b.cd = rnd(0.5, 1.1) * (b.p2 ? 0.7 : 1) * (1 - S.stage * 0.06); } break;
        case "transform":
          if (Math.floor(b.t * 10) !== Math.floor((b.t - STEP) * 10)) fx("ring", b.x, b.y, 30, { life: 0.3, r: 30, c: "#ff6b6b" });
          if (b.t > 1.4) { b.p2 = true; b.inv = false; b.st = "idle"; b.t = 0; b.cd = 0.6; b.poise = 7; }
          break;
        case "die":
          if (Math.floor(b.t * 8) !== Math.floor((b.t - STEP) * 8)) { release({ x: b.x + rnd(-14, 14), y: b.y, z: rnd(10, 50) }); boom(b.x + rnd(-16, 16), b.y, rnd(10, 50)); }
          b.alpha = Math.max(0, 1 - Math.max(0, b.t - 1.2) / 0.8);
          if (b.t > 2.0) b.dead = true;
          break;
      }
      b.y = clamp(b.y, FT, FB);
      if (b.st !== "enter" && b.st !== "die") b.x = clamp(b.x, S.camX + 16, S.camX + VW - 16);
    }

    // ───────── 물건 · 날아오는 것 · 표시
    function hitProp(o) {
      o.hp--; o.flash = 5; o.wob = 8;
      sfx("hit", 0.04);
      if (o.hp <= 0) {
        for (let i = 0; i < 10; i++) fx("bit", o.x, o.y, 10, { vx: rnd(-90, 90), vz: rnd(40, 150), life: rnd(0.3, 0.55), c: pick(["#dee2e6", "#adb5bd", "#74c0fc", "#d4a373", "#40c057"]), g: 340 });
        S.items.push({ kind: "item", ik: o.item, x: o.x, y: o.y + 1, z: 8, vz: 100, t: 0, w: 6, h: 8 });
        addScore(50, o);
        sfx("pop");
      }
    }
    function updateWorldBits() {
      for (const o of S.props) { if (o.flash > 0) o.flash--; if (o.wob > 0) o.wob--; }
      S.props = S.props.filter((o) => o.hp > 0);
      for (const it of S.items) { it.t += STEP; if (it.z > 0 || it.vz > 0) { it.z += it.vz * STEP; it.vz -= GRAV * STEP; if (it.z <= 0) { it.z = 0; it.vz = it.vz < -60 ? -it.vz * 0.3 : 0; } } }
      const p = S.p;
      for (const s of S.shots) {
        s.t += STEP; s.life -= STEP;
        s.x += s.vx * STEP; s.y = clamp(s.y + (s.vy || 0) * STEP, FT - 4, FB + 4);
        if (!s.done && Math.abs(p.x - s.x) < 11 && Math.abs(p.y - s.y) < 7 && s.z < p.z + p.h && s.z + 8 > p.z) {
          if (p.st === "special") { s.done = true; spark(s.x, s.y, s.z, false); }
          else if (hurtPlayer(s.dmg, sgn(s.vx), s.k === "orb")) s.done = true;
        }
        if (s.life <= 0 || s.x < S.camX - 40 || s.x > S.camX + VW + 40) s.done = true;
      }
      S.shots = S.shots.filter((s) => !s.done);
      for (const m of S.marks) { m.t += STEP; if (m.t >= m.dur) { m.done = true; if (m.fn) m.fn(); } }
      S.marks = S.marks.filter((m) => !m.done);
      // 같은 자리에 겹쳐 서지 않게 살짝 밀어낸다
      const list = S.en;
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const a = list[i], c = list[j];
        if (a.boss || c.boss || a.st !== "move" || c.st !== "move") continue;
        const dx = c.x - a.x, dy = c.y - a.y;
        if (Math.abs(dx) < 12 && Math.abs(dy) < 5) { const k = dx >= 0 ? 0.6 : -0.6; a.x -= k; c.x += k; a.y -= dy >= 0 ? 0.3 : -0.3; c.y += dy >= 0 ? 0.3 : -0.3; }
      }
    }
    function updateFx() {
      for (const f of S.fx) {
        f.t += STEP;
        f.x += f.vx * STEP; f.y += f.vy * STEP; f.z += f.vz * STEP;
        if (f.g) { f.vz -= f.g * STEP; if (f.z < 0) { f.z = 0; f.vz = -f.vz * 0.3; f.vx *= 0.6; } }
      }
      S.fx = S.fx.filter((f) => f.t < f.life);
      for (const q of S.pops) q.t += STEP;
      S.pops = S.pops.filter((q) => q.t < (q.ko ? 1.3 : 0.9));
    }

    // ───────── 카메라 · 구역
    function updateCamera() {
      const p = S.p, D = S.def;
      if (S.zone || S.boss) return;
      const nextAt = S.zoneIdx < D.zones.length ? D.zones[S.zoneIdx].at : D.end;
      const target = Math.min(nextAt, p.x - 150);
      if (target > S.camX) S.camX = Math.min(target, S.camX + 220 * STEP);
      if (S.camX >= nextAt - 0.01 && p.st !== "auto") {
        S.camX = nextAt; S.goT = 0;
        if (S.zoneIdx < D.zones.length) S.zone = { waves: D.zones[S.zoneIdx].waves, wave: 0, wait: 0.35 };
        else startBoss();
      }
    }
    function updateZone() {
      const Z = S.zone;
      if (!Z) return;
      const alive = liveCount() + S.spawnQ.length;
      if (Z.wave < Z.waves.length) {
        if (alive <= (Z.wave === 0 ? 0 : 1)) {
          Z.wait -= STEP;
          if (Z.wait <= 0) { Z.waves[Z.wave].forEach((k, i) => S.spawnQ.push({ kind: k, delay: i * 0.5 })); Z.wave++; Z.wait = 0.9; }
        }
      } else if (alive === 0) {
        S.zone = null; S.zoneIdx++; S.goT = 4; sfx("go");
      }
    }
    function updateSpawnQ() {
      for (const q of S.spawnQ) q.delay -= STEP;
      while (S.spawnQ.length && S.spawnQ[0].delay <= 0 && liveCount() < S.maxE) spawnFoe(S.spawnQ.shift().kind);
    }
    function startBoss() {
      const D = S.def;
      S.camX = D.end;
      S.phase = "warning"; S.phaseT = 0;
      spawnBoss(D.boss);
      S.time = 99; S.timeAcc = 0;
      Music.stop();
      sfx("countdown");
    }

    // ───────── 한 걸음 (1/60초)
    function update() {
      S.frame++;
      if (S.fade > 0 && S.phase !== "fade" && S.phase !== "gameover") S.fade = Math.max(0, S.fade - STEP * 2);
      if (S.shake > 0) S.shake = Math.max(0, S.shake - STEP * 20);
      if (S.hitstop > 0) { S.hitstop--; return; }
      if (S.slowT > 0) { S.slowT -= STEP; S.slowAcc += 0.4; if (S.slowAcc < 1) { updateFx(); return; } S.slowAcc -= 1; }
      S.t += STEP; S.phaseT += STEP;
      if (S.banner2) { S.banner2.t += STEP; if (S.banner2.t > 1.8) S.banner2 = null; }
      if (S.targetT > 0) { S.targetT -= STEP; if (S.targetT <= 0 || (S.target && S.target.dead)) S.target = S.boss && !S.boss.dead ? S.boss : null; }
      if (S.goT > 0) S.goT -= STEP;
      // 배경 연출
      if (S.stage === 2) {
        if (S.train) { S.train.x += S.train.v * STEP; if (S.train.x < -760) { S.train = null; S.trainCd = rnd(6, 10); } }
        else if ((S.trainCd -= STEP) <= 0) { S.train = { x: VW + 10, v: -520 }; sfx("whoosh", 1); }
      }
      if (S.stage === 1) { if (S.flick > 0) S.flick -= STEP; else if ((S.flickCd -= STEP) <= 0) { S.flick = rnd(0.06, 0.2); S.flickCd = rnd(1.2, 4.5); } }
      switch (S.phase) {
        case "intro":
          updatePlayer();
          if (S.p.st === "auto" && S.p.x >= S.camX + 64) { S.p.st = "idle"; S.p.t = 0; }
          if (S.phaseT > 2.0) { S.phase = "play"; S.phaseT = 0; if (S.p.st === "auto") { S.p.st = "idle"; S.p.t = 0; } }
          break;
        case "warning":
        case "play":
          if (S.phase === "warning" && S.phaseT > 2.4) { S.phase = "play"; S.phaseT = 0; playSong("boss"); }
          updatePlayer();
          for (const e of S.en) if (!e.dead) { if (e.boss) updateBoss(e); else updateFoe(e); }
          S.en = S.en.filter((e) => !e.dead);
          if (S.boss && S.boss.dead) S.boss = null;
          updateWorldBits();
          updateCamera(); updateZone(); updateSpawnQ();
          if (S.phase === "play" && S.p.st !== "ko" && S.p.st !== "drop") {
            S.timeAcc += STEP;
            if (S.timeAcc >= 1.25) {
              S.timeAcc -= 1.25; S.time--;
              if (S.time <= 10 && S.time > 0) sfx("tick");
              if (S.time <= 0) timeOver();
            }
          }
          break;
        case "clear":
          updatePlayer();
          for (const e of S.en) if (!e.dead) { if (e.boss) updateBoss(e); else updateFoe(e); }
          S.en = S.en.filter((e) => !e.dead);
          updateWorldBits();
          if (S.phaseT > 1.4 && S.p.z <= 0 && (S.p.st === "idle" || S.p.st === "walk" || S.p.st === "run" || S.p.st === "land" || S.p.st === "atk" || S.p.st === "hurt")) { S.p.st = "win"; S.p.t = 0; }
          if (S.phaseT > 1.6 && S.phaseT - STEP <= 1.6) sfx("success");
          if (S.phaseT > 3.0 && !S.en.length) {
            const p = S.p;
            S.phase = "tally"; S.phaseT = 0;
            S.tally = { lines: [{ label: "남은 시간", n: Math.max(0, S.time), mul: 50, shown: 0 }, { label: "남은 체력", n: Math.max(0, Math.round(p.hp)), mul: 30, shown: 0 }], i: 0, t: 0 };
          }
          break;
        case "tally": {
          const T = S.tally;
          T.t += STEP;
          if (T.i < T.lines.length) {
            const L = T.lines[T.i];
            if (T.t > 0.35) {
              const add = Math.min(Math.max(1, Math.ceil(L.n / 28)), L.n - L.shown);
              L.shown += add; S.score = Math.min(9999999, S.score + add * L.mul);
              if (S.frame % 3 === 0) sfx("tick");
              if (L.shown >= L.n) { T.i++; T.t = 0; sfx("coin"); }
            }
          } else if (T.t > 1.5 || (T.t > 0.5 && consume("atk"))) {
            if (S.stage < STAGES.length - 1) { S.phase = "fade"; S.phaseT = 0; }
            else {
              S.phase = "ending"; S.phaseT = 0; S.cleared = true;
              S.endBonus = { n: S.lives, shown: 0 };
              const p = S.p; p.st = "auto"; p.t = 0; p.dir = 1;
              playSong("end"); sfx("win");
            }
          }
          break;
        }
        case "fade":
          S.fade = Math.min(1, S.phaseT / 0.7);
          if (S.phaseT > 0.8) startStage(S.stage + 1);
          break;
        case "ending": {
          const p = S.p;
          p.t += STEP;
          if (p.x < S.camX + VW + 30) p.x += 34 * STEP;
          const E = S.endBonus;
          if (S.phaseT > 2.6 && E.shown < E.n && Math.floor(S.phaseT * 3) !== Math.floor((S.phaseT - STEP) * 3)) { E.shown++; S.score = Math.min(9999999, S.score + 10000); sfx("coin"); }
          updateFx();
          if (S.phaseT > 7.5 || (S.phaseT > 3.5 && E.shown >= E.n && consume("atk"))) finish(true);
          break;
        }
        case "gameover":
          updateFx();
          if (S.phaseT > 2.6) finish(false);
          break;
      }
      if (S.phase !== "ending" && S.phase !== "gameover") updateFx();
      updateAmbient();
    }

    // ═════════ 그리기
    function tile(img, off, y) {
      const w = img.width;
      let x = -((((Math.round(off) % w) + w) % w));
      for (; x < VW; x += w) G.drawImage(img, x, y);
    }
    function layerGlows(list, w, off, t) {
      const o = (((Math.round(off) % w) + w) % w);
      for (const q of list) {
        const [x, y, r, c, a, k] = q;
        let al = a;
        if (k === "blink") al *= Math.sin(t * 3 + x) > 0 ? 1 : 0.15;
        else if (k === "flick") al *= Math.sin(t * 23 + x) > -0.9 ? 0.9 + 0.1 * Math.sin(t * 5 + x) : 0.3;
        else if (k === "flick2") al *= S && S.flick > 0 ? 0.1 : 1;
        else if (k === "mon") al *= 0.82 + 0.18 * Math.sin(t * 2.2 + x * 0.1);
        for (let sx = x - o; sx < VW + r; sx += w) if (sx > -r) glow(G, sx, y, r, c, al);
      }
    }
    function floorPools(Lw, cam) {
      const w = Lw.c.width, o = (((Math.round(cam) % w) + w) % w), g = G;
      g.globalCompositeOperation = "lighter";
      for (const [x, pw, c, a] of Lw.pools) for (let sx = x - o; sx < VW + pw; sx += w) if (sx > -pw) {
        g.globalAlpha = S && S.flick > 0 ? a * 0.2 : a; g.drawImage(glowSprite(c, 32), Math.round(sx - pw / 2), 150, pw, 40);
      }
      g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
    }
    function shadow(x, y, rx) {
      G.fillStyle = "rgba(14,8,34,.34)";
      ell(G, Math.round(x), Math.round(y), Math.max(2, Math.round(rx)), 2);
    }
    function drawTrain(tx, P) {
      const g = G, x0 = Math.round(tx), T = P.train;
      for (let c = 0; c < 4; c++) {
        const cx = x0 + c * 190;
        if (cx > VW || cx + 186 < 0) continue;
        bandsV(g, cx, 56, 186, 78, [T[3], T[2], T[2], T[1]]);
        R(g, T[4], cx, 56, 186, 2); R(g, P.warn, cx, 106, 186, 4); R(g, ramp(P.warn, -1), cx, 109, 186, 1); R(g, T[0], cx, 128, 186, 6);
        for (let k = 0; k < 5; k++) {
          const wx = cx + 8 + k * 36;
          R(g, T[0], wx - 1, 65, 28, 28); bandsV(g, wx, 66, 26, 26, ["#fff2c4", "#ffe08a", "#f2c46a"]);
          for (let h = 0; h < 3; h++) { const hx = wx + 3 + h * 8 + ((c + k + h) % 2), hy = 80 - ((k + h) % 3); R(g, "#3a3350", hx, hy, 5, 5); R(g, "#4a4060", hx - 1, hy + 5, 7, 8); }
          R(g, "#c9a95a", wx, 66, 26, 1);
        }
        R(g, T[0], cx + 186, 64, 4, 64);
        glow(g, cx + 93, 80, 90, "#ffe08a", 0.22);
      }
      R(g, T[2], x0 - 10, 62, 10, 72); R(g, "#fff6e0", x0 - 8, 112, 4, 4); glow(g, x0 - 6, 114, 20, "#fff6e0", 0.6);
    }
    function foeSprite(e) {
      let anim = "move", f = 0;
      const mf = MOVE_FRAMES[e.kind];
      switch (e.st) {
        case "enter": case "move": anim = e.moving || e.kind === "bat" || e.kind === "ghost" ? "move" : "idle"; f = Math.floor(e.anim * (e.kind === "bat" ? 10 : e.kind === "bomb" ? 10 : 6)) % mf; if (anim === "idle") { anim = e.kind === "zombie" ? "move" : "idle"; f = Math.floor(e.anim * 2) % 2; } break;
        case "wind": anim = "wind"; f = Math.floor(e.anim * 8) % 2; break;
        case "atk": anim = "atk"; break;
        case "dive": anim = "dive"; break;
        case "rec": anim = e.kind === "zombie" ? "atk" : "move"; if (e.t > 0.2) anim = e.kind === "zombie" ? "move" : "idle"; break;
        case "hurt": case "held": anim = "hurt"; break;
        case "air": case "thrown": anim = "fall"; break;
        case "down": case "fade": anim = "lie"; break;
        case "getup": anim = e.kind === "zombie" ? "getup" : "hurt"; break;
        case "fuse": anim = "fuse"; f = Math.floor(e.t * 12) % 2; break;
        case "vanish": case "appear": anim = "move"; f = Math.floor(e.anim * 6) % 2; break;
        default: anim = "move";
      }
      const fl = e.flash > 0 && e.flash % 2 === 1 ? "f" : (e.st === "wind" || e.st === "fuse") && Math.floor(S.frame / 3) % 2 === 0 ? "t" : 0;
      return [sprite(e.def, anim, f, 0), fl ? sprite(e.def, anim, f, fl) : null];
    }
    function bossSprite(b) {
      let anim = "idle", f = Math.floor(b.anim * 2) % 2;
      const M = b.move && MOVES[b.move];
      if (b.st === "idle" || b.st === "enter") { if (b.moving) { anim = "move"; f = Math.floor(b.anim * 6) % 4; } }
      else if (b.st === "wind") { anim = M.anim[0]; f = Math.floor(b.t * 10) % 2; }
      else if (b.st === "atk") { anim = M.anim[1]; f = Math.floor(b.t * 16) % 2; if (b.move === "warp" && b.t < 0.4) anim = "windSwipe"; }
      else if (b.st === "rec") { anim = b.t < 0.2 && M ? M.anim[1] : "idle"; f = 0; }
      else if (b.st === "flinch") anim = "hurt";
      else if (b.st === "transform") anim = "raise";
      else if (b.st === "die") anim = b.t < 0.6 ? "hurt" : "die";
      if (b.kind === "demon" && anim === "move") f %= 2;
      const ex = b.p2 ? "p2" : "";
      const fl = (b.flash > 0 && b.flash % 2 === 1) || (b.st === "transform" && Math.floor(b.t * 12) % 2 === 0) ? "f" : (b.st === "wind" || (b.move === "warp" && b.st === "atk" && b.t < 0.4)) && Math.floor(S.frame / 3) % 2 === 0 ? "t" : 0;
      return [sprite(b.def, anim, f, 0, ex), fl ? sprite(b.def, anim, f, fl, ex) : null, anim, f, ex];
    }
    function heroAnim(p) {
      let anim = "idle", f = 0;
      switch (p.st) {
        case "idle": case "land": anim = "idle"; f = Math.floor(p.t * 2.5) % 2; break;
        case "walk": case "auto": anim = "walk"; f = Math.floor(p.t * 9) % 4; break;
        case "run": anim = "run"; f = Math.floor(p.t * 12) % 4; break;
        case "atk": anim = p.atk.anim; f = p.f < p.atk.s ? 0 : 1; break;
        case "jump": anim = p.jk ? "jkick" : "jump"; break;
        case "dash": anim = "jkick"; break;
        case "grab": anim = "grab"; break;
        case "knee": anim = p.f < 12 ? "knee" : "grab"; break;
        case "throw": anim = "throw"; break;
        case "special": anim = "spin"; f = Math.floor(p.f / 3) % 2; break;
        case "hurt": anim = "hurt"; break;
        case "air": anim = "fall"; break;
        case "down": case "ko": anim = "lie"; break;
        case "getup": anim = "getup"; break;
        case "drop": anim = "jump"; break;
        case "win": anim = "win"; break;
      }
      return [anim, f];
    }
    function drawActor(def, anim, f, ex, sx, sy, dir, alpha, fl, rim) {
      if (rim) blit(G, sprite(def, anim, f, rim[0], ex), sx + rim[1], sy, dir, (alpha == null ? 1 : alpha) * 0.9);
      blit(G, sprite(def, anim, f, fl || 0, ex), sx, sy, dir, alpha);
    }
    function drawShot(s, sx, sy) {
      const g = G, x = Math.round(sx), y = Math.round(sy);
      if (s.k === "paper") {
        const a = Math.floor(s.t * 14) % 2;
        glow(g, x, y, 12, "#ff4f6a", 0.5);
        R(g, "#7a1033", x - 7, y - 5 - a, 14, 10 + a * 2); R(g, "#ffd6e0", x - 6, y - 4 - a, 12, 8 + a * 2); R(g, "#fff6e0", x - 5, y - 3 - a, 10, 4);
        R(g, "#ff4f6a", x - 4, y, 8, 1); R(g, "#ff4f6a", x - 4, y + 2, 5, 1);
      } else if (s.k === "puff") {
        const r = 5 + (Math.floor(s.t * 6) % 2);
        glow(g, x, y, 14, "#ff4f9a", 0.45);
        g.fillStyle = "#8a1f5a"; ell(g, x, y, r + 1, r);
        g.fillStyle = "#ff6fae"; ell(g, x, y, r, r - 1);
        g.fillStyle = "#ffd1e6"; ell(g, x - 1, y - 1, r - 3, r - 3);
        g.fillStyle = "#fff6e0"; g.fillRect(x - 2, y - 2, 2, 2);
      } else if (s.k === "orb") {
        const r = 5 + (Math.floor(s.t * 10) % 2);
        glow(g, x, y, 18, "#ff3b8a", 0.6);
        g.fillStyle = "#5a0a3a"; ell(g, x, y, r + 1, r + 1);
        g.fillStyle = "#ff3b8a"; ell(g, x, y, r, r);
        g.fillStyle = "#ffb3d1"; ell(g, x, y, r - 2, r - 2);
        g.fillStyle = "#fff6e0"; ell(g, x - 1, y - 1, 1, 1);
      }
    }
    function drawMarks(cam) {
      const g = G, on = Math.floor(S.frame / 4) % 2 === 0;
      for (const m of S.marks) {
        if (m.kind === "lane") {
          const x0 = m.dir > 0 ? m.x - cam : 0, x1 = m.dir > 0 ? VW : m.x - cam;
          g.fillStyle = on ? "rgba(255,79,106,.34)" : "rgba(255,79,154,.16)";
          g.fillRect(Math.round(x0), Math.round(m.y - 7), Math.round(x1 - x0), 14);
          g.fillStyle = "rgba(255,214,224,.5)";
          for (let x = Math.round(x0) + ((S.frame * 3) % 16) * (m.dir > 0 ? 1 : -1); x < x1; x += 16) if (x > x0) { g.fillRect(x, Math.round(m.y) - 1, 6, 2); }
          continue;
        }
        const x = Math.round(m.x - cam), y = Math.round(m.y);
        g.fillStyle = on ? "rgba(255,79,106,.5)" : "rgba(255,79,154,.3)";
        ell(g, x, y, m.rx, Math.max(2, m.ry));
        g.fillStyle = "rgba(255,230,236,.38)";
        const k = Math.min(1, m.t / m.dur);
        ell(g, x, y, Math.round(m.rx * k), Math.max(1, Math.round(m.ry * k)));
        glow(g, x, y, m.rx, "#ff4f6a", on ? 0.25 : 0.12);
        if (m.kind === "clock") {
          const z = (1 - k) * 140, cy = Math.round(y - z - 7);
          g.fillStyle = "#5a0a2a"; ell(g, x, cy, 7, 7);
          g.fillStyle = "#ff5a6a"; ell(g, x, cy, 6, 6);
          g.fillStyle = "#fff6e0"; ell(g, x, cy, 4, 4);
          g.fillStyle = "#3a1030"; g.fillRect(x, cy - 3, 1, 4); g.fillRect(x, cy, 3, 1); g.fillRect(x - 5, cy - 8, 3, 2); g.fillRect(x + 3, cy - 8, 3, 2);
          glow(g, x, cy, 12, "#ff4f6a", 0.4);
        }
      }
    }
    function drawFx(cam) {
      const g = G;
      for (const f of S.fx) {
        const x = Math.round(f.x - cam), y = Math.round(f.y - f.z), k = f.t / f.life;
        if (f.k === "bit") { g.fillStyle = f.c; g.fillRect(x, y, 2, 2); }
        else if (f.k === "star") {
          const r = f.s ? 9 : 6, rr = Math.round(r * (1 - k * 0.5));
          glow(g, x, y, f.s ? 22 : 14, "#ffd166", 0.7 * (1 - k));
          g.fillStyle = "#fff6e0"; g.fillRect(x - rr, y, rr * 2 + 1, 1); g.fillRect(x, y - rr, 1, rr * 2 + 1);
          g.fillStyle = "#ffd166"; g.fillRect(x - 1, y - 1, 3, 3);
          if (f.s) { g.fillStyle = "#ff9f5a"; for (let d = 2; d < rr; d += 2) { g.fillRect(x - d, y - d, 1, 1); g.fillRect(x + d, y - d, 1, 1); g.fillRect(x - d, y + d, 1, 1); g.fillRect(x + d, y + d, 1, 1); } }
        } else if (f.k === "puff") {
          g.globalAlpha = Math.max(0, 1 - k) * 0.85; g.fillStyle = f.c; ell(g, x, y, Math.round(f.r + k * 2), Math.round(f.r * 0.8 + k * 2)); g.globalAlpha = 1;
        } else if (f.k === "heart") {
          g.globalAlpha = Math.max(0, 1 - k * k);
          g.fillStyle = f.c; g.fillRect(x - 2, y - 1, 2, 2); g.fillRect(x + 1, y - 1, 2, 2); g.fillRect(x - 2, y, 5, 2); g.fillRect(x - 1, y + 2, 3, 1); g.fillRect(x, y + 3, 1, 1);
          g.globalAlpha = 1;
          glow(g, x, y, 8, "#ff6fae", 0.3 * (1 - k));
        } else if (f.k === "ring") {
          const rr = Math.round(4 + (f.r - 4) * k);
          g.globalAlpha = Math.max(0, 1 - k);
          g.fillStyle = f.c || "#ffd166";
          for (let a = 0; a < 32; a++) { const t = (a / 32) * Math.PI * 2; g.fillRect(Math.round(x + Math.cos(t) * rr), Math.round(f.y - f.z + Math.sin(t) * rr * 0.38), 2, 1); }
          g.globalAlpha = 1;
          glow(g, x, Math.round(f.y - f.z), Math.max(8, rr), f.c || "#ffd166", 0.35 * (1 - k));
        }
      }
    }
    function drawPops(cam) {
      for (const q of S.pops) {
        const x = Math.round(q.x - cam), y = Math.round(q.y - q.z - Math.min(q.t, 0.4) * 40 - q.t * 6);
        if (q.ko) drawPT(G, ptext(q.ko, 10, q.col, "#140c2a"), x, y, 1, "c");
        else pix(G, q.txt, x - Math.round(pixW(q.txt, 1, true) / 2), y, 1, q.col, "#140c2a", true);
      }
    }
    // 화면 마무리 — 색 보정 · 가장자리 비네트 · 아주 옅은 줄무늬
    let VIG = null;
    function finishScreen(P) {
      const g = G;
      if (P) {
        const [r, gg, b, a] = P.grade;
        g.globalCompositeOperation = "multiply";
        g.fillStyle = `rgba(${r},${gg},${b},${a * 2.2})`; g.fillRect(0, 0, VW, VH);
        g.globalCompositeOperation = "source-over";
      }
      if (!VIG) {
        VIG = mk(VW, VH);
        const v = VIG.getContext("2d"), gr = v.createRadialGradient(VW / 2, VH / 2, VH * 0.42, VW / 2, VH / 2, VW * 0.62);
        gr.addColorStop(0, "rgba(14,8,34,0)"); gr.addColorStop(1, "rgba(14,8,34,.5)");
        v.fillStyle = gr; v.fillRect(0, 0, VW, VH);
        v.fillStyle = "rgba(10,6,24,.05)"; for (let y = 0; y < VH; y += 2) v.fillRect(0, y, VW, 1);
      }
      g.drawImage(VIG, 0, 0);
    }
    function glassPanel(x, y, w, h) {
      const g = G;
      g.fillStyle = "rgba(20,12,42,.8)"; g.fillRect(x, y, w, h);
      g.fillStyle = "rgba(255,246,224,.5)"; g.fillRect(x, y, w, 1); g.fillRect(x, y, 1, h);
      g.fillStyle = "rgba(255,246,224,.18)"; g.fillRect(x, y + h - 1, w, 1); g.fillRect(x + w - 1, y, 1, h);
    }
    function stripes(y, h, off, c1, c2) {
      const g = G;
      g.fillStyle = c1; g.fillRect(0, y, VW, h);
      g.fillStyle = c2;
      for (let x = -h * 2 + (Math.round(off) % (h * 2)); x < VW + h; x += h * 2) { for (let k = 0; k < h; k++) g.fillRect(x + k, y + k, h, 1); }
    }
    function drawBanners() {
      const g = G;
      if (S.phase === "intro") {
        const t = S.phaseT;
        if (t < 2.3) {
          const slide = t < 0.3 ? Math.pow(1 - t / 0.3, 2) * -VW : t > 2.0 ? Math.pow((t - 2.0) / 0.3, 2) * VW : 0;
          g.save(); g.translate(Math.round(slide), 0);
          glassPanel(-2, 82, VW + 4, 58);
          stripes(82, 4, t * 60, "#ff4f9a", "#ffd166"); stripes(136, 4, -t * 60, "#ff4f9a", "#ffd166");
          const s = `STAGE ${S.stage + 1}`;
          pix(g, s, Math.round(VW / 2 - pixW(s, 2) / 2), 92, 2, "#ffd166", "#5a1a3a");
          drawPT(g, ptext(S.def.name, 15, ["#fff6e0", "#ffe0a3"], "#140c2a"), VW / 2, 122, 1, "c");
          glow(g, VW / 2, 99, 60, "#ffd166", 0.25);
          g.restore();
        }
      }
      if (S.goT > 0 && Math.floor(S.goT * 3) % 2 === 0 && S.phase === "play") {
        glow(g, VW - 38, 74, 30, "#ffd166", 0.45);
        pix(g, "GO", VW - 70, 64, 3, "#ffd166", "#5a1a3a");
        pix(g, ">", VW - 30, 64, 3, "#ffd166", "#5a1a3a");
      }
      if (S.phase === "warning") {
        const t = S.phaseT, on = Math.floor(t * 4) % 2 === 0;
        g.fillStyle = `rgba(255,40,70,${0.07 + 0.1 * Math.abs(Math.sin(t * 6))})`; g.fillRect(0, 0, VW, VH);
        stripes(0, 10, t * 90, "#2a0614", "#ff3b5c"); stripes(VH - 10, 10, -t * 90, "#2a0614", "#ff3b5c");
        glassPanel(-2, 78, VW + 4, 64);
        g.fillStyle = "rgba(255,59,92,.18)"; g.fillRect(0, 79, VW, 62);
        if (on) { pix(g, "WARNING", Math.round(VW / 2 - pixW("WARNING", 3) / 2), 86, 3, "#ff5a76", "#2a0614"); glow(g, VW / 2, 96, 80, "#ff3b5c", 0.4); }
        drawPT(g, ptext(S.boss ? S.boss.name : "", 15, ["#fff6e0", "#ffc9d4"], "#2a0614"), VW / 2, 126, 1, "c");
        if (Math.floor(t * 4) !== Math.floor((t - STEP) * 4) && on) sfx("tick", 0.1);
      }
      if (S.banner2) {
        const t = S.banner2.t;
        if (t < 1.8 && Math.floor(t * 8) % 4 !== 3) drawPT(g, ptext(S.banner2.text, 15, ["#fff6e0", "#ffc0a0"], "#140c2a", "#140c2a"), VW / 2, 70, 1, "c");
      }
      if (S.phase === "clear" && S.phaseT > 0.5) {
        const t = S.phaseT;
        glow(g, VW / 2, 78, 90, "#ffd166", 0.3);
        pix(g, "STAGE CLEAR", Math.round(VW / 2 - pixW("STAGE CLEAR", 2) / 2), 70, 2, "#ffe08a", "#5a1a3a");
        for (let k = 0; k < 8; k++) { const a = t * 2 + k * 0.8, x = Math.round(VW / 2 + Math.cos(a) * 90), y = Math.round(77 + Math.sin(a * 1.3) * 14); if ((Math.floor(t * 10) + k) % 3) { R(g, "#fff6e0", x, y - 1, 1, 3); R(g, "#fff6e0", x - 1, y, 3, 1); } }
      }
      if (S.phase === "tally" && S.tally) {
        const x0 = VW / 2 - 120, w = 240;
        glassPanel(x0, 54, w, 120);
        drawPT(g, ptext(`${S.def.name} 클리어!`, 15, ["#ffe08a", "#ffb26b"], "#140c2a"), VW / 2, 70, 1, "c");
        S.tally.lines.forEach((L, i) => {
          const y = 96 + i * 22;
          drawPT(g, ptext(L.label, 12, "#fff6e0", "#140c2a"), x0 + 14, y, 1);
          const a = `${String(L.n - L.shown).padStart(2, " ")}*${L.mul}`;
          pix(g, a, VW / 2 - 16, y - 4, 1, "#9fd8ff", "#140c2a");
          const v = String(L.shown * L.mul);
          pix(g, v, x0 + w - 14 - pixW(v, 1), y - 4, 1, "#ffd166", "#140c2a");
        });
        R(g, "rgba(255,246,224,.25)", x0 + 12, 140, w - 24, 1);
        const sc = String(S.score).padStart(8, "0");
        drawPT(g, ptext("점수", 12, "#fff6e0", "#140c2a"), x0 + 14, 156, 1);
        pix(g, sc, x0 + w - 14 - pixW(sc, 2), 149, 2, "#ffd166", "#5a1a3a");
      }
      if (S.phase === "ending") {
        const t = S.phaseT;
        if (t > 0.8) { glow(g, VW / 2, 60, 110, "#ffb26b", 0.35); const c = bigText("퇴근 성공!", FILL_GOLD); g.drawImage(c, Math.round(VW / 2 - c.width / 2), 38); }
        if (t > 1.6) drawPT(g, ptext("오늘도 수고 많았어요", 12, "#fff6e0", "#1a1033"), VW / 2, 96, 1, "c");
        if (t > 2.4) {
          const E = S.endBonus;
          glassPanel(VW / 2 - 92, 110, 184, 24);
          drawPT(g, ptext(`남은 목숨 ${E.n}개`, 12, "#ffe3ec", "#1a1033"), VW / 2 - 6, 122, 1, "r");
          const v = `+${E.shown * 10000}`;
          pix(g, v, VW / 2 + 6, 118, 1, "#ffd166", "#1a1033");
        }
        for (let k = 0; k < 14; k++) { const x = (k * 53 + Math.floor(t * 40) * (k % 3 + 1)) % VW, y = (k * 37 + Math.floor(t * 30)) % 120; if ((k + Math.floor(t * 8)) % 4) R(g, k % 2 ? "#ffe0a3" : "#ffb3d1", x, y, 2, 2); }
      }
      if (S.phase === "gameover") {
        g.fillStyle = `rgba(20,10,40,${Math.min(0.62, S.phaseT * 0.5)})`; g.fillRect(0, 0, VW, VH);
        if (S.phaseT > 0.3) { const c = bigText("게임 오버", FILL_PINK); g.drawImage(c, Math.round(VW / 2 - c.width / 2), 80); }
      }
    }
    function updateAmbient() {
      if (!S.amb) S.amb = [];
      const want = 22;
      while (S.amb.length < want) S.amb.push({ x: rnd(0, VW), y: rnd(0, VH), vx: rnd(-8, 8), vy: rnd(4, 12), ph: rnd(0, 6), k: Math.random() });
      for (const a of S.amb) {
        a.ph += STEP;
        a.x += (a.vx + Math.sin(a.ph * 1.5) * 6) * STEP - (S.camX - (S.lastCam || S.camX)) * 1.1; a.y += a.vy * STEP * (S.stage === 3 ? 1.5 : 0.6);
        if (a.y > VH) { a.y = -4; a.x = rnd(0, VW); } if (a.x < -4) a.x += VW + 8; if (a.x > VW + 4) a.x -= VW + 8;
      }
      S.lastCam = S.camX;
      if (S.stage === 3) {
        if (!S.birds) S.birds = [];
        if (S.birds.length < 4 && Math.random() < 0.004) for (let k = 0; k < 3; k++) S.birds.push({ x: -10 - k * 9, y: 40 + rnd(-6, 6) + k * 4, v: rnd(16, 22) });
        for (const b of S.birds) b.x += b.v * STEP;
        S.birds = S.birds.filter((b) => b.x < VW + 20);
      }
    }
    function drawAmbient() {
      const P = S.bg.P, g = G;
      if (!S.amb) return;
      for (const a of S.amb) {
        const x = Math.round(a.x), y = Math.round(a.y);
        if (S.stage === 3) { R(g, a.k < 0.5 ? "#ffb3c7" : "#ffe0a3", x, y, 2, 1); if (Math.sin(a.ph * 4) > 0) R(g, "#ff8fb0", x, y + 1, 1, 1); }
        else if (S.stage === 0 && a.k < 0.18) { R(g, P.paper[2], x, y, 3, 2); R(g, P.paper[0], x, y + 2, 3, 1); }
        else { g.globalAlpha = 0.35 + 0.3 * Math.sin(a.ph * 2); R(g, a.k < 0.5 ? P.dust[0] : P.dust[1], x, y, 1, 1); g.globalAlpha = 1; }
      }
    }
    function render() {
      const g = G;
      g.imageSmoothingEnabled = false;
      if (state === "title" || !S) { drawTitle(); return; }
      const sh = S.shake > 0.5 ? S.shake : 0;
      const ox = sh ? Math.round(rnd(-sh, sh) * 0.6) : 0, oy = sh ? Math.round(rnd(-sh, sh) * 0.4) : 0;
      const cam = Math.round(S.camX) - ox, t = S.t;
      const B = S.bg, P = B.P;
      g.save(); g.translate(0, oy);
      g.drawImage(B.sky, 0, 0);
      for (const q of B.skyGlows) glow(g, q[0], q[1], q[2], q[3], q[4]);
      B.layers.forEach((L, i) => {
        tile(L.c, cam * L.par, L.y);
        layerGlows(L.glows, L.c.width, cam * L.par, t);
        if (i === 0 && S.birds) for (const b of S.birds) { const x = Math.round(b.x), y = Math.round(b.y), w = Math.floor(t * 6 + b.x) % 2; R(g, "#3a1c5c", x - 2, y - w, 2, 1); R(g, "#3a1c5c", x + 1, y - w, 2, 1); R(g, "#3a1c5c", x, y, 1, 1); }
      });
      if (B.train && S.train) drawTrain(S.train.x, P);
      tile(B.wall.c, cam, 0);
      layerGlows(B.wall.glows, B.wall.c.width, cam, t);
      tile(B.floor, cam, 152);
      floorPools(B.wall, cam);
      const p = S.p;
      const rim = [P.rim[0], P.rim[1]];
      const actors = [p, ...S.en];
      if (B.reflect) {
        g.save(); g.beginPath(); g.rect(0, 152, VW, VH - 152); g.clip();
        for (const o of actors) {
          if (o.st === "fade" || o.alpha === 0) continue;
          let spr;
          if (o === p) { const [an, f] = heroAnim(p); spr = sprite(HERO_DEF[S.hero], an, f, 0, p.weapon || ""); }
          else if (o.boss) spr = bossSprite(o)[0]; else spr = foeSprite(o)[0];
          g.save(); g.translate(0, o.y * 2); g.scale(1, -1);
          blit(g, spr, o.x - cam, o.y - (o.z || 0) - 1, o.dir, 0.16);
          g.restore();
        }
        g.restore();
      }
      drawMarks(cam);
      for (const o of S.props) shadow(o.x - cam, o.y, 10);
      for (const it of S.items) shadow(it.x - cam, it.y, 6);
      for (const e of S.en) if (e.st !== "fade" || e.t < 0.4) shadow(e.x - cam, e.y, e.w * (e.z > 20 ? 0.6 : 1));
      for (const sh2 of S.shots) shadow(sh2.x - cam, sh2.y, 4);
      shadow(p.x - cam, p.y, p.z > 30 ? 7 : 11);
      // 잔상 (대시 · 필살기 · 점프 킥)
      if (S.frame % 2 === 0) {
        const fast = p.st === "dash" || p.st === "special" || (p.st === "jump" && p.jk) || (p.st === "atk" && p.atk.fin && p.f >= p.atk.s && p.f < p.atk.s + p.atk.a + 3);
        if (fast) { const [an, f] = heroAnim(p); p.trail.push({ x: p.x, y: p.y, z: p.z, an, f, dir: p.dir, t: 0 }); }
        if (p.trail.length > (fast ? 4 : 0)) p.trail.shift();
        if (!fast && p.trail.length) p.trail.shift();
      }
      const list = [p, ...S.en, ...S.props, ...S.items, ...S.shots];
      list.sort((a, b) => a.y - b.y);
      for (const o of list) {
        const sx = o.x - cam, sy = o.y - (o.z || 0);
        if (o === p) {
          if (p.st === "drop" && p.z > 150) continue;
          p.trail.forEach((q, i) => blit(g, sprite(HERO_DEF[S.hero], q.an, q.f, S.hero === "mint" ? "#2ee6c0" : "#ff7a2a", p.weapon || ""), q.x - cam, q.y - q.z, q.dir, 0.12 + i * 0.07));
          const blink = p.invul > 0 && p.st !== "special" && Math.floor(S.frame / 3) % 2 === 0;
          const [an, f] = heroAnim(p);
          drawActor(HERO_DEF[S.hero], an, f, p.weapon || "", sx, sy, p.dir, blink ? 0.35 : 1, p.flash > 0 && p.flash % 2 === 1 ? "f" : 0, rim);
          if (p.st === "special") {
            glow(g, sx, sy - 26, 34, S.hero === "mint" ? "#2ee6c0" : "#ff9a4a", 0.5);
            g.fillStyle = "#e6fff8";
            for (let a = 0; a < 12; a++) { const tt = p.f * 0.5 + (a / 12) * Math.PI * 2; g.fillRect(Math.round(sx + Math.cos(tt) * 24), Math.round(sy - 26 + Math.sin(tt) * 9), 2, 2); }
          }
        } else if (o.kind === "prop") {
          blit(g, sprite(PROP, o.pk, 0, o.flash > 0 && o.flash % 2 === 1 ? "f" : 0), sx + (o.wob ? (o.wob % 2 ? 1 : -1) : 0), sy, 1);
        } else if (o.kind === "item") {
          const fy = Math.round(Math.sin(o.t * 3.5) * 2) + (o.z <= 0 ? 3 : 0);
          const I = ITEMS[o.ik];
          glow(g, sx, sy - 8 - fy, 14, I.heal ? "#7be05a" : I.pts ? "#ffd166" : "#c9a0ff", 0.45 + 0.15 * Math.sin(o.t * 5));
          blit(g, sprite(ITEM, o.ik, 0, 0), sx, sy - fy, 1);
          if (Math.floor(o.t * 4) % 6 === 0) { R(g, "#fff6e0", Math.round(sx + 6), Math.round(sy - 16 - fy), 1, 3); R(g, "#fff6e0", Math.round(sx + 5), Math.round(sy - 15 - fy), 3, 1); }
        } else if (o.k) {
          drawShot(o, sx, sy);
        } else if (o.boss) {
          if (o.p2 && o.st !== "die") { glow(g, sx, sy - 52, 70, Math.floor(S.frame / 4) % 2 ? "#ff3b8a" : "#9b4dff", 0.4); if (S.frame % 3 === 0) fx("bit", o.x + rnd(-24, 24), o.y, rnd(10, 90), { vz: rnd(30, 60), life: 0.6, c: pick(["#ff3b8a", "#c9a0ff", "#ffd166"]) }); }
          const [b0, bf, an, f, ex] = bossSprite(o);
          void b0;
          drawActor(o.def, an, f, ex, sx, sy, o.dir, o.alpha, bf ? (o.flash > 0 && o.flash % 2 === 1 ? "f" : (o.st === "transform" ? "f" : "t")) : 0, o.alpha >= 1 ? rim : null);
        } else {
          let a = o.alpha;
          if (o.st === "fade") a = Math.max(0, 1 - o.t / 0.85);
          const [s0, s1] = foeSprite(o);
          const yy = sy - (o.st === "fade" ? o.t * 10 : 0);
          if (a >= 1 && rim) blit(g, rimOf(s0, o, rim[0]), sx + rim[1], yy, o.dir, 0.9);
          blit(g, s1 || s0, sx, yy, o.dir, a);
          if (o.kind === "bomb" && (o.st === "fuse" || o.lit)) glow(g, sx + o.dir * 9, yy - 32, 10, "#ffd166", 0.6 + 0.4 * Math.sin(S.t * 30));
        }
      }
      drawFx(cam);
      drawAmbient();
      g.globalAlpha = 0.88; tile(B.fg.c, cam * B.fg.par, B.fg.y); g.globalAlpha = 1;
      drawPops(cam);
      g.restore();
      if (S.flick > 0) { g.fillStyle = "rgba(14,8,26,.5)"; g.fillRect(0, 0, VW, VH); }
      finishScreen(P);
      drawBanners();
      if (S.fade > 0) { g.fillStyle = `rgba(14,8,34,${S.fade})`; g.fillRect(0, 0, VW, VH); }
      hud();
    }
    // 잡몹 림 라이트 — 구운 그림의 실루엣을 스테이지 빛 색으로
    const RIMC = new Map();
    function rimOf(s0, o, col) {
      let v = RIMC.get(s0);
      if (!v || v.col !== col) { v = variant(s0, "r", col); v.col = col; RIMC.set(s0, v); }
      return v;
    }

    // 시작 화면 — 노을 진 퇴근길이 천천히 흐르고, 큰 도트 로고에 빛줄기가 지나간다
    let TITLE = null, LOGO = null;
    const BIG = new Map();
    function bigText(str, fills) {
      const key = str + fills.join();
      let c = BIG.get(key);
      if (c) return c;
      const t = mk(8, 8).getContext("2d", { willReadFrequently: true });
      const font = '30px Galmuri14, "Apple SD Gothic Neo", sans-serif';
      t.font = font;
      const w = Math.ceil(t.measureText(str).width) + 4, h = 40;
      t.canvas.width = w; t.canvas.height = h; t.font = font; t.textBaseline = "middle"; t.fillStyle = "#000"; t.fillText(str, 2, h / 2);
      const d = t.getImageData(0, 0, w, h).data, W = w + 10, H = h + 10;
      const on = new Uint8Array(W * H);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 120) on[(y + 5) * W + x + 5] = 1;
      // 글자 획을 1픽셀 굵게
      const fat = new Uint8Array(W * H);
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (on[y * W + x] || on[y * W + x - 1] || on[(y - 1) * W + x]) fat[y * W + x] = 1;
      let y0 = H, y1 = 0;
      for (let i = 0; i < fat.length; i++) if (fat[i]) { const y = (i / W) | 0; y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      c = mk(W, H);
      const g = c.getContext("2d");
      const near = (x, y, rr) => { for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) { if (Math.abs(dx) + Math.abs(dy) > rr + 1) continue; const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H && fat[yy * W + xx]) return true; } return false; };
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (fat[y * W + x]) continue;
        if (near(x, y - 3, 2) && !near(x, y, 2)) { g.fillStyle = "#1a1033"; g.fillRect(x, y, 1, 1); }
        else if (near(x, y, 2)) { g.fillStyle = near(x, y, 1) ? "#2b0f3d" : "#4a1a52"; g.fillRect(x, y, 1, 1); }
      }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (!fat[y * W + x]) continue;
        const k = (y - y0) / Math.max(1, y1 - y0);
        g.fillStyle = !fat[(y - 1) * W + x] ? "#fff6e0" : fills[Math.min(fills.length - 1, Math.floor(k * fills.length))];
        g.fillRect(x, y, 1, 1);
      }
      BIG.set(key, c);
      return c;
    }
    const FILL_GOLD = ["#fff6e0", "#ffe7a3", "#ffd166", "#ffb347", "#ff8f3d", "#ff7038"], FILL_PINK = ["#ffe0ee", "#ffb3d1", "#ff7fb2", "#ff4f9a", "#e8357f", "#c42a72"];
    function buildLogo() { return [bigText("스트레스", FILL_GOLD), bigText("파이터", FILL_PINK)]; }
    function drawTitle() {
      const g = G, t = titleT;
      if (!TITLE) TITLE = buildArt(3);
      if (!LOGO) LOGO = buildLogo();
      const B = TITLE, cam = t * 24;
      g.drawImage(B.sky, 0, 0);
      for (const q of B.skyGlows) glow(g, q[0], q[1], q[2], q[3], q[4]);
      B.layers.forEach((L) => { tile(L.c, cam * L.par, L.y); layerGlows(L.glows, L.c.width, cam * L.par, t); });
      tile(B.wall.c, cam, 0); layerGlows(B.wall.glows, B.wall.c.width, cam, t);
      tile(B.floor, cam, 152);
      floorPools(B.wall, cam);
      g.fillStyle = "rgba(26,16,51,.35)"; g.fillRect(0, 0, VW, VH);
      const bob = Math.round(Math.sin(t * 2) * 1.5);
      LOGO.forEach((c, i) => {
        const x = Math.round(VW / 2 - c.width / 2), y = (i ? 70 : 24) + bob;
        g.drawImage(c, x, y);
        // 빛줄기
        const sweep = ((t * 0.55 + i * 0.12) % 1.6) * (c.width + 80) - 40;
        const tmp = TITLE.tmp || (TITLE.tmp = mk(220, 60));
        const tg = tmp.getContext("2d");
        tg.clearRect(0, 0, tmp.width, tmp.height); tg.drawImage(c, 0, 0);
        tg.globalCompositeOperation = "source-atop"; tg.fillStyle = "rgba(255,246,224,.75)";
        for (let k = 0; k < 8; k++) tg.fillRect(Math.round(sweep - k), k * 7, 6, 7);
        tg.globalCompositeOperation = "source-over";
        g.drawImage(tmp, x, y);
      });
      glow(g, VW / 2, 60, 120, "#ff7f50", 0.18);
      drawPT(g, ptext("헬스키퍼의 퇴근길 대작전", 12, "#fff6e0", "#1a1033"), VW / 2, 120, 1, "c");
      const ids = ["mint", "gom"];
      ids.forEach((id, i) => {
        const x = 156 + i * 74, sel = id === hero;
        const f = sel ? Math.floor(t * 2.5) % 2 : 0;
        const by = 208 - (sel ? Math.round(Math.abs(Math.sin(t * 5)) * 2) : 0);
        if (sel) glow(g, x, 196, 30, id === "mint" ? "#2ee6c0" : "#ff7a2a", 0.45);
        shadow(x, 208, 12);
        if (sel) blit(g, sprite(HERO_DEF[id], "idle", f, "#ffb26b"), x + (i ? -1 : 1), by, i ? -1 : 1, 0.9);
        blit(g, sprite(HERO_DEF[id], "idle", f, 0), x, by, i ? -1 : 1, 1);
        if (!sel) blit(g, sprite(HERO_DEF[id], "idle", f, "#2b2350"), x, by, i ? -1 : 1, 0.55);
        if (sel) { const ay = 136 + Math.round(Math.sin(t * 6) * 2); for (let k = 0; k < 5; k++) R(g, k ? "#ffd166" : "#fff6e0", x - 4 + k, ay + k, 9 - k * 2, 1); }
      });
      blit(g, sprite(LUMP, "idle", Math.floor(t * 2) % 2, 0), 52, 222, 1);
      blit(g, sprite(BOMB, "move", Math.floor(t * 6) % 2, 0), 336, 220, -1);
      glow(g, 336 - 9, 186, 9, "#ffd166", 0.6);
      blit(g, sprite(BAT, "move", Math.floor(t * 8) % 2, 0), 62 + Math.round(Math.sin(t * 1.3) * 10), 150 + Math.round(Math.sin(t * 3) * 4), 1);
      blit(g, sprite(ZOMBIE, "move", Math.floor(t * 4) % 4, 0), 300, 222, -1);
      finishScreen(PAL[3]);
      if (Math.floor(t * 2) % 2 === 0) drawPT(g, ptext("시작하려면 누르세요", 12, "#fff6e0", "#1a1033"), VW / 2, 231, 1, "c");
      // 고른 주인공 카드도 살아 움직인다
      if (Math.floor(t * 2.5) !== Math.floor((t - 1 / 60) * 2.5)) paintHeroFaces(Math.floor(t * 2.5) % 2);
    }

    // ───────── 머리 표시 (점수 · 체력 · 시간 · 상대)
    const hudCache = {};
    function pixCanvas(cv, str, col, sc) {
      const w = pixW(str, 1) + 2, h = 9;
      if (cv.width !== w) { cv.width = w; cv.height = h; }
      const g = cv.getContext("2d");
      g.clearRect(0, 0, w, h);
      pix(g, str, 0, 0, 1, col, "#3a1030");
      cv.style.setProperty("--w", `${w * sc}px`); cv.style.setProperty("--h", `${h * sc}px`);
    }
    function hud() {
      const sc = mode === "land" ? 2 : 2;
      const p = S ? S.p : null;
      const score = String(S ? S.score : 0).padStart(8, "0");
      if (hudCache.score !== score || hudCache.sc !== sc) { if (hudCache.score && S) { cvScore.classList.remove("bump"); void cvScore.offsetWidth; cvScore.classList.add("bump"); } hudCache.score = score; pixCanvas(cvScore, score, "#ffd166", sc); }
      const time = String(S ? Math.max(0, S.time) : 99).padStart(2, "0");
      const tcol = S && S.time <= 10 ? "#ff8787" : "#ffffff";
      if (hudCache.time !== time + tcol || hudCache.sc !== sc) { hudCache.time = time + tcol; pixCanvas(cvTime, time, tcol, sc + 1); }
      hudCache.sc = sc;
      const hpPct = p ? Math.max(0, Math.round((p.hp / p.maxHp) * 100)) : 100;
      if (hudCache.hp !== hpPct) { hudCache.hp = hpPct; elHp.style.width = `${hpPct}%`; elHpLag.style.width = `${hpPct}%`; elHp.parentElement.classList.toggle("is-low", hpPct <= 30); }
      const lives = S ? S.lives : 3;
      if (hudCache.lives !== lives) { hudCache.lives = lives; elLives.innerHTML = Array.from({ length: Math.max(0, lives) }, () => "<i></i>").join(""); elLives.setAttribute("aria-label", `목숨 ${lives}개`); }
      const h = S ? S.hero : hero;
      if (hudCache.hero !== h) {
        hudCache.hero = h; elName.textContent = HERO[h].name;
        const fg = cvFace.getContext("2d"), sp = sprite(HERO_DEF[h], "idle", 0, 0);
        fg.clearRect(0, 0, 24, 24); fg.imageSmoothingEnabled = false;
        fg.drawImage(sp.c, sp.ax - 11, sp.ay - 59, 24, 24, 0, 0, 24, 24);
      }
      const stg = S ? `STAGE ${S.stage + 1} · ${S.def.name}` : "스트레스 파이터";
      if (hudCache.stage !== stg) { hudCache.stage = stg; elStage.textContent = stg; }
      const tg = S && S.target && !S.target.dead && S.target.hp > 0 ? S.target : null;
      const key = tg ? `${tg.boss ? tg.name : FOE[tg.kind].name}|${Math.round((tg.hp / tg.maxHp) * 100)}|${tg.boss ? 1 : 0}` : "";
      if (hudCache.foe !== key) {
        hudCache.foe = key;
        elFoe.hidden = !tg;
        if (tg) {
          elFoeName.textContent = tg.boss ? tg.name : FOE[tg.kind].name;
          elFoeHp.style.width = `${Math.max(0, Math.round((tg.hp / tg.maxHp) * 100))}%`; elFoeLag.style.width = elFoeHp.style.width;
          elFoe.classList.toggle("is-boss", !!tg.boss);
        }
      }
    }

    // ───────── 아래 칸 (시작 · 일시정지 · 결과)
    const HOW = `<ul class="ft-how__list">
        <li><b>이동</b> 방향키 · WASD (위아래로 판 깊이를 오가요) · 같은 방향 두 번이면 달리기</li>
        <li><b>공격</b> <kbd>Z</kbd>·<kbd>J</kbd> 연타 — 주먹 · 주먹 · 발차기 3단 콤보</li>
        <li><b>점프</b> <kbd>X</kbd>·<kbd>K</kbd> — 점프 중 공격은 점프 킥, 달리며 공격은 대시 어택</li>
        <li><b>잡기</b> 괴물에게 붙어 앞으로 밀면 잡아요 → 공격은 무릎 차기, <b>반대 방향 + 공격</b>은 던지기</li>
        <li><b>필살기</b> <kbd>C</kbd>·<kbd>L</kbd> — 둘레를 모두 날려요. 체력이 조금 줄어요</li>
        <li><b>물건</b> 정수기 · 화분 · 쓰레기통을 부수면 도시락 · 쿠폰 · 서류 몽둥이가 나와요</li>
        <li><b>목숨</b> 3개 · 스테이지마다 시간 99 · 이어 하기는 없어요</li>
      </ul>`;
    function heroBtn(id) {
      const H = HERO[id];
      const desc = id === "mint" ? "빠르고 날쌔요" : "느려도 힘이 세요";
      const stat = id === "mint" ? [4, 2, 2] : [2, 4, 4];
      const bar = (n) => `<span class="ft-dots">${[0, 1, 2, 3].map((i) => `<i${i < n ? ' class="on"' : ""}></i>`).join("")}</span>`;
      return `<button type="button" class="ft-hero${hero === id ? " is-on" : ""}" data-hero="${id}" aria-pressed="${hero === id}">
          <canvas width="48" height="60" data-face="${id}"></canvas>
          <span class="ft-hero__txt"><b>${H.name}</b><small>${desc}</small>
            <span class="ft-stat">속도 ${bar(stat[0])}</span><span class="ft-stat">힘 ${bar(stat[1])}</span><span class="ft-stat">던지기 ${bar(stat[2])}</span></span>
        </button>`;
    }
    function paintHeroFaces(fr) {
      panel.querySelectorAll("[data-face]").forEach((c) => {
        const id = c.dataset.face, sel = id === hero;
        const g = c.getContext("2d"), sp = sprite(HERO_DEF[id], "idle", sel ? fr || 0 : 0, 0);
        g.clearRect(0, 0, c.width, c.height); g.imageSmoothingEnabled = false;
        g.drawImage(sp.c, sp.ax - 24, sp.ay - 58, 48, 60, 0, 0, 48, 60);
      });
    }
    function showPanel(html) {
      panel.innerHTML = html; panel.hidden = false;
      panel.classList.toggle("is-title", state === "title");
      root.classList.add("has-panel");
      paintHeroFaces();
      fit();
      const b = panel.querySelector(".ft-go");
      if (b && !IS_TOUCH) b.focus({ preventScroll: true });
    }
    function hidePanel() { panel.hidden = true; panel.innerHTML = ""; root.classList.remove("has-panel"); fit(); }
    function titleHtml() {
      return `<div class="ft-card">
          <p class="ft-lead">퇴근 시간인데 회사에 스트레스 괴물이 쏟아졌어요! 지압 주먹으로 풀어 주며 퇴근길까지 가요.</p>
          <div class="ft-pick" role="group" aria-label="주인공 고르기">${heroBtn("mint")}${heroBtn("gom")}</div>
          <button type="button" class="ft-go" data-act="start">시작</button>
          <details class="ft-how"${firstHow && mode === "port" ? " open" : ""}><summary>이렇게 해요</summary>${HOW}${IS_TOUCH ? '<p class="ft-how__touch">휴대폰은 왼쪽 패드를 끌어 움직이고 오른쪽 단추로 공격 · 점프 · 필살기를 써요. 패드를 같은 쪽으로 두 번 툭 치면 달려요.</p>' : ""}</details>
        </div>`;
    }
    function showTitle() {
      state = "title"; S = null;
      Music.stop();
      clearInput();
      hudCache.foe = "-"; hud();
      showPanel(titleHtml());
      run();
    }
    function chooseHero(id) {
      if (hero === id) return;
      hero = id;
      try { localStorage.setItem(HERO_KEY, id); } catch (_) { /* 그대로 */ }
      panel.querySelectorAll(".ft-hero").forEach((b) => { const on = b.dataset.hero === id; b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", on); });
      hudCache.hero = null; hud();
      sfx("select");
    }
    function start() {
      try { localStorage.setItem(HOW_KEY, "1"); } catch (_) { /* 그대로 */ }
      firstHow = false;
      hidePanel();
      clearInput();
      newRun();
      state = "play";
      run();
    }
    function pause() {
      if (state !== "play") return;
      state = "paused";
      Music.stop();
      clearInput();
      showPanel(`<div class="ft-card is-small"><h2>잠깐 쉬는 중</h2><p>점수 <b>${S.score.toLocaleString("ko-KR")}</b>점 · STAGE ${S.stage + 1} ${S.def.name}</p><button type="button" class="ft-go" data-act="resume">계속하기</button><details class="ft-how"><summary>이렇게 해요</summary>${HOW}</details></div>`);
      render();
    }
    function resume() {
      if (state !== "paused") return;
      hidePanel();
      state = "play";
      if (S.song && S.phase !== "gameover" && S.phase !== "clear" && S.phase !== "tally" && S.phase !== "warning") Music.play(S.song);
      run();
    }
    function finish(cleared) {
      if (state === "over" || !S) return;
      state = "over";
      Music.stop();
      render();
      const score = S.score;
      const where = cleared ? "모든 스테이지를 깨고 퇴근했어요" : `STAGE ${S.stage + 1} · ${S.def.name}까지 왔어요`;
      showPanel(`<div class="ft-card is-small">
          <h2>${cleared ? "퇴근 성공!" : "게임 오버"}</h2>
          <p>${where} · 괴물 ${S.kills}마리를 풀어 줬어요</p>
          <div class="ft-big">${score.toLocaleString("ko-KR")}점</div>
          <div class="ft-actions"><button type="button" class="ft-go" data-act="start">다시 하기</button><button type="button" class="ft-sub-btn" data-act="title">주인공 바꾸기</button></div>
        </div>`);
      if (!S.submitted) { S.submitted = true; ctx.submit(score); }
    }
    panel.addEventListener("click", (e) => {
      const h = e.target.closest("[data-hero]");
      if (h) { chooseHero(h.dataset.hero); return; }
      const b = e.target.closest("[data-act]");
      if (!b) return;
      if (b.dataset.act === "start") start();
      else if (b.dataset.act === "resume") resume();
      else if (b.dataset.act === "title") showTitle();
    });
    panel.addEventListener("toggle", (e) => { if (e.target.matches && e.target.matches(".ft-how")) fit(); }, true);
    function clickGo() { const b = panel.querySelector(".ft-go"); if (b && !panel.hidden) b.click(); }

    // ───────── 키보드
    const KEYMAP = { ArrowLeft: "l", KeyA: "l", ArrowRight: "r", KeyD: "r", ArrowUp: "u", KeyW: "u", ArrowDown: "d", KeyS: "d" };
    const ACTMAP = { KeyZ: "atk", KeyJ: "atk", KeyX: "jmp", KeyK: "jmp", KeyC: "sp", KeyL: "sp" };
    const typing = (e) => { const t = e.target; return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable); };
    const dialogOpen = () => !!document.querySelector(".hk-dialog__overlay");
    window.addEventListener("keydown", (e) => {
      if (typing(e) || dialogOpen()) return;
      const c = e.code, k = KEYMAP[c], a = ACTMAP[c];
      if (state === "play") {
        if (k || a || c === "Space") e.preventDefault();
        if (k) { if (!keys[k]) { keys[k] = 1; if (k === "l") tapDir(-1, 280); if (k === "r") tapDir(1, 280); } }
        if (a && !e.repeat) { latch[a] = 1; held[a] = true; Music.resume(); }
        if (c === "KeyP") pause();
      } else if (state === "title") {
        if (k || a) e.preventDefault();
        if (!e.repeat && (c === "ArrowLeft" || c === "KeyA")) chooseHero("mint");
        if (!e.repeat && (c === "ArrowRight" || c === "KeyD")) chooseHero("gom");
        if (!e.repeat && (c === "Enter" || a === "atk")) { e.preventDefault(); clickGo(); }
      } else if (state === "paused") {
        if (!e.repeat && (c === "Enter" || c === "KeyP")) { e.preventDefault(); clickGo(); }
      } else if (state === "over") {
        if (!e.repeat && c === "Enter" && e.target === document.body) { e.preventDefault(); clickGo(); }
      }
    });
    window.addEventListener("keyup", (e) => {
      const k = KEYMAP[e.code], a = ACTMAP[e.code];
      if (k) keys[k] = 0;
      if (a) held[a] = false;
    });
    window.addEventListener("blur", clearInput);
    document.addEventListener("visibilitychange", () => { if (document.hidden) { pause(); clearInput(); } });

    // ───────── 휴대폰 패드 (왼쪽 8방향 · 오른쪽 단추 — 여러 손가락 동시에)
    {
      const dpad = $("[data-dpad]"), knob = $("[data-knob]");
      let id = null;
      const move = (e) => {
        const r = dpad.getBoundingClientRect(), R = r.width / 2;
        let dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R);
        const dist = Math.hypot(dx, dy);
        let nx = 0, ny = 0;
        if (dist > R * 0.2) {
          const sec = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
          nx = Math.round(Math.cos((sec * Math.PI) / 4)); ny = Math.round(Math.sin((sec * Math.PI) / 4));
        }
        if (nx !== tpad.x && nx !== 0) tapDir(nx, 320);
        tpad.x = nx; tpad.y = ny;
        const lim = R * 0.55, k = dist > lim ? lim / dist : 1;
        knob.style.transform = `translate(${Math.round(dx * k)}px, ${Math.round(dy * k)}px)`;
      };
      dpad.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        if (id !== null) return;
        id = e.pointerId;
        try { dpad.setPointerCapture(id); } catch (_) { /* 오래된 브라우저 */ }
        dpad.classList.add("is-on");
        move(e);
        Music.resume();
      });
      dpad.addEventListener("pointermove", (e) => { if (e.pointerId === id) move(e); });
      const end = (e) => { if (e.pointerId !== id) return; id = null; tpad.x = tpad.y = 0; knob.style.transform = ""; dpad.classList.remove("is-on"); };
      ["pointerup", "pointercancel", "lostpointercapture"].forEach((t) => dpad.addEventListener(t, end));

      const pad = $("[data-btns]"), btns = Array.from(pad.querySelectorAll(".ft-btn")), fingers = new Map();
      const nearest = (x, y) => {
        let best = null, bd = Infinity;
        for (const b of btns) {
          const r = b.getBoundingClientRect();
          const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2)) - r.width / 2;
          if (d < bd) { bd = d; best = b; }
        }
        return best;
      };
      pad.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        const b = nearest(e.clientX, e.clientY);
        if (!b || fingers.has(e.pointerId)) return;
        fingers.set(e.pointerId, b);
        try { pad.setPointerCapture(e.pointerId); } catch (_) { /* 오래된 브라우저 */ }
        const a = b.dataset.b;
        tHeld[a]++; latch[a] = 1;
        b.classList.add("is-down");
        Music.resume();
      });
      const up = (e) => {
        const b = fingers.get(e.pointerId);
        if (!b) return;
        fingers.delete(e.pointerId);
        const a = b.dataset.b;
        tHeld[a] = Math.max(0, tHeld[a] - 1);
        if (!tHeld[a]) b.classList.remove("is-down");
      };
      ["pointerup", "pointercancel", "lostpointercapture"].forEach((t) => pad.addEventListener(t, up));
      padEl.addEventListener("contextmenu", (e) => e.preventDefault());
    }
    canvas.addEventListener("pointerdown", (e) => { if (state === "title") { e.preventDefault(); clickGo(); } });

    // ───────── 화면 크기 맞추기
    function fit() {
      const land = IS_TOUCH && window.innerWidth > window.innerHeight;
      mode = IS_TOUCH ? (land ? "land" : "port") : "pc";
      root.dataset.mode = mode;
      const rs = getComputedStyle(root);
      const padX = parseFloat(rs.paddingLeft) + parseFloat(rs.paddingRight), padY = parseFloat(rs.paddingTop) + parseFloat(rs.paddingBottom);
      const W = (stage.clientWidth || VW) - padX;
      let H = stage.clientHeight || 500;
      // 휴대폰 가로는 창이 화면보다 길어질 수 있다(공통 틀의 최소 높이) — 보이는 높이에 맞춘다
      if (mode === "land") H = Math.min(H, Math.max(200, window.innerHeight - stage.getBoundingClientRect().top - 6));
      root.style.height = mode === "land" ? `${H}px` : "";
      root.style.flex = mode === "land" ? "0 0 auto" : "";
      H -= padY;
      const topH = topEl.offsetHeight || 48;
      let s;
      if (mode === "pc") {
        // PC — 남는 높이를 거의 다 화면에 (아래 키 안내 한 줄만 남긴다)
        s = Math.min(W / VW, (H - topH - (keysEl.offsetHeight || 20) - 12) / VH);
      } else if (mode === "port") {
        const padMin = root.classList.contains("has-panel") ? 250 : 190;
        s = W / VW;
        if (H - topH - s * VH < padMin) s = Math.max(240 / VW, (H - topH - padMin) / VH);
        s = Math.min(s, W / VW);
      } else {
        s = Math.min(W / VW, (H - topH) / VH);
      }
      s = Math.max(200 / VW, s);
      // 정수배가 가장 큰 크기의 0.8 이상이면 정수배 (도트가 고르게)
      const dpr = window.devicePixelRatio || 1, si = Math.floor(s * dpr);
      const css = si >= 1 && si / (s * dpr) >= (mode === "pc" ? 0.8 : 0.86) ? si / dpr : s;
      const cw = Math.floor(VW * css), ch = Math.floor(VH * css);
      // 크기는 CSS 변수로만 넘긴다 — 공통 responsive.css 가 인라인 `width: 460px` 같은 값을 100%로 바꿔 버린다
      root.style.setProperty("--cw", `${cw}px`); root.style.setProperty("--ch", `${ch}px`);
      // PC · 휴대폰 가로는 시작 · 일시정지 · 결과 칸을 게임 화면 위에 겹친다
      if (mode !== "port") {
        const sc = canvas.parentElement;
        root.style.setProperty("--pl", `${sc.offsetLeft}px`); root.style.setProperty("--pt", `${sc.offsetTop}px`);
        root.style.setProperty("--pw", `${sc.offsetWidth}px`); root.style.setProperty("--ph", `${sc.offsetHeight}px`);
      }
      if (state !== "play") render();
    }

    // ───────── 고정 간격 루프
    let raf = 0, last = 0, acc = 0;
    function frame(now) {
      raf = 0;
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      try {
        if (state === "title") { titleT += dt; render(); }
        else if (state === "play") {
          acc += dt;
          let n = 0;
          while (acc >= STEP && n < 6 && state === "play") { update(); acc -= STEP; n++; }
          if (n >= 6) acc = 0;
          render();
          if (bakeQ.length) runBake(S && S.phase === "intro" ? 8 : 3);
        }
      } catch (err) { console.error(err); }
      if (state === "title" || state === "play") raf = requestAnimationFrame(frame);
    }
    function run() {
      if (raf) cancelAnimationFrame(raf);
      last = performance.now(); acc = 0;
      raf = requestAnimationFrame(frame);
    }

    // ───────── 시작
    ctx.onScore && ctx.onScore(() => (S ? S.score : 0));
    ctx.onRestart(() => start());
    ctx.onPause(pause);
    if (window.ResizeObserver) new ResizeObserver(() => fit()).observe(stage);
    window.addEventListener("resize", fit);
    showTitle();
    fit();
    // 갈무리 글꼴을 다 받으면 글자 그림을 새로 굽는다
    if (document.fonts && document.fonts.load) {
      Promise.all(["700 12px Galmuri11", "12px Galmuri11", "15px Galmuri14", "30px Galmuri14", "10px Galmuri9"].map((f) => document.fonts.load(f).catch(() => null)))
        .then(() => { PT.clear(); BIG.clear(); LOGO = null; TITLE = null; if (S) S.bg = buildArt(S.stage); hudCache.foe = "-"; render(); });
    }

    // 시험 페이지 전용 훅 (실제 페이지에는 열리지 않는다)
    if (window.HK_FIGHTER_DEBUG) {
      window.__fighter = {
        get state() { return state; },
        get S() { return S; },
        start() { start(); },
        chooseHero,
        god(on) { if (S) S.god = on !== false; },
        killAll() { if (!S) return; for (const e of S.en) if (!e.boss && !e.dead && e.st !== "fade") { e.hp = 0; e.dying = true; startFade(e); } S.spawnQ = []; },
        hurtBoss(n) { if (S && S.boss && !S.boss.inv) hurtEnemy(S.boss, n || 999, { dir: 1 }); },
        toStage(n) { if (!S) return; startStage(n); },
        toBoss() { if (!S) return; S.en = []; S.spawnQ = []; S.zone = null; S.zoneIdx = S.def.zones.length; S.phase = "play"; S.p.st = "idle"; S.p.x = S.def.end + 200; S.camX = S.def.end - 2; },
        setHp(n) { if (S) S.p.hp = n; },
        setLives(n) { if (S) S.lives = n; },
        setTime(n) { if (S) S.time = n; },
        key(code, down) { window.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code, bubbles: true })); },
      };
    }
  }

  window.HKFighter = { mount };
})();
