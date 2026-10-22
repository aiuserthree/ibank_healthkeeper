/** 예약하기 페이지 — API 시스템 상태·차주 캘린더 연동 */
(function () {
  const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
  let calendar = null;
  let systemState = "BEFORE_OPEN";
  let systemInfo = null;
  let selected = null;
  let memberProfile = null;
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

  function isMySlot(s) {
    if (s.mine) return true;
    if (!hasWeekApplied()) return false;
    const appliedId = calendar?.appliedSlotId;
    return appliedId != null && Number(s.id) === Number(appliedId);
  }

  function syncAppliedSelection() {
    if (!hasWeekApplied()) return;
    const applied =
      (calendar.appliedSlotId != null &&
        calendar.slots.find((s) => Number(s.id) === Number(calendar.appliedSlotId))) ||
      calendar.slots.find((s) => isMySlot(s)) ||
      null;
    if (applied) selected = applied;
  }

  function isSlotClosed(s) {
    return s.isVacation || s.isHoliday || s.confirmed;
  }

  function slotClass(s, sel) {
    if (isSlotClosed(s)) return "disabled";
    if (isMySlot(s)) return "mine";
    if (hasWeekApplied()) return "disabled";
    if (sel && sel.id === s.id) return "selected";
    if (!isOpen()) return "disabled";
    return "available";
  }

  function slotMeta(s, sel) {
    if (s.isHoliday) return "공휴일";
    if (s.isVacation) return "휴가";
    if (s.confirmed) return "확정됨";
    if (isMySlot(s)) return `내 신청 · 신청자 ${s.requestCount || 0}명`;
    if (!isOpen()) return "신청 불가";
    if (sel && sel.id === s.id) return "선택 중";
    return `신청자 ${s.requestCount || 0}명`;
  }

  /** 이번에 쓰일 쿠폰(만료가 가장 빠른 것)의 사용 기한 안내 */
  function couponExpiryNote() {
    const iso = calendar?.couponNextExpiresAt;
    if (!iso) return "";
    // 만료 시각은 다음 날 00:00 — 하루 전 날짜가 마지막 사용일
    const last = new Date(new Date(iso).getTime() - 1);
    const dow = DAY_NAMES[last.getDay()];
    const others = (calendar.couponAvailable || 0) - 1;
    return `<div style="margin-top:10px;padding:10px 12px;border-radius:8px;background:#f6f1ff;font-size:13.5px;color:var(--color-midnight-navy)">${HKUI.icon("calendar-clock", 15, "var(--color-ultraviolet)", "vertical-align:-3px;margin-right:4px")}이번에 쓰는 쿠폰은 <b>${last.getMonth() + 1}/${last.getDate()}(${dow})까지</b> 쓸 수 있어요.${others > 0 ? " 기한이 가장 빠른 쿠폰부터 써요." : ""}</div>`;
  }

  // 쿠폰끼리 겹치면 마지막 이용일로 순서가 정해지므로 본인 날짜를 함께 보여준다 (우선권과 같은 값)
  function couponLastUsedNote() {
    const iso = memberProfile?.lastUsedDate;
    const box = (html) => `<div style="margin-top:8px;padding:10px 12px;border-radius:8px;background:var(--color-mist);font-size:13.5px;color:var(--color-midnight-navy)">${HKUI.icon("history", 15, "var(--color-slate-blue)", "vertical-align:-3px;margin-right:4px")}${html}</div>`;
    if (!iso) return box("아직 이용 기록이 없어요 · 쿠폰끼리 겹쳐도 <b>가장 먼저</b> 확정돼요.");
    const d = new Date(iso + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Math.round((today - d) / 86400000);
    const when = days > 0 ? `${days}일 전` : days === 0 ? "오늘" : "이용 예정";
    return box(`내 마지막 이용일: <b>${d.getMonth() + 1}/${d.getDate()}(${DAY_NAMES[d.getDay()]})</b> · ${when}`);
  }

  function canUseCoupon(s) {
    return calendar?.couponAvailable > 0 && s?.couponAllowed !== false;
  }

  function couponChip(text) {
    return `<span class="hk-badge" style="color:var(--color-ultraviolet);background:#efe8ff">${HKUI.icon("ticket", 13, "currentColor")} ${HKUI.escapeHtml(text)}</span>`;
  }

  function competitorAlert(s) {
    const coupon = s.couponCount || 0;
    if (coupon > 0) {
      return HKUI.alertBox(
        "warning",
        `다른 신청자 ${s.requestCount}명 · 무적 쿠폰 ${coupon}명`,
        "무적 쿠폰 신청이 먼저 확정되고, 쿠폰끼리는 <b>우선권(마지막 이용일)</b> 순서예요."
      );
    }
    return HKUI.alertBox("warning", `다른 신청자 ${s.requestCount}명`, "마감 시점에 <b>우선권(마지막 이용일)</b>에 따라 확정됩니다.");
  }

  function reapplyHasSlots() {
    return calendar?.reapplyEmptySlots == null || calendar.reapplyEmptySlots > 0;
  }

  function renderBanner() {
    const el = document.getElementById("state-banner");
    if (systemState === "REAPPLY" && !reapplyHasSlots()) {
      el.style.display = "";
      el.innerHTML = HKUI.alertBox("danger", "예약 마감", "다음 예약은 수요일 09:00에 오픈됩니다.");
      return;
    }
    if (isOpen() && hasWeekApplied()) {
      el.innerHTML = "";
      el.style.display = "none";
    } else {
      el.style.display = "";
      const banner = HKUI.getStateBanner(systemState, {
        reapplyCloseAt: systemInfo?.reapplyCloseAt,
        closeAt: systemInfo?.closeAt,
      });
      const reapplyAction =
        systemState === "REAPPLY"
          ? `<a href="${HKRoutes.reapply}"><button type="button" class="hk-btn hk-btn--primary hk-btn--sm">재신청 화면으로</button></a>`
          : "";
      el.innerHTML = HKUI.alertBox(banner.variant, banner.title, banner.body, reapplyAction);
    }
  }

  function renderGrid() {
    const el = document.getElementById("calendar-grid");
    if (!calendar?.slots?.length) {
      const desc =
        systemState === "BEFORE_OPEN"
          ? "다음 예약은 수요일 09:00에 오픈됩니다."
          : "다음 예약 오픈을 기다려 주세요.";
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
        const allClosed = day.slots.every((s) => s.isVacation || s.isHoliday);
        const allHoliday = day.slots.every((s) => s.isHoliday);
        return `<div>
          <div style="text-align:center;margin-bottom:10px">
            <div style="font-size:15px;font-weight:700;color:${allClosed ? "var(--text-muted)" : "var(--color-midnight-navy)"}">${dow}</div>
            <div style="font-size:12px;color:var(--text-muted)">${label}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${
              allClosed
                ? `<div style="text-align:center;padding:30px 0;border:1.5px dashed var(--border-default);border-radius:var(--radius-sm);color:var(--text-muted);font-size:13">${HKUI.icon(allHoliday ? "calendar-x" : "palmtree", 18, "var(--color-steel-blue)")}<div style="margin-top:4px">${allHoliday ? "공휴일" : "휴가"}</div></div>`
                : day.slots
                    .map((s) => {
                      const cls = slotClass(s, selected);
                      const disableClick =
                        isSlotClosed(s) ||
                        cls === "mine" ||
                        (hasWeekApplied() && cls !== "mine");
                      return `<button type="button" class="hk-slot${cls === "selected" ? " hk-slot--picking" : ""}${cls === "disabled" ? " hk-slot--disabled" : ""}${cls === "mine" ? " hk-slot--mine" : ""}${s.confirmed ? " hk-slot--confirmed" : ""}" data-id="${s.id}" ${disableClick ? "disabled" : ""} style="width:100%">
                        <span class="hk-slot__time">${s.startTime}</span>
                        <span class="hk-slot__meta">${slotMeta(s, selected)}</span>
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
        ${HKUI.legend("var(--action)", "var(--action)", "내 신청")}
        ${HKUI.legend("var(--color-midnight-navy)", "var(--color-midnight-navy)", "선택 중")}
        ${HKUI.legend("", "", "안마사님 휴가 · 공휴일 · 신청 불가", true)}
        <span style="font-size:12.5px;color:var(--text-secondary);display:flex;align-items:center;gap:6px">${HKUI.icon("users", 14, "var(--color-warning)")} 신청자 n명 = 우선권 경합</span>
      </div>`;

    el.querySelectorAll("[data-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        const id = Number(btn.dataset.id);
        const slot = calendar.slots.find((s) => s.id === id);
        if (!slot || isSlotClosed(slot)) return;
        if (hasWeekApplied() && !slot.mine && !isMySlot(slot)) return;
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
            ? "현재 예약 오픈 전입니다.<br>다음 예약은 수요일 09:00에 시작됩니다."
            : systemState === "REAPPLY" && reapplyHasSlots()
              ? "재신청 기간에는 전용 재신청 화면을 이용해 주세요."
              : "다음 예약은 수요일 09:00에 오픈됩니다.";
      el.innerHTML = `<div style="color:var(--text-secondary);font-size:14px;line-height:1.6;padding:8px 0 4px">${hint}</div>`;
      HKUI.refreshIcons();
      return;
    }
    const d = new Date(selected.slotDate + "T12:00:00");
    const dow = DAY_NAMES[d.getDay()];
    if (selected.mine || isMySlot(selected) || hasWeekApplied()) {
      el.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">${HKUI.icon("calendar-days", 20, "var(--color-signal-blue)")}<span style="font-size:18px;font-weight:700;color:var(--color-midnight-navy)">${HKUI.formatDateShort(selected.slotDate)} (${dow})</span></div>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px">${HKUI.icon("clock", 20, "var(--color-signal-blue)")}<span style="font-size:18px;font-weight:700;color:var(--color-midnight-navy)">${selected.startTime} – ${selected.endTime}</span></div>
        ${calendar?.appliedWithCoupon ? `<div style="margin-bottom:12px">${couponChip("무적 쿠폰 사용 · 우선 확정 대상")}</div>` : ""}
        ${HKUI.alertBox("info", "이번 주 신청 완료", "한 주에 한 타임만 신청할 수 있어요. 마감 전까지 마이페이지에서 취소 후 다른 시간으로 다시 신청할 수 있습니다.")}
        <a href="${HKRoutes.mypage}" style="display:block;margin-top:auto;padding-top:16px"><button type="button" class="hk-btn hk-btn--secondary hk-btn--block">예약 내역 보기</button></a>`;
      HKUI.refreshIcons();
      return;
    }
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">${HKUI.icon("calendar-days", 20, "var(--color-signal-blue)")}<span style="font-size:18px;font-weight:700;color:var(--color-midnight-navy)">${HKUI.formatDateShort(selected.slotDate)} (${dow})</span></div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px">${HKUI.icon("clock", 20, "var(--color-signal-blue)")}<span style="font-size:18px;font-weight:700;color:var(--color-midnight-navy)">${selected.startTime} – ${selected.endTime}</span></div>
      ${selected.requestCount > 0 ? `<div style="margin-bottom:16px">${competitorAlert(selected)}</div>` : ""}
      <div style="margin-top:auto">
        ${canUseCoupon(selected) ? `<div style="margin-bottom:10px">${couponChip(`무적 쿠폰 ${calendar.couponAvailable}장 보유`)}</div>` : ""}
        <button type="button" class="hk-btn hk-btn--primary hk-btn--block" id="apply-btn">예약 신청하기</button>
        <p style="font-size:12px;color:var(--text-muted);margin-top:12px;line-height:1.5;margin-bottom:0">신청은 마감(수 17:00) 전까지 취소할 수 있어요. <b>신청 ≠ 확정</b> — 관리자 확정 후 완료됩니다.</p>
      </div>`;
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
      // 무적 쿠폰 보유자는 사용 여부를 먼저 묻는다.
      let useCoupon = false;
      if (canUseCoupon(selected)) {
        // 안내창을 읽는 동안 최신 신청 현황을 미리 받아 둔다.
        const latestCalendar = HKApi.calendar().catch(() => null);
        useCoupon = await HKUI.confirmDialog(
          "무적 쿠폰을 사용할까요?",
          `${calendar.couponAvailable > 1 ? `보유한 무적 쿠폰 <b>${calendar.couponAvailable}장</b> 중 1장을` : "보유한 무적 쿠폰 <b>1장</b>을"} 사용하면 이 시간대는 <b>일반 신청보다 먼저</b> 확정돼요. 쿠폰을 쓴 사람끼리 겹치면 <b>마지막 이용일이 오래된 분</b>이 확정되고, 지면 쿠폰은 돌아와요.${couponExpiryNote()}${couponLastUsedNote()}<div style="margin-top:10px;font-size:13px;color:var(--text-muted)">쿠폰으로 확정된 예약은 양도·교환할 수 없어요.</div>`,
          { confirmLabel: "쿠폰 사용", cancelLabel: "사용 안 함" }
        );
        // 이 시간대에 이미 쿠폰으로 신청한 사람이 있으면 한 번 더 확인 (최신 신청 현황 기준)
        if (useCoupon) {
          let couponRivals = selected.couponCount || 0;
          const latest = await latestCalendar;
          // 확인 실패 시 화면에 있던 값으로 판단
          const slot = (latest?.slots || []).find((s) => Number(s.id) === Number(selected.id));
          if (slot) couponRivals = slot.couponCount || 0;
          if (couponRivals > 0) {
            useCoupon = await HKUI.confirmDialog(
              "이미 쿠폰을 쓴 신청자가 있어요",
              `이 시간대에 <b>무적 쿠폰을 사용해 신청한 분이 ${couponRivals}명</b> 있어요. 쿠폰끼리는 <b>마지막 이용일이 오래된 분</b>이 확정되고, 지면 쿠폰은 돌아와요.<br>그래도 쿠폰을 사용할까요?`,
              { confirmLabel: "그래도 사용", cancelLabel: "사용 안 함" }
            );
          }
        }
      }
      const ok = await HKUI.confirmDialog(
        "예약을 신청할까요?",
        `${HKUI.formatDateShort(selected.slotDate)}(${dow}) <b>${selected.startTime} – ${selected.endTime}</b> 타임으로 신청합니다.${useCoupon ? " <b>무적 쿠폰</b>을 사용합니다." : ""} 확정은 관리자 처리 후 완료되며, 완료 메일을 보내드려요.`
      );
      if (!ok) return;
      try {
        await HKApi.applySlot(selected.id, useCoupon);
        const cal = await HKApi.calendar();
        calendar = {
          ...cal,
          slots: (cal.slots || []).map((s) => ({ ...s })),
        };
        syncAppliedSelection();
        HKUI.toast("예약이 완료되었습니다", "success", { prominent: true });
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
    async init(profile) {
      memberProfile = profile || null;
      const bannerEl = document.getElementById("state-banner");
      const gridEl = document.getElementById("calendar-grid");
      const summaryEl = document.getElementById("summary");
      try {
        const [sys, cal] = await Promise.all([HKApi.systemState(), HKApi.calendar()]);
        systemState = sys.state;
        systemInfo = sys;
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
