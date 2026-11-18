// 주는 것: lint 양성 대조 — view 는 DOM · three · 벽시계 · Math 전부 · 비동기 · 모듈 상태를 써도 된다. / 받는 것: shared
import * as A from '../shared/a.js';
let frame = 0;
export function tick(canvas) { frame += 1; const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); return new THREE.Vector3(Math.sin(performance.now()), Math.random() ** 2, A.TABLE.gain + frame + svg.childNodes.length); }
export async function warm(renderer, scene, camera) { await renderer.compileAsync(scene, camera); return Date.now(); }
export const frameNow = () => frame;
export const NOTE = '// 따옴표 속의 빗금 둘은 주소가 아니다';
