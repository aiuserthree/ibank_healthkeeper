/** 헬스키퍼 API 클라이언트 — fetch + 세션 쿠키 */
window.HKApi = (function () {
  async function request(path, options = {}) {
    const res = await fetch("/api" + path, {
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
    let body = {};
    try {
      body = await res.json();
    } catch (_) {
      /* empty */
    }
    if (!res.ok) {
      const apiErr = body.error || body.detail?.error || {};
      const err = new Error(apiErr.message || res.statusText || "요청 실패");
      err.code = apiErr.code;
      err.status = res.status;
      throw err;
    }
    return body.data;
  }

  return {
    get: (path) => request(path),
    post: (path, payload) =>
      request(path, { method: "POST", body: payload ? JSON.stringify(payload) : undefined }),
    put: (path, payload) =>
      request(path, { method: "PUT", body: JSON.stringify(payload) }),
    delete: (path) => request(path, { method: "DELETE" }),

    systemState: () => request("/system/state"),
    profile: () => request("/me/profile"),
    logout: () => request("/auth/logout", { method: "POST" }),
    withdraw: () => request("/me", { method: "DELETE" }),

    calendar: () => request("/reservation/calendar"),
    applySlot: (slotId) => request(`/reservation/slots/${slotId}/apply`, { method: "POST" }),
    cancelReservation: (id) => request(`/reservation/${id}/cancel`, { method: "POST" }),
    reapplySlots: () => request("/reservation/reapply/slots"),
    reapplySlot: (slotId) => request(`/reservation/reapply/slots/${slotId}`, { method: "POST" }),
    myReservations: (page = 1, pageSize = 10) =>
      request(`/me/reservations?page=${page}&pageSize=${pageSize}`),
    transferRecipients: (reservationId, q = "") => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      const qs = params.toString();
      return request(`/reservation/${reservationId}/transfer/recipients${qs ? `?${qs}` : ""}`);
    },
    requestTransfer: (reservationId, recipientId) =>
      request(`/reservation/${reservationId}/transfer`, {
        method: "POST",
        body: JSON.stringify({ recipientId }),
      }),
    myUsageHistory: (page = 1, pageSize = 10) =>
      request(`/me/usage-history?page=${page}&pageSize=${pageSize}`),
    myLegacyUsages: (page = 1, pageSize = 10) =>
      request(`/me/usage-history?page=${page}&pageSize=${pageSize}`),

    adminLogin: (loginId, password, rememberMe = false) =>
      request("/admin/login", {
        method: "POST",
        body: JSON.stringify({ loginId, password, rememberMe }),
      }),
    adminLogout: () => request("/admin/logout", { method: "POST" }),
    dashboard: () => request("/admin/dashboard"),
    adminReservations: async (cycleId) => {
      const q = cycleId ? `?cycleId=${cycleId}` : "";
      return request("/admin/reservations" + q);
    },
    downloadConfirmedExport: async (cycleId) => {
      const q = cycleId ? `?cycleId=${cycleId}` : "";
      const res = await fetch("/api/admin/reservations/export" + q, { credentials: "include" });
      if (!res.ok) {
        let body = {};
        try {
          body = await res.json();
        } catch (_) {
          /* empty */
        }
        const apiErr = body.error || body.detail?.error || {};
        const err = new Error(apiErr.message || res.statusText || "다운로드 실패");
        err.code = apiErr.code;
        err.status = res.status;
        throw err;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      let filename = "헬스키퍼_신청자 목록.xlsx";
      const utfMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
      if (utfMatch) {
        filename = decodeURIComponent(utfMatch[1]);
      } else {
        const plainMatch = disposition.match(/filename="?([^";]+)"?/i);
        if (plainMatch) filename = plainMatch[1];
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    slotDetail: (slotId) => request(`/admin/reservations/slots/${slotId}`),
    confirmSlot: (slotId, reservationId) =>
      request(`/admin/reservations/slots/${slotId}/confirm`, {
        method: "POST",
        body: JSON.stringify({ reservationId }),
      }),
    assignableMembers: (cycleId, q = "") => {
      const params = new URLSearchParams({ cycleId: String(cycleId) });
      if (q) params.set("q", q);
      return request(`/admin/members/assignable?${params}`);
    },
    assignSlot: (slotId, memberId) =>
      request(`/admin/reservations/slots/${slotId}/assign`, {
        method: "POST",
        body: JSON.stringify({ memberId }),
      }),
    cancelAdminAssign: (reservationId) =>
      request(`/admin/reservations/${reservationId}/admin-assign/cancel`, { method: "POST" }),
    cancelConfirmedReservation: (reservationId) =>
      request(`/admin/reservations/${reservationId}/cancel-confirmed`, { method: "POST" }),
    changeAdminAssign: (reservationId, payload) =>
      request(`/admin/reservations/${reservationId}/admin-assign/change`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    sendAdminAssignMail: (reservationId) =>
      request(`/admin/reservations/${reservationId}/admin-assign/send-mail`, { method: "POST" }),
    pendingTransfers: (cycleId) => {
      const q = cycleId ? `?cycleId=${cycleId}` : "";
      return request(`/admin/transfers${q}`);
    },
    approveTransfer: (transferId) =>
      request(`/admin/transfers/${transferId}/approve`, { method: "POST" }),
    rejectTransfer: (transferId) =>
      request(`/admin/transfers/${transferId}/reject`, { method: "POST" }),
    reapplyTargets: (cycleId) => request(`/admin/reapply-mail/targets?cycleId=${cycleId}`),
    sendReapplyMail: (cycleId, memberIds) =>
      request(`/admin/reapply-mail/send?cycleId=${cycleId}`, {
        method: "POST",
        body: JSON.stringify(memberIds?.length ? { memberIds } : {}),
      }),
    vacations: (cycleId) => request(`/admin/vacations?cycleId=${cycleId}`),
    vacationMonth: (year, month) => request(`/admin/vacations/month?year=${year}&month=${month}`),
    addVacations: (cycleId, dates) =>
      request("/admin/vacations", { method: "POST", body: JSON.stringify({ cycleId, dates }) }),
    saveVacationMonth: (year, month, dates) =>
      request("/admin/vacations/month", { method: "POST", body: JSON.stringify({ year, month, dates }) }),
    removeVacation: (cycleId, date) =>
      request(`/admin/vacations?cycleId=${cycleId}&date=${date}`, { method: "DELETE" }),
    settings: () => request("/admin/settings"),
    updateSettings: (settings) =>
      request("/admin/settings", { method: "PUT", body: JSON.stringify({ settings }) }),
    mailTemplate: (type) => request(`/admin/mail-templates/${type}`),
    updateMailTemplate: (type, tpl) =>
      request(`/admin/mail-templates/${type}`, { method: "PUT", body: JSON.stringify(tpl) }),
    previewMailTemplate: (type, tpl) =>
      request(`/admin/mail-templates/${type}/preview`, { method: "POST", body: JSON.stringify(tpl) }),
  };
})();
