/** export/html/project admin-shell 과 동일한 마크업 */
window.HKAdminRoutes = {
  login: "/admin/login",
  dashboard: "/admin/dashboard",
  reservations: "/admin/reservations",
  applicant: "/admin/applicant",
  reapplyMail: "/admin/reapply-mail",
  vacation: "/admin/vacation",
  settings: "/admin/settings",
};

window.HKAdmin = (function () {
  const R = HKAdminRoutes;

  const NAV = [
    { k: "dashboard", label: "대시보드", href: R.dashboard, icon: "layout-dashboard" },
    { k: "reservations", label: "예약 관리", href: R.reservations, icon: "calendar-check" },
    { k: "reapply", label: "재신청 안내 메일", href: R.reapplyMail, icon: "mail" },
    { k: "vacation", label: "휴가 관리", href: R.vacation, icon: "palmtree" },
    { k: "settings", label: "운영 설정", href: R.settings, icon: "settings" },
  ];

  function navLink(it, active) {
    const a = active === it.k;
    return `<a href="${it.href}" style="display:flex;align-items:center;gap:12px;padding:11px 14px;border-radius:var(--radius-sm);text-decoration:none;font-size:15px;font-weight:600;background:${a ? "var(--color-signal-blue-soft)" : "transparent"};color:${a ? "var(--color-info-blue)" : "var(--color-slate-blue)"}">${HKUI.icon(it.icon, 19, a ? "var(--color-signal-blue)" : "var(--color-slate-blue)")}${it.label}</a>`;
  }

  function sidebar(active) {
    return `<aside class="hk-asidebar" style="width:240px;background:var(--surface-card);border-right:1px solid var(--border-default);display:flex;flex-direction:column;position:sticky;top:0;height:100vh">
      <div class="hk-abrand" style="display:flex;align-items:center;border-bottom:1px solid var(--border-default)">
        <a href="${R.dashboard}" style="padding:22px 20px;display:flex;align-items:center;gap:10px;text-decoration:none;flex:1;min-width:0">
          <img src="/assets/logo-mark.svg" width="34" height="34" alt="">
          <div><div style="font-size:15px;font-weight:700;color:var(--color-midnight-navy);line-height:1.1">헬스키퍼</div>
          <div style="font-size:11px;color:var(--text-muted);letter-spacing:0.04em">ADMIN</div></div>
        </a>
        <button type="button" class="hk-hamburger" id="hk-admin-menu-btn" aria-label="메뉴" style="display:none;align-items:center;justify-content:center;width:42px;height:42px;margin-right:14px;border:1px solid var(--border-default);border-radius:8px;background:var(--surface-card);cursor:pointer;padding:0">${HKUI.icon("menu", 22, "var(--color-midnight-navy)")}</button>
      </div>
      <nav class="hk-anav" style="padding:12px;display:flex;flex-direction:column;gap:2px;flex:1">${NAV.map((it) => navLink(it, active)).join("")}</nav>
      <div class="hk-auser" style="padding:16px;border-top:1px solid var(--border-default);display:flex;align-items:center;gap:10px">
        ${HKUI.avatar("관리자", "sm")}
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:700;color:var(--color-midnight-navy)">운영 관리자</div>
          <div style="font-size:11px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">admin</div>
        </div>
        <button type="button" class="hk-iconbtn" id="hk-admin-logout" title="로그아웃">${HKUI.icon("log-out", 18)}</button>
      </div>
    </aside>
    <div class="hk-drawer-wrap" id="hk-admin-drawer">
      <div class="hk-drawer-backdrop" id="hk-admin-drawer-backdrop"></div>
      <aside class="hk-drawer">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid var(--border-default)">
          <div style="display:flex;align-items:center;gap:10px">
            <img src="/assets/logo-mark.svg" width="30" height="30" alt="">
            <div><div style="font-size:14px;font-weight:700;color:var(--color-midnight-navy);line-height:1.1">헬스키퍼</div><div style="font-size:10px;color:var(--text-muted);letter-spacing:0.04em">ADMIN</div></div>
          </div>
          <button type="button" aria-label="닫기" id="hk-admin-drawer-close" style="border:none;background:transparent;cursor:pointer;padding:6px;display:flex">${HKUI.icon("x", 22, "var(--color-slate-blue)")}</button>
        </div>
        <div style="flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column">
          <nav style="display:flex;flex-direction:column;gap:2px">${NAV.map((it) => {
            const a = active === it.k;
            return `<a href="${it.href}" style="display:flex;align-items:center;gap:12px;padding:13px 12px;border-radius:var(--radius-sm);text-decoration:none;font-size:15.5px;font-weight:600;background:${a ? "var(--color-signal-blue-soft)" : "transparent"};color:${a ? "var(--color-info-blue)" : "var(--color-slate-blue)"}">${HKUI.icon(it.icon, 20, a ? "var(--color-signal-blue)" : "var(--color-slate-blue)")}${it.label}</a>`;
          }).join("")}</nav>
        </div>
        <div style="border-top:1px solid var(--border-default);padding:14px 18px;display:flex;flex-direction:column;gap:10px">
          <div style="display:flex;align-items:center;gap:10px">${HKUI.avatar("관리자", "sm")}<div style="min-width:0"><div style="font-size:13px;font-weight:700;color:var(--color-midnight-navy)">운영 관리자</div><div style="font-size:11px;color:var(--text-muted)">admin</div></div></div>
          <button type="button" class="hk-btn hk-btn--secondary hk-btn--block" id="hk-admin-logout-mobile">로그아웃</button>
        </div>
      </aside>
    </div>`;
  }

  async function requireAuth() {
    try {
      await HKApi.dashboard();
      return true;
    } catch (e) {
      if (e.status === 401 || e.status === 403) {
        window.location.href = R.login;
        return false;
      }
      throw e;
    }
  }

  async function mountPage({ active, auth = true, render, afterMount }) {
    await HKUI.loadLucide();
    if (auth) {
      const ok = await requireAuth();
      if (!ok) return;
    }
    const root = document.getElementById("app");
    root.innerHTML = `<div class="hk-ashell" style="display:flex;min-height:100vh">${sidebar(active)}<main class="hk-amain" style="flex:1;padding:32px 40px;max-width:1120px;box-sizing:border-box">${render()}</main></div>`;
    const logout = async () => {
      try { await HKApi.adminLogout(); } catch (_) {}
      window.location.href = R.login;
    };
    document.getElementById("hk-admin-logout")?.addEventListener("click", logout);
    document.getElementById("hk-admin-logout-mobile")?.addEventListener("click", logout);
    const drawer = document.getElementById("hk-admin-drawer");
    const close = () => drawer?.classList.remove("open");
    document.getElementById("hk-admin-menu-btn")?.addEventListener("click", () => drawer?.classList.add("open"));
    document.getElementById("hk-admin-drawer-close")?.addEventListener("click", close);
    document.getElementById("hk-admin-drawer-backdrop")?.addEventListener("click", close);
    HKUI.refreshIcons();
    if (typeof afterMount === "function") await afterMount();
    HKUI.refreshIcons();
  }

  function pageHead(title, sub, rightHtml = "") {
    return `<div style="display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:24px;gap:16px;flex-wrap:wrap">
      <div><h1 style="font-size:30px;margin:0">${HKUI.escapeHtml(title)}</h1>${sub ? `<p style="font-size:15px;color:var(--text-secondary);margin:6px 0 0">${HKUI.escapeHtml(sub)}</p>` : ""}</div>
      ${rightHtml || ""}
    </div>`;
  }

  function datePill(label, active, disabled, dataAttr) {
    return `<button type="button" ${dataAttr} ${disabled ? "disabled" : ""} style="padding:10px 16px;border-radius:var(--radius-sm);cursor:${disabled ? "not-allowed" : "pointer"};font:inherit;border:1px solid ${active ? "var(--color-signal-blue)" : "var(--border-default)"};background:${disabled ? "var(--color-mist)" : active ? "var(--color-signal-blue)" : "var(--surface-card)"};color:${disabled ? "var(--text-muted)" : active ? "#fff" : "var(--color-midnight-navy)"};font-weight:600;font-size:14px">${label}</button>`;
  }

  function filterPill(label, active, dataAttr) {
    return `<button type="button" ${dataAttr} style="padding:7px 14px;border-radius:999px;cursor:pointer;font:inherit;font-size:13px;font-weight:600;border:1px solid ${active ? "var(--color-signal-blue)" : "var(--border-default)"};background:${active ? "var(--color-signal-blue-soft)" : "var(--surface-card)"};color:${active ? "var(--color-info-blue)" : "var(--color-slate-blue)"}">${label}</button>`;
  }

  function sectionCard(iconName, title, desc, inner) {
    return `<div class="hk-card hk-card--pad">
      <div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:18px">
        <div style="width:38px;height:38px;border-radius:9px;background:var(--color-signal-blue-soft);display:flex;align-items:center;justify-content:center;flex-shrink:0">${HKUI.icon(iconName, 20, "var(--color-signal-blue)")}</div>
        <div><h2 style="font-size:18px;margin:0">${HKUI.escapeHtml(title)}</h2>${desc ? `<p style="font-size:13.5px;color:var(--text-secondary);margin:3px 0 0">${HKUI.escapeHtml(desc)}</p>` : ""}</div>
      </div>
      ${inner}
    </div>`;
  }

  return { mountPage, pageHead, datePill, filterPill, sectionCard, requireAuth, ROUTES: R, NAV };
})();
