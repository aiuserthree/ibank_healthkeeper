// 매니지먼트 게임 공통 반응(fx) — 숫자 톡 · 동전 날아가기 · 통통 튀기 · 꽃가루 · 숫자 굴러가기 (mgmt-ui.css 와 함께)
//   HKFx.float(target, "+1,200원", { color })   target: 요소 또는 {x, y}(화면 좌표). 위로 떠오르며 사라지는 글자
//   HKFx.fly(fromEl, toEl, { n: 6, done })     동전(금색 구슬)이 from 에서 to 로 날아가고, 도착하면 to 가 통통
//   HKFx.bump(el)                              한 번 통통(크기 튀기)
//   HKFx.confetti({ x, y, n })                 꽃가루(레벨 업 · 완주)
//   HKFx.count(el, from, to, { ms, fmt })      숫자가 굴러 올라간다(fmt: 숫자 → 글자)
// 움직임 줄이기 설정이면 모두 바로 끝난다.
window.HKFx = (function () {
  const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pt = (t) => {
    if (!t) return { x: innerWidth / 2, y: innerHeight / 2 };
    if (typeof t.x === "number") return t;
    const r = t.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  function float(target, text, opts = {}) {
    if (reduce()) return;
    const p = pt(target);
    const el = document.createElement("div");
    el.className = "mgx-float";
    el.textContent = text;
    el.style.left = `${p.x + (opts.dx || 0)}px`;
    el.style.top = `${p.y - 10 + (opts.dy || 0)}px`;
    if (opts.color) el.style.setProperty("--c", opts.color);
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 950);
  }

  function bump(el) {
    if (!el || reduce()) return;
    el.classList.remove("mgx-bump");
    void el.offsetWidth;
    el.classList.add("mgx-bump");
    setTimeout(() => el.classList.remove("mgx-bump"), 500);
  }

  function fly(fromEl, toEl, opts = {}) {
    const done = opts.done || (() => {});
    if (reduce() || !fromEl || !toEl) { bump(toEl); done(); return; }
    const a = pt(fromEl), b = pt(toEl), n = Math.max(1, Math.min(12, opts.n || 6));
    let left = n;
    for (let i = 0; i < n; i++) {
      const c = document.createElement("div");
      c.className = "mgx-coin";
      if (opts.color) c.style.background = opts.color;
      document.body.appendChild(c);
      const sx = a.x + (Math.random() - 0.5) * 40, sy = a.y + (Math.random() - 0.5) * 30;
      const mx = (sx + b.x) / 2 + (Math.random() - 0.5) * 120, my = Math.min(sy, b.y) - 60 - Math.random() * 60;
      const dur = 520 + Math.random() * 220, delay = i * 45;
      const t0 = performance.now() + delay;
      const step = (now) => {
        const t = Math.min(1, Math.max(0, (now - t0) / dur));
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const x = (1 - e) * (1 - e) * sx + 2 * (1 - e) * e * mx + e * e * b.x;
        const y = (1 - e) * (1 - e) * sy + 2 * (1 - e) * e * my + e * e * b.y;
        c.style.transform = `translate(${x}px, ${y}px) scale(${1 - e * 0.35})`;
        c.style.left = "0"; c.style.top = "0";
        if (t < 1) requestAnimationFrame(step);
        else { c.remove(); bump(toEl); if (--left === 0) done(); }
      };
      c.style.transform = `translate(${sx}px, ${sy}px)`;
      c.style.left = "0"; c.style.top = "0";
      requestAnimationFrame(step);
    }
  }

  function confetti(opts = {}) {
    if (reduce()) return;
    const p = opts.x != null ? opts : { x: innerWidth / 2, y: innerHeight * 0.35 };
    const colors = opts.colors || ["#ff6b6b", "#ffb020", "#4ade80", "#60a5fa", "#c084fc", "#f472b6"];
    const n = opts.n || 60;
    for (let i = 0; i < n; i++) {
      const c = document.createElement("div");
      c.className = "mgx-confetti";
      c.style.background = colors[i % colors.length];
      document.body.appendChild(c);
      const ang = Math.random() * Math.PI * 2, sp = 4 + Math.random() * 7;
      let x = p.x, y = p.y, vx = Math.cos(ang) * sp, vy = Math.sin(ang) * sp - 6, rot = Math.random() * 360, vr = (Math.random() - 0.5) * 24;
      const t0 = performance.now(), life = 1300 + Math.random() * 700;
      const step = (now) => {
        const k = (now - t0) / life;
        vy += 0.32; vx *= 0.985; x += vx; y += vy; rot += vr;
        c.style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg)`;
        c.style.opacity = String(Math.max(0, 1 - k * k));
        if (k < 1) requestAnimationFrame(step); else c.remove();
      };
      c.style.left = "0"; c.style.top = "0";
      requestAnimationFrame(step);
    }
  }

  function count(el, from, to, opts = {}) {
    if (!el) return;
    const fmt = opts.fmt || ((v) => Math.round(v).toLocaleString("ko-KR"));
    if (reduce() || from === to) { el.textContent = fmt(to); return; }
    const ms = opts.ms || 600, t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - t, 3);
      el.textContent = fmt(from + (to - from) * e);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  return { float, fly, bump, confetti, count };
})();

// 단추를 눌러도 보던 자리 그대로 — 매니지먼트 게임에서는 「맨 위로」 단추(data-scroll-top) · 탭 막대 · 건물 짓기 같은 행동(HKMgmtTop)만 화면을 위로 올린다.
// 어떤 단추를 누른 뒤에든(레벨 올리기 · 고용 · 진열 · 도구 · 건설 · 탭 …) 화면이 위로 올라가면 바로 원래 자리로 되돌린다.
//  · 탭을 바꿔 내용이 짧아지면 페이지가 짧아져 브라우저가 위로 당긴다 — 그만큼 페이지 끝에 빈 칸(spacer)을 덧대 그 자리에 머문다.
//    빈 칸은 사람이 위로 스크롤하는 만큼 줄어들어 사라진다(되튀지 않게).
//  · 아래로 내려 보여 주는 것은 그대로 두고, 사람이 직접 휠 · 터치 · 키로 움직이면 바로 놓아준다.
(function keepScrollOnTap() {
  let guard = null, spacer = null, pad = 0;
  const natural = () => document.documentElement.scrollHeight - pad;
  function setPad(px) {
    px = Math.max(0, Math.round(px));
    if (px === pad) return;
    if (!spacer) { spacer = document.createElement("div"); spacer.setAttribute("aria-hidden", "true"); spacer.style.cssText = "width:1px;pointer-events:none"; }
    if (px && !spacer.isConnected) document.body.appendChild(spacer);
    spacer.style.height = px + "px";
    pad = px;
  }
  const check = () => {
    if (!guard) return;
    if (performance.now() > guard.until) { guard = null; return; }
    const need = guard.y + innerHeight - natural(); // 원래 자리를 지키려면 모자란 높이
    if (need > pad) setPad(need);
    if (scrollY < guard.y - 2) window.scrollTo({ top: guard.y, behavior: "instant" });
    requestAnimationFrame(check);
  };
  // 탭 막대(.mgx-dock — 휴대폰은 아래 고정, PC 는 위)로 탭을 바꾸면 늘 맨 위에서 시작한다
  let topUntil = 0;
  const toTop = () => {
    if (performance.now() > topUntil) return;
    if (scrollY > 0) window.scrollTo({ top: 0, behavior: "instant" });
    requestAnimationFrame(toTop);
  };
  // 맨 위로 — 탭이 바뀌며 아래로 내려 보여 주는 움직임이 있어도 0.4초 동안 맨 위를 지킨다
  function goTop() {
    guard = null; setPad(0);
    topUntil = performance.now() + 400;
    if (scrollY > 0) window.scrollTo({ top: 0, behavior: "instant" });
    setTimeout(toTop, 0); requestAnimationFrame(toTop);
  }
  // 건물 짓기 · 땅 사기 · 텃밭 넓히기 · 꾸미기 사기처럼 위쪽 그림에 무언가가 생기는 행동이 성공하면 게임이 부른다 — 생긴 것을 바로 보게
  window.HKMgmtTop = goTop;
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (t && t.closest && t.closest(".mgx-dock [role='tab'], .mgx-dock .mgx-tab")) { goTop(); return; }
    if (!t || !t.closest || t.closest("[data-scroll-top]") || scrollY < 4) return;
    if (!t.closest("button, a, [data-act], [role='tab'], [data-tab]")) return;
    guard = { y: scrollY, until: performance.now() + 1500 };
    setTimeout(check, 0);
    requestAnimationFrame(check);
  }, true);
  ["wheel", "touchmove", "keydown"].forEach((ev) => addEventListener(ev, () => { guard = null; topUntil = 0; }, { passive: true, capture: true }));
  // 덧댄 빈 칸 — 위로 스크롤하는 만큼 줄인다
  addEventListener("scroll", () => { if (pad && !guard) setPad(Math.min(pad, scrollY + innerHeight - natural())); }, { passive: true });
})();
