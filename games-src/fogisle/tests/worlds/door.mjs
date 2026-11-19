// 시험 세계 「문과 계단」 — 굽기가 좁은 길을 잇는지 보는 손으로 지은 세계(레시피 없이 형상 도우미로 충돌 삼각형만 만든다).
//   평지 24 × 24m 위에 안 6 × 5m 짜리 방(벽 두께 0.3m · 높이 2.8m), 남쪽 벽 가운데에 폭 door m 의 문, 동쪽 벽 밖에 폭 stair m 의 계단(단 높이 0.2 · 디딤 0.3),
//   계단 끝에서 지붕(평지붕 3.0m)으로 올라선다. 마당은 높은 담(세계의 끝)이 두른다. 표식: 시작 자리(문 앞 마당) · room(방 안) · roof(지붕 위) · 문 front.
//   doorWorld(문 폭, 계단 폭, 뚫린 벽?, 돌림(도), 옮김 x, 옮김 z) — 세 번째가 참이면 방의 북쪽 벽을 뺀다(닫힌 구역이 새는 판).
//   돌림 · 옮김은 건물(방 · 계단)과 그 표식을 세계의 가운데 둘레로 돌린 뒤 옮긴다(격자에 비낀 문 · 돌린 건물의 문이 이어지는지 보는 판 — 땅과 담은 그대로).
//   node tools/bake.mjs test:door[:문,계단,뚫림(0 · 1),돌림,옮김 x,옮김 z] 로 구워 볼 수 있다(world 를 내보낸다).
import { cbox, place, xf } from '../../src/shared/geom/shapes.js';

export function doorWorld(door = 1, stair = 1.2, open = false, turn = 0, ox = 0, oz = 0) {
  const soups = [], owner = [], add = (soup, who) => { soups.push(soup); for (let t = 0; t < soup.length; t += 9) owner.push(who); };
  const box = (x0, x1, y0, y1, z0, z1) => place(cbox(x1 - x0, y1 - y0, z1 - z0), xf((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));
  // 땅(위를 보는 삼각형 둘) — 임자 0
  add([-12, 0, -12, -12, 0, 12, 12, 0, 12, -12, 0, -12, 12, 0, 12, 12, 0, -12], 0);
  // 방: 안쪽 x −3 ~ 3 · z −2.5 ~ 2.5. 벽은 땅에 0.4m 박는다. 남쪽 벽(z 2.5 ~ 2.8)은 문 양옆 둘
  const wall = (x0, x1, z0, z1) => add(box(x0, x1, -0.4, 2.8, z0, z1), 2);
  wall(-3.3, -3, -2.8, 2.8); wall(3, 3.3, -2.8, 2.8);
  if (!open) wall(-3.3, 3.3, -2.8, -2.5);
  wall(-3.3, -door / 2, 2.5, 2.8); wall(door / 2, 3.3, 2.5, 2.8);
  add(box(-3.3, 3.3, 2.8, 3, -2.8, 2.8), 2);
  // 계단: 동쪽 벽 밖(x 3.3 ~ 3.3 + stair)을 따라 북쪽으로 오른다. 열다섯 단 → 3.0m
  for (let k = 0; k < 15; k++) add(box(3.3, 3.3 + stair, -0.4, (k + 1) * 0.2, 2.3 - (k + 1) * 0.3, 2.3 - k * 0.3), 2);
  // 담: 마당 둘레(세계의 끝에서 1m 안쪽) — 임자 3
  for (const e of [-1, 1]) { add(box(e * 10.5 - 0.25, e * 10.5 + 0.25, -0.4, 3.2, -10.75, 10.75), 3); add(box(-10.75, 10.75, -0.4, 3.2, e * 10.5 - 0.25, e * 10.5 + 0.25), 3); }
  // 건물과 그 표식을 돌리고 옮긴다(시험 세계는 결정성 층이 아니다 — Math 의 삼각함수를 쓴다)
  const a = turn * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), move = (x, z) => [x * c + z * s + ox, -x * s + z * c + oz], mark = (x, y, z) => [move(x, z)[0], y, move(x, z)[1]];
  const pos = Float32Array.from(soups.flat()), idx = Uint32Array.from({ length: pos.length / 3 }, (v, i) => i), tris = idx.length / 3;
  for (let t = 0; t < tris; t++) if (owner[t] === 2) for (let e = 0; e < 3; e++) { const v = (t * 3 + e) * 3, [x, z] = move(pos[v], pos[v + 2]); pos[v] = x; pos[v + 2] = z; }
  return {
    v: 0, id: 'door', seed: 1, size: [24, 24], origin: [-12, -12], sea: -10, sky: '', cell: 32, surf: ['rock'],
    batches: [], protos: [], instances: [], props: [], lights: [], kit: [],
    collide: { pos, idx, surf: new Uint8Array(tris), owner: Uint16Array.from(owner) },
    marks: {
      spawn: { at: mark(0, 0, 7), yaw: 0 }, stations: [], targets: [], points: { room: mark(0, 0, 0), roof: mark(0, 3, 0) },
      doors: [{ id: 'front', at: mark(0, 0, 2.65), yaw: a, width: door }],
    },
    // 닫힌 구역(방)은 축에 나란한 네모로만 적을 수 있다 — 돌리거나 옮긴 판에서는 뺀다
    zones: turn || ox || oz ? [] : [{ area: ['box', -3, -2.5, 3, 2.5], level: [-1, 2.5], enclosed: true, exits: ['front'] }],
    stats: { drawTris: 0, verts: 0, instances: 0, collideTris: tris, propParts: 0 },
  };
}

export function world(...args) { return doorWorld(...args); }
