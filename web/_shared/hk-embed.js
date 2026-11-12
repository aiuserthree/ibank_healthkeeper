/*
 * 바깥 게임 끼워 넣기 — 다른 곳(힉스필드 등)에 올린 게임을 아케이드 화면 안에 창(iframe)으로 넣고,
 * 판 시작 · 점수를 헬스키퍼 순위 · 참여 도장으로 잇는다.
 *
 *   <script src="/_shared/hk-embed.js"></script>
 *   HKEmbed.mount({ key: "게임키", src: "https://이름.higgsfield.app/", origin: "https://이름.higgsfield.app" });
 *
 * 게임 쪽은 부모 창(헬스키퍼)으로 postMessage 를 보낸다 — 받는 쪽 주소를 꼭 적을 것:
 *   parent.postMessage({ type: "hk:start" }, "https://healthkeeper.ibank.co.kr");      // 판 시작(도장용 판 길이 재기 시작)
 *   parent.postMessage({ type: "hk:live", score: 1234 }, "https://healthkeeper.ibank.co.kr");  // 지금 점수(중간에 나가며 기록 남기기용, 선택)
 *   parent.postMessage({ type: "hk:score", score: 1234 }, "https://healthkeeper.ibank.co.kr"); // 판 끝 — 이 점수가 순위에 올라간다
 * 헬스키퍼가 게임에 보내는 것:
 *   { type: "hk:hello" }   — 창을 띄우면(게임이 hk:ready 를 보내면) 한 번. 게임은 이걸 받으면 「헬스키퍼 안」으로 보고 자체 순위 · 로그인을 숨긴다
 *   { type: "hk:pause" }   — 일시정지(나가기 확인 창 등)
 *   { type: "hk:restart" } — 다시 하기
 *
 * 지켜 둔 것
 * - 정해 둔 주소(origin)에서, 우리가 띄운 그 창이 보낸 말만 받는다.
 * - 점수는 0 이상 정수 · 판을 시작한 뒤에만 · 한 판에 한 번만 받는다(같은 점수가 두 번 올라가지 않게).
 * - 창은 sandbox — 게임이 헬스키퍼 화면을 다른 곳으로 옮기거나 새 창을 띄우지 못하게 한다.
 * - 회원 이름 · 메일 같은 개인 정보는 게임 쪽으로 보내지 않는다.
 */
window.HKEmbed = (() => {
  function mount({ key, src, origin, title }) {
    HKPlay.mountGame({
      key,
      setup(stage, ctx) {
        stage.innerHTML = `<div class="hk-embed" style="position:relative;width:100%;height:100%;min-height:360px;border-radius:16px;overflow:hidden;background:#0f172a">
            <iframe class="hk-embed__frame" title="${HKUI.escapeHtml(title || ctx.game.title || key)}" src="${HKUI.escapeHtml(src)}"
              allow="autoplay; fullscreen; gamepad" sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-forms"
              referrerpolicy="no-referrer" style="position:absolute;inset:0;width:100%;height:100%;border:0;display:block"></iframe>
            <div class="hk-embed__load" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#cbd5e1;font-size:14px;gap:8px"><span class="hk-spin"></span> 게임을 불러오는 중이에요</div>
          </div>`;
        const frame = stage.querySelector("iframe");
        const loading = stage.querySelector(".hk-embed__load");
        const send = (msg) => { try { frame.contentWindow.postMessage(msg, origin); } catch (_) {} };
        let running = false; // 판 시작(hk:start) 뒤 점수(hk:score) 전까지
        let live = 0, liveOn = false;
        const toScore = (v) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);

        frame.addEventListener("load", () => { loading.remove(); send({ type: "hk:hello" }); });
        window.addEventListener("message", async (e) => {
          if (e.origin !== origin || e.source !== frame.contentWindow) return;
          const m = e.data && typeof e.data === "object" ? e.data : {};
          if (m.type === "hk:ready") return send({ type: "hk:hello" });
          if (m.type === "hk:start") {
            running = true; live = 0;
            ctx.started();
            return;
          }
          if (m.type === "hk:live") {
            const v = toScore(m.score);
            if (running && v != null) live = v;
            // 지금 점수를 보내는 게임만 「기록 남기고 나가기」를 쓴다
            if (!liveOn && ctx.onScore) { liveOn = true; ctx.onScore(() => live); }
            return;
          }
          if (m.type === "hk:score") {
            const v = toScore(m.score);
            if (!running || v == null) return; // 시작 안 한 판 · 이상한 값 · 두 번째 보고는 버린다
            running = false;
            live = 0;
            await ctx.submit(v);
          }
        });
        ctx.onPause(() => send({ type: "hk:pause" }));
        ctx.onRestart(() => { running = false; live = 0; send({ type: "hk:restart" }); });
      },
    });
  }
  return { mount };
})();
