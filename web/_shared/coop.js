// 2인 협동 방 공용 — 목록(초대 · 받은 초대 · 같이 할 방 · 지난 기록 · 순위) · 대기실 · 대화 · 끝 화면 · 실시간 반영
// 게임마다 다른 것(진행 화면 · 옆 칸 · 끝 화면 덧붙임 · 버튼 동작)은 game 으로 받는다.
// 협동 시리즈 「오늘도 둘이서」의 화라면(/_shared/coop-story.js 의 HKCoopStory.chapters[room]) 이야기 · 그림 · 화 색을 함께 그린다.
// 페이지 <head> 순서: ui.js · api.js · member-shell.js · match-lobby.js · play.js(효과음 HKSound) · coop-story.js · coop.js
//
//   const ctx = HKCoop.mount(game)
//
// game — 모두 고를 수 있다(room · hero · rankText · recentText · quick · play 는 꼭)
//   room: "lunch"                       서버 방 key (협동 시리즈 화 key 와 같다)
//   listName: "분식집 목록"              방 화면 위 「‹ 목록」 글자
//   heroClass: "is-kitchen"              목록 첫 칸(.er-hero)에 붙일 클래스 — 배경색 등
//   hero: { facts: [...], note: "..." }  첫 칸의 짧은 특징들 · 동료 초대 칸 아래 안내
//   rankTitle · rankNote                 순위 칸 제목 · 아래 안내
//   rankText(x) → 글자                   순위 한 줄의 기록 (x.score · x.sec) — 목록 「내 기록」의 최고 기록에도 쓴다
//   recentText(r) → [글자, 클래스]       지난 기록 한 줄의 꼬리표
//   quick: [...]                         대화창 아래 빠른 말
//   wide: true                           방 화면을 넓게
//   tickMs: 250                          tick 간격(ms)
//   chatWhilePlaying: false              진행 중에는 대화창을 닫는다
//   failTitle: "탈출 실패"               포기하고 끝난 방 제목
//   remain(ctx) → 초                     남은 시간(기본: 서버 마감 시각까지)
//   timerNote(ctx) → 글자                시계 아래 글자
//   topExtra(ctx) → html                 위 막대 가운데에 덧붙임
//   readyNote(ctx) → html                대기실 역할 안내
//   readyExtra(ctx) → html               [새] 대기실 「준비」 버튼 위 — 게임 설정 고르기 등. 고르면 click 에서
//                                         HKApi.coopOptions(ctx.room.id, {...}) 를 직접 부르고 ctx.set(결과) 한다.
//                                         고른 설정은 ctx.room.opts 로 돌아온다(바뀌면 서버가 둘의 준비를 푼다)
//   play(ctx) → html                     진행 중 화면
//   side(ctx) → html                     옆 칸(대화창 위) — 대기실에서는 안 그린다
//   end(ctx, again) → html               성공(CLEAR) 끝 카드. again 은 「○○님과 다시 하기」 버튼 —
//                                         넣지 않아도 된다(공용 끝 화면 맨 아래에 「다시 하기」·「다음 화」가 붙는다.
//                                         카드에 data-invite 버튼이 있으면 공용 줄에서는 다시 하기를 뺀다)
//   failEnd(ctx, again) → html           [새] 포기(FAILED) 끝 카드 — 없으면 공용 카드(failTitle)
//   stats(ctx) → [{ label, value }]      [새] 끝 화면 결과 칸(글자로 넣는다, html 아님) — 끝 카드 바로 아래
//   storyTier(ctx) → "great"|"ok"|"fail" [새] 끝 이야기 갈래(끝 소리 win / lose 도 이걸 따른다). 없으면 화 기준
//                                         HKCoopStory.tier(room, 방) — 그것도 없으면 성공한 판 → "ok", 그 밖 → "fail".
//                                         시간제 게임은 끝나면 늘 CLEAR 라서 점수 0 · 일찍 끝남(HEARTS)도 "fail" 로 본다.
//                                         거꾸로 성공한 판(cleared — 시간제는 점수 > 0)은 무엇을 돌려줘도 "fail" 대신 "ok"
//   after(ctx) → html                    끝 화면 맨 아래 덧붙임(지난 진행 보기 등)
//   painted(ctx)                         다 그린 뒤
//   changed(prev, next, ctx)             방이 바뀔 때(그리기 전) — prev 는 처음 들어올 때 null
//   patch(prev, next, ctx) → true        [새] 진행 중(PLAYING → PLAYING, 같은 방 · 상대 들어옴 여부 그대로) 방이 바뀌면 changed 뒤에
//                                         부른다. 게임이 바뀐 칸만 손으로 고치고 true 를 돌려주면 통째로 다시 그리지 않는다
//                                         (캔버스 · 입력 칸이 그대로 남는다). false · 없음 · 오류면 늘 하던 대로 통째로 다시 그린다.
//                                         true 면 공용 쪽도 다시 그리지 않는다 — 위 막대(topExtra 포함) · 옆 칸(side) · 대화 목록(#er-chat)이
//                                         그대로고 painted 도 부르지 않는다. 진행 중 대화창을 여는 게임은 #er-chat 을 스스로 고친다
//   waitDelay: 200 | (ctx) → ms          [새] patch 가 true 일 때 /wait 를 다시 걸기 전에 쉬는 시간(ms) — 잦은 소식을 한 번에 묶어 받는다.
//                                         함수면 그때마다 정한다(예: 내가 보낸 동작의 응답으로 새 방 정보를 계속 받는 동안은 길게)
//   reset(ctx)                           다른 방으로 들어가기 전
//   tick(ctx)                            tickMs 마다
//   click(el, ctx)                       버튼 · 링크를 누르면(공용 버튼 뒤에)
//   input(el, ctx) · keydown(e, ctx)     입력 칸
//
// ctx — game 의 함수들이 받는다(HKCoop.mount 도 돌려준다)
//   room · open · myName · me(내 정보)       지금 방 · 게임 시간 정보 · 내 이름
//   chapter                                  협동 시리즈 화 정보(HKCoopStory.chapters[room]) — 시리즈 밖이면 null
//   storyCtx() → { id, a, b, me }            컷신에 넘길 이름들(a 초대한 사람 · b 초대받은 사람 · me 내가 누구인지)
//   paint() · refresh() · set(next) · act(fn) 다시 그리기 · 서버에서 다시 받기 · 받은 방으로 바꾸기 · 보내고 바꾸기(연타 막음)
//   sfx(name, arg)                           [새] 효과음(HKSound — 소리를 껐거나 없으면 조용히 넘어감).
//                                            이름: tap select pop coin jump land hit hurt explode shoot laser powerup drop
//                                                  line combo success fail win lose countdown go tick whoosh swap invalid
//   fail(e) · esc · mmss · won               알림 · 글자 다듬기
//
// 공용이 내는 소리: 상대가 들어옴(pop) · 시작(go) · 끝(win / lose) · 상대가 한 일 알림(tap). 위 막대의 🔊 로 켜고 끈다.
// 공용이 하는 일: PC 마우스로 누르는 사이 방 화면이 다시 그려져 사라진 click 을 대신 눌러 준다(같은 data-* 버튼이 뗀 자리에 있을 때) ·
//                 끝나면 끝 카드가 화면에 보이게 한 번 굴린다 — 게임 페이지가 따로 하지 않아도 된다
window.HKCoop = (function () {
  const { esc, ava, closedNote, due, fail } = HKMatch;
  const mmss = (s) => { s = Math.max(0, Math.round(s)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
  const won = (n) => `${Number(n || 0).toLocaleString("ko-KR")}원`;
  const nf = (n) => Number(n || 0).toLocaleString("ko-KR"); // 보여 주는 수 — 1,234
  const mini = (p) => `<span class="er-team">${ava(p)}<b>${esc(p.name)}</b></span>`;
  const TIERS = ["great", "ok", "fail"];
  // 성공한 판인지 — coop-story.js 가 없을 때만 쓰는 같은 규칙(HKCoopStory.cleared · 서버 series() 의 cleared)
  const FAIL_ENDS = ["HEARTS", "GIVEUP", "TIMEOUT", "LEFT"];
  const cleared = (r) => !!r && r.status === "CLEAR" && !FAIL_ENDS.includes(r.end) && (r.game === "escape" || Number(r.score) > 0);

  function mount(game) {
    let root = null, open = { open: true, opensAt: null }, room = null, timer = 0, waiter = null, sending = false, myName = "", me = null;
    let lastShown = "", clicking = false;
    const draft = { chat: "" };
    const S = window.HKCoopStory || null;
    const ch = S && S.chapter ? S.chapter(game.room) : null;
    const chVars = ch ? S.vars(game.room) : "";
    const sfx = (name, arg) => { try { if (window.HKSound) window.HKSound.play(name, arg); } catch (_) { /* 소리는 부가 기능 */ } };
    function storyCtx() {
      if (!room) return { a: myName || "나", b: "○○", me: "a" };
      const host = !!room.isHost, mate = (room.partner && room.partner.name) || "동기";
      return { id: room.id, a: host ? myName || "나" : mate, b: host ? mate : myName || "나", me: host ? "a" : "b" };
    }
    const ctx = {
      get room() { return room; }, get open() { return open; }, get myName() { return myName; }, get me() { return me; },
      get chapter() { return ch; }, storyCtx,
      paint: () => paint(), refresh: () => refresh(), set: (next) => setRoom(next), act: (fn) => act(fn), sfx, fail, esc, mmss, won,
    };
    function tier() {
      let t = null;
      try { t = game.storyTier ? game.storyTier(ctx) : null; } catch (_) { t = null; }
      if (!TIERS.includes(t)) {
        try { t = S && S.tier ? S.tier(game.room, room) : null; } catch (_) { t = null; }
        if (!TIERS.includes(t)) t = cleared(room) ? "ok" : "fail";
      }
      // 성공한 판(시리즈 「성공」에 세는 판 — 시간제 게임은 점수 > 0)은 「다음엔 꼭」(fail)으로 끝내지 않는다
      return t === "fail" && cleared(room) ? "ok" : t;
    }

    // ---------- 목록 ----------
    function stopWait() { clearTimeout(timer); timer = 0; if (waiter) { waiter.abort(); waiter = null; } }
    function crumbs() {
      return `<nav class="er-crumbs" aria-label="위치"><a href="/arcade">아케이드</a><span aria-hidden="true">›</span><a href="/together">함께하기</a>${ch ? `<span aria-hidden="true">›</span><b>${ch.no}화</b>` : ""}</nav>`;
    }
    // 화 머리 — 그림 · 「N화 · 시각 · 곳」 · 제목 · 한 줄 줄거리 · 규칙 · 특징
    function heroHtml(d) {
      const facts = `<div class="er-hero__facts">${game.hero.facts.map((f) => `<span>${esc(f)}</span>`).join("")}</div>`;
      if (!ch) {
        return `<div class="er-hero ${game.heroClass || ""}"><h1>${esc(d.room.title)}</h1><p>${esc(d.room.intro)}</p>${facts}</div>`;
      }
      return `<div class="er-hero er-hero--story ${game.heroClass || ""}">
          <div class="er-hero__art" aria-hidden="true">${S.scene(game.room)}</div>
          <div class="er-hero__in">
            <div class="er-hero__ep"><span>${esc(S.series.title)}</span><b>${ch.no}화</b><i>${esc(ch.time)} · ${esc(ch.place)}</i></div>
            <h1>${esc(d.room.title)}</h1>
            <p class="er-hero__log">${esc(ch.logline)}</p>
            <p class="er-hero__rule">${esc(d.room.intro)}</p>
            ${facts}
          </div>
        </div>`;
    }
    // 내 기록 — /api/play/coop/series 의 이 화 한 줄 (못 받으면 칸을 그리지 않는다)
    function myStatsHtml(s) {
      if (!s) return "";
      let best = "–";
      if (s.best != null) { try { best = game.rankText({ score: s.best, sec: s.best }); } catch (_) { best = ch ? ch.best(s.best) : String(s.best); } }
      const cell = (label, value, on) => `<div class="er-my__cell ${on ? "is-on" : ""}"><b>${esc(value)}</b><small>${esc(label)}</small></div>`;
      return `<div class="er-my" aria-label="내 기록">
          ${cell("해 본 판", `${nf(s.played)}판`, s.played)}
          ${cell("성공", `${nf(s.cleared)}번`, s.cleared)}
          ${cell(ch ? ch.bestLabel : "최고 기록", best, s.best != null)}
          ${cell("함께한 동료", `${nf(s.partners)}명`, s.partners)}
        </div>`;
    }
    // 이번 화 이야기 — 앞 화 끝 장면 · 나오는 사람 · 이야기 미리 보기 · 앞뒤 화
    function storyHtml() {
      if (!ch) return "";
      const prevCh = S.prev(game.room), nextCh = S.next(game.room);
      const all = [...ch.prologue, ...ch.epilogue.great, ...ch.epilogue.ok, ...ch.epilogue.fail];
      const cast = S.series.npcs.filter((n) => all.some((l) => l.npc === n.name));
      const link = (c, dir) => (c
        ? `<a class="er-chap is-${dir}" href="/games/${c.page}">${dir === "prev" ? `<span aria-hidden="true">‹</span>` : ""}<span><small>${c.no}화 · ${esc(c.time)}</small><b>${esc(c.title)}</b></span>${dir === "next" ? `<span aria-hidden="true">›</span>` : ""}</a>`
        : `<a class="er-chap is-${dir} is-all" href="/together"><span><small>${dir === "prev" ? "시리즈 처음" : "하루 끝"}</small><b>전체 ${S.order.length}화 보기</b></span></a>`);
      return `<div class="er-story">
          <div class="er-story__lead">
            <small>${prevCh ? `${prevCh.no}화 끝에서` : `${esc(S.series.title)} · ${esc(S.series.tagline)}`}</small>
            <p>${esc(prevCh ? prevCh.next : S.series.logline)}</p>
          </div>
          ${cast.length ? `<div class="er-cast">${cast.map((n) => `<div class="er-cast__p">${S.npcFace(n.name)}<span><b>${esc(n.name)}</b><small>${esc(n.role)}</small></span></div>`).join("")}</div>` : ""}
          <details class="er-peek"><summary>${HKUI.icon("book-open", 16, "currentColor")} 이야기 미리 보기</summary>
            ${S.cutscene(game.room, "prologue", { static: true, id: "lobby", a: myName || "나", b: "○○", me: "a" })}</details>
          <div class="er-chaps">${link(prevCh, "prev")}${link(nextCh, "next")}</div>
        </div>`;
    }
    async function showLobby() {
      stopWait(); room = null; lastShown = "";
      root.innerHTML = `<div class="er er-lobby" style="${chVars}"><div style="text-align:center;padding:40px"><span class="hk-spin"></span></div></div>`;
      let d, ser = null;
      try {
        [d, open, ser] = await Promise.all([
          HKApi.coopOverview(game.room),
          HKApi.playStatus().catch(() => open),
          ch && HKApi.coopSeries ? HKApi.coopSeries().catch(() => null) : null,
        ]);
      } catch (e) { root.innerHTML = `<div class="er er-lobby"><div class="gk__empty">${esc(e.message || "불러오지 못했어요")}</div></div>`; return; }
      if (/^#r\d+$/.test(location.hash)) return; // 그사이 방으로 들어갔으면 목록을 그리지 않는다
      const mine = Array.isArray(ser) ? ser.find((x) => x.key === game.room) : null;
      const row = (r, tag, cls, btns = "") => `<${btns ? "div" : "a"} class="gk__row" ${btns ? "" : `href="#r${r.id}"`}>${ava(r.partner)}<span class="gk__who"><b>${esc(r.partner.name)}</b><small>${esc(r.partner.department || "")}</small></span>${tag ? `<span class="gk__tag ${cls || ""}">${tag}</span>` : ""}${btns}</${btns ? "div" : "a"}>`;
      const incoming = d.incoming.map((r) => row(r, "", "", `<span class="gk__btns">
          <button type="button" class="hk-btn hk-btn--primary" data-accept="${r.id}" ${open.open ? "" : "disabled"}>수락</button>
          <button type="button" class="hk-btn hk-btn--secondary" data-leave="${r.id}">거절</button></span>`)).join("");
      const sent = d.sent.map((r) => row(r, "", "", `<span class="gk__btns"><small style="color:var(--text-muted);font-size:12.5px">${due(r.deadlineAt)}</small><button type="button" class="hk-btn hk-btn--secondary" data-leave="${r.id}">취소</button></span>`)).join("");
      const active = d.active.map((r) => row(r, `${r.partnerHere ? `<span class="er-dot is-on"></span>` : ""}${r.status === "PLAYING" ? "진행 중" : "준비 중"}`, "is-live")).join("");
      const recent = d.recent.map((r) => { const [t, c] = game.recentText(r); return row(r, t, c); }).join("");
      const rk = d.ranking;
      const rank = rk.top.map((x) => `<div class="gk__row ${x.mine ? "gk__me" : ""}"><span class="gk__rank">${x.rank}</span>${mini(x.team[0])}${mini(x.team[1])}<span class="gk__tag">${game.rankText(x)}</span></div>`).join("");
      const sec = (t, body, cls = "") => (body ? `<div class="gk__sec ${cls}"><h2>${t}</h2>${body}</div>` : "");
      root.innerHTML = `<div class="er er-lobby ${ch ? "has-story" : ""}" style="${chVars}">
          ${crumbs()}
          ${heroHtml(d)}
          ${closedNote(open)}
          ${myStatsHtml(mine)}
          ${sec("받은 초대", incoming, "is-hot")}
          ${sec("같이 할 방", active, "is-hot")}
          ${sec("보낸 초대", sent)}
          <div class="gk__sec er-invite"><h2>동료 초대하기</h2>
            <input class="gk__search" id="er-q" type="search" placeholder="이름이나 부서로 찾기" autocomplete="off" ${open.open ? "" : "disabled"}>
            <div id="er-people"></div>
            <div class="gk__due">${esc(game.hero.note)}</div>
          </div>
          ${storyHtml()}
          ${sec("지난 기록", recent)}
          <div class="gk__sec"><h2>${esc(game.rankTitle || "순위")}</h2>${rank || `<div class="gk__empty">아직 기록이 없어요. 첫 기록을 남겨 보세요!</div>`}
            <div class="gk__due">${esc(game.rankNote || "")}</div></div>
        </div>`;
      HKUI.refreshIcons(root);
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
    function soundBtn() {
      if (!window.HKSound) return "";
      const off = HKSound.isMuted();
      return `<button type="button" class="er-sound ${off ? "is-off" : ""}" data-sound aria-pressed="${off ? "false" : "true"}" aria-label="${off ? "소리 켜기" : "소리 끄기"}" title="${off ? "소리 켜기" : "소리 끄기"}">${HKUI.icon(off ? "volume-x" : "volume-2", 18, "currentColor")}</button>`;
    }
    function topHtml() {
      const left = remain();
      const timerBox = room.status === "PLAYING" && left != null
        ? `<div class="er-timer ${left < 30 || (room.limitSec > 600 && left < 180) ? "is-low" : ""}" id="er-timer"><span class="er-timer__t">${mmss(left)}</span><small>${esc(game.timerNote ? game.timerNote(ctx) : "남은 시간")}</small></div>` : "";
      const live = ["READY", "PLAYING"].includes(room.status);
      const callBtn = live && !room.partnerHere ? `<button type="button" class="er-btn-call" data-call>Teams로 부르기</button>` : "";
      return `<div class="er-top">
          <div class="er-top__head">${ch ? `<div class="er-top__ep">${esc(S.series.title)} · ${ch.no}화 · ${esc(ch.time)}</div>` : ""}<div class="er-top__title">${esc(room.title)}</div><div class="er-top__side">${room.sideName ? `나는 <b>${esc(room.sideName)}</b>` : "초대"}</div></div>
          ${timerBox}
          ${game.topExtra ? game.topExtra(ctx) : ""}
          <div class="er-top__mate">${ava(room.partner)}<span><b>${esc(room.partner.name)}</b><br><small><span class="er-dot ${room.partnerHere ? "is-on" : ""}"></span>${live ? (room.partnerHere ? "들어와 있어요" : "아직 안 들어왔어요") : esc(room.partnerSideName || "")}</small></span>${callBtn}</div>
          ${soundBtn()}
        </div>`;
    }
    function chatHtml() {
      const items = [
        ...room.log.map((l) => ({ t: l.t, html: `<div class="er-msg is-log">${esc(l.text)}</div>` })),
        ...room.chat.map((c) => ({ t: c.t, html: `<div class="er-msg ${c.me ? "is-me" : ""}"><small>${esc(c.name)}</small>${esc(c.text)}</div>` })),
      ].sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
      const can = ["READY", "PLAYING", "CLEAR", "FAILED"].includes(room.status);
      return `<div class="er-card er-talk"><h2>${HKUI.icon("messages-square", 16, "currentColor")} 대화</h2>
          <div class="er-chat" id="er-chat">${items.map((x) => x.html).join("") || `<div class="er-msg is-log">하고 싶은 말을 여기에 적어 알려 주세요</div>`}</div>
          ${can ? `<form class="er-say" id="er-say"><input id="er-say-in" maxlength="120" placeholder="상대에게 보낼 말" autocomplete="off" value="${esc(draft.chat)}"><button class="hk-btn hk-btn--primary" type="submit">보내기</button></form>
          <div class="er-quick">${game.quick.map((q) => `<button type="button" data-quick="${esc(q)}">${esc(q)}</button>`).join("")}</div>` : ""}
        </div>`;
    }
    // 화 머리 작은 판 — 초대 확인 화면에서 무엇을 하는지 보여 준다
    function miniHtml() {
      if (!ch) return "";
      return `<div class="er-mini"><div class="er-mini__art" aria-hidden="true">${S.scene(game.room)}</div>
          <div class="er-mini__txt"><small>${esc(S.series.title)} · ${ch.no}화 · ${esc(ch.time)} · ${esc(ch.place)}</small><b>${esc(ch.title)}</b><p>${esc(ch.logline)}</p></div></div>`;
    }
    function sideBox(p, name, side, ready, here, mine) {
      const state = ready ? "준비 완료" : mine || here ? "준비 전" : "아직 안 들어왔어요";
      return `<div class="er-side ${ready ? "is-ready" : ""} ${mine ? "is-me" : ""}">
          <span class="er-side__ava">${ava(p)}${ready ? `<i aria-hidden="true">✓</i>` : ""}</span>
          <small>${esc(name)}</small><b>${esc(side || "")}</b><span>${state}</span></div>`;
    }
    // 대기실 — 나 & 상대 · 준비 버튼을 먼저(상대가 준비했는지 바로 보이게), 시작 이야기는 그 아래.
    // 이야기는 화면에 보일 때만 저절로 넘어간다(HKCoopStory 컷신)
    function readyHtml() {
      const mine = room.ready.me, mate = room.ready.partner;
      const pro = ch ? S.cutscene(game.room, "prologue", storyCtx()) : "";
      const self = me || { name: myName, avatarUrl: null };
      return `<div class="er-card er-wait">
          <h2>출발 전 대기실</h2>
          <p>${esc(room.intro)}</p>
          <div class="er-sides">
            ${sideBox(self, "나", room.sideName, mine, true, true)}
            <span class="er-sides__and" aria-hidden="true">&amp;</span>
            ${sideBox(room.partner, room.partner.name, room.partnerSideName, mate, room.partnerHere, false)}
          </div>
          ${game.readyNote ? `<div class="er-role">${game.readyNote(ctx)}</div>` : ""}
          ${game.readyExtra ? `<div class="er-extra">${game.readyExtra(ctx) || ""}</div>` : ""}
          <button type="button" class="hk-btn hk-btn--primary er-readybtn ${mine ? "is-on" : ""}" data-ready="${mine ? 0 : 1}" ${open.open || mine ? "" : "disabled"}>${mine ? "준비 취소" : "준비"}</button>
          <p class="er-wait__note">${mine && !mate ? `${esc(room.partner.name)}님이 준비를 누르면 바로 시작해요.` : `둘 다 준비를 누르면 ${Math.round(room.limitSec / 60)}분 타이머가 바로 시작돼요.`}</p>
          <div class="er-actions"><button type="button" class="er-linkbtn is-muted" data-leave="${room.id}">방 나가기</button></div>
        </div>${pro}`;
    }
    function pendingHtml() {
      return `<div class="er-card er-wait er-pending">${miniHtml()}<h2>${room.incoming ? `${esc(room.partner.name)}님의 초대` : "수락을 기다리고 있어요"}</h2>
          <p>${esc(room.intro)}</p>
          <div class="er-actions">${room.incoming
            ? `<button type="button" class="hk-btn hk-btn--primary" data-accept="${room.id}" ${open.open ? "" : "disabled"}>수락</button><button type="button" class="hk-btn hk-btn--secondary" data-leave="${room.id}">거절</button>`
            : `<button type="button" class="hk-btn hk-btn--secondary" data-leave="${room.id}">초대 취소</button>`}</div>
          <p class="er-wait__note">${due(room.deadlineAt)}</p></div>`;
    }
    function statsHtml() {
      let list = [];
      try { list = (game.stats && game.stats(ctx)) || []; } catch (_) { list = []; }
      if (!list.length) return "";
      return `<div class="er-stats">${list.map((s) => `<div class="er-stat"><b>${esc(typeof s.value === "number" ? nf(s.value) : String(s.value ?? ""))}</b><small>${esc(s.label || "")}</small></div>`).join("")}</div>`;
    }
    // 끝 화면 아래 — 끝 이야기(컷신) · 다음 화 예고 · 다시 하기 · 다음 화
    function storyEndHtml(card, again) {
      const keepAgain = /data-invite=/.test(card) ? "" : again;
      if (!ch) return keepAgain ? `<div class="er-actions">${keepAgain}<a class="hk-btn hk-btn--secondary" href="#" style="text-decoration:none">목록</a></div>` : "";
      const nextCh = S.next(game.room);
      const go = nextCh
        ? `<a class="er-go" href="/games/${nextCh.page}">다음 화 「${esc(nextCh.title)}」 <span aria-hidden="true">›</span></a>`
        : `<a class="er-go" href="/together">함께하기 보러 가기 <span aria-hidden="true">›</span></a>`;
      return `${S.cutscene(game.room, tier(), storyCtx())}
        <div class="er-next">
          <div class="er-next__txt"><small>${nextCh ? `다음 화 · ${nextCh.no}화 ${esc(nextCh.time)}` : `${esc(S.series.title)} · 오늘 하루 끝`}</small><p>${esc(ch.next)}</p></div>
          <div class="er-actions">${keepAgain}${go}</div>
        </div>`;
    }
    function closedHtml() {
      const why = { TIMEOUT: "시간이 다 됐어요.", GIVEUP: "포기한 방이에요.", LEFT: "나간 방이에요." }[room.end] || "끝난 방이에요.";
      const ended = room.status === "FAILED" || room.status === "CLEAR";
      const again = ended
        ? `<button type="button" class="hk-btn hk-btn--primary" data-invite="${room.partner.id}" ${open.open ? "" : "disabled"}>${esc(room.partner.name)}님과 다시 하기</button>` : "";
      let card;
      if (room.status === "CLEAR" && game.end) card = game.end(ctx, again);
      else if (room.status === "FAILED" && game.failEnd) card = game.failEnd(ctx, again);
      else if (ended) card = `<div class="er-end is-fail"><h2>${room.status === "FAILED" ? esc(game.failTitle || "실패") : "끝"}</h2><p>${why}</p></div>`;
      else {
        return `<div class="er-end is-fail"><h2>${room.status === "EXPIRED" ? "만료된 초대" : "닫힌 방"}</h2><p>${why}</p>
            <div class="er-actions"><a class="hk-btn hk-btn--secondary" href="#" style="text-decoration:none">목록</a></div></div>`;
      }
      return card + statsHtml() + storyEndHtml(card, again);
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
      const chatOk = !(room.status === "PLAYING" && game.chatWhilePlaying === false); // 낱말 게임은 진행 중 대화창을 닫는다
      const side = sideOk ? `${room.status !== "READY" && game.side ? game.side(ctx) : ""}${chatOk ? chatHtml() : ""}` : "";
      const shown = `${room.id}:${room.status}`;
      const enter = shown !== lastShown; // 상태가 바뀔 때만 살짝 나타난다(실시간으로 다시 그릴 때는 그대로)
      lastShown = shown;
      root.innerHTML = `<div class="er ${game.wide ? "er-wide" : ""} ${ch ? "has-story" : ""}" style="${chVars}">
          <a class="gk__back" href="#">‹ ${esc(game.listName || "목록")}</a>
          ${closedNote(open)}
          ${topHtml()}
          <div class="er-grid" style="${side ? "" : "grid-template-columns:minmax(0,1fr)"}"><div class="er-main ${enter ? "er-enter" : ""}">${main}</div>${side ? `<div class="er-aside">${side}</div>` : ""}</div>
          ${room.status === "PLAYING" ? `<div class="er-actions"><button type="button" class="er-linkbtn is-muted" data-giveup>포기하기</button></div>` : ""}
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
    // 끝나면 끝 카드(제목 · 결과)가 보이게 한 번 굴린다 — 휴대폰은 맨 아래 「포기하기」를 눌렀거나 판 아래쪽을 보던 채라
    // 끝 카드가 화면 위로 잘려 있다. 카드 위가 화면 위쪽(붙어 있는 사이트 머리 아래 ~60px)보다 위거나 화면 아래로 벗어났을 때만.
    // 게임 페이지가 스스로 굴리는 건 시작할 때 · 진행 중(PLAYING)뿐이라 겹치지 않는다. 대화를 쓰던 중이면 그대로 둔다
    function showEnd() {
      const id = room && room.id;
      requestAnimationFrame(() => {
        if (!room || room.id !== id || !["CLEAR", "FAILED"].includes(room.status)) return;
        const a = document.activeElement;
        if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
        const card = root.querySelector(".er-main .er-end") || root.querySelector(".er-main");
        if (!card) return;
        const hdr = document.querySelector(".hk-site-header");
        const head = hdr && /sticky|fixed/.test(getComputedStyle(hdr).position) ? hdr.getBoundingClientRect().height : 0;
        let y = 0; // 문서 안 위치 — 나타나는 움직임(.er-enter 의 translateY)에 흔들리지 않게 offsetTop 으로 잰다
        for (let el = card; el; el = el.offsetParent) y += el.offsetTop;
        const at = y - window.scrollY; // 지금 화면 안 위치
        if (at >= Math.max(60, head + 8) && at <= window.innerHeight - 80) return;
        const top = Math.max(0, Math.round(y - head - 12));
        if (Math.abs(window.scrollY - top) > 20) window.scrollTo({ top, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      });
    }
    // 상대가 한 일(새 진행 기록)은 알림으로 — 내가 한 일과 처음 들어올 때는 조용히.
    // 한꺼번에 여러 줄이 오면 마지막 한 줄만(같은 자리에 겹쳐 읽히지 않게). 막 시작할 때(→ PLAYING)는 알리지 않는다 —
    // 시작 소리(go)와 바뀐 화면이 알려 주고, 「시작! …」 알림은 무대(제시어 쪽지 · 사진 위 · 옆 칸)를 가린다
    function setRoom(next) {
      const prev = room;
      room = next;
      if (prev && prev.id === next.id) {
        const starting = prev.status !== "PLAYING" && next.status === "PLAYING";
        let told = 0;
        if (prev.log && next.log && !starting) {
          const lastT = prev.log.length ? prev.log[prev.log.length - 1].t : "";
          const fresh = next.log.filter((l) => l.t > lastT && !l.text.startsWith(`${myName}님`));
          const l = fresh[fresh.length - 1];
          told = fresh.length;
          if (l) HKUI.toast(l.text, /틀렸|실패|포기|나갔/.test(l.text) ? "error" : "success");
        }
        const ended = ["CLEAR", "FAILED"].includes(next.status);
        if (prev.status === "PLAYING" && ended) {
          if (game.changed) game.changed(prev, next, ctx); // 끝 이야기 갈래가 새 방 정보를 보도록 먼저 알린다
          sfx(tier() === "fail" ? "lose" : "win");
          paint();
          showEnd();
          schedule();
          return;
        }
        if (starting) sfx("go");
        else if (!prev.partnerHere && next.partnerHere && ["READY", "PLAYING"].includes(next.status)) sfx("pop");
        else if (told) sfx("tap");
      }
      if (game.changed) game.changed(prev, next, ctx);
      // 진행 중 잦은 소식(그림 조각 등) — 게임이 바뀐 칸만 고쳤으면 통째로 다시 그리지 않는다. 상대가 나가고 들어오면 위 막대가 바뀌므로 다시 그린다
      if (game.patch && prev && prev.id === next.id && prev.status === "PLAYING" && next.status === "PLAYING" && prev.partnerHere === next.partnerHere) {
        let done = false;
        try { done = game.patch(prev, next, ctx) === true; } catch (_) { done = false; }
        if (done) {
          let wd = 0;
          try { wd = typeof game.waitDelay === "function" ? game.waitDelay(ctx) : game.waitDelay; } catch (_) { wd = 0; }
          schedule(Number(wd) || 0);
          return;
        }
      }
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
    // 초대 · 수락 · 나가기는 한 번에 하나만 — 빠르게 두 번 눌러도 한 번만 보낸다
    async function once(fn) {
      if (clicking) return;
      clicking = true;
      try { await fn(); } finally { clicking = false; }
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
        me = profile || null;
        myName = (profile && profile.name) || "";
        if (window.HKSound && HKSound.onChange) {
          HKSound.onChange(() => {
            document.querySelectorAll("[data-sound]").forEach((b) => { b.outerHTML = soundBtn(); });
            HKUI.refreshIcons(root);
          });
        }
        root.addEventListener("click", async (e) => {
          const t = e.target.closest("button, a");
          if (!t) return;
          const d = t.dataset;
          if (t.getAttribute("href") === "#") { e.preventDefault(); location.hash = ""; return; }
          if ("sound" in d) { if (window.HKSound) { HKSound.toggle(); if (!HKSound.isMuted()) HKSound.play("select"); } return; }
          if (d.invite) {
            return once(async () => {
              try { const r = await HKApi.coopInvite(Number(d.invite), game.room); HKUI.toast("초대를 보냈어요. 수락하면 Teams로 알려 드려요"); location.hash = `r${r.id}`; } catch (err) { fail(err); }
            });
          }
          if (d.accept) {
            return once(async () => {
              try { const r = await HKApi.coopAccept(Number(d.accept)); location.hash = `r${r.id}`; if (room && room.id === r.id) setRoom(r); } catch (err) { fail(err); }
            });
          }
          if (d.leave) {
            const pending = !room || room.status === "PENDING";
            if (!pending && !(await HKUI.confirmDialog("방을 나갈까요?", "나가면 이 방은 닫혀요. 상대에게도 Teams로 알려요.", { confirmLabel: "나가기", confirmVariant: "danger" }))) return;
            return once(async () => {
              try { await HKApi.coopLeave(Number(d.leave)); if (room) await refresh(); else showLobby(); } catch (err) { fail(err); }
            });
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
        // PC 마우스 — 누르고 떼는 사이에 실시간 소식(상대가 한 일)으로 방 화면이 통째로 다시 그려지면(paint) 눌렀던 버튼이 없어져
        // 브라우저가 click 을 보내지 않는다(분식집은 1초에 두 번쯤 다시 그려져 네댓 번에 한 번꼴로 눌림이 사라졌다).
        // 뗀 자리(누른 데서 8px 안)에 같은 버튼(data-* 가 같은 것)이 다시 그려져 있으면 그 버튼을 대신 눌러 준다.
        // 터치는 브라우저가 뗀 자리의 버튼에 click 을 보내 주므로 손대지 않는다.
        // 페이지가 따로 같은 보완을 해도 두 번 누르지 않는다 — 어느 쪽이 대신 누른 것이든 버튼에 간 click 이면 「눌렸음」으로 본다
        let press = null;
        const btnSig = (b) => JSON.stringify({ ...b.dataset });
        const btnAt = (el) => { const b = el && el.closest ? el.closest("button") : null; return b && root.contains(b) ? b : null; };
        document.addEventListener("pointerdown", (e) => {
          const b = e.pointerType === "mouse" && e.button === 0 ? btnAt(e.target) : null;
          press = b ? { b, sig: btnSig(b), x: e.clientX, y: e.clientY, clicked: false } : null;
        }, true);
        document.addEventListener("click", (e) => { if (press && e.target && e.target.closest && e.target.closest("button, a")) press.clicked = true; }, true);
        document.addEventListener("pointerup", (e) => {
          const p = press;
          if (!p || e.pointerType !== "mouse") return;
          setTimeout(() => { // 브라우저가 보낸 click 이 있으면 그걸로 끝
            if (press === p) press = null;
            if (p.clicked || p.b.isConnected || Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8) return;
            const b = btnAt(document.elementFromPoint(e.clientX, e.clientY));
            if (b && !b.disabled && btnSig(b) === p.sig) b.click();
          }, 0);
        }, true);
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
