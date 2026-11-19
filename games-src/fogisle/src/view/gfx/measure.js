// 주는 것: GPU 계측 도우미 — makeMeasure(renderer) → { timer(시간 질의를 지원하는가) · frames(그리는 함수, n) → Promise<{ wallMs, gpuMs, gpuMin, n }> }.
// 받는 것: 전역 THREE 의 렌더러(WebGL2 문맥). 헤드리스의 측정은 다른 작업의 GPU 부하에 흔들린다(tdd 부록 A) — 부르는 쪽이 여러 번 재어 중앙값 · 가장 작은 값을 쓴다(부하는 값을 늘리기만 한다).
//   wallMs = 「n 프레임 그리고 1픽셀 읽기」의 프레임당 벽시계(수직 동기에 안 묶인다 — 읽기가 GPU 가 다 그릴 때까지 기다린다 · CPU 쪽 시간 포함 · 이어 그린 프레임들이 GPU 안에서 겹쳐 돈다)
//   gpuMs  = GPU 시간 질의(EXT_disjoint_timer_query_webgl2)의 중앙값 · gpuMin = 가장 작은 값: **프레임마다** 질의 하나로 감싸고 그 프레임 끝에 1픽셀을 읽어 기다린다.
//            n 프레임을 질의 하나로 묶으면 안 된다 — 이어 그린 프레임들이 GPU 안에서 겹쳐 돌아 질의가 겹친 시간을 두 번 센다(M5 · ANGLE Metal 에서 벽시계의 1.5 ~ 2배로 나왔다).
//            지원하지 않거나 끊겼으면(GPU_DISJOINT) null.
//   질의의 결과는 그린 뒤 몇 틱 지나야 읽힌다 — 결과를 기다리는 동안은 그리지 않는다(다른 그리기의 시간이 섞이지 않게).
const WAIT_TICKS = 400;

export function makeMeasure(renderer) {
  const gl = renderer.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'), px = new Uint8Array(4);
  const sync = () => { renderer.setRenderTarget(null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };
  const tick = () => new Promise((done) => setTimeout(done, 4));
  async function result(q) {
    for (let k = 0; k < WAIT_TICKS; k++) {
      if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) return gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
      await tick();
    }
    return null;
  }
  async function frames(draw, n) {
    draw(); sync();
    const t0 = performance.now();
    for (let i = 0; i < n; i++) draw();
    sync();
    const wallMs = (performance.now() - t0) / n, qs = [], ms = [];
    if (ext) gl.getParameter(ext.GPU_DISJOINT_EXT);
    for (let i = 0; ext && i < n; i++) {
      const q = gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, q); draw(); gl.endQuery(ext.TIME_ELAPSED_EXT);
      sync(); qs.push(q);
    }
    for (const q of qs) { const v = await result(q); if (v !== null) ms.push(v); gl.deleteQuery(q); }
    const ok = ms.length > 0 && !gl.getParameter(ext.GPU_DISJOINT_EXT);
    ms.sort((a, b) => a - b);
    return { wallMs, gpuMs: ok ? ms[ms.length >> 1] : null, gpuMin: ok ? ms[0] : null, n };
  }
  return { timer: !!ext, frames };
}
