// 턴제 대전 공용 — 받은 도전 · 진행 중 · 컴퓨터 대국 · 동료 찾기 · 최근 결과 · 순위
// 오목 · 체스 말고 다른 대전 게임(숫자 야구 · 칸 따먹기 · 1:1 퀴즈 대결)도 lobby 옵션으로 문구 · 컴퓨터 칸을 바꿔 쓴다
window.HKMatch = (function () {
  const esc = HKUI.escapeHtml;
  const REASON = { FIVE: "오목 완성", CHECKMATE: "체크메이트", STALEMATE: "스테일메이트", RESIGN: "기권", TIMEOUT: "시간 초과", DRAW: "무승부" };
  // 끝난 이유 문구 — 서버가 보낸 reasonLabel(게임마다 다른 이유)을 먼저, 없으면 REASON
  const reason = (m) => (m && (m.reasonLabel || REASON[m.endReason])) || "";
  const BOT_LEVELS = [["easy", "쉬움"], ["normal", "보통"], ["hard", "어려움"]];
  const LABELS = {
    incoming: "받은 도전", myTurn: "내 차례", waiting: "상대 차례", sent: "보낸 도전", bot: "컴퓨터와 두기",
    challenge: "동료에게 도전하기", recent: "최근 결과", rank: "순위", turnTag: "내 차례", waitTag: "기다리는 중",
  };
  // 프로필 사진 — 없거나 못 불러오면 이름 첫 글자(아케이드 명예의 전당과 같은 방식)
  const ini = (p) => esc(String((p && p.name) || "?").charAt(0));
  const ava = (p) => (p.avatarUrl
    ? `<img src="${esc(p.avatarUrl)}" alt="" data-i="${ini(p)}" onerror="var s=document.createElement('span');s.className='gk__ava is-ini';s.textContent=this.dataset.i;this.replaceWith(s)">`
    : `<span class="gk__ava is-ini">${ini(p)}</span>`);
  const person = (p, sub) => `${ava(p)}<span class="gk__who"><b>${esc(p.name)}</b><small>${esc(sub ?? p.department ?? "")}</small></span>`;
  const closedNote = (open) => (open.open ? "" : `<div class="gk__closed">지금은 업무 시간이라 볼 수만 있어요. ${esc(open.opensAt || "")}부터 다시 둘 수 있어요.</div>`);
  function due(iso) {
    if (!iso) return "";
    const h = Math.max(0, (new Date(iso) - Date.now()) / 3600e3);
    return h >= 1 ? `${Math.floor(h)}시간 남음` : `${Math.max(1, Math.ceil(h * 60))}분 남음`;
  }
  function fail(e) { HKUI.toast(e.message || "처리하지 못했어요", "error"); }
  const ROW_NOTE = (m) => `${m.moveCount}수 · ${due(m.deadlineAt)}`;
  const RESULT_NOTE = (m) => `${reason(m)} · ${m.moveCount}수`;
  function rowHtml(m, tag, cls, note = ROW_NOTE) {
    return `<a class="gk__row" href="#m${m.id}">${person(m.opponent, m.status === "ACTIVE" ? note(m) : undefined)}<span class="gk__tag ${cls || ""}">${esc(tag)}</span></a>`;
  }
  function resultRow(m, note = RESULT_NOTE) {
    const tag = { win: "승", lose: "패", draw: "무" }[m.result];
    return `<a class="gk__row" href="#m${m.id}">${person(m.opponent, note(m))}<span class="gk__tag is-${m.result}">${tag}</span></a>`;
  }
  // 대국 화면 위 — 나 vs 상대. 누구 차례인지, 돌(기물) 색, 끝나면 각자 승 · 패 · 무
  // opt.me · opt.rival — 이름 아래 작은 글(부서 대신, 예: "칸 4개") · 둘이 따로 푸는 게임은 rivalTurn 으로 상대도 「차례」
  function versus(m, msg, opt = {}) {
    const res = m.status === "DONE" ? m.result : null; // 내 기준 win · lose · draw
    const rivalColor = m.myColor ? (m.myColor === "black" ? "white" : "black") : null;
    const turn = (mine) => m.status === "ACTIVE" && (mine ? m.myTurn === true : m.myTurn === false || m.rivalTurn === true);
    const won = (mine) => res && res !== "draw" && (res === "win") === mine;
    const mark = (mine) => (!res ? "" : res === "draw" ? `<span class="gk__res is-draw">무</span>`
      : won(mine) ? `<span class="gk__res is-win">🏆 승</span>` : `<span class="gk__res is-lose">패</span>`);
    const sub = (p, mine) => { const n = mine ? opt.me : opt.rival; return n != null && n !== "" ? n : p.department || ""; };
    const side = (p, mine, color) => `<div class="gk__side ${mine ? "is-me" : ""} ${turn(mine) ? "is-turn" : ""} ${res ? (res === "draw" ? "is-draw" : won(mine) ? "is-win" : "is-lose") : ""}">
        <span class="gk__face">${ava(p)}${color ? `<span class="gk__stone is-${color}" title="${mine ? "내" : "상대"} 색"></span>` : ""}</span>
        <span class="gk__who"><b>${esc(p.name)}${mine ? " <em>나</em>" : ""}</b><small>${esc(sub(p, mine))}</small></span>
        ${mark(mine)}${turn(mine) ? `<span class="gk__turn">차례</span>` : ""}
      </div>`;
    const me = m.me || { name: "나", department: "", avatarUrl: null };
    return `<div class="gk__vs ${res ? `is-${res}` : ""}">${side(me, true, m.myColor)}<div class="gk__vs-mid"><b>VS</b><small>${esc(msg)}</small></div>${side(m.opponent, false, rivalColor)}</div>`;
  }
  const section = (title, body) => (body ? `<section class="gk__sec"><h2>${esc(title)}</h2>${body}</section>` : "");

  // 목록을 그리고 지금 게임 시간 정보를 돌려준다
  // 옵션(모두 생략 가능 — 생략하면 오목 · 체스와 같다)
  //   bot: false(컴퓨터 칸 숨김) | [[난이도 키, 버튼 글], ...]   botNote: 컴퓨터 칸 아래 글
  //   intro: lead 아래 넣을 HTML(페이지가 만든 것 그대로 — 사용자 글은 넣지 말 것)
  //   rankNote · rankEmpty: 순위 아래 글 · 빈 순위 글   labels: 칸 제목 · 꼬리표 바꾸기(LABELS 키)
  //   rowNote(m) · resultNote(m): 진행 중 · 끝난 줄의 작은 글(기본 「12수 · 3시간 남음」 · 「기권 · 12수」)
  async function lobby(root, game, opts) {
    const {
      title, lead, intro = "", bot = BOT_LEVELS, botNote = "바로 시작해요. 컴퓨터전은 순위에 넣지 않아요.",
      rankNote = "기권·시간 초과는 10수 이상 둔 판만 세고, 같은 상대에게 하루에 거둔 승은 1승으로 쳐요",
      rankEmpty = "아직 끝난 대국이 없어요", rowNote = ROW_NOTE, resultNote = RESULT_NOTE,
    } = opts || {};
    const L = { ...LABELS, ...((opts && opts.labels) || {}) };
    root.innerHTML = `<div class="gk"><div style="text-align:center;padding:40px"><span class="hk-spin"></span></div></div>`;
    // 목록을 받는 사이 한 판(#m{id})으로 들어갔으면 늦게 온 목록으로 그 화면을 덮지 않는다
    const away = () => /^#m\d+$/.test(location.hash);
    let d, open = { open: true, opensAt: null };
    try { [d, open] = await Promise.all([HKApi.matchOverview(game), HKApi.playStatus().catch(() => open)]); }
    catch (e) {
      if (away()) return open;
      root.innerHTML = `<div class="gk"><div class="gk__empty">${esc(e.message || "불러오지 못했어요")}</div></div>`; return open;
    }
    if (away()) return open;
    const incoming = d.incoming.map((m) => `<div class="gk__row">${person(m.opponent, `도전장 · ${due(m.deadlineAt)}`)}<span class="gk__btns">
        <button type="button" class="hk-btn hk-btn--primary" data-accept="${m.id}" ${open.open ? "" : "disabled"}>수락</button>
        <button type="button" class="hk-btn hk-btn--secondary" data-decline="${m.id}">거절</button></span></div>`).join("");
    const sent = d.sent.map((m) => `<div class="gk__row">${person(m.opponent, `수락 기다리는 중 · ${due(m.deadlineAt)}`)}<span class="gk__btns"><button type="button" class="hk-btn hk-btn--secondary" data-decline="${m.id}">취소</button></span></div>`).join("");
    const r = d.ranking;
    const rank = r.top.map((x) => `<div class="gk__row ${r.me && r.me.id === x.id ? "gk__me" : ""}"><span class="gk__rank">${x.rank}</span>${person(x)}<span class="gk__tag">${x.wins}승 ${x.losses}패</span></div>`).join("");
    const botSec = bot && bot.length ? `<section class="gk__sec"><h2>${esc(L.bot)}</h2>
          <div class="gk__levels">${bot.map(([k, t]) => `<button type="button" class="hk-btn hk-btn--secondary" data-bot="${esc(k)}" ${open.open ? "" : "disabled"}>${esc(t)}</button>`).join("")}</div>
          <div class="gk__due">${esc(botNote)}</div>
        </section>` : "";
    root.innerHTML = `<div class="gk">
        <a class="gk__back" href="/arcade">‹ 아케이드</a>
        <h1>${esc(title)}</h1>
        <p class="gk__lead">${esc(lead)}</p>
        ${intro}
        ${closedNote(open)}
        ${section(L.incoming, incoming)}
        ${section(L.myTurn, d.myTurn.map((m) => rowHtml(m, L.turnTag, "is-turn", rowNote)).join(""))}
        ${section(L.waiting, d.waiting.map((m) => rowHtml(m, L.waitTag, "", rowNote)).join(""))}
        ${section(L.sent, sent)}
        ${botSec}
        <section class="gk__sec"><h2>${esc(L.challenge)}</h2>
          <input class="gk__search" id="gk-q" type="search" placeholder="이름이나 부서로 찾기" autocomplete="off" ${open.open ? "" : "disabled"}>
          <div id="gk-people"></div>
        </section>
        ${section(L.recent, d.recent.map((m) => resultRow(m, resultNote)).join(""))}
        <section class="gk__sec"><h2>${esc(L.rank)}</h2>${rank || `<div class="gk__empty">${esc(rankEmpty)}</div>`}
          ${rankNote ? `<div class="gk__due">${esc(rankNote)}</div>` : ""}</section>
      </div>`;
    const q = document.getElementById("gk-q");
    let wait = 0;
    q.addEventListener("input", () => {
      clearTimeout(wait);
      wait = setTimeout(async () => {
        const box = document.getElementById("gk-people");
        if (!box) return;
        if (!q.value.trim()) { box.innerHTML = ""; return; }
        try {
          const list = await HKApi.matchMembers(q.value);
          box.innerHTML = list.map((p) => `<div class="gk__row">${person(p)}<span class="gk__btns"><button type="button" class="hk-btn hk-btn--primary" data-challenge="${p.id}">도전</button></span></div>`).join("") || `<div class="gk__empty">찾는 직원이 없어요</div>`;
        } catch (e) { fail(e); }
      }, 250);
    });
    return open;
  }
  // 목록의 버튼 — 수락 · 거절 · 도전 · 컴퓨터 대국
  async function act(el, game, refresh) {
    const { accept, decline, challenge, bot } = el.dataset;
    try {
      if (bot) { const m = await HKApi.matchBot(bot, game); location.hash = `m${m.id}`; }
      else if (accept) { const m = await HKApi.matchAccept(Number(accept)); location.hash = `m${m.id}`; }
      else if (decline) { await HKApi.matchDecline(Number(decline)); refresh(); }
      else if (challenge) { await HKApi.matchCreate(Number(challenge), game); HKUI.toast("도전장을 보냈어요"); refresh(); }
    } catch (e) { fail(e); }
  }
  return { esc, REASON, reason, ava, person, closedNote, due, fail, lobby, act, versus };
})();
