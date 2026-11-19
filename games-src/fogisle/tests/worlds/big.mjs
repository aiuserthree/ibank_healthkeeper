// 시험 세계 「임무 크기」 — 굽기 시간만 재는 레시피(240 × 220m · 바위 600 · 큰 조각 12 · 등불 30 남짓). slice1 의 절벽 선을 늘려 쓴다.
//   큰 조각은 지금 키트에서 가장 큰 등대다(건물 키트는 F12 · F18). 놀 수 있는 세계가 아니다 — 검증 8종의 대상도 아니다.
import { recipe as slice1 } from '../../src/data/slice1/recipe.js';

const line = slice1.terrain[0].cliff.line.map((p) => [p[0] * 240 / 128, p[1] * 220 / 96]), row = (n, f) => Array.from({ length: n }, (v, i) => f(i));
export const recipe = {
  id: 'big', size: [240, 220], seed: 11, sea: 0, sky: 'dawn',
  terrain: [
    { op: 'base', coast: 'south', shore: 69, cliff: { line, height: 22, strata: 2.6 } }, ...row(12, (i) => ({ op: 'flatten', area: ['circle', -100 + i * 18, -60, 8], blend: 6 })),
    { op: 'path', line: [[-60, 40], [-35, 26], [0, 18], [40, 24], [62, 40]], width: 2.4 }, { op: 'push', amount: 1.3, cell: 3.3 }, { op: 'crack', dark: 0.3 },
  ],
  scatter: [
    { what: 'rocks', region: 'foot', n: 180, size: [0.5, 4.2] }, { what: 'rocks', region: 'shore', n: 130, size: [0.3, 2.4] }, { what: 'rocks', region: 'surf', n: 70, size: [0.8, 4.4] },
    { what: 'rocks', region: 'face', n: 70, size: [2.1, 4.2] }, { what: 'rocks', region: 'top', n: 150, size: [0.5, 3] },
  ],
  kit: [
    ...row(12, (i) => ({ piece: 'lighthouse', at: [-100 + i * 18, -60], height: 24, lit: 'switch:' + (i % 4) })),
    ...row(6, (i) => ({ piece: 'wall', line: [[-45 + i * 15, 22 + (i % 2) * 3], [-37 + i * 15, 23 + (i % 2) * 3]], height: 1.1 })),
    ...row(14, (i) => ({ piece: 'lamppost', at: [-42 + i * 6.5, 15 + (i % 3) * 2.5], rot: i * 25, lit: 'on' })),
    ...row(4, (i) => ({ piece: 'lantern', at: [-30 + i * 20, 19.5], up: 1.2, stake: true, target: true, lit: 'break:' + (4 + i) })),
    ...row(6, (i) => ({ piece: 'bottle', at: [-41 + i * 15, 22.5 + (i % 2) * 3], on: 'top', target: true })),
  ],
  lights: [], zones: [],
  marks: { spawn: [0, 21, 0], stations: Object.fromEntries(row(8, (i) => ['s' + i, [-35 + i * 10, 17, 0, 0]])), points: {} },
};
