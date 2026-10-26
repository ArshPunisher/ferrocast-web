import { useRef, useState } from 'react'
import { Package } from '@phosphor-icons/react'
import {
  EVENT_KEYS,
  EVENT_LABEL,
  baseLook,
  describeError,
  eventsFrom,
  type AlertLook,
  type Design,
  type EventKey,
} from '@ferrocast/api'
import { Button, Dialog, Select, toast } from '@ferrocast/ui'
import { keysFor, planPack, unzipPack, type PackRow, type Slot } from '../../lib/asset-pack'
import { useClient, useResource } from '../../lib/hooks'

const SLOT_LABEL = (s: Slot) =>
  s === 'screen'
    ? 'Screen (kept in your media library)'
    : s === 'library'
      ? 'Keep in media library'
      : s === 'skip'
        ? 'Leave out'
        : `${EVENT_LABEL[s]} alert`

const mb = (n: number) => `${(n / 1048576).toFixed(n > 10 * 1048576 ? 0 : 1)} MB`

/**
 * Asset pack importer: drop a zip (or the files) from a pack, check what we matched to each
 * alert by name, fix anything wrong, and build an alert design of your own from it.
 */
export function AssetPackDialog({
  open,
  onClose,
  onBuilt,
}: {
  open: boolean
  onClose: () => void
  onBuilt: (d: Design) => void
}) {
  const client = useClient()
  const designs = useResource((c) => c.designs('alert'), [open])
  const input = useRef<HTMLInputElement>(null)
  const [packName, setPackName] = useState('')
  const [rows, setRows] = useState<PackRow[]>([])
  const [skipped, setSkipped] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [base, setBase] = useState('builtin.molten-plate')
  const [busy, setBusy] = useState<string | null>(null)

  const read = async (files: File[]) => {
    setError(null)
    setRows([])
    setSkipped([])
    if (!files.length) return
    setBusy('read')
    try {
      const zip = files.length === 1 && /\.zip$/i.test(files[0]?.name ?? '') ? files[0] : null
      let list: { name: string; blob: Blob }[]
      if (zip) {
        if (zip.size > 400 * 1048576)
          throw new Error(`“${zip.name}” is ${mb(zip.size)}. Packs can be up to 400 MB zipped.`)
        try {
          list = unzipPack(new Uint8Array(await zip.arrayBuffer())).map((e) => ({
            name: e.name,
            blob: new Blob([e.data as unknown as BlobPart]),
          }))
        } catch (e) {
          // Our own size limits say so plainly; anything else is a damaged zip.
          if (e instanceof Error && /^The pack /.test(e.message)) throw e
          throw new Error(
            `“${zip.name}” couldn’t be opened as a zip. Download it again, or drop the files themselves.`,
            { cause: e },
          )
        }
        setPackName(zip.name.replace(/\.zip$/i, '').slice(0, 60))
      } else {
        list = files.map((f) => ({ name: f.name, blob: f }))
        setPackName((files[0]?.name.replace(/\.[^.]+$/, '') ?? 'Asset pack').slice(0, 40) + ' pack')
      }
      const plan = planPack(list)
      if (!plan.rows.length)
        throw new Error(
          'Nothing in there is a picture, video or sound Ferrocast plays (PNG, JPEG, GIF, WebP, WebM, MP4, MP3, OGG or WAV).',
        )
      setRows(plan.rows)
      setSkipped(plan.skipped)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const build = async () => {
    setBusy('build')
    setError(null)
    try {
      const from = designs.data?.find((d) => d.id === base)
      const events =
        from?.kind === 'alert' ? structuredClone(from.content.events) : eventsFrom(baseLook())
      const taken = new Set(
        rows.flatMap((r) =>
          r.slot !== 'library' && r.slot !== 'screen' && r.slot !== 'skip' ? [r.slot] : [],
        ),
      )
      let uploaded = 0
      for (const row of rows) {
        if (row.slot === 'skip') continue
        const up = async (f: PackRow['visual']) => {
          if (!f) return null
          const m = await client.upload(f.blob, f.name)
          uploaded += 1
          return m
        }
        const visual = await up(row.visual)
        const sound = await up(row.sound)
        if (row.slot === 'library' || row.slot === 'screen') continue
        for (const key of keysFor(row.slot, taken, EVENT_KEYS)) {
          const looks = events[key as EventKey]
          if (!looks) continue
          for (const v of looks.variations) {
            const patch: Partial<AlertLook> = {}
            if (visual)
              patch.media = { kind: visual.kind === 'video' ? 'video' : 'image', ref: visual.id }
            if (sound) patch.sound = { ...v.look.sound, ref: sound.id }
            v.look = { ...v.look, ...patch }
          }
        }
      }
      const name = packName.trim() || 'Asset pack'
      const design = await client.createDesign({
        schema: 1,
        id: 'new',
        kind: 'alert',
        name: name.slice(0, 60),
        description: `Built from ${name.slice(0, 120)}.`,
        tags: from?.tags ?? { style: 'bold', motion: 'smooth' },
        pro: false,
        built_in: false,
        branded: false,
        origin: { type: 'asset_pack', from: name.slice(0, 120) },
        content: { events },
        created_at: 0,
        updated_at: 0,
      })
      const alerts = rows.filter(
        (r) => r.slot !== 'library' && r.slot !== 'screen' && r.slot !== 'skip',
      ).length
      toast({
        tone: 'ok',
        message: `Built ${design.name}: ${alerts} ${alerts === 1 ? 'alert' : 'alerts'} from ${uploaded} ${uploaded === 1 ? 'file' : 'files'}.`,
      })
      setRows([])
      onBuilt(design)
    } catch (e) {
      const d = describeError(e)
      setError(d.hint ? `${d.message} ${d.hint}` : d.message)
    } finally {
      setBusy(null)
    }
  }

  const alertRows = rows.filter((r) => r.slot !== 'skip').length
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Import an asset pack"
      description="Drop the zip from a pack (or its files). We match pictures, videos and sounds to alerts by their names; fix anything we got wrong, then build."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            busy={busy === 'build'}
            disabled={!rows.length || alertRows === 0}
            onClick={() => void build()}
          >
            Build alerts
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <label
          className="flex cursor-pointer flex-col items-center gap-1.5 rounded-panel border border-dashed border-line-strong bg-surface-2 px-4 py-6 text-center hover:border-text-3"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            void read([...e.dataTransfer.files])
          }}
        >
          <Package size={28} className="text-accent-text" />
          <b className="text-sm text-text">
            {busy === 'read' ? 'Reading…' : rows.length ? packName : 'Drop a zip or files here'}
          </b>
          <span className="text-[13.5px] text-text-3">
            or choose them. PNG, JPEG, GIF, WebP, WebM, MP4, MP3, OGG, WAV.
          </span>
          <input
            ref={input}
            type="file"
            multiple
            accept=".zip,image/png,image/jpeg,image/gif,image/webp,video/webm,video/mp4,audio/mpeg,audio/ogg,audio/wav"
            className="sr-only"
            onChange={(e) => {
              void read([...(e.target.files ?? [])])
              e.target.value = ''
            }}
          />
        </label>
        {error && (
          <p role="alert" className="text-[14px] font-medium text-danger">
            {error}
          </p>
        )}
        {rows.length > 0 && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-[14px] font-medium text-text-2">
                Name
                <input
                  value={packName}
                  maxLength={60}
                  onChange={(e) => setPackName(e.target.value)}
                  className="h-10 rounded-control border border-line-strong bg-inset px-3 text-sm text-text focus:border-accent-text focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-[14px] font-medium text-text-2">
                Style to start from
                <Select value={base} onChange={(e) => setBase(e.target.value)}>
                  {(designs.data ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
            <div className="overflow-x-auto rounded-[12px] border border-line">
              <table className="w-full text-left text-[14px]">
                <caption className="sr-only">Files and what they become</caption>
                <thead className="bg-surface-2 text-[13px] text-text-3">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-semibold">
                      Files
                    </th>
                    <th scope="col" className="px-3 py-2 font-semibold">
                      Becomes
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const files = [r.visual, r.sound].filter(Boolean).map((f) => f?.name)
                    return (
                      <tr key={r.id} className="border-t border-line">
                        <td className="px-3 py-2 font-mono text-[13px] break-all text-text-2">
                          {files.join(' + ')}
                        </td>
                        <td className="px-3 py-2">
                          <Select
                            aria-label={`Use ${files.join(' and ')} as`}
                            value={r.slot}
                            onChange={(e) =>
                              setRows((prev) =>
                                prev.map((x) =>
                                  x.id === r.id ? { ...x, slot: e.target.value as Slot } : x,
                                ),
                              )
                            }
                            className="h-9 min-w-[200px]"
                          >
                            {[...EVENT_KEYS, 'screen', 'library', 'skip'].map((s) => (
                              <option key={s} value={s}>
                                {SLOT_LABEL(s as Slot)}
                              </option>
                            ))}
                          </Select>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {skipped.length > 0 && (
              <details className="text-[13.5px] text-text-3">
                <summary className="cursor-pointer">{skipped.length} left out</summary>
                <ul className="mt-1 list-disc pl-5">
                  {skipped.slice(0, 50).map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </details>
            )}
            <p className="text-[13.5px] text-text-3">
              Files from a paid pack stay on this computer. Check the pack’s licence before you
              share a design made from it.
            </p>
          </>
        )}
      </div>
    </Dialog>
  )
}
