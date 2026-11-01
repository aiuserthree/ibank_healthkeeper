// 턴제 대전 공용 — 받은 도전 · 진행 중 · 컴퓨터 대국 · 동료 찾기 · 최근 결과 · 순위
window.HKMatch = (function () {
  const esc = HKUI.escapeHtml;
  const REASON = { FIVE: "오목 완성", CHECKMATE: "체크메이트", STALEMATE: "스테일메이트", RESIGN: "기권", TIMEOUT: "시간 초과", DRAW: "무승부" };
  const ava = (p) => (p.avatarUrl ? `<img src="${esc(p.avatarUrl)}" alt="" onerror="this.remove()">` : `<span class="gk__ava"></span>`);
  const person = (p, sub) => `${ava(p)}<span class="gk__who"><b>${esc(p.name)}</b><small>${esc(sub ?? p.department ?? "")}</small></span>`;
  const closedNote = (open) => (open.open ? "" : `<div class="gk__closed">지금은 업무 시간이라 볼 수만 있어요. ${esc(open.opensAt || "")}부터 다시 둘 수 있어요.</div>`);
  function due(iso) {
    if (!iso) return "";
    const h = Math.max(0, (new Date(iso) - Date.now()) / 3600e3);
    return h >= 1 ? `${Math.floor(h)}시간 남음` : `${Math.max(1, Math.ceil(h * 60))}분 남음`;
  }
  function fail(e) { HKUI.toast(e.message || "처리하지 못했어요", "error"); }
  function rowHtml(m, tag, cls) {
    return `<a class="gk__row" href="#m${m.id}">${person(m.opponent, m.status === "ACTIVE" ? `${m.moveCount}수 · ${due(m.deadlineAt)}` : undefined)}<span class="gk__tag ${cls || ""}">${tag}</span></a>`;
  }
  function resultRow(m) {
    const tag = { win: "승", lose: "패", draw: "무" }[m.result];
    return `<a class="gk__row" href="#m${m.id}">${person(m.opponent, `${REASON[m.endReason] || ""} · ${m.moveCount}수`)}<span class="gk__tag is-${m.result}">${tag}</span></a>`;
  }
  const section = (title, body) => (body ? `<section class="gk__sec"><h2>${title}</h2>${body}</section>` : "");

  // 목록을 그리고 지금 게임 시간 정보를 돌려준다
  async function lobby(root, game, { title, lead }) {
    root.innerHTML = `<div class="gk"><div style="text-align:center;padding:40px"><span class="hk-spin"></span></div></div>`;
    let d, open = { open: true, opensAt: null };
    try { [d, open] = await Promise.all([HKApi.matchOverview(game), HKApi.playStatus().catch(() => open)]); }
    catch (e) { root.innerHTML = `<div class="gk"><div class="gk__empty">${esc(e.message || "불러오지 못했어요")}</div></div>`; return open; }
    const incoming = d.incoming.map((m) => `<div class="gk__row">${person(m.opponent, `도전장 · ${due(m.deadlineAt)}`)}<span class="gk__btns">
        <button type="button" class="hk-btn hk-btn--primary" data-accept="${m.id}" ${open.open ? "" : "disabled"}>수락</button>
        <button type="button" class="hk-btn hk-btn--secondary" data-decline="${m.id}">거절</button></span></div>`).join("");
    const sent = d.sent.map((m) => `<div class="gk__row">${person(m.opponent, `수락 기다리는 중 · ${due(m.deadlineAt)}`)}<span class="gk__btns"><button type="button" class="hk-btn hk-btn--secondary" data-decline="${m.id}">취소</button></span></div>`).join("");
    const r = d.ranking;
    const rank = r.top.map((x) => `<div class="gk__row ${r.me && r.me.id === x.id ? "gk__me" : ""}"><span class="gk__rank">${x.rank}</span>${person(x)}<span class="gk__tag">${x.wins}승 ${x.losses}패</span></div>`).join("");
    root.innerHTML = `<div class="gk">
        <a class="gk__back" href="/arcade">‹ 아케이드</a>
        <h1>${esc(title)}</h1>
        <p class="gk__lead">${esc(lead)}</p>
        ${closedNote(open)}
        ${section("받은 도전", incoming)}
        ${section("내 차례", d.myTurn.map((m) => rowHtml(m, "내 차례", "is-turn")).join(""))}
        ${section("상대 차례", d.waiting.map((m) => rowHtml(m, "기다리는 중")).join(""))}
        ${section("보낸 도전", sent)}
        <section class="gk__sec"><h2>컴퓨터와 두기</h2>
          <div class="gk__levels">${[["easy", "쉬움"], ["normal", "보통"], ["hard", "어려움"]].map(([k, t]) => `<button type="button" class="hk-btn hk-btn--secondary" data-bot="${k}" ${open.open ? "" : "disabled"}>${t}</button>`).join("")}</div>
          <div class="gk__due">바로 시작해요. 컴퓨터전은 순위에 넣지 않아요.</div>
        </section>
        <section class="gk__sec"><h2>동료에게 도전하기</h2>
          <input class="gk__search" id="gk-q" type="search" placeholder="이름이나 부서로 찾기" autocomplete="off" ${open.open ? "" : "disabled"}>
          <div id="gk-people"></div>
        </section>
        ${section("최근 결과", d.recent.map(resultRow).join(""))}
        <section class="gk__sec"><h2>순위</h2>${rank || `<div class="gk__empty">아직 끝난 대국이 없어요</div>`}
          <div class="gk__due">기권·시간 초과는 10수 이상 둔 판만 세고, 같은 상대에게 하루에 거둔 승은 1승으로 쳐요</div></section>
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
  return { esc, REASON, ava, closedNote, due, fail, lobby, act };
})();
