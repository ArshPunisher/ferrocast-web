// Hero: Twitch, YouTube and Kick flow in as three bundles of strands and braid into one
// channel that lands in the Ferrocast mark. Strands are ribbons extruded in screen space
// in the vertex shader (one draw call); "packets" are messages travelling along them.
// Platform colours appear only here.
import * as THREE from 'three'

export interface BraidLayout {
  start: number; merge: number; end: number; badge: number
  Y: [number, number, number]; Z: [number, number, number]; R: number
}
export const BRAID_DESKTOP: BraidLayout = { start: 6.6, merge: -0.2, end: -2.65, badge: 2.55, Y: [3.4, 0.25, -3.2], Z: [-1.6, 1.3, -0.4], R: 0.4 }
export const BRAID_MOBILE: BraidLayout = { start: 4.6, merge: 0, end: -2.35, badge: 2.35, Y: [2.0, 0.1, -1.9], Z: [-1.2, 1.0, -0.2], R: 0.26 }

const PATH = /* glsl */ `
  uniform float uTime, uStart, uMerge, uEnd; uniform vec3 uY, uZ;
  float pick(vec3 v, float k) { return k < 0.5 ? v.x : (k < 1.5 ? v.y : v.z); }
  vec3 center(float x, float k) {
    float e = smoothstep(uMerge, uStart, x); e = e * e * (3.0 - 2.0 * e);
    vec3 c = vec3(x, pick(uY, k) * e, pick(uZ, k) * e);
    c.y += 0.16 * sin(x * 0.7 - uTime * 0.55) * smoothstep(uEnd, uEnd + 1.5, x);
    c.z += 0.2 * sin(x * 0.45 + uTime * 0.4 + k * 2.0) * e;
    return c;
  }
  vec3 strand(float x, float k, float r, float th) {
    vec3 c = center(x, k);
    float merged = 1.0 - smoothstep(uMerge - 0.4, uMerge + 1.8, x);
    float into = smoothstep(uEnd + 0.15, uEnd + 2.6, x);
    float rad = r * mix(1.0, 1.35, merged) * into;
    float a = th + x * 0.75 + uTime * 0.35;
    return c + vec3(0.0, cos(a) * rad, sin(a) * rad);
  }`

const DARK = { c: ['#9d6bff', '#ff5468', '#4fd62a'], merge: '#33d4ff', hot: '#ffd59a' }
const LIGHT = { c: ['#7a2ee6', '#e1102f', '#17913a'], merge: '#0888b8', hot: '#a35b00' }

export function createBraid(mobile: boolean) {
  const L = mobile ? BRAID_MOBILE : BRAID_DESKTOP
  const group = new THREE.Group()
  const STRANDS = mobile ? 20 : 34, SEG = mobile ? 100 : 170
  const nStr = STRANDS * 3, vPer = (SEG + 1) * 2
  const aT = new Float32Array(nStr * vPer), aSide = new Float32Array(nStr * vPer), aS = new Float32Array(nStr * vPer * 4)
  const idx: number[] = []
  for (let s = 0; s < nStr; s++) {
    const stream = s % 3, r = L.R * Math.sqrt(Math.random()), th = Math.random() * Math.PI * 2, ph = Math.random()
    for (let i = 0; i <= SEG; i++)
      for (let side = 0; side < 2; side++) {
        const v = s * vPer + i * 2 + side
        aT[v] = i / SEG
        aSide[v] = side ? 1 : -1
        aS.set([stream, r, th, ph], v * 4)
      }
    for (let i = 0; i < SEG; i++) {
      const b = s * vPer + i * 2
      idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2)
    }
  }
  const ribGeo = new THREE.BufferGeometry()
  ribGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nStr * vPer * 3), 3))
  ribGeo.setAttribute('aT', new THREE.BufferAttribute(aT, 1))
  ribGeo.setAttribute('aSide', new THREE.BufferAttribute(aSide, 1))
  ribGeo.setAttribute('aS', new THREE.BufferAttribute(aS, 4))
  ribGeo.setIndex(idx)

  const u = {
    uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uDpr: { value: 1 },
    uStart: { value: L.start }, uMerge: { value: L.merge }, uEnd: { value: L.end },
    uY: { value: new THREE.Vector3(...L.Y) }, uZ: { value: new THREE.Vector3(...L.Z) },
    uC0: { value: new THREE.Color() }, uC1: { value: new THREE.Color() }, uC2: { value: new THREE.Color() },
    uMergeC: { value: new THREE.Color() }, uHot: { value: new THREE.Color() }, uTheme: { value: 0 }, uAlpha: { value: 1 },
    uWidth: { value: mobile ? 1.3 : 1.5 },
  }
  const ribMat = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      ${PATH}
      uniform vec2 uRes; uniform float uWidth;
      attribute float aT, aSide; attribute vec4 aS;
      varying float vSide; varying float vX; varying float vK; varying float vPh;
      void main() {
        float x = mix(uStart + 0.6, uEnd, aT);
        vec3 p0 = strand(x, aS.x, aS.y, aS.z);
        vec3 p1 = strand(x - 0.03, aS.x, aS.y, aS.z);
        vec4 c0 = projectionMatrix * modelViewMatrix * vec4(p0, 1.0);
        vec4 c1 = projectionMatrix * modelViewMatrix * vec4(p1, 1.0);
        vec2 d = normalize((c1.xy / c1.w - c0.xy / c0.w) * uRes + 1e-6);
        c0.xy += vec2(-d.y, d.x) * aSide * uWidth * 2.0 / uRes * c0.w;
        gl_Position = c0;
        vSide = aSide; vX = x; vK = aS.x; vPh = aS.w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uStart, uMerge, uEnd, uTheme, uAlpha;
      uniform vec3 uC0, uC1, uC2, uMergeC, uHot;
      varying float vSide; varying float vX; varying float vK; varying float vPh;
      void main() {
        float aa = 1.0 - smoothstep(0.35, 1.0, abs(vSide));
        vec3 sc = vK < 0.5 ? uC0 : (vK < 1.5 ? uC1 : uC2);
        vec3 col = mix(sc, uMergeC, smoothstep(uMerge + 0.9, uMerge - 0.7, vX));
        float pulse = pow(0.5 + 0.5 * sin(vX * 1.9 + uTime * 2.4 + vPh * 6.2831), 14.0);
        col = mix(col, uHot, pulse * 0.5 * (1.0 - uTheme * 0.5));
        float fade = smoothstep(uStart + 0.6, uStart - 1.2, vX) * smoothstep(uEnd, uEnd + 0.5, vX);
        gl_FragColor = vec4(col, aa * fade * (0.42 + pulse * 0.75) * uAlpha);
      }`,
  })
  const ribbons = new THREE.Mesh(ribGeo, ribMat)
  ribbons.frustumCulled = false
  group.add(ribbons)

  const NPK = mobile ? 110 : 240
  const pk = new Float32Array(NPK * 4), pk2 = new Float32Array(NPK)
  for (let i = 0; i < NPK; i++) {
    pk.set([i % 3, L.R * Math.sqrt(Math.random()), Math.random() * 6.283, Math.random()], i * 4)
    pk2[i] = 0.05 + Math.random() * 0.05
  }
  const pkGeo = new THREE.BufferGeometry()
  pkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NPK * 3), 3))
  pkGeo.setAttribute('aS', new THREE.BufferAttribute(pk, 4))
  pkGeo.setAttribute('aSpeed', new THREE.BufferAttribute(pk2, 1))
  const pkMat = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, depthTest: false,
    vertexShader: /* glsl */ `
      ${PATH}
      uniform float uDpr; attribute vec4 aS; attribute float aSpeed;
      varying float vX; varying float vK; varying float vF;
      void main() {
        float f = fract(aS.w + uTime * aSpeed);
        float x = mix(uStart, uEnd + 0.2, f);
        vec4 mv = modelViewMatrix * vec4(strand(x, aS.x, aS.y, aS.z), 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uDpr * 7.0 * (18.0 / -mv.z);
        vX = x; vK = aS.x; vF = smoothstep(0.0, 0.06, f) * smoothstep(1.0, 0.9, f);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uMerge, uTheme, uAlpha; uniform vec3 uC0, uC1, uC2, uMergeC, uHot;
      varying float vX; varying float vK; varying float vF;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        vec3 sc = vK < 0.5 ? uC0 : (vK < 1.5 ? uC1 : uC2);
        vec3 col = mix(sc, uMergeC, smoothstep(uMerge + 0.9, uMerge - 0.7, vX));
        float dark = smoothstep(0.42, 0.0, r) * 0.9 + smoothstep(0.18, 0.05, r);
        col = mix(col, uHot, smoothstep(0.25, 0.0, r) * (1.0 - uTheme));
        gl_FragColor = vec4(col, mix(dark, smoothstep(0.5, 0.36, r), uTheme) * vF * uAlpha);
      }`,
  })
  const packets = new THREE.Points(pkGeo, pkMat)
  packets.frustumCulled = false
  group.add(packets)

  const tmp = new THREE.Color(), tmp2 = new THREE.Color()
  function setTheme(m: number) {
    ;(['uC0', 'uC1', 'uC2'] as const).forEach((k, i) => u[k].value.set(DARK.c[i] as string).lerp(tmp.set(LIGHT.c[i] as string), m))
    u.uMergeC.value.set(DARK.merge).lerp(tmp2.set(LIGHT.merge), m)
    u.uHot.value.set(DARK.hot).lerp(tmp2.set(LIGHT.hot), m)
    u.uTheme.value = m
    const light = m > 0.5
    ribMat.blending = pkMat.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending
  }

  const sstep = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)
  }
  /** CPU copy of center() for placing the HTML chips. */
  function center(x: number, k: number, t: number, out: THREE.Vector3) {
    let e = sstep(L.merge, L.start, x)
    e = e * e * (3 - 2 * e)
    return out.set(
      x,
      (L.Y[k] as number) * e + 0.16 * Math.sin(x * 0.7 - t * 0.55) * sstep(L.end, L.end + 1.5, x),
      (L.Z[k] as number) * e + 0.2 * Math.sin(x * 0.45 + t * 0.4 + k * 2) * e,
    )
  }

  return {
    group, layout: L, uniforms: u, setTheme, center,
    dispose() { ribGeo.dispose(); pkGeo.dispose(); ribMat.dispose(); pkMat.dispose() },
  }
}
export type Braid = ReturnType<typeof createBraid>
