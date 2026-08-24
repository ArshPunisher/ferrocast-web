import { useState } from 'react'
import { Check, CopySimple, Eye, EyeSlash } from '@phosphor-icons/react'
import { ApiError, describeError, type Overlay } from '@ferrocast/api'
import { BrandIcon, Button, Dialog, IconButton, copyText, cx, toast, useFlash } from '@ferrocast/ui'
import { useClient } from '../lib/hooks'

/** An overlay URL, blurred until asked (R-44): anyone with it can show your alerts. */
export function SecretUrl({ url, className }: { url: string; className?: string }) {
  const [shown, setShown] = useState(false)
  const [copied, flash] = useFlash()
  return (
    <div
      className={cx(
        'flex min-w-0 items-center gap-1 rounded-control border border-line bg-inset py-1 pr-1 pl-3',
        className,
      )}
    >
      <code
        className={cx(
          'min-w-0 flex-1 truncate font-mono text-[12.5px] text-text-2 transition-[filter] duration-200',
          !shown && 'fc-blur-url',
        )}
        aria-hidden={!shown}
      >
        {url}
      </code>
      {!shown && <span className="sr-only">Overlay URL hidden</span>}
      <IconButton
        size="sm"
        label={shown ? 'Hide URL' : 'Show URL'}
        onClick={() => setShown((s) => !s)}
      >
        {shown ? <EyeSlash size={15} /> : <Eye size={15} />}
      </IconButton>
      <IconButton
        size="sm"
        label={copied ? 'Copied' : 'Copy URL'}
        onClick={() =>
          void copyText(url).then((ok) => {
            if (ok) flash()
            else
              toast({
                tone: 'error',
                message: 'Couldn’t copy the URL.',
                hint: 'Show it and copy it by hand.',
              })
          })
        }
      >
        {copied ? <Check size={15} className="text-ok" /> : <CopySimple size={15} />}
      </IconButton>
    </div>
  )
}

/** Fallback when OBS isn't connected: copy the URL and add a Browser source by hand. */
export function ObsGuide({
  overlay,
  open,
  onClose,
  reason,
}: {
  overlay: Overlay | null
  open: boolean
  onClose: () => void
  reason?: string | null
}) {
  const [copied, flash] = useFlash(2400)
  if (!overlay) return null
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title="Add it to OBS by hand"
      description={reason ?? 'Three steps, about thirty seconds.'}
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <ol className="flex flex-col gap-3">
        <li className="flex gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft font-mono text-[12px] font-semibold text-accent-text">
            1
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-text">Copy the overlay URL</p>
            <Button
              size="sm"
              className="mt-2"
              variant={copied ? 'secondary' : 'primary'}
              icon={copied ? <Check size={15} /> : <CopySimple size={15} />}
              onClick={() => void copyText(overlay.url).then((ok) => ok && flash())}
            >
              {copied ? 'Copied' : 'Copy URL'}
            </Button>
          </div>
        </li>
        <li className="flex gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft font-mono text-[12px] font-semibold text-accent-text">
            2
          </span>
          <p className="text-sm text-text-2">
            In OBS, click <span className="font-medium text-text">+</span> under Sources and choose{' '}
            <span className="font-medium text-text">Browser</span>.
          </p>
        </li>
        <li className="flex gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft font-mono text-[12px] font-semibold text-accent-text">
            3
          </span>
          <p className="text-sm text-text-2">
            Paste the URL, set width <span className="font-mono text-text">{overlay.width}</span>{' '}
            and height <span className="font-mono text-text">{overlay.height}</span>, and press OK.
          </p>
        </li>
      </ol>
      <p className="mt-4 rounded-control bg-surface-2 px-3 py-2 text-[12.5px] text-text-3">
        Next time, connect OBS in Settings and it’s one click: turn on Tools → WebSocket Server
        Settings in OBS.
      </p>
    </Dialog>
  )
}

/** "Add to OBS": one click through the engine, with the manual guide as the fallback. */
export function useAddToObs(): {
  add: (o: Overlay) => Promise<boolean>
  busy: string | null
  guide: React.ReactNode
} {
  const client = useClient()
  const [busy, setBusy] = useState<string | null>(null)
  const [fallback, setFallback] = useState<{ overlay: Overlay; reason: string | null } | null>(null)
  const add = async (o: Overlay) => {
    setBusy(o.id)
    try {
      const r = await client.addToObs(o.id)
      toast({
        key: 'obs',
        tone: 'ok',
        message: `Added to OBS.`,
        hint: `“${r.source}” is in the scene “${r.scene}”.`,
      })
      return true
    } catch (e) {
      if (e instanceof ApiError && (e.status === 422 || e.status === 0 || e.status === 409)) {
        setFallback({ overlay: o, reason: e.status === 422 ? e.message : null })
      } else {
        const d = describeError(e)
        toast({ tone: 'error', message: d.message, hint: d.hint })
      }
      return false
    } finally {
      setBusy(null)
    }
  }
  const guide = (
    <ObsGuide
      overlay={fallback?.overlay ?? null}
      open={fallback !== null}
      reason={fallback?.reason ?? null}
      onClose={() => setFallback(null)}
    />
  )
  return { add, busy, guide }
}

export function ObsIcon({ size = 16 }: { size?: number }) {
  return <BrandIcon name="obs" size={size} />
}
