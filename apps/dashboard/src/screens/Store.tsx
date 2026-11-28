// Community Theme Store (Phase 3 #18, R37): browse & search themes, alerts, widgets,
// overlays, and safe sandboxed plugins, inspect creator pages, measure render performance
// locally on this PC, install/update/uninstall with one-click undo, and confirm ferrocast:// links.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  catalogNotPublished,
  describeError,
  errorSentence,
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
  InfoTip,
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
import { useWidePage } from '../lib/wide'
import { go, href, type Route } from '../lib/router'
import { filterInstalled, latestOnly, withInstalled } from '../lib/store-state'
import { estimateItemPerf, measureItemLocally, type LocalPerfReport } from '../lib/store-perf'

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
        <span>Sandboxed</span>
      </Badge>
    )
  }
  return (
    <Badge tone="accent">
      <Cpu size={12} aria-hidden="true" />
      <span>{item.plugin_kind === 'effect' ? 'Shader (sandboxed)' : 'Plugin (sandboxed)'}</span>
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
              <Star size={14} weight="fill" className="text-molten-text" aria-hidden="true" />
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
            perf={perfMap.get(item.id) ?? estimateItemPerf(item)}
            busy={busyId === item.id}
            onOpen={() => onSelectItem(item.id)}
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
  onCreator?: ((id: string) => void) | undefined
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
          <p
            className="mt-1 line-clamp-2 text-[13.5px] leading-snug text-text-2"
            title={item.summary}
          >
            {item.summary}
          </p>
        </div>
      </div>

      <div className="space-y-2.5 border-t border-line pt-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-text-3">
          {creator && onCreator ? (
            <button
              type="button"
              onClick={() => onCreator(creator.id)}
              className="inline-flex items-center gap-1 font-semibold text-accent-text hover:underline focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
            >
              <span>{creator.name}</span>
              {creator.verified && <ShieldCheck size={13} aria-hidden="true" />}
            </button>
          ) : (
            <span>{creator ? creator.name : item.creator_id}</span>
          )}
          <span className="inline-flex items-center gap-2 tabular-nums">
            <span className="inline-flex items-center gap-0.5">
              <Star size={13} weight="fill" className="text-molten-text" aria-hidden="true" />
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

/** The catalog address answers "not found": nothing is published yet. Said plainly, since the
 * internet is fine, and what still works is named. */
function CatalogNotPublished({ onCheck }: { onCheck: () => void }) {
  return (
    <div
      role="status"
      data-testid="store-not-published"
      className="flex flex-wrap items-center justify-between gap-4 rounded-panel border border-accent-line bg-accent-soft px-4 py-4"
    >
      <div className="min-w-[240px] flex-1">
        <p className="text-[15px] font-semibold text-text">
          The Community Store catalog isn’t published yet
        </p>
        <p className="mt-1 text-[14px] text-text-2">
          Your internet connection is fine: there is no catalog at the Store’s address yet. What you
          installed keeps working.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <a
          href={href({ name: 'designs' })}
          className="fc-press inline-flex h-8 items-center rounded-control border border-line-strong bg-surface-3 px-3 text-[14.5px] font-semibold text-text hover:border-text-3"
        >
          Browse built-in designs
        </a>
        <Button size="sm" variant="secondary" onClick={onCheck}>
          <ArrowClockwise size={15} aria-hidden="true" />
          Check again
        </Button>
      </div>
    </div>
  )
}

export function Store({ route }: { route: Extract<Route, { name: 'store' }> }) {
  // A catalog and its rail use the whole window.
  useWidePage()
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
  // Trust: pure data, and what runs in a sandbox (custom alerts, plugins). Both on shows everything.
  const [trust, setTrust] = useState({ data: true, sandbox: true })
  const [busyId, setBusyId] = useState<string | null>(null)
  const [undoBusy, setUndoBusy] = useState(false)

  const [perfCache, setPerfCache] = useState<Map<string, LocalPerfReport>>(() => new Map())

  // Deep link dialog state (`ferrocast://...` always asks before installing).
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [linkInput, setLinkInput] = useState('ferrocast://store/install/aurora-pulse')
  const [linkPreview, setLinkPreview] = useState<StoreLinkPreview | null>(null)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [linkBusy, setLinkBusy] = useState(false)

  // Only the newest load may change the screen: a slow refresh that started before an install must
  // not bring back the pre-install flags, and a link result that arrives late must not replace the
  // link on screen now.
  const loads = useRef(latestOnly())
  const links = useRef(latestOnly())

  const loadAll = useCallback(
    async (fresh = false) => {
      const gen = loads.current.next()
      if (fresh) setRefreshing(true)
      else setLoading(true)
      const [catRes, instRes] = await Promise.allSettled([api.catalog(fresh), api.installed()])
      if (!loads.current.isCurrent(gen)) return
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
        // Keep the catalog for browsing offline, but its installed flags follow the installed list
        // that did load (what was just removed is no longer offered for removal).
        if (instRes.status === 'fulfilled') {
          const inst = instRes.value
          setCatalog((prev) => (prev ? withInstalled(prev, inst.installed, inst.last_undo) : prev))
        }
      }
      setLoading(false)
      setRefreshing(false)
    },
    [api],
  )

  useEffect(() => {
    void loadAll(false)
    const l = loads.current
    return () => l.invalidate()
  }, [loadAll])

  /** Closes the link dialog and makes any lookup still in flight stale. */
  const closeLinkDialog = useCallback(() => {
    links.current.invalidate()
    setLinkDialogOpen(false)
    setLinkPreview(null)
    setLinkError(null)
    setLinkBusy(false)
  }, [])

  // Measure each catalog item on this machine, a few at a time so a long catalog can't freeze
  // the page (cards show the quick estimate until their turn).
  useEffect(() => {
    if (!catalog) return
    let cancelled = false
    const next = new Map<string, LocalPerfReport>()
    const items = catalog.items
    let i = 0
    const step = () => {
      if (cancelled) return
      for (const end = Math.min(items.length, i + 8); i < end; i++) {
        next.set(items[i]!.id, measureItemLocally(items[i]!))
      }
      setPerfCache(new Map(next))
      if (i < items.length) window.setTimeout(step, 0)
    }
    step()
    return () => {
      cancelled = true
    }
  }, [catalog])

  const resolveAndAsk = useCallback(
    async (uri: string) => {
      const gen = links.current.next()
      setLinkInput(uri)
      setLinkDialogOpen(true)
      setLinkError(null)
      setLinkPreview(null)
      setLinkBusy(false)
      if (!parseFerrocastStoreLink(uri)) {
        setLinkError(
          'That link does not match ferrocast://store/install/<id> or ferrocast://store/item/<id>.',
        )
        return
      }
      setLinkBusy(true)
      try {
        const preview = await api.resolveLink(uri)
        if (links.current.isCurrent(gen)) setLinkPreview(preview)
      } catch (e) {
        if (links.current.isCurrent(gen)) setLinkError(errorSentence(e))
      } finally {
        if (links.current.isCurrent(gen)) setLinkBusy(false)
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
    // The dialog this install was confirmed in: it closes only if that is still the one on screen
    // (a link opened meanwhile is a different dialog and stays).
    const dialog = links.current.current()
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
      if (links.current.isCurrent(dialog)) closeLinkDialog()
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
      if (item.package.format === 'ferrodesign' ? !trust.data : !trust.sandbox) return false
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
  }, [catalog, filter, search, trust, creatorsById])

  const installedShown = useMemo(
    () => filterInstalled(installedFallback, search),
    [installedFallback, search],
  )

  /** How many items each category holds (the rail's numbers), whatever the search says. */
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: catalog?.items.length ?? 0 }
    for (const it of catalog?.items ?? []) c[it.kind] = (c[it.kind] ?? 0) + 1
    return c
  }, [catalog])

  const selectedItemPerf = selectedItem
    ? (perfCache.get(selectedItem.id) ?? estimateItemPerf(selectedItem))
    : null

  return (
    <div className="space-y-6" data-testid="store-screen">
      <PageHeader
        title="Community Store"
        description="Signed themes, alerts, widgets, overlays, and sandboxed plugins. Zero telemetry sent."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-64">
              <MagnifyingGlass
                size={15}
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-3"
                aria-hidden="true"
              />
              <Input
                data-keep-placeholder
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search packages, creators…"
                aria-label="Search Community Store"
                className="h-9 pl-9"
              />
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                links.current.invalidate()
                setLinkError(null)
                setLinkPreview(null)
                setLinkBusy(false)
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
          className="flex items-start gap-2.5 rounded-panel border border-accent-line bg-accent-soft px-4 py-3 text-[13.5px] text-text"
        >
          <Warning size={18} className="mt-0.5 shrink-0 text-molten-text" aria-hidden="true" />
          <div>
            <p className="font-semibold">This catalog snapshot is older than 7 days.</p>
            <p className="text-text-2">
              Installed themes, alerts, and plugins continue working normally.
            </p>
          </div>
        </div>
      )}

      {catalog && ((route.creator && !selectedCreator) || (route.item && !selectedItem)) && (
        <p role="status" className="mb-3 text-[14.5px] text-text-2">
          {route.creator && !selectedCreator
            ? 'That creator isn’t in the Store.'
            : 'That item isn’t in the Store (it may have been removed).'}{' '}
          <a
            className="font-semibold text-accent-text hover:underline"
            href={href({ name: 'store' })}
          >
            Back to the Store
          </a>
        </p>
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
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
            <aside
              aria-label="Store filters"
              className="flex w-full shrink-0 flex-col gap-4 lg:sticky lg:top-[calc(var(--fc-top,56px)+16px)] lg:w-[190px] min-[1400px]:w-[214px]"
            >
              <div role="group" aria-label="Store categories" className="flex flex-col gap-0.5">
                <span className="px-2.5 pb-1 text-[13px] font-semibold tracking-wide text-text-3 uppercase">
                  Categories
                </span>
                <div className="flex flex-wrap gap-1.5 lg:flex-col lg:gap-0.5">
                  {CATEGORY_TABS.map((t) => {
                    const n = t.id === 'installed' ? installedFallback.length : counts[t.id]
                    const active = filter === t.id
                    return (
                      <button
                        key={t.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setFilter(t.id)}
                        className={cx(
                          'fc-press flex h-9 items-center justify-between gap-2 rounded-control px-2.5 text-left text-[14px] font-semibold focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none',
                          'max-lg:rounded-full max-lg:border max-lg:px-3',
                          active
                            ? 'fc-picked max-lg:border-transparent'
                            : 'text-text-2 hover:bg-surface-2 hover:text-text max-lg:border-line',
                        )}
                      >
                        <span>{t.label}</span>
                        {n !== undefined && (
                          <span className="font-mono text-[12.5px] font-medium opacity-80">
                            {n}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
              <fieldset className="flex flex-col gap-1">
                <legend className="px-2.5 pb-1 text-[13px] font-semibold tracking-wide text-text-3 uppercase">
                  Trust
                </legend>
                <label className="flex min-h-8 cursor-pointer items-center gap-2 px-2.5 text-[14px] text-text-2">
                  <input
                    type="checkbox"
                    checked={trust.data}
                    onChange={(e) => setTrust({ ...trust, data: e.target.checked })}
                    className="size-4 accent-[var(--fc-accent)]"
                  />
                  Pure data
                </label>
                <label className="flex min-h-8 cursor-pointer items-center gap-2 px-2.5 text-[14px] text-text-2">
                  <input
                    type="checkbox"
                    checked={trust.sandbox}
                    onChange={(e) => setTrust({ ...trust, sandbox: e.target.checked })}
                    className="size-4 accent-[var(--fc-accent)]"
                  />
                  Sandboxed
                </label>
              </fieldset>
              <p className="hidden rounded-control border border-line bg-surface-2 p-2.5 text-[13.5px] text-text-2 lg:block">
                <strong className="font-semibold text-text">
                  {installedFallback.length} installed
                </strong>
                <br />
                Verified on this PC. Works offline.{' '}
                <InfoTip label="About verification">
                  Every package has a fingerprint that is checked on this PC before it is used, so
                  what you install is what the creator published.
                </InfoTip>
              </p>
            </aside>
            <div className="min-w-0 flex-1 space-y-5">
              {catalogError ? (
                catalogNotPublished(catalogError) ? (
                  <CatalogNotPublished onCheck={() => void loadAll(true)} />
                ) : (
                  <LoadError error={catalogError} onRetry={() => void loadAll(true)} />
                )
              ) : null}

              {loading ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4 max-sm:grid-cols-1">
                  {[1, 2, 3, 4].map((k) => (
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
                              setTrust({ data: true, sandbox: true })
                            }}
                          >
                            Reset filters
                          </Button>
                        }
                      >
                        Try clearing the category filter or search box.
                      </EmptyState>
                    ) : (
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4 max-sm:grid-cols-1">
                        {filteredItems.map((item) => (
                          <StoreItemCard
                            key={item.id}
                            item={item}
                            creator={creatorsById.get(item.creator_id)}
                            perf={perfCache.get(item.id) ?? estimateItemPerf(item)}
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
                  title={`Installed from Store (${installedShown.length === installedFallback.length ? installedFallback.length : `${installedShown.length} of ${installedFallback.length}`})`}
                  description="Verified on this PC. Keeps working even when the catalog is unavailable."
                  icon={<Package weight="fill" />}
                >
                  {installedFallback.length === 0 ? (
                    <p className="text-[14px] text-text-3">
                      No Community Store items installed yet.
                    </p>
                  ) : installedShown.length === 0 ? (
                    <p role="status" className="break-words text-[14px] text-text-3">
                      No installed items match “{search.trim()}”. Clear the search to see them all.
                    </p>
                  ) : (
                    <ul className="divide-y divide-line">
                      {installedShown.map((rec) => (
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
                              By {rec.creator_name} · Verified on this PC{' '}
                              <InfoTip label={`About the fingerprint of ${rec.title}`}>
                                Fingerprint {rec.package_sha256.slice(0, 12)}…
                              </InfoTip>
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
            </div>
          </div>
        </>
      )}

      {/* Item Detail Modal */}
      {selectedItem && (
        <Dialog open onClose={() => go({ name: 'store' })} title={selectedItem.title} size="lg">
          <div className="space-y-4" data-testid="store-item-detail">
            <StoreDetailPreview key={selectedItem.id} item={selectedItem} />

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
              <div className="rounded-control border border-line bg-surface-2 p-3.5 space-y-2">
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
            <div className="rounded-control border border-line bg-surface-2 p-3.5 space-y-1.5 text-[13px] text-text-2">
              <p className="font-semibold text-text">Verified on this PC</p>
              <p className="font-mono text-[12px] text-text-3 break-all">
                Fingerprint: {selectedItem.package.sha256} ·{' '}
                {formatBytes(selectedItem.package.size)}
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
            closeLinkDialog()
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
                onChange={(e) => {
                  // An edit makes the lookup in flight, and what it found, no longer about this text.
                  links.current.invalidate()
                  setLinkInput(e.target.value)
                  setLinkPreview(null)
                  setLinkError(null)
                  setLinkBusy(false)
                }}
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
              <div className="rounded-control border border-accent-line bg-surface-2 p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display text-[17px] font-extrabold text-text">
                      {linkPreview.action === 'view' ? '' : 'Install '}“{linkPreview.item.title}”
                      {linkPreview.action === 'view' ? '' : '?'}
                    </h3>
                    <p className="text-[13px] text-text-3">
                      By {linkPreview.creator.name} ({linkPreview.creator.handle}) · v
                      {linkPreview.item.version}
                    </p>
                  </div>
                  <span className="shrink-0">
                    <PerfPill perf={estimateItemPerf(linkPreview.item)} />
                  </span>
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
                      closeLinkDialog()
                      if (route.install) go({ name: 'store' })
                    }}
                  >
                    Cancel
                  </Button>
                  {linkPreview.action === 'view' ? (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => {
                        const id = linkPreview.item.id
                        closeLinkDialog()
                        go({ name: 'store', item: id })
                      }}
                    >
                      View details
                    </Button>
                  ) : (
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
                  )}
                </div>
              </div>
            )}
          </div>
        </Dialog>
      )}
    </div>
  )
}
