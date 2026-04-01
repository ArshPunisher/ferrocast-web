// The site's ferrofluid shader (packages/ui/src/ferro/shader.ts), with two fixes applied for
// two fixes applied for the video renders until it lands upstream: rays that graze the floor
// near the horizon run out of march steps and came back as "sky", punching black holes
// behind the puddle. A ray that points down now always lands on the floor plane.
// The replacement is a no-op if the upstream text has already changed.
import { FRAG, VERT } from '../../../../packages/ui/src/ferro/shader'

const patch = (src: string, from: string, to: string) =>
  src.includes(from) ? src.replace(from, to) : src

let frag = FRAG
frag = patch(
  frag,
  '  if (hit) {\n',
  '  if (!hit && rd.y < 0.0) { t = -ro.y / rd.y; hit = true; }\n  if (hit) {\n',
)

// The puddle is a near-perfect mirror at grazing angles, so the broad cobalt rim lobe and the
// horizon band washed the whole surface blue. Keep only the sharp rim so the fluid reads as
// glossy black with cobalt edges.
frag = patch(
  frag,
  'pow(k3, 7.0) * 2.4 + pow(k3, 2.0) * 0.18',
  'pow(k3, 16.0) * 2.0 + pow(k3, 3.0) * 0.012',
)
frag = patch(
  frag,
  'col += toLin(uAccent) * 0.35 * exp(-abs(y) * 22.0);',
  'col += toLin(uAccent) * 0.05 * exp(-abs(y) * 30.0);',
)

export const FRAG_VIDEO = frag

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export interface Magnet {
  x: number
  z: number
  strength: number
}

/** Same uniforms and camera as `Ferrofluid` in @ferrocast/ui, drawing with FRAG_VIDEO. */
export class FerroVideo {
  private readonly gl: WebGLRenderingContext
  private readonly prog: WebGLProgram
  private readonly u: Record<string, WebGLUniformLocation | null> = {}
  spike = 1

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly bg: string,
    private readonly accent: string,
  ) {
    const gl = canvas.getContext('webgl', {
      antialias: false,
      alpha: false,
      depth: false,
      preserveDrawingBuffer: true,
    })
    if (!gl) throw new Error('WebGL is not available')
    this.gl = gl
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)
      if (!s) throw new Error('shader')
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(s) ?? 'shader')
      return s
    }
    const prog = gl.createProgram()
    if (!prog) throw new Error('program')
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG_VIDEO))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(prog) ?? 'link')
    this.prog = prog
    gl.useProgram(prog)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'aPos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    for (const name of ['uRes', 'uTime', 'uMag', 'uBg', 'uAccent', 'uSpike', 'uLight'])
      this.u[name] = gl.getUniformLocation(prog, name)
  }

  render(timeSec: number, m: Magnet): void {
    const gl = this.gl
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.useProgram(this.prog)
    gl.uniform2f(this.u.uRes ?? null, this.canvas.width, this.canvas.height)
    gl.uniform1f(this.u.uTime ?? null, timeSec)
    gl.uniform3f(this.u.uMag ?? null, m.x * 1.1, m.z * 0.8, m.strength)
    gl.uniform3f(this.u.uBg ?? null, ...hexToRgb(this.bg))
    gl.uniform3f(this.u.uAccent ?? null, ...hexToRgb(this.accent))
    gl.uniform1f(this.u.uSpike ?? null, this.spike)
    gl.uniform1f(this.u.uLight ?? null, 0)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.finish()
  }
}
