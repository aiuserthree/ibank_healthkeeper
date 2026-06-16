/* 헬스키퍼 — 회원(사용자) 공통 셸: 헤더 / 푸터 / 헬퍼
   각 페이지는 window.MemberUI 를 통해 사용한다. DS 컴포넌트는 렌더 시점에 참조한다. */
(function () {
  const NS = "HealthkeeperDS_31e44b";
  const { useEffect } = React;

  function Icon({ name, size = 18, color, strokeWidth = 1.75, style }) {
    return <i data-lucide={name} style={{ width: size, height: size, color, strokeWidth, display: "inline-flex", ...style }} />;
  }
  function useIcons() { useEffect(() => { window.lucide && window.lucide.createIcons(); }); }

  // 차주 운영 슬롯
  const TIMES = ["13:30", "14:30", "15:30", "16:30"];
  const DAYS = [
    { d: "월", date: "6/22", off: false },
    { d: "화", date: "6/23", off: false },
    { d: "수", date: "6/24", off: true },   // 안마사 휴가
    { d: "목", date: "6/25", off: false },
    { d: "금", date: "6/26", off: false },
  ];
  function addMin(t, mins = 30) {
    const [h, m] = t.split(":").map(Number);
    const d = new Date(2000, 0, 1, h, m + mins);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  /* ---------- 헤더 (실제 페이지 링크로 이동) ---------- */
  function Header({ active, loggedIn = true, userName = "김민수" }) {
    const { Button, Avatar } = window[NS];
    const [menuOpen, setMenuOpen] = React.useState(false);
    useIcons();
    const NavLink = ({ href, id, children }) => (
      <a href={href} style={{
        textDecoration: "none", fontSize: 15, fontWeight: 600, padding: "8px 4px", whiteSpace: "nowrap",
        color: active === id ? "var(--color-signal-blue)" : "var(--color-midnight-navy)",
      }}>{children}</a>
    );
    return (
      <>
      <header style={{ background: "var(--surface-card)", borderBottom: "1px solid var(--border-default)", position: "sticky", top: 0, zIndex: 50 }}>
        <div className="hk-mheader" style={{ maxWidth: 1200, margin: "0 auto", height: 72, padding: "0 32px", display: "flex", alignItems: "center", gap: 32 }}>
          <a href="index.html" style={{ display: "flex", alignItems: "center", padding: 0 }}>
            <img src={(window.__resources && window.__resources.logoLockup) || "../assets/logo-lockup.svg"} alt="헬스키퍼" height="34" />
          </a>
          <nav className="hk-mnav" style={{ display: "flex", gap: 24, marginLeft: 8 }}>
            <NavLink href="index.html" id="home">서비스 소개</NavLink>
            <NavLink href="예약하기.html" id="reserve">예약하기</NavLink>
            {loggedIn && <NavLink href="마이페이지-예약내역.html" id="mypage">마이페이지</NavLink>}
          </nav>
          <div style={{ flex: 1 }} />
          {loggedIn ? (
            <div className="hk-mactions" style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <a href="마이페이지-예약내역.html" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
                <Avatar name={userName} size="sm" />
                <span className="hk-uname" style={{ fontSize: 14, fontWeight: 600, color: "var(--color-midnight-navy)" }}>{userName}님</span>
              </a>
              <a href="index.html"><Button variant="ghost" size="sm">로그아웃</Button></a>
            </div>
          ) : (
            <div className="hk-mactions" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <a href="로그인.html"><Button variant="ghost" size="sm">로그인</Button></a>
              <a href="회원가입.html"><Button variant="primary" size="sm">회원가입</Button></a>
            </div>
          )}
          <button className="hk-hamburger" aria-label="메뉴" onClick={() => setMenuOpen(o => !o)} style={{ display: "none", alignItems: "center", justifyContent: "center", width: 42, height: 42, border: "1px solid var(--border-default)", borderRadius: 8, background: "var(--surface-card)", cursor: "pointer", padding: 0 }}>
            <Icon name={menuOpen ? "x" : "menu"} size={22} color="var(--color-midnight-navy)" />
          </button>
        </div>
      </header>
      <div className={"hk-drawer-wrap" + (menuOpen ? " open" : "")}>
        <div className="hk-drawer-backdrop" onClick={() => setMenuOpen(false)}></div>
        <aside className="hk-drawer">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", borderBottom: "1px solid var(--border-default)" }}>
            <img src={(window.__resources && window.__resources.logoLockup) || "../assets/logo-lockup.svg"} alt="헬스키퍼" height="28" />
            <button aria-label="닫기" onClick={() => setMenuOpen(false)} style={{ border: "none", background: "transparent", cursor: "pointer", padding: 6, display: "flex" }}><Icon name="x" size={22} color="var(--color-slate-blue)" /></button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column" }}>
            {!loggedIn && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 16, marginBottom: 8, borderBottom: "1px solid var(--color-mist)" }}>
                <a href="로그인.html"><Button variant="secondary" block>로그인</Button></a>
                <a href="회원가입.html"><Button variant="primary" block>회원가입</Button></a>
              </div>
            )}
            <nav style={{ display: "flex", flexDirection: "column" }}>
              {[["index.html", "home", "서비스 소개"], ["예약하기.html", "reserve", "예약하기"]].concat(loggedIn ? [["마이페이지-예약내역.html", "mypage", "마이페이지"]] : []).map(([href, id, label]) => (
                <a key={id} href={href} style={{ display: "block", padding: "14px 4px", fontSize: 16, fontWeight: 600, textDecoration: "none", borderBottom: "1px solid var(--color-mist)", color: active === id ? "var(--color-signal-blue)" : "var(--color-midnight-navy)" }}>{label}</a>
              ))}
            </nav>
          </div>
          {loggedIn && (
            <div style={{ borderTop: "1px solid var(--border-default)", padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}><Avatar name={userName} size="sm" /><span style={{ fontSize: 14, fontWeight: 600, color: "var(--color-midnight-navy)" }}>{userName}님</span></div>
              <a href="index.html"><Button variant="secondary" block>로그아웃</Button></a>
            </div>
          )}
        </aside>
      </div>
      </>
    );
  }

  /* ---------- 상태 배너 문구 (시스템 상태별) ---------- */
  const STATE_BANNER = {
    BEFORE_OPEN: { variant: "info", title: "예약 오픈 전", body: "이번 주 예약은 수요일 09:00에 오픈됩니다." },
    OPEN:        { variant: "info", title: "예약 가능 · 오늘 16:59 마감", body: "신청은 접수 후 관리자 확정으로 완료됩니다. 같은 시간에 신청이 몰리면 마지막 이용일이 오래된 분께 우선권이 부여됩니다." },
    REAPPLY:     { variant: "warning", title: "탈락자 재신청 기간 · 내일 17:00까지", body: "비어있는 슬롯에 선착순·즉시 확정으로 재신청할 수 있어요. 재신청 건은 취소할 수 없습니다." },
    CLOSED:      { variant: "danger", title: "예약 마감", body: "현재 예약 접수 기간이 아닙니다. 다음 오픈: 수요일 09:00" },
  };

  /* ---------- 푸터 ---------- */
  function Footer() {
    return (
      <footer style={{ borderTop: "1px solid var(--border-default)", background: "var(--surface-card)", marginTop: 40 }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 32px", display: "flex", alignItems: "center", gap: 12 }}>
          <img src={(window.__resources && window.__resources.logoMark) || "../assets/logo-mark.svg"} width="28" height="28" alt="" />
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>© 2026 ibank Healthkeeper · 사내 안마서비스 예약 시스템</span>
          <div style={{ flex: 1 }} />
          <a href="../index.html" style={{ fontSize: 13, color: "var(--text-muted)", textDecoration: "none" }}>전체 화면 목록</a>
        </div>
      </footer>
    );
  }

  /* ---------- 페이지 부트스트랩: DS 번들 준비되면 render ---------- */
  function boot(render) {
    (function wait() {
      if (window[NS] && window.lucide) {
        window.__hkReady = true;
        ReactDOM.createRoot(document.getElementById("root")).render(render());
        setTimeout(() => window.lucide && window.lucide.createIcons(), 0);
      } else setTimeout(wait, 40);
    })();
  }

  window.MemberUI = { Icon, useIcons, TIMES, DAYS, addMin, Header, Footer, STATE_BANNER, boot };
})();
