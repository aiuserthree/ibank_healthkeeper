// 깨진 레시피 「세계 밖 표식」 — 표식 하나가 세계(128 × 96m)의 동쪽 밖에 있다. 검증 8(레시피 검사의 outside)이 잡아야 한다.
import { recipe as base } from '../../src/data/slice1/recipe.js';

export const expect = { check: 8, code: 'recipe:outside' };
// 같이 걸리는 검증(그럴 수밖에 없는 것): 세계 밖에는 설 걷는 칸이 없다(5)
export const also = [5];
export const recipe = { ...base, marks: { ...base.marks, points: { ...base.marks.points, far: [70, 10] } } };
