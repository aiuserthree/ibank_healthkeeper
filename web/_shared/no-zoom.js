/*
 * 게임 화면 — 휴대폰 사파리(아이폰)에서 확대 · 돋보기가 켜지지 않게 (모든 게임 페이지와 게임 본체가 불러 쓴다)
 *   · 두 번 빠르게 누르기 → 확대(더블탭 줌) 막기
 *   · 길게 누르기 → 돋보기 · 글자 고르기 · 꾹 누르기 메뉴 막기
 *   · 두 손가락 벌리기(핀치) 확대 막기
 * 단추 · 링크 · 입력칸 · 고를 수 있는 글(contenteditable)은 그대로 둔다(눌리고, 입력칸은 글자 고르기 · 붙여 넣기가 된다).
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
  css.textContent =
    "html{-webkit-text-size-adjust:100%;touch-action:manipulation}" +
    "html,body,body *{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}" +
    "input,textarea,select,[contenteditable],[contenteditable] *{-webkit-touch-callout:default;-webkit-user-select:text;user-select:text}";
  (document.head || document.documentElement).appendChild(css);
})();
