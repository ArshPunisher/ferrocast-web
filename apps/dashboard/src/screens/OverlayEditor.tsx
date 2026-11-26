import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowArcLeft, ArrowArcRight, CaretLeft, Eye, EyeSlash } from '@phosphor-icons/react'
import { DEFAULT_THEME, type Overlay, type OverlayState } from '@ferrocast/api'
import { Button, Dialog, IconButton, Skeleton } from '@ferrocast/ui'
import { LoadError } from '../components/Panel'
import { ObsIcon, SecretUrl, useAddToObs } from '../components/obs'
import { TestAlertMenu } from '../components/alerts-live'
import { useUsesObs } from '../lib/picture'
import { AddToStudioDialog } from '../components/studio/desk/add-to-studio'
import { LayoutEditor } from '../components/layout/LayoutEditor'
import { resolvePreviewLabelMap, useCreatorPreview } from '../components/design/previews'
import { useHistory, useUndoKeys } from '../lib/history'
import { useAction, useClient, useResource } from '../lib/hooks'
import { href } from '../lib/router'
import { beginLabelsLoad, beginLinksLoad, useLive } from '../lib/store'
import { useLeaveGuard } from '../lib/unsaved'
import {
  SAMPLE_CREDITS,
  SAMPLE_GIVEAWAY,
  SAMPLE_HIGHLIGHT,
  SAMPLE_POLL,
  giveawayCard,
} from '../components/community/preview'

export function OverlayEditor({ id }: { id: string }) {
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
  const creatorPreview = useCreatorPreview()
  const labelsLoadGenRef = useRef<number | undefined>(undefined)
  const linksLoadGenRef = useRef<number | undefined>(undefined)
  const freshLabels = useResource(
    (c) => {
      labelsLoadGenRef.current = beginLabelsLoad()
      return c.labels?.().catch(() => null) ?? Promise.resolve(null)
    },
    [lastEvent],
  )
  const freshLinks = useResource((c) => {
    linksLoadGenRef.current = beginLinksLoad()
    return c.links?.().catch(() => null) ?? Promise.resolve(null)
  }, [])
  const effectiveLabels = freshLabels.data ?? creatorPreview.labels
  const effectiveLinks = creatorPreview.links ?? freshLinks.data?.resolved ?? null
  useEffect(() => {
    if (freshLabels.data) useLive.getState().setLabels(freshLabels.data, labelsLoadGenRef.current)
  }, [freshLabels.data])
  useEffect(() => {
    if (freshLinks.data && !useLive.getState().links) {
      useLive.getState().setLinks(freshLinks.data.resolved, linksLoadGenRef.current)
    }
  }, [freshLinks.data])
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

  const state: OverlayState = useMemo(
    () => {
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
        events: events.slice(-25),
        chat: chat.slice(-30),
        // The real poll, giveaway, credits and highlight when present, else samples to place them by.
        poll: livePoll ?? SAMPLE_POLL,
        giveaway: liveGiveaway ? giveawayCard(liveGiveaway) : SAMPLE_GIVEAWAY,
        credits: resolvedCredits,
        chat_highlight: resolvedHighlight,
        links: effectiveLinks,
      }
    },
    // Keyed on the newest item: both lists are capped, so their lengths stop changing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      goals.data,
      labelKey,
      hasTrain,
      lastChat,
      lastEvent,
      livePoll,
      liveGiveaway,
      resolvedCredits,
      resolvedHighlight,
      effectiveLabels,
      effectiveLinks,
    ],
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
            className="sticky bottom-[calc(76px+env(safe-area-inset-bottom))] z-10 flex flex-wrap items-center gap-3 rounded-panel border border-line-strong bg-surface-1 px-4 py-3 shadow-pop lg:bottom-[calc(1rem+var(--fc-statusbar,0px))] xl:w-[calc(100%-21rem)]"
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
