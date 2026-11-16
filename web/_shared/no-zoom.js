/*
 * 게임 화면 — 휴대폰 사파리(아이폰)에서 확대 · 돋보기가 켜지지 않게 (모든 게임 페이지와 게임 본체가 불러 쓴다)
 *   · 두 번 빠르게 누르기 → 확대(더블탭 줌) 막기
 *   · 길게 누르기 → 돋보기 · 글자 고르기 · 꾹 누르기 메뉴 막기
 *   · 두 손가락 벌리기(핀치) 확대 막기
 * 단추 · 링크 · 입력칸 · 고를 수 있는 글(contenteditable)은 그대로 둔다(눌리고, 입력칸은 글자 고르기 · 붙여 넣기가 된다).
 * + 스페이스 = 다음 단계: 화면에 「다음 단계 · 다음 작전 · 다음 판 · 다음 숲 · 계속하기 …」 단추가 보이면 스페이스로 누른다(모든 게임 공통).
 */
(function () {
  if (window.__hkNoZoom) return;
  window.__hkNoZoom = true;
  const FREE = "input, textarea, select, [contenteditable], [contenteditable] *";
  const TAP = "button, a, input, textarea, select, label, summary, [role=button]";
  const isFree = (t) => !!(t && t.closest && t.closest(FREE));
  const isTap = (t) => !!(t && t.closest && t.closest(TAP));

  // 두 번 누르기 확대 — 두 번째 손가락 뗌을 막는다(단추는 그대로 두어 빠르게 여러 번 눌러도 다 눌린다)
  let last = 0;
  document.addEventListener("touchend", (e) => {
    if (isTap(e.target)) { last = 0; return; }
    const now = Date.now();
    if (now - last < 350 && e.cancelable) e.preventDefault();
    last = now;
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
  // 게임이 스페이스를 먼저 써 버렸으면(preventDefault · 단추가 사라짐) 하지 않는다 — 두 번 넘어가지 않게 한 박자 늦게 다시 본다.
  // 입력칸 · 단추에 초점이 있을 때(단추는 브라우저가 스페이스로 누른다) · 키를 누르고 있을 때(반복)는 건드리지 않는다.
  const NEXT = /^(?:[▶▷→»›]\s*)?(?:다음(?:\s*(?:단계|스테이지|작전|판|트랙|숲|정원|장|구역|라운드|레벨|문제|이야기|날|코스|맵|게임))?(?:로|으로)?(?:\s*(?:준비|가기|진행|시작|하기))?|계속하기|이어서\s*하기)\s*[▶▷→»›]?$/;
  const label = (el) => (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
  const shown = (el) => {
    if (!el.isConnected || el.disabled || el.getAttribute("aria-disabled") === "true" || el.closest("[hidden],[inert]")) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return false;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) < 0.05 || cs.pointerEvents === "none") return false;
    }
    const top = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2)));
    return !top || el === top || el.contains(top) || top.contains(el);
  };
  const findNext = () => {
    for (const el of document.querySelectorAll('button, [role="button"], a.btn, a[class*="btn"], [data-act]')) {
      const t = label(el);
      if (t && t.length <= 16 && NEXT.test(t) && shown(el)) return el;
    }
    return null;
  };
  document.addEventListener("keydown", (e) => {
    if (e.code !== "Space" && e.key !== " ") return;
    if (e.repeat || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.isComposing) return;
    const a = document.activeElement;
    if (a && a !== document.body && a.closest && a.closest('input, textarea, select, button, a, [contenteditable], [role="button"]')) return;
    const btn = findNext();
    if (!btn) return;
    e.preventDefault(); // 화면이 스크롤되지 않게
    setTimeout(() => { if (shown(btn) && NEXT.test(label(btn))) btn.click(); }, 40);
  }, true);
})();
