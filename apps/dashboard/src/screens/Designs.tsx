// The design gallery: built-in designs (alerts, full themes, widgets) and your own, with
// live previews on hover or tap, dropdown filters, search, Use, Duplicate & customise,
// export, and the ways to bring designs in (a .ferrodesign, StreamElements, an asset pack,
// OBS).

import { useMemo, useRef, useState } from 'react'
import {
  Copy,
  DotsThree,
  DownloadSimple,
  FileArrowUp,
  MagnifyingGlass,
  MonitorPlay,
  Package,
  PaintBrushBroad,
  Play,
  Plus,
  Trash,
} from '@phosphor-icons/react'
import {
  EVENT_KEYS,
  EVENT_LABEL,
  MOTION_LABEL,
  MOTION_TAGS,
  STYLE_LABEL,
  STYLE_TAGS,
  newAlertDesign,
  previewAlert,
  type Design,
  type DesignKind,
  type EventKey,
  type MotionTag,
  type StyleTag,
} from '@ferrocast/api'
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  IconButton,
  Input,
  Select,
  Skeleton,
  cx,
} from '@ferrocast/ui'
import { LoadError, PageHeader } from '../components/Panel'
import { Menu } from '../components/Menu'
import { DesignStage, type StageHandle } from '../components/design/DesignStage'
import { BrandChip } from '../components/design/brand-chip'
import { EVENT_ICON } from '../components/design/inspector'
import { ScenePreview, WidgetPreview } from '../components/design/previews'
import {
  FindInObsDialog,
  ImportDesignDialog,
  UseDialog,
  useExport,
} from '../components/design/dialogs'
import { AssetPackDialog } from '../components/design/AssetPackDialog'
import { useAction, useClient, useResource } from '../lib/hooks'
import { go, href } from '../lib/router'

type KindFilter = 'all' | 'alert' | 'theme' | 'widget'
const KINDS: { value: KindFilter; label: string }[] = [
  { value: 'all', label: 'Everything' },
  { value: 'alert', label: 'Alerts' },
  { value: 'theme', label: 'Themes and scenes' },
  { value: 'widget', label: 'Widgets' },
]
/** Small scene designs (a rotator, a countdown) sit with the widgets; full scenes with themes. */
const kindMatch = (k: KindFilter, d: Design) => {
  if (k === 'all' || k === d.kind) return true
  if (d.kind !== 'scene') return false
  return d.content.width < 1280 ? k === 'widget' : k === 'theme'
}
const KIND_NAME: Record<DesignKind, string> = {
  alert: 'Alerts',
  theme: 'Theme',
  scene: 'Scene',
  widget: 'Widget',
}

function Tile({
  design,
  ev,
  active,
  onUse,
  onDuplicate,
  onDelete,
}: {
  design: Design
  ev: EventKey
  active: boolean
  onUse: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const stage = useRef<StageHandle>(null)
  const [hover, setHover] = useState(false)
  const { exportDesign } = useExport()
  const alert = useMemo(
    () =>
      design.kind === 'alert' ? previewAlert(design, ev, { id: `tile-${design.id}-${ev}` }) : null,
    [design, ev],
  )
  const titleId = `tile-${design.id}`
  return (
    <article
      aria-labelledby={titleId}
      className="group relative flex flex-col overflow-hidden rounded-panel border border-line bg-surface-1 transition-[border-color,box-shadow] duration-150 focus-within:border-line-strong focus-within:shadow-2 hover:border-line-strong hover:shadow-2"
      onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(false)}
    >
      <div className="relative">
        {design.kind === 'alert' ? (
          <DesignStage
            alert={alert}
            loop={hover}
            handle={stage}
            className="rounded-none border-0"
            label={`${design.name} preview`}
          >
            <div className="absolute right-2 bottom-2 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
              <Button
                size="sm"
                variant="secondary"
                icon={<Play size={13} />}
                onClick={() => stage.current?.play()}
              >
                Preview
              </Button>
            </div>
          </DesignStage>
        ) : design.kind === 'widget' ? (
          <WidgetPreview design={design} />
        ) : (
          <ScenePreview design={design} live={hover} />
        )}
      </div>
      <div className="flex flex-col gap-1 px-3.5 pt-3">
        <div className="flex items-center gap-2">
          <h3
            id={titleId}
            className="min-w-0 flex-1 truncate font-display text-base font-semibold tracking-tight"
          >
            {design.name}
          </h3>
          {design.built_in ? <BrandChip /> : <Badge tone="accent">Mine</Badge>}
          {design.pro && <Badge tone="pro">Pro</Badge>}
        </div>
        <p className="line-clamp-2 text-[13px] leading-snug text-text-3">
          {design.kind !== 'alert' && (
            <span className="font-medium text-text-2">{KIND_NAME[design.kind]}. </span>
          )}
          {design.description ||
            (design.origin.from ? `From ${design.origin.from}.` : 'Your own design.')}
        </p>
        {active && (
          <p className="text-[12.5px] font-medium text-accent-text">Plays your alerts now</p>
        )}
      </div>
      <div className="mt-auto flex gap-2 px-3.5 pt-2.5 pb-3.5">
        {design.built_in ? (
          <>
            <Button size="sm" variant="secondary" onClick={onUse} className="flex-1">
              Use
            </Button>
            <Button
              size="sm"
              variant="primary"
              icon={<Copy size={14} />}
              onClick={onDuplicate}
              className="flex-[2]"
            >
              Duplicate & customise
            </Button>
          </>
        ) : (
          <>
            <a
              href={href({ name: 'designer', id: design.id })}
              className="fc-press inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-control border border-line-strong bg-surface-3 px-3 text-[13px] font-semibold text-text hover:border-text-3"
            >
              <PaintBrushBroad size={14} />
              Edit
            </a>
            <Button size="sm" variant="secondary" onClick={onUse} className="flex-1">
              Use
            </Button>
            <Menu
              label={`More for ${design.name}`}
              align="end"
              trigger={(p) => (
                <IconButton {...p} size="sm" variant="secondary" label={`More for ${design.name}`}>
                  <DotsThree size={18} />
                </IconButton>
              )}
              items={[
                {
                  key: 'export',
                  label: 'Export or share',
                  icon: <DownloadSimple size={15} />,
                  onSelect: () => exportDesign(design),
                },
                { key: 'dup', label: 'Duplicate', icon: <Copy size={15} />, onSelect: onDuplicate },
                {
                  key: 'del',
                  label: 'Delete',
                  icon: <Trash size={15} />,
                  danger: true,
                  onSelect: onDelete,
                },
              ]}
            />
          </>
        )}
      </div>
    </article>
  )
}

const IMPORTS = [
  {
    key: 'file',
    icon: FileArrowUp,
    title: 'Design file',
    text: 'Import a .ferrodesign someone shared',
  },
  {
    key: 'se',
    icon: DownloadSimple,
    title: 'StreamElements',
    text: 'Bring your commands, points and tips across',
  },
  {
    key: 'pack',
    icon: Package,
    title: 'Asset pack',
    text: 'Drop a zip of PNG, WebM and MP3 files',
  },
  {
    key: 'obs',
    icon: MonitorPlay,
    title: 'Find in OBS',
    text: 'Spot old widgets and swap them for Ferrocast',
  },
] as const

export function Designs({ tab }: { tab: 'built' | 'mine' }) {
  const client = useClient()
  const { run } = useAction()
  const list = useResource((c) => c.designs())
  const active = useResource((c) => c.activeAlertDesign())
  const [kind, setKind] = useState<KindFilter>('all')
  const [ev, setEv] = useState<EventKey>('tip')
  const [style, setStyle] = useState<StyleTag | ''>('')
  const [motion, setMotion] = useState<MotionTag | ''>('')
  const [price, setPrice] = useState<'' | 'free' | 'pro'>('')
  const [q, setQ] = useState('')
  const [using, setUsing] = useState<Design | null>(null)
  const [deleting, setDeleting] = useState<Design | null>(null)
  const [dialog, setDialog] = useState<'file' | 'pack' | 'obs' | null>(null)

  const all = list.data ?? []
  const built = all.filter((d) => d.built_in)
  const mine = all.filter((d) => !d.built_in)
  const source = tab === 'built' ? built : mine
  const query = q.trim().toLowerCase()
  const items = source.filter(
    (d) =>
      kindMatch(kind, d) &&
      (!style || d.tags.style === style) &&
      (!motion || d.tags.motion === motion) &&
      (!price || (price === 'pro' ? d.pro : !d.pro)) &&
      (!query ||
        `${d.name} ${d.description} ${STYLE_LABEL[d.tags.style]} ${KIND_NAME[d.kind]}`
          .toLowerCase()
          .includes(query)),
  )
  const filtered = !!(style || motion || price || query || kind !== 'all')
  const clear = () => {
    setStyle('')
    setMotion('')
    setPrice('')
    setQ('')
    setKind('all')
  }
  const use = (d: Design) => {
    if (d.kind !== 'alert') return setUsing(d)
    void run('use', () => client.useDesign(d.id), {
      success: `${d.name} now plays your alerts.${d.built_in ? ' It is a built-in, so it keeps the small Ferrocast mark.' : ''}`,
    }).then((r) => r && active.set({ design_id: r.alert_design }))
  }
  const duplicate = (d: Design) =>
    void run('dup', () => client.duplicateDesign(d.id), {
      success: (c) => `${c.name} added to My designs, with no Ferrocast branding.`,
    }).then((c) => {
      if (c) go({ name: 'designer', id: c.id })
    })
  const startScratch = () =>
    void run('new', () => client.createDesign(newAlertDesign('My alerts')), {
      success: 'A fresh alert design is ready to edit.',
    }).then((d) => {
      if (d) go({ name: 'designer', id: d.id })
    })
  const selectCls = 'h-9 w-auto min-w-[8.5rem]'

  return (
    <div>
      <PageHeader
        title="Designs"
        description="Every built-in plays the real thing: hover or tap one to watch it. Duplicate one to make it yours, without Ferrocast branding."
        actions={
          <Button variant="secondary" icon={<Plus size={15} />} onClick={startScratch}>
            Start from scratch
          </Button>
        }
      />
      <div
        aria-label="Bring designs in"
        role="group"
        className="-mx-4 mb-5 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] min-[480px]:mx-0 min-[480px]:grid min-[480px]:grid-cols-2 min-[480px]:overflow-visible min-[480px]:px-0 xl:grid-cols-4"
      >
        {IMPORTS.map((x) => {
          const body = (
            <>
              <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-surface-3 text-accent-text">
                <x.icon size={20} />
              </span>
              <span className="min-w-0">
                <b className="block text-sm text-text">{x.title}</b>
                <span className="block text-[12.5px] leading-snug text-text-3">{x.text}</span>
              </span>
            </>
          )
          const cls =
            'fc-press flex min-w-0 items-center gap-3 rounded-[14px] border border-line bg-surface-1 px-3.5 py-3 text-left hover:border-line-strong focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none'
          return x.key === 'se' ? (
            <a
              key={x.key}
              href={href({ name: 'import', source: 'streamelements' })}
              className={cls}
            >
              {body}
            </a>
          ) : (
            <button key={x.key} type="button" className={cls} onClick={() => setDialog(x.key)}>
              {body}
            </button>
          )
        })}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <div
          role="tablist"
          aria-label="Collections"
          className="flex gap-0.5 rounded-[12px] border border-line bg-surface-2 p-[3px]"
        >
          {(
            [
              ['built', 'Built-in', built.length],
              ['mine', 'My designs', mine.length],
            ] as const
          ).map(([id, label, n]) => (
            <a
              key={id}
              role="tab"
              aria-selected={tab === id}
              href={href({ name: 'designs', ...(id === 'mine' ? { tab: 'mine' as const } : {}) })}
              className={cx(
                'inline-flex min-h-[34px] items-center gap-2 rounded-[9px] px-3.5 text-[13.5px] font-semibold',
                tab === id ? 'bg-surface-3 text-text shadow-1' : 'text-text-3 hover:text-text',
              )}
            >
              {label}
              <span className="font-mono text-[11.5px] text-text-3">{n}</span>
            </a>
          ))}
        </div>
        <span className="flex-1" />
        <label className="relative w-full sm:w-64">
          <span className="sr-only">Search designs</span>
          <MagnifyingGlass
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-3"
            aria-hidden="true"
          />
          <Input
            type="search"
            placeholder="Search designs"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-9 pl-9"
          />
        </label>
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-3">
        <label className="flex items-center gap-2 text-[12.5px] text-text-3">
          Show
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value as KindFilter)}
            className={selectCls}
          >
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex items-center gap-2 text-[12.5px] text-text-3">
          Style
          <Select
            value={style}
            onChange={(e) => setStyle(e.target.value as StyleTag | '')}
            className={selectCls}
          >
            <option value="">All styles</option>
            {STYLE_TAGS.map((t) => (
              <option key={t} value={t}>
                {STYLE_LABEL[t]}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex items-center gap-2 text-[12.5px] text-text-3">
          Motion
          <Select
            value={motion}
            onChange={(e) => setMotion(e.target.value as MotionTag | '')}
            className={selectCls}
          >
            <option value="">Any motion</option>
            {MOTION_TAGS.map((t) => (
              <option key={t} value={t}>
                {MOTION_LABEL[t]}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex items-center gap-2 text-[12.5px] text-text-3">
          Price
          <Select
            value={price}
            onChange={(e) => setPrice(e.target.value as '' | 'free' | 'pro')}
            className={selectCls}
          >
            <option value="">Free and Pro</option>
            <option value="free">Free</option>
            <option value="pro">Pro</option>
          </Select>
        </label>
      </div>
      {kind !== 'theme' && kind !== 'widget' && (
        <div className="mb-5 flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-[12.5px] text-text-3">Preview as</span>
          <div
            role="group"
            aria-label="Preview as"
            className="flex min-w-0 gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]"
          >
            {EVENT_KEYS.filter((k) => !['resub', 'member', 'kicks', 'redeem'].includes(k)).map(
              (k) => {
                const I = EVENT_ICON[k]
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={ev === k}
                    onClick={() => setEv(k)}
                    className={cx(
                      'fc-press inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium',
                      ev === k
                        ? 'border-accent-line bg-accent-soft text-text'
                        : 'border-line text-text-2 hover:border-line-strong',
                    )}
                  >
                    <I size={14} />
                    {EVENT_LABEL[k]}
                  </button>
                )
              },
            )}
          </div>
        </div>
      )}
      {list.error ? (
        <LoadError error={list.error} onRetry={list.reload} />
      ) : list.loading && !list.data ? (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="aspect-[4/3]" />
          ))}
        </div>
      ) : items.length === 0 ? (
        tab === 'mine' && mine.length === 0 ? (
          <EmptyState title="No designs of your own yet">
            Duplicate a built-in, start from scratch, or import a design file or an asset pack.
          </EmptyState>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-panel border border-dashed border-line-strong px-4 py-10 text-center">
            <b className="text-base text-text">Nothing matches these filters</b>
            {filtered && (
              <Button size="sm" variant="secondary" onClick={clear}>
                Clear filters
              </Button>
            )}
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3" aria-live="polite">
          {items.map((d) => (
            <Tile
              key={d.id}
              design={d}
              ev={ev}
              active={active.data?.design_id === d.id}
              onUse={() => use(d)}
              onDuplicate={() => duplicate(d)}
              onDelete={() => setDeleting(d)}
            />
          ))}
        </div>
      )}
      <UseDialog key={using?.id ?? 'none'} design={using} onClose={() => setUsing(null)} />
      <ImportDesignDialog
        open={dialog === 'file'}
        onClose={() => setDialog(null)}
        onImported={(r) => {
          setDialog(null)
          list.set((prev) => [...(prev ?? []), ...r.designs])
          go({ name: 'designs', tab: 'mine' })
        }}
      />
      <AssetPackDialog
        open={dialog === 'pack'}
        onClose={() => setDialog(null)}
        onBuilt={(d) => {
          setDialog(null)
          go({ name: 'designer', id: d.id })
        }}
      />
      <FindInObsDialog open={dialog === 'obs'} onClose={() => setDialog(null)} />
      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        size="sm"
        title="Delete design?"
        description={
          deleting
            ? `${deleting.name} will be removed from My designs. Overlays made from it keep their layout.`
            : ''
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              icon={<Trash size={15} />}
              onClick={() => {
                const d = deleting
                setDeleting(null)
                if (d)
                  void run('del', () => client.deleteDesign(d.id).then(() => true), {
                    success: `Deleted ${d.name}.`,
                  }).then((ok) => {
                    if (ok) list.set((prev) => (prev ?? []).filter((x) => x.id !== d.id))
                  })
              }}
            >
              Delete
            </Button>
          </>
        }
      />
    </div>
  )
}
