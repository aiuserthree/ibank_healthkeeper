// 레트로 오락실 — 옛날 오락실풍 횡스크롤 게임 모음의 작은 픽셀 그림(아케이드 입구 배너 · /retro 머리 그림)
//
// HKRetroArt.keys            게임 키 — 최근에 만든 게임부터(새 게임은 맨 앞에)
// HKRetroArt.tone(key)       { deep, main } — 바탕색 · 강조색
// HKRetroArt.scene(key, fit) 3:4 픽셀 그림 SVG 문자열(16 × 20 칸). fit="meet" 이면 넓은 칸에서도 잘리지 않게 가운데에 통째로
// HKRetroArt.shot(key)       실제 게임 장면(/assets/lounge/{key}.jpg)을 칸에 맞춰 자른 그림 — 주인공이 보이는 쪽으로. 못 불러오면 픽셀 그림이 보인다
window.HKRetroArt = (function () {
  // 그림 — 글자 한 칸이 픽셀 하나. 점(.)은 비움. 아래쪽에 붙여 그린다(위는 하늘)
  const ART = {
    fighter: {
      tone: { deep: "#1e1b4b", main: "#db2777", sky: ["#312e81", "#1e1b4b"] },
      pal: { h: "#111827", s: "#f9c99a", w: "#f8fafc", b: "#1d4ed8", r: "#ef4444", y: "#facc15", m: "#22c55e", e: "#ffffff", k: "#14532d", f: "#4c1d95", g: "#3b0764" },
      rows: [
        "..........y.....",
        "....hhh..yyy....",
        "...hhhh.yyyyy...",
        "...hss....y.....",
        "...sss..........",
        "..wwwwrr...mmm..",
        ".wwwww....mmmmm.",
        ".wwwww....mekek.",
        "..www.....mmmmm.",
        "..bbb.....mmmmm.",
        "..b.b.....m.m.m.",
        ".bb.bb..........",
        "ffffffffffffffff",
        "gfgfgfgfgfgfgfgf",
      ],
    },
    vitamin: {
      tone: { deep: "#14532d", main: "#f97316", sky: ["#166534", "#052e16"] },
      pal: { g: "#15803d", s: "#f9c99a", o: "#f97316", K: "#334155", y: "#fde047", v: "#a855f7", V: "#ffffff", n: "#1e3a8a", d: "#78350f", D: "#451a03" },
      rows: [
        "..gg............",
        ".gggg...........",
        ".gss........vvv.",
        ".ss........vVvVv",
        ".oooKKKK.y.vvvvv",
        ".ooo........v.v.",
        ".ooo............",
        ".nn.............",
        ".n.n............",
        "nn.nn...........",
        "dddddddddddddddd",
        "DdDdDdDdDdDdDdDd",
      ],
    },
    jumper: {
      tone: { deep: "#0369a1", main: "#facc15", sky: ["#38bdf8", "#0284c7"] },
      pal: { p: "#e5e7eb", F: "#ef4444", h: "#111827", s: "#f9c99a", t: "#facc15", c: "#1e3a8a", G: "#f472b6", Y: "#ffffff", g: "#22c55e", b: "#92400e" },
      rows: [
        "............pFF.",
        "............pFF.",
        "...hh.......p...",
        "..hsss......p...",
        "..sss.......p...",
        "..tttt......p...",
        ".s.tt.s.....p...",
        "...cc.......p...",
        "..c..c......p...",
        "............p...",
        ".....GGG....p...",
        ".....GYG...ppp..",
        "gggggggggggggggg",
        "bbbbbbbbbbbbbbbb",
      ],
    },
    paperjet: {
      tone: { deep: "#312e81", main: "#38bdf8", sky: ["#1e1b4b", "#4338ca"] },
      pal: { "*": "#fde68a", D: "#94a3b8", R: "#ef4444", W: "#ffffff", w: "#cbd5e1", "-": "#38bdf8", c: "#a5b4fc" },
      rows: [
        "..*..........*..",
        "................",
        "......*.........",
        "..........DDD...",
        "..........RDD...",
        "................",
        "WW..............",
        "WWWW...--..--...",
        ".WWWWWW.........",
        "WWWWw...........",
        "WW..............",
        "................",
        "cccc......cccccc",
        "cccccccccccccccc",
      ],
    },
  };
  const W = 16, H = 20;
  const keys = ["paperjet", "fighter", "vitamin", "jumper"]; // 게임 목록(game.py)과 같은 순서 — 종이비행기 편대를 맨 앞에

  function scene(key, fit = "slice") {
    const a = ART[key];
    if (!a) return "";
    const top = H - a.rows.length;
    let px = "";
    a.rows.forEach((row, y) => {
      for (let x = 0; x < row.length && x < W; x++) {
        const c = a.pal[row[x]];
        if (c) px += `<rect x="${x}" y="${top + y}" width="1.02" height="1.02" fill="${c}"/>`;
      }
    });
    const id = `hkra-${key}`;
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax ${fit === "meet" ? "meet" : "slice"}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a.tone.sky[0]}"/><stop offset="1" stop-color="${a.tone.sky[1]}"/></linearGradient></defs>
      <rect width="${W}" height="${H}" fill="url(#${id})"/>
      ${[2, 5, 8, 11, 14, 17].map((y) => `<rect x="0" y="${y}" width="${W}" height=".25" fill="#000" opacity=".12"/>`).join("")}
      ${px}
    </svg>`;
  }
  // 실제 장면 — 2:1 그림을 3:4 칸에 자를 때 주인공 쪽(가로 %)을 보여 준다
  const FOCUS = { fighter: 74, vitamin: 38, jumper: 29, paperjet: 12 };
  function shot(key) {
    return `${scene(key)}<img src="/assets/lounge/${key}.jpg" alt="" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${FOCUS[key] ?? 50}% 50%" onerror="this.remove()">`;
  }
  return { keys, scene, shot, tone: (k) => (ART[k] || ART.fighter).tone };
})();
