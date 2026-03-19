// The Ferrocast mark: a drop of ferrofluid rising into five spikes toward a magnet.
// Generated, not hand-drawn, so empty states can animate the spike heights and the logo,
// the app icon and the favicon all come from the same geometry.

export interface SpikeSpec {
  /** Centre x of the spike. */
  x: number
  /** Tip height above the valley line (positive = up). */
  h: number
}

/**
 * Builds the outline of a puddle with concave spikes in a 64×64 box.
 * `valley` is the y of the troughs between spikes, `base` the y of the puddle rim.
 */
export function spikePath(
  spikes: SpikeSpec[],
  opts: { valley?: number; base?: number; left?: number; right?: number; belly?: number } = {},
): string {
  const valley = opts.valley ?? 46
  const base = opts.base ?? 49
  const left = opts.left ?? 4
  const right = opts.right ?? 60
  const belly = opts.belly ?? 59
  const r = (n: number) => Math.round(n * 100) / 100
  const s = [...spikes].sort((a, b) => a.x - b.x)
  if (s.length === 0)
    return `M${left} ${base} C${left} ${belly} ${right} ${belly} ${right} ${base} Z`
  let d = `M${left} ${base}`
  let prevX = left
  let prevY = base
  for (let i = 0; i < s.length; i++) {
    const sp = s[i] as SpikeSpec
    const tipY = valley - sp.h
    // Rising wall: leaves the trough flat, bends up sharply near the tip (concave cone).
    d += ` C${r(prevX + (sp.x - prevX) * 0.42)} ${r(prevY)} ${r(sp.x - (sp.x - prevX) * 0.2)} ${r(tipY + sp.h * 0.38)} ${r(sp.x)} ${r(tipY)}`
    const next = s[i + 1]
    const nx = next ? (sp.x + next.x) / 2 : right
    const ny = next ? valley : base
    d += ` C${r(sp.x + (nx - sp.x) * 0.2)} ${r(tipY + sp.h * 0.38)} ${r(sp.x + (nx - sp.x) * 0.58)} ${r(ny)} ${r(nx)} ${r(ny)}`
    prevX = nx
    prevY = ny
  }
  d += ` C${right} ${r(belly - 2)} ${r(right - 12)} ${belly} 32 ${belly} C${r(left + 12)} ${belly} ${left} ${r(belly - 2)} ${left} ${base} Z`
  return d
}

/** The logo geometry: tallest spike in the middle, reaching for the magnet dot. */
export const MARK_SPIKES: SpikeSpec[] = [
  { x: 11, h: 9 },
  { x: 21.5, h: 18 },
  { x: 32, h: 28 },
  { x: 42.5, h: 18 },
  { x: 53, h: 9 },
]

export const SPIKE_MARK_PATH = spikePath(MARK_SPIKES)
/** The magnet: a cobalt dot above the tallest spike. */
export const MARK_MAGNET = { cx: 32, cy: 9, r: 4 }
