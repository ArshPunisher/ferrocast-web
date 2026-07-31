// Scroll position for the story sections: one sticky 3D stage beside a column of beats.
// State 0 is the overview as the section scrolls in; state k is beat k centred on screen.
// On phones every beat has its own small stage, which eases into its beat as it appears.
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
export const mix = (a: number, b: number, t: number) => a + (b - a) * t
export const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
/** Hold each beat still for most of its stretch; move only between beats. */
export function plateau(s: number, hold = 0.28) {
  const i = Math.floor(s),
    f = s - i
  return i + easeInOut(smooth(hold, 1 - hold, f))
}
/** How much beat k is showing at state s: 1 on it, 0 one beat away. */
export const weight = (s: number, k: number) => clamp(1 - Math.abs(s - k), 0, 1)

/**
 * The target state for a stage. The sticky stage follows the beat nearest the middle of the
 * screen; a phone slot (data-beat) only knows its own beat.
 */
export function storyTarget(el: HTMLElement, reduced: boolean): number {
  const vh = innerHeight
  const own = Number(el.dataset.beat ?? 0)
  if (own) {
    if (reduced) return own
    const r = el.getBoundingClientRect()
    return own - 1 + clamp((vh - r.top) / (vh * 0.62), 0, 1)
  }
  const story = el.closest<HTMLElement>('[data-story]')
  if (!story) return 0
  const beats = [...story.querySelectorAll<HTMLElement>('[data-beat-text]')]
  if (!beats.length) return 0
  const mid = vh * 0.5
  const cs = beats.map((b) => {
    const r = b.getBoundingClientRect()
    return r.top + r.height / 2
  })
  const top = story.getBoundingClientRect().top
  let s = 0
  const first = cs[0] as number
  if (mid <= first) s = clamp((mid - top) / Math.max(1, first - top), 0, 1)
  else if (mid >= (cs[cs.length - 1] as number)) s = cs.length
  else
    for (let i = 0; i < cs.length - 1; i++) {
      const a = cs[i] as number,
        b = cs[i + 1] as number
      if (mid >= a && mid < b) {
        s = 1 + i + (mid - a) / (b - a)
        break
      }
    }
  return reduced ? Math.round(s) : s
}

/** Eases a value toward its target with real time; reports when it has arrived. */
export function follower(rate = 4) {
  let v = -1
  return {
    get value() {
      return v
    },
    step(target: number, dt: number, snap: boolean) {
      if (v < 0 || snap) v = target
      else v += (target - v) * (1 - Math.exp(-dt * rate))
      if (Math.abs(target - v) < 1e-4) v = target
      return v
    },
    settled(target: number) {
      return Math.abs(target - v) < 1e-4
    },
  }
}
