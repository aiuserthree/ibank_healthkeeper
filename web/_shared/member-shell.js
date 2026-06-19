/** export/html/project member-shell 과 동일한 마크업 */
window.HKRoutes = {
  home: "/index",
  login: "/login",
  signup: "/signup",
  reserve: "/reserve",
  reapply: "/reapply",
  mypage: "/mypage",
  profile: "/profile",
};

window.HKMember = (function () {
  const R = HKRoutes;

  function renderHeader(active, profile) {
    const loggedIn = !!profile;
    const name = profile?.name || "";
    const avatarUrl = profile?.avatarUrl || "";
    const navStyle = (id) =>
      `text-decoration:none;font-size:15px;font-weight:600;padding:8px 4px;white-space:nowrap;color:${active === id ? "var(--color-signal-blue)" : "var(--color-midnight-navy)"}`;
    return `<header style="background:var(--surface-card);border-bottom:1px solid var(--border-default);position:sticky;top:0;z-index:50">
      <div class="hk-mheader" style="max-width:1200px;margin:0 auto;height:72px;padding:0 32px;display:flex;align-items:center;gap:32px">
        <a href="${R.home}" style="display:flex;align-items:center;padding:0"><img src="/assets/logo-lockup.svg" alt="헬스키퍼" height="34"></a>
        <nav class="hk-mnav" style="display:flex;gap:24px;margin-left:8px">
          <a href="${R.home}" style="${navStyle("home")}">서비스 소개</a>
          <a href="${R.reserve}" style="${navStyle("reserve")}">예약하기</a>
          ${loggedIn ? `<a href="${R.mypage}" style="${navStyle("mypage")}">마이페이지</a>` : ""}
        </nav>
        <div style="flex:1"></div>
        ${
          loggedIn
            ? `<div class="hk-mactions" style="display:flex;align-items:center;gap:14px">
                <a href="${R.mypage}" style="display:flex;align-items:center;gap:10px;text-decoration:none">
                  ${HKUI.avatar(name, "sm", avatarUrl)}<span class="hk-uname" style="font-size:14px;font-weight:600;color:var(--color-midnight-navy)">${HKUI.escapeHtml(name)}님</span>
                </a>
                <button type="button" class="hk-btn hk-btn--ghost hk-btn--sm" id="hk-logout">로그아웃</button>
              </div>`
            : `<div class="hk-mactions" style="display:flex;align-items:center;gap:8px"><a href="${R.login}"><button type="button" class="hk-btn hk-btn--primary hk-btn--sm">로그인</button></a></div>`
        }
        <button type="button" class="hk-hamburger" id="hk-menu-btn" aria-label="메뉴" style="display:none;align-items:center;justify-content:center;width:42px;height:42px;border:1px solid var(--border-default);border-radius:8px;background:var(--surface-card);cursor:pointer;padding:0">${HKUI.icon("menu", 22, "var(--color-midnight-navy)")}</button>
      </div>
    </header>
    <div class="hk-drawer-wrap" id="hk-drawer">
      <div class="hk-drawer-backdrop" id="hk-drawer-backdrop"></div>
      <aside class="hk-drawer">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid var(--border-default)">
          <img src="/assets/logo-lockup.svg" alt="헬스키퍼" height="28">
          <button type="button" aria-label="닫기" id="hk-drawer-close" style="border:none;background:transparent;cursor:pointer;padding:6px;display:flex">${HKUI.icon("x", 22, "var(--color-slate-blue)")}</button>
        </div>
        <div style="flex:1;overflow-y:auto;padding:16px 18px;display:flex;flex-direction:column">
          ${!loggedIn ? `<div style="display:flex;flex-direction:column;gap:8px;padding-bottom:16px;margin-bottom:8px;border-bottom:1px solid var(--color-mist)"><a href="${R.login}"><button type="button" class="hk-btn hk-btn--primary hk-btn--block">로그인</button></a></div>` : ""}
          <nav style="display:flex;flex-direction:column">
            ${[[R.home, "home", "서비스 소개"], [R.reserve, "reserve", "예약하기"]].concat(loggedIn ? [[R.mypage, "mypage", "마이페이지"]] : []).map(([h, id, l]) => `<a href="${h}" style="display:block;padding:14px 4px;font-size:16px;font-weight:600;text-decoration:none;border-bottom:1px solid var(--color-mist);color:${active === id ? "var(--color-signal-blue)" : "var(--color-midnight-navy)"}">${l}</a>`).join("")}
          </nav>
        </div>
        ${loggedIn ? `<div style="border-top:1px solid var(--border-default);padding:14px 18px;display:flex;flex-direction:column;gap:10px"><div style="display:flex;align-items:center;gap:10px">${HKUI.avatar(name, "sm", avatarUrl)}<span style="font-size:14px;font-weight:600;color:var(--color-midnight-navy)">${HKUI.escapeHtml(name)}님</span></div><button type="button" class="hk-btn hk-btn--secondary hk-btn--block" id="hk-logout-mobile">로그아웃</button></div>` : ""}
      </aside>
    </div>`;
  }

  function renderFooter() {
    return `<footer style="border-top:1px solid var(--border-default);background:var(--surface-card);margin-top:40px">
      <div style="max-width:1200px;margin:0 auto;padding:28px 32px;display:flex;align-items:center;gap:12px">
        <img src="/assets/logo-mark.svg" width="28" height="28" alt="">
        <span style="font-size:13px;color:var(--text-muted)">© 2026 ibank Healthkeeper · 사내 안마서비스 예약 시스템</span>
      </div>
    </footer>`;
  }

  function authHeader() {
    return `<header style="height:72px;background:var(--surface-card);border-bottom:1px solid var(--border-default)">
      <div style="max-width:1200px;margin:0 auto;height:100%;padding:0 32px;display:flex;align-items:center">
        <a href="${R.home}"><img src="/assets/logo-lockup.svg" alt="헬스키퍼" height="34"></a>
      </div>
    </header>`;
  }

  function bindShell(profile) {
    const logout = async () => {
      try { await HKApi.logout(); } catch (_) {}
      window.location.href = R.home;
    };
    document.getElementById("hk-logout")?.addEventListener("click", logout);
    document.getElementById("hk-logout-mobile")?.addEventListener("click", logout);
    const drawer = document.getElementById("hk-drawer");
    const close = () => drawer?.classList.remove("open");
    document.getElementById("hk-menu-btn")?.addEventListener("click", () => drawer?.classList.add("open"));
    document.getElementById("hk-drawer-close")?.addEventListener("click", close);
    document.getElementById("hk-drawer-backdrop")?.addEventListener("click", close);
  }

  async function requireAuth(redirectTo) {
    try { return await HKApi.profile(); }
    catch (e) {
      if (e.status === 401 || e.status === 403) {
        window.location.href = `${R.login}?returnTo=${encodeURIComponent(redirectTo || window.location.pathname)}`;
        return null;
      }
      throw e;
    }
  }

  async function mountPage({ active, auth = false, render, afterMount, landing = false, authPage = false, mainStyle = "" }) {
    await HKUI.loadLucide();
    let profile = null;
    if (auth) {
      profile = await requireAuth(window.location.pathname);
      if (!profile) return;
    } else if (!authPage) {
      try { profile = await HKApi.profile(); } catch (_) { profile = null; }
    }
    const root = document.getElementById("app");
    const body = landing
      ? render(profile)
      : mainStyle
        ? `<main style="${mainStyle}">${render(profile)}</main>`
        : render(profile);
    root.innerHTML =
      (authPage ? authHeader() : renderHeader(active, profile)) +
      (landing ? body + renderFooter() : authPage ? body : body + renderFooter());
    if (!authPage) bindShell(profile);
    HKUI.refreshIcons();
    if (typeof afterMount === "function") await afterMount(profile);
    HKUI.refreshIcons();
  }

  return { renderHeader, renderFooter, authHeader, requireAuth, mountPage, ROUTES: R };
})();
