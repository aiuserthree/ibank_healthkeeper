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
 *     onRestart(fn) — 결과 창 '다시 하기'를 눌렀을 때
 *     formatScore(n)
 *   }
 */
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
    kart: ["#dc2626", "#f97316"],
    circus: ["#be123c", "#f59e0b"],
    olympic: ["#0369a1", "#22c55e"],
    jump: ["#0ea5e9", "#84cc16"],
    bubble: ["#06b6d4", "#a78bfa"],
    commando: ["#3f6212", "#a3a635"],
    sudoku: ["#334155", "#64748b"],
    chosung: ["#e0508a", "#ff9a8b"],
    ox: ["#f59e0b", "#fcd34d"],
    typing: ["#4f46e5", "#a78bfa"],
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

  function resultModal(game, result, onRestart) {
    const title = !result.counted ? "연습 기록" : result.newBest ? "새 최고 기록!" : "기록을 남겼어요";
    const iconName = !result.counted ? "dumbbell" : result.newBest ? "party-popper" : "flag";
    const lines = [];
    if (result.todayRank) lines.push(`오늘 <b>${result.todayRank}위</b>`);
    if (result.weekRank) lines.push(`이번 주 <b>${result.weekRank}위</b>`);
    const overlay = document.createElement("div");
    overlay.className = "hk-dialog__overlay";
    overlay.innerHTML = `<div class="hk-dialog hk-play-result" role="dialog" aria-label="${title}">
        <div class="hk-play-result__icon" style="${tintStyle(game.key)}">${HKUI.icon(iconName, 28, "#fff")}</div>
        <div class="hk-play-result__title">${title}</div>
        <div class="hk-play-result__score">${formatScore(game, result.score)}</div>
        ${lines.length ? `<div class="hk-play-result__ranks">${lines.join(" · ")}</div>` : ""}
        ${result.best != null ? `<div class="hk-play-result__best">내 최고 기록 ${formatScore(game, result.best)}</div>` : ""}
        ${!result.counted ? `<p class="hk-play-result__note">오늘의 도전은 <b>첫 기록만</b> 순위에 들어가요. 내일 새 문제로 다시 도전해 보세요!</p>` : ""}
        <div class="hk-play-result__actions">
          <a class="hk-btn hk-btn--secondary" href="${HKRoutes.lounge}">라운지로</a>
          <button type="button" class="hk-btn hk-btn--primary" data-restart>${HKUI.icon("rotate-ccw", 16, "#fff")} 다시 하기</button>
        </div>
      </div>`;
    const close = () => overlay.remove();
    overlay.querySelector("[data-restart]").onclick = () => {
      close();
      onRestart();
    };
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    document.body.appendChild(overlay);
    HKUI.refreshIcons(overlay);
    overlay.querySelector("[data-restart]").focus();
  }

  async function mountGame({ key, setup }) {
    let game = null;
    let period = "today";
    const restartFns = [];
    let dailyToken = null;

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

    await HKMember.mountPage({
      active: "lounge",
      auth: true,
      mainStyle: "max-width:1200px;margin:0 auto;padding:24px 32px 72px",
      render: () => `<a class="hk-play-back" href="${HKRoutes.lounge}">${HKUI.icon("chevron-left", 16, "currentColor")} 점심 라운지</a>
        <div class="hk-play-head" id="hk-play-head"></div>
        <div class="hk-play-layout">
          <div class="hk-play-stage-wrap"><div class="hk-play-stage" id="hk-play-stage"></div></div>
          ${boardHtml()}
        </div>`,
      afterMount: async (profile) => {
        // 순위표는 기다리지 않는다 — 게임 목록(오늘 참여 여부)만 받고 바로 게임을 띄운다
        loadBoard();
        const list = await HKApi.playGames().catch(() => []);
        const meta = list.find((g) => g.key === key) || game || { key, title: key, unit: "" };
        game = { ...meta, ...(game || {}) };
        const dailyDone = !!(meta.dailyOnce && meta.playedToday);
        document.getElementById("hk-play-head").innerHTML = `<span class="hk-play-head__icon" style="${tintStyle(key)}">${HKUI.icon(meta.icon || "gamepad-2", 24, "#fff")}</span>
          <div><h1>${HKUI.escapeHtml(meta.title)}</h1><p>${HKUI.escapeHtml(meta.desc || "")}</p></div>
          ${meta.dailyOnce ? `<span class="hk-badge ${dailyDone ? "hk-badge--neutral" : "hk-badge--warning"}" style="margin-left:auto">${dailyDone ? "오늘 도전 완료 · 연습 모드" : "오늘의 도전 · 첫 기록만 순위 반영"}</span>` : ""}`;
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
            resultModal(game, result, () => restartFns.forEach((fn) => fn()));
            loadBoard();
            return result;
          },
        };
        setup(document.getElementById("hk-play-stage"), ctx);
      },
    });
  }

  return { mountGame, tintStyle, formatScore, seededRng, todayKst, TINTS };
})();
