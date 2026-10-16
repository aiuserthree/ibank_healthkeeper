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
      '<g transform="translate(0 12)"><path d="M2 36h20M2 46h20"/><path d="M22 46c8 0 12-4 12-10V14a2.5 2.5 0 0 0-5 0v12M29 26V10a2.5 2.5 0 0 0-5 0v16M24 26V12a2.5 2.5 0 0 0-5 0v24"/><path d="M34 14l4-2a2.5 2.5 0 0 1 3 4l-7 6"/><path d="M60 6L44 10c-2 1-2 4 0 4l16 2"/></g><path class="a" d="M44 13C38 4 26 3 18 9M22 4l-4 5 6 2"/>'],
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
    ["어깨 돌리기", "어깨로 큰 원을 그리듯 앞으로 5번, 뒤로 5번 천천히 돌려요.",
      '<circle cx="32" cy="18" r="9"/><path d="M14 58V42c0-5 4-9 9-9h18c5 0 9 4 9 9v16"/><path class="a" d="M11 44a7 7 0 1 1 6-11M14 31l3 2-1 3M53 44a7 7 0 1 0-6-11M50 31l-3 2 1 3"/>'],
    ["옆구리 늘리기", "한 팔을 머리 위로 뻗어 반대쪽으로 천천히 기울이고 10초씩.",
      '<circle cx="35" cy="17" r="7"/><path d="M20 58c0-12 3-21 9-28M44 58c0-10 1-17 4-22"/><path d="M26 34C18 22 24 6 44 8"/><path class="a" d="M50 14c5 3 8 8 8 14M55 25l3 4 3-4"/>'],
    ["손가락 쥐었다 펴기", "주먹을 꽉 쥐었다가 손가락을 활짝 펴기를 10번, 손 저림에 좋아요.",
      '<rect x="5" y="26" width="18" height="20" rx="6"/><path d="M11 26v8M17 26v8"/><path d="M38 52V34M38 34V16M44 34V12M50 34V14M56 36V20M38 44c-4-2-6-6-5-10M38 52h18V36"/><path class="a" d="M26 36h7M30 33l3 3-3 3"/>'],
    ["발목 돌리기", "앉은 채 한 발을 살짝 들어 발목을 안쪽·바깥쪽으로 5번씩 돌려요.",
      '<path d="M14 2v30c0 4 3 7 7 7h15c3 0 5-2 5-5s-2-5-5-5H24V2"/><path class="a" d="M8 46c4 10 30 12 40 2M44 44l4 4 1-5M48 20c-6-6-18-6-24-2M28 14l-4 4 5 2"/>'],
    ["팔 앞으로 뻗기", "깍지 낀 팔을 앞으로 쭉 뻗고 등을 둥글게 말아 10초 유지.",
      '<circle cx="18" cy="13" r="7"/><path d="M13 46c-6-8-5-18 5-25"/><path d="M19 26h34"/><circle cx="55" cy="26" r="2.5"/><path d="M13 46h22v12"/><path class="a" d="M40 37h15M50 33l5 4-5 4"/>'],
    ["무릎 당기기", "의자에 앉아 한쪽 무릎을 두 팔로 가슴 쪽으로 당겨 10초씩.",
      '<circle cx="26" cy="11" r="7"/><path d="M24 19v26"/><path d="M24 45l14-14 4 15"/><path d="M24 27l14 6"/><path d="M14 47h26M18 47v11M36 47v11"/><path class="a" d="M54 36c0-8-4-13-11-15M44 18l-2 3 3 3"/>'],
    ["기지개 켜기", "깍지 낀 손바닥을 하늘로 향하게 쭉 뻗어 온몸을 늘리고 10초.",
      '<circle cx="32" cy="28" r="6"/><path d="M16 58V48c0-5 4-8 8-8h16c4 0 8 3 8 8v10"/><path d="M21 40L30 5M43 40L34 5"/><path d="M29 4h6"/><path class="a" d="M8 34V18M5 21l3-3 3 3M56 34V18M53 21l3-3 3 3"/>'],
    ["고개 끄덕이기", "천천히 천장을 봤다가 바닥을 보기를 5번, 반동 없이 부드럽게.",
      '<circle cx="30" cy="22" r="12"/><path d="M42 19l4 3-4 3"/><path d="M25 34v8c-8 2-13 6-15 14M36 34v8c6 2 11 6 13 14"/><path class="a" d="M56 10v24M53 13l3-3 3 3M53 31l3 3 3-3"/>'],
    ["다리 뒤 늘리기", "앉아서 한쪽 다리를 앞으로 펴고 발끝을 몸 쪽으로 당겨 10초씩.",
      '<circle cx="20" cy="11" r="7"/><path d="M19 19v22"/><path d="M19 41h38v-9"/><path d="M19 26l12 8"/><path d="M8 43h22M12 43v15M27 43v15"/><path class="a" d="M60 26c-2-6-6-9-12-9M50 14l-3 3 3 3"/>'],
    ["날개뼈 모으기", "양 팔꿈치를 뒤로 당겨 날개뼈를 모으고 5초 유지, 5번 반복.",
      '<circle cx="32" cy="13" r="8"/><path d="M19 58V40c0-6 6-10 13-10s13 4 13 10v18"/><path d="M19 38l-9 8 9 6M45 38l9 8-9 6"/><path class="a" d="M24 46h6M27 43l3 3-3 3M40 46h-6M37 43l-3 3 3 3"/>'],
  ];
  const milestones = HKUI.USAGE_BADGES;
  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const STRETCH_ROLL_COUNT = 3;
  const STRETCH_ROLL_MS = 5000;

  /** 오늘의 스트레칭부터 순서대로 N개 — 첫 번째가 팀즈 오픈 안내에 나가는 것과 같다. */
  function todayTips() {
    const key = HKUI.nowKst ? HKUI.nowKst() : new Date();
    const start = new Date(key.getFullYear(), 0, 0);
    const dayOfYear = Math.floor((key - start) / 86400000);
    return Array.from({ length: STRETCH_ROLL_COUNT }, (_, i) => stretchTips[(dayOfYear + i) % stretchTips.length]);
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
    return `<div class="hk-card hk-card--pad hk-heat-card">${head}
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
    return `<div class="hk-card hk-card--pad hk-dept-card">${head}
      <p style="font-size:12.5px;color:var(--text-muted);margin:0 0 12px">부서별 올해 이용 횟수 합계예요 · 동률은 같은 순위</p>
      ${deptRows(board.top)}
      <div style="margin-top:12px;padding-top:12px;border-top:1px dashed var(--border-default);font-size:14px;color:var(--color-midnight-navy);display:flex;align-items:center;gap:8px">${HKUI.icon("users-round", 16, "var(--color-slate-blue)")}<span>${mineLine}</span></div>
    </div>`;
  }

  function couponDeadline(c) {
    const soonest = (c.coupons || [])
      .filter((x) => x.status === "AVAILABLE" && x.expiresAt)
      .map((x) => new Date(new Date(x.expiresAt).getTime() - 1))
      .sort((a, b) => a - b)[0];
    return soonest ? ` · ${soonest.getMonth() + 1}/${soonest.getDate()}까지 사용` : "";
  }

  function couponLine(c) {
    if (!c) return "";
    const pct = Math.round((c.dropProgress / c.dropPerCoupon) * 100);
    return `<div class="hk-coupon-line">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
        <span style="display:inline-flex;align-items:center;gap:6px;font-weight:700;color:var(--color-ultraviolet)">${HKUI.icon("ticket", 16, "currentColor")} 무적 쿠폰 ${c.available}장</span>
        <a href="${HKRoutes.notice}" style="font-size:12.5px;color:var(--color-slate-blue);text-decoration:none">쿠폰 안내 →</a>
      </div>
      <div class="hk-progress hk-progress--coupon" style="margin-top:8px" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span data-width="${pct}%"></span></div>
      <div style="font-size:12.5px;color:var(--text-secondary);margin-top:6px">탈락 ${c.dropProgress}/${c.dropPerCoupon} · 다음 쿠폰까지 ${c.dropPerCoupon - c.dropProgress}회${couponDeadline(c)}${c.badgeMonthlyQuota ? ` · 등급 혜택 매월 ${c.badgeMonthlyQuota}장` : ""}</div>
    </div>`;
  }

  function myRecordCard(me, profile) {
    const R = HKRoutes;
    // 헤더 배지·마이페이지 누적 이용과 같은 값을 쓴다.
    const total = (profile?.totalUses ?? me.totalUses) || 0;
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
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px 12px;margin-bottom:14px">
        <div style="display:flex;align-items:center;gap:10px">
          <div class="hk-fun-stat__icon" style="margin:0;background:var(--color-signal-blue-soft)">${HKUI.icon("medal", 19, "var(--color-signal-blue)")}</div>
          <b style="font-size:17px;color:var(--color-midnight-navy);white-space:nowrap">내 헬스키퍼 기록</b>
        </div>
      </div>
      <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:10px">
        <span class="hk-fun-stat__num" data-count="${total}">0</span><span style="font-size:15px;color:var(--text-secondary)">회 이용</span>
        ${me.yearTopPercent ? `<span class="hk-badge hk-badge--neutral" style="margin-left:auto">올해 이용자 중 상위 ${me.yearTopPercent}%</span>` : ""}
      </div>
      <div class="hk-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span data-width="${pct}%"></span></div>
      <div style="font-size:13px;color:var(--text-secondary);margin-top:8px">${next ? `다음 배지 <b style="color:var(--color-midnight-navy)">${next[1]}</b>까지 ${next[0] - total}회 남았어요` : "모든 배지를 모았어요. 진정한 헬스키퍼 마스터!"}</div>
      ${couponLine(profile?.coupons)}
      <div style="margin-top:14px;padding:12px 14px;border-radius:8px;background:var(--color-mist);font-size:14px;color:var(--color-midnight-navy);line-height:1.55;display:flex;gap:10px;align-items:flex-start">
        ${HKUI.icon("hourglass", 17, "var(--color-slate-blue)", "margin-top:2px;flex-shrink:0")}<span>${waitLine} <a href="${R.reserve}" style="color:var(--color-signal-blue);font-weight:600;text-decoration:none;white-space:nowrap">예약하기 →</a></span>
      </div>
    </div>`;
  }

  function tipCard() {
    const tips = todayTips();
    return `<div class="hk-card hk-card--pad hk-card--flat hk-stretch" data-stretch>
      <div class="hk-stretch__slides">${tips.map(([title, body, art], i) => `
        <div class="hk-stretch__slide${i === 0 ? " is-active" : ""}" data-stretch-slide${i === 0 ? "" : ' aria-hidden="true"'}>
          <div class="hk-stretch-art"><svg viewBox="0 0 64 64" role="img" aria-label="${title} 동작 그림">${art}</svg></div>
          <div>
            <div style="font-size:12.5px;font-weight:700;color:var(--color-signal-blue);letter-spacing:0.02em">오늘의 1분 스트레칭</div>
            <div style="font-size:16px;font-weight:700;color:var(--color-midnight-navy);margin:2px 0 4px">${title}</div>
            <div style="font-size:14.5px;color:var(--text-secondary);line-height:1.6">${body}</div>
          </div>
        </div>`).join("")}
      </div>
      <div class="hk-stretch__dots">${tips.map(([title], i) => `<button type="button" class="hk-stretch__dot${i === 0 ? " is-active" : ""}" data-stretch-dot="${i}" aria-label="${i + 1}번째 스트레칭: ${title}"></button>`).join("")}</div>
    </div>`;
  }

  function bindStretchRoll(root) {
    const card = root.querySelector("[data-stretch]");
    if (!card) return;
    const slides = [...card.querySelectorAll("[data-stretch-slide]")];
    const dots = [...card.querySelectorAll("[data-stretch-dot]")];
    let current = 0;
    let timer = null;
    const show = (index) => {
      current = (index + slides.length) % slides.length;
      slides.forEach((slide, i) => {
        slide.classList.toggle("is-active", i === current);
        if (i === current) slide.removeAttribute("aria-hidden");
        else slide.setAttribute("aria-hidden", "true");
      });
      dots.forEach((dot, i) => dot.classList.toggle("is-active", i === current));
    };
    const stop = () => { clearInterval(timer); timer = null; };
    const start = () => {
      if (prefersReducedMotion || timer || slides.length < 2) return;
      timer = setInterval(() => show(current + 1), STRETCH_ROLL_MS);
    };
    dots.forEach((dot, i) => dot.addEventListener("click", () => { stop(); show(i); start(); }));
    card.addEventListener("mouseenter", stop);
    card.addEventListener("mouseleave", start);
    card.addEventListener("focusin", stop);
    card.addEventListener("focusout", start);
    start();
  }

  // 부서 대항전 — 모바일은 8위까지, PC는 왼쪽 열 높이에 맞는 만큼 보여준다.
  const DEPT_MIN_ROWS = 8;
  function fitDeptRows(root) {
    const card = root.querySelector(".hk-dept-card");
    if (!card) return;
    const rows = [...card.querySelectorAll(".hk-rank-row")];
    rows.forEach((row, i) => row.classList.toggle("is-cut", i >= DEPT_MIN_ROWS));
    const heat = root.querySelector(".hk-heat-card");
    if (!heat || window.matchMedia("(max-width: 860px)").matches) return;
    // 오른쪽 열이 왼쪽보다 길어지면 꿀타임 지도가 늘어나므로, 그 직전까지 한 줄씩 늘린다.
    const base = heat.getBoundingClientRect().height;
    for (let i = DEPT_MIN_ROWS; i < rows.length; i++) {
      rows[i].classList.remove("is-cut");
      if (heat.getBoundingClientRect().height > base + 0.5) {
        rows[i].classList.add("is-cut");
        break;
      }
    }
  }

  let fitResizeBound = false;
  function bindDeptFit(root) {
    fitDeptRows(root);
    document.fonts?.ready.then(() => fitDeptRows(root));
    if (fitResizeBound) return;
    fitResizeBound = true;
    let timer = null;
    window.addEventListener("resize", () => {
      clearTimeout(timer);
      timer = setTimeout(() => fitDeptRows(root), 150);
    });
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
    // 꿀타임 지도의 "가장 치열한 시간"과 같은 값
    const busy = stats.heatmap?.busy;
    const peak = busy ? `<small style="margin:0 4px 0 0">${HKUI.escapeHtml(busy.day)}</small>${HKUI.escapeHtml(busy.time)}` : "-";
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
            ${funStat("flame", violet, peak, "가장 치열한 시간")}
          </div>
          ${heatmapCard(stats.heatmap)}
          ${tipCard()}
        </div>
        <div class="hk-fun-col">
          ${departmentCard(stats, loggedIn)}
        </div>
      </div>`;
    el.hidden = false;
    HKUI.bindTooltips(el);
    bindStretchRoll(el);
    HKUI.refreshIcons();
    countUp(el);
    growBars(el);
    bindDeptFit(el);
  }

  /** 내 헬스키퍼 기록 카드만 (마이페이지) */
  async function renderMyRecord(el, profile) {
    if (!el || !profile) return;
    let stats;
    try {
      stats = await HKApi.funStats();
    } catch (_) {
      return;
    }
    if (!stats.me) return;
    // 등급 배지·안내는 옆 '내 이용 현황'에 있어 이 카드에는 넣지 않는다.
    el.innerHTML = myRecordCard(stats.me, profile);
    el.hidden = false;
    HKUI.bindTooltips(el);
    HKUI.refreshIcons();
    countUp(el);
    growBars(el);
  }

  return { render, renderMyRecord };
})();
