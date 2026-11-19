// 깨진 레시피 「벽 속 표식」 — 책갈피 하나를 돌담의 줄 위(돌 속)에 둔다. 설 걷는 바닥이 없다. 검증 5(fit)가 잡아야 한다.
import { recipe as base } from '../../src/data/slice1/recipe.js';

const wall = base.kit.find((it) => it.piece === 'wall').line;
export const expect = { check: 5, code: 'fit' };
export const recipe = { ...base, marks: { ...base.marks, stations: { ...base.marks.stations, inwall: [(wall[0][0] + wall[1][0]) / 2, (wall[0][1] + wall[1][1]) / 2, 0, 0] } } };
