// A small QR code encoder for pairing links (Settings › Dashboard anywhere). Written here,
// from ISO/IEC 18004, so the dashboard needs no dependency for it (GPL-3.0 like the rest).
// Byte mode only, error correction level M, versions 1 to 10 (up to 213 bytes: a pairing
// URL is about 60). Every mask is tried and the one with the lowest penalty is kept.

const ECC_PER_BLOCK_M = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26]
const BLOCKS_M = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5]
export const QR_MAX_VERSION = 10

// ---------------------------------------------------------------- GF(256) and Reed-Solomon

function gfMul(x: number, y: number): number {
  let z = 0
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> i) & 1) * x
  }
  return z & 0xff
}

/** The generator polynomial's coefficients, highest power first, without the leading 1. */
export function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0)
  result[degree - 1] = 1
  let root = 1
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMul(result[j]!, root)
      if (j + 1 < degree) result[j] = result[j]! ^ result[j + 1]!
    }
    root = gfMul(root, 0x02)
  }
  return result
}

/** The error correction codewords for `data`. */
export function rsRemainder(data: readonly number[], divisor: readonly number[]): number[] {
  const result = new Array<number>(divisor.length).fill(0)
  for (const b of data) {
    const factor = b ^ result.shift()!
    result.push(0)
    divisor.forEach((coef, i) => {
      result[i] = result[i]! ^ gfMul(coef, factor)
    })
  }
  return result
}

// ---------------------------------------------------------------- sizes

function rawModules(ver: number): number {
  let r = (16 * ver + 128) * ver + 64
  if (ver >= 2) {
    const align = Math.floor(ver / 7) + 2
    r -= (25 * align - 10) * align - 55
    if (ver >= 7) r -= 36
  }
  return r
}

function dataCodewords(ver: number): number {
  return Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK_M[ver]! * BLOCKS_M[ver]!
}

function alignmentPositions(ver: number): number[] {
  if (ver === 1) return []
  const n = Math.floor(ver / 7) + 2
  const size = ver * 4 + 17
  const step = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2
  const out = [6]
  for (let pos = size - 7; out.length < n; pos -= step) out.splice(1, 0, pos)
  return out
}

// ---------------------------------------------------------------- encoding

function codewords(bytes: Uint8Array, ver: number): number[] {
  const bits: number[] = []
  const put = (v: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1)
  }
  put(0b0100, 4)
  put(bytes.length, ver < 10 ? 8 : 16)
  for (const b of bytes) put(b, 8)
  const cap = dataCodewords(ver) * 8
  put(0, Math.min(4, cap - bits.length))
  put(0, (8 - (bits.length % 8)) % 8)
  const data: number[] = []
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j]!
    data.push(v)
  }
  for (let pad = 0xec; data.length < cap / 8; pad ^= 0xec ^ 0x11) data.push(pad)
  // Split into blocks, add each block's error correction, interleave.
  const blocks = BLOCKS_M[ver]!
  const ecc = ECC_PER_BLOCK_M[ver]!
  const raw = Math.floor(rawModules(ver) / 8)
  const shortBlocks = blocks - (raw % blocks)
  const shortLen = Math.floor(raw / blocks)
  const divisor = rsDivisor(ecc)
  const dataBlocks: number[][] = []
  const eccBlocks: number[][] = []
  for (let i = 0, k = 0; i < blocks; i++) {
    const len = shortLen - ecc + (i < shortBlocks ? 0 : 1)
    const d = data.slice(k, k + len)
    k += len
    dataBlocks.push(d)
    eccBlocks.push(rsRemainder(d, divisor))
  }
  const out: number[] = []
  const longest = Math.max(...dataBlocks.map((b) => b.length))
  for (let i = 0; i < longest; i++) for (const b of dataBlocks) if (i < b.length) out.push(b[i]!)
  for (let i = 0; i < ecc; i++) for (const b of eccBlocks) out.push(b[i]!)
  return out
}

/** The 15 format bits for level M and `mask`. */
export function formatBits(mask: number): number {
  const data = (0 << 3) | mask // level M is 0b00
  let rem = data
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
  return ((data << 10) | rem) ^ 0x5412
}

function versionBits(ver: number): number {
  let rem = ver
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
  return (ver << 12) | rem
}

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
]

class Grid {
  readonly dark: boolean[][]
  readonly fn: boolean[][]
  readonly size: number
  constructor(size: number) {
    this.size = size
    this.dark = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
    this.fn = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  }
  set(x: number, y: number, on: boolean): void {
    this.dark[y]![x] = on
    this.fn[y]![x] = true
  }
}

function drawFunctionPatterns(g: Grid, ver: number): void {
  const size = g.size
  for (let i = 0; i < size; i++) {
    g.set(6, i, i % 2 === 0)
    g.set(i, 6, i % 2 === 0)
  }
  const finder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx
        const y = cy + dy
        if (x < 0 || y < 0 || x >= size || y >= size) continue
        const d = Math.max(Math.abs(dx), Math.abs(dy))
        g.set(x, y, d !== 2 && d !== 4)
      }
  }
  finder(3, 3)
  finder(size - 4, 3)
  finder(3, size - 4)
  const pos = alignmentPositions(ver)
  const last = pos.length - 1
  pos.forEach((ay, i) =>
    pos.forEach((ax, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++)
          g.set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
    }),
  )
  drawFormat(g, 0)
  if (ver >= 7) {
    const bits = versionBits(ver)
    for (let i = 0; i < 18; i++) {
      const on = ((bits >>> i) & 1) === 1
      const a = size - 11 + (i % 3)
      const b = Math.floor(i / 3)
      g.set(a, b, on)
      g.set(b, a, on)
    }
  }
}

function drawFormat(g: Grid, mask: number): void {
  const bits = formatBits(mask)
  const bit = (i: number) => ((bits >>> i) & 1) === 1
  const size = g.size
  for (let i = 0; i <= 5; i++) g.set(8, i, bit(i))
  g.set(8, 7, bit(6))
  g.set(8, 8, bit(7))
  g.set(7, 8, bit(8))
  for (let i = 9; i < 15; i++) g.set(14 - i, 8, bit(i))
  for (let i = 0; i < 8; i++) g.set(size - 1 - i, 8, bit(i))
  for (let i = 8; i < 15; i++) g.set(8, size - 15 + i, bit(i))
  g.set(8, size - 8, true)
}

function drawCodewords(g: Grid, data: readonly number[]): void {
  const size = g.size
  let i = 0
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vert = 0; vert < size; vert++)
      for (let j = 0; j < 2; j++) {
        const x = right - j
        const upward = ((right + 1) & 2) === 0
        const y = upward ? size - 1 - vert : vert
        if (!g.fn[y]![x] && i < data.length * 8) {
          g.dark[y]![x] = ((data[i >>> 3]! >>> (7 - (i & 7))) & 1) === 1
          i++
        }
      }
  }
}

function applyMask(g: Grid, mask: number): void {
  const m = MASKS[mask]!
  for (let y = 0; y < g.size; y++)
    for (let x = 0; x < g.size; x++) if (!g.fn[y]![x] && m(x, y)) g.dark[y]![x] = !g.dark[y]![x]
}

function penalty(g: Grid): number {
  const n = g.size
  const at = (x: number, y: number) => g.dark[y]![x]!
  let p = 0
  const line = (get: (i: number) => boolean) => {
    let run = 1
    let s = ''
    for (let i = 0; i < n; i++) {
      s += get(i) ? '1' : '0'
      if (i > 0 && get(i) === get(i - 1)) {
        run++
        if (run === 5) p += 3
        else if (run > 5) p += 1
      } else run = 1
    }
    for (const pat of ['10111010000', '00001011101']) {
      for (let k = s.indexOf(pat); k !== -1; k = s.indexOf(pat, k + 1)) p += 40
    }
  }
  for (let y = 0; y < n; y++) line((x) => at(x, y))
  for (let x = 0; x < n; x++) line((y) => at(x, y))
  for (let y = 0; y < n - 1; y++)
    for (let x = 0; x < n - 1; x++) {
      const c = at(x, y)
      if (c === at(x + 1, y) && c === at(x, y + 1) && c === at(x + 1, y + 1)) p += 3
    }
  let dark = 0
  for (const row of g.dark) for (const d of row) if (d) dark++
  const total = n * n
  p += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10
  return p
}

/** The smallest version (1 to 10) that holds `bytes`, or null. */
export function qrVersionFor(length: number): number | null {
  for (let v = 1; v <= QR_MAX_VERSION; v++) {
    const need = 4 + (v < 10 ? 8 : 16) + 8 * length
    if (need <= dataCodewords(v) * 8) return v
  }
  return null
}

/** A QR code for `text` as rows of modules (true = dark), without the quiet zone. */
export function qrEncode(text: string): {
  size: number
  modules: boolean[][]
  version: number
  mask: number
} {
  const bytes = new TextEncoder().encode(text)
  const ver = qrVersionFor(bytes.length)
  if (ver === null) throw new Error('Too long for a QR code here.')
  const data = codewords(bytes, ver)
  let best: { g: Grid; mask: number; score: number } | null = null
  for (let mask = 0; mask < 8; mask++) {
    const g = new Grid(ver * 4 + 17)
    drawFunctionPatterns(g, ver)
    drawCodewords(g, data)
    applyMask(g, mask)
    drawFormat(g, mask)
    const score = penalty(g)
    if (!best || score < best.score) best = { g, mask, score }
  }
  return { size: best!.g.size, modules: best!.g.dark, version: ver, mask: best!.mask }
}
