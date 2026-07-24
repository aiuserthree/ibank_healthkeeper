window.HKReservationBoard = (function () {
  const FILTERS = [["all", "전체"], ["REQUESTED", "신청"], ["CONFIRMED", "확정"], ["DROPPED", "탈락"], ["CANCELLED", "취소"]];
  const GRID = "28px minmax(150px,1.5fr) 84px 110px 78px 78px 84px";
  const STATE_LABEL = { OPEN: "예약 가능(OPEN)", BEFORE_OPEN: "오픈 전", REAPPLY: "재신청", CLOSED: "마감" };

  function mount(container, board, vacationDates, showSectionHead) {
    const cycleId = board.cycleId;
    const uid = "b" + cycleId;
    let canConfirm = board.canConfirm !== false;
    const meta = {
      cycleState: board.cycleState,
      weekStart: board.weekStart,
      weekEnd: board.weekEnd,
      openAt: board.openAt,
      closeAt: board.closeAt,
    };
    let boardMeta = {
      canAdminAssign: board.canAdminAssign === true,
      adminAssignFrom: board.adminAssignFrom || null,
      adminAssignUntil: board.adminAssignUntil || null,
    };
    let allSlots = board.slots || [];
    let dates = board.weekDates || [];
    let selectedDate = dates[0] || null;
    let filter = "REQUESTED";
    const offDates = vacationDates;

    const label = board.boardLabel || (meta.weekStart && meta.weekEnd
      ? `${HKUI.formatDate(meta.weekStart)} – ${HKUI.formatDate(meta.weekEnd)}`
      : "신청 현황");
    const sectionHead = showSectionHead
      ? `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:16px">
          <div>
            <div style="font-size:18px;font-weight:700;color:var(--color-midnight-navy)">${HKUI.escapeHtml(label)}</div>
            <div style="font-size:13px;color:var(--text-secondary);margin-top:4px">${HKUI.badge(STATE_LABEL[meta.cycleState] || meta.cycleState || "-", "info", true)}</div>
          </div>
          <button type="button" class="hk-btn hk-btn--secondary hk-btn--sm" data-export-confirmed="${cycleId}">${HKUI.icon("download", 16, "var(--color-midnight-navy)")} 확정자 다운로드</button>
        </div>`
      : `<div style="margin-bottom:8px"><button type="button" class="hk-btn hk-btn--secondary hk-btn--sm" data-export-confirmed="${cycleId}">${HKUI.icon("download", 16, "var(--color-midnight-navy)")} 확정자 다운로드</button></div>`;
    container.innerHTML = `${sectionHead}<div id="${uid}-alerts"></div>
      <div id="${uid}-date-tabs" style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap"></div>
      <div id="${uid}-status-filters" style="display:flex;gap:6px;margin-bottom:20px;flex-wrap:wrap"></div>
      <div id="${uid}-slot-list"></div>`;
    const exportBtn = container.querySelector("[data-export-confirmed]");
    if (exportBtn) {
      exportBtn.onclick = async () => {
        exportBtn.disabled = true;
        try {
          await HKApi.downloadConfirmedExport(cycleId);
          HKUI.toast("확정자 목록을 다운로드했습니다");
        } catch (e) {
          HKUI.toast(e.message, "danger");
        } finally {
          exportBtn.disabled = false;
        }
      };
    }

    function typeBadge(type) {
      if (type === "REAPPLY") return HKUI.badge("재신청", "info");
      if (type === "TRANSFER") return HKUI.badge("양도", "info");
      if (type === "ADMIN_ASSIGN") return HKUI.badge("관리자 지정", "warning");
      return HKUI.badge("일반", "soft");
    }

    /** 관리자 확정취소 가능 타입 (ADMIN_ASSIGN는 별도 지정 취소) */
    function isAdminCancelConfirmedType(type) {
      return type === "NORMAL" || type === "REAPPLY" || type === "TRANSFER";
    }

    function isSlotOff(slot) {
      return slot.isVacation || slot.isHoliday || offDates.has(slot.slotDate);
    }

    function isDesignatedConfirmSlot(slot) {
      return slot.isDesignatedConfirmSlot === true;
    }

    function isEmptyForAssign(slot) {
      const all = slot.applicants || [];
      if (isSlotOff(slot)) return false;
      if (all.some((x) => x.status === "CONFIRMED" || x.status === "REQUESTED")) return false;
      return true;
    }

    function isAdminAssignTarget(slot) {
      return isEmptyForAssign(slot) && slot.adminCancelVacancy === true;
    }

    function isSlotPastForAssign(slot) {
      return HKUI.isSlotPastKst(slot?.slotDate, slot?.startTime);
    }

    function canAssignToSlot(slot) {
      return boardMeta.canAdminAssign && isAdminAssignTarget(slot) && !isSlotPastForAssign(slot);
    }

    function assignSlotHint(slot) {
      if (canAssignToSlot(slot)) {
        return assignBtnHtml(slot.slotId);
      }
      if (isAdminAssignTarget(slot) && isSlotPastForAssign(slot)) {
        return `<span style="font-size:13px;color:var(--text-muted)">예약 시간이 지나 지정할 수 없습니다</span>`;
      }
      if (!boardMeta.canAdminAssign && isAdminAssignTarget(slot)) {
        const from = boardMeta.adminAssignFrom
          ? HKUI.formatDateTimeKst(boardMeta.adminAssignFrom)
          : (meta.closeAt ? HKUI.formatDateTimeKst(meta.closeAt) : "수요일 17:00");
        return `<span style="font-size:13px;color:var(--text-muted)">${from} 이후 지정 가능</span>`;
      }
      if (isEmptyForAssign(slot)) {
        return `<span style="font-size:13px;color:var(--text-muted)">신청 없음</span>`;
      }
      return "";
    }

    function topAlert() {
      let requested = 0;
      let designatedPending = 0;
      for (const slot of allSlots) {
        for (const a of slot.applicants || []) {
          if (a.status === "REQUESTED") requested++;
        }
        if (
          isDesignatedConfirmSlot(slot)
          && !isSlotOff(slot)
          && !(slot.applicants || []).some((x) => x.status === "CONFIRMED")
        ) {
          designatedPending++;
        }
      }
      const state = meta.cycleState;
      if (designatedPending > 0 && canConfirm) {
        return `<div style="margin-bottom:20px">${HKUI.alertBox("warning", "월요일 15:30 · 지정 확정 대기", "월요일 15:30은 <b>관리자 지정</b>으로만 확정합니다. Teams SSO 로그인 직원 중 선택하세요. 미신청자도 지정 가능하며, 지정 시 다른 신청자는 탈락 처리됩니다.")}</div>`;
      }
      if (requested > 0 && state !== "BEFORE_OPEN") {
        if (!canConfirm) {
          const closeText = meta.closeAt ? HKUI.formatDeadlineRelative(meta.closeAt, "17:00") : "수요일 17:00";
          return `<div style="margin-bottom:20px">${HKUI.alertBox("info", "신청 접수 중 · 확정은 마감 후", `일반 신청은 우선권(마지막 이용일 → 신청 시각) 기반입니다. ${closeText} 마감 후 우선권에 따라 자동 확정됩니다.`)}</div>`;
        }
        return `<div style="margin-bottom:20px">${HKUI.alertBox("warning", "확정 대기 중인 신청이 있습니다", "마감 후 우선권(마지막 이용일 → 신청 시각)으로 자동 확정됩니다. 월요일 15:30만 관리자 지정이 필요합니다.")}</div>`;
      }
      if (state === "BEFORE_OPEN" && meta.weekStart && meta.weekEnd) {
        const openText = meta.openAt ? HKUI.formatDateTimeKst(meta.openAt) : "수요일 09:00";
        return `<div style="margin-bottom:20px">${HKUI.alertBox("info", `차주 일정 · ${HKUI.formatDate(meta.weekStart)} – ${HKUI.formatDate(meta.weekEnd)}`, `수요일 09:00 오픈 예정입니다. (${openText})`)}</div>`;
      }
      if (boardMeta.canAdminAssign) {
        const from = boardMeta.adminAssignFrom
          ? HKUI.formatDateTimeKst(boardMeta.adminAssignFrom)
          : (meta.closeAt ? HKUI.formatDateTimeKst(meta.closeAt) : "수요일 17:00");
        return `<div style="margin-bottom:20px">${HKUI.alertBox("info", "확정 취소 슬롯 · 인원 지정 가능", `관리자가 <b>확정 취소</b>한 시간대에 회원을 지정할 수 있습니다. (<b>${from}</b> 이후 · 각 시간대 <b>시작 시각 전</b>까지 · 지정 시 즉시 확정 · <b>완료 메일은 [완료 메일 발송] 버튼으로 수동 발송</b>)`)}</div>`;
      }
      return "";
    }

    function getAdminAssign(slot) {
      return (slot.applicants || []).find((x) => x.status === "CONFIRMED" && x.type === "ADMIN_ASSIGN");
    }

    function applicantRow(a, rank, head, slot) {
      if (head) {
        return `<div style="display:grid;grid-template-columns:${GRID};gap:12px;min-width:660px;padding:0 8px 10px;border-bottom:1px solid var(--border-default)">${["", "신청자", "신청 시각", "마지막 이용", "구분", "우선권", "상태"].map((h) => `<div style="font-size:12px;font-weight:700;color:var(--text-muted);letter-spacing:0.03em">${h}</div>`).join("")}</div>`;
      }
      const isTop = rank === 0;
      const noHist = !a.last_used_date && a.no_history;
      const pos = a.position || a.job_title || "";
      const dept = a.department || a.dept || "";
      return `<div style="display:grid;grid-template-columns:${GRID};gap:12px;min-width:660px;padding:12px 8px;align-items:center;border-bottom:1px solid var(--color-mist)">
        <div style="font-size:13px;font-weight:700;color:${isTop ? "var(--color-signal-blue)" : "var(--text-muted)"}">${rank + 1}</div>
        <div style="display:flex;align-items:center;gap:10px;min-width:0">${HKUI.avatar(a.member_name, "sm", a.avatarUrl || "")}<div style="min-width:0"><div style="font-size:14px;font-weight:700;color:var(--color-midnight-navy)">${HKUI.escapeHtml(a.member_name)}${pos ? ` <span style="font-size:12px;font-weight:600;color:var(--color-slate-blue)">${HKUI.escapeHtml(pos)}</span>` : ""}</div><div style="font-size:12px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${HKUI.escapeHtml(dept ? `${dept} · ${a.member_email || ""}` : a.member_email || "")}</div></div></div>
        <div style="font-size:14px;color:var(--text-secondary);font-variant-numeric:tabular-nums">${a.applied_at ? HKUI.formatTimeKst(a.applied_at) : "-"}</div>
        <div style="font-size:13px;color:${noHist ? "var(--color-warning)" : "var(--text-secondary)"};font-weight:${noHist ? 700 : 400}">${noHist ? "이력 없음" : a.last_used_date ? HKUI.formatDate(a.last_used_date) : "-"}</div>
        <div>${typeBadge(a.type)}</div>
        <div>${a.priority_rank === 1 || isTop ? HKUI.badge("O", "info") : HKUI.badge("X", "neutral")}</div>
        <div style="display:flex;flex-direction:column;align-items:flex-start;gap:4px">${HKUI.statusBadge(a.status)}${adminCancelConfirmedBtn(a, slot)}</div>
      </div>`;
    }

    function field(label, value, warn, tabular) {
      return `<div style="min-width:84px"><div style="font-size:11px;color:var(--text-muted);margin-bottom:3px">${label}</div><div style="font-size:14px;font-weight:${warn ? 700 : 600};color:${warn ? "var(--color-warning)" : "var(--color-midnight-navy)"};font-variant-numeric:${tabular ? "tabular-nums" : "normal"}">${value}</div></div>`;
    }

    function showConfirmBtn(slot) {
      if (isDesignatedConfirmSlot(slot)) return false;
      if (!canConfirm) return false;
      const all = slot.applicants || [];
      if (all.some((x) => x.status === "CONFIRMED")) return false;
      return all.some((x) => x.status === "REQUESTED");
    }

    function showDesignateBtn(slot) {
      if (!isDesignatedConfirmSlot(slot) || isSlotOff(slot)) return false;
      if ((slot.applicants || []).some((x) => x.status === "CONFIRMED")) return false;
      if (isSlotPastForAssign(slot)) return false;
      return true;
    }

    function designateBtnHtml(slotId, enabled) {
      if (enabled) {
        return `<button type="button" class="hk-btn hk-btn--primary hk-btn--sm" data-designate-slot="${slotId}">지정 확정</button>`;
      }
      return `<button type="button" class="hk-btn hk-btn--secondary hk-btn--sm" data-designate-slot="${slotId}">지정 확정 · 신청자 보기</button>`;
    }

    function previewBtnHtml(slotId) {
      return `<button type="button" class="hk-btn hk-btn--secondary hk-btn--sm" data-confirm-slot="${slotId}">우선권 미리보기</button>`;
    }

    function confirmBtnHtml(slotId) {
      return `<button type="button" class="hk-btn hk-btn--primary hk-btn--sm" data-confirm-slot="${slotId}">우선권 확인 · 확정</button>`;
    }

    function canAdminCancelConfirmed() {
      return canConfirm;
    }

    function isSlotPastForCancel(slot) {
      return HKUI.isSlotPastKst(slot?.slotDate, slot?.startTime);
    }

    function adminCancelConfirmedBtn(a, slot) {
      if (a.status !== "CONFIRMED" || !isAdminCancelConfirmedType(a.type) || !canAdminCancelConfirmed()) return "";
      if (isSlotPastForCancel(slot)) {
        // disabled 버튼은 브라우저에 따라 title 툴팁이 뜨지 않아 span으로 감싼다.
        return `<span title="예약 시간이 지나 취소할 수 없습니다" style="display:inline-flex"><button type="button" class="hk-btn hk-btn--secondary hk-btn--sm" disabled>확정 취소</button></span>`;
      }
      return `<button type="button" class="hk-btn hk-btn--secondary hk-btn--sm" data-cancel-confirmed="${a.reservation_id}">확정 취소</button>`;
    }

    function decidedStatusHtml(a, canConfirm, slot) {
      if (a.status === "CONFIRMED") {
        const cancelBtn = isAdminCancelConfirmedType(a.type) && canConfirm ? adminCancelConfirmedBtn(a, slot) : "";
        return `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">${HKUI.statusBadge("CONFIRMED")}${cancelBtn}</div>`;
      }
      return HKUI.statusBadge(a.status);
    }

    function assignBtnHtml(slotId) {
      return `<button type="button" class="hk-btn hk-btn--primary hk-btn--sm" data-assign-slot="${slotId}">인원 지정</button>`;
    }

    function adminAssignMailBtn(aa) {
      const status = aa.mailStatus || "pending";
      if (status === "success") {
        return HKUI.badge("메일 발송 완료", "success", true);
      }
      const label = status === "fail" ? "메일 재발송" : "완료 메일 발송";
      return `<button type="button" class="hk-btn hk-btn--secondary hk-btn--sm" data-send-assign-mail="${aa.reservation_id}">${HKUI.icon("mail", 16, "var(--color-midnight-navy)")} ${label}</button>`;
    }

    function adminAssignActionsHtml(slot) {
      const aa = getAdminAssign(slot);
      if (!aa) return "";
      const mailPart = adminAssignMailBtn(aa);
      const designated = isDesignatedConfirmSlot(slot);
      // 월 15:30 지정 확정: 마감 후 취소만 (변경은 취소 후 재지정)
      if (designated) {
        // 시작 시각 경과 시 canConfirm 여부와 무관하게 비활성 버튼 + 툴팁을 항상 노출
        if (isSlotPastForAssign(slot)) {
          // disabled 버튼은 브라우저에 따라 title 툴팁이 뜨지 않아 span으로 감싼다.
          return `${mailPart}
          <span title="예약 시간이 지나 취소할 수 없습니다" style="display:inline-flex"><button type="button" class="hk-btn hk-btn--secondary hk-btn--sm" disabled>취소</button></span>`;
        }
        if (!canConfirm) return mailPart;
        return `${mailPart}
        <button type="button" class="hk-btn hk-btn--secondary hk-btn--sm" data-cancel-assign="${aa.reservation_id}">취소</button>`;
      }
      // 시작 시각 경과 시 canAdminAssign 여부와 무관하게 비활성 버튼 + 툴팁을 항상 노출
      if (isSlotPastForAssign(slot)) {
        // disabled 버튼은 브라우저에 따라 title 툴팁이 뜨지 않아 span으로 감싼다.
        return `${mailPart}
        <span title="예약 시간이 지나 취소할 수 없습니다" style="display:inline-flex"><button type="button" class="hk-btn hk-btn--secondary hk-btn--sm" disabled>취소</button></span>
        <span title="예약 시간이 지나 변경할 수 없습니다" style="display:inline-flex"><button type="button" class="hk-btn hk-btn--secondary hk-btn--sm" disabled>변경</button></span>`;
      }
      if (!boardMeta.canAdminAssign) return mailPart;
      return `${mailPart}
        <button type="button" class="hk-btn hk-btn--secondary hk-btn--sm" data-cancel-assign="${aa.reservation_id}">취소</button>
        <button type="button" class="hk-btn hk-btn--secondary hk-btn--sm" data-change-assign="${aa.reservation_id}" data-slot-id="${slot.slotId}">변경</button>`;
    }

    function datePillLabel(iso, off, offLabel = "휴가") {
      const dt = new Date(iso + "T12:00:00");
      const dow = ["일", "월", "화", "수", "목", "금", "토"][dt.getDay()];
      return `${dt.getMonth() + 1}/${dt.getDate()}(${dow})${off ? ` · ${offLabel}` : ""}`;
    }

    function closeConfirmModal() {
      const el = document.getElementById("confirm-modal-overlay");
      if (el) el.remove();
    }

    function closeAssignModal() {
      const el = document.getElementById("assign-modal-overlay");
      if (el) el.remove();
    }

    function renderConfirmApplicant(a, i, opts) {
      const { decided, canConfirm, slot } = opts;
      const isTop = i === 0;
      const noHist = a.no_history || !a.last_used_date;
      const pos = a.position || a.job_title || "";
      const dept = a.department || a.dept || "";
      const borderColor = a.status === "CONFIRMED" ? "var(--color-success)" : isTop && !decided ? "var(--color-signal-blue)" : "var(--border-default)";
      const borderW = a.status === "CONFIRMED" || (isTop && !decided) ? 2 : 1;
      const bg = a.status === "CONFIRMED" ? "var(--color-success-soft)" : "var(--surface-card)";
      return `<div class="hk-card hk-card--pad" style="border:${borderW}px solid ${borderColor};background:${bg}">
        <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
          <div style="width:32px;height:32px;border-radius:999px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:${isTop ? "var(--color-signal-blue)" : "var(--color-fog)"};color:${isTop ? "#fff" : "var(--color-slate-blue)"};font-weight:700;font-size:14px">${i + 1}</div>
          ${HKUI.avatar(a.member_name, "md", a.avatarUrl || "")}
          <div style="min-width:160px">
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:16px;font-weight:700;color:var(--color-midnight-navy)">${HKUI.escapeHtml(a.member_name)}</span>
              ${isTop && !decided ? HKUI.badge("우선권 1순위", "info") : ""}
            </div>
            <div style="font-size:13px;color:var(--color-slate-blue);font-weight:600">${HKUI.escapeHtml(dept)}${pos ? ` · ${HKUI.escapeHtml(pos)}` : ""}</div>
            <div style="font-size:13px;color:var(--text-muted)">${HKUI.escapeHtml(a.member_email || "")}</div>
          </div>
          ${field("신청 시각", a.applied_at ? HKUI.formatTimeKst(a.applied_at) : "-", false, true)}
          ${field("마지막 이용일", noHist ? "이력 없음" : HKUI.formatDate(a.last_used_date), noHist)}
          ${field("누적 이용", a.total_uses != null ? `${a.total_uses}회` : "-")}
          <div style="flex:1"></div>
          <div style="min-width:96px;display:flex;justify-content:flex-end">
            ${decided && a.status === "CONFIRMED" ? decidedStatusHtml(a, canConfirm, slot) : decided ? decidedStatusHtml(a, canConfirm, slot) : canConfirm ? `<button type="button" class="hk-btn hk-btn--${isTop ? "primary" : "secondary"} hk-btn--sm" data-rid="${a.reservation_id}">확정</button>` : `<span style="font-size:13px;color:var(--text-muted);white-space:nowrap">마감 후 확정</span>`}
          </div>
        </div>
      </div>`;
    }

    async function reloadBoard() {
      const res = await HKApi.adminReservations(cycleId);
      const board = res.boards?.[0] || res;
      allSlots = board.slots || [];
      boardMeta = {
        canAdminAssign: board.canAdminAssign === true,
        adminAssignFrom: board.adminAssignFrom || null,
        adminAssignUntil: board.adminAssignUntil || null,
      };
      canConfirm = board.canConfirm !== false;
      container.querySelector("#" + uid + "-alerts").innerHTML = topAlert();
      renderTabs();
      renderList();
    }

    function emptyAssignableSlots(excludeSlotId) {
      return allSlots
        .filter((s) => s.slotId !== excludeSlotId && isAdminAssignTarget(s))
        .sort((a, b) => a.slotDate.localeCompare(b.slotDate) || a.timeIndex - b.timeIndex);
    }

    function renderMemberPickList(members, onPick, opts) {
      opts = opts || {};
      if (!members.length) {
        return `<div style="font-size:14px;color:var(--text-muted);padding:16px 0;text-align:center">검색 결과가 없습니다.</div>`;
      }
      return `<div style="display:flex;flex-direction:column;gap:8px">${members.map((m) => {
        const dept = m.department ? `${HKUI.escapeHtml(m.department)} · ` : "";
        const last = m.lastUsedDate ? HKUI.formatDate(m.lastUsedDate) : "이력 없음";
        let statusBadge = "";
        if (opts.showWeekStatus && m.confirmedThisWeek) {
          statusBadge = ` ${HKUI.badge("확정됨", "success", true)}`;
        } else if (opts.showWeekStatus && m.requestedElsewhere) {
          statusBadge = ` ${HKUI.badge("다른 슬롯 신청", "neutral", true)}`;
        } else if (opts.showApplied && m.appliedToSlot) {
          statusBadge = ` ${HKUI.badge("신청함", "info", true)}`;
        } else if (opts.showApplied && m.droppedOnSlot) {
          statusBadge = ` ${HKUI.badge("탈락", "danger", true)}`;
        }
        const locked = opts.showWeekStatus && m.selectable === false;
        const disabled = opts.disabled || locked;
        return `<button type="button" class="hk-card hk-card--pad" data-member-id="${m.id}" data-selectable="${locked ? "0" : "1"}" style="text-align:left;cursor:${disabled ? "not-allowed" : "pointer"};border:1px solid var(--border-default);background:${locked ? "var(--color-fog)" : "var(--surface-card)"};width:100%;opacity:${locked ? "0.85" : "1"}" ${disabled ? "disabled" : ""}>
          <div style="display:flex;align-items:center;gap:12px">
            ${HKUI.avatar(m.name, "sm", m.avatarUrl || "")}
            <div style="min-width:0;flex:1">
              <div style="font-size:15px;font-weight:700;color:var(--color-midnight-navy)">${HKUI.escapeHtml(m.name)}${m.position ? ` <span style="font-size:12px;font-weight:600;color:var(--color-slate-blue)">${HKUI.escapeHtml(m.position)}</span>` : ""}${statusBadge}</div>
              <div style="font-size:12px;color:var(--text-muted)">${dept}${HKUI.escapeHtml(m.email || "")}</div>
              <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">마지막 이용: ${last}</div>
            </div>
          </div>
        </button>`;
      }).join("")}</div>`;
    }

    async function openDesignateModal(slotId) {
      closeAssignModal();
      closeConfirmModal();
      const slot = allSlots.find((s) => s.slotId === slotId);
      if (!slot) return;

      const applicants = (slot.applicants || [])
        .filter((a) => a.status === "REQUESTED" || a.status === "DROPPED")
        .slice()
        .sort((a, b) => {
          const rank = (s) => (s === "REQUESTED" ? 0 : 1);
          const byStatus = rank(a.status) - rank(b.status);
          if (byStatus !== 0) return byStatus;
          return (a.priority_rank || 99) - (b.priority_rank || 99);
        });
      const canPick = canConfirm && !isSlotPastForAssign(slot);

      const overlay = document.createElement("div");
      overlay.id = "assign-modal-overlay";
      overlay.className = "hk-dialog__overlay";
      overlay.innerHTML = `<div class="hk-dialog" role="dialog" style="max-width:640px;max-height:min(90dvh,90vh);width:calc(100% - 32px);overflow:hidden;display:flex;flex-direction:column;padding:0">
        <div style="padding:20px 24px;border-bottom:1px solid var(--border-default);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-shrink:0">
          <div>
            <div style="font-size:20px;font-weight:700;color:var(--color-midnight-navy)">월요일 15:30 · 지정 확정</div>
            <div style="font-size:13px;color:var(--text-secondary);margin-top:4px">${HKUI.formatDateLong(slot.slotDate)} ${slot.startTime} – ${slot.endTime}</div>
          </div>
          <button type="button" class="hk-btn hk-btn--ghost hk-btn--sm" data-modal-close aria-label="닫기">${HKUI.icon("x", 18, "var(--color-slate-blue)")}</button>
        </div>
        <div style="padding:20px 24px;overflow-y:auto;flex:1">
          ${canPick
            ? `<div style="margin-bottom:16px">${HKUI.alertBox("warning", "관리자 지정 전용", "Teams SSO 로그인 직원 중 1명을 지정하면 즉시 확정됩니다. <b>미신청·탈락자도 지정 가능</b>하며, 같은 슬롯의 다른 신청자는 <b>탈락</b> 처리되고 완료 메일이 발송됩니다. 재신청 기간에는 이 슬롯을 회원 재신청할 수 없습니다.")}</div>`
            : `<div style="margin-bottom:16px">${HKUI.alertBox("info", "확정은 마감 후 가능", "지금은 신청 현황만 확인할 수 있습니다. <b>수요일 17:00 마감 후</b> Teams SSO 직원 중 지정해 확정하세요.")}</div>`}
          ${applicants.length
            ? `<div style="margin-bottom:20px">
                <div style="font-size:13px;font-weight:700;color:var(--color-midnight-navy);margin-bottom:8px">신청·탈락 현황 (${applicants.length}명)</div>
                <div style="display:flex;flex-direction:column;gap:8px">${applicants.map((a) => {
                  const dept = a.department || a.dept || "";
                  return `<div class="hk-card hk-card--pad" style="border:1px solid var(--border-default)">
                    <div style="display:flex;align-items:center;gap:12px">
                      ${HKUI.avatar(a.member_name, "sm", a.avatarUrl || "")}
                      <div style="min-width:0;flex:1">
                        <div style="font-size:14px;font-weight:700;color:var(--color-midnight-navy)">${HKUI.escapeHtml(a.member_name)}</div>
                        <div style="font-size:12px;color:var(--text-muted)">${HKUI.escapeHtml(dept ? `${dept} · ${a.member_email || ""}` : a.member_email || "")}</div>
                      </div>
                      ${HKUI.statusBadge(a.status)}
                    </div>
                  </div>`;
                }).join("")}</div>
              </div>`
            : `<div style="margin-bottom:16px"><div style="font-size:13px;color:var(--text-muted)">아직 신청·탈락자가 없습니다. 미신청자도 지정할 수 있습니다.</div></div>`}
          ${canPick
            ? `<div style="border-top:1px solid var(--border-default);padding-top:20px">
                <label style="display:block;font-size:13px;font-weight:600;color:var(--color-midnight-navy);margin-bottom:8px">Teams SSO 직원 검색 · 지정</label>
                <input type="search" class="hk-input" id="designate-member-search" placeholder="이름, 이메일, 부서" style="width:100%;margin-bottom:16px">
                <div id="designate-member-list"><div style="font-size:14px;color:var(--text-muted);padding:16px 0;text-align:center">불러오는 중…</div></div>
              </div>`
            : ""}
        </div>
      </div>`;
      overlay.addEventListener("click", (e) => { if (e.target === overlay) closeAssignModal(); });
      overlay.querySelector("[data-modal-close]").onclick = closeAssignModal;
      document.body.appendChild(overlay);
      HKUI.refreshIcons(overlay);

      if (!canPick) return;

      const listEl = overlay.querySelector("#designate-member-list");
      const searchEl = overlay.querySelector("#designate-member-search");
      let searchTimer = null;

      async function runSearch(q) {
        listEl.innerHTML = `<div style="font-size:14px;color:var(--text-muted);padding:16px 0;text-align:center">검색 중…</div>`;
        try {
          const data = await HKApi.designatableMembers(slotId, q);
          listEl.innerHTML = renderMemberPickList(data.members || [], null, {
            showApplied: true,
            showWeekStatus: true,
          });
          HKUI.refreshIcons(listEl);
          listEl.querySelectorAll("[data-member-id]").forEach((btn) => {
            btn.onclick = async () => {
              if (btn.dataset.selectable === "0" || btn.disabled) return;
              const memberId = Number(btn.dataset.memberId);
              const member = (data.members || []).find((m) => m.id === memberId);
              if (!member || member.selectable === false) {
                HKUI.toast(
                  member?.confirmedThisWeek
                    ? "이미 이번 주 예약이 확정된 직원입니다."
                    : "다른 슬롯에 신청 중인 직원입니다.",
                  "danger"
                );
                return;
              }
              const name = member.name || "선택한 회원";
              const applied = member.appliedToSlot;
              const dropped = member.droppedOnSlot;
              let note = " (미신청 · 관리자 지정)";
              if (applied) note = "";
              else if (dropped) note = " (탈락자 · 지정 확정)";
              const ok = await HKUI.confirmDialog(
                "이 직원을 지정 확정할까요?",
                `<b>${HKUI.escapeHtml(name)}</b>님을 ${HKUI.formatDateLong(slot.slotDate)} 15:30에 확정합니다.${note} 다른 신청자는 <b>탈락</b> 처리되고 완료 메일이 발송됩니다.`
              );
              if (!ok) return;
              btn.disabled = true;
              try {
                await HKApi.designateConfirmSlot(slotId, memberId);
                HKUI.toast("지정 인원으로 예약이 확정되었습니다 · 완료 메일 발송");
                closeAssignModal();
                await reloadBoard();
              } catch (e) {
                btn.disabled = false;
                HKUI.toast(e.message, "danger");
              }
            };
          });
        } catch (e) {
          listEl.innerHTML = HKUI.alertBox("danger", "오류", HKUI.escapeHtml(e.message));
        }
      }

      searchEl.addEventListener("input", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => runSearch(searchEl.value.trim()), 280);
      });
      await runSearch("");
      searchEl.focus();
    }

    async function openAssignModal(slotId) {
      closeAssignModal();
      const slot = allSlots.find((s) => s.slotId === slotId);
      if (!slot) return;

      const overlay = document.createElement("div");
      overlay.id = "assign-modal-overlay";
      overlay.className = "hk-dialog__overlay";
      overlay.innerHTML = `<div class="hk-dialog" role="dialog" style="max-width:560px;max-height:min(90dvh,90vh);width:calc(100% - 32px);overflow:hidden;display:flex;flex-direction:column;padding:0">
        <div style="padding:20px 24px;border-bottom:1px solid var(--border-default);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-shrink:0">
          <div>
            <div style="font-size:20px;font-weight:700;color:var(--color-midnight-navy)">빈 슬롯 · 인원 지정</div>
            <div style="font-size:13px;color:var(--text-secondary);margin-top:4px">${HKUI.formatDateLong(slot.slotDate)} ${slot.startTime} – ${slot.endTime}</div>
          </div>
          <button type="button" class="hk-btn hk-btn--ghost hk-btn--sm" data-modal-close aria-label="닫기">${HKUI.icon("x", 18, "var(--color-slate-blue)")}</button>
        </div>
        <div style="padding:20px 24px;overflow-y:auto;flex:1">
          <div style="margin-bottom:16px">${HKUI.alertBox("info", "즉시 확정", "지정하면 바로 예약이 확정됩니다. 완료 메일은 확정 후 슬롯 옆 <b>[완료 메일 발송]</b> 버튼으로 보내세요.")}</div>
          <label style="display:block;font-size:13px;font-weight:600;color:var(--color-midnight-navy);margin-bottom:8px">회원 검색</label>
          <input type="search" class="hk-input" id="assign-member-search" placeholder="이름, 이메일, 부서" style="width:100%;margin-bottom:16px">
          <div id="assign-member-list"><div style="font-size:14px;color:var(--text-muted);padding:16px 0;text-align:center">이름 또는 이메일을 입력하세요.</div></div>
        </div>
      </div>`;
      overlay.addEventListener("click", (e) => { if (e.target === overlay) closeAssignModal(); });
      overlay.querySelector("[data-modal-close]").onclick = closeAssignModal;
      document.body.appendChild(overlay);
      HKUI.refreshIcons(overlay);

      const listEl = overlay.querySelector("#assign-member-list");
      const searchEl = overlay.querySelector("#assign-member-search");
      let searchTimer = null;

      async function runSearch(q) {
        listEl.innerHTML = `<div style="font-size:14px;color:var(--text-muted);padding:16px 0;text-align:center">검색 중…</div>`;
        try {
          const data = await HKApi.assignableMembers(cycleId, q);
          listEl.innerHTML = renderMemberPickList(data.members || [], null);
          listEl.querySelectorAll("[data-member-id]").forEach((btn) => {
            btn.onclick = async () => {
              const memberId = Number(btn.dataset.memberId);
              const name = btn.querySelector("[style*='font-size:15px']")?.textContent?.trim() || "선택한 회원";
              const ok = await HKUI.confirmDialog(
                "이 회원을 지정할까요?",
                `<b>${HKUI.escapeHtml(name)}</b>님을 ${HKUI.formatDateLong(slot.slotDate)} ${slot.startTime} 타임에 지정합니다. 즉시 확정되며, 완료 메일은 별도로 발송 버튼을 눌러 주세요.`
              );
              if (!ok) return;
              btn.disabled = true;
              try {
                await HKApi.assignSlot(slotId, memberId);
                HKUI.toast("관리자 지정으로 예약이 확정되었습니다 · 완료 메일 발송 버튼을 눌러 주세요");
                closeAssignModal();
                await reloadBoard();
              } catch (e) {
                btn.disabled = false;
                HKUI.toast(e.message, "danger");
              }
            };
          });
        } catch (e) {
          listEl.innerHTML = HKUI.alertBox("danger", "오류", HKUI.escapeHtml(e.message));
        }
      }

      searchEl.addEventListener("input", () => {
        clearTimeout(searchTimer);
        const q = searchEl.value.trim();
        if (!q) {
          listEl.innerHTML = `<div style="font-size:14px;color:var(--text-muted);padding:16px 0;text-align:center">이름 또는 이메일을 입력하세요.</div>`;
          return;
        }
        searchTimer = setTimeout(() => runSearch(q), 280);
      });
      searchEl.focus();
    }

    async function openChangeModal(reservationId, currentSlotId) {
      closeAssignModal();
      const slot = allSlots.find((s) => s.slotId === currentSlotId);
      const aa = slot ? getAdminAssign(slot) : null;
      if (!slot || !aa) return;

      const otherSlots = emptyAssignableSlots(currentSlotId);

      const overlay = document.createElement("div");
      overlay.id = "assign-modal-overlay";
      overlay.className = "hk-dialog__overlay";
      overlay.innerHTML = `<div class="hk-dialog" role="dialog" style="max-width:560px;max-height:min(90dvh,90vh);width:calc(100% - 32px);overflow:hidden;display:flex;flex-direction:column;padding:0">
        <div style="padding:20px 24px;border-bottom:1px solid var(--border-default);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-shrink:0">
          <div>
            <div style="font-size:20px;font-weight:700;color:var(--color-midnight-navy)">관리자 지정 · 변경</div>
            <div style="font-size:13px;color:var(--text-secondary);margin-top:4px">${HKUI.escapeHtml(aa.member_name)} · ${HKUI.formatDateLong(slot.slotDate)} ${slot.startTime}</div>
          </div>
          <button type="button" class="hk-btn hk-btn--ghost hk-btn--sm" data-modal-close aria-label="닫기">${HKUI.icon("x", 18, "var(--color-slate-blue)")}</button>
        </div>
        <div style="padding:20px 24px;overflow-y:auto;flex:1">
          <div style="margin-bottom:20px">
            <div style="font-size:13px;font-weight:700;color:var(--color-midnight-navy);margin-bottom:8px">다른 시간대로 변경</div>
            ${otherSlots.length
              ? `<select class="hk-select" id="change-slot-select" style="width:100%"><option value="">시간대 선택…</option>${otherSlots.map((s) => `<option value="${s.slotId}">${HKUI.formatDate(s.slotDate)} ${s.startTime} – ${s.endTime}</option>`).join("")}</select>
                <button type="button" class="hk-btn hk-btn--secondary hk-btn--sm" id="change-slot-btn" style="margin-top:10px">시간대만 변경</button>`
              : `<div style="font-size:13px;color:var(--text-muted)">변경 가능한 다른 빈 슬롯이 없습니다.</div>`}
          </div>
          <div style="border-top:1px solid var(--border-default);padding-top:20px">
            <div style="font-size:13px;font-weight:700;color:var(--color-midnight-navy);margin-bottom:8px">다른 회원으로 변경</div>
            <input type="search" class="hk-input" id="change-member-search" placeholder="이름, 이메일, 부서" style="width:100%;margin-bottom:12px">
            <div id="change-member-list"><div style="font-size:13px;color:var(--text-muted)">검색 후 회원을 선택하세요.</div></div>
          </div>
        </div>
      </div>`;
      overlay.addEventListener("click", (e) => { if (e.target === overlay) closeAssignModal(); });
      overlay.querySelector("[data-modal-close]").onclick = closeAssignModal;
      document.body.appendChild(overlay);
      HKUI.refreshIcons(overlay);

      const slotBtn = overlay.querySelector("#change-slot-btn");
      if (slotBtn) {
        slotBtn.onclick = async () => {
          const newSlotId = Number(overlay.querySelector("#change-slot-select").value);
          if (!newSlotId) {
            HKUI.toast("변경할 시간대를 선택해 주세요.", "danger");
            return;
          }
          const opt = overlay.querySelector("#change-slot-select").selectedOptions[0];
          const ok = await HKUI.confirmDialog("시간대를 변경할까요?", `같은 회원을 <b>${HKUI.escapeHtml(opt.textContent)}</b>로 옮깁니다.`);
          if (!ok) return;
          slotBtn.disabled = true;
          try {
            await HKApi.changeAdminAssign(reservationId, { slotId: newSlotId });
            HKUI.toast("관리자 지정 예약이 변경되었습니다");
            closeAssignModal();
            await reloadBoard();
          } catch (e) {
            slotBtn.disabled = false;
            HKUI.toast(e.message, "danger");
          }
        };
      }

      const listEl = overlay.querySelector("#change-member-list");
      const searchEl = overlay.querySelector("#change-member-search");
      let searchTimer = null;
      searchEl.addEventListener("input", () => {
        clearTimeout(searchTimer);
        const q = searchEl.value.trim();
        if (!q) {
          listEl.innerHTML = `<div style="font-size:13px;color:var(--text-muted)">검색 후 회원을 선택하세요.</div>`;
          return;
        }
        searchTimer = setTimeout(async () => {
          listEl.innerHTML = `<div style="font-size:13px;color:var(--text-muted);padding:12px 0;text-align:center">검색 중…</div>`;
          try {
            const data = await HKApi.assignableMembers(cycleId, q);
            const members = (data.members || []).filter((m) => m.id !== aa.member_id);
            listEl.innerHTML = renderMemberPickList(members, null);
            listEl.querySelectorAll("[data-member-id]").forEach((btn) => {
              btn.onclick = async () => {
                const memberId = Number(btn.dataset.memberId);
                const name = btn.querySelector("[style*='font-size:15px']")?.textContent?.trim() || "선택한 회원";
                const ok = await HKUI.confirmDialog("회원을 변경할까요?", `<b>${HKUI.escapeHtml(name)}</b>님으로 변경합니다.`);
                if (!ok) return;
                btn.disabled = true;
                try {
                  await HKApi.changeAdminAssign(reservationId, { memberId });
                  HKUI.toast("관리자 지정 예약이 변경되었습니다");
                  closeAssignModal();
                  await reloadBoard();
                } catch (e) {
                  btn.disabled = false;
                  HKUI.toast(e.message, "danger");
                }
              };
            });
          } catch (e) {
            listEl.innerHTML = HKUI.alertBox("danger", "오류", HKUI.escapeHtml(e.message));
          }
        }, 280);
      });
      searchEl.focus();
    }

    async function openConfirmModal(slotId) {
      closeConfirmModal();
      const overlay = document.createElement("div");
      overlay.id = "confirm-modal-overlay";
      overlay.className = "hk-dialog__overlay";
      overlay.innerHTML = `<div class="hk-dialog" role="dialog" style="max-width:720px;max-height:min(90dvh,90vh);width:calc(100% - 32px);overflow:hidden;display:flex;flex-direction:column;padding:0">
        <div style="padding:20px 24px;border-bottom:1px solid var(--border-default);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-shrink:0">
          <div>
            <div style="font-size:20px;font-weight:700;color:var(--color-midnight-navy)">우선권 확인 · 확정</div>
            <div style="font-size:13px;color:var(--text-secondary);margin-top:4px">마지막 이용일 오래된 순 → 동률 시 신청 시각</div>
          </div>
          <button type="button" class="hk-btn hk-btn--ghost hk-btn--sm" data-modal-close aria-label="닫기">${HKUI.icon("x", 18, "var(--color-slate-blue)")}</button>
        </div>
        <div id="confirm-modal-body" style="padding:20px 24px;overflow-y:auto;flex:1">
          <div style="font-size:14px;color:var(--text-muted);padding:24px 0;text-align:center">불러오는 중…</div>
        </div>
      </div>`;
      overlay.addEventListener("click", (e) => { if (e.target === overlay) closeConfirmModal(); });
      overlay.querySelector("[data-modal-close]").onclick = closeConfirmModal;
      document.body.appendChild(overlay);
      HKUI.refreshIcons(overlay);

      const body = overlay.querySelector("#confirm-modal-body");
      try {
        const data = await HKApi.slotDetail(slotId);
        const slot = data.slot;
        const applicants = (data.applicants || []).slice().sort((a, b) => (a.priority_rank || 99) - (b.priority_rank || 99));
        const allNoHistory = applicants.length > 0 && applicants.every((a) => a.no_history || !a.last_used_date);
        const decided = slot.status === "CONFIRMED" || applicants.some((a) => a.status === "CONFIRMED");
        const canConfirm = data.canConfirm !== false;
        const opts = { decided, canConfirm, slot };
        const topName = applicants.length ? HKUI.escapeHtml(applicants[0].member_name) : "";
        const rankAlert = applicants.length
          ? (allNoHistory
              ? HKUI.alertBox("info", "우선권 1순위가 자동 정렬되었습니다", `신청자 전원이 <b>이력 없음</b>이므로 신청 시각이 가장 빠른 <b>${topName}</b>님이 1순위입니다. 확정하면 나머지 신청자는 자동으로 <b>탈락</b> 처리됩니다.`)
              : HKUI.alertBox("info", "우선권 1순위가 자동 정렬되었습니다", `마지막 이용일이 가장 오래된 <b>${topName}</b>님이 1순위입니다. 확정하면 나머지 신청자는 자동으로 <b>탈락</b> 처리됩니다.`))
          : "";

        body.innerHTML = `
          <div class="hk-card hk-card--pad" style="margin-bottom:16px">
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
              ${HKUI.icon("clock", 20, "var(--color-signal-blue)")}
              <span style="font-size:17px;font-weight:700;color:var(--color-midnight-navy)">${HKUI.formatDateLong(slot.slotDate)} ${slot.startTime || ""} – ${slot.endTime || ""}</span>
              ${applicants.length > 1 ? HKUI.badge(`중복 ${applicants.length}명`, "warning") : ""}
              ${decided ? HKUI.badge("확정 완료", "success", true) : ""}
            </div>
          </div>
          ${!canConfirm && !decided
            ? `<div style="margin-bottom:16px">${HKUI.alertBox("info", "확정은 마감 후 가능", `일반 신청은 우선권(마지막 이용일 → 신청 시각) 기반이므로 <b>수요일 17:00 마감 후</b> 확정할 수 있습니다. 지금은 우선권 순서만 미리 확인할 수 있어요.`)}</div>`
            : ""}
          ${rankAlert ? `<div style="margin-bottom:16px">${rankAlert}</div>` : ""}
          <div style="display:flex;flex-direction:column;gap:12px" id="confirm-applicants">${applicants.map((a, i) => renderConfirmApplicant(a, i, opts)).join("")}</div>`;

        body.querySelectorAll("[data-rid]").forEach((btn) => {
          btn.onclick = async () => {
            const ok = await HKUI.confirmDialog("예약을 확정할까요?", "선택한 신청자를 확정합니다. 같은 슬롯의 다른 신청자는 <b>탈락</b> 처리되고, 확정자에게 <b>완료 메일</b>이 발송됩니다. 확정자의 마지막 이용일이 갱신됩니다.");
            if (!ok) return;
            btn.disabled = true;
            try {
              await HKApi.confirmSlot(slotId, Number(btn.dataset.rid));
              HKUI.toast("예약이 확정되었습니다 · 완료 메일 발송 · 마지막 이용일 갱신");
              closeConfirmModal();
              await reloadBoard();
            } catch (e) {
              btn.disabled = false;
              HKUI.toast(e.message, "danger");
            }
          };
        });
        HKUI.refreshIcons(body);
        bindCancelConfirmed(body);
      } catch (e) {
        body.innerHTML = HKUI.alertBox("danger", "오류", HKUI.escapeHtml(e.message));
        HKUI.refreshIcons(body);
      }
    }

    function bindConfirmButtons(root) {
      root.querySelectorAll("[data-confirm-slot]").forEach((btn) => {
        btn.onclick = () => openConfirmModal(Number(btn.dataset.confirmSlot));
      });
      root.querySelectorAll("[data-designate-slot]").forEach((btn) => {
        btn.onclick = () => openDesignateModal(Number(btn.dataset.designateSlot));
      });
    }

    function bindCancelConfirmed(root) {
      root.querySelectorAll("[data-cancel-confirmed]").forEach((btn) => {
        btn.onclick = async () => {
          const ok = await HKUI.confirmDialog(
            "확정을 취소할까요?",
            "슬롯이 다시 빈 상태로 돌아갑니다. 회원의 <b>마지막 이용일</b>이 재계산됩니다."
          );
          if (!ok) return;
          btn.disabled = true;
          try {
            await HKApi.cancelConfirmedReservation(Number(btn.dataset.cancelConfirmed));
            HKUI.toast("확정 예약이 취소되었습니다");
            closeConfirmModal();
            await reloadBoard();
          } catch (e) {
            btn.disabled = false;
            HKUI.toast(e.message, "danger");
          }
        };
      });
    }

    function bindAssignButtons(root) {
      root.querySelectorAll("[data-assign-slot]").forEach((btn) => {
        btn.onclick = () => openAssignModal(Number(btn.dataset.assignSlot));
      });
      root.querySelectorAll("[data-cancel-assign]").forEach((btn) => {
        btn.onclick = async () => {
          const ok = await HKUI.confirmDialog(
            "관리자 지정을 취소할까요?",
            "슬롯이 다시 빈 상태로 돌아가고, 회원의 마지막 이용일이 재계산됩니다."
          );
          if (!ok) return;
          btn.disabled = true;
          try {
            await HKApi.cancelAdminAssign(Number(btn.dataset.cancelAssign));
            HKUI.toast("관리자 지정 예약이 취소되었습니다");
            await reloadBoard();
          } catch (e) {
            btn.disabled = false;
            HKUI.toast(e.message, "danger");
          }
        };
      });
      root.querySelectorAll("[data-change-assign]").forEach((btn) => {
        btn.onclick = () => openChangeModal(Number(btn.dataset.changeAssign), Number(btn.dataset.slotId));
      });
      root.querySelectorAll("[data-send-assign-mail]").forEach((btn) => {
        btn.onclick = async () => {
          const isRetry = btn.textContent.includes("재발송");
          const ok = await HKUI.confirmDialog(
            isRetry ? "완료 메일을 다시 보낼까요?" : "완료 메일을 발송할까요?",
            "예약 확정 안내 메일이 해당 회원에게 발송됩니다."
          );
          if (!ok) return;
          btn.disabled = true;
          try {
            await HKApi.sendAdminAssignMail(Number(btn.dataset.sendAssignMail));
            HKUI.toast("완료 메일이 발송되었습니다");
            await reloadBoard();
          } catch (e) {
            btn.disabled = false;
            HKUI.toast(e.message, "danger");
          }
        };
      });
    }

    function countByStatus(statusKey) {
      let n = 0;
      const daySlots = selectedDate
        ? allSlots.filter((s) => s.slotDate === selectedDate)
        : allSlots;
      for (const slot of daySlots) {
        for (const a of slot.applicants || []) {
          if (statusKey === "all" || a.status === statusKey) n++;
        }
      }
      return n;
    }

    function pendingCountByDate(iso) {
      let n = 0;
      for (const slot of allSlots) {
        if (slot.slotDate !== iso) continue;
        for (const a of slot.applicants || []) {
          if (a.status === "REQUESTED") n++;
        }
      }
      return n;
    }

    function dateHeading(d) {
      const dt = new Date(d + "T12:00:00");
      const dow = ["일", "월", "화", "수", "목", "금", "토"][dt.getDay()];
      const daySlots = allSlots.filter((s) => s.slotDate === d);
      const allHoliday = daySlots.length > 0 && daySlots.every((s) => s.isHoliday);
      const off = offDates.has(d) || allHoliday;
      const offLabel = allHoliday ? "공휴일" : "휴가";
      return `<div style="font-size:14px;font-weight:700;color:var(--color-midnight-navy);padding:4px 0 2px;display:flex;align-items:center;gap:8px">
        ${HKUI.formatDate(d)} (${dow})${off ? ` ${HKUI.badge(offLabel, "danger")}` : ""}
      </div>`;
    }

    function slotCard(slot, showDate) {
      const all = slot.applicants || [];
      const list = all
        .filter((a) => filter === "all" || a.status === filter)
        .slice()
        .sort((a, b) => (a.priority_rank || 99) - (b.priority_rank || 99));
      const confirmed = all.find((x) => x.status === "CONFIRMED");
      const pending = all.filter((x) => x.status === "REQUESTED");
      const adminAssign = getAdminAssign(slot);
      const reapply = all.some((x) => x.type === "REAPPLY");
      const off = isSlotOff(slot);
      const offLabel = slot.isHoliday ? "공휴일" : "휴가";
      const designated = isDesignatedConfirmSlot(slot);
      const emptyLabel = designated ? "" : assignSlotHint(slot);
      const cancelVacancy = slot.adminCancelVacancy === true;
      const head = `<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        ${HKUI.icon("clock", 18, "var(--color-slate-blue)")}
        <span style="font-size:15px;font-weight:700;color:var(--color-midnight-navy)">${slot.startTime || ""} – ${slot.endTime || ""}</span>
        ${off ? HKUI.badge(offLabel, "danger") : ""}
        ${designated && !confirmed ? HKUI.badge("지정 확정", "warning") : ""}
        ${adminAssign ? HKUI.badge("관리자 지정", "warning") : ""}
        ${pending.length > 1 ? HKUI.badge(`중복 ${pending.length}명`, "warning") : ""}
        ${reapply ? HKUI.badge("재신청 포함", "info") : ""}
        ${cancelVacancy && !adminAssign ? HKUI.badge(isSlotPastForAssign(slot) ? "확정 취소 · 지정 불가" : "확정 취소 · 지정 가능", isSlotPastForAssign(slot) ? "neutral" : "warning") : ""}
        ${confirmed && !adminAssign ? HKUI.badge("확정 완료", "success", true) : ""}
        <div style="flex:1"></div>
        ${showDesignateBtn(slot) ? designateBtnHtml(slot.slotId, canConfirm) : ""}
        ${showConfirmBtn(slot) ? confirmBtnHtml(slot.slotId) : ""}
        ${!showConfirmBtn(slot) && !showDesignateBtn(slot) && !canConfirm && (slot.applicants || []).some((x) => x.status === "REQUESTED") ? previewBtnHtml(slot.slotId) : ""}
        ${emptyLabel}
        ${adminAssignActionsHtml(slot)}
      </div>`;
      if (!all.length) {
        if (designated && !off) {
          return `${showDate ? dateHeading(slot.slotDate) : ""}<div class="hk-card hk-card--pad" style="${showDate ? "margin-top:8px" : ""}">${head}</div>`;
        }
        return `<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border:1px solid var(--border-default);border-radius:var(--radius-sm);flex-wrap:wrap;${off ? "opacity:0.85" : ""}">${head}</div>`;
      }
      if (!list.length && !showConfirmBtn(slot) && !showDesignateBtn(slot) && !adminAssign && !cancelVacancy) return "";
      const tableHtml = list.length
        ? `<div style="overflow-x:auto;margin-top:16px">${applicantRow(null, 0, true, slot)}${list.map((a, i) => applicantRow(a, i, false, slot)).join("")}</div>`
        : "";
      return `${showDate ? dateHeading(slot.slotDate) : ""}<div class="hk-card hk-card--pad" style="${off ? "opacity:0.85" : ""}${showDate ? "margin-top:8px" : ""}">
        ${head}
        ${tableHtml}
      </div>`;
    }

    function renderList() {
      const el = container.querySelector("#" + uid + "-slot-list");
      const targetDates = selectedDate ? [selectedDate] : [];

      let daySlots = allSlots
        .filter((s) => targetDates.includes(s.slotDate))
        .sort((a, b) => a.timeIndex - b.timeIndex);

      if (filter !== "all") {
        daySlots = daySlots.filter((slot) =>
          (slot.applicants || []).some((a) => a.status === filter)
          || (
            filter === "REQUESTED"
            && isDesignatedConfirmSlot(slot)
            && !isSlotOff(slot)
            && !(slot.applicants || []).some((a) => a.status === "CONFIRMED")
          )
        );
      }

      if (!daySlots.length) {
        const label = FILTERS.find(([k]) => k === filter)?.[1] || "해당";
        const msg = filter === "all"
          ? "표시할 슬롯이 없습니다."
          : `${label} 상태의 신청이 없습니다.`;
        el.innerHTML = `<div class="hk-card hk-card--pad"><div style="font-size:13px;color:var(--text-muted);padding:12px 0">${msg}</div></div>`;
        HKUI.refreshIcons();
        return;
      }

      el.innerHTML = `<div style="display:flex;flex-direction:column;gap:10px">${daySlots
        .map((slot) => slotCard(slot, false))
        .filter(Boolean)
        .join("")}</div>`;
      bindConfirmButtons(el);
      bindAssignButtons(el);
      bindCancelConfirmed(el);
      HKUI.refreshIcons();
    }

    function renderTabs() {
      container.querySelector("#" + uid + "-date-tabs").innerHTML = dates
        .map((d) => {
          const daySlots = allSlots.filter((s) => s.slotDate === d);
          const allHoliday = daySlots.length > 0 && daySlots.every((s) => s.isHoliday);
          const off = offDates.has(d) || allHoliday;
          const offLabel = allHoliday ? "공휴일" : "휴가";
          const active = d === selectedDate;
          const pending = pendingCountByDate(d);
          const label = datePillLabel(d, off, offLabel) + (pending ? ` (${pending})` : "");
          return HKAdmin.datePill(label, active, off && filter === "all", `data-date="${d}"`);
        })
        .join("");
      container.querySelector("#" + uid + "-date-tabs").querySelectorAll("[data-date]").forEach((btn) => {
        btn.onclick = () => { if (!btn.disabled) { selectedDate = btn.dataset.date; renderTabs(); renderList(); } };
      });
      container.querySelector("#" + uid + "-status-filters").innerHTML = FILTERS.map(([k, l]) => {
        const cnt = countByStatus(k);
        const label = cnt ? `${l} (${cnt})` : l;
        return HKAdmin.filterPill(label, filter === k, `data-f="${k}"`);
      }).join("");
      container.querySelector("#" + uid + "-status-filters").querySelectorAll("[data-f]").forEach((btn) => {
        btn.onclick = () => {
          filter = btn.dataset.f;
          renderTabs();
          renderList();
        };
      });
    }


    container.querySelector("#" + uid + "-alerts").innerHTML = topAlert();
    renderTabs();
    renderList();
    HKUI.refreshIcons(container);
  }

  return { mount };
})();
