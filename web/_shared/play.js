/**
 * 라운지 — 게임 페이지 공통 틀
 *
 * HKPlay.mountGame({ key, setup(stage, ctx) })
 *   stage : 게임이 그릴 빈 영역 (가로 최대 560px)
 *   ctx   : {
 *     key, game, profile, today("YYYY-MM-DD", KST),
 *     dailyDone   — 오늘의 도전 게임을 오늘 이미 해서 이번 판은 연습(순위 미반영)
 *     rng(salt)   — 같은 날·같은 게임이면 모두 같은 수열 (오늘의 문제 출제용)
 *     begin()     → Promise<boolean> — 오늘의 도전 게임은 [시작] 때 반드시 호출. 오늘 첫 시작이면 true(순위 반영),
 *                   이미 시작했던 날이면 false(연습) — 문제를 본 뒤 새로고침해 다시 하는 것을 막는다
 *     submit(score) → Promise — 점수 저장 + 결과 창 + 순위표 새로고침
 *     onRestart(fn) — 판이 끝난 뒤 스페이스를 누르면 부른다 (처음 상태로 되돌리는 함수)
 *     onPause(fn)   — 게임 중 Esc 를 누르면 부른다 (게임의 일시정지 함수 — 플레이 중이 아니면 아무것도 안 하게).
 *                     일시정지 화면에는 "계속하기" 글자가 든 버튼을 두면 Esc·스페이스로 이어 하기가 된다
 *     stageStamp()  → Promise — 판 중간 도장(한 판이 긴 게임이 스테이지 하나를 통과했을 때). 오늘 첫 도장이면 알림
 *     onLeaveNote(fn) — 나가기 확인 창 안내 말(fn() → 글 또는 null). 중간 저장되는 게임이 「이어 할 수 있어요」를 알릴 때
 *     formatScore(n)
 *     sfx(name, arg) — 효과음 (HKSound 이름 목록 참고). 소리 켜고 끄기는 공통 버튼이 맡는다
 *   }
 */
// 휴대폰은 화면을 초당 60번까지만 그린다 — 90~120Hz 화면에서 배터리를 아끼려고, 화면 주사율이 높아도 게임 속도는 그대로
(function limitFps() {
  if (!window.matchMedia("(pointer: coarse)").matches) return;
  const MIN_GAP = 10.5; // 120Hz는 한 번 걸러 60번, 90Hz 이하는 그대로
  const nativeRaf = window.requestAnimationFrame.bind(window);
  const nativeCancel = window.cancelAnimationFrame.bind(window);
  const live = new Map();
  let nextId = 1, lastT = -1000;
  window.requestAnimationFrame = (cb) => {
    const id = nextId++;
    const tick = (t) => {
      if (t !== lastT && t - lastT < MIN_GAP) { live.set(id, nativeRaf(tick)); return; }
      lastT = t;
      live.delete(id);
      cb(t);
    };
    live.set(id, nativeRaf(tick));
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    if (live.has(id)) nativeCancel(live.get(id));
    live.delete(id);
  };
})();

/**
 * 라운지 효과음 — 소리 파일 없이 Web Audio 로 바로 만든다.
 * HKPlay.sfx(name, arg) 로 부르고, 켜고 끄기는 게임 머리의 🔊 버튼(모든 게임 공통, 기억됨).
 * 기본은 켜짐. 브라우저 정책상 첫 클릭·키 입력 뒤부터 소리가 난다.
 *
 * 이름: tap select pop coin jump land hit hurt explode shoot laser powerup drop line
 *       combo(단계 1~) success fail win lose countdown go tick whoosh swap invalid
 */
window.HKSound = (function () {
  const KEY = "hk-play-muted";
  let ac = null;
  let master = null;
  let muted = (() => {
    try {
      return localStorage.getItem(KEY) === "1";
    } catch (_) {
      return false;
    }
  })();
  const listeners = [];
  const lastAt = {};

  function ensure() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      // '배경음'으로 — '음악 재생(playback)'이면 아이폰이 사이트를 음악 앱처럼 잠금화면 · 제어 센터에
      // 「재생 중」으로 띄운다. 대신 무음 모드에서는 게임 소리가 안 나고, 듣던 음악은 멈추지 않는다
      try { if (navigator.audioSession) navigator.audioSession.type = "ambient"; } catch (_) {}
      ac = new AC();
      master = ac.createGain();
      master.gain.value = 0.32;
      master.connect(ac.destination);
    }
    // 아이폰은 suspended 뿐 아니라 interrupted(전화·다른 앱 소리 뒤)로도 멈춘다
    if (ac.state !== "running") ac.resume().catch(() => {});
    return ac;
  }
  // 화면을 떠나면(폰 잠금 · 다른 앱 · 다른 탭) 소리 장치를 닫는다 — 아이폰 잠금화면·제어 센터에
  // 사이트 주소가 '재생 중'으로 남지 않게. 돌아와서 화면을 누르면 다시 연다
  function release() {
    if (!ac) return;
    const old = ac;
    ac = null; master = null; noiseBuf = null; hum = null;
    try { old.close().catch(() => {}); } catch (_) { /* 이미 닫힘 */ }
  }
  document.addEventListener("visibilitychange", () => { if (document.hidden) release(); });
  window.addEventListener("pagehide", release);
  // 입력할 때마다 오디오 잠금 해제 — 아이폰은 touchend·click 같은 '손을 뗄 때' 입력에서만 풀리고,
  // 게임 판은 길게 누르기를 막느라 click 이 안 생기므로 손을 뗄 때(pointerup·touchend)도 듣는다
  ["pointerdown", "pointerup", "touchstart", "touchend", "click", "keydown"].forEach((t) =>
    window.addEventListener(t, () => !muted && ensure(), { passive: true, capture: true })
  );

  // 기본 음 — 주파수 f 에서 f2 로 미끄러지며 t초
  function tone({ type = "square", f = 440, f2 = null, t = 0.1, v = 0.25, delay = 0, attack = 0.004 }) {
    const now = ac.currentTime + delay;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, now);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), now + t);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(v, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + t);
    o.connect(g).connect(master);
    o.start(now);
    o.stop(now + t + 0.02);
  }
  let noiseBuf = null;
  function noise({ t = 0.2, v = 0.3, f = 1200, f2 = null, q = 0.8, delay = 0, type = "bandpass" }) {
    if (!noiseBuf) {
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const now = ac.currentTime + delay;
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const flt = ac.createBiquadFilter();
    flt.type = type;
    flt.frequency.setValueAtTime(f, now);
    if (f2) flt.frequency.exponentialRampToValueAtTime(f2, now + t);
    flt.Q.value = q;
    const g = ac.createGain();
    g.gain.setValueAtTime(v, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + t);
    src.connect(flt).connect(g).connect(master);
    src.start(now);
    src.stop(now + t + 0.02);
  }
  const notes = (list, type = "square", step = 0.07, v = 0.22, len = 0.09) =>
    list.forEach((f, i) => tone({ type, f, t: len, v, delay: i * step }));

  const SFX = {
    tap: () => tone({ type: "triangle", f: 700, f2: 520, t: 0.05, v: 0.22 }),
    select: () => tone({ type: "triangle", f: 880, t: 0.06, v: 0.2 }),
    swap: () => tone({ type: "triangle", f: 420, f2: 640, t: 0.08, v: 0.18 }),
    invalid: () => notes([260, 200], "square", 0.06, 0.14, 0.07),
    pop: () => { tone({ type: "sine", f: 520, f2: 1100, t: 0.08, v: 0.3 }); noise({ t: 0.05, v: 0.12, f: 3000 }); },
    coin: () => notes([988, 1319], "square", 0.06, 0.16, 0.1),
    jump: () => tone({ type: "square", f: 300, f2: 760, t: 0.14, v: 0.16 }),
    land: () => noise({ t: 0.06, v: 0.2, f: 400, type: "lowpass" }),
    hit: () => { tone({ type: "square", f: 220, f2: 110, t: 0.08, v: 0.2 }); noise({ t: 0.06, v: 0.15, f: 1800 }); },
    hurt: () => { tone({ type: "sawtooth", f: 330, f2: 90, t: 0.3, v: 0.22 }); noise({ t: 0.18, v: 0.15, f: 900 }); },
    explode: () => { noise({ t: 0.45, v: 0.45, f: 1400, f2: 120, type: "lowpass", q: 0.5 }); tone({ type: "sine", f: 140, f2: 40, t: 0.35, v: 0.35 }); },
    shoot: () => tone({ type: "square", f: 1200, f2: 380, t: 0.07, v: 0.09 }),
    laser: () => tone({ type: "sawtooth", f: 1600, f2: 300, t: 0.16, v: 0.12 }),
    powerup: () => notes([523, 659, 784, 1047], "square", 0.055, 0.16, 0.08),
    drop: () => { tone({ type: "triangle", f: 180, f2: 90, t: 0.09, v: 0.25 }); noise({ t: 0.05, v: 0.12, f: 600, type: "lowpass" }); },
    line: () => { notes([660, 880, 1175], "square", 0.05, 0.16, 0.1); noise({ t: 0.25, v: 0.12, f: 5000, f2: 1500, type: "highpass" }); },
    combo: (n = 1) => {
      const scale = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760];
      const f = scale[Math.min(scale.length - 1, Math.max(0, n - 1))];
      tone({ type: "square", f, t: 0.09, v: 0.17 });
      tone({ type: "square", f: f * 1.5, t: 0.09, v: 0.1, delay: 0.05 });
    },
    success: () => notes([784, 1047], "triangle", 0.08, 0.24, 0.12),
    fail: () => notes([311, 233], "square", 0.11, 0.16, 0.14),
    win: () => notes([523, 659, 784, 1047, 784, 1047], "square", 0.09, 0.16, 0.12),
    lose: () => notes([392, 330, 262, 196], "triangle", 0.13, 0.22, 0.18),
    countdown: () => tone({ type: "square", f: 660, t: 0.12, v: 0.16 }),
    go: () => tone({ type: "square", f: 1320, t: 0.28, v: 0.18 }),
    tick: () => tone({ type: "square", f: 1800, t: 0.025, v: 0.08 }),
    whoosh: () => noise({ t: 0.25, v: 0.2, f: 400, f2: 2600, q: 1.5 }),
    // 심야 편의점
    sizzle: () => noise({ t: 0.12, v: 0.2, f: 5200, f2: 2200, q: 1 }),
    squeak: () => { tone({ type: "sine", f: 1900, f2: 2700, t: 0.07, v: 0.14 }); tone({ type: "sine", f: 2500, f2: 1500, t: 0.09, v: 0.12, delay: 0.07 }); },
    webshot: () => { tone({ type: "triangle", f: 900, f2: 260, t: 0.13, v: 0.12 }); noise({ t: 0.1, v: 0.08, f: 2600 }); },
    ghost: () => { tone({ type: "sine", f: 520, f2: 180, t: 0.7, v: 0.13, attack: 0.1 }); tone({ type: "sine", f: 548, f2: 190, t: 0.7, v: 0.09, attack: 0.1 }); },
    growl: () => { tone({ type: "sawtooth", f: 70, f2: 42, t: 1.1, v: 0.3, attack: 0.1 }); noise({ t: 0.9, v: 0.18, f: 260, f2: 90, type: "lowpass" }); },
    buzz: () => { [0, 0.05, 0.13].forEach((delay) => tone({ type: "sawtooth", f: 120, t: 0.04, v: 0.09, delay })); },
    // 야간 퍼레이드 — 오르골 음(단조 음계 번호) · 박자 나무 소리 · 작은 찰랑 소리. delay 초 뒤에 울린다
    mbox: ({ n = 0, delay = 0 } = {}) => tone({ type: "triangle", f: [440, 494, 523, 587, 659, 698, 784, 880][n % 8], t: 0.3, v: 0.16, delay }),
    bass: ({ f = 110, delay = 0 } = {}) => tone({ type: "square", f, t: 0.2, v: 0.07, delay }),
    beat: ({ delay = 0, strong = false } = {}) => { tone({ type: "triangle", f: strong ? 1100 : 900, f2: 420, t: 0.06, v: strong ? 0.3 : 0.22, delay }); noise({ t: 0.03, v: 0.1, f: 3200, delay }); },
    shake: ({ delay = 0 } = {}) => noise({ t: 0.03, v: 0.05, f: 7000, delay }),
  };

  function play(name, arg) {
    if (muted || !SFX[name]) return;
    // 아직 화면을 한 번도 누르지 않았으면(Teams 링크로 바로 들어온 경우 등) 어차피 소리가 안 나고 브라우저 경고만 쌓인다
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    // 같은 소리가 한꺼번에 몰리면 귀가 아프니 25ms 안의 중복은 건너뜀
    const now = performance.now();
    if (lastAt[name] && now - lastAt[name] < 25) return;
    lastAt[name] = now;
    if (!ensure() || ac.state !== "running") return; // 아직 잠금이 안 풀렸으면 이번 소리는 건너뛴다
    try {
      SFX[name](arg);
    } catch (_) {
      /* 소리는 부가 기능 — 실패해도 게임은 계속 */
    }
  }
  // 낮게 깔리는 소리(심야 편의점 냉장고 웅웅거림) — 켜 두는 동안 계속 난다. 소리를 끄면 함께 멈춘다
  let hum = null, humWanted = false;
  function stopHum() {
    if (!hum) return;
    const h = hum; hum = null;
    try {
      h.g.gain.setTargetAtTime(0.0001, ac.currentTime, 0.1);
      h.oscs.forEach((o) => o.stop(ac.currentTime + 0.5));
    } catch (_) { /* 이미 멈춤 */ }
  }
  function startHum() {
    if (hum || muted || !ensure() || ac.state !== "running") return;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, ac.currentTime);
    g.gain.setTargetAtTime(0.1, ac.currentTime, 0.6);
    g.connect(master);
    const oscs = [58, 117].map((f, i) => {
      const o = ac.createOscillator();
      o.type = i ? "triangle" : "sine";
      o.frequency.value = f;
      o.connect(g);
      o.start();
      return o;
    });
    hum = { g, oscs };
  }
  function ambient(on) {
    humWanted = !!on;
    try { if (on) startHum(); else stopHum(); } catch (_) { /* 소리는 부가 기능 */ }
  }
  // 첫 입력 전이라 못 켰으면 소리 잠금이 풀릴 때 켠다
  ["pointerdown", "touchend", "click", "keydown"].forEach((t) =>
    window.addEventListener(t, () => { if (humWanted && !hum) setTimeout(() => { try { startHum(); } catch (_) {} }, 50); }, { passive: true })
  );
  function setMuted(m) {
    muted = !!m;
    if (muted) stopHum(); else if (humWanted) setTimeout(() => { try { startHum(); } catch (_) {} }, 50);
    try {
      localStorage.setItem(KEY, muted ? "1" : "0");
    } catch (_) {
      /* 저장 못 해도 이번 화면에서는 적용 */
    }
    if (!muted) ensure();
    listeners.forEach((fn) => fn(muted));
  }
  return {
    play,
    isMuted: () => muted,
    setMuted,
    toggle: () => setMuted(!muted),
    onChange: (fn) => listeners.push(fn),
    ambient,
    // 소리 시계 — 음악에 맞추는 게임은 화면 대신 이 시계로 시간을 잰다 (소리가 안 켜졌으면 null)
    now: () => (ac && ac.state === "running" ? ac.currentTime : null),
    latency: () => (ac ? ac.outputLatency || ac.baseLatency || 0 : 0),
    names: Object.keys(SFX),
  };
})();

window.HKPlay = (function () {
  const PERIODS = [
    ["today", "오늘"],
    ["week", "이번 주"],
    ["all", "전체"],
    ["dept", "부서"],
  ];

  // 게임별 색 (라운지 카드 · 게임 머리) — [시작, 끝]
  const TINTS = {
    stairs: ["#1b2459", "#5a36b8"],
    match3: ["#ff7a59", "#ffb648"],
    crossing: ["#16a06a", "#7bd389"],
    blocks: ["#2f6bff", "#45c3ff"],
    gomoku: ["#92400e", "#d97706"],
    chess: ["#334155", "#64748b"],
    escape: ["#0f172a", "#1e3a8a"],
    kitchen: ["#c2410c", "#f59e0b"],
    words: ["#312e81", "#7c3aed"],
    maze: ["#0b1120", "#334155"],
    dodge: ["#1e3a8a", "#f59e0b"],
    bounce: ["#e11d48", "#fb7185"],
    sketch: ["#0f766e", "#2dd4bf"],
    sync: ["#be185d", "#f472b6"],
    spotdiff: ["#7c2d12", "#ea580c"],
    baseball: ["#14532d", "#22c55e"],
    boxes: ["#1d4ed8", "#60a5fa"],
    quizduel: ["#6d28d9", "#a78bfa"],
    gostop: ["#14532d", "#b91c1c"],
    memory: ["#0369a1", "#38bdf8"],
    fighter: ["#1e1b4b", "#db2777"],
    vitamin: ["#14532d", "#f97316"],
    jumper: ["#0369a1", "#facc15"],
    paperjet: ["#312e81", "#38bdf8"],
    rummy: ["#9a3412", "#f59e0b"],
    alkkagi: ["#1f2937", "#a16207"],
    watersort: ["#0e7490", "#a855f7"],
    deskpop: ["#5b21b6", "#facc15"],
    acornshot: ["#315d49", "#d9a263"],
    moonshot: ["#1b1f4b", "#ffcf4a"],
    ferry: ["#0b5f86", "#ffb02e"],
    ringcatch: ["#9a3412", "#f97316"],
    hoops: ["#c2410c", "#ff5a36"],
    slingfort: ["#e8762c", "#7a4520"],
    mansion: ["#1e1b4b", "#a78bfa"],
    bumpervs: ["#7c2d12", "#fb923c"],
    jellyvs: ["#3b1d6e", "#ff7ac8"],
    holecity: ["#2b2f3a", "#ff6b1a"],
    vinyl: ["#1a1026", "#ff5e4d"],
    nightsquad: ["#141d42", "#ff9a3c"],
    frostcamp: ["#1e6fb8", "#8fd8ff"],
    sundown: ["#7c2d12", "#fb923c"],
    jelly: ["#3b1d6e", "#ff7ac8"],
    kitsune: ["#7c2d12", "#f97316"],
    eggfarm: ["#a16207", "#facc15"],
    herorush: ["#1d4ed8", "#ef4444"],
    traffic: ["#2b3350", "#3ecf6e"],
    screwout: ["#92400e", "#f59e0b"],
    boltup: ["#475569", "#22c55e"],
    soccer: ["#166534", "#84cc16"],
    volley: ["#0ea5e9", "#ff7a3d"],
    pairs: ["#0f8b8d", "#57cc99"],
    shooter: ["#2b1055", "#d53369"],
    bricks: ["#c2410c", "#fb923c"],
    bubble: ["#06b6d4", "#a78bfa"],
    sudoku: ["#334155", "#64748b"],
    chosung: ["#e0508a", "#ff9a8b"],
    nightshift: ["#0b0f1a", "#3b4a6b"],
    clown: ["#1a0b2e", "#6b1d3a"],
    milk: ["#0c1a3a", "#1e4e79"],
    theater: ["#2a0a12", "#6b1426"],
    trial: ["#06302c", "#0f766e"],
    silent: ["#1c1917", "#57534e"],
    parade: ["#1e0a3c", "#a21caf"],
    finale: ["#3b0a0a", "#b45309"],
    typing: ["#4f46e5", "#a78bfa"],
    trivia: ["#0891b2", "#22d3ee"],
    korean: ["#b45309", "#facc15"],
    snake: ["#15803d", "#84cc16"],
    stack: ["#0e7490", "#67e8f9"],
    coffee: ["#92400e", "#fbbf24"],
    mines: ["#1f2937", "#f43f5e"],
    promote: ["#312e81", "#818cf8"],
  };

  function todayKst() {
    const kst = new Date(Date.now() + 9 * 3600 * 1000);
    return kst.toISOString().slice(0, 10);
  }

  // 문자열 → 32비트 시드 → mulberry32
  // 도트 그림을 2배로 옮기며 계단진 모서리만 다듬는다 (Scale2x) — 도트 느낌은 남고 윤곽이 매끄러워진다
  let px2Out = null;
  function smoothPixels(src, out) {
    const W = src.width, H = src.height;
    const from = new Uint32Array(src.getContext("2d").getImageData(0, 0, W, H).data.buffer);
    if (!px2Out || px2Out.width !== W * 2 || px2Out.height !== H * 2) px2Out = out.createImageData(W * 2, H * 2);
    const to = new Uint32Array(px2Out.data.buffer);
    for (let y = 0; y < H; y++) {
      const up = y > 0 ? y - 1 : y, dn = y < H - 1 ? y + 1 : y;
      for (let x = 0; x < W; x++) {
        const lf = x > 0 ? x - 1 : x, rt = x < W - 1 ? x + 1 : x;
        const e = from[y * W + x], b = from[up * W + x], h = from[dn * W + x], d = from[y * W + lf], f = from[y * W + rt];
        const i = y * 2 * W * 2 + x * 2, j = i + W * 2;
        if (b !== h && d !== f) {
          to[i] = d === b ? d : e; to[i + 1] = b === f ? f : e;
          to[j] = d === h ? d : e; to[j + 1] = h === f ? f : e;
        } else {
          to[i] = to[i + 1] = to[j] = to[j + 1] = e;
        }
      }
    }
    out.setTransform(1, 0, 0, 1, 0, 0);
    out.putImageData(px2Out, 0, 0);
  }

  function seededRng(seedText) {
    let h = 1779033703 ^ seedText.length;
    for (let i = 0; i < seedText.length; i++) {
      h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    let a = h >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 사람에게 보여 주는 수 — 천 단위 쉼표(1,234)
  const nf = (n) => Number(n || 0).toLocaleString("ko-KR");
  function formatScore(game, n) {
    if (n == null) return "-";
    if (game?.unit === "centi") {
      const m = Math.floor(n / 6000);
      const sec = Math.floor((n % 6000) / 100);
      return `${m}:${String(sec).padStart(2, "0")}.${String(n % 100).padStart(2, "0")}`;
    }
    if (game?.unit === "time") {
      const m = Math.floor(n / 60);
      const s = n % 60;
      return `${m}:${String(s).padStart(2, "0")}`;
    }
    return `${Number(n).toLocaleString("ko-KR")}${game?.unit ? `<small>${HKUI.escapeHtml(game.unit)}</small>` : ""}`;
  }

  function tintStyle(key) {
    const [a, b] = TINTS[key] || ["#334155", "#64748b"];
    return `background:linear-gradient(135deg, ${a}, ${b})`;
  }

  function boardRowsHtml(data, game) {
    if (!data.rows.length) {
      return `<div class="hk-play-board__empty">${HKUI.icon("trophy", 22, "var(--text-muted)")}<div>아직 기록이 없어요<br><b>첫 1위</b>에 도전해 보세요</div></div>`;
    }
    const row = (r) => `<li class="hk-play-row${r.self ? " is-me" : ""}">
        <span class="hk-play-row__rank${r.rank <= 3 ? ` is-top${r.rank}` : ""}">${r.rank}</span>
        ${HKUI.avatar(r.name, "sm", r.avatarUrl || "")}
        <span class="hk-play-row__who"><b>${HKUI.escapeHtml(r.name)}</b><small>${HKUI.escapeHtml(r.department || "")}</small></span>
        <span class="hk-play-row__score">${formatScore(game, r.score)}</span>
      </li>`;
    const meOutside = data.me && !data.rows.some((r) => r.self);
    return `<ol class="hk-play-board__list">${data.rows.map(row).join("")}</ol>
      ${meOutside ? `<div class="hk-play-board__me">내 순위 <b>${nf(data.me.rank)}위</b> · ${formatScore(game, data.me.score)}</div>` : ""}`;
  }

  function deptRowsHtml(data, game) {
    if (!data.departments.length) {
      return `<div class="hk-play-board__empty">${HKUI.icon("users-round", 22, "var(--text-muted)")}<div>이번 주 부서 기록이 아직 없어요</div></div>`;
    }
    return `<ol class="hk-play-board__list">${data.departments
      .map(
        (d) => `<li class="hk-play-row${d.isMine ? " is-me" : ""}">
          <span class="hk-play-row__rank${d.rank <= 3 ? ` is-top${d.rank}` : ""}">${d.rank}</span>
          <span class="hk-play-row__who"><b>${HKUI.escapeHtml(d.name)}</b><small>${nf(d.players)}명 참가</small></span>
          <span class="hk-play-row__score">${formatScore(game, d.score)}</span>
        </li>`
      )
      .join("")}</ol>
      <p class="hk-play-board__note">부서 상위 3명 기록의 평균이에요 · 이번 주 기준</p>`;
  }

  function boardHtml() {
    return `<aside class="hk-card hk-play-board">
        <div class="hk-play-board__head">${HKUI.icon("trophy", 18, "var(--color-warning)")}<b>사내 순위</b><span class="hk-play-board__count" id="hk-play-count"></span><button type="button" class="hk-play-board__close" aria-label="순위 닫기">${HKUI.icon("x", 18, "currentColor")}</button></div>
        <div class="hk-play-tabs" role="tablist">${PERIODS.map(([k, l], i) => `<button type="button" role="tab" class="hk-play-tab${i === 0 ? " is-active" : ""}" data-period="${k}">${l}</button>`).join("")}</div>
        <div id="hk-play-board-body"><div style="text-align:center;padding:28px"><span class="hk-spin"></span></div></div>
      </aside>`;
  }

  // 판이 끝나면 넓은 화면은 위쪽에 결과 띠 — 게임 자체의 끝 화면(다시 하기 버튼 포함)과 겹치지 않게
  // 가운데 창 대신 띠로 보여 주고, 3초 뒤 저절로 사라진다 (위로 쓸어 올리거나 X 로 바로 닫기)
  let resultTimer = null;
  function resultBanner(game, result) {
    HKSound.play(result.counted && result.newBest ? "win" : "success");
    document.querySelector(".hk-play-result")?.remove();
    clearTimeout(resultTimer);
    // 오늘의 도전 두 번째 판부터(연습) — 순위에 안 들어간다는 걸 휴대폰에서도 크게 알린다
    const practice = isPractice(game, result);
    // 좁은 화면은 순위표가 바로 열리니 결과 띠는 띄우지 않는다 (연습 판만 띄움)
    if (!practice && !window.matchMedia("(min-width: 900px)").matches) return;
    const title = practice ? "연습 판이라 순위에 안 들어가요" : !result.counted ? "연습 기록" : result.newBest ? "새 최고 기록!" : "기록을 남겼어요";
    const iconName = !result.counted ? "dumbbell" : result.newBest ? "party-popper" : "flag";
    const ranks = [];
    if (result.todayRank) ranks.push(`오늘 <b>${nf(result.todayRank)}위</b>`);
    if (result.weekRank) ranks.push(`이번 주 <b>${nf(result.weekRank)}위</b>`);
    const el = document.createElement("div");
    el.className = `hk-play-result${result.newBest && result.counted ? " is-best" : ""}${practice ? " is-practice" : ""}`;
    el.setAttribute("role", "status");
    el.innerHTML = (practice
      ? `<span class="hk-play-result__icon">${HKUI.icon("dumbbell", 22, "#fff")}</span>
      <div class="hk-play-result__text">
        <b>${title}</b>
        <span>이번 판 <b>${formatScore(game, result.score)}</b> · 오늘의 도전은 그날 처음 시작한 판만 순위에 들어가요</span>
        ${result.todayRank ? `<span>오늘 순위는 첫 판 기록으로 <b>${nf(result.todayRank)}위</b>예요</span>` : ""}`
      : `<span class="hk-play-result__icon" style="${tintStyle(game.key)}">${HKUI.icon(iconName, 20, "#fff")}</span>
      <div class="hk-play-result__text">
        <b>${title} · ${formatScore(game, result.score)}</b>
        <span>${ranks.join(" · ") || (result.counted ? "순위를 불러오는 중이에요" : "오늘의 도전은 첫 기록만 순위에 들어가요")}${result.best != null && !result.newBest ? ` · 내 최고 ${formatScore(game, result.best)}` : ""}</span>`) +
      `${result.stamp ? stampHtml(result.stamp, practice) : ""}
      </div>
      <button type="button" class="hk-play-result__close" aria-label="닫기" data-esc-close>${HKUI.icon("x", 16, "currentColor")}</button>`;
    const close = () => {
      clearTimeout(resultTimer);
      el.style.transform = "";
      el.classList.remove("is-in");
      setTimeout(() => el.remove(), 250);
    };
    el.querySelector(".hk-play-result__close").onclick = close;
    // 위로 쓸어 올리면 닫힌다 — 손가락을 따라 올라가다가 30px 넘게 올리고 떼면 사라짐
    let sw = null;
    el.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".hk-play-result__close")) return;
      sw = { id: e.pointerId, y: e.clientY };
      el.style.transition = "none";
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
    });
    el.addEventListener("pointermove", (e) => {
      if (!sw || e.pointerId !== sw.id) return;
      const dy = Math.min(0, e.clientY - sw.y);
      el.style.transform = `translate(-50%, ${dy}px)`;
      if (dy < -30) { sw = null; el.style.transition = ""; close(); }
    });
    const swEnd = () => { if (!sw) return; sw = null; el.style.transition = ""; el.style.transform = ""; };
    el.addEventListener("pointerup", swEnd);
    el.addEventListener("pointercancel", swEnd);
    (document.querySelector(".hk-pf") || document.body).appendChild(el);
    HKUI.refreshIcons(el);
    requestAnimationFrame(() => el.classList.add("is-in"));
    // 예전 7초는 길어서 다음 판을 가렸다 — 3초 뒤 저절로 사라짐 (연습 판 안내는 읽을 수 있게 8초)
    resultTimer = setTimeout(close, practice ? 8000 : 3000);
  }

  // 결과 띠의 도장 한 줄 — 연습 판 안내(큰 띠)는 길게, 보통 결과 띠(머리 막대 안 한 줄)는 짧게(전체 글은 마우스를 올리면 보인다)
  function stampHtml(st, long) {
    const full = `${st.new ? "오늘 도장 쾅!" : st.today ? "오늘 도장은 이미 찍었어요" : st.pending ? "도장판이 꽉 찼어요" : "게임 화면에서 시작한 판만 도장이 찍혀요"} · ${st.pending ? `도장 <b>${st.goal}개 완성</b> · 쿠폰은 다음 달 1일에` : `도장 <b>${st.count}/${st.goal}</b>`}`;
    const short = st.pending ? `도장 <b>${st.goal}개 완성</b>` : `${st.new ? "도장 쾅! " : "도장 "}<b>${st.count}/${st.goal}</b>`;
    return `<span class="hk-play-result__stamp${st.new ? " is-new" : ""}" title="${HKUI.escapeHtml(full.replace(/<[^>]+>/g, ""))}">${HKUI.icon("stamp", 13, "currentColor")} ${long ? full : short}</span>`;
  }

  // 오늘의 도전 게임에서 저장은 됐지만 순위에 안 들어간 판(그날 두 번째 시작부터) — 저장 실패와는 다르다
  const isPractice = (game, result) => !!(game && game.dailyOnce && result && !result.counted && !result.failed);

  // 오늘의 도전을 다시 시작할 때 — 판을 시작하기 전에 연습 판이라 순위에 안 남는다고 먼저 알리고, 확인하면 시작
  function askPractice(game) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "hk-dialog__overlay hk-practice-ask";
      overlay.innerHTML = `<div class="hk-dialog" role="alertdialog" aria-labelledby="hk-practice-t" style="max-width:380px;width:calc(100% - 32px);text-align:center">
          <span class="hk-practice-ask__icon">${HKUI.icon("dumbbell", 28, "#fff")}</span>
          <div class="hk-dialog__title" id="hk-practice-t" style="font-size:20px">이번 판은 연습이에요</div>
          <div class="hk-dialog__body" style="margin-bottom:16px">오늘의 도전은 그날 <b>처음 시작한 판만</b> 순위에 들어가요.<br>오늘은 이미 시작했던 도전이라, 이번 판은 끝까지 해도<br><b>순위 기록에 남지 않아요.</b> (참여 도장은 찍혀요)</div>
          <div class="hk-dialog__actions" style="justify-content:center"><button type="button" class="hk-btn hk-btn--primary" data-ok style="min-width:160px">알겠어요, 연습 시작</button></div>
        </div>`;
      document.body.appendChild(overlay);
      HKUI.refreshIcons(overlay);
      const btn = overlay.querySelector("[data-ok]");
      const done = () => { overlay.remove(); document.removeEventListener("keydown", onKey, true); resolve(); };
      const onKey = (e) => { if (e.key === "Enter" || e.key === " " || e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(); } };
      btn.onclick = done;
      document.addEventListener("keydown", onKey, true);
      setTimeout(() => btn.focus({ preventScroll: true }), 0);
    });
  }

  // 도장으로 쿠폰을 받으면 한 번 더 크게 알려 준다
  function stampToast(stamp) {
    if (stamp && stamp.coupon) {
      HKSound.play("win");
      HKUI.toast(`도장 ${stamp.goal}개 달성! 무적 쿠폰 1장을 받았어요 · 받은 날부터 30일 안에 예약 신청에 써요`);
    }
  }

  async function mountGame({ key, setup, wide }) {
    let game = null;
    let period = "today";
    const restartFns = [];
    let dailyToken = null;
    // 갈래 — 상식 퀴즈 분야처럼 한 게임 안에서 고르는 판. 갈래마다 순위·하루 첫 판을 따로 센다 ("" = 기본 판)
    let variant = "", variantLabel = "", playedVariants = [];
    // 키 약속 (모든 게임 공통)
    //  - 스페이스: 시작 화면·끝 화면에서 시작/다시 하기 (게임 중에는 게임이 자유롭게 씀)
    //  - Esc: 게임 중 일시정지 (게임이 onPause 로 등록한 함수), 일시정지 화면에서 다시 누르면 이어 하기
    let canRestart = false;
    const pauseFns = [];
    // 시작 · 다시 하기 단추 글자 — 그 말로 「시작하는」 짧은 단추(「출발하기」 · 「계속하기」)이거나, 그 말로 「끝나는」 단추(「게임 시작」 · 「경기 준비」)만.
    // 예전에는 글자 어디에든 들어 있으면 눌러서, 퀴즈 보기(「새로 일을 시작하다」)나 「도전 취소」 · 「준비 취소」도 단추로 알았다
    const GO_TEXT = /^(?:[▶▷→»›]\s*)?(?:시작|출발|출근하기|계속하기|이어서|다시\s*(?:하기|달리기|도전|시작)|도전(?:하기)?$|준비(?:\s*완료)?$)|(?:시작|출발|도전|다시\s*하기|준비)(?:하기)?\s*[!▶▷→»›]?$/;
    const RESUME_TEXT = /계속하기|이어서/;
    // 순위표는 판이 끝났을 때만 오른쪽에서 열린다 — 새 판을 시작하면 닫는다
    let runNo = 0; // 새 판마다 1씩 — 순위를 받아 오는 사이에 새 판이 시작됐으면 열지 않는다
    // 참여 도장용 판 길이 — 새 판을 시작하면 그때부터 다시 잰다(이어 하기는 그대로).
    // 시작 화면·결과 화면에서도 미리 알려 두어, 시작을 못 알아채는 게임도 길이가 잡히게 한다
    let inRun = false;
    let runStartAt = 0; // 이번 판을 시작한 시각 — 뒤로 가기 '기록 남기고 나가기'는 30초 넘게 한 판만
    const SAVE_MIN_SEC = 30;
    const armRun = (fresh) => HKApi.playRun(key, fresh).catch(() => {});
    let playingNow = false;
    let scoreFn = null; // 게임이 알려 주는 지금 점수 (뒤로 가기 → 기록 남기고 나가기)
    let leaveNoteFn = null;
    let stampedToday = false; // 판 중간 도장(stageStamp) — 오늘 찍었으면 더 묻지 않는다 // 게임이 알려 주는 나가기 안내 — 중간 저장이 되는 게임(통통 짐볼)은 "기록 안 됨" 대신 이 말
    function setPlaying(on) {
      // 휴대폰 머리의 일시정지 버튼은 판이 도는 동안만
      document.querySelector(".hk-pf")?.classList.toggle("is-playing", on);
      playingNow = on;
      if (on && !(history.state && history.state.hkPlay)) history.pushState({ hkPlay: 1 }, "");
      if (!on) return;
      if (!inRun) { armRun(true); runStartAt = Date.now(); }
      inRun = true;
      endQuit(false);
      runNo++;
      openBoard(false);
      showRankBtn(false);
    }
    // 일시정지 — Esc 와 같다 (이미 일시정지 화면이면 이어 하기)
    // 끼워 넣은 게임(창 안)은 「계속하기」 버튼이 바깥에서 안 보이니, 게임이 알려 준 멈춤 상태로 이어 하기를 부른다(ctx.onResume)
    let resumeFn = null;
    function togglePause() {
      const resume = visibleButton(RESUME_TEXT);
      if (resume) resume.click();
      else if (resumeFn && resumeFn()) return;
      else pauseFns.forEach((fn) => fn());
    }
    // 퀴즈 · 고르기 보기 단추 — 글자가 「시작 · 준비」로 끝나도 시작 단추가 아니다
    const OPTION_BTN = "[data-opts] button, [data-opt], [data-i], [role=group] button, [class*=__opt], [class*=-opt], [class*=choice]";
    const isGoButton = (b, re) => {
      if (!b || b.tagName !== "BUTTON" || b.matches(OPTION_BTN)) return false;
      const label = (b.textContent || "").replace(/\s+/g, " ").trim();
      return label.length <= 12 && re.test(label);
    };
    function visibleButton(re) {
      const stageEl = document.getElementById("hk-play-stage");
      if (!stageEl) return null;
      return [...stageEl.querySelectorAll("button")].find((b) => {
        // 짧은 진짜 단추 글자만 (퀴즈 보기처럼 긴 글자 · 보기 단추에 '시작'이 섞여 있어도 누르지 않게)
        if (b.disabled || !isGoButton(b, re)) return false;
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(b).visibility !== "hidden";
      });
    }
    // 떠 있는 확인 창 — 판 위에 덮인 .hk-dialog__overlay (맨 위 것)
    function openDialog() {
      const all = document.querySelectorAll(".hk-dialog__overlay");
      for (let i = all.length - 1; i >= 0; i--) if (!all[i].hidden && getComputedStyle(all[i]).display !== "none") return all[i];
      return null;
    }
    // 확인 창이 있으면 스페이스 · 엔터 · Esc 는 창이 받는다: 초점이 창 단추에 있으면 브라우저가 그 단추를 누르고,
    // 없으면 창의 첫 단추(계속하기 · 취소처럼 안전한 쪽)로 초점만 옮긴다. Esc 는 「계속하기 · 취소 · 닫기」로 창을 닫는다.
    // 어느 경우든 뒤의 게임에는 키를 넘기지 않는다. 처리했으면 true
    function dialogKey(e) {
      const dlg = openDialog();
      if (!dlg) return false;
      const k = e.key;
      if (k !== " " && e.code !== "Space" && k !== "Enter" && k !== "Escape") return false;
      e.stopImmediatePropagation();
      const t = e.target;
      if (t && dlg.contains(t) && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) && k !== "Escape") return true; // 의견 적는 칸 — 띄어쓰기 · 줄바꿈 그대로
      if (k === "Escape") {
        e.preventDefault();
        if (!e.repeat) dlg.querySelector('[data-leave="stay"], [data-act="cancel"], [data-rclose], [data-close], .hk-practice-ask [data-ok]')?.click();
        return true;
      }
      const a = document.activeElement;
      if (a && dlg.contains(a) && a.matches("button, a, [role=button], [data-act]")) return true; // 브라우저가 초점 단추를 누른다
      e.preventDefault();
      const first = dlg.querySelector(".hk-dialog__actions button:not([disabled])") || dlg.querySelector("button:not([disabled])");
      if (first) first.focus({ preventScroll: true });
      return true;
    }
    window.addEventListener(
      "keydown",
      (e) => {
        // 확인 창(그만할까요? · HKUI.confirmDialog 등)이 떠 있으면 판 쪽 키 처리는 건너뛴다 — 뒤 판의 「계속하기」가 눌리거나 판이 다시 돌지 않게
        if (dialogKey(e)) return;
        if (e.repeat) return;
        if (e.code === "Escape") {
          e.preventDefault();
          e.stopImmediatePropagation();
          // 순위표가 열려 있으면 먼저 닫는다
          const board = document.querySelector(".hk-pf .hk-play-board");
          if (board && board.classList.contains("is-open")) { openBoard(false); return; }
          // 입력창에 있어도 Esc 는 일시정지·이어 하기 (끼워 넣은 게임도 — togglePause 가 이어 하기를 먼저 본다)
          togglePause();
          return;
        }
        if (e.code !== "Space") {
          canRestart = false; // 다른 키를 누르면(새 판을 이미 시작) 스페이스 재시작은 꺼진다
          return;
        }
        const t = e.target;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        // 「다음 …」 단추가 보이면 그쪽이 먼저 (통통 짐볼 연습 통과 화면처럼 「다시 하기」와 함께 있을 때) — no-zoom.js 가 찾아 누른다
        const next = window.HKNextKey && window.HKNextKey.find();
        if (next) {
          e.preventDefault();
          e.stopImmediatePropagation();
          window.HKNextKey.press(next);
          return;
        }
        if (canRestart) {
          e.preventDefault();
          e.stopImmediatePropagation();
          doRestart();
          return;
        }
        const btn = visibleButton(GO_TEXT);
        if (btn) {
          e.preventDefault();
          e.stopImmediatePropagation();
          btn.click();
        }
      },
      true
    );
    // 판 안을 눌러 새 판을 시작했으면 스페이스 재시작은 꺼진다 (순위표·머리·그만하기 버튼을 누른 건 상관없음)
    // 게임 화면에서 두 손가락 확대(iOS 사파리)는 막는다 — 게임 조작 중 화면이 커지지 않게
    document.addEventListener("gesturestart", (e) => e.preventDefault());
    // 빠르게 연달아 톡톡 쳐도 화면이 확대되지 않게 하는 일은 /_shared/no-zoom.js 가 맡는다(모든 게임 페이지가 불러 쓴다).
    // 예전에는 여기서도 0.4초 안의 두 번째 터치 끝을 막아, 단추가 아닌 칸(지뢰찾기 칸 · 오목 판 등)의 빠른 두 번째 누르기가 무시됐다
    window.addEventListener("pointerdown", (e) => {
      const stageEl = document.getElementById("hk-play-stage");
      if (stageEl && stageEl.contains(e.target) && !e.target.closest(".hk-quit-btn, .hk-endbar")) canRestart = false;
    }, true);

    // ── 판이 끝나면 '다시 하기' 옆에 '그만하기' — 게임의 다시 하기 버튼 옆에 붙이고, 없으면(창 안 게임 등) 창 아래에 둘 다 띄운다
    let endTimer = null;
    // 꿀알바 시리즈 게임 — 게임을 나가면 아케이드 대신 시리즈 공고판으로 돌아간다
    const SERIES_JOBS = [["nightshift", "심야 편의점"], ["clown", "광대를 놓치지 마"], ["milk", "새벽 우유 배달"], ["theater", "심야 극장 안내"], ["trial", "신약 시험 보조"], ["silent", "조용한 공사장"], ["parade", "야간 퍼레이드"], ["finale", "마지막 축제"]];
    const SERIES = SERIES_JOBS.some(([k]) => k === key);
    // 레트로 오락실 게임 — 머리에 「레트로 보기」(레트로 오락실의 게임 고르는 칸 /retro#rt-games 으로)
    const RETRO = ["paperjet", "fighter", "vitamin", "jumper"].includes(key);
    let leaveTo = null; // 게임 중 왼쪽 목록에서 다른 회차를 고르면 나간 뒤 그 게임으로 간다
    function goQuit() {
      const to = leaveTo || (SERIES ? "/series" : HKRoutes.lounge);
      // 게임에서 아케이드로 나가면 아케이드는 배너 영역부터(arcade.html landOnBanner)
      if (to === HKRoutes.lounge) { try { sessionStorage.setItem("hk-aa-land", String(Date.now())); } catch (_) { /* 표시 못 해도 나갈 수는 있다 */ } }
      location.href = to;
    }
    // 상단 「꿀알바 시리즈」 — 옆 버튼과 같은 높이로, 번진 곳 없이 또렷한 점만 찍는다
    function paintSeriesWord(c) {
      const t = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
      const font = `800 14px Pretendard, "Apple SD Gothic Neo", sans-serif`, text = "꿀알바 시리즈";
      t.font = font;
      const w = Math.ceil(t.measureText(text).width) + 2, h = 18, z = 1;
      t.canvas.width = w; t.canvas.height = h;
      t.font = font; t.textBaseline = "middle"; t.fillStyle = "#000"; t.fillText(text, 1, h / 2 + 1);
      const d = t.getImageData(0, 0, w, h).data, g = c.getContext("2d");
      c.width = w * z; c.height = h * z;
      c.style.width = `${w * z}px`; c.style.height = `${h * z}px`;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 110) {
        g.fillStyle = "#f7cb16"; g.fillRect(x * z, y * z, z, z);
      }
    }
    // PC 왼쪽 회차 목록
    function seriesSideHtml() {
      return `<nav class="hk-pf__side" aria-label="꿀알바 시리즈 회차">
          <span class="hk-pf__side-head">회차 목록</span>
          ${SERIES_JOBS.map(([k, title], i) => (k === key
            ? `<span class="hk-pf__side-item is-current" aria-current="page"><i>${i + 1}화</i>${title}</span>`
            : `<a class="hk-pf__side-item" href="/games/${k}"><i>${i + 1}화</i>${title}</a>`)).join("")}
        </nav>`;
    }

    // ── 게임 중 뒤로 가기 — 바로 나가지 않고 묻는다: 지금까지 점수를 기록에 남기고 나갈지, 그냥 나갈지
    let leaving = null;
    function askLeave() {
      if (leaving) return;
      pauseFns.forEach((fn) => { try { fn(); } catch (_) {} });
      let now = null;
      try { now = scoreFn ? Math.max(0, Math.round(Number(scoreFn()) || 0)) : null; } catch (_) { now = null; }
      // 시작하자마자 나가며 기록만 남기는 걸 막는다 — 30초가 안 됐으면 기록 남기기는 없이
      const tooShort = now != null && (Date.now() - runStartAt) / 1000 < SAVE_MIN_SEC;
      if (tooShort) now = null;
      let leaveNote = null;
      try { leaveNote = leaveNoteFn ? leaveNoteFn() : null; } catch (_) { leaveNote = null; }
      const overlay = document.createElement("div");
      overlay.className = "hk-dialog__overlay";
      overlay.innerHTML = `<div class="hk-dialog" role="dialog">
          <div class="hk-dialog__title">게임을 그만할까요?</div>
          <div class="hk-dialog__body">${now != null ? `지금까지 <b>${formatScore(game, now)}</b>이에요. 이 점수를 기록에 남기고 나갈 수 있어요.` : tooShort ? `시작한 지 ${SAVE_MIN_SEC}초가 안 돼서 기록을 남길 수 없어요. 지금 나가면 이번 판은 기록되지 않아요.` : (leaveNote || "이 게임은 끝까지 해야 기록이 남아요. 지금 나가면 이번 판은 기록되지 않아요.")}</div>
          <div class="hk-dialog__actions" style="flex-wrap:wrap">
            <button type="button" class="hk-btn hk-btn--secondary" data-leave="stay">계속하기</button>
            <button type="button" class="hk-btn hk-btn--secondary" data-leave="out">그냥 나가기</button>
            ${now != null ? `<button type="button" class="hk-btn hk-btn--primary" data-leave="save">기록 남기고 나가기</button>` : ""}
          </div>
        </div>`;
      leaving = overlay;
      const done = () => { overlay.remove(); leaving = null; leaveTo = null; };
      overlay.addEventListener("click", async (e) => {
        if (overlay.dataset.final) return; // 기록을 남긴 뒤 결과 창 — 나가기 버튼만
        if (e.target === overlay) return done();
        const b = e.target.closest("[data-leave]");
        if (!b) return;
        if (b.dataset.leave === "stay") return done();
        if (b.dataset.leave === "save") {
          overlay.querySelectorAll("button").forEach((x) => (x.disabled = true));
          b.textContent = "저장하는 중…";
          let result = null;
          try { result = await HKApi.playSubmit(key, now, dailyToken, variant); dailyToken = null; } catch (_) { /* 저장 못 해도 나갈 수는 있게 */ }
          playingNow = false;
          if (result) return showLeaveResult(overlay, result);
        }
        playingNow = false;
        goQuit();
      });
      document.body.appendChild(overlay);
      // 스페이스 · 엔터가 뒤 판이 아니라 이 창의 「계속하기」에 가게
      setTimeout(() => overlay.querySelector('[data-leave="stay"]')?.focus({ preventScroll: true }), 0);
    }
    // 기록 남기고 나가기 뒤 — 같은 창에서 내 결과와 사내 순위(오늘·이번 주)를 보여 주고, 나가기는 버튼으로
    function showLeaveResult(overlay, result) {
      stampToast(result.stamp);
      const ranks = [];
      if (result.todayRank) ranks.push(`오늘 <b>${nf(result.todayRank)}위</b>`);
      if (result.weekRank) ranks.push(`이번 주 <b>${nf(result.weekRank)}위</b>`);
      const title = !result.counted ? "연습 기록이에요" : result.newBest ? "새 최고 기록!" : "기록을 남겼어요";
      const practice = isPractice(game, result);
      overlay.innerHTML = `<div class="hk-dialog" role="dialog" style="max-width:420px;width:calc(100% - 32px);max-height:min(640px, 85dvh);display:flex;flex-direction:column">
          <div class="hk-dialog__title">${title} · ${formatScore(game, result.score)}</div>
          ${practice ? `<div class="hk-practice-box">${HKUI.icon("dumbbell", 18, "currentColor")}<span><b>연습 판이라 순위에 안 들어가요</b><br>오늘의 도전은 그날 처음 시작한 판만 순위에 들어가요</span></div>` : ""}
          <div class="hk-dialog__body" style="margin-bottom:10px">${ranks.join(" · ") || (result.counted ? "" : "오늘의 도전은 첫 기록만 순위에 들어가요")}${result.stamp && result.stamp.new ? `${ranks.length ? " · " : ""}오늘 도장 쾅!` : ""}</div>
          <div class="hk-play-tabs" role="tablist" style="margin-bottom:8px">
            <button type="button" class="hk-play-tab is-active" data-lp="today">오늘</button>
            <button type="button" class="hk-play-tab" data-lp="week">이번 주</button>
            <button type="button" class="hk-play-tab" data-lp="all">전체</button>
          </div>
          <div data-lboard style="flex:1;min-height:0;overflow-y:auto"><div style="text-align:center;padding:24px"><span class="hk-spin"></span></div></div>
          <div class="hk-dialog__actions" style="margin-top:12px">
            <button type="button" class="hk-btn hk-btn--primary" data-leave-go>${leaveTo ? (leaveTo.startsWith("/retro") ? "레트로 오락실로 가기" : "고른 회차로 가기") : SERIES ? "꿀알바 목록으로 나가기" : "아케이드로 나가기"}</button>
          </div>
        </div>`;
      const box = overlay.querySelector("[data-lboard]");
      const load = async (pd) => {
        overlay.querySelectorAll("[data-lp]").forEach((t) => t.classList.toggle("is-active", t.dataset.lp === pd));
        try {
          const data = await HKApi.playLeaderboard(key, pd, variant);
          box.innerHTML = boardRowsHtml(data, data.game || game);
        } catch (e) {
          box.innerHTML = `<div class="hk-play-board__empty">${HKUI.escapeHtml(e.message || "순위를 불러오지 못했어요")}</div>`;
        }
        HKUI.refreshIcons(box);
      };
      overlay.querySelectorAll("[data-lp]").forEach((t) => (t.onclick = () => load(t.dataset.lp)));
      overlay.querySelector("[data-leave-go]").onclick = goQuit;
      // 바깥을 눌러도 닫히지 않게 — 이 판은 이미 기록됐으니 나가기만 남는다 (계속하면 같은 판이 두 번 기록될 수 있다)
      overlay.dataset.final = "1";
      load("today");
    }
    // 게임 화면에서 바로 오류 신고 · 개선 의견 — 이 게임과 기기 정보가 함께 저장된다 (관리자 「게임 요청」)
    function openReport() {
      if (document.querySelector(".hk-report")) return;
      if (playingNow) pauseFns.forEach((fn) => { try { fn(); } catch (_) {} });
      const overlay = document.createElement("div");
      overlay.className = "hk-dialog__overlay hk-report";
      overlay.innerHTML = `<div class="hk-dialog" role="dialog" style="max-width:420px;width:calc(100% - 32px)">
          <div class="hk-dialog__title">${HKUI.escapeHtml(game.title || "")} · 의견 보내기</div>
          <div class="hk-play-tabs" role="tablist" style="margin:4px 0 10px">
            <button type="button" class="hk-play-tab is-active" data-rk="BUG">오류 신고</button>
            <button type="button" class="hk-play-tab" data-rk="IDEA">개선 의견</button>
          </div>
          <textarea class="hk-input" data-rtext maxlength="300" rows="4" style="width:100%;box-sizing:border-box;resize:vertical;min-height:110px;padding:12px;font:inherit;font-size:15px" placeholder="어떤 상황에서 무엇이 안 됐는지 적어 주세요"></textarea>
          <div style="font-size:12px;color:var(--text-muted);margin-top:6px">게임 이름과 기기 정보(${HKUI.escapeHtml(HKUI.deviceInfo())})가 함께 전달돼요.</div>
          <div class="hk-dialog__actions" style="margin-top:12px">
            <button type="button" class="hk-btn hk-btn--secondary" data-rclose>닫기</button>
            <button type="button" class="hk-btn hk-btn--primary" data-rsend>보내기</button>
          </div>
        </div>`;
      let kind = "BUG";
      const ta = overlay.querySelector("[data-rtext]");
      overlay.querySelectorAll("[data-rk]").forEach((t) => (t.onclick = () => {
        kind = t.dataset.rk;
        overlay.querySelectorAll("[data-rk]").forEach((x) => x.classList.toggle("is-active", x === t));
        ta.placeholder = kind === "BUG" ? "어떤 상황에서 무엇이 안 됐는지 적어 주세요" : "이렇게 바뀌면 좋겠다는 점을 적어 주세요";
      }));
      const close = () => overlay.remove();
      overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
      overlay.querySelector("[data-rclose]").onclick = close;
      overlay.querySelector("[data-rsend]").onclick = async (e) => {
        const body = ta.value.trim();
        if (body.length < 2) { HKUI.toast("내용을 적어 주세요", "danger"); return ta.focus(); }
        e.currentTarget.disabled = true;
        try {
          await HKApi.playRequestGame(body, { kind, game: key, device: HKUI.deviceInfo() });
          close();
          HKUI.toast("보냈어요, 고마워요!");
        } catch (err) {
          e.currentTarget.disabled = false;
          HKUI.toast(err.message || "보내지 못했어요", "danger");
        }
      };
      document.body.appendChild(overlay);
      HKUI.refreshIcons(overlay);
      setTimeout(() => ta.focus(), 50);
    }
    // 휴대폰·브라우저 뒤로 가기 — 판이 도는 중이면 한 칸 되돌려 놓고 묻는다
    window.addEventListener("popstate", () => {
      if (playingNow) { history.pushState({ hkPlay: 1 }, ""); askLeave(); }
      else if (!(history.state && history.state.hkPlay)) history.back();
    });
    function doRestart() {
      if (!canRestart) return;
      canRestart = false;
      document.querySelector(".hk-play-result")?.remove();
      setPlaying(true);
      restartFns.forEach((fn) => fn());
    }
    function quitBtnFor(btn) {
      const q = document.createElement("button");
      q.type = "button";
      q.className = `${btn.className} hk-quit-btn`;
      q.innerHTML = `${HKUI.icon("log-out", 16, "currentColor")}<span>그만하기</span>`;
      q.onclick = (e) => { e.preventDefault(); e.stopPropagation(); goQuit(); };
      return q;
    }
    function endQuit(on) {
      clearInterval(endTimer);
      endTimer = null;
      document.querySelectorAll(".hk-quit-wrap > .hk-quit-btn, .hk-quit-btn").forEach((b) => b.remove());
      document.querySelectorAll(".hk-quit-wrap").forEach((w) => { while (w.firstChild) w.parentNode.insertBefore(w.firstChild, w); w.remove(); });
      document.querySelectorAll(".hk-endbar").forEach((b) => b.remove());
      if (!on) return;
      let tries = 0;
      const place = () => {
        tries++;
        const stageEl = document.getElementById("hk-play-stage");
        if (!stageEl || stageEl.querySelector(".hk-quit-btn, .hk-endbar")) return;
        const again = visibleButton(/다시|처음 화면으로/);
        if (again) {
          // 다시 하기와 그만하기를 한 줄로 묶는다
          const wrap = document.createElement("span");
          wrap.className = "hk-quit-wrap";
          again.parentNode.insertBefore(wrap, again);
          wrap.appendChild(again);
          wrap.appendChild(quitBtnFor(again));
          HKUI.refreshIcons(wrap);
          clearInterval(endTimer);
          return;
        }
        if (tries >= 6) {
          // 게임 안에 다시 하기 버튼이 없으면 창 아래에 두 버튼을 띄운다
          clearInterval(endTimer);
          const bar = document.createElement("div");
          bar.className = "hk-endbar";
          // 창 안 게임(별까지 계단)은 안에 다시 하기 버튼이 따로 있어 그만하기만
          const framed = !!stageEl.querySelector("iframe");
          bar.innerHTML = `${framed ? "" : `<button type="button" class="hk-endbar__again">${HKUI.icon("rotate-ccw", 16, "currentColor")}<span>다시 하기</span><kbd>Space</kbd></button>`}
            <button type="button" class="hk-endbar__quit hk-quit-btn">${HKUI.icon("log-out", 16, "currentColor")}<span>그만하기</span></button>`;
          if (framed) bar.classList.add("is-framed");
          bar.querySelector(".hk-endbar__again")?.addEventListener("click", () => doRestart());
          bar.querySelector(".hk-endbar__quit").onclick = goQuit;
          stageEl.parentElement.appendChild(bar);
          HKUI.refreshIcons(bar);
        }
      };
      place();
      endTimer = setInterval(place, 400);
    }

    async function loadBoard() {
      const body = document.getElementById("hk-play-board-body");
      if (!body) return;
      try {
        const data = await HKApi.playLeaderboard(key, period === "dept" ? "week" : period, variant);
        game = data.game;
        document.getElementById("hk-play-count").textContent = `${variantLabel ? `${variantLabel} · ` : ""}${period === "dept" ? "" : `${nf(data.players)}명`}`;
        body.innerHTML = period === "dept" ? deptRowsHtml(data, game) : boardRowsHtml(data, game);
        HKUI.refreshIcons(body);
      } catch (e) {
        body.innerHTML = `<div class="hk-play-board__empty">${HKUI.escapeHtml(e.message || "순위를 불러오지 못했어요")}</div>`;
      }
    }

    // 전체 화면 — 사이트 머리·꼬리 없이 위에 얇은 막대, 가운데 게임, 넓은 화면은 오른쪽 순위표
    await HKUI.loadLucide();
    const profile = await HKMember.requireAuth(window.location.pathname);
    if (!profile) return;
    document.body.classList.add("hk-pf-body");
    // 길게 누르기 — 글자 선택·메뉴가 시작되지 않게 (입력창은 그대로). CSS만으로는 아이폰에서 가끔 돋보기가 떴다
    const editable = (t) => t && t.closest && t.closest("input, textarea, [contenteditable]");
    document.addEventListener("selectstart", (e) => { if (!editable(e.target)) e.preventDefault(); });
    document.addEventListener("contextmenu", (e) => { if (!editable(e.target)) e.preventDefault(); });
    // 아이폰은 CSS·selectstart 를 막아도 판을 길게 누르고 끌면 돋보기가 뜬다 — 스크롤을 막아 둔 판(touch-action:none) 위에서는
    // 터치 시작 자체를 막아 길게 누르기 동작이 아예 시작되지 않게 한다. 게임 조작은 포인터 이벤트라 그대로 들어오고,
    // 버튼·입력창처럼 클릭으로 동작하는 곳은 건드리지 않는다
    document.addEventListener("touchstart", (e) => {
      const t = e.target;
      if (!t || !t.closest || !t.closest("#hk-play-stage")) return;
      if (t.closest("button, a, input, textarea, select, label, [contenteditable], [data-act], [data-i], [role=button]")) return;
      for (let el = t; el && el.id !== "hk-play-stage"; el = el.parentElement) {
        if (getComputedStyle(el).touchAction === "none") { e.preventDefault(); return; }
      }
    }, { passive: false });
    document.getElementById("app").innerHTML = `<div class="hk-pf">
        <header class="hk-pf__bar" id="hk-play-head"></header>
        <div class="hk-pf__body">
          ${SERIES ? seriesSideHtml() : ""}
          <main class="hk-pf__main" id="hk-pf-main"><div class="hk-play-frame"><div class="hk-play-stage" id="hk-play-stage"></div></div></main>
          ${boardHtml()}
        </div>
        <div class="hk-pf__scrim" id="hk-pf-scrim" hidden></div>
      </div>`;
    {
        // 업무 시간 여부를 먼저 본다 — 닫혀 있으면 게임도 순위도 보이지 않는다
        const statusP = HKApi.playStatus().catch(() => ({ open: true }));
        const list = await HKApi.playGames().catch(() => []);
        const meta = list.find((g) => g.key === key) || game || { key, title: key, unit: "" };
        game = { ...meta, ...(game || {}) };
        const dailyDone = !!(meta.dailyOnce && meta.playedToday);
        playedVariants = meta.playedVariants || [];
        document.getElementById("hk-play-head").innerHTML = `<a class="hk-pf__back" href="${HKRoutes.lounge}" aria-label="아케이드로">${HKUI.icon("chevron-left", 20, "currentColor")}<span>아케이드</span></a>
          ${RETRO ? `<a class="hk-pf__back hk-pf__vs" id="hk-pf-retro" href="/retro#rt-games" aria-label="레트로 오락실 게임 보기">${HKUI.icon("joystick", 18, "currentColor")}<span>레트로 보기</span></a>` : ""}
          <span class="hk-pf__icon" style="${tintStyle(key)}">${HKUI.icon(meta.icon || "gamepad-2", 18, "#fff")}</span>
          <div class="hk-pf__title"><b>${HKUI.escapeHtml(meta.title)}</b><small>${HKUI.escapeHtml(meta.desc || "")}</small></div>
          <div class="hk-pf__tools">
            ${meta.dailyOnce ? `<span class="hk-badge ${dailyDone ? "hk-badge--neutral" : "hk-badge--warning"} hk-pf__daily">${dailyDone ? "오늘 도전 완료 · 연습" : "오늘의 도전"}</span>` : ""}
            <button type="button" class="hk-play-sound hk-pf__pause" id="hk-pf-pause" hidden aria-label="일시정지">${HKUI.icon("pause", 18, "currentColor")}<span>일시정지</span></button>
            ${SERIES ? `<a class="hk-play-sound hk-pf__series" id="hk-pf-series" href="/series" aria-label="꿀알바 시리즈">${HKUI.icon("list", 18, "currentColor")}<span><canvas id="hk-pf-series-word" aria-hidden="true"></canvas></span></a>` : ""}
            <button type="button" class="hk-play-sound" id="hk-pf-report" aria-label="오류 신고">${HKUI.icon("bug", 18, "currentColor")}<span>오류 신고</span></button>
            <button type="button" class="hk-play-sound" id="hk-play-sound"></button>
            <button type="button" class="hk-play-sound hk-pf__rank-btn" id="hk-pf-rank" hidden>${HKUI.icon("trophy", 18, "currentColor")}<span>순위</span></button>
          </div>`;
        if (SERIES) paintSeriesWord(document.getElementById("hk-pf-series-word"));
        document.getElementById("hk-pf-pause").onclick = (e) => { e.currentTarget.blur(); togglePause(); };
        document.getElementById("hk-pf-report").onclick = (e) => { e.currentTarget.blur(); openReport(); };
        // 게임 중에 나가면 먼저 묻는다
        document.querySelectorAll(".hk-pf__back, #hk-pf-series").forEach((a) => a.addEventListener("click", (e) => {
          if (!playingNow) return;
          e.preventDefault();
          leaveTo = a.id === "hk-pf-retro" ? a.getAttribute("href") : null; // 「레트로 보기」는 나간 뒤 레트로 오락실로
          askLeave();
        }));
        document.querySelectorAll(".hk-pf__side a").forEach((a) => a.addEventListener("click", (e) => {
          if (!playingNow) return;
          e.preventDefault();
          leaveTo = a.getAttribute("href");
          askLeave();
        }));
        const soundBtn = document.getElementById("hk-play-sound");
        const paintSound = () => {
          const m = HKSound.isMuted();
          soundBtn.innerHTML = `${HKUI.icon(m ? "volume-x" : "volume-2", 18, "currentColor")}<span>${m ? "소리 꺼짐" : "소리 켜짐"}</span>`;
          soundBtn.setAttribute("aria-pressed", m ? "false" : "true");
          soundBtn.classList.toggle("is-off", m);
          HKUI.refreshIcons(soundBtn);
        };
        paintSound();
        HKSound.onChange(paintSound);
        soundBtn.onclick = () => {
          HKSound.toggle();
          HKSound.play("select");
          soundBtn.blur();
        };
        document.title = `${meta.title} — 아케이드`;
        document.querySelectorAll(".hk-play-tab").forEach((b) => {
          b.onclick = () => {
            period = b.dataset.period;
            document.querySelectorAll(".hk-play-tab").forEach((x) => x.classList.toggle("is-active", x === b));
            loadBoard();
          };
        });
        HKUI.refreshIcons();

        const today = todayKst();
        const ctx = {
          key,
          game,
          profile,
          today,
          dailyDone,
          rng: (salt = "") => seededRng(`${key}:${today}:${salt}`),
          formatScore: (n) => formatScore(game, n).replace(/<[^>]+>/g, ""),
          sfx: (name, arg) => HKSound.play(name, arg),
          onRestart: (fn) => restartFns.push(fn),
          onPause: (fn) => {
            pauseFns.push(fn);
            // 일시정지를 지원하는 게임만 휴대폰 머리에 버튼을 보인다
            document.getElementById("hk-pf-pause")?.removeAttribute("hidden");
          },
          // 버튼 없이 시작하는 게임(예: iframe 안의 게임)이 새 판 시작을 알릴 때
          started: () => setPlaying(true),
          // 멈춰 있으면 이어 하고 true — Esc · 일시정지 버튼이 이걸 먼저 부른다(끼워 넣은 게임)
          onResume: (fn) => { resumeFn = fn; },
          togglePause: () => togglePause(),
          // 갈래 고르기 — 순위표와 하루 첫 판 판정이 그 갈래로 바뀐다 (label 은 순위표 머리에 보임)
          setVariant: (v, label) => {
            variant = v || ""; variantLabel = variant ? label || "" : "";
            ctx.dailyDone = !!(game.dailyOnce && (variant ? playedVariants.includes(variant) : meta.playedToday));
            const badge = document.querySelector(".hk-pf__daily");
            if (badge) {
              badge.className = `hk-badge ${ctx.dailyDone ? "hk-badge--neutral" : "hk-badge--warning"} hk-pf__daily`;
              badge.textContent = ctx.dailyDone ? "오늘 도전 완료 · 연습" : "오늘의 도전";
            }
            loadBoard();
            return ctx.dailyDone;
          },
          playedVariants: () => playedVariants.slice(),
          // 지금 점수 — 게임 중 뒤로 가기에서 '기록 남기고 나가기'에 쓴다 (없으면 그냥 나가기만)
          onScore: (fn) => { scoreFn = fn; },
          // 나가기 확인 창의 안내 말 — fn() 이 글을 돌려주면 「끝까지 해야 기록이 남아요」 대신 보인다(중간 저장되는 게임)
          onLeaveNote: (fn) => { leaveNoteFn = fn; },
          // 판 중간 도장 — 한 판이 긴 게임(통통 짐볼)이 스테이지 하나를 통과했을 때 부른다. 오늘 이미 찍었으면 서버에 묻지 않는다
          stageStamp: async () => {
            if (stampedToday) return null;
            try {
              const st = await HKApi.playStage(key);
              if (st && st.today) stampedToday = true;
              if (st && st.new) { HKSound.play("coin"); HKUI.toast(`오늘 도장 쾅! · 도장 ${Math.min(st.count, st.goal)}/${st.goal}`); }
              stampToast(st);
              return st;
            } catch (_) { return null; }
          },
          begin: async () => {
            if (!game.dailyOnce) return true;
            try {
              const r = await HKApi.playStart(key, variant);
              dailyToken = r.token;
              if (!r.ranked) {
                ctx.dailyDone = true;
                await askPractice(game);
              }
              return !!r.ranked;
            } catch (_) {
              dailyToken = null;
              return false;
            }
          },
          submit: async (score) => {
            setPlaying(false);
            const value = Math.max(0, Math.round(score));
            const run = runNo; // 저장을 기다리는 사이에 새 판이 시작됐으면 그 판의 상태를 건드리지 않는다
            let result;
            try {
              result = await HKApi.playSubmit(key, value, dailyToken, variant);
              dailyToken = null;
            } catch (e) {
              HKUI.toast(e.message || "기록을 저장하지 못했어요", "danger");
              result = { counted: false, failed: true, score: value, best: null };
            }
            if (result.counted && game.dailyOnce) {
              ctx.dailyDone = true;
              if (variant && !playedVariants.includes(variant)) playedVariants.push(variant);
              else if (!variant) meta.playedToday = true;
            }
            resultBanner(game, result);
            stampToast(result.stamp);
            if (run !== runNo) return result;
            inRun = false;
            armRun(); // 다음 판 길이 재기
            canRestart = true;
            endQuit(true);
            await loadBoard();
            // 끝나자마자 순위표를 연다 — 휴대폰은 닫으면 게임의 끝 화면이 보이고, '순위' 버튼으로 다시 연다
            if (run === runNo) {
              showRankBtn(true);
              openBoard(true);
            }
            return result;
          },
        };
        const stage = document.getElementById("hk-play-stage");
        // 업무 시간에는 게임 대신 안내 — 순위표·순위 버튼도 숨긴다
        const status = await statusP;
        if (!status.open) {
          stage.innerHTML = closedHtml(status.opensAt);
          stage.parentElement.classList.add("is-plain");
          HKUI.refreshIcons(stage);
          document.querySelector(".hk-pf .hk-play-board")?.remove();
          document.getElementById("hk-pf-rank")?.remove();
          // 열리는 시각이 지나면 저절로 다시 불러온다
          setInterval(async () => {
            const st = await HKApi.playStatus().catch(() => null);
            if (st && st.open) location.reload();
          }, 60000);
          return;
        }
        // 휴가로 열린 사람 — 위 막대에 짧게 한 줄 + 처음 한 번 알림
        const leaveText = leaveNote(status);
        if (leaveText) {
          document.querySelector(".hk-pf__tools")?.insertAdjacentHTML("afterbegin", `<span class="hk-badge hk-badge--info hk-pf__leave" title="${HKUI.escapeHtml(leaveText)}">${HKUI.escapeHtml(leaveText)}</span>`);
          HKUI.toast(leaveText, "info");
        }
        // 시작·다시 하기·이어 하기 버튼을 누르면 게임 중으로 본다 (스페이스로 누르는 것도 여기로 온다)
        stage.addEventListener(
          "click",
          (e) => {
            const b = e.target.closest && e.target.closest("button");
            if (isGoButton(b, GO_TEXT)) setPlaying(true);
          },
          true
        );
        loadBoard();
        setup(stage, ctx);
        armRun();
        fitStage(stage, wide);
        bindDrawer();
    }
  }

  // 휴가로 열린 안내 — /play/status 가 reason "leave" 이면 「오늘 휴가라 14:00까지 열려 있어요」, 아니면 빈 글
  // (휴가 · 반차 · 반반차 · 특별휴가인 사람은 그 쉬는 시간대에 업무 시간이어도 열린다. 끝나면 다른 사람과 똑같이 닫힌다)
  function leaveNote(st) {
    const lv = st && st.open && st.reason === "leave" && st.leave;
    if (!lv) return "";
    const label = lv.label || "휴가";
    if (lv.until && lv.until !== "24:00") return `오늘 ${label}라 ${lv.until}까지 열려 있어요`;
    return `오늘 ${label}라 ${lv.kind === "VACATION" || lv.kind === "SPECIAL" ? "하루 종일" : "오늘은 계속"} 열려 있어요`;
  }

  // 업무 시간 안내
  function closedHtml(opensAt) {
    return `<div class="hk-play-closed">
        <span class="hk-play-closed__icon">${HKUI.icon("briefcase", 30, "currentColor")}</span>
        <h2>지금은 업무 시간이에요</h2>
        <p>게임은 <b>점심시간(11:30~13:00)</b>과 <b>퇴근 후(18:00~)</b>, <b>출근 전(~09:00)</b>, 주말·공휴일에 할 수 있어요.</p>
        ${opensAt ? `<p class="hk-play-closed__next">${HKUI.icon("clock", 16, "currentColor")} 오늘 <b>${opensAt}</b>에 다시 열려요</p>` : ""}
        <a class="hk-btn hk-btn--secondary" href="${HKRoutes.lounge}">아케이드로</a>
      </div>`;
  }

  // 순위 버튼(좁은 화면) — 오른쪽에서 밀려 나오는 순위표
  // 순위표 서랍 — 넓은 화면은 게임을 가리지 않게 어둡게 덮지 않고, 휴대폰은 뒤를 어둡게
  function openBoard(on) {
    const board = document.querySelector(".hk-pf .hk-play-board");
    const scrim = document.getElementById("hk-pf-scrim");
    if (!board) return;
    board.classList.toggle("is-open", on);
    if (scrim) scrim.hidden = !on || window.matchMedia("(min-width: 900px)").matches;
  }
  // 순위 버튼은 판이 끝났을 때만 — 게임 중·시작 전에는 숨긴다
  function showRankBtn(on) {
    const btn = document.getElementById("hk-pf-rank");
    if (btn) btn.hidden = !on;
  }
  function bindDrawer() {
    const board = document.querySelector(".hk-pf .hk-play-board");
    document.getElementById("hk-pf-rank").onclick = () => openBoard(!board.classList.contains("is-open"));
    document.getElementById("hk-pf-scrim").onclick = () => openBoard(false);
    board.querySelector(".hk-play-board__close").onclick = () => openBoard(false);
  }

  // 게임 판이 쓸 수 있는 높이 — 가운데 영역 높이에서 판 밖(점수 줄·안내 줄 등) 높이를 뺀다
  function roomFor(stage, el) {
    const cs = getComputedStyle(stage);
    const avail = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const root = stage.firstElementChild;
    const chrome = el && root ? Math.max(0, root.getBoundingClientRect().height - el.getBoundingClientRect().height) : 0;
    return Math.floor(avail - chrome);
  }

  // 모든 게임을 같은 크기의 창 안에 — 창 높이는 화면 가운데 영역 높이, 폭은 높이 × FRAME_RATIO
  // (출근길 대작전·비타민 3매치 비율). 화면이 좁으면 화면 폭에 맞춘다. 게임들은 창 크기에 맞춰 다시 그린다
  // wide: 가로로 넓게 보는 게임(3D 레이싱 등) — 창 폭을 가운데 영역 폭 가득 쓴다(휴대폰은 원래도 폭 가득이라 같다)
  const FRAME_RATIO = 0.88;
  function fitStage(stage, wide) {
    const main = document.getElementById("hk-pf-main");
    const frame = stage.parentElement;
    function fit() {
      // 세로·가로 여백을 따로 잰다 (휴대폰은 responsive.css 가 좌우 여백을 다르게 강제한다)
      const cs = getComputedStyle(main);
      const padV = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      const padH = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const H = Math.max(360, main.clientHeight - padV);
      const W = Math.max(280, wide ? main.clientWidth - padH : Math.min(main.clientWidth - padH, Math.round(H * FRAME_RATIO)));
      if (frame.style.width === `${W}px` && frame.style.height === `${H}px`) return;
      frame.style.width = `${W}px`;
      frame.style.height = `${H}px`;
      window.dispatchEvent(new Event("resize"));
    }
    fit();
    let timer = null;
    window.addEventListener("resize", () => {
      clearTimeout(timer);
      timer = setTimeout(fit, 60);
    });
  }

  return { closedHtml, leaveNote, mountGame, roomFor, tintStyle, formatScore, seededRng, smoothPixels, todayKst, TINTS, sfx: (name, arg) => HKSound.play(name, arg) };
})();
