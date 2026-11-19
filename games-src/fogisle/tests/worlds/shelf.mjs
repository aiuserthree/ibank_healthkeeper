// 시험 세계 「단과 선반」 — 층이 둘인 칸에서 자동 고리가 몸이 실제로 닿는 층을 고르는지 보는 손으로 지은 세계.
//   평지 24 × 24m 위에 높은 단(윗면 high m · x −5 ~ 0), 그 옆에 붙은 얇은 선반(윗면 shelf m · 두께 0.05m · x 0 ~ 3 — 밑은 걷는 땅이고 머리 위가 사람 키 넘게 빈다).
//   단의 높이는 떨어지기 고리의 한도 안이다(선반이 없으면 땅으로 뛰어내릴 수 있는 높이 — 그래서 층을 잘못 고르면 땅으로 고리가 난다).
//   단의 가장자리에서 선반 쪽으로 내려가는 떨어지기 고리는 **선반 위**로 가야 한다(선반 밑의 땅으로 가면 바닥을 뚫는 고리다).
//   shelfWorld(단 높이, 선반 높이) · node tools/bake.mjs test:shelf[:단,선반] 로 구워 볼 수 있다(world 를 내보낸다).
import { cbox, place, xf } from '../../src/shared/geom/shapes.js';

export function shelfWorld(high = 2.5, shelf = 1.95) {
  const soups = [], owner = [], add = (soup, who) => { soups.push(soup); for (let t = 0; t < soup.length; t += 9) owner.push(who); };
  const box = (x0, x1, y0, y1, z0, z1) => place(cbox(x1 - x0, y1 - y0, z1 - z0), xf((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));
  add([-12, 0, -12, -12, 0, 12, 12, 0, 12, -12, 0, -12, 12, 0, 12, 12, 0, -12], 0);
  add(box(-5, 0, -0.4, high, -3, 3), 2);
  add(box(0, 3, shelf - 0.05, shelf, -3, 3), 2);
  for (const e of [-1, 1]) { add(box(e * 10.5 - 0.25, e * 10.5 + 0.25, -0.4, 3.2, -10.75, 10.75), 3); add(box(-10.75, 10.75, -0.4, 3.2, e * 10.5 - 0.25, e * 10.5 + 0.25), 3); }
  const pos = Float32Array.from(soups.flat()), idx = Uint32Array.from({ length: pos.length / 3 }, (v, i) => i), tris = idx.length / 3;
  return {
    v: 0, id: 'shelf', seed: 1, size: [24, 24], origin: [-12, -12], sea: -10, sky: '', cell: 32, surf: ['rock'],
    batches: [], protos: [], instances: [], props: [], lights: [], kit: [],
    collide: { pos, idx, surf: new Uint8Array(tris), owner: Uint16Array.from(owner) },
    marks: { spawn: { at: [0, 0, 7], yaw: 0 }, stations: [], targets: [], points: {}, doors: [] },
    zones: [], stats: { drawTris: 0, verts: 0, instances: 0, collideTris: tris, propParts: 0 },
  };
}

export function world(...args) { return shelfWorld(...args); }
