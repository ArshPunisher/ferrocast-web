// "Have a code?" as one line (label, field, Redeem), for the plans and Account pages. A free-Pro
// code turns Pro on here; a discount code lowers the plan prices it's shown with.

import { useId, useState } from 'react'
import { describeError, proApi, type ProView } from '@ferrocast/api'
import { Button, Input, toast } from '@ferrocast/ui'
import { useClient } from '../../lib/hooks'
import { publishPro } from '../../lib/pro-status'
import { day, type Discount } from '../pro'

export function CodeInline({
  onDiscount,
  canBuy = true,
}: {
  /** Where a discount code goes (the plans page); without it a discount is explained. */
  onDiscount?: (d: Discount) => void
  canBuy?: boolean
}) {
  const pro = proApi(useClient())
  const id = useId()
  const [code, setCode] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    const c = code.trim()
    if (!c) {
      setErr('Type the code first.')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const r = await pro.redeem(c)
      if (r.kind === 'grant') {
        publishPro(r.status as ProView)
        setCode('')
        toast({ tone: 'ok', message: `Pro is on until ${day(r.redeemed.until)}.` })
      } else if (!onDiscount) {
        setErr('That code takes money off Pro. Use it on the plans page.')
      } else if (!canBuy) {
        setErr('That code is a discount. It works once Pro is on sale.')
      } else if (!Object.values(r.prices).some((q) => q.code_applies)) {
        setErr('Today’s price is already lower than this code, so you don’t need it.')
      } else {
        onDiscount(r)
        setCode('')
        toast({ tone: 'ok', message: `Code ${r.code} applied to the prices above.` })
      }
    } catch (e) {
      const d = describeError(e)
      setErr(d.hint ? `${d.message} ${d.hint}` : d.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form
      noValidate
      className="flex flex-col gap-1.5"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <label htmlFor={id} className="text-[14.5px] font-semibold text-text">
        Have a code?
      </label>
      <div className="flex gap-2">
        <Input
          id={id}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="characters"
          maxLength={32}
          placeholder="Gift or discount code"
          aria-invalid={err ? true : undefined}
          aria-describedby={err ? `${id}-err` : undefined}
          className="min-w-0 flex-1 font-mono uppercase placeholder:font-sans placeholder:normal-case"
          value={code}
          onChange={(e) => {
            setCode(e.target.value)
            if (err) setErr(null)
          }}
        />
        <Button type="submit" busy={busy}>
          Redeem
        </Button>
      </div>
      {err && (
        <p id={`${id}-err`} role="alert" className="text-[14px] text-danger">
          {err}
        </p>
      )}
    </form>
  )
}
