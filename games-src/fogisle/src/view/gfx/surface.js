// 주는 것: 표면 재질 한 벌 — installFog()(three 의 안개 조각 넷을 우리 것으로 감싼다 · 한 번만) · makeSurfaces({ lean, tex, env, add }) → { get(재질 이름, 색조, 꼴) · custom(재질 표의 한 줄, 색조, 꼴, 늘 젖은 정도) · list() · clear() } · texKeys(재질 이름들).
//   get 의 꼴: 'world'(정적 묶음 — 세계 좌표로 입힌다) · 'own'(인스턴스 · 과녁 — 제 좌표 × 크기로 입힌다) · 'dyn'(움직이는 것 · 스키닝 — 제 좌표 + 빛 격자에서 읽은 uniform 조명).
// 받는 것: shader.glsl(끼우는 조각) · uni(U · lin) · tune/gfx.surf(재질 표) · 전역 THREE. 무늬(tex)는 tex.js 가 만든 것, env 는 환경광 배율.
// 방식 다섯(tdd §5-2 — 정의로 가른다): 지형 겹(FG_TERRAIN) · 세 방향(정의 없음) · 제 좌표(FG_OWN) · 스키닝(FG_OWN + three 의 USE_SKINNING) · 평범(FG_PLAIN — 무늬를 읽지 않는다).
//   인스턴스는 three 가 USE_INSTANCING 으로 가른다. 그 밖의 켬 · 끔(각진 면 · 법선 무늬 · 하늘 가림 · 해 가림 · 움직이는 것의 조명)은 uniform 이라 프로그램이 늘지 않는다.
// 두 길: 정식 = MeshStandardMaterial 에 조각을 끼운 것(무거운 PBR 계열) · 값싼 길(FG_LEAN) = MeshLambertMaterial 의 뼈대에서 조명 고리를 통째로 우리 것으로 바꾼 것.
//   두 길은 프로그램이 달라 놀이 중에 바꾸지 않는다(tdd §5-8). 색조는 「묶음의 tint ÷ 재질 표의 base」를 무늬에 곱한다 — 무늬의 제 색은 빼지 않는다.
import * as G from './shader.glsl.js';
import { U, lin } from './uni.js';
import { GFX } from '../../shared/tune/gfx.js';

const FOG_KEYS = Object.freeze(['fog_pars_vertex', 'fog_vertex', 'fog_pars_fragment', 'fog_fragment']);
const DEFINE = Object.freeze({ terrain: 'FG_TERRAIN', plain: 'FG_PLAIN' });

// 전역 안개 조각 교체(tdd §5-4): FG_FOG 를 정의한 재질은 우리 안개를, 아닌 재질(개발 뷰어의 기본 재질)은 three 의 원래 안개를 쓴다. 뒤 단계의 입자 · 예광 재질도 FG_FOG 만 정의하면 같은 안개를 먹는다.
export function installFog() {
  if (THREE.ShaderChunk.fog_fragment.includes('FG_FOG')) return;
  for (const key of FOG_KEYS) THREE.ShaderChunk[key] = `#ifdef FG_FOG\n${G.FOG_PARS[key]}\n#else\n${THREE.ShaderChunk[key]}\n#endif`;
}

function put(src, mark, text, replace) {
  if (!src.includes(mark)) throw new Error('셰이더에 끼울 자리가 없다: ' + mark);
  return src.replace(mark, replace ? text : mark + '\n' + text);
}

function compile(sh, lean, own) {
  Object.assign(sh.uniforms, U, own);
  sh.vertexShader = put(put(sh.vertexShader, '#include <common>', G.VERT_PARS), '#include <fog_vertex>', G.VERT_MAIN);
  let f = put(sh.fragmentShader, '#include <emissivemap_fragment>', G.FRAG_EMIT);
  if (lean) {
    f = put(put(f, '#include <fog_pars_fragment>', G.LEAN_PARS), '#include <map_fragment>', G.LEAN_MAP, true);
    f = put(put(f, '#include <lights_lambert_fragment>', '', true), '#include <lights_fragment_begin>', G.LEAN_LIGHT, true);
    f = put(put(f, '#include <lights_fragment_maps>', '', true), '#include <lights_fragment_end>', '', true);
  } else {
    const sun = 'getDirectionalLightInfo( directionalLight, directLight );', amb = 'vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );';
    f = put(put(f, '#include <fog_pars_fragment>', G.FRAG_PARS), '#include <map_fragment>', G.FRAG_MAP, true);
    f = put(put(f, '#include <roughnessmap_fragment>', G.FRAG_ROUGH), '#include <normal_fragment_maps>', G.FRAG_NORMAL);
    f = put(f, '#include <lights_fragment_begin>', put(put(THREE.ShaderChunk.lights_fragment_begin, sun, G.FRAG_SUN), amb, G.FRAG_LAMP), true);
    f = put(f, '#include <lights_fragment_maps>', G.FRAG_ENV);
  }
  sh.fragmentShader = f;
}

export function makeSurfaces({ lean, tex, env, add }) {
  const cache = new Map(), flat = { map: null, nrm: null, mean: 1, rgb: [1, 1, 1] };
  // cfg = 재질 표의 한 줄(또는 그 꼴의 객체 — 견본 판). soak = 늘 젖은 정도(0 ~ 1 — 세계 젖음과 무관하게)
  function make(cfg, tint, kind, soak = 0) {
    const mode = cfg.mode, ownSpace = kind !== 'world' && mode === 'tri';
    const a = tex[cfg.a] || flat, b = tex[cfg.b] || flat, c = tex[cfg.c] || flat;
    // 색조: 보통은 「tint ÷ base」(무늬 그대로가 base) · fit 이면 「tint ÷ 무늬의 평균색」(칠한 것 · 쇠 — 무늬의 평균이 tint 가 된다) · gain = 그 위의 밝기 배율
    const rel = tint.map((v, k) => lin(v) / (cfg.fit ? a.rgb[k] : lin(cfg.base[k])) * (cfg.gain || 1));
    const defines = { FG_FOG: '' }, key = ['fg', lean ? 'lean' : 'full', mode, ownSpace ? 'own' : 'w'].join(':');
    if (lean) defines.FG_LEAN = '';
    if (DEFINE[mode]) defines[DEFINE[mode]] = '';
    if (ownSpace) defines.FG_OWN = '';
    const own = {
      tA: { value: a.map }, tAn: { value: a.nrm }, tB: { value: b.map }, tBn: { value: b.nrm }, tC: { value: c.map },
      uSurf: { value: new THREE.Vector4(cfg.scale, cfg.bump, cfg.rough, cfg.wet) }, uSurf2: { value: new THREE.Vector4(cfg.macro, a.mean, cfg.metal, soak) },
      uTint: { value: new THREE.Vector3(rel[0], rel[1], rel[2]) }, uLay: { value: new THREE.Vector4(cfg.scaleB || 1, cfg.scaleC || 1, b.mean, 0) },
      uTurf: { value: new THREE.Vector3(c.rgb[0], c.rgb[1], c.rgb[2]) }, uDyn: { value: new THREE.Vector4(1, 0, 0, 0) }, uDyn2: { value: new THREE.Vector4(1, 0, 0, kind === 'dyn' ? 1 : 0) },
    };
    const m = add(lean ? new THREE.MeshLambertMaterial({ name: key }) : new THREE.MeshStandardMaterial({ name: key, roughness: cfg.rough, metalness: cfg.metal, envMapIntensity: env }));
    Object.assign(m.defines || (m.defines = {}), defines);
    m.userData.u = own; m.userData.heavy = !lean;
    m.onBeforeCompile = (sh) => compile(sh, lean, own);
    m.customProgramCacheKey = () => key;
    return m;
  }
  return {
    get(name, tint, kind = 'world') {
      const key = name + '|' + tint.join(',') + '|' + kind;
      if (!cache.has(key)) cache.set(key, make(GFX.surf[name] || { ...GFX.surf.rock, mode: 'plain' }, tint, kind));
      return cache.get(key);
    },
    // 표에 없는 꼴의 재질(견본 판 · 진열장) — 통에 넣지 않는다(부르는 쪽이 들고 있는다)
    custom: make,
    list() { return [...cache.values()]; },
    clear() { cache.clear(); },
  };
}

// 세계의 재질 이름들이 쓰는 무늬의 열쇠(자산 표의 이름) — app 이 이것만 받아 온다
export function texKeys(names) {
  const out = new Set();
  for (const name of names) { const cfg = GFX.surf[name]; if (cfg) for (const k of [cfg.a, cfg.b, cfg.c]) if (k) out.add(k); }
  return [...out].sort();
}
