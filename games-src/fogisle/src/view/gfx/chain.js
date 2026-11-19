// 주는 것: 그리기 대상 사슬의 뼈대 — makeChain(renderer, 등록) → { target(장면 대상) · resize(w, h) · draw(장면, 카메라) · post(어디로) · format }.
//   한 프레임 = 장면 → 장면 대상(반정밀 · 선형) → 합성 한 번(노출 → ACES → sRGB → 디더) → 화면. 모든 화질 단계가 같은 사슬을 탄다(tdd §5-5 — 늘 대상에 그리고 합성한다).
// 받는 것: 전역 THREE · shader.glsl(POST_*) · tune/gfx.tone. EffectComposer 없이 대상 하나 + 화면을 덮는 삼각형 하나로 짠다.
//   대상에 그릴 때 three 는 재질의 톤 처리 · 출력 색 공간 변환을 건너뛴다(tdd 부록 A) — 그래서 톤은 여기 합성에서 한다. 캔버스는 겹표본 · 깊이 없이 만든다(깊이는 대상에만).
//   번짐 · 색 보정 · 마감 · 화면 효과(F2b), 대상 형식 고르기 · 동적 해상도 · 겹표본(F2c)이 이 사슬에 끼워진다 — 셰이더를 예열할 때는 target 을 먼저 잡는다(build-plan 부록 A).
import { POST_VERT, POST_FRAG } from './shader.glsl.js';
import { GFX } from '../../shared/tune/gfx.js';

export function makeChain(renderer, add) {
  const gl = renderer.getContext(), DEPTH = [gl.DEPTH_ATTACHMENT];
  const half = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
  const target = add(new THREE.WebGLRenderTarget(1, 1, {
    type: half ? THREE.HalfFloatType : THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: false,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
  }));
  const geo = add(new THREE.BufferGeometry()), tone = { value: new THREE.Vector4(1, 1, 0, 0) };
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const mat = add(new THREE.ShaderMaterial({
    name: 'fg-post', vertexShader: POST_VERT, fragmentShader: POST_FRAG, uniforms: { tScene: { value: target.texture }, uTone: tone },
    depthTest: false, depthWrite: false, toneMapped: false, fog: false,
  }));
  const tri = new THREE.Mesh(geo, mat), scene = new THREE.Scene(), cam = new THREE.Camera();
  tri.frustumCulled = false; scene.add(tri);
  return {
    target, format: half ? '16f' : 'ldr',
    resize(w, h) { target.setSize(w, h); },
    // 합성만(장면 대상에 있는 것을 into 로 — null 이면 화면)
    post(into = null) {
      tone.value.set(GFX.tone.exposure, GFX.tone.dither, 0, 0);
      renderer.setRenderTarget(into);
      renderer.render(scene, cam);
    },
    draw(world, camera) {
      renderer.setRenderTarget(target);
      renderer.render(world, camera);
      // 장면의 깊이는 이 뒤로 읽지 않는다 — 버려도 된다고 알려 타일 방식 GPU 가 깊이를 메모리에 내려 쓰지 않게 한다(대상이 아직 잡혀 있을 때)
      gl.invalidateFramebuffer(gl.FRAMEBUFFER, DEPTH);
      this.post(null);
    },
  };
}
