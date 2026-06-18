// 헬스키퍼 디자인 시스템 로더 — 자신의 위치를 기준으로 _ds 번들/스타일을 주입한다.
// _ds_bundle.js 는 내부 UI킷 데모를 #root 에 자동 렌더한다. 우리 페이지가 직접 #root 에
// 마운트하기 전(= window.__hkReady 가 켜지기 전)에 일어나는 번들의 자동 렌더만 무력화한다.
(() => {
  if (window.ReactDOM && ReactDOM.createRoot && !ReactDOM.__hkPatched) {
    const orig = ReactDOM.createRoot.bind(ReactDOM);
    ReactDOM.createRoot = function (container, opts) {
      if (!container || (container.id === "root" && !window.__hkReady)) {
        return { render() {}, unmount() {} }; // 번들 데모 렌더는 무시
      }
      return orig(container, opts);
    };
    ReactDOM.__hkPatched = true;
  }
})();
(() => {
  const me = document.currentScript.src;
  const dsBase = new URL('../_ds/healthkeeper-ds-31e44bd2-68dd-4c55-91c3-7ca10811b6be/', me).href;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = dsBase + 'styles.css';
  document.head.appendChild(link);
  // 반응형 스타일(셸과 같은 _shared 폴더) — DS 토큰 뒤에 로드해 미디어쿼리가 우선하도록
  const rlink = document.createElement('link');
  rlink.rel = 'stylesheet';
  rlink.href = new URL('responsive.css', me).href;
  document.head.appendChild(rlink);
  const s = document.createElement('script');
  s.src = dsBase + '_ds_bundle.js';
  s.onerror = () => console.error('ds-loader: 번들 로드 실패 — ' + s.src);
  document.head.appendChild(s);
})();
