// 주는 것: 바위 — rockProtos(원형 9종: 공 → 잡음으로 부풀림 → 무작위 평면으로 깎아 각진 면) · scatterRocks(레시피의 흩기 한 줄을 세계에 놓는다).
// 받는 것: shapes · mesh · noise · rng · terrain · build · tune/world. 크기(size)는 바위의 대략 지름(m)이다.
//   staticOver(2m)를 넘는 바위는 정적 묶음에 넣고(꼭짓점마다 빛을 굽는다 — F1b) 그 아래만 인스턴스다. collideOver(0.8m)부터 충돌에 들어간다.
//   인스턴스 한 줄 = 수 8개: x · y · z · rx · ry · rz(오일러 XYZ) · 크기 · 세로 크기 — 변환은 shapes.xf(x, y, z, rx, ry, rz, 크기, 세로 크기, 크기).
// 흩기 한 줄 = { what: 'rocks', region: 띠 이름(tune 의 band), n, size: [작은, 큰] }. 길 · 표식 · 조각 자리(G.keep)는 비워 둔다.
// 높이는 「민 뒤의 땅」(그리는 지형 · 충돌과 같은 면 — build.js 의 groundAt)에서 잡고, 놓은 뒤 꼭짓점을 그 땅과 견줘 박힌 정도를 본다(fit):
//   땅속 꼭짓점이 biteMin 보다 적으면 뜬 것, 땅 위 꼭짓점이 showMin 보다 적으면 통째로 묻힌 것 — 위아래로 옮겨 맞추고, 못 맞추면 그 바위는 버린다.
// 가파른 면(놓는 자리의 땅이 restFlat 보다 가파른 곳)과 턱 끝(둘레의 땅이 perchMax × 크기 넘게 꺼지는 곳 — 좁은 선반 · 벼랑 끝)에는 크든 작든 바위를 두지 않는다 —
//   벽에 붙은 돌 · 매달린 돌로 보인다. 절벽의 덩어리감은 지형(가로 밀기 · 지층 턱)과 발치의 바위가 맡는다. 그래서 절벽 면 띠(face)의 바위는 넓은 선반에
//   떨어진 것만 남는다. 발치에서 절벽에 기댄 큰 바위는 밑이 평지고 둘레의 땅이 꺼지지 않으니(절벽 쪽은 솟는다) 그대로다.
import { TAU, dsin, dcos } from '../dmath.js';
import { makeRng, rngNext, rngInt, seedFrom } from '../rng.js';
import { lerp, sstep, fbm3 } from '../geom/noise.js';
import { ico, xf } from '../geom/shapes.js';
import { shade, placeMesh } from '../geom/mesh.js';
import { heightAt, zAtU, pathDist } from './terrain.js';
import { addMesh, addSolid, makePart, groundAt, groundFlat, groundHits, SURF } from './build.js';
import { WORLD } from '../tune/world.js';

const TINT = Object.freeze([0.86, 0.87, 0.88]);
const byValue = (a, b) => a - b;

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

// 변환 M 으로 놓은 바위(mesh)의 꼭짓점을 땅과 견준다 → 땅속 꼭짓점의 수. 꼭짓점 위로 지형 면이 홀수 번 있으면 땅속이다(처마 밑은 땅속이 아니다).
//   gaps = 땅 위 꼭짓점마다 바로 밑의 땅까지 거리(밑에 땅이 없으면 무한대) · deeps = 땅속 꼭짓점마다 바로 위의 땅까지 깊이
function bite(B, mesh, M, gaps, deeps) {
  const P = mesh.pos, H = B.hits;
  let inside = 0;
  gaps.length = 0; deeps.length = 0;
  for (let v = 0; v < P.length; v += 3) {
    const x = M[0] * P[v] + M[1] * P[v + 1] + M[2] * P[v + 2] + M[3], y = M[4] * P[v] + M[5] * P[v + 1] + M[6] * P[v + 2] + M[7], z = M[8] * P[v] + M[9] * P[v + 1] + M[10] * P[v + 2] + M[11];
    const n = groundHits(B, x, z);
    let above = 0, roof = Infinity, floor = -Infinity;
    for (let k = 0; k < n; k++) {
      const h = H[k * 3];
      if (h > y) { above++; roof = Math.min(roof, h); } else floor = Math.max(floor, h);
    }
    if (above & 1) { inside++; deeps.push(roof - y); } else gaps.push(y - floor);
  }
  return inside;
}

// (x, y, z)에 놓을 바위가 땅에 알맞게 박혔는지 본다 → 놓을 높이(못 맞추면 null). 땅속 꼭짓점이 biteMin 이상 · 땅 위 꼭짓점이 showMin 이상이어야 한다.
//   떴으면 모자란 꼭짓점이 땅에 닿을 만큼 내리고, 통째로 묻혔으면 모자란 꼭짓점이 나올 만큼 올린다(settleTries 번까지). settleMax × 크기를 넘게 옮겨야 하면 버린다
//   (벼랑 끝에서 반쯤 허공에 걸린 돌 · 절벽 속 깊이 든 돌).
function fit(G, mesh, x, y, z, turn, size) {
  const R = WORLD.rock, n = mesh.pos.length / 3, needIn = Math.ceil(R.biteMin * n), needOut = Math.ceil(R.showMin * n), gaps = [], deeps = [];
  for (let tries = 0, at = y; ; tries++) {
    const inside = bite(G.B, mesh, xf(x, at, z, turn[0], turn[1], turn[2], turn[3], turn[4], turn[3]), gaps, deeps);
    if (inside >= needIn && n - inside >= needOut) return at;
    if (tries >= R.settleTries) return null;
    if (inside < needIn) at -= gaps.sort(byValue)[needIn - inside - 1] + R.settlePad; else at += deeps.sort(byValue)[needOut - (n - inside) - 1] + R.settlePad;
    if (!(Math.abs(at - y) <= R.settleMax * size)) return null;
  }
}

// 턱 끝에 걸쳤는가: 바위 둘레(반지름 = 크기의 반) 여덟 곳 가운데 땅이 가운데보다 perchMax × 크기 넘게 꺼진 곳이 있다(땅이 없는 곳도 꺼진 것으로 본다)
function perched(G, x, z, ground, size) {
  for (let k = 0; k < 8; k++) {
    const a = TAU * k / 8, around = groundAt(G.B, x + dcos(a) * size / 2, z + dsin(a) * size / 2, ground);
    if (around === null || ground - around > WORLD.rock.perchMax * size) return true;
  }
  return false;
}

// 바위 하나를 놓는다(놓았으면 true): 그 자리 수직선의 땅에서 sink × 크기만큼 묻고, 뜨거나 묻히면 위아래로 옮겨 맞춘다. 가파른 면 · 턱 끝이면 안 놓는다.
//   수 보고: rocksMoved = 높이를 옮겨 놓은 바위 · rocksSteep = 가파른 면 · 턱 끝이라 버린 바위 · rocksDropped = 뜨거나 묻혀 끝내 못 놓은 바위
//   (길 · 표식 · 조각 자리에 막혀 안 놓은 것은 세지 않는다).
function putRock(G, look, x, z, size) {
  const R = WORLD.rock, big = size >= R.smallUnder, kind = big ? Math.floor(look[4] * R.bigKinds) : R.bigKinds + Math.floor(look[4] * (R.kinds - R.bigKinds));
  const proto = G.protos[kind], s = size / R.unit, turn = [look[1] * 2 * R.tilt, look[0], look[2] * 2 * R.tilt, s, s * look[3]];
  const before = heightAt(G.T, x, z), ground = groundAt(G.B, x, z, before);
  if (ground === null || blocked(G, x, z, size / 2)) return false;
  if (groundFlat(G.B, x, z, before) < R.restFlat || perched(G, x, z, ground, size)) { G.count.rocksSteep += 1; return false; }
  const y = fit(G, proto.mesh, x, ground - size * R.sink, z, turn, size);
  if (y === null) { G.count.rocksDropped += 1; return false; }
  if (y !== ground - size * R.sink) G.count.rocksMoved += 1;
  const T = xf(x, y, z, turn[0], turn[1], turn[2], turn[3], turn[4], turn[3]);
  if (size > R.staticOver) {
    addMesh(G.B, 'rock', placeMesh(proto.mesh, T), { tint: TINT, shade: proto.dark, solid: SURF.indexOf('rock') });
    G.count.staticRocks += 1;
  } else {
    G.inst[kind].push(x, y, z, turn[0], turn[1], turn[2], turn[3], turn[4]);
    if (size >= R.collideOver) addSolid(G.B, placeMesh(proto.mesh, T), SURF.indexOf('rock'));
  }
  return true;
}

// 흩기 한 줄. nth = 같은 띠의 줄 가운데 몇 번째인가 — 난수 씨앗을 「띠의 번호(tune 의 band 표에서의 차례) + 띠 수 × nth」에서 뽑는다(레시피 안의 차례가 아니다):
//   다른 띠의 줄을 앞에 끼워도 이 줄의 바위는 그대로고, 수(n)를 늘리면 있던 바위는 그대로 두고 뒤에 더 놓인다. band 표에 띠를 더할 때는 맨 뒤에 더한다.
// 난수는 바위마다 늘 같은 수만큼 쓴다(자리가 막혀 버려지는 바위 · 안 생기는 잔돌에도) — 레시피에 조각을 더해 몇 개가 비켜나도 다른 바위는 그대로다.
export function scatterRocks(G, item, nth) {
  const R = WORLD.rock, bands = Object.keys(WORLD.band), band = WORLD.band[item.region], T = G.T, face = item.region === 'face';
  const rng = makeRng(seedFrom(G.salt, 'scatter' + (bands.indexOf(item.region) + bands.length * nth)));
  if (!(item.n <= WORLD.range.count[1])) throw new Error(`흩기 ${item.region} 의 수 n = ${String(item.n)} — ${WORLD.range.count[1]} 이하의 수여야 한다`);
  for (let i = 0; i < item.n; i++) {
    const x = T.x0 + rngNext(rng) * T.w, u = lerp(band.near, band.far, rngNext(rng)), t = rngNext(rng), size = lerp(item.size[0], item.size[1], t * t), z = zAtU(T, x, u);
    // 절벽 면에는 잔돌을 두지 않는다(벽에 붙어 떠 보인다)
    const litter = rngNext(rng) < R.kidChance && size >= R.smallUnder && !face, placed = putRock(G, roll(rng), x, z, size);
    for (let k = 0; k < R.kids; k++) {
      const kx = x + (rngNext(rng) - 0.5) * 2 * R.kidSpread * size, kz = z + (rngNext(rng) - 0.5) * 2 * R.kidSpread * size;
      const ks = lerp(R.kidLo, R.kidHi, rngNext(rng)), look = roll(rng);
      if (placed && litter) putRock(G, look, kx, kz, ks);
    }
  }
}
