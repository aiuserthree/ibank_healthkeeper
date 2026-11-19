// 주는 것: buildWorld(세계, 구운 것, 재질 통, 등록) → THREE.Group — 생성 결과(정적 묶음 · 인스턴스 · 과녁 조각)를 그릴 물체로 감싼다. matNames(세계) = 그 세계가 쓰는 재질 이름들.
// 받는 것: 세계(shared/gen — 바뀌지 않는다. 형식 배열을 복사하지 않고 그대로 속성으로 올린다) · 구운 것(shared/bake: vlight 7바이트 · ilight · plight 5바이트) · tune/gfx.bake · 전역 THREE.
// 구운 빛을 올리는 법(7 · 5바이트는 4 의 배수가 아니라 바이트 넷짜리 속성 셋으로 다시 싼다 — shader.glsl.js 머리 주석):
//   aA = 얼룩 · 그늘 · 주된 축 · 발광 무게(생성의 col · axis) / aB = 하늘 열림 · 늘 켜진 등불 RGB / aC = 해 가림 · 스위치 묶음 번호 · 그 묶음의 세기.
//   정적 묶음은 꼭짓점마다, 인스턴스는 줄마다(같은 이름의 인스턴스 속성), 과녁 조각은 조각의 5바이트를 모든 꼭짓점에 채운다(움직이지 않는 동안 — 깨지면 view 가 지운다: F4c).
// 빛나는 부분(재질 glow · 밝은 색조의 glass)은 가까운 등불을 찾아 「제 등불의 묶음 번호」를 aC 에 적는다 — 스위치를 끄거나 등롱이 깨지면 알과 유리도 같이 꺼진다(늘 켜진 등불이면 번호 255 = 늘 켜짐).
import { GFX } from '../../shared/tune/gfx.js';

const NONE = 255;
const u8 = (array) => new THREE.BufferAttribute(array, 4, true);
const lum = (t) => 0.3 * t[0] + 0.59 * t[1] + 0.11 * t[2];

export function matNames(world) {
  const out = new Set();
  for (const b of world.batches) out.add(b.mat);
  for (const p of world.protos) out.add(p.mat);
  for (const prop of world.props) for (const part of prop.parts) out.add(part.mat);
  return [...out].sort();
}

// 발광 무게(0 ~ 255): 빛나는 알은 전부, 불 켜진 유리(밝은 색조)는 조금, 그 밖은 0
function emit(part) { return part.mat === 'glow' ? 255 : part.mat === 'glass' && lum(part.tint) > 0.5 ? Math.round(255 * GFX.bake.glass) : 0; }

// 점 (x, y, z) 에서 link 안의 가장 가까운 등불의 묶음 번호(늘 켜진 등불 · 못 찾으면 NONE)
function lampGroup(lights, x, y, z) {
  let best = -1, near = GFX.bake.link * GFX.bake.link;
  for (let k = 0; k < lights.length; k++) {
    const at = lights[k].at, d = (at[0] - x) * (at[0] - x) + (at[1] - y) * (at[1] - y) + (at[2] - z) * (at[2] - z);
    if (d < near) { near = d; best = k; }
  }
  return best < 0 || lights[best].mode === 'on' ? NONE : lights[best].group;
}

// part 의 형상. vlight = 꼭짓점 빛 7바이트(정적 묶음) · five = [배열, 자리](과녁 조각 — 5바이트를 모든 꼭짓점에) · 둘 다 없으면 aB · aC 를 안 단다(인스턴스 원형).
//   group = 빛나는 부분의 묶음 번호를 주는 함수(꼭짓점 번호 → 번호)
function geometryOf(part, vlight, five, group, add) {
  const n = part.pos.length / 3, A = new Uint8Array(n * 4), g = add(new THREE.BufferGeometry()), glow = emit(part);
  const B = vlight || five ? new Uint8Array(n * 4) : null, C = B ? new Uint8Array(n * 4) : null;
  for (let v = 0; v < n; v++) {
    const o = v * 4;
    A[o] = part.col[o]; A[o + 1] = part.col[o + 3]; A[o + 2] = part.axis[v]; A[o + 3] = glow;
    if (vlight) { const s = v * 7; B[o] = vlight[s]; B[o + 1] = vlight[s + 1]; B[o + 2] = vlight[s + 2]; B[o + 3] = vlight[s + 3]; C[o] = vlight[s + 4]; C[o + 1] = vlight[s + 5]; C[o + 2] = vlight[s + 6]; }
    else if (five) { const [L, s] = five; B[o] = L[s]; B[o + 1] = L[s + 1]; B[o + 2] = L[s + 2]; B[o + 3] = L[s + 3]; C[o] = L[s + 4]; C[o + 1] = NONE; }
    if (glow && C) { C[o + 1] = group(v); C[o + 2] = 0; }
  }
  g.setAttribute('position', new THREE.BufferAttribute(part.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(part.nor, 3));
  g.setAttribute('aA', u8(A));
  if (B) { g.setAttribute('aB', u8(B)); g.setAttribute('aC', u8(C)); }
  if (part.lay) g.setAttribute('aLay', u8(part.lay));
  g.setIndex(new THREE.BufferAttribute(part.idx, 1));
  return g;
}

export function buildWorld(world, baked, mats, add) {
  const root = new THREE.Group(), L = world.lights, dummy = new THREE.Object3D();
  root.matrixAutoUpdate = false;
  world.batches.forEach((b, k) => {
    const mesh = new THREE.Mesh(geometryOf(b, baked.vlight[k], null, (v) => lampGroup(L, b.pos[v * 3], b.pos[v * 3 + 1], b.pos[v * 3 + 2]), add), mats.get(b.mat, b.tint, 'world'));
    mesh.matrixAutoUpdate = false; mesh.name = 'batch:' + b.mat;
    root.add(mesh);
  });
  world.instances.forEach((group, k) => {
    const proto = world.protos[group.proto], count = group.xf.length / 8, five = baked.ilight[k];
    if (!count) return;
    const g = geometryOf(proto, null, null, null, add), B = new Uint8Array(count * 4), C = new Uint8Array(count * 4);
    const mesh = new THREE.InstancedMesh(g, mats.get(proto.mat, proto.tint, 'own'), count);
    for (let i = 0; i < count; i++) {
      const [x, y, z, rx, ry, rz, s, tall] = group.xf.subarray(i * 8, i * 8 + 8), o = i * 4, f = i * 5;
      dummy.position.set(x, y, z); dummy.rotation.set(rx, ry, rz); dummy.scale.set(s, tall, s); dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      B[o] = five[f]; B[o + 1] = five[f + 1]; B[o + 2] = five[f + 2]; B[o + 3] = five[f + 3]; C[o] = five[f + 4]; C[o + 1] = NONE;
    }
    g.setAttribute('aB', new THREE.InstancedBufferAttribute(B, 4, true)); g.setAttribute('aC', new THREE.InstancedBufferAttribute(C, 4, true));
    mesh.matrixAutoUpdate = false; mesh.name = 'inst:' + proto.name;
    // 인스턴스 묶음을 통째로 거르는 경계는 three 가 줄들의 자리에서 센다(낱 줄을 거르는 일은 뒤 단계 — tdd §5-6). 묶음을 지울 때 인스턴스 버퍼도 같이 놓는다
    add(mesh);
    root.add(mesh);
  });
  world.props.forEach((prop, k) => {
    const target = world.marks.targets.find((t) => t.prop === k), light = target && target.light >= 0 ? L[target.light] : null, own = light && light.mode !== 'on' ? light.group : NONE;
    for (const part of prop.parts) {
      const mesh = new THREE.Mesh(geometryOf(part, null, [baked.plight, k * 5], () => own, add), mats.get(part.mat, part.tint, 'own'));
      mesh.position.set(prop.at[0], prop.at[1], prop.at[2]); mesh.rotation.set(0, prop.yaw, prop.lean); mesh.updateMatrix();
      mesh.matrixAutoUpdate = false; mesh.name = 'prop:' + prop.piece;
      root.add(mesh);
    }
  });
  root.updateMatrixWorld(true);
  return root;
}
