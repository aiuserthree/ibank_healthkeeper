import { ROAD_WIDTH, roadX, roadY, sectionIndex, trackLook } from './drive.js?v=41';

export const assetRoot = '/assets/games/twilightrun/';
export const atmospheres = {
  coast:  { fog: '#85756f', ground: '#6c624b', asphalt: '#49434a', concrete: '#938276', light: '#ffba73', sky: '#c8dcff', water: true },
  port:   { fog: '#565278', ground: '#414653', asphalt: '#404450', concrete: '#747a88', light: '#ffc584', sky: '#9cb7ff', water: true, wet: true, night: true },
  ridge:  { fog: '#b57f75', ground: '#9c634f', asphalt: '#635358', concrete: '#b98a73', light: '#ffc29c', sky: '#d8a7ae' },
  forest: { fog: '#618279', ground: '#4d6251', asphalt: '#4c5654', concrete: '#85958d', light: '#f5e5b4', sky: '#c8e6d7', wet: true },
  metro:  { fog: '#4a5676', ground: '#3d475e', asphalt: '#434758', concrete: '#667087', light: '#d5abff', sky: '#80adff', wet: true, night: true },
  alpine: { fog: '#adbfda', ground: '#d8e6f5', asphalt: '#586777', concrete: '#8d9eb2', light: '#fff2df', sky: '#c5ddff' },
  desert: { fog: '#b59b91', ground: '#ae8d74', asphalt: '#65565c', concrete: '#a98e80', light: '#ffd4a5', sky: '#d7c3e1' },
  meadow: { fog: '#a4bbb8', ground: '#74834f', asphalt: '#505759', concrete: '#9a9c85', light: '#fff0cc', sky: '#c9edff' },
};
// 실사 배경(힉스필드, 운영자 승인) — 길가 그림(잘라낸 실사)과 땅 질감. aspect = 가로 / 세로(잘라낸 뒤)
const scenery = {
  pine: { aspect: .59, cross: true }, broadleaf: { aspect: .68, cross: true }, cedar: { aspect: .29, cross: true },
  snowpine: { aspect: .66, cross: true }, shrub: { aspect: 1, cross: true },
  rock: { aspect: 1.48, cross: true }, redrock: { aspect: 1.5, cross: true },
  house: { aspect: 1.52 }, barn: { aspect: 1.53 }, seaside: { aspect: 2.02 },
};
const groundOf = { coast: 'dirt', port: 'dirt', ridge: 'sand', forest: 'grass', metro: 'dirt', alpine: 'snow', desert: 'sand', meadow: 'grass' };
const half = ROAD_WIDTH / 2;
const chunkSize = 72;
const rowSize = 4;
const ahead = 504;
const tau = Math.PI * 2;
export const random = (seed) => {
  const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return n - Math.floor(n);
};

function texture(T, width, height, paint, repeat = false) {
  const surface = document.createElement('canvas');
  surface.width = width;
  surface.height = height;
  paint(surface.getContext('2d'), width, height);
  const map = new T.CanvasTexture(surface);
  map.colorSpace = T.SRGBColorSpace;
  if (repeat) {
    map.wrapS = map.wrapT = T.RepeatWrapping;
    map.anisotropy = 4;
  }
  return map;
}

export function glowMap(T) {
  return texture(T, 64, 64, (ctx) => {
    const radial = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    radial.addColorStop(0, 'rgba(255,255,255,1)');
    radial.addColorStop(.24, 'rgba(255,255,255,.57)');
    radial.addColorStop(.63, 'rgba(255,255,255,.11)');
    radial.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, 64, 64);
  });
}

function grainMap(T, kind) {
  return texture(T, 192, 192, (ctx, width, height) => {
    const image = ctx.createImageData(width, height);
    for (let i = 0; i < width * height; i++) {
      const x = i % width;
      const y = Math.floor(i / width);
      const n = random(i + 29);
      const cloud = Math.sin(x * tau / width + y * tau / height) * Math.cos(3 * y * tau / height);
      const ripple = Math.cos(y * tau * 20 / height + 3 * Math.sin(x * tau / width)) * .5;
      const value = kind === 'water' ? 205 + n * 12 + ripple * 21 + cloud * 13
        : kind === 'ground' ? 207 + n * 34 + cloud * 11 : 206 + n * 45 + cloud * 5;
      image.data.fill(value, i * 4, i * 4 + 3);
      image.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    if (kind !== 'asphalt') return;
    for (let i = 0; i < 900; i++) {
      const x = random(i + 75) * width;
      const y = random(i + 3) * height;
      ctx.fillStyle = i % 3 ? '#36363640' : '#ffffff92';
      ctx.fillRect(x, y, 1 + random(i) * 2, 1 + random(-i) * 2);
    }
  }, true);
}

function windowMap(T) {
  return texture(T, 128, 192, (ctx, w, h) => {
    ctx.fillStyle = '#171d2a';
    ctx.fillRect(0, 0, w, h);
    for (let y = 4; y < h; y += 9) {
      for (let x = 4; x < w; x += 10) {
        const r = random(x + y * 97);
        ctx.fillStyle = r < .20 ? '#bc9a6c' : r < .32 ? '#4d9dba' : '#2c3b52';
        ctx.fillRect(x, y, 5, 4);
      }
    }
  });
}

function bannerMap(T, title, sky) {
  return texture(T, 384, 80, (ctx, width, height) => {
    ctx.fillStyle = '#132328';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = sky;
    ctx.fillRect(0, height - 5, width, 5);
    ctx.fillRect(0, 0, width, 5);
    ctx.fillStyle = '#e9f9f3';
    ctx.font = '800 34px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(title, width / 2, 52);
  });
}

function waterMaterial(T, map, color, highlight, clock) {
  return new T.ShaderMaterial({
    fog: true,
    side: T.DoubleSide,
    uniforms: {
      ...T.UniformsLib.fog,
      grain: { value: map },
      sea: { value: new T.Color(color) },
      sparkle: { value: new T.Color(highlight) },
      clock,
    },
    vertexShader: `
      varying vec3 surface;
      varying vec2 grainUV;
      #include <fog_pars_vertex>
      void main() {
        surface = (modelMatrix * vec4(position, 1.0)).xyz;
        grainUV = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      uniform sampler2D grain;
      uniform vec3 sea, sparkle;
      uniform float clock;
      varying vec3 surface;
      varying vec2 grainUV;
      #include <fog_pars_fragment>
      void main() {
        vec3 sight = normalize(cameraPosition - surface);
        float fresnel = pow(1.0 - abs(sight.y), 4.0);
        float ripples = texture2D(grain, vec2(grainUV.x * .39, grainUV.y - clock * .18)).r;
        float chop = sin(grainUV.y * 21.0 + sin(grainUV.x * 14.5) * 1.4 + clock * 2.1);
        float reflectSun = pow(max(0.0, dot(normalize(sight.xz), normalize(vec2(-.06, 1.0)))), 34.0);
        float glint = smoothstep(.57, .94, ripples * .69 + (chop * .5 + .5) * .31);
        vec3 color = sea * (.62 + ripples * .53) + vec3(.035, .045, .05) * fresnel;
        color += sparkle * glint * reflectSun * (.11 + .27 * fresnel);
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
}

export function createWorld(T, scene) {
  const root = new T.Group();
  scene.add(root);
  const material = (color, extra = {}) => new T.MeshStandardMaterial({ color, roughness: .8, side: T.DoubleSide, ...extra });
  const asphalt = grainMap(T, 'asphalt');
  const gravel = grainMap(T, 'ground');
  const water = grainMap(T, 'water');
  const clock = { value: 0 };
  const windows = windowMap(T);
  const loader = new T.TextureLoader();
  const photo = (file, repeat) => {
    const map = loader.load(`${assetRoot}scenery/${file}.webp?v=1`);
    map.colorSpace = T.SRGBColorSpace;
    map.anisotropy = 4;
    if (repeat) {
      map.wrapS = map.wrapT = T.MirroredRepeatWrapping;
      map.repeat.set(.42, .42);
    }
    return map;
  };
  const groundMaps = Object.fromEntries(['grass', 'sand', 'snow', 'dirt'].map(kind => [kind, photo(`ground-${kind}`, true)]));
  // 길가 그림 — 잘라낸 실사 그림, 투명한 곳은 버린다(alphaTest), 뒤에서 비쳐도 너무 어둡지 않게 자기 빛 조금
  const cutouts = Object.fromEntries(Object.keys(scenery).map(name => {
    const map = photo(name);
    return [name, new T.MeshStandardMaterial({
      map, alphaTest: .45, side: T.DoubleSide, roughness: .9, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: .22,
      // 밤에는 스스로 빛나지 않게 — scene.js 가 daylight(0~1)로 낮춘다
    })];
  }));
  const cutoutPlane = new T.PlaneGeometry(1, 1).translate(0, .5, 0);
  const cutoutCross = (() => {
    const a = new T.PlaneGeometry(1, 1).translate(0, .5, 0);
    const b = a.clone().rotateY(Math.PI / 2);
    const geometry = new T.BufferGeometry();
    for (const name of ['position', 'normal', 'uv']) {
      geometry.setAttribute(name, new T.Float32BufferAttribute([...a.getAttribute(name).array, ...b.getAttribute(name).array], a.getAttribute(name).itemSize));
    }
    geometry.setIndex([...a.index.array, ...[...b.index.array].map(i => i + 4)]);
    return geometry;
  })();
  const surfaces = Object.fromEntries(Object.entries(atmospheres).map(([key, t]) => {
    const color = key === 'coast' ? '#3f596b' : '#313856';
    // 땅: 실사 질감, 색은 그 풍경의 땅빛으로 살짝만 물들인다
    const landColor = new T.Color(t.ground).lerp(new T.Color('#ffffff'), .55);
    return [key, {
      road: material(t.asphalt, { map: asphalt, bumpMap: asphalt, bumpScale: .022, roughness: t.wet ? .32 : .83, metalness: t.wet ? .24 : 0 }),
      land: material(landColor, { map: groundMaps[groundOf[key]], vertexColors: true, roughness: .95 }),
      sea: waterMaterial(T, water, color, t.light, clock),
      shoulder: material(t.concrete, {map: gravel}),
      rail: material(t.concrete, { roughness: .48, metalness: .31, map: gravel }),
    }];
  }));
  const white = material('#ded9cb', { roughness: .62 });
  const yellow = material('#e4b765', { roughness: .62 });
  const dark = material('#292c33');
  const metal = material('#53606e', { metalness: .48, roughness: .47 });
  const cable = material('#b8a8a0', { metalness: .47 });
  const lamp = new T.MeshBasicMaterial({ color: '#ffdb9e' });
  const neon = new T.MeshBasicMaterial({ color: '#7be9ef' });
  const reflect = new T.MeshBasicMaterial({ color: '#e9d8c0' });
  const red = material('#a85647', { map: gravel });
  const blue = material('#526f83', { map: gravel });
  const pale = material('#a9ad9f', { map: gravel });
  const stone = material('#777d83', { map: gravel });
  const rock = material('#9a6350', { map: gravel });
  const dirt = material('#67594b', { map: gravel });
  const snow = material('#dbe3ee', { map: gravel });
  const grass = material('#60744b', { map: gravel });
  const blade = material('#e5e5df', { roughness: .62 });
  const tower = material('#6f7c96', { map: windows, emissive: '#b5d1ff', emissiveMap: windows, emissiveIntensity: .35 });
  const tunnel = material('#565b61', {map: gravel});
  const tunnelStripe = material('#56828a', { roughness: .37 });
  const tunnelCeiling = material('#323840', {map: gravel});
  const wetLight = new T.MeshBasicMaterial({ color: '#a4bdff', transparent: true, opacity: .072, depthWrite: false });
  const checkA = new T.MeshBasicMaterial({color: '#d9f872'});
  const checkB = new T.MeshBasicMaterial({color: '#232427'});
  const finishBoard = new T.MeshBasicMaterial({ map: bannerMap(T, 'FINISH', '#d9f872'), side: T.DoubleSide });
  const checkpointBoard = new T.MeshBasicMaterial({ map: bannerMap(T, 'CHECKPOINT', '#75e9e6'), side: T.DoubleSide });

  const cube = new T.BoxGeometry(1, 1, 1);
  const pillar = new T.CylinderGeometry(.72, 1, 1, 8);
  const boulder = new T.DodecahedronGeometry(.9, 1);
  const rockVertices = boulder.getAttribute('position');
  for (let i = 0; i < rockVertices.count; i++) {
    const x = rockVertices.getX(i);
    const y = rockVertices.getY(i);
    const z = rockVertices.getZ(i);
    const ledge = Math.sin(7.3 * y - 3 * x) * .08 + Math.cos(5.4 * z + 1.1 * y) * .075;
    rockVertices.setXYZ(i, x * (1 + ledge) + y * .12, y * (1 - ledge), z * (1 + ledge));
  }
  boulder.computeVertexNormals();
  const arch = new T.TorusGeometry(1, .19, 8, 22, Math.PI);
  const point = new T.Object3D();
  const endA = new T.Vector3();
  const endB = new T.Vector3();
  const axis = new T.Vector3(0, 1, 0);
  let course, mode, origin;
  const chunks = new Map();

  function tunnelAt(z) {
    const local = Math.max(0, z) % course.length;
    const section = course.sections[sectionIndex(course, z, !mode.goal)];
    if (section.landmark !== 'tunnel') return false;
    const into = local - section.start;
    return into > 100 && into < 448;
  }

  // Each ribbon reuses the centerline and elevation from the physics, including at chunk boundaries.
  function ribbon(batches, base, a, b, rows, fabric, strips, hill) {
    if (!batches.has(fabric)) batches.set(fabric, { vertices: [], index: [], uv: [], colors: [] });
    const { vertices, index, uv, colors } = batches.get(fabric);
    const first = vertices.length / 3;
    for (let i = 0; i <= rows; i++) {
      const z = a + (b - a) * i / rows;
      const cx = roadX(course, z);
      const cy = roadY(course, z);
      strips.forEach(([x, h]) => {
        const outside = hill ? hill(x, z) : 0;
        vertices.push(cx + x, cy + h + outside, base - z);
        uv.push(x / 5.5, z / 8.8);
        if (hill) {
          const tone = Math.min(1.14, .76 + .30 * Math.cos(z / 29 + x / 36) + .08 * Math.sin(z / 17 + x / 13));
          colors.push(tone, tone, tone);
        }
      });
    }
    const width = strips.length;
    for (let i = 0; i < rows; i++) for (let j = 0; j < width - 1; j++) {
      const v = first + i * width + j;
      index.push(v, v + 1, v + width, v + 1, v + width + 1, v + width);
    }
  }

  function createChunk(index) {
    const start = index * chunkSize;
    const end = start + chunkSize;
    const middle = (start + end) * .5;
    const { current, next, mix } = trackLook(course, middle, !mode.goal);
    const local = course.sections[sectionIndex(course, middle, !mode.goal)];
    const isTunnel = tunnelAt(middle);
    const look = atmospheres[current.theme];
    const ground = surfaces[current.theme];
    const target = surfaces[next.theme];
    const group = new T.Group();
    group.userData.materials = [];
    const pools = new Map();
    const ribbons = new Map();
    const rows = chunkSize / rowSize;

    function blended(material, nextMaterial) {
      if (!mix || material === nextMaterial) return material;
      const value = material.clone();
      value.color.lerp(nextMaterial.color, mix);
      value.roughness += (nextMaterial.roughness - value.roughness) * mix;
      group.userData.materials.push(value);
      return value;
    }
    const road = blended(ground.road, target.road);
    const land = blended(ground.land, target.land);
    const strips = (fabric, offsets, a = start, b = end) =>
      ribbon(ribbons, start, a, b, Math.ceil((b - a) / rowSize), fabric, offsets);
    const flat = (fabric, left, right, height, a, b) =>
      strips(fabric, [[left, height], [right, height]], a, b);

    ribbon(ribbons, start, start, end, rows, road, [[-half, 0], [half, 0]]);
    const terrain = (x, z) => {
      const off = Math.max(0, Math.abs(x) - half - 2.8);
      return Math.min(1, off / 75) * (Math.sin(z / 83 + x / 31) * 5 + Math.cos(z / 29 - x / 26) * 4) - off * .018;
    };
    for (const side of [-1, 1]) {
      const isSea = (look.water && side > 0) || local.landmark === 'bridge';
      if (isSea) {
        strips(ground.sea, [[side * (half + .65), -.86], [side * 225, -2.35]]);
      } else {
        ribbon(ribbons, start, start, end, rows, land,
          [0, 4, 10, 22, 47, 88, 148, 210].map(x => [side * (half + .65 + x), -.29]), terrain);
      }
      flat(ground.shoulder, side * (half - .07), side * (half + .88), -.014);
      flat(white, side * (half - .31), side * (half - .18), .013);
      const edge = side * (half + .62);
      const barrier = isTunnel ? .15 : local.landmark === 'bridge' ? .78 : .56;
      strips(ground.rail, [[edge, -.04], [edge, barrier - .16], [edge + side * .17, barrier],
        [edge + side * .38, barrier], [edge + side * .45, .0]]);
    }
    for (const lane of [-3.6, 0, 3.6]) {
      if (mode.twoWay && !lane) {
        for (const offset of [-.15, .15]) flat(yellow, offset - .055, offset + .055, .015);
        continue;
      }
      for (let z = start; z < end; z += 12) flat(white, lane - .062, lane + .062, .015, z + 1, z + 7);
    }
    if (look.wet || isTunnel) {
      for (let i = 0; i < 10; i++) {
        const z = start + 2 + i * 7;
        const x = (random(index * 13 + i) * 2 - 1) * 5.8;
        flat(wetLight, x, x + .35 + random(i - index) * .35, .026, z, z + 1.2 + random(i + index) * 3.0);
      }
    }

    function queue(geometry, fabric) {
      const key = geometry.id + '/' + fabric.id;
      if (!pools.has(key)) pools.set(key, { geometry, fabric, matrices: [] });
      point.updateMatrix();
      pools.get(key).matrices.push(point.matrix.clone());
    }
    function prop(geometry, fabric, x, y, z, sx, sy, sz, rotation = 0) {
      point.position.set(roadX(course, z) + x, roadY(course, z) + y, start - z);
      point.rotation.set(0, rotation, 0);
      point.scale.set(sx, sy, sz);
      queue(geometry, fabric);
    }
    function beam(fabric, x, y, z, dx, dy, dz, width) {
      endA.set(roadX(course, z) + x, roadY(course, z) + y, start - z);
      endB.set(roadX(course, dz) + dx, roadY(course, dz) + dy, start - dz);
      point.position.copy(endA).lerp(endB, .5);
      endB.sub(endA);
      point.scale.set(width, endB.length(), width);
      point.quaternion.setFromUnitVectors(axis, endB.normalize());
      queue(cube, fabric);
    }
    const box = (fabric, ...args) => prop(cube, fabric, ...args);
    // 실사 길가 그림 — 높이 h(m), 나무 · 바위는 십자 판(아무 각도로 돌림), 집은 길 쪽을 보는 한 장
    function cutout(name, x, z, h, seed, sink = 0) {
      const { aspect, cross } = scenery[name];
      const rotation = cross ? random(seed) * Math.PI : (x > 0 ? -1 : 1) * Math.PI / 2 + (random(seed) - .5) * .5;
      prop(cross ? cutoutCross : cutoutPlane, cutouts[name], x, -sink, z, h * aspect, h, h * aspect, rotation);
    }
    function streetlight(side, z) {
      const x = side * (half + 1.28);
      box(metal, x, 2.85, z, .13, 5.7, .13);
      box(metal, x - side * .62, 5.69, z, 1.34, .106, .12);
      box(current.theme === 'metro' ? neon : lamp, x - side * 1.23, 5.64, z, .52, .055, .25);
    }
    function tree(x, z, seed, snowy = false) {
      const tall = 7 + random(seed) * 9;
      const kind = snowy ? 'snowpine' : current.theme === 'meadow' || current.theme === 'coast' ? (random(seed + 3) < .6 ? 'broadleaf' : 'pine')
        : random(seed + 3) < .5 ? 'cedar' : 'pine';
      cutout(kind, x, z, tall, seed, .3);
    }
    function turbine(x, z, seed) {
      const y = 21 + random(seed) * 10;
      prop(pillar, blade, x, y * .5, z, .58, y, .58);
      box(blade, x, y, z, 1.3, 1.2, 2.3);
      for (let i = 0; i < 3; i++) {
        const angle = i * tau / 3 + random(seed) * 2;
        beam(blade, x, y, z - 1.1, x + Math.sin(angle) * y * .49, y + Math.cos(angle) * y * .49, z - 1.22, .27);
      }
    }
    function containers(side, z, seed) {
      const x = side * (13 + random(seed) * 6);
      const shade = [red, blue, pale][Math.floor(random(seed + 289) * 3)];
      box(shade, x, 1.31, z, 2.66, 2.62, 11.8);
      if (random(seed - 27) > .46) box(shade === blue ? red : blue, x + .18, 3.88, z + .38, 2.66, 2.5, 11.6);
      for (let j = -5; j < 6; j++) box(metal, x - side * 1.34, 1.28, z + j, .057, 2.45, .074);
    }

    for (let z = start + 6; z < end; z += 12) {
      for (const side of [-1, 1]) {
        const seed = z * 2.37 + side * 97;
        const x = side * (10.5 + random(seed) * 11);
        const post = side * (half + .8);
        box(metal, post, .43, z, .115, .98, .12);
        box(side > 0 ? reflect : lamp, post, .83, z + .07, .14, .10, .041);
        if (isTunnel) continue;
        switch (local.landmark) {
          case 'cliffs':
            if (side < 0) {
              prop(boulder, dirt, x * 1.45, .21, z, 4 + random(seed) * 5, 2.6 + random(-seed) * 4, 6.8, seed);
              cutout('rock', x * 1.15, z + 5, 2.5 + random(seed + 7) * 3, seed, .4);
              if (z % 24 < 10) tree(x * 1.45, z, seed);
              if (z % 120 < 10) cutout('seaside', x * 2.3, z, 7, seed, .2);
            }
            break;
          case 'cranes':
            if (side < 0 || !look.water) containers(side, z, seed);
            if (z % 144 < 10) {
              const dock = side * 26;
              box(red, dock, 9, z, .75, 18, .75);
              beam(red, dock, 17.8, z, dock - side * 15, 16, z, .52);
              beam(cable, dock, 15.7, z, dock + side * 7, 0, z, .15);
              beam(cable, dock - side * 13, 16, z, dock - side * 13, 5, z, .06);
              box(lamp, dock - side * 13, 15.7, z, .3, .34, .3);
            }
            break;
          case 'towers':
            if (side < 0 || z % 24 < 10) {
              const height = 9 + random(seed) * 27;
              box(tower, x * 1.65, height * .46, z, 6 + random(-seed) * 7, height, 10.4);
              box(dark, x * 1.65, height * .96, z, 3, .45, 4.4);
            }
            break;
          case 'trees':
            tree(x, z, seed);
            tree(x * 1.65, z - 3, seed + 19);
            if (z % 24 < 10) tree(x * 2.2, z + 2, seed - 20);
            break;
          case 'snow':
            prop(boulder, snow, x * 1.45, .1, z, 4 + random(seed) * 5, 2 + random(-seed) * 7, 5.5, seed);
            cutout('rock', x * 1.2, z + 4, 3 + random(-seed) * 2.5, -seed, .5);
            tree(x * 1.25, z - 4, seed, true);
            if (z % 24 < 10) tree(x * 1.8, z + 3, seed + 11, true);
            break;
          case 'columns':
          case 'arch':
            prop(boulder, rock, x * 1.30, 1.3, z, 4.5, 4 + random(seed) * 8.2, 6.5, seed);
            cutout('redrock', x * 1.55, z + 3, 6 + random(-seed) * 8, -seed, .5);
            if (z % 24 < 10) cutout('shrub', x * .95, z - 4, 1.4 + random(seed) * .8, seed);
            break;
          case 'windmills':
            if (z % 96 < 10) turbine(x * (1.6 + random(seed) * 1.4), z, seed);
            if (z % 36 < 10) tree(x * 1.1, z + 4, seed + 5);
            if (z % 168 < 10 && side > 0) cutout('house', x * 2, z, 6.5, seed, .2);
            break;
          case 'dunes':
          case 'fields':
            prop(boulder, local.landmark === 'fields' ? grass : pale, x * 1.35, -.6, z, 6.8, .5 + random(seed) * 1.6, 6.3, seed);
            if (local.landmark === 'fields') {
              beam(dirt, post + side * 3.8, 1, z - 6, post + side * 3.8, 1, z + 6, .13);
              if (z % 36 < 10) tree(x * 1.4, z, seed + 9);
              if (z % 144 < 10) cutout(side > 0 ? 'barn' : 'house', x * 2.1, z + 6, 7.5, seed, .2);
            } else cutout('shrub', x * .9, z + 3, 1.2 + random(seed) * 1, seed);
            break;
          case 'bridge':
            if (z % 72 < 10) {
              const pylon = side * (half + 1.75);
              box(pale, pylon, 5.4, z, 1.47, 12.0, 1.8);
              for (const end of [-1, 1]) for (const span of [12, 24, 36]) {
                beam(cable, pylon, 9.9 + span * .024, z, post, .47, z + end * span, .071);
              }
            }
            break;
        }
        if ((look.night || look.water || local.landmark === 'bridge') && z % 36 < 10) streetlight(side, z);
      }
      if (isTunnel) {
        for (const x of [-3.8, 3.8]) box(z % 24 < 10 ? lamp : reflect, x, 6.48, z, .4, .08, 4.4);
      }
    }
    if (local.landmark === 'arch' && index % 5 === 2) {
      prop(arch, rock, 0, -.72, start + 36, 12.6, 10.2, 12.6);
    }
    if (local.landmark === 'tunnel') {
      // Keep entrance and exit at the exact route station rather than the chunk border.
      for (let z = start; z < end; z += rowSize) {
        if (!tunnelAt(z + rowSize * .5)) continue;
        for (const side of [-1, 1]) {
          const edge = side * (half + .98);
          strips(tunnel, [[edge, -.05], [edge, 5.9], [edge - side * .46, 6.65]], z, z + rowSize);
          strips(tunnelStripe, [[edge - side * .014, 1.02], [edge - side * .014, 1.32]], z, z + rowSize);
          flat(yellow, edge - side * .07, edge - side * .24, .035, z, z + rowSize);
        }
        flat(tunnelCeiling, -half - .56, half + .56, 6.65, z, z + rowSize);
      }
    }

    const finish = mode.goal;
    const gates = mode.gate && Math.min(mode.gates - 1, Math.floor(end / mode.gate));
    const marks = [];
    if (finish >= start && finish < end) marks.push({z: finish, final: true});
    if (gates && gates * mode.gate >= start && gates * mode.gate < end) marks.push({z: gates * mode.gate, final: false});
    for (const {z, final} of marks) {
      for (let i = 0; i < 12; i++) {
        const left = -half + ROAD_WIDTH / 12 * i;
        const right = left + ROAD_WIDTH / 12;
        flat(i % 2 ? checkA : checkB, left, right, .028, z, z + .8);
        flat(i % 2 ? checkB : checkA, left, right, .029, z + .8, z + 1.6);
      }
      for (const x of [-half - .59, half + .59]) box(metal, x, 2.62, z, .29, 5.24, .29);
      box(final ? finishBoard : checkpointBoard, 0, 5.1, z, ROAD_WIDTH + 1.68, 1.12, .16);
    }

    for (const [fabric, {vertices, index, uv, colors}] of ribbons) {
      const geometry = new T.BufferGeometry();
      geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
      geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
      if (colors.length) geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
      geometry.setIndex(index);
      geometry.computeVertexNormals();
      const mesh = new T.Mesh(geometry, fabric);
      mesh.receiveShadow = fabric === road || fabric === ground.shoulder || fabric === white || fabric === yellow;
      group.add(mesh);
    }
    for (const {geometry, fabric, matrices} of pools.values()) {
      const batch = new T.InstancedMesh(geometry, fabric, matrices.length);
      matrices.forEach((matrix, i) => batch.setMatrixAt(i, matrix));
      group.add(batch);
    }
    group.position.z = origin - start;
    root.add(group);
    return group;
  }

  function remove(group) {
    root.remove(group);
    for (const child of group.children) {
      if (child.isInstancedMesh) child.dispose();
      else child.geometry.dispose();
    }
    group.userData.materials.forEach(fabric => fabric.dispose());
  }

  // 하루 빛(1 낮 · 0 밤) — 길가 그림의 자기 빛을 줄인다
  function daylight(k) {
    for (const fabric of Object.values(cutouts)) fabric.emissiveIntensity = .22 * k;
  }

  function update(state, cameraZ) {
    clock.value = state.elapsed;
    const fresh = course !== state.course || mode !== state.mode;
    if (fresh) {
      for (const group of chunks.values()) remove(group);
      chunks.clear();
      course = state.course;
      mode = state.mode;
    }
    const rebased = Math.floor(state.distance / 1152) * 1152;
    if (origin !== rebased) {
      origin = rebased;
      for (const [index, chunk] of chunks) chunk.position.z = origin - index * chunkSize;
    }
    const first = Math.floor((cameraZ - 10) / chunkSize);
    const last = Math.floor((cameraZ + ahead) / chunkSize);
    for (const [index, group] of chunks) {
      if (index >= first && index <= last) continue;
      remove(group);
      chunks.delete(index);
    }
    for (let i = first; i <= last; i++) if (!chunks.has(i)) chunks.set(i, createChunk(i));
    return origin;
  }

  return { update, tunnelAt, daylight };
}
