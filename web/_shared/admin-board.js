/** 관리자 — 공지사항 · 건강 정보 게시판 (같은 화면, 게시판만 다르게). HKAdminBoard.mount("NOTICE" | "HEALTH") */
window.HKAdminBoard = (function () {
  const CONF = {
    NOTICE: {
      category: "NOTICE", active: "notices", title: "공지사항", label: "공지", noun: "공지", icon: "megaphone",
      desc: "회원 화면의 공지사항 페이지에 게시됩니다. 메인 화면에는 가장 최근 글이 한 줄로 보입니다.",
      pinLabel: "상단 고정 (수요일 예약 오픈 Teams 안내에 '새 공지'로 한 번 소개 — 7일 안에 올린 고정 공지)",
    },
    HEALTH: {
      category: "HEALTH", active: "health", title: "건강 정보", label: "건강 정보", noun: "건강 정보", icon: "heart-pulse",
      desc: "회원 화면의 건강 정보 페이지에 게시됩니다. 수요일 예약 오픈 Teams 안내에 7일 안에 공개된 최신 글이 함께 소개됩니다.",
      pinLabel: "상단 고정",
    },
  };
  function mount(category) {
    const C = CONF[category] || CONF.NOTICE;
    let editing = null;

    function dateLabel(iso) {
      return iso ? HKUI.formatDate(String(iso).slice(0, 10)) : "";
    }

    // 공개 일시 — KST ISO("2026-11-03T09:00:00+09:00")를 datetime-local 값으로
    function localValue(iso) {
      return iso ? String(iso).slice(0, 16) : "";
    }

    // 다음 화요일 09:00 — 건강 정보 정기 공개 시각
    function nextTuesdayValue() {
      const d = new Date();
      d.setDate(d.getDate() + (((2 - d.getDay() + 7) % 7) || 7));
      const p = (x) => String(x).padStart(2, "0");
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T09:00`;
    }

    function openPreview(category, title, body) {
      const { overlay, bodyEl } = HKUI.layerModal(category === "HEALTH" ? "건강 정보 미리보기" : "공지 미리보기", (el) => {
        el.innerHTML = `<h1 style="font-size:20px;margin:0 0 16px;color:var(--color-midnight-navy)">${HKUI.escapeHtml(title || "(제목 없음)")}</h1>
          <div class="hk-notice-body">${HKUI.noticeBodyHtml(body || "")}</div>`;
      });
      overlay.querySelector(".hk-dialog").style.maxWidth = "820px";
      HKUI.refreshIcons(bodyEl);
    }

    function listHtml(items) {
      if (!items.length) {
        return HKUI.emptyState({ iconName: C.icon, title: `등록된 ${C.noun}가 없어요`, desc: "오른쪽 위 '새 글'로 첫 글을 작성해 보세요." });
      }
      return `<div class="hk-card" style="overflow:hidden">${items.map((n) => `
        <div style="display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid var(--color-mist)">
          ${n.pinned ? HKUI.badge("고정", "info") : ""}${n.published ? "" : HKUI.badge("숨김", "neutral")}${n.published && n.scheduled ? HKUI.badge("예약", "warning") : ""}
          <div style="flex:1;min-width:0"><div style="font-weight:700;color:var(--color-midnight-navy)">${HKUI.escapeHtml(n.title)}</div><div style="font-size:12px;color:var(--text-muted)">${n.scheduled ? `${dateLabel(n.publishedAt)} ${String(n.publishedAt).slice(11, 16)} 공개 예정` : dateLabel(n.publishedAt)}</div></div>
          ${n.scheduled
            ? `<button type="button" class="hk-btn hk-btn--ghost hk-btn--sm" data-preview="${n.id}">미리보기</button>`
            : `<a href="${n.category === "HEALTH" ? "/health" : "/notice"}?id=${n.id}" target="_blank" rel="noopener" class="hk-btn hk-btn--ghost hk-btn--sm">보기</a>`}
          <button type="button" class="hk-btn hk-btn--secondary hk-btn--sm" data-edit="${n.id}">수정</button>
          <button type="button" class="hk-btn hk-btn--secondary hk-btn--sm" data-delete="${n.id}">삭제</button>
        </div>`).join("")}</div>`;
    }

    function formHtml(n) {
      return `<div class="hk-card hk-card--pad">
        <h2 style="font-size:18px;margin:0 0 14px">${n ? `${C.label} 수정` : `새 ${C.label}`}</h2>
        <label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px">제목</label>
        <input type="text" class="hk-input" id="nt-title" maxlength="200" style="width:100%;margin-bottom:14px" value="${HKUI.escapeHtml(n?.title || "")}">
        <label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px">내용 <span style="font-weight:400;color:var(--text-muted)">— "## 아이콘 | 소제목", "- 목록", "> 강조", "| 표 |", ":::cards / :::flow / :::stamps / :::compare / :::bars / :::check / :::stats", "**굵게**", "{br}" 줄바꿈, 빈 줄로 문단</span></label>
        <textarea class="hk-input" id="nt-body" rows="16" style="width:100%;min-height:340px;height:auto;resize:vertical;padding:12px;font-family:inherit;line-height:1.6">${HKUI.escapeHtml(n?.body || "")}</textarea>
        <div style="display:flex;gap:18px;margin:12px 0 16px;font-size:14px">
          <label><input type="checkbox" id="nt-pinned" ${n?.pinned ? "checked" : ""}> ${C.pinLabel}</label>
          <label><input type="checkbox" id="nt-published" ${!n || n.published ? "checked" : ""}> 공개</label>
        </div>
        <label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px">공개 일시 <span style="font-weight:400;color:var(--text-muted)">— 비워 두면 저장 즉시 공개 · 미래 시각이면 그때 자동 공개 (게시 예약)</span></label>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:16px">
          <input type="datetime-local" class="hk-input" id="nt-publish-at" style="width:240px" value="${localValue(n?.publishedAt)}">
          ${C.category === "HEALTH" ? '<button type="button" class="hk-btn hk-btn--ghost hk-btn--sm" id="nt-next-tue">다음 화요일 09:00</button>' : ""}
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button type="button" class="hk-btn hk-btn--ghost" id="nt-preview" style="margin-right:auto">미리보기</button>
          <button type="button" class="hk-btn hk-btn--secondary" id="nt-cancel">취소</button>
          <button type="button" class="hk-btn hk-btn--primary" id="nt-save">저장</button>
        </div>
      </div>`;
    }

    HKAdmin.mountPage({
      active: C.active,
      render() {
        return `${HKAdmin.pageHead(C.title, C.desc, '<button type="button" class="hk-btn hk-btn--primary" id="nt-new">새 글</button>')}
          <div id="nt-form" style="margin-bottom:20px"></div>
          <div id="content"></div>`;
      },
      afterMount: async () => {
        const content = document.getElementById("content");
        const formEl = document.getElementById("nt-form");
        let items = [];

        function openForm(n) {
          editing = n;
          formEl.innerHTML = formHtml(n);
          formEl.scrollIntoView({ behavior: "smooth", block: "start" });
          document.getElementById("nt-cancel").onclick = () => (formEl.innerHTML = "");
          const nextTue = document.getElementById("nt-next-tue");
          if (nextTue) nextTue.onclick = () => (document.getElementById("nt-publish-at").value = nextTuesdayValue());
          document.getElementById("nt-preview").onclick = () =>
            openPreview(C.category, document.getElementById("nt-title").value, document.getElementById("nt-body").value);
          document.getElementById("nt-save").onclick = async () => {
            const payload = {
              category: C.category,
              title: document.getElementById("nt-title").value,
              body: document.getElementById("nt-body").value,
              pinned: document.getElementById("nt-pinned").checked,
              published: document.getElementById("nt-published").checked,
              publishedAt: document.getElementById("nt-publish-at").value || null,
            };
            try {
              await HKApi.adminSaveNotice(editing?.id || null, payload);
              HKUI.toast(`${C.label}를 저장했습니다`);
              formEl.innerHTML = "";
              load();
            } catch (e) {
              HKUI.toast(e.message || "저장하지 못했습니다", "danger");
            }
          };
        }

        async function load() {
          try {
            // 이 게시판 글만
            items = (await HKApi.adminNotices()).filter((n) => (n.category || "NOTICE") === C.category);
            content.innerHTML = listHtml(items);
            content.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => openForm(items.find((n) => n.id === Number(b.dataset.edit)))));
            content.querySelectorAll("[data-preview]").forEach((b) => (b.onclick = () => {
              const n = items.find((x) => x.id === Number(b.dataset.preview));
              openPreview(n.category, n.title, n.body);
            }));
            content.querySelectorAll("[data-delete]").forEach((b) => (b.onclick = async () => {
              const n = items.find((x) => x.id === Number(b.dataset.delete));
              if (!(await HKUI.confirmDialog(`${C.label}를 삭제할까요?`, `<b>${HKUI.escapeHtml(n.title)}</b> 글을 삭제합니다. 되돌릴 수 없어요.`, { confirmLabel: "삭제", confirmVariant: "danger" }))) return;
              try {
                await HKApi.adminDeleteNotice(n.id);
                HKUI.toast(`${C.label}를 삭제했습니다`);
                load();
              } catch (e) {
                HKUI.toast(e.message || "삭제하지 못했습니다", "danger");
              }
            }));
            HKUI.refreshIcons();
          } catch (e) {
            content.innerHTML = HKUI.alertBox("danger", "불러오기 실패", HKUI.escapeHtml(e.message || "글을 불러오지 못했습니다."));
          }
        }

        document.getElementById("nt-new").onclick = () => openForm(null);
        await load();
      },
    });
  }
  return { mount };
})();
