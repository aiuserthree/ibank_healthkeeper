import { clamp, roadX, roadY } from './drive.js?v=14';

export const impactDuration = 1.52;
export function impactMotion(impact, age) {
  if (!impact || age >= impactDuration) return 0;
  return -Math.expm1(-age * 32) * Math.exp(-age * 5.4) * Math.sin(age * 17 + .75) * impact.force;
}

function bounce(time, velocity, height, gravity, rebound) {
  const landing = (velocity + Math.sqrt(velocity ** 2 + 2 * gravity * height)) / gravity;
  if (time < landing) return height + velocity * time - gravity * time ** 2 / 2;
  const after = time - landing;
  return Math.max(0, (gravity * landing - velocity) * rebound * after - gravity * after ** 2 / 2);
}

export function createImpactFx(T, scene, softTexture, compact = false) {
  const sparks = compact ? 48 : 114;
  const chips = compact ? 14 : 42;
  const puffs = compact ? 6 : 17;
  const panelCount = compact ? 2 : 7;
  const vertices = new Float32Array(sparks * 6);
  const colors = new Float32Array(sparks * 6);
  const paths = new T.BufferGeometry();
  const positions = new T.BufferAttribute(vertices, 3).setUsage(T.DynamicDrawUsage);
  const shading = new T.BufferAttribute(colors, 3).setUsage(T.DynamicDrawUsage);
  paths.setAttribute('position', positions);
  paths.setAttribute('color', shading);
  const lines = new T.LineSegments(paths, new T.LineBasicMaterial({
    vertexColors: true, transparent: true, blending: T.AdditiveBlending,
    depthWrite: false, toneMapped: false, fog: false,
  }));
  lines.frustumCulled = false;
  lines.renderOrder = 5;
  const tipPositions = new Float32Array(sparks * 3);
  const tipColors = new Float32Array(sparks * 3);
  const tips = new T.BufferGeometry();
  const tipPoints = new T.BufferAttribute(tipPositions, 3).setUsage(T.DynamicDrawUsage);
  const tipShading = new T.BufferAttribute(tipColors, 3).setUsage(T.DynamicDrawUsage);
  tips.setAttribute('position', tipPoints);
  tips.setAttribute('color', tipShading);
  const embers = new T.Points(tips, new T.PointsMaterial({
    size: compact ? .14 : .19, map: softTexture, vertexColors: true, transparent: true, blending: T.AdditiveBlending,
    depthWrite: false, toneMapped: false, fog: false,
  }));
  embers.frustumCulled = false;
  embers.renderOrder = 5;

  const fragments = new T.InstancedMesh(
    new T.TetrahedronGeometry(1),
    new T.MeshStandardMaterial({ roughness: .34, metalness: .44 }),
    chips,
  );
  fragments.instanceMatrix.setUsage(T.DynamicDrawUsage);
  fragments.frustumCulled = false;
  const sheet = new T.BoxGeometry(1, 1, 1, 4, 1, 2);
  const skin = sheet.getAttribute('position');
  for (let i = 0; i < skin.count; i++) {
    const x = skin.getX(i), y = skin.getY(i), z = skin.getZ(i);
    skin.setXYZ(i, x * (.84 + .22 * Math.sin(z * 14)), y + .24 * Math.sin(x * 6 + z * 4), z + .16 * Math.sin(x * 15));
  }
  sheet.computeVertexNormals();
  const panels = new T.InstancedMesh(sheet, new T.MeshStandardMaterial({ roughness: .27, metalness: .41 }), panelCount);
  panels.instanceMatrix.setUsage(T.DynamicDrawUsage);
  panels.frustumCulled = false;
  const shard = new T.Object3D();
  const color = new T.Color();
  const haze = Array.from({ length: puffs }, () => {
    const sprite = new T.Sprite(new T.SpriteMaterial({
      map: softTexture, color: '#75645e', transparent: true, depthWrite: false,
      opacity: 0, fog: false,
    }));
    sprite.renderOrder = 2;
    return sprite;
  });

  const ring = new T.Mesh(new T.RingGeometry(.86, 1, 52), new T.MeshBasicMaterial({
    color: '#ffc078', transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide,
    blending: T.AdditiveBlending, fog: false, toneMapped: false,
  }));
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = 4;
  const flare = new T.Sprite(new T.SpriteMaterial({
    map: softTexture, color: '#ff9651', transparent: true, depthWrite: false, depthTest: false,
    blending: T.AdditiveBlending, toneMapped: false, fog: false,
  }));
  flare.renderOrder = 6;
  const core = new T.Sprite(new T.SpriteMaterial({
    map: softTexture, color: '#fff3cd', transparent: true, depthWrite: false,
    blending: T.AdditiveBlending, toneMapped: false, fog: false,
  }));
  core.renderOrder = 7;
  const light = compact ? null : new T.PointLight('#ff9e65', 0, 12, 2);
  const smoke = new T.Sprite(new T.SpriteMaterial({
    map: softTexture, color: '#413936', transparent: true, depthWrite: false, opacity: 0,
  }));
  smoke.renderOrder = 3;
  const objects = [lines, embers, fragments, panels, ring, flare, core, smoke, ...haze];
  if (light) scene.add(light);
  scene.add(...objects);
  for (let i = 0; i < chips; i++) fragments.setColorAt(i, color);
  for (let i = 0; i < panels.count; i++) panels.setColorAt(i, color);

  let previous;
  const patterns = Array.from({ length: sparks }, () => Float32Array.from({ length: 9 }, () => Math.random()));
  const projectiles = Array.from({ length: sparks }, () => ({}));

  function warm() {
    for (const object of objects) object.visible = true;
  }

  function seed(impact, paint) {
    previous = impact;
    const { side, front, force, carry } = impact;
    const phase = Math.floor(Math.abs(impact.z)) % sparks;
    for (let i = 0; i < sparks; i++) {
      const p = projectiles[i];
      const r = patterns[(phase + i) % sparks];
      p.vx = (r[0] - .5) * (10 + force * 21) - side * (2 + r[3] * 10);
      p.vy = 1.25 + r[1] * (4.7 + force * 8.5);
      p.vz = carry - front * (1.3 + r[4] * 7) + (r[2] - .5) * 19;
      p.size = .025 + r[4] * .129;
      p.stretch = .029 + r[5] * .080;
      p.life = .25 + r[6] * (.42 + force * .43);
      p.spin = r[7] * 17 - 8.5;
      p.hot = .42 + r[8] * .58;
    }
    for (let i = 0; i < chips; i++) {
      color.set(i % 4 === 0 ? paint : i % 3 === 0 ? '#bdc3d2' : '#35333b');
      fragments.setColorAt(i, color);
    }
    fragments.instanceColor.needsUpdate = true;
    for (let i = 0; i < panelCount; i++) {
      color.set(i % 3 === 2 || i === 1 && impact.zone === 'rear' ? '#292c35' : paint);
      panels.setColorAt(i, color);
    }
    panels.instanceColor.needsUpdate = true;
  }

  function render(state, origin, age, impact = state.impact) {
    const active = impact && age < impactDuration;
    for (const object of objects) object.visible = Boolean(active);
    if (!active) {
      if (light) light.intensity = 0;
      return;
    }
    if (previous !== impact) seed(impact, impact.color || state.car.color);

    const { x, z, force, fatal } = impact;
    const cx = roadX(state.course, z) + x;
    const cy = roadY(state.course, z);
    const cz = origin - z;
    const visibleSparks = Math.round(sparks * (.27 + force * .73));
    paths.setDrawRange(0, visibleSparks * 2);
    tips.setDrawRange(0, visibleSparks);
    for (let i = 0; i < visibleSparks; i++) {
      const { vx, vy, vz, stretch, life, hot } = projectiles[i];
      const fade = (1 - Math.min(age / life, 1)) ** 1.12;
      const tailTime = Math.max(0, age - stretch);
      const line = i * 6, tip = i * 3;
      vertices[line] = cx + vx * tailTime;
      vertices[line + 1] = cy + .049 + bounce(tailTime, vy, .42, 20, .26);
      vertices[line + 2] = cz - vz * tailTime;
      vertices[line + 3] = tipPositions[tip] = cx + vx * age;
      vertices[line + 4] = tipPositions[tip + 1] = cy + .049 + bounce(age, vy, .42, 20, .26);
      vertices[line + 5] = tipPositions[tip + 2] = cz - vz * age;
      colors[line] = fade * .46;
      colors[line + 1] = fade * .075;
      colors[line + 2] = fade * .017;
      colors[line + 3] = tipColors[tip] = fade * (1.30 + hot * .73);
      colors[line + 4] = tipColors[tip + 1] = fade * (hot * .60 + .23);
      colors[line + 5] = tipColors[tip + 2] = fade * (hot > .85 ? .62 : .087);
    }
    positions.needsUpdate = true;
    shading.needsUpdate = true;
    tipPoints.needsUpdate = true;
    tipShading.needsUpdate = true;

    const visibleChips = Math.round(chips * (.26 + .74 * force));
    fragments.count = visibleChips;
    for (let i = 0; i < visibleChips; i++) {
      const { vx, vy, vz, life, size, spin } = projectiles[(i * 3 + 1) % sparks];
      const fade = clamp((life + .16 - age) * 5, 0, 1);
      const station = z + vz * age * .76;
      const floor = roadY(state.course, station) + .024;
      shard.position.set(cx + vx * age * .82, floor + bounce(age, vy * .81, .37, 18, .29), origin - station);
      shard.rotation.set(age * spin, i + age * spin * .65, age * -spin * .71);
      shard.scale.set(size * fade, size * fade * .44, size * fade * 1.46);
      shard.updateMatrix();
      fragments.setMatrixAt(i, shard.matrix);
    }
    fragments.instanceMatrix.needsUpdate = true;

    const flight = Math.max(0, age - .080);
    const largePanels = Math.min(panelCount, fatal ? 7 : impact.detached ? 4 : force > .73 ? 2 : 0);
    panels.visible = flight > 0 && largePanels > 0;
    panels.count = largePanels;
    const panelAngle = Math.atan2(impact.side, impact.front);
    for (let i = 0; i < largePanels; i++) {
      const ray = projectiles[14 + i * 3];
      const station = z + ray.vz * flight * (.72 + .093 * i);
      const floor = roadY(state.course, station) + .04;
      const major = i === 0 && (impact.detached || fatal);
      const spoiler = i === 1 && impact.detached && impact.zone === 'rear';
      const ratio = clamp((impactDuration - age) * 3.5, 0, 1);
      shard.position.set(cx + (ray.vx * .7 - impact.side * 1.8) * flight,
        floor + bounce(flight, 3.1 + Math.abs(ray.vy) * .45, .49, 15, .41), origin - station);
      shard.rotation.set(flight * (5 + i * .87), -panelAngle + flight * ray.spin * .60, flight * (6 - i));
      shard.scale.set((major ? 1.46 : spoiler ? 1.62 : .53 - i * .032) * ratio,
        (major ? .17 : .072) * ratio, (major ? .51 : spoiler ? .24 : .29 + ray.size) * ratio);
      shard.updateMatrix();
      panels.setMatrixAt(i, shard.matrix);
    }
    panels.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < puffs; i++) {
      const puff = haze[i];
      const drift = projectiles[i + 29];
      const time = Math.max(0, age - i * .026);
      puff.visible = time > 0;
      puff.position.set(cx + drift.vx * time * .36, cy + .40 + time * (1.2 + drift.hot), cz - drift.vz * time * .73);
      const span = .38 + time * (1.93 + force * 1.28);
      puff.scale.set(span * 1.36, span, 1);
      puff.material.opacity = Math.sin(Math.min(1, time / 1.28) * Math.PI) * (fatal ? .49 : .35) * force;
    }

    const burst = Math.min(1, age / .022) * Math.max(0, 1 - age / .33);
    flare.position.set(cx, cy + .48, cz);
    flare.scale.setScalar(.65 + force * 3.2 + age * 2);
    flare.material.opacity = burst ** 2 * (.43 + .48 * force);
    core.position.copy(flare.position);
    core.scale.setScalar(.34 + force * .89);
    core.material.opacity = burst ** 3 * .87;
    if (light) {
      light.position.set(cx, cy + .88, cz);
      light.intensity = burst ** 2 * 20 * force;
    }

    ring.position.set(cx, cy + .052, cz);
    ring.scale.setScalar(.40 + age * (6.8 + force * 4.3));
    ring.material.opacity = burst * .18 * force;

    smoke.visible = fatal && age > .14;
    if (smoke.visible) {
      const front = Math.min(state.distance + 1.5, state.distance + state.speed * .045 + .5);
      smoke.position.set(roadX(state.course, front) + state.x - age * .37,
        roadY(state.course, front) + .54 + age * .91, origin - front);
      smoke.scale.set(1.1 + age * 2.5, .78 + age * 2.1, 1);
      smoke.material.opacity = Math.sin(age / impactDuration * Math.PI) * .58;
    }
  }

  return { render, warm };
}
