// Theme bundles in the gallery: the featured carousel, theme cards, and the sheet that shows
// everything a theme brings (its five scenes and its alert) before you use it.

import { useEffect, useMemo, useRef, useState } from 'react'
import { CaretLeft, CaretRight, Copy, Lightning, Play } from '@phosphor-icons/react'
import { MOTION_LABEL, SCENE_LABEL, STYLE_LABEL, previewAlert, type Design } from '@ferrocast/api'
import { Badge, Button, Dialog, IconButton, cx } from '@ferrocast/ui'
import { DesignStage } from './DesignStage'
import { BrandChip } from './brand-chip'
import { ScenePreview } from './previews'

type Theme = Extract<Design, { kind: 'theme' }>

/** Scenes in the order a show runs; unknown keys go last. */
const SHOW_ORDER = ['starting_soon', 'in_game', 'just_chatting', 'brb', 'ending']
const rank = (k: string) => {
  const i = SHOW_ORDER.indexOf(k)
  return i === -1 ? SHOW_ORDER.length : i
}

export const isTheme = (d: Design): d is Theme => d.kind === 'theme'

/** The gallery tab a design lives on: small scenes (a rotator, a countdown) sit with widgets. */
export function galleryTab(d: Design): 'themes' | 'alerts' | 'widgets' {
  if (d.kind === 'scene') return d.content.width < 1280 ? 'widgets' : 'themes'
  return d.kind === 'theme' ? 'themes' : d.kind === 'alert' ? 'alerts' : 'widgets'
}

/** "5 scenes + alerts", the line every theme card and sheet uses. */
export function bundleLine(t: Theme): string {
  const n = t.content.scenes.length
  return `${n} scene${n === 1 ? '' : 's'}${t.content.alert_design ? ' + alerts' : ''}`
}

/** True while at least `ratio` of the element is on screen (previews only play then). */
function useInView<T extends Element>(ratio = 0.6) {
  const ref = useRef<T>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setSeen(!!e && e.intersectionRatio >= ratio), {
      threshold: [0, ratio, 1],
    })
    io.observe(el)
    return () => io.disconnect()
  }, [ratio])
  return [ref, seen] as const
}

function Tags({ design, className }: { design: Design; className?: string }) {
  return (
    <span className={cx('flex flex-wrap items-center gap-1.5', className)}>
      <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[12.5px] font-semibold text-text-2">
        {STYLE_LABEL[design.tags.style]}
      </span>
      <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[12.5px] font-semibold text-text-2">
        {MOTION_LABEL[design.tags.motion]}
      </span>
    </span>
  )
}

/** The big, swipeable row at the top of Themes. Only the card in view plays. */
export function FeaturedThemes({
  themes,
  onOpen,
  onUse,
  paused = false,
}: {
  themes: Theme[]
  onOpen: (t: Theme) => void
  onUse: (t: Theme) => void
  /** Stops the cards playing, e.g. while a dialog covers them. */
  paused?: boolean
}) {
  const track = useRef<HTMLDivElement>(null)
  const scroll = (dir: 1 | -1) => {
    const el = track.current
    if (!el) return
    const card = el.querySelector<HTMLElement>('[data-card]')
    el.scrollBy({ left: dir * ((card?.offsetWidth ?? el.clientWidth) + 14), behavior: 'smooth' })
  }
  if (themes.length === 0) return null
  return (
    <section aria-labelledby="featured-themes" className="mb-8">
      <div className="mb-3 flex items-center gap-2">
        <h2 id="featured-themes" className="font-display text-lg font-semibold tracking-tight">
          Featured
        </h2>
        <span className="flex-1" />
        <IconButton
          size="sm"
          variant="secondary"
          label="Previous featured theme"
          onClick={() => scroll(-1)}
        >
          <CaretLeft size={15} />
        </IconButton>
        <IconButton
          size="sm"
          variant="secondary"
          label="Next featured theme"
          onClick={() => scroll(1)}
        >
          <CaretRight size={15} />
        </IconButton>
      </div>
      <div
        ref={track}
        className="-mx-4 flex snap-x snap-mandatory gap-3.5 overflow-x-auto scroll-smooth px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:px-0"
      >
        {themes.map((t) => (
          <FeaturedCard
            key={t.id}
            theme={t}
            paused={paused}
            onOpen={() => onOpen(t)}
            onUse={() => onUse(t)}
          />
        ))}
      </div>
    </section>
  )
}

function FeaturedCard({
  theme,
  paused,
  onOpen,
  onUse,
}: {
  theme: Theme
  paused: boolean
  onOpen: () => void
  onUse: () => void
}) {
  const [ref, seen] = useInView<HTMLElement>(0.7)
  const titleId = `featured-${theme.id}`
  return (
    <article
      ref={ref}
      data-card
      aria-labelledby={titleId}
      className="relative w-[86%] shrink-0 snap-start overflow-hidden rounded-panel border border-line bg-surface-1 sm:w-[62%] lg:w-[46%] 2xl:w-[40%]"
    >
      <button
        type="button"
        onClick={onOpen}
        className="block w-full text-left focus-visible:outline-none"
        tabIndex={-1}
        aria-hidden="true"
      >
        <ScenePreview design={theme} live={seen && !paused} />
      </button>
      {/* Under the picture, not on it: every scene has its own text near the bottom. */}
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <h3 id={titleId} className="truncate font-display text-lg font-bold tracking-tight">
            {theme.name}
          </h3>
          <p className="truncate text-[13.5px] font-medium text-text-3">{bundleLine(theme)}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="secondary" icon={<Play size={13} />} onClick={onOpen}>
            Preview
          </Button>
          <Button size="sm" variant="primary" icon={<Lightning size={14} />} onClick={onUse}>
            Use theme
          </Button>
        </div>
      </div>
    </article>
  )
}

/** A theme in the grid: its starting scene (plays on hover), what's inside, two actions. */
export function ThemeCard({
  theme,
  onOpen,
  onUse,
  isNew,
}: {
  theme: Theme
  onOpen: () => void
  onUse: () => void
  isNew?: boolean
}) {
  const [hover, setHover] = useState(false)
  const titleId = `theme-${theme.id}`
  return (
    <article
      aria-labelledby={titleId}
      className="group relative flex flex-col overflow-hidden rounded-panel border border-line bg-surface-1 transition-[border-color,box-shadow] duration-150 focus-within:border-line-strong hover:border-line-strong hover:shadow-2"
      onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(false)}
    >
      <button
        type="button"
        onClick={onOpen}
        className="relative block w-full focus-visible:outline-none"
        tabIndex={-1}
        aria-hidden="true"
      >
        <ScenePreview design={theme} live={hover} lazy />
        {/* A solid chip, no backdrop blur: on Linux WebKit (the desktop webview) one blurred
            chip per card over a live scene stalled painting and ate memory without limit. */}
        <span className="absolute bottom-2.5 left-2.5 rounded-full bg-black/75 px-2.5 py-1 font-mono text-[12px] font-semibold text-white">
          {bundleLine(theme)}
        </span>
        {isNew && (
          <Badge tone="accent" className="absolute top-2.5 right-2.5 bg-surface-1 shadow-1">
            New
          </Badge>
        )}
      </button>
      <div className="flex flex-col gap-1.5 px-3.5 pt-3">
        <div className="flex items-center gap-2">
          <h3
            id={titleId}
            className="min-w-0 flex-1 truncate font-display text-base font-semibold tracking-tight"
          >
            {theme.name}
          </h3>
          {theme.built_in ? <BrandChip /> : <Badge tone="accent">Mine</Badge>}
        </div>
        <p className="line-clamp-2 text-[13.5px] leading-snug text-text-3">{theme.description}</p>
        <Tags design={theme} />
      </div>
      <div className="mt-auto flex gap-2 px-3.5 pt-3 pb-3.5">
        <Button size="sm" variant="secondary" onClick={onOpen} className="flex-1">
          Preview
        </Button>
        <Button size="sm" variant="primary" onClick={onUse} className="flex-[2]">
          Use theme
        </Button>
      </div>
    </article>
  )
}

/** Everything in a theme: switch between its scenes and its alert, then use it. */
export function ThemeSheet({
  theme,
  alertDesign,
  onClose,
  onUse,
  onDuplicate,
}: {
  theme: Theme | null
  alertDesign: Design | null
  onClose: () => void
  onUse: (t: Theme) => void
  onDuplicate: (t: Theme) => void
}) {
  const [view, setView] = useState<string>('')
  // The big preview first; then, once the dialog has opened, one thumbnail per frame so
  // no single frame has to draw five scenes.
  const [thumbs, setThumbs] = useState(0)
  useEffect(() => {
    if (!theme) return
    setThumbs(0)
    let frame = 0
    let shown = 0
    const total = theme.content.scenes.length
    const step = () => {
      shown += 1
      setThumbs(shown)
      if (shown < total) frame = requestAnimationFrame(step)
    }
    const t = window.setTimeout(() => (frame = requestAnimationFrame(step)), 240)
    return () => {
      window.clearTimeout(t)
      cancelAnimationFrame(frame)
    }
  }, [theme])
  const alert = useMemo(
    () =>
      alertDesign?.kind === 'alert'
        ? previewAlert(alertDesign, 'sub', { id: `sheet-${alertDesign.id}` })
        : null,
    [alertDesign],
  )
  if (!theme) return null
  const scenes = [...theme.content.scenes].sort((a, b) => rank(a.key) - rank(b.key))
  const current = view || scenes.find((s) => s.key === 'starting_soon')?.key || scenes[0]?.key || ''
  const views = [
    ...scenes.map((s) => ({ key: s.key, label: SCENE_LABEL[s.key] ?? s.name })),
    ...(alert ? [{ key: '__alert', label: 'Alerts' }] : []),
  ]
  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={theme.name}
      description={theme.description}
      footer={
        <>
          <span className="mr-auto hidden text-[13px] text-text-3 sm:block">
            {bundleLine(theme)}
            {alertDesign ? `, alert style ${alertDesign.name}` : ''}
          </span>
          <Button variant="secondary" icon={<Copy size={14} />} onClick={() => onDuplicate(theme)}>
            Duplicate & customise
          </Button>
          <Button variant="primary" icon={<Lightning size={14} />} onClick={() => onUse(theme)}>
            Use theme
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="overflow-hidden rounded-[12px] border border-line">
          {current === '__alert' ? (
            <DesignStage alert={alert} loop autoplay label={`${theme.name} alert preview`} />
          ) : (
            <ScenePreview key={current} design={theme} sceneKey={current} live />
          )}
        </div>
        <div
          role="tablist"
          aria-label={`${theme.name} scenes`}
          className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-flow-col sm:auto-cols-fr sm:overflow-visible sm:px-0"
        >
          {views.map((v, i) => (
            <button
              key={v.key}
              type="button"
              role="tab"
              aria-selected={current === v.key}
              onClick={() => setView(v.key)}
              className={cx(
                'fc-press flex w-[124px] shrink-0 flex-col gap-1.5 rounded-[10px] border p-1.5 text-left sm:w-auto sm:min-w-0',
                current === v.key
                  ? 'border-accent-line bg-accent-soft'
                  : 'border-line hover:border-line-strong',
              )}
            >
              <span aria-hidden="true" className="block overflow-hidden rounded-[7px]">
                {v.key === '__alert' ? (
                  <span className="grid aspect-video place-items-center bg-[radial-gradient(circle_at_50%_40%,var(--color-accent-soft),var(--color-surface-3))] text-accent-text">
                    <Lightning size={22} weight="fill" />
                  </span>
                ) : i < thumbs ? (
                  <ScenePreview design={theme} sceneKey={v.key} />
                ) : (
                  <span className="block aspect-video animate-pulse bg-surface-3" />
                )}
              </span>
              <span className="truncate px-0.5 text-[12.5px] font-semibold text-text">
                {v.label}
              </span>
            </button>
          ))}
        </div>
        <Tags design={theme} />
      </div>
    </Dialog>
  )
}
