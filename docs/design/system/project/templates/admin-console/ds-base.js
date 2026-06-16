// Loads the 헬스키퍼 design system for a template. Repoint `base` in a consuming project.
(() => {
  const base = '../..';
  for (const p of ['styles.css']) {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = base + '/' + p;
    document.head.appendChild(l);
  }
  const s = document.createElement('script');
  s.src = base + '/_ds_bundle.js';
  s.onerror = () => console.error('ds-base.js: failed to load ' + s.src +
    ' — point the base line at the bound _ds/<folder> tree relative to this page, or the bundle is not compiled yet');
  document.head.appendChild(s);
})();
