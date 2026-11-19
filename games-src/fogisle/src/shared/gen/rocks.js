// 주는 것: 바위 — rockProtos(원형 9종: 공 → 잡음으로 부풀림 → 무작위 평면으로 깎아 각진 면) · scatterRocks(레시피의 흩기 한 줄을 세계에 놓는다).
// 받는 것: shapes · mesh · noise · rng · terrain · build · tune/world. 크기(size)는 바위의 대략 지름(m)이다.
//   staticOver(2m)를 넘는 바위는 정적 묶음에 넣고(꼭짓점마다 빛을 굽는다 — F1b) 그 아래만 인스턴스다. collideOver(0.8m)부터 충돌에 들어간다.
//   인스턴스 한 줄 = 수 8개: x · y · z · rx · ry · rz(오일러 XYZ) · 크기 · 세로 크기 — 변환은 shapes.xf(x, y, z, rx, ry, rz, 크기, 세로 크기, 크기).
// 흩기 한 줄 = { what: 'rocks', region: 띠 이름(tune 의 band), n, size: [작은, 큰] }. 길 · 표식 · 조각 자리(G.keep)는 비워 둔다.
import { TAU, dsin, dcos } from '../dmath.js';
import { makeRng, rngNext, rngInt, seedFrom } from '../rng.js';
import { lerp, sstep, fbm3 } from '../geom/noise.js';
import { ico, xf } from '../geom/shapes.js';
import { shade, placeMesh } from '../geom/mesh.js';
import { heightAt, zAtU, pathDist } from './terrain.js';
import { addMesh, addSolid, makePart, SURF } from './build.js';
import { WORLD } from '../tune/world.js';

const TINT = [0.86, 0.87, 0.88];

export function rockProtos(salt) {
  const R = WORLD.rock, out = [];
  for (let kind = 0; kind < R.kinds; kind++) {
    const rng = makeRng(seedFrom(salt, 'rock' + kind)), soup = ico(kind < R.bigKinds ? R.detailBig : R.detailSmall), planes = [], o = kind * 17.3;
    for (let i = 5 + rngInt(rng, 5); i > 0; i--) {
      const a = rngNext(rng) * TAU, y = rngNext(rng) * 1.6 - 0.8, s = Math.sqrt(1 - Math.min(0.99, y * y));
      planes.push([dcos(a) * s, y, dsin(a) * s, 0.62 + rngNext(rng) * 0.3]);
    }
    const sx = 0.8 + rngNext(rng) * 0.6, sy = 0.55 + rngNext(rng) * 0.5, sz = 0.8 + rngNext(rng) * 0.6;
    for (let i = 0; i < soup.length; i += 3) {
      const b = R.bulgeBase + R.bulge * fbm3(soup[i] * 1.1 + o, soup[i + 1] * 1.1, soup[i + 2] * 1.1, 3, salt);
      let x = soup[i] * b, y = soup[i + 1] * b, z = soup[i + 2] * b;
      for (const p of planes) {
        const over = x * p[0] + y * p[1] + z * p[2] - p[3];
        if (over > 0) { x -= p[0] * over * R.cut; y -= p[1] * over * R.cut; z -= p[2] * over * R.cut; }
      }
      const f = 1 + R.grit * (fbm3(x * 5 + o, y * 5, z * 5, 2, salt) - 0.5);
      soup[i] = x * sx * f; soup[i + 1] = y * sy * f; soup[i + 2] = z * sz * f;
    }
    // 밑동을 어둡게(그늘 칸) — 인스턴스는 꼭짓점마다 빛을 구울 수 없어 원형에 넣어 둔다
    const mesh = shade(soup, 35), dark = new Float32Array(mesh.pos.length / 3);
    for (let v = 0; v < dark.length; v++) dark[v] = R.baseDark + (1 - R.baseDark) * sstep(-0.55, 0.25, mesh.pos[v * 3 + 1]);
    out.push({ name: 'rock' + kind, mesh, dark, part: makePart('rock', mesh, { tint: TINT, shade: dark }) });
  }
  return out;
}

function blocked(G, x, z, r) {
  const T = G.T, e = WORLD.edge;
  if (x < T.x0 + e || x > T.x0 + T.w - e || z < T.z0 + e || z > T.z0 + T.d - e || pathDist(T, x, z) < r) return true;
  for (const k of G.keep) {
    const dx = k[2] - k[0], dz = k[3] - k[1], l2 = dx * dx + dz * dz, t = l2 > 0 ? Math.min(1, Math.max(0, ((x - k[0]) * dx + (z - k[1]) * dz) / l2)) : 0;
    const px = x - k[0] - dx * t, pz = z - k[1] - dz * t;
    if (px * px + pz * pz < (k[4] + r) * (k[4] + r)) return true;
  }
  return false;
}

// 바위 하나의 생김새를 정하는 난수 다섯(돌림 셋 · 세로 크기 · 원형 고르기)
function roll(rng) { return [rngNext(rng) * TAU, rngNext(rng) - 0.5, rngNext(rng) - 0.5, 0.75 + rngNext(rng) * 0.6, rngNext(rng)]; }

function putRock(G, look, x, z, size, sink, ground = heightAt(G.T, x, z)) {
  const R = WORLD.rock, ry = look[0], rx = look[1] * 2 * R.tilt, rz = look[2] * 2 * R.tilt, tall = look[3];
  if (blocked(G, x, z, size / 2)) return false;
  const big = size >= R.smallUnder, kind = big ? Math.floor(look[4] * R.bigKinds) : R.bigKinds + Math.floor(look[4] * (R.kinds - R.bigKinds));
  const s = size / R.unit, y = ground - size * sink, proto = G.protos[kind];
  if (size > R.staticOver) {
    addMesh(G.B, 'rock', placeMesh(proto.mesh, xf(x, y, z, rx, ry, rz, s, s * tall, s)), { tint: TINT, shade: proto.dark, solid: SURF.indexOf('rock') });
    G.count.staticRocks += 1;
  } else {
    G.inst[kind].push(x, y, z, rx, ry, rz, s, s * tall);
    if (size >= R.collideOver) addSolid(G.B, placeMesh(proto.mesh, xf(x, y, z, rx, ry, rz, s, s * tall, s)), SURF.indexOf('rock'));
  }
  return true;
}

// 난수는 바위마다 늘 같은 수만큼 쓴다(자리가 막혀 버려지는 바위 · 안 생기는 잔돌에도) — 레시피에 조각을 더해 몇 개가 비켜나도 다른 바위는 그대로다
export function scatterRocks(G, item, index) {
  const R = WORLD.rock, band = WORLD.band[item.region], T = G.T, rng = makeRng(seedFrom(G.salt, 'scatter' + index)), face = item.region === 'face';
  for (let i = 0; i < item.n; i++) {
    const x = T.x0 + rngNext(rng) * T.w, u = lerp(band.near, band.far, rngNext(rng)), t = rngNext(rng), size = lerp(item.size[0], item.size[1], t * t);
    const z = zAtU(T, x, u), litter = rngNext(rng) < R.kidChance && size >= R.smallUnder && !face;      // 절벽 면에는 잔돌을 두지 않는다(벽에 붙어 떠 보인다)
    // 절벽 면의 바위는 오르막 쪽으로 파묻는다(밑으로만 묻으면 벽에 매달린 공처럼 보인다) — 면에서 불거진 턱이 된다
    const gx = heightAt(T, x + 1, z) - heightAt(T, x - 1, z), gz = heightAt(T, x, z + 1) - heightAt(T, x, z - 1), gl = Math.sqrt(gx * gx + gz * gz) || 1, dig = face ? R.faceDig * size : 0;
    const placed = putRock(G, roll(rng), x + gx / gl * dig, z + gz / gl * dig, size, face ? R.faceSink : R.sink, heightAt(T, x, z));
    for (let k = 0; k < R.kids; k++) {
      const kx = x + (rngNext(rng) - 0.5) * 2 * R.kidSpread * size, kz = z + (rngNext(rng) - 0.5) * 2 * R.kidSpread * size, ks = lerp(R.kidLo, R.kidHi, rngNext(rng)), look = roll(rng);
      if (placed && litter) putRock(G, look, kx, kz, ks, R.sink);
    }
  }
}
