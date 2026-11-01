// Guests (API.md §9.11): links a guest opens to send their camera and mic into the Studio, and
// who's here now. A guest arrives hidden in the scene on air; the streamer shows them.

import { useEffect, useState } from 'react'
import type { StudioGuests } from '@ferrocast/api'
import {
  Copy,
  LinkSimple,
  PhoneDisconnect,
  Plus,
  QrCode as QrIcon,
  Trash,
} from '@phosphor-icons/react'
import { Button, IconButton, InfoTip, Skeleton, toast } from '@ferrocast/ui'
import { LoadError } from '../../Panel'
import { QrCode } from '../../remote'
import { useAction, useResource } from '../../../lib/hooks'
import { useDesk } from './common'

/** How often the list looks for guests joining or leaving while it's open. */
const POLL_MS = 3000

export function GuestInvites() {
  const { api } = useDesk()
  const { run, busy } = useAction()
  const list = useResource(() => api.guests(), [api])
  const { reload } = list
  useEffect(() => {
    const t = setInterval(reload, POLL_MS)
    return () => clearInterval(t)
  }, [reload])

  const copy = (url: string) =>
    // No clipboard (an insecure page, an old webview): said, like a failed copy.
    void (navigator.clipboard?.writeText(url) ?? Promise.reject(new Error('no clipboard'))).then(
      () => toast({ tone: 'ok', message: 'Link copied. Send it to your guest.' }),
      () =>
        toast({
          tone: 'error',
          message: 'Couldn’t copy the link.',
          hint: 'Select it and copy it by hand.',
        }),
    )

  const make = async () => {
    const made = await run('make', () => api.createGuestLink('Guest'))
    if (made) {
      copy(made.url)
      reload()
    }
  }

  if (list.error && !list.data) return <LoadError error={list.error} onRetry={reload} />
  if (!list.data) return <Skeleton className="h-48" />
  return (
    <GuestLists
      {...list.data}
      busy={busy}
      onCopy={copy}
      onMake={() => void make()}
      onRemove={(id) =>
        void run(`rm:${id}`, () => api.removeGuestLink(id), {
          success: 'Link removed. It no longer works.',
        }).then(reload)
      }
      onHangUp={(source) =>
        void run(`bye:${source}`, () => api.hangUpGuest(source), {
          success: `Hung up. ${source} stays in your scenes.`,
        }).then(reload)
      }
    />
  )
}

/** The links and the guests, as they are: what the panel shows. */
export function GuestLists({
  invites,
  guests,
  busy,
  onCopy,
  onMake,
  onRemove,
  onHangUp,
}: StudioGuests & {
  busy: string | null
  onCopy: (url: string) => void
  onMake: () => void
  onRemove: (id: string) => void
  /** By the guest's source (two guests may share a name). */
  onHangUp: (source: string) => void
}) {
  const [asking, setAsking] = useState<string | null>(null)
  // The link shown as a QR code: a phone that scans it becomes a camera here.
  const [qr, setQr] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-1">
          <h3 className="m-0 text-[16px] font-bold text-text">Guest links</h3>
          <InfoTip>
            Your guest opens the link in their browser, on a phone or a computer. Their camera comes
            straight to this computer and shows up hidden in this scene, so you choose when they’re
            on stream. A link works for 30 days, or until you remove it.
          </InfoTip>
        </div>
        {invites.length === 0 ? (
          <p className="m-0 text-text-2">No links yet.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {invites.map((i) => (
              <li
                key={i.id}
                className="flex flex-wrap items-center gap-2 rounded-control border border-line bg-surface-2 py-1.5 pr-1.5 pl-3"
              >
                <LinkSimple size={18} className="shrink-0 text-accent-text" aria-hidden />
                <span className="min-w-0 flex-1 truncate font-mono text-[14px] text-text-2">
                  {i.url}
                </span>
                {asking === i.id ? (
                  // It can't come back: asked once, in place.
                  <>
                    <Button
                      size="sm"
                      variant="danger"
                      busy={busy === `rm:${i.id}`}
                      onClick={() => {
                        setAsking(null)
                        onRemove(i.id)
                      }}
                    >
                      Remove
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setAsking(null)}>
                      Keep
                    </Button>
                  </>
                ) : (
                  <>
                    <IconButton
                      label={qr === i.id ? 'Hide QR code' : 'Show QR code'}
                      size="sm"
                      aria-expanded={qr === i.id}
                      onClick={() => setQr((q) => (q === i.id ? null : i.id))}
                    >
                      <QrIcon size={17} />
                    </IconButton>
                    <IconButton label="Copy link" size="sm" onClick={() => onCopy(i.url)}>
                      <Copy size={17} />
                    </IconButton>
                    <IconButton
                      label="Remove link"
                      size="sm"
                      variant="danger-ghost"
                      disabled={busy === `rm:${i.id}`}
                      onClick={() => setAsking(i.id)}
                    >
                      <Trash size={17} />
                    </IconButton>
                  </>
                )}
                {qr === i.id && (
                  <div className="flex w-full flex-col items-center gap-2 pt-2 pb-1">
                    <QrCode text={i.url} size={200} label="QR code for this guest link" />
                    <p className="m-0 text-center text-[13.5px] text-text-2">
                      Scan it with a phone’s camera: the phone becomes a camera in this scene.
                    </p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <Button
          variant={invites.length === 0 ? 'primary' : 'secondary'}
          icon={<Plus size={17} />}
          busy={busy === 'make'}
          onClick={onMake}
          className="self-start"
        >
          New guest link
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="m-0 text-[16px] font-bold text-text">Here now</h3>
        {guests.length === 0 ? (
          <p className="m-0 text-text-2">Nobody yet. Guests appear here as they join.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {guests.map((g) => (
              <li
                key={g.source}
                className="flex items-center gap-3 rounded-control border border-line bg-surface-2 py-1.5 pr-1.5 pl-3"
              >
                <span className="min-w-0 flex-1 truncate font-semibold text-text">{g.name}</span>
                <span className={g.connected ? 'text-[14px] text-ok' : 'text-[14px] text-text-3'}>
                  {g.connected ? (g.video ? 'Connected' : 'No picture yet') : 'Connecting'}
                </span>
                <Button
                  size="sm"
                  variant="danger-ghost"
                  icon={<PhoneDisconnect size={16} />}
                  busy={busy === `bye:${g.source}`}
                  onClick={() => onHangUp(g.source)}
                >
                  Hang up
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
