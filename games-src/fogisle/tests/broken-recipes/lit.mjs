// 깨진 레시피 「깨지는 등불이 늘 켜진 빛으로」 — 과녁 등롱 하나의 등불 표시를 'on' 으로 적었다(깨도 바닥의 구운 빛이 안 꺼진다).
// 레시피 검사(lit)도 막지만, 검사를 건너뛰어 구워도 검증 7(light)이 구운 꼭짓점 빛에서 잡아야 한다.
import { recipe as base } from '../../src/data/slice1/recipe.js';

export const expect = { check: 7, code: 'light' };
// 같이 걸리는 검증(그럴 수밖에 없는 것): 레시피 검사도 이 표시를 막는다(8)
export const also = [8];
export const recipe = { ...base, kit: base.kit.map((it) => (it.lit === 'break:5' ? { ...it, lit: 'on' } : it)) };
