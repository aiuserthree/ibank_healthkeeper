import { ROAD_WIDTH, clamp, frontWheelAngle, roadSlope, roadX, roadY, TIRE_RADIUS, trackLook } from './drive.js?v=14';
import { assetRoot, atmospheres } from './world.js?v=14';
import { impactDuration, impactMotion } from './impact.js?v=14';

const palettes = {
  coast: { sky: ['#263549', '#af655a', '#f6b079'], hills: ['#846770', '#625661', '#444651'], land: ['#495454', '#465152'], road: ['#393b42', '#3c3e45'], rail: '#8e817d', sun: '#ffdb9b' },
  port: { sky: ['#101c39', '#263951', '#746382'], hills: ['#444763', '#373c54', '#272e43'], land: ['#26333d', '#23313b'], road: ['#323641', '#353946'], rail: '#596977', sun: '#c6defa' },
  ridge: { sky: ['#482e49', '#ac5e62', '#ffc294'], hills: ['#a26d71', '#865a61', '#66474e'], land: ['#754d4a', '#704947'], road: ['#453b40', '#483e42'], rail: '#9e7970', sun: '#ffe2ac' },
};
const poses = [{ back: 7.6, height: 2.75 }, { back: 11, height: 4.1 }, { back: -.5, height: 1.4 }];
const depth = 450;
const segment = 5;
const shadeCache = new Map();
const hash = (index) => {
  const n = Math.sin(index * 127.1 + 311.7) * 43758.5453;
  return n - Math.floor(n);
};

function shade(color, light) {
  const key = color + light;
  if (!shadeCache.has(key)) {
    const rgb = Number.parseInt(color.slice(1), 16);
    const scaled = shift => clamp(Math.round(((rgb >> shift) & 255) * light), 0, 255);
    shadeCache.set(key, `rgb(${scaled(16)},${scaled(8)},${scaled(0)})`);
  }
  return shadeCache.get(key);
}

export function createFallback(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  let w, h, scale, horizon, project;
  let backgroundKey = '';
  const background = document.createElement('canvas');
  const sky = background.getContext('2d', { alpha: false });
  const photos = new Map();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  function photo(theme) {
    let image = photos.get(theme);
    if (!image) {
      image = new Image();
      image.onload = () => { backgroundKey = ''; };
      image.src = `${assetRoot}horizons/${theme}.webp`;
      photos.set(theme, image);
    }
    return image;
  }

  function fit() {
    const limit = Math.min(devicePixelRatio || 1, 1.65);
    w = Math.max(1, Math.round(canvas.clientWidth));
    h = Math.max(1, Math.round(canvas.clientHeight));
    canvas.width = Math.round(w * limit);
    canvas.height = Math.round(h * limit);
    ctx.setTransform(canvas.width / w, 0, 0, canvas.height / h, 0, 0);
    scale = Math.min(w * .95, h * .91);
    horizon = h * .39;
    backgroundKey = '';
  }
  new ResizeObserver(fit).observe(canvas);
  fit();

  function polygon(points, color, target = ctx) {
    target.fillStyle = color;
    target.beginPath();
    target.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) target.lineTo(points[i][0], points[i][1]);
    target.closePath();
    target.fill();
  }

  function backdrop(theme, p, location) {
    const key = location + w + 'x' + h;
    if (backgroundKey !== key) {
      backgroundKey = key;
      background.width = w;
      background.height = h;
      const grad = sky.createLinearGradient(0, 0, 0, horizon + 24);
      p.sky.forEach((color, i) => grad.addColorStop(i * .5, color));
      sky.fillStyle = grad;
      sky.fillRect(0, 0, w, h);
      const sunX = w * .73;
      const sunY = horizon * (theme === 'port' ? .45 : .76);
      const sunRadius = clamp(w * .021, 14, 36);
      const glow = sky.createRadialGradient(sunX, sunY, sunRadius * .4, sunX, sunY, sunRadius * 5);
      glow.addColorStop(0, theme === 'port' ? '#b3cfff44' : '#ffa56988');
      glow.addColorStop(1, '#ffa56900');
      sky.fillStyle = glow;
      sky.fillRect(0, 0, w, h);
      sky.fillStyle = p.sun;
      sky.beginPath();
      sky.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
      sky.fill();
      for (let i = 0; i < 22; i++) {
        const x = hash(i + 70) * w;
        const y = hash(i - 15) * horizon * .89;
        const length = w * (.03 + hash(i + 200) * .25);
        const tint = sky.createLinearGradient(x - length, y, x + length, y);
        tint.addColorStop(0, '#1c213000');
        tint.addColorStop(.49, i % 3 ? '#1c213028' : '#ffcc951e');
        tint.addColorStop(1, '#1c213000');
        sky.fillStyle = tint;
        sky.fillRect(x - length, y, length * 2, 1 + hash(i - 19) * h * .013);
      }
      p.hills.forEach((color, layer) => {
        const skyline = [[0, h]];
        const count = theme === 'port' ? 50 : 43;
        for (let i = 0; i <= count; i++) {
          const x = i / count * w;
          const valley = Math.pow(Math.abs(1 - 2 * x / w), .85);
          const peak = (Math.sin(i * .26 + layer * 2) * .27 + hash(Math.floor(i / 2) + layer * 60) * .55 + .35);
          const height = h * (.035 + .13 * valley) * peak * (1 + layer * .12);
          const y = horizon + h * (.01 + layer * .022) - height;
          if (theme === 'port') {
            const roof = horizon + h * .03 - height * (hash(i + 480) > .26 ? .9 : .25);
            skyline.push([x, roof], [x + w / count + .5, roof]);
          } else skyline.push([x, y]);
        }
        skyline.push([w, h]);
        polygon(skyline, color, sky);
      });
      if (theme === 'port') {
        sky.fillStyle = '#e5bc83a6';
        for (let i = 0; i < 140; i++) {
          const x = hash(i + 610) * w;
          const y = horizon + hash(i + 820) * h * .046;
          sky.fillRect(x, y, 1.5, 1.25);
        }
      }
      const image = photo(location);
      if (image.naturalWidth) {
        const span = Math.max(750, w);
        sky.drawImage(image, (w - span) / 2, 0, span, horizon + 4);
      }
    }
    ctx.drawImage(background, 0, 0, w, h);
  }

  function strip(a, b, x1, x2, color, height = 0) {
    polygon([
      project(a, x1, height), project(a, x2, height),
      project(b, x2, height), project(b, x1, height),
    ], color);
  }

  function roadsideBarrier(near, far, p, theme) {
    const half = ROAD_WIDTH / 2;
    const height = theme === 'ridge' ? .33 : .57;
    for (const side of [-1, 1]) {
      const edge = side * (half + .34);
      const rim = edge + side * .19;
      polygon([project(near, edge), project(near, edge, height),
        project(far, edge, height), project(far, edge)], shade(p.rail, side > 0 ? .73 : .87));
      polygon([project(near, edge, height), project(near, rim, height),
        project(far, rim, height), project(far, edge, height)], shade(p.rail, 1.24));
    }
  }

  function scenery(theme, z, x, index, sign) {
    if (theme === 'port') {
      const offset = sign * (3 + hash(index + sign) * 6);
      const width = 2.85;
      const height = hash(index - sign) > .67 ? 4.5 : 2.7;
      const near = z - 5.5;
      const far = z + 5.5;
      const inner = x + offset;
      const outer = inner + sign * width;
      const paint = ['#63555d', '#4d626b', '#76675d'][Math.abs(index + sign) % 3];
      polygon([project(near, inner), project(near, outer), project(near, outer, height),
        project(near, inner, height)], shade(paint, .72));
      polygon([project(near, inner, height), project(near, outer, height),
        project(far, outer, height), project(far, inner, height)], shade(paint, 1.15));
      polygon([project(near, inner), project(far, inner), project(far, inner, height),
        project(near, inner, height)], paint);
      for (let rib = near + .4; rib < far; rib += .7) {
        polygon([project(rib, inner, .18), project(rib + .065, inner, .18),
          project(rib + .065, inner, height - .18), project(rib, inner, height - .18)], shade(paint, .78));
      }
      return;
    }
    if (theme === 'coast' && sign > 0) return;
    const tall = 1.9 + hash(index - sign) * (theme === 'ridge' ? 7 : 4.8);
    const peak = project(z, x, tall);
    const foot = project(z, x);
    const radius = peak[2] * tall * .46;
    const center = [peak[0] + radius * .2, foot[1]];
    const left = [foot[0] - radius, foot[1]];
    const right = [foot[0] + radius, foot[1]];
    if (theme === 'ridge') {
      const shoulder = [peak[0] - radius * .7, peak[1] + radius * .72];
      const ledge = [peak[0] + radius * .46, peak[1] + radius * .1];
      polygon([left, shoulder, peak, ledge, right], '#594148');
      polygon([peak, ledge, right, center], '#aa6d58');
      polygon([shoulder, [peak[0] - radius * .12, peak[1] + radius * .67], center, left], '#77524d');
    } else {
      polygon([left, [peak[0] - radius * .59, peak[1] + radius * .68], peak, right], '#303b3d');
      polygon([peak, right, center], '#45564e');
      polygon([[peak[0], peak[1] + radius * .85], right, [right[0] + radius * .45, right[1]]], '#3a4843');
    }
  }

  function roadside(theme, z, p, cameraZ) {
    const index = Math.round(z / segment);
    const half = ROAD_WIDTH / 2;
    for (const sign of [-1, 1]) {
      if (index % 3 === 0) {
        const x = sign * (half + .38);
        const bottom = project(z, x, 0);
        const top = project(z, x, .81);
        const postWidth = Math.max(1, top[2] * .13);
        ctx.fillStyle = p.rail;
        ctx.fillRect(top[0] - postWidth / 2, top[1], postWidth, bottom[1] - top[1]);
        ctx.fillStyle = theme === 'port' ? '#8eeaff' : '#ffd099';
        ctx.fillRect(top[0] - postWidth / 2, top[1], postWidth, Math.max(1, top[2] * .10));
      }
      const x = sign * (half + 1.9 + hash(index + sign) * 3.6);
      const sceneryInterval = theme === 'port' ? 6 : 4;
      if (index % sceneryInterval === 0 && z > cameraZ + 6) scenery(theme, z, x, index, sign);
      if (index % 9 !== 0 || theme !== 'port' && (sign < 0 || theme !== 'coast')) continue;
      const base = project(z, x);
      const top = project(z, x, 5.1);
      const arm = project(z, x - sign * 1.25, 5.1);
      const weight = Math.max(1, top[2] * .09);
      ctx.strokeStyle = theme === 'port' ? '#3b475a' : '#514d54';
      ctx.lineWidth = weight;
      ctx.beginPath();
      ctx.moveTo(base[0], base[1]);
      ctx.lineTo(top[0], top[1]);
      ctx.lineTo(arm[0], arm[1]);
      ctx.stroke();
      ctx.fillStyle = theme === 'port' ? '#b2efff' : '#ffdbac';
      ctx.fillRect(arm[0] - weight * 1.3, arm[1], weight * 3, weight * .9);
    }
  }

  function car(vehicle, state, recoil = 0, braking = false) {
    const { x, z, shape, color, oncoming } = vehicle;
    const van = shape === 'van';
    const roadCar = shape === 'sedan' || shape === 'wagon' || van;
    const half = van ? 1.02 : roadCar ? .86 : shape === 'hyper' ? 1.03 : .96;
    const length = van ? 2.52 : shape === 'sport' ? 2 : 2.2;
    const roof = van ? 1.92 : shape === 'wagon' ? 1.55 : roadCar ? 1.42 : shape === 'hyper' ? 1.02 : 1.19;
    const boot = van ? 1.6 : roadCar ? .83 : .69;
    const laneHeading = Math.atan(roadSlope(state.course, z));
    const trafficYaw = clamp((vehicle.sideSpeed || 0) / Math.max(9, Math.abs(vehicle.speed)), -.31, .31);
    const heading = laneHeading + (oncoming ? Math.PI : 0) +
      (vehicle.player ? state.yaw + recoil * .12 : (trafficYaw + recoil * .11) * (oncoming ? -1 : 1));
    const sin = Math.sin(heading);
    const cos = Math.cos(heading);
    const cx = roadX(state.course, z) + x;
    const pitch = vehicle.player ? state.pitch - recoil * .12 : 0;
    const roll = vehicle.player ? state.roll : 0;
    const damage = vehicle.player ? state.damage : null;
    const at = (dx, dy, dz, sprung = true) => {
      if (damage && sprung) {
        const end = (dz < 0 ? damage.rear : damage.front) * Math.max(0, Math.abs(dz / length) - .53) * 2;
        const fold = (dx < 0 ? damage.left : damage.right) * Math.max(0, Math.abs(dx / half) - .52);
        dz -= Math.sign(dz) * end * .51;
        dx *= 1 - fold * .46;
        dy += end * .15 - fold * .23;
      }
      const worldZ = z + cos * dz - sin * dx;
      const worldX = cx + cos * dx + sin * dz;
      const y = sprung ? dy + dx * roll + dz * pitch : dy;
      return project(worldZ, worldX - roadX(state.course, worldZ), y);
    };
    const origin = at(0, 0, 0);
    ctx.fillStyle = '#15171bcc';
    ctx.beginPath();
    ctx.ellipse(origin[0], origin[1], origin[2] * 1.12, origin[2] * .42, 0, 0, Math.PI * 2);
    ctx.fill();

    const faces = [];
    const face = (vertices, fill) => {
      const points = vertices.map(point => at(...point));
      if (points.some(point => !Number.isFinite(point[2]))) return;
      let area = 0;
      points.forEach(([px, py], i) => {
        const [nx, ny] = points[(i + 1) % points.length];
        area += px * ny - nx * py;
      });
      if (area > .1) faces.push({ points, fill, z: points.reduce((sum, point) => sum + 1 / point[2], 0) / points.length });
    };
    function rings(width, sections, colors) {
      const vertices = sections.map(([z0, bottom, top, upper = width, lower = width]) => [
        [-lower, bottom, z0], [-upper, top, z0], [upper, top, z0], [lower, bottom, z0],
      ]);
      face(vertices[0], colors[0]);
      for (let j = 1; j < vertices.length; j++) {
        const from = vertices[j - 1];
        const to = vertices[j];
        for (let i = 0; i < 4; i++) {
          const next = (i + 1) % 4;
          face([from[next], from[i], to[i], to[next]], colors[j][i]);
        }
      }
      face([...vertices.at(-1)].reverse(), colors.at(-1)[3]);
    }
    for (const sign of [-1, 1]) {
      for (const end of [-1, 1]) {
        const halfTrack = half - .035;
        if (vehicle.player) {
          const wheelbase = state.car.wheelbase;
          const angle = end > 0 ? frontWheelAngle(state.wheelAngle, sign, wheelbase, halfTrack) : 0;
          const wheelSide = (radius, face) => Array.from({ length: 14 }, (_, i) => {
            const phase = i * Math.PI / 7;
            const turn = Math.sin(phase) * radius;
            return at(sign * halfTrack + face * Math.cos(angle) + turn * Math.sin(angle),
              TIRE_RADIUS + Math.cos(phase) * radius,
              end * wheelbase / 2 + turn * Math.cos(angle) - face * Math.sin(angle), false);
          });
          polygon(wheelSide(TIRE_RADIUS, sign * .156), '#16191e');
          polygon(wheelSide(.242, sign * .163), '#6b737c');
          polygon(wheelSide(.182, sign * .173), '#252832');
          continue;
        }
        const p = at(sign * halfTrack, .31, end * (length - .53), false);
        if (!Number.isFinite(p[2])) continue;
        ctx.fillStyle = '#17171e';
        ctx.beginPath();
        ctx.ellipse(p[0], p[1], p[2] * .17, p[2] * .31, sign * .13, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const shell = [shade(color, .57), shade(color, 1.04), shade(color, .76), '#252832'];
    rings(half, [[-length, .24, boot, half * .94, half * .91],
      [-length + .38, .18, boot + .09], [length - .34, .18, van ? 1.52 : .66],
      [length, .25, van ? 1.46 : .54, half * .88, half * .89]], [shade(color, .80), shell, shell, shell]);
    const glass = [shade(color, .62), shade(color, .98), shade(color, .76), '#53697b'];
    const darkGlass = [shade(color, .62), '#2d3949', shade(color, .76), '#53697b'];
    rings(half * .74, [[van ? -length + .14 : -1.47, boot, boot + .035, half * .70],
      [van ? -length + .20 : -.65, boot, roof, half * .56],
      [van ? length - .60 : .80, .63, roof - .03, half * .55],
      [length - .30, .57, .70, half * .72]], ['#263143', darkGlass, glass, darkGlass]);
    faces.sort((a, b) => b.z - a.z);
    faces.forEach(({ points, fill }) => polygon(points, fill));
    if (damage) {
      for (const side of [-1, 1]) {
        const worn = Math.max(damage.rear * .87, side < 0 ? damage.left : damage.right);
        ctx.lineWidth = Math.min(2, origin[2] * .014);
        ctx.strokeStyle = `rgba(73,62,53,${worn * .83})`;
        for (let i = 0; i < Math.ceil(worn * 10); i++) {
          const start = -length + hash(i + side * 17) * .58;
          const height = .31 + hash(i + 28) * .34;
          const a = at(side * half * .87, height, start);
          const b = at(side * half * .91, height + .033, start + .35);
          ctx.beginPath();
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
          ctx.stroke();
        }
      }
      if (state.health <= 1) {
        const impact = at(-.15, (boot + roof) * .54, -1.0);
        ctx.strokeStyle = state.health ? '#b9dde4a0' : '#d1e6e9e0';
        ctx.lineWidth = Math.max(1, origin[2] * .011);
        for (let i = 0; i < 12; i++) {
          const angle = i * Math.PI / 6;
          const ray = at(-.15 + Math.cos(angle) * (.16 + hash(i + 13) * .29),
            (boot + roof) * .54 + Math.sin(angle) * .14, -1.0 + Math.sin(angle) * .30);
          ctx.beginPath();
          ctx.moveTo(impact[0], impact[1]);
          ctx.lineTo(ray[0], ray[1]);
          ctx.stroke();
        }
      }
    }
    if (!roadCar && !oncoming) {
      for (const t of [.22, .48, .74]) {
        const glazed = (side, progress) => at(side * half * (.67 - progress * .14),
          boot + .052 + (roof - boot - .035) * progress, -1.47 + .82 * progress);
        polygon([glazed(-1, t), glazed(-1, t + .034), glazed(1, t + .034), glazed(1, t)], '#526174');
      }
      polygon([at(-half * .84, boot + .014, -length + .12), at(-half * .90, boot + .042, -length + .29),
        at(half * .90, boot + .042, -length + .29), at(half * .84, boot + .014, -length + .12)], shade(color, 1.17));
    }

    const end = oncoming ? length + .015 : -length - .015;
    const faceY = oncoming ? (van ? .88 : .43) : boot - .21;
    const lamp = oncoming ? '#fff3b9' : braking ? '#ffb088' : '#ff443b';
    const paintEnd = (left, right, lo, hi, tint, z0 = end) =>
      polygon([at(left, lo, z0), at(left, hi, z0), at(right, hi, z0), at(right, lo, z0)], tint);
    paintEnd(-half * .9, half * .9, faceY - .06, faceY + .14, '#22232c');
    if (vehicle.player && shape === 'sport') {
      paintEnd(-half * .86, half * .86, faceY + .068, faceY + .103, lamp);
    }
    for (const sign of [-1, 1]) {
      const inside = sign * half * .32;
      const outside = sign * half * .86;
      if (vehicle.player && shape === 'gt') {
        for (const offset of [.42, .60, .78]) {
          const center = sign * half * offset;
          paintEnd(center - .026, center + .026, faceY + .009, faceY + .118, lamp);
        }
      } else if (vehicle.player && shape === 'hyper') {
        polygon([at(inside, faceY + .034, end), at(inside, faceY + .076, end),
          at(outside, faceY + .134, end), at(outside, faceY + .093, end)], lamp);
      } else if (!vehicle.player || shape !== 'sport') {
        const l = Math.min(inside, outside);
        const r = Math.max(inside, outside);
        paintEnd(l, r, faceY, faceY + .045, lamp);
        paintEnd(l, r, faceY + .078, faceY + .12, lamp);
      }
      if (!oncoming && vehicle.turnSignal === sign && Math.floor(state.elapsed * 5) % 2 === 0) {
        const edge = sign * half * .83;
        paintEnd(edge - .095, edge + .095, faceY + .14, faceY + .178, '#ffc345');
      }
    }
    if (!oncoming) {
      paintEnd(-.17, .17, faceY + .005, faceY + .105, '#acb1b7');
      paintEnd(-half * .70, half * .70, .27, .34, '#26282e');
    }
    if (vehicle.player && (shape === 'gt' || shape === 'hyper')) {
      const wing = boot + (shape === 'gt' ? .38 : .17);
      const edge = half * .87;
      const rear = end + .20;
      for (const sign of [-1, 1]) {
        const center = sign * half * .54;
        paintEnd(center - .025, center + .025, boot - .04, wing, '#1c1e29', rear);
      }
      polygon([at(-edge, wing, rear), at(-edge, wing + .045, rear + .19),
        at(edge, wing + .045, rear + .19), at(edge, wing, rear)], '#242733');
      paintEnd(-edge, edge, wing - .025, wing, shape === 'gt' ? '#e7dabc' : '#a789dc', rear);
    }
    if (vehicle.rival) {
      const marker = at(0, roof + .62, 0);
      polygon([[marker[0] - 5, marker[1] - 8], [marker[0] + 5, marker[1] - 8], marker], '#ffc263');
    }
  }

  function mark(z, type) {
    const half = ROAD_WIDTH / 2;
    if (type === 'finish') {
      for (let i = 0; i < 12; i++) {
        const x = -half + ROAD_WIDTH * i / 12;
        strip(z, z + 1.1, x, x + ROAD_WIDTH / 12, i % 2 ? '#f5f7ef' : '#25252b');
        strip(z + 1.1, z + 2.2, x, x + ROAD_WIDTH / 12, i % 2 ? '#25252b' : '#f5f7ef');
      }
    } else strip(z, z + .6, -half, half, '#bcefea');
    for (const sign of [-1, 1]) {
      const x = sign * (half + .65);
      polygon([project(z, x), project(z, x, 3.4), project(z, x + .16, 3.4), project(z, x + .16)], '#a3aab0');
    }
    polygon([project(z, -half - .65, 2.92), project(z, -half - .65, 3.42),
      project(z, half + .8, 3.42), project(z, half + .8, 2.92)], type === 'finish' ? '#d8ed77' : '#6adcd6');
    const label = project(z, 0, 3.04);
    ctx.fillStyle = '#1d242b';
    ctx.font = `800 ${clamp(label[2] * .38, 2, 60)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.fillText(type === 'finish' ? 'FINISH' : 'CHECKPOINT', label[0], label[1]);
  }

  function crash(impact, age, paint) {
    const { x, z, side, force, carry } = impact;
    const center = project(z, x, .45);
    if (Number.isFinite(center[2]) && age < .31) {
      const radius = center[2] * (1.2 + force * 2.7);
      const flash = (1 - age / .31) ** 2;
      const light = ctx.createRadialGradient(center[0], center[1], 0, center[0], center[1], radius);
      light.addColorStop(0, `rgba(255,249,202,${flash * .98})`);
      light.addColorStop(.25, `rgba(255,115,49,${flash * .68})`);
      light.addColorStop(1, 'rgba(255,104,29,0)');
      ctx.fillStyle = light;
      ctx.fillRect(center[0] - radius, center[1] - radius, radius * 2, radius * 2);
    }
    const count = Math.ceil(53 * force);
    for (let i = 0; i < count; i++) {
      const vx = (hash(i) - .5) * 26 - side * 6.5;
      const vz = (hash(i - 41) - .5) * 15 + carry;
      const vy = 1.3 + hash(i + 29) * 7.1;
      const tail = Math.max(0, age - .043);
      const point = t => project(z + t * vz, x + t * vx, Math.max(.045, .42 + vy * t - t ** 2 * 10));
      const a = point(tail);
      const b = point(age);
      if (!Number.isFinite(a[2]) || !Number.isFinite(b[2])) continue;
      const alpha = Math.max(0, 1 - age / (.28 + hash(i + 53) * .55));
      ctx.strokeStyle = i % 4 ? `rgba(255,149,64,${alpha})` : `rgba(255,227,169,${alpha})`;
      ctx.lineWidth = clamp(b[2] * .028, 1, 3.3);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }
    const flight = age - .08;
    const panels = impact.fatal ? 7 : impact.detached ? 4 : 0;
    for (let i = 0; i < panels && flight > 0; i++) {
      const lateral = (hash(i + 81) - .5) * 19 - side * 6;
      const vertical = 4 + hash(i + 67) * 5;
      const along = carry + (hash(i + 99) - .5) * 13;
      const p = project(z + along * flight, x + lateral * flight, Math.max(.08, .55 + vertical * flight - 7.9 * flight ** 2));
      if (!Number.isFinite(p[2])) continue;
      ctx.save();
      ctx.translate(p[0], p[1]);
      ctx.rotate((i + flight * (3 + i)) % 6.28);
      ctx.globalAlpha = clamp((impactDuration - age) * 4, 0, 1);
      const span = p[2] * (i === 0 ? .74 : .25);
      polygon([[-span, 0], [-span * .62, -span * .34], [span, -span * .24], [span * .74, span * .36]],
        shade(paint, .86 - (i % 3) * .17));
      ctx.restore();
    }
  }

  return function render(state, view, braking, age = Infinity) {
    const { course, distance, x, speed } = state;
    const current = trackLook(course, distance, !state.mode.goal).current.theme;
    const theme = { forest: 'coast', metro: 'port', alpine: 'coast', desert: 'ridge', meadow: 'coast' }[current] || current;
    const p = palettes[theme];
    const pose = poses[view];
    const cameraZ = distance - pose.back;
    const cameraX = roadX(course, distance) + x;
    const motion = reducedMotion.matches ? 0 : impactMotion(state.impact, age);
    const cameraY = roadY(course, distance) + pose.height + motion * .25;
    project = (z, lateral = 0, y = 0) => {
      const k = z > cameraZ + .35 ? scale / (z - cameraZ) : Infinity;
      return [w * .5 + (roadX(course, z) + lateral - cameraX) * k, horizon + (cameraY - roadY(course, z) - y) * k, k];
    };
    backdrop(theme, p, current);
    const half = ROAD_WIDTH / 2;
    const start = Math.floor(cameraZ / segment) * segment + depth;
    const closest = cameraZ + .51;
    ctx.fillStyle = atmospheres[current].ground;
    const farY = project(start)[1];
    ctx.fillRect(0, farY, w, h - farY);
    const markers = [];
    if (state.mode.goal) markers.push({ z: state.mode.goal, type: 'finish' });
    if (state.nextGate < (state.mode.goal ?? Infinity)) markers.push({ z: state.nextGate, type: 'gate' });

    for (let far = start; far > closest; far -= segment) {
      const near = Math.max(closest, far - segment);
      const index = Math.round(far / segment);
      const tone = Math.abs(Math.floor(index / 2)) % 2;
      if (current === 'coast') {
        const edgeFar = project(far, half + .55);
        const edgeNear = project(near, half + .55);
        polygon([edgeFar, [w, edgeFar[1]], [w, edgeNear[1] + .6], edgeNear], tone ? '#52646b' : '#4f6269');
        if (near - cameraZ > 2) {
          const ripple = half + 3.8 + hash(index + 67) * 12;
          strip(near, near + .12, ripple, ripple + 4 + hash(index + 91) * 6, '#c6aaa230');
        }
      }
      strip(near, far, -half - .45, half + .45, p.rail);
      strip(near, far, -half, half, p.road[tone]);
      if (near - cameraZ > 2 && near - cameraZ < 120) {
        for (let grain = 0; grain < 6; grain++) {
          const seed = index * 6 + grain;
          const x = (hash(seed) * 2 - 1) * (half - .4);
          const z = near + hash(seed + 63) * (far - near);
          const a = project(z, x);
          const b = project(z + .12 + hash(seed - 99) * .45, x);
          ctx.fillStyle = grain % 3 === 0 ? '#c4c1c016' : '#12121522';
          ctx.fillRect(a[0], b[1], Math.max(.6, a[2] * .035), Math.max(.6, a[1] - b[1]));
        }
      }
      strip(near, far, -half + .14, -half + .21, '#cec6b4');
      strip(near, far, half - .21, half - .14, '#cec6b4');
      if (index % 3 !== 0) {
        for (const lane of [-3.6, 0, 3.6]) {
          if (lane || !state.mode.twoWay) strip(near, far, lane - .027, lane + .027, '#c1bdb4');
        }
      }
      if (state.mode.twoWay) {
        strip(near, far, -.14, -.07, '#e3b458');
        strip(near, far, .07, .14, '#e3b458');
      }
    }
    const objects = state.traffic.filter(v => v.z > cameraZ + 3 && v.z < start);
    if (state.rival && state.rival.z > cameraZ + 3 && state.rival.z < start) objects.push(state.rival);
    if (view !== 2) objects.push({ ...state.car, x, z: distance, player: true });
    objects.sort((a, b) => b.z - a.z);
    let vehicle = 0;
    for (let z = start; z > closest; z -= segment) {
      roadsideBarrier(Math.max(closest, z - segment), z, p, theme);
      if (z <= cameraZ + 1.45) continue;
      roadside(theme, z, p, cameraZ);
      for (const marker of markers) {
        if (marker.z <= z && marker.z > Math.max(z - segment, cameraZ + 2.7)) mark(marker.z, marker.type);
      }
      while (vehicle < objects.length && objects[vehicle].z > z - segment) {
        const item = objects[vehicle++];
        const hit = item.trafficHit;
        const recoil = item.player ? motion : hit ? impactMotion(hit, state.elapsed - hit.at) : 0;
        car(item, state, recoil, item.player ? braking : item.braking);
      }
    }
    if (view === 2) {
      const tint = ctx.createLinearGradient(0, h * .93, 0, h);
      tint.addColorStop(0, shade(state.car.color, .77));
      tint.addColorStop(1, shade(state.car.color, .39));
      polygon([[w * .11, h], [w * .26, h * .94], [w * .41, h * .928],
        [w * .59, h * .928], [w * .74, h * .94], [w * .89, h]], tint);
    }
    if (speed * 3.6 > 176) {
      const strength = clamp((speed * 3.6 - 176) / 110, 0, .7);
      ctx.strokeStyle = `rgba(255,239,208,${strength * .27})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 12; i++) {
        const side = i % 2 ? 1 : -1;
        const cycle = (hash(i) + distance * .013) % 1;
        const dx = .24 + cycle * .32;
        const y = hash(i + 57) * .58 + .37;
        const px = w * (.5 + side * dx);
        const py = h * y;
        ctx.moveTo(px, py);
        ctx.lineTo(px + side * w * (.012 + cycle * .07), py + (py - horizon) * .10);
      }
      ctx.stroke();
    }
    if (state.impact && age < impactDuration) crash(state.impact, age, state.car.color);
    const trafficHit = state.trafficImpact;
    if (trafficHit && state.elapsed - trafficHit.at < impactDuration) {
      crash(trafficHit, state.elapsed - trafficHit.at, trafficHit.color);
    }
  };
}
