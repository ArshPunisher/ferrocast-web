// The Studio's dock layout (2.1): panels sit flush around the preview like OBS's docks. Drag a
// divider to resize, drag a panel by its title to move it (beside another panel, to an edge,
// or out to float), and pick a preset, hide panels or lock the layout from the Layout menu.
// Kept per browser (localStorage); phones get the preview and one panel at a time. Web panels
// (OBS's Custom Browser Docks) are the user's own pages, kept with the layout.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { DotsSixVertical, DotsThree } from '@phosphor-icons/react'
import { IconButton, Segmented, cx } from '@ferrocast/ui'
import { useMediaQuery } from '../../../lib/hooks'

export type BuiltIn = 'scenes' | 'sources' | 'audio' | 'golive' | 'chat' | 'events'
/** A built-in panel, or a web panel (`web:` and its own id). */
export type DockId = BuiltIn | `web:${string}`
export type Region = 'left' | 'right' | 'bottom'
export type Preset = 'classic' | 'side' | 'wide'

export const DOCK_NAMES: Record<BuiltIn, string> = {
  scenes: 'Scenes',
  sources: 'Sources',
  audio: 'Audio',
  golive: 'Go live to',
  chat: 'Chat',
  events: 'Events',
}
export const BUILT_INS = Object.keys(DOCK_NAMES) as BuiltIn[]
/** Panels new since a layout was saved start hidden; these are hidden in a fresh one too. */
const OFF_AT_FIRST: BuiltIn[] = ['chat', 'events']

/** A web page as a panel: a name and its address. */
export interface WebDock {
  id: `web:${string}`
  name: string
  url: string
}

export const isWeb = (id: string): id is `web:${string}` => id.startsWith('web:')

interface Float {
  x: number
  y: number
  w: number
  h: number
}

export interface Layout {
  left: DockId[]
  right: DockId[]
  bottom: DockId[]
  /** Widths of the side columns and height of the bottom row, px. */
  lw: number
  rw: number
  bh: number
  float: Partial<Record<DockId, Float>>
  hidden: DockId[]
  /** Each panel's share of its row or column (1 when not set). */
  w: Partial<Record<DockId, number>>
  /** The web panels there are (each also placed or hidden like any panel). */
  webs: WebDock[]
  preset: Preset | null
  locked: boolean
  /** The panel shown on a phone. */
  mob: DockId
}

const PRESETS: Record<Preset, Pick<Layout, 'left' | 'right' | 'bottom' | 'lw' | 'rw' | 'bh'>> = {
  classic: {
    left: [],
    right: ['golive'],
    bottom: ['scenes', 'sources', 'audio'],
    lw: 280,
    rw: 320,
    bh: 290,
  },
  side: {
    left: ['scenes', 'sources'],
    right: ['golive'],
    bottom: ['audio'],
    lw: 300,
    rw: 320,
    bh: 230,
  },
  wide: { left: ['scenes', 'sources', 'audio'], right: [], bottom: [], lw: 340, rw: 320, bh: 260 },
}

export function fresh(p: Preset): Layout {
  return {
    ...structuredClone(PRESETS[p]),
    float: {},
    hidden: [...OFF_AT_FIRST],
    w: { scenes: 1, sources: 1.3, audio: 1.7, golive: 1 },
    webs: [],
    preset: p,
    locked: false,
    mob: 'scenes',
  }
}

const KEY = 'fc-studio-layout'

/** A saved layout, cleaned: panels it doesn't know start hidden, ones gone are dropped. */
export function revive(v: Partial<Layout> | null): Layout {
  if (!v || !Array.isArray(v.left) || !Array.isArray(v.right) || !Array.isArray(v.bottom))
    return fresh('side')
  const webs = (Array.isArray(v.webs) ? v.webs : []).filter(
    (d) => d && isWeb(d.id) && typeof d.name === 'string' && typeof d.url === 'string',
  )
  const known = new Set<string>([...BUILT_INS, ...webs.map((d) => d.id)])
  const keep = (ids: DockId[] | undefined) => (ids ?? []).filter((d) => known.has(d))
  const float = Object.fromEntries(
    Object.entries(v.float ?? {}).filter(([d]) => known.has(d)),
  ) as Layout['float']
  const l: Layout = {
    ...fresh('side'),
    ...v,
    left: keep(v.left),
    right: keep(v.right),
    bottom: keep(v.bottom),
    hidden: keep(v.hidden),
    float,
    w: { ...v.w },
    webs,
  }
  for (const d of BUILT_INS) if (!placed(l, d) && !l.hidden.includes(d)) l.hidden.push(d)
  return l
}

function load(): Layout {
  try {
    return revive(JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Layout> | null)
  } catch {
    return fresh('side')
  }
}

/** In a row, a column or floating. */
export const placed = (l: Layout, id: DockId): boolean => !!regionOf(l, id) || !!l.float[id]

/** Showing: placed and not hidden. */
export const showing = (l: Layout): DockId[] =>
  [...BUILT_INS, ...l.webs.map((d) => d.id)].filter((d) => placed(l, d) && !l.hidden.includes(d))

/** A panel's name. */
export function dockName(l: Pick<Layout, 'webs'>, id: DockId): string {
  return isWeb(id) ? (l.webs.find((d) => d.id === id)?.name ?? 'Web page') : DOCK_NAMES[id]
}

/** A layout picked from the presets keeps the web panels (hidden) and the rest of the choices. */
export function fromPreset(l: Layout, p: Preset): Layout {
  return {
    ...fresh(p),
    locked: l.locked,
    mob: l.mob,
    webs: l.webs,
    hidden: [...OFF_AT_FIRST, ...l.webs.map((d) => d.id)],
  }
}

/** Where a panel shown again goes: the side column (chat and web pages are tall), else the
 * bottom row. */
function home(l: Layout): Region {
  const shown = (r: Region) => l[r].some((d) => !l.hidden.includes(d))
  return shown('right') ? 'right' : shown('left') ? 'left' : 'bottom'
}

/** Adds a web panel beside the others, or changes one already there. */
export function putWeb(l: Layout, d: WebDock): Layout {
  if (l.webs.some((x) => x.id === d.id))
    return { ...l, webs: l.webs.map((x) => (x.id === d.id ? d : x)) }
  const r = home(l)
  return { ...l, webs: [...l.webs, d], [r]: [...l[r], d.id], preset: null }
}

export function removeWeb(l: Layout, id: DockId): Layout {
  const w = { ...l.w }
  delete w[id]
  return {
    ...without(l, id),
    webs: l.webs.filter((d) => d.id !== id),
    hidden: l.hidden.filter((d) => d !== id),
    w,
  }
}

function save(l: Layout) {
  try {
    localStorage.setItem(KEY, JSON.stringify(l))
  } catch {
    // Private mode: the layout lasts this visit.
  }
}

export const regionOf = (l: Layout, id: DockId): Region | null =>
  (['left', 'right', 'bottom'] as const).find((r) => l[r].includes(id)) ?? null

function without(l: Layout, id: DockId): Layout {
  const float = { ...l.float }
  delete float[id]
  return {
    ...l,
    left: l.left.filter((x) => x !== id),
    right: l.right.filter((x) => x !== id),
    bottom: l.bottom.filter((x) => x !== id),
    float,
  }
}

/** Where a dragged panel would land. */
interface Target {
  region: Region
  at?: DockId
  before?: boolean
  hint: { left: number; top: number; width: number; height: number }
}

interface LayoutApi {
  layout: Layout
  setLayout: (f: (l: Layout) => Layout) => void
  /** Starts dragging a panel by its title bar. */
  grab: (id: DockId, e: ReactPointerEvent) => void
  narrow: boolean
}

const Ctx = createContext<LayoutApi | null>(null)

export function useLayout(): LayoutApi {
  const c = useContext(Ctx)
  if (!c) throw new Error('useLayout outside the Studio')
  return c
}

export function moveTo(l: Layout, id: DockId, region: Region): Layout {
  const n = without(l, id)
  return { ...n, [region]: [...n[region], id], preset: null }
}

export function popOut(l: Layout, id: DockId, at: { x: number; y: number }): Layout {
  // Kept inside the window, whole.
  const w = 320
  const h = Math.min(380, window.innerHeight - 16)
  const x = Math.max(8, Math.min(at.x, window.innerWidth - w - 8))
  const y = Math.max(8, Math.min(at.y, window.innerHeight - h - 8))
  return { ...without(l, id), float: { ...l.float, [id]: { x, y, w, h } }, preset: null }
}

export function toggle(l: Layout, id: DockId): Layout {
  if (l.hidden.includes(id) || !placed(l, id)) {
    const shown = { ...l, hidden: l.hidden.filter((x) => x !== id), preset: null }
    const r = home(l)
    return placed(shown, id) ? shown : { ...shown, [r]: [...shown[r], id] }
  }
  return { ...l, hidden: [...l.hidden, id], preset: null }
}

/**
 * The workspace: the stage (preview) in the middle, panels around it, filling the window
 * below where it starts. `docks` renders each panel; `top` goes above (it can use the layout).
 */
export function DockWorkspace({
  top,
  stage,
  docks,
}: {
  top?: ReactNode
  stage: ReactNode
  /** Each panel's content. */
  docks: (id: DockId) => ReactNode
}) {
  const [layout, setRaw] = useState<Layout>(load)
  const narrow = useMediaQuery('(max-width: 899px)')
  const ws = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | null>(null)
  const setLayout = useCallback((f: (l: Layout) => Layout) => {
    setRaw((l) => {
      const n = f(l)
      save(n)
      return n
    })
  }, [])

  // Fills the window below where it starts.
  useLayoutEffect(() => {
    const el = ws.current
    if (!el || narrow) return
    const fit = () => {
      const top = el.getBoundingClientRect().top + window.scrollY
      setHeight(Math.max(560, window.innerHeight - top - 20))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [narrow])

  const [drag, setDrag] = useState<{ id: DockId; x: number; y: number; t: Target | null } | null>(
    null,
  )

  const targetAt = useCallback(
    (x: number, y: number, self: DockId): Target | null => {
      const box = ws.current?.getBoundingClientRect()
      if (!box || x < box.left || x > box.right || y < box.top || y > box.bottom) return null
      for (const el of ws.current?.querySelectorAll<HTMLElement>('[data-dock]') ?? []) {
        const id = el.dataset.dock as DockId
        if (id === self) continue
        const b = el.getBoundingClientRect()
        if (x < b.left || x > b.right || y < b.top || y > b.bottom) continue
        const region = regionOf(layout, id)
        if (!region) continue
        const vertical = region !== 'bottom'
        const before = vertical ? y < b.top + b.height / 2 : x < b.left + b.width / 2
        const hint = vertical
          ? {
              left: b.left,
              width: b.width,
              top: before ? b.top : b.top + b.height / 2,
              height: b.height / 2,
            }
          : {
              top: b.top,
              height: b.height,
              left: before ? b.left : b.left + b.width / 2,
              width: b.width / 2,
            }
        return { region, at: id, before, hint }
      }
      const s = ws.current?.querySelector('[data-stage]')?.getBoundingClientRect()
      if (!s) return null
      const side = Math.min(320, s.width * 0.3)
      if (x < s.left + s.width * 0.22)
        return {
          region: 'left',
          hint: { left: box.left, top: box.top, width: side, height: box.height },
        }
      if (x > s.right - s.width * 0.22)
        return {
          region: 'right',
          hint: { left: box.right - side, top: box.top, width: side, height: box.height },
        }
      if (y > s.top + s.height * 0.55)
        return {
          region: 'bottom',
          hint: {
            left: s.left,
            top: s.bottom - s.height * 0.35,
            width: s.width,
            height: s.height * 0.35,
          },
        }
      return null
    },
    [layout],
  )

  const grab = useCallback(
    (id: DockId, e: ReactPointerEvent) => {
      if (layout.locked || narrow || e.button !== 0) return
      const x0 = e.clientX
      const y0 = e.clientY
      const floating = layout.float[id]
      let going = false
      let t: Target | null = null
      const move = (m: PointerEvent) => {
        if (!going && Math.hypot(m.clientX - x0, m.clientY - y0) < 5) return
        if (!going) {
          going = true
          // The live preview is a native view over the page: out of the way while dragging.
          document.body.dataset.dockDrag = '1'
          // No text gets selected while dragging.
          document.body.style.userSelect = 'none'
        }
        t = targetAt(m.clientX, m.clientY, id)
        if (floating) {
          setRaw((l) => ({
            ...l,
            float: {
              ...l.float,
              [id]: { ...floating, x: floating.x + m.clientX - x0, y: floating.y + m.clientY - y0 },
            },
          }))
        }
        setDrag({ id, x: m.clientX, y: m.clientY, t })
      }
      const end = () => {
        document.removeEventListener('pointermove', move)
        document.removeEventListener('pointerup', up)
        document.removeEventListener('pointercancel', end)
        delete document.body.dataset.dockDrag
        document.body.style.userSelect = ''
        setDrag(null)
      }
      // The system took the pointer (a touch turned into a scroll): nothing moves.
      const up = (u: PointerEvent) => {
        end()
        if (!going) return
        setLayout((l) => {
          const target = t
          if (!target) {
            if (l.float[id]) return l
            return popOut(l, id, { x: Math.max(8, u.clientX - 60), y: Math.max(8, u.clientY - 16) })
          }
          const n = without(l, id)
          const list = [...n[target.region]]
          if (target.at) {
            const i = list.indexOf(target.at)
            list.splice(target.before ? i : i + 1, 0, id)
          } else list.push(id)
          return { ...n, [target.region]: list, preset: null }
        })
      }
      document.addEventListener('pointermove', move)
      document.addEventListener('pointerup', up)
      document.addEventListener('pointercancel', end)
    },
    [layout.float, layout.locked, narrow, setLayout, targetAt],
  )

  const api: LayoutApi = { layout, setLayout, grab, narrow }

  if (narrow) {
    const shown = showing(layout)
    const cur = shown.includes(layout.mob) ? layout.mob : (shown[0] ?? 'scenes')
    return (
      <Ctx.Provider value={api}>
        {top}
        <div
          ref={ws}
          className="flex flex-col overflow-hidden rounded-panel border border-line bg-surface-1"
        >
          {/* The picture keeps its 16:9 shape here (on wide screens it fits the space). */}
          <div
            data-stage
            className="flex flex-col [&>:first-child]:aspect-video [&>:first-child]:flex-none [&>:first-child]:[container-type:inline-size]"
          >
            {stage}
          </div>
          {shown.length > 1 && (
            <Segmented
              label="Panel"
              className="mx-3 my-3 max-w-full overflow-x-auto"
              value={cur}
              options={shown.map((d) => ({ value: d, label: dockName(layout, d) }))}
              onChange={(d) => setLayout((l) => ({ ...l, mob: d }))}
            />
          )}
          <div className="flex min-h-[320px] flex-col border-t border-line">{docks(cur)}</div>
        </div>
      </Ctx.Provider>
    )
  }

  const column = (region: Region) => {
    const ids = layout[region].filter((d) => !layout.hidden.includes(d))
    if (ids.length === 0) return null
    const vertical = region !== 'bottom'
    const out: ReactNode[] = []
    ids.forEach((id, i) => {
      const prev = ids[i - 1]
      if (prev)
        out.push(
          <Divider
            key={`split-${prev}-${id}`}
            dir={vertical ? 'row' : 'col'}
            label={`Resize ${dockName(layout, prev)} and ${dockName(layout, id)}`}
            between={[prev, id]}
          />,
        )
      out.push(
        <div
          key={id}
          data-dock={id}
          className={cx(
            'flex min-h-0 min-w-0 flex-col overflow-hidden',
            drag?.id === id && 'opacity-40',
          )}
          style={{ flex: `${layout.w[id] ?? 1} 1 0` }}
        >
          {docks(id)}
        </div>,
      )
    })
    const size: CSSProperties =
      region === 'bottom'
        ? { height: layout.bh, flex: 'none' }
        : { width: region === 'left' ? layout.lw : layout.rw, flex: 'none' }
    return (
      <div className={cx('flex min-h-0 min-w-0', vertical ? 'flex-col' : 'flex-row')} style={size}>
        {out}
      </div>
    )
  }
  const left = column('left')
  const right = column('right')
  const bottom = column('bottom')
  const floats = (Object.entries(layout.float) as [DockId, Float][]).filter(
    ([id]) => !layout.hidden.includes(id),
  )

  return (
    <Ctx.Provider value={api}>
      {top}
      <div
        ref={ws}
        aria-label="Studio layout"
        className="flex overflow-hidden rounded-panel border border-line bg-surface-1"
        style={height ? { height } : undefined}
      >
        {left}
        {left && <Divider dir="col" edge="left" label="Resize the left panels" />}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div data-stage className="flex min-h-[140px] min-w-0 flex-1 flex-col">
            {stage}
          </div>
          {bottom && (
            <Divider dir="row" edge="bottom" label="Resize the preview and the panels below" />
          )}
          {bottom}
        </div>
        {right && <Divider dir="col" edge="right" label="Resize the right panels" />}
        {right}
      </div>
      {floats.map(([id, f]) => (
        <FloatingDock key={id} id={id} f={f}>
          {docks(id)}
        </FloatingDock>
      ))}
      {drag && (
        <>
          {drag.t && (
            <div
              aria-hidden
              className="pointer-events-none fixed z-40 rounded-control border-2 border-arc bg-accent-soft transition-all duration-100"
              style={drag.t.hint}
            />
          )}
          {!layout.float[drag.id] && (
            <div
              aria-hidden
              className="pointer-events-none fixed z-50 inline-flex items-center gap-2 rounded-control border border-accent-line bg-surface-3 px-3 py-2 font-display text-[14px] font-bold shadow-pop"
              style={{ left: drag.x + 12, top: drag.y + 12 }}
            >
              <DotsSixVertical size={14} /> {dockName(layout, drag.id)}
            </div>
          )}
        </>
      )}
    </Ctx.Provider>
  )
}

/** A panel popped out of the layout: moved by its title, resized by its corner. */
function FloatingDock({ id, f, children }: { id: DockId; f: Float; children: ReactNode }) {
  const { setLayout, layout } = useLayout()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const w = Math.round(el.offsetWidth)
      const h = Math.round(el.offsetHeight)
      setLayout((l) => {
        const cur = l.float[id]
        if (!cur || (cur.w === w && cur.h === h)) return l
        return { ...l, float: { ...l.float, [id]: { ...cur, w, h } } }
      })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [id, setLayout])
  return (
    <div
      ref={ref}
      data-dock={id}
      data-over-preview
      data-pos={`${f.x},${f.y},${f.w},${f.h}`}
      role="region"
      aria-label={`${dockName(layout, id)} (floating)`}
      className="fixed z-30 flex min-h-40 min-w-56 resize flex-col overflow-hidden rounded-panel border border-line-strong bg-surface-1 shadow-pop"
      style={{ left: f.x, top: f.y, width: f.w, height: f.h }}
    >
      {children}
    </div>
  )
}

/** A line between panels: drag it, or focus it and use the arrow keys (Shift for bigger steps). */
function Divider({
  dir,
  edge,
  between,
  label,
}: {
  dir: 'row' | 'col'
  edge?: Region
  between?: [DockId, DockId]
  label: string
}) {
  const { layout, setLayout } = useLayout()
  const ref = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(false)
  const by = useCallback(
    (dx: number, dy: number) => {
      const ws = ref.current?.closest('[aria-label="Studio layout"]')?.getBoundingClientRect()
      setLayout((l) => {
        if (edge === 'left')
          return { ...l, lw: clamp(l.lw + dx, 200, (ws?.width ?? 1400) - 420), preset: null }
        if (edge === 'right')
          return { ...l, rw: clamp(l.rw - dx, 220, (ws?.width ?? 1400) - 420), preset: null }
        if (edge === 'bottom')
          return { ...l, bh: clamp(l.bh - dy, 120, (ws?.height ?? 800) - 180), preset: null }
        if (!between) return l
        const [a, b] = between
        const A = ref.current?.previousElementSibling as HTMLElement | null
        const B = ref.current?.nextElementSibling as HTMLElement | null
        if (!A || !B) return l
        const sa = dir === 'col' ? A.offsetWidth : A.offsetHeight
        const sb = dir === 'col' ? B.offsetWidth : B.offsetHeight
        const na = clamp(sa + (dir === 'col' ? dx : dy), 110, sa + sb - 110)
        const tot = (l.w[a] ?? 1) + (l.w[b] ?? 1)
        const wa = (tot * na) / (sa + sb)
        return { ...l, w: { ...l.w, [a]: wa, [b]: tot - wa } }
      })
    },
    [between, dir, edge, setLayout],
  )
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (layout.locked) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    setActive(true)
    let x = e.clientX
    let y = e.clientY
    const el = e.currentTarget
    const move = (m: PointerEvent) => {
      by(m.clientX - x, m.clientY - y)
      x = m.clientX
      y = m.clientY
    }
    const up = () => {
      setActive(false)
      el.removeEventListener('pointermove', move)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up, { once: true })
    el.addEventListener('pointercancel', up, { once: true })
  }
  const key = (e: ReactKeyboardEvent) => {
    if (layout.locked) return
    const step = e.shiftKey ? 48 : 16
    const d = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }[e.key]
    if (!d) return
    e.preventDefault()
    by(d[0] ?? 0, d[1] ?? 0)
  }
  return (
    <div
      ref={ref}
      role="separator"
      tabIndex={layout.locked ? -1 : 0}
      aria-label={label}
      aria-orientation={dir === 'col' ? 'vertical' : 'horizontal'}
      onPointerDown={down}
      onKeyDown={key}
      className={cx(
        'relative z-10 flex-none touch-none bg-line outline-none after:absolute after:-inset-1 hover:bg-arc focus-visible:bg-arc',
        dir === 'col' ? 'w-px cursor-col-resize' : 'h-px cursor-row-resize',
        active && 'bg-arc',
        layout.locked && 'pointer-events-none',
      )}
    />
  )
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(Math.max(lo, hi), v))
}

/** A panel's title bar: its grip moves it; `actions` sit on the right. */
export function DockHeader({
  id,
  title,
  actions,
  info,
}: {
  id: DockId
  title?: ReactNode
  actions?: ReactNode
  info?: ReactNode
}) {
  const { grab, layout, narrow } = useLayout()
  const movable = !layout.locked && !narrow
  return (
    <header
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button, input, select, a, [role="group"]')) return
        if (movable) grab(id, e)
      }}
      className={cx(
        'flex h-11 min-w-0 flex-none items-center gap-1.5 border-b border-line bg-surface-1 pr-1.5 select-none',
        movable ? 'cursor-grab pl-1 active:cursor-grabbing' : 'pl-3',
      )}
    >
      {movable && (
        <span aria-hidden className="grid h-6 w-[18px] place-items-center text-text-3">
          <DotsSixVertical size={15} />
        </span>
      )}
      <h2 className="truncate font-display text-[17px] font-extrabold tracking-tight text-text">
        {title ?? dockName(layout, id)}
      </h2>
      {info}
      <span className="flex-1" />
      {actions}
      {!narrow && <DockMenu id={id} />}
    </header>
  )
}

/** A panel's own menu: the keyboard way to move it, pop it out or hide it. */
function DockMenu({ id }: { id: DockId }) {
  const { layout, setLayout } = useLayout()
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node))
        setOpen(false)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        btn.current?.focus()
      }
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', key)
    menu.current?.querySelector<HTMLElement>('button')?.focus()
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', key)
    }
  }, [open])
  const where = regionOf(layout, id)
  const pick = (f: (l: Layout) => Layout) => {
    setLayout(f)
    setOpen(false)
    btn.current?.focus()
  }
  const item =
    'flex h-9 w-full items-center rounded-[8px] px-2.5 text-left text-[14.5px] hover:bg-surface-3 focus-visible:bg-surface-3 focus-visible:outline-none'
  const moves: [Region, string][] = [
    ['left', 'Move to the left'],
    ['bottom', 'Move to the bottom'],
    ['right', 'Move to the right'],
  ]
  return (
    <div className="relative">
      <IconButton
        ref={btn}
        size="sm"
        variant="ghost"
        label={`${dockName(layout, id)} panel: move, pop out or hide`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <DotsThree size={16} weight="bold" />
      </IconButton>
      {open && (
        <div
          ref={menu}
          role="menu"
          aria-label={`${dockName(layout, id)} panel`}
          className="absolute right-0 z-50 mt-1 flex w-52 flex-col gap-px rounded-control border border-line-strong bg-surface-2 p-1.5 shadow-pop"
        >
          {moves
            .filter(([r]) => r !== where)
            .map(([r, label]) => (
              <button
                key={r}
                type="button"
                role="menuitem"
                className={item}
                onClick={() => pick((l) => moveTo(l, id, r))}
              >
                {label}
              </button>
            ))}
          {!layout.float[id] && (
            <button
              type="button"
              role="menuitem"
              className={item}
              onClick={() => {
                const r = btn.current?.getBoundingClientRect()
                pick((l) =>
                  popOut(l, id, {
                    x: Math.max(8, (r?.left ?? 200) - 260),
                    y: (r?.bottom ?? 120) + 8,
                  }),
                )
              }}
            >
              Pop out
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => pick((l) => toggle(l, id))}
          >
            Hide this panel
          </button>
          {isWeb(id) && (
            <button
              type="button"
              role="menuitem"
              className={cx(item, 'text-danger')}
              onClick={() => pick((l) => removeWeb(l, id))}
            >
              Remove this web panel
            </button>
          )}
        </div>
      )}
    </div>
  )
}
