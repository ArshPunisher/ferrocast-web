import type {
  FerroEvent,
  OverlayState,
  Platform,
  RenderedAlert,
  Widget,
} from '@ferrocast/api/types'

/** What every widget can see and do. */
export interface WidgetContext {
  /** Sends a frame to the server (only acks; an overlay never creates events, R-36). */
  send(data: string): void
  readonly audio: boolean
  lowMotion(): boolean
  /** The latest merged state from snapshot + `state` frames. */
  readonly state: OverlayState
}

/** A rendered widget. The runtime calls only the hooks a widget defines. */
export interface WidgetView {
  readonly el: HTMLElement
  /** Same widget id, new config or geometry (`config` frame). */
  update(w: Widget): void
  onState?(): void
  onEvent?(e: FerroEvent): void
  /** `primary` = this widget sends the acks for this alert. Returns whether it took it. */
  onAlert?(a: RenderedAlert, primary: boolean): boolean
  onAlertHide?(alertId: string): void
  onDeleteMessage?(platform: Platform, messageId: string): void
  onDeleteUser?(platform: Platform, userId: string): void
  onClearChat?(platform: Platform | null): void
  /** OBS shows or hides the source. */
  onVisibility?(visible: boolean): void
  /** Called when a fresh snapshot replaces everything. */
  onSnapshot?(): void
  /** `silent`: the page was revoked, send nothing. */
  destroy(silent?: boolean): void
}

export function emptyState(): OverlayState {
  return { goals: [], labels: {}, viewers: {}, events: [], chat: [] }
}

/** Positions the widget box on the canvas. Sizes are clamped so garbage can't explode layout. */
export function place(el: HTMLElement, w: Widget): void {
  const n = (v: number, max: number) => (Number.isFinite(v) ? Math.min(Math.max(v, -max), max) : 0)
  el.style.left = `${n(w.x, 10_000)}px`
  el.style.top = `${n(w.y, 10_000)}px`
  el.style.width = `${Math.max(1, n(w.w, 10_000))}px`
  el.style.height = `${Math.max(1, n(w.h, 10_000))}px`
}
