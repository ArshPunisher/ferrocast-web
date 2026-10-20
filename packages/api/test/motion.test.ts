// The motion designer's model (1.1): defaults a 1.0 look reads as, the ids, the timing the
// timeline and the overlay share, recipes, copy and surprise, the checks, and the port of
// core::design::intensity_of.

import { describe, expect, it } from 'vitest'
import {
  ANIM_IN,
  ANIM_OUT,
  DEFAULT_MOTION,
  EXIT_MS,
  IN_INFO,
  MOTION_IN,
  MOTION_OUT,
  MOTION_TEXT,
  OUT_INFO,
  RECIPES,
  RECIPE_IDS,
  SIMPLE_IN,
  SIMPLE_OUT,
  TEXT_ANIMS,
  TEXT_INFO,
  applyRecipe,
  baseLook,
  copyMotion,
  designSample,
  entranceTiming,
  feelOf,
  intensityFor,
  intensityOf,
  motionOf,
  motionPlan,
  newAlertDesign,
  previewAlert,
  springOf,
  surpriseMotion,
  validateDesign,
  withAmount,
  withAnimChange,
  withMotionTiming,
  type AlertLook,
  type Design,
} from '../src'

const close = (a: number, b: number, eps = 1e-3) => Math.abs(a - b) < eps

/** A look as 1.0 saved it: no motion block. */
function look10(over: Partial<AlertLook> = {}): AlertLook {
  const l = baseLook(over)
  delete (l as { motion?: unknown }).motion
  return l
}

function designWith(l: AlertLook): Design {
  const d = newAlertDesign('Mine', l)
  return d
}

describe('a look saved before 1.1', () => {
  it('reads as the defaults, which change nothing', () => {
    const m = motionOf(look10())
    expect(m).toEqual(DEFAULT_MOTION)
    expect(m.idle).toBe('none')
    expect(m.position).toBe('mc')
    expect(m.impact_sounds).toBe(false)
    expect(m.beat).toBe(false)
  })

  it('keeps every 1.0 id as itself, and they are all still offered', () => {
    expect([...SIMPLE_IN].sort()).toEqual([...ANIM_IN].sort())
    expect([...SIMPLE_OUT].sort()).toEqual([...ANIM_OUT].sort())
    for (const t of TEXT_ANIMS) expect(TEXT_INFO[t].name).toBeTruthy()
    for (const i of ANIM_IN) expect(IN_INFO[i].name).toBeTruthy()
    for (const o of ANIM_OUT) expect(OUT_INFO[o].name).toBeTruthy()
  })

  it('times exactly as 1.0 did (in_ms, out_ms, text after 35% plus the delay)', () => {
    const l = look10()
    const p = motionPlan(l, { chars: 10 })
    expect(p.delay).toBe(0)
    expect(p.enter).toBe(l.anim.in_ms)
    expect(p.exit).toBe(l.anim.out_ms)
    expect(p.hit).toBeNull()
    expect(p.textAt).toBeCloseTo(l.anim.in_ms * 0.35 + l.anim.text_delay_ms)
  })

  it('is left alone by the timing sync', () => {
    const l = look10()
    expect(withMotionTiming(l)).toBe(l)
  })

  it('validates without a motion block', () => {
    expect(validateDesign(designWith(look10()))).toBeNull()
  })

  it('fills a partial block from a newer build', () => {
    const l = { ...look10(), motion: { idle: 'jelly' } } as unknown as AlertLook
    const m = motionOf(l)
    expect(m.idle).toBe('jelly')
    expect(m.bpm).toBe(120)
  })
})

describe('motion ids', () => {
  it('has the board’s 11 entrances, 9 exits and 9 text effects with names', () => {
    expect(MOTION_IN).toHaveLength(11)
    expect(MOTION_OUT).toHaveLength(9)
    expect(MOTION_TEXT.filter((t) => t !== 'none')).toHaveLength(9)
    for (const i of MOTION_IN) expect(IN_INFO[i].desc).toBeTruthy()
    for (const o of MOTION_OUT) expect(EXIT_MS[o]).toBeGreaterThan(0)
  })
})

describe('motion checks', () => {
  it('names each bad field', () => {
    const cases: [Partial<AlertLook['motion']>, string][] = [
      [{ bounce: 101 }, 'motion.bounce'],
      [{ speed: 59 }, 'motion.speed'],
      [{ speed: 161 }, 'motion.speed'],
      [{ stagger: 91 }, 'motion.stagger'],
      [{ bpm: 69 }, 'motion.bpm'],
      [{ bpm: Number.NaN }, 'motion.bpm'],
      [{ custom_color: 'red' }, 'motion.custom_color'],
    ]
    for (const [patch, field] of cases) {
      const l = baseLook({ motion: { ...DEFAULT_MOTION, ...patch } })
      const e = validateDesign(designWith(l))
      expect(e, field).toContain(field)
    }
  })

  it('takes the edges', () => {
    const l = baseLook({
      motion: { ...DEFAULT_MOTION, bounce: 0, speed: 160, stagger: 90, bpm: 70 },
    })
    expect(validateDesign(designWith(l))).toBeNull()
  })
})

describe('timing', () => {
  it('springs settle between 280 and 1500 ms, springier is longer', () => {
    expect(springOf(0).dur).toBeGreaterThanOrEqual(280)
    expect(springOf(100).dur).toBeLessThanOrEqual(1500)
    expect(springOf(80).dur).toBeGreaterThan(springOf(20).dur)
    expect(close(springOf(45)(5000), 1, 1e-3)).toBe(true)
    expect(springOf(Number.NaN).dur).toBe(springOf(45).dur)
  })

  it('a Slam lands at 170 ms and speed divides every length', () => {
    const l = baseLook({
      anim: { ...baseLook().anim, in: 'slam', out: 'shatter', text_delay_ms: 0 },
    })
    const dur = springOf(45).dur
    const p = motionPlan(l)
    expect(p.hit).toBe(170)
    expect(p.enter).toBe(170 + dur)
    expect(p.exit).toBe(EXIT_MS.shatter)
    const fast = motionPlan({ ...l, motion: { ...DEFAULT_MOTION, speed: 160 } })
    expect(fast.hit).toBeCloseTo(170 / 1.6)
    expect(fast.exit).toBeCloseTo(1000 / 1.6)
  })

  it('every entrance lands inside itself', () => {
    for (const b of [0, 45, 100])
      for (const id of MOTION_IN) {
        const t = entranceTiming(id, springOf(b).dur)
        expect(t.hit, id).toBeGreaterThan(0)
        expect(t.hit, id).toBeLessThan(t.T)
      }
  })

  it('lands the hit on a beat, never before the music starts', () => {
    for (const bpm of [70, 97, 120, 170]) {
      const l = baseLook({
        anim: { ...baseLook().anim, in: 'bolt' },
        motion: { ...DEFAULT_MOTION, beat: true, bpm },
      })
      const p = motionPlan(l)
      const beat = 60_000 / bpm
      expect(p.beat).toBeCloseTo(beat)
      expect(p.delay).toBeGreaterThanOrEqual(0)
      const n = (p.hit as number) / beat
      expect(close(n, Math.round(n), 1e-6)).toBe(true)
      expect(Math.round(n)).toBeGreaterThanOrEqual(2)
    }
  })

  it('reduced motion: short fades, no text effect, no hit', () => {
    const l = baseLook({ anim: { ...baseLook().anim, in: 'portal', out: 'iris', text: 'decode' } })
    const p = motionPlan(l, { reduced: true })
    expect(p.enter).toBe(240)
    expect(p.exit).toBe(220)
    expect(p.text).toBe(0)
    expect(p.hit).toBeNull()
  })

  it('long headlines stay quick', () => {
    const l = baseLook({ anim: { ...baseLook().anim, in: 'slam', text: 'cascade' } })
    expect(motionPlan(l, { chars: 300 }).text).toBeLessThan(1200 + springOf(45).dur + 1)
    const t = baseLook({ anim: { ...baseLook().anim, in: 'slam', text: 'type' } })
    expect(motionPlan(t, { chars: 300 }).text).toBeLessThanOrEqual(1400 + 900 + 1)
  })

  it('syncs in_ms, out_ms and the alert length for the 1.1 ids', () => {
    const l = baseLook({
      anim: { ...baseLook().anim, in: 'pour', out: 'dissolve' },
      motion: { ...DEFAULT_MOTION, speed: 60, beat: true, bpm: 70 },
      duration_ms: 2000,
    })
    const s = withMotionTiming(l)
    const p = motionPlan(l)
    expect(s.anim.in_ms).toBe(Math.min(3000, Math.round(p.delay + p.enter)))
    expect(s.anim.out_ms).toBe(Math.round(p.exit))
    expect(s.duration_ms).toBeGreaterThan(s.anim.in_ms + s.anim.out_ms)
    expect(validateDesign(designWith(s))).toBeNull()
  })
})

describe('editing helpers', () => {
  it('recipes set the whole motion and remember themselves', () => {
    for (const id of RECIPE_IDS) {
      const l = applyRecipe(look10(), id)
      const r = RECIPES[id].set
      expect(l.anim.in).toBe(r.in)
      expect(l.anim.out).toBe(r.out)
      expect(l.anim.text).toBe(r.text)
      expect(l.motion?.recipe).toBe(id)
      expect(l.motion?.idle).toBe(r.motion.idle)
      expect(validateDesign(designWith(l)), id).toBeNull()
    }
  })

  it('copying motion keeps the card’s own spot', () => {
    const from = applyRecipe(baseLook(), 'storm')
    const to = baseLook({ motion: { ...DEFAULT_MOTION, position: 'br' } })
    const c = copyMotion({ ...from, motion: { ...motionOf(from), position: 'tl' } }, to)
    expect(c.anim.in).toBe('bolt')
    expect(c.motion?.idle).toBe('heartbeat')
    expect(c.motion?.position).toBe('br')
  })

  it('surprise always makes sense: text and particles, never custom colours', () => {
    let seed = 1
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
    for (let i = 0; i < 200; i++) {
      const l = surpriseMotion(baseLook(), rand)
      expect(MOTION_IN).toContain(l.anim.in)
      expect(MOTION_OUT).toContain(l.anim.out)
      expect(l.anim.text).not.toBe('none')
      expect(l.motion?.particles).not.toBe('none')
      expect(l.motion?.colors).not.toBe('custom')
      expect(l.motion?.recipe).toBeNull()
    }
    // A generator that returns 1 must not index past the end.
    expect(() => surpriseMotion(baseLook(), () => 0.9999999)).not.toThrow()
  })

  it('feel presets are recognised', () => {
    expect(feelOf(DEFAULT_MOTION)).toBe('lively')
    expect(feelOf({ ...DEFAULT_MOTION, bounce: 15, speed: 80 })).toBe('calm')
    expect(feelOf({ ...DEFAULT_MOTION, bounce: 16 })).toBeNull()
  })
})

describe('intensity (core::design::intensity_of)', () => {
  it('follows the amount on a log scale', () => {
    expect(intensityFor(1)).toBe(1)
    expect(close(intensityFor(10), 1.5)).toBe(true)
    expect(intensityFor(100)).toBe(2)
    expect(intensityFor(1e6)).toBe(2)
    expect(close(intensityFor(0.1), 0.6)).toBe(true)
    for (const odd of [0, -1, Number.NaN, Number.POSITIVE_INFINITY])
      expect(intensityFor(odd)).toBe(1)
  })

  it('tips compare with a usual tip in their own currency', () => {
    const tip = designSample('tip')
    expect(tip).not.toBeNull()
    if (!tip || tip.kind.type !== 'tip') return
    const at = (amount: number, currency: string) => {
      const e = withAmount(tip, amount)
      if (e.kind.type === 'tip') e.kind.money = { ...e.kind.money, currency }
      const exp = currency === 'JPY' ? 1 : 100
      if (e.kind.type === 'tip') e.kind.money = { minor: Math.round(amount * exp), currency }
      return intensityOf(e)
    }
    expect(close(at(500, 'INR'), 1)).toBe(true)
    expect(close(at(50_000, 'INR'), 2)).toBe(true)
    expect(close(at(50, 'INR'), 0.6)).toBe(true)
    expect(close(at(5, 'USD'), 1)).toBe(true)
    expect(close(at(700, 'JPY'), 1)).toBe(true)
  })

  it('reaches the overlay through the design view', () => {
    const d = newAlertDesign('Mine')
    const a = previewAlert(d, 'tip', { amount: 50_000 })
    expect(a?.design?.intensity).toBeGreaterThan(1)
    const f = previewAlert(d, 'follow')
    expect(f?.design?.intensity).toBe(1)
  })
})

describe('review fixes', () => {
  it('the beat only moves the motion designer’s entrances', () => {
    const l = baseLook({ motion: { ...DEFAULT_MOTION, beat: true } })
    const p = motionPlan(l)
    expect(p.delay).toBe(0)
    expect(p.beat).toBeNull()
  })

  it('going back to a simple entrance or exit gets a simple length again', () => {
    const fresh = withMotionTiming(
      baseLook({
        anim: { ...baseLook().anim, in: 'pour', out: 'dissolve' },
        motion: { ...DEFAULT_MOTION, speed: 60 },
      }),
    )
    expect(fresh.anim.in_ms).toBeGreaterThan(1000)
    const back = withAnimChange(fresh, {
      ...fresh,
      anim: { ...fresh.anim, in: 'fade', out: 'fade' },
    })
    expect(back.anim.in_ms).toBe(650)
    expect(back.anim.out_ms).toBe(450)
  })

  it('refuses unknown names and a null motion block, like the engine', () => {
    const bad = [
      { ...DEFAULT_MOTION, idle: 'spin' },
      { ...DEFAULT_MOTION, position: 'middle' },
      { ...DEFAULT_MOTION, shake: 'yes' },
      { ...DEFAULT_MOTION, recipe: 'nope' },
    ]
    for (const motion of bad) {
      const l = { ...baseLook(), motion } as unknown as AlertLook
      expect(validateDesign(designWith(l))).toContain('motion.')
    }
    const nul = { ...baseLook(), motion: null } as unknown as AlertLook
    expect(validateDesign(designWith(nul))).toContain('motion')
  })
})
