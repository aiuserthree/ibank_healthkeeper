// 힉스필드(이미지 → 3D)로 만든 차 몸통 — 시작할 때 미리 받아 두고, 차를 만들 때 있으면 코드로 짠 몸통 대신 쓴다.
// .bin: Uint32 정점 수 · Uint32 인덱스 수, 정점마다 Float32 위치 3 · Int8 법선 3(+1) · Uint16 UV 2, 그다음 인덱스(Uint16/Uint32).
// 바퀴는 변환 때 잘라 냈다 — 게임이 굴러가는 바퀴를 그 자리(axles)에 단다
export const carMeshes = new Map();

export async function loadCarMesh(T, shape, root) {
  if (carMeshes.has(shape)) return carMeshes.get(shape);
  const [buf, texture] = await Promise.all([
    fetch(`${root}cars/${shape}.bin?v=1`).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }),
    new T.TextureLoader().loadAsync(`${root}cars/${shape}.webp?v=1`),
  ]);
  const dv = new DataView(buf);
  const nv = dv.getUint32(0, true), ni = dv.getUint32(4, true), stride = 20;
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
  for (let i = 0; i < nv; i++) {
    const o = 8 + i * stride;
    for (let k = 0; k < 3; k++) {
      pos[i * 3 + k] = dv.getFloat32(o + k * 4, true);
      nrm[i * 3 + k] = dv.getInt8(o + 12 + k) / 127;
    }
    uv[i * 2] = dv.getUint16(o + 16, true) / 65535;
    uv[i * 2 + 1] = dv.getUint16(o + 18, true) / 65535;
  }
  const at = 8 + nv * stride;
  const index = nv < 65536 ? new Uint16Array(buf.slice(at, at + ni * 2)) : new Uint32Array(buf.slice(at, at + ni * 4));
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new T.BufferAttribute(nrm, 3));
  geometry.setAttribute('uv', new T.BufferAttribute(uv, 2));
  geometry.setIndex(new T.BufferAttribute(index, 1));
  texture.colorSpace = T.SRGBColorSpace;
  texture.flipY = false;
  texture.anisotropy = 4;
  const mesh = { geometry, texture };
  carMeshes.set(shape, mesh);
  return mesh;
}
