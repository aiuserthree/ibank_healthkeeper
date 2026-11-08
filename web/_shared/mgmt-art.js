// 매니지먼트 게임 그림 — 아케이드 입구 배너 · 매니지먼트 모음 페이지가 같이 쓴다 (SVG, 직접 그림)
// HKMgmtArt.scene(key) → <svg> 글자 (key: civ(오피스 타운) · cafe · farm) · HKMgmtArt.tone(key) → { deep, main, soft }
window.HKMgmtArt = (function () {
  const TONE = {
    civ: { deep: "#9fd8ff", main: "#3aa0ff", soft: "#dff1ff" },
    cafe: { deep: "#3b1d12", main: "#f59e0b", soft: "#fde68a" },
    farm: { deep: "#0f2e1d", main: "#22c55e", soft: "#bbf7d0" },
  };

  // 육각형 한 칸 (뾰족한 위)
  const hex = (cx, cy, r) => {
    const p = [];
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 180 * (60 * i - 90);
      p.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
    }
    return p.join(" ");
  };

  // 오피스 타운 — 비스듬히 내려다본 네모 블록 동네(파스텔 장난감 집 · 둥근 나무 · 길 · 가운데 사옥)
  function civ() {
    const T = 34, H = 17; // 칸 반폭 · 반높이 (2:1 마름모)
    const ox = 200, oy = 96;
    const iso = (x, y) => [ox + (x - y) * T, oy + (x + y) * H];
    const poly = (pts) => pts.map((p) => p.map((v) => v.toFixed(1)).join(",")).join(" ");
    const tile = (x, y, top, side) => {
      const [cx, cy] = iso(x, y), d = 7;
      const t = [[cx, cy - H], [cx + T, cy], [cx, cy + H], [cx - T, cy]];
      return `<polygon points="${poly([[cx - T, cy], [cx, cy + H], [cx, cy + H + d], [cx - T, cy + d]])}" fill="${side}"/>`
        + `<polygon points="${poly([[cx, cy + H], [cx + T, cy], [cx + T, cy + d], [cx, cy + H + d]])}" fill="${side}" opacity=".8"/>`
        + `<polygon points="${poly(t)}" fill="${top}"/>`;
    };
    // 상자 하나(벽 두 면 + 지붕) — w·h 는 바닥 반폭 비율, z 는 높이
    const box = (x, y, z, wall, roof, k = 0.55) => {
      const [cx, cy] = iso(x, y), w = T * k, h = H * k;
      const L = [cx - w, cy], R = [cx + w, cy], F = [cx, cy + h], B = [cx, cy - h];
      const up = (p) => [p[0], p[1] - z];
      return `<polygon points="${poly([L, F, up(F), up(L)])}" fill="${wall}"/>`
        + `<polygon points="${poly([F, R, up(R), up(F)])}" fill="${wall}" style="filter:brightness(.86)"/>`
        + `<polygon points="${poly([up(L), up(F), up(R), up(B)])}" fill="${roof}"/>`;
    };
    // 뾰족 지붕 집
    const house = (x, y, wall, roof) => {
      const [cx, cy] = iso(x, y), w = T * 0.42, h = H * 0.42, z = 16, rz = 15;
      const L = [cx - w, cy - z], R = [cx + w, cy - z], F = [cx, cy + h - z], B = [cx, cy - h - z];
      return box(x, y, z, wall, wall, 0.42)
        + `<polygon points="${poly([L, F, [cx, cy - z - rz + h * 0.2]])}" fill="${roof}"/>`
        + `<polygon points="${poly([F, R, [cx, cy - z - rz + h * 0.2]])}" fill="${roof}" style="filter:brightness(.85)"/>`
        + `<rect x="${cx - 4}" y="${cy - 9}" width="5" height="5" rx="1" fill="#fff7d6"/>`;
    };
    const tree = (x, y, dx = 0, dy = 0, c = "#5cc87a") => {
      const [cx, cy] = iso(x, y);
      return `<rect x="${cx + dx - 1.5}" y="${cy + dy - 10}" width="3" height="10" fill="#a86b3c"/><circle cx="${cx + dx}" cy="${cy + dy - 15}" r="8" fill="${c}"/><circle cx="${cx + dx - 2.5}" cy="${cy + dy - 18}" r="3" fill="#fff" opacity=".35"/>`;
    };
    const G = "#9be37f", GS = "#6fb85a", ROAD = "#d9dee8", RS = "#aeb6c6";
    const map = [
      "TGHGT",
      "HRRRH",
      "GRQRP",
      "HRRRH",
      "TGHGW",
    ];
    let ground = "", things = [];
    const roofs = ["#ff8a7a", "#7fd6c2", "#ffd36e", "#8cc4ff", "#c6a8ff", "#ffb38a"];
    let ri = 0;
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
      const c = map[y][x];
      const road = c === "R";
      ground += tile(x, y, road ? ROAD : c === "W" ? "#7fd3f0" : G, road ? RS : c === "W" ? "#4fb0d6" : GS);
      const [cx, cy] = iso(x, y);
      if (road) things.push({ z: x + y, s: `<line x1="${cx - T * 0.5}" y1="${cy}" x2="${cx + T * 0.5}" y2="${cy}" stroke="#fff" stroke-width="2" stroke-dasharray="4 4" opacity=".9"/>` });
      if (c === "H") things.push({ z: x + y + 0.5, s: house(x, y, "#fff8ee", roofs[ri++ % roofs.length]) });
      if (c === "T") things.push({ z: x + y + 0.5, s: tree(x, y, -8, 2) + tree(x, y, 8, -2, "#4fb36b") });
      if (c === "P") things.push({ z: x + y + 0.5, s: tree(x, y, 0, 0, "#7bd389") + `<circle cx="${cx + 12}" cy="${cy + 2}" r="3" fill="#ff9ec4"/><circle cx="${cx - 12}" cy="${cy + 3}" r="3" fill="#ffd36e"/>` });
      if (c === "G") things.push({ z: x + y + 0.4, s: `<circle cx="${cx - 6}" cy="${cy}" r="2.5" fill="#ff9ec4"/><circle cx="${cx + 5}" cy="${cy + 3}" r="2.5" fill="#fff"/><circle cx="${cx + 2}" cy="${cy - 4}" r="2.5" fill="#ffd36e"/>` });
      if (c === "W") things.push({ z: x + y + 0.4, s: `<path d="M${cx - 12} ${cy} q6 -4 12 0 t12 0" stroke="#fff" stroke-width="2" fill="none" opacity=".8"/>` });
      if (c === "Q") {
        // 가운데 사옥 — 층층이 쌓인 귀여운 빌딩 + 깃발
        const s1 = box(x, y, 26, "#eef4ff", "#cfe0ff", 0.62), s2 = box(x, y, 0, "#fff", "#fff", 0.01);
        const [qx, qy] = iso(x, y);
        let win = "";
        for (let i = 0; i < 3; i++) win += `<rect x="${qx - 15}" y="${qy - 22 + i * 7}" width="5" height="4" rx="1" fill="#8cc4ff"/><rect x="${qx + 6}" y="${qy - 24 + i * 7}" width="5" height="4" rx="1" fill="#ffd36e"/>`;
        const top = box(x, y, 0, "#fff", "#fff", 0.01);
        const tower = (() => { const [tx, ty] = iso(x, y); return `<g transform="translate(0 -26)">${box(x, y, 22, "#ffffff", "#ff8a7a", 0.4)}</g>`; })();
        things.push({ z: x + y + 0.6, s: s1 + win + tower + s2 + top + `<line x1="${qx}" y1="${qy - 48}" x2="${qx}" y2="${qy - 64}" stroke="#7a8597" stroke-width="2"/><path d="M${qx} ${qy - 64} l12 4 l-12 4 z" fill="#ff6b6b"/>` });
      }
    }
    // 길 위 작은 차 둘
    const car = (x, y, col) => { const [cx, cy] = iso(x, y); return `<g transform="translate(${cx} ${cy - 3})"><rect x="-7" y="-4" width="14" height="7" rx="3" fill="${col}"/><rect x="-4" y="-7" width="8" height="4" rx="2" fill="#fff" opacity=".9"/></g>`; };
    things.push({ z: 3.1, s: car(1, 2, "#ff8a7a") }, { z: 5.1, s: car(3, 2, "#8cc4ff") });
    things.sort((a, b) => a.z - b.z);
    return `<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs><linearGradient id="mgc-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe6ff"/><stop offset="1" stop-color="#eaf7ff"/></linearGradient></defs>
      <rect width="400" height="300" fill="url(#mgc-sky)"/>
      <g fill="#fff" opacity=".95"><ellipse cx="70" cy="40" rx="30" ry="10"/><ellipse cx="92" cy="34" rx="18" ry="10"/><ellipse cx="320" cy="56" rx="34" ry="11"/><ellipse cx="340" cy="48" rx="18" ry="9"/></g>
      <g fill="#d8ecfb"><rect x="10" y="150" width="34" height="70" rx="4"/><rect x="48" y="128" width="26" height="92" rx="4"/><rect x="330" y="140" width="30" height="80" rx="4"/><rect x="362" y="160" width="30" height="60" rx="4"/></g>
      <g transform="translate(0 46)">${ground}${things.map((t) => t.s).join("")}</g>
    </svg>`;
  }

  function cafe() {
    return `<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs><linearGradient id="mgf-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7c2d12"/><stop offset=".55" stop-color="#f97316"/><stop offset="1" stop-color="#fcd34d"/></linearGradient></defs>
      <rect width="400" height="300" fill="url(#mgf-sky)"/>
      <circle cx="300" cy="150" r="34" fill="#fde68a" opacity=".9"/>
      <g fill="#7c2d12" opacity=".55"><rect x="0" y="150" width="40" height="80"/><rect x="44" y="120" width="34" height="110"/><rect x="82" y="160" width="46" height="70"/><rect x="330" y="130" width="30" height="100"/><rect x="364" y="165" width="36" height="65"/></g>
      <!-- 전구 줄 -->
      <path d="M0 60 Q100 100 200 62 T400 64" fill="none" stroke="#451a03" stroke-width="2"/>
      ${[30, 70, 110, 150, 190, 230, 270, 310, 350, 390].map((x, i) => `<circle cx="${x}" cy="${62 + Math.sin(i * 0.9) * 14 + 12}" r="5" fill="#fef08a"/>`).join("")}
      <!-- 옥상 바닥 · 난간 -->
      <rect x="0" y="228" width="400" height="72" fill="#78350f"/>
      <rect x="0" y="222" width="400" height="8" fill="#451a03"/>
      ${Array.from({ length: 21 }, (_, i) => `<rect x="${i * 20}" y="196" width="3" height="28" fill="#451a03"/>`).join("")}
      <rect x="0" y="194" width="400" height="4" fill="#451a03"/>
      <!-- 파라솔 · 테이블 -->
      <path d="M90 140 Q140 96 190 140 Z" fill="#fef3c7"/><path d="M90 140 Q115 118 140 140 Z" fill="#f43f5e"/><path d="M140 140 Q165 118 190 140 Z" fill="#f43f5e"/>
      <rect x="138" y="140" width="4" height="100" fill="#451a03"/>
      <ellipse cx="140" cy="240" rx="40" ry="8" fill="#fef3c7"/>
      <rect x="250" y="210" width="80" height="34" rx="6" fill="#fef3c7"/><rect x="250" y="200" width="80" height="12" rx="4" fill="#f59e0b"/>
      <!-- 컵 · 김 -->
      <g transform="translate(290 172)"><rect x="-14" y="0" width="28" height="28" rx="5" fill="#fff"/><path d="M14 6 q10 0 10 9 q0 9 -10 9" fill="none" stroke="#fff" stroke-width="4"/><rect x="-14" y="8" width="28" height="6" fill="#f59e0b"/>
        <path d="M-6 -6 q-6 -8 0 -16 M6 -6 q-6 -8 0 -16" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".8"/></g>
      <g fill="#16a34a"><circle cx="40" cy="214" r="14"/><circle cx="54" cy="206" r="11"/></g><rect x="32" y="214" width="26" height="20" rx="3" fill="#b45309"/>
    </svg>`;
  }

  function farm() {
    const box = (x, y, crop) => `<g transform="translate(${x} ${y})"><rect x="0" y="22" width="110" height="34" rx="5" fill="#92400e"/><rect x="0" y="22" width="110" height="8" fill="#b45309"/><rect x="5" y="16" width="100" height="10" rx="4" fill="#422006"/>${crop}</g>`;
    const sprout = (x) => `<path d="M${x} 18 q-8 -14 -16 -12 q8 2 16 12 q6 -16 16 -14 q-10 4 -16 14" fill="#4ade80"/><rect x="${x - 1}" y="8" width="2" height="12" fill="#16a34a"/>`;
    const tomato = (x) => `<path d="M${x} 18 v-26" stroke="#15803d" stroke-width="3"/><circle cx="${x - 6}" cy="-2" r="6" fill="#ef4444"/><circle cx="${x + 6}" cy="-10" r="6" fill="#ef4444"/><circle cx="${x + 5}" cy="4" r="5" fill="#f97316"/><path d="M${x - 10} -14 q10 -6 20 0" fill="#22c55e"/>`;
    const lettuce = (x) => `<ellipse cx="${x}" cy="12" rx="14" ry="10" fill="#86efac"/><ellipse cx="${x}" cy="10" rx="8" ry="7" fill="#4ade80"/>`;
    return `<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs><linearGradient id="mgt-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7dd3fc"/><stop offset="1" stop-color="#e0f2fe"/></linearGradient></defs>
      <rect width="400" height="300" fill="url(#mgt-sky)"/>
      <circle cx="70" cy="56" r="26" fill="#fde047"/>
      <g fill="#fff" opacity=".9"><ellipse cx="270" cy="48" rx="40" ry="12"/><ellipse cx="300" cy="40" rx="26" ry="12"/><ellipse cx="160" cy="80" rx="28" ry="9"/></g>
      <g fill="#94a3b8" opacity=".6"><rect x="0" y="120" width="50" height="80"/><rect x="300" y="110" width="40" height="90"/><rect x="344" y="134" width="56" height="66"/></g>
      <rect x="0" y="196" width="400" height="104" fill="#d6d3d1"/><rect x="0" y="192" width="400" height="6" fill="#a8a29e"/>
      ${box(24, 150, sprout(26) + sprout(56) + sprout(86))}
      ${box(146, 150, tomato(30) + tomato(78))}
      ${box(268, 150, lettuce(24) + lettuce(56) + lettuce(88))}
      ${box(84, 222, lettuce(28) + sprout(62) + sprout(90))}
      ${box(208, 222, tomato(40) + sprout(84))}
      <!-- 물뿌리개 -->
      <g transform="translate(352 238)"><rect x="-16" y="0" width="30" height="24" rx="5" fill="#3b82f6"/><path d="M14 6 l18 -12 l3 4 l-17 12 z" fill="#3b82f6"/><path d="M-16 4 q-12 0 -12 10 q0 8 12 8" fill="none" stroke="#3b82f6" stroke-width="4"/></g>
    </svg>`;
  }

  const SCENES = { civ, cafe, farm };
  return {
    scene: (key) => (SCENES[key] ? SCENES[key]() : ""),
    tone: (key) => TONE[key] || TONE.civ,
    keys: Object.keys(SCENES),
  };
})();
