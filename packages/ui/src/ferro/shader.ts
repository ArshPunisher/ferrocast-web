// Ferrofluid in a fragment shader: a puddle of glossy black liquid metal whose surface
// rises into a hexagonal field of spikes (the Rosensweig instability) under a magnet.
// One full-screen pass: a raymarched height field, normals by finite differences, and a
// procedural studio (two softboxes and a cobalt rim light) for the reflections.

export const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`

export const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uMag;     // magnet x, z on the floor plane, strength 0..1
uniform vec3 uBg;      // page background, sRGB 0..1
uniform vec3 uAccent;  // cobalt, sRGB 0..1
uniform float uSpike;  // overall spike height multiplier
uniform float uLight;  // 1.0 on light pages: lighter studio

const float S = 0.27;          // lattice spacing
const float R = S * 0.5;       // spike base radius

float hexSpikes(vec2 p) {
  vec2 r = vec2(1.0, 1.7320508) * S;
  vec2 h = r * 0.5;
  vec2 a = mod(p, r) - h;
  vec2 b = mod(p - h, r) - h;
  vec2 g = dot(a, a) < dot(b, b) ? a : b;
  vec2 c = p - g;
  float d = length(g);
  vec2 dm = c - uMag.xy;
  float env = exp(-dot(dm, dm) / 0.55) * uMag.z;
  float pud = smoothstep(1.55, 0.55, length(c * vec2(0.95, 1.35)));
  float wob = 0.86 + 0.14 * sin(uTime * 1.7 + c.x * 9.0 + c.y * 6.0);
  float amp = 0.62 * uSpike * (0.18 + env) * pud * wob;
  float prof = pow(max(0.0, 1.0 - d / R), 2.3);
  return amp * prof;
}

float mound(vec2 p) {
  float r = length(p * vec2(0.95, 1.35));
  float base = 0.2 * pow(max(0.0, 1.0 - (r * r) / 2.6), 1.6);
  vec2 dm = p - uMag.xy;
  float pull = 0.09 * uMag.z * exp(-dot(dm, dm) / 0.35);
  return base + pull;
}

float H(vec2 p) { return mound(p) + hexSpikes(p); }

vec3 toLin(vec3 c) { return pow(c, vec3(2.2)); }

vec3 studio(vec3 d) {
  // A dark studio on both themes: the fluid stays glossy black on a light page too.
  float y = d.y;
  vec3 col = mix(vec3(0.004, 0.0045, 0.006), vec3(0.03, 0.033, 0.04), smoothstep(-0.15, 0.7, y));
  vec3 L1 = normalize(vec3(-0.55, 0.78, 0.35));
  vec3 L2 = normalize(vec3(0.75, 0.5, -0.1));
  vec3 L3 = normalize(vec3(0.05, 0.12, -1.0));
  float k1 = max(dot(d, L1), 0.0);
  float k2 = max(dot(d, L2), 0.0);
  float k3 = max(dot(d, L3), 0.0);
  col += vec3(1.0) * (pow(k1, 70.0) * 3.2 + pow(k1, 9.0) * 0.08);
  col += vec3(0.85, 0.9, 1.0) * pow(k2, 34.0) * (1.1 + uLight * 0.6);
  col += toLin(uAccent) * (pow(k3, 16.0) * 2.0 + pow(k3, 3.0) * 0.012);
  col += toLin(uAccent) * 0.05 * exp(-abs(y) * 30.0);
  return col;
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / uRes.y;
  vec3 ro = vec3(0.0, 1.05, 3.05);
  vec3 ta = vec3(0.0, 0.18, 0.0);
  vec3 f = normalize(ta - ro);
  vec3 rgt = normalize(cross(f, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(rgt, f);
  vec3 rd = normalize(f * 1.85 + uv.x * rgt + uv.y * up);

  vec3 col;
  float t = 0.0;
  bool hit = false;
  float fluid = 0.0;
  float shadow = 0.0;
  if (rd.y < 0.0 || ro.y < 1.2) {
    // Start the march where the ray drops below the tallest possible spike.
    float top = 1.0;
    t = rd.y < 0.0 ? max(0.0, (ro.y - top) / -rd.y) : 0.0;
    for (int i = 0; i < 120; i++) {
      vec3 p = ro + rd * t;
      float dy = p.y - H(p.xz);
      if (dy < 0.0008 * (1.0 + t)) { hit = true; break; }
      t += max(dy * 0.2, 0.0015 * t);
      if (t > 14.0) break;
    }
  }
  // Rays skimming the floor near the horizon can run out of steps: they hit the floor.
  if (!hit && rd.y < 0.0) { t = -ro.y / rd.y; hit = true; }
  if (hit) {
    // Two bisection steps to stop banding on the spike walls.
    float lo = t - 0.01, hi = t;
    for (int j = 0; j < 4; j++) {
      float mid = 0.5 * (lo + hi);
      vec3 pm = ro + rd * mid;
      if (pm.y - H(pm.xz) > 0.0) lo = mid; else hi = mid;
    }
    t = hi;
    vec3 p = ro + rd * t;
    float e = 0.0016;
    vec3 n = normalize(vec3(H(p.xz - vec2(e, 0.0)) - H(p.xz + vec2(e, 0.0)), 2.0 * e,
                            H(p.xz - vec2(0.0, e)) - H(p.xz + vec2(0.0, e))));
    vec3 rf = reflect(rd, n);
    float fres = 0.05 + 0.95 * pow(1.0 - max(dot(n, -rd), 0.0), 5.0);
    col = vec3(0.003, 0.0035, 0.005) + studio(rf) * mix(0.42, 1.0, fres);
    col *= 0.94 + 0.06 * n.y;
    // Outside the puddle the floor is the page itself, with a soft contact shadow.
    fluid = smoothstep(0.002, 0.03, H(p.xz));
    shadow = smoothstep(2.3, 0.9, length(p.xz * vec2(0.95, 1.35)));
  } else {
    col = toLin(uBg);
  }
  col = col / (1.0 + col);
  col = pow(col, vec3(1.0 / 2.2));
  vec3 floorCol = uBg * (1.0 - 0.28 * shadow * (1.0 - 0.5 * uLight));
  col = hit ? mix(floorCol, col, fluid) : col;
  float fog = hit ? smoothstep(3.2, 9.0, t) : 1.0;
  col = mix(col, uBg, fog);
  gl_FragColor = vec4(col, 1.0);
}
`
