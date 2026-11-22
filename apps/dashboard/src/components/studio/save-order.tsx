// Saving the destinations while live asks first when the engine says so: the upload won't
// carry the new one, or it was the last one. One place for every screen that ticks or unticks.

import { useState, type ReactNode } from 'react'
import { ApiError } from '@ferrocast/api'
import { Button, Dialog } from '@ferrocast/ui'
import type { useGoLive } from './golive'

type Order = { id: string; enabled: boolean }[]
type Confirm = { upload?: boolean; last?: boolean }
type Ask = {
  code: 'golive_upload_exceeded' | 'golive_last_destination'
  message: string
  hint: string
  all: Order
}

/**
 * `request(all)` is for `useAction().run`: it resolves `true` when saved, `null` when the engine
 * asked a question first (the dialog opens), and throws for anything else (the action toasts it).
 * Confirming sends the same list again with the answer.
 */
export function useSaveOrder(
  api: ReturnType<typeof useGoLive>,
  onSaved: () => void,
): { request: (all: Order, confirm?: Confirm) => Promise<{ ok: true } | null>; dialog: ReactNode } {
  const [ask, setAsk] = useState<Ask | null>(null)
  const request = (all: Order, confirm: Confirm = {}) =>
    api.saveOrder(all, confirm).then(
      () => ({ ok: true as const }),
      (e: unknown) => {
        if (
          e instanceof ApiError &&
          (e.code === 'golive_upload_exceeded' || e.code === 'golive_last_destination')
        ) {
          setAsk({ code: e.code, message: e.message, hint: e.hint ?? '', all })
          return null
        }
        throw e
      },
    )
  const last = ask?.code === 'golive_last_destination'
  const confirmAsk = () => {
    if (!ask) return
    const { all, code } = ask
    setAsk(null)
    void request(all, code === 'golive_upload_exceeded' ? { upload: true } : { last: true }).then(
      (r) => r && onSaved(),
    )
  }
  const dialog = (
    <Dialog
      open={ask !== null}
      onClose={() => setAsk(null)}
      title={last ? 'Stop sending to your last platform?' : 'Your upload may not carry this'}
      description={ask ? `${ask.message} ${ask.hint}`.trim() : ''}
      size="sm"
      footer={
        <>
          <Button onClick={() => setAsk(null)}>{last ? 'Keep it on' : 'Not now'}</Button>
          <Button variant={last ? 'danger' : 'primary'} onClick={confirmAsk}>
            {last ? 'Stop sending' : 'Add it anyway'}
          </Button>
        </>
      }
    />
  )
  return { request, dialog }
}
