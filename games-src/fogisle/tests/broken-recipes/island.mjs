// 깨진 레시피 「떨어진 섬」 — 표식 하나를 절벽 위 고원(등대 터의 평평한 자리)에 둔다(해변에서 걸어서도 고리로도 못 간다). 검증 1(reach)이 잡아야 한다.
import { recipe as base } from '../../src/data/slice1/recipe.js';

export const expect = { check: 1, code: 'reach' };
const tower = base.kit.find((it) => it.piece === 'lighthouse').at;
export const recipe = { ...base, marks: { ...base.marks, points: { ...base.marks.points, supply: [tower[0] - 6.5, tower[1]] } } };
