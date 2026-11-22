import { useEffect, useRef, useState } from 'react'
import {
  ArrowCounterClockwise,
  CheckCircle,
  Package,
  TextAa,
  UploadSimple,
  WarningCircle,
} from '@phosphor-icons/react'
import {
  describeError,
  type FontStatus,
  type OverlayPackFormat,
  type OverlayPackImportReport,
  type OverlayPackPreview,
} from '@ferrocast/api'
import { Button, Dialog, Field, Input, Switch, cx, toast } from '@ferrocast/ui'
import { useDesk } from './common'

const MAX_PACK_BYTES = 150 * 1024 * 1024

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatLabel(format: OverlayPackFormat): string {
  if (format === 'streamlabs') return 'Streamlabs .overlay'
  if (format === 'own3d') return 'OWN3D .overlay'
  return 'OBS pack'
}

/**
 * `skipped`: the Google Fonts fetch is off, or the import is done: a font still 'missing' then
 * was not fetched, and the picture will use a fallback (it won't be fetched "later").
 */
function fontStatusBadge(status: FontStatus, skipped = false): { label: string; tone: string } {
  switch (status) {
    case 'installed':
      return { label: 'Installed on PC', tone: 'bg-surface-3 text-text-2' }
    case 'bundled':
      return { label: 'Included in pack', tone: 'bg-arc/15 text-arc-text' }
    case 'cached':
      return { label: 'In Ferrocast cache', tone: 'bg-arc/15 text-arc-text' }
    case 'downloaded':
      return { label: 'Downloaded (Google Fonts)', tone: 'bg-arc/15 text-arc-text' }
    case 'missing':
      return skipped
        ? { label: 'Skipped (fallback font)', tone: 'bg-warn/15 text-warn-text' }
        : { label: 'Will fetch from Google Fonts', tone: 'bg-molten/15 text-molten-text' }
    case 'not_found':
      return { label: 'Not on Google Fonts (fallback)', tone: 'bg-warn/15 text-warn-text' }
    case 'offline_fallback':
      return { label: 'Offline (using fallback font)', tone: 'bg-warn/15 text-warn-text' }
  }
}

type Step =
  | { kind: 'pick' }
  | { kind: 'preview'; preview: OverlayPackPreview; fileName: string }
  | { kind: 'result'; report: OverlayPackImportReport; undone: boolean }

export function ImportOverlayPackDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { api, refresh, bumpLibrary } = useDesk()
  const fileRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>({ kind: 'pick' })
  const [packName, setPackName] = useState('')
  const [createOverlays, setCreateOverlays] = useState(true)
  const [fetchFonts, setFetchFonts] = useState(true)
  const [busy, setBusy] = useState<'preview' | 'import' | 'undo' | null>(null)
  const [error, setError] = useState<{ message: string; hint: string | null } | null>(null)

  useEffect(() => {
    if (!open) return
    setStep({ kind: 'pick' })
    setPackName('')
    setCreateOverlays(true)
    setFetchFonts(true)
    setBusy(null)
    setError(null)
  }, [open])

  const handleFile = async (file: File) => {
    // One at a time: a second file dropped while one is being read would race it.
    if (busy !== null) return
    setError(null)
    if (file.size === 0) {
      setError({ message: 'That file is empty.', hint: 'Pick a valid .overlay theme pack zip.' })
      return
    }
    if (file.size > MAX_PACK_BYTES) {
      setError({
        message: `"${file.name}" is ${formatBytes(file.size)}. Theme packs can be up to 150 MB.`,
        hint: 'Remove large videos from the archive and try again.',
      })
      return
    }
    setBusy('preview')
    try {
      const preview = await api.previewOverlayPack(file, file.name)
      setPackName(preview.suggested_name)
      setStep({ kind: 'preview', preview, fileName: file.name })
    } catch (e) {
      const d = describeError(e)
      setError({ message: d.message, hint: d.hint })
    } finally {
      setBusy(null)
    }
  }

  const trimmedName = packName.trim()
  const nameInvalid =
    step.kind === 'preview' && (!trimmedName || [...trimmedName].length > 100)
      ? 'Name must be 1 to 100 characters.'
      : null

  const runImport = async () => {
    if (step.kind !== 'preview' || nameInvalid) return
    setError(null)
    setBusy('import')
    try {
      const report = await api.importOverlayPack({
        preview_id: step.preview.preview_id,
        name: trimmedName,
        create_overlays: createOverlays,
        fetch_fonts: fetchFonts,
      })
      refresh()
      bumpLibrary()
      setStep({ kind: 'result', report, undone: false })
    } catch (e) {
      const d = describeError(e)
      setError({ message: d.message, hint: d.hint })
    } finally {
      setBusy(null)
    }
  }

  const runUndo = async () => {
    if (step.kind !== 'result' || step.undone) return
    setError(null)
    setBusy('undo')
    try {
      const undone = await api.undoOverlayPack(step.report.undo_token)
      refresh()
      bumpLibrary()
      setStep({ kind: 'result', report: step.report, undone: true })
      toast({
        tone: 'info',
        message: `Undid "${undone.removed_collection_name}" import and restored your previous scenes.`,
      })
    } catch (e) {
      const d = describeError(e)
      setError({ message: d.message, hint: d.hint })
    } finally {
      setBusy(null)
    }
  }

  const title =
    step.kind === 'pick'
      ? 'Import a theme pack'
      : step.kind === 'preview'
        ? 'Review theme pack'
        : step.undone
          ? 'Theme pack undone'
          : 'Theme pack imported'

  const footer =
    step.kind === 'pick' ? (
      <Button variant="outline" onClick={onClose} disabled={busy !== null}>
        Cancel
      </Button>
    ) : step.kind === 'preview' ? (
      <>
        <Button
          variant="outline"
          onClick={() => {
            setError(null)
            setStep({ kind: 'pick' })
          }}
          disabled={busy !== null}
        >
          Choose another file
        </Button>
        <Button
          variant="primary"
          busy={busy === 'import'}
          disabled={busy !== null || nameInvalid !== null}
          onClick={() => void runImport()}
        >
          Import theme pack
        </Button>
      </>
    ) : (
      <>
        {!step.undone && (
          <Button
            variant="outline"
            icon={<ArrowCounterClockwise size={15} aria-hidden="true" />}
            busy={busy === 'undo'}
            disabled={busy !== null}
            onClick={() => void runUndo()}
          >
            Undo import
          </Button>
        )}
        <Button variant="primary" disabled={busy !== null} onClick={onClose}>
          Done
        </Button>
      </>
    )

  return (
    <Dialog
      open={open}
      // Not while a request is on its way: closing then reopening would let its answer land on a
      // fresh dialog.
      onClose={() => {
        if (busy === null) onClose()
      }}
      title={title}
      size="md"
      compact
      footer={footer}
    >
      <div className="flex flex-col gap-3">
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-[7px] border border-danger/35 bg-danger-soft px-3 py-2.5 text-[13px] text-text"
          >
            <WarningCircle size={17} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-semibold text-text">{error.message}</p>
              {error.hint && <p className="mt-0.5 text-text-2">{error.hint}</p>}
            </div>
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept=".overlay,.zip,application/zip"
          aria-label="Choose .overlay theme pack file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) void handleFile(f)
          }}
        />

        {step.kind === 'pick' && (
          <div className="flex flex-col gap-3">
            <button
              type="button"
              data-autofocus
              disabled={busy === 'preview'}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const f = e.dataTransfer.files[0]
                if (f) void handleFile(f)
              }}
              className={cx(
                'fc-press flex min-h-36 w-full flex-col items-center justify-center gap-2 rounded-[8px] border border-dashed border-line-strong bg-surface-2 px-4 py-6 text-center transition-colors',
                'hover:border-accent-text hover:bg-surface-3 focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none',
              )}
            >
              <span className="inline-flex size-10 items-center justify-center rounded-full bg-surface-3 text-accent-text">
                {busy === 'preview' ? (
                  <span className="fc-busy" aria-hidden="true" />
                ) : (
                  <Package size={20} aria-hidden="true" />
                )}
              </span>
              <span className="text-[14px] font-semibold text-text">
                {busy === 'preview' ? 'Inspecting theme pack...' : 'Choose a .overlay file'}
              </span>
              <span className="max-w-sm text-[12.5px] leading-relaxed text-text-2">
                Works with Streamlabs and OWN3D .overlay archives up to 150 MB. Nothing is changed
                until you review the preview.
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-[6px] border border-line bg-surface-1 px-3 py-1.5 text-[12.5px] font-semibold text-text">
                <UploadSimple size={14} aria-hidden="true" /> Browse files
              </span>
            </button>

            <div className="rounded-[7px] border border-line bg-surface-2 px-3 py-2.5 text-[12.5px] leading-relaxed text-text-2">
              <p className="font-semibold text-text">Safe unpack and local fonts</p>
              <p className="mt-0.5">
                Ferrocast validates every archive entry, allows only media, fonts, and JSON files,
                and fetches missing fonts only from Google Fonts into Ferrocast&apos;s own font
                folder (never system-wide).
              </p>
            </div>
          </div>
        )}

        {step.kind === 'preview' && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-[7px] border border-line bg-surface-2 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-text">{step.fileName}</p>
                <p className="text-[12px] text-text-2">
                  {step.preview.canvas.width}x{step.preview.canvas.height} canvas
                </p>
              </div>
              <span className="rounded-full bg-surface-3 px-2.5 py-0.5 text-[11.5px] font-semibold text-text-2">
                {formatLabel(step.preview.format)}
              </span>
            </div>

            <Field label="Scene collection name" error={nameInvalid} hintVisible>
              {(props) => (
                <Input
                  {...props}
                  data-autofocus
                  maxLength={100}
                  value={packName}
                  onChange={(e) => setPackName(e.target.value)}
                />
              )}
            </Field>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatTile label="Scenes" value={String(step.preview.scene_count)} />
              <StatTile label="Sources" value={String(step.preview.source_count)} />
              <StatTile
                label="Widgets"
                value={String(step.preview.widgets.filter((w) => w.supported).length)}
              />
              <StatTile
                label="Media"
                value={`${step.preview.media_files} (${formatBytes(step.preview.media_bytes)})`}
              />
            </div>

            <section
              aria-label="Scenes in pack"
              className="rounded-[7px] border border-line bg-surface-2 p-2.5"
            >
              <h3 className="mb-1.5 text-[12px] font-semibold tracking-wide text-text-2 uppercase">
                Scenes ({step.preview.scenes.length})
              </h3>
              <ul className="flex max-h-32 flex-col gap-1 overflow-y-auto text-[12.5px]">
                {step.preview.scenes.map((sc) => (
                  <li
                    key={sc.name}
                    className="flex items-center justify-between gap-2 rounded-[5px] bg-surface-1 px-2.5 py-1.5"
                  >
                    <span className="min-w-0 truncate font-medium text-text">{sc.name}</span>
                    <span className="shrink-0 tabular-nums text-[12px] text-text-2">
                      {sc.mapped} ready
                      {sc.widgets > 0
                        ? `, ${sc.widgets} ${sc.widgets === 1 ? 'widget' : 'widgets'}`
                        : ''}
                      {sc.unknown > 0 ? `, ${sc.unknown} skipped` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            {step.preview.widgets.length > 0 && (
              <section
                aria-label="Widgets in pack"
                className="rounded-[7px] border border-line bg-surface-2 p-2.5"
              >
                <h3 className="mb-1.5 text-[12px] font-semibold tracking-wide text-text-2 uppercase">
                  Overlay widgets ({step.preview.widgets.length})
                </h3>
                <ul className="flex max-h-32 flex-col gap-1 overflow-y-auto text-[12.5px]">
                  {step.preview.widgets.map((w, idx) => (
                    <li
                      key={`${w.scene}-${w.name}-${idx}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-[5px] bg-surface-1 px-2.5 py-1.5"
                    >
                      <span className="min-w-0 truncate text-text">
                        <strong className="font-semibold">{w.name}</strong>{' '}
                        <span className="text-text-2">({w.scene})</span>
                      </span>
                      <span
                        className={cx(
                          'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                          w.supported ? 'bg-arc/15 text-arc-text' : 'bg-warn/15 text-warn-text',
                        )}
                      >
                        {w.overlay_widget_name}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 border-t border-line pt-2">
                  <Switch
                    checked={createOverlays}
                    onChange={setCreateOverlays}
                    label="Build Ferrocast overlays for mapped widgets"
                  />
                </div>
              </section>
            )}

            {step.preview.fonts.length > 0 && (
              <section
                aria-label="Fonts used"
                className="rounded-[7px] border border-line bg-surface-2 p-2.5"
              >
                <h3 className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold tracking-wide text-text-2 uppercase">
                  <TextAa size={14} aria-hidden="true" /> Fonts ({step.preview.fonts.length})
                </h3>
                <ul className="flex max-h-32 flex-col gap-1 overflow-y-auto text-[12.5px]">
                  {step.preview.fonts.map((f) => {
                    const badge = fontStatusBadge(f.status, !fetchFonts)
                    return (
                      <li
                        key={`${f.family}-${f.style}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-[5px] bg-surface-1 px-2.5 py-1.5"
                      >
                        <span className="min-w-0 truncate font-medium text-text">
                          {f.family} <span className="font-normal text-text-2">({f.style})</span>
                        </span>
                        <span
                          className={cx(
                            'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                            badge.tone,
                          )}
                        >
                          {badge.label}
                        </span>
                      </li>
                    )
                  })}
                </ul>
                <div className="mt-2 border-t border-line pt-2">
                  <Switch
                    checked={fetchFonts}
                    onChange={setFetchFonts}
                    label="Fetch missing fonts from Google Fonts into Ferrocast only"
                  />
                </div>
              </section>
            )}

            {(step.preview.unknown_sources.length > 0 ||
              step.preview.missing_assets.length > 0) && (
              <div className="rounded-[7px] border border-warn/35 bg-warn-soft px-3 py-2 text-[12.5px] text-text">
                <p className="font-semibold">
                  Reported and skipped (
                  {step.preview.unknown_sources.length + step.preview.missing_assets.length})
                </p>
                <ul className="mt-1 flex flex-col gap-0.5 text-text-2">
                  {step.preview.unknown_sources.map((u, idx) => (
                    <li key={`${u.scene}-${u.name}-${idx}`} className="break-words">
                      <span className="font-medium text-text">{u.name}</span> ({u.kind}): {u.reason}
                    </li>
                  ))}
                  {step.preview.missing_assets.map((m) => (
                    <li key={m} className="break-all">
                      Missing media asset inside zip:{' '}
                      <span className="font-medium text-text">{m}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {step.kind === 'result' && (
          <div className="flex flex-col gap-3">
            <div
              role="status"
              className={cx(
                'flex items-start gap-2.5 rounded-[7px] border px-3 py-2.5 text-[13px]',
                step.undone
                  ? 'border-line bg-surface-2 text-text'
                  : 'border-arc/35 bg-arc/10 text-text',
              )}
            >
              <CheckCircle size={18} className="mt-0.5 shrink-0 text-arc-text" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-semibold">
                  {step.undone
                    ? `Removed "${step.report.name}" and switched back.`
                    : `Imported "${step.report.name}" and switched Studio to it.`}
                </p>
                {!step.undone && (
                  <p className="mt-0.5 text-[12.5px] text-text-2">
                    {step.report.scenes} {step.report.scenes === 1 ? 'scene' : 'scenes'},{' '}
                    {step.report.media_copied}{' '}
                    {step.report.media_copied === 1 ? 'media file' : 'media files'} copied (
                    {formatBytes(step.report.media_bytes)}), {step.report.overlays_created.length}{' '}
                    Ferrocast {step.report.overlays_created.length === 1 ? 'overlay' : 'overlays'}{' '}
                    created.
                  </p>
                )}
              </div>
            </div>

            {!step.undone && step.report.offline_font_fallback && (
              <div
                role="status"
                className="rounded-[7px] border border-warn/35 bg-warn-soft px-3 py-2 text-[12.5px] text-text"
              >
                <p className="font-semibold">Offline font fallback used</p>
                <p className="mt-0.5 text-text-2">
                  Google Fonts could not be reached right now. Studio will use fallback system fonts
                  until you import while online.
                </p>
              </div>
            )}

            {!step.undone && step.report.overlays_created.length > 0 && (
              <section
                aria-label="Created overlays"
                className="rounded-[7px] border border-line bg-surface-2 p-2.5"
              >
                <h3 className="mb-1.5 text-[12px] font-semibold tracking-wide text-text-2 uppercase">
                  Ferrocast overlays added
                </h3>
                <ul className="flex flex-col gap-1 text-[12.5px]">
                  {step.report.overlays_created.map((ov) => (
                    <li key={ov.id} className="rounded-[5px] bg-surface-1 px-2.5 py-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-text">{ov.name}</span>
                        <span className="text-[11.5px] text-text-2">
                          {ov.widget_kinds.join(', ')}
                        </span>
                      </div>
                      <p className="mt-0.5 break-all font-mono text-[11px] text-text-2">{ov.url}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {!step.undone && step.report.fonts.length > 0 && (
              <section
                aria-label="Font results"
                className="rounded-[7px] border border-line bg-surface-2 p-2.5"
              >
                <h3 className="mb-1.5 text-[12px] font-semibold tracking-wide text-text-2 uppercase">
                  Fonts resolved
                </h3>
                <ul className="flex flex-col gap-1 text-[12.5px]">
                  {step.report.fonts.map((f) => {
                    const badge = fontStatusBadge(f.status, true)
                    return (
                      <li
                        key={`${f.family}-${f.style}`}
                        className="flex flex-col gap-0.5 rounded-[5px] bg-surface-1 px-2.5 py-1.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium text-text">{f.family}</span>
                          <span
                            className={cx(
                              'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                              badge.tone,
                            )}
                          >
                            {badge.label}
                          </span>
                        </div>
                        {f.message && <p className="text-[11.5px] text-text-2">{f.message}</p>}
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </Dialog>
  )
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-[7px] border border-line bg-surface-2 px-2.5 py-2">
      <div className="text-[11px] font-medium text-text-2">{label}</div>
      <div className="mt-0.5 truncate text-[13px] font-semibold tabular-nums text-text">
        {value}
      </div>
    </div>
  )
}
