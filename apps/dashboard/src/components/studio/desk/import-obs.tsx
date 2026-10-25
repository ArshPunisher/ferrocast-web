// "Import from OBS": pick one of OBS's scene collections on this computer to use in the
// Studio. The Studio's own scenes are kept in a file first; OBS's Browser sources become Web
// page sources on a Mac.

import { useState } from 'react'
import { CardsThree, CheckCircle, DownloadSimple } from '@phosphor-icons/react'
import { type EngineObsCollection } from '@ferrocast/api'
import { Button, Dialog, InfoTip, Skeleton, cx, toast } from '@ferrocast/ui'
import { LoadError } from '../../Panel'
import { useAction, useResource } from '../../../lib/hooks'
import { useDesk } from './common'

export function ImportObsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} size="lg" title="Import from OBS">
      {open && <Picker onDone={onClose} />}
    </Dialog>
  )
}

function Picker({ onDone }: { onDone: () => void }) {
  const { api, refresh } = useDesk()
  const list = useResource(() => api.obsCollections(), [api])
  const { run, busy } = useAction()
  const [pick, setPick] = useState<EngineObsCollection | null>(null)
  const go = async () => {
    if (!pick) return
    const r = await run('import', () => api.importObs(pick.id))
    if (!r) return
    refresh()
    onDone()
    const extra = [
      r.web_pages > 0 &&
        `${r.web_pages} web page${r.web_pages === 1 ? '' : 's'} switched to Ferrocast's`,
      r.missing.length > 0 &&
        `${r.missing.length} kind${r.missing.length === 1 ? '' : 's'} not on this computer`,
    ].filter(Boolean)
    toast({
      tone: r.missing.length ? 'warn' : 'ok',
      message: `${r.name}: ${r.scenes} scenes, ${r.sources} sources.`,
      ...(extra.length ? { hint: `${extra.join('. ')}.` } : {}),
    })
  }
  if (list.error && !list.data) return <LoadError error={list.error} onRetry={list.reload} />
  if (!list.data) return <Skeleton className="h-40" />
  if (list.data.length === 0)
    return (
      <p className="m-0 text-[14px] font-medium text-text-2">
        No OBS scene collections on this computer.
      </p>
    )
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
        {list.data.map((c) => {
          const on = pick?.id === c.id
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={on}
              onClick={() => setPick(c)}
              className={cx(
                'flex items-center gap-3 rounded-[12px] border bg-surface-2 p-3 text-left transition-[border-color,box-shadow,transform] duration-150 active:scale-[0.98]',
                on
                  ? 'border-arc shadow-[0_0_0_1px_var(--fc-arc)]'
                  : 'border-line hover:border-line-strong',
              )}
            >
              <span
                aria-hidden
                className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-warn-soft text-warn"
              >
                <CardsThree size={22} weight="bold" />
              </span>
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[14px] text-text">{c.name}</b>
                <span className="block text-[12.5px] font-medium text-text-2">
                  {c.scenes} scenes · {c.sources} sources
                </span>
              </span>
              {on && <CheckCircle size={20} weight="fill" className="shrink-0 text-accent-text" />}
            </button>
          )
        })}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line pt-4">
        <span className="mr-auto flex items-center gap-1 text-[13px] font-semibold text-text-2">
          Replaces your Studio scenes
          <InfoTip label="About importing">
            A copy of your current scenes is kept in Ferrocast's data folder (studio). OBS's own
            files aren't changed.
          </InfoTip>
        </span>
        <Button
          variant="primary"
          disabled={!pick}
          busy={busy === 'import'}
          onClick={() => void go()}
        >
          <DownloadSimple size={16} weight="bold" /> Import
        </Button>
      </div>
    </div>
  )
}
