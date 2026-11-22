import { describe, expect, it } from 'vitest'
import { AlertQueue, type QueueAction } from '../src/queue'
import { defaultRules, render, select } from '../src/alert'
import { anySample } from '../src/samples'
import type { AlertDesignView, FerroEvent, RenderedAlert } from '../src/types'

const tuning = { ack_grace_ms: 1000, gap_ms: 100, stale_after_ms: 60_000, max_waiting: 2 }

function alert(id: string, ms = 1000): RenderedAlert {
  const e = anySample('follow') as FerroEvent
  const sel = select(defaultRules(), e)!
  return { ...render(id, sel.rule, sel.variation, e), duration_ms: ms }
}
const shown = (a: QueueAction[]) => a.flatMap((x) => (x.type === 'show' ? [x.alert.alert_id] : []))
const hidden = (a: QueueAction[]) => a.flatMap((x) => (x.type === 'hide' ? [x.alert_id] : []))

describe('interrupt in the demo queue matches the engine', () => {
  it('ends the playing alert and shows at once, the waiting one keeps its place', () => {
    const q = new AlertQueue(tuning)
    q.enqueue(alert('a', 5000), 0, 0)
    q.enqueue(alert('w', 5000), 0, 1)
    const acts = q.enqueue(alert('i', 5000), 0, 100, true)
    expect(hidden(acts)).toEqual(['a'])
    expect(shown(acts)).toEqual(['i'])
    expect(q.snapshot().waiting.map((w) => w.alert.alert_id)).toEqual(['w'])
  })
  it('is never folded by the cap when the queue is full', () => {
    const q = new AlertQueue(tuning)
    q.enqueue(alert('p', 5000), 0, 0)
    q.enqueue(alert('w1', 5000), 5, 1)
    q.enqueue(alert('w2', 5000), 5, 2)
    const acts = q.enqueue(alert('i', 5000), -1, 10, true)
    expect(shown(acts)).toEqual(['i'])
    expect(acts.some((a) => a.type === 'folded')).toBe(false)
    expect(q.snapshot().waiting.map((w) => w.alert.alert_id)).toEqual(['w1', 'w2'])
  })
  it('goes first in the gap between two alerts, but never while paused', () => {
    const q = new AlertQueue(tuning)
    q.enqueue(alert('a', 1000), 0, 0)
    q.enqueue(alert('w', 1000), 0, 1)
    q.ack('a', 'finished', 1000)
    expect(q.snapshot().playing).toBeNull()
    const acts = q.enqueue(alert('i', 1000), 0, 1010, true)
    expect(shown(acts)).toEqual(['i'])
    expect(hidden(acts)).toEqual([])
    const p = new AlertQueue(tuning)
    p.enqueue(alert('a', 1000), 0, 0)
    p.ack('a', 'finished', 1000)
    p.pause()
    expect(p.enqueue(alert('i', 1000), 0, 1010, true)).toEqual([])
  })
  it('a duplicate or a non-interrupting alert changes nothing', () => {
    const q = new AlertQueue(tuning)
    q.enqueue(alert('a', 5000), 0, 0)
    expect(q.enqueue(alert('a', 5000), 0, 10, true)).toEqual([])
    expect(q.enqueue(alert('b', 5000), 9, 10)).toEqual([])
  })
})

describe('mute in the demo queue', () => {
  it('strips sound and speech, and the design sound and impact hits too', () => {
    const q = new AlertQueue(tuning)
    q.setMuted(true)
    const a = alert('d')
    const design = {
      look: { sound: { ref: 'm1', builtin: 'coin', volume: 55 }, motion: { impact_sounds: true } },
    } as unknown as AlertDesignView
    const acts = q.enqueue(
      { ...a, sound: 'builtin:chime', tts_text: 'hi', tts_audio: 'x', design },
      0,
      0,
    )
    const shownAlert = acts.find((x) => x.type === 'show')
    expect(shownAlert?.type === 'show' && shownAlert.alert).toMatchObject({
      sound: null,
      tts_text: null,
      tts_audio: null,
    })
    const look = (shownAlert?.type === 'show'
      ? shownAlert.alert.design?.look
      : null) as unknown as {
      sound: { ref: string | null; volume: number }
      motion: { impact_sounds: boolean }
    }
    expect([look.sound.ref, look.sound.volume, look.motion.impact_sounds]).toEqual([null, 0, false])
    // The caller's own alert is not changed.
    expect(design.look.motion?.impact_sounds).toBe(true)
  })
  it('unmuted alerts keep everything', () => {
    const q = new AlertQueue(tuning)
    const acts = q.enqueue({ ...alert('x'), sound: 'builtin:chime' }, 0, 0)
    const s = acts.find((x) => x.type === 'show')
    expect(s?.type === 'show' && s.alert.sound).toBe('builtin:chime')
  })
})

describe('demo details that match the engine', () => {
  it('fractional weights count as whole numbers, like the engine', async () => {
    const { pickWeighted, newVariation, seededRandom } = await import('../src/alert')
    const v = (id: string, weight: number) => ({ ...newVariation(id, 't'), weight })
    const rand = seededRandom(3)
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) seen.add(pickWeighted([v('a', 1.5), v('b', 1.5)], rand)?.id ?? '')
    expect(seen).toEqual(new Set(['a', 'b']))
    // 0.5 truncates to 0: both are zero, so equal chances rather than always the first.
    const zero = new Set<string>()
    for (let i = 0; i < 200; i++) zero.add(pickWeighted([v('a', 0.5), v('b', 0.5)], rand)?.id ?? '')
    expect(zero).toEqual(new Set(['a', 'b']))
  })
})
