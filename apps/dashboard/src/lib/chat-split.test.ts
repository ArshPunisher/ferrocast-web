import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_EVENTS_WIDTH_COMPACT,
  DEFAULT_EVENTS_WIDTH_WIDE,
  EVENTS_WIDTH_KEY,
  MAX_EVENTS_WIDTH,
  MIN_CHAT_WIDTH,
  MIN_EVENTS_WIDTH,
  SPLITTER_WIDTH,
  clampEventsWidth,
  defaultEventsWidth,
  eventsWidthBounds,
  loadSavedEventsWidth,
  saveEventsWidth,
  stepEventsWidth,
} from './chat-split'

describe('chat-split resize math and persistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('chooses 352px at wide desktop and 304px at compact desktop', () => {
    expect(defaultEventsWidth(1380)).toBe(DEFAULT_EVENTS_WIDTH_WIDE)
    expect(defaultEventsWidth(1200)).toBe(DEFAULT_EVENTS_WIDTH_COMPACT)
  })

  it('clamps Events width so Chat always keeps at least MIN_CHAT_WIDTH', () => {
    const container = 950
    const bounds = eventsWidthBounds(container)
    expect(bounds.min).toBe(MIN_EVENTS_WIDTH)
    expect(bounds.max).toBe(container - MIN_CHAT_WIDTH - SPLITTER_WIDTH)
    expect(clampEventsWidth(100, container)).toBe(bounds.min)
    expect(clampEventsWidth(900, container)).toBe(bounds.max)
  })

  it('caps Events width at MAX_EVENTS_WIDTH on very wide monitors (2560px)', () => {
    const bounds = eventsWidthBounds(2460)
    expect(bounds.max).toBe(MAX_EVENTS_WIDTH)
    expect(clampEventsWidth(900, 2460)).toBe(MAX_EVENTS_WIDTH)
  })

  it('steps width on ArrowLeft/ArrowRight, Shift+Arrow, Home, and End', () => {
    const w = 1350
    expect(stepEventsWidth(352, 'ArrowLeft', false, w)).toBe(368)
    expect(stepEventsWidth(352, 'ArrowRight', false, w)).toBe(336)
    expect(stepEventsWidth(352, 'ArrowLeft', true, w)).toBe(400)
    expect(stepEventsWidth(352, 'ArrowRight', true, w)).toBe(304)
    expect(stepEventsWidth(352, 'Home', false, w)).toBe(MAX_EVENTS_WIDTH)
    expect(stepEventsWidth(352, 'End', false, w)).toBe(MIN_EVENTS_WIDTH)
    expect(stepEventsWidth(352, 'Tab', false, w)).toBeNull()
  })

  it('persists and loads valid saved widths safely', () => {
    expect(loadSavedEventsWidth()).toBeNull()
    saveEventsWidth(412.6)
    expect(localStorage.getItem(EVENTS_WIDTH_KEY)).toBe('413')
    expect(loadSavedEventsWidth()).toBe(413)
    localStorage.setItem(EVENTS_WIDTH_KEY, 'not-a-number')
    expect(loadSavedEventsWidth()).toBeNull()
  })
})
