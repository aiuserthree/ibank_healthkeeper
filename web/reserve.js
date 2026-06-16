/** 예약하기 페이지 — API 시스템 상태·차주 캘린더 연동 */
(function () {
  const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
  let calendar = null;
  let systemState = "BEFORE_OPEN";
  let selected = null;

  function groupSlots(slots) {
    const byDate = {};
    for (const s of slots) {
      (byDate[s.slotDate] ||= []).push(s);
    }
    const dates = Object.keys(byDate).sort();
    return dates.map((d) => ({ date: d, slots: byDate[d].sort((a, b) => a.timeIndex - b.timeIndex) }));
  }

  function isOpen() {
    return systemState === "OPEN";
  }

  function hasWeekApplied() {
    return !!calendar?.weekApplied;
  }

  function syncAppliedSelection() {
    if (!hasWeekApplied()) return;
    const applied =
      (calendar.appliedSlotId && calendar.slots.find((s) => s.id === calendar.appliedSlotId)) ||
      calendar.slots.find((s) => s.mine) ||
      null;
    if (applied) selected = applied;
  }

  function slotClass(s, sel) {
    if (s.isVacation || s.confirmed) return "disabled";
    if (s.mine) return "selected";
    if (hasWeekApplied()) return "disabled";
    if (sel && sel.id === s.id) return "selected";
    if (!isOpen()) return "disabled";
    return "available";
  }

  function slotMeta(s) {
    if (s.isVacation) return "휴가";
    if (s.confirmed) return "확정됨";
    if (s.mine) return "내 신청";
    if (hasWeekApplied() && isOpen()) return "신청 불가";
    if (!isOpen()) return "신청 불가";
    if (s.requestCount > 0) return `신청자 ${s.requestCount}명`;
    return "예약 가능";
  }

  function renderBanner() {
    const el = document.getElementById("state-banner");
    if (isOpen() && hasWeekApplied()) {
      el.innerHTML = "";
      el.style.display = "none";
    } else {
      el.style.display = "";
      const banner = HKUI.STATE_BANNER[systemState] || HKUI.STATE_BANNER.CLOSED;
      el.innerHTML = HKUI.alertBox(banner.variant, banner.title, banner.body);
    }
    document.getElementById("reapply-link").style.display = systemState === "REAPPLY" ? "block" : "none";
  }

  function renderGrid() {
    const el = document.getElementById("calendar-grid");
    if (!calendar?.slots?.length) {
      const desc =
        systemState === "BEFORE_OPEN"
          ? "수요일 09:00에 차주 예약이 오픈됩니다."
          : "다음 오픈을 기다려 주세요.";
      el.innerHTML = HKUI.emptyState({
        iconName: "calendar-x",
        title: "예약 가능한 슬롯이 없습니다",
        desc,
      });
      return;
    }
    const days = groupSlots(calendar.slots);
    el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px">${days
      .map((day) => {
        const d = new Date(day.date + "T12:00:00");
        const label = `${d.getMonth() + 1}/${d.getDate()}`;
        const dow = DAY_NAMES[d.getDay()];
        const allVacation = day.slots.every((s) => s.isVacation);
        return `<div>
          <div style="text-align:center;margin-bottom:10px">
            <div style="font-size:15px;font-weight:700;color:${allVacation ? "var(--text-muted)" : "var(--color-midnight-navy)"}">${dow}</div>
            <div style="font-size:12px;color:var(--text-muted)">${label}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${
              allVacation
                ? `<div style="text-align:center;padding:30px 0;border:1.5px dashed var(--border-default);border-radius:var(--radius-sm);color:var(--text-muted);font-size:13">${HKUI.icon("palmtree", 18, "var(--color-steel-blue)")}<div style="margin-top:4px">휴가</div></div>`
                : day.slots
                    .map((s) => {
                      const cls = slotClass(s, selected);
                      const disabled = cls === "disabled" || s.mine || s.confirmed || (hasWeekApplied() && !s.mine);
                      return `<button type="button" class="hk-slot${cls === "selected" ? " hk-slot--selected" : ""}${cls === "disabled" ? " hk-slot--disabled" : ""}${s.confirmed ? " hk-slot--confirmed" : ""}" data-id="${s.id}" ${disabled ? "disabled" : ""} style="width:100%">
                        <span class="hk-slot__time">${s.startTime}</span>
                        <span class="hk-slot__meta">${slotMeta(s)}</span>
                      </button>`;
                    })
                    .join("")
            }
          </div>
        </div>`;
      })
      .join("")}</div>
      <div style="display:flex;gap:18px;margin-top:16px;padding-top:14px;border-top:1px solid var(--color-mist);flex-wrap:wrap">
        ${HKUI.legend("var(--surface-card)", "var(--border-default)", "예약 가능")}
        ${HKUI.legend("var(--color-signal-blue)", "var(--color-signal-blue)", "선택")}
        ${HKUI.legend("", "", "휴가 · 신청 불가", true)}
        <span style="font-size:12.5px;color:var(--text-secondary);display:flex;align-items:center;gap:6px">${HKUI.icon("users", 14, "var(--color-warning)")} 신청자 n명 = 우선권 경합</span>
      </div>`;

    el.querySelectorAll("[data-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        const id = Number(btn.dataset.id);
        const slot = calendar.slots.find((s) => s.id === id);
        if (!slot || slot.isVacation || slot.confirmed) return;
        if (hasWeekApplied() && !slot.mine) return;
        if (!isOpen()) return;
        selected = slot;
        renderGrid();
        renderSummary();
        HKUI.refreshIcons();
      });
    });
    HKUI.refreshIcons();
  }

  function renderSummary() {
    const el = document.getElementById("summary");
    if (hasWeekApplied()) syncAppliedSelection();
    if (!selected) {
      const hint = hasWeekApplied()
        ? "이번 주는 <b>한 타임만</b> 신청할 수 있어요. 마이페이지에서 신청 내역을 확인하세요."
        : isOpen()
          ? "캘린더에서 원하는 날짜·시간을 선택하세요."
          : systemState === "BEFORE_OPEN"
            ? "현재 예약 오픈 전입니다.<br>수요일 09:00에 차주 예약이 시작됩니다."
            : systemState === "REAPPLY"
              ? "재신청 기간에는 전용 재신청 화면을 이용해 주세요."
              : "현재 예약 신청 기간이 아닙니다.";
      el.innerHTML = `<div style="color:var(--text-secondary);font-size:14px;line-height:1.6;padding:8px 0 4px">${hint}</div>`;
      HKUI.refreshIcons();
      return;
    }
    const d = new Date(selected.slotDate + "T12:00:00");
    const dow = DAY_NAMES[d.getDay()];
    if (selected.mine || hasWeekApplied()) {
      el.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">${HKUI.icon("calendar-days", 20, "var(--color-signal-blue)")}<span style="font-size:18px;font-weight:700;color:var(--color-midnight-navy)">${HKUI.formatDateShort(selected.slotDate)} (${dow})</span></div>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px">${HKUI.icon("clock", 20, "var(--color-signal-blue)")}<span style="font-size:18px;font-weight:700;color:var(--color-midnight-navy)">${selected.startTime} – ${selected.endTime}</span></div>
        ${HKUI.alertBox("info", "이번 주 신청 완료", "한 주에 한 타임만 신청할 수 있어요. 마감 전까지 마이페이지에서 취소 후 다른 시간으로 다시 신청할 수 있습니다.")}
        <a href="${HKRoutes.mypage}" style="display:block;margin-top:16px"><button type="button" class="hk-btn hk-btn--secondary hk-btn--block">예약 내역 보기</button></a>`;
      HKUI.refreshIcons();
      return;
    }
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">${HKUI.icon("calendar-days", 20, "var(--color-signal-blue)")}<span style="font-size:18px;font-weight:700;color:var(--color-midnight-navy)">${HKUI.formatDateShort(selected.slotDate)} (${dow})</span></div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px">${HKUI.icon("clock", 20, "var(--color-signal-blue)")}<span style="font-size:18px;font-weight:700;color:var(--color-midnight-navy)">${selected.startTime} – ${selected.endTime}</span></div>
      ${selected.requestCount > 0 ? `<div style="margin-bottom:16px">${HKUI.alertBox("warning", `다른 신청자 ${selected.requestCount}명`, "마감 시점에 <b>우선권(마지막 이용일)</b>에 따라 확정됩니다.")}</div>` : ""}
      <button type="button" class="hk-btn hk-btn--primary hk-btn--block" id="apply-btn">예약 신청하기</button>
      <p style="font-size:12px;color:var(--text-muted);margin-top:12px;line-height:1.5;margin-bottom:0">신청은 마감(수 17:00) 전까지 취소할 수 있어요. <b>신청 ≠ 확정</b> — 관리자 확정 후 완료됩니다.</p>`;
    HKUI.refreshIcons();
    document.getElementById("apply-btn").onclick = async () => {
      if (!isOpen()) {
        HKUI.toast("현재 예약 신청 기간이 아닙니다.", "danger");
        return;
      }
      if (hasWeekApplied()) {
        HKUI.toast("이번 주는 한 타임만 신청할 수 있습니다.", "danger");
        return;
      }
      const ok = await HKUI.confirmDialog(
        "예약을 신청할까요?",
        `${HKUI.formatDateShort(selected.slotDate)}(${dow}) <b>${selected.startTime} – ${selected.endTime}</b> 타임으로 신청합니다. 확정은 관리자 처리 후 완료되며, 완료 메일을 보내드려요.`
      );
      if (!ok) return;
      try {
        await HKApi.applySlot(selected.id);
        calendar.weekApplied = true;
        calendar.appliedSlotId = selected.id;
        calendar.slots = calendar.slots.map((s) => ({ ...s, mine: s.id === selected.id }));
        selected = calendar.slots.find((s) => s.id === calendar.appliedSlotId) || null;
        HKUI.toast("예약 신청이 완료되었습니다");
        renderBanner();
        renderGrid();
        renderSummary();
      } catch (e) {
        if (e.code === "WEEK_APPLY_LIMIT") {
          calendar.weekApplied = true;
          syncAppliedSelection();
          renderBanner();
          renderGrid();
          renderSummary();
          HKUI.toast(e.message, "danger");
        } else {
          HKUI.toast(e.message, "danger");
        }
      }
    };
  }

  function renderWeekLabel() {
    const dates = groupSlots(calendar?.slots || []);
    const el = document.getElementById("week-label");
    if (!dates.length) {
      el.textContent = "";
      return;
    }
    const first = new Date(dates[0].date + "T12:00:00");
    const last = new Date(dates[dates.length - 1].date + "T12:00:00");
    el.textContent = `${first.getMonth() + 1}/${first.getDate()}(${DAY_NAMES[first.getDay()]}) – ${last.getMonth() + 1}/${last.getDate()}(${DAY_NAMES[last.getDay()]})`;
  }

  window.HKReservePage = {
    async init() {
      const bannerEl = document.getElementById("state-banner");
      const gridEl = document.getElementById("calendar-grid");
      const summaryEl = document.getElementById("summary");
      try {
        const [sys, cal] = await Promise.all([HKApi.systemState(), HKApi.calendar()]);
        systemState = sys.state;
        calendar = {
          ...cal,
          slots: (cal.slots || []).map((s) => ({ ...s })),
        };
        syncAppliedSelection();
        renderWeekLabel();
        renderBanner();
        renderGrid();
        renderSummary();
        HKUI.refreshIcons();
      } catch (e) {
        if (bannerEl) {
          bannerEl.style.display = "";
          bannerEl.innerHTML = HKUI.alertBox(
            "danger",
            "예약 정보를 불러오지 못했습니다",
            HKUI.escapeHtml(e.message || "잠시 후 다시 시도해 주세요.")
          );
        }
        if (gridEl) {
          gridEl.innerHTML = HKUI.emptyState({
            iconName: "calendar-x",
            title: "캘린더를 표시할 수 없습니다",
            desc: "로그인 상태를 확인하거나 페이지를 새로고침해 주세요.",
            actionHtml: `<button type="button" class="hk-btn hk-btn--secondary" onclick="location.reload()">새로고침</button>`,
          });
        }
        if (summaryEl) {
          summaryEl.innerHTML = `<div style="color:var(--text-secondary);font-size:14px;line-height:1.6;padding:8px 0 4px">오류가 계속되면 로그아웃 후 다시 로그인해 주세요.</div>`;
        }
        HKUI.refreshIcons();
      }
    },
  };
})();
