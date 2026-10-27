/** 공지사항 · 건강 정보 게시판 화면 (같은 게시판, category 로 구분) */
window.HKBoard = (function () {
  function dateLabel(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  }

  function mount(cfg) {
    const route = cfg.route;
    const listHtml = (items, activeId) => {
      if (!items.length) {
        return HKUI.emptyState({ iconName: cfg.emptyIcon, title: cfg.emptyTitle, desc: cfg.emptyDesc });
      }
      return `<ul class="hk-notice-list">${items.map((n) => `
        <li><a href="${route}?id=${n.id}" data-id="${n.id}" class="${n.id === activeId ? "is-active" : ""}">
          ${n.pinned ? '<span class="hk-badge hk-badge--soft">공지</span>' : ""}
          <span class="hk-notice-list__title">${HKUI.escapeHtml(n.title)}</span>
          <span class="hk-notice-list__date">${dateLabel(n.publishedAt)}</span>
        </a></li>`).join("")}</ul>`;
    };
    const detailHtml = (n) => `<article class="hk-card hk-card--pad hk-notice-article">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
          ${n.pinned ? '<span class="hk-badge hk-badge--soft">공지</span>' : ""}
          ${cfg.category === "HEALTH" ? `<span class="hk-badge hk-badge--soft" style="background:#e6f6ec;color:#1a7f45">${HKUI.icon("heart-pulse", 13, "currentColor")} 건강 정보</span>` : ""}
          <span style="font-size:13px;color:var(--text-muted)">${dateLabel(n.publishedAt)}</span>
        </div>
        <h2 class="hk-notice-article__title">${HKUI.escapeHtml(n.title)}</h2>
        <div class="hk-notice-body">${HKUI.noticeBodyHtml(n.body)}</div>
      </article>`;

    HKMember.mountPage({
      active: cfg.active,
      mainStyle: "max-width:1200px;margin:0 auto;padding:36px 32px 72px",
      render() {
        return `
          <h1 style="font-size:34px;margin:0 0 ${cfg.intro ? "6px" : "20px"}">${cfg.title}</h1>
          ${cfg.intro ? `<p style="font-size:16px;color:var(--text-secondary);margin:0 0 20px">${cfg.intro}</p>` : ""}
          <div id="notice-root">${HKUI.spinner ? HKUI.spinner() : ""}</div>`;
      },
      afterMount: async () => {
        const root = document.getElementById("notice-root");
        try {
          const items = await HKApi.notices(cfg.category);
          const wanted = Number(new URLSearchParams(location.search).get("id"));
          const current = items.find((n) => n.id === wanted) || items[0];
          root.innerHTML = current
            ? `<div class="hk-notice-layout">${detailHtml(current)}<aside class="hk-card hk-card--pad"><div style="font-size:13px;font-weight:700;color:var(--text-muted);margin-bottom:10px">${cfg.listLabel}</div>${listHtml(items, current.id)}</aside></div>`
            : listHtml(items, null);
          // 다른 글을 누르면 페이지를 새로 열지 않고 본문만 바꾼다 (목록에 본문이 이미 있어 깜빡임 없이)
          const show = (n, push) => {
            const article = root.querySelector(".hk-notice-article");
            if (!article || !n) return;
            article.outerHTML = detailHtml(n);
            root.querySelectorAll(".hk-notice-list a").forEach((a) => a.classList.toggle("is-active", a.dataset.id === String(n.id)));
            if (push) history.pushState({ id: n.id }, "", `${route}?id=${n.id}`);
            HKUI.refreshIcons(root.querySelector(".hk-notice-article"));
            const top = root.getBoundingClientRect().top + window.scrollY - 90;
            if (window.scrollY > top) window.scrollTo({ top, behavior: "smooth" });
          };
          root.addEventListener("click", (e) => {
            const link = e.target.closest(".hk-notice-list a[data-id]");
            if (!link || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
            e.preventDefault();
            show(items.find((n) => String(n.id) === link.dataset.id), true);
          });
          window.addEventListener("popstate", () => {
            const id = Number(new URLSearchParams(location.search).get("id"));
            show(items.find((n) => n.id === id) || items[0], false);
          });
        } catch (e) {
          root.innerHTML = HKUI.alertBox("danger", `${cfg.title}을 불러오지 못했습니다`, HKUI.escapeHtml(e.message || "잠시 후 다시 시도해 주세요."));
        }
        HKUI.refreshIcons();
      },
    });
  }

  return { mount };
})();
