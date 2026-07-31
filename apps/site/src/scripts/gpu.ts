// True only on a real GPU. Software renderers (SwiftShader, llvmpipe) would draw WebGL on
// the CPU, so the 3D stations and the banner's star field stay off there.
export function realGpu(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2')
    if (!gl) return false
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : ''
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return !/swiftshader|llvmpipe|softpipe|software|basic render/i.test(name)
  } catch {
    return false
  }
}
