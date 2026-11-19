// 주는 것: U(모든 표면 재질 · 하늘이 같이 쓰는 uniform 객체 — 값이 하나라 프레임마다 한 번만 고친다) · uniRefresh(하늘 이름) — tune 의 gfx 표를 uniform 에 싣는다 ·
//   uniSky(하늘에서 뽑은 색들을 싣는다) · setSwitch(스위치 묶음 번호, 색, 켜진 정도) · lin(화면 색 → 선형) · SWITCHES.
// 받는 것: tune/gfx · tune/bake(해가 있는 쪽 — 구운 「해 가림」과 같은 값) · tune/world(스위치 묶음 수) · 전역 THREE.
// uniform 의 뜻(셰이더는 shader.glsl.js):
//   uFogA = 안개(기준 밀도 · 높이 감쇠 · 기준 높이 · 고른 밀도) · uFogTint = 수평선 띠에 곱하는 색 · 안개의 끝 · uSunFog = 해 쪽 번짐 색 · 좁기 · uSkyTurn = 하늘 그림을 돌린 양(바퀴)
//   uEnvTint = 환경광(하늘빛)에 곱하는 색 — 표면이 받는 빛만 고친다(하늘 · 안개의 색은 그림 그대로)
//   uSunDirW = 해가 있는 쪽(세계) · uSunCol = 주광의 색 × 세기 · uSkyTop · uSkyMid · uSkyLow = 값싼 길의 해석 하늘(위 · 수평선 · 아래) · uIrrUp · uIrrSide · uIrrDown = 값싼 길의 하늘빛(법선이 위 · 옆 · 아래일 때)
//   uLook = 각진 면 · 얼룩 세기 · 법선 켬 · 하늘 가림 켬 / uLook2 = 각진 면이 다 차는 · 시작하는 누운 정도 · 법선 거리 줄임 · 그늘이 바탕색을 누르는 정도
//   uBake = 등불 조도 배율 · 해 가림 세기 · 반사 가림 지수 · 인스턴스 밑면 어둡기 / uBake2 = 빛나는 알의 밝기
//   uWet = 세계 젖음 · 물가 젖음이 끝나는 높이 · 젖은 바탕색 배율 · 젖은 거칠기 / uWet2 = 거칠기 바닥 · 다 젖는 높이
//   uSwitch[8] = 스위치 묶음마다 (색 × 켜진 정도, 켜진 정도) — 뒤 단계는 state.mission 의 깃발에서 setSwitch 로 싣는다(체크포인트 복원에도 맞게).
import { GFX } from '../../shared/tune/gfx.js';
import { BAKE } from '../../shared/tune/bake.js';
import { WORLD } from '../../shared/tune/world.js';

export const SWITCHES = WORLD.lit.groups;
const v3 = () => ({ value: new THREE.Vector3() }), v4 = () => ({ value: new THREE.Vector4() });
export const U = {
  uFogA: v4(), uFogTint: v4(), uSunFog: v4(), uSunDirW: v3(), uSkyTurn: { value: 0 }, tHorizon: { value: null },
  uSunCol: v3(), uSkyTop: v3(), uSkyMid: v3(), uSkyLow: v3(), uIrrUp: v3(), uIrrSide: v3(), uIrrDown: v3(),
  uLook: v4(), uLook2: v4(), uBake: v4(), uBake2: v4(), uWet: v4(), uWet2: v4(), uEnvTint: v3(),
  uSwitch: { value: Array.from({ length: SWITCHES }, () => new THREE.Vector4()) },
};
const SKY = { top: [0, 0, 0], mid: [0, 0, 0], irrUp: [0, 0, 0], irrSide: [0, 0, 0], irrDown: [0, 0, 0] };

// 화면에서 보는 값(sRGB 0 ~ 1) → 선형
export function lin(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }

const pick = (table, name) => table[name] || table.dawn;

// 하늘 그림에서 뽑은 색(선형 · 그림 그대로의 밝기 — 밝기 배율은 uniRefresh 가 곱한다)
export function uniSky(colors, horizon) { Object.assign(SKY, colors); U.tHorizon.value = horizon; }

export function setSwitch(group, color, on) { U.uSwitch.value[group].set(color[0] * on, color[1] * on, color[2] * on, on); }

export function uniRefresh(skyName, sea) {
  const sky = pick(GFX.sky, skyName), sun = pick(GFX.sun, skyName), fog = pick(GFX.fog, skyName), dir = pick(BAKE.light.sun, skyName), L = GFX.look, B = GFX.bake, W = GFX.wet;
  const gain = sky.gain, env = sky.gain * sky.env, T = sky.light, set3 = (u, c, k) => u.value.set(c[0] * k, c[1] * k, c[2] * k), lit3 = (u, c, k) => u.value.set(c[0] * k * T[0], c[1] * k * T[1], c[2] * k * T[2]);
  U.uFogA.value.set(fog.base, fog.fall, fog.at, fog.even);
  U.uFogTint.value.set(fog.tint[0] * gain, fog.tint[1] * gain, fog.tint[2] * gain, fog.max);
  U.uSunFog.value.set(lin(sun.haze[0]), lin(sun.haze[1]), lin(sun.haze[2]), sun.hazePow);
  U.uSunDirW.value.set(dir[0], dir[1], dir[2]).normalize();
  U.uSkyTurn.value = sky.turn / 360;
  set3(U.uSunCol, sun.color, sun.power);
  lit3(U.uSkyTop, SKY.top, env); lit3(U.uSkyMid, SKY.mid, env); lit3(U.uSkyLow, SKY.mid, env * sky.ground);
  lit3(U.uIrrUp, SKY.irrUp, env); lit3(U.uIrrSide, SKY.irrSide, env); lit3(U.uIrrDown, SKY.irrDown, env);
  U.uEnvTint.value.set(T[0], T[1], T[2]);
  U.uLook.value.set(L.facet, L.blotch, L.normal, L.occlude);
  U.uLook2.value.set(L.facetLo, L.facetHi, L.normalFade, B.shade);
  U.uBake.value.set(B.lamp / BAKE.light.lampGain, B.sun, B.spec, B.rockUp);
  U.uBake2.value.set(B.glow, 0, 0, 0);
  U.uWet.value.set(W.world, sea + W.shore, W.dark, W.rough);
  U.uWet2.value.set(W.floor, sea + W.shore * W.full, 0, 0);
  return { sky, sun, env, gain };
}
