import { useCallback, useEffect, useRef, useState } from 'react'
import { cx } from '@ferrocast/ui'
import { clampDock, dockKeyTarget, readDock, saveDock, type DockSpec } from '../../lib/dock-size'

/** A dock's width, kept in this browser, and the room it has to share with the other dock. */
export function useDockWidth(spec: DockSpec): {
  width: number
  set: (w: number, other: number) => void
  reset: () => void
} {
  const { key, def, min, max } = spec
  const [width, setWidth] = useState(() => readDock(spec))
  const set = useCallback(
    (w: number, other: number) => {
      const next = clampDock({ key, def, min, max }, w, other, window.innerWidth - navWidth())
      setWidth(next)
      saveDock({ key, def, min, max }, next)
    },
    [key, def, min, max],
  )
  const reset = useCallback(() => {
    setWidth(def)
    saveDock({ key, def, min, max }, def)
  }, [key, def, min, max])
  return { width, set, reset }
}

/** The sidebar's width now (the page holds it in a variable): what the editor does not get. */
export function navWidth(): number {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--fc-nav-w').trim()
  if (v.endsWith('rem')) return parseFloat(v) * 16
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
  className,
}: {
  spec: DockSpec
  label: string
  width: number
  otherWidth: number
  /** 1 for the left dock (dragging right grows it), -1 for the right dock. */
  growsRight: 1 | -1
  onResize: (w: number, other: number) => void
  onReset: () => void
  className?: string
}) {
  const drag = useRef<{ x: number; w: number } | null>(null)
  const [active, setActive] = useState(false)
  // A window that shrinks (or a sidebar that unfolds) under a wide dock pulls it in.
  useEffect(() => {
    const onWin = () => {
      const fit = clampDock(spec, width, otherWidth, window.innerWidth - navWidth())
      if (fit !== width) onResize(fit, otherWidth)
    }
    onWin()
    window.addEventListener('resize', onWin)
    const mo = typeof MutationObserver === 'function' ? new MutationObserver(onWin) : null
    mo?.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] })
    return () => {
      window.removeEventListener('resize', onWin)
      mo?.disconnect()
    }
  }, [spec, width, otherWidth, onResize])
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
        drag.current = { x: e.clientX, w: width }
        e.currentTarget.setPointerCapture(e.pointerId)
        setActive(true)
      }}
      onPointerMove={(e) => {
        if (!drag.current) return
        onResize(drag.current.w + (e.clientX - drag.current.x) * growsRight, otherWidth)
      }}
      onPointerUp={() => {
        drag.current = null
        setActive(false)
      }}
      onPointerCancel={() => {
        drag.current = null
        setActive(false)
      }}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        const next = dockKeyTarget(spec, e.key, e.shiftKey, width, growsRight)
        if (next === null) return
        e.preventDefault()
        onResize(next, otherWidth)
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
