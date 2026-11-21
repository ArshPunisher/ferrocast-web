// Chat Highlight in the demo: pins one visible chat message onto stream until dismissed,
// timed out, or moderated (deleted / author banned).

import type { ChatHighlight, FerroEvent, Platform } from '../../types'
import { HttpError } from '../http-error'
import { clone, NOT_MINE, requireObj, type DemoFeature, type DemoHost, type Routed } from './host'

export interface HighlightHost extends DemoHost {
  visibleChatById(id: string): FerroEvent | null
  pushHighlightState(highlight: ChatHighlight | null): void
}

export class DemoHighlight implements DemoFeature {
  private current: ChatHighlight | null = null
  private seq = 0

  constructor(private readonly host: HighlightHost) {}

  view(): ChatHighlight | null {
    if (this.current && this.current.expires_at !== null && Date.now() >= this.current.expires_at) {
      this.current = null
    }
    return this.current ? clone(this.current) : null
  }

  pin(eventId: string, durationS: number | null): ChatHighlight {
    const id = eventId.trim()
    if (!id || id.length > 128)
      throw new HttpError(400, 'invalid', 'event_id: choose a chat message to show on stream.')
    if (
      durationS !== null &&
      (typeof durationS !== 'number' ||
        !Number.isInteger(durationS) ||
        durationS < 5 ||
        durationS > 3600)
    )
      throw new HttpError(
        400,
        'invalid',
        'duration_s: leave empty to stay until dismissed, or pick 5 to 3600 seconds.',
      )
    const ev = this.host.visibleChatById(id)
    if (!ev || ev.kind.type !== 'chat_message')
      throw new HttpError(
        404,
        'highlight_not_found',
        'That chat message could not be found.',
        'Refresh chat and pick a visible message.',
      )
    const now = Date.now()
    this.seq += 1
    const hid = `hl-${this.seq}`
    const h: ChatHighlight = {
      id: hid,
      event_id: ev.id,
      source_id: ev.source_id,
      platform: ev.platform,
      actor: clone(ev.kind.actor),
      content: clone(ev.kind.content),
      is_action: ev.kind.is_action,
      pinned_at: now,
      expires_at: durationS === null ? null : now + durationS * 1000,
    }
    this.current = h
    this.push()
    if (durationS !== null) {
      this.host.later(() => {
        if (this.current?.id === hid) {
          this.current = null
          this.push()
        }
      }, durationS * 1000)
    }
    return clone(h)
  }

  clear(): void {
    if (!this.current) return
    this.current = null
    this.push()
  }

  clearForMessage(platform: Platform, messageId: string): void {
    if (!this.current) return
    if (
      this.current.platform === platform &&
      (this.current.source_id === messageId || this.current.event_id === messageId)
    ) {
      this.clear()
    }
  }

  clearForUser(platform: Platform, userId: string | null, login?: string | null): void {
    if (!this.current || this.current.platform !== platform) return
    if (userId && this.current.actor.id === userId) {
      this.clear()
      return
    }
    if (login && this.current.actor.login?.toLowerCase() === login.toLowerCase()) {
      this.clear()
    }
  }

  onEvent(e: FerroEvent): void {
    if (e.kind.type === 'message_deleted') {
      this.clearForMessage(e.platform, e.kind.message_id)
    } else if (e.kind.type === 'ban' || e.kind.type === 'user_messages_cleared') {
      this.clearForUser(e.platform, e.kind.target.id, e.kind.target.login)
    }
  }

  route(method: string, seg: string[], body: unknown): Routed {
    if (seg[0] !== 'chat' || seg[1] !== 'highlight' || seg.length !== 2) return NOT_MINE
    if (method === 'GET') return this.view()
    if (method === 'DELETE') {
      this.clear()
      return undefined
    }
    if (method === 'POST') {
      const o = requireObj(body)
      if (typeof o.event_id !== 'string')
        throw new HttpError(400, 'invalid', 'event_id: must be a chat message id.')
      const rawDur = o.duration_s
      let durationS: number | null = null
      if (rawDur !== undefined && rawDur !== null) {
        if (typeof rawDur !== 'number' || !Number.isInteger(rawDur) || rawDur < 5 || rawDur > 3600)
          throw new HttpError(
            400,
            'invalid',
            'duration_s: leave empty to stay until dismissed, or pick 5 to 3600 seconds.',
          )
        durationS = rawDur
      }
      return this.pin(o.event_id, durationS)
    }
    return NOT_MINE
  }

  private push(): void {
    const val = this.view()
    this.host.broadcastLive({ v: 1, type: 'chat_highlight', data: { highlight: val } })
    this.host.pushHighlightState(val)
  }
}
