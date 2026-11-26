import { useCallback, useEffect, useRef, useState } from 'react'
import { cx } from '@ferrocast/ui'
import {
  clampDock,
  clampDockPair,
  dockKeyTarget,
  readDock,
  saveDock,
  type DockSpec,
} from '../../lib/dock-size'

export type DockResizeHandler = (w: number, other: number, opts?: { save?: boolean }) => void

/** A dock's width, kept in this browser, and the room it has to share with the other dock. */
export function useDockWidth(spec: DockSpec): {
  width: number
  set: DockResizeHandler
  reset: () => void
} {
  const { key, def, min, max } = spec
  const [width, setWidth] = useState(() => readDock(spec))
  const set = useCallback<DockResizeHandler>(
    (w, other, opts) => {
      if (window.innerWidth < 1024) return
      const next = clampDock({ key, def, min, max }, w, other, window.innerWidth - navWidth())
      setWidth(next)
      if (opts?.save !== false) saveDock({ key, def, min, max }, next)
    },
    [key, def, min, max],
  )
  const reset = useCallback(() => {
    setWidth(def)
    saveDock({ key, def, min, max }, def)
  }, [key, def, min, max])
  return { width, set, reset }
}

/** Manages both Alert docks together so viewport shrinks and sidebar toggles clamp them in one pass. */
export function useDockPair(leftSpec: DockSpec, rightSpec: DockSpec) {
  const left = useDockWidth(leftSpec)
  const right = useDockWidth(rightSpec)
  const refs = useRef({
    leftSpec,
    rightSpec,
    lw: left.width,
    rw: right.width,
    setLeft: left.set,
    setRight: right.set,
  })
  refs.current = {
    leftSpec,
    rightSpec,
    lw: left.width,
    rw: right.width,
    setLeft: left.set,
    setRight: right.set,
  }

  useEffect(() => {
    const fit = () => {
      if (window.innerWidth < 1024) return
      const { leftSpec: ls, rightSpec: rs, lw, rw, setLeft, setRight } = refs.current
      const [nl, nr] = clampDockPair(ls, rs, lw, rw, window.innerWidth - navWidth())
      if (nl !== lw) setLeft(nl, nr)
      if (nr !== rw) setRight(nr, nl)
    }
    fit()
    window.addEventListener('resize', fit)
    window.addEventListener('fc:nav-width-change', fit)
    return () => {
      window.removeEventListener('resize', fit)
      window.removeEventListener('fc:nav-width-change', fit)
    }
  }, [])

  return { left, right }
}

/** The sidebar's width now (measured or converted using root font size): what the editor does not get. */
export function navWidth(): number {
  const aside =
    typeof document !== 'undefined'
      ? document.querySelector<HTMLElement>('aside[aria-label="Sidebar"]')
      : null
  if (aside) {
    const w = aside.getBoundingClientRect().width
    if (w > 0) return Math.round(w)
  }
  const cs = getComputedStyle(document.documentElement)
  const v = cs.getPropertyValue('--fc-nav-w').trim()
  if (v.endsWith('rem')) {
    const rem = parseFloat(cs.fontSize) || 16
    return parseFloat(v) * rem
  }
  if (v.endsWith('px')) return parseFloat(v)
  return 60
}

/**
 * The drag handle on a dock's inner edge: a focusable separator. Drag with the mouse or
 * touch, arrows (Shift for bigger steps), Home and End; double-click gives the default width.
 */
export function DockHandle({
  spec,
  label,
  width,
  otherWidth,
  growsRight,
  onResize,
  onReset,
  autoFit = true,
  className,
}: {
  spec: DockSpec
  label: string
  width: number
  otherWidth: number
  /** 1 for the left dock (dragging right grows it), -1 for the right dock. */
  growsRight: 1 | -1
  onResize: DockResizeHandler
  onReset: () => void
  autoFit?: boolean
  className?: string
}) {
  const drag = useRef<{ x: number; w: number; latest: number } | null>(null)
  const raf = useRef(0)
  const [active, setActive] = useState(false)
  const stateRef = useRef({ spec, width, otherWidth, growsRight, onResize })
  stateRef.current = { spec, width, otherWidth, growsRight, onResize }

  // A window that shrinks (or a sidebar that unfolds) under a wide dock pulls it in.
  useEffect(() => {
    if (!autoFit) return
    const onWin = () => {
      if (window.innerWidth < 1024) return
      const cur = stateRef.current
      const fit = clampDock(cur.spec, cur.width, cur.otherWidth, window.innerWidth - navWidth())
      if (fit !== cur.width) cur.onResize(fit, cur.otherWidth)
    }
    onWin()
    window.addEventListener('resize', onWin)
    window.addEventListener('fc:nav-width-change', onWin)
    return () => {
      window.removeEventListener('resize', onWin)
      window.removeEventListener('fc:nav-width-change', onWin)
    }
  }, [autoFit])

  useEffect(
    () => () => {
      if (raf.current) cancelAnimationFrame(raf.current)
      delete document.body.dataset.dockDrag
    },
    [],
  )

  const finishDrag = (finalWidth: number) => {
    if (raf.current) {
      cancelAnimationFrame(raf.current)
      raf.current = 0
    }
    drag.current = null
    delete document.body.dataset.dockDrag
    setActive(false)
    stateRef.current.onResize(finalWidth, stateRef.current.otherWidth, { save: true })
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={spec.min}
      aria-valuemax={spec.max}
      tabIndex={0}
      title="Drag to resize. Double-click for the usual width."
      data-dock-handle={growsRight === 1 ? 'left' : 'right'}
      onPointerDown={(e) => {
        e.preventDefault()
        drag.current = { x: e.clientX, w: width, latest: width }
        e.currentTarget.setPointerCapture?.(e.pointerId)
        document.body.dataset.dockDrag = '1'
        setActive(true)
      }}
      onPointerMove={(e) => {
        if (!drag.current) return
        drag.current.latest =
          drag.current.w + (e.clientX - drag.current.x) * stateRef.current.growsRight
        if (typeof requestAnimationFrame !== 'function') {
          stateRef.current.onResize(drag.current.latest, stateRef.current.otherWidth, {
            save: false,
          })
          return
        }
        if (raf.current) return
        raf.current = requestAnimationFrame(() => {
          raf.current = 0
          if (!drag.current) return
          stateRef.current.onResize(drag.current.latest, stateRef.current.otherWidth, {
            save: false,
          })
        })
      }}
      onPointerUp={(e) => {
        if (!drag.current) return
        const finalWidth =
          drag.current.w + (e.clientX - drag.current.x) * stateRef.current.growsRight
        finishDrag(finalWidth)
      }}
      onPointerCancel={() => {
        if (!drag.current) return
        finishDrag(drag.current.latest)
      }}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        const next = dockKeyTarget(spec, e.key, e.shiftKey, width, growsRight)
        if (next === null) return
        e.preventDefault()
        onResize(next, otherWidth, { save: true })
      }}
      className={cx(
        'group absolute inset-y-0 z-10 hidden w-3 cursor-col-resize touch-none items-center justify-center focus-visible:outline-none lg:flex',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          'h-full w-px bg-line transition-colors group-hover:w-0.5 group-hover:bg-accent group-focus-visible:w-0.5 group-focus-visible:bg-accent',
          active && 'w-0.5 bg-accent',
        )}
      />
    </div>
  )
}
