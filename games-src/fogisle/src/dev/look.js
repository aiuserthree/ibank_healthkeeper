// 주는 것: 그리기의 개발 손잡이(개발판 전용 — dev/fg.js 가 __fg 에 얹는다) — LOOK = { gfx() 수 보고 · station(책갈피) · cam(x, y, z, 요°, 피치°) · grab([w, h]) → PNG 주소 글 ·
//   sw(묶음, 켜진 정도) · swatch(켬) 재질 견본 판 · modes() 방식 다섯의 컴파일 확인 · remake(n) 세계를 지우고 다시 세우기 · bench(책갈피들) 화소 기울기 계측 } + 자유 비행(주소 ?dev=1 — WASD · Space · C).
// 받는 것: app/ctx · view/gfx(문과 안쪽 — 개발판은 안쪽을 봐도 된다) · app/assets(견본 판이 무늬 12장을 다 받는다) · tune/gfx · 전역 THREE.
// 재질 견본 판: 바다 쪽 먼 하늘(안개가 옅은 높이 — tune 의 swatch.at)에 칸마다 「공(제 좌표) + 받침(세 방향)」을 무늬 12장(한 줄에 여섯 · 두 단) × 마른 것(뒷줄) · 젖은 것(앞줄)로 놓고,
//   맨 뒷줄에 지형 겹 받침 · 인스턴스 바위 · 스키닝 기둥 · 평범(유리 · 고무 · 빛나는 알) · 움직이는 것의 조명(빛 격자 uniform)을 둔다 — 방식 다섯이 한 장에 다 선다. 길(정식 · 값싼)은 주소의 ?q= 가 정한다.
// 캡처는 grab 으로 캔버스의 화소를 그대로 얻는다(DOM 덮개 · HUD 가 안 섞인다 · 타이틀에서도 된다). 계측은 view/gfx/measure 의 「n 프레임 + 1픽셀」과 GPU 시간 질의.
import { CTX } from '../app/ctx.js';
import { loadAssets } from '../app/assets/load.js';
import { TEX_KEYS } from '../app/assets/table.js';
import { gfxDraw, gfxResize, gfxInfo, gfxSwitch, gfxParts, gfxLoad, gfxWorld, gfxNeeds, gfxUnload, gfxCompile, gfxDynLight } from '../view/gfx/index.js';
import { makeSurfaces } from '../view/gfx/surface.js';
import { makeTextures } from '../view/gfx/tex.js';
import { GFX } from '../shared/tune/gfx.js';

const DEG = Math.PI / 180, WHITE = [1, 1, 1];
const B = { root: null, mats: null, was: null, list: [] };

function taint() { CTX.tainted = true; document.documentElement.dataset.fgTaint = '1'; }
function draw() { const e = CTX.eye; gfxDraw(e[0], e[1], e[2], e[3] + CTX.look.yaw, e[4] + CTX.look.pitch); }
const u8 = (rows, n) => { const a = new Uint8Array(n * 4); for (let v = 0; v < n; v++) a.set(rows(v), v * 4); return new THREE.BufferAttribute(a, 4, true); };

// 견본에 쓸 형상: 구운 빛 대신 「트인 하늘 아래」 값을 꼭짓점에 채운다(얼룩 · 그늘 없음 · 주된 축은 법선에서)
function dress(g, lay) {
  const n = g.attributes.position.count, N = g.attributes.normal;
  const axis = (v) => { const x = Math.abs(N.getX(v)), y = Math.abs(N.getY(v)), z = Math.abs(N.getZ(v)); return y >= x && y >= z ? 1 : x >= z ? 0 : 2; };
  g.setAttribute('aA', u8((v) => [255, 255, axis(v), 0], n));
  g.setAttribute('aB', u8(() => [255, 0, 0, 0], n)); g.setAttribute('aC', u8(() => [255, 255, 0, 0], n));
  if (lay) g.setAttribute('aLay', u8(lay, n));
  return g;
}

// 무늬 이름 → 재질 표의 그 무늬를 쓰는 줄(없으면 바위 줄에 무늬만 바꿔서)
function cfgOf(key) {
  const S = GFX.surf, hit = Object.keys(S).find((k) => S[k].mode === 'tri' && S[k].a === key);
  if (hit) return S[hit];
  return { ...S.rock, a: key, scale: key === 'pebbles' ? S.ground.scaleB : key === 'turf' ? S.ground.scaleC : S.rock.scale, base: WHITE };
}

function buildBoard(tex) {
  const P = gfxParts(), C = GFX.swatch, root = new THREE.Group(), keep = [], add = (x) => { keep.push(x); return x; };
  const mats = makeSurfaces({ lean: P.lean, tex, env: GFX.sky.dawn.gain * GFX.sky.dawn.env, add }), put = (mesh, x, y, z) => { mesh.position.set(x, y, z); root.add(mesh); return mesh; };
  const ball = add(dress(new THREE.SphereGeometry(C.ball, 40, 24))), slab = add(dress(new THREE.BoxGeometry(C.slab, 0.3, C.slab, 4, 1, 4)));
  TEX_KEYS.forEach((key, i) => {
    const x = (i % C.cols - (C.cols - 1) / 2) * C.cell, bank = Math.floor(i / C.cols), cfg = cfgOf(key);
    [0, 1].forEach((wet) => {
      const z = (bank * 2 + wet) * C.cell, one = { ...cfg, wet: wet ? 1 : 0 };
      put(new THREE.Mesh(slab, mats.custom(one, cfg.base, 'world', wet)), x, 0, z);
      put(new THREE.Mesh(ball, mats.custom(one, cfg.base, 'own', wet)), x, 0.15 + C.ball, z);
    });
  });
  // 맨 뒷줄: 지형 겹(왼쪽 = 자갈 · 오른쪽 = 풀 · 앞쪽 = 젖음) · 인스턴스 바위 · 스키닝 기둥 · 평범 셋 · 움직이는 것
  const z3 = -1.15 * C.cell, w = C.cell * 2, half = w / 2;
  const land = add(dress(new THREE.BoxGeometry(w, 0.3, C.slab, 24, 1, 8), null));
  land.setAttribute('aLay', u8((v) => { const x = land.attributes.position.getX(v), z = land.attributes.position.getZ(v); return [x < -half / 3 ? 255 : 0, x > half / 3 ? 255 : 0, z > 0 ? 255 : 0, 255]; }, land.attributes.position.count));
  put(new THREE.Mesh(land, mats.custom(GFX.surf.ground, WHITE, 'world')), -2 * C.cell, 0, z3);
  const rock = add(dress(new THREE.IcosahedronGeometry(0.6, 1))), inst = add(new THREE.InstancedMesh(rock, mats.custom(GFX.surf.rock, GFX.surf.rock.base, 'own'), 3)), dummy = new THREE.Object3D();
  rock.deleteAttribute('aB'); rock.deleteAttribute('aC');
  rock.setAttribute('aB', new THREE.InstancedBufferAttribute(new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0]), 4, true));
  rock.setAttribute('aC', new THREE.InstancedBufferAttribute(new Uint8Array([255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0]), 4, true));
  [[-0.9, 0.5, 0.9, 0.4], [0, 0.75, 1.5, 1.3], [1, 0.45, 0.7, 2.4]].forEach(([x, y, s, r], i) => { dummy.position.set(x, y, 0); dummy.rotation.set(r, r * 2, 0); dummy.scale.set(s, s * 0.8, s); dummy.updateMatrix(); inst.setMatrixAt(i, dummy.matrix); });
  put(inst, -0.45 * C.cell, 0, z3);
  // 스키닝: 뼈 둘짜리 기둥을 가운데에서 꺾는다(제 좌표로 입혀 무늬가 꺾임을 따라간다)
  const post = add(new THREE.CylinderGeometry(0.22, 0.26, 1.8, 16, 8)), pn = post.attributes.position.count, skin = new THREE.SkinnedMesh(post, mats.custom(cfgOf('burlap'), GFX.surf.hemp.base, 'dyn'));
  const b0 = new THREE.Bone(), b1 = new THREE.Bone();
  post.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(pn * 4).map((_, k) => (k % 4 === 1 ? 1 : 0)), 4));
  post.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array(pn * 4).map((_, k) => { const t = Math.min(1, Math.max(0, post.attributes.position.getY(k >> 2) / 0.9 + 0.5)); return k % 4 === 0 ? 1 - t : k % 4 === 1 ? t : 0; }), 4));
  dress(post); b0.add(b1); skin.add(b0); skin.bind(new THREE.Skeleton([b0, b1])); b1.rotation.z = 0.7;
  add(skin.skeleton);
  put(skin, 0.35 * C.cell, 1.05, z3);
  const plain = (name, tint, glow, x) => {
    const g = add(dress(new THREE.SphereGeometry(0.5, 32, 20)));
    if (glow) g.setAttribute('aA', u8(() => [255, 255, 1, 255], g.attributes.position.count));
    put(new THREE.Mesh(g, mats.custom(GFX.surf[name], tint, 'world')), x * C.cell, 0.5, z3);
  };
  plain('glass', [0.08, 0.1, 0.12], false, 0.85); plain('rubber', [0.1, 0.11, 0.12], false, 1.3); plain('glow', [1, 0.78, 0.45], true, 1.75);
  // 움직이는 것의 조명: 야영지 등불 곁의 빛 격자 값을 uniform 으로 받은 상자(등불 빛이 묻어야 한다)
  const crate = mats.custom(cfgOf('planks'), GFX.surf.wood.base, 'dyn');
  gfxDynLight(crate, C.dynAt[0], C.dynAt[1], C.dynAt[2]);
  put(new THREE.Mesh(add(dress(new THREE.BoxGeometry(1.2, 1.2, 1.2, 2, 2, 2))), crate), 2.4 * C.cell, 0.6, z3);
  root.position.set(C.at[0], C.at[1], C.at[2]); root.updateMatrixWorld(true);
  return { root, mats, keep };
}

async function swatch(on = true) {
  const P = gfxParts();
  if (B.root) { P.scene.remove(B.root); for (const x of B.list) x.dispose(); CTX.eye = B.was; B.root = null; B.list = []; }
  if (!on) { draw(); return gfxInfo(); }
  taint();
  const C = GFX.swatch, assets = await loadAssets(TEX_KEYS, CTX.noart), L = GFX.look, tex = [];
  const made = makeTextures(assets, TEX_KEYS, { normals: !P.lean, aniso: P.lean ? L.anisoLean : L.aniso, strength: L.strength }, (x) => { tex.push(x); return x; });
  const board = buildBoard(made);
  B.root = board.root; B.mats = board.mats; B.list = [...board.keep, ...tex]; B.was = CTX.eye;
  P.scene.add(B.root);
  CTX.eye = [C.at[0], C.at[1] + C.camUp, C.at[2] + C.camBack, 0, C.camPitch * DEG]; CTX.look.yaw = 0; CTX.look.pitch = 0;
  await gfxCompile();
  draw();
  return { ...gfxInfo(), cells: TEX_KEYS };
}

// 방식 다섯(지형 겹 · 세 방향 · 제 좌표 · 스키닝 · 평범)이 지금 길에서 컴파일 · 링크됐는가 — 견본 판을 세워 그린 뒤 물체마다의 프로그램을 본다
async function modes() {
  if (!B.root) await swatch(true);
  const P = gfxParts(), gl = P.renderer.getContext(), out = {}, want = { terrain: (m, d) => 'FG_TERRAIN' in d, tri: (m, d) => !('FG_TERRAIN' in d) && !('FG_OWN' in d) && !('FG_PLAIN' in d), own: (m, d) => 'FG_OWN' in d && !m.isSkinnedMesh, skin: (m) => m.isSkinnedMesh, plain: (m, d) => 'FG_PLAIN' in d };
  B.root.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const prog = P.renderer.properties.get(mesh.material).currentProgram, d = mesh.material.defines;
    for (const mode of Object.keys(want)) if (want[mode](mesh, d)) out[mode] = (out[mode] === undefined || out[mode]) && !!prog && gl.getProgramParameter(prog.program, gl.LINK_STATUS) === true;
  });
  return { lean: P.lean, modes: out, ...gfxInfo() };
}

// 세계를(자산까지) 지우고 다시 세우기를 n 번 — 돌 때마다의 형상 · 무늬 · 프로그램 수(처음 줄 = 하기 전)
async function remake(n = 5) {
  taint();
  const rows = [], pick = () => { const i = gfxInfo(); return { geometries: i.geometries, textures: i.textures, programs: i.all, heavy: i.heavy, calls: i.calls, triangles: i.triangles, registry: i.registry }; };
  // 책갈피를 다 돌며 그려야 모든 묶음이 GPU 에 올라간다(안 그린 형상은 수에 안 잡힌다)
  const tour = () => { const was = CTX.eye; for (const st of CTX.world.marks.stations) { CTX.eye = [st.at[0], st.at[1], st.at[2], st.yaw, st.pitch]; draw(); } CTX.eye = was; draw(); };
  tour(); rows.push(pick());
  for (let k = 0; k < n; k++) {
    gfxUnload();
    gfxLoad(await loadAssets(gfxNeeds(CTX.world), CTX.noart), CTX.world.sky);
    gfxWorld(CTX.world, CTX.baked);
    await gfxCompile();
    tour(); rows.push(pick());
  }
  return rows;
}

const median = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];

// 화소 기울기: 책갈피마다 그리기 버퍼의 크기를 바꿔 가며 프레임의 GPU 시간을 재고 화소 수(MP)에 대한 기울기(ms/MP)를 최소 제곱으로 낸다.
//   크기마다 rounds 번(한 번 = frames 프레임) 재어 gpuMs = 중앙값들의 중앙값 · gpuMin = 가장 작은 값(다른 작업의 부하는 값을 늘리기만 한다) · wallMs = 「n 프레임 + 1픽셀」의 중앙값.
async function bench(stations) {
  taint();
  const P = gfxParts(), T = GFX.bench, was = CTX.eye, out = { lean: P.lean, timer: P.measure.timer, format: P.chain.format, stations: {} };
  const fit = (rows, key) => {
    const pts = rows.filter((r) => r[key] !== null), n = pts.length, mx = pts.reduce((s, r) => s + r.mp, 0) / n, my = pts.reduce((s, r) => s + r[key], 0) / n;
    return n < 2 ? null : pts.reduce((s, r) => s + (r.mp - mx) * (r[key] - my), 0) / pts.reduce((s, r) => s + (r.mp - mx) * (r.mp - mx), 0);
  };
  for (const id of stations || CTX.world.marks.stations.map((s) => s.id)) {
    station(id);
    const rows = [];
    for (const [w, h] of T.sizes) {
      gfxResize(w, h);
      const wall = [], gpu = [], low = [];
      for (let r = 0; r < T.warm + T.rounds; r++) {
        const m = await P.measure.frames(draw, T.frames);
        if (r < T.warm) continue;
        wall.push(m.wallMs);
        if (m.gpuMs !== null) { gpu.push(m.gpuMs); low.push(m.gpuMin); }
      }
      rows.push({ w, h, mp: w * h / 1e6, wallMs: median(wall), gpuMs: gpu.length ? median(gpu) : null, gpuMin: low.length ? Math.min(...low) : null, spread: gpu.length ? (Math.max(...gpu) - Math.min(...gpu)) / median(gpu) : null });
    }
    const info = gfxInfo();
    out.stations[id] = { rows, slopeWall: fit(rows, 'wallMs'), slopeGpu: fit(rows, 'gpuMs'), slopeGpuMin: fit(rows, 'gpuMin'), calls: info.calls, triangles: info.triangles };
  }
  gfxResize(null); CTX.eye = was; draw();
  return out;
}

function station(id) {
  const st = CTX.world.marks.stations.find((s) => s.id === id);
  if (!st) throw new Error('모르는 책갈피: ' + id);
  taint();
  CTX.eye = [st.at[0], st.at[1], st.at[2], st.yaw, st.pitch]; CTX.look.yaw = 0; CTX.look.pitch = 0;
  return CTX.eye.slice();
}

export const LOOK = {
  gfx() { return gfxInfo(); },
  station,
  cam(x, y, z, yaw = 0, pitch = 0) { taint(); CTX.eye = [x, y, z, yaw * DEG, pitch * DEG]; CTX.look.yaw = 0; CTX.look.pitch = 0; return CTX.eye.slice(); },
  // 지금 카메라로 한 장 그려 PNG(주소 글)로 — w · h 를 주면 그 크기의 그리기 버퍼로
  grab(w, h) {
    if (w) gfxResize(w, h);
    draw();
    const url = gfxParts().renderer.domElement.toDataURL('image/png'), info = gfxInfo();
    if (w) { gfxResize(null); draw(); }
    return { url, calls: info.calls, triangles: info.triangles, size: info.size };
  },
  sw(group, on) { taint(); const ok = gfxSwitch(group, on); draw(); return ok; },
  swatch, modes, remake, bench,
  // 안쪽을 들여다볼 때(작업 중의 계측 스크립트): parts() = view/gfx 의 안쪽 · redraw() = 지금 카메라로 한 장 · size(w, h) = 그리기 버퍼 크기 고정(null 이면 창을 따른다)
  parts: gfxParts, redraw: draw, size(w, h) { gfxResize(w, h); },
};

// 자유 비행(개발판 · 주소에 ?dev=1): 놀이 중 WASD 로 보는 쪽 · 옆으로, Space · C 로 위아래(달리기 단추 = 빠르게). 프레임마다 사건 통을 읽는 자리에 걸어 둔다.
const F = { last: 0 };
function fly() {
  const now = performance.now(), dt = Math.min(0.1, (now - F.last) / 1000), I = CTX.input, C = GFX.camera;
  F.last = now;
  if (CTX.phase !== 'play' || (!I.mx && !I.mz && !(I.held & 20))) return;
  const yaw = CTX.eye[3] + CTX.look.yaw, pitch = CTX.eye[4] + CTX.look.pitch, v = C.fly * (I.held & 8 ? C.flyFast : 1) * dt, cp = Math.cos(pitch);
  CTX.eye[0] += (-Math.sin(yaw) * cp * I.mz + Math.cos(yaw) * I.mx) * v;
  CTX.eye[1] += (Math.sin(pitch) * I.mz + ((I.held & 4) ? 1 : 0) - ((I.held & 16) ? 1 : 0)) * v;
  CTX.eye[2] += (-Math.cos(yaw) * cp * I.mz - Math.sin(yaw) * I.mx) * v;
}
if (/[?&]dev=1(&|$)/.test(window.location.search)) CTX.sinks.push(fly);
