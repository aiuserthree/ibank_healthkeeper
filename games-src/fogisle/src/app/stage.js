// 주는 것: 토대 단계의 빈 장면(회색 바닥 + 눈금 줄) — stageInit · stageResize · stageDraw. 진짜 장면(view/gfx)은 F2a 가 세우고 이 파일은 그때 뺀다.
// 받는 것: 전역 THREE(r160 — fg-three 덩이) · CTX.look · tune/app.stage. 조명 · 무늬 · 후처리 없음(기본 재질과 선, 먼 곳을 하늘색으로 묻는 선형 안개뿐).
// 캔버스는 alpha 없이 · 겹표본 없이 · 그리기 버퍼를 남기지 않고 만든다(tdd §2-4 · 부록 A). WebGL 을 못 켜면 stageInit 이 예외를 낸다.
import { CTX } from './ctx.js';
import { APP } from '../shared/tune/app.js';

const S = { renderer: null, scene: null, camera: null };

export function stageInit(canvas) {
  const cfg = APP.stage;
  S.renderer = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: false, powerPreference: 'high-performance' });
  S.renderer.setClearColor(cfg.sky);
  S.scene = new THREE.Scene();
  S.scene.fog = new THREE.Fog(cfg.sky, cfg.fogNear, cfg.fogFar);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(cfg.size, cfg.size), new THREE.MeshBasicMaterial({ color: cfg.floor, depthWrite: false }));
  floor.rotation.x = -Math.PI / 2;
  const grid = new THREE.GridHelper(cfg.size, cfg.size / cfg.cell, cfg.line, cfg.line);
  grid.material.depthTest = false;
  grid.renderOrder = 1;
  S.scene.add(floor, grid);
  S.camera = new THREE.PerspectiveCamera(cfg.fovH, 1, cfg.near, cfg.far);
  S.camera.rotation.order = 'YXZ';
  S.camera.position.set(0, cfg.eye, 0);
  stageResize();
}

// 수평 시야각을 지킨다(세로 시야각은 화면비에서 나온다)
export function stageResize() {
  if (!S.renderer) return;
  const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
  S.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, APP.stage.pixelRatioMax));
  S.renderer.setSize(w, h, false);
  S.camera.aspect = w / h;
  S.camera.fov = 2 * Math.atan(Math.tan(APP.stage.fovH * Math.PI / 360) / S.camera.aspect) * 180 / Math.PI;
  S.camera.updateProjectionMatrix();
}

export function stageDraw() {
  S.camera.rotation.set(CTX.look.pitch, CTX.look.yaw, 0);
  S.renderer.render(S.scene, S.camera);
}
