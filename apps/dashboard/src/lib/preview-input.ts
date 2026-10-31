// The Studio's pictures on Windows (API.md, PUT /studio/engine/preview/cursor): each is a
// native child window over the page that takes the mouse itself (on a Mac clicks go through
// the picture to the page). The app hands each mouse action to `window.__ferrocastPreviewInput`,
// and this plays it on the page as the browser would a real one, at the same point: the stage's
// own handlers pick, move and resize sources unchanged. The cursor the page shows there goes
// back to the app, which shows it over the picture.

/** One mouse action over a picture, in CSS pixels from the window's top left. */
export type PreviewInput = {
  kind: 'down' | 'up' | 'move' | 'dblclick' | 'wheel' | 'leave'
  /** 0 left, 1 middle, 2 right. */
  button: number
  /** DOM `buttons`: 1 left, 2 right, 4 middle. */
  buttons: number
  x: number
  y: number
  dx: number
  dy: number
  shift: boolean
  ctrl: boolean
  alt: boolean
}

declare global {
  interface Window {
    __ferrocastPreviewInput?: (i: PreviewInput) => void
  }
}

/** The browser's mouse pointer: always there, so the page's setPointerCapture accepts it. */
const MOUSE = 1
const FOCUSABLE = 'button, input, select, textarea, a[href], [tabindex]'

/** Plays mouse actions from the app on the page; `cursor` hears what the page shows. → undo. */
export function installPreviewInput(cursor: (css: string) => void): () => void {
  let over: Element | null = null
  // Where a press started: what follows goes there until the buttons are let go, as with a
  // real press (the stage captures the pointer for its drags).
  let held: Element | null = null
  let pressed: Element | null = null
  let shown = ''

  const init = (i: PreviewInput, extra: Partial<PointerEventInit> = {}): PointerEventInit => ({
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: i.x,
    clientY: i.y,
    screenX: window.screenX + i.x,
    screenY: window.screenY + i.y,
    button: i.kind === 'move' || i.kind === 'leave' ? -1 : i.button,
    buttons: i.buttons,
    shiftKey: i.shift,
    ctrlKey: i.ctrl,
    altKey: i.alt,
    pointerId: MOUSE,
    pointerType: 'mouse',
    isPrimary: true,
    ...extra,
  })
  const pointer = (el: Element, type: string, i: PreviewInput, extra?: Partial<PointerEventInit>) =>
    el.dispatchEvent(new PointerEvent(type, init(i, extra)))
  const mouse = (el: Element, type: string, i: PreviewInput, extra?: Partial<MouseEventInit>) =>
    el.dispatchEvent(new MouseEvent(type, { ...init(i), ...extra }))

  /** Over/out as the pointer moves from one element to another (hover, React's enter/leave). */
  const hover = (next: Element | null, i: PreviewInput) => {
    if (next === over) return
    if (over?.isConnected) {
      pointer(over, 'pointerout', i, { relatedTarget: next })
      mouse(over, 'mouseout', i, { relatedTarget: next })
    }
    if (next) {
      pointer(next, 'pointerover', i, { relatedTarget: over })
      mouse(next, 'mouseover', i, { relatedTarget: over })
    }
    over = next
  }

  const tellCursor = (el: Element | null) => {
    const css = el ? getComputedStyle(el).cursor || 'default' : 'default'
    const name = css === 'auto' ? 'default' : css
    // A cursor from a picture (url(...)) shows as the arrow.
    const plain = /^[a-z-]+$/.test(name) ? name : 'default'
    if (plain !== shown) {
      shown = plain
      cursor(plain)
    }
  }

  /** Ends the page's capture: a played let-go doesn't, as a real one would. */
  const release = (el: Element) => {
    try {
      if (el.hasPointerCapture(MOUSE)) el.releasePointerCapture(MOUSE)
    } catch {
      // Not captured.
    }
  }

  const play = (i: PreviewInput) => {
    // A move with no button down while a press is held: its let-go never came (Alt-Tab, a
    // dialog took the mouse), so the press is cancelled, as a browser does, not left dragging.
    if (held && i.kind === 'move' && i.buttons === 0) {
      if (held.isConnected) {
        pointer(held, 'pointercancel', i)
        release(held)
      }
      held = null
      pressed = null
    }
    const at = document.elementFromPoint(i.x, i.y)
    const target = (held?.isConnected ? held : null) ?? at ?? document.body
    switch (i.kind) {
      case 'move': {
        if (!held) hover(at, i)
        pointer(target, 'pointermove', i)
        mouse(target, 'mousemove', i)
        tellCursor(target)
        break
      }
      case 'down': {
        hover(at, i)
        held = target
        pressed = target
        const go = pointer(target, 'pointerdown', i)
        const md = go && mouse(target, 'mousedown', i)
        // A press focuses what it's on (a real one's default action), or leaves the focus.
        if (md) (target.closest(FOCUSABLE) as HTMLElement | null)?.focus({ preventScroll: true })
        tellCursor(target)
        break
      }
      case 'up': {
        pointer(target, 'pointerup', i)
        mouse(target, 'mouseup', i)
        if (i.buttons === 0) {
          // Else the next real move over the page would still go to the stage.
          release(target)
          const same = pressed && at && (pressed === at || pressed.contains(at)) ? pressed : null
          if (same && i.button === 0) mouse(same, 'click', i, { detail: 1 })
          if (same && i.button === 1) pointer(same, 'auxclick', i)
          // On Windows the menu opens on the let-go.
          if (i.button === 2) mouse(at ?? target, 'contextmenu', i)
          held = null
          pressed = null
          hover(at, i)
        }
        tellCursor(at)
        break
      }
      case 'dblclick':
        mouse(target, 'dblclick', i, { detail: 2 })
        break
      case 'wheel':
        target.dispatchEvent(
          new WheelEvent('wheel', {
            ...init(i),
            deltaX: i.dx,
            deltaY: i.dy,
            deltaMode: WheelEvent.DOM_DELTA_PIXEL,
          }),
        )
        break
      case 'leave':
        if (!held) {
          hover(null, i)
          shown = ''
        }
        break
    }
  }

  window.__ferrocastPreviewInput = play
  return () => {
    if (window.__ferrocastPreviewInput === play) delete window.__ferrocastPreviewInput
  }
}

/** The pictures take the mouse themselves only in the Windows app. */
export function picturesTakeMouse(): boolean {
  return /Windows/.test(navigator.userAgent)
}
