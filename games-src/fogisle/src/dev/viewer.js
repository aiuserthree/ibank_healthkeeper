// 주는 것: 세계 뷰어(개발판 전용 · 회색 음영) — worldInfo(이름: 주 스레드에서 생성해 해시 · 시간 · 수) · worldJob(이름: 워커 러너로 생성) ·
//   worldView(이름, 카메라, 색) → 제 캔버스에 그리고 { cam, tris, calls } 를 돌려준다. 주소 ?show=world[&world=slice1][&view=…][&tint=…] 로도 연다.
//   카메라: 'top'(위 — 북쪽이 위) · 'side'(바다 쪽 비스듬한 위) · 'eye'(시작 자리의 눈높이) · 책갈피 이름 · 'at:x,y,z,요(도),피치(도)'
//   색: 'gray'(회색 음영 = 색조의 밝기 × 큰 얼룩 × 틈 그늘) · 'axis'(주된 입힘 축: x 빨강 · y 초록 · z 파랑) · 'color'(색조 그대로)
// 받는 것: shared/gen(생성) · data(레시피) · app/worker(runJob) · tune/world.viewer · 전역 THREE. 게임의 캔버스(app/stage)는 건드리지 않고 그 위에 제 캔버스를 덮는다.
// 재질 · 하늘 · 구운 빛은 여기 없다(F1b · F2a). 형상을 읽으려고 해 하나 · 하늘빛 · 그림자 · 옅은 거리 안개 · 납작한 물만 둔다.
import { generate, hashWorld } from '../shared/gen/world.js';
import { runJob } from '../app/worker.js';
import { recipe as slice1 } from '../data/slice1/recipe.js';
import { WORLD } from '../shared/tune/world.js';

const RECIPES = Object.freeze({ slice1 });
const SKY = 0xc4ccd1, DEG = Math.PI / 180;
const V = { key: '', world: null, renderer: null, canvas: null, scene: null };

function recipeOf(name) {
  if (!Object.prototype.hasOwnProperty.call(RECIPES, name)) throw new Error('모르는 세계: ' + name);
  return RECIPES[name];
}

export function worldInfo(name) {
  const t0 = performance.now(), world = generate(recipeOf(name)), ms = performance.now() - t0;
  return { hash: hashWorld(world), ms, stats: world.stats };
}

export function worldJob(name) {
  return runJob('shared/gen/world.js', 'genSteps', [recipeOf(name)]).then((r) => ({ where: r.where, moved: r.moved, hash: hashWorld(r.value), stats: r.value.stats }));
}

function geometry(part, tint) {
  const n = part.pos.length / 3, color = new Float32Array(n * 3), g = new THREE.BufferGeometry();
  for (let v = 0; v < n; v++) {
    const shade = part.col[v * 4 + 3] / 255, r = part.col[v * 4] / 255, gr = part.col[v * 4 + 1] / 255, b = part.col[v * 4 + 2] / 255, gray = (0.3 * r + 0.59 * gr + 0.11 * b) * shade * WORLD.viewer.gray;
    const rgb = tint === 'color' ? [r * shade, gr * shade, b * shade] : tint === 'axis' ? [0.1, 0.1, 0.1].map((c, k) => (k === part.axis[v] ? 0.3 + 0.6 * shade : c)) : [gray, gray, gray];
    color.set(rgb, v * 3);
  }
  g.setAttribute('position', new THREE.BufferAttribute(part.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(part.nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(color, 3));
  g.setIndex(new THREE.BufferAttribute(part.idx, 1));
  return g;
}

function buildScene(world, tint) {
  const scene = new THREE.Scene(), C = WORLD.viewer, span = Math.max(world.size[0], world.size[1]);
  const solid = new THREE.MeshLambertMaterial({ vertexColors: true }), glow = new THREE.MeshBasicMaterial({ color: 0xfff1cf });
  // 꼭짓점 법선에 면 법선을 섞는다(가파른 바위가 각지게 — 정식 재질이 할 일의 흉내). 다 각지게 하면 저다각형 장난감처럼, 안 섞으면 점토처럼 보인다
  solid.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
      normal = normalize(mix(normal, normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition))), ${C.facet.toFixed(2)}));`);
  };
  const add = (part, mesh) => { mesh.castShadow = mesh.receiveShadow = part.mat !== 'glow'; scene.add(mesh); return mesh; };
  const mat = (part) => (part.mat === 'glow' && tint === 'gray' ? glow : solid);
  for (const b of world.batches) add(b, new THREE.Mesh(geometry(b, tint), mat(b)));
  const dummy = new THREE.Object3D();
  for (const group of world.instances) {
    const proto = world.protos[group.proto], count = group.xf.length / 8, mesh = add(proto, new THREE.InstancedMesh(geometry(proto, tint), solid, count));
    for (let i = 0; i < count; i++) {
      const [x, y, z, rx, ry, rz, s, tall] = group.xf.subarray(i * 8, i * 8 + 8);
      dummy.position.set(x, y, z); dummy.rotation.set(rx, ry, rz); dummy.scale.set(s, tall, s); dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.frustumCulled = false;
  }
  for (const prop of world.props) for (const part of prop.parts) {
    const mesh = add(part, new THREE.Mesh(geometry(part, tint), mat(part)));
    mesh.position.set(prop.at[0], prop.at[1], prop.at[2]); mesh.rotation.set(0, prop.yaw, prop.lean);
  }
  const water = new THREE.Mesh(new THREE.PlaneGeometry(span * 6, span * 6), new THREE.MeshBasicMaterial({ color: 0x55616a, transparent: true, opacity: 0.78 }));
  water.rotation.x = -Math.PI / 2; water.position.y = world.sea;
  const sun = new THREE.DirectionalLight(0xffffff, C.sun);
  sun.position.set(C.sunX * span, C.sunY * span, C.sunZ * span);
  sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.001; sun.shadow.normalBias = 0.35;
  Object.assign(sun.shadow.camera, { left: -span * 0.75, right: span * 0.75, top: span * 0.75, bottom: -span * 0.75, near: 1, far: span * 3 });
  scene.add(water, sun, new THREE.HemisphereLight(0xe6edf2, 0x4e5357, C.sky));
  scene.background = new THREE.Color(SKY);
  return scene;
}

function camera(world, cam, aspect) {
  const C = WORLD.viewer, [w, d] = world.size, fov = 2 * Math.atan(Math.tan(C.fovH * DEG / 2) / aspect) / DEG;
  if (cam === 'top') {
    const half = Math.max(d / 2, w / 2 / aspect) * 1.04, top = new THREE.OrthographicCamera(-half * aspect, half * aspect, half, -half, 1, 500);
    top.position.set(0, 200, 0); top.up.set(0, 0, -1); top.lookAt(0, 0, 0);
    return top;
  }
  const view = new THREE.PerspectiveCamera(fov, aspect, 0.1, C.far), st = world.marks.stations.find((s) => s.id === cam), at = cam.startsWith('at:') ? cam.slice(3).split(',').map(Number) : null;
  view.rotation.order = 'YXZ';
  if (cam === 'side') { view.position.set(C.sideX, C.sideY, C.sideZ); view.lookAt(0, C.lookY, 0); }
  else if (cam === 'eye') { const s = world.marks.spawn; view.position.set(s.at[0], s.at[1] + WORLD.eye, s.at[2]); view.rotation.set(C.eyePitch * DEG, s.yaw, 0); }
  else if (st) { view.position.set(st.at[0], st.at[1], st.at[2]); view.rotation.set(st.pitch, st.yaw, 0); }
  else if (at && at.length === 5 && at.every((v) => v === v)) { view.position.set(at[0], at[1], at[2]); view.rotation.set(at[4] * DEG, at[3] * DEG, 0); }
  else throw new Error('모르는 카메라: ' + cam);
  return view;
}

export function worldView(name, cam = 'side', tint = 'gray') {
  if (!V.renderer) {
    V.canvas = document.createElement('canvas');
    V.canvas.id = 'fgViewer';
    V.canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:50;display:block';
    document.body.appendChild(V.canvas);
    V.renderer = new THREE.WebGLRenderer({ canvas: V.canvas, antialias: true, preserveDrawingBuffer: true });
    V.renderer.shadowMap.enabled = true; V.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  if (V.key !== name + '|' + tint) { V.world = generate(recipeOf(name)); V.scene = buildScene(V.world, tint); V.key = name + '|' + tint; }
  const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight), view = camera(V.world, cam, w / h);
  V.scene.fog = cam === 'top' ? null : new THREE.Fog(SKY, WORLD.viewer.fogNear, WORLD.viewer.far);
  V.renderer.setPixelRatio(1); V.renderer.setSize(w, h, false);
  V.renderer.render(V.scene, view);
  return { world: name, cam, tint, tris: V.renderer.info.render.triangles, calls: V.renderer.info.render.calls, stations: V.world.marks.stations.map((s) => s.id) };
}

// 주소로 바로 열기(개발판에서만 — 이 모듈이 개발판에만 묶인다). 여기서 터져도 게임이 뜨는 것을 막지 않는다(콘솔 오류로만 남긴다)
function openFromUrl() {
  const q = new URLSearchParams(window.location.search);
  if (q.get('show') !== 'world') return;
  try { worldView(q.get('world') || 'slice1', q.get('view') || 'side', q.get('tint') || 'gray'); } catch (e) { console.error('세계 뷰어를 열지 못했다: ' + e.message); }
}
openFromUrl();
