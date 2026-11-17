/*
 * 게임 화면 — 휴대폰 사파리(아이폰)에서 확대 · 돋보기가 켜지지 않게 (모든 게임 페이지와 게임 본체가 불러 쓴다)
 *   · 두 번 빠르게 누르기 → 확대(더블탭 줌) 막기
 *   · 길게 누르기 → 돋보기 · 글자 고르기 · 꾹 누르기 메뉴 막기
 *   · 두 손가락 벌리기(핀치) 확대 막기
 * 단추 · 링크 · 입력칸 · 고를 수 있는 글(contenteditable)은 그대로 둔다(눌리고, 입력칸은 글자 고르기 · 붙여 넣기가 된다).
 * + 스페이스 = 다음 단계: 화면에 「다음 단계 · 다음 작전 · 다음 판 · 다음 숲 · 계속하기 …」 단추가 보이면 스페이스로 누른다(모든 게임 공통).
 *   화면 아래로 벗어나 있어도 페이지 안에서 보이는 단추면 스크롤해 보여 주고 누른다. 확인 창이 떠 있으면 그 안의 단추만 본다.
 */
(function () {
  if (window.__hkNoZoom) return;
  window.__hkNoZoom = true;
  const FREE = "input, textarea, select, [contenteditable], [contenteditable] *";
  const TAP = "button, a, input, textarea, select, label, summary, [role=button]";
  const isFree = (t) => !!(t && t.closest && t.closest(FREE));
  const isTap = (t) => !!(t && t.closest && t.closest(TAP));

  // 두 번 누르기 확대 — 짧은 간격(350ms)의 두 번째 손가락 뗌을 막는다(모든 요소에 거는 touch-action:manipulation 과 겹쳐 막기).
  // 막으면 브라우저가 click 을 만들지 않아, 단추가 아닌 칸(지뢰찾기 칸 · 칸 따먹기 선 · 오목 판처럼 click 으로 받는 div · SVG · canvas)의
  // 빠른 두 번째 누르기가 사라졌다 → 막은 경우 같은 자리에 click 을 직접 만들어 보낸다(확대는 막고 누르기는 살린다).
  // 단 브라우저도 click 을 안 만들었을 경우는 보내지 않는다: 손가락이 움직였을 때(끌기 · 쓸기), 게임이 터치 시작을 막았을 때
  // (play.js 가 touch-action:none 판에서 막는다), 게임이 손가락 뗌을 이미 막았을 때, 두 손가락일 때.
  // 게임 처리가 다 끝난 뒤 보도록 window 의 거품 단계에서 듣는다.
  let last = 0, sx = 0, sy = 0, moved = false, startPrevented = false;
  window.addEventListener("touchstart", (e) => {
    const p = e.touches[0];
    moved = e.touches.length > 1;
    startPrevented = e.defaultPrevented;
    if (p) { sx = p.clientX; sy = p.clientY; }
  }, { passive: true });
  window.addEventListener("touchmove", (e) => {
    const p = e.touches[0];
    if (p && Math.abs(p.clientX - sx) + Math.abs(p.clientY - sy) > 12) moved = true;
  }, { passive: true });
  window.addEventListener("touchend", (e) => {
    if (isTap(e.target)) { last = 0; return; }
    const now = Date.now();
    const quick = now - last < 350;
    last = now;
    if (!quick || !e.cancelable || e.defaultPrevented) return;
    e.preventDefault();
    const p = e.changedTouches && e.changedTouches[0];
    const t = e.target;
    if (moved || startPrevented || e.touches.length || !p || !t || !t.isConnected || !t.dispatchEvent) return;
    t.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, composed: true, view: window, detail: 1, clientX: p.clientX, clientY: p.clientY, screenX: p.screenX, screenY: p.screenY }));
  }, { passive: false });
  document.addEventListener("dblclick", (e) => { if (!isFree(e.target) && e.cancelable) e.preventDefault(); }, { passive: false });
  // 핀치 확대(사파리 전용 gesture 이벤트)
  for (const t of ["gesturestart", "gesturechange", "gestureend"]) document.addEventListener(t, (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
  // 길게 누르기 — 돋보기 · 글자 고르기 · 메뉴
  document.addEventListener("selectstart", (e) => { if (!isFree(e.target)) e.preventDefault(); });
  document.addEventListener("contextmenu", (e) => { if (!isFree(e.target)) e.preventDefault(); });

  const css = document.createElement("style");
  // touch-action 은 물려받지 않아 모든 요소에(단추 · 칸을 두 번 눌러도 확대 안 됨). 게임이 따로 정한 값(none 등)은 그대로 이긴다(* 는 가장 약한 규칙)
  // 글자 고르기 끄기는 !important — 게임 CSS 가 뒤에서 켜도 돋보기가 안 나오게(입력칸만 예외)
  css.textContent =
    "html{-webkit-text-size-adjust:100%}" +
    "*,*::before,*::after{touch-action:manipulation}" +
    "html,body,body *{-webkit-touch-callout:none!important;-webkit-user-select:none!important;user-select:none!important}" +
    "input,textarea,select,[contenteditable],[contenteditable] *{-webkit-touch-callout:default!important;-webkit-user-select:text!important;user-select:text!important}";
  (document.head || document.documentElement).appendChild(css);

  // ── 스페이스 = 다음 단계 ─────────────────────────────────────
  // 판 사이에 뜨는 「다음 …」 · 「계속하기」 단추가 화면에 보이면 스페이스로 누른다.
  // 게임이 스페이스를 먼저 써 버렸으면(단추가 사라짐) 누르지 않는다 — 두 번 넘어가지 않게 한 박자 늦게 다시 본다.
  // preventDefault 는 단추를 찾았을 때만 한다(화면이 스크롤되지 않게). 게임 중 스페이스는 단추가 없으니 그대로 게임에 간다.
  // 입력칸 · 단추에 초점이 있을 때(단추는 브라우저가 스페이스로 누른다) · 키를 누르고 있을 때(반복)는 건드리지 않는다.
  // 「시작하기 · 좋아요」 같은 안내 창 닫기 · 확인 · 삭제 단추는 이름이 달라 누르지 않는다(이름이 「다음 …」인 단추만).
  // play.js(게임 화면 공용)는 「다시 하기」 · 「시작」 을 스페이스로 누르는데, 「다음 …」 단추가 보이면 그쪽을 먼저 누르도록 window.HKNextKey 로 묻는다.
  const NEXT = /^(?:[▶▷→»›]\s*)?(?:다음(?:\s*(?:단계|스테이지|작전|판|트랙|숲|정원|장|구역|라운드|레벨|문제|이야기|날|코스|맵|게임))?(?:로|으로)?(?:\s*(?:준비|가기|진행|시작|하기))?|계속하기|이어서\s*하기)\s*[▶▷→»›]?$/;
  const label = (el) => (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
  // 떠 있는 확인 창(그만할까요? 등) — 있으면 그 안의 단추만 본다(뒤 판의 「계속하기」를 누르지 않게)
  const openDialog = () => {
    const all = document.querySelectorAll(".hk-dialog__overlay");
    for (let i = all.length - 1; i >= 0; i--) {
      const o = all[i];
      if (o.isConnected && !o.hidden && getComputedStyle(o).display !== "none") return o;
    }
    return null;
  };
  // 보이는 단추인지 — off: 화면(세로) 밖이거나 스크롤 상자 안에서 아래로 밀려나 있어도, 페이지 안에서 보이는 상태면 된다(스크롤해 보여 준 뒤 누른다)
  const shown = (el, off) => {
    if (!el.isConnected || el.disabled || el.getAttribute("aria-disabled") === "true" || el.closest("[hidden],[inert]")) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    let outV = r.bottom < 0 || r.top > innerHeight;
    if (r.right < 0 || r.left > innerWidth || (outV && !off)) return false;
    for (let n = el.parentElement; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (!/visible/.test(cs.overflowY)) {
        const b = n.getBoundingClientRect();
        if (r.bottom <= b.top + 2 || r.top >= b.bottom - 2) {
          // 넘친 부분을 잘라 숨기는 상자(스크롤 안 됨) 밖이면 안 보이는 단추, 스크롤 상자 밖이면 스크롤해서 보일 단추
          if (!off || !/auto|scroll/.test(cs.overflowY)) return false;
          outV = true;
        }
      }
    }
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) < 0.05 || cs.pointerEvents === "none") return false;
    }
    if (outV) return !!off; // 화면 밖 — 가려졌는지는 스크롤해 보여 준 뒤 다시 본다
    const top = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2)));
    return !top || el === top || el.contains(top) || top.contains(el);
  };
  // 화면 밖 단추까지 찾는 것은 게임 화면(/games/…)에서만 — 아케이드 · 함께하기처럼 긴 페이지는 스페이스가 원래대로 아래로 내려가게
  const GAME_PAGE = /^\/games\//.test(location.pathname);
  const findNext = () => {
    const root = openDialog() || document;
    let off = null;
    for (const el of root.querySelectorAll('button, [role="button"], a.btn, a[class*="btn"], [data-act]')) {
      const t = label(el);
      if (!t || t.length > 16 || !NEXT.test(t)) continue;
      if (shown(el)) return el; // 화면 안에 보이는 단추가 먼저
      if (!off && GAME_PAGE && shown(el, true)) off = el;
    }
    return off;
  };
  const press = (btn) => {
    if (!shown(btn)) {
      try { btn.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" }); } catch (_) { btn.scrollIntoView(false); }
    }
    setTimeout(() => { if (shown(btn) && NEXT.test(label(btn))) btn.click(); }, 40);
  };
  window.HKNextKey = { find: findNext, press };
  document.addEventListener("keydown", (e) => {
    if (e.code !== "Space" && e.key !== " ") return;
    if (e.repeat || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.isComposing) return;
    const a = document.activeElement;
    if (a && a !== document.body && a.closest && a.closest('input, textarea, select, button, a, [contenteditable], [role="button"]')) return;
    const btn = findNext();
    if (!btn) return;
    e.preventDefault(); // 화면이 스크롤되지 않게(누를 단추가 있을 때만)
    press(btn);
  }, true);
})();
