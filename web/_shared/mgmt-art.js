// 매니지먼트 게임 그림 — 아케이드 입구 배너 · 매니지먼트 모음 페이지가 같이 쓴다 (SVG, 직접 그림)
// HKMgmtArt.scene(key) → <svg> 글자 (key: civ · cafe · farm) · HKMgmtArt.tone(key) → { deep, main, soft }
window.HKMgmtArt = (function () {
  const TONE = {
    civ: { deep: "#0b1f3a", main: "#3b82f6", soft: "#bfdbfe" },
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

  function civ() {
    const r = 30, w = Math.sqrt(3) * r;
    const cells = [];
    const fills = ["#1e3a8a", "#1d4ed8", "#166534", "#0e7490", "#334155", "#1e40af", "#15803d"];
    let k = 0;
    for (let row = -2; row <= 2; row++) {
      for (let col = -3; col <= 3; col++) {
        const q = col - Math.floor(row / 2);
        if (Math.abs(q) + Math.abs(row) + Math.abs(-q - row) > 6) continue;
        const cx = 200 + col * w + (row & 1 ? w / 2 : 0), cy = 168 + row * r * 1.5;
        const near = Math.abs(col) + Math.abs(row) <= 2;
        cells.push(`<polygon points="${hex(cx, cy, r - 1.5)}" fill="${near ? fills[k++ % fills.length] : "#0f172a"}" stroke="${near ? "#93c5fd" : "#1e293b"}" stroke-width="1.5" opacity="${near ? 1 : .7}"/>`);
      }
    }
    return `<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs><linearGradient id="mgc-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1f3a"/><stop offset="1" stop-color="#1e3a8a"/></linearGradient></defs>
      <rect width="400" height="300" fill="url(#mgc-sky)"/>
      <g opacity=".35" fill="#bfdbfe"><circle cx="40" cy="30" r="1.5"/><circle cx="120" cy="18" r="1"/><circle cx="330" cy="26" r="1.5"/><circle cx="370" cy="60" r="1"/><circle cx="260" cy="14" r="1"/></g>
      ${cells.join("")}
      <!-- 본사 빌딩 -->
      <g transform="translate(200 168)">
        <rect x="-16" y="-58" width="32" height="58" rx="3" fill="#e2e8f0"/>
        <rect x="-16" y="-58" width="32" height="8" fill="#3b82f6"/>
        ${[0, 1, 2, 3, 4].map((i) => `<rect x="-11" y="${-44 + i * 9}" width="7" height="5" fill="#fde68a"/><rect x="4" y="${-44 + i * 9}" width="7" height="5" fill="${i % 2 ? "#fde68a" : "#94a3b8"}"/>`).join("")}
        <rect x="-26" y="-22" width="12" height="22" rx="2" fill="#cbd5e1"/><rect x="14" y="-30" width="13" height="30" rx="2" fill="#cbd5e1"/>
        <line x1="0" y1="-58" x2="0" y2="-74" stroke="#e2e8f0" stroke-width="2"/><path d="M0 -74 L14 -69 L0 -64 Z" fill="#f59e0b"/>
      </g>
      <!-- 작은 건물들 -->
      <g fill="#f8fafc"><rect x="${200 - w - 8}" y="150" width="16" height="16" rx="2"/><rect x="${200 + w - 8}" y="150" width="16" height="16" rx="2"/><rect x="${200 + w / 2 - 7}" y="${168 + 45 - 18}" width="14" height="14" rx="2"/></g>
      <g fill="#86efac"><circle cx="${200 - w / 2}" cy="${168 + 45 - 6}" r="7"/><circle cx="${200 - w / 2 + 9}" cy="${168 + 45 - 2}" r="5"/></g>
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
