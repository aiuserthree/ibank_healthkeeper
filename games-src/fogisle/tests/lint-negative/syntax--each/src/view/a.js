// 주는 것: lint 음성 시험 판(--each) — 이 줄 뒤의 모든 줄이 저마다 폴더 이름 앞머리의 규칙에 걸려야 한다. / 받는 것: 없음
export let frame = 0;
export const a = 1, b = 2;
export const c = 1; export const d = 2;
const e = 1; import { B } from './b.js';
export * from './b.js';
import B2 from './b.js';
import './b.js';
export { e as f };
  export const g = 1;
export const { h } = { h: 1 };
const i = await 1;
const j = import.meta;
export function load() { return import('./b.js'); }
