// OBS's Missing Files: files sources, filters and transitions use that aren't on this
// computer (moved, renamed, or a collection from another computer). Pick each again, clear
// it, or search a folder: everything found there by name is fixed in one go.

import { useState } from 'react'
import { FolderOpen, WarningCircle } from '@phosphor-icons/react'
import { describeError, type EngineMissingFile } from '@ferrocast/api'
import { Button, Dialog, Skeleton, toast } from '@ferrocast/ui'
import { LoadError } from '../../Panel'
import { inDesktopApp } from '../../../lib/external'
import { useResource } from '../../../lib/hooks'
import { useDesk } from './common'

/** Who uses a missing file, in words. */
export function ownerText(m: EngineMissingFile): string {
  if (!m.source) return `${m.kind.replace(/^obs_|_transition$/g, '').replace(/_/g, ' ')} transition`
  return m.parent ? `${m.source} on ${m.parent}` : m.source
}

/** The file's own name, for a short line. */
export function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path
}

/** The notice in the Studio when files are missing, and the dialog to fix them. */
export function MissingFiles() {
  const { api, scenes } = useDesk()
  const [open, setOpen] = useState(false)
  // Checked when the Studio opens and whenever the scenes change (a collection switch).
  const sceneKey = scenes.data?.scenes.map((s) => s.name).join('\n') ?? ''
  const list = useResource(() => api.missingFiles(), [api, sceneKey])
  const n = list.data?.length ?? 0
  if (n === 0 && !open) return null
  return (
    <>
      {n > 0 && (
        <div
          role="status"
          className="mb-3 flex flex-wrap items-center gap-2 rounded-control border border-warn/40 bg-warn-soft px-3.5 py-2 text-[14.5px]"
        >
          <WarningCircle size={18} weight="fill" className="text-warn" aria-hidden />
          <span className="flex-1">
            {n === 1 ? '1 file a source uses is missing.' : `${n} files sources use are missing.`}
          </span>
          <Button size="sm" onClick={() => setOpen(true)}>
            Find them
          </Button>
        </div>
      )}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title="Missing files"
        description="Moved or renamed since the scenes were made. Pick each again, or search a folder."
      >
        <Fixer list={list} onDone={() => setOpen(false)} />
      </Dialog>
    </>
  )
}

function Fixer({
  list,
  onDone,
}: {
  list: ReturnType<typeof useResource<EngineMissingFile[]>>
  onDone: () => void
}) {
  const { api, refresh } = useDesk()
  const [busy, setBusy] = useState<string | null>(null)
  const desktop = inDesktopApp()
  const act = async (key: string, f: () => Promise<unknown>, ok?: string) => {
    setBusy(key)
    try {
      await f()
      if (ok) toast({ tone: 'ok', message: ok })
      list.reload()
      refresh()
    } catch (e) {
      const d = describeError(e)
      toast({ tone: 'error', message: d.message, ...(d.hint ? { hint: d.hint } : {}) })
    } finally {
      setBusy(null)
    }
  }
  const pick = (m: EngineMissingFile) =>
    act(`pick:${m.source}:${m.path}`, async () => {
      const got = await api.pickFile('file')
      if (got.path) await api.replaceFile(m, got.path)
    })
  const search = () =>
    act('search', async () => {
      const got = await api.pickFile('folder')
      if (!got.path) return
      const { found } = await api.findMissing(got.path)
      const fixes = (list.data ?? []).filter((m) => found[m.path])
      for (const m of fixes) await api.replaceFile(m, found[m.path] as string)
      toast({
        tone: fixes.length ? 'ok' : 'warn',
        message: fixes.length
          ? `Found ${fixes.length} of ${list.data?.length ?? 0}.`
          : 'None of them are in that folder.',
      })
    })
  if (list.error && !list.data) return <LoadError error={list.error} onRetry={list.reload} />
  if (!list.data) return <Skeleton className="h-32" />
  if (list.data.length === 0)
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="m-0 text-[14.5px] text-text-2">Every file is where it should be.</p>
        <Button onClick={onDone}>Close</Button>
      </div>
    )
  return (
    <div className="flex flex-col gap-3">
      {desktop && (
        <Button className="self-start" busy={busy === 'search'} onClick={() => void search()}>
          <FolderOpen size={16} weight="bold" /> Search a folder
        </Button>
      )}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {list.data.map((m) => (
          <li
            key={`${m.parent ?? ''}/${m.source}/${m.key}/${m.path}`}
            className="flex flex-col gap-2 rounded-[10px] border border-line p-3 sm:flex-row sm:items-center"
          >
            <div className="min-w-0 flex-1">
              <b className="block truncate text-[14.5px]">{fileName(m.path)}</b>
              <span className="block truncate text-[13.5px] text-text-3" title={m.path}>
                {ownerText(m)} · {m.path}
              </span>
            </div>
            <div className="flex gap-2">
              {desktop && (
                <Button
                  size="sm"
                  busy={busy === `pick:${m.source}:${m.path}`}
                  onClick={() => void pick(m)}
                >
                  Pick file
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                busy={busy === `clear:${m.source}:${m.path}`}
                onClick={() =>
                  void act(`clear:${m.source}:${m.path}`, () => api.replaceFile(m, ''), 'Cleared.')
                }
              >
                Clear
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
