// 꿀알바 시리즈 밤골목 그림 — 시리즈 페이지 상단과 아케이드 소개 창이 함께 쓴다
window.HKSeriesArt = (function () {
  // 글자를 도트 점 목록으로 — 네온 간판에 쓴다
  function textDots(text, size) {
    const t = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    const font = `800 ${size}px Pretendard, "Apple SD Gothic Neo", sans-serif`;
    t.font = font;
    const w = Math.ceil(t.measureText(text).width) + 2, h = size + 4;
    t.canvas.width = w; t.canvas.height = h;
    t.font = font; t.textBaseline = "middle"; t.fillStyle = "#000"; t.fillText(text, 1, h / 2);
    const d = t.getImageData(0, 0, w, h).data, dots = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 120) dots.push([x, y]);
    return { dots, w, h };
  }
  // 밤의 낡은 골목 — 왼쪽 혼자 켜진 편의점, 가운데 네온이 깜빡이는 인력사무소와 구인 벽보, 오른쪽 가로등 아래 광대
  let SIGN = null, MOTHS = null;
  function drawScene(c, t) {
    const g = c.getContext("2d"), W = c.width, H = c.height, GROUND = 138;
    const px = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), w, h); };
    if (!SIGN) {
      SIGN = textDots("꿀벌 인력사무소", 13);
      MOTHS = Array.from({ length: 26 }, (_, i) => ({ c: i % 3, a: i * 2.4, r: 7 + (i * 7) % 26, sp: 0.9 + (i % 5) * 0.28 }));
    }
    const beat = Math.floor(t / 90);
    const neon = !(beat % 37 < 3 || beat % 53 === 7);         // 간판이 가끔 나간다
    const lamp = !(beat % 29 < 2 || beat % 41 === 11);        // 가로등도 가끔 깜빡인다
    px(0, 0, W, H, "#0d0716");
    for (let i = 0; i < 70; i++) if ((i + Math.floor(t / 800)) % 9) px((i * 61) % W, (i * 23) % 62, 1, 1, i % 5 ? "#475569" : "#cbd5e1");
    // 달 (구름에 살짝 가림)
    px(410, 12, 22, 22, "#d6d3a8"); px(404, 24, 40, 6, "#1b1230");
    // 먼 건물
    for (const [x, w, h] of [[0, 70, 92], [62, 46, 112], [352, 50, 104], [396, 90, 86]]) {
      px(x, GROUND - h, w, h, "#150c26");
      for (let wx = x + 5; wx < x + w - 5; wx += 11) for (let wy = GROUND - h + 7; wy < GROUND - 24; wy += 13) if ((wx * 7 + wy * 3) % 11 === 0) px(wx, wy, 4, 6, "#57401f");
    }
    // 인력사무소 — 낡은 3층 건물
    px(128, 22, 196, 116, "#2a2133");
    px(128, 22, 196, 3, "#463a52");
    for (let y = 28; y < 136; y += 6) for (let x = 130 + (y % 12 ? 0 : 6); x < 322; x += 12) px(x, y, 11, 1, "#231b2c");
    for (const [x, y, w] of [[140, 92, 34], [290, 70, 22], [214, 26, 40]]) px(x, y, w, 2, "#17101f");  // 벽 금
    // 위층 창문 — 한 칸만 불이 켜져 있고 사람 그림자가 있다
    for (let i = 0; i < 5; i++) {
      const x = 142 + i * 36, on = i === 3;
      px(x, 58, 20, 22, "#120c1b"); px(x + 2, 60, 16, 18, on ? "#b45309" : "#1b1426");
      if (on) { px(x + 7, 66, 6, 12, "#2a1608"); px(x + 8, 62, 4, 4, "#2a1608"); }
    }
    // 네온 간판
    const sx = 226 - SIGN.w / 2, sy = 30;
    px(sx - 8, sy - 3, SIGN.w + 16, SIGN.h + 6, "#1a0a12");
    px(sx - 8, sy - 3, SIGN.w + 16, 1, "#7f1d1d"); px(sx - 8, sy + SIGN.h + 2, SIGN.w + 16, 1, "#7f1d1d");
    if (neon) { g.fillStyle = "rgba(239, 68, 68, .1)"; g.fillRect(sx - 30, sy - 14, SIGN.w + 60, SIGN.h + 40); }
    for (const [x, y] of SIGN.dots) px(sx + x, sy + y, 1, 1, neon ? "#f87171" : "#4a1d24");
    // 문과 지하 계단
    px(198, 96, 52, 42, "#120c1b"); px(202, 100, 44, 38, "#1f2937");
    px(206, 104, 16, 34, neon ? "#92400e" : "#451a03"); px(226, 104, 16, 34, "#0b0a14");
    px(209, 107, 10, 10, neon ? "#fbbf24" : "#713f12");
    px(226, 132, 16, 2, "#334155"); px(226, 126, 16, 2, "#293548"); px(226, 120, 16, 2, "#1e293b");
    // 구인 벽보 — 바람에 한 장씩 흔들린다
    const POSTERS = [[138, 98, 14, 18], [156, 102, 12, 16], [172, 96, 14, 20], [258, 98, 14, 18], [276, 104, 12, 15], [294, 97, 16, 20]];
    POSTERS.forEach(([x, y, w, h], i) => {
      const flap = Math.floor(t / 400 + i * 3) % 7 === 0 ? 1 : 0;
      px(x, y + flap, w, h, i % 2 ? "#e7dcc0" : "#f1e7cd");
      px(x + 2, y + 3 + flap, w - 4, 2, "#b91c1c");
      for (let l = 7; l < h - 2; l += 3) px(x + 2, y + l + flap, w - 5, 1, "#8b7d63");
      px(x + w / 2 - 1, y - 1 + flap, 2, 2, "#57534e");
    });
    // 혼자 켜진 편의점
    px(4, 84, 118, 54, "#16202c");
    px(4, 84, 118, 12, "#0f766e"); px(4, 95, 118, 2, "#fbbf24");
    for (let i = 0; i < 3; i++) { px(12 + i * 38, 100, 34, 38, lamp ? "#cffafe" : "#67a3a8"); for (let s = 0; s < 3; s++) { px(14 + i * 38, 106 + s * 10, 30, 1, "#64748b"); for (let k = 0; k < 6; k++) px(15 + i * 38 + k * 5, 101 + s * 10, 3, 5, ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b"][(i + s + k) % 4]); } }
    g.fillStyle = "rgba(165, 243, 252, .1)"; g.fillRect(0, 96, 150, 64);
    // 땅 — 젖은 아스팔트에 불빛이 비친다
    px(0, GROUND, W, H - GROUND, "#120c1d");
    px(0, GROUND, W, 2, "#2a2133");
    for (let i = 0; i < 40; i++) px((i * 37) % W, GROUND + 4 + (i * 11) % 28, 8 + i % 9, 1, "#1c1429");
    if (lamp) for (let y = GROUND + 3; y < H; y += 3) px(14 + (y % 5), y, 100, 1, "rgba(165, 243, 252, .1)");
    if (neon) for (let y = GROUND + 3; y < H; y += 3) px(176 + (y % 7), y, 100, 1, "rgba(239, 68, 68, .12)");
    // 가로등 빛 · 기둥
    const lx = 372;
    px(lx, 52, 3, 86, "#334155"); px(lx - 16, 50, 19, 3, "#334155"); px(lx - 20, 53, 9, 3, lamp ? "#fef08a" : "#4b4620");
    if (lamp) { g.fillStyle = "rgba(254, 240, 138, .08)"; g.beginPath(); g.moveTo(lx - 20, 56); g.lineTo(lx - 11, 56); g.lineTo(lx + 22, GROUND); g.lineTo(lx - 54, GROUND); g.closePath(); g.fill(); }
    // 불빛에 모이는 나방 떼
    for (const m of MOTHS) {
      const a = m.a + (t / 1000) * m.sp, cx = m.c === 0 ? lx - 16 : m.c === 1 ? 60 : 226;
      const cy = m.c === 0 ? 62 : m.c === 1 ? 90 : 44;
      const x = cx + Math.cos(a) * m.r, y = cy + Math.sin(a * 1.7) * m.r * 0.6, f = Math.floor(t / 90 + m.a) % 2;
      px(x - 1, y, 3, 1, "#d6cfc0"); px(x - (f ? 2 : 1), y - 1, 2, 1, "#a8a29e"); px(x + (f ? 1 : 0), y - 1, 2, 1, "#a8a29e");
    }
    // 가로등 아래 광대 — 풍선을 들고 이쪽을 보고 서 있다
    const cl = 344, hop = Math.floor(t / 2200) % 5 === 0 ? 1 : 0;
    px(cl - 7, GROUND - 2, 16, 2, "rgba(0,0,0,.5)");
    px(cl - 3, GROUND - 7, 3, 7, "#111827"); px(cl + 2, GROUND - 7, 3, 7, "#111827");
    px(cl - 4, GROUND - 19, 5, 13, "#991b1b"); px(cl + 1, GROUND - 19, 5, 13, "#1e3a8a");
    px(cl, GROUND - 17, 2, 1, "#fde047"); px(cl, GROUND - 13, 2, 1, "#fde047");
    px(cl - 3, GROUND - 27, 8, 8, "#e5e7eb");
    px(cl - 2, GROUND - 25, 2, 2, "#111827"); px(cl + 2, GROUND - 25, 2, 2, "#111827");
    px(cl, GROUND - 23 + hop, 2, 1, "#ef4444"); px(cl - 2, GROUND - 21, 6, 1, "#b91c1c");
    px(cl - 2, GROUND - 29, 6, 2, "#7c3aed"); px(cl, GROUND - 31, 2, 2, "#fde047");
    px(cl + 5, GROUND - 16, 3, 2, "#e5e7eb");
    px(cl + 7, GROUND - 40 + hop, 1, 24, "#94a3b8");
    px(cl + 3, GROUND - 52 + hop, 9, 11, "#dc2626"); px(cl + 4, GROUND - 54 + hop, 7, 2, "#dc2626"); px(cl + 5, GROUND - 50 + hop, 2, 2, "#fca5a5");
    // 왼쪽 위 어둠 — 화면 가장자리를 눌러 분위기를 잡는다
    g.fillStyle = "rgba(5, 3, 12, .45)"; g.fillRect(0, 0, W, 6); g.fillRect(0, H - 6, W, 6);
  }

  return { drawScene, width: 480, height: 170 };
})();
