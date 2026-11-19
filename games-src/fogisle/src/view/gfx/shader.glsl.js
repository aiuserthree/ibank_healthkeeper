// 주는 것: 셰이더 글 — 안개(FOG_PARS · FOG_FN: three 의 안개 조각 넷을 바꿔 끼울 때와 하늘이 같이 쓴다) · 표면 재질에 끼우는 조각(VERT_PARS · VERT_MAIN ·
//   정식 길 FRAG_PARS · FRAG_MAP · FRAG_ROUGH · FRAG_NORMAL · FRAG_EMIT · FRAG_ENV / 값싼 길 LEAN_PARS · LEAN_MAP · LEAN_LIGHT) · 하늘(SKY_VERT · SKY_FRAG) · 합성(POST_VERT · POST_FRAG).
// 받는 것: 없음(글자뿐). 끼우는 자리와 uniform 은 surface.js · sky.js · chain.js, 값의 뜻은 uni.js. 정의로 가르는 것은 길(FG_LEAN)과 방식(FG_TERRAIN · FG_OWN · FG_PLAIN)뿐이고
//   각진 면 · 법선 무늬 · 하늘 가림 · 해 가림 · 얼룩의 켬과 세기는 전부 uniform 이다(놀이 중에 프로그램이 새로 생기지 않게 — build-plan 부록 A).
// 꼭짓점 속성(전부 0 ~ 1 로 읽히는 바이트 넷): aA = 얼룩 · 그늘 · 주된 입힘 축(÷ 255) · 발광 무게 / aB = 하늘 열림 · 늘 켜진 등불 RGB(√) / aC = 해 가림 · 스위치 묶음 번호(÷ 255) · 그 묶음의 세기(√) · 예비.
//   aB · aC 는 정적 묶음과 과녁 조각에서는 꼭짓점마다, 인스턴스에서는 줄마다다(같은 이름의 인스턴스 속성 — 셰이더는 구별하지 않는다).
// 스위치 묶음: 번호를 화소로 넘기지 않는다. **꼭짓점에서 「제 묶음의 색 × 켜진 정도 × 제 세기」를 곱해 RGB 로 만든 뒤 보간한다** — 묶음이 겹치는 경계 삼각형에서도
//   남의 세기에 제 색이 곱해지지 않는다(번호는 꼭짓점 안에서만 쓰이므로 flat 이 필요 없다).
// 값싼 길(FG_LEAN — tdd §5-8): 무늬는 생성이 정한 주된 축 하나로 한 번(지형은 바위 + 자갈 두 번) · 안개와 하늘빛 · 구운 등불은 꼭짓점에서 · 반사는 무늬를 읽지 않는 해석 하늘.

// 안개: 높이에 따라 옅어지는 안개의 해석적 적분 + 고른 안개. 색 = 보는 방위의 수평선 띠 × 색조 + 해 쪽 번짐. 돌려주는 값 = (색, 양)
export const FOG_FN = `
  uniform vec4 uFogA; uniform vec4 uFogTint; uniform vec4 uSunFog; uniform vec3 uSunDirW; uniform float uSkyTurn; uniform sampler2D tHorizon;
  vec4 fgFog(vec3 wpos) {
    vec3 V = wpos - cameraPosition; float d = length(V); vec3 v = V / max(d, 1e-4);
    float t = clamp(uFogA.y * V.y, -10.0, 10.0);
    float integ = abs(t) > 0.002 ? (1.0 - exp(-t)) / t : 1.0 - 0.5 * t;
    float a0 = uFogA.x * exp(-clamp((cameraPosition.y - uFogA.z) * uFogA.y, -4.0, 12.0));
    float amt = (1.0 - exp(-(a0 * integ + uFogA.w) * d)) * uFogTint.w;
    vec3 col = texture2D(tHorizon, vec2(atan(v.z, v.x) * 0.15915494 + 0.5 + uSkyTurn, 0.5)).rgb * uFogTint.rgb;
    col += uSunFog.rgb * pow(max(dot(v, uSunDirW), 0.0), uSunFog.w);
    return vec4(col, amt);
  }
`;

// three 의 안개 조각 넷(꼭짓점 선언 · 꼭짓점 · 화소 선언 · 화소)을 감싸는 글. FG_FOG 가 없는 재질(개발 뷰어의 기본 재질)은 three 의 원래 안개를 그대로 쓴다.
export const FOG_PARS = Object.freeze({
  fog_pars_vertex: `
    varying vec3 vFogW;
    #ifdef FG_LEAN
      varying vec4 vFog;
      ${FOG_FN}
    #endif`,
  fog_vertex: `
    { vec4 fgP = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        fgP = instanceMatrix * fgP;
      #endif
      vFogW = (modelMatrix * fgP).xyz; }
    #ifdef FG_LEAN
      vFog = fgFog(vFogW);
    #endif`,
  fog_pars_fragment: `
    varying vec3 vFogW;
    #ifdef FG_LEAN
      varying vec4 vFog;
    #else
      ${FOG_FN}
    #endif`,
  fog_fragment: `
    #ifdef FG_LEAN
      gl_FragColor.rgb = mix(gl_FragColor.rgb, vFog.rgb, vFog.a);
    #else
      { vec4 fgF = fgFog(vFogW); gl_FragColor.rgb = mix(gl_FragColor.rgb, fgF.rgb, fgF.a); }
    #endif`,
});

export const VERT_PARS = `
  attribute vec4 aA; attribute vec4 aB; attribute vec4 aC;
  uniform vec4 uSwitch[8]; uniform vec4 uBake; uniform vec4 uLook; uniform vec4 uDyn; uniform vec4 uDyn2;
  varying vec4 vLit; varying vec4 vMisc;
  #ifdef FG_TERRAIN
    attribute vec4 aLay; varying vec4 vLay;
  #endif
  #ifdef FG_OWN
    varying vec3 vTPos; varying vec3 vTNrm;
  #endif
  #ifdef FG_LEAN
    flat varying float vAxis;
    uniform vec3 uIrrUp; uniform vec3 uIrrSide; uniform vec3 uIrrDown;
  #endif
`;

// 구운 빛을 꼭짓점에서 푼다: 등불 RGB(√ 를 풀고) + 스위치 묶음(제 색 × 제 세기) → vLit.rgb, 하늘 열림 → vLit.a. 움직이는 것(uDyn2.w = 1)은 빛 격자에서 읽은 uniform 을 쓴다.
export const VERT_MAIN = `
  {
    float fgK = uDyn2.w, fgSkyV = mix(aB.x, uDyn.x, fgK), fgOn = 1.0;
    vec3 fgLamp = mix(aB.yzw * aB.yzw, uDyn.yzw, fgK);
    int fgG = int(aC.y * 255.0 + 0.5);
    if (fgG < 8) { vec4 fgS = uSwitch[fgG]; fgLamp += fgS.rgb * (aC.z * aC.z) * (1.0 - fgK); fgOn = fgS.a; }
    vec3 fgNv = inverseTransformDirection(transformedNormal, viewMatrix);
    #ifdef USE_INSTANCING
      fgSkyV *= mix(1.0 - uBake.w, 1.0, smoothstep(-0.7, 0.5, fgNv.y));
    #endif
    vMisc = vec4(aA.x, aA.y, mix(aC.x, uDyn2.x, fgK), aA.w * fgOn);
    #ifdef FG_LEAN
      vec3 fgIrr = fgNv.y > 0.0 ? mix(uIrrSide, uIrrUp, fgNv.y) : mix(uIrrSide, uIrrDown, -fgNv.y);
      float fgOcc = mix(1.0, fgSkyV * mix(1.0, aA.y, 0.5), uLook.w);
      vLit = vec4(fgIrr * fgOcc + fgLamp * (uBake.x * RECIPROCAL_PI), fgOcc);
      vAxis = aA.z * 255.0;
    #else
      vLit = vec4(fgLamp * uBake.x, fgSkyV);
    #endif
    #ifdef FG_TERRAIN
      vLay = aLay;
    #endif
    #ifdef FG_OWN
      #ifdef USE_INSTANCING
        vTPos = position * vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz)) + instanceMatrix[3].xyz * 0.37;
      #else
        vTPos = position;
      #endif
      vTNrm = normal;
    #endif
  }
`;

const FRAG_SHARED = `
  uniform sampler2D tA; uniform vec4 uSurf; uniform vec4 uSurf2; uniform vec3 uTint;
  uniform vec4 uLook; uniform vec4 uLook2; uniform vec4 uBake; uniform vec4 uBake2; uniform vec4 uWet; uniform vec4 uWet2;
  varying vec4 vLit; varying vec4 vMisc;
  #ifdef FG_TERRAIN
    uniform sampler2D tB; uniform vec4 uLay; varying vec4 vLay;
  #endif
  float fgSun = 1.0; float fgSky = 1.0; float fgWet = 0.0; float fgHgt = 0.5; vec3 fgNw = vec3(0.0, 1.0, 0.0);
  // 물가 젖음(해수면 가까이) + 재질이 젖음을 받는 정도, 그리고 색조 · 얼룩 · 그늘 · 젖은 어둡기를 바탕색에
  vec3 fgFinish(vec3 alb, float wet) {
    fgWet = clamp(max(max(wet, uSurf2.w), 1.0 - smoothstep(uWet2.y, uWet.y, vFogW.y)), 0.0, 1.0) * uSurf.w;
    alb *= uTint * (1.0 - (1.0 - vMisc.x) * uLook.y) * mix(1.0, vMisc.y, uLook2.w) * mix(1.0, uWet.z, fgWet);
    fgSun = mix(1.0, vMisc.z, uBake.y);
    return alb;
  }
`;

export const FRAG_PARS = FRAG_SHARED + `
  uniform sampler2D tAn; uniform vec3 uEnvTint;
  #ifdef FG_TERRAIN
    uniform sampler2D tBn; uniform sampler2D tC;
  #endif
  #ifdef FG_OWN
    varying vec3 vTPos; varying vec3 vTNrm;
  #endif
  vec3 fgW3(vec3 n) { vec3 w = n * n; w = w * w * w; return w / (w.x + w.y + w.z); }
  vec3 fgTri(sampler2D tx, vec3 p, vec3 w, float s) { return texture2D(tx, p.xz * s).rgb * w.y + texture2D(tx, p.zy * s).rgb * w.x + texture2D(tx, p.xy * s).rgb * w.z; }
`;

// 정식 길: 세 방향 입히기(바탕색 3번) + 큰 얼룩(같은 무늬를 1/7 배율로 1번) + 법선 무늬(가장 큰 축으로 1번 — 축이 갈리는 모서리에서는 세기를 0 으로 줄여 이음매를 숨긴다).
//   지형은 바위(세 방향) · 자갈 · 풀 세 겹을 겹의 값과 무늬 밝기로 섞는다(경계가 또렷하게). 제 좌표로 입히는 것(FG_OWN)은 법선의 밀림을 화면 미분으로 세계에 옮긴다.
export const FRAG_MAP = `
  {
    vec3 nG = inverseTransformDirection(normalize(vNormal), viewMatrix);
    vec3 fgWx = dFdx(vFogW), fgWy = dFdy(vFogW);
    float fgSt = smoothstep(uLook2.y, uLook2.x, abs(nG.y)) * uLook.x;
    nG = normalize(mix(nG, normalize(cross(fgWx, fgWy)), fgSt));
    float fgD2 = dot(vFogW - cameraPosition, vFogW - cameraPosition);
    #ifdef FG_OWN
      vec3 p = vTPos; vec3 fgPx = dFdx(p), fgPy = dFdy(p);
      vec3 nT = normalize(mix(normalize(vTNrm), normalize(cross(fgPx, fgPy)), fgSt));
    #else
      vec3 p = vFogW; vec3 nT = nG;
    #endif
    float s = uSurf.x; vec3 w3 = fgW3(nT); float wmax = max(w3.x, max(w3.y, w3.z));
    vec2 uvD = w3.y >= wmax ? p.xz : (w3.x >= wmax ? p.zy : p.xy);
    float kN = uSurf.y * uLook.z * smoothstep(0.5, 0.8, wmax) / (1.0 + uLook2.z * fgD2);
    float fgUp = smoothstep(0.35, 0.9, nG.y);
    vec3 alb = vec3(1.0); vec3 tn = vec3(0.0);
    #if defined(FG_TERRAIN)
      vec3 rock = fgTri(tA, p, w3, s);
      float macro = texture2D(tA, p.xz * s * 0.137 + p.y * s * 0.071 + 0.37).g / uSurf2.y - 1.0;
      rock *= 1.0 + uSurf2.x * macro;
      float hR = dot(rock, vec3(0.3333)) / uSurf2.y;
      vec3 peb = texture2D(tB, p.xz * uLay.x).rgb, turf = texture2D(tC, p.xz * uLay.y).rgb * (1.0 + 0.6 * uSurf2.x * macro);
      float flat_ = smoothstep(0.5, 0.74, nG.y);
      float wp = smoothstep(0.35, 0.65, vLay.x + (dot(peb, vec3(0.3333)) / uLay.z - hR) * 0.25) * flat_;
      float wt = smoothstep(0.4, 0.6, vLay.y + macro * 0.2 - (hR - 1.0) * 0.15) * flat_;
      alb = mix(mix(rock, peb, wp), turf, wt);
      fgHgt = clamp(0.5 * mix(mix(hR, dot(peb, vec3(0.3333)) / uLay.z, wp), 1.0, wt), 0.0, 1.0);
      tn = mix(texture2D(tAn, uvD * s).xyz * 2.0 - 1.0, texture2D(tBn, p.xz * uLay.x).xyz * 2.0 - 1.0, wp) * (1.0 - 0.6 * wt);
      alb = fgFinish(alb, vLay.z * (1.0 - wt * 0.7));
    #elif defined(FG_PLAIN)
      kN = 0.0; alb = fgFinish(alb, uWet.x * fgUp);
    #else
      alb = fgTri(tA, p, w3, s);
      float macro = texture2D(tA, uvD * s * 0.137 + 0.37).g / uSurf2.y - 1.0;
      alb *= 1.0 + uSurf2.x * macro;
      fgHgt = clamp(0.5 * dot(alb, vec3(0.3333)) / uSurf2.y, 0.0, 1.0);
      tn = texture2D(tAn, uvD * s).xyz * 2.0 - 1.0;
      alb = fgFinish(alb, uWet.x * fgUp);
    #endif
    diffuseColor.rgb *= alb;
    fgSky = mix(1.0, vLit.a * mix(1.0, vMisc.y, 0.5), uLook.w);
    vec3 nP = w3.y >= wmax ? vec3(tn.x, 0.0, tn.y) : (w3.x >= wmax ? vec3(0.0, tn.y, tn.x) : vec3(tn.x, tn.y, 0.0));
    #ifdef FG_OWN
      float a11 = dot(fgPx, fgPx), a12 = dot(fgPx, fgPy), a22 = dot(fgPy, fgPy), det = a11 * a22 - a12 * a12, b1 = dot(nP, fgPx), b2 = dot(nP, fgPy);
      nP = det > 1e-14 ? (fgWx * (a22 * b1 - a12 * b2) + fgWy * (a11 * b2 - a12 * b1)) / det : vec3(0.0);
    #endif
    fgNw = normalize(nG + nP * kN);
  }
`;

export const FRAG_ROUGH = `
  roughnessFactor = clamp(uSurf.z + (0.5 - fgHgt) * 0.25, uWet2.x, 1.0);
  roughnessFactor = mix(roughnessFactor, max(uWet2.x, uWet.w + 0.2 * fgHgt), fgWet);
`;
export const FRAG_NORMAL = `
  normal = normalize(mat3(viewMatrix) * fgNw);
`;
export const FRAG_EMIT = `
  totalEmissiveRadiance += diffuseColor.rgb * (vMisc.w * uBake2.x);
`;
// 하늘 열림은 환경광(확산 · 반사)만 가린다 — 구운 등불 빛(irradiance 에 더한 것)은 가리지 않는다
export const FRAG_ENV = `
  iblIrradiance *= fgSky * uEnvTint; radiance *= pow(fgSky, uBake.z) * uEnvTint;
`;
// lights_fragment_begin 안의 두 자리에 끼운다: 주광에 구운 해 가림 · 간접 조도에 구운 등불 빛
export const FRAG_SUN = ' directLight.color *= fgSun;';
export const FRAG_LAMP = ' irradiance += vLit.rgb;';

export const LEAN_PARS = FRAG_SHARED + `
  uniform vec3 uSunDirW; uniform vec3 uSunCol; uniform vec3 uSkyTop; uniform vec3 uSkyMid; uniform vec3 uSkyLow;
  flat varying float vAxis;
  #ifdef FG_TERRAIN
    uniform vec3 uTurf;
  #endif
  #ifdef FG_OWN
    varying vec3 vTPos;
  #endif
`;

// 값싼 길의 바탕색: 주된 축 하나로 한 번 읽는다(축은 삼각형마다 하나 — flat). 지형은 바위 + 자갈 두 겹을 꼭짓점의 겹 값으로 섞고, 풀은 무늬를 읽지 않고 색으로 얹는다.
export const LEAN_MAP = `
  {
    vec3 nG = inverseTransformDirection(normalize(vNormal), viewMatrix);
    float fgSt = smoothstep(uLook2.y, uLook2.x, abs(nG.y)) * uLook.x;
    nG = normalize(mix(nG, normalize(cross(dFdx(vFogW), dFdy(vFogW))), fgSt));
    #ifdef FG_OWN
      vec3 p = vTPos;
    #else
      vec3 p = vFogW;
    #endif
    vec2 uvD = vAxis < 0.5 ? p.zy : (vAxis < 1.5 ? p.xz : p.xy);
    float fgUp = smoothstep(0.35, 0.9, nG.y);
    #if defined(FG_PLAIN)
      vec3 alb = fgFinish(vec3(1.0), uWet.x * fgUp);
    #else
      vec3 alb = texture2D(tA, uvD * uSurf.x).rgb;
      fgHgt = clamp(0.5 * dot(alb, vec3(0.3333)) / uSurf2.y, 0.0, 1.0);
      #ifdef FG_TERRAIN
        vec3 peb = texture2D(tB, p.xz * uLay.x).rgb;
        float flat_ = smoothstep(0.5, 0.74, nG.y), fgPb = dot(peb, vec3(0.3333)) / uLay.z;
        float wp = smoothstep(0.35, 0.65, vLay.x + (fgPb - 2.0 * fgHgt) * 0.25) * flat_, wt = smoothstep(0.4, 0.6, vLay.y - (2.0 * fgHgt - 1.0) * 0.15) * flat_;
        fgHgt = mix(fgHgt, clamp(0.5 * fgPb, 0.0, 1.0), wp);
        alb = mix(mix(alb, peb, wp), uTurf * (0.25 + 1.5 * fgHgt), wt);
        alb = fgFinish(alb, vLay.z * (1.0 - wt * 0.7));
      #else
        alb = fgFinish(alb, uWet.x * fgUp);
      #endif
    #endif
    diffuseColor.rgb *= alb;
    fgNw = nG;
  }
`;

// 값싼 길의 빛(three 의 조명 고리 대신): 주광(구운 해 가림) + 꼭짓점에서 센 하늘빛과 구운 등불(vLit.rgb) + 해석 하늘 반사(젖을수록 매끈해져 하늘이 비친다) + 해의 반짝임.
export const LEAN_LIGHT = `
  {
    float fgNdl = max(dot(fgNw, uSunDirW), 0.0) * fgSun, fgMetal = uSurf2.z;
    vec3 fgV = normalize(cameraPosition - vFogW), fgR = reflect(-fgV, fgNw), fgH = normalize(fgV + uSunDirW);
    float fgRough = mix(clamp(uSurf.z + (0.5 - fgHgt) * 0.25, uWet2.x, 1.0), max(uWet2.x, uWet.w + 0.2 * fgHgt), fgWet), fgGl = (1.0 - fgRough) * (1.0 - fgRough);
    vec3 fgF0 = mix(vec3(0.04), diffuseColor.rgb, fgMetal);
    float fgC = 1.0 - max(dot(fgNw, fgV), 0.0), fgC2 = fgC * fgC;
    // 법선 무늬가 없으니 무늬의 밝기로 반사를 흩는다(젖은 면이 고르게 번들거리지 않고 알알이 반짝이게)
    //   스치는 각의 반사(프레넬)는 거친 면에서 죽는다 — 매끈한 정도의 제곱으로 누른다(안 누르면 젖은 자갈밭이 눈밭처럼 희게 뜬다)
    vec3 fgF = (fgF0 * (0.12 + 0.88 * fgGl) + (1.0 - fgF0) * (fgC2 * fgC2 * fgC) * fgGl * fgGl) * (0.4 + 1.2 * fgHgt) * (1.0 + fgWet);
    vec3 fgSkyR = fgR.y > 0.0 ? mix(uSkyMid, uSkyTop, fgR.y) : mix(uSkyMid, uSkyLow, min(-fgR.y * 3.0, 1.0));
    float fgSp = pow(max(dot(fgNw, fgH), 0.0), 4.0 + 380.0 * fgGl * fgGl) * (0.5 + 12.0 * fgGl * fgGl);
    vec3 fgDiff = diffuseColor.rgb * (1.0 - fgMetal);
    reflectedLight.directDiffuse = fgDiff * uSunCol * (fgNdl * RECIPROCAL_PI) + fgF * uSunCol * (fgSp * fgNdl * RECIPROCAL_PI);
    reflectedLight.indirectDiffuse = fgDiff * vLit.rgb + fgF * fgSkyR * (vLit.a * vLit.a);
  }
`;

// 하늘: 카메라에 붙은 둥근 지붕을 먼 평면에 붙여 마지막에 그린다(깊이 = 1). 등장방형 그림을 보는 방향으로 읽고, 장면과 같은 안개 함수를 먼 거리에 먹여 수평선에서 안개와 이어지게 한다.
export const SKY_VERT = `
  varying vec3 vDir;
  #ifdef FG_LEAN
    varying vec4 vFog; uniform float uSkyFar;
    ${FOG_FN}
  #endif
  void main() {
    vDir = position;
    #ifdef FG_LEAN
      vFog = fgFog(cameraPosition + normalize(position) * uSkyFar);
    #endif
    vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
    gl_Position = p.xyww;
  }
`;
export const SKY_FRAG = `
  varying vec3 vDir; uniform sampler2D tSky; uniform float uSkyGain;
  #ifdef FG_LEAN
    varying vec4 vFog; uniform float uSkyTurn;
  #else
    uniform float uSkyFar;
    ${FOG_FN}
  #endif
  void main() {
    vec3 d = normalize(vDir);
    vec3 c = texture2D(tSky, vec2(atan(d.z, d.x) * 0.15915494 + 0.5 + uSkyTurn, asin(clamp(d.y, -1.0, 1.0)) * 0.31830989 + 0.5)).rgb * uSkyGain;
    #ifdef FG_LEAN
      vec4 f = vFog;
    #else
      vec4 f = fgFog(cameraPosition + d * uSkyFar);
    #endif
    gl_FragColor = vec4(mix(c, f.rgb, f.a), 1.0);
  }
`;

// 합성(장면 대상 → 화면, 8비트로): 노출 → ACES(three 의 것과 같은 식) → sRGB → 디더. 후처리(번짐 · 색 보정 · 마감)는 F2b 가 이 사이에 끼운다.
export const POST_VERT = `
  varying vec2 vUv;
  void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
export const POST_FRAG = `
  varying vec2 vUv; uniform sampler2D tScene; uniform vec4 uTone;
  vec3 fgRRT(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
  vec3 fgAces(vec3 c) {
    c *= uTone.x / 0.6;
    c = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777) * c;
    c = fgRRT(c);
    c = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602) * c;
    return clamp(c, 0.0, 1.0);
  }
  void main() {
    vec3 c = fgAces(max(texture2D(tScene, vUv).rgb, 0.0));
    c = mix(1.055 * pow(c, vec3(0.41666)) - 0.055, c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308))));
    float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
    gl_FragColor = vec4(c + n * uTone.y / 255.0, 1.0);
  }
`;
