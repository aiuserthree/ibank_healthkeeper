import { clamp, damageStage as wearStage, frontWheelAngle, PANEL_BREAK, roadSlope, roadX, roadY, TIRE_RADIUS, trackLook } from './drive.js?v=14';
import { createFallback } from './scene-fallback.js?v=14';
import { createCarModels } from './models.js?v=14';
import { createImpactFx, impactMotion } from './impact.js?v=14';
import { dayProgress, dayTime, weatherAt } from './daytime.js?v=14';
import { assetRoot, atmospheres, createWorld, glowMap, random } from './world.js?v=14';

const poses = [
  { back: 8.5, height: 2.9 },
  { back: 12.8, height: 4.7 },
  { back: -.58, height: 1.33 },
];
const rainCount = 74;

export function reflections(T) {
  const image = document.createElement('canvas');
  image.width = 512;
  image.height = 256;
  const ctx = image.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, '#99b7d4');
  gradient.addColorStop(.30, '#a9c4d9');
  gradient.addColorStop(.47, '#ffdac2');
  gradient.addColorStop(.50, '#ae9389');
  gradient.addColorStop(.58, '#4c5262');
  gradient.addColorStop(1, '#303a41');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 256);
  const sun = ctx.createRadialGradient(370, 100, 2, 370, 100, 85);
  sun.addColorStop(0, '#fff4d9');
  sun.addColorStop(.35, '#ffdbba99');
  sun.addColorStop(1, '#ffeac500');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, 512, 256);
  const map = new T.CanvasTexture(image);
  map.colorSpace = T.SRGBColorSpace;
  map.mapping = T.EquirectangularReflectionMapping;
  return map;
}

function createWeather(T, camera) {
  const positions = new Float32Array(rainCount * 6);
  const geometry = new T.BufferGeometry();
  const points = new T.BufferAttribute(positions, 3).setUsage(T.DynamicDrawUsage);
  geometry.setAttribute('position', points);
  const material = new T.LineBasicMaterial({ color: '#c4d8ee', opacity: .28, transparent: true, depthWrite: false, depthTest: false });
  const drizzle = new T.LineSegments(geometry, material);
  drizzle.visible = false;
  drizzle.frustumCulled = false;
  drizzle.renderOrder = 3;
  camera.add(drizzle);
  return (t, wet, speed, snow = false) => {
    drizzle.visible = wet > .015;
    if (!drizzle.visible) return;
    material.color.set(snow ? '#ffffff' : '#c4d8ee');
    material.opacity = wet * (snow ? .62 : .20 + speed * .0015);
    const fall = snow ? .22 : 1, streak = snow ? .25 : 1;
    for (let i = 0; i < rainCount; i++) {
      const x = (random(i * 2) * 2 - 1) * (4.4 + camera.aspect * 2);
      const y = ((random(i * 3 + 12) - t * fall * (.9 + random(-i) * .7)) % 1 + 1) % 1 * 10 - 5.1;
      const z = -2.6 - random(i + 46) * 11;
      const length = (.13 + random(i - 32) * .22 + speed * .003) * streak;
      positions.set([x, y, z, x - .055 - speed * .0018, y - length, z - .07], i * 6);
    }
    points.needsUpdate = true;
  };
}

function createWebGL(T, stage) {
  const canvas = stage.querySelector('[data-webgl]');
  const [farSky, nextSky] = stage.querySelectorAll('.panorama');
  const lens = stage.querySelector('.wind-lens');
  const renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x10161e, 0);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;

  const scene = new T.Scene();
  scene.environment = reflections(T);
  scene.fog = new T.Fog('#85756f', 108, 495);
  const camera = new T.PerspectiveCamera(53, 1, .12, 560);
  scene.add(camera);
  const ambient = new T.HemisphereLight('#c8dcff', '#423833', 1.75);
  const sun = new T.DirectionalLight('#ffba73', 2.25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 13, bottom: -13, near: 1, far: 60 });
  sun.shadow.normalBias = .036;
  sun.shadow.bias = -.00035;
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(ambient, sun, sun.target);

  const world = createWorld(T, scene);
  const glow = glowMap(T);
  const paintCar = createCarModels(T, glow);
  const impactFx = createImpactFx(T, scene, glow);
  const trafficFx = createImpactFx(T, scene, glow, true);
  const damageSmoke = Array.from({ length: 5 }, () => {
    const puff = new T.Sprite(new T.SpriteMaterial({
      map: glow, color: '#554a47', transparent: true, depthWrite: false, opacity: 0,
    }));
    scene.add(puff);
    return puff;
  });
  const rain = createWeather(T, camera);
  const shadowGeometry = new T.PlaneGeometry(3.2, 6.2);
  const shadowMaterial = new T.MeshBasicMaterial({ color: '#0c1116', map: glow, opacity: .81, transparent: true, depthWrite: false });
  const vehicles = new Map();
  const pool = new Map();
  const playerTokens = new Map();
  const warmed = new Map();
  const haze = new T.Color();
  const temporary = new T.Color();
  const carCenter = new T.Vector3();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const tint = (target, source, end, ratio) => target.set(source).lerp(temporary.set(end), ratio);
  let panoramaTheme = '';
  let lastState;
  let impactWarmed = false;

  function fit() {
    const w = Math.max(1, stage.clientWidth);
    const h = Math.max(1, stage.clientHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, w <= 640 ? 1.35 : 1.7, Math.sqrt(2_200_000 / (w * h))));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(fit).observe(stage);
  fit();

  // 하늘 띠 두 장 — 풍경이 바뀌는 곳은 풍경끼리, 아니면 같은 풍경의 시간대끼리 섞는다(horizons/<풍경>-<시간>.webp)
  function panoramaState(current, next, mix, heading, underpass, filter = '') {
    const key = current + '/' + next;
    if (panoramaTheme !== key) {
      panoramaTheme = key;
      farSky.style.backgroundImage = `url("${assetRoot}horizons/${current}.webp?v=1")`;
      nextSky.style.backgroundImage = `url("${assetRoot}horizons/${next}.webp?v=1")`;
    }
    if (farSky.style.filter !== filter) farSky.style.filter = nextSky.style.filter = filter;
    stage.style.setProperty('--pan', `${50 + clamp(heading * 30, -11, 11)}%`);
    stage.style.setProperty('--haze', '#' + haze.getHexString());
    nextSky.style.opacity = current === next ? '0' : mix.toFixed(3);
    stage.classList.toggle('underpass', underpass);
  }

  function acquire(vehicle, player) {
    const key = [vehicle.shape, vehicle.color, Boolean(vehicle.oncoming), player].join('/');
    const available = pool.get(key);
    const v = available?.pop() || {
      model: paintCar(vehicle, player), shadow: new T.Mesh(shadowGeometry, shadowMaterial), key,
    };
    v.shadow.rotation.x = -Math.PI / 2;
    scene.add(v.model, v.shadow);
    return v;
  }

  function clearVehicle(token, v) {
    scene.remove(v.model, v.shadow);
    if (!pool.has(v.key)) pool.set(v.key, []);
    pool.get(v.key).push(v);
    vehicles.delete(token);
  }

  function showVehicle(vehicle, token, state, origin, player, braking, age) {
    if (!vehicles.has(token)) vehicles.set(token, acquire(vehicle, player));
    const { model, shadow } = vehicles.get(token);
    const { z, x } = vehicle;
    const cx = roadX(state.course, z);
    const y = roadY(state.course, z);
    const trafficYaw = clamp((vehicle.sideSpeed || 0) / Math.max(9, Math.abs(vehicle.speed)), -.31, .31);
    const heading = Math.atan(roadSlope(state.course, z)) + (player ? state.yaw : trafficYaw * (vehicle.oncoming ? -1 : 1));
    const grade = (roadY(state.course, z + 2.5) - roadY(state.course, z - 2.5)) / 5;
    const pitch = Math.atan(grade * Math.cos(heading));
    const impact = state.impact;
    const trafficHit = !player && vehicle.trafficHit;
    const usesPlayerHit = player || impact?.vehicle === vehicle && (!trafficHit || impact.at >= trafficHit.at);
    const hit = usesPlayerHit ? impact : trafficHit;
    const hitAge = usesPlayerHit ? age : (hit ? state.elapsed - hit.at : Infinity);
    const recoil = impactMotion(hit, hitAge) * (usesPlayerHit && !player ? -.62 : 1);
    const side = hit?.side || .19;
    const front = hit?.front || 0;
    const jump = recoil ? Math.max(0, Math.sin(hitAge * 14) * Math.abs(recoil)) * .38 : 0;
    const deflect = player ? 0 : recoil * side * -.47;
    model.position.set(cx + x + deflect, y + .017 + jump, origin - z);
    model.rotation.set(pitch * (vehicle.oncoming ? -1 : 1),
      -heading + (vehicle.oncoming ? Math.PI : 0) + recoil * side * .19, 0, 'YXZ');
    shadow.position.set(cx + x, y + .032, origin - z);
    shadow.rotation.set(-Math.PI / 2 + pitch, 0, -heading);
    const { chassis, wheels, lampMaterial, glows, bumper, wing } = model.userData;
    const facing = vehicle.oncoming ? -1 : 1;
    chassis.rotation.set((player ? state.pitch : 0) - recoil * front * facing * .24,
      0, (player ? state.roll : 0) - recoil * side * facing * .29);
    for (const wheel of wheels) {
      const { assembly, rotating, front, side: wheelSide, halfTrack } = wheel;
      if (player) {
        const station = -assembly.position.z * Math.cos(heading) - assembly.position.x * Math.sin(heading);
        assembly.position.y = TIRE_RADIUS + roadY(state.course, z + station) - y + assembly.position.z * Math.sin(pitch);
        assembly.rotation.y = front ? -frontWheelAngle(state.wheelAngle, wheelSide, state.car.wheelbase, halfTrack) : 0;
        rotating.rotation.x = state.wheelSpin + wheelSide * halfTrack * heading / TIRE_RADIUS;
      } else rotating.rotation.x = -z * (vehicle.oncoming ? -1 : 1) / TIRE_RADIUS;
    }
    if (player) {
      const { crumple, frontPanel, flanks, finish, glazing } = model.userData;
      const t = clamp(age / .20, 0, 1);
      const crush = zone => {
        const severity = state.damage[zone];
        if (!impact || t === 1) return severity;
        const previous = zone === impact.zone ? impact.prior : zone === impact.secondary ? impact.priorSecondary : severity;
        return previous + (severity - previous) * (t * t * (3 - 2 * t));
      };
      const nose = crush('front'), tail = crush('rear');
      const left = crush('left'), right = crush('right');
      const damageStage = wearStage(state.health);
      finish.regions.set(nose, tail, left, right);
      finish.wear.value = damageStage * .30;
      const shatter = Math.max(0, damageStage - 1);
      glazing.cracks.set(Math.min(1, shatter * (.36 + nose * .67)),
        Math.min(1, shatter * (.38 + tail * .66 + Math.max(left, right) * .15)));
      const lampStrength = tail > .58 ? Math.max(.22, 1 - tail * .56 + Math.sin(state.elapsed * 37) * tail * .14) : 1;
      lampMaterial.color.set(braking ? '#ff745b' : '#ff3f2c').multiplyScalar(lampStrength);
      glows.forEach(glow => { glow.material.opacity = (braking ? .49 : .23) * lampStrength; });
      crumple(nose, tail, left, right);
      const bodyEnd = state.car.wheelbase / 2 + .62;
      const tearing = zone => impact?.zone === zone && impact.detached && age < .08;
      frontPanel.visible = state.damage.front < PANEL_BREAK || tearing('front');
      frontPanel.position.set(0, .27 - nose * .10, -bodyEnd + nose * .59);
      frontPanel.rotation.set(-nose * .47 + recoil * front * .16, nose * side * .42, -nose * .21);
      bumper.visible = state.damage.rear < PANEL_BREAK || tearing('rear');
      bumper.position.set(0, .35 - tail * .14, bodyEnd - tail * .56);
      bumper.rotation.set(tail * .47, tail * side * .43, tail * .24 + recoil * .11);
      wing.visible = bumper.visible;
      wing.rotation.z = tail * .39 + recoil * .085;
      flanks.left.visible = state.damage.left < PANEL_BREAK || tearing('left');
      flanks.right.visible = state.damage.right < PANEL_BREAK || tearing('right');
      flanks.left.rotation.y = left * .34;
      flanks.right.rotation.y = right * -.34;
    } else if (!vehicle.oncoming) {
      lampMaterial.color.set(vehicle.braking ? '#ff8a59' : '#ff4633');
      glows.forEach(glow => { glow.material.opacity = vehicle.braking ? .43 : .145; });
      const blink = Math.floor(state.elapsed * 5) % 2 === 0;
      for (const { light, side: turnSide } of model.userData.signals) light.visible = blink && vehicle.turnSignal === turnSide;
    }
  }

  function prepare(course) {
    for (const { theme } of course.sections) for (const time of ['morning', 'noon', 'sunset', 'night']) {
      const key = `${theme}-${time}`;
      if (warmed.has(key)) continue;
      const image = new Image();
      image.src = `${assetRoot}horizons/${key}.webp?v=1`;
      warmed.set(key, image);
    }
  }

  function render(state, view, braking, age = Infinity) {
    if (lastState !== state) {
      lastState = state;
      fit();
      prepare(state.course);
    }
    const { course, distance, x, speed } = state;
    const pose = poses[view];
    const narrow = clamp((1 - camera.aspect) * 3.6, 0, 2.1);
    const motion = reducedMotion.matches ? 0 : impactMotion(state.impact, age);
    const playerY = roadY(course, distance);
    const playerX = roadX(course, distance) + x;
    const laneHeading = Math.atan(roadSlope(course, distance));
    const heading = laneHeading + (view === 2 ? state.yaw : state.yaw * .27 - state.steer * .14);
    const back = pose.back + (view === 2 ? 0 : narrow + motion * .88);
    const headingX = Math.sin(heading);
    const headingZ = Math.cos(heading);
    const viewingZ = distance - back * headingZ;
    const origin = world.update(state, viewingZ);
    const camY = playerY + pose.height + narrow * .30 + motion * (view === 2 ? .13 : .32);
    const camX = playerX - back * headingX;
    const tilt = view === 2 ? state.pitch * 17 : 0;
    const bank = reducedMotion.matches ? 0 : state.roll * (view === 2 ? .45 : .19);
    camera.position.set(camX, camY, origin - viewingZ);
    camera.lookAt(playerX + headingX * 60,
      camY - (view === 2 ? 4.9 : 5.7) - motion * .95 + tilt, origin - distance - headingZ * 60);
    const cameraRoll = bank + (motion ? motion * (state.impact.side || .29) * .14 : 0);
    if (cameraRoll) camera.rotateZ(cameraRoll);
    camera.updateProjectionMatrix();
    if (view !== 2 && cameraRoll) {
      // Banking rotates the car's projection around the optical axis. Re-centre the lens on the car.
      camera.updateMatrixWorld();
      carCenter.set(playerX, playerY + .69, origin - distance).project(camera);
      camera.projectionMatrix.elements[8] += carCenter.x;
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    }

    const { current, next, mix } = trackLook(course, distance, !state.mode.goal);
    const a = atmospheres[current.theme];
    const b = atmospheres[next.theme];
    const underpass = world.tunnelAt(viewingZ + 3);
    // 시간 흐름 · 날씨 — 빛 · 안개 · 하늘을 하루 시간에 맞추고, 흐림 · 비 · 안개 · 눈을 더한다
    const day = dayTime(dayProgress(state), !state.mode.goal);
    const weather = weatherAt(course, distance);
    const w = weather.amount;
    const gloom = { cloudy: .45, rain: .6, fog: .35, snow: .4 }[weather.kind] * w || 0;
    const night = day.night;
    tint(haze, a.fog, b.fog, mix);
    haze.lerp(temporary.set(day.fog), .6);
    if (weather.kind === 'fog' || weather.kind === 'snow') haze.lerp(temporary.set(night > .5 ? '#3a4150' : '#c9ced4'), .55 * w);
    if (weather.kind === 'rain') haze.lerp(temporary.set(night > .5 ? '#262c38' : '#7c8590'), .45 * w);
    if (underpass) haze.lerp(temporary.set('#555863'), .76);
    scene.fog.color.copy(haze);
    const thick = weather.kind === 'fog' ? w : weather.kind === 'snow' || weather.kind === 'rain' ? w * .45 : 0;
    scene.fog.near = underpass ? 32 : 72 - 50 * thick;
    scene.fog.far = underpass ? 235 : 485 - 285 * thick;
    const skyA = `${current.theme}-${day.skyA}`;
    const skyFilter = gloom ? `saturate(${1 - gloom * .7}) brightness(${1 - gloom * .35})` : '';
    if (mix > 0) panoramaState(skyA, `${next.theme}-${day.skyA}`, mix, headingX, underpass, skyFilter);
    else panoramaState(skyA, `${current.theme}-${day.skyB}`, day.skyMix, headingX, underpass, skyFilter);
    ambient.intensity = underpass ? 1.8 : day.ambI * (1 - gloom * .2);
    sun.intensity = underpass ? .55 : day.sunI * (1 - gloom * .6);
    renderer.toneMappingExposure = underpass ? 1.06 : day.exposure * (1 - gloom * .06);
    sun.color.set(day.sun);
    tint(temporary, a.light, b.light, mix);
    sun.color.lerp(temporary, .2);
    ambient.color.set(day.amb);
    world.daylight(1 - night);
    sun.target.position.set(playerX, playerY, origin - distance);
    sun.position.set(playerX + 13, playerY + 3 + 14 * day.height, origin - distance - 24);

    const used = new Set();
    const traffic = state.rival ? [...state.traffic, state.rival] : state.traffic;
    for (const vehicle of traffic) {
      if (vehicle.z < viewingZ - 6 || vehicle.z > viewingZ + 365) continue;
      showVehicle(vehicle, vehicle, state, origin, false, false, age);
      used.add(vehicle);
    }
    if (!playerTokens.has(state.car.name)) playerTokens.set(state.car.name, {});
    const player = playerTokens.get(state.car.name);
    showVehicle({ ...state.car, x, z: distance, speed }, player, state, origin, true, braking, age);
    used.add(player);
    // 보닛 시점: 카메라가 앞유리 · 지붕 안쪽에 들어가 앞이 막히던 것(앞유리가 길게 뻗은 앰버 GT) — 내 차 지붕 · 유리만 숨긴다
    const [, cabinMesh, roofMesh] = vehicles.get(player).model.userData.chassis.children;
    cabinMesh.visible = roofMesh.visible = view !== 2;
    for (const [token, v] of vehicles) if (!used.has(token)) clearVehicle(token, v);

    const falling = weather.kind === 'rain' || weather.kind === 'snow' ? w : 0;
    rain(state.elapsed, underpass ? 0 : falling, speed, weather.kind === 'snow');
    lens.style.opacity = String(clamp((speed * 3.6 - 158) / 155, 0, .62));
    damageSmoke.forEach((puff, i) => {
      puff.visible = state.health <= 1;
      if (!puff.visible) return;
      const phase = (state.elapsed * .86 + i / damageSmoke.length) % 1;
      const nearEngine = state.damage.front >= state.damage.rear;
      const station = distance + (nearEngine ? 1.28 : -1.35) - phase * Math.min(5, speed * .14);
      puff.position.set(roadX(course, station) + x + Math.sin(i * 3.9) * phase * .46,
        roadY(course, station) + .45 + phase * 1.5, origin - station);
      const size = .32 + phase * 1.25;
      puff.scale.set(size, size * 1.14, 1);
      puff.material.opacity = Math.sin(phase * Math.PI) * (state.health ? .19 : .30);
    });
    if (!impactWarmed) {
      // The first countdown frame compiles both impact effects before either can be triggered.
      impactFx.warm();
      trafficFx.warm();
      renderer.render(scene, camera);
      impactWarmed = true;
    }
    impactFx.render(state, origin, age);
    const trafficImpact = state.trafficImpact;
    trafficFx.render(state, origin, trafficImpact ? state.elapsed - trafficImpact.at : Infinity, trafficImpact);
    renderer.render(scene, camera);
  }

  return { render, prepare };
}

export function createScene(stage) {
  let display;
  let lost = false;
  const canvas = stage.querySelector('[data-webgl]');
  if (globalThis.THREE) {
    try { display = createWebGL(globalThis.THREE, stage); } catch (error) {
      console.info('Twilight Run: WebGL unavailable', error.message);
    }
  }
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    lost = true;
  });
  let fallback;
  return {
    prepare(course) { display?.prepare(course); },
    render(...args) {
      if (display && !lost) {
        stage.dataset.renderer = 'webgl';
        display.render(...args);
        return;
      }
      if (!fallback) {
        canvas.hidden = true;
        const substitute = stage.querySelector('[data-fallback]');
        substitute.hidden = false;
        stage.dataset.renderer = 'canvas';
        fallback = createFallback(substitute);
      }
      fallback(...args);
    },
  };
}
