/** 숫자로 보는 헬스키퍼 — 서비스 소개·예약하기 공용 섹션 */
window.HKFun = (function () {
  const stretchTips = [
    ["목 옆 늘리기", "오른손으로 머리 왼쪽을 감싸 오른쪽으로 천천히 당겨 15초. 반대쪽도 똑같이.",
      '<path d="M12 58v-4c0-7 6-11 14-11h12c8 0 14 4 14 11v4"/><path d="M31 43l2-9"/><circle cx="36" cy="25" r="9"/><path d="M50 46c7-10 6-22-2-30-4-3-9-3-13-1"/><path class="a" d="M19 31c-2-6-1-12 3-17M17 15l5-1 1 5"/>'],
    ["어깨 으쓱 털기", "숨을 들이쉬며 어깨를 귀까지 올리고, 내쉬며 툭 떨어뜨리기를 5번.",
      '<circle cx="32" cy="18" r="9"/><path d="M14 58V42c0-5 4-9 9-9h18c5 0 9 4 9 9v16"/><path class="a" d="M6 46V30M3 33l3-3 3 3M58 46V30M55 33l3-3 3 3"/>'],
    ["가슴 열기", "양손을 등 뒤로 깍지 끼고 가슴을 앞으로 내밀며 10초 유지.",
      '<circle cx="30" cy="13" r="8"/><path d="M29 21c7 9 7 20 1 37"/><path d="M28 25c-9 5-12 13-10 22"/><path d="M14 46l7 2"/><path class="a" d="M42 32h14M51 27l5 5-5 5"/>'],
    ["손목 풀기", "팔을 앞으로 뻗어 손등을 반대 손으로 몸 쪽으로 당겨 10초씩.",
      '<path d="M3 20h30c7 0 11 4 11 11v13h-9V30H3"/><rect x="31" y="37" width="22" height="8" rx="4"/><path d="M53 41h8"/><path class="a" d="M40 57H24M29 52l-5 5 5 5"/>'],
    ["등 고양이 자세", "의자에 앉아 등을 둥글게 말았다가 펴기를 천천히 5번.",
      '<path d="M20 46h28M24 46v12M44 46v12"/><circle cx="38" cy="15" r="7"/><path d="M26 44C14 34 18 22 31 19"/><path d="M26 44h20v14"/><path d="M27 27l15 15"/><path class="a" d="M9 23c-3 6-3 13 0 19M5 26l4-3 2 5M5 39l4 3 2-5"/>'],
    ["눈 쉬어주기", "20분마다 6m 이상 먼 곳을 20초 바라보는 20-20-20 규칙.",
      '<path d="M4 26c7-9 14-13 21-13s14 4 21 13c-7 9-14 13-21 13S11 35 4 26z"/><circle cx="25" cy="26" r="6"/><path class="a" d="M50 26h10M56 22l4 4-4 4"/><text class="t" x="32" y="58" text-anchor="middle">20초</text>'],
    ["허리 비틀기", "의자에 앉아 상체를 좌우로 천천히 비틀어 각 10초씩.",
      '<circle cx="32" cy="12" r="8"/><path d="M19 50V34c0-5 4-9 9-9h8c5 0 9 4 9 9v16"/><path d="M12 56h40"/><path class="a" d="M9 38c8 8 38 8 46 0M50 35l5 3-3 5M14 35l-5 3 3 5"/>'],
    ["턱 당기기", "턱을 뒤로 당겨 이중턱을 만들듯 5초 유지, 거북목 예방에 좋아요.",
      '<circle cx="32" cy="24" r="13"/><path d="M45 21l4 3-4 3"/><path d="M27 36v8c-8 2-14 6-16 14M38 36v8c6 2 12 6 14 14"/><path class="a" d="M62 36H51M56 31l-5 5 5 5"/>'],
    ["종아리 펌프", "앉은 채로 발뒤꿈치 들었다 내리기 20번, 다리 붓기를 줄여요.",
      '<path d="M8 57h48"/><path d="M28 5v32"/><path d="M28 37l-5 9 23 9z"/><path class="a" d="M13 41v13M10 44l3-3 3 3M10 51l3 3 3-3"/>'],
    ["깊은 호흡", "4초 들이쉬고 4초 멈추고 6초 내쉬기를 3번. 긴장이 스르르.",
      '<circle cx="26" cy="18" r="9"/><path d="M8 58V46c0-5 4-9 9-9h18c5 0 9 4 9 9v12"/><path class="a" d="M42 14c3-3 6 3 9 0s6 3 9 0M42 23c3-3 6 3 9 0s6 3 9 0"/>'],
  ];
  const milestones = [
    [1, "첫 안마"], [5, "단골 입문"], [10, "단골 손님"], [20, "VIP"],
    [30, "헬스키퍼 마니아"], [50, "레전드"], [100, "명예의 전당"],
  ];
  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  function todayTip() {
    const key = HKUI.nowKst ? HKUI.nowKst() : new Date();
    const start = new Date(key.getFullYear(), 0, 0);
    const dayOfYear = Math.floor((key - start) / 86400000);
    return stretchTips[dayOfYear % stretchTips.length];
  }

  function countUp(root) {
    root.querySelectorAll("[data-count]").forEach((el) => {
      const target = Number(el.dataset.count) || 0;
      if (prefersReducedMotion || target <= 0) {
        el.textContent = target.toLocaleString("ko-KR");
        return;
      }
      const duration = 1100;
      const t0 = performance.now();
      const tick = (now) => {
        const p = Math.min(1, (now - t0) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * eased).toLocaleString("ko-KR");
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  function growBars(root) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      root.querySelectorAll("[data-width]").forEach((el) => { el.style.width = el.dataset.width; });
    }));
  }

  function funStat(iconName, tint, numHtml, label) {
    return `<div class="hk-fun-stat">
      <div class="hk-fun-stat__icon" style="background:${tint.bg}">${HKUI.icon(iconName, 19, tint.fg)}</div>
      <div class="hk-fun-stat__num">${numHtml}</div>
      <div class="hk-fun-stat__label">${label}</div>
    </div>`;
  }

  function cardHead(iconName, tint, title, badge) {
    return `<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:4px 12px;margin-bottom:6px">
      <div style="display:flex;align-items:center;gap:10px">
        <div class="hk-fun-stat__icon" style="margin:0;background:${tint.bg}">${HKUI.icon(iconName, 19, tint.fg)}</div>
        <b style="font-size:17px;color:var(--color-midnight-navy)">${title}</b>
      </div>
      ${badge ? `<span class="hk-badge hk-badge--soft">${badge}</span>` : ""}
    </div>`;
  }

  function heatmapCard(heat) {
    const head = cardHead("grid-3x3", { bg: "#efe8ff", fg: "var(--color-ultraviolet)" }, "꿀타임 지도", "평균 신청 인원");
    if (!heat) {
      return `<div class="hk-card hk-card--pad">${head}
        <div style="padding:28px 8px;text-align:center;color:var(--text-secondary);font-size:14.5px;line-height:1.6">
          ${HKUI.icon("sparkles", 26, "var(--color-steel-blue)")}<br>신청 기록이 쌓이면 여유로운 시간을 알려드릴게요.
        </div>
      </div>`;
    }
    const values = heat.cells.flat().filter((v) => v != null);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const level = (v) => (max === min ? 2 : Math.min(4, Math.floor(((v - min) / (max - min)) * 5)));
    const esc = HKUI.escapeHtml;
    return `<div class="hk-card hk-card--pad">${head}
      <p style="font-size:12.5px;color:var(--text-muted);margin:0 0 12px">색이 옅을수록 신청이 덜 몰려 확정될 가능성이 높아요</p>
      <table class="hk-heat">
        <thead><tr><th></th>${heat.days.map((day) => `<th scope="col">${esc(day)}</th>`).join("")}</tr></thead>
        <tbody>${heat.times.map((t, c) => `<tr><th scope="row">${esc(t)}</th>${heat.cells.map((row) => row[c]).map((v) =>
          v == null ? `<td class="hk-heat__cell hk-heat__cell--empty">-</td>`
            : `<td class="hk-heat__cell hk-heat__cell--${level(v)}">${v.toFixed(1)}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
      <div class="hk-heat__legend" aria-hidden="true"><span>여유</span>${[0, 1, 2, 3, 4].map((n) => `<i class="hk-heat__cell--${n}"></i>`).join("")}<span>치열</span></div>
      <div style="margin-top:12px;padding-top:12px;border-top:1px dashed var(--border-default);font-size:14px;color:var(--color-midnight-navy);display:flex;align-items:flex-start;gap:8px">${HKUI.icon("lightbulb", 16, "var(--color-warning)", "flex-shrink:0;margin-top:2px")}<span>가장 여유로운 시간은 <b style="color:var(--color-signal-blue)">${esc(heat.calm.day)}요일 ${esc(heat.calm.time)}</b>, 가장 치열한 시간은 <b>${esc(heat.busy.day)}요일 ${esc(heat.busy.time)}</b>이에요.</span></div>
    </div>`;
  }

  function deptRows(rows) {
    const max = Math.max(1, ...rows.map((r) => r.uses));
    return `<ol class="hk-rank-list">${rows.map((r) => `
      <li class="hk-rank-row${r.isMine ? " hk-rank-row--me" : ""}">
        <span class="hk-rank-medal${r.rank <= 3 ? ` hk-rank-medal--${r.rank}` : ""}">${r.rank === 1 ? HKUI.icon("crown", 15, "#7a4d00") : r.rank}</span>
        <span class="hk-rank-name">${HKUI.escapeHtml(r.name)}${r.isMine ? ' <span class="hk-badge hk-badge--soft" style="padding:1px 7px;font-size:11px;background:#fff">우리 부서</span>' : ""}</span>
        <span class="hk-rank-bar"><span data-width="${Math.round((r.uses / max) * 100)}%"></span></span>
        <span class="hk-rank-uses">${r.uses}회</span>
      </li>`).join("")}</ol>`;
  }

  function departmentCard(stats, loggedIn) {
    const R = HKRoutes;
    const head = cardHead("swords", { bg: "var(--color-warning-soft)", fg: "var(--color-warning)" }, "부서 대항전", `${stats.year}년`);
    const board = stats.departments;
    if (!loggedIn || !board) {
      const fake = ["가", "나", "다", "라", "마", "바", "사", "아"].map((n, i) => ({ rank: i + 1, name: `${n}부서`, uses: 40 - i * 4, isMine: false }));
      return `<div class="hk-card hk-card--pad hk-rank-locked-card">${head}
        <div class="hk-rank-locked">
          <div aria-hidden="true">${deptRows(fake).replace(/data-width="([^"]+)"/g, 'style="width:$1"')}</div>
          <div class="hk-rank-locked__cta">
            ${HKUI.icon("lock-keyhole", 24, "var(--color-midnight-navy)")}
            <div style="font-size:15px;font-weight:700;color:var(--color-midnight-navy)">로그인하면 부서 순위를 볼 수 있어요</div>
            <a href="${R.login}?returnTo=${encodeURIComponent(location.pathname)}"><button type="button" class="hk-btn hk-btn--primary hk-btn--sm">로그인</button></a>
          </div>
        </div>
      </div>`;
    }
    if (!board.top.length) {
      return `<div class="hk-card hk-card--pad">${head}
        <div style="padding:28px 8px;text-align:center;color:var(--text-secondary);font-size:14.5px;line-height:1.6">
          ${HKUI.icon("sparkles", 26, "var(--color-steel-blue)")}<br>올해 이용 기록이 아직 없어요.<br>우리 부서가 첫 번째 주인공이 되어 보세요!
        </div>
      </div>`;
    }
    const mine = board.mine;
    let mineLine;
    if (mine) {
      mineLine = `우리 부서는 <b style="color:var(--color-signal-blue)">${mine.rank}위</b> · ${mine.uses}회 <span style="color:var(--text-muted)">(전체 ${board.total}개 부서)</span>`;
    } else if (board.myDepartment) {
      mineLine = `우리 부서는 올해 아직 기록이 없어요. 이번 주에 신청해 보세요!`;
    } else {
      mineLine = `부서 정보가 없어 우리 부서 순위를 표시할 수 없어요.`;
    }
    return `<div class="hk-card hk-card--pad">${head}
      <p style="font-size:12.5px;color:var(--text-muted);margin:0 0 12px">부서별 올해 이용 횟수 합계예요 · 동률은 같은 순위</p>
      ${deptRows(board.top)}
      <div style="margin-top:12px;padding-top:12px;border-top:1px dashed var(--border-default);font-size:14px;color:var(--color-midnight-navy);display:flex;align-items:center;gap:8px">${HKUI.icon("users-round", 16, "var(--color-slate-blue)")}<span>${mineLine}</span></div>
    </div>`;
  }

  function badgeGuide(total) {
    const current = milestones.filter(([n]) => total >= n).pop();
    return `<b>배지 안내</b> — 누적 이용 횟수에 따라 배지가 올라가요.
      <ul class="hk-badge-guide">${milestones.map((m) => `
        <li class="${total >= m[0] ? "is-reached" : ""}${m === current ? " is-current" : ""}">
          <span>${HKUI.icon(total >= m[0] ? "award" : "lock-keyhole", 14, "currentColor")} ${m[1]}${m === current ? " · 현재" : ""}</span>
          <span>${m[0]}회 이상</span>
        </li>`).join("")}</ul>`;
  }

  function myRecordCard(me) {
    const R = HKRoutes;
    const total = me.totalUses || 0;
    const reached = milestones.filter(([n]) => total >= n).pop();
    const next = milestones.find(([n]) => total < n);
    const prevN = reached ? reached[0] : 0;
    const pct = next ? Math.round(((total - prevN) / (next[0] - prevN)) * 100) : 100;
    let waitLine;
    if (me.daysSinceLastUse == null) {
      waitLine = `아직 이용 기록이 없어요. 지금 신청하면 <b>우선권 최상위</b>예요!`;
    } else if (me.daysSinceLastUse === 0) {
      waitLine = `오늘 안마 받으셨네요. 개운한 하루 되세요!`;
    } else {
      waitLine = `마지막 이용 후 <b>${me.daysSinceLastUse}일</b> — 오래 기다릴수록 우선권이 높아져요.`;
    }
    return `<div class="hk-card hk-card--pad">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px">
        <div style="display:flex;align-items:center;gap:10px">
          <div class="hk-fun-stat__icon" style="margin:0;background:var(--color-signal-blue-soft)">${HKUI.icon("medal", 19, "var(--color-signal-blue)")}</div>
          <b style="font-size:17px;color:var(--color-midnight-navy)">내 헬스키퍼 기록</b>
        </div>
        <div data-tooltip-root style="display:flex;align-items:center;gap:4px">
          ${reached ? `<span class="hk-badge hk-badge--soft">${HKUI.icon("award", 13, "currentColor")} ${reached[1]}</span>` : `<span class="hk-badge hk-badge--neutral">새싹</span>`}
          <button type="button" class="hk-tooltip-btn" aria-expanded="false" aria-controls="hk-tt-badges" aria-label="배지 안내" style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:none;background:transparent;cursor:pointer;border-radius:999px;color:var(--color-slate-blue)">${HKUI.icon("circle-help", 15, "currentColor")}</button>
          <div id="hk-tt-badges" class="hk-tooltip-panel" role="tooltip" hidden>${badgeGuide(total)}</div>
        </div>
      </div>
      <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:10px">
        <span class="hk-fun-stat__num" data-count="${total}">0</span><span style="font-size:15px;color:var(--text-secondary)">회 이용</span>
        ${me.yearTopPercent ? `<span class="hk-badge hk-badge--neutral" style="margin-left:auto">올해 이용자 중 상위 ${me.yearTopPercent}%</span>` : ""}
      </div>
      <div class="hk-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span data-width="${pct}%"></span></div>
      <div style="font-size:13px;color:var(--text-secondary);margin-top:8px">${next ? `다음 배지 <b style="color:var(--color-midnight-navy)">${next[1]}</b>까지 ${next[0] - total}회 남았어요` : "모든 배지를 모았어요. 진정한 헬스키퍼 마스터!"}</div>
      <div style="margin-top:14px;padding:12px 14px;border-radius:8px;background:var(--color-mist);font-size:14px;color:var(--color-midnight-navy);line-height:1.55;display:flex;gap:10px;align-items:flex-start">
        ${HKUI.icon("hourglass", 17, "var(--color-slate-blue)", "margin-top:2px;flex-shrink:0")}<span>${waitLine} <a href="${R.reserve}" style="color:var(--color-signal-blue);font-weight:600;text-decoration:none;white-space:nowrap">예약하기 →</a></span>
      </div>
    </div>`;
  }

  function tipCard() {
    const [title, body, art] = todayTip();
    return `<div class="hk-card hk-card--pad hk-card--flat" style="background:var(--surface-soft-blue, var(--color-signal-blue-soft));display:flex;align-items:center">
      <div style="display:flex;gap:16px;align-items:center">
        <div class="hk-stretch-art"><svg viewBox="0 0 64 64" role="img" aria-label="${title} 동작 그림">${art}</svg></div>
        <div>
          <div style="font-size:12.5px;font-weight:700;color:var(--color-signal-blue);letter-spacing:0.02em">오늘의 1분 스트레칭</div>
          <div style="font-size:16px;font-weight:700;color:var(--color-midnight-navy);margin:2px 0 4px">${title}</div>
          <div style="font-size:14.5px;color:var(--text-secondary);line-height:1.6">${body}</div>
        </div>
      </div>
    </div>`;
  }

  async function render(el, profile) {
    if (!el) return;
    let stats;
    try {
      stats = await HKApi.funStats();
    } catch (_) {
      return;
    }
    const loggedIn = !!profile;
    const blue = { bg: "var(--color-signal-blue-soft)", fg: "var(--color-signal-blue)" };
    const green = { bg: "var(--color-success-soft)", fg: "var(--color-success)" };
    const amber = { bg: "var(--color-warning-soft)", fg: "var(--color-warning)" };
    const violet = { bg: "#efe8ff", fg: "var(--color-ultraviolet)" };
    const peak = stats.peakTime ? HKUI.escapeHtml(stats.peakTime.label) : "-";
    const peakLabel = stats.peakWeekday
      ? `인기 시간 · ${HKUI.escapeHtml(stats.peakWeekday.label)}요일 최다`
      : "인기 시간";
    el.innerHTML = `
      <span class="hk-badge hk-badge--soft">숫자로 보는 헬스키퍼</span>
      <h2 style="font-size:34px;margin:14px 0 8px">지금까지 <span style="color:var(--color-signal-blue)" data-count="${stats.totalUses}">0</span>번, 뭉친 어깨가 풀렸어요</h2>
      <p style="font-size:17px;color:var(--text-secondary);margin:0 0 28px">함께한 동료들의 기록이에요. 여유로운 시간도 미리 확인해 보세요.</p>
      <div class="hk-fun-grid">
        <div class="hk-fun-col">
          <div class="hk-fun-stats">
            ${funStat("hand-heart", blue, `<span data-count="${stats.totalUses}">0</span><small>회</small>`, "누적 이용")}
            ${funStat("users-round", green, `<span data-count="${stats.totalUsers}">0</span><small>명</small>`, "함께한 동료")}
            ${funStat("calendar-heart", amber, `<span data-count="${stats.monthUses}">0</span><small>회</small>`, `${stats.month}월 이용`)}
            ${funStat("flame", violet, peak, peakLabel)}
          </div>
          ${heatmapCard(stats.heatmap)}
          ${tipCard()}
        </div>
        <div class="hk-fun-col">
          ${loggedIn && stats.me ? myRecordCard(stats.me) : ""}
          ${departmentCard(stats, loggedIn)}
        </div>
      </div>`;
    el.hidden = false;
    HKUI.bindTooltips(el);
    HKUI.refreshIcons();
    countUp(el);
    growBars(el);
  }

  return { render };
})();
