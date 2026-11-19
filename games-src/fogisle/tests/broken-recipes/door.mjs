// 깨진 레시피 「좁은 문」 — 높은 돌담 둘 사이에 사람이 못 지나는 틈을 두고 거기에 문 표식을 적는다. 검증 2(door)가 잡아야 한다.
import { recipe as base } from '../../src/data/slice1/recipe.js';

export const expect = { check: 2, code: 'door' };
export const recipe = {
  ...base,
  kit: [...base.kit, { piece: 'wall', line: [[14, 21.5], [17.2, 21.5]], height: 1.8 }, { piece: 'wall', line: [[18.6, 21.5], [22, 21.5]], height: 1.8 }],
  marks: { ...base.marks, doors: { gate: [17.9, 21.5, 0, 0.9] } },
};
