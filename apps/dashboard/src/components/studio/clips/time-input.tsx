// A time typed as "1:02.5": it keeps what is typed until it is left, then says if it isn't a
// time (and goes back to the last good one) instead of changing under the cursor.

import { useEffect, useState } from 'react'
import { clock, parseClock } from '@ferrocast/api'
import { Field, Input } from '@ferrocast/ui'

export function TimeInput({
  label,
  value,
  onCommit,
  hint,
  max,
  disabled,
}: {
  label: string
  /** ms. */
  value: number
  onCommit: (ms: number) => void
  hint?: string
  /** The longest time that makes sense (the clip's length). */
  max?: number | null
  disabled?: boolean
}) {
  const [text, setText] = useState(clock(value))
  const [error, setError] = useState<string | null>(null)
  // Follows the value when it changes from outside (the playhead button), not while typing.
  useEffect(() => {
    setText(clock(value))
    setError(null)
  }, [value])
  const commit = () => {
    const ms = parseClock(text)
    if (ms === null) {
      setError('Type a time like 1:02.5')
      setText(clock(value))
      return
    }
    if (max != null && ms > max) {
      setError(`The clip is only ${clock(max)} long.`)
      setText(clock(value))
      return
    }
    setError(null)
    if (ms !== value) onCommit(ms)
    else setText(clock(ms))
  }
  return (
    <Field label={label} error={error} {...(hint ? { hint } : {})} className="min-w-0">
      {(p) => (
        <Input
          {...p}
          value={text}
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          className="font-mono tabular-nums"
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            }
          }}
        />
      )}
    </Field>
  )
}
