// Overlay socket frames (API.md §6). The overlay page trusts nothing: every frame is
// checked before it touches the DOM, unknown types are ignored, and the page itself can
// only say hello, ack and visibility (R-36).

import type { AckPhase, OverlayClientFrame, OverlayServerFrame } from './types'

export const OVERLAY_FRAME_TYPES = [
  'snapshot',
  'event',
  'alert',
  'alert_hide',
  'state',
  'config',
  'delete_message',
  'delete_user',
  'clear_chat',
  'tts',
  'revoked',
] as const

const TYPES = new Set<string>(OVERLAY_FRAME_TYPES)
/** Frames bigger than this are dropped; a snapshot with 50 chat lines is ~100 KB. */
export const MAX_FRAME_BYTES = 2_000_000

function obj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
const str = (v: unknown): v is string => typeof v === 'string'
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function validEvent(e: unknown): boolean {
  return (
    obj(e) &&
    str(e.id) &&
    num(e.seq) &&
    str(e.platform) &&
    obj(e.kind) &&
    str((e.kind as Record<string, unknown>).type)
  )
}

function validOverlay(o: unknown): boolean {
  return (
    obj(o) &&
    str(o.id) &&
    num(o.width) &&
    num(o.height) &&
    Array.isArray(o.widgets) &&
    o.widgets.every(
      (w) =>
        obj(w) &&
        str(w.id) &&
        str(w.kind) &&
        num(w.x) &&
        num(w.y) &&
        num(w.w) &&
        num(w.h) &&
        obj(w.config),
    )
  )
}

function validAlert(a: unknown): boolean {
  return obj(a) && str(a.alert_id) && str(a.title) && str(a.body) && num(a.duration_ms)
}

/** Returns the frame when it is well formed, otherwise null (and the caller logs it). */
export function parseOverlayFrame(raw: unknown): OverlayServerFrame | null {
  if (typeof raw !== 'string' || raw.length > MAX_FRAME_BYTES) return null
  let v: unknown
  try {
    v = JSON.parse(raw)
  } catch {
    return null
  }
  if (!obj(v) || v.v !== 1 || !str(v.type) || !TYPES.has(v.type) || !obj(v.data)) return null
  if (!num(v.seq)) return null
  const d = v.data
  switch (v.type) {
    case 'snapshot':
      if (!validOverlay(d.overlay) || !obj(d.state)) return null
      break
    case 'event':
      if (!validEvent(d)) return null
      break
    case 'alert':
      if (!validAlert(d)) return null
      break
    case 'alert_hide':
      if (!str(d.alert_id)) return null
      break
    case 'config':
      if (!validOverlay(d)) return null
      break
    case 'delete_message':
      if (!str(d.platform) || !str(d.message_id)) return null
      break
    case 'delete_user':
      if (!str(d.platform) || !str(d.user_id)) return null
      break
    case 'clear_chat':
      if (!(d.platform === null || str(d.platform))) return null
      break
    case 'tts':
      if (!str(d.id) || !str(d.text)) return null
      if (!(d.audio === undefined || d.audio === null || str(d.audio))) return null
      break
    case 'state':
    case 'revoked':
      break
  }
  return v as unknown as OverlayServerFrame
}

export function helloFrame(sinceSeq: number): string {
  const f: OverlayClientFrame = { v: 1, type: 'hello', data: { since_seq: sinceSeq } }
  return JSON.stringify(f)
}

export function ackFrame(alertId: string, phase: AckPhase): string {
  const f: OverlayClientFrame = { v: 1, type: 'ack', data: { alert_id: alertId, phase } }
  return JSON.stringify(f)
}

export function visibilityFrame(visible: boolean): string {
  const f: OverlayClientFrame = { v: 1, type: 'visibility', data: { visible } }
  return JSON.stringify(f)
}
