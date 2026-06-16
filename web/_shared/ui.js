/** UI 헬퍼 — 알림, 토스트, 다이얼로그, 날짜 포맷, 디자인 컴포넌트 */
window.HKUI = (function () {
  const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
  let lucidePromise = null;

  const STATE_BANNER = {
    BEFORE_OPEN: { variant: "info", title: "예약 오픈 전", body: "이번 주 예약은 수요일 09:00에 오픈됩니다." },
    OPEN: {
      variant: "info",
      title: "예약 가능 · 오늘 16:59 마감",
      body: "신청은 접수 후 관리자 확정으로 완료됩니다. 같은 시간에 신청이 몰리면 마지막 이용일이 오래된 분께 우선권이 부여됩니다.",
    },
    REAPPLY: {
      variant: "warning",
      title: "탈락자 재신청 기간 · 내일 17:00까지",
      body: "비어있는 슬롯에 선착순·즉시 확정으로 재신청할 수 있어요. 재신청 건은 취소할 수 없습니다.",
    },
    CLOSED: {
      variant: "danger",
      title: "예약 마감",
      body: "현재 예약 접수 기간이 아닙니다. 다음 오픈: 수요일 09:00",
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

  /** ISO datetime → KST HH:MM */
  function formatTimeKst(iso) {
    if (!iso) return "-";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleTimeString("ko-KR", { timeZone: KST, hour: "2-digit", minute: "2-digit", hour12: false });
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

  function alertBox(variant, title, body) {
    const icons = { info: "info", success: "circle-check-big", warning: "triangle-alert", danger: "circle-x" };
    return `<div class="hk-alert hk-alert--${variant}">
      <div class="hk-alert__icon">${icon(icons[variant] || "info", 20)}</div>
      <div class="hk-alert__body">
        ${title ? `<div class="hk-alert__title">${escapeHtml(title)}</div>` : ""}
        <div>${body}</div>
      </div>
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
      <input type="hidden"${hiddenName} value="${escapeHtml(toTime24(period, hour, minute))}" data-time-hidden>
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

  function reservationCard(r) {
    const muted = r.status === "CANCELLED";
    const dow = DAY_NAMES[new Date(r.slotDate + "T12:00:00").getDay()];
    const dayNum = formatDateShort(r.slotDate).split("/")[1] || formatDateShort(r.slotDate);
    let sub = "일반 신청 · 확정 대기";
    if (r.status === "DROPPED") sub = "탈락 — 재신청 가능";
    else if (r.type === "REAPPLY") sub = "재신청 · 즉시 확정 (취소 불가)";
    else if (r.status === "CONFIRMED") sub = "일반 신청 · 예약 확정";
    else if (r.status === "CANCELLED") sub = "취소됨";
    const reapplyBadge = r.type === "REAPPLY" ? badge("재신청", "info") + " " : "";
    let action = `<span style="width:1px"></span>`;
    if (r.cancelable) action = `<button type="button" class="hk-btn hk-btn--secondary hk-btn--sm" data-cancel="${r.id}">취소</button>`;
    else if (r.status === "DROPPED") action = `<a href="${(window.HKRoutes || { reapply: "/reapply" }).reapply}"><button type="button" class="hk-btn hk-btn--primary hk-btn--sm">재신청</button></a>`;
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
    avatar,
    statusBadge,
    queryParam,
    msLogo,
    kv,
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
    reservationCard,
  };
})();
