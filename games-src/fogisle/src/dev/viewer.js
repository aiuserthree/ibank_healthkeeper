// 주는 것: 세계 뷰어(개발판 전용) — worldInfo(주 스레드에서 생성: 해시 · 시간 · 수) · worldJob(워커 러너로 생성) · bakeInfo(주 스레드에서 「생성 → 굽기」: 해시 둘 ·
//   시간 · 수) · bakeJob(워커 러너로 「생성 → 굽기」: 해시 · 벽시계 · 받은 단계 이름) · prepHash(타이틀의 준비가 만든 것의 해시) ·
//   worldView(이름, 카메라, 색, 얹을 것) → 제 캔버스에 그리고 { tris, calls … } 를 돌려준다.
//   주소 ?show=world[&world=slice1][&view=…][&tint=…][&over=nav] 로도 연다. 세계는 이름(개발판에 묶인 레시피) 또는 레시피 객체(하네스가 시험 레시피를 넘길 때).
// 받는 것: shared/gen(생성) · shared/bake(굽기) · data(레시피) · app/worker(runJob) · app/ctx · tune · 전역 THREE. 게임의 캔버스(app/stage)는 건드리지 않고 그 위에 제 캔버스를 덮는다.
//   해시는 전부 **주 창에서 받은 배열을 다시 센 값**이다(워커가 세어 보낸 값이 아니다 — 워커가 보내는 길에서 값이 바뀌어도 잡힌다). 시간(ms)에는 해시 셈이 안 든다.
//   카메라: 'top'(위 — 북쪽이 위) · 'side'(바다 쪽 비스듬한 위) · 'eye'(시작 자리의 눈높이) · 책갈피 이름 · 'at:x,y,z,요(도),피치(도)'
//   색: 'gray'(회색 음영 = 색조의 밝기 × 얼룩 × 틈 그늘) · 'axis'(주된 입힘 축: x 빨강 · y 초록 · z 파랑) · 'color'(색조 × 얼룩)
//       'baked'(구운 빛만 입힌 회색 — 하늘 열림 + 해 가림 + 늘 켜진 등불. 조명 · 그림자 없이 구운 값만 본다) · 'lamps'(하늘빛을 낮추고 등불과 스위치 묶음을 다 켠 것)
//   얹을 것: 'nav' = 걷는 칸(시작 자리의 닿는 무리 풀빛 · 다른 무리 푸른빛 · 문 밑 흰빛) · 자동 고리(넘기 하늘색 · 오르기 노랑 · 떨어지기 붉은색) ·
//       엄폐 점(낮은 엄폐 자주 · 높은 엄폐 보라 — 막대 끝의 가지가 막힌 쪽) · 표식(시작 자리 풀빛 · 책갈피 파랑 · 그 밖 흰빛 막대)
// 재질 · 하늘은 여기 없다(F2a). 'gray' 계열은 형상을 읽으려고 해 하나 · 하늘빛 · 그림자 · 옅은 거리 안개 · 납작한 물을 두고, 구운 빛 계열은 꼭짓점 색만 그린다.
import { generate, hashWorld } from '../shared/gen/world.js';
import { bake, prepSteps, hashBake } from '../shared/bake/index.js';
import { spanAt, spanPos, DX, DZ } from '../shared/bake/nav.js';
import { runJob } from '../app/worker.js';
import { CTX } from '../app/ctx.js';
import { recipe as slice1 } from '../data/slice1/recipe.js';
import { WORLD } from '../shared/tune/world.js';
import { BAKE } from '../shared/tune/bake.js';

const RECIPES = Object.freeze({ slice1 });
const SKY = 0xc4ccd1, NIGHT = 0x10161d, DEG = Math.PI / 180, LINK = [[0.35, 0.86, 0.94], [0.98, 0.86, 0.24], [0.9, 0.27, 0.2]];
const V = { key: '', name: '', world: null, baked: null, renderer: null, canvas: null, scene: null };

function recipeOf(name) {
  if (name && typeof name === 'object') return name;
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

const hashes = (v) => ({ world: hashWorld(v.world), bake: hashBake(v.baked) });

// 주 스레드에서 한 번에 「생성 → 굽기」 — ms = 전부(해시 셈은 빼고) · genMs = 굽기가 시작되기 전까지
export function bakeInfo(name) {
  const t0 = performance.now(), it = prepSteps(recipeOf(name));
  let s = it.next(), genMs = 0;
  while (!s.done) { if (s.value === 'bvh') genMs = performance.now() - t0; s = it.next(); }
  const ms = performance.now() - t0;
  return { hash: hashes(s.value), ms, genMs, stats: s.value.baked.stats };
}

// 워커 러너로 「생성 → 굽기」 — ms = 맡긴 때부터 답을 받을 때까지의 벽시계 · steps = 알려 온 단계 이름 · hash = 받은 것을 주 창에서 센 값
export function bakeJob(name) {
  const t0 = performance.now(), steps = [];
  return runJob('shared/bake/index.js', 'prepSteps', [recipeOf(name)], (step) => steps.push(step)).then((r) => {
    const ms = performance.now() - t0;
    return { where: r.where, moved: r.moved, slices: r.slices, hash: hashes(r.value), ms, steps, stats: r.value.baked.stats };
  });
}

// 타이틀의 준비가 만든 세계 · 구운 것(CTX.world · CTX.baked — 워커가 넘겨준 배열 그대로)을 주 창에서 센 해시. 준비가 덜 됐으면 null.
export function prepHash() { return CTX.world && CTX.baked ? { ...hashes({ world: CTX.world, baked: CTX.baked }), where: CTX.made.where } : null; }

// 구운 빛 한 줄(꼭짓점 7바이트 · 점 5바이트)을 색으로: 하늘 열림 × 하늘빛 + 해(가림 × 법선·해) + 늘 켜진 등불(+ lamps 에서는 스위치 묶음도 켠다)
function lit(L, at, tint, facing, out, o) {
  const night = tint === 'lamps', sky = L[at] / 255 * (night ? 0.16 : 0.5), sun = night ? 0 : L[at + 4] / 255 * facing * 0.36, g = WORLD.viewer.gray, sq = (v) => v * v / 65025;
  const sw = night && L.length % 7 === 0 && L[at + 5] !== 255 ? sq(L[at + 6]) * 3 : 0, gain = night ? 3 : 2.6;
  out[o] = Math.min(1, g * (sky * 0.62 + sun + sq(L[at + 1]) * gain + sw));
  out[o + 1] = Math.min(1, g * (sky * 0.68 + sun * 0.92 + sq(L[at + 2]) * gain + sw * 0.68));
  out[o + 2] = Math.min(1, g * (sky * 0.75 + sun * 0.8 + sq(L[at + 3]) * gain + sw * 0.34));
}

// part 의 형상. light = 그 부분의 구운 꼭짓점 빛(있으면 구운 빛 색으로 — 없는 부분(원형 · 과녁)은 흰색에 틈 그늘만 두고 줄 · 조각의 색을 곱한다)
function geometry(part, tint, light) {
  const n = part.pos.length / 3, color = new Float32Array(n * 3), g = new THREE.BufferGeometry(), baked = tint === 'baked' || tint === 'lamps';
  const S = BAKE.light.sun[V.world.sky] || BAKE.light.sun.dawn, sl = Math.hypot(S[0], S[1], S[2]), T = part.tint, lum = 0.3 * T[0] + 0.59 * T[1] + 0.11 * T[2];
  for (let v = 0; v < n; v++) {
    const shade = part.col[v * 4 + 3] / 255, blotch = part.col[v * 4] / 255, gray = lum * blotch * shade * WORLD.viewer.gray;
    if (baked && light) lit(light, v * 7, tint, Math.max(0, (part.nor[v * 3] * S[0] + part.nor[v * 3 + 1] * S[1] + part.nor[v * 3 + 2] * S[2]) / sl), color, v * 3);
    else color.set(baked ? [shade, shade, shade] : tint === 'color' ? T.map((c) => c * blotch * shade) : tint === 'axis' ? [0.1, 0.1, 0.1].map((c, k) => (k === part.axis[v] ? 0.3 + 0.6 * shade : c)) : [gray, gray, gray], v * 3);
  }
  g.setAttribute('position', new THREE.BufferAttribute(part.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(part.nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(color, 3));
  g.setIndex(new THREE.BufferAttribute(part.idx, 1));
  return g;
}

// 걷는 칸 · 고리 · 엄폐 점 · 표식을 점과 줄로 얹는다(구운 것에서 읽은 그대로)
function overlay(scene, world, baked) {
  const nav = baked.nav, L = baked.links, C = baked.cover, p = [0, 0, 0], q = [0, 0, 0], s0 = world.marks.spawn.at, home = spanAt(nav, s0[0], s0[1], s0[2], 1, BAKE.nav.height);
  const pts = new Float32Array(nav.y.length * 3), ptc = new Float32Array(nav.y.length * 3), seg = [], col = [];
  const line = (a, b, c) => { seg.push(a[0], a[1], a[2], b[0], b[1], b[2]); col.push(c[0], c[1], c[2], c[0], c[1], c[2]); };
  for (let s = 0; s < nav.y.length; s++) {
    spanPos(nav, s, p);
    pts.set([p[0], p[1] + 0.06, p[2]], s * 3);
    ptc.set(nav.door[s] ? [1, 1, 1] : home >= 0 && nav.group[s] === nav.group[home] ? [0.2, 0.85, 0.38] : [0.3, 0.5, 0.95], s * 3);
  }
  for (let k = 0; k < L.kind.length; k++) { spanPos(nav, L.from[k], p); spanPos(nav, L.to[k], q); line([p[0], p[1] + 0.12, p[2]], [q[0], q[1] + 0.12, q[2]], LINK[L.kind[k]]); }
  for (let k = 0; k < C.n; k++) {
    const x = C.pos[k * 3], y = C.pos[k * 3 + 1], z = C.pos[k * 3 + 2], c = C.high[k] ? [0.6, 0.25, 0.95] : [1, 0.25, 0.85], top = C.high[k] ? BAKE.cover.high : BAKE.cover.mid;
    line([x, y, z], [x, y + top, z], c);
    for (let d = 0; d < 4; d++) if (C.low[k] & (1 << d)) line([x, y + top, z], [x + DX[d] * 0.45, y + top, z + DZ[d] * 0.45], c);
  }
  const mark = (at, h, c) => line(at, [at[0], at[1] + h, at[2]], c);
  mark(s0, 2.2, [0.1, 1, 0.3]);
  for (const st of world.marks.stations) mark([st.at[0], st.at[1] - WORLD.eye, st.at[2]], WORLD.eye, [0.2, 0.4, 1]);
  for (const at of [...Object.values(world.marks.points), ...world.marks.doors.map((d) => d.at)]) mark(at, 2.2, [1, 1, 1]);
  const dots = new THREE.BufferGeometry(), lines = new THREE.BufferGeometry();
  dots.setAttribute('position', new THREE.BufferAttribute(pts, 3)); dots.setAttribute('color', new THREE.BufferAttribute(ptc, 3));
  lines.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(seg), 3)); lines.setAttribute('color', new THREE.BufferAttribute(Float32Array.from(col), 3));
  scene.add(new THREE.Points(dots, new THREE.PointsMaterial({ size: 0.17, vertexColors: true, fog: false })), new THREE.LineSegments(lines, new THREE.LineBasicMaterial({ vertexColors: true, fog: false })));
}

function buildScene(world, tint, over) {
  const scene = new THREE.Scene(), C = WORLD.viewer, span = Math.max(world.size[0], world.size[1]), baked = tint === 'baked' || tint === 'lamps', B = V.baked, five = [0, 0, 0];
  const solid = baked ? new THREE.MeshBasicMaterial({ vertexColors: true }) : new THREE.MeshLambertMaterial({ vertexColors: true }), glow = new THREE.MeshBasicMaterial({ color: 0xfff1cf });
  // 꼭짓점 법선에 면 법선을 섞는다(가파른 바위가 각지게 — 정식 재질이 할 일의 흉내). 다 각지게 하면 저다각형 장난감처럼, 안 섞으면 점토처럼 보인다
  if (!baked) solid.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
      normal = normalize(mix(normal, normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition))), ${C.facet.toFixed(2)}));`);
  };
  const add = (part, mesh) => { mesh.castShadow = mesh.receiveShadow = part.mat !== 'glow'; scene.add(mesh); return mesh; };
  const mat = (part) => (part.mat === 'glow' && tint !== 'axis' && tint !== 'color' ? glow : solid);
  world.batches.forEach((b, k) => add(b, new THREE.Mesh(geometry(b, tint, baked ? B.vlight[k] : null), mat(b))));
  const dummy = new THREE.Object3D(), shade = new THREE.Color();
  world.instances.forEach((group, k) => {
    const proto = world.protos[group.proto], count = group.xf.length / 8, mesh = add(proto, new THREE.InstancedMesh(geometry(proto, tint, null), solid, count));
    for (let i = 0; i < count; i++) {
      const [x, y, z, rx, ry, rz, s, tall] = group.xf.subarray(i * 8, i * 8 + 8);
      dummy.position.set(x, y, z); dummy.rotation.set(rx, ry, rz); dummy.scale.set(s, tall, s); dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      if (baked) { lit(B.ilight[k], i * 5, tint, 0.6, five, 0); mesh.setColorAt(i, shade.setRGB(five[0], five[1], five[2])); }
    }
    mesh.frustumCulled = false;
  });
  world.props.forEach((prop, k) => {
    for (const part of prop.parts) {
      let m = mat(part);
      if (baked && m === solid) { lit(B.plight, k * 5, tint, 0.6, five, 0); m = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(five[0], five[1], five[2]) }); }
      const mesh = add(part, new THREE.Mesh(geometry(part, tint, null), m));
      mesh.position.set(prop.at[0], prop.at[1], prop.at[2]); mesh.rotation.set(0, prop.yaw, prop.lean);
    }
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(span * 6, span * 6), new THREE.MeshBasicMaterial({ color: tint === 'lamps' ? 0x1b242c : 0x55616a, transparent: true, opacity: 0.78 }));
  water.rotation.x = -Math.PI / 2; water.position.y = world.sea;
  scene.add(water);
  if (!baked) {
    const sun = new THREE.DirectionalLight(0xffffff, C.sun);
    sun.position.set(C.sunX * span, C.sunY * span, C.sunZ * span);
    sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.001; sun.shadow.normalBias = 0.35;
    Object.assign(sun.shadow.camera, { left: -span * 0.75, right: span * 0.75, top: span * 0.75, bottom: -span * 0.75, near: 1, far: span * 3 });
    scene.add(sun, new THREE.HemisphereLight(0xe6edf2, 0x4e5357, C.sky));
  }
  if (over === 'nav') overlay(scene, world, B);
  scene.background = new THREE.Color(tint === 'lamps' ? NIGHT : SKY);
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

export function worldView(name, cam = 'side', tint = 'gray', over = '') {
  if (!V.renderer) {
    V.canvas = document.createElement('canvas');
    V.canvas.id = 'fgViewer';
    V.canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:50;display:block';
    document.body.appendChild(V.canvas);
    V.renderer = new THREE.WebGLRenderer({ canvas: V.canvas, antialias: true, preserveDrawingBuffer: true });
    V.renderer.shadowMap.enabled = true; V.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  const key = name + '|' + tint + '|' + over, need = tint === 'baked' || tint === 'lamps' || over === 'nav';
  if (V.name !== name) { V.world = generate(recipeOf(name)); V.baked = null; V.name = name; V.key = ''; }
  if (need && !V.baked) V.baked = bake(V.world).baked;
  if (V.key !== key) { V.scene = buildScene(V.world, tint, over); V.key = key; }
  const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight), view = camera(V.world, cam, w / h);
  V.scene.fog = cam === 'top' || need ? null : new THREE.Fog(SKY, WORLD.viewer.fogNear, WORLD.viewer.far);
  V.renderer.setPixelRatio(1); V.renderer.setSize(w, h, false);
  V.renderer.render(V.scene, view);
  return { world: name, cam, tint, over, tris: V.renderer.info.render.triangles, calls: V.renderer.info.render.calls, stations: V.world.marks.stations.map((s) => s.id) };
}

// 주소로 바로 열기(개발판에서만 — 이 모듈이 개발판에만 묶인다). 여기서 터져도 게임이 뜨는 것을 막지 않는다(콘솔 오류로만 남긴다)
function openFromUrl() {
  const q = new URLSearchParams(window.location.search);
  if (q.get('show') !== 'world') return;
  try { worldView(q.get('world') || 'slice1', q.get('view') || 'side', q.get('tint') || 'gray', q.get('over') || ''); } catch (e) { console.error('세계 뷰어를 열지 못했다: ' + e.message); }
}
openFromUrl();
