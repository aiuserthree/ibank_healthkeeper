/** UI 헬퍼 — 알림, 토스트, 다이얼로그, 날짜 포맷, 디자인 컴포넌트 */
window.HKUI = (function () {
  const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
  let lucidePromise = null;

  const STATE_BANNER = {
    BEFORE_OPEN: { variant: "info", title: "예약 오픈 전", body: "다음 예약은 수요일 09:00에 오픈됩니다." },
    OPEN: {
      variant: "info",
      title: "예약 가능 · 오늘 16:59 마감",
      body: "신청은 접수 후 관리자 확정으로 완료됩니다. 같은 시간에 신청이 몰리면 마지막 이용일이 오래된 분께 우선권이 부여됩니다.",
    },
    REAPPLY: {
      variant: "warning",
      title: "탈락자 재신청 기간",
      body: "비어있는 슬롯에 선착순·즉시 확정으로 재신청할 수 있어요. 재신청 건은 취소할 수 없습니다.",
    },
    CLOSED: {
      variant: "danger",
      title: "예약 마감",
      body: "다음 예약은 수요일 09:00에 오픈됩니다.",
    },
  };

  const STATUS_LABEL = {
    REQUESTED: { text: "신청 접수", variant: "warning", dot: true },
    CONFIRMED: { text: "확정", variant: "success", dot: true },
    DROPPED: { text: "탈락", variant: "danger", dot: true },
    CANCELLED: { text: "취소", variant: "neutral", dot: false },
    신청: { text: "신청", variant: "warning", dot: true },
    확정: { text: "확정", variant: "success", dot: true },
    탈락: { text: "탈락", variant: "danger", dot: true },
    취소: { text: "취소", variant: "neutral", dot: false },
  };

  const ADMIN_NAV_ICONS = {
    dashboard: "layout-dashboard",
    reservations: "calendar-check",
    reapply: "mail",
    vacation: "palmtree",
    settings: "settings",
  };

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const KST = "Asia/Seoul";

  /** 현재 시각을 한국 시간 기준 Date로 (달력 기본 월 등) */
  function nowKst() {
    return new Date(new Date().toLocaleString("en-US", { timeZone: KST }));
  }

  /** KST 기준 오늘 날짜 (YYYY-MM-DD) */
  function kstTodayKey() {
    return new Date().toLocaleDateString("sv-SE", { timeZone: KST });
  }

  function addDaysToDateKey(key, days) {
    const [y, m, d] = key.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + days));
    return dt.toISOString().slice(0, 10);
  }

  /** ISO datetime → KST HH:MM */
  function formatTimeKst(iso) {
    if (!iso) return "-";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleTimeString("ko-KR", { timeZone: KST, hour: "2-digit", minute: "2-digit", hour12: false });
  }

  /** ISO datetime → KST YYYY-MM-DD */
  function kstDateKey(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("sv-SE", { timeZone: KST });
  }

  function kstDayName(iso) {
    const key = kstDateKey(iso);
    if (!key) return "";
    const [y, m, day] = key.split("-").map(Number);
    return DAY_NAMES[new Date(y, m - 1, day).getDay()];
  }

  /** 마감 시각을 오늘/내일/요일 기준으로 표시 (예: 오늘 17:00) */
  function formatDeadlineRelative(iso, fallbackTime = "17:00") {
    if (!iso) return `목요일 ${fallbackTime}`;
    const time = formatTimeKst(iso);
    const target = kstDateKey(iso);
    const todayKey = kstTodayKey();
    if (target === todayKey) return `오늘 ${time}`;
    if (target === addDaysToDateKey(todayKey, 1)) return `내일 ${time}`;
    const dow = kstDayName(iso);
    return dow ? `${dow}요일 ${time}` : time;
  }

  function getStateBanner(state, opts = {}) {
    const base = { ...(STATE_BANNER[state] || STATE_BANNER.CLOSED) };
    if (state === "REAPPLY") {
      const until = formatDeadlineRelative(opts.reapplyCloseAt);
      base.title = `탈락자 재신청 기간 · ${until}까지`;
    } else if (state === "OPEN" && opts.closeAt) {
      const close = new Date(opts.closeAt);
      if (!Number.isNaN(close.getTime())) {
        close.setMinutes(close.getMinutes() - 1);
        base.title = `예약 가능 · ${formatDeadlineRelative(close.toISOString(), "16:59")} 마감`;
      }
    }
    return base;
  }

  /** ISO datetime → KST YYYY-MM-DD HH:MM */
  function formatDateTimeKst(iso) {
    if (!iso) return "-";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "-";
    const date = d.toLocaleDateString("sv-SE", { timeZone: KST });
    const time = d.toLocaleTimeString("ko-KR", { timeZone: KST, hour: "2-digit", minute: "2-digit", hour12: false });
    return `${date} ${time}`;
  }

  /** ISO datetime → KST YYYY.MM.DD */
  function formatDateDotKst(iso) {
    if (!iso) return "-";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("sv-SE", { timeZone: KST }).replace(/-/g, ".");
  }

  function formatDate(iso) {
    if (!iso) return "-";
    const d = new Date(iso + "T12:00:00");
    return `${d.getMonth() + 1}/${d.getDate()}(${DAY_NAMES[d.getDay()]})`;
  }

  function formatDateLong(iso) {
    if (!iso) return "-";
    const d = new Date(iso + "T12:00:00");
    return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DAY_NAMES[d.getDay()]})`;
  }

  function formatDateShort(iso) {
    if (!iso) return "-";
    const d = new Date(iso + "T12:00:00");
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  function addMin(t, mins = 30) {
    const [h, m] = String(t).split(":").map(Number);
    const d = new Date(2000, 0, 1, h, m + mins);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  function endT(t) {
    return addMin(t, 30);
  }

  function loadLucide() {
    if (window.lucide) return Promise.resolve();
    if (lucidePromise) return lucidePromise;
    lucidePromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://unpkg.com/lucide@0.460.0/dist/umd/lucide.min.js";
      s.crossOrigin = "anonymous";
      s.onload = () => resolve();
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return lucidePromise;
  }

  function refreshIcons(root) {
    if (window.lucide) window.lucide.createIcons({ attrs: { "stroke-width": 1.75 }, nameAttr: "data-lucide", icons: window.lucide.icons, root: root || document });
  }

  function icon(name, size = 18, color, extraStyle = "") {
    const style = `width:${size}px;height:${size}px;${color ? `color:${color};` : ""}display:inline-flex;vertical-align:middle;${extraStyle}`;
    return `<i data-lucide="${escapeHtml(name)}" style="${style}"></i>`;
  }

  function badge(text, variant = "neutral", dot = false) {
    const dotHtml = dot ? `<span class="hk-badge__dot"></span>` : "";
    return `<span class="hk-badge hk-badge--${variant}">${dotHtml}${escapeHtml(text)}</span>`;
  }

  function alertBox(variant, title, body, actionHtml) {
    const icons = { info: "info", success: "circle-check-big", warning: "triangle-alert", danger: "circle-x" };
    const wrapStyle = actionHtml ? "align-items:center;flex-wrap:wrap" : "";
    const bodyStyle = actionHtml ? "flex:1;min-width:0" : "";
    const action = actionHtml
      ? `<div style="flex-shrink:0;margin-left:auto">${actionHtml}</div>`
      : "";
    return `<div class="hk-alert hk-alert--${variant}" style="${wrapStyle}">
      <div class="hk-alert__icon">${icon(icons[variant] || "info", 20)}</div>
      <div class="hk-alert__body" style="${bodyStyle}">
        ${title ? `<div class="hk-alert__title">${escapeHtml(title)}</div>` : ""}
        <div>${body}</div>
      </div>
      ${action}
    </div>`;
  }

  function toast(message, variant = "success") {
    const el = document.createElement("div");
    el.className = "hk-toast-wrap";
    el.innerHTML = `<div class="hk-toast hk-toast--${variant}">${escapeHtml(message)}</div>`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3400);
  }

  function confirmDialog(title, body, opts = {}) {
    const confirmLabel = opts.confirmLabel || "확인";
    const cancelLabel = opts.cancelLabel || "취소";
    const confirmVariant = opts.confirmVariant || "primary";
    const hideCancel = opts.hideCancel || false;
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "hk-dialog__overlay";
      overlay.innerHTML = `<div class="hk-dialog" role="dialog">
        <div class="hk-dialog__title">${escapeHtml(title)}</div>
        <div class="hk-dialog__body">${body}</div>
        <div class="hk-dialog__actions">
          ${hideCancel ? "" : `<button type="button" class="hk-btn hk-btn--secondary" data-act="cancel">${escapeHtml(cancelLabel)}</button>`}
          <button type="button" class="hk-btn hk-btn--${confirmVariant}" data-act="ok">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>`;
      const close = (v) => {
        overlay.remove();
        resolve(v);
      };
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) close(false);
      });
      if (!hideCancel) overlay.querySelector('[data-act="cancel"]').onclick = () => close(false);
      overlay.querySelector('[data-act="ok"]').onclick = () => close(true);
      document.body.appendChild(overlay);
      loadLucide().then(() => refreshIcons(overlay));
    });
  }

  function layerModal(title, onMount, opts = {}) {
    const fixedHeight = opts.fixedHeight
      ? "height:min(680px, 85vh);"
      : "max-height:85vh;";
    const overlay = document.createElement("div");
    overlay.className = "hk-dialog__overlay";
    overlay.innerHTML = `<div class="hk-dialog" role="dialog" style="max-width:560px;width:calc(100% - 32px);${fixedHeight}display:flex;flex-direction:column;padding:24px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;flex-shrink:0">
        <div class="hk-dialog__title" style="margin:0">${escapeHtml(title)}</div>
        <button type="button" class="hk-btn hk-btn--ghost hk-btn--sm" data-close aria-label="닫기">${icon("x", 18, "currentColor")}</button>
      </div>
      <div class="hk-dialog__body" style="flex:1;min-height:0;overflow-y:auto;margin:0;padding-right:2px" id="hk-layer-body"></div>
      <div id="hk-layer-footer" style="margin-top:16px;flex-shrink:0"></div>
    </div>`;
    const close = () => overlay.remove();
    overlay.querySelector("[data-close]").onclick = close;
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    document.body.appendChild(overlay);
    const bodyEl = overlay.querySelector("#hk-layer-body");
    const footerEl = overlay.querySelector("#hk-layer-footer");
    bodyEl.innerHTML = `<div style="text-align:center;padding:32px"><span class="hk-spin"></span></div>`;
    loadLucide().then(() => refreshIcons(overlay));
    if (onMount) {
      const ret = onMount(bodyEl, footerEl, close);
      if (ret && typeof ret.then === "function") {
        ret.catch((e) => {
          bodyEl.innerHTML = `<div class="hk-empty" style="padding:24px 8px;text-align:center">${escapeHtml(e.message || "오류가 발생했습니다.")}</div>`;
        });
      }
    }
    return { overlay, bodyEl, footerEl, close };
  }

  function avatar(name, size = "sm") {
    const initial = (name || "?").charAt(0);
    return `<span class="hk-avatar hk-avatar--${size}">${escapeHtml(initial)}</span>`;
  }

  function statusBadge(status) {
    const s = STATUS_LABEL[status] || { text: status, variant: "neutral", dot: false };
    return badge(s.text, s.variant, s.dot);
  }

  function queryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function msLogo(size = 16) {
    const g = size * 0.46;
    const gap = size * 0.08;
    return `<span class="ms-logo" style="display:inline-grid;grid-template-columns:${g}px ${g}px;grid-template-rows:${g}px ${g}px;gap:${gap}px"><span></span><span></span><span></span><span></span></span>`;
  }

  function kv(k, v) {
    return `<div><div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">${escapeHtml(k)}</div><div style="font-size:16px;font-weight:700;color:var(--color-midnight-navy)">${v}</div></div>`;
  }

  const PRIORITY_TOOLTIP_HTML =
    "<b>이력 없음 · 최우선</b> — 안마서비스 이용 이력이 없어, 같은 시간에 신청이 겹치면 가장 유리합니다.<br><br>" +
    "<b>이용 이력 있음</b> — 마지막 이용일이 있으며, <b>오래 전에 받은 분</b>일수록 우선순위가 높습니다. 마지막 이용일이 같으면 먼저 신청한 분이 우선합니다.";

  const APPLY_TOTAL_TOOLTIP_HTML =
    "지금까지 <b>예약을 신청하신 횟수</b>예요.(2026년 1월 1일부터 산정)<br><br>" +
    "과거 이용 이력과 사이트에서 신청한 건(확정·탈락·대기)을 합산하고, <b>취소한 건은 빼고</b> 계산합니다.";

  const USAGE_TOTAL_TOOLTIP_HTML =
    "실제로 <b>안마서비스를 이용하신 횟수</b>예요.(2026년 1월 1일부터 산정)<br><br>" +
    "과거 이용 이력과 사이트에서 <b>확정된</b> 예약을 합산합니다. 신청만 한 건·탈락한 건은 포함되지 않습니다.";

  function kvTooltip(key, valueHtml, tooltipHtml) {
    const panelId = `hk-tt-${Math.random().toString(36).slice(2, 9)}`;
    return `<div class="hk-kv-tooltip" data-tooltip-root>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px;display:flex;align-items:center;gap:5px">
        <span>${escapeHtml(key)}</span>
        <button type="button" class="hk-tooltip-btn" aria-expanded="false" aria-controls="${panelId}" aria-label="${escapeHtml(key)} 안내" style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:none;background:transparent;cursor:pointer;border-radius:999px;color:var(--color-slate-blue)">${icon("circle-help", 15, "currentColor")}</button>
      </div>
      <div style="font-size:16px;font-weight:700;color:var(--color-midnight-navy)">${valueHtml}</div>
      <div id="${panelId}" class="hk-tooltip-panel" role="tooltip" hidden>${tooltipHtml}</div>
    </div>`;
  }

  function resetTooltipPanel(panel) {
    panel.style.top = "";
    panel.style.left = "";
    panel.style.right = "";
    panel.style.width = "";
    panel.style.maxWidth = "";
    if (panel._tooltipWrap && panel.parentElement === document.body) {
      panel._tooltipWrap.appendChild(panel);
    }
  }

  function positionTooltipPanel(btn, panel) {
    if (panel.parentElement !== document.body) {
      document.body.appendChild(panel);
    }
    panel.hidden = false;

    const margin = 18;
    const maxW = 420;
    const vw = window.innerWidth;
    const width = Math.min(maxW, vw - margin * 2);
    const rect = btn.getBoundingClientRect();

    panel.style.left = `${Math.max(margin, Math.min(rect.left, vw - margin - width))}px`;
    panel.style.right = "auto";
    panel.style.width = `${width}px`;
    panel.style.maxWidth = `${width}px`;

    const ph = panel.offsetHeight;
    const gap = 8;
    let top = rect.bottom + gap;
    if (top + ph > window.innerHeight - 12) {
      top = Math.max(12, rect.top - ph - gap);
    }
    panel.style.top = `${top}px`;
  }

  function closeAllTooltips() {
    document.querySelectorAll(".hk-tooltip-panel").forEach((p) => {
      p.hidden = true;
      resetTooltipPanel(p);
      const btn = p._tooltipBtn;
      if (btn) btn.setAttribute("aria-expanded", "false");
    });
  }

  function bindTooltips(root) {
    const scope = root || document;
    scope.querySelectorAll("[data-tooltip-root]").forEach((wrap) => {
      const btn = wrap.querySelector(".hk-tooltip-btn");
      const panel = wrap.querySelector(".hk-tooltip-panel");
      if (!btn || !panel || btn.dataset.bound) return;
      btn.dataset.bound = "1";
      panel._tooltipWrap = wrap;
      panel._tooltipBtn = btn;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const willOpen = panel.hidden;
        closeAllTooltips();
        if (willOpen) {
          positionTooltipPanel(btn, panel);
          btn.setAttribute("aria-expanded", "true");
          refreshIcons();
        }
      });
    });
    if (!document.documentElement.dataset.hkTooltipDocBound) {
      document.documentElement.dataset.hkTooltipDocBound = "1";
      document.addEventListener("click", (e) => {
        if (e.target.closest(".hk-tooltip-btn") || e.target.closest(".hk-tooltip-panel")) return;
        closeAllTooltips();
      });
      window.addEventListener("resize", closeAllTooltips);
      window.addEventListener("scroll", closeAllTooltips, true);
    }
  }

  function teamsBadge() {
    return `<span style="display:inline-flex;align-items:center;gap:7px;padding:5px 11px;background:var(--color-mist);border-radius:999px;font-size:12.5px;font-weight:600;color:var(--color-slate-blue)">${msLogo(14)} Microsoft Teams 계정 연동</span>`;
  }

  function demoToggle(label, options, active, attr = "data-demo") {
    return `<div style="display:flex;gap:6px;flex-wrap:wrap">${label ? `<span style="font-size:12px;color:var(--text-muted);align-self:center;margin-right:2px">${escapeHtml(label)}</span>` : ""}${options
      .map(([k, l]) => {
        const on = active === k;
        return `<button type="button" ${attr}="${k}" style="padding:6px 12px;border-radius:999px;cursor:pointer;font:inherit;font-size:12.5px;font-weight:600;border:1px solid ${on ? "var(--color-signal-blue)" : "var(--border-default)"};background:${on ? "var(--color-signal-blue-soft)" : "var(--surface-card)"};color:${on ? "var(--color-info-blue)" : "var(--color-slate-blue)"}">${escapeHtml(l)}</button>`;
      })
      .join("")}</div>`;
  }

  function subNav(active) {
    const R = window.HKRoutes || { mypage: "/mypage", profile: "/profile" };
    const items = [
      ["res", "예약 내역", R.mypage],
      ["profile", "계정", R.profile],
    ];
    return `<div style="display:flex;gap:4px;border-bottom:1px solid var(--border-default);margin-bottom:28px">${items
      .map(
        ([k, label, href]) =>
          `<a href="${href}" style="padding:12px 4px;margin-right:20px;text-decoration:none;font-size:15.5px;font-weight:600;border-bottom:2px solid ${active === k ? "var(--color-signal-blue)" : "transparent"};margin-bottom:-1px;color:${active === k ? "var(--color-signal-blue)" : "var(--text-secondary)"}">${label}</a>`
      )
      .join("")}</div>`;
  }

  function emptyState({ iconName = "inbox", title, desc, actionHtml = "" }) {
    return `<div style="text-align:center;padding:28px 12px">
      <div style="width:56px;height:56px;border-radius:999px;background:var(--color-fog);display:inline-flex;align-items:center;justify-content:center;margin-bottom:14px">${icon(iconName, 28, "var(--color-slate-blue)")}</div>
      <div style="font-size:17px;font-weight:700;color:var(--color-midnight-navy);margin-bottom:6px">${escapeHtml(title)}</div>
      ${desc ? `<div style="font-size:14.5px;color:var(--text-secondary);line-height:1.6;margin-bottom:${actionHtml ? 16 : 0}px">${desc}</div>` : ""}
      ${actionHtml || ""}
    </div>`;
  }

  function legend(color, border, label, dashed = false) {
    const swatch = dashed
      ? "width:14px;height:14px;border-radius:4px;border:1.5px dashed var(--border-default);background:transparent"
      : `width:14px;height:14px;border-radius:4px;background:${color};border:1px solid ${border}`;
    return `<span style="font-size:12.5px;color:var(--text-secondary);display:flex;align-items:center;gap:6px"><span style="${swatch}"></span>${escapeHtml(label)}</span>`;
  }

  function statCard(iconName, n, label, tint) {
    return `<div class="hk-card hk-card--pad"><div class="hk-stat-row">
      <div class="hk-stat-icon" style="background:${tint.bg}">${icon(iconName, 22, tint.fg)}</div>
      <div><div style="font-size:28px;font-weight:700;line-height:1;color:var(--color-midnight-navy)">${n}</div>
      <div style="font-size:13px;color:var(--text-secondary);margin-top:4px">${escapeHtml(label)}</div></div>
    </div></div>`;
  }

  function switchRow(label, checked = true, disabled = false) {
    return `<label class="hk-switch"><input type="checkbox" role="switch"${checked ? " checked" : ""}${disabled ? " disabled" : ""}><span class="hk-switch__track"><span class="hk-switch__thumb"></span></span><span>${escapeHtml(label)}</span></label>`;
  }

  function sectionCard(iconName, title, desc, inner) {
    return `<div class="hk-card hk-card--pad hk-section-card">
      <div class="hk-section-card__head">
        <div class="hk-section-card__icon">${icon(iconName, 20, "var(--color-signal-blue)")}</div>
        <div><h2 class="hk-section-card__title">${escapeHtml(title)}</h2>${desc ? `<p class="hk-section-card__desc">${escapeHtml(desc)}</p>` : ""}</div>
      </div>
      ${inner}
    </div>`;
  }

  function readField(label, value, warn = false) {
    return `<div><div style="font-size:12.5px;color:var(--text-muted);margin-bottom:5px">${escapeHtml(label)}</div><div style="font-size:16px;font-weight:600;color:${warn ? "var(--color-warning)" : "var(--color-midnight-navy)"}">${escapeHtml(value)}</div></div>`;
  }

  function fieldInput(label, id, opts = {}) {
    const err = opts.error ? `<div class="hk-field__error">${escapeHtml(opts.error)}</div>` : "";
    const hint = opts.error ? "" : opts.hint ? `<div class="hk-field__hint">${escapeHtml(opts.hint)}</div>` : "";
    const invalid = opts.error ? " hk-field--invalid" : "";
    return `<div class="hk-field${invalid}"><label class="hk-field__label" for="${id}">${escapeHtml(label)}${opts.required ? '<span class="hk-field__req">*</span>' : ""}</label>
      <input class="hk-input" id="${id}" name="${id}" type="${opts.type || "text"}" placeholder="${escapeHtml(opts.placeholder || "")}" value="${escapeHtml(opts.value || "")}" ${opts.disabled ? "disabled" : ""} ${opts.maxLength ? `maxlength="${opts.maxLength}"` : ""} ${opts.inputMode ? `inputmode="${opts.inputMode}"` : ""}>
      ${hint}${err}</div>`;
  }

  function fieldSelect(label, id, options, opts = {}) {
    const err = opts.error ? `<div class="hk-field__error">${escapeHtml(opts.error)}</div>` : "";
    const hint = opts.error ? "" : opts.hint ? `<div class="hk-field__hint">${escapeHtml(opts.hint)}</div>` : "";
    const invalid = opts.error ? " hk-field--invalid" : "";
    const nameAttr = opts.readonly ? "" : ` name="${id}"`;
    return `<div class="hk-field${invalid}"><label class="hk-field__label" for="${id}">${escapeHtml(label)}${opts.required ? '<span class="hk-field__req">*</span>' : ""}</label>
      <select class="hk-select" id="${id}"${nameAttr}${opts.disabled ? " disabled" : ""}>${options.map(([v, t]) => `<option value="${escapeHtml(v)}"${opts.value === v ? " selected" : ""}>${escapeHtml(t)}</option>`).join("")}</select>
      ${hint}${err}</div>`;
  }

  const WEEKDAY_OPTIONS = [["mon", "월요일"], ["tue", "화요일"], ["wed", "수요일"], ["thu", "목요일"], ["fri", "금요일"]];

  function normDow(value) {
    if (!value) return "wed";
    const lower = String(value).toLowerCase();
    if (WEEKDAY_OPTIONS.some(([v]) => v === lower)) return lower;
    const map = { mon: "mon", tue: "tue", wed: "wed", thu: "thu", fri: "fri" };
    return map[String(value).slice(0, 3).toLowerCase()] || "wed";
  }

  function dowToApi(value) {
    return normDow(value).toUpperCase();
  }

  function parseTime24(value) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(value || "09:00").trim());
    if (!m) return { period: "AM", hour: 9, minute: 0 };
    let h24 = Number(m[1]);
    const minute = Number(m[2]);
    const period = h24 >= 12 ? "PM" : "AM";
    let hour = h24 % 12;
    if (hour === 0) hour = 12;
    return { period, hour, minute };
  }

  function toTime24(period, hour12, minute) {
    let h = Number(hour12) % 12;
    if (period === "PM") h += 12;
    if (period === "AM" && Number(hour12) === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${String(Number(minute)).padStart(2, "0")}`;
  }

  function fieldTimeAmPm(label, name, value, opts = {}) {
    const { period, hour, minute } = parseTime24(value);
    const disabled = opts.disabled ? " disabled" : "";
    const hint = opts.hint ? `<div class="hk-field__hint">${escapeHtml(opts.hint)}</div>` : "";
    const hours = Array.from({ length: 12 }, (_, i) => i + 1);
    const minutes = opts.minuteStep === 1
      ? Array.from({ length: 60 }, (_, i) => i)
      : [0, 30];
    const hiddenName = opts.readonly ? "" : ` name="${name}"`;
    const hiddenDisabled = opts.disabled ? " disabled" : "";
    return `<div class="hk-field hk-time-field" data-time-field="${opts.readonly ? "" : name}">
      <label class="hk-field__label">${escapeHtml(label)}</label>
      <div class="hk-time-field__parts">
        <select class="hk-select hk-select--time" data-time-part="period"${disabled}>
          <option value="AM"${period === "AM" ? " selected" : ""}>오전</option>
          <option value="PM"${period === "PM" ? " selected" : ""}>오후</option>
        </select>
        <select class="hk-select hk-select--time" data-time-part="hour"${disabled} aria-label="시">
          ${hours.map((h) => `<option value="${h}"${h === hour ? " selected" : ""}>${h}</option>`).join("")}
        </select>
        <select class="hk-select hk-select--time" data-time-part="minute"${disabled} aria-label="분">
          ${minutes.map((m) => `<option value="${m}"${m === minute ? " selected" : ""}>${String(m).padStart(2, "0")}</option>`).join("")}
        </select>
      </div>
      <input type="hidden"${hiddenName} value="${escapeHtml(toTime24(period, hour, minute))}" data-time-hidden${hiddenDisabled}>
      ${hint}
    </div>`;
  }

  function bindTimeAmPmFields(root) {
    (root || document).querySelectorAll("[data-time-field]").forEach((wrap) => {
      const hidden = wrap.querySelector("[data-time-hidden]");
      if (!hidden || !hidden.name) return;
      const sync = () => {
        const period = wrap.querySelector('[data-time-part="period"]').value;
        const hour = wrap.querySelector('[data-time-part="hour"]').value;
        const minute = wrap.querySelector('[data-time-part="minute"]').value;
        hidden.value = toTime24(period, hour, minute);
      };
      wrap.querySelectorAll("[data-time-part]").forEach((el) => {
        el.onchange = sync;
      });
    });
  }

  function stepper(step) {
    const items = [["이메일 인증", "mail"], ["기본 정보", "user-round"], ["완료", "check"]];
    return `<div style="display:flex;align-items:center;justify-content:center;gap:0;margin-bottom:28px">${items
      .map(([label, iconName], i) => {
        const done = i < step;
        const active = i === step;
        const bg = done ? "var(--color-success)" : active ? "var(--color-signal-blue)" : "var(--color-fog)";
        const color = done || active ? "#fff" : "var(--color-steel-blue)";
        const labelColor = active ? "var(--color-midnight-navy)" : done ? "var(--color-success)" : "var(--text-muted)";
        const line = i < items.length - 1 ? `<div style="width:36px;height:2px;background:${i < step ? "var(--color-success)" : "var(--border-default)"};margin:0 12px"></div>` : "";
        return `<div style="display:flex;align-items:center;gap:9px"><div style="width:30px;height:30px;border-radius:999px;display:flex;align-items:center;justify-content:center;background:${bg};color:${color};font-weight:700;font-size:13px">${done ? icon("check", 16, "#fff") : i + 1}</div><span style="font-size:14px;font-weight:600;color:${labelColor}">${label}</span></div>${line}`;
      })
      .join("")}</div>`;
  }

  function legacyUsageCard(r) {
    const d = new Date(r.usageDate + "T12:00:00");
    const dow = DAY_NAMES[d.getDay()];
    const month = d.getMonth() + 1;
    const dayNum = d.getDate();
    const end = r.endTime || r.startTime;
    return `<div class="hk-card hk-card--pad" style="padding:11px 14px">
      <div style="display:flex;align-items:center;gap:14px">
        <div style="width:50px;min-width:50px;padding:7px 0;border-radius:10px;background:var(--color-fog);display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0;text-align:center">
          <div style="font-size:10px;font-weight:600;color:var(--color-slate-blue);line-height:1">${month}월</div>
          <div style="font-size:20px;font-weight:700;color:var(--color-midnight-navy);line-height:1.05;margin:4px 0 3px;font-variant-numeric:tabular-nums">${dayNum}</div>
          <div style="font-size:10px;font-weight:600;color:var(--text-muted);line-height:1">${dow}</div>
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:16px;font-weight:700;color:var(--color-midnight-navy);line-height:1.3">${escapeHtml(r.startTime)} – ${escapeHtml(end)}</div>
        </div>
        ${badge("이용 완료", "soft")}
      </div>
    </div>`;
  }

  function reservationCard(r, opts = {}) {
    const reapplyAvailable = !!opts.reapplyAvailable;
    const muted = r.status === "CANCELLED";
    const dow = DAY_NAMES[new Date(r.slotDate + "T12:00:00").getDay()];
    const dayNum = formatDateShort(r.slotDate).split("/")[1] || formatDateShort(r.slotDate);
    let sub = "일반 신청 · 확정 대기";
    if (r.status === "DROPPED") sub = reapplyAvailable ? "탈락 — 재신청 가능" : "탈락";
    else if (r.type === "REAPPLY") sub = "재신청 · 즉시 확정 (취소 불가)";
    else if (r.status === "CONFIRMED") sub = "일반 신청 · 예약 확정";
    else if (r.status === "CANCELLED") sub = "취소됨";
    const reapplyBadge = r.type === "REAPPLY" ? badge("재신청", "info") + " " : "";
    let action = `<span style="width:1px"></span>`;
    if (r.cancelable) action = `<button type="button" class="hk-btn hk-btn--secondary hk-btn--sm" data-cancel="${r.id}">취소</button>`;
    else if (r.status === "DROPPED" && reapplyAvailable) action = `<a href="${(window.HKRoutes || { reapply: "/reapply" }).reapply}"><button type="button" class="hk-btn hk-btn--primary hk-btn--sm">재신청</button></a>`;
    return `<div class="hk-card hk-card--pad" style="opacity:${muted ? 0.7 : 1}">
      <div style="display:flex;align-items:center;gap:16px">
        <div style="width:50px;height:50px;border-radius:10px;background:${muted ? "var(--color-fog)" : "var(--color-signal-blue-soft)"};display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0">
          <span style="font-size:16px;font-weight:700;color:${muted ? "var(--text-muted)" : "var(--color-info-blue)"};line-height:1">${dayNum}</span>
          <span style="font-size:11px;color:${muted ? "var(--text-muted)" : "var(--color-slate-blue)"}">${dow}</span>
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:17px;font-weight:700;color:var(--color-midnight-navy)">${escapeHtml(r.startTime)} – ${escapeHtml(r.endTime)}</div>
          <div style="font-size:13px;color:var(--text-secondary);margin-top:2px;display:flex;align-items:center;gap:6px">${reapplyBadge}${sub}</div>
        </div>
        ${statusBadge(r.status)}
        ${action}
      </div>
    </div>`;
  }

  function mailPreviewVars(origin, mailType) {
    const base = origin || (typeof window !== "undefined" ? window.location.origin : "");
    const chip =
      "display:inline-block; margin:0 6px 6px 0; padding:6px 12px; background:#ffffff; border:1px solid #d4e0ed; border-radius:999px; font-size:13px; color:#0b3558;";
    const slots =
      `<span style="${chip}">화 6/23 · 13:30</span>` +
      `<span style="${chip}">화 6/23 · 15:30</span>` +
      `<span style="${chip}">목 6/25 · 14:30</span>` +
      `<span style="${chip}">목 6/25 · 16:30</span>` +
      `<span style="${chip}">금 6/26 · 13:30</span>` +
      `<span style="${chip}">금 6/26 · 15:30</span>`;
    const common = {
      이름: "김민수",
      name: "김민수",
      logoUrl: base + "/assets/logo-lockup.svg",
      mypageUrl: base + "/api/mypage/enter",
      reapplyUrl: base + "/api/reapply/enter",
      재신청시작: "목요일 09:00",
      reapplyOpenAt: "목요일 09:00",
      재신청마감: "내일(목요일) 17:00",
      reapplyDeadline: "내일(목요일) 17:00",
      빈슬롯목록: "화 6/23 · 13:30, 목 6/25 · 14:30",
      emptySlots: "화 6/23 · 13:30, 목 6/25 · 14:30",
      빈슬롯목록Html: slots,
      emptySlotsHtml: slots,
    };
    if (mailType === "RESERVE_DONE_REAPPLY") {
      return {
        ...common,
        날짜: "6월 25일 (목)",
        slotDate: "6월 25일 (목)",
        시간: "14:30 – 15:00",
        slotTime: "14:30 – 15:00",
      };
    }
    return {
      ...common,
      날짜: "6월 23일 (화)",
      slotDate: "6월 23일 (화)",
      시간: "15:30 – 16:00",
      slotTime: "15:30 – 16:00",
    };
  }

  function _normalizeMailPlain(text) {
    return (text || "").replace(/\r\n/g, "\n").trim().replace(/\s+/g, " ");
  }

  const MAIL_STRUCTURAL_PREFIXES = [
    "날짜:",
    "시간:",
    "일시:",
    "비어있는 슬롯:",
    "재신청 시작:",
    "재신청 마감:",
  ];

  /** 편집 가능 본문(HK_INTRO)만 추출 — · 안내 줄·구조 줄 제외 */
  function _mailIntroOnly(text) {
    const intro = [];
    (text || "").replace(/\r\n/g, "\n").split("\n").forEach((ln) => {
      const s = ln.trim();
      if (!s) return;
      if (s.startsWith("·")) return;
      if (MAIL_STRUCTURAL_PREFIXES.some((p) => s.startsWith(p))) return;
      intro.push(ln.trimEnd());
    });
    return intro.join("\n").trim();
  }

  function _plainToBodyHtml(text) {
    const lines = (text || "").replace(/\r\n/g, "\n").trim().split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return "";
    const parts = [];
    lines.forEach((line, idx) => {
      const m = line.match(/^(안녕하세요,?\s*)\{이름\}(님\.?)$/);
      if (idx === 0 && m) {
        parts.push(
          `<p style="margin:0 0 8px;font-size:16px;line-height:1.7;color:#0a0a0a;">${escapeHtml(m[1])}<strong style="color:#0b3558;">{이름}${escapeHtml(m[2])}</strong></p>`
        );
        return;
      }
      const esc = escapeHtml(line);
      const color = idx === 0 ? "#0a0a0a" : "#476788";
      const margin = idx < lines.length - 1 ? "0 0 8px" : "0";
      parts.push(`<p style="margin:${margin};font-size:16px;line-height:1.7;color:${color};">${esc}</p>`);
    });
    return parts.join("");
  }

  function isMailIntroDefault(plain, defaultPlain) {
    return _normalizeMailPlain(_mailIntroOnly(plain)) === _normalizeMailPlain(_mailIntroOnly(defaultPlain));
  }

  function shouldUseExportPreview(plain, defaultPlain) {
    return isMailIntroDefault(plain, defaultPlain);
  }

  function isMailBodyDefault(plain, defaultPlain) {
    return shouldUseExportPreview(plain, defaultPlain);
  }

  /** DB·구버전 본문 → 본문(HK_INTRO)만 */
  function normalizeMailBodyForEditor(plain, defaultPlain) {
    const intro = _mailIntroOnly(plain);
    if (isMailIntroDefault(intro, defaultPlain)) return defaultPlain;
    return intro || defaultPlain;
  }

  /** export 디자인 HTML + 본문 plain → 미리보기 (안내 박스는 HTML 고정) */
  function applyMailBodyPlainToDesign(html, plain, defaultPlain) {
    if (!html || html.indexOf("<!--HK_INTRO-->") === -1) return html;
    const defIntro = _mailIntroOnly(defaultPlain || "");
    const intro = _mailIntroOnly(plain || "");
    let out = html;

    if (intro && _normalizeMailPlain(intro) !== _normalizeMailPlain(defIntro)) {
      out = out.replace(/<!--HK_INTRO-->[\s\S]*?<!--HK_INTRO_END-->/, _plainToBodyHtml(intro));
    }
    return out.replace(/<!--HK_[A-Z_]+(?:_END)?-->/g, "");
  }

  function applyMailPreviewVars(html, origin, mailType) {
    let out = html;
    Object.entries(mailPreviewVars(origin, mailType)).forEach(([key, value]) => {
      out = out.split("{" + key + "}").join(value);
    });
    return out;
  }

  /** 미리보기 HTML — 링크·에셋 절대화 + 새 탭 강제 (blob iframe 기준 URL 오류 방지) */
  function prepareMailPreviewHtml(html, origin, mailType, skipVars) {
    const base = origin || window.location.origin;
    const tgt = ' target="_blank" rel="noopener noreferrer"';
    let out = skipVars ? html : applyMailPreviewVars(html, base, mailType);

    out = out.replace(/src="\/assets\//g, `src="${base}/assets/`).replace(
      /src='\/assets\//g,
      `src='${base}/assets/`
    );

    const appLinks = {
      "/mypage": base + "/api/mypage/enter",
      "/reapply": base + "/api/reapply/enter",
    };
    Object.entries(appLinks).forEach(([path, abs]) => {
      [path, abs].forEach((href) => {
        const esc = href.replace(/\//g, "\\/");
        out = out.replace(new RegExp(`href="${esc}"(?![^>]*target=)`, "gi"), `href="${abs}"${tgt}`);
        out = out.replace(new RegExp(`href='${esc}'(?![^>]*target=)`, "gi"), `href="${abs}"${tgt}`);
      });
    });

    out = out.replace(
      /<a href="#"([^>]*>)([^<]*(?:내 예약|재신청|빈 슬롯)[^<]*)<\/a>/gi,
      (_m, attrs, text) => {
        const dest = /재신청|빈 슬롯/.test(text) ? base + "/api/reapply/enter" : base + "/api/mypage/enter";
        return `<a href="${dest}"${tgt}${attrs}${text}</a>`;
      }
    );

    const linkScript = `<script>(function(){document.addEventListener("click",function(e){var a=e.target.closest("a[href]");if(!a)return;var raw=a.getAttribute("href");if(!raw||raw==="#")return;e.preventDefault();e.stopPropagation();var top=window.top||window;var opened=top.open(a.href,"_blank","noopener,noreferrer");if(!opened){top.location.href=a.href;}},true);})();<\/script>`;
    out = out.includes("</body>") ? out.replace(/<\/body>/i, linkScript + "</body>") : out + linkScript;

    return out;
  }

  function mountMailPreviewIframe(wrap, html, origin, mailType, skipVars, directSrc) {
    const iframe = document.createElement("iframe");
    iframe.title = "메일 미리보기";
    iframe.style.cssText = "width:100%;height:100%;border:none;display:block";
    iframe.sandbox = "allow-scripts allow-popups allow-popups-to-escape-sandbox allow-same-origin";
    if (directSrc) {
      iframe.src = directSrc + (directSrc.includes("?") ? "&" : "?") + "t=" + Date.now();
      wrap.replaceChildren(iframe);
      return () => {};
    }
    const prepared = prepareMailPreviewHtml(html, origin, mailType, skipVars);
    const blob = new Blob([prepared], { type: "text/html;charset=utf-8" });
    const blobUrl = URL.createObjectURL(blob);
    iframe.src = blobUrl;
    wrap.replaceChildren(iframe);
    return () => URL.revokeObjectURL(blobUrl);
  }

  function openMailPreviewHtml(html, origin, mailType, skipVars, directSrc) {
    if (directSrc) {
      window.open(directSrc + (directSrc.includes("?") ? "&" : "?") + "t=" + Date.now(), "_blank", "noopener,noreferrer");
      return;
    }
    const prepared = prepareMailPreviewHtml(html, origin, mailType, skipVars);
    const blob = new Blob([prepared], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank", "noopener,noreferrer");
    if (win) win.addEventListener("load", () => URL.revokeObjectURL(url), { once: true });
    else URL.revokeObjectURL(url);
  }

  function paginationBar(meta, opts = {}) {
    const page = meta.page || 1;
    const totalPages = meta.totalPages || 0;
    const total = meta.total ?? 0;
    const pageSize = meta.pageSize || 10;
    if (totalPages <= 1) {
      if (total <= pageSize) return "";
      return `<p style="margin:16px 0 0;font-size:13px;color:var(--text-muted);text-align:center">총 ${total}건</p>`;
    }
    const id = opts.id || "hk-pager";
    const start = (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, total);
    const btn = (p, label, disabled, active) =>
      `<button type="button" class="hk-btn hk-btn--${active ? "primary" : "secondary"} hk-btn--sm" data-page="${p}" ${disabled ? "disabled" : ""} style="min-width:36px">${label}</button>`;
    let pages = "";
    const windowSize = 5;
    let from = Math.max(1, page - Math.floor(windowSize / 2));
    let to = Math.min(totalPages, from + windowSize - 1);
    from = Math.max(1, to - windowSize + 1);
    for (let p = from; p <= to; p += 1) {
      pages += btn(p, String(p), false, p === page);
    }
    return `<nav id="${id}" aria-label="예약 내역 페이지" style="margin-top:20px;display:flex;flex-direction:column;align-items:center;gap:12px">
      <p style="margin:0;font-size:13px;color:var(--text-muted)">${start}–${end} / 총 ${total}건</p>
      <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;align-items:center">
        ${btn(page - 1, "이전", page <= 1, false)}
        ${pages}
        ${btn(page + 1, "다음", page >= totalPages, false)}
      </div>
    </nav>`;
  }

  function bindPagination(container, meta, onPage) {
    if (!container) return;
    container.querySelectorAll("[data-page]").forEach((btn) => {
      btn.onclick = () => {
        const next = Number(btn.dataset.page);
        if (!next || next === meta.page || next < 1 || next > meta.totalPages) return;
        onPage(next);
      };
    });
  }

  return {
    STATE_BANNER,
    STATUS_LABEL,
    ADMIN_NAV_ICONS,
    escapeHtml,
    formatDate,
    formatDateLong,
    formatDateShort,
    nowKst,
    formatTimeKst,
    formatDateTimeKst,
    formatDeadlineRelative,
    getStateBanner,
    formatDateDotKst,
    addMin,
    endT,
    loadLucide,
    refreshIcons,
    icon,
    badge,
    alertBox,
    toast,
    confirmDialog,
    layerModal,
    avatar,
    statusBadge,
    queryParam,
    msLogo,
    kv,
    kvTooltip,
    bindTooltips,
    PRIORITY_TOOLTIP_HTML,
    APPLY_TOTAL_TOOLTIP_HTML,
    USAGE_TOTAL_TOOLTIP_HTML,
    teamsBadge,
    demoToggle,
    subNav,
    emptyState,
    legend,
    statCard,
    switchRow,
    sectionCard,
    readField,
    fieldInput,
    fieldSelect,
    fieldTimeAmPm,
    bindTimeAmPmFields,
    parseTime24,
    toTime24,
    normDow,
    dowToApi,
    WEEKDAY_OPTIONS,
    stepper,
    legacyUsageCard,
    reservationCard,
    mailPreviewVars,
    applyMailPreviewVars,
    applyMailBodyPlainToDesign,
    isMailBodyDefault,
    shouldUseExportPreview,
    normalizeMailBodyForEditor,
    prepareMailPreviewHtml,
    mountMailPreviewIframe,
    openMailPreviewHtml,
    paginationBar,
    bindPagination,
  };
})();
