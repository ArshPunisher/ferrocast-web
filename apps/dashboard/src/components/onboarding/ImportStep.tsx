import { useCallback, useEffect, useRef, useState, type Ref } from 'react'
import {
  ArrowCounterClockwise,
  ArrowRight,
  ArrowsClockwise,
  CheckCircle,
  Info,
  WarningCircle,
} from '@phosphor-icons/react'
import {
  ApiError,
  describeError,
  type EngineImportPreview,
  type EngineImportReport,
  type EngineObsCollection,
  type studioEngineApi,
} from '@ferrocast/api'
import { Button, Skeleton, cx } from '@ferrocast/ui'
import { ChoiceCard } from './ChoiceCard'

type EngineApi = ReturnType<typeof studioEngineApi>

export type ImportChoice = 'obs' | 'streamlabs' | 'fresh'

export interface ImportedCollectionState {
  source: 'obs' | 'streamlabs'
  report: EngineImportReport
  previousId: string | null
}

const SKIP_CATEGORY_LABEL: Record<string, string> = {
  source: 'Source',
  filter: 'Filter',
  scene_item: 'Scene item',
}

export function ImportStep({
  engine,
  headingId,
  headingRef,
  choice,
  onChoiceChange,
  imported,
  onImportedChange,
  editedAfterImport = false,
  onContinue,
}: {
  engine: EngineApi
  headingId: string
  headingRef: Ref<HTMLHeadingElement>
  choice: ImportChoice
  onChoiceChange: (next: ImportChoice) => void
  imported: ImportedCollectionState | null
  onImportedChange: (next: ImportedCollectionState | null) => void
  /** The mic setup was changed in the imported collection after it came in. */
  editedAfterImport?: boolean
  onContinue: () => void
}) {
  const [collections, setCollections] = useState<EngineObsCollection[] | null>(null)
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<unknown>(null)
  const [unavailable, setUnavailable] = useState(false)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [preview, setPreview] = useState<EngineImportPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<unknown>(null)

  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<unknown>(null)

  const [undoing, setUndoing] = useState(false)
  const [undoError, setUndoError] = useState<unknown>(null)
  const [confirmingUndo, setConfirmingUndo] = useState(false)
  const [undoneMessage, setUndoneMessage] = useState<string | null>(null)
  const listReqRef = useRef(0)
  const previewReqRef = useRef(0)

  const loadCollections = useCallback(
    async (src: 'obs' | 'streamlabs') => {
      const req = ++listReqRef.current
      previewReqRef.current += 1
      setListLoading(true)
      setListError(null)
      setUnavailable(false)
      setCollections(null)
      setSelectedId(null)
      setPreview(null)
      setPreviewError(null)
      setImportError(null)
      try {
        const list =
          src === 'obs' ? await engine.obsCollections() : await engine.streamlabsCollections()
        if (listReqRef.current !== req) return
        setCollections(list)
        if (list.length > 0) setSelectedId(list[0]!.id)
      } catch (e) {
        if (listReqRef.current !== req) return
        if (e instanceof ApiError && e.code === 'studio_unavailable') {
          setUnavailable(true)
        } else {
          setListError(e)
        }
      } finally {
        if (listReqRef.current === req) setListLoading(false)
      }
    },
    [engine],
  )

  const loadPreview = useCallback(
    async (src: 'obs' | 'streamlabs', id: string) => {
      const req = ++previewReqRef.current
      setPreviewLoading(true)
      setPreview(null)
      setPreviewError(null)
      setImportError(null)
      try {
        const data =
          src === 'obs' ? await engine.previewObs(id) : await engine.previewStreamlabs(id)
        if (previewReqRef.current !== req) return
        setPreview(data)
      } catch (e) {
        if (previewReqRef.current !== req) return
        setPreviewError(e)
      } finally {
        if (previewReqRef.current === req) setPreviewLoading(false)
      }
    },
    [engine],
  )

  useEffect(() => {
    if (choice === 'fresh' || imported) return
    void loadCollections(choice)
    const lists = listReqRef
    return () => {
      lists.current += 1
    }
  }, [choice, imported, loadCollections])

  useEffect(() => {
    if (choice === 'fresh' || imported || !selectedId) return
    void loadPreview(choice, selectedId)
    const previews = previewReqRef
    return () => {
      previews.current += 1
    }
  }, [choice, imported, selectedId, loadPreview])

  const pickChoice = (next: ImportChoice) => {
    setUndoneMessage(null)
    setUndoError(null)
    setImportError(null)
    onChoiceChange(next)
  }

  const runImport = async () => {
    if (choice === 'fresh' || !selectedId) return
    setImporting(true)
    setImportError(null)
    setUndoneMessage(null)
    try {
      const report =
        choice === 'obs'
          ? await engine.importObs(selectedId)
          : await engine.importStreamlabs(selectedId)
      onImportedChange({
        source: choice,
        report,
        previousId: report.previous_id ?? 'untitled',
      })
    } catch (e) {
      setImportError(e)
    } finally {
      setImporting(false)
    }
  }

  const undoImport = async () => {
    if (!imported) return
    setUndoing(true)
    setUndoError(null)
    const backTo = imported.previousId ?? 'untitled'
    try {
      await engine.switchShelf('collections', backTo)
    } catch (e) {
      setUndoError(e)
      setUndoing(false)
      return
    }
    try {
      if (imported.report.id && imported.report.id !== backTo) {
        await engine.removeShelf('collections', imported.report.id)
      }
      setUndoneMessage('Import undone. Restored your previous clean setup.')
    } catch {
      // Studio is back on the previous setup: the card must not still claim the import.
      setUndoneMessage(
        'Back on your previous setup, but the imported copy couldn’t be removed. You can remove it later in the Studio’s collections.',
      )
    }
    setConfirmingUndo(false)
    onImportedChange(null)
    onChoiceChange('fresh')
    setPreview(null)
    setSelectedId(null)
    setUndoing(false)
    // The card with the focused button is gone: focus goes to the step's heading.
    window.setTimeout(() => {
      document.getElementById(headingId)?.focus()
    }, 80)
  }

  const describedListError = listError ? describeError(listError) : null
  const describedPreviewError = previewError ? describeError(previewError) : null
  const describedImportError = importError ? describeError(importError) : null
  const describedUndoError = undoError ? describeError(undoError) : null

  const skippedItems = preview?.skipped ?? imported?.report.skipped ?? []
  const skippedTotal = preview?.skipped_total ?? imported?.report.skipped_total ?? 0
  const missingKinds = preview?.missing ?? imported?.report.missing ?? []
  const deviceResets = preview?.device_resets ?? imported?.report.device_resets ?? []

  return (
    <>
      <div>
        <h1
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className="font-display text-[28px] font-extrabold tracking-[-0.03em] text-balance focus:outline-none sm:text-[32px]"
        >
          Bring your scenes, or start fresh
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-text-2">
          Copy an existing scene collection into Ferrocast without changing your other app, or start
          with a blank canvas.
        </p>
      </div>

      {undoneMessage && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-2.5 rounded-[12px] border border-ok/40 bg-ok/10 px-4 py-3 text-[13.5px] text-text"
        >
          <CheckCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-ok" aria-hidden />
          <span>{undoneMessage}</span>
        </div>
      )}

      {imported ? (
        <div className="flex flex-col gap-4 rounded-[16px] border border-line-strong bg-surface-1 p-5">
          <span role="status" className="sr-only">
            Imported {imported.report.name}
          </span>
          <div className="flex items-start gap-3">
            <CheckCircle size={24} weight="fill" className="mt-0.5 shrink-0 text-ok" aria-hidden />
            <div className="min-w-0 flex-1">
              <h2 className="text-[18px] font-bold text-text break-words">
                Imported &ldquo;{imported.report.name}&rdquo;
              </h2>
              <p className="mt-1 text-[13.5px] leading-snug text-text-2">
                {imported.report.scenes} {imported.report.scenes === 1 ? 'scene' : 'scenes'} and{' '}
                {imported.report.sources} {imported.report.sources === 1 ? 'source' : 'sources'}{' '}
                added to Ferrocast. Original files were left untouched.
              </p>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <StatCell label="Scenes" value={String(imported.report.scenes)} />
            <StatCell label="Sources" value={String(imported.report.sources)} />
            <StatCell label="Web pages" value={String(imported.report.web_pages)} />
            <StatCell
              label="Skipped"
              value={String(Math.max(skippedTotal, missingKinds.length))}
              tone={skippedTotal > 0 || missingKinds.length > 0 ? 'warn' : 'ok'}
            />
          </dl>

          {deviceResets.length > 0 && (
            <div className="rounded-[12px] border border-line bg-surface-2 px-3.5 py-3 text-[13px] text-text-2">
              <p className="font-semibold text-text">Devices to pick in Studio</p>
              <ul className="mt-1.5 flex flex-col gap-1">
                {deviceResets.map((d, i) => (
                  <li key={`${d.name}-${i}`} className="break-words">
                    <span className="font-medium text-text">{d.name}</span>: {d.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(skippedItems.length > 0 || missingKinds.length > 0) && (
            <div className="rounded-[12px] border border-warn/40 bg-warn/10 px-3.5 py-3 text-[13px] text-text-2">
              <p className="font-semibold text-text">Left out during import</p>
              <ul className="mt-1.5 flex flex-col gap-1">
                {skippedItems.length > 0
                  ? skippedItems.map((s, i) => (
                      <li key={`${s.kind}-${i}`} className="break-words">
                        <span className="font-medium text-text">{s.name}</span> ({s.kind}):{' '}
                        {s.reason}
                      </li>
                    ))
                  : missingKinds.map((kind) => (
                      <li key={kind} className="break-words">
                        {kind} is not installed in Ferrocast.
                      </li>
                    ))}
              </ul>
            </div>
          )}

          {describedUndoError && (
            <div
              role="alert"
              className="rounded-[12px] border border-danger/40 bg-danger-soft px-3.5 py-2.5 text-[13px] text-text"
            >
              <p className="font-semibold">{describedUndoError.message}</p>
              {describedUndoError.hint && (
                <p className="mt-0.5 text-text-2">{describedUndoError.hint}</p>
              )}
            </div>
          )}

          {confirmingUndo && (
            <div
              role="alert"
              className="flex flex-col gap-2 rounded-[12px] border border-warn/40 bg-warn-soft px-3.5 py-3 text-[13px] text-text"
            >
              <p className="font-semibold">
                You changed your mic setup after importing. Undoing removes those changes too.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  busy={undoing}
                  onClick={() => void undoImport()}
                >
                  Undo and lose my changes
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={undoing}
                  onClick={() => setConfirmingUndo(false)}
                >
                  Keep the import
                </Button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button
              size="lg"
              variant="primary"
              onClick={onContinue}
              disabled={undoing}
              icon={<ArrowRight size={18} />}
              className="flex-row-reverse"
            >
              Continue to camera and mic check
            </Button>
            <Button
              size="lg"
              variant="secondary"
              busy={undoing}
              onClick={() => (editedAfterImport ? setConfirmingUndo(true) : void undoImport())}
              icon={<ArrowCounterClockwise size={17} />}
            >
              Undo and start over
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div
            role="radiogroup"
            aria-label="How to start your scenes"
            className="grid gap-2.5 sm:grid-cols-3"
          >
            <ChoiceCard
              name="import-source"
              checked={choice === 'obs'}
              onPick={() => pickChoice('obs')}
              disabled={importing}
              title="Import from OBS Studio"
              detail="Bring scenes, sources, browser overlays and filters from OBS."
            />
            <ChoiceCard
              name="import-source"
              checked={choice === 'streamlabs'}
              onPick={() => pickChoice('streamlabs')}
              disabled={importing}
              title="Import from Streamlabs"
              detail="Convert Streamlabs Desktop scenes and alert widgets."
            />
            <ChoiceCard
              name="import-source"
              checked={choice === 'fresh'}
              onPick={() => pickChoice('fresh')}
              disabled={importing}
              title="Start fresh"
              detail="Begin with an empty canvas and add sources in Studio."
            />
          </div>

          {choice === 'fresh' && (
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button
                size="lg"
                variant="primary"
                onClick={onContinue}
                icon={<ArrowRight size={18} />}
                className="flex-row-reverse"
              >
                Continue
              </Button>
            </div>
          )}

          {choice !== 'fresh' && (
            <div className="flex flex-col gap-4 rounded-[16px] border border-line bg-surface-1 p-4 sm:p-5">
              {listLoading && (
                <div
                  role="status"
                  aria-live="polite"
                  aria-busy="true"
                  className="flex flex-col gap-2.5"
                >
                  <p className="text-[13.5px] font-medium text-text-2">
                    Looking for {choice === 'obs' ? 'OBS Studio' : 'Streamlabs'} scene
                    collections...
                  </p>
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-28 w-full" />
                </div>
              )}

              {unavailable && (
                <div className="flex flex-col gap-3 rounded-[12px] border border-line bg-surface-2 p-4">
                  <div className="flex items-start gap-2.5">
                    <Info size={18} className="mt-0.5 shrink-0 text-accent-text" aria-hidden />
                    <div className="text-[13.5px] text-text-2">
                      <p className="font-semibold text-text">
                        Scene import runs inside the Ferrocast desktop app
                      </p>
                      <p className="mt-1">
                        You are in the browser view, so local OBS and Streamlabs files cannot be
                        read here. Start fresh now and import from the Studio bar anytime on your
                        PC.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    <Button
                      size="md"
                      variant="primary"
                      onClick={() => {
                        pickChoice('fresh')
                        onContinue()
                      }}
                    >
                      Start fresh instead
                    </Button>
                    <Button
                      size="md"
                      variant="ghost"
                      icon={<ArrowsClockwise size={15} />}
                      onClick={() => void loadCollections(choice)}
                    >
                      Try again
                    </Button>
                  </div>
                </div>
              )}

              {describedListError && (
                <div
                  role="alert"
                  className="flex flex-col gap-3 rounded-[12px] border border-danger/40 bg-danger-soft p-4"
                >
                  <div className="flex items-start gap-2.5">
                    <WarningCircle
                      size={18}
                      weight="bold"
                      className="mt-0.5 shrink-0 text-danger"
                      aria-hidden
                    />
                    <div className="text-[13.5px]">
                      <p className="font-semibold text-text">{describedListError.message}</p>
                      {describedListError.hint && (
                        <p className="mt-0.5 text-text-2">{describedListError.hint}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<ArrowsClockwise size={15} />}
                      onClick={() => void loadCollections(choice)}
                    >
                      Retry
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        pickChoice('fresh')
                        onContinue()
                      }}
                    >
                      Start fresh instead
                    </Button>
                  </div>
                </div>
              )}

              {!listLoading &&
                !unavailable &&
                !describedListError &&
                collections !== null &&
                collections.length === 0 && (
                  <div className="flex flex-col gap-3 rounded-[12px] border border-dashed border-line-strong bg-surface-2 p-4">
                    <div className="text-[13.5px]">
                      <p className="font-semibold text-text">
                        No {choice === 'obs' ? 'OBS Studio' : 'Streamlabs'} scene collections found
                      </p>
                      <p className="mt-1 text-text-2">
                        Make sure {choice === 'obs' ? 'OBS Studio' : 'Streamlabs Desktop'} has a
                        saved scene collection on this computer, try the other importer, or start
                        fresh.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2.5">
                      <Button
                        size="md"
                        variant="primary"
                        onClick={() => {
                          pickChoice('fresh')
                          onContinue()
                        }}
                      >
                        Start fresh instead
                      </Button>
                      <Button
                        size="md"
                        variant="ghost"
                        icon={<ArrowsClockwise size={15} />}
                        onClick={() => void loadCollections(choice)}
                      >
                        Scan again
                      </Button>
                    </div>
                  </div>
                )}

              {!listLoading && collections && collections.length > 0 && (
                <>
                  <div className="flex flex-col gap-2">
                    <span className="text-[13px] font-semibold text-text-2">
                      Pick a collection to preview ({collections.length} found)
                    </span>
                    <div
                      role="radiogroup"
                      aria-label="Available scene collections"
                      className="grid gap-2 sm:grid-cols-2"
                    >
                      {collections.map((c) => (
                        <ChoiceCard
                          key={c.id}
                          name="collection-pick"
                          checked={selectedId === c.id}
                          disabled={importing}
                          onPick={() => setSelectedId(c.id)}
                          title={c.name}
                          detail={`${c.scenes} ${c.scenes === 1 ? 'scene' : 'scenes'} · ${c.sources} ${c.sources === 1 ? 'source' : 'sources'}`}
                        />
                      ))}
                    </div>
                  </div>

                  {previewLoading && (
                    <div
                      role="status"
                      aria-live="polite"
                      aria-busy="true"
                      className="flex flex-col gap-2"
                    >
                      <p className="text-[13px] text-text-2">
                        Checking scenes, sources and filters...
                      </p>
                      <Skeleton className="h-24 w-full" />
                    </div>
                  )}

                  {describedPreviewError && (
                    <div
                      role="alert"
                      className="flex flex-col gap-3 rounded-[12px] border border-danger/40 bg-danger-soft p-4"
                    >
                      <div className="flex items-start gap-2.5">
                        <WarningCircle
                          size={18}
                          weight="bold"
                          className="mt-0.5 shrink-0 text-danger"
                          aria-hidden
                        />
                        <div className="text-[13.5px]">
                          <p className="font-semibold text-text">{describedPreviewError.message}</p>
                          {describedPreviewError.hint && (
                            <p className="mt-0.5 text-text-2">{describedPreviewError.hint}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2.5">
                        {selectedId && (
                          <Button
                            size="sm"
                            variant="secondary"
                            icon={<ArrowsClockwise size={15} />}
                            onClick={() => void loadPreview(choice, selectedId)}
                          >
                            Retry preview
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            pickChoice('fresh')
                            onContinue()
                          }}
                        >
                          Start fresh instead
                        </Button>
                      </div>
                    </div>
                  )}

                  {preview && !previewLoading && !describedPreviewError && (
                    <div className="flex flex-col gap-3.5 border-t border-line pt-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="text-[16px] font-bold text-text break-words">
                          Preview: {preview.name}
                        </h2>
                        <span className="rounded-full border border-line-strong bg-surface-2 px-2.5 py-0.5 text-[12px] font-medium text-text-2">
                          {preview.source === 'obs' ? 'OBS Studio' : 'Streamlabs'}
                        </span>
                      </div>

                      <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                        <StatCell label="Scenes" value={String(preview.scenes)} />
                        <StatCell label="Sources" value={String(preview.sources)} />
                        <StatCell
                          label="Adapted"
                          value={String(preview.web_pages + preview.device_resets.length)}
                        />
                        <StatCell
                          label="Cannot import"
                          value={String(preview.skipped_total)}
                          tone={preview.skipped_total > 0 ? 'warn' : 'ok'}
                        />
                      </dl>

                      {preview.scene_names.length > 0 && (
                        <div>
                          <p className="text-[12.5px] font-semibold text-text-2">Scenes</p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {preview.scene_names.map((scene) => (
                              <span
                                key={scene}
                                className="max-w-full truncate rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-[12.5px] text-text"
                              >
                                {scene}
                              </span>
                            ))}
                            {preview.truncated_scenes > 0 && (
                              <span className="rounded-full border border-line bg-surface-3 px-2.5 py-0.5 text-[12.5px] font-medium text-text-2">
                                +{preview.truncated_scenes} more
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {(preview.web_pages > 0 || preview.device_resets.length > 0) && (
                        <div className="rounded-[12px] border border-line bg-surface-2 px-3.5 py-3 text-[13px] text-text-2">
                          <p className="font-semibold text-text">What adapts for this computer</p>
                          <ul className="mt-1.5 flex flex-col gap-1">
                            {preview.web_pages > 0 && (
                              <li>
                                {preview.web_pages} browser{' '}
                                {preview.web_pages === 1 ? 'source' : 'sources'} convert to
                                Ferrocast Web pages.
                              </li>
                            )}
                            {preview.device_resets.map((d, i) => (
                              <li key={`${d.name}-${i}`} className="break-words">
                                <span className="font-medium text-text">{d.name}</span>: {d.reason}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {preview.skipped_total > 0 && (
                        <div className="rounded-[12px] border border-warn/40 bg-warn/10 px-3.5 py-3 text-[13px] text-text-2">
                          <p className="font-semibold text-text">
                            What cannot come across ({preview.skipped_total})
                          </p>
                          <ul className="mt-1.5 flex max-h-44 flex-col gap-1.5 overflow-y-auto pr-1">
                            {preview.skipped.map((item, idx) => (
                              <li key={`${item.kind}-${idx}`} className="break-words">
                                <span className="mr-1.5 inline-block rounded bg-surface-3 px-1.5 py-px text-[11px] font-semibold text-text">
                                  {SKIP_CATEGORY_LABEL[item.category] ?? 'Item'}
                                </span>
                                <span className="font-medium text-text">{item.name}</span>:{' '}
                                {item.reason}
                              </li>
                            ))}
                          </ul>
                          {preview.skipped_total > preview.skipped.length && (
                            <p className="mt-1.5 text-[12px] text-text-3">
                              Showing first {preview.skipped.length} of {preview.skipped_total}{' '}
                              items.
                            </p>
                          )}
                        </div>
                      )}

                      {importing && (
                        <div
                          role="status"
                          aria-live="polite"
                          className="flex flex-col gap-2 rounded-[12px] border border-accent-text/40 bg-surface-2 px-3.5 py-3"
                        >
                          <p className="text-[13.5px] font-semibold text-text">
                            Importing &ldquo;{preview.name}&rdquo;...
                          </p>
                          <div
                            role="progressbar"
                            aria-label="Importing scene collection"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            className="h-2 w-full overflow-hidden rounded-full bg-surface-3"
                          >
                            <div className="h-full w-2/3 animate-pulse rounded-full bg-btn-primary motion-reduce:animate-none" />
                          </div>
                        </div>
                      )}

                      {describedImportError && (
                        <div
                          role="alert"
                          className="rounded-[12px] border border-danger/40 bg-danger-soft px-3.5 py-3 text-[13px] text-text"
                        >
                          <p className="font-semibold">{describedImportError.message}</p>
                          {describedImportError.hint && (
                            <p className="mt-0.5 text-text-2">{describedImportError.hint}</p>
                          )}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-3 pt-1">
                        <Button
                          size="lg"
                          variant="primary"
                          busy={importing}
                          onClick={() => void runImport()}
                          icon={<ArrowRight size={18} />}
                          title={`Import “${preview.name}”`}
                          className="h-auto! max-w-full flex-row-reverse py-2.5! text-left whitespace-normal! break-words"
                        >
                          Import &ldquo;{preview.name}&rdquo;
                        </Button>
                        <Button
                          size="lg"
                          variant="ghost"
                          disabled={importing}
                          onClick={() => {
                            pickChoice('fresh')
                            onContinue()
                          }}
                        >
                          Start fresh instead
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
    </>
  )
}

function StatCell({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'warn' | 'ok' | undefined
}) {
  return (
    <div className="rounded-[10px] border border-line bg-surface-2 px-3 py-2">
      <dt className="text-[12px] font-medium text-text-3">{label}</dt>
      <dd
        className={cx(
          'mt-0.5 font-mono text-[18px] font-bold tabular-nums',
          tone === 'warn' ? 'text-warn' : tone === 'ok' ? 'text-ok' : 'text-text',
        )}
      >
        {value}
      </dd>
    </div>
  )
}
