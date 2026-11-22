import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowArcLeft, ArrowArcRight, CaretLeft, Eye, EyeSlash } from '@phosphor-icons/react'
import { DEFAULT_THEME, renderSafeTemplate, type Overlay, type OverlayState } from '@ferrocast/api'
import { Button, Dialog, IconButton, Skeleton } from '@ferrocast/ui'
import { LoadError } from '../components/Panel'
import { ObsIcon, SecretUrl, useAddToObs } from '../components/obs'
import { TestAlertMenu } from '../components/alerts-live'
import { useUsesObs } from '../lib/picture'
import { AddToStudioDialog } from '../components/studio/desk/add-to-studio'
import { LayoutEditor } from '../components/layout/LayoutEditor'
import { useHistory, useUndoKeys } from '../lib/history'
import { useAction, useClient, useResource } from '../lib/hooks'
import { href } from '../lib/router'
import { useLive } from '../lib/store'
import { useLeaveGuard } from '../lib/unsaved'
import { SAMPLE_GIVEAWAY, SAMPLE_POLL, giveawayCard } from '../components/community/preview'

export function OverlayEditor({ id }: { id: string }) {
  const client = useClient()
  const ov = useResource((c) => c.overlay(id), [id])
  const themes = useResource((c) => c.themes())
  const goals = useResource((c) => c.goals())
  const chat = useLive((s) => s.chat)
  const events = useLive((s) => s.events)
  const viewers = useLive((s) => s.viewers)
  const livePoll = useLive((s) => s.poll)
  const liveGiveaway = useLive((s) => s.giveaway)
  const { run, busy } = useAction()
  const { add, busy: adding, guide } = useAddToObs()
  const usesObs = useUsesObs()
  const [toStudio, setToStudio] = useState(false)
  const history = useHistory<Overlay | null>(null)
  const draft = history.value
  const setDraft = (o: Overlay) => history.reset(o)
  useUndoKeys(history)
  const media = useResource((c) => c.media())
  const [preview, setPreview] = useState(true)
  const reduce = useReducedMotion()
  useEffect(() => {
    if (ov.data) history.reset(ov.data)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ov.data])
  const leaving = useLeaveGuard(draft !== null && JSON.stringify(draft) !== JSON.stringify(ov.data))

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
  const lastChat = chat.at(-1)?.id
  const lastEvent = events.at(-1)?.id
  const sampleLabels: Record<string, string> = {
    latest_follower: 'LunaLagoon',
    latest_sub: 'rohanbuilds',
    latest_gifter: 'Devika (5)',
    latest_tip: 'Asha ₹500',
    latest_bits: 'Ananya 1,200 bits',
    latest_raid: 'VikramGG (48)',
    top_tip_session: 'MeeraDraws ₹2,500',
    top_supporter_session: 'MeeraDraws (₹2,500, 2 subs)',
    session_follows: '41',
    session_subs: '7',
    session_bits: '4,850',
    session_tips: '₹3,250',
    session_raids: '2',
    monthly_follows: '312',
    monthly_subs: '58',
    monthly_bits: '24,500',
    monthly_tips: '₹18,400',
    monthly_raids: '9',
    top_tip_monthly: 'MeeraDraws ₹5,000',
    top_supporter_monthly: 'Devika (15 subs, ₹3,500)',
    alltime_follows: '2,840',
    alltime_subs: '419',
    alltime_bits: '148,200',
    alltime_tips: '₹92,150',
    alltime_raids: '64',
    top_tip_alltime: 'AriaLive ₹12,000',
    top_supporter_alltime: 'Devika (45 subs, ₹8,000)',
    hype_train: 'Lv.2 · 8 events · 01:45',
  }
  const state: OverlayState = useMemo(
    () => ({
      goals: goals.data ?? [],
      labels: Object.fromEntries(
        (JSON.parse(labelKey) as [string, string, string][]).map(([id, source, t]) => {
          const val = sampleLabels[source] ?? 'LunaLagoon'
          return [
            id,
            renderSafeTemplate(
              t,
              source === 'hype_train'
                ? {
                    value: val,
                    name: val,
                    level: '2',
                    count: '8',
                    events: '8',
                    contributors: '5',
                    timer: '01:45',
                    latest: 'NeelaMoth',
                  }
                : { value: val, name: val },
            ),
          ]
        }),
      ),
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
      events: events.slice(-25),
      chat: chat.slice(-30),
      // The real poll and giveaway when there are some, else samples to place them by.
      poll: livePoll ?? SAMPLE_POLL,
      giveaway: liveGiveaway ? giveawayCard(liveGiveaway) : SAMPLE_GIVEAWAY,
    }),
    // Keyed on the newest item: both lists are capped, so their lengths stop changing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [goals.data, labelKey, hasTrain, lastChat, lastEvent, livePoll, liveGiveaway],
  )

  if (ov.error) return <LoadError error={ov.error} onRetry={ov.reload} />
  if (!draft)
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="aspect-video w-full" />
      </div>
    )
  const dirty = JSON.stringify(draft) !== JSON.stringify(ov.data)
  const brandLocked = draft.design?.branded === true
  const saveNow = () =>
    run('save', () => client.saveOverlay(draft), {
      success: 'Overlay saved. Your stream updates by itself.',
    }).then((o) => {
      if (o) ov.set(o)
      return o
    })
  const save = () => void saveNow()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={href({ name: 'overlays' })}
          className="fc-press inline-flex size-10 items-center justify-center rounded-control text-text-3 hover:bg-surface-2 hover:text-text"
          aria-label="Back to overlays"
        >
          <CaretLeft size={18} />
        </a>
        <h1 className="mr-auto min-w-0 truncate font-display text-2xl font-extrabold tracking-tight">
          {draft.name}
        </h1>
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
      <SecretUrl url={draft.url} className="max-w-xl" />
      {brandLocked && (
        <p className="text-[14px] text-text-3">
          Made from a built-in design: it keeps a small Ferrocast mark. Duplicate the design in
          Designs to make an unbranded copy.
        </p>
      )}
      <LayoutEditor
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
      />
      <AnimatePresence>
        {dirty && (
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
            className="sticky bottom-[calc(76px+env(safe-area-inset-bottom))] z-10 flex items-center gap-3 rounded-panel border border-line-strong bg-surface-1 px-4 py-3 shadow-pop lg:bottom-[calc(1rem+var(--fc-statusbar,0px))]"
          >
            <p className="min-w-0 flex-1 text-[14px] text-text-2">
              Unsaved layout. Your stream keeps the old one until you save.
            </p>
            <Button size="sm" variant="ghost" onClick={() => ov.data && setDraft(ov.data)}>
              Discard
            </Button>
            <Button size="sm" variant="primary" busy={busy === 'save'} onClick={save}>
              Save
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
      {guide}
      <AddToStudioDialog overlay={toStudio ? draft : null} onClose={() => setToStudio(false)} />
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
                setDraft(ov.data ?? draft)
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
