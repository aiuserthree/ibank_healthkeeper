// 깨진 레시피 「맞닿은 조각」 — 등불 기둥을 박는 깊이(kit.embed)만큼 들어 올려 밑면이 땅에 딱 맞닿는다(겹침 0). 검증 6(seam)이 잡아야 한다.
import { recipe as base } from '../../src/data/slice1/recipe.js';
import { WORLD } from '../../src/shared/tune/world.js';

export const expect = { check: 6, code: 'seam' };
export const recipe = { ...base, kit: base.kit.map((it) => (it.piece === 'lamppost' && it.at[0] < 0 ? { ...it, up: WORLD.kit.embed } : it)) };
