// Local-space finishes stay aligned with the body as its mesh deforms.
function coordinates(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 carSurface;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\ncarSurface = position;');
}

// look(새 차): belt = 아래 몸 다른 색 높이 · 기울기, lower = 그 색, spine = 가운데 척추선 반폭, pin = 옆 가는 줄 세기
export function bodyFinish(T, paint, { w, l }, style, stripe, look = {}) {
  const material = paint.clone();
  const regions = { value: new T.Vector4() };
  const wear = { value: 0 };
  material.onBeforeCompile = shader => {
    coordinates(shader);
    shader.uniforms.carDamage = regions;
    shader.uniforms.carWear = wear;
    shader.uniforms.carSize = { value: new T.Vector2(w, l) };
    shader.uniforms.carStyle = { value: style };
    shader.uniforms.carStripe = { value: new T.Color(stripe) };
    shader.uniforms.carLower = { value: new T.Color(look.lower || stripe) };
    shader.uniforms.carBelt = { value: new T.Vector2(...(look.belt || [0, 0])) };
    shader.uniforms.carSpine = { value: look.spine || 0 };
    shader.uniforms.carPin = { value: look.pin ?? 1 };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 carSurface;
        uniform vec4 carDamage;
        uniform vec2 carSize;
        uniform vec3 carStripe, carLower;
        uniform vec2 carBelt;
        uniform float carWear, carStyle, carSpine, carPin;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 p = carSurface;
        float x = abs(p.x);
        float flank = x / carSize.x;
        float hood = smoothstep(.37, .58, p.y) * (1.0 - smoothstep(.57, .68, flank));
        float racing = 0.0;
        if (carStyle < .5) {
          racing = 1.0 - smoothstep(.108, .117, abs(p.x + .21));
        } else if (carStyle < 1.5) {
          racing = 1.0 - smoothstep(.275, .283, x + p.z * .035);
        } else if (carStyle < 2.5) {
          racing = 1.0 - smoothstep(.070, .078, abs(x - .148));
        } else if (carStyle < 3.5) {
          racing = 1.0 - smoothstep(.328, .337, x);
        } else if (carSpine > 0.0) {
          racing = 1.0 - smoothstep(carSpine, carSpine + .007, x);
        }
        diffuseColor.rgb = mix(diffuseColor.rgb, carStripe, hood * racing * .95);
        if (carBelt.x > 0.0) {
          float lower = 1.0 - smoothstep(-.008, .008, p.y - carBelt.x - carBelt.y * p.z);
          diffuseColor.rgb = mix(diffuseColor.rgb, carLower, lower);
        }
        float pin = 1.0 - smoothstep(.011, .019, abs(p.y - (.355 + .065 * p.z)));
        diffuseColor.rgb = mix(diffuseColor.rgb, carStripe, pin * smoothstep(.80, .97, flank) * .74 * carPin);
        float face = p.z < 0.0 ? carDamage.x : carDamage.y;
        float sideDamage = p.x < 0.0 ? carDamage.z : carDamage.w;
        float area = max(face * smoothstep(.46, .88, abs(p.z) / carSize.y),
          sideDamage * smoothstep(.71, .98, flank));
        float g = fract(sin(dot(floor(p.xz * 31.0), vec2(12.9898, 78.233))) * 43758.5453);
        float line = abs(sin(p.y * 152.0 + p.z * 13.0 + sin(p.z * 7.5) * .71 + p.x * 30.0));
        float scrape = smoothstep(.21, .68, area) * ( .17 + .67 * (1.0 - smoothstep(.08, .35, line)) * g );
        float grime = carWear * smoothstep(.68, 1.0, flank) * (1.0 - smoothstep(.32, .57, p.y));
        diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(.036, .043, .047), vec3(.39, .34, .29), g),
          clamp(scrape + grime * .47, 0.0, .90));`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, .89, clamp(scrape + grime * .5, 0.0, .85));`);
  };
  return { material, regions: regions.value, wear };
}

export function fractureMap(T) {
  const field = document.createElement('canvas');
  field.width = field.height = 256;
  const ctx = field.getContext('2d');
  const noise = i => {
    const n = Math.sin(i * 74.81 + 3.79) * 43758.5453;
    return n - Math.floor(n);
  };
  const origin = [105, 135];
  const spokes = Array.from({ length: 16 }, (_, i) => {
    const angle = (i + noise(i) * .68) * Math.PI / 8;
    return [Math.cos(angle), Math.sin(angle)];
  });
  for (const [i, [x, y]] of spokes.entries()) {
    const length = 74 + noise(i * 3) * 103;
    ctx.strokeStyle = `rgba(224,242,252,${.38 + noise(i + 42) * .49})`;
    ctx.lineWidth = i % 4 === 0 ? 1.2 : .72;
    ctx.beginPath();
    ctx.moveTo(...origin);
    for (let k = 1; k <= 5; k++) {
      const jitter = (noise(i * 7 + k) - .5) * 13;
      const r = length * k / 5;
      ctx.lineTo(origin[0] + x * r - y * jitter, origin[1] + y * r + x * jitter);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(origin[0] + x * length * .54, origin[1] + y * length * .54);
    ctx.lineTo(origin[0] + x * length * .77 - y * 22, origin[1] + y * length * .77 + x * 22);
    ctx.stroke();
  }
  for (const radius of [16, 29, 45, 64]) {
    ctx.strokeStyle = 'rgba(212,234,248,0.52)';
    ctx.lineWidth = .65;
    ctx.beginPath();
    spokes.forEach(([x, y], i) => {
      const r = radius + noise(i * radius) * 15;
      ctx[i ? 'lineTo' : 'moveTo'](origin[0] + x * r, origin[1] + y * r);
    });
    ctx.closePath();
    ctx.stroke();
  }
  const chip = ctx.createRadialGradient(origin[0], origin[1], 1, origin[0], origin[1], 28);
  chip.addColorStop(0, 'rgba(216,237,244,0.67)');
  chip.addColorStop(1, 'rgba(216,237,244,0)');
  ctx.fillStyle = chip;
  ctx.fillRect(0, 0, 256, 256);
  return new T.CanvasTexture(field);
}

export function glassFinish(T, glass, { w, front, rear }, texture) {
  const material = glass.clone();
  const cracks = { value: new T.Vector2() };
  material.onBeforeCompile = shader => {
    coordinates(shader);
    shader.uniforms.crackMap = { value: texture };
    shader.uniforms.crackStrength = cracks;
    shader.uniforms.crackSpan = { value: new T.Vector3(w, front, rear) };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 carSurface;
        uniform sampler2D crackMap;
        uniform vec2 crackStrength;
        uniform vec3 crackSpan;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 p = carSurface;
        float section = p.z > .04 ? clamp((p.z - crackSpan.z * .46) / (.72 + crackSpan.z * .54), 0.0, 1.0)
          : clamp((crackSpan.y + .13 - p.z) / 1.0, 0.0, 1.0);
        float across = p.x / (crackSpan.x * 1.28) + .5;
        float frost = texture2D(crackMap, vec2(across, section)).a;
        float materialCrack = frost * (p.z > .04 ? crackStrength.y : crackStrength.x)
          * smoothstep(.02, .12, section) * (1.0 - smoothstep(.96, 1.0, section));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.63, .81, .88), materialCrack);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, .64, materialCrack);`);
  };
  return { material, cracks: cracks.value };
}
