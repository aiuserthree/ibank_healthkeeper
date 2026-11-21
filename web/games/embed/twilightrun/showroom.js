import { createCarModels } from './models.js?v=17';
import { glowMap } from './world.js?v=17';

// 첫 화면 · 차고에서 고른 차를 크게 보여 준다 — 주행 때와 같은 3D 모델(model(car, true))을 천천히 돌린다.
// GPU 를 아끼려고 첫 화면이 보일 때만, 초당 30장까지만 그리고 그림자 맵 대신 바닥 빛 한 장을 쓴다.
// 쇼룸 반사 — 어두운 스튜디오에 긴 조명 띠 셋 · 노을빛 하나: 차체에 광택 선이 흐르게
function studio(T) {
  const image = document.createElement('canvas');
  image.width = 1024;
  image.height = 512;
  const ctx = image.getContext('2d');
  const wall = ctx.createLinearGradient(0, 0, 0, 512);
  wall.addColorStop(0, '#5a636d');
  wall.addColorStop(.46, '#39414a');
  wall.addColorStop(.52, '#4a3f37');
  wall.addColorStop(1, '#1d2024');
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, 1024, 512);
  ctx.filter = 'blur(6px)';
  ctx.fillStyle = '#ffffff';
  for (const y of [62, 112, 162]) ctx.fillRect(0, y, 1024, 22);
  ctx.fillStyle = '#f2f6ff';
  ctx.fillRect(470, 40, 26, 190);
  ctx.fillStyle = '#ffb072';
  ctx.fillRect(0, 232, 1024, 16);
  ctx.fillStyle = '#8fc4ff';
  ctx.fillRect(0, 300, 1024, 10);
  const map = new T.CanvasTexture(image);
  map.colorSpace = T.SRGBColorSpace;
  map.mapping = T.EquirectangularReflectionMapping;
  return map;
}

export function createShowroom(canvas, cars, isActive) {
  const T = globalThis.THREE;
  if (!T) return null;
  let renderer;
  try {
    renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch (error) {
    console.info('Twilight Run: showroom unavailable', error.message);
    return null;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  const scene = new T.Scene();
  scene.environment = studio(T);
  const camera = new T.PerspectiveCamera(30, 16 / 9, .1, 60);
  const key = new T.DirectionalLight('#ffd0a0', 2.4);
  key.position.set(-5, 7, -4);
  const rim = new T.DirectionalLight('#9cc4ff', 1.5);
  rim.position.set(6, 3.5, 5);
  scene.add(new T.HemisphereLight('#d2e0ff', '#3d3530', 1.6), key, rim);
  const glow = glowMap(T);
  const floor = new T.Mesh(new T.CircleGeometry(4.2, 48),
    new T.MeshBasicMaterial({ color: '#d8f45d', map: glow, opacity: .16, transparent: true, depthWrite: false }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = .005;
  const shadow = new T.Mesh(new T.PlaneGeometry(3.3, 6.4),
    new T.MeshBasicMaterial({ color: '#05080a', map: glow, opacity: .9, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = .01;
  const turntable = new T.Group();
  turntable.add(shadow);
  scene.add(floor, turntable);

  const model = createCarModels(T, glow);
  const built = new Map();
  function build(i) {
    if (built.has(i)) return built.get(i);
    const car = cars[i];
    const group = model(car, true);
    const { frontPanel, bumper, wing, flanks, crumple, finish, glazing, lampMaterial, glows } = group.userData;
    // 손상 없는 새 차 자세 — 주행 화면(scene.js)이 손상 0일 때 놓는 자리와 같다
    const bodyEnd = car.wheelbase / 2 + .62;
    crumple?.(0, 0, 0, 0);
    finish?.regions.set(0, 0, 0, 0);
    if (finish) finish.wear.value = 0;
    glazing?.cracks.set(0, 0);
    if (frontPanel) { frontPanel.visible = true; frontPanel.position.set(0, .27, -bodyEnd); frontPanel.rotation.set(0, 0, 0); }
    if (bumper) { bumper.visible = true; bumper.position.set(0, .35, bodyEnd); bumper.rotation.set(0, 0, 0); }
    if (wing) { wing.visible = true; wing.rotation.z = 0; }
    if (flanks) { flanks.left.visible = flanks.right.visible = true; flanks.left.rotation.y = flanks.right.rotation.y = 0; }
    lampMaterial?.color.set('#ff3f2c');
    glows?.forEach(g => { g.material.opacity = .23; });
    built.set(i, group);
    return group;
  }

  let current = -1;
  let angle = .72;
  let dragging = null;
  let last = 0;
  let drawn = 0;
  let frame = 0;
  let size = [0, 0];

  function frameCamera(aspect) {
    camera.aspect = aspect;
    // 차 길이(약 4.7m)가 화면 폭에 꽉 차도록 — 세로로 긴 틀에서는 더 물러난다
    const distance = aspect >= 1.6 ? 6.7 : 6.7 * Math.min(1.9, 1.6 / aspect);
    camera.position.set(0, distance * .27, distance);
    camera.lookAt(0, .58, 0);
    camera.updateProjectionMatrix();
  }

  function fit() {
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    if (w === size[0] && h === size[1]) return;
    size = [w, h];
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2, Math.sqrt(1_400_000 / (w * h))));
    renderer.setSize(w, h, false);
    frameCamera(w / h);
    drawn = 0;
  }

  function show(i) {
    if (i === current) return;
    if (current >= 0) turntable.remove(built.get(current));
    current = i;
    turntable.add(build(i));
    drawn = 0;
  }

  function draw() {
    fit();
    turntable.rotation.y = angle;
    renderer.render(scene, camera);
  }

  const still = matchMedia('(prefers-reduced-motion: reduce)');
  function tick(t) {
    frame = requestAnimationFrame(tick);
    if (!isActive() || document.hidden || current < 0) { last = 0; return; }
    if (t - drawn < 32) return;
    const dt = last ? Math.min(.1, (t - last) / 1000) : 0;
    last = t;
    if (!dragging && !still.matches) angle += dt * .42;
    drawn = t;
    draw();
  }
  frame = requestAnimationFrame(tick);

  canvas.addEventListener('pointerdown', event => {
    dragging = { x: event.clientX, angle };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if (!dragging) return;
    angle = dragging.angle + (event.clientX - dragging.x) * .012;
    drawn = 0;
  });
  const release = () => { dragging = null; };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); cancelAnimationFrame(frame); });

  // 차고 · 차 고르기 단추에 쓸 정지 사진 — 같은 모델을 같은 조명에서 한 번씩 찍는다
  function portraits(width, height) {
    const keep = [current, angle, renderer.getPixelRatio(), size];
    const shots = [];
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    frameCamera(width / height);
    camera.position.multiplyScalar(.80);
    camera.lookAt(0, .5, 0);
    for (let i = 0; i < cars.length; i++) {
      show(i);
      turntable.rotation.y = .62;
      renderer.render(scene, camera);
      shots.push(canvas.toDataURL('image/webp', .9));
    }
    show(keep[0] < 0 ? 0 : keep[0]);
    angle = keep[1];
    renderer.setPixelRatio(keep[2]);
    size = [0, 0];
    return shots;
  }

  return { show, portraits };
}
