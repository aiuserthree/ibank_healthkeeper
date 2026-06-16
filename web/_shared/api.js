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
      const err = new Error(body.error?.message || res.statusText || "요청 실패");
      err.code = body.error?.code;
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
    myReservations: () => request("/me/reservations"),

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
    slotDetail: (slotId) => request(`/admin/reservations/slots/${slotId}`),
    confirmSlot: (slotId, reservationId) =>
      request(`/admin/reservations/slots/${slotId}/confirm`, {
        method: "POST",
        body: JSON.stringify({ reservationId }),
      }),
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
    updateMailTemplate: (type, tpl) =>
      request(`/admin/mail-templates/${type}`, { method: "PUT", body: JSON.stringify(tpl) }),
  };
})();
