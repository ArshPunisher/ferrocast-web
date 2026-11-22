// Community Theme Store (Phase 3 #18, R37): browse & search themes, alerts, widgets,
// overlays, and safe sandboxed plugins, inspect creator pages, measure render performance
// locally on this PC, install/update/uninstall with one-click undo, and confirm ferrocast:// links.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowLeft,
  ArrowSquareOut,
  Check,
  Cpu,
  DownloadSimple,
  Gauge,
  LinkSimple,
  LockKey,
  MagnifyingGlass,
  Package,
  ShieldCheck,
  Star,
  Storefront,
  Trash,
  Warning,
} from '@phosphor-icons/react'
import {
  describeError,
  parseFerrocastStoreLink,
  safeCreatorLinkUrl,
  storeApi,
  type StoreCatalogResponse,
  type StoreCategory,
  type StoreCreator,
  type StoreInstalledItem,
  type StoreItem,
  type StoreLinkPreview,
  type StoreUndoSummary,
} from '@ferrocast/api'
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  IconButton,
  Input,
  Skeleton,
  cx,
  toast,
} from '@ferrocast/ui'
import { LoadError, PageHeader, Panel } from '../components/Panel'
import { StoreCardPreview, StoreDetailPreview } from '../components/store/StorePreviews'
import { canWords } from '../components/plugins-settings'
import { externalLink } from '../lib/external'
import { useClient } from '../lib/hooks'
import { go, type Route } from '../lib/router'
import { measureItemLocally, type LocalPerfReport } from '../lib/store-perf'

type FilterKind = 'all' | StoreCategory | 'installed'

const CATEGORY_TABS: { id: FilterKind; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'theme', label: 'Themes' },
  { id: 'alert', label: 'Alerts' },
  { id: 'widget', label: 'Widgets' },
  { id: 'overlay', label: 'Overlays' },
  { id: 'plugin', label: 'Plugins & Shaders' },
  { id: 'installed', label: 'Installed' },
]

const KIND_LABEL: Record<StoreCategory, string> = {
  theme: 'Theme bundle',
  alert: 'Alert',
  widget: 'Widget',
  overlay: 'Overlay scene',
  plugin: 'Plugin / Shader',
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function PerfPill({ perf }: { perf: LocalPerfReport }) {
  const tone =
    perf.tier === 'light'
      ? 'bg-ok-soft text-ok border-transparent'
      : perf.tier === 'balanced'
        ? 'bg-accent-soft text-accent-text border-accent-line'
        : 'bg-warn-soft text-warn border-transparent'
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11.5px] font-semibold tabular-nums',
        tone,
      )}
      title={`Local benchmark on this PC: ${perf.summary}`}
    >
      <Gauge size={12} aria-hidden="true" />
      <span>
        {perf.score}/100 · {perf.label}
      </span>
    </span>
  )
}

function SafetyBadge({ item }: { item: StoreItem }) {
  if (item.package.format === 'ferrodesign') {
    return (
      <Badge tone="neutral">
        <ShieldCheck size={12} aria-hidden="true" />
        <span>Pure data</span>
      </Badge>
    )
  }
  if (item.package.format === 'ferroalert') {
    return (
      <Badge tone="accent">
        <LockKey size={12} aria-hidden="true" />
        <span>p2e Sandbox</span>
      </Badge>
    )
  }
  return (
    <Badge tone="accent">
      <Cpu size={12} aria-hidden="true" />
      <span>
        {item.plugin_kind === 'effect' ? 'WGSL Sandbox' : `${item.plugin_kind ?? 'Plugin'} Sandbox`}
      </span>
    </Badge>
  )
}

/** Creator profile view (`#/store/creator/<id>`): safe external links, stats, and all items. */
function CreatorPage({
  creator,
  items,
  perfMap,
  busyId,
  onSelectItem,
  onInstall,
  onUpdate,
  onUninstall,
}: {
  creator: StoreCreator
  items: StoreItem[]
  perfMap: Map<string, LocalPerfReport>
  busyId: string | null
  onSelectItem: (id: string) => void
  onInstall: (id: string) => void
  onUpdate: (id: string) => void
  onUninstall: (id: string) => void
}) {
  const creatorItems = items.filter((i) => i.creator_id === creator.id)
  const totalInstalls = creatorItems.reduce((acc, i) => acc + i.stats.installs, 0)
  const avgRating =
    creatorItems.length > 0
      ? (
          creatorItems.reduce((acc, i) => acc + i.stats.rating_avg, 0) / creatorItems.length
        ).toFixed(1)
      : '—'
  const rawLinks: [string, string | null][] = [
    ['Website', safeCreatorLinkUrl(creator.links.website)],
    ['GitHub', safeCreatorLinkUrl(creator.links.github)],
    ['Twitch', safeCreatorLinkUrl(creator.links.twitch)],
    ['YouTube', safeCreatorLinkUrl(creator.links.youtube)],
  ]
  const linkList = rawLinks.filter((pair): pair is [string, string] => pair[1] !== null)

  return (
    <div className="space-y-6" data-testid="store-creator-page">
      <div>
        <Button size="sm" variant="ghost" onClick={() => go({ name: 'store' })}>
          <ArrowLeft size={15} aria-hidden="true" />
          Back to Community Store
        </Button>
      </div>
      <Panel
        title={
          <span className="flex items-center gap-2">
            <span>{creator.name}</span>
            {creator.verified && (
              <Badge tone="accent">
                <ShieldCheck size={12} aria-hidden="true" />
                <span>Verified creator</span>
              </Badge>
            )}
          </span>
        }
        icon={<Storefront weight="fill" />}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-[13.5px] text-text-3">
            <span className="font-mono">{creator.handle}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{creatorItems.length} packages</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              {totalInstalls.toLocaleString('en-US')} catalog installs
            </span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Star size={14} weight="fill" className="text-molten" aria-hidden="true" />
              {avgRating}
            </span>
          </div>
          {creator.bio && (
            <p className="max-w-2xl text-[15px] leading-relaxed text-text-2">{creator.bio}</p>
          )}
          {linkList.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {linkList.map(([label, url]) => (
                <a
                  key={label}
                  {...externalLink(url)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 py-1 text-[13px] font-semibold text-text-2 hover:border-arc hover:text-text focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
                >
                  <span>{label}</span>
                  <ArrowSquareOut size={13} aria-hidden="true" />
                </a>
              ))}
            </div>
          )}
        </div>
      </Panel>

      <section
        aria-label={`Packages by ${creator.name}`}
        className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
      >
        {creatorItems.map((item) => (
          <StoreItemCard
            key={item.id}
            item={item}
            creator={creator}
            perf={perfMap.get(item.id) ?? measureItemLocally(item)}
            busy={busyId === item.id}
            onOpen={() => onSelectItem(item.id)}
            onCreator={() => {}}
            onInstall={() => onInstall(item.id)}
            onUpdate={() => onUpdate(item.id)}
            onUninstall={() => onUninstall(item.id)}
          />
        ))}
      </section>
    </div>
  )
}

function StoreItemCard({
  item,
  creator,
  perf,
  busy,
  onOpen,
  onCreator,
  onInstall,
  onUpdate,
  onUninstall,
}: {
  item: StoreItem
  creator: StoreCreator | undefined
  perf: LocalPerfReport
  busy: boolean
  onOpen: () => void
  onCreator: (id: string) => void
  onInstall: () => void
  onUpdate: () => void
  onUninstall: () => void
}) {
  const isInstalled = item.installed_version !== null
  return (
    <article
      aria-label={item.title}
      data-testid={`store-card-${item.id}`}
      className="flex flex-col justify-between gap-3 rounded-panel border border-line bg-surface-1 p-3.5 shadow-1 transition-colors hover:border-line-strong"
    >
      <div className="space-y-3">
        <div
          onClick={onOpen}
          aria-hidden="true"
          className="cursor-pointer rounded-[12px] overflow-hidden"
        >
          <StoreCardPreview item={item} />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="neutral">{KIND_LABEL[item.kind]}</Badge>
          <SafetyBadge item={item} />
          <PerfPill perf={perf} />
        </div>

        <div>
          <div className="flex items-start justify-between gap-2">
            <button
              type="button"
              onClick={onOpen}
              className="text-left font-display text-[17px] font-extrabold tracking-tight text-text hover:text-arc focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
            >
              {item.title}
            </button>
            <span className="shrink-0 font-mono text-[12px] text-text-3">v{item.version}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-[13.5px] leading-snug text-text-2">{item.summary}</p>
        </div>
      </div>

      <div className="space-y-2.5 border-t border-line pt-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-text-3">
          {creator ? (
            <button
              type="button"
              onClick={() => onCreator(creator.id)}
              className="inline-flex items-center gap-1 font-semibold text-accent-text hover:underline focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
            >
              <span>{creator.name}</span>
              {creator.verified && <ShieldCheck size={13} aria-hidden="true" />}
            </button>
          ) : (
            <span>{item.creator_id}</span>
          )}
          <span className="inline-flex items-center gap-2 tabular-nums">
            <span className="inline-flex items-center gap-0.5">
              <Star size={13} weight="fill" className="text-molten" aria-hidden="true" />
              {item.stats.rating_avg.toFixed(1)} ({item.stats.rating_count})
            </span>
            <span aria-hidden="true">·</span>
            <span>{item.stats.installs.toLocaleString('en-US')} installs</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={onOpen} className="flex-1">
            Preview
          </Button>
          {item.update_available ? (
            <Button
              size="sm"
              variant="primary"
              disabled={busy}
              onClick={onUpdate}
              className="flex-1"
            >
              <DownloadSimple size={14} aria-hidden="true" />
              {busy ? 'Updating…' : `Update to ${item.version}`}
            </Button>
          ) : isInstalled ? (
            <Button size="sm" variant="ghost" disabled={busy} onClick={onUninstall}>
              <Trash size={14} aria-hidden="true" />
              {busy ? 'Removing…' : 'Uninstall'}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="primary"
              disabled={busy}
              onClick={onInstall}
              className="flex-1"
            >
              <DownloadSimple size={14} aria-hidden="true" />
              {busy ? 'Installing…' : 'Install'}
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}

export function Store({ route }: { route: Extract<Route, { name: 'store' }> }) {
  const client = useClient()
  const api = useMemo(() => storeApi(client), [client])

  const [catalog, setCatalog] = useState<StoreCatalogResponse | null>(null)
  const [catalogError, setCatalogError] = useState<unknown>(null)
  const [installedFallback, setInstalledFallback] = useState<StoreInstalledItem[]>([])
  const [lastUndo, setLastUndo] = useState<StoreUndoSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [filter, setFilter] = useState<FilterKind>('all')
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [undoBusy, setUndoBusy] = useState(false)

  const [perfCache, setPerfCache] = useState<Map<string, LocalPerfReport>>(() => new Map())

  // Deep link dialog state (`ferrocast://...` always asks before installing).
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [linkInput, setLinkInput] = useState('ferrocast://store/install/aurora-pulse')
  const [linkPreview, setLinkPreview] = useState<StoreLinkPreview | null>(null)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [linkBusy, setLinkBusy] = useState(false)

  const loadAll = useCallback(
    async (fresh = false) => {
      if (fresh) setRefreshing(true)
      else setLoading(true)
      const [catRes, instRes] = await Promise.allSettled([api.catalog(fresh), api.installed()])
      if (instRes.status === 'fulfilled') {
        setInstalledFallback(instRes.value.installed)
        setLastUndo(instRes.value.last_undo)
      }
      if (catRes.status === 'fulfilled') {
        setCatalog(catRes.value)
        setCatalogError(null)
        setInstalledFallback(catRes.value.installed)
        setLastUndo(catRes.value.last_undo)
      } else {
        setCatalogError(catRes.reason)
      }
      setLoading(false)
      setRefreshing(false)
    },
    [api],
  )

  useEffect(() => {
    void loadAll(false)
  }, [loadAll])

  // Compute local performance measurements per catalog item on this machine.
  useEffect(() => {
    if (!catalog) return
    const next = new Map<string, LocalPerfReport>()
    for (const item of catalog.items) {
      next.set(item.id, measureItemLocally(item))
    }
    setPerfCache(next)
  }, [catalog])

  const resolveAndAsk = useCallback(
    async (uri: string) => {
      setLinkInput(uri)
      setLinkDialogOpen(true)
      setLinkError(null)
      setLinkPreview(null)
      if (!parseFerrocastStoreLink(uri)) {
        setLinkError(
          'That link does not match ferrocast://store/install/<id> or ferrocast://store/item/<id>.',
        )
        return
      }
      setLinkBusy(true)
      try {
        const preview = await api.resolveLink(uri)
        setLinkPreview(preview)
      } catch (e) {
        setLinkError(describeError(e).message)
      } finally {
        setLinkBusy(false)
      }
    },
    [api],
  )

  // Handle `#/store?link=ferrocast://...` automatically by opening the confirmation dialog ONLY.
  useEffect(() => {
    if (route.install) {
      void resolveAndAsk(route.install)
    }
  }, [route.install, resolveAndAsk])

  const remeasureItem = (item: StoreItem) => {
    const report = measureItemLocally(item, true)
    setPerfCache((prev) => {
      const next = new Map(prev)
      next.set(item.id, report)
      return next
    })
    toast({ tone: 'info', message: `Measured locally: ${report.score}/100 (${report.mountMs} ms)` })
  }

  const doInstall = async (id: string) => {
    setBusyId(id)
    try {
      const res = await api.install(id)
      toast({
        tone: 'ok',
        message: `${res.installed?.title ?? 'Item'} installed.`,
        hint: res.designs.length
          ? `${res.designs.length} design${res.designs.length === 1 ? '' : 's'} added to Designs. One-click Undo is ready.`
          : 'One-click Undo is ready.',
      })
      setLinkDialogOpen(false)
      setLinkPreview(null)
      await loadAll(false)
    } catch (e) {
      const d = describeError(e)
      toast({ tone: 'error', message: d.message, hint: d.hint })
    } finally {
      setBusyId(null)
    }
  }

  const doUpdate = async (id: string) => {
    setBusyId(id)
    try {
      const res = await api.update(id)
      toast({
        tone: 'ok',
        message: `Updated ${res.installed?.title ?? id} to v${res.installed?.version ?? ''}.`,
      })
      await loadAll(false)
    } catch (e) {
      const d = describeError(e)
      toast({ tone: 'error', message: d.message, hint: d.hint })
    } finally {
      setBusyId(null)
    }
  }

  const doUninstall = async (id: string) => {
    setBusyId(id)
    try {
      await api.uninstall(id)
      toast({ tone: 'info', message: 'Removed from Store installs. Click Undo to restore.' })
      await loadAll(false)
    } catch (e) {
      const d = describeError(e)
      toast({ tone: 'error', message: d.message, hint: d.hint })
    } finally {
      setBusyId(null)
    }
  }

  const doUndo = async () => {
    if (!lastUndo) return
    setUndoBusy(true)
    try {
      const res = await api.undo(lastUndo.token)
      toast({
        tone: 'ok',
        message: `Undid ${res.reverted_action} for ${res.item_title}.`,
      })
      await loadAll(false)
    } catch (e) {
      const d = describeError(e)
      toast({ tone: 'error', message: d.message, hint: d.hint })
    } finally {
      setUndoBusy(false)
    }
  }

  const creatorsById = useMemo(() => {
    const map = new Map<string, StoreCreator>()
    for (const c of catalog?.creators ?? []) map.set(c.id, c)
    return map
  }, [catalog])

  const selectedCreator = route.creator ? (creatorsById.get(route.creator) ?? null) : null
  const selectedItem = route.item ? (catalog?.items.find((i) => i.id === route.item) ?? null) : null

  const filteredItems = useMemo(() => {
    const list = catalog?.items ?? []
    const q = search.trim().toLowerCase()
    return list.filter((item) => {
      if (filter === 'installed' && !item.installed_version) return false
      if (filter !== 'all' && filter !== 'installed' && item.kind !== filter) return false
      if (!q) return true
      const creatorName = creatorsById.get(item.creator_id)?.name.toLowerCase() ?? ''
      return (
        item.title.toLowerCase().includes(q) ||
        item.summary.toLowerCase().includes(q) ||
        creatorName.includes(q) ||
        item.tags.some((t) => t.toLowerCase().includes(q))
      )
    })
  }, [catalog, filter, search, creatorsById])

  const selectedItemPerf = selectedItem
    ? (perfCache.get(selectedItem.id) ?? measureItemLocally(selectedItem))
    : null

  return (
    <div className="space-y-6" data-testid="store-screen">
      <PageHeader
        title="Community Store"
        description="Signed themes, alerts, widgets, overlays, and sandboxed plugins. Zero telemetry sent."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setLinkError(null)
                setLinkPreview(null)
                setLinkDialogOpen(true)
              }}
            >
              <LinkSimple size={15} aria-hidden="true" />
              Open ferrocast:// link
            </Button>
            <IconButton
              size="sm"
              variant="ghost"
              label="Refresh catalog"
              disabled={refreshing}
              onClick={() => void loadAll(true)}
            >
              <ArrowClockwise size={16} className={refreshing ? 'animate-spin' : undefined} />
            </IconButton>
          </div>
        }
      />

      {lastUndo && (
        <div
          role="status"
          data-testid="store-undo-bar"
          className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-accent-line bg-accent-soft px-4 py-3"
        >
          <p className="text-[14px] text-text">
            Last action: <strong className="font-semibold capitalize">{lastUndo.action}</strong>{' '}
            <span className="font-semibold">{lastUndo.item_title}</span>
          </p>
          <Button size="sm" variant="primary" disabled={undoBusy} onClick={() => void doUndo()}>
            <ArrowCounterClockwise size={15} aria-hidden="true" />
            {undoBusy ? 'Undoing…' : 'Undo'}
          </Button>
        </div>
      )}

      {catalog?.stale && (
        <div
          role="status"
          data-testid="store-stale-banner"
          className="flex items-start gap-2.5 rounded-panel border border-molten/40 bg-molten/10 px-4 py-3 text-[13.5px] text-text"
        >
          <Warning size={18} className="mt-0.5 shrink-0 text-molten" aria-hidden="true" />
          <div>
            <p className="font-semibold">This catalog snapshot is older than 7 days.</p>
            <p className="text-text-2">
              Installed themes, alerts, and plugins continue working normally.
            </p>
          </div>
        </div>
      )}

      {selectedCreator && catalog ? (
        <CreatorPage
          creator={selectedCreator}
          items={catalog.items}
          perfMap={perfCache}
          busyId={busyId}
          onSelectItem={(id) => go({ name: 'store', item: id })}
          onInstall={(id) => void doInstall(id)}
          onUpdate={(id) => void doUpdate(id)}
          onUninstall={(id) => void doUninstall(id)}
        />
      ) : (
        <>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div role="tablist" aria-label="Store categories" className="flex flex-wrap gap-1.5">
              {CATEGORY_TABS.map((t) => {
                const count = t.id === 'installed' ? installedFallback.length : undefined
                const active = filter === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setFilter(t.id)}
                    className={cx(
                      'rounded-full border px-3 py-1 text-[13.5px] font-semibold transition-colors focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none',
                      active
                        ? 'border-arc bg-accent-soft text-text'
                        : 'border-line bg-surface-1 text-text-2 hover:border-line-strong hover:text-text',
                    )}
                  >
                    {t.label}
                    {count !== undefined ? ` (${count})` : ''}
                  </button>
                )
              })}
            </div>
            <div className="relative w-full lg:w-72">
              <MagnifyingGlass
                size={15}
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-3"
                aria-hidden="true"
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search themes, creators, tags…"
                aria-label="Search Community Store"
                className="pl-9"
              />
            </div>
          </div>

          {catalogError ? (
            <LoadError error={catalogError} onRetry={() => void loadAll(true)} />
          ) : null}

          {loading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((k) => (
                <div
                  key={k}
                  className="rounded-panel border border-line bg-surface-1 p-4 space-y-3"
                >
                  <Skeleton className="aspect-video w-full" />
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ))}
            </div>
          ) : (
            catalog &&
            filter !== 'installed' && (
              <>
                {filteredItems.length === 0 ? (
                  <EmptyState
                    title="No store items match that search"
                    action={
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setFilter('all')
                          setSearch('')
                        }}
                      >
                        Reset filters
                      </Button>
                    }
                  >
                    Try clearing the category filter or search box.
                  </EmptyState>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {filteredItems.map((item) => (
                      <StoreItemCard
                        key={item.id}
                        item={item}
                        creator={creatorsById.get(item.creator_id)}
                        perf={perfCache.get(item.id) ?? measureItemLocally(item)}
                        busy={busyId === item.id}
                        onOpen={() => go({ name: 'store', item: item.id })}
                        onCreator={(cid) => go({ name: 'store', creator: cid })}
                        onInstall={() => void doInstall(item.id)}
                        onUpdate={() => void doUpdate(item.id)}
                        onUninstall={() => void doUninstall(item.id)}
                      />
                    ))}
                  </div>
                )}
              </>
            )
          )}

          {/* Always shown when Installed tab active OR when catalog fails so installed packages keep working */}
          {(filter === 'installed' || !!catalogError || installedFallback.length > 0) && (
            <Panel
              id="store-installed-panel"
              title={`Installed from Store (${installedFallback.length})`}
              description="Stored locally with SHA-256 verification. Keeps working even when the remote catalog is unavailable."
              icon={<Package weight="fill" />}
            >
              {installedFallback.length === 0 ? (
                <p className="text-[14px] text-text-3">No Community Store items installed yet.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {installedFallback.map((rec) => (
                    <li
                      key={rec.item_id}
                      data-testid={`installed-row-${rec.item_id}`}
                      className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-text">{rec.title}</span>
                          <Badge tone="neutral">v{rec.version}</Badge>
                          <Badge tone="neutral">{rec.format}</Badge>
                          {rec.update_available && rec.latest_version && (
                            <Badge tone="accent">v{rec.latest_version} available</Badge>
                          )}
                        </div>
                        <p className="text-[13px] text-text-3">
                          By {rec.creator_name} · SHA-256 {rec.package_sha256.slice(0, 12)}…
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {rec.update_available && !catalogError && (
                          <Button
                            size="sm"
                            variant="primary"
                            disabled={busyId === rec.item_id}
                            onClick={() => void doUpdate(rec.item_id)}
                          >
                            Update
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busyId === rec.item_id}
                          onClick={() => void doUninstall(rec.item_id)}
                        >
                          <Trash size={14} aria-hidden="true" />
                          Uninstall
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}
        </>
      )}

      {/* Item Detail Modal */}
      {selectedItem && (
        <Dialog open onClose={() => go({ name: 'store' })} title={selectedItem.title} size="lg">
          <div className="space-y-4" data-testid="store-item-detail">
            <StoreDetailPreview item={selectedItem} />

            <div className="flex flex-wrap items-center justify-between gap-2 text-[13.5px]">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="neutral">{KIND_LABEL[selectedItem.kind]}</Badge>
                <Badge tone="neutral">v{selectedItem.version}</Badge>
                <Badge tone="neutral">{selectedItem.license}</Badge>
                <SafetyBadge item={selectedItem} />
              </div>
              {creatorsById.get(selectedItem.creator_id) && (
                <button
                  type="button"
                  onClick={() => go({ name: 'store', creator: selectedItem.creator_id })}
                  className="font-semibold text-accent-text hover:underline focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
                >
                  By {creatorsById.get(selectedItem.creator_id)?.name} →
                </button>
              )}
            </div>

            <p className="text-[14.5px] leading-relaxed text-text-2">{selectedItem.summary}</p>

            {/* Local Performance Score Panel */}
            {selectedItemPerf && (
              <div className="rounded-ctrl border border-line bg-surface-2 p-3.5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[13.5px] font-bold text-text">
                      Local performance on this PC
                    </span>
                    <PerfPill perf={selectedItemPerf} />
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => remeasureItem(selectedItem)}>
                    Re-measure locally
                  </Button>
                </div>
                <p className="font-mono text-[12.5px] text-text-3">{selectedItemPerf.summary}</p>
              </div>
            )}

            {/* Security & Verification Breakdown */}
            <div className="rounded-ctrl border border-line bg-surface-2 p-3.5 space-y-1.5 text-[13px] text-text-2">
              <p className="font-semibold text-text">Verification & sandbox</p>
              <p className="font-mono text-[12px] text-text-3 break-all">
                SHA-256: {selectedItem.package.sha256} · {formatBytes(selectedItem.package.size)}
              </p>
              {selectedItem.kind === 'plugin' && (
                <p>
                  {canWords(selectedItem.plugin_actions) ??
                    'Shader effect only: runs on GPU with zero stream or account permissions.'}
                </p>
              )}
              <p className="font-mono text-[12px] text-accent-text break-all">
                Link: ferrocast://store/install/{selectedItem.id}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const link = `ferrocast://store/install/${selectedItem.id}`
                  void navigator.clipboard?.writeText(link)
                  toast({ tone: 'info', message: `Copied ${link}` })
                }}
              >
                <LinkSimple size={14} aria-hidden="true" />
                Copy ferrocast:// link
              </Button>
              <div className="flex items-center gap-2">
                {selectedItem.installed_version ? (
                  <>
                    {selectedItem.update_available && (
                      <Button
                        variant="primary"
                        disabled={busyId === selectedItem.id}
                        onClick={() => void doUpdate(selectedItem.id)}
                      >
                        Update to v{selectedItem.version}
                      </Button>
                    )}
                    <Button
                      variant="danger"
                      disabled={busyId === selectedItem.id}
                      onClick={() => void doUninstall(selectedItem.id)}
                    >
                      Uninstall
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="primary"
                    disabled={busyId === selectedItem.id}
                    onClick={() => void doInstall(selectedItem.id)}
                  >
                    <DownloadSimple size={15} aria-hidden="true" />
                    {busyId === selectedItem.id ? 'Installing…' : 'Install package'}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </Dialog>
      )}

      {/* ferrocast:// Confirmation Dialog — ALWAYS asks first */}
      {linkDialogOpen && (
        <Dialog
          open
          onClose={() => {
            setLinkDialogOpen(false)
            if (route.install) go({ name: 'store' })
          }}
          title="Open ferrocast:// install link"
          size="md"
        >
          <div className="space-y-4" data-testid="ferrocast-link-dialog">
            <p className="text-[14px] text-text-2">
              Ferrocast links always ask for your confirmation before downloading or installing
              anything.
            </p>
            <div className="flex gap-2">
              <Input
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                aria-label="Ferrocast install URI"
                placeholder="ferrocast://store/install/aurora-pulse"
                className="font-mono text-[13px]"
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={linkBusy}
                onClick={() => void resolveAndAsk(linkInput.trim())}
              >
                Inspect
              </Button>
            </div>

            {linkError && (
              <p className="text-[13.5px] font-medium text-danger" role="alert">
                {linkError}
              </p>
            )}

            {linkPreview && (
              <div className="rounded-ctrl border border-accent-line bg-surface-2 p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-display text-[17px] font-extrabold text-text">
                      Install “{linkPreview.item.title}”?
                    </h3>
                    <p className="text-[13px] text-text-3">
                      By {linkPreview.creator.name} ({linkPreview.creator.handle}) · v
                      {linkPreview.item.version}
                    </p>
                  </div>
                  <PerfPill perf={measureItemLocally(linkPreview.item)} />
                </div>
                <ul className="space-y-1 text-[13px] text-text-2">
                  {linkPreview.safety_notes.map((n, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <Check size={14} className="mt-0.5 shrink-0 text-ok" aria-hidden="true" />
                      <span>{n}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setLinkDialogOpen(false)
                      setLinkPreview(null)
                      if (route.install) go({ name: 'store' })
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={busyId === linkPreview.item.id || !!linkPreview.installed}
                    onClick={() => void doInstall(linkPreview.item.id)}
                  >
                    {linkPreview.installed
                      ? `Already installed (v${linkPreview.installed.version})`
                      : busyId === linkPreview.item.id
                        ? 'Installing…'
                        : 'Confirm & Install'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Dialog>
      )}
    </div>
  )
}
