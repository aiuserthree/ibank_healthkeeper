// 깨진 레시피 「틈」 — 절벽 선의 동쪽 끝이 바다로 나오지 않아 해변이 세계의 동쪽 끝까지 이어진다(걸어서 세계 밖에 닿는다). 검증 3(edge)이 잡아야 한다.
import { recipe as base } from '../../src/data/slice1/recipe.js';

const line = [...base.terrain[0].cliff.line.slice(0, 8), [45, 15], [64, 17]];
export const expect = { check: 3, code: 'edge' };
export const recipe = { ...base, terrain: [{ ...base.terrain[0], cliff: { ...base.terrain[0].cliff, line } }, ...base.terrain.slice(1)] };
