import { describe, expect, it } from 'vitest'
import {
  BRAND_SPOTS,
  EVENT_KEYS,
  SCENE_KEYS,
  isBrandLayer,
  validateDesign,
  type Design,
} from '@ferrocast/api'
import { BUILTINS, catalog } from '../src'

const of = <K extends Design['kind']>(k: K) =>
  BUILTINS.filter((d): d is Extract<Design, { kind: K }> => d.kind === k)

describe('built-in catalogue', () => {
  it('every built-in passes the engine’s checks', () => {
    for (const d of BUILTINS) expect(validateDesign(d), d.id).toBeNull()
  })

  it('ids are unique, stable and namespaced; every built-in is branded', () => {
    const ids = BUILTINS.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const d of BUILTINS) {
      expect(d.id).toMatch(/^builtin\.[a-z0-9-]+$/)
      expect(d.built_in && d.branded).toBe(true)
      expect(d.origin.type).toBe('built_in')
      expect(d.name.length).toBeGreaterThan(0)
      expect(d.description).not.toMatch(/[—–]/)
    }
  })

  it('has at least six alert styles that differ in structure, not just colour', () => {
    const alerts = of('alert')
    expect(alerts.length).toBeGreaterThanOrEqual(6)
    const shape = (d: (typeof alerts)[number]) => {
      const l = d.content.events.tip!.variations[0]!.look
      return `${l.frame}|${l.layout}|${l.anim.in}|${l.anim.text}|${l.brand}`
    }
    const frames = new Set(alerts.map((d) => d.content.events.tip!.variations[0]!.look.frame))
    expect(frames.size).toBeGreaterThanOrEqual(6)
    expect(new Set(alerts.map(shape)).size).toBe(alerts.length)
    // The mark is placed differently per design.
    const spots = new Set(alerts.map((d) => d.content.events.tip!.variations[0]!.look.brand))
    expect(spots.size).toBeGreaterThanOrEqual(5)
    for (const s of spots) expect(BRAND_SPOTS).toContain(s)
  })

  it('every alert design covers every event', () => {
    for (const d of of('alert'))
      for (const k of EVENT_KEYS) expect(d.content.events[k], `${d.id} ${k}`).toBeDefined()
  })

  it('has twelve or more full themes with the five standard scenes, each carrying the mark and live widgets', () => {
    const themes = of('theme')
    expect(themes.length).toBeGreaterThanOrEqual(12)
    for (const t of themes) {
      const keys = t.content.scenes.map((s) => s.key)
      for (const k of ['brb', 'ending', 'in_game', 'just_chatting', 'starting_soon'])
        expect(keys, t.id).toContain(k)
      // The 25 Oct break screens come as a set, and nothing else (custom keys are the streamer's).
      expect(
        keys.every((k) => (SCENE_KEYS as readonly string[]).includes(k)),
        t.id,
      ).toBe(true)
      expect(new Set(keys).size, `${t.id} lists a screen twice`).toBe(keys.length)
      for (const s of t.content.scenes) {
        expect(s.layers.filter(isBrandLayer), `${t.id}/${s.key}`).toHaveLength(1)
        expect(
          s.layers.some((l) => l.kind !== 'layer'),
          `${t.id}/${s.key} has a live widget`,
        ).toBe(true)
      }
      expect(BUILTINS.some((d) => d.id === t.content.alert_design && d.kind === 'alert')).toBe(true)
    }
  })

  it('has widget designs for the goal bar, labels, event list and chat box', () => {
    const kinds = new Set(of('widget').map((w) => w.content.widget))
    for (const k of ['goal', 'label', 'events', 'chat'] as const) expect(kinds).toContain(k)
    for (const w of of('widget')) expect(w.content.style.brand, w.id).toBeDefined()
  })

  it('the catalogue file is plain JSON the engine can read', () => {
    const c = JSON.parse(JSON.stringify(catalog()))
    expect(c.format).toBe('ferrocast-designs')
    expect(c.version).toBe(1)
    expect(c.designs).toHaveLength(BUILTINS.length)
    expect(JSON.stringify(c)).not.toContain('undefined')
  })
})
