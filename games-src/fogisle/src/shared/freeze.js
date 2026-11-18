// 주는 것: deepFreeze — 표(객체 · 배열)를 속까지 얼린다.
// 받는 것: 없음. 형식 배열은 얼릴 수 없어 건너뛴다.
export function deepFreeze(o) {
  if (o === null || typeof o !== 'object' || ArrayBuffer.isView(o) || Object.isFrozen(o)) return o;
  Object.freeze(o);
  const keys = Object.keys(o);
  for (let i = 0; i < keys.length; i++) deepFreeze(o[keys[i]]);
  return o;
}
