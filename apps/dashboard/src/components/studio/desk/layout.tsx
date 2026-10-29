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
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Browsers,
  DotsSixVertical,
  DotsThree,
} from '@phosphor-icons/react'
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
  /** 2: sizes saved since the panels' height follows the divider exactly (27 Oct). */
  sizes?: 2
  /** Panels sharing a spot as tabs (owner's pick L2, 29 Oct): the panel placed in the row or
   * column, and the others with it. */
  tabs?: Partial<Record<DockId, DockId[]>>
  /** The tab showing in each shared spot (the placed panel when not set). */
  on?: Partial<Record<DockId, DockId>>
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
    sizes: 2,
    tabs: {},
    on: {},
  }
  // Tabs: only known panels, each in one place.
  const used = new Set<string>([...l.left, ...l.right, ...l.bottom, ...Object.keys(l.float)])
  for (const [host, guests] of Object.entries(v.tabs ?? {}) as [DockId, DockId[]][]) {
    if (!used.has(host) || !Array.isArray(guests)) continue
    const keepers = guests.filter((g) => known.has(g) && !used.has(g))
    for (const g of keepers) used.add(g)
    if (keepers.length) l.tabs = { ...l.tabs, [host]: keepers }
  }
  for (const [host, cur] of Object.entries(v.on ?? {}) as [DockId, DockId][])
    if (l.tabs?.[host]?.includes(cur)) l.on = { ...l.on, [host]: cur }
  // Before 27 Oct the panels below showed at most 45% of the space, while a drag up kept
  // raising the height saved: honoured now, it would open with a tiny preview. Older saves
  // keep at most the default height once.
  if (v.sizes !== 2) l.bh = Math.min(l.bh, fresh('side').bh)
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

/** The panel a tab shares its spot with (itself when it isn't a tab of another). */
export function hostOf(l: Layout, id: DockId): DockId {
  for (const [host, guests] of Object.entries(l.tabs ?? {}) as [DockId, DockId[]][])
    if (guests.includes(id)) return host
  return id
}

/** Every panel in a spot, the placed one first. */
export const groupOf = (l: Layout, host: DockId): DockId[] => [host, ...(l.tabs?.[host] ?? [])]

/** The tab showing in a spot: the one picked, or the first one that isn't hidden. */
export function activeOf(l: Layout, host: DockId): DockId {
  const group = groupOf(l, host).filter((d) => !l.hidden.includes(d))
  const on = l.on?.[host]
  return on && group.includes(on) ? on : (group[0] ?? host)
}

/** In a row, a column or floating (or a tab of one that is). */
export const placed = (l: Layout, id: DockId): boolean => {
  const h = hostOf(l, id)
  return !!regionOf(l, h) || !!l.float[h]
}

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

/** Where a panel's spot is, for a tab the spot it shares. */
export const spotOf = (l: Layout, id: DockId): Region | null => regionOf(l, hostOf(l, id))

function without(l: Layout, id: DockId): Layout {
  const tabs = { ...l.tabs }
  const on = { ...l.on }
  const host = hostOf(l, id)
  if (host !== id) {
    // A tab taken out: the spot keeps the others.
    const rest = (tabs[host] ?? []).filter((g) => g !== id)
    if (rest.length) tabs[host] = rest
    else delete tabs[host]
    if (on[host] === id) delete on[host]
    return { ...l, tabs, on }
  }
  const guests = tabs[id] ?? []
  const [next, ...others] = guests
  delete tabs[id]
  delete on[id]
  const float = { ...l.float }
  const f = float[id]
  delete float[id]
  if (next) {
    // The panel holding the spot leaves: the next tab takes its place, size and all.
    if (others.length) tabs[next] = others
    if (f) float[next] = f
    const swap = (ids: DockId[]) => ids.map((x) => (x === id ? next : x))
    return {
      ...l,
      left: swap(l.left),
      right: swap(l.right),
      bottom: swap(l.bottom),
      float,
      tabs,
      on,
      w: { ...l.w, [next]: l.w[id] ?? 1 },
    }
  }
  return {
    ...l,
    left: l.left.filter((x) => x !== id),
    right: l.right.filter((x) => x !== id),
    bottom: l.bottom.filter((x) => x !== id),
    float,
    tabs,
    on,
  }
}

/** Puts `id` in `host`'s spot as a tab, showing. */
export function tabWith(l: Layout, id: DockId, host: DockId): Layout {
  if (id === host) return l
  const n = without(l, id)
  const h = hostOf(n, host)
  return {
    ...n,
    tabs: { ...n.tabs, [h]: [...(n.tabs?.[h] ?? []), id] },
    on: { ...n.on, [h]: id },
    hidden: n.hidden.filter((d) => d !== id),
    preset: null,
  }
}

const rectOf = (b: DOMRect): Rect => ({
  left: b.left,
  top: b.top,
  width: b.width,
  height: b.height,
})

/** Where a dragged panel would land. */
interface Target {
  region: Region
  at?: DockId
  before?: boolean
  /** Share `at`'s spot as a tab. */
  tab?: boolean
  hint: { left: number; top: number; width: number; height: number }
  /** The drop arrows shown (owner's pick L1): over what, which ways, which one is lit. */
  pad: { rect: Rect; ways: Way[]; lit: Way | null }
}

type Way = 'up' | 'down' | 'left' | 'right' | 'tab'
type Rect = { left: number; top: number; width: number; height: number }

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
  // A tab hidden leaves its spot (shown again, it goes back beside the picture).
  const n = hostOf(l, id) !== id ? without(l, id) : l
  return { ...n, hidden: [...n.hidden, id], preset: null }
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

  // Fills the window below where it starts, down to the page's own gap at the bottom: the
  // page doesn't scroll and no space is left over. Followed when the bar above changes height.
  useLayoutEffect(() => {
    const el = ws.current
    if (!el || narrow) return
    const fit = () => {
      const top = el.getBoundingClientRect().top + window.scrollY
      const main = el.closest('main')
      const gap = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 20
      setHeight(Math.max(420, Math.floor(window.innerHeight - top - gap)))
    }
    fit()
    window.addEventListener('resize', fit)
    const ro = new ResizeObserver(fit)
    if (el.parentElement) ro.observe(el.parentElement)
    for (const s of [...(el.parentElement?.children ?? [])]) if (s !== el) ro.observe(s)
    // The window's status bar coming or going changes the room below (--fc-statusbar).
    const mo = new MutationObserver(fit)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] })
    return () => {
      window.removeEventListener('resize', fit)
      ro.disconnect()
      mo.disconnect()
    }
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
        const ways: Way[] = vertical ? ['up', 'tab', 'down'] : ['left', 'tab', 'right']
        const pad = (lit: Way) => ({ rect: rectOf(b), ways, lit })
        // The middle: share its spot as a tab (owner's pick L2).
        const u = (x - b.left) / b.width
        const v = (y - b.top) / b.height
        if (u > 0.3 && u < 0.7 && v > 0.3 && v < 0.7)
          return { region, at: id, tab: true, hint: rectOf(b), pad: pad('tab') }
        const before = vertical ? v < 0.5 : u < 0.5
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
        return {
          region,
          at: id,
          before,
          hint,
          pad: pad(vertical ? (before ? 'up' : 'down') : before ? 'left' : 'right'),
        }
      }
      const s = ws.current?.querySelector('[data-stage]')?.getBoundingClientRect()
      if (!s) return null
      // Beside the picture: a column (or the row below) that's there already takes the panel
      // at its end, and the hint is that spot, not the whole edge: dropping Audio on the left
      // edge, already the last there, showed a strip and did nothing (owner's recording).
      const way: Record<Region, Way> = { left: 'left', right: 'right', bottom: 'down' }
      const pad = (region: Region) => ({
        rect: rectOf(s),
        ways: ['left', 'right', 'down'] as Way[],
        lit: way[region],
      })
      const edge = (region: Region, hint: Target['hint']): Target => {
        const ids = layout[region].filter((d) => !layout.hidden.includes(d))
        const last = ids[ids.length - 1]
        const el =
          last && ws.current?.querySelector<HTMLElement>(`[data-dock="${CSS.escape(last)}"]`)
        if (!last || !el) return { region, hint, pad: pad(region) }
        const b = el.getBoundingClientRect()
        // Already the last there: it stays where it is.
        if (last === self)
          return { region, at: self, before: true, hint: rectOf(b), pad: pad(region) }
        return {
          region,
          pad: pad(region),
          at: last,
          before: false,
          hint:
            region === 'bottom'
              ? { top: b.top, height: b.height, left: b.left + b.width / 2, width: b.width / 2 }
              : { left: b.left, width: b.width, top: b.top + b.height / 2, height: b.height / 2 },
        }
      }
      const side = Math.min(320, s.width * 0.3)
      if (x < s.left + s.width * 0.22)
        return edge('left', { left: box.left, top: box.top, width: side, height: box.height })
      if (x > s.right - s.width * 0.22)
        return edge('right', {
          left: box.right - side,
          top: box.top,
          width: side,
          height: box.height,
        })
      if (y > s.top + s.height * 0.55)
        return edge('bottom', {
          left: s.left,
          top: s.bottom - s.height * 0.35,
          width: s.width,
          height: s.height * 0.35,
        })
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
          if (target.at === id) return l
          if (target.tab && target.at) return tabWith(l, id, target.at)
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
        <div ref={ws} className="flex flex-col overflow-hidden border border-line bg-surface-1">
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
    // A spot shows while any of its tabs isn't hidden.
    const ids = layout[region].filter((d) =>
      groupOf(layout, d).some((x) => !layout.hidden.includes(x)),
    )
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
            drag?.id === activeOf(layout, id) && 'opacity-40',
          )}
          style={{ flex: `${layout.w[id] ?? 1} 1 0` }}
        >
          {docks(activeOf(layout, id))}
        </div>,
      )
    })
    // The size dragged to; when the window is too small for it, the panels give way (they
    // shrink, the picture and its bar keep their minimum) without forgetting it.
    const size: CSSProperties =
      region === 'bottom'
        ? { height: layout.bh, flex: '0 1 auto', minHeight: MIN_PANEL_H }
        : {
            width: region === 'left' ? layout.lw : layout.rw,
            flex: '0 1 auto',
            minWidth: MIN_PANEL_W,
          }
    return (
      <div className={cx('flex min-h-0 min-w-0', vertical ? 'flex-col' : 'flex-row')} style={size}>
        {out}
      </div>
    )
  }
  const left = column('left')
  const right = column('right')
  const bottom = column('bottom')
  const floats = (Object.entries(layout.float) as [DockId, Float][]).filter(([id]) =>
    groupOf(layout, id).some((x) => !layout.hidden.includes(x)),
  )

  return (
    <Ctx.Provider value={api}>
      {top}
      <div
        ref={ws}
        aria-label="Studio layout"
        // Square, as OBS's: the live picture is a square native view over the stage, and a
        // rounded corner beside it looked broken (owner, 28 Oct).
        className="flex overflow-hidden border border-line bg-surface-1"
        style={height ? { height } : undefined}
      >
        {left}
        {left && <Divider dir="col" edge="left" label="Resize the left panels" />}
        <div className="flex min-h-0 flex-1 flex-col" style={{ minWidth: MIN_STAGE_W }}>
          {/* Its least height is the picture's minimum plus its bar (min-height: auto). */}
          <div data-stage className="flex min-w-0 flex-1 flex-col">
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
          {docks(activeOf(layout, id))}
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
          {drag.t && <DropPad {...drag.t.pad} />}
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

const WAY_AT: Record<Way, [number, number, typeof ArrowUp]> = {
  up: [1, 0, ArrowUp],
  left: [0, 1, ArrowLeft],
  tab: [1, 1, Browsers],
  right: [2, 1, ArrowRight],
  down: [1, 2, ArrowDown],
}

/** The drop arrows over what a dragged panel is above: the ways it can go there, the one it
 * would take lit (owner's pick L1). Only a picture; the pointer's place decides. */
function DropPad({ rect, ways, lit }: Target['pad']) {
  const cell = 40
  const gap = 6
  const size = cell * 3 + gap * 2
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-50 grid grid-cols-3 grid-rows-3"
      style={{
        left: rect.left + rect.width / 2 - size / 2,
        top: rect.top + rect.height / 2 - size / 2,
        width: size,
        height: size,
        gap,
      }}
    >
      {ways.map((w) => {
        const [col, row, Icon] = WAY_AT[w]
        return (
          <span
            key={w}
            className={cx(
              'grid place-items-center rounded-[10px] border shadow-pop',
              w === lit
                ? 'border-transparent bg-arc text-white'
                : 'border-line-strong bg-surface-1 text-text-2',
            )}
            style={{ gridColumn: col + 1, gridRow: row + 1 }}
          >
            <Icon size={18} weight="bold" />
          </span>
        )
      })}
    </div>
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
  // The sizes on screen either side (fractional pixels), taken when a drag starts: the
  // divider is then placed from the total distance moved, so it stays under the pointer.
  // (Sizes re-read and rounded at every step lagged it a few pixels; saved sizes the window
  // couldn't fit made a dead zone at the start of a drag.)
  const measure = useCallback((): Sizes | null => {
    const prev = ref.current?.previousElementSibling as HTMLElement | null
    const next = ref.current?.nextElementSibling as HTMLElement | null
    if (!prev || !next) return null
    const a = prev.getBoundingClientRect()
    const b = next.getBoundingClientRect()
    const bar = (prev.lastElementChild as HTMLElement | null)?.getBoundingClientRect().height ?? 0
    return { a: dir === 'col' ? a.width : a.height, b: dir === 'col' ? b.width : b.height, bar }
  }, [dir])
  const place = useCallback(
    (dx: number, dy: number, m: Sizes) => {
      const d = dir === 'col' ? dx : dy
      setLayout((l) => {
        // The other side keeps its minimum: the stage 240 px wide, the picture a strip
        // above its bar.
        if (edge === 'left')
          return { ...l, lw: clamp(m.a + d, MIN_PANEL_W, m.a + m.b - MIN_STAGE_W), preset: null }
        if (edge === 'right')
          return { ...l, rw: clamp(m.b - d, MIN_PANEL_W, m.a + m.b - MIN_STAGE_W), preset: null }
        if (edge === 'bottom')
          return {
            ...l,
            bh: clamp(m.b - d, MIN_PANEL_H, m.b + (m.a - m.bar) - MIN_PICTURE),
            preset: null,
          }
        if (!between) return l
        const [a, b] = between
        const na = clamp(m.a + d, 110, m.a + m.b - 110)
        const tot = (l.w[a] ?? 1) + (l.w[b] ?? 1)
        const wa = (tot * na) / (m.a + m.b)
        return { ...l, w: { ...l.w, [a]: wa, [b]: tot - wa } }
      })
    },
    [between, dir, edge, setLayout],
  )
  const by = (dx: number, dy: number) => {
    const m = measure()
    if (m) place(dx, dy, m)
  }
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (layout.locked) return
    const start = measure()
    if (!start) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    setActive(true)
    const x0 = e.clientX
    const y0 = e.clientY
    const el = e.currentTarget
    const move = (m: PointerEvent) => place(m.clientX - x0, m.clientY - y0, start)
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

/**
 * The smallest a part can be dragged to, as OBS's splitters: the picture down to a strip (its
 * bar stays whole), a panel to its title and a little of its list. The window's own size
 * squeezes the panels only when they no longer fit, never the drag.
 */
const MIN_PICTURE = 64
const MIN_PANEL_H = 110
const MIN_PANEL_W = 180
const MIN_STAGE_W = 240

/** A divider's two sides along its axis, and (for the one under the preview) the bar. */
interface Sizes {
  a: number
  b: number
  bar: number
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
  const { grab, layout, setLayout, narrow } = useLayout()
  const movable = !layout.locked && !narrow
  const host = hostOf(layout, id)
  // On a phone one panel shows at a time, picked below the picture: no tabs there.
  const group = narrow ? [id] : groupOf(layout, host).filter((d) => !layout.hidden.includes(d))
  return (
    <header
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button, input, select, a, [role="group"]')) return
        if (movable) grab(id, e)
      }}
      className={cx(
        '@container flex h-11 min-w-0 flex-none items-center gap-1.5 border-b border-line bg-surface-1 pr-1.5 select-none',
        movable ? 'cursor-grab pl-1 active:cursor-grabbing' : 'pl-3',
      )}
    >
      {movable && (
        <span aria-hidden className="grid h-6 w-[18px] place-items-center text-text-3">
          <DotsSixVertical size={15} />
        </span>
      )}
      {/* A short name stays whole (a long one, a web panel's, is cut at two thirds); on a
          narrow panel the buttons scroll sideways instead of squeezing it to "S…". */}
      {group.length > 1 ? (
        // Panels sharing this spot (owner's pick L2): one tab each; the grip drags this one.
        <div
          role="tablist"
          aria-label="Panels here"
          className="flex max-w-[75%] shrink-0 items-stretch gap-0.5 self-stretch overflow-x-auto [scrollbar-width:none]"
        >
          {group.map((d) => (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={d === id}
              onClick={() => setLayout((l) => ({ ...l, on: { ...l.on, [host]: d } }))}
              className={cx(
                '-mb-px shrink-0 border-b-2 px-2 font-display text-[15px] font-extrabold tracking-tight outline-none focus-visible:shadow-[var(--fc-focus)]',
                d === id
                  ? 'border-text text-text'
                  : 'border-transparent text-text-3 hover:text-text',
              )}
            >
              {d === id ? (title ?? dockName(layout, d)) : dockName(layout, d)}
            </button>
          ))}
        </div>
      ) : (
        <h2 className="max-w-[65%] shrink-0 truncate font-display text-[17px] font-extrabold tracking-tight text-text">
          {title ?? dockName(layout, id)}
        </h2>
      )}
      {info}
      <span className="min-w-0 flex-1" />
      <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
        {actions}
      </div>
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
  const where = spotOf(layout, id)
  const pick = (f: (l: Layout) => Layout) => {
    setLayout(f)
    setOpen(false)
    btn.current?.focus()
  }
  const item =
    'flex h-9 w-full items-center rounded-[8px] px-2.5 text-left text-[14.5px] hover:bg-pick hover:text-on-pick focus-visible:bg-pick focus-visible:text-on-pick focus-visible:outline-none'
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
