// 깨진 레시피 「구멍」 — 동굴 어귀의 우묵한 자리를 닫힌 구역(실내 · 동굴)이라고 적었지만 벽도 천장도 출입구 선언도 없다(광선이 밖으로 샌다). 검증 4(hole)가 잡아야 한다.
import { recipe as base } from '../../src/data/slice1/recipe.js';

export const expect = { check: 4, code: 'hole' };
export const recipe = { ...base, zones: [{ area: ['circle', -18, 4, 3], enclosed: true }] };
