import type {
  Actor,
  FerroEvent,
  Goal,
  Overlay,
  OverlayServerFrame,
  OverlayState,
  RenderedAlert,
  Widget,
} from '@ferrocast/api/types'
import type { SocketLike } from '@ferrocast/api/socket'

let seq = 0
export const nextSeq = () => ++seq

export const XSS = [
  '<img src=x onerror=alert(1)>',
  '<script>alert(1)</script>',
  '"><svg onload=alert(1)>',
  '<iframe src="javascript:alert(1)"></iframe>',
]

export function actor(name: string, extra: Partial<Actor> = {}): Actor {
  return {
    platform: 'twitch',
    id: `u-${name}`,
    login: name.toLowerCase(),
    display_name: name,
    avatar_url: null,
    color: null,
    roles: 0,
    badges: [],
    anonymous: false,
    ...extra,
  }
}

export function chat(
  name: string,
  text: string,
  extra: Partial<FerroEvent> = {},
  a: Partial<Actor> = {},
): FerroEvent {
  const s = nextSeq()
  return {
    id: `e${s}`,
    seq: s,
    platform: 'twitch',
    channel: null,
    source_id: `m${s}`,
    occurred_at: 0,
    received_at: 0,
    origin: 'live',
    kind: {
      type: 'chat_message',
      actor: actor(name, a),
      content: { text, fragments: [{ type: 'text', text }] },
      reply_to: null,
      is_action: false,
    },
    ...extra,
  }
}

export function follow(name: string): FerroEvent {
  const s = nextSeq()
  return {
    id: `f${s}`,
    seq: s,
    platform: 'twitch',
    channel: null,
    source_id: null,
    occurred_at: 0,
    received_at: 0,
    origin: 'live',
    kind: { type: 'follow', actor: actor(name) },
  }
}

export function alert(id: string, extra: Partial<RenderedAlert> = {}): RenderedAlert {
  return {
    alert_id: id,
    event_id: `ev-${id}`,
    rule_id: 'follow',
    variation_id: 'v',
    kind: 'follow',
    platform: 'twitch',
    title: 'NovaRiver followed!',
    body: '',
    image: null,
    sound: null,
    volume: 70,
    duration_ms: 2000,
    layout: 'stack',
    css: '',
    tts_text: null,
    tts_audio: null,
    test: false,
    ...extra,
  }
}

export const goal: Goal = {
  id: 'g1',
  title: 'Sub goal',
  kind: 'subs',
  target: 50,
  currency: null,
  starts_at: 0,
  ends_at: null,
  current: 20,
}

export function widgets(): Widget[] {
  return [
    {
      id: 'wa',
      kind: 'alerts',
      x: 560,
      y: 80,
      w: 800,
      h: 360,
      config: { theme: 'molten', rule_ids: null },
    },
    {
      id: 'wc',
      kind: 'chat',
      x: 40,
      y: 560,
      w: 520,
      h: 480,
      config: {
        platforms: [],
        max_messages: 30,
        fade_after_s: null,
        show_badges: true,
        show_platform: true,
        hide_commands: true,
        hide_bots: true,
        font_size: 22,
        theme: 'molten',
      },
    },
    {
      id: 'we',
      kind: 'events',
      x: 1560,
      y: 640,
      w: 320,
      h: 400,
      config: { kinds: [], max_items: 5, theme: 'molten' },
    },
    {
      id: 'wg',
      kind: 'goal',
      x: 1460,
      y: 40,
      w: 420,
      h: 110,
      config: { goal_id: 'g1', theme: 'molten' },
    },
    {
      id: 'wl',
      kind: 'label',
      x: 1460,
      y: 170,
      w: 420,
      h: 64,
      config: { source: 'latest_follower', template: '{name}', theme: 'molten' },
    },
    {
      id: 'wv',
      kind: 'viewers',
      x: 40,
      y: 40,
      w: 260,
      h: 64,
      config: { platforms: [], theme: 'molten' },
    },
  ]
}

export function overlay(ws: Widget[] = widgets()): Overlay {
  return {
    id: 'o1',
    name: 'Main',
    url: 'http://127.0.0.1:47820/o/tok/',
    width: 1920,
    height: 1080,
    widgets: ws,
    updated_at: 0,
  }
}

export function snapshot(
  state: Partial<OverlayState> = {},
  o: Overlay = overlay(),
): OverlayServerFrame {
  return {
    v: 1,
    seq: nextSeq(),
    type: 'snapshot',
    data: {
      overlay: o,
      state: {
        goals: [goal],
        labels: { wl: 'Latest: LunaLagoon' },
        viewers: { twitch: 400, youtube: 100 },
        events: [],
        chat: [],
        ...state,
      },
    },
  }
}

export const frame = <T extends OverlayServerFrame['type']>(
  type: T,
  data: Extract<OverlayServerFrame, { type: T }>['data'],
) => ({ v: 1, seq: nextSeq(), type, data }) as Extract<OverlayServerFrame, { type: T }>

/** A socket we drive by hand. */
export class FakeSocket implements SocketLike {
  static all: FakeSocket[] = []
  readyState = 0
  onopen: ((ev: unknown) => void) | null = null
  onclose: ((ev: unknown) => void) | null = null
  onerror: ((ev: unknown) => void) | null = null
  onmessage: ((ev: { data: unknown }) => void) | null = null
  sent: string[] = []
  constructor(readonly url: string) {
    FakeSocket.all.push(this)
  }
  open(): void {
    this.readyState = 1
    this.onopen?.({})
  }
  push(f: unknown): void {
    this.onmessage?.({ data: typeof f === 'string' ? f : JSON.stringify(f) })
  }
  drop(): void {
    this.readyState = 3
    this.onclose?.({})
  }
  send(d: string): void {
    this.sent.push(d)
  }
  close(): void {
    this.readyState = 3
  }
}

/** All elements inside a root, including inside open shadow roots. */
export function deepAll(root: Element | ShadowRoot, selector: string): Element[] {
  const out: Element[] = [...root.querySelectorAll(selector)]
  for (const el of root.querySelectorAll('*'))
    if (el.shadowRoot) out.push(...deepAll(el.shadowRoot, selector))
  return out
}

export function deepText(root: Element | ShadowRoot): string {
  let t = root.textContent ?? ''
  for (const el of root.querySelectorAll('*')) if (el.shadowRoot) t += deepText(el.shadowRoot)
  return t
}
