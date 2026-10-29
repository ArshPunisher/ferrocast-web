// The design gallery, in tabs like a store: Themes (a featured row of full theme bundles,
// then every theme), Alerts, Widgets, and My designs. Previews play the real thing on hover
// or tap; style chips, a motion menu and search narrow each tab. The Import menu brings
// designs in (a .ferrodesign, StreamElements, an asset pack, OBS).

import { useMemo, useRef, useState } from 'react'
import {
  CaretDown,
  Check,
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
  Waveform,
} from '@phosphor-icons/react'
import {
  EVENT_KEYS,
  EVENT_LABEL,
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
import { Badge, Button, Dialog, EmptyState, IconButton, Input, Skeleton, cx } from '@ferrocast/ui'
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
import {
  FeaturedThemes,
  ThemeCard,
  ThemeSheet,
  galleryTab,
  isTheme,
} from '../components/design/gallery'
import { useAction, useClient, useResource } from '../lib/hooks'
import { go, href, type GalleryTab } from '../lib/router'
import { isCloud } from '../lib/boot'
import { useLive } from '../lib/store'

const inTab = (t: GalleryTab, d: Design) => t === 'mine' || galleryTab(d) === t
const KIND_NAME: Record<DesignKind, string> = {
  alert: 'Alerts',
  theme: 'Theme',
  scene: 'Scene',
  widget: 'Widget',
}
const TABS: { id: GalleryTab; label: string }[] = [
  { id: 'themes', label: 'Themes' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'widgets', label: 'Widgets' },
  { id: 'mine', label: 'My designs' },
]
/** Featured first, in this order, when they ship; the rest of the themes follow. */
const FEATURED = [
  'builtin.lofi-loft',
  'builtin.floodlight',
  'builtin.sakura-bloom',
  'builtin.forge',
  'builtin.glitch-district',
  'builtin.synthwave-drive',
  'builtin.pixel-quest',
  'builtin.diwali-lights',
]
/** The last built-ins added (registry order) are "New". */
const NEW_COUNT = 8
const MOTION_GROUPS: { value: '' | 'calm' | 'lively'; label: string; tags: MotionTag[] }[] = [
  { value: '', label: 'Any motion', tags: [] },
  { value: 'calm', label: 'Calm', tags: ['still', 'smooth'] },
  { value: 'lively', label: 'Lively', tags: ['lively', 'bouncy'] },
]

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
  const cloud = isCloud(useLive((s) => s.conn))
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
          <WidgetPreview design={design} lazy />
        ) : (
          <ScenePreview design={design} live={hover} lazy />
        )}
      </div>
      <div className="flex flex-col gap-1 px-3.5 pt-3">
        <div className="flex items-center gap-2">
          <h3
            id={titleId}
            className="min-w-0 flex-1 truncate font-display text-[18px] font-extrabold tracking-tight"
          >
            {design.name}
          </h3>
          {design.built_in ? <BrandChip /> : <Badge tone="accent">Mine</Badge>}
        </div>
        <p className="line-clamp-2 text-[14.5px] leading-snug text-text-3">
          {design.kind !== 'alert' && (
            <span className="font-medium text-text-2">{KIND_NAME[design.kind]}. </span>
          )}
          {design.description ||
            (design.origin.from ? `From ${design.origin.from}.` : 'Your own design.')}
        </p>
        {active && (
          <p className="text-[14px] font-medium text-accent-text">Plays your alerts now</p>
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
              className="fc-press inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-control border border-line-strong bg-surface-3 px-3 text-[14.5px] font-semibold text-text hover:border-text-3"
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
                // Design files are made by the app on a PC (cloud mode has no export).
                ...(cloud
                  ? []
                  : [
                      {
                        key: 'export',
                        label: 'Export or share',
                        icon: <DownloadSimple size={15} />,
                        onSelect: () => exportDesign(design),
                      },
                    ]),
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

export function Designs({ tab }: { tab: GalleryTab }) {
  const cloud = isCloud(useLive((s) => s.conn))
  const client = useClient()
  const { run } = useAction()
  const list = useResource((c) => c.designs())
  const active = useResource((c) => c.activeAlertDesign())
  const [ev, setEv] = useState<EventKey>('tip')
  const [style, setStyle] = useState<StyleTag | ''>('')
  const [motion, setMotion] = useState<'' | 'calm' | 'lively'>('')
  const [q, setQ] = useState('')
  const [using, setUsing] = useState<Design | null>(null)
  const [sheet, setSheet] = useState<Design | null>(null)
  const [deleting, setDeleting] = useState<Design | null>(null)
  const [dialog, setDialog] = useState<'file' | 'pack' | 'obs' | null>(null)

  const all = list.data ?? []
  const built = all.filter((d) => d.built_in)
  const mine = all.filter((d) => !d.built_in)
  const source = (tab === 'mine' ? mine : built).filter((d) => inTab(tab, d))
  const count = (t: GalleryTab) => (t === 'mine' ? mine : built).filter((d) => inTab(t, d)).length
  const motionTags = MOTION_GROUPS.find((m) => m.value === motion)?.tags ?? []
  const query = q.trim().toLowerCase()
  const items = source.filter(
    (d) =>
      (!style || d.tags.style === style) &&
      (motionTags.length === 0 || motionTags.includes(d.tags.motion)) &&
      (!query ||
        `${d.name} ${d.description} ${STYLE_LABEL[d.tags.style]} ${KIND_NAME[d.kind]}`
          .toLowerCase()
          .includes(query)),
  )
  const filtered = !!(style || motion || query)
  const stylesHere = STYLE_TAGS.filter((t) => source.some((d) => d.tags.style === t))
  const clear = () => {
    setStyle('')
    setMotion('')
    setQ('')
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

  const themes = items.filter(isTheme)
  const showShelves = tab === 'themes' && !filtered
  const featured = showShelves ? FEATURED.flatMap((id) => themes.filter((t) => t.id === id)) : []
  const builtThemeIds = built.filter(isTheme).map((t) => t.id)
  const newIds = new Set(builtThemeIds.slice(-NEW_COUNT))
  const sheetTheme = sheet && isTheme(sheet) ? sheet : null
  const sheetAlert = sheetTheme?.content.alert_design
    ? (all.find((d) => d.id === sheetTheme.content.alert_design) ?? null)
    : null
  const searchLabel =
    tab === 'themes'
      ? 'Search themes'
      : tab === 'alerts'
        ? 'Search alerts'
        : tab === 'widgets'
          ? 'Search widgets'
          : 'Search my designs'
  const chip = (on: boolean) =>
    cx(
      'fc-press inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[14px] font-medium',
      on
        ? 'fc-picked border-transparent'
        : 'border-line text-text-2 hover:border-line-strong hover:text-text',
    )

  return (
    <div>
      <PageHeader
        title="Designs"
        description="Themes, alerts and widgets that play the real thing. Use one as it is, or duplicate it to make it yours without Ferrocast branding."
        actions={
          <>
            {!cloud && (
              <Menu
                label="Import"
                align="end"
                trigger={(p) => (
                  <Button {...p} variant="secondary" icon={<DownloadSimple size={15} />}>
                    Import
                  </Button>
                )}
                items={IMPORTS.map((x) => ({
                  key: x.key,
                  label: x.title,
                  description: x.text,
                  icon: <x.icon size={16} />,
                  onSelect: () =>
                    x.key === 'se'
                      ? go({ name: 'import', source: 'streamelements' })
                      : setDialog(x.key),
                }))}
              />
            )}
            <Button variant="secondary" icon={<Plus size={15} />} onClick={startScratch}>
              Start from scratch
            </Button>
          </>
        }
      />
      <div className="mb-5 flex flex-wrap items-end gap-3 border-b border-line">
        <nav
          aria-label="Gallery"
          className="-mb-px flex min-w-0 gap-1 overflow-x-auto [scrollbar-width:none]"
        >
          {TABS.map((t) => (
            <a
              key={t.id}
              href={href({ name: 'designs', ...(t.id === 'themes' ? {} : { tab: t.id }) })}
              aria-current={tab === t.id ? 'page' : undefined}
              className={cx(
                'inline-flex h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-[15px] font-semibold transition-colors',
                tab === t.id
                  ? 'border-accent text-text'
                  : 'border-transparent text-text-3 hover:text-text',
              )}
            >
              {t.label}
              <span className="font-mono text-[13.5px] font-medium text-text-3">{count(t.id)}</span>
            </a>
          ))}
        </nav>
        <span className="flex-1" />
        <label className="relative mb-2 w-full sm:w-64">
          <span className="sr-only">{searchLabel}</span>
          <MagnifyingGlass
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-3"
            aria-hidden="true"
          />
          <Input
            type="search"
            data-keep-placeholder
            placeholder={searchLabel}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-9 pl-9"
          />
        </label>
      </div>
      <div className="mb-5 flex min-w-0 flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label="Style"
          className="-mx-4 flex min-w-0 basis-full gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:basis-0 sm:flex-1 sm:px-0"
        >
          <button
            type="button"
            aria-pressed={style === ''}
            onClick={() => setStyle('')}
            className={chip(style === '')}
          >
            All styles
          </button>
          {stylesHere.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={style === t}
              onClick={() => setStyle(style === t ? '' : t)}
              className={chip(style === t)}
            >
              {STYLE_LABEL[t]}
            </button>
          ))}
        </div>
        <Menu
          label="Motion"
          align="end"
          trigger={(p) => (
            <button {...p} type="button" className={chip(motion !== '')}>
              <Waveform size={14} />
              {MOTION_GROUPS.find((m) => m.value === motion)?.label}
              <CaretDown size={12} />
            </button>
          )}
          items={MOTION_GROUPS.map((m) => ({
            key: m.value || 'any',
            label: m.label,
            icon:
              motion === m.value ? <Check size={15} /> : <span className="inline-block w-[15px]" />,
            onSelect: () => setMotion(m.value),
          }))}
        />
      </div>
      {(tab === 'alerts' || (tab === 'mine' && items.some((d) => d.kind === 'alert'))) && (
        <div className="mb-5 flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-[14px] text-text-3">Preview as</span>
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
                    className={chip(ev === k)}
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
        <>
          {showShelves && (
            <FeaturedThemes
              themes={featured}
              paused={!!sheet || !!using}
              onOpen={setSheet}
              onUse={setUsing}
            />
          )}
          {tab === 'themes' && (
            <h2 className="mb-3 font-display text-lg font-extrabold tracking-tight">
              {filtered ? 'Matching themes' : 'All themes'}
            </h2>
          )}
          <div
            className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3"
            aria-live="polite"
          >
            {items.map((d) =>
              isTheme(d) ? (
                <ThemeCard
                  key={d.id}
                  theme={d}
                  isNew={d.built_in && newIds.has(d.id)}
                  onOpen={() => setSheet(d)}
                  onUse={() => setUsing(d)}
                />
              ) : (
                <Tile
                  key={d.id}
                  design={d}
                  ev={ev}
                  active={active.data?.design_id === d.id}
                  onUse={() => use(d)}
                  onDuplicate={() => duplicate(d)}
                  onDelete={() => setDeleting(d)}
                />
              ),
            )}
          </div>
        </>
      )}
      <ThemeSheet
        key={`sheet-${sheetTheme?.id ?? 'none'}`}
        theme={sheetTheme}
        alertDesign={sheetAlert}
        onClose={() => setSheet(null)}
        onUse={(t) => {
          setSheet(null)
          setUsing(t)
        }}
        onDuplicate={(t) => {
          setSheet(null)
          duplicate(t)
        }}
      />
      <UseDialog key={`use-${using?.id ?? 'none'}`} design={using} onClose={() => setUsing(null)} />
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
