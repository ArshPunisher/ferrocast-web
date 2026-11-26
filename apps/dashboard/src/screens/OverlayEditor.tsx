import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowArcLeft, ArrowArcRight, CaretLeft, Eye, EyeSlash } from '@phosphor-icons/react'
import { DEFAULT_THEME, type Overlay, type OverlayState } from '@ferrocast/api'
import { Button, Dialog, IconButton, Skeleton, cx } from '@ferrocast/ui'
import { LoadError } from '../components/Panel'
import { ObsIcon, SecretUrl, useAddToObs } from '../components/obs'
import { TestAlertMenu } from '../components/alerts-live'
import { useUsesObs } from '../lib/picture'
import { AddToStudioDialog } from '../components/studio/desk/add-to-studio'
import { LayoutEditor } from '../components/layout/LayoutEditor'
import { resolvePreviewLabelMap } from '../components/design/previews'
import { useHistory, useUndoKeys } from '../lib/history'
import { useAction, useClient, useResource } from '../lib/hooks'
import { href } from '../lib/router'
import { beginLabelsLoad, beginLinksLoad, useLive } from '../lib/store'
import { useLeaveGuard } from '../lib/unsaved'
import { useFlushPage, useWidePage } from '../lib/wide'
import {
  SAMPLE_CREDITS,
  SAMPLE_GIVEAWAY,
  SAMPLE_HIGHLIGHT,
  SAMPLE_POLL,
  giveawayCard,
} from '../components/community/preview'

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => (item === undefined ? 'null' : canonicalJson(item))).join(',')}]`
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function normalizeWidget(w: Overlay['widgets'][number]): Record<string, unknown> {
  const out: Record<string, unknown> = { ...w }
  if (!out.locked) delete out.locked
  if (!out.hidden) delete out.hidden
  if (out.rotation === undefined || out.rotation === 0) delete out.rotation
  if (out.opacity === undefined || out.opacity === 1) delete out.opacity
  return out
}

function layoutDirty(draft: Overlay | null, saved: Overlay | null): boolean {
  if (!draft || !saved) return false
  return (
    draft.name !== saved.name ||
    draft.width !== saved.width ||
    draft.height !== saved.height ||
    canonicalJson(draft.widgets.map(normalizeWidget)) !==
      canonicalJson(saved.widgets.map(normalizeWidget))
  )
}

export function OverlayEditor({ id }: { id: string }) {
  useWidePage()
  useFlushPage()
  const client = useClient()
  const ov = useResource((c) => c.overlay(id), [id])
  const themes = useResource((c) => c.themes())
  const goals = useResource((c) => c.goals())
  const credits = useResource((c) => c.credits())
  const initialHighlight = useResource((c) => c.chatHighlight())
  const chat = useLive((s) => s.chat)
  const events = useLive((s) => s.events)
  const viewers = useLive((s) => s.viewers)
  const livePoll = useLive((s) => s.poll)
  const liveGiveaway = useLive((s) => s.giveaway)
  const liveHighlight = useLive((s) => s.chatHighlight)
  const { run, busy } = useAction()
  const { add, busy: adding, guide } = useAddToObs()
  const usesObs = useUsesObs()
  const [toStudio, setToStudio] = useState(false)
  const history = useHistory<Overlay | null>(null)
  const draft = history.value
  const [savedBaseline, setSavedBaseline] = useState<Overlay | null>(null)
  const setDraft = (o: Overlay) => history.reset(o)
  useUndoKeys(history)
  const media = useResource((c) => c.media())
  const [preview, setPreview] = useState(true)
  const loadedId = useRef<string | null>(null)
  const workspaceRef = useRef<HTMLDivElement>(null)
  const footerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ov.data || ov.data.id !== id) {
      loadedId.current = null
      history.reset(null)
      setSavedBaseline(null)
      setToStudio(false)
      return
    }
    if (loadedId.current === id) return
    loadedId.current = id
    history.reset(ov.data)
    setSavedBaseline(ov.data)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, ov.data])
  const currentDraft = draft && draft.id === id && ov.data?.id === id ? draft : null
  const dirty = layoutDirty(currentDraft, savedBaseline ?? ov.data)
  const leaving = useLeaveGuard(dirty)

  // Keep bottom-center desktop/tablet toasts clear of the status / Unsaved bar without shifting
  // toasts on any other screen.
  useLayoutEffect(() => {
    const root = document.documentElement
    const setOffset = (next: string) => {
      const cur = root.style.getPropertyValue('--fc-toast-offset')
      if (next) {
        if (cur !== next) root.style.setProperty('--fc-toast-offset', next)
      } else if (cur) {
        root.style.removeProperty('--fc-toast-offset')
      }
    }
    const sync = () => {
      const el = footerRef.current
      if (!el) {
        setOffset('')
        return
      }
      const rect = el.getBoundingClientRect()
      const vh = window.innerHeight
      if (
        window.innerWidth < 640 ||
        rect.height <= 0 ||
        rect.top >= vh ||
        rect.bottom <= vh - 240
      ) {
        setOffset('')
        return
      }
      const cs = getComputedStyle(root)
      const rem = parseFloat(cs.fontSize) || 16
      const statusbar = parseFloat(cs.getPropertyValue('--fc-statusbar') || '0') || 0
      const needed = Math.ceil(vh - rect.top - statusbar - rem + 8)
      const maxOffset = Math.max(0, vh - statusbar - rem - 140)
      const offset = Math.max(0, Math.min(needed, maxOffset))
      setOffset(offset > 0 ? `${offset}px` : '')
    }
    sync()
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(sync) : null
    if (ro) {
      if (workspaceRef.current) ro.observe(workspaceRef.current)
      if (footerRef.current) ro.observe(footerRef.current)
    }
    let lastStatusbar = root.style.getPropertyValue('--fc-statusbar')
    const mo =
      typeof MutationObserver === 'function'
        ? new MutationObserver(() => {
            const nextStatus = root.style.getPropertyValue('--fc-statusbar')
            if (nextStatus === lastStatusbar) return
            lastStatusbar = nextStatus
            sync()
          })
        : null
    mo?.observe(root, { attributes: true, attributeFilter: ['style'] })
    window.addEventListener('resize', sync)
    window.addEventListener('scroll', sync, { passive: true })
    return () => {
      ro?.disconnect()
      mo?.disconnect()
      window.removeEventListener('resize', sync)
      window.removeEventListener('scroll', sync)
      root.style.removeProperty('--fc-toast-offset')
    }
  }, [dirty, currentDraft?.id])

  // Labels depend only on label widgets' source/template, not on where widgets sit, so dragging
  // doesn't rebuild the preview state.
  const labelKey = JSON.stringify(
    (draft?.widgets ?? []).flatMap((w) =>
      w.kind === 'label' ? [[w.id, w.config.source, w.config.template]] : [],
    ),
  )
  const hasTrain = (draft?.widgets ?? []).some(
    (w) => w.kind === 'label' && w.config.source === 'hype_train',
  )
  const recentChat = useMemo(() => chat.slice(-30), [chat])
  const recentEvents = useMemo(() => events.slice(-25), [events])
  const effectiveLabels = useLive((s) => s.labels)
  const effectiveLinks = useLive((s) => s.links)
  useEffect(() => {
    let active = true
    const lkGen = beginLinksLoad()
    const lbGen = beginLabelsLoad()
    void Promise.all([
      client.links?.().catch(() => null) ?? Promise.resolve(null),
      client.labels?.().catch(() => null) ?? Promise.resolve(null),
    ]).then(([lk, lb]) => {
      if (!active) return
      if (lk) useLive.getState().setLinks(lk.resolved, lkGen)
      if (lb) useLive.getState().setLabels(lb, lbGen)
    })
    return () => {
      active = false
    }
  }, [client])
  const resolvedCredits =
    credits.data &&
    (credits.data.followers.length > 0 ||
      credits.data.subs.length > 0 ||
      credits.data.gifters.length > 0 ||
      credits.data.tippers.length > 0 ||
      credits.data.raiders.length > 0 ||
      credits.data.mods.length > 0)
      ? credits.data
      : SAMPLE_CREDITS
  const resolvedHighlight =
    (liveHighlight !== undefined ? liveHighlight : initialHighlight.data) ?? SAMPLE_HIGHLIGHT

  const state: OverlayState = useMemo(() => {
    const labelWidgets = (JSON.parse(labelKey) as [string, string, string][]).map(
      ([id, source, template]) =>
        ({
          id,
          kind: 'label',
          x: 0,
          y: 0,
          w: 1,
          h: 1,
          config: { source, template },
        }) as Overlay['widgets'][number],
    )
    return {
      goals: goals.data ?? [],
      labels: resolvePreviewLabelMap(labelWidgets, effectiveLabels),
      ...(hasTrain
        ? {
            label_trains: Object.fromEntries(
              (JSON.parse(labelKey) as [string, string, string][])
                .filter(([, source]) => source === 'hype_train')
                .map(([id]) => [
                  id,
                  {
                    active: true,
                    level: 2,
                    events: 8,
                    contributors: 5,
                    latest_actor: 'NeelaMoth',
                    remaining_ms: 105_000,
                    ends_at: Date.now() + 105_000,
                    warmup_count: 8,
                    threshold: 3,
                  },
                ]),
            ),
          }
        : {}),
      viewers,
      events: recentEvents,
      chat: recentChat,
      // The real poll, giveaway, credits and highlight when present, else samples to place them by.
      poll: livePoll ?? SAMPLE_POLL,
      giveaway: liveGiveaway ? giveawayCard(liveGiveaway) : SAMPLE_GIVEAWAY,
      credits: resolvedCredits,
      chat_highlight: resolvedHighlight,
      links: effectiveLinks,
    }
  }, [
    goals.data,
    labelKey,
    hasTrain,
    viewers,
    recentChat,
    recentEvents,
    livePoll,
    liveGiveaway,
    resolvedCredits,
    resolvedHighlight,
    effectiveLabels,
    effectiveLinks,
  ])

  if (ov.error) return <LoadError error={ov.error} onRetry={ov.reload} />
  if (!draft || draft.id !== id || ov.data?.id !== id)
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="aspect-video w-full" />
      </div>
    )
  const brandLocked = draft.design?.branded === true
  const saveNow = () => {
    const sent = draft
    const payload: Overlay = {
      ...(ov.data ?? sent),
      name: sent.name,
      width: sent.width,
      height: sent.height,
      widgets: sent.widgets,
    }
    return run('save', () => client.saveOverlay(payload), {
      once: true,
      success: 'Overlay saved. Your stream updates by itself.',
    }).then((o) => {
      if (o) {
        ov.set(o)
        setSavedBaseline(sent)
      }
      return o
    })
  }
  const save = () => void saveNow()
  const discardChanges = () => {
    if (!ov.data) return
    setSavedBaseline(ov.data)
    setDraft(ov.data)
  }
  const studioOverlay: Overlay = ov.data
    ? {
        ...ov.data,
        name: draft.name,
        width: draft.width,
        height: draft.height,
        widgets: draft.widgets,
      }
    : draft
  const statusFooter = (
    <div
      ref={footerRef}
      data-testid="overlay-status-bar"
      className={cx(
        'flex items-center gap-3 rounded-panel border px-3.5 transition-colors duration-150 lg:h-12 lg:min-h-[48px] lg:flex-nowrap',
        dirty
          ? 'flex-wrap border-line-strong bg-surface-1 py-2.5 shadow-pop lg:py-0 lg:shadow-none'
          : 'hidden border-line bg-surface-1/70 lg:flex',
      )}
    >
      {dirty ? (
        <>
          <p
            role="status"
            aria-live="polite"
            title="Unsaved layout. Your stream keeps the old one until you save."
            className="min-w-0 flex-1 text-[13.5px] font-medium text-text-2 lg:truncate"
          >
            Unsaved layout. Your stream keeps the old one until you save.
          </p>
          <Button size="sm" variant="ghost" onClick={discardChanges}>
            Discard
          </Button>
          <Button size="sm" variant="primary" busy={busy === 'save'} onClick={save}>
            Save
          </Button>
        </>
      ) : (
        <>
          <p
            role="status"
            aria-live="polite"
            className="min-w-0 flex-1 truncate text-[13.5px] text-text-3 tabular-nums"
          >
            {draft.width} × {draft.height} · {draft.widgets.length}{' '}
            {draft.widgets.length === 1 ? 'layer' : 'layers'} · Saved
          </p>
          <span className="hidden shrink-0 text-[12.5px] text-text-3 xl:inline">
            Arrows nudge · Del removes
          </span>
        </>
      )}
    </div>
  )

  return (
    <div ref={workspaceRef} className="fc-overlay-workspace flex flex-col gap-2.5">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <a
          href={href({ name: 'overlays' })}
          className="fc-press inline-flex size-9 items-center justify-center rounded-control text-text-3 hover:bg-surface-2 hover:text-text sm:size-10"
          aria-label="Back to overlays"
        >
          <CaretLeft size={18} />
        </a>
        <h1
          title={draft.name}
          className="mr-auto min-w-0 truncate font-display text-xl font-extrabold tracking-tight sm:text-2xl lg:mr-0 lg:min-w-[6rem] lg:flex-1"
        >
          {draft.name}
        </h1>
        <SecretUrl url={draft.url} className="max-w-xl basis-full lg:w-56 lg:basis-auto xl:w-72" />
        <IconButton size="sm" label="Undo" disabled={!history.canUndo} onClick={history.undo}>
          <ArrowArcLeft size={16} />
        </IconButton>
        <IconButton size="sm" label="Redo" disabled={!history.canRedo} onClick={history.redo}>
          <ArrowArcRight size={16} />
        </IconButton>
        <Button
          size="sm"
          variant="ghost"
          icon={preview ? <EyeSlash size={15} /> : <Eye size={15} />}
          onClick={() => setPreview((p) => !p)}
          aria-pressed={preview}
        >
          {preview ? 'Hide live view' : 'Live view'}
        </Button>
        <TestAlertMenu size="sm" />
        {usesObs ? (
          <Button
            size="sm"
            variant="primary"
            icon={<ObsIcon size={14} />}
            busy={adding === draft.id}
            onClick={() => void add(draft)}
          >
            Add to OBS
          </Button>
        ) : (
          <Button size="sm" variant="primary" onClick={() => setToStudio(true)}>
            Add to Studio
          </Button>
        )}
      </div>
      {brandLocked && (
        <p
          className="shrink-0 text-[13px] text-text-3 lg:truncate"
          title="Made from a built-in design: it keeps a small Ferrocast mark. Duplicate the design in Designs to make an unbranded copy."
        >
          Made from a built-in design: it keeps a small Ferrocast mark. Duplicate the design in
          Designs to make an unbranded copy.
        </p>
      )}
      <LayoutEditor
        key={draft.id}
        fitViewport
        layout={draft}
        onWidgets={(widgets, opts) => history.set((d) => (d ? { ...d, widgets } : d), opts)}
        brandLocked={brandLocked}
        state={state}
        themes={themes.data ?? [{ id: DEFAULT_THEME, name: 'Molten', description: '', pro: false }]}
        goals={goals.data ?? []}
        onGoalCreated={(g) => goals.set((prev) => [...(prev ?? []), g])}
        preview={preview}
        media={media.data ?? []}
        onUploaded={(m) => media.set((prev) => [...(prev ?? []), m])}
        footer={statusFooter}
      />
      {guide}
      <AddToStudioDialog
        overlay={toStudio ? studioOverlay : null}
        onClose={() => setToStudio(false)}
      />
      <Dialog
        open={leaving.pending !== null}
        onClose={leaving.stay}
        size="sm"
        title="Save your layout first?"
        description="You moved or changed widgets in this overlay. Your stream keeps the old layout until you save."
        footer={
          <>
            <Button variant="ghost" onClick={leaving.stay}>
              Stay
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                discardChanges()
                leaving.leave()
              }}
            >
              Discard
            </Button>
            <Button
              variant="primary"
              busy={busy === 'save'}
              onClick={() => void saveNow().then((o) => o && leaving.leave())}
            >
              Save and leave
            </Button>
          </>
        }
      />
    </div>
  )
}
