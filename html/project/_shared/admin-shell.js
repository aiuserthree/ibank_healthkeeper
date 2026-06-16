/* 헬스키퍼 — 관리자 공통 셸: 사이드바 / 페이지 헤더 / 헬퍼
   각 페이지는 window.AdminUI 를 통해 사용한다. */
(function () {
  const NS = "HealthkeeperDS_31e44b";
  const { useEffect } = React;

  function Icon({ name, size = 18, color, style }) {
    return <i data-lucide={name} style={{ width: size, height: size, color, display: "inline-flex", ...style }} />;
  }
  function useIcons() { useEffect(() => { window.lucide && window.lucide.createIcons(); }); }

  const DAYS = [
    { d: "월", date: "6/22" }, { d: "화", date: "6/23" }, { d: "수", date: "6/24", off: true },
    { d: "목", date: "6/25" }, { d: "금", date: "6/26" },
  ];
  const TIMES = ["13:30", "14:30", "15:30", "16:30"];
  function endT(t) { const [h, m] = t.split(":").map(Number); return `${String(h + (m + 30 >= 60 ? 1 : 0)).padStart(2, "0")}:${String((m + 30) % 60).padStart(2, "0")}`; }

  const NAV = [
    { k: "dashboard", label: "대시보드", icon: "layout-dashboard", href: "대시보드.html" },
    { k: "reservations", label: "예약 관리", icon: "calendar-check", href: "예약관리.html" },
    { k: "reapply", label: "재신청 안내 메일", icon: "mail", href: "재신청메일.html" },
    { k: "vacation", label: "휴가 관리", icon: "palmtree", href: "휴가관리.html" },
    { k: "settings", label: "운영 설정", icon: "settings", href: "운영설정.html" },
  ];

  function Sidebar({ active, loggedIn = true }) {
    const { Avatar, IconButton, Button } = window[NS];
    const [menuOpen, setMenuOpen] = React.useState(false);
    useIcons();
    return (
      <>
      <aside className="hk-asidebar" style={{ width: 240, background: "var(--surface-card)", borderRight: "1px solid var(--border-default)", display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh" }}>
        <div className="hk-abrand" style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--border-default)" }}>
          <a href="대시보드.html" style={{ padding: "22px 20px", display: "flex", alignItems: "center", gap: 10, textDecoration: "none", flex: 1, minWidth: 0 }}>
            <img src={(window.__resources && window.__resources.logoMark) || "../assets/logo-mark.svg"} width="34" height="34" alt="" />
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--color-midnight-navy)", lineHeight: 1.1 }}>헬스키퍼</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.04em" }}>ADMIN</div>
            </div>
          </a>
          <button className="hk-hamburger" aria-label="메뉴" onClick={() => setMenuOpen(o => !o)} style={{ display: "none", alignItems: "center", justifyContent: "center", width: 42, height: 42, marginRight: 14, border: "1px solid var(--border-default)", borderRadius: 8, background: "var(--surface-card)", cursor: "pointer", padding: 0 }}>
            <Icon name={menuOpen ? "x" : "menu"} size={22} color="var(--color-midnight-navy)" />
          </button>
        </div>
        <nav className="hk-anav" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
          {NAV.map(it => {
            const a = active === it.k;
            return (
              <a key={it.k} href={it.href} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderRadius: "var(--radius-sm)", textDecoration: "none", fontSize: 15, fontWeight: 600, background: a ? "var(--color-signal-blue-soft)" : "transparent", color: a ? "var(--color-info-blue)" : "var(--color-slate-blue)" }}>
                <Icon name={it.icon} size={19} color={a ? "var(--color-signal-blue)" : "var(--color-slate-blue)"} />
                {it.label}
              </a>
            );
          })}
        </nav>
        <div className="hk-auser" style={{ padding: 16, borderTop: "1px solid var(--border-default)", display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar name="관리자" size="sm" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-midnight-navy)" }}>운영 관리자</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>admin@ibank.co.kr</div>
          </div>
          <a href="로그인.html"><IconButton label="로그아웃"><Icon name="log-out" size={18} /></IconButton></a>
        </div>
      </aside>
      <div className={"hk-drawer-wrap" + (menuOpen ? " open" : "")}>
        <div className="hk-drawer-backdrop" onClick={() => setMenuOpen(false)}></div>
        <aside className="hk-drawer">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", borderBottom: "1px solid var(--border-default)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <img src={(window.__resources && window.__resources.logoMark) || "../assets/logo-mark.svg"} width="30" height="30" alt="" />
              <div><div style={{ fontSize: 14, fontWeight: 700, color: "var(--color-midnight-navy)", lineHeight: 1.1 }}>헬스키퍼</div><div style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.04em" }}>ADMIN</div></div>
            </div>
            <button aria-label="닫기" onClick={() => setMenuOpen(false)} style={{ border: "none", background: "transparent", cursor: "pointer", padding: 6, display: "flex" }}><Icon name="x" size={22} color="var(--color-slate-blue)" /></button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "14px", display: "flex", flexDirection: "column" }}>
            {!loggedIn && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 14, marginBottom: 8, borderBottom: "1px solid var(--color-mist)" }}>
                <a href="로그인.html"><Button variant="primary" block>로그인</Button></a>
              </div>
            )}
            <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {NAV.map(it => { const a = active === it.k; return (
                <a key={it.k} href={it.href} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 12px", borderRadius: "var(--radius-sm)", textDecoration: "none", fontSize: 15.5, fontWeight: 600, background: a ? "var(--color-signal-blue-soft)" : "transparent", color: a ? "var(--color-info-blue)" : "var(--color-slate-blue)" }}>
                  <Icon name={it.icon} size={20} color={a ? "var(--color-signal-blue)" : "var(--color-slate-blue)"} />{it.label}
                </a>
              ); })}
            </nav>
          </div>
          {loggedIn && (
            <div style={{ borderTop: "1px solid var(--border-default)", padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}><Avatar name="관리자" size="sm" /><div style={{ minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-midnight-navy)" }}>운영 관리자</div><div style={{ fontSize: 11, color: "var(--text-muted)" }}>admin@ibank.co.kr</div></div></div>
              <a href="로그인.html"><Button variant="secondary" block>로그아웃</Button></a>
            </div>
          )}
        </aside>
      </div>
      </>
    );
  }

  function PageHead({ title, sub, right }) {
    return (
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 24, gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 30, margin: 0 }}>{title}</h1>
          {sub && <p style={{ fontSize: 15, color: "var(--text-secondary)", marginTop: 6, margin: "6px 0 0" }}>{sub}</p>}
        </div>
        {right}
      </div>
    );
  }

  /* 사이드바 + 본문 레이아웃 셸 */
  function Shell({ active, loggedIn = true, children }) {
    return (
      <div className="hk-ashell" style={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar active={active} loggedIn={loggedIn} />
        <main className="hk-amain" style={{ flex: 1, padding: "32px 40px", maxWidth: 1120 }}>{children}</main>
      </div>
    );
  }

  function boot(render) {
    (function wait() {
      if (window[NS] && window.lucide) {
        window.__hkReady = true;
        ReactDOM.createRoot(document.getElementById("root")).render(render());
        setTimeout(() => window.lucide && window.lucide.createIcons(), 0);
      } else setTimeout(wait, 40);
    })();
  }

  window.AdminUI = { Icon, useIcons, DAYS, TIMES, endT, NAV, Sidebar, PageHead, Shell, boot };
})();
