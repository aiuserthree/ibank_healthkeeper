// 꿀알바 시리즈 밤골목 그림 — 시리즈 페이지 상단과 아케이드 소개 창이 함께 쓴다
window.HKSeriesArt = (function () {
  const W = 640, SKY_H = 90, H = 226 + SKY_H, GROUND = 188; // 하늘을 위로 늘려 제목 자리를 둔다 (건물은 SKY_H 만큼 아래로)
  // 글자를 도트 점 목록으로 — 낡은 간판에 쓴다
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
  const LATE = "#d9b45c";
  const BX_SIGN = 228, LAMP = 406;                 // 꿀벌 간판 왼쪽 · 가로등 머리의 가운데
  const STARS = [[46, 18], [96, 52], [178, 12], [236, 66], [452, 14], [508, 58], [628, 74], [16, 86]]; // 반짝이는 별
  const brush = (g) => (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), w, h); };
  // 그림은 늘 같아야 하니 정해진 순서로 나오는 난수를 쓴다
  function dice(n) { let s = n; return (m) => { s = (s * 16807) % 2147483647; return s % m; }; }

  function makeSky() {
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const px = brush(c.getContext("2d"));
    const BANDS = ["#0b1030", "#10163c", "#161c48", "#1e2455", "#292d62", "#383a70"];
    const band = Math.ceil(H / BANDS.length);
    BANDS.forEach((col, i) => {
      const y = i * band;
      px(0, y, W, band + 1, col);
      if (BANDS[i + 1]) for (let x = 0; x < W; x += 2) for (let k = 0; k < 6; k += 2) px(x + (k % 4 ? 1 : 0), y + band - 6 + k, 1, 1, BANDS[i + 1]); // 띠 사이는 점으로 섞는다
    });
    // 별과 달
    const r = dice(97);
    for (const [x, y] of STARS) px(x, y, 1, 1, "#aeb6d8");
    for (let i = 0; i < 90; i++) px(r(W), r(120), 1, 1, r(4) ? "#6f78a6" : "#d6dbef");
    for (let dy = -15; dy <= 15; dy++) { const dx = Math.round(Math.sqrt(225 - dy * dy)); px(578 - dx, 34 + dy, dx * 2, 1, "#ece6c6"); }
    px(570, 28, 6, 5, "#d3cca8"); px(584, 38, 5, 4, "#d3cca8"); px(574, 42, 3, 3, "#d3cca8");
    return c;
  }
  // 도트 구름 — 계단처럼 쌓고 아랫단은 점으로 흩어진다
  function makeCloud(rows) {
    const w = Math.max(...rows), c = document.createElement("canvas"); c.width = w; c.height = rows.length + 2;
    const px = brush(c.getContext("2d"));
    rows.forEach((n, y) => { px((w - n) >> 1, y, n, 1, y < 2 ? "#54588c" : "#393d73"); });
    const last = rows[rows.length - 1];
    for (let y = 0; y < 2; y++) for (let x = (w - last) >> 1; x < (w + last) >> 1; x += 2) if ((x * 7 + y * 3) % 5) px(x + y, rows.length + y, 1, 1, "#2c2f62");
    return c;
  }
  // 받침 ㄹ — 꿀의 ㄹ은 획이 붙어 뭉개지므로 알의 ㄹ을 옮겨 쓰고, 두 ㄹ의 빈 줄을 표시해 둔다 (cw: 한 글자 폭)
  function fixRieul(dots, cw) {
    const al = dots.filter(([x]) => x >= cw && x < cw * 2);
    const rows = new Set(al.filter(([x]) => x < cw * 1.5).map(([, y]) => y));   // 왼쪽 절반 — ㅇ과 받침만 지나간다
    let top = Math.min(...rows);
    while (rows.has(top)) top++;                                                 // ㅇ 아래의 빈 줄을 지나면 받침이다
    while (!rows.has(top) && top < 99) top++;
    const old = dots.filter(([x, y]) => x < cw && y >= top), body = al.filter(([, y]) => y >= top);
    if (!old.length || !body.length) return { dots, gaps: [] };
    const oldX = old.map(([x]) => x), left = Math.min(...body.map(([x]) => x)), span = Math.max(...oldX) - Math.min(...oldX);
    const rieul = body.filter(([x]) => x <= left + span);                        // 바의 첫 획은 빼고 ㄹ만
    const dx = Math.min(...oldX) - left, right = Math.max(...rieul.map(([x]) => x));
    // 획이 일부만 지나는 줄이 ㄹ의 빈 줄이다 — 연결 획만 남기고 넓힌다
    const gaps = [];
    for (let y = top; y <= Math.max(...rieul.map((d) => d[1])); y++) {
      const hit = new Set(rieul.filter((d) => d[1] === y).map((d) => d[0]));
      if (hit.size * 2 > right - left) continue;
      for (let x = left; x <= right + 1; x++) if (!hit.has(x)) gaps.push([x, y], [x + dx, y]);
    }
    // PC — ㅜ의 아래 획이 짧으면 끌처럼 보이니 윗부분을 두 줄 올리고 그만큼 획을 늘린다
    const lift = window.innerWidth > 640 ? 2 : 0;
    const upper = dots.filter(([x, y]) => x < cw && y < top), stem = lift ? upper.filter(([, y]) => y === top - 1) : [];
    return {
      dots: dots.filter(([x]) => x >= cw).concat(
        upper.map(([x, y]) => [x, y - lift]),
        stem, stem.map(([x, y]) => [x, y - 1]),
        rieul.map(([x, y]) => [x + dx, y])),
      gaps,
    };
  }
  // 하늘에 뜬 제목 — 작게 찍은 글자를 두 배로 키워 네모난 도트만 남긴다
  function makeTitle() {
    const d = textDots("꿀알바 시리즈", 26), z = 2, r = fixRieul(d.dots, textDots("꿀", 26).w - 1);
    const c = document.createElement("canvas"); c.width = d.w * z + 2; c.height = d.h * z + 2;
    const g = c.getContext("2d"), px = brush(g);
    for (const [x, y] of r.dots) px(x * z, y * z, z + 1, z + 1, "#f7cb16");     // 점을 조금 겹쳐 찍어 획을 두껍게
    for (const [x, y] of r.gaps) g.clearRect(x * z, y * z, z, z);        // ㄹ 줄 사이는 작은 화면에서도 벌어져 보이게
    g.globalCompositeOperation = "source-atop";
    for (let y = 2; y < c.height; y += 3) px(0, y, c.width, 1, "#eab90f");
    return c;
  }

  // 때 — 벽 위에서 아래로 흘러내린 얼룩
  function stains(px, r, x, y, w, h, n, col) {
    for (let i = 0; i < n; i++) {
      const sx = x + r(w), len = 6 + r(h);
      for (let k = 0; k < len; k += 2) if (r(5)) px(sx + (k > len / 2 ? 1 : 0), y + k, 2 - (k > len * .7 ? 1 : 0), 2, col);
    }
  }
  function worn(px, r, sign, x, y, col) {        // 글자 일부가 벗겨진 간판
    for (const [dx, dy] of sign.dots) if (r(11)) px(x + dx, y + dy, 1, 1, col);
  }
  function windowBox(px, x, y, w, h, dark) {
    px(x, y, w, h, "#4b4a55"); px(x + 2, y + 2, w - 4, h - 4, "#d9d3c2");
    px(x + 4, y + 4, w - 8, h - 8, dark ? "#55677a" : "#9fbac8");
    px(x + w / 2 - 1, y + 3, 2, h - 6, "#6a6872");
    px(x + 6, y + 6, Math.floor(w / 2) - 9, 3, "#c9dbe2");
    for (let i = 0; i < h - 10; i += 2) px(x + w - 10 + (i % 4 ? 1 : 0), y + 5 + i, 1, 1, "#7f96a6");
    px(x - 1, y + h, w + 2, 2, "#8a8678");
  }

  function makeTown() {
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d"), px = brush(g), r = dice(4711);
    g.translate(0, SKY_H);
    // 먼 고층 건물 — 뿌옇게
    for (const [x, y, w, col] of [[0, 62, 64, "#a3aeb7"], [52, 40, 56, "#94a0ab"], [486, 52, 62, "#a3aeb7"], [576, 34, 70, "#8f9ba6"]]) {
      px(x, y, w, GROUND - y, col);
      px(x + w - 7, y, 7, GROUND - y, "#808c98");
      for (let wy = y + 6; wy < GROUND - 6; wy += 9) for (let wx = x + 5; wx < x + w - 11; wx += 8) px(wx, wy, 5, 5, (wx * 3 + wy * 5) % 13 ? "#76838f" : LATE);
    }
    // 왼쪽 혼자 켜진 편의점 (1화)
    px(0, 108, 112, GROUND - 108, "#cfc6b4");
    px(0, 104, 112, 5, "#8a8678");
    stains(px, r, 0, 108, 112, 22, 16, "#ad9f8b");
    windowBox(px, 14, 114, 30, 26, false); windowBox(px, 62, 114, 30, 26, true);
    px(0, 144, 112, 12, "#3f8f83"); px(0, 155, 112, 2, "#e0ad4c");
    px(0, 157, 112, GROUND - 157, "#b9d6d6");
    for (let i = 0; i < 3; i++) for (let s = 0; s < 2; s++) {
      px(5 + i * 36, 172 + s * -13, 30, 1, "#71808c");
      for (let k = 0; k < 6; k++) px(6 + i * 36 + k * 5, 166 + s * -13, 3, 6, ["#c95f5f", "#6d8fc2", "#71ad7e", "#d9a650"][(i + s + k) % 4]);
    }
    for (let i = 0; i < 4; i++) px(i * 36, 157, 3, GROUND - 157, "#6f7f88");
    // 본관 — 칠이 벗겨진 2층 건물
    const BX = 116, BW = 262, TOP = 56;
    px(BX, TOP, BW, GROUND - TOP, "#ddd5c2");
    px(BX, TOP, BW, 2, "#4b4a55"); px(BX, TOP, 2, GROUND - TOP, "#4b4a55"); px(BX + BW - 2, TOP, 2, GROUND - TOP, "#4b4a55");
    px(BX + 2, TOP + 2, BW - 4, 7, "#efe8d7"); px(BX + 2, TOP + 9, BW - 4, 3, "#a79f8e");
    for (let i = 0; i < 26; i++) px(BX + 4 + r(BW - 14), 66 + r(50), 3 + r(9), 1, "#cdc4b0");   // 잔금
    stains(px, r, BX + 3, TOP + 12, BW - 6, 40, 34, "#b8a991");
    stains(px, r, BX + 3, 121, BW - 6, 16, 18, "#a99a84");
    for (let i = 0; i < 14; i++) { const x = BX + 8 + r(BW - 26), y = 64 + r(46); px(x, y, 5 + r(7), 3 + r(4), "#c9bfaa"); px(x + 1, y + 1, 3, 1, "#b3a892"); } // 벗겨진 칠
    // 옥상 — 물탱크 · 실외기 · 안테나
    px(BX + 24, 26, 40, 26, "#78a7a8"); px(BX + 24, 26, 40, 3, "#a4c9c6"); px(BX + 56, 26, 8, 26, "#5d8a8d");
    for (let y = 33; y < 52; y += 7) px(BX + 24, y, 40, 1, "#5d8a8d");
    px(BX + 27, 52, 3, 4, "#55525c"); px(BX + 58, 52, 3, 4, "#55525c");
    px(BX + 176, 34, 46, 22, "#bfc2c1"); px(BX + 176, 34, 46, 2, "#e0e1dd"); px(BX + 176, 54, 46, 2, "#7d8086");
    for (let a = 0; a < 7; a++) px(BX + 184 + a, 40 + a % 3, 12, 1, a % 2 ? "#6b6e76" : "#9ca0a4");
    for (let y = 38; y < 52; y += 3) px(BX + 204, y, 14, 1, "#83878e");
    px(BX + 110, 24, 2, 32, "#55525c"); for (let i = 0; i < 4; i++) px(BX + 103 + i, 26 + i * 4, 16 - i * 2, 1, "#55525c");
    // 2층 창문
    windowBox(px, BX + 20, 72, 34, 34, true); windowBox(px, BX + 68, 72, 34, 34, false);
    windowBox(px, BX + 210, 72, 34, 34, true);
    // 2층 간판 — 꿀벌 인력사무소
    const sx = BX + 112, sy = 68;
    px(sx, sy, 90, 42, "#4b4a55"); px(sx + 2, sy + 2, 86, 38, "#f1ead8");
    stains(px, r, sx + 3, sy + 3, 84, 12, 8, "#d8cfba");
    const top = textDots("꿀벌", 17), bot = textDots("인력사무소", 15);
    worn(px, r, top, sx + 45 - top.w / 2, sy + 2, "#b5441f");
    worn(px, r, bot, sx + 45 - bot.w / 2, sy + 21, "#27252c");
    // 층 사이 띠 간판 — 구인구직 타일
    px(BX + 2, 116, BW - 4, 22, "#c9c1ae"); px(BX + 2, 116, BW - 4, 2, "#efe8d7"); px(BX + 2, 136, BW - 4, 2, "#8a8678");
    const lines = [["구", "#27252c"], ["인", "#27252c"], ["구", "#b5441f"], ["직", "#b5441f"]];
    lines.forEach(([ch, col], i) => {
      const x = BX + 12 + i * 23, d = textDots(ch, 15);
      px(x, 118, 21, 19, "#4b4a55"); px(x + 1, 119, 19, 17, "#f4dfb4"); worn(px, r, d, x + 11 - d.w / 2, 118, col);
    });
    const wash = textDots("세탁소", 14);
    worn(px, r, wash, BX + 196, 119, "#3e5f7d");
    // 1층 — 내려진 셔터
    px(BX + 8, 142, 92, GROUND - 142, "#4b4a55"); px(BX + 10, 144, 88, 6, "#9a9ca1");
    for (let y = 150; y < GROUND; y += 3) { px(BX + 10, y, 88, 2, "#c2c4c6"); px(BX + 10, y + 2, 88, 1, "#7f8288"); }
    for (let i = 0; i < 9; i++) px(BX + 12 + r(80), 152 + r(26), 2, 3 + r(9), "#a8957f");
    // 1층 — 지하로 내려가는 문 (열려 있다)
    const DX = BX + 112;
    px(DX, 142, 44, GROUND - 142, "#4b4a55"); px(DX + 2, 144, 40, GROUND - 144, "#2d2a33");
    for (let i = 0; i < 6; i++) px(DX + 6 + i * 2, 172 - i * 5 + 8, 32 - i * 4, 2, "#55525c");
    // 1층 — 분홍 차양 가게
    const SX = BX + 168;
    px(SX, 142, 84, GROUND - 142, "#4b4a55");
    px(SX + 2, 150, 80, GROUND - 150, "#b9cfd6");
    px(SX + 40, 150, 2, GROUND - 150, "#4b4a55");
    px(SX + 46, 156, 32, GROUND - 156, "#34323b");
    px(SX + 6, 158, 30, 18, "#eeb9b3"); px(SX + 6, 176, 30, 12, "#8796a4");
    for (let i = 0; i < 8; i++) px(SX - 2 + i * 11, 140, 11, 11, i % 2 ? "#f0ece0" : "#dd8f8f");
    for (let i = 0; i < 8; i++) px(SX - 2 + i * 11, 151, 11, 2, i % 2 ? "#b9b4a6" : "#b16868");
    // 벽을 타고 내려오는 배관
    px(BX + 104, TOP + 12, 3, GROUND - TOP - 12, "#9a948a"); px(BX + 105, TOP + 12, 1, GROUND - TOP - 12, "#c8c2b6");
    // 오른쪽 담장과 구인 벽보
    px(382, 118, 130, GROUND - 118, "#b5b1a8"); px(382, 114, 130, 5, "#8f8b84");
    for (let x = 382; x < 512; x += 26) px(x, 119, 1, GROUND - 119, "#94908a");
    for (let y = 132; y < GROUND; y += 14) px(382, y, 130, 1, "#a09c94");
    stains(px, r, 383, 119, 128, 28, 16, "#918d84");
    [[392, 130, 22, 28], [420, 136, 18, 24], [444, 128, 24, 30], [476, 134, 20, 26]].forEach(([x, y, w, h], i) => {
      px(x, y, w, h, i % 2 ? "#e6dcc2" : "#f2e9d2");
      px(x + 3, y + 4, w - 6, 3, "#b5372f");
      for (let l = 10; l < h - 3; l += 4) px(x + 3, y + l, w - 7 - (l % 3), 1, "#8c806a");
      px(x + w / 2 - 1, y - 1, 3, 3, "#5a5760");
    });
    // 오른쪽 작은 건물
    px(514, 96, 126, GROUND - 96, "#c6b8a2"); px(514, 92, 126, 5, "#7f7a72");
    stains(px, r, 516, 98, 122, 26, 20, "#a4957f");
    windowBox(px, 530, 106, 32, 30, false); windowBox(px, 584, 106, 32, 30, true);
    px(514, 144, 126, 11, "#7a8f6a"); px(514, 155, 126, 2, "#55524c");
    const sup = textDots("부동산", 11);
    worn(px, r, sup, 560, 142, "#f4eedd");
    px(528, 157, 92, GROUND - 157, "#3b3942"); px(530, 159, 40, GROUND - 159, "#8fa9b5"); px(574, 159, 44, GROUND - 159, "#55677a");
    // 땅 — 보도블록과 찻길
    px(0, GROUND, W, 12, "#bdb6a8"); px(0, GROUND, W, 1, "#716c64");
    for (let x = 0; x < W; x += 18) px(x + (x % 36 ? 0 : 9), GROUND + 1, 1, 11, "#a49d90");
    px(0, GROUND + 6, W, 1, "#a49d90");
    px(0, GROUND + 12, W, 2, "#7a756d");
    px(0, GROUND + 14, W, H - GROUND - 14, "#7c7f83");
    for (let i = 0; i < 160; i++) px(r(W), GROUND + 15 + r(H - SKY_H - GROUND - 15), 2 + r(5), 1, r(2) ? "#6d7074" : "#8c8f92");
    for (let i = 0; i < 7; i++) px(i * 96 + 20, H - SKY_H - 12, 44, 3, "#d4d2c6");
    // 소품 — 우유 상자, 공사 고깔
    px(170 - 54, GROUND - 13, 26, 15, "#3f74a8"); px(116, GROUND - 13, 26, 2, "#6698c5");
    for (let i = 0; i < 4; i++) { px(119 + i * 6, GROUND - 21, 4, 8, "#f2efe6"); px(120 + i * 6, GROUND - 23, 2, 2, "#c95f5f"); }
    px(500, GROUND - 1, 18, 3, "#b5533a");
    for (let i = 0; i < 12; i++) px(504 + Math.floor(i / 3), GROUND - 2 - i * 1.5, 10 - Math.floor(i / 3) * 2, 2, i % 6 < 3 ? "#e27d4e" : "#f0ece0");
    // 전봇대와 얽힌 전선
    const PX = 372;
    px(PX, 8, 8, GROUND - 6, "#a9a59c"); px(PX + 5, 8, 3, GROUND - 6, "#7e7a73"); px(PX, 8, 1, GROUND - 6, "#cbc7bd");
    px(PX - 18, 22, 44, 4, "#6b6760"); px(PX - 12, 40, 32, 3, "#6b6760");
    px(PX + 8, 46, 12, 18, "#8c8f8c"); px(PX + 8, 46, 12, 2, "#b3b6b2");
    const wire = (x0, y0, x1, y1, sag) => {
      const n = Math.abs(x1 - x0);
      for (let i = 0; i <= n; i++) { const f = i / n, y = y0 + (y1 - y0) * f + sag * 4 * f * (1 - f); px(x0 + (x1 - x0) * f, y, 1, 1, "#3b3942"); }
    };
    wire(PX - 18, 24, 0, 16, 22); wire(PX - 12, 41, 0, 44, 18); wire(PX + 24, 24, W, 10, 18); wire(PX + 18, 41, W, 30, 22);
    wire(PX - 12, 42, BX + 10, 57, 10); wire(PX + 22, 42, 514, 96, 16);
    // 날이 저문다 — 불 켜진 곳만 남기고 푸르게 가라앉힌다
    const LIT = [[0, 144, 112, GROUND - 144], [BX + 112, 68, 90, 42]];
    const img = g.getImageData(0, 0, W, H), d = img.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (d[i] === 217 && d[i + 1] === 180 && d[i + 2] === 92) continue;             // 늦게까지 켜진 창 (LATE)
      if (!d[i + 3] || LIT.some(([lx, ly, lw, lh]) => x >= lx && x < lx + lw && y - SKY_H >= ly && y - SKY_H < ly + lh)) continue;
      d[i] = d[i] * .3 + 6; d[i + 1] = d[i + 1] * .33 + 8; d[i + 2] = d[i + 2] * .48 + 26;
    }
    g.putImageData(img, 0, 0);
    // 편의점 간판
    worn(px, r, textDots("24시 편의점", 10), 30, 143, "#f4eedd");
    // 2층에 혼자 불 켜진 창 — 사람 그림자가 서 있다
    px(BX + 72, 76, 26, 26, "#e8b452"); px(BX + 84, 75, 2, 28, "#6a5238");
    px(BX + 90, 88, 7, 14, "#5a3a1c"); px(BX + 91, 83, 5, 5, "#5a3a1c");
    // 옆 건물 — 텔레비전 불빛
    px(588, 110, 24, 22, "#6f93bd"); px(599, 110, 2, 22, "#39456e");
    // 지하로 내려가는 문 — 안쪽에서 새어 나오는 불빛
    px(DX + 2, 144, 40, GROUND - 144, "#a86a2a");
    for (let i = 0; i < 6; i++) px(DX + 6 + i * 2, 180 - i * 5, 32 - i * 4, 2, "#6e431c");
    px(DX + 2, 144, 40, 4, "#d29a45");
    // 가로등 팔
    px(PX + 8, 98, 26, 3, "#2b2d4a"); px(PX + 28, 101, 12, 3, "#3a3c5a");
    return c;
  }

  let SKY = null, TOWN = null, TITLE = null, CLOUDS = null, FIGURE = null, MOTHS = null;
  function worker(px, x, foot, t) {                // 공고를 든 구직자 — 노란 모자, 왼손에 종이
    const blink = Math.floor(t / 180) % 23 === 0, bob = Math.floor(t / 900) % 2;
    px(x - 12, foot - 1, 28, 3, "rgba(40, 38, 46, .3)");
    px(x - 8, foot - 5, 9, 5, "#4b4a55"); px(x + 3, foot - 5, 9, 5, "#4b4a55");    // 신발
    px(x - 7, foot - 19, 7, 15, "#3e4a5e"); px(x + 3, foot - 19, 7, 15, "#3e4a5e"); // 바지
    px(x - 8, foot - 37 + bob, 18, 19 - bob, "#8fa39a"); px(x - 8, foot - 37 + bob, 18, 2, "#adbfb6");  // 조끼
    px(x - 1, foot - 35 + bob, 2, 17 - bob, "#d9b24a");
    px(x - 12, foot - 36 + bob, 4, 13, "#f0ece0"); px(x + 10, foot - 36 + bob, 4, 11, "#f0ece0");   // 소매
    px(x - 12, foot - 23 + bob, 4, 3, "#edc9a6"); px(x + 10, foot - 25 + bob, 4, 3, "#edc9a6");
    px(x + 11, foot - 33 + bob, 11, 14, "#4b4a55"); px(x + 12, foot - 32 + bob, 9, 12, "#f6f0dd"); // 종이
    px(x + 14, foot - 30 + bob, 5, 2, "#b5372f"); px(x + 14, foot - 26 + bob, 5, 1, "#8c806a"); px(x + 14, foot - 23 + bob, 4, 1, "#8c806a");
    px(x - 9, foot - 55 + bob, 20, 18, "#edc9a6");                                 // 얼굴
    px(x - 10, foot - 52 + bob, 2, 9, "#2d2a33"); px(x + 11, foot - 52 + bob, 2, 9, "#2d2a33");
    px(x - 10, foot - 60 + bob, 23, 9, "#e3b84c"); px(x - 10, foot - 60 + bob, 23, 2, "#f1d27c");  // 모자
    px(x - 13, foot - 52 + bob, 28, 3, "#c79a35");
    px(x - 1, foot - 57 + bob, 4, 4, "#2d2a33"); px(x, foot - 56 + bob, 2, 1, "#e3b84c");
    if (!blink) { px(x - 5, foot - 47 + bob, 3, 3, "#2d2a33"); px(x + 5, foot - 47 + bob, 3, 3, "#2d2a33"); }
    else { px(x - 5, foot - 46 + bob, 3, 1, "#2d2a33"); px(x + 5, foot - 46 + bob, 3, 1, "#2d2a33"); }
    px(x - 1, foot - 41 + bob, 5, 1, "#a8664f");
  }
  function bubble(px, x, y) {                      // 말풍선 — 꿀단지
    px(x - 15, y - 13, 32, 24, "#4b4a55"); px(x - 14, y - 14, 30, 26, "#4b4a55");
    px(x - 13, y - 12, 28, 22, "#fbf8ef");
    px(x, y + 10, 4, 4, "#4b4a55"); px(x + 1, y + 10, 2, 2, "#fbf8ef");
    px(x - 7, y - 5, 16, 11, "#d99a33"); px(x - 6, y - 8, 14, 3, "#8d6239"); px(x - 7, y - 3, 16, 3, "#f2c766"); px(x - 4, y - 1, 4, 3, "#f8e0a0");
  }
  // 낡은 밤골목 — 꿀벌 인력사무소 앞에 공고를 든 사람이 서 있다. 간판과 가로등이 가끔 깜빡이고, 구름이 흐르고, 나방이 불빛에 모인다
  function drawScene(c, t, opts) {
    if (!SKY) {
      SKY = makeSky(); TOWN = makeTown();
      // 글자는 점으로 찍어 두고 다시 쓰니 글꼴이 도착한 뒤에 찍는다 — 먼저 찍으면 대체 글꼴 모양으로 굳는다
      const ready = () => { TITLE = makeTitle(); TOWN = makeTown(); };
      if (document.fonts && document.fonts.load) document.fonts.load("800 26px Pretendard", "꿀알바 시리즈 인력사무소").then(ready, ready);
      else ready();
      FIGURE = document.createElement("canvas"); FIGURE.width = 70; FIGURE.height = 100;
      MOTHS = Array.from({ length: 12 }, (_, i) => ({ a: i * 2.4, r: 6 + (i * 7) % 22, sp: 0.9 + (i % 5) * 0.28 }));
      CLOUDS = [[10, 12, 16, 26, 44, 70, 92], [6, 18, 30, 52, 66], [14, 22, 40, 58, 84, 110], [8, 20, 34, 48]].map(makeCloud);
    }
    const g = c.getContext("2d"), px = brush(g);
    g.imageSmoothingEnabled = false;
    const beat = Math.floor(t / 90);
    const neon = !(beat % 37 < 3 || beat % 53 === 7);         // 간판이 가끔 나간다
    const lamp = !(beat % 29 < 2 || beat % 41 === 11);        // 가로등도 가끔 깜빡인다
    g.drawImage(SKY, 0, 0);
    STARS.forEach(([x, y], i) => { if ((i + Math.floor(t / 700)) % 4 === 0) px(x - 1, y, 3, 1, "#eef1fb"), px(x, y - 1, 1, 3, "#eef1fb"); });
    [[150, 98, 0, 3], [400, 90, 1, 2], [640, 102, 2, 4], [120, 26, 3, 1.5], [760, 20, 1, 2.5]].forEach(([x0, y, k, sp]) => {
      const cl = CLOUDS[k];
      g.drawImage(cl, Math.round((x0 + (t / 1000) * sp) % (W + 240)) - 240, y, cl.width * 2, cl.height * 2);
    });
    if (TITLE && (!opts || opts.title !== false)) g.drawImage(TITLE, Math.round((W - TITLE.width) / 2), 22); // 제목을 따로 쓰는 곳은 빼고 그린다
    g.drawImage(TOWN, 0, 0);
    g.save(); g.translate(0, SKY_H);
    // 전선 위의 새
    const hop = Math.floor(t / 1700) % 6 === 0 ? 1 : 0;
    for (const x of [214, 226]) { px(x, 20 - hop, 7, 4, "#0d0f26"); px(x + 6, 19 - hop, 3, 3, "#0d0f26"); px(x - 3, 22 - hop, 4, 1, "#0d0f26"); }
    // 전봇대에 묶인 빨간 풍선
    const sway = Math.round(Math.sin(t / 900) * 2);
    for (let i = 0; i < 26; i++) px(388 + Math.round(sway * i / 26), 92 - i, 1, 1, "#23253f");
    px(382 + sway, 54, 13, 14, "#a8322c"); px(384 + sway, 52, 9, 18, "#a8322c"); px(386 + sway, 56, 3, 4, "#d9786e"); px(387 + sway, 70, 3, 2, "#7d2420");
    // 불빛 — 편의점 앞, 간판 둘레, 가로등 아래. 찻길에도 비친다
    g.globalCompositeOperation = "lighter";
    px(0, GROUND, 124, 12, "rgb(20, 38, 42)");
    if (neon) for (let k = 0; k < 3; k++) px(BX_SIGN - 3 - k * 3, 65 - k * 3, 96 + k * 6, 48 + k * 6, "rgb(11, 5, 4)");
    if (lamp) for (let y = 106; y < GROUND + 12; y += 2) {
      const hw = 6 + (y - 106) * .5;
      px(LAMP - hw, y, hw * 2, 2, "rgb(24, 20, 9)"); px(LAMP - hw * .6, y, hw * 1.2, 2, "rgb(18, 15, 7)");
    }
    for (let y = GROUND + 16; y < H - SKY_H; y += 3) {
      px(8 + (y % 5), y, 100, 1, "rgb(20, 44, 48)");
      if (neon) px(236 + (y % 7), y, 74, 1, "rgb(48, 18, 14)");
      if (lamp) px(LAMP - 36 + (y % 5), y, 72, 1, "rgb(26, 22, 9)");
    }
    g.globalCompositeOperation = "source-over";
    if (!neon) { g.fillStyle = "rgba(10, 12, 36, .78)"; g.fillRect(BX_SIGN + 2, 70, 86, 38); }
    px(LAMP - 4, 104, 8, 2, lamp ? "#fff1b0" : "#4b4620");
    // 불빛에 모이는 나방
    for (const m of MOTHS) {
      const a = m.a + (t / 1000) * m.sp, x = LAMP + Math.cos(a) * m.r, y = 116 + Math.sin(a * 1.7) * m.r * .6, f = Math.floor(t / 90 + m.a) % 2;
      px(x - 1, y, 3, 1, "#d6cfc0"); px(x - (f ? 2 : 1), y - 1, 2, 1, "#a8a29e"); px(x + (f ? 1 : 0), y - 1, 2, 1, "#a8a29e");
    }
    // 사람과 말풍선은 따로 그려 밤빛을 입힌다
    const fg = FIGURE.getContext("2d"), fp = brush(fg), bob = Math.round(Math.sin(t / 700) * 1.4);
    fg.clearRect(0, 0, 70, 100);
    worker(fp, 35, 96, t);
    bubble(fp, 37, 26 + bob);
    fg.globalCompositeOperation = "source-atop"; fg.fillStyle = "rgba(20, 24, 66, .22)"; fg.fillRect(0, 0, 70, 100); fg.globalCompositeOperation = "source-over";
    g.drawImage(FIGURE, 215, 98);
    g.restore();
  }

  return { drawScene, width: W, height: H };
})();
