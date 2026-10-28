import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowArcLeft, ArrowArcRight, CaretLeft, Eye, EyeSlash } from '@phosphor-icons/react'
import { DEFAULT_THEME, type Overlay, type OverlayState } from '@ferrocast/api'
import { Button, Dialog, IconButton, Skeleton } from '@ferrocast/ui'
import { LoadError } from '../components/Panel'
import { ObsIcon, SecretUrl, useAddToObs } from '../components/obs'
import { TestAlertMenu } from '../components/alerts-live'
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

  // Labels depend only on label widgets' text, not on where widgets sit, so dragging
  // doesn't rebuild the preview state.
  const labelKey = JSON.stringify(
    (draft?.widgets ?? []).flatMap((w) => (w.kind === 'label' ? [[w.id, w.config.template]] : [])),
  )
  const lastChat = chat.at(-1)?.id
  const lastEvent = events.at(-1)?.id
  const state: OverlayState = useMemo(
    () => ({
      goals: goals.data ?? [],
      labels: Object.fromEntries(
        (JSON.parse(labelKey) as [string, string][]).map(([id, t]) => [
          id,
          t.replace('{name}', 'LunaLagoon'),
        ]),
      ),
      viewers,
      events: events.slice(-25),
      chat: chat.slice(-30),
      // The real poll and giveaway when there are some, else samples to place them by.
      poll: livePoll ?? SAMPLE_POLL,
      giveaway: liveGiveaway ? giveawayCard(liveGiveaway) : SAMPLE_GIVEAWAY,
    }),
    // Keyed on the newest item: both lists are capped, so their lengths stop changing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [goals.data, labelKey, lastChat, lastEvent, livePoll, liveGiveaway],
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
      success: 'Overlay saved. OBS updates by itself.',
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
        <Button
          size="sm"
          variant="primary"
          icon={<ObsIcon size={14} />}
          busy={adding === draft.id}
          onClick={() => void add(draft)}
        >
          Add to OBS
        </Button>
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
      <Dialog
        open={leaving.pending !== null}
        onClose={leaving.stay}
        size="sm"
        title="Save your layout first?"
        description="You moved or changed widgets in this overlay. OBS keeps the old layout until you save."
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
