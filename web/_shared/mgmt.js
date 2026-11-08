// 매니지먼트 게임(매일 키우는 운영 게임) 공통 — 불러오기 · 자동 저장 · 서버 시계 · 다른 창 충돌 · 업무 시간
//
// const store = await HKMgmt.open("civ", { blank: () => ({ ...새 판 }), onStale, onClosed });
//   store.state        지금 상태(게임이 마음대로 고친다 — 고친 뒤 store.dirty() 를 부른다)
//   store.now()        서버 시각(ms) — 휴대폰 시계가 틀려도 서버와 같다. 진행 계산은 늘 이것으로 한다
//   store.dirty()      바뀌었다고 알린다 — 2초 뒤 한 번에 저장(그새 또 바뀌면 미룬다, 최대 10초)
//   store.saveNow()    바로 저장(중요한 행동 뒤 · 화면을 떠날 때)
//   store.reset()      처음부터 다시 — 서버 상태를 비우고 blank() 로 새 판
//   store.isNew        처음 시작한 판인지(서버에 저장된 게 없었다)
//   store.savedAt      서버에 마지막으로 저장된 시각(ms) — 처음이면 null
//   store.onSaved(fn)  저장될 때마다 fn({ at })
// 상태 안의 summary: { line: "벤처 · 직원 12명", level: 7 } 를 넣어 두면 매니지먼트 모음 화면이 보여 준다.
// 업무 시간(GAME_CLOSED)이면 open() 이 { closed: true, opensAt } 을 던진다 — 화면은 HKMgmt.closedHtml() 로 안내.
// 다른 창 · 기기에서 먼저 저장했으면(MGMT_STALE) 최신 상태로 다시 불러와 onStale(state) 를 부른다.
window.HKMgmt = (function () {
  const api = (path, opt = {}) =>
    fetch("/api/play/mgmt" + path, {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...opt,
    }).then(async (res) => {
      let body = {};
      try { body = await res.json(); } catch (_) { /* 빈 응답 */ }
      if (!res.ok) {
        const e = body.error || (body.detail && body.detail.error) || {};
        const err = new Error(e.message || "요청에 실패했어요");
        err.code = e.code; err.status = res.status;
        throw err;
      }
      return body.data;
    });
  const ms = (iso) => (iso ? new Date(iso).getTime() : null);

  async function opensAt() {
    try { const s = await HKApi.playStatus(); return s && s.opensAt; } catch (_) { return null; }
  }

  async function open(game, opts = {}) {
    let data;
    try {
      data = await api("/" + game);
    } catch (e) {
      if (e.code === "GAME_CLOSED") throw { closed: true, opensAt: await opensAt() };
      throw e;
    }
    let offset = ms(data.now) - Date.now(); // 서버 시각 - 내 시계
    const store = {
      game,
      state: data.state || opts.blank(),
      isNew: !data.state,
      version: data.version,
      savedAt: ms(data.savedAt),
      resets: data.resets || 0,
      now: () => Date.now() + offset,
      dirty, saveNow, reset,
      onSaved: (fn) => saved.push(fn),
    };
    const saved = [];
    let timer = 0, firstDirty = 0, inflight = null, pending = false, closed = false;

    function dirty() {
      if (closed) return;
      const t = Date.now();
      if (!firstDirty) firstDirty = t;
      clearTimeout(timer);
      // 2초 동안 조용하면 저장 — 계속 바뀌어도 10초에 한 번은 저장
      timer = setTimeout(saveNow, t - firstDirty > 8000 ? 0 : 2000);
    }
    async function saveNow({ keepalive = false } = {}) {
      clearTimeout(timer); firstDirty = 0;
      if (closed) return;
      if (inflight) { pending = true; return inflight; }
      const body = JSON.stringify({ state: store.state, version: store.version });
      inflight = fetch("/api/play/mgmt/" + game, {
        method: "PUT", credentials: "include", keepalive: keepalive && body.length < 60000,
        headers: { "Content-Type": "application/json" }, body,
      }).then(async (res) => {
        let b = {};
        try { b = await res.json(); } catch (_) { /* 빈 응답 */ }
        if (res.ok) {
          const d = b.data;
          store.version = d.version; store.savedAt = ms(d.savedAt);
          offset = ms(d.now) - Date.now();
          saved.forEach((fn) => { try { fn({ at: store.savedAt }); } catch (_) { /* 화면 쪽 */ } });
          return;
        }
        const code = (b.error || (b.detail && b.detail.error) || {}).code;
        if (code === "MGMT_STALE") {
          const fresh = await api("/" + game);
          store.state = fresh.state || opts.blank();
          store.version = fresh.version; store.savedAt = ms(fresh.savedAt);
          offset = ms(fresh.now) - Date.now();
          if (opts.onStale) opts.onStale(store.state);
        } else if (code === "GAME_CLOSED") {
          closed = true;
          if (opts.onClosed) opts.onClosed(await opensAt());
        }
      }).catch(() => { /* 네트워크 — 다음 변경 때 다시 */ pending = true; })
        .finally(() => {
          inflight = null;
          if (pending) { pending = false; dirty(); }
        });
      return inflight;
    }
    async function reset() {
      clearTimeout(timer);
      const d = await api("/" + game + "/reset", { method: "POST" });
      store.state = opts.blank();
      store.version = d.version; store.resets = d.resets; store.isNew = true;
      offset = ms(d.now) - Date.now();
      await saveNow();
      return store.state;
    }
    // 화면을 떠나거나 숨길 때 저장
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && (timer || firstDirty)) saveNow({ keepalive: true }); });
    addEventListener("pagehide", () => { if (timer || firstDirty) saveNow({ keepalive: true }); });
    return store;
  }

  // 업무 시간 안내 — 진행은 계속된다는 것까지
  function closedHtml(opens, title) {
    return `<div class="hk-mg-closed">
        <span class="hk-mg-closed__icon">${window.HKUI ? HKUI.icon("moon", 28, "currentColor") : ""}</span>
        <b>지금은 업무 시간이라 쉬어요</b>
        <p>${title ? `${title}은(는) ` : ""}점심시간(11:30~13:00) · 18:00 이후 · 9:00 이전 · 주말에 열려요.${opens ? `<br><b>${opens}</b>에 다시 열려요.` : ""}</p>
        <small>걸어 둔 일은 그동안에도 계속 진행돼요.</small>
        <a class="hk-btn hk-btn--secondary" href="/manage">매니지먼트 모음으로</a>
      </div>`;
  }

  // 시간 글자 — 3시간 12분 · 4분 30초
  function dur(sec) {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h) return m ? `${h}시간 ${m}분` : `${h}시간`;
    if (m) return s && m < 10 ? `${m}분 ${s}초` : `${m}분`;
    return `${s}초`;
  }
  // 큰 수 — 12,345 · 1.2만 · 3.4억
  function num(n) {
    n = Math.floor(n || 0);
    const short = (v, d) => v.toFixed(d).replace(/\.0$/, ""); // 5.0만 → 5만
    if (n >= 1e8) return `${short(n / 1e8, n >= 1e9 ? 0 : 1)}억`;
    if (n >= 1e4) return `${short(n / 1e4, n >= 1e5 ? 0 : 1)}만`;
    return n.toLocaleString("ko-KR");
  }

  return { open, closedHtml, dur, num };
})();
