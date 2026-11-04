// 2인 협동 방 공용 — 목록(초대 · 받은 초대 · 같이 할 방 · 지난 기록 · 순위) · 대기실 · 대화 · 끝 화면 · 실시간 반영
// 게임마다 다른 것(진행 화면 · 옆 칸 · 끝 화면 덧붙임 · 버튼 동작)은 game 으로 받는다.
//   HKCoop.mount({
//     room: "overtime", hero: { facts: [...], note: "..." }, rankText(x), recentText(r) → [text, cls],
//     quick: [...], play(room, ctx) → html, side(room, ctx) → html, end(room, ctx) → html,
//     click(el, ctx) → true(처리함), input(el, ctx), tick(ctx), changed(prev, next, ctx), toast(prev, next) → 알림을 띄울지
//   })
window.HKCoop = (function () {
  const { esc, ava, closedNote, due, fail } = HKMatch;
  const mmss = (s) => { s = Math.max(0, Math.round(s)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
  const won = (n) => `${Number(n || 0).toLocaleString("ko-KR")}원`;
  const mini = (p) => `<span class="er-team">${ava(p)}<b>${esc(p.name)}</b></span>`;

  function mount(game) {
    let root = null, open = { open: true, opensAt: null }, room = null, timer = 0, waiter = null, sending = false, myName = "";
    const draft = { chat: "" };
    const ctx = {
      get room() { return room; }, get open() { return open; }, get myName() { return myName; },
      paint: () => paint(), refresh: () => refresh(), set: (next) => setRoom(next), act: (fn) => act(fn), fail, esc, mmss, won,
    };

    // ---------- 목록 ----------
    function stopWait() { clearTimeout(timer); timer = 0; if (waiter) { waiter.abort(); waiter = null; } }
    async function showLobby() {
      stopWait(); room = null;
      root.innerHTML = `<div class="er er-lobby"><div style="text-align:center;padding:40px"><span class="hk-spin"></span></div></div>`;
      let d;
      try { [d, open] = await Promise.all([HKApi.coopOverview(game.room), HKApi.playStatus().catch(() => open)]); }
      catch (e) { root.innerHTML = `<div class="er er-lobby"><div class="gk__empty">${esc(e.message || "불러오지 못했어요")}</div></div>`; return; }
      const row = (r, tag, cls, btns = "") => `<${btns ? "div" : "a"} class="gk__row" ${btns ? "" : `href="#r${r.id}"`}>${ava(r.partner)}<span class="gk__who"><b>${esc(r.partner.name)}</b><small>${esc(r.partner.department || "")}</small></span>${tag ? `<span class="gk__tag ${cls || ""}">${tag}</span>` : ""}${btns}</${btns ? "div" : "a"}>`;
      const incoming = d.incoming.map((r) => row(r, "", "", `<span class="gk__btns">
          <button type="button" class="hk-btn hk-btn--primary" data-accept="${r.id}" ${open.open ? "" : "disabled"}>수락</button>
          <button type="button" class="hk-btn hk-btn--secondary" data-leave="${r.id}">거절</button></span>`)).join("");
      const sent = d.sent.map((r) => row(r, "", "", `<span class="gk__btns"><small style="color:var(--text-muted);font-size:12.5px">${due(r.deadlineAt)}</small><button type="button" class="hk-btn hk-btn--secondary" data-leave="${r.id}">취소</button></span>`)).join("");
      const active = d.active.map((r) => row(r, `${r.partnerHere ? `<span class="er-dot is-on"></span>` : ""}${r.status === "PLAYING" ? "진행 중" : "준비 중"}`, "is-live")).join("");
      const recent = d.recent.map((r) => { const [t, c] = game.recentText(r); return row(r, t, c); }).join("");
      const rk = d.ranking;
      const rank = rk.top.map((x) => `<div class="gk__row ${x.mine ? "gk__me" : ""}"><span class="gk__rank">${x.rank}</span>${mini(x.team[0])}${mini(x.team[1])}<span class="gk__tag">${game.rankText(x)}</span></div>`).join("");
      const sec = (t, body) => (body ? `<section class="gk__sec"><h2>${t}</h2>${body}</section>` : "");
      root.innerHTML = `<div class="er er-lobby">
          <a class="gk__back" href="/arcade">‹ 아케이드</a>
          <div class="er-hero ${game.heroClass || ""}">
            <h1>${esc(d.room.title)}</h1>
            <p>${esc(d.room.intro)}</p>
            <div class="er-hero__facts">${game.hero.facts.map((f) => `<span>${esc(f)}</span>`).join("")}</div>
          </div>
          ${closedNote(open)}
          ${sec("받은 초대", incoming)}
          ${sec("같이 할 방", active)}
          ${sec("보낸 초대", sent)}
          <section class="gk__sec"><h2>동료 초대하기</h2>
            <input class="gk__search" id="er-q" type="search" placeholder="이름이나 부서로 찾기" autocomplete="off" ${open.open ? "" : "disabled"}>
            <div id="er-people"></div>
            <div class="gk__due">${esc(game.hero.note)}</div>
          </section>
          ${sec("지난 기록", recent)}
          <section class="gk__sec"><h2>${esc(game.rankTitle || "순위")}</h2>${rank || `<div class="gk__empty">아직 기록이 없어요. 첫 기록을 남겨 보세요!</div>`}
            <div class="gk__due">${esc(game.rankNote || "")}</div></section>
        </div>`;
      const q = document.getElementById("er-q");
      let t = 0;
      q.addEventListener("input", () => {
        clearTimeout(t);
        t = setTimeout(async () => {
          const box = document.getElementById("er-people");
          if (!box) return;
          if (!q.value.trim()) { box.innerHTML = ""; return; }
          try {
            const list = await HKApi.matchMembers(q.value);
            box.innerHTML = list.map((p) => `<div class="gk__row">${ava(p)}<span class="gk__who"><b>${esc(p.name)}</b><small>${esc(p.department || "")}</small></span><span class="gk__btns"><button type="button" class="hk-btn hk-btn--primary" data-invite="${p.id}">초대</button></span></div>`).join("") || `<div class="gk__empty">찾는 직원이 없어요</div>`;
          } catch (e) { fail(e); }
        }, 250);
      });
    }

    // ---------- 방 공용 조각 ----------
    function remain() {
      if (room.status !== "PLAYING" || !room.deadlineAt) return null;
      return game.remain ? game.remain(ctx) : (new Date(room.deadlineAt) - Date.now()) / 1000;
    }
    function topHtml() {
      const left = remain();
      const timerBox = room.status === "PLAYING" && left != null
        ? `<div class="er-timer ${left < 30 || (room.limitSec > 600 && left < 180) ? "is-low" : ""}" id="er-timer"><span class="er-timer__t">${mmss(left)}</span><small>${esc(game.timerNote ? game.timerNote(ctx) : "남은 시간")}</small></div>` : "";
      const live = ["READY", "PLAYING"].includes(room.status);
      const callBtn = live && !room.partnerHere ? `<button type="button" class="er-btn-call" data-call>Teams로 부르기</button>` : "";
      return `<div class="er-top">
          <div><div class="er-top__title">${esc(room.title)}</div><div class="er-top__side">${room.sideName ? `나는 <b style="color:#e2e8f0">${esc(room.sideName)}</b>` : "초대"}</div></div>
          ${timerBox}
          ${game.topExtra ? game.topExtra(ctx) : ""}
          <div class="er-top__mate">${ava(room.partner)}<span><b>${esc(room.partner.name)}</b><br><small style="color:#94a3b8"><span class="er-dot ${room.partnerHere ? "is-on" : ""}"></span>${live ? (room.partnerHere ? "들어와 있어요" : "아직 안 들어왔어요") : esc(room.partnerSideName || "")}</small></span>${callBtn}</div>
        </div>`;
    }
    function chatHtml() {
      const items = [
        ...room.log.map((l) => ({ t: l.t, html: `<div class="er-msg is-log">${esc(l.text)}</div>` })),
        ...room.chat.map((c) => ({ t: c.t, html: `<div class="er-msg ${c.me ? "is-me" : ""}"><small>${esc(c.name)}</small>${esc(c.text)}</div>` })),
      ].sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
      const can = ["READY", "PLAYING", "CLEAR", "FAILED"].includes(room.status);
      return `<div class="er-card"><h2>대화</h2>
          <div class="er-chat" id="er-chat">${items.map((x) => x.html).join("") || `<div class="er-msg is-log">하고 싶은 말을 여기에 적어 알려 주세요</div>`}</div>
          ${can ? `<form class="er-say" id="er-say"><input id="er-say-in" maxlength="120" placeholder="상대에게 보낼 말" autocomplete="off" value="${esc(draft.chat)}"><button class="hk-btn hk-btn--primary" type="submit">보내기</button></form>
          <div class="er-quick">${game.quick.map((q) => `<button type="button" data-quick="${esc(q)}">${esc(q)}</button>`).join("")}</div>` : ""}
        </div>`;
    }
    function readyHtml() {
      const me = room.ready.me, mate = room.ready.partner;
      return `<div class="er-card er-wait">
          <h2 style="font-size:18px">출발 전 대기실</h2>
          <p>${esc(room.intro)}</p>
          <div class="er-sides">
            <div class="er-side ${me ? "is-ready" : ""}"><small>나</small><b>${esc(room.sideName)}</b><span>${me ? "준비 완료" : "준비 전"}</span></div>
            <div class="er-side ${mate ? "is-ready" : ""}"><small>${esc(room.partner.name)}</small><b>${esc(room.partnerSideName)}</b><span>${mate ? "준비 완료" : room.partnerHere ? "준비 전" : "아직 안 들어왔어요"}</span></div>
          </div>
          ${game.readyNote ? `<div class="er-role">${game.readyNote(ctx)}</div>` : ""}
          <button type="button" class="hk-btn hk-btn--primary" data-ready="${me ? 0 : 1}" style="min-width:200px" ${open.open || me ? "" : "disabled"}>${me ? "준비 취소" : "준비"}</button>
          <p style="font-size:13px">둘 다 준비를 누르면 ${Math.round(room.limitSec / 60)}분 타이머가 바로 시작돼요.</p>
          <div class="er-actions"><button type="button" class="er-linkbtn" style="color:var(--text-muted)" data-leave="${room.id}">방 나가기</button></div>
        </div>`;
    }
    function pendingHtml() {
      return `<div class="er-card er-wait"><h2 style="font-size:18px">${room.incoming ? `${esc(room.partner.name)}님의 초대` : "수락을 기다리고 있어요"}</h2>
          <p>${esc(room.intro)}</p>
          <div class="er-actions">${room.incoming
            ? `<button type="button" class="hk-btn hk-btn--primary" data-accept="${room.id}" ${open.open ? "" : "disabled"}>수락</button><button type="button" class="hk-btn hk-btn--secondary" data-leave="${room.id}">거절</button>`
            : `<button type="button" class="hk-btn hk-btn--secondary" data-leave="${room.id}">초대 취소</button>`}</div>
          <p style="font-size:13px">${due(room.deadlineAt)}</p></div>`;
    }
    function closedHtml() {
      const why = { TIMEOUT: "시간이 다 됐어요.", GIVEUP: "포기한 방이에요.", LEFT: "나간 방이에요." }[room.end] || "끝난 방이에요.";
      const again = room.status === "FAILED" || room.status === "CLEAR"
        ? `<button type="button" class="hk-btn hk-btn--primary" data-invite="${room.partner.id}" ${open.open ? "" : "disabled"}>${esc(room.partner.name)}님과 다시 하기</button>` : "";
      if (room.status === "CLEAR" && game.end) return game.end(ctx, again);
      return `<div class="er-end is-fail"><h2>${room.status === "FAILED" ? (game.failTitle || "실패") : room.status === "EXPIRED" ? "만료된 초대" : "닫힌 방"}</h2><p>${why}</p>
          <div class="er-actions">${room.status === "FAILED" ? again : ""}<a class="hk-btn hk-btn--secondary" href="#" style="text-decoration:none">목록</a></div></div>`;
    }
    function paint() {
      const focus = document.activeElement && document.activeElement.id;
      const caret = focus && document.activeElement.selectionStart;
      const chatBox = document.getElementById("er-chat");
      const stick = !chatBox || chatBox.scrollTop + chatBox.clientHeight >= chatBox.scrollHeight - 30;
      let main = "";
      if (room.status === "PENDING") main = pendingHtml();
      else if (room.status === "READY") main = readyHtml();
      else if (room.status === "PLAYING") main = game.play(ctx);
      else main = closedHtml() + (game.after ? game.after(ctx) : "");
      const sideOk = ["READY", "PLAYING", "CLEAR", "FAILED"].includes(room.status);
      const side = sideOk ? `${room.status !== "READY" && game.side ? game.side(ctx) : ""}${chatHtml()}` : "";
      root.innerHTML = `<div class="er ${game.wide ? "er-wide" : ""}">
          <a class="gk__back" href="#">‹ ${esc(game.listName || "목록")}</a>
          ${closedNote(open)}
          ${topHtml()}
          <div class="er-grid" style="${side ? "" : "grid-template-columns:minmax(0,1fr)"}"><div>${main}</div>${side ? `<div>${side}</div>` : ""}</div>
          ${room.status === "PLAYING" ? `<div class="er-actions"><button type="button" class="er-linkbtn" style="color:var(--text-muted)" data-giveup>포기하기</button></div>` : ""}
        </div>`;
      HKUI.refreshIcons(root);
      if (game.painted) game.painted(ctx);
      const box = document.getElementById("er-chat");
      if (box && stick) box.scrollTop = box.scrollHeight;
      if (focus) {
        const el = document.getElementById(focus);
        if (el) { el.focus(); try { if (caret != null) el.setSelectionRange(caret, caret); } catch (_) {} }
      }
    }
    function tickClock() {
      if (!room) return;
      const el = document.getElementById("er-timer");
      const left = remain();
      if (el && left != null) {
        el.querySelector(".er-timer__t").textContent = mmss(left);
        el.classList.toggle("is-low", left < 30 || (room.limitSec > 600 && left < 180));
        if (left <= 0 && !el.dataset.ended) { el.dataset.ended = "1"; refresh(); }
      }
      if (game.tick) game.tick(ctx);
    }
    // 상대가 한 일(새 진행 기록)은 알림으로 — 내가 한 일과 처음 들어올 때는 조용히
    function setRoom(next) {
      const prev = room;
      room = next;
      if (prev && prev.id === next.id && prev.log && next.log) {
        const lastT = prev.log.length ? prev.log[prev.log.length - 1].t : "";
        next.log.filter((l) => l.t > lastT && !l.text.startsWith(`${myName}님`))
          .forEach((l) => HKUI.toast(l.text, /틀렸|실패|포기|나갔/.test(l.text) ? "error" : "success"));
      }
      if (game.changed) game.changed(prev, next, ctx);
      paint();
      schedule();
    }
    async function refresh() {
      if (!room) return;
      try { setRoom(await HKApi.coopDetail(room.id)); } catch (e) { fail(e); }
    }
    function schedule(delay = 0) {
      stopWait();
      if (!room || !["PENDING", "READY", "PLAYING", "CLEAR", "FAILED"].includes(room.status)) return;
      timer = setTimeout(async () => {
        timer = 0;
        if (document.hidden || !room) return;
        const id = room.id, ctl = new AbortController();
        waiter = ctl;
        let next;
        try { next = await HKApi.coopWait(id, room.seq, room.partnerHere, ctl.signal); }
        catch (_) { if (waiter === ctl) { waiter = null; schedule(3000); } return; }
        if (waiter !== ctl || !room || room.id !== id) return;
        waiter = null;
        if (next.seq !== room.seq || next.partnerHere !== room.partnerHere || next.status !== room.status) setRoom(next);
        else { room = next; schedule(); }
      }, delay);
    }
    async function showRoom(id) {
      stopWait();
      if (game.reset) game.reset(ctx);
      try { [room, open] = await Promise.all([HKApi.coopDetail(id), HKApi.playStatus().catch(() => open)]); }
      catch (e) { fail(e); location.hash = ""; return; }
      if (game.changed) game.changed(null, room, ctx);
      paint();
      schedule();
    }
    async function act(fn) {
      if (sending) return;
      sending = true;
      try { const next = await fn(); if (next && next.id) setRoom(next); return next; }
      catch (e) { fail(e); }
      finally { sending = false; }
    }

    function route() {
      const m = /^#r(\d+)$/.exec(location.hash);
      if (m) showRoom(Number(m[1])); else showLobby();
    }
    HKMember.mountPage({
      active: "lounge",
      auth: true,
      render: () => `<div id="er-root"></div>`,
      afterMount: async (profile) => {
        root = document.getElementById("er-root");
        myName = (profile && profile.name) || "";
        root.addEventListener("click", async (e) => {
          const t = e.target.closest("button, a");
          if (!t) return;
          const d = t.dataset;
          if (t.getAttribute("href") === "#") { e.preventDefault(); location.hash = ""; return; }
          if (d.invite) {
            try { const r = await HKApi.coopInvite(Number(d.invite), game.room); HKUI.toast("초대를 보냈어요. 수락하면 Teams로 알려 드려요"); location.hash = `r${r.id}`; } catch (err) { fail(err); }
            return;
          }
          if (d.accept) { try { const r = await HKApi.coopAccept(Number(d.accept)); location.hash = `r${r.id}`; if (room && room.id === r.id) setRoom(r); } catch (err) { fail(err); } return; }
          if (d.leave) {
            const pending = !room || room.status === "PENDING";
            if (!pending && !(await HKUI.confirmDialog("방을 나갈까요?", "나가면 이 방은 닫혀요. 상대에게도 Teams로 알려요.", { confirmLabel: "나가기", confirmVariant: "danger" }))) return;
            try { await HKApi.coopLeave(Number(d.leave)); if (room) await refresh(); else showLobby(); } catch (err) { fail(err); }
            return;
          }
          if (!room) return;
          if (d.ready) return act(() => HKApi.coopReady(room.id, d.ready === "1"));
          if ("call" in d) { try { setRoom(await HKApi.coopCall(room.id)); HKUI.toast(`${room.partner.name}님에게 Teams로 알렸어요`); } catch (err) { fail(err); } return; }
          if ("giveup" in d) {
            if (!(await HKUI.confirmDialog("포기할까요?", "이 판은 실패로 끝나고 도장도 받지 못해요.", { confirmLabel: "포기", confirmVariant: "danger" }))) return;
            return act(() => HKApi.coopLeave(room.id));
          }
          if (d.quick) { try { setRoom(await HKApi.coopSay(room.id, d.quick)); } catch (err) { fail(err); } return; }
          if (game.click) await game.click(t, ctx);
        });
        root.addEventListener("input", (e) => {
          if (e.target.id === "er-say-in") draft.chat = e.target.value;
          else if (game.input) game.input(e.target, ctx);
        });
        root.addEventListener("keydown", (e) => { if (game.keydown) game.keydown(e, ctx); });
        root.addEventListener("submit", async (e) => {
          if (e.target.id !== "er-say") return;
          e.preventDefault();
          const text = draft.chat.trim();
          if (!text || !room) return;
          try { draft.chat = ""; setRoom(await HKApi.coopSay(room.id, text)); document.getElementById("er-say-in")?.focus(); }
          catch (err) { draft.chat = text; fail(err); }
        });
        window.addEventListener("hashchange", route);
        document.addEventListener("visibilitychange", () => { if (!document.hidden && room) refresh(); });
        setInterval(tickClock, game.tickMs || 250);
        route();
      },
    });
    return ctx;
  }
  return { mount, mmss, won, mini };
})();
