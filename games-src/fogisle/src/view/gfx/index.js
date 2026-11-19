// 주는 것: view/gfx 의 문 — gfxInit(캔버스, { lean }) · gfxNeeds(세계) → 자산 열쇠들 · gfxLoad(자산, 하늘 이름) · gfxWorld(세계, 구운 것) · gfxUnload() · gfxCompile() → Promise ·
//   gfxResize([w, h]) · gfxDraw(x, y, z, 요, 피치) · gfxSwitch(묶음, 켜진 정도) · gfxDynLight(재질, x, y, z) · gfxInfo() · gfxParts()(개발판이 안쪽을 볼 때).
// 받는 것: 세계 · 구운 것(shared — 읽기만 한다. view 는 결정성 층을 바꾸지 않는다) · app 이 받아 온 자산 · tune/gfx · 전역 THREE(r160). sim 의 상태는 이 단계에서 읽지 않는다(카메라는 app 이 넘긴다).
// 한 프레임(tdd §5-1 의 뼈대): 장면(불투명 → 하늘은 먼 평면에 붙여 마지막) → 장면 대상 → 합성 한 번 → 화면. 그림자 패스 · 물 · 입자 · 1인칭 · 번짐은 뒤 단계가 이 사이에 끼운다.
// 빛: 주광 하나(해가 있는 쪽 = tune/bake 의 light.sun — 구운 해 가림과 같은 값) + 하늘 그림에서 뽑은 환경광 + 구운 빛. 주변광은 두지 않는다(어두우면 구운 빛의 바닥 값 · 노출 · 안개 밝기로).
// 두 길(정식 · 값싼 FG_LEAN)은 gfxInit 에서 정하고 놀이 중에 바꾸지 않는다. 화질 단계 표 · 단계 전환 · 대상 형식 고르기 · 동적 해상도는 F2c.
// 셰이더 예열 규칙(build-plan 부록 A): gfxCompile 은 장면 대상을 잡은 뒤에 compileAsync 를 부른다 · 놀이 중에는 재질 · 조명 수 · 정의를 바꾸지 않는다(스위치 묶음 · 켬과 끔은 uniform).
// 자원: 만든 GPU 자원은 전부 등록부에 적는다 — 'core'(사슬) · 'assets'(무늬 · 하늘 · 환경 맵: gfxLoad 가 갈아 끼운다) · 'world'(형상 · 재질: gfxUnload 가 지운다).
import { makeRegistry } from './registry.js';
import { makeChain } from './chain.js';
import { makeTextures } from './tex.js';
import { makeSky } from './sky.js';
import { installFog, makeSurfaces, texKeys } from './surface.js';
import { buildWorld, matNames } from './scene.js';
import { makeMeasure } from './measure.js';
import { U, uniRefresh, uniSky, setSwitch, SWITCHES } from './uni.js';
import { lightAt } from '../../shared/bake/light.js';
import { GFX } from '../../shared/tune/gfx.js';

const S = { renderer: null, reg: null, chain: null, measure: null, lean: false, scene: null, camera: null, sun: null, sky: null, tex: {}, mats: null, root: null, world: null, baked: null, skyName: '', env: -1, fixed: null };
const SKY_KEY = 'sky-';
const FIVE = new Uint8Array(5);

export function gfxInit(canvas, opt) {
  installFog();
  S.lean = !!(opt && opt.lean);
  S.renderer = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
  S.renderer.toneMapping = THREE.NoToneMapping; S.renderer.info.autoReset = false;
  S.reg = makeRegistry();
  S.chain = makeChain(S.renderer, (x) => S.reg.add('core', x));
  S.measure = makeMeasure(S.renderer);
  S.scene = new THREE.Scene(); S.scene.matrixAutoUpdate = false;
  S.camera = new THREE.PerspectiveCamera(60, 1, GFX.camera.near, GFX.camera.far);
  S.camera.rotation.order = 'YXZ';
  S.sun = new THREE.DirectionalLight(0xffffff, 1);
  S.scene.add(S.sun, S.sun.target);
  gfxResize();
}

// 세계가 쓰는 자산의 열쇠(무늬 + 하늘) — app 이 이것만 받아 온다
export function gfxNeeds(world) { return [...texKeys(matNames(world)), SKY_KEY + (world.sky || 'dawn')]; }

// 자산을 GPU 로: 무늬(+ 법선 뽑기 — 정식 길만) · 하늘 지붕 · 수평선 띠 · 환경 맵. 앞에 올린 자산은 지운다(세계가 서 있으면 먼저 gfxUnload)
export function gfxLoad(assets, skyName) {
  if (S.root) gfxUnload();
  if (S.sky) S.scene.remove(S.sky.mesh);
  S.reg.drop('assets');
  const add = (x) => S.reg.add('assets', x), L = GFX.look, name = skyName || 'dawn';
  S.tex = makeTextures(assets, Object.keys(assets).filter((k) => !k.startsWith(SKY_KEY)).sort(), { normals: !S.lean, aniso: S.lean ? L.anisoLean : L.aniso, strength: L.strength }, add);
  S.sky = makeSky(S.renderer, assets[SKY_KEY + name] || { image: null, color: [0.6, 0.66, 0.72] }, GFX.sky[name] || GFX.sky.dawn, S.lean, add);
  S.skyName = name; S.env = -1;
  S.scene.environment = S.sky.env;
  S.scene.add(S.sky.mesh);
  uniSky(S.sky.colors, S.sky.horizon);
}

export function gfxUnload() {
  if (S.root) S.scene.remove(S.root);
  S.root = null; S.world = null; S.baked = null; S.mats = null;
  S.reg.drop('world');
}

// 세계를 그릴 물체로. 스위치 묶음의 처음 상태: 깨지는 등불은 켜짐, 대본 스위치는 꺼짐(뒤 단계는 state.mission 의 깃발에서 gfxSwitch 로 싣는다)
export function gfxWorld(world, baked) {
  gfxUnload();
  const add = (x) => S.reg.add('world', x);
  S.mats = makeSurfaces({ lean: S.lean, tex: S.tex, env: 1, add });
  S.root = buildWorld(world, baked, S.mats, add);
  S.scene.add(S.root);
  S.world = world; S.baked = baked; S.env = -1;
  for (let g = 0; g < SWITCHES; g++) setSwitch(g, [0, 0, 0], 0);
  for (const l of world.lights) if (l.mode !== 'on') setSwitch(l.group, l.color, l.mode === 'break' ? 1 : 0);
  refresh();
}

export function gfxSwitch(group, on) {
  const l = S.world && S.world.lights.find((x) => x.mode !== 'on' && x.group === group);
  if (l) setSwitch(group, l.color, Math.min(1, Math.max(0, on)));
  return !!l;
}

// 움직이는 것('dyn' 꼴의 재질)의 조명: 서 있는 자리의 빛 격자 값을 그 재질의 uniform 에(tdd §5-3 — 「동굴에서 총만 밝음」이 없게)
export function gfxDynLight(material, x, y, z) {
  if (!S.baked) return;
  lightAt(S.baked.grid, x, y, z, FIVE, 0);
  const u = material.userData.u, sq = (b) => b * b / 65025;
  u.uDyn.value.set(FIVE[0] / 255, sq(FIVE[1]), sq(FIVE[2]), sq(FIVE[3])); u.uDyn2.value.x = FIVE[4] / 255;
}

// tune → uniform · 주광 · 하늘 밝기 · 환경광 배율(바뀌었을 때만 재질을 돈다)
function refresh() {
  const r = uniRefresh(S.skyName, S.world ? S.world.sea : 0), d = U.uSunDirW.value;
  S.sun.color.setRGB(r.sun.color[0], r.sun.color[1], r.sun.color[2]); S.sun.intensity = r.sun.power;
  S.sun.position.set(d.x * 100, d.y * 100, d.z * 100); S.sun.updateMatrixWorld(); S.sun.target.updateMatrixWorld();
  if (S.sky) { S.sky.gain.value = r.gain; S.sky.far.value = r.sky.far; }
  if (S.mats && S.env !== r.env) { S.env = r.env; for (const m of S.mats.list()) if (m.isMeshStandardMaterial) m.envMapIntensity = r.env; }
}

// 창 크기에 맞춘다(수평 시야각을 지킨다). w · h 를 주면 그 크기의 그리기 버퍼로 고정한다(계측 · 캡처 — null 을 주면 다시 창을 따른다)
export function gfxResize(w, h) {
  if (!S.renderer) return;
  if (w !== undefined) S.fixed = w ? [w, h] : null;
  const C = GFX.camera, size = S.fixed || [Math.max(1, window.innerWidth), Math.max(1, window.innerHeight)];
  S.renderer.setPixelRatio(S.fixed ? 1 : Math.min(window.devicePixelRatio || 1, C.pixelRatioMax));
  S.renderer.setSize(size[0], size[1], false);
  const buf = S.renderer.getDrawingBufferSize(new THREE.Vector2());
  S.chain.resize(buf.x, buf.y);
  S.camera.aspect = size[0] / size[1];
  S.camera.fov = 2 * Math.atan(Math.tan(C.fovH * Math.PI / 360) / S.camera.aspect) * 180 / Math.PI;
  S.camera.updateProjectionMatrix();
}

export function gfxDraw(x, y, z, yaw, pitch) {
  refresh();
  S.camera.position.set(x, y, z); S.camera.rotation.set(pitch, yaw, 0);
  S.renderer.info.reset();
  S.chain.draw(S.scene, S.camera);
}

// 예열: 장면 대상을 잡은 뒤에 컴파일한다(안 잡으면 화면용 변형이 만들어져 프로그램이 두 배가 된다). 합성의 프로그램은 화면용이라 대상을 풀고 한 번 그려 만든다.
export function gfxCompile() {
  refresh();
  S.renderer.setRenderTarget(S.chain.target);
  const done = S.renderer.compileAsync(S.scene, S.camera);
  S.renderer.setRenderTarget(null);
  return done.then(() => { S.renderer.info.reset(); S.chain.draw(S.scene, S.camera); });
}

export function gfxInfo() {
  const R = S.renderer, gl = R.getContext(), info = R.info;
  const programs = (info.programs || []).map((p) => ({ id: p.id, name: p.name, type: p.type, ok: gl.getProgramParameter(p.program, gl.LINK_STATUS) === true, used: p.usedTimes }));
  return {
    lean: S.lean, format: S.chain.format, timer: S.measure.timer, sky: S.skyName, world: S.world ? S.world.id : null, programs, all: programs.length,
    heavy: programs.filter((p) => p.type === 'MeshStandardMaterial' || p.type === 'MeshPhysicalMaterial').length, linked: programs.every((p) => p.ok),
    geometries: info.memory.geometries, textures: info.memory.textures, calls: info.render.calls, triangles: info.render.triangles, registry: S.reg.count(),
    size: R.getDrawingBufferSize(new THREE.Vector2()).toArray(),
  };
}

// 개발판(자유 비행 · 견본 판 · 계측)이 안쪽을 볼 때 — 게임 코드는 위의 문만 쓴다
export function gfxParts() { return S; }
