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
    funStats: () => request("/system/fun-stats"),
    profile: () => request("/me/profile"),
    logout: () => request("/auth/logout", { method: "POST" }),
    withdraw: () => request("/me", { method: "DELETE" }),

    calendar: () => request("/reservation/calendar"),
    applySlot: (slotId, useCoupon = false) =>
      request(`/reservation/slots/${slotId}/apply`, {
        method: "POST",
        body: JSON.stringify({ useCoupon: !!useCoupon }),
      }),
    // 점심 라운지
    playGames: () => request("/play/games"),
    playStatus: () => request("/play/status"),
    playLeaderboard: (game, period, variant) => request(`/play/${encodeURIComponent(game)}/leaderboard?period=${encodeURIComponent(period || "today")}${variant ? `&variant=${encodeURIComponent(variant)}` : ""}`),
    playStart: (game, variant) => request(`/play/${encodeURIComponent(game)}/start${variant ? `?variant=${encodeURIComponent(variant)}` : ""}`, { method: "POST" }),
    playRun: (game, fresh) => request(`/play/${encodeURIComponent(game)}/run${fresh ? "?fresh=1" : ""}`, { method: "POST" }),
    playStamps: () => request("/play/stamps"),
    matchOverview: (game) => request(`/play/match?game=${encodeURIComponent(game)}`),
    matchInbox: () => request("/play/match/inbox"),
    // 2인 협동 방탈출
    escapeOverview: () => request("/play/escape"),
    escapeInbox: () => request("/play/escape/inbox"),
    escapeInvite: (partnerId) => request("/play/escape", { method: "POST", body: JSON.stringify({ partnerId }) }),
    escapeDetail: (id) => request(`/play/escape/${id}`),
    escapeWait: (id, seq, here, signal) => request(`/play/escape/${id}/wait?seq=${seq}&here=${here ? "true" : "false"}`, { signal }),
    escapeAccept: (id) => request(`/play/escape/${id}/accept`, { method: "POST" }),
    escapeLeave: (id) => request(`/play/escape/${id}/leave`, { method: "POST" }),
    escapeCall: (id) => request(`/play/escape/${id}/call`, { method: "POST" }),
    escapeReady: (id, on) => request(`/play/escape/${id}/ready`, { method: "POST", body: JSON.stringify({ on }) }),
    escapeSolve: (id, puzzle, answer) => request(`/play/escape/${id}/solve`, { method: "POST", body: JSON.stringify({ puzzle, answer }) }),
    escapeHint: (id, puzzle) => request(`/play/escape/${id}/hint`, { method: "POST", body: JSON.stringify({ puzzle }) }),
    escapeCard: (id) => request(`/play/escape/${id}/card`, { method: "POST" }),
    escapeSay: (id, text) => request(`/play/escape/${id}/say`, { method: "POST", body: JSON.stringify({ text }) }),
    matchMembers: (q) => request(`/play/match/members?q=${encodeURIComponent(q || "")}`),
    matchCreate: (opponentId, game) => request("/play/match", { method: "POST", body: JSON.stringify({ opponentId, game }) }),
    matchBot: (level, game) => request("/play/match/bot", { method: "POST", body: JSON.stringify({ level, game }) }),
    matchDetail: (id) => request(`/play/match/${id}`),
    // 상대 수를 기다린다 — 판이 바뀌면 바로, 아니면 20초 뒤 돌아온다
    matchWait: (id, seq, status, signal) =>
      request(`/play/match/${id}/wait?seq=${seq}&status=${encodeURIComponent(status)}`, { signal }),
    matchAccept: (id) => request(`/play/match/${id}/accept`, { method: "POST" }),
    matchDecline: (id) => request(`/play/match/${id}/decline`, { method: "POST" }),
    matchMove: (id, step, seq) => request(`/play/match/${id}/move`, { method: "POST", body: JSON.stringify({ ...step, seq }) }),
    matchResign: (id) => request(`/play/match/${id}/resign`, { method: "POST" }),
    playWeekly: () => request("/play/weekly"),
    // 아케이드 의견 — kind: GAME(하고 싶은 게임) · BUG(오류) · IDEA(개선), game: 게임 키, device: 기기 정보
    playRequestGame: (body, opts = {}) => request("/play/requests", { method: "POST", body: JSON.stringify({ body, kind: opts.kind || null, game: opts.game || null, device: opts.device || null }) }),
    playSubmit: (game, score, token, variant) => request(`/play/${encodeURIComponent(game)}/score`, { method: "POST", body: JSON.stringify({ score, token, variant: variant || null }) }),
    notices: (category) => request(category ? `/system/notices?category=${encodeURIComponent(category)}` : "/system/notices"),
    notice: (id) => request(`/system/notices/${id}`),
    adminNotices: () => request("/admin/notices"),
    adminSaveNotice: (id, notice) =>
      request(id ? `/admin/notices/${id}` : "/admin/notices", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(notice),
      }),
    adminDeleteNotice: (id) => request(`/admin/notices/${id}`, { method: "DELETE" }),
    adminGameRequests: () => request("/admin/game-requests"),
    adminSetGameRequestStatus: (id, status) =>
      request(`/admin/game-requests/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }),
    adminCoupons: () => request("/admin/coupons"),
    adminCouponStats: () => request("/admin/coupons/stats"),
    adminMemberCoupons: (memberId) => request(`/admin/coupons/members/${memberId}`),
    adminGrantCoupons: (memberId, count, note) =>
      request("/admin/coupons/grant", { method: "POST", body: JSON.stringify({ memberId, count, note }) }),
    adminRevokeCoupon: (couponId) => request(`/admin/coupons/${couponId}/revoke`, { method: "POST" }),
    cancelReservation: (id) => request(`/reservation/${id}/cancel`, { method: "POST" }),
    returnReservation: (id) => request(`/reservation/${id}/return`, { method: "POST" }),
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
    swapTargets: (reservationId, q = "") => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      const qs = params.toString();
      return request(`/reservation/${reservationId}/swap/targets${qs ? `?${qs}` : ""}`);
    },
    createSwap: (reservationId, targetReservationId) =>
      request(`/reservation/${reservationId}/swap`, {
        method: "POST",
        body: JSON.stringify({ targetReservationId }),
      }),
    mySwapProposals: (role = "received", status = "PENDING") => {
      const params = new URLSearchParams();
      if (role) params.set("role", role);
      if (status) params.set("status", status);
      const qs = params.toString();
      return request(`/me/swap-proposals${qs ? `?${qs}` : ""}`);
    },
    acceptSwap: (swapId) =>
      request(`/swap-proposals/${swapId}/accept`, { method: "POST" }),
    rejectSwap: (swapId) =>
      request(`/swap-proposals/${swapId}/reject`, { method: "POST" }),
    cancelSwap: (swapId) =>
      request(`/swap-proposals/${swapId}/cancel`, { method: "POST" }),
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
    designatableMembers: (slotId, q = "") => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      const qs = params.toString();
      return request(`/admin/reservations/slots/${slotId}/designatable-members${qs ? `?${qs}` : ""}`);
    },
    designateConfirmSlot: (slotId, memberId) =>
      request(`/admin/reservations/slots/${slotId}/designate-confirm`, {
        method: "POST",
        body: JSON.stringify({ memberId }),
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
