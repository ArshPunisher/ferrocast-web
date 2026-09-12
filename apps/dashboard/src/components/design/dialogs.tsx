// Gallery dialogs: Use (themes, scenes and widgets need a target), importing a .ferrodesign,
// exporting one, and Find in OBS.

import { useRef, useState } from 'react'
import { DownloadSimple, FileArrowUp, MonitorPlay } from '@phosphor-icons/react'
import { SCENE_LABEL, describeError, type Design, type DesignImportReport } from '@ferrocast/api'
import { Button, Dialog, Field, Select, Switch, toast } from '@ferrocast/ui'
import { useAction, useClient, useResource } from '../../lib/hooks'
import { go, href } from '../../lib/router'

/** Saves a blob through a temporary link (the desktop window and browsers both handle it). */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function fileName(d: Design): string {
  return `${d.name.replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'design'}.ferrodesign`
}

/** "Use" for designs that need a target: a theme, a scene, or a widget design. */
export function UseDialog({ design, onClose }: { design: Design | null; onClose: () => void }) {
  const client = useClient()
  const { run, busy } = useAction()
  const overlays = useResource((c) => c.overlays(), [design?.id])
  const [target, setTarget] = useState<'new' | string>('new')
  const [scene, setScene] = useState('')
  const [alertStyle, setAlertStyle] = useState(true)
  if (!design || design.kind === 'alert') return null
  const theme = design.kind === 'theme' ? design : null
  const list = overlays.data ?? []
  const needsOverlay = design.kind === 'widget'
  const pickedScene = theme ? scene || theme.content.scenes[0]?.key || '' : ''
  const submit = () =>
    void run(
      'use',
      () =>
        client.useDesign(design.id, {
          ...(target !== 'new' ? { overlay_id: target } : {}),
          ...(theme && target !== 'new' ? { scenes: [pickedScene] } : {}),
          ...(theme ? { alert_style: alertStyle } : {}),
        }),
      {
        success: (r) =>
          design.kind === 'widget'
            ? `${design.name} added to ${r.overlays[0]?.name ?? 'the overlay'}.`
            : r.overlays.length > 1
              ? `Made ${r.overlays.length} overlays from ${design.name}. Add each to its OBS scene.`
              : `${r.overlays[0]?.name ?? 'The overlay'} now shows ${design.name}.`,
      },
    ).then((r) => {
      if (!r) return
      onClose()
      const first = r.overlays[0]
      if (first)
        go(r.overlays.length > 1 ? { name: 'overlays' } : { name: 'overlay', id: first.id })
    })
  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={`Use ${design.name}`}
      description={
        needsOverlay
          ? 'Adds this widget, styled, to an overlay. Move it where you want in the layout editor.'
          : theme
            ? 'Each scene becomes an overlay: one browser source per OBS scene. Or put one scene on an overlay you already use; its URL stays the same.'
            : 'Makes a new overlay from this scene, or replaces the layout of one you already use (its URL stays the same, so OBS keeps working).'
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            busy={busy === 'use'}
            disabled={needsOverlay && target === 'new'}
            onClick={submit}
          >
            {needsOverlay
              ? 'Add widget'
              : target === 'new'
                ? theme
                  ? `Make ${theme.content.scenes.length} overlays`
                  : 'Make the overlay'
                : 'Replace the layout'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={needsOverlay ? 'Add it to' : 'Put it on'}>
          {(p) => (
            <Select {...p} value={target} onChange={(e) => setTarget(e.target.value)}>
              {!needsOverlay && (
                <option value="new">
                  {theme ? 'New overlays, one per scene' : 'A new overlay'}
                </option>
              )}
              {needsOverlay && <option value="new">Choose an overlay…</option>}
              {list.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {theme && target !== 'new' && (
          <Field label="Scene">
            {(p) => (
              <Select {...p} value={pickedScene} onChange={(e) => setScene(e.target.value)}>
                {theme.content.scenes.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.name || SCENE_LABEL[s.key] || s.key}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        {theme?.content.alert_design && (
          <Switch
            checked={alertStyle}
            onChange={setAlertStyle}
            label="Also use its alert style"
            description="Your alerts switch to the look made for this theme."
          />
        )}
        {target !== 'new' && !needsOverlay && (
          <p className="text-[13px] text-warn">
            The overlay’s current widgets are replaced. You can undo it by using your old design
            again.
          </p>
        )}
      </div>
    </Dialog>
  )
}

/** Imports a .ferrodesign as new designs of your own. */
export function ImportDesignDialog({
  open,
  onClose,
  onImported,
}: {
  open: boolean
  onClose: () => void
  onImported: (r: DesignImportReport) => void
}) {
  const client = useClient()
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const pick = (f: File | undefined) => {
    setError(null)
    setFile(null)
    if (!f) return
    if (!/\.ferrodesign$/i.test(f.name)) {
      setError(`“${f.name}” isn’t a .ferrodesign file. Pick a design file exported from Ferrocast.`)
      return
    }
    if (f.size > 100 * 1024 * 1024) {
      setError(
        `“${f.name}” is ${Math.round(f.size / 1048576)} MB. Design files can be up to 100 MB.`,
      )
      return
    }
    setFile(f)
  }
  const submit = () => {
    if (!file) {
      setError('Choose a .ferrodesign file first.')
      return
    }
    setBusy(true)
    client
      .importDesign(file, file.name)
      .then((r) => {
        toast({
          tone: 'ok',
          message: `Imported ${r.designs.map((d) => d.name).join(', ')} to My designs.`,
          ...(r.notes.length ? { hint: r.notes.join(' ') } : {}),
        })
        setFile(null)
        onImported(r)
      })
      .catch((e: unknown) => {
        const d = describeError(e)
        setError(d.hint ? `${d.message} ${d.hint}` : d.message)
      })
      .finally(() => setBusy(false))
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title="Import a design file"
      description="It comes in as a new design in My designs. It never replaces anything, and design files can’t carry scripts."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon={<FileArrowUp size={15} />} busy={busy} onClick={submit}>
            Import
          </Button>
        </>
      }
    >
      <label
        className="flex cursor-pointer flex-col items-center gap-1.5 rounded-panel border border-dashed border-line-strong bg-surface-2 px-4 py-6 text-center hover:border-text-3"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          pick(e.dataTransfer.files[0])
        }}
      >
        <FileArrowUp size={28} className="text-accent-text" />
        <b className="text-sm text-text">{file ? file.name : 'Drop a .ferrodesign file here'}</b>
        <span className="text-[12.5px] text-text-3">or choose one. Up to 100 MB.</span>
        <input
          ref={input}
          type="file"
          accept=".ferrodesign,application/zip"
          className="sr-only"
          onChange={(e) => {
            pick(e.target.files?.[0])
            // Picking the same file again after an error must fire change again.
            e.target.value = ''
          }}
        />
      </label>
      {error && (
        <p role="alert" className="mt-3 text-[13px] font-medium text-danger">
          {error}
        </p>
      )}
    </Dialog>
  )
}

/** Exports one of your designs as a .ferrodesign file. */
export function useExport() {
  const client = useClient()
  const { run, busy } = useAction()
  const exportDesign = (d: Design) =>
    void run('export', () => client.exportDesign(d.id), {
      success: `Saved ${fileName(d)}. Anyone with Ferrocast can import it as their own design.`,
    }).then((blob) => {
      if (blob) downloadBlob(blob, fileName(d))
    })
  return { exportDesign, busy: busy === 'export' }
}

/** Find in OBS: an honest pointer while replacing widgets in OBS is still to come. */
export function FindInObsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title="Find old widgets in OBS"
      description="Spotting StreamElements and Streamlabs browser sources in your OBS scenes and swapping them in place is coming in a later version."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <a
            href={href({ name: 'overlays' })}
            onClick={onClose}
            className="fc-press inline-flex h-10 items-center gap-2 rounded-control bg-btn-primary px-4 text-sm font-semibold text-on-btn-primary hover:bg-btn-primary-hover"
          >
            <MonitorPlay size={16} />
            Open overlays
          </a>
        </>
      }
    >
      <p className="text-sm text-text-2">
        Today: pick a design, press Use, then Add to OBS on the overlay it made. Ferrocast adds the
        browser source to your current scene in one click. Remove the old widget source in OBS when
        you’re happy.
      </p>
    </Dialog>
  )
}

export function ExportButton({ design }: { design: Design }) {
  const { exportDesign, busy } = useExport()
  return (
    <Button
      size="sm"
      variant="secondary"
      icon={<DownloadSimple size={14} />}
      busy={busy}
      onClick={() => exportDesign(design)}
    >
      Export
    </Button>
  )
}
