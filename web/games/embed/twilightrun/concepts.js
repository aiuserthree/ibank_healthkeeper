import { TIRE_RADIUS } from './drive.js?v=39';
import { bodyFinish, glassFinish } from './finishes.js?v=39';

// 차고에서 사는 새 차 6대. 기존 4종(매끈 · 투톤 지붕 · 칼날 LED)과 겹치지 않게 차마다 몸통 단면 · 유리 · 얼굴 조명 · 꼬리를 따로 짠다.
// 모양은 운영자가 준 참고 사진 6장(2026-11-21)을 따라가고, 로고 · 엠블럼 · 글자는 넣지 않는다.
// 좌표: 앞이 -Z, 단면 [z, 반폭, 바닥, 윗면, 윗면 폭 비율]. 몸통 끝 l = 축간거리/2 + .62(scene.js 와 같은 자리).
export function createConcepts(T, kit) {
  const { loft, wheelArches, densify, panel, piece, box, crumpling, modelPlate, glowTexture, crackedGlass, standard,
    rubber, rotor, trim, grille, glass, gloss, alloy, detailWheel, disc, lug, lip, cube } = kit;
  const basic = color => new T.MeshBasicMaterial({ color, side: T.DoubleSide });
  const led = basic('#f1fbff');
  // 카본 — 짠 무늬(트윌) 결이 보이는 검정, 투명 코팅
  const carbon = (() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d');
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      ctx.fillStyle = (x + y) % 4 < 2 ? '#2a2d31' : '#15171a';
      ctx.fillRect(x * 4, y * 4, 4, 4);
    }
    const map = new T.CanvasTexture(canvas);
    map.wrapS = map.wrapT = T.RepeatWrapping;
    map.repeat.set(6, 6);
    map.colorSpace = T.SRGBColorSpace;
    return new T.MeshPhysicalMaterial({ map, roughness: .38, metalness: .3, clearcoat: 1, clearcoatRoughness: .12, side: T.DoubleSide });
  })();
  const cache = new Map();
  const lerp = T.MathUtils.lerp;
  const at = (list, z, k) => {
    const i = Math.max(1, list.findIndex(s => s[0] >= z));
    const a = list[i - 1], b = list[Math.min(i, list.length - 1)];
    return lerp(a[k], b[k], T.MathUtils.clamp((z - a[0]) / (b[0] - a[0] || 1), 0, 1));
  };
  const top = (list, z) => at(list, z, 3);

  function merge(parts) {
    const points = [], index = [];
    for (const g of parts) {
      const base = points.length / 3;
      points.push(...g.getAttribute('position').array);
      for (const i of g.getIndex().array) index.push(base + i);
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(points, 3));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    return geometry;
  }
  function ribbon(group, material, a, b) {
    const points = [], index = [];
    a.forEach((p, i) => points.push(...p, ...b[i]));
    for (let i = 0; i < a.length - 1; i++) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(points, 3));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    return piece(group, geometry, material, 0, 0, 0);
  }
  const bar = (group, material, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => {
    const mesh = box(group, material, x, y, z, sx, sy, sz);
    mesh.rotation.set(rx, ry, rz);
    return mesh;
  };
  // 육각 고리(로컬 x-y 면) — 헥사 팽 얼굴 · 꼬리
  function hex(group, material, x, y, z, r, t, rx = 0, y3 = false) {
    const ring = new T.Group();
    ring.position.set(x, y, z);
    ring.rotation.x = rx;
    const R = r * Math.cos(Math.PI / 6);
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 3 * k;
      bar(ring, material, R * Math.cos(a), R * Math.sin(a), 0, t, r, t * .7, 0, 0, a);
    }
    if (y3) for (let k = 0; k < 3; k++) {
      const a = Math.PI / 2 + k * Math.PI * 2 / 3;
      bar(ring, material, Math.cos(a) * r * .38, Math.sin(a) * r * .38, 0, t * .8, r * .76, t * .7, 0, 0, a + Math.PI / 2);
    }
    group.add(ring);
    return ring;
  }
  const glowSprite = (group, color, x, y, z, size, opacity) => {
    const sprite = new T.Sprite(new T.SpriteMaterial({ map: glowTexture, color, opacity, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    sprite.position.set(x, y, z);
    sprite.scale.setScalar(size);
    group.add(sprite);
    return sprite;
  };
  function mount(group, part, x, y, z) {
    const pivot = new T.Group();
    pivot.position.set(x, y, z);
    part.position.set(-x, -y, -z);
    pivot.add(part);
    group.add(pivot);
    return pivot;
  }

  function wheelSet(group, car, w, look) {
    const wheels = [];
    const brake = standard(look.brake, .39, .19);
    const rim = standard(look.rim, .24, .72);
    const accent = look.lip ? basic(look.lip) : rim;
    const slotMat = look.slot ? (look.slotGlow ? basic(look.slot) : standard(look.slot, .3, .6)) : grille;
    const cover = look.disc ? new T.CylinderGeometry(look.coverR || .3, look.coverR || .3, .02, 28) : null;
    for (const s of [-1, 1]) for (const end of [-1, 1]) {
      const assembly = new T.Group(), rotating = new T.Group();
      const front = end < 0;
      const halfTrack = w - (front ? .075 : .105);
      const axle = car.wheelbase / 2;
      assembly.position.set(s * halfTrack, TIRE_RADIUS, end * axle);
      if (front) piece(group, cube, trim, s * halfTrack * .81, TIRE_RADIUS, -axle, halfTrack * .48, .06, .06);
      const tire = piece(rotating, detailWheel, rubber, 0, 0, 0);
      tire.rotation.z = Math.PI / 2;
      if (look.tread) {
        tire.scale.y = 1.3;
        for (let i = 0; i < 16; i++) {
          const a = i * Math.PI * 2 / 16;
          bar(rotating, rubber, (i % 2 ? .03 : -.03), Math.cos(a) * .362, Math.sin(a) * .362, .24, .026, .07, a);
        }
      }
      const rotorMesh = piece(assembly, disc, rotor, s * .131, 0, 0);
      rotorMesh.rotation.z = Math.PI / 2;
      if (look.big) {
        rotorMesh.scale.set(1.24, 1, 1.24);
        box(assembly, brake, s * .1, .17, .13, .06, .17, .12);
        piece(rotating, new T.TorusGeometry(.33, .011, 6, 36), rim, s * .15, 0, 0).rotation.y = Math.PI / 2;
      } else box(assembly, brake, s * .137, .149, .107, .069, .128, .088);
      piece(rotating, lip, accent, s * .146, 0, 0).rotation.y = Math.PI / 2;
      if (cover) {
        piece(rotating, cover, rim, s * .16, 0, 0).rotation.z = Math.PI / 2;
        for (let i = 0; i < look.spokes; i++) {
          const a = i * Math.PI * 2 / look.spokes;
          bar(rotating, slotMat, s * .172, Math.cos(a) * (look.slotR || .2), Math.sin(a) * (look.slotR || .2), .01, look.slotL || .11, look.slotW || .035, a + (look.slotTwist || 0));
        }
      } else if (look.y) {
        // Y 자 살 — 다리 둘이 바깥으로 벌어진다(살 사이로 큰 브레이크가 보이게)
        for (let i = 0; i < look.spokes; i++) {
          const a = i * Math.PI * 2 / look.spokes;
          bar(rotating, rim, s * .166, Math.cos(a) * .09, Math.sin(a) * .09, .034, .11, .04, a);
          for (const d of [-1, 1]) {
            const b = a + d * .2;
            bar(rotating, rim, s * .162, Math.cos(b) * .21, Math.sin(b) * .21, .026, .16, .026, b - d * .25);
          }
        }
      } else for (let i = 0; i < look.spokes; i++) {
        const a = i * Math.PI * 2 / look.spokes;
        bar(rotating, rim, s * .164, Math.cos(a) * .136, Math.sin(a) * .136, .029, .212, look.width || .03, a + (look.twist || 0));
      }
      if (look.whitewall) piece(rotating, new T.TorusGeometry(.285, .032, 8, 36), basic('#f4f1e8'), s * .128, 0, 0).rotation.y = Math.PI / 2;
      if (look.spinner) {
        piece(rotating, new T.ConeGeometry(.07, .08, 16), rim, s * .2, 0, 0).rotation.z = -s * Math.PI / 2;
        for (let k = 0; k < 3; k++) bar(rotating, rim, s * .19, Math.cos(k * 2.094) * .07, Math.sin(k * 2.094) * .07, .02, .12, .025, k * 2.094);
      }
      if (look.beadlock) for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4;
        box(rotating, grille, s * .17, Math.cos(a) * .272, Math.sin(a) * .272, .02, .022, .022);
      }
      if (look.nut) piece(rotating, new T.CylinderGeometry(.05, .05, .03, 6), basic(look.nut), s * .182, 0, 0).rotation.z = Math.PI / 2;
      piece(rotating, lug, trim, s * .175, 0, 0).rotation.z = Math.PI / 2;
      assembly.add(rotating);
      group.add(assembly);
      wheels.push({ assembly, rotating, front, side: s, halfTrack });
    }
    return wheels;
  }

  // 윗면을 따라가는 가는 띠(눈매 · 홈 · 선) — x0,z0 → x1,z1, 바깥쪽으로 width
  function onTop(group, material, list, x0, z0, x1, z1, width, lift = .012, n = 8) {
    const a = [], b = [];
    for (let i = 0; i <= n; i++) {
      const x = lerp(x0, x1, i / n), z = lerp(z0, z1, i / n), y = (typeof list === 'function' ? list(z) : top(list, z)) + lift;
      a.push([x, y, z]);
      b.push([x + width * Math.sign(x1 || x0 || 1), y, z]);
    }
    return ribbon(group, material, a, b);
  }
  // 옆면에 붙는 선(z0 → z1, 높이 y0 → y1) — edge(z) 는 그 자리 차 바깥
  function sideLine(group, material, s, edge, z0, y0, z1, y1, height, n = 12) {
    const a = [], b = [];
    for (let i = 0; i <= n; i++) {
      const z = lerp(z0, z1, i / n), y = lerp(y0, y1, i / n), x = s * edge(z);
      a.push([x, y, z]);
      b.push([x, y + height, z]);
    }
    return ribbon(group, material, a, b);
  }
  function polyline(group, material, points, height) {
    return ribbon(group, material, points, points.map(([x, y, z]) => [x, y + height, z]));
  }

  // 스포츠카 앞 기준 = 스트라토 캐노피(운영자 지시 2026-11-21): 코끝 · 보닛 높이 · 곡면 · 앞 펜더 · 앞바퀴 위치가 모두 같다.
  // 앞 등 · 색 · 옆 · 뒤 장식은 차마다 다르게 둔다. 휠도 같은 5살 디자인(색만 차마다)
  const STRATO_FRONT = { tip: .2, tipH: .37, tipW: .64, tipLow: .17, hood: .79, fender: .79 };
  const STRATO_WHEEL = { spokes: 5, width: .065, big: true };

  // ── 공통 슈퍼카 뼈대: 가운데는 낮은 보닛, 바퀴 위로 따로 솟은 앞 · 뒤 펜더, 좁고 둥근 유리 지붕 ──
  function supercar(w, l, axle, o = {}) {
    const tip = o.tip ?? .26, tipH = o.tipH ?? .31, hood = o.hood ?? .79, deck = o.deck ?? .8;
    const fender = o.fender ?? .79, hip = o.hip ?? .82;
    const main = o.main || [
      [-l - tip, w * (o.tipW ?? .4), o.tipLow ?? .24, tipH, .6], [-l + .1, w * .76, .2, tipH + .22, .62], [-axle, w * .84, .2, hood, .66],
      [-1, w * .92, .2, hood + .02, .72], [-.6, w * .95, .2, hood + .01, .8], [.3, w * .95, .2, .74, .86], [axle, w * .8, .2, deck, .86],
      [l - .1, w * .86, .24, deck + .01, .88], [l, w * .84, .32, deck - .03, .88]];
    const podF = wheelArches(o.podF || [[-l - .02, .08, .26, tipH + .04, .6], [-l + .3, .2, .22, fender - .2, .6],
      [-axle, .27, .2, fender - .04, .62], [-1, .27, .2, fender - .07, .64], [-.5, .2, .22, hood - .06, .7], [-.15, .06, .3, .6, .7]], axle, { front: .01, rear: .01, flare: .035, lip: .02 });
    const podR = wheelArches(o.podR || [[-.4, .05, .3, .6, .8], [-.05, .17, .22, .66, .8], [.6, .27, .2, hip - .06, .82], [axle, .29, .2, hip, .84],
      [l - .1, .28, .24, hip, .85], [l, .24, .3, hip - .04, .85]], axle, { front: .06, rear: .06, flare: .05 });
    const fx = w * (o.fx ?? .76);
    const pods = [podF, podR].flatMap(pod => [-1, 1].map(s => loft(pod, true).translate(s * fx, 0, 0)));
    const inside = (list, z) => z >= list[0][0] && z <= list.at(-1)[0];
    const edge = z => Math.max(inside(main, z) ? at(main, z, 1) : 0, ...[podF, podR].filter(p => inside(p, z)).map(p => fx + at(p, z, 1))) + .012;
    const front = z => Math.max(top(main, z), inside(podF, z) ? top(podF, z) : 0);
    const cabinList = o.cabin || [[-1.05, w * .6, .58, .64, .95], [-.6, w * .6, .62, .94, .8], [-.1, w * .58, .66, 1.12, .74], [.45, w * .56, .68, 1.1, .74], [1.1, w * .5, .72, .9, .8], [1.6, w * .4, .76, .82, .9]];
    return {
      main, podF: front, podR, fx, edge, surface: main, cabinList, tipZ: main[0][0], body: merge([loft(densify(main, .1), true), ...pods, ...(o.extra || [])]),
      cabin: loft(densify(cabinList), true),
      roof: loft(densify(o.roof || [[-.15, w * .44, 1.08, 1.13, .85], [.45, w * .42, 1.07, 1.12, .85], [.9, w * .36, .96, 1.0, .85]]), true),
    };
  }
  // ── 멋 부품 세트(슈퍼카 뼈대 차에 공통) — 카본 스플리터 · 카나드 · 사이드 스커트 · 옆 흡기구 · 큰 디퓨저 · 어깨 접힌 선 · 유리 테 ──
  // 무게 한도: 차 하나당 부품 260개 · 삼각형 4만 개 아래(쇼룸 · 주행 프레임 유지)
  function aeroKit({ chassis, frontPanel, bumper, flank, lamp }, c, w, l, axle, o) {
    const accent = basic(o.accent);
    const crease = standard(o.crease, .18, .4);
    const nose = c.tipZ;
    box(frontPanel, carbon, 0, .17, nose + .2, w * 1.25, .022, .34);
    box(frontPanel, accent, 0, .183, nose + .03, w * 1.15, .008, .012);
    for (const s of [-1, 1]) {
      for (let k = 0; k < 2; k++) bar(frontPanel, carbon, s * w * (.78 + k * .03), .27 + k * .065, -l + .02 + k * .07, .2, .012, .13, 0, 0, s * (.22 + k * .1));
      const f = flank[s];
      const skirt = 2 * axle - 1.0;
      box(f, carbon, s * (c.edge(0) + .012), .2, 0, .07, .055, skirt);
      box(f, accent, s * (c.edge(0) + .05), .228, 0, .006, .008, skirt * .92);
      // 옆 흡기구 — 어두운 구멍 + 카본 날 셋
      if (o.intake !== false) {
        sideLine(f, grille, s, z => c.edge(z) + .004, .2, .3, .92, .36, .24, 8);
        for (let k = 0; k < 3; k++) sideLine(f, carbon, s, z => c.edge(z) + .01, .25 + k * .05, .36 + k * .06, .9, .42 + k * .06, .014, 6);
      }
      // 어깨 접힌 선 — 빛을 받는 밝은 선
      sideLine(f, crease, s, z => c.edge(z) + .003, -l + .45, .56, l - .25, .73, .016, 16);
      // 유리 아래 테
      const cab = c.cabinList;
      const a = [], b = [];
      for (let i = 0; i <= 14; i++) {
        const z = lerp(cab[0][0] + .1, cab.at(-1)[0] - .1, i / 14);
        const x = s * (at(cab, z, 1) + .006), y = at(cab, z, 2) + .04;
        a.push([x, y, z]);
        b.push([x, y + .014, z]);
      }
      ribbon(chassis, standard(o.trim || '#d6dbe0', .15, .9), a, b);
    }
    // 큰 디퓨저 — 카본 판 + 높은 핀 + 가운데 빗길 등
    box(bumper, carbon, 0, .2, l - .15, w * 1.5, .03, .4);
    for (let k = -3; k <= 3; k++) {
      box(bumper, carbon, k * w * .19, .28, l - .1, .018, .17, .3);
      box(bumper, accent, k * w * .19, .366, l + .045, .02, .006, .02);
    }
    box(bumper, lamp, 0, .32, l + .06, .12, .035, .015);
  }
  function archFlare(group, material, x, s, zc, r, width, out) {
    const a = [], b = [];
    for (let i = 0; i <= 12; i++) {
      const t = Math.PI * i / 12;
      a.push([x, TIRE_RADIUS + Math.sin(t) * r, zc + Math.cos(t) * r]);
      b.push([x + s * out, TIRE_RADIUS + Math.sin(t) * (r + width), zc + Math.cos(t) * (r + width)]);
    }
    return ribbon(group, material, a, b);
  }
  function archRing(group, material, x, zc, r, width = .022) {
    const a = [], b = [];
    for (let i = 0; i <= 18; i++) {
      const t = Math.PI * i / 18;
      a.push([x, TIRE_RADIUS + Math.sin(t) * r, zc + Math.cos(t) * r]);
      b.push([x, TIRE_RADIUS + Math.sin(t) * (r + width), zc + Math.cos(t) * (r + width)]);
    }
    return ribbon(group, material, a, b);
  }

  // 두 점을 잇는 관(짐받이 · 케이지 · 범퍼 가드)
  const up = new T.Vector3(0, 1, 0);
  function rod(group, material, a, b, r = .025) {
    const from = new T.Vector3(...a), to = new T.Vector3(...b);
    const mesh = new T.Mesh(new T.CylinderGeometry(r, r, from.distanceTo(to), 8), material);
    mesh.position.copy(from).add(to).multiplyScalar(.5);
    mesh.quaternion.setFromUnitVectors(up, to.clone().sub(from).normalize());
    group.add(mesh);
    return mesh;
  }
  // 7 · 8 볼더 — 각진 박스 오프로드 SUV(운영자 참고 사진 2장): 똑바로 선 앞유리, 둥근 눈 + 네모 테, 가로 그릴, 검은 펜더 · 범퍼, 뒷문 스페어 타이어.
  // 익스페디션은 지붕 짐받이 · 조명, 바깥 케이지, 범퍼 가드, 스노클, 흙받이.
  function suv(w, l, axle, expedition) {
    const main = [[-l, w * .94, .32, .98, .95], [-l + .06, w * .98, .3, 1.04, .96], [-.85, w, .3, 1.06, .96], [l - .04, w, .3, 1.08, .97], [l, w * .98, .32, 1.06, .97]];
    const surface = wheelArches(main, axle, { front: 0, rear: 0, flare: 0, step: .25, lip: .02 });
    return {
      surface, body: loft(surface), flat: true, roofMat: expedition ? 'paint' : gloss, glass: '#6a8294',
      cabin: loft([[-.86, w * .93, 1.04, 1.12, .99], [-.78, w * .92, 1.05, 1.82, .96], [l - .06, w * .92, 1.07, 1.82, .96]]),
      roof: loft([[-.8, w * .95, 1.8, 1.88, .97], [l - .04, w * .95, 1.8, 1.88, .97]]),
      front: -.8, rear: .9, look: { pin: 0, belt: [.5, 0], lower: '#1d1f21' },
      dress({ chassis, frontPanel, bumper, wing, flank, lamp, paint }) {
        const black = standard('#16181a', .7, .2);
        const alloy2 = standard('#d9dde1', .2, .9);
        const crease = standard(expedition ? '#f1d9ad' : '#de4a50', .2, .3);
        // 공통 다듬기: 헤드램프 크롬 테 + LED 고리, 안개등 · 견인고리 · 알루미늄 하부 보호판, 보닛 통풍구, 앞 펜더 옆 통풍구, 문 틈 · 어깨선, 유리 고무 테, 두툼한 펜더
        for (const s of [-1, 1]) {
          piece(frontPanel, new T.TorusGeometry(.1, .014, 8, 28), alloy2, s * w * .68, .87, -l - .03);
          piece(frontPanel, new T.TorusGeometry(.066, .008, 6, 24), basic('#ffffff'), s * w * .68, .87, -l - .045);
          piece(frontPanel, new T.CylinderGeometry(.045, .045, .03, 16), basic('#fff4d0'), s * w * .74, .55, -l - .16).rotation.x = Math.PI / 2;
          box(frontPanel, basic('#d4271c'), s * w * .42, .47, -l - .16, .05, .03, .06);
          for (let k = 0; k < 2; k++) box(chassis, grille, s * w * .32, 1.088, -1.75 + k * .14, .26, .006, .05);
          box(flank[s], grille, s * (w + .006), .86, -1.25, .006, .11, .24);
          for (let k = 0; k < 3; k++) box(flank[s], alloy2, s * (w + .01), .82 + k * .035, -1.25, .006, .008, .22);
          box(flank[s], crease, s * (w + .006), .985, 0, .006, .014, 2 * l - .3);
          for (const z of [-.82, -.05, .78]) box(flank[s], grille, s * (w + .004), .74, z, .004, .5, .008);
          for (const y of [1.08, 1.78]) box(chassis, black, s * w * .925, y, (l - .85) / 2, .02, .03, l + .8);
          for (const zc of [-axle, axle]) archFlare(flank[s], black, s * (w + .015), s, zc, .48, .1, .07);
          box(flank[s], alloy2, s * w * 1.0, .35, 0, .18, .02, 1.3);
          glowSprite(bumper, '#ff3a26', s * w * .88, .82, l + .06, .5, .3);
        }
        box(frontPanel, alloy2, 0, .36, -l + .05, w * 1.1, .02, .42);
        const steel = standard(expedition ? '#2a2c2e' : '#bfc4c8', .35, .7);
        box(chassis, expedition ? black : paint, 0, 1.07, -1.45, w * 1.2, .03, .95);
        box(frontPanel, grille, 0, .86, -l - .008, w * .86, .26, .02);
        for (let k = 0; k < 5; k++) box(frontPanel, steel, 0, .76 + k * .05, -l - .022, w * .82, .014, .012);
        for (const s of [-1, 1]) {
          box(frontPanel, steel, s * w * .7, .86, -l - .012, .3, .26, .02);
          piece(frontPanel, new T.CylinderGeometry(.085, .085, .03, 20), basic('#fff6dc'), s * w * .68, .87, -l - .03).rotation.x = Math.PI / 2;
          for (const y of [.79, .94]) piece(frontPanel, new T.CylinderGeometry(.024, .024, .02, 10), basic('#ffb02a'), s * w * .86, y, -l - .03).rotation.x = Math.PI / 2;
          for (const z of [-.7, .25]) box(flank[s], steel, s * (w + .012), 1.0, z, .012, .025, .09);
          for (const z of [-.8, -.05, .78, l - .07]) box(chassis, paint, s * w * .93, 1.44, z, .045, .74, .08);
          box(chassis, black, s * w * 1.07, 1.32, -.76, .06, .2, .15);
          if (!expedition) {
            box(chassis, standard('#2c3a46', .05, .85), s * w * .8, 1.875, .3, .22, .03, 1.0);
            rod(chassis, alloy2, [s * w * .82, 1.95, -.7], [s * w * .82, 1.95, l - .2], .018);
            for (const z of [-.7, l - .2]) rod(chassis, alloy2, [s * w * .82, 1.87, z], [s * w * .82, 1.95, z], .018);
          }
          box(bumper, lamp, s * w * .88, .82, l + .012, .07, .22, .012);
          box(bumper, basic('#ffb02a'), s * w * .88, .97, l + .012, .07, .05, .012);
        }
        box(frontPanel, black, 0, .55, -l - .08, w * 2.04, .14, .14);
        box(frontPanel, trim, 0, .42, -l + .12, w * 1.4, .05, .32);
        box(bumper, black, 0, .5, l + .05, w * 1.9, .12, .12);
        const spare = new T.Group();
        spare.position.set(0, 1.18, l + .2);
        spare.rotation.x = Math.PI / 2;
        piece(spare, detailWheel, rubber, 0, 0, 0);
        piece(spare, new T.CylinderGeometry(.24, .24, .2, 20), steel, 0, 0, 0);
        if (!expedition) {
          piece(spare, new T.CylinderGeometry(.38, .38, .24, 28, 1, true), paint, 0, 0, 0);
          piece(spare, new T.CylinderGeometry(.14, .14, .26, 20), alloy2, 0, 0, 0);
        }
        bumper.add(spare);
        if (expedition) {
          const rack = standard('#202224', .5, .6);
          for (const s of [-1, 1]) {
            rod(chassis, rack, [s * w * .9, 2.02, -1.0], [s * w * .9, 2.02, l - .1], .028);
            for (const z of [-.9, .2, l - .15]) rod(chassis, rack, [s * w * .9, 1.86, z], [s * w * .9, 2.02, z], .022);
            rod(chassis, rack, [s * w * .97, 1.0, -1.18], [s * w * .93, 1.98, -.9], .03);
            rod(chassis, rack, [s * w * .97, 1.85, l - .06], [s * w * .97, .9, l + .02], .03);
            for (const x of [.35, .72]) rod(frontPanel, rack, [s * w * x, .5, -l - .17], [s * w * x, .98, -l - .14], .03);
            box(flank[s], black, s * w * .88, .42, axle + .5, .3, .3, .02);
          }
          for (let k = 0; k <= 5; k++) rod(chassis, rack, [-w * .9, 2.02, lerp(-1, l - .1, k / 5)], [w * .9, 2.02, lerp(-1, l - .1, k / 5)], .02);
          rod(frontPanel, rack, [-w * .8, .98, -l - .14], [w * .8, .98, -l - .14], .03);
          for (let k = 0; k < 4; k++) {
            const x = (k - 1.5) * w * .36;
            piece(chassis, new T.CylinderGeometry(.1, .1, .07, 18), black, x, 2.13, -1.0).rotation.x = Math.PI / 2;
            piece(chassis, new T.CylinderGeometry(.08, .08, .02, 18), basic('#fffbe8'), x, 2.13, -1.04).rotation.x = Math.PI / 2;
          }
          rod(chassis, rack, [-w * .97, 1.98, -.9], [w * .97, 1.98, -.9], .03);
          rod(chassis, rack, [-w * .95, 1.08, -.84], [w * .95, 1.08, -.84], .028);
          box(frontPanel, steel, 0, .53, -l - .17, .3, .1, .1);
          glowSprite(chassis, '#fff3cc', 0, 2.13, -1.1, 1.2, .25);
          rod(chassis, black, [w * 1.03, .98, -.92], [w * 1.03, 1.9, -.86], .045);
          const can = standard('#4b5a38', .5, .2), ladder = standard('#ff7a1a', .45, .1);
          for (const x of [-.25, .05]) {
            box(chassis, can, x * w, 2.2, l - .45, .16, .3, .24);
            box(chassis, black, x * w, 2.37, l - .45, .1, .03, .05);
          }
          for (const x of [-.75, -.55]) box(chassis, ladder, x * w, 2.07, .05, .16, .03, 1.2);
          piece(chassis, new T.CylinderGeometry(.07, .07, 2.2, 12), black, w * .99, 2.0, .15).rotation.x = Math.PI / 2;
          for (let k = 0; k < 4; k++) box(bumper, rack, w * .52, .95 + k * .22, l + .06, .3, .022, .022);
          for (const x of [.38, .66]) box(bumper, rack, x * w, 1.3, l + .06, .022, .85, .022);
        }
        return { plateY: .64, tail: [.88, .82], head: [.68, .87, 0] };
      },
      wheel: expedition ? { brake: '#555', rim: '#c9a56a', spokes: 8, disc: true, tread: true, beadlock: true } : { brake: '#c52d2d', rim: '#d2d6da', spokes: 6, width: .06, tread: true, big: true, nut: '#2a2c2e' },
    };
  }

  // ── 차마다(운영자가 준 참고 사진 6장의 모양을 따라 — 로고 · 엠블럼 · 글자는 넣지 않는다) ──
  const designs = {
    trail: (w, l, axle) => suv(w, l, axle, false),
    expedition: (w, l, axle) => suv(w, l, axle, true),
    // 1 벡터 74 — 흰 쐐기: 낮은 코끝에서 앞유리까지 한 면으로, 각진 어깨선 · 검은 아래 몸 · 모서리 가는 등
    vector(w, l, axle) {
      const c = supercar(w, l, axle, { ...STRATO_FRONT, hip: .84,
        cabin: [[-.85, w * .74, .7, .78, .96], [-.05, w * .66, .72, 1.1, .76], [.45, w * .66, .74, 1.1, .78], [1.05, w * .7, .76, .84, .9]] });
      const surface = c.main;
      return {
        ...c, roofMat: 'paint',
        cabin: loft([[-.85, w * .74, .7, .78, .96], [-.05, w * .66, .72, 1.1, .76], [.45, w * .66, .74, 1.1, .78], [1.05, w * .7, .76, .84, .9]]),
        roof: loft([[-.06, w * .54, 1.085, 1.125, .9], [.45, w * .54, 1.08, 1.12, .9], [.78, w * .54, .99, 1.03, .9]]),
        front: -.75, rear: .6, glow: '#ffa21f', look: { belt: [.42, .015], lower: '#1e2124', pin: 0 },
        dress({ chassis, frontPanel, bumper, wing, flank, lamp, paint }) {
          aeroKit({ chassis, frontPanel, bumper, flank, lamp }, c, w, l, axle, { accent: '#ffa21f', crease: '#ffffff', trim: '#1e2124' });
          const nose = c.tipZ - .012;
          box(frontPanel, grille, 0, .25, nose + .006, w * .4, .05, .012);
          for (const s of [-1, 1]) {
            bar(frontPanel, grille, s * w * .44, .325, nose + .004, w * .3, .032, .012, 0, 0, s * .06);
            bar(frontPanel, led, s * w * .44, .327, nose - .006, w * .27, .013, .012, 0, 0, s * .06);
            const f = flank[s];
            box(f, basic('#ffb11f'), s * c.edge(.3), .62, .3, .012, .012, .1);
            box(chassis, grille, s * w * .86, .84, -.62, .14, .06, .1);
          }
          for (let k = 0; k < 5; k++) {
            const z = .95 + k * .12;
            box(chassis, grille, 0, top(surface, z) + .012, z, w * 1.3, .012, .05);
          }
          bar(wing, paint, 0, .875, l - .1, w * 1.8, .025, .16, -.14);
          box(bumper, grille, 0, .72, l + .005, w * 1.84, .13, .03);
          box(bumper, lamp, 0, .745, l + .022, w * 1.8, .024, .012);
          for (const s of [-1, 1]) box(bumper, lamp, s * w * .86, .7, l + .022, .03, .08, .012);
          box(bumper, trim, 0, .25, l - .1, w * 1.5, .04, .42);
          for (let k = -2; k <= 2; k++) box(bumper, grille, k * w * .3, .3, l - .02, .03, .11, .22);
          return { plateY: .5, tail: [.7, .74], head: [.44, .33, .2] };
        },
        wheel: { ...STRATO_WHEEL, brake: '#9a6a3c', rim: '#25272b', lip: '#9a6a3c', nut: '#ffa21f' },
      };
    },
    // 2 네온 글래스 — 진주색 조각 면: 아주 낮고 뾰족한 코, 펜더 끝 가는 눈매, 옆면 사선 크롬 두 줄, 길고 둥근 푸른 유리
    neon(w, l, axle) {
      const c = supercar(w, l, axle, {
        ...STRATO_FRONT, hip: .8,
        cabin: [[-1.15, w * .62, .58, .64, .95], [-.7, w * .62, .62, .95, .8], [-.15, w * .6, .66, 1.12, .74], [.5, w * .58, .68, 1.1, .74], [1.2, w * .5, .72, .88, .82], [1.75, w * .36, .76, .8, .9]],
        roof: [[-.4, .012, 1.055, 1.07, 1], [-.1, .014, 1.125, 1.14, 1], [.5, .014, 1.105, 1.12, 1], [1.1, .012, .9, .915, 1]],
      });
      return {
        ...c, glass: '#1c3d6e', roofMat: basic('#5ff6ff'), glow: '#2fb8ff', front: -.9, rear: .9, look: { pin: 0, belt: [.43, .025], lower: '#131518' }, paint: { iridescence: .45 },
        dress({ chassis, frontPanel, bumper, wing, flank, lamp }) {
          aeroKit({ chassis, frontPanel, bumper, flank, lamp }, c, w, l, axle, { accent: '#4fd8ff', crease: '#ffffff', trim: '#4fd8ff' });
          const cyan = basic('#4fd8ff');
          const chrome = standard('#cfd6de', .12, .95);
          for (const s of [-1, 1]) {
            onTop(frontPanel, grille, c.podF, s * (c.fx - .1), -l - .08, s * (c.fx + .1), -l + .42, .06);
            onTop(frontPanel, led, c.podF, s * (c.fx - .08), -l - .06, s * (c.fx + .12), -l + .4, .016, .016);
            sideLine(flank[s], chrome, s, c.edge, -.95, .4, .9, .66, .02);
            sideLine(flank[s], chrome, s, c.edge, -.55, .3, 1.25, .54, .016);
            box(flank[s], cyan, s * (w * .95 + .01), .215, 0, .012, .012, 2.1);
            box(chassis, grille, s * w * .7, .86, -.72, .14, .05, .09);
          }
          box(frontPanel, grille, 0, .23, c.tipZ - .006, w * .44, .05, .012);
          box(frontPanel, cyan, 0, .3, c.tipZ - .012, w * .5, .012, .012);
          bar(wing, standard('#e9eef3', .3, .3), 0, .84, l - .08, w * 1.7, .03, .16, -.2);
          box(bumper, grille, 0, .68, l + .005, w * 1.7, .1, .03);
          box(bumper, lamp, 0, .69, l + .022, w * 1.66, .018, .012);
          box(bumper, cyan, 0, .43, l + .022, w * 1.1, .012, .012);
          box(bumper, trim, 0, .26, l - .1, w * 1.3, .04, .4);
          return { plateY: .5, tail: [.7, .69], head: [.76, .6, -.15] };
        },
        wheel: { ...STRATO_WHEEL, brake: '#4fb6ff', rim: '#dfe7f2', lip: '#4fb6ff', nut: '#4fb6ff' },
      };
    },
    // 3 마그마 GT — 앞엔진 GT: 긴 보닛 가운데 불룩, 큰 그물 그릴 · 흰 테두리, 펜더 위 뒤로 찢어진 등, 두 봉 지붕, 문 뒤 흡기구, 높은 뒷날개
    magma(w, l, axle) {
      const c = supercar(w, l, axle, {
        ...STRATO_FRONT,
        podR: [[.2, .18, .22, .7, .8], [1, .28, .2, .8, .82], [axle, .3, .2, .86, .84], [l - .1, .28, .24, .84, .85], [l, .24, .32, .78, .85]],
        cabin: [[-.62, w * .7, .66, .74, .95], [-.15, w * .64, .7, 1.12, .78], [.55, w * .6, .72, 1.12, .78], [1.3, w * .64, .74, .9, .9], [1.95, w * .7, .76, .82, .95]],
      });
      c.roof = merge([-1, 1].map(s => loft(densify([[-.12, .17, 1.09, 1.145, .8], [.55, .17, 1.09, 1.14, .8], [.98, .15, .99, 1.03, .8]]), true).translate(s * .17, 0, 0)));
      return {
        ...c, glow: '#ff3324', front: -.6, rear: .9, look: { pin: 0, belt: [.42, .02], lower: '#141517' },
        dress({ chassis, frontPanel, bumper, wing, flank, lamp }) {
          aeroKit({ chassis, frontPanel, bumper, flank, lamp }, c, w, l, axle, { accent: '#ffb13b', crease: '#ff8a72', trim: '#c9ced6' });
          const white = standard('#f2f2f0', .3, .1);
          const nose = c.tipZ - .012;
          panel(frontPanel, grille, [[-w * .5, .2, nose], [w * .5, .2, nose], [w * .38, .36, nose], [-w * .38, .36, nose]]);
          for (let k = 0; k < 4; k++) box(frontPanel, trim, 0, .225 + k * .034, nose - .004, w * (.96 - k * .08), .006, .006);
          for (let k = -3; k <= 3; k++) box(frontPanel, trim, k * w * .12, .28, nose - .004, .006, .15, .006);
          for (const s of [-1, 1]) {
            polyline(frontPanel, white, [[s * w * .1, .18, nose - .006], [s * w * .52, .18, nose - .006], [s * w * .64, .24, -l - .12], [s * w * .7, .36, -l - .04]], .018);
            panel(frontPanel, grille, [[s * w * .54, .22, -l - .15], [s * w * .66, .22, -l - .11], [s * w * .69, .34, -l - .06], [s * w * .52, .34, -l - .15]]);
            onTop(frontPanel, grille, c.podF, s * (c.fx - .1), -l - .02, s * (c.fx + .08), -l + .36, .07);
            onTop(frontPanel, led, c.podF, s * (c.fx - .08), -l, s * (c.fx + .1), -l + .34, .02, .016);
            const f = flank[s];
            panel(f, grille, [[s * c.edge(.45), .34, .45], [s * c.edge(1), .62, 1], [s * c.edge(1.15), .34, 1.15]]);
            box(f, grille, s * c.edge(0), .23, 0, .03, .06, 2.4);
            box(chassis, kit.gloss, s * w * .8, .9, -.48, .18, .07, .11);
            bar(wing, grille, s * w * .5, 1, l - .32, .035, .3, .08, -.15);
            bar(wing, grille, s * w * .9, 1.15, l - .28, .025, .1, .3);
            bar(bumper, lamp, s * w * .62, .64, l + .02, w * .34, .03, .012, 0, 0, s * .08);
          }
          bar(wing, grille, 0, 1.14, l - .28, w * 1.66, .03, .3, -.08);
          box(bumper, grille, 0, .62, l + .006, w * 1.7, .12, .03);
          box(bumper, trim, 0, .25, l - .1, w * 1.3, .04, .4);
          for (const x of [-.09, .09]) piece(bumper, new T.CylinderGeometry(.05, .05, .1, 14), alloy, x, .3, l - .01).rotation.x = Math.PI / 2;
          return { plateY: .45, tail: [.62, .64], head: [.76, .62, -.12] };
        },
        wheel: { ...STRATO_WHEEL, brake: '#ffb13b', rim: '#2b2e33', lip: '#c9ced6', nut: '#ffb13b' },
      };
    },
    // 4 보이드 R — 검푸른 하이퍼카: 시안 네온 테두리(그릴 · 바퀴 아치 · 문턱), 점 LED 그릴, 보닛 V 홈, 펜더 위 긴 눈매
    void(w, l, axle) {
      const c = supercar(w, l, axle, { ...STRATO_FRONT, hip: .84 });
      return {
        ...c, glow: '#22e6ff', front: -.9, rear: .9, look: { pin: 0, belt: [.42, .02], lower: '#0a0c0e' },
        dress({ chassis, frontPanel, bumper, wing, flank, lamp }) {
          aeroKit({ chassis, frontPanel, bumper, flank, lamp }, c, w, l, axle, { accent: '#36f0ff', crease: '#5d8a96', trim: '#36f0ff' });
          const cyan = basic('#36f0ff');
          const nose = c.tipZ - .012;
          const face = [[-w * .56, .19, nose], [-w * .4, .32, nose], [w * .4, .32, nose], [w * .56, .19, nose]];
          panel(frontPanel, grille, face);
          polyline(frontPanel, cyan, face.map(([x, y, z]) => [x, y, z - .012]), .014);
          for (let r = 0; r < 2; r++) for (let k = -4; k <= 4; k++) {
            const y = .232 + r * .045;
            box(frontPanel, led, k * w * .1 * (1 - r * .2), y, nose - .008, .02, .02, .006);
          }
          for (const s of [-1, 1]) {
            onTop(frontPanel, grille, c.podF, s * (c.fx - .12), -l - .06, s * (c.fx + .12), -l + .46, .06);
            for (let k = 0; k < 4; k++) {
              const z = lerp(-l - .02, -l + .36, k / 3);
              box(frontPanel, led, s * (c.fx - .09 + k * .055 + .03), c.podF(z) + .024, z, .026, .022, .026);
            }
            onTop(frontPanel, cyan, c.podF, s * (c.fx - .12), -l - .06, s * (c.fx + .12), -l + .46, .01, .014);
            for (const zc of [-axle, axle]) archRing(flank[s], cyan, s * c.edge(zc), zc, .45);
            box(flank[s], cyan, s * (w * .95 + .012), .22, 0, .012, .014, 1.9);
            bar(chassis, grille, s * w * .78, .9, -.56, .12, .05, .1);
            bar(wing, grille, s * w * .46, .94, l - .3, .035, .2, .08, -.15);
          }
          bar(wing, grille, 0, 1.04, l - .26, w * 1.5, .03, .26, -.1);
          box(wing, cyan, 0, 1.05, l - .13, w * 1.48, .012, .012);
          box(bumper, grille, 0, .7, l + .005, w * 1.7, .1, .03);
          box(bumper, lamp, 0, .71, l + .022, w * 1.66, .016, .012);
          box(bumper, cyan, 0, .4, l + .022, w * 1.3, .012, .012);
          box(bumper, trim, 0, .25, l - .1, w * 1.5, .04, .42);
          for (let k = -3; k <= 3; k++) box(bumper, grille, k * w * .2, .3, l - .02, .025, .12, .24);
          return { plateY: .52, tail: [.7, .71], head: [.76, .62, -.18] };
        },
        wheel: { ...STRATO_WHEEL, brake: '#36f0ff', rim: '#1e2328', lip: '#36f0ff', nut: '#36f0ff' },
      };
    },
    // 5 스트라토 캐노피 — 두 줄 흰 줄무늬 슈퍼카: 가운데 거꾸로 된 삼각 그물 그릴 + 양옆 삼각 흡기구, 펜더 위 고양이 눈 등, 둥근 지붕, 문 아래 아가미
    strato(w, l, axle) {
      const c = supercar(w, l, axle, { ...STRATO_FRONT, hip: .86 });
      return {
        ...c, glow: '#ff2a3a', front: -.9, rear: .9, stripe: '#d0102a', look: { spine: .2, pin: 0 },
        dress({ chassis, frontPanel, bumper, wing, flank, lamp, paint }) {
          aeroKit({ chassis, frontPanel, bumper, flank, lamp }, c, w, l, axle, { accent: '#ff2a3a', crease: '#5a5f66', trim: '#c9ced6' });
          const white = standard('#eef0f2', .25, .1);
          const nose = c.tipZ - .01;
          panel(frontPanel, grille, [[-w * .3, .35, nose], [w * .3, .35, nose], [0, .19, nose]]);
          polyline(frontPanel, alloy, [[-w * .32, .35, nose - .006], [0, .18, nose - .006], [w * .32, .35, nose - .006]], .014);
          for (let k = 1; k < 4; k++) box(frontPanel, alloy, 0, .19 + k * .04, nose - .004, w * .6 * k / 4, .005, .006);
          for (let k = -2; k <= 2; k++) box(frontPanel, alloy, k * w * .08, .3, nose - .004, .005, .08 - Math.abs(k) * .02, .006);
          for (const s of [-1, 1]) {
            panel(frontPanel, grille, [[s * w * .38, .33, nose], [s * w * .6, .36, nose], [s * w * .58, .2, nose]]);
            polyline(frontPanel, alloy, [[s * w * .37, .33, nose - .006], [s * w * .58, .19, nose - .006], [s * w * .61, .36, nose - .006]], .01);
            for (let k = 1; k < 3; k++) box(frontPanel, alloy, s * w * (.42 + k * .05), .3, nose - .004, .005, .07, .006);
            onTop(frontPanel, grille, c.podF, s * (c.fx - .14), -l - .02, s * (c.fx + .06), -l + .38, .075);
            onTop(frontPanel, led, c.podF, s * (c.fx - .12), -l, s * (c.fx + .08), -l + .34, .014, .016);
            for (let k = 0; k < 4; k++) box(flank[s], grille, s * c.edge(.4 + k * .1), .33, .4 + k * .1, .012, .1, .04);
            box(flank[s], grille, s * c.edge(0), .23, 0, .03, .06, 2.4);
            box(chassis, alloy, s * w * .78, .9, -.56, .16, .06, .1);
            
            for (const x of [.5, .72]) piece(bumper, new T.CylinderGeometry(.055, .055, .02, 16), lamp, s * w * x, .66, l + .02).rotation.x = Math.PI / 2;
            for (const x of [.08, .2]) piece(bumper, new T.CylinderGeometry(.04, .04, .1, 14), alloy, s * w * x, .3, l - .01).rotation.x = Math.PI / 2;
          }
          box(chassis, standard('#d0102a', .25, .3), 0, 1.13, .15, .4, .006, .58);
          bar(wing, paint, 0, .84, l - .08, w * 1.6, .025, .16, -.18);
          box(bumper, grille, 0, .66, l + .006, w * 1.7, .14, .02);
          box(bumper, trim, 0, .25, l - .1, w * 1.4, .04, .42);
          return { plateY: .46, tail: [.62, .66], head: [.72, .62, -.14] };
        },
        wheel: { ...STRATO_WHEEL, brake: '#d4271c', rim: '#d7dbe0' },
      };
    },
    // 11 레트로 버블 — 귀여운 클래식 쿠페(운영자 참고 사진): 둥글게 부푼 앞뒤 펜더, 펜더 앞 동그란 눈 + 크롬 테, 가운데 타원 크롬 그릴, 보닛 검은 두 줄, 둥근 지붕
    retro(w, l, axle) {
      const c = supercar(w, l, axle, {
        fx: .72,
        main: [[-l - .05, w * .58, .26, .55, .8], [-l + .2, w * .7, .24, .66, .8], [-axle, w * .72, .24, .72, .82], [-.9, w * .82, .24, .76, .84],
          [-.4, w * .9, .24, .78, .84], [.4, w * .9, .24, .8, .84], [axle, w * .74, .26, .82, .84], [l - .1, w * .66, .3, .76, .8], [l, w * .56, .36, .66, .78]],
        podF: [[-l + .02, .1, .3, .56, .7], [-l + .28, .26, .26, .78, .7], [-axle, .3, .26, .88, .72], [-1.1, .28, .28, .82, .72], [-.55, .14, .34, .66, .7]],
        podR: [[.35, .14, .34, .68, .7], [.9, .28, .28, .84, .72], [axle, .31, .26, .9, .72], [l - .1, .26, .3, .82, .7], [l + .04, .1, .38, .62, .7]],
        cabin: [[-.78, w * .66, .74, .8, .95], [-.4, w * .62, .78, 1.24, .7], [.4, w * .6, .8, 1.26, .7], [1.0, w * .52, .8, 1.0, .78], [1.4, w * .4, .8, .84, .85]],
        roof: [[-.36, w * .5, 1.2, 1.275, .72], [.4, w * .48, 1.21, 1.285, .72], [.95, w * .4, 1.0, 1.065, .78]],
      });
      return {
        ...c, roofMat: 'finish', glass: '#5f8590', style: 2, stripe: '#121212', front: -.7, rear: .9, look: { pin: 0 },
        paint: { roughness: .13, metalness: .32, clearcoat: 1, clearcoatRoughness: .04, envMapIntensity: 1.25 },
        dress({ chassis, frontPanel, bumper, wing, flank, lamp }) {
          const chrome = standard('#e1e4e8', .08, 1);
          const nose = -l - .055;
          // 크롬 다듬기: 옆 크롬 띠 · 유리 크롬 테 · 둥근 크롬 범퍼와 범퍼 뿔 · 안개등 · 보닛 장식 · 쌍 배기구 · 크롬 후미등 테
          for (const s of [-1, 1]) {
            sideLine(flank[s], chrome, s, z => c.edge(z) + .004, -l + .35, .5, l - .2, .52, .014, 16);
            const cab = c.cabinList, a = [], b = [];
            for (let i = 0; i <= 14; i++) {
              const z = lerp(cab[0][0] + .06, cab.at(-1)[0] - .06, i / 14);
              a.push([s * (at(cab, z, 1) + .006), at(cab, z, 2) + .03, z]);
              b.push([s * (at(cab, z, 1) + .006), at(cab, z, 2) + .05, z]);
            }
            ribbon(chassis, chrome, a, b);
            rod(frontPanel, chrome, [s * w * .2, .22, nose - .07], [s * w * .2, .4, nose - .06], .022);
            piece(frontPanel, new T.TorusGeometry(.04, .01, 6, 18), chrome, s * w * .5, .3, nose - .02);
            piece(frontPanel, new T.CircleGeometry(.036, 16), basic('#ffd76a'), s * w * .5, .3, nose - .015).rotation.y = Math.PI;
            piece(bumper, new T.TorusGeometry(.065, .012, 6, 22), chrome, s * c.fx, .62, l + .05);
            piece(bumper, new T.CylinderGeometry(.035, .035, .14, 12), chrome, s * w * .3, .3, l + .02).rotation.x = Math.PI / 2;
          }
          rod(frontPanel, chrome, [-w * .78, .27, nose + .02], [w * .78, .27, nose + .02], .028);
          rod(bumper, chrome, [-w * .7, .4, l + .06], [w * .7, .4, l + .06], .028);
          bar(chassis, chrome, 0, top(c.main, -l + .25) + .03, -l + .25, .012, .05, .16, -.3);
          const ring = piece(frontPanel, new T.TorusGeometry(.16, .02, 10, 36), chrome, 0, .43, nose - .01);
          ring.scale.set(1.35, .78, 1);
          const hole = piece(frontPanel, new T.CircleGeometry(.16, 32), grille, 0, .43, nose - .004);
          hole.scale.set(1.35, .78, 1);
          hole.rotation.y = Math.PI;
          for (let k = -5; k <= 5; k++) box(frontPanel, chrome, k * .036, .43, nose - .012, .008, .2 * Math.sqrt(1 - (k / 6) ** 2), .008);
          for (const s of [-1, 1]) {
            const x = s * c.fx;
            piece(frontPanel, new T.TorusGeometry(.105, .022, 10, 32), chrome, x, .62, -l + .1);
            piece(frontPanel, new T.CircleGeometry(.1, 28), basic('#fff3dc'), x, .62, -l + .095).rotation.y = Math.PI;
            for (let k = 0; k < 6; k++) box(flank[s], chrome, s * c.edge(-.62 + k * .05), .6, -.62 + k * .05, .01, .12, .014);
            box(chassis, chrome, s * w * .74, .98, -.66, .1, .06, .08);
            piece(bumper, new T.CircleGeometry(.055, 20), lamp, x, .62, l + .045);
          }
          return { plateY: .5, tail: [.72, .62], head: [.72, .62, -.1] };
        },
        wheel: { brake: '#333', rim: '#e6e9ec', spokes: 0, disc: true, coverR: .19, whitewall: true, spinner: true },
      };
    },
    // 10 스틸 웨지 — 스테인리스 각진 전기 픽업(운영자 참고 사진): 삼각형 지붕선, 앞 끝 전체 가로 빛줄, 각진 검은 펜더, 높은 차체
    wedge(w, l, axle) {
      const main = [[-l - .05, w * .96, .42, .96, .96], [-1.45, w, .4, 1.06, .95], [-.6, w, .4, 1.2, .94], [l - .05, w, .4, 1.24, .95], [l, w * .98, .44, 1.22, .95]];
      const surface = wheelArches(main, axle, { front: 0, rear: 0, flare: 0, step: .3, lip: .02 });
      const tonneau = loft([[.7, w * .84, 1.18, 1.5, .62], [l, w * .94, 1.18, 1.26, .9]]);
      return {
        surface, body: merge([loft(surface), tonneau]), flat: true, roofMat: 'paint', glass: '#4b5968',
        cabin: loft([[-1.35, w * .9, 1.06, 1.14, .96], [-.3, w * .8, 1.16, 1.78, .58], [.75, w * .84, 1.18, 1.48, .62]]),
        roof: loft([[-.32, w * .46, 1.74, 1.8, .8], [.74, w * .52, 1.44, 1.5, .8]]),
        front: -1.0, rear: .7, look: { belt: [.52, 0], lower: '#1b1d1f', pin: 0 },
        dress({ chassis, frontPanel, bumper, wing, flank, lamp, paint }) {
          const black = standard('#1b1d1f', .75, .2);
          const steel = standard('#d0d5da', .22, .95);
          // 앞: 가로 빛줄을 굵고 밝게(빛 번짐 여럿) · 아래 두 번째 빛줄 · 각진 하부 보호판 · 프렁크 틈
          box(frontPanel, led, 0, .975, -l - .075, w * 1.92, .03, .02);
          for (let k = -2; k <= 2; k++) glowSprite(frontPanel, '#e4f2ff', k * w * .42, .975, -l - .12, .7, .32);
          box(frontPanel, black, 0, .5, -l - .04, w * 1.92, .14, .1);
          box(frontPanel, basic('#9fd8ff'), 0, .58, -l - .095, w * 1.5, .01, .012);
          bar(frontPanel, steel, 0, .4, -l + .1, w * 1.3, .02, .5, .25);
          box(chassis, black, 0, 1.065, -1.75, w * 1.7, .004, .012);
          // 짐칸 덮개 줄 · 뒷문 틈 · 뒤 빛줄 번짐
          for (let k = 0; k < 6; k++) box(chassis, black, 0, lerp(1.47, 1.29, k / 5) + .004, lerp(.85, l - .1, k / 5), w * 1.6, .004, .014);
          box(bumper, black, 0, 1.0, l + .015, w * 1.8, .004, .01);
          for (let k = -2; k <= 2; k++) glowSprite(bumper, '#ff3a26', k * w * .42, 1.2, l + .06, .55, .3);
          box(chassis, basic('#9fd8ff'), 0, 1.79, -.36, w * .8, .012, .02);
          for (const s of [-1, 1]) {
            for (const zc of [-axle, axle]) {
              // 각진 펜더 — 바깥으로 비스듬히 나온 두툼한 판
              const pts = [0, .28, .72, 1].map(t => [s * (w + .015), TIRE_RADIUS + Math.sin(Math.PI * t) * .56, zc + Math.cos(Math.PI * t) * .62]);
              ribbon(flank[s], black, pts, pts.map(([x, y, z], i) => [x + s * .07, y + (i === 0 || i === 3 ? 0 : .14), z + (i === 0 ? .14 : i === 3 ? -.14 : 0)]));
            }
            box(chassis, steel, s * w * 1.02, 1.3, -.92, .06, .03, .1);
            box(flank[s], basic('#9fd8ff'), s * (w + .008), .45, 0, .006, .008, 2 * axle - 1.3);
            for (const z of [-.42, .45]) box(flank[s], black, s * (w + .006), .85, z, .008, .7, .01);
            box(flank[s], black, s * w * 1.0, .43, 0, .1, .05, 2.2);
            box(chassis, black, s * w * .96, 1.28, -.95, .05, .1, .14);
          }
          box(bumper, lamp, 0, 1.2, l + .02, w * 1.9, .022, .012);
          box(bumper, black, 0, .52, l + .03, w * 1.9, .2, .08);
          return { plateY: .82, tail: [.8, 1.2], head: [.7, .97, .05] };
        },
        wheel: { brake: '#333', rim: '#2a2c30', spokes: 6, disc: true, tread: true, slot: '#8d949c', slotR: .17, slotL: .15, slotW: .06, slotTwist: .5, nut: '#9fd8ff' },
      };
    },
    // 9 루나 포드 — 미래형 전기 콘셉트(운영자 참고 사진): 하얀 한 덩어리 몸, 앞바퀴 위까지 내려온 큰 유리, 가운데 빛나는 고리 얼굴, 구리색 아래 테, 빛나는 휠 커버
    pod(w, l, axle) {
      const main = [[-l - .1, w * .72, .24, .5, .7], [-l + .15, w * .9, .2, .66, .78], [-axle, w * .94, .2, .76, .8], [-.8, w * .96, .2, .82, .82],
        [.4, w * .96, .2, .86, .84], [axle, w * .94, .2, .9, .86], [l - .1, w * .88, .26, .9, .86], [l, w * .78, .36, .84, .86]];
      const surface = wheelArches(main, axle, { front: .01, rear: .01, flare: .04, lip: .02 });
      const bubble = [[-1.62, w * .76, .7, .78, .9], [-1.0, w * .8, .76, 1.18, .72], [-.2, w * .8, .8, 1.46, .66], [.7, w * .76, .82, 1.44, .66], [1.5, w * .6, .84, 1.2, .72], [l - .2, w * .4, .86, .98, .8]];
      return {
        surface, body: loft(surface, true), glass: '#3e5f88', roofMat: 'paint', glow: '#5a8cff',
        cabin: loft(densify(bubble), true),
        roof: loft(densify([[-.15, w * .5, 1.43, 1.485, .8], [.75, w * .46, 1.41, 1.465, .8], [1.3, w * .38, 1.28, 1.34, .8]]), true),
        front: -1.0, rear: 1.0, look: { pin: 0 }, paint: { iridescence: .55, roughness: .16, clearcoat: 1, clearcoatRoughness: .04 },
        dress({ chassis, frontPanel, bumper, wing, flank, lamp, paint }) {
          const halo = basic('#eaf4ff');
          const copper = standard('#c08a5a', .25, .85);
          const blue = basic('#5a8cff');
          piece(frontPanel, new T.TorusGeometry(.16, .018, 8, 40), halo, 0, .42, -l - .115);
          piece(frontPanel, new T.CircleGeometry(.05, 24), blue, 0, .42, -l - .12).rotation.y = Math.PI;
          box(frontPanel, blue, 0, .27, -l - .09, w * .9, .01, .012);
          glowSprite(frontPanel, '#cfe4ff', 0, .42, -l - .16, .55, .45);
          polyline(frontPanel, copper, [[-w * .66, .22, -l - .02], [-w * .3, .2, -l - .1], [w * .3, .2, -l - .1], [w * .66, .22, -l - .02]], .02);
          for (const s of [-1, 1]) {
            bar(frontPanel, halo, s * w * .66, .42, -l - .02, .012, .2, .012, 0, 0, s * .25);
            sideLine(flank[s], copper, s, z => at(surface, z, 1) + .012, -l + .25, .24, l - .2, .3, .022);
            // 몸 옆 파란 빛 띠 · 문 구리 선
            sideLine(flank[s], blue, s, z => at(surface, z, 1) + .014, -l + .4, .58, l - .35, .66, .012, 16);
            for (const z of [-.5, .5]) box(flank[s], copper, s * (at(surface, z, 1) + .01), .55, z, .006, .42, .01);
            glowSprite(chassis, '#3a6bff', s * w * .3, 1.0, -.1, .9, .35);
            for (const zc of [-axle, axle]) {
              const ring = piece(flank[s], new T.TorusGeometry(.2, .01, 6, 30), blue, s * (w + .03), TIRE_RADIUS, zc);
              ring.rotation.y = Math.PI / 2;
            }
            box(bumper, lamp, s * w * .5, .72, l + .02, w * .42, .022, .012);
            glowSprite(bumper, '#ff3a26', s * w * .5, .72, l + .06, .6, .3);
            piece(frontPanel, new T.TorusGeometry(.04, .008, 6, 18), blue, s * w * .62, .3, -l - .06);
          }
          box(bumper, standard('#121820', .2, .6), 0, .7, l + .004, w * 1.4, .12, .02);
          bar(wing, paint, 0, .9, l - .12, w * 1.4, .02, .14, -.15);
          box(bumper, copper, 0, .38, l + .02, w * 1.1, .015, .012);
          box(bumper, blue, 0, .62, l + .02, w * 1.2, .008, .012);
          return { plateY: .52, tail: [.5, .72], head: [0, .42, .08] };
        },
        wheel: { brake: '#5a8cff', rim: '#f2f2f0', spokes: 5, disc: true, lip: '#5a8cff', slot: '#5a8cff', slotGlow: true, slotR: .18, slotL: .13, slotW: .03, slotTwist: .6, nut: '#c08a5a' },
      };
    },
    // 6 헥사 팽 — 라임 하이퍼카: 아주 뾰족한 코, 빛나는 가는 눈매, 앞은 낮고 뒤로 올라가는 검은 아래 몸, 큰 옆 흡기구, 꼬리 지느러미, 육각 꼬리등
    hexa(w, l, axle) {
      const c = supercar(w, l, axle, {
        ...STRATO_FRONT, hip: .8,
        cabin: [[-1.1, w * .56, .56, .62, .95], [-.65, w * .56, .6, .92, .8], [-.15, w * .52, .64, 1.05, .72], [.4, w * .5, .66, 1.03, .72], [1.0, w * .44, .7, .88, .8], [1.5, w * .3, .74, .8, .9]],
        roof: [[-.2, w * .38, 1.01, 1.06, .85], [.4, w * .36, 1, 1.05, .85], [.8, w * .3, .9, .95, .85]],
      });
      return {
        ...c, glow: '#a8ff2a', front: -.9, rear: .9, look: { belt: [.42, .07], lower: '#16191b', pin: 0 }, paint: { metalness: 1, roughness: .07, clearcoat: 1, clearcoatRoughness: .03, envMapIntensity: 1.35 },
        dress({ chassis, frontPanel, bumper, wing, flank, lamp, paint }) {
          aeroKit({ chassis, frontPanel, bumper, flank, lamp }, c, w, l, axle, { accent: '#c4ff3a', crease: '#ffffff', trim: '#c4ff3a', intake: false });
          const lime = basic('#c4ff3a');
          const glow = basic('#ecffb0');
          for (const s of [-1, 1]) {
            onTop(frontPanel, grille, c.podF, s * (c.fx - .12), -l - .16, s * (c.fx + .1), -l + .3, .055);
            onTop(frontPanel, glow, c.podF, s * (c.fx - .1), -l - .14, s * (c.fx + .12), -l + .28, .018, .016);
            panel(flank[s], grille, [[s * c.edge(.05), .3, .05], [s * c.edge(1.15), .7, 1.15], [s * c.edge(1.18), .3, 1.18]]);
            sideLine(flank[s], lime, s, c.edge, .05, .3, 1.15, .7, .014, 8);
            panel(chassis, paint, [[s * w * .4, .98, .55], [s * w * .62, .92, l - .2], [s * w * .64, .82, l - .2], [s * w * .44, .8, .7]]);
            bar(chassis, grille, s * w * .76, .88, -.56, .16, .035, .07, 0, s * .3);
            for (const x of [.42, .74]) {
              hex(bumper, grille, s * w * x, .62, l + .012, .11, .05);
              hex(bumper, lamp, s * w * x, .62, l + .03, .095, .02, 0, x > .5);
            }
          }
          panel(chassis, paint, [[0, 1.02, .5], [0, 1.0, l - .02], [0, .8, l - .02], [0, .8, .95]]);
          box(chassis, lime, 0, 1.0, l - .03, .012, .012, .04);
          box(frontPanel, grille, 0, .2, -l - .1, w * .7, .03, .3);
          box(frontPanel, lime, 0, .3, c.tipZ - .012, w * .4, .01, .012);
          bar(wing, paint, 0, .84, l - .06, w * 1.7, .025, .18, -.24);
          const pipe = piece(bumper, new T.CylinderGeometry(.09, .09, .14, 6), trim, 0, .4, l);
          pipe.rotation.x = Math.PI / 2;
          hex(bumper, lime, 0, .4, l + .075, .095, .012);
          box(bumper, trim, 0, .25, l - .12, w * 1.55, .04, .44);
          for (let k = -3; k <= 3; k++) box(bumper, grille, k * w * .2, .32, l - .03, .03, .16, .28);
          return { plateY: .52, tail: [.58, .62], head: [.76, .5, -.05] };
        },
        wheel: { ...STRATO_WHEEL, brake: '#c4ff3a', rim: '#17191c', lip: '#c4ff3a', nut: '#c4ff3a' },
      };
    },
  };

  function build(car) {
    const w = car.width;
    const l = car.wheelbase / 2 + .62;
    const axle = car.wheelbase / 2;
    if (!cache.has(car.shape)) cache.set(car.shape, designs[car.shape](w, l, axle));
    const d = cache.get(car.shape);
    const paint = new T.MeshPhysicalMaterial({
      color: car.color, roughness: .24, metalness: .5, clearcoat: 1, clearcoatRoughness: .1, envMapIntensity: .95,
      side: T.DoubleSide, flatShading: !!d.flat, ...car.finish, ...d.paint,
    });
    const group = new T.Group(), chassis = new T.Group();
    const coachwork = d.body.clone();
    const finish = bodyFinish(T, paint, { w, l }, d.style ?? 4, d.stripe || '#111', d.look);
    const base = d.glass ? standard(d.glass, .06, .8) : glass;
    const glazing = glassFinish(T, base, { w, front: d.front, rear: d.rear }, crackedGlass);
    if (d.flat) glazing.material.flatShading = true;
    chassis.add(new T.Mesh(coachwork, finish.material), new T.Mesh(d.cabin, glazing.material), new T.Mesh(d.roof, d.roofMat === 'finish' ? finish.material : d.roofMat === 'paint' ? paint : d.roofMat || gloss));
    chassis.children.forEach(mesh => { mesh.castShadow = true; });
    group.add(chassis);
    const wheels = wheelSet(group, car, w, d.wheel);
    const lampMaterial = new T.MeshBasicMaterial({ color: '#ff4633', side: T.DoubleSide });
    const frontPanel = new T.Group(), bumper = new T.Group(), wing = new T.Group();
    const flank = { [-1]: new T.Group(), 1: new T.Group() };
    const marks = d.dress({ chassis, frontPanel, bumper, wing, flank, lamp: lampMaterial, paint: finish.material });
    if (d.glow) {
      // 산 차만의 표시 — 차 밑이 차 색 빛으로 은은하게(기존 4종에는 없음)
      const under = piece(chassis, new T.PlaneGeometry(w * 2.4, l * 2.15), new T.MeshBasicMaterial({ color: d.glow, map: glowTexture, opacity: .4, transparent: true, depthWrite: false, blending: T.AdditiveBlending }), 0, .03, 0);
      under.rotation.x = -Math.PI / 2;
      for (const s of [-1, 1]) box(flank[s], basic(d.glow), s * (w * .95 + .014), .2, 0, .012, .012, 2.2);
    }
    piece(bumper, cube, grille, 0, marks.plateY, l + .012, .4, .11, .02);
    piece(bumper, new T.PlaneGeometry(1, 1), modelPlate(car.plate), 0, marks.plateY, l + .024, .38, .1, 1);
    const glows = [-1, 1].map(s => glowSprite(chassis, '#ff321f', s * w * marks.tail[0], marks.tail[1], l + .07, .74, .23));
    for (const s of [-1, 1]) glowSprite(frontPanel, '#d6ecff', s * w * marks.head[0], marks.head[1], -l - .04 - (marks.head[2] || 0), .8, .3);
    const parts = {
      bumper: mount(chassis, bumper, 0, .35, l), wing: mount(chassis, wing, 0, .75, l - .3),
      frontPanel: mount(chassis, frontPanel, 0, .27, -l),
      flanks: { left: mount(chassis, flank[-1], -w * .93, .38, .06), right: mount(chassis, flank[1], w * .93, .38, .06) },
    };
    group.userData = {
      chassis, wheels, lampMaterial, glows, signals: [], ...parts,
      crumple: crumpling(coachwork, { w, l }), finish, glazing,
    };
    return group;
  }

  return { has: shape => shape in designs, build };
}
