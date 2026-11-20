import { TIRE_RADIUS } from './drive.js';
import { bodyFinish, fractureMap, glassFinish } from './finishes.js';

// Local car coordinates point toward -Z. Lofted cross sections describe the coachwork in metres.
const profiles = {
  coupe: { w: 1.03, l: 2.30, deck: .76, roof: 1.22, front: -.40, rear: .40, taper: .90, nose: .46, waist: .87, rearWidth: .97, brake: '#e9ac42', plate: 'SOLAR S' },
  sport: { w: 1.01, l: 2.16, deck: .79, roof: 1.28, front: -.54, rear: .57, taper: .89, nose: .55, waist: .91, rearWidth: .97, brake: '#97eaff', plate: 'ION RS' },
  gt: { w: 1.08, l: 2.37, deck: .83, roof: 1.31, front: -.83, rear: .28, taper: .90, nose: .49, waist: .89, rearWidth: 1, brake: '#ee6b40', plate: 'AMBER GT' },
  hyper: { w: 1.10, l: 2.25, deck: .70, roof: 1.10, front: -.67, rear: .52, taper: .92, nose: .39, waist: .84, rearWidth: .95, brake: '#d6a674', plate: 'PULSE X' },
  wagon: { w: .88, l: 2.27, deck: .98, roof: 1.57, front: -1.12, rear: 1.40, taper: .85, nose: .68, waist: .98, rearWidth: .93 },
  sedan: { w: .89, l: 2.19, deck: .91, roof: 1.44, front: -.59, rear: .68, taper: .89, nose: .66, waist: .96, rearWidth: .93 },
  van: { w: 1.02, l: 2.45, deck: 1.18, roof: 1.98, front: -1.03, rear: 1.90, taper: .93, nose: .91, waist: .99, rearWidth: .98 },
};
const liveries = {
  coupe: { index: 0, stripe: '#202827', accent: '#d4af5e', rim: '#b59d68' },
  sport: { index: 1, stripe: '#142e48', accent: '#b9f5fb', rim: '#a8c4dd' },
  gt: { index: 2, stripe: '#f3e6cc', accent: '#fff0cc', rim: '#b9b9b5' },
  hyper: { index: 3, stripe: '#151b32', accent: '#e8a171', rim: '#a47d71' },
};

export function createCarModels(T, glowTexture) {
  const standard = (color, roughness = .65, metalness = 0) =>
    new T.MeshStandardMaterial({ color, roughness, metalness, side: T.DoubleSide });
  const rubber = standard('#101218', .89);
  const alloy = standard('#a8b1bf', .27, .82);
  const rotor = standard('#5c6570', .42, .69);
  const trim = standard('#182029', .47, .38);
  const grille = standard('#0a0e14', .83);
  const glass = standard('#344957', .20, .58);
  const blackGlass = standard('#172432', .18, .58);
  const seam = standard('#20262c', .74);
  const lampWhite = new T.MeshBasicMaterial({ color: '#dcf2ff' });
  const indicator = new T.MeshBasicMaterial({ color: '#ffc345' });
  const reflector = standard('#b72e36', .26, .32);
  const plate = standard('#c8cec2', .72);
  const wheel = new T.CylinderGeometry(.363, .363, .25, 18);
  const detailWheel = new T.LatheGeometry([
    [.20, -.147], [.31, -.149], [.343, -.132], [.363, -.103], [TIRE_RADIUS, -.077],
    [TIRE_RADIUS, .077], [.362, .103], [.342, .134], [.303, .147], [.20, .147],
  ].map(([x, y]) => new T.Vector2(x, y)), 34);
  const disc = new T.CylinderGeometry(.212, .212, .039, 19);
  const lug = new T.CylinderGeometry(.062, .062, .045, 12);
  const lip = new T.TorusGeometry(.248, .015, 6, 32);
  const tube = new T.CylinderGeometry(1, 1, 1, 12);
  const plane = new T.PlaneGeometry(1, 1);
  const cube = new T.BoxGeometry(1, 1, 1);
  const geometries = new Map();
  const paints = new Map();
  const plates = new Map();
  const brakes = new Map();
  const accents = new Map();
  const rims = new Map();
  const crackedGlass = fractureMap(T);

  function loft(sections) {
    const points = [];
    const indices = [];
    for (const [z, w, low, high, taper] of sections) {
      const bevel = Math.min(.091, (high - low) * .32);
      points.push(-w * taper, high, z, w * taper, high, z,
        w * .984, high - bevel * .48, z, w, high - bevel, z,
        w * .976, low + bevel * .72, z, w * .859, low, z,
        -w * .859, low, z, -w * .976, low + bevel * .72, z,
        -w, high - bevel, z, -w * .984, high - bevel * .48, z);
    }
    const stride = 10;
    for (let row = 0; row < sections.length - 1; row++) {
      for (let i = 0; i < stride; i++) {
        const a = row * stride + i;
        const b = row * stride + (i + 1) % stride;
        indices.push(a, a + stride, b, b, a + stride, b + stride);
      }
    }
    const last = (sections.length - 1) * stride;
    for (let i = 1; i < stride - 1; i++) indices.push(0, i, i + 1, last, last + i + 1, last + i);
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(points, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  function wheelArches(sections, axle) {
    const radius = .432;
    const stations = new Set(sections.map(section => section[0]));
    for (const center of [-axle, axle]) for (let i = 0; i <= 16; i++) {
      stations.add(center + radius * Math.cos(Math.PI * i / 16));
    }
    return [...stations].sort((a, b) => a - b).map(z => {
      const i = Math.max(1, sections.findIndex(section => section[0] >= z));
      const left = sections[i - 1];
      const right = sections[i];
      const mix = T.MathUtils.clamp((z - left[0]) / (right[0] - left[0]), 0, 1);
      const [w, low, high, taper] = left.slice(1).map((value, k) => T.MathUtils.lerp(value, right[k + 1], mix));
      const gap = Math.abs(Math.abs(z) - axle);
      const arch = gap < radius ? Math.sqrt(Math.max(0, 1 - (gap / radius) ** 2)) : 0;
      const raised = Math.max(high + arch * .12, low + arch * .58 + .07);
      return [z, w + arch * .031, low + arch * .56, raised, taper];
    });
  }

  function shell(shape, detailed) {
    const key = shape + ':' + detailed;
    if (geometries.has(key)) return geometries.get(key);
    const data = profiles[shape];
    const { w, l, deck, roof, front, rear, taper, nose, waist, rearWidth } = data;
    const van = shape === 'van';
    const sections = [
      [-l, w * .82, .23, nose, .86], [-l + .13, w * .92, .20, nose + .062, .94],
      [-l + .35, w * .985, .18, nose + .14, .91], [-l + .62, w, .18, van ? .99 : deck * .94, taper],
      [-.88, w * waist, .18, deck + .012, taper], [.37, w * (waist + .026), .18, deck, taper],
      [l - .62, w * rearWidth, .18, deck + .04, taper], [l - .32, w * rearWidth, .18, deck + .005, .94],
      [l - .115, w * .93, .20, deck - .025, .955], [l, w * .87, .27, deck - (van ? .02 : .084), .92],
    ];
    const base = loft(detailed ? wheelArches(sections, l - .62) : sections);
    const end = rear + (van ? .19 : .70);
    const frontGlass = front - (van ? .44 : .92);
    const backGlass = van ? roof - .16 : deck + .065;
    const cabin = loft([
      [frontGlass, w * .70, deck - .13, deck + .04, .96],
      [front - .22, w * .712, deck - .02, roof - (van ? .08 : .12), .80],
      [front + .045, w * .669, deck - .03, roof + .004, .82],
      [rear * .56, w * .674, deck - .03, roof - .018, .82],
      [rear + .23, w * .695, deck - .052, roof - (van ? .052 : .195), .83],
      [end, w * .72, deck - .119, backGlass, .94],
    ]);
    const cap = loft([
      [front, w * .513, roof - .037, roof + .012, .92], [front + .14, w * .552, roof - .034, roof + .044, .89],
      [rear * .54, w * .544, roof - .064, roof + .014, .92], [rear + .12, w * .557, roof - .157, roof - .094, .89],
    ]);
    const result = { ...data, base, cabin, cap };
    geometries.set(key, result);
    return result;
  }

  function piece(group, geometry, material, x, y, z, sx = 1, sy = 1, sz = 1) {
    const mesh = new T.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    group.add(mesh);
    return mesh;
  }
  const box = (group, material, ...measure) => piece(group, cube, material, ...measure);

  function panel(group, material, points) {
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(points.flat(), 3));
    const indices = [];
    for (let i = 1; i < points.length - 1; i++) indices.push(0, i, i + 1);
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return piece(group, geometry, material, 0, 0, 0);
  }

  function modelPlate(text) {
    if (!plates.has(text)) {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 68;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#e5e9e3';
      ctx.fillRect(0, 0, 256, 68);
      ctx.fillStyle = '#394442';
      ctx.fillRect(0, 0, 256, 9);
      ctx.font = '800 34px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(text, 128, 51);
      const map = new T.CanvasTexture(canvas);
      map.colorSpace = T.SRGBColorSpace;
      plates.set(text, new T.MeshStandardMaterial({ map, roughness: .65 }));
    }
    return plates.get(text);
  }

  function aero(group, shape, data, paint) {
    const { w, l, deck, roof, front, rear } = data;
    const boot = l - .21;
    const rearDeck = deck - .021;
    const floor = .23;
    const stripe = shape === 'gt' ? alloy : blackGlass;
    const accent = accents.get(shape);
    const bumper = new T.Group();
    const frontPanel = new T.Group();
    const sides = {};
    panel(bumper, grille, [
      [-w * .77, floor, l + .018], [w * .77, floor, l + .018],
      [w * .70, .386, l + .020], [w * .53, .43, l + .021],
      [-w * .53, .43, l + .021], [-w * .70, .386, l + .020],
    ]);
    for (const side of [-1, 1]) {
      const bodySide = new T.Group();
      sides[side < 0 ? 'left' : 'right'] = bodySide;
      const fin = box(bumper, trim, side * w * .49, .296, l + .039, .056, .135, .151);
      fin.rotation.z = side * -.15;
      box(bumper, accent, side * w * .657, .269, l + .041, w * .22, .026, .062);
      const exhaust = piece(bumper, tube, alloy, side * (shape === 'gt' ? .39 : .62), .34, l + .034, .084, .108, .044);
      exhaust.rotation.x = Math.PI / 2;
      const opening = piece(bumper, tube, grille, exhaust.position.x, .34, l + .094, .059, .016, .030);
      opening.rotation.x = Math.PI / 2;
      const mirror = box(group, paint, side * w * .814, roof - .266, front - .075, .25, .084, .165);
      mirror.rotation.y = side * .18;
      box(group, blackGlass, side * w * .84, roof - .26, front + .011, .18, .063, .022);
      panel(bodySide, grille, [
        [side * w * .91, .30, -.60], [side * w * .914, .32, .68],
        [side * w * .956, .52, .96], [side * w * .929, .535, .31],
      ]);
      panel(bodySide, paint, [
        [side * w * .93, .24, -.84], [side * w * .97, .252, .85],
        [side * w * .929, .313, .68], [side * w * .91, .292, -.63],
      ]);
      panel(bodySide, accent, [
        [side * w * .937, .236, -.82], [side * w * .978, .249, .82],
        [side * w * .976, .271, .75], [side * w * .933, .251, -.67],
      ]);
      panel(group, blackGlass, [
        [side * w * .75, deck + .092, front - .18], [side * w * .596, roof - .057, front + .099],
        [side * w * .633, roof - .092, rear * .64], [side * w * .751, deck + .079, rear + .36],
      ]);
      panel(group, seam, [
        [side * w * .642, roof - .048, rear * .44], [side * w * .667, roof - .053, rear * .49 + .045],
        [side * w * .757, deck + .075, rear * .65 + .18], [side * w * .754, deck + .070, rear * .65 + .10],
      ]);
      panel(group, stripe, [
        [side * w * .88, deck + .033, boot - .39], [side * w * .77, deck + .037, boot - .46],
        [side * w * .75, deck + .028, boot - .045], [side * w * .86, deck + .02, boot - .092],
      ]);
    }
    panel(frontPanel, grille, [
      [-w * .72, .245, -l - .021], [w * .72, .245, -l - .021],
      [w * .58, data.nose - .102, -l - .025], [-w * .58, data.nose - .102, -l - .025],
    ]);
    panel(frontPanel, paint, [
      [-w * .75, .237, -l -.039], [w * .75, .237, -l -.039],
      [w * .79, .181, -l + .14], [-w * .79, .181, -l + .14],
    ]);
    panel(frontPanel, blackGlass, [
      [-w * .88, .187, -l - .118], [w * .88, .187, -l - .118],
      [w * .94, .177, -l + .20], [-w * .94, .177, -l + .20],
    ]);
    box(frontPanel, accent, 0, .198, -l - .112, w * 1.48, .019, .038);
    const wing = new T.Group();
    const wingHeight = { coupe: .095, sport: .056, gt: .405, hyper: .183 }[shape];
    for (const side of [-1, 1]) {
      if (wingHeight > .06) {
        const pylon = box(wing, trim, side * w * .52, rearDeck + wingHeight * .43, boot - .047, .058, wingHeight, .132);
        pylon.rotation.x = -.18;
      }
      if (shape === 'gt' || shape === 'hyper') {
        const endplate = box(wing, shape === 'gt' ? paint : trim, side * w * .92, rearDeck + wingHeight,
          boot + .014, .045, .116, .36);
        endplate.rotation.x = -.09;
      }
    }
    const spoiler = box(wing, shape === 'sport' ? paint : trim, 0, rearDeck + wingHeight, boot,
      w * (shape === 'gt' ? 1.87 : 1.70), shape === 'sport' ? .055 : .041, shape === 'gt' ? .30 : .195);
    spoiler.rotation.x = -.115;
    box(wing, accent, 0, rearDeck + wingHeight + .022, boot + .091, w * 1.53, .018, .034);
    function mount(part, x, y, z) {
      const pivot = new T.Group();
      pivot.position.set(x, y, z);
      part.position.copy(pivot.position).negate();
      pivot.add(part);
      group.add(pivot);
      return pivot;
    }
    return {
      bumper: mount(bumper, 0, .35, l), wing: mount(wing, 0, rearDeck, boot),
      frontPanel: mount(frontPanel, 0, .27, -l),
      flanks: { left: mount(sides.left, -w * .93, .38, .06), right: mount(sides.right, w * .93, .38, .06) },
      frontLights: frontPanel,
    };
  }

  function lamps(group, shape, data, red, player, oncoming, frontPanel = group) {
    const { w, l, deck, nose } = data;
    const tail = l + .026;
    const head = -l - .026;
    const y = deck - .225;
    const glows = [];
    const signals = [];
    const tailRed = player || !oncoming;
    if (player && shape === 'sport') {
      box(group, grille, 0, y, tail, w * 1.62, .116, .043);
      box(group, red, 0, y + .009, tail + .027, w * 1.54, .027, .013);
    }
    for (const side of [-1, 1]) {
      if (tailRed && shape !== 'sport') {
        box(group, grille, side * w * .606, y, tail, w * .50, .139, .049);
        if (player && shape === 'gt') {
          for (let bar = 0; bar < 3; bar++) {
            const lamp = box(group, red, side * w * (.46 + bar * .133), y + .005, tail + .031, .051, .091, .024);
            lamp.rotation.z = side * -.20;
          }
        } else if (player && shape === 'hyper') {
          panel(group, red, [
            [side * w * .35, y + .009, tail + .028], [side * w * .78, y + .009, tail + .028],
            [side * w * .86, y + .057, tail + .028], [side * w * .78, y + .040, tail + .028],
            [side * w * .35, y + .040, tail + .028],
          ]);
          box(group, red, side * w * .594, y - .032, tail + .031, w * .43, .013, .017);
        } else {
          for (const level of [-.034, .024]) box(group, red, side * w * .605, y + level, tail + .03, w * .46, .024, .024);
        }
      }
      if (player || oncoming) {
        box(frontPanel, grille, side * w * .61, nose - .108, head, w * .46, .108, .048);
        const light = box(frontPanel, lampWhite, side * w * .63, nose - .093, head - .029, w * .42, .028, .017);
        light.rotation.z = side * (shape === 'hyper' ? .20 : .063);
        if (player) {
          const outer = side * w * .818, inner = side * w * .69;
          panel(frontPanel, lampWhite, [
            [inner, nose - .071, head - .047], [outer, nose - .042, head - .047],
            [outer, nose - .027, head - .046], [inner, nose - .056, head - .046],
          ]);
          box(frontPanel, reflector, side * w * .83, nose - .135, head - .031, w * .053, .025, .025);
        }
      }
      if (!player && !oncoming) {
        const light = box(group, indicator, side * w * .84, y + .066, tail + .054, w * .133, .028, .019);
        light.visible = false;
        signals.push({ light, side });
      }
      const sprite = new T.Sprite(new T.SpriteMaterial({
        map: glowTexture, color: oncoming ? '#ccf0ff' : '#ff321f', opacity: oncoming ? .40 : .145,
        transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      }));
      sprite.position.set(side * w * .61, oncoming ? nose - .085 : y, oncoming ? head - .046 : tail + .056);
      sprite.scale.setScalar(oncoming ? 1.38 : .71);
      group.add(sprite);
      glows.push(sprite);
    }
    return { glows, signals };
  }

  function crumpling(geometry, { w, l }) {
    const positions = geometry.getAttribute('position');
    positions.setUsage(T.DynamicDrawUsage);
    const original = positions.array.slice();
    let last = -1;
    return (front, rear, left, right) => {
      const levels = Math.round(front * 22) | Math.round(rear * 22) << 5 |
        Math.round(left * 22) << 10 | Math.round(right * 22) << 15;
      if (levels === last) return;
      last = levels;
      for (let i = 0; i < positions.count; i++) {
        const x = original[i * 3], y = original[i * 3 + 1], z = original[i * 3 + 2];
        const f = front * Math.max(0, (-z / l - .38) / .62) ** 2;
        const b = rear * Math.max(0, (z / l - .42) / .58) ** 2;
        const s = (x < 0 ? left : right) * (Math.abs(x) / w) ** 3 * Math.max(0, 1 - Math.abs(z) / l * .74);
        const fold = .74 + Math.sin(x * 19 + z * 31) * .24;
        positions.setXYZ(i, x * (1 - .39 * s) + Math.sign(x) * (f + b) * fold * .075,
          y + (f * .34 + b * .23) * fold * (y > .49 ? 1 : -.36) - s * .16 * fold,
          z + f * (.49 + fold * .28) - b * (.40 + fold * .23));
      }
      positions.needsUpdate = true;
      geometry.computeVertexNormals();
    };
  }

  return function model(car, player) {
    const shape = profiles[car.shape] ? car.shape : 'sedan';
    const detail = player;
    const data = shell(shape, detail);
    const { w, l, deck, base, cabin, cap } = data;
    if (!paints.has(car.color)) {
      const paint = new T.MeshPhysicalMaterial({
        color: car.color, roughness: .235, metalness: .47, clearcoat: 1, clearcoatRoughness: .115,
        envMapIntensity: .94, side: T.DoubleSide,
      });
      paints.set(car.color, paint);
    }
    const paint = paints.get(car.color);
    const group = new T.Group();
    const chassis = new T.Group();
    const wheels = [];
    const coachwork = detail ? base.clone() : base;
    const livery = liveries[shape];
    const finish = detail ? bodyFinish(T, paint, data, livery.index, livery.stripe) : null;
    const glazing = detail ? glassFinish(T, glass, data, crackedGlass) : null;
    chassis.add(new T.Mesh(coachwork, finish?.material || paint), new T.Mesh(cabin, glazing?.material || glass),
      new T.Mesh(cap, detail && (shape === 'hyper' || shape === 'sport') ? blackGlass : paint));
    group.add(chassis);
    if (detail) chassis.children.forEach(mesh => { mesh.castShadow = true; });
    if (detail && !brakes.has(shape)) {
      brakes.set(shape, standard(data.brake, .39, .19));
      accents.set(shape, standard(livery.accent, .31, .45));
      rims.set(shape, standard(livery.rim, .22, .72));
    }

    for (const side of [-1, 1]) for (const end of [-1, 1]) {
      const assembly = new T.Group();
      const rotating = new T.Group();
      const front = end < 0;
      const halfTrack = w - (detail ? front ? .075 : .105 : .097);
      const axle = detail ? car.wheelbase / 2 : l - .62;
      assembly.position.set(side * halfTrack, detail ? TIRE_RADIUS : .363, end * axle);
      if (detail && front) {
        const knuckle = piece(group, tube, trim, side * halfTrack * .81, TIRE_RADIUS, -axle, .064, halfTrack * .48, .064);
        knuckle.rotation.z = Math.PI / 2;
      }
      const tire = piece(rotating, detail ? detailWheel : wheel, rubber, 0, 0, 0);
      tire.rotation.z = Math.PI / 2;
      const brake = piece(assembly, disc, detail ? rotor : alloy, side * (detail ? .131 : .127), 0, 0);
      brake.rotation.z = Math.PI / 2;
      if (detail) {
        box(assembly, brakes.get(shape), side * .137, .149, .107, .069, .128, .088);
        const edge = piece(rotating, lip, rims.get(shape), side * .144, 0, 0);
        edge.rotation.y = Math.PI / 2;
        const count = { coupe: 5, sport: 7, gt: 6, hyper: 9 }[shape];
        for (let i = 0; i < count; i++) {
          const angle = i * Math.PI * 2 / count;
          const spoke = box(rotating, shape === 'hyper' ? rotor : rims.get(shape), side * .164,
            Math.cos(angle) * .136, Math.sin(angle) * .136, .029, .212, shape === 'coupe' ? .047 : .027);
          spoke.rotation.x = angle + (shape === 'sport' ? -.15 : .10);
        }
        const hub = piece(rotating, lug, trim, side * .175, 0, 0);
        hub.rotation.z = Math.PI / 2;
      }
      assembly.add(rotating);
      group.add(assembly);
      wheels.push({ assembly, rotating, front, side, halfTrack });
    }

    const lampMaterial = new T.MeshBasicMaterial({ color: '#ff4633' });
    const parts = detail ? aero(chassis, shape, data, paint) : {};
    const lights = lamps(chassis, shape, data, lampMaterial, detail, car.oncoming, parts.frontLights);
    if (detail) {
      piece(parts.bumper.children[0], plane, modelPlate(data.plate), 0, deck - .23, l + .039, .38, .101, 1);
    } else {
      box(chassis, trim, 0, .34, l - .009, w * 1.42, .105, .08);
      if (!car.oncoming) box(chassis, plate, 0, deck - .225, l + .027, .30, .085, .021);
    }
    group.userData = { chassis, wheels, lampMaterial, ...lights, ...parts };
    if (detail) {
      group.userData.crumple = crumpling(coachwork, data);
      group.userData.finish = finish;
      group.userData.glazing = glazing;
    }
    return group;
  };
}
