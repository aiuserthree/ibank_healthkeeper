// 부서 대항 레이드 — 매주(월 00:00 ~ 일 24:00, 한국 시간) 부서마다 같은 보스를 하나씩 맡아 누가 먼저 쓰러뜨리나 겨룬다.
// 아케이드에서 한 판 할 때마다 우리 부서 보스에게 공격이 들어간다. 한 사람이 하루에 넣을 수 있는 공격은 정해져 있어서
// 몇 사람이 오래 하는 것보다 여럿이 조금씩 하는 쪽이 세다. 다른 부서 동료와 협동 · 대전하면 두 부서 모두 보너스.
//
// window.HKRaid = {
//   load() → GET /api/play/raid 의 data
//   mount(container, { profile }) → 불러와서 그리고, 화면이 보이는 동안 60초마다 새로 고친다 (/raid 화면이 쓴다)
//   render(container, data, opts) → 전체 화면을 그린다. 같은 보스로 다시 부르면 바뀐 칸만 고쳐 그린다(보스 그림은 그대로)
//     opts = { profile?: /me/profile, playStatus?: /play/status, prev?: 앞서 그린 data }
//   renderWidget(container, data?) → 다른 화면(/together · /arcade)에 넣는 작은 카드. data 가 없으면 직접 불러온다.
//     불러오지 못하면 칸을 비우고 숨긴다. Promise 를 돌려준다
//   bossArt(key, { still }) → 보스 그림(인라인 SVG 문자열). still: 움직임 없이
//   bossPalette(key) → 보스 색 { body, dark, light, accent, sky1, sky2, glow }
//   BOSS_KEYS → 보스 key 8개 (ISO 주 번호로 돌아가며 나온다 — 정하는 건 서버)
// }
// 움직임 줄이기(prefers-reduced-motion)를 켠 사람에게는 보스 그림 · 막대가 움직이지 않는다.
window.HKRaid = (function () {
  const API_PATH = "/play/raid";
  const REFRESH_MS = 60 * 1000;
  const SHOW_ROWS = 10; // 부서 줄은 처음에 10개까지만 (우리 부서는 늘 보인다)
  const WEEK_GRACE = 5000; // 월요일 0시가 지나고 이만큼 뒤에 새 보스를 부른다
  // 부서 대항전에서 빼는 부서 — 서버 fun_stats.DEPARTMENT_RANKING_EXCLUDED 와 같게. 서버가 excludedReason 을 안 줄 때만 쓴다
  const EXCLUDED_DEPTS = ["(주)아이뱅크"];

  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (n) => Math.round(Number(n) || 0).toLocaleString("ko-KR");
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const reduce = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (_) { return false; } };
  // 「동료랑 같이」 — 함께하기(/together)는 아직 로컬에서만 연다. 운영에서는 공개된 대전(사내 오목)으로
  const peersHref = () => (window.HKLunch && HKLunch.isLocal() ? "/together" : "/games/gomoku");
  const withPeers = () => (window.HKLunch && HKLunch.isLocal() ? "협동 · 대전" : "대전"); // 협동은 아직 로컬에서만
  const icon = (name, size = 16) => (window.HKUI ? HKUI.icon(name, size, "currentColor") : "");

  // ── 보스 그림 ────────────────────────────────────────────────
  // 모두 240×240 평면 그림 — 둥근 몸, 흰자가 큰 눈, 성난 눈썹, 작은 송곳니. 귀엽지만 얕보면 안 되는 사무실 · 건강의 적들.
  const INK = "#1e1b2e";
  const PAL = {
    monday_dragon: { body: "#6366f1", dark: "#4338ca", deep: "#312e81", light: "#c7d2fe", belly: "#e0e7ff", accent: "#fbbf24", sky1: "#1e1b4b", sky2: "#07061a", glow: "#818cf8" },
    flu_virus: { body: "#84cc16", dark: "#4d7c0f", deep: "#365314", light: "#d9f99d", accent: "#facc15", sky1: "#14301a", sky2: "#04100a", glow: "#a3e635" },
    overtime_golem: { body: "#64748b", dark: "#334155", deep: "#1e293b", light: "#94a3b8", accent: "#fde047", sky1: "#172036", sky2: "#050913", glow: "#fde047" },
    turtle_neck: { body: "#2dd4bf", dark: "#0f766e", deep: "#134e4a", light: "#99f6e4", accent: "#38bdf8", sky1: "#0b3b3a", sky2: "#03100f", glow: "#5eead4" },
    deadline_storm: { body: "#5b6b82", dark: "#334155", deep: "#1e293b", light: "#94a3b8", accent: "#facc15", sky1: "#1c2333", sky2: "#06080f", glow: "#facc15" },
    dust_cloud: { body: "#b5aca3", dark: "#857a70", deep: "#57534e", light: "#e7e2dc", accent: "#f59e0b", sky1: "#3a2e22", sky2: "#100b07", glow: "#fbbf24" },
    sleepy_lord: { body: "#8b5cf6", dark: "#6d28d9", deep: "#3b0764", light: "#ddd6fe", accent: "#f0abfc", sky1: "#2a0f55", sky2: "#0a0418", glow: "#c084fc" },
    stress_slime: { body: "#fb7185", dark: "#e11d48", deep: "#881337", light: "#fecdd3", accent: "#fde047", sky1: "#4a0a1f", sky2: "#120208", glow: "#fb7185" },
  };
  const BOSS_NAMES = {
    monday_dragon: "월요병 드래곤", flu_virus: "독감 바이러스 대왕", overtime_golem: "야근 골렘", turtle_neck: "거북목 거인",
    deadline_storm: "마감 폭풍", dust_cloud: "미세먼지 구름", sleepy_lord: "졸음 마왕", stress_slime: "스트레스 슬라임",
  };
  const BOSS_KEYS = Object.keys(PAL);
  const palOf = (key) => PAL[key] || PAL.stress_slime;

  // 눈 하나 — kind: round(동그란 눈) · lid(눈꺼풀이 반쯤 · 심통) · sleepy(졸린 눈) · sly(가늘게 뜬 눈)
  // side: -1 왼눈, 1 오른눈 (눈썹 · 눈꺼풀 기울기가 가운데로 내려가게)
  function eye(x, y, r, side, o = {}) {
    const kind = o.kind || "round";
    const ry = kind === "sly" ? r * 0.62 : r * 1.05;
    const lx = (o.lookX || 0) * r, ly = (o.lookY || 0) * r;
    let s = `<g class="rb-eye"><ellipse cx="${x}" cy="${y}" rx="${r}" ry="${ry}" fill="${o.white || "#fff"}"/>`;
    s += `<circle cx="${x + lx}" cy="${y + ly + r * 0.08}" r="${r * (kind === "sly" ? 0.46 : 0.56)}" fill="${INK}"/>`;
    s += `<circle cx="${x + lx - r * 0.2}" cy="${y + ly - r * 0.16}" r="${r * 0.19}" fill="#fff"/></g>`;
    if (kind === "lid" || kind === "sleepy") {
      // 눈꺼풀 — 눈 둘레 원의 위쪽을 덮는다. c 는 눈꺼풀 끝선 높이(가운데 기준, 아래가 +)
      const R = r * 1.1 + 0.6, c = kind === "sleepy" ? r * 0.18 : -r * 0.22;
      const w = Math.sqrt(R * R - c * c);
      const tilt = (o.tilt != null ? o.tilt : 14) * -side;
      s += `<g transform="rotate(${tilt} ${x} ${y})"><path d="M${x - w} ${y + c} A${R} ${R} 0 ${c > 0 ? 1 : 0} 1 ${x + w} ${y + c}Z" fill="${o.lid}"/>`;
      s += `<path d="M${x - w + 1} ${y + c} L${x + w - 1} ${y + c}" stroke="${INK}" stroke-width="${r * 0.22}" stroke-linecap="round"/></g>`;
    }
    if (o.brow !== false) {
      // 성난 눈썹 — 가운데 쪽 끝이 낮다
      const ox = x + side * r * 1.05, ix = x - side * r * 0.9;
      const oy = y - r * (o.browUp || 1.35), iy = y - r * ((o.browUp || 1.35) - 0.58);
      s += `<path d="M${ox} ${oy} L${ix} ${iy}" stroke="${o.browColor || INK}" stroke-width="${r * 0.42}" stroke-linecap="round"/>`;
    }
    return s;
  }
  const eyes = (cx, y, gap, r, o) => eye(cx - gap, y, r, -1, o) + eye(cx + gap, y, r, 1, o);
  // 송곳니가 보이는 벌린 입
  function fangMouth(x, y, w, h, o = {}) {
    const fy = y + h * 0.19;
    return `<path d="M${x - w} ${y} Q${x} ${y + h * 1.6} ${x + w} ${y} Q${x} ${y + h * 0.5} ${x - w} ${y}Z" fill="${o.fill || "#3a0d1d"}"/>`
      + `<path d="M${x - w * 0.62} ${fy} q4 0 7 -0.6 l-3.2 ${h * 0.62}z M${x + w * 0.62} ${fy} q-4 0 -7 -0.6 l3.2 ${h * 0.62}z" fill="#fff"/>`;
  }
  const blush = (x1, x2, y, color = "#f472b6", op = 0.38) => `<ellipse cx="${x1}" cy="${y}" rx="8" ry="4.5" fill="${color}" opacity="${op}"/><ellipse cx="${x2}" cy="${y}" rx="8" ry="4.5" fill="${color}" opacity="${op}"/>`;
  const steam = (x, y, color = "#fff") => `<g class="rb-steam" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" opacity=".75"><path d="M${x} ${y} q-5 -6 0 -12 q5 -6 0 -12"/><path d="M${x + 10} ${y + 2} q-5 -6 0 -12 q5 -6 0 -12" style="animation-delay:-1.1s"/></g>`;

  const ART = {
    // 월요병 드래곤 — 월요일 달력을 배에 붙이고 커피를 쥔 심통 난 남색 용
    monday_dragon(p) {
      return `<path d="M156 196 Q206 204 214 168 Q218 148 200 142 Q208 158 198 172 Q184 186 154 180Z" fill="${p.dark}"/>
        <path d="M199 143 l15 -10 l-3 16z" fill="${p.accent}"/>
        <g class="rb-wl"><path d="M78 122 Q36 92 26 124 Q42 120 44 134 Q55 125 60 140 Q70 130 84 144Z" fill="${p.dark}"/><path d="M76 128 Q50 112 40 124" stroke="${p.deep}" stroke-width="2.5" fill="none" opacity=".5"/></g>
        <g class="rb-wr"><path d="M162 122 Q204 92 214 124 Q198 120 196 134 Q185 125 180 140 Q170 130 156 144Z" fill="${p.dark}"/><path d="M164 128 Q190 112 200 124" stroke="${p.deep}" stroke-width="2.5" fill="none" opacity=".5"/></g>
        <ellipse cx="94" cy="212" rx="21" ry="12" fill="${p.dark}"/><ellipse cx="146" cy="212" rx="21" ry="12" fill="${p.dark}"/>
        <g fill="#fff"><circle cx="81" cy="218" r="3"/><circle cx="90" cy="221" r="3"/><circle cx="99" cy="221" r="3"/><circle cx="141" cy="221" r="3"/><circle cx="150" cy="221" r="3"/><circle cx="159" cy="218" r="3"/></g>
        <ellipse cx="120" cy="160" rx="62" ry="56" fill="${p.body}"/>
        <ellipse cx="120" cy="170" rx="40" ry="40" fill="${p.belly}"/>
        <path d="M92 194 Q120 202 148 194 M98 204 Q120 210 142 204" stroke="${p.light}" stroke-width="3" fill="none" stroke-linecap="round"/>
        <g transform="rotate(-7 120 168)"><rect x="103" y="150" width="34" height="36" rx="6" fill="#fff" stroke="${p.light}" stroke-width="2"/><path d="M103 156 a6 6 0 0 1 6 -6 h22 a6 6 0 0 1 6 6 v6 h-34z" fill="#ef4444"/><circle cx="111" cy="150" r="2.4" fill="${p.deep}"/><circle cx="129" cy="150" r="2.4" fill="${p.deep}"/><text x="120" y="181" text-anchor="middle" font-size="16" font-weight="900" fill="${INK}" font-family="Pretendard, sans-serif">월</text></g>
        <ellipse cx="70" cy="164" rx="12" ry="18" transform="rotate(28 70 164)" fill="${p.body}"/>
        <path d="M168 150 h24 l-3 30 a4 4 0 0 1 -4 4 h-10 a4 4 0 0 1 -4 -4z" fill="#fff"/><path d="M191 157 q10 0 9 9 q-1 8 -10 8" stroke="#fff" stroke-width="4" fill="none"/><rect x="170" y="160" width="20" height="7" fill="#a16207"/>
        ${steam(176, 144, "#e2e8f0")}
        <ellipse cx="170" cy="170" rx="11" ry="15" transform="rotate(-20 170 170)" fill="${p.body}"/>
        <path d="M86 52 Q70 26 80 12 Q88 34 102 46Z" fill="${p.accent}"/><path d="M154 52 Q170 26 160 12 Q152 34 138 46Z" fill="${p.accent}"/>
        <path d="M70 80 Q48 70 50 92 Q60 90 72 98Z" fill="${p.dark}"/><path d="M170 80 Q192 70 190 92 Q180 90 168 98Z" fill="${p.dark}"/>
        <ellipse cx="120" cy="86" rx="54" ry="46" fill="${p.body}"/>
        <path d="M108 42 l6 -12 l6 12z M120 40 l6 -13 l6 13z" fill="${p.dark}" transform="translate(-6 2)"/>
        <ellipse cx="120" cy="108" rx="31" ry="20" fill="${p.light}"/>
        <ellipse cx="109" cy="101" rx="3.4" ry="2.4" fill="${p.deep}"/><ellipse cx="131" cy="101" rx="3.4" ry="2.4" fill="${p.deep}"/>
        <path d="M105 116 Q112 111 120 115 Q128 119 135 114" stroke="${p.deep}" stroke-width="3.2" fill="none" stroke-linecap="round"/>
        <path d="M125 116.6 l5 -1.4 l-1.6 7z" fill="#fff"/>
        ${eyes(120, 78, 22, 12.5, { kind: "lid", lid: p.body, tilt: 16 })}
        ${blush(80, 160, 102)}`;
    },
    // 독감 바이러스 대왕 — 왕관을 쓰고 체온계를 홀처럼 든 초록 가시공
    flu_virus(p) {
      const spikes = Array.from({ length: 10 }, (_, i) => {
        const a = ((i * 36 - 72) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
        const x1 = 120 + c * 54, y1 = 130 + s * 54, x2 = 120 + c * 76, y2 = 130 + s * 76;
        return `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="${p.dark}" stroke-width="7" stroke-linecap="round"/><circle cx="${(120 + c * 80).toFixed(1)}" cy="${(130 + s * 80).toFixed(1)}" r="8.5" fill="${p.light}" stroke="${p.dark}" stroke-width="3"/>`;
      }).join("");
      return `<g class="rb-wiggle">${spikes}</g>
        <g class="rb-drift" fill="#7dd3fc" opacity=".85"><circle cx="40" cy="104" r="4"/><circle cx="30" cy="118" r="2.6"/><circle cx="44" cy="124" r="2"/></g>
        <circle cx="120" cy="136" r="60" fill="${p.dark}"/>
        <circle cx="120" cy="130" r="58" fill="${p.body}"/>
        <g fill="${p.dark}" opacity=".35"><circle cx="82" cy="152" r="7"/><circle cx="160" cy="104" r="5.5"/><circle cx="152" cy="170" r="8"/><circle cx="88" cy="102" r="4.5"/><circle cx="120" cy="178" r="4"/></g>
        <path d="M86 98 Q100 80 120 78" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" opacity=".35"/>
        <rect x="90" y="70" width="60" height="12" rx="4" fill="#ca8a04"/>
        <path d="M90 74 L94 44 L107 60 L120 36 L133 60 L146 44 L150 74Z" fill="${p.accent}" stroke="#ca8a04" stroke-width="3" stroke-linejoin="round"/>
        <circle cx="120" cy="60" r="4.5" fill="#ef4444"/><circle cx="103" cy="66" r="3" fill="#38bdf8"/><circle cx="137" cy="66" r="3" fill="#38bdf8"/>
        ${eyes(120, 122, 20, 12.5, { kind: "round", lookX: 0.12 })}
        ${fangMouth(120, 146, 22, 12)}
        ${blush(80, 160, 142, "#ef4444", 0.4)}
        <ellipse cx="66" cy="160" rx="10" ry="14" transform="rotate(30 66 160)" fill="${p.body}"/>
        <g transform="rotate(20 184 140)"><rect x="178" y="84" width="13" height="74" rx="6.5" fill="#fff" stroke="#94a3b8" stroke-width="2"/><rect x="181.5" y="100" width="6" height="58" rx="3" fill="#ef4444"/><g stroke="#94a3b8" stroke-width="1.6"><path d="M178 104 h5 M178 114 h5 M178 124 h5 M178 134 h5"/></g><circle cx="184.5" cy="164" r="11" fill="#ef4444" stroke="#fff" stroke-width="3"/></g>
        <ellipse cx="172" cy="152" rx="10" ry="13" transform="rotate(-24 172 152)" fill="${p.body}"/>`;
    },
    // 야근 골렘 — 모니터 머리에 노란 눈이 빛나는 돌덩이. 밤 11시 시계를 가슴에 박고 커피를 놓지 않는다
    overtime_golem(p) {
      return `<rect x="82" y="182" width="32" height="36" rx="9" fill="${p.dark}"/><rect x="126" y="182" width="32" height="36" rx="9" fill="${p.dark}"/>
        <rect x="76" y="210" width="42" height="12" rx="6" fill="${p.deep}"/><rect x="122" y="210" width="42" height="12" rx="6" fill="${p.deep}"/>
        <rect x="38" y="112" width="34" height="68" rx="13" fill="${p.body}"/>
        <rect x="35" y="168" width="40" height="30" rx="11" fill="${p.light}"/>
        <rect x="64" y="100" width="112" height="94" rx="22" fill="${p.body}"/>
        <path d="M64 168 h112 v4 a22 22 0 0 1 -22 22 h-68 a22 22 0 0 1 -22 -22z" fill="${p.dark}" opacity=".45"/>
        <path d="M84 118 l10 9 l-5 11 M160 160 l-8 6 l3 9" stroke="${p.dark}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="120" cy="146" r="20" fill="#fff" stroke="${p.deep}" stroke-width="5"/>
        <g stroke="${INK}" stroke-linecap="round"><path class="rb-tick" d="M120 146 L120 132" stroke-width="3"/><path d="M120 146 L113 140" stroke-width="4"/></g>
        <circle cx="120" cy="146" r="2.6" fill="#ef4444"/>
        <g transform="rotate(8 156 120)"><rect x="142" y="106" width="30" height="28" rx="2" fill="#fde047"/><text x="157" y="125" text-anchor="middle" font-size="11" font-weight="900" fill="#854d0e" font-family="Pretendard, sans-serif">야근</text></g>
        <rect x="168" y="112" width="34" height="62" rx="13" fill="${p.body}"/>
        <path d="M176 128 h28 l-4 34 a4 4 0 0 1 -4 4 h-12 a4 4 0 0 1 -4 -4z" fill="#fff"/><rect x="174" y="122" width="32" height="7" rx="3.5" fill="#e2e8f0"/><rect x="178" y="140" width="24" height="10" fill="#a16207"/>
        ${steam(184, 116, "#cbd5e1")}
        <rect x="165" y="158" width="40" height="30" rx="11" fill="${p.light}"/>
        <circle cx="70" cy="84" r="6" fill="${p.deep}"/><circle cx="170" cy="84" r="6" fill="${p.deep}"/>
        <rect x="72" y="34" width="96" height="76" rx="18" fill="${p.light}"/>
        <rect x="82" y="44" width="76" height="54" rx="10" fill="${p.deep}"/>
        <rect x="112" y="104" width="16" height="8" rx="2" fill="${p.dark}"/>
        <g class="rb-glow"><path d="M93 62 L113 69 L112 79 Q101 80 93 74Z" fill="${p.accent}"/><path d="M147 62 L127 69 L128 79 Q139 80 147 74Z" fill="${p.accent}"/>
        <path d="M100 89 l6.5 -4 l6.5 4 l6.5 -4 l6.5 4 l6.5 -4 l6.5 4" stroke="${p.accent}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>
        <rect x="86" y="47" width="20" height="4" rx="2" fill="#fff" opacity=".12"/>`;
    },
    // 거북목 거인 — 등껍질을 지고 목을 쭉 뺀 채 휴대폰만 보는 거인. 목이 아프다고 투덜댄다
    turtle_neck(p) {
      return `<ellipse cx="80" cy="210" rx="19" ry="12" fill="${p.dark}"/><ellipse cx="136" cy="210" rx="19" ry="12" fill="${p.dark}"/>
        <path d="M34 178 Q26 86 104 70 Q160 62 170 126 L170 180 Q104 198 34 178Z" fill="#92400e"/>
        <path d="M42 172 Q36 94 104 80 Q154 74 162 128 L162 172 Q102 188 42 172Z" fill="#d97706"/>
        <g fill="#fbbf24" opacity=".85"><path d="M88 96 l14 -7 l14 7 v15 l-14 7 l-14 -7z"/><path d="M60 118 l13 -6 l13 6 v14 l-13 6 l-13 -6z"/><path d="M104 124 l14 -7 l14 7 v15 l-14 7 l-14 -7z"/><path d="M66 150 l13 -6 l13 6 v13 l-13 6 l-13 -6z"/><path d="M130 96 l11 -5 l11 5 v12 l-11 5 l-11 -5z"/></g>
        <path d="M120 102 Q168 102 172 176 Q150 194 118 190 Q130 146 120 102Z" fill="#fde68a"/>
        <path d="M128 130 h38 M124 154 h46 M126 176 h40" stroke="#f59e0b" stroke-width="2.5" opacity=".6"/>
        <path d="M150 112 Q186 96 198 126" stroke="${p.body}" stroke-width="32" fill="none" stroke-linecap="round"/>
        <path d="M156 102 Q182 94 194 112" stroke="${p.light}" stroke-width="3" fill="none" stroke-linecap="round" opacity=".7"/>
        <g class="rb-throb" fill="none" stroke="#ef4444" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M162 80 l5 -9 l4 8 l5 -9"/><path d="M178 86 l7 -5"/></g>
        <path d="M154 154 Q176 166 190 168" stroke="${p.body}" stroke-width="15" fill="none" stroke-linecap="round"/>
        <path d="M184 148 L222 190 L180 196Z" fill="${p.accent}" opacity=".16"/>
        <g transform="rotate(-22 196 172)"><rect x="185" y="154" width="22" height="36" rx="5" fill="#0f172a"/><rect x="188" y="158" width="16" height="27" rx="2.5" fill="${p.accent}"/><rect x="190" y="162" width="10" height="3" rx="1.5" fill="#fff" opacity=".7"/><rect x="190" y="168" width="7" height="3" rx="1.5" fill="#fff" opacity=".5"/></g>
        <ellipse cx="190" cy="172" rx="9" ry="8" fill="${p.body}"/>
        <g transform="rotate(24 206 132)"><ellipse cx="206" cy="132" rx="30" ry="25" fill="${p.body}"/><ellipse cx="214" cy="146" rx="14" ry="6" fill="${p.dark}" opacity=".35"/></g>
        ${eye(196, 126, 9.5, -1, { kind: "lid", lid: p.body, tilt: -4, lookX: 0.25, lookY: 0.32, browUp: 1.45 })}
        ${eye(219, 134, 8.5, 1, { kind: "lid", lid: p.body, tilt: 18, lookX: 0.1, lookY: 0.35, browUp: 1.45 })}
        <path d="M200 150 Q207 146 214 151" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>
        <ellipse cx="190" cy="142" rx="6" ry="3.4" fill="#f472b6" opacity=".4"/>`;
    },
    // 마감 폭풍 — 알람 시계를 이고 번개와 서류를 흩뿌리는 먹구름
    deadline_storm(p) {
      return `<g class="rb-rain" stroke="#93c5fd" stroke-width="3" stroke-linecap="round" opacity=".7"><path d="M66 178 l-5 12"/><path d="M128 184 l-5 12"/><path d="M170 176 l-5 12"/><path d="M98 196 l-5 12"/><path d="M188 196 l-5 12"/></g>
        <path class="rb-flash" d="M92 156 L78 192 L94 190 L82 224 L114 180 L97 182 L108 156Z" fill="${p.accent}" stroke="#eab308" stroke-width="2" stroke-linejoin="round"/>
        <path class="rb-flash is-late" d="M150 160 L141 184 L152 183 L145 206 L166 176 L155 177 L162 160Z" fill="${p.accent}" stroke="#eab308" stroke-width="2" stroke-linejoin="round"/>
        <g fill="${p.dark}" transform="translate(0 7)"><circle cx="68" cy="124" r="34"/><circle cx="102" cy="94" r="40"/><circle cx="146" cy="92" r="38"/><circle cx="176" cy="122" r="33"/><rect x="58" y="112" width="128" height="46" rx="23"/></g>
        <g fill="${p.body}"><circle cx="68" cy="124" r="34"/><circle cx="102" cy="94" r="40"/><circle cx="146" cy="92" r="38"/><circle cx="176" cy="122" r="33"/><rect x="58" y="112" width="128" height="46" rx="23"/></g>
        <path d="M78 86 Q90 64 112 62" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" opacity=".18"/>
        ${eyes(120, 116, 20, 12.5, { kind: "round" })}
        <rect x="102" y="134" width="36" height="17" rx="7" fill="#fff" stroke="${INK}" stroke-width="3"/>
        <path d="M108 135 v15 M114 135 v15 M120 135 v15 M126 135 v15 M132 135 v15 M103 142.5 h34" stroke="${INK}" stroke-width="1.8"/>
        <g class="rb-ring"><circle cx="164" cy="50" r="7" fill="#b91c1c"/><circle cx="196" cy="50" r="7" fill="#b91c1c"/><path d="M168 82 l-6 8 M192 82 l6 8" stroke="#7f1d1d" stroke-width="4" stroke-linecap="round"/>
          <circle cx="180" cy="66" r="20" fill="#ef4444"/><circle cx="180" cy="66" r="14.5" fill="#fff"/>
          <path d="M180 66 L180 55 M180 66 L176 58" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/><circle cx="180" cy="66" r="2" fill="#ef4444"/></g>
        <g class="rb-paper"><rect x="22" y="60" width="24" height="30" rx="2" fill="#f8fafc" transform="rotate(-18 34 75)"/><path d="M28 70 h12 M28 76 h12 M28 82 h8" stroke="#94a3b8" stroke-width="2" transform="rotate(-18 34 75)"/></g>
        <g class="rb-paper is-b"><rect x="200" y="150" width="22" height="28" rx="2" fill="#f8fafc" transform="rotate(16 211 164)"/><path d="M205 159 h12 M205 165 h12 M205 171 h7" stroke="#94a3b8" stroke-width="2" transform="rotate(16 211 164)"/></g>
        <g class="rb-paper is-c"><rect x="26" y="164" width="20" height="25" rx="2" fill="#f8fafc" transform="rotate(10 36 176)"/><path d="M30 172 h11 M30 178 h11" stroke="#94a3b8" stroke-width="2" transform="rotate(10 36 176)"/></g>`;
    },
    // 미세먼지 구름 — 누런 눈을 가늘게 뜨고 슬금슬금 퍼지는 보송보송 먼지 덩어리
    dust_cloud(p) {
      const puffs = [[120, 130, 56], [76, 120, 32], [164, 120, 32], [96, 86, 31], [144, 86, 31], [120, 72, 28], [72, 156, 28], [168, 156, 28], [100, 176, 30], [140, 176, 30]];
      const blob = (fill, dy) => `<g fill="${fill}"${dy ? ` transform="translate(0 ${dy})"` : ""}>${puffs.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join("")}</g>`;
      const specks = [[86, 104], [150, 100], [70, 140], [170, 146], [104, 186], [138, 190], [120, 96], [158, 172], [80, 170], [128, 60], [112, 166]];
      return `<g class="rb-drift" fill="${p.dark}" opacity=".7"><circle cx="30" cy="96" r="5"/><circle cx="20" cy="130" r="3.5"/><circle cx="38" cy="160" r="4"/><circle cx="212" cy="88" r="4.5"/><circle cx="222" cy="122" r="3"/></g>
        <g class="rb-drift is-b" fill="${p.body}" opacity=".8"><circle cx="208" cy="168" r="6"/><circle cx="28" cy="190" r="5"/><circle cx="196" cy="54" r="3.5"/><circle cx="46" cy="58" r="4"/></g>
        ${blob(p.dark, 6)}${blob(p.body, 0)}
        <g fill="${p.light}" opacity=".55"><circle cx="100" cy="74" r="10"/><circle cx="84" cy="100" r="7"/></g>
        <g fill="${p.deep}" opacity=".45">${specks.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${2 + (i % 3)}"/>`).join("")}</g>
        ${eyes(120, 124, 21, 13, { kind: "sly", lookX: 0.4, white: "#fef3c7", browUp: 1.05 })}
        <path d="M100 150 Q118 162 142 144" stroke="${p.deep}" stroke-width="4.5" fill="none" stroke-linecap="round"/>
        <path d="M131 152.5 l5.5 -3.6 l0.4 7.4z" fill="#fff"/>
        ${blush(82, 160, 146, "#a16207", 0.25)}`;
    },
    // 졸음 마왕 — 수면 모자를 쓰고 베개를 낀 보라 마왕. 눈은 반쯤 감겼지만 얕보면 같이 잠든다
    sleepy_lord(p) {
      return `<path d="M120 102 Q60 104 46 130 Q36 196 58 222 L182 222 Q204 196 194 130 Q180 104 120 102Z" fill="${p.deep}"/>
        <path d="M120 112 Q70 114 60 136 Q52 190 70 216 L170 216 Q188 190 180 136 Q170 114 120 112Z" fill="#7e22ce"/>
        <path d="M62 124 L42 84 L90 110Z M178 124 L198 84 L150 110Z" fill="${p.deep}"/>
        <path d="M82 134 Q72 200 86 220 L154 220 Q168 200 158 134Z" fill="${p.dark}"/>
        <path d="M120 140 v76" stroke="${p.deep}" stroke-width="3" opacity=".5"/>
        <circle cx="120" cy="186" r="5" fill="${p.accent}"/>
        <ellipse cx="120" cy="104" rx="46" ry="44" fill="${p.body}"/>
        <g class="rb-swing"><path d="M76 92 Q78 44 122 40 Q170 38 198 92 Q186 74 168 70 Q172 82 166 88Z" fill="${p.accent}"/>
          <path d="M110 44 Q120 64 116 86 M140 44 Q154 62 152 84 M166 60 Q176 72 182 82" stroke="#fdf4ff" stroke-width="6" fill="none" opacity=".75"/>
          <circle cx="198" cy="96" r="11" fill="#fdf4ff"/></g>
        <rect x="72" y="80" width="96" height="15" rx="7.5" fill="#fdf4ff"/>
        <path d="M82 84 Q74 64 84 52 Q86 68 96 80Z M158 84 Q166 64 156 52 Q154 68 144 80Z" fill="#fde68a"/>
        ${eyes(120, 110, 21, 12, { kind: "sleepy", lid: p.body, tilt: 14, browUp: 1.5 })}
        <path d="M92 126 q7 4 14 0 M134 126 q7 4 14 0" stroke="${p.dark}" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".7"/>
        <ellipse cx="120" cy="134" rx="9" ry="10.5" fill="#2e1065"/><ellipse cx="120" cy="139" rx="5.5" ry="4" fill="#f472b6"/>
        <path d="M113.5 126.5 l3.4 -0.6 l-1.8 5z M126.5 126.5 l-3.4 -0.6 l1.8 5z" fill="#fff"/>
        ${blush(86, 154, 126, "#f0abfc", 0.45)}
        <g transform="rotate(-14 176 170)"><rect x="146" y="150" width="62" height="38" rx="15" fill="#e0e7ff"/><path d="M156 162 h42 M156 176 h42" stroke="#a5b4fc" stroke-width="3" stroke-linecap="round"/></g>
        <ellipse cx="154" cy="168" rx="11" ry="13" fill="${p.body}"/>
        <g class="rb-zzz" fill="${p.light}" font-family="Pretendard, sans-serif" font-weight="900"><text x="50" y="74" font-size="15">Z</text><text x="34" y="52" font-size="20" style="animation-delay:-1s">Z</text><text x="16" y="28" font-size="25" style="animation-delay:-2s">Z</text></g>`;
    },
    // 스트레스 슬라임 — 김을 뿜으며 부글부글 끓는 분홍 슬라임. 몸에 붙은 포스트잇이 떨어질 날이 없다
    stress_slime(p) {
      return `<ellipse cx="120" cy="214" rx="80" ry="11" fill="${p.dark}" opacity=".55"/>
        <g class="rb-puff"><circle cx="96" cy="50" r="8" fill="#f1f5f9" opacity=".85"/><circle cx="88" cy="36" r="6" fill="#f1f5f9" opacity=".7"/><circle cx="94" cy="24" r="4" fill="#f1f5f9" opacity=".5"/></g>
        <g class="rb-puff is-b"><circle cx="146" cy="46" r="7" fill="#f1f5f9" opacity=".85"/><circle cx="154" cy="33" r="5" fill="#f1f5f9" opacity=".7"/><circle cx="150" cy="22" r="3.5" fill="#f1f5f9" opacity=".5"/></g>
        <path d="M42 210 Q34 150 62 110 Q90 66 120 64 Q152 62 180 106 Q208 150 198 210 Q188 220 176 210 Q168 222 156 212 Q142 224 128 212 Q112 224 100 212 Q86 222 74 210 Q58 220 42 210Z" fill="${p.body}"/>
        <path d="M160 86 Q196 128 196 196 Q194 210 180 208 Q186 140 150 92Z" fill="${p.dark}" opacity=".3"/>
        <ellipse cx="80" cy="112" rx="9" ry="19" transform="rotate(32 80 112)" fill="#fff" opacity=".55"/><circle cx="96" cy="88" r="5" fill="#fff" opacity=".6"/>
        <g class="rb-throb" fill="none" stroke="${p.deep}" stroke-width="4" stroke-linecap="round"><path d="M160 74 q4 6 10 4"/><path d="M176 70 q-6 4 -4 10"/><path d="M166 92 q4 -6 10 -4"/><path d="M182 88 q-6 -4 -4 -10"/></g>
        ${eyes(121, 138, 21, 13, { kind: "round", browColor: p.deep })}
        <rect x="101" y="160" width="40" height="17" rx="8.5" fill="${p.deep}"/>
        <path d="M105 164 l5 5 l5 -5 l5 5 l5 -5 l5 5 l5 -5 l3 3" stroke="#fff" stroke-width="2.6" fill="none" stroke-linejoin="round" stroke-linecap="round"/>
        ${blush(84, 160, 160, "#be123c", 0.3)}
        <g transform="rotate(-14 66 156)"><rect x="50" y="140" width="32" height="32" rx="2" fill="${p.accent}"/><rect x="50" y="140" width="32" height="7" fill="#eab308"/><text x="66" y="167" text-anchor="middle" font-size="13" font-weight="900" fill="#9a3412" font-family="Pretendard, sans-serif">급!</text></g>
        <g transform="rotate(10 168 182)"><rect x="154" y="168" width="28" height="28" rx="2" fill="#93c5fd"/><path d="M159 178 h18 M159 184 h18 M159 190 h11" stroke="#1d4ed8" stroke-width="2" opacity=".6"/></g>
        <g class="rb-drip" fill="${p.body}"><path d="M86 214 q-5 9 0 12 q5 -3 0 -12z"/><path d="M150 214 q-5 9 0 12 q5 -3 0 -12z" style="animation-delay:-1.3s"/></g>`;
    },
  };

  function bossArt(key, o = {}) {
    const k = ART[key] ? key : "stress_slime";
    const p = palOf(k);
    return `<svg class="rb rb--${k}${o.still ? " is-still" : ""}" viewBox="0 0 240 240" role="img" aria-label="${esc(o.label || BOSS_NAMES[k] || "")}" xmlns="http://www.w3.org/2000/svg">
      <ellipse class="rb-shadow" cx="120" cy="228" rx="70" ry="8" fill="#000" opacity=".28"/>
      <g class="rb-bob">${ART[k](p)}</g></svg>`;
  }

  // ── 글자 · 시간 ──────────────────────────────────────────────
  const DAY = "일월화수목금토";
  function kst(iso) {
    const t = Date.parse(iso);
    if (!isFinite(t)) return null;
    const d = new Date(t + 9 * 3600e3);
    return { m: d.getUTCMonth() + 1, d: d.getUTCDate(), day: DAY[d.getUTCDay()], hh: String(d.getUTCHours()).padStart(2, "0"), mm: String(d.getUTCMinutes()).padStart(2, "0") };
  }
  const ymd = (s) => { const [y, m, d] = String(s || "").split("-").map(Number); return { y, m, d }; };
  function weekRange(w) {
    if (!w || !w.start) return "";
    const a = ymd(w.start), b = ymd(w.end);
    return a.m === b.m ? `${a.m}월 ${a.d}일 ~ ${b.d}일` : `${a.m}월 ${a.d}일 ~ ${b.m}월 ${b.d}일`;
  }
  const weekOf = (s) => { const a = ymd(s); return a.m ? `${a.m}월 ${a.d}일 주` : ""; };
  const downAt = (iso) => { const k = kst(iso); return k ? `${k.day} ${k.hh}:${k.mm}` : ""; };
  // 남은 시간 — 다 됐으면(또는 모르면) "" . 부르는 쪽이 '새 보스' 문구를 따로 쓴다
  function leftText(endsAt, withSec) {
    const ms = Date.parse(endsAt) - Date.now();
    if (!isFinite(ms) || ms <= 0) return "";
    const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (d > 0) return `${d}일 ${h}시간${withSec ? ` ${m}분` : ""}`;
    if (h > 0) return `${h}시간 ${m}분`;
    return withSec ? `${m}분 ${String(sec).padStart(2, "0")}초` : `${Math.max(1, m)}분`;
  }
  // 첫 화면 칩 — PC 시계가 서버보다 빨라 시간이 먼저 다 돼도 어색하지 않게
  function leftHtml(endsAt) {
    const t = leftText(endsAt, true);
    if (t) return `월요일 0시까지 <b>${esc(t)}</b>`;
    return isFinite(Date.parse(endsAt)) ? `새 보스를 데려오는 중이에요` : "";
  }
  function leftShort(endsAt) {
    const t = leftText(endsAt);
    if (t) return `${t} 남음`;
    return isFinite(Date.parse(endsAt)) ? `곧 새 보스가 나와요` : "";
  }
  // 깎은 비율 — 쓰러뜨리기 전에는 100%로 올려 보이지 않게 내림한다
  function pctText(pct, down) {
    const v = clamp(Number(pct) || 0, 0, 100);
    if (down || v >= 100) return "100%";
    if (v > 0 && v < 10) return `${Math.floor(v * 10) / 10}%`;
    return `${Math.floor(v)}%`;
  }
  const remainPct = (row) => (row && !row.defeatedAt ? clamp(100 - (Number(row.pct) || 0), 0, 100) : 0);
  const remainHp = (row) => Math.max(0, (Number(row.hp) || 0) - (Number(row.damage) || 0));
  // 보스를 조금이라도 깎았는지 — 0%로 같은 순위인 부서들에는 메달 · 순위를 붙이지 않는다
  const started = (r) => !!(r && (r.defeatedAt || (Number(r.damage) || 0) > 0 || (Number(r.pct) || 0) > 0));
  const tieCount = (list, r) => list.filter((x) => x.rank === r.rank).length;
  const rankWord = (list, r) => `${tieCount(list, r) > 1 ? "공동 " : ""}${r.rank}위`;
  const josa = (word, a, b) => { const c = String(word || "").charCodeAt(String(word || "").length - 1); return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? a : b; };

  // ── 화면 CSS (한 번만 넣는다) ─────────────────────────────────
  const CSS = `
.rb { display: block; width: 100%; height: 100%; overflow: visible; }
.rb .rb-bob { animation: rb-bob 3.4s ease-in-out infinite; }
.rb .rb-shadow { transform-box: fill-box; transform-origin: center; animation: rb-shadow 3.4s ease-in-out infinite; }
.rb .rb-eye { transform-box: fill-box; transform-origin: center; animation: rb-blink 5s infinite; }
.rb .rb-puff { animation: rb-puff 2.8s ease-out infinite; }
.rb .rb-puff.is-b { animation-delay: -1.4s; }
.rb .rb-steam path { animation: rb-steam 2.4s ease-in-out infinite; }
.rb .rb-wiggle { transform-box: view-box; transform-origin: 120px 130px; animation: rb-wiggle 7s ease-in-out infinite; }
.rb .rb-wl { transform-box: fill-box; transform-origin: 100% 70%; animation: rb-flap-l 1.8s ease-in-out infinite; }
.rb .rb-wr { transform-box: fill-box; transform-origin: 0% 70%; animation: rb-flap-r 1.8s ease-in-out infinite; }
.rb .rb-glow { animation: rb-glow 2.2s ease-in-out infinite; }
.rb .rb-tick { transform-box: view-box; transform-origin: 120px 146px; animation: rb-tick 6s steps(12) infinite; }
.rb .rb-throb { transform-box: fill-box; transform-origin: center; animation: rb-throb 1.1s ease-in-out infinite; }
.rb .rb-flash { animation: rb-flash 2.6s linear infinite; }
.rb .rb-flash.is-late { animation-delay: -1.2s; }
.rb .rb-rain { animation: rb-rain 1s linear infinite; }
.rb .rb-ring { transform-box: fill-box; transform-origin: 50% 70%; animation: rb-ring 2.4s ease-in-out infinite; }
.rb .rb-paper { transform-box: fill-box; transform-origin: center; animation: rb-paper 4.2s ease-in-out infinite; }
.rb .rb-paper.is-b { animation-delay: -1.6s; } .rb .rb-paper.is-c { animation-delay: -3s; }
.rb .rb-drift { animation: rb-drift 6s ease-in-out infinite; }
.rb .rb-drift.is-b { animation-delay: -3s; animation-duration: 7s; }
.rb .rb-swing { transform-box: view-box; transform-origin: 120px 80px; animation: rb-swing 4s ease-in-out infinite; }
.rb .rb-zzz text { animation: rb-zzz 3s ease-in-out infinite; }
.rb .rb-drip path { animation: rb-drip 2.6s ease-in infinite; }
.rb.is-still *, .rb.is-still { animation: none !important; }
@keyframes rb-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
@keyframes rb-shadow { 50% { transform: scaleX(.86); opacity: .18; } }
@keyframes rb-blink { 0%, 92%, 100% { transform: scaleY(1); } 95% { transform: scaleY(.08); } }
@keyframes rb-puff { 0% { transform: translate(0, 4px); opacity: 0; } 25% { opacity: 1; } 100% { transform: translate(6px, -16px); opacity: 0; } }
@keyframes rb-steam { 0%, 100% { opacity: .2; transform: translateY(2px); } 50% { opacity: .9; transform: translateY(-3px); } }
@keyframes rb-wiggle { 0%, 100% { transform: rotate(-5deg); } 50% { transform: rotate(5deg); } }
@keyframes rb-flap-l { 0%, 100% { transform: rotate(0); } 50% { transform: rotate(10deg); } }
@keyframes rb-flap-r { 0%, 100% { transform: rotate(0); } 50% { transform: rotate(-10deg); } }
@keyframes rb-glow { 0%, 100% { opacity: 1; } 50% { opacity: .55; } }
@keyframes rb-tick { to { transform: rotate(360deg); } }
@keyframes rb-throb { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.18); } }
@keyframes rb-flash { 0%, 6%, 12%, 100% { opacity: 1; } 3%, 9% { opacity: .15; } 60% { opacity: .9; } }
@keyframes rb-rain { from { transform: translate(0, -6px); opacity: 0; } 30% { opacity: .8; } to { transform: translate(-4px, 10px); opacity: 0; } }
@keyframes rb-ring { 0%, 70%, 100% { transform: rotate(0); } 74% { transform: rotate(-10deg); } 78% { transform: rotate(10deg); } 82% { transform: rotate(-8deg); } 86% { transform: rotate(8deg); } 90% { transform: rotate(0); } }
@keyframes rb-paper { 0%, 100% { transform: translate(0, 0) rotate(0); } 50% { transform: translate(4px, -8px) rotate(14deg); } }
@keyframes rb-drift { 0%, 100% { transform: translate(0, 0); opacity: .9; } 50% { transform: translate(-6px, -8px); opacity: .45; } }
@keyframes rb-swing { 0%, 100% { transform: rotate(0); } 50% { transform: rotate(3deg); } }
@keyframes rb-zzz { 0% { opacity: 0; transform: translate(0, 6px); } 30% { opacity: 1; } 100% { opacity: 0; transform: translate(-4px, -8px); } }
@keyframes rb-drip { 0% { transform: translateY(-6px); opacity: 0; } 30% { opacity: 1; } 100% { transform: translateY(10px); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .rb, .rb * { animation: none !important; } }

/* /raid 전체 화면 */
.rd { --rd-ink: #1d1d1f; --rd-gray: #6e6e73; --rd-mist: #f5f5f7; --rd-line: #e8e8ed; --rd-blue: #2563eb; --rd-gold: #f59e0b;
  --rd-hp: linear-gradient(90deg, #e11d48, #f97316); color: var(--rd-ink); background: #fff; overflow-x: clip; }
.rd a:hover { text-decoration: none; }
.rd-wrap { max-width: 1160px; margin: 0 auto; padding: 0 32px; }
.rd-loading { padding: 140px 0; text-align: center; }
.rd-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 48px; padding: 0 22px; border: 0; border-radius: 999px; background: rgba(255, 255, 255, .12); color: #fff; font: inherit; font-size: 16px; font-weight: 800; text-decoration: none; cursor: pointer; transition: transform .15s ease, filter .15s ease, background .15s ease; }
.rd-btn:hover { filter: brightness(1.1); }
.rd-btn:active { transform: scale(.97); }
.rd-btn.is-main { background: #fff; color: #0f172a; }
.rd-btn.is-ink { background: #0f172a; color: #fff; }
.rd-btn.is-soft { background: #eef2ff; color: #1e3a8a; }

.rd-hero { position: relative; overflow: hidden; isolation: isolate; padding: 40px 0 56px; color: #fff; background: var(--rd-bg); }
.rd-hero::before { content: ""; position: absolute; inset: 0; z-index: -1; opacity: .5;
  background-image: radial-gradient(rgba(255, 255, 255, .55) 1px, transparent 1.6px), radial-gradient(rgba(255, 255, 255, .3) 1px, transparent 1.6px);
  background-size: 46px 46px, 73px 73px; background-position: 0 0, 20px 30px;
  -webkit-mask-image: linear-gradient(180deg, #000, transparent 85%); mask-image: linear-gradient(180deg, #000, transparent 85%); }
.rd-hero__in { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-template-areas: "head boss" "body vs"; gap: 0 40px; }
.rd-hero__head { grid-area: head; align-self: end; min-width: 0; padding-bottom: 4px; }
.rd-hero__body { grid-area: body; align-self: start; min-width: 0; }
.rd-back { display: inline-flex; align-items: center; min-height: 36px; margin-bottom: 14px; font-size: 14px; font-weight: 700; color: rgba(255, 255, 255, .7); text-decoration: none; }
.rd-back:hover { color: #fff; }
.rd-kicker { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; font-size: 14px; font-weight: 800; color: var(--rd-glow); }
.rd-kicker em { font-style: normal; padding: 3px 10px; border-radius: 999px; background: rgba(255, 255, 255, .12); color: rgba(255, 255, 255, .85); font-weight: 700; }
.rd h1.rd-title { margin: 12px 0 0; font-size: clamp(46px, 6.2vw, 80px); line-height: 1.02; font-weight: 900; letter-spacing: -0.04em; color: #fff; word-break: keep-all; }
.rd-lead { margin: 14px 0 0; font-size: clamp(20px, 2.2vw, 26px); line-height: 1.35; font-weight: 800; letter-spacing: -0.02em; word-break: keep-all; }
.rd-desc { max-width: 520px; margin: 10px 0 0; font-size: 16px; line-height: 1.7; font-weight: 500; color: rgba(255, 255, 255, .76); word-break: keep-all; }
.rd-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
.rd-chip { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 6px 14px; border-radius: 12px; background: rgba(255, 255, 255, .09); border: 1px solid rgba(255, 255, 255, .14); font-size: 14px; font-weight: 700; color: rgba(255, 255, 255, .82); word-break: keep-all; }
.rd-chip b { color: #fff; font-weight: 900; font-variant-numeric: tabular-nums; }
.rd-cta { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 24px; }
.rd-boss { grid-area: boss; justify-self: center; position: relative; width: min(360px, 100%); aspect-ratio: 1; }
.rd-boss::before { content: ""; position: absolute; inset: 8% 4% 2%; z-index: -1; border-radius: 50%; background: radial-gradient(closest-side, var(--rd-glow-a), transparent); }
.rd-boss.is-hit .rb { animation: rd-hit .55s ease-out; }
.rd-boss.is-down .rb { filter: grayscale(.75) brightness(.75); transform: rotate(10deg) translateY(16px); }
.rd-boss.is-down .rb * { animation: none !important; }
.rd-stamp { position: absolute; left: 50%; top: 46%; transform: translate(-50%, -50%) rotate(-12deg); padding: 8px 22px; border: 5px solid #fde047; border-radius: 16px; color: #fde047; font-size: clamp(34px, 5vw, 52px); font-weight: 900; letter-spacing: .04em; background: rgba(15, 23, 42, .86); box-shadow: 0 10px 30px rgba(0, 0, 0, .45); white-space: nowrap; animation: rd-stamp .5s cubic-bezier(.2, 1.6, .4, 1) both; }
.rd-stamp small { display: block; margin-top: 2px; font-size: 14px; letter-spacing: 0; text-align: center; color: #fff; font-weight: 800; }
.rd-hit { position: absolute; left: 50%; top: 30%; z-index: 2; font-size: 30px; font-weight: 900; color: #fde047; text-shadow: 0 3px 0 #b91c1c, 0 0 18px rgba(0, 0, 0, .5); pointer-events: none; white-space: nowrap; animation: rd-pop 1.6s ease-out forwards; }
@keyframes rd-hit { 0% { transform: none; filter: none; } 20% { transform: translateX(-8px) rotate(-3deg); filter: brightness(1.6) saturate(1.4); } 45% { transform: translateX(7px) rotate(2deg); } 70% { transform: translateX(-3px); } 100% { transform: none; filter: none; } }
@keyframes rd-pop { 0% { transform: translate(-50%, 10px) scale(.6); opacity: 0; } 15% { transform: translate(-50%, 0) scale(1.15); opacity: 1; } 100% { transform: translate(-50%, -60px) scale(1); opacity: 0; } }
@keyframes rd-stamp { from { transform: translate(-50%, -50%) rotate(-12deg) scale(1.8); opacity: 0; } to { transform: translate(-50%, -50%) rotate(-12deg) scale(1); opacity: 1; } }

.rd-vs { grid-area: vs; justify-self: center; align-self: start; margin-top: 4px; width: min(460px, 100%); padding: 16px 18px; border-radius: 20px; background: rgba(2, 6, 23, .52); border: 1px solid rgba(255, 255, 255, .14); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
.rd-vs__top { display: flex; align-items: center; gap: 6px; min-width: 0; font-size: 13.5px; font-weight: 700; color: rgba(255, 255, 255, .72); white-space: nowrap; }
.rd-vs__name { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-top: 2px; font-size: 19px; line-height: 1.3; font-weight: 900; letter-spacing: -0.01em; color: #fff; word-break: keep-all; overflow-wrap: anywhere; }
.rd-vs__name small { font-size: 14px; font-weight: 700; color: rgba(255, 255, 255, .7); }
.rd-vs__top .rd-rankchip { margin-left: auto; }
.rd-rankchip { flex-shrink: 0; padding: 3px 10px; border-radius: 999px; background: #fde047; color: #422006; font-size: 13px; font-weight: 900; font-variant-numeric: tabular-nums; }
.rd-rankchip.is-plain { background: rgba(255, 255, 255, .14); color: #fff; }
.rd-bigbar { position: relative; height: 22px; margin-top: 10px; border-radius: 999px; background: rgba(255, 255, 255, .1); overflow: hidden; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .12); }
.rd-bigbar i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: inherit; background: var(--rd-hp); box-shadow: inset 0 -5px 0 rgba(0, 0, 0, .14), inset 0 4px 0 rgba(255, 255, 255, .25); transition: width 1.2s cubic-bezier(.2, .8, .2, 1); }
.rd-bigbar span { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 12.5px; font-weight: 900; color: #fff; text-shadow: 0 1px 2px rgba(0, 0, 0, .6); font-variant-numeric: tabular-nums; }
.rd-vs__meta { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 12px; margin-top: 8px; font-size: 13.5px; font-weight: 600; color: rgba(255, 255, 255, .72); word-break: keep-all; }
.rd-vs__meta b { color: #fff; font-weight: 900; font-variant-numeric: tabular-nums; }
.rd-vs__note { margin-top: 8px; font-size: 13.5px; line-height: 1.5; font-weight: 700; color: var(--rd-glow); word-break: keep-all; }

.rd-main { padding: 56px 0 72px; background: var(--rd-mist); }
.rd-grid { display: grid; grid-template-columns: minmax(0, 1fr) 360px; grid-template-areas: "board me" "board top"; grid-template-rows: auto 1fr; gap: 20px 24px; align-items: start; }
.rd-grid.is-solo { grid-template-areas: "board me" "board ."; }
.rd-board { grid-area: board; min-width: 0; }
.rd-me { grid-area: me; min-width: 0; }
.rd-top { grid-area: top; min-width: 0; }
.rd-grid.is-solo .rd-top { display: none; }
.rd-card { padding: 22px; border-radius: 24px; background: #fff; border: 1px solid var(--rd-line); }
.rd-eyebrow { display: inline-flex; align-items: center; gap: 6px; font-size: 13.5px; font-weight: 800; color: #c2410c; }
.rd h2.rd-h2 { margin: 6px 0 0; font-size: clamp(26px, 3vw, 34px); line-height: 1.2; font-weight: 900; letter-spacing: -0.03em; color: var(--rd-ink); word-break: keep-all; }
.rd h3.rd-h3 { margin: 4px 0 0; font-size: 20px; line-height: 1.3; font-weight: 900; letter-spacing: -0.02em; color: var(--rd-ink); word-break: keep-all; }
.rd-sub { margin: 8px 0 0; font-size: 15px; line-height: 1.6; font-weight: 600; color: var(--rd-gray); word-break: keep-all; }

.rd-sum { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
.rd-sum span { display: inline-flex; align-items: baseline; gap: 6px; padding: 8px 14px; border-radius: 14px; background: #fff; border: 1px solid var(--rd-line); font-size: 13.5px; font-weight: 700; color: var(--rd-gray); }
.rd-sum b { font-size: 18px; font-weight: 900; color: var(--rd-ink); font-variant-numeric: tabular-nums; white-space: nowrap; }
.rd-list { display: flex; flex-direction: column; gap: 8px; margin: 16px 0 0; padding: 0; list-style: none; }
.rd-row { position: relative; display: grid; grid-template-columns: 38px minmax(0, 1fr); align-items: center; gap: 14px; padding: 14px 18px 14px 14px; border-radius: 18px; background: #fff; border: 1px solid var(--rd-line); }
.rd-row.is-mine { margin-top: 8px; border: 2px solid var(--rd-blue); padding: 13px 17px 13px 13px; box-shadow: 0 10px 24px rgba(37, 99, 235, .12); }
.rd-row.is-mine:first-child { margin-top: 10px; }
.rd-rank { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 50%; background: var(--rd-mist); color: var(--rd-gray); font-size: 16px; font-weight: 900; font-variant-numeric: tabular-nums; }
.rd-rank.is-1 { background: #fde68a; color: #92400e; box-shadow: inset 0 0 0 2px #f59e0b; }
.rd-rank.is-2 { background: #e2e8f0; color: #334155; box-shadow: inset 0 0 0 2px #94a3b8; }
.rd-rank.is-3 { background: #fed7aa; color: #9a3412; box-shadow: inset 0 0 0 2px #ea580c; }
.rd-row__main { min-width: 0; }
.rd-row__top { display: flex; align-items: flex-start; gap: 6px 10px; min-width: 0; }
.rd-row__name { min-width: 0; font-size: 16.5px; font-weight: 900; letter-spacing: -0.01em; color: var(--rd-ink); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; word-break: keep-all; overflow-wrap: anywhere; line-height: 1.3; }
.rd-tag { position: absolute; left: 14px; top: -11px; padding: 2px 10px; border-radius: 999px; background: var(--rd-blue); color: #fff; font-size: 12px; line-height: 18px; font-weight: 800; font-style: normal; }
.rd-down { flex-shrink: 0; margin-left: auto; margin-top: 1px; display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 999px; background: #fef3c7; color: #92400e; font-size: 12.5px; font-weight: 900; white-space: nowrap; }
.rd-down.is-pct { background: transparent; color: var(--rd-ink); font-size: 15px; padding: 0; font-variant-numeric: tabular-nums; }
.rd-down.is-pct small { font-size: 12px; font-weight: 700; color: var(--rd-gray); }
.rd-hp { position: relative; height: 12px; margin-top: 8px; border-radius: 999px; background: #f1f1f4; overflow: hidden; }
.rd-hp i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: inherit; background: var(--rd-hp); transition: width 1.2s cubic-bezier(.2, .8, .2, 1); }
.rd-hp.is-down { background: repeating-linear-gradient(-45deg, #fde68a 0 8px, #fef3c7 8px 16px); }
.rd-row__meta { display: flex; flex-wrap: wrap; gap: 2px 14px; margin-top: 6px; font-size: 13px; font-weight: 600; color: var(--rd-gray); font-variant-numeric: tabular-nums; }
.rd-row__meta b { color: var(--rd-ink); font-weight: 800; }
.rd-row__meta .is-today { color: #15803d; font-weight: 800; }
.rd-row__meta .is-quiet { color: #a1a1aa; }
.rd-row__meta .is-hold { color: #b45309; font-weight: 800; }
.rd-gap { text-align: center; color: #a1a1aa; font-weight: 900; letter-spacing: .3em; line-height: 1; }
.rd-more { display: flex; justify-content: center; margin-top: 12px; }
.rd-more button { min-height: 44px; padding: 0 20px; border-radius: 999px; border: 1px solid var(--rd-line); background: #fff; color: var(--rd-ink); font: inherit; font-size: 14.5px; font-weight: 800; cursor: pointer; }
.rd-more button:hover { border-color: #c7c7cc; }
.rd-empty { padding: 26px 18px; border-radius: 18px; background: #fff; border: 1px dashed #d4d4d8; text-align: center; font-size: 15px; font-weight: 700; color: var(--rd-gray); word-break: keep-all; }

.rd-mecard__head { display: flex; align-items: center; gap: 8px; min-width: 0; }
.rd-mecard__head b { min-width: 0; font-size: 19px; line-height: 1.3; font-weight: 900; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; word-break: keep-all; overflow-wrap: anywhere; }
.rd-mecard__head .rd-rankchip { margin-left: auto; }
.rd-gauge { display: grid; grid-template-columns: 116px minmax(0, 1fr); align-items: center; gap: 16px; margin-top: 16px; }
.rd-ring { position: relative; width: 116px; height: 116px; }
.rd-ring svg { width: 100%; height: 100%; transform: rotate(-90deg); }
.rd-ring circle { fill: none; stroke-width: 12; }
.rd-ring .is-track { stroke: #f1f1f4; }
.rd-ring .is-fill { stroke: url(#rd-ring-grad); stroke-linecap: round; transition: stroke-dashoffset 1.2s cubic-bezier(.2, .8, .2, 1); }
.rd-ring__in { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.rd-ring__in b { font-size: 26px; font-weight: 900; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; line-height: 1.1; }
.rd-ring__in small { font-size: 12.5px; font-weight: 700; color: var(--rd-gray); font-variant-numeric: tabular-nums; }
.rd-gauge__txt b { display: block; font-size: 16px; font-weight: 900; line-height: 1.4; word-break: keep-all; }
.rd-gauge__txt p { margin: 4px 0 0; font-size: 13.5px; line-height: 1.55; font-weight: 600; color: var(--rd-gray); word-break: keep-all; }
.rd-gauge__txt.is-full b { color: #15803d; }
.rd-today { margin: 16px 0 0; padding: 12px 14px; list-style: none; border-radius: 16px; background: var(--rd-mist); }
.rd-today li { display: flex; justify-content: space-between; gap: 10px; padding: 5px 0; font-size: 14px; font-weight: 700; color: #424245; }
.rd-today li + li { border-top: 1px dashed #e0e0e6; }
.rd-today li span { min-width: 0; word-break: keep-all; }
.rd-today li b { flex-shrink: 0; color: #c2410c; font-weight: 900; font-variant-numeric: tabular-nums; }
.rd-today.is-empty li { justify-content: flex-start; color: var(--rd-gray); }
.rd-weekline { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin-top: 14px; font-size: 14px; font-weight: 700; color: var(--rd-gray); }
.rd-weekline b { font-size: 20px; font-weight: 900; color: var(--rd-ink); font-variant-numeric: tabular-nums; }
.rd-mecta { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px; margin-top: 16px; }
.rd-mecta .rd-btn { min-height: 46px; padding: 0 12px; font-size: 15px; }
.rd-closed { display: flex; gap: 8px; margin-top: 12px; padding: 10px 12px; border-radius: 12px; background: #fff7ed; color: #9a3412; font-size: 13.5px; line-height: 1.5; font-weight: 700; word-break: keep-all; }
.rd-out { display: flex; flex-direction: column; gap: 8px; }
.rd-out__ico { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 16px; background: #eef2ff; color: #4338ca; }
.rd-out p { margin: 0; font-size: 14.5px; line-height: 1.65; font-weight: 600; color: #424245; word-break: keep-all; }

.rd-tops { display: flex; flex-direction: column; gap: 4px; margin: 14px 0 0; padding: 0; list-style: none; }
.rd-tops li { display: grid; grid-template-columns: 22px 40px minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 7px 8px; border-radius: 14px; }
.rd-tops li.is-me { background: #eff6ff; }
.rd-tops__no { font-size: 14px; font-weight: 900; color: #a1a1aa; text-align: center; font-variant-numeric: tabular-nums; }
.rd-tops li:nth-child(1) .rd-tops__no { color: #d97706; } .rd-tops li:nth-child(2) .rd-tops__no { color: #64748b; } .rd-tops li:nth-child(3) .rd-tops__no { color: #c2410c; }
.rd-tops__who { min-width: 0; }
.rd-tops__who b { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14.5px; font-weight: 800; }
.rd-tops__who i { display: block; height: 5px; margin-top: 5px; border-radius: 999px; background: #f1f1f4; overflow: hidden; }
.rd-tops__who i em { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #f97316, #e11d48); }
.rd-tops__dmg { font-size: 14px; font-weight: 900; color: #c2410c; font-variant-numeric: tabular-nums; }
.rd-tops .hk-avatar { width: 40px; height: 40px; font-size: 15px; }

.rd-info { padding: 72px 0 80px; }
.rd-grid2 { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 24px; align-items: start; }
.rd-ways { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 18px 0 0; padding: 0; list-style: none; }
.rd-way:last-child:nth-child(odd) { grid-column: 1 / -1; }
.rd-way { display: grid; grid-template-columns: 42px minmax(0, 1fr) auto; align-items: start; gap: 12px; padding: 14px; border-radius: 18px; background: var(--rd-mist); }
.rd-way__ico { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 14px; background: #fff; color: #c2410c; }
.rd-way b { display: block; font-size: 15.5px; font-weight: 900; word-break: keep-all; }
.rd-way p { margin: 2px 0 0; font-size: 13px; line-height: 1.5; font-weight: 600; color: var(--rd-gray); word-break: keep-all; }
.rd-way__dmg { padding: 3px 9px; border-radius: 999px; background: #fff; color: #c2410c; font-size: 14px; font-weight: 900; white-space: nowrap; font-variant-numeric: tabular-nums; }
.rd-cross { display: flex; align-items: center; gap: 14px; margin-top: 12px; padding: 16px 18px; border-radius: 18px; background: linear-gradient(110deg, #1e3a8a, #6d28d9); color: #fff; }
.rd-cross__ico { flex-shrink: 0; display: grid; place-items: center; width: 46px; height: 46px; border-radius: 50%; background: rgba(255, 255, 255, .16); }
.rd-cross b { display: block; font-size: 16px; font-weight: 900; word-break: keep-all; }
.rd-cross p { margin: 2px 0 0; font-size: 13.5px; line-height: 1.5; font-weight: 600; color: rgba(255, 255, 255, .8); word-break: keep-all; }
.rd-cross em { font-style: normal; color: #fde047; font-weight: 900; }
.rd-facts { margin: 16px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
.rd-facts li { display: flex; gap: 10px; font-size: 14.5px; line-height: 1.55; font-weight: 600; color: #424245; word-break: keep-all; }
.rd-facts li > span:first-child { flex-shrink: 0; color: #a1a1aa; }
.rd-facts b { color: var(--rd-ink); font-weight: 900; }
.rd-hist { display: flex; flex-direction: column; gap: 10px; margin: 18px 0 0; padding: 0; list-style: none; }
.rd-hist li { display: grid; grid-template-columns: 64px minmax(0, 1fr); align-items: center; gap: 14px; padding: 12px 14px 12px 10px; border-radius: 18px; background: var(--rd-mist); }
.rd-hist__art { width: 64px; height: 64px; border-radius: 16px; background: var(--rd-sky); padding: 4px; }
.rd-hist small { display: block; font-size: 12.5px; font-weight: 800; color: var(--rd-gray); }
.rd-hist b { display: block; font-size: 15.5px; font-weight: 900; word-break: keep-all; }
.rd-pod { display: flex; flex-wrap: wrap; gap: 4px 10px; margin-top: 4px; font-size: 13.5px; font-weight: 700; color: #424245; }
.rd-pod span { display: inline-flex; align-items: center; gap: 4px; min-width: 0; word-break: keep-all; overflow-wrap: anywhere; }
.rd-pod i { flex-shrink: 0; display: inline-grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; font-size: 11px; font-style: normal; font-weight: 900; }
.rd-pod span:nth-child(1) i { background: #fde68a; color: #92400e; } .rd-pod span:nth-child(2) i { background: #e2e8f0; color: #334155; } .rd-pod span:nth-child(3) i { background: #fed7aa; color: #9a3412; }
.rd-pod span.is-mine { color: var(--rd-blue); font-weight: 900; }
.rd-hist__none { font-size: 13.5px; font-weight: 600; color: var(--rd-gray); }
.rd-err { max-width: 520px; margin: 80px auto; padding: 0 20px; text-align: center; }
.rd-err b { display: block; font-size: 20px; font-weight: 900; }
.rd-err p { margin: 8px 0 18px; font-size: 15px; line-height: 1.6; color: var(--rd-gray); word-break: keep-all; }

@media (max-width: 1000px) {
  .rd-hero__in { grid-template-columns: minmax(0, 1fr); grid-template-areas: "head" "boss" "vs" "body"; }
  .rd-hero__head { align-self: start; }
  .rd-boss { width: min(300px, 80%); margin-top: 8px; }
  .rd-vs { margin: 0 0 22px; }
  .rd-grid, .rd-grid.is-solo { grid-template-columns: minmax(0, 1fr); grid-template-areas: "me" "board" "top"; grid-template-rows: none; }
  .rd-grid.is-solo { grid-template-areas: "me" "board"; }
  .rd-grid2 { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 640px) {
  .rd-wrap { padding: 0 16px; }
  .rd-hero { padding: 18px 0 36px; }
  .rd-boss { width: min(230px, 66%); margin-top: 4px; }
  .rd-back { margin-bottom: 6px; }
  .rd-sum { gap: 6px; }
  .rd-sum span { flex: 1 1 auto; flex-direction: column; gap: 0; padding: 8px 10px; font-size: 12px; }
  .rd-sum b { font-size: 16px; }
  .rd h1.rd-title { font-size: 44px !important; line-height: 1.05 !important; }
  .rd h2.rd-h2 { font-size: 26px !important; line-height: 1.22 !important; }
  .rd-lead { font-size: 19px; }
  .rd-desc { font-size: 15px; }
  .rd-cta .rd-btn { flex: 1 1 0; padding: 0 12px; }
  .rd-main { padding: 28px 0 48px; }
  .rd-card { padding: 18px; border-radius: 20px; }
  .rd-row { grid-template-columns: 30px minmax(0, 1fr); gap: 10px; padding: 12px 14px 12px 10px; }
  .rd-row.is-mine { padding: 11px 13px 11px 9px; }
  .rd-rank { width: 30px; height: 30px; font-size: 14px; }
  .rd-row__name { font-size: 15.5px; }
  .rd-row__meta { gap: 2px 10px; font-size: 12.5px; }
  .rd-gauge { grid-template-columns: 100px minmax(0, 1fr); gap: 14px; }
  .rd-ring { width: 100px; height: 100px; }
  .rd-ring__in b { font-size: 22px; }
  .rd-info { padding: 48px 0 56px; }
  .rd-ways { grid-template-columns: minmax(0, 1fr); gap: 8px; }
  .rd-way { grid-template-columns: 36px minmax(0, 1fr) auto; gap: 10px; padding: 12px; border-radius: 16px; }
  .rd-way__ico { width: 36px; height: 36px; border-radius: 12px; }
  .rd-hist li { grid-template-columns: 56px minmax(0, 1fr); }
  .rd-hist__art { width: 56px; height: 56px; }
}
@media (prefers-reduced-motion: reduce) {
  .rd-btn, .rd-hp i, .rd-bigbar i, .rd-ring .is-fill { transition: none; }
  .rd-boss.is-hit .rb, .rd-stamp, .rd-hit { animation: none; }
  .rd-hit { display: none; }
}

/* 작은 카드 — /together · /arcade 에 넣는다 */
.rdw-host { container-type: inline-size; container-name: rdw; }
.rdw { position: relative; display: flex; align-items: center; gap: 16px; overflow: hidden; isolation: isolate; padding: 12px 18px 12px 12px; border-radius: 22px; color: #fff; text-decoration: none; background: var(--rd-bg); box-shadow: 0 12px 30px rgba(15, 23, 42, .16); transition: transform .2s cubic-bezier(.2, .8, .2, 1), box-shadow .2s ease; }
.rdw:hover { text-decoration: none; transform: translateY(-2px); box-shadow: 0 18px 36px rgba(15, 23, 42, .22); }
.rdw-art { position: relative; flex: 0 0 92px; width: 92px; height: 92px; }
.rdw-art::before { content: ""; position: absolute; inset: 6%; z-index: -1; border-radius: 50%; background: radial-gradient(closest-side, var(--rd-glow-a), transparent); }
.rdw-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.rdw-kicker { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 8px; font-size: 12.5px; font-weight: 800; color: var(--rd-glow); }
.rdw-kicker span { color: rgba(255, 255, 255, .66); font-weight: 700; white-space: nowrap; }
.rdw-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 17px; font-weight: 900; letter-spacing: -0.02em; color: #fff; }
.rdw-hp { position: relative; height: 10px; margin-top: 4px; border-radius: 999px; background: rgba(255, 255, 255, .14); overflow: hidden; }
.rdw-hp i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: inherit; background: linear-gradient(90deg, #e11d48, #f97316); }
.rdw-hp.is-down { background: repeating-linear-gradient(-45deg, rgba(253, 224, 71, .5) 0 6px, rgba(253, 224, 71, .25) 6px 12px); }
.rdw-meta { display: flex; flex-wrap: wrap; gap: 2px 10px; margin-top: 3px; font-size: 13px; font-weight: 600; color: rgba(255, 255, 255, .76); font-variant-numeric: tabular-nums; }
.rdw-meta b { color: #fff; font-weight: 900; }
.rdw-meta em { font-style: normal; color: #fde047; font-weight: 900; }
.rdw-go { flex-shrink: 0; display: inline-flex; align-items: center; gap: 4px; min-height: 42px; padding: 0 18px; border-radius: 999px; background: #fff; color: #0f172a; font-size: 14.5px; font-weight: 800; white-space: nowrap; }
@container rdw (max-width: 520px) {
  .rdw { gap: 12px; padding: 10px 14px 10px 8px; border-radius: 18px; }
  .rdw-art { flex-basis: 76px; width: 76px; height: 76px; }
  .rdw-title { font-size: 15.5px; }
  .rdw-go { min-height: 34px; padding: 0 10px; font-size: 0; background: rgba(255, 255, 255, .16); color: #fff; }
  .rdw-go::after { content: "›"; font-size: 20px; line-height: 1; }
}
@media (prefers-reduced-motion: reduce) { .rdw { transition: none; } .rdw:hover { transform: none; } }
`;
  function ensureCss() {
    if (document.getElementById("hk-raid-css")) return;
    const s = document.createElement("style");
    s.id = "hk-raid-css";
    s.textContent = CSS;
    document.head.appendChild(s);
  }
  function hexA(hex, a) {
    const h = String(hex || "#000").replace("#", "");
    const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    const n = parseInt(v, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }
  // 보스 색을 CSS 변수로 — 어두운 바탕 · 은은한 빛
  function skyVars(key) {
    const p = palOf(key);
    const bg = `radial-gradient(55% 75% at 78% 42%, ${hexA(p.glow, 0.34)}, transparent 70%), radial-gradient(40% 60% at 0% 100%, ${hexA(p.body, 0.22)}, transparent 70%), linear-gradient(160deg, ${p.sky1}, ${p.sky2})`;
    return `--rd-bg:${bg};--rd-glow:${p.glow};--rd-glow-a:${hexA(p.glow, 0.45)};--rd-sky:linear-gradient(160deg, ${p.sky1}, ${p.sky2})`;
  }

  // ── 데이터 ───────────────────────────────────────────────────
  async function load() {
    if (window.HKApi && typeof HKApi.get === "function") return HKApi.get(API_PATH);
    const res = await fetch("/api" + API_PATH, { credentials: "include" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error((body.error && body.error.message) || "레이드 정보를 불러오지 못했어요"); e.status = res.status; throw e; }
    return body.data;
  }
  const deps = (d) => (Array.isArray(d && d.departments) ? d.departments : []);
  function myRow(d) {
    const m = (d && d.mine) || {};
    if (!m.department || m.excluded) return null;
    return deps(d).find((x) => x.isMine) || deps(d).find((x) => x.name === m.department) || null;
  }
  // 서버가 me 를 주면 그것만 믿는다(같은 이름 동료가 있어도 나만). 없을 때만 이름으로 찾는다
  const isMe = (x, profile) => !!x && (typeof x.me === "boolean" ? x.me : !!(profile && profile.name && x.name === profile.name));

  // ── 전체 화면 조각 ──────────────────────────────────────────
  function heroHtml(d, opts) {
    const b = d.boss || {}, key = b.key, mine = myRow(d), w = d.week || {};
    return `<section class="rd-hero" style="${skyVars(key)}">
        <div class="rd-wrap rd-hero__in">
          <div class="rd-hero__head">
            <a class="rd-back" href="/arcade">‹ 아케이드</a>
            <div class="rd-kicker">${icon("swords", 16)} 부서 대항 레이드 <em>${esc(weekRange(w))}</em></div>
            <h1 class="rd-title">${esc(b.name || BOSS_NAMES[key] || "이번 주 보스")}</h1>
            ${b.title ? `<p class="rd-lead">${esc(b.title)}</p>` : ""}
          </div>
          <div class="rd-boss${mine && mine.defeatedAt ? " is-down" : ""}" data-rd-boss>${bossArt(key, { label: b.name })}${mine && mine.defeatedAt ? stampHtml(mine, deps(d)) : ""}</div>
          <div class="rd-vs" data-rd-part="vs">${vsHtml(d, opts)}</div>
          <div class="rd-hero__body">
            ${b.desc ? `<p class="rd-desc">${esc(b.desc)}</p>` : ""}
            <div class="rd-chips">
              <span class="rd-chip">${icon("hourglass", 15)} <span data-rd-left>${leftHtml(w.endsAt)}</span></span>
              ${b.weakness ? `<span class="rd-chip">${icon("target", 15)} 약점 · ${esc(b.weakness)}</span>` : ""}
            </div>
            <div class="rd-cta"><a class="rd-btn is-main" href="/arcade">${icon("gamepad-2", 18)} 공격하러 가기</a><a class="rd-btn" href="${peersHref()}">${icon("users", 18)} 동료랑 같이 공격</a></div>
          </div>
        </div>
      </section>`;
  }
  const stampHtml = (row, list) => `<div class="rd-stamp" aria-hidden="true">격파!<small>${esc(downAt(row.defeatedAt))} · ${rankWord(list, row)}</small></div>`;

  // 우리 부서에 지금 건넬 한마디 — 서버의 버티기 규칙(참여 인원 · 하루에 깎이는 양)을 풀어서
  // st = /play/status — 업무 시간(open === false)에는 「지금 공격해도」라고 하지 않는다
  function vsNote(row, list, rules, st) {
    if (row.defeatedAt) return `${rankWord(list, row)}로 쓰러뜨렸어요! 격파 뒤에 넣은 공격도 기록에 남아요.`;
    const rest = Math.max(0, (Number(row.members) || 0) - (Number(row.attackers) || 0));
    const need = Math.max(0, Number(row.needMore) || 0);
    const max = Number(row.todayMax) || 0;
    const capped = max > 0 && (Number(row.today) || 0) >= max;
    if (need > 0 && started(row) && remainHp(row) <= 1) return `보스가 체력 1로 버티고 있어요. 동료 ${need}명이 더 공격하면 쓰러져요!`;
    if (capped) {
      const days = Number(rules && rules.bossDays) || 0;
      return `오늘 깎을 몫은 다 깎았어요${days ? `(보스는 하루에 체력의 1/${days}까지만 깎여요)` : ""}. ${st && st.open === false ? "게임이 열리면" : "지금"} 공격해도 참여 인원에는 들어가요.`;
    }
    if (need > 0) return `쓰러뜨리려면 동료 ${need}명이 더 공격해야 해요. 아직 안 한 동료 ${rest}명에게 한 판 권해 보세요.`;
    return rest > 0 ? `아직 공격 안 한 동료 ${rest}명 — 한 판씩만 해도 훨씬 빨라져요.` : `부서원 모두 공격에 나섰어요! 오늘도 한 판씩 이어 가요.`;
  }

  // 보스 아래 — 우리 부서 vs 보스 (부서가 없으면 지금 1위 부서)
  function vsHtml(d, opts = {}) {
    const mine = myRow(d), list = deps(d), lead = list[0];
    if (!lead) return `<div class="rd-vs__top">${icon("shield", 16)} <b>아직 레이드에 나선 부서가 없어요</b></div>`;
    if (!mine && !started(lead)) {
      return `<div class="rd-vs__top">${icon("crown", 16)} <span>부서 ${num(list.length)}곳이 겨뤄요</span></div>
        <b class="rd-vs__name">아직 아무 부서도 공격하지 않았어요</b>
        <div class="rd-vs__note">먼저 깎는 부서가 1위로 나서요.</div>`;
    }
    const row = mine || lead;
    const ties = tieCount(list, row);
    const down = !!row.defeatedAt;
    const left = remainPct(row);
    const chip = !mine ? ""
      : started(row) ? `<span class="rd-rankchip${row.rank <= 3 ? "" : " is-plain"}">${rankWord(list, row)}</span>`
        : `<span class="rd-rankchip is-plain">아직 공격 전</span>`;
    const who = mine ? `우리 부서` : ties > 1 ? `지금 공동 1위` : `지금 1위`;
    const note = mine ? vsNote(row, list, d.rules, opts.playStatus) : "";
    return `<div class="rd-vs__top">${icon(mine ? "flag" : "crown", 16)} <span>${who}</span>${chip}</div>
      <b class="rd-vs__name">${esc(row.name)}${!mine && ties > 1 ? ` <small>외 ${ties - 1}곳</small>` : ""}</b>
      <div class="rd-bigbar"${down ? ` style="background:repeating-linear-gradient(-45deg, rgba(253,224,71,.45) 0 10px, rgba(253,224,71,.2) 10px 20px)"` : ""}><i data-rd-bar="${esc(row.name)}" data-w="${left}" style="width:${left}%"></i><span>${down ? `격파! ${esc(downAt(row.defeatedAt))}` : `보스 HP ${num(remainHp(row))} / ${num(row.hp)}`}</span></div>
      <div class="rd-vs__meta"><span><b>${pctText(row.pct, down)}</b> 깎았어요</span><span>참여 <b>${num(row.attackers)}</b> / ${num(row.members)}명</span>${row.today ? `<span>오늘 <b>+${num(row.today)}</b></span>` : ""}</div>
      ${note ? `<div class="rd-vs__note">${esc(note)}</div>` : ""}`;
  }

  function rowHtml(r, mineName) {
    const down = !!r.defeatedAt, mine = r.name === mineName, left = remainPct(r);
    const state = down
      ? `<span class="rd-down">${icon("trophy", 13)} 격파 · ${esc(downAt(r.defeatedAt))}</span>`
      : `<span class="rd-down is-pct">${pctText(r.pct)}<small> 깎음</small></span>`;
    const need = Math.max(0, Number(r.needMore) || 0);
    const capped = !down && Number(r.todayMax) > 0 && (Number(r.today) || 0) >= Number(r.todayMax);
    const meta = [
      down ? `<span>HP <b>${num(r.hp)}</b> 모두 깎음${r.overkill ? ` · 그 뒤 +${num(r.overkill)}` : ""}</span>` : `<span>남은 HP <b>${num(remainHp(r))}</b></span>`,
      `<span>참여 <b>${num(r.attackers)}</b>/${num(r.members)}명</span>`,
      r.today ? `<span class="is-today">오늘 +${num(r.today)}${capped ? " · 오늘 몫 다 깎음" : ""}</span>` : `<span class="is-quiet">오늘 아직</span>`,
      // 체력 1로 버티는 중 — 부서원이 더 나서야 쓰러진다
      !down && need > 0 && started(r) && remainHp(r) <= 1 ? `<span class="is-hold">${num(need)}명 더 나서야 쓰러져요</span>` : "",
    ].join("");
    return `<li class="rd-row${mine ? " is-mine" : ""}${down ? " is-down" : ""}">
        <span class="rd-rank${r.rank <= 3 && started(r) ? ` is-${r.rank}` : ""}">${r.rank}</span>
        <div class="rd-row__main">
          ${mine ? `<em class="rd-tag">우리 부서</em>` : ""}<div class="rd-row__top"><b class="rd-row__name">${esc(r.name)}</b>${state}</div>
          <div class="rd-hp${down ? " is-down" : ""}" role="img" aria-label="${esc(r.name)} 보스 남은 체력 ${Math.round(left)}%"><i data-rd-bar="${esc(r.name)}" data-w="${left}" style="width:${left}%"></i></div>
          <div class="rd-row__meta">${meta}</div>
        </div>
      </li>`;
  }

  function boardHtml(d, st) {
    const list = deps(d), mine = myRow(d), mineName = mine ? mine.name : null;
    const downN = list.filter((x) => x.defeatedAt).length;
    const att = list.reduce((n, x) => n + (Number(x.attackers) || 0), 0), mem = list.reduce((n, x) => n + (Number(x.members) || 0), 0);
    const today = list.reduce((n, x) => n + (Number(x.today) || 0), 0);
    let rows;
    if (!list.length) rows = `<div class="rd-empty">이번 주 레이드에 나선 부서가 아직 없어요.<br>첫 공격을 넣어 보세요!</div>`;
    else {
      const open = st.open || list.length <= SHOW_ROWS + 1;
      // 우리 부서가 바로 다음 줄(11번째)이면 '⋯' 없이 한 줄 더 보여 준다
      const cut = list.indexOf(mine) === SHOW_ROWS ? SHOW_ROWS + 1 : SHOW_ROWS;
      const shown = open ? list : list.slice(0, cut);
      const pinned = !open && mine && !shown.includes(mine) ? mine : null;
      rows = `<ol class="rd-list">${shown.map((r) => rowHtml(r, mineName)).join("")}${pinned ? `<li class="rd-gap" aria-hidden="true">⋯</li>${rowHtml(pinned, mineName)}` : ""}</ol>`;
      if (list.length > SHOW_ROWS + 1) rows += `<div class="rd-more"><button type="button" data-rd-more>${open ? "접기" : `부서 ${list.length}곳 모두 보기`}</button></div>`;
    }
    return `<span class="rd-eyebrow">${icon("flag", 15)} 부서 레이스</span>
      <h2 class="rd-h2">누가 먼저 쓰러뜨릴까요?</h2>
      <p class="rd-sub">부서마다 같은 보스와 싸워요. 먼저 쓰러뜨린 부서가 1위, 아직이면 많이 깎은 순서예요.</p>
      ${list.length ? `<div class="rd-sum"><span>격파한 부서 <b>${downN}곳</b></span><span>참여한 사람 <b>${num(att)}/${num(mem)}명</b></span><span>오늘 모든 부서 <b>+${num(today)}</b></span></div>` : ""}
      ${rows}`;
  }

  function ringHtml(v, cap) {
    const r = 46, c = 2 * Math.PI * r, f = cap > 0 ? clamp(v / cap, 0, 1) : 0;
    return `<div class="rd-ring"><svg viewBox="0 0 116 116" aria-hidden="true"><defs><linearGradient id="rd-ring-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f97316"/><stop offset="1" stop-color="#e11d48"/></linearGradient></defs>
      <circle class="is-track" cx="58" cy="58" r="${r}"/><circle class="is-fill" cx="58" cy="58" r="${r}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - f)).toFixed(1)}" data-rd-ring="${(c * (1 - f)).toFixed(1)}" data-c="${c.toFixed(1)}"${f <= 0 ? ` style="opacity:0"` : ""}/></svg>
      <div class="rd-ring__in"><b>${num(v)}</b><small>/ ${num(cap)}</small></div></div>`;
  }

  function meHtml(d, opts) {
    const m = d.mine || {}, rules = d.rules || {}, st = opts.playStatus;
    const closed = st && st.open === false
      ? `<div class="rd-closed">${icon("briefcase", 16)}<span>지금은 업무 시간이라 게임을 쉬어요${st.opensAt ? ` · 오늘 <b>${esc(st.opensAt)}</b>에 다시 열려요` : ""}.</span></div>` : "";
    if (m.excluded || !m.department) {
      // 왜 빠졌는지 — 서버의 excludedReason 을 먼저 쓴다. 없으면(옛 응답) 화면에서 짐작한다
      //   notEmployee: 직원 계정이 아님(시연 · 관리 계정) · noDept: 부서 없음
      //   excludedDept: 부서 대항전에서 빼는 부서(경영진) · solo: 직원이 2명이 안 되는 부서
      const listed = m.department && deps(d).some((x) => x.name === m.department);
      const reason = m.excludedReason
        || (!m.department ? "noDept" : listed ? "notEmployee" : EXCLUDED_DEPTS.includes(m.department) ? "excludedDept" : "solo");
      const dn = m.department ? `「${esc(m.department)}」${josa(m.department, "은", "는")}` : "";
      const why = reason === "noDept" || !m.department
        ? `부서 정보가 없어서 이번 레이드에는 공격이 들어가지 않아요.`
        : reason === "notEmployee"
          ? `이 계정은 레이드에 집계되지 않아요. 레이드는 Teams로 로그인한 직원 계정만 세요.`
          : reason === "excludedDept"
            ? `${dn} 부서 대항전에 나오지 않는 부서예요.`
            : `${dn} 이번 레이드 대상 부서가 아니에요. 레이드는 직원 ${num(rules.minMembers || 2)}명 이상인 부서끼리 겨뤄요.`;
      const own = Number(m.weekDamage) || 0;
      return `<div class="rd-card rd-out">
          <span class="rd-out__ico">${icon("eye", 22)}</span>
          <span class="rd-eyebrow">내 공격</span>
          <h3 class="rd-h3">이번 주는 구경하며 응원해요</h3>
          <p>${why}</p>
          <p>그래도 레이드 현황은 언제든 볼 수 있어요. 다른 부서 동료와 ${withPeers()}하면 동료 부서에는 공격이 들어가요.</p>
          ${own > 0 ? `<div class="rd-weekline" style="margin-top:4px"><span>이번 주 내가 한 공격 (부서 판에는 빠져요)</span><b>${num(own)}</b></div>` : ""}
          <div class="rd-mecta"><a class="rd-btn is-ink" href="/arcade">아케이드</a><a class="rd-btn is-soft" href="${peersHref()}">함께하기</a></div>
          ${closed}
        </div>`;
    }
    const row = myRow(d);
    const cap = Number(m.todayCap || rules.dailyCap) || 0, td = Number(m.todayDamage) || 0;
    const full = cap > 0 && td >= cap;
    // 부서 순위 칩 — 우리 부서가 아직 하나도 못 깎았으면(모두 0%로 같은 순위) 붙이지 않는다
    const rank = row ? (started(row) ? row.rank : null) : m.rank;
    const rankLabel = row ? rankWord(deps(d), row) : `${rank}위`;
    const gold = rank && rank <= 3 && row;
    const items = Array.isArray(m.today) ? m.today : [];
    const msg = full
      ? `<b>오늘 몫을 다 채웠어요!</b><p>내일 또 와 주세요. 남은 힘은 동료에게 맡겨요.</p>`
      : td > 0
        ? `<b>${num(cap - td)} 더 넣을 수 있어요</b><p>한 사람이 하루에 넣는 공격은 ${num(cap)}까지예요. 여럿이 조금씩 하는 쪽이 더 세요.</p>`
        : `<b>오늘은 아직 공격 전이에요</b><p>어떤 게임이든 한 판만 끝내도 공격이 들어가요.</p>`;
    return `<div class="rd-card rd-mecard">
        <div class="rd-mecard__head"><span class="rd-eyebrow">${icon("sword", 15)} 내 공격</span>${rank ? `<span class="rd-rankchip${gold ? "" : " is-plain"}" style="${gold ? "" : "background:var(--rd-mist);color:var(--rd-ink)"}">부서 ${rankLabel}</span>` : ""}</div>
        <div class="rd-mecard__head" style="margin-top:4px"><b>${esc(m.department)}</b></div>
        <div class="rd-gauge">${ringHtml(td, cap)}<div class="rd-gauge__txt${full ? " is-full" : ""}">${msg}</div></div>
        <ul class="rd-today${items.length ? "" : " is-empty"}">${items.length ? items.map((x) => `<li><span>${esc(x.label)}</span><b>+${num(x.dmg)}</b></li>`).join("") : `<li>오늘 넣은 공격이 여기 쌓여요.</li>`}</ul>
        <div class="rd-weekline"><span>이번 주 내 공격</span><b>${num(m.weekDamage)}</b></div>
        <div class="rd-mecta"><a class="rd-btn is-ink" href="/arcade">공격하러 가기</a><a class="rd-btn is-soft" href="${peersHref()}">동료랑 같이</a></div>
        ${closed}
      </div>`;
  }

  function topHtml(d, opts) {
    const m = d.mine || {};
    if (m.excluded || !m.department) return "";
    const list = Array.isArray(d.myDeptTop) ? d.myDeptTop.slice(0, 10) : [];
    const max = list.reduce((n, x) => Math.max(n, Number(x.damage) || 0), 0) || 1;
    const av = (x) => (window.HKUI ? HKUI.avatar(x.name, "md", x.avatarUrl || "") : `<span class="hk-avatar hk-avatar--md">${esc(String(x.name || "?").charAt(0))}</span>`);
    return `<div class="rd-card">
        <span class="rd-eyebrow">${icon("users", 15)} 우리 부서 공격대</span>
        <h3 class="rd-h3">이번 주 많이 넣은 동료</h3>
        ${list.length
          ? `<ol class="rd-tops">${list.map((x, i) => `<li class="${isMe(x, opts.profile) ? "is-me" : ""}"><span class="rd-tops__no">${i + 1}</span>${av(x)}<span class="rd-tops__who"><b>${esc(x.name)}${isMe(x, opts.profile) ? " (나)" : ""}</b><i><em style="width:${Math.max(4, Math.round(((Number(x.damage) || 0) / max) * 100))}%"></em></i></span><span class="rd-tops__dmg">${num(x.damage)}</span></li>`).join("")}</ol>`
          : `<div class="rd-empty" style="margin-top:14px">아직 공격한 동료가 없어요.<br>첫 공격의 주인공이 돼 보세요!</div>`}
      </div>`;
  }

  // 공격 방법 — 서버가 준 sources 를 그대로. key 로 그림만 고른다
  function wayIcon(key) {
    const k = String(key || "").toLowerCase();
    if (/cross/.test(k)) return "users";
    if (/coop|escape|together/.test(k)) return "handshake";
    if (/bot|cpu/.test(k)) return "bot";
    if (/match|versus|duel|vs/.test(k)) return "swords";
    if (/stamp|first|daily|attend/.test(k)) return "stamp";
    if (/best|record|score|top/.test(k)) return "trophy";
    if (/win/.test(k)) return "crown";
    if (/play|game|run|arcade/.test(k)) return "gamepad-2";
    return "zap";
  }
  function rulesHtml(d) {
    const r = d.rules || {}, src = Array.isArray(r.sources) ? r.sources : [];
    const list = deps(d);
    const hpVaries = new Set(list.map((x) => x.hp)).size > 1;
    const hpRule = r.hpPerMember
      ? `보스 체력은 <b>부서 인원 × ${num(r.hpPerMember)}</b>이에요. 큰 부서도 작은 부서도 한 사람 몫은 같아요.`
      : hpVaries ? `보스 체력은 부서 인원에 맞춰 달라요. 작은 부서도 똑같이 겨룰 수 있어요.` : "";
    return `<span class="rd-eyebrow">${icon("book-open", 15)} 규칙</span>
      <h2 class="rd-h2">이렇게 공격해요</h2>
      <p class="rd-sub">아케이드에서 하는 모든 게임이 우리 부서 보스에게 들어가요.</p>
      ${src.length ? `<ul class="rd-ways">${src.map((s) => `<li class="rd-way"><span class="rd-way__ico">${icon(wayIcon(s.key), 20)}</span><span><b>${esc(s.label)}</b>${s.note ? `<p>${esc(s.note)}</p>` : ""}</span><span class="rd-way__dmg">+${num(s.dmg)}</span></li>`).join("")}</ul>` : ""}
      ${r.crossBonus ? `<div class="rd-cross"><span class="rd-cross__ico">${icon("handshake", 22)}</span><span><b>다른 부서 동료와 ${withPeers()}하면 두 부서 모두 보너스</b><p>판이 끝나면 나와 동료의 부서에 <em>+${num(r.crossBonus)}</em>씩 더 들어가요. 옆 부서 동료에게 먼저 말 걸어 보세요.</p></span></div>` : ""}
      <ul class="rd-facts">
        ${Array.isArray(r.notes) && r.notes.length
          // 서버가 준 규칙 문장(하루 한도 · 보스가 하루에 깎이는 양 · 참여 인원 · 순위)을 그대로
          ? r.notes.map((t) => `<li><span>•</span><span>${esc(t)}</span></li>`).join("")
          : `${r.dailyCap ? `<li><span>•</span><span>한 사람이 하루에 넣을 수 있는 공격은 <b>${num(r.dailyCap)}</b>까지예요. 몇 사람이 오래 하는 것보다 <b>여럿이 조금씩</b> 하는 쪽이 세요.</span></li>` : ""}
        <li><span>•</span><span>먼저 쓰러뜨린 부서가 1위예요. 일요일 밤까지 못 쓰러뜨리면 많이 깎은 순서로 정해요.</span></li>`}
        ${hpRule ? `<li><span>•</span><span>${hpRule}</span></li>` : ""}
        <li><span>•</span><span>직원 <b>${num(r.minMembers || 2)}명</b> 이상인 부서끼리 겨뤄요.</span></li>
        <li><span>•</span><span>매주 월요일 0시에 새 보스가 나타나요.</span></li>
      </ul>`;
  }

  function historyHtml(d) {
    const h = Array.isArray(d.history) ? d.history.slice(0, 4) : [];
    const mineName = (d.mine && !d.mine.excluded && d.mine.department) || null;
    return `<span class="rd-eyebrow">${icon("history", 15)} 지난 레이드</span>
      <h2 class="rd-h2">명예의 부서</h2>
      ${h.length
        ? `<ol class="rd-hist">${h.map((x) => {
            const bk = (x.boss && x.boss.key) || "";
            const pod = Array.isArray(x.podium) ? x.podium.slice(0, 3) : [];
            return `<li><span class="rd-hist__art" style="${skyVars(bk)}">${bossArt(bk, { still: true, label: x.boss && x.boss.name })}</span>
              <span><small>${esc(weekOf(x.week))}</small><b>${esc((x.boss && x.boss.name) || BOSS_NAMES[bk] || "")}</b>
              ${pod.length ? `<span class="rd-pod">${pod.map((n, i) => `<span class="${n === mineName ? "is-mine" : ""}"><i>${i + 1}</i>${esc(n)}</span>`).join("")}</span>` : `<span class="rd-hist__none">그 주엔 보스를 깎은 부서가 없었어요</span>`}</span></li>`;
          }).join("")}</ol>`
        : `<div class="rd-empty" style="margin-top:18px">이번 주가 첫 레이드예요!<br>끝나면 1~3위 부서가 여기 남아요.</div>`}`;
  }

  // ── 그리기 ───────────────────────────────────────────────────
  // 막대 · 고리를 앞 값(처음엔 꽉 찬 체력)에서 새 값으로 움직인다
  function animateBars(root, prevMap, first) {
    const bars = root.querySelectorAll("[data-rd-bar]");
    if (reduce()) return;
    bars.forEach((el) => {
      const to = Number(el.dataset.w) || 0;
      const from = first ? 100 : prevMap && prevMap.has(el.dataset.rdBar) ? prevMap.get(el.dataset.rdBar) : to;
      if (from === to) return;
      el.style.transition = "none";
      el.style.width = `${from}%`;
      void el.offsetWidth;
      el.style.transition = "";
      requestAnimationFrame(() => { el.style.width = `${to}%`; });
    });
    if (first) {
      root.querySelectorAll("[data-rd-ring]").forEach((el) => {
        el.style.transition = "none";
        el.style.strokeDashoffset = el.dataset.c;
        void el.getBoundingClientRect();
        el.style.transition = "";
        requestAnimationFrame(() => { el.style.strokeDashoffset = el.dataset.rdRing; });
      });
    }
  }
  function hitFx(root, delta) {
    const boss = root.querySelector("[data-rd-boss]");
    if (!boss || delta <= 0 || reduce() || boss.classList.contains("is-down")) return;
    boss.classList.remove("is-hit");
    void boss.offsetWidth;
    boss.classList.add("is-hit");
    const n = document.createElement("span");
    n.className = "rd-hit";
    n.textContent = `-${num(delta)}`;
    boss.appendChild(n);
    setTimeout(() => { n.remove(); boss.classList.remove("is-hit"); }, 1700);
  }

  function render(container, data, opts = {}) {
    ensureCss();
    if (!container || !data) return;
    const st = container.__rd || (container.__rd = { open: false });
    const d = data, key = (d.boss && d.boss.key) || "";
    const prev = st.data;
    st.data = d; st.opts = opts;
    const prevMap = new Map(deps(prev).map((x) => [x.name, remainPct(x)]));
    const same = prev && ((prev.boss && prev.boss.key) || "") === key && (prev.week && prev.week.start) === (d.week && d.week.start) && container.querySelector(".rd-hero");
    const gridCls = `rd-grid${d.mine && (d.mine.excluded || !d.mine.department) ? " is-solo" : ""}`;
    if (!same) {
      container.classList.add("rd");
      container.innerHTML = heroHtml(d, opts)
        + `<section class="rd-main"><div class="rd-wrap ${gridCls}" data-rd-grid>
            <div class="rd-board" data-rd-part="board">${boardHtml(d, st)}</div>
            <div class="rd-me" data-rd-part="me">${meHtml(d, opts)}</div>
            <div class="rd-top" data-rd-part="top">${topHtml(d, opts)}</div>
          </div></section>
          <section class="rd-info"><div class="rd-wrap rd-grid2">
            <div class="rd-card" data-rd-part="rules">${rulesHtml(d)}</div>
            <div class="rd-card" data-rd-part="history">${historyHtml(d)}</div>
          </div></section>`;
      if (!container.__rdBound) {
        container.__rdBound = true;
        container.addEventListener("click", (e) => {
          const more = e.target.closest("[data-rd-more]");
          if (!more) return;
          const s = container.__rd;
          s.open = !s.open;
          const part = container.querySelector('[data-rd-part="board"]');
          part.innerHTML = boardHtml(s.data, s);
          if (window.HKUI) HKUI.refreshIcons(part);
          if (!s.open) part.scrollIntoView({ block: "start", behavior: reduce() ? "auto" : "smooth" });
        });
      }
      if (window.HKUI) HKUI.refreshIcons(container);
      animateBars(container, null, true);
    } else {
      const set = (part, html) => { const el = container.querySelector(`[data-rd-part="${part}"]`); if (el) el.innerHTML = html; };
      const grid = container.querySelector("[data-rd-grid]");
      if (grid) grid.className = `rd-wrap ${gridCls}`;
      set("vs", vsHtml(d, opts)); set("board", boardHtml(d, st)); set("me", meHtml(d, opts)); set("top", topHtml(d, opts));
      set("rules", rulesHtml(d)); set("history", historyHtml(d));
      const boss = container.querySelector("[data-rd-boss]"), mine = myRow(d);
      if (boss) {
        const was = boss.classList.contains("is-down"), now = !!(mine && mine.defeatedAt);
        if (now && !was) { boss.classList.add("is-down"); boss.insertAdjacentHTML("beforeend", stampHtml(mine, deps(d))); }
        if (!now && was) { boss.classList.remove("is-down"); boss.querySelector(".rd-stamp")?.remove(); }
      }
      if (window.HKUI) HKUI.refreshIcons(container);
      animateBars(container, prevMap, false);
      // 우리 부서(없으면 1위 부서)에 새로 들어간 공격만큼 보스가 움찔한다
      const pick = (x) => { const r = myRow(x) || deps(x)[0]; return r ? { name: r.name, dmg: (Number(r.damage) || 0) + (Number(r.overkill) || 0) } : null; };
      const a = pick(prev), b = pick(d);
      if (a && b && a.name === b.name) hitFx(container, b.dmg - a.dmg);
    }
    tickClock(container);
  }

  function tickClock(container) {
    const st = container.__rd;
    if (!st) return;
    clearInterval(st.clock);
    const el = () => container.querySelector("[data-rd-left]");
    const upd = () => {
      const e = el();
      if (!e) { clearInterval(st.clock); return; }
      const html = leftHtml(st.data && st.data.week && st.data.week.endsAt);
      if (e.innerHTML !== html) e.innerHTML = html;
    };
    upd();
    st.clock = setInterval(upd, 1000);
  }

  // /raid — 불러와 그리고, 보이는 동안 60초마다 새로 고친다
  function mount(container, opts = {}) {
    ensureCss();
    if (!container) return;
    const st = container.__rd || (container.__rd = { open: false });
    clearInterval(st.timer);
    let busy = false, last = 0, status = opts.playStatus || null;
    const refresh = async (first) => {
      if (busy) return;
      busy = true;
      try {
        const [d, ps] = await Promise.all([
          load(),
          // 게임 가능 시간(점심 · 퇴근 후)은 하루 중에 바뀌므로 매번 다시 묻는다
          window.HKApi && HKApi.playStatus ? HKApi.playStatus().catch(() => null) : Promise.resolve(status),
        ]);
        status = ps || status;
        last = Date.now();
        render(container, d, { ...opts, playStatus: status });
        // 주가 바뀌는 순간(월요일 0시)이 지나면 바로 새 보스를 부른다 — 한 번만.
        // PC 시계가 서버보다 빨라 그 뒤에도 지난주가 오면 서두르지 않고 60초 새로 고침에 맡긴다
        const wait = Date.parse(d && d.week && d.week.endsAt) - Date.now();
        clearTimeout(st.weekTimer);
        if (isFinite(wait) && wait > -WEEK_GRACE && wait < REFRESH_MS * 2) st.weekTimer = setTimeout(() => refresh(true), wait + WEEK_GRACE);
      } catch (e) {
        if (!st.data) {
          container.classList.add("rd");
          container.innerHTML = `<div class="rd-err"><b>레이드 정보를 불러오지 못했어요</b><p>잠시 뒤 다시 해 볼게요. 계속 안 되면 새로 고침해 주세요.</p><button type="button" class="rd-btn is-ink" data-rd-retry>다시 불러오기</button></div>`;
          container.querySelector("[data-rd-retry]")?.addEventListener("click", () => refresh(true));
        }
      } finally { busy = false; }
    };
    refresh(true);
    st.timer = setInterval(() => { if (document.visibilityState === "visible") refresh(false); }, REFRESH_MS);
    if (!st.visBound) {
      st.visBound = true;
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && Date.now() - last > REFRESH_MS) refresh(false);
      });
    }
  }

  // ── 작은 카드 ────────────────────────────────────────────────
  function widgetHtml(d) {
    const b = d.boss || {}, key = b.key, m = d.mine || {}, mine = myRow(d), list = deps(d);
    // 우리 부서가 없으면 1위 부서 — 단, 아무도 못 깎았으면(모두 0%로 같은 1위) 부서를 내세우지 않는다
    const row = mine || (started(list[0]) ? list[0] : null);
    const down = !!(row && row.defeatedAt), left = remainPct(row);
    const name = b.name || BOSS_NAMES[key] || "이번 주 보스";
    const title = mine ? `우리 부서 vs ${name}` : name;
    const meta = [];
    if (row && !started(row)) meta.push(`<span><b>아직 공격 전</b></span>`, `<span>부서 ${num(list.length)}곳이 겨뤄요</span>`);
    else if (row) {
      const ties = tieCount(list, row);
      meta.push(down ? `<span><em>격파!</em> ${esc(downAt(row.defeatedAt))}</span>` : `<span><b>${pctText(row.pct)}</b> 깎음</span>`);
      meta.push(mine ? `<span><b>${rankWord(list, row)}</b> / ${num(list.length)}개 부서</span>` : `<span>${ties > 1 ? "공동 1위" : "1위"} <b>${esc(row.name)}</b>${ties > 1 ? ` 외 ${ties - 1}곳` : ""}</span>`);
    }
    if (mine) meta.push(`<span>오늘 내 공격 <b>${num(m.todayDamage)}</b> / ${num(m.todayCap || (d.rules && d.rules.dailyCap))}</span>`);
    else if (!row) meta.push(list.length ? `<span>부서 ${num(list.length)}곳이 첫 공격을 기다려요</span>` : `<span>첫 공격을 기다리고 있어요</span>`);
    const lt = leftShort(d.week && d.week.endsAt);
    return `<a class="rdw" href="/raid" style="${skyVars(key)}" aria-label="부서 대항 레이드 보기">
        <span class="rdw-art">${bossArt(key, { label: name })}</span>
        <span class="rdw-body">
          <span class="rdw-kicker">부서 대항 레이드${lt ? ` <span>${esc(lt)}</span>` : ""}</span>
          <span class="rdw-title">${esc(title)}</span>
          ${row ? `<span class="rdw-hp${down ? " is-down" : ""}"><i style="width:${left}%"></i></span>` : ""}
          <span class="rdw-meta">${meta.join("")}</span>
        </span>
        <span class="rdw-go">레이드 보기 ›</span>
      </a>`;
  }
  async function renderWidget(container, data) {
    ensureCss();
    if (!container) return null;
    let d = data;
    if (!d) {
      try { d = await load(); } catch (_) { d = null; }
    }
    if (!d || !d.boss) { container.innerHTML = ""; container.hidden = true; return null; }
    container.hidden = false;
    container.classList.add("rdw-host");
    container.innerHTML = widgetHtml(d);
    return d;
  }

  return { load, mount, render, renderWidget, bossArt, bossPalette: palOf, BOSS_KEYS, BOSS_NAMES };
})();
