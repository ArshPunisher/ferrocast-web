import { useCallback, useEffect } from 'react'
import { ShieldWarning } from '@phosphor-icons/react'
import { cx, toast } from '@ferrocast/ui'
import { describeError } from '@ferrocast/api'
import { useLive } from '../lib/store'

/**
 * Ctrl+Alt+Shift+P everywhere, the same as the engine's global default, so it never
 * clashes with Cmd/Ctrl+Shift+P in browsers and editors. `code`, not `key`: Alt changes
 * the character on a Mac.
 */
export function isPanicHotkey(e: KeyboardEvent): boolean {
  return e.ctrlKey && e.altKey && e.shiftKey && !e.metaKey && e.code === 'KeyP'
}

export function usePanic(): [boolean, (on?: boolean) => Promise<void>] {
  const panic = useLive((s) => s.panic)
  const conn = useLive((s) => s.conn)
  const setPanic = useLive((s) => s.setPanic)
  const toggle = useCallback(
    async (on?: boolean) => {
      if (!conn) return
      const next = on ?? !useLive.getState().panic
      setPanic(next) // instant feedback; rolled back if the engine refuses
      try {
        const r = await conn.client.panic(next)
        setPanic(r.on)
        if (r.on) {
          const where = r.applied
            .map((a) => a.platform[0]?.toUpperCase() + a.platform.slice(1))
            .join(', ')
          // Keyed: switching on, off, on shows one toast with the latest state.
          toast({
            key: 'panic',
            tone: 'warn',
            message: 'Panic mode is on.',
            hint: where
              ? `Locked down on ${where}. Alerts and TTS are paused.`
              : 'Alerts and TTS are paused.',
          })
        } else
          toast({
            key: 'panic',
            tone: 'ok',
            message: 'Panic mode is off.',
            hint: 'Chat and alerts are back to normal.',
          })
      } catch (e) {
        setPanic(!next)
        const d = describeError(e)
        toast({ key: 'panic', tone: 'error', message: d.message, hint: d.hint })
      }
    },
    [conn, setPanic],
  )
  return [panic, toggle]
}

export function PanicButton() {
  const [on, toggle] = usePanic()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isPanicHotkey(e) && !e.repeat) {
        e.preventDefault()
        void toggle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])
  const mac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)
  const keys = mac ? '⌃⌥⇧P' : 'Ctrl+Alt+Shift+P'
  return (
    <button
      type="button"
      onClick={() => void toggle()}
      aria-pressed={on}
      aria-keyshortcuts="Control+Alt+Shift+P"
      title={
        on
          ? `Turn panic mode off (${keys})`
          : `Panic mode: lock chat down on every platform (${keys})`
      }
      className={cx(
        'fc-press inline-flex h-9 shrink-0 items-center gap-2 rounded-control px-3 text-[14px] font-semibold whitespace-nowrap transition-colors',
        'focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none',
        on
          ? 'bg-danger-fill text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.2)]'
          : 'border border-danger/40 text-danger hover:bg-danger-soft',
      )}
    >
      <ShieldWarning size={17} weight={on ? 'fill' : 'bold'} />
      <span>{on ? 'Panic on' : 'Panic'}</span>
      <span
        className={cx(
          'hidden font-mono text-[12px] font-medium xl:inline',
          on ? 'text-white' : 'text-text-3',
        )}
      >
        {keys}
      </span>
    </button>
  )
}
