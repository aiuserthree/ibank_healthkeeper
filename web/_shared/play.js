/**
 * 점심 라운지 — 게임 페이지 공통 틀
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
 *     formatScore(n)
 *     sfx(name, arg) — 효과음 (HKSound 이름 목록 참고). 소리 켜고 끄기는 공통 버튼이 맡는다
 *   }
 */
/**
 * 점심 라운지 효과음 — 소리 파일 없이 Web Audio 로 바로 만든다.
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
      ac = new AC();
      master = ac.createGain();
      master.gain.value = 0.32;
      master.connect(ac.destination);
    }
    if (ac.state === "suspended") ac.resume().catch(() => {});
    return ac;
  }
  // 첫 입력에서 오디오 잠금 해제
  ["pointerdown", "keydown", "touchstart"].forEach((t) =>
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
  };

  function play(name, arg) {
    if (muted || !SFX[name]) return;
    // 같은 소리가 한꺼번에 몰리면 귀가 아프니 25ms 안의 중복은 건너뜀
    const now = performance.now();
    if (lastAt[name] && now - lastAt[name] < 25) return;
    lastAt[name] = now;
    if (!ensure() || ac.state !== "running") return;
    try {
      SFX[name](arg);
    } catch (_) {
      /* 소리는 부가 기능 — 실패해도 게임은 계속 */
    }
  }
  function setMuted(m) {
    muted = !!m;
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
    pairs: ["#0f8b8d", "#57cc99"],
    shooter: ["#2b1055", "#d53369"],
    bricks: ["#c2410c", "#fb923c"],
    bubble: ["#06b6d4", "#a78bfa"],
    sudoku: ["#334155", "#64748b"],
    chosung: ["#e0508a", "#ff9a8b"],
    typing: ["#4f46e5", "#a78bfa"],
    korean: ["#b45309", "#facc15"],
  };

  function todayKst() {
    const kst = new Date(Date.now() + 9 * 3600 * 1000);
    return kst.toISOString().slice(0, 10);
  }

  // 문자열 → 32비트 시드 → mulberry32
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
      ${meOutside ? `<div class="hk-play-board__me">내 순위 <b>${data.me.rank}위</b> · ${formatScore(game, data.me.score)}</div>` : ""}`;
  }

  function deptRowsHtml(data, game) {
    if (!data.departments.length) {
      return `<div class="hk-play-board__empty">${HKUI.icon("users-round", 22, "var(--text-muted)")}<div>이번 주 부서 기록이 아직 없어요</div></div>`;
    }
    return `<ol class="hk-play-board__list">${data.departments
      .map(
        (d) => `<li class="hk-play-row${d.isMine ? " is-me" : ""}">
          <span class="hk-play-row__rank${d.rank <= 3 ? ` is-top${d.rank}` : ""}">${d.rank}</span>
          <span class="hk-play-row__who"><b>${HKUI.escapeHtml(d.name)}</b><small>${d.players}명 참가</small></span>
          <span class="hk-play-row__score">${formatScore(game, d.score)}</span>
        </li>`
      )
      .join("")}</ol>
      <p class="hk-play-board__note">부서 상위 3명 기록의 평균이에요 · 이번 주 기준</p>`;
  }

  function boardHtml() {
    return `<aside class="hk-card hk-play-board">
        <div class="hk-play-board__head">${HKUI.icon("trophy", 18, "var(--color-warning)")}<b>사내 순위</b><span class="hk-play-board__count" id="hk-play-count"></span></div>
        <div class="hk-play-tabs" role="tablist">${PERIODS.map(([k, l], i) => `<button type="button" role="tab" class="hk-play-tab${i === 0 ? " is-active" : ""}" data-period="${k}">${l}</button>`).join("")}</div>
        <div id="hk-play-board-body"><div style="text-align:center;padding:28px"><span class="hk-spin"></span></div></div>
      </aside>`;
  }

  // 판이 끝나면 화면 위쪽에 결과 띠 — 게임 자체의 끝 화면(다시 하기 버튼 포함)과 겹치지 않게
  // 가운데 창 대신 띠로 보여 주고, 몇 초 뒤 저절로 사라진다
  let resultTimer = null;
  function resultBanner(game, result) {
    HKSound.play(result.counted && result.newBest ? "win" : "success");
    document.querySelector(".hk-play-result")?.remove();
    clearTimeout(resultTimer);
    const title = !result.counted ? "연습 기록" : result.newBest ? "새 최고 기록!" : "기록을 남겼어요";
    const iconName = !result.counted ? "dumbbell" : result.newBest ? "party-popper" : "flag";
    const ranks = [];
    if (result.todayRank) ranks.push(`오늘 <b>${result.todayRank}위</b>`);
    if (result.weekRank) ranks.push(`이번 주 <b>${result.weekRank}위</b>`);
    const el = document.createElement("div");
    el.className = `hk-play-result${result.newBest && result.counted ? " is-best" : ""}`;
    el.setAttribute("role", "status");
    el.innerHTML = `<span class="hk-play-result__icon" style="${tintStyle(game.key)}">${HKUI.icon(iconName, 20, "#fff")}</span>
      <div class="hk-play-result__text">
        <b>${title} · ${formatScore(game, result.score)}</b>
        <span>${ranks.join(" · ") || (result.counted ? "순위를 불러오는 중이에요" : "오늘의 도전은 첫 기록만 순위에 들어가요")}${result.best != null && !result.newBest ? ` · 내 최고 ${formatScore(game, result.best)}` : ""}</span>
      </div>
      <button type="button" class="hk-play-result__close" aria-label="닫기">${HKUI.icon("x", 16, "currentColor")}</button>`;
    const close = () => {
      el.classList.remove("is-in");
      setTimeout(() => el.remove(), 250);
    };
    el.querySelector(".hk-play-result__close").onclick = close;
    (document.querySelector(".hk-pf") || document.body).appendChild(el);
    HKUI.refreshIcons(el);
    requestAnimationFrame(() => el.classList.add("is-in"));
    resultTimer = setTimeout(close, 7000);
  }

  async function mountGame({ key, setup }) {
    let game = null;
    let period = "today";
    const restartFns = [];
    let dailyToken = null;
    // 스페이스 하나로 시작·다시 시작 (모든 게임 공통)
    //  - 판이 끝난 뒤: 다시 하기 (게임이 onRestart 로 등록한 함수)
    //  - 시작 화면·일시정지·끝 화면에 버튼이 보이면: 그 버튼(시작/출발/계속하기/다시 하기 …)을 누른다
    let canRestart = false;
    const GO_TEXT = /시작|출발|출근하기|도전|계속하기|다시 하기|다시 달리기|준비/;
    function visibleGoButton() {
      const stageEl = document.getElementById("hk-play-stage");
      if (!stageEl) return null;
      return [...stageEl.querySelectorAll("button")].find((b) => {
        if (b.disabled || !GO_TEXT.test(b.textContent || "")) return false;
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(b).visibility !== "hidden";
      });
    }
    window.addEventListener(
      "keydown",
      (e) => {
        if (e.repeat) return;
        if (e.code !== "Space") {
          canRestart = false; // 다른 키를 누르면(새 판을 이미 시작) 스페이스 재시작은 꺼진다
          return;
        }
        const t = e.target;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        if (canRestart) {
          e.preventDefault();
          e.stopImmediatePropagation();
          canRestart = false;
          document.querySelector(".hk-play-result")?.remove();
          restartFns.forEach((fn) => fn());
          return;
        }
        const btn = visibleGoButton();
        if (btn) {
          e.preventDefault();
          e.stopImmediatePropagation();
          btn.click();
        }
      },
      true
    );
    window.addEventListener("pointerdown", () => (canRestart = false), true);

    async function loadBoard() {
      const body = document.getElementById("hk-play-board-body");
      if (!body) return;
      try {
        const data = await HKApi.playLeaderboard(key, period === "dept" ? "week" : period);
        game = data.game;
        document.getElementById("hk-play-count").textContent = period === "dept" ? "" : `${data.players}명`;
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
    document.getElementById("app").innerHTML = `<div class="hk-pf">
        <header class="hk-pf__bar" id="hk-play-head"></header>
        <div class="hk-pf__body">
          <main class="hk-pf__main" id="hk-pf-main"><div class="hk-play-stage" id="hk-play-stage"></div></main>
          ${boardHtml()}
        </div>
        <div class="hk-pf__scrim" id="hk-pf-scrim" hidden></div>
      </div>`;
    {
        // 순위표는 기다리지 않는다 — 게임 목록(오늘 참여 여부)만 받고 바로 게임을 띄운다
        loadBoard();
        const list = await HKApi.playGames().catch(() => []);
        const meta = list.find((g) => g.key === key) || game || { key, title: key, unit: "" };
        game = { ...meta, ...(game || {}) };
        const dailyDone = !!(meta.dailyOnce && meta.playedToday);
        document.getElementById("hk-play-head").innerHTML = `<a class="hk-pf__back" href="${HKRoutes.lounge}" aria-label="점심 라운지로">${HKUI.icon("chevron-left", 20, "currentColor")}<span>라운지</span></a>
          <span class="hk-pf__icon" style="${tintStyle(key)}">${HKUI.icon(meta.icon || "gamepad-2", 18, "#fff")}</span>
          <div class="hk-pf__title"><b>${HKUI.escapeHtml(meta.title)}</b><small>${HKUI.escapeHtml(meta.desc || "")}</small></div>
          <div class="hk-pf__tools">
            ${meta.dailyOnce ? `<span class="hk-badge ${dailyDone ? "hk-badge--neutral" : "hk-badge--warning"} hk-pf__daily">${dailyDone ? "오늘 도전 완료 · 연습" : "오늘의 도전"}</span>` : ""}
            <button type="button" class="hk-play-sound" id="hk-play-sound"></button>
            <button type="button" class="hk-play-sound hk-pf__rank-btn" id="hk-pf-rank">${HKUI.icon("trophy", 18, "currentColor")}<span>순위</span></button>
          </div>`;
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
        document.title = `${meta.title} — 점심 라운지`;
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
          begin: async () => {
            if (!game.dailyOnce) return true;
            try {
              const r = await HKApi.playStart(key);
              dailyToken = r.token;
              if (!r.ranked) {
                if (!ctx.dailyDone) HKUI.toast("오늘 이미 시작했던 도전이라 이번 판은 연습으로 기록돼요");
                ctx.dailyDone = true;
              }
              return !!r.ranked;
            } catch (_) {
              dailyToken = null;
              return false;
            }
          },
          submit: async (score) => {
            const value = Math.max(0, Math.round(score));
            let result;
            try {
              result = await HKApi.playSubmit(key, value, dailyToken);
              dailyToken = null;
            } catch (e) {
              HKUI.toast(e.message || "기록을 저장하지 못했어요", "danger");
              result = { counted: false, score: value, best: null };
            }
            if (result.counted && game.dailyOnce) ctx.dailyDone = true;
            resultBanner(game, result);
            canRestart = true;
            loadBoard();
            return result;
          },
        };
        const stage = document.getElementById("hk-play-stage");
        setup(stage, ctx);
        fitStage(stage);
        bindDrawer();
    }
  }

  // 순위 버튼(좁은 화면) — 오른쪽에서 밀려 나오는 순위표
  function bindDrawer() {
    const board = document.querySelector(".hk-pf .hk-play-board");
    const scrim = document.getElementById("hk-pf-scrim");
    const open = (on) => {
      board.classList.toggle("is-open", on);
      scrim.hidden = !on;
    };
    document.getElementById("hk-pf-rank").onclick = () => open(!board.classList.contains("is-open"));
    scrim.onclick = () => open(false);
    window.addEventListener("keydown", (e) => e.key === "Escape" && board.classList.contains("is-open") && open(false));
  }

  // 게임 영역을 화면에 꽉 차게 — 게임마다 세로·가로 비율이 달라서, 지금 비율을 재고
  // 화면 높이·폭 안에 들어가는 가장 큰 폭으로 맞춘다 (게임들은 폭에 맞춰 다시 그린다)
  function fitStage(stage) {
    const main = document.getElementById("hk-pf-main");
    const MAX_W = 760;
    let selfResize = false;
    function fit() {
      const W = main.clientWidth - 24;
      const H = main.clientHeight - 24;
      const w = stage.getBoundingClientRect().width;
      const h = stage.scrollHeight;
      if (!w || !h || W <= 0 || H <= 0) return;
      const target = Math.round(Math.max(Math.min(300, W), Math.min(W, (H * w) / h, MAX_W)));
      if (Math.abs(target - w) < 6) return;
      stage.style.width = `${target}px`;
      selfResize = true;
      window.dispatchEvent(new Event("resize"));
      selfResize = false;
    }
    stage.style.width = `${Math.min(main.clientWidth - 24, 560)}px`;
    let timer = null;
    const later = () => {
      clearTimeout(timer);
      timer = setTimeout(fit, 60);
    };
    window.addEventListener("resize", () => !selfResize && later());
    // 시작 화면 → 플레이처럼 내용이 바뀌면 다시 맞춘다 (맞추는 동안 생기는 변화는 무시하고 몇 번만)
    let passes = 0;
    new ResizeObserver(() => passes++ < 40 && later()).observe(stage);
    [80, 300, 800].forEach((ms) => setTimeout(fit, ms));
  }

  return { mountGame, tintStyle, formatScore, seededRng, todayKst, TINTS, sfx: (name, arg) => HKSound.play(name, arg) };
})();
