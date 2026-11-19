// 주는 것: 자원 등록부 — makeRegistry() → { add(범위, 자원) · drop(범위) · count() }. view 가 만든 GPU 자원(형상 · 무늬 · 재질 · 그리기 대상)을 범위 이름으로 적어 두고
//   범위째로 dispose 한다: 'core'(사슬 · 합성 — 렌더러와 같이 산다) · 'assets'(무늬 · 하늘 · 환경광 — 임무의 자산) · 'world'(세계의 형상과 재질 — 세계를 바꿀 때 지운다).
// 받는 것: 없음(dispose 가 있는 것이면 무엇이든). 세계를 만들고 지우기를 되풀이해도 형상 · 무늬 · 프로그램 수가 그대로인지 하네스(check.py leak)가 센다 — 여기 안 적힌 자원은 샌다.
export function makeRegistry() {
  const scopes = new Map();
  return {
    add(scope, thing) {
      if (!scopes.has(scope)) scopes.set(scope, new Set());
      scopes.get(scope).add(thing);
      return thing;
    },
    drop(scope) {
      const set = scopes.get(scope);
      if (!set) return 0;
      for (const thing of set) thing.dispose();
      scopes.delete(scope);
      return set.size;
    },
    count() { const out = {}; for (const [name, set] of scopes) out[name] = set.size; return out; },
  };
}
