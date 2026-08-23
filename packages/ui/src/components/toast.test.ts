import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { currentToasts, dismissToast, toast } from './overlays'

describe('toasts', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    for (const t of currentToasts()) dismissToast(t.id)
    vi.useRealTimers()
  })

  it('a toast with the same key replaces the old one in place', () => {
    toast({ tone: 'info', message: 'Saved.' })
    toast({ tone: 'warn', message: 'Panic mode is on.', key: 'panic' })
    toast({ tone: 'info', message: 'Copied.' })
    toast({ tone: 'ok', message: 'Panic mode is off.', key: 'panic' })
    expect(currentToasts().map((t) => t.message)).toEqual([
      'Saved.',
      'Panic mode is off.',
      'Copied.',
    ])
  })

  it('on, off, on: only the latest state is shown', () => {
    for (const on of [true, false, true, false, true])
      toast({ tone: on ? 'warn' : 'ok', message: on ? 'On.' : 'Off.', key: 'panic' })
    expect(currentToasts()).toHaveLength(1)
    expect(currentToasts()[0]?.message).toBe('On.')
  })

  it('the replaced toast’s timer never dismisses the new one early', () => {
    toast({ tone: 'warn', message: 'First.', key: 'obs', duration: 1000 })
    vi.advanceTimersByTime(900)
    toast({ tone: 'ok', message: 'Second.', key: 'obs', duration: 1000 })
    vi.advanceTimersByTime(500)
    expect(currentToasts().map((t) => t.message)).toEqual(['Second.'])
    vi.advanceTimersByTime(600)
    expect(currentToasts()).toHaveLength(0)
  })

  it('an identical toast never stacks a copy', () => {
    toast({ tone: 'ok', message: 'Saved.' })
    toast({ tone: 'ok', message: 'Saved.' })
    toast({ tone: 'error', message: 'Saved.' })
    expect(currentToasts().map((t) => t.tone)).toEqual(['ok', 'error'])
  })

  it('different toasts still stack, at most four', () => {
    for (let i = 0; i < 6; i++) toast({ tone: 'info', message: `n${i}` })
    expect(currentToasts().map((t) => t.message)).toEqual(['n2', 'n3', 'n4', 'n5'])
  })
})
